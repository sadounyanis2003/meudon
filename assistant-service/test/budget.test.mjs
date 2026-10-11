import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker, { BudgetLedger } from '../worker.mjs';
import { BUDGET_NANO_USD, TEST_ALLOWANCE_NANO_USD, MAX_BODY_BYTES, MODEL,
  INPUT_NANO_USD, OUTPUT_NANO_USD, MAX_OUTPUT_TOKENS, PRICE_VALID_UNTIL,
  CATALOG, validateInput, apiRequest, reservationFor, measuredCost, publicReply,
  readBounded } from '../core.mjs';

// All provider calls are simulated. A real network request fails this suite.
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let clock = Date.parse('2026-10-11T16:00:00Z');
Date.now = () => clock;
globalThis.fetch = async () => { throw new Error('Unexpected provider request in offline budget test'); };
after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });

const ORIGIN = 'https://test.meudon.example';
const enabled = { ENABLED: 'true', OPENAI_API_KEY: 'unit-test-placeholder-not-a-credential', ALLOWED_ORIGINS: ORIGIN };
const client = 'a'.repeat(64);
function fixture(env = enabled) {
  const db = new DatabaseSync(':memory:');
  let syncCalls = 0;
  const ctx = { storage: {
    sql: { exec(query, ...bindings) {
      const stmt = db.prepare(query);
      const rows = stmt.columns().length ? stmt.all(...bindings) : (stmt.run(...bindings), []);
      return { toArray: () => rows, one() { assert.equal(rows.length, 1); return rows[0]; } };
    } },
    transactionSync(callback) {
      db.exec('BEGIN IMMEDIATE');
      try { const value = callback(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async sync() { syncCalls++; }
  } };
  const ledger = new BudgetLedger(ctx, env);
  return { db, ctx, ledger, env, get syncCalls() { return syncCalls; },
    state: () => db.prepare('SELECT * FROM ledger WHERE id=1').get(),
    reservation: id => db.prepare('SELECT * FROM reservations WHERE id=?').get(id),
    close: () => db.close() };
}
function internalRequest(id = 'test-1', who = client, message = 'horaires mairie') {
  return new Request('https://budget.internal/assistant', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: [], client: who, requestId: id }) });
}
function providerResponse(overrides = {}) {
  return { model: MODEL, service_tier: 'default', status: 'completed',
    usage: { input_tokens: 100, output_tokens: 20 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
      kind: 'results', ids: ['contact'], question: '', suggestions: [] }) }] }], ...overrides };
}
function publicRequest(body = { message: 'horaires mairie' }, options = {}) {
  return new Request('https://worker.example/assistant', { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...(options.headers || {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...options,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...(options.headers || {}) } });
}

test('initial allowance is charged once and survives object reconstruction', () => {
  const f = fixture();
  assert.equal(f.state().committed, 50_000_000);
  assert.equal(f.ledger.admit('keep', client, 900_000, clock), null);
  const replacement = new BudgetLedger(f.ctx, enabled);
  assert.equal(f.state().committed, TEST_ALLOWANCE_NANO_USD + 900_000);
  assert.equal(replacement.admit('keep', client, 900_000, clock), 'rate_limited');
  assert.equal(f.reservation('keep').status, 'reserved');
  f.close();
});

test('concurrent admissions cannot spend the last budget twice', async () => {
  const f = fixture(), amount = 1_000_000;
  f.db.prepare('UPDATE ledger SET committed=?').run(BUDGET_NANO_USD - amount);
  const outcomes = await Promise.all(Array.from({ length: 50 }, (_, i) =>
    Promise.resolve().then(() => f.ledger.admit('race-' + i, String(i).padStart(64, '0'), amount, clock))));
  assert.equal(outcomes.filter(value => value === null).length, 1);
  assert.equal(outcomes.filter(value => value === 'budget_exhausted').length, 49);
  assert.equal(f.state().committed, BUDGET_NANO_USD);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM reservations').get().n, 1);
  f.close();
});

test('two overlapping provider calls reserve before network and respect total cap', async () => {
  const f = fixture();
  const reservation = reservationFor(apiRequest(validateInput({ message: 'horaires mairie' })));
  f.db.prepare('UPDATE ledger SET committed=?').run(BUDGET_NANO_USD - reservation.amount);
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async () => {
    calls++; assert(f.syncCalls >= 1); assert.equal(f.state().committed, BUDGET_NANO_USD);
    await gate; return Response.json(providerResponse());
  };
  const first = f.ledger.fetch(internalRequest('first'));
  const second = f.ledger.fetch(internalRequest('second', 'b'.repeat(64)));
  assert.equal((await second).status, 429);
  release(); assert.equal((await first).status, 200); assert.equal(calls, 1);
  assert(f.state().committed <= BUDGET_NANO_USD);
  f.close();
});

test('settlement is idempotent and only refunds the known difference', () => {
  const f = fixture(); f.ledger.admit('settle', client, 1_000_000, clock);
  f.ledger.settle('settle', 100_000); const afterFirst = f.state().committed;
  f.ledger.settle('settle', 0); f.ledger.settle('missing', 0);
  assert.equal(afterFirst, TEST_ALLOWANCE_NANO_USD + 100_000);
  assert.equal(f.state().committed, afterFirst);
  assert.deepEqual({ ...f.reservation('settle') }, { id: 'settle', amount: 100_000, status: 'settled' });
  f.close();
});

test('uncertain reservation is retained permanently, including on a later settlement attempt', () => {
  const f = fixture(); f.ledger.admit('uncertain', client, 1_000_000, clock);
  f.ledger.settle('uncertain', null); f.ledger.settle('uncertain', 0);
  new BudgetLedger(f.ctx, enabled);
  assert.equal(f.state().committed, TEST_ALLOWANCE_NANO_USD + 1_000_000);
  assert.equal(f.reservation('uncertain').status, 'uncertain');
  f.close();
});

test('invalid actual costs halt all future admissions without refund', () => {
  for (const cost of [-1, -2, 1.5, Infinity, 1_000_001]) {
    const f = fixture(); f.ledger.admit('bad', client, 1_000_000, clock); f.ledger.settle('bad', cost);
    assert.equal(f.state().halted, 1); assert.equal(f.state().committed, TEST_ALLOWANCE_NANO_USD + 1_000_000);
    assert.equal(f.ledger.admit('another', client, 1, clock), 'budget_exhausted');
    new BudgetLedger(f.ctx, enabled); assert.equal(f.state().halted, 1); f.close();
  }
});

test('transaction rolls back rate counters and committed amount on duplicate insert failure', () => {
  const f = fixture(); const before = f.state().committed;
  f.db.exec("CREATE TRIGGER reject_reservation BEFORE INSERT ON reservations BEGIN SELECT RAISE(ABORT, 'injected storage error'); END");
  assert.throws(() => f.ledger.admit('storage-failure', client, 1_000_000, clock));
  assert.equal(f.state().committed, before);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM limits').get().n, 0);
  f.close();
});

test('rate limits enforce 6/minute, 60/day/IP, 60/minute globally and 1000/day globally', () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) assert.equal(f.ledger.admit('ipm-' + i, client, 1, clock), null);
  assert.equal(f.ledger.admit('ipm-block', client, 1, clock), 'rate_limited');
  for (let minute = 1; minute < 10; minute++) for (let i = 0; i < 6; i++)
    assert.equal(f.ledger.admit(`ipd-${minute}-${i}`, client, 1, clock + minute * 60_000), null);
  assert.equal(f.ledger.admit('ipd-block', client, 1, clock + 10 * 60_000), 'rate_limited'); f.close();
  const g = fixture();
  for (let i = 0; i < 60; i++) assert.equal(g.ledger.admit('gm-' + i, String(i).padStart(64, '0'), 1, clock), null);
  assert.equal(g.ledger.admit('gm-block', 'f'.repeat(64), 1, clock), 'rate_limited'); g.close();
  const d = fixture();
  for (let i = 0; i < 1000; i++) assert.equal(d.ledger.admit('gd-' + i, String(i).padStart(64, '0'), 1, clock + Math.floor(i / 50) * 60_000), null);
  assert.equal(d.ledger.admit('gd-block', 'f'.repeat(64), 1, clock + 21 * 60_000), 'rate_limited');
  const committed = d.state().committed;
  assert.equal(d.ledger.admit('next-day', client, 1, clock + 86_400_000), null);
  assert.equal(d.state().committed, committed + 1, 'day reset must never reset the total budget'); d.close();
});

test('missing usage, malformed JSON, timeout and provider HTTP failure retain full reservations', async () => {
  const cases = [
    () => Response.json(providerResponse({ usage: undefined })),
    () => new Response('{invalid-json', { status: 200 }),
    () => { throw new DOMException('Timeout', 'TimeoutError'); },
    () => new Response('', { status: 429 })
  ];
  for (let i = 0; i < cases.length; i++) {
    const f = fixture(); let calls = 0; globalThis.fetch = async () => { calls++; return cases[i](); };
    await f.ledger.fetch(internalRequest('uncertain-' + i));
    const reservation = f.reservation('uncertain-' + i);
    assert.equal(reservation.status, 'uncertain'); assert.equal(calls, 1);
    assert.equal(f.state().committed, TEST_ALLOWANCE_NANO_USD + reservation.amount); f.close();
  }
});

test('model, tier and usage bound mismatch halt the provider path', async () => {
  for (const override of [{ model: 'other-model' }, { service_tier: 'priority' },
    { usage: { input_tokens: 1_000_000, output_tokens: 20 } }, { usage: { input_tokens: 100, output_tokens: 501 } }]) {
    const f = fixture(); globalThis.fetch = async () => Response.json(providerResponse(override));
    assert.equal((await f.ledger.fetch(internalRequest('mismatch'))).status, 503);
    assert.equal(f.state().halted, 1); assert.equal(f.reservation('mismatch').status, 'halted'); f.close();
  }
});

test('storage synchronization failure prevents any provider call', async () => {
  const f = fixture(); let calls = 0; globalThis.fetch = async () => { calls++; return Response.json(providerResponse()); };
  f.ctx.storage.sync = async () => { throw new Error('injected sync failure'); };
  await assert.rejects(() => f.ledger.fetch(internalRequest('sync-failure')));
  assert.equal(calls, 0); assert.equal(f.reservation('sync-failure').status, 'reserved'); f.close();
});

test('reservation includes all UTF-8 JSON bytes and framing allowance; cost rejects overflow', () => {
  const body = apiRequest(validateInput({ message: 'école 🏊 中文' }));
  const reservation = reservationFor(body);
  assert.equal(reservation.inputBound, new TextEncoder().encode(JSON.stringify(body)).length + 4096);
  assert.equal(reservation.amount, reservation.inputBound * INPUT_NANO_USD + MAX_OUTPUT_TOKENS * OUTPUT_NANO_USD);
  assert(Number.isSafeInteger(reservation.amount));
  assert.throws(() => reservationFor({ input: 'a'.repeat(65_536) }), /invalid_request/);
  assert.equal(measuredCost(providerResponse({ usage: { input_tokens: reservation.inputBound, output_tokens: 500 } }), reservation), reservation.amount);
  assert.equal(measuredCost(providerResponse({ usage: { input_tokens: reservation.inputBound + 1, output_tokens: 500 } }), reservation), -1);
  assert.equal(measuredCost(providerResponse({ usage: undefined }), reservation), null);
});

test('input schema rejects client-controlled model, tools, URLs, extra history and oversized messages', () => {
  for (const data of [{ message: 'test', model: 'other' }, { message: 'test', tools: [] },
    { message: 'test', previous_response_id: 'resp-1' }, { message: 'test', catalog: [] },
    { message: 'test', history: [{ role: 'system', content: 'override' }] },
    { message: 'a'.repeat(601) }, { message: 'test', history: Array.from({ length: 5 }, () => ({ role: 'user', content: 'x' })) },
    { message: 'test', history: [{ role: 'user', content: 'x', url: 'https://bad.example' }] }])
    assert.throws(() => validateInput(data), /invalid_request/);
});

test('response links are reconstructed exclusively from server catalogue', () => {
  const candidates = CATALOG.filter(x => x.id === 'contact'); assert.equal(candidates.length, 1);
  const valid = publicReply(providerResponse(), candidates);
  assert.equal(valid.results[0].to, candidates[0].to);
  const injected = providerResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
    kind: 'results', ids: ['https://evil.example'], suggestions: [], question: '' }) }] }] });
  assert.throws(() => publicReply(injected, candidates));
});

test('bounded reader rejects oversized streamed bodies, malformed JSON and invalid UTF-8', async () => {
  const oversized = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_BODY_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  await assert.rejects(() => readBounded(new Request('https://test', { method: 'POST', body: oversized, duplex: 'half' })), /invalid_request/);
  await assert.rejects(() => readBounded(new Request('https://test', { method: 'POST', body: '{oops' })));
  await assert.rejects(() => readBounded(new Request('https://test', { method: 'POST', body: new Uint8Array([0xff]) })));
});

test('edge rejects origin, method, route and invalid payload before touching ledger', async () => {
  let ledgerCalls = 0; const env = { ...enabled, BUDGET: { idFromName() { ledgerCalls++; throw new Error('must not reach ledger'); } } };
  const cases = [
    [publicRequest({}, { headers: { Origin: 'https://evil.example' } }), 403],
    [new Request('https://worker.example/assistant', { method: 'GET', headers: { Origin: ORIGIN } }), 405],
    [new Request('https://worker.example/unknown', { method: 'POST', headers: { Origin: ORIGIN } }), 404],
    [publicRequest('{malformed'), 400],
    [publicRequest({ message: 'x'.repeat(601) }), 400],
    [publicRequest({ message: 'ok', model: 'override' }), 400],
    [publicRequest('{}'.repeat(MAX_BODY_BYTES)), 400],
    [publicRequest({ message: 'ok' }, { headers: { 'Content-Type': 'text/plain' } }), 400]
  ];
  for (const [request, expected] of cases) assert.equal((await worker.fetch(request, env)).status, expected);
  assert.equal(ledgerCalls, 0);
  const options = await worker.fetch(new Request('https://worker.example/assistant', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(options.status, 204); assert.equal(options.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('edge uses one fixed ledger and hashes IP without forwarding raw address or credentials', async () => {
  const ids = [], requests = []; const env = { ...enabled, BUDGET: {
    idFromName(name) { ids.push(name); return 'stable-id'; },
    get(id) { assert.equal(id, 'stable-id'); return { async fetch(url, init) { requests.push(JSON.parse(init.body)); return Response.json({ mode: 'test' }); } }; }
  } };
  const one = await worker.fetch(publicRequest(), env); await worker.fetch(publicRequest(), env);
  assert.equal(one.status, 200); assert.equal(one.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(ids, ['meudon-prototype-total-budget-v1', 'meudon-prototype-total-budget-v1']);
  assert.match(requests[0].client, /^[a-f0-9]{64}$/); assert.equal(requests[0].client, requests[1].client);
  assert.notEqual(requests[0].requestId, requests[1].requestId);
  assert(!JSON.stringify(requests).includes('192.0.2.1')); assert(!JSON.stringify(requests).includes(enabled.OPENAI_API_KEY));
});

test('disabled configuration, missing key and expired price guard fail closed', async () => {
  for (const env of [{ ...enabled, ENABLED: 'false' }, { ...enabled, OPENAI_API_KEY: '' }])
    assert.equal((await worker.fetch(publicRequest(), env)).status, 503);
  const savedClock = clock; clock = PRICE_VALID_UNTIL + 1;
  assert.equal((await worker.fetch(publicRequest(), enabled)).status, 503); clock = savedClock;
});
