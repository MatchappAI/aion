// Owner ranking: every firm to buy, across all searches, ranked by how likely the owner is to want a deal with AION now
// (a majority sale or a growth partnership), how well the firm fits, and whether AION can actually reach the owner.
// Proprietary only: firms already marketed for sale (marketplace or broker listing) are set aside, never ranked.
import { timing, inNiche, listedFor, PATHS, FOCUS } from './timing.mjs';

const LV = { high: 40, some: 22, low: 8, none: 0 };
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
  const fit = Math.round(Math.max(0, Math.min(100, e.score ?? 0)) * 0.25);
  const owner = ownerOf(e), emails = (e.contactInfo || []).filter(c => c.kind === 'email' && /@/.test(c.value)).length, phone = (e.contactInfo || []).some(c => /phone|main_line/.test(c.kind));
  const reach = (owner ? 5 : 0) + (emails ? 5 : phone ? 2 : 0) + (warmIntro ? 5 : 0);
  const wait = t.against > 0 ? -Math.min(15, Math.round(t.against * 10)) : 0;
  const score = Math.round(Math.max(0, Math.min(100, intent + breadth + fit + reach + wait)));
  // what to propose: both paths strong → ask which they prefer; one strong → that one; nothing yet → watch
  const both = ['high', 'some'].includes(I.sale.level) && ['high', 'some'].includes(I.partner.level);
  const approach = !best ? 'watch' : both && Math.abs(LV[I.sale.level] - LV[I.partner.level]) <= 18 ? 'both' : best;
  const top = t.signals.filter(x => x.direction === 'for').slice(0, 3);
  return { score, approach, parts: { intent, breadth, fit, reach, wait }, kinds, owner, emails, phone, warmIntro, contacted, intent: I, listed: !!(e.listed || listedFor(raw, e)), niche: inNiche(e), focus: inNiche(e) && FOCUS.test(e.industry || e.summary || ''), why: top.map(x => `${x.label}: ${x.text}`.slice(0, 160)), signals: t.signals };
}

export const APPROACH = { sale: 'Offer to buy a majority', partner: 'Offer a growth partnership', both: 'Ask which they prefer: sale or partnership', watch: 'Watch: no signs yet' };
export { PATHS };

/** Rank every firm across searches (newest search wins per firm). `opts.warm(e)` and `opts.contacted(e)` are optional lookups. */
export function rankAll(searches, { warm = () => false, contacted = () => false, niche = true } = {}) {
  const seen = new Set(), ranked = [], listed = [], offNiche = [];
  for (const s of searches) { if (s?.mode !== 'target' || !s.entities) continue;
    for (const e of s.entities) { if (!e.scored || e.decision === 'rejected') continue;
      const k = String(e.domain || e.website || e.company || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]; if (!k || seen.has(k)) continue; seen.add(k);
      const r = rankOne(e, { warmIntro: !!warm(e), contacted: !!contacted(s, e) });
      const row = { search: s.id, entity: e.id, name: e.company, website: e.website || '', place: String(e.location || '').split(/\s[(;]/)[0], industry: e.industry || '', fit: e.score ?? 0, deal: e.deal?.stage || '', ...r };
      (r.listed ? listed : niche && !r.niche ? offNiche : ranked).push(row);
    } }
  ranked.sort((a, b) => b.score - a.score || b.fit - a.fit);
  ranked.forEach((x, i) => { x.rank = i + 1; });
  return { ranked, listed, offNiche };
}
