import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateFinancialDashboard, renderFinancialDashboard } from './financial-dashboard.js';

const NOW = new Date('2026-10-22T12:00:00');

test('financial dashboard respects date and category filters and computes actual income metrics', () => {
  const rows = [
    { date: '2026-10-03', total: 100000, store: 'Highlands', expenseCategory: 'coffee' },
    { date: '2026-10-06', total: 900000, store: 'Salary', transactionType: 'income' },
    { date: '2026-09-03', total: 50000, store: 'Grab', expenseCategory: 'transport' },
    { date: '2026-10-08', total: 40000, store: 'Internal', transactionType: 'transfer' },
  ];
  const result = aggregateFinancialDashboard(rows, { from: '2026-10', to: '2026-10', category: 'coffee' }, NOW);
  assert.equal(result.expenses, 100000);
  assert.equal(result.income, 900000);
  assert.equal(result.net, 800000);
  assert.equal(result.transactions.length, 2);
  assert.ok(result.savingsRate > 0);
});

test('empty income remains unavailable and rendering never fabricates a savings rate', () => {
  const html = renderFinancialDashboard([{ date: '2026-10-03', total: 120000, store: 'Highlands' }], { period: 'month' });
  assert.match(html, /Chưa có dữ liệu thu nhập/);
  assert.match(html, /Cơ cấu thu chi theo thời gian/);
  assert.match(html, /Cơ cấu chi tiêu/);
});

test('transfers are excluded from both income and expense analytics', () => {
  const result = aggregateFinancialDashboard([
    { date: '2026-10-03', total: 120000, transactionType: 'transfer' },
  ], { from: '2026-10', to: '2026-10' }, NOW);
  assert.equal(result.income, 0);
  assert.equal(result.expenses, 0);
  const transfers = aggregateFinancialDashboard([
    { date: '2026-10-03', total: 120000, transactionType: 'transfer' },
  ], { from: '2026-10', to: '2026-10', type: 'transfer' }, NOW);
  assert.equal(transfers.transferCount, 1);
  assert.equal(transfers.transferTotal, 120000);
});

test('refunds offset expenses rather than being counted as new income', () => {
  const result = aggregateFinancialDashboard([
    { date: '2026-10-03', total: 100000, transactionType: 'expense', store: 'Shop' },
    { date: '2026-10-04', total: 20000, transactionType: 'refund', store: 'Shop' },
  ], { from: '2026-10', to: '2026-10' }, NOW);
  assert.equal(result.expenses, 80000);
  assert.equal(result.income, 0);
});

test('essential versus non-essential remains unclassified until the user configures categories', () => {
  const hadStorage = Object.hasOwn(globalThis, 'localStorage');
  const priorStorage = globalThis.localStorage;
  const values = new Map([['blogco.coffee.category-essential.v1', JSON.stringify({ coffee: 'essential' })]]);
  globalThis.localStorage = { getItem: (key) => values.get(key) || null };
  try {
    const result = aggregateFinancialDashboard([
      { date: '2026-10-03', total: 80000, store: 'Highlands', expenseCategory: 'coffee' },
      { date: '2026-10-04', total: 20000, store: 'Other', expenseCategory: 'other' },
    ], { from: '2026-10', to: '2026-10' }, NOW);
    assert.equal(result.needs.find((row) => row.key === 'essential').amount, 80000);
    assert.equal(result.needs.find((row) => row.key === 'unclassified').amount, 20000);
  } finally {
    if (hadStorage) globalThis.localStorage = priorStorage;
    else delete globalThis.localStorage;
  }
});
