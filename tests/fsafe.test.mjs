// Safe saving: atomic writes, owner-only token files from the first byte, a .bak copy, and no silent empty start.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { writeJson, readJson } from '../lib/fsafe.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-fsafe-'));

test('a token file is owner-only (0600) as soon as it exists', () => {
  const f = path.join(dir, 'accounts.json');
  writeJson(f, { a: 1 }, { mode: 0o600 });
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  writeJson(f, { a: 2 }, { mode: 0o600 });
  assert.equal(fs.statSync(`${f}.bak`).mode & 0o777, 0o600);
  assert.deepEqual(readJson(f, null), { a: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${f}.bak`, 'utf8')), { a: 1 });
  assert.deepEqual(fs.readdirSync(dir).filter(x => x.includes('.tmp-')), []);
});

test('a damaged file falls back to the backup; with no backup, strict refuses to start empty', () => {
  const f = path.join(dir, 'outreach.json');
  writeJson(f, { items: [1] }); writeJson(f, { items: [1, 2] });
  fs.writeFileSync(f, '{"items": [1, 2');
  assert.deepEqual(readJson(f, null, { strict: true }), { items: [1] });
  writeJson(f, { items: [3] }); // a damaged current file never replaces the good backup
  assert.deepEqual(JSON.parse(fs.readFileSync(`${f}.bak`, 'utf8')), { items: [1] });
  const g = path.join(dir, 'lonely.json'); fs.writeFileSync(g, '{oops');
  assert.throws(() => readJson(g, {}, { strict: true }), /will not start/);
  assert.deepEqual(readJson(g, { empty: true }), { empty: true });
  assert.deepEqual(readJson(path.join(dir, 'missing.json'), { none: 1 }, { strict: true }), { none: 1 });
});
