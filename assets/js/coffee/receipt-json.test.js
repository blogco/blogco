import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptJson, computeInvoiceTotal, receiptJsonToForm } from './receipt-json.js';

// Văn bản mô phỏng lớp text trích từ một hoá đơn PDF (POS) — mỗi dòng đã được
// gom theo bbox như extractPdfText trả về.
const PDF_TEXT = [
  'HIGHLANDS COFFEE',
  'Ngày: 15/10/2026 09:12',
  'Check: 000123',
  '1  Phin Sữa Đá        45.000   45.000',
  '2  Trà Thạch Đào      50.000   100.000',
  '1  Bánh Croissant     35.000   35.000',
  'Giảm giá (coupon)             20.000',
  'Tổng tiền hàng                180.000',
  'VAT                           10.000',
  'Tổng thanh toán               170.000',
  'Tiền mặt                      200.000',
].join('\n');

test('buildReceiptJson structures PDF text into standard JSON', () => {
  const json = buildReceiptJson(PDF_TEXT);
  assert.equal(json.schema, 'blogco.coffee.receipt.v1');
  assert.equal(json.source, 'pdf-text');
  assert.match(json.merchant_name, /highlands/i);
  assert.equal(json.date, '2026-10-15');

  assert.equal(json.items.length, 3);
  const first = json.items[0];
  assert.equal(first.name, 'Phin Sữa Đá');
  assert.equal(first.qty, 1);
  assert.equal(first.unitPrice, 45000);
  assert.equal(first.amount, 45000);

  const tea = json.items.find((item) => /Trà Thạch Đào/.test(item.name));
  assert.equal(tea.qty, 2);
  assert.equal(tea.unitPrice, 50000);
  assert.equal(tea.amount, 100000);
});

test('buildReceiptJson recomputes total = sum(items) - discount + tax', () => {
  const json = buildReceiptJson(PDF_TEXT);
  assert.equal(json.subtotal, 180000);
  assert.equal(json.discount_total, 20000);
  assert.equal(json.tax_total, 10000);
  // 180.000 - 20.000 + 10.000 = 170.000 (khớp tổng in trên hoá đơn).
  assert.equal(json.total_amount, 170000);
  assert.equal(json.printed_total, 170000);
  assert.equal(computeInvoiceTotal(json), 170000);
});

test('computeInvoiceTotal ignores a wrong printed total and uses line items', () => {
  const json = buildReceiptJson(PDF_TEXT);
  // Giả sử hoá đơn in sai tổng: vẫn phải tính lại từ danh sách món.
  json.printed_total = 999999;
  assert.equal(computeInvoiceTotal(json), 170000);
});

test('receiptJsonToForm maps fields and leaves totals for the form to derive', () => {
  const json = buildReceiptJson(PDF_TEXT);
  const form = receiptJsonToForm(json);
  assert.equal(form.store, json.merchant_name);
  assert.equal(form.date, '2026-10-15');
  assert.equal(form.discount, 20000);
  assert.equal(form.vat, 10000);
  // Form tự tính lại tổng từ món → không ghi đè bằng số in.
  assert.equal(form.total, null);
  assert.equal(form.subtotal, null);
  assert.equal(form.printedTotal, 170000);
  assert.equal(form.items.length, 3);
  assert.ok(form.items.every((item) => typeof item.name === 'string' && item.qty >= 1));
});

test('buildReceiptJson reports warnings when nothing is recognised', () => {
  const json = buildReceiptJson('không có gì ở đây');
  assert.equal(json.items.length, 0);
  assert.equal(json.confidence, 'low');
  assert.ok(json.warnings.some((w) => /Không nhận diện được dòng sản phẩm/.test(w)));
});
