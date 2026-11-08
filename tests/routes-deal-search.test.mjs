// Search and Value Creation (deal) routes, run as a real server against a throwaway workspace. Written before these
// routes moved out of server.mjs so the move can be checked for "no change in behaviour". Fake Gmail, no AI, and no
// network at all (tests/helpers/no-network.mjs blocks anything that leaves this computer). Placeholder data only.
import { test, before, after } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-routes2-'));
const PORT = 20000 + Math.floor(Math.random() * 20000);
let srv, log = '';

// one finished owner search with two placeholder firms
fs.mkdirSync(path.join(WS, 'searches'), { recursive: true });
const SEARCH = { id: 'stest1', mode: 'target', objective: 'Marketplace agencies for Amazon sellers in the US', status: 'done', stage: 'done', created: new Date().toISOString(), log: [],
  entities: [
    { id: 'e1', company: 'Placeholder Marketplace Agency', website: 'https://placeholder-agency.test', location: 'Anytown, VA', industry: 'Amazon marketplace agency', scored: true, score: 72, summary: 'A placeholder firm.' },
    { id: 'e2', company: 'Example Retail Brokers', website: 'https://example-brokers.test', location: 'Sometown, OH', industry: 'Retail placement', scored: false, score: 0 },
  ] };
fs.writeFileSync(path.join(WS, 'searches', 'stest1.json'), JSON.stringify(SEARCH));

// a small general ledger: 24 months of fees and costs for a placeholder agency
const months = Array.from({ length: 24 }, (_, i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
const glRows = ['Date,Transaction Type,Num,Name,Memo,Account,Amount'];
months.forEach((m, i) => {
  glRows.push(`${m}-05,Invoice,${i}1,Client A,Monthly retainer,Retainer Revenue,${30000 + i * 100}`);
  glRows.push(`${m}-12,Invoice,${i}2,Client B,Project,Project Revenue,${12000 + i * 50}`);
  glRows.push(`${m}-15,Payroll,${i}3,Payroll Co,Salaries,Salaries & Wages,-${18000}`);
  glRows.push(`${m}-20,Bill,${i}4,Landlord LLC,Rent,Rent Expense,-3000`);
  glRows.push(`${m}-25,Bill,${i}5,Software Co,Tools,Software Subscriptions,-900`);
});
const GL = Buffer.from(glRows.join('\n')).toString('base64');

const req = (method, p, { body, headers = {} } = {}) => new Promise((ok, bad) => {
  const data = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { Host: `127.0.0.1:${PORT}`, ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
    let t = ''; res.on('data', d => t += d); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch {} ok({ status: res.statusCode, json: j, text: t, type: res.headers['content-type'] }); });
  });
  r.on('error', bad); if (data) r.write(data); r.end();
});
const get = p => req('GET', `/api/${p}`);
const post = (p, body) => req('POST', `/api/${p}`, { body });

before(async () => {
  srv = spawn(process.execPath, ['--import', path.join(ROOT, 'tests/helpers/no-network.mjs'), path.join(ROOT, 'server.mjs')], {
    cwd: ROOT, env: { ...process.env, AION_WORKSPACE: WS, PORT: String(PORT), AION_OFFLINE: '1', AION_GMAIL_MOCK: '1', AION_NO_RESUME: '1', AION_SENDERS: 'sender@example.test', HUNTER_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) { try { if ((await get('deals')).status === 200) return; } catch {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('server did not start: ' + log);
});
after(() => { srv?.kill(); });

test('search read routes answer from the saved search', async () => {
  const list = (await get('search/list')).json.searches;
  assert.equal(list.length, 1); assert.equal(list[0].id, 'stest1');
  const s = (await get('search/get/stest1')).json;
  assert.equal(s.entities.length, 2); assert.equal(s.raw, undefined);
  assert.equal((await get('search/get/nope')).status, 404);
  for (const p of ['search/network', 'search/today', 'search/intent', 'search/radar', 'search/pipeline', 'search/sources', 'search/watches', 'finders']) {
    const r = await get(p); assert.equal(r.status, 200, `${p}: ${r.text.slice(0, 200)}`);
  }
  assert.equal((await get('finders')).json.hunter, false);
  const intent = (await get('search/intent')).json; assert.ok(Array.isArray(intent.list)); assert.equal(intent.scanning, null);
});

test('search changes: decide, stage, watch and their checks', async () => {
  assert.equal((await post('search/decide', { id: 'stest1', entity: 'e1', decision: 'priority', note: 'Call first' })).status, 200);
  const saved = JSON.parse(fs.readFileSync(path.join(WS, 'searches', 'stest1.json'), 'utf8'));
  assert.equal(saved.entities[0].decision, 'priority'); assert.equal(saved.entities[0].note, 'Call first');
  assert.equal((await post('search/decide', { id: 'stest1', entity: 'e1', decision: 'bogus' })).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(WS, 'searches', 'stest1.json'), 'utf8')).entities[0].decision, null);
  assert.equal((await post('search/decide', { id: 'nope', entity: 'e1' })).status, 404);
  assert.equal((await post('search/decide', { id: 'stest1', entity: 'nope' })).status, 404);
  const st = await post('search/stage', { id: 'stest1', entity: 'e1', stage: 'contacted', note: '' });
  assert.equal(st.status, 200, st.text); assert.ok(st.json.deal);
  assert.equal((await get('search/pipeline')).json.deals.length, 1);
  assert.equal((await post('search/stage', { id: 'nope', entity: 'e1' })).status, 404);
  assert.equal((await post('search/watch', { id: 'nope', on: true })).status, 404);
  assert.equal((await post('search/watchrun', { id: 'nope' })).status, 404);
});

test('search start, more, signals and archive refuse bad input', async () => {
  assert.equal((await post('search/start', { mode: 'target', objective: 'short' })).status, 400);
  assert.equal((await post('search/more', { id: 'nope' })).status, 404);
  assert.equal((await post('search/signals', { id: 'nope' })).status, 404);
  assert.equal((await post('search/archive', { id: 'nope' })).status, 404);
  assert.equal((await post('finders/key', { key: '' })).json.hunter, false);
  assert.equal((await post('search/contacts', { remove: true })).status, 200);
});

test('deal routes before any upload: clear messages, no crash', async () => {
  const st = (await get('state')).json; assert.ok(st);
  assert.equal((await get('deals')).json.current, null);
  for (const [p, b, re] of [['excel', {}, /Analyze a company first/], ['pdf', {}, /Analyze a company first/], ['subsector', { subsector: 'none' }, /Analyze a company first/],
    ['diligence', { key: 'x' }, /Open a deal first/], ['extra', { type: 'payroll' }, /Upload the books first/], ['checkin', {}, /Analyze the company first/], ['ai/outside', { name: 'x' }, /Analyze a company first/]]) {
    const r = await post(p, b); assert.equal(r.status, 400, p); assert.match(r.json.error, re, p);
  }
  assert.equal((await post('upload', { filename: 'books.txt', data: 'aGk=' })).status, 400);
  assert.equal((await post('extra', { type: 'nope' })).status, 400);
  assert.equal((await post('nope', {})).status, 404);
  assert.equal((await req('PUT', '/api/state')).status, 405);
});

test('upload books, then every deal edit route works on the open deal', async () => {
  const up = await post('upload', { filename: 'Placeholder Agency GL.csv', data: GL });
  assert.equal(up.status, 200, up.text);
  const deals = (await get('deals')).json; assert.ok(deals.current); assert.equal(deals.deals.length, 1);
  const id = deals.current;
  assert.ok(fs.existsSync(path.join(WS, 'deals', id, 'gl.json')));
  const rows = (await get('rows')).json; assert.equal(rows.total, 24 * 5);
  assert.equal((await get('rows?account=Rent%20Expense')).json.total, 24);
  assert.equal((await get('log')).status, 200);
  const st = (await get('state')).json; assert.equal(st.state.file.kind, 'gl'); assert.ok(st.state.accounts.some(a => a.account === 'Retainer Revenue'));
  assert.equal(st.derived.stage, 'map'); // accounts are sorted by the AI step, which is off in tests

  let r = await post('mapping', { signMode: 'debit', confirm: false });
  assert.equal(r.status, 200); assert.equal(r.json.state.signMode, 'debit'); assert.equal(r.json.state.mappingConfirmed, false);
  r = await post('earnings', { owner: { marketComp: 150000, count: 1, bogus: 5 }, confirm: true });
  assert.equal(r.status, 200); assert.equal(r.json.state.owner.marketComp, 150000); assert.equal(r.json.state.owner.bogus, undefined);
  r = await post('answer', { key: 'owner_leaving', value: false });
  assert.equal(r.status, 200); assert.equal(r.json.state.owner.stays, true); assert.ok(r.json.state.owner.count >= 1);
  r = await post('assumptions', { assumptions: { stake: 0.8, deal_form: 'stock', fee_rate: 0.1, vehicle: 'bogus' } });
  assert.equal(r.status, 200); assert.equal(r.json.state.assumptions.stake, 0.8); assert.equal(r.json.state.assumptions.deal_form, 'stock'); assert.equal(r.json.state.assumptions.fee_rate, 0.1); assert.notEqual(r.json.state.assumptions.vehicle, 'bogus');
  r = await post('assumptions', { assumptions: { stake: 0.2 } }); assert.equal(r.json.state.assumptions.stake, 0.8);
  r = await post('assumptions', { reset: true }); assert.equal(r.status, 200);
  r = await post('ops', { ops: { billable_staff: 6 }, confirm: true }); assert.equal(r.status, 200, r.text); assert.equal(r.json.state.opsConfirmed, true);
  r = await post('mask', { on: true }); assert.equal(r.json.state.maskNames, true);
  r = await post('deals/rename', { name: 'Placeholder Agency' }); assert.equal(r.json.state.name, 'Placeholder Agency');
  r = await post('diligence', { key: 'definitely-not-a-question', value: 'x' }); assert.equal(r.status, 400);
  // no plan yet (the AI step never ran): the files that need a finished analysis say so
  assert.equal((await post('excel', {})).status, 400);

  r = await post('deals/new', {}); assert.equal(r.status, 200);
  assert.equal((await get('deals')).json.current, null);
  r = await post('deals/select', { id }); assert.equal(r.status, 200);
  assert.equal((await get('deals')).json.current, id);
  assert.equal((await get('state')).json.state.name, 'Placeholder Agency');
  r = await post('reset', {}); assert.equal(r.status, 200);
  assert.ok(fs.readdirSync(path.join(WS, 'archive')).some(f => f.startsWith(id)), 'a reset deal is archived, never deleted');
  assert.doesNotMatch(log, /ReferenceError|TypeError/);
});

test('static files and the thesis script', async () => {
  const home = await req('GET', '/'); assert.equal(home.status, 200); assert.match(home.type, /text\/html/);
  const th = await req('GET', '/thesis.mjs'); assert.equal(th.status, 200); assert.match(th.text, /configure\(/);
  assert.equal((await req('GET', '/../server.mjs')).status, 404);
  assert.equal((await req('GET', '/%2e%2e/server.mjs')).status, 404);
  assert.doesNotMatch(log, /Network blocked/);
});

// background jobs run to the end offline (AI off, network blocked): they finish, say what went wrong in plain words,
// keep the user's decisions, and one job per search at a time
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await new Promise(r => setTimeout(r, 200)); } return null; };
test('background jobs: a new search, signals, the intent scan and the brand radar finish offline without losing decisions', async () => {
  assert.equal((await post('search/start', { mode: 'candidate', objective: 'Account managers for an Amazon agency in Ohio' })).status, 400, 'candidate searches are closed');
  const st = await post('search/start', { mode: 'target', objective: 'Retail placement firms for natural food brands in Texas' });
  assert.equal(st.status, 200, st.text);
  const done = await until(async () => { const s = (await get('search/get/' + st.json.id)).json; return s && s.status !== 'running' ? s : null; });
  assert.ok(done, 'the search stops'); assert.notEqual(done.status, 'running');
  // signals on the placeholder search while a decision is made: the decision stays
  assert.equal((await post('search/decide', { id: 'stest1', entity: 'e1', decision: 'saved' })).status, 200);
  assert.equal((await post('search/signals', { id: 'stest1' })).status, 200);
  assert.equal((await post('search/decide', { id: 'stest1', entity: 'e1', decision: 'priority' })).status, 200);
  await until(async () => !(await get('search/list')).json.searches.some(x => x.status === 'running'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(WS, 'searches', 'stest1.json'), 'utf8')).entities[0].decision, 'priority');
  assert.equal((await post('search/intent-scan', {})).status, 200);
  assert.ok(await until(async () => (await get('search/intent')).json.scanning === null), 'the intent scan finishes');
  assert.equal((await post('radar/scan', { region: 'Texas', days: 30 })).status, 200);
  const rd = await until(async () => { const r = (await get('search/radar')).json; return r.scanning ? null : r; });
  assert.ok(rd, 'the radar scan finishes'); if (rd.lastError) assert.doesNotMatch(rd.lastError.error, /\/Users\//);
  assert.doesNotMatch(log, /ReferenceError|TypeError: .* is not a function/);
});
