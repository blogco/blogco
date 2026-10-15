// Aggregation for the medicine log: totals, and breakdowns by month, clinic and
// drug group, plus the most frequently recorded medicines. Pure functions.

import { CATEGORY_ORDER, categoryLabel, categoryEmoji } from './catalog.js';

export function monthLabel(key) {
  const [year, month] = key.split('-');
  return `Tháng ${Number(month)}/${year}`;
}

export function computeThuocStats(entries = []) {
  const list = [...entries];
  const byMonthMap = new Map();
  const byFacilityMap = new Map();
  const byCategoryMap = new Map();
  const byMedicineMap = new Map();

  list.forEach((entry) => {
    const monthKey = String(entry?.visitDate || '').slice(0, 7) || '—';
    byMonthMap.set(monthKey, (() => {
      const current = byMonthMap.get(monthKey) || { key: monthKey, label: monthKey === '—' ? 'Không rõ' : monthLabel(monthKey), count: 0 };
      current.count += 1;
      return current;
    })());

    const facility = String(entry?.facility || 'Không rõ').trim() || 'Không rõ';
    byFacilityMap.set(facility, (() => {
      const current = byFacilityMap.get(facility) || { facility, count: 0 };
      current.count += 1;
      return current;
    })());

    const category = entry?.category || 'other';
    byCategoryMap.set(category, (() => {
      const current = byCategoryMap.get(category) || { category, label: categoryLabel(category), emoji: categoryEmoji(category), count: 0 };
      current.count += 1;
      return current;
    })());

    const name = String(entry?.name || 'Không rõ').trim() || 'Không rõ';
    const key = name.toLowerCase();
    byMedicineMap.set(key, (() => {
      const current = byMedicineMap.get(key) || { name, count: 0 };
      current.count += 1;
      return current;
    })());
  });

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const byMonth = [...byMonthMap.values()].sort((a, b) => b.key.localeCompare(a.key));
  const byFacility = [...byFacilityMap.values()].sort((a, b) => b.count - a.count || a.facility.localeCompare(b.facility, 'vi'));
  const byCategory = CATEGORY_ORDER
    .map((key) => byCategoryMap.get(key))
    .filter(Boolean);
  const topMedicines = [...byMedicineMap.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'))
    .slice(0, 10);

  return {
    count: list.length,
    medicineCount: byMedicineMap.size,
    facilityCount: byFacilityMap.size,
    currentMonthCount: (byMonthMap.get(currentMonthKey) || { count: 0 }).count,
    currentMonthKey,
    byMonth,
    byFacility,
    byCategory,
    topMedicines,
    maxMonthCount: byMonth.reduce((max, month) => Math.max(max, month.count), 0),
  };
}

export { CATEGORY_ORDER };
