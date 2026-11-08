// Outreach end to end against a fake Gmail and a fake AI: signals → personal drafts → checks → send (only when
// confirmed) → deal stage → follow-up in the same thread → reply detected → opt-out never emailed again.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.AION_GMAIL_MOCK = '1'; process.env.AION_OFFLINE = '1'; process.env.AION_SENDERS = 'sender-one@example.com,sender-two@example.com';
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
  assert.equal(it.sender, 'sender-one@example.com');
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
  GM.connectUrl(8765, 'sender-one@example.com');
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
  await assert.rejects(OUT.sendDoc(id, 'nda', { confirmed: true, pdf: Buffer.from('%PDF-1.4 test') }), /already sent/); // the same version never goes twice
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

test('both senders: pick sender-two for a firm, its thread stays there, and busy times come from both calendars', async () => {
  GM.connectUrl(8765, 'sender-two@example.com');
  assert.deepEqual(GM.accounts().map(a => a.email).sort(), ['sender-two@example.com', 'sender-one@example.com']);
  const e3 = { ...e, id: 'e3', company: 'Third Firm', website: 'https://thirdfirm.com', contactInfo: [{ kind: 'email', value: 'owner@thirdfirm.com', verified: true }] };
  s.entities.push(e3); MEM.ingest(s);
  const it = await OUT.createDraft({ s, e: e3, model: 'x', cwd: dir, engineFn: fakeAI });
  await wait(() => OUT.get(it.id).phase !== 'writing');
  assert.equal(OUT.get(it.id).sender, 'sender-one@example.com');
  OUT.editItem(it.id, { sender: 'sender-two@example.com' });
  assert.equal(OUT.preflight(it.id, 'email').from, 'sender-two@example.com');
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  const first = OUT.get(it.id).messages[0];
  assert.equal(first.from, 'sender-two@example.com');
  assert.throws(() => OUT.editItem(it.id, { sender: 'sender-one@example.com' }), /follow-ups and replies go from there/);
  await OUT.sendStep(it.id, 'followup1', { confirmed: true });
  assert.equal(OUT.get(it.id).messages[1].from, 'sender-two@example.com');
  assert.equal(OUT.get(it.id).messages[1].threadId, first.threadId);
  // the other account's default is unchanged; both calendars count
  assert.equal(OUT.settings().defaultSender, 'sender-one@example.com');
  GM.fake.busy.push({ start: '2026-11-09T14:00:00Z', end: '2026-11-09T15:00:00Z', account: 'sender-two@example.com' });
  const r = await OUT.openSlots();
  assert.match(r.note, /sender-one@example\.com and sender-two@example\.com|sender-two@example\.com and sender-one@example\.com/);
  assert.ok(!r.slots.some(x => x.start === '2026-11-09T14:00:00.000Z'));
  OUT.setSettings({ defaultSender: 'sender-two@example.com' });
  assert.equal(OUT.settings().defaultSender, 'sender-two@example.com');
  OUT.setSettings({ defaultSender: 'sender-one@example.com' });
});

test('a conversation keeps going: answer → they pick an offered time → AION catches the second reply and the pick', async () => {
  const e3 = { ...e, id: 'e31', company: 'Third Brand Partners', website: 'https://thirdbrand.com', owner: 'Ann Lee', contacts: [{ name: 'Ann Lee', title: 'Owner' }], contactInfo: [{ person: 'Ann Lee', kind: 'email', value: 'ann@thirdbrand.com', verified: true }] };
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
  assert.equal(OUT.get(it.id).drafts.answer, undefined); // sent: "Send reply" can't send it again
  await assert.rejects(OUT.sendAnswer(it.id, { confirmed: true }), /Nothing to send/);
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

test('not a template: sentences shared with another firm’s email are caught; the honest status line is allowed', async () => {
  const { sharedLines } = await import('../lib/outreach/outreach.mjs');
  const other = 'Hi Ann, Northfield has added three retail leads this year. We would buy most of the firm while you keep running it. AION has not bought a firm yet.';
  const mine = 'Hi Bo, your Costco roadshows stand out. We would buy most of the firm while you keep running it. AION has not bought a firm yet.';
  const hit = sharedLines(mine, [other], ['AION has not bought a firm yet.']);
  assert.deepEqual(hit, ['We would buy most of the firm while you keep running it.']);
  assert.deepEqual(sharedLines('Hi Bo, your Costco roadshows stand out.', [other]), []);
});

test('owner email: the firm’s format gives a likely address that is never used until you choose it', async () => {
  assert.equal(OUT.formatOf('Michael Horstmann', 'mhorstmann@acme.test'), '{f}{last}');
  assert.equal(OUT.applyFormat('{f}{last}', 'Jane Roe', 'acme.test'), 'jroe@acme.test');
  const e2 = { id: 'e2', company: 'Northfield Brokers', website: 'https://northfield.test', owner: 'Jane Roe', founded: '2002', scored: true, score: 70, industry: 'Food broker',
    contactInfo: [{ person: 'Company', kind: 'email', value: 'info@northfield.test', verified: true, url: 'https://northfield.test' }], contacts: [{ name: 'Jane Roe', title: 'Founder' }] };
  s.entities.push(e2);
  const it = await OUT.createDraft({ s, e: e2, model: 'x', cwd: dir, engineFn: fakeAI }); await wait(() => it.phase !== 'writing');
  // their site shows a teammate's own address, so AION learns the format ({first}.{last}) and applies it to the owner
  const html = '<a href="/team">Team</a> Sam Lee, account lead: <a href="mailto:sam.lee@northfield.test">sam.lee@northfield.test</a> Write to info@northfield.test';
  const r = await OUT.findEmail(it.id, { fetcher: async () => html, hunterKey: '' });
  const likely = r.contacts.emails.find(x => x.likely);
  assert.equal(likely?.email, 'jane.roe@northfield.test'); assert.match(likely.source, /format/);
  assert.notEqual(r.to, 'jane.roe@northfield.test'); // only you pick a likely address
});

test('a bounced likely address is never suggested again; the next format is offered', async () => {
  const item = OUT.get(JSON.parse(fs.readFileSync(path.join(dir, 'outreach.json'), 'utf8')).items.find(x => x.name === 'Northfield Brokers').id);
  item.badEmails = ['jane.roe@northfield.test']; item.contacts.emails = item.contacts.emails.filter(x => !x.likely);
  const r = await OUT.findEmail(item.id, { fetcher: async () => '<p>Write to info@northfield.test</p>', hunterKey: '' });
  const likely = r.contacts.emails.find(x => x.likely);
  assert.ok(likely, 'a new likely address'); assert.notEqual(likely.email, 'jane.roe@northfield.test');
});

test('placeholder website text is never turned into an email address', async () => {
  const item = OUT.get(JSON.parse(fs.readFileSync(path.join(dir, 'outreach.json'), 'utf8')).items.find(x => x.name === 'Northfield Brokers').id);
  const keep = item.website; item.website = 'Not found in public sources reviewed.';
  await assert.rejects(OUT.findEmail(item.id, { fetcher: async () => '', hunterKey: '' }), /no website/);
  item.website = keep;
});

test('no owner email: the discreet note can go to info@, the selling email never can', async () => {
  const item = OUT.get(JSON.parse(fs.readFileSync(path.join(dir, 'outreach.json'), 'utf8')).items.find(x => x.name === 'Northfield Brokers').id);
  OUT.editItem(item.id, { to: 'info@northfield.test' });
  assert.ok(!OUT.preflight(item.id, 'email').ok, 'selling email to a shared inbox stays blocked');
  const pf = OUT.preflight(item.id, 'form');
  assert.ok(pf.ok, pf.problems.join('; ')); assert.match(pf.subject, /^For Jane/); assert.match(pf.warn, /discreet note/);
  const r = await OUT.sendStep(item.id, 'form', { confirmed: true });
  assert.ok(r.sent); assert.equal(OUT.get(item.id).messages.at(-1).kind, 'form');
  assert.ok(!OUT.preflight(item.id, 'form').ok, 'only once');
});

test('a note that talks about buying the firm can never go to a shared inbox', async () => {
  const { SALE_TALK } = OUT;
  assert.ok(SALE_TALK.test('We would buy a majority of Example Growth Co')); assert.ok(SALE_TALK.test('the kind of brokerage AION hopes to acquire'));
  assert.ok(!SALE_TALK.test('Hello, this note is for Jane. Could she spare 15 minutes this month, or share her direct email?'));
});

test('a “yes” that quotes our footer is interested, never an opt-out', () => {
  const quoted = 'Yes, happy to talk next week.\n\nOn Mon, Nov 3, 2026 at 9:00 AM Sam Sender <sender@example.test> wrote:\n> Hi Pat,\n> If you\'d rather not hear from me, just reply "no thanks" and I won\'t write again.';
  assert.equal(OUT.classify(OUT.newText(quoted)), 'interested');
  const wrapped = 'Sure, call me Tuesday.\r\nOn Mon, Nov 3, 2026 at 9:00 AM Sam Sender <\r\nsender@example.test> wrote:\r\n\r\nnot interested in selling? reply no thanks';
  assert.equal(OUT.classify(OUT.newText(wrapped)), 'interested');
  const outlook = 'Open to a chat.\n\nFrom: Sam Sender <sender@example.test>\nSent: Monday, November 3, 2026 9:00 AM\nSubject: Hello\nreply "no thanks" to stop';
  assert.equal(OUT.classify(OUT.newText(outlook)), 'interested');
  assert.equal(OUT.classify(OUT.newText('No thanks.\n\nOn Mon wrote:\n> happy to talk?')), 'optout');
});

test('sync: a quoted footer in an interested reply does not suppress the owner', async () => {
  const e9 = { ...e, id: 'e9', company: 'Quoted Reply Co', website: 'https://quotedreply.test', contactInfo: [{ kind: 'email', value: 'owner@quotedreply.test', verified: true }] };
  s.entities.push(e9); MEM.ingest(s);
  const it = await OUT.createDraft({ s, e: e9, model: 'x', cwd: dir, engineFn: fakeAI });
  await wait(() => OUT.get(it.id).phase !== 'writing');
  await OUT.sendStep(it.id, 'email', { confirmed: true });
  const sent = OUT.get(it.id).messages[0];
  GM.fake.threads[sent.threadId].push({ id: 'their3', from: 'owner@quotedreply.test', subject: `Re: ${sent.subject}`, body: `Yes, happy to talk.\n\nOn Mon, Nov 3, 2026 at 9:00 AM Sam <sender@example.test> wrote:\n> ${sent.body.split('\n').join('\n> ')}`, at: new Date().toISOString() });
  await OUT.syncReplies();
  assert.equal(OUT.get(it.id).replied.kind, 'interested');
  assert.notEqual(OUT.get(it.id).phase, 'finished');
  assert.ok(!OUT.suppressed().includes('owner@quotedreply.test'));
  assert.doesNotMatch(OUT.get(it.id).replied.text, /no thanks/);
});

test('two sends of the same email at once: only one goes out', async () => {
  const e8 = { ...e, id: 'e8', company: 'Double Click Co', website: 'https://doubleclick.test', contactInfo: [{ kind: 'email', value: 'owner@doubleclick.test', verified: true }] };
  s.entities.push(e8); MEM.ingest(s);
  const it = await OUT.createDraft({ s, e: e8, model: 'x', cwd: dir, engineFn: fakeAI });
  await wait(() => OUT.get(it.id).phase !== 'writing');
  const r = await Promise.allSettled([OUT.sendStep(it.id, 'email', { confirmed: true }), OUT.sendStep(it.id, 'email', { confirmed: true })]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(OUT.get(it.id).messages.filter(m => m.kind === 'email').length, 1);
});

test('the server-side confirm code matches exactly what was previewed, and works once', async () => {
  const C = await import('../lib/outreach/confirm.mjs');
  const c = { from: 'a@example.test', to: 'b@example.test', subject: 'Hi', body: 'Text' };
  const t = C.issue('step:o1:email', c);
  assert.throws(() => C.take('wrong', 'step:o1:email', c), /confirm this send again/);
  assert.throws(() => C.take(t, 'step:o2:email', c), /confirm this send again/);
  C.take(t, 'step:o1:email', c);
  assert.throws(() => C.take(t, 'step:o1:email', c), /confirm this send again/); // used up
  const t2 = C.issue('step:o1:email', c);
  assert.throws(() => C.take(t2, 'step:o1:email', { ...c, body: 'Changed' }), /changed after you confirmed/);
});

test('the same firm from another search is never drafted twice; an opt-out blocks the whole firm domain', async () => {
  const s2 = { ...s, id: 'stest2', entities: [] };
  const twin = { ...e, id: 'x1' }; s2.entities.push(twin); MEM.ingest(s2);
  await assert.rejects(OUT.createDraft({ s: s2, e: twin, model: 'x', cwd: dir, engineFn: fakeAI }), /already have outreach/);
  // otherair.com said "no thanks" earlier: info@ at that firm and a new search result for it are both blocked
  assert.ok(OUT.isSuppressed('info@otherair.com'));
  assert.ok(OUT.isSuppressed('', 'https://www.otherair.com/about'));
  assert.ok(!OUT.isSuppressed('someone@gmail.com'));
  const again = { ...e, id: 'x2', company: 'Other Air LLC', website: 'https://otherair.com', contactInfo: [{ kind: 'email', value: 'info@otherair.com', verified: true }] };
  s2.entities.push(again); MEM.ingest(s2);
  await assert.rejects(OUT.createDraft({ s: s2, e: again, model: 'x', cwd: dir, engineFn: fakeAI }), /already have outreach|asked not to be contacted/);
});

test('a Hunter.io address it did not check as deliverable is a guess, never chosen for you', async () => {
  const e7 = { id: 'e7', company: 'Hunter Test Co', website: 'https://huntertest.test', owner: 'Pat Example', founded: '2010', scored: true, score: 70, industry: 'Marketplace agency',
    contactInfo: [], contacts: [{ name: 'Pat Example', title: 'Founder' }] };
  s.entities.push(e7);
  const it = await OUT.createDraft({ s, e: e7, model: 'x', cwd: dir, engineFn: fakeAI }); await wait(() => OUT.get(it.id).phase !== 'writing');
  const real = globalThis.fetch;
  globalThis.fetch = async url => { assert.match(String(url), /^https:\/\/api\.hunter\.io\//); return new Response(JSON.stringify({ data: { email: 'pat@huntertest.test', score: 91, verification: { status: 'accept_all' } } }), { status: 200 }); };
  try {
    const r = await OUT.findEmail(it.id, { fetcher: async () => '', hunterKey: 'test-key' });
    const h = r.contacts.emails.find(x => x.email === 'pat@huntertest.test');
    assert.ok(h?.likely); assert.match(h.source, /not checked/);
    assert.notEqual(r.to, 'pat@huntertest.test');
    OUT.editItem(it.id, { to: 'pat@huntertest.test' });
    assert.match(OUT.preflight(it.id, 'email').warn, /is a guess/);
  } finally { globalThis.fetch = real; }
});

test('the daily send limit counts your local day, not the UTC day', () => {
  // 9 pm Eastern on Nov 3 is already Nov 4 in UTC
  assert.equal(OUT.localDay('2026-11-04T02:00:00Z', 'America/New_York'), '2026-11-03');
  assert.equal(OUT.localDay('2026-11-04T06:00:00Z', 'America/New_York'), '2026-11-04');
});
