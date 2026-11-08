# AION: find, contact and value ecommerce consulting firms to buy (runs on your Mac)

AION is a permanent-capital holding company that buys founder-owned **ecommerce consulting** firms, buyout first (the whole firm, or a majority stake). This app is its working tool: it finds firms **before** they are marketed for sale, ranks the owners, writes personal outreach that you approve one email at a time, and turns a seller's books into real profit, a price and a plan.

**Buy box (`lib/thesis.mjs`):** US, founder- or family-owned, about $500K–$5M yearly profit (EBITDA; first deals $500K–$2M), roughly 5–150 people. Three segments, in order:

1. **Retail placement:** food and consumer-goods brokers, sales agencies and retail-entry consultants who get brands onto shelves.
2. **Marketplace agencies:** firms that run brands on Amazon, Walmart.com, Target Plus, TikTok Shop and other marketplaces.
3. **Ecommerce strategy & analytics:** omnichannel strategy, digital shelf, retail media and sales analytics consultancies.

Not in the buy box: DTC growth agencies (paid social, SEO, store builds), 3PL / operations advisory, recruiters, software companies.

## The two tools

**Search & Outreach (the first tab)**
- **Proprietary only.** Searches read public business records, partner and association directories, each firm's own pages, and news. Business-for-sale marketplaces and broker sites are never used; firms already listed for sale are set aside.
- **One ranked owner list** shared by Search and Outreach. Each firm shows why now (succession, long tenure, a #2 hired …), the offer that fits (full buyout or majority stake; a partnership only when the firm says in its own words that it wants one), and whether AION can reach the owner.
- **Emails: confirmed first, guesses clearly marked.** Addresses are read from the firm's own website, then Hunter.io (only addresses it checked as deliverable count as found) and Apollo / People Data Labs if you add keys. A guessed address is labelled "Guess: check before sending" and is never chosen for you.
- **Outreach.** A personal first email, two follow-ups, a letter, call notes and a discreet note, written only from that firm's facts. Anything not backed by a fact is flagged. **Nothing is sent without your OK:** each send shows a preview, and the server only sends with the one-time code that preview hands out. Replies, opt-outs and bounces are read from Gmail every 10 minutes. An opt-out blocks that address and the firm's domain.

**Value Creation**
Upload → **Real profit** → **Price & returns** → **Questions**. Upload a General Ledger (best), P&L Detail or PDF statements. AION sorts the accounts, adds back the owner's pay and one-off costs, takes off a market salary for whoever runs the firm after closing (the seller or a hire), prices the deal against the price guide, shows ways to raise profit sized only from the books, an uploaded file or half the gap to similar companies (for ecommerce firms: ad spend paid for clients but not billed back, repeat project clients to move to retainers, what the delivery team costs per dollar of fees, and the profit at risk if the largest client left), and lists the questions to ask the seller (platform account ownership, partner status, change-of-control consents, commission tails, pass-through ad spend, client tenure, contractors, non-competes, prepaid retainers). Every number is computed in code from your books and your answers; the AI only sorts, flags and proposes.

## Run

```
cd ~/Desktop/AION/demo
npm install
npm start      # http://localhost:8765
npm test       # unit and route tests (no network, fake Gmail, no AI)
```

Requires Node 22. AI steps use Claude Code (`claude`) first; Codex or an API key can be added in Settings as backups.

Setup for outreach: copy `.env.example` to `.env`, add a Google OAuth desktop client and your sending addresses (`AION_SENDERS`), then connect each inbox under Outreach → Inboxes and settings.

## Private settings (not in this repo)

AION's own price guide (target and ceiling, in years of profit), LOI terms and the wording of each offer live in `private/config.json`, which git ignores. Without it the app uses neutral example values (`private.example.json`). Investor materials are kept in `private/docs/` on the owner's Mac.

## Your data

Searches, owners, outreach, Gmail tokens and deals live in `workspace/` (never committed). Files are saved safely: written to a temporary file, then renamed into place, with the previous copy kept as `.bak`. If a file is damaged, AION reads the backup; it never starts with an empty outreach list or do-not-contact list.

Only the prompts shown in the run log leave this computer, via your chosen AI. Check your NDA allows sending seller data to an AI before using real target data. The AI helper programs run without AION's own keys, without your MCP servers and without your personal Claude Code settings.

## What is real vs. assumed

| | Source |
|---|---|
| Profit and loss, real profit, customer concentration, retention, days to get paid | Computed from your books and your confirmed account sorting |
| Account sorting, add-backs, flags, team estimates | Proposed by AI, confirmed by you before use |
| Market salary for the leader ($225K starting guess), price guide, deal costs (10% default), time saved, price rises | Assumptions: labelled and editable |
| Market reference line for the firm's size | General market knowledge, labelled as not checked against recent deals; it never sets the price |

## Tests

- `npm test`: model, thesis, search, outreach (fake Gmail), safe saving, private settings, and the real server's routes on a throwaway workspace with all network blocked (`tests/helpers/no-network.mjs`).
- Browser suite: always against a **copy** of `workspace/`: `AION_WORKSPACE=<copy> AION_OFFLINE=1 AION_GMAIL_MOCK=1 PORT=8799 node server.mjs`, then `AION_BASE=http://localhost:8799 node tests/ui/run.mjs`. With `AION_OFFLINE=1` the AI and web calls are off, so steps that need a live analysis fail by design.

## Files

- `server.mjs`: local server (127.0.0.1 only), deal state, routes
- `lib/thesis.mjs`: buy box, fit check, diligence questions, price guide (also served to the browser)
- `lib/private.mjs`: loads `private/config.json`
- `lib/model.mjs`: all money math
- `lib/outreach/`: drafts, sends, replies, confirm codes, Gmail
- `lib/search/`: search pipeline, ranking, data signals, network memory
- `lib/fsafe.mjs`: safe saving
- `public/`: the pages
