# Security and privacy review (October 24–25, 2026)

Single-user app on 127.0.0.1. Findings and status:

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | Links reported by the AI and data-signal fetches could reach this computer or the local network (e.g. `http://127.0.0.1:8765/api/state`), pulling deal data into prompts. | **Fixed:** `lib/pages.mjs isPublic()` and the radar fetcher allow only public http(s) hosts; redirects checked. Tests: `tests/pages.test.mjs`. |
| 2 | High | Links from web pages were escaped but not scheme-checked, so a `javascript:` link in a search result could run in the app. | **Fixed:** `safeUrl()` on every dynamic link (http(s), mailto, tel only). |
| 3 | Medium | No instruction about prompt injection in page or file text. | **Fixed:** both system prompts treat page and file text as data, never instructions. |
| 4 | Info | AI tool permissions | Claude Code: Bash, Edit, Write, NotebookEdit, Task disabled; only web search/fetch or Read for an uploaded PDF where needed. Codex: read-only sandbox. Nothing can send email, post, buy or delete. |
| 5 | Info | Local server | Host header must be localhost/127.0.0.1 (403 otherwise), cross-origin POSTs refused, JSON-only POSTs (415 otherwise), 120 MB upload cap, static files confined to `public/`. Verified with curl. |
| 6 | Info | Keys | `workspace/keys.json`, mode 0600, shown as `…last4`, sent only to the issuing provider. None in source. |
| 7 | Info | Dependencies | `npm audit`: 0 vulnerabilities. |
| 8 | Low | The data-signals User-Agent includes the founder's own email (`lib/search/radar.mjs`). | **Kept by choice** in this personal copy (polite crawler contact). Removed in the partner editions. |
| 9 | Low | Uploaded books stay readable in `workspace/`. | Accepted; it's inside your user folder. Delete a deal folder to remove it for good. |

**What leaves the computer:** prompts to the chosen AI (account names and totals; names masked by default), public web pages during searches, public data (Fed prime rate, BLS wages, NYU Stern margins, USAspending, Internet Archive, Google News).
