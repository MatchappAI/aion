// Search routes (moved out of server.mjs with no change in behaviour): searches, the owner list and its deal-intent
// signals, the brand radar, deal stages, watches and the Hunter.io key. server.mjs passes in what these routes share.
import path from 'node:path';
import { listSearches, loadSearch, saveSearch, saveSearchMerged, archiveSearch } from '../lib/search/store.mjs';
import { ingest, decide as memDecide, known, network, stats as memStats, setStage, dealOf, pipeline, prune, DEAL_STAGES } from '../lib/search/memory.mjs';
import { importContacts, contactStats, clearContacts, warm } from '../lib/search/contacts.mjs';
import { sources } from '../lib/search/sources.mjs';
import { timing } from '../lib/search/timing.mjs';
import { brandScan, scans as radarScans, recentEvents, intentScan } from '../lib/search/radar.mjs';
import { addSignals, checkMore } from '../lib/search/pipeline.mjs';
import { watches, setWatch, started as watchStarted, watchOf } from '../lib/search/watch.mjs';
import { MODELS } from '../lib/claude.mjs';
import { researchFirm, profileTiming } from '../lib/search/founder.mjs';
import { matchFirms, consolidation } from '../lib/search/matcher.mjs';
import { ownerOf } from '../lib/search/rank.mjs';
// founder research: one firm at a time per request, at most two running at once; progress lives here
const RESEARCH = {};
export async function researchOne(searchId, entityId, cwd) {
  const k = `${searchId}|${entityId}`; if (RESEARCH[k]?.running) return RESEARCH[k];
  if (Object.values(RESEARCH).filter(x => x.running).length >= 2) throw new Error('Two research runs are going already. Try again in a few minutes.');
  const s2 = loadSearch(searchId), e = s2?.entities?.find(x => x.id === entityId); if (!e) throw new Error('Result not found.');
  RESEARCH[k] = { running: true, started: new Date().toISOString(), name: e.company };
  researchFirm(e, { owner: ownerOf(e), model: MODELS.analysis, cwd })
    .then(p => { const s3 = loadSearch(searchId), e3 = s3.entities.find(x => x.id === entityId); e3.founderProfile = p; const keep = (e3.timing?.signals || []).filter(x => x.source !== 'research').map(x => ({ ...x, signal: x.key })); e3.timing = timing([...keep, ...profileTiming(p, e3.company)]); saveSearchMerged(s3); RESEARCH[k] = { running: false, done: p.at, name: e.company, count: p.count }; })
    .catch(err => { RESEARCH[k] = { running: false, error: err.message, name: e.company }; });
  return RESEARCH[k];
}

let INTENT = null, LAST_INTENT = null; // the deal-intent scan: progress while it runs, and when it last finished
const SIG = {}; // searches whose data signals are being refreshed
let SCAN = null; // the brand radar scan running now
// one background job per search at a time (a full check, a signals update or the intent scan): each holds its own copy
// and saves it whole, so two at once would undo each other's results
const jobOn = (SRUN, id) => SRUN[id] ? 'This search is still running.' : SIG[id] ? 'This search is already being updated.' : INTENT?.ids?.has(id) ? 'The deal-intent scan is reading this search’s firms. Try again when it finishes.' : null;

export const SEARCH_POST = new Set(['search/start', 'search/contacts', 'search/archive', 'search/signals', 'search/more', 'search/intent-scan', 'radar/scan', 'finders/key', 'search/stage', 'search/decide', 'search/watch', 'search/watchrun', 'search/research']);

/** Handles a search request. Returns true when it answered, false when the server should carry on. */
export async function searchRoute(req, res, url, p, ctx) {
  const { savedAll, send, body, SRUN, JOB_ERR, jobFailed, ROOTWS, ownerList, startSearch, cityOf, finderKeys, saveFinderKeys } = ctx;
  if (req.method === 'GET') {
    if (req.method === 'GET' && p === 'search/list') return send(res, 200, { searches: listSearches().map(x => SRUN[x.id] ? { ...x, status: 'running' } : x) });
    if (req.method === 'GET' && p.startsWith('search/get/')) { const id = p.slice(11), s2 = SRUN[id] || loadSearch(id); if (!s2) return send(res, 404, { error: 'Search not found.' }); const { raw, ...rest } = s2; const fresh = new Set(s2.fresh || []); return send(res, 200, { ...rest, entities: (rest.entities || []).map(e => ({ ...e, ...(e.timing ? { timing: timing(e.timing.signals.map(x => ({ ...x, signal: x.key }))) } : {}), known: known(s2, e), deal: dealOf(s2, e), isNew: fresh.has(e.id), warm: warm(s2.mode, e) })), rawCount: raw?.length || 0, running: !!SRUN[id], signalsRunning: !!SIG[id], watch: watchOf(s2) }); }
    if (req.method === 'GET' && p === 'search/network') return send(res, 200, { people: network('candidate'), companies: network('client'), targets: network('target'), stats: memStats() });
    if (req.method === 'GET' && p === 'search/today') {
      // who to call this week: across every search, results that fit and have a reason to act now (or that you marked priority)
      const TR = { act: 3, warm: 2, none: 1, early: 0 }, out = [];
      for (const h of listSearches()) { const s2 = loadSearch(h.id); if (!s2?.entities) continue;
        for (const e of s2.entities) { if (!e.scored || e.decision === 'rejected') continue;
          const t = e.timing ? timing(e.timing.signals.map(x => ({ ...x, signal: x.key }))) : null, b = t?.badge || 'none', pri = e.decision === 'priority';
          if (!(pri || (e.score >= 55 && (b === 'act' || b === 'warm')))) continue;
          const top = t?.signals?.find(x => x.direction === 'for');
          out.push({ search: s2.id, entity: e.id, mode: s2.mode, name: s2.mode === 'candidate' ? e.name : e.company, place: cityOf(e.location), fit: e.score, badge: b, label: t?.label || '', why: top ? (top.text.toLowerCase().startsWith(top.label.toLowerCase().split(' ')[0]) ? top.text : `${top.label}: ${top.text}`) : (e.summary || '').split('. ')[0], priority: pri, url: top?.url || '' }); } }
      const seen = new Set();
      const list = out.sort((a, b) => (b.priority - a.priority) || (TR[b.badge] - TR[a.badge]) || b.fit - a.fit).filter(x => { const k = x.mode + '|' + x.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      return send(res, 200, { list: list.slice(0, 10), total: list.length });
    }
    if (req.method === 'GET' && p === 'search/research') return send(res, 200, RESEARCH);
    // strategy views from data already found: firms that complete each other, and who is consolidating the market
    if (req.method === 'GET' && p === 'search/strategy') { const { R, list } = ownerList(); const outside = R.outside.map(x => ({ name: x.name, place: x.place, segmentLabel: x.segmentLabel, why: x.box.reasons.join('; '), search: x.search, entity: x.entity }));
      return send(res, 200, { pairs: matchFirms(list), market: consolidation(list, outside, recentEvents(3650).filter(x => x.mode === 'target')) }); }
    if (req.method === 'GET' && p === 'search/intent') {
      // owner ranking: every firm to buy across all searches, ranked by deal intent (majority sale or growth partnership),
      // breadth of signals, fit and reachability. Proprietary only: firms already listed on a marketplace are set aside.
      const { R, list, marketed, outsideList } = ownerList();
      return send(res, 200, { marketed, outsideList, saved: savedAll(), scanning: INTENT, lastScan: LAST_INTENT, lastError: JOB_ERR.intent || JOB_ERR.signals || null, list, listed: R.listed.map(x => ({ name: x.name, place: x.place, website: x.website })), outside: R.outside.filter(x => x.niche).map(x => ({ search: x.search, entity: x.entity, name: x.name, place: x.place, focus: x.focus, segmentLabel: x.segmentLabel, why: x.box.reasons.join('; ') })), counts: { strong: list.filter(x => x.niche && x.strongFit).length, outside: R.outside.filter(x => x.niche).length, outsideFocus: R.outside.filter(x => x.focus).length, inBox: list.filter(x => x.box.status === 'in').length, all: list.length, high: list.filter(x => x.intent.high).length, sale: list.filter(x => x.intent.sale.level === 'high').length, partner: list.filter(x => x.intent.partner.level === 'high').length, niche: list.filter(x => x.niche).length, focus: list.filter(x => x.focus).length, listed: R.listed.length, segments: Object.fromEntries(['retail_placement', 'marketplace', 'strategy'].map(k => [k, list.filter(x => x.niche && x.segment === k).length])), inOutreach: list.filter(x => x.niche && x.outreach).length } });
    }
    if (req.method === 'GET' && p === 'search/radar') return send(res, 200, { events: recentEvents(), scans: radarScans(), scanning: SCAN, lastError: JOB_ERR.radar || null });
    if (req.method === 'GET' && p === 'search/pipeline') return send(res, 200, { stages: DEAL_STAGES, deals: pipeline() });
    if (req.method === 'GET' && p === 'finders') return send(res, 200, { hunter: !!(finderKeys().hunter || process.env.HUNTER_API_KEY) });
    if (req.method === 'GET' && p === 'search/sources') return send(res, 200, { sources: sources(contactStats()) });
    if (req.method === 'GET' && p === 'search/watches') return send(res, 200, { watches: watches() });
    return false;
  }
  if (req.method !== 'POST' || !SEARCH_POST.has(p)) return false;
  const b = await body(req);
  switch (p) {
    case 'search/start': {
      const mode = ['client', 'target'].includes(b.mode) ? b.mode : null, objective = String(b.objective || '').trim().slice(0, 1500);
      if (!mode) return send(res, 400, { error: 'Choose what to search for: firms to buy, or brands.' });
      if (objective.length < 12) return send(res, 400, { error: 'Describe what you are looking for in a sentence or two.' });
      if (Object.keys(SRUN).length >= 2) return send(res, 409, { error: 'Two searches are already running (see Search history below). Each takes about 4–8 minutes; start this one when either finishes.' });
      const s2 = startSearch({ mode, objective, filters: b.filters, from: b.from, queries: b.queries, criteria: b.criteria, link: b.link });
      return send(res, 200, { id: s2.id });
    }
    case 'search/contacts': {
      if (b.remove) { clearContacts(); return send(res, 200, { ok: true }); }
      try { const r = importContacts(Buffer.from(b.data || '', 'base64'), String(b.filename || 'contacts.csv')); return send(res, 200, r); } catch (e) { return send(res, 400, { error: e.message }); }
    }
    case 'search/archive': { { const why = jobOn(SRUN, b.id); if (why) return send(res, 409, { error: why }); } if (!archiveSearch(b.id)) return send(res, 404, { error: 'Search not found.' }); prune(listSearches().map(x => x.id)); return send(res, 200, { ok: true }); }
    case 'search/signals': {
      { const why = jobOn(SRUN, b.id); if (why) return send(res, 409, { error: why }); }
      const s2 = loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' });
      SIG[b.id] = true;
      addSignals(s2, { cwd: path.join(ROOTWS, 'searches'), model: MODELS.extraction, save: saveSearchMerged, log: t => { s2.log.push({ t: s2.runtime || 0, text: t }); } }).then(() => { saveSearchMerged(s2); delete JOB_ERR.signals; }).catch(jobFailed('signals')).finally(() => { delete SIG[b.id]; });
      return send(res, 200, { ok: true });
    }
    case 'search/more': {
      // the next unchecked results of a finished search get the full in-depth check, data signals and site emails
      { const why = jobOn(SRUN, b.id); if (why) return send(res, 409, { error: why }); }
      if (Object.keys(SRUN).length >= 2) return send(res, 409, { error: 'Two searches are already running. Try again when one finishes.' });
      const s2 = loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' });
      const left = (s2.entities || []).filter(e => !e.scored).length; if (!left) return send(res, 400, { error: 'Every result in this search is already checked.' });
      SRUN[s2.id] = s2;
      checkMore(s2, { n: +b.n || 12, cwd: path.join(ROOTWS, 'searches'), model: MODELS.extraction }).then(() => ingest(s2)).catch(e => { s2.status = 'done'; s2.stage = 'done'; (s2.log ||= []).push({ t: 0, text: 'Check more stopped: ' + e.message }); saveSearch(s2); }).finally(() => { delete SRUN[s2.id]; });
      return send(res, 200, { ok: true, checking: Math.min(left, +b.n || 12), left });
    }
    case 'search/intent-scan': {
      if (INTENT) return send(res, 409, { error: 'Already reading every firm’s site and headlines.' });
      const all = listSearches().map(h => loadSearch(h.id)).filter(x => x?.mode === 'target' && !SRUN[x.id] && !SIG[x.id]);
      INTENT = { done: 0, total: 0, at: new Date().toISOString() };
      Object.defineProperty(INTENT, 'ids', { value: new Set(all.map(x => x.id)), enumerable: false }); // not sent to the browser
      intentScan(all, { save: saveSearchMerged, progress: p2 => Object.assign(INTENT, p2) }).then(() => { delete JOB_ERR.intent; }).catch(jobFailed('intent')).finally(() => { LAST_INTENT = new Date().toISOString(); INTENT = null; });
      return send(res, 200, { ok: true });
    }
    case 'radar/scan': {
      const region = String(b.region || '').trim().slice(0, 80) || 'United States';
      if (SCAN) return send(res, 409, { error: 'A scan is already running. It takes about a minute.' });
      SCAN = { region, at: new Date().toISOString() };
      brandScan({ region, days: Math.min(180, Math.max(14, +b.days || 60)) }, { cwd: path.join(ROOTWS, 'searches'), model: MODELS.extraction }).then(() => { delete JOB_ERR.radar; }).catch(jobFailed('radar')).finally(() => { SCAN = null; });
      return send(res, 200, { ok: true });
    }
    case 'finders/key': { // Hunter.io free plan key: checked with Hunter, stored only on this Mac (owner-only file)
      const k = String(b.key || '').trim(), cur = finderKeys();
      if (!k) { delete cur.hunter; saveFinderKeys(cur); return send(res, 200, { hunter: false }); }
      try { const r = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (!r.ok) throw new Error(j.errors?.[0]?.details || 'Hunter.io did not accept that key'); cur.hunter = k; saveFinderKeys(cur); return send(res, 200, { hunter: true, left: j.data?.requests?.searches?.available != null ? j.data.requests.searches.available - (j.data.requests.searches.used || 0) : null }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    case 'search/stage': {
      const s2 = SRUN[b.id] || loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' });
      const e = (s2.entities || []).find(x => x.id === b.entity); if (!e) return send(res, 404, { error: 'Result not found.' });
      const d = setStage(s2, e, b.stage || null, b.note || ''); if (!d) return send(res, 400, { error: 'Deal stages are for acquisition targets.' });
      return send(res, 200, { deal: d });
    }
    case 'search/research': { try { return send(res, 200, await researchOne(b.search, b.entity, path.join(ROOTWS, 'searches'))); } catch (e) { return send(res, 400, { error: e.message }); } }
    case 'search/decide': {
      const s2 = SRUN[b.id] || loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' });
      const e = (s2.entities || []).find(x => x.id === b.entity); if (!e) return send(res, 404, { error: 'Result not found.' });
      if (b.decision !== undefined) e.decision = ['saved', 'rejected', 'priority', 'weak', null].includes(b.decision) ? b.decision : null;
      if (b.note !== undefined) e.note = String(b.note).slice(0, 2000);
      saveSearch(s2); memDecide(s2, e); return send(res, 200, { ok: true });
    }
    case 'search/watch': { const s2 = loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' }); setWatch(s2, !!b.on, 7); return send(res, 200, { ok: true }); }
    case 'search/watchrun': { const w = watches().find(x => x.id === b.id); if (!w) return send(res, 404, { error: 'Not watched.' }); if (Object.keys(SRUN).length >= 2) return send(res, 409, { error: 'Two searches are already running (see Search history below). Each takes about 4–8 minutes; try again when either finishes.' }); const last = loadSearch(w.lastSearch); watchStarted(w); const s2 = startSearch({ mode: w.mode, objective: w.objective, filters: w.filters, from: last.id, queries: last.queries, watchId: w.id }); return send(res, 200, { id: s2.id }); }
  }
  return false;
}
