# Changelog

## November 8, 2026 (second pass)
- Sends: one send per preview (a second preview's code stops working once the email goes); only listed email and document kinds; invites, replies and documents re-check opt-outs, closed outreach and today's limit; all sends run one at a time; a sent email is recorded even if Gmail's follow-up look-up fails.
- Replies: "not interested now, maybe in a few years" is a not-now; "don't email me" and "please stop" are opt-outs; out-of-office answers don't stop follow-ups; bounces come only from the mail system.
- Searches: one background job per search at a time; Update signals keeps Save/Reject decisions made meanwhile.
- Maths: pass-through ad spend left out of margins, growth, client shares and revenue prices; working capital only from real balances; no AI set-up cost while AI isn't counted; add-backs never double count; under 12 months of books is not priced; part-year payroll files and retainer lines are not counted as savings.
- New ecommerce levers (Value Creation › Plan): pass-through shortfall (counted, from the books), repeat project clients to move to retainers, delivery cost per dollar of fees, largest-client profit at risk.
- Wording: search criteria, AI prompts, toolkit, tool fit and the 1-page PDF are ecommerce throughout; candidate search closed; step numbers match the four steps.
- Screens: each Search & Outreach list loads on its own and says if it couldn't; failed actions show a message; keyboard access for every clickable item; wide tables scroll on a phone.
- Code: search and Value Creation routes moved to `routes/` (route tests first); unused code removed.

## November 8, 2026
- Replies are read from the owner's new words only: a "yes" that quotes AION's "reply no thanks" footer is no longer an opt-out. Opt-outs also block the firm's domain.
- Real profit always takes off a market salary for whoever runs the firm after closing (a seller who stays is paid too).
- Every send needs a one-time confirm code from its preview; one send at a time; replies and documents can't go twice; the same firm is never drafted twice across searches; guessed addresses are labelled and never chosen for you.
- Safe saving with backups for every data file; background scans keep decisions made meanwhile; background errors are shown.
- Price guide, LOI terms and offer wording moved to the private settings file; public repo history scrubbed.
- Value Creation: four steps and four tabs; ecommerce wording, pass-through ad spend, new seller questions, deal form for tax, 10% deal costs, harsher bad case, market reference line, revenue prices held to the price cap.
- Search & Outreach is the first tab. Removed: Documents, the federal contract radar, people search.

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
