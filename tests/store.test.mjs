// A background job saving an old copy of a search never undoes a Save/Reject/note made meanwhile.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { initStore, saveSearch, loadSearch, saveSearchMerged } from '../lib/search/store.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-store-')); initStore(dir);

test('intent-scan style save keeps decisions made while it ran', () => {
  saveSearch({ id: 'sabc', created: 'x', mode: 'target', entities: [{ id: 'e1', company: 'Placeholder Co' }, { id: 'e2', company: 'Example Firm', decision: 'saved' }] });
  const stale = loadSearch('sabc');
  const live = loadSearch('sabc'); live.entities[0].decision = 'rejected'; live.entities[0].note = 'not a fit'; delete live.entities[1].decision; saveSearch(live);
  stale.entities[0].intentAt = 'now'; stale.entities[1].intentAt = 'now';
  saveSearchMerged(stale);
  const out = loadSearch('sabc');
  assert.equal(out.entities[0].decision, 'rejected'); assert.equal(out.entities[0].note, 'not a fit'); assert.equal(out.entities[0].intentAt, 'now');
  assert.equal(out.entities[1].decision, undefined); assert.equal(out.entities[1].intentAt, 'now');
});
