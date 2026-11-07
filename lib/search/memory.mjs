// Private network: every person and company found by any search, merged across searches with their evidence history.
// It grows with each search and is the firm's own data.
import fs from 'node:fs'; import path from 'node:path';
import { normName, normCo, siteOf } from './resolve.mjs';
let FILE = null, MEM = { people: {}, companies: {}, targets: {} };
export function initMemory(dir) { FILE = path.join(dir, 'network.json'); try { MEM = { people: {}, companies: {}, targets: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {} }
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(MEM)); } catch {} };
export const keyOf = (mode, e) => mode === 'candidate' ? `${normName(e.name)}|${normCo(e.employer).split(' ')[0] || ''}` : siteOf(e) || normCo(e.company);
const bag = mode => mode === 'candidate' ? MEM.people : mode === 'target' ? MEM.targets : MEM.companies;
const uniq = (a, n = 12) => [...new Set(a.filter(Boolean))].slice(0, n);

export function ingest(s) {
  const B = bag(s.mode);
  for (const e of s.entities || []) {
    const k = keyOf(s.mode, e); if (!k || k === '|') continue;
    const r = B[k] ??= { key: k, name: s.mode === 'candidate' ? e.name : e.company, firstSeen: s.created, titles: [], employers: [], locations: [], industries: [], sources: [], contacts: [], hits: [] };
    r.lastSeen = s.created;
    if (s.mode === 'candidate') { r.titles = uniq([e.title, ...r.titles]); r.employers = uniq([e.employer, ...r.employers]); }
    else { r.industries = uniq([e.industry, ...r.industries]); r.website = r.website || e.website || ''; }
    r.locations = uniq([e.location, ...r.locations]);
    r.sources = uniq([...(e.evidence || []).map(x => x.url), ...(e.fetchedPages || []), ...r.sources], 40);
    r.contacts = [...(e.contactInfo || []), ...r.contacts].filter((c, i, a) => a.findIndex(x => x.kind === c.kind && x.value === c.value) === i).slice(0, 12);
    r.hits = [...r.hits.filter(h => h.search !== s.id), { search: s.id, objective: s.objective, at: s.created, score: e.scored ? e.score : null, decision: e.decision || null, entity: e.id }];
  }
  save();
}
export function decide(s, e) { const r = bag(s.mode)[keyOf(s.mode, e)]; if (!r) return; const h = r.hits.find(x => x.search === s.id); if (h) h.decision = e.decision || null; save(); }
/** What the network already knows about this result, from other searches. */
export function known(s, e) { const r = bag(s.mode)[keyOf(s.mode, e)]; if (!r) return null; const other = r.hits.filter(h => h.search !== s.id); return other.length ? { searches: other.length, decisions: other.map(h => h.decision).filter(Boolean), best: Math.max(...other.map(h => h.score ?? 0)), firstSeen: r.firstSeen } : null; }
export function network(mode) { return Object.values(bag(mode)).map(r => ({ ...r, searches: r.hits.length, best: Math.max(0, ...r.hits.map(h => h.score ?? 0)), saved: r.hits.some(h => ['saved', 'priority'].includes(h.decision)), rejected: r.hits.every(h => h.decision === 'rejected') })).sort((a, b) => (b.saved - a.saved) || b.best - a.best || b.searches - a.searches); }
export const stats = () => ({ people: Object.keys(MEM.people).length, companies: Object.keys(MEM.companies).length, targets: Object.keys(MEM.targets).length });

// Deal pipeline: a target's stage is set only by you, with a dated history. Nothing is inferred.
export { DEAL_STAGES } from '../thesis.mjs';
import { DEAL_STAGES } from '../thesis.mjs';
export function setStage(s, e, stage, note = '') {
  if (s.mode !== 'target') return null;
  const r = MEM.targets[keyOf(s.mode, e)]; if (!r) return null;
  const st = DEAL_STAGES.some(([k]) => k === stage) ? stage : null;
  r.deal ??= { stage: null, history: [] };
  if (r.deal.stage === st && !note) return r.deal;
  r.deal.stage = st; r.deal.history.push({ stage: st, at: new Date().toISOString(), note: String(note).slice(0, 500) }); save();
  return r.deal;
}
export const dealOf = (s, e) => s.mode === 'target' ? MEM.targets[keyOf(s.mode, e)]?.deal || null : null;
export function pipeline() {
  return Object.values(MEM.targets).filter(r => r.deal?.stage).map(r => { const h = r.hits[r.hits.length - 1], last = r.deal.history[r.deal.history.length - 1];
    return { key: r.key, name: r.name, website: r.website || '', location: r.locations[0] || '', stage: r.deal.stage, since: last.at, history: r.deal.history, best: Math.max(0, ...r.hits.map(x => x.score ?? 0)), search: h?.search || null, entity: h?.entity || null }; })
    .sort((a, b) => DEAL_STAGES.findIndex(([k]) => k === b.stage) - DEAL_STAGES.findIndex(([k]) => k === a.stage) || b.since.localeCompare(a.since));
}
/** Drop every trace of searches that were archived; records found only by them go too (a deal stage keeps a record). */
export function prune(liveIds) {
  const live = new Set(liveIds); let dropped = 0;
  for (const B of [MEM.people, MEM.companies, MEM.targets]) for (const [k, r] of Object.entries(B)) {
    r.hits = r.hits.filter(h => live.has(h.search));
    if (!r.hits.length && !r.deal?.stage) { delete B[k]; dropped++; }
  }
  save(); return dropped;
}
