// Local-first storage for the "Quản lý thuốc & công dụng điều trị" feature.
//
// Data lives in localStorage under a versioned key and is mirrored to a backup
// key so a corrupted primary entry can still be recovered. Rendering lives in
// form.js / main.js; everything here is pure data handling.

import { classifyMedicine } from './catalog.js';

const STORAGE_KEY = 'blogco.thuoc.entries.v1';
const BACKUP_KEY = 'blogco.thuoc.entries.backup.v1';

let memoryCache;

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function blankState() {
  return { version: 1, nextId: 1, entries: [] };
}

function text(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function multiline(value, max = 2000) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

function normalizeEntry(input = {}, existing = {}) {
  const name = text(input.name, 160);
  const usage = multiline(input.usage, 800);
  return {
    id: existing.id || text(input.id, 80),
    name,
    usage,
    visitDate: text(input.visitDate, 20),
    facility: text(input.facility, 200),
    category: classifyMedicine(name, usage),
    notes: multiline(input.notes, 600),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateEntry(input = {}) {
  const errors = [];
  if (!text(input.name)) errors.push('Vui lòng nhập tên thuốc.');
  if (!text(input.facility)) errors.push('Vui lòng nhập cơ sở khám.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(input.visitDate, 20))) errors.push('Ngày đi khám chưa hợp lệ.');
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
    memoryCache = parsed && parsed.version === 1 && Array.isArray(parsed.entries)
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
    throw new Error('Không thể lưu trên thiết bị này (có thể do dung lượng lưu trữ). Hãy export JSON và thử lại.');
  }
  memoryCache = structuredClone(state);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('thuoc:data-changed'));
}

export function getThuocState() {
  return readState();
}

export function getEntries() {
  return readState().entries;
}

export function getEntryById(id) {
  return readState().entries.find((entry) => entry.id === id) || null;
}

function nextEntryId(state, date) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return `thuoc-${safeDate}-${String(state.nextId).padStart(3, '0')}`;
}

export function saveEntry(input = {}, id = '') {
  const state = readState();
  const existingIndex = id ? state.entries.findIndex((entry) => entry.id === id) : -1;
  const existing = existingIndex >= 0 ? state.entries[existingIndex] : {};
  validateEntry(input);
  const record = normalizeEntry(input, existing);
  if (!record.id) record.id = nextEntryId(state, record.visitDate);
  record.updatedAt = new Date().toISOString();
  if (existingIndex >= 0) {
    record.createdAt = existing.createdAt || record.createdAt;
    state.entries[existingIndex] = record;
  } else {
    record.createdAt = new Date().toISOString();
    state.entries.push(record);
  }
  state.nextId += 1;
  writeState(state);
  return { ...record };
}

export function removeEntry(id) {
  const state = readState();
  const before = state.entries.length;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  if (state.entries.length === before) return false;
  writeState(state);
  return true;
}

// Wipe every saved entry from this device (used by "Xoá toàn bộ dữ liệu").
export function clearThuocData() {
  memoryCache = undefined;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // Ignore: writeState below will surface a storage error if it matters.
  }
  writeState(blankState());
  return getThuocState();
}

export function exportEntries(entries = readState().entries) {
  const payload = {
    app: 'BlogCo',
    feature: 'thuoc-management',
    exportedAt: new Date().toISOString(),
    version: 1,
    count: entries.length,
    entries,
  };
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `blogco-thuoc-${stamp}.json`);
}

function isValidEntry(entry) {
  return entry && typeof entry === 'object' && (entry.name || entry.facility);
}

export function importEntries(incoming = []) {
  const state = readState();
  const byId = new Map(state.entries.map((entry) => [entry.id, entry]));
  let added = 0;
  let updated = 0;
  incoming.filter(isValidEntry).forEach((raw) => {
    const candidate = normalizeEntry(raw, raw);
    if (!candidate.id) candidate.id = nextEntryId(state, candidate.visitDate);
    const current = byId.get(candidate.id);
    if (!current) {
      byId.set(candidate.id, candidate);
      added += 1;
    } else if (new Date(candidate.updatedAt) > new Date(current.updatedAt || 0)) {
      byId.set(candidate.id, { ...candidate, createdAt: current.createdAt || candidate.createdAt });
      updated += 1;
    }
  });
  state.entries = [...byId.values()];
  state.nextId = Math.max(state.nextId, state.entries.length + 1);
  writeState(state);
  return { added, updated, total: state.entries.length };
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

export function downloadCsv(entries = readState().entries) {
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['ID', 'Tên thuốc', 'Công dụng điều trị', 'Ngày đi khám', 'Cơ sở khám', 'Nhóm thuốc', 'Ghi chú']];
  entries.forEach((entry) => {
    rows.push([entry.id, entry.name, entry.usage, entry.visitDate, entry.facility, entry.category, entry.notes]);
  });
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'blogco-thuoc.csv');
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
