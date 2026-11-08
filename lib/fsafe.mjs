// Safe saving for every AION data file: write a temp file next to it, then rename it into place (a crash mid-save
// never leaves half a file), and keep the previous good copy as <file>.bak. Reading falls back to the .bak copy when
// the main file is damaged, and can refuse to start empty, so a damaged file never silently wipes outreach history
// or the "do not contact" list.
import fs from 'node:fs'; import path from 'node:path';

/** Writes text to file atomically. mode (e.g. 0o600) applies from the first byte, never after. */
export function writeAtomic(file, text, { mode = 0o644, backup = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const fd = fs.openSync(tmp, 'w', mode);
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.chmodSync(tmp, mode); } catch {}
  if (backup && fs.existsSync(file)) {
    // keep the last good copy only when the current file still parses (never overwrite a good .bak with a damaged file)
    try { const cur = fs.readFileSync(file, 'utf8'); if (!file.endsWith('.json') || (JSON.parse(cur), true)) { fs.writeFileSync(`${file}.bak`, cur, { mode }); try { fs.chmodSync(`${file}.bak`, mode); } catch {} } } catch {}
  }
  fs.renameSync(tmp, file);
}

export const writeJson = (file, data, opts = {}) => writeAtomic(file, JSON.stringify(data, null, opts.indent ?? 1), opts);

/**
 * Reads JSON. Missing file → fallback. Damaged file → the .bak copy (and says so on stderr).
 * strict: a file that exists but neither it nor its .bak can be read throws, instead of starting empty.
 */
export function readJson(file, fallback, { strict = false } = {}) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    try { const j = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')); console.error(`AION: ${path.basename(file)} could not be read (${e.message}); using the backup copy ${path.basename(file)}.bak`); return j; } catch {}
    if (strict) throw new Error(`AION will not start with an empty ${path.basename(file)}: the file exists but can't be read, and there is no good backup. Fix or restore ${file} first.`);
    return fallback;
  }
}
