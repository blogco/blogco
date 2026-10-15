import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeRegex, generatePattern, similarity, findClosest, accuracyFromCount,
  nextSampleId, learnFromSample, applyLearnedFixes, brandSlug, brandLabel,
  DEFAULT_INDEX, DEFAULT_PATTERNS,
} from './training.js';

test('escapeRegex escapes regex metacharacters', () => {
  assert.equal(escapeRegex('1.200.000 đ'), '1\\.200\\.000 đ');
  assert.equal(escapeRegex('a+b(c)'), 'a\\+b\\(c\\)');
});

test('generatePattern returns field-specific regexes and a safe fallback', () => {
  assert.equal(generatePattern('phone', '028.7301.6978'), 'SĐT[:\\s]+([\\d.]+)');
  assert.equal(generatePattern('checkNo', '174294'), 'Check[:\\s]+(\\d+)');
  assert.match(generatePattern('total', '100.200'), /Tong/);
  // Fallback wraps the value and escapes it so it can never break the regex.
  const fallback = generatePattern('mystery', 'A+B');
  assert.match(fallback, /A\\\+B/);
  assert.doesNotThrow(() => new RegExp(fallback, 'i'));
});

test('similarity + findClosest match the nearest ground-truth line', () => {
  assert.equal(similarity('Thu Ngan ca sang 1', 'Thu Ngan ca sang 1'), 1);
  assert.ok(similarity('Thu rean ca sang', 'Thu Ngan ca sang 1') > 0.5);
  const correct = ['HIGHLANDS COFFEE', 'Thu Ngan ca sang 1', 'Nguyen Duy Khang'];
  assert.equal(findClosest(correct, 'Thu rean: Thu Ngan ca sang 1'), 'Thu Ngan ca sang 1');
  assert.equal(findClosest(correct, 'khong lien quan gi'), '');
});

test('accuracyFromCount grows with samples and saturates below 1', () => {
  assert.equal(accuracyFromCount(0), 0.45);
  assert.ok(accuracyFromCount(3) > accuracyFromCount(0));
  assert.ok(accuracyFromCount(12) > accuracyFromCount(3));
  assert.ok(accuracyFromCount(100000) <= 0.99);
});

test('nextSampleId builds a branded, ordered id', () => {
  assert.equal(nextSampleId('highlands', '2026-10-15', 0), 'sample-2026-10-15-highlands-001');
  assert.equal(nextSampleId('highlands', '2026-10-15', 4), 'sample-2026-10-15-highlands-005');
});

test('learnFromSample adds patterns + Vietnamese fixes and bumps version', () => {
  const sample = {
    id: 'sample-2026-10-15-001',
    rawText: 'Creck: 174294\nThu rean: Thu Ngan ca sang 1\nTog tien: 100.200',
    labeledFields: {
      checkNo: '174294',
      cashier: 'Thu Ngan ca sang 1',
      total: '100200',
    },
  };
  const before = { brand: 'highlands', version: 1, sampleCount: 1, accuracy: 0.56, patterns: {}, vietnameseFixes: {} };
  const after = learnFromSample('highlands', sample, before, '2026-10-15T08:00:00Z');

  assert.equal(after.version, 2);
  assert.equal(after.sampleCount, 2);
  assert.ok(after.accuracy > before.accuracy);
  assert.equal(after.updatedAt, '2026-10-15T08:00:00Z');
  // New patterns were generated for the fields.
  assert.match(after.patterns.checkNo, /Check/);
  assert.match(after.patterns.total, /Tong/);
  // The garbled OCR line was learned as a fix.
  assert.ok(Object.keys(after.vietnameseFixes).length >= 1);
  assert.equal(after.vietnameseFixes['Thu rean: Thu Ngan ca sang 1'], 'Thu Ngan ca sang 1');
});

test('applyLearnedFixes repairs text longest-phrase-first', () => {
  const fixes = { 'Tog tien': 'Tong tien', 'Tog tien hang': 'Tong tien hang', 'Creck': 'Check' };
  const out = applyLearnedFixes('Creck 174294 — Tog tien hang: 184.000', fixes);
  assert.equal(out, 'Check 174294 — Tong tien hang: 184.000');
});

test('brand registry resolves slug and label', () => {
  assert.equal(brandSlug('highlands'), 'highlands');
  assert.equal(brandLabel('phuclong'), 'Phúc Long');
  assert.equal(brandSlug('other'), 'other');
});

test('bundled defaults describe the seeded database', () => {
  assert.equal(DEFAULT_INDEX.brands.highlands.samples, 1);
  assert.ok(DEFAULT_PATTERNS.highlands.vietnameseFixes['Creck']);
});
