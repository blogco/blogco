// Local-first storage for the "Chi phí cà phê" (coffee spending) feature.
//
// Data lives in localStorage under a versioned key and is mirrored to a backup
// key so a corrupted primary entry can be recovered. Rendering lives in
// form.js / main.js; everything here is pure data handling.

import { CATEGORY_LABELS, classifyItem } from './menu.js';

const STORAGE_KEY = 'blogco.coffee.receipts.v1';
const BACKUP_KEY = 'blogco.coffee.receipts.backup.v1';
const DEFAULT_PROFILE = { monthlyBudget: 500000 };

export const PAYMENT_LABELS = {
  cash: 'Tiền mặt',
  card: 'Thẻ',
  ewallet: 'Ví điện tử',
  transfer: 'Chuyển khoản',
  other: 'Khác',
};

let memoryCache;

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function blankState() {
  return { version: 1, nextId: 1, receipts: [], profile: { ...DEFAULT_PROFILE } };
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

function normalizeItem(item = {}) {
  const qty = Math.max(1, Math.round(toNumber(item.qty) || 1));
  const unitPrice = Math.max(0, Math.round(toNumber(item.unitPrice)));
  let amount = Math.max(0, Math.round(toNumber(item.amount)));
  if (!amount && unitPrice) amount = unitPrice * qty;
  const name = text(item.name, 160);
  const category = item.category && CATEGORY_LABELS[item.category] ? item.category : classifyItem(name);
  return { name, qty, unitPrice, amount, category };
}

// Totals are derived from the items unless the user overrides them: subtotal is
// the sum of line totals, and the grand total is subtotal − discount + VAT.
export function computeReceiptTotals(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const itemsTotal = items.reduce((sum, item) => {
    const amount = toNumber(item.amount);
    return sum + (amount || toNumber(item.unitPrice) * Math.max(1, Math.round(toNumber(item.qty) || 1)));
  }, 0);
  const has = (value) => value !== undefined && value !== null && String(value).trim() !== '';
  const subtotal = has(input.subtotal) ? Math.round(toNumber(input.subtotal)) : Math.round(itemsTotal);
  const discount = Math.max(0, Math.round(toNumber(input.discount)));
  const vat = Math.max(0, Math.round(toNumber(input.vat)));
  const total = has(input.total) ? Math.round(toNumber(input.total)) : Math.max(0, subtotal - discount + vat);
  return { itemsTotal: Math.round(itemsTotal), subtotal, discount, vat, total };
}

function normalizeReceipt(input = {}, existing = {}) {
  const items = Array.isArray(input.items)
    ? input.items.map(normalizeItem).filter((item) => item.name || item.amount)
    : [];
  const totals = computeReceiptTotals({
    items,
    subtotal: input.subtotal,
    discount: input.discount,
    vat: input.vat,
    total: input.total,
  });
  return {
    id: existing.id || text(input.id, 80),
    store: text(input.store, 160),
    address: text(input.address, 240),
    date: text(input.date, 20),
    time: text(input.time, 10),
    orderCode: text(input.orderCode, 80),
    items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    vat: totals.vat,
    total: totals.total,
    paymentMethod: Object.prototype.hasOwnProperty.call(PAYMENT_LABELS, input.paymentMethod) ? input.paymentMethod : '',
    note: multiline(input.note, 600),
    invoiceUrl: String(input.invoiceUrl ?? existing.invoiceUrl ?? ''),
    ocrText: multiline(input.ocrText, 8000),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateReceipt(input = {}) {
  const errors = [];
  if (!text(input.store)) errors.push('Vui lòng nhập tên quán/cửa hàng.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(input.date, 20))) errors.push('Ngày hoá đơn chưa hợp lệ.');
  const hasItem = (Array.isArray(input.items) ? input.items : []).some((item) => text(item.name));
  const totals = computeReceiptTotals(input);
  if (!hasItem && !totals.total) errors.push('Cần ít nhất một món hoặc tổng tiền lớn hơn 0.');
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
    memoryCache = parsed && parsed.version === 1 && Array.isArray(parsed.receipts)
      ? { ...blankState(), ...parsed, profile: { ...DEFAULT_PROFILE, ...parsed.profile } }
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
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('coffee:data-changed'));
}

export function getCoffeeState() {
  return readState();
}

export function getReceipts() {
  return readState().receipts;
}

export function getReceiptById(id) {
  return readState().receipts.find((receipt) => receipt.id === id) || null;
}

export function getNextReceiptId() {
  return `CF-${String(readState().nextId).padStart(3, '0')}`;
}

function nextReceiptId(state, date) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return `cf-${safeDate}-${String(state.nextId).padStart(3, '0')}`;
}

export function saveReceipt(input = {}, id = '') {
  const state = readState();
  const existingIndex = id ? state.receipts.findIndex((receipt) => receipt.id === id) : -1;
  const existing = existingIndex >= 0 ? state.receipts[existingIndex] : {};
  validateReceipt(input);
  const record = normalizeReceipt(input, existing);
  if (!record.id) record.id = nextReceiptId(state, record.date);
  record.updatedAt = new Date().toISOString();
  if (existingIndex >= 0) {
    record.createdAt = existing.createdAt || record.createdAt;
    state.receipts[existingIndex] = record;
  } else {
    record.createdAt = new Date().toISOString();
    state.receipts.push(record);
  }
  state.nextId += 1;
  writeState(state);
  return { ...record };
}

export function removeReceipt(id) {
  const state = readState();
  const before = state.receipts.length;
  state.receipts = state.receipts.filter((receipt) => receipt.id !== id);
  if (state.receipts.length === before) return false;
  writeState(state);
  return true;
}

export function saveCoffeeProfile(input = {}) {
  const state = readState();
  const monthlyBudget = Math.round(toNumber(input.monthlyBudget));
  if (monthlyBudget < 0 || monthlyBudget > 100000000) {
    throw new Error('Ngân sách tháng cần nằm trong khoảng 0 – 100.000.000 đ.');
  }
  state.profile = { monthlyBudget };
  writeState(state);
  return state.profile;
}

export function exportReceipts(receipts = readState().receipts) {
  const payload = {
    app: 'BlogCo',
    feature: 'coffee-spending',
    exportedAt: new Date().toISOString(),
    version: 1,
    count: receipts.length,
    receipts,
  };
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `coffee-receipts-${stamp}.json`);
}

function isValidReceipt(receipt) {
  return receipt && typeof receipt === 'object' && (receipt.total !== undefined || Array.isArray(receipt.items));
}

// Merge an imported payload into local storage. Dedupes by id and keeps the
// record with the newest updatedAt when the same receipt appears twice.
export function importReceipts(payload) {
  const incoming = Array.isArray(payload) ? payload : payload?.receipts;
  if (!Array.isArray(incoming)) {
    throw new Error('File JSON không đúng định dạng (thiếu mảng "receipts").');
  }
  const state = readState();
  const byId = new Map(state.receipts.map((receipt) => [receipt.id, receipt]));
  let added = 0;
  let updated = 0;
  incoming.filter(isValidReceipt).forEach((raw) => {
    const candidate = normalizeReceipt(raw, raw);
    if (!candidate.id) candidate.id = nextReceiptId(state, candidate.date);
    const current = byId.get(candidate.id);
    if (!current) {
      byId.set(candidate.id, candidate);
      added += 1;
    } else if (new Date(candidate.updatedAt) > new Date(current.updatedAt || 0)) {
      byId.set(candidate.id, { ...candidate, createdAt: current.createdAt || candidate.createdAt });
      updated += 1;
    }
  });
  state.receipts = [...byId.values()];
  state.nextId = Math.max(state.nextId, state.receipts.length + 1);
  writeState(state);
  return { added, updated, total: state.receipts.length };
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

// One CSV row per item so the export stays flat; receipts without items still
// produce a single row.
export function downloadCsv(receipts = readState().receipts) {
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['ID', 'Ngày', 'Giờ', 'Quán', 'Mã hoá đơn', 'Món', 'SL', 'Đơn giá', 'Thành tiền', 'Tổng hoá đơn', 'Thanh toán', 'Nhóm', 'Ghi chú']];
  receipts.forEach((receipt) => {
    const items = receipt.items?.length ? receipt.items : [null];
    items.forEach((item) => {
      rows.push([
        receipt.id, receipt.date, receipt.time, receipt.store, receipt.orderCode,
        item?.name || '', item?.qty ?? '', item?.unitPrice ?? '', item?.amount ?? '',
        receipt.total, PAYMENT_LABELS[receipt.paymentMethod] || '', CATEGORY_LABELS[item?.category] || '', receipt.note,
      ]);
    });
  });
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'blogco-coffee-receipts.csv');
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
