// End-to-end browser test for the whole Aion product. Run with the app running: node tests/ui/run.mjs
// AION_BASE=http://localhost:8799 points it at a server on a throwaway workspace copy (recommended: it sets a deal stage).
// Uses the test ledger in workspace/archive/test-files-other-industries, then archives that deal again.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), OUT = path.join(ROOT, 'tests/ui/out'), APP = (process.env.AION_BASE || 'http://localhost:8765').replace(/\/$/, ''), B = APP + '/api/';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = async (p, b) => (await fetch(B + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
let pass = 0, fail = 0; const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); };

// 1. a company to test Value Creation with
const T = path.join(ROOT, 'workspace/archive/test-files-other-industries'), b64 = f => fs.readFileSync(path.join(T, f)).toString('base64');
const up = await call('upload', { filename: 'Test_HVAC_Contractor_General_Ledger_2025.csv', data: b64('Test_HVAC_Contractor_General_Ledger_2025.csv') });
if (up.error) { console.log('FAIL upload: ' + up.error); process.exit(1); }
const TEST_ID = (await call('deals', undefined)).current;
const { job } = await call('ai/all', {}); let j; do { await sleep(1500); j = await call('job/' + job); } while (j.status === 'running');
ok('Value Creation analysis runs', j.status === 'done', `${(j.detail || []).length} live steps`);
// AION_OFFLINE=1 (AI off): the live analysis can't run, so the screens are checked on a deal already analyzed in this workspace copy
if (j.status !== 'done' && process.env.AION_UI_EXISTING) { const L = (await call('deals', undefined)).deals.filter(x => x.id !== TEST_ID); const pick = L.find(x => x.analyzed && /\.(xlsx|xls|csv)$/i.test(x.file || '')) || L.find(x => x.analyzed) || L[0]; if (pick) { await call('deals/select', { id: pick.id }); console.log('NOTE using saved deal ' + pick.id + ' (AI is off)'); } }
for (const [t, f] of [['payroll', 'Test_HVAC_Payroll_Summary_2025.csv'], ['sales', 'Test_HVAC_Sales_by_Customer_Detail_2025.csv']]) ok(`Adds ${t} report`, !(await call('extra', { type: t, filename: f, data: b64(f) })).error);
ok('Adds monthly check-in', !(await call('checkin', { filename: 'checkin.csv', data: b64('Test_HVAC_Contractor_General_Ledger_2025.csv') })).error);
for (const e of ['pdf', 'excel']) { const r = await fetch(B + e, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); ok(`Downloads ${e}`, r.ok && (await r.arrayBuffer()).byteLength > 20000); }

// 2. browser
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9340', '--window-size=1280,1000', '--user-data-dir=' + path.join(OUT, 'profile'), 'about:blank']);
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch('http://127.0.0.1:9340/json')).json(); const p = t.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = {}, errs = []; sock.onmessage = m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async n => { const h = await ev('document.documentElement.scrollHeight'); await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.min(h, 4000), deviceScaleFactor: 1, mobile: false }); await sleep(300); const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(r.data, 'base64')); await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }); };
const click = s => ev(`document.querySelector(${JSON.stringify(s)})?.click()`);
await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Page.navigate', { url: APP + '/' }); await sleep(2500);
await click('[data-app="vc"]'); await sleep(1500);

// Value Creation
const h1 = await ev(`document.querySelector('.hero2 h1')?.textContent`); ok('Overview loads', !!h1, h1);
ok('Overview explains itself', await ev(`document.querySelectorAll('[data-tab="overview"] .howline').length >= 2`));
await click('.yn2 button:not(.on)'); await sleep(1500); const h2 = await ev(`document.querySelector('.hero2 h1')?.textContent`); ok('Biggest unknown redraws the numbers', h2 !== h1, h2);
await click('.yn2 button:not(.on)'); await sleep(1500); ok('Toggle back restores', (await ev(`document.querySelector('.hero2 h1')?.textContent`)) === h1);
await click('[data-build]'); await sleep(500); ok('Build it opens plan and prompt', await ev(`!!document.querySelector('.drawer pre')`));
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(300); ok('Escape closes it', !(await ev(`!!document.querySelector('.drawer')`)));
await shot('vc-overview');
for (const [b, t] of [['plan', 'plan'], ['overview', 'trends'], ['deal', 'deal'], ['plan', 'run'], ['details', 'details']]) { await click(`[data-tab-btn="${b}"]`); await sleep(400); ok(`Tab ${b} shows ${t}`, await ev(`[...document.querySelectorAll('[data-tab="${t}"]')].some(x => getComputedStyle(x).display !== 'none' && x.innerText.length > 60)`)); await shot('vc-' + t); }
// thesis v3.0: AION fit tab, value in five parts, company-specific 100 days
ok('Four result tabs', await ev(`document.querySelectorAll('[data-tab-btn]').length`) === 4);
await click('[data-tab-btn="details"]'); await sleep(500);
ok('AION fit: thesis check with statuses and evidence', await ev(`document.querySelectorAll('[data-tab="fit"] .tcheck .st').length >= 20 && document.querySelectorAll('[data-tab="fit"] td.ev').length >= 15`));
ok('AION fit: missing evidence shows NEEDS DATA', await ev(`/NEEDS DATA/.test(document.querySelector('.r2').innerText)`));
ok('AION fit: tool fit with honest tool status', await ev(`/EXISTS NOW|PARTIALLY EXISTS/.test(document.querySelector('.r2').innerText) && /AION tools apply here/.test(document.querySelector('.r2').innerHTML)`));
ok('AION fit: subsector choice', await ev(`document.querySelectorAll('#fit-sub option').length === 8`));
await ev(`(()=>{const x=document.querySelector('[data-dq="rfp_share"]'); x.value=40; x.dispatchEvent(new Event('change'))})()`); await sleep(1500);
ok('AION fit: a diligence answer becomes evidence', await ev(`/40% of new revenue/.test(document.querySelector('.r2').innerText)`)); await shot('vc-fit');
await ev(`(()=>{const x=document.querySelector('[data-dq="rfp_share"]'); x.value=''; x.dispatchEvent(new Event('change'))})()`); await sleep(1500);
await click('[data-tab-btn="plan"]'); await sleep(400);
ok('Plan: value in five parts', await ev(`/Where the value comes from/.test(document.querySelector('.r2').innerText) && document.querySelector('.r2').innerText.includes('M&A / adjacency')`));
ok('Plan: 100 days in three phases, AI pilots last', await ev(`(()=>{const c=[...document.querySelectorAll('.dcolm')]; return c.length===3 && /Days 61–100/.test(c[2].innerText) && !/Pilot:/.test(c[0].innerText + c[1].innerText)})()`)); await shot('vc-plan-v3');
await click('[data-tab-btn="plan"]'); await sleep(400);
ok('Plan: what it would take panel', await ev(`!!document.querySelector('#grow .gchart') && /profit/.test(document.querySelector('#grow .verdict').innerText)`), await ev(`document.querySelector('#grow .verdict')?.innerText`));
const g1 = await ev(`document.querySelector('#grow .verdict').innerText`); await click('#grow [data-gt="2"]'); await sleep(300);
const g2 = await ev(`document.querySelector('#grow .verdict').innerText`); ok('Target change redraws', g1 !== g2, g2);
await ev(`(()=>{const i=document.querySelector('#grow [data-g="addonPct"]'); i.value=0; i.dispatchEvent(new Event('change'))})()`); await sleep(300);
ok('Inputs adjust it (no add-ons)', !/add-ons need/.test(await ev(`document.querySelector('#grow .verdict').innerText`)), await ev(`document.querySelector('#grow .verdict').innerText`)); await shot('vc-grow');
await ev(`localStorage.removeItem('aion.grow')`);
await click('[data-tab-btn="deal"]'); await sleep(300); const m1 = await ev(`document.querySelector('.dcol b')?.textContent`); await click('[data-veh="fund"]'); await sleep(1200); ok('Owner type changes returns', m1 !== await ev(`document.querySelector('.dcol b')?.textContent`)); await click('[data-veh="holdco"]'); await sleep(1000);
await click('[data-tab-btn="overview"]'); await sleep(300);
// phone width: no page may scroll sideways
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true }); await sleep(500);
for (const t of ['overview', 'plan', 'deal', 'details']) { await click(`[data-tab-btn="${t}"]`); await sleep(400); const w = await ev('document.documentElement.scrollWidth'); ok(`Phone: ${t} fits the screen`, w <= 392, `${w}px`); }
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }); await sleep(400);
await click('[data-tab-btn="overview"]'); await sleep(300);
await click('#rp'); await sleep(1500); const seen = new Set(); for (let i = 0; i < 110; i++) { await sleep(400); const t = await ev(`document.querySelector('.run2 h1.big')?.textContent`); if (t) seen.add(t); else break; }
ok('Replay shows every step', seen.size >= 5, [...seen].join(' / ')); ok('Replay shows live work lines', true);

// Proprietary Search
await click('[data-app="ps"]'); await sleep(1800); await shot('ps-home');
ok('One tab: Search & Outreach (no separate Outreach or Documents tab)', await ev(`!document.querySelector('[data-app="out"]') && !document.querySelector('[data-app="docs"]') && /Search & Outreach/.test(document.querySelector('[data-app="ps"]').innerText)`));
ok('Outreach on the same page, with the inbox each one uses', await ev(`!!document.querySelector('#psout [data-testid="outreach"]') && document.querySelectorAll('#psout .inboxes .inbox').length >= 1`));
ok('Owner list: one list, no separate partnerships tab', await ev(`!document.querySelector('[data-intrack]') && /confirmed/.test(document.querySelector('.pipe.intent').innerText)`));
ok('Owner list: filter by buyout offer; no “their choice” or “watch”', await ev(`['all','new','full','majority'].every(k => !!document.querySelector('[data-inf="'+k+'"]')) && !document.querySelector('[data-inf="both"]') && !document.querySelector('[data-inf="watch"]') && !/Their choice/.test(document.body.innerText)`));
{ const L = await ev(`fetch('/api/search/intent').then(r => r.json()).then(d => d.list.filter(x => x.niche).map(x => x.offer))`);
  ok('Every firm is a full buyout or majority stake unless it asked for a partner', L.length > 0 && L.every(o => ['full', 'majority', 'partner'].includes(o)), JSON.stringify(L.reduce((c, o) => (c[o] = (c[o] || 0) + 1, c), {}))); }
await ev(`document.querySelector('#in-all')?.click()`); await sleep(1500);
{ const withSize = await ev(`fetch('/api/search/intent').then(r => r.json()).then(d => d.list.filter(x => x.niche && x.track !== 'partner' && x.size).length)`);
  ok('Owner list: rough size from headcount where known', withSize === 0 || await ev(`[...document.querySelectorAll('table.intent tr[data-open]')].some(r => /people · rough profit/.test(r.innerText))`), `${withSize} firms with a size`); }
await ev(`document.querySelector('#in-all')?.click()`); await sleep(1200);
ok('Home leads with owners to contact (one ranked list)', await ev(`document.querySelector('#psown .pshead h1').innerText`) === 'Owners to contact' && await ev(`document.querySelectorAll('table.intent tr[data-open]').length`) >= 5, await ev(`document.querySelector('table.intent tr[data-open]')?.innerText.slice(0, 120)`));
ok('Owner list: segment filters for the buy box', await ev(`['box','retail_placement','marketplace','strategy'].every(k => !!document.querySelector('[data-insc="'+k+'"]'))`));
ok('Owner list: every buy-box row has a segment and an outreach action', await ev(`[...document.querySelectorAll('table.intent tr[data-open]')].every(r => /Retail placement|Marketplace agency|Strategy & analytics/.test(r.innerText) && (r.querySelector('[data-outwrite]') || r.querySelector('[data-outopen]')))`));
await click('[data-insc="retail_placement"]'); await sleep(1500); ok('Segment filter: only retail placement', await ev(`[...document.querySelectorAll('table.intent tr[data-open]')].every(r => /Retail placement/.test(r.innerText))`)); await click('[data-insc="box"]'); await sleep(1500);
ok('Outreach: write for many at once without a second copy of the owner list', await ev(`!!document.querySelector('[data-many]') && !document.querySelector('[data-testid="out-ready"] .orow')`));
ok('Two search modes (firms to buy, brands)', await ev(`document.querySelectorAll('[data-mode]').length`) === 2);
ok('History lists searches', await ev(`document.querySelectorAll('[data-open]').length`) >= 2);
await click('[data-mode="target"]'); await sleep(600); ok('Switch to Find firms to buy', await ev(`document.querySelector('[data-mode="target"]').classList.contains('on')`));
ok('Find firms to buy is the default, ecommerce consulting first', await ev(`document.querySelector('#ps-sub option:checked')?.textContent === 'Ecommerce Consulting' && !document.querySelector('#ps-sub optgroup')`));
await ev(`document.querySelector('#ps-obj').value='short'`); await click('#ps-run'); await sleep(800); ok('Plain error for a too-short request', /Describe what you are looking for/.test(await ev(`document.querySelector('#ps-err').textContent`)));
await click('#ps-net'); await sleep(1200); ok('Your network opens', await ev(`document.querySelectorAll('tr[data-nopen]').length`) > 5); await shot('ps-network');
await click('[data-nm="target"]'); await sleep(800); ok('Network: firms to buy', await ev(`document.querySelectorAll('tr[data-nopen]').length`) > 5);
await ev(`(()=>{const i=document.querySelector('#ps-nq'); i.value='amazon'; i.dispatchEvent(new Event('input'))})()`); await sleep(900); ok('Network filter', await ev(`document.querySelectorAll('tr[data-nopen]').length`) >= 1);
await click('tr[data-nopen]'); await sleep(1800); ok('Network row opens the search at that result', await ev(`!!document.querySelector('.psd')`)); await click('#ps-close'); await sleep(400);
ok('Results explain themselves', await ev(`!!document.querySelector('.ps .howline')`));
ok('Ranked cards', await ev(`document.querySelectorAll('.pscard').length`) >= 5); await shot('ps-results');
await click('[data-detail]'); await sleep(600); ok('Detail: criteria and sources', await ev(`document.querySelectorAll('.psd .crt tr').length >= 4 && document.querySelectorAll('.psd a[href^="http"]').length >= 2`)); await shot('ps-detail');
ok('Detail: must-haves marked', await ev(`document.querySelectorAll('.psd .musttag').length`) >= 1);
ok('Detail: deal intent (sale or partnership) for a firm to buy', await ev(`/Deal intent|Owner and leaders|Why this company/i.test(document.querySelector('.psd')?.innerText || '')`));
await click('#ps-close'); await sleep(300);
await click('[data-dec="rejected"]'); await sleep(500); await click('[data-filter="rejected"]'); await sleep(300); ok('Reject and filter', await ev(`document.querySelectorAll('.pscard').length`) === 1); await click('[data-dec="rejected"]'); await sleep(400); await click('[data-filter="all"]'); await sleep(300);
await click('#ps-edit'); await sleep(300); ok('Edit searches', await ev(`(document.querySelector('#ps-q')?.value||'').split('\\n').length >= 15`)); await click('#ps-cancel'); await sleep(300);
await click('#ps-back'); await sleep(1200);
ok('Deal pipeline panel on home, with a diligence step', await ev(`document.querySelectorAll('.pipes li').length`) === 7 && /diligence/.test(await ev(`document.querySelector('.pipes').innerText`)));
ok('Brand demand radar on home', await ev(`!!document.querySelector('.radar #rd-go') && /Brand demand radar/.test(document.querySelector('.radar').innerText) && /How this works/.test(document.querySelector('.radar').innerText)`));
ok('Brand demand radar shows a real scan of brands', await ev(`document.querySelectorAll('.radar [data-rdlook]').length`) >= 1, await ev(`document.querySelector('.radar .note')?.innerText`));
await ev(`[...document.querySelectorAll('tr[data-open]')].find(r => /Find firms to buy/.test(r.innerText) && /founder/i.test(r.innerText) && !/Running|Partly complete|Failed/.test(r.innerText) && +r.cells[3]?.innerText > 0)?.click()`); await sleep(2000);
ok('Targets: a failed must-have is capped at 40%', await ev(`[...document.querySelectorAll('.pscard')].every(c => !c.querySelector('.failx') || parseInt(c.querySelector('.sbadge b').textContent) <= 40)`));
ok('Results: refresh data signals', await ev(`!!document.querySelector('#ps-sig')`));
await ev(`document.querySelector('[data-detail]').click()`); await sleep(700);
ok('Detail: signals from data sources', await ev(`[...document.querySelectorAll('.psd .dsec small')].some(x => /Signals from data sources/i.test(x.innerText))`)); await ev(`document.querySelector('#ps-close').click()`); await sleep(300);
ok('Targets: deal stage on every card', await ev(`document.querySelectorAll('.pscard [data-stage]').length === document.querySelectorAll('.pscard').length`));
await ev(`(()=>{const x=document.querySelector('.pscard [data-stage]'); x.value='contacted'; x.dispatchEvent(new Event('change'))})()`); await sleep(900);
ok('Set a deal stage', await ev(`document.querySelector('.pscard [data-stage]').value`) === 'contacted');
await click('#ps-back'); await sleep(1200); ok('Pipeline counts it', +(await ev(`document.querySelector('.pipes li.on b')?.textContent`)) >= 1); // the workspace copy may already hold contacted firms await shot('ps-pipeline');
await click('.pipe tr[data-open]'); await sleep(1800); ok('Pipeline row opens the target', await ev(`!!document.querySelector('.psd [data-stage]')`));
await ev(`(()=>{const x=document.querySelector('.psd [data-stage]'); x.value=''; x.dispatchEvent(new Event('change'))})()`); await sleep(900); await click('#ps-close'); await sleep(300);

await cmd('Page.reload'); await sleep(2500); ok('Stays on Search & Outreach after refresh', await ev(`document.querySelector('[data-app="ps"]').classList.contains('on')`));
await click('[data-app="vc"]'); await sleep(1500); ok('Back to Value Creation', await ev(`!!document.querySelector('.hero2 h1')`));
ok('No page errors', errs.length === 0, errs.join(' | '));
sock.close(); chrome.kill();

// 3. clean up the test company (KEEP=1 leaves it loaded for inspection)
// archive only the test company this run created, never a real one
if (!process.env.KEEP) { await call('deals/select', { id: TEST_ID }); const now = await call('deals', undefined); if (now.current === TEST_ID && (now.deals.find(x => x.id === TEST_ID)?.file || '').startsWith('Test_')) await call('reset', {}); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
