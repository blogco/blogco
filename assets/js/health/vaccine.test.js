import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVaccine, normalizeVaccine, doseStatus, vaccineReminders,
  filterVaccines, filterOptions, saveVaccine, getVaccines, getVaccineById,
  removeVaccine, FACILITY_PRESETS, VACCINE_SUGGESTIONS, DUE_WINDOW_DAYS,
} from './vaccine.js';

// Minimal localStorage stub mirroring health.test.js so the store layer works in Node.
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

const DAY = 86400000;
function iso(date) { return date.toISOString().slice(0, 10); }
function addDays(base, days) { return new Date(base.getTime() + days * DAY); }

test('exposes Vietnam quick-pick facilities and common vaccine suggestions', () => {
  assert.deepEqual(FACILITY_PRESETS, ['Viện Pasteur', 'VNVC', 'Long Châu']);
  assert.ok(VACCINE_SUGGESTIONS.includes('Dại'));
  assert.ok(VACCINE_SUGGESTIONS.includes('HPV'));
  assert.ok(VACCINE_SUGGESTIONS.includes('Phế cầu'));
});

test('validateVaccine requires a vaccine name and valid dose date', () => {
  assert.throws(() => validateVaccine({ vaccine: '', date: '2026-01-01' }), /tên vắc xin/);
  assert.throws(() => validateVaccine({ vaccine: 'Cúm', date: 'nope' }), /Ngày tiêm/);
  assert.throws(() => validateVaccine({ vaccine: 'Cúm', date: '2026-01-01', nextDate: '31-12' }), /kế tiếp/);
  assert.doesNotThrow(() => validateVaccine({ vaccine: 'Cúm', dose: 'Mũi 1', date: '2026-01-01', nextDate: '2027-01-01' }));
});

test('normalizeVaccine trims and collapses whitespace', () => {
  const record = normalizeVaccine({
    vaccine: '  Viêm   gan B ', dose: ' Mũi  2 ', date: '2026-02-03',
    facility: ' VNVC ', notes: '  sốt nhẹ\n 1 ngày ',
  });
  assert.equal(record.vaccine, 'Viêm gan B');
  assert.equal(record.dose, 'Mũi 2');
  assert.equal(record.facility, 'VNVC');
  assert.equal(record.notes, 'sốt nhẹ\n 1 ngày');
});

test('doseStatus classifies overdue / due / scheduled / none around today', () => {
  const today = new Date('2026-06-15T12:00:00');
  assert.equal(doseStatus('', today).state, 'none');
  assert.equal(doseStatus('bad-date', today).state, 'none');

  const overdue = doseStatus(iso(addDays(today, -5)), today);
  assert.equal(overdue.state, 'overdue');
  assert.equal(overdue.days, 5);

  const due = doseStatus(iso(addDays(today, 0)), today);
  assert.equal(due.state, 'due');
  assert.equal(due.days, 0);

  const soon = doseStatus(iso(addDays(today, DUE_WINDOW_DAYS)), today);
  assert.equal(soon.state, 'due');

  const later = doseStatus(iso(addDays(today, DUE_WINDOW_DAYS + 1)), today);
  assert.equal(later.state, 'scheduled');
});

test('vaccineReminders partitions and orders upcoming doses by urgency', () => {
  const today = new Date('2026-06-15T12:00:00');
  const records = [
    { id: 'a', vaccine: 'Dại', nextDate: iso(addDays(today, -2)) },
    { id: 'b', vaccine: 'Cúm', nextDate: iso(addDays(today, -10)) },
    { id: 'c', vaccine: 'HPV', nextDate: iso(addDays(today, 7)) },
    { id: 'd', vaccine: 'Phế cầu', nextDate: '' },
  ];
  const { overdue, due } = vaccineReminders(records, today);
  assert.deepEqual(overdue.map((r) => r.record.id), ['b', 'a']); // most overdue first
  assert.deepEqual(due.map((r) => r.record.id), ['c']);
});

test('filterVaccines filters by facility, vaccine and free-text query, newest first', () => {
  const records = [
    { id: '1', vaccine: 'Cúm', facility: 'VNVC', date: '2026-01-10', notes: 'sốt nhẹ' },
    { id: '2', vaccine: 'Dại', facility: 'Viện Pasteur', date: '2026-03-02', notes: '' },
    { id: '3', vaccine: 'Cúm', facility: 'Long Châu', date: '2025-12-01', notes: '' },
  ];
  assert.deepEqual(filterVaccines(records).map((r) => r.id), ['2', '1', '3']);
  assert.deepEqual(filterVaccines(records, { facility: 'VNVC' }).map((r) => r.id), ['1']);
  assert.deepEqual(filterVaccines(records, { vaccine: 'Cúm' }).map((r) => r.id), ['1', '3']);
  assert.deepEqual(filterVaccines(records, { query: 'sốt' }).map((r) => r.id), ['1']);
});

test('filterOptions lists distinct facilities and vaccines sorted in Vietnamese', () => {
  const options = filterOptions([
    { facility: 'VNVC', vaccine: 'Dại' },
    { facility: 'VNVC', vaccine: 'Cúm' },
    { facility: 'Long Châu', vaccine: 'Dại' },
  ]);
  assert.deepEqual(options.facilities, ['Long Châu', 'VNVC']);
  assert.deepEqual(options.vaccines, ['Cúm', 'Dại']);
});

test('saveVaccine / getVaccineById / removeVaccine round-trip through storage', () => {
  const before = getVaccines().length;
  const saved = saveVaccine({ vaccine: 'Uốn ván', dose: 'Mũi 1', date: '2026-05-20', facility: 'VNVC' });
  assert.ok(saved.id);
  assert.equal(getVaccines().length, before + 1);
  assert.equal(getVaccineById(saved.id).vaccine, 'Uốn ván');

  // Editing preserves identity and updates fields.
  const edited = saveVaccine({ ...saved, dose: 'Mũi 2', facility: 'Viện Pasteur' }, saved.id);
  assert.equal(edited.id, saved.id);
  assert.equal(getVaccineById(saved.id).dose, 'Mũi 2');
  assert.equal(getVaccines().length, before + 1);

  assert.equal(removeVaccine(saved.id), true);
  assert.equal(getVaccineById(saved.id), null);
  assert.equal(removeVaccine(saved.id), false);
  assert.equal(getVaccines().length, before);
});
