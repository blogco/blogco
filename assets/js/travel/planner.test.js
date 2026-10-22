import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, buildTrip, buildTripRequest, convertVnd, currencyForDestination, formatVndInput, parseVnd, sumBudget, validateBudgetVnd } from './planner.js';

test('parses and formats common Vietnamese VND input styles', () => {
  for (const value of ['20000000', '20.000.000', '20,000,000', '20000000 VND', '20 triệu']) assert.equal(parseVnd(value), 20_000_000);
  assert.equal(formatVndInput('20 triệu'), '20.000.000 ₫');
  assert.equal(parseVnd('20.00.000'), NaN);
});

test('validates positive safe budgets against application limits without increments', () => {
  assert.deepEqual(validateBudgetVnd('19,000,000'), { valid: true, amount: 19_000_000, error: '' });
  assert.equal(validateBudgetVnd('0').error, 'Ngân sách phải lớn hơn 0.');
  assert.equal(validateBudgetVnd('-5').error, 'Ngân sách phải lớn hơn 0.');
  assert.match(validateBudgetVnd('1.001.000.000').error, /vượt quá/);
  assert.match(validateBudgetVnd('n/a').error, /ngân sách hợp lệ/);
});

test('constructs normalized trip requests and validates dates and duration', () => {
  assert.deepEqual(buildTripRequest({ destination: ' Mỹ ', days: '5', budgetVnd: '20 triệu', startDate: '2026-10-23' }), {
    destination: 'Mỹ', days: 5, budgetVnd: 20_000_000, startDate: '2026-10-23',
  });
  assert.throws(() => buildTripRequest({ destination: 'Mỹ', days: '', budgetVnd: '20 triệu' }), /số ngày/);
  assert.throws(() => buildTripRequest({ destination: 'Mỹ', days: '5', budgetVnd: '20 triệu', startDate: '2026-02-30' }), /ngày khởi hành/);
});

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
