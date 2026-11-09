import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanProfile, profileSignals, researchFirm } from '../lib/search/founder.mjs';

test('founder research keeps only findings whose link was really seen (or is the firm’s own site); hypotheses never become facts', () => {
  const seen = new Set(['https://trade.example/interview']);
  const p = cleanProfile({
    facts: { founder_history: [{ text: 'Jane Roe founded Shelf Co in 1998.', url: 'https://shelfco.com/about', date: '' }, { text: 'Made up fact', url: 'https://nowhere.example/x' }],
      public_comments: [{ text: 'Roe said the firm is planning its succession.', url: 'https://trade.example/interview', date: '2026-04' }] },
    hypotheses: { aion_fit: [{ text: 'Retail placement fits AION’s core.', based_on: 'founder_history' }] },
    unknowns: ['Revenue'], contact: { name: 'Jane Roe', title: 'Founder', url: 'https://shelfco.com/about' }, reason_now: { text: 'Succession talk in April', url: 'https://made.up/x' },
  }, seen, 'shelfco.com');
  assert.equal(p.count, 2); assert.equal(p.dropped, 1);
  assert.equal(p.contact.name, 'Jane Roe'); assert.equal(p.reasonNow, null, 'a reason with an unseen link is dropped');
  const sig = profileSignals(p);
  assert.ok(sig.every(x => x.source)); assert.ok(!sig.some(x => /fits AION/.test(x.text)), 'hypotheses stay out of outreach facts');
});

test('research asks for web tools and refuses an unreadable answer', async () => {
  let tools = null;
  await assert.rejects(researchFirm({ company: 'X' }, { model: 'm', cwd: '/tmp', engineFn: async a => { tools = a.tools; return { text: 'no json' }; } }), /could not be read/);
  assert.deepEqual(tools, ['WebSearch', 'WebFetch']);
});

test('explicit transition statements found by research become timing signals; a death needs the firm named', async () => {
  const { profileTiming } = await import('../lib/search/founder.mjs');
  const T = profileTiming({ facts: { transition_evidence: [{ text: 'Jane Roe told Grocery Dive she plans to retire next year.', url: 'https://g.example/a', date: '2026-05' }, { text: 'Bob Smith passed away in March.', url: 'https://o.example/b' }, { text: 'Bob Smith, founder of Shelf Co, passed away in March.', url: 'https://o.example/c' }, { text: 'The firm grew 20% last year.', url: 'https://x.example' }] } }, 'Shelf Co');
  assert.deepEqual(T.map(x => x.key), ['retirement', 'founder_died']);
});

test('research that finds the firm was bought by another company sets it aside; a sale to people does not', async () => {
  const { soldTo } = await import('../lib/search/founder.mjs');
  assert.equal(soldTo({ facts: { recent_changes: [{ text: 'Chief Media bought AMZ Advisers and its Reach Social stake in August 2026.', url: 'https://x.example' }] } }, 'AMZ Advisors').by, 'Chief Media');
  assert.equal(soldTo({ facts: { founder_history: [{ text: 'Founder Don Goodwin agreed to sell GoldenSun to Randy Riley and Jason Fuller in 2020.', url: 'https://y.example' }] } }, 'goldensun insights'), null);
  assert.equal(soldTo({ facts: { founder_history: [{ text: 'Shelf Co was acquired by Big Retail Group in 2025.', url: 'https://z.example' }] } }, 'Shelf Co').by, 'Big Retail Group');
});
