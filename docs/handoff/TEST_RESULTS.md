# Test results (October 25, 2026)

All browser tests ran against a **copy** of `workspace/` (10 deals, 28 searches, 2 documents), never the real folder.

| Suite | Command | Result |
|---|---|---|
| Unit tests (model, thesis, periods, scoring, timing, radar, link safety) | `npm test` | **64 passed, 0 failed** |
| End-to-end browser suite (upload a test ledger, analyze with saved answers, every tab, search, documents, phone widths) | `node tests/ui/run.mjs` | **73 passed, 0 failed** (several runs; one timing-dependent phone-width check was fixed by making corner messages wrap) |
| Every control on every screen | `node tests/ui/crawl.mjs` | **622 controls: 0 page errors, 0 failures hidden from the person** (see BUTTON_AND_INTERACTION_AUDIT.md) |
| Dependencies | `npm audit` | 0 vulnerabilities |
| Live AI check | Settings → Test on Claude Code | `{"ok":true,"ms":2491}` |
| Engine detection | `/api/engine` | Claude Code ready, Codex ready, keys none |
| Launcher | `Start AION.command` (browser opening suppressed for the test) | Starts the server; a second run reuses it |
| Local server guards | curl with a foreign Host, a cross-site POST, `../` paths | 403 / 403 / 404 |
| Link safety | unit tests on localhost, private IPs, metadata IP, `file:`, `javascript:` | all refused |
| Screens inspected | Settings, Help (1366 px) | as intended |

**Comparison:** the same browser suite on the pre-change backup also passed 73/73, so no regressions were introduced.

**Not tested:** Anthropic/OpenAI key engines live (no keys); a brand-new search or analysis with fresh AI calls in this pass (code paths unchanged and verified in earlier sessions; they would spend plan usage); Codex runs (plan out of usage until November 23, 2026); real drag-and-drop and the native file picker (the upload API they call was tested).
