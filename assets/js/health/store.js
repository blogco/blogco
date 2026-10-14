// Local-first storage for the "Lịch sử khám bệnh" (medical visit history) feature.
//
// Data lives in localStorage under a versioned key and is mirrored to a backup
// key so a corrupted primary entry can still be recovered. Everything here is
// pure data handling; rendering lives in form.js / main.js.

const STORAGE_KEY = 'blogco.health.visits.v1';
const BACKUP_KEY = 'blogco.health.visits.backup.v1';

export const CURRENCY = 'VND';

let memoryCache;

function blankState() {
  return { version: 1, nextId: 1, visits: [] };
}

function text(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function multiline(value, max = 2000) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

export function toNumber(value) {
  if (value === '' || value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  // Keep digits and separators, then resolve whether '.'/',' is a thousands or
  // decimal mark so Vietnamese formatted amounts ("1.200.000") parse correctly.
  let raw = String(value).replace(/[^\d.,-]/g, '');
  if (!raw) return 0;
  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');
  if (hasDot && hasComma) {
    if (raw.lastIndexOf('.') > raw.lastIndexOf(',')) raw = raw.replace(/,/g, '');
    else raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (hasDot || hasComma) {
    const parts = raw.split(hasDot ? '.' : ',');
    const grouped = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
    raw = grouped ? parts.join('') : parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts.join('');
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatVnd(value) {
  return `${Math.round(toNumber(value)).toLocaleString('vi-VN')} đ`;
}

export function computeTotal(input = {}) {
  return toNumber(input.examFee) + toNumber(input.medicineFee);
}

export function computePaid(input = {}) {
  const total = computeTotal(input);
  const paid = total - toNumber(input.insurance);
  return paid > 0 ? paid : 0;
}

function normalizeMedicine(med = {}) {
  return {
    name: text(med.name, 160),
    dosage: text(med.dosage, 160),
    duration: med.duration === '' || med.duration === null || med.duration === undefined ? null : Math.max(0, Math.min(3650, Math.round(toNumber(med.duration)))),
    usage: text(med.usage, 400),
    notes: text(med.notes, 400),
  };
}

function normalizeVisit(input = {}, existing = {}) {
  const costInput = {
    examFee: toNumber(input.examFee),
    medicineFee: toNumber(input.medicineFee),
    insurance: toNumber(input.insurance),
  };
  const medicines = Array.isArray(input.medicines)
    ? input.medicines.map(normalizeMedicine).filter((med) => med.name)
    : [];
  return {
    id: existing.id || text(input.id, 80),
    patient: {
      fullName: text(input.fullName, 160),
      patientId: text(input.patientId, 80),
      dob: text(input.dob, 20),
      gender: ['male', 'female', 'other'].includes(input.gender) ? input.gender : '',
    },
    visit: {
      facility: text(input.facility, 200),
      address: text(input.address, 240),
      date: text(input.date, 20),
      time: text(input.time, 10),
      doctor: text(input.doctor, 160),
    },
    diagnosis: {
      disease: text(input.disease, 240),
      icd: text(input.icd, 20).toUpperCase(),
      symptoms: multiline(input.symptoms, 1200),
      treatment: multiline(input.treatment, 1200),
      notes: multiline(input.notes, 1200),
    },
    medicines,
    cost: {
      examFee: costInput.examFee,
      medicineFee: costInput.medicineFee,
      total: computeTotal(costInput),
      insurance: costInput.insurance,
      paid: computePaid(costInput),
      currency: CURRENCY,
    },
    invoices: {
      examInvoiceUrl: String(input.examInvoice || existing.invoices?.examInvoiceUrl || ''),
      medicineInvoiceUrl: String(input.medicineInvoice || existing.invoices?.medicineInvoiceUrl || ''),
      examOcrText: multiline(input.examOcrText, 6000),
      medicineOcrText: multiline(input.medicineOcrText, 6000),
    },
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateVisit(input = {}) {
  const errors = [];
  const date = text(input.date, 20);
  if (!text(input.fullName)) errors.push('Vui lòng nhập họ tên bệnh nhân.');
  if (!text(input.patientId)) errors.push('Vui lòng nhập mã bệnh nhân.');
  if (!text(input.facility)) errors.push('Vui lòng nhập cơ sở khám.');
  if (!text(input.address)) errors.push('Vui lòng nhập địa chỉ khám.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Ngày khám chưa hợp lệ.');
  if (!text(input.disease)) errors.push('Vui lòng nhập tên bệnh (chẩn đoán).');
  if (!text(input.icd)) errors.push('Vui lòng nhập mã ICD (hoặc dùng tra cứu ICD).');
  if (!text(input.treatment)) errors.push('Vui lòng nhập hướng điều trị.');
  const medicines = Array.isArray(input.medicines) ? input.medicines : [];
  medicines.forEach((med, index) => {
    if (!text(med.name) && (med.dosage || med.usage || med.notes || med.duration)) {
      errors.push(`Thuốc #${index + 1}: cần nhập tên thuốc nếu đã điền thông tin khác.`);
    }
  });
  if (errors.length) {
    const error = new Error(errors.join(' '));
    error.errors = errors;
    throw error;
  }
}

function readState() {
  if (memoryCache) return structuredClone(memoryCache);
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    memoryCache = parsed && parsed.version === 1 && Array.isArray(parsed.visits)
      ? { ...blankState(), ...parsed }
      : blankState();
  } catch {
    memoryCache = blankState();
  }
  return structuredClone(memoryCache);
}

function writeState(state) {
  const serialized = JSON.stringify(state);
  try {
    localStorage.setItem(BACKUP_KEY, serialized);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    throw new Error('Không thể lưu trên thiết bị này (có thể do dung lượng ảnh hoá đơn). Hãy export JSON và thử lại.');
  }
  memoryCache = structuredClone(state);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('health:data-changed'));
}

export function getHealthState() {
  return readState();
}

export function getVisits() {
  return readState().visits;
}

export function getVisitById(id) {
  return readState().visits.find((visit) => visit.id === id) || null;
}

function nextVisitId(state, date) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return `visit-${safeDate}-${String(state.nextId).padStart(3, '0')}`;
}

export function saveVisit(input = {}, id = '') {
  const state = readState();
  const existingIndex = id ? state.visits.findIndex((visit) => visit.id === id) : -1;
  const existing = existingIndex >= 0 ? state.visits[existingIndex] : {};
  validateVisit(input);
  const record = normalizeVisit(input, existing);
  if (!record.id) record.id = nextVisitId(state, record.visit.date);
  record.updatedAt = new Date().toISOString();
  if (existingIndex >= 0) {
    record.createdAt = existing.createdAt || record.createdAt;
    state.visits[existingIndex] = record;
  } else {
    record.createdAt = new Date().toISOString();
    state.visits.push(record);
  }
  state.nextId += 1;
  writeState(state);
  return { ...record };
}

export function removeVisit(id) {
  const state = readState();
  const before = state.visits.length;
  state.visits = state.visits.filter((visit) => visit.id !== id);
  if (state.visits.length === before) return false;
  writeState(state);
  return true;
}

export function exportVisits(visits = readState().visits) {
  const payload = {
    app: 'BlogCo',
    feature: 'health-history',
    exportedAt: new Date().toISOString(),
    version: 1,
    count: visits.length,
    visits,
  };
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `health-history-${stamp}.json`);
}

function isValidVisit(visit) {
  return visit && typeof visit === 'object' && visit.patient && visit.visit;
}

// Merge an imported payload into local storage. Dedupes by id and keeps the
// record with the newest updatedAt when the same visit appears twice.
export function importVisits(payload) {
  const incoming = Array.isArray(payload) ? payload : payload?.visits;
  if (!Array.isArray(incoming)) {
    throw new Error('File JSON không đúng định dạng (thiếu mảng "visits").');
  }
  const state = readState();
  const byId = new Map(state.visits.map((visit) => [visit.id, visit]));
  let added = 0;
  let updated = 0;
  incoming.filter(isValidVisit).forEach((raw) => {
    const candidate = normalizeVisit(raw, raw);
    if (!candidate.id) candidate.id = nextVisitId(state, candidate.visit.date);
    const current = byId.get(candidate.id);
    if (!current) {
      byId.set(candidate.id, candidate);
      added += 1;
    } else if (new Date(candidate.updatedAt) > new Date(current.updatedAt || 0)) {
      byId.set(candidate.id, { ...candidate, createdAt: current.createdAt || candidate.createdAt });
      updated += 1;
    }
  });
  state.visits = [...byId.values()];
  state.nextId = Math.max(state.nextId, state.visits.length + 1);
  writeState(state);
  return { added, updated, total: state.visits.length };
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || 'null')));
      } catch {
        reject(new Error('Không đọc được JSON từ file đã chọn.'));
      }
    };
    reader.onerror = () => reject(new Error('Không đọc được file đã chọn.'));
    reader.readAsText(file);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) memoryCache = undefined;
  });
}
