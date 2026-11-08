// AION's own price guide and playbook come from a git-ignored file; without it, neutral example values are used.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const run = env => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
  const P = await import(${JSON.stringify(path.join(ROOT, 'lib/private.mjs'))}); const T = await import(${JSON.stringify(path.join(ROOT, 'lib/thesis.mjs'))});
  const M = await import(${JSON.stringify(path.join(ROOT, 'lib/model.mjs'))}); const O = await import(${JSON.stringify(path.join(ROOT, 'lib/outreach/outreach.mjs'))});
  const loi = O.LOI_PROMPT({ name: 'Placeholder Co' }, { ebitda: 1, price: 1, multiple: 1, senior: 0, seller: 0, equity: 0, revenue: 0 }, {});
  console.log(JSON.stringify({ price: P.browserConfig().price, entry: M.DEFAULT_ASSUMPTIONS.entry_multiple, cap: T.GUIDES.multiple, loi, full: O.draftPrompt('target', 'Pat', [], {}, null, 'full') }));`], { env: { ...process.env, AION_OFFLINE: '1', ...env } }).toString());

test('no private file: neutral example values, nothing of AION’s own playbook', () => {
  const r = run({ AION_PRIVATE_CONFIG: path.join(os.tmpdir(), 'aion-none.json'), AION_NO_PRIVATE: '' });
  assert.equal(r.price.custom, false); assert.equal(r.entry, r.price.target); assert.equal(r.cap, r.price.cap);
  assert.match(r.loi, /\[\[to agree\]\]/); assert.doesNotMatch(r.loi, /earnout/);
});

test('a private file sets the price guide, LOI terms and pitch wording everywhere', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aion-priv-')), 'config.json');
  fs.writeFileSync(f, JSON.stringify({ price: { target: 2.5, cap: 2.75 }, loi: { terms: 'TERMS ABOVE {cap}x' }, prompts: { purpose: { full: 'FULL PITCH WORDING' } } }));
  const r = run({ AION_PRIVATE_CONFIG: f, AION_NO_PRIVATE: '' });
  assert.deepEqual([r.price.target, r.price.cap, r.price.custom], [2.5, 2.75, true]);
  assert.equal(r.entry, 2.5); assert.equal(r.cap, 2.75);
  assert.match(r.loi, /TERMS ABOVE 2\.75x/); assert.match(r.full, /FULL PITCH WORDING/);
});
