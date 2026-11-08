// Profit levers for an ecommerce consulting firm (retail placement, marketplace agency, strategy & analytics).
// Every number comes from the uploaded books, an uploaded file or a diligence answer. A lever with no data to size it is
// listed with what it needs, at $0: nothing here is guessed. Only a lever measured straight from the books is counted.
import { CATEGORIES, rowValue, r2 } from './model.mjs';

const inP = (r, p) => { const m = String(r.date).slice(0, 7); return m >= p.from && m <= p.to; };
const k$ = v => (v < 0 ? '−' : '') + (Math.abs(v) >= 1e6 ? '$' + (Math.abs(v) / 1e6).toFixed(2) + 'M' : '$' + Math.round(Math.abs(v) / 1000) + 'K');
const P = v => Math.round(v * 100) + '%';
const RETAINER = ['rev_recurring', 'rev_retained'], PROJECT = ['rev_project', 'rev_advisory', 'rev_sales'];

/**
 * @param ttm      pnl() of the last 12 months
 * @param rows     ledger rows (empty for PDF statements)
 * @param mapping  account → category
 * @param per      periods() result (per.ttm.from/to)
 * @param quality  quality() result (fee-revenue clients), or null
 * @param S        deal state (diligence answers, payroll file)
 */
export function ecomLevers({ ttm, rows = [], mapping = {}, signMode, per, quality, S = {} }) {
  const out = [], fee = ttm.netRevenue ?? ttm.revenue, b = ttm.byCat || {};
  if (!(fee > 0)) return out;
  const margin = fee ? (fee - (ttm.netDirect ?? ttm.direct)) / fee : 0; // what a dollar of fees leaves after the cost of doing the work

  // 1. Pass-through ad spend: billed to clients at cost. If the firm pays out more than it bills, the gap is lost profit.
  { const billed = b.rev_passthrough || 0, paid = b.cos_passthrough || 0;
    if (billed > 0 || paid > 0) {
      const short = paid > billed && billed > 0 ? r2(paid - billed) : 0;
      out.push({ id: 'ecom_passthrough', title: 'Bill clients for all the ad spend paid on their behalf', counted: short > 0, value: short, sure: short > 0 ? 'From the books' : 'Not counted',
        facts: [`Billed to clients at cost: ${k$(billed)}`, `Paid out for clients: ${k$(paid)}`, `Fees without pass-through: ${k$(fee)} (${P(fee / ttm.revenue)} of the books’ sales)`],
        basis: short > 0 ? `Books: ${k$(paid)} of client ad spend paid out vs ${k$(billed)} billed back over the last 12 months; the ${k$(short)} gap is profit the firm is giving away.`
          : billed > 0 && !paid ? 'Pass-through revenue is in its own account, but what was paid out for clients is not: sort that cost into “Pass-through costs” to check none goes unbilled.'
          : paid > 0 && !billed ? 'Ad spend paid for clients is in the books, but no matching pass-through revenue: ask whether it is billed inside fees, then sort the accounts.'
          : `Billed at or above cost (${k$(billed)} billed, ${k$(paid)} paid): nothing to recover.`,
        steps: ['Bookkeeper: list every client ad account the firm pays for, with last month’s spend', 'Account leads: match each to the invoice that bills it back', 'Owner: bill anything unmatched and add a clause that ad spend is billed at cost within 30 days'],
        kpis: ['Ad spend paid vs billed back, monthly', 'Days between paying and billing'] });
    } }

  // 2. Retainers: monthly fees are steadier than one-off projects. Clients who keep buying projects are the ones to convert.
  { const ret = RETAINER.reduce((t, k) => t + (b[k] || 0), 0), proj = PROJECT.reduce((t, k) => t + (b[k] || 0), 0);
    const facts = [], named = rows.length && per;
    let cands = [], candRev = 0;
    if (named) {
      const by = {};
      for (const r of rows) { const c = mapping[r.account], who = r.client || r.name; if (!who || !inP(r, per.ttm) || CATEGORIES[c]?.group !== 'revenue') continue;
        const x = by[who] ??= { ret: 0, proj: 0, months: new Set() }, v = rowValue(r, c, signMode);
        if (RETAINER.includes(c)) x.ret += v; else if (PROJECT.includes(c)) { x.proj += v; if (v > 0) x.months.add(r.date.slice(0, 7)); } }
      cands = Object.entries(by).filter(([, x]) => x.ret <= 0 && x.proj > 0 && x.months.size >= 3).sort((p, q) => q[1].proj - p[1].proj);
      candRev = cands.reduce((t, [, x]) => t + x.proj, 0);
    }
    if (ret + proj > 0) {
      facts.push(`Retainers: ${k$(ret)} (${P(ret / (ret + proj))} of retainer and project fees)`, `Projects: ${k$(proj)}`);
      if (cands.length) facts.push(`${cands.length} client${cands.length === 1 ? '' : 's'} bought projects in 3+ separate months with no retainer: ${k$(candRev)} of fees`);
      out.push({ id: 'ecom_retainer', title: 'Move repeat project clients onto monthly retainers', counted: false, value: 0, sure: 'Not counted', facts,
        basis: cands.length ? `Books: ${cands.slice(0, 3).map(([n]) => n).join(', ')}${cands.length > 3 ? ` and ${cands.length - 3} more` : ''} keep buying projects. Moving them to retainers makes revenue steadier; it is not counted as extra profit because the books can’t show the margin of a retainer vs a project.`
          : named ? 'No client bought projects in 3 or more separate months without a retainer: nothing obvious to convert.' : 'Needs client names on revenue lines (a ledger, not PDF statements) to find repeat project clients.',
        steps: ['Owner: list clients who bought 3+ projects in the last year', 'Account lead: propose a monthly scope that covers the usual work at the same yearly spend', 'Owner: approve each proposal and track renewals'],
        kpis: ['Share of fees on retainer', 'Retainer renewals'] });
    } else out.push({ id: 'ecom_retainer', title: 'Move repeat project clients onto monthly retainers', counted: false, value: 0, sure: 'Not counted', facts: [], basis: 'Revenue is not split into retainer and project accounts. Sort the revenue accounts (Real profit, step 1) to see the split.', steps: [], kpis: ['Share of fees on retainer'] });
  }

  // 3. Utilisation: billable time over paid time. The books show only what the delivery team costs per dollar of fees;
  // the billable share needs timesheets (or the seller's answer), and sizing a gain would need a benchmark we don't have.
  { const team = (b.comp_producers || 0) + (b.cos_contractors || 0), u = S.diligence?.utilization?.value;
    const facts = []; if (team > 0) facts.push(`Delivery team and contractors cost ${k$(team)}: ${P(team / fee)} of fees ($${(fee / team).toFixed(2)} of fees per $1 of delivery pay)`);
    if (u != null) facts.push(`Seller says ${P(u)} of the team’s time is billable`);
    out.push({ id: 'ecom_utilisation', title: 'Raise billable time on the delivery team', counted: false, value: 0, sure: 'Not counted', facts,
      basis: team > 0 ? `Not counted: needs timesheets (billable hours by person) to measure how much paid time is not billed${u != null ? '; the seller’s answer alone is not enough to size it' : ''}.` : 'Sort delivery pay and contractors into their own accounts to see what the team costs per dollar of fees.',
      steps: ['Ask the seller for 3 months of timesheets or hours by client', 'Compare billable hours with paid hours for each person', 'Rebalance accounts so nobody is under 70% billable'],
      kpis: ['Billable share of paid hours', 'Fees per $1 of delivery pay'] });
  }

  // 4. Client concentration: a risk to the price, measured from fee revenue by client (pass-through left out).
  if (quality?.topCustomers?.length) {
    const top = quality.topCustomers[0], atRisk = r2(top.revenue * margin);
    out.push({ id: 'ecom_concentration', title: `Lower dependence on the largest client`, counted: false, value: 0, sure: 'Not counted', risk: atRisk,
      facts: [`Largest client: ${P(top.share)} of named fees`, `Top 5: ${P(quality.top5)}`, `If the largest client left: about ${k$(atRisk)} less profit a year (${k$(top.revenue)} of fees × ${P(margin)} kept after delivery costs)`],
      basis: `A risk, not a gain: ${P(top.share)} of fees come from one client. If they left, profit would fall by about ${k$(atRisk)} a year. Worth an earnout or a longer contract with them before closing.`,
      steps: ['Before closing: read the largest client’s contract (term, notice, change-of-control)', 'Ask for a call with that client during diligence', 'After closing: win new clients so none is over 20% of fees'],
      kpis: ['Largest client’s share of fees', 'Top 5 share'] });
  }
  return out;
}
