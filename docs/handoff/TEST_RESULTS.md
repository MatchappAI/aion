# Test results

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
