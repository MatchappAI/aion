# AION — acquisition and value-creation system (local)

AION finds founder-owned firms **before** they are marketed for sale, reads every public signal on whether the owner wants to **sell a majority** or **grow with a partner**, ranks the owners, and runs the whole conversation from the first personal email to the LOI, from your own Gmail accounts, with your OK on every send.

**Buy box (thesis v4.0, `lib/thesis.mjs`):** US, founder- or family-owned **ecommerce consulting** firms with about $500K–$5M EBITDA (first deals $500K–$2M), roughly 5–150 people. Three segments, in priority order:

1. **Retail placement**: food and CPG brokers, sales agencies and retail-entry consultants who get brands onto shelves.
2. **Marketplace agencies**: firms that run brands on Amazon, Walmart.com, Target Plus, TikTok Shop and other marketplaces.
3. **Ecommerce strategy & analytics**: omnichannel strategy, digital shelf, retail media and sales analytics consultancies.

Excluded: DTC growth agencies (paid social, SEO, store builds), 3PL / operations advisory, recruiters, software companies. One classifier (`segmentOf` in `lib/thesis.mjs`) decides the segment, so Search, the owner list, Outreach and the docs agree.

## Proprietary sourcing → owner ranking → outreach

- **Proprietary only.** Searches use public business records, association and partner directories, the firm's own about/team pages, succession and second-in-command signals, and news. Business-for-sale marketplaces and broker sites (BizBuySell, BizQuest, DealStream, Axial, Acquire.com, LoopNet and others, `MARKETPLACE` in `lib/search/timing.mjs`) are never a query or a source; their results are dropped. A firm already listed for sale is set aside, never ranked, and AION will not write to it.
- **Deal intent.** Sale signals (succession, long career, exit planning, partner left, stale site, second-in-command hire, lease ending, licence lapse …) and partnership signals (partner or referral program, growth hiring, new service, talks about AI, capacity strain, alliances, subcontracting, open to investors). Reasons to wait (a successor named, new partners, fresh money) pull it down.
- **One owner list** (`lib/search/rank.mjs` + `ownerList()` in `server.mjs`): the Search home ("Owners to contact") and Outreach ("Next owners to contact") read the same ranked list, so a firm has the same # on both screens and each row shows its outreach status. Rank 0–100 = intent (up to 50) + how many *different kinds* of signal (10) + fit (25) + can we reach the owner (15) + 5 when confirmed in the buy box + segment (retail placement 5, marketplace 3, strategy 2) − reasons to wait. Each firm gets an offer: *buy a majority*, *growth partnership*, or *their choice*. Filters: segment, not contacted, high intent, sale, partnership.
- **Buy box gate** (`lib/search/buybox.mjs`): outside the US (location or a country domain), not independent, far too big or too small → set aside with the reason; a missing fact shows as "Check".
- **Emails: confirmed first, guesses clearly marked.** Read from the firm's own website (contact, about and team pages, the firm's own domain only), then Hunter.io (only addresses it checked as deliverable count as found) and Apollo / People Data Labs if you add keys. When nothing is confirmed, AION may suggest an address built from the firm's email format. It is labelled "Guess: check before sending" and is never chosen for you.
- **Outreach** (Outreach tab): personal email, two follow-ups, letter, call notes and contact-form text from that firm's signals only; unsupported numbers and names are flagged; you edit and approve every send from either connected Gmail account; replies, opt-outs and bounces are read from Gmail every 10 minutes, *including later replies in the same thread* (an owner picking one of the offered call times is matched to it); real open times from both calendars; Meet invite; NDA, books request and LOI as PDFs in the thread.

Setup: copy `.env.example` to `.env`, add a Google OAuth desktop client and your sending addresses (`AION_SENDERS`), `npm start`, then Outreach → Senders → Connect. Your data (searches, owners, outreach, Gmail tokens) lives in `workspace/`, which is never committed.

**Thesis v4.0:** long-term owners of ecommerce consulting firms (above). The v3.0 subsectors (engineering, supply chain, compliance, testing, implementation, talent) stay in the code as `legacy: true` so older deals, searches and documents keep their meaning; they are never a default and never count as in the buy box. The single source of truth is `lib/thesis.mjs`: thesis constants, EBITDA ranges, subsectors, revenue models, universal and subsector criteria, the avoid list, the AION toolkit (with honest EXISTS NOW / PARTIALLY EXISTS / NEEDS BUILDING status), the Deal Thesis Check, tool fit, the five-part value plan and the 100-day plan. The server also serves it to the browser at `/thesis.mjs`.

Backward compatibility: deals store `industry.kind` = `staffing` | `general` as before. `staffing` maps to Talent Services with the original search-firm wording; `general` is matched to a subsector by name (or stays outside the core subsectors). New fields (`industry.subsector`, `revenueModels`, `delivery`, `S.diligence`) are additive. Saved searches keep their criteria, including the old `paid_upfront` must-have; new target searches use `cash_conversion_quality` (never a must-have; Net 30 is fine) and `cash_health` for temp staffing.

## AION fit tab

Per deal: the Deal Thesis Check (PASS / WATCH / FAIL / NEEDS DATA, every row with its evidence and guide; universal plus subsector criteria; avoid-list hits), why the firm could be worth more under AION, the AION tool fit (HIGH / MEDIUM / LOW / NEEDS DATA from recorded diligence answers and the books, with the exact workflow to run), dated diligence answers, and the toolkit. The Plan tab adds the five-part value table (base + commercial + operational + AI productivity + M&A; AI and M&A never counted until measured) and a company-specific 100-day plan (understand → commercial/operating → 1–3 AI pilots).


Upload a target's general ledger → confirm account mapping → normalized EBITDA → operating inputs → levers & ROI → AI deployment plan with exact Claude Code prompts.

## Run

```
cd ~/Desktop/AION/demo
npm start            # http://localhost:8765
npm test             # unit tests (91)
AION_BASE=http://localhost:8799 node tests/ui/run.mjs   # UI tests against a throwaway copy (AION_WORKSPACE=<copy> PORT=8799 node server.mjs)
```

Requires Node 22 and Claude Code (`claude`) logged in. AI steps run through `claude -p` using your Claude Code login — no API key.

## What to upload

- **Best:** QuickBooks → Reports → **General Ledger**, 24–36 months, all accounts → Export → Excel (.xlsx). Balance-sheet accounts enable receivables/DSO.
- **Also:** QuickBooks **Profit and Loss Detail** export, or **PDF financial statements** (AI extraction with page citations; statement-level only — no customer or collections analysis).

## What is real vs. assumed

| | Source |
|---|---|
| P&L, normalized EBITDA, customer concentration, retention, invoices, DSO | Computed in code from your GL and your confirmed mapping |
| Account categories, add-back candidates, vendor opportunities, flags, operating inputs | Proposed by AI, **confirmed by you** before use; add-back and vendor amounts are computed from the GL rows the AI points to |
| Replacement-leader comp ($225K default), % time saved, allocation of freed hours, pricing uplift, costs | **Assumptions** — labeled and editable |
| Deployment plan and prompts | Written by AI from confirmed numbers; it cannot change them |

Rules built into the model: freed hours are capacity, not cash; each hour is allocated once (more searches / avoided spend / unallocated, capped at 100%); cash savings count only up to spend you enter as actually removed; net EBITDA is after software and ongoing costs; implementation is a Year-1 cost.

## Data handling

- Files and results stay in `demo/workspace/` (gitignored). **Start over** moves it to `workspace-archive-<timestamp>/`; nothing is deleted.
- Only the prompts shown in **Run log** leave the machine, via Claude Code. They contain account names and totals, payee names with totals (earnings review and operating inputs), and sample memos — never the full GL.
- Check your NDA allows sending seller data to Claude before using real target data.
- No emails, CRM writes, or external system changes are made.

## Models

`claude-sonnet-5-5` for mapping, PDF extraction and operating inputs; `claude-opus-5-5` for the earnings review and the deployment plan. Change in `lib/claude.mjs`.

## Not yet verified

The GL parser has not been run on a real QuickBooks export (no sample file by design). The first real upload is the test: check the **Parsed** summary (row count, date range, columns detected) against the source file before continuing.

## Proprietary Search

Candidate Sourcing, Client Acquisition and Acquisition Targets on one engine (`lib/search/*`). Each search writes 20–40 web searches, keeps only names found in a real result, checks the best in depth and scores them against the criteria.

- **Must-haves** (`lib/search/score.mjs`): a clear mismatch on size, niche, or likely to sell / buy / hire / be approached caps the score at 40%. Missing evidence is not a mismatch. Cash conversion and AION-edge criteria are weighed, never must-haves. Client searches take a kind of firm: talent (recruiting, the default) or any other subsector, whose buyers and triggers come from `lib/thesis.mjs`.
- **Deal pipeline**: targets move through Contacted → Meeting held → NDA signed → Books received → Offer (LOI) sent → Closed, plus Passed. Stages are set by you, dated and stored in `workspace/searches/network.json`; nothing is inferred.
- **Radar** (`lib/search/radar.mjs`): after web search finds the names, AION reads data sources directly for every checked result: domain registration records (how long a firm has been online), the Internet Archive (a website going quiet; the team page then vs now), Google News headlines (expansions, retirements, leadership changes, takeovers, layoffs), company job boards (finds the system behind the careers page: Workday, Greenhouse, Lever, Ashby; AION keeps its own dated record of every senior role, so long-open and reposted roles are proven), federal contract awards from USAspending.gov (clients whose awards jumped) and, for search firms, the clients they name on their own placement and case-study pages (their client book, before the first call). Plain keyword rules turn headlines into events; the company must be the subject, questions and award lists are ignored. Events feed the timing badge only, never the fit score. Stored in `workspace/searches/radar.json`. "Refresh data signals" re-reads them for an existing search.
- **Brand demand radar** (`brandScan` in `lib/search/radar.mjs`): recent headlines about US consumer brands that raised money, won a retailer, hired a sales or ecommerce lead, opened a marketplace store or lost a distributor: the clients AION's firms serve. Every row links its headline; "look into it" starts a brand search.
- **Removing a search** moves it to `workspace/searches/archive/` and drops what only it found from the network.

## What it would take (Plan tab)

A hypothetical panel below the counted plan: it keeps the queue going until profit reaches a target multiple you choose (the rest of each benchmark gap, yearly growth, add-on acquisitions), with every input adjustable. It is never counted in the cases, returns or the 1-page summary.

## Tests

`npm test` runs the model, timing, scoring and thesis unit tests. `tests/integration/thesis-integration.mjs` checks old deals, old searches, subsector fixtures (from `tests/fixtures/make-fixture-deals.mjs`, test-only) and exports against a server on a throwaway workspace: `AION_WORKSPACE=<copy> PORT=8799 node server.mjs`, then `AION_BASE=http://localhost:8799 node tests/integration/thesis-integration.mjs`. The browser suite takes the same `AION_BASE`. With the app running, `node tests/ui/run.mjs` drives the whole product in headless Chrome (55+ checks). The browser test sets and clears a deal stage, so back up `workspace/searches/network.json` first and restore it afterwards if you want no test entries in the stage history.

## Files

- `server.mjs` — local server, workspace state, AI jobs
- `lib/gl.mjs` — QuickBooks GL / P&L Detail parser
- `lib/thesis.mjs` — thesis v3.0 source of truth (see above)
- `lib/model.mjs` — deterministic finance model (all arithmetic)
- `lib/prompts.mjs` — every prompt sent to Claude
- `lib/claude.mjs` — Claude Code runner + run log
- `public/` — UI
- `archive/staffing-demo-v1/` — the earlier temp-staffing demo, kept for reference
