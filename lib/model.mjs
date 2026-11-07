// Deterministic finance model. The AI only classifies and proposes; every number is computed here.

export const CATEGORIES = {
  rev_sales:      { label: 'Sales of products or services', group: 'revenue', side: 'credit' },
  rev_retained:   { label: 'Revenue · retained searches (paid upfront, search firms)', group: 'revenue', side: 'credit' },
  rev_contingent: { label: 'Revenue · success fees (paid on hire, search firms)', group: 'revenue', side: 'credit' },
  rev_fractional: { label: 'Revenue · part-time executive placements (search firms)', group: 'revenue', side: 'credit' },
  rev_advisory:   { label: 'Revenue · advisory work', group: 'revenue', side: 'credit' },
  rev_recurring:  { label: 'Revenue · recurring programs, inspections, retainers or managed services', group: 'revenue', side: 'credit' },
  rev_project:    { label: 'Revenue · projects (time and materials, fixed fee, milestones)', group: 'revenue', side: 'credit' },
  rev_staffing:   { label: 'Revenue · contract or temporary staffing (billed hours)', group: 'revenue', side: 'credit' },
  rev_other:      { label: 'Revenue · other', group: 'revenue', side: 'credit' },
  rev_refunds:    { label: 'Refunds, returns and discounts given', group: 'revenue', side: 'credit' },
  cogs:           { label: 'Materials and cost of goods sold', group: 'direct', side: 'debit' },
  cos_contractors:{ label: 'Contractors and subcontractors', group: 'direct', side: 'debit' },
  comp_producers: { label: 'Pay for staff who do the paid work (recruiters, technicians, consultants…)', group: 'direct', side: 'debit' },
  comp_admin:     { label: 'Admin staff pay', group: 'opex', side: 'debit' },
  comp_owner:     { label: 'Owner pay', group: 'opex', side: 'debit' },
  payroll_burden: { label: 'Payroll taxes & benefits', group: 'opex', side: 'debit' },
  sourcing_tools: { label: 'Industry tools, data and job boards', group: 'opex', side: 'debit' },
  software:       { label: 'Software', group: 'opex', side: 'debit' },
  rent:           { label: 'Rent & facilities', group: 'opex', side: 'debit' },
  travel:         { label: 'Travel & meals', group: 'opex', side: 'debit' },
  marketing:      { label: 'Marketing & business development', group: 'opex', side: 'debit' },
  professional:   { label: 'Professional fees', group: 'opex', side: 'debit' },
  insurance:      { label: 'Insurance', group: 'opex', side: 'debit' },
  bad_debt:       { label: 'Unpaid invoices written off', group: 'opex', side: 'debit' },
  other_opex:     { label: 'Other costs', group: 'opex', side: 'debit' },
  interest:       { label: 'Interest expense', group: 'below', side: 'debit' },
  da:             { label: 'Depreciation & amortization', group: 'below', side: 'debit' },
  income_tax:     { label: 'Income taxes', group: 'below', side: 'debit' },
  other_income:   { label: 'Other income (non-operating)', group: 'below', side: 'credit' },
  other_expense:  { label: 'Other expense (non-operating)', group: 'below', side: 'debit' },
  bs_cash:        { label: 'Balance sheet · cash', group: 'bs', side: 'debit' },
  bs_ar:          { label: 'Balance sheet · accounts receivable', group: 'bs', side: 'debit' },
  bs_inventory:   { label: 'Balance sheet · inventory', group: 'bs', side: 'debit' },
  bs_ap:          { label: 'Balance sheet · bills owed to suppliers (accounts payable)', group: 'bs', side: 'credit' },
  bs_other:       { label: 'Balance sheet · other', group: 'bs', side: 'debit' },
  exclude:        { label: 'Exclude', group: 'bs', side: 'debit' },
};
export const REVENUE_CATS = Object.keys(CATEGORIES).filter(k => CATEGORIES[k].group === 'revenue');
// every revenue line the firm sets a price on; refunds and 'other' (often non-fee income) are left out
export const FEE_CATS = ['rev_sales', 'rev_retained', 'rev_contingent', 'rev_fractional', 'rev_advisory', 'rev_recurring', 'rev_project', 'rev_staffing'];

export const r2 = v => Math.round(v * 100) / 100;
const sum = a => a.reduce((s, v) => s + v, 0);

/** Value of a row in its category's natural direction (revenue positive, expense positive). */
export function rowValue(row, cat, signMode) {
  const side = CATEGORIES[cat]?.side ?? 'debit';
  if (signMode === 'natural') return row.amount;
  return side === 'credit' ? -row.amount : row.amount;
}

export function detectSignMode(rows, mapping) {
  const rev = sum(rows.filter(r => CATEGORIES[mapping[r.account]]?.group === 'revenue').map(r => r.amount));
  return rev >= 0 ? 'natural' : 'debit';
}

function monthKey(d) { return d.slice(0, 7); }
function addMonths(ym, n) { let [y, m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; }

/** Periods: each calendar year present (flagged partial) and TTM ending at the last full month. */
export function periods(range) {
  const end = range.reportEnd && range.reportEnd >= range.end ? range.reportEnd : range.end;
  const endM = monthKey(end), startM = monthKey(range.start);
  const lastDay = new Date(Date.UTC(+end.slice(0, 4), +end.slice(5, 7), 0)).getUTCDate();
  let ttmEnd = +end.slice(8, 10) >= lastDay - 7 ? endM : addMonths(endM, -1);
  if (ttmEnd < startM) ttmEnd = endM; // less than one month of data: use what exists
  const ttmStart = addMonths(ttmEnd, -11);
  const out = [];
  for (let y = +startM.slice(0, 4); y <= +endM.slice(0, 4); y++) {
    const from = `${y}-01`, to = `${y}-12`;
    const partial = startM > from || ttmEnd < to;
    out.push({ key: `FY${y}`, from, to, partial });
  }
  out.push({ key: 'TTM', from: ttmStart, to: ttmEnd, partial: ttmStart < startM });
  const prior = { key: 'PRIOR_TTM', from: addMonths(ttmStart, -12), to: addMonths(ttmStart, -1), partial: addMonths(ttmStart, -12) < startM };
  const covered = Math.min(12, (+ttmEnd.slice(0, 4) - +startM.slice(0, 4)) * 12 + (+ttmEnd.slice(5, 7) - +startM.slice(5, 7)) + 1);
  return { list: out, ttm: out[out.length - 1], prior, monthsCovered: Math.max(0, covered) };
}
const inP = (row, p) => { const m = monthKey(row.date); return m >= p.from && m <= p.to; };

export function pnl(rows, mapping, signMode, p) {
  const byCat = Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, 0]));
  for (const r of rows) {
    const c = mapping[r.account]; if (!c || !inP(r, p)) continue;
    byCat[c] += rowValue(r, c, signMode);
  }
  const g = grp => sum(Object.keys(CATEGORIES).filter(k => CATEGORIES[k].group === grp).map(k => byCat[k]));
  const revenue = g('revenue');
  const direct = g('direct');
  const opex = g('opex');
  const ebitda = revenue - direct - opex;
  const net = ebitda - byCat.interest - byCat.da - byCat.income_tax + byCat.other_income - byCat.other_expense;
  return { byCat: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, r2(v)])), revenue: r2(revenue), direct: r2(direct), contribution: r2(revenue - direct), opex: r2(opex), ebitda: r2(ebitda), net: r2(net) };
}

/** Rows matched by an add-back rule, summed within a period. */
export function matchRows(rows, rule, mapping, signMode, p) {
  const memo = rule.memo_contains ? String(rule.memo_contains).toLowerCase() : null;
  const hits = rows.filter(r =>
    (!rule.account || r.account === rule.account) &&
    (!rule.payee || r.name === rule.payee) &&
    (!memo || r.memo.toLowerCase().includes(memo)) &&
    (!p || inP(r, p)));
  const amount = sum(hits.map(r => rowValue(r, mapping[r.account] || 'other_opex', signMode)));
  return { ids: hits.map(r => r.id), amount: r2(amount) };
}

export function normalize(ttmPnl, addbacks, owner) {
  const accepted = addbacks.filter(a => a.accepted);
  const addTotal = sum(accepted.map(a => a.amount));
  const ownerActual = ttmPnl.byCat.comp_owner + (owner.extraOwnerComp || 0);
  const replacement = (owner.marketComp || 0) * (owner.count ?? 1);
  const normalized = ttmPnl.ebitda + addTotal + ownerActual - replacement;
  return {
    reported: ttmPnl.ebitda, addbacks: r2(addTotal), ownerActual: r2(ownerActual), replacement: r2(replacement),
    normalized: r2(normalized), unaccepted: r2(sum(addbacks.filter(a => !a.accepted).map(a => a.amount))),
  };
}

/** Revenue quality, customers, collections — whatever the GL supports. Missing data returns null, never a guess. */
export function quality(rows, mapping, signMode, per) {
  const ttm = per.ttm, prior = per.prior;
  const revRows = rows.filter(r => CATEGORIES[mapping[r.account]]?.group === 'revenue');
  const cust = r => r.client || r.name;
  const byCust = (p) => { const m = {}; for (const r of revRows) if (inP(r, p) && cust(r)) m[cust(r)] = (m[cust(r)] || 0) + rowValue(r, mapping[r.account], signMode); return m; };
  const cT = byCust(ttm), cP = byCust(prior);
  const named = Object.entries(cT).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const totalNamed = sum(named.map(([, v]) => v));
  const share = n => totalNamed ? r2(sum(named.slice(0, n).map(([, v]) => v)) / totalNamed) : null;
  const priorCust = Object.keys(cP).filter(k => cP[k] > 0);
  const retained = priorCust.filter(k => (cT[k] || 0) > 0).length;
  // repeat revenue: share of this year's named revenue from clients who also paid the year before
  const repeatRev = sum(named.filter(([k]) => (cP[k] || 0) > 0).map(([, v]) => v));

  const invoices = revRows.filter(r => inP(r, ttm) && rowValue(r, mapping[r.account], signMode) > 0);
  const invVals = invoices.map(r => rowValue(r, mapping[r.account], signMode));
  // installment pattern: same customer, equal amounts (±1%) within 120 days
  let inst = 0;
  const byC = {};
  for (const r of invoices) (byC[cust(r) || '?'] ??= []).push(r);
  for (const list of Object.values(byC)) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const used = new Set();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const va = rowValue(a, mapping[a.account], signMode), vb = rowValue(b, mapping[b.account], signMode);
      const days = (Date.parse(b.date) - Date.parse(a.date)) / 864e5;
      if (days <= 120 && Math.abs(va - vb) <= 0.01 * Math.max(va, vb)) { used.add(a.id); used.add(b.id); }
    }
    inst += used.size;
  }

  const eng = {};
  for (const r of invoices) if (r.engagement) eng[r.engagement] = (eng[r.engagement] || 0) + rowValue(r, mapping[r.account], signMode);
  const engVals = Object.values(eng);
  const months = {};
  for (const r of revRows) { const m = monthKey(r.date); months[m] = (months[m] || 0) + rowValue(r, mapping[r.account], signMode); }

  // AR / DSO from receivable accounts, if present
  const arAccts = Object.keys(mapping).filter(a => mapping[a] === 'bs_ar');
  let ar = null;
  if (arAccts.length) {
    const arRows = rows.filter(r => arAccts.includes(r.account)).sort((a, b) => a.date.localeCompare(b.date));
    const monthEnd = {}; let run = 0; const hasBal = arRows.some(r => r.balance != null);
    const perAcct = {};
    for (const r of arRows) {
      if (hasBal && r.balance != null) perAcct[r.account] = r.balance; else { perAcct[r.account] = (perAcct[r.account] || 0) + rowValue(r, 'bs_ar', signMode); }
      monthEnd[monthKey(r.date)] = sum(Object.values(perAcct));
    }
    const ttmMonths = []; for (let m = ttm.from; m <= ttm.to; m = addMonths(m, 1)) ttmMonths.push(m);
    let last = null; const series = ttmMonths.map(m => { if (monthEnd[m] != null) last = monthEnd[m]; return last; }).filter(v => v != null);
    const credits = sum(arRows.filter(r => inP(r, ttm)).map(r => rowValue(r, 'bs_ar', signMode)).filter(v => v < 0).map(v => -v));
    run = series.length ? sum(series) / series.length : null;
    ar = { avgBalance: run != null ? r2(run) : null, collectionsTTM: r2(credits), basedOnBalanceColumn: hasBal, months: series.length };
  }
  return {
    customersTTM: named.length, top1: share(1), top5: share(5), top10: share(10),
    topCustomers: named.slice(0, 10).map(([n, v]) => ({ name: n, revenue: r2(v), share: totalNamed ? r2(v / totalNamed) : null })),
    priorCustomers: priorCust.length, retainedCustomers: retained,
    retention: priorCust.length && !prior.partial ? r2(retained / priorCust.length) : null,
    repeatShare: priorCust.length && !prior.partial && totalNamed ? r2(repeatRev / totalNamed) : null,
    invoicesTTM: invoices.length, avgInvoice: invoices.length ? r2(sum(invVals) / invoices.length) : null,
    installmentShare: invoices.length ? r2(inst / invoices.length) : null,
    engagementsTTM: engVals.length || null, avgRevenuePerEngagement: engVals.length ? r2(sum(engVals) / engVals.length) : null,
    monthly: Object.entries(months).sort().map(([m, v]) => ({ m, v: r2(v) })),
    ar,
  };
}

export function dso(ar, ttmRevenue) {
  if (!ar || ar.avgBalance == null || !ttmRevenue) return null;
  return r2(ar.avgBalance / ttmRevenue * 365);
}

export const DEFAULT_ASSUMPTIONS = {
  pricing_uplift: 0.02,
  writeoff_reduction: 0.25,
  dso_reduction_days: 7,
  demand_searches: 2,
  completion_rate: 0.7,
  growth_share: 0.5,
  avoided_share: 0,
  realizable_spend: 0,
  weeks_per_year: 48,
  software_per_user_month: 150,
  implementation: 40000,
  ongoing_ops: 24000,
  year1_ramp: 0.5,
  stake: 1, // share of the company AION buys: 1 = full buyout; 0.7 = majority stake, the owner keeps 30% and keeps running it
  entry_multiple: 3.25, // thesis: pay about 3.25× real profit, never above 3.5× (more only as an earnout)
  vehicle: 'holdco',
  senior_multiple: 1.5,
  seller_share: 0.16,
  price_basis: 'ebitda',
  revenue_multiple: 2.5,
  workflows: [
    { key: 'research', label: 'Search research & market mapping', who: 'producers', saved: 0.35 },
    { key: 'sourcing', label: 'Sourcing & candidate rediscovery', who: 'producers', saved: 0.30 },
    { key: 'outreach', label: 'Outreach drafting & follow-up', who: 'producers', saved: 0.40 },
    { key: 'crm', label: 'CRM updates & call notes', who: 'producers', saved: 0.50 },
    { key: 'reporting', label: 'Client status reporting', who: 'producers', saved: 0.40 },
    { key: 'backoffice', label: 'Invoicing, collections & close', who: 'admin', saved: 0.30 },
  ],
};

/** Lever + ROI model. ops = confirmed operating inputs; a = assumptions; vendors = accepted vendor items. */
export function levers(base, ops, a, vendors) {
  const commission = ops.commission_rate ?? 0;
  const contrib = v => v * (1 - commission);
  const feeBase = sum(FEE_CATS.map(k => base.byCat[k] || 0));
  const avgFee = ops.avg_fee || 0;

  // non-AI
  const pricingRev = feeBase * a.pricing_uplift;
  const pricing = contrib(pricingRev);
  const writeoffs = (base.byCat.bad_debt || 0) * a.writeoff_reduction;
  const vendorSavings = sum((vendors || []).filter(v => v.accepted).map(v => v.amount));

  // AI workflows: time saved -> capacity -> explicit allocation
  const wf = (a.workflows || []).map(w => {
    const people = w.who === 'admin' ? (ops.admin_fte || 0) : (ops.producers || 0);
    const hrs = ops.hours?.[w.key] ?? 0;
    const saved = people * hrs * a.weeks_per_year * w.saved;
    return { ...w, people, hoursPerWeek: hrs, hoursSaved: r2(saved) };
  });
  const timeSaved = sum(wf.map(w => w.hoursSaved));
  const fteHours = a.weeks_per_year * 40;
  const capacityFte = timeSaved / fteHours;
  const g = Math.min(1, Math.max(0, a.growth_share));
  const av = Math.min(1 - g, Math.max(0, a.avoided_share));
  const growthHours = timeSaved * g;
  const avoidedHours = timeSaved * av;
  const unallocatedHours = Math.max(0, timeSaved - growthHours - avoidedHours);
  const hoursPerSearch = ops.hours_per_search || 0;
  const capacitySearches = hoursPerSearch ? growthHours / hoursPerSearch : 0;
  const extraSearches = Math.min(capacitySearches, Math.max(0, a.demand_searches));
  const growthRev = extraSearches * a.completion_rate * avgFee;
  const contractorRatio = base.revenue ? ((base.byCat.cos_contractors || 0) + (base.byCat.cogs || 0)) / base.revenue : 0;
  const varRate = Math.min(1, commission + contractorRatio);
  const growth = growthRev * (1 - varRate);
  const avoidedTheoretical = (avoidedHours / fteHours) * (ops.loaded_cost_producer || 0);
  const realizable = Math.min(avoidedTheoretical, Math.max(0, a.realizable_spend));

  const users = (ops.producers || 0) + (ops.admin_fte || 0);
  const software = users * a.software_per_user_month * 12;
  const ongoing = a.ongoing_ops;

  const nonAI = pricing + writeoffs + vendorSavings;
  const ai = realizable + growth;
  // AI is only part of the plan when it more than pays for its own running costs
  const aiNet = ai - software - ongoing, aiSkipped = aiNet <= 0;
  const runRate = nonAI + (aiSkipped ? 0 : aiNet);
  const year1 = aiSkipped ? runRate * a.year1_ramp : runRate * a.year1_ramp - a.implementation - software * (1 - a.year1_ramp);
  const invest = aiSkipped ? 0 : a.implementation + software;
  const roi = invest > 0 ? runRate / invest : null;
  const payback = runRate > 0 && !aiSkipped ? a.implementation / (runRate / 12) : null;

  return {
    nonAI: { pricing: r2(pricing), pricingRevenue: r2(pricingRev), writeoffs: r2(writeoffs), vendors: r2(vendorSavings), total: r2(nonAI) },
    workflows: wf,
    six: {
      timeSaved: r2(timeSaved),
      capacityFte: r2(capacityFte),
      allocation: { growthHours: r2(growthHours), avoidedHours: r2(avoidedHours), unallocatedHours: r2(unallocatedHours), overAllocated: a.growth_share + a.avoided_share > 1 },
      cashSavings: r2(realizable), avoidedTheoretical: r2(avoidedTheoretical),
      incrementalRevenue: r2(growthRev + pricingRev), aiRevenue: r2(growthRev), extraSearches: r2(extraSearches), capacitySearches: r2(capacitySearches), demandLimited: capacitySearches > extraSearches, variableCostRate: r2(varRate),
      costs: { software: r2(software), ongoing: r2(ongoing), implementation: r2(a.implementation) },
      netEbitda: r2(runRate),
    },
    ai: r2(ai), aiNet: r2(aiNet), aiSkipped, growth: r2(growth), runRate: r2(runRate), year1: r2(year1), roi: roi == null ? null : r2(roi), paybackMonths: payback == null ? null : r2(payback),
  };
}

export function cashRelease(dsoDays, reductionDays, ttmRevenue) {
  if (dsoDays == null) return null;
  const d = Math.min(reductionDays, dsoDays);
  return r2(ttmRevenue / 365 * d);
}

/** Illustrative deal: buy at a multiple of base-case EBITDA, hold 5 years, value at the same multiple. */
// Who gets what, by type of vehicle. fee = yearly management fee on investors' money; close = one-time fee on the price;
// share = the team's share of investors' profit, paid only above the hurdle (yearly return); sells = whether the company is sold in year 5.
export const VEHICLES = {
  holdco:  { label: 'Holding company', sub: 'keep it for good', fee: 0.01, close: 0, share: 0.10, hurdle: 0.08, sells: false },
  fund:    { label: 'PE fund', sub: 'sell in year 5', fee: 0.02, close: 0, share: 0.20, hurdle: 0.08, sells: true },
  sponsor: { label: 'Independent sponsor', sub: 'one deal at a time', fee: 0, close: 0.02, share: 0.20, hurdle: 0.08, sells: true },
  search:  { label: 'Search fund', sub: 'a first-time operator', fee: 0, close: 0, share: 0.25, hurdle: 0, sells: true },
  sba:     { label: 'SBA loan buyer', sub: 'owner runs it, 10% down', fee: 0, close: 0, share: 0, hurdle: 0, sells: true, sba: true },
};
export function irr(flows) {
  const npv = r => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  let lo = -0.99, hi = 5; if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; (npv(lo) * npv(mid) <= 0) ? hi = mid : lo = mid; }
  return r2((lo + hi) / 2 * 10000) / 10000;
}

/** Illustrative deal: buy at a multiple of base-case EBITDA, hold 5 years, value at the same multiple. */
export function dealReturns(E0, gain, a, revenue) {
  // priced on real profit (the default) or on revenue (software buyers often do; works when profit is thin or negative)
  const basis = a.price_basis === 'revenue' ? 'revenue' : 'ebitda';
  const m = basis === 'revenue' ? (a.revenue_multiple || 2.5) : (a.entry_multiple || 3.25), ev = (basis === 'revenue' ? revenue : E0) * m, fees = 0.05 * ev, uses = ev + fees;
  const V = VEHICLES[a.vehicle] || VEHICLES.holdco;
  // SBA 7(a): the bank lends up to 80% (max $5M) over 10 years at about 10.5%; the seller carries 10%; the buyer puts in the rest
  const senior = V.sba ? Math.min(5e6, 0.8 * uses) : (a.senior_multiple ?? 1.5) * Math.max(0, E0), seller = V.sba ? 0.1 * uses : (a.seller_share ?? 0.16) * uses, equity = Math.max(0, uses - senior - seller);
  // majority stake: the owner rolls their share of the equity into the deal instead of taking it in cash; investors put in
  // and receive only their share. Company-level price, loans and cash flows are unchanged, so the multiple on money is too.
  const stake = V.sba ? 1 : Math.min(1, Math.max(0.5, +a.stake || 1)), rollover = (1 - stake) * equity, invEquity = equity - rollover;
  const rate = V.sba ? (a.rates?.sba ?? 0.105) : (a.rates?.senior ?? 0.10), years = V.sba ? 10 : 7;
  const ramp = [0.5, 0.85, 1, 1, 1];
  const run = (base, g) => {
    let sb = senior, nb = seller, dist = 0, minD = Infinity, e = base; const cash = [];
    for (let y = 1; y <= 5; y++) {
      e = base + g * ramp[y - 1];
      const iS = sb * rate, iN = nb * 0.07, pS = Math.min(sb, senior / years), pN = y <= 2 ? 0 : Math.min(nb, seller / 4);
      const tax = Math.max(0, e - iS - iN - ev / 15) * 0.27, capex = 0.005 * revenue;
      const fcf = e - iS - iN - tax - capex - pS - pN - (y === 1 ? a.implementation : 0);
      const service = iS + iN + pS + pN; if (service > 0) minD = Math.min(minD, (e - tax - capex) / service);
      // a loss-making year needs cash from the owner, so it counts against the return
      sb -= pS; nb -= pN; dist += fcf; cash.push(fcf);
    }
    const end = (basis === 'revenue' ? revenue * m : e * m) - sb - nb;
    // gross: what the company returns to its owners; net: what investors keep after fees and the team's share
    const gross = [-equity, ...cash]; gross[5] += end;
    // investors' part: their share of every flow; fees on their own money only
    const net = gross.map((f, t) => t === 0 ? f * stake - V.close * ev * stake : f * stake - V.fee * invEquity);
    const profit = net.reduce((x, y) => x + y, 0), r0 = irr(net);
    const teamShare = profit > 0 && (r0 ?? 0) > V.hurdle ? V.share * profit : 0;
    net[5] -= teamShare;
    const paidIn = invEquity + V.close * ev * stake, cashOut = net.slice(1, 5).reduce((x, y) => x + y, 0) + (V.sells ? net[5] : net[5] - end * stake + teamShare);
    return { cash, moic: equity ? r2((end + dist) / equity) : null, irr: irr(gross), minDscr: minD === Infinity ? null : r2(minD), bridge: { growth: basis === 'revenue' ? 0 : r2((e - base) * m), base: r2(basis === 'revenue' ? revenue * m : base * m), debtPaid: r2(senior + seller - sb - nb), cash: r2(dist), exitEbitda: r2(e), exitValue: r2(basis === 'revenue' ? revenue * m : e * m), debtLeft: r2(sb + nb) },
      net: { moic: r2(net.slice(1).reduce((x, y) => x + y, 0) / paidIn), irr: irr([-paidIn, ...net.slice(1)]), cash: r2(cashOut), teamShare: r2(teamShare), fees: r2(V.fee * invEquity * 5 + V.close * ev * stake), stillOwned: V.sells ? 0 : r2(end * stake) } };
  };
  // a long hold: the cash each year and how long until the money comes back, alongside the returns above
  const hold = g => { const r = run(E0, g); let cum = 0, yr = null; const steady = r.cash[4] ?? 0; for (let y = 1; y <= 30; y++) { cum += y <= 5 ? r.cash[y - 1] : steady; if (yr == null && cum >= equity) yr = y; } return { yield: equity ? r2((r.cash[2] ?? 0) / equity * 1000) / 1000 : null, steadyCash: r2(steady), paybackYears: yr }; };
  return { multiple: m, basis, price: r2(ev), fees: r2(fees), senior: r2(senior), seller: r2(seller), equity: r2(equity), stake, rollover: r2(rollover), investorEquity: r2(invEquity), sellerCashAtClose: r2(ev - seller - rollover), vehicle: a.vehicle in VEHICLES ? a.vehicle : 'holdco', sba: !!V.sba, rate,
    base: run(E0, gain), none: run(E0, 0), downside: run(E0 >= 0 ? E0 * 0.85 : E0 * 1.15, 0), hold: { base: hold(gain), none: hold(0) } };
}

/** Month by month: sales, profit, gross profit, customers, write-offs, and month-end working capital. */
export function monthlySeries(rows, mapping, signMode, range) {
  const start = monthKey(range.start), end = monthKey(range.end), months = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) months.push(m);
  const out = months.map(m => ({ m, revenue: 0, direct: 0, opex: 0, writeoffs: 0, customers: new Set(), ar: 0, ap: 0, inv: 0 }));
  const idx = Object.fromEntries(months.map((m, i) => [m, i]));
  const bal = { bs_ar: 0, bs_ap: 0, bs_inventory: 0 }, deltas = months.map(() => ({ bs_ar: 0, bs_ap: 0, bs_inventory: 0 }));
  for (const r of rows) {
    const c = mapping[r.account], i = idx[monthKey(r.date)]; if (!c || i == null) continue;
    const g = CATEGORIES[c]?.group, v = rowValue(r, c, signMode), o = out[i];
    if (g === 'revenue') { o.revenue += v; if (r.name) o.customers.add(r.name); }
    else if (g === 'direct') o.direct += v; else if (g === 'opex') o.opex += v;
    if (c === 'bad_debt') o.writeoffs += v;
    if (c in bal) deltas[i][c] += v;
  }
  return out.map((o, i) => {
    for (const k in bal) bal[k] += deltas[i][k];
    const profit = o.revenue - o.direct - o.opex;
    return { m: o.m, revenue: r2(o.revenue), gross: r2(o.revenue - o.direct), profit: r2(profit), customers: o.customers.size, writeoffs: r2(o.writeoffs), ar: r2(bal.bs_ar), ap: r2(bal.bs_ap), inv: r2(bal.bs_inventory), wc: r2(bal.bs_ar + bal.bs_inventory - bal.bs_ap) };
  });
}

/** Customers who bought in the first half of the period but not the second (lost), and the reverse (new). */
export function customerFlow(rows, mapping, signMode, range) {
  const ms = [], start = monthKey(range.start), end = monthKey(range.end);
  for (let m = start; m <= end; m = addMonths(m, 1)) ms.push(m);
  if (ms.length < 4) return null;
  const mid = ms[Math.floor(ms.length / 2)], a = {}, b = {};
  for (const r of rows) { const c = mapping[r.account]; if (CATEGORIES[c]?.group !== 'revenue' || !r.name) continue; const t = monthKey(r.date) < mid ? a : b; t[r.name] = (t[r.name] || 0) + rowValue(r, c, signMode); }
  const lost = Object.entries(a).filter(([n]) => !(n in b)).sort((x, y) => y[1] - x[1]), fresh = Object.entries(b).filter(([n]) => !(n in a)).sort((x, y) => y[1] - x[1]);
  return { split: mid, lost: lost.slice(0, 5).map(([n, v]) => ({ name: n, revenue: r2(v) })), lostCount: lost.length, lostRevenue: r2(lost.reduce((t, x) => t + x[1], 0)), fresh: fresh.slice(0, 5).map(([n, v]) => ({ name: n, revenue: r2(v) })), freshCount: fresh.length, freshRevenue: r2(fresh.reduce((t, x) => t + x[1], 0)) };
}

/** Keep only periods that don't overlap a later one (e.g. drop FY2025 when TTM Jun-2026 is present). Sorted oldest first. */
export function nonOverlappingPeriods(per) {
  const startOf = (p) => { const d = new Date(p.end + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (+p.months || 12) + 1); return d.toISOString().slice(0, 10); };
  const kept = [];
  for (const p of [...per].sort((x, y) => y.end.localeCompare(x.end))) { const st = startOf(p); if (!kept.some(k => st <= k.end && p.end >= startOf(k))) kept.push(p); }
  return kept.sort((x, y) => x.end.localeCompare(y.end));
}
