// Gmail for Outreach: sign in each sending account (the first in AION_SENDERS by default, the second optional
// optional), send a message or a follow-up in the same thread, save a Gmail draft, and read a thread to see replies.
// Tokens stay on this Mac in workspace/outreach/accounts.json (owner-only file). AION_GMAIL_MOCK=1 uses a fake Gmail.
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path';
import { readJson, writeJson } from '../fsafe.mjs';

// Gmail to send and read replies; Calendar to see when you're busy and send invites for calls.
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/calendar.events'];
let FILE = null, ACC = {}; const pending = new Map();
export function initGmail(dir) { fs.mkdirSync(dir, { recursive: true }); FILE = path.join(dir, 'accounts.json'); ACC = readJson(FILE, {}) || {}; try { fs.chmodSync(FILE, 0o600); } catch {} }
// owner-only from the first byte (the tokens can read and send mail), written atomically
const save = () => writeJson(FILE, ACC, { mode: 0o600, indent: 0 });
const mock = () => process.env.AION_GMAIL_MOCK === '1';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const accounts = () => Object.values(ACC).map(a => ({ email: a.email, connectedAt: a.connectedAt, error: a.error || null, calendar: !!a.mock || /calendar/.test(a.scope || '') }));
export const configured = () => mock() || !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export function disconnect(email) { delete ACC[String(email).toLowerCase()]; save(); }

/** Step 1: the Google sign-in link. The person picks the account in their browser; Google sends them back here. */
export function connectUrl(port, hint = '') {
  if (mock()) { const email = (hint || String(process.env.AION_SENDERS || 'sender@example.com').split(',')[0].trim()).toLowerCase(); ACC[email] = { email, mock: true, scope: SCOPES.join(' '), connectedAt: new Date().toISOString() }; save(); return { url: null, connected: email }; }
  if (!configured()) throw new Error('Gmail sign-in is not set up: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to demo/.env and restart AION.');
  const state = b64u(crypto.randomBytes(16)), verifier = b64u(crypto.randomBytes(32));
  const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
  const redirect = `http://127.0.0.1:${port}/api/outreach/google/callback`;
  pending.set(state, { verifier, redirect, at: Date.now() });
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', state, code_challenge: challenge, code_challenge_method: 'S256', ...(hint ? { login_hint: hint } : {}) });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
}

/** Step 2: Google's redirect. Swaps the code for tokens and records which address signed in. */
export async function finishConnect(state, code) {
  const p = pending.get(state); pending.delete(state);
  if (!p || Date.now() - p.at > 15 * 60_000) throw new Error('This sign-in link expired. Start again from Outreach › Senders.');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, code, code_verifier: p.verifier, redirect_uri: p.redirect, grant_type: 'authorization_code' }) });
  const t = await r.json(); if (!r.ok) throw new Error(t.error_description || t.error || 'Google did not accept the sign-in.');
  if (!t.refresh_token) throw new Error('Google did not return a lasting sign-in. Try again and allow access.');
  const prof = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
  const email = String(prof.emailAddress || '').toLowerCase(); if (!email) throw new Error('Could not read which Gmail address signed in.');
  ACC[email] = { email, refresh: t.refresh_token, access: t.access_token, scope: t.scope || '', expires: Date.now() + (t.expires_in - 60) * 1000, connectedAt: new Date().toISOString() }; save();
  return email;
}

async function token(email) {
  const a = ACC[String(email).toLowerCase()]; if (!a) throw new Error(`${email} is not connected. Connect it in Outreach › Senders.`);
  if (a.access && a.expires > Date.now()) return a.access;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: a.refresh, grant_type: 'refresh_token' }) });
  const t = await r.json();
  if (!r.ok) { a.error = 'Signed out by Google. Connect again.'; save(); throw new Error(`${email}: Google signed this account out (${t.error || r.status}). Connect it again in Outreach › Senders.`); }
  a.access = t.access_token; a.expires = Date.now() + (t.expires_in - 60) * 1000; a.error = null; save(); return a.access;
}
async function gm(email, p, init = {}) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${p}`, { ...init, headers: { Authorization: `Bearer ${await token(email)}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`Gmail: ${j.error?.message || r.status}`); return j;
}

const enc = s => /[^\x20-\x7e]/.test(s) ? `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=` : s;
const b64lines = buf => Buffer.from(buf).toString('base64').replace(/(.{76})/g, '$1\r\n');
export function mime({ from, fromName, to, subject, body, inReplyTo, references, attachments = [] }) {
  const h = [`From: ${fromName ? `${enc(fromName)} <${from}>` : from}`, `To: ${to}`, `Subject: ${enc(subject)}`, 'MIME-Version: 1.0'];
  if (inReplyTo) h.push(`In-Reply-To: ${inReplyTo}`, `References: ${references || inReplyTo}`);
  if (!attachments.length) return `${[...h, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'].join('\r\n')}\r\n\r\n${b64lines(body)}`;
  const B = `aion_${crypto.randomBytes(8).toString('hex')}`;
  const parts = [`--${B}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(body)}`,
    ...attachments.map(a => `--${B}\r\nContent-Type: ${a.mime || 'application/pdf'}; name="${a.filename}"\r\nContent-Disposition: attachment; filename="${a.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(a.data)}`)];
  return `${[...h, `Content-Type: multipart/mixed; boundary="${B}"`].join('\r\n')}\r\n\r\n${parts.join('\r\n')}\r\n--${B}--`;
}

// ---- the fake Gmail used by tests and AION_GMAIL_MOCK=1 ----
const FAKE = { threads: {}, n: 0 };
export const fake = FAKE;
FAKE.events = []; FAKE.busy = [];
function fakeSend(m, threadId) {
  const id = `m${++FAKE.n}`, tid = threadId || `t${FAKE.n}`;
  (FAKE.threads[tid] ??= []).push({ id, from: m.from, to: m.to, subject: m.subject, body: m.body, at: new Date().toISOString(), messageId: `<${id}@mock>`, attachments: (m.attachments || []).map(a => ({ filename: a.filename, mime: a.mime })) });
  return { id, threadId: tid, messageId: `<${id}@mock>` };
}

/** Sends one message (a follow-up goes into the same thread). Returns Gmail's ids: proof it was sent. */
export async function send(m) {
  if (mock()) return fakeSend(m, m.threadId);
  const sent = await gm(m.from, 'messages/send', { method: 'POST', body: JSON.stringify({ raw: b64u(mime(m)), ...(m.threadId ? { threadId: m.threadId } : {}) }) });
  const full = await gm(m.from, `messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`);
  const messageId = full.payload?.headers?.find(x => /^message-id$/i.test(x.name))?.value || null;
  return { id: sent.id, threadId: sent.threadId, messageId };
}

/** Saves to the sender's Gmail Drafts instead (nothing is sent). */
export async function saveDraft(m) {
  if (mock()) return { id: `d${++FAKE.n}` };
  const d = await gm(m.from, 'drafts', { method: 'POST', body: JSON.stringify({ message: { raw: b64u(mime(m)), ...(m.threadId ? { threadId: m.threadId } : {}) } }) });
  return { id: d.id };
}

/** Every message in a thread: who sent it, when, and its text (to spot replies, bounces and opt-outs). */
export async function thread(email, threadId) {
  if (mock()) return (FAKE.threads[threadId] || []).map(x => ({ ...x }));
  const t = await gm(email, `threads/${threadId}?format=full`);
  const text = p => p ? (p.mimeType === 'text/plain' && p.body?.data ? Buffer.from(p.body.data, 'base64').toString('utf8') : (p.parts || []).map(text).join('\n')) : '';
  return (t.messages || []).map(m => { const H = n => m.payload?.headers?.find(x => x.name.toLowerCase() === n)?.value || '';
    return { id: m.id, from: H('from'), to: H('to'), subject: H('subject'), at: new Date(+m.internalDate).toISOString(), messageId: H('message-id'), body: text(m.payload) || m.snippet || '', snippet: m.snippet || '' }; });
}

// ---------- Calendar: busy times and invites ----------

/** Busy times across every connected account that allowed Calendar (your real calendar may be on the second account). */
export async function busy(fromIso, toIso) {
  if (mock()) return FAKE.busy.slice();
  const out = [];
  for (const a of Object.values(ACC).filter(x => /calendar/.test(x.scope || ''))) {
    try {
      const q = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { Authorization: `Bearer ${await token(a.email)}` } });
      const j = await r.json(); if (!r.ok) continue;
      for (const e of j.items || []) {
        if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
        const mine = (e.attendees || []).find(x => x.self); if (mine?.responseStatus === 'declined') continue;
        const st = e.start?.dateTime || (e.start?.date && `${e.start.date}T00:00:00`), en = e.end?.dateTime || (e.end?.date && `${e.end.date}T00:00:00`);
        if (st && en) out.push({ start: new Date(st).toISOString(), end: new Date(en).toISOString(), account: a.email });
      }
    } catch {}
  }
  return out;
}

/** Creates the call on the sender's calendar with a Google Meet link; Google emails the guest the invite. */
export async function createEvent(email, { summary, description, start, end, attendees }) {
  if (mock()) { const ev = { id: `ev${++FAKE.n}`, summary, start, end, attendees, htmlLink: 'https://calendar.google.com/mock', meet: 'https://meet.google.com/mock' }; FAKE.events.push(ev); return ev; }
  const body = { summary, description, start: { dateTime: start }, end: { dateTime: end }, attendees: attendees.map(e => ({ email: e })), conferenceData: { createRequest: { requestId: crypto.randomBytes(8).toString('hex'), conferenceSolutionKey: { type: 'hangoutsMeet' } } } };
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', { method: 'POST', headers: { Authorization: `Bearer ${await token(email)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(`Calendar: ${j.error?.message || r.status}${r.status === 403 ? '. Reconnect this sender in Outreach › Senders and allow Calendar.' : ''}`);
  return { id: j.id, htmlLink: j.htmlLink, meet: j.hangoutLink || j.conferenceData?.entryPoints?.find(x => x.entryPointType === 'video')?.uri || null, start, end };
}

// ---------- attachments they send back (books, NDAs) ----------

export async function attachments(email, threadId) {
  if (mock()) return (FAKE.threads[threadId] || []).flatMap(m => (m.files || []).map((f, i) => ({ messageId: m.id, attachmentId: `a${i}`, filename: f.filename, mime: f.mime, size: f.data.length, from: m.from, at: m.at })));
  const t = await gm(email, `threads/${threadId}?format=full`), out = [];
  const walk = (m, p) => { if (!p) return; if (p.filename && p.body?.attachmentId) out.push({ messageId: m.id, attachmentId: p.body.attachmentId, filename: p.filename, mime: p.mimeType, size: p.body.size || 0, from: m.payload?.headers?.find(x => x.name.toLowerCase() === 'from')?.value || '', at: new Date(+m.internalDate).toISOString() }); (p.parts || []).forEach(x => walk(m, x)); };
  for (const m of t.messages || []) walk(m, m.payload);
  return out;
}
export async function attachment(email, threadId, messageId, attachmentId) {
  if (mock()) { const m = (FAKE.threads[threadId] || []).find(x => x.id === messageId); return Buffer.from(m.files[+attachmentId.slice(1)].data); }
  const j = await gm(email, `messages/${messageId}/attachments/${attachmentId}`);
  return Buffer.from(String(j.data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
export const _token = email => token(email); // used by the live end-to-end check
