// Send safety over the real routes (fake Gmail, no network): a send happens once per preview, only listed kinds are
// accepted, nothing goes to someone who opted out, and replies are read the way a person would read them.
// Placeholder names and addresses only.
import { test, before, after } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import * as OUT from '../lib/outreach/outreach.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-send-'));
const PORT = 20000 + Math.floor(Math.random() * 20000);
const SENDER = 'sender@example.test';
let srv, log = '';
const item = (id, n) => ({ id, mode: 'target', search: 'sx', entity: 'e' + n, key: `firm${n}.test`, name: `Placeholder Firm ${n}`, website: `https://firm${n}.test`, created: new Date().toISOString(), phase: 'review', status: 'Ready for your OK', pitch: 'full',
  sender: SENDER, to: `owner@firm${n}.test`, toName: 'Pat Example', owner: 'Pat Example', signals: [], log: [], messages: [],
  contacts: { emails: [{ name: 'Pat Example', email: `owner@firm${n}.test`, verified: true }], people: [], other: [] },
  drafts: { email: { subject: `A note for firm ${n}`, body: 'Hi Pat, a short note from Sam.', used: [], check: [] } } });
fs.mkdirSync(path.join(WS, 'outreach'), { recursive: true });
fs.writeFileSync(path.join(WS, 'outreach', 'outreach.json'), JSON.stringify({ settings: { address: '1 Placeholder Way, Anytown, VA 00000', name: 'Sam Sender', defaultSender: SENDER, senders: [SENDER] }, suppress: [], items: [item('oa', 1), item('ob', 2), item('oc', 3)] }));

const req = (method, p, body) => new Promise((ok, bad) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { Host: `localhost:${PORT}`, ...(data ? { 'Content-Type': 'application/json' } : {}) } }, res => {
    let t = ''; res.on('data', d => t += d); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch {} ok({ status: res.statusCode, json: j, text: t }); });
  });
  r.on('error', bad); if (data) r.write(data); r.end();
});
const post = (p, b) => req('POST', `/api/${p}`, b);
const item$ = async id => (await req('GET', `/api/outreach/item?id=${id}`)).json;

before(async () => {
  srv = spawn(process.execPath, ['--import', path.join(ROOT, 'tests/helpers/no-network.mjs'), path.join(ROOT, 'server.mjs')], {
    cwd: ROOT, env: { ...process.env, AION_WORKSPACE: WS, PORT: String(PORT), AION_OFFLINE: '1', AION_GMAIL_MOCK: '1', AION_NO_RESUME: '1', AION_SENDERS: SENDER, AION_NAME: 'Sam Sender', HUNTER_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) { try { if ((await req('GET', '/api/deals')).status === 200) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.equal((await post('outreach/connect', { email: SENDER })).status, 200);
});
after(() => { srv?.kill(); });

test('two previews, one send: the second code stops working once the email is sent', async () => {
  const t1 = (await post('outreach/confirm', { id: 'oa', action: 'step', kind: 'email' })).json.token;
  const t2 = (await post('outreach/confirm', { id: 'oa', action: 'step', kind: 'email' })).json.token;
  assert.ok(t1 && t2 && t1 !== t2);
  assert.equal((await post('outreach/send', { id: 'oa', kind: 'email', confirmed: true, token: t1 })).status, 200);
  const r = await post('outreach/send', { id: 'oa', kind: 'email', confirmed: true, token: t2 });
  assert.equal(r.status, 400);
  assert.equal((await item$('oa')).messages.filter(m => m.kind === 'email').length, 1);
});

test('only listed kinds: a list or a made-up kind is refused before anything else', async () => {
  const t = (await post('outreach/confirm', { id: 'ob', action: 'step', kind: 'email' })).json.token;
  for (const kind of [['email'], { a: 1 }, 'letter', '__proto__']) assert.equal((await post('outreach/send', { id: 'ob', kind, confirmed: true, token: t })).status, 400, JSON.stringify(kind));
  assert.equal((await post('outreach/confirm', { id: 'ob', action: 'step', kind: ['email'] })).status, 400);
  assert.equal((await post('outreach/doc-edit', { id: 'ob', kind: '__proto__', body: 'x' })).status, 400);
  assert.equal((await post('outreach/done', { id: 'ob', kind: 'email', note: '' })).status, 400);
  assert.equal((await item$('ob')).messages.length, 0);
});

test('an owner who opts out after the invite preview gets no invite', async () => {
  let c = (await post('outreach/confirm', { id: 'oc', action: 'step', kind: 'email' })).json;
  assert.equal((await post('outreach/send', { id: 'oc', kind: 'email', confirmed: true, token: c.token })).status, 200);
  const start = new Date(Date.now() + 3 * 86400000).toISOString();
  const inv = (await post('outreach/confirm', { id: 'oc', action: 'invite', start })).json;
  await post('outreach/mock-reply', { id: 'oc', text: 'Please remove me from your list.' });
  const it = await item$('oc'); assert.equal(it.replied.kind, 'optout'); assert.equal(it.phase, 'finished');
  const r = await post('outreach/book', { id: 'oc', start, confirmed: true, token: inv.token });
  assert.equal(r.status, 400); assert.ok(!(await item$('oc')).call);
});

test('an out-of-office answer is not a reply: follow-ups carry on', async () => {
  await post('outreach/mock-reply', { id: 'oa', text: 'I am out of the office until Monday with limited access to email.' });
  const it = await item$('oa'); assert.ok(!it.replied, 'auto-reply must not count as a reply'); assert.notEqual(it.phase, 'finished');
  assert.ok(it.log.some(l => /Automatic reply/.test(l.text)));
  assert.doesNotMatch(log, /ReferenceError|TypeError/);
});

test('reading replies like a person would', () => {
  const c = t => OUT.classify(OUT.newText(t));
  assert.equal(c('Not interested in selling right now, but maybe in a couple of years.'), 'later');
  assert.equal(c('No thanks needed! Happy to talk Tuesday.'), 'interested');
  assert.equal(c('Please don’t email me again.'), 'optout');
  assert.equal(c('We are not looking to sell. Please stop.'), 'optout');
  assert.equal(c('Not interested.'), 'optout');
  assert.ok(OUT.isAutoReply('Automatic reply: I am on vacation until the 12th'));
  // a bounce comes from the mail system, never from a person quoting the word
  assert.equal(OUT.isBounce('Pat <owner@firm1.test>', 'Re: A note — that address was undeliverable last year'), false);
  assert.equal(OUT.isBounce('Mail System <notices@example.test>', 'Undeliverable: A note for firm 1'), true);
  assert.equal(OUT.isBounce('Pat <owner@firm1.test>', 'Re: A note for firm 1'), false);
  assert.equal(OUT.isBounce('Mail Delivery Subsystem <mailer-daemon@googlemail.com>', 'Delivery Status Notification (Failure)'), true);
});
