import { escapeHtml } from './medicine.js';

function formatCreatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function matchesQuery(record, query) {
  const needle = String(query || '').trim().toLocaleLowerCase('vi');
  if (!needle) return true;
  return `${record.inputId} ${record.title}`.toLocaleLowerCase('vi').includes(needle);
}

function duplicateStatus(record, duplicates) {
  const matches = duplicates.filter((pair) => pair.first.inputId === record.inputId || pair.second.inputId === record.inputId);
  if (!matches.length) return '<span class="medical-management-unique">✅ Duy nhất</span>';
  const closest = matches.sort((a, b) => b.similarity - a.similarity)[0];
  const other = closest.first.inputId === record.inputId ? closest.second.inputId : closest.first.inputId;
  return `<span class="medical-management-duplicate">⚠️ Trùng với ${escapeHtml(other)} (${closest.percentage}%)</span>`;
}

function duplicateMapMarkup(duplicates) {
  if (!duplicates.length) return '<p class="medical-info-empty">Chưa phát hiện cặp bản ghi trùng lặp trên 80%.</p>';
  return `<ul class="medical-duplicate-map__list">${duplicates.map((pair) => `<li><code>${escapeHtml(pair.first.inputId)}</code><span>⚠️ trùng với</span><code>${escapeHtml(pair.second.inputId)}</code><strong>${pair.percentage}%</strong></li>`).join('')}</ul>`;
}

export function renderDataManagement({ records = [], duplicates = [], query = '', selectedIds = new Set(), tabs = '' } = {}) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const visibleRecords = records.filter((record) => matchesQuery(record, query));
  const visibleIds = visibleRecords.map((record) => record.inputId);
  const visibleSelected = visibleIds.filter((inputId) => selected.has(inputId));
  const allVisibleSelected = visibleRecords.length > 0 && visibleSelected.length === visibleRecords.length;
  const deleteLabel = selected.size ? `🗑️ Xoá mục đã chọn (${selected.size})` : '🗑️ Xoá mục đã chọn';

  const rows = visibleRecords.length
    ? visibleRecords.map((record) => `<tr>
        <td data-label="Chọn"><input type="checkbox" data-medical-management-select="${escapeHtml(record.inputId)}"${selected.has(record.inputId) ? ' checked' : ''} aria-label="Chọn ${escapeHtml(record.inputId)}"></td>
        <td data-label="Input ID"><code>${escapeHtml(record.inputId)}</code></td>
        <td data-label="Tên bệnh / thuốc"><strong>${escapeHtml(record.title)}</strong></td>
        <td data-label="Ngày tạo">${formatCreatedAt(record.createdAt)}</td>
        <td data-label="Trạng thái">${duplicateStatus(record, duplicates)}</td>
        <td data-label="Hành động"><button type="button" class="medical-record-delete" data-medical-delete="${escapeHtml(record.inputId)}" aria-label="Xoá ${escapeHtml(record.title)}">🗑️ Xoá</button></td>
      </tr>`).join('')
    : '<tr><td class="medical-management-empty" colspan="6">Không có bản ghi phù hợp.</td></tr>';

  return `<section class="health-screen medical-screen" aria-labelledby="medical-management-title">
    <div class="health-page-heading health-page-heading--hero">
      <a class="health-back" href="#/health/medical/search">← Tra cứu Y Học</a>
      <p class="health-eyebrow">Y HỌC · QUẢN LÝ DỮ LIỆU</p>
      <h1 id="medical-management-title" tabindex="-1">Quản lý dữ liệu</h1>
      <p>Theo dõi, lọc và xoá các bản ghi tri thức đang lưu trên thiết bị này.</p>
    </div>
    ${tabs}
    <section class="health-card medical-management-card">
      <div class="medical-management-toolbar">
        <label class="health-field medical-management-search">Tìm nhanh
          <input type="search" data-medical-management-search value="${escapeHtml(query)}" placeholder="Input ID hoặc tên bệnh / thuốc">
        </label>
        <button type="button" class="health-primary-button medical-management-delete-selected" data-medical-delete-selected${selected.size ? '' : ' disabled'}>${deleteLabel}</button>
      </div>
      <p class="medical-management-summary">Hiển thị ${visibleRecords.length} / ${records.length} bản ghi · ${duplicates.length} cặp có khả năng trùng.</p>
      <div class="medical-data-table-wrap">
        <table class="medical-data-table">
          <thead><tr>
            <th scope="col"><input type="checkbox" data-medical-management-select-all${allVisibleSelected ? ' checked' : ''} aria-label="Chọn tất cả bản ghi đang hiển thị"></th>
            <th scope="col">Input ID</th><th scope="col">Tên bệnh / thuốc</th><th scope="col">Ngày tạo</th><th scope="col">Trạng thái trùng lặp</th><th scope="col">Hành động</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    <section class="health-card medical-duplicate-map" aria-labelledby="medical-duplicate-map-title">
      <div class="medical-results__head"><h2 id="medical-duplicate-map-title">📌 Bản đồ trùng lặp</h2><span class="health-muted">Ngưỡng &gt; 80%</span></div>
      ${duplicateMapMarkup(duplicates)}
    </section>
    <p class="health-disclaimer">Bản đồ trùng lặp chỉ áp dụng cho dữ liệu Local Storage trên trình duyệt này.</p>
  </section>`;
}
