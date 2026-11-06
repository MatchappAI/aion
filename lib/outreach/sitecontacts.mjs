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
  return { emails: list, phones: [...phones.values()], pages: pages.length, contactPage };
}
