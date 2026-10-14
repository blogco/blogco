import test from 'node:test';
import assert from 'node:assert/strict';
import { searchStores, uniqueValues, normalizeText } from './store.js';

const FIXTURE = [
  { id: 'a', brand: 'highlands', brandName: 'Highlands Coffee', city: 'Hà Nội', district: 'Hoàn Kiếm', address: '38-40 Lê Thái Tổ', phone: '', hours: '', custom: false },
  { id: 'b', brand: 'highlands', brandName: 'Highlands Coffee', city: 'TP. Hồ Chí Minh', district: 'Quận 1', address: '10B Tôn Đức Thắng', phone: '', hours: '', custom: false },
  { id: 'c', brand: 'starbucks', brandName: 'Starbucks', city: 'Hà Nội', district: 'Hoàn Kiếm', address: '32 Hàng Bài', phone: '', hours: '', custom: false },
];

test('normalizeText strips diacritics', () => {
  assert.equal(normalizeText('Lê Thái Tổ'), 'le thai to');
  assert.equal(normalizeText('Đà Nẵng'), 'da nang');
});

test('searchStores filters by brand', () => {
  const result = searchStores(FIXTURE, { brand: 'starbucks' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'c');
});

test('searchStores does fuzzy accent-insensitive address search', () => {
  const result = searchStores(FIXTURE, { query: 'le thai to' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'a');
});

test('searchStores filters by city and district', () => {
  const result = searchStores(FIXTURE, { city: 'Hà Nội', district: 'Hoàn Kiếm' });
  assert.deepEqual(result.map((store) => store.id).sort(), ['a', 'c']);
});

test('uniqueValues returns sorted unique cities', () => {
  assert.deepEqual(uniqueValues(FIXTURE, 'city'), ['Hà Nội', 'TP. Hồ Chí Minh']);
});
