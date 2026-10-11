import { BUDGET_NANO_USD, TEST_ALLOWANCE_NANO_USD, PRICE_VALID_UNTIL,
  validateInput, candidatesFor, apiRequest, reservationFor, measuredCost, publicReply, readBounded } from './core.mjs';

const reply = (data, status = 200) => Response.json(data, { status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const unavailable = () => reply({ error: 'unavailable' }, 503);
const active = env => env.ENABLED === 'true' && !!env.OPENAI_API_KEY && Date.now() < PRICE_VALID_UNTIL;

async function clientHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const day = Math.floor(Date.now() / 86_400_000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.OPENAI_API_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(day + ':' + ip));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const origin = request.headers.get('Origin');
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const permitted = allowed.includes(origin);
    const cors = response => {
      const headers = new Headers(response.headers);
      if (permitted) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type');
      }
      headers.set('Vary', 'Origin');
      return new Response(response.body, { status: response.status, headers });
    };
    if (path === '/health' && request.method === 'GET') return cors(reply({ available: active(env), budgetCapUSD: 10 }));
    if (path !== '/assistant') return cors(reply({ error: 'not_found' }, 404));
    if (!permitted) return reply({ error: 'forbidden' }, 403);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (request.method !== 'POST') return cors(reply({ error: 'method_not_allowed' }, 405));
    if (!active(env)) return cors(unavailable());
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return cors(reply({ error: 'invalid_request' }, 400));
    try {
      const input = validateInput(await readBounded(request));
      const client = await clientHash(request, env);
      const id = env.BUDGET.idFromName('meudon-prototype-total-budget-v1');
      return cors(await env.BUDGET.get(id).fetch('https://budget.internal/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, client, requestId: crypto.randomUUID() })
      }));
    } catch (error) {
      return cors(error.message === 'invalid_request' || error instanceof SyntaxError || error instanceof TypeError ? reply({ error: 'invalid_request' }, 400) : unavailable());
    }
  }
};

// A single persistent SQLite object owns the total cap, including concurrent calls.
export class BudgetLedger {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY CHECK(id=1), committed INTEGER NOT NULL, halted INTEGER NOT NULL DEFAULT 0)');
    this.sql.exec('INSERT OR IGNORE INTO ledger(id, committed) VALUES (1, ?)', TEST_ALLOWANCE_NANO_USD);
    this.sql.exec('CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, status TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS limits_expiry ON limits(expires)');
  }

  admit(id, client, amount, now) {
    return this.ctx.storage.transactionSync(() => {
      const ledger = this.sql.exec('SELECT committed, halted FROM ledger WHERE id=1').one();
      if (ledger.halted || ledger.committed + amount > BUDGET_NANO_USD) return 'budget_exhausted';
      if (this.sql.exec('SELECT id FROM reservations WHERE id=?', id).toArray().length) return 'rate_limited';
      const minute = Math.floor(now / 60_000), day = Math.floor(now / 86_400_000);
      const buckets = [
        [`ip-minute:${client}:${minute}`, 6, (minute + 1) * 60_000],
        [`ip-day:${client}:${day}`, 60, (day + 1) * 86_400_000],
        [`all-minute:${minute}`, 60, (minute + 1) * 60_000],
        [`all-day:${day}`, 1000, (day + 1) * 86_400_000]
      ];
      for (const [key, maximum] of buckets) {
        const row = this.sql.exec('SELECT count FROM limits WHERE id=?', key).toArray()[0];
        if (row && row.count >= maximum) return 'rate_limited';
      }
      this.sql.exec('DELETE FROM limits WHERE expires<=?', now);
      for (const [key, , expires] of buckets) this.sql.exec('INSERT INTO limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1', key, expires);
      this.sql.exec('UPDATE ledger SET committed=committed+? WHERE id=1', amount);
      this.sql.exec("INSERT INTO reservations(id,amount,status) VALUES(?,?,'reserved')", id, amount);
      return null;
    });
  }

  settle(id, cost) {
    this.ctx.storage.transactionSync(() => {
      const row = this.sql.exec('SELECT amount,status FROM reservations WHERE id=?', id).toArray()[0];
      if (!row || row.status !== 'reserved') return;
      if (cost === -1 || (cost !== null && (!Number.isSafeInteger(cost) || cost < 0 || cost > row.amount))) {
        this.sql.exec('UPDATE ledger SET halted=1 WHERE id=1');
        this.sql.exec("UPDATE reservations SET status='halted' WHERE id=?", id);
      } else if (cost === null) {
        this.sql.exec("UPDATE reservations SET status='uncertain' WHERE id=?", id);
      } else {
        this.sql.exec('UPDATE ledger SET committed=committed-? WHERE id=1', row.amount - cost);
        this.sql.exec("UPDATE reservations SET amount=?,status='settled' WHERE id=?", cost, id);
      }
    });
  }

  async fetch(request) {
    if (!active(this.env)) return unavailable();
    const data = await request.json();
    const input = validateInput({ message: data.message, history: data.history });
    if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(data.requestId) ||
        typeof data.client !== 'string' || !/^[a-f0-9]{64}$/.test(data.client)) return reply({ error: 'invalid_request' }, 400);
    const candidates = candidatesFor(input);
    const body = apiRequest(input, candidates);
    const reservation = reservationFor(body);
    const failure = this.admit(data.requestId, data.client, reservation.amount, Date.now());
    if (failure) return reply({ error: failure }, 429);
    // No billable request begins until its reservation is durably synchronized.
    await this.ctx.storage.sync();
    let usageCost = null;
    try {
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: 'Bearer ' + this.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15_000)
      });
      // No automatic retries. An uncertain failure retains its full reservation.
      if (!upstream.ok) return unavailable();
      const response = await upstream.json();
      usageCost = measuredCost(response, reservation);
      if (usageCost === -1) return unavailable();
      return reply(publicReply(response, candidates));
    } catch {
      return unavailable();
    } finally {
      this.settle(data.requestId, usageCost);
      await this.ctx.storage.sync();
    }
  }
}
