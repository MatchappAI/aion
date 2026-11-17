// Audit fixes, Nov 17 2026 (batch 4, low items): unsubscribe header, real time-zone names, private addresses refused,
// search ids, calendar invites on weekends or in the past, and the same ranking order every time.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.AION_GMAIL_MOCK = '1'; process.env.AION_OFFLINE = '1';
const GM = await import('../lib/outreach/gmail.mjs');
const { isPublic, resolvesPublic } = await import('../lib/pages.mjs');
const { rankAll } = await import('../lib/search/rank.mjs');

test('outreach email carries a List-Unsubscribe header; a reply does not', () => {
  const m = GM.mime({ from: 'me@example.com', to: 'owner@firm.test', subject: 'Hi', body: 'x', unsubscribe: true });
  assert.match(m, /List-Unsubscribe: <mailto:me@example\.com\?subject=unsubscribe>/);
  assert.doesNotMatch(GM.mime({ from: 'me@example.com', to: 'owner@firm.test', subject: 'Re: Hi', body: 'x' }), /List-Unsubscribe/);
});

test('local and private addresses are never fetched, including by their numbers', async () => {
  for (const u of ['http://127.0.0.1/', 'http://localhost:8765/', 'http://192.168.1.4/', 'http://[::1]/', 'http://10.0.0.2/']) {
    assert.equal(isPublic(u), false, u); assert.equal(await resolvesPublic(u), false, u);
  }
});

test('only real searches can be archived (not the network memory, radar or watch lists)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-st-'));
  const ST = await import('../lib/search/store.mjs'); ST.initStore?.(dir);
  assert.equal(ST.archiveSearch('network'), false); assert.equal(ST.archiveSearch('radar'), false); assert.equal(ST.archiveSearch('../outreach'), false);
});

test('calendar invites: a weekend or past time is refused before you confirm', async () => {
  const OUT = await import('../lib/outreach/outreach.mjs'), MEM = await import('../lib/search/memory.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-inv-')); MEM.initMemory(dir); OUT.initOutreach(dir);
  const s = { id: 'sinv', mode: 'target', created: new Date().toISOString(), objective: 'x', entities: [{ id: 'e1', company: 'Invite Firm', website: 'https://invite.test', scored: true, score: 60, contactInfo: [{ person: 'Al Bo', kind: 'email', value: 'al@invite.test', verified: true }] }] };
  MEM.ingest(s);
  const it = await OUT.createDraft({ s, e: s.entities[0], model: 'x', cwd: dir, engineFn: async () => ({ text: JSON.stringify({ email: { subject: 'Hi', body: 'Note. A call?', used: [] }, why: 'x' }) }) });
  assert.match(OUT.sendContent(it.id, 'invite', null, { start: new Date(Date.now() - 3600_000).toISOString() }).problems.join(), /future/);
  const sat = new Date(); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7)); sat.setHours(17, 0, 0, 0); // a Saturday, 5 pm UTC = midday ET
  assert.match(OUT.sendContent(it.id, 'invite', null, { start: sat.toISOString() }).problems.join(), /weekday/);
  assert.match(OUT.slotLabel('2026-12-01T15:00:00Z'), /\b(ET|EST|EDT)\b/);
});

test('ranking: exact ties come out in the same order whatever order the searches are read in', () => {
  const mk = (sid, name) => ({ id: sid, mode: 'target', created: '2026-11-01', entities: [{ id: 'e1', company: name, website: `https://${name.toLowerCase().replace(/\s/g, '')}.test`, scored: true, score: 50, industry: 'Retail placement brokerage', location: 'Austin, TX', size: '20 employees', ownership: 'Founder-owned' }] });
  const a = [mk('s0001', 'Bravo Brokers'), mk('s0002', 'Alpha Brokers'), mk('s0003', 'Charlie Brokers')];
  const n1 = rankAll(a).ranked.map(x => x.name), n2 = rankAll([...a].reverse()).ranked.map(x => x.name);
  assert.deepEqual(n1, n2);
});
