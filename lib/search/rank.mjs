// Owner ranking: every firm to buy, across all searches, ranked by how likely the owner is to want a deal with AION now
// (a majority sale or a growth partnership), how well the firm fits, and whether AION can actually reach the owner.
// Proprietary only: firms already marketed for sale (marketplace or broker listing) are set aside, never ranked.
import { timing, inNiche, listedFor, PATHS, segOf } from './timing.mjs';
import { SEGMENT } from '../thesis.mjs';
// the buy box's segment order (retail placement first) breaks ties between otherwise equal owners
const SEG_PTS = { retail_placement: 5, marketplace: 3, strategy: 2 };
// A search's niche must-have names one segment ("core service is retail placement"). A firm the classifier puts in another
// buy-box segment (a strategy firm found by a retail search) is still in the buy box, so that one row is left out and the
// fit recounted; every other must-have (size, likely to sell…) still caps it.
const VAL = { strong: 1, partial: 0.6, no_evidence: 0.3, mismatch: 0 };
const NICHE_ROW = r => /niche|focus|core|segment|placement|marketplace|strategy|analytics|service_type|business_type/.test(r.key || '');
export function fitFor(e, segment) {
  const B = e.breakdown || [], base = Math.round(Math.max(0, Math.min(100, e.score ?? 0)));
  if (!['retail_placement', 'marketplace', 'strategy'].includes(segment) || !B.some(r => r.must && r.status === 'mismatch' && NICHE_ROW(r))) return { fit: base, recounted: false };
  if (B.some(r => r.must && r.status === 'mismatch' && !NICHE_ROW(r))) return { fit: base, recounted: false };
  const rows = B.filter(r => !(NICHE_ROW(r) && r.status === 'mismatch')), W = rows.reduce((t, r) => t + (r.weight || 1), 0) || 1;
  return { fit: Math.round(rows.reduce((t, r) => t + (r.weight || 1) * (VAL[r.status] ?? 0.3), 0) / W * 100), recounted: true };
}
import { buyBox } from './buybox.mjs';

const LV = { high: 40, some: 22, low: 8, none: 0 };
// Deal type: what to offer this owner. A sale with stepping-back signs (retirement, a long career, exit planning, a partner
// gone, a quiet website) → full buyout as a succession plan. A sale without them (owner still building, a #2 hired,
// recap talk) → majority stake, owner keeps a share and keeps running it. Growth signs only → partnership.
export const DEAL = { full: 'Full buyout', majority: 'Majority stake', partner: 'Partnership', both: 'Their choice', watch: 'Watch' };
export const DEAL_LONG = { full: 'Full buyout: a succession plan, the owner steps back on their timeline', majority: 'Majority stake: the owner keeps a share and keeps running the firm', partner: 'Growth partnership: AI tools and brand introductions, no money changes hands', both: 'Their choice: partnership or a sale, the owner picks', watch: 'Watch: no clear signs yet' };
const STEP_BACK = new Set(['succession', 'retirement', 'career_length', 'exit_planning', 'partner_left', 'going_quiet', 'stale_website', 'licence_lapse', 'lease_ending', 'layoffs']);
const STAY_ON = new Set(['second_in_command', 'recap_interest', 'next_chapter', 'growth_hiring', 'new_service', 'flat_firm']);
export function dealTypeOf(approach, signals) {
  if (approach !== 'sale') return { deal: approach, keys: [] };
  const f = signals.filter(x => x.direction === 'for'), back = f.filter(x => STEP_BACK.has(x.key)), stay = f.filter(x => STAY_ON.has(x.key));
  return back.length > stay.length ? { deal: 'full', keys: back.map(x => x.label) } : { deal: 'majority', keys: stay.map(x => x.label) };
}
// a person's name only: "Jane Roe (founder)" → "Jane Roe"; "Family-owned", "Woman-owned, independent" → null
const realName = n => { const t = String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/,\s*(ph\.?d\.?|ccim|cpa|mba|pe|jr\.?|sr\.?|iii?)\b.*$/i, '').trim();
  if (!t || /surname not found|unknown|not (found|named|stated)|owned|independent|private|family|llc|inc\b|group|partners|team/i.test(t)) return null;
  const w = t.split(/\s+/); return w.length >= 2 && w.length <= 4 && w.every(x => /^[A-Z][a-zA-Z.'’-]*$/.test(x)) ? t : null; };
export const ownerOf = e => realName(e.owner) || (e.contacts || []).map(c => realName(c.name) && /owner|founder|president|ceo|principal|managing (partner|director)/i.test(c.title || '') ? c.name : null).find(Boolean) || null;

/** One firm's rank: 0–100 plus the parts, so every number can be explained. */
export function rankOne(e, { warmIntro = false, contacted = false } = {}) {
  const raw = (e.timing?.signals || []).map(x => ({ ...x, signal: x.key }));
  const t = timing(raw), I = t.intent || { sale: { level: 'none', score: 0, keys: [] }, partner: { level: 'none', score: 0, keys: [] }, lean: 'none', high: false };
  const best = I.sale.level === 'none' && I.partner.level === 'none' ? null : (LV[I.sale.level] + I.sale.score >= LV[I.partner.level] + I.partner.score ? 'sale' : 'partner');
  const intent = best ? Math.round(Math.min(50, LV[I[best].level] + Math.min(10, I[best].score * 4))) : 0;
  const kinds = new Set(t.signals.filter(x => x.direction === 'for').map(x => x.key)).size; // breadth: many different signals beat one loud one
  const breadth = Math.min(10, kinds * 2);
  const segment = segOf(e), F = fitFor(e, segment), fit = Math.round(F.fit * 0.25);
  const owner = ownerOf(e), emails = (e.contactInfo || []).filter(c => c.kind === 'email' && /@/.test(c.value)).length, phone = (e.contactInfo || []).some(c => /phone|main_line/.test(c.kind));
  const reach = (owner ? 5 : 0) + (emails ? 5 : phone ? 2 : 0) + (warmIntro ? 5 : 0);
  const wait = t.against > 0 ? -Math.min(15, Math.round(t.against * 10)) : 0;
  const box = buyBox(e), boxPts = box.status === 'in' ? 5 : 0; // confirmed inside the buy box beats "not confirmed yet"
  const segPts = SEG_PTS[segment] || 0;
  const score = Math.round(Math.max(0, Math.min(100, intent + breadth + fit + reach + wait + boxPts + segPts)));
  // what to propose: both paths strong → ask which they prefer; one strong → that one; nothing yet → watch
  const both = ['high', 'some'].includes(I.sale.level) && ['high', 'some'].includes(I.partner.level);
  const approach = !best ? 'watch' : both && Math.abs(LV[I.sale.level] - LV[I.partner.level]) <= 18 ? 'both' : best;
  const top = t.signals.filter(x => x.direction === 'for').slice(0, 3);
  const D = dealTypeOf(approach, t.signals);
  return { score, approach, offer: D.deal, offerLabel: DEAL[D.deal], offerWhy: D.keys.slice(0, 3), parts: { intent, breadth, fit, reach, wait, box: boxPts, segment: segPts }, box, kinds, owner, emails, email: (e.contactInfo || []).find(c => c.kind === 'email' && /@/.test(c.value))?.value || '', phone, warmIntro, contacted, intent: I, listed: !!(e.listed || listedFor(raw, e)), fitPct: F.fit, fitRecounted: F.recounted, niche: inNiche(e), focus: inNiche(e), segment, segmentLabel: SEGMENT[segment]?.label || null, why: top.map(x => `${x.label}: ${x.text}`.slice(0, 160)), signals: t.signals };
}

export const APPROACH = { sale: 'Offer to buy a majority', partner: 'Offer a growth partnership', both: 'Ask which they prefer: sale or partnership', watch: 'Watch: no signs yet' };
export { PATHS };

/** Rank every firm across searches (newest search wins per firm). Firms outside the buy box (not independent, far too big
 *  or too small) go to `outside` unless you saved them. `opts.warm(e)` and `opts.contacted(e)` are optional lookups. */
export function rankAll(searches, { warm = () => false, contacted = () => false, niche = true } = {}) {
  const seen = new Set(), ranked = [], listed = [], offNiche = [], outside = [];
  for (const s of searches) { if (s?.mode !== 'target' || !s.entities) continue;
    for (const e of s.entities) { if (!e.scored || e.decision === 'rejected') continue;
      const k = String(e.domain || e.website || e.company || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]; if (!k || seen.has(k)) continue; seen.add(k);
      const r = rankOne(e, { warmIntro: !!warm(e), contacted: !!contacted(s, e) });
      const row = { search: s.id, entity: e.id, name: e.company, website: e.website || '', place: String(e.location || '').split(/[;(]|\s(per|according to|based on)\s|\s[—–]\s/)[0].trim(), industry: e.industry || '', fit: r.fitPct, deal: e.deal?.stage || '', ...r };
      (r.listed ? listed : r.box.status === 'out' && e.decision !== 'priority' && e.decision !== 'saved' ? outside : niche && !r.niche ? offNiche : ranked).push(row);
    } }
  ranked.sort((a, b) => b.score - a.score || b.fit - a.fit);
  ranked.forEach((x, i) => { x.rank = i + 1; });
  return { ranked, listed, offNiche, outside };
}
