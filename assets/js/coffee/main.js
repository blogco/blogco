// Router + view layer for the "Chi phí cà phê" (coffee spending) feature.
//
// Routes (hash based, mounted on the home page and dedicated pages):
//   #/coffee            → danh sách + tìm kiếm + export/import
//   #/coffee/add        → nhập chi phí thủ công (Manual expense input)
//   #/coffee/manual-add → alias của #/coffee/add
//   #/coffee/edit/:id   → sửa giao dịch
//   #/coffee/detail/:id → xem chi tiết
//   #/coffee/stats      → thống kê chi phí đi cà phê

import {
  getCoffeeState, getReceiptById, saveReceipt, removeReceipt, saveCoffeeProfile,
  exportReceipts, importReceipts, readJsonFile, downloadCsv, clearCoffeeData,
  escapeHtml, formatVnd, toNumber, PAYMENT_LABELS,
} from './store.js';
import { categoryLabel } from './menu.js';
import {
  EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORIES, buildExpenseReview, classifyExpense,
  expenseCategoryMeta, expenseCategoryIcon, normalizeExpenseCategory, receiptExpenseCategory,
} from './expense.js';
import { icon } from '../icons.js';
import { seasonIcon } from './season.js';
import { renderReceiptForm, renderItemRow, readReceiptForm } from './form.js';
import { computeCoffeeStats, computeBudgetProgress } from './stats.js';
import {
  renderManualForm, renderManualRow, renderSmartPreview, readManualRows, formatAmountInput, seasonOf, rowToItems,
} from './manual.js';
import { renderAiInsights } from './insights.js';
import { renderFinancialDashboard } from './financial-dashboard.js';
import { analyzeSmartExpense } from './manual.js';
import { getMerchantLearning, learnMerchantCategory, detectReceiptDuplicate } from './smart-entry.js';

const mountedRoots = new WeakSet();
const PAGE_SIZE = 6;
let pendingToast = '';

// Default ("Tất cả") filter state. Every time the list screen mounts we reset
// back to this so a stale filter left over from a previous visit can never hide
// the saved transactions (which showed up as "0/0 · Không tìm thấy hoá đơn").
const DEFAULT_SEARCH_STATE = { query: '', month: '', store: '', category: '', page: 1 };
let searchState = { ...DEFAULT_SEARCH_STATE };

function resetSearchState() {
  searchState = { ...DEFAULT_SEARCH_STATE };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(dateKey, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return '—';
  return new Intl.DateTimeFormat('vi-VN', options).format(new Date(`${dateKey}T12:00:00`));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toastMarkup() {
  return '<div class="coffee-toast" data-coffee-toast role="status" aria-live="polite" aria-atomic="true"></div>';
}

function showToast(root, text, isError = false) {
  const toast = root.querySelector('[data-coffee-toast]');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('is-visible'), 4200);
}

function pageHeader(title, description, back = '/coffee', hero = false) {
  return `<div class="coffee-page-heading${hero ? ' coffee-page-heading--hero' : ''}">
    <a class="coffee-back" href="#${back}" aria-label="Quay lại">← Quay lại</a>
    <p class="coffee-eyebrow">BLOGCO · EXPENSE MANAGEMENT</p>
    <h1 tabindex="-1">${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Filtering / search
// ---------------------------------------------------------------------------

function sortReceipts(receipts) {
  return [...receipts].sort((a, b) => {
    const date = String(b.date || '').localeCompare(String(a.date || ''));
    if (date !== 0) return date;
    return String(b.time || '').localeCompare(String(a.time || ''));
  });
}

export function filterReceipts(receipts, { query = '', month = '', store = '', category = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return sortReceipts(receipts).filter((receipt) => {
    if (month && !String(receipt.date || '').startsWith(month)) return false;
    if (store && receipt.store !== store) return false;
    if (category && receiptExpenseCategory(receipt) !== category) return false;
    if (!needle) return true;
    const haystack = [
      receipt.store, receipt.address, receipt.orderCode, receipt.note,
      EXPENSE_CATEGORY_LABELS[receiptExpenseCategory(receipt)],
      PAYMENT_LABELS[receipt.paymentMethod],
      (receipt.items || []).map((item) => `${item.name} ${categoryLabel(item.category)}`).join(' '),
    ].join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

function filterOptions(receipts) {
  const months = new Set();
  const stores = new Set();
  const categories = new Set();
  receipts.forEach((receipt) => {
    const month = String(receipt.date || '').slice(0, 7);
    if (month) months.add(month);
    if (receipt.store) stores.add(receipt.store);
    categories.add(receiptExpenseCategory(receipt));
  });
  return {
    months: [...months].sort().reverse(),
    stores: [...stores].sort((a, b) => a.localeCompare(b, 'vi')),
    categories: EXPENSE_CATEGORIES.filter((category) => categories.has(category.key)),
  };
}

function monthOptionLabel(key) {
  const [year, month] = key.split('-');
  return `Tháng ${Number(month)}/${year}`;
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function itemSummary(receipt) {
  const items = receipt.items || [];
  if (!items.length) return 'Không có chi tiết món';
  const names = items.map((item) => `${item.qty > 1 ? `${item.qty}× ` : ''}${item.name}`).join(', ');
  return names.length > 90 ? `${names.slice(0, 90)}…` : names;
}

function renderReceiptRow(receipt) {
  const id = escapeHtml(receipt.id);
  const items = receipt.items || [];
  const qty = items.reduce((sum, item) => sum + Math.max(1, Math.round(toNumber(item.qty) || 1)), 0);
  const discount = Math.round(toNumber(receipt.discount) || 0);
  const meta = expenseCategoryMeta(receiptExpenseCategory(receipt));
  return `<tr>
    <td><span class="coffee-datatable__date">${escapeHtml(formatDate(receipt.date))}</span>${receipt.time ? `<span class="coffee-datatable__time">${escapeHtml(receipt.time)}</span>` : ''}</td>
    <td><span class="coffee-datatable__store">${escapeHtml(receipt.store || 'Không rõ quán')}</span><span class="coffee-cat-chip">${expenseCategoryIcon(meta.key)} ${escapeHtml(meta.label)}</span>${receipt.orderCode ? `<span class="coffee-code">${escapeHtml(receipt.orderCode)}</span>` : ''}</td>
    <td><span class="coffee-datatable__items">${escapeHtml(itemSummary(receipt))}</span></td>
    <td class="coffee-num">${qty}</td>
    <td class="coffee-num">${escapeHtml(formatVnd(receipt.subtotal))}</td>
    <td class="coffee-num">${discount ? `− ${escapeHtml(formatVnd(discount))}` : '<span class="coffee-muted">—</span>'}</td>
    <td class="coffee-num coffee-datatable__total">${escapeHtml(formatVnd(receipt.total))}</td>
    <td>
      <div class="coffee-row-actions">
        <a class="coffee-ghost-button" href="#/coffee/detail/${id}">Chi tiết</a>
        <a class="coffee-ghost-button" href="#/coffee/edit/${id}">Sửa</a>
        <button type="button" class="coffee-ghost-button coffee-ghost-button--danger" data-delete-receipt="${id}" aria-label="Xoá hoá đơn ${id}">Xoá</button>
      </div>
    </td>
  </tr>`;
}

function renderRecordCard(receipt) {
  const id = escapeHtml(receipt.id);
  const items = receipt.items || [];
  const discount = Math.round(toNumber(receipt.discount) || 0);
  const meta = expenseCategoryMeta(receiptExpenseCategory(receipt));
  return `<li class="coffee-record-card">
    <div class="coffee-record-card__top">
      <span class="coffee-record-card__store">${escapeHtml(receipt.store || 'Không rõ quán')}</span>
      <strong class="coffee-record-card__total">${escapeHtml(formatVnd(receipt.total))}</strong>
    </div>
    <p class="coffee-record-card__meta"><span class="coffee-cat-chip">${expenseCategoryIcon(meta.key)} ${escapeHtml(meta.label)}</span></p>
    <p class="coffee-record-card__meta">${icon('calendar', { size: 16 })} ${escapeHtml(formatDate(receipt.date))}${receipt.time ? ` · ${escapeHtml(receipt.time)}` : ''} · ${items.length} món${receipt.paymentMethod ? ` · ${escapeHtml(PAYMENT_LABELS[receipt.paymentMethod])}` : ''}${receipt.orderCode ? ` · ${escapeHtml(receipt.orderCode)}` : ''}</p>
    <p class="coffee-record-card__meta">${escapeHtml(itemSummary(receipt))}</p>
    ${discount ? `<p class="coffee-record-card__meta">Thành tiền ${escapeHtml(formatVnd(receipt.subtotal))} · Giảm giá −${escapeHtml(formatVnd(discount))} · Thanh toán ${escapeHtml(formatVnd(receipt.total))}</p>` : ''}
    <div class="coffee-record-card__actions">
      <a class="coffee-ghost-button" href="#/coffee/detail/${id}">Chi tiết</a>
      <a class="coffee-ghost-button" href="#/coffee/edit/${id}">Sửa</a>
      <button type="button" class="coffee-ghost-button coffee-ghost-button--danger" data-delete-receipt="${id}" aria-label="Xoá hoá đơn ${id}">Xoá</button>
    </div>
  </li>`;
}

function renderHistoryResults(state) {
  const all = state.allReceipts;
  const current = { ...searchState, page: Number(searchState.page) || 1 };
  const filtered = filterReceipts(all, current);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(current.page, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  let list;
  if (!all.length) {
    list = '<p class="coffee-empty">Chưa có giao dịch nào. Bấm “Nhập chi phí thủ công” để bắt đầu ghi nhận chi phí đi cà phê.</p>';
  } else if (!filtered.length) {
    list = '<p class="coffee-empty">Không tìm thấy hoá đơn phù hợp với bộ lọc.</p>';
  } else {
    list = `<div class="coffee-datatable-wrap">
      <table class="coffee-datatable">
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            <th scope="col">Quán</th>
            <th scope="col">Items (Tên món)</th>
            <th scope="col" class="coffee-num">Số món</th>
            <th scope="col" class="coffee-num">Thành tiền</th>
            <th scope="col" class="coffee-num">Giảm giá</th>
            <th scope="col" class="coffee-num">Thanh toán</th>
            <th scope="col">Thao tác</th>
          </tr>
        </thead>
        <tbody>${rows.map(renderReceiptRow).join('')}</tbody>
      </table>
    </div>
    <ul class="coffee-record-cards">${rows.map(renderRecordCard).join('')}</ul>`;
  }

  const pager = totalPages > 1 ? `<nav class="coffee-pagination" aria-label="Phân trang hoá đơn">
    <button type="button" class="coffee-ghost-button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Trước</button>
    ${Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => `<button type="button" class="coffee-page-button${number === page ? ' is-active' : ''}" data-page="${number}" ${number === page ? 'aria-current="page"' : ''}>${number}</button>`).join('')}
    <button type="button" class="coffee-ghost-button" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Sau →</button>
  </nav>` : '';

  return `<div data-history-results>
    ${list}
    <p class="coffee-muted" data-history-count>Hiển thị ${rows.length} / ${filtered.length} hoá đơn${all.length !== filtered.length ? ` (tổng ${all.length})` : ''}.</p>
    ${pager}
  </div>`;
}

// ---------------------------------------------------------------------------
// Budget overview (month / quarter / year) + settings modal
// ---------------------------------------------------------------------------

const BUDGET_STATUS_NOTE = {
  none: 'Chưa đặt hạn mức cho kỳ này.',
  success: 'Trong tầm kiểm soát',
  warning: 'Sắp chạm hạn mức',
  danger: 'Đã vượt hạn mức',
};

const BUDGET_STATUS_LABEL = {
  none: 'Chưa đặt hạn mức',
  success: 'Trong tầm kiểm soát',
  warning: 'Sắp chạm hạn mức',
  danger: 'Đã vượt hạn mức',
};

function budgetCardMarkup(entry) {
  const hasBudget = entry.budget > 0;
  const status = entry.status;
  const note = !hasBudget
    ? 'Chưa đặt hạn mức cho kỳ này.'
    : entry.over > 0
      ? `Vượt ${escapeHtml(formatVnd(entry.over))} · ${BUDGET_STATUS_LABEL[status] || ''}`
      : `Còn lại ${escapeHtml(formatVnd(entry.remaining))} · ${BUDGET_STATUS_LABEL[status] || ''}`;
  return `<article class="coffee-budget-tile is-${status}">
    <div class="coffee-budget-tile__head">
      <span class="coffee-eyebrow">${escapeHtml(entry.label)}</span>
      ${hasBudget ? `<span class="coffee-chip is-${status}">${entry.pct}%</span>` : '<span class="coffee-chip">chưa đặt</span>'}
    </div>
    <h3 class="coffee-budget-tile__value">${escapeHtml(formatVnd(entry.spent))} <span class="coffee-muted">/ ${hasBudget ? escapeHtml(formatVnd(entry.budget)) : '—'}</span></h3>
    <div class="coffee-budget-bar" role="progressbar" aria-label="${escapeHtml(entry.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${entry.barWidth}"><span class="is-${status}" style="width:${entry.barWidth}%"></span></div>
    <p class="coffee-budget-tile__note">${note}</p>
  </article>`;
}

function budgetOverviewMarkup(progress) {
  return `<section class="coffee-card coffee-budget-overview" aria-label="Tiến độ ngân sách">
    <div class="coffee-card-heading">
      <div><p class="coffee-eyebrow">NGÂN SÁCH &amp; HẠN MỨC</p><h2>Theo dõi chi tiêu so với hạn mức</h2></div>
      <button type="button" class="coffee-secondary-button" data-budget-settings>${icon('wallet', { size: 16 })} Thiết lập Ngân sách</button>
    </div>
    <div class="coffee-budget-grid">
      ${budgetCardMarkup(progress.month)}
      ${budgetCardMarkup(progress.quarter)}
      ${budgetCardMarkup(progress.year)}
    </div>
  </section>`;
}

function budgetModalMarkup(profile = {}) {
  const value = (key) => escapeHtml(profile[key] || 0);
  return `<div class="coffee-review-overlay" data-budget-modal>
    <div class="coffee-review-modal" role="dialog" aria-modal="true" aria-labelledby="coffee-budget-title">
      <div class="coffee-review-modal__head">
        <span id="coffee-budget-title">${icon('wallet', { size: 17 })} Thiết lập ngân sách</span>
        <button type="button" class="coffee-ghost-button" data-budget-modal-close>${icon('x', { size: 16 })} Đóng</button>
      </div>
      <div class="coffee-review-modal__body">
        <p class="coffee-muted">Nhập hạn mức chi tiêu cho tháng, quý và năm. Để trống hoặc 0 nghĩa là không đặt hạn mức. Dữ liệu chỉ lưu trên thiết bị này.</p>
        <form id="coffee-budget-form" class="coffee-budget-form coffee-budget-form--modal">
          <label class="coffee-field">Ngân sách Tháng (VNĐ)
            <input name="monthlyBudget" type="number" min="0" step="10000" value="${value('monthlyBudget')}" inputmode="numeric">
          </label>
          <label class="coffee-field">Ngân sách Quý (VNĐ)
            <input name="quarterlyBudget" type="number" min="0" step="10000" value="${value('quarterlyBudget')}" inputmode="numeric">
          </label>
          <label class="coffee-field">Ngân sách Năm (VNĐ)
            <input name="yearlyBudget" type="number" min="0" step="10000" value="${value('yearlyBudget')}" inputmode="numeric">
          </label>
          <div class="coffee-budget-form__actions">
            <button class="coffee-primary-button" type="submit">Lưu ngân sách</button>
            <button type="button" class="coffee-secondary-button" data-budget-modal-close>Huỷ</button>
          </div>
        </form>
      </div>
    </div>
  </div>`;
}

function openBudgetModal(root) {
  root.querySelector('[data-budget-modal]')?.remove();
  root.insertAdjacentHTML('beforeend', budgetModalMarkup(getCoffeeState().profile || {}));
  root.querySelector('#coffee-budget-form input[name="monthlyBudget"]')?.focus();
}

function renderHistory(root) {
  // Entering the list always starts from the "Tất cả" filters and renders the
  // full saved list immediately, so users never land on an empty filtered view.
  resetSearchState();
  const state = getCoffeeState();
  const stats = computeCoffeeStats(state.receipts, { budget: state.profile.monthlyBudget });
  const { months, stores, categories } = filterOptions(state.receipts);
  const budgetProgress = computeBudgetProgress(state.receipts, state.profile);

  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    <div class="coffee-page-heading coffee-page-heading--hero">
      <p class="coffee-eyebrow">BLOGCO · EXPENSE MANAGEMENT</p>
      <h1 id="coffee-title" tabindex="-1">Quản lý chi phí cà phê</h1>
      <p>Ghi nhận và kiểm soát chi tiêu cà phê theo từng giao dịch. Dữ liệu được lưu cục bộ trên thiết bị này.</p>
    </div>

    <div class="coffee-toolbar">
      <a class="coffee-primary-button" href="#/coffee/add">${icon('plus', { size: 16 })} Nhập chi phí</a>
      <a class="coffee-secondary-button" href="#/coffee/stats">${icon('barChart', { size: 16 })} Thống kê chi phí</a>
      <button type="button" class="coffee-secondary-button" data-budget-settings>${icon('wallet', { size: 16 })} Thiết lập Ngân sách</button>
      <button type="button" class="coffee-secondary-button" data-export>${icon('arrowDown', { size: 16 })} Export JSON</button>
      <button type="button" class="coffee-secondary-button" data-import-trigger>${icon('upload', { size: 16 })} Import</button>
      <button type="button" class="coffee-secondary-button" data-export-csv>${icon('arrowDown', { size: 16 })} CSV</button>
      <button type="button" class="coffee-secondary-button coffee-clear-all" data-clear-all>${icon('trash', { size: 16 })} Xóa toàn bộ dữ liệu / Reset</button>
      <input type="file" accept="application/json,.json" data-import-input hidden aria-label="Chọn file JSON để nhập">
    </div>

    <div class="coffee-summary-grid" aria-label="Chỉ số chi phí">
      <div class="coffee-summary-card"><span>Chi tháng này</span><strong>${escapeHtml(formatVnd(stats.currentMonthTotal))}</strong></div>
      <div class="coffee-summary-card"><span>Ngân sách tháng</span><strong>${budgetProgress.month.budget ? escapeHtml(formatVnd(budgetProgress.month.budget)) : '—'}</strong></div>
      <div class="coffee-summary-card"><span>Giao dịch</span><strong>${stats.count}</strong></div>
      <div class="coffee-summary-card"><span>Trung bình / lần</span><strong>${escapeHtml(formatVnd(stats.averageSpend))}</strong></div>
    </div>

    ${budgetOverviewMarkup(budgetProgress)}

    <div class="coffee-card coffee-search">
      <label class="coffee-field coffee-field--full">
        <span class="coffee-search__label">${icon('search', { size: 16 })} Tìm kiếm</span>
        <input type="search" data-search-input value="${escapeHtml(searchState.query)}" placeholder="Tên quán / mã hoá đơn / tên món / ghi chú...">
      </label>
      <div class="coffee-search__filters">
        <label class="coffee-field">Tháng
          <select data-filter-month>
            <option value="">Tất cả</option>
            ${months.map((month) => `<option value="${escapeHtml(month)}"${searchState.month === month ? ' selected' : ''}>${escapeHtml(monthOptionLabel(month))}</option>`).join('')}
          </select>
        </label>
        <label class="coffee-field">Quán
          <select data-filter-store>
            <option value="">Tất cả</option>
            ${stores.map((store) => `<option value="${escapeHtml(store)}"${searchState.store === store ? ' selected' : ''}>${escapeHtml(store)}</option>`).join('')}
          </select>
        </label>
        <label class="coffee-field">Danh mục chi phí
          <select data-filter-category>
            <option value="">Tất cả</option>
            ${categories.map((category) => `<option value="${category.key}"${searchState.category === category.key ? ' selected' : ''}>${escapeHtml(category.label)}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <section class="coffee-card" aria-label="Danh sách chi phí">
      <div class="coffee-card-heading">
        <h2>Danh sách chi phí</h2>
        <span class="coffee-chip">${state.receipts.length} giao dịch</span>
      </div>
      ${renderHistoryResults({ allReceipts: state.receipts })}
    </section>
    <p class="coffee-disclaimer">Công cụ ghi chép cá nhân giúp bạn theo dõi chi tiêu cà phê. Số liệu do bạn nhập tay — hãy kiểm tra lại trước khi tin dùng.</p>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function renderDetail(root, id) {
  const receipt = getReceiptById(id);
  if (!receipt) {
    root.innerHTML = `<section class="coffee-screen">${pageHeader('Không tìm thấy', 'Hoá đơn này không tồn tại trên thiết bị.')}</section>${toastMarkup()}`;
    return;
  }
  const items = receipt.items || [];
  const itemRows = items.length ? items.map((item) => `<tr>
    <td>${escapeHtml(item.name)}</td>
    <td class="coffee-num">${item.qty}</td>
    <td class="coffee-num">${escapeHtml(formatVnd(item.unitPrice))}</td>
    <td class="coffee-num"><strong>${escapeHtml(formatVnd(item.amount))}</strong></td>
    <td><span class="coffee-chip">${escapeHtml(categoryLabel(item.category))}</span></td>
  </tr>`).join('') : '<tr><td colspan="5" class="coffee-muted">Không có chi tiết món.</td></tr>';

  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    <div class="coffee-page-heading">
      <a class="coffee-back" href="#/coffee" aria-label="Quay lại danh sách">← Danh sách</a>
      <p class="coffee-eyebrow">HOÁ ĐƠN · ${escapeHtml(formatDate(receipt.date))}</p>
      <h1 id="coffee-title" tabindex="-1">${escapeHtml(receipt.store || 'Hoá đơn cà phê')}</h1>
      <p>${escapeHtml(receipt.address || '')}</p>
    </div>

    <section class="coffee-card">
      <dl class="coffee-detail-list">
        <div><dt>Ngày giờ</dt><dd>${escapeHtml(formatDate(receipt.date))}${receipt.time ? ` · ${escapeHtml(receipt.time)}` : ''}</dd></div>
        <div><dt>Mã hoá đơn</dt><dd>${escapeHtml(receipt.orderCode || '—')}</dd></div>
        <div><dt>Thanh toán</dt><dd>${escapeHtml(PAYMENT_LABELS[receipt.paymentMethod] || '—')}</dd></div>
      </dl>

      <h2 class="coffee-section-title">Món đã gọi</h2>
      <div class="coffee-table-wrap">
        <table class="coffee-table">
          <thead><tr><th>Món</th><th class="coffee-num">SL</th><th class="coffee-num">Đơn giá</th><th class="coffee-num">Thành tiền</th><th>Nhóm</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      <h2 class="coffee-section-title">Chi phí</h2>
      <dl class="coffee-detail-list coffee-detail-list--cost">
        <div><dt>Tổng tiền hàng</dt><dd>${escapeHtml(formatVnd(receipt.subtotal))}</dd></div>
        <div><dt>Giảm giá</dt><dd>− ${escapeHtml(formatVnd(receipt.discount))}</dd></div>
        <div><dt>VAT / thuế</dt><dd>+ ${escapeHtml(formatVnd(receipt.vat))}</dd></div>
        <div><dt>Tổng thanh toán</dt><dd><strong>${escapeHtml(formatVnd(receipt.total))}</strong></dd></div>
      </dl>

      ${receipt.note ? `<h2 class="coffee-section-title">Ghi chú</h2><p>${escapeHtml(receipt.note)}</p>` : ''}
    </section>

    <div class="coffee-actions">
      <a class="coffee-secondary-button" href="#/coffee">← Danh sách</a>
      <a class="coffee-primary-button" href="#/coffee/edit/${escapeHtml(receipt.id)}">Sửa</a>
      <button type="button" class="coffee-secondary-button" data-print>🖨 In</button>
      <button type="button" class="coffee-ghost-button coffee-ghost-button--danger" data-delete-receipt="${escapeHtml(receipt.id)}">Xoá</button>
    </div>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Stats view
// ---------------------------------------------------------------------------

let financialFilters = { period: 'month', from: '', to: '', category: '' };

function renderStats(root) {
  const state = getCoffeeState();
  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    ${pageHeader('Báo cáo tài chính', 'Phân tích thu nhập, chi tiêu và xu hướng tài chính cá nhân.', '/coffee', true)}
    ${renderFinancialDashboard(state.receipts, financialFilters)}

    <div class="coffee-actions"><a class="coffee-secondary-button" href="#/coffee">${icon('arrowLeft', { size: 16 })} Danh sách</a>
      <a class="coffee-primary-button" href="#/coffee/manual-add">${icon('plus', { size: 16 })} Thêm giao dịch</a></div>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Add / edit form view
// ---------------------------------------------------------------------------

function renderFormPage(root, receiptId = '') {
  const receipt = receiptId ? getReceiptById(receiptId) : null;
  if (receiptId && !receipt) {
    root.innerHTML = `<section class="coffee-screen">${pageHeader('Không tìm thấy', 'Giao dịch cần sửa không tồn tại.')}</section>${toastMarkup()}`;
    return;
  }
  const mode = receiptId ? 'edit' : 'add';
  const nextId = mode === 'edit' ? receiptId : 'cf-...';
  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    ${pageHeader(mode === 'edit' ? 'Sửa giao dịch cà phê' : 'Thêm giao dịch cà phê', mode === 'edit' ? `Cập nhật thông tin cho ${nextId}.` : 'Nhập thông tin giao dịch cà phê.')}
    ${renderReceiptForm(receipt || {}, { mode })}
  </section>${toastMarkup()}`;
  const form = root.querySelector('#coffee-receipt-form');
  if (form) {
    updateItemEmpty(form);
    updateCostDisplays(form);
  }
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Form live behaviour
// ---------------------------------------------------------------------------

function updateItemEmpty(form) {
  const empty = form.querySelector('[data-item-empty]');
  if (!empty) return;
  const hasRow = Boolean(form.querySelector('[data-item-row]'));
  empty.hidden = hasRow;
}

function collectItemsTotal(form) {
  let total = 0;
  form.querySelectorAll('[data-item-row]').forEach((row) => {
    const qty = Math.max(1, Math.round(toNumber(row.querySelector('[name="itemQty"]')?.value) || 1));
    const unit = toNumber(row.querySelector('[name="itemUnitPrice"]')?.value);
    let amount = toNumber(row.querySelector('[name="itemAmount"]')?.value);
    if (!amount && unit) amount = unit * qty;
    total += amount;
  });
  return total;
}

function updateCostDisplays(form) {
  const subtotal = collectItemsTotal(form);
  const discount = Math.max(0, toNumber(form.querySelector('[name="discount"]')?.value));
  const vat = Math.max(0, toNumber(form.querySelector('[name="vat"]')?.value));
  const total = Math.max(0, subtotal - discount + vat);
  const subtotalDisplay = form.querySelector('[data-subtotal-display]');
  const subtotalInput = form.querySelector('[name="subtotalValue"]');
  const totalDisplay = form.querySelector('[data-total-display]');
  const totalInput = form.querySelector('[name="totalValue"]');
  if (subtotalDisplay) subtotalDisplay.value = subtotal.toLocaleString('vi-VN');
  if (subtotalInput) subtotalInput.value = subtotal;
  if (totalDisplay) totalDisplay.value = `${total.toLocaleString('vi-VN')} đ`;
  if (totalInput) totalInput.value = total;
}

function appendItem(form, item = {}) {
  const list = form.querySelector('[data-item-list]');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', renderItemRow(item, list.querySelectorAll('[data-item-row]').length));
  updateItemEmpty(form);
  updateCostDisplays(form);
}

// ---------------------------------------------------------------------------
// Manual expense input (#/coffee/add, #/coffee/manual-add)
// ---------------------------------------------------------------------------

function reindexManualRows(form) {
  form.querySelectorAll('[data-manual-row]').forEach((row, index) => {
    const cell = row.querySelector('[data-row-index]');
    if (cell) cell.textContent = index + 1;
    row.querySelector('[data-manual-remove]')?.setAttribute('aria-label', `Xoá dòng ${index + 1}`);
  });
}

function refreshManualSeason(row) {
  const cell = row.querySelector('[data-season-cell]');
  if (!cell) return;
  const season = seasonOf(row.querySelector('[name="date"]')?.value || '');
  cell.innerHTML = season ? `${seasonIcon(season.key)} ${escapeHtml(season.label)}` : '—';
  cell.classList.toggle('is-empty', !season);
}

// Keep the auto-category badge in sync while the user types brand/items.
function refreshManualExpenseChip(row) {
  if (!row) return;
  const chip = row.querySelector('[data-expense-chip]');
  if (!chip) return;
  const explicit = normalizeExpenseCategory(row.querySelector('[name="category"]')?.value);
  const meta = expenseCategoryMeta(explicit || classifyExpense(
    row.querySelector('[name="brand"]')?.value || '',
    row.querySelector('[name="items"]')?.value || '',
  ));
  chip.innerHTML = `${expenseCategoryIcon(meta.key)} ${escapeHtml(meta.label)}`;
  chip.dataset.auto = explicit ? 'false' : 'true';
  chip.title = explicit ? 'Danh mục bạn chọn' : 'Danh mục AI tự phân loại';
}

function refreshManualRowTotal(row) {
  const cell = row?.querySelector('[data-manual-total-cell]');
  if (!cell) return;
  const subtotal = toNumber(row.querySelector('[name="subtotal"]')?.value);
  const discount = Math.max(0, toNumber(row.querySelector('[name="discount"]')?.value));
  cell.textContent = formatVnd(Math.max(0, subtotal - discount));
}

function updateManualTotal(form) {
  if (!form) return;
  const total = readManualRows(form).reduce((sum, row) => sum + row.total, 0);
  const value = form.querySelector('[data-manual-total] strong');
  if (value) value.textContent = formatVnd(total);
}

function renderManualPage(root) {
  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    ${pageHeader('Nhập chi phí cà phê', 'Nhập nhanh nhiều giao dịch theo dạng bảng tính. Cột Mùa được tự động điền theo ngày giao dịch.', '/coffee', true)}
    ${renderManualForm()}
  </section>${toastMarkup()}`;
  updateManualTotal(root.querySelector('#coffee-manual-form'));
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}

function appendManualRow(root, form) {
  const body = form.querySelector('[data-manual-body]');
  if (!body) return;
  const index = body.querySelectorAll('[data-manual-row]').length;
  body.insertAdjacentHTML('beforeend', renderManualRow({}, index));
  refreshManualSeason(body.querySelector('[data-manual-row]:last-of-type'));
  body.querySelector('[data-manual-row]:last-of-type [name="brand"]')?.focus();
}

function parseSmartInput(root) {
  const form = root.querySelector('#coffee-manual-form');
  const input = form?.querySelector('#coffee-smart-input');
  const preview = form?.querySelector('[data-smart-preview]');
  const status = form?.querySelector('#coffee-smart-status');
  if (!input || !preview) return;
  const parsed = analyzeSmartExpense(input.value, { learning: getMerchantLearning() });
  if (!input.value.trim()) { status.textContent = 'Hãy nhập mô tả giao dịch.'; return; }
  preview.innerHTML = renderSmartPreview(parsed);
  preview.hidden = false;
  status.textContent = parsed.needsCategory ? 'Gợi ý danh mục chưa chắc chắn; hãy chọn lại trước khi tiếp tục.' : 'Kiểm tra và chỉnh sửa các trường trước khi đưa vào bảng.';
}

function acceptSmartInput(root) {
  const form = root.querySelector('#coffee-manual-form');
  const preview = form?.querySelector('[data-smart-preview]');
  if (!preview || preview.hidden) return;
  const value = (name) => preview.querySelector(`[name="${name}"]`)?.value || '';
  const amount = toNumber(value('smartAmount'));
  const store = value('smartStore').trim();
  if (!amount || !store) { showToast(root, 'Hãy nhập tên giao dịch và số tiền lớn hơn 0.', true); return; }
  const detail = preview.querySelector('[name="smartCategoryDetail"] option:checked');
  const row = { brand: store, subtotal: amount, date: value('smartDate'), expenseCategory: value('smartCategory'), categoryDetailId: value('smartCategoryDetail'), categoryGroupId: detail?.parentElement?.dataset.groupId || '' };
  const empty = [...form.querySelectorAll('[data-manual-row]')].find((candidate) => !candidate.querySelector('[name="brand"]')?.value && !toNumber(candidate.querySelector('[name="subtotal"]')?.value));
  if (empty) {
    const index = [...form.querySelectorAll('[data-manual-row]')].indexOf(empty);
    empty.outerHTML = renderManualRow(row, index);
    const inserted = form.querySelectorAll('[data-manual-row]')[index];
    refreshManualSeason(inserted);
    refreshManualExpenseChip(inserted);
    refreshManualRowTotal(inserted);
  } else {
    appendManualRow(root, form);
    const inserted = form.querySelector('[data-manual-row]:last-of-type');
    inserted.querySelector('[name="brand"]').value = row.brand;
    inserted.querySelector('[name="subtotal"]').value = formatAmountInput(amount);
    inserted.querySelector('[name="date"]').value = row.date;
    inserted.querySelector('[name="category"]').value = row.expenseCategory;
    inserted.dataset.categoryDetailId = row.categoryDetailId;
    inserted.dataset.categoryGroupId = row.categoryGroupId;
    refreshManualSeason(inserted); refreshManualExpenseChip(inserted); refreshManualRowTotal(inserted);
  }
  updateManualTotal(form);
  preview.hidden = true;
  form.querySelector('#coffee-smart-status').textContent = 'Đã đưa vào bảng nháp. Chưa lưu; bạn có thể tiếp tục chỉnh sửa.';
}

// ---------------------------------------------------------------------------
// AI expense review (shown right after "Lưu giao dịch")
// ---------------------------------------------------------------------------

function expenseContext() {
  const state = getCoffeeState();
  const monthKey = new Date().toISOString().slice(0, 7);
  const byCategory = new Map();
  let monthTotal = 0;
  let totalSpend = 0;
  state.receipts.forEach((receipt) => {
    const total = toNumber(receipt.total);
    totalSpend += total;
    const key = receiptExpenseCategory(receipt);
    const entry = byCategory.get(key) || { total: 0, count: 0 };
    entry.total += total;
    entry.count += 1;
    byCategory.set(key, entry);
    if (String(receipt.date || '').startsWith(monthKey)) monthTotal += total;
  });
  return { monthTotal, budget: state.profile.monthlyBudget || 0, totalSpend, count: state.receipts.length, byCategory };
}

function renderExpenseReview(review) {
  const cards = review.advices.map((advice) => `<article class="coffee-review-cat is-${advice.tone}">
      <div class="coffee-review-cat__head">
        <span class="coffee-review-cat__emoji" aria-hidden="true">${expenseCategoryIcon(advice.category, 22)}</span>
        <div>
          <h3 class="coffee-review-cat__title">${escapeHtml(advice.headline)}</h3>
          <p class="coffee-review-cat__sub">${advice.count} giao dịch · ${escapeHtml(formatVnd(advice.total))}${advice.stores.length ? ` · ${escapeHtml(advice.stores.slice(0, 3).join(', '))}` : ''}</p>
        </div>
      </div>
      <p class="coffee-review-cat__message">${escapeHtml(advice.message)}</p>
      ${advice.notes.length ? `<ul class="coffee-review-notes">${advice.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}
      <p class="coffee-review-cat__tips-label">${icon('sparkles', { size: 16 })} Gợi ý cho bạn</p>
      <ul class="coffee-review-tips">${advice.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>
    </article>`).join('');

  return `<div class="coffee-review-overlay" data-expense-review-overlay>
    <div class="coffee-review-modal" role="dialog" aria-modal="true" aria-labelledby="coffee-review-title">
      <div class="coffee-review-modal__head">
        <span id="coffee-review-title">${icon('sparkles', { size: 17 })} Phân tích chi tiêu</span>
        <button type="button" class="coffee-ghost-button" data-expense-review-close>${icon('x', { size: 16 })} Đóng</button>
      </div>
      <div class="coffee-review-modal__body">
        <div class="coffee-review-hero">
          <div><span class="coffee-review-hero__label">Đã lưu</span><strong>${review.count} giao dịch</strong></div>
          <div><span class="coffee-review-hero__label">Tổng cộng</span><strong>${escapeHtml(formatVnd(review.total))}</strong></div>
        </div>
        <p class="coffee-muted">AI đã đọc từng khoản chi và phản hồi theo đúng loại chi phí bạn vừa nhập.</p>
        <div class="coffee-review-cats">${cards || '<p class="coffee-empty">Không có giao dịch nào để phân tích.</p>'}</div>
        <div class="coffee-review-actions">
          <a class="coffee-primary-button" href="#/coffee/stats" data-expense-review-stats>${icon('barChart', { size: 16 })} Xem thống kê</a>
          <a class="coffee-secondary-button" href="#/coffee" data-expense-review-list>${icon('receipt', { size: 16 })} Danh sách chi phí</a>
          <button type="button" class="coffee-ghost-button" data-expense-review-close>Đóng</button>
        </div>
      </div>
    </div>
  </div>`;
}

function showExpenseReview(root, records) {
  root.querySelector('[data-expense-review-overlay]')?.remove();
  const review = buildExpenseReview(records, expenseContext());
  root.insertAdjacentHTML('beforeend', renderExpenseReview(review));
  showToast(root, `Đã lưu ${review.count} giao dịch (${formatVnd(review.total)}). AI đã phân tích xong.`);
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function routeName(root) {
  if (location.hash.startsWith('#/coffee')) return location.hash.slice(1).replace(/\/$/, '') || '/coffee';
  const initial = root.dataset.initialRoute;
  const map = { list: '/coffee', dashboard: '/coffee', history: '/coffee', add: '/coffee/add', stats: '/coffee/stats', 'manual-add': '/coffee/manual-add' };
  return map[initial] || '/coffee';
}

function showRoute(root) {
  const route = routeName(root);
  const [, , action = '', param = ''] = route.split('/');
  const titles = { '': 'Chi phí đi cà phê', add: 'Nhập chi phí thủ công', edit: 'Sửa giao dịch cà phê', detail: 'Chi tiết giao dịch', stats: 'Thống kê chi phí cà phê', 'manual-add': 'Nhập chi phí thủ công' };
  document.title = `${titles[action] || titles['']} | BlogCo`;

  if (action === 'add' || action === 'manual-add') renderManualPage(root);
  else if (action === 'edit') renderFormPage(root, decodeURIComponent(param));
  else if (action === 'detail') renderDetail(root, decodeURIComponent(param));
  else if (action === 'stats') renderStats(root);
  else renderHistory(root);

  if (pendingToast) {
    const message = pendingToast;
    pendingToast = '';
    showToast(root, message);
  }
  const heading = root.querySelector('h1[tabindex="-1"], h1');
  heading?.focus?.({ preventScroll: true });
}

function refreshHistoryResults(root) {
  const container = root.querySelector('[data-history-results]');
  if (!container) return;
  container.outerHTML = renderHistoryResults({ allReceipts: getCoffeeState().receipts });
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountCoffeeApp(root) {
  if (!root) return;
  if (mountedRoots.has(root)) {
    showRoute(root);
    return;
  }
  mountedRoots.add(root);

  root.addEventListener('input', (event) => {
    const form = event.target.closest('#coffee-receipt-form');
    if (form && ['itemQty', 'itemUnitPrice', 'itemAmount', 'discount', 'vat'].includes(event.target.name)) updateCostDisplays(form);
    const manualForm = event.target.closest('#coffee-manual-form');
    if (manualForm && (event.target.name === 'subtotal' || event.target.name === 'discount')) {
      const formatted = formatAmountInput(event.target.value);
      if (formatted !== event.target.value) event.target.value = formatted;
      refreshManualRowTotal(event.target.closest('[data-manual-row]'));
      updateManualTotal(manualForm);
    }
    if (manualForm && (event.target.name === 'brand' || event.target.name === 'items')) {
      refreshManualExpenseChip(event.target.closest('[data-manual-row]'));
    }
    if (event.target.matches('[data-search-input]')) {
      searchState.query = event.target.value;
      searchState.page = 1;
      refreshHistoryResults(root);
    }
  });

  root.addEventListener('change', async (event) => {
    const target = event.target;
    const manualForm = target.closest('#coffee-manual-form');
    if (manualForm && target.name === 'date') {
      refreshManualSeason(target.closest('[data-manual-row]'));
      updateManualTotal(manualForm);
    }
    if (manualForm && (target.name === 'subtotal' || target.name === 'discount')) {
      target.value = formatAmountInput(target.value);
      refreshManualRowTotal(target.closest('[data-manual-row]'));
      updateManualTotal(manualForm);
    }
    if (manualForm && target.name === 'category') {
      refreshManualExpenseChip(target.closest('[data-manual-row]'));
    }
    if (target.matches('[data-fin-filter]')) {
      financialFilters = { ...financialFilters, [target.dataset.finFilter]: target.value };
      const dashboard = root.querySelector('[data-fin-dashboard]');
      if (dashboard) dashboard.outerHTML = renderFinancialDashboard(getCoffeeState().receipts, financialFilters);
    }
    if (target.matches('[data-essential-category]')) {
      try {
        const key = 'blogco.coffee.category-essential.v1';
        const config = JSON.parse(localStorage.getItem(key) || '{}');
        config[target.dataset.essentialCategory] = target.value;
        localStorage.setItem(key, JSON.stringify(config));
        const dashboard = root.querySelector('[data-fin-dashboard]');
        if (dashboard) dashboard.outerHTML = renderFinancialDashboard(getCoffeeState().receipts, financialFilters);
      } catch { showToast(root, 'Không thể lưu phân loại nhu cầu trên thiết bị.', true); }
    }
    if (target.matches('[data-filter-month]')) { searchState.month = target.value; searchState.page = 1; refreshHistoryResults(root); }
    if (target.matches('[data-filter-store]')) { searchState.store = target.value; searchState.page = 1; refreshHistoryResults(root); }
    if (target.matches('[data-filter-category]')) { searchState.category = target.value; searchState.page = 1; refreshHistoryResults(root); }
    if (target.matches('[data-import-input]')) {
      const file = target.files?.[0];
      if (!file) return;
      try {
        const payload = await readJsonFile(file);
        const result = importReceipts(payload);
        pendingToast = `Đã nhập ${result.added} hoá đơn mới, cập nhật ${result.updated}. Tổng ${result.total}.`;
        resetSearchState();
        showRoute(root);
      } catch (error) {
        showToast(root, error.message, true);
      } finally {
        target.value = '';
      }
    }
  });

  root.addEventListener('click', async (event) => {
    const target = event.target;

    if (target.closest('[data-fin-mode]')) {
      financialFilters = { ...financialFilters, mode: target.closest('[data-fin-mode]').dataset.finMode };
      const dashboard = root.querySelector('[data-fin-dashboard]');
      if (dashboard) dashboard.outerHTML = renderFinancialDashboard(getCoffeeState().receipts, financialFilters);
      return;
    }

    if (target.closest('[data-fin-reset]')) {
      financialFilters = { period: 'month', from: '', to: '', category: '' };
      const dashboard = root.querySelector('[data-fin-dashboard]');
      if (dashboard) dashboard.outerHTML = renderFinancialDashboard(getCoffeeState().receipts, financialFilters);
      return;
    }
    const financialCategory = target.closest('[data-fin-category]');
    if (financialCategory) {
      financialFilters = { ...financialFilters, category: financialCategory.dataset.finCategory };
      const dashboard = root.querySelector('[data-fin-dashboard]');
      if (dashboard) dashboard.outerHTML = renderFinancialDashboard(getCoffeeState().receipts, financialFilters);
      return;
    }

    if (target.closest('[data-smart-parse]')) { parseSmartInput(root); return; }
    if (target.closest('[data-smart-confirm]')) { acceptSmartInput(root); return; }
    if (target.closest('[data-smart-dismiss]')) { const preview = root.querySelector('[data-smart-preview]'); if (preview) preview.hidden = true; return; }

    if (target.closest('[data-expense-review-close]')) {
      root.querySelector('[data-expense-review-overlay]')?.remove();
      return;
    }
    if (target.matches('[data-expense-review-overlay]')) {
      target.remove();
      return;
    }
    if (target.closest('[data-expense-review-stats]') || target.closest('[data-expense-review-list]')) {
      root.querySelector('[data-expense-review-overlay]')?.remove();
      return;
    }

    if (target.closest('[data-budget-settings]')) { openBudgetModal(root); return; }
    if (target.closest('[data-budget-modal-close]')) { root.querySelector('[data-budget-modal]')?.remove(); return; }
    if (target.matches('[data-budget-modal]')) { target.remove(); return; }

    if (target.closest('[data-manual-add]')) {
      const form = target.closest('#coffee-manual-form');
      if (form) appendManualRow(root, form);
      return;
    }
    const manualRemove = target.closest('[data-manual-remove]');
    if (manualRemove) {
      const form = manualRemove.closest('#coffee-manual-form');
      const body = form?.querySelector('[data-manual-body]');
      manualRemove.closest('[data-manual-row]')?.remove();
      if (form) {
        if (body && !body.querySelector('[data-manual-row]')) appendManualRow(root, form);
        reindexManualRows(form);
        updateManualTotal(form);
      }
      return;
    }
    if (target.closest('[data-manual-clear]')) {
      const form = target.closest('#coffee-manual-form');
      if (form && window.confirm('Xoá toàn bộ nội dung đang nhập?')) {
        const body = form.querySelector('[data-manual-body]');
        if (body) body.innerHTML = renderManualRow({}, 0);
        updateManualTotal(form);
      }
      return;
    }

    const quickTag = target.closest('[data-quick-category]');
    if (quickTag) {
      const form = quickTag.closest('#coffee-manual-form');
      if (form) {
        form.querySelectorAll('[data-manual-row]').forEach((row) => {
          const select = row.querySelector('[name="category"]');
          if (select) select.value = quickTag.dataset.quickCategory;
          refreshManualExpenseChip(row);
        });
        quickTag.closest('.coffee-manual-quicktags')?.querySelectorAll('[data-quick-category]').forEach((chip) => chip.classList.toggle('is-active', chip === quickTag));
      }
      return;
    }

    if (target.closest('[data-ai-refresh]')) {
      const host = root.querySelector('[data-ai-insights]');
      if (host) {
        host.outerHTML = renderAiInsights(getCoffeeState().receipts);
        showToast(root, 'Đã làm mới phân tích AI Insights.');
      }
      return;
    }

    if (target.closest('[data-add-item]')) {
      const form = target.closest('#coffee-receipt-form');
      if (form) { appendItem(form, {}); form.querySelector('[data-item-row]:last-of-type [name="itemName"]')?.focus(); }
      return;
    }
    const removeItem = target.closest('[data-remove-item]');
    if (removeItem) {
      const form = removeItem.closest('#coffee-receipt-form');
      removeItem.closest('[data-item-row]')?.remove();
      if (form) { updateItemEmpty(form); updateCostDisplays(form); }
      return;
    }

    if (target.closest('[data-export]')) { exportReceipts(); return; }
    if (target.closest('[data-export-csv]')) { downloadCsv(); return; }
    if (target.closest('[data-import-trigger]')) { root.querySelector('[data-import-input]')?.click(); return; }
    if (target.closest('[data-clear-all]')) {
      if (!window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử chi phí không? Hành động này không thể hoàn tác.')) return;
      clearCoffeeData();
      resetSearchState();
      pendingToast = 'Đã xóa toàn bộ dữ liệu chi phí trên thiết bị này.';
      showRoute(root);
      return;
    }
    if (target.closest('[data-print]')) { window.print(); return; }

    const pageButton = target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      searchState.page = Number(pageButton.dataset.page);
      refreshHistoryResults(root);
      root.querySelector('[data-history-results]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const deleteButton = target.closest('[data-delete-receipt]');
    if (deleteButton) {
      const id = deleteButton.dataset.deleteReceipt;
      if (window.confirm(`Xoá giao dịch ${id} khỏi thiết bị này?`)) {
        removeReceipt(id);
        if (routeName(root).includes('/detail/')) location.hash = '#/coffee';
        else showRoute(root);
        showToast(root, `Đã xoá ${id}.`);
      }
    }
  });

  root.addEventListener('submit', (event) => {
    const form = event.target;
    event.preventDefault();
    if (form.id === 'coffee-manual-form') {
      try {
        const rows = readManualRows(form);
        if (!rows.length) throw new Error('Hãy nhập ít nhất một giao dịch (thương hiệu và số tiền).');
        const problems = [];
        rows.forEach((row, index) => {
          if (!row.brand) problems.push(`Dòng ${index + 1}: thiếu quán (brand)`);
          else if (!row.subtotal) problems.push(`Dòng ${index + 1}: thành tiền phải lớn hơn 0`);
          else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) problems.push(`Dòng ${index + 1}: ngày giao dịch chưa hợp lệ`);
        });
        if (problems.length) throw new Error(problems.join(' · '));
        const saved = [];
        rows.forEach((row) => {
          const duplicate = detectReceiptDuplicate({ store: row.brand, total: row.total, date: row.date }, getCoffeeState().receipts);
          if (duplicate && !window.confirm(`Có thể trùng giao dịch ${duplicate.id} (${duplicate.store}, ${formatVnd(duplicate.total)}). Vẫn lưu dòng ${row.brand}?`)) return;
          saved.push(saveReceipt({
            store: row.brand,
            date: row.date,
            subtotal: row.subtotal,
            discount: row.discount,
            total: row.total,
            expenseCategory: row.expenseCategory,
            categoryId: row.categoryDetailId || '',
            categoryGroupId: row.categoryGroupId || '',
            items: rowToItems(row.itemsText, row.subtotal, row.quantity),
          }));
          if (row.expenseCategoryRaw) learnMerchantCategory(row.brand, row.expenseCategoryRaw, { alias: row.brand });
        });
        if (!saved.length) { showToast(root, 'Không có giao dịch nào được lưu.'); return; }
        resetSearchState();
        showExpenseReview(root, saved);
      } catch (error) {
        showToast(root, error.message || 'Không lưu được dữ liệu.', true);
      }
      return;
    }
    if (form.id === 'coffee-receipt-form') {
      try {
        if (!form.reportValidity()) return;
        const input = readReceiptForm(form);
        const record = saveReceipt(input, input.id);
        pendingToast = `Đã lưu giao dịch ${record.id} · ${record.store || 'cà phê'} · ${formatVnd(record.total)}.`;
        resetSearchState();
        location.hash = '#/coffee';
        if (routeName(root) === '/coffee') showRoute(root);
      } catch (error) {
        showToast(root, error.message || 'Không lưu được dữ liệu.', true);
      }
      return;
    }
    if (form.id === 'coffee-budget-form') {
      try {
        const data = new FormData(form);
        saveCoffeeProfile({
          monthlyBudget: data.get('monthlyBudget'),
          quarterlyBudget: data.get('quarterlyBudget'),
          yearlyBudget: data.get('yearlyBudget'),
        });
        root.querySelector('[data-budget-modal]')?.remove();
        showRoute(root);
        showToast(root, 'Đã lưu ngân sách tháng / quý / năm trên thiết bị này.');
      } catch (error) {
        showToast(root, error.message || 'Không lưu được ngân sách.', true);
      }
    }
  });

  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/coffee')) showRoute(root);
  });
  window.addEventListener('coffee:data-changed', () => showRoute(root));
  showRoute(root);
}

export { renderHistory, renderDetail, renderStats, renderFormPage };
