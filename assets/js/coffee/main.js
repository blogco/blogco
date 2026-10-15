// Router + view layer for the "Chi phí cà phê" (Highlands Coffee spending) feature.
//
// Routes (hash based, mounted on the home page and dedicated pages):
//   #/coffee            → danh sách + tìm kiếm + export/import
//   #/coffee/add        → thêm hoá đơn (OCR Highlands Coffee)
//   #/coffee/edit/:id   → sửa hoá đơn
//   #/coffee/detail/:id → xem chi tiết
//   #/coffee/stats      → thống kê chi phí đi cà phê

import {
  getCoffeeState, getReceiptById, saveReceipt, removeReceipt, saveCoffeeProfile,
  exportReceipts, importReceipts, readJsonFile, downloadCsv,
  escapeHtml, formatVnd, toNumber, PAYMENT_LABELS,
} from './store.js';
import { CATEGORY_LABELS, categoryLabel } from './menu.js';
import { renderReceiptForm, renderItemRow, readReceiptForm } from './form.js';
import { computeCoffeeStats } from './stats.js';
import { recognizeImage, isPdf, pdfToPreviewDataUrl, extractPdfText } from './ocr.js';
import { buildReceiptJson, receiptJsonToForm } from './receipt-json.js';
import { renderTrainingPage, mountTraining } from './training-view.js';
import { loadPatterns, applyLearnedFixes } from './training.js';
import {
  renderManualForm, renderManualRow, readManualRows, formatAmountInput, seasonOf, rowToItems,
} from './manual.js';
import { renderAiInsights } from './insights.js';

const mountedRoots = new WeakSet();
const PAGE_SIZE = 6;
let pendingToast = '';
let searchState = { query: '', month: '', store: '', page: 1 };

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

function pageHeader(title, description, back = '/coffee') {
  return `<div class="coffee-page-heading">
    <a class="coffee-back" href="#${back}" aria-label="Quay lại">← Quay lại</a>
    <p class="coffee-eyebrow">BLOGCO · CHI PHÍ CÀ PHÊ</p>
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

export function filterReceipts(receipts, { query = '', month = '', store = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return sortReceipts(receipts).filter((receipt) => {
    if (month && !String(receipt.date || '').startsWith(month)) return false;
    if (store && receipt.store !== store) return false;
    if (!needle) return true;
    const haystack = [
      receipt.store, receipt.address, receipt.orderCode, receipt.note,
      PAYMENT_LABELS[receipt.paymentMethod],
      (receipt.items || []).map((item) => `${item.name} ${categoryLabel(item.category)}`).join(' '),
    ].join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

function filterOptions(receipts) {
  const months = new Set();
  const stores = new Set();
  receipts.forEach((receipt) => {
    const month = String(receipt.date || '').slice(0, 7);
    if (month) months.add(month);
    if (receipt.store) stores.add(receipt.store);
  });
  return {
    months: [...months].sort().reverse(),
    stores: [...stores].sort((a, b) => a.localeCompare(b, 'vi')),
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

function renderReceiptCard(receipt) {
  const id = escapeHtml(receipt.id);
  const items = receipt.items || [];
  return `<li class="coffee-receipt-card">
    <div class="coffee-receipt-card__top">
      <p class="coffee-receipt-card__meta">📅 ${escapeHtml(formatDate(receipt.date))}${receipt.time ? ` · ${escapeHtml(receipt.time)}` : ''} · ☕ ${escapeHtml(receipt.store || 'Không rõ quán')}</p>
      <strong class="coffee-receipt-card__total">${escapeHtml(formatVnd(receipt.total))}</strong>
    </div>
    <p class="coffee-receipt-card__items">${escapeHtml(itemSummary(receipt))}</p>
    <p class="coffee-receipt-card__tags">
      <span class="coffee-chip">${items.length} món</span>
      ${receipt.paymentMethod ? `<span class="coffee-chip">${escapeHtml(PAYMENT_LABELS[receipt.paymentMethod])}</span>` : ''}
      ${receipt.orderCode ? `<span class="coffee-chip coffee-chip--muted">${escapeHtml(receipt.orderCode)}</span>` : ''}
    </p>
    <div class="coffee-receipt-card__actions">
      <a class="coffee-text-link" href="#/coffee/detail/${id}">Xem chi tiết →</a>
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
    list = '<p class="coffee-empty">Chưa có hoá đơn nào. Bấm “Thêm hoá đơn” để bắt đầu thống kê chi phí đi cà phê.</p>';
  } else if (!filtered.length) {
    list = '<p class="coffee-empty">Không tìm thấy hoá đơn phù hợp với bộ lọc.</p>';
  } else {
    list = `<ul class="coffee-receipt-list">${rows.map(renderReceiptCard).join('')}</ul>`;
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

function renderHistory(root) {
  const state = getCoffeeState();
  const stats = computeCoffeeStats(state.receipts, { budget: state.profile.monthlyBudget });
  const { months, stores } = filterOptions(state.receipts);
  const budget = stats.budget;
  const monthPct = budget ? Math.min(100, Math.round((stats.currentMonthTotal / budget) * 100)) : 0;
  const budgetClass = !budget ? '' : monthPct >= 100 ? 'is-danger' : monthPct >= 80 ? 'is-warning' : 'is-success';

  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    <div class="coffee-page-heading coffee-page-heading--hero">
      <p class="coffee-eyebrow">BLOGCO · CHI PHÍ CÀ PHÊ</p>
      <h1 id="coffee-title" tabindex="-1">Chi phí đi cà phê</h1>
      <p>Tải ảnh hoá đơn Highlands Coffee để OCR và thống kê chi phí. Dữ liệu chỉ lưu trên thiết bị này.</p>
    </div>

    <div class="coffee-toolbar">
      <a class="coffee-primary-button" href="#/coffee/add">📄 Thêm hoá đơn (PDF)</a>
      <a class="coffee-secondary-button" href="#/coffee/manual-add">🧾 Nhập chi phí thủ công</a>
      <a class="coffee-secondary-button" href="#/coffee/stats">📊 Thống kê chi phí</a>
      <button type="button" class="coffee-secondary-button" data-export>⬇ Export JSON</button>
      <button type="button" class="coffee-secondary-button" data-import-trigger>⬆ Import</button>
      <button type="button" class="coffee-secondary-button" data-export-csv>⬇ CSV</button>
      <input type="file" accept="application/json,.json" data-import-input hidden aria-label="Chọn file JSON để nhập">
    </div>

    <section class="coffee-card coffee-budget-strip" aria-label="Chi tiêu tháng này">
      <div><p class="coffee-eyebrow">THÁNG NÀY</p><strong class="coffee-budget-value">${escapeHtml(formatVnd(stats.currentMonthTotal))}</strong>
        <span class="coffee-muted">/ ${budget ? escapeHtml(formatVnd(budget)) : 'chưa đặt ngân sách'} · ${stats.count} hoá đơn · TB ${escapeHtml(formatVnd(stats.averageSpend))}/lần</span></div>
      ${budget ? `<div class="coffee-budget-bar" role="progressbar" aria-label="Chi tiêu tháng này so với ngân sách" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${monthPct}"><span class="${budgetClass}" style="width:${monthPct}%"></span></div>` : ''}
    </section>

    <div class="coffee-card coffee-search">
      <label class="coffee-field coffee-field--full">
        <span class="coffee-search__label">🔍 Tìm kiếm</span>
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
      </div>
    </div>

    <section class="coffee-card" aria-label="Danh sách hoá đơn">
      ${renderHistoryResults({ allReceipts: state.receipts })}
    </section>
    <p class="coffee-disclaimer">Công cụ ghi chép cá nhân giúp bạn theo dõi chi tiêu cà phê. Số liệu do bạn nhập hoặc OCR từ ảnh — hãy kiểm tra lại trước khi tin dùng.</p>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function renderInvoiceView(url) {
  const value = String(url || '').trim();
  if (!/^(https?:|data:image\/|\/[^/]|\.\/)/i.test(value)) return '<p class="coffee-muted">Chưa có ảnh hoá đơn.</p>';
  return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener"><img src="${escapeHtml(value)}" alt="Ảnh hoá đơn" loading="lazy"></a>`;
}

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

      <h2 class="coffee-section-title">Ảnh hoá đơn</h2>
      <div class="coffee-invoice-view">${renderInvoiceView(receipt.invoiceUrl)}</div>

      ${receipt.ocrText ? `<details class="coffee-ocr-details"><summary>Nội dung OCR gốc</summary><pre>${escapeHtml(receipt.ocrText)}</pre></details>` : ''}
    </section>

    <div class="coffee-actions">
      <a class="coffee-secondary-button" href="#/coffee">← Danh sách</a>
      <a class="coffee-primary-button" href="#/coffee/edit/${escapeHtml(receipt.id)}">Sửa</a>
      <button type="button" class="coffee-secondary-button" data-print>⬇ PDF / In</button>
      <button type="button" class="coffee-ghost-button coffee-ghost-button--danger" data-delete-receipt="${escapeHtml(receipt.id)}">Xoá</button>
    </div>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Stats view
// ---------------------------------------------------------------------------

function renderStats(root) {
  const state = getCoffeeState();
  const stats = computeCoffeeStats(state.receipts, { budget: state.profile.monthlyBudget });
  const maxMonth = stats.maxMonthTotal || 1;
  const recentMonths = [...stats.byMonth].slice(0, 12).reverse();
  const monthRows = recentMonths.map((month) => {
    const width = Math.round((month.total / maxMonth) * 100);
    return `<li class="coffee-stat-row">
      <span class="coffee-stat-row__label">${escapeHtml(month.label)}<small>${month.count} hoá đơn</small></span>
      <span class="coffee-stat-bar" role="img" aria-label="${escapeHtml(month.label)}: ${escapeHtml(formatVnd(month.total))}"><span style="width:${width}%"></span></span>
      <strong>${escapeHtml(formatVnd(month.total))}</strong>
    </li>`;
  }).join('');
  const yearRows = stats.byYear.map((year) => `<li><span>${escapeHtml(year.year)}</span><strong>${escapeHtml(formatVnd(year.total))} <small>(${year.count})</small></strong></li>`).join('');
  const storeRows = stats.byStore.slice(0, 8).map((store) => `<li><span>${escapeHtml(store.store)}</span><strong>${escapeHtml(formatVnd(store.total))} <small>(${store.count})</small></strong></li>`).join('');
  const categoryRows = stats.byCategory.map((category) => `<li><span>${escapeHtml(category.label)}</span><strong>${escapeHtml(formatVnd(category.total))} <small>(${category.count})</small></strong></li>`).join('');
  const itemRows = stats.topItems.map((item) => `<li><span>${escapeHtml(item.name)}</span><strong>${item.count}× · ${escapeHtml(formatVnd(item.total))}</strong></li>`).join('');
  const budget = stats.budget || 0;
  const monthPct = budget ? Math.min(100, Math.round((stats.currentMonthTotal / budget) * 100)) : 0;
  const budgetClass = !budget ? '' : monthPct >= 100 ? 'is-danger' : monthPct >= 80 ? 'is-warning' : 'is-success';

  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    ${pageHeader('Thống kê chi phí đi cà phê', 'Tổng hợp chi phí theo tháng, quán, nhóm đồ uống và món gọi nhiều nhất.')}
    ${stats.count === 0 ? '<p class="coffee-empty">Chưa có dữ liệu để thống kê. Thêm một hoá đơn để bắt đầu.</p>' : `
    <div class="coffee-summary-grid">
      <div class="coffee-summary-card"><span>Tổng chi phí</span><strong>${escapeHtml(formatVnd(stats.totalSpend))}</strong></div>
      <div class="coffee-summary-card"><span>Số hoá đơn</span><strong>${stats.count}</strong></div>
      <div class="coffee-summary-card"><span>Lượt món</span><strong>${stats.itemCount}</strong></div>
      <div class="coffee-summary-card"><span>Trung bình / lần</span><strong>${escapeHtml(formatVnd(stats.averageSpend))}</strong></div>
      <div class="coffee-summary-card"><span>TB / tháng (có dữ liệu)</span><strong>${escapeHtml(formatVnd(stats.monthlyAverage))}</strong></div>
      <div class="coffee-summary-card"><span>Lần tốn nhất</span><strong>${escapeHtml(formatVnd(stats.maxSpend))}</strong></div>
    </div>

    <section class="coffee-card coffee-budget-card">
      <div class="coffee-card-heading"><div><p class="coffee-eyebrow">NGÂN SÁCH THÁNG</p><h2>${escapeHtml(formatVnd(stats.currentMonthTotal))} <span class="coffee-muted">/ ${budget ? escapeHtml(formatVnd(budget)) : 'chưa đặt'}</span></h2></div>${budget ? `<span class="coffee-chip ${budgetClass}">${monthPct}%</span>` : ''}</div>
      ${budget ? `<div class="coffee-budget-bar" role="progressbar" aria-label="Chi tiêu tháng này so với ngân sách" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${monthPct}"><span class="${budgetClass}" style="width:${monthPct}%"></span></div>` : ''}
      <form id="coffee-budget-form" class="coffee-budget-form">
        <label class="coffee-field">Ngân sách mỗi tháng (đ)
          <input name="monthlyBudget" type="number" min="0" max="100000000" step="10000" value="${escapeHtml(budget)}" inputmode="numeric">
        </label>
        <button class="coffee-primary-button" type="submit">Lưu ngân sách</button>
      </form>
    </section>

    <section class="coffee-card"><h2 class="coffee-section-title">Theo tháng</h2>
      ${monthRows ? `<ul class="coffee-stat-list">${monthRows}</ul>` : '<p class="coffee-muted">Chưa có dữ liệu.</p>'}
    </section>

    <div class="coffee-stats-grid">
      <section class="coffee-card"><h2 class="coffee-section-title">Theo năm</h2>
        <ul class="coffee-stat-simple">${yearRows || '<li class="coffee-muted">—</li>'}</ul>
      </section>
      <section class="coffee-card"><h2 class="coffee-section-title">Theo quán</h2>
        <ul class="coffee-stat-simple">${storeRows || '<li class="coffee-muted">—</li>'}</ul>
      </section>
      <section class="coffee-card"><h2 class="coffee-section-title">Theo nhóm đồ uống</h2>
        <ul class="coffee-stat-simple">${categoryRows || '<li class="coffee-muted">—</li>'}</ul>
      </section>
    </div>

    <section class="coffee-card"><h2 class="coffee-section-title">Món gọi nhiều nhất</h2>
      <ul class="coffee-stat-simple">${itemRows || '<li class="coffee-muted">Chưa có chi tiết món.</li>'}</ul>
    </section>`}

    ${renderAiInsights(state.receipts)}
    <div class="coffee-actions"><a class="coffee-secondary-button" href="#/coffee">← Danh sách</a></div>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Add / edit form view
// ---------------------------------------------------------------------------

function renderFormPage(root, receiptId = '') {
  const receipt = receiptId ? getReceiptById(receiptId) : null;
  if (receiptId && !receipt) {
    root.innerHTML = `<section class="coffee-screen">${pageHeader('Không tìm thấy', 'Hoá đơn cần sửa không tồn tại.')}</section>${toastMarkup()}`;
    return;
  }
  const mode = receiptId ? 'edit' : 'add';
  const nextId = mode === 'edit' ? receiptId : 'cf-...';
  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    ${pageHeader(mode === 'edit' ? 'Sửa hoá đơn cà phê' : 'Thêm hoá đơn cà phê', mode === 'edit' ? `Cập nhật thông tin cho ${nextId}.` : 'Tải file PDF hoá đơn để trích xuất tự động thành JSON và điền vào form.')}
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

function fillFieldIfEmpty(form, name, value) {
  if (value === null || value === undefined || value === '') return false;
  const field = form.querySelector(`[name="${name}"]`);
  if (!field || String(field.value || '').trim()) return false;
  field.value = value;
  return true;
}

function setSelectIfEmpty(form, name, value) {
  if (!value) return false;
  const field = form.querySelector(`[name="${name}"]`);
  if (!field || field.value) return false;
  if (![...field.options].some((option) => option.value === value)) return false;
  field.value = value;
  return true;
}

function applyOcrResult(form, mapped) {
  const filled = [];
  const mark = (label, changed) => { if (changed) filled.push(label); };
  mark('quán', fillFieldIfEmpty(form, 'store', mapped.store));
  mark('địa chỉ', fillFieldIfEmpty(form, 'address', mapped.address));
  mark('ngày', fillFieldIfEmpty(form, 'date', mapped.date));
  mark('giờ', fillFieldIfEmpty(form, 'time', mapped.time));
  mark('mã hoá đơn', fillFieldIfEmpty(form, 'orderCode', mapped.orderCode));
  mark('khách hàng', fillFieldIfEmpty(form, 'customer', mapped.customer));
  mark('thanh toán', setSelectIfEmpty(form, 'paymentMethod', mapped.paymentMethod));
  if (mapped.discount) { const field = form.querySelector('[name="discount"]'); if (field && !field.value) { field.value = mapped.discount; mark('giảm giá', true); } }
  if (mapped.vat) { const field = form.querySelector('[name="vat"]'); if (field && !field.value) { field.value = mapped.vat; mark('VAT', true); } }

  if (Array.isArray(mapped.items) && mapped.items.length) {
    const list = form.querySelector('[data-item-list]');
    if (list) {
      list.innerHTML = mapped.items.map((item, index) => renderItemRow(item, index)).join('');
      filled.push(`${mapped.items.length} món`);
    }
  }

  updateItemEmpty(form);
  updateCostDisplays(form);

  // Yêu cầu: tổng tiền LUÔN tính lại từ danh sách món sau khi trừ giảm giá.
  // Nếu hoá đơn có in tổng khác, ghi lại để đối chiếu (không ghi đè tổng).
  if (mapped.printedTotal !== null && mapped.printedTotal !== undefined) {
    const totalInput = form.querySelector('[name="totalValue"]');
    if (totalInput) totalInput.dataset.printedTotal = String(mapped.printedTotal);
  }
  return filled;
}

// ---------------------------------------------------------------------------
// OCR wiring (image handling mirrors the health module)
// ---------------------------------------------------------------------------

function compressImage(file, maxDim = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.onerror = () => reject(new Error('Không đọc được ảnh.'));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
    reader.readAsDataURL(file);
  });
}

async function handleInvoiceFile(block, file) {
  const preview = block.querySelector('[data-invoice-preview]');
  const hint = block.querySelector('.coffee-dropzone__hint');
  const clear = block.querySelector('[data-invoice-clear]');
  const valueInput = block.querySelector('[data-invoice-value]');
  const status = block.querySelector('[data-invoice-status]');
  block._pendingFile = file;
  let dataUrl = '';
  try {
    dataUrl = isPdf(file) ? await pdfToPreviewDataUrl(file) : await compressImage(file);
  } catch (error) {
    if (status) status.textContent = `${error.message} Bạn vẫn có thể bấm “📄 Trích xuất dữ liệu”.`;
  }
  if (dataUrl && preview) { preview.src = dataUrl; preview.hidden = false; }
  if (hint) hint.hidden = Boolean(dataUrl) || isPdf(file);
  if (clear) clear.hidden = false;
  block.querySelector('[data-dropzone]')?.classList.add('has-image');
  if (valueInput) valueInput.value = dataUrl;
  if (status) {
    status.textContent = isPdf(file)
      ? 'Đã nạp PDF. Bấm “📄 Trích xuất dữ liệu” để đọc hoá đơn.'
      : 'Đã nạp ảnh. Bấm “📄 Trích xuất dữ liệu” để OCR.';
  }
}

async function applyClearInvoice(block) {
  const preview = block.querySelector('[data-invoice-preview]');
  const hint = block.querySelector('.coffee-dropzone__hint');
  const clear = block.querySelector('[data-invoice-clear]');
  const valueInput = block.querySelector('[data-invoice-value]');
  const status = block.querySelector('[data-invoice-status]');
  block._pendingFile = null;
  if (preview) { preview.src = ''; preview.hidden = true; }
  if (hint) hint.hidden = false;
  if (clear) clear.hidden = true;
  block.querySelector('[data-dropzone]')?.classList.remove('has-image');
  if (valueInput) valueInput.value = '';
  if (status) status.textContent = 'Đã xoá file hoá đơn.';
}

// Trích xuất hoá đơn: PDF → text → JSON chuẩn → điền form. Ảnh vẫn dùng OCR để
// lấy text rồi đi qua CÙNG một bộ parser JSON (một đường ống, một kết quả).
async function runExtract(root, form, block) {
  const input = block.querySelector('[data-invoice-input]');
  const status = block.querySelector('[data-invoice-status]');
  const textArea = block.querySelector('[name="ocrText"]');
  const file = input?.files?.[0] || block._pendingFile;
  if (!file) {
    if (status) status.textContent = 'Hãy chọn file PDF hoá đơn trước khi trích xuất.';
    return;
  }
  try {
    let rawText = '';
    if (isPdf(file)) {
      if (status) status.textContent = 'Đang đọc văn bản từ PDF…';
      const { text, totalPages } = await extractPdfText(file, {
        onProgress: (message) => { if (status && message?.status) status.textContent = message.status; },
      });
      rawText = text;
      if (!rawText.trim()) {
        if (status) status.textContent = 'PDF này không có lớp văn bản (có thể là bản scan ảnh). Hãy dùng file PDF gốc hoặc tải ảnh để OCR.';
        return;
      }
      if (status) status.textContent = `Đã đọc ${totalPages} trang PDF. Đang cấu trúc JSON…`;
    } else {
      // Ảnh: OCR lấy text rồi đi tiếp qua bộ parser JSON.
      rawText = await recognizeImage(file, {
        onProgress: (message) => {
          if (status && message?.status) {
            const percent = message.progress ? ` ${Math.round(message.progress * 100)}%` : '';
            status.textContent = `OCR: ${message.status}${percent}`;
          }
        },
      });
      if (!rawText.trim()) {
        if (textArea) textArea.value = rawText;
        if (status) status.textContent = 'Không đọc được chữ nào từ ảnh. Hãy thử ảnh rõ hơn hoặc nhập tay.';
        return;
      }
      // Áp bảng sửa lỗi tiếng Việt đã học (AI Training) trước khi parse.
      try {
        const { data: patterns } = await loadPatterns('highlands');
        rawText = applyLearnedFixes(rawText, patterns?.vietnameseFixes || {});
      } catch {
        // best-effort: nếu không tải được patterns thì dùng text gốc.
      }
    }

    if (textArea) textArea.value = rawText;
    const json = buildReceiptJson(rawText);
    const mapped = receiptJsonToForm(json);
    const filled = applyOcrResult(form, mapped);
    updateCostDisplays(form);
    renderExtractPanel(block, json);

    const totalEl = form.querySelector('[data-total-display]');
    const totalLabel = totalEl ? totalEl.value : '';
    let message = filled.length
      ? `Đã điền: ${filled.join(', ')}. Tổng tính lại: ${totalLabel}.`
      : 'Trích xuất xong nhưng chưa tìm thấy trường mới — bạn kiểm tra JSON bên dưới.';
    if (json.printed_total !== null && json.printed_total !== json.total_amount) {
      message += ` ⚠️ Tổng in trên hoá đơn lệch ${Math.abs(json.printed_total - json.total_amount).toLocaleString('vi-VN')} đ — đã tính lại theo danh sách món.`;
    } else if (!json.items.length) {
      message += ' ⚠️ Không nhận diện được món nào — kiểm tra lại văn bản.';
    }
    if (status) status.textContent = message;
  } catch (error) {
    if (status) status.textContent = `${error.message} Bạn có thể nhập tay.`;
  }
}

function renderExtractPanel(block, json) {
  const panel = block.querySelector('[data-ocr-json]');
  const pre = block.querySelector('[data-ocr-json-pre]');
  const note = block.querySelector('[data-ocr-json-note]');
  if (!panel || !pre || !json) {
    if (panel) panel.hidden = true;
    return;
  }
  pre.textContent = JSON.stringify(json, null, 2);
  if (note) {
    const parts = [
      `${json.items.length} món`,
      `${formatVnd(json.total_amount)}`,
      json.date ? formatDate(json.date) : 'chưa rõ ngày',
    ];
    if (json.discount_total) parts.push(`giảm ${formatVnd(json.discount_total)}`);
    const confidence = { high: '✅ độ tin cậy cao', medium: '⚠️ cần kiểm tra', low: '❌ độ tin cậy thấp' }[json.confidence] || json.confidence;
    parts.push(confidence);
    note.textContent = parts.join(' · ');
  }
  panel.hidden = false;
}

// ---------------------------------------------------------------------------
// Manual expense input (#/coffee/manual-add)
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
  cell.textContent = season ? `${season.emoji} ${season.label}` : '—';
  cell.classList.toggle('is-empty', !season);
}

function updateManualTotal(form) {
  if (!form) return;
  const total = readManualRows(form).reduce((sum, row) => sum + row.amount, 0);
  const value = form.querySelector('[data-manual-total] strong');
  if (value) value.textContent = formatVnd(total);
}

function renderManualPage(root) {
  root.innerHTML = `<section class="coffee-screen" aria-labelledby="coffee-title">
    ${pageHeader('Nhập chi phí thủ công', 'Nhập nhanh nhiều giao dịch cà phê theo dạng bảng. Cột Seasons tự động điền theo ngày giao dịch.')}
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

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function routeName(root) {
  if (location.hash.startsWith('#/coffee')) return location.hash.slice(1).replace(/\/$/, '') || '/coffee';
  const initial = root.dataset.initialRoute;
  const map = { list: '/coffee', dashboard: '/coffee', history: '/coffee', add: '/coffee/add', stats: '/coffee/stats', training: '/coffee/training', 'manual-add': '/coffee/manual-add' };
  return map[initial] || '/coffee';
}

function renderTraining(root) {
  root.innerHTML = renderTrainingPage();
  void mountTraining(root);
}

function showRoute(root) {
  const route = routeName(root);
  const [, , action = '', param = ''] = route.split('/');
  const titles = { '': 'Chi phí đi cà phê', add: 'Thêm hoá đơn cà phê', edit: 'Sửa hoá đơn cà phê', detail: 'Chi tiết hoá đơn', stats: 'Thống kê chi phí cà phê', training: 'AI Training — dạy OCR hoá đơn', 'manual-add': 'Nhập chi phí thủ công' };
  document.title = `${titles[action] || titles['']} | BlogCo`;

  if (action === 'add') renderFormPage(root, '');
  else if (action === 'edit') renderFormPage(root, decodeURIComponent(param));
  else if (action === 'detail') renderDetail(root, decodeURIComponent(param));
  else if (action === 'stats') renderStats(root);
  else if (action === 'training') renderTraining(root);
  else if (action === 'manual-add') renderManualPage(root);
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
    if (manualForm && event.target.name === 'amount') {
      const formatted = formatAmountInput(event.target.value);
      if (formatted !== event.target.value) event.target.value = formatted;
      updateManualTotal(manualForm);
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
    if (manualForm && target.name === 'amount') {
      target.value = formatAmountInput(target.value);
      updateManualTotal(manualForm);
    }
    if (target.matches('[data-filter-month]')) { searchState.month = target.value; searchState.page = 1; refreshHistoryResults(root); }
    if (target.matches('[data-filter-store]')) { searchState.store = target.value; searchState.page = 1; refreshHistoryResults(root); }
    if (target.matches('[data-invoice-input]')) {
      const block = target.closest('[data-invoice-block]');
      const file = target.files?.[0];
      if (block && file) await handleInvoiceFile(block, file);
      target.value = '';
    }
    if (target.matches('[data-import-input]')) {
      const file = target.files?.[0];
      if (!file) return;
      try {
        const payload = await readJsonFile(file);
        const result = importReceipts(payload);
        pendingToast = `Đã nhập ${result.added} hoá đơn mới, cập nhật ${result.updated}. Tổng ${result.total}.`;
        searchState = { query: '', month: '', store: '', page: 1 };
        showRoute(root);
      } catch (error) {
        showToast(root, error.message, true);
      } finally {
        target.value = '';
      }
    }
  });

  root.addEventListener('dragover', (event) => {
    const zone = event.target.closest('[data-dropzone]');
    if (zone) { event.preventDefault(); zone.classList.add('is-dragover'); }
  });
  root.addEventListener('dragleave', (event) => {
    event.target.closest('[data-dropzone]')?.classList.remove('is-dragover');
  });
  root.addEventListener('drop', async (event) => {
    const zone = event.target.closest('[data-dropzone]');
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    const block = zone.closest('[data-invoice-block]');
    if (file && block) await handleInvoiceFile(block, file);
  });

  root.addEventListener('click', async (event) => {
    const target = event.target;

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

    const extractButton = target.closest('[data-invoice-extract]');
    if (extractButton) {
      const block = extractButton.closest('[data-invoice-block]');
      const form = target.closest('#coffee-receipt-form');
      if (block && form) await runExtract(root, form, block);
      return;
    }
    if (target.closest('[data-invoice-clear]')) {
      await applyClearInvoice(target.closest('[data-invoice-block]'));
      return;
    }

    if (target.closest('[data-export]')) { exportReceipts(); return; }
    if (target.closest('[data-export-csv]')) { downloadCsv(); return; }
    if (target.closest('[data-import-trigger]')) { root.querySelector('[data-import-input]')?.click(); return; }
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
      if (window.confirm(`Xoá hoá đơn ${id} khỏi thiết bị này?`)) {
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
          if (!row.brand) problems.push(`Dòng ${index + 1}: thiếu thương hiệu`);
          else if (!row.amount) problems.push(`Dòng ${index + 1}: số tiền phải lớn hơn 0`);
          else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) problems.push(`Dòng ${index + 1}: ngày giao dịch chưa hợp lệ`);
        });
        if (problems.length) throw new Error(problems.join(' · '));
        let total = 0;
        rows.forEach((row) => {
          saveReceipt({
            store: row.brand,
            date: row.date,
            subtotal: row.amount,
            total: row.amount,
            items: rowToItems(row.itemsText, row.amount),
          });
          total += row.amount;
        });
        pendingToast = `Đã lưu ${rows.length} giao dịch (${formatVnd(total)}). Đang cập nhật trang thống kê…`;
        searchState = { query: '', month: '', store: '', page: 1 };
        location.hash = '#/coffee/stats';
        if (routeName(root) === '/coffee/stats') showRoute(root);
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
        pendingToast = `Đã lưu hoá đơn ${record.id} · ${record.store || 'cà phê'} · ${formatVnd(record.total)}.`;
        searchState = { query: '', month: '', store: '', page: 1 };
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
        saveCoffeeProfile({ monthlyBudget: data.get('monthlyBudget') });
        showRoute(root);
        showToast(root, 'Đã lưu ngân sách tháng trên thiết bị này.');
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

export { renderHistory, renderDetail, renderStats, renderFormPage, applyOcrResult };
