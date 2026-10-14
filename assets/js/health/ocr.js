// OCR for exam/medicine invoices.
//
// Tesseract.js is loaded lazily from a CDN so the site bundle stays small and
// OCR only downloads when the user actually requests it. Everything degrades
// gracefully: if the network/model is unavailable the caller can still fall
// back to manual entry. The parser (`parseInvoiceText`) is pure and unit tested.

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

const FACILITY_KEYWORDS = /(bệnh viện|\bbv\b|phòng khám|phòng mạch|trung tâm y tế|đa khoa|bệnh xá|hospital|clinic|medical|healthcare|polyclinic)/i;
const ADDRESS_KEYWORDS = /(địa chỉ|address|số nhà|đường\b|quận|phường|thành phố|tp\.?\s*hcm|hà nội)/i;

export function parseInvoiceText(rawText, kind = 'exam') {
  const text = String(rawText || '');
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const head = lines.slice(0, 12);

  const facility = cleanLabelValue(firstMatch(lines, /(?:bệnh viện|phòng khám|trung tâm y tế|trung tâm y khoa|đơn vị|địa điểm|hospital|clinic|healthcare)\s*[:：]\s*([^\n]{3,})/i))
    || cleanLabelValue(head.find((line) => FACILITY_KEYWORDS.test(line)) || '');

  const address = cleanLabelValue(firstMatch(lines, /(?:địa chỉ|address)\s*[:：]\s*([^\n]+)/i))
    || cleanLabelValue(lines.find((line) => ADDRESS_KEYWORDS.test(line) && !FACILITY_KEYWORDS.test(line)) || '');

  const dateRaw = firstMatch(lines, /(?:ngày(?:\s*khám|\s*thực hiện|\s*tạo|\s*lập)?)\s*[:：]?\s*(\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4})/i);
  const date = parseDate(dateRaw) || parseDate(text);

  const timeRaw = firstMatch(lines, /(?:giờ|time)\s*[:：]?\s*(\d{1,2}[:hg]\d{2})/i);
  const timeMatch = (timeRaw || text).match(/(\d{1,2})[:hg](\d{2})/);
  const time = timeMatch ? `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}` : '';

  const patientName = cleanLabelValue(firstMatch(lines, /(?:họ và tên|họ tên|tên bệnh nhân|tên khách hàng|patient\s*name|full\s*name)\s*[:：]\s*([^\n]+)/i));
  const patientId = cleanLabelValue(firstMatch(lines, /(?:mã bệnh nhân|mã bn|mã hồ sơ|mã y tế|patient\s*id|mã thẻ|mã đt|mã số)\s*[:：#]?\s*([A-Za-z0-9._\-/]+)/i));
  const doctor = cleanLabelValue(firstMatch(lines, /(?:bác sĩ|bs\.|doctor|dr\.)\s*[:：]\s*([^\n]+)/i));

  const icd = (firstMatch(lines, /(?:icd[-\s]?10?|mã icd|mã bệnh)\s*[:：]\s*([A-Z]\d{2}(?:\.\d{1,2})?)/i)
    || (text.match(/\b([A-TV-Z]\d{2}\.\d{1,2})\b/) || [])[1]
    || '').toUpperCase();

  const disease = cleanLabelValue(firstMatch(lines, /(?:chẩn đoán|diagnosis|bệnh)\s*[:：]\s*([^\n]+)/i))
    .replace(/^icd[-\s]?10?\s*[:：]\s*[A-Z]\d{2}(?:\.\d{1,2})?\s*/i, '');

  const amountLabels = [
    [/tổng\s*(?:tiền\s*)?(?:thanh toán|thực trả|cộng)?|thành tiền|total|grand total/i, 'total'],
    [/tiền\s*khám|phí\s*khám|khám\s*bệnh|exam fee|consultation/i, 'examFee'],
    [/tiền\s*thuốc|medicine|pharmacy|drug fee/i, 'medicineFee'],
    [/bhyt|bảo hiểm|insurance/i, 'insurance'],
    [/giảm giá|discount/i, 'discount'],
  ];
  const amounts = {};
  const foundAmounts = [];
  lines.forEach((line) => {
    const numeric = line.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})/);
    if (!numeric) return;
    const value = parseMoney(numeric[1]);
    if (value === null) return;
    foundAmounts.push({ line, value });
    amountLabels.forEach(([pattern, key]) => {
      if (pattern.test(line) && amounts[key] === undefined) amounts[key] = value;
    });
  });
  if (amounts.total === undefined) {
    // Avoid picking the number embedded in a dosage/quantity line.
    const candidates = foundAmounts.filter((item) => !/(mg|mcg|ml|viên|ống|gói|lần)/i.test(item.line));
    const biggest = candidates.reduce((max, item) => (max === null || item.value > max.value ? item : max), null);
    if (biggest) amounts.total = biggest.value;
  }

  const medicines = [];
  const unitRe = /(\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|ui|iu|%|viên|ống|gói|chai|lọ|tuýp))/i;
  lines.forEach((line) => {
    const unitMatch = line.match(unitRe);
    if (!unitMatch) return;
    const name = line.slice(0, unitMatch.index).replace(/^[\d.\-)\s]+/, '').replace(/[:：]\s*$/, '').trim();
    const dosage = line.slice(unitMatch.index).trim();
    if (!name || name.length < 3) return;
    if (FACILITY_KEYWORDS.test(name) || ADDRESS_KEYWORDS.test(name)) return;
    medicines.push({ name: name.slice(0, 160), dosage: dosage.slice(0, 160) });
  });

  return {
    kind,
    facility,
    address,
    date,
    time,
    patientName,
    patientId,
    doctor,
    icd,
    disease,
    amounts,
    total: amounts.total ?? null,
    medicines,
    rawText: text.slice(0, 6000),
  };
}
