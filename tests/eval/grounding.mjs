// AI output check (no AI calls, no cost): reads a workspace and verifies that what the AI produced is grounded.
//   node tests/eval/grounding.mjs [workspace folder]      (default: ./workspace; read-only)
// Value Creation: every one-off cost points to real ledger rows and its amount is computed from them; every account
// has a known category; real profit follows the formula; plan moves respect their caps.
// Search: every fact, contact, criterion and timing clue carries a link; a failed must-have caps the score at 40%.
import fs from 'node:fs'; import path from 'node:path';
import { CATEGORIES, periods, pnl, normalize, rowValue } from '../../lib/model.mjs';
import { CAP } from '../../lib/search/score.mjs';

const WS = path.resolve(process.argv[2] || 'workspace');
const load = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const fails = [], counts = {};
const check = (area, ok, what) => { counts[area] = counts[area] || { pass: 0, fail: 0 }; counts[area][ok ? 'pass' : 'fail']++; if (!ok) fails.push(`${area}: ${what}`); };
const near = (a, b, tol = 1) => Math.abs((a || 0) - (b || 0)) <= tol;

// ---------- deals ----------
const DEALS = path.join(WS, 'deals');
for (const id of fs.existsSync(DEALS) ? fs.readdirSync(DEALS) : []) {
  const S = load(path.join(DEALS, id, 'state.json')), rows = load(path.join(DEALS, id, 'gl.json')) || [];
  if (!S?.file || !S.mapping) continue;
  const name = S.name || id, byId = new Map(rows.map(r => [r.id, r]));
  for (const [acct, cat] of Object.entries(S.mapping)) check('Account sorting', !!CATEGORIES[cat], `${name}: "${acct}" mapped to unknown category ${cat}`);
  for (const a of S.addbacks || []) {
    const ids = a.ids || [], found = ids.filter(i => byId.has(i));
    check('One-off costs grounded in ledger rows', S.file.kind !== 'gl' || (ids.length > 0 && found.length === ids.length), `${name}: "${a.label}" points to ${ids.length - found.length} missing rows`);
    if (S.file.kind === 'gl' && found.length) {
      const fromRows = found.reduce((t, i) => t + Math.abs(byId.get(i).amount), 0);
      check('One-off cost amounts computed from rows', near(Math.abs(a.amount), fromRows, Math.max(1, fromRows * 0.001)), `${name}: "${a.label}" says ${a.amount}, its rows add to ${fromRows.toFixed(2)}`);
    }
  }
  if (S.mappingConfirmed && S.range && rows.length) {
    const per = periods(S.range), t = pnl(rows, S.mapping, S.signMode, per.ttm);
    const n = normalize(t, S.addbacks || [], S.owner || {});
    check('Real profit formula', near(n.normalized, t.ebitda + n.addbacks + n.ownerActual - n.replacement), `${name}: normalization does not add up`);
    const rev = rows.filter(r => { const m = r.date.slice(0, 7); return m >= per.ttm.from && m <= per.ttm.to && CATEGORIES[S.mapping[r.account]]?.group === 'revenue'; }).reduce((s, r) => s + rowValue(r, S.mapping[r.account], S.signMode), 0);
    check('Revenue recomputed from rows', near(t.revenue, rev, Math.max(1, Math.abs(rev) * 0.0001)), `${name}: TTM revenue ${t.revenue} vs rows ${rev}`);
    // the AI names the accounts a move works on; software prices it only from accounts that exist in these books
    const acct = S.industryPlan?.acct || {};
    for (const mv of S.industryPlan?.moves || []) {
      check('Plan moves use known drivers', ['price', 'cost', 'volume', 'none', 'other'].includes(mv.driver) || !mv.driver, `${name}: "${mv.title}" has driver ${mv.driver}`);
      const named = mv.accounts || [], real = named.filter(k => k in acct);
      if (named.length) check('Plan moves name real accounts', real.length > 0, `${name}: "${mv.title}" names no account found in the books (${named.slice(0, 2).join(', ')}); it is listed but not priced`);
    }
  }
}

// ---------- searches ----------
const SD = path.join(WS, 'searches');
const isUrl = u => /^https?:\/\//i.test(String(u || ''));
for (const f of fs.existsSync(SD) ? fs.readdirSync(SD).filter(x => /^s.*\.json$/.test(x)) : []) {
  const s = load(path.join(SD, f)); if (!s?.entities) continue;
  for (const e of s.entities.filter(x => x.scored)) {
    const who = `${s.id}/${e.company || e.name}`;
    for (const x of e.verifiedFacts || []) check('Search facts have a source link', isUrl(x.url), `${who}: fact without a link`);
    for (const c of e.contacts || []) check('Contacts have a source link', isUrl(c.url), `${who}: contact ${c.name} without a link`);
    for (const c of e.contactInfo || []) check('Contact details verified on a page', c.verified === true && isUrl(c.url), `${who}: ${c.kind} not verified`);
    for (const b of e.breakdown || []) if (['strong', 'partial', 'mismatch'].includes(b.status)) check('Criteria judgments have a source link', isUrl(b.url), `${who}: "${b.label}" judged ${b.status} without a link`);
    for (const t of e.timing?.signals || []) check('Timing clues have a source link', isUrl(t.url), `${who}: timing clue without a link`);
    if ((e.failed || []).length) check('Failed must-have caps the score', e.score <= CAP, `${who}: fails a must-have but scores ${e.score}%`);
  }
}

console.log(`AI output check on ${WS}\n`);
for (const [k, v] of Object.entries(counts)) console.log(`${v.fail ? 'FAIL' : 'PASS'}  ${k}: ${v.pass} passed${v.fail ? `, ${v.fail} failed` : ''}`);
if (fails.length) { console.log(`\n${fails.length} problems (first 20):`); fails.slice(0, 20).forEach(x => console.log(' - ' + x)); }
process.exit(fails.length ? 1 : 0);
