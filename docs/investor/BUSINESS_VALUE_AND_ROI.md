# Business value and ROI

Editable model: `AION_ROI_model.xlsx` (yellow cells are inputs; every input is labeled Measured or Estimate).

## Current workflow (by hand)
| Task | Who | Typical time | Status |
|---|---|---|---|
| Research one niche for off-market targets (20–40 searches, ~250 pages, vet 10 companies with sources) | Analyst / searcher | ~6 hours | Estimate |
| First look at a deal (normalize EBITDA, check buy box, sketch plan) | Analyst | ~4 hours | Estimate |
| Value-creation plan sized from the books | Operating partner / consultant | days | Estimate |

## With AION
| Task | System time | Person time | Status |
|---|---|---|---|
| One search | ~5 minutes (327 s; ~300 s) | ~25 min to review | Run time **measured**; review time estimate |
| First look from a ledger | 30–42 s (fresh AI calls) | ~25 min to review | Run time **measured** |
| First look from a PDF | a few minutes | ~25 min | Estimate |

## Formulas
```
Hours saved per week = searches × (manual − AION person time) + first looks × (manual − AION person time)
Hours saved per year = hours per week × weeks used
Labor value          = hours per year × analyst cost
Net value            = labor value − AI cost
EBITDA gained        = plan identified × share realized
Value effect         = EBITDA gained × multiple
```

## Illustrative scenarios (estimates, not results)
| | Light use | Base | Heavy use |
|---|---|---|---|
| Searches / first looks per week | 1 / 1 | 2 / 1 | 4 / 2 |
| Hours saved per week | 9.0 | 14.5 | 29.0 |
| Labor value per year at $100/hr, 48 weeks | $43K | $70K | $139K |
| Net of a $2.4K/yr AI plan | $41K | $67K | $137K |

Labor value is **capacity**, not cash: it becomes profit only if hours are cut or redeployed to revenue work (as at Victure, where freed hours go to outreach).

**Value creation (one company, illustrative).** Value Line 10-K through AION: $4.03M real EBITDA, plan +$1.09M identified (measured tool output). At 50% realized (estimate): +$545K EBITDA a year (+13.5%), ≈ $3.3M of value at 6× (only relevant if valued or sold). Recurring if the changes stick; one-time items (cash released from collections) are shown separately in the app.

## Costs
- Implementation: local install, under an hour; no integration needed (reads QuickBooks exports and PDFs).
- Ongoing: the buyer's own AI plan (or API usage billed per run); no AION hosting cost.

## How to validate with a real customer
1. **Time test:** run three niches by hand and with AION; log person-hours for each (protocol: `TIME_TEST_PROTOCOL.md` in the deck folder). Replace the 6 h / 4 h estimates.
2. **Quality test:** for each AION search, have the analyst mark which top-10 results are real fits and which they had not found by hand.
3. **Value test:** for one owned company, pick the top two plan moves, set the KPI baselines from the books, and use "After you buy" monthly to compare against the plan target for 90 days.
4. Report only what those tests show; keep everything else labeled Estimate.
