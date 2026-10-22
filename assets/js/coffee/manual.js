// "Nhập chi phí thủ công" (Manual expense input) — a spreadsheet-style table
// form mounted at #/coffee/manual-add. Each row becomes one coffee receipt in
// local storage, so the data shows up on the statistics page (#/coffee/stats).
//
// Columns: Brand · Amount · Date of transaction · Seasons (auto, read-only) ·
// Items (nhiều món, phân cách bằng dấu phẩy).
// The router (main.js) owns the DOM events; everything here is rendering plus a
// few small pure helpers that are unit-tested.

import { escapeHtml, formatVnd, toNumber } from './store.js';
import { seasonOf, seasonLabel } from './season.js';
import { POPULAR_ITEMS, classifyItem } from './menu.js';
import {
  EXPENSE_CATEGORIES, classifyExpense, normalizeExpenseCategory, expenseCategoryMeta, expenseCategoryIcon,
} from './expense.js';
import { icon } from '../icons.js';
import { seasonIcon } from './season.js';
import { parseSmartExpense, getMerchantLearning } from './smart-entry.js';
import { getExpenseCatalog } from './smart-entry.js';

export const BRAND_SUGGESTIONS = [
  'Highlands Coffee', 'Starbucks', 'Phúc Long', 'The Coffee House',
  'Trung Nguyên Legend', 'Cộng Cà Phê', 'Milano Coffee', 'Passio Coffee',
  'Katinat Saigon Kafe', 'Cheese Coffee', 'Aha Coffee', 'Ông Bầu Coffee',
  'Cà phê Muối Chú Long', 'Rang Rang Coffee', 'XLIII Coffee',
];

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Format a raw digit string as a Vietnamese thousands-separated number, e.g.
// "100200" → "100.200". Empty/invalid input returns ''.
export function formatAmountInput(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
}

export function brandOptions() {
  return BRAND_SUGGESTIONS.map((brand) => `<option value="${escapeHtml(brand)}"></option>`).join('');
}

export function itemOptions() {
  return POPULAR_ITEMS.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
}

// "Matcha Latte, Bánh dừa" → ['Matcha Latte', 'Bánh dừa'] (giữ thứ tự, bỏ rỗng,
// khử trùng lặp không phân biệt hoa/thường, giới hạn độ dài tên).
export function parseItemNames(text) {
  const seen = new Set();
  return String(text ?? '')
    .split(/[,;\n]/)
    .map((name) => name.replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter((name) => {
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Chia tổng tiền của một dòng cho các món (làm tròn, món cuối nhận phần dư) để
// tổng theo nhóm/món trên trang thống kê vẫn khớp tổng hoá đơn.
export function distributeAmount(total, count) {
  const n = Math.max(0, Math.floor(count));
  const amount = Math.max(0, Math.round(toNumber(total)));
  if (!n) return [];
  const base = Math.floor(amount / n);
  const parts = Array(n).fill(base);
  parts[n - 1] += amount - base * n;
  return parts;
}

// Chia tổng số món (quantity) cho các món đã nêu tên, luôn giữ tối thiểu 1 món
// mỗi dòng để "Số món" không nhỏ hơn số tên món.
export function distributeCount(total, count) {
  const n = Math.max(0, Math.floor(count));
  if (!n) return [];
  const value = Math.max(0, Math.round(toNumber(total)));
  if (value <= 0) return Array(n).fill(1);
  const base = Math.floor(value / n);
  const parts = Array(n).fill(base);
  parts[n - 1] += value - base * n;
  return parts.map((qty) => Math.max(1, qty));
}

// Build the receipt `items` array from a comma-separated Items cell + row
// subtotal. `quantity` (số món) is spread across the named items; when omitted
// each named item counts as one.
export function rowToItems(itemsText, subtotal, quantity = 0) {
  const names = parseItemNames(itemsText);
  if (!names.length) return [];
  const amounts = distributeAmount(subtotal, names.length);
  const qtys = distributeCount(quantity, names.length);
  return names.map((name, index) => {
    const amount = amounts[index] || 0;
    const qty = qtys[index] || 1;
    return { name, qty, unitPrice: qty ? Math.round(amount / qty) : amount, amount, category: classifyItem(name) };
  });
}

export function expenseCategoryOptions(selected = '') {
  const current = normalizeExpenseCategory(selected);
  const auto = `<option value=""${current ? '' : ' selected'}>Tự động phân loại</option>`;
  return auto + EXPENSE_CATEGORIES
    .map((category) => `<option value="${category.key}"${current === category.key ? ' selected' : ''}>${escapeHtml(category.label)}</option>`)
    .join('');
}

// Resolve the spending category for a manual row: an explicit pick wins, else
// the AI auto-classifies from the brand + items + note text.
export function resolveRowExpenseCategory(row = {}) {
  const explicit = normalizeExpenseCategory(row.expenseCategory ?? row.category);
  if (explicit) return explicit;
  return classifyExpense(row.brand, row.itemsText ?? row.items, row.note);
}

export function renderManualRow(row = {}, index = 0) {
  const date = row.date || todayKey();
  const subtotalRaw = row.subtotal ?? row.amount ?? '';
  const discountRaw = row.discount ?? '';
  const subtotal = subtotalRaw === '' ? '' : formatAmountInput(subtotalRaw);
  const discount = discountRaw === '' ? '' : formatAmountInput(discountRaw);
  const quantity = row.quantity === undefined || row.quantity === null || row.quantity === '' ? 1 : row.quantity;
  const total = Math.max(0, toNumber(subtotalRaw) - toNumber(discountRaw));
  const season = seasonOf(date);
  const itemsText = row.itemsText ?? row.items ?? '';
  const pickedCategory = normalizeExpenseCategory(row.expenseCategory ?? row.category);
  const categoryMeta = expenseCategoryMeta(resolveRowExpenseCategory({ ...row, brand: row.brand ?? '', itemsText }));
  return `<tr class="coffee-manual-row" data-manual-row data-category-detail-id="${escapeHtml(row.categoryDetailId || '')}" data-category-group-id="${escapeHtml(row.categoryGroupId || '')}">
    <td class="coffee-manual-cell--index"><span data-row-index>${index + 1}</span></td>
    <td>
      <input class="coffee-manual-input" name="brand" type="text" list="coffee-brand-suggest" maxlength="160" autocomplete="off" value="${escapeHtml(row.brand ?? '')}" placeholder="Highlands Coffee" aria-label="Brand (quán) dòng ${index + 1}">
    </td>
    <td class="coffee-manual-cell--category">
      <select class="coffee-manual-select" name="category" data-manual-category aria-label="Danh mục chi phí dòng ${index + 1}">
        ${expenseCategoryOptions(pickedCategory)}
      </select>
      <span class="coffee-expense-chip" data-expense-chip data-auto="${pickedCategory ? 'false' : 'true'}" title="${pickedCategory ? 'Danh mục bạn chọn' : 'Danh mục tự phân loại'}">${expenseCategoryIcon(categoryMeta.key)} ${escapeHtml(categoryMeta.label)}</span>
    </td>
    <td class="coffee-manual-cell--items">
      <input class="coffee-manual-input" name="items" type="text" list="coffee-manual-item-suggest" maxlength="300" autocomplete="off" value="${escapeHtml(itemsText)}" placeholder="Matcha Latte, Bánh dừa" aria-label="Items (tên món) dòng ${index + 1}, nhiều món phân cách bằng dấu phẩy">
    </td>
    <td class="coffee-manual-cell--qty">
      <input class="coffee-manual-input coffee-manual-input--qty" name="quantity" type="number" min="1" max="999" step="1" inputmode="numeric" value="${escapeHtml(quantity)}" aria-label="Số món dòng ${index + 1}">
    </td>
    <td>
      <input class="coffee-manual-input coffee-manual-input--date" name="date" type="date" value="${escapeHtml(date)}" aria-label="Ngày giao dịch dòng ${index + 1}">
    </td>
    <td class="coffee-manual-cell--season">
      <span class="coffee-season-chip${season ? '' : ' is-empty'}" data-season-cell title="Tự động theo ngày giao dịch">${season ? `${seasonIcon(season.key)} ${escapeHtml(season.label)}` : '—'}</span>
    </td>
    <td class="coffee-manual-cell--money">
      <input class="coffee-manual-input coffee-manual-input--amount" name="subtotal" type="text" inputmode="numeric" autocomplete="off" value="${escapeHtml(subtotal)}" placeholder="100.200" aria-label="Thành tiền dòng ${index + 1}">
      <span class="coffee-manual-currency" aria-hidden="true">đ</span>
    </td>
    <td class="coffee-manual-cell--money">
      <input class="coffee-manual-input coffee-manual-input--amount" name="discount" type="text" inputmode="numeric" autocomplete="off" value="${escapeHtml(discount)}" placeholder="0" aria-label="Giảm giá dòng ${index + 1}">
      <span class="coffee-manual-currency" aria-hidden="true">đ</span>
    </td>
    <td class="coffee-manual-cell--total">
      <span class="coffee-manual-total-cell" data-manual-total-cell>${escapeHtml(formatVnd(total))}</span>
    </td>
    <td class="coffee-manual-cell--action">
      <button type="button" class="coffee-ghost-button coffee-ghost-button--danger coffee-manual-remove" data-manual-remove aria-label="Xoá dòng ${index + 1}">✕</button>
    </td>
  </tr>`;
}

export function renderManualTable(rows = [{}]) {
  const list = rows.length ? rows : [{}];
  return `<div class="coffee-manual-wrap">
    <table class="coffee-manual-table">
      <thead>
        <tr>
          <th class="coffee-manual-cell--index" scope="col">STT</th>
          <th scope="col">Quán <span class="coffee-manual-th-sub">brand</span></th>
          <th class="coffee-manual-cell--category" scope="col">Danh mục chi phí <span class="coffee-manual-th-sub">AI tự phân loại · hoặc chọn nhanh</span></th>
          <th class="coffee-manual-cell--items" scope="col">Items <span class="coffee-manual-th-sub">tên món, cách nhau dấu phẩy</span></th>
          <th class="coffee-manual-cell--qty" scope="col">Số món</th>
          <th scope="col">Ngày giao dịch</th>
          <th class="coffee-manual-cell--season" scope="col">Mùa <span class="coffee-manual-th-sub">tự động theo ngày</span></th>
          <th class="coffee-manual-cell--money" scope="col">Thành tiền (đ)</th>
          <th class="coffee-manual-cell--money" scope="col">Giảm giá (đ)</th>
          <th class="coffee-manual-cell--total" scope="col">Thanh toán <span class="coffee-manual-th-sub">tự động = thành tiền − giảm giá</span></th>
          <th class="coffee-manual-cell--action" scope="col"><span class="coffee-visually-hidden">Thao tác</span></th>
        </tr>
      </thead>
      <tbody data-manual-body>
        ${list.map((row, index) => renderManualRow(row, index)).join('')}
      </tbody>
    </table>
  </div>
  <datalist id="coffee-brand-suggest">${brandOptions()}</datalist>
  <datalist id="coffee-manual-item-suggest">${itemOptions()}</datalist>`;
}

export function renderManualForm() {
  return `<form id="coffee-manual-form" class="coffee-card coffee-manual" novalidate>
    <section class="coffee-smart-entry" aria-labelledby="coffee-smart-title">
      <div><p class="coffee-eyebrow">NHẬP NHANH · XỬ LÝ TRÊN THIẾT BỊ</p><h2 id="coffee-smart-title">Mô tả giao dịch bằng tiếng Việt</h2></div>
      <label class="coffee-field" for="coffee-smart-input">Nhập mô tả giao dịch</label>
      <div class="coffee-smart-entry__input"><input id="coffee-smart-input" type="text" autocomplete="off" placeholder="Grab đi làm 42k hôm qua" aria-describedby="coffee-smart-status"><button type="button" class="coffee-primary-button" data-smart-parse>Phân tích</button></div>
      <div class="coffee-smart-preview" data-smart-preview hidden></div>
      <p class="coffee-muted" id="coffee-smart-status" aria-live="polite">Phân tích theo quy tắc trên thiết bị. Chưa có dữ liệu nào được lưu.</p>
    </section>
    <div class="coffee-manual-toolbar">
      <button type="button" class="coffee-secondary-button" data-manual-add>${icon('plus', { size: 16 })} Thêm dòng</button>
      <button type="button" class="coffee-ghost-button" data-manual-clear>Xoá tất cả</button>
      <span class="coffee-manual-total" data-manual-total>Tổng cộng: <strong>0 đ</strong></span>
    </div>

    <div class="coffee-manual-quicktags" data-manual-quicktags>
      <span class="coffee-manual-quicktags__label">${icon('package', { size: 16 })} Gán nhanh danh mục cho tất cả dòng:</span>
      ${EXPENSE_CATEGORIES.map((category) => `<button type="button" class="coffee-tag" data-quick-category="${category.key}">${expenseCategoryIcon(category.key)} ${escapeHtml(category.label)}</button>`).join('')}
    </div>

    ${renderManualTable([{}])}

    <p class="coffee-manual-hint">Danh mục được gợi ý bằng quy tắc từ mô tả và lựa chọn đã xác nhận trước đó; không gửi dữ liệu tài chính ra ngoài. Cột <strong>Mùa</strong> tự động điền theo ngày giao dịch · Xuân (1–3) · Hạ (4–6) · Thu (7–9) · Đông (10–12). Cột <strong>Items</strong> cho phép nhập nhiều món, phân cách bằng dấu phẩy.</p>

    <div class="coffee-actions">
      <a class="coffee-secondary-button" href="#/coffee">❌ Huỷ</a>
      <button class="coffee-primary-button" type="submit">${icon('save', { size: 16 })} Lưu giao dịch</button>
    </div>
  </form>`;
}

export function renderSmartPreview(parsed) {
  const date = parsed.date || todayKey();
  const catalog = getExpenseCatalog();
  return `<div class="coffee-smart-preview__grid">
    <label class="coffee-field">Tên quán / mô tả<input name="smartStore" maxlength="160" value="${escapeHtml(parsed.store)}"></label>
    <label class="coffee-field">Số tiền (đ)<input name="smartAmount" inputmode="numeric" value="${escapeHtml(formatAmountInput(parsed.amount || ''))}"></label>
    <label class="coffee-field">Ngày<input name="smartDate" type="date" value="${escapeHtml(date)}"></label>
    <label class="coffee-field">Danh mục<select name="smartCategory">${EXPENSE_CATEGORIES.map((category) => `<option value="${category.key}"${parsed.category === category.key ? ' selected' : ''}>${escapeHtml(category.label)}</option>`).join('')}</select></label>
    <label class="coffee-field">Chi tiết danh mục<select name="smartCategoryDetail"><option value="">Chưa chọn chi tiết</option>${catalog.map((group) => `<optgroup label="${escapeHtml(group.icon || '')} ${escapeHtml(group.label)}" data-group-id="${escapeHtml(group.id)}">${group.children.map((child) => `<option value="${escapeHtml(child.id)}" data-report-key="${escapeHtml(group.reportKey)}">${escapeHtml(child.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
  </div><p class="coffee-smart-preview__reason">${escapeHtml(parsed.reasons.join(' '))}${parsed.recurrence ? ' Nhận diện chu kỳ hàng tháng (chưa tự tạo giao dịch định kỳ).' : ''}</p>
  <div class="coffee-smart-preview__actions"><button type="button" class="coffee-primary-button" data-smart-confirm>Đưa vào bảng để kiểm tra</button><button type="button" class="coffee-secondary-button" data-smart-dismiss>Đóng</button></div>`;
}

export function analyzeSmartExpense(text, options = {}) {
  return parseSmartExpense(text, { ...options, learning: options.learning || getMerchantLearning(options.storage) });
}

// Read the table back into an array of rows, skipping completely blank lines.
// `amount` is a number (via toNumber) so the formatted "100.200" parses right.
export function readManualRows(form) {
  return [...form.querySelectorAll('[data-manual-row]')].map((row) => {
    const date = row.querySelector('[name="date"]')?.value || '';
    const itemsText = (row.querySelector('[name="items"]')?.value || '').trim();
    const brand = (row.querySelector('[name="brand"]')?.value || '').trim();
    const subtotal = toNumber(row.querySelector('[name="subtotal"]')?.value);
    const discount = maxZero(toNumber(row.querySelector('[name="discount"]')?.value));
    const quantity = Math.max(1, Math.round(toNumber(row.querySelector('[name="quantity"]')?.value) || 1));
    const categoryRaw = normalizeExpenseCategory(row.querySelector('[name="category"]')?.value);
    return {
      brand,
      itemsText,
      itemNames: parseItemNames(itemsText),
      quantity,
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
      date,
      season: seasonOf(date)?.key || '',
      expenseCategory: categoryRaw || classifyExpense(brand, itemsText),
      expenseCategoryRaw: categoryRaw,
      categoryDetailId: row.dataset?.categoryDetailId || '',
      categoryGroupId: row.dataset?.categoryGroupId || '',
    };
  }).filter((row) => row.brand || row.itemsText || row.subtotal || row.discount || row.date !== todayKey());
}

function maxZero(value) {
  return value > 0 ? value : 0;
}

export { seasonOf, seasonLabel, classifyItem };
