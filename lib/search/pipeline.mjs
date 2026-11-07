// Proprietary Search pipeline (shared by Candidate Sourcing and Client Acquisition):
// objective → strategy → queries → parallel search → collection → extraction → resolution → enrichment → scoring → contacts → review
import { runTools, parseJson } from './runner.mjs';
import { webSearch } from './providers.mjs';
import { strategyPrompt, extractPrompt, enrichPrompt, contactPrompt } from './prompts.mjs';
import { resolve, normName, domainOf } from './resolve.mjs';
import { score, mustHave } from './score.mjs';
import { saveSearch } from './store.mjs';
import { THESIS, SUBSECTORS, detectSubsector, searchCriteria } from '../thesis.mjs';
// a step that failed for some items is written to the log and the search's error list, never dropped silently
function failures(s, log, stage, out, label) {
  const bad = (out || []).filter(x => x && x.error); if (!bad.length) return;
  for (const b of bad) s.errors.push({ stage, error: b.error });
  log(`${bad.length} ${label} could not finish: ${bad[0].error.slice(0, 160)}`, {});
}
import { pdlEnrich } from './sources.mjs';
import { timing, isMarketplace, listedFor } from './timing.mjs';
import { forEntity } from './radar.mjs';

const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e.message }; } } })); return out; };
const chunk = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const JUNK = /(ziprecruiter|indeed|glassdoor|salary\.com|zippia|simplyhired|monster\.com|careerbuilder|talent\.com|payscale|comparably)\./;

/** Runs the radar's direct data sources for every checked result and merges what they find into its timing. */
export async function addSignals(s, { cwd, model, log = () => {}, only = null }) {
  const cand = s.mode === 'candidate', list = (only || s.entities || []).filter(e => e.scored);
  log(`Reading data sources directly for the ${list.length} checked ${cand ? 'people' : 'companies'}: ${cand ? 'news headlines' : s.mode === 'target' ? 'domain records, saved copies of their websites, team pages, client pages and news' : 'domain records, news, job boards and federal contract awards'}`, {});
  await pool(list, 4, async e => {
    const r = await forEntity(s.mode, e, { cwd, model });
    const own = (e.timing?.signals || []).filter(x => x.source !== 'radar').map(x => ({ ...x, signal: x.key }));
    e.radar = r.events.map(({ isNew, ...x }) => x); e.radarRan = r.ran; e.radarAt = new Date().toISOString();
    e.timing = timing([...own, ...r.events.filter(x => x.direction !== 'info').map(x => ({ ...x, source: 'radar' }))]);
    log(`Signals for ${cand ? e.name : e.company}: ${r.events.length ? r.events.map(x => x.text.split(':')[0].slice(0, 50)).slice(0, 2).join('; ') : 'nothing new in the data sources'}`, {});
    saveSearch(s);
  });
}

/** The in-depth check of one result: criteria, verified facts, timing clues. Used by a search and by "Check more". */
async function checkOne(s, e, { cwd, model, log }) {
  const cand = s.mode === 'candidate';
      const found = new Set(e.evidence.map(x => x.url)), fetched = [];
      const r = await runTools({ prompt: enrichPrompt(s.mode, s.objective, s.strategy.criteria, cand ? { name: e.name, title: e.title, employer: e.employer, location: e.location, facts: e.facts, links: e.evidence.map(x => x.url) } : { company: e.company, website: e.website, location: e.location, signals: e.signals, roles: e.roles, people: e.people, links: e.evidence.map(x => x.url) }, s.subsector), model, tools: ['WebSearch', 'WebFetch'], cwd, timeoutMs: 360000,
        onToolResult: t => { if (t.tool === 'WebFetch' && t.input?.url) { found.add(t.input.url); fetched.push({ url: t.input.url, text: t.text }); } for (const x of (t.structured?.results || []).flatMap(y => Array.isArray(y?.content) ? y.content : [])) if (x?.url) found.add(x.url); } });
      const a = parseJson(r.text) || {};
      // only keep facts and assessments whose link was really returned by a tool or found earlier
      const ok = u => u && [...found].some(f => f.split('#')[0].replace(/\/$/, '') === String(u).split('#')[0].replace(/\/$/, ''));
      const crit = (a.criteria || []).map(c => ok(c.url) || c.status === 'no_evidence' ? c : { ...c, status: 'no_evidence', note: 'Not found in public sources reviewed.', url: '' });
      const sc = score(s.strategy.criteria, crit, +a.same_entity_confidence || 0.5, s.mode);
      Object.assign(e, { scored: true, score: sc.pct, failed: sc.failed, breakdown: sc.rows, coverage: sc.coverage, confidence: sc.confidence, identity: +a.same_entity_confidence || null, summary: a.summary || '', concern: a.concern || '',
        verifiedFacts: (a.facts || []).filter(f => ok(f.url)), sourcesReviewed: found.size, fetchedPages: fetched.map(f => f.url) });
      if (cand) Object.assign(e, { title: a.title || e.title, employer: a.employer || e.employer, location: a.location || e.location, priorEmployers: a.prior_employers || [] });
      else Object.assign(e, { registry: a.registry && ok(a.registry.url) ? a.registry : null, founderLeads: a.founder_leads || 'unknown', successorNamed: a.successor_named || 'unknown', repostedRoles: (a.reposted_roles || []).filter(x => x.role && ok(x.url)), leadershipChanges: (a.leadership_changes || []).filter(x => x.text && ok(x.url)), founded: a.founded || e.founded || '', ownership: a.ownership || '', website: a.website || e.website, location: a.location || e.location, industry: a.industry || e.industry, size: a.size || '', openRoles: a.open_roles || e.roles || [], signalsVerified: (a.signals || []).filter(x => ok(x.url)), contacts: (a.contacts || []).filter(x => x.name && ok(x.url)), angle: a.angle || '' });
      // timing clues are kept only with a link a tool really returned; they set the timing badge, never the fit score
      e.timing = timing((a.timing || []).filter(x => ok(x.url)));
      if (s.mode === 'target' && listedFor((a.timing || []).filter(x => ok(x.url)), e)) e.listed = true; // already marketed for sale: not proprietary
      e._pages = fetched; s.enrichDone++; log(`Checked ${cand ? e.name : e.company}: ${sc.pct}% ${cand ? 'match' : 'opportunity'} (${sc.confidence.toLowerCase()} confidence)${sc.failed.length ? ` · fails a must-have: ${sc.failed[0].split(':')[0]}` : ''}${e.timing.signals.length ? ` · timing: ${e.timing.label.toLowerCase()} (${e.timing.signals.length} clue${e.timing.signals.length === 1 ? '' : 's'})` : ''}`, {}); save();
}

/** "Check more": the next unchecked results of a finished search get the same in-depth check, data signals and
 *  emails read from their own websites (free). Returns how many were checked. */
export async function checkMore(s, { n = 12, cwd, model, emit = () => {} }) {
  const log = (text, extra) => { (s.log ||= []).push({ t: s.t0 ? (Date.now() - s.t0) / 1000 : 0, text }); emit({ ...extra }); };
  const next = (s.entities || []).filter(e => !e.scored && !e.screened).concat((s.entities || []).filter(e => !e.scored && e.screened)).slice(0, Math.max(1, Math.min(24, n)));
  if (!next.length) return 0;
  s.status = 'running'; s.stage = 'enrich'; s.enrichTotal = (s.enrichDone || 0) + next.length; saveSearch(s);
  log(`Checking ${next.length} more in depth`, { stage: 'enrich' });
  const out = await pool(next, 4, e => checkOne(s, e, { cwd, model, log }));
  failures(s, log, 'enrich', out, 'in-depth checks');
  s.stage = 'signals'; saveSearch(s);
  await addSignals(s, { cwd, model, log, only: next });
  if (s.mode === 'target') {
    const { siteContacts } = await import('../outreach/sitecontacts.mjs');
    await pool(next.filter(e => e.scored && e.website), 4, async e => {
      const r = await siteContacts(e.website, [e.owner, ...(e.contacts || []).map(c => c.name)].filter(Boolean)).catch(() => null);
      for (const x of r?.emails || []) if (!(e.contactInfo ||= []).some(c => String(c.value).toLowerCase() === x.email)) e.contactInfo.push({ person: x.name || 'Company', kind: 'email', value: x.email, url: x.url, verified: true, source: 'their website' });
      if (r?.contactPage && !(e.contactInfo ||= []).some(c => c.kind === 'contact_page')) e.contactInfo.push({ person: 'Company', kind: 'contact_page', value: sc.contactPage, url: sc.contactPage, source: 'their website' });
      for (const x of r?.phones || []) if (!(e.contactInfo ||= []).some(c => c.value === x.phone)) e.contactInfo.push({ person: 'Company', kind: 'phone', value: x.phone, url: x.url, source: 'their website' });
    });
  }
  for (const e of next) delete e._pages;
  s.status = 'done'; s.stage = 'done';
  log(`Done: ${s.entities.filter(e => e.scored).length} checked in total`, { stage: 'done' }); saveSearch(s);
  return next.length;
}
export async function runSearch(s, { cwd, model, emit }) {
  const log = (text, extra) => { s.log.push({ t: (Date.now() - s.t0) / 1000, text }); emit({ ...extra }); };
  const save = () => saveSearch(s);
  const cand = s.mode === 'candidate';
  s.t0 = Date.now(); s.log = []; s.status = 'running'; s.stage = 'strategy'; s.errors = []; save();
  try {
    // 1. strategy and queries (kept if the user edited them)
    // the service this search is about: read from the objective, else the buy box (ecommerce consulting); people searches keep the recruiting playbook
    if (s.subsector === undefined) s.subsector = SUBSECTORS[s.filters?.subsector] ? s.filters.subsector : s.mode === 'candidate' ? 'talent' : detectSubsector(s.objective) || 'ecommerce';
    if (!s.strategy) {
      log('Building the search strategy from your objective', { stage: 'strategy' });
      let st = null;
      for (let attempt = 1; attempt <= 2 && !st?.queries?.length; attempt++) {
        const r = await runTools({ prompt: strategyPrompt(s.mode, s.objective, s.filters, s.subsector) + (attempt > 1 ? '\n\nReply with the JSON object only.' : ''), model, cwd, timeoutMs: 240000 });
        st = parseJson(r.text);
        if (!st?.queries?.length) { s.errors.push({ stage: 'strategy', attempt, error: 'Unreadable strategy reply', sample: String(r.text || '').slice(0, 300) }); if (attempt === 1) log('The strategy reply could not be read; trying once more', {}); }
      }
      if (!st?.queries?.length) throw new Error('Could not build a search strategy after two tries. Try rewording the objective.');
      const crit = (st.criteria || []).filter(c => !['paid_upfront', 'mostly_paid_upfront'].includes(c.key)).slice(0, 6).map(c => ({ key: c.key, label: c.label, weight: Math.min(3, Math.max(1, +c.weight || 1)) }));
      // thesis v3.0 criteria (lib/thesis.mjs): cash conversion quality for every target (Net 30 is fine), payroll float for temp
      // staffing, and whether AION's tools have work to improve. Old searches keep their saved criteria, including paid_upfront.
      crit.push(...searchCriteria(s.mode, { sub: s.subsector, objective: s.objective }));
      // targets are always held to the thesis size, even when the strategy forgot it
      if (s.mode === 'target' && !crit.some(c => /size/.test(c.key))) crit.push({ key: 'size_fit', label: THESIS.sizeLabel, weight: 2 });
      // every search also scores whether the person or company is realistic to win, so a famous name that won't hire you can't score high
      crit.push(cand ? { key: 'realistic_to_approach', label: 'Realistic to approach for this role (level, location and situation fit)', weight: 3 } : s.mode === 'target' ? { key: 'likely_available_to_buy', label: 'Likely available to buy (founder- or family-owned, not PE-backed or public, signs of succession)', weight: 3 }
        : s.subsector === 'talent' ? { key: 'likely_to_use_outside_recruiter', label: 'Likely to hire an outside recruiter (size and ownership fit, no large in-house search team)', weight: 3 }
        : { key: 'likely_to_buy_service', label: `Likely to buy ${SUBSECTORS[s.subsector]?.short || 'this service'} from an outside firm (size, a recent trigger, no large in-house team)`, weight: 3 });
      s.strategy = { summary: st.summary, profile: st.profile || {}, criteria: crit.map(c => ({ ...c, must: mustHave(s.mode, c) })) };
      s.queries = [...new Map(st.queries.map(q => [String(q.q).trim().toLowerCase(), { q: String(q.q).trim(), family: q.family || 'other' }])).values()].slice(0, 40).map((q, i) => ({ id: i, ...q, status: 'waiting', count: 0 }));
    } else s.queries = s.queries.map((q, i) => ({ id: i, q: q.q, family: q.family || 'edited', status: 'waiting', count: 0 }));
    log(`Strategy ready: ${s.strategy.criteria.length} criteria, ${s.queries.length} searches in ${new Set(s.queries.map(q => q.family)).size} families`, { stage: 'search' }); s.stage = 'search'; save();

    // 2. parallel search, 4 queries per session, 3 sessions at a time
    s.raw = []; const seen = new Map();
    const qs0 = await pool(chunk(s.queries, 4), 3, async batch => {
      batch.forEach(q => q.status = 'running'); emit({});
      const res = await webSearch.run(batch.map(q => q.q), { cwd, model, onQuery: rec => { const q = batch.find(x => x.q.toLowerCase() === rec.query.trim().toLowerCase()); if (q) { q.status = 'done'; q.count = rec.results.length; } log(`Searched: “${rec.query}” → ${rec.results.length} results`, {}); } });
      res.forEach((rec, k) => {
        const q = batch[k]; q.status = rec.error ? 'failed' : 'done'; q.count = rec.results.length; q.error = rec.error; q.summary = rec.summary; if (rec.error) s.errors.push({ stage: 'search', query: q.q, error: rec.error });
        for (const r of rec.results) { const u = r.url.split('#')[0]; if (s.mode === 'target' && isMarketplace(u)) { s.skippedListings = (s.skippedListings || 0) + 1; continue; } /* proprietary only: no marketplace or broker listings */ if (seen.has(u)) { seen.get(u).queries.push(q.id); continue; } const item = { id: s.raw.length, url: u, title: r.title, domain: r.domain, queries: [q.id], at: new Date().toISOString() }; seen.set(u, item); s.raw.push(item); }
      });
      save();
    }).then(rs => rs.forEach((r, i) => { if (r?.error) { chunk(s.queries, 4)[i].forEach(q => { q.status = 'failed'; q.error = r.error; }); s.errors.push({ stage: 'search', error: r.error }); } }));
    const done = s.queries.filter(q => q.status === 'done').length;
    failures(s, log, 'search', qs0, 'search batches');
    log(`${done} of ${s.queries.length} searches completed · ${s.raw.length} unique links found`, { stage: 'extract' });
    if (!s.raw.length) throw new Error(done ? 'The searches ran but returned no results.' : 'The search provider failed for every query. Check that Claude Code is logged in and web search is available.');

    // 3. extraction: drop obvious junk with simple rules, then let the model pull out named entities
    s.stage = 'extract'; save();
    const useful = s.raw.filter(r => !JUNK.test(r.domain));
    const sums = q => ({ query: s.queries[q].q, summary: (s.queries[q].summary || '').slice(0, 1200) });
    const ex = await pool(chunk(useful, 45), 3, async b => {
      const qs = [...new Set(b.flatMap(r => r.queries))];
      const r = await runTools({ prompt: extractPrompt(s.mode, s.objective, s.strategy.criteria, { results: b.map(x => ({ id: x.id, title: x.title, url: x.url, query: s.queries[x.queries[0]].q })), summaries: qs.map(sums) }, s.subsector), model, cwd, timeoutMs: 240000 });
      return (parseJson(r.text)?.entities || []);
    });
    // a name must literally appear in a cited result title, link or the summary of a query that found it
    const textOf = id => { const r = s.raw[id]; return r ? `${r.title} ${decodeURIComponent(r.url)} ${r.queries.map(q => s.queries[q].summary || '').join(' ')}`.toLowerCase() : ''; };
    const named = e => { const n = normName(cand ? e.name : e.company).split(' ').filter(w => w.length > 1); if (!n.length || (cand && n.length < 2)) return false; return (e.sources || []).some(id => { const t = textOf(id).replace(/[^a-z0-9 ]/g, ' '); return n.every(w => t.includes(w)); }); };
    const flat = ex.flatMap(x => Array.isArray(x) ? x : []).filter(e => (e.sources || []).length && named(e));
    const rejected = ex.flatMap(x => Array.isArray(x) ? x : []).length - flat.length;
    ex.forEach(x => { if (x?.error) s.errors.push({ stage: 'extract', error: x.error }); });
    { const n = ex.filter(x => x?.error).length; if (n) log(`${n} name extractions could not finish: ${ex.find(x => x?.error).error.slice(0, 160)}`, {}); }
    log(`Pulled out ${flat.length} named ${cand ? 'people' : 'companies'}${rejected ? ` (${rejected} dropped: name not found in the source)` : ''}`, { stage: 'resolve' });

    // 4. resolution
    s.stage = 'resolve';
    let ents = resolve(s.mode, flat).map((e, i) => ({ id: 'e' + i, ...e, paths: [...new Set(e.sources.flatMap(id => s.raw[id]?.queries || []))].length }));
    s.funnel = { raw: s.raw.length, extracted: flat.length, unique: ents.length, duplicates: flat.length - ents.length };
    log(`Merged duplicates: ${flat.length} mentions → ${ents.length} unique ${cand ? 'people' : 'companies'}`, { stage: 'enrich' });

    // 5. funnel: enrich the most promising first (found by more searches, more fields filled)
    const pre = e => e.paths * 2 + (cand ? (e.title ? 1 : 0) + (e.employer ? 1 : 0) + (e.location ? 0.5 : 0) : (e.signals?.length ? 1 : 0) + (e.roles?.length ? 1 : 0) + (e.website ? 0.5 : 0));
    ents.sort((a, b) => pre(b) - pre(a));
    const N = Math.min(ents.length, Math.max(6, Math.min(16, s.filters?.count || 12)));
    // screen before the in-depth checks: well-known names get mentioned most, and they are often already owned by a
    // fund, a public company or a larger group. One quick call moves clear must-have misses to the back; it only changes
    // the order, every company checked is still verified in depth, and nothing is removed from the list.
    if (s.mode === 'target' && ents.length > N) {
      const pool0 = ents.slice(0, 80);
      try {
        const prompt = `You are screening possible acquisition targets before a researcher checks them one by one.
Buyer's must-haves: ${(s.strategy?.criteria || []).filter(c => c.weight >= 3).map(c => c.label).join('; ') || THESIS.oneLine || ''}.
For each company below, say only from what you already know and the short notes given whether it CLEARLY breaks a must-have: owned by private equity, a public company or a larger group; far too large; or not this kind of business. If you are not sure, it is not a clear miss.
Companies:
${pool0.map((e, i) => `${i}. ${e.company}${e.website ? ` (${e.website})` : ''}${e.owner ? ` · owner: ${e.owner}` : ''}${e.industry ? ` · ${e.industry}` : ''}`).join('\n')}
Reply with JSON only: {"clear_misses":[{"i":0,"reason":"<under 12 words>"}]}`;
        const r = await runTools({ prompt, model, cwd, timeoutMs: 120000 });
        const miss = new Map((parseJson(r.text)?.clear_misses || []).filter(x => Number.isInteger(x?.i) && pool0[x.i]).map(x => [pool0[x.i], String(x.reason || '').slice(0, 120)]));
        if (miss.size) {
          for (const [e, why] of miss) e.screened = why;
          ents = [...ents.filter(e => !miss.has(e)), ...ents.filter(e => miss.has(e))];
          log(`Screened ${pool0.length} names: ${miss.size} look like clear must-have misses (for example ${[...miss.keys()].slice(0, 2).map(e => e.company).join(', ')}), so likelier fits are checked first`, {});
        }
      } catch (e) { log(`Screening skipped: ${String(e.message || e).slice(0, 120)}`, {}); }
    }
    s.entities = ents.map(e => ({ ...e, evidence: e.sources.map(id => s.raw[id]).filter(Boolean).map(r => ({ url: r.url, title: r.title, domain: r.domain, queries: r.queries.map(q => s.queries[q].q) })) }));
    s.stage = 'enrich'; s.enrichTotal = N; s.enrichDone = 0; save();
    log(`Checking the top ${N} in depth against your criteria`, {});
    const en0 = await pool(s.entities.slice(0, N), 4, e => checkOne(s, e, { cwd, model, log }));
    failures(s, log, 'enrich', en0, 'in-depth checks');

    // 6. data signals: read the sources directly (domain record, saved copies of the website, news, job boards)
    s.stage = 'signals'; save();
    await addSignals(s, { cwd, model, log });

    // 7. contacts, only for strong matches; an email or phone must appear verbatim in a page or result the tool returned
    s.stage = 'contacts'; save();
    const strong = s.entities.filter(e => e.scored && e.score >= 60).slice(0, 8);
    if (strong.length) log(`Looking for public business contact details for the ${strong.length} strongest`, {});
    const ct0 = await pool(strong, 4, async e => {
      const texts = [...(e._pages || []).map(p => ({ url: p.url, text: p.text }))];
      const r = await runTools({ prompt: contactPrompt(s.mode, e), model, tools: ['WebSearch', 'WebFetch'], cwd, timeoutMs: 300000, onToolResult: t => { texts.push({ url: t.input?.url || '', text: t.text }); for (const x of (t.structured?.results || []).flatMap(y => Array.isArray(y?.content) ? y.content : [])) if (x?.url) texts.push({ url: x.url, text: `${x.title} ${x.url}` }); } });
      const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9@.]/g, '');
      e.contactInfo = (parseJson(r.text)?.contacts || []).map(c => {
        const where = texts.find(t => t.url && String(c.url).split('#')[0] === t.url.split('#')[0]);
        const literal = ['email', 'phone', 'main_line', 'address'].includes(c.kind) ? texts.some(t => norm(t.text).includes(norm(c.value))) : !!where || texts.some(t => t.url === c.url);
        return literal && c.value ? { ...c, verified: true } : null;
      }).filter(Boolean);
      if (cand && process.env.PDL_API_KEY) { const p = await pdlEnrich(e); if (p?.workEmail) e.contactInfo.push({ person: e.name, kind: 'email', value: p.workEmail, url: 'https://www.peopledatalabs.com', verified: false, source: 'People Data Labs (paid data, not checked on a public page)' }); if (p?.error) s.errors.push({ stage: 'pdl', error: p.error }); }
      log(`Contacts for ${cand ? e.name : e.company}: ${e.contactInfo.length ? e.contactInfo.map(c => c.kind.replace('_', ' ')).join(', ') : 'no public contact details found'}`, {}); save();
    });
    failures(s, log, 'contacts', ct0, 'contact lookups');

    for (const e of s.entities) delete e._pages;
    s.status = s.errors.some(e => e.stage !== 'strategy') ? 'partial' : 'done'; s.stage = 'done'; s.runtime = (Date.now() - s.t0) / 1000;
    log(`Done: ${s.entities.filter(e => e.scored).length} ranked ${cand ? 'candidates' : 'companies'} from ${s.raw.length} sources`, { stage: 'done' }); save();
  } catch (e) {
    s.status = 'failed'; s.error = e.message; s.stage = 'done'; s.runtime = (Date.now() - s.t0) / 1000; log('Stopped: ' + e.message, {}); save();
  }
}
