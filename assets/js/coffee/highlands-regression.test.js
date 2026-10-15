import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLine, extractReceipt, extractProduct } from './extract.js';
import { normalizeMoney, verifyItem, verifyLine } from './verify.js';
import { createSession } from './training-model.js';
import { groupTextItems, isReliableText, parseItemLine, parseHighlandsInvoice, fixVietnamese } from './ocr.js';

// ---------------------------------------------------------------------------
// Regression: hoá đơn Highlands 15-10-2026 (OCR thô còn lỗi Tesseract).
//
// Giá trị tham chiếu lấy từ hoá đơn gốc — KHÔNG hardcode vào logic production,
// chỉ dùng làm expected output cho test:
//   Matcha(Di) Latte Da L : 1 × 69.000 − 13.800 = 55.200
//   Banh Dua              : 1 × 45.000           = 45.000
//   Tổng thanh toán       :                        100.200
//
// Các dòng "SOT:", "Checks", "Co Tham tien" TUYỆT ĐỐI không được tự tính là món.
// ---------------------------------------------------------------------------
const REAL_OCR = [
  'HIGHLANDS COFFEE',
  'gGHựi 1B Hg tag, Phuong Cho Lon, TP.HN',
  'SOT: 028.7301.6978',
  'ShopID: 1039',
  'Checks 174294 POS01',
  'Ngay: 15-10-2026 06:52',
  'Thu rean: Thu Ngan ca sang 1',
  '1 MatchaDi Latte Da L 69.000',
  '-Ecoce Coupon giae -13.800',
  'Co Tham tien 100.200',
  '1 Y tt 45.000',
  'Thanh tien: 100.200',
  'Tong thanh toan: 100.200',
  'Payoo Bark Card 100.200',
].join('\n');

test('normalizeMoney: nhận đúng định dạng vi-VN, không quy số không đọc được về 0', () => {
  assert.equal(normalizeMoney('69.000'), 69000);
  assert.equal(normalizeMoney('55.200'), 55200);
  assert.equal(normalizeMoney('100.200'), 100200);
  assert.equal(normalizeMoney('1.200.000'), 1200000);
  assert.equal(normalizeMoney('1,200,000'), 1200000);
  assert.equal(normalizeMoney('100.200 đ'), 100200);
  assert.equal(normalizeMoney(69000), 69000);
  assert.equal(normalizeMoney(''), null);
  assert.equal(normalizeMoney('   '), null);
  assert.equal(normalizeMoney('không có'), null);
  assert.equal(normalizeMoney(null), null);
  assert.equal(normalizeMoney(undefined), null);
});

test('classifyLine: SĐT/check/tổng không bao giờ là sản phẩm', () => {
  assert.notEqual(classifyLine('SOT: 028.7301.6978'), 'product');
  assert.equal(classifyLine('SOT: 028.7301.6978'), 'metadata');
  assert.notEqual(classifyLine('028.7301.6978'), 'product');
  assert.equal(classifyLine('Checks 174294'), 'metadata');
  assert.equal(classifyLine('Check: 174294 POS01'), 'metadata');
  assert.notEqual(classifyLine('Co Tham tien 100.200'), 'product');
  assert.equal(classifyLine('Co Tham tien 100.200'), 'unknown');
  assert.notEqual(classifyLine('Tong thanh toan: 100.200'), 'product');
  // Dòng sản phẩm thật vẫn phải nhận đúng.
  assert.equal(classifyLine('1 MatchaDi Latte Da L 69.000'), 'product');
  assert.equal(classifyLine('1 Y tt 45.000'), 'product');
  assert.equal(classifyLine('Banh Dua 45.000'), 'product');
});

test('extractProduct: không lấy số điện thoại làm đơn giá/thành tiền', () => {
  // Nếu có ai đó cố ép dòng SĐT thành sản phẩm, số tiền vẫn không được bịa.
  const item = extractProduct('Co Tham tien 100.200');
  assert.equal(item.quantity, null);
  assert.equal(item.unit_price, null);
  assert.ok(!/\b28730\b/.test(JSON.stringify(item)));
});

test('extractReceipt (Highlands thực tế): giữ đúng đơn giá gốc, coupon là giảm giá', () => {
  const result = extractReceipt(REAL_OCR);

  // Không có sản phẩm ma từ SĐT/check/Co Tham tien.
  assert.equal(result.items.length, 2);
  assert.ok(!result.items.some((item) => /sot|check|co tham/i.test(item.name_original)));
  assert.ok(!result.items.some((item) => /coupon|ecode/i.test(item.name_original)));

  const [matcha, banhDua] = result.items;
  assert.equal(matcha.name_original, 'Matcha Latte Da L');
  assert.equal(matcha.quantity, 1);
  assert.equal(matcha.unit_price, 69000);
  assert.equal(matcha.gross_amount, 69000);
  assert.equal(matcha.discount_amount, 13800);
  assert.equal(matcha.net_amount, 55200);

  assert.equal(banhDua.name_original, 'Banh Dua');
  assert.equal(banhDua.quantity, 1);
  assert.equal(banhDua.unit_price, 45000);
  assert.equal(banhDua.net_amount, 45000);

  assert.equal(result.receipt.subtotal, 100200);
  assert.equal(result.receipt.total_amount, 100200);
  assert.equal(result.receipt.check_number, '174294');
  assert.equal(result.validation.arithmetic_check, 'passed');
  assert.equal(result.validation.discrepancy_amount, 0);
});

test('createSession (Highlands thực tế): 69.000 − 13.800 = 55.200; 55.200 + 45.000 = 100.200', () => {
  const session = createSession(REAL_OCR, { fileName: 'highlands.pdf' });

  assert.equal(session.items.length, 2);
  assert.equal(session.verification.status, 'verified');
  assert.equal(session.verification.netSum, 100200);
  assert.equal(session.verification.printedTotal, 100200);
  assert.equal(session.verification.discrepancy, 0);

  const matcha = verifyItem(session.items.find((item) => /matcha/i.test(item.name)));
  assert.equal(matcha.quantity, 1);
  assert.equal(matcha.unitPrice, 69000);
  assert.equal(matcha.discountAmount, 13800);
  assert.equal(matcha.netAmount, 55200);
  assert.equal(matcha.status, 'verified');
  assert.match(matcha.expression, /69\.000.*13\.800.*55\.200/);

  const banhDua = verifyItem(session.items.find((item) => /banh dua/i.test(item.name)));
  assert.equal(banhDua.unitPrice, 45000);
  assert.equal(banhDua.netAmount, 45000);

  // Raw OCR + trích xuất gốc được giữ lại để debug.
  assert.equal(session.original.rawText, REAL_OCR);
  assert.ok(session.original.extraction.validation);
  assert.equal(session.original.extraction.validation.arithmetic_check, 'passed');
});

test('verifyLine: gắn trạng thái xác minh cho từng dòng OCR', () => {
  assert.match(verifyLine({ type: 'metadata', amount: null }).label, /metadata/);
  assert.match(verifyLine({ type: 'unknown', amount: null }).label, /Cần phân loại/);
  assert.match(verifyLine({ type: 'unknown', amount: 100200 }).label, /không tự tính là món/);
  assert.match(verifyLine({ type: 'total', amount: 100200 }).label, /100\.200/);
  assert.match(verifyLine({ type: 'discount', amount: 13800 }).label, /13\.800/);
});

test('groupTextItems: giữ thứ tự đọc và quan hệ tên ↔ cột tiền', () => {
  // Mảnh text lộn xộn theo trục X nhưng cùng dòng Y → phải ghép đúng trái→phải.
  const items = [
    { str: '69.000', transform: [1, 0, 0, 10, 220, 700], width: 40 },
    { str: '1', transform: [1, 0, 0, 10, 20, 700], width: 6 },
    { str: 'Matcha', transform: [1, 0, 0, 10, 34, 700], width: 30 },
    { str: 'Latte', transform: [1, 0, 0, 10, 70, 700], width: 26 },
    { str: 'Tong', transform: [1, 0, 0, 10, 20, 680], width: 26 },
    { str: '100.200', transform: [1, 0, 0, 10, 220, 680], width: 46 },
  ];
  const lines = groupTextItems(items);
  assert.equal(lines[0].text, '1 Matcha Latte 69.000');
  assert.equal(lines[1].text, 'Tong 100.200');
  // Dòng trên có bbox và nằm trên dòng dưới.
  assert.ok(lines[0].bbox.y0 >= lines[1].bbox.y1);
});

test('isReliableText: lớp văn bản PDF chỉ tin khi có đủ chữ', () => {
  assert.equal(isReliableText('HIGHLANDS COFFEE 126 Hong Bang'), true);
  assert.equal(isReliableText('1 2 3'), false);
  assert.equal(isReliableText(''), false);
});

test('parseItemLine (parser cũ): bỏ dòng tổng hợp nhưng giữ món viết tắt', () => {
  // Dòng tổng hợp tiền tệ không có số lượng → không phải món.
  assert.equal(parseItemLine('Co Tham tien 100.200'), null);
  assert.equal(parseItemLine('SOT: 028.7301.6978'), null);
  assert.equal(parseItemLine('Checks 174294'), null);
  // Món thật (kể cả tên viết tắt, không có số lượng) vẫn được giữ.
  const cf = parseItemLine('CF Sua 29.000');
  assert.equal(cf.name, 'CF Sua');
  assert.equal(cf.amount, 29000);
});

test('parseHighlandsInvoice (parser cũ): không có sản phẩm ma, tổng vẫn 100.200', () => {
  const result = parseHighlandsInvoice(REAL_OCR);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].name, 'Matcha Latte Da L');
  assert.equal(result.items[0].amount, 55200);
  assert.equal(result.items[1].name, 'Banh Dua');
  assert.equal(result.items[1].amount, 45000);
  assert.equal(result.total, 100200);
  assert.equal(result.subtotal, 100200);
});

test('OCR fixes: MatchaDi được sửa thành Matcha Da (giữ nguyên phần còn lại)', () => {
  const fixed = fixVietnamese('1 MatchaDi Latte Da L 69.000');
  assert.match(fixed, /Matcha Latte Da L/);
  assert.ok(!/MatchaDi/.test(fixed));
});
