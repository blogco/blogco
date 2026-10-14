// Cost statistics for the visit history: totals overall, per year and per
// month, plus simple breakdowns by facility and diagnosis.

import { toNumber } from './store.js';

function spendOf(visit) {
  return toNumber(visit?.cost?.total);
}

function paidOf(visit) {
  return toNumber(visit?.cost?.paid);
}

function insuranceOf(visit) {
  return toNumber(visit?.cost?.insurance);
}

function monthLabel(key) {
  const [year, month] = key.split('-');
  return `Tháng ${Number(month)}/${year}`;
}

export function computeStats(visits = []) {
  const list = [...visits];
  const totalSpend = list.reduce((sum, visit) => sum + spendOf(visit), 0);
  const totalPaid = list.reduce((sum, visit) => sum + paidOf(visit), 0);
  const totalInsurance = list.reduce((sum, visit) => sum + insuranceOf(visit), 0);

  const byYearMap = new Map();
  const byMonthMap = new Map();
  const byFacilityMap = new Map();
  const byDiseaseMap = new Map();

  list.forEach((visit) => {
    const date = visit?.visit?.date || '';
    const year = date.slice(0, 4) || '—';
    const monthKey = date.slice(0, 7) || '—';
    const facility = (visit?.visit?.facility || 'Không rõ').trim();
    const disease = (visit?.diagnosis?.disease || 'Không rõ').trim();

    const yearEntry = byYearMap.get(year) || { year, count: 0, total: 0, paid: 0, insurance: 0 };
    yearEntry.count += 1;
    yearEntry.total += spendOf(visit);
    yearEntry.paid += paidOf(visit);
    yearEntry.insurance += insuranceOf(visit);
    byYearMap.set(year, yearEntry);

    const monthEntry = byMonthMap.get(monthKey) || { key: monthKey, label: monthKey === '—' ? 'Không rõ' : monthLabel(monthKey), count: 0, total: 0, paid: 0, insurance: 0 };
    monthEntry.count += 1;
    monthEntry.total += spendOf(visit);
    monthEntry.paid += paidOf(visit);
    monthEntry.insurance += insuranceOf(visit);
    byMonthMap.set(monthKey, monthEntry);

    const facilityEntry = byFacilityMap.get(facility) || { facility, count: 0, total: 0 };
    facilityEntry.count += 1;
    facilityEntry.total += spendOf(visit);
    byFacilityMap.set(facility, facilityEntry);

    const diseaseEntry = byDiseaseMap.get(disease) || { disease, count: 0, total: 0 };
    diseaseEntry.count += 1;
    diseaseEntry.total += spendOf(visit);
    byDiseaseMap.set(disease, diseaseEntry);
  });

  const byMonth = [...byMonthMap.values()].sort((a, b) => b.key.localeCompare(a.key));
  const byYear = [...byYearMap.values()].sort((a, b) => b.year.localeCompare(a.year));
  const byFacility = [...byFacilityMap.values()].sort((a, b) => b.count - a.count || b.total - a.total);
  const byDisease = [...byDiseaseMap.values()].sort((a, b) => b.count - a.count || b.total - a.total);

  return {
    count: list.length,
    totalSpend,
    totalPaid,
    totalInsurance,
    averageSpend: list.length ? Math.round(totalSpend / list.length) : 0,
    maxSpend: list.reduce((max, visit) => Math.max(max, spendOf(visit)), 0),
    byYear,
    byMonth,
    byFacility,
    byDisease,
    maxMonthTotal: byMonth.reduce((max, month) => Math.max(max, month.total), 0),
  };
}

export function monthKeyOf(dateKey = '') {
  return String(dateKey).slice(0, 7);
}
