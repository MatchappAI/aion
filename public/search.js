import { toast, busy } from './ui.js';
import { SUBSECTORS, asksForPartner } from '/thesis.mjs';
// Proprietary Search: find people, clients and firms to buy on one shared search engine.
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// links that come from web pages: only web, email and phone addresses become clickable
const safeUrl = v => { const u = String(v ?? '').trim(); return /^(https?:\/\/|mailto:|tel:)/i.test(u) ? esc(u) : '#'; };
const api = async (p, b) => { const r = await fetch('/api/' + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const ago = d => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const day = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const how = t => `<p class="howline"><b>How this works:</b> ${t}</p>`;
let P = { view: 'home', mode: 'target', id: null, data: null, timer: null, filter: 'all', sort: 'score', open: null, editing: false, err: '' };
const MODES = {
  target: { label: 'Find firms to buy', sub: 'Founder-owned ecommerce consulting firms AION could buy', noun: 'companies', one: 'company', score: 'Fit',
    ph: 'Describe the firm you want to buy, e.g. “founder-owned food and beverage brokers in the Southeast getting emerging brands into Kroger and Publix” or “Amazon and Walmart.com marketplace agencies, 10–60 people”.' },
  client: { label: 'Find brands', sub: 'Consumer brands that need retail or marketplace help, and who decides', noun: 'companies', one: 'company', score: 'Opportunity',
    ph: 'Describe the brands, e.g. “better-for-you snack brands that raised money in the last year and are not yet in Kroger or Target”.' },
  candidate: { label: 'Find people', sub: 'Account leads, sales and marketplace talent for a firm you own', noun: 'candidates', one: 'candidate', score: 'Match',
    ph: 'Describe the person, e.g. “a retail account manager who has sold into Walmart and Target for natural food brands, based in Arkansas”.' },
};
const FILTERS = { candidate: [['location', 'Location'], ['industry', 'Industry'], ['titles', 'Target titles'], ['seniority', 'Seniority'], ['employers', 'Target employers'], ['exclude_employers', 'Exclude employers'], ['years', 'Years of experience'], ['keywords', 'Keywords'], ['exclude', 'Exclude keywords']],
  client: [['location', 'States or region'], ['industry', 'Category (snacks, beauty, pet…)'], ['size', 'Company size'], ['signals', 'Signals (funding, new retailer…)'], ['roles', 'Who decides'], ['keywords', 'Keywords'], ['exclude', 'Exclude keywords']],
  target: [['location', 'States or region'], ['industry', 'Segment (retail placement, marketplace, strategy)'], ['size', 'Size (employees or revenue)'], ['ownership', 'Ownership'], ['founded', 'Founded before'], ['keywords', 'Keywords'], ['exclude', 'Exclude keywords']] };
const STAGES = [['strategy', 'Strategy'], ['search', 'Searches'], ['extract', 'Pull out names'], ['resolve', 'Merge duplicates'], ['enrich', 'Verify & score'], ['signals', 'Data signals'], ['contacts', 'Contacts'], ['done', 'Ranked']];
const loc = l => String(l || '').split(/\s[(;]|\s—\s/)[0].trim();
const short = t => { const v = String(t || '').replace(/\b(St|Mt|Ft|Pt)\.\s/g, '$1 ').split(/[.;(]|\s[–—-]\s|:\s/)[0].trim().slice(0, 70); return /^(unclear|unknown|not found|n\/a|none)$/i.test(v) ? '' : v; };
const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
const titleCo = t => String(t || '').toLowerCase().replace(/\b([a-z])([a-z']*)/g, (m, a, b) => /^(llc|usa|lp|llp)$/.test(a + b) ? (a + b).toUpperCase() : a.toUpperCase() + b).replace(/\b(Of|And|The)\b(?!^)/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase());
const ST = { strong: ['Strong match', 'ok'], partial: ['Partial match', 'mid'], no_evidence: ['No evidence found', 'na'], mismatch: ['Mismatch', 'bad'] };

export function mountSearch(main) { P.main = main; draw(); }
export function leaveSearch() { clearTimeout(P.timer); P.timer = null; }

async function draw() {
  document.body.dataset.psview = P.view;
  try { const pre = JSON.parse(localStorage.getItem('aion.psPrefill') || 'null'); if (pre) { localStorage.removeItem('aion.psPrefill'); Object.assign(P, { view: 'home', id: null, mode: pre.mode, sub: pre.subsector || undefined, draft: pre.objective }); } } catch {}
  if (P.view === 'search' && P.id) return drawSearch();
  if (P.view === 'network') return drawNetwork();
  let hist = [], W = [], NS = { people: 0, companies: 0 }, SRC = [], PL = { stages: [], deals: [] }, RD = { events: [], scans: [] }, TD = { list: [], total: 0 }, IN = { list: [], counts: {} };
  try { [hist, PL, RD, W, NS, SRC, TD, IN] = await Promise.all([api('search/list').then(x => x.searches), api('search/pipeline'), api('search/radar'), api('search/watches').then(x => x.watches), api('search/network').then(x => x.stats), api('search/sources').then(x => x.sources), Promise.resolve(TD), api('search/intent')]); } catch {}
  const M = MODES[P.mode], on = SRC.filter(x => x.status === 'connected').length;
  const sum = [[hist.length, 'searches'], [hist.reduce((t, h) => t + (h.raw || 0), 0), 'pages read'], [(NS.people || 0) + (NS.companies || 0) + (NS.targets || 0), 'people and companies found'], [hist.reduce((t, h) => t + (h.contacts || 0), 0), 'verified contacts']];
  P.main.innerHTML = `<div class="ps">
    <div class="pshead"><h1>Owners to contact</h1><p class="lede2">Every firm your searches found, best first. Press Write outreach on a row; the drafts, sends and replies show up in Outreach above.</p></div>
    ${intentPanel(IN)}
    <h2 class="h2">Find more</h2>
    <div class="psmodes">${Object.entries(MODES).map(([k, m]) => `<button data-mode="${k}" class="${P.mode === k ? 'on' : ''}"><b>${m.label}</b><span>${m.sub}</span></button>`).join('')}</div>
    <div class="psform">
      ${P.mode === 'candidate' ? '' : `<label class="pssub"><span>${P.mode === 'client' ? 'Brands for which kind of firm?' : 'Kind of firm to buy'}</span><select id="ps-sub">${(() => { const cur = P.sub ?? 'ecommerce', opt = ([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(v.label)}${k === 'talent' && P.mode === 'client' ? ' (recruiting)' : ''}</option>`, E = Object.entries(SUBSECTORS);
        return `${P.mode === 'target' ? `<option value="" ${cur === '' ? 'selected' : ''}>Read it from my description</option>` : ''}${E.filter(([, v]) => !v.legacy).map(opt).join('')}`; })()}</select></label>`}
      <textarea id="ps-obj" rows="3" aria-label="What are you looking for?" placeholder="${esc(M.ph)}">${esc(P.draft || '')}</textarea>
      <details class="psf"><summary>Filters</summary><div class="psfg">${FILTERS[P.mode].map(([k, l]) => `<label><span>${l}</span><input data-f="${k}"></label>`).join('')}<label><span>Results to check in depth</span><input data-f="count" type="number" min="6" max="16" value="12"></label></div></details>
      <div class="row"><button id="ps-run">Search</button><span class="note" id="ps-err">${esc(P.err) || 'Takes 4–8 minutes. You can watch each step, or come back later.'}</span></div>
    </div>
    ${hist.length ? `<p class="quiet">${sum.map(([n, l]) => `<b>${Number(n).toLocaleString()}</b> ${l}`).join(' · ')} · <span class="link" id="ps-net">your network</span></p>` : ''}
    ${radarPanel(RD)}
    ${pipelinePanel(PL)}
    <h2 class="h2">Your searches</h2>
    ${hist.length ? `<div class="tblw"><table class="hist"><tr><th>Search</th><th class="m-hide">Type</th><th class="m-hide">Date</th><th class="num">Firms</th><th>Re-runs weekly</th><th></th></tr>${hist.map(h => { const w = W.find(x => x.lastSearch === h.id || x.objective === h.objective); return `<tr data-open="${h.id}"><td>${esc(h.objective.length > 110 ? h.objective.slice(0, 110) + '…' : h.objective)}${h.status !== 'done' ? ` <span class="pill2 ${h.status}">${{ running: 'Running', partial: 'Partly complete', failed: 'Failed' }[h.status] || h.status}</span>` : ''}</td><td class="m-hide">${MODES[h.mode].label}</td><td class="m-hide nowrap">${day(h.created)}</td><td class="num">${h.results}</td><td class="nowrap">${w ? `${w.running ? 'running now' : `next ${day(w.next)}`}${w.history.slice(-1)[0]?.fresh ? ` · ${w.history.slice(-1)[0].fresh} new` : ''} · <span class="link" data-wrun="${w.id}">run now</span>` : '<span class="note">no</span>'}</td><td><span class="link note" data-arch="${h.id}" title="Moves it to the archive folder; nothing is deleted">remove</span></td></tr>`; }).join('')}</table></div>` : '<p class="note">No searches yet. Describe who you’re looking for above.</p>'}
    <details class="more2 srcs"><summary>Data sources · ${on} of ${SRC.length} connected</summary>
      ${SRC.map(x => `<div class="src ${x.status === 'connected' ? 'on' : ''}"><i></i><div><b>${esc(x.name)}</b><span>${esc(x.note)}</span></div>${x.key === 'contacts' ? `<div class="srca">${x.status === 'connected' ? '<span class="link" id="ct-rm">remove</span> · ' : ''}<span class="link" id="ct-add">${x.status === 'connected' ? 'replace' : 'upload'}</span><input type="file" id="ct-file" accept=".csv,.xlsx,.xls" hidden></div>` : `<span class="srcs-st">${x.status}</span>`}</div>`).join('')}
      <p class="howline"><b>How this works:</b> web search finds names; sources read directly set the timing; your contacts show warm introductions.</p></details>
  </div>`;
  P.main.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { P.draft = $('#ps-obj').value; P.mode = b.dataset.mode; P.sub = undefined; draw(); });
  if ($('#ps-sub')) $('#ps-sub').onchange = () => { P.sub = $('#ps-sub').value; };
  if ($('#ps-net')) $('#ps-net').onclick = () => { P.view = 'network'; draw(); };
  if ($('#ct-add')) { $('#ct-add').onclick = () => $('#ct-file').click(); $('#ct-file').onchange = async () => { const f = $('#ct-file').files[0]; if (!f) return; const b64 = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = bad; r.readAsDataURL(f); }); try { const r = await api('search/contacts', { filename: f.name, data: b64 }); toast(`Added ${r.count.toLocaleString()} contacts at ${r.companies.toLocaleString()} companies. Results will now show who you already know.`); draw(); } catch (e) { toast(e.message, 'err'); } }; }
  if ($('#ct-rm')) $('#ct-rm').onclick = async () => { if (!confirm('Remove your uploaded contacts from AION?')) return; await api('search/contacts', { remove: true }); draw(); };
  P.main.querySelectorAll('[data-wrun]').forEach(x => x.onclick = async ev => { ev.stopPropagation(); try { const { id } = await api('search/watchrun', { id: x.dataset.wrun }); P.view = 'search'; P.id = id; draw(); } catch (e) { toast(e.message, 'err'); } });
  P.main.querySelectorAll('[data-arch]').forEach(x => x.onclick = async ev => { ev.stopPropagation(); if (!confirm('Remove this search from history? It moves to the archive folder; nothing is deleted.')) return; try { await api('search/archive', { id: x.dataset.arch }); draw(); } catch (e) { toast(e.message, 'err'); } });
  wireRadar(RD);
  wireIntent(IN);
  P.main.querySelectorAll('[data-open]').forEach(r => r.onclick = () => { P.view = 'search'; P.id = r.dataset.open; P.data = null; P.open = r.dataset.ent || null; draw(); });
  $('#ps-run').onclick = () => busy($('#ps-run'), 'Starting…', async () => {
    const objective = $('#ps-obj').value.trim(), filters = {};
    P.main.querySelectorAll('[data-f]').forEach(i => { if (i.value.trim()) filters[i.dataset.f] = i.dataset.f === 'count' ? +i.value : i.value.trim(); });
    if ($('#ps-sub')?.value) filters.subsector = $('#ps-sub').value;
    try { const { id } = await api('search/start', { mode: P.mode, objective, filters }); P.err = ''; P.draft = ''; P.view = 'search'; P.id = id; P.data = null; draw(); } catch (e) { $('#ps-err').textContent = e.message; }
  });
}

async function drawSearch() {
  clearTimeout(P.timer);
  try { P.data = await api('search/get/' + P.id); } catch (e) { P.main.innerHTML = `<div class="ps"><p class="callout err">${esc(e.message)}</p><button class="ghost" id="ps-back">← All searches</button></div>`; $('#ps-back').onclick = back; return; }
  const s = P.data, M = MODES[s.mode];
  if (s.running) { renderRunning(s, M); P.timer = setTimeout(drawSearch, 1500); return; }
  renderResults(s, M);
  if (s.signalsRunning) P.timer = setTimeout(drawSearch, 3000);
}
function back() { clearTimeout(P.timer); P.view = 'home'; P.id = null; P.open = null; P.editing = false; draw(); }

function stageRow(s) {
  const at = STAGES.findIndex(x => x[0] === s.stage), q = s.queries || [], qd = q.filter(x => x.status === 'done' || x.status === 'failed').length;
  const count = { search: q.length ? `${qd}/${q.length}` : '', enrich: s.enrichTotal ? `${s.enrichDone || 0}/${s.enrichTotal}` : '', resolve: s.funnel ? `${s.funnel.unique}` : '' };
  return `<ol class="pstages">${STAGES.map(([k, l], i) => `<li class="${i < at || s.stage === 'done' ? 'd' : i === at ? 'c' : ''}"><i></i><span>${l}</span>${count[k] ? `<em>${count[k]}</em>` : ''}</li>`).join('')}</ol>`;
}
function strategyBox(s, M, editable) {
  if (!s.strategy) return '';
  const fam = {}; for (const q of s.queries || []) (fam[q.family] ??= []).push(q);
  return `<div class="pstrat"><div class="row"><b>What the search is looking for</b><div class="spacer"></div>${editable ? `<button class="ghost sm" id="ps-edit">Edit searches and rerun</button>` : ''}</div>
    <p>${esc(s.strategy.summary || '')}</p>
    <div class="crit">${s.strategy.criteria.map(c => `<span>${esc(c.label)}<em>${'●'.repeat(c.weight)}${'○'.repeat(3 - c.weight)}</em></span>`).join('')}</div>
    <p class="meth">Methods: ${Object.keys(fam).map(f => `<span>${esc(f)} <em>${fam[f].length}</em></span>`).join('')}</p><details class="qfam" ${s.running ? 'open' : ''}><summary>See all ${(s.queries || []).length} searches</summary>
    <div class="qgrid">${Object.entries(fam).map(([f, qs]) => `<div><small>${esc(f)}</small>${qs.map(q => `<p class="q ${q.status}" title="${esc(q.error || '')}"><i></i>${esc(q.q)}${q.status === 'done' ? `<em>${q.count}</em>` : q.status === 'failed' ? '<em>failed</em>' : ''}</p>`).join('')}</div>`).join('')}</div></details></div>`;
}
// One line above the feed: a live clock and what the current step is doing, so a slow step never looks stuck
const STAGE_NOW = {
  strategy: 'Writing 20–40 web searches from your objective. This step usually takes 20–60 seconds, and the searches appear when it finishes.',
  search: 'Running the web searches in parallel. Each line below is one search finishing.',
  extract: 'Reading the search results and pulling out every name that actually appears in them.',
  resolve: 'Merging duplicates: the same firm or person found by several searches becomes one result.',
  enrich: 'Checking the best results in depth against your criteria, reading their websites and public records. This is the longest step, usually a few minutes.',
  signals: 'Reading data sources directly: domain records, saved copies of each website, news headlines and job boards. Each finding keeps its link and date.',
  contacts: 'Finding business contact details that appear word for word on a public page.',
};
function nowLine(s) {
  const secs = Math.max(0, Math.round((Date.now() - new Date(s.created).getTime()) / 1000));
  const clock = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s`;
  return `<p class="nowline"><span class="pulse"></span><b>Running for ${clock}</b> · ${STAGE_NOW[s.stage] || 'Working…'} A full search usually takes 4–8 minutes.</p>`;
}
function renderRunning(s, M) {
  P.main.innerHTML = `<div class="ps"><div class="row"><button class="ghost sm" id="ps-back">← All searches</button><span class="note">${M.label}</span></div>
    <h1 class="psobj">${esc(s.objective)}</h1>${stageRow(s)}
    ${how('searches run in parallel, names are checked and merged, then the best are checked in depth.')}
    <div class="feedw"><small>What it’s doing right now</small>${nowLine(s)}<ul class="feed">${(s.log || []).slice(-9).map((x, i, a) => `<li class="${i === a.length - 1 ? 'new' : ''}"><span>${x.t.toFixed(0)}s</span>${esc(x.text)}</li>`).join('') || '<li><span>0s</span>Starting…</li>'}</ul></div>
    ${strategyBox(s, M, false)}</div>`;
  $('#ps-back').onclick = back;
}

function renderResults(s, M) {
  const cand = s.mode === 'candidate', all = s.entities || [], scored = all.filter(e => e.scored), rest = all.filter(e => !e.scored);
  const q = s.queries || [], qDone = q.filter(x => x.status === 'done').length, qFail = q.filter(x => x.status === 'failed').length;
  let list = scored.filter(e => P.filter === 'all' ? e.decision !== 'rejected' : P.filter === 'rejected' ? e.decision === 'rejected' : P.filter === 'saved' ? ['saved', 'priority'].includes(e.decision) : true);
  const TR = { act: 3, warm: 2, none: 1, early: 0 }, tr = e => TR[e.timing?.badge] ?? 1, IL = { high: 3, some: 2, low: 1, none: 0 }, il = e => { const I = e.timing?.intent; return I ? Math.max(IL[I.sale.level], IL[I.partner.level]) * 10 + I.sale.score + I.partner.score : 0; };
  list.sort((a, b) => P.sort === 'intent' ? il(b) - il(a) || b.score - a.score : P.sort === 'paths' ? b.paths - a.paths || b.score - a.score : P.sort === 'timing' ? tr(b) - tr(a) || (b.timing?.score || 0) - (a.timing?.score || 0) || b.score - a.score : b.score - a.score);
  const avgPaths = scored.length ? (scored.reduce((t, e) => t + e.paths, 0) / scored.length).toFixed(1) : '0';
  const mins = s.runtime ? `${Math.floor(s.runtime / 60)}m ${Math.round(s.runtime % 60)}s` : '—';
  const metrics = [['Searches run', `${qDone}/${q.length}`], ['Links reviewed', s.rawCount], [`${cand ? 'People' : 'Companies'} named`, s.funnel?.extracted ?? '—'], ['Duplicates merged', s.funnel?.duplicates ?? '—'], ['Unique', s.funnel?.unique ?? '—'], ['Checked & ranked', scored.length], ['Search paths per result', avgPaths], ['Time', mins]];
  P.main.innerHTML = `<div class="ps"><div class="row"><button class="ghost sm" id="ps-back">← All searches</button><span class="note">${M.label} · ${ago(s.created)}</span></div>
    <h1 class="psobj">${esc(s.objective)}</h1>
    ${s.link ? `<p class="linkb">Started from <b>${esc(s.link.label)}</b> in an earlier search · <span class="link" data-open-search="${s.link.search}">open it</span></p>` : ''}
    <div class="row"><button class="ghost sm" id="ps-watch">${s.watch ? '✓ Watching weekly' : 'Watch weekly'}</button>${s.watch ? `<span class="note">Next run ${ago(s.watch.next)}. Only new ${M.noun} will be flagged.</span>` : `<span class="note">Re-runs this search every week and flags only new ${M.noun}.</span>`}${s.watchId ? `<span class="pill2 done">${(s.fresh || []).length} new since last run</span>` : ''}</div>
    <div class="row"><button class="ghost sm" id="ps-sig" ${s.signalsRunning ? 'disabled' : ''}>${s.signalsRunning ? 'Reading data sources…' : 'Refresh data signals'}</button><span class="note">${s.signalsRunning ? 'About a minute for every 4 results. Results update as each one finishes.' : `Re-reads domain records, saved copies of websites, news, job boards, federal contracts and client pages for every result. ${lastSig(s)}`}</span></div>
    ${s.status === 'failed' ? `<p class="callout err">The search stopped: ${esc(s.error)} Nothing was made up to fill the gap. <span class="link" id="ps-retry">Try again</span></p>` : ''}
    ${s.status === 'partial' || qFail ? `<p class="callout warn">${qFail} of ${q.length} searches didn’t complete, so coverage is partial. Results below come only from the searches that ran.</p>` : ''}
    <details class="more2 hwf" ${P.editing ? 'open' : ''}><summary>How this search worked · ${qDone} web searches · ${s.rawCount} pages · ${scored.length} checked in depth · ${mins}</summary>
    ${how(`${(s.queries || []).length} searches → ${s.rawCount} pages → ${s.funnel?.extracted ?? 0} names → top ${scored.length} checked against your must-haves, then timing from data sources. Fit = does it match. Timing = is now the moment.`)}
    <div class="psm">${metrics.map(([a, b]) => `<div><b>${esc(b)}</b><small>${a}</small></div>`).join('')}</div>
    ${P.editing ? editBox(s) : strategyBox(s, M, true)}</details>
    ${scored.length ? verdict(scored, s, M) : ''}
    ${scored.length ? `<div class="psbar"><div class="seg">${[['all', 'All'], ['saved', 'Saved'], ['rejected', 'Rejected']].map(([k, l]) => `<button data-filter="${k}" class="${P.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="spacer"></div><span class="note">Sort</span><div class="seg">${[['score', M.score], ['timing', 'Timing'], ...(s.mode === 'target' ? [['intent', 'Deal intent']] : []), ['paths', 'Search paths']].map(([k, l]) => `<button data-sort="${k}" class="${P.sort === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="pscards">${list.map((e, i) => card(e, i, s, M)).join('') || '<p class="note">Nothing in this view.</p>'}</div>`
      : s.status !== 'failed' ? `<div class="psempty"><b>No credible ${M.noun} found.</b><p>The searches ran, but no named ${M.one} could be confirmed from the sources. Try a wider location, adjacent titles or industries, or fewer must-haves.</p></div>` : ''}
    <details class="more2"><summary>Every step this search took (${(s.log || []).length})</summary><ul class="loglist">${(s.log || []).map(x => `<li>${esc(x.text)}<span>${x.t.toFixed(0)}s</span></li>`).join('')}</ul></details>
    ${rest.length ? `${s.status !== 'running' ? `<p><button class="ghost sm" id="ps-more" data-testid="ps-more">Check ${Math.min(12, rest.length)} more in depth</button> <span class="note">same criteria, timing signals and emails from their own sites · about 5 minutes</span></p>` : ''}<details class="more2"><summary>${rest.length} more ${M.noun} found but not checked in depth</summary><ul class="found">${rest.map(e => `<li>${esc(cand ? e.name : e.company)}${cand && (e.title || e.employer) ? ` <span class="note">${esc([e.title, e.employer].filter(Boolean).join(' · '))}</span>` : ''} <span class="note">· ${e.paths} search path${e.paths === 1 ? '' : 's'} · ${(e.evidence || []).slice(0, 2).map(x => `<a href="${safeUrl(x.url)}" target="_blank" rel="noopener">${esc(host(x.url))}</a>`).join(', ')}</span></li>`).join('')}</ul></details>` : ''}
  </div>${P.open ? detail(s, all.find(e => e.id === P.open), M) : ''}`;
  wire(s);
}
// timing ("Why now"): inferred from public clues, shown separately from the fit score
const TB = { act: 't-act', warm: 't-warm', early: 't-early', none: 't-none' };
const LV = { high: ['Strong signs', 't-act'], some: ['Some signs', 't-warm'], low: ['Weak signs', 't-early'] };
function ichips(I) { if (!I || I.sale.level === 'none') return ''; return ` <span class="tbadge ${LV[I.sale.level][1]}" title="Public signs the owner may sell">${LV[I.sale.level][0]} of a sale</span>`; }
function tbadge(e) { return (P.data?.mode === 'target' && e.timing?.intent ? ichips(e.timing.intent) : '') + (e.timing && e.timing.badge !== 'none' ? ` <span class="tbadge ${TB[e.timing.badge]}" title="Timing, from public clues; does not change the fit score">${e.timing.label}</span>` : ''); }
function whyNowPanel(e, s) {
  if (!e.timing) return '';
  const T = e.timing, what = { target: 'the owner may sell or partner', client: 'they will need outside retail or marketplace help', candidate: 'they may be open to a move' }[s.mode];
  const li = x => `<li class="${x.direction}"><b>${esc(x.label)}</b> <span class="srctag">${x.source === 'radar' || x.source === 'intent' ? 'data source' : 'web search'}</span>${x.direction === 'against' ? ' <span class="tagx">reason to wait</span>' : ''} ${esc(x.text)}${x.date ? ` <span class="note">· ${esc(x.date)}</span>` : ''} <span class="note">· inferred, ${x.confidence}</span> <a href="${safeUrl(x.url)}" target="_blank" rel="noopener">source</a></li>`;
  if (s.mode === 'target' && T.intent) { const I = T.intent, asked = T.signals.filter(x => x.direction === 'for' && asksForPartner(x.text));
    const sale = T.signals.filter(x => x.direction === 'for' && x.path !== 'partner'), wait = T.signals.filter(x => x.direction === 'against');
    return `<div class="dsec"><small>Why now · signs the owner may sell</small>
      <p>${I.sale.level !== 'none' ? `<span class="tbadge ${LV[I.sale.level][1]}">${LV[I.sale.level][0]}</span>` : '<span class="note">No signs yet</span>'}</p>
      ${sale.length ? `<ul class="tsig">${sale.map(li).join('')}</ul>` : ''}
      ${asked.length ? `<p><b>They asked for a partner</b></p><ul class="tsig">${asked.map(li).join('')}</ul>` : ''}
      ${wait.length ? `<p><b>Reasons to wait</b></p><ul class="tsig">${wait.map(li).join('')}</ul>` : ''}
      <p class="note">Each sign is read from a public source and linked; none is confirmed until you talk to the owner. AION offers to buy the firm${asked.length ? ', and here offers a partnership because they asked for one' : ''}.</p></div>`; }
  return `<div class="dsec"><small>Why now · timing, not just fit</small>
    ${T.signals.length ? `<p>${tbadge(e)} <span class="note">Clues that ${what} soon. Every hunch has a source. These are inferred, not confirmed, and never change the fit score.</span></p>
    <ul class="tsig">${T.signals.map(li).join('')}</ul>
    <p class="note">Act now = a likely for-sale listing, or 3+ clues with at least one from the last 3 months and no recent reason to wait. Clues fade: last 3 months count fully, last year 60%, older 30%.</p>`
    : `<p class="note">No timing signals yet. ${e.score >= 60 ? 'Fit is strong; watch this search weekly and it will flag when that changes.' : 'Nothing in public sources suggests a change soon.'}</p>`}</div>`;
}
function badge(e, M) { const c = e.score >= 75 ? 'hi' : e.score >= 55 ? 'mid' : 'lo'; return `<div class="sbadge ${c}"><b>${e.score}%</b><span>${M.score}</span><em>${e.confidence} confidence</em></div>`; }
function card(e, i, s, M) {
  const cand = s.mode === 'candidate', dec = e.decision;
  const ev = (e.verifiedFacts || []).slice(0, 2), sig = (e.signalsVerified || []).slice(0, 2);
  return `<article class="pscard ${dec || ''}">
    <div class="pc1"><div><span class="rank">${i + 1}</span><h3>${esc(cand ? e.name : e.company)}</h3>${tbadge(e)}${e.isNew ? ' <span class="pill2 done">New</span>' : ''}${e.warm ? ` <span class="pill2 warmb">${e.warm.you ? 'In your contacts' : `You know ${e.warm.count} ${e.warm.count === 1 ? 'person' : 'people'} here`}</span>` : ''}${e.known ? ` <span class="pill2" title="First seen ${ago(e.known.firstSeen)}">Seen in ${e.known.searches} earlier search${e.known.searches === 1 ? '' : 'es'}${e.known.decisions.some(d => d === 'saved' || d === 'priority') ? ' · saved before' : ''}</span>` : ''}
      <p class="sub2">${esc(cand ? [short(e.title), short(e.employer)].filter(Boolean).join(' · ') : [short(e.industry), short(e.size)].filter(Boolean).join(' · '))}${e.location ? ` · ${esc(short(loc(e.location)))}` : ''}</p></div>${badge(e, M)}</div>
    <p class="why">${esc(e.summary)}</p>
    ${e.timing?.whyNow ? `<p class="whynow"><b>Why now:</b> ${esc(e.timing.whyNow)} <span class="note">Inferred from public clues, not confirmed.</span></p>` : ''}
    ${cand ? (ev.length ? `<ul class="evl">${ev.map(f => `<li>${esc(f.text)} <a href="${safeUrl(f.url)}" target="_blank" rel="noopener">${esc(host(f.url))}</a></li>`).join('')}</ul>` : '')
      : `${s.mode === 'target' ? `<p class="ppl">${[ownLabel(e), short(e.founded) && `founded ${esc(short(e.founded))}`].filter(Boolean).join(' · ')}</p>` : ''}${sig.length ? `<div class="lab">${s.mode === 'target' ? 'Why it fits' : 'Signs they’re hiring'}</div><ul class="evl">${sig.map(f => `<li>${esc(f.text)} <a href="${safeUrl(f.url)}" target="_blank" rel="noopener">${esc(host(f.url))}</a></li>`).join('')}</ul>` : ''}${(e.contacts || []).length ? `<div class="lab">${s.mode === 'target' ? 'Owner and leaders' : 'People to approach'}</div><p class="ppl">${e.contacts.slice(0, 3).map(c => `${esc(c.name)} <span class="note">${esc(c.title)}</span>`).join(' · ')}</p>` : ''}`}
    ${facts2(e, s)}
    ${e.concern ? `<p class="concern">⚠ ${esc(e.concern)}</p>` : ''}
    ${failLine(e)}
    ${s.mode === 'target' ? stageSel(e) : ''}
    <div class="pcf"><span class="paths">Found through <b>${e.paths}</b> search path${e.paths === 1 ? '' : 's'} · ${(e.evidence || []).length + (e.fetchedPages || []).length} source${(e.evidence || []).length + (e.fetchedPages || []).length === 1 ? '' : 's'}${(e.contactInfo || []).length ? ` · <b>${e.contactInfo.length}</b> verified contact${e.contactInfo.length === 1 ? '' : 's'}` : ''}</span><div class="spacer"></div>
      <button class="ghost sm" data-detail="${e.id}">Details</button>
      ${[['saved', 'Save'], ['priority', cand ? 'Strong candidate' : s.mode === 'target' ? 'Priority target' : 'Priority account'], ...(cand ? [['weak', 'Weak fit']] : []), ['rejected', 'Reject']].map(([k, l]) => `<button class="ghost sm dec ${dec === k ? 'on' : ''}" data-dec="${k}" data-e="${e.id}">${dec === k ? '✓ ' : ''}${l}</button>`).join('')}</div>
  </article>`;
}
function detail(s, e, M) {
  if (!e) return '';
  const cand = s.mode === 'candidate', qOf = new Set((e.evidence || []).flatMap(x => x.queries));
  const contacts = e.contactInfo || [];
  const kinds = { email: 'Verified email', phone: 'Verified phone', main_line: 'Company main line', contact_page: 'Company contact page', profile: 'Public profile', address: 'Office address' };
  return `<div class="scrim" id="ps-scrim"><div class="drawer psd" role="dialog">
    <div class="row"><span class="note">${M.label}</span><div class="spacer"></div><button class="ghost" id="ps-close">Close</button></div>
    <div class="pc1"><div><h3 class="dh">${esc(cand ? e.name : e.company)}</h3><p class="sub2">${esc(cand ? [e.title, e.employer].filter(Boolean).join(' · ') : [e.industry, e.size].filter(Boolean).join(' · '))}${e.location ? ` · ${esc(e.location)}` : ''}${!cand && e.website ? ` · <a href="${safeUrl(/^http/.test(e.website) ? e.website : 'https://' + e.website)}" target="_blank" rel="noopener">${esc(host(/^http/.test(e.website) ? e.website : 'https://' + e.website))}</a>` : ''}</p></div>${badge(e, M)}</div>
    <div class="dsec"><small>Why this ${M.one}</small><p>${esc(e.summary)}</p>${e.angle ? `<p><b>Angle:</b> ${esc(e.angle)}</p>` : ''}${e.concern ? `<p class="concern">⚠ ${esc(e.concern)}</p>` : ''}${e.identity != null && e.identity < 0.7 ? `<p class="concern">Identity not fully confirmed across sources (${Math.round(e.identity * 100)}% sure it’s the same ${M.one}).</p>` : ''}</div>
    ${failLine(e)}
    ${whyNowPanel(e, s)}
    ${signalsPanel(e)}
    ${s.mode === 'target' ? clientBookPanel(e) : ''}
    ${s.mode === 'target' ? `<div class="dsec"><small>Deal stage</small>${stageSel(e)}${(e.deal?.history || []).length ? `<ul class="dhist">${e.deal.history.slice().reverse().map(h => `<li><b>${esc(stageName(h.stage))}</b> <span class="note">${ago(h.at)}</span></li>`).join('')}</ul>` : '<p class="note">Not contacted yet. Set the stage as the deal moves; each change is dated.</p>'}</div>` : ''}
    <div class="dsec match">${s.mode === 'target' ? '<span class="note">Save it, then run it through Value Creation once you have its books.</span>' : cand ? `<button class="ghost sm" data-match="client">Find companies hiring for this kind of role</button>` : (e.openRoles || []).filter(r => !/^no /i.test(r)).slice(0, 2).map((r, i) => `<button class="ghost sm" data-match="candidate" data-role="${i}">Find candidates for: ${esc(r.split(/[(,]/)[0].trim().slice(0, 50))}</button>`).join('') || '<span class="note">No open role found to source candidates for.</span>'}${s.mode === 'target' ? '' : '<span class="note">Starts a new search using what this result tells us.</span>'}</div>
    <div class="dsec"><small>Criteria · how the ${M.score.toLowerCase()} score is worked out</small><table class="crt">${(e.breakdown || []).map(r => `<tr><td>${esc(r.label)} <span class="note">${'●'.repeat(r.weight)}</span>${r.must ? ' <span class="musttag">must-have</span>' : ''}</td><td><span class="st ${ST[r.status][1]}">${ST[r.status][0]}</span></td><td class="note">${esc(r.note || (r.status === 'no_evidence' ? 'Not found in public sources reviewed.' : ''))}${r.url ? ` <a href="${safeUrl(r.url)}" target="_blank" rel="noopener">source</a>` : ''}</td></tr>`).join('')}</table>
      <p class="note">Strong = 1, partial = 0.6, no evidence = 0.3, mismatch = 0, weighted by importance (●). Missing evidence lowers confidence; it isn’t counted as a mismatch. A clear mismatch on a must-have caps the score at 40%.</p></div>
    ${cand ? `<div class="dsec"><small>Career evidence</small><p class="note">Career facts confirmed on a public page, each with its source.</p>${(e.verifiedFacts || []).length ? `<ul class="evl">${e.verifiedFacts.map(f => `<li>${esc(f.text)} <a href="${safeUrl(f.url)}" target="_blank" rel="noopener">${esc(host(f.url))}</a></li>`).join('')}</ul>` : '<p class="note">No verified career facts beyond the search results.</p>'}${(e.priorEmployers || []).length ? `<p class="note">Prior employers mentioned: ${e.priorEmployers.map(esc).join(', ')}</p>` : ''}</div>`
      : s.mode === 'target' ? `<div class="dsec"><small>Ownership and history</small><p>${esc(e.ownership || 'Ownership not found in public sources reviewed.')}${e.founded ? ` · Founded ${esc(e.founded)}` : ''}${e.size ? ` · ${esc(e.size)}` : ''}</p></div><div class="dsec"><small>Why it could be a good acquisition</small><p class="note">Facts from the firm’s own pages and public sources that fit what AION buys. Each links to where it was found.</p>${(e.signalsVerified || []).length ? `<ul class="evl">${e.signalsVerified.map(f => `<li>${esc(f.text)} <a href="${safeUrl(f.url)}" target="_blank" rel="noopener">${esc(host(f.url))}</a></li>`).join('')}</ul>` : '<p class="note">No verified signals found.</p>'}</div><div class="dsec"><small>Owner and leaders found</small><p class="note">People named on a public page as owning or running the firm. Who to write to first.</p>${(e.contacts || []).length ? `<ul class="evl">${e.contacts.map(c => `<li><b>${esc(c.name)}</b>, ${esc(c.title)} <a href="${safeUrl(c.url)}" target="_blank" rel="noopener">${esc(host(c.url))}</a></li>`).join('')}</ul>` : '<p class="note">No owner confirmed in public sources.</p>'}</div>`
      : `<div class="dsec"><small>Hiring and growth signals</small><p class="note">Public signs that this company is hiring or growing, each with its source.</p>${(e.signalsVerified || []).length ? `<ul class="evl">${e.signalsVerified.map(f => `<li>${esc(f.text)} <a href="${safeUrl(f.url)}" target="_blank" rel="noopener">${esc(host(f.url))}</a></li>`).join('')}</ul>` : '<p class="note">No verified signals found.</p>'}${(e.openRoles || []).length ? `<p><b>Relevant openings:</b> ${e.openRoles.map(esc).join(', ')}</p>` : ''}</div>
      <div class="dsec"><small>Potential buyers found</small><p class="note">People named on a public page who likely decide on hiring help. Who to approach first.</p>${(e.contacts || []).length ? `<ul class="evl">${e.contacts.map(c => `<li><b>${esc(c.name)}</b>, ${esc(c.title)} <a href="${safeUrl(c.url)}" target="_blank" rel="noopener">${esc(host(c.url))}</a></li>`).join('')}</ul>` : '<p class="note">No decision makers confirmed in public sources.</p>'}</div>`}
    <div class="dsec"><small>Contact details</small><p class="note">Shown only when the email, phone or address appears word for word on a public page. Nothing is guessed.</p>${contacts.length ? `<ul class="evl">${contacts.map(c => `<li><b>${c.person === 'Company' || !c.person ? ({ email: 'Company email', phone: 'Company phone' }[c.kind] || kinds[c.kind] || c.kind) : (kinds[c.kind] || c.kind)}:</b> ${/^http/.test(c.value) ? `<a href="${safeUrl(c.value)}" target="_blank" rel="noopener">${esc(host(c.value))}</a>` : esc(c.value)}${c.person && c.person !== 'Company' ? ` <span class="note">(${esc(c.person)})</span>` : ''} <a href="${safeUrl(c.url)}" target="_blank" rel="noopener">source</a></li>`).join('')}</ul>` : `<p class="note">${e.score >= 60 ? 'No public contact information found.' : 'Contact details are only looked up for strong matches.'}</p>`}</div>
    <div class="dsec"><small>Discovery paths · found by ${e.paths} search${e.paths === 1 ? '' : 'es'}</small><p class="note">The searches that turned this up. Found by more of them usually means a stronger lead.</p><ul class="qlist">${[...qOf].map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>
    <div class="dsec"><small>Sources</small><p class="note">Every page used for this result: search results, and pages opened to check them.</p><ul class="evl">${[...(e.evidence || []).map(x => ({ url: x.url, t: x.title })), ...(e.fetchedPages || []).map(u => ({ url: u, t: 'Page opened during verification' }))].map(x => `<li><a href="${safeUrl(x.url)}" target="_blank" rel="noopener">${esc(x.t || host(x.url))}</a> <span class="note">${esc(host(x.url))}</span></li>`).join('')}</ul></div>
    <div class="dsec"><small>Notes</small><p class="note">Your own notes. Saved when you click away; only you see them.</p><textarea id="ps-note" rows="3" placeholder="Your notes">${esc(e.note || '')}</textarea></div>
  </div></div>`;
}
function editBox(s) {
  return `<div class="pstrat"><b>Edit searches</b><p class="note">One search per line. Add, remove or reword, then rerun. The same criteria are used to score.</p>
    <textarea id="ps-q" rows="12">${esc((s.queries || []).map(q => q.q).join('\n'))}</textarea>
    <div class="row"><button id="ps-rerun">Rerun with these searches</button><button class="ghost" id="ps-cancel">Cancel</button><span class="note" id="ps-e2"></span></div></div>`;
}
function wire(s) {
  $('#ps-back').onclick = back;
  P.main.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { P.filter = b.dataset.filter; renderResults(P.data, MODES[P.data.mode]); });
  P.main.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { P.sort = b.dataset.sort; renderResults(P.data, MODES[P.data.mode]); });
  P.main.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => { P.open = b.dataset.detail; renderResults(P.data, MODES[P.data.mode]); });
  P.main.querySelectorAll('[data-dec]').forEach(b => b.onclick = async () => { const e = P.data.entities.find(x => x.id === b.dataset.e), d = e.decision === b.dataset.dec ? null : b.dataset.dec; await api('search/decide', { id: P.data.id, entity: e.id, decision: d }); e.decision = d; renderResults(P.data, MODES[P.data.mode]); });
  P.main.querySelectorAll('[data-stage]').forEach(x => x.onchange = async () => { const e = P.data.entities.find(y => y.id === x.dataset.stage); try { const r = await api('search/stage', { id: P.data.id, entity: e.id, stage: x.value || null }); e.deal = r.deal; renderResults(P.data, MODES[P.data.mode]); } catch (err) { toast(err.message, 'err'); } });
  if ($('#ps-more')) $('#ps-more').onclick = async ev => { ev.target.disabled = true; try { const r = await api('search/more', { id: P.data.id, n: 12 }); toast(`Checking ${r.checking} more. This page updates as each one finishes.`); drawSearch(); } catch (e) { ev.target.disabled = false; toast(e.message, 'err'); } };
  if ($('#ps-sig')) $('#ps-sig').onclick = async () => { try { await api('search/signals', { id: P.data.id }); drawSearch(); } catch (e) { toast(e.message, 'err'); } };
  if ($('#ps-retry')) $('#ps-retry').onclick = async () => { try { const { id } = await api('search/start', { mode: s.mode, objective: s.objective, filters: s.filters }); P.id = id; draw(); } catch (e) { toast(e.message, 'err'); } };
  if ($('#ps-edit')) $('#ps-edit').onclick = () => { P.editing = true; renderResults(P.data, MODES[P.data.mode]); };
  if ($('#ps-cancel')) $('#ps-cancel').onclick = () => { P.editing = false; renderResults(P.data, MODES[P.data.mode]); };
  if ($('#ps-rerun')) $('#ps-rerun').onclick = async () => { const qs = $('#ps-q').value.split('\n').map(x => x.trim()).filter(Boolean); try { const { id } = await api('search/start', { mode: s.mode, objective: s.objective, filters: s.filters, from: s.id, queries: qs }); P.editing = false; P.id = id; draw(); } catch (e) { $('#ps-e2').textContent = e.message; } };
  const close = () => { P.open = null; renderResults(P.data, MODES[P.data.mode]); };
  if ($('#ps-watch')) $('#ps-watch').onclick = () => busy($('#ps-watch'), 'Saving…', async () => { try { await api('search/watch', { id: P.data.watchId || P.data.id, on: !P.data.watch }); drawSearch(); } catch (e) { toast(e.message, 'err'); } });
  P.main.querySelectorAll('[data-open-search]').forEach(x => x.onclick = () => { P.id = x.dataset.openSearch; P.open = null; draw(); });
  P.main.querySelectorAll('[data-match]').forEach(b => b.onclick = async () => {
    const e = P.data.entities.find(x => x.id === P.open), cand = P.data.mode === 'candidate', place = short(loc(e.location));
    const objective = cand ? `Find companies${place ? ` in or near ${place}` : ''} that are hiring for a ${short(e.title) || 'similar'} role or a close equivalent, in industries like ${short(e.employer) || 'this one'}, and may need an outside recruiter.`
      : `Find candidates for the ${(e.openRoles || [])[+b.dataset.role].split(/[(,]/)[0].trim()} role at ${e.company}${place ? ` in ${place}` : ''}. Look for people now in the same or a similar role at comparable companies in the region.`;
    try { const { id } = await api('search/start', { mode: cand ? 'client' : 'candidate', objective, filters: { count: 10 }, link: { search: P.data.id, entity: e.id, label: cand ? e.name : e.company } }); P.open = null; P.id = id; draw(); } catch (err) { toast(err.message, 'err'); }
  });
  if ($('#ps-close')) { $('#ps-close').onclick = close; $('#ps-scrim').onclick = ev => { if (ev.target.id === 'ps-scrim') close(); }; }
  document.onkeydown = ev => { if (ev.key === 'Escape' && P.open && $('#ps-close')) close(); };
  if ($('#ps-note')) $('#ps-note').onchange = async ev => { const e = P.data.entities.find(x => x.id === P.open); e.note = ev.target.value; await api('search/decide', { id: P.data.id, entity: e.id, note: e.note }); };
}

async function drawNetwork() {
  let N = { people: [], companies: [] }; try { N = await api('search/network'); } catch {}
  P.netMode ??= 'target'; P.netQ ??= '';
  const cand = P.netMode === 'candidate', q = P.netQ.toLowerCase();
  const tg = P.netMode === 'target', rows = (cand ? N.people : tg ? (N.targets || []) : N.companies).filter(r => !q || JSON.stringify([r.name, r.titles, r.employers, r.industries, r.locations]).toLowerCase().includes(q));
  P.main.innerHTML = `<div class="ps"><div class="row"><button class="ghost sm" id="ps-back">← Proprietary Search</button></div>
    <div class="pshead"><h1>Your network</h1>${how('everyone any search has found, one record each, with scores, your decisions and sources. It grows with every search.')}</div>
    <div class="psbar"><div class="seg"><button data-nm="target" class="${tg ? 'on' : ''}">Firms to buy (${(N.targets || []).length})</button><button data-nm="client" class="${P.netMode === 'client' ? 'on' : ''}">Brands and clients (${N.companies.length})</button><button data-nm="candidate" class="${cand ? 'on' : ''}">People (${N.people.length})</button></div><div class="spacer"></div><input id="ps-nq" placeholder="Filter by name, title, employer, place" value="${esc(P.netQ)}"></div>
    ${rows.length ? `<div class="tblw"><table class="hist"><tr><th>${cand ? 'Person' : 'Company'}</th><th>${cand ? 'Title · employer' : 'Industry'}</th><th>Location</th><th class="num">Searches</th><th class="num">Best score</th><th>Your decision</th><th class="num">Sources</th><th>Last seen</th></tr>
      ${rows.slice(0, 300).map(r => { const h = r.hits[r.hits.length - 1]; return `<tr data-nopen="${h.search}" data-nent="${h.entity}"><td><b>${esc(r.name)}</b></td><td>${esc(cand ? [short(r.titles[0]), short(r.employers[0])].filter(Boolean).join(' · ') : short(r.industries[0]))}</td><td>${esc(short(loc(r.locations[0])))}</td><td class="num">${r.searches}</td><td class="num">${r.best ? r.best + '%' : '—'}</td><td>${r.deal?.stage ? `<span class="pill2 stage-${r.deal.stage}">${esc(stageName(r.deal.stage))}</span> ` : ''}${r.saved ? '<span class="pill2 done">Saved</span>' : r.rejected ? '<span class="pill2">Rejected</span>' : ''}</td><td class="num">${r.sources.length}</td><td class="nowrap">${day(r.lastSeen)}</td></tr>`; }).join('')}</table></div>` : `<p class="note">Nothing here yet. Run a search and its results are added here automatically.</p>`}</div>`;
  $('#ps-back').onclick = () => { P.view = 'home'; draw(); };
  P.main.querySelectorAll('[data-nm]').forEach(b => b.onclick = () => { P.netMode = b.dataset.nm; drawNetwork(); });
  const inp = $('#ps-nq'); inp.oninput = () => { P.netQ = inp.value; clearTimeout(P.nt); P.nt = setTimeout(() => { drawNetwork().then(() => { const i2 = $('#ps-nq'); i2.focus(); i2.setSelectionRange(i2.value.length, i2.value.length); }); }, 250); };
  P.main.querySelectorAll('[data-nopen]').forEach(r => r.onclick = () => { P.view = 'search'; P.id = r.dataset.nopen; P.open = r.dataset.nent; draw(); });
}

// one honest line on how good the best results are, and the most common reason the rest fell short
function verdict(scored, s, M) {
  // a clear miss is a real shortfall; a fact no firm publishes (fees, cash collection) is a question for the first call, not a miss
  const best = Math.max(...scored.map(e => e.score)), strong = scored.filter(e => e.score >= 70).length, miss = {}, unknown = {};
  for (const e of scored) for (const r of e.breakdown || []) if (r.weight >= 2) { if (r.status === 'mismatch') miss[r.label] = (miss[r.label] || 0) + 1; else if (r.status === 'no_evidence') unknown[r.label] = (unknown[r.label] || 0) + 1; }
  const top = Object.entries(miss).sort((a, b) => b[1] - a[1])[0], ask = Object.entries(unknown).sort((a, b) => b[1] - a[1])[0];
  const lab = t => { const v = String(t).split(/[(:]/)[0].trim(); return esc(/^[A-Z][a-z]/.test(v) ? v[0].toLowerCase() + v.slice(1) : v); };
  const head = strong ? `<b>${strong} strong ${strong === 1 ? M.one : M.noun}</b> (70% or more)` : `<b>No ${M.one} scored 70% or more yet</b> (best ${best}%)`;
  const act = scored.filter(e => e.timing?.badge === 'act').length, fails = scored.filter(e => (e.failed || []).length).length;
  return `<p class="verdict ${strong ? 'good' : 'weak'}">${head} out of ${scored.length} checked in depth.${act ? ` <b>${act} marked Act now</b> by timing clues.` : ''}${top && top[1] >= 3 ? ` Most common miss: ${lab(top[0])} (${top[1]} of ${scored.length}).` : ''}${fails ? ` ${fails} fail${fails === 1 ? 's' : ''} a must-have and ${fails === 1 ? 'is' : 'are'} capped at 40%.` : ''}${ask && ask[1] >= scored.length / 2 ? ` Not public for most firms, so ask on the first call: ${lab(ask[0])}.` : ''}${!strong && !(ask && ask[1] >= scored.length / 2) ? ' Try a wider area or looser size, or edit the searches and rerun.' : ''}</p>`;
}

// ownership is stated as fact only when the ownership criterion is a strong, sourced match
function ownLabel(e) {
  const o = short(e.ownership), c = (e.breakdown || []).find(r => /own/i.test(r.label) && r.key !== 'likely_available_to_buy');
  const sure = c?.status === 'strong' && !/infer|unconfirm|not confirm|appear|likely|aggregator|unclear/i.test(e.ownership || '');
  if (!o) return 'Ownership not confirmed';
  return sure ? `<b>${esc(cap1(o))}</b>` : `<b>${esc(cap1(o))}?</b> <span class="note">(not confirmed)</span>`;
}

// extra evidence from the new methods: public records, succession, repeated postings, leadership changes, warm contacts
function facts2(e, s) {
  const out = [];
  if (s.mode === 'target') {
    if (e.registry) out.push(`<li>Public record: ${esc(e.registry.incorporated ? 'incorporated ' + e.registry.incorporated : 'registered')}${e.registry.status ? ' · ' + esc(e.registry.status) : ''} <a href="${safeUrl(e.registry.url)}" target="_blank" rel="noopener">${esc(host(e.registry.url))}</a></li>`);
    if (e.founderLeads === 'yes') out.push('<li>Founder still runs it</li>');
    if (e.successorNamed === 'no') out.push('<li>No successor named in public sources</li>');
  }
  if (s.mode === 'client') {
    for (const r of (e.repostedRoles || []).slice(0, 2)) out.push(`<li>Posted repeatedly: ${esc(r.role)} <a href="${safeUrl(r.url)}" target="_blank" rel="noopener">${esc(host(r.url))}</a></li>`);
    for (const c of (e.leadershipChanges || []).slice(0, 1)) out.push(`<li>Leadership change: ${esc(c.text)} <a href="${safeUrl(c.url)}" target="_blank" rel="noopener">${esc(host(c.url))}</a></li>`);
  }
  if (e.warm) out.push(`<li>${e.warm.you ? 'You’re connected' : 'You know'}: ${e.warm.people.slice(0, 3).map(p => esc(p.name) + (p.title ? ` <span class="note">${esc(p.title)}</span>` : '')).join(', ')}</li>`);
  return out.length ? `<ul class="evl f2">${out.join('')}</ul>` : '';
}

// must-haves: a clear mismatch on size, niche, payment model or likelihood caps the score, and says why
function failLine(e) { return (e.failed || []).length ? `<p class="failx">Fails a must-have: ${e.failed.map(l => esc(l.split(/[(:]/)[0].trim())).join('; ')}. Score capped at 40%.</p>` : ''; }

// deal pipeline: stages are set by you, never inferred
const DEAL = [['contacted', 'Contacted'], ['met', 'Meeting held'], ['nda', 'Confidentiality signed (NDA)'], ['books', 'Books received'], ['loi', 'Offer sent (LOI)'], ['diligence', 'LOI signed · diligence'], ['closed', 'Closed'], ['passed', 'Passed']];
const stageName = k => (DEAL.find(d => d[0] === k) || [k, 'Not contacted'])[1];
function stageSel(e) { const v = e.deal?.stage || ''; return `<label class="stagesel"><span>Deal stage</span><select data-stage="${e.id}"><option value="">Not contacted</option>${DEAL.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${v ? ` <span class="note">since ${day(e.deal.history[e.deal.history.length - 1].at)}</span>` : ''}</label>`; }
function pipelinePanel(PL) {
  const D = PL.deals || [], n = k => D.filter(d => d.stage === k).length, active = D.filter(d => !['closed', 'passed'].includes(d.stage));
  return `<div class="pipe"><div class="srch"><b>Deal pipeline</b><span class="note">${active.length} active ${active.length === 1 ? 'target' : 'targets'}</span></div>
    <ol class="pipes">${DEAL.filter(([k]) => k !== 'passed').map(([k, l]) => `<li class="${n(k) ? 'on' : ''}"><b>${n(k)}</b><span>${l}</span></li>`).join('')}</ol>
    ${D.length ? `<div class="tblw"><table class="hist"><tr><th>Target</th><th class="m-hide">Location</th><th>Stage</th><th class="m-hide">Since</th><th class="num m-hide">Fit</th></tr>${D.map(d => `<tr ${d.search ? `data-open="${d.search}" data-ent="${d.entity}"` : ''}><td><b>${esc(d.name)}</b></td><td class="m-hide">${esc(short(loc(d.location)))}</td><td><span class="pill2 stage-${d.stage}">${esc(stageName(d.stage))}</span></td><td class="m-hide nowrap">${day(d.since)}</td><td class="num m-hide">${d.best ? d.best + '%' : '—'}</td></tr>`).join('')}</table></div>` : ''}
    <p class="howline"><b>How this works:</b> set each firm’s stage from its card. Every change is dated.${D.length ? '' : ' No firm has been contacted through AION yet.'}</p></div>`;
}

// ---------- radar: data read directly from sources, not web search ----------
const SRCNOTE = 'domain registration records, saved copies of websites (Internet Archive), Google News headlines, company job boards, federal contract awards and firms’ own client pages';
function lastSig(s) { const at = (s.entities || []).map(e => e.radarAt).filter(Boolean).sort().pop(); return at ? `Last read ${ago(at)}.` : 'Not read yet for this search.'; }
function signalsPanel(e) {
  if (!e.radarAt) return `<div class="dsec"><small>Signals from data sources</small><p class="note">Not read yet. Use “Refresh data signals” above the results to read ${SRCNOTE} for every result.</p></div>`;
  const R = e.radar || [];
  return `<div class="dsec"><small>Signals from data sources · read ${ago(e.radarAt)}</small>
    ${R.length ? `<ul class="tsig">${R.map(x => `<li class="${x.direction}"><b>${esc(x.sourceName || x.source)}</b>${x.direction === 'against' ? ' <span class="tagx">reason to wait</span>' : ''} ${esc(x.text)}${x.date ? ` <span class="note">· ${esc(x.date)}</span>` : ''} <a href="${safeUrl(x.url)}" target="_blank" rel="noopener">source</a></li>`).join('')}</ul>` : '<p class="note">Nothing found in the sources checked. That is a real result, not a gap: no headline, website change or job posting pointed to a change.</p>'}
    <p class="note">Checked: ${esc((e.radarRan || []).join(', ') || '—')}. These are read straight from each source, not found by web search. They set the timing badge, never the fit score.</p></div>`;
}
const WHAT = { funding: 'Raised money', retail_launch: 'New retailer', new_leader: 'New sales or ecommerce lead', marketplace_launch: 'New marketplace', lost_retailer: 'Lost a retailer or distributor' };
function radarPanel(RD) {
  const sc = (RD.scans || [])[0], ev = (RD.events || []).filter(x => x.mode !== 'candidate').slice(0, 8);
  return `<div class="pipe radar"><div class="srch"><b>Brand demand radar</b><span class="note">consumer brands likely to need a retail broker, marketplace agency or ecommerce consultant soon: the clients the firms we buy serve</span></div>
    <div class="row rscan"><input id="rd-region" placeholder="United States, or a state or region" value="${esc(P.rdRegion || sc?.region || 'United States')}"><select id="rd-days">${[[30, 'last 30 days'], [60, 'last 60 days'], [120, 'last 4 months']].map(([v, l]) => `<option value="${v}" ${(+P.rdDays || 60) === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button id="rd-go" ${RD.scanning ? 'disabled' : ''}>${RD.scanning ? 'Scanning…' : 'Scan announcements'}</button></div>
    ${RD.scanning ? `<p class="nowline"><span class="pulse"></span>Reading brand news for ${esc(RD.scanning.region)}. About a minute.</p>` : ''}
    ${sc ? `<p class="note">Last scan: ${esc(sc.region)} · ${ago(sc.at)} · ${sc.headlines} headlines read · <b>${sc.items.length}</b> brands with a sign they will need help</p>
      ${sc.items.length ? `<div class="tblw"><table class="hist"><tr><th>Company</th><th>What happened</th><th class="m-hide">Date</th><th></th></tr>${sc.items.slice(0, P.rdAll ? 25 : 5).map((x, i) => `<tr><td><b>${esc(x.company)}</b>${x.place ? `<br><span class="note">${esc(x.place)}</span>` : ''}</td><td><span class="pill2">${esc(WHAT[x.what] || 'Sign of demand')}</span> ${esc(x.summary)} <a href="${safeUrl(x.url)}" target="_blank" rel="noopener">source</a></td><td class="m-hide nowrap">${esc(x.date)}</td><td class="nowrap"><span class="link" data-rdlook="${i}">look into it</span></td></tr>`).join('')}</table></div>` : '<p class="note">No company in these headlines showed a sign of coming demand. Try a wider region or a longer period.</p>'}` : ''}
    ${sc?.contracts?.length ? `<p class="note"><b>Federal contract surges in ${esc(sc.region)}</b> · mid-sized companies whose federal awards for making or moving goods jumped in the last 6 months. Some are IT suppliers coded as manufacturing; check before you call.</p>
      <div class="tblw"><table class="hist"><tr><th>Company</th><th>Federal awards</th><th></th></tr>${sc.contracts.slice(0, P.rdAll ? 15 : 5).map((x, i) => `<tr><td><b>${esc(titleCo(x.name))}</b></td><td>${esc(x.text)}${x.url ? ` <a href="${safeUrl(x.url)}" target="_blank" rel="noopener">source</a>` : ''}</td><td class="nowrap"><span class="link" data-rdfed="${i}">look into it</span></td></tr>`).join('')}</table></div>` : ''}
    ${sc && (sc.items.length > 5 || (sc.contracts || []).length > 5) ? `<p><span class="link" id="rd-all">${P.rdAll ? 'Show the top 5' : `Show all ${sc.items.length + (sc.contracts || []).length}`}</span></p>` : ''}
    ${ev.length ? `<details class="more2"><summary>What changed recently across your results (${ev.length})</summary><ul class="tsig">${ev.map(x => `<li class="${x.direction}"><b>${esc(x.name)}</b> · ${esc(x.sourceName)}: ${esc(x.text)} <span class="note">· found ${day(x.firstSeen)}</span> <a href="${safeUrl(x.url)}" target="_blank" rel="noopener">source</a></li>`).join('')}</ul></details>` : ''}
    <p class="howline"><b>How this works:</b> a brand that raises money, wins a new retailer, hires a sales or ecommerce lead or opens a marketplace store usually hires outside retail or marketplace help within 6–12 months. Read from news headlines; every row links its source. Use it to show an owner the demand AION can bring, or to find clients after we buy.</p></div>`;
}
function wireRadar(RD) {
  const go = $('#rd-go'); if (!go) return;
  if ($('#rd-all')) $('#rd-all').onclick = () => { P.rdAll = !P.rdAll; draw(); };
  go.onclick = async () => { P.rdRegion = $('#rd-region').value.trim(); P.rdDays = $('#rd-days').value; try { await api('radar/scan', { region: P.rdRegion, days: +P.rdDays }); draw(); } catch (e) { toast(e.message, 'err'); } };
  if (RD.scanning) { clearTimeout(P.timer); P.timer = setTimeout(() => { if (P.view === 'home') draw(); }, 4000); }
  P.main.querySelectorAll('[data-rdfed]').forEach(l => l.onclick = async () => { const x = RD.scans[0].contracts[+l.dataset.rdfed];
    const objective = `Find out whether ${x.name} in ${RD.scans[0].region} is likely to need senior operations, plant, program or supply-chain leaders soon (federal contract awards: ${x.text}), and who makes hiring decisions there.`;
    try { const { id } = await api('search/start', { mode: 'client', objective, filters: { count: 6 } }); P.view = 'search'; P.id = id; P.data = null; draw(); } catch (e) { toast(e.message, 'err'); } });
  P.main.querySelectorAll('[data-rdlook]').forEach(l => l.onclick = async () => { const x = RD.scans[0].items[+l.dataset.rdlook];
    const objective = `Find out whether the consumer brand ${x.company}${x.place ? ` (${x.place})` : ''} is likely to need outside help getting into retailers or growing on Amazon, Walmart.com or other marketplaces soon (news: ${x.summary}), and who decides (founder, CEO, VP sales, head of ecommerce).`;
    try { const { id } = await api('search/start', { mode: 'client', objective, filters: { count: 6, subsector: 'ecommerce' } }); P.view = 'search'; P.id = id; P.data = null; draw(); } catch (e) { toast(e.message, 'err'); } });
}

// placement trail: the clients a search firm names on its own pages, a view of its client book before the first call
function clientBookPanel(e) {
  const B = e.clientBook;
  if (!B) return '';
  return `<div class="dsec"><small>Client book · from the firm’s own pages</small>
    ${B.clients?.length ? `<p class="note">${B.clients.length} client${B.clients.length === 1 ? '' : 's'} named on ${B.pages} page${B.pages === 1 ? '' : 's'} of its website. Who it serves, and how well those clients match AION’s, before you ever call. Names must appear word for word on the page.</p><ul class="evl">${B.clients.map(c => `<li><b>${esc(c.company)}</b>${c.roles?.length ? ` <span class="note">${esc([...new Set(c.roles)].slice(0, 2).join('; '))}</span>` : ''} <a href="${safeUrl(c.url)}" target="_blank" rel="noopener">source</a></li>`).join('')}</ul>`
      : `<p class="note">${B.pages ? `Read ${B.pages} client or placement page${B.pages === 1 ? '' : 's'}; no client is named by name.` : 'No client, placement or case-study page found on its website.'} Many firms keep clients private, so ask on the first call.</p>`}</div>`;
}

// owner ranking across every search: who to talk to first. Every firm gets a buyout offer; a partnership only when the
// firm itself says it wants a partner or investor.
const APPR = { full: ['Full buyout', 't-act'], majority: ['Majority stake', 't-act'], sale: ['Full buyout', 't-act'], both: ['Full buyout', 't-act'], watch: ['Full buyout', 't-act'], partner: ['Partnership', 't-early'] };
const APPR_WHY = { full: 'Full buyout: AION buys the whole firm, planned as a succession on the owner’s timeline. The default offer.', majority: 'Majority stake: AION buys most of the firm; the owner keeps a share and keeps running it. Used when the owner is clearly still building (a #2 hired, new services).', partner: 'Partnership: the firm says in its own words that it wants a growth partner or investor.' };
const SIZE_NOTE = 'Rough guess from the number of people: about $150K–$250K of sales per person and 15–25% profit, typical for small consulting firms. Only for sorting; their books give the real number.';
const money = v => v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M` : `$${Math.round(v / 1e3)}K`;
const SEGS = [['retail_placement', 'Retail placement'], ['marketplace', 'Marketplace'], ['strategy', 'Strategy & analytics']];
const OPH = { writing: 'Writing drafts', review: 'Draft ready for your OK', failed: 'Draft failed', waiting: 'Sent · waiting', replied: 'Replied', conversation: 'In conversation', finished: 'Finished' };
const offerOf = x => x.offer === 'partner' || x.offer === 'majority' ? x.offer : 'full';
function intentPanel(IN) {
  const C = IN.counts || {}, f = ['all', 'new', 'full', 'majority', 'partner'].includes(P.inF) ? P.inF : 'all', scope = P.inScope && (P.inScope === 'box' || SEGS.some(([k]) => k === P.inScope)) ? P.inScope : 'box';
  const inScope = x => x.niche && (scope === 'box' || x.segment === scope);
  const ALL = (IN.list || []).filter(x => x.niche), confirmed = ALL.filter(x => x.box?.status === 'in').length;
  const test = (x, k) => k === 'all' ? true : k === 'new' ? !x.outreach : offerOf(x) === k;
  const L = ALL.filter(x => inScope(x) && test(x, f)), n = P.inAll ? L.length : 15, sc = IN.scanning;
  const cnt = k => ALL.filter(x => inScope(x) && test(x, k)).length;
  const reach = x => [x.owner ? `Owner: ${x.owner}` : 'Owner not named yet', x.email ? x.email : x.emails ? 'email on file' : x.website ? 'email: read from their site' : '', x.warmIntro ? 'warm intro' : ''].filter(Boolean).join(' · ');
  // two different signs, never the same kind twice; growth signs only count for a firm that asked for a partner
  const why = x => { const seen = new Set(); return x.signals.filter(y => y.direction === 'for' && (x.offer === 'partner' || y.path !== 'partner') && !seen.has(y.key) && seen.add(y.key)).slice(0, 2); };
  const outCell = x => x.outreach ? `<span class="pill2 ${['replied', 'conversation'].includes(x.outreach.phase) ? 'done' : ''}">${esc(OPH[x.outreach.phase] || x.outreach.status || 'In outreach')}</span>${x.outreach.sender ? `<div class="note">✉ ${esc(x.outreach.sender.split('@')[0])}${x.outreach.to ? ` → ${esc(x.outreach.to)}` : ''}</div>` : ''}<div><span class="link" data-outopen="${esc(x.outreach.id)}" data-stop>Open</span></div>`
    : x.box?.status !== 'out' ? `<button class="sm" data-outwrite="${esc(x.search)}|${esc(x.entity)}" data-stop>Write outreach</button>` : '<span class="note">—</span>';
  const filters = [['all', 'All'], ['new', 'Not contacted'], ['full', 'Full buyout'], ['majority', 'Majority stake'], ['partner', 'Partnership']].filter(([k]) => k !== 'partner' || cnt('partner'));
  return `<div class="pipe intent">
      <p class="note">${ALL.length} firms to buy. <b>${confirmed} confirmed</b> as US, owner-run and about 5–150 people come first; the rest show what to ask on the first call.</p>
      <div class="psbar"><div class="seg">${[['box', `All segments · ${ALL.length}`], ...SEGS.map(([k, l]) => [k, `${l} · ${C.segments?.[k] ?? ALL.filter(x => x.segment === k).length}`])].map(([k, l]) => `<button data-insc="${k}" class="${scope === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="spacer"></div>
      <button class="ghost" id="in-scan" ${sc ? 'disabled' : ''} title="Read every firm’s website and headlines again for new signs">${sc ? `Reading ${sc.done} of ${sc.total || '…'}` : 'Refresh signs'}</button></div>
      <div class="psbar"><div class="seg">${filters.map(([k, l]) => `<button data-inf="${k}" class="${f === k ? 'on' : ''}">${l} · ${cnt(k)}</button>`).join('')}</div></div>
      ${L.length ? `<div class="tblw"><table class="hist intent"><tr><th class="num">#</th><th>Firm</th><th>Why now</th><th>Offer</th><th>Outreach</th><th class="num" title="0–100. Higher = talk to them sooner: signs the owner may sell, how well the firm fits the buy box, and whether we can reach the owner">Score</th></tr>${L.slice(0, n).map(x => `<tr data-open="${x.search}" data-ent="${x.entity}"><td class="num">${x.nicheRank || '—'}</td><td><b>${esc(x.name)}</b>${x.deal ? ` <span class="pill2">${esc(x.deal)}</span>` : ''}<br>${x.segmentLabel ? `<span class="pill2 seg-${esc(x.segment)}">${esc(x.segmentLabel)}</span> ` : ''}${x.box?.status === 'in' ? '<span class="pill2 done" title="US, owner-run and the right size">Confirmed</span>' : `<span class="pill2" title="Ask on the first call">Ask: ${esc((x.box?.reasons || []).join(', ').toLowerCase())}</span>`}<br><span class="note">${esc([short2(x.industry), x.place].filter(Boolean).join(' · '))}</span><br><span class="note">${esc(reach(x))}</span>${x.size ? `<br><span class="note" title="${esc(SIZE_NOTE)}">≈ ${x.size.people} people · rough profit ${money(x.size.ebitda[0])}–${money(x.size.ebitda[1])} a year</span>` : ''}</td><td>${why(x).map(y => `<div class="isig"><b>${esc(y.label)}</b> ${esc(y.text.length > 110 ? y.text.slice(0, 110).replace(/\s+\S*$/, '') + '…' : y.text)} <a href="${safeUrl(y.url)}" target="_blank" rel="noopener" data-stop>source</a></div>`).join('') || '<span class="note">No signs yet</span>'}</td><td><span class="tbadge ${APPR[offerOf(x)][1]}" title="${esc(APPR_WHY[offerOf(x)])}">${APPR[offerOf(x)][0]}</span>${(x.offerWhy || []).length ? `<div class="note">${esc(x.offerWhy.join(', ').toLowerCase())}</div>` : ''}</td><td>${outCell(x)}</td><td class="num"><b>${x.rankScore}</b></td></tr>`).join('')}</table></div>
        ${L.length > 15 ? `<p><span class="link" id="in-all">${P.inAll ? 'Show the top 15' : `Show all ${L.length}`}</span></p>` : ''}`
      : `<p class="note">${ALL.length ? 'No firms in this view. Pick another segment or filter.' : 'Run a “Find firms to buy” search below; each firm shows up here.'}</p>`}
      ${(IN.outside || []).length ? `<details class="inout"><summary>${IN.outside.length} firm${IN.outside.length === 1 ? '' : 's'} set aside (outside the buy box)</summary><ul>${IN.outside.filter(x => scope === 'box' || x.segmentLabel === (SEGS.find(([k]) => k === scope) || [])[1]).map(x => `<li><span class="link" data-open="${x.search}" data-ent="${x.entity}">${esc(x.name)}</span> <span class="note">${esc(x.why)}</span></li>`).join('')}</ul><p class="note">Save a firm from its page to bring it back.</p></details>` : ''}
      <p class="howline"><b>How this works:</b> AION buys US ecommerce consulting firms that are owner-run, about 5–150 people. Every firm gets a buyout offer: a <b>full buyout</b> by default, or a <b>majority stake</b> when the owner is clearly still building. A <b>partnership</b> is offered only when the firm says it wants one. AION writes to owners directly; firms already listed for sale are left out.${IN.lastScan ? ` Signs last refreshed ${ago(IN.lastScan)}.` : ''}</p></div>`;
}
const short2 = t => { t = String(t || ''); return t.length > 70 ? t.slice(0, 70).replace(/\s+\S*$/, '') + '…' : t; };
function wireIntent(IN) {
  P.main.querySelectorAll('[data-inf]').forEach(b => b.onclick = () => { P.inF = b.dataset.inf; P.inAll = false; draw(); });
  P.main.querySelectorAll('[data-insc]').forEach(b => b.onclick = () => { P.inScope = b.dataset.insc; P.inAll = false; draw(); });
  if ($('#in-all')) $('#in-all').onclick = () => { P.inAll = !P.inAll; draw(); };
  P.main.querySelectorAll('[data-stop]').forEach(a => a.onclick = ev => ev.stopPropagation());
  P.main.querySelectorAll('[data-outopen]').forEach(a => a.onclick = ev => { ev.stopPropagation(); try { localStorage.setItem('aion.outOpen', a.dataset.outopen); } catch {} window.dispatchEvent(new Event('aion:outopen')); });
  P.main.querySelectorAll('[data-outwrite]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); const [search, entity] = b.dataset.outwrite.split('|'); b.disabled = true; b.textContent = 'Writing…';
    try { const r = await api('outreach/create', { search, entity }); try { localStorage.setItem('aion.outOpen', r.id); } catch {} window.dispatchEvent(new Event('aion:outopen')); } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = 'Write outreach'; } });
  if ($('#in-scan')) $('#in-scan').onclick = async () => { try { await api('search/intent-scan', {}); toast('Reading every firm’s site and headlines. A few minutes; this list updates as it goes.'); draw(); } catch (e) { toast(e.message, 'err'); } };
  if (IN.scanning) { clearTimeout(P.timer); P.timer = setTimeout(() => { if (P.view === 'home') draw(); }, 5000); }
}

