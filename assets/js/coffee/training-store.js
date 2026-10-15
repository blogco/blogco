// Lưu trữ phiên training trên thiết bị (localStorage) — lịch sử xử lý hoá đơn,
// bản nháp và dữ liệu đã xác nhận. Giữ NGUYÊN kết quả OCR gốc để có thể xem lại
// gốc vs đã sửa. Việc "đưa vào tập training" (commit ground truth) do training.js
// đảm nhiệm; ở đây chỉ lưu cục bộ.

const STORAGE_KEY = 'blogco.coffee.training.v1';

let memoryCache;

function blank() {
  return { version: 1, nextId: 1, records: [] };
}

function read() {
  if (memoryCache) return structuredClone(memoryCache);
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null');
    memoryCache = parsed && parsed.version === 1 && Array.isArray(parsed.records) ? parsed : blank();
  } catch {
    memoryCache = blank();
  }
  return structuredClone(memoryCache);
}

function write(state) {
  memoryCache = structuredClone(state);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error('Không lưu được trên thiết bị này (có thể do dung lượng). Hãy export dữ liệu.');
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('coffee:training-changed'));
}

// Bản ghi gọn: bỏ undo/meta nội bộ, giữ gốc + đã sửa + phiên bản.
function toRecord(session, { status, note } = {}) {
  return {
    id: session.id,
    fileName: session.fileName,
    brand: session.brand,
    pageCount: session.pageCount,
    pageWarning: session.pageWarning,
    status: status || session.status || 'pending',
    createdAt: session.createdAt,
    updatedAt: new Date().toISOString(),
    itemCount: session.items.length,
    editedFieldCount: session.editedFieldCount ?? 0,
    verification: session.verification ? { status: session.verification.status, discrepancy: session.verification.discrepancy } : null,
    note: note || '',
    rawText: session.rawText,
    editedText: session.editedText,
    original: session.original,
    corrected: {
      items: session.items,
      receipt: session.receipt,
      lines: session.lines,
    },
    meta: { nextItemId: session.meta?.nextItemId || 1 },
    versions: session.versions || [],
  };
}

export function listTrainingRecords() {
  return read().records.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getTrainingRecord(id) {
  return read().records.find((record) => record.id === id) || null;
}

// Lưu (tạo mới hoặc cập nhật) một phiên. Nếu đã tồn tại, đẩy bản cũ vào versions.
export function saveTrainingRecord(session, options = {}) {
  const state = read();
  const record = toRecord(session, options);
  const index = state.records.findIndex((entry) => entry.id === record.id);
  if (!session.id) {
    record.id = `tr-${new Date().toISOString().slice(0, 10)}-${String(state.nextId).padStart(3, '0')}`;
    state.nextId += 1;
  }
  if (index >= 0) {
    const previous = state.records[index];
    record.createdAt = previous.createdAt || record.createdAt;
    record.id = previous.id;
    record.versions = [
      ...(previous.versions || []),
      {
        at: new Date().toISOString(),
        status: previous.status,
        corrected: previous.corrected,
        verification: previous.verification,
      },
    ].slice(-20);
    state.records[index] = record;
  } else {
    record.id = record.id || `tr-${Date.now()}`;
    state.records.push(record);
  }
  write(state);
  return record;
}

export function removeTrainingRecord(id) {
  const state = read();
  const before = state.records.length;
  state.records = state.records.filter((record) => record.id !== id);
  if (state.records.length === before) return false;
  write(state);
  return true;
}

export function clearTrainingRecords() {
  write(blank());
}

// Dựng lại phiên để mở tiếp trong workbench.
export function sessionFromRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    brand: record.brand,
    fileName: record.fileName,
    fileSize: 0,
    pageCount: record.pageCount,
    pageWarning: record.pageWarning,
    rawText: record.rawText,
    editedText: record.editedText,
    lines: record.corrected?.lines || [],
    items: record.corrected?.items || [],
    receipt: record.corrected?.receipt || {},
    original: record.original,
    meta: record.meta || { nextItemId: (record.corrected?.items?.length || 0) + 1 },
    versions: record.versions || [],
  };
}

export const TRAINING_STATUS = {
  pending: { label: 'Chờ kiểm tra', tone: 'muted' },
  draft: { label: 'Lưu bản nháp', tone: 'warning' },
  edited: { label: 'Đã sửa', tone: 'warning' },
  confirmed: { label: 'Đã xác nhận', tone: 'success' },
  error: { label: 'Lỗi', tone: 'danger' },
};

export function filterTrainingRecords(records = [], { query = '', status = '', from = '', to = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return records.filter((record) => {
    if (status && record.status !== status) return false;
    if (from && String(record.updatedAt || '').slice(0, 10) < from) return false;
    if (to && String(record.updatedAt || '').slice(0, 10) > to) return false;
    if (!needle) return true;
    return [record.fileName, record.id, record.brand, record.note]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });
}
