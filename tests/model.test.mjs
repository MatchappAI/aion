import test from 'node:test';
import assert from 'node:assert/strict';
import { rowValue, pnl, normalize, levers, cashRelease, dso, periods, dealReturns, DEFAULT_ASSUMPTIONS } from '../lib/model.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

test('rowValue respects sign mode and category side', () => {
  assert.equal(rowValue({ amount: 100 }, 'rev_retained', 'natural'), 100);
  assert.equal(rowValue({ amount: -100 }, 'rev_retained', 'debit'), 100);
  assert.equal(rowValue({ amount: 40 }, 'software', 'debit'), 40);
});

test('pnl: EBITDA excludes interest, D&A and taxes', () => {
  const mapping = { Fees: 'rev_retained', Rec: 'comp_producers', Rent: 'rent', Int: 'interest', Dep: 'da' };
  const rows = [
    { date: '2025-03-01', account: 'Fees', amount: 1000 }, { date: '2025-03-01', account: 'Rec', amount: 400 },
    { date: '2025-03-01', account: 'Rent', amount: 100 }, { date: '2025-03-01', account: 'Int', amount: 50 }, { date: '2025-03-01', account: 'Dep', amount: 20 }];
  const p = pnl(rows, mapping, 'natural', { from: '2025-01', to: '2025-12' });
  assert.equal(p.revenue, 1000); assert.equal(p.contribution, 600); assert.equal(p.ebitda, 500); assert.equal(p.net, 430);
});

test('normalize: owner comp added back, replacement leader deducted, only accepted add-backs', () => {
  const n = normalize({ ebitda: 900000, byCat: { comp_owner: 300000 } }, [{ amount: 20000, accepted: true }, { amount: 50000, accepted: false }], { marketComp: 225000, count: 1, extraOwnerComp: 0 });
  assert.equal(n.normalized, 900000 + 20000 + 300000 - 225000);
  assert.equal(n.unaccepted, 50000);
});

test('periods: TTM ends at last full month', () => {
  const p = periods({ start: '2023-01-03', end: '2025-06-15' });
  assert.equal(p.ttm.to, '2025-05'); assert.equal(p.ttm.from, '2024-06');
  const q = periods({ start: '2023-01-03', end: '2025-06-30' });
  assert.equal(q.ttm.to, '2025-06');
  assert.equal(periods({ start: '2025-01-02', end: '2025-12-26' }).ttm.to, '2025-12', 'last week counts as a full month');
  assert.equal(periods({ start: '2025-01-02', end: '2025-12-10', reportEnd: '2025-12-31' }).ttm.to, '2025-12', 'report end date wins');
  assert.equal(periods({ start: '2025-03-01', end: '2025-12-31' }).monthsCovered, 10);
  assert.equal(periods({ start: '2025-01-05', end: '2025-01-20' }).ttm.to, '2025-01', 'partial single month is used, not dropped');
});

const base = { revenue: 3000000, byCat: { rev_retained: 2000000, rev_contingent: 1000000, bad_debt: 40000, cos_contractors: 150000 } };
const ops = { producers: 10, admin_fte: 2, avg_fee: 30000, commission_rate: 0.3, hours_per_search: 120, loaded_cost_producer: 150000,
  hours: { research: 6, sourcing: 6, outreach: 5, crm: 4, reporting: 2, backoffice: 10 } };

test('levers: freed hours are not cash unless real spend is removed', () => {
  const a = { ...structuredClone(DEFAULT_ASSUMPTIONS), growth_share: 0, avoided_share: 1, realizable_spend: 0 };
  const L = levers(base, ops, a, []);
  assert.ok(L.six.timeSaved > 0);
  assert.equal(L.six.cashSavings, 0);
  assert.ok(L.six.avoidedTheoretical > 0);
});

test('levers: allocation never exceeds 100% (no double counting)', () => {
  const a = { ...structuredClone(DEFAULT_ASSUMPTIONS), growth_share: 0.8, avoided_share: 0.6, realizable_spend: 1e9 };
  const L = levers(base, ops, a, []);
  const al = L.six.allocation;
  near(al.growthHours + al.avoidedHours + al.unallocatedHours, L.six.timeSaved, 'hours conserve');
  assert.equal(al.unallocatedHours, 0);
  assert.ok(al.overAllocated);
});

test('levers: arithmetic of each line', () => {
  const a = { ...structuredClone(DEFAULT_ASSUMPTIONS), growth_share: 0.5, avoided_share: 0, pricing_uplift: 0.02, writeoff_reduction: 0.25, demand_searches: 5, completion_rate: 0.7, software_per_user_month: 150, ongoing_ops: 24000, implementation: 40000, year1_ramp: 0.5 };
  const L = levers(base, ops, a, [{ amount: 5000, accepted: true }, { amount: 9999, accepted: false }]);
  // time saved: producers 10 × (6×.35 + 6×.30 + 5×.40 + 4×.50 + 2×.40) × 48 + admin 2 × 10 × .30 × 48
  const t = 10 * (6 * .35 + 6 * .30 + 5 * .40 + 4 * .50 + 2 * .40) * 48 + 2 * 10 * .30 * 48;
  near(L.six.timeSaved, t, 'time saved');
  near(L.nonAI.pricing, 3000000 * 0.02 * 0.7, 'pricing after commission');
  near(L.nonAI.writeoffs, 10000, 'write-offs');
  near(L.nonAI.vendors, 5000, 'only accepted vendors');
  const cap = t * 0.5 / 120, searches = Math.min(cap, 5);
  assert.ok(cap > 5 && L.six.demandLimited, 'capacity exceeds demand here');
  const growthRev = searches * 0.7 * 30000;
  near(L.six.aiRevenue, growthRev, 'AI revenue capped by demand');
  const software = 12 * 150 * 12;
  near(L.six.costs.software, software, 'software');
  const run = L.nonAI.total + growthRev * (1 - 0.3 - 150000 / 3000000) - software - 24000;
  near(L.runRate, run, 'net run-rate');
  near(L.year1, run * 0.5 - 40000 - software * 0.5, 'year 1');
  near(L.roi, run / (40000 + software), 'roi');
});

test('cash release and DSO', () => {
  assert.equal(dso({ avgBalance: 500000 }, 3650000), 50);
  assert.equal(dso(null, 100), null);
  assert.equal(cashRelease(50, 7, 3650000), 70000);
  assert.equal(cashRelease(null, 7, 1), null);
});

test('levers: no demand means freed capacity earns nothing', () => {
  const a = { ...structuredClone(DEFAULT_ASSUMPTIONS), demand_searches: 0, growth_share: 1 };
  const L = levers(base, ops, a, []);
  assert.equal(L.six.aiRevenue, 0); assert.ok(L.six.capacitySearches > 0);
});

test('deal returns: sources equal uses, improvements raise returns, downside lowest', () => {
  const r = dealReturns(754705, 136746, { ...DEFAULT_ASSUMPTIONS, implementation: 40000, senior_multiple: 2.25 }, 3456000);
  near(r.senior + r.seller + r.equity, r.price + r.fees, 'sources = uses');
  assert.ok(r.base.moic > r.none.moic && r.none.moic > r.downside.moic);
  assert.ok(Math.abs(r.base.moic - 4.34) < 0.05 && Math.abs(r.none.moic - 3.31) < 0.05, `matches thesis: ${r.base.moic} / ${r.none.moic}`);
});
