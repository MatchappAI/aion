// Thesis v3.0 integration test. Runs against a server started on a THROWAWAY copy of the workspace, e.g.:
//   AION_WORKSPACE=/tmp/ws PORT=8799 node server.mjs   then   AION_BASE=http://localhost:8799 node tests/integration/thesis-integration.mjs
// It switches deals, records and clears diligence answers and saves a firm profile, so never point it at the real app.
import assert from 'node:assert/strict';
import { appears } from '../../lib/docs/docs.mjs';
const BASE = process.env.AION_BASE; if (!BASE || /:8765\b/.test(BASE)) { console.error('Set AION_BASE to the throwaway server (not 8765).'); process.exit(1); }
const B = BASE.replace(/\/$/, '') + '/api/';
const call = async (p, b) => { const r = await fetch(B + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const ct = r.headers.get('content-type') || ''; return ct.includes('json') ? r.json() : { ok: r.ok, bytes: (await r.arrayBuffer()).byteLength, type: ct }; };
let pass = 0, fail = 0; const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); };
const row = (V, k) => [...(V.derived.aion?.check.universal || []), ...(V.derived.aion?.check.subsector || [])].find(r => r.key === k);

// 1. every historic deal still loads; staffing deals keep the search-firm wording
const { deals } = await call('deals');
for (const d of deals.filter(x => !x.id.startsWith('dtest'))) {
  const V = await call('deals/select', { id: d.id });
  ok(`Old deal loads: ${d.name}`, !V.error && !!V.state, V.error || `${V.profile.kind} → ${V.profile.subsector || 'no subsector'}`);
  if (V.state.industry?.kind === 'staffing') ok(`  …keeps talent wording`, V.profile.subsector === 'talent' && V.profile.workers === 'recruiters' && V.profile.jobs === 'searches');
  if (V.state.normConfirmed && V.derived.normalization) ok(`  …has a thesis check`, !!V.derived.aion?.check?.universal?.length, `${V.derived.aion?.check?.counts?.pass} pass / ${V.derived.aion?.check?.counts?.needs_data} need data`);
  if (V.state.plan && V.state.file?.kind === 'gl' && V.derived.deal) { const x = await call('excel', {}); ok(`  …Excel export`, x.ok && x.bytes > 20000, `${x.bytes} bytes`); }
}

// 2. fixture deals (test-only): each subsector behaves as the thesis says
let V = await call('deals/select', { id: 'dtestengineering' });
ok('Engineering fixture loads as Engineering & Technical Services', V.profile.subsector === 'engineering' && V.profile.workers === 'engineers and technical staff');
ok('Net 30 engineering firm passes cash conversion (not failed for billing in arrears)', row(V, 'cash')?.status === 'pass', row(V, 'cash')?.evidence);
ok('Engineering subsector criteria present', ['utilization', 'backlog', 'license_dependence', 'principal_dependence'].every(k => row(V, k)));
ok('Missing subsector data shows NEEDS DATA', row(V, 'utilization').status === 'needs_data' && row(V, 'backlog').status === 'needs_data');
ok('Repeat revenue measured from the ledger', row(V, 'repeat')?.status === 'pass', row(V, 'repeat')?.value);
ok('Engineering workflows in the plan', (V.state.plan?.levers || []).some(l => l.title === 'Estimate new work from past projects'));
ok('Workflow labels follow the subsector', V.derived.levers.workflows.find(w => w.key === 'research')?.label === 'Scoping and estimating from past projects');
ok('Tool fit starts as NEEDS DATA, not guesses', V.derived.aion.fit.every(f => f.level === 'needs'), V.derived.aion.fit.map(f => f.level).join(','));
V = await call('diligence', { key: 'rfp_share', value: 40, note: 'integration test' });
ok('Diligence answer recorded and dated', V.state.diligence?.rfp_share?.value === 0.4 && !!V.state.diligence.rfp_share.at);
ok('Answer moves RFP fit to evidence-based', V.derived.aion.fit.find(f => f.key === 'rfp').level === 'high', V.derived.aion.fit.find(f => f.key === 'rfp').reason);
V = await call('diligence', { key: 'rfp_share', value: '' }); ok('Diligence answer cleared', !V.state.diligence?.rfp_share);
for (const e of ['excel', 'pdf']) { const x = await call(e, {}); ok(`Engineering fixture ${e} export`, x.ok && x.bytes > 20000, `${x.bytes} bytes`); }

V = await call('deals/select', { id: 'dtestcompliance' });
ok('Compliance fixture loads as Compliance, Regulatory, EHS & Inspection', V.profile.subsector === 'compliance');
ok('Compliance criteria present', ['recurring_cycles', 'renewal_rate', 'regulatory_driver', 'cert_transferable'].every(k => row(V, k)));
ok('Recurring inspection cycles read from the books', row(V, 'recurring_cycles')?.status === 'pass', row(V, 'recurring_cycles')?.evidence);
ok('Compliance playbook names inspection report drafting', (V.state.plan?.levers || []).some(l => /Inspection report drafting/.test(l.title)));

V = await call('deals/select', { id: 'dtestmixed' });
ok('Mixed-revenue fixture loads', V.profile.subsector === 'supply_chain' && !!V.derived.aion);
ok('Mixed revenue read model by model', /Recurring program/.test(row(V, 'project_program_mix')?.evidence || '') && /Retainer/.test(row(V, 'project_program_mix')?.evidence || ''), row(V, 'project_program_mix')?.evidence);
ok('Advisory revenue no longer produces a $0 pricing lever', V.derived.levers.nonAI.pricingRaw > 0, `raw pricing lever ${Math.round(V.derived.levers.nonAI.pricingRaw)}`);

V = await call('deals/select', { id: 'dtesttemp' });
ok('Temp staffing fixture maps to Talent Services', V.profile.subsector === 'talent' && V.profile.kind === 'staffing');
ok('Temp staffing surfaces payroll-float risk', row(V, 'payroll_float')?.status === 'fail', row(V, 'payroll_float')?.evidence);
ok('Temp payroll dominating is an avoid-list hit', V.derived.aion.check.avoid.some(a => /temporary-staffing/i.test(a.text)));

// subsector change is the user's choice and persists; kind follows it
V = await call('subsector', { subsector: 'implementation' }); ok('Subsector can be changed', V.profile.subsector === 'implementation' && V.state.industry.subsectorSet);
V = await call('subsector', { subsector: 'talent' }); ok('…and changed back', V.profile.subsector === 'talent' && V.profile.kind === 'staffing');

// 3. saved searches, network and the browser module
const { searches } = await call('search/list');
let opened = 0; for (const h of searches) { const s = await call('search/get/' + h.id); if (!s.error && s.strategy) opened++; }
ok('Every saved search opens', opened === searches.length, `${opened} of ${searches.length}`);
const net = await call('search/network'); ok('Network memory intact', net.stats.people >= 1 && net.stats.targets >= 1, JSON.stringify(net.stats));
const one = await call('search/get/' + searches.find(x => x.mode === 'target').id); ok('Old target search keeps its saved criteria', one.strategy.criteria.some(c => ['paid_upfront', 'cash_health', 'cash_conversion_quality'].includes(c.key)), one.strategy.criteria.map(c => c.key).join(', '));
const tm = await fetch(BASE.replace(/\/$/, '') + '/thesis.mjs'); ok('Thesis module served to the browser', tm.ok && /Specialized B2B Professional/.test(await tm.text()));

// 4. Documents: word-for-word check, saved documents, firm profile by subsector
ok('Word-for-word check still rejects paraphrase', appears('Proposals are due by 5 p.m. on April 22', 'All proposals are due by 5 p.m. on April 22, 2026.') && !appears('Proposals must arrive by 5 p.m. April 22', 'All proposals are due by 5 p.m. on April 22, 2026.'));
const docs = await call('docs/list'); ok('Saved documents still listed', docs.docs.length >= 1, docs.docs.map(d => d.kind).join(', '));
for (const d of docs.docs) { const x = await call('docs/get/' + d.id); ok(`  …opens: ${d.title.slice(0, 50)}`, !x.error && (x.kind !== 'proposal' || x.requirements?.length > 0)); }
const f = await call('docs/firm', { firm: { subsector: 'engineering', name: 'Test Firm', credentials: '' } }); ok('Firm profile saves its subsector', f.firm.subsector === 'engineering' && 'credentials' in f.firm);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
