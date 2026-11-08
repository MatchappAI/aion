// Phone width (390px) on the detailed Value Creation steps and an outreach item, headless, on a workspace copy:
//   AION_BASE=http://localhost:8812 node tests/ui/phone-steps.mjs
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const APP = (process.env.AION_BASE || 'http://localhost:8812').replace(/\/$/, '');
if (/:8765\b/.test(APP)) { console.error('Use a server on a workspace copy, never the real AION on 8765.'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PROF = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-phone-')), CDP = 9364;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP}`, `--user-data-dir=${PROF}`, 'about:blank']);
let u; for (let i = 0; i < 60 && !u; i++) { await sleep(250); try { u = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(u); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}, errs = []; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
let pass = 0, fail = 0; const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); };
const wide = () => ev(`[...document.querySelectorAll('#main *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > 392 && !e.closest('.tblw, pre, details:not([open]), table') && getComputedStyle(e).position !== 'fixed'; })[0] ? [[...document.querySelectorAll('#main *')].find(e => { const r = e.getBoundingClientRect(); return r.right > 392 && !e.closest('.tblw, pre, details:not([open]), table') && getComputedStyle(e).position !== 'fixed'; })].map(e => e.parentElement.tagName + '.' + e.parentElement.className + ' > ' + e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).join(' | ') : ''`);
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await cmd('Page.navigate', { url: APP + '/' }); await sleep(1200); await ev(`localStorage.setItem('aion.app', 'vc')`); await cmd('Page.navigate', { url: APP + '/' }); await sleep(3000);
await ev(`document.querySelector('[data-tab-btn="details"]')?.click()`); await sleep(600); await ev(`document.querySelector('#math')?.click()`); await sleep(1500);
for (const p of ['upload', 'map', 'earnings', 'ops', 'levers', 'plan', 'log']) {
  await ev(`document.querySelector('#nav a[data-p="${p}"]')?.click()`); await sleep(1200);
  const w = await wide(), sw = await ev('document.documentElement.scrollWidth');
  ok(`Step page ${p} fits a phone`, sw <= 392 && !w, `${sw}px ${w}`);
}
await ev(`localStorage.setItem('aion.app', 'ps')`); await cmd('Page.navigate', { url: APP + '/' }); await sleep(3000);
await ev(`document.querySelector('#psout [data-open]')?.click()`); await sleep(1500);
for (const k of ['email', 'letter', 'call']) { await ev(`document.querySelector('[data-kind="${k}"]')?.click()`); await sleep(700); const sw = await ev('document.documentElement.scrollWidth'); ok(`Outreach item (${k}) fits a phone`, sw <= 392, `${sw}px ${await wide()}`); }
ok('No page errors', errs.length === 0, errs[0]);
ws.close(); chrome.kill(); await sleep(400); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
