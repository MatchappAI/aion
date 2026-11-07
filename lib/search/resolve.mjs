// Entity resolution: merge the same person or company found by different searches, keeping every piece of evidence.
const SUFFIX = /\b(inc|llc|l\.l\.c|corp|corporation|co|company|ltd|limited|group|holdings|plc|lp|llp)\b\.?/g;
const HONOR = /\b(dr|mr|mrs|ms|mba|phd|cscp|cpim|pmp|cpa|pe|jr|sr|ii|iii)\b\.?/g;
export const normName = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, ' ').replace(HONOR, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
export const normCo = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(SUFFIX, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const domainOf = u => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } };
// Is this host the firm's own website, or a directory / news / data site where the firm was found (clutch.co,
// theshelbyreport.com, cbinsights.com)? Only the firm's own domain may merge two results, so two different firms
// written up on the same news site are never collapsed into one. Own = the site name shares a real word, the whole
// name, or the initials with the company name.
const CO_STOP = new Set(['the', 'and', 'inc', 'llc', 'group', 'company', 'corp', 'sales', 'marketing', 'consulting', 'services', 'solutions', 'partners', 'agency', 'brands', 'retail', 'global', 'ecommerce', 'commerce', 'digital', 'management', 'associates']);
export function ownDomain(host, company) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '').split('.').slice(0, -1).join('').replace(/[^a-z0-9]/g, '');
  const n = String(company || '').toLowerCase(), flat = n.replace(/[^a-z0-9]/g, '');
  if (!h || !flat) return false;
  if (h.includes(flat) || (h.length >= 4 && flat.includes(h))) return true;
  const words = n.split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !CO_STOP.has(w));
  if (words.some(w => h.includes(w))) return true;
  const initials = n.split(/[^a-z0-9]+/).filter(w => w && !['the', 'and', 'of', 'inc', 'llc'].includes(w)).map(w => w[0]).join('');
  return initials.length >= 2 && h.startsWith(initials);
}
// directory, data and news sites that list many firms: never a firm's own website
export const DIRECTORY = /(^|\.)(nombase|novadata|clutch|builtin|cbinsights|crunchbase|zoominfo|linkedin|dnb|bbb|yelp|manta|glassdoor|indeed|apollo|rocketreach|signalhire|owler|buzzfile|bizapedia|opencorporates|hirebase|theshelbyreport|chaindrugreview|syncgtm|village|pitchbook|tracxn|upcity|designrush|goodfirms|sortlist|facebook|instagram|youtube|x|twitter|google|amazon|walmart|prnewswire|businesswire|bevnet|grocerydive|progressivegrocer)\.[a-z.]+$/i;
// the firm's own site: the website field unless it is a directory; the domain field (often the page it was found on) only if it matches the name
export function siteOf(e) {
  const w = e.website && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(String(e.website).trim()) ? domainOf(e.website) : '';
  if (w && (!DIRECTORY.test(w) || ownDomain(w, e.company))) return w;
  const d = e.domain ? domainOf(e.domain) : '';
  return d && ownDomain(d, e.company) ? d : '';
}
const sameCo = (a, b) => { const x = normCo(a), y = normCo(b); return !x || !y || x === y || x.includes(y) || y.includes(x); };

export function resolve(mode, raw) {
  const groups = [];
  for (const e of raw) {
    const g = mode === 'candidate'
      ? groups.find(x => x.key === normName(e.name) && sameCo(x.employer, e.employer))
      : groups.find(x => (siteOf(e) && x.domain && siteOf(e) === x.domain) || x.key === normCo(e.company));
    if (g) {
      g.sources = [...new Set([...g.sources, ...e.sources])]; g.merged++;
      for (const k of mode === 'candidate' ? ['title', 'employer', 'location'] : ['website', 'location', 'industry']) if (!g[k] && e[k]) g[k] = e[k];
      for (const k of mode === 'candidate' ? ['facts'] : ['signals', 'roles']) g[k] = [...new Set([...(g[k] || []), ...(e[k] || [])])];
      if (mode !== 'candidate') g.people = [...(g.people || []), ...(e.people || [])].filter((p, i, a) => p.name && a.findIndex(q => normName(q.name) === normName(p.name)) === i);
      if (!g.domain && siteOf(e)) g.domain = siteOf(e);
    } else groups.push({ ...e, key: mode === 'candidate' ? normName(e.name) : normCo(e.company), domain: mode === 'candidate' ? (e.website ? domainOf(e.website) : '') : siteOf(e), merged: 1 });
  }
  return groups;
}
