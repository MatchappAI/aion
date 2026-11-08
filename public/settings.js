// Settings: which AI does the work. Claude Code first; Codex or an API key as backups when a plan hits its limit.
import { toast, busy } from './ui.js';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (p, b) => { const r = await fetch('/api/' + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; };

const HOW = {
  'claude-code': 'Uses your Claude plan. Install Claude Code and log in once in a terminal (run “claude”).',
  codex: 'Uses your ChatGPT plan. Install Codex and run “codex login” once. AION opens every link Codex reports and keeps only pages that load.',
  anthropic: 'Billed to your Anthropic account, per use. Create a key at console.anthropic.com → API keys.',
  openai: 'Billed to your OpenAI account, per use. Create a key at platform.openai.com → API keys.',
};
let S = { main: null, eng: null, msg: {} };
export function mountSettings(main) { S.main = main; draw(); }
export const leaveSettings = () => {};

async function draw() {
  try { [S.eng, S.fd] = await Promise.all([api('engine'), api('finders')]); } catch (e) { S.main.innerHTML = `<p class="callout err">${esc(e.message)}</p>`; return; }
  const E = S.eng, act = E.active, choice = E.settings.engine;
  S.main.innerHTML = `<div class="ps settings">
    <h2 class="h2">AI <span class="h2s">the first ready option is used; if it hits its usage limit, the next one takes over</span></h2>
    ${!act ? '<p class="callout warn">No AI is ready. Log in to Claude Code or Codex in a terminal, or save an API key below.</p>' : ''}
    <div class="engines">${E.list.map(x => `<div class="eng ${x.ready ? 'ready' : ''} ${act === x.id ? 'active' : ''}">
      <div class="row"><b>${esc(x.label)}</b>${act === x.id ? '<span class="pill2 done">In use</span>' : x.ready ? '<span class="pill2">Ready</span>' : ''}<div class="spacer"></div>
        ${x.ready ? `<button class="ghost sm" data-test="${x.id}">Test</button>` : ''}${x.ready && act !== x.id ? `<button class="sm" data-use="${x.id}">Use this</button>` : ''}</div>
      <p class="note">${esc(x.detail)} · ${esc(x.billing)}</p>${E.limits?.[x.id] ? `<p class="callout warn">Hit its usage limit, so the next ready AI is used for now: ${esc(E.limits[x.id].message)}</p>` : ''}<p class="note">${esc(HOW[x.id])}</p>
      ${x.kind === 'api' ? `<div class="row"><input type="password" autocomplete="off" spellcheck="false" id="key-${x.id}" aria-label="${x.id === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key" placeholder="${x.id === 'anthropic' ? 'sk-ant-…' : 'sk-…'}"><button class="sm" data-key="${x.id}">Save key</button>${x.ready ? `<button class="ghost sm" data-rmkey="${x.id}">Remove</button>` : ''}</div>` : ''}
      <p class="note" id="msg-${x.id}">${esc(S.msg[x.id] || '')}</p></div>`).join('')}</div>
    <p class="note">${choice === 'auto' ? 'Automatic: the first ready option above is used.' : `Pinned to ${esc(E.list.find(x => x.id === choice)?.label || choice)}. <span class="link" id="eng-auto">Go back to automatic</span>`} Keys stay on this computer (workspace/keys.json, readable only by your user) and are sent only to the company that issued them.</p>
    <h2 class="h2">Finding owners’ emails <span class="h2s">free</span></h2>
    <div class="eng ${S.fd?.hunter ? 'ready' : ''}"><div class="row"><b>Hunter.io</b>${S.fd?.hunter ? '<span class="pill2 done">Connected</span>' : ''}</div>
      <p class="note">AION first reads each firm’s own website. When it shows only a shared inbox (info@), Hunter.io finds the owner’s own address. The free plan gives 25 lookups and 50 checks a month, no card: sign up at hunter.io, then copy your key from API in your account.</p>
      <div class="row"><input type="password" autocomplete="off" spellcheck="false" id="key-hunter" aria-label="Hunter.io API key" placeholder="Hunter.io API key"><button class="sm" id="save-hunter">Save key</button>${S.fd?.hunter ? '<button class="ghost sm" id="rm-hunter">Remove</button>' : ''}</div>
      <p class="note" id="msg-hunter">${esc(S.msg.hunter || '')}</p></div>
  </div>`;
  wire();
}

function wire() {
  const msg = (id, t) => { S.msg[id] = t; const el = $('#msg-' + id); if (el) el.textContent = t; };
  S.main.querySelectorAll('[data-use]').forEach(b => b.onclick = async () => { try { await api('engine/choose', { engine: b.dataset.use }); toast('Now using ' + (S.eng.list.find(x => x.id === b.dataset.use)?.label || 'that AI') + '.'); draw(); } catch (e) { msg(b.dataset.use, e.message); } });
  if ($('#eng-auto')) $('#eng-auto').onclick = async () => { try { await api('engine/choose', { engine: 'auto' }); draw(); } catch (e) { toast(e.message, 'err'); } };
  S.main.querySelectorAll('[data-test]').forEach(b => b.onclick = () => busy(b, 'Testing…', async () => {
    const id = b.dataset.test; msg(id, 'Testing… (a tiny request, a few seconds)');
    try { const r = await api('engine/test', { engine: id }); msg(id, r.ok ? `Works · answered in ${(r.ms / 1000).toFixed(1)}s${r.model ? ` · model ${r.model}` : ''}` : `Did not work: ${r.error || 'unexpected reply'}`); } catch (e) { msg(id, 'Did not work: ' + e.message); }
  }));
  S.main.querySelectorAll('[data-key]').forEach(b => b.onclick = async () => {
    const id = b.dataset.key, v = $('#key-' + id).value.trim(); if (!v) return msg(id, 'Paste a key first.');
    if (!(id === 'anthropic' ? /^sk-ant-/ : /^sk-/).test(v)) return msg(id, `That doesn’t look like ${id === 'anthropic' ? 'an Anthropic key (it starts with sk-ant-)' : 'an OpenAI key (it starts with sk-)'}.`);
    await busy(b, 'Saving…', async () => { try { await api('engine/key', { which: id, key: v }); S.msg[id] = 'Key saved. Press Test to check it.'; draw(); } catch (e) { msg(id, e.message); } });
  });
  if ($('#save-hunter')) $('#save-hunter').onclick = () => busy($('#save-hunter'), 'Checking…', async () => { const v = $('#key-hunter').value.trim(); if (!v) return msg('hunter', 'Paste your Hunter.io key first.'); try { const r = await api('finders/key', { key: v }); S.msg.hunter = `Key saved and checked${r.left != null ? `: ${r.left} lookups left this month` : ''}.`; draw(); } catch (e) { msg('hunter', e.message); } });
  if ($('#rm-hunter')) $('#rm-hunter').onclick = async () => { try { await api('finders/key', { key: '' }); S.msg.hunter = 'Key removed.'; draw(); } catch (e) { msg('hunter', e.message); } };
  S.main.querySelectorAll('[data-rmkey]').forEach(b => b.onclick = async () => { if (!confirm('Remove this key from this computer?')) return; try { await api('engine/key', { which: b.dataset.rmkey, key: '' }); S.msg[b.dataset.rmkey] = 'Key removed.'; draw(); } catch (e) { toast(e.message, 'err'); } });
}
