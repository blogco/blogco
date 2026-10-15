// Vaccination tracker ("Nhật ký tiêm ngừa") for the Health module.
//
// Routes (hash based, mounted on the shared #/health app root):
//   #/health/vaccine        → list + filters + reminders + inline add/edit form
//
// Data is local-first (localStorage), versioned and mirrored to a backup key,
// exactly like store.js. Pure helpers (normalize/validate/status/filter) are
// exported so they can be unit-tested in Node without a DOM.

import { escapeHtml } from './medicine.js';

const STORAGE_KEY = 'blogco.health.vaccines.v1';
const BACKUP_KEY = 'blogco.health.vaccines.backup.v1';

// Quick-pick injection sites widely used in Vietnam (user can still type others).
export const FACILITY_PRESETS = ['Viện Pasteur', 'VNVC', 'Long Châu'];
export const FACILITY_OTHER = '__other__';

// Common vaccines/diseases offered as autocomplete suggestions.
export const VACCINE_SUGGESTIONS = [
  'Dại', 'Cúm', 'Phế cầu', 'HPV', 'VNMBN', 'Uốn ván', 'Viêm gan B',
  'Sởi - Quai bị - Rubella', 'Thủy đậu', 'Viêm não Nhật Bản', 'COVID-19',
  'Viêm gan A', 'Tả', 'Thương hàn', 'Zona thần kinh', 'RSV',
];

// A next dose within this many days counts as "sắp đến hạn".
export const DUE_WINDOW_DAYS = 30;

let memoryCache;

function blankState() {
  return { version: 1, nextId: 1, records: [] };
}

function text(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function multiline(value, max = 2000) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function normalizeVaccine(input = {}, existing = {}) {
  return {
    id: existing.id || text(input.id, 80),
    vaccine: text(input.vaccine, 160),
    dose: text(input.dose, 80),
    date: text(input.date, 20),
    facility: text(input.facility, 200),
    nextDate: text(input.nextDate, 20),
    notes: multiline(input.notes, 1200),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateVaccine(input = {}) {
  const errors = [];
  if (!text(input.vaccine)) errors.push('Vui lòng nhập tên vắc xin / bệnh.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(input.date, 20))) errors.push('Ngày tiêm chưa hợp lệ.');
  const nextDate = text(input.nextDate, 20);
  if (nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) errors.push('Lịch hẹn mũi kế tiếp chưa hợp lệ.');
  if (errors.length) {
    const error = new Error(errors.join(' '));
    error.errors = errors;
    throw error;
  }
}

// Reminder state for a next-dose date relative to `today`.
//   overdue  → next dose date already passed
//   due      → within DUE_WINDOW_DAYS ahead
//   scheduled→ further in the future
//   none     → no valid next-dose date
export function doseStatus(nextDate, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate || '')) return { state: 'none', days: null };
  const [y, m, d] = nextDate.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((target - start) / 86400000);
  if (days < 0) return { state: 'overdue', days: -days };
  if (days <= DUE_WINDOW_DAYS) return { state: 'due', days };
  return { state: 'scheduled', days };
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const date = String(b.date || '').localeCompare(String(a.date || ''));
    if (date !== 0) return date;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export function filterVaccines(records, { facility = '', vaccine = '', query = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return sortRecords(records).filter((record) => {
    if (facility && record.facility !== facility) return false;
    if (vaccine && record.vaccine !== vaccine) return false;
    if (!needle) return true;
    const haystack = [record.vaccine, record.dose, record.facility, record.notes]
      .join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

export function vaccineReminders(records, today = new Date()) {
  const overdue = [];
  const due = [];
  records.forEach((record) => {
    const status = doseStatus(record.nextDate, today);
    if (status.state === 'overdue') overdue.push({ record, status });
    else if (status.state === 'due') due.push({ record, status });
  });
  const byDays = (a, b) => a.status.days - b.status.days;
  overdue.sort((a, b) => b.status.days - a.status.days); // most overdue first
  due.sort(byDays); // soonest first
  return { overdue, due };
}

export function filterOptions(records) {
  const facilities = new Set();
  const vaccines = new Set();
  records.forEach((record) => {
    if (record.facility) facilities.add(record.facility);
    if (record.vaccine) vaccines.add(record.vaccine);
  });
  return {
    facilities: [...facilities].sort((a, b) => a.localeCompare(b, 'vi')),
    vaccines: [...vaccines].sort((a, b) => a.localeCompare(b, 'vi')),
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function readState() {
  if (memoryCache) return structuredClone(memoryCache);
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    memoryCache = parsed && parsed.version === 1 && Array.isArray(parsed.records)
      ? { ...blankState(), ...parsed }
      : blankState();
  } catch {
    memoryCache = blankState();
  }
  return structuredClone(memoryCache);
}

function writeState(state) {
  const serialized = JSON.stringify(state);
  try {
    localStorage.setItem(BACKUP_KEY, serialized);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    throw new Error('Không thể lưu trên thiết bị này. Hãy kiểm tra dung lượng lưu trữ.');
  }
  memoryCache = structuredClone(state);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('health:data-changed'));
}

export function getVaccines() {
  return readState().records;
}

export function getVaccineById(id) {
  return readState().records.find((record) => record.id === id) || null;
}

function nextRecordId(state, date) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : isoDay(new Date());
  return `vaccine-${safeDate}-${String(state.nextId).padStart(3, '0')}`;
}

export function saveVaccine(input = {}, id = '') {
  validateVaccine(input);
  const state = readState();
  const existingIndex = id ? state.records.findIndex((record) => record.id === id) : -1;
  const existing = existingIndex >= 0 ? state.records[existingIndex] : {};
  const record = normalizeVaccine(input, existing);
  if (!record.id) record.id = nextRecordId(state, record.date);
  if (existingIndex >= 0) {
    record.createdAt = existing.createdAt || record.createdAt;
    state.records[existingIndex] = record;
  } else {
    state.records.push(record);
  }
  state.nextId += 1;
  writeState(state);
  return { ...record };
}

export function removeVaccine(id) {
  const state = readState();
  const before = state.records.length;
  state.records = state.records.filter((record) => record.id !== id);
  if (state.records.length === before) return false;
  writeState(state);
  return true;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(`${dateKey}T12:00:00`));
}

function todayKey() {
  return isoDay(new Date());
}

const STATUS_META = {
  overdue: { label: '⚠️ Quá hạn tiêm nhắc', badge: 'vaccine-badge--danger' },
  due: { label: '🔔 Sắp đến hạn', badge: 'vaccine-badge--warning' },
  scheduled: { label: '🗓️ Đã lên lịch', badge: 'vaccine-badge--muted' },
};

function statusText(nextDate, today) {
  const status = doseStatus(nextDate, today);
  if (status.state === 'none') return null;
  const meta = STATUS_META[status.state];
  const detail = status.state === 'overdue'
    ? `quá ${status.days} ngày`
    : status.state === 'due'
      ? (status.days === 0 ? 'hôm nay' : `còn ${status.days} ngày`)
      : `còn ${status.days} ngày`;
  return { ...meta, detail, status };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const filterState = { facility: '', vaccine: '', query: '' };
let editingId = '';

function facilityOptions(selected) {
  const known = FACILITY_PRESETS.includes(selected);
  const options = FACILITY_PRESETS.map((name) => `<option value="${escapeHtml(name)}"${selected === name ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('');
  const otherSelected = selected && !known;
  return `${options}<option value="${FACILITY_OTHER}"${otherSelected ? ' selected' : ''}>Cơ sở khác…</option>`;
}

function renderReminderBanner(records) {
  const today = new Date();
  const { overdue, due } = vaccineReminders(records, today);
  if (!overdue.length && !due.length) return '';
  const chips = [...overdue, ...due].slice(0, 6).map(({ record, status }) => {
    const meta = STATUS_META[status.state];
    return `<li class="vaccine-reminder__chip ${meta.badge}">
      <span class="vaccine-reminder__chip-name">${escapeHtml(record.vaccine)}${record.dose ? ` · ${escapeHtml(record.dose)}` : ''}</span>
      <span class="vaccine-reminder__chip-due">${status.state === 'overdue' ? `Quá ${status.days} ngày` : (status.days === 0 ? 'Hôm nay' : `Còn ${status.days} ngày`)}</span>
    </li>`;
  }).join('');
  const headline = overdue.length
    ? `⚠️ ${overdue.length} mũi tiêm đã quá hạn nhắc lại`
    : `🔔 ${due.length} mũi tiêm sắp đến hạn`;
  return `<aside class="vaccine-reminder${overdue.length ? ' is-overdue' : ''}" role="status">
    <p class="vaccine-reminder__title">${headline}</p>
    <ul class="vaccine-reminder__list">${chips}</ul>
  </aside>`;
}

function renderForm(record = {}) {
  const editing = Boolean(record.id);
  const facility = record.facility || '';
  const isOther = facility && !FACILITY_PRESETS.includes(facility);
  return `<form class="health-form vaccine-form" data-vaccine-form novalidate>
    <input type="hidden" name="id" value="${escapeHtml(record.id || '')}">
    <fieldset class="health-fieldset">
      <legend>${editing ? 'Chỉnh sửa mũi tiêm' : 'Thêm mũi tiêm mới'}</legend>
      <div class="health-form-grid">
        <label class="health-field">Tên vắc xin / bệnh <span aria-hidden="true">*</span>
          <input type="text" name="vaccine" list="vaccine-suggestions" required value="${escapeHtml(record.vaccine || '')}" placeholder="VD: Dại, Cúm, Phế cầu, HPV…">
        </label>
        <datalist id="vaccine-suggestions">
          ${VACCINE_SUGGESTIONS.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}
        </datalist>
        <label class="health-field">Mũi số
          <input type="text" name="dose" value="${escapeHtml(record.dose || '')}" placeholder="VD: Mũi 1, Mũi 2, Nhắc lại…">
        </label>
        <label class="health-field">Ngày tiêm <span aria-hidden="true">*</span>
          <input type="date" name="date" required value="${escapeHtml(record.date || todayKey())}">
        </label>
        <label class="health-field" data-facility-select> Cơ sở tiêm
          <select name="facility">${facilityOptions(facility)}</select>
        </label>
        <label class="health-field" data-facility-other${isOther ? '' : ' hidden'}>Tên cơ sở khác
          <input type="text" name="facilityOther" value="${escapeHtml(isOther ? facility : '')}" placeholder="VD: Bệnh viện Quận 1…">
        </label>
        <label class="health-field">Lịch hẹn mũi kế tiếp
          <input type="date" name="nextDate" value="${escapeHtml(record.nextDate || '')}">
        </label>
        <label class="health-field health-field--full">Ghi chú / Phản ứng sau tiêm
          <textarea name="notes" rows="3" placeholder="VD: Sốt nhẹ 1 ngày, đau tại chỗ tiêm…">${escapeHtml(record.notes || '')}</textarea>
        </label>
      </div>
      <div class="health-toolbar vaccine-form__actions">
        <button type="submit" class="health-primary-button">${editing ? '💾 Lưu thay đổi' : '＋ Thêm mũi tiêm'}</button>
        <button type="button" class="health-ghost-button" data-vaccine-cancel>Huỷ</button>
      </div>
    </fieldset>
  </form>`;
}

function renderRecordCard(record) {
  const id = escapeHtml(record.id);
  const status = statusText(record.nextDate, new Date());
  const meta = [];
  if (record.dose) meta.push(escapeHtml(record.dose));
  if (record.facility) meta.push(escapeHtml(record.facility));
  return `<li class="vaccine-card">
    <div class="vaccine-card__top">
      <div>
        <h3 class="vaccine-card__title">💉 ${escapeHtml(record.vaccine)}</h3>
        <p class="vaccine-card__meta">${formatDate(record.date)}${meta.length ? ` · ${meta.join(' · ')}` : ''}</p>
      </div>
      ${status ? `<span class="vaccine-badge ${status.badge}">${status.label} · ${status.detail}</span>` : ''}
    </div>
    ${record.nextDate ? `<p class="vaccine-card__next">Mũi kế tiếp: <strong>${formatDate(record.nextDate)}</strong></p>` : ''}
    ${record.notes ? `<p class="vaccine-card__notes">${escapeHtml(record.notes)}</p>` : ''}
    <div class="vaccine-card__actions">
      <button type="button" class="health-ghost-button" data-vaccine-edit="${id}">✏️ Sửa</button>
      <button type="button" class="health-ghost-button health-ghost-button--danger" data-vaccine-delete="${id}">🗑️ Xoá</button>
    </div>
  </li>`;
}

function renderResults(records) {
  const filtered = filterVaccines(records, filterState);
  let list;
  if (!records.length) {
    list = '<p class="health-empty">Chưa có mũi tiêm nào. Bấm “＋ Thêm mũi tiêm” để bắt đầu ghi lại.</p>';
  } else if (!filtered.length) {
    list = '<p class="health-empty">Không tìm thấy mũi tiêm phù hợp với bộ lọc.</p>';
  } else {
    list = `<ul class="vaccine-list">${filtered.map(renderRecordCard).join('')}</ul>`;
  }
  return `<div data-vaccine-results>
    ${list}
    <p class="health-muted">Hiển thị ${filtered.length} / ${records.length} mũi tiêm.</p>
  </div>`;
}

function renderVaccineView(root) {
  const records = getVaccines();
  const { facilities, vaccines } = filterOptions(records);
  const editing = editingId ? getVaccineById(editingId) : null;
  root.innerHTML = `<section class="health-screen vaccine-screen" aria-labelledby="vaccine-title">
    <div class="health-page-heading health-page-heading--hero">
      <a class="health-back" href="#/health/history" aria-label="Quay lại lịch sử khám bệnh">← Lịch sử khám bệnh</a>
      <p class="health-eyebrow">BLOGCO · SỨC KHOẺ</p>
      <h1 id="vaccine-title" tabindex="-1">Nhật ký tiêm ngừa</h1>
      <p>Theo dõi vắc xin &amp; lịch nhắc mũi tiếp theo. Dữ liệu lưu cục bộ trên thiết bị này.</p>
    </div>

    ${renderReminderBanner(records)}

    <p class="vaccine-status" data-vaccine-status role="status" aria-live="polite"></p>

    <div class="health-toolbar">
      <button type="button" class="health-primary-button" data-vaccine-add>＋ Thêm mũi tiêm</button>
      <a class="health-secondary-button" href="#/health/history">🩺 Lịch sử khám bệnh</a>
    </div>

    <section class="health-card vaccine-form-card" data-vaccine-form-card${editing ? '' : ' hidden'} aria-label="Biểu mẫu mũi tiêm">
      ${renderForm(editing || {})}
    </section>

    <div class="health-card health-search">
      <label class="health-field health-field--full">
        <span class="health-search__label">🔍 Tìm kiếm</span>
        <input type="search" data-vaccine-search value="${escapeHtml(filterState.query)}" placeholder="Tên vắc xin / mũi / cơ sở / ghi chú…">
      </label>
      <div class="health-search__filters">
        <label class="health-field">Cơ sở tiêm
          <select data-vaccine-filter-facility>
            <option value="">Tất cả</option>
            ${facilities.map((name) => `<option value="${escapeHtml(name)}"${filterState.facility === name ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}
          </select>
        </label>
        <label class="health-field">Loại vắc xin
          <select data-vaccine-filter-vaccine>
            <option value="">Tất cả</option>
            ${vaccines.map((name) => `<option value="${escapeHtml(name)}"${filterState.vaccine === name ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <section class="health-card" aria-label="Danh sách mũi tiêm">
      ${renderResults(records)}
    </section>
    <p class="health-disclaimer">Công cụ ghi chép cá nhân, không thay thế sổ tiêm chủng chính thức hay tư vấn của nhân viên y tế.</p>
  </section>`;
  const heading = root.querySelector('h1');
  heading?.focus?.({ preventScroll: true });
}

function refreshResults(root) {
  const container = root.querySelector('[data-vaccine-results]');
  if (!container) return;
  container.outerHTML = renderResults(getVaccines());
}

function showForm(root, record = {}) {
  editingId = record.id || '';
  const card = root.querySelector('[data-vaccine-form-card]');
  if (!card) return;
  card.innerHTML = renderForm(record);
  card.hidden = false;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.querySelector('[name="vaccine"]')?.focus();
}

function hideForm(root) {
  editingId = '';
  const card = root.querySelector('[data-vaccine-form-card]');
  if (card) {
    card.hidden = true;
    card.innerHTML = '';
  }
}

function readVaccineForm(form) {
  const facilitySelect = form.querySelector('[name="facility"]');
  const otherInput = form.querySelector('[name="facilityOther"]');
  const facility = facilitySelect?.value === FACILITY_OTHER
    ? (otherInput?.value || '')
    : (facilitySelect?.value || '');
  return {
    id: form.querySelector('[name="id"]')?.value || '',
    vaccine: form.querySelector('[name="vaccine"]')?.value || '',
    dose: form.querySelector('[name="dose"]')?.value || '',
    date: form.querySelector('[name="date"]')?.value || '',
    facility,
    nextDate: form.querySelector('[name="nextDate"]')?.value || '',
    notes: form.querySelector('[name="notes"]')?.value || '',
  };
}

function statusMessage(root, message, isError = false) {
  const el = root.querySelector('[data-vaccine-status]');
  if (el) {
    el.textContent = message;
    el.classList.toggle('is-error', isError);
  }
}

// Wire the view to the shared health app root. Listeners are attached once.
export function mountVaccineView(root) {
  if (!root) return;

  if (!root.__vaccineWired) {
    root.__vaccineWired = true;

    root.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches('[data-vaccine-filter-facility]')) {
        filterState.facility = target.value;
        refreshResults(root);
      } else if (target.matches('[data-vaccine-filter-vaccine]')) {
        filterState.vaccine = target.value;
        refreshResults(root);
      } else if (target.matches('[data-vaccine-form] [name="facility"]')) {
        const other = root.querySelector('[data-vaccine-other]') || root.querySelector('[data-facility-other]');
        if (other) other.hidden = target.value !== FACILITY_OTHER;
        if (target.value === FACILITY_OTHER) root.querySelector('[name="facilityOther"]')?.focus();
      }
    });

    root.addEventListener('input', (event) => {
      if (event.target.matches('[data-vaccine-search]')) {
        filterState.query = event.target.value;
        refreshResults(root);
      }
    });

    root.addEventListener('click', (event) => {
      const target = event.target;
      if (target.closest('[data-vaccine-add]')) {
        showForm(root, {});
        return;
      }
      if (target.closest('[data-vaccine-cancel]')) {
        hideForm(root);
        return;
      }
      const editButton = target.closest('[data-vaccine-edit]');
      if (editButton) {
        const record = getVaccineById(editButton.dataset.vaccineEdit);
        if (record) showForm(root, record);
        return;
      }
      const deleteButton = target.closest('[data-vaccine-delete]');
      if (deleteButton) {
        const record = getVaccineById(deleteButton.dataset.vaccineDelete);
        if (record && window.confirm(`Xoá mũi "${record.vaccine}"${record.dose ? ` (${record.dose})` : ''} khỏi thiết bị này?`)) {
          removeVaccine(record.id);
          hideForm(root);
          renderVaccineView(root);
        }
      }
    });

    root.addEventListener('submit', (event) => {
      const form = event.target;
      if (!form.matches('[data-vaccine-form]')) return;
      event.preventDefault();
      try {
        if (!form.reportValidity()) return;
        const input = readVaccineForm(form);
        saveVaccine(input, input.id);
        hideForm(root);
        renderVaccineView(root);
        statusMessage(root, `Đã lưu mũi tiêm "${input.vaccine}".`);
      } catch (error) {
        statusMessage(root, error.message || 'Không lưu được dữ liệu.', true);
      }
    });
  }

  renderVaccineView(root);
}

export { renderVaccineView };
