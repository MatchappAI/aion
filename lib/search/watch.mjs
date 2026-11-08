// Watchlists: a saved search re-runs on a schedule and reports only what is new since its last run.
 import path from 'node:path';
import { readJson, writeJson } from '../fsafe.mjs';
let FILE = null, W = {};
export function initWatch(dir) { FILE = path.join(dir, 'watchlists.json'); W = readJson(FILE, {}) || {}; }
const save = () => { try { writeJson(FILE, W, { indent: 1 }); } catch {} };
const DAY = 86400000;
export const watches = () => Object.values(W);
export function setWatch(s, on, days = 7) { if (on) W[s.watchId || s.id] = { id: s.watchId || s.id, mode: s.mode, objective: s.objective, filters: s.filters, origin: s.watchId || s.id, every: days, lastSearch: s.id, lastRun: s.created, next: new Date(Date.parse(s.created) + days * DAY).toISOString(), history: [{ search: s.id, at: s.created, fresh: null }] }; else delete W[s.watchId || s.id]; save(); }
export const due = () => Object.values(W).filter(w => Date.parse(w.next) <= Date.now() && !w.running);
export function started(w) { w.running = true; save(); }
export function finished(w, s, fresh) { w.running = false; w.lastSearch = s.id; w.lastRun = s.created; w.next = new Date(Date.now() + w.every * DAY).toISOString(); w.history = [...w.history, { search: s.id, at: s.created, fresh }].slice(-12); save(); }
export const watchOf = s => W[s.watchId || s.id] || null;
