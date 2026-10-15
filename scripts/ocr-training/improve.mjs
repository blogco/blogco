// Vòng lặp cải thiện OCR hàng ngày (batch / cron).
//
// Đọc mọi mẫu ground truth trong data/ocr-training/<brand>/samples/*.json,
// hợp nhất lại thành patterns.json + prompt-context.json cho từng thương hiệu,
// rồi cập nhật index.json + accuracy.json. Chạy trong GitHub Action
// (.github/workflows/ocr-training.yml) hoặc thủ công: npm run train:ocr.
//
// Chỉ ghi file khi nội dung thay đổi → không tạo commit rỗng.

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { consolidate } from '../../assets/js/coffee/training-batch.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TRAINING_DIR = join(ROOT, 'data', 'ocr-training');

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readBrandSamples(brandDir) {
  const samplesDir = join(brandDir, 'samples');
  if (!existsSync(samplesDir)) return [];
  const entries = await readdir(samplesDir);
  const samples = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const sample = await readJson(join(samplesDir, entry), null);
    if (sample) samples.push(sample);
  }
  return samples;
}

// Ghi có kiểm soát: bỏ qua nếu nội dung không đổi (bỏ qua các mốc thời gian
// thay đổi mỗi lần chạy để không tạo commit rỗng), trả về true khi đã ghi.
const VOLATILE_KEYS = new Set(['updatedAt', 'generatedAt']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (VOLATILE_KEYS.has(key)) continue;
      out[key] = stable(item);
    }
    return out;
  }
  return value;
}

async function writeJsonIfChanged(path, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  let current = null;
  try {
    current = JSON.parse(await readFile(path, 'utf8'));
  } catch { /* file mới */ }
  if (current && JSON.stringify(stable(current)) === JSON.stringify(stable(value))) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, 'utf8');
  return true;
}

async function listBrandDirs() {
  if (!existsSync(TRAINING_DIR)) return [];
  const entries = await readdir(TRAINING_DIR, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (entry.isDirectory()) dirs.push(entry.name);
  }
  return dirs;
}

async function main() {
  const index = await readJson(join(TRAINING_DIR, 'index.json'), { brands: {} });
  const brandDirs = await listBrandDirs();

  const samplesByBrand = {};
  const accuracyByBrand = {};
  let totalSamples = 0;
  for (const slug of brandDirs) {
    const brandDir = join(TRAINING_DIR, slug);
    const samples = await readBrandSamples(brandDir);
    samplesByBrand[slug] = samples;
    totalSamples += samples.length;
    accuracyByBrand[slug] = await readJson(join(brandDir, 'accuracy.json'), { brand: slug, log: [] });
  }

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const result = consolidate({ samplesByBrand, existingIndex: index, accuracyByBrand, now });

  const written = [];
  for (const [slug, patterns] of Object.entries(result.patternsByBrand)) {
    const brandDir = join(TRAINING_DIR, slug);
    if (await writeJsonIfChanged(join(brandDir, 'patterns.json'), patterns)) written.push(join(slug, 'patterns.json'));
    if (await writeJsonIfChanged(join(brandDir, 'prompt-context.json'), result.contextByBrand[slug])) written.push(join(slug, 'prompt-context.json'));
    if (await writeJsonIfChanged(join(brandDir, 'accuracy.json'), result.accuracyByBrand[slug])) written.push(join(slug, 'accuracy.json'));
  }
  if (await writeJsonIfChanged(join(TRAINING_DIR, 'index.json'), result.index)) written.push('index.json');

  const summary = {
    brands: Object.keys(result.patternsByBrand).length,
    samples: totalSamples,
    files: written.length,
    updated: written,
    at: now,
  };
  console.log(JSON.stringify(summary, null, 2));
  // Danh sách file đã đổi để Action commit đúng phạm vi.
  if (written.length) console.log(`CHANGED:${written.map((p) => `data/ocr-training/${p}`).join(',')}`);
}

main().catch((error) => {
  console.error(`ocr-training improve failed: ${error.message}`);
  process.exitCode = 1;
});
