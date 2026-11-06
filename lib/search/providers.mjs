// Search providers. Each provider takes a list of queries and returns, per query, the raw results the
// search tool itself returned. Add paid sources (Apollo, People Data Labs, job-data APIs) here later.
import { runTools, parseJson } from './runner.mjs';
import { active } from '../engine.mjs';
import { readPages } from '../pages.mjs';

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export const webSearch = {
  name: 'Web search',
  /** Runs a batch of queries in one session; results come from the tool output, never from the model's own text. */
  async run(queries, { cwd, model, onQuery }) {
    if (active() === 'codex') return reportedThenChecked(queries, { cwd, model, onQuery });
    const prompt = `Run the WebSearch tool once for each query below, using the query text exactly as written, one search per query, in order. Do not use any other tool and do not open pages. After the last search, reply only: DONE\n\n${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
    const got = new Map();
    await runTools({ prompt, model, tools: ['WebSearch'], cwd, timeoutMs: 420000, onToolResult: r => {
      if (r.tool !== 'WebSearch') return;
      const q = r.structured?.query || r.input?.query || '';
      const links = (r.structured?.results || []).flatMap(x => Array.isArray(x?.content) ? x.content : []).filter(l => l?.url);
      const summary = (r.text.split(/\]\s*\n/).slice(1).join(']\n') || '').replace(/REMINDER:[\s\S]*$/, '').trim().slice(0, 3000);
      const rec = { query: q, error: r.error ? r.text.slice(0, 300) : null, results: links.map(l => ({ url: l.url, title: l.title || '', domain: host(l.url) })), summary };
      got.set(q.trim().toLowerCase(), rec); try { onQuery?.(rec); } catch {}
    } });
    // match by exact text first, then pair any reworded searches with the remaining queries in order
    const used = new Set(), out = queries.map(q => { const k = q.trim().toLowerCase(); if (got.has(k)) { used.add(k); return { ...got.get(k), query: q }; } return null; });
    const spare = [...got.keys()].filter(k => !used.has(k));
    return out.map((r, i) => r || (spare.length ? { ...got.get(spare.shift()), query: queries[i], ranAs: undefined } : { query: queries[i], error: 'The search tool did not run this query', results: [], summary: '' }));
  },
};

// Codex does not hand back its search results, so it lists the pages it found for each query and AION opens every
// one itself: a link is kept only if the page loads, and its title comes from the page, not from the model.
async function reportedThenChecked(queries, { cwd, model, onQuery }) {
  const out = [];
  for (let i = 0; i < queries.length; i += 8) {
    const batch = queries.slice(i, i + 8);
    const prompt = `Run a web search for each query below, one search per query, using the query text exactly as written. Do not open pages.
For each query list up to 8 results exactly as the search returned them: the page's full https link and its title. Never write a link you did not see in a search result.

Queries:
${batch.map((q, k) => `${k + 1}. ${q}`).join('\n')}

Reply with JSON only: {"results":[{"query":"<query text>","links":[{"url":"https://...","title":""}]}]}`;
    let rep = null, err = null;
    try { rep = parseJson((await runTools({ prompt, model, tools: ['WebSearch'], cwd, timeoutMs: 420000, engine: 'codex', verify: false })).text); } catch (e) { err = e.message; }
    const said = new Map((rep?.results || []).map(r => [String(r.query || '').trim().toLowerCase(), r.links || []]));
    const pages = await readPages([...said.values()].flat().map(l => l.url).filter(Boolean), { limit: 120, concurrency: 8 });
    const live = new Map(pages.map(p => [p.url, p]));
    batch.forEach((q, k) => {
      const links = said.get(q.trim().toLowerCase()) || (rep?.results?.[k]?.links || []);
      const kept = links.map(l => live.get(String(l.url).split('#')[0])).filter(Boolean);
      const rec = { query: q, error: err || (rep ? null : 'The search did not return results'), results: kept.map(p => ({ url: p.url, title: p.title || '', domain: host(p.url) })), summary: kept.map(p => `${p.title}: ${p.text.slice(0, 240)}`).join('\n').slice(0, 3000), checkedByAion: true };
      out.push(rec); try { onQuery?.(rec); } catch {}
    });
  }
  return out;
}
export const PROVIDERS = [webSearch];
