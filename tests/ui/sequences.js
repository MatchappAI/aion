// Run with: node tests/ui/driver.mjs http://localhost:<test port> tests/ui/sequences.js (fake Gmail, AI off, workspace copy).
// Action sequences a real person might take, checked against the server's saved state (test copy, fake Gmail, AI off).
let P = 0, F = 0; const ok = (n, c, x = '') => { c ? P++ : F++; log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + String(x).slice(0, 160) : '')); };
const api = async (p, b) => { const r = await fetch(BASE + '/api/' + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return r.json(); };
const item = id => api('outreach/item?id=' + encodeURIComponent(id));
const openItem = async id => { await nav(); await ev(`localStorage.setItem('aion.app','ps')`); await nav(); await sleep(2500); await ev(`document.querySelector('#psout [data-open="${id}"]')?.click()`); await sleep(2200); };
const status = () => ev(`document.querySelector('[data-testid=out-status]')?.innerText || ''`);
const st = await api('outreach/state'); const ids = (st.board || []).filter(b => b.id && b.phase === 'review').map(b => b.id);
const items = await Promise.all(ids.map(item));
const mail = items.find(i => /@/.test(i.to || '') && !i.messages.length), nomail = items.find(i => !i.to && !i.messages.length);
ok('test data: a draft with an email and one without', mail && nomail);

// 1. Mark letter mailed: Cancel on the note prompt does nothing; OK marks it
await openItem(mail.id); await ev(`document.querySelector('[data-testid=out-more]').open = true`); await ev(`document.querySelector('.omenu [data-kind=letter]').click()`); await sleep(1800);
DLG.accept = false; await ev(`document.querySelector('#omark').click()`); await sleep(1200);
ok('Cancel on “Mark letter as mailed” does not mark it', !(await item(mail.id)).messages.some(m => m.kind === 'letter'));
DLG.accept = true; DLG.text = 'Posted today'; await ev(`document.querySelector('#omark').click()`); await sleep(1800);
const afterMail = await item(mail.id);
ok('OK on “Mark letter as mailed” marks it, with the note', afterMail.messages.some(m => m.kind === 'letter' && m.note === 'Posted today'));
ok('Status then says the letter is marked as mailed', /Letter marked as mailed/.test(await ev(`document.querySelector('[data-testid=out-sent]')?.innerText || ''`)));

// 2. Review queue: Skip to next moves forward; Back returns to the list
DLG.accept = false;
await openItem(nomail.id); const p1 = await ev(`document.querySelector('[data-testid=out-progress]')?.innerText || ''`);
const hasNext = await ev(`!!document.querySelector('#onextq')`);
if (hasNext) { await ev(`document.querySelector('#onextq').click()`); await sleep(2200); const p2 = await ev(`document.querySelector('[data-testid=out-progress]')?.innerText || ''`); ok('Skip to next moves forward in the queue', p1 !== p2 && /of/.test(p2), `${p1} → ${p2}`); }
await ev(`document.querySelector('#oback').click()`); await sleep(2000);
ok('Back returns to the list', await ev(`!!document.querySelector('#psout') && !document.querySelector('[data-testid=out-item]')`));

// 3. “Write the drafts again”: Cancel keeps the drafts
await openItem(nomail.id); await ev(`document.querySelector('[data-testid=out-more]').open = true`);
DLG.accept = false; await ev(`document.querySelector('#orewrite2').click()`); await sleep(1500);
ok('Cancel on “Write the drafts again” keeps the drafts', (await item(nomail.id)).phase === 'review');

// 4. Using an unverified guess: To is filled, but it is never presented as verified or ready
const g = (nomail.contacts.emails || []).find(c => c.likely && !c.verified);
if (g) {
  await ev(`document.querySelector('[data-testid=out-more]').open = true`); await ev(`document.querySelector('[data-uselikely]').click()`); await sleep(2200);
  ok('Choosing the guess fills To with it', (await item(nomail.id)).to === g.email);
  ok('The status says the address is not verified', /not verified/.test(await status()), await status());
  ok('Find contact details stays the main action; sending is an explicit “anyway”', await ev(`!!document.querySelector('.oprimary #ofind') && /anyway/.test(document.querySelector('#osend')?.innerText || '')`));
}

// 5. Delete: Cancel keeps it
DLG.accept = false; await ev(`document.querySelector('[data-testid=out-more]').open = true`); await ev(`document.querySelector('#odel')?.click()`); await sleep(1500);
ok('Cancel on Delete keeps the outreach', !!(await item(nomail.id)).id);

// 6. With Gmail connected (fake): Send is the main action; schedule then cancel; a double click opens one confirm
const other = items.find(i => i.id !== mail.id && /@/.test(i.to || '') && !i.messages.length && !i.addr?.block);
if (other) {
  await api('outreach/connect', { email: other.sender || 'claudia@example.test' }); await api('outreach/settings', { address: '1 Test Way, Anytown, VA 00000' });
  await openItem(other.id);
  ok('Gmail connected: Send… is the main action', await ev(`!!document.querySelector('.oprimary #osend') && !document.querySelector('.oprimary #ocopy')`));
  DLG.accept = false; dialogs.length = 0;
  await ev(`(() => { const b = document.querySelector('#osend'); b.click(); b.click(); })()`); await sleep(2500);
  ok('A double click on Send asks once and sends nothing on Cancel', dialogs.length === 1 && !(await item(other.id)).messages.length, `${dialogs.length} dialogs`);
  await ev(`document.querySelector('[data-testid=out-more]').open = true`);
  DLG.accept = true; await ev(`document.querySelector('#osched')?.click()`); await sleep(2500);
  const sc = await item(other.id);
  ok('Schedule (with OK) puts it in the schedule and nothing is sent yet', !!sc.scheduled?.email && !sc.messages.length);
  ok('Status says scheduled', /scheduled for/i.test(await status()), await status());
  await ev(`document.querySelector('#ounsched')?.click()`); await sleep(2000);
  ok('Cancel the scheduled send removes it', !(await item(other.id)).scheduled?.email);
}
log(`\n${P} passed, ${F} failed`);
