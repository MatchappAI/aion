// Buy box v4.0: which segment a firm is in, and whether it is in the US. Shapes taken from real search results; names are placeholders.
import test from 'node:test'; import assert from 'node:assert/strict';
import { segmentOf, THESIS } from '../lib/thesis.mjs';
import { country, buyBox } from '../lib/search/buybox.mjs';
import { rankOne } from '../lib/search/rank.mjs';

test('segments: retail placement, marketplace, strategy & analytics', () => {
  for (const t of ['Food brokerage / sales and marketing agency (grocery retail)', 'Retail placement consulting / brand broker', 'Walmart/Sam\'s Club supplier consulting (data analytics, sales support)', 'Retail channel consulting and coaching that gets consumer product brands into major retailers', 'Costco-focused strategy, branding and broker group for emerging food and beverage brands'])
    assert.equal(segmentOf(t), 'retail_placement', t);
  for (const t of ['Amazon, Walmart and Chewy marketplace agency (PPC, DSP, listing optimization)', 'Walmart.com marketplace agency (launch, management, advertising)', 'Ecommerce marketplace and performance marketing agency (Amazon, Walmart, TikTok Shop, Google, Meta)', 'Amazon-focused ecommerce consultancy and marketplace agency'])
    assert.equal(segmentOf(t), 'marketplace', t);
  for (const t of ['Retail strategy consulting for retailers and brands, covering strategy and AI. It is not brand-to-retailer placement brokerage.', 'CPG strategy and brand consulting for emerging brands', 'Ecommerce strategy and analytics consultancy for CPG brands'])
    assert.equal(segmentOf(t), 'strategy', t);
});

test('excluded: DTC growth, automation shops, ops advisory, recruiters, software', () => {
  assert.equal(segmentOf('Digital marketing and PR agency (PR, SEO, paid media); Amazon Ads is a side service'), 'dtc');
  assert.equal(segmentOf('Ecommerce automation agency: Amazon FBA, Shopify dropshipping'), 'dtc');
  assert.equal(segmentOf('Ecommerce managed services and consulting (Shopify, Magento, WooCommerce, email, SEO)'), 'dtc');
  assert.equal(segmentOf('Workforce productivity and operational management consulting (retail, supply chain). Not retail placement.'), 'supply_chain'); // consulting: second tier (2026-11-08)
  assert.equal(segmentOf('3PL fulfillment services and warehousing'), 'ops'); // an operator: still out
  assert.equal(segmentOf('Lean manufacturing consulting for plants'), 'manufacturing');
  assert.equal(segmentOf('Revenue growth management and trade promotion consulting for CPG brands'), 'cpg');
  assert.equal(segmentOf('Executive recruiting for retail and consumer brands'), 'staffing');
  assert.equal(segmentOf('Retail/CPG analytics and collaboration software. It is not a placement consulting firm.'), 'software');
  assert.equal(segmentOf(''), null);
  assert.deepEqual(THESIS.excluded.map(x => x.key), ['dtc', 'ops']);
});

test('the summary only fills in when the label says nothing', () => {
  assert.equal(segmentOf('Consulting firm', 'They get natural food brands into regional retailers and run line reviews.'), 'retail_placement');
  assert.equal(segmentOf('Amazon marketplace agency', 'Also runs paid social for DTC sites.'), 'marketplace');
});

test('US only: a foreign location or country domain is outside the buy box', () => {
  assert.equal(country({ location: 'Austin, Texas' }), 'us');
  assert.equal(country({ location: 'New Haven, CT per directory listings' }), 'us');
  assert.equal(country({ location: 'London, UK' }), 'abroad');
  assert.equal(country({ location: 'Brașov', website: 'example.ro' }), 'abroad');
  assert.equal(country({ location: 'based in or near' }), null); // "in", "or" are not state codes
  assert.equal(buyBox({ ownership: 'founder-owned', size: 'About 20 employees', location: 'Toronto, Ontario' }).status, 'out');
});

test('ranking: retail placement breaks a tie ahead of marketplace, and the segment is labelled', () => {
  const sig = [{ key: 'partner_program', text: 'Partner program page', url: 'https://example.com/p', direction: 'for' }];
  const base = { ownership: 'founder-owned', size: 'About 20 employees', location: 'Austin, TX', score: 60, timing: { signals: sig } };
  const a = rankOne({ ...base, company: 'A', industry: 'Food brokerage for natural brands' }), b = rankOne({ ...base, company: 'B', industry: 'Amazon marketplace agency' });
  assert.equal(a.segmentLabel, 'Retail placement'); assert.equal(b.segmentLabel, 'Marketplace agency');
  assert.ok(a.score > b.score); assert.equal(a.parts.segment, 5); assert.equal(b.parts.segment, 3);
});

test('the same clue found twice counts once', async () => {
  const { timing } = await import('../lib/search/timing.mjs');
  const x = { signal: 'ai_interest', text: 'Their site: “…AI-powered team…”', url: 'https://example.com/a', direction: 'for' };
  assert.equal(timing([x, { ...x }, { ...x, url: 'https://example.com/a#top' }]).signals.length, 1);
});

test('fit: a firm in another buy-box segment is not capped by the search’s segment must-have; other must-haves still cap', async () => {
  const { fitFor } = await import('../lib/search/rank.mjs');
  const B = [{ key: 'retail_placement_focus', weight: 3, status: 'mismatch', must: true }, { key: 'size_fit', weight: 2, status: 'strong', must: true }, { key: 'founder_owned', weight: 2, status: 'strong' }];
  assert.deepEqual(fitFor({ score: 40, breakdown: B }, 'strategy'), { fit: 100, recounted: true });
  assert.equal(fitFor({ score: 40, breakdown: B }, 'dtc').recounted, false);
  assert.equal(fitFor({ score: 40, breakdown: [...B, { key: 'likely_available_to_buy', weight: 3, status: 'mismatch', must: true }] }, 'strategy').fit, 40);
});
