// Outreach end to end against a fake Gmail and a fake AI: signals → personal drafts → checks → send (only when
// confirmed) → deal stage → follow-up in the same thread → reply detected → opt-out never emailed again.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.AION_GMAIL_MOCK = '1'; process.env.AION_OFFLINE = '1'; process.env.AION_SENDERS = 'guptapartnersteam@gmail.com,gupta.mohil@gmail.com';
const OUT = await import('../lib/outreach/outreach.mjs');
const GM = await import('../lib/outreach/gmail.mjs');
const MEM = await import('../lib/search/memory.mjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-out-'));
MEM.initMemory(dir); OUT.initOutreach(dir);
const s = { id: 'stest', mode: 'target', created: new Date().toISOString(), objective: 'HVAC in Northern Virginia', subsector: 'engineering' };
const e = { id: 'e1', company: 'Example Cooling & Heating', website: 'https://example-hvac.test', location: 'Springfield, VA', industry: 'Residential HVAC', founded: '2002', ownership: 'family-owned', owner: 'Brian Doe', scored: true, score: 72,
  verifiedFacts: [{ text: 'Family owned and operated; serving Northern Virginia since 2002.', url: 'https://example-hvac.test' }],
  timing: { whyNow: 'The founder has run it for 24 years' }, contactInfo: [{ person: 'Brian Doe', kind: 'email', value: 'brian@example-hvac.test', verified: true, url: 'https://example-hvac.test' }], contacts: [{ name: 'Brian Doe', title: 'Owner' }] };
s.entities = [e]; MEM.ingest(s);

const fakeAI = async ({ prompt }) => {
  assert.match(prompt, /Founded in 2002/); assert.match(prompt, /Only facts|ONLY facts/i);
  return { text: JSON.stringify({ email: { subject: 'Your 24 years in Springfield', body: 'Hi Brian, Example Cooling has served Northern Virginia since 2002. I run AION, a long-term owner of service firms. Would a 15-minute call next week work?', used: ['s1', 's3', 'nope'] },
    followup1: { body: 'Brian, following up on my note about Example Cooling. Happy to share how we keep teams in place.', used: ['s1'] }, followup2: { body: 'Last note from me, Brian. If now is not the time, no problem at all.', used: [] },
    letter: { body: 'Dear Brian, ...', used: ['s1'] }, call: { body: '- Ask about the next 5 years', used: [] }, form: { body: 'Hello, I would like to speak with the owner.', used: [] }, why: 'Founder-led for 24 years' }) };
};
const wait = async f => { for (let i = 0; i < 50 && !f(); i++) await new Promise(r => setTimeout(r, 20)); };

test('drafts are built from the firm’s own signals, and only real signal ids are kept', async () => {
  const sig = OUT.signalsFor(s, e);
  assert.ok(sig.some(x => /Founded in 2002 \(\d+ years/.test(x.text)));
  assert.ok(sig.some(x => /Owner or leader: Brian Doe/.test(x.text)));
  const it = await OUT.createDraft({ s, e, model: 'x', cwd: dir, engineFn: fakeAI });
  assert.equal(it.to, 'brian@example-hvac.test');
  assert.equal(it.sender, 'guptapartnersteam@gmail.com');
  await wait(() => OUT.get(it.id).phase !== 'writing');
  const d = OUT.get(it.id).drafts;
  assert.deepEqual(d.email.used, ['s1', 's3']);
  assert.ok(d.followup2.body && d.letter.body && d.call.body && d.form.body);
  await assert.rejects(OUT.createDraft({ s, e, model: 'x', cwd: dir, engineFn: fakeAI }), /already exists/);
});

test('nothing sends without a connected sender, a mailing address and your confirmation', async () => {
  const it = OUT.board()[0];
  let pf = OUT.preflight(it.id, 'email');
  assert.equal(pf.ok, false);
  assert.ok(pf.problems.some(p => /isn’t connected/.test(p)));
  assert.ok(pf.problems.some(p => /mailing address/.test(p)));
  GM.connectUrl(8765, 'guptapartnersteam@gmail.com');
  OUT.setSettings({ address: '123 Main St, Norfolk, VA 23510' });
  pf = OUT.preflight(it.id, 'email');
  assert.equal(pf.ok, true, pf.problems.join('; '));
  assert.match(pf.body, /123 Main St/); assert.match(pf.body, /no thanks/);
  await assert.rejects(OUT.sendStep(it.id, 'email', {}), /confirmation/);
  assert.equal(OUT.preflight(it.id, 'followup1').ok, false);
});

test('send → contacted, follow-up in the same thread, reply stops follow-ups', async () => {
  const id = OUT.board()[0].id;
  const r = await OUT.sendStep(id, 'email', { confirmed: true });
  assert.ok(r.sent);
  assert.equal(MEM.dealOf(s, e).stage, 'contacted');
  assert.equal(OUT.preflight(id, 'email').ok, false); // never twice
  const f1 = await OUT.sendStep(id, 'followup1', { confirmed: true });
  const it = OUT.get(id);
  assert.equal(it.messages[1].threadId, it.messages[0].threadId);
  assert.match(it.messages[1].subject, /^Re: /);
  // Brian answers
  GM.fake.threads[it.messages[0].threadId].push({ id: 'their1', from: 'Brian Doe <brian@example-hvac.test>', subject: 'Re: Your 24 years in Springfield', body: 'Happy to talk. How about Tuesday?', at: new Date().toISOString() });
  assert.equal(await OUT.syncReplies(), 1);
  assert.equal(OUT.get(id).replied.kind, 'interested');
  assert.equal(OUT.preflight(id, 'followup2').ok, false);
  assert.ok(f1.sent);
  OUT.setDealStage(id, 'met', 'Call Tuesday');
  assert.equal(MEM.dealOf(s, e).stage, 'met');
});

test('“no thanks” is remembered and that address is never emailed again', async () => {
  const e2 = { ...e, id: 'e2', company: 'Other Air LLC', website: 'https://otherair.com', contactInfo: [{ kind: 'email', value: 'owner@otherair.com', verified: true }] };
  s.entities.push(e2); MEM.ingest(s);
  const it = await OUT.createDraft({ s, e: e2, model: 'x', cwd: dir, engineFn: fakeAI });
  await wait(() => OUT.get(it.id).phase !== 'writing');
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  GM.fake.threads[OUT.get(it.id).messages[0].threadId].push({ id: 'their2', from: 'owner@otherair.com', subject: 'Re', body: 'Not interested, please remove me.', at: new Date().toISOString() });
  await OUT.syncReplies();
  assert.equal(OUT.get(it.id).phase, 'finished');
  assert.ok(OUT.suppressed().includes('owner@otherair.com'));
  assert.equal(OUT.classify('Not right now, maybe next year'), 'later');
});

test('check-before-sending flags numbers and names the signals don’t contain', () => {
  const sig = [{ text: 'Founded in 2002' }, { text: 'Serves Northern Virginia' }];
  const bad = OUT.unsupported('Since 2002 you have grown to 45 staff serving Northern Virginia and Acme Corp.', sig, { name: 'Mohil Gupta' });
  assert.ok(bad.includes('45'));
  assert.ok(bad.includes('Acme Corp'));
  assert.ok(!bad.includes('2002'));
  assert.ok(!bad.includes('Northern Virginia'));
});

test('open times: weekdays, working hours, around busy times, spread out, never within 18 hours', () => {
  const from = new Date('2026-11-06T14:00:00Z'); // Friday 9 AM ET
  const busy = [{ start: '2026-11-09T14:00:00Z', end: '2026-11-09T16:00:00Z' }]; // Mon 9–11 AM ET
  const slots = OUT.pickSlots(busy, { from, minutes: 30, hours: [9, 17], tz: 'America/New_York', max: 5, perDay: 2 });
  assert.equal(slots.length, 5);
  for (const x of slots) {
    const d = new Date(x.start), et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    assert.ok(![0, 6].includes(et.getDay()), 'weekday');
    assert.ok(et.getHours() >= 9 && et.getHours() < 17, 'working hours');
    assert.ok(et.getHours() !== 12, 'lunch kept free');
    assert.ok(Date.parse(x.start) - from.getTime() >= 18 * 3_600_000);
    assert.ok(!busy.some(b => Date.parse(b.start) < Date.parse(x.end) + 15 * 60_000 && Date.parse(b.end) > Date.parse(x.start) - 15 * 60_000));
  }
  assert.equal(OUT.zoned(2026, 11, 9, 9, 0, 'America/New_York').toISOString(), '2026-11-09T14:00:00.000Z');
  assert.equal(OUT.zoned(2026, 7, 9, 9, 0, 'America/New_York').toISOString(), '2026-07-09T13:00:00.000Z');
});

test('the call: real open times, the invite only when confirmed, then “meeting held”', async () => {
  const id = OUT.board().find(x => x.name.startsWith('Example Cooling')).id;
  const { slots } = await OUT.openSlots();
  assert.ok(slots.length >= 3 && slots[0].label.endsWith('ET'));
  await assert.rejects(OUT.bookCall(id, { start: slots[0].start }), /confirmation/);
  const it = await OUT.bookCall(id, { start: slots[0].start, confirmed: true });
  assert.ok(it.call.meet);
  assert.equal(GM.fake.events.at(-1).attendees[0], 'brian@example-hvac.test');
  assert.match(it.status, /Call booked/);
});

test('deal steps: NDA, books request, documents emailed as PDFs in the thread, books linked, LOI from the analysis only', async () => {
  const id = OUT.board().find(x => x.name.startsWith('Example Cooling')).id;
  let it = OUT.makeDoc(id, 'nda');
  assert.match(it.docs.nda.body, /MUTUAL CONFIDENTIALITY AGREEMENT/);
  assert.match(it.docs.nda.body, /Example Cooling & Heating/);
  assert.match(it.docs.nda.body, /State of Virginia/);
  assert.match(it.docs.nda.body, /lawyer review/);
  it = OUT.makeDoc(id, 'request', 'engineering');
  assert.match(it.docs.request.body, /General ledger detail/);
  assert.match(it.docs.request.body, /Licenses and who holds each stamp/);
  await assert.rejects(OUT.sendDoc(id, 'nda', { pdf: Buffer.from('%PDF') }), /confirmation/);
  it = await OUT.sendDoc(id, 'nda', { confirmed: true, pdf: Buffer.from('%PDF-1.4 test') });
  const last = GM.fake.threads[it.messages[0].threadId].at(-1);
  assert.equal(last.attachments[0].mime, 'application/pdf');
  assert.match(last.subject, /^Re: /);
  // they send the books back
  const tid = it.messages[0].threadId;
  GM.fake.threads[tid].push({ id: 'books1', from: 'brian@example-hvac.test', subject: 'Re', body: 'Attached', at: new Date().toISOString(), files: [{ filename: 'GL 2025.csv', mime: 'text/csv', data: Buffer.from('Date,Account,Amount\n') }] });
  const files = await OUT.listAttachments(id);
  assert.equal(files.length, 1); assert.equal(files[0].filename, 'GL 2025.csv');
  assert.equal(String(await OUT.getAttachment(id, files[0].messageId, files[0].attachmentId)), 'Date,Account,Amount\n');
  OUT.linkDeal(id, 'dtest');
  assert.equal(MEM.dealOf(s, e).stage, 'books');
  await assert.rejects(OUT.makeLoi(id, null, { model: 'x', cwd: dir, engineFn: fakeAI }), /Analyze/);
  const loiAI = async ({ prompt }) => { assert.match(prompt, /\$2,400,000/); assert.match(prompt, /NON-BINDING/); return { text: JSON.stringify({ body: 'Non-binding letter of intent ... $2,400,000 ... This draft is for discussion and lawyer review.' }) }; };
  it = await OUT.makeLoi(id, { ebitda: 600000, price: 2400000, multiple: 4, basis: 'ebitda', senior: 1500000, seller: 300000, equity: 600000, revenue: 4100000 }, { model: 'x', cwd: dir, engineFn: loiAI });
  assert.match(it.docs.loi.body, /lawyer review/);
});

test('results and notifications count only what happened, and each alert fires once', () => {
  const r = OUT.results();
  assert.ok(r.totals.contacted >= 2);
  assert.ok(r.totals.replied >= 1);
  assert.ok(r.totals.calls >= 1);
  assert.ok(r.weeks.length >= 1);
  const a1 = OUT.alerts(), a2 = OUT.alerts();
  assert.ok(a1.some(x => /replied/.test(x.title)));
  assert.equal(a2.length, 0);
});

test('writing for many at once queues them two at a time', async () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ s, e: { ...e, id: `m${i}`, company: `Firm ${i}`, website: `https://firm${i}.com`, contactInfo: [] } }));
  let running = 0, peak = 0;
  const slowAI = async args => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 30)); running--; return fakeAI(args); };
  for (const x of many) { s.entities.push(x.e); } MEM.ingest(s);
  const r = await OUT.createMany(many, { model: 'x', cwd: dir, engineFn: slowAI });
  assert.equal(r.made.length, 5);
  await wait(() => r.made.every(i => OUT.get(i).phase !== 'writing'));
  await new Promise(r2 => setTimeout(r2, 400));
  assert.ok(peak <= 2, `peak ${peak}`);
  assert.match(OUT.get(r.made[0]).status, /No email address/);
});

test('both senders: pick gupta.mohil for a firm, its thread stays there, and busy times come from both calendars', async () => {
  GM.connectUrl(8765, 'gupta.mohil@gmail.com');
  assert.deepEqual(GM.accounts().map(a => a.email).sort(), ['gupta.mohil@gmail.com', 'guptapartnersteam@gmail.com']);
  const e3 = { ...e, id: 'e3', company: 'Third Firm', website: 'https://thirdfirm.com', contactInfo: [{ kind: 'email', value: 'owner@thirdfirm.com', verified: true }] };
  s.entities.push(e3); MEM.ingest(s);
  const it = await OUT.createDraft({ s, e: e3, model: 'x', cwd: dir, engineFn: fakeAI });
  await wait(() => OUT.get(it.id).phase !== 'writing');
  assert.equal(OUT.get(it.id).sender, 'guptapartnersteam@gmail.com');
  OUT.editItem(it.id, { sender: 'gupta.mohil@gmail.com' });
  assert.equal(OUT.preflight(it.id, 'email').from, 'gupta.mohil@gmail.com');
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  const first = OUT.get(it.id).messages[0];
  assert.equal(first.from, 'gupta.mohil@gmail.com');
  assert.throws(() => OUT.editItem(it.id, { sender: 'guptapartnersteam@gmail.com' }), /follow-ups and replies go from there/);
  await OUT.sendStep(it.id, 'followup1', { confirmed: true });
  assert.equal(OUT.get(it.id).messages[1].from, 'gupta.mohil@gmail.com');
  assert.equal(OUT.get(it.id).messages[1].threadId, first.threadId);
  // the other account's default is unchanged; both calendars count
  assert.equal(OUT.settings().defaultSender, 'guptapartnersteam@gmail.com');
  GM.fake.busy.push({ start: '2026-11-09T14:00:00Z', end: '2026-11-09T15:00:00Z', account: 'gupta.mohil@gmail.com' });
  const r = await OUT.openSlots();
  assert.match(r.note, /guptapartnersteam@gmail\.com and gupta\.mohil@gmail\.com|gupta\.mohil@gmail\.com and guptapartnersteam@gmail\.com/);
  assert.ok(!r.slots.some(x => x.start === '2026-11-09T14:00:00.000Z'));
  OUT.setSettings({ defaultSender: 'gupta.mohil@gmail.com' });
  assert.equal(OUT.settings().defaultSender, 'gupta.mohil@gmail.com');
  OUT.setSettings({ defaultSender: 'guptapartnersteam@gmail.com' });
});

test('a conversation keeps going: answer → they pick an offered time → AION catches the second reply and the pick', async () => {
  const e3 = { ...e, id: 'e31', company: 'Third Brand Partners', website: 'https://thirdbrand.com', contactInfo: [{ person: 'Ann Lee', kind: 'email', value: 'ann@thirdbrand.com', verified: true }] };
  s.entities.push(e3); MEM.ingest(s);
  const it = await OUT.createDraft({ s, e: e3, model: 'x', cwd: dir, engineFn: fakeAI });
  await wait(() => OUT.get(it.id).phase !== 'writing');
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  const tid = OUT.get(it.id).messages[0].threadId;
  GM.fake.threads[tid].push({ id: 'ann1', from: 'Ann Lee <ann@thirdbrand.com>', subject: 'Re', body: 'Happy to talk. Next Tuesday afternoon?', at: new Date().toISOString() });
  assert.ok(await OUT.syncReplies() >= 1);
  assert.equal(OUT.get(it.id).replied.kind, 'interested');
  assert.match(OUT.board().find(b => b.name.startsWith('Example Cooling')).status, /call booked|files/); // later messages in a booked thread keep the call visible
  const ai = async ({ prompt }) => { assert.match(prompt, /No sign-off/); assert.match(prompt, /suggested/); return { text: JSON.stringify({ body: 'Hi Ann,\n\nTuesday works. Pick a time below.\n\nBest,\nMohil' }) }; };
  const d = await OUT.draftAnswer(it.id, { model: 'x', cwd: dir, engineFn: ai });
  assert.doesNotMatch(d.drafts.answer.body, /Best,/); // the footer carries the signature
  assert.ok(d.offered.length >= 1);
  await OUT.sendAnswer(it.id, { confirmed: true });
  assert.equal(OUT.get(it.id).phase, 'conversation');
  const pick = OUT.get(it.id).offered[0], et = new Date(pick.start);
  const day = et.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' }), hr = et.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }).toLowerCase().replace(':00', '');
  GM.fake.threads[tid].push({ id: 'ann2', from: 'Ann Lee <ann@thirdbrand.com>', subject: 'Re', body: `${day} at ${hr} works for me.`, at: new Date().toISOString() });
  assert.equal(await OUT.syncReplies(), 1);
  const x = OUT.get(it.id);
  assert.equal(x.replied.picked?.start, pick.start); assert.match(x.status, /Picked a time/); assert.equal(x.earlier.length, 1);
  assert.equal(await OUT.syncReplies(), 0); // the same reply is never counted twice
});

test('outreach refuses firms already listed for sale (proprietary only)', async () => {
  const e4 = { ...e, id: 'e41', company: 'Listed Co', website: 'https://listedco.com', listed: true };
  s.entities.push(e4); MEM.ingest(s);
  await assert.rejects(OUT.createDraft({ s, e: e4, model: 'x', cwd: dir, engineFn: fakeAI }), /listed for sale/);
});

test('a failed draft can be written again, with a different offer, and drafts cut off by a restart start again', async () => {
  const e3 = { ...e, id: 'eretry', company: 'Retry Heating', website: 'https://retry.test', contactInfo: [{ kind: 'email', value: 'a@retry.test', verified: true }] }; s.entities.push(e3);
  const boom = async () => { throw new Error('AI is busy'); };
  const it = await OUT.createDraft({ s, e: e3, model: 'x', cwd: dir, engineFn: boom });
  await wait(() => OUT.get(it.id).phase !== 'writing');
  assert.equal(OUT.get(it.id).phase, 'failed');
  // pressing Write outreach again on a failed one rewrites it instead of refusing
  let prompt = '';
  const again = await OUT.createDraft({ s, e: e3, model: 'x', cwd: dir, engineFn: async a => { prompt = a.prompt; return fakeAI(a); } });
  assert.equal(again.id, it.id);
  await wait(() => OUT.get(it.id).phase !== 'writing');
  assert.equal(OUT.get(it.id).phase, 'review');
  // switch the offer: every draft rewritten for a majority stake
  OUT.rewrite(it.id, { s, pitch: 'majority', model: 'x', cwd: dir, engineFn: async a => { prompt = a.prompt; return fakeAI(a); } });
  await wait(() => OUT.get(it.id).phase !== 'writing');
  assert.equal(OUT.get(it.id).pitch, 'majority'); assert.match(prompt, /majority stake/); assert.match(prompt, /Tailored to the offer/);
  // a draft left in "writing" (AION stopped mid-way) is picked up again
  OUT.get(it.id).phase = 'writing'; OUT.get(it.id).startedAt = new Date().toISOString();
  assert.equal(OUT.resumeWriting({ model: 'x', cwd: dir, engineFn: fakeAI, load: () => s }), 1);
  await wait(() => OUT.get(it.id).phase !== 'writing');
  assert.equal(OUT.get(it.id).phase, 'review');
});
