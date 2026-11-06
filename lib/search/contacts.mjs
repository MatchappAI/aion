// Your own contacts (LinkedIn "Connections" export or any CSV with names and companies).
// Results are matched against them so warm introductions show up first. Stays on this Mac.
import fs from 'node:fs'; import path from 'node:path';
import * as XLSX from 'xlsx';
import { normName, normCo } from './resolve.mjs';
let FILE = null, C = { file: null, at: null, people: [] };
export function initContacts(dir) { FILE = path.join(dir, 'contacts.json'); try { C = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {} }
const pick = (h, res) => h.findIndex(c => res.some(r => r.test(c)));
export function importContacts(buffer, filename) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: false });
  // LinkedIn puts a few note lines above the header row
  const hi = rows.findIndex(r => r.some(c => /first name/i.test(c)) || r.some(c => /^name$/i.test(String(c).trim())));
  if (hi < 0) throw new Error('Could not find name columns. Use LinkedIn’s Connections.csv (Settings → Data privacy → Get a copy of your data → Connections) or a CSV with First Name, Last Name, Company and Position.');
  const h = rows[hi].map(c => String(c).trim().toLowerCase());
  const fi = pick(h, [/^first name$/]), li = pick(h, [/^last name$/]), ni = pick(h, [/^name$/, /full name/]), ci = pick(h, [/^company$/, /organization/, /employer/]), pi = pick(h, [/^position$/, /title/]), ui = pick(h, [/^url$/, /profile/]), di = pick(h, [/connected on/]);
  const people = rows.slice(hi + 1).map(r => {
    const name = ni >= 0 ? String(r[ni]).trim() : `${String(r[fi] ?? '').trim()} ${String(r[li] ?? '').trim()}`.trim();
    return { name, company: ci >= 0 ? String(r[ci]).trim() : '', title: pi >= 0 ? String(r[pi]).trim() : '', url: ui >= 0 ? String(r[ui]).trim() : '', since: di >= 0 ? String(r[di]).trim() : '' };
  }).filter(p => p.name && p.name.split(' ').length >= 2);
  if (!people.length) throw new Error('No contacts with names were found in that file.');
  C = { file: filename, at: new Date().toISOString(), people }; fs.writeFileSync(FILE, JSON.stringify(C));
  return { count: people.length, companies: new Set(people.map(p => normCo(p.company)).filter(Boolean)).size };
}
export const contactStats = () => C.people.length ? { file: C.file, at: C.at, count: C.people.length } : null;
export function clearContacts() { C = { file: null, at: null, people: [] }; try { fs.unlinkSync(FILE); } catch {} }
/** Who you already know for a result: the person themself, or people at the same company. */
export function warm(mode, e) {
  if (!C.people.length) return null;
  if (mode === 'candidate') {
    const n = normName(e.name), me = C.people.find(p => normName(p.name) === n);
    if (me) return { you: true, people: [me] };
    const co = normCo(e.employer); if (!co) return null;
    const at = C.people.filter(p => { const pc = normCo(p.company); return pc && (pc === co || pc.includes(co) || co.includes(pc)); });
    return at.length ? { you: false, people: at.slice(0, 5), count: at.length } : null;
  }
  const co = normCo(e.company); if (!co) return null;
  const at = C.people.filter(p => { const pc = normCo(p.company); return pc && (pc === co || (pc.length > 4 && co.length > 4 && (pc.includes(co) || co.includes(pc)))); });
  return at.length ? { you: false, people: at.slice(0, 5), count: at.length } : null;
}
