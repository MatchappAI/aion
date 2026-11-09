import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signalStrength, tierOf, careerSign } from '../lib/search/strength.mjs';
import { rankOne } from '../lib/search/rank.mjs';
import { ownerEvents, headlineEvents } from '../lib/search/radar.mjs';
import { aiTells } from '../lib/outreach/outreach.mjs';

const now = new Date('2026-11-08');
const sig = (key, extra = {}) => ({ key, label: key, text: `${key} seen`, url: `https://firm.com/${key}`, confidence: 'likely', direction: 'for', date: '2026-09', age: 2, ...extra });

test('a sign counts only when recent, sourced and about the firm; AI talk and alliances never count', () => {
  assert.equal(tierOf(sig('ai_interest')), null);
  assert.equal(tierOf(sig('alliance')), null);
  assert.equal(tierOf(sig('retirement', { age: 30, date: '2024-05' })), null, 'older than 18 months');
  assert.equal(tierOf(sig('retirement', { url: '' })), null, 'no source');
  assert.equal(tierOf(sig('next_chapter', { date: '', age: null, url: 'https://news.example.com/x' }), 'firm.com'), null, 'undated and not their site');
  assert.deepEqual(tierOf(sig('next_chapter', { date: '', age: null }), 'firm.com'), { dir: 'sell', tier: 'strong' });
  assert.deepEqual(tierOf(sig('succession', { confidence: 'possible' })), { dir: 'sell', tier: 'medium' }, 'possible is never strong');
  assert.deepEqual(tierOf(sig('sale_stated', { age: 40, date: '2023-07' })), { dir: 'sell', tier: 'medium', past: true }, 'an old sale announcement is past interest only');
  assert.deepEqual(tierOf(sig('fast_growth')), { dir: 'grow', tier: 'medium' });
});

test('strong = at least one clear sign; supporting signs alone never qualify; hires never count; a reason to wait wins', () => {
  assert.equal(signalStrength([sig('retirement')], {}, null, now).strong, true);
  const sup = signalStrength([sig('going_quiet'), sig('capstone'), sig('career_length')], {}, null, now); assert.equal(sup.strong, false); assert.match(sup.missing[0], /Only supporting signs/);
  for (const k of ['second_in_command', 'growth_hiring', 'first_cfo', 'new_service', 'ai_interest']) assert.equal(tierOf(sig(k)), null, k);
  const g = signalStrength([sig('recap_interest'), sig('new_office')], {}, null, now); assert.equal(g.dir, 'grow'); assert.equal(g.strong, true);
  assert.equal(signalStrength([sig('retirement'), sig('other', { direction: 'against', age: 3 }), sig('other', { direction: 'against', age: 2, text: 'team grew' })], {}, null, now).strong, false);
  assert.match(signalStrength([], {}, null, now).missing[0], /No clear sign/);
  assert.equal(tierOf(sig('retirement', { text: "After Ken's retirement, in 2021, Liz and Cal became the new owners of STAR." })), null, 'a completed handover is history');
});

test('founder died: a clear sign, but never in the first 3 months; read from found facts or an obituary headline', () => {
  assert.equal(signalStrength([sig('founder_died', { age: 8, date: '2026-03' })], {}, null, now).strong, true);
  const soon = signalStrength([sig('founder_died', { age: 1, date: '2026-10' })], {}, null, now); assert.equal(soon.strong, false); assert.match(soon.missing[0], /wait at least 3 months/);
  const d = signalStrength([], { owner: 'Bob Smith (deceased)', website: 'acme.com' }, null, now); assert.equal(d.counted[0].key, 'founder_died'); assert.equal(d.strong, true);
  // a namesake's obituary is never taken as the founder's death: the headline must name the firm
  assert.equal(ownerEvents('Bob Smith', 'Acme Brokers', [{ title: 'Bob Smith Obituary - Richmond, VA - Dignity Memorial', url: 'https://legacy.com/x', date: '2026-02' }]).length, 0);
  const ev = ownerEvents('Bob Smith', 'Acme Brokers', [{ title: 'Bob Smith, founder of Acme Brokers, obituary', url: 'https://legacy.com/y', date: '2026-02' }]);
  assert.deepEqual(ev.map(x => x.signal), ['founder_died']);
});

test('20+ years with the founder still running it is a medium sell sign, from facts already found', () => {
  const e = { founded: '1998', ownership: 'Founder-owned', website: 'acme.com' };
  assert.equal(careerSign(e, 'Jane Roe', now).key, 'career_length');
  assert.equal(careerSign({ ...e, founded: '2015' }, 'Jane Roe', now), null);
  assert.equal(careerSign(e, null, now), null);
});

test('strong fit = clear evidence and not outside the buy box; owner and email show as readiness, not as a gate; the signs set the offer', () => {
  const base = { company: 'Shelf Co', website: 'https://shelfco.com', score: 70, industry: 'Retail placement brokerage for CPG brands', location: 'Richmond, VA', size: '12 employees', ownership: 'Founder-owned', owner: 'Jane Roe' };
  const S = rankOne({ ...base, timing: { signals: [{ ...sig('retirement'), signal: 'retirement', url: 'https://shelfco.com/news', date: '2026-08' }] } });
  assert.equal(S.box.status, 'in', S.box.reasons.join()); assert.equal(S.strongFit, true); assert.equal(S.offer, 'full');
  const G = rankOne({ ...base, timing: { signals: [{ ...sig('recap_interest'), signal: 'recap_interest', text: 'Open to investors to fund the next stage', date: '2026-08' }] } });
  assert.equal(G.strongFit, true); assert.equal(G.offer, 'partner', 'they asked for investors: a partnership');
  const F = rankOne({ ...base, timing: { signals: [{ ...sig('fast_growth'), signal: 'fast_growth', date: '2026-08' }] } });
  assert.equal(F.strongFit, false, 'a fast-growth list alone is only supporting');
  const N = rankOne({ ...base, owner: '', timing: { signals: [{ ...sig('retirement'), signal: 'retirement', date: '2026-08' }] } });
  assert.equal(N.strongFit, true); assert.equal(N.scores.readiness.label, 'Not ready'); assert.match(N.scores.next, /Find who owns it/);
  assert.equal(S.scores.intent.label, 'Documented transition'); assert.equal(S.scores.fit.label, 'Strong');
  const C = rankOne({ ...base, timing: { signals: [{ ...sig('sale_stated'), signal: 'sale_stated', text: 'Founder says she is exploring a sale of the agency', date: '2026-09' }] } });
  assert.equal(C.scores.intent.label, 'Confirmed'); assert.equal(C.scores.intent.explicit, true);
  const Sp = rankOne({ ...base, timing: { signals: [{ ...sig('going_quiet'), signal: 'going_quiet', date: '2026-09' }] } });
  assert.equal(Sp.scores.intent.label, 'Speculative'); assert.equal(Sp.strongFit, false);
  const W = rankOne({ ...base, timing: { signals: [{ ...sig('ai_interest'), signal: 'ai_interest', date: '2026-10' }] } });
  assert.equal(W.strongFit, false);
});

test('owner headlines need the owner named and the firm or trade in the same headline', () => {
  const items = [
    { title: 'Jane Roe retires after 30 years leading CPG brokerage Shelf Co - Grocery Dive', url: 'https://g.com/1', date: '2026-07' },
    { title: 'Jane Roe retires from city council', url: 'https://g.com/2', date: '2026-07' },
    { title: 'Jane Roe joins the board of Retail Brands Alliance', url: 'https://g.com/3', date: '2026-05' },
  ];
  const ev = ownerEvents('Jane Roe', 'Shelf Co', items);
  assert.deepEqual(ev.map(x => x.signal), ['retirement', 'owner_elsewhere']);
  assert.equal(ownerEvents('Jane', 'Shelf Co', items).length, 0, 'a first name alone is not enough');
});

test('firm headlines: a fast-growth list and a finance lead count for a firm to buy', () => {
  const ev = headlineEvents('target', 'Shelf Co', [
    { title: 'Shelf Co named to the Inc. 5000 list of fastest-growing companies', url: 'https://inc.com/x', date: '2026-08' },
    { title: 'Shelf Co hires Sam Lee as chief financial officer', url: 'https://n.com/y', date: '2026-06' },
  ]);
  assert.deepEqual(ev.map(x => x.signal), ['fast_growth', 'first_cfo']);
});

test('drafts that sound like AI are flagged', () => {
  assert.ok(aiTells('I came across your firm and was truly impressed — exciting!').length >= 3);
  assert.deepEqual(aiTells('Saw Shelf Co just moved into Costco. That is a hard door to open.'), []);
});
