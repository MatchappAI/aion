// Every send needs a fresh "yes" from you, checked on the server, not only in the browser: the preview hands out a
// one-time code tied to exactly what will be sent (from, to, subject, text). Sending uses up the code. If anything in
// the email changed after you confirmed it, or the code is old or used, nothing is sent and you are asked again.
import crypto from 'node:crypto';
const T = new Map(), TTL = 10 * 60_000;
const hash = c => crypto.createHash('sha256').update(JSON.stringify([c.from, c.to, c.subject, c.body])).digest('hex');
const prune = () => { const n = Date.now(); for (const [k, v] of T) if (v.exp < n) T.delete(k); };

/** A one-time code for this exact send (scope = what and to whom, content = what the preview showed). */
export function issue(scope, content) {
  prune(); const token = crypto.randomBytes(18).toString('hex');
  T.set(token, { scope, hash: hash(content), exp: Date.now() + TTL }); return token;
}
/** Uses up the code; throws (and nothing is sent) unless it matches this send exactly. */
export function take(token, scope, content) {
  prune(); const t = T.get(String(token || ''));
  if (!t || t.scope !== scope) throw new Error('Please confirm this send again: open the preview and click OK.');
  T.delete(String(token));
  if (t.hash !== hash(content)) throw new Error('The email changed after you confirmed it, so nothing was sent. Confirm it again.');
}
