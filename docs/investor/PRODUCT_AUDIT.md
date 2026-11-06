# Product audit (October 24–25, 2026)

| # | Problem found | Severity | Business impact | Technical impact | Fix | Test |
|---|---|---|---|---|---|---|
| 1 | AI-reported links and data signals could reach localhost / private network | P0 | Deal data could leak into prompts | SSRF | Public-address guard, redirects checked | `tests/pages.test.mjs` |
| 2 | `javascript:` links from web pages clickable | P0 | Script in the app | XSS via link | `safeUrl()` on all dynamic links | crawl + code review |
| 3 | No prompt-injection guard | P1 | Manipulated outputs | — | System prompts treat page/file text as data | review |
| 4 | 1-page PDF omitted industry moves; total didn't add up | P1 | IC document contradicted the screen | Wrong output | Summary lists every counted move | browser check (fails without fix) |
| 5 | No-loan deals crashed deal tiles and thesis check | P1 | Demo crash on all-cash deals | Null deref | Guards; "No loan" shown | unit + browser |
| 6 | PDF/CIM: no peer benchmark, "Total revenues" dropped | P1 | Plan values $0 or revenue missing | Wrong output | Peers from PDF, total-line rule + safety net | real 10-K runs (partner) |
| 7 | Single AI dependency; usage limits stopped work | P1 | Searches die mid-run | — | Engine layer with fallback; Settings tab | live engine test |
| 8 | Silent failures (search retry/watch, rows view), double submits | P1 | Lost work, duplicate searches | — | Error messages, one-at-a-time buttons | crawl: 0 hidden failures |
| 9 | "Under a minute" claimed for all uploads | P2 | Credibility in live demos (PDFs take minutes) | — | Copy qualified by file type, matches logs | log review |
| 10 | No way to check AI outputs at scale | P2 | Trust | — | `tests/eval/grounding.mjs` (13 checks) | 5,065 pass; catches planted errors |
| 11 | No ROI model with stated assumptions | P2 | Investor credibility | — | `AION_ROI_model.xlsx`, ROI doc | formulas checked |
| 12 | Launch needed a terminal | P2 | Adoption | — | `Start AION.command` with error alerts | launcher test |
| 13 | No in-app help | P2 | Adoption | — | Help tab | browser |

**Remaining:** no customer-validated ROI; API-key engines untested live; unbuilt "tools we could build next" lists remain in the Plan tab and Search page (labelled "not built yet"); single-user local app; PDF gives totals only.
