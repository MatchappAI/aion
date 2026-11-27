// Reading spreadsheets without freezing AION. A file can declare a sheet far larger than what it holds (one cell in
// column XFD, or row 1,048,576), and turning that into rows builds millions of empty cells: a 548 KB file once froze
// the server for 100 seconds and stopped scheduled sends. Every sheet is trimmed to the cells it really has, and a
// sheet that is still too big is refused with a plain message.
import * as XLSX from 'xlsx';

export const MAX_BYTES = 30 * 1024 * 1024, MAX_CELLS = 3_000_000;

export function readBook(buffer, opts = {}) {
  if (buffer?.length > MAX_BYTES) throw new Error('This file is over 30 MB. Export just the report you need (General Ledger or P&L Detail) and upload that.');
  return XLSX.read(buffer, { type: 'buffer', ...opts });
}
/** The sheet's real used range (from its cells, not its declared size), or null when empty. */
function usedRange(ws) {
  let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue;
    const a = XLSX.utils.decode_cell(k); if (a.r < 0 || a.c < 0) continue;
    if (a.r < r1) r1 = a.r; if (a.c < c1) c1 = a.c; if (a.r > r2) r2 = a.r; if (a.c > c2) c2 = a.c;
  }
  return r2 < 0 ? null : { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } };
}
/** Rows of a sheet (header: 1), trimmed to the real cells; columns far from the data are not padded out. */
export function sheetRows(ws, opts = {}) {
  if (!ws) return [];
  const used = usedRange(ws); if (!used) return [];
  // a lone stray cell far to the right (a print-area marker) would widen every row: keep columns up to the last one
  // that holds data in more than one row (or lies within 200 columns of the first one)
  const colCount = new Map();
  for (const k of Object.keys(ws)) { if (k[0] === '!') continue; const a = XLSX.utils.decode_cell(k); colCount.set(a.c, (colCount.get(a.c) || 0) + 1); }
  let lastCol = used.s.c;
  for (const [c, n] of colCount) if (n > 1 || c - used.s.c < 200) lastCol = Math.max(lastCol, c);
  const range = { s: { r: 0, c: 0 }, e: { r: used.e.r, c: Math.min(used.e.c, lastCol) } };
  if ((range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > MAX_CELLS) throw new Error('This sheet is too large to read (over 3 million cells). Export just the report you need and upload that.');
  return XLSX.utils.sheet_to_json(ws, { header: 1, ...opts, range: XLSX.utils.encode_range(range) });
}
