import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, toIntOrNull, netOf, grossOf, VERIFY_STATUS, TOLERANCE } from './verify.js';

// Hai dòng mẫu: Matcha giảm 13.800, Bánh Dùa không giảm. netSum = 100.200.
const MATCHA = { id: 'a', name: 'Matcha Latte Da L', quantity: 1, unitPrice: 69000, grossAmount: 69000, discountAmount: 13800 };
const BANH_DUA = { id: 'b', name: 'Banh Dua', quantity: 1, unitPrice: 45000, grossAmount: 45000, discountAmount: 0 };

test('reconcile: khớp tổng → verified, giữ đơn giá gốc và tách giảm giá', () => {
  const report = reconcile({ items: [MATCHA, BANH_DUA], receipt: { total: 100200 } });
  assert.equal(report.grossSum, 114000);
  assert.equal(report.itemDiscountSum, 13800);
  assert.equal(report.netSum, 100200);
  assert.equal(report.computedTotal, 100200);
  assert.equal(report.printedTotal, 100200);
  assert.equal(report.discrepancy, 0);
  assert.equal(report.status, 'verified');
  assert.equal(report.verified, true);
  assert.deepEqual(report.unresolvedItems, []);
  assert.equal(report.messages.length > 0, true);
});

test('reconcile: lệch tổng → mismatch, không sửa số liệu gốc', () => {
  const item = { id: 'a', name: 'Phin Sua Da', quantity: 1, unitPrice: 29000, grossAmount: 29000 };
  const report = reconcile({ items: [item], receipt: { total: 30000 } });
  assert.equal(report.computedTotal, 29000);
  assert.equal(report.discrepancy, 1000);
  assert.equal(report.status, 'mismatch');
  assert.ok(report.messages[0].includes('lệch') || report.messages[0].includes('Lệch'));
  // Hàm thuần: không đụng vào item đầu vào.
  assert.equal(item.grossAmount, 29000);
});

test('reconcile: ranh giới dung sai TOLERANCE = 1', () => {
  const item = { id: 'a', name: 'A', quantity: 1, unitPrice: 100000, grossAmount: 100000 };
  assert.equal(reconcile({ items: [item], receipt: { total: 100001 } }).status, 'verified');
  assert.equal(reconcile({ items: [item], receipt: { total: 100002 } }).status, 'mismatch');
  assert.equal(TOLERANCE, 1);
});

test('reconcile: thiếu tổng hoặc thiếu sản phẩm → insufficient', () => {
  assert.equal(reconcile({ items: [BANH_DUA], receipt: {} }).status, 'insufficient');
  assert.equal(reconcile({ items: [], receipt: { total: 100200 } }).status, 'insufficient');
  assert.ok(reconcile({ items: [BANH_DUA], receipt: {} }).missing.includes('tổng thanh toán'));
});

test('reconcile: dòng thiếu số lượng/đơn giá → review, chưa được xác nhận', () => {
  const item = { id: 'a', name: 'Banh Dua', quantity: null, unitPrice: null, grossAmount: 45000 };
  const report = reconcile({ items: [item], receipt: { total: 45000 } });
  assert.equal(report.netSum, 45000);
  assert.equal(report.status, 'review');
  assert.equal(report.verified, false);
  assert.deepEqual(report.unresolvedItems, ['a']);
});

test('reconcile: cộng thuế/phí và trừ giảm giá cấp hoá đơn', () => {
  const item = { id: 'a', name: 'A', quantity: 1, unitPrice: 100000, grossAmount: 100000 };
  const report = reconcile({
    items: [item],
    receipt: { total: 105000, tax: 8000, fee: 2000, levelDiscount: 5000 },
  });
  assert.equal(report.tax, 8000);
  assert.equal(report.fee, 2000);
  assert.equal(report.levelDiscount, 5000);
  assert.equal(report.discountTotal, 5000);
  assert.equal(report.computedTotal, 105000);
  assert.equal(report.status, 'verified');
});

test('reconcile: bỏ qua dòng excluded khỏi mọi phép tính', () => {
  const report = reconcile({ items: [{ ...BANH_DUA, excluded: true }], receipt: { total: 1 } });
  assert.equal(report.netSum, 0);
  assert.equal(report.status, 'insufficient');
});

test('toIntOrNull: chỉ nhận số hợp lệ, ô trống/null → null', () => {
  assert.equal(toIntOrNull(''), null);
  assert.equal(toIntOrNull(null), null);
  assert.equal(toIntOrNull(undefined), null);
  assert.equal(toIntOrNull(69000), 69000);
  assert.equal(toIntOrNull('69000'), 69000);
  assert.equal(toIntOrNull('69,000'), 69000);
  assert.equal(toIntOrNull(-13800), -13800);
  assert.equal(toIntOrNull(69000.6), 69001);
});

test('netOf/grossOf: ưu tiên số in trên dòng, hỗ trợ khoá snake_case', () => {
  assert.equal(netOf({ grossAmount: 69000, discountAmount: 13800 }), 55200);
  assert.equal(netOf({ gross_amount: 45000 }), 45000);
  assert.equal(netOf({}), null);
  assert.equal(netOf({ grossAmount: 50000, discountAmount: 999999 }), 0);
  assert.equal(grossOf({ quantity: 2, unitPrice: 29000 }), 58000);
  assert.equal(grossOf({ grossAmount: 45000 }), 45000);
  assert.equal(grossOf({}), null);
});

test('VERIFY_STATUS có đủ 4 trạng thái với nhãn và tone', () => {
  for (const key of ['verified', 'review', 'mismatch', 'insufficient']) {
    assert.equal(typeof VERIFY_STATUS[key].label, 'string');
    assert.equal(typeof VERIFY_STATUS[key].tone, 'string');
  }
});
