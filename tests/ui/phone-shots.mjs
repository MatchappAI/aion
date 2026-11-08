import { spawn } from 'node:child_process'; import fs from 'node:fs';
const OUT = new URL('./out/', import.meta.url).pathname; const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9356', '--user-data-dir=/tmp/aion-phone', 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9356/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (n, h = 2400) => { const r = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 390, height: h, scale: 1 }, captureBeyondViewport: true }); fs.writeFileSync(OUT + n + '.png', Buffer.from(r.data, 'base64')); const w = await ev('document.documentElement.scrollWidth'); console.log(n, 'width', w); };
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await cmd('Page.navigate', { url: (process.env.AION_BASE || 'http://localhost:8811') + '/' }); await sleep(2500);
for (const a of ['ps', 'docs']) { await ev(`document.querySelector('[data-app="${a}"]').click()`); await sleep(2500); await shot('phone-' + a); }
await ev(`[...document.querySelectorAll('tr[data-doc]')][0]?.click()`); await sleep(2000); await shot('phone-doc');
await ev(`document.querySelector('[data-app="ps"]').click()`); await sleep(800);
sock.close(); chrome.kill();
