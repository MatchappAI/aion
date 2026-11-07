// Instructions for each stage. Candidate Sourcing and Client Acquisition share the pipeline and differ only here.
const j = o => JSON.stringify(o);
import { SUBSECTORS, THESIS } from '../thesis.mjs';
// non-talent client searches look for buyers of the firm's own service; talent client searches keep the recruiting wording
const svc = sub => sub && sub !== 'talent' ? SUBSECTORS[sub] : null;

export function strategyPrompt(mode, objective, filters, sub) {
  if (mode === 'target') return targetStrategy(objective, filters, sub);
  if (mode === 'client' && svc(sub)) return serviceClientStrategy(objective, filters, svc(sub));
  const cand = mode === 'candidate';
  return `Task: turn a recruiting firm's ${cand ? 'candidate sourcing' : 'client acquisition'} objective into a search strategy and a set of web search queries.

Objective: ${objective}
Optional filters from the user: ${j(filters || {})}

${cand ? `Identify: ideal titles, adjacent titles, seniority, required experience, relevant industries, target and competitor employers, geography variants (cities, metros, states), skill synonyms, exclusions, and alternative backgrounds that could still fit.`
  : `Identify: the ideal company profile, industries, geography, likely recruiting needs, hiring signals, growth triggers (new facilities, expansion, funding, acquisitions, leadership changes), the decision-maker titles to approach, and exclusions.`}

Then write ${cand ? '20 to 32' : '20 to 30'} web search queries in distinct families that attack the problem from different directions. Do not write near-duplicates.
${cand ? `Required methods (use each at least twice, named exactly): "Leadership moves" (press releases about people appointed, promoted or departing, e.g. "named vice president" OR "joins as" OR "departs"), "Associations and speakers" (member directories, award lists, conference speaker pages).
Other families: title (exact and adjacent), employer (current and former staff of target companies, e.g. "former <company>"), geography (cities and metros), industry terms, skills, achievements in bios, associations, conference speakers and panels, company leadership and team pages, public professional profiles (site:linkedin.com/in is allowed as a normal public search), long-tail combinations.`
  : `Required methods (use each at least three times, named exactly): "Repeated job postings" (company careers pages and job boards showing the same senior role posted more than once or many similar openings, e.g. site:boards.greenhouse.io OR site:jobs.lever.co plus the role; "reposted"; "multiple openings"), "Leadership changes" (press releases about executives appointed or departing, which create a hiring need), "Association directories" (industry association member lists). When the target companies make, sell or ship physical goods, also use "Import surge" at least twice (public shipment records showing fast-growing importers, e.g. site:importyeti.com plus the product type, or news of record shipment volumes).
Other families: open leadership roles, repeated hiring, company growth and new facilities, leadership changes, funding or acquisitions, industry directories and lists, trade associations, local business clusters, competitor lookalikes, and trigger news (press releases).`}

Also write 4 to 7 scoring criteria the ${cand ? 'candidate' : 'company'} should meet, each with a weight from 1 to 3 (3 = must have).

Return JSON:
{"summary":"<one sentence: what we are looking for>","profile":{"${cand ? 'titles' : 'industries'}":[""],"${cand ? 'adjacent_titles' : 'signals'}":[""],"${cand ? 'industries' : 'decision_makers'}":[""],"${cand ? 'target_employers' : 'company_size'}":[""],"geography":[""],"exclusions":[""]},
 "criteria":[{"key":"short_snake_case","label":"<plain words>","weight":3}],
 "queries":[{"q":"<search text>","family":"<family name>"}]}`;
}

export function extractPrompt(mode, objective, criteria, batch, sub) {
  const cand = mode === 'candidate', tgt = mode === 'target';
  return `Task: from these web search results, list every real ${cand ? 'person who could be a candidate' : tgt ? 'company that could be bought' : 'company that could be a client'} for this objective: ${objective}

Each result has an id, title, url and the query that found it. Some queries also have a summary of what the search found.

Results: ${j(batch.results)}
Search summaries: ${j(batch.summaries)}

Rules:
- Only include a ${cand ? 'person' : 'company'} that is named in a result title, url or summary. Copy the name exactly. Never guess a name.
- ${cand ? 'Skip job postings, salary pages, recruiter firms and articles that do not name a specific person. A person must be an individual, not a company.' : tgt ? 'Skip directories, list sites, brokers and news outlets themselves; list the business the result is about. Skip large public companies.' : svc(sub) ? `Skip job boards, news outlets and firms that themselves sell ${svc(sub).short}; list the company the result is about.` : 'Skip job boards, staffing agencies, salary sites and news outlets themselves; list the company the result is about.'}
- For every field, give only what the cited results say. Leave a field empty if not stated.
- "sources" lists the result ids that mention this ${cand ? 'person' : 'company'}.

Return JSON: {"entities":[${cand
  ? '{"name":"","title":"","employer":"","location":"","facts":[""],"sources":[0]}'
  : tgt ? '{"company":"","website":"","location":"","industry":"","signals":[""],"roles":[],"owner":"","founded":"","people":[{"name":"","title":""}],"sources":[0]}' : '{"company":"","website":"","location":"","industry":"","signals":[""],"roles":[""],"people":[{"name":"","title":""}],"sources":[0]}'}]}`;
}

export function enrichPrompt(mode, objective, criteria, e, sub) {
  if (mode === 'target') return `Task: verify and assess one possible acquisition target for a holding company.

Objective: ${objective}
Criteria: ${j(criteria)}
What we already found: ${j(e)}

Use WebSearch (at most 5 searches) and WebFetch (at most 3 pages, such as the company's about, team or history page) to confirm: the business identity and website, what it does and its niche, location and offices, size (employees, offices, revenue only if publicly stated), year founded and the incorporation date and status in a public business registry (OpenCorporates or the state registry) if you can find it, who owns and runs it (founder, family, partners), whether the founder still leads it, whether a successor is named, whether it is PE-backed, public or part of a larger group, and any sign the owner may sell (long tenure, retirement, no named successor, listed for sale). Do not fetch linkedin.com pages.

Also look for timing clues that the owner may sell soon. Use these keys: "second_in_command" (the firm recently hired or is advertising for a General Manager, COO, President or managing director while the founder still runs it), "stale_website" (the site's copyright year, latest blog post or news is years old; give the year you saw), "succession" (founder 25+ years in, retirement mentioned, no successor), "neighbours_selling" (a competitor in the same niche and region sold recently), "next_chapter" (the owner publicly talks about legacy, succession or what is next). "career_length" (the founder's own stated career start or graduation year shows 35+ years in work; use only a stated year, never guess), "partner_left" (a long-time partner or second-in-command left the firm), "exit_planning" (the owner attends exit- or succession-planning events, joins a CEO peer group, or works with an exit advisor), "lease_ending" (the office lease is ending or the office is listed for lease or sale), "licence_lapse" (a required state business licence or registration lapsed or is past due), "flat_firm" (headcount, offices or services unchanged for 5+ years with no new hires). Also look for signs the owner wants to GROW WITH A PARTNER rather than sell (AION could bring AI tools, clients and distribution with no money changing hands): "partner_program" (a partner, referral, alliance or reseller program or "become a partner" page on its site), "growth_hiring" (open roles in business development, sales, partnerships or growth, or more open roles than a firm its size usually has), "new_service" (a new service line, offer or practice launched in the last 2 years), "ai_interest" (the firm or owner writes, posts or speaks about AI, automation or new tools, or lists an AI service), "capacity_strain" (the site or owner says they are at capacity, have a waitlist, are turning work away or are short-staffed), "alliance" (a partnership, alliance or joint offer with another firm announced), "subcontracts" (it works as a subcontractor, white-labels for bigger firms, or is on a teaming or bid list), "recap_interest" (the owner talks about bringing in investors, a recapitalization, a growth partner or a minority or majority investment). Also report clues against selling now with direction "against" (for example a successor or new CEO was just named, new partners joined, or the firm just raised money). Every clue needs the URL where you saw it and a date if one is shown; use confidence "possible" when the match is not certain. Never guess age from photos and never use health or family details. Only report a clue that actually points toward it happening; do not report a clue and then argue against it. "against" is only for a concrete event (a successor or new CEO named, new partners joined, money just raised, a big recent acquisition, the role just filled); an up-to-date website or "no retirement mentioned" is not a clue either way. Write each clue as one short sentence, under 20 words. AION buys firms: in the summary and angle, frame the approach as a buyout (full or majority). Suggest a growth partnership only if the firm itself says, in its own words, that it wants a partner or investor, and quote where.

For a criterion about work AION's tools improve, look for public signs the firm answers RFPs, RFQs or statements of qualifications (bid portals, award notices), produces repeat reports or inspections, or wins work mainly by referral. For cash conversion, Net 30 billing is normal and is not a mismatch; only payroll float (paying contract workers before clients pay) or signs of collection trouble count against it.

Assess each criterion as "strong", "partial", "no_evidence" (nothing found either way) or "mismatch" (a source shows it does not fit, e.g. already PE-backed or far too large). Never treat missing information as a mismatch. Your criteria must agree with your summary.

Every fact must cite the exact URL it came from (returned by your tools this session, or listed above). Write like an acquisitions analyst who read the evidence: specific, no generic phrases. If something is not found, say "Not found in public sources reviewed."

Return JSON: {"same_entity_confidence":0.0,"company":"","website":"","location":"","industry":"","size":"<a few words>","founded":"","ownership":"<founder-owned / family-owned / PE-backed / public / unknown>","registry":{"incorporated":"","status":"","url":""},"founder_leads":"yes|no|unknown","successor_named":"yes|no|unknown","open_roles":[],"signals":[{"text":"","url":""}],"timing":[{"signal":"<key>","text":"<what you saw, specific>","url":"","date":"<YYYY-MM or YYYY, or empty>","direction":"for|against","confidence":"likely|possible"}],"contacts":[{"name":"","title":"","url":""}],"angle":"<why it could be a good acquisition, one sentence>","facts":[{"text":"","url":""}],"criteria":[{"key":"","status":"strong|partial|no_evidence|mismatch","note":"","url":""}],"summary":"<2 sentences>","concern":"<one evidence-based concern, or empty>"}`;
  const cand = mode === 'candidate', SV = !cand && svc(sub);
  if (SV) return `Task: verify and assess one possible client company for a ${SV.short} firm.

Objective: ${objective}
Criteria: ${j(criteria)}
What we already found: ${j(e)}

Use WebSearch (at most 4 searches) and WebFetch (at most 2 pages) to confirm the company identity and website, what it does and where it operates, size or growth signals, recent events that create a need for ${SV.short} (${SV.triggers}), whether it already has a large in-house team for this, and the decision makers who would buy it (for example ${SV.buyerTitles}). Do not fetch linkedin.com pages.

Also look for timing clues, each with the URL where you saw it and a date if one is shown. Keys: "new_site" (a new plant, warehouse, facility or office), "new_owner" (recently bought or newly funded), "system_switch" (a new system rollout), "empty_chair" (a relevant leader left and no replacement is announced), "leadership_change" (a new leader who would buy this service), "other" (a regulatory deadline, permit, certification requirement or project announcement). Clues against buying now have direction "against" (for example the work was just awarded to someone else). Use confidence "possible" when you are not sure. Never use health, family or appearance details. Write each clue as one short sentence, under 20 words.

Then assess each criterion as one of: "strong", "partial", "no_evidence", "mismatch". Never treat missing information as a mismatch; when sources show something different, that is a "mismatch". Your criteria must agree with your summary.

Every fact and every assessment must cite the exact URL it came from (a URL returned by your tools in this session, or one listed above). Write the summary like an experienced business developer who read the evidence. If a criterion has no evidence, say "Not found in public sources reviewed."

Return JSON: {"same_entity_confidence":0.0,"company":"","website":"","location":"","industry":"","size":"<a few words>","open_roles":[],"reposted_roles":[],"leadership_changes":[{"text":"","url":""}],"signals":[{"text":"","url":""}],"contacts":[{"name":"","title":"","url":""}],"angle":"<why they may buy now, one sentence>","timing":[{"signal":"<key>","text":"","url":"","date":"","direction":"for|against","confidence":"likely|possible"}],"facts":[{"text":"","url":""}],"criteria":[{"key":"","status":"strong|partial|no_evidence|mismatch","note":"","url":""}],"summary":"<2 sentences>","concern":"<one evidence-based concern, or empty>"}`;
  return `Task: verify and assess one ${cand ? 'candidate' : 'target company'} for a recruiting firm.

Objective: ${objective}
Criteria: ${j(criteria)}
What we already found: ${j(e)}

Use WebSearch (at most 4 searches) and WebFetch (at most 2 pages) to confirm ${cand ? 'their current role, employer, location, tenure, prior employers and industry experience' : 'the company identity and website, actual hiring activity and open roles (and whether the same senior role has been posted more than once or for a long time), size or growth signals, recent leadership changes (executives appointed or departed), and current leaders who would hire a recruiter (for example CEO, COO, VP People, Head of Talent)'}. Do not fetch linkedin.com pages.

Also look for timing clues, each with the URL where you saw it and a date if one is shown. ${cand ? 'Keys: "boss_left" (their manager left), "passed_over" (someone else was named to the role above them), "company_acquired" (their employer was acquired in the last 1–2 years), "site_closing" (their plant, warehouse or office is closing or moving), "raising_profile" (they recently started speaking, publishing or earning certifications). Clues against moving now have direction "against" (for example they were just promoted or joined in the last year).' : 'Keys: "import_surge" (public customs or shipment records, for example site:importyeti.com plus the company name, show shipments growing), "ghost_job" (the same senior role posted 3 or more times or open for months), "empty_chair" (a senior leader left and no replacement is announced), "new_site" (a new plant, warehouse or office, or a state grant to add jobs), "new_owner" (recently bought by private equity or newly funded), "system_switch" (job posts mention a new ERP or system rollout). Clues against hiring now have direction "against" (for example a hiring freeze or the role was just filled).'} Use confidence "possible" when you are not sure. Never use health, family or appearance details. Only report a clue that actually points toward it happening; do not report a clue and then argue against it. "against" is only for a concrete event (a successor or new CEO named, new partners joined, money just raised, a big recent acquisition, the role just filled); an up-to-date website or "no retirement mentioned" is not a clue either way. Write each clue as one short sentence, under 20 words.

Then assess each criterion as one of: "strong" (clearly supported by a source), "partial" (partly supported), "no_evidence" (nothing found either way), "mismatch" (a source shows it does not fit). Never treat missing information as a mismatch. But when sources show something different (for example a different industry, location or seniority than required), that is a "mismatch", not "no_evidence". Your criteria must agree with your summary: if you conclude it is a weak or poor fit, the criteria that make it so must say "mismatch" or "partial".

Every fact and every assessment must cite the exact URL it came from (a URL returned by your tools in this session, or one listed above). Write the summary like an expert ${cand ? 'recruiter' : 'business developer'} who read the evidence: specific, referencing facts, no generic phrases. If a criterion has no evidence, say "Not found in public sources reviewed."

Return JSON: {"same_entity_confidence":0.0,${cand ? '"name":"","title":"","employer":"","location":"","prior_employers":[""],' : '"company":"","website":"","location":"","industry":"","size":"<a few words, e.g. about 300 employees>","open_roles":[""],"reposted_roles":[{"role":"","evidence":"","url":""}],"leadership_changes":[{"text":"","url":""}],"signals":[{"text":"","url":""}],"contacts":[{"name":"","title":"","url":""}],"angle":"",'}"timing":[{"signal":"<key>","text":"<what you saw, specific>","url":"","date":"<YYYY-MM or YYYY, or empty>","direction":"for|against","confidence":"likely|possible"}],"facts":[{"text":"","url":""}],"criteria":[{"key":"","status":"strong|partial|no_evidence|mismatch","note":"","url":""}],"summary":"<2 sentences>","concern":"<one evidence-based concern, or empty>"}`;
}

export function contactPrompt(mode, e) {
  const cand = mode === 'candidate';
  return `Task: find legitimate, publicly listed business contact details for ${cand ? `this person: ${e.name}, ${e.title || ''} at ${e.employer || ''}${e.location ? `, ${e.location}` : ''}` : `this company and its decision makers: ${e.company}${e.website ? ` (${e.website})` : ''}${e.location ? `, ${e.location}` : ''}. Decision makers: ${JSON.stringify((e.contacts || []).slice(0, 4))}`}.

Use WebSearch (at most 3 searches) and WebFetch (at most 3 pages, such as the company contact page, team page or a public bio). Do not fetch linkedin.com pages. Look for: work email, business phone, company main line, contact page, public professional profile, company profile page, office address.

Rules: report only details shown on a page or search result from this session, copied exactly, each with the URL where it appears. Never guess an email from a name pattern. Never include personal or private contact details. If nothing is found, return empty lists.

Return JSON: {"contacts":[{"person":"<name or 'Company'>","kind":"email|phone|main_line|contact_page|profile|address","value":"","url":""}]}`;
}

function targetStrategy(objective, filters, sub) {
  const SS = SUBSECTORS[sub];
  return `Task: turn a holding company's acquisition objective into a search strategy and web search queries to find small and mid-sized businesses it could buy. The holding company buys US ${THESIS.sector.toLowerCase()} firms in three segments, in priority order: ${THESIS.segments.map(x => `${x.label.toLowerCase()} (${x.short})`).join('; ')}. It does not buy ${THESIS.excluded.map(x => `${x.label} firms (${x.short})`).join(' or ')}, or recruiting firms, unless the objective explicitly asks for them.${SS && !SS.legacy ? '' : SS ? ` This search is about ${SS.short}.` : ''}

Objective: ${objective}
Optional filters from the user: ${j(filters || {})}

Follow the business type and niche named in the objective exactly; do not substitute a different kind of firm. Identify: how the firm gets paid (its revenue model: retainers, recurring programs or inspection cycles, time and materials, fixed fee, milestones, search fees or contract staffing; we prefer repeat or recurring clients and healthy cash conversion; Net 30 billing is fine; avoid firms whose model is mainly temporary-staffing payroll), the business type and niche, geography, size signals (employees, offices, revenue if public), ownership to look for (founder- or family-owned) and to avoid (PE-backed, public, part of a large group), signs the owner may sell (founder 25+ years in, retirement, no successor named, business listed for sale), and exclusions.

Then write 20 to 30 web search queries. Proprietary sourcing only: never use business-for-sale marketplaces, broker listings or deal platforms (BizBuySell, BizQuest, BusinessBroker.net, DealStream, Axial, Acquire.com, broker websites) as a source or a query; AION only approaches owners directly, before any sale is marketed. Required methods (use each at least three times, named exactly): "Public business records" (state business registries and OpenCorporates for incorporation date and status, e.g. site:opencorporates.com plus the niche and state), "Association directories" (member lists of the associations for this niche, e.g. ${SS ? SS.associations : 'ACEC for engineering, CSCMP, ASCM or ISM for supply chain and procurement, ASSP or NAEM for EHS and compliance, A2LA or ACIL for testing, vendor partner directories for implementation, IMC USA or ACG for consulting, NAPS, AESC or SHRM for recruiting'}), "Succession signals" (founder 25+ years, retirement, "founded in 19", no successor), "Owner-direct pages" (the firm's own about, history, team and leadership pages that name a founder-owner, e.g. "founded by" OR "founder and president" plus the niche and state), "Second-in-command hires" (founder-run firms in this niche that recently hired or advertised for a General Manager, COO or President, e.g. "named general manager" OR "hiring a COO" plus the niche). Other families: industry association member directories, "top firms" and award lists, company "about us" and leadership pages, founding-year and history pages, local business directories, conference sponsors and exhibitors, succession or retirement news, owner profiles, podcasts and interviews, conference speakers, local business journal lists, and long-tail combinations of niche plus city.

Also write 4 to 6 scoring criteria with a weight from 1 to 3 (3 = must have).

Return JSON:
{"summary":"<one sentence: what we are looking for>","profile":{"business_type":[""],"niche":[""],"geography":[""],"size":[""],"ownership":[""],"exclusions":[""]},
 "criteria":[{"key":"short_snake_case","label":"<plain words>","weight":3}],
 "queries":[{"q":"<search text>","family":"<family name>"}]}`;
}

// client acquisition for a firm that is not a recruiter: buyers of its own service, found from public triggers
function serviceClientStrategy(objective, filters, SV) {
  return `Task: turn a ${SV.short} firm's client acquisition objective into a search strategy and a set of web search queries.

Objective: ${objective}
Optional filters from the user: ${j(filters || {})}

Identify: the ideal client profile (usually ${SV.buyers}), industries, geography, the events that create a need for this service (${SV.triggers}), the decision-maker titles who buy it (${SV.buyerTitles}), and exclusions (companies large enough to do it in-house, competitors).

Then write 20 to 30 web search queries in distinct families that attack the problem from different directions. Do not write near-duplicates.
Required methods (use each at least three times, named exactly): "Trigger events" (press releases and news of the events above), "Leadership changes" (a new leader who would buy this service), "Association directories" (member lists where the buyers gather). Other families: industry directories and lists, new facilities and permits, public bid portals and project announcements, competitor client lists, local business clusters, and long-tail combinations of industry plus city.

Also write 4 to 7 scoring criteria the company should meet, each with a weight from 1 to 3 (3 = must have).

Return JSON:
{"summary":"<one sentence: what we are looking for>","profile":{"industries":[""],"signals":[""],"decision_makers":[""],"company_size":[""],"geography":[""],"exclusions":[""]},
 "criteria":[{"key":"short_snake_case","label":"<plain words>","weight":3}],
 "queries":[{"q":"<search text>","family":"<family name>"}]}`;
}
