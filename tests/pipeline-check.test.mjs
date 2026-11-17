// Regression (2026-11-16): every in-depth check threw "save is not defined", so live searches ended "partial".
// Runs "check more" on a saved search with a fake AI (no network) and requires a clean finish.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import '../tests/helpers/no-network.mjs';
import { initStore, loadSearch } from '../lib/search/store.mjs';
import { checkMore } from '../lib/search/pipeline.mjs';

test('an in-depth check saves its result and the search finishes clean (no "save is not defined")', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cia-pipe-')); initStore(dir);
  const s = { id: 'stest1', mode: 'target', objective: 'Founder-owned precision machine shops in Texas', status: 'done', errors: [], log: [], t0: Date.now(),
    strategy: { criteria: [{ key: 'founder_owned', label: 'Founder-owned', weight: 3 }, { key: 'size_fit', label: 'Right size', weight: 2 }] },
    entities: [{ id: 'e1', company: 'Example Machine Works', evidence: [{ url: 'https://example-machine.test/about' }], signals: [] }] };
  globalThis.__runToolsForTests = async () => ({ text: JSON.stringify({ same_entity_confidence: 0.9, company: 'Example Machine Works', industry: 'Precision machine shop', ownership: 'founder-owned',
    criteria: [{ key: 'founder_owned', status: 'strong', note: 'Founder runs it', url: 'https://example-machine.test/about' }, { key: 'size_fit', status: 'partial', note: 'About 60 people', url: 'https://example-machine.test/about' }],
    facts: [{ text: 'Founded in 1988', url: 'https://example-machine.test/about' }], timing: [], summary: 'A founder-owned machine shop.' }) });
  try { assert.equal(await checkMore(s, { n: 1, cwd: dir, model: 'x' }), 1); } finally { delete globalThis.__runToolsForTests; }
  const saved = loadSearch('stest1');
  assert.equal(saved.entities[0].scored, true);
  assert.ok(!(s.errors || []).some(e => /save is not defined/.test(e.error)), JSON.stringify(s.errors));
  assert.equal(saved.status, 'done');
});
