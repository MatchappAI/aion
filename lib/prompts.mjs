import { CATEGORIES } from './model.mjs';
import { SUBSECTORS, REVENUE_MODELS } from './thesis.mjs';
const SUBS = Object.entries(SUBSECTORS).map(([k, v]) => `${k} (${v.label})`).join(' | ');
const MODELS = Object.keys(REVENUE_MODELS).join(', ');

const catList = Object.entries(CATEGORIES).map(([k, v]) => `- ${k}: ${v.label}`).join('\n');
const j = o => JSON.stringify(o);

export function classifyPrompt(accounts, industry, peers = []) {
  const rows = accounts.slice(0, 400).map(a => ({ account: a.account, number: a.number, account_type_in_file: a.type, rows: a.count, net_total: a.total, by_year: a.byYear, sample_memos: a.memos, top_names: a.topNames }));
  return `Task: (1) ${industry ? `The user says this business is: ${industry}. Use that.` : 'identify what kind of business this is from its account names, memos and payees (a short plain name, e.g. "commercial HVAC contractor", "dental practice", "executive search firm").'} (2) map every general-ledger account to exactly one category.

Categories:
${catList}

Rules:
- Use the account name first (and the account number/type from the file when given); use memos and names only as supporting evidence.
- Balance-sheet accounts (bank, receivables, payables, loans, equity, accruals) go to bs_cash, bs_ar or bs_other.
- Revenue: a search or recruiting firm uses the search-firm revenue categories; contract or temporary staffing billed by the hour goes to rev_staffing; recurring programs, inspection or certification cycles, retainers and managed services go to rev_recurring; project fees (time and materials, fixed fee, milestones) go to rev_project; advisory work goes to rev_advisory; ad spend, media or samples billed to clients at cost go to rev_passthrough (and the matching spend paid to Amazon, Walmart, retail media or suppliers on clients' behalf goes to cos_passthrough); otherwise rev_sales. Materials, inventory and product costs go to cogs.
- Distinguish pay for staff who do the paid work (recruiters, technicians, consultants, drivers, commissions) from admin payroll and owner compensation only when the account name or names support it; otherwise use the closest general category and lower confidence.
- Partner, principal or managing-director compensation in a search firm is usually paid to people who run searches: map it to comp_producers unless the account explicitly says owner/shareholder/member salary. Misclassifying producers as owners inflates normalized EBITDA, so when in doubt choose comp_producers with confidence below 0.6.
- Accounts named as owner personal, nonrecurring or discretionary are still expenses: map them to the closest expense category (other_opex if unclear); add-backs are handled in a later step.
- If unsure, choose the most defensible category and set confidence below 0.6. Do not skip accounts.

Accounts (JSON, net_total is the signed sum of the Amount column as exported):
${j(rows)}

${peers.length ? `Also give peer_industry: the single closest industry, copied exactly, from this list: ${peers.join(" | ")}.
` : ""}Also give typical_margin: the usual range of yearly operating profit before interest, tax and depreciation, as a share of sales, for small US companies of this kind ($2M–$20M sales), e.g. {"low":0.08,"high":0.15}.

Also give subsector: the single best fit from this list, or "none" if none fits (ecommerce is the buy box: retail placement, marketplace agencies, ecommerce strategy and analytics; the others are kept for older deals): ${SUBS}. Give revenue_models: the ways it is paid that the account names or memos show, each with an approximate share of revenue, from: ${MODELS}; use only what the data supports. Give delivery_model: who does the paid work, in a few words (for example "licensed engineers on client projects").

Return JSON: {"industry":"<short plain name>","talent_firm":true|false,"subsector":"<key or none>","revenue_models":[{"model":"<key>","share":0.0}],"delivery_model":"","typical_margin":{"low":0.0,"high":0.0},"peer_industry":"<exact name from the list>","accounts":[{"account":"<exact name>","category":"<key>","confidence":0.0-1.0,"reason":"<12 words max>"}]}`;
}

export function pdfPrompt(file, peers = []) {
  return `Task: extract the income statement (P&L) from the financial statement PDF at ./${file}. Read the file with the Read tool.

Rules:
- Extract every line item exactly as printed, for every period column. Do not compute or infer values; copy them. Parentheses mean negative.
- For each line give the page number where it appears.
- Classify each line into one category from this list. Use "exclude" for a subtotal or total only when the lines that make it up are also listed (for example Gross Profit, Net Income, Operating Income, or Total Operating Expenses when its parts appear above it). A "Total ..." line that is the only line for that item (for example "Total revenues" with no revenue lines above it, or "Total cost of revenues" on its own) is the item itself: classify it like the item, never "exclude".
${catList}
- Give each period its end date (YYYY-MM-DD) and length in months as stated on the document.
- Depreciation, amortization and goodwill or asset impairment are non-cash: classify them as "da". Interest and income taxes are "interest" and "income_tax".
- unit_multiplier: if the document says amounts are in thousands, return 1000; in millions, 1000000; otherwise 1. Copy the values as printed; software applies the multiplier.

The following are your own judgment, not copied from the page; always fill them in. Say what kind of business this is (industry: a short plain name such as "investment research publisher" or "document management software"), the single best fit for subsector from this list or "none": ${SUBS}, and revenue_models from: ${MODELS}, each with an approximate share, only as the line items support.${peers.length ? ` Give peer_industry: the single closest industry, copied exactly, from this list: ${peers.join(" | ")}.` : ''} Give typical_margin: the usual range of yearly operating profit before interest, tax and depreciation, as a share of sales, for small US companies of this kind, e.g. {"low":0.08,"high":0.15}.

Return JSON: {"company":"<as printed or null>","industry":"","subsector":"<key or none>","revenue_models":[{"model":"<key>","share":0.0}],"peer_industry":"","typical_margin":{"low":0.0,"high":0.0},"unit_multiplier":1,"periods":[{"label":"<as printed>","end":"YYYY-MM-DD","months":12}],"lines":[{"label":"<as printed>","page":1,"category":"<key>","values":{"<period label>":123.45}}],"notes":"<anything that limits reliability>"}`;
}

export function addbackPrompt(ctx, P) {
  return `Task: quality-of-earnings first pass for a ${P.name}. Propose (1) add-back / normalization candidates, (2) vendor and cost opportunities, (3) diligence flags. A human will accept or reject every item; amounts will be computed by software from the rows you point to, so do not state amounts.

Context
- Trailing-twelve-month P&L by category (positive = revenue or expense in its natural direction): ${j(ctx.ttm)}
- Revenue quality: ${j(ctx.quality)}
- Expense lines aggregated by account and payee for the TTM period (top by amount): ${j(ctx.payees)}

Rules
- Review every distinct memo listed; an account named personal, nonrecurring or discretionary deserves one candidate per distinct memo.
- Add-back candidates must be identifiable by an exact account name, optionally narrowed by an exact payee name and/or a memo substring. Only propose items with a concrete reason visible in the data (e.g., personal-looking spend, one-time legal matter, owner family on payroll, non-recurring items). Typical-looking business expenses are not add-backs.
- Owner compensation is handled separately; do not propose owner salary as an add-back unless it sits outside the owner compensation category.
- Vendor opportunities: overlapping tools or subscriptions, suppliers that look expensive for this kind of business, unusually high software or rent relative to revenue. Give a conservative suggested_savings_pct (0-0.5) of that spend and say why.
- Write every label, rationale and flag in plain English a non-technical buyer understands: say ${P.workers} (not producers), customer records (not CRM), days to collect cash (not DSO); no acronyms; no field or variable names (never write words like null, bs_other, rev_*, TTM fields), round dollars (e.g., $575K).
- Flags: customer concentration, revenue decline, refunds or returns, contractor dependence, missing receivables data, anything a lender would ask about for a ${P.name}.

Return JSON:
{"addbacks":[{"label":"","type":"personal|one_time|non_operating|related_party|other","account":"<exact>","payee":"<exact or null>","memo_contains":"<substring or null>","rationale":""}],
 "vendors":[{"label":"","account":"<exact>","payee":"<exact or null>","suggested_savings_pct":0.0,"rationale":""}],
 "flags":[{"severity":"high|medium|low","title":"","detail":""}]}`;
}

export function opsPrompt(ctx, P) {
  const S = P.kind === 'staffing';
  return `Task: infer operating inputs for a ${P.name} from its general ledger, so a person can confirm or correct them. Use evidence from the data. For anything the GL cannot show (hours per task), give a cautious estimate and mark its basis as "estimate (not in GL)".

Evidence
- TTM P&L by category: ${j(ctx.ttm)}
- Revenue stats (TTM): ${j(ctx.revenue)}
- Payroll and contractor payees (TTM totals and number of distinct pay dates): ${j(ctx.payroll)}

Inputs to return (numbers only in "value"):
- producers: full-time-equivalent ${S ? 'recruiters / consultants who run searches' : (P.subsector ? `${P.workers} who do the paid work` : 'front-line staff who do the paid work (technicians, consultants, drivers, sales staff…)')}
- admin_fte: admin and support FTE (excluding owners)
- owners: number of owners working in the business
- placements_per_year: ${S ? 'completed searches or placements' : `${P.subsector ? P.jobs : 'jobs, orders or projects'} completed`} in the TTM
- avg_fee: average revenue per ${S ? 'completed search/placement' : (P.subsector ? P.job : 'job, order or project')} in dollars
- commission_rate: share of extra revenue paid out as variable pay or commission (0-1)
- hours_per_search: ${S ? 'producer' : 'front-line'} hours per ${S ? 'completed search' : P.subsector ? P.job : 'job, order or project'}
- loaded_cost_producer: fully loaded annual cost of one ${S ? 'producer' : P.subsector ? P.worker : 'front-line staff member'}
- ${S ? 'hours.research, hours.sourcing, hours.outreach, hours.crm, hours.reporting: hours per producer per week on search research, candidate sourcing, outreach, CRM notes and client reporting' : `${['research', 'sourcing', 'outreach', 'crm', 'reporting'].map(k => `hours.${k} (${(P.workflows || {})[k] || k})`).join(', ')}: hours per ${P.worker || 'front-line staff member'} per week on each, only the routine admin part`}
- hours.backoffice: hours per admin FTE per week on invoicing, collections and close

Return JSON: {"inputs":{"producers":{"value":0,"basis":"from GL|estimate (not in GL)","evidence":"<short, cite payees/accounts/stats>","confidence":0.0},"admin_fte":{...},"owners":{...},"placements_per_year":{...},"avg_fee":{...},"commission_rate":{...},"hours_per_search":{...},"loaded_cost_producer":{...},"hours.research":{...},"hours.sourcing":{...},"hours.outreach":{...},"hours.crm":{...},"hours.reporting":{...},"hours.backoffice":{...}},"caveats":[""]}`;
}

export function planPrompt(ctx) {
  return `Task: write the value-creation and AI deployment plan for this business, grounded only in the confirmed numbers below. The holdco principle: AI removes repetitive work and increases productivity; experienced people keep specialist judgment, relationships, negotiation, hiring decisions and client accountability. Do not claim AI reduces headcount or creates cash savings unless the confirmed assumptions say so. Do not change any number; refer to them. Write for an investment committee: plain professional English, dollar amounts rounded (e.g., $61K, $0.75M), percentages rounded, and never use internal field names (such as pricingRevenue, avoided_share or ramp values like 0.5) — describe them in words.

Confirmed company numbers: ${j(ctx.company)}
Lever model results (computed by software): ${j(ctx.levers)}
Diligence flags: ${j(ctx.flags)}

For each lever (operating and AI) explain why it applies to THIS company (cite the numbers), the concrete steps, the human checkpoint, the data and tools needed, KPIs to measure before/after, timing, and risks. Keep each lever concise. Do not write prompts here; they are produced separately. Set model_lever to the lever-model result each lever corresponds to (ai for AI workflow levers), and workflow_key to the AI workflow it implements. Fill every field, including first_100_days, not_recommended and questions_for_seller.

Return JSON:
{"summary":"<4 sentences>",
 "levers":[{"key":"","title":"","type":"operating|ai","why":"","steps":[""],"human_gate":"","data_and_tools":"","kpis":[""],"timing":"Days 0-30|Days 30-100|Year 1|Year 2+","risks":"","model_lever":"pricing|writeoffs|vendors|cash_release|ai|none","workflow_key":"research|sourcing|outreach|crm|reporting|backoffice|none"}],
 "first_100_days":[{"window":"Days 0-30","actions":[""]}],
 "not_recommended":[{"idea":"","reason":""}],
 "questions_for_seller":[""]}`;
}

export function leverPromptsPrompt(ctx) {
  return `Task: write ready-to-run prompts that an operator at this business would paste into Claude Code (Claude's agentic CLI that can read and write local files and run scripts) to build or run ONE AI workflow.

Company facts (confirmed): ${j(ctx.company)}
The lever: ${j(ctx.lever)}

Write 2 prompts: (1) a one-time build/setup prompt, (2) a recurring run prompt. Each must name its inputs (files, exports or folders the firm would provide), the exact steps, the output files and format, and the human review step. Use placeholders like <path/to/export.csv> for anything you do not know. Never instruct a prompt to send email or messages, contact candidates, clients or customers, make hiring decisions, or change external systems; outputs are drafts for human review. Keep candidate data handling explicit (local files only, no new third-party uploads).

Return JSON: {"prompts":[{"title":"","when":"One-time setup|Weekly|Per search|Per project|Monthly","prompt":""}]}`;
}

export function industryPrompt(ctx, P, peers = []) {
  return `Task: you are an experienced operating partner for a ${P.name}. Propose the 3 or 4 most effective, industry-specific moves to raise this company's yearly operating profit (EBITDA), based only on its numbers below. Be concrete to this industry and this company. Software will price each move from the ledger, so you choose the lever and a conservative size; do not state dollar results.

Company numbers (last 12 months)
- Revenue accounts and totals: ${j(ctx.revenue)}
- Cost accounts and totals: ${j(ctx.costs)}
- Team and activity estimates: ${j(ctx.ops)}
- Monthly sales and profit: ${j(ctx.monthly)}
- Customers: ${j(ctx.customers)}

Already covered elsewhere, do NOT repeat: a general price rise on all work, billing and collections, overtime, customers paying below normal price, re-bidding suppliers, AI paperwork tools.

Each move uses exactly one driver:
- "price": raise price on specific revenue accounts (pct up to 0.05)
- "cost": cut specific cost accounts (pct up to 0.15)
- "volume": more sales of specific revenue accounts (list them in accounts; units = extra sales a year, at most 25% more than today)

Rules: copy account names exactly from the lists; plain English a non-expert understands; no acronyms; "why" must cite a number from this company; "assumption_why" says why the size is realistic in this industry;  each kpi has today's value from the data (or "measure first") and a target; build is "none" for a process, policy or pricing change with nothing to build, "reuse" when it needs a standard template, checklist or off-the-shelf tool, and "new" only when a custom tool or system must be built; one_time_cost is a realistic dollar cost to set it up (tools, training, outside help) and effort_weeks is the weeks of one person's time it needs.

Steps: write 5 to 7 plain-English instructions a manager could follow on Monday. Each step starts with who does it, says exactly what to do (which report, list, call or document), and ends with the output, e.g. "Office manager: export last year's invoices from QuickBooks, list every client billed below the price list, and send the list to the owner."
${peers.length ? `Also give peer_industry: the single closest industry, copied exactly, from this list: ${peers.join(' | ')}.\n` : ''}
Return JSON: {"peer_industry":"<exact name or empty>","moves":[{"title":"<8 words max>","why":"","driver":"price|cost|volume","accounts":["<exact account name>"],"pct":0.0,"units":0,"assumption_why":"","steps":["","","","",""],"kpis":[{"name":"","today":"","target":""}],"owner":"<role>","one_time_cost":0,"effort_weeks":0,"build":"none|reuse|new"}]}`;
}

export function outsidePrompt(c) {
  return `Task: an outside check on a business a buyer is looking at. Search the web for public information about this exact company and its owner.

Company: ${c.name}
Where: ${c.place || 'not given'}
Kind of business: ${c.industry}

Look for: customer reviews and ratings (Google, Yelp, Better Business Bureau, industry sites), lawsuits or court cases, licenses and their status (for example a state contractor license board), safety or regulator actions, news, and anything a buyer should know.

Rules: include only things you actually found and opened, each with its link. If you are not sure a result is about this same company, leave it out. Never guess. Plain English, one sentence per summary. If you find nothing for a kind of check, list it in "not_found".

Return JSON: {"rating":{"value":0,"count":0,"source":"","url":""},"findings":[{"kind":"reviews|legal|license|safety|news|other","title":"","summary":"","url":"","date":"","tone":"good|bad|neutral"}],"not_found":[""]}`;
}
