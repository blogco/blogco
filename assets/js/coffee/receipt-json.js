// Bước trung gian "OCR → JSON → form": đóng gói kết quả OCR thành một JSON chuẩn,
// rồi từ JSON đó điền vào các trường nhận dạng thông tin của form.
//
// Toàn bộ hàm thuần (không đụng DOM) để chạy được trong Node và kiểm thử với hoá
// đơn mẫu. JSON chuẩn dùng chung một khoá cho cả UI lẫn export.

import { parseHighlandsInvoice, parseHighlandsReceipt } from './ocr.js';

export const RECEIPT_JSON_SCHEMA = 'blogco.coffee.receipt.v1';

function round(value) {
  return value === null || value === undefined || value === '' ? null : Math.round(Number(value));
}

// Chuẩn hoá một dòng món về dạng JSON: đơn giá gốc và thành tiền GỘP (trước giảm),
// giảm giá tách riêng để tổng tiền luôn tính lại được.
function itemToJson(item) {
  const qty = Number(item.qty) || 1;
  const unitPrice = round(item.unitPrice);
  const gross = unitPrice !== null ? unitPrice * qty : round(item.amount);
  return {
    name: String(item.name || '').trim(),
    qty,
    unitPrice,
    amount: gross,
    discount: Math.abs(round(item.discount) || 0),
    discountLabel: item.discountLabel || null,
    category: item.category || 'other',
  };
}

// Dựng JSON chuẩn từ text OCR thô. Không bịa dữ liệu: trường không đọc được = null.
export function buildReceiptJson(rawText) {
  const text = String(rawText || '');
  const legacy = parseHighlandsInvoice(text); // shape app cũ (amount = net)
  const region = parseHighlandsReceipt(text); // shape theo vùng A–I (customer, payment…)

  const items = legacy.items.map(itemToJson);
  const itemDiscount = items.reduce((sum, item) => sum + item.discount, 0);
  const levelDiscount = Math.abs(round(legacy.discount) || 0);
  const discount = itemDiscount + levelDiscount;
  const itemsGross = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  const warnings = [];
  if (!items.length) warnings.push('Không nhận diện được dòng sản phẩm nào.');
  if (legacy.total === null || legacy.total === undefined) warnings.push('Không đọc được tổng thanh toán.');
  const expectedTotal = itemsGross - discount + (round(legacy.vat) || 0);
  if (legacy.total !== null && legacy.total !== undefined && items.length && expectedTotal !== legacy.total) {
    warnings.push(`Tổng các dòng (${expectedTotal.toLocaleString('vi-VN')} đ) lệch so với tổng in trên hoá đơn (${Number(legacy.total).toLocaleString('vi-VN')} đ).`);
  }

  return {
    schema: RECEIPT_JSON_SCHEMA,
    source: 'ocr',
    merchant: legacy.store || region.brand || '',
    address: legacy.address || region.address || '',
    phone: region.phone || '',
    shopId: region.shopId || '',
    checkNo: legacy.orderCode || region.checkNo || '',
    pager: region.pager || '',
    pos: region.pos || '',
    cashier: region.cashier || '',
    customer: region.customer || '',
    datetime: {
      text: region.datetime || '',
      date: legacy.date || '',
      time: legacy.time || '',
    },
    payment: {
      label: region.payment || '',
      method: legacy.paymentMethod || '',
    },
    items,
    totals: {
      subtotal: legacy.subtotal ?? (itemsGross || null),
      discount,
      vat: round(legacy.vat) || 0,
      total: round(legacy.total),
    },
    confidence: items.length && !warnings.length ? 'high' : items.length ? 'medium' : 'low',
    warnings,
    rawText: text,
  };
}

// Từ JSON chuẩn → dữ liệu điền vào form nhận dạng. `subtotal` để null cho form tự
// tính lại từ các dòng (tránh mâu thuẫn khi tổng in lệch).
export function receiptJsonToForm(json) {
  if (!json) return null;
  return {
    store: json.merchant || '',
    address: json.address || '',
    date: json.datetime?.date || '',
    time: json.datetime?.time || '',
    orderCode: json.checkNo || '',
    customer: json.customer || '',
    paymentMethod: json.payment?.method || '',
    items: (json.items || []).map((item) => ({
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice ?? '',
      amount: item.amount ?? '',
      category: item.category,
    })),
    subtotal: null,
    discount: json.totals?.discount || 0,
    vat: json.totals?.vat || 0,
    total: json.totals?.total ?? null,
    ocrText: json.rawText || '',
  };
}
