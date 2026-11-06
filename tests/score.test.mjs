import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, mustHave, CAP } from '../lib/search/score.mjs';

const crit = [{ key: 'niche_fit', label: 'Places supply chain leaders', weight: 3 }, { key: 'size_fit', label: 'About 5–100 staff', weight: 2 }, { key: 'founder_tenure', label: 'Founder 15+ years', weight: 2 }, { key: 'paid_upfront', label: 'Mostly paid upfront', weight: 3 }];
const all = st => crit.map(c => ({ key: c.key, status: st }));

test('a clear mismatch on a must-have caps the score and names it', () => {
  const r = score(crit, [...all('strong').filter(a => a.key !== 'size_fit'), { key: 'size_fit', status: 'mismatch' }], 1, 'target');
  assert.equal(r.pct, CAP);
  assert.deepEqual(r.failed, ['About 5–100 staff']);
});
test('a nice-to-have mismatch only lowers the score', () => {
  const r = score(crit, [...all('strong').filter(a => a.key !== 'founder_tenure'), { key: 'founder_tenure', status: 'mismatch' }], 1, 'target');
  assert.equal(r.failed.length, 0); assert.equal(r.pct, 80);
});
test('missing evidence on a must-have is not a failure', () => {
  const r = score(crit, all('no_evidence'), 1, 'target');
  assert.equal(r.failed.length, 0); assert.equal(r.pct, 30);
});
test('a low score stays low when capped', () => assert.equal(score(crit, all('mismatch'), 1, 'target').pct, 0));
test('must-haves by mode', () => {
  assert.ok(mustHave('client', { key: 'right_size' })); assert.ok(mustHave('client', { key: 'likely_to_use_outside_recruiter' }));
  assert.ok(!mustHave('client', { key: 'niche_fit' })); assert.ok(!mustHave('candidate', { key: 'team_scale' }));
  assert.ok(mustHave('candidate', { key: 'realistic_to_approach' })); assert.ok(!mustHave('target', { key: 'size_fit', must: false }));
});
