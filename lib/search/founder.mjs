// Founder and company research for a top firm: one evidence-backed profile, every finding with the page it came from.
// A finding is kept only when its link was actually returned by a search or opened during this research (or is the
// firm's own site); hypotheses are kept apart from facts and never used as facts in outreach.
import { runTools, parseJson } from './runner.mjs';
import { domainOf } from './resolve.mjs';
import { DONE as DONE_RE } from './strength.mjs';

const FACTS = ['founder_history', 'why_founded', 'specialization', 'clients', 'public_comments', 'leadership_succession', 'business_model', 'recent_changes', 'transition_evidence'];
const HYPO = ['owner_dependence', 'aion_fit', 'why_long_term_owner', 'growth_partnership', 'value_creation'];
export const LABELS = {
  founder_history: 'Founder and ownership history', why_founded: 'Why they started it', specialization: 'What makes it distinctive', clients: 'Clients, retailers and categories (public)',
  public_comments: 'What the owner has said publicly', leadership_succession: 'Leadership and succession', business_model: 'Business model and recurring revenue', recent_changes: 'What changed recently',
  transition_evidence: 'Evidence they have explored selling or succession', owner_dependence: 'Owner dependence (hypothesis)', aion_fit: 'Why AION fits (hypothesis)',
  why_long_term_owner: 'Why a permanent owner might appeal (hypothesis)', growth_partnership: 'A partnership idea that could help them now (hypothesis)', value_creation: 'Where AION could add value (hypothesis)',
};

export const researchPrompt = (e, owner) => `Research this US firm for AION, a people-first, AI-native, long-term holding company that buys and keeps CPG and ecommerce services firms (retail placement and brokerage, marketplace management, category management, retail data and analytics, CPG consulting).
FIRM: ${e.company}${e.website ? ` (${e.website})` : ''}${e.location ? `, ${e.location}` : ''}. ${owner ? `Owner or leader: ${owner}.` : 'The owner is not known yet: find out who owns and runs it.'}
What AION already knows: ${String(e.summary || '').slice(0, 600)}

Use web search and open the firm's own pages (About, Team, News, Case studies, Clients) plus trade press, interviews, podcasts and press releases. Do not use or report anything about health, family, religion, politics or other private matters, and never guess anyone's age.

Return JSON only:
{"facts":{${FACTS.map(k => `"${k}":[{"text":"","url":"","date":""}]`).join(',')}},
 "hypotheses":{${HYPO.map(k => `"${k}":[{"text":"","based_on":""}]`).join(',')}},
 "unknowns":["<what you could not find that matters for buying it>"],
 "contact":{"name":"","title":"","why":"","url":""},
 "reason_now":{"text":"<the strongest TRUE reason to contact them now, or empty if none>","url":""}}
RULES: every fact is one short sentence that is stated on the page you give as its url (copy names and numbers exactly); a date is year-month when the page shows one. Leave a list empty rather than guess. Hypotheses are your reasoning, each based on named facts, never stated as fact. "transition_evidence" holds only explicit public statements about selling, succession, retirement or ownership change, never inferences from tenure or age.`;

/** Runs the research and keeps only findings whose link was really seen. Returns the profile (or throws). */
export async function researchFirm(e, { owner = null, model, cwd, engineFn = runTools } = {}) {
  const seen = new Set(), own = domainOf(e.website || '');
  const r = await engineFn({ prompt: researchPrompt(e, owner), model, tools: ['WebSearch', 'WebFetch'], cwd, timeoutMs: 420000,
    onToolResult: t => { if (t.input?.url) seen.add(String(t.input.url).split('#')[0]); for (const x of (t.structured?.results || []).flatMap(y => Array.isArray(y?.content) ? y.content : [])) if (x?.url) seen.add(String(x.url).split('#')[0]); } });
  const j = parseJson(r.text); if (!j?.facts) throw new Error('The research answer could not be read. Try again.');
  return cleanProfile(j, seen, own);
}
/** A fact's link must be one the research actually saw (or the firm's own site); everything else is dropped and counted. */
export function cleanProfile(j, seen, own = '') {
  const real = u => { const x = String(u || '').split('#')[0]; if (!/^https?:\/\//.test(x)) return false; return seen.has(x) || seen.has(x.replace(/\/$/, '')) || seen.has(x + '/') || (own && domainOf(x) === own); };
  let dropped = 0; const facts = {};
  for (const k of FACTS) facts[k] = (j.facts?.[k] || []).map(f => ({ text: String(f.text || '').trim().slice(0, 300), url: String(f.url || '').trim(), date: String(f.date || '').slice(0, 7) })).filter(f => { const ok = f.text && real(f.url); if (!ok && f.text) dropped++; return ok; }).slice(0, 5);
  const hypotheses = {}; for (const k of HYPO) hypotheses[k] = (j.hypotheses?.[k] || []).map(h => ({ text: String(h.text || '').trim().slice(0, 300), basedOn: String(h.based_on || '').slice(0, 200) })).filter(h => h.text).slice(0, 3);
  const c = j.contact || {}, contact = c.name && real(c.url) ? { name: String(c.name).slice(0, 80), title: String(c.title || '').slice(0, 80), why: String(c.why || '').slice(0, 200), url: c.url } : null;
  const rn = j.reason_now || {}, reasonNow = rn.text && real(rn.url) ? { text: String(rn.text).slice(0, 300), url: rn.url } : null;
  const count = Object.values(facts).reduce((t, a) => t + a.length, 0);
  return { at: new Date().toISOString(), facts, hypotheses, unknowns: (j.unknowns || []).map(x => String(x).slice(0, 200)).filter(Boolean).slice(0, 6), contact, reasonNow, count, dropped };
}
/** The profile's facts as outreach signals (hypotheses never become facts). */
export function profileSignals(p) {
  if (!p?.facts) return [];
  const out = []; for (const [k, list] of Object.entries(p.facts)) for (const f of list) out.push({ kind: k === 'transition_evidence' ? 'recent' : 'research', text: `${LABELS[k]}: ${f.text}${f.date ? ` (${f.date})` : ''}`, source: f.url });
  if (p.reasonNow) out.unshift({ kind: 'recent', text: `Reason to write now: ${p.reasonNow.text}`, source: p.reasonNow.url });
  return out;
}

// Explicit statements found by the research become dated, sourced timing signals, so seller intent reflects them.
// Only plain words count (retire, succession, sell, buyer, died); a death must name the firm in the same sentence.
const MAP = [['founder_died', /\b(passed away|died|obituary|in memory of)\b/i], ['sale_stated', /\b(exploring (a )?sale|for sale|looking for (a )?buyer|seeking (a )?buyer|open to (being )?acquired|sell(ing)? (the|his|her|their) (firm|company|business|agency))\b/i], ['mbo', /\bmanagement buy-?out\b/i], ['retirement', /\b(retir(e|es|ed|ing|ement))\b/i], ['succession', /\b(succession|successor|transition(ed|ing)? (ownership|leadership)|handed (over )?the reins)\b/i], ['steward', /\blong-term (owner|steward)\b/i]];
export function profileTiming(p, firm = '') {
  const out = [];
  for (const f of p?.facts?.transition_evidence || []) {
    const hit = MAP.find(([, re]) => re.test(f.text)); if (!hit || DONE_RE.test(f.text)) continue; // a handover that already happened is history
    if (hit[0] === 'founder_died' && !String(f.text).toLowerCase().includes(String(firm).toLowerCase().split(/\s+/)[0])) continue;
    out.push({ signal: hit[0], key: hit[0], source: 'research', text: f.text, url: f.url, date: f.date || '', direction: 'for', confidence: 'likely' });
  }
  return out;
}
