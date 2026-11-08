// Help: how to use each part of AION and what to do when something goes wrong, inside the app.
const TROUBLE = [
  ['A step says no AI is ready', 'Open Settings. Log in to Claude Code in a terminal (run <code>claude</code>) or Codex (<code>codex login</code>), or save an Anthropic or OpenAI key, then press Test.'],
  ['“Usage limit” or “rate limit”', 'Your plan ran out for now; the message says when it resets. AION skips that AI for an hour and uses the next ready one, so add a second option in Settings to keep working.'],
  ['An analysis or search stopped part way', 'Nothing is lost. Click Analyze or Try again. The Run log (in Value Creation’s side menu) and the step list under each search show exactly what failed.'],
  ['A search shows “Partly complete”', 'Some web searches didn’t finish; results come only from those that did. Run it again later for full coverage.'],
  ['A search finds nothing', 'Widen the region or add adjacent niches, or start from an example. Results that fail a must-have are kept but scored 40% or less.'],
  ['The books upload looks wrong', 'Use QuickBooks → Reports → General Ledger, 24–36 months, all accounts, exported to Excel. For PDFs (such as a seller’s information pack), open “Questions & checks” to see what was read; full years and a trailing-12-month column are never added together.'],
  ['The PDF or Excel download doesn’t appear', 'Wait for “Building…” to finish; a message in the corner confirms it or says what went wrong. The 1-page PDF needs Google Chrome installed.'],
  ['Outreach says a sender isn’t connected', 'Open Search &amp; Outreach › Inboxes and settings and press Connect, then sign in as that Gmail account in the browser tab. If Google says the app isn’t verified or the account isn’t allowed, add that address as a test user on the Google app’s consent screen, then try again.'],
  ['An outreach draft says “Check before sending”', 'A number or name in the draft isn’t in what AION found about that firm. Fix or remove it, or confirm it yourself before sending.'],
  ['The page is blank or stuck', 'Reload the page (⌘R). Work is saved as you go. If the app itself stopped, run <code>start-aion.sh</code> again; if it says the port is in use, AION is already running.'],
];

export function mountHelp(main) {
  main.innerHTML = `<div class="ps help">
    <h1>How to use AION</h1>
    <p class="lede2">AION buys US ecommerce consulting firms (retail placement, marketplace agencies, strategy and analytics) that make about $500K–$5M a year in profit. Use it to find owners, write to them, and turn a firm’s books into a plan. Everything stays on this computer.</p>
    <div class="helpgrid">
      <section class="panel"><h3>1. Find owners <span class="note">Search &amp; Outreach</span></h3><ol>
        <li><b>Owners to contact</b> lists only strong fits: a clear, sourced sign from the last 18 months that the owner wants to sell (said so, retirement, succession, the founder stepping back or having died) or asked for an investor. Seller intent reads <b>Confirmed</b>, <b>Documented transition</b> or <b>Speculative</b>; it is never a made-up probability.</li>
        <li>Each row shows the evidence with its source and date, fit and rough size, and the one <b>next step</b>. <b>Leads to research</b> below have supporting signs only; listed or broker-represented firms sit apart under <b>Marketed</b>.</li>
        <li>Open a firm and press <b>Research the founder and firm</b> for a sourced profile; ideas are marked as ideas.</li>
        <li>The offer is always a buyout: a <b>full buyout</b> by default, or a <b>majority stake</b> when the owner is clearly still building and would keep running it. A <b>partnership</b> appears only when the firm says it wants a partner or investor.</li>
        <li>To find more, use <b>Find more</b>: describe what you want in a sentence and press Search (4–8 minutes).</li>
        <li>Firms that don’t fit (too big, too small, owned by a bigger company) are set aside with the reason. <b>Firms that fit together</b> and <b>Who is consolidating</b> sit below the list.</li></ol><button class="ghost sm" data-go="ps">Open Search &amp; Outreach</button></section>
      <section class="panel"><h3>2. Write to them <span class="note">about a minute per firm</span></h3><ol>
        <li>Once: open <b>Inboxes and settings</b>, connect your Gmail and add your mailing address.</li>
        <li>Press <b>Write outreach</b> on a firm. AION writes a first email, two follow-ups, a letter, call notes and a discreet note for their shared inbox, only from facts it found.</li>
        <li>Each draft shows its kind (A–E: said they want to sell, exploring succession, no interest known, asked for a partner, marketed), a quality check by a second reader, and the facts it used. Low-confidence drafts are marked, never padded with invented details.</li>
        <li>Read it, edit it, press <b>Send…</b>, or pick a time and press <b>Schedule…</b> (follow-ups too; a reply cancels them). Nothing ever goes out without your OK.</li>
        <li>A note about selling only goes to the owner, never to a shared inbox like info@. Press <b>Find the owner’s email</b>: AION reads their website, asks Hunter.io (free key in Settings), then suggests a likely address in the firm’s own format. You choose whether to use it; if it bounces, AION offers the next one. Or mail the letter.</li>
        <li>Replies are checked every 10 minutes. AION suggests open times from your calendar and sends the invite when you pick one.</li>
        <li>After a good call: NDA, books request, then a letter of intent (LOI). Have a lawyer review the NDA and LOI.</li></ol><button class="ghost sm" data-go="ps">Open Search &amp; Outreach</button></section>
      <section class="panel"><h3>3. Check a firm’s numbers <span class="note">Value Creation</span></h3><ol>
        <li>Drop in the books: a QuickBooks General Ledger works best; a Profit and Loss or a PDF also works.</li>
        <li>AION shows the firm’s real yearly profit and the changes that would raise it, easiest first.</li>
        <li>Four tabs: Real profit, Price &amp; returns, Plan, and Questions &amp; checks (the fit with what AION buys and what to ask the seller).</li>
        <li>Download a 1-page PDF or Excel file.</li></ol><button class="ghost sm" data-go="vc">Open Value Creation</button></section>
      <section class="panel"><h3>Settings: which AI</h3><ul>
        <li>AION uses Claude Code first. If it runs out, the next option you set up takes over.</li>
        <li>Press <b>Test</b> to check one.</li></ul><button class="ghost sm" data-go="settings">Open Settings</button></section>
    </div>
    <h2 class="h2">If something goes wrong</h2>
    <div class="faq">${TROUBLE.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    <p class="note">AION keeps running in the background so replies keep coming in. Your data is in the <code>workspace</code> folder; copy it to back up.</p>
  </div>`;
  main.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { let go = b.dataset.go; if (go === 'out' || go === 'ps') { go = 'ps'; } document.querySelector(`[data-app="${go}"]`)?.click(); });
}
