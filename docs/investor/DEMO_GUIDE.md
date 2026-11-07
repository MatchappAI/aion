# Five-minute demo

**Setup (before the meeting):** double-click `Start AION.command`. Open a deal that is already analyzed (saved answers make it instant) and a finished search. Settings should show Claude Code "In use". Have the 1-page PDF of the same deal ready as a fallback.

| Time | Show | Say | Evidence on screen |
|---|---|---|---|
| 0:00 | Value Creation start screen | "A seller's reported profit is rarely what a buyer can bank. This reads the books and shows the real number." | — |
| 0:30 | An analyzed deal: Overview waterfall | "Reported → real EBITDA: owner pay, one-offs, a hired manager. Each one-off points to the actual ledger rows." | Click a one-off → the rows open |
| 1:30 | Answer the "biggest unknown" Yes/No | "Change one diligence answer and every number updates. The AI didn't compute any of this; code did." | Waterfall moves |
| 2:00 | Plan tab → Build it on the top move | "Each move is priced from this company's accounts and capped by public peer margins; moves without a benchmark aren't counted." | Basis line, NYU Stern peer, KPIs, prompt |
| 2:45 | AION fit tab | "The thesis check: PASS/WATCH/FAIL with the evidence for each." | Evidence column |
| 3:15 | Search results | "One search: 30 web searches, ~250 pages, ranked against the buy box. Every fact has its link; contacts appear only if found word for word." | Open a card → sources, timing badge |
| 4:15 | Owners to contact / deal pipeline | "Dated seller signals, a stage for each owner conversation, a weekly re-run that flags only new names." | — |
| 4:45 | Export 1-page PDF | "This is what goes to the investment committee." | PDF downloads |

**What to avoid claiming**
- Realized EBITDA gains at any company (none yet; plans are identified, not achieved).
- Time savings as measured outside Victure (6 h / 4 h by hand are estimates).
- "Autonomous": every AI step is bounded, logged and confirmed by a person; nothing sends email or contacts anyone.
- That the partner holdcos use it daily (sent, rolling out).

**Likely questions**
- *"Isn't this a ChatGPT wrapper?"* The AI does four narrow jobs (sort accounts, flag one-offs, estimate inputs, propose moves). Code does all math, ties one-offs to ledger rows, caps moves by peer benchmarks, and rejects facts without retrieved sources. 5,065 automated grounding checks pass on saved outputs.
- *"How do you know the plan numbers are right?"* They're bounded by the books and public peer margins and labeled by how sure they are; the realistic case haircuts them. The proof comes from the monthly check-in after close, which is built in.
- *"What if the AI hallucinates a company or contact?"* Facts must cite a page the system retrieved; contacts must appear verbatim; companies failing a must-have are capped at 40%. The grounding check verifies this on every saved search.
- *"What does it cost to run?"* Your existing AI plan; about a minute per ledger analysis and five minutes per search.
- *"Why would a holdco pay for it?"* At 2 searches and 1 first look a week, about 14.5 analyst hours a week (~$70K/yr at $100/hr, estimate), plus a sized plan on every deal. Validate with the time test in BUSINESS_VALUE_AND_ROI.md.
- *"What's defensible?"* Thesis-specific scoring and plan logic, the grounding rules, and months of live use across firms feeding fixes back.
