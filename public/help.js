// Help: how to use each part of AION and what to do when something goes wrong, inside the app.
const TROUBLE = [
  ['A step says no AI is ready', 'Open Settings. Log in to Claude Code in a terminal (run <code>claude</code>) or Codex (<code>codex login</code>), or save an Anthropic or OpenAI key, then press Test.'],
  ['“Usage limit” or “rate limit”', 'Your plan ran out for now; the message says when it resets. AION skips that AI for an hour and uses the next ready one, so add a second option in Settings to keep working.'],
  ['An analysis or search stopped part way', 'Nothing is lost. Click Analyze or Try again. The run log (“What the AI was sent”) and the step list under each search show exactly what failed.'],
  ['A search shows “Partly complete”', 'Some web searches didn’t finish; results come only from those that did. Run it again later for full coverage.'],
  ['A search finds nothing', 'Widen the region or add adjacent niches, or start from an example. Results that fail a must-have are kept but scored 40% or less.'],
  ['The books upload looks wrong', 'Use QuickBooks → Reports → General Ledger, 24–36 months, all accounts, exported to Excel. For PDFs (a CIM), open “Questions & checks” to see what was read; full years and a trailing-12-month column are never added together.'],
  ['The PDF or Excel download doesn’t appear', 'Wait for “Building…” to finish; a message in the corner confirms it or says what went wrong. The 1-page PDF needs Google Chrome installed.'],
  ['Outreach says a sender isn’t connected', 'Open Search &amp; Outreach › Inboxes and settings and press Connect, then sign in as that Gmail account in the browser tab. If Google says the app isn’t verified or the account isn’t allowed, add that address as a test user on the Google app’s consent screen, then try again.'],
  ['An outreach draft says “Check before sending”', 'A number or name in the draft isn’t in what AION found about that firm. Fix or remove it, or confirm it yourself before sending.'],
  ['The page is blank or stuck', 'Reload the page (⌘R). Work is saved as you go. If the app itself stopped, run <code>start-aion.sh</code> again; if it says the port is in use, AION is already running.'],
];

export function mountHelp(main) {
  main.innerHTML = `<div class="ps help">
    <h1>How to use AION</h1>
    <p class="lede2">AION buys US ecommerce consulting firms (retail placement first, then marketplace agencies, then ecommerce strategy and analytics) with about $500K–$5M yearly profit. Find the owners, write to them, turn a firm’s books into a value-creation plan, and draft RFP answers. Everything stays on this computer except the prompts sent to the AI chosen in Settings.</p>
    <div class="helpgrid">
      <section class="panel"><h3>Value Creation <span class="note">a few minutes</span></h3><ol>
        <li>Drop in the books: QuickBooks General Ledger (best), Profit and Loss Detail, or PDF statements / a CIM.</li>
        <li>Watch it work, then answer the biggest unknown (is that payroll line the owner?). Numbers update straight away.</li>
        <li>Tabs: AION fit (thesis check with evidence), Plan (ranked actions, 100 days), Trends, Deal (price, loan and returns; a loss-making company can be priced on revenue), After you buy, Questions & checks.</li>
        <li>1-page PDF and Excel export the result.</li></ol><button class="ghost sm" data-go="vc">Open Value Creation</button></section>
      <section class="panel"><h3>Search &amp; Outreach: owners and searches <span class="note">4–8 minutes</span></h3><ol>
        <li><b>Owners to contact</b> (top of the page): every ecommerce consulting firm your searches found, in one ranked list. Filter by segment (Retail placement, Marketplace, Strategy & analytics) or by Not contacted, High intent, Sale or Partnership. Press <b>Write outreach</b> on a row, or <b>Open in Outreach</b> once it has started; Outreach shows the same list in the same order.</li>
        <li>Pick a search: <b>Find firms to buy</b>, <b>Find brands</b> that need retail or marketplace help, or <b>Find people</b> for a hire.</li>
        <li>Describe it in a sentence and press Search. 20–40 web searches run; the best results are checked in depth.</li>
        <li>Every fact links to its source; contacts appear only if found word for word on a page; timing badges show why now.</li>
        <li>Each firm shows <b>why now</b> (signs it may sell a majority or want a growth partner) and the <b>offer</b> to make. Firms outside the buy box (outside the US, PE-backed or part of a group, too big or too small, DTC growth agencies, 3PL or operations advisors, recruiters) are set aside with the reason. <b>Refresh signals</b> reads every firm’s own site and headlines again.</li>
        <li><b>Brand demand radar</b>: consumer brands that just raised money, won a retailer, hired a sales or ecommerce lead or opened a marketplace store. These are the clients AION’s firms serve.</li>
        <li>Save, reject, set deal stages, Watch weekly, or start a linked search from any result.</li></ol><button class="ghost sm" data-go="ps">Open Search &amp; Outreach</button></section>
      <section class="panel"><h3>Search &amp; Outreach: writing to owners <span class="note">a minute per firm</span></h3><ol>
        <li>Under <b>Inboxes and settings</b>, connect your Gmail inboxes (the first in AION_SENDERS is the default; the second is optional), and add your mailing address (required on outreach email).</li>
        <li>In <b>Owners to contact</b>, filter by offer (<b>Full buyout</b>, <b>Majority stake</b>, <b>Partnership</b>, <b>Their choice</b>) and press <b>Write outreach</b> on a firm. Each draft is written for that offer and that firm; switch the offer on the firm’s page and every draft is rewritten. AION writes a first email, two follow-ups, a letter, call notes and a contact-form message from everything it knows about that firm, and shows which facts it used.</li>
        <li>Edit, pick who it’s from and to, and press <b>Send…</b>: you see exactly what goes out and confirm it. Or save it to Gmail Drafts. Follow-ups wait for your OK too.</li>
        <li>Tick several firms and press <b>Write outreach for N</b>; then <b>Review drafts one by one</b>. No email found? <b>Find a verified email</b> (needs a People Data Labs or Apollo key) or download the <b>letter PDF</b> on AION letterhead.</li>
        <li>Replies, bounces and “no thanks” are checked every 10 minutes, with a Mac notification. <b>Draft my reply</b> offers your real open times from your calendars; pick one and <b>Send calendar invite</b> (with a Google Meet link).</li>
        <li>After the call, <b>Deal steps</b>: the NDA (PDF), the books request, their files opened in Value Creation in one click, then a non-binding LOI written from that analysis. Have a lawyer review the NDA and LOI.</li>
        <li><b>Results</b> shows who you contacted, reply rate, interest, calls and which openers get answers. A “no thanks” is never emailed again; at most 20 emails a day per sender.</li></ol><button class="ghost sm" data-go="out">Open Search &amp; Outreach</button></section>
      <section class="panel"><h3>Settings: which AI</h3><ul>
        <li>Claude Code is used first. Codex, an Anthropic key or an OpenAI key can back it up; when one hits its usage limit the next takes over.</li>
        <li>Press <b>Test</b> to check one with a tiny request.</li>
        <li>Keys stay in <code>workspace/keys.json</code>, readable only by your user.</li></ul><button class="ghost sm" data-go="settings">Open Settings</button></section>
    </div>
    <h2 class="h2">If something goes wrong</h2>
    <div class="faq">${TROUBLE.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    <p class="note">AION runs in the background from login (so replies and notifications keep coming); turn that off with <code>./always-on.sh off</code> in the demo folder. Or double-click <code>start-aion.sh</code> (or run <code>npm start</code>) and open http://localhost:8765. Data lives in <code>workspace/</code>; copy it to back up.</p>
  </div>`;
  main.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { let go = b.dataset.go; if (go === 'out' || go === 'ps') { go = 'ps'; } document.querySelector(`[data-app="${go}"]`)?.click(); });
}
