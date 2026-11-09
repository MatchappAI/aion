// Fixes from the investor / broker / searcher / founder review: honest drafts, owner-only sale notes, real owners,
// independent firms, size from team pages, separate buy and partnership lists.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.AION_OFFLINE = '1';
const OUT = await import('../lib/outreach/outreach.mjs');
const { buyBox, parentOf, acquirerOf } = await import('../lib/search/buybox.mjs');
const { ownerOf, rankOne } = await import('../lib/search/rank.mjs');
const { teamCount } = await import('../lib/outreach/sitecontacts.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-review-')); OUT.initOutreach(dir);

test('drafts are told the truth (written as you, never naming AION) and never raise layoffs', () => {
  const p = OUT.draftPrompt('target', 'Ann at Acme', [], { name: 'M', funding: 'bank financing plus investor equity' }, null, 'full');
  assert.match(p, /has not bought a firm yet/);
  assert.match(p, /never say or imply you already own/); assert.match(p, /Never name AION/);
  assert.doesNotMatch(p.split('SIGNALS')[0].replace(/Never name AION[^.]*\./g, ''), /\bAION\b/, 'the goal and who-you-are lines never name AION');
  assert.match(p, /Never mention layoffs/);
  assert.doesNotMatch(p, /No headcount reductions are planned/);
  assert.match(p, /paid for: bank financing plus investor equity/);
  // a partnership note never talks about paying for a deal
  assert.doesNotMatch(OUT.draftPrompt('target', 'Ann', [], { name: 'M', funding: 'bank financing' }, null, 'partner'), /paid for/);
  assert.match(OUT.draftPrompt('target', 'Ann', [], { name: 'M' }, null, 'partner'), /may want to invest in or buy one day/);
});

test('the check-before-sending catches “we own…” and layoff talk, even after edits', () => {
  const c = OUT.unsupported('We are permanent owners of retail placement firms. No staff cuts are planned.', [], { name: 'M' });
  assert.ok(c.some(x => /AION has not bought a firm/.test(x)));
  assert.ok(c.some(x => /layoffs or headcount/.test(x)));
  assert.equal(OUT.unsupported('We are building a long-term group.', [], { name: 'M' }).length, 0);
});

test('a note about selling goes only to the owner, never a shared inbox or an employee', () => {
  const base = { mode: 'target', owner: 'Robin Placeholder', signals: [] };
  assert.match(OUT.addressCheck({ ...base, pitch: 'full', to: 'inquiries@acme.com' }).block, /shared inbox/);
  assert.match(OUT.addressCheck({ ...base, pitch: 'majority', to: 'ajay@acme.com' }).block, /someone other than the owner/);
  assert.equal(OUT.addressCheck({ ...base, pitch: 'majority', to: 'robin@acme.com' }).block, null);
  assert.equal(OUT.addressCheck({ ...base, pitch: 'full', to: 'rplaceholder@acme.com' }).block, null);
  assert.equal(OUT.addressCheck({ ...base, pitch: 'full', to: 'owner@acme.com' }).block, null);
  // a partnership note may go to a shared inbox, with a warning
  const p = OUT.addressCheck({ ...base, pitch: 'partner', to: 'info@acme.com' });
  assert.equal(p.block, null); assert.match(p.warn, /shared inbox/);
});

test('someone who died or retired is never the owner or the person a note is addressed to', () => {
  assert.equal(ownerOf({ owner: 'Jane Roe (Founder (deceased))' }), null);
  assert.equal(ownerOf({ owner: '', contacts: [{ name: 'Terry Example', title: 'Co-founder, retired 2025' }, { name: 'Jordan Example', title: 'Founder and CEO' }] }), 'Jordan Example');
  const sig = OUT.signalsFor({ mode: 'target' }, { company: 'Northfield Brokers', owner: 'Jane Roe (Founder (deceased))' });
  assert.ok(sig.some(x => x.kind === 'owner' && /current owner is not known/.test(x.text)));
  assert.equal(OUT.ownerName({ signals: sig }), null);
});

test('part of a bigger company, or a buyer of agencies itself: outside the buy box', () => {
  const arch = { company: 'Ridgeway Group', ownership: 'unknown', location: 'Dallas, Texas', summary: 'Ridgeway Sales is a Texas food broker owned by the founder-led Ridgeway Group.' };
  assert.ok(parentOf(arch)); assert.equal(buyBox(arch).status, 'out');
  assert.equal(parentOf({ summary: 'No PE backing, public listing or parent group was found.' }), null);
  const harbor = { company: 'Harbor Lane Agency', location: 'Austin, TX', ownership: 'founder-led', verifiedFacts: [{ text: 'Harbor Lane acquired Bluefin Media in October 2025.' }] };
  assert.ok(acquirerOf(harbor)); assert.match(buyBox(harbor).reasons.join(' '), /Buys other agencies/);
  // being bought by someone else is not "buying agencies"
  assert.equal(acquirerOf({ company: 'Example Retail Group', verifiedFacts: [{ text: 'It had 20 staff when The Paddock acquired it in 2021.' }] }), null);
});

test('size from their own team page: counts people with titles, confirms the buy box, gives a rough range', () => {
  const html = '<h3>Jane Roe</h3><p>Founder and CEO</p><h3>John Poe</h3><p>Account Manager</p><h3>Ann Lee</h3><p>Director of Sales</p><h3>Bob Ray</h3><p>Analyst</p><h3>Sue Kim</h3><p>Retail Strategist</p><h3>Our Story</h3><p>Since 2001</p>';
  assert.equal(teamCount(html), 5);
  const e = { company: 'Acme Brokers', ownership: 'founder-owned', location: 'Austin, TX', sizeEstimate: { people: 16, url: 'https://acme.test/team' } };
  assert.equal(buyBox(e).status, 'in');
  const r = rankOne(e);
  assert.equal(r.size.people, 16); assert.equal(r.size.from, 'team page');
  assert.equal(rankOne({ ...e, sizeEstimate: undefined, size: '11-50 employees' }).size.people, '11–50');
  assert.deepEqual(r.size.ebitda, [16 * 150000 * 0.15, 16 * 250000 * 0.25]);
  // a team page with only the founders is not proof of "too small"
  assert.equal(buyBox({ ...e, sizeEstimate: { people: 3 } }).status, 'check');
});

test('brand introductions are only offered when the radar has real brands behind them', () => {
  assert.equal(OUT.brandsFor('retail_placement'), null); // no scan in this test workspace
  assert.match(OUT.draftPrompt('target', 'X', [], { name: 'M' }, null, 'partner'), /ONLY if a signal of kind "brands" exists/);
});
