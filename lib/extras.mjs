// Optional uploads that add what the ledger can't show: who is paid what (payroll) and who pays what (sales detail).
// Parsing and all math are done by software; nothing here is sent to AI.
import * as XLSX from 'xlsx';

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = v => { if (typeof v === 'number') return v; const s = String(v ?? '').replace(/[$,\s]/g, ''); const neg = /^\(.*\)$/.test(s); const n = parseFloat(s.replace(/[()]/g, '')); return isNaN(n) ? null : neg ? -n : n; };
const median = xs => { const a = xs.filter(x => x != null && !isNaN(x)).sort((p, q) => p - q); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const r0 = v => Math.round(v);

function table(buffer, want, minHits) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
    for (let h = 0; h < Math.min(rows.length, 30); h++) {
      const head = (rows[h] || []).map(norm), col = {};
      for (const [k, pats] of Object.entries(want)) { const i = head.findIndex(c => c && pats.some(p => p.test(c))); if (i >= 0) col[k] = i; }
      if (Object.keys(col).length >= minHits) return { col, rows: rows.slice(h + 1).filter(r => r && r.some(c => c != null && c !== '')) };
    }
  }
  return null;
}

export function analyzePayroll(buffer) {
  const t = table(buffer, {
    name: [/^(employee|name|employee name|worker)$/, /employee/],
    role: [/title|role|position|job|department/],
    total: [/^(total|gross)( pay| wages)?$/, /gross pay|total pay|annual pay|total wages/],
    regular: [/^regular( pay| wages)?$/, /regular pay/],
    ot: [/overtime pay|^ot pay$|^overtime( wages)?$/],
    otHours: [/overtime hours|^ot hours$|ot hrs/],
    hours: [/^(regular )?hours$|total hours|regular hours/],
  }, 2);
  if (!t || t.col.name == null || (t.col.total == null && t.col.regular == null)) throw new Error('Could not find employee and pay columns. Export the QuickBooks “Payroll Summary by Employee” or a staff list with name, job title and pay.');
  const { col, rows } = t;
  const people = rows.map(r => {
    const reg = col.regular != null ? num(r[col.regular]) || 0 : null, ot = col.ot != null ? num(r[col.ot]) || 0 : 0;
    const total = col.total != null ? num(r[col.total]) : (reg || 0) + ot;
    return { name: String(r[col.name] ?? '').trim(), role: col.role != null ? String(r[col.role] ?? '').trim() || 'Unspecified' : 'Unspecified', total: total || 0, ot, otHours: col.otHours != null ? num(r[col.otHours]) || 0 : 0, hours: col.hours != null ? num(r[col.hours]) || 0 : 0 };
  }).filter(p => p.name && !/^total/i.test(p.name) && p.total > 0);
  if (!people.length) throw new Error('The payroll file has no rows with pay.');
  const total = people.reduce((s, p) => s + p.total, 0), otTotal = people.reduce((s, p) => s + p.ot, 0);
  const byRole = {};
  for (const p of people) (byRole[p.role] ??= []).push(p);
  const roles = Object.entries(byRole).map(([role, ps]) => ({ role, count: ps.length, median: r0(median(ps.map(p => p.total))), base: r0(median(ps.map(p => p.total - p.ot))), total: r0(ps.reduce((s, p) => s + p.total, 0)) })).sort((a, b) => b.total - a.total);
  // people paid well above others in the same role (roles with 3+ people)
  const highPaid = [];
  for (const [role, ps] of Object.entries(byRole)) { if (ps.length < 3) continue; const m = median(ps.map(p => p.total)); for (const p of ps) if (p.total > m * 1.25) highPaid.push({ name: p.name, role, total: r0(p.total), above: r0(p.total - m) }); }
  const otPeople = people.filter(p => p.ot > 0).sort((a, b) => b.ot - a.ot);
  const top3 = [...people].sort((a, b) => b.total - a.total).slice(0, 3).reduce((s, p) => s + p.total, 0);
  return { people: people.length, total: r0(total), roles, overtime: { total: r0(otTotal), share: total ? otTotal / total : 0, people: otPeople.length, top: otPeople.slice(0, 3).map(p => ({ name: p.name, ot: r0(p.ot) })) }, highPaid: highPaid.sort((a, b) => b.above - a.above).slice(0, 5), top3Share: total ? top3 / total : 0 };
}

export function analyzeSales(buffer) {
  const t = table(buffer, {
    customer: [/^(customer|client|customer name|name|bill to)$/, /customer|client/],
    item: [/product|service|item|description|sku/],
    qty: [/^(qty|quantity|units)$/],
    rate: [/^(rate|price|unit price|sales price)$/, /unit price/],
    amount: [/^(amount|total|sales|revenue|line total)$/, /amount/],
    date: [/^date$|invoice date|transaction date/],
  }, 3);
  if (!t || t.col.customer == null || t.col.amount == null) throw new Error('Could not find customer and amount columns. Export the QuickBooks “Sales by Customer Detail” or “Sales by Product/Service Detail” report.');
  const { col, rows } = t;
  const lines = rows.map(r => {
    const amount = num(r[col.amount]) || 0, qty = col.qty != null ? num(r[col.qty]) || 1 : 1;
    const rate = col.rate != null ? num(r[col.rate]) : (qty ? amount / qty : null);
    return { customer: String(r[col.customer] ?? '').trim(), item: col.item != null ? String(r[col.item] ?? '').trim() : '', qty, rate, amount, date: r[col.date] };
  }).filter(l => l.customer && !/^total/i.test(l.customer) && l.amount);
  if (!lines.length) throw new Error('The sales file has no customer rows with amounts.');
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const byCust = {};
  for (const l of lines) byCust[l.customer] = (byCust[l.customer] || 0) + l.amount;
  const customers = Object.entries(byCust).sort((a, b) => b[1] - a[1]);
  // same product or service, lower price: customers paying more than 10% under the usual price
  const byItem = {};
  for (const l of lines) if (l.item && l.rate > 0) (byItem[l.item] ??= []).push(l);
  const gaps = {};
  let itemsChecked = 0;
  for (const [item, ls] of Object.entries(byItem)) {
    if (ls.length < 5) continue; itemsChecked++;
    const usual = median(ls.map(l => l.rate));
    for (const l of ls) if (l.rate < usual * 0.9) { const g = (gaps[l.customer] ??= { customer: l.customer, gap: 0, items: new Set(), below: [] }); g.gap += (usual - l.rate) * l.qty; g.items.add(item); g.below.push(1 - l.rate / usual); }
  }
  const under = Object.values(gaps).map(g => ({ customer: g.customer, gap: r0(g.gap), items: [...g.items].slice(0, 3), avgBelow: g.below.reduce((s, x) => s + x, 0) / g.below.length })).filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap);
  const items = Object.entries(lines.reduce((m, l) => (m[l.item || 'Other'] = (m[l.item || 'Other'] || 0) + l.amount, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([item, amount]) => ({ item, amount: r0(amount) }));
  return { lines: lines.length, total: r0(total), customers: customers.length, top1: total ? customers[0][1] / total : 0, top5: total ? customers.slice(0, 5).reduce((s, c) => s + c[1], 0) / total : 0, topCustomers: customers.slice(0, 5).map(([c, v]) => ({ customer: c, amount: r0(v) })), itemsChecked, under: under.slice(0, 12), underCount: under.length, underRevenue: r0(under.reduce((t, g) => t + (byCust[g.customer] || 0), 0)), underGap: r0(under.reduce((s, g) => s + g.gap, 0)), items };
}

/** Profit levers from the optional files. Each states its own assumption; values are yearly profit. */
export function extraLevers(extra, a) {
  const out = [];
  const p = extra?.payroll?.analysis, s = extra?.sales?.analysis;
  if (p?.overtime?.total > 0) {
    // overtime is paid at 1.5x; moving the hours to regular time saves only the extra half, so a third of the overtime pay moved
    const cut = a.overtime_cut ?? 0.3;
    out.push({ id: 'overtime', value: r0(p.overtime.total * cut / 3), cut, basis: p.overtime });
  }
  if (s?.underGap > 0) {
    const capture = a.discount_capture ?? 0.5;
    out.push({ id: 'discounts', value: r0(s.underGap * capture), capture, underRevenue: s.underRevenue || 0, basis: { count: s.underCount, gap: s.underGap, top: s.under.slice(0, 3) } });
  }
  return out;
}
