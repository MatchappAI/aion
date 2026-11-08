// Screenshots for a design review at desktop and phone widths: node tests/ui/polish.mjs
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out/polish'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9350', '--user-data-dir=' + path.join(OUT, 'profile'), 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9350/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (n, w = 1280, max = 6000) => { await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 }); await sleep(500); const h = await ev('document.documentElement.scrollHeight'); await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(h, max), deviceScaleFactor: 1, mobile: w < 600 }); await sleep(400); const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(r.data, 'base64')); const ow = await ev('document.documentElement.scrollWidth'); if (ow > w + 2) console.log(`OVERFLOW ${n}: page ${ow}px wide at ${w}px`); };
const click = s => ev(`document.querySelector(${JSON.stringify(s)})?.click()`);
await cmd('Page.enable'); await cmd('Page.navigate', { url: (process.env.AION_BASE || 'http://localhost:8811') + '/' }); await sleep(2000);
await click('[data-app="vc"]'); await sleep(1200); await shot('vc-empty'); await shot('vc-empty-phone', 390);
await click('[data-app="ps"]'); await sleep(1800); await shot('ps-home'); await shot('ps-home-phone', 390);
const sid = process.argv[2]; if (sid) { await click(`[data-open="${sid}"]`); await sleep(2000); await shot('ps-results'); await shot('ps-results-phone', 390); await click('[data-detail]'); await sleep(700); await shot('ps-detail', 1280, 900); }
await click('#ps-back'); await sleep(1200); await click('#ps-net'); await sleep(1200); await shot('ps-network', 1280, 1400);
sock.close(); chrome.kill();
