import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyInsights, getDrinkAnalysis, getTargetMl, getWeeklyTotals, resolveDrinkCategory } from './insights.js';

const today = '2026-10-15';
const sample = [
  { id: 'WTR-001', date: today, time: '08:30', amountMl: 800, drinkType: 'water', sugarGrams: 0, caffeineMg: 0, caloriesKcal: 0 },
  { id: 'WTR-002', date: today, time: '10:15', amountMl: 250, drinkType: 'coffee', caffeineMg: 150 },
  { id: 'WTR-003', date: today, time: '12:00', amountMl: 200, drinkType: 'soda', sugarGrams: 22, caloriesKcal: 85 },
];

test('water + coffee + soda produce contextual scores, classifications, and ingredient cautions', () => {
  const analysis = buildDailyInsights(sample, 2000, today, {}, new Date(2026, 9, 15, 13, 0));
  assert.equal(analysis.totalMl, 1250);
  assert.equal(analysis.score, 63);
  assert.equal(analysis.drinks.drinkScore, 1);
  assert.equal(analysis.drinks.positivePercent, 64);
  assert.equal(analysis.nutrients.caffeineMg.amount, 150);
  assert.equal(analysis.nutrients.sugarGrams.amount, 22);
  assert.ok(analysis.healthAlerts.some((item) => item.includes('22 g') && item.includes('88%')));
  assert.equal(analysis.drinks.groups.find((item) => item.key === 'coffee').impact, 'warning');
  assert.equal(analysis.drinks.groups.find((item) => item.key === 'soda').impact, 'negative');
});

test('unmeasured ingredients stay unknown rather than being treated as zero', () => {
  const analysis = buildDailyInsights([{ date: today, time: '09:00', amountMl: 250, drinkType: 'coffee' }], 2000, today, {}, new Date(2026, 9, 15, 12, 0));
  assert.equal(analysis.nutrients.caffeineMg.count, 0);
  assert.ok(analysis.healthAlerts.some((item) => item.includes('chưa nhập mg')));
});

test('pregnancy profile switches caffeine reference and high intake is flagged', () => {
  const entry = { date: today, time: '09:00', amountMl: 250, drinkType: 'coffee', caffeineMg: 220 };
  const analysis = buildDailyInsights([entry], 2000, today, { pregnant: true }, new Date(2026, 9, 15, 12, 0));
  assert.equal(analysis.caffeineReference, 200);
  assert.ok(analysis.healthAlerts.some((item) => item.includes('vượt mốc tham khảo')));
});

test('pregnancy and breastfeeding add one demo target adjustment and use separate caffeine references', () => {
  const base = getTargetMl({ useFormula: true, sex: 'female', weightKg: 60 });
  assert.equal(getTargetMl({ useFormula: true, sex: 'female', weightKg: 60, pregnant: true, breastfeeding: true }), base + 300);
  assert.equal(buildDailyInsights([], base, today, { breastfeeding: true }).caffeineReference, 200);
  assert.equal(buildDailyInsights([], base, today, { pregnant: true }).caffeineReference, 200);
});

test('custom drink labels are recognized; unrecognized drinks remain unclassified', () => {
  assert.equal(resolveDrinkCategory({ drinkType: 'other', customDrink: 'Trà sữa trân châu' }).key, 'bubbleTea');
  assert.equal(resolveDrinkCategory({ drinkType: 'other', customDrink: 'Nước điện giải' }).impact, 'unknown');
  assert.equal(getDrinkAnalysis([{ amountMl: 300, drinkType: 'other', customDrink: 'Nước điện giải' }]).positivePercent, 0);
});

test('weekly summary has seven correctly dated rows in ascending order', () => {
  const days = getWeeklyTotals(sample, 2000, new Date(2026, 9, 15, 12, 0));
  assert.equal(days.length, 7);
  assert.equal(days[0].date, '2026-10-09');
  assert.equal(days[6].date, today);
  assert.equal(days[6].label, 'T5');
  assert.equal(days[6].totalMl, 1250);
});
