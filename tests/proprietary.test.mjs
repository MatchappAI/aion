// Proprietary sourcing, the owner ranking and free email finding from the firm's own website.
import test from 'node:test'; import assert from 'node:assert/strict';
import { timing, isMarketplace, listedFor, inNiche } from '../lib/search/timing.mjs';
import { rankOne, rankAll } from '../lib/search/rank.mjs';
import { emailsIn, whose, siteContacts } from '../lib/outreach/sitecontacts.mjs';

const sig = (signal, extra = {}) => ({ key: signal, signal, text: `${signal} seen`, url: `https://firm.com/${signal}`, confidence: 'likely', direction: 'for', ...extra });

test('marketplace and broker pages are never a source', () => {
  for (const u of ['https://www.bizbuysell.com/Business-Opportunity/x', 'https://axial.net/forum', 'https://dealstream.com/l', 'https://acquire.com/startup/1', 'https://www.loopnet.com/x']) assert.ok(isMarketplace(u), u);
  for (const u of ['https://firm.com', 'https://opencorporates.com/x', 'https://news.google.com/x']) assert.ok(!isMarketplace(u), u);
  const t = timing([sig('succession', { url: 'https://www.bizbuysell.com/x' }), sig('partner_program')]);
  assert.deepEqual(t.signals.map(x => x.key), ['partner_program']);
  assert.ok(listedFor([sig('succession', { url: 'https://www.bizbuysell.com/x', text: 'Business for sale matching this firm' })]));
  assert.ok(listedFor([], { website: 'https://www.bizbuysell.com/x' }));
});

test('niche covers ecommerce consulting and retail placement, not off-niche trades', () => {
  assert.ok(inNiche({ industry: 'Retail placement agency getting CPG brands into Walmart and Target' }));
  assert.ok(inNiche({ industry: 'Amazon and Walmart marketplace management agency' }));
  assert.ok(!inNiche({ industry: 'Residential HVAC services' }));
});

test('rank: many kinds of signal, fit and reach beat one loud signal; every firm is a buyout unless it asks for a partner', () => {
  const many = { company: 'A', score: 70, industry: 'Ecommerce consulting agency', owner: 'Jane Roe', contactInfo: [{ kind: 'email', value: 'jane@a.com' }], timing: { signals: [sig('succession'), sig('exit_planning'), sig('partner_program'), sig('growth_hiring', { date: '2026-10' })] } };
  const one = { company: 'B', score: 40, industry: 'Ecommerce consulting agency', timing: { signals: [sig('stale_website')] } };
  const a = rankOne(many), b = rankOne(one);
  assert.ok(a.score > b.score, `${a.score} > ${b.score}`);
  assert.equal(a.approach, 'sale'); assert.equal(a.offer, 'full'); assert.equal(a.owner, 'Jane Roe'); assert.ok(a.parts.reach >= 10);
  // growth signs alone (hiring, a referral program) are not an ask for a partner: still a buyout
  const grow = rankOne({ company: 'G', score: 60, timing: { signals: [sig('partner_program'), sig('growth_hiring', { date: '2026-10' })] } });
  assert.equal(grow.approach, 'sale'); assert.equal(grow.offer, 'majority'); // owner still building → majority stake
  // no signs yet: still a buyout offer
  assert.equal(rankOne({ company: 'C', score: 50, timing: { signals: [] } }).offer, 'full');
  // the firm says it wants a growth partner: partnership
  const ask = rankOne({ company: 'D', score: 60, timing: { signals: [sig('recap_interest', { text: 'Founder says the firm is seeking a strategic growth partner to scale' })] } });
  assert.equal(ask.offer, 'partner'); assert.equal(ask.approach, 'partner');
});

test('rankAll sets listed firms aside and dedupes across searches', () => {
  const e = (id, company, extra = {}) => ({ id, company, website: `https://${company.toLowerCase()}.com`, scored: true, score: 60, industry: 'Retail placement consulting', timing: { signals: [sig('partner_program')] }, ...extra });
  const R = rankAll([{ id: 's1', mode: 'target', entities: [e('e1', 'Alpha'), e('e2', 'Listed', { listed: true }), e('e3', 'Beta', { decision: 'rejected' })] }, { id: 's2', mode: 'target', entities: [e('e1', 'Alpha')] }]);
  assert.deepEqual(R.ranked.map(x => x.name), ['Alpha']); assert.equal(R.ranked[0].rank, 1);
  assert.deepEqual(R.listed.map(x => x.name), ['Listed']);
});

test('emails are read only from the firm’s own site and domain, never guessed', async () => {
  assert.deepEqual(emailsIn('<a href="mailto:jane.roe@acme.com">x</a> bob [at] acme [dot] com noreply@acme.com x@gmail.com logo@2x.png', 'acme.com').sort(), ['bob@acme.com', 'jane.roe@acme.com']);
  assert.equal(whose('jroe@acme.com', ['Jane Roe']), 'Jane Roe'); assert.equal(whose('info@acme.com', ['Jane Roe']), null);
  const pages = { 'https://acme.com': '<a href="/contact-us">Contact</a> <a href="tel:+1 (410) 555-0100">call</a>', 'https://acme.com/contact-us': 'Email info@acme.com or jane@acme.com' };
  const r = await siteContacts('https://www.acme.com/', ['Jane Roe'], { fetcher: async u => pages[u] || null });
  assert.equal(r.emails[0].email, 'jane@acme.com'); assert.equal(r.emails[0].name, 'Jane Roe'); assert.equal(r.emails[0].url, 'https://acme.com/contact-us');
  assert.equal(r.phones[0].phone, '+1 (410) 555-0100');
  assert.equal(r.contactPage, 'https://acme.com/contact-us');
  assert.deepEqual((await siteContacts('acme.com', [], { fetcher: async u => u === 'https://acme.com' ? 'orders@acme.com info@acme.com' : null })).emails.map(x => x.email), ['info@acme.com', 'orders@acme.com']);
});

test('focus = ecommerce consulting and retail placement firms, not recruiters who serve retail', () => {
  const sig = [{ key: 'partner_program', text: 'x', url: 'https://f.com', direction: 'for' }];
  assert.equal(rankOne({ company: 'A', industry: 'Retail broker and integrated commerce agency for CPG brands', timing: { signals: sig } }).focus, true);
  assert.equal(rankOne({ company: 'B', industry: 'Executive recruiting for retail and consumer brands', timing: { signals: sig } }).focus, false);
});

test('the owner’s address wins over a general inbox; order, support and careers inboxes are never used', async () => {
  const { bestEmail, contactsFor } = await import('../lib/outreach/outreach.mjs');
  assert.equal(bestEmail([{ email: 'orders@x.com' }, { email: 'info@x.com' }, { email: 'jane@x.com', name: 'Jane Roe' }]).email, 'jane@x.com');
  assert.equal(bestEmail([{ email: 'orders@x.com' }, { email: 'hello@x.com' }]).email, 'hello@x.com');
  assert.equal(bestEmail([{ email: 'orders@x.com' }, { email: 'careers@x.com' }]), null);
  assert.equal(contactsFor({ contactInfo: [{ kind: 'email', value: 'orders@x.com' }, { kind: 'email', value: 'info@x.com' }] }).emails[0].email, 'info@x.com');
});

import { buyBox, headcount } from '../lib/search/buybox.mjs';
test('buy box: independent and the right size, or set aside', () => {
  assert.deepEqual(headcount('250-350+ staff, 3 offices'), { low: 250, high: 350 });
  assert.equal(headcount('directory shows 0 employees'), null);
  assert.equal(buyBox({ ownership: 'PE-backed', size: '40 staff' }).status, 'out');
  assert.equal(buyBox({ ownership: 'founder-owned', size: '400+ employees' }).status, 'out');
  assert.equal(buyBox({ ownership: 'founder-owned', size: 'About 3 employees' }).status, 'out');
  assert.equal(buyBox({ ownership: 'unknown (part of a larger group: acquired by X in 2022)', size: '' }).status, 'out');
  assert.equal(buyBox({ ownership: 'founder-owned', size: '51-200 employees (third-party)', location: 'Austin, TX' }).status, 'in');
  assert.equal(buyBox({ ownership: 'founder-owned', size: 'About 15 employees', location: 'Portland, Oregon' }).status, 'in');
  const c = buyBox({ ownership: 'unknown', size: 'Not stated' });
  assert.equal(buyBox({ ownership: 'founder-owned', size: 'About 15 employees', location: 'Brașov', website: 'shop.ro' }).status, 'out');
  assert.equal(c.status, 'check'); assert.deepEqual(c.reasons, ['Ownership not confirmed', 'US location not confirmed', 'Size not confirmed']);
});

test('buy box: headcount must fit $500K–$5M profit, not just 5–150 people', () => {
  const small = buyBox({ ownership: 'founder-owned', size: 'About 6 employees', location: 'Boca Raton, FL' });
  assert.equal(small.status, 'check'); assert.ok(small.reasons.some(r => /under \$500K profit/.test(r)));
  const wide = buyBox({ ownership: 'founder-owned', size: '106-500 employees', location: 'Nashville, TN' });
  assert.equal(wide.status, 'check'); assert.ok(wide.reasons.some(r => /too big/.test(r)));
  assert.equal(buyBox({ ownership: 'founder-owned', size: 'About 20 employees', location: 'Austin, TX' }).status, 'in');
});

test('two different firms found on the same news or directory site are never merged', async () => {
  const { siteOf, ownDomain } = await import('../lib/search/resolve.mjs');
  assert.equal(ownDomain('theshelbyreport.com', 'Fresh Pantry Sales'), false);
  assert.equal(ownDomain('northfieldbrokers.com', 'Northfield Brokers'), true);
  assert.equal(siteOf({ company: 'Acme Retail Partners', website: 'https://acmerp.com' }), 'acmerp.com'); // its own site, even if the name differs
  assert.equal(siteOf({ company: 'Acme Retail Partners', website: 'Not found in public sources reviewed.', domain: 'clutch.co' }), '');
  const e = (id, company) => ({ id, company, website: 'Not found in public sources reviewed.', domain: 'theshelbyreport.com', scored: true, score: 60, industry: 'Food broker, retail placement', timing: { signals: [] } });
  const R = rankAll([{ id: 's1', mode: 'target', entities: [e('e1', 'Fresh Pantry Sales'), e('e2', 'Harbor Food Brokers')] }], { niche: false });
  assert.equal(R.ranked.length + R.outside.length + R.offNiche.length, 2);
});
