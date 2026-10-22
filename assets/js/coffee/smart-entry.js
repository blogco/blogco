import { classifyExpense, normalizeSearchText, EXPENSE_CATALOG } from './expense.js';

export const LEARNING_KEY = 'blogco.coffee.merchant-learning.v1';
export const CATALOG_KEY = 'blogco.coffee.expense-catalog.v1';

function getStorage(storage) {
  try { return storage || globalThis.localStorage; } catch { return null; }
}

export function parseVietnameseAmount(text) {
  const source = normalizeSearchText(text);
  const patterns = [
    /(?:^|\s)(\d+)\s*tr\s*(\d+)\b/,
    /(?:^|\s)(\d+)\s*trieu\s*(\d+)?\b/,
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*tr(?:ieu)?\b/,
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*k\b/,
    /(?:^|\s)(\d{1,3}(?:\.\d{3})+|\d{4,})(?:\s|$)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    let amount;
    if (/tr/.test(match[0]) || /trieu/.test(match[0])) {
      const first = Number(String(match[1]).replace(',', '.'));
      const tail = match[2] ? Number(match[2]) : 0;
      amount = Math.round(first * 1_000_000 + tail * (String(match[2] || '').length === 1 ? 100_000 : 1_000));
    } else if (/k\b/.test(match[0])) amount = Math.round(Number(match[1].replace(',', '.')) * 1000);
    else amount = Number(match[1].replaceAll('.', ''));
    if (Number.isSafeInteger(amount) && amount > 0) return { amount, matched: match[0].trim() };
  }
  return { amount: 0, matched: '' };
}

function localDate(offsetDays = 0, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseSmartExpense(text, { now = new Date(), learning = [], catalog = EXPENSE_CATALOG } = {}) {
  const input = String(text || '').trim();
  const normalized = normalizeSearchText(input);
  const money = parseVietnameseAmount(input);
  const date = /hom qua/.test(normalized) ? localDate(-1, now) : localDate(0, now);
  const dateWords = /hom nay|hom qua|sang nay|toi nay|ngay\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?/g;
  const dateMention = input.match(dateWords)?.[0] || '';
  let occurredDate = date;
  const explicit = /ngay\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/i.exec(normalizeSearchText(input));
  if (explicit) occurredDate = `${explicit[3] || now.getFullYear()}-${String(Number(explicit[2])).padStart(2, '0')}-${String(Number(explicit[1])).padStart(2, '0')}`;
  const cleaned = input.replace(money.matched, ' ').replace(/\b(hôm nay|hôm qua|sáng nay|tối nay|ngày\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?|hằng tháng|mỗi tháng)\b/giu, ' ').replace(/\s+/g, ' ').trim();
  const monthly = /hang thang|moi thang/.test(normalized);
  const learned = learning.find((rule) => rule.aliases?.some((alias) => normalizeSearchText(cleaned).includes(normalizeSearchText(alias))));
  const category = learned?.category || classifyExpense(cleaned);
  const store = cleaned.replace(/\b(sáng|trưa|tối|khuya)\s+nay\b/giu, '').trim();
  const confidence = learned ? 0.98 : (category !== 'other' ? 0.78 : 0.35);
  return {
    amount: money.amount, date: occurredDate, store, description: cleaned,
    category, confidence, recurrence: monthly ? 'monthly' : '',
    reasons: learned ? ['Danh mục theo lựa chọn đã xác nhận trước đây.'] : category !== 'other' ? ['Khớp từ khóa giao dịch với danh mục chi tiêu.'] : ['Chưa tìm thấy quy tắc danh mục đủ rõ.'],
    needsCategory: confidence < 0.6,
    matchedAmount: money.matched, dateMention,
  };
}

export function getMerchantLearning(storage) {
  try {
    const value = JSON.parse(getStorage(storage)?.getItem(LEARNING_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function learnMerchantCategory(merchant, category, { storage, alias = '' } = {}) {
  const name = String(merchant || '').trim();
  const key = normalizeSearchText(name);
  if (!key || !category) return [];
  const target = getStorage(storage);
  if (!target) throw new Error('Không thể truy cập bộ nhớ trên thiết bị này.');
  const entries = getMerchantLearning(target);
  const existing = entries.find((entry) => normalizeSearchText(entry.merchant) === key);
  if (existing) {
    existing.category = category;
    existing.confirmations = (existing.confirmations || 1) + 1;
    existing.aliases = [...new Set([...(existing.aliases || []), name, alias].filter(Boolean))];
    existing.updatedAt = new Date().toISOString();
  } else {
    entries.push({ id: `merchant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, merchant: name, aliases: [...new Set([name, alias].filter(Boolean))], category, confirmations: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  target.setItem(LEARNING_KEY, JSON.stringify(entries));
  return entries;
}

export function clearMerchantLearning(storage) {
  getStorage(storage)?.removeItem(LEARNING_KEY);
  return [];
}

export function getExpenseCatalog(storage) {
  try {
    const saved = JSON.parse(getStorage(storage)?.getItem(CATALOG_KEY) || 'null');
    if (!Array.isArray(saved)) return EXPENSE_CATALOG;
    return [...EXPENSE_CATALOG, ...saved.filter((item) => item && item.id && item.label)];
  } catch { return EXPENSE_CATALOG; }
}

export function saveCustomExpenseCategory(group, { storage } = {}) {
  const label = String(group?.label || '').trim().slice(0, 80);
  if (!label) throw new Error('Tên nhóm danh mục không được để trống.');
  const target = getStorage(storage);
  if (!target) throw new Error('Không thể truy cập bộ nhớ trên thiết bị này.');
  const builtInIds = new Set(EXPENSE_CATALOG.map((entry) => entry.id));
  const custom = getExpenseCatalog(target).filter((entry) => !builtInIds.has(entry.id));
  const id = group.id || `custom-${Date.now()}`;
  const next = { id, reportKey: group.reportKey || 'other', label, icon: String(group.icon || '📦').slice(0, 8), children: (group.children || [{ id: `${id}-01`, name: label }]).map((child, index) => ({ id: child.id || `${id}-${String(index + 1).padStart(2, '0')}`, name: String(child.name || '').trim().slice(0, 80) })).filter((child) => child.name) };
  const index = custom.findIndex((entry) => entry.id === id);
  if (index >= 0) custom[index] = next;
  else custom.push(next);
  target.setItem(CATALOG_KEY, JSON.stringify(custom));
  return next;
}

export function detectReceiptDuplicate(candidate, receipts = [], { threshold = 0.5 } = {}) {
  const normalize = (value) => normalizeSearchText(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const merchant = normalize(candidate.store);
  return receipts.find((receipt) => {
    if (Number(receipt.total) !== Number(candidate.total ?? candidate.amount)) return false;
    if (String(receipt.date || '') !== String(candidate.date || '')) return false;
    const existing = normalize(receipt.store);
    const similarity = merchant && existing && (merchant.includes(existing) || existing.includes(merchant)) ? Math.min(merchant.length, existing.length) / Math.max(merchant.length, existing.length) : 0;
    return similarity >= threshold;
  }) || null;
}
