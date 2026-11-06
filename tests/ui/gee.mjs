import { spawn } from 'node:child_process'; import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms)), OUT = new URL('./out/', import.meta.url).pathname;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9353', '--user-data-dir=/tmp/aion-gee', 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9353/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}, errs = []; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(2000); await ev(`document.querySelector('[data-app="vc"]').click()`); await sleep(1800);
for (const t of ['overview', 'plan', 'deal']) { await ev(`document.querySelector('[data-tab-btn="${t}"]').click()`); await sleep(600); const h = await ev('document.documentElement.scrollHeight'); await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.min(h, 2400), deviceScaleFactor: 1, mobile: false }); await sleep(300); const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + 'gee-' + t + '.png', Buffer.from(r.data, 'base64')); await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }); }
const pdf = await fetch('http://localhost:8765/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const xl = await fetch('http://localhost:8765/api/excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
console.log('errors:', errs.length ? errs : 'none', '| pdf', pdf.status, '| excel', xl.status);
sock.close(); chrome.kill();
