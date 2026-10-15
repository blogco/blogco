// Bảng sản phẩm có thể chỉnh sửa trực tiếp (render + đọc lại). Tách khỏi
// training-view.js để component không quá lớn.

import { escapeHtml } from './store.js';
import { CATEGORY_LABELS } from './menu.js';

export function formatMoneyInput(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Math.round(number).toLocaleString('vi-VN');
}

export function parseMoneyInput(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/[^\d-]/g, '');
  if (digits === '' || digits === '-') return null;
  const number = Number(digits);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function confidenceBadge(confidence) {
  const percent = Math.round((Number(confidence) || 0) * 100);
  const tone = percent >= 80 ? 'is-success' : percent >= 55 ? 'is-warning' : 'is-danger';
  return `<span class="coffee-chip ${tone}" title="Độ tin cậy do hệ thống ước lượng">${percent}%</span>`;
}

function categoryOptions(current) {
  return Object.entries(CATEGORY_LABELS)
    .map(([key, label]) => `<option value="${key}"${key === current ? ' selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

export function renderItemsTable(items = []) {
  if (!items.length) {
    return `<p class="coffee-empty" data-items-empty>Chưa có sản phẩm nào được nhận diện. Hãy kiểm tra khu vực “Các dòng AI chưa phân loại chắc chắn” hoặc bấm “Thêm sản phẩm thủ công”.</p>`;
  }
  const rows = items.map((item, index) => {
    const status = item.needsReview
      ? '<span class="coffee-chip is-warning" title="Thiếu số lượng hoặc đơn giá">Cần kiểm tra</span>'
      : '<span class="coffee-chip is-success">Hợp lệ</span>';
    const manual = item.manuallyAdded ? '<span class="coffee-chip coffee-chip--muted" title="Người dùng bổ sung">Thêm tay</span>' : '';
    const note = item.reviewReason ? `<small class="coffee-table__note">${escapeHtml(item.reviewReason)}</small>` : '';
    const modifiers = item.modifiers?.length
      ? `<small class="coffee-table__note">Tùy chọn: ${escapeHtml(item.modifiers.join(', '))}</small>` : '';
    return `<tr data-item-row data-item-id="${escapeHtml(item.id)}">
      <td class="coffee-num">${index + 1}</td>
      <td class="coffee-cell-name">
        <input type="text" data-item-field="name" maxlength="160" value="${escapeHtml(item.name)}" placeholder="Tên sản phẩm" aria-label="Tên sản phẩm dòng ${index + 1}">
        ${modifiers}${note}
      </td>
      <td><input class="coffee-num" type="text" inputmode="numeric" data-item-field="quantity" value="${item.quantity ?? ''}" placeholder="?" aria-label="Số lượng dòng ${index + 1}"></td>
      <td><input class="coffee-num" type="text" inputmode="numeric" data-item-field="unitPrice" value="${formatMoneyInput(item.unitPrice)}" placeholder="?" aria-label="Đơn giá gốc dòng ${index + 1}"></td>
      <td><input class="coffee-num" type="text" inputmode="numeric" data-item-field="discountAmount" value="${formatMoneyInput(item.discountAmount)}" aria-label="Giảm giá dòng ${index + 1}"></td>
      <td class="coffee-num coffee-cell-net" data-net-for="${escapeHtml(item.id)}">${item.netAmount === null ? '—' : item.netAmount.toLocaleString('vi-VN')}</td>
      <td><select data-item-field="category" aria-label="Nhóm sản phẩm dòng ${index + 1}">${categoryOptions(item.category)}</select></td>
      <td>${confidenceBadge(item.confidence)}</td>
      <td>${status} ${manual}</td>
      <td><button type="button" class="coffee-ghost-button coffee-ghost-button--danger coffee-item-delete" data-remove-item="${escapeHtml(item.id)}" aria-label="Xoá dòng ${index + 1}">✕</button></td>
    </tr>`;
  }).join('');

  return `<div class="coffee-table-wrap coffee-training-table-wrap">
    <table class="coffee-table coffee-training-table">
      <thead><tr>
        <th>STT</th><th>Tên sản phẩm</th><th class="coffee-num">SL</th>
        <th class="coffee-num">Đơn giá gốc</th><th class="coffee-num">Giảm giá</th>
        <th class="coffee-num">Thành tiền sau giảm</th><th>Nhóm</th><th>Độ tin cậy</th>
        <th>Trạng thái</th><th>Thao tác</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
