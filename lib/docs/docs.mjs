// Documents: two workflows already proven at past clients. The RFP engine serves every subsector in the thesis; the
// candidate write-up serves talent firms.
//  1. Proposal engine: reads a real RFP, pulls out every requirement word for word with its page, and drafts the response.
//     Same pattern as the Entro proposal generator (many sources in, one finished document out, a person approves).
//  2. Write-up builder: turns a job order and a candidate's materials into a client-ready candidate summary.
//     Same pattern as the MGT final-report automation.
// Rule for both: anything quoted must appear word for word in the source, or it is dropped. Facts about the firm come
// only from the firm profile; anything missing is left as a visible [[needs input]] marker, never invented.
import fs from 'node:fs'; import path from 'node:path'; import { execFile } from 'node:child_process';
import { runTools, parseJson } from '../search/runner.mjs';
import { SUBSECTORS, FIRM_KEYS } from '../thesis.mjs';

let DIR = null;
const SWIFT = path.join(path.dirname(new URL(import.meta.url).pathname), 'pdftext.swift');
export function initDocs(dir) { DIR = dir; fs.mkdirSync(dir, { recursive: true }); }
const file = id => path.join(DIR, String(id).replace(/[^\w-]/g, '') + '.json');
export const saveDoc = d => fs.writeFileSync(file(d.id), JSON.stringify(d));
export const loadDoc = id => { try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; } };
export const listDocs = () => fs.readdirSync(DIR).filter(f => /^d[a-z0-9]+\.json$/.test(f)).map(f => { try { const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); return { id: d.id, kind: d.kind, title: d.title, created: d.created, status: d.status, seconds: d.seconds }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.created.localeCompare(a.created));
const FIRM = () => path.join(DIR, 'firm.json');
// the firm profile: a saved profile without a subsector is a talent firm's (the only kind before thesis v3.0)
export const getFirm = () => { let f; try { f = JSON.parse(fs.readFileSync(FIRM(), 'utf8')); } catch { f = { name: '', niche: '', about: '', placements: '', fees: '', team: '', differentiators: '' }; } if (f.subsector === undefined) f.subsector = Object.values(f).some(Boolean) ? 'talent' : ''; return f; };
export const setFirm = f => { const prev = getFirm(), sub = SUBSECTORS[f?.subsector] ? f.subsector : ''; const o = { subsector: sub }; for (const k of FIRM_KEYS) o[k] = String(f?.[k] ?? prev[k] ?? '').slice(0, 4000); fs.writeFileSync(FIRM(), JSON.stringify(o)); return o; };

// ---------- reading sources ----------
const pdfText = p => new Promise((ok, bad) => execFile('swift', [SWIFT, p], { maxBuffer: 50e6, timeout: 120000 }, (e, out) => e ? bad(new Error('Could not read the PDF: ' + e.message)) : ok(out)));
const htmlText = h => String(h || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<\/(p|li|h\d|div|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
/** Workday job links are read through the board's own public API, which returns the full posting. */
async function workday(url) {
  const m = url.match(/https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)(\/job\/.+)$/); if (!m) return null;
  const r = await fetch(`https://${m[1]}.${m[2]}.myworkdayjobs.com/wday/cxs/${m[1]}/${m[3]}${m[4]}`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
  const j = r.ok ? (await r.json()).jobPostingInfo : null;
  return j ? `${j.title}\n${j.location || ''}\n${j.postedOn || ''}\n\n${htmlText(j.jobDescription)}` : null;
}
export async function readSource({ filename, data, url, text }, tmp) {
  if (text && String(text).trim().length > 40) return { text: String(text), name: 'Pasted text', pages: false };
  if (url) {
    const wd = await workday(url).catch(() => null); if (wd) return { text: wd, name: url, pages: false };
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' }); if (!r.ok) throw new Error(`Could not open the link (${r.status}).`);
    const type = r.headers.get('content-type') || '';
    if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(url)) { const p = path.join(tmp, 'src-' + Date.now() + '.pdf'); fs.writeFileSync(p, Buffer.from(await r.arrayBuffer())); return { text: await pdfText(p), name: url, pages: true }; }
    return { text: htmlText(await r.text()), name: url, pages: false };
  }
  if (data) {
    const buf = Buffer.from(data, 'base64'), ext = path.extname(filename || '').toLowerCase();
    if (ext === '.pdf') { const p = path.join(tmp, 'src-' + Date.now() + '.pdf'); fs.writeFileSync(p, buf); return { text: await pdfText(p), name: filename, pages: true }; }
    if (['.txt', '.md', '.csv', '.html', '.htm'].includes(ext)) return { text: ext.startsWith('.htm') ? htmlText(buf.toString('utf8')) : buf.toString('utf8'), name: filename, pages: false };
    throw new Error('Use a PDF, a text file, a link or pasted text.');
  }
  throw new Error('Add the document: upload a PDF, paste a link, or paste the text.');
}

// ---------- the word-for-word check ----------
const norm = s => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^a-z0-9$%'".,;:()\/-]+/g, ' ').replace(/\s+/g, ' ').trim();
export const appears = (quote, source) => { const q = norm(quote); return q.length >= 12 && norm(source).includes(q); };
function pageOf(quote, text) {
  const q = norm(quote).slice(0, 80);
  for (const part of text.split(/=== PAGE (\d+) ===/).reduce((a, x, i, arr) => (i % 2 ? a.push([+x, arr[i + 1] || '']) : 0, a), [])) if (norm(part[1]).includes(q)) return part[0];
  return null;
}

// ---------- 1. proposal engine ----------
const PROPOSAL = (rfp, firm) => `You are preparing a response to a real Request for Proposals for a specialized ${SUBSECTORS[firm?.subsector]?.short.replace(/ services$/, '') || 'professional services'} firm. A person will review and sign it.

RULES
- Requirements, deadlines and evaluation criteria must be QUOTED WORD FOR WORD from the RFP text below (copy the exact sentence or phrase). Do not paraphrase quotes.
- Facts about the firm may come ONLY from the FIRM PROFILE. Wherever a fact is needed that the profile does not give (names, years, projects, placements, references, fees, insurance, licences, certifications, accreditations), write a visible marker like [[needs input: three public-sector references]]. Never invent a fact about the firm, and never state a license, certification or credential the profile does not list.
- Write the draft sections in plain, confident English, addressed to the issuer, following the order the RFP asks for.

FIRM PROFILE (may be empty; empty fields are unknown)
${JSON.stringify(Object.fromEntries(Object.entries(firm || {}).filter(([k, v]) => v && k !== 'subsector')))}

RFP TEXT (page markers look like === PAGE n ===)
"""${rfp.slice(0, 90000)}"""

Return JSON only:
{"title":"<what the RFP is for>","issuer":"","due":"<deadline as stated>","submit":"<how and where to submit, as stated>","summary":"<3 sentences: what they want and what wins>",
"requirements":[{"id":"R1","quote":"<verbatim>","kind":"submission|scope|qualification|evaluation|form|deadline|other"}],
"evaluation":[{"criterion":"","weight":"<as stated, or empty>","quote":"<verbatim>"}],
"sections":[{"heading":"","body":"<draft; use [[needs input: ...]] markers>","covers":["R1","R3"]}],
"questions":["<questions to send the issuer before the deadline>"],
"risks":["<anything that could make the response non-responsive, e.g. a required form or copies>"]}`;

export async function draftProposal(doc, { cwd, model, log }) {
  const t0 = Date.now(); doc.status = 'running'; doc.stage = 'Reading the RFP'; saveDoc(doc);
  const src = doc.source;
  log(`Read ${src.name}: ${src.text.length.toLocaleString()} characters${src.pages ? `, ${(src.text.match(/=== PAGE/g) || []).length} pages` : ''}`);
  doc.stage = 'Pulling out every requirement and drafting'; saveDoc(doc);
  const r = await runTools({ prompt: PROPOSAL(src.text, doc.firm), model, cwd, timeoutMs: 600000 });
  const j = parseJson(r.text); if (!j) throw new Error('The draft could not be read. Try again.');
  doc.stage = 'Checking every quote against the RFP'; saveDoc(doc);
  const reqs = (j.requirements || []).map(x => ({ ...x, ok: appears(x.quote, src.text), page: src.pages ? pageOf(x.quote, src.text) : null }));
  const kept = reqs.filter(x => x.ok), dropped = reqs.length - kept.length;
  const evals = (j.evaluation || []).filter(x => appears(x.quote, src.text)).map(x => ({ ...x, page: src.pages ? pageOf(x.quote, src.text) : null }));
  const sections = (j.sections || []).map(s => ({ ...s, covers: (s.covers || []).filter(id => kept.some(k => k.id === id)), gaps: (String(s.body).match(/\[\[needs input:[^\]]*\]\]/g) || []).length }));
  const covered = new Set(sections.flatMap(s => s.covers));
  Object.assign(doc, { title: j.title || doc.title, issuer: j.issuer || '', due: j.due || '', submit: j.submit || '', summary: j.summary || '', requirements: kept.map(x => ({ ...x, covered: covered.has(x.id) })), evaluation: evals, sections, questions: j.questions || [], risks: j.risks || [],
    check: { quoted: reqs.length, kept: kept.length, dropped, uncovered: kept.filter(x => !covered.has(x.id)).length, gaps: sections.reduce((t, s) => t + s.gaps, 0) } });
  log(`Kept ${kept.length} requirements quoted word for word${dropped ? `; dropped ${dropped} that did not match the RFP exactly` : ''}. ${doc.check.uncovered} not yet answered in the draft; ${doc.check.gaps} facts left for you to fill in.`);
  doc.seconds = Math.round((Date.now() - t0) / 1000); doc.status = 'done'; doc.stage = 'Done'; saveDoc(doc);
}

// ---------- 2. candidate write-up builder ----------
const WRITEUP = (job, cand, firmName) => `You are a recruiter at ${firmName || 'a specialized search firm'} writing a candidate summary for a client. A person will review it before it is sent.

RULES
- Each "must" is a requirement QUOTED WORD FOR WORD from the JOB ORDER.
- Each piece of "evidence" is QUOTED WORD FOR WORD from the CANDIDATE MATERIALS. If the materials do not show it, status is "unknown" and evidence is empty. Never infer facts that are not written.
- The summary uses only what the materials say, in plain client-ready English, 4–6 sentences, no hype.

JOB ORDER
"""${job.slice(0, 40000)}"""

CANDIDATE MATERIALS
"""${cand.slice(0, 40000)}"""

Return JSON only:
{"role":"","candidate":"<name as written in the materials>","headline":"<one line: who they are for this role>","summary":"",
"fit":[{"must":"<verbatim from job>","status":"strong|partial|gap|unknown","evidence":"<verbatim from materials or empty>"}],
"questions":["<what to ask the candidate before presenting>"],"concerns":["<honest gaps or risks>"],"logistics":{"location":"<as written or unknown>","pay":"<as written or unknown>"}}`;

export async function draftWriteup(doc, { cwd, model, log }) {
  const t0 = Date.now(); doc.status = 'running'; doc.stage = 'Reading the job order and the candidate'; saveDoc(doc);
  const job = doc.job.text, cand = doc.cand.text;
  log(`Job order: ${job.length.toLocaleString()} characters. Candidate materials: ${cand.length.toLocaleString()} characters.`);
  doc.stage = 'Matching evidence to each requirement'; saveDoc(doc);
  const r = await runTools({ prompt: WRITEUP(job, cand, doc.firm?.name), model, cwd, timeoutMs: 420000 });
  const j = parseJson(r.text); if (!j) throw new Error('The write-up could not be read. Try again.');
  doc.stage = 'Checking every quote against the sources'; saveDoc(doc);
  let dropped = 0;
  const fit = (j.fit || []).filter(x => appears(x.must, job)).map(x => { if (x.evidence && !appears(x.evidence, cand)) { dropped++; return { ...x, status: 'unknown', evidence: '' }; } return x; });
  Object.assign(doc, { title: `${j.candidate || 'Candidate'} for ${j.role || 'the role'}`, role: j.role || '', candidate: j.candidate || '', headline: j.headline || '', summary: j.summary || '', fit, questions: j.questions || [], concerns: j.concerns || [], logistics: j.logistics || {},
    check: { musts: fit.length, evidenced: fit.filter(x => x.evidence).length, dropped } });
  log(`${fit.length} requirements from the job order; ${doc.check.evidenced} backed by a word-for-word quote from the candidate's materials${dropped ? `; ${dropped} claims removed because the quote did not match` : ''}.`);
  doc.seconds = Math.round((Date.now() - t0) / 1000); doc.status = 'done'; doc.stage = 'Done'; saveDoc(doc);
}
/** A candidate already found by Proprietary Search: their sourced career facts become the materials, with links. */
export function candidateFromSearch(s, e) {
  const lines = [`${e.name}${e.title ? `, ${e.title}` : ''}${e.employer ? ` at ${e.employer}` : ''}${e.location ? ` (${e.location})` : ''}`, e.summary || '', ...(e.verifiedFacts || []).map(f => `${f.text} [source: ${f.url}]`), ...(e.priorEmployers?.length ? [`Prior employers mentioned: ${e.priorEmployers.join(', ')}`] : [])];
  return { text: lines.filter(Boolean).join('\n'), name: `${e.name}, from Proprietary Search (public sources)` };
}
