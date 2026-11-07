// AION thesis v3.0: taxonomy, backward compatibility, the Deal Thesis Check, tool fit, value buckets and search criteria.
// Inputs here are small hand-built test fixtures, not company data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { levers, quality, periods, DEFAULT_ASSUMPTIONS, FEE_CATS, CATEGORIES } from '../lib/model.mjs';
import { THESIS, SUBSECTORS, ACTIVE_SUBSECTORS, subsectorOf, detectSubsector, thesisCheck, toolFit, valueBuckets, hundredDays, whyAion, searchCriteria, revenueMix, TOOLKIT, firmFields, FIRM_KEYS } from '../lib/thesis.mjs';
import { profile } from '../lib/industry.mjs';
import { mustHave, score } from '../lib/search/score.mjs';
import { libraryPlan } from '../lib/playbooks.mjs';

// a minimal derived object, like the server's, for a priced deal
function deal({ revenue = 5e6, normalized = 900e3, byCat = {}, dso = 50, quality: q = null, peer = null, wc = null, prior = null, unpriceable = false } = {}) {
  return { pnl: { TTM: { revenue, byCat: { rev_sales: 0, ...byCat }, direct: 0, opex: 0 } }, priorTTM: prior, periods: [], normalization: { normalized, reported: normalized },
    quality: q, dso, wc, peer, unpriceable, deal: unpriceable ? null : { multiple: 4, price: normalized * 4, rate: 0.1, downside: { minDscr: 1.6 } } };
}
const find = (rows, k) => rows.find(r => r.key === k);

test('thesis constants: sector, size and language', () => {
  assert.equal(THESIS.sector, 'Ecommerce Consulting');
  assert.deepEqual(THESIS.segments.map(s => s.key), ['retail_placement', 'marketplace', 'strategy']);
  assert.deepEqual(ACTIVE_SUBSECTORS, ['ecommerce']);
  assert.deepEqual([THESIS.ebitda.min, THESIS.ebitda.max, THESIS.ebitda.priorityMin, THESIS.ebitda.priorityMax], [500e3, 5e6, 500e3, 2e6]);
  assert.ok(!/general services/i.test(THESIS.long + THESIS.short));
  assert.deepEqual(Object.keys(SUBSECTORS), ['engineering', 'supply_chain', 'compliance', 'testing', 'implementation', 'talent', 'ecommerce']);
});

test('backward compatibility: old staffing / general deals map into the taxonomy', () => {
  assert.equal(subsectorOf({ name: 'executive search firm', kind: 'staffing' }), 'talent');
  assert.equal(subsectorOf({ name: 'staffing firm (temporary and permanent placement)', kind: 'staffing', byUser: true }), 'talent');
  assert.equal(subsectorOf({ name: 'anything', kind: 'general', talent_firm: true }), 'talent');
  assert.equal(subsectorOf({ name: 'commercial HVAC contractor', kind: 'general' }), null);
  assert.equal(subsectorOf({ name: 'civil engineering firm', kind: 'general' }), 'engineering');
  // the old search-firm wording is unchanged for a staffing deal
  const p = profile({ industry: { name: 'executive search firm', kind: 'staffing' } });
  assert.deepEqual([p.kind, p.subsector, p.workers, p.jobs], ['staffing', 'talent', 'recruiters', 'searches']);
  // a deal with no industry no longer defaults to a search firm
  assert.equal(profile({}).kind, 'general');
});

test('subsector detection from names and objectives', () => {
  assert.equal(detectSubsector('fire sprinkler inspection company'), 'compliance');
  assert.equal(detectSubsector('materials testing laboratory'), 'testing');
  assert.equal(detectSubsector('NetSuite implementation partner'), 'implementation');
  assert.equal(detectSubsector('supply chain and procurement consultancy'), 'supply_chain');
  assert.equal(detectSubsector('Find founder-owned executive search firms that place supply chain leaders'), 'talent');
  assert.equal(detectSubsector('dental practice'), null);
});

test('FEE_CATS: advisory and fractional revenue now carry the pricing lever', () => {
  for (const k of ['rev_advisory', 'rev_fractional', 'rev_recurring', 'rev_project', 'rev_retained', 'rev_contingent', 'rev_sales']) assert.ok(FEE_CATS.includes(k), k);
  assert.ok(!FEE_CATS.includes('rev_refunds'));
  for (const k of FEE_CATS) assert.equal(CATEGORIES[k].group, 'revenue');
  const ops = { producers: 10, admin_fte: 2, commission_rate: 0, hours: {} };
  const advisory = levers({ revenue: 3e6, byCat: { rev_advisory: 3e6 } }, ops, DEFAULT_ASSUMPTIONS, []);
  assert.ok(advisory.nonAI.pricing > 0, 'advisory-only firm gets a pricing lever');
  assert.equal(advisory.nonAI.pricingRevenue, 3e6 * DEFAULT_ASSUMPTIONS.pricing_uplift);
  const mixed = levers({ revenue: 4e6, byCat: { rev_retained: 1e6, rev_fractional: 1e6, rev_advisory: 1e6, rev_project: 1e6 } }, ops, DEFAULT_ASSUMPTIONS, []);
  assert.equal(mixed.nonAI.pricingRevenue, 4e6 * DEFAULT_ASSUMPTIONS.pricing_uplift);
});

test('quality: repeat revenue share from clients who also paid the year before', () => {
  const map = { Fees: 'rev_project' };
  const rows = [
    { id: 1, date: '2024-03-01', account: 'Fees', amount: 100, name: 'A' }, { id: 2, date: '2024-04-01', account: 'Fees', amount: 100, name: 'B' },
    { id: 3, date: '2025-03-01', account: 'Fees', amount: 300, name: 'A' }, { id: 4, date: '2025-04-01', account: 'Fees', amount: 100, name: 'C' }];
  const per = periods({ start: '2024-01-01', end: '2025-12-31' });
  const q = quality(rows, map, 'natural', per);
  assert.equal(q.repeatShare, 0.75);
  assert.equal(q.retention, 0.5);
});

test('thesis check: missing evidence is NEEDS DATA, never a guess', () => {
  const S = { file: { kind: 'gl' }, industry: { name: 'fire inspection company', kind: 'general', subsector: 'compliance' } };
  const d = deal({ dso: null, quality: null });
  const C = thesisCheck({ S, d, profile: profile(S) });
  for (const k of ['seller', 'mgmt', 'keyperson', 'ai', 'cash', 'repeat', 'top1', 'top5', 'wc', 'retention', 'growth']) assert.equal(find(C.universal, k).status, 'needs_data', k);
  // compliance-specific criteria are present and wait for data
  for (const k of ['recurring_cycles', 'renewal_rate', 'regulatory_driver', 'cert_transferable', 'license_dependence']) assert.equal(find(C.subsector, k).status, 'needs_data', k);
  assert.equal(find(C.universal, 'ebitda').status, 'pass');
  for (const r of [...C.universal, ...C.subsector]) assert.ok(r.evidence, `${r.key} has evidence or an ask`);
});

test('thesis check: a Net 30 engineering firm is not failed for billing in arrears', () => {
  const S = { file: { kind: 'gl' }, industry: { name: 'civil engineering firm', kind: 'general', subsector: 'engineering' } };
  const d = deal({ byCat: { rev_project: 4.5e6, rev_recurring: 0.5e6 }, dso: 52 });
  const C = thesisCheck({ S, d, profile: profile(S) });
  const cash = find(C.universal, 'cash');
  assert.equal(cash.status, 'pass');
  assert.match(cash.evidence, /Net 30 billing is fine/);
  assert.ok(!C.avoid.length);
});

test('thesis check: temp staffing still surfaces payroll-float risk', () => {
  const S = { file: { kind: 'gl' }, industry: { name: 'staffing agency', kind: 'staffing' } };
  const d = deal({ byCat: { rev_staffing: 3.5e6, rev_contingent: 1.5e6 }, dso: 48 });
  const C = thesisCheck({ S, d, profile: profile(S) });
  const pf = find(C.subsector, 'payroll_float'), tm = find(C.subsector, 'temp_mix');
  assert.equal(pf.status, 'fail'); assert.match(pf.evidence, /finances ~41 days of payroll/);
  assert.equal(tm.status, 'fail');
  assert.equal(find(C.universal, 'cash').status, 'watch');
  assert.ok(C.avoid.some(a => /temporary-staffing payroll/i.test(a.text)));
  assert.ok(C.avoid.some(a => /payroll float/i.test(a.text)));
});

test('thesis check: a retained search firm has no payroll float', () => {
  const S = { file: { kind: 'gl' }, industry: { name: 'executive search firm', kind: 'staffing' } };
  const d = deal({ byCat: { rev_retained: 2.4e6, rev_contingent: 0.6e6 }, dso: 40 });
  const C = thesisCheck({ S, d, profile: profile(S) });
  assert.equal(find(C.subsector, 'payroll_float').status, 'pass');
  assert.equal(find(C.subsector, 'retained_contingent_mix').status, 'pass');
  assert.equal(find(C.subsector, 'temp_mix').status, 'pass');
});

test('thesis check: mixed revenue is read model by model', () => {
  const mix = revenueMix({ rev_recurring: 2e6, rev_project: 1e6, rev_advisory: 1e6, rev_sales: 1e6 });
  assert.equal(Math.round(mix.models.recurring_program * 100), 40);
  assert.equal(Math.round(mix.models.retainer * 100), 20);
  assert.equal(Math.round(mix.unspecified * 100), 20);
  const S = { file: { kind: 'gl' }, industry: { name: 'supply chain consultancy', kind: 'general', subsector: 'supply_chain' } };
  const C = thesisCheck({ S, d: deal({ byCat: { rev_recurring: 2e6, rev_project: 1e6, rev_advisory: 1e6, rev_sales: 1e6 } }), profile: profile(S) });
  const pm = find(C.subsector, 'project_program_mix');
  assert.equal(pm.status, 'pass'); assert.match(pm.evidence, /Recurring program 40%/);
});

test('thesis check: recorded diligence answers become dated evidence', () => {
  const S = { file: { kind: 'gl' }, industry: { name: 'civil engineering firm', subsector: 'engineering' }, diligence: { seller_origination: { value: 0.6, note: 'Seller call', at: '2026-10-07T12:00:00Z' }, utilization: { value: 0.72, note: '', at: '2026-10-07T12:00:00Z' } } };
  const C = thesisCheck({ S, d: deal(), profile: profile(S) });
  const s = find(C.universal, 'seller');
  assert.equal(s.status, 'fail'); assert.match(s.evidence, /From diligence \(2026-10-07\): Seller call/);
  assert.equal(find(C.subsector, 'utilization').status, 'pass');
  assert.ok(C.avoid.some(a => /founder personally owns/i.test(a.text)));
});

test('thesis check: entry multiple above 5x is WATCH with context, never FAIL', () => {
  const S = { file: { kind: 'gl' }, industry: { name: 'civil engineering firm', subsector: 'engineering' } };
  const d = deal(); d.deal.multiple = 6;
  assert.equal(find(thesisCheck({ S, d, profile: profile(S) }).universal, 'multiple').status, 'watch');
});

test('tool fit: evidence-driven; NEEDS DATA without answers', () => {
  const S = { file: { kind: 'gl' }, industry: { name: 'civil engineering firm', subsector: 'engineering' } };
  const fit0 = toolFit({ S, d: deal(), profile: profile(S) });
  for (const f of fit0) assert.equal(f.level, 'needs', f.key);
  S.diligence = { rfp_share: { value: 0.35, at: '2026-10-07' }, proposal_process: { value: 'manual', at: '2026-10-07' }, lead_source: { value: 'founder', at: '2026-10-07' }, deliverables: { value: 20, at: '2026-10-07' }, deliverable_hours: { value: 4, at: '2026-10-07' }, hiring_bottleneck: { value: 'no', at: '2026-10-07' } };
  const fit = Object.fromEntries(toolFit({ S, d: deal(), profile: profile(S) }).map(f => [f.key, f]));
  assert.equal(fit.rfp.level, 'high'); assert.match(fit.rfp.reason, /35% of new revenue/);
  assert.match(fit.rfp.play, /flag unsupported claims/);
  assert.equal(fit.docs.level, 'high');
  assert.equal(fit.search_customers.level, 'high'); assert.match(fit.search_customers.objective, /industrial operators/);
  assert.equal(fit.candidates.level, 'low');
  // the talent firm keeps candidate sourcing as core delivery
  assert.equal(toolFit({ S: { file: {}, industry: { name: 'executive search firm', kind: 'staffing' } }, d: deal(), profile: profile({ industry: { kind: 'staffing' } }) }).find(f => f.key === 'candidates').level, 'high');
});

test('toolkit statuses are honest', () => {
  assert.equal(TOOLKIT.search.status, 'now'); assert.equal(TOOLKIT.value.status, 'now');
  assert.equal(TOOLKIT.rfp.status, 'partial'); assert.equal(TOOLKIT.docs.status, 'partial'); assert.equal(TOOLKIT.workflow.status, 'partial');
});

test('value buckets: AI and M&A are never counted; priced levers are', () => {
  const d = deal({ normalized: 800e3 }); d.industryLevers = [{ id: 'ind0', driver: 'cost' }];
  const rows = [{ id: 'pricing', title: 'Raise prices', priced: true, value: 40e3, build: 'none', weeks: 2, cost: 0, sure: 'Benchmark gap' },
    { id: 'ind0', title: 'Cut rework', priced: true, value: 20e3, build: 'reuse', weeks: 4, cost: 5e3, sure: 'Benchmark gap', area: 'Industry' },
    { id: 'ai', title: 'AI drafts', priced: false, value: 0, build: 'reuse', weeks: 4, area: 'AI', sure: 'Not counted' }];
  const B = valueBuckets({ d, rows });
  assert.equal(B.base.value, 800e3); assert.equal(B.commercial.value, 40e3); assert.equal(B.operational.value, 20e3);
  assert.equal(B.ai.value, null); assert.equal(B.mna.value, null); assert.equal(B.operational.investment, 5e3);
});

test('100-day plan: understand, then commercial/operating, then 1–3 AI pilots', () => {
  const S = { file: { kind: 'gl' }, industry: { name: 'civil engineering firm', subsector: 'engineering' }, diligence: { rfp_share: { value: 0.4 }, proposal_process: { value: 'manual' } } };
  const d = deal({ quality: { topCustomers: [{ name: 'Client A', share: 0.18 }], top5: 0.45, repeatShare: 0.7 } });
  const PR = profile(S), check = thesisCheck({ S, d, profile: PR }), fit = toolFit({ S, d, profile: PR });
  const H = hundredDays({ S, d, profile: PR, check, fit, rows: [{ id: 'pricing', title: 'Raise prices', priced: true, value: 40e3, sure: 'Benchmark gap' }] });
  assert.deepEqual(H.phases.map(p => p.window), ['Days 0–30', 'Days 31–60', 'Days 61–100']);
  assert.match(H.phases[0].items[0].text, /Client A \(18%\)/);
  assert.ok(H.phases[1].items.some(x => /Raise prices/.test(x.text)));
  assert.ok(!H.phases[0].items.concat(H.phases[1].items).some(x => /^Pilot/.test(x.text)), 'no AI pilots before day 61');
  const pilots = H.phases[2].items.filter(x => /^Pilot/.test(x.text));
  assert.ok(pilots.length >= 1 && pilots.length <= 3); assert.match(pilots[0].text, /Proposal copilot/);
  assert.match(H.philosophy, /augments the account teams first/);
  const W = whyAion({ S, d, profile: PR, check, fit });
  assert.match(W.verdict, /1 AION module/);
});

test('library plan: engineering firms get engineering workflows; talent keeps the search playbook', () => {
  const mk = industry => ({ S: { industry, assumptions: DEFAULT_ASSUMPTIONS, ops: { placements_per_year: 10, avg_fee: 30000 }, flags: [] }, d: { levers: { nonAI: { writeoffs: 0, vendors: 0 }, workflows: [{ key: 'research', hoursSaved: 100, label: 'x' }] }, normalization: { normalized: 1e6 }, proForma: 1.1e6, quality: null, cashRelease: null } });
  const e = mk({ name: 'civil engineering firm', subsector: 'engineering' }), t = mk({ name: 'executive search firm', kind: 'staffing' });
  assert.equal(libraryPlan(e).levers.find(l => l.key === 'ai_research').title, 'Estimate new work from past projects');
  assert.equal(libraryPlan(t).levers.find(l => l.key === 'ai_research').title, 'AI-assisted search research');
});

test('search criteria: cash conversion replaces paid_upfront; old keys keep scoring', () => {
  const eng = searchCriteria('target', { sub: 'engineering', objective: 'Find founder-owned civil engineering firms in Virginia' });
  assert.ok(eng.some(c => c.key === 'cash_conversion_quality') && !eng.some(c => c.key === 'paid_upfront'));
  assert.equal(mustHave('target', eng.find(c => c.key === 'cash_conversion_quality')), false);
  const temp = searchCriteria('target', { sub: 'talent', objective: 'Find warehouse staffing agencies placing temporary workers' });
  assert.ok(temp.some(c => c.key === 'cash_health' && /payroll/.test(c.label)));
  // searches saved before v3.0 still treat paid_upfront as a must-have
  assert.equal(mustHave('target', { key: 'paid_upfront' }), true);
  assert.equal(mustHave('client', { key: 'likely_to_buy_service' }), true);
  // a Net 30 firm with a partial cash-conversion read is not capped
  const crit = [{ key: 'niche_fit', label: 'Niche', weight: 3, must: true }, { key: 'cash_conversion_quality', label: 'Cash', weight: 2, must: false }];
  const r = score(crit, [{ key: 'niche_fit', status: 'strong' }, { key: 'cash_conversion_quality', status: 'mismatch' }], 1, 'target');
  assert.ok(r.pct > 40 && !r.failed.length);
});

test('documents: firm fields follow the subsector; talent keeps placements, fees and lead recruiter', () => {
  assert.deepEqual(firmFields('talent').map(f => f[0]), ['name', 'niche', 'about', 'placements', 'fees', 'team', 'differentiators']);
  assert.ok(firmFields('engineering').some(f => f[0] === 'credentials'));
  assert.ok(firmFields('compliance').some(f => f[0] === 'certifications'));
  assert.ok(firmFields('supply_chain').some(f => f[0] === 'outcomes'));
  for (const k of ['placements', 'fees', 'credentials', 'certifications', 'engagements']) assert.ok(FIRM_KEYS.includes(k));
});
