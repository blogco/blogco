// Spending statistics for coffee receipts: totals overall, per month/year, per
// store, per drink category and the most-bought items.

import { toNumber } from './store.js';
import { CATEGORY_LABELS, CATEGORY_ORDER, normalizeName } from './menu.js';
import { receiptExpenseCategory, EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_EMOJI } from './expense.js';

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
  const byExpenseMap = new Map();
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

    const expenseKey = receiptExpenseCategory(receipt);
    byExpenseMap.set(expenseKey, (() => {
      const entry = byExpenseMap.get(expenseKey) || {
        category: expenseKey,
        label: EXPENSE_CATEGORY_LABELS[expenseKey] || EXPENSE_CATEGORY_LABELS.other,
        emoji: EXPENSE_CATEGORY_EMOJI[expenseKey] || '📦',
        count: 0,
        total: 0,
      };
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
  const byExpenseCategory = [...byExpenseMap.values()].sort((a, b) => b.total - a.total || b.count - a.count);
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
    byExpenseCategory,
    byCategory,
    topItems,
    maxMonthTotal: byMonth.reduce((max, month) => Math.max(max, month.total), 0),
  };
}

export { monthLabel };

// ---------------------------------------------------------------------------
// Budget progress (month / quarter / year)
// ---------------------------------------------------------------------------
//
// Pure helper so it can be unit-tested without a DOM: given the receipts and
// the saved profile, return the amount spent and the % of each budget for the
// reference date (defaults to "now"). Status colours mirror the UI:
//   none (no budget) · success (<80%) · warning (80–99%) · danger (>=100%).

function budgetStatus(spent, budget) {
  if (!budget) return 'none';
  const pct = (spent / budget) * 100;
  if (pct >= 100) return 'danger';
  if (pct >= 80) return 'warning';
  return 'success';
}

export function computeBudgetProgress(receipts = [], profile = {}, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = Math.floor((month - 1) / 3) + 1;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const quarterMonths = new Set(
    [0, 1, 2].map((offset) => `${year}-${String((quarter - 1) * 3 + 1 + offset).padStart(2, '0')}`),
  );

  let monthSpent = 0;
  let quarterSpent = 0;
  let yearSpent = 0;
  receipts.forEach((receipt) => {
    const date = String(receipt?.date || '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(date) || date.slice(0, 4) !== String(year)) return;
    const total = Math.max(0, Math.round(toNumber(receipt.total)));
    const receiptMonth = date.slice(0, 7);
    yearSpent += total;
    if (quarterMonths.has(receiptMonth)) quarterSpent += total;
    if (receiptMonth === monthKey) monthSpent += total;
  });

  const makeEntry = (label, spent, budget) => {
    const value = Math.max(0, Math.round(toNumber(budget)));
    const pct = value ? Math.round((spent / value) * 100) : 0;
    return {
      label,
      spent,
      budget: value,
      pct,
      barWidth: Math.min(100, pct),
      remaining: Math.max(0, value - spent),
      over: Math.max(0, spent - value),
      status: budgetStatus(spent, value),
    };
  };

  return {
    month: { key: monthKey, ...makeEntry(`Tháng ${month}/${year}`, monthSpent, profile.monthlyBudget) },
    quarter: { key: `${year}-Q${quarter}`, ...makeEntry(`Quý ${quarter}/${year}`, quarterSpent, profile.quarterlyBudget) },
    year: { key: `${year}`, ...makeEntry(`Năm ${year}`, yearSpent, profile.yearlyBudget) },
  };
}
