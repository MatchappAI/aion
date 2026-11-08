// Ecommerce consulting maths: pass-through ad spend left out of margins and client shares, working capital only from
// real balances, no AI set-up cost while AI is not counted, the optional files' period checks, and the ecommerce levers.
// Small hand-built test ledgers only (no company data).
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { pnl, quality, periods, monthlySeries, dealReturns, DEFAULT_ASSUMPTIONS } from '../lib/model.mjs';
import { ecomLevers } from '../lib/levers-ecom.mjs';
import { extraLevers, analyzeSales } from '../lib/extras.mjs';

const months = Array.from({ length: 24 }, (_, i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
const mapping = { Retainers: 'rev_recurring', Projects: 'rev_project', 'Ad spend billed': 'rev_passthrough', 'Ad spend paid': 'cos_passthrough', 'Account team': 'comp_producers', Rent: 'rent', 'Accounts Receivable': 'bs_ar' };
function ledger({ arBalance = false } = {}) {
  const rows = []; let id = 0;
  const add = (date, account, name, amount, balance = null) => rows.push({ id: ++id, date, account, name, memo: '', amount, balance });
  months.forEach((m, i) => {
    add(`${m}-03`, 'Retainers', 'Brand A', 20000); add(`${m}-04`, 'Retainers', 'Brand B', 10000);
    if (i % 2 === 0) add(`${m}-10`, 'Projects', 'Brand C', 6000); // a repeat project client with no retainer
    add(`${m}-12`, 'Ad spend billed', 'Brand A', 100000); // big pass-through for Brand A
    add(`${m}-13`, 'Ad spend paid', 'Ad platform', 104000); // pays out more than it bills back
    add(`${m}-15`, 'Account team', 'Payroll', 15000); add(`${m}-20`, 'Rent', 'Landlord', 2000);
    if (arBalance) add(`${m}-28`, 'Accounts Receivable', '', 1000, 50000 + i * 100);
  });
  return rows;
}
const range = { start: '2024-01-01', end: '2025-12-31' }, per = periods(range);

test('pass-through ad spend is left out of fee revenue, margins and client shares', () => {
  const rows = ledger(), t = pnl(rows, mapping, 'natural', per.ttm);
  assert.equal(t.revenue, 12 * (30000 + 100000) + 6 * 6000);
  assert.equal(t.netRevenue, 12 * 30000 + 6 * 6000);
  assert.equal(t.netDirect, 12 * 15000);
  const q = quality(rows, mapping, 'natural', per);
  // Brand A's ad spend would make it 80%+ of revenue; on fees it is about 61%
  assert.ok(q.top1 < 0.65 && q.top1 > 0.55, `top1 ${q.top1}`);
});

test('working capital needs real balances: unknown without a balance column or opening balance', () => {
  const none = monthlySeries(ledger(), mapping, 'natural', range);
  assert.equal(none.at(-1).wc, null, 'changes since the file began are not a balance');
  const opened = monthlySeries(ledger(), mapping, 'natural', range, { 'Accounts Receivable': 80000 });
  assert.equal(opened.at(-1).wc, 80000, 'the opening balance is a known starting point');
  const withAr = ledger().concat([{ id: 999, date: '2024-01-28', account: 'Accounts Receivable', name: '', memo: '', amount: 1000, balance: null }]);
  const seeded = monthlySeries(withAr, mapping, 'natural', range, { 'Accounts Receivable': 80000 });
  assert.equal(seeded.at(-1).wc, 81000);
  const bal = monthlySeries(ledger({ arBalance: true }), mapping, 'natural', range);
  assert.equal(bal.at(-1).wc, 50000 + 23 * 100, 'the running balance column is used as is');
});

test('no AI set-up cost in the returns while AI savings are not counted', () => {
  const a = { ...DEFAULT_ASSUMPTIONS, entry_multiple: 4 };
  const withCost = dealReturns(1e6, 0, a, 5e6), without = dealReturns(1e6, 0, { ...a, implementation: 0 }, 5e6);
  assert.ok(without.none.cash[0] > withCost.none.cash[0]);
  assert.equal(Math.round(without.none.cash[0] - withCost.none.cash[0]), a.implementation);
});

test('ecommerce levers: pass-through shortfall counted from the books; the rest listed at $0 with what was measured', () => {
  const rows = ledger(), t = pnl(rows, mapping, 'natural', per.ttm), q = quality(rows, mapping, 'natural', per);
  const L = ecomLevers({ ttm: t, rows, mapping, signMode: 'natural', per, quality: q, S: {} });
  const by = Object.fromEntries(L.map(x => [x.id, x]));
  assert.equal(by.ecom_passthrough.counted, true); assert.equal(by.ecom_passthrough.value, 12 * 4000);
  assert.equal(by.ecom_retainer.counted, false); assert.equal(by.ecom_retainer.value, 0); assert.match(by.ecom_retainer.basis, /Brand C/);
  assert.equal(by.ecom_utilisation.value, 0); assert.match(by.ecom_utilisation.basis, /timesheets/);
  assert.equal(by.ecom_concentration.value, 0); assert.ok(by.ecom_concentration.risk > 0);
  // nothing is counted that the books don't measure
  assert.deepEqual(L.filter(x => x.counted).map(x => x.id), ['ecom_passthrough']);
});

test('no ledger rows (PDF statements): levers say what they need instead of guessing', () => {
  const t = { revenue: 1e6, netRevenue: 1e6, direct: 4e5, netDirect: 4e5, byCat: { rev_recurring: 6e5, rev_project: 4e5 } };
  const L = ecomLevers({ ttm: t, rows: [], mapping: {}, per: null, quality: null, S: {} });
  assert.ok(L.every(x => !x.counted && x.value === 0));
  assert.match(L.find(x => x.id === 'ecom_retainer').basis, /client names/);
});

test('optional files: a part-year payroll file and fixed retainers are not counted as yearly savings', () => {
  const payroll = { analysis: { total: 300000, overtime: { total: 30000, people: 3, top: [] } } };
  assert.equal(extraLevers({ payroll }, DEFAULT_ASSUMPTIONS, { payrollBooks: 1e6 }).length, 0, 'a third of the year’s pay is a part-year export');
  assert.equal(extraLevers({ payroll }, DEFAULT_ASSUMPTIONS, { payrollBooks: 320000 }).length, 1);
  const csv = ['Date,Customer,Product/Service,Qty,Rate,Amount'];
  for (let i = 0; i < 6; i++) csv.push(`2025-0${(i % 6) + 1}-10,Brand ${i},Monthly retainer,1,${i === 0 ? 5000 : 10000},${i === 0 ? 5000 : 10000}`);
  const s = analyzeSales(Buffer.from(csv.join('\n')));
  assert.equal(s.underCount, 0, 'retainers of different scope are not discounts');
  assert.equal(s.months, 6);
});
