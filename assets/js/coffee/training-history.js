// Khu vực lịch sử training: danh sách hoá đơn đã xử lý, bộ lọc, mở lại, xoá.

import { escapeHtml } from './store.js';
import { brandLabel } from './training.js';
import { TRAINING_STATUS } from './training-store.js';
import { VERIFY_STATUS } from './verify.js';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN');
}

function statusChip(status) {
  const meta = TRAINING_STATUS[status] || TRAINING_STATUS.pending;
  return `<span class="coffee-chip is-${meta.tone}">${escapeHtml(meta.label)}</span>`;
}

function verifyChip(verification) {
  const status = verification?.status || 'insufficient';
  const meta = VERIFY_STATUS[status] || VERIFY_STATUS.insufficient;
  return `<span class="coffee-chip is-${meta.tone}" title="Đối chiếu">${escapeHtml(meta.label)}</span>`;
}

export function renderTrainingHistory(records = [], filters = {}) {
  const rows = records.map((record) => `<li class="coffee-history-item" data-history-item="${escapeHtml(record.id)}">
    <div class="coffee-history-item__top">
      <strong>${escapeHtml(record.fileName || record.id)}</strong>
      <span class="coffee-history-item__total">${record.itemCount} sản phẩm</span>
    </div>
    <p class="coffee-history-item__meta">
      ${escapeHtml(brandLabel(record.brand))} · xử lý ${escapeHtml(formatDateTime(record.updatedAt))}
      ${record.editedFieldCount ? ` · sửa ${record.editedFieldCount} trường` : ''}
    </p>
    <p class="coffee-history-item__tags">${statusChip(record.status)} ${verifyChip(record.verification)}</p>
    <div class="coffee-history-item__actions">
      <button type="button" class="coffee-secondary-button" data-open-record="${escapeHtml(record.id)}">Mở lại &amp; chỉnh sửa</button>
      <button type="button" class="coffee-ghost-button coffee-ghost-button--danger" data-delete-record="${escapeHtml(record.id)}">Xoá</button>
    </div>
  </li>`).join('');

  return `<div data-history-body>
    <div class="coffee-history-filters">
      <label class="coffee-field">🔍 Tìm theo tên file / mã
        <input type="search" data-history-search value="${escapeHtml(filters.query || '')}" placeholder="sample.jpg hoặc tr-...">
      </label>
      <label class="coffee-field">Trạng thái
        <select data-history-status>
          <option value="">Tất cả</option>
          ${Object.entries(TRAINING_STATUS).map(([key, meta]) => `<option value="${key}"${filters.status === key ? ' selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
        </select>
      </label>
      <label class="coffee-field">Từ ngày
        <input type="date" data-history-from value="${escapeHtml(filters.from || '')}">
      </label>
      <label class="coffee-field">Đến ngày
        <input type="date" data-history-to value="${escapeHtml(filters.to || '')}">
      </label>
    </div>
    ${records.length
      ? `<ul class="coffee-history-list">${rows}</ul>`
      : '<p class="coffee-empty">Chưa có hoá đơn nào trong lịch sử training. Hãy tải và phân tích một hoá đơn để bắt đầu.</p>'}
  </div>`;
}
