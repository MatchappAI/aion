import { spawn } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9351', '--user-data-dir=/tmp/aion-wide', 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9351/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
await cmd('Page.enable'); await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
await cmd('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(2000);
const find = `[...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > 392 && r.width > 0 && getComputedStyle(e).display !== 'none'; }).filter(e => ![...e.children].some(c => c.getBoundingClientRect().right > 392)).slice(0, 8).map(e => e.tagName + '.' + e.className + ' w=' + Math.round(e.getBoundingClientRect().width) + ' right=' + Math.round(e.getBoundingClientRect().right) + ' :: ' + (e.textContent || '').trim().slice(0, 40)).join('\\n')`;
await ev(`document.querySelector('[data-app="vc"]').click()`); await sleep(1800); console.log('VC\n' + await ev(find)); console.log(await ev(`(() => { const out = []; const main = document.querySelector('#main'); out.push('main w=' + Math.round(main.getBoundingClientRect().width) + ' sw=' + main.scrollWidth + ' pad=' + getComputedStyle(main).padding);
const r2 = document.querySelector('.r2'); out.push('r2 w=' + Math.round(r2.getBoundingClientRect().width) + ' display=' + getComputedStyle(r2).display);
for (const c of r2.children) { if (getComputedStyle(c).display === 'none') continue; out.push('  ' + c.tagName + '.' + c.className + ' w=' + Math.round(c.getBoundingClientRect().width) + ' sw=' + c.scrollWidth + ' minw=' + getComputedStyle(c).minWidth); }
return out.join('\n'); })()
`));
await ev(`document.querySelector('[data-open="smurnca1nb1"]').click()`); await sleep(2000); console.log('RESULTS\n' + await ev(find));
sock.close(); chrome.kill();
