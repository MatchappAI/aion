// Outreach, end to end, inside AION: pick a firm (or person) from a search → AION gathers every signal it has →
// the AI writes a first email, two follow-ups, a letter, call notes and a contact-form message, each personal to them
// and built only from those signals → you edit and choose the sender → you approve each send → replies, bounces and
// opt-outs are picked up from Gmail → the deal pipeline moves. Nothing is ever sent without your explicit OK.
import fs from 'node:fs'; import path from 'node:path';
import { runTools, parseJson } from '../search/runner.mjs';
import { THESIS, SUBSECTORS } from '../thesis.mjs';
import { keyOf, known, dealOf, setStage } from '../search/memory.mjs';
import { warm } from '../search/contacts.mjs';
import { timing } from '../search/timing.mjs';
import * as gmail from './gmail.mjs';
import { siteContacts } from './sitecontacts.mjs';
import { rankOne, ownerOf } from '../search/rank.mjs';

let FILE = null;
// your sending accounts come from .env (AION_SENDERS=first@x.com,second@y.com; the first is the default), never from the code
const SENDERS = () => String(process.env.AION_SENDERS || '').split(',').map(x => x.trim().toLowerCase()).filter(x => /@/.test(x));
const DEFAULTS = { get defaultSender() { return SENDERS()[0] || ''; }, get senders() { return SENDERS(); }, name: process.env.AION_NAME || '', title: 'Founder, AION', phone: '', signature: '', address: '', dailyCap: 20, followUpDays: [4, 10], legalName: 'AION', governingLaw: 'Virginia', tz: 'America/New_York', hours: [9, 17], callMinutes: 30 };
let DB = { settings: { ...DEFAULTS }, items: [], suppress: [] };
export function initOutreach(dir) {
  fs.mkdirSync(dir, { recursive: true }); FILE = path.join(dir, 'outreach.json');
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); DB = { ...DB, ...j, settings: { ...DEFAULTS, ...(j.settings || {}) } }; } catch {}
  gmail.initGmail(dir);
}
const save = () => fs.writeFileSync(FILE, JSON.stringify(DB, null, 1));
const now = () => new Date().toISOString();
const id = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const daysSince = iso => iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null;
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86_400_000).toISOString();

// senders and name fill in from .env when they are not set yet (a fresh install, or .env loaded after start)
export const settings = () => { const st = DB.settings; if (!st.senders?.length) st.senders = SENDERS(); if (!st.defaultSender) st.defaultSender = st.senders[0] || ''; if (!st.name) st.name = process.env.AION_NAME || ''; return st; };
export function setSettings(p) {
  const s = DB.settings, str = (v, n) => String(v ?? '').slice(0, n);
  for (const k of ['name', 'title', 'phone', 'legalName', 'governingLaw']) if (p[k] !== undefined) s[k] = str(p[k], 120);
  if (p.callMinutes !== undefined) s.callMinutes = [15, 20, 30, 45, 60].includes(+p.callMinutes) ? +p.callMinutes : 30;
  if (p.signature !== undefined) s.signature = str(p.signature, 1000);
  if (p.address !== undefined) s.address = str(p.address, 300);
  if (p.defaultSender !== undefined) s.defaultSender = str(p.defaultSender, 200).toLowerCase();
  if (p.dailyCap !== undefined) s.dailyCap = Math.max(1, Math.min(100, Math.round(+p.dailyCap || 20)));
  if (Array.isArray(p.followUpDays)) s.followUpDays = p.followUpDays.map(n => Math.max(1, Math.min(60, Math.round(+n)))).filter(Boolean).slice(0, 2);
  save(); return s;
}

// ---------- 1. every signal AION has on this firm or person ----------

const clean = t => String(t ?? '').replace(/\s+/g, ' ').trim();
const realName = n => n && !/surname not found|unknown|not (found|named)/i.test(n) ? n : null;
export function signalsFor(s, e) {
  const out = [], add = (kind, text, source = null) => { const t = clean(text); if (t && t.length > 3 && !out.some(x => x.text === t)) out.push({ id: `s${out.length + 1}`, kind, text: t.slice(0, 400), source }); };
  const cand = s.mode === 'candidate';
  if (cand) { add('who', `${e.name}${e.title ? `, ${e.title}` : ''}${e.employer ? ` at ${e.employer}` : ''}`); add('where', e.location); }
  else {
    add('company', `${e.company}${e.industry ? `: ${e.industry}` : ''}`, e.website || null);
    add('where', e.location);
    if (e.founded && /^\d{4}$/.test(String(e.founded))) add('history', `Founded in ${e.founded} (${new Date().getFullYear() - +e.founded} years in business)`);
    if (e.ownership && !/unknown/i.test(e.ownership)) add('ownership', `Ownership: ${e.ownership}`);
    if (e.size && !/unknown|not stated/i.test(e.size)) add('size', `Size: ${e.size}`);
    const owner = realName(e.owner) || (e.contacts || []).map(c => realName(c.name) && /owner|founder|president|ceo|principal|partner/i.test(c.title || '') ? `${c.name} (${c.title})` : null).find(Boolean);
    if (owner) add('owner', `Owner or leader: ${owner}`);
  }
  for (const f of e.verifiedFacts || []) add('fact', f.text, f.url);
  for (const f of e.signalsVerified || []) add('signal', f.text, f.url);
  if (e.timing?.whyNow) add('timing', `Why now: ${e.timing.whyNow}`);
  for (const t of e.timing?.signals || []) add('timing', t.text || t.label, t.url || null);
  for (const r of e.radar || []) add(r.direction === 'info' ? 'record' : 'radar', r.text, r.url || null);
  for (const c of (e.clientBook?.clients || []).slice(0, 6)) add('client', `Names ${c.name || c} as a client on its own site`, c.url || null);
  for (const b of (e.breakdown || []).filter(x => x.status === 'strong')) add('fit', `${b.label}: ${b.note || 'strong match'}`);
  for (const l of e.leadershipChanges || []) add('leadership', l.text || l, l.url || null);
  if (e.successorNamed && !/unknown|no/i.test(e.successorNamed)) add('succession', `Successor: ${e.successorNamed}`);
  if (e.angle) add('angle', `AION's angle: ${e.angle}`);
  if (e.summary) add('summary', e.summary);
  if (e.concern) add('unknown', `Still unknown: ${e.concern}`);
  const k = known(s, e); if (k) add('history', `Seen in ${k.searches} other AION search${k.searches === 1 ? '' : 'es'} since ${String(k.firstSeen).slice(0, 10)}`);
  const w = warm(s.mode, e); if (w) add('warm', `${w.you ? 'You are connected to them directly' : `You know ${w.count} ${w.count === 1 ? 'person' : 'people'} there: ${w.people.slice(0, 3).map(p => p.name).join(', ')}`} (your LinkedIn contacts)`);
  const d = dealOf(s, e); if (d?.stage) add('deal', `Deal stage: ${d.stage} since ${String(d.history.at(-1)?.at || '').slice(0, 10)}`);
  return out.slice(0, 40);
}

// which address reaches the owner: a named person, then a general inbox; never orders, support, billing or careers
const NOT_OWNER = /^(orders?|order-?support|support|help|helpdesk|billing|invoices?|accounts?|accounting|ap|ar|payments?|careers?|jobs|hr|recruit\w*|resumes?|press|media|pr|marketing|returns|shipping|customerservice|service|cs|privacy|legal|compliance|abuse|webmaster|admin|it|tech|sales-?ops|wholesale)@/i;
const GENERAL = /^(info|hello|hi|contact|office|team|inquir\w*|enquir\w*|general|partners?|partnerships?|bd|growth|sales|ceo|founder|owner|president)@/i;
export const emailRank = x => (x.name ? 0 : GENERAL.test(x.email) ? 1 : NOT_OWNER.test(x.email) ? 9 : 2);
export const bestEmail = list => [...(list || [])].filter(x => emailRank(x) < 9).sort((a, b) => emailRank(a) - emailRank(b))[0] || null;
/** Who to write to: verified emails first, then named people; never a guessed address. */
export function contactsFor(e) {
  const emails = (e.contactInfo || []).filter(c => c.kind === 'email' && /@/.test(c.value)).map(c => ({ name: c.person && c.person !== 'Company' ? c.person : null, email: c.value.trim().toLowerCase(), verified: !!c.verified, url: c.url })).sort((a, b) => emailRank(a) - emailRank(b));
  const people = (e.contacts || []).filter(c => realName(c.name)).map(c => ({ name: c.name, title: c.title || '', url: c.url }));
  const other = (e.contactInfo || []).filter(c => c.kind !== 'email').map(c => ({ kind: c.kind, value: c.value, url: c.url }));
  return { emails, people, other };
}

// ---------- 2. the drafts ----------

const PURPOSE = {
  target: 'introduce AION as a permanent, long-term owner who may want to buy and keep their firm one day, and ask for a short, no-pressure call with the owner',
  client: 'offer a specialized service to this company because of a concrete need its signals show, and ask for a short call with the right person',
  partner: 'propose a growth partnership: AION brings AI tools that cut proposal, report and research time plus introductions to clients, with no investment or sale needed from them; mention that AION is also a long-term owner only lightly, as something for later; ask for a short call with the owner',
  both: 'introduce AION and offer two ways to work together and let the owner choose: a growth partnership (AI tools that cut proposal, report and research time, plus introductions to clients and retailers, with no money changing hands) or, if they are thinking about what is next, AION as a permanent long-term owner who keeps the name, team and clients; ask for a short call to hear which fits them',
  candidate: 'tell this person about a specific role that fits their background and ask whether they are open to a short, confidential conversation'
};
export const draftPrompt = (mode, who, signals, me, sub, lean) => `You are writing outreach for ${me.name}${me.title ? `, ${me.title}` : ''}. ${mode === 'target' ? `AION: ${THESIS.short} ${THESIS.philosophy}` : ''}${sub ? ` Focus: ${sub}.` : ''}
Goal: ${(mode === 'target' && ['partner', 'both'].includes(lean) ? PURPOSE[lean] : PURPOSE[mode]) || PURPOSE.target}.
Recipient: ${who}.

SIGNALS (everything known about them; each has an id):
${signals.map(x => `[${x.id}] (${x.kind}) ${x.text}`).join('\n')}

RULES
- Personal to THIS recipient: open with something specific from the signals (their history, a fact, a timing sign), never a generic line.
- Use ONLY facts in the SIGNALS. Never invent numbers, names, clients, dates, compliments or mutual connections. If a signal says something is unknown, do not guess it.
- Never mention scores, AION's internal research, "signals", radar or that you looked them up in a tool.
- Plain, warm, respectful, no hype, no pressure, no buzzwords. Short sentences.
- email: subject under 8 words, body 70–130 words, one clear ask (a 15–20 minute call). No signature (added after).
- followup1 (sent if no reply after a few days): 40–70 words, adds one new specific detail from the signals, same thread.
- followup2 (last one): 30–50 words, polite close-the-loop, easy to say no.
- letter: a printed letter to the owner, 150–220 words, warmer and fuller.
- call: 4–6 short bullet points to say on a phone call, plus 2 questions to ask.
- form: 50–80 words for a website contact form.
- For each, list the signal ids you used.

Return JSON only:
{"email":{"subject":"","body":"","used":[]},"followup1":{"body":"","used":[]},"followup2":{"body":"","used":[]},"letter":{"body":"","used":[]},"call":{"body":"","used":[]},"form":{"body":"","used":[]},"why":"<one line: why this message fits them>"}`;

/** Numbers, years and capitalised names in a draft that no signal contains: shown as "check this" before sending. */
export function unsupported(text, signals, me) {
  const pool = (signals.map(s => s.text).join(' ') + ' ' + [me.name, me.title, me.phone, 'AION'].join(' ')).toLowerCase().replace(/(\d)\+/g, '$1');
  const out = new Set();
  // the ask itself ("a 15-minute call", "this week") is ours, not a claim about them
  const said = String(text).replace(/\b\d+(\s*(–|-|to|or)\s*\d+)?[\s-]*(minutes?|mins?|hours?)\b/gi, '');
  for (const m of said.match(/\$?\d[\d,.]*(?:\s?(?:%|k\b|m\b|million\b|years?\b))?/gi) || []) { const v = m.trim().replace(/[.,]$/, ''); const bare = v.toLowerCase().replace(/^\$/, ''); if (v.length > 1 && !pool.includes(bare) && !pool.includes(bare.split(/\s/)[0] + ' ')) out.add(v); }
  for (const m of String(text).match(/(?<![.!?][ \t])(?<!^)\b[A-Z][a-z]+(?:[ \t][A-Z][a-z]+)+/gm) || []) { const l = m.toLowerCase(), sing = l.replace(/s\b/g, ''); if (!pool.includes(l) && !pool.includes(sing)) out.add(m); }
  return [...out].slice(0, 8);
}

export function footer(me, kind) {
  const sig = me.signature?.trim() || [me.name, me.title, me.phone].filter(Boolean).join('\n');
  // US law for commercial email: say who you are, give a postal address, and an easy way to opt out.
  const legal = kind === 'email' ? `\n\n${me.address ? `${me.address}\n` : ''}If you'd rather not hear from me, just reply "no thanks" and I won't write again.` : '';
  return `\n\n${sig}${legal}`;
}

// Drafts are written two at a time, so writing for many firms at once doesn't start dozens of AI runs.
const QUEUE = []; let active = 0;
function enqueue(fn) { QUEUE.push(fn); pump(); }
function pump() { while (active < 2 && QUEUE.length) { const fn = QUEUE.shift(); active++; Promise.resolve().then(fn).catch(() => {}).finally(() => { active--; pump(); }); } }

/** Creates the outreach for one result and writes every draft. Long-running: the item shows "Writing" until done. */
export async function createDraft({ s, e, pitch = null, model, cwd, engineFn = runTools }) {
  if (DB.items.some(x => x.search === s.id && x.entity === e.id && !['finished'].includes(x.phase))) throw new Error('Outreach for this already exists. Open it from Outreach.');
  const signals = signalsFor(s, e), c = contactsFor(e), me = settings();
  const name = s.mode === 'candidate' ? e.name : e.company;
  const to = bestEmail(c.emails);
  // what to propose: a partnership when the firm's signs point to growing with help, otherwise long-term ownership
  // sale, partnership, or both (their signs point both ways: ask which they prefer), from the owner ranking
  const approach = s.mode === 'target' ? rankOne(e).approach : null, lean = approach === 'watch' ? 'sale' : approach;
  if (s.mode === 'target' && (e.listed || rankOne(e).listed)) throw new Error('This firm is already listed for sale on a marketplace, so it is not a proprietary deal. AION only writes to owners before a sale is marketed.');
  const it = { id: id(), mode: s.mode, search: s.id, entity: e.id, key: keyOf(s.mode, e), name, website: e.website || '', created: now(), phase: 'writing', status: 'Writing the drafts', pitch: s.mode === 'target' ? (['sale', 'partner', 'both'].includes(pitch) ? pitch : lean || 'sale') : null, sender: me.defaultSender, to: to?.email || '', toName: to?.name || (s.mode === 'target' ? ownerOf(e) : null) || c.people[0]?.name || '', contacts: c, signals, drafts: null, messages: [], log: [{ at: now(), text: `Gathered ${signals.length} signals` }] };
  DB.items.unshift(it); save();
  enqueue(async () => {
    try {
      const sub = s.mode === 'target' ? SUBSECTORS[s.subsector]?.short : null;
      const who = `${it.toName ? `${it.toName} at ` : ''}${name}`;
      const r = await engineFn({ prompt: draftPrompt(s.mode, who, signals, me, sub, it.pitch), model, cwd, timeoutMs: 300000 });
      const j = parseJson(r.text); if (!j?.email?.body) throw new Error('The AI reply could not be read. Press Write again.');
      const ids = new Set(signals.map(x => x.id));
      const fix = d => d ? { subject: clean(d.subject || ''), body: String(d.body || '').trim(), used: (d.used || []).filter(x => ids.has(x)), check: unsupported(`${d.subject || ''}\n${d.body || ''}`, signals, me) } : null;
      it.drafts = { email: fix(j.email), followup1: fix(j.followup1), followup2: fix(j.followup2), letter: fix(j.letter), call: fix(j.call), form: fix(j.form) };
      it.why = clean(j.why || '');
      it.phase = 'review';
      if (!it.to && it.website) { try { await findEmail(it.id); } catch {} } // their own site, free; never a guessed address
      it.status = it.to ? 'Ready for your OK' : 'No email address: use the letter, call or contact form';
      it.log.push({ at: now(), text: 'Drafts written' });
    } catch (err) { it.phase = 'failed'; it.status = err.message; it.log.push({ at: now(), text: `Drafting failed: ${err.message}` }); }
    save();
  });
  return it;
}

export function editItem(idv, p) {
  const it = get(idv);
  if (p.to !== undefined) it.to = String(p.to).trim().toLowerCase().slice(0, 200);
  if (p.toName !== undefined) it.toName = String(p.toName).slice(0, 120);
  if (p.sender !== undefined) { const v = String(p.sender).trim().toLowerCase(); if (v !== it.sender && it.messages.some(m => m.threadId)) throw new Error(`This conversation is in ${it.sender}’s Gmail; follow-ups and replies go from there.`); it.sender = v; }
  if (p.clearCall && it.call) { it.log.push({ at: now(), text: `Call on ${slotLabel(it.call.start)} didn’t happen; finding a new time` }); it.call = null; it.status = 'Finding a new time'; }
  if (p.kind && it.drafts?.[p.kind]) { const d = it.drafts[p.kind]; if (p.subject !== undefined) d.subject = String(p.subject).slice(0, 200); if (p.body !== undefined) d.body = String(p.body).slice(0, 8000); d.check = unsupported(`${d.subject || ''}\n${d.body}`, it.signals, DB.settings); d.edited = true; }
  save(); return it;
}
export const get = idv => { const it = DB.items.find(x => x.id === idv); if (!it) throw new Error('That outreach no longer exists.'); return it; };

// ---------- 3. sending, only with your OK ----------

const sentToday = from => DB.items.flatMap(x => x.messages).filter(m => m.from === from && m.sentAt && m.sentAt.slice(0, 10) === now().slice(0, 10)).length;
const STEP = { email: 0, followup1: 1, followup2: 2 };
/** What would happen if you pressed Send: every check, so the confirm screen can show it and refuse a bad send. */
export function preflight(idv, kind) {
  const it = get(idv), me = DB.settings, d = it.drafts?.[kind], problems = [];
  if (!(kind in STEP)) problems.push('Only the email and its follow-ups are sent from here. Letters, calls and forms are marked done by you.');
  if (!d?.body) problems.push('There is no draft to send.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(it.to)) problems.push('Add the recipient’s email address.');
  if (DB.suppress.includes(it.to)) problems.push(`${it.to} asked not to be contacted. Mochi won’t send to them again.`);
  if (!gmail.accounts().some(a => a.email === it.sender && !a.error)) problems.push(`${it.sender} isn’t connected. Connect it in Outreach › Senders.`);
  if (!me.address) problems.push('Add your mailing address in Outreach › Senders (US law requires one on outreach email).');
  if (kind !== 'email' && !it.messages.some(m => m.kind === 'email')) problems.push('Send the first email before a follow-up.');
  if (it.messages.some(m => m.kind === kind)) problems.push('This one was already sent.');
  if (it.replied) problems.push('They replied, so the follow-ups stopped. Answer them instead.');
  if (sentToday(it.sender) >= me.dailyCap) problems.push(`Today’s limit of ${me.dailyCap} from ${it.sender} is reached (keeps the account in good standing). It resets tomorrow.`);
  const first = it.messages.find(m => m.kind === 'email');
  const subject = kind === 'email' ? d?.subject : `Re: ${first?.subject || it.drafts?.email?.subject || ''}`;
  return { ok: !problems.length, problems, from: it.sender, to: it.to, subject, body: d ? d.body + footer(me, 'email') : '', check: d?.check || [] };
}

export async function sendStep(idv, kind, { confirmed, saveOnly = false } = {}) {
  if (!confirmed) throw new Error('Sending needs your confirmation.');
  const it = get(idv), pf = preflight(idv, kind);
  if (!pf.ok) throw new Error(pf.problems[0]);
  const first = it.messages.find(m => m.kind === 'email');
  const m = { from: it.sender, fromName: DB.settings.name, to: it.to, subject: pf.subject, body: pf.body, threadId: first?.threadId, inReplyTo: first?.messageId, references: it.messages.map(x => x.messageId).filter(Boolean).join(' ') };
  if (saveOnly) { const r = await gmail.saveDraft(m); it.log.push({ at: now(), text: `Saved ${kind === 'email' ? 'the first email' : 'a follow-up'} to ${it.sender} Gmail Drafts (not sent)` }); save(); return { draft: r.id }; }
  const r = await gmail.send(m);
  it.messages.push({ kind, from: it.sender, to: it.to, subject: pf.subject, body: pf.body, sentAt: now(), gmailId: r.id, threadId: r.threadId, messageId: r.messageId });
  it.phase = 'waiting'; it.status = kind === 'followup2' ? 'Last follow-up sent; waiting' : 'Sent; waiting for a reply';
  it.log.push({ at: now(), text: `Sent ${kind === 'email' ? 'the first email' : kind === 'followup1' ? 'follow-up 1' : 'follow-up 2'} from ${it.sender} to ${it.to} (Gmail id ${r.id})` });
  if (it.mode === 'target' && kind === 'email') stageFor(it, 'contacted', `Emailed ${it.to} from ${it.sender}`);
  save(); return { sent: r.id };
}

/** Letters, calls and contact forms happen outside AION: you mark them done and they count as contact. */
export function markDone(idv, kind, note = '') {
  const it = get(idv);
  it.messages.push({ kind, sentAt: now(), manual: true, note: String(note).slice(0, 500) });
  it.phase = it.replied ? it.phase : 'waiting'; it.status = `${{ letter: 'Letter sent', call: 'Called', form: 'Contact form sent' }[kind] || 'Done'}; waiting for a reply`;
  it.log.push({ at: now(), text: `${{ letter: 'Letter mailed', call: 'Called', form: 'Contact form sent' }[kind] || kind}${note ? `: ${note}` : ''}` });
  if (it.mode === 'target') stageFor(it, 'contacted', `${kind} ${note}`.trim());
  save(); return it;
}

function stageFor(it, stage, note) {
  try { const s = { mode: it.mode, id: it.search }, e = { website: it.website, company: it.name }; setStage(s, e, stage, note); } catch {}
}
export function setDealStage(idv, stage, note) { const it = get(idv); stageFor(it, stage, note); if (stage === 'met') it.callHeld = true; it.stage = stage; it.log.push({ at: now(), text: `Deal stage: ${stage}${note ? ` (${note})` : ''}` }); if (['closed', 'passed'].includes(stage)) { it.phase = 'finished'; it.status = stage === 'closed' ? 'Closed' : 'Passed'; } save(); return it; }

// ---------- 4. replies, bounces, opt-outs ----------

const OPTOUT = /\b(unsubscribe|remove me|no thanks|not interested|stop (emailing|contacting)|do not (contact|email)|take me off)\b/i;
const BOUNCE = /(mailer-daemon|postmaster)@|delivery status notification|address not found|undeliverable/i;
export function classify(text) {
  if (OPTOUT.test(text)) return 'optout';
  if (/\b(not (now|at this time|selling|for sale)|no plans to sell|maybe (later|next year)|reach out (in|next))\b/i.test(text)) return 'later';
  if (/\b(yes|sure|happy to|let'?s (talk|chat|set)|call me|how about|available|works for me|open to)\b/i.test(text)) return 'interested';
  return 'reply';
}

/** Which offered call time they picked ("Tuesday at 9 works", "the 11:30 on Wednesday"), or null. */
export function pickedSlot(text, offered = [], tz = 'America/New_York') {
  const t = String(text || '').toLowerCase(); if (!offered.length) return null;
  const hits = offered.filter(x => {
    const d = new Date(x.start), day = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz }).toLowerCase();
    const h = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).toLowerCase(); // "9:00 am"
    const [hm, ap] = h.split(' '), [hh, mm] = hm.split(':'), times = [hm, mm === '00' ? hh : null, `${mm === '00' ? hh : hm}${ap}`, `${mm === '00' ? hh : hm} ${ap}`].filter(Boolean);
    const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz }).toLowerCase(); // "nov 10"
    const dayOk = t.includes(day) || t.includes(day.slice(0, 3) + ' ') || t.includes(md) || t.includes(`${d.getDate()}th`);
    return dayOk && times.some(x => new RegExp(`(^|[^\\d:])${x.replace('.', '\\.')}(?![\\d])`).test(t));
  });
  // "Tuesday at 2" with two Tuesdays offered means the nearer one, unless they named the date
  return hits.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] || null;
}

export async function syncReplies() {
  let changed = 0;
  // every open conversation, not just the first reply: an owner who picks a time or asks a question is caught too
  for (const it of DB.items.filter(x => x.messages.some(m => m.threadId) && x.phase !== 'finished')) {
    const first = it.messages.find(m => m.threadId);
    try {
      const msgs = await gmail.thread(it.sender, first.threadId);
      const ours = new Set(it.messages.map(m => m.gmailId)), seen = new Set(it.seen || []);
      const upTo = it.replied?.at ? Date.parse(it.replied.at) : 0; // replies already handled before AION kept a seen list
      const theirs = msgs.filter(m => !ours.has(m.id) && !seen.has(m.id) && m.id !== it.replied?.id && !(upTo && Date.parse(m.at) <= upTo) && !String(m.from).toLowerCase().includes(it.sender));
      if (!theirs.length) continue;
      it.seen = [...seen, ...theirs.map(m => m.id)];
      const last = theirs.at(-1), text = `${last.subject}\n${last.body || last.snippet}`;
      if (BOUNCE.test(`${last.from} ${text}`)) { it.phase = 'finished'; it.status = 'Bounced: the address didn’t work'; it.bounced = true; it.log.push({ at: now(), text: 'Bounced' }); changed++; continue; }
      const kind = classify(text), body = String(last.body || last.snippet).split(/\nOn .+wrote:/)[0].trim().slice(0, 4000);
      const pick = it.offered?.length && !it.call ? pickedSlot(body, it.offered, TZ()) : null;
      if (it.replied) (it.earlier ||= []).push(it.replied);
      it.replied = { at: last.at, from: last.from, text: body, kind, id: last.id, picked: pick };
      if (kind === 'optout') { DB.suppress = [...new Set([...DB.suppress, it.to])]; it.phase = 'finished'; it.status = 'Asked not to be contacted; no more emails'; }
      else { it.phase = 'replied'; it.status = pick ? `Picked a time: ${pick.label}. Book the call` : it.call ? `New reply · call booked ${slotLabel(it.call.start)}` : last.files?.length || /attach/i.test(body) ? 'Sent files: check the attachments' : kind === 'interested' ? 'Replied: interested' : kind === 'later' ? 'Replied: not now' : 'Replied'; if (it.drafts) delete it.drafts.answer; }
      it.log.push({ at: now(), text: `Reply from ${last.from}: ${pick ? `picked ${pick.label}` : kind}` });
      changed++;
    } catch (e) { it.syncError = e.message; }
  }
  if (changed) save();
  return changed;
}

/** Drops a closing "Best, <your name>" the AI adds anyway: the signature footer already carries it. */
export const noSignoff = (body, me) => String(body || '').trim().replace(/\n+(best|thanks|thank you|many thanks|regards|best regards|warm regards|kind regards|sincerely|cheers|all the best|talk soon)[,!.]?[ \t]*(\n+[ \t]*[^\n]{1,40})?[ \t]*$/i, '').trim();
export async function draftAnswer(idv, { model, cwd, engineFn = runTools }) {
  const it = get(idv); if (!it.replied) throw new Error('They haven’t replied yet.');
  const me = DB.settings;
  let times = [];
  let asked = null;
  if (it.replied.kind !== 'later') { try { const o = await openSlots(askedFor(it.replied.text)); times = o.slots; asked = o.asked; } catch {} }
  it.offered = times;
  const prompt = `Write a short reply from ${me.name} to this answer from ${it.toName || it.name}. Be warm and direct. ${times.length ? `If they are open to talking, offer these open times for a ${me.callMinutes || 30}-minute call exactly as written, as a short list, and say you'll send a calendar invite with a video link once they pick one: ${times.map(t => t.label).join('; ')}.${asked ? (asked.free ? ' The first times on that list match the day or time they suggested; say so warmly.' : ' The calendar was checked and the day or time they suggested is not open; say so briefly and kindly, then offer the list.') : ' Do not say whether you are free or busy at any other time.'}` : 'If they are open to talking, propose a short call and ask which two times this week or next suit them.'} If they said not now, thank them and ask if you may check back in six months. No sign-off or signature (it is added after). Use only these facts; never invent any:\n${it.signals.map(x => `- ${x.text}`).join('\n')}\n\nTHEIR REPLY:\n"""${it.replied.text}"""\n\nReturn JSON only: {"body":""}`;
  const r = await engineFn({ prompt, model, cwd, timeoutMs: 180000 });
  const j = parseJson(r.text); if (!j?.body) throw new Error('The AI reply could not be read. Try again.');
  it.drafts.answer = { subject: '', body: noSignoff(j.body, me), used: [], check: unsupported(j.body, it.signals, me) }; save(); return it;
}
export async function sendAnswer(idv, { confirmed }) {
  if (!confirmed) throw new Error('Sending needs your confirmation.');
  const it = get(idv), d = it.drafts?.answer, first = it.messages.find(m => m.threadId);
  if (!d?.body || !first) throw new Error('Nothing to send.');
  if (DB.suppress.includes(it.to)) throw new Error(`${it.to} asked not to be contacted.`);
  const body = d.body + footer(DB.settings, 'answer');
  const r = await gmail.send({ from: it.sender, fromName: DB.settings.name, to: it.to, subject: `Re: ${first.subject}`, body, threadId: first.threadId, inReplyTo: first.messageId, references: it.messages.map(x => x.messageId).filter(Boolean).join(' ') });
  it.messages.push({ kind: 'answer', from: it.sender, to: it.to, subject: `Re: ${first.subject}`, body, sentAt: now(), gmailId: r.id, threadId: r.threadId, messageId: r.messageId });
  it.phase = 'conversation'; it.status = 'In conversation'; it.log.push({ at: now(), text: `Answered from ${it.sender}` }); save(); return it;
}

// ---------- 5. the board ----------

export function board() {
  const fu = DB.settings.followUpDays;
  return DB.items.map(it => {
    const sent = it.messages.filter(m => m.sentAt && !m.manual && m.kind in STEP), last = sent.at(-1);
    let next = null;
    if (!it.replied && last && it.phase !== 'finished') {
      const step = last.kind === 'email' ? 'followup1' : last.kind === 'followup1' ? 'followup2' : null;
      if (step && it.drafts?.[step]) { const due = addDays(sent[0].sentAt, last.kind === 'email' ? fu[0] : fu[1] ?? fu[0] + 6); next = { kind: step, due, overdue: due <= now() }; }
    }
    const callPast = it.call && Date.parse(it.call.end) < Date.now() && !it.callHeld;
    return { call: it.call ? { start: it.call.start, past: !!callPast } : null, id: it.id, mode: it.mode, name: it.name, toName: it.toName, to: it.to, sender: it.sender, phase: it.phase, status: it.status, created: it.created, sentAt: sent[0]?.sentAt || null, days: daysSince(last?.sentAt), next, replied: it.replied ? { at: it.replied.at, kind: it.replied.kind } : null, signals: it.signals.length, search: it.search, entity: it.entity };
  });
}
export const item = idv => { const it = get(idv); for (const d of Object.values(it.drafts || {})) if (d?.body) d.check = unsupported(`${d.subject || ''}\n${d.body}`, it.signals, DB.settings); return { ...it, preflight: Object.fromEntries(Object.keys(STEP).map(k => [k, preflight(idv, k)])), suppressed: DB.suppress.includes(it.to) }; };
export const suppressed = () => DB.suppress;
export function remove(idv) { const it = get(idv); if (it.messages.some(m => m.sentAt)) throw new Error('This one has been sent; finish it instead of deleting.'); DB.items = DB.items.filter(x => x.id !== idv); save(); }
export function finish(idv, why = 'Finished') { const it = get(idv); it.phase = 'finished'; it.status = why; it.log.push({ at: now(), text: why }); save(); return it; }
export function reset() { DB = { settings: { ...DEFAULTS }, items: [], suppress: [] }; save(); }

// ---------- 6. calls: real open times from your calendars, then an invite ----------

const TZ = () => DB.settings.tz || 'America/New_York';
const partsIn = (d, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
/** The instant for a local wall-clock time in a time zone (handles daylight saving). */
export function zoned(y, m, d, h, min, tz) {
  let t = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) { const p = partsIn(new Date(t), tz); const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); t += Date.UTC(y, m - 1, d, h, min) - shown; }
  return new Date(t);
}
export const slotLabel = iso => new Date(iso).toLocaleString('en-US', { timeZone: TZ(), weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(':00', '') + ' ET';

/** Pure: open slots of `minutes` on weekdays inside working hours, avoiding busy times, spread over days. */
export function pickSlots(busyList, { from = new Date(), days = 10, minutes = 30, hours = [9, 17], tz = 'America/New_York', max = 5, perDay = 2 } = {}) {
  const out = [], buf = 15 * 60_000, start = from.getTime() + 18 * 3_600_000; // never sooner than 18 hours out
  for (let k = 0; k <= days + 4 && out.length < max; k++) {
    const p = partsIn(new Date(from.getTime() + k * 86_400_000), tz);
    if (['Sat', 'Sun'].includes(p.weekday)) continue;
    let today = 0;
    for (let h = hours[0] * 60; h + minutes <= hours[1] * 60 && today < perDay && out.length < max; h += 30) {
      if (h >= 12 * 60 && h < 13 * 60) continue; // keep lunch free
      const a = zoned(+p.year, +p.month, +p.day, Math.floor(h / 60), h % 60, tz).getTime(), b = a + minutes * 60_000;
      if (a < start) continue;
      if (busyList.some(x => Date.parse(x.start) < b + buf && Date.parse(x.end) > a - buf)) continue;
      out.push({ start: new Date(a).toISOString(), end: new Date(b).toISOString() }); today++;
      h += 120; // spread the day's two options apart
    }
  }
  return out;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** The day and part of day an owner asked for ("next Tuesday afternoon"), or null. */
export function askedFor(text) {
  const t = String(text || '').toLowerCase(), day = DAYS.findIndex(d => t.includes(d) || new RegExp(`\\b${d.slice(0, 3)}\\b`).test(t));
  const part = /\bafternoon|after lunch|\bpm\b/.test(t) ? 'pm' : /\bmorning|\bam\b/.test(t) ? 'am' : null;
  return day < 0 && !part ? null : { day: day < 0 ? null : day, part };
}
export async function openSlots(pref = null) {
  const accs = gmail.accounts().filter(a => a.calendar && !a.error);
  if (!accs.length) return { slots: [], note: 'Connect a sender with Calendar allowed to offer your real open times.' };
  const from = new Date(), to = new Date(Date.now() + 16 * 86_400_000);
  const b = await gmail.busy(from.toISOString(), to.toISOString());
  const base = { from, minutes: DB.settings.callMinutes || 30, hours: DB.settings.hours || [9, 17], tz: TZ() };
  let slots = pickSlots(b, base).map(x => ({ ...x, label: slotLabel(x.start) }));
  let asked = null;
  if (pref) { // what they asked for, checked against the real calendars: matching times first, then the usual spread
    const dayOf = iso => DAYS.indexOf(new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: TZ() }).toLowerCase());
    const hourOf = iso => +new Date(iso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ() });
    const fits = x => (pref.day == null || dayOf(x.start) === pref.day) && (!pref.part || (pref.part === 'pm' ? hourOf(x.start) >= 12 : hourOf(x.start) < 12));
    const match = pickSlots(b, { ...base, max: 60, perDay: 16 }).filter(fits).slice(0, 3).map(x => ({ ...x, label: slotLabel(x.start), asked: true }));
    asked = { ...pref, free: match.length > 0 };
    slots = [...match, ...slots.filter(x => !match.some(m => m.start === x.start))].slice(0, 5);
  }
  return { slots, asked, note: `Checked ${accs.map(a => a.email).join(' and ')} just now (${b.length} busy times in the next two weeks).` };
}

export async function bookCall(idv, { start, minutes, confirmed }) {
  if (!confirmed) throw new Error('Sending an invite needs your confirmation.');
  const it = get(idv); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(it.to)) throw new Error('Add their email address first.');
  if (!gmail.accounts().some(a => a.email === it.sender && a.calendar && !a.error)) throw new Error(`${it.sender} hasn’t allowed Calendar. Reconnect it in Outreach › Senders.`);
  const s = new Date(start); if (Number.isNaN(s.getTime()) || s.getTime() < Date.now()) throw new Error('Pick a time in the future.');
  const end = new Date(s.getTime() + (+minutes || DB.settings.callMinutes || 30) * 60_000);
  const me = DB.settings, who = it.toName || it.name;
  const ev = await gmail.createEvent(it.sender, { summary: `${me.name} / ${who}${it.mode === 'target' ? ' (AION)' : ''}`, description: `Intro call between ${me.name} (${me.title}) and ${who} of ${it.name}.`, start: s.toISOString(), end: end.toISOString(), attendees: [it.to] });
  it.call = { start: s.toISOString(), end: end.toISOString(), link: ev.htmlLink, meet: ev.meet, eventId: ev.id };
  it.phase = 'conversation'; it.status = `Call booked ${slotLabel(s.toISOString())}`;
  it.log.push({ at: now(), text: `Invite sent from ${it.sender} for ${slotLabel(s.toISOString())}${ev.meet ? ' with a Google Meet link' : ''}` });
  save(); return it;
}

// ---------- 7. after the call: NDA, the books request, the books into Value Creation, the LOI ----------

const REQUEST_CORE = [
  'General ledger detail for the last 24–36 months (QuickBooks: Reports › General Ledger, exported to Excel)',
  'Profit and loss and balance sheet by year, plus the year to date',
  'Payroll summary by person or role (pay, bonus, hours) for the last 12 months',
  'Sales or invoices by client for the last 24 months, with each client’s start date',
  'Accounts receivable aging as of this month',
  'A list of staff: role, start date, full or part time, and who manages whom',
  'Copies of your top client agreements and your standard terms (how and when you get paid)',
  'Any loans, leases, or other debts, and anything the business owes or is owed outside the books',
  'Owner pay and any personal expenses run through the business (so true profit can be shown)'
];
const REQUEST_BY_SUB = {
  talent: ['Placements by year: count, average fee, retained vs contingent, and the recruiter on each', 'Open searches today with fee and stage', 'Your candidate database or ATS export (counts only, no personal data yet)'],
  engineering: ['Project list for 24 months: client, fee, hours by role, overruns', 'Licenses and who holds each stamp or certification', 'Backlog of signed work'],
  supply_chain: ['Engagement list for 24 months: client, scope, fee type (retainer or project), length', 'Recurring retainers and their renewal dates'],
  compliance: ['Inspection or audit volume by month and by client', 'Certifications and accreditations, with renewal dates'],
  implementation: ['Project list with fixed-fee vs time-and-materials and margin on each', 'Software partner agreements and certification levels']
};
export const requestList = sub => [...REQUEST_CORE, ...(REQUEST_BY_SUB[sub] || [])];

/** Plain-English mutual NDA. A starting point for your lawyer, not legal advice. */
export function ndaText(it) {
  const me = DB.settings, date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `MUTUAL CONFIDENTIALITY AGREEMENT

Date: ${date}
Between: ${me.legalName || 'AION'} ("AION"), and ${it.name} ("the Company").

1. Purpose. AION and the Company are discussing a possible investment in, or purchase of, the Company (the "Purpose"). Each may share information with the other for the Purpose only.

2. Confidential information. Anything shared about the business, its finances, clients, staff, pricing or plans, in any form, that is marked confidential or that a reasonable person would treat as confidential.

3. What each side agrees. Use it only for the Purpose; share it only with advisers, lenders and investors who need it and are bound to keep it confidential; protect it as carefully as its own; return or delete it on request.

4. Not covered. Information that is public through no fault of the receiving side, was already known to it, is received from someone else without a duty of confidence, or that the law requires it to disclose (with prompt notice where allowed).

5. No contact. AION will not contact the Company's staff, clients or suppliers about the Purpose without the Company's permission.

6. No obligation. Neither side has to complete any transaction. Nothing here transfers any rights in the information.

7. Term. Two years from the date above.

8. Law. This agreement is governed by the laws of the State of ${me.governingLaw || 'Virginia'}.

Signed for ${me.legalName || 'AION'}: ______________________   Name: ${me.name}   Title: ${me.title}

Signed for ${it.name}: ______________________   Name: ${it.toName || ''}   Title: ________________

This draft is a plain-English starting point. Have a lawyer review it before it is signed.`;
}

export function setDoc(idv, kind, body, title) {
  const it = get(idv); it.docs ??= {};
  it.docs[kind] = { ...(it.docs[kind] || {}), title: title || it.docs[kind]?.title || kind, body: String(body).slice(0, 20000), updated: now() };
  save(); return it;
}
export function makeDoc(idv, kind, sub) {
  const it = get(idv);
  if (kind === 'nda') return setDoc(idv, 'nda', ndaText(it), 'Mutual confidentiality agreement (NDA)');
  if (kind === 'request') {
    const list = requestList(sub);
    return setDoc(idv, 'request', `Hi ${(it.toName || '').split(' ')[0] || 'there'},\n\nThank you again for the conversation. To take the next step, these are the items that would help us understand ${it.name}. Rough exports are fine, and anything you would rather share later is fine too:\n\n${list.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nEverything stays confidential under our NDA. Reply with the files or a shared folder link, whichever is easier.`, 'What we’d like to see (books request)');
  }
  throw new Error('Unknown document.');
}

export const LOI_PROMPT = (it, d, me) => `Draft a short, plain-English, NON-BINDING letter of intent from ${me.legalName || 'AION'} to buy ${it.name}${it.toName ? ` from ${it.toName}` : ''}.
Use ONLY these numbers from AION's analysis of the company's own books (never invent others; write [[to agree]] where a term is unknown):
- Normalized yearly profit (EBITDA): $${Math.round(d.ebitda).toLocaleString()}
- Purchase price: $${Math.round(d.price).toLocaleString()} (${d.multiple}x ${d.basis === 'revenue' ? 'revenue' : 'EBITDA'})
- Structure: bank loan $${Math.round(d.senior).toLocaleString()}, seller note $${Math.round(d.seller).toLocaleString()}, equity $${Math.round(d.equity).toLocaleString()}
- Yearly revenue (last 12 months): $${Math.round(d.revenue).toLocaleString()}
${d.fees ? `- Deal costs (advisers, lender and closing fees): $${Math.round(d.fees).toLocaleString()}. The loan, seller note and equity together pay the price plus these costs, so the seller receives the full purchase price.` : ''}
AION's approach: ${THESIS.short} ${THESIS.philosophy}
Include: price and how it is paid; what is bought (assets or shares: [[to agree]]); diligence of about 60 days; exclusivity of 60 days; the owner's transition role and keeping the team; the conditions (financing, final agreement, confirmation of the books); that only the confidentiality and exclusivity paragraphs bind; signature lines for ${me.name}, ${me.title}, and the owner.
Warm, respectful, under 500 words. End with: "This draft is for discussion and lawyer review."
Return JSON only: {"body":""}`;

export async function makeLoi(idv, numbers, { model, cwd, engineFn = runTools }) {
  const it = get(idv), me = DB.settings;
  if (!numbers?.price) throw new Error('Analyze this company’s books in Value Creation first: the LOI uses the price and structure from that analysis.');
  const r = await engineFn({ prompt: LOI_PROMPT(it, numbers, me), model, cwd, timeoutMs: 240000 });
  const j = parseJson(r.text); if (!j?.body) throw new Error('The LOI draft could not be read. Try again.');
  it.loiNumbers = numbers;
  return setDoc(idv, 'loi', String(j.body).trim(), 'Letter of intent (non-binding)');
}

/** Emails a document (as a PDF attachment) in the same thread. Only with your confirmation. */
export async function sendDoc(idv, kind, { confirmed, pdf, note }) {
  if (!confirmed) throw new Error('Sending needs your confirmation.');
  const it = get(idv), doc = it.docs?.[kind]; if (!doc) throw new Error('Write the document first.');
  if (DB.suppress.includes(it.to)) throw new Error(`${it.to} asked not to be contacted.`);
  const first = it.messages.find(m => m.threadId);
  const subject = first ? `Re: ${first.subject}` : `${doc.title} — ${it.name}`;
  const body = kind === 'request' ? doc.body + footer(DB.settings, 'answer') : `${note || `Hi ${(it.toName || '').split(' ')[0] || 'there'},\n\nAttached is the ${doc.title.toLowerCase()} we discussed. Happy to walk through it or change anything.`}${footer(DB.settings, 'answer')}`;
  const attachments = kind === 'request' ? [] : [{ filename: `${doc.title.replace(/[^\w ()-]+/g, '').trim()} - ${it.name.replace(/[^\w &-]+/g, '')}.pdf`, mime: 'application/pdf', data: pdf }];
  if (kind !== 'request' && !pdf?.length) throw new Error('The PDF could not be made (is Google Chrome installed?).');
  const r = await gmail.send({ from: it.sender, fromName: DB.settings.name, to: it.to, subject, body, attachments, threadId: first?.threadId, inReplyTo: first?.messageId });
  it.messages.push({ kind: `doc:${kind}`, from: it.sender, to: it.to, subject, body, sentAt: now(), gmailId: r.id, threadId: r.threadId, messageId: r.messageId, attached: attachments.map(a => a.filename) });
  doc.sentAt = now();
  it.log.push({ at: now(), text: `Sent ${doc.title} to ${it.to}${attachments.length ? ' (PDF attached)' : ''}` });
  save(); return it;
}
export function linkDeal(idv, dealId) { const it = get(idv); it.dealId = String(dealId); it.log.push({ at: now(), text: 'Their books opened in Value Creation' }); if (it.mode === 'target') stageFor(it, 'books', 'Books received'); save(); return it; }
export async function listAttachments(idv) { const it = get(idv), first = it.messages.find(m => m.threadId); if (!first) return []; return (await gmail.attachments(it.sender, first.threadId)).filter(a => !it.messages.some(m => m.gmailId === a.messageId)); }
export async function getAttachment(idv, messageId, attachmentId) { const it = get(idv), first = it.messages.find(m => m.threadId); return gmail.attachment(it.sender, first.threadId, messageId, attachmentId); }

// ---------- 8. finding an email: the firm's own website first (free), then Apollo / People Data Labs if keys exist; never guessed ----------

export async function findEmail(idv, { fetcher } = {}) {
  const it = get(idv);
  const domain = (it.website || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const people = [it.toName, ...it.contacts.people.map(p => p.name)].filter(n => n && n.split(' ').length >= 2);
  if (!domain) throw new Error('This firm has no website on file, so there is nowhere to read an email from. Use the letter or call notes.');
  const found = [], tried = [];
  // 1. their own site: contact, about and team pages; only addresses on their own domain, copied exactly
  try {
    const r = await siteContacts(domain, people, fetcher ? { fetcher } : {}); tried.push(`their website (${r.pages} page${r.pages === 1 ? '' : 's'})`);
    for (const x of r.emails) found.push({ name: x.name, email: x.email, verified: true, url: x.url, source: 'their website' });
    for (const ph of r.phones) if (!it.contacts.other.some(o => o.value === ph.phone)) it.contacts.other.push({ kind: 'phone', value: ph.phone, url: ph.url });
  } catch {}
  // 2. paid sources, only when keys are set (a named owner's work email beats a general inbox)
  for (const name of (process.env.PDL_API_KEY || process.env.APOLLO_API_KEY) ? people.slice(0, 3) : []) {
    if (found.some(f => f.name === name)) continue;
    try {
      if (process.env.APOLLO_API_KEY) {
        const [first, ...rest] = name.split(' ');
        const r = await fetch('https://api.apollo.io/api/v1/people/match', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.APOLLO_API_KEY }, body: JSON.stringify({ first_name: first, last_name: rest.join(' '), domain }) });
        const j = await r.json(); const e = j.person?.email; if (e && j.person?.email_status === 'verified') found.push({ name, email: e.toLowerCase(), verified: true, url: 'Apollo', source: 'Apollo' });
      }
      if (process.env.PDL_API_KEY && !found.some(f => f.name === name)) {
        const q = new URLSearchParams({ name, company: domain, min_likelihood: '6' });
        const r = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${q}`, { headers: { 'X-Api-Key': process.env.PDL_API_KEY } });
        const j = await r.json(); const e = j.data?.work_email; if (e && e.endsWith(domain)) found.push({ name, email: e.toLowerCase(), verified: true, url: 'People Data Labs', source: 'People Data Labs' });
      }
    } catch {}
  }
  if (process.env.PDL_API_KEY || process.env.APOLLO_API_KEY) tried.push('Apollo / People Data Labs');
  const fresh = found.filter(f => !it.contacts.emails.some(x => x.email === f.email) && !DB.suppress.includes(f.email));
  if (!fresh.length && !bestEmail(it.contacts.emails)) { it.log.push({ at: now(), text: `No email found (checked ${tried.join(' and ')})` }); save(); throw new Error(`No email is shown on ${tried.join(' or ')}. Use the contact form, letter or call notes.`); }
  for (const f of fresh) it.contacts.emails.push(f);
  // prefer a named owner's address; a general inbox (info@) is used only if nothing better exists
  const best = it.contacts.emails.find(x => x.name && (!it.toName || x.name === it.toName)) || bestEmail(it.contacts.emails);
  if (!best) { if (it.to && emailRank({ email: it.to }) >= 9) it.to = ''; it.log.push({ at: now(), text: `Only order, support or careers inboxes found (${it.contacts.emails.map(x => x.email).join(', ')}); use the contact form, letter or call notes` }); save(); throw new Error('Only order, support or careers inboxes are shown on their site, which won’t reach the owner. Use the contact form, letter or call notes.'); }
  const cur = it.to ? it.contacts.emails.find(x => x.email === it.to) || { email: it.to } : null;
  if (!cur || emailRank(best) < emailRank(cur)) { it.to = best.email; if (best.name) it.toName = best.name; }
  it.log.push({ at: now(), text: fresh.length ? `Found ${fresh.length} email${fresh.length === 1 ? '' : 's'} on ${[...new Set(fresh.map(f => f.source))].join(', ')}: ${fresh.map(f => f.email).join(', ')}` : 'No new email; kept the one on file' });
  if (it.phase === 'review') it.status = 'Ready for your OK';
  save(); return it;
}

// ---------- 9. many at once, and what's working ----------

export async function createMany(list, opts) {
  const made = [], skipped = [];
  for (const x of list.slice(0, 25)) { try { made.push((await createDraft({ ...opts, s: x.s, e: x.e })).id); } catch (e) { skipped.push({ name: x.e.company || x.e.name, why: e.message }); } }
  return { made, skipped };
}

/** Weekly results and what gets answers. Counted only from what actually happened in Gmail and your marks. */
export function results() {
  const items = DB.items, wk = iso => { const d = new Date(iso); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const weeks = {};
  const W = k => (weeks[k] ??= { week: k, contacted: 0, emails: 0, replies: 0, interested: 0, calls: 0 });
  for (const it of items) {
    const first = it.messages.find(m => m.sentAt && ['email', 'letter', 'call', 'form'].includes(m.kind));
    if (first) W(wk(first.sentAt)).contacted++;
    for (const m of it.messages.filter(m => m.sentAt && !m.manual)) W(wk(m.sentAt)).emails++;
    if (it.replied) { W(wk(it.replied.at)).replies++; if (it.replied.kind === 'interested') W(wk(it.replied.at)).interested++; }
    if (it.call) W(wk(it.call.start)).calls++;
  }
  const contacted = items.filter(it => it.messages.some(m => m.sentAt)), replied = contacted.filter(it => it.replied && it.replied.kind !== 'optout');
  const rate = (a, b) => b ? Math.round((a / b) * 100) : null;
  const by = f => { const g = {}; for (const it of contacted) { const k = f(it); if (!k) continue; (g[k] ??= { key: k, sent: 0, replied: 0 }); g[k].sent++; if (it.replied && it.replied.kind !== 'optout') g[k].replied++; } return Object.values(g).map(x => ({ ...x, rate: rate(x.replied, x.sent) })).sort((a, b) => b.sent - a.sent); };
  const usedKinds = it => { const d = it.drafts?.email; if (!d) return []; const ids = new Set(d.used || []); return [...new Set(it.signals.filter(s => ids.has(s.id)).map(s => s.kind))]; };
  const signalKinds = {}; for (const it of contacted) for (const k of usedKinds(it)) { (signalKinds[k] ??= { key: k, sent: 0, replied: 0 }); signalKinds[k].sent++; if (it.replied && it.replied.kind !== 'optout') signalKinds[k].replied++; }
  return {
    totals: { contacted: contacted.length, replied: replied.length, rate: rate(replied.length, contacted.length), interested: contacted.filter(it => it.replied?.kind === 'interested').length, calls: items.filter(it => it.call).length, optedOut: DB.suppress.length, bounced: items.filter(it => it.bounced).length },
    weeks: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)).slice(-8),
    bySender: by(it => it.sender), byChannel: by(it => it.messages.find(m => m.sentAt)?.kind === 'email' ? 'Email' : { letter: 'Letter', call: 'Call', form: 'Contact form' }[it.messages.find(m => m.sentAt)?.kind] || null),
    bySignal: Object.values(signalKinds).map(x => ({ ...x, rate: rate(x.replied, x.sent) })).filter(x => x.sent >= 3).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)),
    edited: { sent: contacted.filter(it => it.drafts?.email?.edited).length, of: contacted.length }
  };
}

/** What to tell you about since last time: new replies, follow-ups that came due, calls coming up. Each once. */
export function alerts() {
  DB.alerted ??= [];
  const out = [], seen = new Set(DB.alerted), add = (k, title, body) => { if (!seen.has(k)) { out.push({ title, body }); DB.alerted.push(k); } };
  for (const x of board()) {
    if (x.replied && x.replied.kind !== 'optout') add(`r:${x.id}`, `${x.toName || x.name} replied`, `${x.name}: ${x.replied.kind === 'interested' ? 'interested' : x.replied.kind === 'later' ? 'not now' : 'a reply'}. Open AION › Outreach.`);
    if (x.next?.overdue) add(`f:${x.id}:${x.next.kind}`, `Follow-up due: ${x.name}`, 'Review it in AION › Outreach; nothing sends without your OK.');
  }
  for (const it of DB.items.filter(i => i.call)) { const h = (Date.parse(it.call.start) - Date.now()) / 3_600_000; if (h > 0 && h <= 2) add(`c:${it.id}`, `Call soon: ${it.toName || it.name}`, `${slotLabel(it.call.start)}. The brief is in AION › Outreach.`); }
  if (out.length) { DB.alerted = DB.alerted.slice(-1000); save(); }
  return out;
}
