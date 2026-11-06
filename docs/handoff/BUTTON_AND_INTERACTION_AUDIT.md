# Button and interaction audit

Every visible control on every screen was found and exercised automatically by `tests/ui/crawl.mjs` in headless Chrome against throwaway copies of real test workspaces (a copy of your own workspace folder). Repeated controls (the same button on every card) were tried twice per screen. Anything that would call an AI, start a search, upload, archive or restart was intercepted and answered with a fake error, so for those the check is that **the error is shown to the person**. Confirm and prompt dialogs were dismissed (the "Cancel" path).

Result key: **changed the screen** (navigated, opened, filtered, filled), **saved to the app** (called the app and kept the result), **asked for confirmation** (destructive action guarded), **blocked action, error shown** (AI/upload path; the failure message appeared), **external link** (opens in the browser), **no visible effect** (each one explained).

## Local AION (copy of your workspace: 10 deals, 28 searches, 2 documents): 622 controls

- changed the screen: 347
- no visible effect: 48
- blocked action, error shown: 29
- saved to the app: 129
- external link: 52
- asked for confirmation: 17
- **page errors: 0 · failures not shown to the person: 0**


### Settings
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | no visible effect | Expected: the tab already open |
| Help | button | changed the screen |  |
| Test | button | blocked action, error shown | /api/engine/test |
| Test | button | blocked action, error shown | /api/engine/test |
| Use this | button | saved to the app | /api/engine/choose |
| Save key | button | changed the screen |  |
| Save key | button | changed the screen |  |

### Help
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | no visible effect | Expected: the tab already open |
| Open Value Creation | button | changed the screen |  |
| Open Proprietary Search | button | changed the screen |  |
| Open Documents | button | changed the screen |  |
| Open Settings | button | changed the screen |  |
| A step says no AI is ready | summary | changed the screen |  |
| “Usage limit” or “rate limit” | summary | changed the screen |  |
| An analysis or search stopped part way | summary | changed the screen |  |
| A search shows “Partly complete” | summary | changed the screen |  |
| A search finds nothing | summary | changed the screen |  |
| The books upload looks wrong | summary | changed the screen |  |
| The PDF or Excel download doesn’t appear | summary | changed the screen |  |
| The page is blank or stuck | summary | changed the screen |  |

### Documents
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | changed the screen |  |
| Documents | button | no visible effect | Expected: the deal already open |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| Answer an RFP Every requirement pulled out, then the respons | button | no visible effect | Expected: the mode already selected |
| Write up a candidate Talent firms: a client-ready summary, w | button | changed the screen |  |
| Choose a PDF | button | no visible effect | Expected: opens the system file picker (not visible in a headless test) |
| Draft the response | button | blocked action, error shown | /api/docs/proposal |
| Your firm’s facts · not filled yet | summary | changed the screen |  |
| Other specialized services firm Engineering & Technical Serv | select:select-one | changed the screen |  |
| Save facts | button | saved to the app | /api/docs/firm |

### Documents · first doc
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | changed the screen |  |
| Documents | button | no visible effect | Expected: the deal already open |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| Answer an RFP Every requirement pulled out, then the respons | button | no visible effect | Expected: the mode already selected |
| Write up a candidate Talent firms: a client-ready summary, w | button | changed the screen |  |
| Choose a PDF | button | no visible effect | Expected: opens the system file picker (not visible in a headless test) |
| Draft the response | button | blocked action, error shown | /api/docs/proposal |
| Your firm’s facts · not filled yet | summary | changed the screen |  |
| Other specialized services firm Engineering & Technical Serv | select:select-one | changed the screen |  |
| Save facts | button | saved to the app | /api/docs/firm |

### Search home · candidate mode
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | no visible effect | Expected: the deal already open |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| Example Firm A Act now Client · Traverse City, M | button | changed the screen |  |
| a candidate Act now Client · Van Buren Township, Michigan New $2 | button | changed the screen |  |
| Example Firm E Act now Firm to buy · Pennsylvania B | button | changed the screen |  |
| Example Firm F Firm to buy · Asheville, NC Website footer  | button | changed the screen |  |
| Example Firm G Client · Virginia New site or expansion: Zoo | button | changed the screen |  |
| Civica Client · Petersburg, Virginia New site or expansion:  | button | changed the screen |  |
| Example Firm H Firm to buy · Rolling Hills Estates, CA We | button | changed the screen |  |
| Example Firm C Client · Wytheville, Virginia New site or  | button | changed the screen |  |
| Example Firm D Firm to buy · Canton, MA Website going quiet:  | button | changed the screen |  |
| Example Firm B Candidate · Greater Richmond Region R | button | changed the screen |  |
| Find people Candidates for a search or a hard-to-fill role | button | no visible effect | Expected: the mode already selected |
| Find clients Companies likely to buy a firm’s service, and w | button | changed the screen |  |
| Find firms to buy Founder-owned specialized services firms A | button | changed the screen |  |
| Filters | summary | changed the screen |  |
| 12 | input:number | changed the screen |  |
| Search | button | blocked action, error shown | /api/search/start |
| your network | span | changed the screen |  |
| last 30 days last 60 days last 4 months | select:select-one | no visible effect | Expected: a form choice, used when you press the button next to it |
| Scan announcements | button | blocked action, error shown | /api/radar/scan |
| source | a | external link | https://news.google.com/rss/articles/CBMivAFBVV95cUxOSFFLZk9WMmxrTE14ZzF1cHdaQzNHbTAzZTh1b0x4clhSM1BrM196eGgwbTMwNnpGOTVxUHdGLUhzNXdsWS1DSDFCWUQwYV82X3Rady1ZUXc2aVQzYlhuOUxaa0I5d0FMQjEteXRXWE45NzNGRExwbk93Um52R0RZUWE1alRfVzVmbEl2NGtMT2VQQXhTR280Y3pwQVZaRUt3RENCVzBGUU5SSTNvSlkxVzNPaFZDSkFIVjZLWQ?oc=5 |
| look into it | span | blocked action, error shown | /api/search/start |
| source | a | external link | https://news.google.com/rss/articles/CBMivAFBVV95cUxOSFFLZk9WMmxrTE14ZzF1cHdaQzNHbTAzZTh1b0x4clhSM1BrM196eGgwbTMwNnpGOTVxUHdGLUhzNXdsWS1DSDFCWUQwYV82X3Rady1ZUXc2aVQzYlhuOUxaa0I5d0FMQjEteXRXWE45NzNGRExwbk93Um52R0RZUWE1alRfVzVmbEl2NGtMT2VQQXhTR280Y3pwQVZaRUt3RENCVzBGUU5SSTNvSlkxVzNPaFZDSkFIVjZLWQ?oc=5 |
| look into it | span | blocked action, error shown | /api/search/start |
| Show all 24 | span | changed the screen |  |
| What changed recently across your results (8) | summary | changed the screen |  |
| (unlabelled) | a | external link | https://www.usaspending.gov/recipient/ac2de1ea-580b-13b8-4222-5b41ea2536bd-C/latest |
| (unlabelled) | a | external link | https://www.usaspending.gov/recipient/ac2de1ea-580b-13b8-4222-5b41ea2536bd-C/latest |
| open | span | changed the screen |  |
| run now | span | blocked action, error shown | /api/search/watchrun |
| Find manufacturing companies in Ohio, Michigan and Indiana t | tr | changed the screen |  |
| remove | span | asked for confirmation | confirm: Remove this search from history? It moves to the archive folder; nothing is dele |
| hvac company in viringina under 1m ebidta Find firms to buy  | tr | changed the screen |  |
| remove | span | asked for confirmation | confirm: Remove this search from history? It moves to the archive folder; nothing is dele |
| hvac technician in virginia Find people Oct 13 11 0 remove | tr | changed the screen |  |
| it must be a firm that is based in new york or has remote em | tr | changed the screen |  |
| PE AI services/consulting firm under 100 employees remote or | tr | changed the screen |  |
| Find manufacturing companies in Ohio, Michigan and Indiana t | tr | changed the screen |  |
| HVAC companies over 1m EBDITA DMV Find firms to buy Oct 9 12 | tr | changed the screen |  |
| hvac business 1m ebidta plus in massachusets Find firms to b | tr | changed the screen |  |
| hvac under 1m ebidta dmv Find firms to buy Oct 6 12 0 remove | tr | changed the screen |  |
| warehouse staffing fullfillment in DMV Find people Oct 5 12  | tr | changed the screen |  |
| Find founder- or family-owned warehouse and light-industrial | tr | changed the screen |  |
| Find founder- or family-owned operations, supply chain, logi | tr | changed the screen |  |
| Find founder- or family-owned management consulting firms in | tr | changed the screen |  |
| Find directors of supply chain or logistics at manufacturers | tr | changed the screen |  |
| Find mid-sized manufacturers, distributors and 3PLs in Virgi | tr | changed the screen |  |
| Find founder-owned retained executive search firms in the So | tr | changed the screen |  |
| Find founder- or family-owned executive search and recruitin | tr | changed the screen |  |
| Find founder- or family-owned fractional and interim executi | tr | changed the screen |  |
| Find founder- or family-owned recruitment process outsourcin | tr | changed the screen |  |
| Find founder- or family-owned retained executive search firm | tr | changed the screen |  |
| Find mid-sized manufacturers and logistics companies in Virg | tr | changed the screen |  |
| Find founder-owned executive search and recruiting firms in  | tr | changed the screen |  |
| Find founder- or family-owned executive search and specializ | tr | changed the screen |  |
| Find founder-owned executive search or specialized recruitin | tr | changed the screen |  |
| Find candidates for the Vice President of Operations role at | tr | changed the screen |  |
| Find senior supply chain leaders in Ohio with automotive man | tr | changed the screen |  |
| Data sources · 8 of 11 connected | summary | changed the screen |  |
| ct-add | span | no visible effect | Expected: opens the system file picker (not visible in a headless test) |
| What we could build next · 11 agents, not built yet | summary | changed the screen |  |

### Search home · client mode
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | no visible effect | Expected: the deal already open |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| Example Firm A Act now Client · Traverse City, M | button | changed the screen |  |
| a candidate Act now Client · Van Buren Township, Michigan New $2 | button | changed the screen |  |
| Example Firm E Act now Firm to buy · Pennsylvania B | button | changed the screen |  |
| Example Firm F Firm to buy · Asheville, NC Website footer  | button | changed the screen |  |
| Example Firm G Client · Virginia New site or expansion: Zoo | button | changed the screen |  |
| Civica Client · Petersburg, Virginia New site or expansion:  | button | changed the screen |  |
| Example Firm H Firm to buy · Rolling Hills Estates, CA We | button | changed the screen |  |
| Example Firm C Client · Wytheville, Virginia New site or  | button | changed the screen |  |
| Example Firm D Firm to buy · Canton, MA Website going quiet:  | button | changed the screen |  |
| Example Firm B Candidate · Greater Richmond Region R | button | changed the screen |  |
| Find people Candidates for a search or a hard-to-fill role | button | changed the screen |  |
| Find clients Companies likely to buy a firm’s service, and w | button | no visible effect | Expected: the mode already selected |
| Find firms to buy Founder-owned specialized services firms A | button | changed the screen |  |
| Engineering & Technical Services Supply Chain, Logistics & P | select:select-one | no visible effect | Expected: a form choice, used when you press the button next to it |
| Filters | summary | changed the screen |  |
| 12 | input:number | changed the screen |  |
| Search | button | blocked action, error shown | /api/search/start |
| your network | span | changed the screen |  |
| last 30 days last 60 days last 4 months | select:select-one | no visible effect | Expected: a form choice, used when you press the button next to it |
| Scan announcements | button | blocked action, error shown | /api/radar/scan |
| source | a | external link | https://news.google.com/rss/articles/CBMivAFBVV95cUxOSFFLZk9WMmxrTE14ZzF1cHdaQzNHbTAzZTh1b0x4clhSM1BrM196eGgwbTMwNnpGOTVxUHdGLUhzNXdsWS1DSDFCWUQwYV82X3Rady1ZUXc2aVQzYlhuOUxaa0I5d0FMQjEteXRXWE45NzNGRExwbk93Um52R0RZUWE1alRfVzVmbEl2NGtMT2VQQXhTR280Y3pwQVZaRUt3RENCVzBGUU5SSTNvSlkxVzNPaFZDSkFIVjZLWQ?oc=5 |
| look into it | span | blocked action, error shown | /api/search/start |
| source | a | external link | https://news.google.com/rss/articles/CBMivAFBVV95cUxOSFFLZk9WMmxrTE14ZzF1cHdaQzNHbTAzZTh1b0x4clhSM1BrM196eGgwbTMwNnpGOTVxUHdGLUhzNXdsWS1DSDFCWUQwYV82X3Rady1ZUXc2aVQzYlhuOUxaa0I5d0FMQjEteXRXWE45NzNGRExwbk93Um52R0RZUWE1alRfVzVmbEl2NGtMT2VQQXhTR280Y3pwQVZaRUt3RENCVzBGUU5SSTNvSlkxVzNPaFZDSkFIVjZLWQ?oc=5 |
| look into it | span | blocked action, error shown | /api/search/start |
| Show all 24 | span | changed the screen |  |
| What changed recently across your results (8) | summary | changed the screen |  |
| (unlabelled) | a | external link | https://www.usaspending.gov/recipient/ac2de1ea-580b-13b8-4222-5b41ea2536bd-C/latest |
| (unlabelled) | a | external link | https://www.usaspending.gov/recipient/ac2de1ea-580b-13b8-4222-5b41ea2536bd-C/latest |
| open | span | changed the screen |  |
| run now | span | blocked action, error shown | /api/search/watchrun |
| Find manufacturing companies in Ohio, Michigan and Indiana t | tr | changed the screen |  |
| remove | span | asked for confirmation | confirm: Remove this search from history? It moves to the archive folder; nothing is dele |
| hvac company in viringina under 1m ebidta Find firms to buy  | tr | changed the screen |  |
| remove | span | asked for confirmation | confirm: Remove this search from history? It moves to the archive folder; nothing is dele |
| hvac technician in virginia Find people Oct 13 11 0 remove | tr | changed the screen |  |
| it must be a firm that is based in new york or has remote em | tr | changed the screen |  |
| PE AI services/consulting firm under 100 employees remote or | tr | changed the screen |  |
| Find manufacturing companies in Ohio, Michigan and Indiana t | tr | changed the screen |  |
| HVAC companies over 1m EBDITA DMV Find firms to buy Oct 9 12 | tr | changed the screen |  |
| hvac business 1m ebidta plus in massachusets Find firms to b | tr | changed the screen |  |
| hvac under 1m ebidta dmv Find firms to buy Oct 6 12 0 remove | tr | changed the screen |  |
| warehouse staffing fullfillment in DMV Find people Oct 5 12  | tr | changed the screen |  |
| Find founder- or family-owned warehouse and light-industrial | tr | changed the screen |  |
| Find founder- or family-owned operations, supply chain, logi | tr | changed the screen |  |
| Find founder- or family-owned management consulting firms in | tr | changed the screen |  |
| Find directors of supply chain or logistics at manufacturers | tr | changed the screen |  |
| Find mid-sized manufacturers, distributors and 3PLs in Virgi | tr | changed the screen |  |
| Find founder-owned retained executive search firms in the So | tr | changed the screen |  |
| Find founder- or family-owned executive search and recruitin | tr | changed the screen |  |
| Find founder- or family-owned fractional and interim executi | tr | changed the screen |  |
| Find founder- or family-owned recruitment process outsourcin | tr | changed the screen |  |
| Find founder- or family-owned retained executive search firm | tr | changed the screen |  |
| Find mid-sized manufacturers and logistics companies in Virg | tr | changed the screen |  |
| Find founder-owned executive search and recruiting firms in  | tr | changed the screen |  |
| Find founder- or family-owned executive search and specializ | tr | changed the screen |  |
| Find founder-owned executive search or specialized recruitin | tr | changed the screen |  |
| Find candidates for the Vice President of Operations role at | tr | changed the screen |  |
| Find senior supply chain leaders in Ohio with automotive man | tr | changed the screen |  |
| Data sources · 8 of 11 connected | summary | changed the screen |  |
| ct-add | span | no visible effect | Expected: opens the system file picker (not visible in a headless test) |
| What we could build next · 11 agents, not built yet | summary | changed the screen |  |

### Search home
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | no visible effect | Expected: the deal already open |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| Example Firm A Act now Client · Traverse City, M | button | changed the screen |  |
| a candidate Act now Client · Van Buren Township, Michigan New $2 | button | changed the screen |  |
| Example Firm E Act now Firm to buy · Pennsylvania B | button | changed the screen |  |
| Example Firm F Firm to buy · Asheville, NC Website footer  | button | changed the screen |  |
| Example Firm G Client · Virginia New site or expansion: Zoo | button | changed the screen |  |
| Civica Client · Petersburg, Virginia New site or expansion:  | button | changed the screen |  |
| Example Firm H Firm to buy · Rolling Hills Estates, CA We | button | changed the screen |  |
| Example Firm C Client · Wytheville, Virginia New site or  | button | changed the screen |  |
| Example Firm D Firm to buy · Canton, MA Website going quiet:  | button | changed the screen |  |
| Example Firm B Candidate · Greater Richmond Region R | button | changed the screen |  |
| Find people Candidates for a search or a hard-to-fill role | button | no visible effect | Expected: the mode already selected |
| Find clients Companies likely to buy a firm’s service, and w | button | changed the screen |  |
| Find firms to buy Founder-owned specialized services firms A | button | changed the screen |  |
| Filters | summary | changed the screen |  |
| 12 | input:number | changed the screen |  |
| Search | button | blocked action, error shown | /api/search/start |
| your network | span | changed the screen |  |
| last 30 days last 60 days last 4 months | select:select-one | no visible effect | Expected: a form choice, used when you press the button next to it |
| Scan announcements | button | blocked action, error shown | /api/radar/scan |
| source | a | external link | https://news.google.com/rss/articles/CBMivAFBVV95cUxOSFFLZk9WMmxrTE14ZzF1cHdaQzNHbTAzZTh1b0x4clhSM1BrM196eGgwbTMwNnpGOTVxUHdGLUhzNXdsWS1DSDFCWUQwYV82X3Rady1ZUXc2aVQzYlhuOUxaa0I5d0FMQjEteXRXWE45NzNGRExwbk93Um52R0RZUWE1alRfVzVmbEl2NGtMT2VQQXhTR280Y3pwQVZaRUt3RENCVzBGUU5SSTNvSlkxVzNPaFZDSkFIVjZLWQ?oc=5 |
| look into it | span | blocked action, error shown | /api/search/start |
| source | a | external link | https://news.google.com/rss/articles/CBMivAFBVV95cUxOSFFLZk9WMmxrTE14ZzF1cHdaQzNHbTAzZTh1b0x4clhSM1BrM196eGgwbTMwNnpGOTVxUHdGLUhzNXdsWS1DSDFCWUQwYV82X3Rady1ZUXc2aVQzYlhuOUxaa0I5d0FMQjEteXRXWE45NzNGRExwbk93Um52R0RZUWE1alRfVzVmbEl2NGtMT2VQQXhTR280Y3pwQVZaRUt3RENCVzBGUU5SSTNvSlkxVzNPaFZDSkFIVjZLWQ?oc=5 |
| look into it | span | blocked action, error shown | /api/search/start |
| Show all 24 | span | changed the screen |  |
| What changed recently across your results (8) | summary | changed the screen |  |
| (unlabelled) | a | external link | https://www.usaspending.gov/recipient/ac2de1ea-580b-13b8-4222-5b41ea2536bd-C/latest |
| (unlabelled) | a | external link | https://www.usaspending.gov/recipient/ac2de1ea-580b-13b8-4222-5b41ea2536bd-C/latest |
| open | span | changed the screen |  |
| run now | span | blocked action, error shown | /api/search/watchrun |
| Find manufacturing companies in Ohio, Michigan and Indiana t | tr | changed the screen |  |
| remove | span | asked for confirmation | confirm: Remove this search from history? It moves to the archive folder; nothing is dele |
| hvac company in viringina under 1m ebidta Find firms to buy  | tr | changed the screen |  |
| remove | span | asked for confirmation | confirm: Remove this search from history? It moves to the archive folder; nothing is dele |
| hvac technician in virginia Find people Oct 13 11 0 remove | tr | changed the screen |  |
| it must be a firm that is based in new york or has remote em | tr | changed the screen |  |
| PE AI services/consulting firm under 100 employees remote or | tr | changed the screen |  |
| Find manufacturing companies in Ohio, Michigan and Indiana t | tr | changed the screen |  |
| HVAC companies over 1m EBDITA DMV Find firms to buy Oct 9 12 | tr | changed the screen |  |
| hvac business 1m ebidta plus in massachusets Find firms to b | tr | changed the screen |  |
| hvac under 1m ebidta dmv Find firms to buy Oct 6 12 0 remove | tr | changed the screen |  |
| warehouse staffing fullfillment in DMV Find people Oct 5 12  | tr | changed the screen |  |
| Find founder- or family-owned warehouse and light-industrial | tr | changed the screen |  |
| Find founder- or family-owned operations, supply chain, logi | tr | changed the screen |  |
| Find founder- or family-owned management consulting firms in | tr | changed the screen |  |
| Find directors of supply chain or logistics at manufacturers | tr | changed the screen |  |
| Find mid-sized manufacturers, distributors and 3PLs in Virgi | tr | changed the screen |  |
| Find founder-owned retained executive search firms in the So | tr | changed the screen |  |
| Find founder- or family-owned executive search and recruitin | tr | changed the screen |  |
| Find founder- or family-owned fractional and interim executi | tr | changed the screen |  |
| Find founder- or family-owned recruitment process outsourcin | tr | changed the screen |  |
| Find founder- or family-owned retained executive search firm | tr | changed the screen |  |
| Find mid-sized manufacturers and logistics companies in Virg | tr | changed the screen |  |
| Find founder-owned executive search and recruiting firms in  | tr | changed the screen |  |
| Find founder- or family-owned executive search and specializ | tr | changed the screen |  |
| Find founder-owned executive search or specialized recruitin | tr | changed the screen |  |
| Find candidates for the Vice President of Operations role at | tr | changed the screen |  |
| Find senior supply chain leaders in Ohio with automotive man | tr | changed the screen |  |
| Data sources · 8 of 11 connected | summary | changed the screen |  |
| ct-add | span | no visible effect | Expected: opens the system file picker (not visible in a headless test) |
| What we could build next · 11 agents, not built yet | summary | changed the screen |  |

### Search results
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | no visible effect | Expected: the deal already open |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| ← All searches | button | changed the screen |  |
| ✓ Watching weekly | button | saved to the app | /api/search/watch |
| Refresh data signals | button | blocked action, error shown | /api/search/signals |
| How this search worked · 29 web searches · 260 pages · 10 ch | summary | changed the screen |  |
| ps-edit | button | changed the screen |  |
| (unlabelled) | summary | changed the screen |  |
| All | button | no visible effect | Expected: already selected |
| Saved | button | changed the screen |  |
| Rejected | button | changed the screen |  |
| Opportunity | button | no visible effect | Expected: already selected |
| Timing | button | changed the screen |  |
| Search paths | button | changed the screen |  |
| jobtarget.com | a | external link | https://www.jobtarget.com/jobs/jt-xy0jdrnnwy/director-of-supply-chain-traverse-city-michigan |
| peprofessional.com | a | external link | https://peprofessional.com/2024/12/wynnchurch-sells-texas-hydraulics-to-fortress/ |
| jobtarget.com | a | external link | https://www.jobtarget.com/jobs/jt-xy0jdrnnwy/director-of-supply-chain-traverse-city-michigan |
| Details | button | changed the screen |  |
| Save | button | saved to the app | /api/search/decide |
| Priority account | button | saved to the app | /api/search/decide |
| Reject | button | saved to the app | /api/search/decide |
| michigan.gov | a | external link | https://www.michigan.gov/whitmer/news/press-releases/2026/07/13/whitmer-announces-120-jobs-coming-to-michigan-31-million-investment-in-wayne-charlevoix-counties |
| areadevelopment.com | a | external link | https://www.areadevelopment.com/newsItems/7-15-2026/ricardo-van-buren-township-michigan.shtml |
| careers-ricardo.icims.com | a | external link | https://careers-ricardo.icims.com/jobs/3115/chief-program-engineer/job |
| themanufacturer.com | a | external link | https://www.themanufacturer.com/articles/ricardo-appoints-company-veteran-as-ceo-to-lead-next-phase-following-wsp-acquisition/ |
| Details | button | changed the screen |  |
| Save | button | saved to the app | /api/search/decide |
| Priority account | button | saved to the app | /api/search/decide |
| Reject | button | saved to the app | /api/search/decide |
| mmh.com | a | external link | https://www.mmh.com/article/flow_rite_to_expand_facility_create_new_jobs |
| tradeandindustrydev.com | a | external link | https://www.tradeandindustrydev.com/industry/manufacturing/news/mi-right-place-supports-creation-114-jobs-west-9443 |
| boatingindustry.com | a | external link | https://boatingindustry.com/news/2021/02/04/flow-rite-names-new-director-of-operations/ |
| plasticstoday.com | a | external link | https://www.plasticstoday.com/automotive-mobility/us-farathane-invests-22m-in-port-huron-expansion |
| michigan.gov | a | external link | https://www.michigan.gov/whitmer/news/press-releases/2026/09/21/whitmer-announces-243-jobs-across-three-business-expansions-in-st-clair-ogemaw-oscoda-counties |
| prod.crainsdetroit.com | a | external link | https://prod.crainsdetroit.com/node/895046 |
| builtin.com | a | external link | https://builtin.com/company/eli-lilly-and-company/jobs |
| scoutify.com | a | external link | https://scoutify.com/companies/eli-lilly/jobs/1340968/ |
| counterman.com | a | external link | https://www.counterman.com/?p=109339 |
| tradeandindustrydev.com | a | external link | https://www.tradeandindustrydev.com/industry/manufacturing/news/mi-right-place-supports-creation-114-jobs-west-9443 |
| aftermarketnews.com | a | external link | https://www.aftermarketnews.com/two-named-to-executive-positions-at-denso-manufacturing-michigan/ |
| jobs.danfoss.com | a | external link | https://jobs.danfoss.com/job/Blackman-Township-Plant-Director-MI/1329418957 |
| jobs.danfoss.com | a | external link | https://jobs.danfoss.com/job/Blackman-Township-Plant-Director-MI/1329418957 |
| jobs.disabilitytalent.org | a | external link | https://jobs.disabilitytalent.org/jobs/489856747-director-global-distribution-logistics |
| brunswick.com | a | external link | https://www.brunswick.com/news/press-releases/detail/994/brunswick-corporation-announces-operational-updates-at |
| pulse2.com | a | external link | https://pulse2.com/brunswick-names-aine-denari-as-ceo-as-david-foulkes-announces-retirement/ |
| themuse.com | a | external link | https://www.themuse.com/jobs/flex/director-supply-chain-management-d6ea05 |
| themuse.com | a | external link | https://www.themuse.com/jobs/flex/director-supply-chain-management-d6ea05 |
| simplify.jobs | a | external link | https://simplify.jobs/p/fbb2243f-0674-4989-8de7-2812f122d800/Director-Operations-Control-Center |
| ziprecruiter.com | a | external link | https://www.ziprecruiter.com/Jobs/Airgas |
| Every step this search took (59) | summary | changed the screen |  |
| 72 more companies found but not checked in depth | summary | changed the screen |  |
| (unlabelled) | a | external link | https://ihire.com/t-engineering-manager-s-indiana-jobs.html |
| (unlabelled) | a | external link | https://ihire.com/t-engineering-manager-s-indiana-jobs.html |

### Search result detail
| Control | Type | Result | Detail |
|---|---|---|---|
| Close | button | changed the screen |  |
| flow-rite.com | a | external link | https://flow-rite.com |
| source | a | external link | https://www.mmh.com/article/flow_rite_to_expand_facility_create_new_jobs |
| source | a | external link | https://www.mmh.com/article/flow_rite_to_expand_facility_create_new_jobs |
| mmh.com | a | external link | https://www.mmh.com/article/flow_rite_to_expand_facility_create_new_jobs |
| tradeandindustrydev.com | a | external link | https://www.tradeandindustrydev.com/industry/manufacturing/news/mi-right-place-supports-creation-114-jobs-west-9443 |
| rv-pro.com | a | external link | https://rv-pro.com/news/flow-rite-names-new-director-of-operations |
| boatingindustry.com | a | external link | https://boatingindustry.com/news/2021/02/04/flow-rite-names-new-director-of-operations/ |
| mmh.com | a | external link | https://www.mmh.com/article/flow_rite_to_expand_facility_create_new_jobs |
| rv-pro.com | a | external link | https://rv-pro.com/news/flow-rite-names-new-director-of-operations |
| SC247 Topics News | a | external link | https://www.supplychain247.com/article/flow_rite_to_expand_facility_create_new_jobs |
| MMH Topics | a | external link | https://www.mmh.com/article/flow_rite_to_expand_facility_create_new_jobs |

### Network
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | changed the screen |  |
| Proprietary Search | button | no visible effect | Expected: the deal already open |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| ← Proprietary Search | button | changed the screen |  |
| People (109) | button | no visible effect | Expected: already selected |
| Client companies (428) | button | changed the screen |  |
| Acquisition targets (483) | button | changed the screen |  |

### Value Creation · overview
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| Business outside the core subsectors · change | button | asked for confirmation | prompt: What kind of business is this? (e.g. civil engineering firm, fire inspection com |
| ▶ Replay | button | changed the screen |  |
| 1-page PDF | button | saved to the app | /api/pdf |
| Excel | button | saved to the app | /api/excel |
| Overview | button | no visible effect | Expected: already selected |
| AION fit | button | changed the screen |  |
| Plan | button | changed the screen |  |
| Trends | button | changed the screen |  |
| Deal | button | changed the screen |  |
| After you buy | button | changed the screen |  |
| Questions & checks | button | changed the screen |  |
| ✓ 2 checks passed | summary | changed the screen |  |
| Build it | button | changed the screen |  |
| Count it in the plan | button | saved to the app | /api/answer |
| Build it | button | changed the screen |  |
| Choose file | button | no visible effect | Expected: opens the system file picker (not visible in a headless test) |
| Choose file | button | no visible effect | Expected: opens the system file picker (not visible in a headless test) |

### Value Creation · fit
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| Business outside the core subsectors · change | button | asked for confirmation | prompt: What kind of business is this? (e.g. civil engineering firm, fire inspection com |
| ▶ Replay | button | changed the screen |  |
| 1-page PDF | button | saved to the app | /api/pdf |
| Excel | button | saved to the app | /api/excel |
| Overview | button | changed the screen |  |
| AION fit | button | no visible effect | Expected: the deal already open |
| Plan | button | changed the screen |  |
| Trends | button | changed the screen |  |
| Deal | button | changed the screen |  |
| After you buy | button | changed the screen |  |
| Questions & checks | button | changed the screen |  |
| Outside the core subsectors Engineering & Technical Services | select:select-one | saved to the app | /api/subsector |
| Start this customer search → | span | changed the screen |  |
| Diligence answers · 0 of 14 recorded | summary | changed the screen |  |
| — | input:number | saved to the app | /api/diligence |
| Not asked yet Yes Partly No | select:select-one | saved to the app | /api/diligence |
| Not asked yet No Yes | select:select-one | saved to the app | /api/diligence |
| Not asked yet Improves it Mixed Commoditizes it | select:select-one | saved to the app | /api/diligence |
| — | input:number | saved to the app | /api/diligence |
| Not asked yet From scratch, by hand Copied from old document | select:select-one | saved to the app | /api/diligence |
| Not asked yet In senior people’s heads Scattered files and e | select:select-one | saved to the app | /api/diligence |
| Not asked yet The founder and referrals A mix A structured s | select:select-one | saved to the app | /api/diligence |
| (unlabelled) | select:select-one | saved to the app | /api/diligence |
| (unlabelled) | select:select-one | saved to the app | /api/diligence |
| (unlabelled) | select:select-one | saved to the app | /api/diligence |
| The AION toolkit · 5 exist now, 5 partly | summary | changed the screen |  |

### Value Creation · plan
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| Business outside the core subsectors · change | button | asked for confirmation | prompt: What kind of business is this? (e.g. civil engineering firm, fire inspection com |
| ▶ Replay | button | changed the screen |  |
| 1-page PDF | button | saved to the app | /api/pdf |
| Excel | button | saved to the app | /api/excel |
| Overview | button | changed the screen |  |
| AION fit | button | changed the screen |  |
| Plan | button | no visible effect | Expected: already selected |
| Trends | button | changed the screen |  |
| Deal | button | changed the screen |  |
| After you buy | button | changed the screen |  |
| Questions & checks | button | changed the screen |  |
| 1 BUSINESS Cut supplier and tool costs Supplier and tool spe | tr | changed the screen |  |
| Step-by-step instructions → | span | changed the screen |  |
| 2 BUSINESS Bill on time and chase late invoices Books: $169K | tr | changed the screen |  |
| Step-by-step instructions → | span | changed the screen |  |
| 8 more ideas worth doing · not counted in profit | summary | changed the screen |  |
| (unlabelled) | tr | changed the screen |  |
| (unlabelled) | span | changed the screen |  |
| (unlabelled) | tr | changed the screen |  |
| (unlabelled) | span | changed the screen |  |
| 2 | input:number | saved to the app | /api/assumptions |
| 25 | input:number | saved to the app | /api/assumptions |
| 4 | input:number | saved to the app | /api/assumptions |
| 1.5× | button | changed the screen |  |
| 2× | button | changed the screen |  |
| 3× | button | changed the screen |  |
| 5× | button | changed the screen |  |
| 3 | input:number | saved to the app | /api/assumptions |
| 2 | input:number | changed the screen |  |
| 0 | input:number | changed the screen |  |
| 25 | input:number | changed the screen |  |
| 12 | input:number | changed the screen |  |
| 3.5 | input:number | changed the screen |  |
| on | input:checkbox | no visible effect | Works: adds the remaining benchmark gap; this deal has none left, so the chart is unchanged |
| The add-on queue (13) | summary | changed the screen |  |
| Tools we could build next · 8, not built yet | summary | changed the screen |  |

### Value Creation · trends
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| Business outside the core subsectors · change | button | asked for confirmation | prompt: What kind of business is this? (e.g. civil engineering firm, fire inspection com |
| ▶ Replay | button | changed the screen |  |
| 1-page PDF | button | saved to the app | /api/pdf |
| Excel | button | saved to the app | /api/excel |
| Overview | button | changed the screen |  |
| AION fit | button | changed the screen |  |
| Plan | button | changed the screen |  |
| Trends | button | no visible effect | Expected: already selected |
| Deal | button | changed the screen |  |
| After you buy | button | changed the screen |  |
| Questions & checks | button | changed the screen |  |

### Value Creation · deal
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| Business outside the core subsectors · change | button | asked for confirmation | prompt: What kind of business is this? (e.g. civil engineering firm, fire inspection com |
| ▶ Replay | button | changed the screen |  |
| 1-page PDF | button | saved to the app | /api/pdf |
| Excel | button | saved to the app | /api/excel |
| Overview | button | changed the screen |  |
| AION fit | button | changed the screen |  |
| Plan | button | changed the screen |  |
| Trends | button | changed the screen |  |
| Deal | button | no visible effect | Expected: already selected |
| After you buy | button | changed the screen |  |
| Questions & checks | button | changed the screen |  |
| Holding company keep it for good | button | saved to the app | /api/assumptions |
| PE fund sell in year 5 | button | saved to the app | /api/assumptions |
| Independent sponsor one deal at a time | button | saved to the app | /api/assumptions |
| Search fund a first-time operator | button | saved to the app | /api/assumptions |
| SBA loan buyer owner runs it, 10% down | button | saved to the app | /api/assumptions |
| Check online | button | changed the screen |  |

### Value Creation · run
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| Business outside the core subsectors · change | button | asked for confirmation | prompt: What kind of business is this? (e.g. civil engineering firm, fire inspection com |
| ▶ Replay | button | changed the screen |  |
| 1-page PDF | button | saved to the app | /api/pdf |
| Excel | button | saved to the app | /api/excel |
| Overview | button | changed the screen |  |
| AION fit | button | changed the screen |  |
| Plan | button | changed the screen |  |
| Trends | button | changed the screen |  |
| Deal | button | changed the screen |  |
| After you buy | button | no visible effect | Expected: already selected |
| Questions & checks | button | changed the screen |  |
| Choose file | button | no visible effect | Expected: opens the system file picker (not visible in a headless test) |

### Value Creation · details
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| Business outside the core subsectors · change | button | asked for confirmation | prompt: What kind of business is this? (e.g. civil engineering firm, fire inspection com |
| ▶ Replay | button | changed the screen |  |
| 1-page PDF | button | saved to the app | /api/pdf |
| Excel | button | saved to the app | /api/excel |
| Overview | button | changed the screen |  |
| AION fit | button | changed the screen |  |
| Plan | button | changed the screen |  |
| Trends | button | changed the screen |  |
| Deal | button | changed the screen |  |
| After you buy | button | changed the screen |  |
| Questions & checks | button | no visible effect | Expected: already selected |
| 0 | input:number | saved to the app | /api/answer |
| 0 | input:number | saved to the app | /api/answer |
| Yes | button | saved to the app | /api/answer |
| No | button | saved to the app | /api/answer |
| Yes | button | saved to the app | /api/answer |
| No | button | saved to the app | /api/answer |
| 4 | input:number | saved to the app | /api/assumptions |
| 2 | input:number | saved to the app | /api/assumptions |
| 40000 | input:number | saved to the app | /api/assumptions |
| 5 | input:number | saved to the app | /api/assumptions |
| 1.5 | input:number | saved to the app | /api/assumptions |
| Every step AION took, in order (35) | summary | changed the screen |  |
| All the numbers | span | changed the screen |  |
| What the AI was sent | span | changed the screen |  |
| Run the AI again | span | asked for confirmation | confirm: Run the AI again? Saved answers are replaced, so numbers may change. |
| Close this deal | span | asked for confirmation | confirm: Close this deal? Its files move to the archive folder; nothing is deleted. |

### Build-it drawer
| Control | Type | Result | Detail |
|---|---|---|---|
| Close | button | changed the screen |  |
| Copy prompt | button | changed the screen |  |

### Advanced · levers
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| 1 Upload | a | changed the screen |  |
| 2 Accounts | a | changed the screen |  |
| 3 Earnings | a | changed the screen |  |
| 4 Operations | a | changed the screen |  |
| 5 Levers & ROI | a | no visible effect | Expected: the step already open |
| 6 AI plan | a | changed the screen |  |
| ≡ Run log | a | changed the screen |  |
| ← Back to summary | a | changed the screen |  |
| Start over (archives workspace) | span | asked for confirmation | confirm: Archive the current workspace and start over? Nothing is deleted. |
| 35 | input:number | saved to the app | /api/assumptions |
| 30 | input:number | saved to the app | /api/assumptions |
| 40 | input:number | saved to the app | /api/assumptions |
| 50 | input:number | saved to the app | /api/assumptions |
| 40 | input:number | saved to the app | /api/assumptions |
| 30 | input:number | saved to the app | /api/assumptions |
| 6 | input:number | saved to the app | /api/assumptions |
| 26 | input:number | saved to the app | /api/assumptions |
| 3 | input:number | saved to the app | /api/assumptions |
| 70 | input:number | saved to the app | /api/assumptions |
| 50 | input:number | saved to the app | /api/assumptions |
| 0 | input:number | saved to the app | /api/assumptions |
| 0 | input:number | saved to the app | /api/assumptions |
| 150 | input:number | saved to the app | /api/assumptions |
| 40001 | input:number | saved to the app | /api/assumptions |
| 24000 | input:number | saved to the app | /api/assumptions |
| 7 | input:number | saved to the app | /api/assumptions |
| Reset assumptions to defaults | span | saved to the app | /api/assumptions |
| Build the AI deployment plan → | button | changed the screen |  |

### Advanced · run log
| Control | Type | Result | Detail |
|---|---|---|---|
| Value Creation | button | no visible effect | Expected: the tab already open |
| Proprietary Search | button | changed the screen |  |
| Documents | button | changed the screen |  |
| Settings | button | changed the screen |  |
| Help | button | changed the screen |  |
| GEE Group Income Statement FY2023 FY2025 (SEC) | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| Exploring Holding Companies in the Search Fund Ecosystem Fin | button | saved to the app | /api/deals/select |
| Executive Search Firm General Ledger 2025 | button | saved to the app | /api/deals/select |
| BN000057416 | button | saved to the app | /api/deals/select |
| BN000066873 | button | saved to the app | /api/deals/select |
| + New deal | button | blocked action, error shown | /api/deals/new |
| 1 Upload | a | changed the screen |  |
| 2 Accounts | a | changed the screen |  |
| 3 Earnings | a | changed the screen |  |
| 4 Operations | a | changed the screen |  |
| 5 Levers & ROI | a | changed the screen |  |
| 6 AI plan | a | changed the screen |  |
| ≡ Run log | a | no visible effect | Expected: the step already open |
| ← Back to summary | a | changed the screen |  |
| Start over (archives workspace) | span | asked for confirmation | confirm: Archive the current workspace and start over? Nothing is deleted. |
| Industry value-creation moves (saved answer reused) · claude | summary | changed the screen |  |
| Propose add-backs, vendor opportunities and flags (saved ans | summary | changed the screen |  |
| Industry value-creation moves (saved answer reused) · claude | summary | changed the screen |  |
| Propose add-backs, vendor opportunities and flags (saved ans | summary | changed the screen |  |
| Extract P&L from PDF statements (saved answer reused) · clau | summary | changed the screen |  |

## Checked separately (not clickable in a headless test)
| Interaction | How it was checked | Result |
|---|---|---|
| Upload books (drop or choose) | API: valid ledger, .docx, corrupt .xlsx, empty .csv | Valid file parsed; the others refused with a plain message |
| Analyze with no AI set up | Fresh data folder, Claude Code/Codex hidden | "No AI is set up yet. Open Settings → AI and pick Claude Code, Codex or an API key." |
| First run | Fresh data folder | Opens Settings with the welcome; all four AI options show how to set up |
| 1-page PDF and Excel | API on the analyzed deal, and inside the packaged app | See TEST_RESULTS.md |
| Confirm "Yes" paths (close deal, remove search, remove key, run AI again) | Code review: each calls the server only after confirm() returns true; server moves files to archive/ (never deletes) | OK |
| Keyboard | Tab through header and Help; Escape closes the modal and drawers | Focus outline visible; Escape works |
| Double clicks | Search, Excel, PDF, Save key, Save and restart, Watch weekly | Button disables until the action finishes |
