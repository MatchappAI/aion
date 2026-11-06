import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timing } from '../lib/search/timing.mjs';

const now = new Date('2026-10-03');

test('three clues with one recent → Act now, with a Why now line', () => {
  const t = timing([
    { signal: 'second_in_command', text: 'Hired a general manager', url: 'https://a', date: '2026-08' },
    { signal: 'stale_website', text: 'Footer says 2018', url: 'https://b', date: '2018' },
    { signal: 'succession', text: 'Founder 28 years in', url: 'https://c' },
  ], now);
  assert.equal(t.label, 'Act now');
  assert.match(t.whyNow, /^Second-in-command hire: Hired a general manager/);
  assert.match(t.whyNow, /Worth a call this month\.$/);
});

test('proprietary only: a blind listing never counts as a clue, it marks the firm as already listed', () => {
  const t = timing([{ signal: 'blind_listing', text: 'Listing matches city, niche and 22 years', url: 'https://l' }], now);
  assert.equal(t.label, 'No timing signs yet'); assert.equal(t.listed, true); assert.equal(t.signals.length, 0);
  assert.equal(timing([{ signal: 'blind_listing', text: 'Maybe', url: 'https://l', confidence: 'possible' }], now).listed, false);
});

test('a recent clue against wins over a weak clue for', () => {
  const t = timing([
    { signal: 'ghost_job', text: 'VP Operations posted 4 times', url: 'https://j', date: '2026-09' },
    { signal: 'empty_chair', text: 'Role filled last month', url: 'https://k', date: '2026-09', direction: 'against' },
  ], now);
  assert.equal(t.label, 'Too early');
  assert.match(t.whyNow, /Check back later: Role filled last month/);
});

test('clues without a link are dropped; none left → no timing signs', () => {
  const t = timing([{ signal: 'boss_left', text: 'Manager left' }], now);
  assert.equal(t.signals.length, 0);
  assert.equal(t.label, 'No timing signs yet');
  assert.equal(t.whyNow, '');
});

test('old clues fade, unknown keys become "Other sign"', () => {
  const t = timing([{ signal: 'mystery', text: 'Something', url: 'https://x', date: '2023-01' }], now);
  assert.equal(t.signals[0].label, 'Other sign');
  assert.equal(t.signals[0].weight, 0.3);
});
test('new succession signs are recognised', () => {
  const t = timing([{ signal: 'partner_left', text: 'Long-time VP left', url: 'https://a', date: '2026-09' }, { signal: 'exit_planning', text: 'Owner joined an exit-planning group', url: 'https://b', date: '2026-08' }, { signal: 'career_length', text: 'Career began in 1984', url: 'https://c' }], now);
  assert.equal(t.signals.length, 3); assert.ok(t.signals.every(x => x.key !== 'other'));
  assert.equal(t.label, 'Act now');
});
test('a clue whose own text says it is not a clue is dropped; active launches count against a sale', () => {
  const t = timing([
    { signal: 'neighbours_selling', text: 'Not a clue for sale timing. The company was already sold.', url: 'https://a.example', date: '2026-01' },
    { signal: 'stale_website', text: 'The site is regularly updated and recently launched new service pages.', url: 'https://b.example', date: '2026-09' },
    { signal: 'succession', text: 'Founder since 1957, no successor named.', url: 'https://c.example' }
  ], new Date('2026-10-25'));
  assert.equal(t.signals.length, 2);
  assert.equal(t.signals.find(x => x.key === 'stale_website').direction, 'against');
  assert.equal(t.signals.find(x => x.key === 'succession').direction, 'for');
});
