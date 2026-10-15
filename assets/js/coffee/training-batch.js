// Hợp nhất dữ liệu training theo lô (batch / cron) — hàm THUẦN, không đụng file.
//
// Người dùng xác nhận ground truth trên UI → mỗi mẫu được lưu vào
// data/ocr-training/<brand>/samples/*.json. Script định kỳ (GitHub Action
// .github/workflows/ocr-training.yml) gọi module này để:
//   1. Đọc LẠI toàn bộ mẫu của từng thương hiệu (không chỉ mẫu vừa thêm).
//   2. Tái sinh `patterns.json` (regex + bảng sửa lỗi tiếng Việt) một cách
//      tất định từ mọi mẫu — nhờ đó kết quả không phụ thuộc thứ tự thao tác UI.
//   3. Sinh `prompt-context.json` (system prompt + few-shot) để nạp vào context
//      của AI OCR, giúp lần quét sau của quán đó đọc đúng hơn.
//   4. Tổng hợp `index.json` và ghi log độ chính xác.
//
// Toàn bộ ở đây là hàm thuần để unit-test được trong Node (training-batch.test.js).

import { BRANDS, brandLabel, brandSlug, learnFromSample, accuracyFromCount, applyLearnedFixes } from './training.js';

export const PROMPT_CONTEXT_SCHEMA = 'blogco.ocr-training.prompt-context.v1';
export const MAX_FEWSHOT = 24;
export const MAX_FEWSHOT_CHARS = 1600;

// System prompt nền — được bơm thêm regex/patterns và bảng sửa lỗi đã học.
export function systemPrompt(slug) {
  const label = brandLabel(slug);
  return [
    `Bạn là bộ trích xuất hoá đơn ${label}.`,
    'Đọc ảnh/text OCR, trả về JSON đúng schema blogco.coffee.receipt.v1.',
    'Tuyệt đối không bịa số: nếu không chắc thì để null và đánh dấu needs_review.',
    'Áp dụng các regex pattern và bảng sửa lỗi tiếng Việt đã học dưới đây trước khi suy luận.',
    'Tách rõ sản phẩm khỏi mã check / giảm giá / thuế / phí / tổng tiền.',
  ].join(' ');
}

// Tái sinh patterns cho một brand từ TOÀN BỘ mẫu (theo thứ tự thời gian).
export function rebuildPatterns(slug, samples = [], now = new Date().toISOString()) {
  const brand = brandSlug(slug);
  let patterns = {
    brand,
    version: 0,
    updatedAt: now,
    sampleCount: 0,
    accuracy: accuracyFromCount(0),
    patterns: {},
    vietnameseFixes: {},
  };
  const ordered = [...samples].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  for (const sample of ordered) {
    patterns = learnFromSample(brand, sample || {}, patterns, sample?.createdAt || now);
  }
  patterns.updatedAt = now;
  return patterns;
}

// Gói context để nạp vào prompt của AI OCR (system + few-shot + kiến thức đã học).
export function buildPromptContext(slug, samples = [], patterns = {}, now = new Date().toISOString()) {
  const brand = brandSlug(slug);
  const fewShot = [...samples]
    .filter((sample) => sample && sample.labeledFields)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(-MAX_FEWSHOT)
    .map((sample) => ({
      rawText: String(sample.rawText || '').slice(0, MAX_FEWSHOT_CHARS),
      labeledFields: sample.labeledFields,
    }));
  return {
    schema: PROMPT_CONTEXT_SCHEMA,
    brand,
    generatedAt: now,
    version: patterns.version || 1,
    sampleCount: patterns.sampleCount || samples.length,
    accuracy: typeof patterns.accuracy === 'number' ? patterns.accuracy : accuracyFromCount(samples.length),
    system: systemPrompt(brand),
    patterns: patterns.patterns || {},
    vietnameseFixes: patterns.vietnameseFixes || {},
    fewShot,
  };
}

// Nối thêm một điểm vào log độ chính xác (giữ tối đa 400 điểm).
// Bỏ qua khi điểm mới không đổi về số mẫu/độ chính xác/phiên bản → tránh log
// phình ra và commit rỗng mỗi ngày dù chưa có mẫu mới.
export function appendAccuracyLog(existing, entry) {
  const log = Array.isArray(existing?.log) ? existing.log.slice() : [];
  const last = log[log.length - 1];
  if (last && last.samples === entry.samples && last.accuracy === entry.accuracy && last.version === entry.version) {
    return { brand: entry.brand || existing?.brand || '', log };
  }
  log.push(entry);
  return { brand: entry.brand || existing?.brand || '', log: log.slice(-400) };
}

// Tổng hợp index.json từ patterns của tất cả brand.
export function buildIndex(brandEntries = {}, { now = new Date().toISOString(), repo = 'blogco/blogco', branch = 'main' } = {}) {
  const brands = {};
  for (const brand of BRANDS) {
    if (brand.id === 'other') continue;
    const entry = brandEntries[brand.slug];
    brands[brand.slug] = {
      samples: entry?.samples || 0,
      accuracy: typeof entry?.accuracy === 'number' ? entry.accuracy : accuracyFromCount(entry?.samples || 0),
      version: entry?.version || 1,
    };
  }
  // Giữ cả brand ngoài danh sách chuẩn (ví dụ "other" đã đổi tên).
  for (const [slug, entry] of Object.entries(brandEntries)) {
    if (brands[slug]) continue;
    brands[slug] = { samples: entry?.samples || 0, accuracy: entry?.accuracy ?? accuracyFromCount(entry?.samples || 0), version: entry?.version || 1 };
  }
  return { updatedAt: now, repo, branch, brands };
}

// Hợp nhất toàn bộ trong một lần chạy (dùng cho script + test).
export function consolidate({ samplesByBrand = {}, existingIndex = {}, accuracyByBrand = {}, now = new Date().toISOString() } = {}) {
  const patternsByBrand = {};
  const contextByBrand = {};
  const accuracyByBrandNext = {};
  const indexEntries = {};
  for (const [slug, samples] of Object.entries(samplesByBrand)) {
    const brand = brandSlug(slug);
    const patterns = rebuildPatterns(brand, samples, now);
    const context = buildPromptContext(brand, samples, patterns, now);
    patternsByBrand[brand] = patterns;
    contextByBrand[brand] = context;
    accuracyByBrandNext[brand] = appendAccuracyLog(accuracyByBrand[brand], {
      at: now,
      brand,
      samples: patterns.sampleCount,
      accuracy: patterns.accuracy,
      version: patterns.version,
    });
    indexEntries[brand] = { samples: patterns.sampleCount, accuracy: patterns.accuracy, version: patterns.version };
  }
  return {
    patternsByBrand,
    contextByBrand,
    accuracyByBrand: accuracyByBrandNext,
    index: buildIndex({ ...(existingIndex.brands || {}), ...indexEntries }, { now, repo: existingIndex.repo, branch: existingIndex.branch }),
  };
}

// Tiện ích cho UI/script: áp bảng sửa lỗi của prompt-context lên text OCR.
export function fixWithContext(text, context = {}) {
  return applyLearnedFixes(text, context.vietnameseFixes || {});
}
