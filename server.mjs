import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import { readJson, writeJson } from './lib/fsafe.mjs';
import path from 'node:path';
import { parseGL, accountSummary } from './lib/gl.mjs';
import { CATEGORIES, DEFAULT_ASSUMPTIONS, detectSignMode, periods, pnl, matchRows, normalize, quality, dso, levers, cashRelease, rowValue, r2, dealReturns, VEHICLES, monthlySeries, customerFlow, nonOverlappingPeriods } from './lib/model.mjs';
import { libraryPlan } from './lib/playbooks.mjs';
import { profile, kindOf } from './lib/industry.mjs';
import { thesisCheck, toolFit, whyAion, SUBSECTORS, DILIGENCE, detectSubsector, kindFor, REVENUE_MODELS } from './lib/thesis.mjs';
import { analyzePayroll, analyzeSales, extraLevers } from './lib/extras.mjs';
import { buildWorkbook } from './lib/excel.mjs';
import { initStore, saveSearch, loadSearch, listSearches, archiveSearch, saveSearchMerged } from './lib/search/store.mjs';
import * as OUT from './lib/outreach/outreach.mjs';
import * as CONFIRM from './lib/outreach/confirm.mjs';
import * as GMAIL from './lib/outreach/gmail.mjs';
import { runSearch, checkMore } from './lib/search/pipeline.mjs';
import { initMemory, ingest, decide as memDecide, known, network, stats as memStats, keyOf, setStage, dealOf, pipeline, prune, DEAL_STAGES } from './lib/search/memory.mjs';
import { initContacts, importContacts, contactStats, clearContacts, warm } from './lib/search/contacts.mjs';
import { loadEnv, sources } from './lib/search/sources.mjs';
import { timing, inNiche, listedFor } from './lib/search/timing.mjs';
import { rankAll, rankOne, APPROACH } from './lib/search/rank.mjs';
import { initRadar, brandScan, scans as radarScans, recentEvents, intentScan } from './lib/search/radar.mjs';
let INTENT = null, LAST_INTENT = null; // the deal-intent scan: progress while it runs, and when it last finished
// background jobs that failed: logged and shown on the page (never swallowed), by job (intent, radar, signals)
const JOB_ERR = {};
const jobFailed = what => e => { const msg = String(e?.message || e || 'unknown error').slice(0, 300); JOB_ERR[what] = { at: new Date().toISOString(), error: msg }; console.error(`AION: ${what} stopped: ${msg}`); };
import { addSignals } from './lib/search/pipeline.mjs';
import { initDocs, saveDoc, loadDoc, listDocs, getFirm, setFirm, readSource, draftProposal, draftWriteup, candidateFromSearch } from './lib/docs/docs.mjs';
import { initWatch, watches, setWatch, due, started as watchStarted, finished as watchFinished, watchOf } from './lib/search/watch.mjs';
import { initBenchmarks, loanRates, marketPay, industryNames, peerMargin } from './lib/benchmarks.mjs';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { runClaude, readLog, MODELS } from './lib/claude.mjs';
import { initEngine, detect as detectEngines, resolve as resolveEngine, settings as engineSettings, choose as chooseEngine, setKey, test as testEngine, ENGINES, limits as engineLimits } from './lib/engine.mjs';
import { classifyPrompt, pdfPrompt, addbackPrompt, opsPrompt, planPrompt, leverPromptsPrompt, industryPrompt, outsidePrompt } from './lib/prompts.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// AION_WORKSPACE lets the test suite run against a throwaway copy; the app always uses demo/workspace
const ROOTWS = process.env.AION_WORKSPACE ? path.resolve(process.env.AION_WORKSPACE) : path.join(ROOT, 'workspace');
const DEALS = path.join(ROOTWS, 'deals');
const ARCHIVE = path.join(ROOTWS, 'archive');
const PUB = path.join(ROOT, 'public');
const PORT = +process.env.PORT || 8765;
fs.mkdirSync(DEALS, { recursive: true });

const load = (f, d) => readJson(f, d) ?? d;
const save = (f, v) => writeJson(f, v);
// marketComp: the market salary of whoever runs the firm after closing (the seller or a hire). 225000 is a starting guess,
// shown as "your guess" in Value Creation; change it per deal.
const fresh = () => ({ assumptions: structuredClone(DEFAULT_ASSUMPTIONS), owner: { marketComp: 225000, count: 1, extraOwnerComp: 0, ownerRuleV: 1 } });
const CUR_F = path.join(ROOTWS, 'current.json');
const newId = () => 'd' + Date.now().toString(36);
const niceName = f => String(f || 'New deal').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

// one-time migration: the earlier single workspace becomes the first deal
if (fs.existsSync(path.join(ROOTWS, 'state.json'))) {
  const id = newId(), dd = path.join(DEALS, id); fs.mkdirSync(dd);
  for (const f of fs.readdirSync(ROOTWS)) if (!['deals', 'archive', 'current.json'].includes(f)) fs.renameSync(path.join(ROOTWS, f), path.join(dd, f));
  save(CUR_F, { id });
}

let CUR = null, S = fresh(), ROWS = [], CHECK = [];
const D = () => path.join(DEALS, CUR);
const LOGF = () => CUR ? path.join(D(), 'runlog.jsonl') : null;
const persist = () => { if (CUR) save(path.join(D(), 'state.json'), S); };
function loadDeal(id) {
  if (!id || !fs.existsSync(path.join(DEALS, id))) { CUR = null; S = fresh(); ROWS = []; CHECK = []; save(CUR_F, {}); return; }
  CUR = id; S = load(path.join(D(), 'state.json'), fresh()); ROWS = load(path.join(D(), 'gl.json'), []); CHECK = load(path.join(D(), 'checkin.json'), []);
  S.assumptions = { ...structuredClone(DEFAULT_ASSUMPTIONS), ...(S.assumptions || {}) };
  delete S.assumptions.extra_client_searches;
  // one-time: the old 4.0× default becomes the thesis price (about the target multiple, never above the price cap); a multiple you set yourself stays
  if (!S.assumptions.priceRuleV) { if (S.assumptions.entry_multiple === 4) S.assumptions.entry_multiple = 4; S.assumptions.priceRuleV = 1; }
  S.name ??= niceName(S.file?.name);
  // one-time: an older answer "the seller stays" set the leaders to pay to 0, which added their pay back with nothing taken off.
  // Whoever runs it after closing (the seller or a hire) is paid a market salary, so at least one leader is always paid.
  if (S.owner && !S.owner.ownerRuleV) { if (S.answers?.owner_leaving === false && !S.owner.count) S.owner.count = 1; S.owner.ownerRuleV = 1; }
  save(CUR_F, { id });
}
function newDeal(filename) {
  const id = newId(); fs.mkdirSync(path.join(DEALS, id)); CUR = id; S = { ...fresh(), name: niceName(filename) }; ROWS = []; CHECK = []; save(CUR_F, { id });
}
function listDeals() {
  return fs.readdirSync(DEALS).filter(id => fs.existsSync(path.join(DEALS, id, 'state.json'))).map(id => {
    const st = load(path.join(DEALS, id, 'state.json'), {});
    return { id, name: st.name || niceName(st.file?.name), file: st.file?.name, created: st.file?.uploadedAt, analyzed: !!st.plan };
  }).sort((a, b) => String(a.created).localeCompare(String(b.created)));
}
loadDeal(load(CUR_F, {}).id || listDeals().at(-1)?.id);

// ---------- derived ----------
function derive() {
  if (!S.file || !ROWS.length) return { stage: 'upload' };
  const out = { stage: 'map', range: S.range };
  if (!S.mappingConfirmed) return out;
  const per = periods(S.range);
  out.periods = per.list;
  out.pnl = Object.fromEntries(per.list.map(p => [p.key, pnl(ROWS, S.mapping, S.signMode, p)]));
  out.quality = S.file.kind === 'gl' ? quality(ROWS, S.mapping, S.signMode, per) : null;
  out.priorTTM = S.file.kind === 'gl' && !per.prior.partial ? pnl(ROWS, S.mapping, S.signMode, per.prior) : null;
  out.payConcentration = payConcentration(per.ttm);
  const ttm = out.pnl.TTM;
  out.dso = out.quality ? dso(out.quality.ar, ttm.revenue) : null;
  // no owner on the payroll in published statements (e.g. a public company): management is already paid, so no replacement salary
  const noOwner = S.file.kind === 'pdf' && !ttm.byCat.comp_owner && !S.owner.extraOwnerComp;
  out.normalization = normalize(ttm, S.addbacks || [], noOwner ? { ...S.owner, count: 0 } : S.owner);
  out.noOwnerAdjustment = noOwner;
  if (S.file.kind === 'gl') {
    out.monthly = monthlySeries(ROWS, S.mapping, S.signMode, S.range);
    out.flow = customerFlow(ROWS, S.mapping, S.signMode, S.range);
    const hasWC = Object.values(S.mapping).some(c => c === 'bs_ar' || c === 'bs_ap' || c === 'bs_inventory');
    const last12 = out.monthly.slice(-12);
    // working capital target: the usual amount tied up in money owed to the company plus stock, minus bills it owes
    if (hasWC && last12.length) out.wc = { peg: r2(last12.reduce((t, x) => t + x.wc, 0) / last12.length), latest: last12[last12.length - 1].wc, low: Math.min(...last12.map(x => x.wc)), high: Math.max(...last12.map(x => x.wc)), months: last12.length, hasAP: Object.values(S.mapping).includes('bs_ap'), hasInv: Object.values(S.mapping).includes('bs_inventory') };
  }
  out.stage = S.normConfirmed ? (S.opsConfirmed ? 'levers' : 'ops') : 'earnings';
  if (S.opsConfirmed) {
    out.levers = levers(ttm, S.ops, S.assumptions, S.vendors);
    // optional files: add their levers; the general price rise no longer applies to customers already being brought up to normal price
    const ex = extraLevers(S.extra, S.assumptions);
    const disc = ex.find(x => x.id === 'discounts');
    if (disc) { const overlap = r2(disc.underRevenue * S.assumptions.pricing_uplift * (1 - (S.ops.commission_rate || 0))); out.levers.nonAI.pricing = r2(Math.max(0, out.levers.nonAI.pricing - overlap)); out.levers.nonAI.total = r2(out.levers.nonAI.total - overlap); out.levers.runRate = r2(out.levers.runRate - overlap); }
    out.extraLevers = ex; out.levers.runRate = r2(out.levers.runRate + ex.reduce((t, x) => t + x.value, 0));
    // industry moves: the AI picks the lever and size; software prices it from this company's accounts, with caps
    const IM = S.industryPlan?.moves || [], acct = S.industryPlan?.acct || {}, acctN = S.industryPlan?.acctN || {}, rev = ttm.revenue || 1, gm = rev ? (rev - ttm.direct) / rev : 0, comm = S.ops?.commission_rate || 0;
    out.industryLevers = IM.map((mv, i) => {
      const accts = (mv.accounts || []).filter(k => k in acct), base = accts.reduce((t, k) => t + Math.abs(acct[k]), 0);
      let value = 0, basis = '';
      if (mv.driver === 'price' && base) { const p = Math.min(0.05, Math.max(0, +mv.pct || 0)); value = base * p * (1 - comm); basis = `${$k(base)} of ${accts.join(', ')} × ${+(p * 100).toFixed(1)}% higher price`; }
      else if (mv.driver === 'cost' && base) { const p = Math.min(0.15, Math.max(0, +mv.pct || 0)); value = base * p; basis = `${$k(base)} of ${accts.join(', ')} × ${+(p * 100).toFixed(1)}% lower cost`; }
      else if (mv.driver === 'volume' && S.file.kind === 'gl') {
        // value each extra sale at the average sale of the named revenue account, not the company-wide average job
        const revA = accts.filter(k => acctN[k]), n0 = revA.reduce((t, k) => t + acctN[k], 0), unit = n0 ? revA.reduce((t, k) => t + Math.abs(acct[k]), 0) / n0 : (S.ops?.avg_fee || 0);
        const u = Math.min(n0 ? n0 * 0.25 : (S.ops?.placements_per_year || 0) * 0.1, Math.max(0, +mv.units || 0));
        value = u * unit * gm; basis = `${Math.round(u)} more ${revA.length ? `sales of ${revA.join(', ')}` : 'jobs'} × ${$k(unit)} average × ${Math.round(gm * 100)}% gross margin`;
      }
      value = r2(Math.min(value, rev * 0.05));
      return value > 0 ? { id: 'ind' + i, title: mv.title, why: mv.why, assumptionWhy: mv.assumption_why, driver: mv.driver, accounts: accts, value, basis, steps: (mv.steps || []).map(t => String(t).replace(/^\s*(days?\s*)?\d+\s*[–-]\s*\d+\s*(days?)?\s*[:.\-–]\s*/i, '')), kpis: (mv.kpis || []).map(k => `${k.name}: ${k.today} → ${k.target}`), owner: mv.owner || 'Owner', sure: 'Not counted', cost: Math.max(0, +mv.one_time_cost || 0), weeks: Math.max(0.5, +mv.effort_weeks || 4), build: ['none', 'reuse', 'new'].includes(mv.build) ? mv.build : mv.driver === 'volume' ? 'reuse' : 'none' } : null;
    }).filter(Boolean);
    // ---- No guesses: every counted lever is sized from data ----
    // Benchmark rule: price and direct-cost levers share half of the measured gross-margin gap to peers; overhead levers share half of the
    // overhead gap. If the company already beats the benchmark, or there is no benchmark, those levers are listed but not counted.
    const peer = peerMargin(S.industry?.peer), L0 = out.levers;
    const grossM = rev ? (rev - ttm.direct) / rev : 0, ohM = rev ? ttm.opex / rev : 0;
    const gGap = peer?.gross != null ? Math.max(0, peer.gross - grossM) : null, oGap = peer?.sga != null ? Math.max(0, ohM - peer.sga) : null;
    const pools = { gross: gGap != null ? gGap * rev * 0.5 : 0, overhead: oGap != null ? oGap * rev * 0.5 : 0 };
    const poolOf = x => x.driver === 'price' ? 'gross' : x.driver === 'cost' ? (x.accounts.some(k => CATEGORIES[S.mapping[k]]?.group === 'direct') ? 'gross' : 'overhead') : null;
    const cands = [...out.industryLevers.map(x => ({ x, pool: poolOf(x), raw: x.value })), ...(L0.nonAI.pricing > 0 ? [{ x: { id: 'pricing' }, pool: 'gross', raw: L0.nonAI.pricing }] : [])];
    for (const pool of ['gross', 'overhead']) {
      const cs = cands.filter(c => c.pool === pool), want = cs.reduce((t, c) => t + c.raw, 0), cap = pools[pool];
      for (const c of cs) c.val = want > 0 ? r2(Math.min(c.raw, cap * c.raw / want)) : 0;
    }
    const pct = v => (v * 100).toFixed(1) + '%', gapTxt = pool => pool === 'gross' ? `gross margin ${pct(grossM)} vs ${pct(peer.gross)} for ${peer.industry} (NYU Stern, ${peer.firms} firms)` : `overhead ${pct(ohM)} of sales vs ${pct(peer.sga)} for ${peer.industry} (NYU Stern, ${peer.firms} firms)`;
    out.industryLevers = out.industryLevers.map(x => {
      const c = cands.find(y => y.x === x), pool = c?.pool;
      if (!pool) return { ...x, value: 0, unsized: 'needs sales or pipeline data to size' };
      if (!peer) return { ...x, value: 0, unsized: 'no industry benchmark found to size it' };
      if (!(c.val > 0)) return { ...x, value: 0, unsized: pool === 'gross' ? `already at or above peers on gross margin (${gapTxt(pool)})` : `overhead already at or below peers (${gapTxt(pool)})` };
      return { ...x, value: c.val, sure: 'Benchmark gap', basis: `Half the gap: ${gapTxt(pool)}`, rawValue: x.value };
    });
    const pc = cands.find(c => c.x.id === 'pricing');
    L0.nonAI.pricingRaw = L0.nonAI.pricing; L0.nonAI.pricing = pc && peer ? (pc.val || 0) : 0;
    L0.nonAI.pricingBasis = !peer ? 'no industry benchmark found to size it' : pc?.val > 0 ? `Half the gap: ${gapTxt('gross')}` : `already at or above peers on gross margin (${gapTxt('gross')})`;
    // AI time savings rest on estimated hours, so they are not counted until hours are tracked
    L0.aiUnsized = true; L0.aiSkipped = true;
    L0.nonAI.total = r2(L0.nonAI.pricing + L0.nonAI.writeoffs + L0.nonAI.vendors);
    L0.runRate = r2(L0.nonAI.total + ex.reduce((t, x) => t + x.value, 0) + out.industryLevers.reduce((t, x) => t + x.value, 0));
    out.benchmarkGaps = peer ? { peer, grossM, ohM, gGap, oGap } : null;
    out.cashRelease = cashRelease(out.dso, S.assumptions.dso_reduction_days, ttm.revenue);
    out.proForma = r2(out.normalization.normalized + out.levers.runRate);
    const L = out.levers, costs = L.six.costs.software + L.six.costs.ongoing, gains = L.nonAI.total + L.ai;
    out.range = { low: r2(out.normalization.normalized + gains * 0.5 - costs), high: r2(out.normalization.normalized + gains * 1.5 - costs) };
    out.rates = loanRates();
    out.peer = peer;
    // a business that loses money cannot be priced on a multiple of profit
    out.unpriceable = S.assumptions.price_basis === 'revenue' ? !(ttm.revenue > 0) : out.normalization.normalized <= 0;
    out.deal = out.unpriceable ? null : dealReturns(out.normalization.normalized, L.runRate, { ...S.assumptions, rates: out.rates }, ttm.revenue);
  }
  if (out.deal) {
    // three cases, weighted by how well each number is backed: from the books counts most, guesses least
    const acts = actionList(out).filter(x => x.value > 0), aiCost = 0;
    const W = { 'From the books': [0.8, 1, 1.2], Confirmed: [0.8, 1, 1.2], 'From the sales file': [0.7, 1, 1.2], 'From the payroll file': [0.7, 1, 1.2], 'Benchmark gap': [0.6, 1, 1.3] };
    out.cases = ['Cautious', 'Expected', 'Stretch'].map((name, k) => { const gain = r2(acts.reduce((t, x) => t + x.value * (W[x.sure] || [0.5, 1, 1.3])[k], 0) - aiCost); const r = dealReturns(out.normalization.normalized, gain, { ...S.assumptions, rates: out.rates }, ttm.revenue); return { name, gain, ebitda: r2(out.normalization.normalized + gain), value: r2(gain * out.deal.multiple), moic: r.base.net.moic, irr: r.base.net.irr }; });
  }
  if (CHECK.length && out.monthly && out.deal) out.checkin = checkinAnalysis(out);
  // AION thesis v3.0: books-and-diligence check, tool fit and why AION (lib/thesis.mjs); never one blended score
  if (S.normConfirmed && out.normalization) { const PR = profile(S), check = thesisCheck({ S, d: out, profile: PR }), fit = toolFit({ S, d: out, profile: PR }); out.aion = { check, fit, why: whyAion({ S, d: out, profile: PR, check, fit }) }; }
  out.limits = limits(out);
  return out;
}
const PAYROLL_GENERIC = /payroll|adp|gusto|paychex|rippling|wages|salar|bonus|commission|staff|employees|contractors?$/i;
// share of delivery pay going to the top 1 and top 3 named people in the ledger (3+ people), a stand-in for key-person exposure
function payConcentration(p) {
  const m = {}; for (const r of ROWS) { if (S.mapping?.[r.account] !== 'comp_producers' || !r.name || PAYROLL_GENERIC.test(r.name)) continue; const mk = r.date.slice(0, 7); if (mk < p.from || mk > p.to) continue; m[r.name] = (m[r.name] || 0) + rowValue(r, 'comp_producers', S.signMode); }
  const v = Object.values(m).filter(x => x > 0).sort((a, b) => b - a), tot = v.reduce((t, x) => t + x, 0);
  return v.length >= 3 && tot > 0 ? { people: v.length, top1: r2(v[0] / tot), top3: r2((v[0] + v[1] + v[2]) / tot) } : null;
}
function limits(d) {
  const L = [];
  if (S.file?.kind === 'pdf' && S.pdfFixed?.length) L.push(`Read from the statement totals: ${S.pdfFixed.join('; ')}. Check against the PDF.`);
  if (S.file?.kind === 'pdf') L.push('PDF statements only: client, collections, and transaction-level checks are skipped.');
  else {
    if (!ROWS.some(r => (r.client || r.name) && CATEGORIES[S.mapping?.[r.account]]?.group === 'revenue') && S.mappingConfirmed) L.push('No client names on revenue lines: concentration and repeat-client checks are skipped.');
    if (S.mappingConfirmed && !Object.values(S.mapping || {}).includes('bs_ar')) L.push('No receivables account in the file: collection speed and cash release are skipped.');
  }
  if (S.range) { const per = periods(S.range); if (per.monthsCovered < 12) L.push(`Only ${per.monthsCovered} month${per.monthsCovered === 1 ? '' : 's'} of data: profit covers ${per.monthsCovered} month${per.monthsCovered === 1 ? '' : 's'}, not a full year.`); else if (S.range.start > per.prior.from + '-01') L.push('Only one year of data, so we can’t see growth or which clients come back. Ask the seller for 3 years.'); }
  if (S.file?.kind === 'pdf' && S.pdfDropped?.length) L.push(`Skipped ${S.pdfDropped.join(', ')}: it overlaps a later column, so counting it would add the same months twice.`);
  return L;
}

const view = () => {
  const { accounts, ...rest } = S;
  const derived = derive();
  if (derived.pnl) {
    const pick = r => ({ date: r.date, account: r.account, name: r.client || r.name, memo: r.memo, amount: r.amount });
    const byCat = derived.pnl.TTM.byCat;
    derived.evidence = {
      sample: ROWS.filter(r => CATEGORIES[S.mapping?.[r.account]]?.group === 'revenue').slice(0, 2).concat(ROWS.filter(r => ['direct', 'opex'].includes(CATEGORIES[S.mapping?.[r.account]]?.group)).slice(0, 2)).map(pick),
      addbacks: Object.fromEntries((S.addbacks || []).map(a => [a.id, ROWS.filter(r => a.ids.includes(r.id)).slice(0, 6).map(pick)])),
      topCosts: Object.entries(byCat).filter(([k, v]) => ['direct', 'opex'].includes(CATEGORIES[k].group) && v > 0).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ label: CATEGORIES[k].label, amount: r2(v) })),
      costsTotal: r2(derived.pnl.TTM.direct + derived.pnl.TTM.opex),
    };
  }
  if (rest.plan?.source === 'library' && derived.levers) rest.plan = libraryPlan({ d: derived, S });
  const PRv = profile(S);
  if (derived.levers && PRv.workflows) derived.levers.workflows = derived.levers.workflows.map(w => ({ ...w, label: PRv.workflows[w.key] || w.label }));
  return { state: { ...rest, accounts: accounts?.map(a => ({ ...a, memos: undefined })) }, derived, checks: checks(), categories: CATEGORIES, models: MODELS, profile: PRv, vehicles: VEHICLES };
};

// ---------- AI context builders ----------
function ttmCtx() {
  const d = derive(); const t = d.pnl.TTM;
  return { d, t, byCat: Object.fromEntries(Object.entries(t.byCat).filter(([k, v]) => v && CATEGORIES[k].group !== 'bs')) };
}
function aggregate(filterCats, per) {
  const m = {};
  for (const r of ROWS) {
    const c = S.mapping[r.account]; if (!filterCats.includes(c)) continue;
    const mk = r.date.slice(0, 7); if (mk < per.from || mk > per.to) continue;
    const k = r.account + '¦' + r.name;
    const a = m[k] ??= { account: r.account, payee: r.name || null, category: c, rows: 0, total: 0, dates: new Set(), memos: [] };
    a.rows++; a.total += rowValue(r, c, S.signMode); a.dates.add(r.date);
    if (r.memo && a.memos.length < 8 && !a.memos.includes(r.memo)) a.memos.push(r.memo.slice(0, 80));
  }
  return Object.values(m).map(a => ({ ...a, total: r2(a.total), pay_dates: a.dates.size, dates: undefined })).sort((x, y) => Math.abs(y.total) - Math.abs(x.total));
}
const expenseCats = Object.keys(CATEGORIES).filter(k => ['direct', 'opex', 'below'].includes(CATEGORIES[k].group) && k !== 'interest');

// ---------- jobs ----------
const jobs = {};
// a short "City, State" from whatever location text a result has (drops street addresses, notes and zip codes)
const cityOf = l => { let t = String(l || '').replace(/^(headquarters|hq|headquartered)( is)?( in| at)?\s*/i, '').split(/[(;]|\.\s|\s[–—-]\s/)[0].trim();
  const parts = t.split(',').map(x => x.trim()).filter(Boolean); if (/^\d/.test(parts[0] || '')) t = parts.filter(x => !/^\d|floor|suite|ste\b|unit\b/i.test(x)).slice(-2).join(', ');
  return t.replace(/\s+\d{5}(-\d{4})?$/, '').slice(0, 40); };
const SRUN = {}; // running Proprietary Searches, by id
const SIG = {}; // searches whose data signals are being refreshed
let SCAN = null; // the demand radar scan running now
const DRUN = {}; // documents being drafted
// A letter or document on AION letterhead, printed to PDF by Chrome (the same way as the 1-page summary).
const hx = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function letterHtml(id, kind) {
  const it = OUT.get(id), me = OUT.settings();
  const body = kind === 'letter' ? it.drafts?.letter?.body : it.docs?.[kind]?.body; if (!body) throw new Error('Nothing to print yet.');
  const addr = it.contacts?.other?.find(c => c.kind === 'address')?.value || '';
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const sig = me.signature?.trim() || [me.name, me.title, me.phone].filter(Boolean).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${hx(it.name)}</title><style>@page{size:letter;margin:0.9in 1in}body{font:11.5pt/1.55 -apple-system,"Helvetica Neue",Arial,sans-serif;color:#222}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:28px}header img{height:34px}header div{text-align:right;font-size:9.5pt;color:#555;white-space:pre-line}.to{margin:0 0 22px;white-space:pre-line}.body{white-space:pre-wrap}.sig{margin-top:26px;white-space:pre-line}</style>
<header><img src="http://127.0.0.1:${PORT}/assets/aion-logo-clear.png" alt="AION"><div>${hx([me.legalName || 'AION', me.address, me.phone, it.sender].filter(Boolean).join('\n'))}</div></header>
${kind === 'letter' ? `<p>${hx(date)}</p><p class="to">${hx([it.toName, it.name, addr].filter(Boolean).join('\n'))}</p>` : ''}
${kind === 'letter' ? `<div class="body">${hx(body)}</div>` : docBody(body, it.docs[kind].title)}${kind === 'letter' ? `<div class="sig">${hx(sig)}</div>` : ''}`;
}
// Documents print with their title as a heading: the first line when it's written in capitals, else the document's name.
function docBody(body, title) {
  const [first, ...rest] = String(body).split('\n');
  const capsTitle = /^[A-Z][A-Z ()-]{6,}$/.test(first.trim());
  return `<h1 style="font-size:15pt;margin:0 0 14px">${hx(capsTitle ? first : title)}</h1><div class="body">${hx(capsTitle ? rest.join('\n').replace(/^\n+/, '') : body)}</div>`;
}
async function outreachPdf(id, kind) {
  const dir = path.join(ROOTWS, 'outreach', 'pdf'); fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${String(id).replace(/\W/g, '')}-${String(kind).replace(/\W/g, '')}.pdf`); try { fs.unlinkSync(out); } catch {}
  letterHtml(id, kind); // throws if there is nothing to print
  await new Promise((ok, bad) => {
    const c = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=5000', `--print-to-pdf=${out}`, `http://127.0.0.1:${PORT}/api/outreach/print?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}`]);
    c.on('close', () => fs.existsSync(out) ? ok() : bad(new Error('The PDF was not created. Is Google Chrome installed?'))); c.on('error', bad);
  });
  return fs.readFileSync(out);
}
// Mac notifications for replies, follow-ups that come due and calls about to start (each once).
function notifyMac(title, body) { if (process.env.AION_GMAIL_MOCK === '1') return; const q = t => String(t).replace(/["\\]/g, ' ').slice(0, 200); spawn('osascript', ['-e', `display notification "${q(body)}" with title "AION" subtitle "${q(title)}"`]).on('error', () => {}); }
async function outreachTick() { try { if (GMAIL.accounts().length) await OUT.syncReplies(); for (const a of OUT.alerts()) notifyMac(a.title, a.body); } catch {} }

/** Results worth contacting that have no outreach yet: your saved and priority picks first, then strong fits. */
// ONE owner list, shared by Proprietary Search (owner ranking) and Outreach (ready to start): every firm to buy across all
// searches, ranked once, each row carrying its outreach status. So a firm's number is the same on both screens.
// strongest signs first in "why now": owner exit and succession, then a number two hired, then partnership moves; AI talk last
const CLUE_ORDER = { exit_planning: 0, recap_interest: 0, retirement: 0, succession: 1, next_chapter: 1, career_length: 2, second_in_command: 2, partner_left: 2, partner_program: 3, alliance: 3, subcontracts: 3, capacity_strain: 4, growth_hiring: 4, new_service: 4, stale_website: 5, going_quiet: 5, ai_interest: 8 };
const unent = t => String(t || '').replace(/&#x27;|&#39;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d));
const normName = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(llc|inc|corp|co|the|group|ltd)\b/g, '').trim();
const FINDERS = () => path.join(ROOTWS, 'finders.json');
function finderKeys() { try { return JSON.parse(fs.readFileSync(FINDERS(), 'utf8')); } catch { return {}; } }
function saveFinderKeys(k) { writeJson(FINDERS(), k, { mode: 0o600 }); }
function ownerList() {
  const B = OUT.board(), byKey = new Map(B.map(x => [`${x.search}|${x.entity}`, x])), byName = new Map(B.filter(x => x.mode === 'target').map(x => [normName(x.name), x]));
  const ss = listSearches().map(h => loadSearch(h.id)).filter(Boolean).sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  const outOf = (s2, e) => byKey.get(`${s2.id}|${e.id}`) || byName.get(normName(e.company));
  const R = rankAll(ss, { warm: e => warm('target', e), contacted: (s2, e) => !!outOf(s2, e), niche: false });
  const find = x => { const s2 = ss.find(y => y.id === x.search); return [s2, s2?.entities.find(y => y.id === x.entity)]; };
  const slim = x => { const [s2, e] = find(x), o = s2 && e ? outOf(s2, e) : null;
    return { search: x.search, entity: x.entity, rank: x.rank, name: x.name, website: x.website, place: x.place, industry: x.industry, fit: x.fit, fitRecounted: !!x.fitRecounted, niche: x.niche, focus: x.focus, segment: x.segment, segmentLabel: x.segmentLabel, rankScore: x.score, parts: x.parts, size: x.size, offer: x.offer, offerWhy: x.offerWhy, email: x.email || '', box: x.box, kinds: x.kinds, approach: x.approach, approachText: APPROACH[x.approach], owner: x.owner, emails: x.emails, phone: x.phone, warmIntro: x.warmIntro, contacted: !!o, why: x.why, intent: x.intent,
      outreach: o ? { id: o.id, phase: o.phase, status: o.status, sentAt: o.sentAt, sender: o.sender, to: o.to } : null, decision: e?.decision || '',
      deal: s2 && e ? dealOf(s2, e)?.stage || '' : '',
      signals: x.signals.filter(y => y.path).map(y => ({ key: y.key, label: y.label, path: y.path, text: unent(y.text), url: y.url, date: y.date, direction: y.direction, confidence: y.confidence, source: y.source })).sort((a, b) => (CLUE_ORDER[a.key] ?? 5) - (CLUE_ORDER[b.key] ?? 5)) }; };
  // one list, one numbering: every firm is a buyout (full or majority); a partnership only when the firm asked for one
  const list = R.ranked.map(slim); let n = 0; for (const x of list) { x.track = x.offer === 'partner' ? 'partner' : 'buy'; if (x.niche) x.nicheRank = ++n; }
  return { R, list, ss };
}
function outreachReady() {
  const { list, ss } = ownerList(), out = [];
  // firms to buy: the owner ranking's buy-box firms (in a segment, not set aside), in rank order, not yet in outreach
  for (const x of list) { if (x.outreach || !x.niche || x.box?.status === 'out') continue;
    out.push({ search: x.search, entity: x.entity, mode: 'target', name: x.name, where: x.place, score: x.fit, picked: ['saved', 'priority'].includes(x.decision), priority: x.decision === 'priority', emails: x.emails, pitch: x.offer, track: x.track, dealWhy: x.offerWhy, box: x.box, high: !!x.intent?.high, rankScore: x.rankScore, rank: x.nicheRank, segment: x.segment, segmentLabel: x.segmentLabel, site: !!x.website }); }
  // anything else you saved yourself (a firm outside the segments, a brand, a person) comes after, so nothing you picked is lost
  const B = OUT.board(), have = new Set(B.map(x => `${x.search}|${x.entity}`)), seen = new Set(out.map(r => normName(r.name)));
  for (const s2 of ss) for (const e of (s2.entities || []).filter(e => e.scored && ['saved', 'priority'].includes(e.decision))) {
    const name = s2.mode === 'candidate' ? e.name : e.company; if (have.has(`${s2.id}|${e.id}`) || seen.has(normName(name))) continue;
    if (s2.mode === 'target' && (e.listed || listedFor((e.timing?.signals || []).map(x => ({ ...x, signal: x.key })), e))) continue;
    if (s2.mode === 'target' && list.some(x => x.search === s2.id && x.entity === e.id && x.outreach)) continue;
    seen.add(normName(name)); const R = s2.mode === 'target' ? rankOne(e) : null;
    out.push({ search: s2.id, entity: e.id, mode: s2.mode, name, where: String(e.location || '').split(/\s[(;]/)[0], score: e.score ?? 0, picked: true, priority: e.decision === 'priority', emails: (e.contactInfo || []).filter(c => c.kind === 'email').length, pitch: R ? R.offer : null, box: R?.box || null, high: !!R?.intent?.high, rankScore: R?.score ?? null, rank: null, segment: R?.segment || null, segmentLabel: R?.segmentLabel || null, site: !!e.website });
  }
  return out.slice(0, 80);
}
function runDoc(d, fn) { DRUN[d.id] = true; d.log = []; const log = t => { d.log.push({ t: new Date().toISOString(), text: t }); saveDoc(d); }; fn(d, { cwd: path.join(ROOTWS, 'docs'), model: MODELS.analysis, log }).catch(e => { d.status = 'failed'; d.error = e.message; saveDoc(d); }).finally(() => { delete DRUN[d.id]; }); }
function startSearch({ mode, objective, filters, from, queries, criteria, link, watchId }) {
  const prev = from ? loadSearch(from) : null;
  const s2 = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), mode, objective, filters: filters || {}, created: new Date().toISOString(), status: 'running', from: from || null, link: link || null, watchId: watchId || null,
    strategy: queries?.length && prev ? { ...prev.strategy, criteria: criteria || prev.strategy.criteria } : null, queries: queries?.length ? queries.map(q => typeof q === 'string' ? { q } : q).filter(q => q.q?.trim()) : null };
  SRUN[s2.id] = s2; saveSearch(s2);
  runSearch(s2, { cwd: path.join(ROOTWS, 'searches'), model: MODELS.extraction, emit: () => {} }).then(() => {
    const w = watchId && watches().find(x => x.id === watchId);
    // "new" means never found by any earlier search in your network
    if (w) { s2.fresh = (s2.entities || []).filter(e => !known(s2, e)).map(e => e.id); saveSearch(s2); }
    ingest(s2);
    if (w) watchFinished(w, s2, s2.fresh.length);
  }).finally(() => { delete SRUN[s2.id]; });
  return s2;
}
// a search cut off by a restart: one that had not reached the in-depth checks starts again (keeping its strategy);
// one that had checked firms keeps them and is marked partial, so "Check more in depth" can carry on
function resumeInterrupted() {
  for (const h of listSearches()) { if (h.status !== 'running' || SRUN[h.id]) continue; const s2 = loadSearch(h.id); if (!s2) continue;
    const checked = (s2.entities || []).filter(e => e.scored).length;
    if (checked) { s2.status = 'partial'; s2.stage = 'done'; (s2.log ||= []).push({ t: (Date.now() - (s2.t0 || Date.now())) / 1000, text: `Interrupted by a restart after ${checked} in-depth checks. Use “Check more in depth” to continue.` }); saveSearch(s2); continue; }
    if (Object.keys(SRUN).length >= 2) { s2.status = 'failed'; s2.error = 'Interrupted by a restart; run it again.'; s2.stage = 'done'; saveSearch(s2); continue; }
    SRUN[s2.id] = s2; console.log(`Resuming search ${s2.id} after a restart`);
    runSearch(s2, { cwd: path.join(ROOTWS, 'searches'), model: MODELS.extraction, emit: () => {} }).then(() => ingest(s2)).finally(() => { delete SRUN[s2.id]; });
  }
}
if (!process.env.AION_NO_RESUME) setTimeout(resumeInterrupted, 2000);
// weekly watchlists: check every 30 minutes while the app is running
setInterval(() => { for (const w of due()) { if (Object.keys(SRUN).length >= 2) break; const last = loadSearch(w.lastSearch); if (!last) continue; watchStarted(w); startSearch({ mode: w.mode, objective: w.objective, filters: w.filters, from: last.id, queries: last.queries, watchId: w.id }); } }, 30 * 60000);
const busy = () => Object.values(jobs).some(j => j.status === 'running');
function job(name, fn) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  jobs[id] = { id, name, status: 'running', started: Date.now() };
  fn(jobs[id]).then(() => { jobs[id].status = 'done'; persist(); }).catch(e => { jobs[id].status = 'error'; jobs[id].error = e.message; console.error(`Job ${id} failed:`, e.stack); });
  return id;
}

const NAME_CATS = ['comp_producers', 'comp_admin', 'comp_owner', 'cos_contractors', 'payroll_burden'];
function nameMap() {
  if (S.maskNames === false) return null;
  const names = new Set();
  for (const r of ROWS) {
    const c = S.mapping?.[r.account], g = CATEGORIES[c]?.group;
    if (r.client) names.add(r.client);
    if (r.name && (g === 'revenue' || NAME_CATS.includes(c) || c === 'bs_ar')) names.add(r.name);
  }
  const list = [...names].filter(n => n && n.length >= 3).sort((a, b) => b.length - a.length);
  return list.map((n, i) => [n, `NAME_${String(i + 1).padStart(3, '0')}`]);
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function maskText(t, m) { if (!m) return t; for (const [n, tok] of m) t = t.replace(new RegExp(esc(n), 'g'), tok); return t; }
function unmask(v, m) {
  if (!m) return v;
  if (typeof v === 'string') { for (const [n, tok] of m) v = v.split(tok).join(n); return v; }
  if (Array.isArray(v)) return v.map(x => unmask(x, m));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unmask(x, m)]));
  return v;
}
let FRESH = false;
const CACHE = path.join(ROOTWS, 'cache');
async function ask(opts) {
  const m = opts.allowRead || opts.noMask ? null : nameMap();
  const prompt = maskText(opts.prompt, m);
  const key = crypto.createHash('sha256').update(opts.model + '\n' + prompt + (opts.allowRead ? S.file?.sha : '')).digest('hex');
  const cf = path.join(CACHE, key + '.json');
  const what = { 'Map GL accounts to categories': 'sorting the accounts', 'Propose add-backs, vendor opportunities and flags': 'looking for one-off costs and risks', 'Infer operating inputs from the GL': 'estimating team size and fees', 'Industry value-creation moves': 'finding moves that work in this industry', 'Outside check on the web': 'searching the web for this company', 'Extract P&L from PDF statements': 'copying the statements' }[opts.purpose] || opts.purpose;
  const t0 = Date.now();
  if (!FRESH && fs.existsSync(cf)) {
    const data = load(cf, null);
    if (data) { fs.appendFileSync(LOGF(), JSON.stringify({ at: new Date().toISOString(), purpose: opts.purpose + ' (saved answer reused)', model: opts.model, ms: 0, prompt, response: JSON.stringify(data) }) + '\n'); detail(`Using the AI’s saved answer for this same file (${what})`); liveItems(opts.purpose, JSON.stringify(data), m); return { data: unmask(data, m) }; }
  }
  tick(`AI is ${what}…`, false);
  detail(`Asked the AI: ${what}${m ? ' (customer and staff names hidden)' : ''}`);
  const r = await runClaude({ ...opts, prompt, onText: t => liveItems(opts.purpose, t, m) });
  tick(`AI finished ${what}`, false);
  fs.mkdirSync(CACHE, { recursive: true }); save(cf, r.data);
  return { ...r, data: unmask(r.data, m) };
}

const AI = {
  async outside(name, place) {
    const { data } = await ask({ purpose: 'Outside check on the web', model: MODELS.extraction, prompt: outsidePrompt({ name, place, industry: profile(S).name }), cwd: D(), logFile: LOGF(), allowWeb: true, noMask: true, timeoutMs: 300000 });
    S.outside = { name, place, at: new Date().toISOString(), rating: data.rating?.value ? data.rating : null, findings: (data.findings || []).filter(f => /^https?:\/\//.test(f.url || '')), notFound: data.not_found || [] };
  },
  async industry() {
    const d = derive(), per = periods(S.range), ttm = per.ttm;
    const acct = {}, acctN = {}; for (const r of ROWS) { const c = S.mapping[r.account], g = CATEGORIES[c]?.group; if (!['revenue', 'direct', 'opex'].includes(g) || r.date.slice(0, 7) < ttm.from || r.date.slice(0, 7) > ttm.to) continue; acct[r.account] = (acct[r.account] || 0) + rowValue(r, c, S.signMode); if (g === 'revenue') acctN[r.account] = (acctN[r.account] || 0) + 1; }
    const pick = gs => Object.entries(acct).filter(([k]) => gs.includes(CATEGORIES[S.mapping[k]]?.group)).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 40).map(([account, total]) => ({ account, total: r2(total) }));
    const ctx = { revenue: pick(['revenue']), costs: pick(['direct', 'opex']), ops: S.ops, monthly: (d.monthly || []).map(x => ({ m: x.m, sales: x.revenue, profit: x.profit })), customers: d.quality ? { count: d.quality.customersTTM, top1: d.quality.top1, top5: d.quality.top5, retention: d.quality.retention, days_to_get_paid: d.dso } : null };
    const { data } = await ask({ purpose: 'Industry value-creation moves', model: MODELS.extraction, prompt: industryPrompt(ctx, profile(S), industryNames()), cwd: D(), logFile: LOGF() });
    S.industryPlan = { moves: (data.moves || []).slice(0, 4), acct, acctN };
    if (S.industry && !S.industry.peer && industryNames().includes(data.peer_industry)) S.industry.peer = data.peer_industry;
  },
  async classify() {
    if (S.file.kind !== 'gl') throw new Error('Account mapping applies to GL uploads.');
    const { data } = await ask({ purpose: 'Map GL accounts to categories', model: MODELS.extraction, prompt: classifyPrompt(S.accounts, S.industry?.byUser ? S.industry.name : null, industryNames()), cwd: D(), logFile: LOGF() });
    const tm = data.typical_margin && +data.typical_margin.low > 0 && +data.typical_margin.high > +data.typical_margin.low ? { low: +data.typical_margin.low, high: +data.typical_margin.high } : null;
    const sub = SUBSECTORS[data.subsector] ? data.subsector : null;
    const models = (data.revenue_models || []).filter(x => REVENUE_MODELS[x?.model]).map(x => ({ model: x.model, share: Math.min(1, Math.max(0, +x.share || 0)) })).slice(0, 6);
    if (!S.industry?.byUser && data.industry) { const kind = data.talent_firm === true || sub === 'talent' || kindOf(data.industry) === 'staffing' ? 'staffing' : 'general'; const keep = S.industry?.subsectorSet ? { subsector: S.industry.subsector, subsectorSet: true, kind: S.industry.subsector ? kindFor(S.industry.subsector) : 'general' } : {}; S.industry = { name: String(data.industry).slice(0, 60), kind, subsector: kind === 'staffing' ? 'talent' : sub, margin: tm, ...keep }; }
    else if (S.industry) S.industry.margin = tm;
    if (S.industry) { if (!S.industry.byUser && !S.industry.subsectorSet && sub && S.industry.kind !== 'staffing') S.industry.subsector = sub; S.industry.revenueModels = models; S.industry.delivery = String(data.delivery_model || '').slice(0, 120); }
    if (S.industry) S.industry.peer = industryNames().includes(data.peer_industry) ? data.peer_industry : null;
    const ai = {};
    for (const a of data.accounts || []) if (CATEGORIES[a.category]) ai[a.account] = a;
    S.mappingAI = ai;
    S.mapping = Object.fromEntries(S.accounts.map(a => [a.account, ai[a.account]?.category || 'other_opex']));
    S.signMode = detectSignMode(ROWS, S.mapping);
    S.mappingConfirmed = false;
  },
  async pdf() {
    const { data } = await ask({ purpose: 'Extract P&L from PDF statements', model: MODELS.extraction, prompt: pdfPrompt(S.file.stored, industryNames()), cwd: D(), logFile: LOGF(), allowRead: true, pdf: path.join(D(), S.file.stored) });
    const per = (data.periods || []).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.end));
    // CIMs often show full years plus a trailing-12-month column: never count overlapping periods twice.
    { const kept = nonOverlappingPeriods(per); S.pdfDropped = per.filter(p => !kept.includes(p)).map(p => p.label); per.splice(0, per.length, ...kept); }
    if (!per.length || !data.lines?.length) throw new Error('No income-statement lines with dated periods were extracted. Check the PDF in the run log.');
    // safety net: a statement whose only revenue (or cost of revenue) line is a "Total ..." line must not lose it
    S.pdfFixed = [];
    if (!data.lines.some(l => CATEGORIES[l.category]?.group === 'revenue')) { const l = data.lines.find(x => /^(total\s+)?(net\s+)?(operating\s+)?(revenues?|sales)\b/i.test(String(x.label).trim())); if (l) { l.category = 'rev_sales'; S.pdfFixed.push(`${l.label} counted as revenue`); } }
    if (!data.lines.some(l => CATEGORIES[l.category]?.group === 'direct')) { const l = data.lines.find(x => /^(total\s+)?cost of (revenues?|sales|goods sold|services)\b/i.test(String(x.label).trim())); if (l) { l.category = 'cogs'; S.pdfFixed.push(`${l.label} counted as a direct cost`); } }
    const mult = [1, 1000, 1000000].includes(+data.unit_multiplier) ? +data.unit_multiplier : 1;
    ROWS = []; const ai = {};
    for (const ln of data.lines) {
      if (!CATEGORIES[ln.category]) continue;
      const acct = `${ln.label} (p.${ln.page ?? '?'})`;
      ai[acct] = { account: acct, category: ln.category, confidence: 0.8, reason: `PDF page ${ln.page ?? '?'}` };
      for (const p of per) {
        const v = ln.values?.[p.label]; if (typeof v !== 'number') continue;
        ROWS.push({ id: ROWS.length + 1, date: p.end, account: acct, type: 'Statement', num: '', name: '', memo: `${p.label} · ${p.months || '?'} months`, split: '', amount: v * mult, balance: null, src: ln.page ?? null });
      }
    }
    save(path.join(D(), 'gl.json'), ROWS);
    const dates = ROWS.map(r => r.date).sort();
    S.range = { start: dates[0].slice(0, 8) + '01', end: dates[dates.length - 1] };
    S.accounts = accountSummary({ rows: ROWS });
    S.pdfMeta = { company: data.company, periods: per, notes: data.notes, unit: mult };
    // what kind of business, and which public peers to compare with (the GL path gets these from the account mapping)
    if (!S.industry?.byUser && data.industry) {
      const tm = data.typical_margin && +data.typical_margin.low > 0 && +data.typical_margin.high > +data.typical_margin.low ? { low: +data.typical_margin.low, high: +data.typical_margin.high } : null;
      const keep = S.industry?.subsectorSet ? { subsector: S.industry.subsector, subsectorSet: true } : { subsector: SUBSECTORS[data.subsector] ? data.subsector : null };
      S.industry = { name: String(data.industry).slice(0, 60), kind: kindOf(String(data.industry)), ...keep, margin: tm, revenueModels: (data.revenue_models || []).filter(x => REVENUE_MODELS[x?.model]).map(x => ({ model: x.model, share: Math.min(1, Math.max(0, +x.share || 0)) })).slice(0, 6), peer: industryNames().includes(data.peer_industry) ? data.peer_industry : null };
    }
    S.mappingAI = ai;
    S.mapping = Object.fromEntries(S.accounts.map(a => [a.account, ai[a.account]?.category || 'exclude']));
    S.signMode = 'natural'; S.mappingConfirmed = false;
  },
  async addbacks() {
    const { d, byCat } = ttmCtx();
    const per = periods(S.range);
    const q = d.quality ? { engagements: d.quality.engagementsTTM, avgRevenuePerEngagement: d.quality.avgRevenuePerEngagement, customers: d.quality.customersTTM, top1: d.quality.top1, top5: d.quality.top5, retention: d.quality.retention, avgInvoice: d.quality.avgInvoice, installmentShare: d.quality.installmentShare, hasReceivables: !!d.quality.ar } : { note: 'statement-level data only' };
    const payees = aggregate(expenseCats, per.ttm).slice(0, 160).map(a => ({ account: a.account, payee: a.payee, category: a.category, rows: a.rows, ttm_total: a.total, sample_memos: a.memos }));
    const { data } = await ask({ purpose: 'Propose add-backs, vendor opportunities and flags', model: MODELS.extraction, prompt: addbackPrompt({ ttm: byCat, quality: q, payees }, profile(S)), cwd: D(), logFile: LOGF() });
    // standard practice: add-backs come only from costs inside operating profit (not depreciation, impairment, interest or tax)
    const inEbitda = a => ['direct', 'opex'].includes(CATEGORIES[S.mapping[a.account]]?.group);
    S.addbacks = (data.addbacks || []).filter(inEbitda).map((a, i) => { const m = matchRows(ROWS, a, S.mapping, S.signMode, per.ttm); return { ...a, id: 'ab' + i, amount: m.amount, ids: m.ids, accepted: false }; }).filter(a => a.ids.length);
    S.vendors = (data.vendors || []).map((v, i) => { const m = matchRows(ROWS, v, S.mapping, S.signMode, per.ttm); const pct = Math.min(0.5, Math.max(0, +v.suggested_savings_pct || 0)); return { ...v, id: 'v' + i, spend: m.amount, ids: m.ids, pct, amount: r2(m.amount * pct), accepted: false }; }).filter(v => v.ids.length);
    S.flags = (data.flags || []).map(f => ({ ...f, title: String(f?.title || f?.label || f?.text || "").trim() })).filter(f => f.title); // the AI sometimes says "label"
    S.normConfirmed = false;
  },
  async ops() {
    const { d, byCat } = ttmCtx();
    const per = periods(S.range);
    const payroll = aggregate(['comp_producers', 'comp_admin', 'comp_owner', 'cos_contractors', 'payroll_burden'], per.ttm).slice(0, 120).map(a => ({ payee: a.payee, account: a.account, category: a.category, ttm_total: a.total, pay_dates: a.pay_dates }));
    const q = d.quality;
    const revenue = { ttm_revenue: d.pnl.TTM.revenue, mix: Object.fromEntries(Object.entries(byCat).filter(([k]) => k.startsWith('rev_'))), invoices: q?.invoicesTTM ?? null, avg_invoice: q?.avgInvoice ?? null, installment_share: q?.installmentShare ?? null, customers: q?.customersTTM ?? null, engagements_billed_ttm: q?.engagementsTTM ?? null, avg_revenue_per_engagement: q?.avgRevenuePerEngagement ?? null };
    const { data } = await ask({ purpose: 'Infer operating inputs from the GL', model: MODELS.extraction, prompt: opsPrompt({ ttm: byCat, revenue, payroll }, profile(S)), cwd: D(), logFile: LOGF() });
    S.opsAI = data;
    const GENERIC = PAYROLL_GENERIC;
    const people = new Set(ROWS.filter(r => S.mapping[r.account] === 'comp_producers' && r.name && !GENERIC.test(r.name)).map(r => r.name));
    if (people.size >= 2) { data.inputs = data.inputs || {}; data.inputs.producers = { value: people.size, basis: 'from GL', evidence: `${people.size} people paid as ${profile(S).workers} in the ledger (partners paid through payroll may add more)`, confidence: 0.9 }; }
    const inp = data.inputs || {};
    const val = k => +(inp[k]?.value ?? 0) || 0;
    S.ops = { producers: val('producers'), admin_fte: val('admin_fte'), owners: val('owners'), placements_per_year: val('placements_per_year'), avg_fee: val('avg_fee'), commission_rate: val('commission_rate'), hours_per_search: val('hours_per_search'), loaded_cost_producer: val('loaded_cost_producer'),
      hours: Object.fromEntries(['research', 'sourcing', 'outreach', 'crm', 'reporting', 'backoffice'].map(k => [k, val('hours.' + k)])) };
    S.opsConfirmed = false;
  },
  async plan() {
    const d = derive();
    const company = { ttm_revenue: d.pnl.TTM.revenue, reported_ebitda: d.normalization.reported, normalized_ebitda: d.normalization.normalized, revenue_mix: Object.fromEntries(Object.entries(d.pnl.TTM.byCat).filter(([k, v]) => k.startsWith('rev_') && v)), cost_lines: Object.fromEntries(Object.entries(d.pnl.TTM.byCat).filter(([k, v]) => !k.startsWith('rev_') && !k.startsWith('bs_') && v)), quality: d.quality && { customers: d.quality.customersTTM, top1: d.quality.top1, top5: d.quality.top5, retention: d.quality.retention, installmentShare: d.quality.installmentShare }, dso: d.dso, operating_inputs: S.ops, assumptions: { ...S.assumptions, workflows: undefined } };
    const lev = { nonAI: d.levers.nonAI, workflows: d.levers.workflows.map(w => ({ key: w.key, label: w.label, hoursSaved: w.hoursSaved })), six: d.levers.six, runRate: d.levers.runRate, year1: d.levers.year1, roi: d.levers.roi, paybackMonths: d.levers.paybackMonths, cashRelease: d.cashRelease, vendors: (S.vendors || []).filter(v => v.accepted).map(v => ({ label: v.label, amount: v.amount })) };
    const { data } = await ask({ purpose: 'Write value-creation & AI deployment plan with prompts', model: MODELS.analysis, prompt: planPrompt({ company, levers: lev, flags: S.flags || [] }), cwd: D(), logFile: LOGF(), timeoutMs: 900000 });
    const aiLevers = (data.levers || []).filter(l => l.type === 'ai');
    const results = await Promise.allSettled(aiLevers.map(l => ask({ purpose: 'Write Claude Code prompts · ' + l.title, model: MODELS.analysis, prompt: leverPromptsPrompt({ company, lever: { title: l.title, why: l.why, steps: l.steps, human_gate: l.human_gate, data_and_tools: l.data_and_tools, kpis: l.kpis } }), cwd: D(), logFile: LOGF() })));
    aiLevers.forEach((l, i) => { const r = results[i]; l.prompts = r.status === 'fulfilled' ? (r.value.data.prompts || []) : []; if (r.status !== 'fulfilled') l.promptError = r.reason?.message || 'failed'; });
    S.plan = { ...data, source: 'opus' }; S.planAt = new Date().toISOString(); S.planInputsHash = hashInputs();
  },
};
let CURJ = null;
const detail = text => { if (!CURJ) return; CURJ.detail ??= []; if (CURJ.detail.some(x => x.text === text)) return; CURJ.detail.push({ t: (Date.now() - CURJ.t0) / 1000, text, step: CURJ.step ?? 0 }); };
// pull finished items out of the AI's half-written JSON and describe them in plain words
const LIVE = {
  'Map GL accounts to categories': [[/"industry"\s*:\s*"([^"]+)"/g, m => `Looks like a ${m[1]}`],
    [/"account"\s*:\s*"([^"]+)"\s*,\s*"category"\s*:\s*"([^"]+)"\s*,\s*"confidence"\s*:\s*([0-9.]+)\s*[,}]/g, m => `Sorted “${m[1]}” → ${CATEGORIES[m[2]]?.label || m[2]} (${Math.round(+m[3] * 100)}% sure)`]],
  'Propose add-backs, vendor opportunities and flags': [[/"label"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"(personal|one_time|non_operating|related_party|other)"/g, m => `Possible cost a new owner won’t pay: ${m[1]}`],
    [/"label"\s*:\s*"([^"]+)"\s*,\s*"account"\s*:\s*"[^"]*"\s*,\s*"payee"\s*:\s*(?:"[^"]*"|null)\s*,\s*"suggested_savings_pct"/g, m => `Possible saving: ${m[1]}`],
    [/"severity"\s*:\s*"(high|medium|low)"\s*,\s*"title"\s*:\s*"([^"]+)"/g, m => `${m[1] === 'high' ? 'Important to check' : 'To check'}: ${m[2]}`]],
  'Outside check on the web': [[/"title"\s*:\s*"([^"]+)"\s*,\s*"summary"/g, m => `Found online: ${m[1]}`]],
  'Industry value-creation moves': [[/"title"\s*:\s*"([^"]+)"\s*,\s*"why"/g, m => `Industry move to price: ${m[1]}`]],
  'Infer operating inputs from the GL': [[/"(producers|admin_fte|owners|placements_per_year|avg_fee)"\s*:\s*\{\s*"value"\s*:\s*([0-9.]+)\s*[,}]/g, m => `Estimated ${{ producers: 'front-line staff', admin_fte: 'office staff', owners: 'owners working in it', placements_per_year: 'jobs a year', avg_fee: 'average revenue per job ($)' }[m[1]]}: ${Math.round(+m[2]).toLocaleString()}`]],
};
function liveItems(purpose, text, m) { for (const [re, fmt] of LIVE[purpose] || []) { re.lastIndex = 0; let x; while ((x = re.exec(text))) detail(String(unmask(fmt(x), m))); } }
const tick = (text, done = true) => { if (!CURJ) return; CURJ.now = text; if (done) CURJ.log.push({ t: (Date.now() - CURJ.t0) / 1000, text, step: CURJ.step ?? 0 }); };
async function runAll(j) {
  CURJ = j; j.t0 = Date.now(); j.log = []; j.detail = [];
  const set = (i, label) => { j.step = i; j.label = label; };
  const sum = xs => xs.reduce((a, x) => a + x, 0);
  try {
    set(0, 'Reading the ledger');
    if (S.file.kind === 'pdf' && !S.accounts?.length) { detail('Asked the AI to copy each line of the PDF statements, with page numbers'); tick('AI is copying the statements…', false); await AI.pdf(); persist(); }
    detail(`Opened ${S.file.name}: ${ROWS.length.toLocaleString()} payments in ${S.accounts.length} accounts, ${S.range?.start} to ${S.range?.end}`);
    const big = [...S.accounts].sort((x, y) => Math.abs(y.total) - Math.abs(x.total)).slice(0, 3);
    detail(`Largest accounts: ${big.map(a => `${a.account} (${a.count.toLocaleString()} lines)`).join(', ')}`);
    tick(`Read ${ROWS.length.toLocaleString()} payments`);
    const net = ROWS.reduce((a, r) => a + r.amount, 0);
    if (S.file.kind === 'gl') detail(Math.abs(net) < 1 ? 'Added every debit and credit: they match to the cent' : `Debits and credits are off by ${$k(Math.abs(net))}: some accounts may be missing`);
    tick(S.file.kind === 'gl' ? (Math.abs(net) < 1 ? 'Money in and out match. Nothing missing.' : 'Money in and out don’t fully match. Flagged to check.') : 'Statement lines loaded');
    set(1, 'Sorting accounts');
    if (S.file.kind === 'gl') await AI.classify();
    S.mappingConfirmed = true; persist();
    const t = derive().pnl.TTM;
    detail(`Software added it up for the last 12 months: sales ${$k(t.revenue)} − costs ${$k(t.revenue - t.ebitda)} = profit ${$k(t.ebitda)}`);
    tick(`AI sorted ${S.accounts.length} accounts into sales, pay and costs`);
    tick(`Profit today: ${$k(t.ebitda)} a year`);
    set(2, 'Checking earnings and operations');
    detail('Sent the biggest cost groups (with sample memos) to look for costs a new owner won’t pay, and payroll totals to estimate team size');
    if (S.file.kind === 'pdf') { S.ops = { producers: 0, admin_fte: 0, owners: 0, placements_per_year: 0, avg_fee: 0, commission_rate: 0, hours_per_search: 0, loaded_cost_producer: 0, hours: {} }; S.opsAI = { inputs: {}, caveats: ['Financial statements show totals only. Team size, hours and fees need a payroll report or the general ledger.'] }; detail('Statements show totals only, so team size and hours are not estimated'); await AI.addbacks(); }
    else await Promise.all([AI.addbacks(), AI.ops()]);
    S.normConfirmed = true; S.opsConfirmed = true; persist();
    for (const a of S.addbacks || []) detail(`Checked against the ledger: ${a.label} = ${$k(a.amount)} across ${a.ids.length} payment${a.ids.length === 1 ? '' : 's'}`);
    tick(`${$k(sum((S.addbacks || []).map(x => x.amount)))} of costs a new owner won’t pay. ${(S.flags || []).length} things to check.`);
    set(3, 'Finding improvements');
    detail(`Asked for the moves that work best for a ${profile(S).name}, using this company’s own accounts`);
    try { await AI.industry(); persist(); } catch (e) { detail('Industry moves could not be found this time; the rest of the plan still stands'); }
    const d = derive(), L = d.levers, a = S.assumptions;
    if (d.benchmarkGaps) { const g = d.benchmarkGaps, P = v => (v * 100).toFixed(1) + '%'; detail(`Benchmark (${g.peer.industry}, NYU Stern, ${g.peer.firms} firms): gross margin ${P(g.grossM)} vs ${P(g.peer.gross)}, overhead ${P(g.ohM)} of sales vs ${P(g.peer.sga)}`); }
    for (const x of d.industryLevers || []) detail(x.value > 0 ? `Sized: ${x.title} → +${$k(x.value)} a year (${x.basis})` : `Not counted: ${x.title} (${x.unsized})`);
    if (L.nonAI.pricing > 0) detail(`Sized: price increase → +${$k(L.nonAI.pricing)} a year (${L.nonAI.pricingBasis})`);
    if (L.nonAI.writeoffs > 0) detail(`Priced: ${Math.round(a.writeoff_reduction * 100)}% fewer unpaid invoices written off → +${$k(L.nonAI.writeoffs)} a year`);
    if (d.cashRelease) detail(`Priced: getting paid ${a.dso_reduction_days} days faster → ${$k(d.cashRelease)} of cash, once`);
    for (const x of d.extraLevers || []) detail(x.id === 'discounts' ? `Priced: ${x.basis.count} customers brought up to normal prices → +${$k(x.value)} a year` : `Priced: less overtime → +${$k(x.value)} a year`);
    detail('AI time savings are listed but not counted: they need tracked hours to size');
    if (d.peer) detail(`Compared profit (${Math.round(d.normalization.normalized / t.revenue * 100)}% of sales) with ${d.peer.firms} large US companies in ${d.peer.industry}: ${Math.round(d.peer.ebitda * 100)}% (NYU Stern data)`);
    tick(`Could earn ${$k(L.runRate)} more a year`);
    set(4, 'Building the playbook');
    S.answers = {}; S.plan = libraryPlan({ d, S }); S.planAt = new Date().toISOString(); S.planInputsHash = hashInputs(); persist();
    if (!d.deal) { detail(`Real profit is ${$k(d.normalization.normalized)}: the business loses money, so it can’t be priced on a multiple of profit. The plan shows how to get it back to profit first.`); tick('Not priceable yet: the business loses money'); }
    else {
    if (d.rates) detail(`Loan rate today: ${(d.deal.rate * 100).toFixed(2)}% (prime ${(d.rates.prime * 100).toFixed(2)}% from the Federal Reserve, ${d.rates.date})`);
    detail(`Tested a price of ${d.deal.multiple}× ${d.deal.basis === 'revenue' ? 'revenue' : 'profit'} (${$k(d.deal.price)}): ${d.deal.senior + d.deal.seller > 0 ? `bank lends ${$k(d.deal.senior)}, seller carries ${$k(d.deal.seller)}, ` : 'no loan, '}investors put in ${$k(d.deal.equity)}`);
    if (d.deal.downside.minDscr != null) detail(`Bad-year test (profit 15% lower): profit still covers loan payments ${d.deal.downside.minDscr.toFixed(1)}×`);
    tick(`Offer price: ${$k(d.deal.price)}.${d.deal.base.net.moic != null ? ` Each $1 invested could become $${d.deal.base.net.moic.toFixed(2)}.` : ''}`);
    }
    set(5, 'Done'); tick('Done'); S.runLog = j.log; S.runDetail = j.detail; persist();
  } finally { CURJ = null; }
}

const OWNERISH = /partner|principal|owner|member|shareholder|officer/i;
// monthly check-in: newer books compared with the usual month before the plan and with the plan's target
function checkinAnalysis(d) {
  const map = { ...S.mapping }, unknown = new Set();
  for (const r of CHECK) if (!(r.account in map)) { map[r.account] = 'other_opex'; unknown.add(r.account); }
  const cr = S.checkin.range, cm = monthlySeries(CHECK, map, S.signMode, cr), baseEnd = S.range.end.slice(0, 7);
  let months = cm.filter(x => x.m > baseEnd); if (!months.length) months = cm.slice(-3);
  const base = d.monthly.slice(-12), avg = k => base.reduce((t, x) => t + x[k], 0) / (base.length || 1);
  const usual = { revenue: avg('revenue'), profit: avg('profit'), gross: avg('gross'), customers: avg('customers'), writeoffs: avg('writeoffs') };
  const target = d.proForma / 12, last = months[months.length - 1];
  const inv = (rows, m) => { const s2 = new Set(); let rev = 0; for (const r of rows) { const c = map[r.account]; if (CATEGORIES[c]?.group !== 'revenue' || r.date.slice(0, 7) !== m) continue; rev += rowValue(r, c, S.signMode); if (r.num) s2.add(r.num); } return s2.size ? rev / s2.size : null; };
  const baseInv = (() => { const v = base.map(x => inv(ROWS, x.m)).filter(Boolean); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; })();
  const lastInv = last ? inv(CHECK, last.m) : null;
  const dsoNow = last && last.revenue ? last.ar / last.revenue * 30 : null;
  // customers who usually buy and went quiet
  const byCust = {}; for (const r of ROWS) { const c = S.mapping[r.account]; if (CATEGORIES[c]?.group === 'revenue' && r.name && base.some(x => x.m === r.date.slice(0, 7))) byCust[r.name] = (byCust[r.name] || 0) + rowValue(r, c, S.signMode); }
  const nowCust = {}; for (const r of CHECK) { const c = map[r.account]; if (CATEGORIES[c]?.group === 'revenue' && r.name && months.some(x => x.m === r.date.slice(0, 7))) nowCust[r.name] = (nowCust[r.name] || 0) + rowValue(r, c, S.signMode); }
  const quiet = Object.entries(byCust).sort((x, y) => y[1] - x[1]).slice(0, 8).filter(([n, v]) => (nowCust[n] || 0) < (v / 12) * months.length * 0.5).map(([n, v]) => ({ name: n, usual: r2(v / 12), now: r2((nowCust[n] || 0) / months.length) }));
  // cost accounts running well above their usual month
  const acctAvg = (rows, mp, ms) => { const o = {}; for (const r of rows) { const c = mp[r.account], g = CATEGORIES[c]?.group; if (!['direct', 'opex'].includes(g) || !ms.includes(r.date.slice(0, 7))) continue; o[r.account] = (o[r.account] || 0) + rowValue(r, c, S.signMode); } for (const k in o) o[k] /= ms.length; return o; };
  const a0 = acctAvg(ROWS, S.mapping, base.map(x => x.m)), a1 = acctAvg(CHECK, map, months.map(x => x.m));
  const rising = Object.entries(a1).filter(([k, v]) => a0[k] && v > a0[k] * 1.25 && v - a0[k] > 2000).sort((x, y) => (y[1] - a0[y[0]]) - (x[1] - a0[x[0]])).slice(0, 4).map(([k, v]) => ({ account: k, usual: r2(a0[k]), now: r2(v) }));
  return { file: S.checkin.file, months: months.map(x => ({ ...x, target: r2(target), usualProfit: r2(usual.profit) })), usual: Object.fromEntries(Object.entries(usual).map(([k, v]) => [k, r2(v)])), target: r2(target),
    last, avgInvoice: { usual: baseInv && r2(baseInv), now: lastInv && r2(lastInv) }, dso: { usual: d.dso, now: dsoNow && r2(dsoNow) }, quiet, rising, newAccounts: [...unknown].slice(0, 6), overlapOnly: !cm.some(x => x.m > baseEnd) };
}
function actionList(d) {
  const L = d.levers, a = S.assumptions, lev = k => (S.plan?.levers || []).find(l => l.key === k), out = [];
  if (L.nonAI.pricing > 0) out.push({ title: `Raise prices ${+(a.pricing_uplift * 100).toFixed(1)}% on new work`, value: L.nonAI.pricing, basis: L.nonAI.pricingBasis, owner: 'Owner and sales lead', sure: 'Benchmark gap', steps: lev('pricing')?.steps, kpis: ['Average price per job', 'Win rate on quotes'] });
  if (L.nonAI.writeoffs > 0) out.push({ title: 'Bill on time and chase late invoices', value: L.nonAI.writeoffs, basis: 'Ledger write-offs × reduction (assumption)', owner: 'Office manager', sure: 'From the books', steps: ['Send every bill the day the work is done', 'Automatic reminders at 15 and 30 days', 'Weekly review of anything over 45 days'], kpis: ['Days to get paid', 'Write-offs'] });
  if (L.nonAI.vendors > 0) out.push({ title: 'Cut supplier and tool costs', value: L.nonAI.vendors, basis: 'Ledger spend × saving (confirmed)', owner: 'Owner', sure: 'Confirmed', steps: lev('vendors')?.steps, kpis: ['Supplier spend as a share of sales'] });
  for (const x of d.extraLevers || []) out.push(x.id === 'discounts' ? { title: `Bring ${x.basis.count} customers up to normal prices`, value: x.value, basis: 'Sales file: half the measured price gap', owner: 'Owner', sure: 'From the sales file', steps: ['Review each discounted account with the owner', 'Move to normal prices at renewal, with notice', 'Approve any discount left in writing'], kpis: ['Average price vs. normal price'] } : { title: 'Cut overtime with better scheduling', value: x.value, basis: 'Payroll file: overtime × share moved to regular hours', owner: 'Operations lead', sure: 'From the payroll file', steps: ['See who works the most overtime, and why', 'Plan the week ahead and spread the work', 'Approve overtime in advance'], kpis: ['Overtime pay per month'] });
  for (const x of (d.industryLevers || []).filter(y => y.value > 0)) out.push({ title: x.title, value: x.value, basis: x.basis, owner: x.owner, sure: x.sure, steps: x.steps, kpis: x.kpis });
  if (!L.aiSkipped && L.ai > 0) out.push({ title: 'Use AI for routine paperwork', value: L.ai, basis: 'Estimated hours saved × extra jobs won', owner: 'Operations lead', sure: 'Estimate', steps: [], kpis: ['Hours per job'] });
  return out.sort((x, y) => y.value - x.value);
}
const $k = v => (v < 0 ? '−' : '') + (Math.abs(v) >= 1e6 ? '$' + (Math.abs(v) / 1e6).toFixed(2) + 'M' : '$' + Math.round(Math.abs(v) / 1000) + 'K');
function checks() {
  if (!S.normConfirmed || !S.opsConfirmed) return [];
  const d = derive(); const t = d.pnl.TTM; const out = [];
  for (const a of S.accounts || []) {
    const c = S.mapping[a.account];
    if ((c === 'comp_producers' || c === 'comp_owner') && OWNERISH.test(a.account) && t.byCat[c]) {
      const amt = ROWS.filter(r => r.account === a.account).reduce((s, r) => s + rowValue(r, c, S.signMode), 0);
      out.push({ key: 'owner_acct:' + a.account, account: a.account, amount: Math.round(amt), q: `Are the owners paid through “${a.account}” (${$k(amt)})?`, help: `Yes: it is the owners’ pay, so it comes out of costs and a hired leader’s salary goes in. No: it is pay for people who ${profile(S).paidWork}.`, value: S.answers?.['owner_acct:' + a.account] ?? null, current: c === 'comp_owner' });
    }
  }
  const rev = t.revenue || 1;
  for (const a of S.accounts || []) {
    const c = S.mapping[a.account], ai = S.mappingAI?.[a.account], g = CATEGORIES[c]?.group;
    if (!ai || ai.confidence >= 0.7 || !['revenue', 'direct', 'opex'].includes(g) || OWNERISH.test(a.account)) continue;
    const amt = ROWS.filter(r => r.account === a.account).reduce((s, r) => s + rowValue(r, c, S.signMode), 0);
    if (Math.abs(amt) < 0.02 * rev) continue;
    const opts = Object.entries(CATEGORIES).filter(([, v]) => v.group === g || (g !== 'revenue' && ['direct', 'opex'].includes(v.group))).map(([k, v]) => ({ k, label: v.label }));
    out.push({ key: 'map:' + a.account, type: 'select', q: `Is “${a.account}” (${$k(amt)}) labeled right?`, help: `AI chose “${CATEGORIES[c].label}” but is only ${Math.round(ai.confidence * 100)}% sure. Change it if the seller says otherwise.`, options: opts, current: c, value: S.answers?.['map:' + a.account] ?? null });
  }
  const o = S.ops || {}, H = ['research', 'sourcing', 'outreach', 'crm', 'reporting'].reduce((s, k) => s + (o.hours?.[k] || 0), 0);
  out.push({ key: 'ops:producers', type: 'number', step: 1, q: `How many ${profile(S).workers} ${profile(S).paidWork}?`, help: S.opsAI?.inputs?.producers?.basis === 'from GL' ? S.opsAI.inputs.producers.evidence + '.' : 'AI estimated this from payroll. It drives how much time AI can save.', current: o.producers ?? 0, value: S.answers?.['ops:producers'] ?? null });
  out.push({ key: 'ops:avg_fee', type: 'number', step: 1000, q: `What does an average ${profile(S).job} bring in, in dollars?`, help: `About $${Math.round(o.avg_fee || 0).toLocaleString()} from the invoices. Correct it if the seller gives you the real number.`, current: Math.round(o.avg_fee ?? 0), value: S.answers?.['ops:avg_fee'] ?? null });
  out.push({ key: 'ops:hours', type: 'number', step: 1, q: `Hours a week each ${profile(S).worker} spends on routine admin (emails, notes, paperwork)?`, help: 'An estimate — the ledger does not record time. Ask the seller.', current: Math.round(H), value: S.answers?.['ops:hours'] ?? null });
  out.push({ key: 'owner_leaving', q: `Will the seller step away after closing, so you hire a leader? (Either way, whoever runs it is paid a market salary of $${Math.round(S.owner.marketComp / 1000)}K a year, which comes off profit.)`, help: 'Yes or no, the same salary comes off profit: a seller who stays still has to be paid like a hired leader.', value: S.answers?.owner_leaving ?? null, current: S.owner.stays !== true });
  const ab = S.addbacks || [];
  if (ab.length) out.push({ key: 'addbacks', q: `Will these ${$k(ab.reduce((s, a) => s + a.amount, 0))} of owner personal and one-time costs stop after you buy?`, help: ab.map(a => `${a.label} ($${Math.round(a.amount / 1000)}K)`).join(' · ') + '. Yes adds them back to profit — only if the seller can prove them.', value: S.answers?.addbacks ?? null, current: ab.every(a => a.accepted) });
  const vd = S.vendors || [];
  if (vd.length) out.push({ key: 'vendors', q: `Can you cut ${$k(vd.reduce((s, v) => s + v.amount, 0))} a year of overlapping tools and vendors?`, help: [...new Set(vd.map(v => v.label))].join(' · '), value: S.answers?.vendors ?? null, current: vd.every(v => v.accepted) });
  return out;
}

const hashInputs = () => JSON.stringify([S.ops, S.assumptions, S.owner, (S.addbacks || []).map(a => a.accepted), (S.vendors || []).map(v => [v.accepted, v.pct])]);

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const body = req => new Promise((ok, bad) => { let b = ''; req.on('data', d => { b += d; if (b.length > 120e6) { bad(new Error('File too large')); req.destroy(); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1'].includes(host)) return send(res, 403, { error: 'Forbidden' });
  if (req.method === 'POST') {
    const o = req.headers.origin;
    if (o && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return send(res, 403, { error: 'Forbidden' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON only' });
  }
  try {
    if (url.pathname.startsWith('/api/')) {
      const p = url.pathname.slice(5);
      if (req.method === 'GET' && p === 'state') return send(res, 200, view());
      if (req.method === 'GET' && p === 'log') return send(res, 200, CUR ? readLog(LOGF()).reverse() : []);
      if (req.method === 'GET' && p === 'deals') return send(res, 200, { current: CUR, deals: listDeals(), busy: busy(), busyJob: Object.values(jobs).find(j => j.status === 'running' && j.name === 'Analyze')?.id || null });
      if (req.method === 'GET' && p.startsWith('job/')) return send(res, 200, jobs[p.slice(4)] || { status: 'unknown' });
      // ---- Proprietary Search (separate from Value Creation jobs) ----
      if (req.method === 'GET' && p === 'search/list') return send(res, 200, { searches: listSearches().map(x => SRUN[x.id] ? { ...x, status: 'running' } : x) });
      if (req.method === 'GET' && p.startsWith('search/get/')) { const id = p.slice(11), s2 = SRUN[id] || loadSearch(id); if (!s2) return send(res, 404, { error: 'Search not found.' }); const { raw, ...rest } = s2; const fresh = new Set(s2.fresh || []); return send(res, 200, { ...rest, entities: (rest.entities || []).map(e => ({ ...e, ...(e.timing ? { timing: timing(e.timing.signals.map(x => ({ ...x, signal: x.key }))) } : {}), known: known(s2, e), deal: dealOf(s2, e), isNew: fresh.has(e.id), warm: warm(s2.mode, e) })), rawCount: raw?.length || 0, running: !!SRUN[id], signalsRunning: !!SIG[id], watch: watchOf(s2) }); }
      if (req.method === 'GET' && p === 'search/network') return send(res, 200, { people: network('candidate'), companies: network('client'), targets: network('target'), stats: memStats() });
      if (req.method === 'GET' && p === 'docs/candidates') { const out = []; for (const h of listSearches().filter(x => x.mode === 'candidate')) { const s2 = loadSearch(h.id); for (const e of (s2?.entities || []).filter(e => e.scored).sort((a, b) => b.score - a.score)) out.push({ search: s2.id, entity: e.id, name: e.name, title: String(e.title || '').split(/[.(;]/)[0].slice(0, 60), employer: String(e.employer || '').split(/[.(;]/)[0].slice(0, 40), fit: e.score }); } return send(res, 200, { candidates: out }); }
      if (req.method === 'GET' && p === 'docs/list') return send(res, 200, { docs: listDocs().map(d => DRUN[d.id] ? { ...d, status: 'running' } : d), firm: getFirm() });
      if (req.method === 'GET' && p.startsWith('docs/get/')) { const d = loadDoc(p.slice(9)); if (!d) return send(res, 404, { error: 'Document not found.' }); const { source, job, cand, ...rest } = d; return send(res, 200, { ...rest, running: !!DRUN[d.id], sourceName: source?.name || '', jobName: job?.name || '', candName: cand?.name || '' }); }
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
      if (req.method === 'GET' && p === 'search/intent') {
        // owner ranking: every firm to buy across all searches, ranked by deal intent (majority sale or growth partnership),
        // breadth of signals, fit and reachability. Proprietary only: firms already listed on a marketplace are set aside.
        const { R, list } = ownerList();
        return send(res, 200, { scanning: INTENT, lastScan: LAST_INTENT, lastError: JOB_ERR.intent || JOB_ERR.signals || null, list, listed: R.listed.map(x => ({ name: x.name, place: x.place, website: x.website })), outside: R.outside.filter(x => x.niche).map(x => ({ search: x.search, entity: x.entity, name: x.name, place: x.place, focus: x.focus, segmentLabel: x.segmentLabel, why: x.box.reasons.join('; ') })), counts: { outside: R.outside.filter(x => x.niche).length, outsideFocus: R.outside.filter(x => x.focus).length, inBox: list.filter(x => x.box.status === 'in').length, all: list.length, high: list.filter(x => x.intent.high).length, sale: list.filter(x => x.intent.sale.level === 'high').length, partner: list.filter(x => x.intent.partner.level === 'high').length, niche: list.filter(x => x.niche).length, focus: list.filter(x => x.focus).length, listed: R.listed.length, segments: Object.fromEntries(['retail_placement', 'marketplace', 'strategy'].map(k => [k, list.filter(x => x.niche && x.segment === k).length])), inOutreach: list.filter(x => x.niche && x.outreach).length } });
      }
      if (req.method === 'GET' && p === 'search/radar') return send(res, 200, { events: recentEvents(), scans: radarScans(), scanning: SCAN, lastError: JOB_ERR.radar || null });
      if (req.method === 'GET' && p === 'search/pipeline') return send(res, 200, { stages: DEAL_STAGES, deals: pipeline() });
      // Outreach: its own board, senders and drafts (sends only from your connected senders in AION_SENDERS, only with your OK)
      if (req.method === 'GET' && p === 'outreach/state') return send(res, 200, { settings: OUT.settings(), accounts: GMAIL.accounts(), gmailReady: GMAIL.configured(), board: (() => { const { R, list } = ownerList(), off = new Map(R.outside.map(x => [`${x.search}|${x.entity}`, x.box.reasons.join('; ')])), on = new Map(list.map(x => [`${x.search}|${x.entity}`, x]));
          return OUT.board().map(b => { const k = `${b.search}|${b.entity}`, r = on.get(k); return { ...b, outside: off.get(k) || null, rank: r?.nicheRank || null, track: r?.track || null, segmentLabel: r?.segmentLabel || null }; }); })(), ready: outreachReady(), suppressed: OUT.suppressed().length });
      if (req.method === 'GET' && p === 'outreach/results') return send(res, 200, OUT.results());
      if (req.method === 'GET' && p === 'outreach/slots') { try { return send(res, 200, await OUT.openSlots()); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/attachments') { try { return send(res, 200, { files: await OUT.listAttachments(url.searchParams.get('id')) }); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/attachment') { try { const buf = await OUT.getAttachment(url.searchParams.get('id'), url.searchParams.get('m'), url.searchParams.get('a')); return send(res, 200, { data: buf.toString('base64') }); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/print') { try { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(letterHtml(url.searchParams.get('id'), url.searchParams.get('kind'))); } catch (e) { return send(res, 404, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/pdf') {
        try { const kind = url.searchParams.get('kind'), it = OUT.get(url.searchParams.get('id')); const buf = await outreachPdf(it.id, kind);
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${(kind === 'letter' ? 'Letter' : it.docs?.[kind]?.title || kind).replace(/[^\w ()-]+/g, '')} - ${it.name.replace(/[^\w &-]+/g, '')}.pdf"` }); return res.end(buf); } catch (e) { return send(res, 400, { error: e.message }); }
      }
      if (req.method === 'GET' && p === 'finders') return send(res, 200, { hunter: !!(finderKeys().hunter || process.env.HUNTER_API_KEY) });
      if (req.method === 'GET' && p === 'outreach/item') { try { return send(res, 200, OUT.item(url.searchParams.get('id'))); } catch (e) { return send(res, 404, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/google/callback') {
        const err = url.searchParams.get('error');
        let msg; try { if (err) throw new Error(err === 'access_denied' ? 'You cancelled the Google sign-in.' : err); msg = `Connected ${await GMAIL.finishConnect(url.searchParams.get('state'), url.searchParams.get('code'))}. You can close this tab and go back to AION.`; } catch (e) { msg = e.message; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(`<!doctype html><meta charset="utf-8"><title>AION</title><body style="font:15px -apple-system,sans-serif;padding:40px;max-width:520px"><h2>AION Outreach</h2><p>${String(msg).replace(/[<>&]/g, '')}</p></body>`);
      }
      if (req.method === 'GET' && p === 'search/sources') return send(res, 200, { sources: sources(contactStats()) });
      if (req.method === 'GET' && p === 'search/watches') return send(res, 200, { watches: watches() });
      // ---- AI engine: whatever the person already has (Claude Code, Codex, or their own API key) ----
      if (req.method === 'GET' && p === 'engine') { const list = await detectEngines(); return send(res, 200, { list, active: await resolveEngine(true), settings: engineSettings(), limits: engineLimits() }); }
      if (req.method === 'GET' && p === 'rows') {
        let rows = ROWS;
        const ids = url.searchParams.get('ids'); const acct = url.searchParams.get('account'); const cat = url.searchParams.get('category'); const payee = url.searchParams.get('payee');
        if (ids) { const set = new Set(ids.split(',').map(Number)); rows = rows.filter(r => set.has(r.id)); }
        if (acct) rows = rows.filter(r => r.account === acct);
        if (cat) rows = rows.filter(r => S.mapping?.[r.account] === cat);
        if (payee) rows = rows.filter(r => r.name === payee);
        if (url.searchParams.get('period') === 'TTM' && S.range) { const t = periods(S.range).ttm; rows = rows.filter(r => { const m = r.date.slice(0, 7); return m >= t.from && m <= t.to; }); }
        return send(res, 200, { total: rows.length, rows: rows.slice(0, 500) });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method' });
      const b = await body(req);
      switch (p) {
        case 'engine/choose': { try { chooseEngine(String(b.engine || 'auto')); } catch (e) { return send(res, 400, { error: e.message }); } return send(res, 200, { active: await resolveEngine(true), settings: engineSettings() }); }
        case 'engine/key': { try { setKey(b.which, b.key); } catch (e) { return send(res, 400, { error: e.message }); } return send(res, 200, { list: await detectEngines(), active: await resolveEngine(true), settings: engineSettings() }); }
        case 'engine/test': { if (!ENGINES[b.engine]) return send(res, 400, { error: 'Unknown engine' }); try { return send(res, 200, await testEngine(b.engine)); } catch (e) { return send(res, 200, { ok: false, error: String(e.message || e).slice(0, 400) }); } }
        case 'upload': {
          const buf = Buffer.from(b.data, 'base64'); const ext = path.extname(b.filename || '').toLowerCase();
          if (!['.xlsx', '.xls', '.csv', '.pdf'].includes(ext)) return send(res, 400, { error: 'Upload a QuickBooks GL / P&L Detail export (.xlsx, .xls, .csv) or PDF financial statements.' });
          if (busy()) return send(res, 409, { error: 'An analysis is still running. Wait for it to finish, then upload.' });
          const stored = 'upload' + ext;
          if (ext === '.pdf') {
            newDeal(b.filename);
            fs.writeFileSync(path.join(D(), stored), buf);
            S = { ...S, file: { name: b.filename, kind: 'pdf', stored, bytes: buf.length, sha: crypto.createHash('sha256').update(buf).digest('hex'), uploadedAt: new Date().toISOString() } };
            ROWS = []; save(path.join(D(), 'gl.json'), ROWS); persist();
            return send(res, 200, { job: job('Analyze', runAll) });
          }
          const gl = parseGL(buf, b.filename);
          newDeal(b.filename);
          fs.writeFileSync(path.join(D(), stored), buf);
          ROWS = gl.rows; save(path.join(D(), 'gl.json'), ROWS);
          const { rows, ...meta } = gl;
          S = { ...S, file: { name: b.filename, kind: 'gl', stored, bytes: buf.length, sha: crypto.createHash('sha256').update(buf).digest('hex'), uploadedAt: new Date().toISOString() }, parse: meta, range: gl.range, accounts: accountSummary(gl), signMode: gl.amountMode === 'debit-credit' ? 'debit' : 'natural' };
          persist(); return send(res, 200, view());
        }
        case 'ai/classify': return send(res, 200, { job: job('Map accounts', AI.classify) });
        case 'ai/addbacks': return send(res, 200, { job: job('Earnings review', AI.addbacks) });
        case 'ai/ops': return send(res, 200, { job: job('Operating inputs', AI.ops) });
        case 'ai/plan': return send(res, 200, { job: job('Deployment plan', AI.plan) });
        case 'ai/all': return send(res, 200, { job: job('Analyze', async j => { FRESH = !!b.fresh; try { await runAll(j); } finally { FRESH = false; } }) });
        case 'extra': {
          const type = b.type; if (!['payroll', 'sales'].includes(type)) return send(res, 400, { error: 'Unknown file type.' });
          if (!CUR || !S.file) return send(res, 400, { error: 'Upload the books first.' });
          if (b.remove) { if (S.extra) delete S.extra[type]; persist(); return send(res, 200, view()); }
          const buf = Buffer.from(b.data || '', 'base64'); const ext = path.extname(b.filename || '').toLowerCase();
          if (!['.xlsx', '.xls', '.csv'].includes(ext)) return send(res, 400, { error: 'Upload an Excel or CSV export (.xlsx, .xls, .csv).' });
          let analysis; try { analysis = type === 'payroll' ? analyzePayroll(buf) : analyzeSales(buf); } catch (e) { return send(res, 400, { error: e.message }); }
          if (type === 'payroll') analysis.market = await marketPay(analysis.roles);
          fs.writeFileSync(path.join(D(), `${type}${ext}`), buf);
          S.extra = { ...(S.extra || {}), [type]: { file: b.filename, at: new Date().toISOString(), analysis } }; persist();
          return send(res, 200, view());
        }
        case 'ai/outside': {
          const name = String(b.name || '').trim().slice(0, 120), place = String(b.place || '').trim().slice(0, 120);
          if (!CUR || !S.plan) return send(res, 400, { error: 'Analyze a company first.' });
          if (!name) return send(res, 400, { error: 'Type the company’s name (and city) to check it online.' });
          return send(res, 200, { job: job('Outside check', async j => { CURJ = j; j.t0 = Date.now(); j.detail = []; j.step = 0; try { detail(`Searching the web for “${name}”${place ? ` in ${place}` : ''}: reviews, lawsuits, licenses, news`); await AI.outside(name, place); detail(`Done: ${S.outside.findings.length} findings with links`); persist(); } finally { CURJ = null; } }) });
        }
        case 'checkin': {
          if (!CUR || !S.plan) return send(res, 400, { error: 'Analyze the company first, then add newer books each month.' });
          if (b.remove) { CHECK = []; save(path.join(D(), 'checkin.json'), CHECK); delete S.checkin; persist(); return send(res, 200, view()); }
          const buf = Buffer.from(b.data || '', 'base64');
          let gl; try { gl = parseGL(buf, b.filename); } catch (e) { return send(res, 400, { error: e.message }); }
          CHECK = gl.rows; save(path.join(D(), 'checkin.json'), CHECK);
          S.checkin = { file: b.filename, at: new Date().toISOString(), range: gl.range }; persist();
          return send(res, 200, view());
        }
        case 'search/start': {
          const mode = ['client', 'target'].includes(b.mode) ? b.mode : 'candidate', objective = String(b.objective || '').trim().slice(0, 1500);
          if (objective.length < 12) return send(res, 400, { error: 'Describe what you are looking for in a sentence or two.' });
          if (Object.keys(SRUN).length >= 2) return send(res, 409, { error: 'Two searches are already running (see Search history below). Each takes about 4–8 minutes; start this one when either finishes.' });
          const s2 = startSearch({ mode, objective, filters: b.filters, from: b.from, queries: b.queries, criteria: b.criteria, link: b.link });
          return send(res, 200, { id: s2.id });
        }
        case 'search/contacts': {
          if (b.remove) { clearContacts(); return send(res, 200, { ok: true }); }
          try { const r = importContacts(Buffer.from(b.data || '', 'base64'), String(b.filename || 'contacts.csv')); return send(res, 200, r); } catch (e) { return send(res, 400, { error: e.message }); }
        }
        case 'search/archive': { if (SRUN[b.id]) return send(res, 409, { error: 'This search is still running.' }); if (!archiveSearch(b.id)) return send(res, 404, { error: 'Search not found.' }); prune(listSearches().map(x => x.id)); return send(res, 200, { ok: true }); }
        case 'search/signals': {
          if (SRUN[b.id] || SIG[b.id]) return send(res, 409, { error: 'This search is already being updated.' });
          const s2 = loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' });
          SIG[b.id] = true;
          addSignals(s2, { cwd: path.join(ROOTWS, 'searches'), model: MODELS.extraction, log: t => { s2.log.push({ t: s2.runtime || 0, text: t }); } }).then(() => { saveSearchMerged(s2); delete JOB_ERR.signals; }).catch(jobFailed('signals')).finally(() => { delete SIG[b.id]; });
          return send(res, 200, { ok: true });
        }
        case 'search/more': {
          // the next unchecked results of a finished search get the full in-depth check, data signals and site emails
          if (SRUN[b.id]) return send(res, 409, { error: 'This search is still running.' });
          if (Object.keys(SRUN).length >= 2) return send(res, 409, { error: 'Two searches are already running. Try again when one finishes.' });
          const s2 = loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' });
          const left = (s2.entities || []).filter(e => !e.scored).length; if (!left) return send(res, 400, { error: 'Every result in this search is already checked.' });
          SRUN[s2.id] = s2;
          checkMore(s2, { n: +b.n || 12, cwd: path.join(ROOTWS, 'searches'), model: MODELS.extraction }).then(() => ingest(s2)).catch(e => { s2.status = 'done'; s2.stage = 'done'; (s2.log ||= []).push({ t: 0, text: 'Check more stopped: ' + e.message }); saveSearch(s2); }).finally(() => { delete SRUN[s2.id]; });
          return send(res, 200, { ok: true, checking: Math.min(left, +b.n || 12), left });
        }
        case 'search/intent-scan': {
          if (INTENT) return send(res, 409, { error: 'Already reading every firm’s site and headlines.' });
          INTENT = { done: 0, total: 0, at: new Date().toISOString() };
          const all = listSearches().map(h => loadSearch(h.id)).filter(x => x?.mode === 'target' && !SRUN[x.id]);
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
        case 'docs/firm': return send(res, 200, { firm: setFirm(b.firm) });
        case 'docs/proposal': {
          let src; try { src = await readSource(b, path.join(ROOTWS, 'docs')); } catch (e) { return send(res, 400, { error: e.message }); }
          const d = { id: 'd' + Date.now().toString(36), kind: 'proposal', title: src.name, created: new Date().toISOString(), status: 'running', source: src, firm: getFirm() };
          saveDoc(d); runDoc(d, draftProposal); return send(res, 200, { id: d.id });
        }
        case 'docs/writeup': {
          let job, cand;
          try { job = await readSource(b.job || {}, path.join(ROOTWS, 'docs')); } catch (e) { return send(res, 400, { error: 'Job order: ' + e.message }); }
          if (b.cand?.search) { const s2 = loadSearch(b.cand.search); const e = s2?.entities?.find(x => x.id === b.cand.entity); if (!e) return send(res, 400, { error: 'That candidate was not found in your searches.' }); cand = candidateFromSearch(s2, e); }
          else { try { cand = await readSource(b.cand || {}, path.join(ROOTWS, 'docs')); } catch (e) { return send(res, 400, { error: 'Candidate: ' + e.message }); } }
          const d = { id: 'd' + Date.now().toString(36), kind: 'writeup', title: 'Candidate write-up', created: new Date().toISOString(), status: 'running', job, cand, firm: getFirm() };
          saveDoc(d); runDoc(d, draftWriteup); return send(res, 200, { id: d.id });
        }
        case 'outreach/settings': return send(res, 200, OUT.setSettings(b));
        case 'outreach/connect': { try { return send(res, 200, GMAIL.connectUrl(PORT, String(b.email || '').trim())); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/disconnect': GMAIL.disconnect(b.email); return send(res, 200, { ok: true });
        case 'outreach/create': {
          const s2 = SRUN[b.search] || loadSearch(b.search); if (!s2) return send(res, 404, { error: 'Search not found.' });
          const e = (s2.entities || []).find(x => x.id === b.entity); if (!e) return send(res, 404, { error: 'Result not found.' });
          try { const it = await OUT.createDraft({ s: s2, e, pitch: OUT.PITCHES.includes(b.pitch) ? b.pitch : null, model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') }); return send(res, 200, { id: it.id }); } catch (err) { return send(res, 400, { error: err.message }); }
        }
        case 'outreach/rewrite': { try { const it = OUT.get(b.id); const s2 = SRUN[it.search] || loadSearch(it.search); OUT.rewrite(b.id, { s: s2, pitch: b.pitch, model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') }); return send(res, 200, { id: b.id }); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/edit': { try { return send(res, 200, OUT.editItem(b.id, b)); } catch (e) { return send(res, 400, { error: e.message }); } }
        // the preview: exactly what will be sent, plus a one-time code the send must bring back (nothing sends without it)
        case 'outreach/confirm': { try { const action = ['step', 'answer', 'doc', 'invite'].includes(b.action) ? b.action : 'step', kind = String(b.kind || ''), c = OUT.sendContent(b.id, action, kind, { start: b.start, note: b.note });
          return send(res, 200, { ...c, token: c.ok ? CONFIRM.issue(`${action}:${b.id}:${kind}`, c) : null }); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/send': { try { if (!b.saveOnly) CONFIRM.take(b.token, `step:${b.id}:${b.kind}`, OUT.sendContent(b.id, 'step', String(b.kind || ''))); return send(res, 200, await OUT.sendStep(b.id, b.kind, { confirmed: b.confirmed === true, saveOnly: !!b.saveOnly })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/done': { try { return send(res, 200, OUT.markDone(b.id, b.kind, b.note)); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/stage': { try { return send(res, 200, OUT.setDealStage(b.id, b.stage, b.note)); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/sync': { try { return send(res, 200, { changed: await OUT.syncReplies() }); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/answer': { try { return send(res, 200, await OUT.draftAnswer(b.id, { model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/answer-send': { try { CONFIRM.take(b.token, `answer:${b.id}:`, OUT.sendContent(b.id, 'answer', '')); return send(res, 200, await OUT.sendAnswer(b.id, { confirmed: b.confirmed === true })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/book': { try { CONFIRM.take(b.token, `invite:${b.id}:`, OUT.sendContent(b.id, 'invite', '', { start: b.start })); return send(res, 200, await OUT.bookCall(b.id, { start: b.start, minutes: b.minutes, confirmed: b.confirmed === true })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/find-email': { try { return send(res, 200, await OUT.findEmail(b.id, { hunterKey: finderKeys().hunter || process.env.HUNTER_API_KEY })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'finders/key': { // Hunter.io free plan key: checked with Hunter, stored only on this Mac (owner-only file)
          const k = String(b.key || '').trim(), cur = finderKeys();
          if (!k) { delete cur.hunter; saveFinderKeys(cur); return send(res, 200, { hunter: false }); }
          try { const r = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (!r.ok) throw new Error(j.errors?.[0]?.details || 'Hunter.io did not accept that key'); cur.hunter = k; saveFinderKeys(cur); return send(res, 200, { hunter: true, left: j.data?.requests?.searches?.available != null ? j.data.requests.searches.available - (j.data.requests.searches.used || 0) : null }); }
          catch (e) { return send(res, 400, { error: e.message }); }
        }
        case 'outreach/doc': {
          try {
            const it = OUT.get(b.id);
            if (b.kind === 'loi') {
              if (!it.dealId) return send(res, 400, { error: 'Open their books in Value Creation first (from the attachment in their email, or upload them), then write the LOI.' });
              if (busy()) return send(res, 409, { error: 'An analysis is still running. Try again when it finishes.' });
              // read that deal's numbers, then always put the deal you had open back, even if reading fails
              const was = CUR; let d; try { loadDeal(it.dealId); d = derive(); } finally { loadDeal(was); }
              if (!d.deal) return send(res, 400, { error: 'That company’s books haven’t been analyzed yet (or it can’t be priced). Open it in Value Creation and press Analyze.' });
              const numbers = { fees: d.deal.fees || 0, ebitda: d.normalization.normalized, price: d.deal.price, multiple: d.deal.multiple, basis: d.deal.basis, senior: d.deal.senior, seller: d.deal.seller, equity: d.deal.equity, revenue: d.pnl?.TTM?.revenue || 0, stake: d.deal.stake ?? 1, rollover: d.deal.rollover || 0, wcPeg: d.wc?.peg ?? null };
              // whole thousands, with costs = sources − price, so every figure in the letter adds up exactly
              const k = v => Math.round((+v || 0) / 1000) * 1000;
              for (const f of ['ebitda', 'price', 'senior', 'seller', 'equity', 'revenue']) numbers[f] = k(numbers[f]);
              numbers.fees = Math.max(0, numbers.senior + numbers.seller + numbers.equity - numbers.price);
              return send(res, 200, await OUT.makeLoi(b.id, numbers, { model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') }));
            }
            const s2 = loadSearch(it.search);
            return send(res, 200, OUT.makeDoc(b.id, b.kind, s2?.subsector));
          } catch (e) { return send(res, 400, { error: e.message }); }
        }
        case 'outreach/doc-edit': { try { return send(res, 200, OUT.setDoc(b.id, b.kind, b.body)); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/doc-send': { try { CONFIRM.take(b.token, `doc:${b.id}:${b.kind}`, OUT.sendContent(b.id, 'doc', String(b.kind || ''), { note: b.note })); const pdf = b.kind === 'request' ? null : await outreachPdf(b.id, b.kind); return send(res, 200, await OUT.sendDoc(b.id, b.kind, { confirmed: b.confirmed === true, pdf, note: b.note })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/link-deal': { try { if (!CUR) return send(res, 400, { error: 'No company is open in Value Creation.' }); if (b.name) { S.name = String(b.name).slice(0, 80); persist(); } return send(res, 200, OUT.linkDeal(b.id, CUR)); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/batch': {
          const list = []; for (const x of (b.items || []).slice(0, 25)) { const s2 = SRUN[x.search] || loadSearch(x.search); const e = s2?.entities?.find(y => y.id === x.entity); if (s2 && e) list.push({ s: s2, e }); }
          return send(res, 200, await OUT.createMany(list, { model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') }));
        }
        case 'outreach/mock-reply': {
          // Test-only (fake Gmail): an answer from them in the thread, optionally with a books file attached.
          if (process.env.AION_GMAIL_MOCK !== '1') return send(res, 404, { error: 'Not found' });
          const it = OUT.get(b.id), first = it.messages.find(m => m.threadId); if (!first) return send(res, 400, { error: 'Send first.' });
          GMAIL.fake.threads[first.threadId].push({ id: 'their' + Date.now(), from: `${it.toName || 'Owner'} <${it.to}>`, subject: `Re: ${first.subject}`, body: b.text || 'Happy to talk.', at: new Date().toISOString(), files: b.file ? [{ filename: b.file.filename, mime: 'text/csv', data: Buffer.from(b.file.data, 'base64') }] : [] });
          return send(res, 200, { changed: await OUT.syncReplies() });
        }
        case 'outreach/finish': { try { return send(res, 200, OUT.finish(b.id, b.why || 'Finished')); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/delete': { try { OUT.remove(b.id); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'search/stage': {
          const s2 = SRUN[b.id] || loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' });
          const e = (s2.entities || []).find(x => x.id === b.entity); if (!e) return send(res, 404, { error: 'Result not found.' });
          const d = setStage(s2, e, b.stage || null, b.note || ''); if (!d) return send(res, 400, { error: 'Deal stages are for acquisition targets.' });
          return send(res, 200, { deal: d });
        }
        case 'search/decide': {
          const s2 = SRUN[b.id] || loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' });
          const e = (s2.entities || []).find(x => x.id === b.entity); if (!e) return send(res, 404, { error: 'Result not found.' });
          if (b.decision !== undefined) e.decision = ['saved', 'rejected', 'priority', 'weak', null].includes(b.decision) ? b.decision : null;
          if (b.note !== undefined) e.note = String(b.note).slice(0, 2000);
          saveSearch(s2); memDecide(s2, e); return send(res, 200, { ok: true });
        }
        case 'search/watch': { const s2 = loadSearch(b.id); if (!s2) return send(res, 404, { error: 'Search not found.' }); setWatch(s2, !!b.on, 7); return send(res, 200, { ok: true }); }
        case 'search/watchrun': { const w = watches().find(x => x.id === b.id); if (!w) return send(res, 404, { error: 'Not watched.' }); if (Object.keys(SRUN).length >= 2) return send(res, 409, { error: 'Two searches are already running (see Search history below). Each takes about 4–8 minutes; try again when either finishes.' }); const last = loadSearch(w.lastSearch); watchStarted(w); const s2 = startSearch({ mode: w.mode, objective: w.objective, filters: w.filters, from: last.id, queries: last.queries, watchId: w.id }); return send(res, 200, { id: s2.id }); }
        case 'industry': { const name = String(b.name || '').trim().slice(0, 60); if (!name) return send(res, 400, { error: 'Type the kind of business, e.g. civil engineering firm.' }); const kind = kindOf(name); S.industry = { name, kind, subsector: kind === 'staffing' ? 'talent' : detectSubsector(name), byUser: true }; persist(); return send(res, 200, view()); }
        case 'subsector': {
          // the user's choice of subsector; kind follows it so the playbook wording matches. Revenue and delivery notes are kept.
          if (!CUR || !S.industry) return send(res, 400, { error: 'Analyze a company first.' });
          const sub = b.subsector === 'none' ? null : SUBSECTORS[b.subsector] ? b.subsector : undefined; if (sub === undefined) return send(res, 400, { error: 'Unknown subsector.' });
          S.industry = { ...S.industry, subsector: sub, subsectorSet: true, kind: sub ? kindFor(sub) : 'general' }; persist();
          return send(res, 200, view());
        }
        case 'diligence': {
          // a diligence answer recorded by the user, dated; shown as "From diligence" evidence in the thesis check and tool fit
          if (!CUR || !S.file) return send(res, 400, { error: 'Open a deal first.' });
          const Q = DILIGENCE[b.key]; if (!Q) return send(res, 400, { error: 'Unknown question.' });
          S.diligence ??= {};
          if (b.value === '' || b.value == null) delete S.diligence[b.key];
          else { let v = b.value; if (Q.kind === 'pct') v = Math.min(1, Math.max(0, (+v || 0) / 100)); else if (Q.kind === 'num') v = Math.max(0, +v || 0); else if (!Q.options.some(o => o[0] === v)) return send(res, 400, { error: 'Unknown answer.' });
            S.diligence[b.key] = { value: v, note: String(b.note || '').slice(0, 300), at: new Date().toISOString() }; }
          persist(); return send(res, 200, view());
        }
        case 'mask': { S.maskNames = !!b.on; persist(); return send(res, 200, view()); }
        case 'excel': {
          if (!CUR || !S.plan) return send(res, 400, { error: 'Analyze a company first, then download the Excel file.' });
          const buf = buildWorkbook({ S, d: derive(), rows: ROWS, profile: profile(S), actions: actionList(derive()) });
          res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="AION ${String(S.name || 'analysis').replace(/[^\w .-]/g, '')}.xlsx"` });
          return res.end(buf);
        }
        case 'pdf': {
          if (!CUR || !S.plan) return send(res, 400, { error: 'Analyze a company first, then download its 1-page PDF.' });
          const out = path.join(D(), 'summary.pdf'); try { fs.unlinkSync(out); } catch {}
          await new Promise((ok, bad) => {
            const c = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000', `--print-to-pdf=${out}`, `http://localhost:${PORT}/summary.html`]);
            c.on('close', () => fs.existsSync(out) ? ok() : bad(new Error('PDF was not created — is Google Chrome installed?'))); c.on('error', bad);
          });
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="AION summary.pdf"' });
          return res.end(fs.readFileSync(out));
        }
        case 'answer': {
          const { key, value } = b; const yes = value === true || value === 1 || value === '1';
          S.answers = { ...(S.answers || {}), [key]: key.startsWith('map:') || key.startsWith('ops:') ? value : yes };
          if (key.startsWith('ops:')) {
            const v = Math.max(0, +value || 0); S.answers[key] = v; S.ops ??= {};
            if (key === 'ops:producers') S.ops.producers = v;
            if (key === 'ops:avg_fee') S.ops.avg_fee = v;
            if (key === 'ops:hours') { const ks = ['research', 'sourcing', 'outreach', 'crm', 'reporting'], cur = ks.reduce((s, k) => s + (S.ops.hours?.[k] || 0), 0); for (const k of ks) S.ops.hours[k] = cur ? (S.ops.hours[k] || 0) * v / cur : v / ks.length; }
          }
          if (key.startsWith('map:')) { const acct = key.slice(4); if (S.mapping && acct in S.mapping && CATEGORIES[value]) { S.mapping[acct] = value; S.answers[key] = value; } }
          if (key.startsWith('owner_acct:')) { const acct = key.slice(11); if (S.mapping && acct in S.mapping) S.mapping[acct] = yes ? 'comp_owner' : 'comp_producers'; }
          // the seller staying does not make profit higher: they are paid the same market salary a hired leader would be
          if (key === 'owner_leaving') { S.owner.stays = !yes; S.owner.count = Math.max(1, S.owner.count || 0); }
          if (key === 'addbacks') for (const a of S.addbacks || []) a.accepted = yes;
          if (key === 'vendors') for (const v of S.vendors || []) v.accepted = yes;
          persist(); return send(res, 200, view());
        }
        case 'mapping': {
          if (b.mapping) for (const [k, v] of Object.entries(b.mapping)) if (CATEGORIES[v] && S.mapping && k in S.mapping) S.mapping[k] = v;
          if (b.signMode) S.signMode = b.signMode === 'debit' ? 'debit' : 'natural';
          if (b.confirm != null) { S.mappingConfirmed = !!b.confirm; if (!b.confirm) { S.normConfirmed = false; S.opsConfirmed = false; } }
          persist(); return send(res, 200, view());
        }
        case 'earnings': {
          if (b.owner) { S.owner = { ...S.owner, ...Object.fromEntries(Object.entries(b.owner).filter(([k]) => ['marketComp', 'count', 'extraOwnerComp'].includes(k)).map(([k, v]) => [k, Math.max(0, +v || 0)])) }; S.owner.count = Math.max(1, Math.round(S.owner.count)); }
          if (b.addbacks) for (const a of S.addbacks || []) if (a.id in b.addbacks) a.accepted = !!b.addbacks[a.id];
          if (b.vendors) for (const v of S.vendors || []) if (v.id in b.vendors) { const x = b.vendors[v.id]; if ('accepted' in x) v.accepted = !!x.accepted; if ('pct' in x) { v.pct = Math.min(1, Math.max(0, +x.pct || 0)); v.amount = r2(v.spend * v.pct); } }
          if (b.confirm != null) S.normConfirmed = !!b.confirm;
          persist(); return send(res, 200, view());
        }
        case 'ops': {
          if (b.ops) { const { hours, ...rest } = b.ops; S.ops = { ...S.ops, ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, +v || 0])), hours: { ...S.ops?.hours, ...Object.fromEntries(Object.entries(hours || {}).map(([k, v]) => [k, +v || 0])) } }; }
          if (b.confirm != null) S.opsConfirmed = !!b.confirm;
          persist(); return send(res, 200, view());
        }
        case 'assumptions': {
          const a = b.assumptions || {};
          for (const [k, v] of Object.entries(a)) {
            if (k === 'workflows') { for (const w of v) { const t = S.assumptions.workflows.find(x => x.key === w.key); if (t) t.saved = Math.min(1, Math.max(0, +w.saved || 0)); } }
            else if (k === 'vehicle') { if (['holdco', 'fund', 'sponsor', 'search', 'sba'].includes(v)) S.assumptions.vehicle = v; }
            else if (k === 'stake') { const x = +v; if (x >= 0.5 && x <= 1) S.assumptions.stake = x; }
            else if (k === 'price_basis') { if (['ebitda', 'revenue'].includes(v)) S.assumptions.price_basis = v; }
            else if (k in DEFAULT_ASSUMPTIONS) S.assumptions[k] = +v || 0;
          }
          if (b.reset) S.assumptions = structuredClone(DEFAULT_ASSUMPTIONS);
          persist(); return send(res, 200, view());
        }
        case 'deals/select': { if (busy()) return send(res, 409, { error: 'An analysis is still running.' }); loadDeal(b.id); return send(res, 200, view()); }
        case 'deals/new': { if (busy()) return send(res, 409, { error: 'An analysis is still running.' }); loadDeal(null); return send(res, 200, view()); }
        case 'deals/rename': { if (CUR && b.name) { S.name = String(b.name).slice(0, 80); persist(); } return send(res, 200, view()); }
        case 'reset': {
          if (busy()) return send(res, 409, { error: 'An analysis is still running.' });
          if (CUR) { fs.mkdirSync(ARCHIVE, { recursive: true }); fs.renameSync(D(), path.join(ARCHIVE, CUR + '-' + new Date().toISOString().replace(/[:.]/g, '-'))); }
          loadDeal(listDeals().at(-1)?.id);
          return send(res, 200, view());
        }
      }
      return send(res, 404, { error: 'unknown endpoint' });
    }
    if (url.pathname === '/thesis.mjs') return send(res, 200, fs.readFileSync(path.join(ROOT, 'lib', 'thesis.mjs')), 'text/javascript');
    let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream');
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
});
server.requestTimeout = 0;
initEngine(ROOTWS);
initBenchmarks(path.join(ROOTWS, 'benchmarks.json'));
initStore(path.join(ROOTWS, 'searches'));
initDocs(path.join(ROOTWS, 'docs')); initRadar(path.join(ROOTWS, 'searches')); initMemory(path.join(ROOTWS, 'searches')); initWatch(path.join(ROOTWS, 'searches')); initContacts(path.join(ROOTWS, 'searches')); loadEnv(ROOT);
OUT.initOutreach(path.join(ROOTWS, 'outreach'));
{ const n = OUT.resumeWriting({ model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach'), load: id => { try { return loadSearch(id); } catch { return null; } } }); if (n) console.log(`Outreach: writing ${n} interrupted draft(s) again`); }
// replies, bounces and opt-outs: checked every 10 minutes while AION runs
setInterval(outreachTick, 10 * 60_000).unref(); setTimeout(outreachTick, 20_000).unref();
// first start: build the network from searches already on disk
if (!memStats().people && !memStats().companies) for (const h of listSearches()) { const s2 = loadSearch(h.id); if (s2?.entities) ingest(s2); }
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use: AION may already be running. Close it, or set PORT to another number.` : `The local server could not start: ${e.message}`); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => console.log(`AION GL analyzer → http://localhost:${PORT}`));
