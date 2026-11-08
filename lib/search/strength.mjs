// How strong a firm's signs are that the owner wants to SELL (step back) or to GROW with help, one of the two.
// A sign counts only when it is about this firm or its owner, links to its source, and is recent: dated within 18 months,
// or undated but read from the firm's own current website (or a saved copy of it). Everything else is background:
// shown, never a reason to write now. A strong fit needs at least one clear sign.
import { domainOf } from './resolve.mjs';

// [direction, tier]. "strong" = a clear, high-likelihood sign: enough on its own. "medium" = supporting only: it lifts the
// rank but never makes a firm a strong fit. Keys not listed (hires, a CFO, new services, AI talk, alliances) never count.
export const TIER = {
  // clear: the owner wants to sell some or all of the firm, or the founder has died and the family or partners must decide
  sale_stated: ['sell', 'strong'], mbo: ['sell', 'strong'], steward: ['sell', 'strong'],
  retirement: ['sell', 'strong'], succession: ['sell', 'strong'], exit_planning: ['sell', 'strong'], next_chapter: ['sell', 'strong'], founder_died: ['sell', 'strong'],
  // clear: the firm asks in its own words for an investor, growth capital or a partner
  recap_interest: ['grow', 'strong'],
  // supporting only
  career_length: ['sell', 'medium'], capstone: ['sell', 'medium'], neighbours_selling: ['sell', 'medium'], going_quiet: ['sell', 'medium'], stale_website: ['sell', 'medium'],
  flat_firm: ['sell', 'medium'], lease_ending: ['sell', 'medium'], licence_lapse: ['sell', 'medium'], exit_event: ['sell', 'medium'], partner_left: ['sell', 'medium'], owner_elsewhere: ['sell', 'medium'],
  fast_growth: ['grow', 'medium'], capacity_strain: ['grow', 'medium'], partner_tier: ['grow', 'medium'], new_office: ['grow', 'medium'], scaling_pain: ['grow', 'medium'],
};
export const TIER_NAME = { strong: 'clear', medium: 'supporting' };
// Seller intent, by evidence (never a made-up probability). Confirmed = they said they want to sell or have a buyer search
// running (or told us so); Documented transition = a public, dated transition (retirement, succession, a buyout of the
// owner, the founder died, asked for an investor); Speculative = only supporting signs: a research lead, not evidence.
export const CONFIRMED = new Set(['sale_stated']);
export const INTENT = { confirmed: 'Confirmed', documented: 'Documented transition', speculative: 'Speculative', none: 'No sign yet' };
export function intentCategory(SG, { crm = false, listed = false } = {}) {
  if (crm || listed || SG.counted.some(x => CONFIRMED.has(x.key) && x.tier === 'strong')) return 'confirmed';
  if (SG.counted.some(x => x.tier === 'strong')) return 'documented';
  return SG.counted.length ? 'speculative' : 'none';
}
export const DIR_LABEL = { sell: 'may want to sell some or all of the firm', grow: 'asked for an investor or partner to grow' };
export const WAIT_AFTER_DEATH = 3; // months: never write to a family in the first weeks
export const MAX_AGE = 18; // months

/** A derived sign from facts already found: the founder has run the firm for 20+ years and still runs it. */
export function careerSign(e, owner, now = new Date()) {
  const y = +String(e?.founded || '').match(/\b(19|20)\d{2}\b/)?.[0];
  if (!y || !owner || now.getFullYear() - y < 20) return null;
  const founderish = /found/i.test(`${e.ownership || ''} ${(e.contacts || []).filter(c => c.name === owner).map(c => c.title).join(' ')}`);
  if (!founderish) return null;
  const url = e.website ? (/^https?:/.test(e.website) ? e.website : `https://${e.website}`) : null; if (!url) return null;
  return { key: 'career_length', label: 'Long career', source: 'derived', text: `Founded in ${y}; ${owner} founded it and still runs it (${now.getFullYear() - y} years)`, url, date: '', age: null, direction: 'for', confidence: 'likely', weight: 0.6 };
}

/** A derived sign: the found facts already say the founder or owner has died (an estate, "the late", "passed away"). */
export function diedSign(e) {
  const t = `${e?.owner || ''}. ${e?.ownership || ''}`; if (!/deceased|died|passed away|\bthe late\b|estate of|in memory of/i.test(t)) return null;
  const url = e.website ? (/^https?:/.test(e.website) ? e.website : `https://${e.website}`) : null; if (!url) return null;
  return { key: 'founder_died', label: 'Founder died', source: 'derived', text: t.replace(/\s+/g, ' ').trim().slice(0, 200), url, date: '', age: null, direction: 'for', confidence: 'likely', weight: 1 };
}

/** Does this one sign count, and how much? → { dir, tier } or null (background). */
export function tierOf(x, firmDomain = '') {
  const T = TIER[x.key]; if (!T || x.direction !== 'for' || !x.url) return null;
  // a sale announced or listed more than 18 months ago: past interest, not current willingness (supporting only)
  if (x.age != null && x.age > MAX_AGE) return x.key === 'sale_stated' || x.key === 'past_listing' ? { dir: 'sell', tier: 'medium', past: true } : null;
  if (x.age == null && !x.date) { // undated: only from the firm's own current site, a saved copy of it, or derived from found facts
    const own = x.source === 'derived' || /web\.archive\.org/.test(x.url) || (firmDomain && domainOf(x.url) === firmDomain);
    if (!own) return null;
  }
  const tier = x.confidence === 'possible' && T[1] === 'strong' ? 'medium' : T[1]; // a "possible" sign is never strong on its own
  return { dir: T[0], tier };
}

/** { dir, strong, counted, strongN, mediumN, background, wait, missing } for one firm's (timing) signals. */
export function signalStrength(signals, e = {}, owner = null, now = new Date()) {
  const dom = domainOf(e.website || '') || '';
  const all = [...(signals || [])], d = careerSign(e, owner, now);
  if (d && !all.some(x => x.key === 'career_length')) all.push(d);
  const dd = diedSign(e); if (dd && !all.some(x => x.key === 'founder_died')) all.push(dd);
  const seen = new Set(), counted = [], background = [];
  for (const x of all) {
    const t = tierOf(x, dom);
    if (!t) { if (x.direction === 'for') background.push(x); continue; }
    const k = `${x.key}|${String(x.text).toLowerCase().slice(0, 50)}`; if (seen.has(k)) continue; seen.add(k);
    counted.push({ ...x, dir: t.dir, tier: t.tier, ...(t.past ? { label: 'Marketed before (past interest)' } : {}) });
  }
  const score = dir => { const c = counted.filter(x => x.dir === dir); const kinds = new Set(c.map(x => x.key)); return { s: c.filter(x => x.tier === 'strong').length, m: [...kinds].filter(k => c.some(x => x.key === k && x.tier === 'medium') && !c.some(x => x.key === k && x.tier === 'strong')).length, c }; };
  const S = score('sell'), G = score('grow'), pts = o => o.s * 2 + o.m;
  const dir = !counted.length ? null : pts(G) > pts(S) ? 'grow' : 'sell', D = dir === 'grow' ? G : S;
  // a recent reason to wait (the team grew, it was bought) outweighs thin support
  const wait = (signals || []).filter(x => x.direction === 'against' && (x.age == null || x.age <= 12));
  // a founder who died in the last 3 months: the sign is real, but it is too soon to write
  const died = counted.find(x => x.key === 'founder_died'), tooSoon = died && died.age != null && died.age < WAIT_AFTER_DEATH;
  const enough = D && D.s >= 1 && !(tooSoon && D.s === 1);
  const strong = !!(enough && wait.length < D.s + D.m);
  const missing = strong ? [] : tooSoon ? ['Founder died recently: wait at least 3 months before writing']
    : !counted.length ? ['No clear sign the owner wants to sell or find a partner']
    : !enough ? [`Only supporting signs (${[...new Set(D.c.map(x => x.label))].slice(0, 2).join(', ').toLowerCase()}); needs a clear one`]
    : [`A reason to wait: ${String(wait[0]?.text || '').slice(0, 90)}`];
  counted.sort((a, b) => (a.dir === dir ? 0 : 1) - (b.dir === dir ? 0 : 1) || (a.tier === 'strong' ? 0 : 1) - (b.tier === 'strong' ? 0 : 1) || (a.age ?? 99) - (b.age ?? 99));
  return { dir, strong, counted, strongN: D?.s || 0, mediumN: D?.m || 0, background, wait, missing };
}
