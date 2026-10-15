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
// Nhãn metadata (vùng B/C/D): check/creck/checks (Tesseract hay đọc dấu ":" thành
// "s"), POS, ngày/máy, thu ngân, pager, shop id, SĐT/số điện thoại/điện thoại…
// "SOT" là cách OCR hay đọc nhầm "SĐT" → phải nhận ra để KHÔNG thành món.
const METADATA_RE = /^(check\b|check[s]?\b|cheque|creck\b|pos\d*|ngay\b|may\b|thu\s*ngan|thu\s*rean|pager|shop\s*id|sdt\b|sot\b|so\s*dt|dien thoai|\bdt\b|tel\b|phone\b|mobile\b|dia chi|address|receipt|in store|hoa don|so hd|so hoa don|ma don|hoadon|quay\b|branch|chi nhanh|stt\b|#)/;
// Một dòng chỉ toàn số điện thoại (không nhãn) cũng không bao giờ là món.
const PHONE_NUMBER_RE = /^(?:\+?84|0)\d{1,3}(?:[.\s-]?\d{3,4}){2,}$/;
const SUBTOTAL_RE = /tong tien hang|thanh tien|tien hang|tien truoc thue|sub\s*total|subtotal|tam tinh/;
const TOTAL_RE = /tong thanh toan|phai thanh toan|grand total|\btotal\b|^tong\b|^cong\b|can thanh toan/;
const TAX_RE = /(\bvat\b|\bthue\b|gtgt|\btax\b)/;
const FEE_RE = /(\bphi\b|service|phuc vu|dong goi|\btip\b|phi dich vu)/;
const DISCOUNT_RE = /giam gia|discount|chiet khau|coupon|voucher|ecode|khuyen mai/;
// "Tùy chọn / topping": dòng bắt đầu bằng "+" hoặc chứa từ khoá topping/extra…
// KHÔNG bắt các chữ xuất hiện trong tên món (ví dụ "Latte Da L").
const MODIFIER_RE = /(^|\s)(topping|extra|thêm|them|add|shot|size\s*[a-z]?|nong|lanh|ít đá|it da|đá riêng|da rieng|ít đường|it duong|ít sữa|it sua|mang đi|mang di|take away|to go)(\s|$)/;
const MERCHANT_RE = /highlands|starbucks|phuc long|phúc long|coffee house|cộng cà phê|cong ca phe|milano|passio|trung nguyen|trung nguyên|the coffee|katinat|cheese coffee/i;

// Nhãn loại dòng dùng chung cho UI (dropdown đổi loại) và test.
export const LINE_TYPES = [
  ['product', 'Sản phẩm'],
  ['modifier', 'Tùy chọn / topping'],
  ['discount', 'Giảm giá / coupon'],
  ['tax', 'Thuế (VAT)'],
  ['fee', 'Phí / dịch vụ'],
  ['subtotal', 'Tổng tiền hàng'],
  ['total', 'Tổng thanh toán'],
  ['payment', 'Thanh toán'],
  ['metadata', 'Thông tin hoá đơn (check/quán/nhân viên)'],
  ['unknown', 'Không xác định'],
];

export const LINE_TYPE_LABELS = Object.fromEntries(LINE_TYPES);

// Dấu hiệu chắc chắn của một DÒNG SẢN PHẨM: có chỉ báo số lượng ("2 x", "x2",
// "2 Tên"). Dùng để không nâng một dòng mơ hồ thành sản phẩm chỉ vì nó có số.
function hasQuantityMarker(text) {
  if (/^\s*\d{1,3}\s*[x×*]\s+\S/i.test(text)) return true;
  if (/[x×*]\s*\d{1,3}(?![\d.,])/i.test(text)) return true;
  if (/^\s*\d{1,3}\s+(?=[^\d])/.test(text)) return true;
  return false;
}

// Phân loại một dòng theo đúng tập nhãn của spec.
//
// Quan trọng: KHÔNG tự nâng một dòng có chữ + số thành "product". Một dòng chỉ
// được coi là sản phẩm khi có BẰNG CHỨNG: chỉ báo số lượng, tên khớp nhóm món đã
// biết, hoặc có ≥ 2 mốc tiền (đơn giá + thành tiền). Dòng mơ hồ → "unknown" để
// người dùng xác nhận, tránh biến SĐT/check/tổng tiền thành món.
export function classifyLine(line) {
  const raw = String(line || '');
  const norm = normalizeName(raw);
  if (!norm || !/[a-z0-9]/.test(norm)) return 'unknown';
  if (PAYMENT_RE.test(norm)) return 'payment';
  if (METADATA_RE.test(norm)) return 'metadata';
  if (PHONE_NUMBER_RE.test(norm.replace(/[.\s-]+/g, '')) || PHONE_NUMBER_RE.test(norm)) return 'metadata';
  if (DISCOUNT_RE.test(norm) || /^\s*[-–—]/.test(raw)) return 'discount';
  if (SUBTOTAL_RE.test(norm)) return 'subtotal';
  if (TOTAL_RE.test(norm)) return 'total';
  if (TAX_RE.test(norm)) return 'tax';
  if (FEE_RE.test(norm)) return 'fee';
  if (/^\s*\+\s*/.test(raw) || MODIFIER_RE.test(norm)) return 'modifier';
  const stripped = stripDateTimes(raw);
  const values = moneyTokens(stripped);
  if (values.length && /[a-zà-ỹ]/i.test(norm)) {
    const name = cleanName(stripped);
    const knownMenu = name.length >= 2 && classifyItem(name) !== 'other';
    if (hasQuantityMarker(stripped) || knownMenu || values.length >= 2) return 'product';
    // Có số nhưng không đủ bằng chứng là món → để người dùng phân loại.
    return 'unknown';
  }
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

// Một dòng sản phẩm: giữ nguyên đơn giá gốc đọc được, KHÔNG lấy thành tiền thay
// cho đơn giá. Số lượng / đơn giá không đọc được → null (không mặc định 1).
export function extractProduct(line) {
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
    // "2 x 45.000 90.000": nếu có số lượng + 2 mốc, đơn giá là mốc đầu.
    if (quantity && quantity > 0 && grossAmount !== null && unitPrice !== null && quantity * unitPrice !== grossAmount && values.length === 2) {
      // Giữ nguyên cả hai giá trị in trên hoá đơn; chỉ suy ra gross khi thiếu.
      grossAmount = values[values.length - 1];
    }
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

// Phân loại từng dòng OCR gốc (chưa gộp) để UI hiển thị "các dòng chưa chắc chắn".
export function classifyLines(lines = []) {
  return lines.map((line, index) => {
    const values = moneyTokens(line);
    return {
      index,
      text: line,
      type: classifyLine(line),
      amount: values.length ? values[values.length - 1] : null,
    };
  });
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

  for (let scanIndex = 0; scanIndex < scan.length; scanIndex += 1) {
    const line = scan[scanIndex];
    const type = classifyLine(line);
    const values = moneyTokens(line);
    const amount = values.length ? values[values.length - 1] : null;

    if (type === 'product') {
      const item = extractProduct(line);
      if (item) {
        item.modifiers = [];
        item.source_text = line;
        // Nguồn gốc: dòng OCR sinh ra giá trị này (để truy vết khi sai số).
        item.source_line_index = scanIndex;
        items.push(item);
        lastProductIndex = items.length - 1;
      }
      continue;
    }
    if (type === 'modifier') {
      if (lastProductIndex !== null && items[lastProductIndex]) {
        items[lastProductIndex].modifiers.push(cleanDiscountDescription(line));
      }
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
      const checkMatch = line.match(/check[s]?\s*[:：]?\s*(\d+)/i);
      const receiptMatch = line.match(/(?:so\s*hd|so hoa don|receipt)\s*[:：]?\s*([A-Za-z0-9._\-/]{3,})/i);
      if (checkMatch && receipt.check_number === null) receipt.check_number = checkMatch[1];
      if (receiptMatch && receipt.receipt_number === null) receipt.receipt_number = receiptMatch[1];
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
  receipt.receipt_level_discount = receiptLevelDiscount;

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
    lines: classifyLines(lines),
    scan,
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
