// Trích xuất hoá đơn có cấu trúc — hiện thực hoá "system prompt AI trích xuất
// hoá đơn chính xác": phân loại từng dòng (product/modifier/discount/tax/fee/
// subtotal/total/payment/metadata/unknown), tách sản phẩm khỏi metadata/giảm
// giá/tổng tiền, chuẩn hoá tiền tệ, kiểm tra nhất quán và chấm độ tin cậy.
//
// Nguyên tắc: ưu tiên chính xác hơn đầy đủ. Không bịa, không suy diễn thiếu căn
// cứ, không biến metadata thành món, không lấy thành tiền làm đơn giá, không sửa
// số liệu để ép tổng khớp. Giá trị không xác định = null.
//
// Hàm thuần, chạy được trong Node (xem extract.test.js).

import { parseMoney, parseDate, fixVietnamese } from './ocr.js';
import { normalizeName, classifyItem, CATEGORY_LABELS } from './menu.js';

const MONEY_SOURCE = String.raw`\d{1,3}(?:[.,]\d{3})+|\d{4,}`;

function moneyRegex() {
  return new RegExp(MONEY_SOURCE, 'g');
}

function stripDateTimes(line) {
  return String(line)
    .replace(/\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}/g, ' ')
    .replace(/\d{1,2}\s*[:hg]\s*\d{2}(?::\d{2})?/gi, ' ');
}

// Toàn bộ token tiền trên dòng, giữ thứ tự xuất hiện (đã loại ngày/giờ).
export function moneyTokens(line) {
  return [...stripDateTimes(line).matchAll(moneyRegex())]
    .map((match) => parseMoney(match[0]))
    .filter((value) => value !== null);
}

const PAYMENT_RE = /payoo|master\s*card|mastercard|visa|jcb|momo|zalo\s*pay|zalopay|vnpay|shopeepay|shopee\s*pay|napas|qr\s*pay|qr\s*code|chuyen khoan|ngan hang|\bbank\b|transfer|tien mat|\bcash\b|\bthe\b|credit|debit|\bcard\b/;
const METADATA_RE = /^(check\b|creck\b|pos\d*|ngay\b|may\b|thu\s*ngan|pager|shop\s*id|sdt\b|dien thoai|dia chi|address|receipt|in store|hoa don|so hd|so hoa don|ma don|hoadon|#)/;
const SUBTOTAL_RE = /tong tien hang|thanh tien|tien hang|tien truoc thue|sub\s*total|subtotal/;
const TOTAL_RE = /tong thanh toan|phai thanh toan|grand total|\btotal\b|^tong\b|^cong\b/;
const TAX_RE = /(\bvat\b|\bthue\b|gtgt|\btax\b)/;
const FEE_RE = /(\bphi\b|service|phuc vu|dong goi|\btip\b|phi dich vu)/;
const DISCOUNT_RE = /giam gia|discount|chiet khau|coupon|voucher|ecode|khuyen mai|khuyen mai/;
const MERCHANT_RE = /highlands|starbucks|phuc long|phúc long|coffee house|cộng cà phê|cong ca phe|milano|passio|trung nguyen|trung nguyên|the coffee|katinat|cheese coffee/i;

// Phân loại một dòng theo đúng tập nhãn của spec.
export function classifyLine(line) {
  const raw = String(line || '');
  const norm = normalizeName(raw);
  if (!norm || !/[a-z0-9]/.test(norm)) return 'unknown';
  if (PAYMENT_RE.test(norm)) return 'payment';
  if (METADATA_RE.test(norm)) return 'metadata';
  if (DISCOUNT_RE.test(norm) || /^\s*[-–—]/.test(raw)) return 'discount';
  if (SUBTOTAL_RE.test(norm)) return 'subtotal';
  if (TOTAL_RE.test(norm)) return 'total';
  if (TAX_RE.test(norm)) return 'tax';
  if (FEE_RE.test(norm)) return 'fee';
  if (moneyTokens(raw).length && /[a-zà-ỹ]/i.test(norm)) return 'product';
  return 'unknown';
}

// Số lượng: chỉ nhận khi đọc được rõ; nếu không → null (không mặc định 1).
function detectQuantity(text) {
  let match = text.match(/^\s*(\d{1,3})\s*[x×*]\s+\S/);
  if (match) return Number(match[1]);
  match = text.match(/[x×*]\s*(\d{1,3})(?![\d.,])/);
  if (match) return Number(match[1]);
  match = text.match(/^\s*(\d{1,3})\s+(?=[^\d])/);
  if (match) return Number(match[1]);
  return null;
}

function cleanName(text) {
  return text
    .replace(moneyRegex(), ' ')
    .replace(/[x×*]/gi, ' ')
    .replace(/[\s._·…|]+/g, ' ')
    .replace(/^\d+\s*/, '')
    .replace(/[\s:–-]+$/, '')
    .trim();
}

function confidenceFor({ name, unitPrice, quantity, gross }) {
  let score = 0.4;
  if (name && name.length >= 3) score += 0.25;
  if (gross !== null) score += 0.2;
  if (unitPrice !== null) score += 0.1;
  if (quantity !== null) score += 0.1;
  return Math.min(1, Math.round(score * 100) / 100);
}

function extractProduct(line) {
  const values = moneyTokens(line);
  if (!values.length) return null;
  const nameOriginal = cleanName(stripDateTimes(line));
  if (!/[a-zà-ỹ]/i.test(normalizeName(nameOriginal)) || nameOriginal.length < 2) return null;

  const quantity = detectQuantity(stripDateTimes(line));
  const category = CATEGORY_LABELS[classifyItem(nameOriginal)] || 'Khác';

  let unitPrice = null;
  let grossAmount = null;
  if (values.length >= 2) {
    unitPrice = values[0];
    grossAmount = values[values.length - 1];
  } else if (quantity === 1) {
    unitPrice = values[0];
    grossAmount = values[0];
  } else {
    // Một con số, số lượng không rõ/khác 1: coi là thành tiền in trên dòng.
    grossAmount = values[0];
  }

  const reasons = [];
  if (quantity === null) reasons.push('không đọc được số lượng');
  if (unitPrice === null) reasons.push('không đọc được đơn giá');

  return {
    name_original: nameOriginal,
    name_normalized: nameOriginal.length >= 2 ? nameOriginal.replace(/\s+/g, ' ') : null,
    quantity,
    unit_price: unitPrice,
    gross_amount: grossAmount,
    discount_amount: 0,
    net_amount: grossAmount,
    category,
    confidence: confidenceFor({ name: nameOriginal, unitPrice, quantity, gross: grossAmount }),
    needs_review: reasons.length > 0,
    review_reason: reasons.length ? reasons.join('; ') : null,
  };
}

function cleanDiscountDescription(line) {
  return String(line)
    .replace(moneyRegex(), ' ')
    .replace(/^\s*[-–—]+\s*/, '')
    .replace(/[x×*]/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:–-]+$/, '')
    .trim()
    .slice(0, 120);
}

// Gộp dòng tên trần + dòng "N x giá" thành một dòng sản phẩm.
function mergeTwoLineItems(lines) {
  const merged = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    if (next
      && classifyLine(line) === 'unknown'
      && /[a-zà-ỹ]/i.test(normalizeName(line))
      && /^\s*\d{1,3}\s*[x×*]\s*\d/.test(stripDateTimes(next))) {
      merged.push(`${line} ${stripDateTimes(next)}`);
      index += 1;
      continue;
    }
    merged.push(line);
  }
  return merged;
}

function detectMerchant(lines) {
  const isContact = (line) => /@|https?:|www\.|\.com|\.vn\b|customerservice/i.test(line);
  for (const line of lines) {
    if (!isContact(line) && MERCHANT_RE.test(line)) {
      return line.replace(/\s+/g, ' ').trim().slice(0, 120);
    }
  }
  const candidate = lines.find((line) => !isContact(line)
    && /^[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ .&'-]{3,}$/.test(line.trim())
    && classifyLine(line) === 'unknown');
  return candidate ? candidate.trim().slice(0, 120) : null;
}

// Trích xuất cấu trúc đầy đủ theo schema bắt buộc.
export function extractReceipt(rawText) {
  const text = fixVietnamese(String(rawText || ''));
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const scan = mergeTwoLineItems(lines);

  const receipt = {
    merchant_name: null,
    receipt_number: null,
    check_number: null,
    date: null,
    currency: 'VND',
    subtotal: null,
    discount_total: null,
    tax_total: null,
    fee_total: null,
    total_amount: null,
    payment_method: null,
  };
  const items = [];
  const adjustments = [];
  const warnings = [];
  let lastProductIndex = null;
  let receiptLevelDiscount = 0;

  for (const line of scan) {
    const type = classifyLine(line);
    const values = moneyTokens(line);
    const amount = values.length ? values[values.length - 1] : null;

    if (type === 'product') {
      const item = extractProduct(line);
      if (item) { items.push(item); lastProductIndex = items.length - 1; }
      continue;
    }
    if (type === 'discount') {
      if (amount === null) continue;
      const linked = lastProductIndex !== null ? lastProductIndex : null;
      adjustments.push({
        type: 'discount',
        description: cleanDiscountDescription(line),
        amount: Math.abs(amount),
        linked_item_index: linked,
        confidence: 0.9,
      });
      if (linked !== null && items[linked]) {
        items[linked].discount_amount = (items[linked].discount_amount || 0) + Math.abs(amount);
        items[linked].net_amount = items[linked].gross_amount !== null
          ? Math.max(0, items[linked].gross_amount - items[linked].discount_amount)
          : null;
      } else {
        receiptLevelDiscount += Math.abs(amount);
      }
      lastProductIndex = null; // giảm giá kế tiếp không gắn nhầm cùng một món
      continue;
    }
    if (type === 'subtotal') { if (amount !== null && receipt.subtotal === null) receipt.subtotal = amount; continue; }
    if (type === 'total') { if (amount !== null && receipt.total_amount === null) receipt.total_amount = amount; continue; }
    if (type === 'tax') { if (amount !== null) receipt.tax_total = (receipt.tax_total || 0) + amount; continue; }
    if (type === 'fee') { if (amount !== null) receipt.fee_total = (receipt.fee_total || 0) + amount; continue; }
    if (type === 'payment') {
      if (receipt.payment_method === null) {
        receipt.payment_method = cleanDiscountDescription(line) || null;
      }
      continue;
    }
    if (type === 'metadata') {
      const shopMatch = line.match(/shop\s*id\s*[:：]?\s*(\d+)/i);
      const checkMatch = line.match(/check\s*[:：]?\s*(\d+)/i);
      const receiptMatch = line.match(/(?:so\s*hd|so hoa don|receipt)\s*[:：]?\s*([A-Za-z0-9._\-/]{3,})/i);
      if (checkMatch && receipt.check_number === null) receipt.check_number = checkMatch[1];
      if (receiptMatch && receipt.receipt_number === null) receipt.receipt_number = receiptMatch[1];
      void shopMatch;
      continue;
    }
  }

  receipt.merchant_name = detectMerchant(lines);
  receipt.date = parseDate(text) || null;
  const allDiscounts = adjustments
    .filter((adjustment) => adjustment.type === 'discount')
    .reduce((sum, adjustment) => sum + (adjustment.amount || 0), 0);
  receipt.discount_total = adjustments.some((adjustment) => adjustment.type === 'discount')
    ? allDiscounts
    : null;

  const itemNets = items.map((item) => item.net_amount ?? item.gross_amount ?? 0);
  const itemsSum = itemNets.reduce((sum, value) => sum + value, 0);
  if (receipt.subtotal === null && itemsSum > 0) receipt.subtotal = itemsSum;

  // Kiểm tra nhất quán (không sửa số liệu gốc để ép khớp).
  const tax = receipt.tax_total || 0;
  const fee = receipt.fee_total || 0;
  const expected = itemsSum - receiptLevelDiscount + tax + fee;
  let arithmeticCheck = 'not_verified';
  let totalMatches = null;
  let discrepancy = null;
  if (receipt.total_amount !== null) {
    discrepancy = receipt.total_amount - expected;
    totalMatches = Math.abs(discrepancy) <= 1;
    arithmeticCheck = totalMatches ? 'passed' : 'failed';
    if (!totalMatches) warnings.push(`Tổng lệch ${discrepancy.toLocaleString('vi-VN')} đ so với tổng các dòng.`);
  } else {
    warnings.push('Không tìm thấy dòng tổng tiền để đối chiếu.');
  }
  if (items.some((item) => item.needs_review)) warnings.push('Một số dòng thiếu số lượng hoặc đơn giá, cần xác nhận.');
  if (receipt.merchant_name === null) warnings.push('Không xác định được tên cửa hàng.');

  return {
    receipt,
    items,
    adjustments,
    validation: {
      arithmetic_check: arithmeticCheck,
      receipt_total_matches: totalMatches,
      discrepancy_amount: totalMatches ? 0 : discrepancy,
      warnings,
      needs_manual_review: arithmeticCheck === 'failed' || items.some((item) => item.needs_review) || items.length === 0,
    },
  };
}
