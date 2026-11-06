import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headlineEvents, stateOf } from '../lib/search/radar.mjs';

const one = (mode, name, title) => headlineEvents(mode, name, [{ title, url: 'https://x/' + title.length, date: '2026-09' }]);

test('an award or list is not a leadership change', () => assert.equal(one('target', 'Ridgeway Partners', 'Ridgeway Partners Executive Search Named to Forbes 2026 List of Best Firms - Forbes').length, 0));
test('a company buying another is growth, not a new owner', () => { const [e] = one('client', 'BAE Systems', 'BAE Systems acquires Swedish supplier - BAE'); assert.equal(e.signal, 'new_site'); assert.equal(e.direction, 'for'); });
test('a target that is buying others is a reason to wait', () => { const [e] = one('target', 'Acme Search', 'Acme Search acquires Midwest boutique'); assert.equal(e.direction, 'against'); });
test('a target bought by someone else is a reason to wait', () => { const [e] = one('target', 'Acme Search', 'Acme Search acquired by Blackstone'); assert.equal(e.signal, 'new_owner'); assert.equal(e.direction, 'against'); });
test('the company must be the subject of the headline', () => assert.equal(one('client', 'Civica', 'Highmark expands drugs offered to members through CivicaScript').length, 0));
test('questions are speculation, not events', () => assert.equal(one('client', 'BAE Systems', 'Is BAE Systems Expanding Its Presence in the Radar Market?').length, 0));
test('a named senior hire is a leadership change', () => { const [e] = one('client', 'Acme Corp', 'Acme Corp names Jane Doe Vice President of Operations'); assert.equal(e.signal, 'leadership_change'); });
test('new jobs and a new plant are a new site', () => { const [e] = one('client', 'Acme Corp', 'Acme Corp to create 150 jobs with new plant in Wytheville'); assert.equal(e.signal, 'new_site'); });
test('the same headline from two outlets counts once', () => assert.equal(headlineEvents('client', 'Acme Corp', [{ title: 'Acme Corp opens new warehouse - WBNG', url: 'a' }, { title: 'Acme Corp opens new warehouse - WBNG', url: 'b' }]).length, 1));
test('a retiring founder is a succession clue for a target', () => { const [e] = one('target', 'Acme Search', 'Acme Search founder John Smith to retire after 30 years'); assert.equal(e.signal, 'retirement'); assert.equal(e.direction, 'for'); });
test('state from a location', () => { assert.equal(stateOf('Petersburg, Virginia (plant)'), 'Virginia'); assert.equal(stateOf('Greensboro, NC'), 'North Carolina'); assert.equal(stateOf('somewhere'), ''); });
test('a person with the same surname is not the company', () => assert.equal(one('client', 'Eaton', 'Jeff Eaton Named Director of Football Strength and Conditioning - Oregon').length, 0));
test('a company described before its name still counts', () => assert.equal(one('client', 'Eaton', 'Power management firm Eaton picks Sauer Industrial Center for $50M expansion').length, 1));
test('stock commentary is not an event', () => assert.equal(one('client', 'Rolls-Royce', 'Rolls Royce Stock Could Be 21% Overvalued Despite Indiana Expansion').length, 0));
test('retirement benefits are not a retirement', () => assert.equal(one('client', 'Rolls-Royce', 'UAW reaches tentative agreement with Rolls-Royce, boosts pay and retirement').length, 0));
test('a CEO retiring is an empty chair for a client', () => { const [e] = one('client', 'LCI Industries', 'LCI Industries names interim CEO as Jason Lippert retires'); assert.ok(['empty_chair', 'leadership_change'].includes(e.signal)); });
import { jobHistory, boardFrom } from '../lib/search/radar.mjs';
test('finds the job system behind a careers page', () => {
  assert.deepEqual(boardFrom('<a href="https://acme.wd5.myworkdayjobs.com/en-US/External_Careers">Jobs</a>'), { kind: 'Workday', tenant: 'acme', wd: 'wd5', site: 'External_Careers' });
  assert.equal(boardFrom('<iframe src="https://boards.greenhouse.io/embed/job_board?for=acmeco">').slug, 'acmeco');
  assert.equal(boardFrom('see jobs.lever.co/acme for roles').kind, 'Lever');
  assert.equal(boardFrom('<p>no jobs here</p>'), null);
});
test('our own job record: a role that disappears and comes back counts as posted again', () => {
  const k = 'c:test-' + Date.now();
  const r1 = jobHistory(k, [{ title: 'VP Operations' }], '2026-01-01T00:00:00Z');
  assert.equal(r1[0].ours, 0);
  jobHistory(k, [], '2026-02-01T00:00:00Z');
  const r3 = jobHistory(k, [{ title: 'VP Operations' }], '2026-04-01T00:00:00Z');
  assert.equal(r3[0].reposts, 1); assert.equal(r3[0].ours, 90);
});
import { usPlace } from '../lib/search/radar.mjs';
test('job locations: US only', () => {
  for (const p of ['Manchester, NH', 'Marshall, TX', 'South Boston, Virginia, United States of America', 'Defiance Plt 2 OH', 'Remote', '']) assert.ok(usPlace(p), p);
  for (const p of ['Slatina Olt', 'Yixing', 'Reynosa, Tamaulipas, Mexico', 'San Isidro, Lima, Peru']) assert.ok(!usPlace(p), p);
});
