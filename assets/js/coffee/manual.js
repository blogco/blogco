// "Nhập chi phí thủ công" (Manual expense input) — a spreadsheet-style table
// form mounted at #/coffee/manual-add. Each row becomes one coffee receipt in
// local storage, so the data shows up on the statistics page (#/coffee/stats).
//
// Columns: Brand · Amount · Date of transaction · Seasons (auto, read-only).
// The router (main.js) owns the DOM events; everything here is rendering plus a
// few small pure helpers that are unit-tested.

import { escapeHtml, toNumber } from './store.js';
import { seasonOf, seasonLabel } from './season.js';

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

export function renderManualRow(row = {}, index = 0) {
  const date = row.date || todayKey();
  const amount = row.amount === undefined || row.amount === null || row.amount === ''
    ? ''
    : formatAmountInput(row.amount);
  const season = seasonOf(date);
  return `<tr class="coffee-manual-row" data-manual-row>
    <td class="coffee-manual-cell--index"><span data-row-index>${index + 1}</span></td>
    <td>
      <input class="coffee-manual-input" name="brand" type="text" list="coffee-brand-suggest" maxlength="160" autocomplete="off" value="${escapeHtml(row.brand ?? '')}" placeholder="Highlands Coffee" aria-label="Brand (thương hiệu) dòng ${index + 1}">
    </td>
    <td class="coffee-manual-cell--amount">
      <input class="coffee-manual-input coffee-manual-input--amount" name="amount" type="text" inputmode="numeric" autocomplete="off" value="${escapeHtml(amount)}" placeholder="100.200" aria-label="Số tiền dòng ${index + 1}">
      <span class="coffee-manual-currency" aria-hidden="true">đ</span>
    </td>
    <td>
      <input class="coffee-manual-input coffee-manual-input--date" name="date" type="date" value="${escapeHtml(date)}" aria-label="Ngày giao dịch dòng ${index + 1}">
    </td>
    <td class="coffee-manual-cell--season">
      <span class="coffee-season-chip${season ? '' : ' is-empty'}" data-season-cell title="Tự động theo ngày giao dịch">${season ? `${season.emoji} ${escapeHtml(season.label)}` : '—'}</span>
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
          <th class="coffee-manual-cell--index" scope="col">#</th>
          <th scope="col">Brand <span class="coffee-manual-th-sub">Thương hiệu</span></th>
          <th class="coffee-manual-cell--amount" scope="col">Amount <span class="coffee-manual-th-sub">Số tiền (đ)</span></th>
          <th scope="col">Date of transaction <span class="coffee-manual-th-sub">Ngày giao dịch</span></th>
          <th class="coffee-manual-cell--season" scope="col">Seasons <span class="coffee-manual-th-sub">Mùa (tự động)</span></th>
          <th class="coffee-manual-cell--action" scope="col"><span class="coffee-visually-hidden">Thao tác</span></th>
        </tr>
      </thead>
      <tbody data-manual-body>
        ${list.map((row, index) => renderManualRow(row, index)).join('')}
      </tbody>
    </table>
  </div>
  <datalist id="coffee-brand-suggest">${brandOptions()}</datalist>`;
}

export function renderManualForm() {
  return `<form id="coffee-manual-form" class="coffee-card coffee-manual" novalidate>
    <div class="coffee-manual-toolbar">
      <button type="button" class="coffee-secondary-button" data-manual-add>＋ Thêm hàng</button>
      <button type="button" class="coffee-ghost-button" data-manual-clear>Xoá tất cả</button>
      <span class="coffee-manual-total" data-manual-total>Tổng: <strong>0 đ</strong></span>
    </div>

    ${renderManualTable([{}])}

    <p class="coffee-manual-hint">Cột <strong>Seasons</strong> được khoá và tự động điền theo ngày giao dịch · Xuân (1–3) · Hạ (4–6) · Thu (7–9) · Đông (10–12).</p>

    <div class="coffee-actions">
      <a class="coffee-secondary-button" href="#/coffee">❌ Huỷ</a>
      <button class="coffee-primary-button" type="submit">💾 Lưu giao dịch</button>
    </div>
  </form>`;
}

// Read the table back into an array of { brand, amount, date, season } rows,
// skipping completely blank lines. `amount` is a number (via toNumber) so the
// formatted "100.200" input parses correctly.
export function readManualRows(form) {
  return [...form.querySelectorAll('[data-manual-row]')].map((row) => {
    const date = row.querySelector('[name="date"]')?.value || '';
    return {
      brand: (row.querySelector('[name="brand"]')?.value || '').trim(),
      amount: toNumber(row.querySelector('[name="amount"]')?.value),
      date,
      season: seasonOf(date)?.key || '',
    };
  }).filter((row) => row.brand || row.amount || row.date !== todayKey());
}

export { seasonOf, seasonLabel };
