// AION's own negotiating numbers and playbook (price target and ceiling, LOI terms, how each offer is pitched) are
// not in this public repo. They live in private/config.json, which git ignores. When that file is present it is
// loaded here at start; when it is missing, neutral example values are used (see private.example.json).
// AION_PRIVATE_CONFIG points at another file; AION_NO_PRIVATE=1 ignores it (tests check both ways).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { configure, PRICE, DEAL_TERMS, PURPOSE_OVERRIDES } from './thesis.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRIVATE_FILE = process.env.AION_PRIVATE_CONFIG ? path.resolve(process.env.AION_PRIVATE_CONFIG) : path.join(ROOT, 'private', 'config.json');

export function loadPrivate(file = PRIVATE_FILE) {
  if (process.env.AION_NO_PRIVATE === '1' || !fs.existsSync(file)) return null;
  try { const cfg = JSON.parse(fs.readFileSync(file, 'utf8')); configure(cfg); return cfg; }
  catch (e) { console.error(`AION: private config ${file} could not be read (${e.message}); using example values.`); return null; }
}
export const PRIVATE = loadPrivate();
/** The part the browser needs (the price guide), sent only to this computer's own browser. */
export const browserConfig = () => ({ price: { ...PRICE } });
export { PRICE, DEAL_TERMS, PURPOSE_OVERRIDES };
