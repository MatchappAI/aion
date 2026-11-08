import { spawn } from 'node:child_process';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9355', '--user-data-dir=/tmp/aion-err', 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9355/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') console.log('EXC', d.params.exceptionDetails.exception?.description?.slice(0, 600)); if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.log('CONSOLE', JSON.stringify(d.params.args).slice(0, 400)); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Page.navigate', { url: (process.env.AION_BASE || 'http://localhost:8811') + '/' }); await sleep(2500);
await cmd('Runtime.evaluate', { expression: `document.querySelector('[data-app="vc"]').click()` }); await sleep(2000);
console.log((await cmd('Runtime.evaluate', { expression: `document.querySelector('#main').innerText.slice(0,200)`, returnByValue: true })).result.value);
sock.close(); chrome.kill();
