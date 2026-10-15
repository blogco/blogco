// AI Training cho OCR — vòng tự học (self-learning loop).
//
// Người dùng upload hoá đơn mẫu → OCR đọc thô → sửa text + gán nhãn trường →
// lưu "ground truth" vào DB trên GitHub (data/ocr-training/<brand>/). Mẫu mới
// giúp sinh regex pattern và bảng sửa lỗi tiếng Việt; lần OCR sau sẽ đọc đúng
// hơn cho thương hiệu đó.
//
// Phần "học" (learnFromSample, generatePattern, findClosest…) là hàm thuần, có
// unit test và chạy được trong Node. Phần IO (đọc patterns.json, push GitHub,
// gọi CMS) được bọc trong guard `typeof window !== 'undefined'` để import an toàn.
//
// Xem docs/ca-phe-ai-training.md cho wireframe 5 bước.

import { recognizeImage, parseHighlandsReceipt } from './ocr.js';

// ---------------------------------------------------------------------------
// Hằng số DB
// ---------------------------------------------------------------------------

export const TRAINING_REPO = 'blogco/blogco';
export const TRAINING_BRANCH = 'main';
export const TRAINING_DIR = 'data/ocr-training';
const RAW_BASE = `https://raw.githubusercontent.com/${TRAINING_REPO}/${TRAINING_BRANCH}/${TRAINING_DIR}`;

// Thương hiệu hỗ trợ sẵn. `slug` trùng tên thư mục trong data/ocr-training/.
export const BRANDS = [
  { id: 'highlands', slug: 'highlands', label: 'Highlands Coffee' },
  { id: 'starbucks', slug: 'starbucks', label: 'Starbucks' },
  { id: 'phuclong', slug: 'phuclong', label: 'Phúc Long' },
  { id: 'other', slug: 'other', label: 'Khác (nhập tên)' },
];

export const LABEL_FIELDS = [
  ['brand', '🏷 Thương hiệu'],
  ['address', '🏷 Địa chỉ'],
  ['phone', '🏷 SĐT'],
  ['shopId', '🏷 ShopID'],
  ['checkNo', '🏷 Check'],
  ['datetime', '🏷 Ngày giờ'],
  ['cashier', '🏷 Thu ngân'],
  ['pager', '🏷 Pager'],
  ['pos', '🏷 POS'],
  ['subtotal', '🏷 Thành tiền'],
  ['total', '🏷 Tổng tiền'],
  ['payment', '🏷 Thanh toán'],
];

// Chỉ những trường chuỗi này mới được sinh regex pattern.
const PATTERN_FIELDS = ['brand', 'address', 'phone', 'shopId', 'checkNo', 'datetime', 'cashier', 'pager', 'pos', 'subtotal', 'total', 'payment'];

function brandMeta(id) {
  return BRANDS.find((brand) => brand.id === id || brand.slug === id) || BRANDS[BRANDS.length - 1];
}

export function brandLabel(id) {
  return brandMeta(id).label;
}

export function brandSlug(id) {
  return brandMeta(id).slug;
}

// ---------------------------------------------------------------------------
// Sinh regex pattern từ ground truth (hàm thuần)
// ---------------------------------------------------------------------------

export function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sinh một regex đơn giản cho trường, dựa trên mẫu in trên hoá đơn. Trả về chuỗi
// regex (không kèm cờ). Fallback bọc giá trị trong ngữ cảnh gần đúng.
export function generatePattern(field, value = '') {
  const text = String(value).trim();
  switch (field) {
    case 'phone':
      return 'SĐT[:\\s]+([\\d.]+)';
    case 'shopId':
      return 'ShopID[:\\s]+(\\d+)';
    case 'checkNo':
      return 'Check[:\\s]+(\\d+)';
    case 'datetime':
      return 'Ngay[:\\s]+(\\d{2}[-/]\\d{2}[-/]\\d{4})\\s+(\\d{2}:\\d{2})';
    case 'total':
      return 'Tong\\s*tien[:\\s]+([\\d.,]+)';
    case 'subtotal':
      return 'Thanh\\s*tien[:\\s]+([\\d.,]+)';
    case 'cashier':
      return 'Thu\\s*ngan[:\\s]+(.+)';
    case 'payment':
      return '(Payoo Bank Card|Tien mat|Cash|Visa|Mastercard|MoMo|ZaloPay)';
    case 'brand':
      return `^${escapeRegex(text)}$`;
    case 'address':
      return escapeRegex(text).replace(/\\?\s+/g, '\\s+');
    default:
      return `(.{0,20}${escapeRegex(text)}.{0,20})`;
  }
}

function safeTest(pattern, value) {
  try {
    return new RegExp(pattern, 'i').test(String(value));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// So khớp mờ để học bảng sửa lỗi tiếng Việt (hàm thuần)
// ---------------------------------------------------------------------------

function normalizeForMatch(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenBag(value) {
  const bag = new Map();
  for (const token of normalizeForMatch(value).split(' ')) {
    if (!token) continue;
    bag.set(token, (bag.get(token) || 0) + 1);
  }
  return bag;
}

// Dice coefficient trên đa tập token — bền với việc OCR thêm/bớt vài ký tự.
export function similarity(a = '', b = '') {
  const left = tokenBag(a);
  const right = tokenBag(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const [token, count] of left) {
    if (right.has(token)) shared += Math.min(count, right.get(token));
  }
  const total = [...left.values()].reduce((sum, n) => sum + n, 0) + [...right.values()].reduce((sum, n) => sum + n, 0);
  return (2 * shared) / total;
}

// Trả về ứng viên giống `target` nhất (điểm ≥ threshold) hoặc ''.
export function findClosest(candidates, target, { threshold = 0.5 } = {}) {
  let best = '';
  let bestScore = threshold;
  for (const candidate of candidates) {
    const score = similarity(candidate, target);
    if (score >= bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Vòng học (hàm thuần) — cập nhật patterns từ một mẫu ground truth
// ---------------------------------------------------------------------------

// Số mẫu càng nhiều, độ chính xác ước lượng càng cao (bão hoà dần).
export function accuracyFromCount(samples = 0) {
  const n = Math.max(0, Number(samples) || 0);
  const value = 45 + 54 * (1 - Math.exp(-n / 4.57));
  return Math.min(99, Math.round(value)) / 100;
}

export function nextSampleId(brandId, dateKey, existingCount = 0) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey || '') ? dateKey : new Date().toISOString().slice(0, 10);
  const brand = brandSlug(brandId);
  return `sample-${safeDate}-${brand}-${String(existingCount + 1).padStart(3, '0')}`;
}

// So sánh ground truth với pattern hiện tại, sinh pattern + fix mới, tăng version.
export function learnFromSample(brandId, labeledSample = {}, currentPatterns = {}, now = new Date().toISOString()) {
  const brand = brandSlug(brandId);
  const patterns = currentPatterns && typeof currentPatterns === 'object' ? currentPatterns : {};
  const existingPatterns = patterns.patterns || {};
  const fields = labeledSample.labeledFields || {};

  // 1. Pattern mới cho các trường chuỗi chưa khớp.
  const newPatterns = {};
  for (const field of PATTERN_FIELDS) {
    const value = fields[field];
    if (typeof value !== 'string' || !value.trim()) continue;
    const current = existingPatterns[field];
    if (!current || !safeTest(current, value)) newPatterns[field] = generatePattern(field, value);
  }

  // 2. Học fix tiếng Việt: ghép dòng OCR thô với giá trị đúng gần nhất.
  const rawLines = String(labeledSample.rawText || '')
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const correctLines = Object.values(fields).filter((value) => typeof value === 'string' && value.trim());
  const newFixes = {};
  for (const raw of rawLines) {
    const correct = findClosest(correctLines, raw, { threshold: 0.6 });
    if (correct && correct !== raw && raw.length <= 80) newFixes[raw] = correct;
  }

  const sampleCount = (patterns.sampleCount || 0) + 1;
  return {
    ...patterns,
    brand,
    version: (patterns.version || 0) + 1,
    updatedAt: now,
    sampleCount,
    accuracy: accuracyFromCount(sampleCount),
    patterns: { ...existingPatterns, ...newPatterns },
    vietnameseFixes: { ...(patterns.vietnameseFixes || {}), ...newFixes },
  };
}

// Áp bảng sửa lỗi đã học vào text OCR trước khi parse (chuỗi dài khớp trước).
export function applyLearnedFixes(text, fixes = {}) {
  let out = String(text || '');
  const entries = Object.entries(fixes)
    .filter(([wrong, right]) => wrong && right && wrong !== right)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [wrong, right] of entries) {
    if (out.includes(wrong)) out = out.split(wrong).join(right);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dữ liệu mặc định (bundle) — dùng khi chưa tải được từ GitHub
// ---------------------------------------------------------------------------

export const DEFAULT_INDEX = {
  updatedAt: '2026-10-15T07:00:00Z',
  repo: TRAINING_REPO,
  branch: TRAINING_BRANCH,
  brands: {
    highlands: { samples: 1, accuracy: 0.56, version: 1 },
    starbucks: { samples: 0, accuracy: 0.45, version: 1 },
    phuclong: { samples: 0, accuracy: 0.45, version: 1 },
  },
};

export const DEFAULT_PATTERNS = {
  highlands: {
    brand: 'highlands', version: 1, updatedAt: '2026-10-15T07:00:00Z', sampleCount: 1, accuracy: 0.56,
    patterns: {},
    vietnameseFixes: { 'Thu rean': 'Thu ngan', 'Tae tim': 'Thanh tien', 'Tog tien': 'Tong tien', 'May': 'Ngay', 'Creck': 'Check', 'Payoo Bark Card': 'Payoo Bank Card' },
  },
};

// ---------------------------------------------------------------------------
// IO — đọc DB từ GitHub (best-effort) với fallback bundle
// ---------------------------------------------------------------------------

function canFetch() {
  return typeof fetch === 'function';
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Đọc patterns.json của một brand; thử GitHub raw trước, rồi tới default bundle.
export async function loadPatterns(brandId) {
  const slug = brandSlug(brandId);
  const fallback = DEFAULT_PATTERNS[slug] || { brand: slug, version: 0, patterns: {}, vietnameseFixes: {}, sampleCount: 0, accuracy: 0.45 };
  if (!canFetch()) return { source: 'bundled', data: fallback };
  try {
    const data = await fetchJson(`${RAW_BASE}/${slug}/patterns.json`);
    return { source: 'github', data };
  } catch {
    return { source: 'bundled', data: fallback };
  }
}

export async function loadTrainingIndex() {
  if (!canFetch()) return { source: 'bundled', data: DEFAULT_INDEX };
  try {
    const data = await fetchJson(`${RAW_BASE}/index.json`);
    return { source: 'github', data };
  } catch {
    return { source: 'bundled', data: DEFAULT_INDEX };
  }
}

// ---------------------------------------------------------------------------
// IO — push lên GitHub (Cách B: GitHub Contents API + PAT trong localStorage)
// ---------------------------------------------------------------------------

function ghToken() {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem('blogco:gh_token') || '';
}

export function setGitHubToken(token) {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem('blogco:gh_token', token.trim());
  else localStorage.removeItem('blogco:gh_token');
}

export function hasGitHubToken() {
  return Boolean(ghToken());
}

function b64EncodeUnicode(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }
  // Node fallback (chỉ dùng trong test).
  return Buffer.from(text, 'utf8').toString('base64');
}

export async function pushToGitHub(path, content, { message = `ai(training): update ${path}`, token = ghToken() } = {}) {
  if (!token) throw new Error('Chưa có GitHub token. Dán PAT (quyền contents:write) ở ô cấu hình.');
  if (!canFetch()) throw new Error('Môi trường không hỗ trợ fetch.');
  const url = `https://api.github.com/repos/${TRAINING_REPO}/contents/${path}`;
  const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
  let sha;
  try {
    const existing = await fetch(`${url}?ref=${TRAINING_BRANCH}`, { headers });
    if (existing.ok) sha = (await existing.json()).sha;
  } catch { /* file mới — bỏ qua */ }
  const body = { message, branch: TRAINING_BRANCH, content: b64EncodeUnicode(content), ...(sha ? { sha } : {}) };
  const response = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub API ${response.status}: ${detail.slice(0, 160)}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// IO — lưu mẫu (CMS local → GitHub API → tải file)
// ---------------------------------------------------------------------------

function cmsUrl() {
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem('blogco:cms_url') || '').replace(/\/$/, '');
}

export function setCmsUrl(url) {
  if (typeof localStorage === 'undefined') return;
  if (url) localStorage.setItem('blogco:cms_url', url.trim());
  else localStorage.removeItem('blogco:cms_url');
}

export function getSaveMode() {
  if (cmsUrl()) return 'cms';
  if (hasGitHubToken()) return 'github';
  return 'download';
}

function downloadJson(filename, payload) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lưu một mẫu đã gán nhãn vào DB. Trả về mô tả kết quả để UI hiển thị.
export async function saveTrainingSample({ brand, sample, patterns, mode = getSaveMode(), commitMessage = '' }) {
  const slug = brandSlug(brand);
  const message = commitMessage || `ai(training): thêm mẫu ${slug}/${sample.id}`;
  const payload = { brand: slug, sample, patterns, message };

  if (mode === 'cms' && cmsUrl()) {
    const response = await fetch(`${cmsUrl()}/training/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`CMS ${response.status}: ${(await response.text()).slice(0, 160)}`);
    return { mode: 'cms', result: await response.json() };
  }

  if (mode === 'github') {
    const results = [];
    results.push(await pushToGitHub(`${TRAINING_DIR}/${slug}/samples/${sample.id}.json`, sample, { message }));
    results.push(await pushToGitHub(`${TRAINING_DIR}/${slug}/patterns.json`, patterns, { message }));
    return { mode: 'github', result: { files: results.length, commits: results.map((r) => r.commit?.sha?.slice(0, 7)).filter(Boolean) } };
  }

  downloadJson(`${slug}-${sample.id}.json`, payload);
  return { mode: 'download', result: { file: `${slug}-${sample.id}.json` } };
}
