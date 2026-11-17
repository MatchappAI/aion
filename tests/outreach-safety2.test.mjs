// Audit fixes, Nov 17 2026: closed or bounced outreach never sends again; a schedule is tied to the exact recipient,
// inbox and footer you approved; no catch-up bursts; every new message in a sync is read; opt-out wording; brokers; duplicates.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.AION_GMAIL_MOCK = '1'; process.env.AION_OFFLINE = '1'; process.env.AION_SENDERS = 'sender-one@example.com,sender-two@example.com';
const OUT = await import('../lib/outreach/outreach.mjs');
const GM = await import('../lib/outreach/gmail.mjs');
const MEM = await import('../lib/search/memory.mjs');
const { listedFor, isMarketplace } = await import('../lib/search/timing.mjs');
const { firmCore } = await import('../lib/search/resolve.mjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-out2-'));
MEM.initMemory(dir); OUT.initOutreach(dir); GM.initGmail(dir);
GM.connectUrl(8765, 'sender-one@example.com'); GM.connectUrl(8765, 'sender-two@example.com');
OUT.setSettings({ address: '123 Main St, Norfolk, VA 23510' });
const s = { id: 'ssafe', mode: 'target', created: new Date().toISOString(), objective: 'Retail placement brokers', subsector: null, entities: [] };
const fakeAI = async () => ({ text: JSON.stringify({ email: { subject: 'Your firm', body: 'Hi, a short note about your firm. Would a call next week work?', used: [] },
  followup1: { body: 'Following up on my note.', used: [] }, followup2: { body: 'Last note from me.', used: [] }, letter: { body: 'Dear owner', used: [] }, call: { body: '- ask', used: [] }, form: { body: 'Hello', used: [] }, why: 'x' }) });
const wait = async f => { for (let i = 0; i < 100 && !f(); i++) await new Promise(r => setTimeout(r, 20)); };
let n = 0;
async function fresh() {
  n++; const e = { id: `f${n}`, company: `Safety Firm ${n}`, website: `https://safety${n}.test`, location: 'Austin, TX', industry: 'Retail placement broker', scored: true, score: 70, owner: 'Pat Roe',
    contactInfo: [{ person: 'Pat Roe', kind: 'email', value: `pat@safety${n}.test`, verified: true }], contacts: [{ name: 'Pat Roe', title: 'Owner' }] };
  s.entities.push(e); MEM.ingest(s);
  const it = await OUT.createDraft({ s, e, model: 'x', cwd: dir, engineFn: fakeAI });
  await wait(() => OUT.get(it.id).phase !== 'writing'); return OUT.get(it.id);
}
const reply = (it, msg) => GM.fake.threads[it.messages.find(m => m.threadId && !m.void).threadId].push({ id: `r${Math.random()}`, at: new Date().toISOString(), subject: 'Re: Your firm', ...msg });
const H = 3600_000, D = 24 * H;

test('a bounce closes the outreach: a scheduled follow-up is dropped and nothing can be sent again', async () => {
  const it = await fresh();
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  OUT.schedule(it.id, 'followup1', new Date(Date.now() + 4 * D).toISOString(), { confirmed: true });
  reply(it, { from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)', body: 'Address not found' });
  await OUT.syncReplies();
  const x = OUT.get(it.id);
  assert.equal(x.bounced, true); assert.equal(x.phase, 'finished'); assert.ok(!x.scheduled?.followup1, 'the follow-up schedule is cleared');
  assert.equal(await OUT.runScheduled(new Date(Date.now() + 5 * D)), 0);
  const pf = OUT.preflight(it.id, 'followup1'); assert.equal(pf.ok, false); assert.match(pf.problems.join(), /bounced/);
  await assert.rejects(OUT.sendStep(it.id, 'followup1', { confirmed: true }), /bounced/);
  assert.equal(OUT.get(it.id).phase, 'finished', 'a send attempt never reopens a closed item');
});

test('marking a deal Passed stops a scheduled follow-up', async () => {
  const it = await fresh();
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  OUT.schedule(it.id, 'followup1', new Date(Date.now() + 4 * D).toISOString(), { confirmed: true });
  OUT.setDealStage(it.id, 'passed', 'not a fit');
  assert.equal(await OUT.runScheduled(new Date(Date.now() + 4 * D + H)), 0);
  assert.ok(!OUT.get(it.id).scheduled.followup1); assert.ok(OUT.get(it.id).log.some(l => /outreach is closed/.test(l.text)));
});

test('a schedule holds if the recipient, the inbox or the signature changes after you approved it', async () => {
  for (const change of [it => OUT.editItem(it.id, { to: 'someone@unrelated-co.test' }), it => OUT.editItem(it.id, { sender: 'sender-two@example.com' }), () => OUT.setSettings({ signature: 'A new signature' })]) {
    const it = await fresh();
    OUT.schedule(it.id, 'email', new Date(Date.now() + 5 * 60_000).toISOString(), { confirmed: true });
    change(it);
    assert.equal(await OUT.runScheduled(new Date(Date.now() + 10 * 60_000)), 0);
    assert.match(OUT.get(it.id).scheduled.email.held, /Changed after you approved/);
    OUT.setSettings({ signature: '' });
  }
});

test('no catch-up burst: a follow-up waits a day after the first email, and a send more than a day late asks again', async () => {
  const it = await fresh(), t0 = Date.now();
  OUT.schedule(it.id, 'email', new Date(t0 + 5 * 60_000).toISOString(), { confirmed: true });
  OUT.schedule(it.id, 'followup1', new Date(t0 + 7 * 60_000).toISOString(), { confirmed: true });
  assert.equal(await OUT.runScheduled(new Date(t0 + 10 * 60_000)), 1, 'only the first email goes');
  assert.equal(await OUT.runScheduled(new Date(t0 + 11 * 60_000)), 0, 'the follow-up waits a day after the first email');
  assert.equal(await OUT.runScheduled(new Date(t0 + D + 20 * 60_000)), 1, 'then it goes');
  const late = await fresh();
  OUT.schedule(late.id, 'email', new Date(t0 + 5 * 60_000).toISOString(), { confirmed: true });
  assert.equal(await OUT.runScheduled(new Date(t0 + 3 * D)), 0, 'AION was closed for days: nothing goes out late');
  assert.match(OUT.get(late.id).scheduled.email.held, /Missed its time/);
});

test('pressing Send on a scheduled email clears the schedule (no ghost "on hold")', async () => {
  const it = await fresh();
  OUT.schedule(it.id, 'email', new Date(Date.now() + 60 * 60_000).toISOString(), { confirmed: true });
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  assert.ok(!OUT.get(it.id).scheduled.email);
});

test('every new message in one check is read: an opt-out followed by an out-of-office still opts out', async () => {
  const it = await fresh();
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  reply(it, { from: `Pat Roe <pat@safety${n}.test>`, body: 'Please remove me, not interested.' });
  reply(it, { from: `Pat Roe <pat@safety${n}.test>`, body: 'I am out of the office until Monday.' });
  await OUT.syncReplies();
  assert.equal(OUT.get(it.id).phase, 'finished'); assert.ok(OUT.isSuppressed(`pat@safety${n}.test`));
});

test('a header-marked automatic reply is not a reply, even when its wording looks human', async () => {
  const it = await fresh();
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  reply(it, { from: `Pat Roe <pat@safety${n}.test>`, body: 'We have received your message and will get back to you.', auto: true });
  await OUT.syncReplies();
  assert.ok(!OUT.get(it.id).replied); assert.equal(OUT.get(it.id).phase, 'waiting');
});

test('reading replies: clear opt-outs stop, door-open answers are "later", people are not out-of-office', () => {
  const optout = ['Please remove us from your list.', 'Take us off your list', 'Not for us. Please do not send further emails.', 'Stop.', 'No thanks, we\'re not selling.', 'No thanks.', 'Unsubscribe', 'Do not email me again'];
  for (const t of optout) assert.equal(OUT.classify(OUT.newText(t)), 'optout', t);
  const later = ['Not right now, maybe in a few years.', 'No thanks for now, check back next year.', 'We are not selling right now.'];
  for (const t of later) assert.equal(OUT.classify(t), 'later', t);
  const notOptout = ['Please stop by the office next week.', 'No, thanks for the note – yes, happy to talk.', 'Don\'t email John, call me.'];
  for (const t of notOptout) assert.notEqual(OUT.classify(t), 'optout', t);
  assert.equal(OUT.isAutoReply('Yes, happy to talk. I\'ll be back in town Monday, call me then.'), false);
  assert.equal(OUT.isAutoReply('Thanks for your email. I\'ll be back on Monday with limited access to email.'), true);
  assert.equal(OUT.isAutoReply('Automatic reply: out of office'), true);
});

test('after a guessed address bounces, the owner\'s real address can get the first email', async () => {
  const it = await fresh();
  OUT.get(it.id).contacts.emails.push({ email: `pat.roe@safety${n}.test`, likely: true, source: 'pattern' });
  OUT.editItem(it.id, { to: `pat.roe@safety${n}.test` });
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  reply(it, { from: 'mailer-daemon@googlemail.com', subject: 'Undeliverable', body: 'no such user' });
  await OUT.syncReplies();
  assert.equal(OUT.get(it.id).to, ''); assert.ok(OUT.get(it.id).messages[0].void);
  OUT.editItem(it.id, { to: `pat@safety${n}.test` });
  assert.equal(OUT.preflight(it.id, 'email').ok, true, OUT.preflight(it.id, 'email').problems.join());
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  const sent = OUT.get(it.id).messages.filter(m => !m.void);
  assert.equal(sent.length, 1); assert.notEqual(sent[0].threadId, OUT.get(it.id).messages[0].threadId, 'a new thread, not a reply to the bounced one');
});

test('broker listings: any broker domain ending, and listing wording on any page, mean "listed"', () => {
  assert.ok(isMarketplace('https://www.bizbuysell.co.uk/listing/1')); assert.ok(isMarketplace('https://generationalequity.com/x'));
  assert.ok(listedFor([{ key: 'sale_stated', direction: 'for', url: 'https://some-advisor.example/deal', text: 'Retail broker for sale, asking price $2.1M' }]));
  assert.ok(!listedFor([{ key: 'succession', direction: 'for', url: 'https://firm.example/about', text: 'Products for sale at Target and Walmart' }]), 'ordinary "for sale" wording is not a listing');
});

test('firm-name variants share one core; short or generic cores never match', () => {
  assert.equal(firmCore('RMW Commerce Consulting'), firmCore('RMW Commerce'));
  assert.equal(firmCore('Fresh Solutions of Texas'), firmCore('Fresh Solutions'));
  assert.equal(firmCore('The Acme Agency, LLC'), firmCore('Acme'));
  assert.equal(firmCore('ABC Consulting'), '', 'a core under 6 letters is too generic to merge on');
});

test('the same firm under a name variant gets only one outreach', async () => {
  const a = { id: 'v1', company: 'Northwind Retail Partners', website: '', location: 'Austin, TX', industry: 'Retail placement broker', scored: true, score: 60, contactInfo: [{ person: 'Lee Poe', kind: 'email', value: 'lee@northwind-retail.test', verified: true }] };
  const b = { ...a, id: 'v2', company: 'Northwind Retail Partners Consulting', contactInfo: [{ person: 'Lee Poe', kind: 'email', value: 'lee@northwind-retail.test', verified: true }] };
  s.entities.push(a, b); MEM.ingest(s);
  await OUT.createDraft({ s, e: a, model: 'x', cwd: dir, engineFn: fakeAI });
  await assert.rejects(OUT.createDraft({ s, e: b, model: 'x', cwd: dir, engineFn: fakeAI }), /already have outreach/);
});
