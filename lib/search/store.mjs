// Persistence: one JSON file per search under workspace/searches (the app's existing file-based store).
import fs from 'node:fs'; import path from 'node:path';
import { writeJson } from '../fsafe.mjs';
let DIR = null;
export const initStore = d => { DIR = d; fs.mkdirSync(d, { recursive: true }); };
export const saveSearch = s => writeJson(path.join(DIR, s.id + '.json'), s, { backup: false });
export const loadSearch = id => { try { return JSON.parse(fs.readFileSync(path.join(DIR, String(id).replace(/[^\w-]/g, '') + '.json'), 'utf8')); } catch { return null; } };
export const listSearches = () => fs.readdirSync(DIR).filter(f => /^s[a-z0-9]+\.json$/.test(f) && fs.statSync(path.join(DIR, f)).isFile()).map(f => { try { const s = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); if (!s.id || !s.created) return null; return { id: s.id, mode: s.mode, objective: s.objective, status: s.status, created: s.created, results: (s.entities || []).filter(e => e.scored).length, queries: (s.queries || []).filter(q => q.status === 'done').length, raw: (s.raw || []).length, contacts: (s.entities || []).reduce((t, e) => t + (e.contactInfo || []).length, 0), weekly: !!s.watchId, linked: !!s.link, saved: (s.entities || []).filter(e => e.decision === 'saved' || e.decision === 'priority').length }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.created.localeCompare(a.created));
export const archiveSearch = id => { const f = path.join(DIR, String(id).replace(/[^\w-]/g, '') + '.json'); if (!fs.existsSync(f)) return false; fs.mkdirSync(path.join(DIR, 'archive'), { recursive: true }); fs.renameSync(f, path.join(DIR, 'archive', path.basename(f))); return true; };
// Background jobs (intent scan, signal updates) work on a copy read minutes earlier. Before saving it, take the user's
// own choices (Save / Reject / Priority, notes) from the file as it is now, so a decision made meanwhile is never lost.
const USER_FIELDS = ['decision', 'note'];
export const saveSearchMerged = s => {
  const cur = loadSearch(s.id);
  if (cur) { const byId = new Map((cur.entities || []).map(e => [e.id, e]));
    for (const e of s.entities || []) { const c = byId.get(e.id); if (!c) continue; for (const k of USER_FIELDS) { if (k in c) e[k] = c[k]; else delete e[k]; } } }
  saveSearch(s);
};
