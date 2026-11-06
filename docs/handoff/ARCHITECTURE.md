# Architecture and maintenance

One Node 22 process (`server.mjs`) serves the page (`public/`) and a JSON API on 127.0.0.1:8765. Data lives in `workspace/`. No database, no accounts, no cloud service of ours.

| Path | Role |
|---|---|
| `server.mjs` | Routes, Value Creation state and jobs, exports, Documents and Search endpoints |
| `lib/engine.mjs` | AI engines: Claude Code → Codex → Anthropic key → OpenAI key; detection, usage-limit fallback (1 hour), keys in `workspace/keys.json` (0600) |
| `lib/claude.mjs` | One prompt → JSON, logged to the deal's run log; answers cached in `workspace/cache/` |
| `lib/pages.mjs` | Opens web pages (public addresses only, redirects checked); PDF text |
| `lib/search/` | Search pipeline, prompts, scoring (must-have fail caps at 40%), timing signals, data signals (`radar.mjs`), memory, watches, contacts |
| `lib/model.mjs` | All money math (P&L, normalization, levers, deal returns incl. revenue pricing and no-loan deals) |
| `lib/thesis.mjs` | Thesis v3.0: criteria, subsectors, thesis check, plan buckets, 100 days (also served to the browser) |
| `lib/gl.mjs`, `lib/excel.mjs`, `public/summary.html` | QuickBooks parser, Excel export, 1-page PDF page |
| `lib/docs/` | RFP and candidate write-up drafting |
| `public/app.js`, `search.js`, `docs.js`, `settings.js`, `help.js`, `ui.js` | Screens; `ui.js` = corner messages and one-at-a-time buttons |
| `Start AION.command`, `start-aion.sh` | Launchers |

**AI safety:** Claude Code runs with Bash/Edit/Write/NotebookEdit/Task disabled; Codex runs read-only; system prompts treat page and file text as data, not instructions; the AI classifies, flags and proposes, and code computes every number; facts and contacts must come from retrieved pages.

**Environment variables:** `PORT` (default 8765), `AION_WORKSPACE` (tests use a throwaway copy), `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (used if no key saved), `PDL_API_KEY` (optional contact enrichment).

**Commands**
```
npm install
npm start                       # http://localhost:8765
npm test                        # 64 unit tests
AION_WORKSPACE=/tmp/ws-copy PORT=8799 node server.mjs &
AION_BASE=http://localhost:8799 node tests/ui/run.mjs     # 73 browser checks (uses saved AI answers)
AION_BASE=http://localhost:8799 node tests/ui/crawl.mjs out.json   # clicks every control; AI/upload calls intercepted
```
Always point browser tests at a copy of `workspace/`, never the real one.

**Adding features safely:** keep numbers in `lib/model.mjs`; new AI output must be JSON and logged; any fetch of a URL from the AI or the web goes through `readPage`/`isPublic`; links from external data use `safeUrl()`; buttons that call the server use `busy()` and report failures with `toast()`. Fixes that apply to the partner editions (`~/Desktop/AION/partner-editions/app`) should go there too.
