// Router + view layer for the "Quản lý thuốc & công dụng điều trị" feature.
//
// Routes (hash based, mounted on the home page and dedicated pages):
//   #/thuoc            → danh sách + tìm kiếm + export/import
//   #/thuoc/add        → thêm thuốc
//   #/thuoc/edit/:id   → sửa
//   #/thuoc/detail/:id → xem chi tiết
//   #/thuoc/stats      → thống kê & phân tích

import {
  getThuocState, getEntryById, saveEntry, removeEntry,
  exportEntries, importEntries, readJsonFile, downloadCsv, clearThuocData,
  escapeHtml,
} from './store.js';
import { CATEGORY_ORDER, categoryIcon, categoryLabel } from './catalog.js';
import { renderEntryForm, readEntryForm, refreshCategoryChip } from './form.js';
import { computeThuocStats } from './stats.js';
import { renderThuocInsights } from './insights.js';
import { renderThuocDashboard } from './dashboard.js';
import { icon } from '../icons.js';

const mountedRoots = new WeakSet();
const PAGE_SIZE = 8;
let pendingToast = '';

const DEFAULT_SEARCH_STATE = { query: '', month: '', facility: '', category: '', page: 1 };
let searchState = { ...DEFAULT_SEARCH_STATE };

function resetSearchState() {
  searchState = { ...DEFAULT_SEARCH_STATE };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${dateKey}T12:00:00`));
}

function todayValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function todayKey() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function toastMarkup() {
  return '<div class="thuoc-toast" data-thuoc-toast role="status" aria-live="polite" aria-atomic="true"></div>';
}

function showToast(root, text, isError = false) {
  const toast = root.querySelector('[data-thuoc-toast]');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('is-visible'), 4200);
}

function pageHeader(title, description, back = '/thuoc', hero = false) {
  return `<div class="thuoc-page-heading${hero ? ' thuoc-page-heading--hero' : ''}">
    <a class="thuoc-back" href="#${back}" aria-label="Quay lại">← Quay lại</a>
    <p class="thuoc-eyebrow">BLOGCO · QUẢN LÝ THUỐC</p>
    <h1 id="thuoc-title" tabindex="-1">${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function sortEntries(entries) {
  return [...entries].sort((a, b) => String(b.visitDate || '').localeCompare(String(a.visitDate || ''))
    || String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
}

export function filterEntries(entries, { query = '', month = '', facility = '', category = '' } = {}) {
  const needle = String(query || '').trim().toLowerCase();
  return sortEntries(entries).filter((entry) => {
    if (month && !String(entry.visitDate || '').startsWith(month)) return false;
    if (facility && entry.facility !== facility) return false;
    if (category && entry.category !== category) return false;
    if (!needle) return true;
    const haystack = [entry.name, entry.usage, entry.facility, entry.notes, categoryLabel(entry.category)]
      .join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

function filterOptions(entries) {
  const months = new Set();
  const facilities = new Set();
  const categories = new Set();
  entries.forEach((entry) => {
    const month = String(entry.visitDate || '').slice(0, 7);
    if (month) months.add(month);
    if (entry.facility) facilities.add(entry.facility);
    if (entry.category) categories.add(entry.category);
  });
  return {
    months: [...months].sort().reverse(),
    facilities: [...facilities].sort((a, b) => a.localeCompare(b, 'vi')),
    categories: CATEGORY_ORDER.filter((key) => categories.has(key)),
  };
}

function monthOptionLabelFromKey(key) {
  const [year, month] = key.split('-');
  return `Tháng ${Number(month)}/${year}`;
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function renderRow(entry) {
  const id = escapeHtml(entry.id);
  const categoryGlyph = categoryIcon(entry.category);
  return `<tr>
    <td><span class="thuoc-datatable__date">${escapeHtml(formatDate(entry.visitDate))}</span></td>
    <td><span class="thuoc-datatable__store">${escapeHtml(entry.name || 'Không rõ')}</span><span class="thuoc-cat-chip">${categoryGlyph} ${escapeHtml(categoryLabel(entry.category))}</span></td>
    <td><span class="thuoc-datatable__items">${escapeHtml(entry.usage || '—')}</span></td>
    <td>${escapeHtml(entry.facility || '—')}</td>
    <td>
      <div class="thuoc-row-actions">
        <a class="thuoc-ghost-button" href="#/thuoc/detail/${id}">Chi tiết</a>
        <a class="thuoc-ghost-button" href="#/thuoc/edit/${id}">Sửa</a>
        <button type="button" class="thuoc-ghost-button thuoc-ghost-button--danger" data-delete-entry="${id}" aria-label="Xoá ${escapeHtml(entry.name)}">Xoá</button>
      </div>
    </td>
  </tr>`;
}

function renderRecordCard(entry) {
  const id = escapeHtml(entry.id);
  const categoryGlyph = categoryIcon(entry.category);
  return `<li class="thuoc-record-card">
    <div class="thuoc-record-card__top">
      <span class="thuoc-record-card__store">${escapeHtml(entry.name || 'Không rõ')}</span>
      <span class="thuoc-cat-chip">${categoryGlyph} ${escapeHtml(categoryLabel(entry.category))}</span>
    </div>
    <p class="thuoc-record-card__meta">${icon('calendar', { size: 16 })} ${escapeHtml(formatDate(entry.visitDate))} · ${icon('activity', { size: 16 })} ${escapeHtml(entry.facility || '—')}</p>
    <p class="thuoc-record-card__meta">${escapeHtml(entry.usage || 'Chưa ghi công dụng điều trị.')}</p>
    <div class="thuoc-record-card__actions">
      <a class="thuoc-ghost-button" href="#/thuoc/detail/${id}">Chi tiết</a>
      <a class="thuoc-ghost-button" href="#/thuoc/edit/${id}">Sửa</a>
      <button type="button" class="thuoc-ghost-button thuoc-ghost-button--danger" data-delete-entry="${id}" aria-label="Xoá ${escapeHtml(entry.name)}">Xoá</button>
    </div>
  </li>`;
}

function renderListResults({ allEntries }) {
  const all = allEntries || [];
  const filtered = filterEntries(all, searchState);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, searchState.page), totalPages);
  searchState.page = page;
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let list;
  if (!all.length) {
    list = '<p class="thuoc-empty">Chưa có thuốc nào. Bấm “Thêm thuốc” để bắt đầu ghi tên thuốc và công dụng điều trị.</p>';
  } else if (!filtered.length) {
    list = '<p class="thuoc-empty">Không tìm thấy thuốc phù hợp với bộ lọc.</p>';
  } else {
    list = `<div class="thuoc-datatable-wrap">
      <table class="thuoc-datatable">
        <thead><tr>
          <th scope="col">Ngày đi khám</th>
          <th scope="col">Tên thuốc</th>
          <th scope="col">Công dụng điều trị</th>
          <th scope="col">Cơ sở khám</th>
          <th scope="col">Thao tác</th>
        </tr></thead>
        <tbody>${rows.map(renderRow).join('')}</tbody>
      </table>
    </div>
    <ul class="thuoc-record-cards">${rows.map(renderRecordCard).join('')}</ul>`;
  }

  const pager = totalPages > 1 ? `<nav class="thuoc-pagination" aria-label="Phân trang thuốc">
    <button type="button" class="thuoc-ghost-button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Trước</button>
    ${Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => `<button type="button" class="thuoc-page-button${number === page ? ' is-active' : ''}" data-page="${number}" ${number === page ? 'aria-current="page"' : ''}>${number}</button>`).join('')}
    <button type="button" class="thuoc-ghost-button" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Sau →</button>
  </nav>` : '';

  return `<div data-list-results>
    ${list}
    <p class="thuoc-muted" data-list-count>Hiển thị ${rows.length} / ${filtered.length} thuốc${all.length !== filtered.length ? ` (tổng ${all.length})` : ''}.</p>
    ${pager}
  </div>`;
}

function renderList(root) {
  resetSearchState();
  const state = getThuocState();
  const stats = computeThuocStats(state.entries);
  const { months, facilities, categories } = filterOptions(state.entries);

  root.innerHTML = `<section class="thuoc-screen" aria-labelledby="thuoc-title">
    <div class="thuoc-page-heading thuoc-page-heading--hero">
      <p class="thuoc-eyebrow">BLOGCO · QUẢN LÝ THUỐC</p>
      <h1 id="thuoc-title" tabindex="-1">Quản lý thuốc &amp; công dụng điều trị</h1>
      <p>Ghi lại tên thuốc, công dụng điều trị, ngày đi khám và cơ sở khám. Dữ liệu lưu cục bộ trên thiết bị này.</p>
    </div>

    <div class="thuoc-toolbar">
      <a class="thuoc-primary-button" href="#/thuoc/add">${icon('plus', { size: 16 })} Thêm thuốc</a>
      <a class="thuoc-secondary-button" href="#/thuoc/stats">${icon('barChart', { size: 16 })} Thống kê</a>
      <button type="button" class="thuoc-secondary-button" data-export>${icon('arrowDown', { size: 16 })} Export JSON</button>
      <button type="button" class="thuoc-secondary-button" data-import-trigger>${icon('upload', { size: 16 })} Import</button>
      <button type="button" class="thuoc-secondary-button" data-export-csv>${icon('arrowDown', { size: 16 })} CSV</button>
      <button type="button" class="thuoc-secondary-button thuoc-clear-all" data-clear-all>${icon('trash', { size: 16 })} Xóa toàn bộ dữ liệu / Reset</button>
      <input type="file" accept="application/json,.json" data-import-input hidden aria-label="Chọn file JSON để nhập">
    </div>

    <div class="thuoc-summary-grid" aria-label="Chỉ số thuốc">
      <div class="thuoc-summary-card"><span>Tổng lượt ghi</span><strong>${stats.count}</strong></div>
      <div class="thuoc-summary-card"><span>Số loại thuốc</span><strong>${stats.medicineCount}</strong></div>
      <div class="thuoc-summary-card"><span>Cơ sở khám</span><strong>${stats.facilityCount}</strong></div>
      <div class="thuoc-summary-card"><span>Tháng này</span><strong>${stats.currentMonthCount}</strong></div>
    </div>

    <div class="thuoc-card thuoc-search">
      <label class="thuoc-field thuoc-field--full">
        <span>${icon('search', { size: 16 })} Tìm kiếm</span>
        <input type="search" data-search-input value="${escapeHtml(searchState.query)}" placeholder="Tên thuốc / công dụng / cơ sở khám / ghi chú...">
      </label>
      <div class="thuoc-search__filters">
        <label class="thuoc-field">Tháng
          <select data-filter-month>
            <option value="">Tất cả</option>
            ${months.map((month) => `<option value="${escapeHtml(month)}"${searchState.month === month ? ' selected' : ''}>${escapeHtml(monthOptionLabelFromKey(month))}</option>`).join('')}
          </select>
        </label>
        <label class="thuoc-field">Cơ sở khám
          <select data-filter-facility>
            <option value="">Tất cả</option>
            ${facilities.map((facility) => `<option value="${escapeHtml(facility)}"${searchState.facility === facility ? ' selected' : ''}>${escapeHtml(facility)}</option>`).join('')}
          </select>
        </label>
        <label class="thuoc-field">Nhóm thuốc
          <select data-filter-category>
            <option value="">Tất cả</option>
            ${categories.map((key) => `<option value="${key}"${searchState.category === key ? ' selected' : ''}>${escapeHtml(categoryLabel(key))}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <section class="thuoc-card" aria-label="Danh sách thuốc">
      <div class="thuoc-card-heading">
        <h2>Danh sách thuốc</h2>
        <span class="thuoc-chip">${state.entries.length} lượt ghi</span>
      </div>
      ${renderListResults({ allEntries: state.entries })}
    </section>
    <p class="thuoc-disclaimer">Công cụ ghi chép cá nhân giúp bạn theo dõi thuốc đã dùng. Đây không phải là tư vấn y khoa — hãy hỏi bác sĩ trước khi dùng thuốc.</p>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function renderDetail(root, entryId) {
  const entry = getEntryById(entryId);
  if (!entry) {
    root.innerHTML = `<section class="thuoc-screen">${pageHeader('Không tìm thấy', 'Thuốc cần xem không tồn tại trên thiết bị này.')}</section>${toastMarkup()}`;
    return;
  }
  const categoryGlyph = categoryIcon(entry.category);
  root.innerHTML = `<section class="thuoc-screen" aria-labelledby="thuoc-title">
    <div class="thuoc-page-heading">
      <a class="thuoc-back" href="#/thuoc" aria-label="Quay lại danh sách">← Danh sách</a>
      <p class="thuoc-eyebrow">THUỐC · ${escapeHtml(formatDate(entry.visitDate))}</p>
      <h1 id="thuoc-title" tabindex="-1">${escapeHtml(entry.name || 'Thuốc')}</h1>
      <p><span class="thuoc-cat-chip">${categoryGlyph} ${escapeHtml(categoryLabel(entry.category))}</span></p>
    </div>

    <section class="thuoc-card">
      <dl class="thuoc-detail-list">
        <div><dt>Tên thuốc</dt><dd>${escapeHtml(entry.name || '—')}</dd></div>
        <div><dt>Công dụng điều trị</dt><dd>${escapeHtml(entry.usage || '—')}</dd></div>
        <div><dt>Ngày đi khám</dt><dd>${escapeHtml(formatDate(entry.visitDate))}</dd></div>
        <div><dt>Cơ sở khám</dt><dd>${escapeHtml(entry.facility || '—')}</dd></div>
        <div><dt>Nhóm thuốc</dt><dd>${categoryGlyph} ${escapeHtml(categoryLabel(entry.category))}</dd></div>
        <div><dt>Ghi chú</dt><dd>${escapeHtml(entry.notes || '—')}</dd></div>
      </dl>
    </section>

    <div class="thuoc-actions">
      <a class="thuoc-secondary-button" href="#/thuoc">← Danh sách</a>
      <a class="thuoc-primary-button" href="#/thuoc/edit/${escapeHtml(entry.id)}">Sửa</a>
      <button type="button" class="thuoc-ghost-button thuoc-ghost-button--danger" data-delete-entry="${escapeHtml(entry.id)}">Xoá</button>
    </div>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Add / edit form view
// ---------------------------------------------------------------------------

function renderFormPage(root, entryId = '') {
  const entry = entryId ? getEntryById(entryId) : null;
  if (entryId && !entry) {
    root.innerHTML = `<section class="thuoc-screen">${pageHeader('Không tìm thấy', 'Thuốc cần sửa không tồn tại.')}</section>${toastMarkup()}`;
    return;
  }
  const mode = entryId ? 'edit' : 'add';
  const facilities = filterOptions(getThuocState().entries).facilities;
  const initial = entry || { visitDate: todayKey() };
  root.innerHTML = `<section class="thuoc-screen" aria-labelledby="thuoc-title">
    ${pageHeader(mode === 'edit' ? 'Sửa thông tin thuốc' : 'Thêm thuốc', mode === 'edit' ? `Cập nhật ${entryId}.` : 'Ghi tên thuốc, công dụng điều trị, ngày đi khám và cơ sở khám.')}
    ${renderEntryForm(initial, { mode, facilities })}
  </section>${toastMarkup()}`;
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Stats view
// ---------------------------------------------------------------------------

function renderStats(root) {
  const state = getThuocState();
  const stats = computeThuocStats(state.entries);

  root.innerHTML = `<section class="thuoc-screen" aria-labelledby="thuoc-title">
    ${pageHeader('Thống kê thuốc & điều trị', 'Báo cáo theo tháng, nhóm thuốc và cơ sở khám, kèm phân tích & nhắc nhở tự động.', '/thuoc', true)}
    ${stats.count === 0 ? '<p class="thuoc-empty">Chưa có dữ liệu để thống kê. Hãy thêm thuốc để bắt đầu.</p>' : `
    <div class="thuoc-summary-grid thuoc-summary-grid--stats">
      <div class="thuoc-summary-card"><span>Tổng lượt ghi</span><strong>${stats.count}</strong></div>
      <div class="thuoc-summary-card"><span>Số loại thuốc</span><strong>${stats.medicineCount}</strong></div>
      <div class="thuoc-summary-card"><span>Cơ sở khám</span><strong>${stats.facilityCount}</strong></div>
      <div class="thuoc-summary-card"><span>Tháng này</span><strong>${stats.currentMonthCount}</strong></div>
    </div>
    ${renderThuocDashboard(state.entries)}
    ${renderThuocInsights(state.entries)}`}

    <div class="thuoc-actions"><a class="thuoc-secondary-button" href="#/thuoc">← Danh sách</a>
      <button type="button" class="thuoc-secondary-button thuoc-clear-all" data-clear-all>${icon('trash', { size: 16 })} Xóa toàn bộ dữ liệu / Reset</button></div>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function routeName(root) {
  if (location.hash.startsWith('#/thuoc')) return location.hash.slice(1).replace(/\/$/, '') || '/thuoc';
  const initial = root.dataset.initialRoute;
  const map = { list: '/thuoc', add: '/thuoc/add', stats: '/thuoc/stats', detail: '/thuoc', edit: '/thuoc' };
  return map[initial] || '/thuoc';
}

function showRoute(root) {
  const route = routeName(root);
  const [, , action = '', param = ''] = route.split('/');
  if (action === 'add') renderFormPage(root, '');
  else if (action === 'edit') renderFormPage(root, param);
  else if (action === 'detail') renderDetail(root, param);
  else if (action === 'stats') renderStats(root);
  else renderList(root);
  root.querySelector('h1')?.focus?.({ preventScroll: true });
  if (pendingToast) { showToast(root, pendingToast); pendingToast = ''; }
}

function refreshListResults(root) {
  const container = root.querySelector('[data-list-results]');
  if (!container) return;
  container.outerHTML = renderListResults({ allEntries: getThuocState().entries });
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountThuocApp(root) {
  if (!root) return;
  if (mountedRoots.has(root)) { showRoute(root); return; }
  mountedRoots.add(root);

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-search-input]')) {
      searchState.query = event.target.value;
      searchState.page = 1;
      refreshListResults(root);
      return;
    }
    if (event.target.closest('#thuoc-entry-form')) refreshCategoryChip(event.target.closest('#thuoc-entry-form'));
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-filter-month]')) { searchState.month = target.value; searchState.page = 1; refreshListResults(root); }
    if (target.matches('[data-filter-facility]')) { searchState.facility = target.value; searchState.page = 1; refreshListResults(root); }
    if (target.matches('[data-filter-category]')) { searchState.category = target.value; searchState.page = 1; refreshListResults(root); }
    if (target.matches('[data-import-input]')) {
      const file = target.files?.[0];
      if (!file) return;
      readJsonFile(file).then((parsed) => {
        const list = Array.isArray(parsed) ? parsed : parsed?.entries;
        if (!Array.isArray(list)) throw new Error('File JSON không chứa danh sách thuốc hợp lệ.');
        const result = importEntries(list);
        resetSearchState();
        pendingToast = `Đã nhập ${result.added} mục mới, cập nhật ${result.updated}. Tổng ${result.total}.`;
        showRoute(root);
      }).catch((error) => {
        showToast(root, error.message || 'Không nhập được file.', true);
      }).finally(() => { target.value = ''; });
    }
  });

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (target.closest('[data-export]')) { exportEntries(); return; }
    if (target.closest('[data-export-csv]')) { downloadCsv(); return; }
    if (target.closest('[data-import-trigger]')) { root.querySelector('[data-import-input]')?.click(); return; }
    if (target.closest('[data-ai-refresh]')) {
      const host = root.querySelector('[data-ai-insights]');
      if (host) { host.outerHTML = renderThuocInsights(getThuocState().entries); showToast(root, 'Đã làm mới phân tích.'); }
      return;
    }
    if (target.closest('[data-clear-all]')) {
      if (!window.confirm('Bạn có chắc muốn xóa toàn bộ dữ liệu thuốc không? Hành động này không thể hoàn tác.')) return;
      clearThuocData();
      resetSearchState();
      pendingToast = 'Đã xóa toàn bộ dữ liệu thuốc trên thiết bị này.';
      showRoute(root);
      return;
    }
    const pageButton = target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      searchState.page = Number(pageButton.dataset.page);
      refreshListResults(root);
      root.querySelector('[data-list-results]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const deleteButton = target.closest('[data-delete-entry]');
    if (deleteButton) {
      const id = deleteButton.dataset.deleteEntry;
      if (window.confirm(`Xoá "${id}" khỏi thiết bị này?`)) {
        removeEntry(id);
        if (routeName(root).includes('/detail/')) location.hash = '#/thuoc';
        else showRoute(root);
        showToast(root, `Đã xoá ${id}.`);
      }
      return;
    }
  });

  root.addEventListener('submit', (event) => {
    const form = event.target;
    event.preventDefault();
    if (form.id === 'thuoc-entry-form') {
      try {
        if (!form.reportValidity()) return;
        const input = readEntryForm(form);
        const editingId = routeName(root).includes('/edit/') ? routeName(root).split('/').pop() : '';
        const record = saveEntry(input, editingId);
        pendingToast = `Đã lưu ${record.name}.`;
        resetSearchState();
        location.hash = '#/thuoc';
        if (routeName(root) === '/thuoc') showRoute(root);
      } catch (error) {
        showToast(root, error.message || 'Không lưu được thuốc.', true);
      }
    }
  });

  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#/thuoc')) showRoute(root); });
  window.addEventListener('thuoc:data-changed', () => showRoute(root));
  showRoute(root);
}

export { renderList, renderDetail, renderFormPage, renderStats };
