// Run with: node tests/ui/driver.mjs http://localhost:<test port> tests/ui/tabs.js (workspace copy; also run it on an empty workspace for the first-run tab).
let P = 0, F = 0; const ok = (n, c, x = '') => { c ? P++ : F++; log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + String(x).slice(0, 140) : '')); };
const D = '/private/tmp/claude-501/-Users-mohil/4f018b2e-d3ba-4a10-b6be-8fb16b2be6ab/scratchpad/shots/';
const vis = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; })()`);
await nav(); await ev(`localStorage.setItem('aion.app','ps')`); await nav(); await sleep(3500);
const empty = await ev(`document.body.dataset.firstrun === '1'`);
const tab = () => ev(`document.querySelector('[data-pstab].on')?.dataset.pstab`);
if (empty) {
  ok('Fresh install opens on Find more companies', (await tab()) === 'find', await tab());
  ok('Fresh install: the search box and Search button are visible', await vis('#ps-obj') && await vis('#ps-run'));
  await shot(D + 'tabs-empty.png');
} else {
  ok('Opens on the tab that needs you', ['out', 'companies'].includes(await tab()), await ev(`document.querySelector('.pstabs').innerText.replace(/\\n/g,' ')`));
  await shot(D + 'tabs-out.png');
  await ev(`document.querySelector('[data-pstab=companies]').click()`); await sleep(600);
  ok('Companies tab: the list shows, outreach and the search form do not', await vis('[data-testid=all-firms]') && !(await vis('#psout [data-testid=outreach]')) && !(await vis('[data-testid=find-more]')));
  await shot(D + 'tabs-companies.png');
  await ev(`document.querySelector('[data-pstab=find]').click()`); await sleep(600);
  ok('Find tab: only the search form and past searches show', await vis('#ps-obj') && await vis('#ps-run') && !(await vis('[data-testid=all-firms]')) && !(await vis('#psout [data-testid=outreach]')));
  await shot(D + 'tabs-find.png');
  const opened = await ev(`(() => { const r = document.querySelector('.findmore tr[data-open], .findmore [data-open]'); if (!r) return false; r.click(); return true; })()`); await sleep(2500);
  if (opened) {
    ok('Opening a past search shows it, with the tabs out of the way', await ev(`document.body.dataset.psview === 'search'`) && !(await vis('.pstabs')) && await ev(`(document.querySelector('#psown')?.innerText || '').length > 200`));
    await ev(`document.querySelector('#ps-back')?.click()`); await sleep(2500);
    ok('Back returns to the Find tab', (await tab()) === 'find' && await vis('#ps-obj'), await tab());
  }
  await ev(`document.querySelector('[data-pstab=out]').click()`); await sleep(600);
  ok('Outreach tab: the outreach list shows and the companies do not', await vis('#psout [data-testid=outreach]') && !(await vis('[data-testid=all-firms]')));
  await ev(`document.querySelector('#psout [data-open]')?.click()`); await sleep(2200);
  ok('A draft takes the whole page, tabs hidden', await vis('[data-testid=out-item]') && !(await vis('.pstabs')));
  await ev(`document.querySelector('#oback').click()`); await sleep(2200);
  ok('Back from a draft returns to the Outreach tab', (await tab()) === 'out' && await vis('#psout [data-testid=outreach]'), await tab());
  await nav(); await sleep(3000);
  ok('After a reload it still opens sensibly', !!(await tab()));
}
log(`\n${P} passed, ${F} failed`);
