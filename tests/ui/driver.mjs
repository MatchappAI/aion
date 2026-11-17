// Tiny headless-Chrome driver for scripted user journeys (never a visible window):
//   node tests/ui/driver.mjs http://localhost:<test port> tests/ui/sequences.js   (always a workspace copy, never real data)
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [BASE, SCRIPT] = process.argv.slice(2);
const PORT = 9300 + Math.floor(Math.random() * 50);
const PROF = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT, '--window-size=' + (process.env.WIN || '1366,1000'), '--user-data-dir=' + PROF, 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws; for (let i = 0; i < 60 && !ws; i++) { try { const pg = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x => x.type === 'page'); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl); } catch {} await sleep(250); }
if (ws.readyState !== 1) await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; const errors = [], dialogs = []; const DLG = { accept: false, text: '' };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result || d); delete pend[d.id]; }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Page.javascriptDialogOpening') { dialogs.push(d.params.message); send('Page.handleJavaScriptDialog', { accept: DLG.accept, promptText: DLG.text }); } };
await send('Runtime.enable'); await send('Page.enable'); await send('Page.setDownloadBehavior', { behavior: 'deny' });
const ev = async expr => { const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), sleep(15000).then(() => ({ timeout: true }))]); if (r.timeout) return '__TIMEOUT__'; if (r.exceptionDetails) return '__ERR__ ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const nav = async (u = BASE) => { await send('Page.navigate', { url: u }); await sleep(1500); };
const shot = async f => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); };
const log = (...a) => console.log(...a);
try { const body = fs.readFileSync(SCRIPT, 'utf8'); await (new Function('ev', 'nav', 'sleep', 'shot', 'send', 'log', 'errors', 'dialogs', 'BASE', 'DLG', `return (async () => { ${body} })()`))(ev, nav, sleep, shot, send, log, errors, dialogs, BASE, DLG); }
catch (e) { console.log('SCRIPT ERROR', e.message); }
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
ws.close(); chrome.kill(); await sleep(500); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {}
