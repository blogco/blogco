// Add / edit form for a medicine entry: markup + reading the values back.

import { escapeHtml } from './store.js';
import { categoryIcon, categoryLabel, classifyMedicine } from './catalog.js';

function fieldContainer(value) {
  return escapeHtml(value ?? '');
}

export function renderEntryForm(entry = {}, { mode = 'add', facilities = [] } = {}) {
  const category = classifyMedicine(entry.name || '', entry.usage || '');
  const options = facilities.map((facility) => `<option value="${escapeHtml(facility)}"></option>`).join('');
  return `<form id="thuoc-entry-form" class="thuoc-card thuoc-entry-form" novalidate>
    <fieldset class="thuoc-fieldset">
      <legend>${mode === 'edit' ? 'Cập nhật thông tin thuốc' : 'Thông tin thuốc'}</legend>
      <div class="thuoc-form-grid">
        <label class="thuoc-field thuoc-field--full">Tên thuốc <span aria-hidden="true">*</span>
          <input name="name" type="text" maxlength="160" required value="${fieldContainer(entry.name)}" placeholder="Paracetamol 500mg">
        </label>
        <label class="thuoc-field">Ngày đi khám <span aria-hidden="true">*</span>
          <input name="visitDate" type="date" required value="${fieldContainer(entry.visitDate)}">
        </label>
        <label class="thuoc-field">Cơ sở khám <span aria-hidden="true">*</span>
          <input name="facility" type="text" maxlength="200" required value="${fieldContainer(entry.facility)}" placeholder="Bệnh viện / phòng khám" list="thuoc-facility-suggest">
          <datalist id="thuoc-facility-suggest">${options}</datalist>
        </label>
        <label class="thuoc-field thuoc-field--full">Công dụng điều trị
          <textarea name="usage" rows="3" maxlength="800" placeholder="Ví dụ: giảm đau, hạ sốt, kháng viêm...">${fieldContainer(entry.usage)}</textarea>
        </label>
        <label class="thuoc-field thuoc-field--full">Ghi chú (liều dùng, lưu ý)
          <textarea name="notes" rows="2" maxlength="600" placeholder="1 viên × 2 lần/ngày, uống sau ăn...">${fieldContainer(entry.notes)}</textarea>
        </label>
      </div>
      <p class="thuoc-muted">Nhóm thuốc được phân loại tự động: <span class="thuoc-cat-chip" data-cat-chip>${categoryIcon(category)} ${escapeHtml(categoryLabel(category))}</span></p>
    </fieldset>
    <div class="thuoc-actions">
      <button class="thuoc-primary-button" type="submit">${mode === 'edit' ? 'Lưu thay đổi' : 'Lưu thuốc'}</button>
      <a class="thuoc-secondary-button" href="#/thuoc">← Danh sách</a>
    </div>
  </form>`;
}

export function readEntryForm(form) {
  const value = (name) => form.querySelector(`[name="${name}"]`)?.value || '';
  return {
    name: value('name'),
    usage: value('usage'),
    visitDate: value('visitDate'),
    facility: value('facility'),
    notes: value('notes'),
  };
}

export function refreshCategoryChip(form) {
  const chip = form.querySelector('[data-cat-chip]');
  if (!chip) return;
  const category = classifyMedicine(form.querySelector('[name="name"]')?.value || '', form.querySelector('[name="usage"]')?.value || '');
  chip.innerHTML = `${categoryIcon(category)} ${escapeHtml(categoryLabel(category))}`;
}
