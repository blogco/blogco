import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rebuildPatterns, buildPromptContext, appendAccuracyLog, buildIndex, consolidate,
  fixWithContext, PROMPT_CONTEXT_SCHEMA,
} from './training-batch.js';

const SAMPLE_A = {
  id: 'sample-2026-10-15-highlands-001',
  brand: 'highlands',
  createdAt: '2026-10-15T07:00:00Z',
  rawText: 'HIGHLANDS COFFEE\nCreck: 174294\nThu rean: Thu Ngan ca sang 1\nTog tien: 100.200',
  labeledFields: { brand: 'HIGHLANDS COFFEE', checkNo: '174294', cashier: 'Thu Ngan ca sang 1', total: '100200', payment: 'Payoo Bank Card' },
};

const SAMPLE_B = {
  id: 'sample-2026-10-16-highlands-002',
  brand: 'highlands',
  createdAt: '2026-10-16T07:00:00Z',
  rawText: 'HIGHLANDS COFFEE\nCreck: 200001',
  labeledFields: { checkNo: '200001', total: '88000' },
};

test('rebuildPatterns hợp nhất mọi mẫu theo thứ tự thời gian và tăng version/sampleCount', () => {
  const patterns = rebuildPatterns('highlands', [SAMPLE_B, SAMPLE_A]); // cố tình đảo thứ tự
  assert.equal(patterns.brand, 'highlands');
  assert.equal(patterns.sampleCount, 2);
  assert.equal(patterns.version, 2);
  assert.equal(patterns.patterns.checkNo, 'Check[:\\s]+(\\d+)');
  assert.equal(patterns.patterns.payment, '(Payoo Bank Card|Tien mat|Cash|Visa|Mastercard|MoMo|ZaloPay)');
  // `brandSlug` chuẩn hoá id/slug; nhãn hiển thị không khớp sẽ rơi về 'other'.
  assert.equal(rebuildPatterns('highlands', [SAMPLE_A]).brand, 'highlands');
  assert.equal(rebuildPatterns('Highlands Coffee', [SAMPLE_A]).brand, 'other');
});

test('rebuildPatterns tất định: cùng tập mẫu cho cùng kết quả bất kể thứ tự', () => {
  const a = rebuildPatterns('highlands', [SAMPLE_A, SAMPLE_B]);
  const b = rebuildPatterns('highlands', [SAMPLE_B, SAMPLE_A]);
  assert.deepEqual(a.patterns, b.patterns);
  assert.deepEqual(a.vietnameseFixes, b.vietnameseFixes);
  assert.equal(a.accuracy, b.accuracy);
});

test('buildPromptContext đóng gói system + few-shot + kiến thức đã học', () => {
  const patterns = rebuildPatterns('highlands', [SAMPLE_A]);
  const context = buildPromptContext('highlands', [SAMPLE_A], patterns, '2026-10-16T00:00:00Z');
  assert.equal(context.schema, PROMPT_CONTEXT_SCHEMA);
  assert.equal(context.brand, 'highlands');
  assert.match(context.system, /Highlands Coffee/);
  assert.equal(context.fewShot.length, 1);
  assert.equal(context.fewShot[0].labeledFields.checkNo, '174294');
  assert.equal(context.vietnameseFixes['Thu rean: Thu Ngan ca sang 1'], 'Thu Ngan ca sang 1');
});

test('appendAccuracyLog bỏ qua điểm trùng và giới hạn kích thước log', () => {
  const first = appendAccuracyLog({ brand: 'highlands', log: [] }, { at: 't1', brand: 'highlands', samples: 1, accuracy: 0.56, version: 1 });
  assert.equal(first.log.length, 1);
  const duplicate = appendAccuracyLog(first, { at: 't2', brand: 'highlands', samples: 1, accuracy: 0.56, version: 1 });
  assert.equal(duplicate.log.length, 1); // không thêm điểm trùng
  const changed = appendAccuracyLog(duplicate, { at: 't3', brand: 'highlands', samples: 2, accuracy: 0.7, version: 2 });
  assert.equal(changed.log.length, 2);
  assert.equal(changed.log[1].samples, 2);
});

test('buildIndex luôn có đủ brand chuẩn, kể cả brand chưa có mẫu', () => {
  const index = buildIndex({ highlands: { samples: 3, accuracy: 0.8, version: 3 } }, { now: 'T', repo: 'blogco/blogco', branch: 'main' });
  assert.equal(index.brands.highlands.samples, 3);
  assert.equal(index.brands.starbucks.samples, 0);
  assert.equal(index.brands.phuclong.samples, 0);
  assert.equal(index.repo, 'blogco/blogco');
  assert.equal(index.branch, 'main');
});

test('consolidate sinh patterns + prompt context + accuracy + index trong một lượt', () => {
  const result = consolidate({
    samplesByBrand: { highlands: [SAMPLE_A, SAMPLE_B] },
    existingIndex: { repo: 'blogco/blogco', branch: 'main', brands: {} },
    accuracyByBrand: { highlands: { brand: 'highlands', log: [] } },
    now: '2026-10-16T00:00:00Z',
  });
  assert.equal(result.patternsByBrand.highlands.sampleCount, 2);
  assert.equal(result.contextByBrand.highlands.sampleCount, 2);
  assert.equal(result.accuracyByBrand.highlands.log.length, 1);
  assert.equal(result.index.brands.highlands.samples, 2);
  assert.equal(result.index.brands.starbucks.samples, 0);
});

test('fixWithContext áp bảng sửa lỗi từ prompt-context', () => {
  const context = { vietnameseFixes: { 'Tog tien': 'Tong tien' } };
  assert.equal(fixWithContext('Tog tien: 100.200', context), 'Tong tien: 100.200');
});
