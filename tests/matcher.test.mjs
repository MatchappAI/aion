import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchFirms, consolidation, regionOf } from '../lib/search/matcher.mjs';

const f = (name, segment, place, extra = {}) => ({ name, segment, segmentLabel: segment, place, niche: true, box: { status: 'check' }, search: 's', entity: name, ...extra });
test('merger matcher pairs complementary services or the same service in two regions, with assumptions written out', () => {
  assert.equal(regionOf('Richmond, Virginia'), 'South'); assert.equal(regionOf('Portland, OR'), 'West');
  const P = matchFirms([f('A', 'retail_placement', 'Atlanta, GA', { clients: ['Acme Foods'] }), f('B', 'marketplace', 'Austin, TX', { clients: ['Acme Foods'] }), f('C', 'retail_placement', 'Seattle, WA'), f('D', 'dtc', 'Boston, MA'), f('E', 'marketplace', 'Miami, FL', { box: { status: 'out' } })]);
  const ab = P.find(x => [x.a.name, x.b.name].sort().join() === 'A,B');
  assert.ok(ab && ab.assumptions.length && /shelves and online/.test(ab.why[0])); assert.match(ab.evidence[0], /acme foods/);
  assert.ok(P.some(x => [x.a.name, x.b.name].sort().join() === 'A,C'), 'same service, two regions');
  assert.ok(!P.some(x => [x.a.name, x.b.name].includes('E')), 'outside the buy box is never paired');
  assert.ok(!P.some(x => [x.a.name, x.b.name].includes('D')), 'no complementary pairing for D');
});
test('consolidation lists firms already in a group and the independents left by segment and region', () => {
  const M = consolidation([f('A', 'Retail placement', 'Atlanta, GA'), f('C', 'Retail placement', 'Raleigh, NC')], [{ name: 'X', why: 'Not independent: owned by the Big Group', place: 'Dallas, TX' }], [{ text: 'Big Group acquires Y Brokers', url: 'https://n.com', date: '2026-05' }]);
  assert.equal(M.bought.length, 1); assert.equal(M.deals.length, 1); assert.equal(M.clusters[0].firms.length, 2);
});
