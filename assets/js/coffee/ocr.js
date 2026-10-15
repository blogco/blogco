// OCR for Highlands Coffee receipts.
//
// Tesseract.js is pulled from a CDN only when the user actually asks for OCR, so
// the site bundle stays small and the app keeps working offline with manual
// entry. The parser (`parseHighlandsInvoice`) is pure and unit tested; it never
// guesses a price that is not printed on the receipt.

import { classifyItem, normalizeName } from './menu.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let scriptPromise;

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

export async function recognizeImage(file, { lang = 'vie+eng', onProgress } = {}) {
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(file, lang, {
    logger: (message) => {
      if (typeof onProgress === 'function') onProgress(message);
    },
  });
  return (data?.text || '').trim();
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

// Line prefixes that mark a summary row rather than a purchasable item.
const LABEL_LINE = /^(?:tong\b|sub ?total|subtotal|vat\b|thue\b|gtgt|giam gia|discount|chiet khau|voucher|khuyen mai|tien\b|thanh toan|total\b|grand\b|cong\b|phi\b|tip\b|service\b|payment\b|cash\b|card\b|khach dua|tien thua|tra lai|change\b|net\b|gross\b|amount\b|so hd|so hoa don|ma don|hoadon|hoa don)/;

function isLabelLine(line) {
  const norm = normalizeName(stripDateTimes(line));
  if (!norm) return true;
  if (LABEL_LINE.test(norm)) return true;
  // A line of digits/punctuation only is never an item name.
  return !/[a-zà-ỹ]/i.test(norm);
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
  return { name: resolvedName.slice(0, 160), qty: resolvedQty, unitPrice, amount, category: classifyItem(resolvedName) };
}

export function parseHighlandsItems(lines) {
  const items = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const moneyOnLine = [...stripDateTimes(line).matchAll(moneyRegex())].length > 0;
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
  if (/momo|zalo\s*pay|zalopay|vnpay|shopeepay|ví\s*điện\s*tử|vi dien tu|ewallet|mã\s*qr|\bqr\b/i.test(text)) return 'ewallet';
  if (/chuyển\s*khoản|chuyen khoan|ngân\s*hàng|ngan hang|bank|transfer/i.test(text)) return 'transfer';
  if (/thẻ|\bcard\b|visa|master|jcb|credit|debit|\bpos\b/i.test(text)) return 'card';
  if (/tiền\s*mặt|tien mat|\bcash\b/i.test(text)) return 'cash';
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

export function parseHighlandsInvoice(rawText) {
  const text = String(rawText || '');
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const head = lines.slice(0, 15);

  const brand = head.find((line) => /highlands/i.test(line)) || '';
  const branch = cleanLabelValue(firstMatch(lines, /(?:chi\s*nhánh|chi nhanh|\bcn\b|branch|quầy|quay)\s*[:：\-]?\s*([^\n]{3,})/i));
  const store = branch
    || cleanLabelValue(brand.replace(/highlands\s*coffee/i, '').replace(/^[\s\-–:]+/, ''))
    || cleanLabelValue(brand)
    || '';

  const address = cleanLabelValue(firstMatch(lines, /(?:địa chỉ|dia chi|\bđc\b|\bdc\b|address)\s*[:：]?\s*([^\n]+)/i))
    || cleanLabelValue(lines.find((line) => /(phường|phuong|quận|quan|thành phố|thanh pho|tp\.?\s*hcm|đường|duong|street|ward|district|tầng|tang|vincom|vinhomes)/i.test(line) && !/highlands|hoá đơn|hóa đơn/i.test(line)) || '');

  const orderCode = firstMatch(lines, /(?:số\s*(?:h[đd]|hoá đơn|hóa đơn|bill|đơn)|mã\s*(?:đơn|hoá đơn|hóa đơn|h[đd])|order\s*(?:no|id|#)?|bill\s*(?:no|#)?|#)\s*[:：#]?\s*([A-Za-z0-9._\-/]{3,})/i);

  const date = parseDate(text);
  const timeRaw = firstMatch(lines, /(?:giờ|thời gian|time)\s*[:：]?\s*(\d{1,2}[:hg]\d{2})/i);
  const timeMatch = (timeRaw || text).match(/(\d{1,2})[:hg](\d{2})/);
  const time = timeMatch ? `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}` : '';

  const items = parseHighlandsItems(lines);
  const amounts = scanAmounts(lines);
  const itemSum = items.reduce((sum, item) => sum + item.amount, 0);

  if (amounts.subtotal === undefined && itemSum > 0) amounts.subtotal = itemSum;
  if (amounts.total === undefined) {
    if (amounts.subtotal !== undefined) amounts.total = amounts.subtotal - (amounts.discount || 0) + (amounts.vat || 0);
    else if (amounts._largest !== null) amounts.total = amounts._largest;
  }
  delete amounts._largest;

  return {
    store,
    address,
    date,
    time,
    orderCode,
    items,
    subtotal: amounts.subtotal ?? null,
    discount: amounts.discount ?? null,
    vat: amounts.vat ?? null,
    total: amounts.total ?? null,
    cash: amounts.cash ?? null,
    change: amounts.change ?? null,
    paymentMethod: detectPayment(text),
    rawText: text.slice(0, 8000),
  };
}
