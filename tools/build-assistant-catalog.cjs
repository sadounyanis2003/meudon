#!/usr/bin/env node
'use strict';

/*
 * Build the assistant's allowlisted navigation references from the site's actual
 * local search index. This script reads only the public source files named below.
 * It neither reads environment files nor makes network/API requests.
 *
 * Run from any directory: node tools/build-assistant-catalog.cjs
 * Verify the checked-in snapshot: node tools/build-assistant-catalog.cjs --check
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'assistant-service', 'catalog.json');
const sourceNames = [
  'search-core.js', 'network-data.js', 'experience-data.js', 'app.js',
  'discovery-v6.js', 'search-v6.js', 'usability-v6.js'
];
const sources = Object.fromEntries(sourceNames.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));

// The index uses shared classic-script functions. No page render or DOM events
// are executed: the app is loaded only up to its event-handler section.
const stub = {
  classList: { toggle() {}, remove() {} }, querySelector() { return stub; },
  querySelectorAll() { return []; }, getAttribute() { return ''; }, setAttribute() {},
  innerHTML: '', textContent: '', style: {}
};
const context = {
  console, URL, URLSearchParams, localStorage: { getItem() { return null; } },
  matchMedia() { return { matches: false }; },
  document: { body: stub, querySelector() { return stub; }, querySelectorAll() { return []; }, addEventListener() {} },
  window: {}, location: { hash: '#/' }, setTimeout() { return 0; }, clearTimeout() {}
};
vm.createContext(context);
const run = (name, code = sources[name]) => vm.runInContext(code, context, { filename: name, timeout: 5000 });
for (const name of ['search-core.js', 'network-data.js', 'experience-data.js']) run(name);
const eventStart = sources['app.js'].indexOf("document.addEventListener('click'");
assert(eventStart > 0, 'Cannot locate the public app function section.');
run('app.js', sources['app.js'].slice(0, eventStart));
for (const name of ['discovery-v6.js', 'search-v6.js']) run(name);

const value = expression => JSON.parse(JSON.stringify(vm.runInContext(expression, context, { timeout: 5000 })));
const index = value('v6SearchIndex()');
const serviceIds = new Set(value('catalogItems().map(item => item.id)'));
const associationIds = new Set(value('[...associationRecords.map(item => item.id), ...window.MeudonDiscovery.associations.map(item => item.id)]'));
const albumIds = new Set(value('photoAlbums.map(item => item.id)'));
const activityIds = new Set(value('window.MeudonDiscovery.activities.map(item => item.id)'));
const equipmentIds = new Set(value('window.MeudonDiscovery.equipment.map(item => item.id)'));
const districtCount = value('districtRecords.length');
const viewRoutes = new Set(value('Object.keys(views)'));
// Extra routes are registered by the public usability layer; check registration,
// rather than accepting arbitrary hash paths found in the source text.
const registration = sources['usability-v6.js'].match(/Object\.assign\(views,\{([^\n]+)\}\);/);
assert(registration, 'Cannot locate the v6 route registration.');
for (const [, route] of registration[1].matchAll(/'([^']+)'\s*:/g)) viewRoutes.add(route);

function text(input, maximum) {
  const plain = String(input || '').replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" }[entity]))
    .replace(/&#(\d+);/g, (_, code) => Number(code) < 0x110000 ? String.fromCodePoint(Number(code)) : '')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length <= maximum) return plain;
  const clipped = plain.slice(0, maximum);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > maximum * 0.8 ? clipped.slice(0, lastSpace) : clipped).trim();
}

function validateRoute(to) {
  assert(typeof to === 'string' && to.length <= 1500, 'Missing or excessive destination.');
  if (!to.startsWith('#/')) {
    const url = new URL(to);
    assert(url.protocol === 'https:' && !url.username && !url.password, `Invalid external destination: ${to}`);
    return;
  }
  const [route, query = ''] = to.slice(1).split('?');
  const params = new URLSearchParams(query);
  const detail = route.match(/^\/(service|association|album)\/([^/]+)$/);
  if (detail) {
    const pool = { service: serviceIds, association: associationIds, album: albumIds }[detail[1]];
    assert(pool.has(detail[2]), `Unknown detail destination: ${to}`);
    return;
  }
  assert(viewRoutes.has(route), `Unknown view destination: ${to}`);
  if (route === '/activites' && params.has('fiche')) assert(activityIds.has(params.get('fiche')), `Unknown activity: ${to}`);
  if (route === '/autour-de-moi' && params.has('lieu')) assert(equipmentIds.has(params.get('lieu')), `Unknown equipment: ${to}`);
  if (route === '/quartiers' && params.has('quartier')) {
    const district = Number(params.get('quartier'));
    assert(Number.isInteger(district) && district >= 0 && district < districtCount, `Unknown district: ${to}`);
  }
}

const excluded = index.filter(item => item.fictional || item.searchType === 'evenement');
const seenIds = new Set();
const records = index.filter(item => !excluded.includes(item)).map(item => {
  assert(/^[a-z0-9_-]{1,100}$/.test(item.id) && !seenIds.has(item.id), `Invalid or duplicate ID: ${item.id}`);
  seenIds.add(item.id);
  const to = item.to || item.url;
  validateRoute(to);
  const record = {
    id: item.id, title: text(item.title, 180), description: text(item.desc, 350),
    to, type: item.searchType, keywords: text(item.keywords, 450),
    category: item.category === 'Données publiques' ? 'Cartes et données' : text(item.category, 100),
    kind: item.kind || 'reference'
  };
  // These optional fields preserve exact-domain matching and existing priority
  // rules when search-core.js is reused on the server.
  if (item.originalUrl || item.domain) record.originalUrl = text(item.originalUrl || item.domain, 300);
  if (Array.isArray(item.aliases) && item.aliases.length) record.aliases = item.aliases.map(alias => text(alias, 300));
  if (Number.isFinite(item.searchPriority) && item.searchPriority !== 0) record.searchPriority = item.searchPriority;
  assert(record.title && record.type && record.to, `Incomplete record: ${record.id}`);
  return record;
}).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const catalog = {
  schemaVersion: 1,
  sourceDate: '2026-10-11',
  scope: 'Navigation references from the Meudon prototype local search index. Not live municipal information.',
  sourceFiles: Object.fromEntries(sourceNames.map(name => [name, crypto.createHash('sha256').update(sources[name]).digest('hex')])),
  excluded: { fictionalEvents: excluded.length },
  externalAllowlist: [...new Set(records.filter(item => !item.to.startsWith('#/')).map(item => item.to))].sort(),
  records
};
const serialized = JSON.stringify(catalog, null, 2) + '\n';
assert(!/(?:\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}|Authorization\s*:\s*Bearer|OPENAI_API_KEY\s*=)/i.test(serialized), 'Secret-like content found in public source catalogue.');

// Meaningful navigation checks against the compact snapshot: service needs,
// misspellings, district records, external source aliases and activity discovery.
const rankable = records.map(item => ({ ...item, desc: item.description, searchType: item.type }));
const examples = [
  ['renouveler passeport enfant 8 ans', 'identite'],
  ['horraires médiatèque', 'mediatheques'],
  ['menu cantine', 'famille'],
  ['inscrire bebe en crech', 'creche'],
  ['théâtre mercredi 7 ans', 'association-plakka'],
  ['compte rendu conseil Bellevue', 'document-1-3'],
  ['open data gpso', 'data-gpso'],
  ['services.meudon.fr', 'demarches'],
  ['je déménage', 'nouvel-habitant'],
  ['Instagram', 'instagram']
];
for (const [query, expected] of examples) {
  const top = context.MeudonSearch.rank(query, rankable).slice(0, 3).map(item => item.id);
  assert(top.includes(expected), `Compact catalogue ranking: ${query} → ${top.join(', ')}; expected ${expected}`);
}
assert(!context.MeudonSearch.rank('qwertyzzzz', rankable).length, 'Unrelated query must not return fabricated destinations.');
assert(!records.some(item => item.type === 'evenement' || item.id.startsWith('event-')), 'Fictitious event leaked into assistant index.');

if (process.argv.includes('--check')) {
  assert(fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') === serialized, 'Catalogue snapshot differs from the current public source. Run this script without --check.');
} else {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
}
const counts = records.reduce((result, item) => { result[item.type] = (result[item.type] || 0) + 1; return result; }, {});
console.log(JSON.stringify({ mode: process.argv.includes('--check') ? 'verified' : 'built', records: records.length, excludedEvents: excluded.length, externalDestinations: catalog.externalAllowlist.length, bytes: Buffer.byteLength(serialized), types: counts, rankingChecks: examples.length + 1 }, null, 2));
