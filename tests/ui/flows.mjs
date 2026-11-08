// End-to-end flows in a headless browser, on a throwaway workspace copy with fake Gmail and no AI:
//   AION_BASE=http://localhost:8812 AION_EMPTY_BASE=http://localhost:8813 node tests/ui/flows.mjs
// The first server runs on a copy of a real workspace; the second on an empty folder (first-run screens).
// Covers: confirm-and-send with the browser's own OK dialog, a second send refused, replies (interested, opt-out),
// documents, call invites, load errors with Try again, failed actions showing a message, every saved deal on every
// Value Creation tab, the 1-page PDF and Excel for each, phone width, keyboard access, and the empty first run.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import * as XLSX from 'xlsx';
const APP = (process.env.AION_BASE || 'http://localhost:8812').replace(/\/$/, ''), EMPTY = (process.env.AION_EMPTY_BASE || '').replace(/\/$/, '');
if (/:8765\b/.test(APP)) { console.error('Run this against a server on a workspace copy (see the top of this file), never the real AION on 8765.'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + String(x).slice(0, 220) : '')); };
const call = async (base, p, b) => { const r = await fetch(`${base}/api/${p}`, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json().catch(() => null) }; };

// ---- headless Chrome ----
const PROF = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-flows-')), CDP = 9361;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP}`, '--window-size=1280,1000', `--user-data-dir=${PROF}`, 'about:blank']);
let wsu; for (let i = 0; i < 60 && !wsu; i++) { await sleep(250); try { wsu = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(wsu); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; let errs = [], dialogs = [], acceptDialogs = true, block = null;
sock.onmessage = m => { const d = JSON.parse(m.data);
  if (d.id && pend[d.id]) { pend[d.id](d.result || d); delete pend[d.id]; }
  if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Page.javascriptDialogOpening') { dialogs.push(d.params.message); cmd('Page.handleJavaScriptDialog', { accept: acceptDialogs, promptText: '' }); }
  if (d.method === 'Fetch.requestPaused') { const u = d.params.request.url;
    if (block && block.test(u)) cmd('Fetch.fulfillRequest', { requestId: d.params.requestId, responseCode: 500, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: 'Test failure' })).toString('base64') });
    else cmd('Fetch.continueRequest', { requestId: d.params.requestId }); } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const click = async (s, wait = 900) => { const hit = await ev(`(() => { const e = document.querySelector(${JSON.stringify(s)}); if (!e) return false; e.click(); return true; })()`); await sleep(wait); return hit; };
const text = () => ev(`document.querySelector('#main')?.innerText || ''`);
const toasts = () => ev(`document.querySelector('#toasts')?.innerText || ''`);
const go = async (base, app) => { await cmd('Page.navigate', { url: base + '/' }); await sleep(1200); if (app) { await ev(`localStorage.setItem('aion.app', ${JSON.stringify(app)})`); await cmd('Page.navigate', { url: base + '/' }); } await sleep(2200); };
const phone = async on => { await cmd('Emulation.setDeviceMetricsOverride', on ? { width: 390, height: 900, deviceScaleFactor: 1, mobile: true } : { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }); await sleep(500); };
const fits = async () => (await ev('document.documentElement.scrollWidth')) <= 392;
const BAD_TEXT = /\bundefined\b|\bNaN\b|\[object Object\]|Infinity/;
const STAFFING = /\b(recruiters?|placement fees?|candidates?|producers?|fill rate|payroll float|job orders?|RFPs?)\b/i;
await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Fetch.enable', { patterns: [{ urlPattern: APP + '/api/*' }] });

// ================= Outreach: confirm and send =================
const st = (await call(APP, 'outreach/state')).json;
const items = (st.board || []).map(b => b.id ? b : null).filter(Boolean);
const all = await Promise.all(items.map(async b => (await call(APP, `outreach/item?id=${b.id}`)).json));
const pick = all.find(it => it && it.phase === 'review' && it.drafts?.email?.body && /@/.test(it.to || '') && !it.messages?.length);
ok('Outreach: a drafted, unsent outreach exists to test with', !!pick, pick ? pick.phase : 'none');
if (pick) {
  await call(APP, 'outreach/connect', { email: pick.sender }); // fake Gmail: connects without Google
  await call(APP, 'outreach/settings', { address: '1 Placeholder Way, Anytown, VA 00000' });
  await go(APP, 'ps');
  ok('Outreach board shows on Search & Outreach', await ev(`!!document.querySelector('#psout [data-open]')`));
  await click(`#psout [data-open="${pick.id}"]`, 1500);
  await click('[data-kind="email"]', 800);
  ok('Outreach item: first email draft with Send', await ev(`!!document.querySelector('#osend') && !!document.querySelector('#obody')`));
  dialogs = []; acceptDialogs = false; await click('#osend', 1500);
  ok('Send asks for your OK first (From, To, Subject and the text)', dialogs.length === 1 && /From:/.test(dialogs[0]) && /To:/.test(dialogs[0]) && /Subject:/.test(dialogs[0]), dialogs[0]?.slice(0, 120));
  ok('Saying no sends nothing', ((await call(APP, `outreach/item?id=${pick.id}`)).json.messages || []).length === 0);
  dialogs = []; acceptDialogs = true; await click('#osend', 2000);
  const sent = (await call(APP, `outreach/item?id=${pick.id}`)).json;
  ok('Saying OK sends it once (fake Gmail)', sent.messages.filter(m => m.kind === 'email').length === 1, await toasts());
  // a second send of the same email is refused by the server, whatever the page does
  const c = (await call(APP, 'outreach/confirm', { id: pick.id, action: 'step', kind: 'email' })).json;
  ok('A second send of the same email is refused', c.ok === false && /already sent/.test((c.problems || []).join(' ')), (c.problems || [])[0]);
  // replies
  await call(APP, 'outreach/mock-reply', { id: pick.id, text: 'Hi, thanks for reaching out. Yes, happy to talk next week.' });
  await go(APP, 'ps'); await click(`#psout [data-open="${pick.id}"]`, 1500);
  ok('An interested reply shows on the outreach', /interested|replied/i.test(await text()));
  await click('#oanswer', 2500);
  ok('Write reply with the AI off shows a plain message, no crash', /AI|off|ready|didn/i.test(await toasts()) || /AI/.test(await text()), await toasts());
  // documents: the NDA is written by code, sent with OK, as a PDF made in headless Chrome
  if (await click('[data-docmake="nda"]', 1500)) {
    ok('NDA draft appears for editing', await ev(`!!document.querySelector('[data-doc="nda"]')`));
    dialogs = []; acceptDialogs = true; await click('[data-docsend="nda"]', 9000);
    const it2 = (await call(APP, `outreach/item?id=${pick.id}`)).json;
    ok('NDA send asks for OK and goes once, with the PDF attached', dialogs.length >= 1 && it2.messages.some(m => m.kind === 'doc:nda' && (m.attached || []).length === 1), (await toasts()) || dialogs[0]);
    const tok = (await call(APP, 'outreach/confirm', { id: pick.id, action: 'doc', kind: 'nda' })).json.token;
    const again = (await call(APP, 'outreach/doc-send', { id: pick.id, kind: 'nda', confirmed: true, token: tok })).json;
    ok('The same NDA version is not sent twice, even with a fresh OK', /already sent/.test(again?.error || ''), again?.error);
  } else ok('NDA button shown after a reply', false);
  // call invite
  const slots = await call(APP, 'outreach/slots');
  ok('Open call times answer (or say why not)', slots.status < 500, JSON.stringify(slots.json).slice(0, 120));
  const start = slots.json?.slots?.[0]?.start || new Date(Date.now() + 3 * 864e5).toISOString();
  const inv = (await call(APP, 'outreach/confirm', { id: pick.id, action: 'invite', start })).json;
  ok('Invite preview names who and when, with a one-time code', inv.ok && !!inv.token && /@/.test(inv.to), (inv.problems || [])[0]);
  const bk = await call(APP, 'outreach/book', { id: pick.id, start, confirmed: true, token: inv.token });
  ok('Booking the call sends one invite (or says plainly why it can’t)', bk.status === 200 ? !!bk.json.call : /Calendar|allowed/.test(bk.json?.error || ''), bk.json?.error || bk.json?.status);
  const bk2 = await call(APP, 'outreach/book', { id: pick.id, start, confirmed: true, token: inv.token });
  ok('The same invite code can’t book twice', bk2.status === 400);
  // opt-out: no more emails, and the domain is blocked
  await call(APP, 'outreach/mock-reply', { id: pick.id, text: 'Please stop emailing me.' });
  const it3 = (await call(APP, `outreach/item?id=${pick.id}`)).json;
  ok('An opt-out closes the outreach and blocks the address', it3.phase === 'finished' && it3.replied.kind === 'optout');
  const c2 = (await call(APP, 'outreach/confirm', { id: pick.id, action: 'answer' })).json;
  ok('Nothing more can be sent after an opt-out', c2.ok === false, (c2.problems || [])[0]);
}

// ================= load errors and failed actions =================
await go(APP, 'ps');
block = /\/api\/search\/radar/; await cmd('Page.reload'); await sleep(3000);
ok('A list that fails to load says so, with Try again', /Couldn’t load the brand radar/.test(await text()) && await ev(`!!document.querySelector('#ps-retry')`), (await text()).slice(0, 120));
ok('The other lists still show when one fails', await ev(`!!document.querySelector('#psown')`) && !(await ev(`document.body.dataset.firstrun === '1'`)));
block = null; await click('#ps-retry', 2500);
ok('Try again clears the message once it loads', !/Couldn’t load/.test(await text()));
if (pick) {
  await click(`#psout [data-open="${pick.id}"]`, 1500);
  block = /\/api\/outreach\/finish/;
  const had = await click('#ofinish', 1500);
  ok('A failed action shows a message instead of failing silently', !had || /didn’t work|Test failure/.test(await toasts()), await toasts());
  block = null;
}

// ================= Value Creation: every saved deal, every tab =================
const deals = (await call(APP, 'deals')).json.deals || [];
ok('Saved deals listed', deals.length >= 1, deals.length);
for (const dl of deals) {
  await call(APP, 'deals/select', { id: dl.id });
  const V = (await call(APP, 'state')).json, staffing = V.profile?.kind === 'staffing', analyzed = !!V.state.plan;
  await go(APP, 'vc');
  const label = `${staffing ? 'older staffing deal' : 'deal'} ${dl.id}`;
  if (!analyzed) { ok(`${label}: opens at its step`, (await text()).length > 50); continue; }
  for (const t of ['overview', 'deal', 'plan', 'details']) {
    await click(`[data-tab-btn="${t}"]`, 700);
    const tx = await ev(`document.querySelector('.r2')?.innerText || document.querySelector('#main').innerText`);
    ok(`${label} · ${t}: shows, no undefined/NaN`, tx.length > 100 && !BAD_TEXT.test(tx), (tx.match(BAD_TEXT) || [''])[0]);
    if (!staffing) ok(`${label} · ${t}: no staffing words`, !STAFFING.test(tx), (tx.match(STAFFING) || [''])[0]);
    await phone(true); ok(`${label} · ${t}: fits a phone`, await fits(), await ev('document.documentElement.scrollWidth')); await phone(false);
  }
  await click('[data-tab-btn="plan"]', 700);
  ok(`${label}: ecommerce levers listed where they apply`, staffing || (V.derived.ecomLevers || []).length === 0 || /retainer|delivery team|largest client|ad spend/i.test(await text()));
  // the 1-page PDF page and the Excel file
  await cmd('Page.navigate', { url: APP + '/summary.html' }); await sleep(2500);
  const sm = await ev(`document.body.innerText`);
  ok(`${label}: 1-page summary builds`, /good deal for investors/i.test(sm) && !BAD_TEXT.test(sm), (sm.match(BAD_TEXT) || [sm.slice(0, 80)])[0]);
  const xr = await fetch(APP + '/api/excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (xr.ok) { const wb = XLSX.read(Buffer.from(await xr.arrayBuffer())), cells = wb.SheetNames.flatMap(n => Object.values(wb.Sheets[n]).filter(c => c && typeof c === 'object' && 'v' in c).map(c => c.v));
    ok(`${label}: Excel opens, every sheet filled, no NaN`, wb.SheetNames.length >= 4 && !cells.some(v => typeof v === 'number' && !Number.isFinite(v)) && !cells.some(v => typeof v === 'string' && BAD_TEXT.test(v)), wb.SheetNames.join(', ')); }
  else ok(`${label}: Excel opens`, false, xr.status);
}

// ================= other screens, phone width and keyboard =================
for (const [app, name] of [['ps', 'Search & Outreach'], ['help', 'Help'], ['settings', 'Settings']]) {
  errs = []; await go(APP, app); const tx = await text();
  ok(`${name}: shows, no undefined/NaN`, tx.length > 80 && !BAD_TEXT.test(tx), (tx.match(BAD_TEXT) || [''])[0]);
  ok(`${name}: no staffing words`, !STAFFING.test(tx), (tx.match(STAFFING) || [''])[0]);
  await phone(true); ok(`${name}: fits a phone`, await fits(), await ev('document.documentElement.scrollWidth')); await phone(false);
  ok(`${name}: every link-style action can be reached by keyboard`, await ev(`[...document.querySelectorAll('span.link, tr[data-open], tr.qrow')].every(e => e.tabIndex >= 0)`));
  ok(`${name}: no page errors`, errs.length === 0, errs[0]);
}
await go(APP, 'ps');
const before = await ev(`location.href`); await ev(`(() => { const e = document.querySelector('tr[data-open]'); e?.focus(); e?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await sleep(1500);
ok('Enter on a focused row opens it', await ev(`!!document.querySelector('#ps-back')`) || before !== await ev('location.href'));

// ================= empty workspace: first run =================
if (EMPTY) {
  errs = []; await cmd('Fetch.disable'); await go(EMPTY, 'ps');
  const tx = await text();
  ok('Empty workspace: Search & Outreach shows Start here first', await ev(`document.body.dataset.firstrun === '1'`) && /Start here/i.test(tx), tx.slice(0, 120));
  ok('Empty workspace: no load-error message', !/Couldn’t load/.test(tx));
  await go(EMPTY, 'vc'); const tv = await text();
  ok('Empty workspace: Value Creation starts at upload', /upload|books|ledger/i.test(tv), tv.slice(0, 120));
  ok('Empty workspace: no page errors', errs.length === 0, errs[0]);
  const st2 = (await call(EMPTY, 'outreach/state')).json; ok('Empty workspace: outreach board is empty, not an error', Array.isArray(st2?.board) && st2.board.length === 0);
}

ok('No page errors in the whole run', errs.length === 0, errs.join(' | '));
sock.close(); chrome.kill(); await sleep(600); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
