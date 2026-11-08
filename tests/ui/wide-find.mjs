// Lists the elements wider than a phone screen on one app screen (headless):
//   AION_BASE=http://localhost:8812 node tests/ui/wide-find.mjs ps
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const APP = (process.env.AION_BASE || 'http://localhost:8812').replace(/\/$/, ''), SCREEN = process.argv[2] || 'ps';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PROF = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-wide-')), CDP = 9362;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP}`, `--user-data-dir=${PROF}`, 'about:blank']);
let u; for (let i = 0; i < 60 && !u; i++) { await sleep(250); try { u = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(u); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await cmd('Page.navigate', { url: APP + '/' }); await sleep(1200); await ev(`localStorage.setItem('aion.app', '${SCREEN}')`); await cmd('Page.navigate', { url: APP + '/' }); await sleep(3000);
console.log(JSON.stringify(await ev(`(() => { const out = []; for (const e of document.querySelectorAll('body *')) { const r = e.getBoundingClientRect(); if (r.right > 392 && !e.closest('.tblw, pre') && getComputedStyle(e).position !== 'fixed') out.push([e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : ''), Math.round(r.width), Math.round(r.right), (e.innerText || '').slice(0, 40)]); } return out.slice(0, 25); })()`), null, 1));
ws.close(); chrome.kill(); await sleep(400); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {}
