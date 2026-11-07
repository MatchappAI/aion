// Buy box: is this firm one AION can actually buy? Founder- or family-owned, independent, and the right size for
// $500K–$5M EBITDA (for a consulting firm that is roughly 5 to 150 people). Firms that clearly fail are set aside, never
// ranked; firms where the facts are missing stay in, marked "check", so a call can settle it.
const OWNED_ELSEWHERE = /^(pe-backed|public)\b|pe-backed|private[- ]equity|\bpublic\b.*(owned|listed|company)|part of a (larger|multi)|subsidiary|wholly owned|owned by|acquired (by|in)|joined .{0,40}(group|in \d{4})|folded into|merged (into|with)|sold to|series [a-d]\b|venture[- ]backed|portfolio company|roll-?up/i;
const INDEPENDENT = /^(founder|family)[- ]owned|founder-led|owner-run|partner-led|management-buyout/i;

/** Stated headcount in a short size note as { low, high }, or null. "250-350+ staff" → 250–350; "About 3 employees" → 3–3.
 *  Ranges are often third-party guesses, so "too large" uses the low end and "too small" the high end. 0 is a directory blank. */
export function headcount(size) {
  const t = String(size || '');
  if (/\bsolo\b|one-person|sole proprietor/i.test(t)) return { low: 1, high: 1 };
  const m = [...t.matchAll(/(\d[\d,]*)\s*(?:(?:-|–|to)\s*(\d[\d,]*))?\s*\+?\s*(staff|employees|people|person|team members|consultants|fte)/gi)]
    .map(x => [+x[1].replace(/,/g, ''), +(x[2] || x[1]).replace(/,/g, '')]).filter(([a, b]) => b > 0);
  if (!m.length) return null;
  return { low: Math.max(...m.map(x => x[0])), high: Math.max(...m.map(x => x[1])) };
}

const crit = (e, re) => (e.breakdown || []).filter(c => re.test(c.key) || re.test(c.label || ''));

/** { status: 'in' | 'check' | 'out', reasons: [...] } */
export function buyBox(e) {
  const out = [], check = [];
  const own = String(e.ownership || '');
  const ownCrit = crit(e, /owner|independent|founder_owned|family/i);
  if (own && !INDEPENDENT.test(own) && OWNED_ELSEWHERE.test(own)) out.push(`Not independent: ${own.split(/[.;]/)[0].slice(0, 90)}`);
  else if (ownCrit.some(c => c.status === 'mismatch')) out.push(`Not independent: ${(ownCrit.find(c => c.status === 'mismatch').note || '').slice(0, 90)}`);
  else if (!INDEPENDENT.test(own) && !ownCrit.some(c => c.status === 'strong')) check.push('Ownership not confirmed');
  const n = headcount(e.size), sizeCrit = crit(e, /size|staff|ebitda|under_\d+/i);
  if (n && n.low > 150) out.push(`Too large: about ${n.low}${n.high > n.low ? `–${n.high}` : ''} people`);
  else if (n && n.high < 5) out.push(`Too small for $500K EBITDA: about ${n.high} ${n.high === 1 ? 'person' : 'people'}`);
  else if (n == null && sizeCrit.some(c => c.status === 'mismatch') && !/unknown|not (found|stated)|unclear/i.test(sizeCrit.find(c => c.status === 'mismatch').note || '')) out.push(`Size outside the buy box: ${(sizeCrit.find(c => c.status === 'mismatch').note || '').slice(0, 90)}`);
  else if (n == null && !sizeCrit.some(c => ['strong', 'partial'].includes(c.status))) check.push('Size not confirmed');
  return out.length ? { status: 'out', reasons: out } : check.length ? { status: 'check', reasons: check } : { status: 'in', reasons: [] };
}
