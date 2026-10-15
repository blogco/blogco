import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, recompute, addManualItem, updateItem, removeItem, reclassifyLine,
  buildLabeledFields, editedFieldCount, canConfirm, reviewFields,
} from './training-model.js';

// Hoá đơn Highlands seed (OCR thô có lỗi) — giống extract.test.js.
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

test('createSession: tách sản phẩm khỏi metadata/tổng, giữ OCR gốc', () => {
  const session = createSession(SEED_RAW, { fileName: 'hd.pdf', brand: 'highlands' });
  assert.equal(session.items.length, 2);
  assert.equal(session.receipt.total, 100200);
  assert.equal(session.fileName, 'hd.pdf');
  assert.equal(session.rawText, SEED_RAW);
  assert.equal(session.original.rawText, SEED_RAW);
  assert.ok(session.lines.length > 0);
  // Không có dòng nào là coupon/check lọt vào danh sách sản phẩm.
  assert.ok(!session.items.some((item) => /coupon|check/i.test(item.name)));

  const [matcha, banhDua] = session.items;
  assert.equal(matcha.name, 'Matcha Latte Da L');
  assert.equal(matcha.unitPrice, 69000);
  assert.equal(matcha.discountAmount, 13800);
  assert.equal(matcha.netAmount, 55200);
  assert.equal(banhDua.netAmount, 45000);
  assert.equal(session.verification.status, 'verified');
});

test('createSession: hoá đơn khớp tổng thì đủ điều kiện xác nhận', () => {
  const session = createSession(SEED_RAW);
  assert.equal(canConfirm(session), true);
  assert.deepEqual(reviewFields(session), []);
});

test('recompute: thành tiền = SL × đơn giá, trừ giảm giá; thiếu SL/đơn giá → cần kiểm tra', () => {
  const base = {
    items: [{ id: 'x', name: 'Phin Sua Da', quantity: 2, unitPrice: 29000, printedGross: 58000, discountAmount: 0 }],
    receipt: { total: 58000 },
    lines: [], meta: { nextItemId: 2 },
  };
  const ok = recompute(base);
  assert.equal(ok.items[0].grossAmount, 58000);
  assert.equal(ok.items[0].netAmount, 58000);
  assert.equal(ok.items[0].needsReview, false);
  assert.equal(ok.verification.status, 'verified');

  const unknown = recompute({ ...base, items: [{ id: 'x', name: 'A', quantity: null, unitPrice: null, printedGross: 45000, discountAmount: 0 }] });
  assert.equal(unknown.items[0].grossAmount, 45000);
  assert.equal(unknown.items[0].needsReview, true);
  assert.match(unknown.items[0].reviewReason, /số lượng/);
  assert.equal(unknown.verification.status, 'review');
  assert.equal(canConfirm(unknown), false);
});

test('updateItem: sửa tên/số lượng thì tính lại và cập nhật trạng thái', () => {
  const session = createSession(SEED_RAW);
  const id = session.items[0].id;
  const renamed = updateItem(session, id, { name: 'Matcha Latte Da L (sua)' });
  assert.equal(renamed.items[0].name, 'Matcha Latte Da L (sua)');
  assert.equal(renamed.items[0].unitPrice, 69000);

  const missing = updateItem(session, id, { quantity: null });
  assert.equal(missing.items[0].needsReview, true);
  assert.equal(canConfirm(missing), false);
});

test('addManualItem: thêm dòng thủ công, đánh dấu và tính thành tiền', () => {
  const session = createSession(SEED_RAW);
  const next = addManualItem(session, { name: 'Tra Sen', quantity: 2, unitPrice: 30000 });
  assert.equal(next.items.length, 3);
  const added = next.items[2];
  assert.equal(added.manuallyAdded, true);
  assert.equal(added.netAmount, 60000);
  assert.equal(next.verification.status, 'mismatch'); // tổng hoá đơn chưa đổi
  // Dòng thủ công thiếu đơn giá không tự bịa giá.
  const blank = addManualItem(session, {});
  assert.equal(blank.items[2].unitPrice, null);
  assert.equal(blank.items[2].netAmount, null);
});

test('removeItem: xoá đúng dòng', () => {
  const session = createSession(SEED_RAW);
  const next = removeItem(session, session.items[0].id);
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].name, 'Banh Dua');
});

test('reclassifyLine: đổi giảm giá thành sản phẩm rồi hoàn lại', () => {
  const session = createSession(SEED_RAW);
  const discountLine = session.lines.find((line) => line.type === 'discount');
  assert.ok(discountLine, 'phải có một dòng giảm giá');

  const asProduct = reclassifyLine(session, discountLine.index, 'product');
  assert.equal(asProduct.lines.find((line) => line.index === discountLine.index).type, 'product');
  assert.equal(asProduct.items.length, 3);
  assert.ok(asProduct.items.some((item) => item.sourceLineIndex === discountLine.index));

  const back = reclassifyLine(asProduct, discountLine.index, 'discount');
  assert.equal(back.items.length, 2);
  assert.ok(!back.items.some((item) => item.sourceLineIndex === discountLine.index));
});

test('reclassifyLine: đổi dòng tổng thành "total" cập nhật tổng hoá đơn', () => {
  const session = createSession(SEED_RAW);
  const totalLine = session.lines.find((line) => line.type === 'total');
  assert.ok(totalLine);
  const next = reclassifyLine(session, totalLine.index, 'total');
  assert.equal(next.receipt.total, totalLine.amount);
});

test('buildLabeledFields: gói dữ liệu ground truth cho pipeline training', () => {
  const session = createSession(SEED_RAW, { brand: 'highlands' });
  const fields = buildLabeledFields(session, { brandLabel: 'Highlands Coffee' });
  assert.equal(fields.brand, 'Highlands Coffee');
  assert.equal(fields.checkNo, '174294');
  assert.equal(fields.datetime, '2026-10-15');
  assert.equal(fields.total, '100200');
  assert.equal(fields.items.length, 2);
  assert.equal(fields.items[0].amount, 55200);
  assert.equal(fields.items[0].discount, -13800);
  assert.equal(fields.items[0].price, 69000);
});

test('editedFieldCount: 0 khi chưa sửa, tăng khi người dùng sửa', () => {
  const session = createSession(SEED_RAW);
  assert.equal(editedFieldCount(session), 0);
  const edited = updateItem(session, session.items[0].id, { name: 'Khac', quantity: 3 });
  assert.ok(editedFieldCount(edited) >= 2);
});
