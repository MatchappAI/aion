// Which AI does the work. The app uses whatever the person already has, in this order:
//   1. Claude Code, installed and logged in (runs through `claude -p`, the original AION path)
//   2. Codex, installed and logged in (runs through `codex exec`)
//   3. An Anthropic or OpenAI API key they paste once (billed to their own account)
// Every engine returns the same shape: { text, results, costUsd }, where results are the tool calls and what the tools
// returned. Engines that do not hand back their own search results (Codex) have every link they report opened by
// AION itself; only links that load are kept, and the page text becomes the evidence later checks run against.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJson } from './fsafe.mjs';
import { readPages, linksIn, pdfText } from './pages.mjs';

export const ENGINES = {
  'claude-code': { label: 'Claude Code', kind: 'cli', billing: 'Your Claude plan' },
  codex: { label: 'Codex', kind: 'cli', billing: 'Your ChatGPT plan' },
  anthropic: { label: 'Anthropic API key', kind: 'api', billing: 'Your Anthropic account, per use' },
  openai: { label: 'OpenAI API key', kind: 'api', billing: 'Your OpenAI account, per use' },
};
const ORDER = ['claude-code', 'codex', 'anthropic', 'openai'];

let DIR = null, CFG = { engine: 'auto', models: {} }, KEYS = {};
const cfgFile = () => path.join(DIR, 'engine.json'), keyFile = () => path.join(DIR, 'keys.json');

// Apps opened from the Dock or Start menu do not get the shell's PATH, so add the usual install folders.
function widenPath() {
  const H = os.homedir(), sep = path.delimiter;
  // Claude Code finds its saved login (macOS Keychain) by user name; some launchers start apps without USER set
  try { const u = os.userInfo().username; if (!process.env.USER) process.env.USER = u; if (!process.env.LOGNAME) process.env.LOGNAME = u; if (process.platform === 'win32' && !process.env.USERNAME) process.env.USERNAME = u; } catch {}
  const extra = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || '', 'npm'), path.join(H, '.local', 'bin'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude'), path.join(H, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links')]
    : [path.join(H, '.local', 'bin'), path.join(H, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin', path.join(H, '.npm-global', 'bin'), path.join(H, '.volta', 'bin'), path.join(H, '.bun', 'bin'), '/usr/bin', '/bin'];
  const nvm = path.join(H, '.nvm', 'versions', 'node');
  try { for (const v of fs.readdirSync(nvm)) extra.push(path.join(nvm, v, 'bin')); } catch {}
  const have = new Set(String(process.env.PATH || '').split(sep));
  process.env.PATH = [...String(process.env.PATH || '').split(sep), ...extra.filter(p => p && !have.has(p))].join(sep);
}

export function initEngine(dir) {
  DIR = dir; fs.mkdirSync(dir, { recursive: true }); widenPath();
  try { CFG = { engine: 'auto', models: {}, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch {}
  try { KEYS = JSON.parse(fs.readFileSync(keyFile(), 'utf8')); } catch {}
  if (process.env.ANTHROPIC_API_KEY && !KEYS.anthropic) KEYS.anthropic = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY && !KEYS.openai) KEYS.openai = process.env.OPENAI_API_KEY;
}
const saveCfg = () => writeJson(cfgFile(), CFG, { indent: 2 });
// keys stay on this computer only, readable by this user only
const saveKeys = () => writeJson(keyFile(), KEYS, { mode: 0o600 });

// The AI helper programs (Claude Code, Codex) get only what they need to run and sign in: never AION's own secrets
// (Google client secret, Hunter / Apollo / People Data Labs keys, API keys from .env).
const ENV_KEEP = /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|LANG|LC_[A-Z_]+|TERM|TZ|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy|ALL_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|CLAUDE_CONFIG_DIR|CODEX_HOME|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_CACHE_HOME|SystemRoot|SYSTEMROOT|windir|WINDIR|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|ComSpec|COMSPEC|PATHEXT|ProgramFiles|ProgramData|PROGRAMFILES|PROGRAMDATA)$/;
export const childEnv = (src = process.env) => Object.fromEntries(Object.entries(src).filter(([k]) => ENV_KEEP.test(k)));

/** Spawn a command-line tool; on Windows npm installs are .cmd shims, which need a shell. */
export function cli(cmd, args, opts = {}) {
  // AION_OFFLINE=1 (tests): the AI helpers never start; a stand-in exits with an error instead
  if (process.env.AION_OFFLINE === '1' && /^(claude|codex)$/.test(cmd)) return spawn(process.execPath, ['-e', 'console.error("AION_OFFLINE: AI helpers are off"); process.exit(1)'], { windowsHide: true });
  const win = process.platform === 'win32';
  return spawn(cmd, win ? args.map(a => /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a) : args, { ...opts, shell: win, env: childEnv(), windowsHide: true });
}
// Claude Code runs with no MCP servers and none of your personal settings or allow-lists: only the tools AION names.
export const CLAUDE_LOCKDOWN = ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', 'project'];
const run = (cmd, args, ms = 15000) => new Promise(res => {
  let out = '', done = false; const c = cli(cmd, args); const t = setTimeout(() => { if (!done) { done = true; try { c.kill(); } catch {} res({ ok: false, out: 'timed out' }); } }, ms);
  c.stdout?.on('data', d => out += d); c.stderr?.on('data', d => out += d);
  c.on('error', e => { if (!done) { done = true; clearTimeout(t); res({ ok: false, out: e.message }); } });
  c.on('close', code => { if (!done) { done = true; clearTimeout(t); res({ ok: code === 0, out }); } });
  c.stdin?.end();
});

/** What is available on this computer right now. Never spends a call. */
export async function detect() {
  const [cc, cx] = await Promise.all([run('claude', ['auth', 'status']), run('codex', ['login', 'status'])]);
  let ccIn = false; try { ccIn = !!JSON.parse(cc.out.slice(cc.out.indexOf('{'))).loggedIn; } catch { ccIn = cc.ok && /logged ?in/i.test(cc.out) && !/not logged/i.test(cc.out); }
  const cxIn = cx.ok && /logged in/i.test(cx.out) && !/not logged/i.test(cx.out);
  const list = [
    { id: 'claude-code', ...ENGINES['claude-code'], installed: !/not found|ENOENT|not recognized/i.test(cc.out) && cc.out !== 'timed out', ready: ccIn, detail: ccIn ? 'Installed and logged in' : /not found|ENOENT|not recognized/i.test(cc.out) ? 'Not installed' : 'Installed, not logged in: run `claude` once in a terminal' },
    { id: 'codex', ...ENGINES.codex, installed: !/not found|ENOENT|not recognized/i.test(cx.out), ready: cxIn, detail: cxIn ? cx.out.trim().split('\n').pop() : /not found|ENOENT|not recognized/i.test(cx.out) ? 'Not installed' : 'Installed, not logged in: run `codex login` in a terminal' },
    { id: 'anthropic', ...ENGINES.anthropic, installed: true, ready: !!KEYS.anthropic, detail: KEYS.anthropic ? `Key saved (…${KEYS.anthropic.slice(-4)})` : 'No key saved' },
    { id: 'openai', ...ENGINES.openai, installed: true, ready: !!KEYS.openai, detail: KEYS.openai ? `Key saved (…${KEYS.openai.slice(-4)})` : 'No key saved' },
  ];
  return list;
}

let ACTIVE = null; // resolved engine id, cached after detect
// an engine that hit its plan's usage limit is skipped for an hour, and work moves to the next ready one
const LIMITED = {}, LIMIT_RE = /usage limit|rate limit|quota|insufficient_quota|credit balance|billing|429|overloaded/i;
const limited = id => LIMITED[id] && Date.now() - LIMITED[id].at < 3600e3;
export const limits = () => Object.fromEntries(Object.entries(LIMITED).filter(([k]) => limited(k)));
export async function resolve(force = false) {
  if (ACTIVE && !force && !limited(ACTIVE)) return ACTIVE;
  const list = await detect();
  const ok = x => x.ready && !limited(x.id);
  const pick = CFG.engine !== 'auto' && list.find(x => x.id === CFG.engine && ok(x)) ? CFG.engine : (list.find(ok)?.id || null);
  ACTIVE = pick; return pick;
}
export const active = () => ACTIVE;
export const settings = () => ({ engine: CFG.engine, models: CFG.models, keys: { anthropic: KEYS.anthropic ? '…' + KEYS.anthropic.slice(-4) : null, openai: KEYS.openai ? '…' + KEYS.openai.slice(-4) : null } });
export function choose(engine) { if (engine !== 'auto' && !ENGINES[engine]) throw new Error('Unknown engine'); CFG.engine = engine; saveCfg(); ACTIVE = null; }
export function setKey(which, key) {
  if (!['anthropic', 'openai'].includes(which)) throw new Error('Unknown key type');
  const k = String(key || '').trim();
  if (k && (which === 'anthropic' ? !/^sk-ant-/.test(k) : !/^sk-/.test(k))) throw new Error(which === 'anthropic' ? 'Anthropic keys start with sk-ant-' : 'OpenAI keys start with sk-');
  if (k) KEYS[which] = k; else delete KEYS[which];
  saveKeys(); ACTIVE = null;
}

// ---------- the one call every part of the app goes through ----------
const TOOLMAP = { WebSearch: 'web_search', WebFetch: 'web_fetch' };
/**
 * opts: { prompt, system, model, tools: ['WebSearch','WebFetch'], pdf: absolute path | null, cwd, timeoutMs, onText, onToolUse, onToolResult, engine }
 * Returns { text, results, costUsd, engine }.
 */
export async function complete(opts) {
  if (process.env.AION_OFFLINE === '1') throw new Error('AION_OFFLINE: AI calls are off.');
  const engine = opts.engine || await resolve();
  if (!engine) throw new Error(Object.keys(limits()).length ? `Every AI set up here has hit its usage limit (${Object.entries(limits()).map(([k, v]) => `${ENGINES[k].label}: ${v.message}`).join('; ')}). Add another in Settings → AI, or try again later.` : 'No AI is set up yet. Open Settings → AI and pick Claude Code, Codex or an API key.');
  if (engine === 'claude-code') throw new Error('Claude Code runs through the original runner'); // callers handle this path
  const fn = { codex: viaCodex, anthropic: viaAnthropic, openai: viaOpenAI }[engine];
  try { return { ...(await fn(opts)), engine }; }
  catch (e) { if (noteLimit(engine, e)) return retryElsewhere(opts, engine, e); throw e; }
}
/** Records a usage-limit error; true when it was one. */
export function noteLimit(engine, e) {
  if (!LIMIT_RE.test(String(e?.message || e))) return false;
  LIMITED[engine] = { at: Date.now(), message: String(e.message || e).slice(0, 200) }; ACTIVE = null; return true;
}
/** After a usage limit, the same request goes to the next ready engine (Claude Code included). */
export async function retryElsewhere(opts, from, err) {
  const next = await resolve(true);
  if (!next || next === from) throw err;
  if (next === 'claude-code') {
    let prompt = opts.prompt;
    if (opts.pdf) { const t = await pdfText(opts.pdf); prompt = prompt.replace(/Read the file with the Read tool\.?/i, '') + `\n\nThe PDF's text, page by page (${t.pages} pages):\n\n${t.text}`; }
    const { runTools } = await import('./search/runner.mjs');
    return { ...(await runTools({ ...opts, prompt, model: /^claude-/.test(opts.model || '') ? opts.model : 'claude-sonnet-5-5', engine: 'claude-code' })), engine: 'claude-code', fellBackFrom: from };
  }
  return { ...(await complete({ ...opts, engine: next })), fellBackFrom: from };
}

// ---------- Anthropic API ----------
const PRICE = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };
const SEARCH_PRICE = 0.01; // per web search, from Anthropic's published server-tool pricing
async function viaAnthropic({ prompt, system, model, tools = [], pdf, timeoutMs = 600000, onText, onToolUse, onToolResult }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: KEYS.anthropic, timeout: timeoutMs, maxRetries: 2 });
  const m = /^claude-/.test(model || '') ? model : (CFG.models.anthropic || 'claude-opus-5-5');
  const toolDefs = [];
  if (tools.includes('WebSearch')) toolDefs.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 40 });
  if (tools.includes('WebFetch')) toolDefs.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 12, max_content_tokens: 20000 });
  const content = [];
  if (pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(pdf).toString('base64') } });
  content.push({ type: 'text', text: prompt });
  const messages = [{ role: 'user', content }], results = [], uses = {};
  let text = '', cost = 0;
  for (let turn = 0; turn < 8; turn++) {
    const stream = client.beta.messages.stream({
      model: m, max_tokens: 32000, system, messages, ...(toolDefs.length ? { tools: toolDefs } : {}),
      output_config: { effort: 'medium' },
      // on a safety decline, the API re-runs the request on a fallback model instead of stopping
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    stream.on('text', d => { text += d; try { onText?.(text); } catch {} });
    const msg = await stream.finalMessage();
    const p = PRICE[msg.model] || PRICE[m] || [4, 20], u = msg.usage || {};
    cost += ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) / 1e6 * p[0] + (u.output_tokens || 0) / 1e6 * p[1] + (u.server_tool_use?.web_search_requests || 0) * SEARCH_PRICE;
    for (const b of msg.content) {
      if (b.type === 'server_tool_use') { uses[b.id] = b; try { onToolUse?.(b.name === 'web_search' ? 'WebSearch' : 'WebFetch', b.input); } catch {} }
      else if (b.type === 'web_search_tool_result') {
        const call = uses[b.tool_use_id], list = Array.isArray(b.content) ? b.content : [];
        const r = { tool: 'WebSearch', input: call?.input || {}, structured: { query: call?.input?.query || '', results: [{ content: list.map(x => ({ url: x.url, title: x.title || '' })) }] }, text: list.map(x => `${x.title || ''} ${x.url}`).join('\n'), error: !Array.isArray(b.content) };
        results.push(r); try { onToolResult?.(r); } catch {}
      } else if (b.type === 'web_fetch_tool_result') {
        const call = uses[b.tool_use_id], c = b.content || {}, doc = c.content?.source?.data || '';
        const r = { tool: 'WebFetch', input: { url: c.url || call?.input?.url || '' }, structured: null, text: typeof doc === 'string' ? doc.slice(0, 60000) : '', error: c.type !== 'web_fetch_result' };
        results.push(r); try { onToolResult?.(r); } catch {}
      }
    }
    if (msg.stop_reason === 'refusal') throw new Error('The AI declined this request.');
    if (msg.stop_reason !== 'pause_turn') { text = msg.content.filter(b => b.type === 'text').map(b => b.text).join(''); break; }
    messages.push({ role: 'assistant', content: msg.content }); // a long search turn paused: send it back to continue
  }
  return { text, results, costUsd: Math.round(cost * 10000) / 10000 };
}

// ---------- OpenAI API ----------
async function openaiModel(client) {
  if (CFG.models.openai) return CFG.models.openai;
  // newest general GPT model the key can use
  const ids = []; for await (const x of client.models.list()) ids.push(x.id);
  const ok = ids.filter(id => /^gpt-\d+(\.\d+)?$/.test(id)).sort((a, b) => parseFloat(b.slice(4)) - parseFloat(a.slice(4)));
  const pick = ok[0] || ids.find(id => /^gpt-\d/.test(id) && !/mini|nano|audio|realtime|search|transcribe|tts|image/.test(id)) || 'gpt-5';
  CFG.models.openai = pick; saveCfg(); return pick;
}
async function viaOpenAI({ prompt, system, tools = [], pdf, timeoutMs = 600000, onText, onToolUse, onToolResult }) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: KEYS.openai, timeout: timeoutMs, maxRetries: 2 });
  const model = await openaiModel(client);
  const content = [{ type: 'input_text', text: prompt }];
  if (pdf) content.unshift({ type: 'input_file', filename: path.basename(pdf), file_data: 'data:application/pdf;base64,' + fs.readFileSync(pdf).toString('base64') });
  const web = tools.length > 0;
  const resp = await client.responses.create({ model, instructions: system, input: [{ role: 'user', content }], ...(web ? { tools: [{ type: 'web_search' }], include: ['web_search_call.action.sources'] } : {}) });
  const results = [], seen = new Set();
  for (const it of resp.output || []) {
    if (it.type !== 'web_search_call') continue;
    const a = it.action || {};
    if (a.type === 'search') {
      const q = a.query || (a.queries || []).join(' | ');
      try { onToolUse?.('WebSearch', { query: q }); } catch {}
      const links = (a.sources || []).filter(s => s.url).map(s => ({ url: s.url, title: '' }));
      links.forEach(l => seen.add(l.url));
      const r = { tool: 'WebSearch', input: { query: q }, structured: { query: q, results: [{ content: links }] }, text: links.map(l => l.url).join('\n'), error: it.status === 'failed' };
      results.push(r); try { onToolResult?.(r); } catch {}
    } else if (a.type === 'open_page' && a.url) { try { onToolUse?.('WebFetch', { url: a.url }); } catch {} }
  }
  const text = resp.output_text || '';
  try { onText?.(text); } catch {}
  if (web) await verifyLinks(text, results, onToolResult, seen, (resp.output || []).filter(i => i.type === 'web_search_call' && i.action?.type === 'open_page').map(i => i.action.url));
  return { text, results, costUsd: null };
}

// ---------- Codex ----------
async function viaCodex({ prompt, system, tools = [], pdf, cwd, timeoutMs = 600000, onText, onToolUse, onToolResult, verify = true }) {
  let body = system ? `${system}\n\n${prompt}` : prompt;
  if (pdf) { const t = await pdfText(pdf); body = body.replace(/Read the file with the Read tool\.?/i, '') + `\n\nThe PDF's text, page by page (${t.pages} pages):\n\n${t.text}`; }
  if (tools.length) body += '\n\nWhen you use web search, give the full https link for every page you rely on, inside your JSON answer.';
  const web = tools.length > 0;
  const go = model => new Promise((resolve, reject) => {
    const args = [...(web ? ['--search'] : []), 'exec', '--json', '--skip-git-repo-check', '--ignore-user-config', '-s', 'read-only', ...(cwd ? ['-C', cwd] : []), ...(model ? ['-m', model] : []), '-'];
    const child = cli('codex', args, { cwd });
    let buf = '', last = '', err = '', failed = null; const opened = [];
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1); let ev; try { ev = JSON.parse(line); } catch { continue; }
        const it = ev.item;
        if (ev.type === 'item.completed' && it?.type === 'agent_message') { last = it.text || ''; try { onText?.(last); } catch {} }
        else if (ev.type === 'item.completed' && it?.type === 'web_search') {
          const a = it.action || {};
          if (a.type === 'search') { try { onToolUse?.('WebSearch', { query: a.query || it.query }); } catch {} }
          else if (a.url) { opened.push(a.url); try { onToolUse?.('WebFetch', { url: a.url }); } catch {} }
        } else if (ev.type === 'turn.failed' || ev.type === 'error') failed = ev.error?.message || ev.message || 'Codex reported an error';
      }
    });
    child.stderr.on('data', d => err += d);
    child.on('error', e => { clearTimeout(timer); reject(new Error('Could not start Codex (`codex`): ' + e.message)); });
    child.on('close', code => { clearTimeout(timer); if (failed && !last) return reject(Object.assign(new Error(String(failed).slice(0, 400)), { model: /model/i.test(failed) })); if (code !== 0 && !last) return reject(new Error((err || `Codex exited with code ${code}`).slice(0, 400))); resolve({ text: last, opened }); });
    child.stdin.end(body);
  });
  let out;
  try { out = await go(CFG.models.codex); }
  catch (e) {
    // a model named in the person's own Codex settings may not be allowed on their plan: try the plan's models in turn
    if (!e.model) throw e;
    let ok = null;
    for (const mdl of codexModels()) { try { out = await go(mdl); ok = mdl; break; } catch (e2) { if (!e2.model) throw e2; } }
    if (!ok) throw e;
    CFG.models.codex = ok; saveCfg();
  }
  const results = [];
  if (web && verify) await verifyLinks(out.text, results, onToolResult, new Set(), out.opened);
  return { text: out.text, results, costUsd: null };
}
function codexModels() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.codex', 'models_cache.json'), 'utf8'));
    const slugs = JSON.stringify(j).match(/"slug":\s*"([^"]+)"/g)?.map(s => s.split('"')[3]) || [];
    return slugs.filter(s => /^gpt-/.test(s) && !/chat|reserve|review|mini/.test(s));
  } catch { return []; }
}

/** Open every link the engine reported (plus pages it opened); keep the ones that load, as fetched pages. */
async function verifyLinks(text, results, onToolResult, already, opened = []) {
  const want = [...new Set([...linksIn(text), ...opened.filter(Boolean)])];
  const pages = await readPages(want, { limit: 40 });
  for (const p of pages) {
    const r = { tool: 'WebFetch', input: { url: p.url }, structured: null, text: `${p.title}\n${p.text}`, error: false, checkedByAion: true };
    results.push(r); try { onToolResult?.(r); } catch {}
  }
  return pages;
}

/** A tiny real call, so Settings can show the engine works before the first search. */
export async function test(engine) {
  const t0 = Date.now();
  if (engine === 'claude-code') {
    const { runClaude } = await import('./claude.mjs');
    const r = await runClaude({ purpose: 'Connection test', model: 'claude-sonnet-5-5', prompt: 'Reply with this JSON only: {"ok":true}', cwd: DIR, timeoutMs: 120000, engine: 'claude-code' });
    return { ok: r.data?.ok === true, ms: Date.now() - t0 };
  }
  const r = await complete({ engine, prompt: 'Reply with this JSON only: {"ok":true}', system: 'You reply with JSON only.', cwd: DIR, timeoutMs: 120000 });
  return { ok: /"ok"\s*:\s*true/.test(r.text), ms: Date.now() - t0, model: CFG.models[engine] || null };
}
