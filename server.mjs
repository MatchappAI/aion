import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import { readJson, writeJson } from './lib/fsafe.mjs';
import path from 'node:path';
import { accountSummary } from './lib/gl.mjs';
import { CATEGORIES, DEFAULT_ASSUMPTIONS, detectSignMode, periods, pnl, matchRows, normalize, quality, dso, levers, cashRelease, rowValue, r2, dealReturns, VEHICLES, monthlySeries, customerFlow, nonOverlappingPeriods } from './lib/model.mjs';
import { libraryPlan } from './lib/playbooks.mjs';
import { ecomLevers } from './lib/levers-ecom.mjs';
import { printPdf } from './lib/printpdf.mjs';
import { profile, kindOf } from './lib/industry.mjs';
import { thesisCheck, toolFit, whyAion, SUBSECTORS, kindFor, REVENUE_MODELS } from './lib/thesis.mjs';
import { extraLevers } from './lib/extras.mjs';
import { initStore, saveSearch, loadSearch, listSearches } from './lib/search/store.mjs';
import { PRICE, browserConfig } from './lib/private.mjs';
import * as OUT from './lib/outreach/outreach.mjs';
import * as CONFIRM from './lib/outreach/confirm.mjs';
import { outreachRoute } from './routes/outreach.mjs';
import { searchRoute } from './routes/search.mjs';
import { dealRoute } from './routes/deal.mjs';
import * as GMAIL from './lib/outreach/gmail.mjs';
import { runSearch } from './lib/search/pipeline.mjs';
import { initMemory, ingest, known, stats as memStats, dealOf } from './lib/search/memory.mjs';
import { initContacts, warm } from './lib/search/contacts.mjs';
import { loadEnv } from './lib/search/sources.mjs';
import { listedFor } from './lib/search/timing.mjs';
import { rankAll, rankOne, APPROACH } from './lib/search/rank.mjs';
import { initRadar } from './lib/search/radar.mjs';
// background jobs that failed: logged and shown on the page (never swallowed), by job (intent, radar, signals)
const JOB_ERR = {};
const jobFailed = what => e => { const msg = String(e?.message || e || 'unknown error').slice(0, 300); JOB_ERR[what] = { at: new Date().toISOString(), error: msg }; console.error(`AION: ${what} stopped: ${msg}`); };
import { initWatch, watches, due, started as watchStarted, finished as watchFinished } from './lib/search/watch.mjs';
import { initBenchmarks, loanRates, industryNames, peerMargin } from './lib/benchmarks.mjs';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { runClaude, MODELS } from './lib/claude.mjs';
import { initEngine } from './lib/engine.mjs';
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
  // one-time: the old 4.0× default becomes the price guide's target; a multiple you set yourself stays
  if (!S.assumptions.priceRuleV) { if (S.assumptions.entry_multiple === 4) S.assumptions.entry_multiple = PRICE.target; S.assumptions.priceRuleV = 1; }
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
  out.quality = S.file.kind === 'gl' ? quality(ROWS, S.mapping, S.signMode, per, S.parse?.opening || {}) : null;
  out.priorTTM = S.file.kind === 'gl' && !per.prior.partial ? pnl(ROWS, S.mapping, S.signMode, per.prior) : null;
  out.payConcentration = payConcentration(per.ttm);
  const ttm = out.pnl.TTM;
  out.dso = out.quality ? dso(out.quality.ar, ttm.revenue) : null;
  // no owner on the payroll in published statements (e.g. a public company): management is already paid, so no replacement salary
  const noOwner = S.file.kind === 'pdf' && !ttm.byCat.comp_owner && !S.owner.extraOwnerComp;
  out.normalization = normalize(ttm, S.addbacks || [], noOwner ? { ...S.owner, count: 0 } : S.owner);
  out.noOwnerAdjustment = noOwner;
  if (S.file.kind === 'gl') {
    out.monthly = monthlySeries(ROWS, S.mapping, S.signMode, S.range, S.parse?.opening || {});
    out.flow = customerFlow(ROWS, S.mapping, S.signMode, S.range);
    const hasWC = Object.values(S.mapping).some(c => c === 'bs_ar' || c === 'bs_ap' || c === 'bs_inventory');
    const last12 = out.monthly.slice(-12);
    // working capital target: the usual amount tied up in money owed to the company plus stock, minus bills it owes
    if (hasWC && last12.length && last12.every(x => x.wc != null)) out.wc = { peg: r2(last12.reduce((t, x) => t + x.wc, 0) / last12.length), latest: last12[last12.length - 1].wc, low: Math.min(...last12.map(x => x.wc)), high: Math.max(...last12.map(x => x.wc)), months: last12.length, hasAP: Object.values(S.mapping).includes('bs_ap'), hasInv: Object.values(S.mapping).includes('bs_inventory') };
  }
  out.stage = S.normConfirmed ? (S.opsConfirmed ? 'levers' : 'ops') : 'earnings';
  if (S.opsConfirmed) {
    out.levers = levers(ttm, S.ops, S.assumptions, S.vendors);
    // optional files: add their levers; the general price rise no longer applies to customers already being brought up to normal price
    const ex = extraLevers(S.extra, S.assumptions, { payrollBooks: (ttm.byCat.comp_producers || 0) + (ttm.byCat.comp_admin || 0) + (ttm.byCat.comp_owner || 0) });
    const disc = ex.find(x => x.id === 'discounts');
    if (disc) { const overlap = r2(disc.underRevenue * S.assumptions.pricing_uplift * (1 - (S.ops.commission_rate || 0))); out.levers.nonAI.pricing = r2(Math.max(0, out.levers.nonAI.pricing - overlap)); out.levers.nonAI.total = r2(out.levers.nonAI.total - overlap); out.levers.runRate = r2(out.levers.runRate - overlap); }
    out.extraLevers = ex; out.levers.runRate = r2(out.levers.runRate + ex.reduce((t, x) => t + x.value, 0));
    // industry moves: the AI picks the lever and size; software prices it from this company's accounts, with caps
    const IM = S.industryPlan?.moves || [], acct = S.industryPlan?.acct || {}, acctN = S.industryPlan?.acctN || {}, rev = (ttm.netRevenue ?? ttm.revenue) || 1, gm = rev ? (rev - (ttm.netDirect ?? ttm.direct)) / rev : 0, comm = S.ops?.commission_rate || 0;
    const vendAccts = new Set((S.vendors || []).filter(v => v.accepted && v.account).map(v => v.account)); // already counted as supplier savings
    out.industryLevers = IM.map((mv, i) => {
      const accts = (mv.accounts || []).filter(k => k in acct); let base = accts.reduce((t, k) => t + Math.abs(acct[k]), 0);
      let value = 0, basis = '';
      if (mv.driver === 'price' && base) { const p = Math.min(0.05, Math.max(0, +mv.pct || 0)); value = base * p * (1 - comm); basis = `${$k(base)} of ${accts.join(', ')} × ${+(p * 100).toFixed(1)}% higher price`; }
      else if (mv.driver === 'cost' && base && (base = accts.filter(k => !vendAccts.has(k)).reduce((t, k) => t + Math.abs(acct[k]), 0))) { const p = Math.min(0.15, Math.max(0, +mv.pct || 0)); value = base * p; basis = `${$k(base)} of ${accts.join(', ')} × ${+(p * 100).toFixed(1)}% lower cost`; }
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
    // margins on fee revenue (pass-through ad spend left out); overhead after owner pay and one-off costs are adjusted,
    // without write-offs (they have their own lever), so the benchmark gap is not made bigger than it is
    const grossM = rev ? (rev - (ttm.netDirect ?? ttm.direct)) / rev : 0, ohM = rev ? Math.max(0, ttm.revenue - ttm.direct - out.normalization.normalized - (ttm.byCat.bad_debt || 0)) / rev : 0;
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
    // ecommerce consulting levers (not for the old staffing deals): only those measured straight from the books count
    out.ecomLevers = profile(S).kind === 'staffing' ? [] : ecomLevers({ ttm, rows: S.file.kind === 'gl' ? ROWS : [], mapping: S.mapping, signMode: S.signMode, per, quality: out.quality, S });
    const ecomCounted = out.ecomLevers.filter(x => x.counted).reduce((t, x) => t + x.value, 0);
    L0.runRate = r2(L0.nonAI.total + ex.reduce((t, x) => t + x.value, 0) + out.industryLevers.reduce((t, x) => t + x.value, 0) + ecomCounted);
    out.benchmarkGaps = peer ? { peer, grossM, ohM, gGap, oGap } : null;
    out.cashRelease = cashRelease(out.dso, S.assumptions.dso_reduction_days, ttm.revenue);
    out.proForma = r2(out.normalization.normalized + out.levers.runRate);
    const L = out.levers;
    out.rates = loanRates();
    out.peer = peer;
    // a business that loses money cannot be priced on a multiple of profit
    // …and less than a year of books can't be priced as a year's profit
    const short = per.monthsCovered < 12;
    out.unpriceable = short || (S.assumptions.price_basis === 'revenue' ? !(ttm.netRevenue > 0) : out.normalization.normalized <= 0);
    out.unpriceableWhy = short ? 'short' : out.unpriceable ? 'loss' : null; out.monthsCovered = per.monthsCovered;
    out.deal = out.unpriceable ? null : dealReturns(out.normalization.normalized, L.runRate, dealInputs(out), ttm.netRevenue);
  }
  if (out.deal) {
    // three cases, weighted by how well each number is backed: from the books counts most, guesses least
    const acts = actionList(out).filter(x => x.value > 0), aiCost = 0;
    const W = { 'From the books': [0.8, 1, 1.2], Confirmed: [0.8, 1, 1.2], 'From the sales file': [0.7, 1, 1.2], 'From the payroll file': [0.7, 1, 1.2], 'Benchmark gap': [0.6, 1, 1.3] };
    out.cases = ['Cautious', 'Expected', 'Stretch'].map((name, k) => { const gain = r2(acts.reduce((t, x) => t + x.value * (W[x.sure] || [0.5, 1, 1.3])[k], 0) - aiCost); const r = dealReturns(out.normalization.normalized, gain, dealInputs(out), ttm.netRevenue); return { name, gain, ebitda: r2(out.normalization.normalized + gain), value: r2(gain * (out.deal.ebitdaMultiple ?? out.deal.multiple)), moic: r.base.net.moic, irr: r.base.net.irr }; });
  }
  if (CHECK.length && out.monthly && out.deal) out.checkin = checkinAnalysis(out);
  // AION thesis v3.0: books-and-diligence check, tool fit and why AION (lib/thesis.mjs); never one blended score
  if (S.normConfirmed && out.normalization) { const PR = profile(S), check = thesisCheck({ S, d: out, profile: PR }), fit = toolFit({ S, d: out, profile: PR }); out.aion = { check, fit, why: whyAion({ S, d: out, profile: PR, check, fit }) }; }
  out.limits = limits(out);
  return out;
}
// what the deal maths gets: the settings, today's loan rates, and no AI set-up cost while AI savings are not counted
const dealInputs = d => ({ ...S.assumptions, rates: d.rates, implementation: d.levers?.aiSkipped ? 0 : S.assumptions.implementation });
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
  await printPdf(`http://127.0.0.1:${PORT}/api/outreach/print?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}`, out, { budgetMs: 5000 });
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
    return { search: x.search, entity: x.entity, rank: x.rank, name: x.name, website: x.website, place: x.place, industry: x.industry, fit: x.fit, fitRecounted: !!x.fitRecounted, niche: x.niche, focus: x.focus, segment: x.segment, segmentLabel: x.segmentLabel, rankScore: x.score, parts: x.parts, size: x.size, offer: x.offer, offerWhy: x.offerWhy, email: x.email || '', box: x.box, kinds: x.kinds, approach: x.approach, approachText: APPROACH[x.approach], owner: x.owner, emails: x.emails, phone: x.phone, warmIntro: x.warmIntro, contacted: !!o, why: x.why, intent: x.intent, strongFit: !!x.strongFit || o?.replied?.kind === 'interested', strength: x.strength, marketed: !!x.marketed, segmentTier: ['retail_placement', 'marketplace', 'strategy'].includes(x.segment) ? 1 : 2,
      scores: o?.replied?.kind === 'interested' ? { ...x.scores, intent: { ...x.scores.intent, label: 'Confirmed', category: 'confirmed', explicit: true, evidence: [{ label: 'Replied interested', text: `Replied to your email (${String(o.replied.at || '').slice(0, 10)})`, url: '', date: String(o.replied.at || '').slice(0, 7) }, ...x.scores.intent.evidence] } } : x.scores,
      outreach: o ? { id: o.id, phase: o.phase, status: o.status, sentAt: o.sentAt, sender: o.sender, to: o.to } : null, decision: e?.decision || '',
      deal: s2 && e ? dealOf(s2, e)?.stage || '' : '',
      clients: (e?.clientBook?.clients || []).map(c => c.company || c.name || c).filter(Boolean).slice(0, 30), researched: e?.founderProfile?.at || null, firstSeen: e?.firstSeen || s2?.created || null,
      signals: x.signals.filter(y => y.path).map(y => ({ key: y.key, label: y.label, path: y.path, text: unent(y.text), url: y.url, date: y.date, direction: y.direction, confidence: y.confidence, source: y.source })).sort((a, b) => (CLUE_ORDER[a.key] ?? 5) - (CLUE_ORDER[b.key] ?? 5)) }; };
  // one list, one numbering: every firm is a buyout (full or majority); a partnership only when the firm asked for one
  const list = R.ranked.map(slim), marketed = R.listed.map(slim); let n = 0; for (const x of list) { x.track = x.offer === 'partner' ? 'partner' : 'buy'; if (x.niche) x.nicheRank = ++n; }
  return { R, list, marketed, ss };
}
// What to write to next. `ready` = strong fits only (confirmed buy box, named owner, a strong recent sign), best first, not yet
// in outreach. `saved` = everything you saved or marked priority yourself (firms, brands, people) that has no outreach yet.
function outreachReady() {
  const { list, ss } = ownerList(), out = [];
  for (const x of list) { if (x.outreach || !x.niche || !x.strongFit) continue;
    out.push({ search: x.search, entity: x.entity, mode: 'target', name: x.name, where: x.place, score: x.fit, picked: ['saved', 'priority'].includes(x.decision), priority: x.decision === 'priority', emails: x.emails, pitch: x.offer, track: x.track, dealWhy: x.offerWhy, box: x.box, high: !!x.intent?.high, rankScore: x.rankScore, rank: x.nicheRank, segment: x.segment, segmentLabel: x.segmentLabel, site: !!x.website, strongFit: true, dir: x.strength?.dir || null }); }
  return out.slice(0, 80);
}
function savedReady() {
  const { list, ss } = ownerList(), out = [];
  const B = OUT.board(), have = new Set(B.map(x => `${x.search}|${x.entity}`)), haveName = new Set(B.map(x => `${x.mode}|${normName(x.name)}`)), seen = new Set();
  for (const s2 of ss) for (const e of (s2.entities || []).filter(e => e.scored && ['saved', 'priority'].includes(e.decision))) {
    const name = s2.mode === 'candidate' ? e.name : e.company, k = `${s2.mode}|${normName(name)}`;
    if (have.has(`${s2.id}|${e.id}`) || haveName.has(k) || seen.has(k)) continue;
    if (s2.mode === 'target' && (e.listed || listedFor((e.timing?.signals || []).map(x => ({ ...x, signal: x.key })), e))) continue;
    const R = s2.mode === 'target' ? list.find(x => x.search === s2.id && x.entity === e.id) || rankOne(e) : null;
    if (R?.strongFit) continue; // a strong fit is already in the owner list: never listed twice
    seen.add(k);
    out.push({ search: s2.id, entity: e.id, mode: s2.mode, name, where: String(e.location || '').split(/\s[(;]/)[0], what: s2.mode === 'candidate' ? [e.title, e.employer].filter(Boolean).join(' · ') : e.industry || '', score: e.score ?? 0, priority: e.decision === 'priority', emails: (e.contactInfo || []).filter(c => c.kind === 'email').length, pitch: R ? R.offer : null, strongFit: !!R?.strongFit, missing: R?.strength?.missing || [], recent: (R?.strength?.counted || [])[0]?.text || '' });
  }
  return out.sort((a, b) => (b.priority - a.priority) || (b.strongFit - a.strongFit) || b.score - a.score).slice(0, 80);
}
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
    // owner pay is already added back in full (and replaced by a market salary), so it is never an add-back too;
    // a ledger line counts in one add-back only, even when two suggestions match it
    const inEbitda = a => ['direct', 'opex'].includes(CATEGORIES[S.mapping[a.account]]?.group) && S.mapping[a.account] !== 'comp_owner';
    const used = new Set(), byId = new Map(ROWS.map(r => [r.id, r]));
    S.addbacks = (data.addbacks || []).filter(inEbitda).map((a, i) => { const m = matchRows(ROWS, a, S.mapping, S.signMode, per.ttm); const ids = m.ids.filter(x => { const r = byId.get(x); return r && S.mapping[r.account] !== 'comp_owner' && !used.has(x); }); ids.forEach(x => used.add(x));
      return { ...a, id: 'ab' + i, amount: r2(ids.reduce((t, x) => { const r = byId.get(x); return t + rowValue(r, S.mapping[r.account] || 'other_opex', S.signMode); }, 0)), ids, accepted: false }; }).filter(a => a.ids.length && a.amount);
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
    if (d.deal.downside.minDscr != null) detail(`Bad-year test (profit ${Math.round(d.deal.downsideDrop * 100)}% lower): profit still covers loan payments ${d.deal.downside.minDscr.toFixed(1)}×`);
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
  if (L.nonAI.pricing > 0) out.push({ title: 'Raise prices on new work to close half the margin gap to peers', value: L.nonAI.pricing, basis: L.nonAI.pricingBasis, owner: 'Owner and sales lead', sure: 'Benchmark gap', steps: lev('pricing')?.steps, kpis: [`Average fee per ${profile(S).job || 'client'}`, 'Win rate on proposals'] });
  if (L.nonAI.writeoffs > 0) out.push({ title: 'Bill on time and chase late invoices', value: L.nonAI.writeoffs, basis: 'Ledger write-offs × reduction (assumption)', owner: 'Office manager', sure: 'From the books', steps: ['Send every bill the day the work is done', 'Automatic reminders at 15 and 30 days', 'Weekly review of anything over 45 days'], kpis: ['Days to get paid', 'Write-offs'] });
  if (L.nonAI.vendors > 0) out.push({ title: 'Cut supplier and tool costs', value: L.nonAI.vendors, basis: 'Ledger spend × saving (confirmed)', owner: 'Owner', sure: 'Confirmed', steps: lev('vendors')?.steps, kpis: ['Supplier spend as a share of sales'] });
  for (const x of d.extraLevers || []) out.push(x.id === 'discounts' ? { title: `Bring ${x.basis.count} customers up to normal prices`, value: x.value, basis: 'Sales file: half the measured price gap', owner: 'Owner', sure: 'From the sales file', steps: ['Review each discounted account with the owner', 'Move to normal prices at renewal, with notice', 'Approve any discount left in writing'], kpis: ['Average price vs. normal price'] } : { title: 'Cut overtime with better scheduling', value: x.value, basis: 'Payroll file: overtime × share moved to regular hours', owner: 'Operations lead', sure: 'From the payroll file', steps: ['See who works the most overtime, and why', 'Plan the week ahead and spread the work', 'Approve overtime in advance'], kpis: ['Overtime pay per month'] });
  for (const x of (d.industryLevers || []).filter(y => y.value > 0)) out.push({ title: x.title, value: x.value, basis: x.basis, owner: x.owner, sure: x.sure, steps: x.steps, kpis: x.kpis });
  for (const x of (d.ecomLevers || []).filter(y => y.counted && y.value > 0)) out.push({ title: x.title, value: x.value, basis: x.basis, owner: 'Owner and bookkeeper', sure: x.sure, steps: x.steps, kpis: x.kpis });
  if (!L.aiSkipped && L.ai > 0) out.push({ title: 'Use AI for routine paperwork', value: L.ai, basis: 'Estimated hours saved × extra jobs won', owner: 'Operations lead', sure: 'Estimate', steps: [], kpis: ['Hours per job'] });
  return out.sort((x, y) => y.value - x.value);
}
const $k = v => (v < 0 ? '−' : '') + (Math.abs(v) >= 1e6 ? '$' + (Math.abs(v) / 1e6).toFixed(2) + 'M' : '$' + Math.round(Math.abs(v) / 1000) + 'K');
function checks() {
  if (!S.normConfirmed || !S.opsConfirmed) return [];
  const d = derive(); if (!d.pnl) return []; const t = d.pnl.TTM; const out = []; // accounts not confirmed yet: nothing to ask
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

// what routes/outreach.mjs needs; the open deal is read live (loadDeal replaces S and CUR)
const OUTCTX = { send, body, OUT, GMAIL, CONFIRM, ownerList: () => ownerList(), outreachReady: () => outreachReady(), savedReady: () => savedReady(), letterHtml: (...a) => letterHtml(...a), outreachPdf: (...a) => outreachPdf(...a), PORT, SRUN, loadSearch, MODELS, ROOTWS, finderKeys: () => finderKeys(), busy: () => busy(), loadDeal: id => loadDeal(id), derive: () => derive(), persist: () => persist(), deal: { cur: () => CUR, S: () => S } };
// what routes/search.mjs and routes/deal.mjs need; the open deal (S, ROWS, CHECK, CUR) and the running AI step are read and written live
const SEARCHCTX = { send, body, SRUN, JOB_ERR, jobFailed, ROOTWS, ownerList: () => ownerList(), startSearch: a => startSearch(a), cityOf, finderKeys: () => finderKeys(), saveFinderKeys: k => saveFinderKeys(k) };
const st = Object.defineProperties({}, Object.fromEntries(Object.entries({
  S: [() => S, v => { S = v; }], ROWS: [() => ROWS, v => { ROWS = v; }], CHECK: [() => CHECK, v => { CHECK = v; }], CUR: [() => CUR, v => { CUR = v; }], CURJ: [() => CURJ, v => { CURJ = v; }], FRESH: [() => FRESH, v => { FRESH = v; }],
}).map(([k, [get, set]]) => [k, { get, set, enumerable: true }])));
const DEALCTX = { send, body, st, AI, ARCHIVE, D, LOGF, PORT, actionList: d => actionList(d), busy: () => busy(), derive: () => derive(), detail: t => detail(t), job: (n, f) => job(n, f), jobs, listDeals: () => listDeals(), loadDeal: id => loadDeal(id), newDeal: f => newDeal(f), persist: () => persist(), runAll: j => runAll(j), save, view: () => view() };
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
      // Search, Outreach and Value Creation routes live in routes/search.mjs, routes/outreach.mjs and routes/deal.mjs
      if ((await searchRoute(req, res, url, p, SEARCHCTX)) !== false) return;
      if (p.startsWith('outreach/') && (await outreachRoute(req, res, url, p, OUTCTX)) !== false) return;
      if ((await dealRoute(req, res, url, p, DEALCTX)) !== false) return;
      if (req.method !== 'POST') return send(res, 405, { error: 'method' });
      return send(res, 404, { error: 'unknown endpoint' });
    }
    // the browser gets the same price guide as the server (from private/config.json when present); only this computer sees it
    if (url.pathname === '/thesis.mjs') return send(res, 200, `${fs.readFileSync(path.join(ROOT, 'lib', 'thesis.mjs'), 'utf8')}\nconfigure(${JSON.stringify(browserConfig())});\n`, 'text/javascript');
    let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!(f === PUB || f.startsWith(PUB + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream');
  } catch (e) {
    // plain words for the screen; file paths and parser details stay in the server log
    const msg = String(e?.message || 'Something went wrong.');
    if (/\/Users\/|\/private\/|ENOENT|EACCES|JSON|Unexpected token|at position/i.test(msg)) { console.error('AION request failed:', msg); return send(res, 400, { error: e instanceof SyntaxError ? 'The request could not be read.' : 'Something went wrong on this computer. See the server log for details.' }); }
    return send(res, 400, { error: msg });
  }
});
server.requestTimeout = 0;
initEngine(ROOTWS);
initBenchmarks(path.join(ROOTWS, 'benchmarks.json'));
initStore(path.join(ROOTWS, 'searches'));
initRadar(path.join(ROOTWS, 'searches')); initMemory(path.join(ROOTWS, 'searches')); initWatch(path.join(ROOTWS, 'searches')); initContacts(path.join(ROOTWS, 'searches')); loadEnv(ROOT);
OUT.initOutreach(path.join(ROOTWS, 'outreach'));
{ const n = OUT.resumeWriting({ model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach'), load: id => { try { return loadSearch(id); } catch { return null; } } }); if (n) console.log(`Outreach: writing ${n} interrupted draft(s) again`); }
// replies, bounces and opt-outs: checked every 10 minutes while AION runs
setInterval(outreachTick, 10 * 60_000).unref(); setTimeout(outreachTick, 20_000).unref();
// scheduled sends: checked every minute (replies are synced first, so a reply cancels a due follow-up)
setInterval(async () => { try { if (OUT.hasDue?.()) { if (GMAIL.accounts().length) await OUT.syncReplies(); await OUT.runScheduled(); } } catch {} }, 60_000).unref();
// first start: build the network from searches already on disk
if (!memStats().people && !memStats().companies) for (const h of listSearches()) { const s2 = loadSearch(h.id); if (s2?.entities) ingest(s2); }
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use: AION may already be running. Close it, or set PORT to another number.` : `The local server could not start: ${e.message}`); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => console.log(`AION GL analyzer → http://localhost:${PORT}`));
