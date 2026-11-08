// Checks that the page keeps answering while and after Replay runs (headless):
//   AION_BASE=http://localhost:8812 node tests/ui/replay-probe.mjs
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const APP = (process.env.AION_BASE || 'http://localhost:8812').replace(/\/$/, '');
if (/:8765\b/.test(APP)) { console.error('Use a server on a workspace copy, never the real AION on 8765.'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PROF = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-replay-')), CDP = 9363;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${CDP}`, `--user-data-dir=${PROF}`, 'about:blank']);
let u; for (let i = 0; i < 60 && !u; i++) { await sleep(250); try { u = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(u); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}, errs = []; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const t0 = Date.now(); const r = await Promise.race([cmd('Runtime.evaluate', { expression: e, returnByValue: true }), sleep(10000).then(() => null)]); return [r ? r.result?.value : 'NO ANSWER', Date.now() - t0]; };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Page.navigate', { url: APP + '/' }); await sleep(1200); await ev(`localStorage.setItem('aion.app', 'vc')`); await cmd('Page.navigate', { url: APP + '/' }); await sleep(3000);
console.log('before', await ev(`!!document.querySelector('#rp')`));
await ev(`document.querySelector('#rp')?.click()`);
for (let i = 0; i < 8; i++) { await sleep(2000); console.log('t+' + (i + 1) * 2 + 's', JSON.stringify(await ev(`document.querySelector('.run2 h1.big')?.textContent || document.querySelector('.hero2 h1')?.textContent || '?'`))); }
await cmd('Page.navigate', { url: APP + '/' }); await sleep(2500); console.log('after reload', JSON.stringify(await ev(`document.title + ' ' + !!document.querySelector('#main')`)));
console.log('errors', errs);
ws.close(); chrome.kill(); await sleep(400); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {}
