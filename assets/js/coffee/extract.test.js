import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLine, extractReceipt, moneyTokens } from './extract.js';

// Hoá đơn Highlands đã seed (data/ocr-training/highlands/samples/...). Đây là
// đầu vào OCR thô còn nguyên lỗi Tesseract; fixVietnamese sẽ sửa trong pipeline.
const SEED_RAW = [
  'HIGHLANDS COFFEE',
  'gGHựi 1B Hg tag, Phuong Cho Lon, TP.HN',
  'SĐT: 028.7301.6978',
  'ShopID: 1039',
  'Hoa Don Thanh Toan Pager: 13',
  'In Store',
  'Creck: 174294 POS01',
  'May: 15-10-2026 06:52',
  'Thu rean: Thu Ngan ca sang 1',
  '1 Matchadi Latte 0 L 69.000',
  '-Ecoce Coupon giae -13.800',
  '1 Y tt 45.000',
  'Tae tim: 100.200',
  'Tog tien: 100.200',
  'Payoo Bark Card 100.200',
  'Xoyen Ouy Khang',
  '* Chia sey kien cua bun vôi chưng *',
  'custonerseryicethighlandscof fee.com.vn',
].join('\n');

test('classifyLine tách đúng metadata/tổng/giảm giá/thanh toán/sản phẩm', () => {
  assert.equal(classifyLine('Check: 174294 POS01'), 'metadata');
  assert.equal(classifyLine('Tong tien: 100.200'), 'total');
  assert.equal(classifyLine('Thanh tien: 100.200'), 'subtotal');
  assert.equal(classifyLine('Ecode Coupon giam -13.800'), 'discount');
  assert.equal(classifyLine('-Ecode Coupon giam -13.800'), 'discount');
  assert.equal(classifyLine('Payoo Bank Card 100.200'), 'payment');
  assert.equal(classifyLine('VAT 8% 8.000'), 'tax');
  assert.equal(classifyLine('Phi dich vu 5.000'), 'fee');
  assert.equal(classifyLine('1 Matcha Latte Da L 69.000'), 'product');
  // Dòng chỉ có số / metadata không được coi là sản phẩm.
  assert.notEqual(classifyLine('Pager: 13'), 'product');
  assert.notEqual(classifyLine('Tổng tiền: 100.200'), 'product');
});

test('moneyTokens bỏ ngày/giờ, giữ token tiền', () => {
  assert.deepEqual(moneyTokens('1 Matcha Latte Da L 69.000'), [69000]);
  assert.deepEqual(moneyTokens('May: 15-10-2026 06:52'), []);
  assert.deepEqual(moneyTokens('2 x 45.000 90.000'), [45000, 90000]);
});

test('extractReceipt trích xuất đúng hoá đơn seed (đơn giá giữ nguyên, coupon là giảm giá)', () => {
  const result = extractReceipt(SEED_RAW);

  assert.equal(result.receipt.merchant_name, 'HIGHLANDS COFFEE');
  assert.equal(result.receipt.check_number, '174294');
  assert.equal(result.receipt.date, '2026-10-15');
  assert.equal(result.receipt.currency, 'VND');
  assert.equal(result.receipt.subtotal, 100200);
  assert.equal(result.receipt.total_amount, 100200);
  assert.match(result.receipt.payment_method, /Payoo Bank Card/);

  assert.equal(result.items.length, 2);

  const [matcha, banhDua] = result.items;
  // Đơn giá gốc KHÔNG bị thay bằng thành tiền sau giảm.
  assert.equal(matcha.name_original, 'Matcha Latte Da L');
  assert.equal(matcha.quantity, 1);
  assert.equal(matcha.unit_price, 69000);
  assert.equal(matcha.gross_amount, 69000);
  assert.equal(matcha.discount_amount, 13800);
  assert.equal(matcha.net_amount, 55200);

  assert.equal(banhDua.name_original, 'Banh Dua');
  assert.equal(banhDua.unit_price, 45000);
  assert.equal(banhDua.discount_amount, 0);
  assert.equal(banhDua.net_amount, 45000);

  // Coupon được ghi thành adjustment gắn với dòng Matcha (index 0), không phải sản phẩm.
  assert.equal(result.adjustments.length, 1);
  assert.equal(result.adjustments[0].type, 'discount');
  assert.equal(result.adjustments[0].amount, 13800);
  assert.equal(result.adjustments[0].linked_item_index, 0);

  // Coupon tuyệt đối không lọt vào danh sách sản phẩm.
  assert.ok(!result.items.some((item) => /coupon/i.test(item.name_original)));

  assert.equal(result.validation.arithmetic_check, 'passed');
  assert.equal(result.validation.receipt_total_matches, true);
  assert.equal(result.validation.discrepancy_amount, 0);
  assert.equal(result.validation.needs_manual_review, false);
});

test('extractReceipt: không bịa sản phẩm, không lấy tổng tiền làm giá món', () => {
  const raw = [
    'HIGHLANDS COFFEE',
    'Check: 999111',
    '2 Phin Sua Da 29.000 58.000',
    'Thanh tien: 58.000',
    'Tong tien: 58.000',
    'Tien mat 58.000',
  ].join('\n');
  const result = extractReceipt(raw);
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.quantity, 2);
  assert.equal(item.unit_price, 29000);
  assert.equal(item.gross_amount, 58000);
  assert.equal(item.net_amount, 58000);
  assert.equal(result.validation.arithmetic_check, 'passed');
  // 'Check: 999111' và 'Tien mat' không được thành món.
  assert.equal(result.items.filter((entry) => /check|tien mat/i.test(entry.name_original)).length, 0);
});

test('extractReceipt: số lượng/đơn giá không đọc được thì trả null, không mặc định 1', () => {
  const raw = [
    'HIGHLANDS COFFEE',
    'Banh Dua 45.000', // không có số lượng ở đầu dòng, một mức giá
    'Tong tien: 45.000',
  ].join('\n');
  const result = extractReceipt(raw);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, null);
  assert.equal(result.items[0].unit_price, null);
  assert.equal(result.items[0].gross_amount, 45000);
  assert.equal(result.items[0].needs_review, true);
  assert.equal(result.validation.needs_manual_review, true);
});

test('extractReceipt: tổng lệch được báo cáo, không sửa số liệu gốc', () => {
  const raw = [
    'HIGHLANDS COFFEE',
    '1 Phin Sua Da 29.000',
    'Tong tien: 30.000',
  ].join('\n');
  const result = extractReceipt(raw);
  assert.equal(result.receipt.total_amount, 30000);
  assert.equal(result.validation.arithmetic_check, 'failed');
  assert.equal(result.validation.receipt_total_matches, false);
  assert.equal(result.validation.discrepancy_amount, 1000);
  assert.equal(result.validation.needs_manual_review, true);
  assert.ok(result.validation.warnings.length > 0);
  // Số liệu gốc giữ nguyên.
  assert.equal(result.items[0].unit_price, 29000);
});
