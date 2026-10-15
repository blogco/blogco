// Mô hình dữ liệu training (hàm thuần, không đụng DOM) cho trang AI Training.
//
// Biến kết quả OCR thô thành một "phiên" có thể sửa: danh sách dòng đã phân loại,
// bảng sản phẩm có thể chỉnh, các trường tổng kết, và kết quả đối chiếu. Mọi thao
// tác (thêm/sửa/xoá dòng, đổi loại dòng) đều trả về phiên mới; UI chỉ hiển thị.

import { extractReceipt, extractProduct, LINE_TYPE_LABELS } from './extract.js';
import { reconcile, verifyItem } from './verify.js';
import { classifyItem, CATEGORY_LABELS } from './menu.js';

export function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function categoryKey(name) {
  const key = classifyItem(name);
  return CATEGORY_LABELS[key] ? key : 'other';
}

function mapExtractedItem(item, id) {
  return {
    id,
    sourceLineIndex: item.source_line_index ?? null,
    sourceText: item.source_text || '',
    name: item.name_original || '',
    quantity: item.quantity ?? null,
    unitPrice: item.unit_price ?? null,
    grossAmount: item.gross_amount ?? null,
    printedGross: item.gross_amount ?? null,
    discountAmount: Math.abs(item.discount_amount || 0),
    netAmount: item.net_amount ?? null,
    category: categoryKey(item.name_original || ''),
    confidence: item.confidence ?? 0.4,
    needsReview: Boolean(item.needs_review),
    reviewReason: item.review_reason || null,
    modifiers: item.modifiers || [],
    manuallyAdded: false,
  };
}

// Tạo phiên từ text OCR. `original` giữ nguyên kết quả OCR gốc để đối chiếu sau.
export function createSession(rawText, meta = {}) {
  const extraction = extractReceipt(rawText);
  let counter = 0;
  const items = extraction.items.map((item) => mapExtractedItem(item, `it-${++counter}`));
  return recompute({
    id: meta.id || '',
    createdAt: meta.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pending',
    brand: meta.brand || 'highlands',
    fileName: meta.fileName || '',
    fileSize: meta.fileSize || 0,
    pageCount: meta.pageCount || 0,
    pageWarning: meta.pageWarning || '',
    rawText: String(rawText || ''),
    editedText: String(rawText || ''),
    lines: extraction.lines,
    items,
    receipt: {
      merchantName: extraction.receipt.merchant_name,
      checkNumber: extraction.receipt.check_number,
      date: extraction.receipt.date,
      paymentMethod: extraction.receipt.payment_method,
      subtotal: extraction.receipt.subtotal,
      levelDiscount: extraction.receipt.receipt_level_discount || null,
      discountTotal: extraction.receipt.discount_total,
      tax: extraction.receipt.tax_total,
      fee: extraction.receipt.fee_total,
      total: extraction.receipt.total_amount,
    },
    original: {
      receipt: { ...extraction.receipt },
      items: extraction.items.map((item) => ({ ...item })),
      rawText: String(rawText || ''),
      // Giữ toàn bộ kết quả trích xuất ban đầu (chưa qua UI) để debug:
      // dòng đã phân loại, dòng đã gộp, điều chỉnh và kết quả kiểm tra số học.
      extraction: {
        lines: extraction.lines,
        scan: extraction.scan,
        adjustments: extraction.adjustments,
        validation: extraction.validation,
      },
    },
    meta: { nextItemId: counter + 1 },
  });
}

// Tính lại thành tiền từng dòng và trạng thái đối chiếu. Không sửa số liệu gốc.
export function recompute(session) {
  const next = clone(session);
  next.items.forEach((item) => {
    const qty = Number.isFinite(item.quantity) ? item.quantity : null;
    const unit = Number.isFinite(item.unitPrice) ? item.unitPrice : null;
    const gross = qty !== null && unit !== null ? qty * unit : (Number.isFinite(item.printedGross) ? item.printedGross : item.grossAmount);
    item.grossAmount = Number.isFinite(gross) ? gross : null;
    const discount = Math.abs(Number(item.discountAmount) || 0);
    item.discountAmount = discount;
    item.netAmount = item.grossAmount === null ? null : Math.max(0, item.grossAmount - discount);
    const missing = [];
    if (qty === null) missing.push('số lượng');
    if (unit === null) missing.push('đơn giá');
    item.needsReview = missing.length > 0;
    item.reviewReason = missing.length ? `Chưa rõ ${missing.join(' và ')}` : null;
    // Trạng thái xác minh + biểu thức số học cho từng dòng (hiển thị cạnh dòng).
    item.verification = verifyItem(item);
  });
  next.verification = reconcile({ items: next.items, receipt: next.receipt });
  return next;
}

export function addManualItem(session, patch = {}) {
  const next = clone(session);
  const id = `it-${next.meta.nextItemId}`;
  next.meta.nextItemId += 1;
  next.items.push({
    id,
    sourceLineIndex: null,
    name: patch.name || '',
    quantity: patch.quantity ?? null,
    unitPrice: patch.unitPrice ?? null,
    printedGross: patch.grossAmount ?? null,
    discountAmount: patch.discountAmount || 0,
    category: patch.category || categoryKey(patch.name || ''),
    confidence: 1,
    modifiers: [],
    manuallyAdded: true,
  });
  return recompute(next);
}

export function updateItem(session, id, patch = {}) {
  const next = clone(session);
  const item = next.items.find((entry) => entry.id === id);
  if (!item) return next;
  Object.assign(item, patch);
  if (patch.name !== undefined) item.category = patch.category || categoryKey(patch.name);
  return recompute(next);
}

export function removeItem(session, id) {
  const next = clone(session);
  next.items = next.items.filter((item) => item.id !== id);
  return recompute(next);
}

// Đổi loại một dòng OCR. Khi đổi thành "sản phẩm" thì bổ sung dòng vào bảng.
export function reclassifyLine(session, lineIndex, type) {
  const next = clone(session);
  const line = next.lines.find((entry) => entry.index === Number(lineIndex));
  if (!line) return next;
  const previous = line.type;
  line.type = type;
  const amount = line.amount;

  if (type === 'product' && previous !== 'product') {
    if (!next.items.some((item) => item.sourceLineIndex === line.index)) {
      const parsed = extractProduct(line.text);
      const id = `it-${next.meta.nextItemId}`;
      next.meta.nextItemId += 1;
      next.items.push({
        id,
        sourceLineIndex: line.index,
        name: parsed?.name_original || line.text,
        quantity: parsed?.quantity ?? null,
        unitPrice: parsed?.unit_price ?? null,
        printedGross: parsed?.gross_amount ?? null,
        discountAmount: 0,
        category: categoryKey(parsed?.name_original || line.text),
        confidence: parsed ? parsed.confidence : 0.4,
        modifiers: [],
        manuallyAdded: true,
      });
    }
  } else if (previous === 'product' && type !== 'product') {
    next.items = next.items.filter((item) => item.sourceLineIndex !== line.index);
  }

  if (type === 'discount' && amount !== null) next.receipt.levelDiscount = Math.abs(amount);
  else if (type === 'tax' && amount !== null) next.receipt.tax = amount;
  else if (type === 'fee' && amount !== null) next.receipt.fee = amount;
  else if (type === 'subtotal' && amount !== null) next.receipt.subtotal = amount;
  else if (type === 'total' && amount !== null) next.receipt.total = amount;
  else if (type === 'payment') next.receipt.paymentMethod = line.text;
  else if (type === 'metadata' && !next.receipt.checkNumber) {
    const match = line.text.match(/check\s*[:：]?\s*(\d+)/i);
    if (match) next.receipt.checkNumber = match[1];
  }

  return recompute(next);
}

// Các trường cần người dùng xác nhận trước khi "Xác nhận dữ liệu chuẩn".
export function reviewFields(session) {
  const fields = [];
  if (!session.receipt.total) fields.push('Tổng thanh toán');
  session.items.forEach((item, index) => {
    if (item.needsReview) fields.push(`Dòng ${index + 1}: ${item.name || '(chưa có tên)'}`);
  });
  return fields;
}

export function canConfirm(session) {
  return session.verification?.status === 'verified' && reviewFields(session).length === 0;
}

// Chuyển phiên thành labeledFields cho pipeline lưu mẫu (training.js).
export function buildLabeledFields(session, { brandLabel } = {}) {
  const r = session.receipt;
  const fields = {};
  if (brandLabel || r.merchantName) fields.brand = brandLabel || r.merchantName;
  if (r.checkNumber) fields.checkNo = String(r.checkNumber);
  if (r.date) fields.datetime = r.date;
  if (r.subtotal !== null && r.subtotal !== undefined) fields.subtotal = String(r.subtotal);
  if (r.total !== null && r.total !== undefined) fields.total = String(r.total);
  if (r.paymentMethod) fields.payment = r.paymentMethod;
  fields.items = session.items.map((item) => ({
    qty: item.quantity,
    name: item.name,
    price: item.unitPrice,
    discount: item.discountAmount ? -Math.abs(item.discountAmount) : 0,
    amount: item.netAmount,
  }));
  return fields;
}

// Số trường người dùng đã sửa so với kết quả OCR gốc (để hiển thị ở lịch sử).
export function editedFieldCount(session) {
  let count = 0;
  const o = session.original?.receipt || {};
  const r = session.receipt;
  const compare = (a, b) => (a ?? null) !== (b ?? null);
  if (compare(o.total_amount, r.total)) count += 1;
  if (compare(o.subtotal, r.subtotal)) count += 1;
  if (compare(o.tax_total, r.tax)) count += 1;
  if (compare(o.check_number, r.checkNumber)) count += 1;
  const originalItems = session.original?.items || [];
  if (originalItems.length !== session.items.length) count += Math.abs(originalItems.length - session.items.length);
  session.items.forEach((item, index) => {
    const orig = originalItems[index];
    if (!orig) return;
    if ((orig.name_original || '') !== (item.name || '')) count += 1;
    if ((orig.quantity ?? null) !== (item.quantity ?? null)) count += 1;
    if ((orig.unit_price ?? null) !== (item.unitPrice ?? null)) count += 1;
  });
  return count;
}

export { LINE_TYPE_LABELS };
