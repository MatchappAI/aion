// Documents: answer an RFP or agency brief (ecommerce consulting by default) and write up a candidate for a hire. Same pattern already proven
// at Entro (proposals) and MGT (reports). Firm-profile fields follow the firm's subsector from the thesis module.
import { SUBSECTORS, firmFields } from '/thesis.mjs';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (p, b) => { const r = await fetch('/api/' + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; };
const ago = d => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dur = s => s == null ? '' : s < 60 ? `${s} seconds` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
const how = t => `<p class="howline"><b>How this works:</b> ${t}</p>`;
const b64 = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = bad; r.readAsDataURL(f); });
// [[needs input: ...]] markers stand out so nothing unfinished is sent by mistake
const mark = h => h.replace(/\[\[needs input:?([^\]]*)\]\]/g, (m, x) => `<mark class="need">needs input${x.trim() ? ': ' + x.trim() : ''}</mark>`);
// drafts may contain simple tables written as | a | b | rows; show them as real tables
const body = t => { const out = [], lines = String(t || '').split('\n'); let tbl = [];
  const flush = () => { if (!tbl.length) return; const rows = tbl.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => c.trim()));
    out.push(`<table class="mdt">${rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${mark(esc(c))}</td>` : `<th>${mark(esc(c))}</th>`).join('')}</tr>`).join('')}</table>`); tbl = []; };
  for (const l of lines) { if (/^\s*\|.*\|\s*$/.test(l)) { tbl.push(l); continue; } flush(); out.push(mark(esc(l)) + '<br>'); }
  flush(); return out.join('').replace(/(<br>)+$/, ''); };

let D = { main: null, view: 'home', mode: 'proposal', id: null, timer: null, err: '' };
export function mountDocs(main) { D.main = main; draw(); }
export function leaveDocs() { clearTimeout(D.timer); D.timer = null; }

async function draw() {
  clearTimeout(D.timer);
  if (D.view === 'doc' && D.id) return drawDoc();
  let L = { docs: [], firm: {} }, C = { candidates: [] };
  try { [L, C] = await Promise.all([api('docs/list'), api('docs/candidates')]); } catch {}
  const F = L.firm || {}; D.sub ??= F.subsector ?? 'ecommerce'; const FF = firmFields(D.sub), filled = FF.filter(([k]) => F[k]).length;
  D.main.innerHTML = `<div class="ps">
    <div class="pshead"><h1>Documents</h1><p class="lede2">Two jobs that eat account-team time, done in minutes: answering a brand’s or retailer’s RFP or agency brief, and writing up a candidate for a hire at a firm you own. A person reviews everything before it is sent.</p></div>
    <div class="psmodes">${[['proposal', 'Answer an RFP', 'A brand’s agency RFP or brief: every requirement pulled out, then the response drafted'], ['writeup', 'Write up a candidate', 'For a hire at a firm you own: a summary with evidence for each must-have']].map(([k, l, s]) => `<button data-dm="${k}" class="${D.mode === k ? 'on' : ''}"><b>${l}</b><span>${s}</span></button>`).join('')}</div>
    <div class="psform">${D.mode === 'proposal' ? `
      <label class="dlab">The RFP</label>
      <div class="row dsrc"><button class="ghost" id="dc-pick">Choose a PDF</button><input type="file" id="dc-file" accept=".pdf,.txt,.html" hidden><span class="note" id="dc-fname">or paste a link</span><input id="dc-url" placeholder="https://… link to the RFP (PDF or web page)"></div>
      <div class="row"><button id="dc-go">Draft the response</button><span class="note" id="dc-err">${esc(D.err) || 'About 2–3 minutes for a 30-page RFP.'}</span></div>`
    : `
      <label class="dlab">The job order</label>
      <div class="row dsrc"><input id="dc-joburl" placeholder="Link to the posting (Workday and most job pages work)"></div>
      <textarea id="dc-jobtext" rows="3" placeholder="…or paste the job order"></textarea>
      <label class="dlab">The candidate</label>
      <select id="dc-cand"><option value="">Choose someone from your searches…</option>${C.candidates.map(c => `<option value="${c.search}|${c.entity}">${esc(c.name)} · ${esc(c.title)}${c.employer ? `, ${esc(c.employer)}` : ''}</option>`).join('')}</select>
      <textarea id="dc-candtext" rows="3" placeholder="…or paste their résumé or interview notes"></textarea>
      <div class="row"><button id="dc-go">Write it up</button><span class="note" id="dc-err">${esc(D.err) || 'About 30–60 seconds.'}</span></div>`}
    </div>
    ${how(D.mode === 'proposal' ? 'every requirement, deadline and scoring rule is quoted word for word with its page, then each section is drafted. Firm facts come only from your profile; gaps are marked “needs input”, never invented.' : 'each job requirement is matched to a word-for-word quote from the candidate’s materials. No quote means unknown, and becomes a question to ask.')}
    <details class="more2" ${filled < 3 && D.mode === 'proposal' ? 'open' : ''}><summary>Your firm’s facts · ${filled ? `${filled} of ${FF.length} filled` : 'not filled yet'}</summary>
      <p class="note">${filled < 3 ? '<b>Fill these once and every proposal needs far fewer inputs.</b> ' : ''}Used in every proposal. Leave anything you don’t want stated blank; it appears as “needs input” instead. Licenses and certifications are only ever stated if you list them here.</p>
      <label class="dlab">Kind of firm</label><select id="dc-sub">${(() => { const E = Object.entries(SUBSECTORS), opt = ([k, v]) => `<option value="${k}" ${D.sub === k ? 'selected' : ''}>${esc(v.label)}</option>`; return `${E.filter(([, v]) => !v.legacy).map(opt).join('')}<option value="" ${D.sub === '' ? 'selected' : ''}>Other services firm</option><optgroup label="Earlier thesis">${E.filter(([, v]) => v.legacy).map(opt).join('')}</optgroup>`; })()}</select>
      <div class="ffacts">${FF.map(([k, l]) => `<label><span>${l}</span><textarea data-ff="${k}" rows="${k === 'name' ? 1 : 2}">${esc(F[k] || '')}</textarea></label>`).join('')}</div>
      <div class="row"><button class="ghost" id="dc-save">Save facts</button><span class="note" id="dc-saved"></span></div></details>
    <h2 class="h2">Your documents</h2>
    ${L.docs.length ? `<div class="tblw"><table class="hist"><tr><th>Document</th><th class="m-hide">Type</th><th class="m-hide">Date</th><th>Time</th></tr>${L.docs.map(d => `<tr data-doc="${d.id}"><td>${esc(d.title)}${d.status !== 'done' ? ` <span class="pill2 ${d.status}">${d.status === 'running' ? 'Drafting' : 'Failed'}</span>` : ''}</td><td class="m-hide">${d.kind === 'proposal' ? 'RFP response' : 'Candidate write-up'}</td><td class="m-hide nowrap">${ago(d.created)}</td><td class="nowrap">${dur(d.seconds)}</td></tr>`).join('')}</table></div>` : '<p class="note">Nothing yet. Your documents are saved here.</p>'}
  </div>`;
  D.main.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => { D.mode = b.dataset.dm; D.err = ''; draw(); });
  D.main.querySelectorAll('[data-doc]').forEach(r => r.onclick = () => { D.view = 'doc'; D.id = r.dataset.doc; draw(); });
  if ($('#dc-pick')) { $('#dc-pick').onclick = () => $('#dc-file').click(); $('#dc-file').onchange = () => { const f = $('#dc-file').files[0]; if (f) $('#dc-fname').textContent = f.name; }; }
  $('#dc-sub').onchange = () => { D.sub = $('#dc-sub').value; draw(); };
  $('#dc-save').onclick = async () => { const firm = { ...F, subsector: D.sub }; D.main.querySelectorAll('[data-ff]').forEach(t => firm[t.dataset.ff] = t.value.trim()); await api('docs/firm', { firm }); $('#dc-saved').textContent = 'Saved. Used in the next draft.'; };
  $('#dc-go').onclick = async () => {
    const go = $('#dc-go'); go.disabled = true; $('#dc-err').textContent = 'Reading…';
    try {
      let r;
      if (D.mode === 'proposal') { const f = $('#dc-file')?.files[0]; r = await api('docs/proposal', f ? { filename: f.name, data: await b64(f) } : { url: $('#dc-url').value.trim() }); }
      else { const [search, entity] = ($('#dc-cand').value || '|').split('|'); r = await api('docs/writeup', { job: { url: $('#dc-joburl').value.trim(), text: $('#dc-jobtext').value }, cand: search ? { search, entity } : { text: $('#dc-candtext').value } }); }
      D.err = ''; D.view = 'doc'; D.id = r.id; draw();
    } catch (e) { go.disabled = false; $('#dc-err').textContent = e.message; }
  };
}

async function drawDoc() {
  let d; try { d = await api('docs/get/' + D.id); } catch (e) { D.main.innerHTML = `<div class="ps"><p class="callout err">${esc(e.message)}</p></div>`; return; }
  const back = `<div class="row noprint"><button class="ghost sm" id="dc-back">← All documents</button>${d.status === 'done' ? `<div class="spacer"></div><button class="ghost sm" id="dc-copy">Copy text</button><button class="ghost sm" id="dc-print">Print or save as PDF</button>` : ''}</div>`;
  if (d.status === 'running' || d.running) {
    D.main.innerHTML = `<div class="ps">${back}<h1 class="psobj">${d.kind === 'proposal' ? 'Answering the RFP' : 'Writing up the candidate'}</h1><p class="nowline"><span class="pulse"></span><b>${esc(d.stage || 'Working')}</b> · ${d.kind === 'proposal' ? 'about 2–3 minutes' : 'about 30–60 seconds'}</p><ul class="feed">${(d.log || []).map(l => `<li>${esc(l.text)}</li>`).join('')}</ul></div>`;
    $('#dc-back').onclick = () => { D.view = 'home'; draw(); }; D.timer = setTimeout(drawDoc, 2500); return;
  }
  if (d.status === 'failed') { D.main.innerHTML = `<div class="ps">${back}<p class="callout err">It stopped: ${esc(d.error)} Nothing was made up to fill the gap.</p></div>`; $('#dc-back').onclick = () => { D.view = 'home'; draw(); }; return; }
  D.main.innerHTML = `<div class="ps doc">${back}${d.kind === 'proposal' ? proposalView(d) : writeupView(d)}</div>`;
  $('#dc-back').onclick = () => { D.view = 'home'; draw(); };
  $('#dc-print').onclick = () => window.print();
  $('#dc-copy').onclick = async () => { const t = D.main.querySelector('.dtext')?.innerText || ''; try { await navigator.clipboard.writeText(t); $('#dc-copy').textContent = 'Copied ✓'; } catch { $('#dc-copy').textContent = 'Select and copy'; } };
}

function proposalView(d) {
  const C = d.check || {}, open = d.requirements.filter(r => !r.covered);
  return `<h1 class="psobj">${esc(d.title)}</h1>
    <p class="quiet">${esc(d.issuer)}${d.due ? ` · <b>Due:</b> ${esc(d.due)}` : ''}</p>
    <p class="verdict good"><b>Drafted in ${dur(d.seconds)}.</b> ${C.kept} requirements quoted word for word${d.requirements.some(r => r.page) ? ' with their page' : ''}; ${C.uncovered ? `<b>${C.uncovered} not yet answered</b>; ` : 'all answered; '}<b>${C.gaps} facts for you to fill in</b>.${C.dropped ? ` ${C.dropped} quotes were dropped because they did not match the RFP exactly.` : ''} A typical RFP response takes about 33 hours (Loopio 2026).</p>
    ${d.risks?.length ? `<div class="callout warn"><b>Check before you send</b><ul>${d.risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${d.summary ? `<p class="lede2">${esc(d.summary)}</p>` : ''}
    ${d.evaluation?.length ? `<h2 class="h2">How it will be scored</h2><div class="tblw"><table class="hist"><tr><th>Criterion</th><th class="num">Weight</th><th class="m-hide">Page</th></tr>${d.evaluation.map(e => `<tr><td>${esc(e.criterion)}<div class="note">“${esc(e.quote)}”</div></td><td class="num">${esc(e.weight)}</td><td class="m-hide">${e.page ? 'p. ' + e.page : ''}</td></tr>`).join('')}</table></div>` : ''}
    <h2 class="h2">The draft <span class="h2s">${d.sections.length} sections, in the order the RFP asks; highlighted text needs your input</span></h2>
    <div class="dtext">${d.sections.map(s => `<section class="dsect"><h3>${esc(s.heading)}</h3><p>${body(s.body)}</p></section>`).join('')}</div>
    <h2 class="h2">Every requirement <span class="h2s">quoted word for word, and where the draft answers it</span></h2>
    <div class="tblw"><table class="hist"><tr><th>#</th><th>Requirement</th><th class="m-hide">Page</th><th>Answered in</th></tr>${d.requirements.map(r => `<tr><td class="note">${esc(r.id)}</td><td>“${esc(r.quote)}”</td><td class="m-hide nowrap">${r.page ? 'p. ' + r.page : ''}</td><td>${r.covered ? esc(d.sections.filter(s => s.covers.includes(r.id)).map(s => s.heading.split(/[.:]/)[0]).slice(0, 2).join(', ')) : '<span class="pill2 failed">Not yet</span>'}</td></tr>`).join('')}</table></div>
    ${d.questions?.length ? `<h2 class="h2">Questions to send the issuer</h2><ul class="found">${d.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
    <p class="note">Source: ${esc(d.sourceName)}</p>`;
}
const ST = { strong: ['Strong', 't-act'], partial: ['Partial', 't-warm'], gap: ['Gap', 't-early'], unknown: ['Unknown', 't-unk'] };
function writeupView(d) {
  const C = d.check || {};
  return `<h1 class="psobj">${esc(d.candidate)} <span class="h2s">for ${esc(d.role)}</span></h1>
    <p class="verdict good"><b>Written in ${dur(d.seconds)}.</b> ${C.musts} requirements from the job order; <b>${C.evidenced}</b> backed by a word-for-word quote from the candidate’s materials. The rest are marked unknown and turned into questions.</p>
    <div class="dtext"><p class="lede2"><b>${esc(d.headline)}</b></p><p>${esc(d.summary)}</p></div>
    <h2 class="h2">Fit against the job order</h2>
    <div class="tblw"><table class="hist"><tr><th>Requirement (from the job order)</th><th>Fit</th><th>Evidence (from the candidate)</th></tr>${d.fit.map(f => `<tr><td>“${esc(f.must)}”</td><td><span class="tbadge ${ST[f.status]?.[1] || 't-unk'}">${ST[f.status]?.[0] || f.status}</span></td><td>${f.evidence ? `“${esc(f.evidence)}”` : '<span class="note">Not in the materials</span>'}</td></tr>`).join('')}</table></div>
    ${d.concerns?.length ? `<h2 class="h2">Concerns</h2><ul class="found">${d.concerns.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
    ${d.questions?.length ? `<h2 class="h2">Ask before presenting</h2><ul class="found">${d.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
    <p class="note">Job order: ${esc(d.jobName)} · Candidate: ${esc(d.candName)}</p>`;
}
