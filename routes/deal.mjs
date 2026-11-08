// Value Creation (deal) routes (moved out of server.mjs with no change in behaviour): the open deal, upload, AI steps,
// the answers and settings on each step, the Excel and PDF files, and switching deals. The open deal lives in
// server.mjs; `st` reads and writes it live (S, ROWS, CHECK, CUR and the running AI step).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawn } from 'node:child_process';
import { parseGL, accountSummary } from '../lib/gl.mjs';
import { CATEGORIES, DEFAULT_ASSUMPTIONS, periods, r2 } from '../lib/model.mjs';
import { profile, kindOf } from '../lib/industry.mjs';
import { SUBSECTORS, DILIGENCE, detectSubsector, kindFor } from '../lib/thesis.mjs';
import { analyzePayroll, analyzeSales } from '../lib/extras.mjs';
import { buildWorkbook } from '../lib/excel.mjs';
import { marketPay } from '../lib/benchmarks.mjs';
import { readLog } from '../lib/claude.mjs';
import { detect as detectEngines, resolve as resolveEngine, settings as engineSettings, choose as chooseEngine, setKey, test as testEngine, ENGINES, limits as engineLimits } from '../lib/engine.mjs';

export const DEAL_POST = new Set(['engine/choose', 'engine/key', 'engine/test', 'upload', 'ai/classify', 'ai/addbacks', 'ai/ops', 'ai/plan', 'ai/all', 'extra', 'ai/outside', 'checkin', 'industry', 'subsector', 'diligence', 'mask', 'excel', 'pdf', 'answer', 'mapping', 'earnings', 'ops', 'assumptions', 'deals/select', 'deals/new', 'deals/rename', 'reset']);

/** Handles a Value Creation request. Returns true when it answered, false when the server should carry on. */
export async function dealRoute(req, res, url, p, ctx) {
  const { send, body, st, AI, ARCHIVE, D, LOGF, PORT, actionList, busy, derive, detail, job, jobs, listDeals, loadDeal, newDeal, persist, runAll, save, view } = ctx;
  if (req.method === 'GET') {
    if (req.method === 'GET' && p === 'state') return send(res, 200, view());
    if (req.method === 'GET' && p === 'log') return send(res, 200, st.CUR ? readLog(LOGF()).reverse() : []);
    if (req.method === 'GET' && p === 'deals') return send(res, 200, { current: st.CUR, deals: listDeals(), busy: busy(), busyJob: Object.values(jobs).find(j => j.status === 'running' && j.name === 'Analyze')?.id || null });
    if (req.method === 'GET' && p.startsWith('job/')) return send(res, 200, jobs[p.slice(4)] || { status: 'unknown' });
    // ---- AI engine: whatever the person already has (Claude Code, Codex, or their own API key) ----
    if (req.method === 'GET' && p === 'engine') { const list = await detectEngines(); return send(res, 200, { list, active: await resolveEngine(true), settings: engineSettings(), limits: engineLimits() }); }
    if (req.method === 'GET' && p === 'rows') {
      let rows = st.ROWS;
      const ids = url.searchParams.get('ids'); const acct = url.searchParams.get('account'); const cat = url.searchParams.get('category'); const payee = url.searchParams.get('payee');
      if (ids) { const set = new Set(ids.split(',').map(Number)); rows = rows.filter(r => set.has(r.id)); }
      if (acct) rows = rows.filter(r => r.account === acct);
      if (cat) rows = rows.filter(r => st.S.mapping?.[r.account] === cat);
      if (payee) rows = rows.filter(r => r.name === payee);
      if (url.searchParams.get('period') === 'TTM' && st.S.range) { const t = periods(st.S.range).ttm; rows = rows.filter(r => { const m = r.date.slice(0, 7); return m >= t.from && m <= t.to; }); }
      return send(res, 200, { total: rows.length, rows: rows.slice(0, 500) });
    }
    return false;
  }
  if (req.method !== 'POST' || !DEAL_POST.has(p)) return false;
  const b = await body(req);
  switch (p) {
    case 'engine/choose': { try { chooseEngine(String(b.engine || 'auto')); } catch (e) { return send(res, 400, { error: e.message }); } return send(res, 200, { active: await resolveEngine(true), settings: engineSettings() }); }
    case 'engine/key': { try { setKey(b.which, b.key); } catch (e) { return send(res, 400, { error: e.message }); } return send(res, 200, { list: await detectEngines(), active: await resolveEngine(true), settings: engineSettings() }); }
    case 'engine/test': { if (!ENGINES[b.engine]) return send(res, 400, { error: 'Unknown engine' }); try { return send(res, 200, await testEngine(b.engine)); } catch (e) { return send(res, 200, { ok: false, error: String(e.message || e).slice(0, 400) }); } }
    case 'upload': {
      const buf = Buffer.from(b.data, 'base64'); const ext = path.extname(b.filename || '').toLowerCase();
      if (!['.xlsx', '.xls', '.csv', '.pdf'].includes(ext)) return send(res, 400, { error: 'Upload a QuickBooks GL / P&L Detail export (.xlsx, .xls, .csv) or PDF financial statements.' });
      if (busy()) return send(res, 409, { error: 'An analysis is still running. Wait for it to finish, then upload.' });
      const stored = 'upload' + ext;
      if (ext === '.pdf') {
        newDeal(b.filename);
        fs.writeFileSync(path.join(D(), stored), buf);
        st.S = { ...st.S, file: { name: b.filename, kind: 'pdf', stored, bytes: buf.length, sha: crypto.createHash('sha256').update(buf).digest('hex'), uploadedAt: new Date().toISOString() } };
        st.ROWS = []; save(path.join(D(), 'gl.json'), st.ROWS); persist();
        return send(res, 200, { job: job('Analyze', runAll) });
      }
      const gl = parseGL(buf, b.filename);
      newDeal(b.filename);
      fs.writeFileSync(path.join(D(), stored), buf);
      st.ROWS = gl.rows; save(path.join(D(), 'gl.json'), st.ROWS);
      const { rows, ...meta } = gl;
      st.S = { ...st.S, file: { name: b.filename, kind: 'gl', stored, bytes: buf.length, sha: crypto.createHash('sha256').update(buf).digest('hex'), uploadedAt: new Date().toISOString() }, parse: meta, range: gl.range, accounts: accountSummary(gl), signMode: gl.amountMode === 'debit-credit' ? 'debit' : 'natural' };
      persist(); return send(res, 200, view());
    }
    case 'ai/classify': return send(res, 200, { job: job('Map accounts', AI.classify) });
    case 'ai/addbacks': return send(res, 200, { job: job('Earnings review', AI.addbacks) });
    case 'ai/ops': return send(res, 200, { job: job('Operating inputs', AI.ops) });
    case 'ai/plan': return send(res, 200, { job: job('Deployment plan', AI.plan) });
    case 'ai/all': return send(res, 200, { job: job('Analyze', async j => { st.FRESH = !!b.fresh; try { await runAll(j); } finally { st.FRESH = false; } }) });
    case 'extra': {
      const type = b.type; if (!['payroll', 'sales'].includes(type)) return send(res, 400, { error: 'Unknown file type.' });
      if (!st.CUR || !st.S.file) return send(res, 400, { error: 'Upload the books first.' });
      if (b.remove) { if (st.S.extra) delete st.S.extra[type]; persist(); return send(res, 200, view()); }
      const buf = Buffer.from(b.data || '', 'base64'); const ext = path.extname(b.filename || '').toLowerCase();
      if (!['.xlsx', '.xls', '.csv'].includes(ext)) return send(res, 400, { error: 'Upload an Excel or CSV export (.xlsx, .xls, .csv).' });
      let analysis; try { analysis = type === 'payroll' ? analyzePayroll(buf) : analyzeSales(buf); } catch (e) { return send(res, 400, { error: e.message }); }
      if (type === 'payroll') analysis.market = await marketPay(analysis.roles);
      fs.writeFileSync(path.join(D(), `${type}${ext}`), buf);
      st.S.extra = { ...(st.S.extra || {}), [type]: { file: b.filename, at: new Date().toISOString(), analysis } }; persist();
      return send(res, 200, view());
    }
    case 'ai/outside': {
      const name = String(b.name || '').trim().slice(0, 120), place = String(b.place || '').trim().slice(0, 120);
      if (!st.CUR || !st.S.plan) return send(res, 400, { error: 'Analyze a company first.' });
      if (!name) return send(res, 400, { error: 'Type the company’s name (and city) to check it online.' });
      return send(res, 200, { job: job('Outside check', async j => { st.CURJ = j; j.t0 = Date.now(); j.detail = []; j.step = 0; try { detail(`Searching the web for “${name}”${place ? ` in ${place}` : ''}: reviews, lawsuits, licenses, news`); await AI.outside(name, place); detail(`Done: ${st.S.outside.findings.length} findings with links`); persist(); } finally { st.CURJ = null; } }) });
    }
    case 'checkin': {
      if (!st.CUR || !st.S.plan) return send(res, 400, { error: 'Analyze the company first, then add newer books each month.' });
      if (b.remove) { st.CHECK = []; save(path.join(D(), 'checkin.json'), st.CHECK); delete st.S.checkin; persist(); return send(res, 200, view()); }
      const buf = Buffer.from(b.data || '', 'base64');
      let gl; try { gl = parseGL(buf, b.filename); } catch (e) { return send(res, 400, { error: e.message }); }
      st.CHECK = gl.rows; save(path.join(D(), 'checkin.json'), st.CHECK);
      st.S.checkin = { file: b.filename, at: new Date().toISOString(), range: gl.range }; persist();
      return send(res, 200, view());
    }
    case 'industry': { const name = String(b.name || '').trim().slice(0, 60); if (!name) return send(res, 400, { error: 'Type the kind of business, e.g. civil engineering firm.' }); const kind = kindOf(name); st.S.industry = { name, kind, subsector: detectSubsector(name) || (kind === 'staffing' ? 'talent' : null), byUser: true }; persist(); return send(res, 200, view()); }
    case 'subsector': {
      // the user's choice of subsector; kind follows it so the playbook wording matches. Revenue and delivery notes are kept.
      if (!st.CUR || !st.S.industry) return send(res, 400, { error: 'Analyze a company first.' });
      const sub = b.subsector === 'none' ? null : SUBSECTORS[b.subsector] ? b.subsector : undefined; if (sub === undefined) return send(res, 400, { error: 'Unknown subsector.' });
      st.S.industry = { ...st.S.industry, subsector: sub, subsectorSet: true, kind: sub ? kindFor(sub) : 'general' }; persist();
      return send(res, 200, view());
    }
    case 'diligence': {
      // a diligence answer recorded by the user, dated; shown as "From diligence" evidence in the thesis check and tool fit
      if (!st.CUR || !st.S.file) return send(res, 400, { error: 'Open a deal first.' });
      const Q = DILIGENCE[b.key]; if (!Q) return send(res, 400, { error: 'Unknown question.' });
      st.S.diligence ??= {};
      if (b.value === '' || b.value == null) delete st.S.diligence[b.key];
      else { let v = b.value; if (Q.kind === 'pct') v = Math.min(1, Math.max(0, (+v || 0) / 100)); else if (Q.kind === 'num') v = Math.max(0, +v || 0); else if (!Q.options.some(o => o[0] === v)) return send(res, 400, { error: 'Unknown answer.' });
        st.S.diligence[b.key] = { value: v, note: String(b.note || '').slice(0, 300), at: new Date().toISOString() }; }
      persist(); return send(res, 200, view());
    }
    case 'mask': { st.S.maskNames = !!b.on; persist(); return send(res, 200, view()); }
    case 'excel': {
      if (!st.CUR || !st.S.plan) return send(res, 400, { error: 'Analyze a company first, then download the Excel file.' });
      const buf = buildWorkbook({ S: st.S, d: derive(), rows: st.ROWS, profile: profile(st.S), actions: actionList(derive()) });
      res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="AION ${String(st.S.name || 'analysis').replace(/[^\w .-]/g, '')}.xlsx"` });
      return res.end(buf);
    }
    case 'pdf': {
      if (!st.CUR || !st.S.plan) return send(res, 400, { error: 'Analyze a company first, then download its 1-page PDF.' });
      const out = path.join(D(), 'summary.pdf'); try { fs.unlinkSync(out); } catch {}
      await new Promise((ok, bad) => {
        const c = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000', `--print-to-pdf=${out}`, `http://localhost:${PORT}/summary.html`]);
        c.on('close', () => fs.existsSync(out) ? ok() : bad(new Error('PDF was not created — is Google Chrome installed?'))); c.on('error', bad);
      });
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="AION summary.pdf"' });
      return res.end(fs.readFileSync(out));
    }
    case 'answer': {
      const { key, value } = b; const yes = value === true || value === 1 || value === '1';
      st.S.answers = { ...(st.S.answers || {}), [key]: key.startsWith('map:') || key.startsWith('ops:') ? value : yes };
      if (key.startsWith('ops:')) {
        const v = Math.max(0, +value || 0); st.S.answers[key] = v; st.S.ops ??= {};
        if (key === 'ops:producers') st.S.ops.producers = v;
        if (key === 'ops:avg_fee') st.S.ops.avg_fee = v;
        if (key === 'ops:hours') { const ks = ['research', 'sourcing', 'outreach', 'crm', 'reporting'], cur = ks.reduce((s, k) => s + (st.S.ops.hours?.[k] || 0), 0); for (const k of ks) st.S.ops.hours[k] = cur ? (st.S.ops.hours[k] || 0) * v / cur : v / ks.length; }
      }
      if (key.startsWith('map:')) { const acct = key.slice(4); if (st.S.mapping && acct in st.S.mapping && CATEGORIES[value]) { st.S.mapping[acct] = value; st.S.answers[key] = value; } }
      if (key.startsWith('owner_acct:')) { const acct = key.slice(11); if (st.S.mapping && acct in st.S.mapping) st.S.mapping[acct] = yes ? 'comp_owner' : 'comp_producers'; }
      // the seller staying does not make profit higher: they are paid the same market salary a hired leader would be
      if (key === 'owner_leaving') { st.S.owner.stays = !yes; st.S.owner.count = Math.max(1, st.S.owner.count || 0); }
      if (key === 'addbacks') for (const a of st.S.addbacks || []) a.accepted = yes;
      if (key === 'vendors') for (const v of st.S.vendors || []) v.accepted = yes;
      persist(); return send(res, 200, view());
    }
    case 'mapping': {
      if (b.mapping) for (const [k, v] of Object.entries(b.mapping)) if (CATEGORIES[v] && st.S.mapping && k in st.S.mapping) st.S.mapping[k] = v;
      if (b.signMode) st.S.signMode = b.signMode === 'debit' ? 'debit' : 'natural';
      if (b.confirm != null) { st.S.mappingConfirmed = !!b.confirm; if (!b.confirm) { st.S.normConfirmed = false; st.S.opsConfirmed = false; } }
      persist(); return send(res, 200, view());
    }
    case 'earnings': {
      if (b.owner) { st.S.owner = { ...st.S.owner, ...Object.fromEntries(Object.entries(b.owner).filter(([k]) => ['marketComp', 'count', 'extraOwnerComp'].includes(k)).map(([k, v]) => [k, Math.max(0, +v || 0)])) }; st.S.owner.count = Math.max(1, Math.round(st.S.owner.count)); }
      if (b.addbacks) for (const a of st.S.addbacks || []) if (a.id in b.addbacks) a.accepted = !!b.addbacks[a.id];
      if (b.vendors) for (const v of st.S.vendors || []) if (v.id in b.vendors) { const x = b.vendors[v.id]; if ('accepted' in x) v.accepted = !!x.accepted; if ('pct' in x) { v.pct = Math.min(1, Math.max(0, +x.pct || 0)); v.amount = r2(v.spend * v.pct); } }
      if (b.confirm != null) st.S.normConfirmed = !!b.confirm;
      persist(); return send(res, 200, view());
    }
    case 'ops': {
      if (b.ops) { const { hours, ...rest } = b.ops; st.S.ops = { ...st.S.ops, ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, +v || 0])), hours: { ...st.S.ops?.hours, ...Object.fromEntries(Object.entries(hours || {}).map(([k, v]) => [k, +v || 0])) } }; }
      if (b.confirm != null) st.S.opsConfirmed = !!b.confirm;
      persist(); return send(res, 200, view());
    }
    case 'assumptions': {
      const a = b.assumptions || {};
      for (const [k, v] of Object.entries(a)) {
        if (k === 'workflows') { for (const w of v) { const t = st.S.assumptions.workflows.find(x => x.key === w.key); if (t) t.saved = Math.min(1, Math.max(0, +w.saved || 0)); } }
        else if (k === 'vehicle') { if (['holdco', 'fund', 'sponsor', 'search', 'sba'].includes(v)) st.S.assumptions.vehicle = v; }
        else if (k === 'stake') { const x = +v; if (x >= 0.5 && x <= 1) st.S.assumptions.stake = x; }
        else if (k === 'price_basis') { if (['ebitda', 'revenue'].includes(v)) st.S.assumptions.price_basis = v; }
        else if (k === 'deal_form') { if (['asset', 'stock', 'f_reorg'].includes(v)) st.S.assumptions.deal_form = v; }
        else if (k === 'fee_rate') { const x = +v; if (x >= 0 && x <= 0.3) st.S.assumptions.fee_rate = x; }
        else if (k in DEFAULT_ASSUMPTIONS) st.S.assumptions[k] = +v || 0;
      }
      if (b.reset) st.S.assumptions = structuredClone(DEFAULT_ASSUMPTIONS);
      persist(); return send(res, 200, view());
    }
    case 'deals/select': { if (busy()) return send(res, 409, { error: 'An analysis is still running.' }); loadDeal(b.id); return send(res, 200, view()); }
    case 'deals/new': { if (busy()) return send(res, 409, { error: 'An analysis is still running.' }); loadDeal(null); return send(res, 200, view()); }
    case 'deals/rename': { if (st.CUR && b.name) { st.S.name = String(b.name).slice(0, 80); persist(); } return send(res, 200, view()); }
    case 'reset': {
      if (busy()) return send(res, 409, { error: 'An analysis is still running.' });
      if (st.CUR) { fs.mkdirSync(ARCHIVE, { recursive: true }); fs.renameSync(D(), path.join(ARCHIVE, st.CUR + '-' + new Date().toISOString().replace(/[:.]/g, '-'))); }
      loadDeal(listDeals().at(-1)?.id);
      return send(res, 200, view());
    }
  }
  return false;
}
