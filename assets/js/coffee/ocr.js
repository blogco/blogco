// OCR for Highlands Coffee receipts.
//
// Tesseract.js is pulled from a CDN only when the user actually asks for OCR, so
// the site bundle stays small and the app keeps working offline with manual
// entry. The parser (`parseHighlandsInvoice`) is pure and unit tested; it never
// guesses a price that is not printed on the receipt.

import { classifyItem, normalizeName } from './menu.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
let scriptPromise;
let pdfPromise;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-ocr-src="${url}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Không tải được thư viện OCR.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.ocrSrc = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được thư viện OCR (kiểm tra kết nối mạng).'));
    document.head.appendChild(script);
  });
}

export async function loadTesseract() {
  if (typeof window !== 'undefined' && window.Tesseract) return window.Tesseract;
  scriptPromise ??= loadScript(TESSERACT_URL);
  await scriptPromise;
  if (!window.Tesseract) {
    scriptPromise = undefined;
    throw new Error('Thư viện OCR không khởi động được.');
  }
  return window.Tesseract;
}

// ---------------------------------------------------------------------------
// PDF input — hoá đơn gốc thường là PDF, không chỉ JPG/PNG.
// ---------------------------------------------------------------------------
//
// pdf.js renders each PDF page to a canvas; the canvas then flows through the
// exact same OCR pipeline as a photo. Both libraries are lazy-loaded from a CDN.

export function isPdf(input) {
  if (!input) return false;
  const type = String(input.type || '').toLowerCase();
  const name = String(input.name || input.fileName || '');
  return type === 'application/pdf' || /\.pdf$/i.test(name);
}

async function loadPdfJs() {
  if (typeof window !== 'undefined' && window.pdfjsLib) return window.pdfjsLib;
  pdfPromise ??= loadScript(PDFJS_URL);
  await pdfPromise;
  if (!window.pdfjsLib) {
    pdfPromise = undefined;
    throw new Error('Thư viện đọc PDF không khởi động được.');
  }
  if (window.pdfjsLib.GlobalWorkerOptions) window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  return window.pdfjsLib;
}

// Render (up to `maxPages`) PDF pages to canvases at `scale`x resolution.
export async function pdfToPageCanvases(file, { maxPages = 5, scale = 2 } = {}) {
  if (typeof document === 'undefined') throw new Error('Không có môi trường canvas để đọc PDF.');
  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const total = pdf.numPages;
  const count = Math.min(total, maxPages);
  const canvases = [];
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    canvases.push(canvas);
  }
  return { canvases, total, used: count };
}

// Data-URL of the first PDF page, for the dropzone preview.
export async function pdfToPreviewDataUrl(file, { maxDim = 1400, quality = 0.8 } = {}) {
  const { canvases } = await pdfToPageCanvases(file, { maxPages: 1, scale: 2 });
  const canvas = canvases[0];
  if (!canvas) return '';
  const ratio = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  if (ratio >= 1) return canvas.toDataURL('image/jpeg', quality);
  const scaled = document.createElement('canvas');
  scaled.width = Math.round(canvas.width * ratio);
  scaled.height = Math.round(canvas.height * ratio);
  scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled.toDataURL('image/jpeg', quality);
}

export async function recognizeImage(file, { lang = 'vie+eng', onProgress, preprocess = true, maxPdfPages = 5 } = {}) {
  const Tesseract = await loadTesseract();
  const recognize = async (input) => {
    const { data } = await Tesseract.recognize(input, lang, {
      logger: (message) => {
        if (typeof onProgress === 'function') onProgress(message);
      },
    });
    return (data?.text || '').trim();
  };

  if (isPdf(file)) {
    const { canvases, total, used } = await pdfToPageCanvases(file, { maxPages: maxPdfPages });
    const texts = [];
    for (let index = 0; index < canvases.length; index += 1) {
      if (typeof onProgress === 'function') {
        onProgress({ status: `PDF trang ${index + 1}/${used}${total > used ? ` (còn ${total - used} trang, tăng maxPdfPages để đọc thêm)` : ''}` });
      }
      let page = canvases[index];
      if (preprocess) page = await preprocessImage(page).catch(() => canvases[index]);
      texts.push(await recognize(page));
    }
    return texts.filter(Boolean).join('\n\n---\n\n');
  }

  let input = file;
  if (preprocess) {
    try {
      input = await preprocessImage(file);
    } catch {
      // Preprocessing is best-effort: fall back to the raw image so OCR still runs.
      input = file;
    }
  }
  return recognize(input);
}

// ---------------------------------------------------------------------------
// Tầng 1 — Image preprocessing (pure helpers are unit tested)
// ---------------------------------------------------------------------------
//
// Thermal receipt prints are low-contrast and phone photos are noisy/skewed, so
// Tesseract reads far better on a cleaned, binarised, upright image. The pure
// functions below operate on a grayscale byte array (length = width * height)
// which keeps them testable outside the browser; `preprocessImage` is the DOM
// orchestrator that turns a File/Blob/dataURL into the final canvas.

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không đọc được ảnh.'));
    if (typeof source === 'string') {
      image.src = source;
      return;
    }
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => { image.src = String(reader.result); };
      reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
      reader.readAsDataURL(source);
      return;
    }
    if (source && (source.naturalWidth || source.width)) {
      image.src = source.toDataURL ? source.toDataURL('image/png') : source.src;
      return;
    }
    reject(new Error('Nguồn ảnh không hợp lệ.'));
  });
}

// RGBA bytes -> one luma byte per pixel (BT.601 weights).
export function toGrayscale(rgba) {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    out[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return out;
}

// Percentile contrast stretch: makes faded thermal ink legible before binarising.
export function stretchContrast(gray, { lowPercentile = 0.02, highPercentile = 0.98 } = {}) {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 1) histogram[gray[i]] += 1;
  const total = gray.length || 1;
  const findPercentile = (fraction) => {
    const target = total * fraction;
    let acc = 0;
    for (let value = 0; value < 256; value += 1) {
      acc += histogram[value];
      if (acc >= target) return value;
    }
    return 255;
  };
  const low = findPercentile(lowPercentile);
  const high = findPercentile(highPercentile);
  if (high <= low) return gray;
  const out = new Uint8ClampedArray(gray.length);
  const range = high - low;
  for (let i = 0; i < gray.length; i += 1) out[i] = ((gray[i] - low) * 255) / range;
  return out;
}

// 3x3 median filter — removes speckle noise without smearing strokes.
export function medianFilter(gray, width, height) {
  const out = new Uint8ClampedArray(gray.length);
  const window = new Uint8Array(9);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          window[count] = gray[ny * width + nx];
          count += 1;
        }
      }
      for (let i = 1; i < 9; i += 1) {
        const key = window[i];
        let j = i - 1;
        while (j >= 0 && window[j] > key) { window[j + 1] = window[j]; j -= 1; }
        window[j + 1] = key;
      }
      out[y * width + x] = window[4];
    }
  }
  return out;
}

// Adaptive (local-mean) threshold via a summed-area table. Better than a global
// cutoff on uneven receipts (shadow, gradient light).
export function adaptiveThreshold(gray, width, height, { radius = 8, constant = 10 } = {}) {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * stride + (x1 + 1)]
        - integral[y0 * stride + (x1 + 1)]
        - integral[(y1 + 1) * stride + x0]
        + integral[y0 * stride + x0];
      out[y * width + x] = gray[y * width + x] > (sum / area) - constant ? 255 : 0;
    }
  }
  return out;
}

// Estimate receipt skew (degrees) with a projection-profile scan. Dark pixels
// are rotated by each candidate angle and binned by row; the angle that makes
// text lines sharpest (max summed squared bin-to-bin change) wins. Feed it the
// binarised image.
export function estimateSkewAngle(gray, width, height, { maxAngle = 8, step = 0.5 } = {}) {
  const points = [];
  const maxPoints = 20000;
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / maxPoints)));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (gray[y * width + x] < 128) points.push(x, y);
    }
  }
  if (points.length / 2 < 20) return 0;

  const binSize = height + Math.ceil(width * Math.abs(Math.sin((maxAngle * Math.PI) / 180))) + 2;
  const offset = binSize >> 1;
  let bestAngle = 0;
  let bestScore = -1;
  for (let angle = -maxAngle; angle <= maxAngle + 1e-9; angle += step) {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rows = new Uint32Array(binSize);
    for (let i = 0; i < points.length; i += 2) {
      const index = Math.round(points[i] * sin + points[i + 1] * cos) + offset;
      if (index >= 0 && index < binSize) rows[index] += 1;
    }
    let score = 0;
    for (let i = 1; i < binSize; i += 1) {
      const delta = rows[i] - rows[i - 1];
      score += delta * delta;
    }
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  return bestAngle;
}

function grayToCanvas(gray, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
    const value = gray[p];
    imageData.data[i] = value;
    imageData.data[i + 1] = value;
    imageData.data[i + 2] = value;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function rotateCanvas(sourceCanvas, angleDeg) {
  const { width, height } = sourceCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, -width / 2, -height / 2);
  return canvas;
}

// Full Tầng 1 pipeline: upscale 2x -> grayscale + contrast -> denoise ->
// adaptive threshold -> deskew. Returns a canvas Tesseract can read directly.
export async function preprocessImage(source, {
  scale = 2,
  maxDim = 2600,
  denoise = true,
  threshold = true,
  deskew = true,
} = {}) {
  if (typeof document === 'undefined') throw new Error('Không có môi trường canvas để xử lý ảnh.');
  const image = await loadImageElement(source);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) throw new Error('Ảnh không hợp lệ.');

  // Upscale small receipts 2x but cap the long edge so phone photos stay bounded.
  const ratio = Math.min(scale, maxDim / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * ratio));
  const height = Math.max(1, Math.round(naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);

  let gray = toGrayscale(ctx.getImageData(0, 0, width, height).data);
  gray = stretchContrast(gray);
  if (denoise) gray = medianFilter(gray, width, height);
  if (threshold) gray = adaptiveThreshold(gray, width, height);

  let result = grayToCanvas(gray, width, height);
  if (deskew) {
    const angle = estimateSkewAngle(gray, width, height);
    if (Math.abs(angle) >= 0.5) result = rotateCanvas(result, angle);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tầng 2 — Vietnamese OCR post-processing + region-aware parsing (vùng A–I)
// ---------------------------------------------------------------------------
//
// Thermal Highlands receipts reach the parser mangled by Tesseract: "Creck"→Check,
// "Tay tim"→Thành tiền, "Payoo Bark Card"→Payoo Bank Card… The lookup table
// repairs the common cases, then the parser (see docs/ca-phe-receipt-wireframe.md
// for the vùng A–I map) separates items from discount rows and payment rows so
// those never become bogus menu items.
const VI_FIXES = {
  'Creck': 'Check',
  'May': 'Ngay',
  'Tae tim': 'Thanh tien',
  'Tog tien': 'Tong tien',
  'Thu rean': 'Thu ngan',
  'Xoyen Ouy Khang': 'Nguyen Duy Khang',
  'Payoo Bark Card': 'Payoo Bank Card',
  'Inte hạ': 'In Store',
  'gGHựi': 'Highlands',
  '1B Hg tag': '126 Hong Bang',
  'Lon, TP.HN': 'Lon, TP.HCM',
  'Matchadi Latte': 'Matcha Latte',
  'Latte 0': 'Latte Da',
  'Ecoce Coupon giae': 'Ecode Coupon giam',
  'Y tt': 'Banh Dua',
  'Chia sey kien': 'Chia se y kien',
  'cua bun vôi chưng': 'cua ban voi chung',
  'custonerseryicethighlandscof fee': 'customerservice@highlandscoffee',
  'San 0:a': 'San Qua',
  'Tại Ao': 'Tai App',
  'orf Fret': '',
  'Gut 08 va rap thu tin': 'Quet QR hoac nhap thong tin',
  'trong 3 010 sau khi ma': 'trong 3 gio sau khi mua',
  'Don sau 20h, wi Tong gui true': 'Don sau 20h, vui long gui truoc',
  'Th cue rary': '23h cung ngay',
  'Xin cư on Quy khách': 'Xin cam on Quy khach',
  'Quy khách': 'Quy khach',
};

// Longest phrase first so "Matchadi Latte" is repaired before "Latte 0".
const VI_FIX_ENTRIES = Object.entries(VI_FIXES)
  .filter(([wrong, right]) => wrong !== right)
  .sort((a, b) => b[0].length - a[0].length);

export function fixVietnamese(text) {
  let out = String(text || '');
  for (const [wrong, right] of VI_FIX_ENTRIES) {
    if (out.includes(wrong)) out = out.split(wrong).join(right);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parsing helpers (pure)
// ---------------------------------------------------------------------------

// A money token: either Vietnamese-grouped (45.000 / 1.200.000) or a plain run
// of 4+ digits (45000). Two-digit numbers are never treated as prices.
const MONEY_SOURCE = String.raw`\d{1,3}(?:[.,]\d{3})+|\d{4,}`;

function moneyRegex() {
  return new RegExp(MONEY_SOURCE, 'g');
}

// Turn a money-ish string into a number. Handles Vietnamese grouping ('.'),
// English grouping (',') and mixed forms like 1.200.000,50.
export function parseMoney(raw) {
  if (raw === null || raw === undefined) return null;
  let value = String(raw).replace(/[^\d.,]/g, '');
  if (!value) return null;
  const hasDot = value.includes('.');
  const hasComma = value.includes(',');
  if (hasDot && hasComma) {
    const lastDot = value.lastIndexOf('.');
    const lastComma = value.lastIndexOf(',');
    if (lastDot > lastComma) value = value.replace(/,/g, '');
    else value = value.replace(/\./g, '').replace(',', '.');
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = value.split(sep);
    const looksGrouped = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
    if (looksGrouped) value = parts.join('');
    else if (parts.length === 2 && parts[1].length > 2) value = parts.join('');
    else value = `${parts[0]}.${parts.slice(1).join('')}`;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIsoDate(day, month, year) {
  let y = Number(year);
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  const d = Number(day);
  const m = Number(month);
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseDate(text) {
  const source = String(text || '');
  // ISO first so "2026-09-02" is not misread as dd-mm-yy.
  let match = source.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (match) return toIsoDate(match[3], match[2], match[1]);
  match = source.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (match) return toIsoDate(match[1], match[2], match[3]);
  return '';
}

// Remove dates/times before scanning for money so "2026" and "09:30" are never
// mistaken for prices. Grouped prices ("1.200.000") survive because the date
// pattern only matches when the middle group is 1–2 digits.
function stripDateTimes(line) {
  return String(line)
    .replace(/\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}/g, ' ')
    .replace(/\d{1,2}\s*[:hg]\s*\d{2}(?::\d{2})?/gi, ' ');
}

function firstMatch(lines, regex, group = 1) {
  for (const line of lines) {
    const match = line.match(regex);
    if (match && String(match[group] ?? '').trim()) return String(match[group]).trim();
  }
  return '';
}

function cleanLabelValue(value = '') {
  return String(value)
    .replace(/^[\s:.\-–]+/, '')
    .split(/\s{2,}|[|•]|\s[-–]\s|Địa chỉ|Address/i)[0]
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Line prefixes that mark a summary/metadata row rather than a purchasable item.
// (check/pos/ngay/thu ngan… come from the vùng D metadata block.)
const LABEL_LINE = /^(?:tong\b|sub ?total|subtotal|vat\b|thue\b|gtgt|giam gia|discount|chiet khau|voucher|khuyen mai|tien\b|thanh toan|thanh tien|total\b|grand\b|cong\b|phi\b|tip\b|service\b|payment\b|cash\b|card\b|khach dua|tien thua|tra lai|change\b|net\b|gross\b|amount\b|so hd|so hoa don|ma don|hoadon|hoa don|check\b|pos\d*|\bpos\b|ngay\b|thu ngan|pager|shopid|sdt|dia chi|dien thoai|address|receipt)/;

function isLabelLine(line) {
  const norm = normalizeName(stripDateTimes(line));
  if (!norm) return true;
  if (LABEL_LINE.test(norm)) return true;
  // A line of digits/punctuation only is never an item name.
  return !/[a-zà-ỹ]/i.test(norm);
}

function lineMoney(line) {
  return [...stripDateTimes(line).matchAll(moneyRegex())]
    .map((match) => parseMoney(match[0]))
    .filter((value) => value !== null);
}

// Payment method rows (vùng G). Checked on the accent-stripped line so both
// "Tiền mặt" and "tien mat" resolve; never allowed to become an item.
const PAYMENT_PATTERNS = [
  [/payoo/, 'Payoo Bank Card'],
  [/master\s*card|mastercard/, 'Mastercard'],
  [/visa/, 'Visa'],
  [/jcb/, 'JCB'],
  [/momo/, 'MoMo'],
  [/zalo\s*pay|zalopay/, 'ZaloPay'],
  [/vnpay/, 'VNPay'],
  [/shopeepay|shopee\s*pay/, 'ShopeePay'],
  [/napas/, 'Napas'],
  [/qr\s*pay|qr\s*code|ma\s*qr|\bqr\b/, 'QR Pay'],
  [/chuyen khoan|ngan hang|\bbank\b|transfer/, 'Chuyển khoản'],
  [/tien mat|\bcash\b/, 'Tiền mặt'],
  [/\bthe\b|credit|debit|\bcard\b/, 'Thẻ'],
];

function isPaymentLine(line) {
  const norm = normalizeName(line);
  return PAYMENT_PATTERNS.some(([pattern]) => pattern.test(norm));
}

function paymentMethodFromLabel(label = '') {
  if (/payoo|thẻ|card|visa|master|jcb|credit|debit/i.test(label)) return 'card';
  if (/momo|zalo|vnpay|shopee|napas|qr/i.test(label)) return 'ewallet';
  if (/chuyển|chuyen|transfer|bank/i.test(label)) return 'transfer';
  if (/mặt|mat|cash/i.test(label)) return 'cash';
  return '';
}

function extractPayment(lines) {
  let fallback = null;
  for (const line of lines) {
    const norm = normalizeName(line);
    for (const [pattern, label] of PAYMENT_PATTERNS) {
      if (!pattern.test(norm)) continue;
      const amount = lineMoney(line).slice(-1)[0] ?? null;
      if (amount !== null) return { payment: label, paymentAmount: amount };
      fallback ??= { payment: label, paymentAmount: null };
      break;
    }
  }
  return fallback || { payment: '', paymentAmount: null };
}

// A discount printed against an item (vùng E) starts with "-" or carries a
// coupon/ecode keyword; a standalone "Giảm giá X" is receipt-level (scanAmounts).
function isItemDiscountLine(line) {
  if (/^\s*[-–—]/.test(line)) return true;
  return /(coupon|voucher|ecode|khuyen mai)/.test(normalizeName(line));
}

function cleanDiscountLabel(line) {
  return String(line)
    .replace(moneyRegex(), ' ')
    .replace(/^\s*[-–—]+\s*/, '')
    .replace(/[x×*]/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:–-]+$/, '')
    .trim()
    .slice(0, 80);
}

function attachDiscount(items, line) {
  if (!items.length) return;
  const value = lineMoney(line).slice(-1)[0];
  if (value === null || value === undefined) return;
  const item = items[items.length - 1];
  item.discount = (item.discount || 0) - value;
  item.discountLabel = cleanDiscountLabel(line);
  item.amount = Math.max(0, (item.unitPrice || 0) * (item.qty || 1) + item.discount);
}

// Pull quantity from the many shapes a receipt prints it: "2 x Name",
// "Name x2", "2 Name", "Name 2 90.000". Returns the remaining text.
function extractQty(text) {
  // "Name  1 x 55.000" — count right before the "x" marker + price.
  let match = text.match(new RegExp(String.raw`(?:^|\s)(\d{1,3})\s*[x×*]\s*(?=\d{1,3}(?:[.,]\d{3})+|\d{4,})`, 'i'));
  if (match) return { qty: Number(match[1]), rest: text.replace(match[0], ' ') };
  // "2 x Name" — leading count.
  match = text.match(/^\s*(\d{1,3})\s*[x×*]\s*/i);
  if (match) return { qty: Number(match[1]), rest: text.slice(match[0].length) };
  // "Name x2" — "x" before the count, not followed by price digits.
  match = text.match(/[x×*]\s*(\d{1,3})(?![\d.,])/i);
  if (match) return { qty: Number(match[1]), rest: text.replace(match[0], ' ') };
  // "2 Name" — a leading count.
  match = text.match(/^\s*(\d{1,3})\s+(?=\S)/);
  if (match) return { qty: Number(match[1]), rest: text.slice(match[0].length) };
  // "Name  2  90.000" — a small count squeezed between the name and the price.
  match = text.match(/(?:^|\s)(\d{1,3})\s+(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*$/);
  if (match) return { qty: Number(match[1]), rest: text.slice(0, match.index) + ' ' + match[2] };
  return { qty: 1, rest: text };
}

// Parse a single receipt line into an item, or null when it is a summary row.
export function parseItemLine(line) {
  const base = stripDateTimes(line);
  if (isLabelLine(base)) return null;
  const { qty, rest } = extractQty(base);
  const values = [...rest.matchAll(moneyRegex())].map((match) => parseMoney(match[0])).filter((value) => value !== null);
  if (!values.length) return null;
  const name = rest
    .replace(moneyRegex(), ' ')
    .replace(/[x×*]/gi, ' ')
    .replace(/[\s._·…|]+/g, ' ')
    .replace(/^[0-9]+/, ' ')
    .replace(/[\s:–-]+$/, '')
    .trim();
  if (name.length < 2) return null;
  const amount = values[values.length - 1];
  const unitPrice = values.length >= 2 ? values[0] : (qty > 1 ? Math.round(amount / qty) : amount);
  return applyTrailingQty(name, qty, values, unitPrice, amount);
}

// "Cà Phê Sữa 2 29.000 58.000": a leftover count sits between name and prices.
function applyTrailingQty(name, qty, values, unitPrice, amount) {
  const trailing = name.match(/^(.*\S)\s+(\d{1,3})$/);
  const resolvedQty = trailing && values.length >= 2 && qty === 1 ? Number(trailing[2]) : qty;
  const resolvedName = trailing && values.length >= 2 && qty === 1 ? trailing[1].trim() : name;
  return { name: resolvedName.slice(0, 160), qty: resolvedQty, unitPrice, amount, category: classifyItem(resolvedName), discount: 0, discountLabel: null };
}

export function parseHighlandsItems(lines) {
  const items = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    // Payment (vùng G) and item discounts (vùng E) never become menu items.
    if (isPaymentLine(line)) continue;
    if (isItemDiscountLine(line)) { attachDiscount(items, line); continue; }
    const moneyOnLine = lineMoney(line).length > 0;
    if (!moneyOnLine) {
      // Two-line items: a bare name followed by "1 x 45.000".
      const next = lines[index + 1];
      if (next && /^\s*\d{1,3}\s*[x×*]\s*\d/.test(stripDateTimes(next))) {
        const item = parseItemLine(`${line} ${stripDateTimes(next)}`);
        if (item) { items.push(item); index += 1; }
      }
      continue;
    }
    const item = parseItemLine(line);
    if (item) items.push(item);
  }
  return items;
}

function detectPayment(text) {
  const norm = normalizeName(text);
  if (/momo|zalo pay|zalopay|vnpay|shopeepay|napas|ewallet|ma qr|\bqr\b/.test(norm)) return 'ewallet';
  if (/\bthe\b|\bcard\b|visa|master|jcb|credit|debit|\bpos\b/.test(norm)) return 'card';
  if (/chuyen khoan|ngan hang|\bbank\b|transfer/.test(norm)) return 'transfer';
  if (/tien mat|\bcash\b/.test(norm)) return 'cash';
  return '';
}

function scanAmounts(lines) {
  const amounts = {};
  let largest = null;
  const take = (key, value) => {
    if (amounts[key] === undefined) { amounts[key] = value; return true; }
    return false;
  };
  lines.forEach((line) => {
    const clean = stripDateTimes(line);
    const values = [...clean.matchAll(moneyRegex())].map((match) => parseMoney(match[0])).filter((value) => value !== null);
    if (!values.length) return;
    const value = values[values.length - 1];
    const norm = normalizeName(clean);
    if (/giam gia|discount|chiet khau|voucher|khuyen mai/.test(norm)) { take('discount', value); return; }
    if (/(^|\s)(vat|thue|gtgt|tax)(\s|$)/.test(norm)) { take('vat', value); return; }
    if (/tong thanh toan|phai thanh toan|thanh toan|grand total|\btotal\b/.test(norm)) { take('total', value); return; }
    if (/thanh tien|tong tien hang|tien hang|sub ?total|subtotal/.test(norm)) { take('subtotal', value); return; }
    if (/tien mat|khach dua|khach tra|tendered|tien khach|\bcash\b/.test(norm)) { take('cash', value); return; }
    if (/tien thua|tra lai|\bchange\b/.test(norm)) { take('change', value); return; }
    if (/^tong\b/.test(norm)) { take('total', value); return; }
    if (largest === null || value > largest) largest = value;
  });
  amounts._largest = largest;
  return amounts;
}

// --- Vùng A–I metadata extraction -----------------------------------------

const ADDRESS_KEYWORDS = /(phường|phuong|quận|\bquan\b|thành phố|thanh pho|tp\.?\s*hcm|tphcm|hà nội|ha noi|đà nẵng|da nang|đường|duong|street|ward|district|tầng|tang|vincom|vinhomes|cho lon|hồng bàng|hong bang)/i;

function extractDateTime(lines, text) {
  const source = lines.find((line) => /(?:ngay|may)\b/i.test(line) && /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(line))
    || lines.find((line) => /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(line) && /\d{1,2}:\d{2}/.test(line))
    || text;
  const match = source.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})[^\d]{0,12}?(\d{1,2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : '';
}

function isFooterLine(line) {
  const norm = normalizeName(line);
  return /^\*+/.test(line.trim()) || /\bqr\b/.test(norm) || /xin cam on|customerservice|highlandscoffee|tai app|san qua|chia se/.test(norm);
}

const NAME_LINE_RE = /^[A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+){1,3}$/u;

function extractCustomer(lines) {
  const isName = (line) => NAME_LINE_RE.test(line)
    && !/hoa don|thanh toan|highlands|cam on|\bxin\b|coffee|cafe|chia se|san qua/i.test(line);
  const paymentIndex = lines.findIndex((line) => isPaymentLine(line));
  const start = paymentIndex >= 0 ? paymentIndex + 1 : 0;
  for (let index = start; index < lines.length; index += 1) {
    if (isFooterLine(lines[index])) break;
    if (isName(lines[index])) return lines[index];
  }
  const candidates = lines.filter(isName);
  return candidates[candidates.length - 1] || '';
}

function extractMeta(lines, text) {
  const address = cleanLabelValue(firstMatch(lines, /(?:địa chỉ|dia chi|\bđc\b|\bdc\b|address)\s*[:：]?\s*([^\n]+)/i))
    || cleanLabelValue(lines.find((line) => ADDRESS_KEYWORDS.test(line) && /\d/.test(line)) || '');

  const phone = firstMatch(lines, /(?:sđt|\bsdt\b|\bđt\b|điện thoại|dien thoai|phone|tel)\s*[:：.]?\s*([\d][\d.\-\s]{7,})/i).replace(/\s+/g, '');
  const shopId = firstMatch(lines, /shop\s*id\s*[:：]?\s*(\d+)/i);
  const pager = firstMatch(lines, /pager\s*[:：]?\s*(\d+)/i);
  const checkNo = firstMatch(lines, /check\s*[:：]?\s*(\d+)/i);
  const posMatch = text.match(/\bpos\s*(\d+)/i);
  const receiptTypeLine = lines.find((line) => /hoa don|hóa đơn|receipt/i.test(line) && !/xuat|qu[eé]t/i.test(line));
  const receiptType = receiptTypeLine ? cleanLabelValue(receiptTypeLine.replace(/\bpager.*$/i, '')) : '';
  const { payment, paymentAmount } = extractPayment(lines);

  return {
    brand: 'Highlands Coffee',
    address,
    phone,
    shopId,
    pager,
    checkNo,
    pos: posMatch ? `POS${posMatch[1]}` : '',
    datetime: extractDateTime(lines, text),
    cashier: cleanLabelValue(firstMatch(lines, /thu\s*ngan\s*[:：]?\s*([^\n]{2,})/i)),
    receiptType,
    customer: extractCustomer(lines),
    payment,
    paymentAmount,
  };
}

// Parse once, share between the legacy and the extended (vùng A–I) results.
function extractReceipt(rawText) {
  const text = fixVietnamese(String(rawText || ''));
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { text, lines, items: parseHighlandsItems(lines), amounts: scanAmounts(lines), meta: extractMeta(lines, text) };
}

// Extended, region-aware result (vùng A–I). This is the shape the wireframe and
// the required acceptance test describe.
export function parseHighlandsReceipt(rawText) {
  const { text, items, amounts, meta } = extractReceipt(rawText);
  const itemSum = items.reduce((sum, item) => sum + item.amount, 0);
  const subtotal = amounts.subtotal ?? (itemSum > 0 ? itemSum : null);
  let total = amounts.total;
  if (total === undefined) total = subtotal !== null ? subtotal - (amounts.discount || 0) + (amounts.vat || 0) : null;

  return {
    brand: meta.brand,
    address: meta.address,
    phone: meta.phone,
    shopId: meta.shopId,
    receiptType: meta.receiptType,
    pager: meta.pager,
    checkNo: meta.checkNo,
    pos: meta.pos,
    datetime: meta.datetime,
    cashier: meta.cashier,
    items: items.map((item) => ({
      qty: item.qty,
      name: item.name,
      price: item.unitPrice,
      discount: item.discount || 0,
      discountLabel: item.discountLabel || null,
    })),
    subtotal,
    total,
    payment: meta.payment,
    paymentAmount: meta.paymentAmount,
    customer: meta.customer,
    rawText: text.slice(0, 8000),
  };
}

export function parseHighlandsInvoice(rawText) {
  const { text, lines, items, amounts, meta } = extractReceipt(rawText);

  const brandLine = lines.find((line) => /highlands/i.test(line)) || '';
  const branch = cleanLabelValue(firstMatch(lines, /(?:chi\s*nhánh|chi nhanh|\bcn\b|branch|quầy|quay)\s*[:：\-]?\s*([^\n]{3,})/i));
  const store = branch
    || cleanLabelValue(brandLine.replace(/highlands\s*coffee/i, '').replace(/^[\s\-–:]+/, ''))
    || cleanLabelValue(brandLine)
    || 'Highlands Coffee';

  const orderCode = meta.checkNo
    || firstMatch(lines, /(?:số\s*(?:h[đd]|hoá đơn|hóa đơn|bill|đơn)|mã\s*(?:đơn|hoá đơn|hóa đơn|h[đd])|order\s*(?:no|id|#)?|bill\s*(?:no|#)?|#)\s*[:：#]?\s*([A-Za-z0-9._\-/]{3,})/i);

  const date = parseDate(meta.datetime || text);
  const timeMatch = (meta.datetime || '').match(/(\d{1,2}):(\d{2})/) || text.match(/(\d{1,2})[:hg](\d{2})/);
  const time = timeMatch ? `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}` : '';

  const itemSum = items.reduce((sum, item) => sum + item.amount, 0);
  if (amounts.subtotal === undefined && itemSum > 0) amounts.subtotal = itemSum;
  if (amounts.total === undefined) {
    if (amounts.subtotal !== undefined) amounts.total = amounts.subtotal - (amounts.discount || 0) + (amounts.vat || 0);
    else if (amounts._largest !== null) amounts.total = amounts._largest;
  }
  delete amounts._largest;

  return {
    store,
    address: meta.address,
    date,
    time,
    orderCode,
    items: items.map((item) => ({
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      amount: item.amount,
      category: item.category,
      ...(item.discount ? { discount: item.discount, discountLabel: item.discountLabel } : {}),
    })),
    subtotal: amounts.subtotal ?? null,
    discount: amounts.discount ?? null,
    vat: amounts.vat ?? null,
    total: amounts.total ?? null,
    cash: amounts.cash ?? null,
    change: amounts.change ?? null,
    paymentMethod: paymentMethodFromLabel(meta.payment) || detectPayment(text),
    // Extended (vùng A–I) fields kept so callers see the full structure.
    brand: meta.brand,
    phone: meta.phone,
    shopId: meta.shopId,
    receiptType: meta.receiptType,
    pager: meta.pager,
    checkNo: meta.checkNo,
    pos: meta.pos,
    datetime: meta.datetime,
    cashier: meta.cashier,
    payment: meta.payment,
    paymentAmount: meta.paymentAmount,
    customer: meta.customer,
    rawText: text.slice(0, 8000),
  };
}
