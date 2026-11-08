# Test results

## November 8, 2026 (second pass)

Every run used fake Gmail (`AION_GMAIL_MOCK=1`), no AI or web (`AION_OFFLINE=1`) and blocked every request that would leave this computer (`tests/helpers/no-network.mjs`). Browser runs were headless Chrome against servers on **copies** of `workspace/` (Gmail tokens blanked in each copy), on ports 8811–8813, never the real server on 8765. The real workspace was compared with a snapshot taken at the start: unchanged apart from the running AION refreshing its Gmail sign-in.

| Suite | Command | Result |
|---|---|---|
| Unit and route tests | `npm test` | **168 passed, 0 failed**; also 168/168 with `AION_NO_PRIVATE=1` (the public defaults CI uses) |
| Browser suite | `AION_UI_EXISTING=1 AION_BASE=… AION_WORKSPACE=<copy> node tests/ui/run.mjs` | **74 passed, 1 failed**: the failure is "Value Creation analysis runs", which needs a live AI call (off by rule); screens were checked on a saved deal |
| Flows | `AION_BASE=… AION_EMPTY_BASE=… node tests/ui/flows.mjs` | **97 passed, 0 failed**: confirm-and-send with the browser's OK dialog (No sends nothing, OK sends once), second send refused, interested reply, Write reply with AI off, NDA written and sent once with its PDF, the same NDA refused again, open times, invite booked once, opt-out closes it and blocks more sends, a list that fails to load (Try again), a failed action shows a message, all 4 saved deals × 4 tabs (no undefined/NaN, no staffing words on ecommerce deals, phone width), 1-page summary and Excel for each, Help/Settings/Search & Outreach, keyboard access, empty first run |
| Phone width of the detailed steps and an outreach item | `node tests/ui/phone-steps.mjs` | **11 passed** (after fixes: 5 had failed) |
| Every control on every screen | `node tests/ui/crawl.mjs` (in parts, `CRAWL_ONLY`) | about 370 controls: **0 page errors, 0 failures hidden from the person**. After the 1-page PDF button the crawler's own connection stops answering; the button itself was checked directly (page stays responsive, file builds) and Replay by `tests/ui/replay-probe.mjs` |
| 1-page PDF | `POST /api/pdf` | one page, built in under a second, no Chrome left running |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities |
| Network attempts | server logs | 0 |

**Checked by reading the code only:** live Gmail sending, reply sync against real Gmail, Hunter.io, live web searches, the AI steps (classify, add-backs, plan, outside check, drafts, LOI) and the Gmail attachment import, all off by rule. Native file pickers and drag-and-drop (the upload routes they call are tested).

## November 8, 2026

All runs used fake Gmail (`AION_GMAIL_MOCK=1`) and no AI or web (`AION_OFFLINE=1`); the browser suite ran against a **copy** of `workspace/` (Gmail tokens blanked in the copy) with every request off this computer blocked (`tests/helpers/no-network.mjs`). The real workspace files were compared before and after: unchanged.

| Suite | Command | Result |
|---|---|---|
| Unit and route tests (model, thesis, outreach, safe saving, private settings, the real server's routes) | `npm test` | **150 passed, 0 failed**; also 150/150 with `AION_NO_PRIVATE=1` (the public defaults) |
| End-to-end browser suite (headless Chrome) | `AION_UI_EXISTING=1 AION_BASE=http://localhost:8799 node tests/ui/run.mjs` | **74 passed, 1 failed**: the failure is "Value Creation analysis runs", which needs a live AI call (off by rule); the screens were then checked on a deal already analyzed in the copy |
| Network attempts during the browser suite | server log | 0 |

**Not tested:** a live search, analysis, Gmail send or Claude Code / Codex run (all off by rule for this pass). The new Claude Code flags (`--strict-mcp-config`, `--setting-sources project`) and Codex `--ignore-user-config` are confirmed in each tool's `--help`, not in a live run.

## October 25, 2026

All browser tests ran against a **copy** of `workspace/` (10 deals, 28 searches, 2 documents), never the real folder.

| Suite | Command | Result |
|---|---|---|
| Unit tests (model, thesis, periods, scoring, timing, radar, link safety) | `npm test` | **64 passed, 0 failed** |
| End-to-end browser suite (upload a test ledger, analyze with saved answers, every tab, search, documents, phone widths) | `node tests/ui/run.mjs` | **73 passed, 0 failed** (several runs; one timing-dependent phone-width check was fixed by making corner messages wrap) |
| Every control on every screen | `node tests/ui/crawl.mjs` | **622 controls: 0 page errors, 0 failures hidden from the person** |
| Dependencies | `npm audit` | 0 vulnerabilities |
| Live AI check | Settings → Test on Claude Code | `{"ok":true,"ms":2491}` |
| Engine detection | `/api/engine` | Claude Code ready, Codex ready, keys none |
| Launcher | `Start AION.command` (browser opening suppressed for the test) | Starts the server; a second run reuses it |
| Local server guards | curl with a foreign Host, a cross-site POST, `../` paths | 403 / 403 / 404 |
| Link safety | unit tests on localhost, private IPs, metadata IP, `file:`, `javascript:` | all refused |
| Screens inspected | Settings, Help (1366 px) | as intended |

**Comparison:** the same browser suite on the pre-change backup also passed 73/73, so no regressions were introduced.

**Not tested:** Anthropic/OpenAI key engines live (no keys); a brand-new search or analysis with fresh AI calls in this pass (code paths unchanged and verified in earlier sessions; they would spend plan usage); Codex runs (plan out of usage until November 23, 2026); real drag-and-drop and the native file picker (the upload API they call was tested).
