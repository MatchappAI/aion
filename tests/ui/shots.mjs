// Screenshots of the main screens for review: node tests/ui/shots.mjs <searchId>...
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9341', '--window-size=1280,1000', '--user-data-dir=' + path.join(OUT, 'profile2'), 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9341/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (n, max = 3000) => { const h = await ev('document.documentElement.scrollHeight'); await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.min(h, max), deviceScaleFactor: 1, mobile: false }); await sleep(300); const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(r.data, 'base64')); await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }); };
await cmd('Page.enable'); await cmd('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(2000);
await ev(`document.querySelector('[data-app="vc"]').click()`); await sleep(1200); await shot('rv-vc');
await ev(`document.querySelector('[data-app="ps"]').click()`); await sleep(1800); await shot('rv-pshome');
for (const sid of process.argv.slice(2)) { await ev(`document.querySelector('[data-open="${sid}"]')?.click()`); await sleep(2000); await shot('rv-' + sid, 2600); await ev(`document.querySelector('[data-detail]')?.click()`); await sleep(700); await shot('rv-' + sid + '-d', 1000); await ev(`document.querySelector('#ps-close')?.click()`); await ev(`document.querySelector('#ps-back')?.click()`); await sleep(1500); }
sock.close(); chrome.kill();
