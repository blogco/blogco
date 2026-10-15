// Bước "PDF → JSON chuẩn → form" cho trang nhập hoá đơn (#/coffee/add).
//
// Quy trình mới (thay cho OCR ảnh):
//   1. Người dùng tải file PDF hoá đơn.
//   2. `extractPdfText` (ocr.js) đọc thẳng lớp văn bản của PDF (không OCR ảnh).
//   3. `buildReceiptJson` cấu trúc văn bản thành JSON chuẩn: tên cửa hàng, danh
//      sách món (số lượng, đơn giá, thành tiền), giảm giá, thuế, tổng tiền và
//      ngày giao dịch.
//   4. `receiptJsonToForm` điền JSON vào các trường của form.
//   5. Form tự TÍNH LẠI tổng tiền = Σ(thành tiền món) − giảm giá + thuế.
//
// Các hàm dưới đây thuần (không đụng DOM) nên chạy và kiểm thử được trong Node.

import { extractReceipt } from './extract.js';
import { classifyItem } from './menu.js';

export const RECEIPT_JSON_SCHEMA = 'blogco.coffee.receipt.v1';

function round(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function absolute(value) {
  const n = round(value);
  return n === null ? 0 : Math.abs(n);
}

// Dựng JSON chuẩn từ văn bản hoá đơn (text layer của PDF, hoặc text OCR).
// Không bịa dữ liệu: trường không đọc được = rỗng/null.
export function buildReceiptJson(rawText) {
  const text = String(rawText || '');
  const { receipt, items: extracted, validation } = extractReceipt(text);

  const items = (extracted || []).map((item) => {
    const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
    const unitPrice = round(item.unit_price);
    const gross = item.gross_amount !== null && item.gross_amount !== undefined
      ? round(item.gross_amount)
      : (unitPrice !== null ? unitPrice * qty : null);
    const discount = absolute(item.discount_amount);
    const name = String(item.name_original || '').trim();
    return {
      name,
      qty,
      unitPrice,
      amount: gross,                     // thành tiền trước giảm = đơn giá × SL
      discount,                          // giảm giá gắn riêng dòng (nếu có)
      netAmount: gross === null ? null : Math.max(0, gross - discount),
      category: classifyItem(name),
    };
  });

  const itemsGross = items.reduce((sum, item) => sum + (item.amount || 0), 0);
  const itemsDiscount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
  const discountTotal = receipt.discount_total !== null && receipt.discount_total !== undefined
    ? absolute(receipt.discount_total)
    : itemsDiscount;
  const taxTotal = absolute(receipt.tax_total);
  const printedTotal = round(receipt.total_amount);

  // Tổng tiền cuối cùng LUÔN được tính lại từ danh sách món sau khi trừ giảm giá.
  const computedTotal = Math.max(0, itemsGross - discountTotal + taxTotal);

  const warnings = [...(validation?.warnings || [])];
  if (!items.length) warnings.push('Không nhận diện được dòng sản phẩm nào từ hoá đơn.');
  if (printedTotal !== null && printedTotal !== computedTotal) {
    warnings.push(`Tổng tính lại (${computedTotal.toLocaleString('vi-VN')} đ) lệch so với tổng in trên hoá đơn (${printedTotal.toLocaleString('vi-VN')} đ).`);
  }

  return {
    schema: RECEIPT_JSON_SCHEMA,
    source: 'pdf-text',
    merchant_name: receipt.merchant_name || '',
    date: receipt.date || '',
    currency: receipt.currency || 'VND',
    items,
    subtotal: itemsGross,
    discount_total: discountTotal,
    tax_total: taxTotal,
    total_amount: computedTotal,
    printed_total: printedTotal,
    confidence: items.length ? (warnings.length ? 'medium' : 'high') : 'low',
    warnings,
    rawText: text,
  };
}

// Tổng tiền = Σ(thành tiền món) − giảm giá + thuế. Hàm thuần để kiểm thử.
export function computeInvoiceTotal(json) {
  if (!json) return 0;
  const itemsGross = (json.items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return Math.max(0, itemsGross - (Number(json.discount_total) || 0) + (Number(json.tax_total) || 0));
}

// JSON chuẩn → giá trị điền vào form. `subtotal`/`total` để null để form tự tính
// lại từ danh sách món (tránh mâu thuẫn khi tổng in trên hoá đơn bị lệch).
export function receiptJsonToForm(json) {
  if (!json) return null;
  return {
    store: json.merchant_name || '',
    date: json.date || '',
    items: (json.items || []).map((item) => ({
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice ?? '',
      amount: item.amount ?? '',
      category: item.category || 'other',
    })),
    discount: json.discount_total || 0,
    vat: json.tax_total || 0,
    subtotal: null,
    total: null,
    printedTotal: json.printed_total ?? null,
    ocrText: json.rawText || '',
  };
}
