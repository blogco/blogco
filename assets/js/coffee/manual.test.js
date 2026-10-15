import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, seasonLabel, seasonKey, SEASONS } from './season.js';
import { formatAmountInput, readManualRows, BRAND_SUGGESTIONS, parseItemNames, distributeAmount, rowToItems } from './manual.js';

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
    { brand: 'Highlands Coffee', amount: '100.200', date: '2026-05-10', items: 'Matcha Latte, Bánh dừa' },
    { brand: '', amount: '50.000', date: '2026-01-02', items: '' },
    { brand: '', amount: '', date: new Date().toISOString().slice(0, 10), items: '' },
  ];
  const nodes = rows.map((row) => ({
    querySelector(selector) {
      if (selector === '[name="brand"]') return { value: row.brand };
      if (selector === '[name="amount"]') return { value: row.amount };
      if (selector === '[name="date"]') return { value: row.date };
      if (selector === '[name="items"]') return { value: row.items };
      return null;
    },
  }));
  const form = { querySelectorAll: () => nodes };
  const parsed = readManualRows(form);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    brand: 'Highlands Coffee', amount: 100200, date: '2026-05-10', season: 'summer',
    itemsText: 'Matcha Latte, Bánh dừa', itemNames: ['Matcha Latte', 'Bánh dừa'],
  });
  assert.equal(parsed[1].amount, 50000);
});

test('parseItemNames splits on commas/semicolons and de-dupes', () => {
  assert.deepEqual(parseItemNames('Matcha Latte, Bánh dừa'), ['Matcha Latte', 'Bánh dừa']);
  assert.deepEqual(parseItemNames('Trà sữa; Cà phê sữa, trà sữa'), ['Trà sữa', 'Cà phê sữa']);
  assert.deepEqual(parseItemNames('   '), []);
});

test('distributeAmount spreads a row total across items without losing đồng', () => {
  assert.deepEqual(distributeAmount(100000, 2), [50000, 50000]);
  assert.deepEqual(distributeAmount(100000, 3), [33333, 33333, 33334]);
  assert.deepEqual(distributeAmount(0, 0), []);
});

test('rowToItems builds categorised receipt items from the Items column', () => {
  const items = rowToItems('Matcha Latte, Bánh croissant', 100000);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'Matcha Latte');
  assert.equal(items[0].category, 'tea');
  assert.equal(items[1].category, 'bakery');
  assert.equal(items[0].amount + items[1].amount, 100000);
  assert.deepEqual(rowToItems('', 50000), []);
});
