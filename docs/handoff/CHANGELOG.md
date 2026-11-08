# Changelog

## November 6, 2026 (buy box v4.0: ecommerce consulting)
- Thesis v4.0 in `lib/thesis.mjs`: US ecommerce consulting firms, $500K–$5M EBITDA, three segments in priority order (retail placement, marketplace agencies, ecommerce strategy & analytics); DTC growth agencies, 3PL / operations advisory, recruiters and software companies excluded. v3.0 subsectors kept as `legacy`.
- `segmentOf()` classifies each firm from its industry label first (ignores "not a …" phrases); used by Search, the owner list, Outreach and the docs.
- Buy box gate adds a US check (location or a country domain).
- One owner list (`ownerList()` in `server.mjs`): Search "Owners to contact" and Outreach "Next owners to contact" share it; same # on both; outreach status and Write outreach on every row; segment filters. "Who to call this week" retired.
- Duplicate clues count once; strongest signs show first; HTML codes decoded.
- Brand demand radar replaces the operations-hiring radar.
- Search modes: Find firms to buy (default), Find brands, Find people. Documents, Help, outreach pitches and the AI's industry classifier speak to ecommerce consulting.
- Search results banner: a clear miss is reported as a miss; a fact no firm publishes (fees, cash collection) is listed as a question for the first call, not a shortfall.
- Off-thesis searches (staffing, HVAC, manufacturing clients, candidates) archived to `workspace/searches/archive/`, weekly re-runs stopped. New searches: ecommerce strategy & analytics; retail placement brokers and agencies.

## October 25, 2026 (investor review pass)
- `tests/eval/grounding.mjs`: automated check of AI outputs (add-backs tied to ledger rows, source links on every fact, contact, criterion and timing clue, 40% cap on failed must-haves). 5,065 checks pass on the workspace; planted errors are caught.
- Run-time copy now matches the logs (about a minute for a ledger, a few minutes for a PDF).
- Investor materials (overview, ROI model, audits): moved out of the public repo to the owner's private folder.

## October 24–25, 2026
Backups before changes: `archive/demo-before-qa-2026-10-24.tgz`, `archive/demo-before-engine-port-2026-10-24.tgz`.

**Security:** public-address guard on AI-reported links and data signals; `safeUrl()` for web links; prompt-injection line in both system prompts.

**AI:** any-AI engine (Claude Code first; Codex, Anthropic or OpenAI key as backups; automatic fallback at usage limits) and a **Settings** tab; progress and errors name the AI in use.

**Fixes:** 1-page PDF now lists industry moves so it adds up to the stated growth; PDF/CIM extraction gets peer benchmarks, keeps "Total revenues" lines, reads the business type; loss-making companies can be priced on revenue; no crash on deals with no loan (deal tiles, thesis check, run log); failed search steps are logged; Search "Try again" and "Watch weekly" show errors; Search, Excel and PDF buttons can't double-submit; errors also appear as a corner message; Escape closes the search detail drawer; "Your easiest win" wording; rows view reports load errors; clear message when the port is in use.

**New:** Help tab; `Start AION.command` double-click launcher with error alerts; `tests/ui/crawl.mjs` (every control), `tests/pages.test.mjs`; this `docs/handoff` folder and `START_HERE.md`.
