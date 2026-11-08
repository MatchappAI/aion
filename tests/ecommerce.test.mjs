// Value Creation speaks ecommerce consulting: the right firm type from its name, Step 4 words, pass-through ad spend.
import test from 'node:test'; import assert from 'node:assert/strict';
import { kindOf, profile } from '../lib/industry.mjs';
import { thesisCheck } from '../lib/thesis.mjs';
import { CATEGORIES, FEE_CATS } from '../lib/model.mjs';

test('"retail placement" and marketplace agencies are ecommerce consulting, never a recruiting firm', () => {
  for (const n of ['retail placement agency', 'food broker and retail placement firm', 'Amazon marketplace agency', 'ecommerce consulting firm']) assert.equal(kindOf(n), 'general', n);
  assert.equal(kindOf('executive search firm'), 'staffing');
});

test('Step 4 asks about client accounts a year, not completed searches', () => {
  const P = profile({ industry: { name: 'retail placement agency', kind: 'general', subsector: 'ecommerce' } });
  assert.match(P.opsLabels.placements_per_year, /client accounts/); assert.match(P.opsLabels.avg_fee, /yearly fees per client account/);
  assert.equal(P.workers, 'consultants');
});

test('pass-through ad spend is its own line, kept out of the fee base, and checked as a share of revenue', () => {
  assert.equal(CATEGORIES.rev_passthrough.group, 'revenue'); assert.equal(CATEGORIES.cos_passthrough.group, 'direct');
  assert.ok(!FEE_CATS.includes('rev_passthrough'));
  const S = { industry: { name: 'marketplace agency', kind: 'general', subsector: 'ecommerce' }, answers: {} };
  const d = { pnl: { TTM: { revenue: 4e6, byCat: { rev_recurring: 1.6e6, rev_passthrough: 2.4e6 }, direct: 0, opex: 0 } }, periods: [], normalization: { normalized: 600e3, reported: 600e3 }, dso: 40, deal: null };
  const rows = Object.values(thesisCheck({ S, d, profile: profile(S) })).flat().filter(x => x && x.key);
  const r = rows.find(x => x.key === 'passthrough_share');
  assert.ok(r, 'pass-through row present'); assert.equal(r.status, 'fail'); assert.match(r.value, /60%/);
});

test('diligence asks the ecommerce questions: platform accounts, partner status, consents, tails, GMV fees, tenure, contractors, non-competes, prepaid retainers', async () => {
  const { diligenceFor, DILIGENCE } = await import('../lib/thesis.mjs');
  const q = diligenceFor('ecommerce');
  for (const k of ['account_ownership', 'partner_status', 'change_of_control', 'commission_tails', 'gmv_fees', 'client_tenure', 'contractor_share', 'non_competes', 'deferred_revenue', 'utilization']) { assert.ok(q.includes(k), k); assert.ok(DILIGENCE[k].q, k); }
  const S = { industry: { name: 'marketplace agency', kind: 'general', subsector: 'ecommerce' }, diligence: { non_competes: { value: 'no' }, client_tenure: { value: 30 } } };
  const d = { pnl: { TTM: { revenue: 4e6, byCat: { rev_recurring: 4e6 }, direct: 0, opex: 0 } }, periods: [], normalization: { normalized: 600e3, reported: 600e3 }, dso: 40, deal: null };
  const rows = Object.values(thesisCheck({ S, d, profile: profile(S) })).flat().filter(x => x && x.key);
  assert.equal(rows.find(x => x.key === 'non_competes').status, 'fail');
  assert.equal(rows.find(x => x.key === 'client_tenure').status, 'pass');
  assert.equal(rows.find(x => x.key === 'account_ownership').status, 'needs_data');
});

test('the LOI always lists the structure terms (earnout, escrow, seller-note standby, deal form, quality-of-earnings review)', async () => {
  const { LOI_PROMPT } = await import('../lib/outreach/outreach.mjs');
  const p = LOI_PROMPT({ name: 'Placeholder Co' }, { ebitda: 1, price: 1, multiple: 1, senior: 0, seller: 0, equity: 0, revenue: 0 }, {});
  for (const t of [/escrow/, /standby/, /F-reorganization/, /quality-of-earnings/, /non-compete/]) assert.match(p, t);
});

test('the price guide shows a market reference line for the firm’s size, labelled as unverified, and never sets the price', async () => {
  const { marketRange } = await import('../lib/thesis.mjs');
  assert.deepEqual([marketRange(700e3).low, marketRange(700e3).high], [3, 4.5]);
  assert.deepEqual([marketRange(3e6).low, marketRange(3e6).high], [5, 8]);
  assert.match(marketRange(1.5e6).note, /not checked against recent deals; not a valuation/);
  assert.equal(marketRange(-1), null);
});
