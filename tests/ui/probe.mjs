import { spawn } from 'node:child_process'; import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9352', '--user-data-dir=/tmp/aion-probe', 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9352/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'ERR ' + JSON.stringify(r.exceptionDetails).slice(0, 300) : r.result?.value; };
await cmd('Page.enable'); await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await cmd('Page.navigate', { url: (process.env.AION_BASE || 'http://localhost:8811') + '/' }); await sleep(2000);
await ev(`document.querySelector('[data-app="vc"]').click()`); await sleep(1800);
for (const w of [1280, 390]) { await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 }); await sleep(600);
  console.log(w + ': ' + await ev(`[...document.querySelectorAll('img')].map(i => { const r = i.getBoundingClientRect(); return (i.getAttribute('src')||'').split('/').pop() + ' shown ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ratio ' + (r.width / r.height).toFixed(3) + ' natural ' + (i.naturalWidth / i.naturalHeight).toFixed(3); }).join(' | ')`)); }
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await ev(`document.querySelector('[data-tab-btn="overview"]').click()`); await sleep(600);
console.log('details wide: ' + await ev(fs.readFileSync(new URL('./wide-probe2.js', import.meta.url), 'utf8')));
sock.close(); chrome.kill();
