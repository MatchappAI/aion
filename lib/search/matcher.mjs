// Perfect Merger Matcher and Consolidation Mapper, from what AION already found (no new data, no AI).
// Every pairing is a hypothesis with its assumptions written out; nothing here is a forecast.
import { stateOf } from './radar.mjs';

const REGION = { Northeast: ['Maine', 'New Hampshire', 'Vermont', 'Massachusetts', 'Rhode Island', 'Connecticut', 'New York', 'New Jersey', 'Pennsylvania'], Midwest: ['Ohio', 'Michigan', 'Indiana', 'Illinois', 'Wisconsin', 'Minnesota', 'Iowa', 'Missouri', 'North Dakota', 'South Dakota', 'Nebraska', 'Kansas'], South: ['Delaware', 'Maryland', 'Virginia', 'West Virginia', 'North Carolina', 'South Carolina', 'Georgia', 'Florida', 'Kentucky', 'Tennessee', 'Alabama', 'Mississippi', 'Arkansas', 'Louisiana', 'Oklahoma', 'Texas'], West: ['Montana', 'Idaho', 'Wyoming', 'Colorado', 'New Mexico', 'Arizona', 'Utah', 'Nevada', 'Washington', 'Oregon', 'California', 'Alaska', 'Hawaii'] };
export const regionOf = place => { const st = stateOf(place); return Object.entries(REGION).find(([, l]) => l.includes(st))?.[0] || null; };
// which services complete each other: one firm sells what the other's clients also buy
const PAIRS = {
  'marketplace|retail_placement': 'Grocery and mass retail placement plus Amazon and Walmart.com management: one team can take a brand onto shelves and online.',
  'retail_placement|strategy': 'Retail placement plus retail data and analytics: the analytics helps win line reviews; the brokerage gives the analytics clients.',
  'marketplace|strategy': 'Marketplace management plus ecommerce strategy and analytics: strategy work turns into managed accounts.',
  'cpg|retail_placement': 'Retail placement plus CPG consulting (pricing, revenue management): more to sell each brand client.',
  'retail_placement|supply_chain': 'Retail placement plus supply-chain consulting: brands winning new retailers need their supply chain ready.',
  'marketplace|supply_chain': 'Marketplace management plus logistics consulting: fulfilment problems are the top reason marketplace brands stall.',
};
const clientsOf = x => new Set((x.clients || []).map(c => String(c).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean));

/** Up to `limit` pairings among firms to buy, best first, each with why, assumptions and evidence. */
export function matchFirms(list, { limit = 10 } = {}) {
  const firms = list.filter(x => x.niche && x.box?.status !== 'out' && !x.marketed);
  const out = [];
  for (let i = 0; i < firms.length; i++) for (let j = i + 1; j < firms.length; j++) {
    const a = firms[i], b = firms[j], key = [a.segment, b.segment].sort().join('|'), ra = regionOf(a.place), rb = regionOf(b.place);
    const why = [], assumptions = [], evidence = []; let pts = 0;
    if (PAIRS[key]) { pts += 3; why.push(PAIRS[key]); assumptions.push('Their clients would buy the other firm\'s service; check how many overlap on the first calls.'); }
    else if (a.segment === b.segment && ra && rb && ra !== rb) { pts += 2; why.push(`Same service in two regions (${ra} and ${rb}): together they can serve national brands and retailers.`); assumptions.push('Their client lists overlap little; brands with national ambitions want one team.'); }
    else continue;
    const ca = clientsOf(a), shared = [...clientsOf(b)].filter(c => ca.has(c));
    if (shared.length) { pts += 1; evidence.push(`Both name the same clients on their sites: ${shared.slice(0, 3).join(', ')}`); }
    if (a.strongFit) pts += 1; if (b.strongFit) pts += 1;
    if (ra && rb && ra === rb && a.segment !== b.segment) why.push(`Both in the ${ra}, so one office team can sell both.`);
    out.push({ a: { name: a.name, search: a.search, entity: a.entity, segment: a.segmentLabel, place: a.place, strong: !!a.strongFit }, b: { name: b.name, search: b.search, entity: b.entity, segment: b.segmentLabel, place: b.place, strong: !!b.strongFit }, score: pts, why, assumptions, evidence });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** Who has been bought or is buying, and the independent firms left near them (likely next targets for every buyer). */
export function consolidation(list, outside, events = []) {
  const bought = outside.filter(x => /owned by|acquired|part of a bigger company|not independent|buys other agencies/i.test(x.why || '')).map(x => ({ name: x.name, segment: x.segmentLabel, place: x.place, why: x.why, search: x.search, entity: x.entity }));
  const deals = events.filter(e => /acquir|acquisition|merg|sold to|bought/i.test(e.text || '')).slice(0, 20).map(e => ({ text: e.text, url: e.url, date: e.date, name: e.name }));
  const independents = list.filter(x => x.niche && x.box?.status !== 'out').map(x => ({ name: x.name, segment: x.segmentLabel, place: x.place, region: regionOf(x.place), search: x.search, entity: x.entity, strong: !!x.strongFit }));
  const clusters = {}; for (const f of independents) { const k = `${f.segment || 'Other'} · ${f.region || 'region unknown'}`; (clusters[k] ??= []).push(f); }
  return { bought, deals, clusters: Object.entries(clusters).map(([k, v]) => ({ key: k, firms: v })).sort((a, b) => b.firms.length - a.firms.length) };
}
