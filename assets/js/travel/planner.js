export const BUDGET_ITEMS = [
  ['flights', 'Vé máy bay khứ hồi', 0.25], ['stay', 'Lưu trú', 0.25], ['transport', 'Di chuyển tại điểm đến', 0.1],
  ['meals', 'Ăn uống', 0.15], ['activities', 'Tham quan', 0.08], ['visa', 'Visa / hồ sơ', 0.03],
  ['insurance', 'Bảo hiểm du lịch', 0.04], ['connectivity', 'SIM / kết nối', 0.01], ['shopping', 'Mua sắm cá nhân', 0.04], ['reserve', 'Dự phòng khẩn cấp', 0.05],
];

export const CURRENCIES = { USD: 'Mỹ', KRW: 'Hàn Quốc', TWD: 'Đài Loan', AUD: 'Úc', JPY: 'Nhật Bản', EUR: 'Châu Âu', SGD: 'Singapore', THB: 'Thái Lan', GBP: 'Anh' };

const MAX_TRIP_BUDGET_VND = 1_000_000_000;

export function parseVnd(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : NaN;
  const input = String(value ?? '').trim().toLowerCase();
  if (!input) return NaN;
  const million = input.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu)\s*(?:₫|đ|vnd)?\s*$/i);
  if (million) {
    const amount = Number(million[1].replace(',', '.')) * 1_000_000;
    return Number.isSafeInteger(amount) ? amount : NaN;
  }
  if (/^-\d+$/.test(input)) return Number(input);
  const normalized = input.replace(/\s*(?:₫|đ|vnd)\s*$/i, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:[.,\s]\d{3})+)$/.test(normalized)) return NaN;
  const digits = normalized.replace(/[.,\s]/g, '');
  if (!digits) return NaN;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : NaN;
}

export function formatVndInput(value) {
  const amount = parseVnd(value);
  return Number.isSafeInteger(amount) && amount > 0 ? `${new Intl.NumberFormat('vi-VN').format(amount)} ₫` : '';
}

export function validateBudgetVnd(value) {
  const amount = parseVnd(value);
  if (!Number.isSafeInteger(amount)) return { valid: false, amount: null, error: 'Vui lòng nhập ngân sách hợp lệ.' };
  if (amount <= 0) return { valid: false, amount, error: 'Ngân sách phải lớn hơn 0.' };
  if (amount > MAX_TRIP_BUDGET_VND) return { valid: false, amount, error: 'Ngân sách không được vượt quá 1.000.000.000 ₫.' };
  return { valid: true, amount, error: '' };
}

export function buildTripRequest(values) {
  const destination = String(values.destination || '').trim();
  if (!destination) throw new Error('Vui lòng nhập điểm đến.');
  const daysRaw = String(values.days ?? '').trim();
  if (!/^\d+$/.test(daysRaw)) throw new Error('Vui lòng nhập số ngày du lịch hợp lệ.');
  const days = Number(daysRaw);
  if (!Number.isSafeInteger(days) || days < 1 || days > 90) throw new Error('Thời lượng phải từ 1 đến 90 ngày.');
  const budget = validateBudgetVnd(values.budgetVnd);
  if (!budget.valid) throw new Error(budget.error);
  const startDate = String(values.startDate || '').trim();
  if (startDate) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(`${startDate}T00:00:00Z`) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate) throw new Error('Vui lòng chọn ngày khởi hành hợp lệ.');
  }
  return { ...values, destination, days, budgetVnd: budget.amount, startDate };
}

export function currencyForDestination(destination = '') {
  const text = destination.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/han quoc|south korea|\bseoul\b|\bbusan\b/.test(text)) return 'KRW';
  if (/dai loan|taiwan|\btaipei\b/.test(text)) return 'TWD';
  if (/\buc\b|australia|\bsydney\b|\bmelbourne\b/.test(text)) return 'AUD';
  if (/\bmy\b|\busa\b|united states|\bnew york\b|los angeles|hawaii/.test(text)) return 'USD';
  if (/nhat ban|japan|\btokyo\b|\bosaka\b/.test(text)) return 'JPY';
  if (/singapore/.test(text)) return 'SGD';
  if (/thai lan|thailand|bangkok/.test(text)) return 'THB';
  if (/\banh\b|united kingdom|\blondon\b/.test(text)) return 'GBP';
  if (/phap|\bduc\b|germany|italy|italia|spain|tay ban nha|europe|chau au/.test(text)) return 'EUR';
  return '';
}

export function makeId() { return globalThis.crypto?.randomUUID?.() || `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

export function buildTrip({ destination, days, budgetVnd, travelers = 1, departureCity = '', startDate = '', visaMode = false, currency = '', purpose = 'Du lịch', places = '' }) {
  const request = buildTripRequest({ destination, days, budgetVnd, startDate });
  const dayCount = request.days;
  const amount = request.budgetVnd;
  const endDate = startDate ? addDays(startDate, dayCount - 1) : '';
  return {
    id: makeId(), title: `${destination.trim()} · ${dayCount} ngày`, destination: destination.trim(), daysCount: dayCount,
    budgetVnd: amount, travelers: Math.max(1, Math.floor(Number(travelers) || 1)), departureCity: departureCity.trim(),
    startDate, endDate, visaMode: Boolean(visaMode), currency: currency || currencyForDestination(destination), purpose: String(purpose || 'Du lịch'), places: String(places || ''),
    exchange: null, budget: BUDGET_ITEMS.map(([id, label, share]) => ({ id, label, estimateVnd: Math.round(amount * share), confirmedVnd: 0, status: 'estimate' })),
    days: Array.from({ length: dayCount }, (_, index) => ({
      day: index + 1, date: startDate ? addDays(startDate, index) : '', city: destination.trim(), morning: '', lunch: '', afternoon: '', dinner: '', evening: '',
      transport: '', accommodation: 'Chưa đặt', estimateVnd: 0, notes: '', locked: false,
    })),
  };
}

export function addDays(date, count) {
  const [year, month, day] = String(date).split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + count, 12));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

export function money(value, currency = 'VND') {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: currency === 'VND' || currency === 'KRW' ? 0 : 2 }).format(value || 0)} ${currency}`;
}

export function sumBudget(budget = [], field = 'estimateVnd') { return budget.reduce((sum, item) => sum + Math.max(0, Number(item[field]) || 0), 0); }

export function convertVnd(amount, rates, currency) {
  const usdVnd = Number(rates?.USD?.VND);
  const usdLocal = Number(rates?.USD?.[currency]);
  if (!(usdVnd > 0) || !(usdLocal > 0)) return null;
  return { usd: amount / usdVnd, local: amount / usdVnd * usdLocal };
}

export async function fetchRates() {
  const response = await fetch('https://api.frankfurter.dev/v2/rates?base=USD&quotes=VND,KRW,TWD,AUD,JPY,EUR,SGD,THB,GBP', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Nguồn tỷ giá phản hồi ${response.status}.`);
  const rows = await response.json();
  const usd = {};
  rows.forEach((row) => { if (row?.quote && Number(row.rate) > 0) usd[row.quote] = Number(row.rate); });
  if (!(usd.VND > 0)) throw new Error('Nguồn tỷ giá không trả về VND.');
  return { USD: usd, source: 'Frankfurter (tỷ giá tham chiếu ngân hàng trung ương)', retrievedAt: new Date().toISOString(), rateDate: rows.find((row) => row.date)?.date || '' };
}

export function displayDate(date) {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
