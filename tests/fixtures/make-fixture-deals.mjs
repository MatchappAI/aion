// TEST FIXTURES ONLY. Writes four small hand-built test deals into a THROWAWAY workspace for the thesis integration test:
// a Net 30 engineering firm, a compliance/inspection firm, a mixed-revenue supply-chain advisory firm and a temp-staffing
// agency. They are not companies, are never written to demo/workspace, and every name says "Test".
// Usage: node tests/fixtures/make-fixture-deals.mjs <workspace dir>
import fs from 'node:fs'; import path from 'node:path';
import { accountSummary } from '../../lib/gl.mjs';
import { DEFAULT_ASSUMPTIONS } from '../../lib/model.mjs';

const WS = process.argv[2];
if (!WS || path.resolve(WS) === path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../workspace')) { console.error('Give a throwaway workspace directory (never demo/workspace).'); process.exit(1); }
const months = Array.from({ length: 24 }, (_, i) => { const y = 2024 + Math.floor(i / 12), m = (i % 12) + 1; return `${y}-${String(m).padStart(2, '0')}`; });
const day = (m, d) => `${m}-${String(Math.min(d, 28)).padStart(2, '0')}`;

function build({ id, name, industry, revenue, staff, dsoDays, rent = 8000 }) {
  const rows = []; let n = 0;
  const add = (date, account, nm, amount, memo = '') => rows.push({ id: n++, date, account, name: nm, memo, amount: Math.round(amount * 100) / 100 });
  months.forEach((m, i) => {
    for (const [acct, clients] of Object.entries(revenue)) for (const [client, perMonth] of clients) {
      const amt = perMonth * (1 + i * 0.004);
      add(day(m, 5), acct, client, amt, 'Invoice');
      add(day(m, 5), 'Accounts Receivable', client, amt, 'Invoice');
      // paid about dsoDays later
      const pm = months[Math.min(23, i + Math.round(dsoDays / 30))]; if (i + Math.round(dsoDays / 30) <= 23) add(day(pm, 5 + (dsoDays % 30)), 'Accounts Receivable', client, -amt, 'Payment');
    }
    for (const [person, pay] of staff) add(day(m, 15), 'Salaries - Delivery Staff', person, pay / 12, 'Payroll');
    add(day(m, 15), 'Salaries - Admin', 'Test Office Manager', 6000, 'Payroll');
    add(day(m, 15), 'Owner Salary', 'Test Owner', 15000, 'Owner pay');
    add(day(m, 1), 'Rent', 'Test Landlord', rent, 'Rent');
    add(day(m, 10), 'Software', 'Test Software Co', 2500, 'Subscriptions');
    add(day(m, 28), 'Depreciation', '', 1500, 'Depreciation');
  });
  const mapping = Object.fromEntries([...new Set(rows.map(r => r.account))].map(a => [a, { 'Accounts Receivable': 'bs_ar', 'Salaries - Delivery Staff': 'comp_producers', 'Salaries - Admin': 'comp_admin', 'Owner Salary': 'comp_owner', Rent: 'rent', Software: 'software', Depreciation: 'da' }[a] || ({ 'Project Fees': 'rev_project', 'Recurring Programs': 'rev_recurring', 'Advisory Retainers': 'rev_advisory', 'Contract Staffing': 'rev_staffing', 'Placement Fees': 'rev_contingent' }[a])]));
  const S = { name, file: { name: name + '.xlsx', kind: 'gl', stored: 'upload.xlsx', uploadedAt: new Date().toISOString() }, range: { start: '2024-01-01', end: '2025-12-31' }, accounts: accountSummary({ rows }), signMode: 'natural',
    mapping, mappingConfirmed: true, normConfirmed: true, opsConfirmed: true, addbacks: [], vendors: [], flags: [], industry, assumptions: structuredClone(DEFAULT_ASSUMPTIONS), owner: { marketComp: 225000, count: 1, extraOwnerComp: 0 },
    ops: { producers: staff.length, admin_fte: 1, owners: 1, placements_per_year: 120, avg_fee: 25000, commission_rate: 0, hours_per_search: 40, loaded_cost_producer: 120000, hours: { research: 3, sourcing: 2, outreach: 2, crm: 2, reporting: 3, backoffice: 4 } },
    opsAI: { inputs: { producers: { basis: 'from GL', evidence: `${staff.length} people paid as delivery staff in the ledger` } } }, plan: { source: 'library' }, maskNames: true };
  const dir = path.join(WS, 'deals', id); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(S)); fs.writeFileSync(path.join(dir, 'gl.json'), JSON.stringify(rows));
  return id;
}
const staff = k => Array.from({ length: k }, (_, i) => [`Test Expert ${i + 1}`, 95000 + i * 2000]);
const clients = (prefix, k, amt) => Array.from({ length: k }, (_, i) => [`${prefix} Client ${i + 1}`, amt * (1 - i * 0.05)]);
const ids = [
  build({ id: 'dtestengineering', name: 'Test Engineering Co (fixture)', industry: { name: 'civil engineering firm', kind: 'general', subsector: 'engineering', revenueModels: [{ model: 'time_materials', share: 0.8 }] }, revenue: { 'Project Fees': clients('Test Eng', 12, 30000), 'Recurring Programs': clients('Test Eng Retainer', 2, 15000) }, staff: staff(14), dsoDays: 40 }),
  build({ id: 'dtestcompliance', name: 'Test Inspection Co (fixture)', industry: { name: 'fire inspection company', kind: 'general', subsector: 'compliance' }, revenue: { 'Recurring Programs': clients('Test Insp', 20, 14000), 'Project Fees': clients('Test Insp Project', 4, 9000) }, staff: staff(12), dsoDays: 40 }),
  build({ id: 'dtestmixed', name: 'Test Supply Chain Advisory (fixture)', industry: { name: 'supply chain consultancy', kind: 'general', subsector: 'supply_chain' }, revenue: { 'Advisory Retainers': clients('Test SC', 6, 25000), 'Project Fees': clients('Test SC Project', 8, 20000), 'Recurring Programs': clients('Test SC Program', 4, 12000) }, staff: staff(10), dsoDays: 45 }),
  build({ id: 'dtesttemp', name: 'Test Temp Staffing (fixture)', industry: { name: 'staffing agency', kind: 'staffing' }, revenue: { 'Contract Staffing': clients('Test Temp', 10, 60000), 'Placement Fees': clients('Test Perm', 4, 15000) }, staff: staff(8), dsoDays: 55 }),
];
console.log('Wrote test fixture deals:', ids.join(', '));
