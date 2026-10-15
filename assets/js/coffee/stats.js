// Spending statistics for coffee receipts: totals overall, per month/year, per
// store, per drink category and the most-bought items.

import { toNumber } from './store.js';
import { CATEGORY_LABELS, CATEGORY_ORDER, normalizeName } from './menu.js';

function monthLabel(key) {
  const [year, month] = key.split('-');
  return `Tháng ${Number(month)}/${year}`;
}

function receiptTotal(receipt) {
  return toNumber(receipt?.total);
}

export function computeCoffeeStats(receipts = [], { budget = 0 } = {}) {
  const list = [...receipts];
  const totalSpend = list.reduce((sum, receipt) => sum + receiptTotal(receipt), 0);

  const byYearMap = new Map();
  const byMonthMap = new Map();
  const byStoreMap = new Map();
  const byCategoryMap = new Map();
  const byItemMap = new Map();
  let itemCount = 0;

  const categoryEntry = (category) => byCategoryMap.get(category)
    || { category, label: CATEGORY_LABELS[category] || CATEGORY_LABELS.other, count: 0, total: 0 };

  list.forEach((receipt) => {
    const date = receipt?.date || '';
    const year = date.slice(0, 4) || '—';
    const monthKey = date.slice(0, 7) || '—';
    const store = (receipt?.store || 'Không rõ').trim();
    const total = receiptTotal(receipt);

    byYearMap.set(year, (() => {
      const entry = byYearMap.get(year) || { year, count: 0, total: 0 };
      entry.count += 1; entry.total += total; return entry;
    })());
    byMonthMap.set(monthKey, (() => {
      const entry = byMonthMap.get(monthKey) || { key: monthKey, label: monthKey === '—' ? 'Không rõ' : monthLabel(monthKey), count: 0, total: 0 };
      entry.count += 1; entry.total += total; return entry;
    })());
    byStoreMap.set(store, (() => {
      const entry = byStoreMap.get(store) || { store, count: 0, total: 0 };
      entry.count += 1; entry.total += total; return entry;
    })());

    const items = Array.isArray(receipt?.items) ? receipt.items : [];
    if (!items.length) {
      const entry = categoryEntry('other');
      entry.count += 1;
      entry.total += total;
      byCategoryMap.set('other', entry);
      return;
    }
    items.forEach((item) => {
      const category = item.category && CATEGORY_LABELS[item.category] ? item.category : 'other';
      const qty = Math.max(1, Math.round(toNumber(item.qty) || 1));
      itemCount += qty;
      const catEntry = categoryEntry(category);
      catEntry.count += qty;
      catEntry.total += toNumber(item.amount);
      byCategoryMap.set(category, catEntry);

      const name = (item.name || 'Không rõ').trim();
      const key = normalizeName(name) || name.toLowerCase();
      const itemEntry = byItemMap.get(key) || { name, count: 0, total: 0 };
      itemEntry.count += qty;
      itemEntry.total += toNumber(item.amount);
      byItemMap.set(key, itemEntry);
    });
  });

  const byMonth = [...byMonthMap.values()].sort((a, b) => b.key.localeCompare(a.key));
  const byYear = [...byYearMap.values()].sort((a, b) => b.year.localeCompare(a.year));
  const byStore = [...byStoreMap.values()].sort((a, b) => b.total - a.total || b.count - a.count);
  const byCategory = CATEGORY_ORDER
    .map((category) => byCategoryMap.get(category))
    .filter(Boolean);
  const topItems = [...byItemMap.values()]
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 10);

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonth = byMonthMap.get(currentMonthKey) || { total: 0, count: 0 };
  const monthsWithData = byMonth.filter((month) => month.key !== '—').length;

  return {
    count: list.length,
    itemCount,
    totalSpend,
    averageSpend: list.length ? Math.round(totalSpend / list.length) : 0,
    maxSpend: list.reduce((max, receipt) => Math.max(max, receiptTotal(receipt)), 0),
    monthlyAverage: monthsWithData ? Math.round(totalSpend / monthsWithData) : 0,
    budget: Math.max(0, Math.round(toNumber(budget))),
    currentMonthTotal: currentMonth.total,
    currentMonthKey,
    byYear,
    byMonth,
    byStore,
    byCategory,
    topItems,
    maxMonthTotal: byMonth.reduce((max, month) => Math.max(max, month.total), 0),
  };
}

export { monthLabel };
