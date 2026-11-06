// Clicks every visible control on every screen and reports what each one did. Run against a throwaway copy:
//   AION_WORKSPACE=<copy> PORT=8811 node boot.mjs   then   AION_BASE=http://localhost:8811 node tests/ui/crawl.mjs [out.json]
// Anything that would call an AI, start a search, upload, archive or restart is intercepted and answered with a fake
// error, so the run is free and changes nothing outside the copy; for those controls the check is that the error is
// shown to the person. Confirm and prompt dialogs are dismissed. A control "works" if it changed the screen, opened
// something, called the app, or showed a message. Anything else is listed as "no visible effect".
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const BASE = (process.env.AION_BASE || 'http://localhost:8811').replace(/\/$/, '');
const OUTF = process.argv[2];
const PROF = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-crawl-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + (process.env.CDP_PORT || 9353), '--window-size=1366,1000', '--user-data-dir=' + PROF, 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws; for (let i = 0; i < 40 && !ws; i++) { try { const pg = (await (await fetch('http://127.0.0.1:' + (process.env.CDP_PORT || 9353) + '/json')).json()).find(x => x.type === 'page' && x.url === 'about:blank'); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl); } catch {} await sleep(250); }
if (ws.readyState !== 1) await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; let errs = [], posts = [], dialogs = [];
const BLOCK = /\/api\/(ai\/|search\/start|search\/signals|search\/watchrun|engine\/test|radar\/scan|app\/restart|reset|search\/archive|upload|extra|checkin|search\/contacts|search\/more|deals\/new|buybox|docs\/proposal|docs\/writeup|engine\/key)/;
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = async m => {
  const d = JSON.parse(m.data);
  if (d.id && pend[d.id]) { pend[d.id](d.result || d); delete pend[d.id]; }
  if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon|409|Failed to load resource/.test(d.params.entry.text + (d.params.entry.url || ''))) errs.push(d.params.entry.text);
  if (d.method === 'Page.javascriptDialogOpening') { dialogs.push(d.params.type + ': ' + d.params.message.slice(0, 80)); send('Page.handleJavaScriptDialog', { accept: false }); }
  if (d.method === 'Fetch.requestPaused') {
    const u = d.params.request.url, meth = d.params.request.method;
    if (meth === 'POST') posts.push(u.replace(BASE, ''));
    if (meth === 'POST' && BLOCK.test(u)) send('Fetch.fulfillRequest', { requestId: d.params.requestId, responseCode: 409, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: 'QA-BLOCKED: this action was intercepted by the test.' })).toString('base64') });
    else send('Fetch.continueRequest', { requestId: d.params.requestId });
  }
};
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: BASE + '/api/*' }] });

// screens: how to reach each one from a fresh load
const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)})?.click()`); await settle(2500); };
// wait until the screen has drawn and stopped changing
const settle = async (max = 4000) => { let last = '', same = 0; for (let t = 0; t < max; t += 150) { await sleep(150); const now = await ev(`(document.querySelector('#main')?.innerText || '').length + ':' + document.querySelectorAll('button').length`); if (now === last && !/^0:/.test(now)) { if (++same >= 2) return; } else same = 0; last = now; } };
let primed = false;
const home = async app => { if (!primed) { await send('Page.navigate', { url: BASE }); await settle(); primed = true; } await ev(`localStorage.setItem('aion.app','${app}')`); await send('Page.navigate', { url: BASE }); await settle(); };
const SCREENS = [
  ['Settings', async () => { await home('settings'); }],
  ['Help', async () => { await home('help'); }],
  ['Documents', async () => { await home('docs'); }],
  ['Documents · first doc', async () => { await home('docs'); await click('[data-open]'); }],
  ...['candidate', 'client'].map(m => [`Search home · ${m} mode`, async () => { await home('ps'); await click(`[data-mode="${m}"]`); }]),
  ['Search home', async () => { await home('ps'); }],
  ['Search results', async () => { await home('ps'); await click('tr[data-open]'); }],
  ['Search result detail', async () => { await home('ps'); await click('tr[data-open]'); await click('[data-detail]'); }],
  ['Network', async () => { await home('ps'); await click('#ps-net'); }],
  ...['overview', 'fit', 'plan', 'trends', 'deal', 'run', 'details'].map(t => [`Value Creation · ${t}`, async () => { await home('vc'); await click(`[data-tab-btn="${t}"]`); }]),
  ['Build-it drawer', async () => { await home('vc'); await click('[data-build]'); }],
  ['Advanced · levers', async () => { await home('vc'); await click('[data-tab-btn="details"]'); await click('#math'); }],
  ['Advanced · run log', async () => { await home('vc'); await click('[data-tab-btn="details"]'); await click('#log'); }],
  
];
// every visible control in the current screen, scoped to what is on top (drawer or modal first)
const LIST = `(() => {
  const top = document.querySelector('.scrim') || document.querySelector('#ps-scrim') || (document.querySelector('#modal.on') ? document.querySelector('#modal .mbox') : null) || document.body;
  const els = [...top.querySelectorAll('button, a[href], a[data-p], a#backSimple, .link, select, input[type=checkbox], input[type=number], input[type=radio], summary, tr[data-open], tr.qrow, [data-open], .chip')]
    .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'));
  const sec = e => { const s = e.closest('[data-tab]'); return s ? s.dataset.tab : ''; };
  const shown = document.querySelector('.r2')?.dataset.show;
  return [...new Set(els)].filter(e => !sec(e) || !shown || sec(e) === shown).map((e, i) => { e.dataset.qa = i; return { i, tag: e.tagName.toLowerCase(), type: e.type || '', label: (e.innerText || e.getAttribute('aria-label') || e.placeholder || e.id || e.value || '').trim().replace(/\\s+/g, ' ').slice(0, 60), href: e.getAttribute('href') || '' }; });
})()`;
const SNAP = `(document.querySelector('#main')?.innerText || '') + '|' + (document.querySelector('#toasts')?.innerText || '') + '|' + (document.activeElement?.id || '') + '|' + [...document.querySelectorAll('textarea,input')].map(e => e.value).join('~') + '|' + (document.querySelector('.scrim, #ps-scrim, #modal.on')?.innerText || '') + '|' + document.querySelector('[data-app].on')?.dataset.app + '|' + (document.querySelector('.r2')?.dataset.show || '') + '|' + [...document.querySelectorAll('details[open]')].length + '|' + (document.querySelector('#tabs')?.innerText || '')`;

const report = [];
for (const [name, go] of SCREENS) {
  await go();
  // the same control repeated on every card (Save, Reject, a link to each source) is tried twice, not on every card
  const seen = {}, items = (await ev(LIST) || []).filter(x => (seen[x.tag + x.label] = (seen[x.tag + x.label] || 0) + 1) <= 2);
  console.log(`\n== ${name}: ${items.length} controls`);
  let dirty = false;
  for (const it of items) {
    if (dirty) await go(); dirty = true; const again = await ev(LIST) || []; const cur = again.find(x => x.label === it.label && x.tag === it.tag) || again[it.i];
    if (!cur) { report.push({ screen: name, ...it, result: 'not found on re-render' }); continue; }
    errs = []; posts = []; dialogs = [];
    const before = await ev(SNAP);
    let act;
    if (cur.tag === 'select') act = `(() => { const e = document.querySelector('[data-qa="${cur.i}"]'); const o = [...e.options].find(o => !o.selected) || e.options[0]; e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); return 'changed to ' + o.text; })()`;
    else if (cur.tag === 'input' && cur.type === 'number') act = `(() => { const e = document.querySelector('[data-qa="${cur.i}"]'); e.value = String((+e.value || 0) + 1); e.dispatchEvent(new Event('change', { bubbles: true })); return 'set to ' + e.value; })()`;
    else if (cur.tag === 'a' && /^https?:/.test(cur.href)) { report.push({ screen: name, ...cur, result: 'external link', detail: cur.href }); continue; }
    else act = `(() => { const e = document.querySelector('[data-qa="${cur.i}"]'); e.click(); return 'clicked'; })()`;
    const how = await ev(act); await sleep(500); await settle(2500);
    const after = await ev(SNAP);
    const blocked = posts.some(p => BLOCK.test(p)), shownErr = /QA-BLOCKED/.test(after) || dialogs.some(x => /QA-BLOCKED/.test(x));
    let result = errs.length ? 'PAGE ERROR' : blocked ? (shownErr || dialogs.length ? 'blocked action, error shown' : 'BLOCKED ACTION, ERROR NOT SHOWN') : dialogs.length ? 'asked for confirmation' : posts.length ? 'saved to the app' : after !== before ? 'changed the screen' : 'NO VISIBLE EFFECT';
    report.push({ screen: name, ...cur, how, result, posts: [...posts], dialogs: [...dialogs], errors: errs.slice(0, 2) });
    console.log(`${result.padEnd(32)} ${cur.tag}${cur.type ? ':' + cur.type : ''} “${cur.label}”${posts.length ? ' → ' + posts.join(', ') : ''}${dialogs.length ? ' [' + dialogs.join('; ') + ']' : ''}${errs.length ? ' ' + errs[0].slice(0, 160) : ''}`);
  }
}
const bad = report.filter(r => /PAGE ERROR|NOT SHOWN|NO VISIBLE|not found/.test(r.result));
console.log(`\n${report.length} controls exercised · ${bad.length} to look at`);
if (OUTF) fs.writeFileSync(OUTF, JSON.stringify(report, null, 1));
ws.close(); chrome.kill(); await sleep(800); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {}
