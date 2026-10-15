import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyItem, normalizeName } from './menu.js';
import {
  computeReceiptTotals, toNumber, formatVnd,
  saveReceipt, getReceipts, getReceiptById, removeReceipt, importReceipts, validateReceipt, clearCoffeeData,
  saveCoffeeProfile, getCoffeeState,
} from './store.js';
import { computeCoffeeStats, computeBudgetProgress } from './stats.js';
import { filterReceipts } from './main.js';

// Minimal localStorage stub so the store CRUD layer can be exercised in Node.
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

test('classifyItem buckets drinks by keyword, ignoring accents', () => {
  assert.equal(classifyItem('Phin Sữa Đá'), 'coffee');
  assert.equal(classifyItem('bac xiu'), 'coffee');
  assert.equal(classifyItem('Trà Thạch Đào'), 'tea');
  assert.equal(classifyItem('Freeze Trà Xanh'), 'freeze');
  assert.equal(classifyItem('Bánh Croissant'), 'bakery');
  assert.equal(classifyItem('Nước suối'), 'other');
  assert.equal(normalizeName('Cà Phê Sữa'), 'ca phe sua');
});

test('computeReceiptTotals derives subtotal and grand total', () => {
  const totals = computeReceiptTotals({ items: [{ qty: 2, unitPrice: 45000 }, { amount: 39000 }], discount: 10000, vat: 8000 });
  assert.equal(totals.itemsTotal, 129000);
  assert.equal(totals.subtotal, 129000);
  assert.equal(totals.total, 127000);
  assert.equal(toNumber('194.400'), 194400);
  assert.equal(formatVnd(194400), '194.400 đ');
});

test('store CRUD: save, read, update, remove, import and validate', () => {
  localStorage.clear();
  const base = {
    store: 'Highlands Coffee - Landmark 81',
    date: '2026-10-15', time: '09:30',
    items: [{ name: 'Phin sữa đá', qty: 2, unitPrice: 45000 }],
    discount: '10000', vat: '8000',
  };
  const record = saveReceipt(base);
  assert.equal(record.id.startsWith('cf-2026-10-15-'), true);
  assert.equal(record.items[0].amount, 90000);
  assert.equal(record.subtotal, 90000);
  assert.equal(record.total, 88000);
  assert.equal(getReceipts().length, 1);
  assert.equal(getReceiptById(record.id).store, 'Highlands Coffee - Landmark 81');

  const updated = saveReceipt({ ...base, discount: '0', id: record.id }, record.id);
  assert.equal(updated.total, 98000);
  assert.equal(getReceipts().length, 1);

  const imported = importReceipts({ receipts: [{ ...record, id: 'cf-2026-09-02-999', date: '2026-09-02', total: 50000, items: [] }] });
  assert.equal(imported.added, 1);
  assert.equal(getReceipts().length, 2);

  assert.equal(removeReceipt(record.id), true);
  assert.equal(getReceipts().length, 1);

  assert.throws(() => validateReceipt({ date: '2026-10-15' }), /tên quán/);
  assert.doesNotThrow(() => validateReceipt({ store: 'A', date: '2026-10-15', items: [], total: 1000 }));
});

test('clearCoffeeData wipes receipts and profile back to defaults', () => {
  clearCoffeeData();
  saveReceipt({ store: 'Highlands Coffee', date: '2026-10-15', total: 50000 });
  saveReceipt({ store: 'Phúc Long', date: '2026-10-16', total: 40000 });
  assert.equal(getReceipts().length, 2);

  const cleared = clearCoffeeData();
  assert.equal(getReceipts().length, 0);
  assert.equal(cleared.receipts.length, 0);
  assert.equal(cleared.nextId, 1);
  assert.equal(cleared.profile.monthlyBudget, 500000);
  // Backup key is wiped too, so a reload cannot restore the old list.
  assert.equal(localStorage.getItem('blogco.coffee.receipts.backup.v1'), JSON.stringify(cleared));
});

test('computeCoffeeStats aggregates totals per month, store and category', () => {
  const receipts = [
    { date: '2026-10-15', store: 'Highlands A', total: 88000, items: [{ name: 'Phin sữa đá', qty: 2, amount: 90000, category: 'coffee' }] },
    { date: '2026-10-20', store: 'Highlands B', total: 50000, items: [{ name: 'Trà đào', qty: 1, amount: 50000, category: 'tea' }] },
    { date: '2026-09-02', store: 'Highlands A', total: 120000, items: [{ name: 'Bánh', qty: 1, amount: 120000, category: 'bakery' }] },
  ];
  const stats = computeCoffeeStats(receipts, { budget: 200000 });
  assert.equal(stats.count, 3);
  assert.equal(stats.totalSpend, 258000);
  assert.equal(stats.itemCount, 4);
  assert.equal(stats.byMonth.find((month) => month.key === '2026-10').total, 138000);
  assert.equal(stats.byStore[0].store, 'Highlands A');
  assert.equal(stats.byStore[0].total, 208000);
  assert.equal(stats.byCategory.find((category) => category.category === 'coffee').total, 90000);
  assert.equal(stats.topItems[0].name, 'Phin sữa đá');
  assert.equal(stats.budget, 200000);
});

test('filterReceipts searches by store, order code and item name', () => {
  const receipts = [
    { id: 'cf-1', store: 'Highlands Landmark', orderCode: 'HD001', date: '2026-10-15', total: 45000, items: [{ name: 'Phin sữa đá', category: 'coffee' }] },
    { id: 'cf-2', store: 'Highlands Nguyễn Huệ', orderCode: 'HD002', date: '2026-09-02', total: 50000, items: [{ name: 'Trà thạch đào', category: 'tea' }] },
  ];
  assert.equal(filterReceipts(receipts, { query: 'trà thạch' }).length, 1);
  assert.equal(filterReceipts(receipts, { store: 'Highlands Landmark' }).length, 1);
  assert.equal(filterReceipts(receipts, { month: '2026-09' }).length, 1);
  assert.equal(filterReceipts(receipts, { query: 'không có' }).length, 0);
  // Default "Tất cả" filters (all empty) must never hide the saved list.
  assert.equal(filterReceipts(receipts).length, 2);
  assert.equal(filterReceipts(receipts, { query: '', month: '', store: '', category: '' }).length, 2);
});

test('computeBudgetProgress splits spend by month/quarter/year with status colours', () => {
  const receipts = [
    { date: '2026-10-05', total: 100000 },
    { date: '2026-10-20', total: 100000 },
    { date: '2026-11-01', total: 50000 },
    { date: '2026-07-01', total: 300000 },
    { date: '2025-10-01', total: 999999 },
  ];
  const progress = computeBudgetProgress(receipts, {
    monthlyBudget: 200000, quarterlyBudget: 1000000, yearlyBudget: 0,
  }, new Date(2026, 9, 15));

  assert.equal(progress.month.spent, 200000);
  assert.equal(progress.month.pct, 100);
  assert.equal(progress.month.status, 'danger');
  assert.equal(progress.month.barWidth, 100);

  assert.equal(progress.quarter.label, 'Quý 4/2026');
  assert.equal(progress.quarter.spent, 250000);
  assert.equal(progress.quarter.status, 'success');

  assert.equal(progress.year.spent, 550000);
  assert.equal(progress.year.status, 'none');
  assert.equal(progress.year.barWidth, 0);
});

test('saveCoffeeProfile merges periods and validates the range', () => {
  clearCoffeeData();
  saveCoffeeProfile({ monthlyBudget: 300000, quarterlyBudget: 900000, yearlyBudget: 3000000 });
  let profile = getCoffeeState().profile;
  assert.equal(profile.monthlyBudget, 300000);
  assert.equal(profile.quarterlyBudget, 900000);
  assert.equal(profile.yearlyBudget, 3000000);

  // A partial update keeps the other periods untouched.
  saveCoffeeProfile({ monthlyBudget: 400000 });
  profile = getCoffeeState().profile;
  assert.equal(profile.monthlyBudget, 400000);
  assert.equal(profile.quarterlyBudget, 900000);
  assert.equal(profile.yearlyBudget, 3000000);

  assert.throws(() => saveCoffeeProfile({ yearlyBudget: -5 }), /Ngân sách năm/);
  clearCoffeeData();
});
