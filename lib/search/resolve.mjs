// Entity resolution: merge the same person or company found by different searches, keeping every piece of evidence.
const SUFFIX = /\b(inc|llc|l\.l\.c|corp|corporation|co|company|ltd|limited|group|holdings|plc|lp|llp)\b\.?/g;
const HONOR = /\b(dr|mr|mrs|ms|mba|phd|cscp|cpim|pmp|cpa|pe|jr|sr|ii|iii)\b\.?/g;
export const normName = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, ' ').replace(HONOR, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
export const normCo = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(SUFFIX, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const domainOf = u => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const sameCo = (a, b) => { const x = normCo(a), y = normCo(b); return !x || !y || x === y || x.includes(y) || y.includes(x); };

export function resolve(mode, raw) {
  const groups = [];
  for (const e of raw) {
    const g = mode === 'candidate'
      ? groups.find(x => x.key === normName(e.name) && sameCo(x.employer, e.employer))
      : groups.find(x => (e.website && x.domain && domainOf(e.website) === x.domain) || x.key === normCo(e.company));
    if (g) {
      g.sources = [...new Set([...g.sources, ...e.sources])]; g.merged++;
      for (const k of mode === 'candidate' ? ['title', 'employer', 'location'] : ['website', 'location', 'industry']) if (!g[k] && e[k]) g[k] = e[k];
      for (const k of mode === 'candidate' ? ['facts'] : ['signals', 'roles']) g[k] = [...new Set([...(g[k] || []), ...(e[k] || [])])];
      if (mode !== 'candidate') g.people = [...(g.people || []), ...(e.people || [])].filter((p, i, a) => p.name && a.findIndex(q => normName(q.name) === normName(p.name)) === i);
      if (!g.domain && e.website) g.domain = domainOf(e.website);
    } else groups.push({ ...e, key: mode === 'candidate' ? normName(e.name) : normCo(e.company), domain: e.website ? domainOf(e.website) : '', merged: 1 });
  }
  return groups;
}
