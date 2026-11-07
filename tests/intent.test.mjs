import test from 'node:test'; import assert from 'node:assert/strict';
import { timing, intentOf, inNiche, PATH } from '../lib/search/timing.mjs';
import { headlineEvents } from '../lib/search/radar.mjs';
import { draftPrompt } from '../lib/outreach/outreach.mjs';

const now = new Date('2026-11-05');
const sig = (signal, extra = {}) => ({ signal, text: `${signal} seen`, url: `https://x.com/${signal}`, confidence: 'likely', ...extra });

test('partnership clues give high partner intent, sale clues stay separate', () => {
  const t = timing([sig('partner_program'), sig('growth_hiring', { date: '2026-10' }), sig('succession', { confidence: 'possible' })], now);
  assert.equal(t.intent.partner.level, 'high');
  assert.equal(t.intent.sale.level, 'some');
  assert.equal(t.intent.lean, 'partner');
  assert.ok(t.signals.every(x => x.path));
});

test('a blind listing is not proprietary (no intent, firm set aside); a named successor pulls sale intent down', () => {
  assert.equal(timing([sig('blind_listing')], now).intent, null);
  assert.equal(timing([sig('blind_listing')], now).listed, true);
  const t = timing([sig('succession', { date: '2026-10', confidence: 'possible' }), { ...sig('other', { date: '2026-10' }), direction: 'against' }], now);
  assert.equal(t.intent.sale.level, 'low');
});

test('"both" clues count toward each path; clients and candidates get no intent', () => {
  const I = intentOf(timing([sig('recap_interest')], now).signals);
  assert.equal(I.sale.level, 'high'); assert.equal(I.partner.level, 'high');
  assert.equal(timing([sig('ghost_job'), sig('boss_left')], now).intent, null);
  assert.equal(PATH.next_chapter, 'both');
});

test('niche = the v4.0 buy box: ecommerce consulting segments, not DTC agencies, 3PL advisors, recruiters or HVAC', () => {
  assert.ok(inNiche({ company: 'A', industry: 'Food and beverage brokerage / sales agency for natural brands' }));
  assert.ok(inNiche({ company: 'B', industry: 'Amazon and Walmart.com marketplace agency' }));
  assert.ok(inNiche({ company: 'C', industry: 'Ecommerce strategy and analytics consultancy for CPG brands' }));
  assert.ok(!inNiche({ company: 'D', industry: 'Paid social and SEO agency for DTC brands' }));
  assert.ok(!inNiche({ company: 'E', industry: 'Supply chain and 3PL consulting' }));
  assert.ok(!inNiche({ company: 'F', industry: 'Retained executive search' }));
  assert.ok(!inNiche({ company: 'Cool Air HVAC', industry: 'HVAC installation and repair' }));
});

test('headlines: partnerships and launches are partner clues for firms to buy only', () => {
  const items = [{ title: 'Acme Logistics partners with Fulfill to add 3PL network', url: 'https://n.com/1', date: '2026-09' }, { title: 'Acme Logistics launches new AI practice', url: 'https://n.com/2', date: '2026-10' }];
  assert.deepEqual(headlineEvents('target', 'Acme Logistics', items).map(x => x.signal), ['alliance', 'new_service']);
  assert.equal(headlineEvents('client', 'Acme Logistics', items).length, 0);
});

test('a partnership pitch changes the draft goal; ownership stays the default', () => {
  const me = { name: 'Mohil Gupta' };
  assert.match(draftPrompt('target', 'Owner at Acme', [], me, null, 'partner'), /growth partnership/);
  assert.match(draftPrompt('target', 'Owner at Acme', [], me, null, 'sale'), /long-term owner who may want to buy/);
});

test('headline must be about this firm doing something, not a namesake', async () => {
  const { aboutFirm } = await import('../lib/search/radar.mjs');
  assert.ok(aboutFirm('Harborview', 'Harborview Associates Names Jane Doe President'));
  assert.ok(aboutFirm('Northfield Consulting', 'Northfield Consulting Group and Acme Software Announce Strategic Partnership'));
  assert.ok(!aboutFirm('Harborview', 'Harborview Live! expansion nears completion'));
  assert.ok(!aboutFirm('MGT', 'MGT Foods Expands in Monmouth'));
  assert.ok(!aboutFirm('Southern Air', 'China Southern Airlines expand codeshare'));
});

test('a clue that argues against itself is dropped', () => {
  const t = timing([sig('blind_listing', { text: 'One search for firms for sale found no matching blind listing.' })], now);
  assert.equal(t.signals.length, 0);
});
