// Radar: reads data sources directly (not web search) and keeps dated events in your own store.
// Sources, all free with no key: domain registration records (RDAP), the Internet Archive's saved copies of
// websites (Wayback), Google News headlines, and public company job boards (Greenhouse, Lever).
// Every event keeps its source link and date. Events feed the "Why now" timing badge, never the fit score.
import fs from 'node:fs'; import path from 'node:path';
import { runTools, parseJson } from './runner.mjs';
import { normName, normCo, domainOf } from './resolve.mjs';

// only public web pages: never this computer or the local network
const isPublic = u => { let h; try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return false; h = x.hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (!h || h === 'localhost' || /\.(localhost|local|internal)$/.test(h) || !h.includes('.') && !h.includes(':')) return false;
  if (/^(0|10|127)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
  if (h.includes(':') && (h === '::1' || h === '::' || /^(fc|fd|fe80)/.test(h) || h.startsWith('::ffff:'))) return false;
  return !/^\d+$/.test(h) && !/^0x/i.test(h); };
const UA = `Mozilla/5.0 (AION research${process.env.AION_CONTACT ? `; contact ${process.env.AION_CONTACT}` : ''})`;
let FILE = null, DB = { events: {}, checks: {}, scans: [], jobs: {} };
export function initRadar(dir) { FILE = path.join(dir, 'radar.json'); try { DB = { events: {}, checks: {}, scans: [], jobs: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {} }
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(DB)); } catch {} };

export const SOURCES = {
  rdap: 'Domain registration record',
  wayback: 'Internet Archive (saved copies of the website)',
  site: 'The company’s own website',
  news: 'Google News headlines',
  jobs: 'Company job board (Workday, Greenhouse, Lever or Ashby), with AION’s own record of when each role first appeared',
  contracts: 'Federal contract awards (USAspending.gov)',
  clients: 'Clients the firm names on its own website',
  team: 'Team page, then and now (Internet Archive)',
  growth: 'The firm’s own partner, careers and services pages',
};

async function get(url, { json = false, timeout = 25000 } = {}) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try {
    if (!isPublic(url)) return null;
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*' }, redirect: 'follow', signal: ac.signal });
    if (r.redirected && !isPublic(r.url)) return null;
    if (!r.ok) return null;
    return json ? await r.json() : await r.text();
  } catch { return null; } finally { clearTimeout(t); }
}
const ym = d => { const x = new Date(d); return isNaN(x) ? '' : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const tsDate = ts => `${ts.slice(0, 4)}-${ts.slice(4, 6)}`;
const text = html => String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ---------- sources ----------
export async function domainAge(domain) {
  const j = await get(`https://rdap.org/domain/${domain}`, { json: true }); if (!j) return null;
  const reg = (j.events || []).find(e => e.eventAction === 'registration')?.eventDate;
  return reg ? { registered: reg.slice(0, 10), url: `https://rdap.org/domain/${domain}` } : null;
}
// distinct versions of the homepage per year: a site that stopped changing is a site nobody is tending
export async function siteHistory(domain) {
  const j = await get(`https://web.archive.org/cdx/search/cdx?url=${domain}&output=json&fl=timestamp,digest&collapse=digest&filter=statuscode:200`, { json: true, timeout: 40000 });
  if (!Array.isArray(j) || j.length < 2) return null;
  const rows = j.slice(1).map(r => r[0]), years = {};
  for (const ts of rows) years[ts.slice(0, 4)] = (years[ts.slice(0, 4)] || 0) + 1;
  return { first: tsDate(rows[0]), last: tsDate(rows[rows.length - 1]), versions: rows.length, years, url: `https://web.archive.org/web/*/${domain}` };
}
// the firm's own pages: a partner or referral program, growth roles, capacity talk, an AI service, subcontract work
const GROWTH_LINK = /href=["']([^"'#]*(partner|referral|alliance|reseller|affiliate|careers?|jobs|join|services|solutions|ai\b|artificial)[^"'#]*)["']/gi;
const GROWTH = [
  ['partner_program', /\b(partner program|referral partners?( program)?|referral fees?|reseller program|become a (reseller|referral partner)|alliance partners?|affiliate program|join our (partner|referral) network)\b/i, 'likely'],
  ['growth_hiring', /\b((business development|partnerships?) (manager|director|executive|lead|representative)|(director|vp|vice president|head) of (business development|growth|partnerships))\b/i, 'likely', /career|jobs?\b|join-|join\/|hiring|openings|positions/i],
  ['capacity_strain', /\b(at (full )?capacity|wait ?list|waiting list|limited availability|now booking (into|for) (q[1-4]|20\d\d)|not (currently )?accepting new (clients|projects)|booked (out|solid))\b/i, 'possible'],
  ['ai_interest', /\b(ai[- ](powered|driven|enabled|readiness|strategy|consulting|services?)|artificial intelligence (services|solutions|consulting)|generative ai|machine learning (services|solutions))\b/i, 'likely'],
  ['subcontracts', /\b(white[- ]label|subcontract(or|ing)? (to|for|services)|teaming partner|prime contractors?|gsa schedule|sam\.gov)\b/i, 'possible'],
];
export async function growthSigns(domain) {
  const home = await get(`https://${domain}`); if (!home) return [];
  const links = [...new Set([...home.matchAll(GROWTH_LINK)].map(m => { try { return new URL(m[1], `https://${domain}/`).href; } catch { return null; } }).filter(u => u && domainOf(u) === domain && !/\/(feed|wp-json|tag|category)\b|\.(pdf|jpe?g|png|xml)$/i.test(u)))].slice(0, 4);
  const pages = [[`https://${domain}`, home], ...await Promise.all(links.map(async u => [u, await get(u, { timeout: 15000 })]))].filter(([, h]) => h);
  const out = [], seen = new Set();
  for (const [url, html] of pages) { const t = text(html);
    for (const [key, re, confidence, only] of GROWTH) { if (seen.has(key) || (only && !only.test(url))) continue; const m = t.match(re); if (!m) continue;
      const i = t.indexOf(m[0]), quote = t.slice(Math.max(0, i - 60), i + m[0].length + 60).replace(/^\S*\s/, '').replace(/\s\S*$/, '');
      seen.add(key); out.push({ source: 'site', signal: key, text: `Their site: “…${quote}…”`, url, date: '', direction: 'for', confidence: key === 'growth_hiring' && /job description|we recruit|our clients|placed/i.test(quote) ? 'possible' : confidence }); /* a recruiter's sample job pages are not its own hiring */ } }
  return out;
}
export async function footerYear(domain) {
  const h = await get(`https://${domain}`); if (!h) return null;
  const ys = [...h.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi)].map(m => +m[1]).filter(y => y > 1995 && y <= new Date().getFullYear() + 1);
  return ys.length ? { year: Math.max(...ys), url: `https://${domain}` } : null;
}
function parseRss(xml) {
  return [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const f = k => (m[1].match(new RegExp(`<${k}[^>]*>([\\s\\S]*?)<\\/${k}>`)) || [])[1] || '';
    const un = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    return { title: un(f('title')), url: un(f('link')), date: ym(un(f('pubDate'))), source: un(f('source')) };
  }).filter(x => x.title && x.url);
}
export async function news(q, days = 730) {
  const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q + (days ? ` when:${days}d` : ''))}&hl=en-US&gl=US&ceid=US:en`);
  return xml ? parseRss(xml) : [];
}
const SENIOR = /\b(vp|vice president|director|head of|chief|coo|plant manager|general manager|operations manager|supply chain manager|logistics manager)\b/i;
const OPS = /\b(operations|supply chain|logistics|plant|manufacturing|warehouse|distribution|procurement|sourcing|materials|production)\b/i;
// ---------- job boards: find the system behind the careers page, then read it directly ----------
const ATS = [
  [/https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/, m => ({ kind: 'Workday', tenant: m[1], wd: m[2], site: m[3] })],
  [/(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i, m => ({ kind: 'Greenhouse', slug: m[1] })],
  [/jobs\.lever\.co\/([a-z0-9_-]+)/i, m => ({ kind: 'Lever', slug: m[1] })],
  [/jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i, m => ({ kind: 'Ashby', slug: m[1] })],
];
const daysFrom = t => { const m = String(t || '').match(/(\d+)\+?\s*days?/i); return /today/i.test(t) ? 0 : /yesterday/i.test(t) ? 1 : m ? +m[1] : null; };
const ageOf = d => d ? Math.round((Date.now() - new Date(d)) / 864e5) : null;
async function readBoard(b) {
  if (b.kind === 'Workday') {
    const base = `https://${b.tenant}.${b.wd}.myworkdayjobs.com`, out = new Map();
    for (const q of ['operations', 'supply chain', 'plant manager', 'logistics']) {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 20000);
      try {
        const r = await fetch(`${base}/wday/cxs/${b.tenant}/${b.site}/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: q }), signal: ac.signal });
        const j = r.ok ? await r.json() : null;
        for (const x of j?.jobPostings || []) out.set(x.externalPath, { title: x.title, url: `${base}/${b.site}${x.externalPath}`, days: daysFrom(x.postedOn), place: x.locationsText || '' });
      } catch {} finally { clearTimeout(t); }
    }
    return { board: 'Workday', url: `${base}/${b.site}`, roles: [...out.values()] };
  }
  if (b.kind === 'Greenhouse') { const g = await get(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs`, { json: true, timeout: 15000 }); return g?.jobs ? { board: 'Greenhouse', url: `https://boards.greenhouse.io/${b.slug}`, roles: g.jobs.map(j => ({ title: j.title, url: j.absolute_url, days: ageOf(j.first_published), place: j.location?.name || '' })) } : null; }
  if (b.kind === 'Lever') { const l = await get(`https://api.lever.co/v0/postings/${b.slug}?mode=json`, { json: true, timeout: 15000 }); return Array.isArray(l) ? { board: 'Lever', url: `https://jobs.lever.co/${b.slug}`, roles: l.map(j => ({ title: j.text, url: j.hostedUrl, days: ageOf(j.createdAt), place: j.categories?.location || '' })) } : null; }
  if (b.kind === 'Ashby') { const a = await get(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}`, { json: true, timeout: 15000 }); return a?.jobs ? { board: 'Ashby', url: `https://jobs.ashbyhq.com/${b.slug}`, roles: a.jobs.map(j => ({ title: j.title, url: j.jobUrl, days: ageOf(j.publishedAt), place: j.location || '' })) } : null; }
  return null;
}
export function boardFrom(html) { for (const [re, f] of ATS) { const m = String(html || '').match(re); if (m) return f(m); } return null; }
export async function findBoard(company, domain) {
  const home = await get(`https://${domain}`, { timeout: 15000 });
  const links = [...String(home || '').matchAll(/href=["']([^"'#]+)["']/gi)].map(m => m[1]);
  const careers = links.find(h => /career|jobs|join-?us|work-?with-?us|employment|opportunit/i.test(h));
  let page = ''; if (careers) { try { page = await get(new URL(careers, `https://${domain}`).href, { timeout: 15000 }); } catch {} }
  const found = boardFrom(`${home || ''} ${page || ''} ${careers || ''}`);
  if (found) { const r = await readBoard(found); if (r) return r; }
  // no link found: try the company name as the board name on the boards that allow a lookup by name
  for (const sl of [...new Set([domain.split('.')[0], normCo(company).replace(/\s+/g, '')])].filter(x => x.length > 2))
    for (const kind of ['Greenhouse', 'Lever', 'Ashby']) { const r = await readBoard({ kind, slug: sl }); if (r) return r; }
  return null;
}
const JUNIOR = /\b(assistant|associate|coordinator|specialist|analyst|intern|clerk|technician|representative|supervisor)\b/i, NOT_OPS = /\b(it|information technology|software|data|cloud|network|security|devops|marketing|sales|finance|hr|human resources)\b/i;
const SENIOR_OPS = t => SENIOR.test(t) && OPS.test(t) && !JUNIOR.test(t) && !NOT_OPS.test(t);
/** AION's own record of every senior role it has seen, so "open a long time" and "posted again" come from our data, not a guess. */
export function jobHistory(key, roles, now = new Date().toISOString()) {
  const H = DB.jobs[key] ??= {}, seen = new Set(), out = [];
  for (const r of roles) {
    const k = r.title.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); seen.add(k);
    const h = H[k] ??= { title: r.title, firstSeen: now, lastSeen: now, gone: null, reposts: 0 };
    if (h.gone) { h.reposts++; h.gone = null; }
    h.lastSeen = now; h.url = r.url; out.push({ ...r, ours: Math.round((new Date(now) - new Date(h.firstSeen)) / 864e5), reposts: h.reposts });
  }
  for (const [k, h] of Object.entries(H)) if (!seen.has(k) && !h.gone) h.gone = now;
  return out;
}

// ---------- federal contract awards: a jump in awards usually means hiring to deliver them ----------
const USA = 'https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/';
const GOODS = ['31', '32', '33', '48', '49']; // manufacturing, transport and warehousing (federal wholesale is mostly IT resellers)
async function usaRecipients(filters, limit = 10) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 40000);
  try { const r = await fetch(USA, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ filters: { award_type_codes: ['A', 'B', 'C', 'D'], ...filters }, limit }), signal: ac.signal }); return r.ok ? (await r.json()).results || [] : []; }
  catch { return []; } finally { clearTimeout(t); }
}
const iso = d => d.toISOString().slice(0, 10), back = m => { const d = new Date(); d.setMonth(d.getMonth() - m); return d; };
const money = v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1e3) + 'K');
export async function contracts(company) {
  const n = normCo(company), head = n.split(' ').slice(0, 2).join(' '); if (n.split(' ')[0].length < 3) return null;
  const per = async (a, b) => (await usaRecipients({ recipient_search_text: [company], time_period: [{ start_date: iso(back(a)), end_date: iso(back(b)) }] }, 5)).filter(r => { const x = normCo(r.name); return x === head || x.startsWith(head + ' '); });
  const [last, prior] = await Promise.all([per(12, 0), per(24, 12)]);
  const sum = xs => xs.reduce((t, r) => t + (r.amount || 0), 0), top = last[0] || prior[0]; if (!top) return null;
  return { last: sum(last), prior: sum(prior), name: top.name, url: top.recipient_id ? `https://www.usaspending.gov/recipient/${top.recipient_id}/latest` : 'https://www.usaspending.gov/search' };
}
export async function contractScan(stateCode) {
  const loc = [{ country: 'USA', state: stateCode }], f = (a, b) => ({ place_of_performance_locations: loc, naics_codes: { require: GOODS }, time_period: [{ start_date: iso(back(a)), end_date: iso(back(b)) }] });
  const now = (await usaRecipients(f(6, 0), 100)).filter(r => r.amount >= 1e6 && r.amount <= 3e8).slice(0, 30);
  // check each one on its own: what it won here the 6 months before, and how big it is nationally (the giants have their own recruiting teams)
  const rows = await Promise.all(now.map(async r => {
    const [prior, natl] = await Promise.all([usaRecipients({ ...f(12, 6), recipient_search_text: [r.name] }, 3), usaRecipients({ recipient_search_text: [r.name], time_period: [{ start_date: iso(back(12)), end_date: iso(back(0)) }] }, 3)]);
    const same = x => normCo(x.name) === normCo(r.name);
    return { name: r.name, last: r.amount, prior: prior.filter(same).reduce((t, x) => t + (x.amount || 0), 0), national: natl.filter(same).reduce((t, x) => t + (x.amount || 0), 0), url: r.recipient_id ? `https://www.usaspending.gov/recipient/${r.recipient_id}/latest` : '' };
  }));
  return rows.filter(r => r.national < 1e9 && (r.prior === 0 || r.last / r.prior >= 1.5))
    .sort((a, b) => (b.prior ? b.last / b.prior : 10) - (a.prior ? a.last / a.prior : 10)).slice(0, 15)
    .map(r => ({ ...r, text: r.prior ? `${money(r.last)} in the last 6 months, ${(r.last / r.prior).toFixed(1)}× the 6 months before` : `${money(r.last)} in the last 6 months, none the 6 months before` }));
}

// ---------- client trail: the clients a firm names on its own placement, client and case-study pages ----------
const CLIENTPAGE = /(placement|clients?|case-?stud|success|portfolio|recent-?search|who-?we-?serve|testimonial|our-?work|results)/i;
export async function clientBook(company, domain, { cwd, model }) {
  const home = await get(`https://${domain}`, { timeout: 15000 }); if (!home) return null;
  const urls = [...new Set([...home.matchAll(/href=["']([^"'#]+)["']/gi)].map(m => { try { return new URL(m[1], `https://${domain}`).href; } catch { return ''; } }).filter(u => u && domainOf(u) === domain && CLIENTPAGE.test(u)))].slice(0, 4);
  const pages = (await Promise.all(urls.map(async u => ({ url: u, text: text(await get(u, { timeout: 15000 })).slice(0, 8000) })))).filter(p => p.text.length > 300);
  if (!pages.length) return { pages: 0, clients: [] };
  const prompt = `Pages from the website of ${company}, a specialized professional services firm (for example a search, engineering, consulting, inspection or implementation firm). List the client companies the firm names as clients or in case studies, or as employers it placed people with. Only company names that appear word for word below; skip the firm itself, job boards, schools and associations.\n\n${pages.map((p, i) => `PAGE ${i}: ${p.url}\n"""${p.text}"""`).join('\n\n')}\n\nReturn JSON: {"clients":[{"company":"","role":"<role placed, if the page says>","page":0}]}`;
  let r; try { r = parseJson((await runTools({ prompt, model, cwd, timeoutMs: 120000 })).text) || {}; } catch { return null; }
  const seen = new Map();
  for (const c of r.clients || []) {
    const p = pages[+c.page] || pages[0];
    if (!c.company || normCo(c.company) === normCo(company) || !normCo(p.text).includes(normCo(c.company))) continue;
    const k = normCo(c.company), x = seen.get(k) || { company: c.company, roles: [], url: p.url };
    if (c.role && !/not (specified|named|say)|unnamed|doesn.t name|unspecified|unknown/i.test(c.role)) x.roles.push(c.role); seen.set(k, x);
  }
  return { pages: pages.length, clients: [...seen.values()] };
}

// the team page years ago vs now, read from saved copies; names must appear word for word in the page text
export async function teamChange(domain, { cwd, model }) {
  const j = await get(`https://web.archive.org/cdx/search/cdx?url=${domain}/*&output=json&fl=timestamp,original&collapse=digest&filter=statuscode:200&filter=mimetype:text/html&filter=original:.*(team|about|people|leadership|our-firm|who-we-are|staff).*&limit=600`, { json: true, timeout: 40000 });
  if (!Array.isArray(j) || j.length < 3) return null;
  const rows = j.slice(1).map(([ts, original]) => ({ ts, original })), now = Date.now();
  const yrs = r => (now - new Date(`${r.ts.slice(0, 4)}-${r.ts.slice(4, 6)}-01`)) / 3.15e10;
  const newest = rows[rows.length - 1], old = rows.filter(r => yrs(r) >= 3).pop() || rows[0];
  if (old === newest || yrs(old) - yrs(newest) < 1.5) return null;
  const snap = r => `https://web.archive.org/web/${r.ts}id_/${r.original}`;
  const [a, b] = await Promise.all([get(snap(old), { timeout: 40000 }), get(snap(newest), { timeout: 40000 })]);
  const ta = text(a).slice(0, 7000), tb = text(b).slice(0, 7000); if (ta.length < 200 || tb.length < 200) return null;
  const prompt = `Two saved copies of the same firm's team or about page. THEN (${tsDate(old.ts)}):\n"""${ta}"""\n\nNOW (${tsDate(newest.ts)}):\n"""${tb}"""\n\nCompare who is listed. Use only names that appear word for word above. Return JSON: {"left":[{"name":"","title":""}],"joined":[{"name":"","title":""}],"founder":{"name":"","title_then":"","title_now":""},"new_second_in_command":{"name":"","title":""}}. Leave a field empty when the pages do not show it.`;
  let r; try { r = parseJson((await runTools({ prompt, model, cwd, timeoutMs: 120000 })).text) || {}; } catch { return null; }
  const inT = (n, t) => { const w = normName(n).split(' ').filter(x => x.length > 1); return w.length >= 2 && w.every(x => normName(t).includes(x)); };
  return { then: tsDate(old.ts), now: tsDate(newest.ts), thenUrl: snap(old).replace('id_/', '/'), nowUrl: snap(newest).replace('id_/', '/'),
    left: (r.left || []).filter(p => p.name && inT(p.name, ta) && !inT(p.name, tb)), joined: (r.joined || []).filter(p => p.name && inT(p.name, tb) && !inT(p.name, ta)),
    founder: r.founder?.name && inT(r.founder.name, tb) ? r.founder : null, second: r.new_second_in_command?.name && inT(r.new_second_in_command.name, tb) && !inT(r.new_second_in_command.name, ta) ? r.new_second_in_command : null };
}

// ---------- headlines → events, by plain keyword rules anyone can check ----------
const ROLE = '(ceo|coo|cfo|president|chief \\w+ officer|chief|vp|vice president|director|head of|managing (director|partner)|partner|plant manager|general manager)';
const RULES = [
  ['new_owner', /\b(acquired by|to be acquired|agrees? to (be acquired|sell)|sold to|sells (itself |the company )?to|recapitaliz\w*|majority (stake|investment)|investment from|backed by|private equity firm \w+ (buys|acquires))\b/i],
  ['acquisition', /\b(acquires?|acquisition of|buys|merg\w* with)\b/i],
  ['retirement', /\b(retires|to retire|will retire|retiring|retirement of|announces (his |her )?retirement|steps? down|stepping down|successor|succession plan)\b/i],
  ['leadership_change', new RegExp(`\\b(appoint\\w*|names|named|hires|promot\\w*|joins as|welcomes)\\b.{0,60}\\b${ROLE}\\b|\\bnew ${ROLE}\\b`, 'i')],
  ['new_site', /\b(expan\w*|new (plant|facility|factory|distribution center|warehouse|headquarters|location)|breaks ground|groundbreaking|to create \d+|will create \d+|invest\w* \$\d|opens? (a |its |new )?\w*\s?(plant|facility|center|warehouse))\b/i],
  ['alliance', /\b(partners? with|partnership with|announces? (a |new |strategic )?partnership|teams? up with|strategic alliance|joins forces|joint venture)\b/i],
  ['new_service', /\b(launch(es|ed)? (a |new |its )?\w*\s?(service|practice|offering|division|platform)|unveils|introduces (a |new )?\w*\s?(service|practice|offering)|expands (its )?(services|offerings))\b/i],
  ['ai_interest', /\b(AI|artificial intelligence|generative|automation)\b.{0,40}\b(launch|adopt|roll|partner|introduc|deploy|webinar|tool|service)\w*/i],
  ['layoffs', /\b(layoffs?|lay off|warn notice|plant closing|closure|closing (its|the) |job cuts)\b/i],
];
const FINANCE = /\b(stock|shares|overvalued|undervalued|earnings call|price target|dividend|analysts?|buy rating|sell rating)\b/i;
const NOISE = /\b(named (to|one of|among|a |as one)|list of|award\w*|best places|ranked|ranking|top \d+)\b/i;
const nameIn = (name, title) => { const n = normCo(name); return n.length > 2 && normCo(title).includes(n); };
// the company must be the subject: named before the event word, in a statement (not a question), and not an award or list
export function headlineEvents(mode, name, items) {
  const out = [], seen = new Set();
  for (const it of items) {
    const head = it.title.replace(/\s+-\s+[^-]+$/, ''), norm = normCo(head);
    if (!nameIn(name, head) || /\?\s*$/.test(head) || FINANCE.test(head) || seen.has(norm)) continue;
    // a one-word company name opening the headline after a capitalized first name is a person (Jeff Eaton is not Eaton)
    const one = name.trim().split(/\s+/);
    if (one.length === 1 && new RegExp(`^[A-Z][a-z]+\\s+${one[0]}\\b`).test(head)) continue;
    const rule = RULES.find(([, re]) => re.test(head)); if (!rule) continue;
    if (mode === 'target' && !aboutFirm(name, head)) continue; // a namesake, not this firm
    if (rule[0] === 'leadership_change' && NOISE.test(head)) continue;
    const at = head.search(rule[1]), pos = normCo(head.slice(0, Math.max(0, at) + 1)).includes(normCo(name)) || normCo(head).indexOf(normCo(name)) <= 2;
    if (!pos) continue;
    seen.add(norm);
    let key = rule[0], direction = 'for';
    if (key === 'acquisition') { key = mode === 'client' ? 'new_site' : mode === 'target' ? 'other' : 'company_acquired'; if (mode === 'target') direction = 'against'; } // a firm that is buying others is growing, not selling
    if (mode === 'target' && key === 'new_owner') direction = 'against'; // already bought: not available
    if (mode === 'target' && key === 'leadership_change') key = 'second_in_command';
    if (mode !== 'target' && ['alliance', 'new_service', 'ai_interest'].includes(key)) continue;
    if (mode === 'client' && key === 'retirement') key = 'empty_chair';
    if (mode === 'candidate' && key === 'layoffs') key = 'site_closing';
    if (mode === 'candidate' && key === 'new_owner') key = 'company_acquired';
    out.push({ source: 'news', signal: key, text: `${it.title}${it.source ? ` (${it.source})` : ''}`, url: it.url, date: it.date, direction, confidence: 'likely' });
  }
  return out;
}

const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
/** A job location is in the US: blank, "United States", "Remote", a state name, or a two-letter state code at the end. */
export function usPlace(p) { const t = String(p || '').trim(); if (!t || /united states|\busa?\b|remote/i.test(t)) return true; if (stateOf(t)) return true; const m = t.match(/\b([A-Z]{2})\s*$/); return !!(m && STATES[m[1]]); }
export function stateOf(loc) { const t = String(loc || ''); for (const [ab, nm] of Object.entries(STATES)) if (new RegExp(`\\b${nm}\\b`, 'i').test(t) || new RegExp(`,\\s*${ab}\\b`).test(t)) return nm; return ''; }

// ---------- one entity: run every source that fits, return dated events ----------
export async function forEntity(mode, e, { cwd, model }) {
  const cand = mode === 'candidate', name = cand ? e.name : e.company, domain = cand ? '' : domainOf(e.website || ''), ev = [], ran = [];
  const yearNow = new Date().getFullYear();
  if (cand) {
    // people: only public headlines that name them with their employer
    const items = await news(`"${name}"${e.employer ? ` "${String(e.employer).split(/[,(]/)[0].trim()}"` : ''}`); ran.push('news');
    for (const it of items) if (normName(it.title).includes(normName(name))) {
      const rule = RULES.find(([, re]) => re.test(it.title)); if (rule) ev.push({ source: 'news', signal: { retirement: 'other', leadership_change: 'raising_profile', new_owner: 'company_acquired', layoffs: 'site_closing', new_site: 'other' }[rule[0]], text: it.title, url: it.url, date: it.date, direction: 'for', confidence: 'possible' });
    }
  } else {
    const [age, hist, foot, items, board] = await Promise.all([
      domain ? domainAge(domain) : null, domain && mode === 'target' ? siteHistory(domain) : null, domain && mode === 'target' ? footerYear(domain) : null,
      news(`"${name}"${mode === 'client' && stateOf(e.location) ? ` ${stateOf(e.location)}` : ''}`), mode === 'client' && domain ? findBoard(name, domain) : null]);
    const fed = mode === 'client' ? await contracts(name) : null;
    if (domain) ran.push('rdap'); if (mode === 'target' && domain) ran.push('wayback', 'site'); ran.push('news'); if (mode === 'client' && domain) ran.push('jobs'); if (mode === 'client') ran.push('contracts');
    if (fed) {
      if (fed.last >= 1e6 && (fed.prior === 0 || fed.last / fed.prior >= 1.5)) ev.push({ source: 'contracts', signal: 'contract_win', text: `Federal contract awards up: ${money(fed.last)} in the last 12 months vs ${money(fed.prior)} the year before (${fed.name})`, url: fed.url, date: '', direction: 'for', confidence: 'likely' });
      else if (fed.last > 0) ev.push({ source: 'contracts', signal: 'other', text: `Federal contract awards: ${money(fed.last)} in the last 12 months vs ${money(fed.prior)} the year before`, url: fed.url, date: '', direction: 'info', confidence: 'likely' });
    }
    ev.push(...headlineEvents(mode, name, items));
    if (mode === 'target') {
      if (age) { const yrs = yearNow - +age.registered.slice(0, 4); ev.push({ source: 'rdap', signal: 'other', text: `Website domain registered in ${age.registered.slice(0, 4)}: online for ${yrs} years`, url: age.url, date: '', direction: 'info', confidence: 'likely' }); }
      if (hist) {
        const recent = [0, 1, 2].reduce((t, k) => t + (hist.years[yearNow - k] || 0), 0), before = [3, 4, 5].reduce((t, k) => t + (hist.years[yearNow - k] || 0), 0);
        const lastYrs = yearNow - +hist.last.slice(0, 4);
        if (before >= 3 && recent <= before * 0.4) ev.push({ source: 'wayback', signal: 'going_quiet', text: `Homepage changed ${recent} time${recent === 1 ? '' : 's'} in the last 3 years vs ${before} in the 3 before (saved copies since ${hist.first.slice(0, 4)})`, url: hist.url, date: '', direction: 'for', confidence: 'possible' });
        else if (lastYrs >= 3) ev.push({ source: 'wayback', signal: 'going_quiet', text: `No change to the homepage seen since ${hist.last}`, url: hist.url, date: '', direction: 'for', confidence: 'possible' });
      }
      if (domain) { const g = await growthSigns(domain); ran.push('growth'); ev.push(...g); }
      if (foot && foot.year <= yearNow - 2) ev.push({ source: 'site', signal: 'stale_website', text: `Website footer still says © ${foot.year}`, url: foot.url, date: '', direction: 'for', confidence: 'likely' });
      if (domain) {
        const book = await clientBook(name, domain, { cwd, model }); ran.push('clients'); if (book) e.clientBook = book;
        if (book?.clients?.length) ev.push({ source: 'clients', signal: 'other', text: `Names ${book.clients.length} client${book.clients.length === 1 ? '' : 's'} on its own pages: ${book.clients.slice(0, 5).map(c => c.company).join(', ')}${book.clients.length > 5 ? '…' : ''}`, url: book.clients[0].url, date: '', direction: 'info', confidence: 'likely' });
      }
      if (domain) { const t = await teamChange(domain, { cwd, model }); ran.push('team');
        if (t) {
          if (t.second) ev.push({ source: 'team', signal: 'second_in_command', text: `${t.second.name} (${t.second.title || 'senior role'}) appears on the team page since ${t.then}`, url: t.nowUrl, date: t.now, direction: 'for', confidence: 'likely' });
          if (t.founder && t.founder.title_then && t.founder.title_now && t.founder.title_then !== t.founder.title_now) ev.push({ source: 'team', signal: 'succession', text: `${t.founder.name}: “${t.founder.title_then}” in ${t.then}, now “${t.founder.title_now}”`, url: t.nowUrl, date: t.now, direction: 'for', confidence: 'likely' });
          const senior = t.left.find(p => /partner|president|vice president|\bvp\b|director|principal|coo|general manager/i.test(p.title || ''));
          if (senior) ev.push({ source: 'team', signal: 'partner_left', text: `${senior.name} (${senior.title}) is no longer on the team page, listed in ${t.then}`, url: t.nowUrl, date: t.now, direction: 'for', confidence: 'possible' });
          if (t.left.length >= 2) ev.push({ source: 'team', signal: 'going_quiet', text: `${t.left.length} people listed in ${t.then} are no longer on the team page (${t.left.slice(0, 3).map(p => p.name).join(', ')})`, url: t.nowUrl, date: t.now, direction: 'for', confidence: 'possible' });
          if (t.joined.length >= 3 && !t.left.length) ev.push({ source: 'team', signal: 'other', text: `The team grew: ${t.joined.length} people added since ${t.then}, so the owner is still building`, url: t.nowUrl, date: t.now, direction: 'against', confidence: 'possible' });
        }
      }
    }
    if (board) {
      // US roles only, the client's own state first: a plant manager opening in another country is not a lead for a US search firm
      const home = stateOf(e.location), inUS = r => usPlace(r.place);
      const pick = board.roles.filter(r => SENIOR_OPS(r.title) && inUS(r)).sort((a, b) => (stateOf(b.place) === home) - (stateOf(a.place) === home));
      const roles = jobHistory(`c:${domain}`, [...new Map(pick.map(x => [x.title.toLowerCase(), x])).values()]);
      for (const r of roles.slice(0, 5)) { const days = Math.max(r.days ?? 0, r.ours);
        ev.push({ source: 'jobs', signal: r.reposts ? 'reposted' : days >= 60 ? 'ghost_job' : 'empty_chair', text: `Open on their ${board.board} job board: ${r.title}${r.place ? ` (${r.place})` : ''}${days ? `, open at least ${days} days` : ', new'}${r.reposts ? `, posted again ${r.reposts} time${r.reposts === 1 ? '' : 's'} by AION’s record` : ''}`, url: r.url || board.url, date: '', direction: 'for', confidence: 'likely' }); }
      if (!roles.length) ev.push({ source: 'jobs', signal: 'other', text: `${board.board} job board read: ${board.roles.length} open role${board.roles.length === 1 ? '' : 's'} found, none senior in operations or supply chain`, url: board.url, date: '', direction: 'info', confidence: 'likely' });
    }

  }
  const key = cand ? `p:${normName(name)}` : `c:${domain || normCo(name)}`, at = new Date().toISOString(), fresh = [];
  // the latest check replaces this company's events, so a corrected rule also removes what it used to get wrong
  const now = new Set(ev.map(x => `${key}|${x.signal}|${x.url}`));
  for (const id of Object.keys(DB.events)) if (DB.events[id].key === key && !now.has(id)) delete DB.events[id];
  for (const x of ev) { const id = `${key}|${x.signal}|${x.url}`; if (!DB.events[id]) { DB.events[id] = { id, key, name, mode, ...x, firstSeen: at }; fresh.push(id); } }
  DB.checks[key] = { at, ran }; save();
  return { events: ev.map(x => ({ ...x, sourceName: SOURCES[x.source], isNew: fresh.includes(`${key}|${x.signal}|${x.url}`) })), ran: ran.map(k => SOURCES[k]) };
}

// ---------- demand radar: announcements that come 6–18 months before senior hiring ----------
export async function demandScan({ region, industry = 'manufacturing OR logistics OR distribution', days = 60 }, { cwd, model }) {
  const qs = [`(expansion OR "new facility" OR "new plant" OR "distribution center") jobs ${region}`, `(${industry}) ("to create" OR "will create") jobs ${region}`, `(${industry}) ("plant manager" OR "vice president of operations" OR "supply chain") (named OR appoints OR retires) ${region}`, `("WARN notice" OR layoffs) (${industry}) ${region}`];
  const items = [...new Map((await Promise.all(qs.map(q => news(q, days)))).flat().map(x => [x.url, x])).values()].slice(0, 120);
  const stc = Object.entries(STATES).find(([ab, nm]) => normCo(nm) === normCo(region) || ab.toLowerCase() === normCo(region))?.[0];
  const fedP = stc ? contractScan(stc) : Promise.resolve([]);
  if (!items.length) { const scan = { id: 'd' + Date.now().toString(36), region, industry, days, at: new Date().toISOString(), headlines: 0, items: [], contracts: await fedP }; DB.scans = [scan, ...DB.scans].slice(0, 20); save(); return scan; }
  const prompt = `News headlines (title, date, link id). For each one that names a specific company doing something that usually leads to hiring senior operations, plant, supply-chain or logistics leaders within 6–18 months (a new or expanded site, jobs announced, a leader retiring or leaving, a takeover, layoffs or a closure), return it. Only companies that make, move, store or distribute physical goods: manufacturing, logistics, warehousing, distribution, food processing, building materials, energy equipment. Skip banks, credit unions, software, consulting, staffing, healthcare services, government and schools. Skip headlines that name no company. "place" is where the site or event is, as the headline says it. Use only what the headline says.\n\n${items.map((x, i) => `${i}. ${x.title} | ${x.date}`).join('\n')}\n\nReturn JSON: {"items":[{"i":0,"company":"","place":"","state":"<full US state name where it happens, from the headline or the place; empty if unclear>","what":"new_site|jobs|leader_change|takeover|layoffs","summary":"<under 15 words>","jobs":0}]}`;
  let r; try { r = parseJson((await runTools({ prompt, model, cwd, timeoutMs: 180000 })).text) || {}; } catch (e) { return { region, items: [], error: e.message, at: new Date().toISOString() }; }
  const inRegion = x => { const want = normCo(region), st = Object.entries(STATES).find(([ab, nm]) => normCo(nm) === want || ab.toLowerCase() === want); const names = st ? [st[1], st[0]] : [region]; if (x.state && st) return normCo(x.state) === normCo(st[1]); const hay = `${x.place} ${items[x.i].title}`; return names.some(n => new RegExp(`(?<!West )\\b${n}\\b`, n.length === 2 ? '' : 'i').test(hay)); };
  const seenCo = [], dup = c => { const n = normCo(c); return seenCo.some(x => x === n || x.startsWith(n + ' ') || n.startsWith(x + ' ')); };
  const out = (r.items || []).filter(x => items[x.i] && x.company && nameIn(x.company, items[x.i].title) && inRegion(x) && !dup(x.company) && seenCo.push(normCo(x.company))).map(x => ({ company: x.company, place: [x.place, x.state && !String(x.place || '').includes(x.state) ? x.state : ''].filter(Boolean).join(', '), what: x.what, summary: x.summary || '', jobs: +x.jobs || 0, title: items[x.i].title, url: items[x.i].url, date: items[x.i].date }));
  const scan = { id: 'd' + Date.now().toString(36), region, industry, days, at: new Date().toISOString(), headlines: items.length, items: out.sort((a, b) => b.date.localeCompare(a.date)), contracts: await fedP };
  DB.scans = [scan, ...DB.scans].slice(0, 20); save();
  return scan;
}
export const scans = () => DB.scans;
export const recentEvents = (days = 45) => { const since = Date.now() - days * 864e5; return Object.values(DB.events).filter(x => new Date(x.firstSeen) >= since).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen)).slice(0, 60).map(x => ({ ...x, sourceName: SOURCES[x.source] })); };
export const lastCheck = (mode, e) => DB.checks[mode === 'candidate' ? `p:${normName(e.name)}` : `c:${domainOf(e.website || '') || normCo(e.company)}`] || null;

// ---------- deal intent: partnership and sale clues for every firm to buy, read straight from their sites and headlines (no AI, no cost) ----------
const pool = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch {} } })); };
// the headline is about this firm doing something: its exact name (any "Group", "Inc." after it), then the event straight away.
// Drops namesakes ("Harborview Live! expands", "Acme Foods expands", "China Southern Airlines") and people who share the name.
const FIRMWORD = /^(,?\s*(inc\.?|llc|l\.l\.c\.|corp\.?|co\.|ltd\.?|group|consulting|consultants|partners|associates|advisors|advisory|search|staffing|solutions|services|international|usa|us|global|&\s*co\.?))+/i;
const EVENT = /^\s*(,|:|-|–)?\s*(partners?|teams?|joins|announces?|launch|unveils|introduces|expands?|names|appoints|welcomes|hires|promotes|adds|opens|selects|signs|forms|enters|rolls|debuts|retires|retiring|steps|acquires|acquired|buys|sold|sells|merges|agrees|to be|completes|wins|awarded|breaks|invests|moves|relocates|grows|celebrates|marks|founder|ceo|president|chairman)/i;
export function aboutFirm(name, head) {
  const n = String(name || '').trim(); if (n.length < 3) return false;
  const re = new RegExp(`(^|[^A-Za-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`); const m = String(head).match(re); if (!m) return false;
  const at = m.index + m[0].length, before = head.slice(0, m.index + m[1].length).trim();
  if (before && /[A-Z][\w'’-]*$/.test(before) && !/^(and|with|by|for|at|as|from|to)$/i.test(before.split(/\s+/).pop())) return false;
  const raw = head.slice(at), rest = raw.replace(FIRMWORD, '');
  return EVENT.test(rest) || EVENT.test(raw) || /^\s*(and|&)\s+[\w .&'’-]{2,40}?\s+(announce|launch|partner|form|sign|team|unveil|introduce)/i.test(rest);
}
const INTENT_NEWS = new Set(['alliance', 'new_service', 'ai_interest', 'retirement', 'second_in_command']);
export async function intentScan(searches, { save = () => {}, progress = () => {} } = {}) {
  const { timing, listedFor } = await import('./timing.mjs');
  const { siteContacts } = await import('../outreach/sitecontacts.mjs'); const { ownerOf } = await import('./rank.mjs');
  const byDom = new Map();
  for (const s of searches) { if (s?.mode !== 'target') continue;
    for (const e of s.entities || []) { if (!e.scored || e.decision === 'rejected') continue; const d = domainOf(e.website || '') || '';
      const k = d || normCo(e.company || ''); if (!k) continue; if (!byDom.has(k)) byDom.set(k, { d, name: e.company, hits: [] }); byDom.get(k).hits.push([s, e]); } }
  const firms = [...byDom.values()]; let done = 0; progress({ done, total: firms.length });
  await pool(firms, 4, async f => {
    const people = [...new Set(f.hits.flatMap(([, e]) => [ownerOf(e), ...(e.contacts || []).map(c => c.name)]).filter(Boolean))];
    const [site, items, sc] = await Promise.all([f.d ? growthSigns(f.d) : [], news(`"${f.name}"`), f.d ? siteContacts(f.d, people).catch(() => null) : null]);
    const ev = [...site, ...headlineEvents('target', f.name, items).filter(x => INTENT_NEWS.has(x.signal) && aboutFirm(f.name, x.text))].map(x => ({ ...x, source: 'intent' }));
    for (const [s, e] of f.hits) {
      // earlier headline clues about a namesake (another company with the same name) go too
      const keep = (e.timing?.signals || []).filter(x => x.source !== 'intent' && !(x.source === 'radar' && /news\.google|news\./.test(x.url || '') && !aboutFirm(f.name, x.text))).map(x => ({ ...x, signal: x.key }));
      if (listedFor((e.timing?.signals || []).map(x => ({ ...x, signal: x.key })), e)) e.listed = true; // marketed for sale already: kept aside, not proprietary
      // emails and phones shown on their own website, copied exactly (free; never guessed)
      for (const x of sc?.emails || []) if (!(e.contactInfo ||= []).some(c => String(c.value).toLowerCase() === x.email)) e.contactInfo.push({ person: x.name || 'Company', kind: 'email', value: x.email, url: x.url, verified: true, source: 'their website' });
      for (const x of sc?.phones || []) if (!(e.contactInfo ||= []).some(c => c.value === x.phone)) e.contactInfo.push({ person: 'Company', kind: 'phone', value: x.phone, url: x.url, source: 'their website' });
      if (sc?.contactPage && !(e.contactInfo ||= []).some(c => c.kind === 'contact_page')) e.contactInfo.push({ person: 'Company', kind: 'contact_page', value: sc.contactPage, url: sc.contactPage, source: 'their website' });
      e.timing = timing([...keep, ...ev]); e.intentAt = new Date().toISOString();
    }
    progress({ done: ++done, total: firms.length, last: f.name });
  });
  for (const s of new Set(firms.flatMap(f => f.hits.map(([s]) => s)))) save(s);
  return { firms: firms.length };
}
