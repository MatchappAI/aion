// Data sources: what each search can draw on, and whether it is connected. Paid sources stay off until a key is added.
// To connect one, add its key to demo/.env (for example PDL_API_KEY=...) and restart AION.
import fs from 'node:fs'; import path from 'node:path';
export function loadEnv(dir) { try { for (const line of fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
export function sources(contacts) {
  return [
    { key: 'web', name: 'Live web search', status: 'connected', note: 'Every search runs 20–40 public web searches' },
    { key: 'registry', name: 'Public business records', status: 'connected', note: 'OpenCorporates and state registries, through web search' },
    { key: 'rdap', name: 'Domain registration records', status: 'connected', note: 'Read directly: how long each firm has been online' },
    { key: 'wayback', name: 'Internet Archive', status: 'connected', note: 'Read directly: saved copies of each website, to see a site go quiet or a team change' },
    { key: 'news', name: 'Google News headlines', status: 'connected', note: 'Read directly: expansions, new sites, retirements, leadership changes, takeovers, layoffs' },
    { key: 'jobs', name: 'Company job boards', status: 'connected', note: 'Read directly: finds the job system behind each careers page (Workday, Greenhouse, Lever, Ashby) and keeps AION’s own dated record of every senior role, so long-open and reposted roles are proven' },
    { key: 'clients', name: 'Firms’ own client pages', status: 'connected', note: 'Read directly: the brands, retailers and marketplaces a firm names on its own client and case-study pages' },
    { key: 'contacts', name: 'Your contacts', status: contacts ? 'connected' : 'not added', note: contacts ? `${contacts.count.toLocaleString()} people from ${contacts.file}` : 'Upload your LinkedIn Connections.csv to see warm introductions' },
    { key: 'pdl', name: 'People Data Labs (paid)', status: process.env.PDL_API_KEY ? 'connected' : 'not connected', note: process.env.PDL_API_KEY ? 'Adds verified work emails for strong matches' : 'Add PDL_API_KEY to demo/.env to add verified work emails' },
    { key: 'apollo', name: 'Apollo (paid)', status: process.env.APOLLO_API_KEY ? 'connected' : 'not connected', note: process.env.APOLLO_API_KEY ? 'Adds company and contact data' : 'Add APOLLO_API_KEY to demo/.env' },
  ];
}
/** People Data Labs person enrichment. Only called when a key is set; returns verified fields with the source named. */
export async function pdlEnrich(e) {
  if (!process.env.PDL_API_KEY) return null;
  try {
    const q = new URLSearchParams({ name: e.name, company: e.employer || '', min_likelihood: '6' });
    const r = await fetch('https://api.peopledatalabs.com/v5/person/enrich?' + q, { headers: { 'X-Api-Key': process.env.PDL_API_KEY }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { error: `People Data Labs returned ${r.status}` };
    const j = await r.json(), d = j.data || {};
    return { likelihood: j.likelihood, workEmail: d.work_email || null, title: d.job_title || null, company: d.job_company_name || null, location: d.location_name || null, linkedin: d.linkedin_url || null, source: 'People Data Labs' };
  } catch (err) { return { error: err.message }; }
}
