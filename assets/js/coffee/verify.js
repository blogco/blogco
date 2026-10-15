// Đối chiếu tiền tệ cho hoá đơn (hàm thuần, tách khỏi giao diện).
//
// Nguyên tắc:
//  - Phân biệt giá trị OCR đọc trực tiếp với giá trị hệ thống tự tính.
//  - Không sửa số liệu gốc để ép tổng khớp.
//  - Chỉ báo "đã đối chiếu" khi các điều kiện thực sự đạt.
//  - Thiếu dữ liệu → "insufficient", không đoán.

export const TOLERANCE = 1;

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Chuẩn hoá số nguyên tiền; trả null khi để trống / không hợp lệ.
export function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

// Thành tiền sau giảm của một dòng.
export function netOf(item = {}) {
  const gross = num(item.grossAmount) ?? num(item.gross_amount);
  if (gross === null) return null;
  const discount = num(item.discountAmount) ?? num(item.discount_amount) ?? 0;
  return Math.max(0, gross - Math.abs(discount));
}

// Tổng tiền hàng trước giảm = SL × đơn giá gốc (khi xác định được), nếu thiếu thì
// dùng thành tiền in trên dòng.
export function grossOf(item = {}) {
  const qty = toIntOrNull(item.quantity);
  const unit = toIntOrNull(item.unitPrice ?? item.unit_price);
  if (qty !== null && unit !== null) return qty * unit;
  return num(item.grossAmount) ?? num(item.gross_amount);
}

// Đối chiếu model { items, receipt } → báo cáo đầy đủ cho UI.
export function reconcile({ items = [], receipt = {} } = {}) {
  const rows = items.filter((item) => item && item.excluded !== true);

  const grossSum = rows.reduce((sum, item) => sum + (grossOf(item) ?? 0), 0);
  const itemDiscountSum = rows.reduce((sum, item) => sum + Math.abs(num(item.discountAmount) ?? num(item.discount_amount) ?? 0), 0);
  const computable = rows.filter((item) => netOf(item) !== null);
  const netSum = computable.reduce((sum, item) => sum + netOf(item), 0);
  const unresolvedItems = rows.filter((item) => netOf(item) === null || toIntOrNull(item.quantity) === null || toIntOrNull(item.unitPrice ?? item.unit_price) === null);

  const levelDiscount = Math.abs(toIntOrNull(receipt.levelDiscount ?? receipt.receipt_level_discount) ?? 0);
  const tax = toIntOrNull(receipt.tax ?? receipt.tax_total) ?? 0;
  const fee = toIntOrNull(receipt.fee ?? receipt.fee_total) ?? 0;
  const discountTotal = itemDiscountSum + levelDiscount;
  const printedSubtotal = toIntOrNull(receipt.subtotal);
  const printedTotal = toIntOrNull(receipt.total ?? receipt.total_amount);
  const printedDiscount = toIntOrNull(receipt.discountTotal ?? receipt.discount_total);

  const computedTotal = netSum + tax + fee - levelDiscount;
  const discrepancy = printedTotal !== null ? printedTotal - computedTotal : null;

  const missing = [];
  if (printedTotal === null) missing.push('tổng thanh toán');
  if (!rows.length) missing.push('danh sách sản phẩm');

  let status = 'insufficient';
  if (printedTotal === null) {
    status = 'insufficient';
  } else if (!rows.length) {
    status = 'insufficient';
  } else if (unresolvedItems.length) {
    status = 'review';
  } else if (discrepancy !== null && Math.abs(discrepancy) <= TOLERANCE) {
    status = 'verified';
  } else {
    status = 'mismatch';
  }

  const messages = [];
  if (status === 'insufficient') messages.push('Chưa đủ dữ liệu để xác minh (thiếu tổng thanh toán hoặc sản phẩm).');
  if (status === 'review') messages.push(`${unresolvedItems.length} dòng còn thiếu số lượng/đơn giá cần xác nhận.`);
  if (status === 'mismatch' && discrepancy !== null) {
    messages.push(`Tổng AI tính (${computedTotal.toLocaleString('vi-VN')} đ) lệch ${discrepancy.toLocaleString('vi-VN')} đ so với tổng trên hoá đơn.`);
  }
  if (status === 'verified') messages.push('Tổng khớp giữa các dòng và tổng trên hoá đơn.');

  return {
    grossSum,
    itemDiscountSum,
    levelDiscount,
    discountTotal,
    printedDiscount,
    tax,
    fee,
    netSum,
    computedTotal,
    printedSubtotal,
    printedTotal,
    discrepancy,
    tolerance: TOLERANCE,
    unresolvedItems: unresolvedItems.map((item) => item.id ?? item.name),
    missing,
    status,
    verified: status === 'verified',
    messages,
  };
}

export const VERIFY_STATUS = {
  verified: { label: 'Đã đối chiếu', tone: 'success' },
  review: { label: 'Cần kiểm tra', tone: 'warning' },
  mismatch: { label: 'Lệch tổng tiền', tone: 'danger' },
  insufficient: { label: 'Chưa đủ dữ liệu', tone: 'muted' },
};
