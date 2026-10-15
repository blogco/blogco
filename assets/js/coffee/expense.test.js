import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyExpense, normalizeExpenseCategory, expenseCategoryMeta, receiptExpenseCategory,
  expenseAdvice, buildExpenseReview, EXPENSE_CATEGORIES,
} from './expense.js';
import { computeCoffeeStats } from './stats.js';

test('classifyExpense buckets life expenses from free text', () => {
  assert.equal(classifyExpense('Đi siêu thị Coopmart'), 'grocery');
  assert.equal(classifyExpense('Mua sắm Vincom'), 'grocery');
  assert.equal(classifyExpense('Highlands Coffee'), 'coffee');
  assert.equal(classifyExpense('Trà sữa Katinat'), 'coffee');
  assert.equal(classifyExpense('Nhà hàng buffet'), 'food');
  assert.equal(classifyExpense('Khách sạn Mường Thanh'), 'travel');
  assert.equal(classifyExpense('CGV xem phim'), 'entertainment');
  assert.equal(classifyExpense('Grab đi làm'), 'transport');
  assert.equal(classifyExpense('Nhà thuốc Long Châu'), 'health');
  assert.equal(classifyExpense('Tiền điện EVN'), 'bills');
  assert.equal(classifyExpense('Học phí IELTS'), 'education');
  assert.equal(classifyExpense(''), 'other');
});

test('normalizeExpenseCategory keeps known keys and blanks everything else', () => {
  assert.equal(normalizeExpenseCategory('travel'), 'travel');
  assert.equal(normalizeExpenseCategory('other'), 'other');
  assert.equal(normalizeExpenseCategory(''), '');
  assert.equal(normalizeExpenseCategory('bogus'), '');
  assert.deepEqual(expenseCategoryMeta('coffee'), { key: 'coffee', label: 'Tiền cà phê', emoji: '☕' });
  assert.equal(EXPENSE_CATEGORIES.length >= 8, true);
});

test('receiptExpenseCategory falls back to auto-classification for old records', () => {
  assert.equal(receiptExpenseCategory({ expenseCategory: 'travel' }), 'travel');
  assert.equal(receiptExpenseCategory({ store: 'WinMart', items: [] }), 'grocery');
  assert.equal(receiptExpenseCategory({ store: 'Quán ăn', items: [{ name: 'Phở bò' }] }), 'food');
});

test('expenseAdvice reacts to budget and category-specific context', () => {
  const over = expenseAdvice({ category: 'grocery', total: 300000 }, { monthTotal: 1200000, budget: 1000000 });
  assert.equal(over.tone, 'warning');
  assert.match(over.notes.join(' '), /vượt ngân sách/);
  assert.ok(over.tips.length >= 3);

  const trip = expenseAdvice({ category: 'travel', total: 2000000 }, { monthTotal: 5000000, budget: 10000000 });
  assert.equal(trip.tone, 'good');
  assert.equal(trip.headline, 'Đi du lịch');
  assert.match(trip.message, /Chúc/);
  assert.match(trip.tips.join(' '), /quỹ|trải nghiệm|hạn mức/i);

  const dine = expenseAdvice({ category: 'food', total: 120000 }, { monthTotal: 400000, budget: 0 });
  assert.equal(dine.label, 'Ăn uống');
  assert.match(dine.notes.join(' '), /chi tiêu tháng này/);
});

test('buildExpenseReview groups saved rows by category with per-category feedback', () => {
  const byCategory = new Map([
    ['grocery', { total: 500000, count: 2 }],
    ['coffee', { total: 60000, count: 1 }],
  ]);
  const review = buildExpenseReview([
    { store: 'Coopmart', total: 300000, items: [] },
    { store: 'Highlands Coffee', total: 60000, items: [] },
    { store: 'Coopmart', total: 200000, items: [] },
  ], { monthTotal: 560000, budget: 0, byCategory });

  assert.equal(review.count, 3);
  assert.equal(review.total, 560000);
  assert.equal(review.advices.length, 2);
  assert.equal(review.advices[0].category, 'grocery');
  assert.equal(review.advices[0].total, 500000);
  assert.equal(review.advices[0].count, 2);
  assert.equal(review.advices[1].category, 'coffee');
});

test('computeCoffeeStats aggregates spend by expense category', () => {
  const stats = computeCoffeeStats([
    { date: '2026-10-15', store: 'Coopmart', total: 300000, items: [] },
    { date: '2026-10-16', store: 'Highlands', total: 60000, items: [] },
  ]);
  assert.equal(stats.byExpenseCategory[0].category, 'grocery');
  assert.equal(stats.byExpenseCategory[0].total, 300000);
  assert.equal(stats.byExpenseCategory.find((row) => row.category === 'coffee').total, 60000);
});
