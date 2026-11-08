import { segmentOf, inSegment } from '../thesis.mjs';
// "Why now": indirect public clues that something is about to happen (a firm will hire, a person will move, an owner will sell).
// Clues are inferred, never facts; they feed a separate timing badge so they never change the fit score.
export const SIGNALS = {
  // acquisition targets
  blind_listing: 'Blind-listing match', second_in_command: 'Second-in-command hire', stale_website: 'Website not updated', succession: 'Succession sign', neighbours_selling: 'Neighbours selling', next_chapter: '“Next chapter” talk',
  // clients
  import_surge: 'Import surge', ghost_job: 'Ghost job', empty_chair: 'Empty chair', new_site: 'New site or expansion', new_owner: 'New owner or funding', system_switch: 'System switch',
  // candidates
  boss_left: 'Boss left', passed_over: 'Passed over', company_acquired: 'Company acquired', site_closing: 'Site closing', raising_profile: 'Raising their profile',
  // from the radar's direct data sources
  // acquisition targets open to a partnership (grow without investment) rather than, or before, a sale
  partner_program: 'Partner or referral program', growth_hiring: 'Hiring to grow', new_service: 'New service or offer', ai_interest: 'Talks about AI', capacity_strain: 'Stretched for capacity', alliance: 'Announced a partnership', subcontracts: 'Subcontracts or white-labels', recap_interest: 'Open to investors',
  going_quiet: 'Website going quiet', career_length: 'Long career', partner_left: 'Partner left', exit_planning: 'Exit planning', lease_ending: 'Lease ending', licence_lapse: 'Licence lapsed', flat_firm: 'Flat for years', contract_win: 'Federal contracts up', reposted: 'Posted again', retirement: 'Retirement mentioned', leadership_change: 'Leadership change', layoffs: 'Layoffs or closure',
  founder_died: 'Founder died', exit_event: 'Exit-planning event', capstone: 'Career honour', owner_elsewhere: 'Owner busy elsewhere', fast_growth: 'Fast-growth list', first_cfo: 'Finance lead hired', new_office: 'New office or channel', partner_tier: 'Marketplace partner tier', scaling_pain: 'Scaling pains',
  other: 'Other sign',
};
// Which deal each clue points to, for a firm AION might buy: a majority sale, a growth partnership (no money in), or either.
export const PATH = {
  succession: 'sale', career_length: 'sale', exit_planning: 'sale', partner_left: 'sale', stale_website: 'sale', going_quiet: 'sale', lease_ending: 'sale', licence_lapse: 'sale', retirement: 'sale', neighbours_selling: 'sale', second_in_command: 'sale', founder_died: 'sale', exit_event: 'sale', capstone: 'sale', owner_elsewhere: 'sale',
  next_chapter: 'both', flat_firm: 'both', recap_interest: 'both',
  partner_program: 'partner', growth_hiring: 'partner', new_service: 'partner', ai_interest: 'partner', capacity_strain: 'partner', alliance: 'partner', subcontracts: 'partner', new_site: 'partner', contract_win: 'partner', fast_growth: 'partner', first_cfo: 'partner', new_office: 'partner', partner_tier: 'partner', scaling_pain: 'partner',
};
// Proprietary only: a firm already listed for sale on a marketplace or broker site is not an AION deal, and those pages are never a source.
export const MARKETPLACE = /(^|\.)(bizbuysell|bizquest|businessbroker|businessesforsale|dealstream|axial|acquire|flippa|empireflippers|loopnet|crexi|sunbeltnetwork|transworldbusinessadvisors|tworld|murphybusiness|vrbusinessbrokers|firstchoicebusinessbrokers|benchmarkintl|bizben|globalbx|mergernetwork|dealnexus|smergers|microacquire|quietlight|feinternational|websiteclosers|tranzacts|calhounco|ibba)\.(com|net|org|co|io|biz)$/i;
export const isMarketplace = u => { try { return MARKETPLACE.test(new URL(String(u)).hostname.replace(/^www\./, '')); } catch { return false; } };
const LISTING_TEXT = /\b(for sale|blind listing|business[- ]for[- ]sale|listed (it )?for sale|asking price|broker listing|teaser)\b/i;
/** Listed publicly for sale (so not proprietary): a likely blind-listing match, a marketplace website, or a clue citing a listing page. */
export const listedFor = (raw, e = {}) => isMarketplace(e.website ? (/^https?:/.test(e.website) ? e.website : `https://${e.website}`) : '') ||
  (raw || []).some(x => x && x.direction !== 'against' && ((x.signal || x.key) === 'blind_listing' ? x.confidence !== 'possible' : isMarketplace(x.url) && LISTING_TEXT.test(String(x.text || ''))));

// AION's niche = the v4.0 buy box: ecommerce consulting (retail placement, marketplace agencies, strategy & analytics).
// One classifier in thesis.mjs decides the segment, so Search, the ranking, Outreach and the docs agree.
export const segOf = e => segmentOf(e?.industry, e?.summary);
const OFF_NICHE = /\b(hvac|plumbing|roofing|electrical contract|landscap|restaurant|insurance|insurer|real estate|dental|medical practice|clinic|airline)\b/i;
/** Kept for older callers: any ecommerce or retail wording. The buy-box test is inNiche(). */
export const FOCUS = /\b(e-?commerce|retail placement|brand broker|amazon|walmart|target plus|tiktok shop|marketplace|omnichannel|digital shelf|retail media|cpg|consumer brand)/i;
/** In the buy box: an ecommerce consulting firm in one of the three segments (not a DTC growth agency, 3PL/ops advisor or recruiter). */
export const inNiche = e => { const what = `${e?.industry || ''} ${e?.summary || ''}`; if (!what.trim() || OFF_NICHE.test(e?.industry || '')) return false; return inSegment(segOf(e)); };

/** Deal intent per path: "high" = a likely exit plan/program, or 2+ clues with a recent or likely one, outweighing reasons to wait. */
export function intentOf(signals) {
  const out = {};
  for (const path of ['sale', 'partner']) {
    const mine = signals.filter(x => x.direction === 'for' && (PATH[x.key] === path || PATH[x.key] === 'both'));
    const score = +mine.reduce((t, x) => t + x.weight, 0).toFixed(2), likely = mine.filter(x => x.confidence === 'likely').length;
    const anchor = mine.some(x => x.confidence === 'likely' && (path === 'sale' ? ['exit_planning', 'recap_interest', 'succession'] : ['partner_program', 'alliance', 'recap_interest']).includes(x.key));
    const wait = path === 'sale' ? signals.filter(x => x.direction === 'against' && (x.age == null || x.age <= 12)).reduce((t, x) => t + x.weight, 0) : 0;
    const level = !mine.length ? 'none' : (anchor || (mine.length >= 2 && likely >= 1 && score >= 1.2)) && wait < score ? 'high' : wait >= score ? 'low' : 'some';
    out[path] = { level, score, count: mine.length, keys: [...new Set(mine.map(x => x.key))] };
  }
  const { sale, partner } = out, rank = { high: 3, some: 2, low: 1, none: 0 };
  out.lean = sale.level === 'none' && partner.level === 'none' ? 'none' : rank[sale.level] === rank[partner.level] ? (sale.score >= partner.score ? 'sale' : 'partner') : rank[sale.level] > rank[partner.level] ? 'sale' : 'partner';
  out.high = sale.level === 'high' || partner.level === 'high';
  return out;
}
const STATE = new Set(['stale_website', 'succession', 'going_quiet', 'partner_program', 'subcontracts', 'capacity_strain', 'partner_tier', 'career_length', 'next_chapter']);
export const BADGES = { act: 'Act now', warm: 'Warming', early: 'Too early', none: 'No timing signs yet' };

// months since a "YYYY-MM" or "YYYY" date; null when unknown
function monthsAgo(d, now) {
  const m = String(d || '').match(/(\d{4})(?:-(\d{1,2}))?/); if (!m) return null;
  const y = +m[1], mo = m[2] ? +m[2] - 1 : 6;
  return Math.max(0, (now.getFullYear() - y) * 12 + now.getMonth() - mo);
}

// clues fade: last 3 months count fully, last year 60%, older 30%, undated 50%; "possible" counts 70% of "likely"
export function timing(raw, now = new Date()) {
  // the AI sometimes files a non-clue, or a clue pointing the other way: drop the first, flip the second
  const NOT_A_CLUE = /\b(not a (clue|sign|signal)|no (clue|sign|signal)s? (of|that)|nothing in the sources|no evidence (of|that)|found no|no matching|did not find|could not find|not (a )?recent|this is not|is itself an acquirer|however,)/i;
  const ACTIVE = /\b(actively|launch(ed|es|ing)?|new (ai )?(product|feature|release)s?|recently (released|updated|launched)|continuing (maintenance|development)|regular(ly)? (updates|releases))\b/i;
  const listed = listedFor(raw);
  // marketplace and broker-listing pages are never a source (proprietary deals only)
  raw = (raw || []).filter(x => x && (x.signal || x.key) !== 'blind_listing' && !isMarketplace(x.url));
  raw = (raw || []).filter(x => !(x && NOT_A_CLUE.test(String(x.text || '')))).map(x => x && ['product_slowing', 'issue_slowing', 'stale_website', 'going_quiet'].includes(x.signal || x.key) && ACTIVE.test(String(x.text || '')) ? { ...x, direction: 'against' } : x);
  // the same clue found twice (a re-scan, or the site and the in-depth check quoting the same line) counts once
  const seenClue = new Set(), norm = t => String(t || '').toLowerCase().replace(/&#x27;|&amp;|[^a-z0-9]+/g, ' ').trim().slice(0, 90);
  raw = raw.filter(x => { if (!x) return false; const k1 = `${x.signal || x.key}|${norm(x.text)}`, k2 = `${x.signal || x.key}|${String(x.url || '').replace(/[#?].*$/, '')}|${norm(x.text).slice(0, 40)}`; if (seenClue.has(k1) || seenClue.has(k2)) return false; seenClue.add(k1); seenClue.add(k2); return true; });
  const signals = (raw || []).filter(x => x && x.text && x.url).map(x => {
    const key = SIGNALS[x.signal] ? x.signal : 'other', age = monthsAgo(x.date, now);
    // a stale website or a long-tenured founder describes how things are now, so its date is not a reason to fade it
    const fade = STATE.has(key) ? 0.6 : age == null ? 0.5 : age <= 3 ? 1 : age <= 12 ? 0.6 : 0.3;
    return { key, label: SIGNALS[key], source: x.source || 'web', text: String(x.text).replace(/&#x27;|&#39;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' '), url: x.url, date: x.date || '', age, direction: x.direction === 'against' ? 'against' : 'for', confidence: x.confidence === 'possible' ? 'possible' : 'likely', weight: +(fade * (x.confidence === 'possible' ? 0.7 : 1)).toFixed(2) };
  }).sort((a, b) => b.weight - a.weight);
  const pro = signals.filter(x => x.direction === 'for'), con = signals.filter(x => x.direction === 'against');
  const score = +pro.reduce((t, x) => t + x.weight, 0).toFixed(2), recent = pro.filter(x => x.age != null && x.age <= 3).length;
  // a reason to wait is weighed the same way; it wins only when it outweighs the clues for
  const conRecent = con.filter(x => x.age == null || x.age <= 12), against = +conRecent.reduce((t, x) => t + x.weight, 0).toFixed(2);
  const badge = (pro.length >= 3 && (recent >= 1 || score >= 2) && against < score / 2) ? 'act'
    : against > 0 && against >= score ? 'early' : pro.length ? 'warm' : 'none';
  const tail = { act: 'Worth a call this month.', warm: 'Worth watching.', early: `Check back later: ${conRecent[0]?.text || ''}`.trim().slice(0, 140), none: '' }[badge];
  const cut = t => { t = t.replace(/\.$/, ''); return t.length > 110 ? t.slice(0, 110).replace(/\s+\S*$/, '') + '…' : t; };
  const whyNow = pro.length || conRecent.length ? `${pro.slice(0, 2).map(x => x.text.toLowerCase().startsWith(x.label.toLowerCase().split(' ')[0]) ? cut(x.text) : `${x.label}: ${cut(x.text)}`).join('; ')}${pro.length ? (cut(pro[Math.min(1, pro.length - 1)].text).endsWith('…') ? ' ' : '. ') : ''}${tail}` : '';
  const intent = signals.some(x => PATH[x.key]) ? intentOf(signals) : null;
  return { badge, label: BADGES[badge], score, against, recent, listed, signals: signals.map(x => PATH[x.key] ? { ...x, path: PATH[x.key] } : x), whyNow, intent };
}
