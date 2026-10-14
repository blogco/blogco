import test from 'node:test';
import assert from 'node:assert/strict';
import { getICD, searchICD, allICD, normalizeText } from './icd.js';
import { computeStats } from './stats.js';
import { checkInteractions } from './medicine.js';
import { parseInvoiceText, parseMoney, parseDate } from './ocr.js';
import {
  computeTotal, computePaid, formatVnd, toNumber,
  saveVisit, getVisits, getVisitById, removeVisit, importVisits, validateVisit,
} from './store.js';
import { filterVisits, extractFollowUpDays } from './main.js';

// Minimal localStorage stub so the store CRUD layer can be exercised in Node.
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

test('computeTotal / computePaid handle numbers, blanks and insurance caps', () => {
  assert.equal(computeTotal({ examFee: '500000', medicineFee: 350000 }), 850000);
  assert.equal(computeTotal({}), 0);
  assert.equal(computePaid({ examFee: 500000, medicineFee: 350000, insurance: 200000 }), 650000);
  assert.equal(computePaid({ examFee: 100000, insurance: 250000 }), 0);
  assert.equal(toNumber('1.200.000'), 1200000);
  assert.equal(formatVnd(850000), '850.000 đ');
});

test('ICD lookup resolves exact and partial codes with accent-insensitive search', () => {
  assert.equal(getICD('J06.9').name.includes('hô hấp trên'), true);
  assert.equal(getICD('j06.9').code, 'J06.9');
  assert.equal(normalizeText('Viêm dạ dày'), 'viem da day');
  assert.ok(searchICD('dạ dày').some((entry) => entry.code === 'K29.7'));
  assert.equal(getICD('ZZ99'), null);
});

test('ICD Chapter XII (dermatology) exposes L21 seborrhoeic codes with fuzzy VI/EN search', () => {
  assert.equal(getICD('L21.9').name, 'Viêm da tiết bã, không xác định');
  assert.equal(getICD('L21.0').en, 'Seborrhoea capitis');
  assert.equal(getICD('l21.1').code, 'L21.1');

  const vi = searchICD('viêm da tiết bã', 8).map((entry) => entry.code);
  assert.ok(['L21.0', 'L21.1', 'L21.8', 'L21.9'].every((code) => vi.includes(code)));

  // Accent-insensitive (typed without diacritics) still finds the fuzzy match.
  assert.ok(searchICD('viem da tiet ba', 8).some((entry) => entry.code === 'L21.9'));
  // English label search works too.
  assert.ok(searchICD('seborrhoeic', 8).some((entry) => entry.code === 'L21.9'));
  // Whole-chapter coverage is present.
  assert.ok(allICD().filter((entry) => entry.code.startsWith('L')).length >= 90);
});

test('interaction check flags NSAID + anticoagulant and nitrate + PDE5', () => {
  assert.ok(checkInteractions([{ name: 'Ibuprofen 400mg' }, { name: 'Warfarin 5mg' }]).length >= 1);
  const combo = checkInteractions([{ name: 'Nitroglycerin 2.5mg' }, { name: 'Sildenafil 50mg' }]);
  assert.equal(combo.length, 1);
  assert.match(combo[0].message, /CHỐNG CHỈ ĐỊNH/);
  assert.equal(checkInteractions([{ name: 'Paracetamol 500mg' }, { name: 'Vitamin C' }]).length, 0);
});

test('parseMoney understands Vietnamese and grouped formats', () => {
  assert.equal(parseMoney('850.000 đ'), 850000);
  assert.equal(parseMoney('1,200,000'), 1200000);
  assert.equal(parseMoney('1.200.000,50'), 1200000.5);
  assert.equal(parseMoney(''), null);
});

test('parseDate converts dd/mm/yyyy and yyyy-mm-dd', () => {
  assert.equal(parseDate('Ngày khám: 15/10/2026'), '2026-10-15');
  assert.equal(parseDate('2026-09-02'), '2026-09-02');
  assert.equal(parseDate('không có ngày'), '');
});

test('parseInvoiceText extracts facility, patient, ICD, amounts and medicines', () => {
  const text = `BỆNH VIỆN ĐẠI HỌC Y DƯỢC
Địa chỉ: 215 Hồng Bàng, Q.5, TP.HCM
Họ tên: Nguyễn Văn A
Mã bệnh nhân: BN-2026-001
Ngày khám: 15/10/2026   Giờ: 09:30
Bác sĩ: Trần Thị B
Chẩn đoán: Viêm đường hô hấp trên
ICD: J06.9
Paracetamol 500mg  uống 1 viên x 3 lần/ngày
Amoxicillin 500mg  uống 1 viên x 2 lần/ngày
Tiền khám: 500.000
Tiền thuốc: 350.000
Tổng thanh toán: 850.000`;

  const result = parseInvoiceText(text, 'exam');
  assert.equal(result.facility, 'BỆNH VIỆN ĐẠI HỌC Y DƯỢC');
  assert.equal(result.patientName, 'Nguyễn Văn A');
  assert.equal(result.patientId, 'BN-2026-001');
  assert.equal(result.date, '2026-10-15');
  assert.equal(result.icd, 'J06.9');
  assert.equal(result.amounts.total, 850000);
  assert.equal(result.amounts.examFee, 500000);
  assert.ok(result.medicines.some((med) => med.name.includes('Paracetamol')));
  assert.ok(result.medicines.some((med) => med.name.includes('Amoxicillin')));
});

test('computeStats aggregates totals per month, year and facility', () => {
  const visits = [
    { visit: { date: '2026-10-15', facility: 'BV A' }, diagnosis: { disease: 'Cúm' }, cost: { total: 850000, paid: 850000, insurance: 0 } },
    { visit: { date: '2026-09-02', facility: 'PK B' }, diagnosis: { disease: 'Viêm dạ dày' }, cost: { total: 1200000, paid: 1000000, insurance: 200000 } },
    { visit: { date: '2025-12-20', facility: 'BV A' }, diagnosis: { disease: 'Cúm' }, cost: { total: 300000, paid: 300000, insurance: 0 } },
  ];
  const stats = computeStats(visits);
  assert.equal(stats.count, 3);
  assert.equal(stats.totalSpend, 2350000);
  assert.equal(stats.totalInsurance, 200000);
  assert.equal(stats.totalPaid, 2150000);
  assert.equal(stats.byMonth.find((month) => month.key === '2026-10').total, 850000);
  assert.equal(stats.byYear.find((year) => year.year === '2026').count, 2);
  assert.equal(stats.byFacility[0].facility, 'BV A');
  assert.equal(stats.byDisease[0].disease, 'Cúm');
});

test('filterVisits searches by name, ICD and facility filters', () => {
  const visits = [
    { patient: { fullName: 'Nguyễn Văn A', patientId: 'BN-2026-001' }, visit: { date: '2026-10-15', facility: 'BV A' }, diagnosis: { disease: 'Cúm', icd: 'J11.1', treatment: '' }, medicines: [{ name: 'Paracetamol' }] },
    { patient: { fullName: 'Trần Thị C', patientId: 'BN-2026-002' }, visit: { date: '2026-09-02', facility: 'PK B' }, diagnosis: { disease: 'Viêm dạ dày', icd: 'K29.7', treatment: 'Tái khám sau 7 ngày' }, medicines: [] },
  ];
  assert.equal(filterVisits(visits, { query: 'K29.7' }).length, 1);
  assert.equal(filterVisits(visits, { query: 'paracetamol' }).length, 1);
  assert.equal(filterVisits(visits, { facility: 'BV A' }).length, 1);
  assert.equal(filterVisits(visits, { year: '2025' }).length, 0);
});

test('extractFollowUpDays reads "tái khám sau N ngày"', () => {
  assert.equal(extractFollowUpDays('Nghỉ ngơi, tái khám sau 5 ngày nếu không đỡ'), 5);
  assert.equal(extractFollowUpDays('Bình thường'), null);
});

test('store CRUD: save, read, update, remove and computed cost', () => {
  localStorage.clear();
  const base = {
    fullName: 'Nguyễn Văn A', patientId: 'BN-2026-001',
    facility: 'Bệnh viện Đại học Y Dược', address: '215 Hồng Bàng, Q.5',
    date: '2026-10-15', time: '09:30', disease: 'Viêm hô hấp trên',
    icd: 'j06.9', treatment: 'Nghỉ ngơi, tái khám sau 5 ngày',
    medicines: [{ name: 'Paracetamol 500mg', dosage: '1 viên x3', duration: '5', usage: 'Giảm đau' }],
    examFee: '500000', medicineFee: '350000', insurance: '0',
  };
  const record = saveVisit(base);
  assert.equal(record.id.startsWith('visit-2026-10-15-'), true);
  assert.equal(record.diagnosis.icd, 'J06.9');
  assert.equal(record.cost.total, 850000);
  assert.equal(record.cost.paid, 850000);
  assert.equal(getVisits().length, 1);
  assert.equal(getVisitById(record.id).patient.fullName, 'Nguyễn Văn A');

  const updated = saveVisit({ ...base, medicineFee: '450000', id: record.id }, record.id);
  assert.equal(updated.cost.total, 950000);
  assert.equal(getVisits().length, 1);

  const imported = importVisits({ visits: [{ ...record, id: 'visit-2026-09-02-999', visit: { date: '2026-09-02', facility: 'PK B' }, patient: { fullName: 'Trần Thị C' }, diagnosis: { disease: 'Viêm dạ dày' }, cost: { total: 1200000 } }] });
  assert.equal(imported.added, 1);
  assert.equal(getVisits().length, 2);

  assert.equal(removeVisit(record.id), true);
  assert.equal(getVisits().length, 1);
});

test('validateVisit rejects missing required fields', () => {
  assert.throws(() => validateVisit({ date: '2026-10-15' }), /họ tên/);
  assert.doesNotThrow(() => validateVisit({
    fullName: 'A', patientId: 'B', facility: 'C', address: 'D', date: '2026-10-15',
    disease: 'E', icd: 'J06.9', treatment: 'F', medicines: [],
  }));
});
