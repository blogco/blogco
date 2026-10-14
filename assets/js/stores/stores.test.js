import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchStores, uniqueValues, normalizeText, nextCustomId, importCustomStores,
} from './store.js';
import { highlight, matchRanges } from './main.js';

// Minimal localStorage stub so the custom-store layer can be exercised in Node.
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

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

test('searchStores matches with punctuation removed', () => {
  const result = searchStores(FIXTURE, { query: 'lethaito' });
  assert.deepEqual(result.map((store) => store.id), ['a']);
});

test('searchStores tolerates a single typo on 5+ character words', () => {
  const stores = [{
    id: 't', brand: 'highlands', brandName: 'Highlands Coffee',
    city: 'Hà Nội', district: 'Cầu Giấy', address: 'Hoàng Quốc Việt',
  }];
  assert.equal(searchStores(stores, { query: 'hoang quoc vietj' }).length, 1);
});

test('searchStores keeps short words exact so "ly" does not reach "le"', () => {
  assert.equal(searchStores(FIXTURE, { query: 'ly' }).length, 0);
});

test('searchStores ranks address hits above district hits', () => {
  const stores = [
    { id: 'd', brand: 'highlands', brandName: 'Highlands Coffee', city: 'Hà Nội', district: 'Hàng Bài', address: '99 Trần Hưng Đạo' },
    { id: 'a', brand: 'highlands', brandName: 'Highlands Coffee', city: 'Hà Nội', district: 'Hoàn Kiếm', address: '12 Hàng Bài' },
  ];
  assert.deepEqual(searchStores(stores, { query: 'hang bai' }).map((store) => store.id), ['a', 'd']);
});

test('nextCustomId continues past the highest existing suffix', () => {
  localStorage.clear();
  importCustomStores(JSON.stringify({
    version: 1,
    stores: [
      { id: 'hls-custom-001', brand: 'highlands', address: '1 A', city: 'Hà Nội', district: 'X' },
      { id: 'hls-custom-003', brand: 'highlands', address: '3 B', city: 'Hà Nội', district: 'Y' },
    ],
  }));
  assert.equal(nextCustomId('highlands'), 'hls-custom-004');
  assert.equal(nextCustomId('starbucks'), 'sb-custom-001');
});

test('highlight wraps accent-insensitive matches and escapes HTML', () => {
  assert.equal(
    highlight('Lê Thái Tổ', 'le thai'),
    '<mark class="store-mark">Lê Thái</mark> Tổ',
  );
  assert.equal(
    highlight('<b>Hàng Bài</b>', 'hang bai'),
    '&lt;b&gt;<mark class="store-mark">Hàng Bài</mark>&lt;/b&gt;',
  );
  assert.equal(highlight('Hàng Bài', ''), 'Hàng Bài');
});

test('matchRanges merges overlapping phrase and word ranges', () => {
  assert.deepEqual(matchRanges('Bài Bài', 'bai bai'), [[0, 7]]);
});
