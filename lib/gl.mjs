import * as XLSX from 'xlsx';

const COLS = {
  date: [/^date$/i, /^transaction date$/i, /^txn date$/i],
  type: [/^transaction type$/i, /^type$/i, /^txn type$/i],
  num: [/^num$/i, /^no\.?$/i, /^je$/i, /^journal( entry)?( no\.?| #)?$/i, /^ref(erence)?( no\.?)?$/i, /^doc(ument)? ?(num|no)/i],
  client: [/^client$/i, /^client name$/i],
  engagement: [/^engagement( id)?$/i, /^project$/i, /^job( id)?$/i, /^search( id)?$/i],
  acctnum: [/^account ?(#|no\.?|number|code)$/i],
  name: [/^name$/i, /^customer/i, /^vendor/i, /^payee$/i, /^contact$/i],
  memo: [/^memo/i, /^description$/i, /^memo\/description$/i],
  account: [/^account$/i, /^distribution account$/i, /^account name$/i, /^account full name$/i],
  split: [/^split$/i, /^split account$/i],
  amount: [/^amount$/i, /^net amount$/i],
  debit: [/^debit$/i],
  credit: [/^credit$/i],
  balance: [/^balance$/i, /^running balance$/i],
};

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] || []).map(c => String(c ?? '').trim());
    const hasDate = cells.some(c => COLS.date.some(r => r.test(c)));
    const hasAmt = cells.some(c => [...COLS.amount, ...COLS.debit, ...COLS.credit].some(r => r.test(c)));
    if (hasDate && hasAmt) return i;
  }
  return -1;
}

function mapColumns(header) {
  const map = {};
  header.forEach((h, idx) => {
    const t = String(h ?? '').trim();
    for (const [k, regs] of Object.entries(COLS)) if (map[k] === undefined && regs.some(r => r.test(t))) map[k] = idx;
  });
  return map;
}

function toISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d || !d.y) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[$,\s]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

const str = v => (v == null ? '' : String(v).trim());
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
/** Report end date from title lines like "January 1 - December 31, 2025" or "1/1/2025 - 12/31/2025". */
export function reportEnd(lines) {
  for (const l of lines) {
    let m = l.match(/[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
    m = l.match(/[-–—]\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

/** Parse a QuickBooks GL / P&L Detail export (xlsx, xls or csv) into flat transaction rows. */
export function parseGL(buffer, filename) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  let best = null;
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
    const h = findHeader(rows);
    if (h >= 0 && (!best || rows.length > best.rows.length)) best = { sheet: sn, rows, h };
  }
  if (!best) throw new Error('Could not find a header row with Date and Amount/Debit/Credit columns. Export the QuickBooks “General Ledger” or “Profit and Loss Detail” report to Excel or CSV.');

  const { rows, h, sheet } = best;
  const header = rows[h];
  const col = mapColumns(header);
  const hasAmount = col.amount !== undefined;
  const hasDC = col.debit !== undefined || col.credit !== undefined;
  const flat = col.account !== undefined;
  const titleLines = rows.slice(0, h).map(r => (r || []).filter(c => c != null && String(c).trim()).join(' ')).filter(Boolean);

  const out = [];
  const stack = [];
  const opening = {};
  const skipped = { totals: 0, headers: 0, blank: 0, unparsed: 0 };

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const nonEmpty = r.map((c, idx) => [idx, c]).filter(([, c]) => c != null && String(c).trim() !== '');
    if (!nonEmpty.length) { skipped.blank++; continue; }
    const first = str(nonEmpty[0][1]);
    const date = col.date !== undefined ? toISO(r[col.date]) : null;

    if (/^total\b/i.test(first) || /^total for /i.test(first)) {
      if (!flat) {
        const nm = first.replace(/^total( for)?\s*/i, '').trim();
        const idx = stack.lastIndexOf(nm);
        if (idx >= 0) stack.length = idx; else stack.pop();
      }
      skipped.totals++; continue;
    }
    if (/^(net income|net operating income|gross profit|total income|total expenses)/i.test(first) && !date) { skipped.totals++; continue; }

    if (!date) {
      const typeCell = col.type !== undefined ? str(r[col.type]) : '';
      if (/beginning balance/i.test(first) || /beginning balance/i.test(typeCell)) {
        const bal = col.balance !== undefined ? toNum(r[col.balance]) : null;
        if (bal != null && stack.length) opening[stack.join(':')] = bal;
        continue;
      }
      if (!flat && nonEmpty.length <= 2 && typeof nonEmpty[0][1] === 'string') {
        stack.push(first); skipped.headers++;
        if (nonEmpty.length === 2 && col.balance !== undefined && nonEmpty[1][0] === col.balance) opening[stack.join(':')] = toNum(nonEmpty[1][1]);
        continue;
      }
      skipped.unparsed++; continue;
    }

    let amount;
    if (hasAmount && toNum(r[col.amount]) != null) amount = toNum(r[col.amount]);
    else if (hasDC) amount = (toNum(r[col.debit]) || 0) - (toNum(r[col.credit]) || 0);
    else { skipped.unparsed++; continue; }

    const account = flat ? str(r[col.account]) : stack.join(':');
    if (!account) { skipped.unparsed++; continue; }
    out.push({
      id: out.length + 1, src: i + 1, date, account,
      type: col.type !== undefined ? str(r[col.type]) : '',
      num: col.num !== undefined ? str(r[col.num]) : '',
      name: col.name !== undefined ? str(r[col.name]) : '',
      memo: col.memo !== undefined ? str(r[col.memo]) : '',
      split: col.split !== undefined ? str(r[col.split]) : '',
      amount: Math.round(amount * 100) / 100,
      balance: col.balance !== undefined ? toNum(r[col.balance]) : null,
      client: col.client !== undefined ? str(r[col.client]) : '',
      engagement: col.engagement !== undefined ? str(r[col.engagement]) : '',
      acctNum: col.acctnum !== undefined ? str(r[col.acctnum]) : '',
    });
  }
  if (!out.length) throw new Error('Header found, but no dated transaction rows were parsed. Check that the export is transaction-level (General Ledger or P&L Detail).');

  const ACCT_TYPES = /^(asset|liability|equity|revenue|income|expense|cost of (goods sold|sales)|other (income|expense))$/i;
  const typed = out.filter(r => r.type);
  if (typed.length && typed.filter(r => ACCT_TYPES.test(r.type)).length / typed.length > 0.9) for (const r of out) { r.acctType = r.type; r.type = ''; }
  const dates = out.map(r => r.date).sort();
  return {
    kind: 'gl', filename, sheet, headerRow: h + 1, title: titleLines.slice(0, 4),
    columns: Object.fromEntries(Object.entries(col).map(([k, v]) => [k, str(header[v])])),
    amountMode: hasAmount ? 'amount' : 'debit-credit',
    layout: flat ? 'flat' : 'grouped',
    rows: out, opening, skipped,
    range: { start: dates[0], end: dates[dates.length - 1], reportEnd: reportEnd(titleLines) },
  };
}

/** One line per account: count, net total, by year, and sample memos/payees for classification. */
export function accountSummary(gl) {
  const acc = {};
  for (const r of gl.rows) {
    const a = acc[r.account] ??= { account: r.account, number: r.acctNum || undefined, type: r.acctType || undefined, count: 0, total: 0, byYear: {}, names: {}, memos: [] };
    a.count++; a.total += r.amount;
    const y = r.date.slice(0, 4); a.byYear[y] = (a.byYear[y] || 0) + r.amount;
    if (r.name) a.names[r.name] = (a.names[r.name] || 0) + 1;
    if (r.memo && a.memos.length < 4 && !a.memos.includes(r.memo)) a.memos.push(r.memo);
  }
  return Object.values(acc).map(a => ({
    ...a, total: round(a.total),
    byYear: Object.fromEntries(Object.entries(a.byYear).map(([k, v]) => [k, round(v)])),
    topNames: Object.entries(a.names).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n]) => n),
    names: undefined,
  })).sort((x, y) => Math.abs(y.total) - Math.abs(x.total));
}

export const round = v => Math.round(v * 100) / 100;
