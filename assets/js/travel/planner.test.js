import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, buildTrip, convertVnd, currencyForDestination, sumBudget } from './planner.js';

test('creates a draft from the three required inputs without inventing calendar dates', () => {
  const trip = buildTrip({ destination: 'Seoul, Hàn Quốc', days: 5, budgetVnd: 20_000_000 });
  assert.equal(trip.destination, 'Seoul, Hàn Quốc');
  assert.equal(trip.daysCount, 5);
  assert.equal(trip.currency, 'KRW');
  assert.equal(trip.days.length, 5);
  assert.equal(trip.startDate, '');
  assert.equal(sumBudget(trip.budget), 20_000_000);
  assert.equal(trip.budget.reduce((sum, item) => sum + item.confirmedVnd, 0), 0);
});

test('rejects zero, negative and unsafe VND amounts', () => {
  for (const budgetVnd of [0, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildTrip({ destination: 'Tokyo', days: 3, budgetVnd }));
  }
});

test('date arithmetic is stable across leap day and year boundary', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-12-31', 1), '2025-01-01');
});

test('destination currency matching handles Vietnamese text and word boundaries', () => {
  assert.equal(currencyForDestination('Seoul, Hàn Quốc'), 'KRW');
  assert.equal(currencyForDestination('Taipei, Đài Loan'), 'TWD');
  assert.equal(currencyForDestination('Sydney, Úc'), 'AUD');
  assert.equal(currencyForDestination('Germany'), 'EUR');
  assert.equal(currencyForDestination('New York, Mỹ'), 'USD');
  assert.equal(currencyForDestination('Một nơi chưa hỗ trợ'), '');
});

test('converts only with present positive source rates and preserves no fabricated value', () => {
  assert.deepEqual(convertVnd(20_000_000, { USD: { VND: 20_000, KRW: 1_300 } }, 'KRW'), { usd: 1000, local: 1_300_000 });
  assert.equal(convertVnd(20_000_000, null, 'KRW'), null);
  assert.equal(convertVnd(20_000_000, { USD: { VND: 20_000 } }, 'KRW'), null);
});
