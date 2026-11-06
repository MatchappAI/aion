// Copy audit: walks every screen and lists each heading with or without a plain-English "How this works" line,
// plus jargon words that need a plain explanation nearby. Run with the app running: node tests/ui/copy-audit.mjs
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9353', '--user-data-dir=/tmp/aion-copy', 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9353/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.value; };
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(2500);
const JARGON = /\b(EBITDA|MOIC|IRR|LOI|NDA|DSO|TTM|SBA|ARR|RPO|CAGR|add-backs?|normaliz\w+|run-rate|pro forma|multiple|basis points|DSCR|amortiz\w+|accrual|GL|P&L|ATS|RDAP|Wayback|CDX)\b/g;
const audit = `(() => { const out = []; const vis = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null; };
  for (const h of document.querySelectorAll('h1,h2,h3,.srch b,.dsec small')) { if (!vis(h)) continue; let n = h.closest('section,.pipe,.panel,.dsec,.netcard,.srcs,.ps,.agent') || h.parentElement; const how = n && [...n.querySelectorAll('.howline,.note,.lede2,.lede,p')].some(p => vis(p) && p.innerText.length > 40);
    out.push((how ? 'ok   ' : 'NOHOW') + ' | ' + h.innerText.replace(/\\s+/g, ' ').slice(0, 90)); }
  const txt = document.body.innerText; return { heads: out, text: txt }; })()`;
const report = [];
const snap = async name => { const r = await ev(audit); const jar = {}; for (const m of r.text.match(JARGON) || []) jar[m] = (jar[m] || 0) + 1; report.push(`\n### ${name}\n${r.heads.join('\n')}\njargon: ${JSON.stringify(jar)}`); fs.writeFileSync(`tests/ui/out/copy-${name}.txt`, r.text); };
await ev(`document.querySelector('[data-app="vc"]').click()`); await sleep(2000);
for (const t of ['overview', 'plan', 'trends', 'deal', 'run', 'details']) { await ev(`document.querySelector('[data-tab-btn="${t}"]')?.click()`); await sleep(700); await snap('vc-' + t); }
await ev(`document.querySelector('[data-app="ps"]').click()`); await sleep(2500); await snap('ps-home');
await ev(`[...document.querySelectorAll('tr[data-open]')].find(r => /Find firms to buy/.test(r.innerText))?.click()`); await sleep(2500); await snap('ps-results');
await ev(`document.querySelector('[data-detail]')?.click()`); await sleep(900); await snap('ps-detail');
await ev(`document.querySelector('#ps-close')?.click()`); await sleep(300); await ev(`document.querySelector('#ps-back')?.click()`); await sleep(1500);
await ev(`document.querySelector('#ps-net')?.click()`); await sleep(1500); await snap('ps-network');
console.log(report.join('\n')); sock.close(); chrome.kill();
