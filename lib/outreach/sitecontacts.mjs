// Free, proprietary contact finding: read the firm's OWN website (home, contact, about, team pages) and copy any email
// address on the firm's domain exactly as shown. Never a guessed address, never a marketplace or data broker.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const PATHS = ['', '/contact', '/contact-us', '/contactus', '/about', '/about-us', '/team', '/our-team', '/leadership', '/people', '/company'];
const LINK = /href=["']([^"'#]*(contact|about|team|leadership|people|staff|who-we-are|our-story|founder)[^"'#]*)["']/gi;
const BAD = /^(no-?reply|donotreply|example|test|privacy|abuse|postmaster|webmaster|wordpress|admin@wix|sentry)|\.(png|jpe?g|gif|svg|webp)$/i;

async function page(url, timeout = 12000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: ac.signal }); return r.ok ? await r.text() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
export const domainOf = w => String(w || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase();

/** Emails on the page, including mailto links and simple "name [at] firm [dot] com" spellings. */
export function emailsIn(html, domain) {
  const t = String(html || '').replace(/&#64;|&commat;/g, '@').replace(/&#46;/g, '.').replace(/\s*(\[at\]|\(at\)|\{at\})\s*/gi, '@').replace(/\s*(\[dot\]|\(dot\)|\{dot\})\s*/gi, '.');
  const out = new Set();
  for (const m of t.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const e = decodeURIComponent(m[0]).toLowerCase().replace(/^mailto:/, '').replace(/\.$/, '');
    const d = e.split('@')[1];
    if (BAD.test(e) || BAD.test(e.split('@')[0])) continue;
    if (domain && !(d === domain || d.endsWith('.' + domain))) continue; // only the firm's own domain
    out.add(e);
  }
  return [...out];
}

/** Match an address to a named person: first.last, flast, first, firstl, last. */
export function whose(email, people) {
  const local = email.split('@')[0].replace(/[^a-z]/g, '');
  for (const n of people) {
    const p = String(n || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean); if (p.length < 2) continue;
    const f = p[0], l = p.at(-1);
    if ([f + l, f[0] + l, f, f + l[0], l, l + f[0], l + f].includes(local)) return n;
  }
  return null;
}

const TITLE = /\b(ceo|cfo|coo|cto|cmo|founder|co-founder|owner|president|principal|partner|director|manager|vp|vice president|head of|lead|specialist|coordinator|analyst|account|executive|strategist|associate|consultant|officer|broker|representative|advisor|designer|marketer)\b/i;
const NAME = /^[A-Z][a-z'’.-]+(?:\s[A-Z][a-z'’.-]+){1,2}$/;
/** People shown on a team page: a "First Last" line with a job title on it or within the next two lines. */
export function teamCount(html) {
  const lines = String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(h\d|p|div|li|span|a|strong|b|figcaption)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const names = new Set();
  lines.forEach((l, i) => { if (NAME.test(l) && !TITLE.test(l) && lines.slice(i + 1, i + 3).some(x => x.length < 80 && TITLE.test(x))) names.add(l); });
  return names.size;
}

/** Read the firm's site and return [{ email, name, url }] plus phones; `fetcher` is injectable for tests. */
export async function siteContacts(website, people = [], { fetcher = page } = {}) {
  const domain = domainOf(website); if (!domain) return { emails: [], phones: [], pages: 0, contactPage: null };
  const base = `https://${domain}`, home = await fetcher(base) || await fetcher(`https://www.${domain}`);
  if (!home) return { emails: [], phones: [], pages: 0, contactPage: null };
  const linked = [...home.matchAll(LINK)].map(m => { try { return new URL(m[1], base + '/').href; } catch { return null; } }).filter(u => u && domainOf(u) === domain);
  const urls = [...new Set([...linked, ...PATHS.slice(1).map(p => base + p)])].slice(0, 8);
  const pages = [[base, home], ...await Promise.all(urls.map(async u => [u, await fetcher(u)]))].filter(([, h]) => h);
  const emails = new Map(), phones = new Map();
  for (const [url, html] of pages) {
    for (const e of emailsIn(html, domain)) if (!emails.has(e)) emails.set(e, { email: e, name: whose(e, people), url });
    for (const m of String(html).matchAll(/href=["']tel:([+\d().\s-]{10,20})["']/gi)) { const ph = m[1].trim(); if (!phones.has(ph)) phones.set(ph, { phone: ph, url }); }
  }
  // a named person's address first, then a general inbox
  const list = [...emails.values()].sort((a, b) => (!!b.name - !!a.name) || (/^(info|hello|contact|office|sales)@/.test(b.email) - /^(info|hello|contact|office|sales)@/.test(a.email)));
  // their contact page (for the contact-form message when no email is shown)
  const contactPage = pages.map(([u]) => u).find(u => /contact/i.test(new URL(u).pathname)) || null;
  // how many people their own team page shows (only pages about the team; 3+ to count, fewer is usually just the founders)
  const team = pages.filter(([u]) => /team|people|leadership|staff|about|who-we-are/i.test(new URL(u).pathname)).map(([u, h]) => ({ url: u, people: teamCount(h) })).sort((a, b) => b.people - a.people)[0];
  return { emails: list, phones: [...phones.values()], pages: pages.length, contactPage, team: team && team.people >= 3 ? team : null };
}
