import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVietnameseAmount, parseSmartExpense, learnMerchantCategory, getMerchantLearning, clearMerchantLearning, detectReceiptDuplicate } from './smart-entry.js';
import { searchExpenseCategories } from './expense.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('Vietnamese amount parser handles shorthand and grouped numbers', () => {
  for (const [input, expected] of [['85k', 85000], ['85.000', 85000], ['2tr5', 2500000], ['2 triệu 500', 2500000], ['2500000', 2500000]]) {
    assert.equal(parseVietnameseAmount(input).amount, expected, input);
  }
});

test('smart parser extracts merchant, date hint, monthly cue and category offline', () => {
  const now = new Date('2026-10-22T12:00:00');
  const parsed = parseSmartExpense('Highlands Coffee 85k sáng nay', { now });
  assert.equal(parsed.amount, 85000);
  assert.match(parsed.store.toLowerCase(), /highlands coffee/);
  assert.equal(parsed.category, 'coffee');
  assert.equal(parsed.date, '2026-10-22');
  assert.equal(parseSmartExpense('Netflix 260k hàng tháng', { now }).recurrence, 'monthly');
});

test('category catalog search ignores Vietnamese diacritics', () => {
  assert.ok(searchExpenseCategories('ca phe').some((entry) => entry.name === 'Cà phê'));
});

test('confirmed merchant mappings persist and can be reset', () => {
  const storage = memoryStorage();
  learnMerchantCategory('Highlands Coffee', 'coffee', { storage, alias: 'Highlands' });
  learnMerchantCategory('Highlands Coffee', 'food', { storage, alias: 'Highlands' });
  assert.equal(getMerchantLearning(storage)[0].category, 'food');
  assert.equal(parseSmartExpense('Highlands 50k', { learning: getMerchantLearning(storage) }).category, 'food');
  clearMerchantLearning(storage);
  assert.deepEqual(getMerchantLearning(storage), []);
});

test('duplicate detection checks date, amount and merchant similarity', () => {
  const existing = [{ id: 'old', store: 'Highlands Coffee', date: '2026-10-22', total: 85000 }];
  assert.equal(detectReceiptDuplicate({ store: 'Highlands', date: '2026-10-22', total: 85000 }, existing)?.id, 'old');
  assert.equal(detectReceiptDuplicate({ store: 'Highlands', date: '2026-10-21', total: 85000 }, existing), null);
});
