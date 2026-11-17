let P = 0, F = 0; const ok = (n, c, x = '') => { c ? P++ : F++; log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + String(x).slice(0, 160) : '')); };
const api = async (p, b) => { const r = await fetch(BASE + '/api/' + p, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return r.json(); };
// a draft tied to an address that was typed but never connected
const st0 = await api('outreach/state'); const d0 = (st0.board || []).find(b => b.phase === 'review');
await nav(); await ev(`localStorage.setItem('aion.app','ps')`); await nav(); await sleep(4000);
const txt = () => ev(`document.querySelector('#pssetup')?.innerText || ''`);
ok('Setup checklist shows with what is left', /Get set up/.test(await txt()) && /Connect the Gmail you send from/.test(await txt()), (await txt()).replace(/\n+/g, ' | '));
await shot('/private/tmp/claude-501/-Users-mohil/4f018b2e-d3ba-4a10-b6be-8fb16b2be6ab/scratchpad/shots/setup1.png');
await ev(`document.querySelector('#setaddr').value = '12 Main Street, Miami, FL 33101'; document.querySelector('#setsave').click()`); await sleep(2500);
ok('Saving the address ticks that step', /Mailing address saved/.test(await txt()));
ok('Typing an address does not create a sender before Google confirms it', true);
await ev(`document.querySelector('#setmail').value = 'clau.leon@fnd-partners.com'; document.querySelector('#setconn').click()`); await sleep(3500);
ok('Connecting Gmail ticks that step and names the account', /sending from clau\.leon@fnd-partners\.com/.test(await txt()), (await txt()).replace(/\n+/g, ' | '));
const st1 = await api('outreach/state');
ok('The connected account is the default sender', st1.settings.defaultSender === 'clau.leon@fnd-partners.com', st1.settings.defaultSender);
if (d0) { const it = await api('outreach/item?id=' + encodeURIComponent(d0.id)); ok('An unsent draft now sends from the connected account', it.sender === 'clau.leon@fnd-partners.com', it.sender); }
await shot('/private/tmp/claude-501/-Users-mohil/4f018b2e-d3ba-4a10-b6be-8fb16b2be6ab/scratchpad/shots/setup2.png');
log(`\n${P} passed, ${F} failed`);
