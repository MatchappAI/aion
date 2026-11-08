import { mountSearch, leaveSearch } from './search.js';
import { toast, busy, keyboardAccess } from './ui.js';
import { mountSettings, leaveSettings } from './settings.js';
import { mountHelp } from './help.js';
import { mountOutreach, leaveOutreach } from './outreach.js';
import { THESIS, PRICE, marketRange, SUBSECTORS, TOOLKIT, STATUS, DILIGENCE, REVENUE_MODELS, diligenceFor, valueBuckets, hundredDays, revenueMix } from '/thesis.mjs';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// links that come from web pages: only web, email and phone addresses become clickable
const safeUrl = v => { const u = String(v ?? '').trim(); return /^(https?:\/\/|mailto:|tel:)/i.test(u) ? esc(u) : '#'; };
const money = (v, d = 0) => v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const kfmt = v => v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + 'M' : Math.round(Math.abs(v) / 1e3).toLocaleString() + 'K');
const pct = (v, d = 0) => v == null || isNaN(v) ? '—' : (v * 100).toFixed(d) + '%';
const num = (v, d = 0) => v == null || isNaN(v) ? '—' : (+v).toLocaleString(undefined, { maximumFractionDigits: d });

let V = null, page = 'upload', running = null, mode = 'simple', replay = null, tab = 'overview', appMode = (() => { try { return localStorage.getItem('aion.app') || 'ps'; } catch { return 'ps'; } })();
const api = async (p, b) => {
  const r = await fetch('/api/' + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const j = await r.json(); if (!r.ok || (j.error && !p.startsWith('job/'))) throw new Error(j.error || 'Request failed'); return j;
};
let DL = { deals: [] };
async function refresh(go) { V = await api('state'); DL = await api('deals'); if (go) page = go; render(); }

// four steps: Upload → Real profit → Price & returns → Questions (the existing pages, grouped)
const STEPS = [
  ['upload', 'Upload', 1], ['map', 'Real profit · sort the accounts', 2], ['earnings', 'Real profit · owner pay and one-offs', 2], ['ops', 'Price & returns · team and workload', 3], ['levers', 'Price & returns · ways to raise profit', 3], ['plan', 'Questions · plan and questions for the seller', 4],
];
const ORDER = ['upload', 'map', 'earnings', 'ops', 'levers'];
function unlocked(k) {
  const st = V?.derived?.stage || 'upload'; const S = V?.state || {};
  if (k === 'upload' || k === 'log') return true;
  if (k === 'map') return !!S.file && (S.accounts?.length > 0);
  if (k === 'earnings') return !!S.mappingConfirmed;
  if (k === 'ops') return !!S.normConfirmed;
  if (k === 'levers' || k === 'plan') return !!S.opsConfirmed;
  return ORDER.indexOf(k) <= ORDER.indexOf(st);
}
function isDone(k) {
  const S = V?.state || {};
  return { upload: !!S.file && S.accounts?.length > 0, map: !!S.mappingConfirmed, earnings: !!S.normConfirmed, ops: !!S.opsConfirmed, levers: !!S.opsConfirmed, plan: !!S.plan }[k];
}

function nav() {
  $('#nav').innerHTML = STEPS.map(([k, l, n]) => `<a data-p="${k}" class="${page === k ? 'on' : ''} ${isDone(k) ? 'done' : ''} ${unlocked(k) ? '' : 'locked'}"><span class="n">${n}</span>${l}</a>`).join('')
    + `<div class="sep"></div><a data-p="log" class="${page === 'log' ? 'on' : ''}"><span class="n">≡</span>Run log</a>`
    + `<div class="sep"></div><a id="backSimple"><span class="n">←</span>Back to summary</a>`
    + `<div class="foot">Runs on this Mac. Files stay in <code>demo/workspace/</code>. Only the prompts in the Run log are sent to Claude, via your Claude Code.<br><br><span class="link" id="resetBtn">Start over (archives workspace)</span></div>`;
  document.querySelectorAll('#nav a[data-p]').forEach(a => a.onclick = () => { if (unlocked(a.dataset.p)) { page = a.dataset.p; render(); } });
  $('#backSimple').onclick = () => { mode = 'simple'; render(); };
  $('#resetBtn').onclick = async () => { if (confirm('Archive the current workspace and start over? Nothing is deleted.')) { await api('reset', {}); refresh('upload'); } };
  const S = V?.state || {};
  $('#status').innerHTML = S.file ? `<span class="pill">${esc(S.file.name)}</span>` : '';
}

// Search & Outreach: one page. Outreach (every draft, send and reply, with the inbox each one uses) on top, then the
// owner list and the searches. Opening a firm's outreach or a search takes the whole page; Back returns here.
function mountPS() {
  $('#main').innerHTML = '<div id="psout"></div><div id="psown"></div>';
  mountOutreach($('#psout'), { embedded: true }); mountSearch($('#psown'));
}
window.addEventListener('aion:outopen', () => { if (appMode !== 'ps') { appMode = 'ps'; render(); } else mountOutreach($('#psout'), { embedded: true }); window.scrollTo(0, 0); });
document.querySelectorAll('[data-app]').forEach(b => b.onclick = () => { if (appMode === b.dataset.app) return; appMode = b.dataset.app; try { localStorage.setItem('aion.app', appMode); } catch {} render(); });
function render() {
  document.querySelectorAll('[data-app]').forEach(b => b.classList.toggle('on', b.dataset.app === appMode));
  document.body.classList.toggle('psmode', ['ps', 'docs', 'settings', 'help'].includes(appMode));
  if (appMode === 'out' || appMode === 'docs') appMode = 'ps'; // Outreach lives in Search & Outreach; Documents was removed
  if (appMode !== 'ps') { leaveOutreach(); delete document.body.dataset.outview; delete document.body.dataset.psview; }
  if (appMode === 'settings' || appMode === 'help') { leaveSearch(); document.body.classList.add('simple'); $('#tabs').innerHTML = ''; return appMode === 'settings' ? mountSettings($('#main')) : mountHelp($('#main')); }
  leaveSettings();
  if (appMode === 'ps') { document.body.classList.add('simple'); $('#tabs').innerHTML = ''; return mountPS(); }
  leaveSearch();
  document.body.classList.toggle('simple', mode === 'simple'); tabs(); if (mode === 'simple') return simple(); nav(); const f = { upload: pUpload, map: pMap, earnings: pEarnings, ops: pOps, levers: pLevers, plan: pPlan, log: pLog }[page]; f(); }

// ---------- AI jobs ----------
async function runJob(endpoint, label, model, after) {
  try {
    const { job } = await api(endpoint, {});
    running = { job, label, model, t0: Date.now() }; render();
    for (;;) {
      await new Promise(r => setTimeout(r, 2000));
      const j = await api('job/' + job);
      if (j.status === 'running') { const el = $('#jobt'); if (el) el.textContent = Math.round((Date.now() - running.t0) / 1000) + 's'; continue; }
      running = null;
      if (j.status === 'error') { await refresh(); showError(label + ' failed: ' + j.error + ' — see the Run log for the exact prompt and response.'); return; }
      await refresh(after); return;
    }
  } catch (e) { running = null; render(); showError(e.message); }
}
let AI_NAME = 'Claude Code';
fetch('/api/engine').then(r => r.json()).then(e => { AI_NAME = e.list?.find(x => x.id === e.active)?.label || 'your AI'; }).catch(() => {});
const jobBox = () => running ? `<div class="job"><div class="spin"></div><div><b>${esc(running.label)}</b> — running in ${esc(AI_NAME)} (${esc(running.model)}) · <span id="jobt">0s</span><div class="note">The exact prompt is recorded in the Run log.</div></div></div>` : '';
function showError(msg) { const m = $('#main'); m.querySelectorAll(':scope > .callout.err.lasterr').forEach(x => x.remove()); m.insertAdjacentHTML('afterbegin', `<div class="callout err lasterr" role="alert" style="margin-bottom:14px">${esc(msg)}</div>`); toast(msg, 'err'); }

function rowsModal(title, q) {
  api('rows?' + new URLSearchParams(q)).then(r => {
    $('#mtitle').textContent = `${title} · ${r.total.toLocaleString()} rows${r.total > 500 ? ' (first 500)' : ''}`;
    $('#mbody').innerHTML = `<table><tr><th>#</th><th>Date</th><th>Account</th><th>Type</th><th>Num</th><th>Name</th><th>Memo</th><th class="num">Amount</th></tr>${r.rows.map(x => `<tr><td class="num">${x.src ?? x.id}</td><td>${esc(x.date)}</td><td>${esc(x.account)}</td><td>${esc(x.type)}</td><td>${esc(x.num)}</td><td>${esc(x.name)}</td><td>${esc(x.memo)}</td><td class="num">${money(x.amount, 2)}</td></tr>`).join('')}</table><p class="note"># is the row number in your uploaded file.</p>`;
    $('#modal').classList.add('on');
  }).catch(e => showError('Could not load those rows: ' + e.message));
}
$('#mclose').onclick = () => $('#modal').classList.remove('on');
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').classList.remove('on'); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').classList.remove('on'); });

// ---------- 1 upload ----------
function pUpload() {
  const S = V.state;
  const p = S.parse;
  $('#main').innerHTML = `<h1>Step 1 · Upload the company’s books</h1>
  <p class="lede">Drop in the company’s QuickBooks export: the record of every payment in and out (the General Ledger). It is read on this computer; nothing is sent anywhere until you press an AI button. Next: AI sorts each account into sales, pay, costs and so on.</p>
  ${jobBox()}
  <div class="drop" id="drop"><b>Drop a file here or click to choose</b><div class="note" style="margin-top:6px">QuickBooks General Ledger or Profit &amp; Loss Detail (.xlsx, .xls, .csv) · or PDF financial statements</div><input type="file" id="file" accept=".xlsx,.xls,.csv,.pdf" hidden></div>
  <div class="grid2" style="margin-top:16px">
    <div class="panel"><b>Best file</b><p class="note">QuickBooks → Reports → <b>General Ledger</b> → last 24–36 months, all accounts → Export → Excel. Including all accounts (not just sales and costs) lets the app see money customers still owe and how fast they pay.</p></div>
    <div class="panel"><b>Also accepted</b><p class="note"><b>Profit and Loss Detail</b> export (can’t show how fast customers pay), or <b>PDF financial statements</b>: AI copies the totals with page numbers, so there is no customer-by-customer view.</p></div>
  </div>
  ${S.file && p ? `<h2>What was read</h2><div class="panel"><div class="grid4">
    <div class="kpi"><small>File</small><b style="font-size:15px">${esc(S.file.name)}</b><span>${(S.file.bytes / 1024).toFixed(0)} KB · sheet “${esc(p.sheet)}”</span></div>
    <div class="kpi"><small>Payments read</small><b>${num(p.rows ?? S.accounts.reduce((s, a) => s + a.count, 0))}</b><span>${esc(p.layout)} layout · ${esc(p.amountMode)}</span></div>
    <div class="kpi"><small>Dates covered</small><b style="font-size:16px">${esc(p.range.start)} → ${esc(p.range.end)}</b></div>
    <div class="kpi"><small>Accounts</small><b>${num(S.accounts.length)}</b><span>skipped: ${p.skipped.totals} total lines, ${p.skipped.headers} headings, ${p.skipped.unparsed} unreadable</span></div>
  </div>
  <p class="note">Columns found: ${Object.entries(p.columns).map(([k, v]) => `${esc(k)} → “${esc(v)}”`).join(' · ')}${p.title?.length ? `<br>Report title: ${esc(p.title.join(' · '))}` : ''}</p>
  <div class="row"><button id="go">Sort the accounts with AI →</button><span class="note">Sends only account names, totals and a few sample memos and payees per account (not every payment) to ${esc(V.models.extraction)}.</span></div></div>` : ''}
  ${S.file?.kind === 'pdf' && !S.accounts?.length && !running ? `<div class="callout warn" style="margin-top:14px">PDF uploaded but no statement lines were extracted. Check the Run log, then upload again.</div>` : ''}`;
  const drop = $('#drop'), file = $('#file');
  drop.onclick = () => file.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); };
  file.onchange = () => file.files[0] && upload(file.files[0]);
  if ($('#go')) $('#go').onclick = () => runJob('ai/classify', 'Sorting the accounts', V.models.extraction, 'map');
}
async function upload(f) {
  if (!f) return;
  if (V.state.file && !confirm('Replace the current company? Its analysis will be overwritten. Cancel and use “Start over” first if you want to archive it.')) return;
  const b64 = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = bad; r.readAsDataURL(f); });
  try {
    const res = await api('upload', { filename: f.name, data: b64 });
    if (res.job) { running = { job: res.job, label: 'Reading the PDF statements', model: V.models.extraction, t0: Date.now() }; await refresh(); pollPdf(res.job); }
    else { V = res; render(); }
  } catch (e) { render(); showError(e.message); }
}
async function pollPdf(job) {
  for (;;) { await new Promise(r => setTimeout(r, 2000)); const j = await api('job/' + job); if (j.status === 'running') { const el = $('#jobt'); if (el) el.textContent = Math.round((Date.now() - running.t0) / 1000) + 's'; continue; } running = null; await refresh(j.status === 'done' ? 'map' : 'upload'); if (j.status === 'error') showError('PDF extraction failed: ' + j.error); return; }
}

// ---------- 2 accounts ----------
function pMap() {
  const S = V.state, C = V.categories;
  const opts = sel => Object.entries(C).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
  const ttmLike = a => a.total;
  const revCheck = S.accounts.filter(a => C[S.mapping?.[a.account]]?.group === 'revenue').reduce((s, a) => s + a.total, 0);
  $('#main').innerHTML = `<h1>Step 2 · Real profit: check how each account is sorted</h1>
  <p class="lede">AI suggested a category for every account (sales, staff pay, rent and so on). You have the final say: change any you disagree with. Nothing after this step runs until you confirm.</p>
  ${jobBox()}
  ${!S.mapping ? `<div class="callout warn">Accounts not sorted yet. <span class="link" id="cl">Sort them with AI</span></div>` : `
  <div class="panel row" style="margin-bottom:14px">
    <div><b>Plus or minus signs</b><div class="note">Sales accounts add up to ${money(revCheck)} in this file. ${revCheck < 0 ? 'That is negative, so this file probably shows sales as minus numbers (“debit-positive”).' : 'That is positive, so sales and costs both show as plus numbers (“natural”).'} Pick the option that makes sales positive.</div></div>
    <div class="spacer"></div>
    <label><input type="radio" name="sm" value="natural" ${S.signMode === 'natural' ? 'checked' : ''}> Natural (sales +, costs +)</label>
    <label><input type="radio" name="sm" value="debit" ${S.signMode === 'debit' ? 'checked' : ''}> Debit-positive (sales shown as −)</label>
  </div>
  <table><tr><th>Account</th><th class="num">Payments</th><th class="num">Total (all months)</th><th>Category</th><th class="num">How sure the AI is</th><th>Why the AI chose it</th><th></th></tr>
  ${S.accounts.map(a => { const ai = S.mappingAI?.[a.account]; const low = ai && ai.confidence < 0.6; return `<tr><td>${esc(a.account)}</td><td class="num">${num(a.count)}</td><td class="num">${money(ttmLike(a))}</td><td><select data-a="${esc(a.account)}">${opts(S.mapping[a.account])}</select></td><td class="num ${low ? 'neg' : ''}">${ai ? pct(ai.confidence) : '—'}</td><td class="note">${esc(ai?.reason || '')}</td><td><span class="link" data-rows="${esc(a.account)}">see payments</span></td></tr>`; }).join('')}
  </table>
  <div class="row" style="margin-top:16px"><button class="ok" id="conf">${S.mappingConfirmed ? 'Sorting confirmed ✓ — continue' : 'Confirm and work out profit →'}</button>${S.file.kind === 'gl' ? '<button class="ghost" id="cl">Sort again with AI</button>' : ''}<span class="note">Red = the AI is less than 60% sure; check those first. Changing a category later re-opens the later steps.</span></div>`}`;
  document.querySelectorAll('select[data-a]').forEach(s => s.onchange = async () => { V = await api('mapping', { mapping: { [s.dataset.a]: s.value }, confirm: false }); nav(); });
  document.querySelectorAll('input[name=sm]').forEach(r => r.onchange = async () => { V = await api('mapping', { signMode: r.value, confirm: false }); render(); });
  document.querySelectorAll('[data-rows]').forEach(l => l.onclick = () => rowsModal(l.dataset.rows, { account: l.dataset.rows }));
  if ($('#cl')) $('#cl').onclick = () => runJob('ai/classify', 'Sorting the accounts', V.models.extraction, 'map');
  if ($('#conf')) $('#conf').onclick = async () => { V = await api('mapping', { confirm: true }); page = 'earnings'; render(); };
}

// ---------- 3 earnings ----------
function pnlTable(d) {
  const C = V.categories; const per = d.periods;
  const line = (label, key, cls = '', cat) => `<tr class="${cls}"><td>${cat ? `<span class="link" data-cat="${cat}">${esc(label)}</span>` : esc(label)}</td>${per.map(p => `<td class="num">${money(key(d.pnl[p.key]))}</td>`).join('')}</tr>`;
  const used = Object.keys(C).filter(k => !['bs', 'below'].includes(C[k].group) && per.some(p => d.pnl[p.key].byCat[k]));
  const below = Object.keys(C).filter(k => C[k].group === 'below' && per.some(p => d.pnl[p.key].byCat[k]));
  let h = `<table><tr><th></th>${per.map(p => `<th class="num">${p.key}${p.partial ? '*' : ''}</th>`).join('')}</tr>`;
  for (const g of [['revenue', 'Revenue'], ['direct', 'Direct costs (the client team, contractors, pass-through costs)'], ['opex', 'Operating expenses']]) {
    used.filter(k => C[k].group === g[0]).forEach(k => h += line(C[k].label, x => x.byCat[k], '', k));
    h += line(g[1] + ' total', x => g[0] === 'revenue' ? x.revenue : g[0] === 'direct' ? x.direct : x.opex, 'sub');
    if (g[0] === 'direct') h += line('Gross profit after direct costs', x => x.contribution, 'sub');
  }
  h += line('Profit in the books (EBITDA: before interest, tax and depreciation)', x => x.ebitda, 'tot');
  below.forEach(k => h += line(C[k].label, x => x.byCat[k], '', k));
  h += line('Net income (should match the seller’s profit and loss statement)', x => x.net, 'sub');
  return h + `</table><p class="note">* part of a year only. TTM = the last 12 months, ending ${esc(per[per.length - 1].to)}. Click a line to see the payments behind it.</p>`;
}
function pEarnings() {
  const S = V.state, d = V.derived, n = d.normalization, q = d.quality;
  const ab = S.addbacks || [], vd = S.vendors || [], fl = S.flags || [];
  $('#main').innerHTML = `<h1>Step 2 · Real profit: profit in the books → real profit</h1>
  <p class="lede">Software adds up profit from the accounts you sorted: profit before interest, tax and depreciation (EBITDA). Then it works out <b>real profit</b> (“normalized EBITDA”): it adds back the owner’s pay and one-off costs a new owner won’t have (“add-backs”), and takes off the salary of a manager hired to replace the owner. AI suggests add-backs; each amount is the sum of the real payments it points to, and none counts until you tick it.</p>
  ${jobBox()}
  <div class="grid4">
    <div class="panel kpi"><small>Sales, last 12 months</small><b>${kfmt(d.pnl.TTM.revenue)}</b></div>
    <div class="panel kpi"><small>Profit in the books (EBITDA)</small><b>${kfmt(n.reported)}</b><span>${pct(n.reported / d.pnl.TTM.revenue, 1)} of sales</span></div>
    <div class="panel kpi"><small>One-off costs added back</small><b>${kfmt(n.addbacks)}</b><span>${kfmt(n.unaccepted)} more suggested, not ticked</span></div>
    <div class="panel kpi hi"><small>Real profit (normalized EBITDA)</small><b>${kfmt(n.normalized)}</b><span>${pct(n.normalized / d.pnl.TTM.revenue, 1)} of sales</span></div>
  </div>
  <h2>From profit in the books to real profit</h2>
  <p class="howline"><b>How this works:</b> start from profit in the books, add what a new owner won’t pay, then pay whoever runs the firm after closing (the seller if they stay, or a hired manager) a market salary. Change the salary or the number of leaders and everything updates.</p>
  <div class="panel"><table>
    <tr><td>Profit in the books (EBITDA)</td><td class="num">${money(n.reported)}</td></tr>
    <tr><td>+ One-off costs you ticked (add-backs)</td><td class="num">${money(n.addbacks)}</td></tr>
    <tr><td>+ Owner’s pay found in the books <span class="note">(owner pay accounts${S.owner.extraOwnerComp ? ' + the amount you typed below' : ''})</span></td><td class="num">${money(n.ownerActual)}</td></tr>
    <tr><td>− Market salary for whoever runs it after closing (the seller or a hire) <span class="badge ass">your guess</span> $<input type="number" id="mc" value="${S.owner.marketComp}" step="5000"> × <input type="number" id="oc" value="${S.owner.count}" min="1" step="1" style="width:60px"> leaders</td><td class="num">${money(-n.replacement)}</td></tr>
    <tr><td>Owner’s pay booked in other accounts (type it in, $) <input type="number" id="xo" value="${S.owner.extraOwnerComp}" step="1000"></td><td></td></tr>
    <tr class="tot"><td>Real profit (normalized EBITDA)</td><td class="num">${money(n.normalized)}</td></tr>
  </table><p class="note">This is not the seller’s “cash flow” or SDE (seller’s discretionary earnings), which leave the owner’s pay in. Real profit here already pays someone to run the business.</p></div>

  <h2>AI review of costs and risks <span class="badge">${esc(V.models.analysis)}</span></h2>
  ${!S.addbacks ? `<div class="panel row"><span class="note">Sends the last 12 months’ profit and loss by category, customer statistics, and cost totals by account and payee (the top 160, up to eight memos each). No customer names.</span><div class="spacer"></div><button id="ab">Find one-off costs and risks with AI</button></div>` : `
  <div class="panel"><b>One-off costs a new owner won’t pay (add-backs)</b> <span class="note">— tick only what the seller can prove with receipts or records</span>
  ${ab.length ? `<table><tr><th>Count it</th><th>Cost</th><th>Which payments</th><th>Why it’s one-off</th><th class="num">Last 12 months</th><th></th></tr>${ab.map(a => `<tr><td><input type="checkbox" data-ab="${a.id}" ${a.accepted ? 'checked' : ''}></td><td><b>${esc(a.label)}</b><div class="note">${esc(a.type)}</div></td><td class="note">${esc(a.account)}${a.payee ? ' · payee “' + esc(a.payee) + '”' : ''}${a.memo_contains ? ' · memo contains “' + esc(a.memo_contains) + '”' : ''}</td><td class="note">${esc(a.rationale)}</td><td class="num">${money(a.amount)}</td><td><span class="link" data-ids="${a.ids.join(',')}" data-t="${esc(a.label)}">see ${a.ids.length} payments</span></td></tr>`).join('')}</table>` : '<p class="empty">No one-off costs found that match real payments.</p>'}
  </div>
  <div class="panel" style="margin-top:12px"><b>Supplier and tool savings</b> <span class="note">— the savings % is your guess; change it</span>
  ${vd.length ? `<table><tr><th>Count it</th><th>Saving</th><th>Why</th><th class="num">Spent, last 12 months</th><th class="num">Savings %</th><th class="num">Saving a year</th><th></th></tr>${vd.map(v => `<tr><td><input type="checkbox" data-vd="${v.id}" ${v.accepted ? 'checked' : ''}></td><td><b>${esc(v.label)}</b><div class="note">${esc(v.account)}${v.payee ? ' · ' + esc(v.payee) : ''}</div></td><td class="note">${esc(v.rationale)}</td><td class="num">${money(v.spend)}</td><td class="num"><input type="number" data-vp="${v.id}" value="${Math.round(v.pct * 100)}" min="0" max="100" style="width:64px"></td><td class="num">${money(v.amount)}</td><td><span class="link" data-ids="${v.ids.join(',')}" data-t="${esc(v.label)}">see ${v.ids.length} payments</span></td></tr>`).join('')}</table>` : '<p class="empty">None suggested.</p>'}
  </div>
  ${fl.length ? `<div class="panel" style="margin-top:12px"><b>Things to check with the seller</b><table>${fl.map(f => `<tr><td><span class="badge ${esc(f.severity)}">${esc(f.severity)}</span></td><td><b>${esc(f.title)}</b><div class="note">${esc(f.detail)}</div></td></tr>`).join('')}</table></div>` : ''}
  <div class="row" style="margin-top:10px"><button class="ghost" id="ab">Review costs again with AI</button></div>`}

  <h2>Customers and cash</h2>
  ${q ? `<p class="howline"><b>How this works:</b> counted from the sales and customer-balance lines in the books. A high share from one customer is a risk; more days to get paid means more cash tied up.</p><div class="grid4">
    <div class="panel kpi"><small>Customers, last 12 months</small><b>${num(q.customersTTM)}</b><span>${pct(q.retention)} also bought in the 12 months before</span></div>
    <div class="panel kpi"><small>Biggest 1 / 5 / 10 customers</small><b style="font-size:17px">${pct(q.top1)} · ${pct(q.top5)} · ${pct(q.top10)}</b><span>share of sales with a customer name</span></div>
    <div class="panel kpi"><small>Invoices, last 12 months</small><b>${num(q.invoicesTTM)}</b><span>average ${money(q.avgInvoice)} · ${pct(q.installmentShare)} paid in equal instalments</span></div>
    <div class="panel kpi"><small>Days to get paid (DSO)</small><b>${d.dso == null ? '—' : num(d.dso) + ' days'}</b><span>${q.ar ? `customers owe ${money(q.ar.avgBalance)} on average · collected ${money(q.ar.collectionsTTM)} in 12 months` : 'No “money owed by customers” account in the books, so not worked out'}</span></div>
  </div>
  <div class="grid2" style="margin-top:12px"><div class="panel">${chart(q.monthly)}</div>
  <div class="panel"><b>Biggest customers, last 12 months</b><table>${q.topCustomers.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${money(c.revenue)}</td><td class="num">${pct(c.share, 1)}</td></tr>`).join('') || '<tr><td class="empty">No customer names on the sales lines</td></tr>'}</table></div></div>`
  : `<p class="note">PDF statements show totals only. The customer, invoice and payment-speed view needs a General Ledger with every payment.</p>`}

  <h2>Profit and loss by year</h2><div class="panel">${pnlTable(d)}</div>
  <div class="row" style="margin-top:16px"><button class="ok" id="conf">${S.normConfirmed ? 'Real profit confirmed ✓ — continue' : 'Confirm real profit and continue →'}</button><span class="note">Next: the team and workload, then price and returns.</span></div>`;

  const post = async b => { V = await api('earnings', { ...b, confirm: false }); render(); };
  $('#mc').onchange = e => post({ owner: { marketComp: e.target.value } });
  $('#oc').onchange = e => post({ owner: { count: e.target.value } });
  $('#xo').onchange = e => post({ owner: { extraOwnerComp: e.target.value } });
  document.querySelectorAll('[data-ab]').forEach(c => c.onchange = () => post({ addbacks: { [c.dataset.ab]: c.checked } }));
  document.querySelectorAll('[data-vd]').forEach(c => c.onchange = () => post({ vendors: { [c.dataset.vd]: { accepted: c.checked } } }));
  document.querySelectorAll('[data-vp]').forEach(c => c.onchange = () => post({ vendors: { [c.dataset.vp]: { pct: c.value / 100 } } }));
  document.querySelectorAll('[data-ids]').forEach(l => l.onclick = () => rowsModal(l.dataset.t, { ids: l.dataset.ids }));
  document.querySelectorAll('[data-cat]').forEach(l => l.onclick = () => rowsModal(V.categories[l.dataset.cat].label, { category: l.dataset.cat }));
  document.querySelectorAll('#ab').forEach(b => b.onclick = () => runJob('ai/addbacks', 'Finding one-off costs and risks', V.models.analysis, 'earnings'));
  $('#conf').onclick = async () => { V = await api('earnings', { confirm: true }); page = 'ops'; render(); };
}
function chart(m) {
  if (!m?.length) return '<p class="empty">No monthly sales in the books</p>';
  const W = 520, H = 170, max = Math.max(...m.map(x => x.v), 1), bw = W / m.length;
  return `<b>Sales each month</b><svg viewBox="0 0 ${W} ${H + 22}" width="100%">${m.map((x, i) => { const h = Math.max(0, x.v) / max * H; return `<rect x="${i * bw + 1}" y="${H - h}" width="${Math.max(1, bw - 2)}" height="${h}" fill="#2F5D50" opacity=".85"><title>${esc(x.m)}: ${money(x.v)}</title></rect>`; }).join('')}
  <text x="0" y="${H + 16}" font-size="10" fill="#6B675E">${esc(m[0].m)}</text><text x="${W}" y="${H + 16}" font-size="10" fill="#6B675E" text-anchor="end">${esc(m[m.length - 1].m)}</text></svg>`;
}

// ---------- 4 ops ----------
const OPS = [
  ['producers', 'Producers (account leads / consultants, full-time equivalents)'], ['admin_fte', 'Admin & support staff (full-time equivalents)'], ['owners', 'Owners working in the business'],
  ['placements_per_year', 'Completed searches / placements (last 12 months)'], ['avg_fee', 'Average fee per completed search ($)'], ['commission_rate', 'Commission paid on extra fees (0–1, e.g. 0.3 = 30%)'],
  ['hours_per_search', 'Producer hours per completed search'], ['loaded_cost_producer', 'Full cost per producer, pay plus benefits and taxes ($/yr)'],
  ['hours.research', 'Hours / producer / week · research & market mapping'], ['hours.sourcing', 'Hours / producer / week · sourcing & rediscovery'],
  ['hours.outreach', 'Hours / producer / week · outreach & follow-up'], ['hours.crm', 'Hours / producer / week · CRM & notes'],
  ['hours.reporting', 'Hours / producer / week · client reporting'], ['hours.backoffice', 'Hours / admin / week · invoicing, collections, close'],
];
const getOp = (o, k) => k.startsWith('hours.') ? o?.hours?.[k.slice(6)] : o?.[k];
function pOps() {
  const S = V.state; const ai = S.opsAI?.inputs || {};
  $('#main').innerHTML = `<h1>Step 3 · Price & returns: team and workload</h1>
  <p class="lede">The books show money, not hours. AI works out what it can from pay, contractor and invoice patterns, and marks the rest as estimates. Check and correct every number: they decide how much time AI could save and what that is worth.</p>
  ${jobBox()}
  ${!S.opsAI ? `<div class="panel row"><span class="note">Sends 12-month totals by category, sales statistics, and the people and contractors paid, with their totals and how often they were paid (names included).</span><div class="spacer"></div><button id="inf">Estimate the team from the books with AI</button></div>` : `
  <div class="tblw"><table><tr><th>What</th><th class="num">Number</th><th>Where it came from</th><th>Why the AI thinks so</th><th class="num">How sure</th></tr>
  ${OPS.map(([k, l]) => [k, opsLabel(k, l)]).map(([k, l]) => { const a = ai[k] || {}; const est = /estimate/i.test(a.basis || ''); return `<tr><td>${esc(l)}</td><td class="num"><input type="number" data-op="${k}" value="${getOp(S.ops, k) ?? 0}" step="any"></td><td><span class="badge ${est ? 'est' : 'gl'}">${esc(a.basis || 'manual')}</span></td><td class="note">${esc(a.evidence || '')}</td><td class="num">${a.confidence != null ? pct(a.confidence) : '—'}</td></tr>`; }).join('')}
  </table></div>
  ${S.opsAI.caveats?.length ? `<div class="callout warn" style="margin-top:12px">${S.opsAI.caveats.map(esc).join('<br>')}</div>` : ''}
  <div class="row" style="margin-top:16px"><button class="ok" id="conf">${S.opsConfirmed ? 'Team confirmed ✓ — continue' : 'Confirm the team and see ways to raise profit →'}</button><button class="ghost" id="inf">Estimate again with AI</button><span class="note">“Estimate” = not in the books; correct it if you know better.</span></div>`}`;
  document.querySelectorAll('[data-op]').forEach(i => i.onchange = async () => {
    const k = i.dataset.op; const body = k.startsWith('hours.') ? { hours: { [k.slice(6)]: i.value } } : { [k]: i.value };
    V = await api('ops', { ops: body, confirm: false }); nav();
  });
  document.querySelectorAll('#inf').forEach(b => b.onclick = () => runJob('ai/ops', 'Estimating the team from the books', V.models.extraction, 'ops'));
  if ($('#conf')) $('#conf').onclick = async () => { V = await api('ops', { confirm: true }); page = 'levers'; render(); };
}

// labels in the profile's own words; talent firms keep the original search-firm labels
function opsLabel(k, l) {
  const P = V.profile || {}; if (P.kind === 'staffing') return l;
  const W = P.workflows || {}, w = P.worker || 'person', J = P.job || 'job';
  if (P.opsLabels?.[k]) return P.opsLabels[k];
  return { producers: `${cap(P.workers || 'front-line staff')} who do the paid work (full-time equivalents)`, placements_per_year: `Completed ${P.jobs || 'jobs'} (last 12 months)`, avg_fee: `Average sale per ${J} ($)`, hours_per_search: `Hours per completed ${J}`, loaded_cost_producer: `Full cost per ${w}, pay plus benefits and taxes ($/yr)`,
    'hours.research': `Hours / ${w} / week · ${(W.research || 'research').toLowerCase()}`, 'hours.sourcing': `Hours / ${w} / week · ${(W.sourcing || 'scheduling').toLowerCase()}`, 'hours.outreach': `Hours / ${w} / week · ${(W.outreach || 'follow-up').toLowerCase()}`, 'hours.crm': `Hours / ${w} / week · ${(W.crm || 'records').toLowerCase()}`, 'hours.reporting': `Hours / ${w} / week · ${(W.reporting || 'reporting').toLowerCase()}` }[k] || l;
}
// ---------- 5 levers ----------
const AS = [
  ['pricing_uplift', 'Price rise on fees (all service sales)', 'pct'], ['writeoff_reduction', 'Fewer unpaid invoices written off', 'pct'],
  ['demand_searches', 'Extra client accounts (or jobs) a year you can actually win', 'n'], ['completion_rate', 'Share of new accounts (or jobs) that stay and get paid', 'pct'],
  ['growth_share', 'Freed hours used to serve more clients', 'pct'], ['avoided_share', 'Freed hours used to cut spending', 'pct'],
  ['realizable_spend', 'Spending you will actually cut ($ a year)', '$'], ['software_per_user_month', 'AI software per user per month ($)', '$'],
  ['implementation', 'One-time AI setup ($)', '$'], ['ongoing_ops', 'Running the AI each year ($)', '$'],
  ['year1_ramp', 'Year 1: share of the full yearly gain you get', 'pct'], ['dso_reduction_days', 'Days faster customers pay (one-time cash)', 'n'],
];
function pLevers() {
  const S = V.state, d = V.derived, L = d.levers, six = L.six, a = S.assumptions, n = d.normalization;
  const bridge = [
    ['Real profit', n.normalized, 'abs'], ['Prices', L.nonAI.pricing], ['Write-offs', L.nonAI.writeoffs], ['Suppliers', L.nonAI.vendors],
    ['AI: more work', L.growth], ['AI: cost cut', six.cashSavings], ['AI software', -six.costs.software], ['Running AI', -six.costs.ongoing], ['With changes', d.proForma, 'end']];
  $('#main').innerHTML = `<h1>Step 3 · Price & returns: ways to raise profit</h1>
  <p class="lede">Each change (a “lever”) is worked out from the books, the team numbers you confirmed, and the guesses on this page, which you can change. Hours that AI frees up are counted once only: for more work, for spending you will really cut, or not at all. An hour saved never counts as cash unless you type in real spending to cut.</p>
  <div class="grid4">
    <div class="panel kpi"><small>Real profit today (normalized EBITDA)</small><b>${kfmt(n.normalized)}</b></div>
    <div class="panel kpi hi"><small>Extra profit a year, once running</small><b>${kfmt(L.runRate)}</b><span>after AI software and running costs (the “run-rate”)</span></div>
    <div class="panel kpi"><small>Year 1, after one-time setup</small><b class="${L.year1 < 0 ? 'neg' : ''}">${kfmt(L.year1)}</b><span>year 1 gets ${pct(a.year1_ramp)} of the full gain</span></div>
    <div class="panel kpi"><small>Return on investment (ROI) · pays back in</small><b>${L.roi == null ? '—' : L.roi.toFixed(1) + 'x'}</b><span>${L.paybackMonths == null ? 'never pays back at these numbers' : num(L.paybackMonths, 1) + ' months'}</span></div>
  </div>
  <div class="panel" style="margin-top:14px">${waterfall(bridge)}</div>

  <h2>How the extra profit is worked out, line by line</h2>
  <div class="panel"><div class="tblw"><table>
    <tr><td><b>1 · Hours AI saves</b><div class="note">people × hours a week × ${a.weeks_per_year} weeks × % saved, added up for each task</div></td><td class="num">${num(six.timeSaved)} hrs a year</td></tr>
    <tr><td><b>2 · Same as how many people</b><div class="note">hours saved ÷ ${a.weeks_per_year * 40} hours per full-time person. This is time, not cash.</div></td><td class="num">${num(six.capacityFte, 2)} people</td></tr>
    <tr><td><b>3 · What the freed hours are used for</b><div class="note">More ${esc(V.profile?.jobs || 'client work')} ${num(six.allocation.growthHours)} h · cut spending ${num(six.allocation.avoidedHours)} h · not used ${num(six.allocation.unallocatedHours)} h ${six.allocation.overAllocated ? '<span class="neg">— your shares add up to over 100%, so “cut spending” was lowered</span>' : ''}</div></td><td class="num">${pct(a.growth_share)} / ${pct(Math.min(a.avoided_share, 1 - a.growth_share))} / ${pct(Math.max(0, 1 - a.growth_share - a.avoided_share))}</td></tr>
    <tr><td><b>4 · Cash actually saved</b><div class="note">the smaller of: value of hours used to cut spending ${money(six.avoidedTheoretical)}, or spending you said you will cut ${money(a.realizable_spend)}</div></td><td class="num">${money(six.cashSavings)}</td></tr>
    <tr><td><b>5 · Extra sales (based on your guesses)</b><div class="note">Freed hours could support ${num(six.capacitySearches, 1)} extra ${V.profile?.jobs || 'jobs'}; the most you said you can win is ${num(a.demand_searches, 1)} → ${num(six.extraSearches, 1)} × ${pct(a.completion_rate)} stay and pay × ${money(S.ops.avg_fee)} = ${money(six.aiRevenue)}${six.demandLimited ? ' <b>(limited by how much work you can win)</b>' : ''} · from prices ${money(L.nonAI.pricingRevenue)}. Profit counts AI sales after ${pct(six.variableCostRate)} for commissions and contractors.</div></td><td class="num">${money(six.incrementalRevenue)}</td></tr>
    <tr class="tot"><td><b>6 · Extra profit a year (EBITDA)</b><div class="note">non-AI changes ${money(L.nonAI.total)} + AI ${money(L.ai)} − software ${money(six.costs.software)} − running costs ${money(six.costs.ongoing)} · setup ${money(six.costs.implementation)} is paid once, in year 1</div></td><td class="num">${money(L.runRate)}</td></tr>
  </table></div>
  ${d.cashRelease != null ? `<p class="note">One-time cash from getting paid faster (not profit): ${money(d.cashRelease)} if customers pay ${a.dso_reduction_days} days sooner than today’s ${num(d.dso)} days.</p>` : '<p class="note">Cash from getting paid faster not worked out: the books have no “money owed by customers” account.</p>'}</div>

  <div class="grid2">
  <div><h2>Tasks AI could speed up</h2><div class="panel"><div class="tblw"><table><tr><th>Task</th><th class="num">People</th><th class="num">Hours a week</th><th class="num">% saved</th><th class="num">Hours saved a year</th></tr>
    ${L.workflows.map(w => `<tr><td>${esc(w.label)}</td><td class="num">${num(w.people, 1)}</td><td class="num">${num(w.hoursPerWeek, 1)}</td><td class="num"><input type="number" data-wf="${w.key}" value="${Math.round(w.saved * 100)}" min="0" max="100" style="width:60px"></td><td class="num">${num(w.hoursSaved)}</td></tr>`).join('')}
  </table></div><p class="note">% saved is a guess (<span class="badge ass">your guess</span>); people and hours come from the team numbers you confirmed.</p></div></div>
  <div><h2>Your guesses <span class="badge ass">change any</span></h2><div class="panel"><div class="tblw"><table>
    ${AS.map(([k, l, t]) => `<tr><td>${esc(l)}</td><td class="num"><input type="number" data-as="${k}" data-t="${t}" value="${t === 'pct' ? +(a[k] * 100).toFixed(2) : a[k]}" step="any">${t === 'pct' ? ' %' : ''}</td></tr>`).join('')}
  </table></div><div class="row" style="margin-top:8px"><span class="link" id="rs">Put the guesses back to the defaults</span></div></div></div>
  </div>
  <div class="row" style="margin-top:18px"><button id="toPlan">Next: the step-by-step plan →</button></div>`;
  document.querySelectorAll('[data-as]').forEach(i => i.onchange = async () => { const v = i.dataset.t === 'pct' ? i.value / 100 : i.value; V = await api('assumptions', { assumptions: { [i.dataset.as]: v } }); render(); });
  document.querySelectorAll('[data-wf]').forEach(i => i.onchange = async () => { V = await api('assumptions', { assumptions: { workflows: [{ key: i.dataset.wf, saved: i.value / 100 }] } }); render(); });
  $('#rs').onclick = async () => { V = await api('assumptions', { reset: true }); render(); };
  $('#toPlan').onclick = () => { page = 'plan'; render(); };
}
function waterfall(items) {
  const W = 1000, H = 260, top = 24, bot = 210;
  let run = 0; const pts = items.map(([l, v, k]) => { if (k) { const r = { l, a: 0, b: v, k }; run = v; return r; } const r = { l, a: run, b: run + v, k: v >= 0 ? 'up' : 'down' }; run += v; return r; });
  const vals = pts.flatMap(p => [p.a, p.b]); const max = Math.max(...vals, 1), min = Math.min(0, ...vals);
  const y = v => bot - (v - min) / (max - min) * (bot - top);
  const slot = W / pts.length, bw = slot * .58;
  return `<b>From real profit to profit with every change, in a full year</b><svg viewBox="0 0 ${W} ${H}" width="100%">${pts.map((p, i) => {
    const x = i * slot + (slot - bw) / 2, y0 = y(Math.max(p.a, p.b)), y1 = y(Math.min(p.a, p.b));
    const fill = p.k === 'abs' ? '#9C978C' : p.k === 'end' ? '#2F5D50' : p.k === 'up' ? '#7FA493' : '#C98B7C';
    const val = p.k === 'abs' || p.k === 'end' ? p.b : p.b - p.a;
    return `<rect x="${x}" y="${y0}" width="${bw}" height="${Math.max(1.5, y1 - y0)}" fill="${fill}" rx="2"/><text x="${x + bw / 2}" y="${y0 - 6}" font-size="12" text-anchor="middle" fill="#292823">${p.k ? kfmt(val) : (val >= 0 ? '+' : '') + kfmt(val)}</text><text x="${x + bw / 2}" y="${bot + 18}" font-size="11" text-anchor="middle" fill="#6B675E">${esc(p.l)}</text>`;
  }).join('')}<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#D3CDBF"/></svg>`;
}

// ---------- 6 plan ----------
function pPlan() {
  const S = V.state, P = S.plan;
  const stale = P && S.planInputsHash && S.planInputsHash !== JSON.stringify([S.ops, S.assumptions, S.owner, (S.addbacks || []).map(a => a.accepted), (S.vendors || []).map(v => [v.accepted, v.pct])]);
  $('#main').innerHTML = `<h1>Step 4 · Questions: the plan and what to ask the seller</h1>
  <p class="lede">AI (${esc(V.models.analysis)}) writes the plan from the numbers you confirmed; it cannot change them. Each AI change comes with the exact instructions (“prompts”) to run in Claude Code at the company. Nothing sends a message or changes another system without a person approving it.</p>
  ${jobBox()}
  ${!P ? `<div class="panel row"><span class="note">Sends the confirmed profit numbers, team numbers, your guesses, the results of each change and the risks found. No individual payments.</span><div class="spacer"></div><button id="gen">Write the plan with AI</button></div>` : `
  ${stale ? `<div class="callout warn" style="margin-bottom:12px">Numbers changed since this plan was written (${esc(S.planAt)}). <span class="link" id="gen">Write it again</span></div>` : ''}
  <div class="panel"><p style="margin:0">${esc(P.summary)}</p><p class="note" style="margin-bottom:0">Written ${esc(S.planAt)} · <span class="link" id="gen2">Write it again</span></p></div>
  <h2>Changes to make</h2>
  ${(P.levers || []).map((l, i) => `<div class="card"><div class="meta"><span class="badge ${l.type === 'ai' ? 'gl' : ''}">${l.type === 'ai' ? 'AI change' : 'Business change'}</span><span class="badge">${esc(l.timing)}</span></div>
    <h3>${esc(l.title)}</h3><p>${esc(l.why)}</p>
    <ol>${(l.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="grid2"><div class="note"><b>A person checks:</b> ${esc(l.human_gate)}</div><div class="note"><b>Data and tools needed:</b> ${esc(l.data_and_tools)}</div></div>
    <p class="note"><b>How you’ll know it worked:</b> ${(l.kpis || []).map(esc).join(' · ')}<br><b>What could go wrong:</b> ${esc(l.risks)}</p>
    ${l.promptError ? `<div class="callout err">Prompt generation failed: ${esc(l.promptError)}</div>` : ''}${(l.prompts || []).map((p, j) => `<details ${i === 0 && j === 0 ? 'open' : ''}><summary>Claude Code prompt — ${esc(p.title)} <span class="note">(${esc(p.when)})</span></summary><div class="row" style="margin-top:6px"><button class="ghost" data-copy="${i}-${j}">Copy prompt</button></div><pre class="prompt" id="pr-${i}-${j}">${esc(p.prompt)}</pre></details>`).join('')}
  </div>`).join('')}
  <h2>First 100 days</h2><div class="grid3">${(P.first_100_days || []).map(w => `<div class="panel"><b>${esc(w.window)}</b><ul>${(w.actions || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
  <div class="grid2"><div><h2>Not worth doing, and why</h2><div class="panel">${(P.not_recommended || []).map(x => `<p><b>${esc(x.idea)}</b><br><span class="note">${esc(x.reason)}</span></p>`).join('') || '<p class="empty">None</p>'}</div></div>
  <div><h2>Questions for the seller</h2><div class="panel"><ol>${(P.questions_for_seller || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div></div></div>`}`;
  document.querySelectorAll('#gen,#gen2').forEach(b => b.onclick = () => runJob('ai/plan', 'Writing the step-by-step plan', V.models.analysis, 'plan'));
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { await navigator.clipboard.writeText($('#pr-' + b.dataset.copy).textContent); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy prompt', 1500); });
}

// ---------- log ----------
async function pLog() {
  const log = await api('log');
  $('#main').innerHTML = `<h1>Details: every request sent to the AI</h1><p class="lede">Every instruction (“prompt”) sent to the AI through your Claude Code, exactly as sent, with its answer. Nothing else leaves this computer. Click a line to open it.</p>
  ${log.length ? log.map(e => `<details><summary>${esc(e.purpose)} · ${esc(e.model)} · ${esc(new Date(e.at).toLocaleString())} · ${(e.ms / 1000).toFixed(1)}s${e.costUsd != null ? ' · $' + e.costUsd.toFixed(3) : ''}${e.error ? ' · <span class="neg">error</span>' : ''}</summary>
    ${e.error ? `<div class="callout err">${esc(e.error)}</div>` : ''}<p class="note">Prompt</p><pre class="prompt">${esc(e.prompt)}</pre><p class="note">Response</p><pre class="prompt">${esc(e.response)}</pre></details>`).join('') : '<p class="empty">No AI calls yet.</p>'}`;
}

keyboardAccess();
// any action that fails without its own message still tells the person (a lost note, a setting that didn't save)
window.addEventListener('unhandledrejection', e => { const m = e.reason?.message || String(e.reason || ''); if (m) toast(`That didn’t work: ${m}`, 'err'); });
Promise.all([api('state'), api('deals')]).then(([v, dl]) => { V = v; DL = dl; const st = V.derived.stage; page = st === 'levers' ? 'levers' : st; mode = 'simple'; render(); if (DL.busyJob) pollAll(DL.busyJob); }).catch(e => { $('#main').innerHTML = `<div class="callout err">Server not reachable: ${esc(e.message)}. Start it with <code>npm start</code> in demo/.</div>`; });


// =====================================================================
// SIMPLE MODE: upload → the work (5 steps) → results
// =====================================================================
const STAGES = ['Reading every payment', 'Working out today’s profit', 'Finding costs a new owner won’t pay', 'Finding ways to earn more', 'Checking if the price makes sense'];
const STAGE_WHY = ['We use the company’s own records, not the seller’s summary.', 'AI sorts the payments. Software does the math.', 'Like the owner’s car, or one-time projects.', 'Every dollar is traced back to a real payment.', 'So you know the deal works before you pay.'];
const k$ = v => kfmt(v);
const cap = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
const hrs = v => (Math.round((v || 0) / 50) * 50).toLocaleString();


function doneLine(i) {
  const S = V.state, d = V.derived;
  try {
    if (i === 0) { if (S.file?.kind !== 'gl') return `${num(S.accounts?.length)} statement lines read.`; const rows = (S.accounts || []).reduce((a, x) => a + x.count, 0), net = (S.accounts || []).reduce((a, x) => a + x.total, 0); return `${num(rows)} payments read. ${Math.abs(net) < 1 ? 'Nothing missing.' : 'Some may be missing.'}`; }
    if (i === 1) return `${V.profile?.name ? `${esc(cap(V.profile.name))}. ` : ''}Profit today: <b>${k$(d.normalization.reported)}</b> a year`;
    if (i === 2) return `<b>${k$((S.addbacks || []).reduce((a, x) => a + x.amount, 0))}</b> of costs a new owner won’t pay. ${(S.flags || []).length} things to check.`;
    if (i === 3) return `Could earn <b>${k$(d.levers.runRate)}</b> more a year`;
    if (i === 4) return `Offer price: <b>${k$(d.deal.price)}</b>. Each $1 invested could become <b>$${d.deal.base.net.moic.toFixed(2)}</b>.`;
  } catch { return ''; }
  return '';
}
const feedRows = lines => (lines || []).slice(-9).map((x, i, a) => `<li class="${i === a.length - 1 ? 'new' : ''}"><span>${x.t.toFixed(1)}s</span>${esc(x.text)}</li>`).join('');
function liveHTML(label, step, clock, lines) {
  const done = step >= 5;
  return `<div class="run2"><div class="rtop"><span class="note">${esc(label)}</span><span class="dots">${STAGES.map((_, i) => `<i class="${i < step ? 'd' : i === step ? 'c' : ''}"></i>`).join('')}</span><span class="clock" id="clock">${clock}</span></div>
  <h1 class="big">${done ? 'Done' : STAGES[step]}</h1><p class="gray">${done ? 'Here’s what we found.' : STAGE_WHY[step]}</p>
  <ul class="ticks">${STAGES.map((_, i) => i < step ? doneLine(i) : '').filter(Boolean).map(x => `<li>${x}</li>`).join('')}</ul>
  <div class="feedw"><small>What it’s doing right now</small><ul class="feed" id="feed">${feedRows(lines) || '<li><span>0.0s</span>Starting…</li>'}</ul></div></div>`;
}

function simple() {
  const S = V.state, d = V.derived;
  const main = $('#main');
  if (replay) { main.innerHTML = liveHTML('Replay of a real run · ' + (S.name || S.file?.name || ''), replay.step, replay.clock, replay.detail); return; }
  if (running?.all) {
    main.innerHTML = liveHTML(`Reading the books of: ${S.name || S.file?.name || ''} · ${S.file?.kind === 'pdf' ? 'a few minutes for a PDF' : 'about a minute'}`, running.step, ((Date.now() - running.t0) / 1000).toFixed(0) + 's', running.detail);
    return;
  }
  if (!S.file) {
    main.innerHTML = `<div class="sw center"><p class="kicker">For AION and its investors · ecommerce consulting firms: real profit, price and how to grow it</p><h1>See a company’s real profit, and how to grow it.</h1><p class="lede">EBITDA (profit before interest, tax and depreciation) is a company’s yearly profit from running the business, the number buyers price it on. This tool finds what it really is and how to raise it. For anyone buying, owning or investing in a business, in any industry. Answers in about a minute from a ledger, a few minutes from a PDF.</p>
      <div class="why3"><div><b>The problem</b><span>The profit a seller reports often includes the owner’s own pay and personal costs, so it can look better or worse than it really is.</span></div>
        <div><b>Why it matters</b><span>Small firms usually sell for about 3–5 years of profit (the “multiple”). So every $1 of yearly profit found or added makes the company worth about $3–5 more.</span></div>
        <div><b>What this does</b><span>It reads the company’s own records, works out the real profit, finds the 3 changes most likely to raise it, and checks whether the price makes sense.</span></div></div>
      <div class="drop big" id="drop"><b>Drop the company’s books here</b><div class="note">QuickBooks General Ledger (.xlsx or .csv) or a PDF · or click to choose</div><input type="file" id="file" accept=".xlsx,.xls,.csv,.pdf" hidden></div>
      <ol class="how3s"><li><b>1</b><span>Drop in the books</span><small>the record of every payment in and out (a QuickBooks General Ledger)</small></li><li><b>2</b><span>Watch it work</span><small>about a minute for a ledger, one step at a time</small></li><li><b>3</b><span>Get the plan</span><small>real profit, top 3 actions, first 100 days</small></li></ol>
      <p class="note"><label><input type="checkbox" id="mask" ${S.maskNames === false ? '' : 'checked'}> Hide customer and staff names from the AI</label></p></div>`;
    $('#mask').onchange = async e => { V = await api('mask', { on: e.target.checked }); };
    wireDrop(); return;
  }
  if (!S.plan || !d.levers) {
    main.innerHTML = `<div class="sw"><h1>${esc(S.name || S.file.name)}</h1><p class="lede">The books are uploaded but not analyzed yet. Analyzing reads every payment, works out real profit, finds the changes most likely to raise it and checks the price. About a minute for a ledger, a few minutes for a PDF.</p><div class="row" style="margin-top:16px"><button id="go">Analyze the books</button><span class="link" id="again">Close this deal</span></div></div>`;
    $('#go').onclick = startAll; $('#again').onclick = resetAll; return;
  }
  const n = d.normalization, L = d.levers, D = d.deal;
  const flags = [...(S.flags || [])].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] ?? 3) - ({ high: 0, medium: 1, low: 2 }[b.severity] ?? 3));
  const owners = V.checks.filter(c => c.key.startsWith('owner_acct:')).sort((a, b) => b.amount - a.amount);
  const big = owners[0];
  const otherQs = V.checks.filter(c => c !== big);
  const acts = topActions(S, d);
  const top = acts.slice(0, 3), rest = acts.slice(3);
  const pick = top.find(x => !x.pending)?.id;
  const aiCost = L.aiSkipped ? 0 : L.six.costs.software + L.six.costs.ongoing;
  const log = S.runLog || [];
  const qRow = c => `<div class="check"><div><b>${esc(c.q)}</b><div class="note">${esc(c.help)}</div></div>${c.type === 'number' ? `<div class="yn"><input type="number" min="0" step="${c.step}" data-num="${esc(c.key)}" value="${c.current}"></div>` : c.type === 'select' ? `<div class="yn"><select data-sel="${esc(c.key)}">${c.options.map(o => `<option value="${esc(o.k)}" ${o.k === c.current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>` : `<div class="yn"><button class="${c.current ? 'on' : ''}" data-k="${esc(c.key)}" data-v="1">Yes</button><button class="${!c.current ? 'on' : ''}" data-k="${esc(c.key)}" data-v="0">No</button></div>`}</div>`;

  // waterfall rows: seller → real → each action → AI costs → could reach
  const rows = [{ key: 'seller', lab: S.file?.kind === 'pdf' ? 'Reported profit' : 'What the seller says', sm: S.file?.kind === 'pdf' ? 'from the published statements' : 'profit in their books', cls: 'seller', a: 0, b: n.reported, v: k$(n.reported) },
    { key: 'real', lab: 'Real profit', sm: [n.ownerActual ? `+${k$(n.ownerActual)} owner pay` : '', n.addbacks ? `+${k$(n.addbacks)} one-off costs` : '', n.replacement ? `−${k$(n.replacement)} to pay whoever runs it` : ''].filter(Boolean).join(', ') || 'what a new owner can count on', cls: 'real', a: 0, b: n.normalized, v: k$(n.normalized) }, { div: 1 }];
  let run = n.normalized;
  top.forEach((x, i) => { if (x.pending) return; rows.push({ key: x.id, n: i + 1, lab: x.short, cls: 'up', a: run, b: run + x.value, v: '+' + k$(x.value) }); run += x.value; });
  const restV = rest.filter(x => !x.pending).reduce((s, x) => s + x.value, 0);
  if (Math.round(restV)) { rows.push({ key: 'rest', n: '+', lab: 'Smaller changes', cls: 'up', a: run, b: run + restV, v: '+' + k$(restV) }); run += restV; }
  if (aiCost) { rows.push({ key: 'aicost', n: '−', cost: 1, lab: 'AI software and running it', cls: 'down', a: run - aiCost, b: run, v: '−' + k$(aiCost) }); run -= aiCost; }
  rows.push({ div: 1 }, { key: 'end', lab: 'Could reach', sm: 'a year, if the actions work', cls: 'end', a: 0, b: d.proForma, v: k$(d.proForma), end: 1 });
  const allV = rows.filter(r => !r.div).flatMap(r => [r.a, r.b]), LO = Math.min(0, ...allV), HI = Math.max(1, ...allV), SPAN = (HI - LO) * 1.14 || 1, X = v => (v - LO) / SPAN * 100;
  const geo = r => ({ l: X(Math.min(r.a, r.b)), w: Math.max(0.5, X(Math.max(r.a, r.b)) - X(Math.min(r.a, r.b))), t: X(Math.max(r.a, r.b)) });
  const wf = rows.map(r => { if (r.div) return '<div class="wdiv"></div>'; const g = geo(r), p = PREV_GEO[r.key] || g; return `<div class="wl ${r.end ? 'end' : ''}">${r.n ? `<span class="wn ${r.cost ? 'cost' : ''}">${r.n}</span>` : ''}<span>${esc(r.lab)}${r.sm ? `<small>${esc(r.sm)}</small>` : ''}</span></div><div class="wt"><span class="wb ${r.cls}" data-g="${r.key}" style="left:${p.l}%;width:${p.w}%"></span><span class="wv ${r.cls}" data-gv="${r.key}" style="left:calc(${p.t}% + 8px)">${r.v}</span></div>`; }).join('');
  const NEXT = {}; rows.forEach(r => { if (!r.div) NEXT[r.key] = geo(r); });

  const card = (x, i) => `<article class="acard ${x.pending ? 'pending' : ''} ${x.id === pick ? 'pick' : ''}"><div class="arow"><span class="anum">${i + 1}</span>${x.kind === 'AI' ? '<span class="atag ai">AI</span>' : x.kind === 'Industry' ? `<span class="atag ind" title="${esc(cap(V.profile?.name || ''))}">Industry move</span>` : ''}${x.id === pick ? '<span class="atag start">Start here</span>' : ''}${x.pending ? '<span class="atag wait">Not counted yet</span>' : ''}</div>
    <div class="aamt">${x.pending ? 'up to ' : ''}+${k$(x.value)}<small>${x.pending ? 'a year, once the seller confirms it' : `more profit a year${x.extra ? ` · ${x.extra}` : ''}`}</small>${D && !x.pending ? `<small class="ev">≈ +${k$(x.value * D.multiple)} in company value, at ${D.multiple} years of profit</small>` : ''}</div>
    <h3>${esc(x.title)}</h3>
    ${x.proof ? `<div class="aproof">From ${x.src || 'the books'}: ${x.proof}</div>` : ''}
    <div class="ameta"><span><small>Owner</small>${esc(x.owner || '')}</span><span title="${esc(x.sureWhy || '')}"><small>How sure</small><i class="sure ${/^From|Confirmed/.test(x.sure) ? 'hi' : x.sure === 'Benchmark gap' ? 'mid' : 'lo'}"></i>${esc(x.sure || '')}</span></div>
    ${x.pending ? `<button class="acount" data-k="vendors" data-v="1">Count it in the plan</button>` : ''}<button class="abuild" data-build="${x.id}">How to do it</button></article>`;

  const dmax = D ? Math.max(D.base.net.moic, D.none.net.moic, D.downside.net.moic, 1) * 1.1 : 1;
  const dbar = (lab, r, cls) => `<div class="dcol"><div class="dtrack"><i class="${cls}" style="height:${r.net.moic / dmax * 100}%"></i></div><b>$${r.net.moic.toFixed(2)}</b><em>${r.net.irr == null ? '' : `about ${Math.round(r.net.irr * 100)}% a year`}</em><span>${lab}</span></div>`;

  main.innerHTML = `<div class="sw r2" data-show="${tab}">
    <div class="rhead"><button class="ichip" id="ind" title="Change the kind of business"><i></i>${esc(cap(V.profile?.name || 'business'))}<span>${V.profile?.subsectorLabel ? esc(V.profile.subsectorLabel) + (SUBSECTORS[V.profile.subsector]?.legacy ? ' (outside the buy box)' : '') + ' · ' : V.profile ? 'outside the buy box · ' : ''}change</span></button><div class="spacer" style="display:block;flex:1"></div>
      <button class="ghost" id="rp">▶ Replay</button><button class="ghost" id="pdf">1-page PDF</button><button class="ghost" id="xls">Excel</button></div>
    <nav class="dtabs">${[['overview', 'Real profit'], ['deal', 'Price & returns'], ['plan', 'Plan'], ['details', 'Questions & checks']].map(([k, l]) => `<button data-tab-btn="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>

    <section class="hero2" data-tab="overview">
      <h1>${Math.round(d.proForma) > Math.round(n.normalized) ? `Profit can grow from <span>${k$(n.normalized)}</span> to <span>${k$(d.proForma)}</span> a year` : `Real profit is <span>${k$(n.normalized)}</span> a year`}</h1>
      ${guide(S, d, top, pick, big)}
      ${S.file?.kind === 'pdf' ? `<p class="howline"><b>How this works:</b> profit here is EBITDA: operating profit from the published statements, before interest, tax and non-cash charges like depreciation. Each green bar is one change, priced from the company’s own accounts${aiCost ? '; the red bar is what the AI tools would cost' : ''}.</p>` : `<p class="howline"><b>How this works:</b> profit here is EBITDA (before interest, tax and depreciation). Real profit = profit in the books + the owner’s pay and one-off costs − the salary of a hired manager. Each green bar is one change, priced from the books${aiCost ? '; the red bar is what the AI tools would cost' : ''}.</p>`}
      <div class="wf">${wf}</div>
      ${checksStrip(S, d)}
    </section>

    ${big ? `<section class="unk" data-tab="overview"><div><b>Biggest unknown: is the ${k$(big.amount)} “${esc(big.account)}” the owner’s own pay?</b><span>${big.current ? 'Counted now as owner pay, so it’s added back to profit. Click No to see the difference.' : 'Counted now as staff pay. Click Yes to see profit if it’s the owner’s.'}</span></div>
      <div class="yn2"><button class="${big.current ? 'on' : ''}" data-k="${esc(big.key)}" data-v="1">Yes</button><button class="${!big.current ? 'on' : ''}" data-k="${esc(big.key)}" data-v="0">No</button></div></section>` : ''}

    <section data-tab="overview"><h2 class="h2">${top.length === 1 ? 'Your easiest win' : `Your ${top.length} easiest wins`} <span class="h2s">most profit for the least work; full list in Plan</span></h2><p class="howline"><b>How this works:</b> ranked by extra profit a year per week of work. “How sure” says where the number comes from: the books, an uploaded file, or a comparison with similar companies. <b>What to do:</b> start with the card marked “Start here”; “How to do it” gives the steps and a ready AI prompt.</p><div class="acards">${top.map(card).join('')}</div></section>

    ${sharper(S, d)}

    ${planTab(S, d, acts, pick)}
    ${bucketsHTML(S, d, acts)}
    ${hundredHTML(S, d, acts)}

    ${fitTab(S, d)}
    ${trendsTab(S, d)}
    ${dealMetrics(S, d)}
    ${D ? `<section class="deal2" data-tab="deal"><h2 class="h2">Is it a good deal for investors?</h2><p class="howline"><b>How this works:</b> the price is a number of years of real profit (the “multiple”). Part is paid with a bank loan at today’s rate; the rest is the buyer’s or investors’ own money. Then five years are run three ways: the plan works, nothing changes, profit falls 15%. All returns are after fees. <b>What to do:</b> pick who is buying below; the numbers update.</p>
      <div class="veh">${Object.entries(V.vehicles || {}).map(([k, v]) => `<button class="${D.vehicle === k ? 'on' : ''}" data-veh="${k}"><b>${esc(v.label)}</b><span>${esc(v.sub)}</span></button>`).join('')}</div>
      ${D.sba ? '' : `<div class="veh stake">${[[1, 'Full buyout', 'AION buys all of it'], [0.7, 'Majority stake', 'AION buys 70%, the owner keeps 30%']].map(([k, l, t]) => `<button class="${Math.abs((D.stake ?? 1) - k) < 0.01 ? 'on' : ''}" data-stake="${k}"><b>${l}</b><span>${t}</span></button>`).join('')}</div>`}
      <p>Buy ${(D.stake ?? 1) < 1 ? `<b>${Math.round(D.stake * 100)}%</b> of the company, valued at` : 'it for'} <b>${k$(D.price)}</b> (${D.multiple} years of profit). Paid with a <b>${k$(D.senior)}</b> bank loan, <b>${k$(D.seller)}</b> paid to the seller over the next few years (a seller note), ${(D.stake ?? 1) < 1 ? `<b>${k$(D.rollover)}</b> the owner keeps in the company (their ${Math.round((1 - D.stake) * 100)}%), ` : ''}and <b>${k$(D.investorEquity ?? D.equity)}</b> from ${D.sba ? 'the buyer' : 'investors'}. The seller gets about <b>${k$(D.sellerCashAtClose ?? (D.price - D.seller))}</b> in cash at closing. After 5 years, each $1 ${D.sba ? 'the buyer puts' : 'investors put'} in becomes:</p>
      <div class="dbars">${dbar('if the actions work', D.base, 'up')}${dbar('if nothing changes', D.none, 'flat')}${dbar(`if profit falls ${Math.round((D.downsideDrop ?? 0.15) * 100)}% and the firm is valued ${Math.round((D.downsideExitCut ?? 0) * 100)}% lower`, D.downside, 'down')}</div>
      <p class="dnote">${vehNote(D)}</p>
      <p class="dnext"><b>Offer about ${k$(D.price)}</b> once an accountant confirms the profit. ${(S.assumptions.vehicle || 'holdco') === 'holdco' ? `<b>Walk away above ${k$(n.normalized * PRICE.cap)}</b> (${PRICE.cap} years of profit, AION’s limit). Anything more is paid only as an earnout: later, and only if profit holds.${marketRange(n.normalized) ? ` <span class="note">${esc(marketRange(n.normalized).note)}</span>` : ''}` : `<b>Walk away above ${k$(n.normalized * 5)}</b> (5 years of profit, the top of the usual range for a business this size).`}</p>
      </section>` : ''}

    ${dealExtras(S, d)}
    ${runTab(S, d)}
    <section class="more2" data-tab="details"><p class="howline"><b>How this works:</b> every question, risk and calculation behind the numbers. Change an answer and everything updates. <b>What to do:</b> answer the questions you can; take the rest, and anything marked “important”, to the seller.</p>
      ${otherQs.length ? `<h3>Other questions for the seller</h3><div class="checks">${otherQs.map(qRow).join('')}</div>` : ''}
      <h3>What could go wrong</h3><ul class="found">${S.extra?.sales?.analysis?.top1 > 0.15 ? `<li><span class="sev high">important</span> One ${esc(V.profile?.customers === 'clients' ? 'client' : 'customer')} is ${pct(S.extra.sales.analysis.top1)} of sales (${esc(S.extra.sales.analysis.topCustomers[0].customer)})</li>` : ''}${S.extra?.payroll?.analysis?.top3Share > 0.3 ? `<li><span class="sev medium">check</span> The top 3 earners take ${pct(S.extra.payroll.analysis.top3Share)} of all pay. Make sure they stay.</li>` : ''}${(d.limits || []).map(x => `<li><span class="sev medium">check</span> ${esc(x)}</li>`).join('')}${flags.filter(f => !(S.extra?.sales?.analysis && /concentrat/i.test(f.title))).slice(0, 6).map(f => `<li><span class="sev ${esc(f.severity)}">${f.severity === 'high' ? 'important' : 'check'}</span> <b>${esc(f.title)}.</b> <span class="note">${esc(String(f.detail || '').split(/(?<=\.)\s/)[0])}</span></li>`).join('')}</ul>
      ${nextSteps(S, d, V.checks)}
      ${rest.length ? `<h3>Smaller changes</h3><ul class="found">${rest.map(x => `<li>${esc(x.title)} <b>${x.pending ? 'up to ' : ''}+${k$(x.value)}</b>${x.pending ? ' <span class="note">not counted until the seller confirms it (question above)</span>' : ''}</li>`).join('')}</ul>` : ''}
      <h3>AI time savings</h3><p>Listed in the plan as builds, but not counted in profit: the hours they would save aren’t in the books. Have the team track their hours for a month and they can be sized.</p>
      <h3>How each number was worked out</h3>${howBlock(S, d)}
      <div class="assume">Change the guesses: prices <input type="number" data-a="pricing_uplift" data-p="1" value="${+(S.assumptions.pricing_uplift * 100).toFixed(1)}" step="0.5">% higher on new work · <input type="number" data-a="demand_searches" value="${S.assumptions.demand_searches}" step="1"> extra jobs won a year · $<input type="number" data-a="implementation" value="${S.assumptions.implementation}" step="5000"> one-time AI setup${D ? ` · pay <input type="number" class="mult" data-a="entry_multiple" value="${D.multiple}" step="0.25" min="1"> years of profit, borrow <input type="number" class="mult" data-a="senior_multiple" value="${S.assumptions.senior_multiple}" step="0.25" min="0"> years of profit from the bank · deal costs <input type="number" data-a="fee_rate" data-p="1" value="${+((S.assumptions.fee_rate ?? 0.1) * 100).toFixed(1)}" step="1" min="0" max="30">% of the price (quality-of-earnings review, legal, lender; usually 8–12%) · bought as <select data-a="deal_form">${[['asset', 'assets (price written off for tax)'], ['stock', 'shares (no tax write-off)'], ['f_reorg', 'F-reorganization (write-off on the share bought)']].map(([k, l]) => `<option value="${k}" ${(S.assumptions.deal_form || 'asset') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${D.capped ? ` <span class="note">The revenue-based price was held to ${PRICE.cap} years of profit, AION’s limit.</span>` : ''}` : ''}. Everything updates.</div>
      ${(S.runDetail || log).length ? `<details class="more2"><summary>Every step AION took, in order (${(S.runDetail?.length ? S.runDetail : log).length})</summary><ul class="loglist">${(S.runDetail?.length ? S.runDetail : log).map(e => `<li>${esc(e.text)}<span>${e.t.toFixed(1)}s</span></li>`).join('')}</ul></details>` : ''}
      <div class="row foot2"><span class="link" id="math">Check every number, step by step</span><span class="link" id="log">Details: every request sent to the AI</span><span class="link" id="rerun">Run the AI again</span><span class="link" id="again">Close this deal</span></div>
    </section>
  </div>`;

  // animate bars from their previous position to the new one
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const [key, g] of Object.entries(NEXT)) {
      const b = main.querySelector(`[data-g="${key}"]`), v = main.querySelector(`[data-gv="${key}"]`);
      if (b) { b.style.left = g.l + '%'; b.style.width = g.w + '%'; } if (v) v.style.left = `calc(${g.t}% + 8px)`;
    }
    PREV_GEO = NEXT;
  }));
  document.querySelectorAll('.yn button, .yn2 button, .acount').forEach(b => b.onclick = async () => { V = await api('answer', { key: b.dataset.k, value: b.dataset.v === '1' }); render(); });
  document.querySelectorAll('[data-num]').forEach(i => i.onchange = async () => { V = await api('answer', { key: i.dataset.num, value: +i.value }); render(); });
  document.querySelectorAll('[data-sel]').forEach(x => x.onchange = async () => { V = await api('answer', { key: x.dataset.sel, value: x.value }); render(); });
  document.querySelectorAll('[data-a]').forEach(x => x.onchange = async () => { const v = x.dataset.p ? x.value / 100 : x.value; V = await api('assumptions', { assumptions: { [x.dataset.a]: v } }); render(); });
  document.querySelectorAll('[data-xpick]').forEach(b => b.onclick = () => main.querySelector(`[data-xfile="${b.dataset.xpick}"]`).click());
  document.querySelectorAll('[data-xfile]').forEach(i => i.onchange = () => sendExtra(i.dataset.xfile, i.files[0]));
  document.querySelectorAll('[data-xrm]').forEach(l => l.onclick = async () => { V = await api('extra', { type: l.dataset.xrm, remove: true }); render(); });
  document.querySelectorAll('[data-xdrop]').forEach(z => { z.ondragover = e => { e.preventDefault(); z.classList.add('over'); }; z.ondragleave = () => z.classList.remove('over'); z.ondrop = e => { e.preventDefault(); z.classList.remove('over'); sendExtra(z.dataset.xdrop, e.dataTransfer.files[0]); }; });
  document.querySelectorAll('[data-veh]').forEach(b => b.onclick = async () => { V = await api('assumptions', { assumptions: { vehicle: b.dataset.veh } }); render(); });
  document.querySelectorAll('[data-stake]').forEach(b => b.onclick = async () => { V = await api('assumptions', { assumptions: { stake: +b.dataset.stake } }); render(); });
  document.querySelectorAll('[data-build]').forEach(b => b.onclick = () => { const x = acts.find(y => y.id === b.dataset.build); openBuild({ ...x, basisText: basisOf(x, d, S) }); });
  wireGrow(); wireFit();
  { const QR = queueRows(S, d, acts); document.querySelectorAll('tr.qrow').forEach(r => r.onclick = () => { const x = QR[+r.dataset.q]; openBuild({ ...x, basisText: x.priced ? basisOf(x, d, S) : '' }); }); }
  $('#ind').onclick = async () => { const nm = prompt('What kind of business is this? (e.g. retail placement firm, Amazon marketplace agency, ecommerce analytics consultancy)', V.profile?.name || ''); if (!nm || nm.trim() === V.profile?.name) return; try { V = await api('industry', { name: nm }); startAll(); } catch (e) { showError(e.message); } };
  document.querySelectorAll('[data-tab-btn]').forEach(b => b.onclick = () => { tab = b.dataset.tabBtn; main.querySelector('.r2').dataset.show = tab; document.querySelectorAll('[data-tab-btn]').forEach(x => x.classList.toggle('on', x === b)); window.scrollTo({ top: 0 }); });
  document.querySelectorAll('[data-go-tab]').forEach(b => b.onclick = () => main.querySelector(`[data-tab-btn="${b.dataset.goTab}"]`)?.click());
  if ($('#xls')) $('#xls').onclick = () => busy($('#xls'), 'Building…', async () => { try { const r = await fetch('/api/excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!r.ok) throw new Error((await r.json()).error); const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = `AION ${S.name || 'analysis'}.xlsx`; a.click(); } catch (e) { showError(e.message); } });
  if ($('#oc-go')) $('#oc-go').onclick = runOutside;
  document.querySelectorAll('[data-cfile]').forEach(i => i.onchange = () => sendCheckin(i.files[0]));
  document.querySelectorAll('[data-cpick]').forEach(b => b.onclick = () => main.querySelector('[data-cfile]').click());
  if ($('#c-rm')) $('#c-rm').onclick = async () => { V = await api('checkin', { remove: true }); render(); };
  const cz = main.querySelector('[data-cdrop]'); if (cz) { cz.ondragover = e => { e.preventDefault(); cz.classList.add('over'); }; cz.ondragleave = () => cz.classList.remove('over'); cz.ondrop = e => { e.preventDefault(); cz.classList.remove('over'); sendCheckin(e.dataTransfer.files[0]); }; }
  if ($('#price-rev')) $('#price-rev').onclick = async () => { V = await api('assumptions', { assumptions: { price_basis: 'revenue' } }); render(); };
  $('#rp').onclick = startReplay;
  $('#pdf').onclick = () => busy($('#pdf'), 'Building…', async () => { try { const r = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!r.ok) throw new Error((await r.json()).error); const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = 'AION summary.pdf'; a.click(); } catch (e) { showError(e.message); } });
  $('#rerun').onclick = async () => { if (!confirm('Run the AI again? Saved answers are replaced, so numbers may change.')) return; try { const { job } = await api('ai/all', { fresh: true }); pollAll(job); } catch (e) { showError(e.message); } };
  $('#math').onclick = () => { mode = 'detail'; page = 'levers'; render(); };
  $('#log').onclick = () => { mode = 'detail'; page = 'log'; render(); };
  $('#again').onclick = resetAll;
}

let PREV_GEO = {};
// the guide: what the tool did, what it found, what to do next — built from the numbers, no AI
function guide(S, d, top, pick, big) {
  const n = d.normalization, L = d.levers, D = d.deal, rows = (S.accounts || []).reduce((a, x) => a + x.count, 0);
  const counted = top.filter(x => !x.pending), sum = counted.reduce((t, x) => t + x.value, 0), pi = top.findIndex(x => x.id === pick);
  const ask = big && !big.current ? `Then answer one question below: it could change profit by ${k$(big.amount)}.` : '';
  return `<div class="guide"><p>I read <b>${S.file?.kind === 'pdf' ? `${num(S.accounts?.length)} statement lines` : `${num(rows)} payments`}</b> from this ${esc(V.profile?.name || 'business')}. Real profit is <b>${k$(n.normalized)}</b> a year.</p>
    ${L.runRate > 0 ? `<p>I found ways to add <b>${k$(L.runRate)}</b> a year${D ? `, about <b>${k$(L.runRate * D.multiple)}</b> in company value` : ''}. Each green bar below is one of them.</p>` : `<p>No extra profit is counted yet${top.some(x => x.pending) ? ': the ideas below count once the seller confirms them' : ''}.</p>`}
    ${pi >= 0 ? `<p>Start with <b>#${pi + 1}</b>: the most profit for the least work. ${ask}</p>` : ask ? `<p>${ask}</p>` : ''}</div>`;
}
// every check the tool ran, in plain words
function checksStrip(S, d) {
  const t = d.pnl.TTM, ex = S.extra || {}, items = [];
  const net = (S.accounts || []).reduce((a, x) => a + x.total, 0);
  if (S.file?.kind === 'gl') items.push(Math.abs(net) < 1 ? ['ok', 'Books balance to the cent'] : ['warn', 'Books don’t balance']);
  if ((S.addbacks || []).length) items.push(['ok', 'Every one-off cost tied to real payments']);
  const near = (a, b) => b && Math.abs(a / b - 1) < 0.03;
  if (ex.sales?.analysis) items.push(near(ex.sales.analysis.total, t.revenue) ? ['ok', 'Sales file matches the books'] : ['warn', 'Sales file doesn’t match the books']);
  const wages = ['comp_producers', 'comp_admin', 'comp_owner'].reduce((x, k) => x + (t.byCat?.[k] || 0), 0);
  if (ex.payroll?.analysis) items.push(near(ex.payroll.analysis.total, wages) ? ['ok', 'Payroll matches the books'] : ['warn', 'Payroll doesn’t match the books']);
  if (ex.payroll?.analysis?.market?.length) items.push(['ok', 'Pay compared to US government data']);
  if (d.rates) items.push(['ok', 'Today’s loan rate (Federal Reserve)']);
  const m = V.profile?.margin, mine = t.revenue ? d.normalization.normalized / t.revenue : 0, pr = d.peer;
  if (pr) { const when = pr.date ? new Date(pr.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''; items.push([mine > pr.ebitda * 1.5 ? 'warn' : mine < pr.ebitda * 0.6 ? 'info' : 'ok', `Profit ${pct(mine)} of sales vs ${pct(pr.ebitda)} for large US companies in ${pr.industry} (${pr.firms} firms, NYU Stern, ${when})${mine > pr.ebitda * 1.5 ? '. Check closely.' : ''}`]); }
  else if (m) items.push(mine > m.high * 1.25 ? ['warn', `Profit ${pct(mine)} of sales: higher than usual (${pct(m.low)}–${pct(m.high)}). Check closely.`] : mine < m.low ? ['info', `Profit ${pct(mine)} of sales: below usual (${pct(m.low)}–${pct(m.high)}), room to improve`] : ['ok', `Profit ${pct(mine)} of sales: normal for this industry`]);
  items.push(['ok', 'AI sorts and flags. Software does all the math.']);
  const ok = items.filter(x => x[0] === 'ok'), look = items.filter(x => x[0] !== 'ok');
  return `${look.length ? `<ul class="checksr">${look.map(([c, t]) => `<li class="${c}">${c === 'warn' ? '⚠' : '•'} ${esc(t)}</li>`).join('')}</ul>` : ''}
    <details class="checksum"><summary>✓ ${ok.length} checks passed${look.length ? ` · ${look.length} to look at` : ''}</summary><ul class="checksr">${ok.map(([, t]) => `<li class="ok">✓ ${esc(t)}</li>`).join('')}</ul></details>`;
}
function sharper(S, d) {
  const ex = S.extra || {}, t = d.pnl.TTM, PRf = V.profile || {};
  const check = (have, books, what) => { if (!books) return ''; const diff = have / books - 1; return Math.abs(diff) < 0.03 ? `<span class="okc">✓ Matches the ${what} in the books</span>` : `<span class="warnc">⚠ ${pct(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the ${what} in the books. Check it covers the same 12 months.</span>`; };
  const pay = ex.payroll?.analysis, sal = ex.sales?.analysis;
  const wages = ['comp_producers', 'comp_admin', 'comp_owner'].reduce((x, k) => x + (t.byCat?.[k] || 0), 0);
  const tile = (type, title, adds, a, body) => `<div class="xtile ${a ? 'have' : ''}" data-xdrop="${type}">
    <div class="xt"><b>${title}</b>${a ? `<span class="link" data-xrm="${type}">remove</span>` : '<span class="xopt">optional</span>'}</div>
    ${a ? body : `<p>${adds}</p><button class="ghost sm" data-xpick="${type}">Choose file</button><span class="note"> or drop it here</span>`}
    <input type="file" accept=".xlsx,.xls,.csv" hidden data-xfile="${type}"></div>`;
  return `<section data-tab="overview"><h2 class="h2">Make the plan sharper <span class="h2s">Add two more reports. The chart updates in a second.</span></h2><p class="howline"><b>How this works:</b> add a QuickBooks payroll or sales report. It’s checked against the books, then adds levers like overtime or below-normal prices.</p><div class="xtiles">
    ${tile('payroll', 'Staff and pay', 'Adds overtime, pay for each role, and who the business depends on. QuickBooks: Payroll Summary by Employee.', pay, pay ? `<p class="xf">${esc(ex.payroll.file)}</p><ul><li><b>${pay.people}</b> people, <b>${k$(pay.total)}</b> a year</li><li><b>${k$(pay.overtime.total)}</b> overtime (${pct(pay.overtime.share)} of pay)</li>${(pay.market || []).sort((a, b) => Math.abs(b.base / b.market - 1) - Math.abs(a.base / a.market - 1)).slice(0, 2).map(m => `<li>${esc(m.role)}: <b>${k$(m.base)}</b> base vs <b>${k$(m.market)}</b> US average <span class="${m.base > m.market ? 'hi' : 'lo'}">(${m.base > m.market ? '+' : '−'}${pct(Math.abs(m.base / m.market - 1))})</span></li>`).join('')}<li>Top 3 earners: <b>${pct(pay.top3Share)}</b> of all pay</li></ul>${check(pay.total, wages, 'pay')}` : '')}
    ${tile('sales', `Sales by ${PRf.customers === 'clients' ? 'client' : 'customer'}`, `Adds who pays below normal prices, and which ${PRf.customers || 'customers'} and services make the money. QuickBooks: Sales by Customer Detail.`, sal, sal ? `<p class="xf">${esc(ex.sales.file)}</p><ul><li><b>${sal.customers}</b> ${esc(PRf.customers || 'customers')}; the biggest is <b>${pct(sal.top1)}</b> of sales</li><li><b>${sal.underCount}</b> pay below normal prices (<b>${k$(sal.underGap)}</b> a year)</li><li>Top service: ${esc(sal.items[0]?.item || '')} (${k$(sal.items[0]?.amount || 0)})</li></ul>${check(sal.total, t.revenue, 'sales')}` : '')}
  </div></section>`;
}
async function sendExtra(type, f) {
  if (!f) return;
  const b64 = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = bad; r.readAsDataURL(f); });
  try { V = await api('extra', { type, filename: f.name, data: b64 }); render(); } catch (e) { showError(e.message); }
}
function vehNote(D) {
  const v = V.vehicles?.[D.vehicle] || {}, nt = D.base.net, R = V.derived?.rates, dd = D.downside.minDscr;
  const who = v.sba ? 'The buyer gets' : 'Investors get';
  const cash = v.sells ? `${who} <b>${k$(nt.cash)}</b> back, including the sale in year 5.` : `${who} <b>${k$(nt.cash)}</b> in cash over 5 years and still own the company (about <b>${k$(nt.stillOwned)}</b>).`;
  const fees = !v.fee && !v.close && !v.share ? 'No fees.' : `After ${v.fee ? `a ${v.fee * 100}% yearly fee` : `a ${v.close * 100}% closing fee`}${v.share ? ` and the team’s ${Math.round(v.share * 100)}% share` : ''} (typical terms for this kind of owner, used as an example).`;
  const rate = `Loan rate ${(D.rate * 100).toFixed(2)}%${R ? ` (prime ${(R.prime * 100).toFixed(2)}% + ${((D.rate - R.prime) * 100).toFixed(2)}%, Federal Reserve, ${new Date(R.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})` : ''}.`;
  return `${cash} ${fees}<br>${dd >= 1.25 ? '✓' : '⚠'} Bank check: in a bad year, profit covers loan payments <b>${dd.toFixed(1)}×</b> (banks want 1.25×). ${rate}`;
}
// Step-by-step instructions for the standard levers: who does it, exactly what, and what it produces.
const LEVER_STEPS = {
  pricing: ['Office manager: export last year’s invoices from QuickBooks (Sales by Customer Detail) and send them to the owner.', 'Owner: write a one-page price list for each service, using the most common price charged last year as the standard.', 'Owner: mark every client billed below that price and decide, account by account, whether to move them up at the next renewal.', 'Owner: set one rule — any discount over 5% needs your sign-off in writing.', 'Sales lead: use the new price list on every new quote from this week on; record the price on each quote.', 'Office manager: each month, report the average price billed and the share of jobs discounted, and compare with last month.'],
  billing: ['Office manager: export the open-invoices (A/R aging) report from QuickBooks and list every invoice older than 30 days.', 'Office manager: from now on, send each bill the same day the work is done, using one invoice template.', 'Office manager: set automatic email reminders in QuickBooks at 15 and 30 days past due.', 'Owner: call every client with a balance over 45 days, starting with the largest.', 'Owner: approve any write-off in writing; nothing is written off without it.', 'Office manager: each Monday, report days to get paid and money owed over 45 days.'],
  vendors: ['Office manager: export last year’s payments by vendor from QuickBooks and list every supplier, tool and subscription with its yearly cost.', 'Owner: mark tools that do the same job, seats nobody uses, and the three largest suppliers.', 'Office manager: cancel unused seats and overlapping tools; confirm each cancellation in writing.', 'Owner: get two written quotes for each of the three largest suppliers.', 'Owner: switch or renegotiate where a quote is lower; sign the new terms.', 'Office manager: each quarter, compare supplier spend with the same quarter last year.'],
  discounts: ['Office manager: export Sales by Customer Detail from QuickBooks for the last 12 months.', 'Owner: for each service, note the usual price and list clients paying more than 10% below it (the tool shows this list).', 'Owner: decide for each listed client: move to the usual price at renewal, or keep the discount with a written reason.', 'Owner: tell each client 30 days before renewal, in a short letter, what the new price is and why.', 'Office manager: apply the new prices in QuickBooks from the renewal date.', 'Owner: each quarter, check that average price billed is closer to the usual price and that clients were kept.'],
  overtime: ['Operations lead: export the payroll summary by employee and list who worked overtime last month, and on which jobs.', 'Operations lead: build next week’s schedule on Friday, spreading work so nobody passes 40 hours where possible.', 'Operations lead: require approval in advance for any overtime; record the reason.', 'Owner: review the overtime report every Monday with the operations lead.', 'Operations lead: each month, report overtime pay and jobs finished per person.'],
};
const BUILDS = {
  pricing: { what: 'A price check before every new proposal', how: ['Enter the client and the work', 'It shows the standard price and past discounts', 'A partner approves any discount'],
    prompts: [{ when: 'Before each proposal', prompt: 'You review price proposals for our company.\nCompare the proposed price with our standard price and with the last 10 prices for similar work (in inputs/past_prices.csv).\nSay in one line whether it is below standard, by how much, and who must approve it.\nRules: draft only; a person decides.\n\nProposal: <paste>' }] },
  billing: { what: 'Invoice reminders, checked by a person', how: ['Each night it lists bills due or late', 'It drafts a polite reminder', 'Someone in the office clicks send'],
    prompts: [{ when: 'Each night', prompt: 'Read inputs/open_invoices.csv. List every invoice that is due in 3 days or late.\nFor each, draft a short, friendly reminder (under 80 words) with the amount, the due date and how to pay.\nSave drafts to outputs/reminders.md. Never send anything yourself.' }] },
  vendors: { what: 'One list of every tool and subscription, with overlaps flagged', how: ['Export last year’s card and bill payments', 'AI groups them by tool and flags overlaps', 'The owner decides what to cancel'],
    prompts: [{ when: 'Once', prompt: 'Read inputs/payments.csv. Group every software, data and subscription payment by vendor.\nFor each vendor show yearly cost, number of seats if visible, and any other vendor that does the same job.\nSave to outputs/tools.md, biggest savings first. Draft only; a person decides.' }] },
};
function topActions(S, d) {
  const L = d.levers, a = S.assumptions, o = S.ops || {}, lev = k => (S.plan?.levers || []).find(l => l.key === k);
  const out = [];
  if (L.nonAI.pricing > 0) {
    const base = a.pricing_uplift ? L.nonAI.pricingRevenue / a.pricing_uplift : 0;
    out.push({ id: 'pricing', kind: 'Business', owner: 'Owner and sales lead', sure: 'Benchmark gap', sureWhy: L.nonAI.pricingBasis, kpis: ['Average price per job', 'Share of jobs discounted', 'Win rate on quotes'], value: L.nonAI.pricing, short: `Raise prices ${+(a.pricing_uplift * 100).toFixed(1)}%`, title: `Raise prices ${+(a.pricing_uplift * 100).toFixed(1)}% on new work`,
      proof: `<b>${k$(base)}</b> of ${V.profile?.kind === 'general' ? 'sales' : 'fees'} a year${o.avg_fee ? ` · average <b>${money(o.avg_fee)}</b> per ${esc(V.profile?.job || 'job')}` : ''}`,
      steps: LEVER_STEPS.pricing, gate: lev('pricing')?.human_gate, ...BUILDS.pricing });
  }
  if (L.nonAI.writeoffs > 0 || d.cashRelease > 0) {
    const bad = d.pnl.TTM.byCat?.bad_debt || 0;
    out.push({ id: 'billing', kind: 'Business', owner: 'Office manager', sure: 'From the books', sureWhy: 'write-offs and payment times come straight from the books', kpis: ['Days to get paid', 'Money owed over 45 days', 'Write-offs'], value: L.nonAI.writeoffs || 0, score: (L.nonAI.writeoffs || 0) + ((L.nonAI.writeoffs || 0) ? 0 : (d.cashRelease || 0) * 0.15), short: 'Bill on time, chase late invoices', title: 'Bill on time and chase late invoices',
      extra: d.cashRelease ? `plus ${k$(d.cashRelease)} cash, once` : '',
      proof: [d.dso != null ? `clients take about <b>${Math.round(d.dso)} days</b> to pay` : '', bad ? `<b>${k$(bad)}</b> written off last year` : ''].filter(Boolean).join(' · '),
      steps: LEVER_STEPS.billing, gate: lev('writeoffs')?.human_gate, ...BUILDS.billing });
  }
  const vd = S.vendors || [], counted = L.nonAI.vendors > 0;
  if (vd.length) out.push({ id: 'vendors', kind: 'Business', owner: 'Owner', sure: counted ? 'Confirmed' : 'Not counted', sureWhy: 'spend is from the books; the saving counts once quotes confirm it', kpis: ['Supplier spend as a share of sales', 'Number of tools and subscriptions'], value: counted ? L.nonAI.vendors : vd.reduce((s, v) => s + v.amount, 0), pending: !counted, short: 'Cut supplier and tool costs', title: 'Cut supplier and tool costs',
    proof: vd.filter(v => counted ? v.accepted : true).sort((x, y) => y.amount - x.amount).slice(0, 2).map(v => `${esc(v.label.toLowerCase())} <b>${k$(v.amount)}</b>`).join(' · '),
    steps: LEVER_STEPS.vendors, ...BUILDS.vendors });
  if (L.ai > 0 && !L.aiSkipped) {
    const aiLevers = (S.plan?.levers || []).filter(l => l.type === 'ai').map(l => ({ l, w: L.workflows.find(w => w.key === l.workflow_key) })).filter(x => x.w).sort((x, y) => y.w.hoursSaved - x.w.hoursSaved);
    const pw = L.workflows.filter(w => w.who !== 'admin'), H = pw.reduce((s, w) => s + w.hoursPerWeek, 0);
    const t = aiLevers[0];
    out.push({ id: 'ai', kind: 'AI', owner: 'Operations lead', sure: 'Estimate', sureWhy: 'time spent isn’t in the books, so hours are estimated', kpis: ['Hours per job', 'Jobs per person per month', 'Share of drafts used with light edits'], value: L.ai, short: 'AI frees up staff time', title: 'AI frees up staff time for more work',
      extra: `before ${k$(L.six.costs.software + L.six.costs.ongoing)} of AI costs`,
      proof: o.producers && H ? `<b>${num(o.producers)} ${esc(V.profile?.workers || 'people')}</b> spend about <b>${num(H)} hours a week</b> each on ${V.profile?.kind === 'general' ? 'quotes, emails, notes and scheduling' : 'research, emails and notes'} (estimate)` : '',
      steps: [t?.l.steps?.[0] || 'Pick the two busiest people to start', t?.l.steps?.[1] || 'AI drafts the routine work; people approve it', `Use the time saved for ${num(L.six.extraSearches, 0)} more ${esc(V.profile?.jobs || 'jobs')} a year`],
      what: t ? `${t.l.title}, then the next ${Math.min(2, aiLevers.length - 1)} tasks` : 'An AI assistant for the team’s routine work', how: t?.l.steps || [], gate: t?.l.human_gate,
      prompts: aiLevers.slice(0, 3).flatMap(x => (x.l.prompts || []).slice(0, 1).map(p => ({ when: `${x.l.title} · ${p.when}`, prompt: p.prompt }))) });
  }
  const PRf = V.profile || {};
  for (const x of (d.industryLevers || []).filter(y => y.value > 0)) out.push({ id: x.id, kind: 'Industry', value: x.value, cost: x.cost, weeks: x.weeks, short: x.title, title: x.title, proof: `${esc(String(x.why || '').split(/(?<=[.!?])\s/)[0])}<br><span class="note">${esc(x.basis)}</span>`,
    steps: x.steps, owner: x.owner, sure: x.sure, sureWhy: x.assumptionWhy, kpis: x.kpis, what: `A simple tracker and checklist for: ${x.title.toLowerCase()}`, how: x.steps,
    prompts: [{ when: 'One-time setup', prompt: `I run a ${PRf.name || 'business'}. Help me carry out this plan: "${x.title}".\nWhy it matters for us: ${x.why}\nSteps: ${(x.steps || []).join(' / ')}\nTargets: ${(x.kpis || []).join('; ')}\nDraft: (1) a one-page checklist for the owner, (2) any scripts, price sheets or templates the team needs, (3) a weekly tracker with the targets above. Keep it practical and short. Draft only; I decide.` }] });
  for (const x of d.extraLevers || []) {
    if (x.id === 'discounts' && x.value > 0) {
      const b = x.basis, avg = b.top.length ? b.top.reduce((t, g) => t + g.avgBelow, 0) / b.top.length : 0;
      out.push({ id: 'discounts', kind: 'Business', value: x.value, src: 'the sales file', short: `Bring ${b.count} ${PRf.customers || 'customers'} to normal prices`, title: `Bring ${b.count} ${PRf.customers || 'customers'} up to normal prices`, file: true,
        proof: `<b>${b.count} ${esc(PRf.customers || 'customers')}</b> pay about <b>${pct(avg)}</b> less than others for the same work, <b>${k$(b.gap)}</b> a year in total`,
        steps: LEVER_STEPS.discounts,
        owner: 'Owner', sure: 'From the sales file', sureWhy: `prices come from the sales file; we count only ${Math.round(x.capture * 100)}% of the gap, since some will push back`, kpis: ['Average price vs. normal price', `${cap(PRf.customers || 'customers')} kept after the change`],
        what: 'A discount check before every renewal', how: ['Each month it lists accounts priced below normal', 'It shows the gap and the history', 'The owner decides what to change'],
        prompts: [{ when: 'Monthly', prompt: `Read inputs/sales_detail.csv (customer, product or service, quantity, price). For each product or service, find the usual price (the median).\nList customers paying more than 10% below the usual price, with the gap in dollars per year and the products affected.\nSave to outputs/discounts.md, biggest gap first. Draft only; the owner decides.` }] });
    }
    if (x.id === 'overtime' && x.value > 0) {
      const b = x.basis;
      out.push({ id: 'overtime', kind: 'Business', value: x.value, src: 'the payroll file', short: 'Cut overtime', title: 'Cut overtime with better scheduling', file: true,
        proof: `<b>${k$(b.total)}</b> of overtime pay last year across <b>${b.people}</b> people${b.top[0] ? `; the top 3 earned ${k$(b.top.reduce((t, p) => t + p.ot, 0))} of it` : ''}`,
        steps: LEVER_STEPS.overtime,
        owner: 'Operations lead', sure: 'From the payroll file', sureWhy: `overtime comes from the payroll file; we assume ${Math.round(x.cut * 100)}% can move to regular hours`, kpis: ['Overtime pay per month', 'Jobs finished per person'],
        what: 'A weekly overtime report with a draft schedule', how: ['It reads last week’s hours', 'It flags who is over and suggests a fairer split', 'A manager approves the schedule'],
        prompts: [{ when: 'Weekly', prompt: 'Read inputs/hours.csv (person, date, regular hours, overtime hours) and inputs/next_week_jobs.csv.\nList who worked overtime last week and why (which jobs).\nDraft next week\'s schedule that keeps everyone under 40 hours where possible, in outputs/schedule_draft.csv. Draft only; a manager approves.' }] });
    }
  }
  // ecommerce levers measured straight from the books (the rest are listed in the plan as not counted)
  for (const x of (d.ecomLevers || []).filter(y => y.counted && y.value > 0)) out.push({ id: x.id, kind: 'Business', value: x.value, short: x.title, title: x.title, owner: 'Owner and bookkeeper', sure: x.sure, sureWhy: 'paid and billed amounts come straight from the books',
    proof: x.facts.map(esc).join(' · '), steps: x.steps, kpis: x.kpis, basisText: x.basis });
  // top actions: easiest to make happen among those that raise EBITDA
  return out.sort((x, y) => easeScore(y, d) - easeScore(x, d) || (y.score ?? y.value) - (x.score ?? x.value));
}
function openBuild(x) {
  if (!x) return;
  const s = document.createElement('div'); s.className = 'scrim';
  s.innerHTML = `<div class="drawer" role="dialog" aria-label="How to do it">
    <div class="row"><span class="atag ${x.kind === 'AI' ? 'ai' : ''}">How to do it</span><div class="spacer"></div><button class="ghost" id="dcl">Close</button></div>
    <h3>${esc(x.title)}</h3>
    <div class="dwhat"><div><small>Step by step</small><ol class="dsteps">${(x.steps || []).map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>${x.basisText || x.note ? `<div><small>How the number is worked out</small>${esc(x.basisText || x.note)}</div>` : ''}
      ${x.what ? `<div><small>What to build</small>${esc(x.what)}</div>` : ''}
      ${x.how?.length ? `<div><small>How the tool works</small>${x.how.map((h, i) => `${i + 1}. ${esc(h)}`).join('<br>')}</div>` : ''}
      <div><small>Extra profit a year (EBITDA)</small>${x.value > 0 ? `+${k$(x.value)} a year once fully running${x.real ? ` · realistic +${k$(x.real)}, after a discount for how sure the number is` : ''}${x.extra ? ` · ${esc(x.extra)}` : ''}` : 'Not counted in profit yet: no number from the books'}</div>
      ${x.kpis?.length ? `<div><small>How you’ll know it worked</small>${x.kpis.map(esc).join(' · ')}</div>` : ''}
      <div><small>Owner · how sure</small>${esc(x.owner || '')} · ${esc(x.sure || '')}: ${esc(x.sureWhy || '')}</div>
      ${x.gate ? `<div><small>A person checks</small>${esc(x.gate)}</div>` : ''}</div>
    ${(x.prompts || []).map((p, j) => `<div class="dprompt"><div class="row"><b>${esc(p.when)}</b><div class="spacer"></div><button class="ghost sm" data-dcp="${j}">Copy prompt</button></div><pre>${esc(p.prompt)}</pre></div>`).join('')}
  </div>`;
  document.body.appendChild(s);
  const close = () => { s.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  s.onclick = e => { if (e.target === s) close(); };
  s.querySelector('#dcl').onclick = close; s.querySelector('#dcl').focus();
  s.querySelectorAll('[data-dcp]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(x.prompts[+b.dataset.dcp].prompt); b.textContent = 'Copied ✓'; } catch { b.textContent = 'Select and copy'; } setTimeout(() => b.textContent = 'Copy prompt', 1500); });
}

function wireDrop() {
  const drop = $('#drop'), file = $('#file');
  drop.onclick = () => file.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) simpleUpload(e.dataTransfer.files[0]); };
  file.onchange = () => file.files[0] && simpleUpload(file.files[0]);
}
async function simpleUpload(f) {
  const b64 = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = bad; r.readAsDataURL(f); });
  try {
    const res = await api('upload', { filename: f.name, data: b64 });
    if (res.job) { await refresh(); return pollAll(res.job); }
    V = res; DL = await api('deals'); startAll();
  } catch (e) { render(); showError(e.message); }
}
async function startAll() { try { const { job } = await api('ai/all', {}); pollAll(job); } catch (e) { showError(e.message); } }
async function pollAll(job) {
  running = { all: true, job, step: 0, target: 0, t0: Date.now(), lastStep: Date.now() }; render();
  const timer = setInterval(() => {
    if (!running) return; const c = $('#clock'); if (c) c.textContent = ((Date.now() - running.t0) / 1000).toFixed(0) + 's';
    if (running.step < running.target && Date.now() - running.lastStep > 1200) { running.step++; running.lastStep = Date.now(); render(); }
  }, 100);
  try {
    for (;;) {
      await new Promise(r => setTimeout(r, 700));
      const j = await api('job/' + job);
      if (j.status === 'running') {
        if (j.started && running.t0 !== j.started) running.t0 = j.started;
        if ((j.step ?? 0) !== running.target) { running.target = j.step ?? 0; if (running.target >= 1) V = await api('state'); }
        if ((j.detail || []).length !== (running.detail || []).length) { running.detail = j.detail; const f = $('#feed'); if (f) f.innerHTML = feedRows(running.detail); }
        continue;
      }
      V = await api('state'); if (j.status === 'done') { running.detail = j.detail || running.detail; running.target = 5; while (running.step < 5) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 3000)); } running = null; DL = await api('deals'); render();
      if (j.status === 'error') showError(/session limit|usage limit|rate limit/i.test(j.error) ? 'Analysis stopped: the AI hit its usage limit (' + j.error.replace(/^.*?·\s*/, '') + '). Add a backup AI in Settings, or click Analyze the books again later.' : 'Analysis stopped: ' + j.error + ' See “What the AI was sent” for details.');
      return;
    }
  } finally { clearInterval(timer); }
}
async function resetAll() { if (!confirm('Close this deal? Its files move to the archive folder; nothing is deleted.')) return; await api('reset', {}); replay = null; await refresh(); }
function tabs() {
  const el = $('#tabs'); const lock = running || replay;
  el.innerHTML = DL.deals.map(d => `<button class="tab ${d.id === DL.current ? 'on' : ''}" data-id="${esc(d.id)}" title="${esc(d.file || '')} — double-click to rename">${esc(d.name)}${d.analyzed ? '' : ' <span class="note">· not analyzed</span>'}</button>`).join('')
    + `<button class="tab new ${!DL.current ? 'on' : ''}" id="newdeal">+ New deal</button>`;
  el.querySelectorAll('.tab[data-id]').forEach(b => {
    b.onclick = async () => { if (lock || b.dataset.id === DL.current) return; try { V = await api('deals/select', { id: b.dataset.id }); DL = await api('deals'); mode = 'simple'; render(); } catch (e) { showError(e.message); } };
    b.ondblclick = async () => { if (b.dataset.id !== DL.current) return; const n = prompt('Name this deal', b.textContent.trim()); if (n) { V = await api('deals/rename', { name: n }); DL = await api('deals'); render(); } };
  });
  $('#newdeal').onclick = async () => { if (lock) return; try { V = await api('deals/new', {}); DL = await api('deals'); mode = 'simple'; render(); } catch (e) { showError(e.message); } };
}

async function startReplay() {
  const S = V.state, log = S.runLog || [];
  if (!log.length) { showError('This run has no recorded steps. Use “Run the AI again” once to record them.'); return; }
  const total = log[log.length - 1].t, speed = total > 30 ? total / 30 : 1;
  replay = { step: 0, clock: '0s', detail: [] }; const DET = S.runDetail || []; render(); window.scrollTo(0, 0);
  const stepOf = e => e.step ?? (/^Done/.test(e.text) ? 5 : /Opened the file|Checked the books|^Read |payments|Statement/.test(e.text) ? 0 : /Sorted|sorted|Profit|profit/.test(e.text) ? 1 : /one-off|won’t pay|Team:|risks|things to check/.test(e.text) ? 2 : /Priced|earn/.test(e.text) ? 3 : 4);
  // a step is finished once its last logged line has passed; the next step then shows as current
  const ends = [0, 1, 2, 3, 4].map(k => { const xs = log.filter(e => stepOf(e) === k); return xs.length ? xs[xs.length - 1].t : null; });
  for (let k = 0, prev = 0; k < 5; k++) { if (ends[k] == null) continue; ends[k] = Math.max(ends[k], prev + 1.5 * speed); prev = ends[k]; }
  const total2 = Math.max(total, ...ends.filter(x => x != null));
  const t0 = Date.now();
  await new Promise(done => {
    const iv = setInterval(() => {
      if (!replay) { clearInterval(iv); return done(); }
      const el = (Date.now() - t0) / 1000 * speed;
      let st = 0; while (st < 5 && (ends[st] == null || ends[st] <= el)) st++;
      replay.clock = Math.min(el, total).toFixed(0) + 's'; const shownD = DET.filter(x => x.t <= el); const dChanged = shownD.length !== replay.detail.length; replay.detail = shownD; if (st !== replay.step) { replay.step = st; render(); } else { const c = $('#clock'); if (c) c.textContent = replay.clock; if (dChanged) { const f = $('#feed'); if (f) f.innerHTML = feedRows(replay.detail); } }
      if (el >= total2) { clearInterval(iv); replay.step = 5; render(); setTimeout(done, 3000); }
    }, 250);
  });
  replay = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function howBlock(S, d) {
  const n = d.normalization, L = d.levers, t = d.pnl.TTM, ev = d.evidence || {}, a = S.assumptions, o = S.ops || {};
  const feeBase = a.pricing_uplift ? L.nonAI.pricingRevenue / a.pricing_uplift : 0;
  const li = [];
  const disc = (d.extraLevers || []).find(x => x.id === 'discounts'), ot = (d.extraLevers || []).find(x => x.id === 'overtime');
  if (disc) li.push(`<li>${disc.basis.count} ${esc(V.profile?.customers || 'customers')} brought up to normal prices: half of their ${k$(disc.basis.gap)} gap → <b>+${k$(disc.value)}</b></li>`);
  if (L.nonAI.pricing > 0) li.push(`<li>Prices ${+(a.pricing_uplift * 100).toFixed(1)}% higher on new work${disc ? ` from everyone else` : ` (${k$(feeBase)} of sales)`}${S.ops?.commission_rate ? ', minus commission' : ''} → <b>+${k$(L.nonAI.pricing)}</b></li>`);
  if (ot) li.push(`<li>${pct(ot.cut)} of overtime moved to regular hours (saves the extra half-pay on ${k$(ot.basis.total * ot.cut)}) → <b>+${k$(ot.value)}</b></li>`);
  if (L.nonAI.writeoffs) li.push(`<li>${pct(a.writeoff_reduction)} fewer unpaid invoices → <b>+${k$(L.nonAI.writeoffs)}</b></li>`);
  if (L.nonAI.vendors) li.push(`<li>Tool and vendor cuts → <b>+${k$(L.nonAI.vendors)}</b></li>`);
  const pw = L.workflows.filter(w => w.who !== 'admin'), H = pw.reduce((s, w) => s + w.hoursPerWeek, 0), ps = pw.reduce((s, w) => s + w.hoursSaved, 0), as = L.six.timeSaved - ps;
  const P = o.producers && H ? ps / (o.producers * H * (a.weeks_per_year || 48)) : 0;
  li.push(`<li>AI saves ≈${hrs(L.six.timeSaved)} hours a year <span class="note">(${num(o.producers)} ${esc(V.profile?.workers || 'staff')} × ${num(H)} hours a week × ${pct(P)}, estimate)</span> — room for ${num(L.six.capacitySearches, 0)} more ${esc(V.profile?.jobs || 'jobs')}. We count only ${num(L.six.extraSearches, 0)}: × ${pct(a.completion_rate)} stay and pay × ${money(o.avg_fee)}, minus variable costs → <b>+${k$(L.growth)}</b></li>`);
  if (L.six.cashSavings) li.push(`<li>Spending you will actually cut → <b>+${k$(L.six.cashSavings)}</b></li>`);
  if (L.aiSkipped) { li.splice(li.findIndex(x => x.startsWith('<li>AI saves')), 1); li.push(`<li>AI tools left out: they would save ${k$(L.ai)} but cost ${k$(L.six.costs.software + L.six.costs.ongoing)} a year</li>`); }
  else li.push(`<li>AI software and running costs → <b>−${k$(L.six.costs.software + L.six.costs.ongoing)}</b></li>`);
  return `<div class="how3">
    <div><b>Profit today ${k$(n.reported)}</b><p>Money in, last 12 months: ${k$(t.revenue)}<br>Money spent: −${k$(ev.costsTotal)}<br>= <b>${k$(n.reported)}</b> profit</p><p class="note">Biggest costs: ${(ev.topCosts || []).slice(0, 3).map(c => `${esc(c.label)} ${k$(c.amount)}`).join(' · ')}</p></div>
    <div><b>Real profit ${k$(n.normalized)}</b><p>Profit today ${k$(n.reported)}<br>${n.ownerActual ? `+ owner’s pay, taken out ${k$(n.ownerActual)}<br>` : ''}${n.addbacks ? `+ costs a new owner won’t pay ${k$(n.addbacks)}<br>` : ''}${n.replacement ? `− market salary of whoever runs it ${k$(n.replacement)}<br>` : ''}= <b>${k$(n.normalized)}</b></p><p class="note">What a new owner can count on.</p></div>
    <div><b>Could grow to ${k$(d.proForma)}</b><p>Real profit ${k$(n.normalized)}, plus:</p><ul>${li.join('')}</ul><p>= <b>${k$(d.proForma)}</b> a year</p></div>
  </div>`;
}

const MAIN_Q = c => /^owner_acct:|^owner_leaving$|^addbacks$/.test(c.key);
function nextSteps(S, d, checks) {
  const ask = new Set();
  const txt = (S.flags || []).map(f => f.title + ' ' + f.detail).join(' ').toLowerCase();
  if ((d.limits || []).some(x => /one year|months of data/i.test(x)) || /prior|trend|year-over|history/.test(txt)) ask.add(`3 years of books, to see growth and repeat ${V.profile?.customers || 'customers'}`);
  if (/retention|repeat|concentrat|client/.test(txt)) ask.add(`Sales by ${V.profile?.customers === 'clients' ? 'client' : 'customer'} for 3 years`);
  if (/aging|receivable|unpaid|instal|install|billing/.test(txt)) ask.add(`A list of unpaid invoices and open ${V.profile?.jobs || 'jobs'}`);
  if (/guarantee|replacement|refund/.test(txt)) ask.add('Guarantee and refund terms');
  if (/recruiter|engineer|consultant|inspector|key|producer|commission|depend/.test(txt)) ask.add(`Pay plans and employment agreements for key ${V.profile?.workers || 'staff'}`);
  if ((S.addbacks || []).length) ask.add('Receipts or proof for the one-off costs');
  const open = checks.filter(c => c.value == null && MAIN_Q(c)).length;
  const n = d.normalization, D = d.deal;
  const steps = [];
  if (open) steps.push(`<b>Answer ${open} question${open > 1 ? 's' : ''}</b> for the seller.`);
  if (ask.size) steps.push(`<b>Ask the seller for:</b><ul>${[...ask].slice(0, 4).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  return steps.length ? `<h3>What to do next</h3><ol class="next">${steps.map(x => `<li>${x}</li>`).join('')}</ol>` : '';
}



// ---------- tabs: plan, trends, deal, run it ----------
const EFFORT = { pricing: [2, 5000], billing: [2, 3000], vendors: [3, 2000], discounts: [3, 2000], overtime: [4, 5000], ecom_passthrough: [2, 1000] };
// Ease x impact: yearly EBITDA added per adjusted week of work. Anything that must be built counts as more effort.
const BUILD_WEIGHT = { none: 1, reuse: 1.5, new: 2.5 };
const buildOf = id => ['pricing', 'retention', 'cash', 'discounts'].includes(id) || String(id).startsWith('ecom_') ? 'none' : String(id).startsWith('ind') ? 'new' : 'reuse';
function effortOf(x, d) { const ind = (d.industryLevers || []).find(y => y.id === x.id); const [w, c] = ind ? [ind.weeks || 4, ind.cost || 0] : x.id === 'ai' ? [8, d.levers.six.costs.implementation] : EFFORT[x.id] || [3, 3000]; return { weeks: w, cost: c, build: ind?.build || buildOf(x.id) }; }
const easeScore = (x, d) => { if (x.pending || !(x.value > 0)) return -1; const e = effortOf(x, d); return x.value / (e.weeks * (BUILD_WEIGHT[e.build] || 1)); };
const mon = m => new Date(m + '-15').toLocaleDateString(undefined, { month: 'short' });
function bars(series, keys, opts = {}) {
  if (!series?.length) return '';
  const W = 640, H = opts.h || 150, pad = 48, fmt = opts.fmt || kfmt, vals = series.flatMap(x => keys.map(k => x[k.k])).concat(opts.line ? [opts.line.v] : []);
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals), span = max - min || 1, bw = (W - pad) / series.length;
  const y = v => 8 + (max - v) / span * (H - 8), y0 = y(0);
  return `<svg viewBox="0 0 ${W} ${H + 22}" class="mchart" role="img">${min < 0 ? `<line x1="${pad}" x2="${W}" y1="${y0}" y2="${y0}" class="zero"/>` : ''}${series.map((x, i) => keys.map((k, j) => { const w = (bw - 6) / keys.length, v = x[k.k], top = Math.min(y(v), y0); return `<rect x="${pad + i * bw + 3 + j * w}" y="${top}" width="${Math.max(1, w - 1)}" height="${Math.max(1, Math.abs(y(v) - y0))}" rx="2" class="${v < 0 ? 'bneg' : k.cls}"><title>${mon(x.m)} · ${k.label}: ${fmt(v)}</title></rect>`; }).join('') + `<text x="${pad + i * bw + bw / 2}" y="${H + 15}" text-anchor="middle" class="ax">${mon(x.m)}</text>`).join('')}${opts.line ? `<line x1="${pad}" x2="${W}" y1="${y(opts.line.v)}" y2="${y(opts.line.v)}" class="tline"/><text x="${W}" y="${y(opts.line.v) - 4}" text-anchor="end" class="ax">${esc(opts.line.label)}</text>` : ''}<text x="0" y="12" class="ax">${fmt(max)}</text></svg>`;
}
function basisOf(x, d, S) {
  const L = d.levers, a = S.assumptions, ind = (d.industryLevers || []).find(y => y.id === x.id), ex = id => (d.extraLevers || []).find(y => y.id === id);
  if (ind) return ind.basis;
  const ec = (d.ecomLevers || []).find(y => y.id === x.id); if (ec) return ec.basis;
  if (x.id === 'pricing') return L.nonAI.pricingBasis;
  if (x.id === 'billing') return `Books: ${k$(d.pnl.TTM.byCat?.bad_debt || 0)} written off last year; ${Math.round(a.writeoff_reduction * 100)}% of it counted as recovered.`;
  if (x.id === 'discounts') { const e = ex('discounts'); return `Sales file: ${e.basis.count} customers pay ${k$(e.basis.gap)} a year below the usual price; half counted.`; }
  if (x.id === 'overtime') { const e = ex('overtime'); return `Payroll file: ${k$(e.basis.total)} of overtime; moving ${Math.round(e.cut * 100)}% to normal hours saves the extra half-pay.`; }
  if (x.id === 'vendors') return 'Supplier and tool spend in the books × the saving you confirmed.';
  if (x.id === 'ai') return `About ${num(L.six.timeSaved, 0)} staff hours a year freed, used to finish ${num(L.six.extraSearches, 0)} more jobs.`;
  return '';
}
// Build effort: 'none' = a process or pricing change, nothing to build; 'reuse' = AION already has the tool, prompt or template; 'new' = something to build for this company.
const BUILD = { none: ['No build', 'a process or pricing change', 0], reuse: ['Reusable build', 'AION already has the tool or template', 1], new: ['New build', 'built for this company', 2] };
const VC_AGENTS = [
  { id: 'agent_operator', name: 'AI build: monthly operator', time: '1–2 days', weeks: 1.5, what: 'Turns each month’s books into a to-do list for every manager and a progress report on each lever in this queue.', steps: ['Owner: upload the month’s QuickBooks export in Run it', 'AI: compares it with the plan and with the usual month, and checks progress on each lever', 'AI: drafts a to-do list per manager and a short investor note', 'Owner: approves before anything is shared'] },
  { id: 'agent_diligence', name: 'AI build: diligence document checker', time: '2–3 days', weeks: 2.5, what: 'Reads a seller’s contracts, client lists, payroll and leases and checks them against the books before an offer.', steps: ['Buyer: upload the seller’s documents as PDFs or spreadsheets', 'AI: reads each document and pulls out clients, staff, fees, leases and terms', 'Software: cross-checks them with the ledger (clients billed with no contract, staff paid but not on payroll, leases missing from costs)', 'AI: lists every mismatch with the page and line it came from', 'Buyer: reviews the list and asks the seller'] },
];
// ---------- AION fit: thesis check, tool fit and why AION (all computed by lib/thesis.mjs from the books and diligence) ----------
const STB = { pass: ['PASS', 'ok'], watch: ['WATCH', 'mid'], fail: ['FAIL', 'bad'], needs_data: ['NEEDS DATA', 'na'] };
const LVB = { high: 'ok', medium: 'mid', low: 'na', needs: 'na' };
const stb = st => `<span class="st ${STB[st]?.[1] || 'na'}">${STB[st]?.[0] || st}</span>`;
function checkTable(rows) {
  return `<div class="tblw"><table class="tcheck"><tr><th>What we check</th><th>Result</th><th>This company</th><th>Evidence</th><th>What we look for</th></tr>${rows.map(r => `<tr><td><b>${esc(r.label)}</b></td><td>${stb(r.status)}</td><td class="nowrap">${esc(r.value) || '—'}</td><td class="ev">${esc(r.evidence)}${r.source ? ` <span class="src">${esc(r.source)}</span>` : ''}</td><td class="note">${esc(r.guide)}</td></tr>`).join('')}</table></div>`;
}
function dilRow(k, a) {
  const Q = DILIGENCE[k], v = a ? (Q.kind === 'pct' ? Math.round(a.value * 100) : a.value) : '';
  const inp = Q.kind === 'choice' ? `<select data-dq="${k}"><option value="">Not asked yet</option>${Q.options.map(([o, l]) => `<option value="${o}" ${v === o ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
    : `<input type="number" min="0" ${Q.kind === 'pct' ? 'max="100"' : ''} step="any" data-dq="${k}" value="${esc(v)}" placeholder="—">${Q.kind === 'pct' ? ' %' : ''}`;
  return `<tr><td>${esc(Q.q)}</td><td class="nowrap">${inp}</td><td><input type="text" data-dn="${k}" value="${esc(a?.note || '')}" placeholder="Source or note (who said it, which document)"></td><td class="note nowrap">${a ? new Date(a.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</td></tr>`;
}
function fitTab(S, d) {
  const A = d.aion; if (!A) return `<section data-tab="fit"><p class="empty">The thesis check appears once the books are analyzed.</p></section>`;
  const PR = V.profile || {}, C = A.check, mix = revenueMix(d.pnl?.TTM?.byCat), dq = diligenceFor(PR.subsector), open = dq.filter(k => !S.diligence?.[k]).length;
  const models = mix?.specific ? Object.entries(mix.models).sort((a, b) => b[1] - a[1]).map(([m, v]) => `${REVENUE_MODELS[m].label} ${pct(v)}`).join(' · ') + (mix.unspecified > 0.05 ? ` · not split by type ${pct(mix.unspecified)}` : '') : 'Revenue accounts are not split by type in the books';
  const aiModels = (PR.revenueModels || []).map(x => `${REVENUE_MODELS[x.model]?.label || x.model}${x.share ? ` ~${pct(x.share)}` : ''}`).join(' · ');
  const W = A.why, cnt = C.counts;
  return `<section data-tab="fit"><h2 class="h2">Is this an AION company? <span class="h2s">checked against AION’s buying rules (thesis v${THESIS.version}) using the books and the seller’s answers; each check stands on its own, never one blended score</span></h2>
    <div class="panel2 fitcls">
      <div><small>Sector</small><b>${esc(THESIS.sector)}</b></div>
      <div><small>Subsector</small><select id="fit-sub"><option value="none" ${!PR.subsector ? 'selected' : ''}>Outside the buy box</option>${(() => { const E = Object.entries(SUBSECTORS), opt = ([k, v]) => `<option value="${k}" ${PR.subsector === k ? 'selected' : ''}>${esc(v.label)}</option>`; return E.filter(([, v]) => !v.legacy).map(opt).join('') + `<optgroup label="Earlier thesis (not in the buy box)">${E.filter(([, v]) => v.legacy).map(opt).join('')}</optgroup>`; })()}</select></div>
      <div><small>Revenue model (from the books)</small><span>${esc(models)}</span>${aiModels ? `<span class="note">AI read from account names: ${esc(aiModels)}</span>` : ''}</div>
      <div><small>Delivery model</small><span>${esc(PR.delivery || 'Not recorded')}</span></div>
    </div>
    ${!PR.subsector || SUBSECTORS[PR.subsector]?.legacy ? `<p class="callout warn">This business is outside AION’s buy box (${esc(THESIS.sector.toLowerCase())}: ${esc(THESIS.segments.map(x => x.label.toLowerCase()).join(', '))}). The check still runs, but it qualifies only if the economics, retention, management depth and AI opportunity are compelling on their own.</p>` : ''}
    <p class="verdict ${cnt.fail || A.check.avoid.length ? 'weak' : ''}"><b>${cnt.pass} pass · ${cnt.watch} watch · ${cnt.fail} fail · ${cnt.needs_data} need data.</b> ${A.check.avoid.length ? `Avoid-list ${A.check.avoid.length === 1 ? 'hit' : 'hits'}: ${A.check.avoid.map(x => esc(x.text.toLowerCase())).join('; ')}.` : 'No avoid-list hit so far.'}</p>
    <p class="howline"><b>How this works:</b> each criterion is checked against the books, an uploaded file, the deal model or an answer you record below. No evidence means NEEDS DATA, never a guess. “What we look for” are screening ranges, not hard limits. <b>What to do:</b> ask the seller about anything marked FAIL or NEEDS DATA, and record the answers under “Answers from the seller” at the bottom.</p>
    <h3>Checks for every company</h3>${checkTable(C.universal)}
    ${C.subsector.length ? `<h3>Extra checks for ${esc(C.subsectorLabel)}</h3>${checkTable(C.subsector)}` : ''}
  </section>
  <section data-tab="fit"><h2 class="h2">Why it could be worth more under AION <span class="h2s">capabilities to validate in diligence, not guaranteed synergies</span></h2>
    <div class="panel2"><p class="lead2"><b>${esc(W.verdict)}</b> ${esc(W.summary)}</p><ul class="found">${W.lines.map(l => `<li>${esc(l.text)}</li>`).join('')}<li>${esc(W.experts)}</li></ul></div></section>
  <section data-tab="fit"><details class="more2"><summary>Details: which AION tools apply here, and the workflow we would run</summary>
    <div class="tblw"><table class="tcheck"><tr><th>Tool</th><th>Fit</th><th>Why (evidence)</th><th>What we would run</th><th>Tool status</th></tr>${A.fit.map(f => `<tr><td><b>${esc(f.module)}</b></td><td><span class="st ${LVB[f.level]}">${f.label}</span></td><td class="ev">${esc(f.reason)}</td><td class="ev">${esc(f.play)}${f.objective ? `<br><span class="link sm" data-psgo="${esc(f.objective)}">Start this customer search →</span>` : ''}</td><td class="nowrap note">${STATUS[f.status] || ''}</td></tr>`).join('')}</table></div>
    <p class="note">Fit is HIGH, MEDIUM or LOW only when a recorded answer or the books support it. Answer the questions below to fill in NEEDS DATA.</p></details></section>
  <section data-tab="fit"><details class="more2" ${open > dq.length / 2 ? 'open' : ''}><summary>Answers from the seller (diligence) · ${dq.length - open} of ${dq.length} recorded</summary>
    <p class="note">What only a conversation with the seller or their files can show. Type the answer and where it came from. Each answer is dated and shown as “From diligence” wherever it is used.</p>
    <div class="tblw"><table class="tcheck dq">${dq.map(k => dilRow(k, S.diligence?.[k])).join('')}</table></div></details></section>
  <section data-tab="fit"><details class="more2"><summary>The AION toolkit · ${Object.values(TOOLKIT).filter(t => t !== TOOLKIT.candidates || V.profile?.kind === 'staffing').filter(t => t.status === 'now').length} exist now, ${Object.values(TOOLKIT).filter(t => t !== TOOLKIT.candidates || V.profile?.kind === 'staffing').filter(t => t.status === 'partial').length} partly</summary>
    <div class="tblw"><table class="tcheck"><tr><th>Tool</th><th>Status</th><th>Purpose</th><th>What exists today</th></tr>${Object.values(TOOLKIT).filter(t => t !== TOOLKIT.candidates || V.profile?.kind === 'staffing').map(t => `<tr><td><b>${esc(t.name)}</b></td><td><span class="st ${t.status === 'now' ? 'ok' : t.status === 'partial' ? 'mid' : 'na'}">${STATUS[t.status]}</span></td><td class="note">${esc(t.purpose)}</td><td class="ev">${esc(t.detail)}</td></tr>`).join('')}</table></div></details></section>`;
}
function wireFit() {
  if ($('#fit-sub')) $('#fit-sub').onchange = async e => { try { V = await api('subsector', { subsector: e.target.value }); render(); } catch (err) { showError(err.message); } };
  const save = async k => { const v = document.querySelector(`[data-dq="${k}"]`)?.value ?? '', note = document.querySelector(`[data-dn="${k}"]`)?.value || ''; try { V = await api('diligence', { key: k, value: v, note }); render(); } catch (err) { showError(err.message); } };
  document.querySelectorAll('[data-dq]').forEach(x => x.onchange = () => save(x.dataset.dq));
  document.querySelectorAll('[data-dn]').forEach(x => x.onchange = () => { if (document.querySelector(`[data-dq="${x.dataset.dn}"]`)?.value !== '') save(x.dataset.dn); });
  document.querySelectorAll('[data-psgo]').forEach(b => b.onclick = () => { try { localStorage.setItem('aion.psPrefill', JSON.stringify({ mode: 'client', subsector: V.profile?.subsector || 'ecommerce', objective: b.dataset.psgo })); } catch {} document.querySelector('[data-app="ps"]')?.click(); });
}
// ---------- the plan in five parts: base + commercial + operational + AI productivity + M&A / adjacency ----------
function bucketsHTML(S, d, acts) {
  const B = valueBuckets({ d, rows: queueRows(S, d, acts) }), parts = ['commercial', 'operational', 'ai', 'mna'];
  const counted = ['commercial', 'operational'].reduce((t, k) => t + (B[k].value || 0), 0);
  return `<section data-tab="plan"><h2 class="h2">Where the value comes from <span class="h2s">base business (today) + commercial (prices, sales) + operational (costs, billing) + AI productivity (time saved) + M&amp;A (buying other companies)</span></h2>
    <p class="howline"><b>How this works:</b> the same plan, grouped by kind of change, the way investors usually read it. A number appears only when the books, an uploaded file or a comparison with similar companies sizes it; otherwise the row says what data it needs. These are full plan values (the Expected case); the plan table above shows them cut for how sure each one is.</p>
    <div class="tblw"><table class="tcheck"><tr><th>Part</th><th class="num">Profit a year</th><th>Levers</th><th>Difficulty</th><th>Time to impact</th><th class="num">Investment</th><th>Confidence</th><th>Downside risk</th></tr>
    <tr><td><b>${esc(B.base.label)}</b></td><td class="num">${B.base.value != null ? k$(B.base.value) : '—'}</td><td class="note" colspan="6">${esc(B.base.note)}</td></tr>
    ${parts.map(k => { const b = B[k]; return `<tr><td><b>${esc(b.label)}</b></td><td class="num ${b.value ? 'pos' : ''}">${b.value ? '+' + k$(b.value) : '<span class="st na">NEEDS DATA</span>'}</td><td class="ev">${b.items.length ? esc(b.items.slice(0, 4).join(' · ')) + (b.items.length > 4 ? ` · +${b.items.length - 4} more` : '') : '—'}${b.why ? `<div class="note">${esc(b.why)}</div>` : ''}</td><td>${esc(b.difficulty)}</td><td class="nowrap">${b.weeks ? `about ${b.weeks} weeks` : '—'}</td><td class="num">${b.investment != null ? k$(b.investment) : '—'}</td><td class="note">${esc(b.confidence)}</td><td class="note">${esc(b.risk)}</td></tr>`; }).join('')}
    <tr class="tot"><td>Counted</td><td class="num">${B.base.value != null ? k$(B.base.value + counted) : '—'}</td><td class="note" colspan="6">Today’s real profit plus the commercial and operational changes sized from data. AI time savings and buying other companies never count until they are measured.</td></tr></table></div></section>`;
}
function hundredHTML(S, d, acts) {
  const A = d.aion; if (!A) return '';
  const H = hundredDays({ S, d, profile: V.profile, check: A.check, fit: A.fit, rows: queueRows(S, d, acts) });
  return `<section data-tab="plan"><h2 class="h2">The first 100 days <span class="h2s">built for this company from the books, the plan and the tool fit</span></h2>
    <p class="howline"><b>How this works:</b> understand first, then low-risk commercial and operating changes, then pilot 1–3 AI workflows. ${esc(H.philosophy)}</p>
    <div class="days">${H.phases.map(p => `<div class="dcolm"><b>${esc(p.window)}</b><p class="note">${esc(p.goal)}</p><ul>${p.items.map(x => `<li>${esc(x.text)} <span class="src">${esc(x.src)}</span></li>`).join('')}</ul></div>`).join('')}</div></section>`;
}
function queueRows(S, d, acts) {
  const L = d.levers, rows = [], seen = new Set();
  const kind = id => ['pricing', 'retention', 'cash', 'discounts'].includes(id) ? 'none' : id.startsWith('ind') ? 'new' : 'reuse';
  for (const x of acts) {
    const e = effortOf(x, d);
    rows.push({ ...x, weeks: e.weeks, cost: e.cost, build: e.build, area: x.kind === 'AI' ? 'AI' : x.kind === 'Industry' ? 'Industry' : 'Business', priced: !x.pending && x.value > 0, ease: easeScore(x, d) }); seen.add(x.id);
  }
  for (const x of (d.industryLevers || []).filter(y => !(y.value > 0))) rows.push({ id: x.id, title: x.title, value: 0, steps: x.steps, owner: x.owner, sure: 'Not counted', weeks: x.weeks || 4, cost: x.cost || 0, build: x.build || 'none', area: 'Industry', priced: false, note: `Not counted: ${x.unsized}`, kpis: x.kpis, what: `A checklist and tracker for: ${x.title.toLowerCase()}`, how: x.steps, prompts: [] });
  // ecommerce levers with no number from the books yet: what was measured, and what it would take to size them
  for (const x of (d.ecomLevers || []).filter(y => !(y.counted && y.value > 0))) rows.push({ id: x.id, title: x.title, value: 0, steps: x.steps, owner: 'Owner', sure: 'Not counted', weeks: 2, cost: 0, build: 'none', area: 'Business', priced: false,
    note: [x.basis, ...x.facts].join(' · '), kpis: x.kpis, what: x.title, how: x.steps, prompts: [] });
  // AI builds that support value creation sit in the same queue; they speed up the work, so no EBITDA is claimed for them
  for (const a of VC_AGENTS) rows.push({ id: a.id, title: a.name, value: 0, steps: a.steps, sure: 'Not counted', weeks: a.weeks, cost: 0, build: 'new', area: 'AI', priced: false, note: `Not built yet · about ${a.time} in Claude Code. ${a.what}`, what: a.what, how: a.steps, prompts: [] });
  // moves from the playbook that aren't priced in profit, still worth doing
  for (const l of S.plan?.levers || []) {
    const id = l.key === 'writeoffs' ? 'billing' : l.key;
    if (seen.has(id) || (l.type === 'ai' && seen.has('ai'))) continue;
    if (id === 'pricing' && acts.some(a => a.id.startsWith('ind') && (d.industryLevers || []).find(y => y.id === a.id)?.driver === 'price')) continue;
    const cash = l.key === 'cash' && d.cashRelease;
    rows.push({ id, title: l.title, value: 0, cash: cash ? d.cashRelease : 0, steps: l.steps, owner: l.human_gate ? '' : '', sure: l.type === 'ai' ? 'Not counted' : cash ? 'From the books' : 'Not counted', weeks: l.type === 'ai' ? 4 : 2, cost: l.type === 'ai' ? 0 : 0,
      build: l.type === 'ai' ? 'reuse' : 'none', area: l.type === 'ai' ? 'AI' : 'Business', priced: false, note: l.type === 'ai' ? 'Not counted: needs tracked hours to size the time saved' : cash ? `${k$(d.cashRelease)} of cash, once` : id === 'pricing' ? `Not counted: ${L.nonAI.pricingBasis || 'no data to size it'}` : 'Not counted: protects revenue', what: l.title, how: l.steps, prompts: l.prompts || [], gate: l.human_gate });
  }
  return rows.sort((a, b) => (b.priced - a.priced) || (b.ease ?? -1) - (a.ease ?? -1) || a.weeks - b.weeks);
}
// Realistic EBITDA: each lever is risk-adjusted by how well its number is backed, and ramps up over 13 weeks after it goes live.
const REALIZE = { 'From the books': 0.9, Confirmed: 0.9, 'From the sales file': 0.8, 'From the payroll file': 0.8, 'Benchmark gap': 0.7 };
const RAMP_WEEKS = 13, LANES = 2;
function schedule(rows) {
  const lanes = Array(LANES).fill(0);
  for (const x of rows) { if (!x.priced) continue; const l = lanes.indexOf(Math.min(...lanes)); x.start = lanes[l]; x.live = lanes[l] + Math.ceil(x.weeks); lanes[l] = x.live; x.lane = l; x.real = x.value * (REALIZE[x.sure] ?? 0.5); }
  // weekly realized EBITDA for 104 weeks
  const weekly = Array.from({ length: 104 }, (_, w) => rows.filter(x => x.priced).reduce((t, x) => t + (w < x.live ? 0 : x.real / 52 * Math.min(1, (w - x.live + 1) / RAMP_WEEKS)), 0));
  return { weekly, year1: weekly.slice(0, 52).reduce((a, b) => a + b, 0), allLive: Math.max(0, ...rows.filter(x => x.priced).map(x => x.live)), runRate: rows.filter(x => x.priced).reduce((t, x) => t + x.real, 0) };
}
function queueChart(Q) {
  // each bar: the yearly pace of EBITDA added in that month (mid-month week x 52)
  const months = Array.from({ length: 24 }, (_, m) => Q.weekly[Math.min(103, Math.floor((m + 0.5) * 52 / 12))] * 52);
  const W = 640, H = 120, top = Math.max(1, ...months), bw = (W - 34) / 24;
  return `<svg viewBox="0 0 ${W} ${H + 22}" class="mchart">${months.map((v, i) => `<rect x="${34 + i * bw + 2}" y="${H - v / top * (H - 10)}" width="${bw - 4}" height="${Math.max(0, v / top * (H - 10))}" rx="2" class="${i < 12 ? 'b2' : 'b3'}"><title>Month ${i + 1}: ${kfmt(v)} a year pace</title></rect>`).join('')}<text x="${34 + bw * 6}" y="${H + 16}" text-anchor="middle" class="ax">Year 1</text><text x="${34 + bw * 18}" y="${H + 16}" text-anchor="middle" class="ax">Year 2</text><text x="0" y="12" class="ax">${kfmt(top)}</text></svg>`;
}
function planTab(S, d, acts, pick) {
  const D = d.deal, rows = queueRows(S, d, acts), priced = rows.filter(x => x.priced), Q = schedule(rows);
  const tot = priced.reduce((t, x) => ({ v: t.v + x.value, c: t.c + x.cost, w: t.w + x.weeks }), { v: 0, c: 0, w: 0 });
  const C = d.cases || [];
  const counts = Object.keys(BUILD).map(k => [k, rows.filter(r => r.build === k).length]).filter(x => x[1]);
  return `<section data-tab="plan"><h2 class="h2">The plan <span class="h2s">${priced.length} change${priced.length === 1 ? '' : 's'} counted, easiest first</span></h2>
${priced.length ? `<div class="qsum"><div><small>Realistic profit added, year 1</small><b>+${k$(Q.year1)}</b><span>phased in as each lever goes live</span></div><div><small>Realistic profit added a year, once all are live</small><b>+${k$(Q.runRate)}</b><span>cut for how sure each number is · full plan +${k$(priced.reduce((t, x) => t + x.value, 0))}</span></div><div><small>All changes live by</small><b>week ${Q.allLive}</b><span>${LANES} worked on at a time</span></div></div><div class="panel"><div class="legend"><span><i class="k2"></i>Year 1</span><span><i class="k3"></i>Year 2</span><span>profit added each month, at a yearly pace</span></div>${queueChart(Q)}</div>` : ''}
<p class="howline"><b>How this works:</b> each change is sized only from the books, an uploaded file, or half the gap to similar companies. They run easiest first, two at a time; each takes about 3 months to show fully in profit. “Realistic” = the full value cut by how sure the number is (see the note under the table). <b>What to do:</b> click a row for step-by-step instructions.</p>
    ${(() => { const head = `<tr><th>#</th><th>Change</th><th>Build needed</th><th class="num">Weeks (start–live)</th><th class="num">Realistic profit a year</th><th>Based on</th></tr>`;
      const row = (x, i) => `<tr class="${x.priced ? '' : 'unpriced'} qrow" data-q="${i}"><td>${i + 1}</td><td><span class="atag ${x.area === 'AI' ? 'ai' : x.area === 'Industry' ? 'ind' : ''}">${x.area}</span> <b>${esc(x.title)}</b><div class="how">${esc(x.priced ? basisOf(x, d, S) : x.note || '')}</div><span class="link sm">Step-by-step instructions →</span></td><td><span class="bld ${x.build}">${(BUILD[x.build] || BUILD.none)[0]}</span><div class="how">${x.weeks} wk</div></td><td class="num nowrap">${x.priced ? `${x.start}–${x.live}` : '—'}</td><td class="num ${x.priced ? 'pos' : ''}">${x.priced ? '+' + k$(x.real) : '—'}${x.priced ? `<div class="how">of +${k$(x.value)}</div>` : ''}</td><td>${x.priced ? `<i class="sure ${/^From|Confirmed/.test(x.sure) ? 'hi' : 'mid'}"></i>${esc(x.sure)}` : '<span class="note">—</span>'}</td></tr>`;
      const more = rows.map((x, i) => [x, i]).filter(([x]) => !x.priced);
      return `<div class="tblw"><table class="queue">${head}${rows.map((x, i) => x.priced ? row(x, i) : '').join('')}<tr class="tot"><td></td><td>Total</td><td></td><td class="num">${Q.allLive ? 'all live by week ' + Q.allLive : ''}</td><td class="num">+${k$(Q.runRate)}</td><td></td></tr></table></div>
      ${more.length ? `<details class="more2"><summary>${more.length} more ideas worth doing · not counted in profit</summary><p class="note">Each has instructions, but no number from the books yet: AI builds need tracked hours, others protect revenue or need data the seller hasn’t given.</p><div class="tblw"><table class="queue">${head}${more.map(([x, i]) => row(x, i)).join('')}</table></div></details>` : ''}`; })()}
    <p class="note">${Object.entries(BUILD).map(([, v]) => `<b>${v[0]}</b>: ${v[1]}`).join(' · ')}. Profit here means EBITDA: yearly operating profit before interest, tax and non-cash charges like depreciation. Realistic profit = full value × 90% (from the books), 80% (from an uploaded file) or 70% (gap to similar companies).</p></section>
    ${C.length ? `<section data-tab="plan"><h2 class="h2">Three cases <span class="h2s">weighted by how well each number is backed by data</span></h2><p class="howline"><b>How this works:</b> the same changes counted three ways: only the surest part, as planned, or beating target. “Each $1 becomes” is what each dollar invested is worth after 5 years; “% a year” is the same return as a yearly rate (IRR).</p><div class="cases">${C.map((c, i) => `<div class="case ${i === 1 ? 'mid' : ''}"><b>${c.name}</b><span class="cv">+${k$(c.gain)}</span><small>profit a year → ${k$(c.ebitda)}</small><ul><li>Company value <b>+${k$(c.value)}</b></li><li>Each $1 becomes <b>$${c.moic.toFixed(2)}</b></li><li>About <b>${Math.round((c.irr || 0) * 100)}%</b> a year</li></ul></div>`).join('')}</div>
      <p class="note"><b>Cautious</b>: counts 80% of the changes backed by the books, and only 30–50% of the ones based on a guess. <b>Expected</b>: every change as planned. <b>Stretch</b>: the changes beat their targets by 20–50%. None of these assume the company is sold for a higher price.</p>
      <div class="assume">Try your own numbers: prices <input type="number" data-a="pricing_uplift" data-p="1" value="${+(S.assumptions.pricing_uplift * 100).toFixed(1)}" step="0.5">% higher on new work · write-offs <input type="number" data-a="writeoff_reduction" data-p="1" value="${Math.round(S.assumptions.writeoff_reduction * 100)}" step="5">% lower · buy at <input type="number" class="mult" data-a="entry_multiple" value="${d.deal.multiple}" step="0.25" min="1"> years of profit. Everything updates instantly.</div></section>` : ''}
    <section data-tab="plan">${growHTML(S, d, rows)}</section>`;
}
// ---------- hypothetical: what it would take to reach a target multiple of today's profit ----------
// The counted plan above never changes. This keeps the queue going past what the books prove: the rest of each
// benchmark gap, yearly growth and add-on acquisitions, each one an input you set. Never counted in the cases or returns.
let GROW = { target: 3, lanes: 2, growth: null, addonPct: 25, addonEvery: 12, addonMult: 3.5, restGap: true };
try { Object.assign(GROW, JSON.parse(localStorage.getItem('aion.grow') || '{}')); } catch {}
let growCtx = null;
function booksTrend(d) { const M = d.monthly || []; if (M.length < 24) return null; const s = xs => xs.reduce((t, x) => t + x.revenue, 0), a = s(M.slice(-24, -12)), b = s(M.slice(-12)); return a > 0 ? b / a - 1 : null; }
function growModel(d, rows) {
  const base = d.normalization?.normalized || 0, trend = booksTrend(d), g = GROW.growth ?? Math.max(0, Math.min(0.15, trend ?? 0));
  const counted = rows.filter(x => x.priced).map(x => ({ ...x }));
  const rest = GROW.restGap ? counted.filter(x => x.sure === 'Benchmark gap').map(x => ({ ...x, title: x.title, rest: true })) : [];
  const lanes = Array(Math.max(1, GROW.lanes)).fill(0);
  for (const x of [...counted, ...rest]) { const l = lanes.indexOf(Math.min(...lanes)); x.start = lanes[l]; x.live = lanes[l] + Math.ceil(x.weeks); lanes[l] = x.live; x.real = x.value * (REALIZE[x.sure] ?? 0.5); }
  const ramp = (x, w) => w < x.live ? 0 : x.real * Math.min(1, (w - x.live + 1) / RAMP_WEEKS);
  const goal = base * GROW.target, size = base * GROW.addonPct / 100, addons = [], series = [];
  let hit = null;
  for (let m = 1; m <= 180; m++) {
    const w = Math.round(m * 52 / 12);
    if (!hit && size > 0 && GROW.addonEvery > 0 && m >= 12 && (m - 12) % GROW.addonEvery === 0) addons.push({ m, ebitda: size, cost: size * GROW.addonMult });
    const plan = counted.reduce((t, x) => t + ramp(x, w), 0), restV = rest.reduce((t, x) => t + ramp(x, w), 0), own = base + plan + restV, f = Math.pow(1 + g, m / 12);
    const adds = addons.reduce((t, a) => t + a.ebitda * Math.pow(1 + g, (m - a.m) / 12), 0);
    const tot = own * f + adds;
    series.push({ m, base, plan, rest: restV, growth: own * (f - 1), addons: adds, tot });
    if (!hit && tot >= goal) hit = m;
    if (hit && m >= Math.ceil(hit / 12) * 12) break;
  }
  return { base, g, trend, goal, counted, rest, addons, series, hit, cash: addons.reduce((t, a) => t + a.cost, 0) };
}
function growChart(G) {
  const ys = G.series.filter(x => x.m % 12 === 0).slice(0, 15); if (!ys.length) return '';
  const K = [['base', 'g0', 'Profit today'], ['plan', 'g1', 'Counted plan'], ['rest', 'g2', 'Rest of the gap to similar companies'], ['growth', 'g3', 'Yearly growth'], ['addons', 'g4', 'Companies bought (add-ons)']];
  const W = 640, H = 150, pad = 34, top = Math.max(G.goal, ...ys.map(x => x.tot)) * 1.05, bw = (W - pad) / ys.length, y = v => H - v / top * (H - 8);
  return `<div class="legend">${K.filter(([k]) => ys.some(x => x[k] > 0)).map(([, c, l]) => `<span><i class="${c}"></i>${l}</span>`).join('')}</div><svg viewBox="0 0 ${W} ${H + 22}" class="mchart gchart" role="img">${ys.map((x, i) => { let acc = 0; return K.map(([k, c, l]) => { const v = Math.max(0, x[k]); if (!v) return ''; const r = `<rect x="${pad + i * bw + 3}" y="${y(acc + v)}" width="${bw - 6}" height="${Math.max(0.5, y(acc) - y(acc + v))}" class="${c}"><title>Year ${x.m / 12} · ${l}: ${kfmt(v)}</title></rect>`; acc += v; return r; }).join('') + `<text x="${pad + i * bw + bw / 2}" y="${H + 15}" text-anchor="middle" class="ax">Y${x.m / 12}</text>`; }).join('')}<line x1="${pad}" x2="${W}" y1="${y(G.goal)}" y2="${y(G.goal)}" class="tline"/><text x="${W}" y="${y(G.goal) - 4}" text-anchor="end" class="ax">${GROW.target}× today</text><text x="0" y="12" class="ax">${kfmt(top)}</text></svg>`;
}
function growHTML(S, d, rows) {
  growCtx = { d, rows };
  const base = d.normalization?.normalized || 0;
  const head = `<h2 class="h2">What it would take to reach ${GROW.target}× today’s profit <span class="h2s">a what-if · change any input · not counted anywhere else</span></h2>`;
  if (!(base > 0)) return `<div id="grow">${head}<p class="note">This needs a business that makes a profit today.</p></div>`;
  const G = growModel(d, rows), at = G.hit ? G.series[G.hit - 1] : G.series[G.series.length - 1], yrs = G.hit ? (G.hit / 12) : null;
  const inp = (k, v, step, min, max, w = '') => `<input type="number" data-g="${k}" value="${v}" step="${step}" min="${min}" max="${max}" ${w}>`;
  const parts = [['Counted plan, as above', at.plan], ['Rest of the gap to similar companies', at.rest], [`Growth of ${+(G.g * 100).toFixed(1)}% a year`, at.growth], [`${G.addons.length} ${G.addons.length === 1 ? 'company' : 'companies'} bought (add-ons) at ${kfmt(G.addons[0]?.ebitda || 0)} profit each, grown since`, at.addons]].filter(r => r[1] > 0);
  return `<div id="grow">${head}
    <p class="howline"><b>How this works:</b> the counted plan runs first, then the rest of each gap to similar companies, yearly growth, and one company bought every ${GROW.addonEvery} months (an “add-on”) until profit reaches ${GROW.target}× today’s. A what-if only: not counted anywhere else, and how add-ons are paid for isn’t modelled.</p>
    <div class="gctl"><div class="seg">${[1.5, 2, 3, 5].map(t => `<button data-gt="${t}" class="${GROW.target === t ? 'on' : ''}">${t}×</button>`).join('')}</div><label>or ${inp('target', GROW.target, 0.5, 1.1, 20, 'class="gsm"')}×</label></div>
    <div class="gin">
      <label><span>Changes worked on at once</span>${inp('lanes', GROW.lanes, 1, 1, 6)}</label>
      <label><span>Growth a year, %${G.trend != null ? ` <em>books: ${+(G.trend * 100).toFixed(1)}%</em>` : ' <em>under 2 years of books</em>'}</span>${inp('growth', +(G.g * 100).toFixed(1), 0.5, -20, 50)}</label>
      <label><span>Size of each company bought, % of today’s profit</span>${inp('addonPct', GROW.addonPct, 5, 0, 200)}</label>
      <label><span>Buy one every … months</span>${inp('addonEvery', GROW.addonEvery, 3, 3, 60)}</label>
      <label><span>Price of each, in years of its profit</span>${inp('addonMult', GROW.addonMult, 0.25, 1, 10)}</label>
      <label class="gchk"><input type="checkbox" data-g="restGap" ${GROW.restGap ? 'checked' : ''}><span>Close the rest of each gap to similar companies</span></label>
    </div>
    <p class="verdict ${G.hit ? 'good' : 'weak'}">${G.hit ? `<b>${GROW.target}× profit in about ${yrs < 1 ? G.hit + ' months' : (Math.round(yrs * 2) / 2) + ' years'}</b>: ${k$(base)} → ${k$(at.tot)} a year` : `<b>Not reached in 15 years</b> with these inputs: ${k$(at.tot)} a year by then`}${G.addons.length ? ` · add-ons need about <b>${k$(G.cash)}</b> to buy` : ''}.${G.hit ? '' : ' Raise growth, buy add-ons more often, or make them bigger.'}</p>
    <div class="panel">${growChart(G)}</div>
    <div class="tblw"><table class="queue"><tr><th>What gets you there</th><th class="num">Profit added a year${G.hit ? ' by then' : ''}</th></tr>${parts.map(r => `<tr><td>${esc(r[0])}</td><td class="num pos">+${k$(r[1])}</td></tr>`).join('')}<tr class="tot"><td>Profit a year, from ${k$(base)} today</td><td class="num">${k$(at.tot)}</td></tr></table></div>
    ${G.addons.length ? `<details class="more2"><summary>Companies to buy, in order (${G.addons.length})</summary><ul class="found">${G.addons.map((a, i) => `<li>Add-on ${i + 1} · month ${a.m} · +${k$(a.ebitda)} profit a year · about ${k$(a.cost)} to buy</li>`).join('')}</ul></details>` : ''}</div>`;
}
function wireGrow() {
  const box = document.getElementById('grow'); if (!box || !growCtx) return;
  const redraw = () => { try { localStorage.setItem('aion.grow', JSON.stringify(GROW)); } catch {} const t = document.createElement('div'); t.innerHTML = growHTML(null, growCtx.d, growCtx.rows); box.replaceWith(t.firstElementChild); wireGrow(); };
  box.querySelectorAll('[data-gt]').forEach(b => b.onclick = () => { GROW.target = +b.dataset.gt; redraw(); });
  box.querySelectorAll('[data-g]').forEach(i => i.onchange = () => {
    const k = i.dataset.g;
    if (k === 'restGap') GROW.restGap = i.checked;
    else { const v = +i.value; if (!isFinite(v)) return; GROW[k] = k === 'growth' ? Math.max(-0.2, Math.min(0.5, v / 100)) : k === 'lanes' ? Math.max(1, Math.min(6, Math.round(v))) : k === 'target' ? Math.max(1.1, Math.min(20, v)) : Math.max(0, v); }
    redraw();
  });
}
function trendsTab(S, d) {
  const M = d.monthly; if (!M?.length) return `<section data-tab="trends"><p class="empty">Monthly trends need a General Ledger with dates.</p></section>`;
  const h = Math.floor(M.length / 2), a = M.slice(0, h), b = M.slice(h), sum = (xs, k) => xs.reduce((t, x) => t + x[k], 0);
  const g = sum(a, 'revenue') ? sum(b, 'revenue') / sum(a, 'revenue') - 1 : 0, best = [...M].sort((x, y) => y.revenue - x.revenue)[0], low = [...M].sort((x, y) => x.revenue - y.revenue)[0];
  const F = d.flow, mg = sum(M, 'revenue') ? sum(M, 'profit') / sum(M, 'revenue') : 0;
  return `<section data-tab="trends"><h2 class="h2">Month by month</h2><p class="howline"><b>How this works:</b> monthly sales and costs from the books; customers billed in the first half vs the second.</p>
    <p class="lead2">Sales were <b class="${g >= 0 ? 'pos' : 'neg'}">${g >= 0 ? 'up' : 'down'} ${pct(Math.abs(g))}</b> in the last ${b.length} months vs the first ${a.length}. Busiest month: <b>${mon(best.m)}</b> (${k$(best.revenue)}); quietest: <b>${mon(low.m)}</b> (${k$(low.revenue)}). Profit is <b>${pct(mg)}</b> of sales on average.</p>
    <div class="panel"><div class="legend"><span><i class="k1"></i>Sales</span><span><i class="k2"></i>Profit</span></div>${bars(M, [{ k: 'revenue', cls: 'b1', label: 'Sales' }, { k: 'profit', cls: 'b2', label: 'Profit' }])}</div>
    <div class="grid2" style="margin-top:14px"><div class="panel"><b class="pt">Customers billed each month</b>${bars(M, [{ k: 'customers', cls: 'b3', label: 'Customers' }], { h: 110, fmt: v => String(Math.round(v)) })}</div>
    <div class="panel"><b class="pt">Customers coming and going</b>${F ? `<p>Since ${mon(F.split)}: <b>${F.lostCount}</b> stopped buying (${k$(F.lostRevenue)} before), <b>${F.freshCount}</b> new (${k$(F.freshRevenue)}).</p>${F.lost.length ? `<p class="note">Stopped: ${F.lost.slice(0, 3).map(x => `${esc(x.name)} (${k$(x.revenue)})`).join(', ')}</p>` : ''}${F.fresh.length ? `<p class="note">New: ${F.fresh.slice(0, 3).map(x => `${esc(x.name)} (${k$(x.revenue)})`).join(', ')}</p>` : ''}` : '<p class="note">Needs at least 4 months of data.</p>'}</div></div></section>`;
}
function dealMetrics(S, d) {
  const D = d.deal, n = d.normalization, t = d.pnl.TTM; if (!D) return d.unpriceable && d.unpriceableWhy === 'short' ? `<section data-tab="deal" class="panel2"><h2 class="h2">Not priceable yet</h2><p class="lead2">The books cover only <b>${d.monthsCovered} month${d.monthsCovered === 1 ? '' : 's'}</b>. A price is a number of years of profit, so it needs a full 12 months. Ask the seller for the last 12 months (ideally 3 years) and upload them.</p></section>` : d.unpriceable ? `<section data-tab="deal" class="panel2"><h2 class="h2">Not priceable yet</h2><p class="lead2">Real profit is <b>${k$(n.normalized)}</b> a year, so the business loses money. Buyers price a business at a number of years of profit (the “multiple”), so there is no sensible price until it is profitable. The Plan tab shows the changes that would get it there. Or <span class="link" id="price-rev">price it on sales instead</span>.</p></section>` : '';
  const tiles = [['Sales', k$(t.revenue), 'last 12 months'], ['Real profit (EBITDA)', k$(n.normalized), `${pct(n.normalized / t.revenue)} of sales`], ['Could reach', k$(d.proForma), `+${pct(d.levers.runRate / n.normalized)}`],
    ['Bank loan at purchase', n.normalized > 0 ? (D.senior / n.normalized).toFixed(1) + '×' : '—', 'years of profit borrowed'], ['Bad-year loan cover', D.downside.minDscr == null ? 'No loan' : D.downside.minDscr.toFixed(1) + '×', 'profit ÷ loan payments; banks want 1.25×'], ['Each $1 becomes', '$' + D.base.net.moic.toFixed(2), 'after fees, 5 years (MOIC)'], ['Yearly return', Math.round((D.base.net.irr || 0) * 100) + '%', 'after fees (IRR)']];
  return `<section data-tab="deal"><p class="howline"><b>How this works:</b> sales and real profit come from the books; “could reach” adds the plan. Loan and return figures come from the deal model below: returns assume the plan works, loan cover assumes a bad year. MOIC = money back per $1 invested; IRR = the same return as a yearly rate.</p><div class="mtiles">${tiles.map(([a, b, c]) => `<div><small>${a}</small><b>${b}</b><span>${c}</span></div>`).join('')}</div></section>`;
}
function dealExtras(S, d) {
  const D = d.deal; if (!D) return '';
  const B = D.base.bridge, parts = [['Profit growth', B.growth, 'up'], ['Loans paid down', B.debtPaid, 'flat'], ['Cash paid out', B.cash, 'cash']].filter(x => x[1] > 0), tot = parts.reduce((t, x) => t + x[1], 0) || 1;
  const W = d.wc, O = S.outside;
  return `<section data-tab="deal" class="panel2"><h2 class="h2">Where investor returns come from</h2><p class="howline"><b>How this works:</b> what investors gain over 5 years, split three ways: higher profit (so the company is worth more), bank loan paid off with the company’s cash, and cash paid out to owners.</p>
    <div class="vbar">${parts.map(([l, v, c]) => `<span class="${c}" style="width:${v / tot * 100}%"></span>`).join('')}</div>
    <div class="vleg">${parts.map(([l, v, c]) => `<span><i class="${c}"></i>${l} <b>${k$(v)}</b></span>`).join('')}</div>
    <p class="note">Over 5 years, if the actions work. The company is valued at the same ${D.multiple} years of profit at the end, so no gain comes from a higher price.</p></section>
    <section data-tab="deal" class="panel2"><h2 class="h2">Cash to leave in the business at closing <span class="h2s">working capital</span></h2><p class="howline"><b>How this works:</b> from the books, the monthly average of what customers owe${W?.hasInv ? ' plus stock' : ''} minus bills the company owes. The seller leaves this much in the business at closing so it can keep running.</p>
    ${W ? `<p class="lead2">Usually about <b>${k$(W.peg)}</b> is tied up in money customers owe${W.hasInv ? ' and stock' : ''}${W.hasAP ? ', minus bills owed' : ''} (12-month average; range ${k$(W.low)}–${k$(W.high)}).</p><p class="note">Set this as the target in the offer. If the seller leaves less at closing, the price goes down by the difference.</p>` : '<p class="note">Needs balance-sheet accounts (money customers owe, bills owed) in the ledger export. Ask for the General Ledger with all accounts.</p>'}</section>
    <section data-tab="deal" class="panel2"><h2 class="h2">Outside check <span class="h2s">the AI searches the web and shows only what it can link to</span></h2><p class="howline"><b>How this works:</b> type the company’s name and city. The AI searches reviews, court records, licenses and news, and shows only findings it can link to. <b>What to do:</b> read every finding, and its source, before you make an offer.</p>
    ${O ? `<p class="lead2"><b>${esc(O.name)}</b>${O.place ? `, ${esc(O.place)}` : ''}${O.rating ? ` · rated <b>${O.rating.value}</b>${O.rating.count ? ` from ${num(O.rating.count)} reviews` : ' (the company’s own claim)'} · <a href="${safeUrl(O.rating.url)}" target="_blank" rel="noopener">source</a>` : ''}</p>
      ${O.findings.length ? `<ul class="olist">${O.findings.map(f => `<li class="${esc(f.tone)}"><span class="ok2">${esc(f.kind)}</span><div><b>${esc(f.title)}</b> ${esc(f.summary)} <a href="${safeUrl(f.url)}" target="_blank" rel="noopener">source</a>${f.date ? ` <span class="note">${esc(f.date)}</span>` : ''}</div></li>`).join('')}</ul>` : '<p class="note">Nothing found that clearly matches this company.</p>'}
      ${O.notFound?.length ? `<details class="nf"><summary>What it couldn’t confirm (${O.notFound.length})</summary><ul>${O.notFound.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}` : ''}
    <div class="row ocrow"><input id="oc-name" placeholder="Company name" value="${esc(O?.name || '')}"><input id="oc-place" placeholder="City, state" value="${esc(O?.place || '')}"><button id="oc-go">${O ? 'Search the web again' : 'Search the web for this company'}</button><span class="note" id="oc-st"></span></div></section>`;
}
function runTab(S, d) {
  const C = d.checkin;
  const drop = `<div class="xtile" data-cdrop><div class="xt"><b>Add this month’s books</b><span class="xopt">same QuickBooks report</span></div><p>Drop in the latest General Ledger (this month or year to date). It’s compared with the usual month before the plan and with the plan’s target.</p><button class="ghost sm" data-cpick>Choose file</button><span class="note"> or drop it here</span><input type="file" accept=".xlsx,.xls,.csv" hidden data-cfile></div>`;
  if (!C) return `<section data-tab="run"><h2 class="h2">Run the business month by month</h2><p class="howline"><b>How this works:</b> upload each month’s books. Software compares them with the usual month before you bought it and with the plan’s target, and flags customers going quiet or costs rising.</p><p class="lead2">After you own it, add each month’s books here. You’ll see whether profit is on track, whether each action is working, and early warnings before they become problems.</p>${drop}</section>`;
  const L = C.last, onT = L && L.profit >= C.target * 0.95, aboveU = L && L.profit >= C.usual.profit;
  const tr = [['Profit this month', L && k$(L.profit), `usual ${k$(C.usual.profit)} · target ${k$(C.target)}`, onT ? 'ok' : aboveU ? 'mid' : 'bad'],
    ['Sales', L && k$(L.revenue), `usual ${k$(C.usual.revenue)}`, L && L.revenue >= C.usual.revenue ? 'ok' : 'mid'],
    ['Gross margin (share of sales left after direct costs)', L && L.revenue ? pct(L.gross / L.revenue) : '—', `usual ${C.usual.revenue ? pct(C.usual.gross / C.usual.revenue) : '—'}`, L && C.usual.revenue && L.gross / L.revenue >= C.usual.gross / C.usual.revenue - 0.01 ? 'ok' : 'mid'],
    ['Average invoice', C.avgInvoice.now ? k$(C.avgInvoice.now) : '—', C.avgInvoice.usual ? `usual ${k$(C.avgInvoice.usual)}` : '', C.avgInvoice.now && C.avgInvoice.usual && C.avgInvoice.now >= C.avgInvoice.usual ? 'ok' : 'mid'],
    ['Days to get paid', C.dso.now != null ? Math.round(C.dso.now) + ' days' : '—', C.dso.usual != null ? `usual ${Math.round(C.dso.usual)} days` : '', C.dso.now != null && C.dso.usual != null && C.dso.now <= C.dso.usual ? 'ok' : 'mid'],
    ['Written off', L && k$(L.writeoffs), `usual ${k$(C.usual.writeoffs)}`, L && L.writeoffs <= C.usual.writeoffs ? 'ok' : 'bad']];
  const warn = [...C.quiet.map(q => `${esc(q.name)} usually buys ${k$(q.usual)} a month; now ${k$(q.now)}.`), ...C.rising.map(r => `${esc(r.account)} is ${k$(r.now)} a month vs usual ${k$(r.usual)}.`), ...C.newAccounts.map(a => `New account “${esc(a)}”: check what it is.`)];
  return `<section data-tab="run"><h2 class="h2">Monthly check-in after you buy <span class="h2s">${esc(C.file)} · <span class="link" id="c-rm">remove</span></span></h2>
    <p class="howline"><b>How this works:</b> the latest month in your file, compared with the usual month before the plan and with the plan’s target. The coloured edge on each box: green = on track, amber = watch, red = behind.</p>
    <p class="lead2">${L ? `${mon(L.m)}: profit <b>${k$(L.profit)}</b>, ${onT ? '<b class="pos">on track</b> for the plan' : aboveU ? 'above the usual month but <b>below the plan’s target</b>' : '<b class="neg">below the usual month</b>'}.` : ''}${C.overlapOnly ? ' <span class="note">These months overlap the original books, so this compares like with like.</span>' : ''}</p>
    <div class="panel"><div class="legend"><span><i class="k2"></i>Profit</span><span><i class="tl"></i>Plan target</span></div>${bars(C.months, [{ k: 'profit', cls: 'b2', label: 'Profit' }], { line: { v: C.target, label: 'target' }, h: 130 })}</div>
    <div class="trk">${tr.map(([a, b, c, st]) => `<div class="${st}"><small>${a}</small><b>${b ?? '—'}</b><span>${c}</span><span class="sr">${{ ok: 'On track', bad: 'Behind plan' }[st] || 'Not measured yet'}</span></div>`).join('')}</div>
    <h2 class="h2" style="margin-top:22px">Early warnings</h2>${warn.length ? `<p class="note">What to do: ask the manager about each one this month.</p><ul class="found">${warn.map(w => `<li><span class="sev medium">check</span> ${w}</li>`).join('')}</ul>` : '<p class="note">✓ Nothing unusual this month.</p>'}
    <div style="margin-top:16px">${drop.replace('Add this month’s books', 'Replace with newer books')}</div></section>`;
}
async function runOutside() {
  const name = $('#oc-name').value.trim(), place = $('#oc-place').value.trim(), st = $('#oc-st');
  if (!name) { st.textContent = 'Type the company’s name first.'; return; }
  try {
    const { job } = await api('ai/outside', { name, place }); const t0 = Date.now(); $('#oc-go').disabled = true;
    for (;;) { await new Promise(r => setTimeout(r, 1500)); const j = await api('job/' + job); const last = (j.detail || []).slice(-1)[0]; st.textContent = `${Math.round((Date.now() - t0) / 1000)}s · ${last ? last.text : 'Searching…'}`; if (j.status !== 'running') { V = await api('state'); render(); if (j.status === 'error') showError('Outside check stopped: ' + j.error); return; } }
  } catch (e) { showError(e.message); }
}
async function sendCheckin(f) {
  if (!f) return;
  const b64 = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = bad; r.readAsDataURL(f); });
  try { V = await api('checkin', { filename: f.name, data: b64 }); tab = 'plan'; render(); } catch (e) { showError(e.message); }
}
