// Audit fixes, Nov 17 2026 (batch 3, medium items): spreadsheet bombs, search rules (sold firms, hires, deaths,
// partnership asks, deal-one size), reply reading outside the thread, daily limits, address checks on every send,
// Excel and model warnings, sales-file scaling, short ledgers.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.AION_GMAIL_MOCK = '1'; process.env.AION_OFFLINE = '1'; process.env.AION_NO_PRIVATE = '1'; process.env.AION_SENDERS = 'sender-one@example.com,sender-two@example.com';
import * as XLSX from 'xlsx';
const { sheetRows } = await import('../lib/xlsx-safe.mjs');
const { parseGL } = await import('../lib/gl.mjs');
const { buyBox, soldOf } = await import('../lib/search/buybox.mjs');
const { tierOf, signalStrength } = await import('../lib/search/strength.mjs');
const { explicitPartner, rankOne } = await import('../lib/search/rank.mjs');
const { extraLevers } = await import('../lib/extras.mjs');
const M = await import('../lib/model.mjs');

test('a spreadsheet that declares millions of empty cells is refused fast instead of freezing AION', () => {
  const ws = {}; for (let r = 0; r < 20000; r++) { ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: 'n', v: r }; ws[XLSX.utils.encode_cell({ r, c: 16383 })] = { t: 's', v: 'x' }; }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 19999, c: 16383 } });
  const t = Date.now(); assert.throws(() => sheetRows(ws, { defval: null }), /too large/); assert.ok(Date.now() - t < 3000);
  // one stray cell far to the right does not widen every row
  const ws2 = { A1: { t: 's', v: 'Date' }, B1: { t: 's', v: 'Amount' }, A2: { t: 's', v: '2025-01-05' }, B2: { t: 'n', v: 10 }, XFD9: { t: 's', v: 'print' }, '!ref': 'A1:XFD9' };
  assert.equal(sheetRows(ws2, { defval: null })[0].length, 2);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
  assert.throws(() => parseGL(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'bomb.xlsx'), /too large/);
});

test('search: a firm already bought is set aside, but only when the sentence is about this firm', () => {
  assert.match(soldOf({ company: 'Hinge Global', summary: 'One listing says it was formerly Catalyst Commerce and is now part of the Pattern family.' }), /Pattern/);
  assert.match(soldOf({ company: 'Acme Brokers', ownership: 'Founder-owned until 2024; acquired by Stagwell' }), /Stagwell/);
  assert.equal(soldOf({ company: 'Tiger Retail', summary: 'A Bentonville retail agency in the same niche, The Retail Firm, was acquired by Advantage.' }), null, 'another firm was sold');
  assert.equal(soldOf({ company: 'PLTFRM', summary: 'Presence Marketing was sold to PLTFRM by Vestar Capital in Feb 2025.' }), null, 'this firm was the buyer');
  assert.equal(soldOf({ company: 'Shelf Co', summary: 'Shelf Co was acquired by its founders from the estate in 2019.' }), null, 'a buyout by its own founders is not a sale to someone else');
  assert.equal(buyBox({ company: 'Acme Brokers', ownership: 'Founder-owned until 2024; acquired by Stagwell', location: 'Austin, TX', size: '20 employees' }).status, 'out');
});

test('search: a hire is never a sell sign, even filed as "succession"; a death stops counting once a successor is named', () => {
  const hire = { key: 'succession', direction: 'for', url: 'https://probe.com/news', text: 'Probe Co hired Jane Roe as President and COO', confidence: 'likely', date: '2026-09', age: 2 };
  assert.equal(tierOf(hire, 'probe.com'), null);
  assert.ok(tierOf({ ...hire, text: 'Founder Bob Doe is stepping back; Jane Roe named successor as he retires' }, 'probe.com'));
  const died = { key: 'founder_died', direction: 'for', url: 'https://probe.com/about', text: 'In memory of our founder, who passed away in 2025', confidence: 'likely', date: '2025-06', age: 14 };
  assert.ok(tierOf(died, 'probe.com'));
  assert.equal(tierOf(died, 'probe.com', { successor: true }), null);
  const S = signalStrength([died], { company: 'Probe Co', website: 'https://probe.com', successorNamed: 'yes' });
  assert.ok(!S.counted.some(x => x.key === 'founder_died'));
});

test('search: a partnership ask must be about owners or capital, in the firm’s own words', () => {
  const sig = (text, url = 'https://shelfco.com/about') => [{ key: 'recap_interest', direction: 'for', text, url }];
  assert.equal(explicitPartner(sig('Open to investors to fund the next stage'), 'shelfco.com', 'Shelf Co').length, 1);
  assert.equal(explicitPartner(sig('We are open to new brand partnerships'), 'shelfco.com', 'Shelf Co').length, 0);
  assert.equal(explicitPartner(sig('Always looking for new retail partners'), 'shelfco.com', 'Shelf Co').length, 0);
  assert.equal(explicitPartner(sig('Competitor Acme Group says it is seeking investors', 'https://news.example/acme'), 'shelfco.com', 'Shelf Co').length, 0);
});

test('search: a firm whose headcount points above the $5M profit ceiling is flagged, not hidden', () => {
  const r = rankOne({ company: 'Big Brokers', website: 'https://bigbrokers.com', industry: 'Retail placement brokerage for CPG brands', location: 'Austin, TX', size: '280 employees', ownership: 'Founder-owned', owner: 'Ann Lee', score: 60 });
  assert.equal(r.box.status, 'check'); assert.ok(r.box.reasons.some(x => /\$5M profit ceiling/.test(x)));
});

test('outreach: fresh emails outside the thread are read; a failed reply check holds follow-ups; limits and address rules', async () => {
  const OUT = await import('../lib/outreach/outreach.mjs'), GM = await import('../lib/outreach/gmail.mjs'), MEM = await import('../lib/search/memory.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-f3-')); MEM.initMemory(dir); OUT.initOutreach(dir);
  GM.connectUrl(8765, 'sender-one@example.com'); OUT.setSettings({ address: '1 Main St, Austin, TX' });
  const s = { id: 'sf3', mode: 'target', created: new Date().toISOString(), objective: 'x', entities: [] };
  const ok = async () => ({ text: JSON.stringify({ email: { subject: 'Hi', body: 'A short note. Would a call work?', used: [] }, followup1: { body: 'Following up.', used: [] }, followup2: { body: 'Last note.', used: [] }, letter: { body: 'Dear', used: [] }, call: { body: '- ask', used: [] }, form: { body: 'Hello', used: [] }, why: 'x' }) });
  const mk = async (n, extra = {}) => { const e = { id: `g${n}`, company: `Gamma Firm ${n}`, website: `https://gamma${n}.test`, industry: 'Retail placement broker', scored: true, score: 70, contactInfo: [{ person: 'Lee Roe', kind: 'email', value: `lee@gamma${n}.test`, verified: true }], clientBook: { clients: [{ company: 'Big Brand Co', roles: ['client'], url: `https://gamma${n}.test/clients` }] }, ...extra };
    s.entities.push(e); MEM.ingest(s); const it = await OUT.createDraft({ s, e, model: 'x', cwd: dir, engineFn: ok }); for (let i = 0; i < 100 && OUT.get(it.id).phase === 'writing'; i++) await new Promise(r => setTimeout(r, 20)); return OUT.get(it.id); };
  const a = await mk(1);
  assert.ok(a.signals.some(x => /Names Big Brand Co as a client/.test(x.text)) && !a.signals.some(x => /object Object/.test(x.text)));
  await OUT.sendStep(a.id, 'email', { confirmed: true });
  // they write a brand-new email (not a reply) asking to be removed
  GM.fake.threads.tFresh = [{ id: 'fresh1', from: 'Lee Roe <lee@gamma1.test>', subject: 'Unsubscribe', body: 'Unsubscribe', at: new Date(Date.now() + 1000).toISOString() }];
  await OUT.syncReplies();
  assert.equal(OUT.get(a.id).phase, 'finished'); assert.ok(OUT.isSuppressed('lee@gamma1.test'));
  // To cannot move to someone else once the conversation started
  const b = await mk(2); await OUT.sendStep(b.id, 'email', { confirmed: true });
  assert.throws(() => OUT.editItem(b.id, { to: 'info@gamma2.test' }), /This conversation is with/);
  // replies and requested documents are never held by the cold-email limit
  OUT.setSettings({ dailyCap: 1 });
  OUT.get(b.id).drafts.answer = { body: 'Thanks, here is the list.' }; OUT.get(b.id).replied = { at: new Date().toISOString(), kind: 'interested', text: 'yes' };
  assert.equal(OUT.sendContent(b.id, 'answer').ok, true, OUT.sendContent(b.id, 'answer').problems.join());
  const c = await mk(3); assert.match(OUT.preflight(c.id, 'email').problems.join(), /Today’s limit of 1/);
  OUT.setSettings({ dailyCap: 25, dailyCapAll: 2 });
  assert.match(OUT.preflight(c.id, 'email').problems.join(), /across all your inboxes/);
  OUT.setSettings({ dailyCapAll: 0 });
  assert.throws(() => OUT.setSettings({ followUpDays: [4, 4] }), /different whole numbers/);
  assert.throws(() => OUT.setSettings({ followUpDays: [1.5] }), /whole numbers/);
  // a failed reply check holds a due follow-up (they may have answered)
  await OUT.sendStep(c.id, 'email', { confirmed: true });
  OUT.schedule(c.id, 'followup1', new Date(Date.now() + 2 * 864e5).toISOString(), { confirmed: true });
  OUT.get(c.id).syncError = 'Gmail did not answer';
  assert.equal(await OUT.runScheduled(new Date(Date.now() + 2 * 864e5 + 60_000)), 0);
  assert.match(OUT.get(c.id).scheduled.followup1.waiting, /could not check their replies/);
  // an address no one checked (paid data) is never picked for you
  const d = await mk(4, { contactInfo: [{ person: 'Pat Doe', kind: 'email', value: 'pat@gamma4.test', verified: false }] });
  assert.equal(d.to, '');
});

test('Value Creation: sales files of any length are scaled to a year; SBA and loss warnings; short ledgers count their last month', () => {
  const lv = n => extraLevers({ sales: { analysis: { underGap: 100000, months: n, underCount: 3, under: [] } } }, {}).find(x => x.id === 'discounts').value;
  assert.equal(lv(24), 25000); assert.equal(lv(6), 100000); assert.equal(lv(12), 50000);
  const sba = M.dealReturns(1e6, 0, { vehicle: 'sba' }, 4e6);
  assert.ok(sba.sbaFee > 0 && sba.warn.some(w => /personal guarantee/.test(w)));
  const loss = M.dealReturns(-200000, 0, { price_basis: 'revenue', revenue_multiple: 2.5 }, 4e6);
  assert.ok(loss.warn.some(w => /loses money/.test(w)));
  assert.equal(M.periods({ start: '2025-01-02', end: '2025-12-20' }).monthsCovered, 12);
  assert.equal(M.periods({ start: '2025-01-02', end: '2025-12-20' }).ttm.to, '2025-12');
  assert.equal(M.periods({ start: '2024-01-02', end: '2025-12-10' }).ttm.to, '2025-11', 'a long ledger stopped early in the month still ends at the last full month');
});
