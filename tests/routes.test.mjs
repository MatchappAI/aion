// The local server's routes, run as a real server against a throwaway workspace: the Host / Origin / JSON gates,
// every send needing the server-side confirm code, the LOI path, and a few read routes. Fake Gmail, no AI, and no
// network at all (tests/helpers/no-network.mjs blocks anything that leaves this computer).
import { test, before, after } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-routes-'));
const PORT = 20000 + Math.floor(Math.random() * 20000);
const SENDER = 'sender@example.test';
let srv, log = '';

// one outreach, drafted and ready, so sends can be tried end to end on the fake Gmail
fs.mkdirSync(path.join(WS, 'outreach'), { recursive: true });
fs.writeFileSync(path.join(WS, 'outreach', 'outreach.json'), JSON.stringify({
  settings: { address: '1 Placeholder Way, Anytown, VA 00000', name: 'Sam Sender', defaultSender: SENDER, senders: [SENDER] }, suppress: [],
  items: [{ id: 'otest1', mode: 'target', search: 'sx', entity: 'e1', key: 'placeholder.test', name: 'Placeholder Co', website: 'https://placeholder.test', created: new Date().toISOString(), phase: 'review', status: 'Ready for your OK', pitch: 'full',
    sender: SENDER, to: 'pat@placeholder.test', toName: 'Pat Example', owner: 'Pat Example', signals: [], log: [], messages: [],
    contacts: { emails: [{ name: 'Pat Example', email: 'pat@placeholder.test', verified: true }], people: [{ name: 'Pat Example', title: 'Owner' }], other: [] },
    drafts: { email: { subject: 'A note for Pat', body: 'Hi Pat, a short note from Sam.', used: [], check: [] } } }],
}));

const req = (method, p, { body, headers = {} } = {}) => new Promise((ok, bad) => {
  const data = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { Host: `localhost:${PORT}`, ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
    let t = ''; res.on('data', d => t += d); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch {} ok({ status: res.statusCode, json: j, text: t }); });
  });
  r.on('error', bad); if (data) r.write(data); r.end();
});
const post = (p, body, headers) => req('POST', `/api/${p}`, { body, headers });

before(async () => {
  srv = spawn(process.execPath, ['--import', path.join(ROOT, 'tests/helpers/no-network.mjs'), path.join(ROOT, 'server.mjs')], {
    cwd: ROOT, env: { ...process.env, AION_WORKSPACE: WS, PORT: String(PORT), AION_OFFLINE: '1', AION_GMAIL_MOCK: '1', AION_NO_RESUME: '1', AION_SENDERS: SENDER, AION_NAME: 'Sam Sender', HUNTER_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) { try { if ((await req('GET', '/api/deals')).status === 200) return; } catch {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('server did not start: ' + log);
});
after(() => { srv?.kill(); });

test('only this computer can talk to the server: Host, Origin and JSON checks', async () => {
  assert.equal((await req('GET', '/api/deals', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await post('outreach/settings', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await req('POST', '/api/outreach/settings', { body: 'a=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await req('GET', '/api/deals')).status, 200);
});

test('a send without the server-side confirm code never goes out', async () => {
  assert.equal((await post('outreach/connect', { email: SENDER })).status, 200);
  const r = await post('outreach/send', { id: 'otest1', kind: 'email', confirmed: true });
  assert.equal(r.status, 400); assert.match(r.json.error, /confirm this send again/);
  const it = (await req('GET', '/api/outreach/item?id=otest1')).json;
  assert.equal(it.messages.length, 0);
});

test('confirm → send works once; an edit after confirming needs a new confirm', async () => {
  let c = (await post('outreach/confirm', { id: 'otest1', action: 'step', kind: 'email' })).json;
  assert.ok(c.ok, (c.problems || []).join('; ')); assert.ok(c.token); assert.equal(c.to, 'pat@placeholder.test'); assert.match(c.body, /no thanks/);
  // edited after the preview: the old code no longer matches what would be sent
  assert.equal((await post('outreach/edit', { id: 'otest1', kind: 'email', body: 'Hi Pat, an edited note from Sam.' })).status, 200);
  let r = await post('outreach/send', { id: 'otest1', kind: 'email', confirmed: true, token: c.token });
  assert.equal(r.status, 400); assert.match(r.json.error, /changed after you confirmed/);
  c = (await post('outreach/confirm', { id: 'otest1', action: 'step', kind: 'email' })).json;
  r = await post('outreach/send', { id: 'otest1', kind: 'email', confirmed: true, token: c.token });
  assert.equal(r.status, 200, r.text); assert.ok(r.json.sent);
  r = await post('outreach/send', { id: 'otest1', kind: 'email', confirmed: true, token: c.token });
  assert.equal(r.status, 400); // the code is used up (and the email was already sent)
  const it = (await req('GET', '/api/outreach/item?id=otest1')).json;
  assert.equal(it.messages.filter(m => m.kind === 'email').length, 1);
});

test('a reply quoting our footer is read as interested over the route, not as an opt-out', async () => {
  const r = await post('outreach/mock-reply', { id: 'otest1', text: 'Yes, happy to talk.\n\nOn Mon, Nov 3, 2026 at 9:00 AM Sam <sender@example.test> wrote:\n> If you\'d rather not hear from me, just reply "no thanks" and I won\'t write again.' });
  assert.equal(r.status, 200);
  const it = (await req('GET', '/api/outreach/item?id=otest1')).json;
  assert.equal(it.replied.kind, 'interested'); assert.notEqual(it.phase, 'finished');
});

test('answer, invite and document sends also need the confirm code', async () => {
  for (const [p, extra] of [['outreach/answer-send', {}], ['outreach/book', { start: new Date(Date.now() + 86400000).toISOString() }], ['outreach/doc-send', { kind: 'nda' }]]) {
    const r = await post(p, { id: 'otest1', confirmed: true, ...extra });
    assert.equal(r.status, 400, p); assert.match(r.json.error, /confirm this send again/, p);
  }
});

test('LOI needs analyzed books; the open deal is never switched', async () => {
  const before = (await req('GET', '/api/deals')).json.current;
  const r = await post('outreach/doc', { id: 'otest1', kind: 'loi' });
  assert.equal(r.status, 400); assert.match(r.json.error, /Value Creation/);
  assert.equal((await req('GET', '/api/deals')).json.current, before);
});

test('read routes answer without touching the network', async () => {
  for (const p of ['state', 'deals', 'search/list', 'search/pipeline', 'search/radar', 'outreach/state', 'outreach/results']) {
    const r = await req('GET', `/api/${p}`); assert.equal(r.status, 200, `${p}: ${r.text.slice(0, 200)}`);
  }
  assert.doesNotMatch(log, /Network blocked/);
});
