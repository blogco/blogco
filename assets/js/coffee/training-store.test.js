import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listTrainingRecords, getTrainingRecord, saveTrainingRecord, removeTrainingRecord,
  clearTrainingRecords, sessionFromRecord, filterTrainingRecords, TRAINING_STATUS,
} from './training-store.js';
import { createSession } from './training-model.js';

const SEED_RAW = [
  'HIGHLANDS COFFEE',
  'Creck: 174294 POS01',
  '1 Matchadi Latte 0 L 69.000',
  '-Ecoce Coupon giae -13.800',
  '1 Y tt 45.000',
  'Tog tien: 100.200',
  'Payoo Bark Card 100.200',
].join('\n');

function seed(fileName = 'hd.pdf', brand = 'highlands') {
  return createSession(SEED_RAW, { fileName, brand });
}

test('saveTrainingRecord: tạo bản ghi mới với id ngày và đọc lại được', () => {
  clearTrainingRecords();
  const record = saveTrainingRecord(seed(), { status: 'draft', note: 'nhap' });
  assert.match(record.id, /^tr-\d{4}-\d{2}-\d{2}-001$/);
  assert.equal(record.status, 'draft');
  assert.equal(record.itemCount, 2);
  assert.equal(record.original.items.length, 2);

  const found = getTrainingRecord(record.id);
  assert.equal(found.fileName, 'hd.pdf');
  assert.equal(found.corrected.items.length, 2);
  assert.equal(listTrainingRecords().length, 1);
});

test('saveTrainingRecord: cập nhật giữ id cũ và lưu phiên bản trước đó', () => {
  clearTrainingRecords();
  const first = saveTrainingRecord(seed(), { status: 'draft' });
  const again = saveTrainingRecord({ ...seed(), id: first.id }, { status: 'confirmed' });
  assert.equal(again.id, first.id);
  assert.equal(again.versions.length, 1);
  assert.equal(again.versions[0].status, 'draft');
  assert.equal(getTrainingRecord(first.id).status, 'confirmed');
  assert.equal(listTrainingRecords().length, 1);
});

test('removeTrainingRecord: trả true/false đúng', () => {
  clearTrainingRecords();
  const record = saveTrainingRecord(seed(), { status: 'confirmed' });
  assert.equal(removeTrainingRecord(record.id), true);
  assert.equal(removeTrainingRecord('khong-ton-tai'), false);
  assert.equal(listTrainingRecords().length, 0);
});

test('filterTrainingRecords: lọc theo từ khoá, trạng thái và ngày', () => {
  clearTrainingRecords();
  const a = saveTrainingRecord(seed('alpha.pdf'), { status: 'confirmed' });
  saveTrainingRecord(seed('beta.pdf', 'starbucks'), { status: 'draft' });
  const all = listTrainingRecords();
  assert.equal(all.length, 2);

  assert.equal(filterTrainingRecords(all, { query: 'alpha' }).length, 1);
  assert.equal(filterTrainingRecords(all, { query: 'alpha' })[0].id, a.id);
  assert.equal(filterTrainingRecords(all, { status: 'draft' }).length, 1);
  assert.equal(filterTrainingRecords(all, { query: 'starbucks' }).length, 1);
  assert.equal(filterTrainingRecords(all, { from: '9999-01-01' }).length, 0);
  assert.equal(filterTrainingRecords(all, { to: '0001-01-01' }).length, 0);
});

test('sessionFromRecord: dựng lại phiên để mở tiếp', () => {
  clearTrainingRecords();
  const record = saveTrainingRecord(seed('mo.pdf'), { status: 'confirmed' });
  const session = sessionFromRecord(getTrainingRecord(record.id));
  assert.equal(session.fileName, 'mo.pdf');
  assert.equal(session.items.length, 2);
  assert.equal(session.receipt.total, 100200);
  assert.equal(session.original.rawText, SEED_RAW);
  assert.equal(sessionFromRecord(null), null);
});

test('TRAINING_STATUS: có nhãn và tone cho các trạng thái chính', () => {
  assert.equal(TRAINING_STATUS.confirmed.label, 'Đã xác nhận');
  assert.equal(TRAINING_STATUS.confirmed.tone, 'success');
  assert.equal(typeof TRAINING_STATUS.draft.label, 'string');
});

test('clearTrainingRecords: xoá sạch lịch sử', () => {
  saveTrainingRecord(seed(), { status: 'draft' });
  clearTrainingRecords();
  assert.equal(listTrainingRecords().length, 0);
});
