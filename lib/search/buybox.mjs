// Buy box (thesis v4.0): is this firm one AION can actually buy? US-based, founder- or family-owned, independent, the right size for
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

const US_ABBR = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
const US_STATES = /alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|united states|\busa?\b|u\.s\./i;
const ABROAD = /\b(canada|ontario|toronto|vancouver|united kingdom|\buk\b|england|london|scotland|ireland|dublin|australia|sydney|melbourne|new zealand|india|bangalore|mumbai|delhi|pakistan|lahore|karachi|philippines|manila|romania|bra[sș]ov|bucharest|poland|ukraine|germany|berlin|netherlands|amsterdam|france|paris|spain|italy|portugal|israel|tel aviv|dubai|uae|singapore|china|hong kong|mexico|brazil|argentina|colombia|south africa|nigeria|kenya|egypt|vietnam|bangladesh|sri lanka|serbia|bulgaria|estonia|lithuania|latvia|sweden|denmark|norway|finland)\b/i;
const FOREIGN_TLD = /\.(co\.uk|uk|ca|au|com\.au|in|co\.in|pk|ph|ro|pl|ua|de|nl|fr|es|it|pt|il|ae|sg|cn|hk|mx|br|ar|co|za|ng|ke|eg|vn|bd|lk|rs|bg|ee|lt|lv|se|dk|no|fi|ie|nz)$/i;
/** 'us' | 'abroad' | null (not stated). Headquarters wording wins; a country domain (.ro, .co.uk) counts as abroad. */
export function country(e) {
  const loc = String(e.location || ''), host = String(e.domain || e.website || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  if ((US_STATES.test(loc) || US_ABBR.test(loc)) && !/^\s*(remote|global)/i.test(loc) && !ABROAD.test(loc.split(/[;(]/)[0])) return 'us';
  if (ABROAD.test(loc) || FOREIGN_TLD.test(host)) return 'abroad';
  return null;
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
  const where = country(e);
  if (where === 'abroad') out.push(`Outside the US: ${String(e.location || e.domain || e.website).split(/[;(]/)[0].slice(0, 60)}`);
  else if (!where) check.push('US location not confirmed');
  const n = headcount(e.size), sizeCrit = crit(e, /size|staff|ebitda|under_\d+/i);
  if (n && n.low > 150) out.push(`Too large: about ${n.low}${n.high > n.low ? `–${n.high}` : ''} people`);
  else if (n && n.high < 5) out.push(`Too small for $500K EBITDA: about ${n.high} ${n.high === 1 ? 'person' : 'people'}`);
  else if (n == null && sizeCrit.some(c => c.status === 'mismatch') && !/unknown|not (found|stated)|unclear/i.test(sizeCrit.find(c => c.status === 'mismatch').note || '')) out.push(`Size outside the buy box: ${(sizeCrit.find(c => c.status === 'mismatch').note || '').slice(0, 90)}`);
  else if (n == null && !sizeCrit.some(c => ['strong', 'partial'].includes(c.status))) check.push('Size not confirmed');
  return out.length ? { status: 'out', reasons: out } : check.length ? { status: 'check', reasons: check } : { status: 'in', reasons: [] };
}
