// Explainable scoring: each criterion is assessed against evidence; the score is a weighted sum anyone can recompute.
// Missing evidence lowers confidence; it is not counted as a mismatch.
// Must-haves: a clear mismatch on one (size, niche, likely to sell / buy / hire / move) caps the score,
// so a firm that breaks the thesis can never outrank one that fits it.
export const VALUE = { strong: 1, partial: 0.6, no_evidence: 0.3, mismatch: 0 };
export const CAP = 40;
// paid_upfront stays here so searches saved before thesis v3.0 score as they always did; new searches use cash_conversion_quality,
// which is weighed but never a must-have (a Net 30 engineering firm must not be capped for billing in arrears)
const FIXED = ['paid_upfront', 'likely_available_to_buy', 'likely_to_use_outside_recruiter', 'likely_to_buy_service', 'realistic_to_approach'];
export function mustHave(mode, c) {
  if (c.must != null) return !!c.must;
  if (FIXED.includes(c.key)) return true;
  if (mode === 'candidate') return false;
  if (/size/.test(c.key)) return true;
  if (['cash_conversion_quality', 'cash_health', 'aion_edge'].includes(c.key)) return false;
  return mode === 'target' && /niche|focus|upfront|retain/.test(c.key);
}
export function score(criteria, assessed, identity = 1, mode = '') {
  const W = criteria.reduce((t, c) => t + (c.weight || 1), 0) || 1;
  const rows = criteria.map(c => { const a = assessed.find(x => x.key === c.key) || { status: 'no_evidence', note: 'Not found in public sources reviewed.' }; return { ...c, must: mustHave(mode, c), status: VALUE[a.status] != null ? a.status : 'no_evidence', note: a.note || '', url: a.url || '' }; });
  const raw = rows.reduce((t, r) => t + (r.weight || 1) * VALUE[r.status], 0) / W;
  const evidenced = rows.filter(r => r.status !== 'no_evidence').length / (rows.length || 1);
  const failed = rows.filter(r => r.must && r.status === 'mismatch').map(r => r.label);
  const pct = Math.round(raw * 100 * (identity < 0.5 ? 0.8 : 1));
  return { pct: failed.length ? Math.min(pct, CAP) : pct, rows, failed, coverage: evidenced, confidence: evidenced >= 0.7 && identity >= 0.7 ? 'High' : evidenced >= 0.4 ? 'Medium' : 'Low' };
}
