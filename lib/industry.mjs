// Industry profiles. The thesis (lib/thesis.mjs) defines the subsectors; this turns a deal's stored industry into the
// words, workflows and prompts the rest of the product uses. Old deals store only kind 'staffing' | 'general':
// 'staffing' maps to Talent Services (the original search-firm wording, unchanged); 'general' is matched to a subsector
// from its name, or stays the general profile when it fits none.
import { SUBSECTORS, THESIS, subsectorOf, kindFor, detectSubsector, revenueMix } from './thesis.mjs';
const TALENT = /search|recruit|staffing|talent|headhunt|placement/i;
export const kindOf = name => TALENT.test(name || '') ? 'staffing' : 'general';
export { detectSubsector };

const RULES = 'Rules: work only with local files in this folder; never send email or messages, contact customers, or change any external system; everything you produce is a draft for a person to review.';

const GENERAL = {
  workflows: {
    research: 'Quotes, estimates and research', sourcing: 'Scheduling and coordination', outreach: 'Customer emails and follow-up',
    crm: 'Data entry and notes', reporting: 'Reports and updates for customers', backoffice: 'Invoicing, collections and bookkeeping',
  },
  aiTitles: {
    research: 'AI drafts quotes and estimates', sourcing: 'AI helps plan the schedule', outreach: 'Faster customer emails and follow-up',
    crm: 'Notes and records update themselves', reporting: 'Customer updates written for you', backoffice: 'Billing and collections follow-up',
  },
  aiSteps: {
    research: ['Collect 20 past quotes as examples', 'AI drafts each new quote from the request', 'A manager checks and sends it'],
    sourcing: ['Write down the scheduling rules', 'AI proposes next week’s schedule', 'A manager approves any change'],
    outreach: ['Approve message templates', 'AI drafts replies and follow-ups', 'Staff edit and send every message'],
    crm: ['Agree what every customer record must show', 'AI turns notes and calls into record updates', 'A person approves every update'],
    reporting: ['Agree a standard customer update', 'AI drafts it from job records', 'A manager reviews and sends it'],
    backoffice: ['List what gets billed and when', 'AI flags unbilled work and late payments', 'The office manager approves every invoice and reminder'],
  },
  prompts: (key, c) => ({
    research: [['One-time setup', `Set up a quoting workspace for our ${c.industry}. Create folders inputs/requests, inputs/past_quotes, outputs/quotes. Write a script that reads a customer request and our past quotes and drafts a new quote: scope, line items, price and the past quote each line is based on. ${RULES}`],
      ['Each request', `Read inputs/requests/<REQUEST_ID>.md and the past quotes in inputs/past_quotes. Draft a quote in outputs/quotes/<REQUEST_ID>.md using our standard prices. Flag anything priced below standard. Do not invent prices. ${RULES}`]],
    sourcing: [['One-time setup', `From inputs/schedule_rules.md and last month's schedule in inputs/schedule.csv, write a script that proposes next week's schedule for our ${c.industry}: who does what, when, with travel time. ${RULES}`],
      ['Weekly', `Using inputs/open_jobs.csv and inputs/staff_availability.csv, draft next week's schedule in outputs/schedule_draft.csv and list conflicts in outputs/conflicts.md. A manager approves changes. ${RULES}`]],
    outreach: [['One-time setup', `Create approved customer message templates (quote follow-up, appointment reminder, thank-you, overdue job) from the examples in inputs/message_examples/. Save them in templates/. ${RULES}`],
      ['Daily', `For each open quote in inputs/open_quotes.csv older than 3 days, draft a follow-up using templates/. Save drafts to outputs/followups.md for staff to edit and send. ${RULES}`]],
    crm: [['One-time setup', `Define the fields every customer record must keep current (status, last contact, next step, notes). Write a script that turns notes in inputs/notes/ into updates matching those fields, as a CSV for review. ${RULES}`],
      ['Weekly', `Process this week's notes in inputs/notes/. Produce outputs/record_updates.csv (record, field, new value, source note) and outputs/stale_records.md for customers with no contact in 30 days. ${RULES}`]],
    reporting: [['One-time setup', `Create a customer update template for our ${c.industry}: work done, next steps, open issues. Save it as templates/customer_update.md. ${RULES}`],
      ['Weekly', `Using inputs/jobs.csv, draft an update for each active customer in outputs/updates/<CUSTOMER>.md. A manager reviews and sends. Never include another customer's information. ${RULES}`]],
    backoffice: [['One-time setup', `From inputs/jobs.csv and inputs/invoices.csv, build a list of finished work not yet invoiced, and an aging of unpaid invoices from inputs/ar_export.csv. ${RULES}`],
      ['Weekly', `List finished work not yet invoiced and invoices more than 15 days late, each with a suggested reminder, in outputs/billing_actions.md for the office manager to approve. ${RULES}`]],
  }[key] || []),
};

export function profile(S) {
  const sub = subsectorOf(S?.industry), SS = SUBSECTORS[sub];
  // a stored kind always wins, so an old deal reads exactly as it did; a new deal's kind follows its subsector
  const kind = S?.industry?.kind || (sub ? kindFor(sub) : 'general');
  const name = S?.industry?.name || (sub ? SS.short.replace(/ services$/, ' firm') : 'business');
  const base = { kind, subsector: sub, subsectorLabel: SS?.label || null, sector: THESIS.sector, inThesis: !!sub, name, margin: S?.industry?.margin || null,
    revenueModels: S?.industry?.revenueModels || [], delivery: S?.industry?.delivery || SS?.delivery || '' };
  if (kind === 'staffing') return { ...base, subsector: sub || 'talent', subsectorLabel: SUBSECTORS.talent.label, inThesis: true, workers: 'recruiters', worker: 'recruiter', jobs: 'searches', job: 'search', customers: 'clients', paidWork: 'run searches', workflows: null };
  if (SS?.workflows) return { ...base, ...SS.nouns, workflows: Object.fromEntries(Object.entries(SS.workflows).map(([k, w]) => [k, w.label])) };
  return { ...base, workers: 'front-line staff', worker: 'staff member', jobs: 'jobs', job: 'job', customers: 'customers', paidWork: 'do the paid work', workflows: GENERAL.workflows };
}
/** Playbook content for a workflow key: titles, steps and prompts from the subsector, else the general profile. */
export function workflowPlay(PR, key, c) {
  const W = SUBSECTORS[PR?.subsector]?.workflows?.[key];
  if (W) return { title: W.title, steps: W.steps, prompts: [['One-time setup', `${W.setup} ${RULES}`], [W.run[0], `${W.run[1]} ${RULES}`]] };
  return { title: GENERAL.aiTitles[key], steps: GENERAL.aiSteps[key], prompts: GENERAL.prompts(key, c) };
}
export const GENERAL_PROFILE = GENERAL;
export { revenueMix };
