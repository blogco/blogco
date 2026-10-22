import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMedicine, categoryLabel, categoryEmoji, normalizeText } from './catalog.js';
import {
  saveEntry, getEntries, getEntryById, removeEntry, validateEntry, importEntries, clearThuocData,
} from './store.js';
import { computeThuocStats } from './stats.js';
import { filterEntries } from './main.js';
import { extractMedicineFields, findMedicineDuplicates, normalizeMedicineSearch } from './medicine-db.js';

// Minimal localStorage stub so the store CRUD layer can run in Node.
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

test('normalizeText strips Vietnamese accents and lowercases', () => {
  assert.equal(normalizeText('Giảm Đau, Hạ Sốt'), 'giam dau, ha sot');
});

test('classifyMedicine buckets by name and by usage keywords', () => {
  assert.equal(classifyMedicine('Paracetamol 500mg'), 'pain');
  assert.equal(classifyMedicine('Amoxicillin 500mg'), 'antibiotic');
  assert.equal(classifyMedicine('Metformin 850mg'), 'diabetes');
  assert.equal(classifyMedicine('Thuốc A', 'giảm đau hạ sốt'), 'pain');
  assert.equal(classifyMedicine('', ''), 'other');
  assert.equal(categoryLabel('pain'), 'Giảm đau / Hạ sốt');
  assert.equal(categoryEmoji('other'), '📦');
});

test('store CRUD: save, read, update, remove and validate', () => {
  clearThuocData();
  const record = saveEntry({ name: 'Paracetamol', usage: 'giảm đau hạ sốt', visitDate: '2026-10-12', facility: 'BV Nhi Đồng 1' });
  assert.match(record.id, /^thuoc-2026-10-12-\d{3}$/);
  assert.equal(record.category, 'pain');
  assert.equal(getEntries().length, 1);
  assert.equal(getEntryById(record.id).facility, 'BV Nhi Đồng 1');

  const updated = saveEntry({ name: 'Paracetamol 500', usage: 'hạ sốt', visitDate: '2026-10-13', facility: 'Phòng khám A' }, record.id);
  assert.equal(updated.name, 'Paracetamol 500');
  assert.equal(getEntries().length, 1);

  assert.equal(removeEntry(record.id), true);
  assert.equal(getEntries().length, 0);

  assert.throws(() => validateEntry({ name: '', facility: '', visitDate: 'x' }), /tên thuốc/i);
  assert.throws(() => validateEntry({ name: 'A', facility: 'B', visitDate: 'nope' }), /Ngày đi khám/);
});

test('importEntries merges by id and reports counts', () => {
  clearThuocData();
  const result = importEntries([
    { id: 'x1', name: 'Vitamin C', usage: 'bổ sung', visitDate: '2026-09-01', facility: 'Nhà thuốc' },
    { id: 'x1', name: 'Vitamin C 500', usage: 'bổ sung', visitDate: '2026-09-01', facility: 'Nhà thuốc' },
    { id: 'x2', name: 'Cetirizin', usage: 'dị ứng', visitDate: '2026-09-05', facility: 'Nhà thuốc' },
  ]);
  assert.equal(result.added, 2);
  assert.equal(result.total, 2);
});

test('computeThuocStats aggregates by month, facility, category and medicine', () => {
  const entries = [
    { name: 'Paracetamol', category: 'pain', visitDate: '2026-10-12', facility: 'BV A' },
    { name: 'Paracetamol', usage: 'hạ sốt', category: 'pain', visitDate: '2026-10-20', facility: 'BV B' },
    { name: 'Amoxicillin', usage: 'kháng sinh', visitDate: '2026-09-02', facility: 'BV A' },
  ];
  const stats = computeThuocStats(entries);
  assert.equal(stats.count, 3);
  assert.equal(stats.medicineCount, 2);
  assert.equal(stats.facilityCount, 2);
  assert.equal(stats.byMonth.find((month) => month.key === '2026-10').count, 2);
  assert.equal(stats.byFacility[0].facility, 'BV A');
  assert.equal(stats.byFacility[0].count, 2);
  assert.equal(stats.topMedicines[0].name, 'Paracetamol');
  assert.equal(stats.topMedicines[0].count, 2);
});

test('filterEntries searches by name/usage/facility and month', () => {
  const entries = [
    { id: '1', name: 'Paracetamol', usage: 'giảm đau', facility: 'BV A', visitDate: '2026-10-01', category: 'pain' },
    { id: '2', name: 'Amoxicillin', usage: 'kháng sinh', facility: 'BV B', visitDate: '2026-09-01', category: 'antibiotic' },
  ];
  assert.equal(filterEntries(entries, { query: 'amoxi' }).length, 1);
  assert.equal(filterEntries(entries, { query: 'kháng sinh' }).length, 1);
  assert.equal(filterEntries(entries, { facility: 'BV A' }).length, 1);
  assert.equal(filterEntries(entries, { month: '2026-09' }).length, 1);
  assert.equal(filterEntries(entries, { category: 'pain' }).length, 1);
  assert.equal(filterEntries(entries).length, 2);
});

test('medicine database normalizes Vietnamese search and extracts only visible label fields', () => {
  assert.equal(normalizeMedicineSearch('Thuốc Đau Đầu'), 'thuoc dau dau');
  const fields = extractMedicineFields('PANADOL EXTRA\nParacetamol 500 mg\nThành phần: Paracetamol 500mg, Caffeine 65mg\nSĐK: VD-12345\nNhà sản xuất: Công ty ABC');
  assert.equal(fields.brandName, 'PANADOL EXTRA');
  assert.match(fields.genericName, /Paracetamol/);
  assert.equal(fields.strength, '500 mg');
  assert.equal(fields.registrationNumber, 'VD-12345');
  assert.equal(fields.manufacturer, 'Công ty ABC');
  assert.match(fields.rawOcrText, /PANADOL EXTRA/);
});

test('medicine duplicate matching requires exact product fields', () => {
  const products = [{ brandName: 'Panadol', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'tablet', manufacturer: 'ABC', registrationNumber: 'R1' }];
  assert.equal(findMedicineDuplicates(products, products[0]).length, 1);
  assert.equal(findMedicineDuplicates(products, { ...products[0], strength: '250 mg' }).length, 0);
});
