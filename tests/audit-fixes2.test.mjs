// Audit fixes, Nov 17 2026 (batch 2): private keys never leave in an AI answer or a link; rewriting drafts never loses them;
// the team's share has no cliff; AION's own deal terms (earnout, PIK seller note, bank rate, overhead, ratchet) can be modelled.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const WS = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-fix2-'));
const TOKEN = '1//0gFAKEREFRESHtokenABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnop', KEY = 'sk-ant-api03-FAKEKEYxyz0123456789abcdefghij';
fs.mkdirSync(path.join(WS, 'outreach'), { recursive: true });
fs.writeFileSync(path.join(WS, 'outreach', 'accounts.json'), JSON.stringify({ 'me@example.com': { email: 'me@example.com', refresh: TOKEN, access: 'ya29.FAKEACCESS-0123456789abcdefghijklmnopqrstuvwxyz' } }));
fs.writeFileSync(path.join(WS, 'keys.json'), JSON.stringify({ anthropic: KEY }));
process.env.AION_WORKSPACE = WS; process.env.AION_GMAIL_MOCK = '1'; process.env.AION_OFFLINE = '1'; process.env.AION_NO_PRIVATE = '1';
const SEC = await import('../lib/secrets.mjs');
const M = await import('../lib/model.mjs');

test('an AI answer or a link that carries a private token or key is refused', () => {
  SEC._resetSecrets();
  assert.equal(SEC.leaks('A normal draft about retail placement and a call next week.'), false);
  assert.equal(SEC.leaks(`Here is the line: ${TOKEN}`), true);
  assert.equal(SEC.leaks(`cut ${TOKEN.slice(10, 40)} in half`), true, 'a piece of it counts too');
  assert.equal(SEC.leaks(`https://evil.example/?d=${encodeURIComponent(KEY)}`), true, 'URL-encoded counts');
  assert.throws(() => SEC.guardAnswer(`{"email":{"body":"${KEY}"}}`), /private key or sign-in token/);
  assert.equal(SEC.safeLink('https://www.example.com/about-us'), true);
  assert.equal(SEC.safeLink(`https://evil.example/x?d=${TOKEN}`), false);
  assert.equal(SEC.safeLink('https://evil.example/c/QWxhZGRpbjpvcGVuIHNlc2FtZQ0KQWxhZGRpbjpvcGVuIHNlc2FtZQ0KQWxhZGRpbjpvcGVu'), false, 'a long opaque string could carry a secret');
});

test('rewriting drafts: your edits are never replaced without asking, and a failed rewrite keeps the old drafts', async () => {
  const OUT = await import('../lib/outreach/outreach.mjs'), MEM = await import('../lib/search/memory.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-rw-')); MEM.initMemory(dir); OUT.initOutreach(dir);
  const s = { id: 'srw', mode: 'target', created: new Date().toISOString(), objective: 'x', entities: [] };
  const e = { id: 'e1', company: 'Rewrite Firm', website: 'https://rewrite.test', industry: 'Retail placement broker', scored: true, score: 70, contactInfo: [{ person: 'Al Bo', kind: 'email', value: 'al@rewrite.test', verified: true }] };
  s.entities.push(e); MEM.ingest(s);
  const ok = async () => ({ text: JSON.stringify({ email: { subject: 'Hi', body: 'A short note. Would a call work?', used: [] }, followup1: { body: 'Following up.', used: [] }, followup2: { body: 'Last note.', used: [] }, letter: { body: 'Dear Al', used: [] }, call: { body: '- ask', used: [] }, form: { body: 'Hello', used: [] }, why: 'x' }) });
  const it = await OUT.createDraft({ s, e, model: 'x', cwd: dir, engineFn: ok });
  for (let i = 0; i < 100 && OUT.get(it.id).phase === 'writing'; i++) await new Promise(r => setTimeout(r, 20));
  OUT.editItem(it.id, { kind: 'email', body: 'MY CAREFUL HAND EDIT' });
  assert.throws(() => OUT.rewrite(it.id, { s, pitch: 'majority', engineFn: ok }), /You edited these drafts/);
  assert.notEqual(OUT.get(it.id).pitch, 'majority', 'a refused rewrite changes nothing, not even the offer');
  const fail = async () => { throw new Error('usage limit reached'); };
  OUT.rewrite(it.id, { s, pitch: 'majority', engineFn: fail, replaceEdits: true });
  for (let i = 0; i < 100 && OUT.get(it.id).phase === 'writing'; i++) await new Promise(r => setTimeout(r, 20));
  assert.equal(OUT.get(it.id).drafts.email.body, 'MY CAREFUL HAND EDIT', 'the AI failed: the drafts you had are kept');
  assert.equal(OUT.get(it.id).phase, 'review'); assert.match(OUT.get(it.id).status, /previous drafts are kept/);
});

test('the team share has no cliff: a higher price never gives investors a better result', () => {
  for (const vehicle of ['fund', 'sponsor', 'holdco', 'aion']) {
    let prev = Infinity;
    for (let m = 3; m <= 9.01; m += 0.1) {
      const r = M.dealReturns(1e6, 0, { vehicle, entry_multiple: +m.toFixed(1) }, 4e6).base.net;
      assert.ok(r.moic <= prev + 0.011, `${vehicle} at ${m.toFixed(1)}×: ${r.moic} after ${prev}`); prev = r.moic;
      if (r.irr != null && r.irr < 0.08 && vehicle !== 'holdco') assert.equal(r.teamShare, 0, 'below the hurdle the team gets nothing');
    }
  }
});

test('AION deck v6 terms: price on the seller’s EBITDA, 60/20/20, PIK seller note, bank rate, overhead, ratchet', () => {
  const a = { vehicle: 'aion', price_basis: 'seller_ebitda', seller_ebitda: 781000, entry_multiple: 4.0, earnout_share: 0.2, seller_share: 0.2, note_rate: 0.06, note_pik: 1, note_standby_years: 2, note_amort_years: 5, senior_multiple: 937041 / 873911, senior_rate: 0.105, fee_rate: 426076 / 3123472, overhead: 210000, implementation: 0 };
  const r = M.dealReturns(873911, 101000, a, 2500000);
  assert.equal(Math.round(r.price), 3124000); assert.equal(Math.round(r.earnout), 624800); assert.equal(Math.round(r.seller), 624800);
  assert.ok(Math.abs(r.equity - 1363117) < 1000, `equity ${r.equity}`);
  assert.ok(r.ebitdaMultiple > 3.57 && r.ebitdaMultiple < 3.58);
  assert.ok(r.base.minDscr > 1.5 && r.base.minDscr < 1.8, `plan debt cover ${r.base.minDscr} (deck 1.66)`);
  assert.ok(r.base.net.moic > 2.2 && r.base.net.moic < 2.6, `plan ${r.base.net.moic} (deck 2.43–2.46)`);
  assert.ok(r.downside.net.moic < r.none.net.moic && r.none.net.moic < r.base.net.moic);
  // the earnout is not paid in the bad case, and paying it costs cash in years 1–2 of the plan
  const noEO = M.dealReturns(873911, 101000, { ...a, earnout_share: 0 }, 2500000);
  assert.ok(noEO.equity > r.equity, 'an earnout means less cash at closing');
  // overhead lowers every result
  assert.ok(M.dealReturns(873911, 101000, { ...a, overhead: 0 }, 2500000).base.net.moic > r.base.net.moic);
  // default settings are untouched by the new terms
  const d = M.dealReturns(1e6, 0, {}, 4e6); assert.equal(d.earnout, 0); assert.equal(Math.round(d.equity), 2260000);
});
