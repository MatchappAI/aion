# Architecture and maintenance

One Node 22 process (`server.mjs`) serves the page (`public/`) and a JSON API on 127.0.0.1:8765. Data lives in `workspace/`. No database, no accounts, no cloud service of ours.

| Path | Role |
|---|---|
| `server.mjs` | Routes, Value Creation state and jobs, exports, Search and Outreach endpoints |
| `lib/engine.mjs` | AI engines: Claude Code → Codex → Anthropic key → OpenAI key; detection, usage-limit fallback (1 hour), keys in `workspace/keys.json` (0600) |
| `lib/claude.mjs` | One prompt → JSON, logged to the deal's run log; answers cached in `workspace/cache/` |
| `lib/pages.mjs` | Opens web pages (public addresses only, redirects checked); PDF text |
| `lib/search/` | Search pipeline, prompts, scoring (must-have fail caps at 40%), timing signals, data signals (`radar.mjs`), memory, watches, contacts |
| `lib/model.mjs` | All money math (P&L, normalization, levers, deal returns incl. revenue pricing and no-loan deals) |
| `lib/thesis.mjs` | Buy box v4.0: segments, fit check, diligence questions, price guide (also served to the browser) |
| `lib/private.mjs` | Loads the git-ignored `private/config.json` (price guide, LOI terms, offer wording); neutral examples otherwise |
| `lib/fsafe.mjs` | Safe saving for every data file: temp file + rename, `.bak` copy, refuse to start empty on a damaged file |
| `lib/outreach/` | Drafts, sends (one at a time, one-time confirm codes in `confirm.mjs`), replies, opt-outs, Gmail |
| `lib/gl.mjs`, `lib/excel.mjs`, `public/summary.html` | QuickBooks parser, Excel export, 1-page PDF page |
| `public/app.js`, `search.js`, `outreach.js`, `settings.js`, `help.js`, `ui.js` | Screens; `ui.js` = corner messages and one-at-a-time buttons |
| `Start AION.command`, `start-aion.sh` | Launchers |

**AI safety:** Claude Code runs with Bash/Edit/Write/NotebookEdit/Task disabled, no MCP servers and no personal settings; AI helper programs get a minimal environment (none of AION's keys); Codex runs read-only; system prompts treat page and file text as data, not instructions; the AI classifies, flags and proposes, and code computes every number; facts and contacts must come from retrieved pages.

**Environment variables:** `PORT` (default 8765), `AION_WORKSPACE` (tests use a throwaway copy), `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (used if no key saved), `PDL_API_KEY` (optional contact enrichment).

**Commands**
```
npm install
npm start                       # http://localhost:8765
npm test                        # unit + route tests (fake Gmail, no AI, network blocked)
AION_WORKSPACE=/tmp/ws-copy AION_OFFLINE=1 AION_GMAIL_MOCK=1 PORT=8799 node server.mjs &
AION_BASE=http://localhost:8799 node tests/ui/run.mjs     # 73 browser checks (uses saved AI answers)
AION_BASE=http://localhost:8799 node tests/ui/crawl.mjs out.json   # clicks every control; AI/upload calls intercepted
```
Always point browser tests at a copy of `workspace/`, never the real one.

**Adding features safely:** keep numbers in `lib/model.mjs`; new AI output must be JSON and logged; any fetch of a URL from the AI or the web goes through `readPage`/`isPublic`; links from external data use `safeUrl()`; buttons that call the server use `busy()` and report failures with `toast()`. Fixes that apply to the partner editions (`~/Desktop/AION/partner-editions/app`) should go there too.
