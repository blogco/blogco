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

// ---------------------------------------------------------------------------
// Chuẩn hoá tiền tệ — ĐỘC LẬP với AI (hàm thuần, có unit test).
// ---------------------------------------------------------------------------
//
// Không xoá dấu chấm/phẩy một cách mù quáng; phải suy ra định dạng số theo ngữ
// cảnh (vi-VN dùng "." phân nhóm nghìn, "," thập phân; en-US ngược lại).
//  69.000      → 69000
//  1.200.000   → 1200000
//  55.200      → 55200
//  1,200,000   → 1200000
//  1.200.000,50→ 1200000.5
//  '100.200 đ' → 100200
//  '' / 'abc'  → null   (KHÔNG quy về 0)
export function normalizeMoney(raw, { locale = 'vi-VN' } = {}) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  // Chỉ giữ chữ số và dấu phân cách; ký hiệu tiền tệ/đơn vị bị loại bỏ.
  let value = String(raw).replace(/[^\d.,]/g, '');
  if (!/\d/.test(value)) return null;

  const hasDot = value.includes('.');
  const hasComma = value.includes(',');
  if (hasDot && hasComma) {
    // Dấu xuất hiện sau cùng là dấu thập phân.
    const lastDot = value.lastIndexOf('.');
    const lastComma = value.lastIndexOf(',');
    if (lastDot > lastComma) value = value.replace(/,/g, '');
    else value = value.replace(/\./g, '').replace(',', '.');
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = value.split(sep);
    const looksGrouped = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
    if (looksGrouped) {
      // "69.000" / "1.200.000" — dấu là phân nhóm nghìn.
      value = parts.join('');
    } else if (parts.length === 2 && parts[1].length > 2) {
      // "1200.000" — nhóm nghìn bị thiếu ở nhóm đầu.
      value = parts.join('');
    } else if (parts.length === 2) {
      // "12.5" / "12,5" — dấu thập phân theo locale.
      value = `${parts[0]}.${parts.slice(1).join('')}`;
    } else {
      value = parts.join('');
    }
    void locale;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Chuẩn hoá số nguyên tiền; trả null khi để trống / không hợp lệ.
export function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : normalizeMoney(value);
  if (parsed === null || !Number.isFinite(parsed)) return null;
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

// Trạng thái xác minh của MỘT dòng sản phẩm, kèm biểu thức số học để UI hiển thị
// cạnh mỗi dòng. Không tự bịa số: thiếu dữ liệu → "review".
export const ITEM_VERIFY_STATUS = {
  verified: { label: 'Khớp', tone: 'success' },
  review: { label: 'Cần kiểm tra', tone: 'warning' },
  mismatch: { label: 'Lệch số học', tone: 'danger' },
};

function money(value) {
  return `${Math.round(value).toLocaleString('vi-VN')} đ`;
}

// Xác minh số học một dòng: SL × đơn giá gốc − giảm giá = thành tiền sau giảm.
export function verifyItem(item = {}) {
  const qty = toIntOrNull(item.quantity);
  const unit = toIntOrNull(item.unitPrice ?? item.unit_price);
  const discount = Math.abs(toIntOrNull(item.discountAmount ?? item.discount_amount) ?? 0);
  const printedGross = toIntOrNull(item.printedGross ?? item.grossAmount ?? item.gross_amount);
  const net = toIntOrNull(item.netAmount ?? item.net_amount);

  const computedGross = qty !== null && unit !== null ? qty * unit : null;
  const gross = printedGross ?? computedGross;

  let status = 'review';
  let expression = '';

  if (gross !== null && unit !== null && discount > 0) {
    expression = `${money(unit)} − ${money(discount)} = ${money(Math.max(0, gross - discount))}`;
  } else if (gross !== null) {
    expression = money(gross);
  } else if (unit !== null) {
    expression = money(unit);
  }

  if (gross === null || unit === null || qty === null) {
    status = 'review';
  } else {
    const expectedNet = Math.max(0, gross - discount);
    if (net !== null && Math.abs(net - expectedNet) > TOLERANCE) status = 'mismatch';
    else if (printedGross !== null && computedGross !== null && Math.abs(printedGross - computedGross) > TOLERANCE) status = 'mismatch';
    else status = 'verified';
  }

  return {
    status,
    label: ITEM_VERIFY_STATUS[status].label,
    tone: ITEM_VERIFY_STATUS[status].tone,
    expression,
    quantity: qty,
    unitPrice: unit,
    discountAmount: discount,
    grossAmount: gross,
    netAmount: gross === null ? net : Math.max(0, gross - discount),
  };
}

// Nhãn trạng thái cho một dòng OCR thô (vùng D/E/F/G…). Dòng không phải sản phẩm
// luôn ghi rõ "không tự tính là món" để người dùng không nhầm với sản phẩm.
export function verifyLine(line = {}) {
  const type = line.type || 'unknown';
  const amount = toIntOrNull(line.amount);
  const hasAmount = amount !== null;

  switch (type) {
    case 'product':
      return { status: 'product', label: hasAmount ? money(amount) : 'Chưa có số tiền', tone: hasAmount ? 'muted' : 'warning' };
    case 'metadata':
      return { status: 'metadata', label: 'Cần xác minh — có thể là metadata', tone: 'warning' };
    case 'unknown':
      return hasAmount
        ? { status: 'ambiguous', label: 'Cần xác minh — không tự tính là món', tone: 'warning' }
        : { status: 'unclassified', label: 'Cần phân loại — không tự tính là món', tone: 'warning' };
    case 'modifier':
      return { status: 'modifier', label: 'Tùy chọn / topping — không tính là món', tone: 'muted' };
    case 'discount':
      return { status: 'discount', label: hasAmount ? `Giảm giá − ${money(amount)}` : 'Giảm giá', tone: 'muted' };
    case 'tax':
      return { status: 'tax', label: hasAmount ? `Thuế ${money(amount)}` : 'Thuế', tone: 'muted' };
    case 'fee':
      return { status: 'fee', label: hasAmount ? `Phí ${money(amount)}` : 'Phí / dịch vụ', tone: 'muted' };
    case 'subtotal':
      return { status: 'subtotal', label: hasAmount ? `Tổng tiền hàng ${money(amount)}` : 'Tổng tiền hàng', tone: 'muted' };
    case 'total':
      return { status: 'total', label: hasAmount ? `Tổng thanh toán ${money(amount)}` : 'Tổng thanh toán', tone: 'muted' };
    case 'payment':
      return { status: 'payment', label: 'Thanh toán — không tính là món', tone: 'muted' };
    default:
      return { status: type, label: 'Không xác định', tone: 'muted' };
  }
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
