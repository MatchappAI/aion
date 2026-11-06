import test from 'node:test';
import assert from 'node:assert/strict';
import { nonOverlappingPeriods } from '../lib/model.mjs';

test('drops a fiscal year that overlaps a later trailing-12-month column', () => {
  const per = [{ label: '2023', end: '2023-12-31', months: 12 }, { label: '2024', end: '2024-12-31', months: 12 }, { label: '2025', end: '2025-12-31', months: 12 }, { label: 'TTM Jun 30 2026', end: '2026-06-30', months: 12 }];
  assert.deepEqual(nonOverlappingPeriods(per).map(p => p.label), ['2023', '2024', 'TTM Jun 30 2026']);
});
test('keeps consecutive fiscal years', () => {
  const per = [{ label: '2022', end: '2022-12-31', months: 12 }, { label: '2023', end: '2023-12-31', months: 12 }, { label: '2024', end: '2024-12-31', months: 12 }, { label: '2025', end: '2025-12-31', months: 12 }];
  assert.equal(nonOverlappingPeriods(per).length, 4);
});
