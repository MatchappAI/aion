# AION: executive product overview

**What it is.** A local software system a holding company uses to (1) find founder-owned firms to buy before brokers list them, and (2) turn a seller's books into the profit a new owner can count on, a buy-box check, and a sized improvement plan. Built by Mohil Gupta for his own acquisition search; also shipped as tuned copies to two holdcos (Long Holdco, Curious) and a related tool at one operating firm (Victure Group).

**Who it serves.** Searchers, independent sponsors and holdco deal teams buying lower-middle-market services businesses ($0.5–10M EBITDA), and the owner-operators who run them after close.

**The problem.** Sourcing off-market sellers is slow (hours of manual web research per niche) and a seller's reported profit is rarely what a buyer can bank: owner pay, one-offs and missing management cost hide in the books. First looks at deals take an analyst half a day each.

**Main workflow.**
1. *Search:* describe a niche → 20–40 web searches → companies extracted, de-duplicated and checked against the buy box → ranked with a source link for every fact, verified public contacts and dated seller signals (succession, second-in-command hire, stale website, blind listing).
2. *Value Creation:* upload a QuickBooks ledger or PDF statements → real EBITDA (owner pay, one-offs tied to ledger rows, hired-manager cost) → buy-box check with evidence → ranked plan priced from the company's own accounts and capped by public peer margins → 100-day plan, deal returns, 1-page PDF and Excel.
3. *After close:* monthly books compared with the plan.

**Why it matters.** It compresses days of analyst work into minutes while keeping every number traceable, so a buyer can screen more opportunities and walk into owner conversations with evidence.

**What is different.**
- The AI never does the math: it sorts accounts, flags items and proposes moves; deterministic code computes every number from the books.
- Every search fact, contact, criterion and timing clue must carry a link to a page the system actually retrieved; contacts must appear word for word.
- A firm-specific buy box is built in, and must-have failures cap a company at 40%.
- Runs locally on the buyer's existing AI subscription (Claude Code, Codex, or an API key) with automatic fallback.

**Status (October 25, 2026).** Working and tested: 64 unit tests, 73 end-to-end browser checks, every one of 622 on-screen controls exercised, 5,065 automated grounding checks on real saved outputs, all passing. Live at the founder's desk; partner copies sent to two holdcos and rolling out; Victure's related tool live since Oct 19 with one owner-confirmed week of analyst time saved.

**Known limitations.** No customer has yet reported realized EBITDA gains from a plan; time savings beyond Victure are estimates; API-key engines untested live; single-user local app; PDF statements give totals only.
