import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, seasonLabel, seasonKey, SEASONS } from './season.js';
import { formatAmountInput, readManualRows, BRAND_SUGGESTIONS } from './manual.js';

test('seasonOf maps each month to the conventional season', () => {
  assert.equal(seasonOf('2026-01-15')?.label, 'Xuân');
  assert.equal(seasonOf('2026-03-31')?.label, 'Xuân');
  assert.equal(seasonOf('2026-04-01')?.label, 'Hạ');
  assert.equal(seasonOf('2026-06-30')?.label, 'Hạ');
  assert.equal(seasonOf('2026-07-01')?.label, 'Thu');
  assert.equal(seasonOf('2026-09-30')?.label, 'Thu');
  assert.equal(seasonOf('2026-10-01')?.label, 'Đông');
  assert.equal(seasonOf('2026-12-31')?.label, 'Đông');
});

test('seasonOf returns null for missing or invalid dates', () => {
  assert.equal(seasonOf(''), null);
  assert.equal(seasonOf('2026'), null);
  assert.equal(seasonOf(undefined), null);
  assert.equal(seasonLabel(''), '—');
  assert.equal(seasonKey('2026-11-02'), 'winter');
});

test('SEASONS covers all twelve months exactly once', () => {
  const months = SEASONS.flatMap((season) => season.months).sort((a, b) => a - b);
  assert.deepEqual(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('formatAmountInput formats thousands and strips non-digits', () => {
  assert.equal(formatAmountInput('100200'), '100.200');
  assert.equal(formatAmountInput('100.200'), '100.200');
  assert.equal(formatAmountInput('1.000.000'), '1.000.000');
  assert.equal(formatAmountInput('45 000 đ'), '45.000');
  assert.equal(formatAmountInput(''), '');
  assert.equal(formatAmountInput('abc'), '');
});

test('BRAND_SUGGESTIONS includes the popular chains', () => {
  ['Highlands Coffee', 'Starbucks', 'Phúc Long', 'The Coffee House'].forEach((brand) => {
    assert.ok(BRAND_SUGGESTIONS.includes(brand), `missing ${brand}`);
  });
});

test('readManualRows parses formatted amounts and drops blank rows', () => {
  const rows = [
    { brand: 'Highlands Coffee', amount: '100.200', date: '2026-05-10', season: 'summer' },
    { brand: '', amount: '50.000', date: '2026-01-02', season: 'spring' },
    { brand: '', amount: '', date: new Date().toISOString().slice(0, 10), season: '' },
  ];
  const nodes = rows.map((row) => ({
    querySelector(selector) {
      if (selector === '[name="brand"]') return { value: row.brand };
      if (selector === '[name="amount"]') return { value: row.amount };
      if (selector === '[name="date"]') return { value: row.date };
      return null;
    },
  }));
  const form = { querySelectorAll: () => nodes };
  const parsed = readManualRows(form);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], { brand: 'Highlands Coffee', amount: 100200, date: '2026-05-10', season: 'summer' });
  assert.equal(parsed[1].amount, 50000);
});
