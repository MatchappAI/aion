import { toast } from './ui.js';
import { DEAL_STAGES, THESIS } from '/thesis.mjs';
const PITCH = { full: 'Full buyout', majority: 'Majority stake', sale: 'Full buyout', both: 'Full buyout', partner: 'Partnership' }; // 'sale' and 'both' are older saved values
const PITCH_LONG = { full: 'Full buyout: a succession plan on their timeline', majority: 'Majority stake: they keep a share and keep running it', sale: 'Full buyout: a succession plan on their timeline', both: 'Full buyout: a succession plan on their timeline', partner: 'Growth partnership: offered because they asked for a partner' };
const OFFERS = ['full', 'majority', 'partner'];
const TYPE_LABEL = { A: 'A · said they want to sell', B: 'B · exploring succession', C: 'C · no sale interest known (asks about long-term ownership)', D: 'D · asked for a growth partner', E: 'E · marketed (listed or broker)' };
const SCHEDULABLE = ['email', 'followup1', 'followup2'];
// a sensible default time: the next weekday at 9:00; follow-ups N days after the first email (sent or scheduled)
function defaultAt(it, kind, days = [4, 10]) {
  const base = kind === 'email' ? new Date() : new Date(it.messages.find(m => m.kind === 'email' && m.sentAt)?.sentAt || it.scheduled?.email?.at || Date.now());
  const d = new Date(base); d.setDate(d.getDate() + (kind === 'followup1' ? days[0] : kind === 'followup2' ? days[1] : 1)); d.setHours(9, 0, 0, 0);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const inboxOf = e => String(e || '').split('@')[0];
// Outreach: write to the firms (and people) your searches found, personally and only from what AION knows about
// them. You edit every message, pick the sender, and approve each send. Replies, calls, the NDA, the books and the
// LOI all happen from here, and the results show what's working.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = v => { const u = String(v ?? '').trim(); return /^(https?:\/\/|mailto:|tel:)/i.test(u) ? esc(u) : '#'; };
const api = async (p, b) => { const r = await fetch('/api/' + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`); return j; };
const day = d => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const plainSrc = s => String(s || 'a common pattern').replace(/\s*\([^)]*\{[^)]*\)/g, '').trim(); // “the most common format for small firms”, without the {first}@ pattern
const clock = t => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const when = d => d ? new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const how = t => `<p class="howline"><b>How this works:</b> ${t}</p>`;
const KINDS = [['email', 'First email'], ['followup1', 'Follow-up 1'], ['followup2', 'Follow-up 2'], ['letter', 'Letter'], ['call', 'Call notes'], ['form', 'Discreet note'], ['answer', 'Your reply']];
const MODE = { target: 'Firm to buy', client: 'Brand', candidate: 'Person' };

const RKIND = { interested: 'interested', later: 'not now', reply: 'replied', optout: 'no thanks' };
let O = { main: null, view: 'board', id: null, kind: 'email', timer: null, st: null, it: null, pick: new Set(), queue: null, allSig: false, slots: null };

export function mountOutreach(main, opts = {}) { O.main = main; O.embedded = !!opts.embedded; draw(); }
export function leaveOutreach() { clearTimeout(O.timer); O.timer = null; }

async function draw() {
  clearTimeout(O.timer);
  document.body.dataset.outview = O.view === 'item' && O.id ? 'item' : 'board';
  // opened from the owner list in Proprietary Search: go straight to that firm
  try { const open = localStorage.getItem('aion.outOpen'); if (open) { localStorage.removeItem('aion.outOpen'); Object.assign(O, { view: 'item', id: open, kind: null, queue: null }); } } catch {}
  if (O.view === 'item' && O.id) return drawItem();
  let R = null;
  try { [O.st, R] = await Promise.all([api('outreach/state'), api('outreach/results')]); } catch (e) { O.main.innerHTML = `<div class="ps"><p class="empty">${esc(e.message)}</p></div>`; return; }
  const S = O.st, B0 = S.board;
  const B = B0.filter(x => !O.inbox || x.sender === O.inbox);
  const needs = B.filter(x => x.phase === 'replied' || x.phase === 'review' || x.next?.overdue || x.phase === 'failed' || x.call?.past);
  const waiting = B.filter(x => (x.phase === 'waiting' || x.phase === 'conversation') && !x.next?.overdue && !x.call?.past);
  const writing = B.filter(x => x.phase === 'writing');
  const done = B.filter(x => x.phase === 'finished');
  const reviews = B.filter(x => x.phase === 'review');
  const senders = S.settings.senders.map(e => ({ email: e, acc: S.accounts.find(a => a.email === e) })).concat(S.accounts.filter(a => !S.settings.senders.includes(a.email)).map(a => ({ email: a.email, acc: a })));
  const setupGaps = [!S.accounts.some(a => !a.error) && 'connect a sender', !S.settings.address && 'add your mailing address'].filter(Boolean);
  const row = x => `<li class="orow" data-open="${esc(x.id)}" data-testid="out-row">
      <div class="ocol"><b>${x.rank ? `<span class="orank">#${x.rank}</span> ` : ''}${esc(x.name)}</b><span class="note">${esc([x.segmentLabel || MODE[x.mode], x.toName, x.to].filter(Boolean).join(' · '))}</span><span class="ochips">${x.pitch ? `<span class="pill2 offer-${esc(x.pitch)}">${esc(PITCH[x.pitch] || '')}</span>` : ''}${x.sender ? `<span class="pill2 inbox" title="${x.sentAt ? 'Sent from, and replies land in' : 'Will send from'} ${esc(x.sender)}">✉ ${esc(inboxOf(x.sender))}</span>` : ''}</span>${x.outside && x.phase !== 'finished' ? `<span class="warnline sm" title="From the buy box check in Owners to contact">Outside the buy box: ${esc(x.outside)}</span>` : ''}</div>
      <div class="ocol"><span class="pill2 ${x.phase === 'replied' ? 'done' : x.phase === 'failed' ? 'failed' : x.next?.overdue || x.phase === 'review' || x.call?.past ? 'running' : ''}">${esc(x.call?.past ? 'Did the call happen?' : x.status)}</span>
        <span class="note">${(x.scheduled || []).length ? `⏱ ${x.scheduled[0].held ? 'on hold' : `${x.scheduled[0].kind === 'email' ? 'first email' : x.scheduled[0].kind === 'followup1' ? 'follow-up 1' : 'follow-up 2'} ${when(x.scheduled[0].at)}`}` : x.call && !x.call.past ? `call ${when(x.call.start)}` : x.replied ? `${RKIND[x.replied.kind] || 'replied'} ${day(x.replied.at)}` : x.next ? `${x.next.kind === 'followup1' ? 'Follow-up 1' : 'Follow-up 2'} ${x.next.overdue ? 'is due' : `due ${day(x.next.due)}`}` : x.sentAt ? `sent ${day(x.sentAt)} from ${esc(x.sender)}` : `${x.signals} signals`}</span></div>
      <button class="ghost sm">Open</button></li>`;
  const list = (title, xs, hint, extra = '') => xs.length ? `<section class="card"><h2 class="h2">${title} <span class="h2s">${xs.length}</span></h2>${hint ? `<p class="note">${hint}</p>` : ''}${extra}<ul class="outlist">${xs.map(row).join('')}</ul></section>` : '';
  const T = R.totals, peak = Math.max(1, ...R.weeks.map(w => w.contacted));
  O.main.innerHTML = `<div class="ps" data-testid="outreach">
    <div class="pshead"><h1>Outreach</h1><p class="lede2">${O.embedded ? 'Everyone you are writing to and the inbox it goes from. Nothing is sent until you press Send.' : 'Personal emails, letters and calls to the owners your searches found. Nothing is sent until you press Send.'}</p></div>
    <div class="inboxes" data-testid="out-inboxes">${senders.map(x => { const mine = B0.filter(y => y.sender === x.email), rep = mine.filter(y => y.phase === 'replied').length, wait = mine.filter(y => ['waiting', 'conversation'].includes(y.phase)).length, todo = mine.filter(y => y.phase === 'review').length;
      return `<button class="inbox ${O.inbox === x.email ? 'on' : ''}" data-inbox="${esc(x.email)}" title="Show only ${esc(x.email)}"><b>✉ ${esc(x.email)}</b><span>${x.acc ? x.acc.error ? 'needs reconnect' : 'connected' : 'not connected'}${S.settings.defaultSender === x.email ? ' · default' : ''}</span><span>${rep ? `<em>${rep} repl${rep === 1 ? 'y' : 'ies'}</em> · ` : ''}${todo} to approve · ${wait} waiting</span></button>`; }).join('')}</div>
    ${O.embedded ? '' : how('save firms under Firms below and press Write outreach there. AION writes a first email, two follow-ups, a letter, call notes and a discreet note for their shared inbox for each from every signal it has. You edit, pick the inbox, and approve each send. Replies are checked every 10 minutes; a “no thanks” is never emailed again.')}
    ${setupGaps.length ? `<p class="warnline" data-testid="out-setup-gap">Before you can send: ${setupGaps.join(' and ')} under <span class="link" id="oopenset">Inboxes and settings</span> below.</p>` : ''}
    ${!B0.length ? '<p class="note" data-testid="out-empty">No outreach yet. When you press Write outreach on a firm, its drafts, sends and replies show up here.</p>' : ''}
    ${B0.length ? '' : '<!--'}<details class="card odet" data-testid="out-results" ${O.embedded ? '' : 'open'}><summary class="h2">Results <span class="h2s">from what actually happened in Gmail and your marks</span></summary>
      <div class="ostats">${[[T.contacted, 'contacted'], [T.replied, 'replied'], [T.rate == null ? '—' : `${T.rate}%`, 'reply rate'], [T.interested, 'interested'], [T.calls, 'calls booked'], [T.optedOut, 'said no thanks'], [T.bounced, 'bounced']].map(([v, l]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
      ${R.weeks.length ? `<div class="obars" role="img" aria-label="Firms contacted each week">${R.weeks.map(w => `<div title="Week of ${esc(w.week)}: ${w.contacted} contacted, ${w.replies} replies"><i style="height:${Math.max(3, Math.round(w.contacted / peak * 46))}px"></i><i class="r" style="height:${Math.max(0, Math.round(w.replies / peak * 46))}px"></i><span>${esc(day(w.week + 'T12:00:00'))}</span></div>`).join('')}</div><p class="note">Dark: contacted · green: replies, by week.</p>` : '<p class="note">Results appear after your first sends.</p>'}
      ${(R.funnel || []).some(x => x.n) ? `<div class="ofunnel" data-testid="out-funnel">${R.funnel.map(x => `<div><b>${x.n}</b><span>${esc(x.label)}</span></div>`).join('')}</div>` : ''}
      ${(R.tests || []).length ? `<div class="obys" data-testid="out-tests">${R.tests.map(t => `<div><b>${esc(t.name)}</b>${t.rows.map(x => `<span>${esc(x.key)}: ${x.positive} positive of ${x.sent}${x.range ? ` (${x.range[0]}–${x.range[1]}%)` : ''}</span>`).join('')}</div>`).join('')}</div><p class="note">Positive replies by test. Ranges are wide until each row has 20+ sends; don't read much into small differences.</p>` : ''}
      ${R.byChannel.length || R.bySignal.length ? `<div class="obys">${R.byChannel.length ? `<div><b>By channel</b>${R.byChannel.map(x => `<span>${esc(x.key)}: ${x.replied}/${x.sent}${x.rate != null ? ` (${x.rate}%)` : ''}</span>`).join('')}</div>` : ''}${R.bySender.length ? `<div><b>By sender</b>${R.bySender.map(x => `<span>${esc(x.key)}: ${x.replied}/${x.sent}</span>`).join('')}</div>` : ''}${R.bySignal.length ? `<div><b>Openers that get replies</b>${R.bySignal.slice(0, 5).map(x => `<span>${esc(x.key)}: ${x.rate}% of ${x.sent}</span>`).join('')}</div>` : ''}</div>` : ''}
    </details>${B0.length ? '' : '-->'}
    ${list('Needs you', needs, 'Replies to answer, drafts to approve, follow-ups that are due, and calls to confirm.', reviews.length > 1 ? `<button class="sm" id="oqueue" data-testid="out-queue">Review ${reviews.length} drafts one by one</button>` : '')}
    ${writing.length ? list('Writing', writing, 'Two are written at a time; this page updates by itself.') : ''}
    ${list('Sent, waiting for a reply', waiting)}
    ${list('Finished', done)}
    <details class="card odet" data-testid="out-senders" ${setupGaps.length && B0.some(x => x.phase === 'review') ? 'open' : ''}><summary class="h2">Inboxes and settings <span class="h2s">AION sends only from the Gmail accounts you connect here</span></summary>
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
        <label class="wide">Your background <span class="note">one line; notes may say this about you and nothing more</span><input name="background" value="${esc(S.settings.background || '')}" data-testid="out-background"></label>
        <label class="wide">How a deal would be paid for <span class="note">used only in letters, call notes and replies to an interested owner, never in a first email; never says money is already committed</span><input name="funding" value="${esc(S.settings.funding || '')}" data-testid="out-funding"></label>
        <label>Daily limit per sender<input name="dailyCap" inputmode="numeric" value="${esc(S.settings.dailyCap)}"></label>
        <label>Follow-ups after (days)<input name="followUpDays" value="${esc(S.settings.followUpDays.join(', '))}"></label>
        <div class="wide"><button type="submit">Save</button> <span class="note">${S.suppressed} address${S.suppressed === 1 ? '' : 'es'} asked not to be contacted</span></div>
      </form>
    </details>
  </div>`;
  const $$ = s => O.main.querySelectorAll(s), q = s => O.main.querySelector(s);
  $$('[data-inbox]').forEach(b => b.onclick = () => { O.inbox = O.inbox === b.dataset.inbox ? null : b.dataset.inbox; draw(); });
  $$('[data-open]').forEach(el => el.onclick = () => { O.view = 'item'; O.id = el.dataset.open; O.kind = null; O.queue = reviews.some(x => x.id === el.dataset.open) ? reviews.map(x => x.id) : null; draw(); }); // a draft opened from the list still shows “1 of N”
  $$('[data-write]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); const [search, entity] = b.dataset.write.split('|'); b.disabled = true; b.textContent = 'Writing…'; try { const r = await api('outreach/create', { search, entity }); O.view = 'item'; O.id = r.id; O.kind = 'email'; draw(); } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = 'Write outreach'; } });
  q('#oopenset') && (q('#oopenset').onclick = () => { const d = q('[data-testid="out-senders"]'); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  q('#oqueue') && (q('#oqueue').onclick = () => { O.queue = reviews.map(x => x.id); O.view = 'item'; O.id = O.queue[0]; O.kind = null; draw(); });
  $$('[data-conn]').forEach(b => b.onclick = async () => { try { const r = await api('outreach/connect', { email: b.dataset.conn }); if (r.url) { window.open(r.url, '_blank'); toast(`Sign in as ${b.dataset.conn} in the browser tab and allow Gmail and Calendar, then come back.`); pollAccounts(); } else draw(); } catch (e) { toast(e.message, 'err'); } });
  $$('[data-disc]').forEach(b => b.onclick = async () => { if (!confirm(`Disconnect ${b.dataset.disc}? AION won’t be able to send from it or see replies.`)) return; await api('outreach/disconnect', { email: b.dataset.disc }); draw(); });
  $$('[data-default]').forEach(b => b.onclick = async () => { await api('outreach/settings', { defaultSender: b.dataset.default }); draw(); });
  q('#oset').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try { await api('outreach/settings', { ...Object.fromEntries(f), followUpDays: String(f.get('followUpDays')).split(/[ ,]+/).filter(Boolean).map(Number) }); toast('Saved'); draw(); } catch (e) { toast(e.message, 'err'); } };
  if (writing.length) O.timer = setTimeout(draw, 3000);
}

function pollAccounts(n = 0) { const before = JSON.stringify(O.st?.accounts || []); O.timer = setTimeout(async () => { const s = await api('outreach/state').catch(() => null); if (s && JSON.stringify(s.accounts) !== before) { toast(`Connected ${s.accounts.at(-1)?.email || ''}`); return draw(); } if (n < 60) pollAccounts(n + 1); }, 3000); }

async function drawItem() {
  clearTimeout(O.timer); document.body.dataset.outview = 'item';
  try { O.it = await api(`outreach/item?id=${encodeURIComponent(O.id)}`); } catch (e) { O.view = 'board'; toast(e.message, 'err'); return draw(); }
  const it = O.it, S = O.st || await api('outreach/state');
  const qpos = O.queue ? O.queue.indexOf(it.id) : -1, nextQ = qpos >= 0 ? O.queue[qpos + 1] : null;
  if (it.phase === 'writing') {
    // live progress, so it never looks stuck: which step, how long so far, and that you can leave
    const t0 = Date.parse(it.startedAt || it.queuedAt || it.created), secs = Math.max(0, Math.round((Date.now() - t0) / 1000));
    const queued = !it.startedAt, el = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s`;
    const step = (on, done, t) => `<li class="${done ? 'done' : on ? 'on' : ''}">${done ? '✓' : on ? '<span class="spin"></span>' : '·'} ${t}</li>`;
    O.main.innerHTML = `<div class="ps" data-testid="out-writing"><button class="ghost sm" id="oback">← Back</button><h1>${esc(it.name)}</h1>
      <p class="lede2">${queued ? 'Waiting for a turn: two firms are written at a time.' : `Writing personal drafts from ${it.signals.length} signals · ${el}`}</p>
      <ol class="wsteps">${step(false, true, `Gathered ${it.signals.length} signals about ${esc(it.name)}`)}${step(!queued && it.step !== 'email', it.step === 'email', 'AI writes the first email, 2 follow-ups, a letter, call notes and a discreet note for their shared inbox')}${step(it.step === 'email', false, 'Checks every name and number against the signals, then looks for an email on their own site')}</ol>
      <p class="note">Usually 30–90 seconds. ${secs > 240 ? 'Taking longer than usual; it stops itself at 5 minutes and you can write it again. ' : ''}You can go back and keep working; it carries on and shows up under “Needs you” when ready.</p></div>`;
    O.main.querySelector('#oback').onclick = back; O.timer = setTimeout(drawItem, 1000); return;
  }
  const avail = KINDS.filter(([k]) => it.drafts?.[k]);
  if (!O.kind || !it.drafts?.[O.kind]) O.kind = it.replied && it.drafts?.answer ? 'answer' : (it.messages.some(m => m.kind === 'email') ? (it.messages.some(m => m.kind === 'followup1') ? 'followup2' : 'followup1') : 'email'); // no address yet: the email view explains it and offers Find contact details, with letter or call as alternatives
  if (!it.drafts?.[O.kind]) O.kind = avail[0]?.[0] || 'email';
  const d = it.drafts?.[O.kind], sent = it.messages.find(m => m.kind === O.kind && m.sentAt), pf = it.preflight?.[O.kind];
  const used = new Set(d?.used || []);
  const noteSend = O.kind === 'form' && it.preflight?.form && !it.preflight.form.problems.some(p => /only to a shared inbox|already emailed/.test(p));
  const sendable = ['email', 'followup1', 'followup2'].includes(O.kind) || noteSend, noGmail = sendable && !(O.st?.accounts || []).some(x => !x.error), manual = ['letter', 'call'].includes(O.kind) || (O.kind === 'form' && !noteSend);
  const accts = S.accounts.filter(a => !a.error).map(a => a.email);
  const talking = !!it.replied || it.phase === 'conversation' || !!it.call;
  if (!O.slots && !it.call && it.replied?.picked) O.slots = { slots: [it.replied.picked, ...(it.offered || []).filter(x => x.start !== it.replied.picked.start)], note: `${it.toName || 'They'} picked ${it.replied.picked.label} in their reply. Send the invite to confirm it.` };
  const D = it.docs || {};
  const docBox = (kind, title, what, btn) => `<li class="ostep" data-testid="out-doc-${kind}"><div><b>${title}</b><span class="note">${what}</span></div>
      ${D[kind] ? `<textarea class="obody" data-doc="${kind}" rows="${kind === 'request' ? 12 : 14}">${esc(D[kind].body)}</textarea>
      <div class="oacts"><button class="ghost sm" data-docsave="${kind}">Save edits</button>${kind !== 'request' ? `<a class="btnlink" href="/api/outreach/pdf?id=${encodeURIComponent(it.id)}&kind=${kind}">Download PDF</a>` : ''}<button class="sm" data-docsend="${kind}" ${it.to ? '' : 'disabled'}>${kind === 'request' ? 'Send the request…' : 'Email it with the PDF…'}</button>${D[kind].sentAt ? `<span class="note">sent ${day(D[kind].sentAt)}</span>` : ''}</div>` : `<button class="sm" data-docmake="${kind}">${btn}</button>`}</li>`;
  // ---- where things stand, in plain words ----
  const anySent = it.messages.some(m => m.sentAt), lastSent = it.messages.filter(m => m.sentAt).slice(-1)[0];
  const toInfo = (it.contacts.emails || []).find(c => c.email === it.to), toGuess = !!(it.to && toInfo && !toInfo.verified && toInfo.likely);
  const guesses = (it.contacts.emails || []).filter(c => c.likely && !c.verified && c.email !== it.to);
  const needEmail = !anySent && (!it.to || it.addr?.block), phones = [...new Set(it.contacts.other.filter(c => c.kind === 'phone').map(c => c.value.replace(/\D/g, '')))];
  const KNAME = Object.fromEntries(KINDS), sch = Object.entries(it.scheduled || {})[0];
  const SENTWORD = { email: 'First email sent', followup1: 'Follow-up 1 sent', followup2: 'Follow-up 2 sent', letter: 'Letter marked as mailed', call: 'Call marked done', form: 'Contact form note sent', answer: 'Reply sent' };
  const status = it.phase === 'failed' ? ['bad', 'The drafts could not be written'] : it.replied?.kind === 'optout' ? ['bad', 'Asked not to be contacted'] : it.replied ? ['act', 'They replied: answer them'] : it.call ? ['ok', `Call booked for ${when(it.call.start)}`]
    : sch ? ['ok', `${KNAME[sch[0]] || 'Email'} scheduled for ${when(sch[1].at)}${sch[1].held ? ' (on hold)' : ''}`] : anySent ? ['ok', `${SENTWORD[lastSent.kind] || 'Sent'} ${day(lastSent.sentAt)}${lastSent.manual ? ' (marked by you)' : ''}`]
    : it.downloads?.letter && O.kind === 'letter' ? ['act', `Letter downloaded ${day(it.downloads.letter)} · not marked as mailed yet`]
    : needEmail ? ['act', it.addr?.block ? 'Needs the owner’s own email address' : 'Needs an email address'] : toGuess ? ['act', 'Draft ready · email address not verified'] : ['act', 'Draft ready to review'];
  const whyLine = String(it.why || '').split(/(?<=[.!?])\s/)[0];
  const contactLine = [it.toName, it.to ? `${it.to}${toGuess ? ' (a guess, not verified)' : toInfo?.verified ? ' (verified)' : ''}` : 'no email address yet', phones.length ? `${phones.length} phone number${phones.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  // the one issue that needs you before this can go, if any (shown above the message)
  const facts = (d?.check || []).filter(x => !/^Also in an email to another firm/.test(x)), dup = (d?.check || []).filter(x => /^Also in an email to another firm/.test(x));
  const issue = sent ? '' : needEmail && sendable ? `<div class="oissue" data-testid="out-issue"><b>${it.addr?.block ? `${esc(it.to)} is a shared inbox, so a note about selling can’t go there.` : 'There is no verified email address for this company.'}</b>
      <p>${guesses.length ? `AION guessed <b>${esc(guesses[0].email)}</b> from ${esc(plainSrc(guesses[0].source))}. That is a guess, not a confirmed address, so it isn’t used unless you choose it. ` : ''}Press <b>Find contact details</b> to read their website and public sources for the owner’s address. You can also mail a letter${phones.length ? ' or call' : ''} instead.</p></div>`
    : toGuess && sendable ? `<div class="oissue" data-testid="out-issue"><b>${esc(it.to)} is a guess, not a verified address.</b><p>It came from ${esc(plainSrc(toInfo.source))}. If it’s wrong the email bounces and AION tells you. Press <b>Find contact details</b> to look for a confirmed one first.</p></div>`
    : facts.length ? `<div class="oissue" data-testid="out-check"><b>Check before sending:</b> ${facts.map(esc).join(', ')} ${facts.length === 1 ? 'isn’t' : 'aren’t'} in what AION found about them. Fix or remove ${facts.length === 1 ? 'it' : 'them'}, or confirm ${facts.length === 1 ? 'it' : 'them'} yourself.</div>`
    : sendable && pf && !pf.ok && !noGmail && pf.problems.length ? `<div class="oissue" data-testid="out-problems"><b>Before this can send:</b><ul>${pf.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '';
  // the one recommended next step, and quiet alternatives
  const letterAlt = it.drafts?.letter ? '<button class="ghost" data-kind="letter">Write a letter instead</button>' : '', callAlt = it.drafts?.call && phones.length ? '<button class="ghost" data-kind="call">Call instead</button>' : '';
  const primary = sent ? '' : O.kind === 'answer' ? '<button id="oansend" data-testid="out-answer-send">Send reply…</button>'
    : sendable && (needEmail || toGuess) ? `<button id="ofind" data-testid="out-find">Find contact details</button>${needEmail ? `${letterAlt}${callAlt}` : '<button class="ghost" id="osend" data-testid="out-send">Send to this guess anyway…</button>'}`
    : sendable && noGmail ? '<button id="ocopy" data-testid="out-copy">Copy email</button><button class="ghost" id="omark" data-testid="out-mark-email">I sent it myself</button>'
    : sendable ? `<button id="osend" ${pf?.ok ? '' : 'disabled'} data-testid="out-send">Send…</button>`
    : O.kind === 'letter' ? `<a class="btnlink primary" href="/api/outreach/pdf?id=${encodeURIComponent(it.id)}&kind=letter" id="oletter" data-testid="out-letter-pdf">Download letter PDF</a><button class="ghost" id="omark" data-testid="out-mark">Mark letter as mailed</button>`
    : O.kind === 'call' ? '<button id="omark" data-testid="out-mark">Mark as called</button><button class="ghost" id="ocopy">Copy call notes</button>'
    : O.kind === 'form' ? `${it.contacts.other.find(c => c.kind === 'contact_page') ? `<a class="btnlink primary" href="${safeUrl(it.contacts.other.find(c => c.kind === 'contact_page').value)}" target="_blank" rel="noreferrer" data-testid="out-formlink">Open their contact form</a>` : ''}<button class="ghost" id="ocopy">Copy note</button><button class="ghost" id="omark" data-testid="out-mark">Mark form sent</button>` : '';
  const after = sent ? '' : O.kind === 'email' ? `After you send it, follow-ups are ready ${(S.settings.followUpDays || [4, 10]).join(' and ')} days later; a reply stops them.` : O.kind === 'followup1' || O.kind === 'followup2' ? 'A reply from them cancels the remaining follow-ups.' : O.kind === 'letter' ? 'Downloading the PDF does not count as sent: press “Mark letter as mailed” once it’s in the post.' : '';
  const others = avail.filter(([k]) => k !== O.kind);
  const more = `<details class="omore" data-testid="out-more"><summary>More options</summary><div class="omenu">
      ${others.length ? `<p class="note">Other formats</p>${others.map(([k, l]) => `<button class="ghost sm" data-kind="${k}">${l}${it.messages.some(m => m.kind === k && m.sentAt) ? ' ✓' : ''}</button>`).join('')}` : ''}
      ${it.mode === 'target' && !THESIS.firm && !anySent ? `<p class="note">Offer</p><div class="seg offers" data-testid="out-offer">${OFFERS.filter(k => k !== 'partner' || it.pitch === 'partner').map(k => `<button data-pitch="${k}" class="${(it.pitch === 'sale' ? 'full' : it.pitch) === k ? 'on' : ''}" title="${esc(PITCH_LONG[k])}">${PITCH[k]}</button>`).join('')}</div>` : ''}
      ${guesses.length && !sent ? `<p class="note">Unverified guesses</p>${guesses.map(c => `<button class="ghost sm" data-uselikely="${esc(c.email)}" data-testid="out-likely">Use ${esc(c.email)} (not verified)</button>`).join('')}` : ''}
      ${sendable && !sent && !noGmail && !needEmail ? `<p class="note">Sending</p><button class="ghost sm" id="ogdraft" ${pf?.problems?.some(p => /connect|address|recipient/i.test(p)) ? 'disabled' : ''}>Save to Gmail Drafts (doesn’t send)</button>` : ''}
      ${SCHEDULABLE.includes(O.kind) && !sent && !noGmail && !needEmail && !it.scheduled?.[O.kind] ? `<p class="oschedule"><label>Send later <input type="datetime-local" id="oat" value="${defaultAt(it, O.kind, O.st?.settings?.followUpDays)}" data-testid="out-at"></label> <button class="ghost sm" id="osched" data-testid="out-schedule">Schedule…</button></p>` : ''}
      ${it.addr?.block && it.drafts?.form && !anySent ? `<button class="ghost sm" id="onote">Write the discreet note to ${esc(it.to)} (no mention of buying)</button>` : ''}
      <p class="note">This company</p><button class="ghost sm" id="orewrite2">Write the drafts again</button>
      ${anySent ? '<button class="ghost sm" id="ofinish">Finish (no more follow-ups)</button>' : '<button class="ghost sm" id="odel">Delete this outreach</button>'}
    </div></details>`;
  const fields = d && !sent && (sendable || O.kind === 'answer') ? `<div class="ofields">
      ${accts.length > 1 || it.messages.some(m => m.threadId) ? `<label>From${it.messages.some(m => m.threadId) ? `<input value="${esc(it.sender)}" disabled title="This conversation is in this account’s Gmail">` : `<select id="ofrom">${[...new Set([it.sender, ...accts])].filter(Boolean).map(e => `<option ${e === it.sender ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>`}</label>` : ''}
      <label>To${it.contacts.emails.length > 1 ? `<select id="oto">${it.contacts.emails.map(c => `<option value="${esc(c.email)}" ${c.email === it.to ? 'selected' : ''}>${esc(c.name ? `${c.name} <${c.email}>` : c.email)}${c.verified ? ' (verified)' : c.likely ? ' (guess, not verified)' : ''}</option>`).join('')}</select>` : `<input id="oto" value="${esc(it.to)}" placeholder="${needEmail ? 'No verified address yet' : 'name@company.com'}" data-testid="out-to">`}</label>
      ${O.kind === 'email' ? `<label class="wide">Subject<input id="osubj" value="${esc(d.subject)}" data-testid="out-subject"></label>` : ''}</div>` : '';
  O.main.innerHTML = `<div class="ps oitem" data-testid="out-item">
    <div class="otop"><button class="ghost sm" id="oback">← Back to Search &amp; Outreach</button>${qpos >= 0 ? `<span class="oprog" data-testid="out-progress">Review outreach · ${qpos + 1} of ${O.queue.length}</span>${nextQ ? '<button class="ghost sm" id="onextq">Skip to next →</button>' : ''}` : ''}</div>
    <div class="pshead"><h1>${esc(it.name)}</h1><p class="note ocontact" data-testid="out-contact">${esc(contactLine)}</p>
      <p class="ostatus ${status[0]}" data-testid="out-status">${esc(status[1])}</p>
      ${whyLine ? `<p class="owhy">${esc(whyLine)}</p>` : ''}</div>
    ${it.phase === 'failed' ? `<p class="warnline">${esc(it.status)} <button class="sm" id="orewrite" data-testid="out-rewrite">Write the drafts again</button></p>` : ''}
    ${it.replied ? `<section class="card" data-testid="out-reply"><h2 class="h2">Their reply <span class="h2s">${esc(it.replied.from)} · ${day(it.replied.at)} · ${esc(RKIND[it.replied.kind] || it.replied.kind)}</span></h2><pre class="obody">${esc(it.replied.text)}</pre>
      ${it.drafts?.answer ? '' : `<button id="oanswer" data-testid="out-answer">Draft my reply${it.replied.kind !== 'later' ? ' with my open times' : ''}</button>`}</section>` : ''}
    <section class="card omsg" data-testid="out-message">
      <div class="omsghead"><h2 class="h2">${esc(KNAME[O.kind] || 'Message')}</h2>${more}</div>
      ${issue}
      ${sent ? `<p class="ostatus ok" data-testid="out-sent">${sent.manual ? `${esc(SENTWORD[O.kind] || 'Marked done')} ${day(sent.sentAt)}${sent.note ? `: ${esc(sent.note)}` : ''}` : `Email sent ${day(sent.sentAt)} from ${esc(sent.from)} to ${esc(sent.to)}`}</p><pre class="obody">${esc(sent.body || d?.body || '')}</pre>`
      : d ? `${fields}<textarea id="obody" class="obody" rows="${O.kind === 'letter' ? 16 : 12}" data-testid="out-body" aria-label="${esc(KNAME[O.kind] || 'Message')} text">${esc(O.unsaved?.[it.id + O.kind] ?? d.body)}</textarea>
        <div class="osaveline"><span id="osaved" class="note" aria-live="polite" data-testid="out-saved">${O.savedAt?.[it.id + O.kind] ? `Draft saved ${clock(O.savedAt[it.id + O.kind])}` : 'Edits save automatically'}</span>${sendable || O.kind === 'answer' ? '<span class="note">Your signature, mailing address and a one-line opt-out are added when it sends.</span>' : ''}</div>
        ${dup.length ? `<p class="note" data-testid="out-dup">Tip: “${esc(dup[0].replace(/^Also in an email to another firm: /, '').replace(/[“”]/g, ''))}” also appears in an email to another firm; consider making it more personal.</p>` : ''}
        ${it.scheduled?.[O.kind] ? `<p class="oschedule" data-testid="out-scheduled">⏱ Scheduled for <b>${esc(when(it.scheduled[O.kind].at))}</b> from ${esc(it.sender)}${it.scheduled[O.kind].held ? ` <span class="warnline sm">On hold: ${esc(it.scheduled[O.kind].held)}</span>` : ''} <button class="ghost sm" id="ounsched">Cancel the scheduled send</button></p>` : ''}
        <div class="oacts oprimary">${primary}</div>
        ${noGmail && !needEmail && !toGuess ? `<p class="note" data-testid="out-nogmail">Gmail isn’t connected, so AION can’t send this. Copy it into your own email, send it, then press <b>I sent it myself</b>. Or connect Gmail under <span class="link" id="ogoset">Inboxes and settings</span>.</p>` : ''}
        ${sendable && pf?.warn ? `<p class="note" data-testid="out-warn">${esc(pf.warn)}</p>` : ''}
        ${after ? `<p class="note">${esc(after)}</p>` : ''}` : '<p class="empty">No draft for this.</p>'}
    </section>
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
      <div class="ostage"><span class="note">Deal stage:</span>${DEAL_STAGES.filter(([k]) => k !== 'contacted').map(([k, l]) => `<button class="ghost sm ${it.stage === k ? 'on' : ''}" data-stage="${k}">${l}</button>`).join('')}</div></section>` : ''}
    <details class="card odet2" data-testid="out-signals"><summary>Why this company · what AION found <span class="note">${it.signals.length} facts with sources · ${used.size} used in this draft</span></summary>
      ${it.why ? `<p>${esc(it.why)}</p>` : ''}
      <ul class="osiglist">${it.signals.map((x, i) => `<li class="${used.has(x.id) ? 'used' : ''}" ${i >= 10 && !used.has(x.id) && !O.allSig ? 'hidden' : ''}><span class="tagx">${esc(x.kind)}</span> ${esc(x.text)}${x.source ? ` <a href="${safeUrl(x.source)}" target="_blank" rel="noreferrer">source</a>` : ''}</li>`).join('')}</ul>
      ${it.signals.filter((x, i) => i >= 10 && !used.has(x.id)).length && !O.allSig ? `<button class="ghost sm more" id="oallsig">Show all ${it.signals.length}</button>` : ''}
      ${it.contacts.people.length || it.contacts.other.length ? `<h3>Contacts</h3><ul>${it.contacts.people.map(p => `<li>${esc(p.name)}${p.title ? `, ${esc(p.title)}` : ''}</li>`).join('')}${it.contacts.other.map(c => `<li>${esc(c.kind.replace('_', ' '))}: ${/^https?:/.test(c.value) ? `<a href="${safeUrl(c.value)}" target="_blank" rel="noreferrer">${esc(c.value)}</a>` : esc(c.value)}</li>`).join('')}</ul>` : ''}</details>
    ${it.qc ? `<details class="card odet2" data-testid="out-qc"><summary>Quality check ${it.qc.avg ? `${it.qc.avg}/5` : ''} <span class="note">a second reader’s scores and suggestions${it.qc.lowConfidence ? ' · low confidence' : ''}</span></summary>
      ${it.qc.lowConfidence ? '<p class="warnline sm">Low confidence: AION found too little that is specific to them. Add a real detail you know, or research more before sending.</p>' : ''}
      ${it.qc.scores ? `<p class="note">${Object.entries(it.qc.scores).map(([k, v]) => `${esc(k)} ${+v}`).join(' · ')}</p>` : ''}${(it.qc.issues || []).length ? `<ul>${it.qc.issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${it.type ? `<p class="note">Kind of note: <b>${esc(TYPE_LABEL[it.type] || it.type)}</b></p>` : ''}</details>` : ''}
    <details class="card odet2" data-testid="out-history"><summary>History <span class="note">${it.log.length} events · sends from ${esc(it.sender || 'no inbox yet')}</span></summary><ul class="olog">${it.log.slice().reverse().map(l => `<li><span class="note">${day(l.at)}</span> ${esc(l.text)}</li>`).join('')}</ul></details>
  </div>`;
  const q = s => O.main.querySelector(s), $$ = s => O.main.querySelectorAll(s);
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); drawItem(); } catch (e) { toast(e.message, 'err'); drawItem(); } };
  // ---- edits save themselves: "Saving…", then "Draft saved 2:31 PM"; a failed save keeps your text and says so ----
  O.savedAt ||= {}; O.unsaved ||= {};
  const key = it.id + O.kind, line = q('#osaved'); let tmr = null;
  const setLine = (t, err) => { if (line) { line.textContent = t; line.className = 'note' + (err ? ' err' : ''); } };
  const edits = () => ({ id: it.id, kind: O.kind, body: q('#obody')?.value, ...(q('#osubj') ? { subject: q('#osubj').value } : {}), ...(q('#oto') ? { to: q('#oto').value } : {}), ...(q('#ofrom') ? { sender: q('#ofrom').value } : {}) });
  const saveEdits = async () => { clearTimeout(tmr); if (!q('#obody')) return; setLine('Saving…');
    try { await api('outreach/edit', edits()); delete O.unsaved[key]; O.savedAt[key] = Date.now(); setLine(`Draft saved ${clock(Date.now())}`); }
    catch (e) { O.unsaved[key] = q('#obody').value; setLine(`Couldn’t save (${e.message}). Your text is kept here; it tries again as you type.`, true); throw e; } };
  O.flush = () => (tmr || O.unsaved[key] !== undefined ? saveEdits().catch(() => {}) : Promise.resolve());
  O.pendingSave = () => !!tmr || O.unsaved[key] !== undefined;
  ['#obody', '#osubj'].forEach(sel => q(sel) && q(sel).addEventListener('input', () => { setLine('Unsaved changes…'); clearTimeout(tmr); tmr = setTimeout(() => saveEdits().catch(() => {}), 800); }));
  if (O.unsaved[key] !== undefined) setLine('Not saved yet: your earlier edits are kept here. Keep typing to save them.', true);
  const leave = async fn => { await O.flush(); fn(); };
  // one confirm flow at a time: a second click while the first is still checking or waiting for your OK does nothing
  const guard = fn => async ev => { const el = ev.currentTarget; if (el.disabled) return; el.disabled = true; try { await fn(ev); } finally { el.disabled = false; } };
  q('#oback').onclick = () => leave(back);
  q('#onextq') && (q('#onextq').onclick = () => leave(() => { O.id = nextQ; O.kind = null; O.slots = null; drawItem(); }));
  $$('[data-pitch]').forEach(b => b.onclick = () => { if (b.classList.contains('on')) return; act(() => api('outreach/rewrite', { id: it.id, pitch: b.dataset.pitch }), `Rewriting every draft as ${PITCH[b.dataset.pitch].toLowerCase()}`); });
  ['#orewrite', '#orewrite2'].forEach(sel => q(sel) && (q(sel).onclick = () => { if (sel === '#orewrite2' && !confirm('Write every draft for this company again? Your edits to the current drafts will be replaced.')) return; act(() => api('outreach/rewrite', { id: it.id }), 'Writing the drafts again: this takes about a minute'); }));
  q('#oallsig') && (q('#oallsig').onclick = () => { O.allSig = true; drawItem(); });
  $$('[data-kind]').forEach(b => b.onclick = () => leave(() => { O.kind = b.dataset.kind; drawItem(); }));
  q('#oletter') && q('#oletter').addEventListener('click', () => { setTimeout(() => drawItem(), 1500); toast('Letter PDF downloaded. It is not marked as mailed until you press “Mark letter as mailed”.'); });
  q('#osched') && (q('#osched').onclick = guard(async () => {
    try { await saveEdits(); const at = q('#oat').value; const p = await api('outreach/confirm', { id: it.id, action: 'schedule', kind: O.kind, at }); if (!p.ok) { toast(p.problems[0], 'err'); return drawItem(); }
      if (!confirm(`Schedule this for ${when(p.at)}?\n\nFrom: ${p.from}\nTo: ${p.to}\nSubject: ${p.subject}\n\n${p.body}`)) return;
      await api('outreach/schedule', { id: it.id, kind: O.kind, at, token: p.token }); toast(`Scheduled for ${when(p.at)}`); drawItem(); } catch (e) { toast(e.message, 'err'); } }));
  q('#ounsched') && (q('#ounsched').onclick = () => act(() => api('outreach/unschedule', { id: it.id, kind: O.kind }), 'Cancelled'));
  ['#oto', '#ofrom'].forEach(s => q(s) && (q(s).onchange = () => act(saveEdits)));
  q('#ofind') && (q('#ofind').onclick = ev => { ev.target.disabled = true; ev.target.textContent = 'Looking…'; act(() => api('outreach/find-email', { id: it.id }), 'Done: see the address above'); });
  q('#onote') && (q('#onote').onclick = () => { O.kind = 'form'; draw(); });
  O.main.querySelectorAll('[data-uselikely]').forEach(b => b.onclick = () => act(() => api('outreach/edit', { id: it.id, to: b.dataset.uselikely }), 'Using the likely address. Read the draft before sending.'));
  q('#osend') && (q('#osend').onclick = guard(async () => {
    try { await saveEdits(); const p = await api('outreach/confirm', { id: it.id, action: 'step', kind: O.kind }); if (!p.ok) { toast(p.problems[0], 'err'); return drawItem(); }
      if (!confirm(`Send this email now?\n\nFrom: ${p.from}\nTo: ${p.to}\nSubject: ${p.subject}\n\n${p.body.slice(0, 1200)}${p.check.length ? `\n\nCheck: ${p.check.join(', ')}` : ''}${p.warn ? `\n\nNote: ${p.warn}` : ''}`)) return;
      await api('outreach/send', { id: it.id, kind: O.kind, confirmed: true, token: p.token }); toast(`Sent to ${p.to}`); O.kind = null; if (nextQ) O.id = nextQ; drawItem(); } catch (e) { toast(e.message, 'err'); }
  }));
  q('#ogdraft') && (q('#ogdraft').onclick = () => act(async () => { await saveEdits(); await api('outreach/send', { id: it.id, kind: O.kind, confirmed: true, saveOnly: true }); }, `Saved to ${q('#ofrom')?.value || it.sender} Gmail Drafts. Nothing was sent.`));
  q('#ogoset') && (q('#ogoset').onclick = async () => { back(); for (let i = 0; i < 40; i++) { const d = document.querySelector('[data-testid="out-senders"]'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.querySelector('#onew')?.focus({ preventScroll: true }); return; } await new Promise(r => setTimeout(r, 100)); } });
  q('#ocopy') && (q('#ocopy').onclick = async () => { const subj = q('#osubj')?.value; await navigator.clipboard.writeText((subj ? `Subject: ${subj}\n\n` : '') + q('#obody').value).catch(() => {}); toast(subj ? 'Copied the subject and the email' : 'Copied'); });
  q('#omark') && (q('#omark').onclick = () => { const note = prompt(O.kind === 'call' ? 'How did the call go? (optional)' : 'Any note? (optional)'); if (note === null) return; act(async () => { await saveEdits(); await api('outreach/done', { id: it.id, kind: O.kind, note }); }, 'Marked done'); });
  q('#oanswer') && (q('#oanswer').onclick = ev => { ev.target.disabled = true; ev.target.textContent = 'Writing…'; act(async () => { await api('outreach/answer', { id: it.id }); O.kind = 'answer'; }); });
  q('#oansend') && (q('#oansend').onclick = async () => { try { await saveEdits(); const p = await api('outreach/confirm', { id: it.id, action: 'answer' }); if (!p.ok) { toast(p.problems[0], 'err'); return drawItem(); } if (!confirm(`Send your reply now?\n\nFrom: ${p.from}\nTo: ${p.to}\nSubject: ${p.subject}\n\n${p.body.slice(0, 1200)}`)) return; q('#oansend').disabled = true; await api('outreach/answer-send', { id: it.id, confirmed: true, token: p.token }); O.kind = null; toast('Reply sent'); drawItem(); } catch (e) { toast(e.message, 'err'); } });
  q('#oloadslots') && (q('#oloadslots').onclick = ev => { ev.target.disabled = true; ev.target.textContent = 'Checking your calendars…'; act(async () => { O.slots = await api('outreach/slots'); }); });
  q('#orebook') && (q('#orebook').onclick = () => act(async () => { O.slots = await api('outreach/slots'); await api('outreach/edit', { id: it.id, clearCall: true }); }));
  q('#obook') && (q('#obook').onclick = guard(async () => {
    const custom = q('#ocustom').value, start = custom ? new Date(custom).toISOString() : O.main.querySelector('input[name=oslot]:checked')?.value;
    if (!start) return toast('Show your open times and pick one, or type another time.', 'err');
    let p; try { p = await api('outreach/confirm', { id: it.id, action: 'invite', start }); } catch (e) { return toast(e.message, 'err'); } if (!p.ok) return toast(p.problems[0], 'err');
    if (!confirm(`Send a calendar invite to ${p.to} from ${p.from} for ${when(start)} (${S.settings.callMinutes || 30} minutes, with a Google Meet link)?`)) return;
    act(async () => { await api('outreach/book', { id: it.id, start, confirmed: true, token: p.token }); O.slots = null; }, 'Invite sent');
  }));
  $$('[data-stage]').forEach(b => b.onclick = () => { const note = prompt('Note for the deal history (optional)'); if (note === null) return; act(() => api('outreach/stage', { id: it.id, stage: b.dataset.stage, note }), 'Deal stage updated'); });
  $$('[data-docmake]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Writing…'; act(() => api('outreach/doc', { id: it.id, kind: b.dataset.docmake })); });
  $$('[data-docsave]').forEach(b => b.onclick = () => act(() => api('outreach/doc-edit', { id: it.id, kind: b.dataset.docsave, body: q(`[data-doc="${b.dataset.docsave}"]`).value }), 'Saved'));
  $$('[data-docsend]').forEach(b => b.onclick = async () => { const k = b.dataset.docsend; try { await api('outreach/doc-edit', { id: it.id, kind: k, body: q(`[data-doc="${k}"]`).value }); const p = await api('outreach/confirm', { id: it.id, action: 'doc', kind: k }); if (!p.ok) { toast(p.problems[0], 'err'); return drawItem(); } if (!confirm(`Email the ${k === 'request' ? 'books request' : `${D[k].title} as a PDF`} to ${p.to} from ${p.from}?`)) return; b.disabled = true; b.textContent = 'Sending…'; await api('outreach/doc-send', { id: it.id, kind: k, confirmed: true, token: p.token }); toast('Sent'); drawItem(); } catch (e) { toast(e.message, 'err'); drawItem(); } });
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
window.addEventListener('beforeunload', e => { if (typeof O !== 'undefined' && O.pendingSave?.()) { e.preventDefault(); e.returnValue = ''; } });
function back() { O.view = 'board'; O.id = null; O.allSig = false; O.slots = null; O.queue = null; draw(); }
