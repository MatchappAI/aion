// Screens for the investor appendix, from real data only. Run with the app running: node tests/ui/appendix-shots.mjs
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const OUT = new URL('../../../_build/appx/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9355', '--user-data-dir=/tmp/aion-appx', 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9355/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (name, h = 1500) => { await ev('window.scrollTo(0,0)'); await sleep(400); const r = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1280, height: h, scale: 2 }, captureBeyondViewport: true }); fs.writeFileSync(OUT + name + '.png', Buffer.from(r.data, 'base64')); console.log('saved', name); };
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 2, mobile: false });
await cmd('Page.navigate', { url: (process.env.AION_BASE || 'http://localhost:8811') + '/' }); await sleep(2500);
// 1. Value Creation on GEE Group's audited numbers
await ev(`document.querySelector('[data-app="vc"]').click()`); await sleep(2000);
await ev(`[...document.querySelectorAll('.tabs button, #tabs button, #tabs a')].find(b => /GEE/.test(b.innerText))?.click()`); await sleep(2500);
await ev(`document.querySelector('[data-tab-btn="overview"]')?.click()`); await sleep(1200); await shot('vc-overview', 1400);
await ev(`document.querySelector('[data-tab-btn="plan"]')?.click()`); await sleep(1200); await shot('vc-plan', 1400);
// 2. Proprietary Search: who to call this week and the demand radar
await ev(`document.querySelector('[data-app="ps"]').click()`); await sleep(3000); await shot('ps-home', 1700);
// 3. a target result with its sources, data signals and client book
await ev(`[...document.querySelectorAll('.trow')].find(r => /SCM Talent/.test(r.innerText))?.click()`); await sleep(3000); await shot('ps-result', 1800);
await ev(`document.querySelector('#ps-close')?.click()`); await sleep(300); await ev(`document.querySelector('#ps-back')?.click()`); await sleep(1200);
// 4. Documents: the real county RFP, and a candidate write-up (the candidate's name is masked: a private individual)
await ev(`document.querySelector('[data-app="docs"]').click()`); await sleep(2000);
await ev(`[...document.querySelectorAll('tr[data-doc]')].find(r => /RFP response/.test(r.innerText))?.click()`); await sleep(2000); await shot('docs-proposal', 1700);
await ev(`document.querySelector('#dc-back').click()`); await sleep(1200);
await ev(`[...document.querySelectorAll('tr[data-doc]')].find(r => /Candidate write-up/.test(r.innerText))?.click()`); await sleep(2000);
await ev(`(() => { const n = document.querySelector('.doc h1')?.childNodes[0]?.textContent.trim(); if (!n) return; const parts = n.split(' '); const walk = el => { for (const c of el.childNodes) { if (c.nodeType === 3) { for (const p of parts) if (p.length > 2) c.textContent = c.textContent.split(p).join(p === parts[0] ? 'Candidate' : 'A.'); } else walk(c); } }; walk(document.querySelector('.doc')); })()`);
await shot('docs-writeup', 1500);
await ev(`document.querySelector('[data-app="ps"]').click()`); await sleep(500);
sock.close(); chrome.kill();
