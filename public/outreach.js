import { toast } from './ui.js';
const PITCH = { sale: 'Pitch: ownership', partner: 'Pitch: partnership', both: 'Pitch: their choice' };
const PITCH_LONG = { sale: 'Pitch: long-term ownership', partner: 'Pitch: growth partnership, no investment', both: 'Pitch: partnership or sale, their choice' };
// Outreach: write to the firms (and people) your searches found, personally and only from what AION knows about
// them. You edit every message, pick the sender, and approve each send. Replies, calls, the NDA, the books and the
// LOI all happen from here, and the results show what's working.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = v => { const u = String(v ?? '').trim(); return /^(https?:\/\/|mailto:|tel:)/i.test(u) ? esc(u) : '#'; };
const api = async (p, b) => { const r = await fetch('/api/' + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`); return j; };
const day = d => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const when = d => d ? new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const how = t => `<p class="howline"><b>How this works:</b> ${t}</p>`;
const KINDS = [['email', 'First email'], ['followup1', 'Follow-up 1'], ['followup2', 'Follow-up 2'], ['letter', 'Letter'], ['call', 'Call notes'], ['form', 'Contact form'], ['answer', 'Your reply']];
const MODE = { target: 'Firm to buy', client: 'Client', candidate: 'Candidate' };
const RKIND = { interested: 'interested', later: 'not now', reply: 'replied', optout: 'no thanks' };
let O = { main: null, view: 'board', id: null, kind: 'email', timer: null, st: null, it: null, pick: new Set(), queue: null, allSig: false, slots: null };

export function mountOutreach(main) { O.main = main; draw(); }
export function leaveOutreach() { clearTimeout(O.timer); O.timer = null; }

async function draw() {
  clearTimeout(O.timer);
  if (O.view === 'item' && O.id) return drawItem();
  let R = null;
  try { [O.st, R] = await Promise.all([api('outreach/state'), api('outreach/results')]); } catch (e) { O.main.innerHTML = `<div class="ps"><p class="empty">${esc(e.message)}</p></div>`; return; }
  const S = O.st, B = S.board;
  const needs = B.filter(x => x.phase === 'replied' || x.phase === 'review' || x.next?.overdue || x.phase === 'failed' || x.call?.past);
  const waiting = B.filter(x => (x.phase === 'waiting' || x.phase === 'conversation') && !x.next?.overdue && !x.call?.past);
  const writing = B.filter(x => x.phase === 'writing');
  const done = B.filter(x => x.phase === 'finished');
  const reviews = B.filter(x => x.phase === 'review');
  const senders = S.settings.senders.map(e => ({ email: e, acc: S.accounts.find(a => a.email === e) })).concat(S.accounts.filter(a => !S.settings.senders.includes(a.email)).map(a => ({ email: a.email, acc: a })));
  const setupGaps = [!S.accounts.some(a => !a.error) && 'connect a sender', !S.settings.address && 'add your mailing address'].filter(Boolean);
  const row = x => `<li class="orow" data-open="${esc(x.id)}" data-testid="out-row">
      <div class="ocol"><b>${esc(x.name)}</b><span class="note">${esc([MODE[x.mode], x.toName, x.to].filter(Boolean).join(' · '))}</span></div>
      <div class="ocol"><span class="pill2 ${x.phase === 'replied' ? 'done' : x.phase === 'failed' ? 'failed' : x.next?.overdue || x.phase === 'review' || x.call?.past ? 'running' : ''}">${esc(x.call?.past ? 'Did the call happen?' : x.status)}</span>
        <span class="note">${x.call && !x.call.past ? `call ${when(x.call.start)}` : x.replied ? `${RKIND[x.replied.kind] || 'replied'} ${day(x.replied.at)}` : x.next ? `${x.next.kind === 'followup1' ? 'Follow-up 1' : 'Follow-up 2'} ${x.next.overdue ? 'is due' : `due ${day(x.next.due)}`}` : x.sentAt ? `sent ${day(x.sentAt)} from ${esc(x.sender)}` : `${x.signals} signals`}</span></div>
      <button class="ghost sm">Open</button></li>`;
  const list = (title, xs, hint, extra = '') => xs.length ? `<section class="card"><h2 class="h2">${title} <span class="h2s">${xs.length}</span></h2>${hint ? `<p class="note">${hint}</p>` : ''}${extra}<ul class="outlist">${xs.map(row).join('')}</ul></section>` : '';
  const T = R.totals, peak = Math.max(1, ...R.weeks.map(w => w.contacted));
  O.main.innerHTML = `<div class="ps" data-testid="outreach">
    <div class="pshead"><h1>Outreach</h1><p class="lede2">Personal emails, letters and calls to the owners your searches found, through to the call, the NDA, the books and the offer. Every message is written from what AION knows about that firm, and nothing is sent until you press Send.</p></div>
    ${how('pick firms under “Ready to start”. AION writes a first email, two follow-ups, a letter, call notes and a contact-form message for each, from every signal it has, and shows the ones it used. You edit, pick the sender, and approve each send. Replies, bounces and “no thanks” are checked every 10 minutes (with a Mac notification); a “no thanks” is never emailed again.')}
    ${setupGaps.length ? `<p class="warnline" data-testid="out-setup-gap">Before you can send: ${setupGaps.join(' and ')} under Senders below.</p>` : ''}
    <section class="card" data-testid="out-results"><h2 class="h2">Results <span class="h2s">from what actually happened in Gmail and your marks</span></h2>
      <div class="ostats">${[[T.contacted, 'contacted'], [T.replied, 'replied'], [T.rate == null ? '—' : `${T.rate}%`, 'reply rate'], [T.interested, 'interested'], [T.calls, 'calls booked'], [T.optedOut, 'said no thanks'], [T.bounced, 'bounced']].map(([v, l]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
      ${R.weeks.length ? `<div class="obars" role="img" aria-label="Firms contacted each week">${R.weeks.map(w => `<div title="Week of ${esc(w.week)}: ${w.contacted} contacted, ${w.replies} replies"><i style="height:${Math.max(3, Math.round(w.contacted / peak * 46))}px"></i><i class="r" style="height:${Math.max(0, Math.round(w.replies / peak * 46))}px"></i><span>${esc(day(w.week + 'T12:00:00'))}</span></div>`).join('')}</div><p class="note">Dark: contacted · green: replies, by week.</p>` : '<p class="note">Results appear after your first sends.</p>'}
      ${R.byChannel.length || R.bySignal.length ? `<div class="obys">${R.byChannel.length ? `<div><b>By channel</b>${R.byChannel.map(x => `<span>${esc(x.key)}: ${x.replied}/${x.sent}${x.rate != null ? ` (${x.rate}%)` : ''}</span>`).join('')}</div>` : ''}${R.bySender.length ? `<div><b>By sender</b>${R.bySender.map(x => `<span>${esc(x.key)}: ${x.replied}/${x.sent}</span>`).join('')}</div>` : ''}${R.bySignal.length ? `<div><b>Openers that get replies</b>${R.bySignal.slice(0, 5).map(x => `<span>${esc(x.key)}: ${x.rate}% of ${x.sent}</span>`).join('')}</div>` : ''}</div>` : ''}
    </section>
    ${list('Needs you', needs, 'Replies to answer, drafts to approve, follow-ups that are due, and calls to confirm.', reviews.length > 1 ? `<button class="sm" id="oqueue" data-testid="out-queue">Review ${reviews.length} drafts one by one</button>` : '')}
    ${writing.length ? list('Writing', writing, 'Two are written at a time; this page updates by itself.') : ''}
    <section class="card" data-testid="out-ready"><h2 class="h2">Ready to start <span class="h2s">${S.ready.length} from your searches</span></h2>
      <p class="note">Your saved and priority picks first, then strong fits (70+). ${S.ready.filter(r => r.emails).length} have a verified email; the rest get a letter, call notes and a contact-form message.</p>
      ${S.ready.length ? `<div class="oacts"><button class="ghost sm" id="opickmail">Select the ones with email</button><button class="sm" id="omany" ${O.pick.size ? '' : 'disabled'} data-testid="out-many">Write outreach for ${O.pick.size || 'selected'}</button></div>
      <ul class="outlist">${S.ready.slice(0, 60).map(r => { const k = `${r.search}|${r.entity}`; return `<li class="orow sel"><label class="ocheck"><input type="checkbox" data-pick="${esc(k)}" ${O.pick.has(k) ? 'checked' : ''} aria-label="Select ${esc(r.name)}"></label><div class="ocol"><b>${esc(r.name)}</b><span class="note">${esc([MODE[r.mode], r.where, `fit ${r.score}`].filter(Boolean).join(' · '))}${r.priority ? ' · <b>priority</b>' : r.picked ? ' · saved' : ''}</span></div>
        <div class="ocol"><span class="pill2 ${r.emails ? 'done' : ''}">${r.emails ? 'Email found' : r.site ? 'Email: read from their site when written' : 'No email: letter or call'}</span>${r.pitch ? ` <span class="pill2" title="From the owner ranking: their sale and partnership signals">${PITCH[r.pitch]}${r.high ? ' · high intent' : ''}</span>` : ''}${r.rankScore != null ? ` <span class="pill2" title="Owner ranking score: intent + breadth of signals + fit + reach">Rank ${r.rankScore}</span>` : ''}</div>
        <button class="sm" data-write="${esc(k)}" data-testid="out-write">Write outreach</button></li>`; }).join('')}</ul>` : '<p class="empty">Nothing yet. Save firms in Proprietary Search (or run a search), and they appear here.</p>'}
    </section>
    ${list('Sent, waiting for a reply', waiting)}
    ${list('Finished', done)}
    <section class="card" data-testid="out-senders"><h2 class="h2">Senders <span class="h2s">AION sends only from the accounts you connect here</span></h2>
      ${!S.gmailReady ? '<p class="warnline">Gmail sign-in isn’t set up on this Mac (GOOGLE_CLIENT_ID in demo/.env).</p>' : ''}
      <ul class="outlist">${senders.map(x => `<li class="orow"><div class="ocol"><b>${esc(x.email)}</b><span class="note">${x.acc ? x.acc.error ? esc(x.acc.error) : `connected ${day(x.acc.connectedAt)} · ${x.acc.calendar ? 'Gmail and Calendar' : 'Gmail only: reconnect to offer call times'}` : 'not connected'}${S.settings.defaultSender === x.email ? ' · default' : ''}</span></div>
        <div class="ocol">${x.acc && !x.acc.error ? `${x.acc.calendar ? '' : `<button class="sm" data-conn="${esc(x.email)}">Reconnect with Calendar</button>`}${S.settings.defaultSender === x.email ? '' : `<button class="ghost sm" data-default="${esc(x.email)}">Make default</button>`}<button class="ghost sm" data-disc="${esc(x.email)}">Disconnect</button>` : `<button class="sm" data-conn="${esc(x.email)}" data-testid="out-connect">Connect</button>`}</div></li>`).join('')}</ul>
      <form class="ofields" id="oset">
        <label>Your name<input name="name" value="${esc(S.settings.name)}"></label>
        <label>Title<input name="title" value="${esc(S.settings.title)}"></label>
        <label>Phone<input name="phone" value="${esc(S.settings.phone)}"></label>
        <label>Company legal name <span class="note">on NDAs and LOIs</span><input name="legalName" value="${esc(S.settings.legalName)}"></label>
        <label>NDA governing law (state)<input name="governingLaw" value="${esc(S.settings.governingLaw)}"></label>
        <label>Call length (minutes)<select name="callMinutes">${[15, 20, 30, 45, 60].map(n => `<option ${+S.settings.callMinutes === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="wide">Mailing address <span class="note">required on outreach email (US CAN-SPAM)</span><input name="address" value="${esc(S.settings.address)}" placeholder="Street, city, state ZIP" data-testid="out-address"></label>
        <label class="wide">Signature <span class="note">optional; otherwise name, title and phone</span><textarea name="signature" rows="3">${esc(S.settings.signature)}</textarea></label>
        <label>Daily limit per sender<input name="dailyCap" inputmode="numeric" value="${esc(S.settings.dailyCap)}"></label>
        <label>Follow-ups after (days)<input name="followUpDays" value="${esc(S.settings.followUpDays.join(', '))}"></label>
        <div class="wide"><button type="submit">Save</button> <span class="note">${S.suppressed} address${S.suppressed === 1 ? '' : 'es'} asked not to be contacted</span></div>
      </form>
    </section>
  </div>`;
  const $$ = s => O.main.querySelectorAll(s), q = s => O.main.querySelector(s);
  $$('[data-open]').forEach(el => el.onclick = () => { O.view = 'item'; O.id = el.dataset.open; O.kind = null; O.queue = null; draw(); });
  $$('[data-write]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); const [search, entity] = b.dataset.write.split('|'); b.disabled = true; b.textContent = 'Writing…'; try { const r = await api('outreach/create', { search, entity }); O.view = 'item'; O.id = r.id; O.kind = 'email'; draw(); } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = 'Write outreach'; } });
  $$('[data-pick]').forEach(c => c.onchange = () => { c.checked ? O.pick.add(c.dataset.pick) : O.pick.delete(c.dataset.pick); const m = q('#omany'); m.disabled = !O.pick.size; m.textContent = `Write outreach for ${O.pick.size || 'selected'}`; });
  q('#opickmail') && (q('#opickmail').onclick = () => { S.ready.filter(r => r.emails).slice(0, 25).forEach(r => O.pick.add(`${r.search}|${r.entity}`)); draw(); });
  q('#omany') && (q('#omany').onclick = async ev => { const items = [...O.pick].slice(0, 25).map(k => { const [search, entity] = k.split('|'); return { search, entity }; }); ev.target.disabled = true; ev.target.textContent = 'Starting…'; try { const r = await api('outreach/batch', { items }); O.pick.clear(); toast(`Writing ${r.made.length} drafts, two at a time${r.skipped.length ? `; ${r.skipped.length} skipped (${r.skipped[0].why})` : ''}.`); draw(); } catch (e) { toast(e.message, 'err'); draw(); } });
  q('#oqueue') && (q('#oqueue').onclick = () => { O.queue = reviews.map(x => x.id); O.view = 'item'; O.id = O.queue[0]; O.kind = null; draw(); });
  $$('[data-conn]').forEach(b => b.onclick = async () => { try { const r = await api('outreach/connect', { email: b.dataset.conn }); if (r.url) { window.open(r.url, '_blank'); toast(`Sign in as ${b.dataset.conn} in the browser tab and allow Gmail and Calendar, then come back.`); pollAccounts(); } else draw(); } catch (e) { toast(e.message, 'err'); } });
  $$('[data-disc]').forEach(b => b.onclick = async () => { if (!confirm(`Disconnect ${b.dataset.disc}? AION won’t be able to send from it or see replies.`)) return; await api('outreach/disconnect', { email: b.dataset.disc }); draw(); });
  $$('[data-default]').forEach(b => b.onclick = async () => { await api('outreach/settings', { defaultSender: b.dataset.default }); draw(); });
  q('#oset').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try { await api('outreach/settings', { ...Object.fromEntries(f), followUpDays: String(f.get('followUpDays')).split(/[ ,]+/).filter(Boolean).map(Number) }); toast('Saved'); draw(); } catch (e) { toast(e.message, 'err'); } };
  if (writing.length) O.timer = setTimeout(draw, 3000);
}

function pollAccounts(n = 0) { const before = JSON.stringify(O.st?.accounts || []); O.timer = setTimeout(async () => { const s = await api('outreach/state').catch(() => null); if (s && JSON.stringify(s.accounts) !== before) { toast(`Connected ${s.accounts.at(-1)?.email || ''}`); return draw(); } if (n < 60) pollAccounts(n + 1); }, 3000); }

async function drawItem() {
  clearTimeout(O.timer);
  try { O.it = await api(`outreach/item?id=${encodeURIComponent(O.id)}`); } catch (e) { O.view = 'board'; toast(e.message, 'err'); return draw(); }
  const it = O.it, S = O.st || await api('outreach/state');
  const qpos = O.queue ? O.queue.indexOf(it.id) : -1, nextQ = qpos >= 0 ? O.queue[qpos + 1] : null;
  if (it.phase === 'writing') { O.main.innerHTML = `<div class="ps"><button class="ghost sm" id="oback">← Outreach</button><h1>${esc(it.name)}</h1><p class="lede2">Writing personal drafts from ${it.signals.length} signals…</p></div>`; O.main.querySelector('#oback').onclick = back; O.timer = setTimeout(drawItem, 2500); return; }
  const avail = KINDS.filter(([k]) => it.drafts?.[k]);
  if (!O.kind || !it.drafts?.[O.kind]) O.kind = it.replied && it.drafts?.answer ? 'answer' : (it.messages.some(m => m.kind === 'email') ? (it.messages.some(m => m.kind === 'followup1') ? 'followup2' : 'followup1') : it.to ? 'email' : 'letter');
  if (!it.drafts?.[O.kind]) O.kind = avail[0]?.[0] || 'email';
  const d = it.drafts?.[O.kind], sent = it.messages.find(m => m.kind === O.kind), pf = it.preflight?.[O.kind];
  const used = new Set(d?.used || []);
  const sendable = ['email', 'followup1', 'followup2'].includes(O.kind), manual = ['letter', 'call', 'form'].includes(O.kind);
  const accts = S.accounts.filter(a => !a.error).map(a => a.email);
  const talking = !!it.replied || it.phase === 'conversation' || !!it.call;
  // they picked one of the offered times in their reply: show it ready to book
  if (!O.slots && !it.call && it.replied?.picked) O.slots = { slots: [it.replied.picked, ...(it.offered || []).filter(x => x.start !== it.replied.picked.start)], note: `${it.toName || 'They'} picked ${it.replied.picked.label} in their reply. Send the invite to confirm it.` };
  const D = it.docs || {};
  const docBox = (kind, title, what, btn) => `<li class="ostep" data-testid="out-doc-${kind}"><div><b>${title}</b><span class="note">${what}</span></div>
      ${D[kind] ? `<textarea class="obody" data-doc="${kind}" rows="${kind === 'request' ? 12 : 14}">${esc(D[kind].body)}</textarea>
      <div class="oacts"><button class="ghost sm" data-docsave="${kind}">Save edits</button>${kind !== 'request' ? `<a class="btnlink" href="/api/outreach/pdf?id=${encodeURIComponent(it.id)}&kind=${kind}">Download PDF</a>` : ''}<button class="sm" data-docsend="${kind}" ${it.to ? '' : 'disabled'}>${kind === 'request' ? 'Send the request…' : 'Email it with the PDF…'}</button>${D[kind].sentAt ? `<span class="note">sent ${day(D[kind].sentAt)}</span>` : ''}</div>` : `<button class="sm" data-docmake="${kind}">${btn}</button>`}</li>`;
  O.main.innerHTML = `<div class="ps" data-testid="out-item">
    <div class="oacts"><button class="ghost sm" id="oback">← Outreach</button>${O.queue ? `<span class="note">Draft ${qpos + 1} of ${O.queue.length}</span>${nextQ ? '<button class="ghost sm" id="onextq">Next draft →</button>' : ''}` : ''}</div>
    <div class="pshead"><h1>${esc(it.name)}</h1><p class="lede2">${esc(it.status)}${it.pitch ? ` · ${PITCH_LONG[it.pitch] || PITCH_LONG.sale}` : ''}${it.why ? ` · ${esc(it.why)}` : ''}</p></div>
    ${it.phase === 'failed' ? `<p class="warnline">${esc(it.status)}</p>` : ''}
    ${it.replied ? `<section class="card" data-testid="out-reply"><h2 class="h2">Their reply <span class="h2s">${esc(it.replied.from)} · ${day(it.replied.at)} · ${esc(RKIND[it.replied.kind] || it.replied.kind)}</span></h2><pre class="obody">${esc(it.replied.text)}</pre>
      ${it.drafts?.answer ? '' : `<button id="oanswer" data-testid="out-answer">Draft my reply${it.replied.kind !== 'later' ? ' with my open times' : ''}</button>`}</section>` : ''}
    ${talking && it.replied?.kind !== 'optout' ? `<section class="card" data-testid="out-call"><h2 class="h2">The call <span class="h2s">${it.call ? `booked ${esc(when(it.call.start))}` : 'offer real open times, then send the invite'}</span></h2>
      ${it.call ? `<p>${esc(when(it.call.start))}${it.call.meet ? ` · <a href="${safeUrl(it.call.meet)}" target="_blank" rel="noreferrer">Google Meet link</a>` : ''}${it.call.link ? ` · <a href="${safeUrl(it.call.link)}" target="_blank" rel="noreferrer">In your calendar</a>` : ''}</p>
        ${Date.parse(it.call.end) < Date.now() && !it.callHeld ? `<div class="oacts"><span>Did the call happen?</span><button class="sm" data-stage="met" data-testid="out-held">Yes, meeting held</button><button class="ghost sm" id="orebook">No, find a new time</button></div>` : ''}`
      : `<div id="oslots">${O.slots ? O.slots.slots.length ? `<p class="note">${esc(O.slots.note)}</p><div class="oslots">${O.slots.slots.map((x, i) => `<label><input type="radio" name="oslot" value="${esc(x.start)}" ${i === 0 ? 'checked' : ''}> ${esc(x.label)}</label>`).join('')}</div>` : `<p class="note">${esc(O.slots.note || 'No open times found in the next two weeks.')}</p>` : '<button class="ghost sm" id="oloadslots" data-testid="out-slots">Show my open times</button>'}
        <div class="ofields"><label>Or another time<input type="datetime-local" id="ocustom"></label></div>
        <button class="sm" id="obook" data-testid="out-book" ${it.to ? '' : 'disabled'}>Send calendar invite…</button></div>`}
    </section>` : ''}
    ${it.mode === 'target' && talking && it.replied?.kind !== 'optout' ? `<section class="card" data-testid="out-deal"><h2 class="h2">Deal steps <span class="h2s">after the first call, in order</span></h2>
      ${how('each step is a draft you edit and approve. The NDA and LOI are plain-English starting points: have a lawyer review them before anything is signed. When they send their books, open them in Value Creation in one click; the LOI is written from that analysis.')}
      <ol class="osteps">
        ${docBox('nda', '1. Confidentiality agreement (NDA)', 'Mutual, two years, both sides protected', 'Write the NDA')}
        ${docBox('request', '2. Ask for the books', 'The files AION needs to value the firm', 'Write the request')}
        <li class="ostep" data-testid="out-files"><div><b>3. Their files</b><span class="note">Attachments they sent in this email thread</span></div>
          ${it.dealId ? `<p class="note">Opened in Value Creation. <button class="ghost sm" id="ogovc">Go to Value Creation</button></p>` : ''}
          <div id="ofiles"><button class="ghost sm" id="oloadfiles">Check the thread for files</button></div></li>
        ${docBox('loi', '4. Letter of intent (non-binding)', it.dealId ? 'Written from the price and structure in Value Creation' : 'Opens once their books are in Value Creation', 'Write the LOI from the analysis')}
      </ol>
      <div class="ostage"><span class="note">Deal stage:</span>${[['met', 'Meeting held'], ['nda', 'NDA signed'], ['books', 'Books received'], ['loi', 'Offer sent'], ['closed', 'Closed'], ['passed', 'Passed']].map(([k, l]) => `<button class="ghost sm ${it.stage === k ? 'on' : ''}" data-stage="${k}">${l}</button>`).join('')}</div></section>` : ''}
    <div class="ogrid">
      <section class="card">
        <nav class="dtabs">${avail.map(([k, l]) => `<button data-kind="${k}" class="${k === O.kind ? 'on' : ''}">${l}${it.messages.some(m => m.kind === k) ? ' ✓' : ''}</button>`).join('')}</nav>
        ${!it.to && !it.messages.some(m => m.sentAt) ? `<p class="warnline">No email address for them yet. <button class="ghost sm" id="ofind" data-testid="out-find">Find a verified email</button> or use the letter, call notes or contact form.</p>` : ''}
        ${sent ? `<p class="note" data-testid="out-sent">${sent.manual ? `Marked done ${day(sent.sentAt)}${sent.note ? `: ${esc(sent.note)}` : ''}` : `Sent ${day(sent.sentAt)} from ${esc(sent.from)} to ${esc(sent.to)}`}</p><pre class="obody">${esc(sent.body || d?.body || '')}</pre>` : d ? `
        ${sendable || O.kind === 'answer' ? `<div class="ofields">
          <label>From${it.messages.some(m => m.threadId) ? `<input value="${esc(it.sender)}" disabled title="This conversation is in this account’s Gmail">` : `<select id="ofrom">${[...new Set([it.sender, ...accts])].map(e => `<option ${e === it.sender ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>`}</label>
          <label>To${it.contacts.emails.length > 1 ? `<select id="oto">${it.contacts.emails.map(c => `<option value="${esc(c.email)}" ${c.email === it.to ? 'selected' : ''}>${esc(c.name ? `${c.name} <${c.email}>` : c.email)}${c.verified ? ' (verified)' : ''}</option>`).join('')}</select>` : `<input id="oto" value="${esc(it.to)}" placeholder="name@company.com" data-testid="out-to">`}</label>
          ${O.kind === 'email' ? `<label class="wide">Subject<input id="osubj" value="${esc(d.subject)}" data-testid="out-subject"></label>` : ''}</div>` : ''}
        <textarea id="obody" class="obody" rows="${O.kind === 'letter' ? 18 : 14}" data-testid="out-body">${esc(d.body)}</textarea>
        ${sendable || O.kind === 'answer' ? `<p class="note">Your signature${sendable ? ', mailing address and a one-line “no thanks” opt-out are' : ' is'} added below when it sends.</p>` : ''}
        ${d.check?.length ? `<p class="warnline" data-testid="out-check">Check before sending: ${d.check.map(esc).join(', ')} ${d.check.length === 1 ? 'isn’t' : 'aren’t'} in AION’s signals for them.</p>` : ''}
        <div class="oacts">
          <button class="ghost" id="osave">Save edits</button>
          ${sendable ? `<button id="osend" ${pf?.ok ? '' : 'disabled'} data-testid="out-send">Send…</button><button class="ghost" id="ogdraft" ${pf?.problems?.some(p => /connect|address|recipient/i.test(p)) ? 'disabled' : ''}>Save to Gmail Drafts</button>` : ''}
          ${O.kind === 'answer' ? `<button id="oansend" data-testid="out-answer-send">Send reply…</button>` : ''}
          ${O.kind === 'letter' ? `<a class="btnlink" href="/api/outreach/pdf?id=${encodeURIComponent(it.id)}&kind=letter" data-testid="out-letter-pdf">Download letter PDF</a>` : ''}
          ${manual ? `<button class="ghost" id="ocopy">Copy</button><button id="omark" data-testid="out-mark">${O.kind === 'letter' ? 'Mark letter mailed' : O.kind === 'call' ? 'Mark called' : 'Mark form sent'}</button>` : ''}
        </div>
        ${sendable && pf && !pf.ok ? `<ul class="oprob" data-testid="out-problems">${pf.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}` : '<p class="empty">No draft for this.</p>'}
      </section>
      <aside class="card osig" data-testid="out-signals"><h2 class="h2">What AION knows <span class="h2s">${it.signals.length} signals · ${used.size} used here</span></h2>
        <p class="note">Every message is built only from these. Highlighted ones are used in this draft.</p>
        <ul>${it.signals.map((x, i) => `<li class="${used.has(x.id) ? 'used' : ''}" ${i >= 10 && !used.has(x.id) && !O.allSig ? 'hidden' : ''}><span class="tagx">${esc(x.kind)}</span> ${esc(x.text)}${x.source ? ` <a href="${safeUrl(x.source)}" target="_blank" rel="noreferrer">source</a>` : ''}</li>`).join('')}</ul>
        ${it.signals.filter((x, i) => i >= 10 && !used.has(x.id)).length && !O.allSig ? `<button class="ghost sm more" id="oallsig">Show all ${it.signals.length}</button>` : ''}
        ${it.contacts.people.length || it.contacts.other.length ? `<h3>Contacts</h3><ul>${it.contacts.people.map(p => `<li>${esc(p.name)}${p.title ? `, ${esc(p.title)}` : ''}</li>`).join('')}${it.contacts.other.map(c => `<li>${esc(c.kind.replace('_', ' '))}: ${/^https?:/.test(c.value) ? `<a href="${safeUrl(c.value)}" target="_blank" rel="noreferrer">${esc(c.value)}</a>` : esc(c.value)}</li>`).join('')}</ul>` : ''}
        <h3>History</h3><ul class="olog">${it.log.slice().reverse().map(l => `<li><span class="note">${day(l.at)}</span> ${esc(l.text)}</li>`).join('')}</ul>
        ${it.messages.some(m => m.sentAt) ? `<button class="ghost sm" id="ofinish">Finish (no more follow-ups)</button>` : `<button class="ghost sm" id="odel">Delete this outreach</button>`}
      </aside>
    </div></div>`;
  const q = s => O.main.querySelector(s), $$ = s => O.main.querySelectorAll(s);
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); drawItem(); } catch (e) { toast(e.message, 'err'); drawItem(); } };
  q('#oback').onclick = back;
  q('#onextq') && (q('#onextq').onclick = () => { O.id = nextQ; O.kind = null; O.slots = null; drawItem(); });
  q('#oallsig') && (q('#oallsig').onclick = () => { O.allSig = true; drawItem(); });
  $$('[data-kind]').forEach(b => b.onclick = () => { O.kind = b.dataset.kind; drawItem(); });
  const edits = () => ({ id: it.id, kind: O.kind, body: q('#obody')?.value, ...(q('#osubj') ? { subject: q('#osubj').value } : {}), ...(q('#oto') ? { to: q('#oto').value } : {}), ...(q('#ofrom') ? { sender: q('#ofrom').value } : {}) });
  const saveEdits = async () => { if (q('#obody')) await api('outreach/edit', edits()); };
  q('#osave') && (q('#osave').onclick = () => act(saveEdits, 'Saved'));
  ['#oto', '#ofrom'].forEach(s => q(s) && (q(s).onchange = () => act(saveEdits)));
  q('#ofind') && (q('#ofind').onclick = ev => { ev.target.disabled = true; ev.target.textContent = 'Looking…'; act(() => api('outreach/find-email', { id: it.id }), 'Found a verified email'); });
  q('#osend') && (q('#osend').onclick = async () => {
    try { await saveEdits(); const fresh = await api(`outreach/item?id=${encodeURIComponent(it.id)}`); const p = fresh.preflight[O.kind]; if (!p.ok) { toast(p.problems[0], 'err'); return drawItem(); }
      if (!confirm(`Send this email now?\n\nFrom: ${p.from}\nTo: ${p.to}\nSubject: ${p.subject}\n\n${p.body.slice(0, 1200)}${p.check.length ? `\n\nCheck: ${p.check.join(', ')}` : ''}`)) return;
      await api('outreach/send', { id: it.id, kind: O.kind, confirmed: true }); toast(`Sent to ${p.to}`); O.kind = null; if (nextQ) O.id = nextQ; drawItem(); } catch (e) { toast(e.message, 'err'); }
  });
  q('#ogdraft') && (q('#ogdraft').onclick = () => act(async () => { await saveEdits(); await api('outreach/send', { id: it.id, kind: O.kind, confirmed: true, saveOnly: true }); }, `Saved to ${q('#ofrom')?.value || it.sender} Gmail Drafts. Nothing was sent.`));
  q('#ocopy') && (q('#ocopy').onclick = async () => { await navigator.clipboard.writeText(q('#obody').value).catch(() => {}); toast('Copied'); });
  q('#omark') && (q('#omark').onclick = () => { const note = prompt(O.kind === 'call' ? 'How did the call go? (optional)' : 'Any note? (optional)') ?? ''; act(async () => { await saveEdits(); await api('outreach/done', { id: it.id, kind: O.kind, note }); }, 'Marked done'); });
  q('#oanswer') && (q('#oanswer').onclick = ev => { ev.target.disabled = true; ev.target.textContent = 'Writing…'; act(async () => { await api('outreach/answer', { id: it.id }); O.kind = 'answer'; }); });
  q('#oansend') && (q('#oansend').onclick = async () => { try { await saveEdits(); if (!confirm(`Send your reply to ${it.to} from ${q('#ofrom')?.value || it.sender}?`)) return; await api('outreach/answer-send', { id: it.id, confirmed: true }); toast('Reply sent'); drawItem(); } catch (e) { toast(e.message, 'err'); } });
  q('#oloadslots') && (q('#oloadslots').onclick = ev => { ev.target.disabled = true; ev.target.textContent = 'Checking your calendars…'; act(async () => { O.slots = await api('outreach/slots'); }); });
  q('#orebook') && (q('#orebook').onclick = () => act(async () => { O.slots = await api('outreach/slots'); await api('outreach/edit', { id: it.id, clearCall: true }); }));
  q('#obook') && (q('#obook').onclick = async () => {
    const custom = q('#ocustom').value, start = custom ? new Date(custom).toISOString() : O.main.querySelector('input[name=oslot]:checked')?.value;
    if (!start) return toast('Show your open times and pick one, or type another time.', 'err');
    if (!confirm(`Send a calendar invite to ${it.to} from ${it.sender} for ${when(start)} (${S.settings.callMinutes || 30} minutes, with a Google Meet link)?`)) return;
    act(async () => { await api('outreach/book', { id: it.id, start, confirmed: true }); O.slots = null; }, 'Invite sent');
  });
  $$('[data-stage]').forEach(b => b.onclick = () => { const note = prompt('Note for the deal history (optional)') ?? ''; act(() => api('outreach/stage', { id: it.id, stage: b.dataset.stage, note }), 'Deal stage updated'); });
  $$('[data-docmake]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Writing…'; act(() => api('outreach/doc', { id: it.id, kind: b.dataset.docmake })); });
  $$('[data-docsave]').forEach(b => b.onclick = () => act(() => api('outreach/doc-edit', { id: it.id, kind: b.dataset.docsave, body: q(`[data-doc="${b.dataset.docsave}"]`).value }), 'Saved'));
  $$('[data-docsend]').forEach(b => b.onclick = async () => { const k = b.dataset.docsend; try { await api('outreach/doc-edit', { id: it.id, kind: k, body: q(`[data-doc="${k}"]`).value }); if (!confirm(`Email the ${k === 'request' ? 'books request' : `${D[k].title} as a PDF`} to ${it.to} from ${it.sender}?`)) return; b.disabled = true; b.textContent = 'Sending…'; await api('outreach/doc-send', { id: it.id, kind: k, confirmed: true }); toast('Sent'); drawItem(); } catch (e) { toast(e.message, 'err'); drawItem(); } });
  q('#ogovc') && (q('#ogovc').onclick = () => document.querySelector('[data-app="vc"]')?.click());
  q('#oloadfiles') && (q('#oloadfiles').onclick = async ev => {
    ev.target.disabled = true; ev.target.textContent = 'Checking…';
    try { const { files } = await api(`outreach/attachments?id=${encodeURIComponent(it.id)}`); const box = q('#ofiles');
      box.innerHTML = files.length ? `<ul class="outlist">${files.map((f, i) => `<li class="orow"><div class="ocol"><b>${esc(f.filename)}</b><span class="note">${esc(f.from)} · ${day(f.at)} · ${Math.round((f.size || 0) / 1024)} KB</span></div><div class="ocol"></div>${/\.(xlsx|xls|csv|pdf)$/i.test(f.filename) ? `<button class="sm" data-import="${i}" data-testid="out-import">Open in Value Creation</button>` : '<span class="note">not a books file</span>'}</li>`).join('')}</ul>` : '<p class="note">No files in this thread yet. When they reply with their books, they show up here.</p>';
      box.querySelectorAll('[data-import]').forEach(b => b.onclick = async () => { const f = files[+b.dataset.import]; b.disabled = true; b.textContent = 'Opening…';
        try { const { data } = await api(`outreach/attachment?id=${encodeURIComponent(it.id)}&m=${encodeURIComponent(f.messageId)}&a=${encodeURIComponent(f.attachmentId)}`);
          const up = await api('upload', { filename: f.filename, data }); await api('outreach/link-deal', { id: it.id, name: it.name });
          toast(up.job ? 'Opened in Value Creation; the analysis is running.' : 'Opened in Value Creation. Check the account mapping, then press Analyze.'); document.querySelector('[data-app="vc"]')?.click();
        } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = 'Open in Value Creation'; } });
    } catch (e) { toast(e.message, 'err'); ev.target.disabled = false; ev.target.textContent = 'Check the thread for files'; }
  });
  q('#ofinish') && (q('#ofinish').onclick = async () => { await api('outreach/finish', { id: it.id, why: 'Finished by you' }); back(); });
  q('#odel') && (q('#odel').onclick = async () => { if (!confirm('Delete this outreach and its drafts?')) return; await api('outreach/delete', { id: it.id }); back(); });
}
function back() { O.view = 'board'; O.id = null; O.allSig = false; O.slots = null; O.queue = null; draw(); }
