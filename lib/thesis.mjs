// AION thesis v4.0: the one source of truth for what AION buys, how it screens, and what it brings.
// Value Creation, Proprietary Search, Outreach, Documents and the browser all read from here (the server also serves this
// file to the browser at /thesis.mjs), so wording and criteria cannot drift apart. No Node imports: browser-safe.
//
// Buy box (2026-11-06): ecommerce consulting, broadly, including retail placement. Three segments in priority order:
// retail placement, marketplace agencies, ecommerce strategy & analytics. Excluded: DTC growth agencies, 3PL/ops advisory.
// Taxonomy: Sector (fixed) → Subsector → Revenue model(s). The v3 subsectors stay below as `legacy` so older saved deals,
// searches and documents keep their meaning; they are never offered as a default and never count as in the buy box.
// Persisted fields never change meaning: S.industry.kind stays 'staffing' | 'general' and maps to subsectors here.

export const THESIS = {
  version: '4.0',
  sector: 'Ecommerce Consulting',
  short: 'Long-term owners of ecommerce consulting firms: retail placement, marketplace agencies, and ecommerce strategy and analytics.',
  // Rough size from headcount, for sorting leads only (never used in Value Creation numbers, which come from the books).
  // Small US consulting and agency firms typically bill about $150K–$250K per person a year and keep 15–25% as EBITDA.
  sizeRule: { revenuePerPerson: [150000, 250000], margin: [0.15, 0.25], note: 'Rough estimate from headcount: about $150K–$250K revenue per person and 15–25% EBITDA margin, typical for small consulting and agency firms. Confirm with their books.' },
  // what is true today, for anything an owner reads: AION has not bought a firm yet
  status: 'AION is building a long-term group of ecommerce consulting firms and has not bought a firm yet.',
  pitchShort: 'AION is building a permanent, long-term group of ecommerce consulting firms (retail placement, marketplace agencies, and ecommerce strategy and analytics), buying to keep, never to resell.',
  oneLine: 'Founder-owned US ecommerce consulting firm (retail placement, marketplace agency, or ecommerce strategy and analytics), $500K–$5M yearly profit, mostly repeat or retainer clients',
  long: 'AION acquires and grows ecommerce consulting firms that help consumer brands sell more through retailers and online marketplaces. We focus on three segments, in this order: retail placement (brokers, sales agencies and consultants who get brands onto shelves at national and regional retailers), marketplace agencies (firms that run brands on Amazon, Walmart.com, Target Plus, TikTok Shop and other marketplaces), and ecommerce strategy and analytics consultancies (omnichannel strategy, digital shelf, retail media and sales analytics). We buy established, founder-owned firms with repeat brand clients, retailer and marketplace relationships, experienced account teams and low capital needs. The experts keep running the accounts; AION strengthens the commercial engine, the reporting and AI tools, and adds adjacent firms over time.',
  wedge: 'Consumer-product and CPG brands (food, beverage, beauty, home, pet, wellness) selling through retailers and marketplaces',
  wedgeNote: 'The clients AION’s firms serve. A firm serving other brands can still qualify if it fits a segment and the economics.',
  ebitda: { min: 500e3, max: 5e6, priorityMin: 500e3, priorityMax: 2e6 },
  sizeLabel: 'Right size to buy: about $500K–$5M yearly profit (first deals $500K–$2M), often about 5–150 people',
  geography: 'United States',
  segments: [
    { key: 'retail_placement', label: 'Retail placement', short: 'gets brands onto retail shelves (brokers, sales agencies, retail-entry consultants)' },
    { key: 'marketplace', label: 'Marketplace agency', short: 'runs brands on Amazon, Walmart.com, Target Plus, TikTok Shop and other marketplaces' },
    { key: 'strategy', label: 'Strategy & analytics', short: 'ecommerce strategy, omnichannel, digital shelf, retail media and sales analytics consulting' },
  ],
  excluded: [
    { key: 'dtc', label: 'DTC growth agency', short: 'paid social, SEO, email or store-build agencies for a brand’s own website' },
    { key: 'ops', label: '3PL / operations advisory', short: 'fulfilment, warehousing, logistics or supply-chain operations advisory' },
  ],
  // the edge, stated as capabilities and hypotheses to validate per acquisition, never as guaranteed synergies
  edge: [
    'Buy founder-owned, expert-led ecommerce consulting firms',
    'Keep the account leads doing the client work',
    'Install a repeatable commercial and operating system',
    'Deploy AION’s reusable AI, sourcing, document and reporting tools',
    'Raise account capacity per person: more brands served by the same team',
    'Acquire adjacent firms across the three segments over time',
  ],
  philosophy: 'AI augments the account teams first: more brands per person, faster line-review decks and listings, better reporting and margins. No headcount reductions are planned unless the evidence clearly supports them.',
  // order matters: thesisCheck() maps rows to these by position (0 seller, 1 repeat, 2 concentration, 3 employees, 4 float, 5 temp, 6 margin, 7 AI, 8 licenses)
  avoid: [
    'The founder personally owns most retailer and brand relationships',
    'Revenue is mostly one-off projects, not repeat or retainer work',
    'One brand, one retailer or one marketplace makes up most of revenue',
    'Key account leads could leave with the brands',
    'Most revenue is pass-through ad spend or inventory the firm has to fund',
    'It is really a DTC growth agency or a 3PL / operations advisory firm',
    'Structurally weak margins',
    'AI or the marketplaces themselves are likely to commoditize the core service',
    'Licenses or exclusive retailer contracts make a transition impractical',
    'The deal is effectively buying the seller’s personal job',
  ],
};

/** Which buy-box segment a firm is in, from its industry and summary text: a segment key, an excluded key
 *  ('dtc' | 'ops' | 'staffing'), or null when it is not ecommerce consulting at all. Retail and marketplace work beats
 *  "also does paid social": a marketplace agency that also runs ads is still a marketplace agency. */
const SEG_RETAIL = /retail placement|retail broker|broker group|brand (broker|accelerat|represent)|food (and|&) beverage broker|food broker|(sales|retail) (agency|brokerage|representation)|brokerage|manufacturers'? rep|retail (sales|readiness|entry|distribution|buyer|channel consult|growth consult|consulting and sales)|(into|onto|on) (retail|store) shelves|(gets?|getting) (consumer )?(product )?(brands|products|suppliers) (into|on)|into major retailers|(entering|expanding) in (us |u\.s\. )?retail|line review|national retailers|regional retailers|grocery (sales|broker)|natural (channel|products) broker|category (management|captain)|club (store|channel)|sam'?s club|supplier (consult|education)|vendor[- ]of[- ]record|retail link|buyer access|retail (and marketplace )?expansion|go-to-market consult|retail distribution|costco roadshow/i;
const SEG_MARKET = /amazon|walmart(\.com| marketplace| connect)?|target(\.com| plus|\+)|tiktok shop|instacart|chewy|wayfair|marketplace (management|agency|consult|growth|expert)|\b1p\b|\b3p\b|seller central|vendor central|marketplace/i;
const SEG_STRATEGY = /e-?commerce (strategy|consult|advis|analytics|transformation)|omnichannel (strategy|consult)|digital shelf|retail media (consult|strategy|analytics)|sales analytics|(retail|commerce|shopper|pos) (data|analytics|insights)|syndicated data|category analytics|e-?commerce (advisory|leadership|fractional)|fractional (head|vp|chief).{0,20}e-?commerce|digital commerce consult|retail strategy|cpg (strategy|and retail (business )?consult)|revenue management consult/i;
// what a firm mainly is, from the first clause of its label: a digital-marketing, PR or automation shop with an Amazon side line is not a marketplace agency
const DTC_PRIMARY = /digital marketing|\bpr\b|public relations|advertising network|programmatic|performance marketing agency|seo agency|dropship|automation (agency|services)|e-?commerce automation|done[- ]for[- ]you|web (design|development)|shopify (agency|developer|development)/i;
const SEG_DTC = /performance marketing|paid (social|media|search)|facebook ads|meta ads|google ads|\bseo\b|email marketing|klaviyo|influencer|shopify (plus )?(development|developer|agency|partner|store)|magento|bigcommerce|woocommerce|web (design|development)|store build|dropship|\bcro\b|conversion rate/i;
const SEG_OPS = /\b3pl\b|fulfil?ment|warehous|logistics|freight|supply[- ]chain|procurement|operations consult|operational management|workforce productivity|inventory management consult|\blean\b/i;
const SEG_STAFF = /recruit|staffing|executive search|retained search|headhunt|talent (acquisition|solutions|partners)|interim/i;
const SEG_SOFTWARE = /\b(software|saas)\b|platform company|analytics platform|not a (placement|consult)/i;
function segOne(t) {
  // the AI often adds what a firm is NOT ("Not retail placement.", "(not a placement broker)"): those words never count
  t = String(t || '').replace(/\((?:[^()]*\b)?not (a |an )?[^()]*\)/gi, ' ').replace(/(^|[.;]\s*)((it|this) is |but )?not (a |an )?[^.;]*[.;]?/gi, '$1 ').trim();
  if (!t) return null;
  const first = t.split(/[;(:]|\s[–—-]\s/)[0];
  if (SEG_STAFF.test(first)) return 'staffing';
  if (SEG_SOFTWARE.test(first)) return 'software';
  if (DTC_PRIMARY.test(first) && !SEG_RETAIL.test(first) && !/marketplace/i.test(first)) return 'dtc';
  if (SEG_STRATEGY.test(first) && !SEG_RETAIL.test(first.replace(/retail strategy/ig, '')) && !SEG_MARKET.test(first)) return 'strategy';
  if (SEG_OPS.test(first) && !SEG_RETAIL.test(first) && !SEG_MARKET.test(first)) return 'ops';
  if (SEG_RETAIL.test(t)) return 'retail_placement';
  if (SEG_MARKET.test(t)) return 'marketplace';
  if (SEG_STRATEGY.test(t)) return 'strategy';
  if (SEG_OPS.test(first)) return 'ops';
  if (SEG_DTC.test(t) || /e-?commerce|dtc|direct[- ]to[- ]consumer/i.test(t)) return 'dtc';
  if (SEG_OPS.test(t)) return 'ops';
  return null;
}
/** The firm's short industry label decides; the longer summary only fills in when the label says nothing. */
export function segmentOf(industry, summary = '') {
  return segOne(String(industry || '').trim()) || segOne(String(summary || '').trim());
}
export const SEGMENT = Object.fromEntries([...THESIS.segments, ...THESIS.excluded, { key: 'staffing', label: 'Recruiting / staffing', short: 'recruiting and staffing firms (earlier thesis)' }, { key: 'software', label: 'Software company', short: 'software, not consulting' }].map(s => [s.key, s]));
export const inSegment = k => THESIS.segments.some(s => s.key === k);

// Screening guides, not false precision. Missing evidence is always NEEDS DATA.
export const GUIDES = {
  repeat: 0.6, top1: 0.2, top5: 0.5, seller: 0.3, capex: 0.03, dso: 60, multiple: 3.5, dscr: 1.25, retention: 0.75,
};

// ---------- revenue models ----------
// cash: how the cash arrives. 'advance' = before the work, 'cycle' = on a recurring schedule, 'arrears' = after the work,
// 'success' = only when the outcome happens, 'float' = the firm pays workers before it is paid.
export const REVENUE_MODELS = {
  retainer:             { label: 'Retainer / subscription', recurring: true, cash: 'advance' },
  recurring_program:    { label: 'Recurring program', recurring: true, cash: 'cycle' },
  recurring_inspection: { label: 'Recurring inspection / certification cycle', recurring: true, cash: 'cycle' },
  time_materials:       { label: 'Time and materials', recurring: false, cash: 'arrears' },
  fixed_fee:            { label: 'Fixed-fee project', recurring: false, cash: 'arrears' },
  milestone:            { label: 'Milestone billing', recurring: false, cash: 'arrears' },
  retained_search:      { label: 'Retained search', recurring: false, cash: 'advance' },
  engaged_search:       { label: 'Engaged search', recurring: false, cash: 'advance' },
  contingent_search:    { label: 'Contingent search', recurring: false, cash: 'success' },
  contract_staffing:    { label: 'Contract staffing markup', recurring: true, cash: 'float', payrollFloat: true },
  managed_service:      { label: 'Managed service', recurring: true, cash: 'cycle' },
  other:                { label: 'Other verified revenue type', recurring: false, cash: 'arrears' },
};
// ledger revenue categories → revenue model (rev_sales and rev_other are too broad to say)
export const CATEGORY_MODEL = { rev_retained: 'retained_search', rev_contingent: 'contingent_search', rev_fractional: 'retainer', rev_advisory: 'retainer', rev_recurring: 'recurring_program', rev_project: 'time_materials', rev_staffing: 'contract_staffing' };

// ---------- subsectors ----------
const RULES = 'Rules: work only with local files in this folder; never send email or messages, contact anyone, or change any external system; everything you produce is a draft for a person to review.';
// one workflow per model key: [label, AI title, 3 steps, setup prompt, [when, recurring prompt]]
const wf = (label, title, steps, setup, run) => ({ label, title, steps, setup, run });

export const SUBSECTORS = {
  engineering: { legacy: true,
    label: 'Engineering & Technical Services', short: 'engineering and technical services',
    match: /engineer|surveying|geotech|structural|civil|mep\b|environmental consult|technical (service|consult)|design firm|drafting|metrolog|calibrat/i,
    nouns: { workers: 'engineers and technical staff', worker: 'engineer', jobs: 'projects', job: 'project', customers: 'clients', paidWork: 'deliver client projects' },
    delivery: 'Licensed engineers and technical staff on client projects',
    models: ['time_materials', 'fixed_fee', 'milestone', 'retainer'],
    buyers: 'industrial operators, manufacturers, developers, facility owners, contractors and municipalities with projects coming',
    buyerTitles: 'VP engineering, plant or facilities manager, director of capital projects, public works director',
    triggers: 'new plants or expansions, permits filed, capital project announcements, new facility leases, infrastructure funding, engineering hiring spikes',
    associations: 'ACEC (American Council of Engineering Companies) state chapters, NSPE, local engineering societies',
    aiStance: 'AI drafts and searches; licensed engineers keep judgment and the stamp, so AI tends to raise capacity rather than replace the service.',
    rfp: 'high',
    workflows: {
      research: wf('Scoping and estimating from past projects', 'Estimate new work from past projects', ['Collect 30 finished projects with scope, hours and fee', 'AI drafts the scope and hours for each new request from the closest past jobs', 'A senior engineer checks and prices it'],
        'Set up an estimating workspace for our engineering firm. Create inputs/requests, inputs/past_projects (scope, hours by role, fee, overruns), outputs/estimates. Write a script that finds the 5 most similar past projects for a new request and drafts scope, hours by role and fee, citing the past project behind each line.', ['Per request', 'Read inputs/requests/<REQUEST_ID>.md. Draft outputs/estimates/<REQUEST_ID>.md from the closest past projects. Flag any line with no comparable past project. Do not invent rates.']),
      sourcing: wf('Specification and code lookup', 'Find the right standard or precedent in seconds', ['Index past calc packages, specs and standards the firm owns', 'AI answers “where have we done this before?” with the file and page', 'The engineer of record decides'],
        'Index the documents in inputs/library (past calc packages, specs, standards the firm is licensed to use). Write a search tool that answers a question with the exact file, page and quote. Never answer without a quote.', ['Per question', 'Answer the question in inputs/question.md from the indexed library. Quote the file, page and passage for each point. Say “not found” rather than guess.']),
      outreach: wf('Proposals and client follow-up', 'Proposal copilot from approved past responses', ['Collect past proposals, résumés and project sheets', 'AI drafts the response from approved language and flags unsupported claims', 'A principal approves and signs'],
        'Build a proposal library from inputs/past_proposals, inputs/project_sheets and inputs/resumes: tag each section by service, client type and outcome (won/lost).', ['Per proposal', 'For the RFP in inputs/rfp.pdf, retrieve the closest approved sections, draft each required section, and list every claim not backed by a library document as [[needs input]]. Save to outputs/proposal_draft.md.']),
      crm: wf('Project notes into records', 'Project records update themselves', ['Agree the fields every project record keeps (phase, hours to date, risks, next step)', 'AI turns meeting notes and emails into record updates', 'The project manager approves'],
        'Define the fields every project record must keep current. Write a script that turns notes in inputs/notes/ into updates for those fields, as a CSV for review.', ['Weekly', 'Process this week’s notes in inputs/notes/. Produce outputs/project_updates.csv (project, field, new value, source note) and outputs/at_risk.md for projects over 80% of budgeted hours.']),
      reporting: wf('Technical reports and client updates', 'Report drafting from field data', ['Agree a standard report template per service', 'AI drafts the report from field data, photos and calcs', 'The engineer of record reviews and signs'],
        'Create report templates for our standard deliverables in templates/. Write a script that fills a template from inputs/field_data and inputs/calcs, marking every value with its source file.', ['Per report', 'Draft outputs/reports/<PROJECT>.md from the template and the project’s inputs. Never invent a measurement; leave [[needs input]] where data is missing. The engineer of record signs.']),
      backoffice: wf('Billing, change orders and collections', 'Billing and change-order tie-out', ['List billing milestones and approved change orders per project', 'AI flags unbilled hours, unbilled change orders and late payers', 'The controller approves every invoice'],
        'From inputs/timesheets.csv, inputs/contracts and inputs/change_orders, build a list of billable work not yet invoiced and an aging of unpaid invoices from inputs/ar_export.csv.', ['Weekly', 'List unbilled hours, unbilled approved change orders and invoices over 45 days, each with a suggested next step, in outputs/billing_actions.md for the controller.']),
    },
    criteria: ['utilization', 'billable_headcount', 'backlog', 'repeat_engagements', 'project_length', 'license_dependence', 'principal_dependence'],
    firmFields: [['name', 'Firm name'], ['about', 'About the firm (years, offices, size)'], ['projects', 'Relevant projects (client type, scope, year)'], ['credentials', 'Licenses and registrations (only ones you hold)'], ['team', 'Technical team who would lead it'], ['geography', 'States and regions served'], ['project_types', 'Project types and services'], ['differentiators', 'Why clients choose you']],
  },
  supply_chain: { legacy: true,
    label: 'Supply Chain, Logistics & Procurement', short: 'supply chain, logistics and procurement advisory',
    match: /supply[- ]chain|logistic|procurement|sourcing advis|purchasing|warehouse (design|consult)|distribution consult|freight audit|operations consult|lean|network (design|optimi)/i,
    nouns: { workers: 'consultants', worker: 'consultant', jobs: 'engagements', job: 'engagement', customers: 'clients', paidWork: 'deliver client engagements' },
    delivery: 'Senior consultants and analysts on client engagements',
    models: ['retainer', 'fixed_fee', 'time_materials', 'milestone'],
    buyers: 'manufacturers, distributors, 3PLs and physical-product companies going through network, facility or procurement change',
    buyerTitles: 'COO, VP supply chain, VP operations, chief procurement officer, director of logistics',
    triggers: 'new warehouses or distribution centers, plant openings or closures, ERP or WMS rollouts, procurement leadership changes, import surges, operations hiring spikes',
    associations: 'CSCMP, ASCM (APICS), ISM (Institute for Supply Management), IMC USA, MHI',
    aiStance: 'AI speeds analysis and deliverables; clients pay for judgment, implementation and accountability, so AI tends to improve the service.',
    rfp: 'medium',
    workflows: {
      research: wf('Spend analysis and supplier research', 'Spend analysis in hours, not weeks', ['Standardize the client’s spend export', 'AI classifies spend and researches suppliers, citing sources', 'A consultant checks the findings'],
        'Build a spend-analysis workspace: read inputs/spend_export.csv, normalize supplier names, classify spend into categories, and research each top-50 supplier from public sources, citing every source.', ['Per engagement', 'Classify inputs/<CLIENT>/spend.csv into categories, list top suppliers by spend with sourced profiles in outputs/<CLIENT>/spend_cube.md. Flag anything uncertain.']),
      sourcing: wf('RFQ packages and supplier benchmarking', 'RFQ builder and supplier benchmark', ['Collect past RFQs and award results', 'AI drafts the RFQ and the supplier comparison', 'The consultant approves before it goes to suppliers'],
        'From inputs/past_rfqs and inputs/awards, build RFQ templates by category and a supplier benchmark table (price, lead time, terms) with sources.', ['Per RFQ', 'Draft outputs/rfq_<CATEGORY>.md from the template and the client’s specs; compare bids in inputs/bids/ in outputs/bid_compare.csv. Never contact suppliers.']),
      outreach: wf('Proposals and client follow-up', 'Proposal copilot from past engagements', ['Collect past proposals, case studies and results', 'AI drafts the proposal from approved material and flags unsupported claims', 'A partner approves'],
        'Build a proposal library from inputs/past_proposals and inputs/case_studies, tagged by service, industry and outcome.', ['Per proposal', 'Draft outputs/proposal_<CLIENT>.md from the closest approved sections; list unsupported claims as [[needs input]].']),
      crm: wf('Engagement notes and knowledge reuse', 'Find any past engagement in seconds', ['Index past deliverables and engagement notes', 'AI answers “have we solved this before?” with the file and page', 'Consultants decide what to reuse'],
        'Index inputs/past_deliverables and inputs/engagement_notes. Write a search tool that answers with the file, page and quote.', ['Per question', 'Answer inputs/question.md from the index with exact quotes and files; say “not found” rather than guess.']),
      reporting: wf('Client deliverables and status reports', 'Deliverable drafting from analysis', ['Agree standard deliverable templates', 'AI drafts the deliverable from the analysis files', 'The engagement lead reviews and sends'],
        'Create deliverable templates (assessment, network study, status report) in templates/. Write a script that fills them from inputs/analysis, citing the source file for every number.', ['Weekly', 'Draft outputs/status/<CLIENT>.md from this week’s work files. Never include another client’s information.']),
      backoffice: wf('Billing and collections', 'Billing tie-out and collections follow-up', ['List what gets billed and when per engagement', 'AI flags unbilled work and late payers', 'Finance approves every invoice and reminder'],
        'From inputs/engagements and inputs/timesheets.csv, list billable work not yet invoiced and an aging from inputs/ar_export.csv.', ['Weekly', 'List unbilled work and invoices over 45 days with suggested reminders in outputs/billing_actions.md for finance.']),
    },
    criteria: ['project_program_mix', 'recurring_advisory', 'gainshare', 'customer_dependence'],
    firmFields: [['name', 'Firm name'], ['about', 'About the firm (years, offices, size)'], ['engagements', 'Relevant engagements (client type, scope, year)'], ['specialties', 'Operational specialties'], ['industries', 'Industries served'], ['outcomes', 'Project outcomes (only ones you can show)'], ['team', 'Who would lead the work'], ['differentiators', 'Why clients choose you']],
  },
  compliance: { legacy: true,
    label: 'Compliance, Regulatory, EHS & Inspection', short: 'compliance, regulatory, EHS and inspection services',
    match: /complian|regulator|ehs\b|environmental,? health|health and safety|safety (consult|services|training)|osha|inspection|permit|industrial hygiene|fire (protection|inspection)|elevator|backflow/i,
    nouns: { workers: 'inspectors and consultants', worker: 'inspector', jobs: 'inspections and engagements', job: 'engagement', customers: 'clients', paidWork: 'run inspections and compliance work' },
    delivery: 'Certified inspectors and compliance consultants on recurring client programs',
    models: ['recurring_inspection', 'recurring_program', 'retainer', 'fixed_fee'],
    buyers: 'regulated operators and facilities facing required inspections, permits, audits or certifications',
    buyerTitles: 'EHS director, plant manager, facilities director, compliance officer, risk manager',
    triggers: 'new facilities or permits, regulatory deadlines, enforcement actions in the region, new certifications required by customers, EHS leadership changes',
    associations: 'ASSP (American Society of Safety Professionals), NAEM, AIHA, state inspection and fire-protection associations',
    aiStance: 'Required inspections and sign-offs stay with certified people; AI drafts reports and tracks deadlines, so it tends to raise capacity.',
    rfp: 'high',
    workflows: {
      research: wf('Regulatory research and change monitoring', 'Regulation lookup and change alerts', ['List the rules each client must meet', 'AI answers with the exact rule text and flags changes', 'A certified consultant confirms'],
        'Build a regulation library in inputs/regs (only official texts). Write a lookup that answers with the exact citation and a change log that compares new versions.', ['Weekly', 'Compare inputs/regs/new against the library; list changed requirements and the clients they affect in outputs/reg_changes.md for review.']),
      sourcing: wf('Inspection scheduling and routes', 'Schedule and route planner', ['Write down scheduling rules and due dates', 'AI proposes next week’s schedule and routes', 'The operations manager approves'],
        'From inputs/sites.csv (location, due dates, inspector certifications) write a script that proposes a weekly schedule and routes that meet every due date.', ['Weekly', 'Draft outputs/schedule_draft.csv and outputs/conflicts.md (missed due dates, certification mismatches). A manager approves.']),
      outreach: wf('Renewal reminders and client follow-up', 'Renewal and recertification calendar', ['Load every client’s renewal and recertification dates', 'AI drafts reminders 90/60/30 days ahead', 'Staff edit and send'],
        'Build a renewal calendar from inputs/clients.csv and inputs/certificates/ with each due date and source document.', ['Weekly', 'List renewals due in 90 days and draft reminders in outputs/renewals.md for staff to send.']),
      crm: wf('Field notes into records', 'Field notes become structured findings', ['Agree the finding fields (site, rule, severity, photo, fix)', 'AI turns field notes into structured findings', 'The inspector approves'],
        'Define the finding fields. Write a script that turns inputs/field_notes into structured findings in a CSV for review.', ['Per inspection', 'Convert inputs/field_notes/<SITE>.md to outputs/findings_<SITE>.csv; mark anything unclear for the inspector.']),
      reporting: wf('Inspection report drafting', 'Inspection report drafting', ['Agree a standard report per inspection type', 'AI drafts the report from structured findings and photos', 'The certified inspector reviews and signs'],
        'Create report templates per inspection type in templates/. Write a script that fills them from outputs/findings_<SITE>.csv, citing the rule for each finding.', ['Per inspection', 'Draft outputs/reports/<SITE>.md. Never invent a finding or a measurement; the certified inspector signs.']),
      backoffice: wf('Billing and collections', 'Billing tie-out and collections follow-up', ['List what gets billed per inspection and program', 'AI flags completed inspections not billed and late payers', 'The office manager approves'],
        'From inputs/completed_inspections.csv and inputs/invoices.csv, list work not yet invoiced and an aging from inputs/ar_export.csv.', ['Weekly', 'List unbilled inspections and invoices over 45 days with suggested reminders in outputs/billing_actions.md.']),
    },
    criteria: ['recurring_cycles', 'renewal_rate', 'regulatory_driver', 'cert_transferable', 'license_dependence'],
    firmFields: [['name', 'Firm name'], ['about', 'About the firm (years, offices, size)'], ['certifications', 'Certifications and accreditations (only ones you hold)'], ['capabilities', 'Inspection and testing capabilities'], ['regulatory', 'Regulatory experience (rules, agencies, industries)'], ['programs', 'Recurring and renewal programs'], ['team', 'Who would lead the work'], ['differentiators', 'Why clients choose you']],
  },
  testing: { legacy: true,
    label: 'Testing & Certification', short: 'testing and certification services',
    match: /testing|laborator|\blab\b|certification bod|certif(y|ication) services|nondestructive|\bndt\b|materials testing|calibration|accredit/i,
    nouns: { workers: 'technicians', worker: 'technician', jobs: 'tests and certifications', job: 'job', customers: 'clients', paidWork: 'run tests and certifications' },
    delivery: 'Accredited technicians and labs on recurring and project testing',
    models: ['recurring_inspection', 'time_materials', 'fixed_fee', 'recurring_program'],
    buyers: 'manufacturers, construction and infrastructure owners, and product companies that need testing or certification to ship, build or sell',
    buyerTitles: 'quality director, plant manager, project engineer, regulatory affairs manager',
    triggers: 'new product lines, plant openings, construction starts, customer certification requirements, recalls or quality issues in the industry',
    associations: 'A2LA and ANAB accredited-lab directories, ACIL (American Council of Independent Laboratories), ASNT',
    aiStance: 'Accredited testing stays physical and certified; AI drafts reports and schedules, so it tends to raise capacity.',
    rfp: 'medium',
    workflows: {
      research: wf('Test plans and quotes', 'Quote and test plan from past jobs', ['Collect 30 past quotes and test plans', 'AI drafts the plan and quote from the closest past jobs', 'The lab manager approves'],
        'Set up inputs/requests and inputs/past_jobs (method, standard, hours, price). Write a script that drafts a test plan and quote from the closest past jobs, citing each.', ['Per request', 'Draft outputs/quotes/<REQUEST>.md; flag any method with no past job. Do not invent prices.']),
      sourcing: wf('Lab and field scheduling', 'Lab and field schedule planner', ['Write down equipment, technician and turnaround rules', 'AI proposes the week’s schedule', 'The lab manager approves'],
        'From inputs/jobs.csv, inputs/equipment.csv and inputs/technicians.csv, write a script that proposes a schedule meeting promised turnaround.', ['Weekly', 'Draft outputs/schedule.csv and outputs/late_risk.md. A manager approves.']),
      outreach: wf('Recertification reminders', 'Recertification and retest calendar', ['Load every client’s certificate and retest dates', 'AI drafts reminders ahead of each date', 'Staff edit and send'],
        'Build a certificate calendar from inputs/certificates with each due date and source.', ['Weekly', 'List retests and recertifications due in 90 days with draft reminders in outputs/reminders.md.']),
      crm: wf('Sample and job records', 'Job records update themselves', ['Agree the fields every job keeps (sample, method, status, due)', 'AI turns notes and logs into updates', 'The lab manager approves'],
        'Define job record fields. Write a script that turns inputs/logs into record updates as a CSV.', ['Daily', 'Produce outputs/job_updates.csv and outputs/overdue.md from today’s logs.']),
      reporting: wf('Test report and certificate drafting', 'Test report drafting', ['Agree a report template per method', 'AI fills the report from instrument data', 'The accredited signatory reviews and signs'],
        'Create report templates per method. Write a script that fills them from inputs/results (instrument exports), citing each value’s file.', ['Per job', 'Draft outputs/reports/<JOB>.md; never alter a measured value; the signatory signs.']),
      backoffice: wf('Billing and collections', 'Billing tie-out and collections follow-up', ['List what gets billed per job', 'AI flags finished jobs not billed and late payers', 'The office manager approves'],
        'From inputs/completed_jobs.csv and inputs/invoices.csv, list unbilled work and an aging from inputs/ar_export.csv.', ['Weekly', 'List unbilled jobs and invoices over 45 days in outputs/billing_actions.md.']),
    },
    criteria: ['recurring_cycles', 'renewal_rate', 'cert_transferable', 'license_dependence'],
    firmFields: [['name', 'Firm name'], ['about', 'About the firm (years, labs, size)'], ['certifications', 'Accreditations (only ones you hold)'], ['capabilities', 'Test methods and capabilities'], ['regulatory', 'Standards and industries served'], ['programs', 'Recurring testing programs'], ['team', 'Who would lead the work'], ['differentiators', 'Why clients choose you']],
  },
  implementation: { legacy: true,
    label: 'Technical Implementation', short: 'technical implementation services',
    match: /implementation|systems integrat|integrator|erp|wms|crm (consult|partner)|netsuite|salesforce|dynamics|sap\b|epicor|managed service|it services|automation integrat|controls integrat/i,
    nouns: { workers: 'consultants and implementers', worker: 'consultant', jobs: 'projects', job: 'project', customers: 'clients', paidWork: 'deliver implementation projects' },
    delivery: 'Certified implementers on projects, plus support after go-live',
    models: ['fixed_fee', 'time_materials', 'milestone', 'managed_service'],
    buyers: 'companies running, selecting or upgrading the technology the firm implements',
    buyerTitles: 'CIO, IT director, CFO or controller (for finance systems), VP operations',
    triggers: 'job posts naming the system, end-of-support dates, acquisitions that force a systems merge, new CIO or CFO, growth past the current system',
    associations: 'software vendors’ partner directories (for example NetSuite, Microsoft Dynamics, SAP, Epicor partner finders), TSIA',
    aiStance: 'AI writes configuration and documentation faster; firms paid for outcomes and support gain, firms selling hours of routine setup face price pressure.',
    rfp: 'medium',
    workflows: {
      research: wf('SOW drafting and scoping', 'Statement-of-work copilot', ['Collect past SOWs with actual hours', 'AI drafts the SOW from the closest past projects and flags scope risks', 'A senior consultant approves'],
        'Build a SOW library from inputs/past_sows with planned vs actual hours. Write a script that drafts a SOW from the closest past projects, citing each.', ['Per deal', 'Draft outputs/sow_<CLIENT>.md; list scope items with no comparable past project as risks.']),
      sourcing: wf('Configuration knowledge reuse', 'Find past configurations and fixes', ['Index past configurations, scripts and fixes', 'AI answers “have we built this before?” with the file', 'The consultant decides'],
        'Index inputs/configs, inputs/scripts and inputs/tickets. Write a search tool that answers with the file and passage.', ['Per question', 'Answer inputs/question.md with exact files and passages; say “not found” rather than guess.']),
      outreach: wf('Proposals and account follow-up', 'Proposal copilot from past wins', ['Collect past proposals and case studies', 'AI drafts the response and flags unsupported claims', 'A partner approves'],
        'Build a proposal library from inputs/past_proposals and inputs/case_studies.', ['Per proposal', 'Draft outputs/proposal_<CLIENT>.md from approved sections; mark unsupported claims [[needs input]].']),
      crm: wf('Support tickets and change orders', 'Support triage and change-order tracking', ['Agree ticket categories and what counts as a change', 'AI triages tickets and flags work outside scope', 'The project lead approves change orders'],
        'From inputs/tickets.csv and inputs/sows, write a script that categorizes tickets and flags work outside the signed scope.', ['Daily', 'Produce outputs/triage.csv and outputs/possible_change_orders.md for the project lead.']),
      reporting: wf('Documentation and status reports', 'Documentation and status drafting', ['Agree templates for design docs and status reports', 'AI drafts them from the project files', 'The project lead reviews'],
        'Create templates for design documents and weekly status. Write a script that fills them from inputs/project files.', ['Weekly', 'Draft outputs/status/<CLIENT>.md. Never include another client’s information.']),
      backoffice: wf('Billing and collections', 'Milestone billing tie-out', ['List milestones and support contracts per client', 'AI flags milestones reached but not billed and late payers', 'Finance approves'],
        'From inputs/sows (milestones) and inputs/invoices.csv, list milestones reached but not invoiced and an aging from inputs/ar_export.csv.', ['Weekly', 'List unbilled milestones and invoices over 45 days in outputs/billing_actions.md.']),
    },
    criteria: ['support_attach', 'recurring_services', 'overruns', 'change_orders', 'vendor_dependence'],
    firmFields: [['name', 'Firm name'], ['about', 'About the firm (years, offices, size)'], ['platforms', 'Platforms and partner status (only ones you hold)'], ['projects', 'Relevant implementations (client type, scope, year)'], ['credentials', 'Certifications (only ones you hold)'], ['team', 'Who would lead the project'], ['programs', 'Support and managed services'], ['differentiators', 'Why clients choose you']],
  },
  talent: { legacy: true,
    label: 'Talent Services', short: 'specialized talent services',
    match: /search|recruit|staffing|talent|headhunt|placement|\brpo\b|fractional|interim exec/i,
    nouns: { workers: 'recruiters', worker: 'recruiter', jobs: 'searches', job: 'search', customers: 'clients', paidWork: 'run searches' },
    delivery: 'Recruiters and search consultants; contract professionals where staffing is selective',
    models: ['retained_search', 'engaged_search', 'contingent_search', 'retainer', 'contract_staffing'],
    covers: ['retained search', 'engaged search', 'direct hire', 'contingent search', 'RPO', 'fractional talent', 'selective contract/professional staffing'],
    buyers: 'companies likely to hire through outside recruiters',
    buyerTitles: 'CEO, COO, VP People, head of talent',
    triggers: 'repeated senior job postings, leadership departures, new sites, new owners, system rollouts',
    associations: 'NAPS, SHRM chapters, AESC, American Staffing Association',
    aiStance: 'AI makes finding names cheap, which pressures success-fee-only volume recruiting; retained and engaged work paid for judgment, confidentiality and guarantees tends to gain.',
    rfp: 'low',
    workflows: null, // talent keeps the original search-firm playbook in lib/playbooks.mjs
    criteria: ['temp_mix', 'payroll_float', 'payroll_funding', 'retained_contingent_mix', 'placements', 'fee_per_placement', 'recruiter_productivity', 'recruiter_concentration'],
    firmFields: [['name', 'Firm name'], ['niche', 'Niche and clients'], ['about', 'About the firm (years, offices, size)'], ['placements', 'Recent placements (role, client type, year)'], ['fees', 'Fees and guarantee'], ['team', 'Who would lead the search'], ['differentiators', 'Why clients choose you']],
  },
};
// the buy box (v4.0): ecommerce consulting, including retail placement. Shares the advisory workflows; adds line-review and listing work.
SUBSECTORS.ecommerce = {
  label: 'Ecommerce Consulting', short: 'ecommerce consulting: retail placement, marketplace agencies, and ecommerce strategy and analytics',
  match: /e-?commerce (consult|agency|advis|services|strategy|analytics)|digital shelf|food (and beverage |& beverage )?broker|cpg broker|tiktok shop (agency|partner)|retail placement|retail (sales|readiness|entry|distribution) (consult|agency|advis)|brand (broker|accelerat)|sales (agency|representation)|manufacturers'? rep|amazon (agency|consult|seller)|marketplace (management|agency|consult)|walmart (consult|agency)|omnichannel consult|category management consult|retail media agency|getting (brands|products) into (retail|stores)/i,
  nouns: { workers: 'consultants', worker: 'consultant', jobs: 'client accounts', job: 'client account', customers: 'brands', paidWork: 'grow client brands in retail and online' },
  delivery: 'Account managers and consultants running brand accounts across retailers and marketplaces',
  models: ['retainer', 'fixed_fee', 'time_materials', 'milestone'],
  buyers: 'consumer-product and CPG brands (food, beverage, beauty, home, pet, wellness) trying to win shelf space at national retailers or grow on Amazon, Walmart.com and Target Plus',
  buyerTitles: 'founder, CEO, VP sales, head of retail, VP ecommerce, head of marketplaces',
  triggers: 'a brand raising money, launching new products, entering a new retailer or category reset, hiring a first VP sales or ecommerce lead, a retailer line review, losing a distributor',
  associations: 'ECRM, Expo West / Expo East exhibitors, NACDS, PLMA, Retail Industry Leaders Association, Amazon Ads and Walmart Marketplace partner directories, Shopify Plus partner directory',
  aiStance: 'AI speeds listings, line-review decks, retailer reporting and marketplace analytics; brands pay for retailer relationships and judgment, so AI tends to improve the service.',
  rfp: 'low',
  workflows: { ...SUBSECTORS.supply_chain.workflows,
    research: wf('Retailer line-review and buyer research', 'Line-review deck in hours, not days', ['Collect the brand’s sales data and the retailer’s category facts', 'AI drafts the line-review deck and retailer fit notes, citing sources', 'The account lead checks and presents'],
      'Build a line-review workspace: read inputs/<BRAND>/sales.csv and inputs/<RETAILER>/category_notes.md, draft a deck outline with velocity, margin and promo plan, and cite every number.', ['Per pitch', 'Draft outputs/<BRAND>/line_review_<RETAILER>.md from the brand data; mark anything not in the data as [[needs input]].']),
    sourcing: wf('Marketplace listing and catalog health', 'Listings and catalog fixes at scale', ['Export the brand’s catalog and marketplace reports', 'AI drafts listing fixes and flags suppressed items', 'The account manager approves before upload'],
      'From inputs/<BRAND>/catalog.csv and inputs/<BRAND>/marketplace_report.csv, list suppressed or weak listings and draft fixed titles, bullets and attributes.', ['Weekly', 'Write outputs/<BRAND>/listing_fixes.csv; never upload anything.']) },
  criteria: ['recurring_advisory', 'customer_dependence', 'brand_notice', 'retailer_concentration', 'commission_share', 'principal_dependence', 'project_program_mix'],
  firmFields: [['name', 'Firm name'], ['about', 'About the firm (years, offices, size)'], ['retailers', 'Retailers and marketplaces you work with'], ['brands', 'Brands you have placed or grown (only ones you can name)'], ['outcomes', 'Results (only ones you can show)'], ['team', 'Who would lead the account'], ['differentiators', 'Why brands choose you']],
};
// Partnership rule: AION offers a buyout to every owner; a partnership only when the firm says, in its own words, that it
// wants a growth partner or investor. Hiring, referral programs, alliances or money taken in the past never count.
// One copy, used by the owner ranking (server) and the firm page (browser).
export const PARTNER_ASK = /\b(seek(s|ing)?|looking for|open to|exploring|explore|interested in|welcom\w*|wants?|raising|in search of)\b[^.;]{0,40}?\b(growth|strategic|equity|capital|financial|operating|investment)?\s*(partners?|partnerships?|investors?|investment|capital)\b/i;
export const PARTNER_NOT_ASK = /\b(no|not|never|without|declin\w*|took|taken|received|closed|acquired|bought|backed|referral|affiliate|program|certified|verified|badge|agency status)\b/i;
export const asksForPartner = text => PARTNER_ASK.test(String(text || '')) && !PARTNER_NOT_ASK.test(String(text || ''));
// Deal stages, in order: one list for the pipeline, the firm card and the outreach page.
export const DEAL_STAGES = [['contacted', 'Contacted'], ['met', 'Meeting held'], ['nda', 'Confidentiality signed (NDA)'], ['books', 'Books received'], ['loi', 'Offer sent (LOI)'], ['diligence', 'LOI signed · diligence'], ['closed', 'Closed'], ['passed', 'Passed']];
export const SUBSECTOR_KEYS = Object.keys(SUBSECTORS);
/** The subsectors inside today's buy box (just ecommerce); legacy ones remain for older saved work. */
export const ACTIVE_SUBSECTORS = SUBSECTOR_KEYS.filter(k => !SUBSECTORS[k].legacy);
const DETECT_ORDER = ['ecommerce', 'talent', 'testing', 'compliance', 'implementation', 'supply_chain', 'engineering'];
const GENERIC_FIELDS = [['name', 'Firm name'], ['about', 'About the firm (years, offices, size)'], ['niche', 'Services and clients'], ['projects', 'Relevant work (client type, scope, year)'], ['credentials', 'Licenses and certifications (only ones you hold)'], ['team', 'Who would lead the work'], ['differentiators', 'Why clients choose you']];
export const FIRM_KEYS = [...new Set(Object.values(SUBSECTORS).flatMap(s => s.firmFields.map(f => f[0])).concat(GENERIC_FIELDS.map(f => f[0])))];
export const firmFields = sub => SUBSECTORS[sub]?.firmFields || GENERIC_FIELDS;

/** Subsector from free text (an industry name, an objective). null when it does not clearly fit one. */
export function detectSubsector(text) {
  const t = String(text || '');
  for (const k of DETECT_ORDER) if (SUBSECTORS[k].match.test(t)) return k;
  return null;
}
/** Backward-compatible: old deals store only kind 'staffing'|'general' (and the AI's talent_firm flag at the time). */
export function subsectorOf(industry) {
  if (!industry) return null;
  if (industry.subsector && SUBSECTORS[industry.subsector]) return industry.subsector;
  if (industry.subsector === null && industry.subsectorSet) return null;
  if (industry.kind === 'staffing' || industry.talent_firm === true) return 'talent';
  return detectSubsector(industry.name);
}
export const kindFor = sub => sub === 'talent' ? 'staffing' : 'general';

// ---------- the AION toolkit: reusable operating infrastructure, with honest status ----------
export const STATUS = { now: 'EXISTS NOW', partial: 'PARTIALLY EXISTS', build: 'NEEDS BUILDING' };
export const TOOLKIT = {
  search: { name: 'Proprietary Search', purpose: 'Acquisition sourcing, customer sourcing, candidate sourcing, market mapping, timing signals', status: 'now',
    detail: 'Parallel web searches, name-in-source check, merging, in-depth checks, explainable scoring, verified public contacts, network memory, weekly watchlists, deal pipeline (Proprietary Search tab).' },
  value: { name: 'Value Creation Engine', purpose: 'Analyze financials, normalize EBITDA, find and rank value levers, test returns, write operator plans', status: 'now',
    detail: 'General ledger or PDF to real profit, ranked plan, cases, returns by type of owner, Excel and 1-page PDF, monthly check-in (Value Creation tab).' },
  rfp: { name: 'RFP / Proposal Engine', purpose: 'Faster proposals and RFP responses from approved material, with source checks', status: 'partial',
    detail: 'Exists: every requirement quoted word for word with its page, sections drafted from the firm profile, gaps marked “needs input” (Documents tab). Needs building: a library of prior responses and case studies to retrieve from, and win/loss tracking.' },
  docs: { name: 'Document Automation', purpose: 'Structured deliverables from source files and data, with human review', status: 'partial',
    detail: 'Exists: candidate write-ups with every claim quoted from the source; the same word-for-word check used for RFPs. Needs building: templates for each firm’s own deliverables (inspection reports, assessments, technical summaries).' },
  research: { name: 'Research / Intelligence', purpose: 'Market research, account intelligence, competitor monitoring, customer signals, acquisition research', status: 'now',
    detail: 'In-depth company checks with cited facts, the outside check on reviews, courts and licenses, firms’ own client pages, watchlists. Competitor tracking runs through watchlists; no dedicated competitor view yet.' },
  memory: { name: 'Network Memory', purpose: 'Relationships between people, companies, candidates, customers, targets and past searches', status: 'now',
    detail: 'Every result from every search merged with its history and decisions; LinkedIn connections show warm introductions.' },
  signals: { name: 'Timing / Signal Engine', purpose: 'Events that point to customer demand, a sale, a hiring need or expansion', status: 'partial',
    detail: 'Exists: timing badges from domain records, website history, news, job boards and federal awards; the Demand radar for operations hiring. Needs building: regulatory-change and permit signal sets for compliance and engineering.' },
  workflow: { name: 'AI Agent / Workflow Layer', purpose: 'Repeated manual workflows turned into controlled, human-approved systems', status: 'partial',
    detail: 'Exists: a ready-to-run, human-approved build prompt and step list for every workflow in the plan, and the proven pattern from Entro (proposals) and MGT (reports, reconciliation). Needs building per company: the deployed workflow on its own data, with tracked hours.' },
  candidates: { name: 'Candidate Sourcing', purpose: 'Find, match and write up candidates', status: 'now',
    detail: 'Candidate searches, candidate↔client matching and candidate write-ups (Proprietary Search and Documents).' },
  dashboard: { name: 'Operating dashboard', purpose: 'Monthly results against the plan', status: 'partial',
    detail: 'Exists: monthly check-in from the books (After you buy tab). Needs building: non-financial measures such as utilization, backlog or proposal win rate.' },
};

// ---------- diligence answers: what only a conversation or the seller's files can show ----------
// kind: pct (0–100 typed, stored 0–1), num, choice. Recorded answers are labeled "From diligence" with the date.
export const DILIGENCE = {
  seller_origination: { q: 'Share of new business the seller personally brings in', kind: 'pct' },
  mgmt_depth: { q: 'Is there a #2 who can run delivery without the seller?', kind: 'choice', options: [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']] },
  key_person: { q: 'Would losing any one person (other than the seller) cost more than 15% of revenue?', kind: 'choice', options: [['no', 'No'], ['yes', 'Yes']] },
  ai_effect: { q: 'Does AI make this firm’s core service more valuable, or cheaper to replace?', kind: 'choice', options: [['improves', 'Improves it'], ['mixed', 'Mixed'], ['commoditizes', 'Commoditizes it']] },
  capex_pct: { q: 'Capital spending as a share of revenue', kind: 'pct' },
  rfp_share: { q: 'Share of new revenue won through formal RFPs, RFQs or written proposals', kind: 'pct' },
  proposal_process: { q: 'How are proposals and RFP responses put together today?', kind: 'choice', options: [['manual', 'From scratch, by hand'], ['templates', 'Copied from old documents'], ['system', 'A proposal system or library']] },
  deliverables: { q: 'Repetitive written deliverables a month (reports, inspections, assessments, write-ups)', kind: 'num' },
  deliverable_hours: { q: 'Expert hours spent writing each one', kind: 'num' },
  knowledge: { q: 'Where does past project knowledge live?', kind: 'choice', options: [['heads', 'In senior people’s heads'], ['drives', 'Scattered files and email'], ['system', 'A searchable system']] },
  lead_source: { q: 'Where does new business come from?', kind: 'choice', options: [['founder', 'The founder and referrals'], ['mix', 'A mix'], ['outbound', 'A structured sales process']] },
  crm: { q: 'How is the CRM (customer records) used?', kind: 'choice', options: [['none', 'Not at all'], ['partial', 'Partly'], ['consistent', 'Consistently']] },
  account_plans: { q: 'Are there written account plans for the top clients?', kind: 'choice', options: [['no', 'No'], ['yes', 'Yes']] },
  hiring_bottleneck: { q: 'Is hiring qualified people a bottleneck to growth?', kind: 'choice', options: [['yes', 'Yes'], ['no', 'No']] },
  // subsector
  utilization: { q: 'Billable utilization of delivery staff', kind: 'pct' },
  backlog: { q: 'Signed backlog, in months of revenue', kind: 'num' },
  project_length: { q: 'Typical project length, in months', kind: 'num' },
  license_dependence: { q: 'Does delivery depend on licenses held by only one or two people?', kind: 'choice', options: [['no', 'No'], ['yes', 'Yes']] },
  principal_dependence: { q: 'Do one or two principals lead most client relationships?', kind: 'choice', options: [['no', 'No'], ['yes', 'Yes']] },
  renewal_rate: { q: 'Share of recurring clients who renew each cycle', kind: 'pct' },
  regulatory_driver: { q: 'Is demand set by a regulation or required certification?', kind: 'choice', options: [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']] },
  cert_transferable: { q: 'Do the firm’s licenses and accreditations stay with the company after a sale?', kind: 'choice', options: [['yes', 'Yes'], ['no', 'No']] },
  recurring_share: { q: 'Share of revenue from recurring programs, cycles or retainers', kind: 'pct' },
  gainshare: { q: 'Share of fees that depend on savings delivered (gain-share)', kind: 'pct' },
  support_attach: { q: 'Share of implementation clients who buy ongoing support', kind: 'pct' },
  overruns: { q: 'Share of fixed-fee projects that run over budget', kind: 'pct' },
  change_orders: { q: 'Are change orders written and billed?', kind: 'choice', options: [['yes', 'Yes'], ['no', 'No']] },
  vendor_dependence: { q: 'Share of work tied to one software vendor', kind: 'pct' },
  temp_mix: { q: 'Share of revenue from temporary or contract staffing', kind: 'pct' },
  payroll_funding: { q: 'How is contract payroll funded?', kind: 'choice', options: [['none', 'No contract payroll'], ['line', 'Credit line sized to payroll'], ['cash', 'From cash on hand'], ['factoring', 'Invoice factoring']] },
  recruiter_concentration: { q: 'Share of placements made by the top recruiter', kind: 'pct' },
  brand_notice: { q: 'How much notice must a brand give to end its contract?', kind: 'choice', options: [['90', '90 days or more'], ['30', '30–60 days'], ['none', 'Any time, no notice']] },
  retailer_concentration: { q: 'Share of revenue tied to the single biggest retailer or marketplace (for example Walmart or Amazon)', kind: 'pct' },
  commission_share: { q: 'Share of revenue paid as a commission on brand sales, rather than a fixed monthly fee', kind: 'pct' },
};
export const UNIVERSAL_DILIGENCE = ['seller_origination', 'mgmt_depth', 'key_person', 'ai_effect', 'capex_pct'];
export const FIT_DILIGENCE = ['rfp_share', 'proposal_process', 'deliverables', 'deliverable_hours', 'knowledge', 'lead_source', 'crm', 'account_plans', 'hiring_bottleneck'];
// subsector criterion key → the diligence question that can answer it
const CRIT_Q = { utilization: 'utilization', backlog: 'backlog', project_length: 'project_length', license_dependence: 'license_dependence', principal_dependence: 'principal_dependence', brand_notice: 'brand_notice', retailer_concentration: 'retailer_concentration', commission_share: 'commission_share', renewal_rate: 'renewal_rate', regulatory_driver: 'regulatory_driver', cert_transferable: 'cert_transferable', recurring_cycles: 'recurring_share', project_program_mix: 'recurring_share', recurring_advisory: 'recurring_share', recurring_services: 'recurring_share', gainshare: 'gainshare', support_attach: 'support_attach', overruns: 'overruns', change_orders: 'change_orders', vendor_dependence: 'vendor_dependence', temp_mix: 'temp_mix', payroll_funding: 'payroll_funding', recruiter_concentration: 'recruiter_concentration' };
export function diligenceFor(sub) {
  const crit = SUBSECTORS[sub]?.criteria || [];
  return [...new Set([...UNIVERSAL_DILIGENCE, ...crit.map(k => CRIT_Q[k]).filter(Boolean), ...FIT_DILIGENCE])];
}

// ---------- helpers ----------
const k$ = v => (v < 0 ? '−' : '') + (Math.abs(v) >= 1e6 ? '$' + (Math.abs(v) / 1e6).toFixed(2) + 'M' : '$' + Math.round(Math.abs(v) / 1000) + 'K');
const P = v => Math.round(v * 100) + '%';
const row = (key, label, status, value, evidence, guide, source) => ({ key, label, status, value: value ?? '', evidence, guide: guide || '', source: source || '' });
const NEED = (key, label, ask, guide) => row(key, label, 'needs_data', '', ask, guide, 'needs data');
// a recorded diligence answer, or null
const ans = (S, k) => { const a = S?.diligence?.[k]; return a && a.value !== '' && a.value != null ? a : null; };
const dil = a => `From diligence${a.at ? ` (${String(a.at).slice(0, 10)})` : ''}${a.note ? `: ${a.note}` : ''}`;
const band = (v, pass, watch, higherIsBetter = true) => higherIsBetter ? (v >= pass ? 'pass' : v >= watch ? 'watch' : 'fail') : (v <= pass ? 'pass' : v <= watch ? 'watch' : 'fail');

/** Revenue mix from the ledger categories: shares by category and by revenue model. */
export function revenueMix(byCat) {
  const rev = Object.entries(byCat || {}).filter(([k, v]) => k.startsWith('rev_') && k !== 'rev_refunds' && v > 0);
  const tot = rev.reduce((t, [, v]) => t + v, 0);
  if (!tot) return null;
  const share = k => (byCat[k] > 0 ? byCat[k] : 0) / tot;
  const models = {};
  for (const [k, v] of rev) { const m = CATEGORY_MODEL[k]; if (m) models[m] = (models[m] || 0) + v / tot; }
  const specific = Object.values(models).reduce((t, v) => t + v, 0);
  return { total: tot, share, models, specific, recurring: Object.entries(models).filter(([m]) => REVENUE_MODELS[m]?.recurring && m !== 'contract_staffing').reduce((t, [, v]) => t + v, 0), staffing: share('rev_staffing'), retained: share('rev_retained'), contingent: share('rev_contingent'), unspecified: share('rev_sales') + share('rev_other') };
}

// ---------- the Deal Thesis Check (books + diligence; never a single blended score) ----------
/**
 * ctx: { S, d, profile } where d is the server's derived object. Returns { universal, subsector, avoid, counts }.
 * Every row: status pass|watch|fail|needs_data, the value, the evidence behind it, and the guide used.
 */
export function thesisCheck({ S, d, profile: PR }) {
  const t = d.pnl?.TTM, n = d.normalization, q = d.quality, D = d.deal, sub = PR?.subsector;
  const rev = t?.revenue || 0, mix = revenueMix(t?.byCat), U = [];
  // 1 normalized EBITDA
  if (n) { const v = n.normalized, E = THESIS.ebitda;
    U.push(row('ebitda', 'Normalized EBITDA', v <= 0 ? 'fail' : v >= E.min && v <= E.max ? 'pass' : 'watch', k$(v),
      `${S.file?.kind === 'pdf' ? 'Published statements' : 'Ledger'}: real profit after owner pay, one-off costs and a hired leader. ${v >= E.priorityMin && v <= E.priorityMax ? 'Inside the first-deal priority range.' : v > E.priorityMax && v <= E.max ? 'In the target universe; above the first-deal priority range.' : v > 0 && v < E.min ? 'Below the target universe.' : v > E.max ? 'Above the target universe.' : 'Loses money.'}`, '$500K–$5M; first deals $500K–$2M', 'books')); }
  // 2 EBITDA margin
  if (n && rev) { const m = n.normalized / rev, peer = d.peer?.ebitda, tm = S.industry?.margin;
    const st = m < 0.05 ? 'fail' : peer != null ? (m >= peer ? 'pass' : 'watch') : tm ? (m >= tm.low ? 'pass' : 'watch') : 'needs_data';
    U.push(row('margin', 'EBITDA margin', st, P(m), peer != null ? `${P(m)} vs ${P(peer)} for ${d.peer.industry} (NYU Stern, large US public companies)` : tm ? `${P(m)} vs a usual ${P(tm.low)}–${P(tm.high)} for this kind of firm (AI estimate; no public benchmark matched)` : `${P(m)}; no peer benchmark matched${m < 0.05 ? ', and below 5% is structurally thin' : ''}`, 'at or above peers; below 5% is structurally weak', 'books')); }
  // 3 growth
  const g = growthOf(d);
  U.push(g ? row('growth', 'Revenue growth', band(g.rate, 0, -0.1), (g.rate >= 0 ? '+' : '') + P(g.rate), `${g.label}: ${k$(g.now)} vs ${k$(g.before)}`, 'flat or better', 'books')
    : NEED('growth', 'Revenue growth', 'Needs two full years of books.', 'flat or better'));
  // 4 repeat / recurring revenue
  if (q?.repeatShare != null) U.push(row('repeat', 'Repeat / returning-client revenue', band(q.repeatShare, GUIDES.repeat, 0.4), P(q.repeatShare), `Ledger: ${P(q.repeatShare)} of the last 12 months’ named revenue came from clients who also paid in the 12 months before${mix?.recurring ? `; ${P(mix.recurring)} is booked as recurring or retainer revenue` : ''}`, 'preferably 60%+', 'books'));
  // recurring revenue proves repeat business when it is high; project revenue can still come from repeat clients, so a low share is not a fail
  else if (mix?.recurring >= GUIDES.repeat) U.push(row('repeat', 'Repeat / returning-client revenue', 'pass', P(mix.recurring) + ' recurring', 'Ledger revenue accounts booked as recurring or retainer revenue (client names not available to measure repeat clients)', 'preferably 60%+', 'books'));
  else if (mix?.recurring) U.push(NEED('repeat', 'Repeat / returning-client revenue', `${P(mix.recurring)} of revenue is booked as recurring; repeat clients on project work need client names on revenue lines or a revenue-by-client report.`, 'preferably 60%+'));
  else U.push(NEED('repeat', 'Repeat / returning-client revenue', 'Needs client names on revenue lines and two years of books, or a revenue-by-client report.', 'preferably 60%+'));
  // 5 retention
  U.push(q?.retention != null ? row('retention', 'Customer retention', band(q.retention, GUIDES.retention, 0.5), P(q.retention), `Ledger: ${q.retainedCustomers} of ${q.priorCustomers} clients from the prior year paid again`, 'guide: 75%+ of clients return', 'books')
    : NEED('retention', 'Customer retention', 'Needs client names and two full years of books.', 'guide: 75%+ of clients return'));
  // 6–7 concentration (ledger first, then the uploaded sales file)
  const sales = S.extra?.sales?.analysis, named = q?.customersTTM >= 3;
  const top1 = named ? q.top1 : sales?.top1, top5 = named ? q.top5 : sales?.top5, cSrc = named ? `Ledger: ${q.customersTTM} named clients in the last 12 months` : sales ? `Sales file: ${sales.customers} customers` : '';
  U.push(top1 != null ? row('top1', 'Top customer share', band(top1, GUIDES.top1, 0.35, false), P(top1), `${cSrc}; largest is ${P(top1)} of revenue`, 'preferably below 20%', named ? 'books' : 'file') : NEED('top1', 'Top customer share', 'Needs client names on revenue lines or a sales-by-customer report.', 'preferably below 20%'));
  U.push(top5 != null ? row('top5', 'Top five customers', band(top5, GUIDES.top5, 0.7, false), P(top5), `${cSrc}; top five are ${P(top5)} of revenue`, 'preferably below 50%', named ? 'books' : 'file') : NEED('top5', 'Top five customers', 'Needs client names on revenue lines or a sales-by-customer report.', 'preferably below 50%'));
  // 8 seller dependence
  { const a = ans(S, 'seller_origination'); U.push(a ? row('seller', 'Seller dependence', band(+a.value, GUIDES.seller, 0.5, false), P(+a.value) + ' of new business', dil(a), 'preferably below ~30%', 'diligence') : NEED('seller', 'Seller dependence', 'Ask: what share of new business does the seller bring in personally?', 'preferably below ~30%')); }
  // 9 management depth
  { const a = ans(S, 'mgmt_depth'); U.push(a ? row('mgmt', 'Management depth', { yes: 'pass', partly: 'watch', no: 'fail' }[a.value] || 'needs_data', { yes: 'A #2 can run delivery', partly: 'Partly', no: 'No #2' }[a.value] || a.value, dil(a), 'a #2 who can run delivery', 'diligence') : NEED('mgmt', 'Management depth', 'Ask: who runs delivery if the seller is away for a month?', 'a #2 who can run delivery')); }
  // 10 employee concentration (payroll file, else producer pay in the ledger)
  { const p = S.extra?.payroll?.analysis, c = d.payConcentration;
    U.push(p?.top3Share != null ? row('employees', 'Employee concentration', band(p.top3Share, 0.3, 0.45, false), P(p.top3Share) + ' of pay to top 3', `Payroll file: ${p.people} people`, 'guide: top 3 earners under ~30% of pay', 'file')
      : c ? row('employees', 'Employee concentration', band(c.top3, 0.3, 0.45, false), P(c.top3) + ' of delivery pay to top 3', `Ledger: ${c.people} people paid as ${PR?.nouns?.workers || PR?.workers || 'delivery staff'}`, 'guide: top 3 under ~30% of delivery pay', 'books')
      : NEED('employees', 'Employee concentration', 'Upload the payroll summary by employee.', 'guide: top 3 earners under ~30% of pay')); }
  // 11 key-person risk
  { const a = ans(S, 'key_person'); U.push(a ? row('keyperson', 'Key-person risk', a.value === 'no' ? 'pass' : 'watch', a.value === 'no' ? 'No single person above 15% of revenue' : 'One person carries more than 15% of revenue', dil(a), 'no one person (besides the seller) carries >15% of revenue; if so, retention terms', 'diligence') : NEED('keyperson', 'Key-person risk', 'Ask: would losing any one person cost more than 15% of revenue?', 'no one person carries >15% of revenue')); }
  // 12 cash conversion: DSO, write-offs, billing model, payroll float. Net 30 is fine; upfront is not required.
  { const parts = [], dso = d.dso, bad = t?.byCat?.bad_debt || 0, badPct = rev ? bad / rev : null;
    if (mix) { const adv = Object.entries(mix.models).filter(([m]) => ['advance', 'cycle'].includes(REVENUE_MODELS[m]?.cash)).reduce((s, [, v]) => s + v, 0); if (mix.specific) parts.push(`billing model from revenue accounts: ${P(adv)} billed in advance or on a recurring cycle`); }
    if (badPct != null && bad > 0) parts.push(`write-offs ${P(badPct)} of revenue`);
    if (mix?.staffing > 0) parts.push(`${P(mix.staffing)} of revenue is contract staffing, paid to workers before clients pay`);
    if (dso != null) {
      let st = band(dso, GUIDES.dso, 90, false); if (st === 'pass' && badPct > 0.02) st = 'watch'; if (st === 'pass' && mix?.staffing > 0.5) st = 'watch';
      U.push(row('cash', 'Cash conversion quality', st, `${Math.round(dso)} days to collect`, `Ledger receivables: about ${Math.round(dso)} days of sales owed on average${parts.length ? '; ' + parts.join('; ') : ''}. Net 30 billing is fine; collecting upfront is not required.`, 'preferably under ~60 days; no payroll float to finance', 'books'));
    } else U.push(NEED('cash', 'Cash conversion quality', `Needs a receivables account in the books (or an A/R aging report)${parts.length ? '. Known so far: ' + parts.join('; ') : ''}.`, 'preferably under ~60 days to collect'));
  }
  // 13 working capital
  U.push(d.wc && rev ? row('wc', 'Working capital', band(d.wc.peg / rev, 0.15, 0.25, false), P(d.wc.peg / rev) + ' of sales', `Ledger: about ${k$(d.wc.peg)} tied up on average (money owed to the firm${d.wc.hasInv ? ' and stock' : ''}${d.wc.hasAP ? ', minus bills owed' : ''})`, 'guide: under ~15% of yearly sales', 'books')
    : NEED('wc', 'Working capital', 'Needs balance-sheet accounts (receivables, payables) in the books.', 'guide: under ~15% of yearly sales'));
  // 14 capex intensity: recorded answer, else depreciation as a stand-in
  { const a = ans(S, 'capex_pct'), da = t?.byCat?.da || 0;
    U.push(a ? row('capex', 'Capex intensity', band(+a.value, GUIDES.capex, 0.05, false), P(+a.value) + ' of revenue', dil(a), 'preferably under ~2–3% of revenue', 'diligence')
      : da > 0 && rev ? row('capex', 'Capex intensity', band(da / rev, GUIDES.capex, 0.05, false), P(da / rev) + ' (depreciation)', 'Ledger depreciation and amortization used as a stand-in for yearly capital spending; confirm with the fixed-asset register', 'preferably under ~2–3% of revenue', 'books')
      : NEED('capex', 'Capex intensity', 'No depreciation in the books. Ask for capital spending by year.', 'preferably under ~2–3% of revenue')); }
  // 15 AI improves vs commoditizes
  { const a = ans(S, 'ai_effect'), cont = mix?.contingent || 0;
    U.push(a ? row('ai', 'AI improves vs commoditizes', { improves: 'pass', mixed: 'watch', commoditizes: 'fail' }[a.value] || 'needs_data', { improves: 'Improves', mixed: 'Mixed', commoditizes: 'Commoditizes' }[a.value], `${dil(a)}. ${SUBSECTORS[sub]?.aiStance || ''}`, 'AI must improve the service, not replace it', 'diligence')
      : sub === 'talent' && cont > 0.5 ? row('ai', 'AI improves vs commoditizes', 'watch', `${P(cont)} success fees`, `Ledger: ${P(cont)} of revenue is contingent success fees, the recruiting work AI pressures most. ${SUBSECTORS.talent.aiStance}`, 'AI must improve the service, not replace it', 'books')
      : NEED('ai', 'AI improves vs commoditizes', `Judge with the seller: which tasks could a client do with AI alone? ${SUBSECTORS[sub]?.aiStance || ''}`.trim(), 'AI must improve the service, not replace it')); }
  // 16–17 entry multiple and debt coverage
  if (D) { U.push(row('multiple', 'Entry multiple', D.multiple <= GUIDES.multiple ? 'pass' : 'watch', `${D.multiple}× real profit`, D.multiple <= GUIDES.multiple ? `Testing ${k$(D.price)}, within AION’s price limit` : `${k$(D.price)} is above AION’s 3.5× limit: pay the extra only as an earnout (paid later, only if profit holds), or bring it to investors as a stated exception`, 'about 3.25× real profit, never above 3.5×', 'deal'));
    if (D.downside.minDscr == null) U.push(row('dscr', 'Debt coverage (DSCR), downside', 'pass', 'No loan', 'Deal model: bought with cash, so there are no loan payments to cover', 'at least 1.25× in a downside year', 'deal'));
    else U.push(row('dscr', 'Debt coverage (DSCR), downside', band(D.downside.minDscr, GUIDES.dscr, 1.0), `${D.downside.minDscr.toFixed(2)}×`, `Deal model: in a year with profit 15% lower, profit covers loan payments ${D.downside.minDscr.toFixed(2)}× at ${(D.rate * 100).toFixed(2)}%`, 'at least 1.25× in a downside year', 'deal')); }
  else { U.push(NEED('multiple', 'Entry multiple', d.unpriceable ? 'Loses money, so it cannot be priced on profit.' : 'Needs the books analyzed.', 'about 3.25× real profit, never above 3.5×')); U.push(NEED('dscr', 'Debt coverage (DSCR), downside', 'Needs a priceable deal.', 'at least 1.25× in a downside year')); }

  const SUB = subsectorChecks({ S, d, PR, mix, sub });
  // avoid-list hits, each with the row that triggered it
  const avoid = [];
  const hit = (k, text) => { const r = [...U, ...SUB].find(x => x.key === k); if (r?.status === 'fail') avoid.push({ text, evidence: r.evidence }); };
  hit('seller', THESIS.avoid[0]); hit('repeat', THESIS.avoid[1]); hit('top1', THESIS.avoid[2]); hit('top5', THESIS.avoid[2]); hit('margin', THESIS.avoid[6]); hit('ai', THESIS.avoid[7]); hit('cert_transferable', THESIS.avoid[8]); hit('temp_mix', 'Temporary-staffing payroll dominates the model'); hit('payroll_float', 'Substantial payroll float or working-capital funding'); hit('employees', THESIS.avoid[3]);
  const all = [...U, ...SUB], counts = Object.fromEntries(['pass', 'watch', 'fail', 'needs_data'].map(s => [s, all.filter(r => r.status === s).length]));
  return { universal: U, subsector: SUB, avoid: avoid.filter((x, i, a) => a.findIndex(y => y.text === x.text) === i), counts, subsectorLabel: SUBSECTORS[sub]?.label || null };
}
function growthOf(d) {
  const t = d.pnl?.TTM, pr = d.priorTTM;
  if (t && pr?.revenue > 0) return { rate: t.revenue / pr.revenue - 1, now: t.revenue, before: pr.revenue, label: 'Last 12 months vs the 12 before (ledger)' };
  const fy = (d.periods || []).filter(p => /^FY/.test(p.key) && !p.partial).map(p => ({ key: p.key, rev: d.pnl[p.key]?.revenue })).filter(x => x.rev > 0);
  if (fy.length >= 2) { const a = fy[fy.length - 2], b = fy[fy.length - 1]; return { rate: b.rev / a.rev - 1, now: b.rev, before: a.rev, label: `${b.key} vs ${a.key}` }; }
  return null;
}
function subsectorChecks({ S, d, PR, mix, sub }) {
  if (!sub || !SUBSECTORS[sub]) return [];
  const o = S.ops || {}, basis = k => S.opsAI?.inputs?.[k]?.basis || '', confirmed = k => S.answers?.['ops:' + k] != null || /from gl/i.test(basis(k));
  const out = [], q = d.quality;
  const askRow = (key, label, qk, fn, guide) => { const a = ans(S, qk); if (!a) return NEED(key, label, `Ask: ${DILIGENCE[qk].q.toLowerCase()}?`, guide); const [st, v] = fn(a.value); return row(key, label, st, v, dil(a), guide, 'diligence'); };
  const pctAsk = (key, label, qk, pass, watch, hi, guide) => askRow(key, label, qk, v => [band(+v, pass, watch, hi), P(+v)], guide);
  const yn = (key, label, qk, good, guide) => askRow(key, label, qk, v => [v === good ? 'pass' : 'watch', DILIGENCE[qk].options.find(x => x[0] === v)?.[1] || v], guide);
  const recurringRow = (key, label) => mix?.specific > 0 ? row(key, label, band(mix.recurring, 0.4, 0.2), P(mix.recurring) + ' recurring', `Ledger revenue accounts: ${Object.entries(mix.models).map(([m, v]) => `${REVENUE_MODELS[m].label} ${P(v)}`).join(', ')}${mix.unspecified > 0.05 ? `; ${P(mix.unspecified)} not split by type` : ''}`, 'guide: 40%+ recurring', 'books') : pctAsk(key, label, 'recurring_share', 0.4, 0.2, true, 'guide: 40%+ recurring');
  for (const k of SUBSECTORS[sub].criteria) {
    switch (k) {
      case 'utilization': out.push(pctAsk(k, 'Utilization', 'utilization', 0.7, 0.6, true, 'guide: 70%+ billable')); break;
      case 'billable_headcount': out.push(o.producers ? row(k, 'Billable headcount', confirmed('producers') ? 'pass' : 'needs_data', `${o.producers} ${PR.workers}`, confirmed('producers') ? (basis('producers') ? S.opsAI.inputs.producers.evidence || 'From the ledger' : 'Confirmed by you') : 'AI estimate from payroll totals; confirm with the seller', 'counted from payroll', confirmed('producers') ? 'books' : 'estimate') : NEED(k, 'Billable headcount', 'Upload payroll or ask for the delivery roster.', 'counted from payroll')); break;
      case 'backlog': out.push(askRow(k, 'Backlog', 'backlog', v => [band(+v, 3, 1), `${+v} months`], 'guide: 3+ months signed')); break;
      case 'repeat_engagements': out.push(q?.repeatShare != null ? row(k, 'Repeat engagements', band(q.repeatShare, GUIDES.repeat, 0.4), P(q.repeatShare), 'Ledger: revenue from clients who also paid in the prior 12 months', 'preferably 60%+', 'books') : NEED(k, 'Repeat engagements', 'Needs client names and two years of books.', 'preferably 60%+')); break;
      case 'project_length': out.push(askRow(k, 'Project length', 'project_length', v => [+v <= 12 ? 'pass' : 'watch', `${+v} months`], 'guide: mostly under 12 months')); break;
      case 'license_dependence': out.push(yn(k, 'License / PE-stamp dependence', 'license_dependence', 'no', 'more than one or two license holders')); break;
      case 'principal_dependence': out.push(yn(k, 'Relationships beyond the founder', 'principal_dependence', 'no', 'relationships spread beyond one or two principals')); break;
      case 'brand_notice': out.push(askRow(k, 'Brand contract notice', 'brand_notice', v => [{ '90': 'pass', '30': 'watch', none: 'fail' }[v] || 'watch', DILIGENCE.brand_notice.options.find(x => x[0] === v)?.[1] || v], 'guide: most brand contracts need 90+ days’ notice')); break;
      case 'retailer_concentration': out.push(pctAsk(k, 'Biggest retailer or marketplace', 'retailer_concentration', 0.5, 0.7, false, 'guide: under half of revenue tied to one retailer or marketplace')); break;
      case 'commission_share': out.push(pctAsk(k, 'Commission vs fixed fee', 'commission_share', 0.5, 0.75, false, 'guide: under half paid as commission on brand sales')); break;
      case 'recurring_cycles': out.push(recurringRow(k, 'Recurring inspection / certification cycles')); break;
      case 'renewal_rate': out.push(pctAsk(k, 'Renewal behavior', 'renewal_rate', 0.85, 0.7, true, 'guide: 85%+ renew')); break;
      case 'regulatory_driver': out.push(askRow(k, 'Regulatory driver', 'regulatory_driver', v => [{ yes: 'pass', partly: 'watch', no: 'watch' }[v], { yes: 'Demand set by regulation', partly: 'Partly', no: 'Discretionary' }[v]], 'demand required by rule or certification')); break;
      case 'cert_transferable': out.push(askRow(k, 'Certification transferability', 'cert_transferable', v => [v === 'yes' ? 'pass' : 'fail', v === 'yes' ? 'Stays with the company' : 'Does not transfer'], 'licenses and accreditations stay with the company')); break;
      case 'project_program_mix': out.push(recurringRow(k, 'Project vs program mix')); break;
      case 'recurring_advisory': out.push(mix?.share ? (mix.share('rev_advisory') + mix.share('rev_recurring') > 0 ? row(k, 'Recurring advisory / retainer mix', band(mix.share('rev_advisory') + mix.share('rev_recurring'), 0.3, 0.15), P(mix.share('rev_advisory') + mix.share('rev_recurring')), 'Ledger: advisory and recurring revenue accounts', 'guide: 30%+ on retainer', 'books') : pctAsk(k, 'Recurring advisory / retainer mix', 'recurring_share', 0.3, 0.15, true, 'guide: 30%+ on retainer')) : pctAsk(k, 'Recurring advisory / retainer mix', 'recurring_share', 0.3, 0.15, true, 'guide: 30%+ on retainer')); break;
      case 'gainshare': out.push(pctAsk(k, 'Gain-share exposure', 'gainshare', 0.2, 0.4, false, 'guide: under 20% of fees at risk')); break;
      case 'customer_dependence': { const top1 = q?.customersTTM >= 3 ? q.top1 : S.extra?.sales?.analysis?.top1; out.push(top1 != null ? row(k, 'Customer dependence', band(top1, GUIDES.top1, 0.35, false), P(top1) + ' top client', 'Same as the universal top-customer check', 'preferably below 20%', 'books') : NEED(k, 'Customer dependence', 'Needs client names on revenue lines.', 'preferably below 20%')); break; }
      case 'support_attach': out.push(pctAsk(k, 'Support attach', 'support_attach', 0.3, 0.15, true, 'guide: 30%+ buy support')); break;
      case 'recurring_services': out.push(recurringRow(k, 'Recurring services')); break;
      case 'overruns': out.push(pctAsk(k, 'Project overruns', 'overruns', 0.15, 0.3, false, 'guide: under 15% of fixed-fee projects')); break;
      case 'change_orders': out.push(yn(k, 'Change-order discipline', 'change_orders', 'yes', 'change orders written and billed')); break;
      case 'vendor_dependence': out.push(pctAsk(k, 'Vendor dependence', 'vendor_dependence', 0.5, 0.8, false, 'guide: under 50% tied to one vendor')); break;
      case 'temp_mix': { const a = ans(S, 'temp_mix'); out.push(mix?.staffing > 0 || (mix?.specific && !a) ? row(k, 'Temp vs direct-hire mix', band(mix.staffing, 0.2, 0.5, false), P(mix.staffing) + ' contract / temp', `Ledger revenue accounts: ${P(mix.staffing)} contract or temporary staffing${mix.staffing > 0.5 ? '; temp payroll dominates, which is outside the thesis' : ''}`, 'guide: temp under ~20%; over 50% is outside the thesis', 'books') : a ? row(k, 'Temp vs direct-hire mix', band(+a.value, 0.2, 0.5, false), P(+a.value) + ' contract / temp', dil(a), 'guide: temp under ~20%', 'diligence') : NEED(k, 'Temp vs direct-hire mix', 'Revenue accounts are not split by type. Ask for revenue by service line.', 'guide: temp under ~20%')); break; }
      case 'payroll_float': { const st = mix?.staffing || 0, f = ans(S, 'payroll_funding');
        if (!mix?.specific && !f) { out.push(NEED(k, 'Payroll float', 'Revenue accounts are not split by type: confirm whether the firm pays contract workers before clients pay.', 'no payroll to finance; if any, a credit line sized to it')); break; }
        if (st <= 0 && f?.value !== 'line' && f?.value !== 'cash' && f?.value !== 'factoring') { out.push(row(k, 'Payroll float', 'pass', 'None', mix?.specific ? 'Ledger: no contract or temporary staffing revenue, so no payroll is paid before clients pay' : dil(f), 'no payroll to finance', mix?.specific ? 'books' : 'diligence')); break; }
        const days = d.dso != null ? Math.max(0, Math.round(d.dso - 7)) : null, funded = f?.value === 'line';
        out.push(row(k, 'Payroll float', st > 0.5 ? 'fail' : funded ? 'watch' : 'fail', `${P(st)} of revenue${days != null ? `, ~${days} days funded` : ''}`, `Contract staff are paid weekly while clients pay in about ${d.dso != null ? Math.round(d.dso) : '?'} days, so the firm finances ${days != null ? `~${days} days of` : ''} payroll. ${f ? dil(f) : 'Funding not recorded yet: ask how payroll is funded.'}`, 'no payroll to finance; if any, a credit line sized to it', 'books'));
        break; }
      case 'payroll_funding': { const f = ans(S, 'payroll_funding'); if (f || !(mix?.staffing > 0)) out.push(f ? row(k, 'Funding needs', { none: 'pass', line: 'watch', cash: 'watch', factoring: 'fail' }[f.value], DILIGENCE.payroll_funding.options.find(x => x[0] === f.value)?.[1], dil(f), 'credit line sized to payroll, or no contract payroll', 'diligence') : row(k, 'Funding needs', 'pass', 'None in the books', 'Ledger: no contract staffing revenue to fund', 'no payroll to fund', 'books')); else out.push(NEED(k, 'Funding needs', 'Ask: how is contract payroll funded (credit line sized to payroll, cash, factoring)?', 'credit line sized to payroll')); break; }
      case 'retained_contingent_mix': { const r = (mix?.retained || 0) + (mix?.share?.('rev_fractional') || 0), c = mix?.contingent || 0; out.push(r + c > 0 ? row(k, 'Retained / contingent mix', c > 0.6 ? 'watch' : 'pass', `${P(r)} retained or engaged · ${P(c)} contingent`, 'Ledger revenue accounts' + (c > 0.6 ? ': mostly success fees, the work AI pressures most' : ''), 'guide: mostly retained or engaged', 'books') : NEED(k, 'Retained / contingent mix', 'Revenue accounts are not split by fee type. Ask for fees by search type.', 'guide: mostly retained or engaged')); break; }
      case 'placements': out.push(o.placements_per_year ? row(k, 'Placements', confirmed('placements_per_year') ? 'pass' : 'needs_data', `${Math.round(o.placements_per_year)} a year`, confirmed('placements_per_year') ? S.opsAI?.inputs?.placements_per_year?.evidence || 'From the ledger' : 'AI estimate from invoices; confirm with the search register', 'from the search register', confirmed('placements_per_year') ? 'books' : 'estimate') : NEED(k, 'Placements', 'Ask for the search register.', 'from the search register')); break;
      case 'fee_per_placement': out.push(o.avg_fee ? row(k, 'Fee per placement', confirmed('avg_fee') ? 'pass' : 'needs_data', k$(o.avg_fee), confirmed('avg_fee') ? S.answers?.['ops:avg_fee'] != null ? 'Confirmed by you' : S.opsAI?.inputs?.avg_fee?.evidence || 'From the ledger' : 'AI estimate from invoices; confirm', 'from invoices and the search register', confirmed('avg_fee') ? 'books' : 'estimate') : NEED(k, 'Fee per placement', 'Ask for fees by search.', 'from invoices')); break;
      case 'recruiter_productivity': out.push(o.placements_per_year && o.producers && confirmed('placements_per_year') && confirmed('producers') ? row(k, 'Recruiter productivity', 'pass', `${(o.placements_per_year / o.producers).toFixed(1)} placements per recruiter a year`, 'Confirmed placements ÷ confirmed recruiters', 'measured from confirmed inputs', 'books') : NEED(k, 'Recruiter productivity', 'Needs confirmed placements and recruiter count (search register and roster).', 'measured from confirmed inputs')); break;
      case 'recruiter_concentration': { const c = d.payConcentration; const a = ans(S, 'recruiter_concentration'); out.push(a ? row(k, 'Recruiter concentration', band(+a.value, 0.3, 0.5, false), P(+a.value) + ' by top recruiter', dil(a), 'guide: top recruiter under ~30% of placements', 'diligence') : c ? row(k, 'Recruiter concentration', band(c.top1, 0.3, 0.5, false), P(c.top1) + ' of recruiter pay to one person', `Ledger: ${c.people} people paid as recruiters (pay used as a stand-in for production)`, 'guide: top recruiter under ~30%', 'books') : NEED(k, 'Recruiter concentration', 'Ask for placements by recruiter.', 'guide: top recruiter under ~30%')); break; }
    }
  }
  return out;
}

// ---------- AION tool fit: which reusable modules apply to this company, and why ----------
const LV = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW', needs: 'NEEDS DATA' };
/** Evidence-driven: diligence answers and the books. Without evidence, NEEDS DATA, never a guess. */
export function toolFit({ S, d, profile: PR }) {
  const sub = PR?.subsector, SS = SUBSECTORS[sub], t = d.pnl?.TTM, rev = t?.revenue || 0, q = d.quality, F = d.flow, out = [];
  const A = k => ans(S, k), lead = A('lead_source'), crm = A('crm');
  const fit = (key, level, reason, play, extra = {}) => out.push({ key, module: TOOLKIT[key === 'search_customers' ? 'search' : key]?.name || key, level, label: LV[level], reason, play, status: TOOLKIT[key === 'search_customers' ? 'search' : key]?.status, ...extra });
  // Proprietary Search, pointed at customers
  { const mk = rev ? (t.byCat?.marketing || 0) / rev : null, newShare = F && rev ? F.freshRevenue / rev : null, ev = [];
    if (lead) ev.push(dil(lead).replace('From diligence', `New business: ${DILIGENCE.lead_source.options.find(x => x[0] === lead.value)?.[1]}`));
    if (crm) ev.push(`CRM: ${DILIGENCE.crm.options.find(x => x[0] === crm.value)?.[1].toLowerCase()}`);
    if (mk != null && rev) ev.push(`marketing is ${(mk * 100).toFixed(1)}% of revenue in the ledger`);
    if (newShare != null) ev.push(`new clients brought ${P(newShare)} of revenue in the second half of the books`);
    const level = lead ? (lead.value === 'founder' ? 'high' : lead.value === 'mix' ? (crm?.value === 'none' ? 'high' : 'medium') : 'low') : 'needs';
    fit('search_customers', level, level === 'needs' ? `Ask where new business comes from.${ev.length ? ' Known so far: ' + ev.join('; ') + '.' : ''}` : ev.join('; '),
      SS ? `Customer search: find ${SS.buyers}, using signals such as ${SS.triggers}.` : 'Customer search for the firm’s best-fit buyers, with timing signals.',
      { objective: clientObjective(sub, PR) }); }
  // RFP / Proposal Engine
  { const a = A('rfp_share'), pr = A('proposal_process'), base = SS?.rfp;
    const level = a ? (+a.value >= 0.25 ? (pr?.value === 'system' ? 'medium' : 'high') : +a.value >= 0.1 ? 'medium' : 'low') : 'needs';
    fit('rfp', level, a ? `${P(+a.value)} of new revenue comes through formal RFPs or proposals${pr ? `; assembled ${DILIGENCE.proposal_process.options.find(x => x[0] === pr.value)?.[1].toLowerCase()}` : ''}. ${dil(a)}` : `Ask what share of new revenue comes through RFPs or written proposals.${base === 'high' ? ` Common in ${SS.short}.` : ''}`,
      'Proposal copilot: retrieve prior responses, case studies, pricing language and qualifications; draft the response; quote every requirement word for word; flag unsupported claims; route to a senior expert for approval; track win/loss.'); }
  // Document Automation
  { const n = A('deliverables'), h = A('deliverable_hours'), hours = n && h ? +n.value * +h.value : null;
    const level = hours == null ? 'needs' : hours >= 40 ? 'high' : hours >= 10 ? 'medium' : 'low';
    const w = SS?.workflows?.reporting;
    fit('docs', level, hours == null ? 'Ask how many repetitive written deliverables the team produces a month, and the expert hours each takes.' : `About ${Math.round(hours)} expert hours a month on ${+n.value} repetitive deliverables (${dil(n)})`,
      sub === 'talent' ? 'Candidate write-ups and client status reports drafted from the search record; every claim quoted from the source; a partner approves.' : w ? `${w.title}: ${w.steps.join('; ')}. Numbers and findings stay deterministic, copied from the source files.` : 'Deliverable drafting from the firm’s own templates and source files, with a person approving.'); }
  // Knowledge retrieval
  { const a = A('knowledge'); const level = a ? { heads: 'high', drives: 'high', system: 'low' }[a.value] : 'needs';
    fit('research', level, a ? `Knowledge lives: ${DILIGENCE.knowledge.options.find(x => x[0] === a.value)?.[1].toLowerCase()}. ${dil(a)}` : 'Ask where past project knowledge lives (people, files, a system).',
      sub === 'talent' ? 'Candidate and client history search across the database and past searches.' : SS?.workflows ? `${SS.workflows.sourcing.title}; ${SS.workflows.crm.title.toLowerCase()}. Answers always cite the file and page.` : 'Prior-work search across proposals, deliverables and notes, always citing the file.'); }
  // Account intelligence and expansion
  { const a = A('account_plans'), many = q?.customersTTM >= 10;
    const level = a ? (a.value === 'no' ? (many ? 'high' : 'medium') : 'low') : 'needs';
    fit('memory', level, a ? `${a.value === 'no' ? 'No written account plans' : 'Account plans exist'}${q?.customersTTM ? `; ${q.customersTTM} clients billed in the last 12 months` : ''}. ${dil(a)}` : `Ask whether top clients have written account plans.${q?.customersTTM ? ` ${q.customersTTM} clients billed in the last 12 months (ledger).` : ''}`,
      `Top-client watch: every week, re-run research on the top ${Math.min(20, q?.customersTTM || 20)} clients for leadership changes, expansions and new needs; keep every relationship in network memory; one cross-sell list per client.`); }
  // Timing signals
  { const level = lead ? (lead.value !== 'outbound' && crm?.value !== 'consistent' ? 'high' : 'medium') : 'needs';
    fit('signals', level, lead ? `Selling is ${lead.value === 'outbound' ? 'structured' : 'reactive'}${crm ? `; CRM used ${DILIGENCE.crm.options.find(x => x[0] === crm.value)?.[1].toLowerCase()}` : ''}` : 'Ask where new business comes from and how the CRM is used.',
      SS ? `Trigger-based prospecting: ${SS.triggers}. Each signal keeps its link and date.` : 'Trigger-based prospecting from news, job boards and public records.'); }
  // AI workflow layer: seller-confirmed routine hours only
  { const h = S.answers?.['ops:hours'];
    const level = h == null ? 'needs' : h >= 8 ? 'high' : h >= 4 ? 'medium' : 'low';
    fit('workflow', level, h == null ? 'Routine hours are an AI estimate; confirm hours a week each person spends on routine admin (Questions & checks).' : `${h} hours a week per ${PR?.worker || 'person'} on routine admin (confirmed by you)`,
      'Each pilot is a controlled workflow: named inputs, a human approval step, a measured baseline, and an exceptions list.'); }
  // Candidate sourcing
  { const a = A('hiring_bottleneck');
    const level = sub === 'talent' ? 'high' : a ? (a.value === 'yes' ? 'medium' : 'low') : 'needs';
    fit('candidates', level, sub === 'talent' ? 'Sourcing candidates is the core delivery work of a talent firm' : a ? `Hiring ${a.value === 'yes' ? 'is' : 'is not'} a bottleneck to growth. ${dil(a)}` : 'Ask whether hiring qualified people limits growth.',
      sub === 'talent' ? 'Database first: rank the firm’s own past candidates for each new search, then run a candidate search; recruiters decide who to call.' : `Candidate search for hard-to-hire ${PR?.workers || 'roles'}, so growth is not capped by hiring.`); }
  return out;
}
export function clientObjective(sub, PR) {
  const SS = SUBSECTORS[sub];
  if (!SS) return `Find companies that are likely to need what this ${PR?.name || 'firm'} does, with a recent reason to buy, and who decides.`;
  return `Find ${SS.buyers} with a recent reason to buy ${SS.short} (${SS.triggers}), and who decides (${SS.buyerTitles}).`;
}

// ---------- value buckets: BASE + COMMERCIAL + OPERATIONAL + AI PRODUCTIVITY + M&A / ADJACENCY ----------
export const BUCKETS = {
  commercial: { label: 'Commercial improvement', risk: 'Clients push back on price or scope; growth depends on selling capacity.' },
  operational: { label: 'Operational improvement', risk: 'Savings fade without a weekly owner; billing changes can strain client relationships.' },
  ai: { label: 'AI productivity', risk: 'Hours saved only become profit if they turn into more billed work; quality must be checked before anything reaches a client.' },
  mna: { label: 'M&A / adjacency', risk: 'Needs a named target and its books; integration can distract the team; never counted until then.' },
};
/** Which bucket a plan-queue row belongs to. */
export function bucketOf(x, industryLevers = []) {
  if (x.area === 'AI' || x.kind === 'AI' || String(x.id).startsWith('ai') || String(x.id).startsWith('agent_')) return 'ai';
  if (['pricing', 'discounts', 'retention'].includes(x.id)) return 'commercial';
  if (String(x.id).startsWith('ind')) { const l = industryLevers.find(y => y.id === x.id); return l?.driver === 'cost' ? 'operational' : 'commercial'; }
  return 'operational';
}
const DIFF = { none: 'Low', reuse: 'Medium', new: 'High' };
/** rows: the plan queue (priced and not). Returns one summary per bucket; values only from priced rows. */
export function valueBuckets({ d, rows }) {
  const out = { base: { label: 'Base business', value: d.normalization?.normalized ?? null, note: 'Real profit today (normalized EBITDA)' } };
  for (const [k, b] of Object.entries(BUCKETS)) {
    const xs = rows.filter(x => bucketOf(x, d.industryLevers) === k), priced = xs.filter(x => x.priced);
    out[k] = { label: b.label, risk: b.risk, items: xs.map(x => x.title), counted: priced.length,
      value: priced.length ? priced.reduce((t, x) => t + x.value, 0) : null,
      difficulty: priced.length ? DIFF[priced.map(x => x.build).sort((a, b) => ['none', 'reuse', 'new'].indexOf(b) - ['none', 'reuse', 'new'].indexOf(a))[0]] : xs.length ? DIFF[xs[0].build] || '—' : '—',
      weeks: priced.length ? Math.max(...priced.map(x => (x.weeks || 0))) + 13 : null,
      investment: priced.length ? priced.reduce((t, x) => t + (x.cost || 0), 0) : null,
      confidence: priced.length ? [...new Set(priced.map(x => x.sure))].join(', ') : 'Needs data',
      why: k === 'ai' ? 'Not counted until hours are tracked for a month' : k === 'mna' ? 'Not counted: needs a named add-on target and its books' : priced.length ? '' : 'Needs data from the books or the seller to size' };
  }
  return out;
}

// ---------- the company-specific 100-day plan ----------
/** ctx: { S, d, profile, check, fit, rows } — rows is the plan queue. Deterministic; every line names its source. */
export function hundredDays({ S, d, profile: PR, check, fit, rows }) {
  const sub = PR?.subsector, SS = SUBSECTORS[sub], q = d.quality, top = (q?.topCustomers || []).slice(0, 3);
  const P1 = [], P2 = [], P3 = [];
  P1.push({ text: `Seller and new leader meet the top clients together${top.length ? `: ${top.map(c => `${c.name} (${P(c.share || 0)})`).join(', ')}` : ''}`, src: top.length ? 'books' : 'plan' });
  P1.push({ text: `Keep every ${PR?.worker || 'expert'}: no changes to pay or titles; retention terms for key people`, src: 'thesis' });
  const wfs = SS?.workflows ? Object.values(SS.workflows).slice(0, 4).map(w => w.label.toLowerCase()) : sub === 'talent' ? ['search research', 'candidate sourcing', 'client reporting', 'billing'] : ['quoting', 'scheduling', 'customer updates', 'billing'];
  P1.push({ text: `Map the main workflows with the team and time them for two weeks: ${wfs.join(', ')}`, src: 'thesis' });
  const base = [d.dso != null ? `days to collect ${Math.round(d.dso)}` : null, q?.top5 != null ? `top-5 share ${P(q.top5)}` : null, q?.repeatShare != null ? `repeat revenue ${P(q.repeatShare)}` : null].filter(Boolean);
  P1.push({ text: `Baseline metrics${base.length ? ` from the books: ${base.join(', ')}` : ''}; add ${sub === 'talent' ? 'searches per recruiter and time to shortlist' : sub === 'engineering' || sub === 'implementation' ? 'utilization and backlog' : sub === 'compliance' || sub === 'testing' ? 'renewal rate and on-time inspections' : 'win rate and turnaround'}`, src: base.length ? 'books' : 'plan' });
  const needs = [...(check?.universal || []), ...(check?.subsector || [])].filter(r => r.status === 'needs_data').slice(0, 3);
  if (needs.length) P1.push({ text: `Close the open questions: ${needs.map(r => r.label.toLowerCase()).join(', ')}`, src: 'thesis check' });
  // days 31–60: the easiest priced commercial and operating moves, then the commercial engine if it fits
  const nonAI = (rows || []).filter(x => x.priced && bucketOf(x, d.industryLevers) !== 'ai').slice(0, 3);
  for (const x of nonAI) P2.push({ text: `${x.title} (+${k$(x.value)} a year; ${x.sure.toLowerCase()})`, src: 'plan queue' });
  if (!nonAI.length) P2.push({ text: 'No operating move is sized from the data yet: start with billing discipline and a written price list, measured from the books', src: 'plan' });
  const sc = fit?.find(f => f.key === 'search_customers'), mem = fit?.find(f => f.key === 'memory');
  if (sc && ['high', 'medium'].includes(sc.level)) P2.push({ text: `Commercial engine: CRM fields agreed, account plans for the top ${Math.min(10, q?.customersTTM || 10)} clients, and the first customer search (${sc.play})`, src: 'tool fit' });
  else if (mem && ['high', 'medium'].includes(mem.level)) P2.push({ text: 'Commercial engine: account plans and a weekly watch on the top clients', src: 'tool fit' });
  // days 61–100: pilot 1–3 AI workflows chosen by fit; NEEDS DATA becomes "pilot only if days 0–30 confirm it"
  const order = { high: 0, medium: 1, needs: 2, low: 3 };
  const pilots = (fit || []).filter(f => ['rfp', 'docs', 'research', 'workflow', 'candidates'].includes(f.key) && f.level !== 'low').sort((a, b) => order[a.level] - order[b.level]).slice(0, 3);
  for (const f of pilots) P3.push({ text: `Pilot: ${f.play}${f.level === 'needs' ? ' (only if days 0–30 confirm the need)' : ''}`, src: f.level === 'needs' ? 'needs data' : 'tool fit', level: f.label });
  P3.push({ text: 'Measure each pilot against the day-30 baseline; keep only what moves a number', src: 'thesis' });
  return { phases: [{ window: 'Days 0–30', goal: 'Understand workflows, customers, team, financials and baseline metrics', items: P1 }, { window: 'Days 31–60', goal: 'Low-risk commercial and operating improvements', items: P2 }, { window: 'Days 61–100', goal: 'Pilot 1–3 high-return AI and automation workflows', items: P3 }], philosophy: THESIS.philosophy };
}

// ---------- why this business is worth more under AION ----------
export function whyAion({ S, d, profile: PR, check, fit }) {
  const sub = PR?.subsector, SS = SUBSECTORS[sub], lines = [];
  const strong = (fit || []).filter(f => f.level === 'high');
  for (const f of strong) lines.push({ text: `${f.module} (${STATUS[f.status]}): ${f.reason}`, evidence: true });
  if (['supply_chain', 'engineering'].includes(sub) || (sub === 'talent' && /supply|logist|manufactur|warehouse|operations|plant|industrial/i.test(PR?.name || '')))
    lines.push({ text: 'Customer understanding: AION’s principal has worked with manufacturers, warehouses, logistics and procurement for years. That is commercial context and network adjacency, not technical delivery: the firm’s experts keep the expert work.', evidence: false });
  const pass = [...(check?.universal || [])].filter(r => r.status === 'pass').length, need = (check?.counts?.needs_data) || 0;
  const verdict = strong.length ? `${strong.length} AION module${strong.length === 1 ? '' : 's'} fit this company strongly, based on recorded evidence.` : 'No AION module is shown to fit strongly yet: record the diligence answers (proposals, deliverables, lead sources, CRM). Until then this is a buy on its own numbers only.';
  return { verdict, lines, summary: `${pass} thesis checks pass; ${need} still need data.`, experts: `The ${PR?.workers || 'experts'} keep doing the expert work; AION adds the commercial engine, operating system and technology around them.` };
}

/** Public-evidence search criteria shared by every acquisition search; the AI adds niche-specific ones. */
export function searchCriteria(mode, { sub, objective }) {
  const temp = /\b(temp|temporary|light[- ]industrial|warehouse staffing|labor staffing|staffing agenc)/i.test(objective || '');
  const out = [];
  if (mode === 'target') {
    // temp staffing pays workers before clients pay: judged on payroll float. Everyone else on cash conversion, Net 30 included.
    out.push(temp ? { key: 'cash_health', label: 'No payroll-float trap: contract payroll funded by a credit line sized to it, steady clients, no sign of collection trouble', weight: 2 }
      : { key: 'cash_conversion_quality', label: sub === 'talent' ? 'Healthy cash conversion: retainers or engaged fees billed as work progresses, not mainly success fees' : 'Healthy cash conversion: repeat clients billed regularly (Net 30 is fine), no sign of slow collections or payroll float', weight: 2 });
    out.push({ key: 'aion_edge', label: 'Has work AION’s tools improve: formal proposals or RFPs, repeat reports, or referral-only selling', weight: 1 });
  }
  return out;
}
