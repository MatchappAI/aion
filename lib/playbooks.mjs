import { profile, workflowPlay } from './industry.mjs';
// Reviewed playbook library: instant, company numbers filled in by code. Opus can deepen it on demand.
const K = v => '$' + Math.round(v / 1000) + 'K';
const P = v => +(v * 100).toFixed(1) + '%';
const RULES = 'Rules: work only with local files in this folder; never send email or messages, contact candidates or clients, or change any external system; everything you produce is a draft for a person to review.';

function aiPrompts(key, c) {
  const P2 = {
    research: [
      ['One-time setup', `Set up a research workspace for our search firm (~${c.searches} searches a year, avg fee ${K(c.fee)}). Create folders inputs/briefs, inputs/past_maps, outputs/maps. Write a script that takes a search brief and produces a draft market map: target companies by segment, likely titles, and the reason each company fits — every row citing the source document it came from. Add a README for researchers. ${RULES}`],
      ['Per search', `Read inputs/briefs/<SEARCH_ID>.md and our past maps in inputs/past_maps. Draft a market map of 40–80 target companies for this role in outputs/maps/<SEARCH_ID>.csv with columns company, segment, why it fits, source. Flag any client on our off-limits list in inputs/off_limits.csv. Do not invent companies or people. ${RULES}`]],
    sourcing: [
      ['One-time setup', `Build a candidate-rediscovery tool from our ATS export at inputs/ats_export.csv. De-duplicate records, standardize titles and locations, and index notes so past candidates can be matched to new briefs. Report data-quality issues in outputs/data_quality.md. ${RULES}`],
      ['Per search', `Match the brief in inputs/briefs/<SEARCH_ID>.md against the indexed past candidates. Produce outputs/rediscovery/<SEARCH_ID>.csv with the top 30 matches, a one-line reason each, and the note or record it is based on. Producers decide who is contacted. ${RULES}`]],
    outreach: [
      ['One-time setup', `Create approved outreach templates by search type and seniority from the examples in inputs/outreach_examples/. Save them in templates/ with placeholders for role, company, and a personal note. ${RULES}`],
      ['Per search', `For each candidate in outputs/rediscovery/<SEARCH_ID>.csv marked "approve", draft a first message and one follow-up using templates/ and the candidate's own record. Save drafts to outputs/outreach/<SEARCH_ID>.md for a producer to edit and send. ${RULES}`]],
    crm: [
      ['One-time setup', `Define the CRM fields every search must keep current (stage, last contact, next step, notes). Write a script that turns call notes in inputs/call_notes/ into structured updates matching those fields, as a CSV for review. ${RULES}`],
      ['Weekly', `Process this week's call notes in inputs/call_notes/. Produce outputs/crm_updates.csv (record, field, new value, source note) and outputs/stale_records.md listing searches with no activity in 10 days. A person imports the approved rows. ${RULES}`]],
    reporting: [
      ['One-time setup', `Create a client status-report template: progress by stage, candidates presented, next steps, risks. Save it as templates/status_report.md. ${RULES}`],
      ['Weekly', `Using outputs/crm_updates.csv and the pipeline export in inputs/pipeline.csv, draft a status report for each active search in outputs/reports/<SEARCH_ID>.md. Partners review and send. Never include another client's information. ${RULES}`]],
    backoffice: [
      ['One-time setup', `From engagement letters in inputs/engagements/, build a milestone billing schedule (retainer, shortlist, completion) in outputs/billing_schedule.csv, and an AR aging from inputs/ar_export.csv. ${RULES}`],
      ['Weekly', `Compare the billing schedule with invoices issued (inputs/invoices.csv). List milestones reached but not invoiced, and overdue balances with a suggested reminder, in outputs/billing_actions.md for the finance lead to approve. ${RULES}`]],
  };
  return (P2[key] || []).map(([when, prompt]) => ({ title: when, when, prompt }));
}

const AI_STEPS = {
  research: ['Use one standard search brief', 'AI drafts the list of target companies, with sources', 'Researchers check and rank it'],
  sourcing: ['Clean up the candidate database', 'AI matches past candidates to each new search', 'Recruiters choose who to contact'],
  outreach: ['Approve message templates', 'AI drafts personal messages and follow-ups', 'Recruiters edit and send every message'],
  crm: ['Agree what every search record must show', 'AI turns call notes into record updates', 'A person approves every update'],
  reporting: ['Agree a standard client report', 'AI drafts the weekly update from search records', 'Partners review and send'],
  backoffice: ['Build the milestone billing schedule', 'AI flags unbilled milestones and overdue balances', 'Finance lead approves every invoice and reminder'],
};
const AI_TITLES = { research: 'AI-assisted search research', sourcing: 'Rediscover past candidates', outreach: 'Faster outreach and follow-up', crm: 'Update records from call notes', reporting: 'Weekly client status reports', backoffice: 'Billing and collections follow-up' };

export function libraryPlan({ d, S }) {
  const L = d.levers, a = S.assumptions, o = S.ops, q = d.quality, PR = profile(S), gen = PR.kind === 'general';
  const c = { searches: Math.round(o.placements_per_year || 0), fee: o.avg_fee || 0, industry: PR.name };
  const T = (staff, other) => gen ? other : staff;
  const levers = [];
  levers.push({ key: 'pricing', type: 'operating', model_lever: 'pricing', workflow_key: 'none', timing: 'Days 30-100',
    title: T(`Raise fees on new engagements by ${P(a.pricing_uplift)}`, `Raise prices by ${P(a.pricing_uplift)} on new work`),
    steps: T(['Compare realized fees with standard terms across all engagements', 'Set a fee schedule and a discount-approval rule for new work', 'Apply to new and renewing engagements only'], ['Compare prices charged with the standard price list', 'Set a price list and a rule for approving discounts', 'Apply to new and renewing customers only']),
    human_gate: T('Partners set fees with each client; changes for top clients need owner sign-off.', 'The owner approves any price change for the top 10 customers.'), kpis: ['Average realized fee', 'Share of engagements discounted'], prompts: [] });
  if (L.nonAI.writeoffs > 0) levers.push({ key: 'writeoffs', type: 'operating', model_lever: 'writeoffs', workflow_key: 'none', timing: 'Days 0-30',
    title: 'Tighten billing and cut write-offs', steps: ['Review every write-off in the last year', T('Bill each milestone the day it is reached', 'Send every bill the day the work is done'), 'Weekly review of balances over 45 days'],
    human_gate: 'The finance lead approves every write-off.', kpis: ['Write-offs', 'Balances over 60 days'], prompts: [] });
  if (L.nonAI.vendors > 0) levers.push({ key: 'vendors', type: 'operating', model_lever: 'vendors', workflow_key: 'none', timing: 'Days 30-100',
    title: 'Cut overlapping tools and subscriptions', steps: ['List every tool, seat, and owner', 'Remove unused seats and overlapping data tools', 'Renegotiate the remaining contracts'],
    human_gate: 'The team confirms no tool they rely on is removed.', kpis: ['Tool spend per person'], prompts: [] });
  if (d.cashRelease != null) levers.push({ key: 'cash', type: 'operating', model_lever: 'cash_release', workflow_key: 'none', timing: 'Days 0-30',
    title: `Collect cash ${a.dso_reduction_days} days faster`, steps: [T('Invoice milestones the day they are reached', 'Invoice the day the work is done'), T('Standard payment terms in new engagement letters', 'Standard payment terms for every new customer'), 'Automated reminders reviewed by finance'],
    human_gate: 'The owner handles any overdue balance at a top customer.', kpis: ['Days to collect'], prompts: [] });
  levers.push({ key: 'retention', type: 'operating', model_lever: 'none', workflow_key: 'none', timing: 'Days 0-30',
    title: `Keep key ${PR.workers} and top ${PR.customers}`, steps: [`Retention bonus for the top ${PR.workers}`, `Seller and new leader meet the top ${PR.customers} together`, `Account plans for the top 5 ${PR.customers}${q?.top5 ? ` (${P(q.top5)} of revenue)` : ''}`],
    human_gate: 'Owner and holdco agree every retention package.', kpis: ['Staff retention', 'Top-customer repeat rate'], prompts: [] });
  for (const w of L.workflows) {
    if (!w.hoursSaved) continue;
    levers.push({ key: 'ai_' + w.key, type: 'ai', model_lever: 'ai', workflow_key: w.key, timing: w.key === 'crm' || w.key === 'backoffice' ? 'Days 0-30' : 'Days 30-100',
      // talent firms keep the original search-firm playbook; every other firm gets its subsector's named workflows
      ...(gen ? (pl => ({ title: pl.title || w.label, steps: pl.steps || [], prompts: pl.prompts.map(([when, prompt]) => ({ title: when, when, prompt })) }))(workflowPlay(PR, w.key, c)) : { title: AI_TITLES[w.key] || w.label, steps: AI_STEPS[w.key] || [], prompts: aiPrompts(w.key, c) }),
      human_gate: `A person approves every output before it reaches a ${gen ? (PR.customers === 'clients' ? 'client' : 'customer') : 'candidate, client,'} or system.`, kpis: [`Hours per ${PR.job}`, `${PR.jobs[0].toUpperCase() + PR.jobs.slice(1)} per person`] });
  }
  return {
    source: 'library',
    summary: `Base-case EBITDA ${K(d.normalization.normalized)}; with the improvements below it could reach ${K(d.proForma)}.`,
    levers,
    first_100_days: [
      // AION v3.0 order: understand first, then low-risk commercial and operating moves, then 1–3 AI pilots
      { window: 'Days 0-30', actions: [`Retention packages for key ${PR.workers}`, `Seller and new leader call top ${PR.customers}`, 'Workflows mapped and baseline measures taken'] },
      { window: 'Days 31-60', actions: ['Price list and approval rule set', 'Billing schedule and record fields agreed', 'Account plans for the top clients'] },
      { window: 'Days 61-100', actions: ['Pilot 1–3 AI workflows with a person approving every output', `Weekly ${PR.customers === 'clients' ? 'client' : 'customer'} updates`, 'First results versus baseline'] },
    ],
    not_recommended: [],
    questions_for_seller: (S.flags || []).slice(0, 6).map(f => `Please provide detail on: ${f.title.toLowerCase()}.`),
  };
}
