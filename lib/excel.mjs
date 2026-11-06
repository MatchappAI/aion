// Excel workbook for lenders, sponsors and quality-of-earnings reviews. Every number is a real number cell, not text.
import * as XLSX from 'xlsx';
import { dealReturns, VEHICLES } from './model.mjs';

const $ = '$#,##0;[Red]-$#,##0', PCT = '0.0%', X = '0.00"x"';
function sheet(rows, widths, fmts = {}) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  for (const [ref, cell] of Object.entries(ws)) {
    if (ref[0] === '!' || typeof cell.v !== 'number') continue;
    const col = XLSX.utils.decode_cell(ref).c, f = fmts[col];
    if (f) cell.z = f;
  }
  return ws;
}

export function buildWorkbook({ S, d, rows, profile, actions }) {
  const n = d.normalization, L = d.levers, t = d.pnl.TTM, a = S.assumptions;
  const D = d.deal || { price: 0, multiple: a.entry_multiple, base: { net: { moic: 0, irr: 0 } }, downside: { minDscr: 0 }, senior: 0, seller: 0, equity: 0, rate: 0 };
  const wb = XLSX.utils.book_new();
  const title = [`${S.name || S.file.name} · ${profile.name}`], period = [`Last 12 months: ${d.periods?.find(p => p.key === 'TTM')?.from} to ${d.periods?.find(p => p.key === 'TTM')?.to}`];
  const credit = ['Made by Mohil Gupta · Proprietary · AION'];

  const sum = sheet([title, period, credit, [],
    ['', 'Amount'], ['Sales, last 12 months', t.revenue], ['Profit the seller reports (EBITDA)', n.reported], ['Real profit (adjusted EBITDA)', n.normalized],
    ['Could grow to, if the actions work', d.proForma], ['Added profit a year', L.runRate], ['Added company value at the offer multiple', L.runRate * D.multiple], [],
    ['Offer price', D.price], ['Multiple of real profit', D.multiple], ['Each $1 invested becomes (after fees, actions work)', D.base.net.moic], ['Yearly return (after fees, actions work)', D.base.net.irr],
    ['Bad-year loan coverage (profit ÷ loan payments)', D.downside.minDscr], [],
    ['Every number is worked out by software from the company’s own ledger. AI only sorts accounts and flags items.']], [52, 16], { 1: $ });
  for (const [ref, z] of [['B14', X], ['B15', X], ['B16', PCT], ['B17', X]]) if (sum[ref]) sum[ref].z = z;
  XLSX.utils.book_append_sheet(wb, sum, 'Summary');

  const bridge = [title, credit, [], ['Step', 'Amount', 'Based on'], ['Profit the seller reports', n.reported, 'Ledger: sales minus operating costs']];
  if (n.ownerActual) bridge.push(['+ Owner pay taken out', n.ownerActual, 'Ledger accounts sorted as owner pay']);
  if (n.addbacks) bridge.push(['+ Costs a new owner won’t pay (confirmed)', n.addbacks, 'See “One-off costs” tab']);
  if (n.replacement) bridge.push(['− Salary of a hired manager', -n.replacement, 'Assumption you can change']);
  bridge.push(['= Real profit', n.normalized, '']);
  for (const x of actions) bridge.push([`+ ${x.title}`, x.value, x.basis]);
  if (!L.aiSkipped && L.ai) bridge.push(['− AI software and running costs', -(L.six.costs.software + L.six.costs.ongoing), 'Cost estimate']);
  bridge.push(['= Could grow to', d.proForma, '']);
  XLSX.utils.book_append_sheet(wb, sheet(bridge, [48, 16, 60], { 1: $ }), 'Profit bridge');

  const ab = [title, credit, [], ['Item', 'Kind', 'Counted?', 'Yearly amount', 'Why', 'Date', 'Account', 'Payee', 'Memo', 'Ledger amount']];
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const x of S.addbacks || []) {
    ab.push([x.label, x.type, x.accepted ? 'Yes' : 'No, needs proof', x.amount, x.rationale]);
    for (const id of x.ids) { const r = byId.get(id); if (r) ab.push(['', '', '', null, '', r.date, r.account, r.name, r.memo, Math.abs(r.amount)]); }
  }
  XLSX.utils.book_append_sheet(wb, sheet(ab, [40, 12, 16, 14, 50, 12, 28, 24, 36, 14], { 3: $, 9: $ }), 'One-off costs');

  const mo = [title, credit, [], ['Month', 'Sales', 'Gross profit', 'Profit', 'Profit % of sales', 'Customers billed', 'Written off', 'Owed to the company', 'Bills owed', 'Working capital']];
  for (const x of d.monthly || []) mo.push([x.m, x.revenue, x.gross, x.profit, x.revenue ? x.profit / x.revenue : 0, x.customers, x.writeoffs, x.ar, x.ap, x.wc]);
  XLSX.utils.book_append_sheet(wb, sheet(mo, [10, 14, 14, 14, 12, 12, 12, 16, 12, 14], { 1: $, 2: $, 3: $, 4: PCT, 6: $, 7: $, 8: $, 9: $ }), 'Monthly P&L');

  const ac = [title, credit, [], ['#', 'Action', 'Profit a year', 'Company value', 'Owner', 'How sure', 'Days 0–30', 'Days 30–60', 'Days 60–100', 'How you’ll know it worked']];
  actions.forEach((x, i) => ac.push([i + 1, x.title, x.value, x.value * D.multiple, x.owner, x.sure, ...(x.steps || []).slice(0, 3).concat(['', '', '']).slice(0, 3), (x.kpis || []).join('; ')]));
  XLSX.utils.book_append_sheet(wb, sheet(ac, [4, 40, 14, 14, 18, 16, 36, 36, 36, 40], { 2: $, 3: $ }), 'Actions & 100 days');

  const de = [title, credit, [], ['Offer price', D.price], ['Bank loan', D.senior], ['Paid to the seller later', D.seller], ['Investors put in', D.equity], ['Loan rate', D.rate], [],
    ['Type of owner', 'Each $1 becomes (actions work)', 'Yearly return', 'Each $1 (nothing changes)', 'Each $1 (profit −15%)', 'Before fees: each $1', 'Bad-year loan coverage']];
  for (const [k, v] of Object.entries(VEHICLES)) {
    const r = dealReturns(n.normalized, L.runRate, { ...a, vehicle: k, rates: d.rates }, t.revenue);
    de.push([`${v.label} (${v.sub})`, r.base.net.moic, r.base.net.irr, r.none.net.moic, r.downside.net.moic, r.base.moic, r.downside.minDscr]);
  }
  const ws = sheet(de, [36, 22, 14, 22, 20, 18, 20], { 1: $ });
  for (let rI = 10; rI < de.length; rI++) for (const [c, f] of [[1, X], [2, PCT], [3, X], [4, X], [5, X], [6, X]]) { const ref = XLSX.utils.encode_cell({ r: rI, c }); if (ws[ref]) ws[ref].z = f; }
  if (ws.B8) ws.B8.z = PCT;
  XLSX.utils.book_append_sheet(wb, ws, 'Deal returns');

  const src = [title, credit, [], ['What', 'Value', 'Source']];
  if (d.rates) src.push(['Prime rate', d.rates.prime, `Federal Reserve (FRED DPRIME), ${d.rates.date}`]);
  if (d.peer) src.push([`Profit margin, large US companies in ${d.peer.industry}`, d.peer.ebitda, `NYU Stern, Damodaran dataset, ${d.peer.date} (${d.peer.firms} firms)`]);
  for (const m of S.extra?.payroll?.analysis?.market || []) src.push([`US average pay: ${m.label}`, m.market, `US Bureau of Labor Statistics, ${m.year}`]);
  src.push([], ['Assumptions (change them in the tool)', 'Value', ''], ['Price rise on new work', a.pricing_uplift, ''], ['Fewer write-offs', a.writeoff_reduction, ''], ['Salary of a hired manager', S.owner.marketComp, ''], ['Offer multiple (years of profit)', a.entry_multiple, ''], ['Value in year 5', 'Same multiple as the offer', '']);
  XLSX.utils.book_append_sheet(wb, sheet(src, [52, 14, 60], {}), 'Sources & assumptions');

  // AION thesis v3.0 check and tool fit: every row with its status and the evidence behind it
  if (d.aion) {
    const C = d.aion.check, L = { pass: 'PASS', watch: 'WATCH', fail: 'FAIL', needs_data: 'NEEDS DATA' };
    const th = [title, credit, [`Subsector: ${profile.subsectorLabel || 'outside the core subsectors'}`], [], ['Group', 'Criterion', 'Result', 'Value', 'Evidence', 'Guide'],
      ...C.universal.map(r => ['Universal', r.label, L[r.status], r.value, r.evidence, r.guide]), ...C.subsector.map(r => [C.subsectorLabel, r.label, L[r.status], r.value, r.evidence, r.guide]), [],
      ['AION tool fit', 'Tool', 'Fit', 'Status', 'Why (evidence)', 'What we would run'], ...d.aion.fit.map(f => ['', f.module, f.label, f.status === 'now' ? 'EXISTS NOW' : f.status === 'partial' ? 'PARTIALLY EXISTS' : 'NEEDS BUILDING', f.reason, f.play])];
    XLSX.utils.book_append_sheet(wb, sheet(th, [14, 34, 12, 22, 80, 40], {}), 'Thesis check');
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
