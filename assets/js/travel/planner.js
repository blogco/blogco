export const BUDGET_ITEMS = [
  ['flights', 'Vé máy bay khứ hồi', 0.25], ['stay', 'Lưu trú', 0.25], ['transport', 'Di chuyển tại điểm đến', 0.1],
  ['meals', 'Ăn uống', 0.15], ['activities', 'Tham quan', 0.08], ['visa', 'Visa / hồ sơ', 0.03],
  ['insurance', 'Bảo hiểm du lịch', 0.04], ['connectivity', 'SIM / kết nối', 0.01], ['shopping', 'Mua sắm cá nhân', 0.04], ['reserve', 'Dự phòng khẩn cấp', 0.05],
];

export const CURRENCIES = { USD: 'Mỹ', KRW: 'Hàn Quốc', TWD: 'Đài Loan', AUD: 'Úc', JPY: 'Nhật Bản', EUR: 'Châu Âu', SGD: 'Singapore', THB: 'Thái Lan', GBP: 'Anh' };

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
  const dayCount = Math.min(90, Math.max(1, Math.floor(Number(days))));
  const amount = Math.round(Number(budgetVnd));
  if (!destination.trim() || !Number.isFinite(dayCount) || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('Nhập điểm đến, số ngày và ngân sách VND hợp lệ (ngân sách là số nguyên an toàn).');
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
