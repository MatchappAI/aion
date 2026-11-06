import { spawn } from 'node:child_process'; import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9354', '--user-data-dir=/tmp/aion-logo', 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9354/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
await cmd('Page.enable'); await cmd('Network.enable'); await cmd('Network.setCacheDisabled', { cacheDisabled: true });
await cmd('Emulation.setDeviceMetricsOverride', { width: 700, height: 300, deviceScaleFactor: 3, mobile: false });
await cmd('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(2000);
const r = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 560, height: 70, scale: 1 } });
fs.writeFileSync(new URL('./out/logo-zoom.png', import.meta.url), Buffer.from(r.data, 'base64'));
sock.close(); chrome.kill();
