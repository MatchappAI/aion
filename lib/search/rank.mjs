// Owner ranking: every firm to buy, across all searches, ranked by how likely the owner is to want a deal with AION now
// (a majority sale or a growth partnership), how well the firm fits, and whether AION can actually reach the owner.
// Proprietary only: firms already marketed for sale (marketplace or broker listing) are set aside, never ranked.
import { timing, inNiche, listedFor, segOf, intentOf, PATH } from './timing.mjs';
import { SEGMENT, THESIS, asksForPartner } from '../thesis.mjs';
// the buy box's segment order (retail placement first) breaks ties between otherwise equal owners
const SEG_PTS = { retail_placement: 5, marketplace: 3, strategy: 2, supply_chain: 1, manufacturing: 1, cpg: 1 }; // ecommerce core first, the wider product economy second
// A search's niche must-have names one segment ("core service is retail placement"). A firm the classifier puts in another
// buy-box segment (a strategy firm found by a retail search) is still in the buy box, so that one row is left out and the
// fit recounted; every other must-have (size, likely to sell…) still caps it.
const VAL = { strong: 1, partial: 0.6, no_evidence: 0.3, mismatch: 0 };
const NICHE_ROW = r => /niche|focus|core|segment|placement|marketplace|strategy|analytics|service_type|business_type/.test(r.key || '');
export function fitFor(e, segment) {
  const B = e.breakdown || [], base = Math.round(Math.max(0, Math.min(100, e.score ?? 0)));
  if (!['retail_placement', 'marketplace', 'strategy', 'supply_chain', 'manufacturing', 'cpg'].includes(segment) || !B.some(r => r.must && r.status === 'mismatch' && NICHE_ROW(r))) return { fit: base, recounted: false };
  if (B.some(r => r.must && r.status === 'mismatch' && !NICHE_ROW(r))) return { fit: base, recounted: false };
  const rows = B.filter(r => !(NICHE_ROW(r) && r.status === 'mismatch')), W = rows.reduce((t, r) => t + (r.weight || 1), 0) || 1;
  return { fit: Math.round(rows.reduce((t, r) => t + (r.weight || 1) * (VAL[r.status] ?? 0.3), 0) / W * 100), recounted: true };
}
import { buyBox, headcount } from './buybox.mjs';
import { siteOf, domainOf } from './resolve.mjs';
import { signalStrength, DIR_LABEL, intentCategory, INTENT } from './strength.mjs';

const LV = { high: 40, some: 22, low: 8, none: 0 };
// Deal type: what to offer this owner. AION buys firms, so every owner gets a buyout offer unless the firm itself says, in
// plain words, that it wants a growth partner or investor; only then is it a partnership. Hiring, referral programs, AI
// talk or an announced alliance with someone else are NOT asks for a partner and never turn a firm into a partnership.
// Buyout flavour: stepping-back signs (retirement, long career, exit planning, a partner gone) → full buyout as a succession
// plan; owner clearly still building (a #2 hired, new services) → majority stake, they keep a share and keep running it.
export const DEAL = { full: 'Full buyout', majority: 'Majority stake', partner: 'Partnership' };
const STEP_BACK = new Set(['founder_died', 'succession', 'retirement', 'career_length', 'exit_planning', 'partner_left', 'going_quiet', 'stale_website', 'licence_lapse', 'lease_ending', 'layoffs']);
const STAY_ON = new Set(['second_in_command', 'recap_interest', 'next_chapter', 'growth_hiring', 'new_service', 'flat_firm']);
export function explicitPartner(signals) {
  return (signals || []).filter(x => x.direction === 'for' && asksForPartner(x.text));
}
export function dealTypeOf(_approach, signals, strength = null) {
  const ask = explicitPartner(signals);
  if (ask.length) return { deal: 'partner', keys: [...new Set(ask.map(x => x.label))] };
  const uniq = xs => [...new Set(xs.map(x => x.label))];
  // the counted signs decide: wanting to grow → majority stake (they keep a share and keep running it); else full buyout
  if (strength?.dir) { const mine = strength.counted.filter(x => x.dir === strength.dir); return { deal: strength.dir === 'grow' ? 'majority' : 'full', keys: uniq(mine) }; }
  const f = signals.filter(x => x.direction === 'for'), back = f.filter(x => STEP_BACK.has(x.key)), stay = f.filter(x => STAY_ON.has(x.key));
  return stay.length > back.length ? { deal: 'majority', keys: uniq(stay) } : { deal: 'full', keys: uniq(back) };
}
// a person's name only: "Jane Roe (founder)" → "Jane Roe"; "Family-owned", "Woman-owned, independent" → null
const GONE = /deceased|died|passed away|\bthe late\b|estate of|emerit|retired|former|\bex-/i;
const realName = n => { if (GONE.test(String(n || ''))) return null; const t = String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/,\s*(ph\.?d\.?|ccim|cpa|mba|pe|jr\.?|sr\.?|iii?)\b.*$/i, '').trim();
  if (!t || /surname not found|unknown|not (found|named|stated)|owned|independent|private|family|llc|inc\b|group|partners|team/i.test(t)) return null;
  const w = t.split(/\s+/); return w.length >= 2 && w.length <= 4 && w.every(x => /^[A-Z][a-zA-Z.'’-]*$/.test(x)) ? t : null; };
export const ownerOf = e => realName(e.owner) || (e.contacts || []).map(c => realName(c.name) && !GONE.test(c.title || '') && /owner|founder|president|ceo|principal|managing (partner|director)/i.test(c.title || '') ? c.name : null).find(Boolean) || null;

/** One firm's rank: 0–100 plus the parts, so every number can be explained. */
export function rankOne(e, { warmIntro = false, contacted = false } = {}) {
  const raw = (e.timing?.signals || []).map(x => ({ ...x, signal: x.key }));
  const t = timing(raw), owner = ownerOf(e), SG = signalStrength(t.signals, e, owner);
  // intent points rest only on signs that count (sourced, recent, about this firm; never hires or a handover already done),
  // plus the reasons to wait; signs that are only background never lift the rank
  const evidence = [...SG.counted.map(x => ({ ...x, direction: 'for', path: PATH[x.key] })), ...t.signals.filter(x => x.direction === 'against')];
  const I = evidence.some(x => PATH[x.key]) ? intentOf(evidence) : { sale: { level: 'none', score: 0, keys: [] }, partner: { level: 'none', score: 0, keys: [] }, lean: 'none', high: false };
  // buyouts first: readiness to sell drives the rank; partnership readiness counts only when the firm asked for a partner
  const asked = explicitPartner(t.signals).length > 0;
  const best = asked ? (LV[I.partner.level] + I.partner.score > LV[I.sale.level] + I.sale.score ? 'partner' : 'sale') : I.sale.level === 'none' ? null : 'sale';
  const intent = best ? Math.round(Math.min(50, LV[I[best].level] + Math.min(10, I[best].score * 4))) : 0;
  const kinds = new Set(evidence.filter(x => x.direction === 'for' && (asked || x.path !== 'partner')).map(x => x.key)).size; // breadth: many different signals beat one loud one
  const breadth = Math.min(10, kinds * 2);
  const segment = segOf(e), F = fitFor(e, segment), fit = Math.round(F.fit * 0.25);
  const emails = (e.contactInfo || []).filter(c => c.kind === 'email' && /@/.test(c.value)).length, phone = (e.contactInfo || []).some(c => /phone|main_line/.test(c.kind));
  const reach = (owner ? 5 : 0) + (emails ? 5 : phone ? 2 : 0) + (warmIntro ? 5 : 0);
  const wait = t.against > 0 ? -Math.min(15, Math.round(t.against * 10)) : 0;
  const box = buyBox(e), boxPts = box.status === 'in' ? 10 : 0; // confirmed inside the buy box beats "not confirmed yet"
  const segPts = SEG_PTS[segment] || 0;
  const unknownOwner = box.reasons?.includes('Current owner unknown') ? -20 : 0;
  // strong fit = clear evidence the owner wants to sell (or asked for a partner), and not clearly outside the buy box.
  // Fit, size, owner and email are shown as their own scores, so a firm with a clear sign is never hidden for a missing fact.
  const crm = ['met', 'nda', 'books', 'loi', 'diligence'].includes(e.deal?.stage) || !!e.confirmedInterest;
  const isListed = !!(e.listed || listedFor(raw, e));
  const category = intentCategory(SG, { crm, listed: isListed });
  const strongFit = !isListed && box.status !== 'out' && (category === 'confirmed' || category === 'documented') && !SG.missing.some(m => /wait at least 3 months/.test(m));
  const died = SG.counted.some(x => x.key === 'founder_died');
  const missing = strongFit ? [] : [...(box.status === 'out' ? [`Outside the buy box: ${box.reasons[0] || ''}`] : []), ...SG.missing];
  const signPts = category === 'confirmed' ? 25 : category === 'documented' ? 15 : SG.counted.length ? 5 : 0;
  const score = Math.round(Math.max(0, Math.min(100, intent + breadth + fit + reach + wait + boxPts + segPts + unknownOwner + signPts)));
  const approach = asked ? 'partner' : 'sale';
  // why now: sale signs (one line per kind of sign, no repeats); growth signs only for a firm that asked for a partner
  const seen = new Set(), top = evidence.filter(x => x.direction === 'for' && (asked || x.path !== 'partner') && !seen.has(x.key) && seen.add(x.key)).slice(0, 3);
  const D = dealTypeOf(approach, t.signals, SG);
  // people: a stated range keeps both ends (third-party ranges are wide); a team-page count is one number
  const hc = headcount(e.size) || (e.sizeEstimate?.people ? { low: e.sizeEstimate.people, high: e.sizeEstimate.people } : null), SR = THESIS.sizeRule;
  const size = hc ? { people: hc.low === hc.high ? hc.low : `${hc.low}–${hc.high}`, low: hc.low, high: hc.high, from: headcount(e.size) ? 'stated' : 'team page', url: e.sizeEstimate?.url || null, revenue: [SR.revenuePerPerson[0] * hc.low, SR.revenuePerPerson[1] * hc.high], ebitda: [SR.revenuePerPerson[0] * hc.low * SR.margin[0], SR.revenuePerPerson[1] * hc.high * SR.margin[1]] } : null;
  // five separate scores, in words, each with what it rests on (never an invented sale probability)
  const core = ['retail_placement', 'marketplace', 'strategy'].includes(segment);
  const fitLabel = box.status === 'out' ? 'Weak' : box.status === 'in' ? (core ? 'Strong' : 'Good') : 'Possible';
  const books = ['books', 'loi', 'diligence', 'closed'].includes(e.deal?.stage);
  const hcS = headcount(e.size), finLabel = books ? 'Books received' : hcS ? 'Stated size only' : e.sizeEstimate?.people ? 'Team-page headcount only' : 'Unknown';
  const verifiedEmail = (e.contactInfo || []).some(c => c.kind === 'email' && c.verified !== false && /@/.test(c.value));
  const ready = owner && verifiedEmail ? 'Ready' : owner && (emails || phone) ? 'Partly ready' : 'Not ready';
  const waitList = SG.wait.map(x => ({ text: x.text, url: x.url, date: x.date }));
  const confidence = category === 'confirmed' ? 'High' : category === 'documented' ? (SG.counted.filter(x => x.tier === 'strong' && x.confidence !== 'possible').length >= 2 ? 'High' : 'Medium') : 'Low';
  const next = isListed ? 'Marketed: ask the listing broker for the teaser and who the owner is'
    : died ? 'Confirm the death and who runs it now before writing'
    : category === 'none' ? 'Research: read their About and news pages and owner interviews for a clear sign'
    : category === 'speculative' ? 'Research: look for the owner\u2019s own words about the future (interviews, posts) before writing'
    : !owner ? 'Find who owns it now (About page, state business records)'
    : !emails ? 'Find the owner\u2019s email (their site, then Hunter)'
    : box.status === 'check' ? `Write to the owner; confirm on the first call: ${(box.reasons || []).join(', ').toLowerCase()}`
    : !e.founderProfile ? 'Run founder research, then write to the owner' : 'Write to the owner';
  const scores = {
    intent: { label: INTENT[category], category, confidence, explicit: category === 'confirmed', evidence: SG.counted.filter(x => x.tier === 'strong').slice(0, 3).map(x => ({ label: x.label, text: x.text, url: x.url, date: x.date })), against: waitList },
    fit: { label: fitLabel, why: box.status === 'out' ? box.reasons.join('; ') : `${SEGMENT[segment]?.label || 'Segment unclear'}${core ? ' (core)' : segment && SEG_PTS[segment] === 1 ? ' (second tier)' : ''}${box.reasons?.length ? ` · to confirm: ${box.reasons.join(', ').toLowerCase()}` : ''}` },
    financial: { label: finLabel },
    value: { label: books ? 'Sized from their books in Value Creation' : 'Not sized yet: needs their books' },
    readiness: { label: ready, why: [owner ? `owner ${owner}` : 'owner not named', verifiedEmail ? 'verified email' : emails ? 'email not verified' : 'no email'].join(' · ') },
    next,
  };
  const strength = { strongFit, category, dir: SG.dir, dirLabel: DIR_LABEL[SG.dir] || '', strong: SG.strong, strongN: SG.strongN, mediumN: SG.mediumN, missing, counted: SG.counted.map(x => ({ key: x.key, label: x.label, text: x.text, url: x.url, date: x.date, tier: x.tier, dir: x.dir, source: x.source })) };
  return { strength, strongFit, scores, marketed: isListed, score, approach, size, offer: D.deal, offerLabel: DEAL[D.deal], offerWhy: D.keys.slice(0, 3), parts: { intent, breadth, fit, reach, wait, box: boxPts, segment: segPts, signs: signPts }, box, kinds, owner, emails, email: (e.contactInfo || []).find(c => c.kind === 'email' && /@/.test(c.value))?.value || '', phone, warmIntro, contacted, intent: I, listed: !!(e.listed || listedFor(raw, e)), fitPct: F.fit, fitRecounted: F.recounted, niche: inNiche(e), focus: inNiche(e), segment, segmentLabel: SEGMENT[segment]?.label || null, why: top.map(x => `${x.label}: ${x.text}`.slice(0, 160)), signals: t.signals };
}

export const APPROACH = { sale: 'Offer to buy the firm', partner: 'Offer a growth partnership (they asked for one)' };

/** Rank every firm across searches (newest search wins per firm). Firms outside the buy box (not independent, far too big
 *  or too small) go to `outside` unless you saved them. `opts.warm(e)` and `opts.contacted(e)` are optional lookups. */
export function rankAll(searches, { warm = () => false, contacted = () => false, niche = true } = {}) {
  const ranked = [], listed = [], offNiche = [], outside = [];
  // one row per firm: the same firm found by two searches (one with its website, one without) is merged by domain or name,
  // keeping the copy with a real website, then the higher score
  // the firm's own domain only: a directory or news site (clutch.co, theshelbyreport.com) never merges two firms
  const dom = siteOf;
  const nm = e => String(e.company || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(llc|inc|corp|co|the|group|ltd|company)\b/g, '').trim();
  const best = new Map(), alias = new Map();
  for (const s of searches) { if (s?.mode !== 'target' || !s.entities) continue;
    for (const e of s.entities) { if (!e.scored || e.decision === 'rejected') continue;
      const keys = [dom(e) && `d:${dom(e)}`, nm(e) && `n:${nm(e)}`].filter(Boolean); if (!keys.length) continue;
      const id = keys.map(k => alias.get(k)).find(Boolean) || keys[0]; keys.forEach(k => alias.set(k, id));
      const cur = best.get(id), better = !cur || (!!dom(e) - !!dom(cur.e)) > 0 || (!!dom(e) === !!dom(cur.e) && (e.score ?? 0) > (cur.e.score ?? 0));
      if (better) best.set(id, { s, e });
    } }
  for (const { s, e } of best.values()) {
    {
      const r = rankOne(e, { warmIntro: !!warm(e), contacted: !!contacted(s, e) });
      const row = { search: s.id, entity: e.id, name: e.company, website: dom(e) ? (/^https?:/.test(String(e.website || '')) && domainOf(e.website) === dom(e) ? e.website : `https://${dom(e)}`) : '', place: String(e.location || '').split(/[;(]|\s(per|according to|based on)\s|\s[—–]\s/)[0].trim(), industry: e.industry || '', fit: r.fitPct, deal: e.deal?.stage || '', ...r };
      (r.listed ? listed : r.box.status === 'out' && e.decision !== 'priority' && e.decision !== 'saved' ? outside : niche && !r.niche ? offNiche : ranked).push(row);
    } }
  // confirmed in the buy box first, then the rest, each by score
  // strong fits first, then confirmed in the buy box, then the rest, each by score
  ranked.sort((a, b) => (b.strongFit - a.strongFit) || (a.box?.status === 'in' ? 0 : 1) - (b.box?.status === 'in' ? 0 : 1) || b.score - a.score || b.fit - a.fit);
  ranked.forEach((x, i) => { x.rank = i + 1; });
  return { ranked, listed, offNiche, outside };
}
