// Public benchmarks, fetched once and saved so a demo never waits on the network.
// Prime rate: Federal Reserve (FRED series DPRIME). Pay by job: US Bureau of Labor Statistics (OEWS, national annual mean).
import fs from 'node:fs';
import * as XLSX from 'xlsx';

const DAY = 86400000;
let FILE = null, B = { prime: null, wages: {} };
export function initBenchmarks(file) { FILE = file; try { B = { prime: null, wages: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {} refreshPrime(); refreshMargins(); }
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(B, null, 1)); } catch {} };

export async function refreshPrime() {
  if (B.prime && Date.now() - B.prime.fetched < DAY) return;
  try {
    const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DPRIME', { signal: AbortSignal.timeout(8000) });
    const last = (await r.text()).trim().split('\n').reverse().find(l => /^\d{4}-\d{2}-\d{2},\d/.test(l));
    if (last) { const [date, v] = last.split(','); B.prime = { value: +v / 100, date, fetched: Date.now() }; save(); }
  } catch {}
}

// SBA 7(a) loans over $350K: prime + up to 3%; lenders commonly use 2.75%. Other senior loans: about prime + 3%.
export function loanRates() {
  const p = B.prime?.value;
  return p ? { prime: p, date: B.prime.date, sba: p + 0.0275, senior: p + 0.03, source: 'Federal Reserve' } : null;
}

// Job title words → standard occupation code. Order matters: specific titles first.
const SOC = [
  [/hvac|heating|refrigeration|service tech|field tech/, '499021', 'HVAC technicians'], [/electrician/, '472111', 'Electricians'], [/plumb/, '472152', 'Plumbers'],
  [/auto|diesel|mechanic/, '493023', 'Mechanics'], [/truck|cdl|driver/, '533032', 'Truck drivers'], [/deliver/, '533033', 'Delivery drivers'],
  [/forklift/, '537051', 'Forklift operators'], [/warehouse|material handl|picker|packer/, '537062', 'Warehouse workers'],
  [/office manager|office supervisor/, '431011', 'Office managers'], [/dispatch/, '435032', 'Dispatchers'], [/receptionist|front desk/, '434171', 'Receptionists'],
  [/bookkeep|accounting clerk|billing/, '433031', 'Bookkeepers'], [/accountant|controller/, '132011', 'Accountants'], [/customer service|customer support/, '434051', 'Customer service'],
  [/office assistant|admin|clerk|coordinator/, '439061', 'Office clerks'], [/estimator/, '131051', 'Estimators'], [/recruit/, '131071', 'Recruiters'],
  [/sales manager/, '112022', 'Sales managers'], [/sales|account exec|business develop/, '414012', 'Sales reps'], [/hygienist/, '291292', 'Dental hygienists'],
  [/dental assist/, '319091', 'Dental assistants'], [/medical assist/, '319092', 'Medical assistants'], [/registered nurse|\brn\b/, '291141', 'Registered nurses'],
  [/cook|chef/, '352014', 'Cooks'], [/server|waiter|waitress/, '353031', 'Servers'], [/janitor|cleaner|custodian/, '372011', 'Cleaners'],
  [/landscap|groundskeep/, '373011', 'Landscapers'], [/carpenter/, '472031', 'Carpenters'], [/laborer|helper/, '472061', 'Laborers'], [/welder/, '514121', 'Welders'],
  [/machinist/, '514041', 'Machinists'], [/assembl/, '512092', 'Assemblers'], [/software|developer|engineer/, '151252', 'Software developers'],
  [/it support|help desk|technical support/, '151232', 'IT support'], [/marketing/, '131161', 'Marketing specialists'], [/human resources|\bhr\b/, '131071', 'HR specialists'],
  [/project manager/, '131082', 'Project managers'], [/general manager|operations manager|ops manager/, '111021', 'General managers'],
];
export const socFor = title => { const t = String(title || '').toLowerCase(); const m = SOC.find(([re]) => re.test(t)); return m ? { code: m[1], label: m[2] } : null; };

/** Market pay for each job title in a payroll analysis. Fetches only codes not saved in the last 30 days. */
export async function marketPay(roles) {
  const want = [...new Set(roles.map(r => socFor(r.role)?.code).filter(Boolean))];
  const missing = want.filter(c => !B.wages[c] || Date.now() - B.wages[c].fetched > 30 * DAY);
  if (missing.length) {
    try {
      const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesid: missing.map(c => `OEUN0000000000000${c}04`) }), signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      for (const s of j.Results?.series || []) { const d = s.data?.[0]; const v = +String(d?.value || '').replace(/,/g, ''); if (v > 0) B.wages[s.seriesID.slice(17, 23)] = { value: v, year: d.year, fetched: Date.now() }; }
      save();
    } catch {}
  }
  return roles.map(r => { const s = socFor(r.role), w = s && B.wages[s.code]; return w ? { role: r.role, count: r.count, median: r.median, base: r.base, market: w.value, year: w.year, label: s.label } : null; }).filter(Boolean);
}

// Profit margin by industry: NYU Stern (Prof. Aswath Damodaran), US public companies, updated each January.
export async function refreshMargins() {
  if (B.margins && B.margins.v === 2 && Date.now() - B.margins.fetched < 30 * DAY) return;
  try {
    const r = await fetch('https://pages.stern.nyu.edu/~adamodar/pc/datasets/margin.xls', { signal: AbortSignal.timeout(15000) });
    const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Industry Averages'], { header: 1 });
    const intro = XLSX.utils.sheet_to_json(wb.Sheets['Variables & FAQ'] || wb.Sheets['Industry Averages'], { header: 1 });
    const h = rows.findIndex(x => x?.[0] === 'Industry Name'), col = rows[h].findIndex(x => /^EBITDA\/Sales/.test(String(x))), gcol = rows[h].findIndex(x => /^Gross Margin/.test(String(x))), scol = rows[h].findIndex(x => /^SG&A\/ ?Sales/.test(String(x)));
    const serial = (rows.find(x => /date updated/i.test(String(x?.[0]))) || intro.find(x => /date updated/i.test(String(x?.[0]))))?.[1];
    const date = typeof serial === 'number' ? new Date(Date.UTC(1899, 11, 30) + serial * DAY).toISOString().slice(0, 10) : null;
    const table = {};
    for (const x of rows.slice(h + 1)) if (x?.[0] && typeof x[1] === 'number' && typeof x[col] === 'number' && !/^total/i.test(x[0])) table[x[0]] = { ebitda: x[col], gross: typeof x[gcol] === 'number' ? x[gcol] : null, sga: typeof x[scol] === 'number' ? x[scol] : null, firms: x[1] };
    if (Object.keys(table).length > 50) { B.margins = { v: 2, date, fetched: Date.now(), table }; save(); }
  } catch {}
}
export const industryNames = () => Object.keys(B.margins?.table || {});
export const peerMargin = name => { const t = B.margins?.table?.[name]; return t ? { industry: name, ebitda: t.ebitda, gross: t.gross, sga: t.sga, firms: t.firms, date: B.margins.date, source: 'NYU Stern (Damodaran)' } : null; };
