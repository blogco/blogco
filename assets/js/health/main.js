// Router + view layer for the "Lịch sử khám bệnh" feature.
//
// Routes (hash based, mounted on the home page and dedicated pages):
//   #/health/history        → list + search + export/import
//   #/health/add            → create a visit
//   #/health/edit/:id       → edit a visit
//   #/health/detail/:id     → read-only detail + print
//   #/health/stats          → cost statistics
//   #/health/vaccine        → vaccination tracker (see vaccine.js)

import {
  getHealthState, getVisitById, saveVisit, removeVisit,
  exportVisits, importVisits, readJsonFile, formatVnd, toNumber, computeTotal, computePaid,
} from './store.js';
import { renderVisitForm, readVisitForm, emptyMedicineHtml } from './form.js';
import { renderMedicineRow, readMedicines, renumberMedicineRows, checkInteractions, escapeHtml } from './medicine.js';
import { getICD, searchICD } from './icd.js';
import { computeStats } from './stats.js';
import { recognizeImage, parseInvoiceText } from './ocr.js';
import { mountVaccineView } from './vaccine.js';
import {
  extractMedicalKnowledge, getMedicalEntries, renderMedicalEntry,
  loadRemoteMedicalKnowledge, mergeMedicalEntries, saveMedicalKnowledge,
  searchMedicalKnowledge, seedMedicalKnowledge, syncMedicalKnowledge,
} from './medical.js';
import { getSessionGitHubSettings, saveSessionGitHubSettings } from './github-sync.js';

const mountedRoots = new WeakSet();
const PAGE_SIZE = 6;
let pendingToast = '';
let searchState = { query: '', year: '', facility: '', page: 1 };
let medicalSearchQuery = '';
let medicalRemoteEntries = null;
let medicalRemotePromise = null;
const medicalDrafts = new WeakMap();

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

function formatDate(dateKey, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) return '—';
  return new Intl.DateTimeFormat('vi-VN', options).format(new Date(`${dateKey}T12:00:00`));
}

function genderLabel(gender) {
  return { male: 'Nam', female: 'Nữ', other: 'Khác' }[gender] || '—';
}

// Only allow relative paths and safe schemes for user-supplied invoice URLs
// (imported JSON could otherwise carry a javascript: link).
export function safeUrl(url = '') {
  const value = String(url).trim();
  if (/^(https?:|data:image\/|\/[^/]|\.\/)/i.test(value)) return value;
  return '';
}

function toastMarkup() {
  return '<div class="health-toast" data-health-toast role="status" aria-live="polite" aria-atomic="true"></div>';
}

function showToast(root, text, isError = false) {
  const toast = root.querySelector('[data-health-toast]');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('is-visible'), 4200);
}

function pageHeader(title, description, back = '/health/history') {
  return `<div class="health-page-heading">
    <a class="health-back" href="#${back}" aria-label="Quay lại danh sách">← Quay lại</a>
    <p class="health-eyebrow">BLOGCO · SỨC KHOẺ</p>
    <h1 tabindex="-1">${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Filtering / search
// ---------------------------------------------------------------------------

function sortVisits(visits) {
  return [...visits].sort((a, b) => {
    const date = String(b.visit?.date || '').localeCompare(String(a.visit?.date || ''));
    if (date !== 0) return date;
    return String(b.visit?.time || '').localeCompare(String(a.visit?.time || ''));
  });
}

export function filterVisits(visits, { query = '', year = '', facility = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return sortVisits(visits).filter((visit) => {
    if (year && !String(visit.visit?.date || '').startsWith(year)) return false;
    if (facility && visit.visit?.facility !== facility) return false;
    if (!needle) return true;
    const haystack = [
      visit.patient?.fullName, visit.patient?.patientId, visit.visit?.facility,
      visit.diagnosis?.disease, visit.diagnosis?.icd, visit.diagnosis?.treatment,
      (visit.medicines || []).map((med) => med.name).join(' '),
    ].join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

function filterOptions(visits) {
  const years = new Set();
  const facilities = new Set();
  visits.forEach((visit) => {
    const year = String(visit.visit?.date || '').slice(0, 4);
    if (year) years.add(year);
    if (visit.visit?.facility) facilities.add(visit.visit.facility);
  });
  return {
    years: [...years].sort().reverse(),
    facilities: [...facilities].sort((a, b) => a.localeCompare(b, 'vi')),
  };
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function renderVisitCard(visit) {
  const medicines = visit.medicines || [];
  const total = toNumber(visit.cost?.total);
  const id = escapeHtml(visit.id);
  return `<li class="health-visit-card">
    <div class="health-visit-card__top">
      <p class="health-visit-card__meta">🏥 ${escapeHtml(formatDate(visit.visit?.date))}${visit.visit?.time ? ` · ${escapeHtml(visit.visit.time)}` : ''} · ${escapeHtml(visit.visit?.facility || 'Không rõ cơ sở')}</p>
      <span class="health-badge">ICD: ${escapeHtml(visit.diagnosis?.icd || '—')}</span>
    </div>
    <h2 class="health-visit-card__title">${escapeHtml(visit.diagnosis?.disease || 'Chưa rõ chẩn đoán')}</h2>
    <p class="health-visit-card__patient">👤 ${escapeHtml(visit.patient?.fullName || '—')} · ${escapeHtml(visit.patient?.patientId || '—')}</p>
    <p class="health-visit-card__sum">💰 ${escapeHtml(formatVnd(total))} · 💊 ${medicines.length} loại thuốc</p>
    <div class="health-visit-card__actions">
      <a class="health-text-link" href="#/health/detail/${id}">Xem chi tiết →</a>
      <a class="health-ghost-button" href="#/health/edit/${id}">Sửa</a>
      <button type="button" class="health-ghost-button health-ghost-button--danger" data-delete-visit="${id}" aria-label="Xoá lần khám ${id}">Xoá</button>
    </div>
  </li>`;
}

function renderHistoryResults(state) {
  const all = state.allVisits;
  const current = { ...searchState, page: Number(searchState.page) || 1 };
  const filtered = filterVisits(all, current);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(current.page, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  let list;
  if (!all.length) {
    list = '<p class="health-empty">Chưa có lần khám nào. Bấm “Thêm lần khám mới” để bắt đầu ghi lại.</p>';
  } else if (!filtered.length) {
    list = '<p class="health-empty">Không tìm thấy lần khám phù hợp với bộ lọc.</p>';
  } else {
    list = `<ul class="health-visit-list">${rows.map(renderVisitCard).join('')}</ul>`;
  }

  const pager = totalPages > 1 ? `<nav class="health-pagination" aria-label="Phân trang lần khám">
    <button type="button" class="health-ghost-button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Trước</button>
    ${Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => `<button type="button" class="health-page-button${number === page ? ' is-active' : ''}" data-page="${number}" ${number === page ? 'aria-current="page"' : ''}>${number}</button>`).join('')}
    <button type="button" class="health-ghost-button" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Sau →</button>
  </nav>` : '';

  return `<div data-history-results>
    ${list}
    <p class="health-muted" data-history-count>Hiển thị ${rows.length} / ${filtered.length} lần khám${all.length !== filtered.length ? ` (tổng ${all.length})` : ''}.</p>
    ${pager}
  </div>`;
}

function renderHistory(root) {
  const state = getHealthState();
  const { years, facilities } = filterOptions(state.visits);
  root.innerHTML = `<section class="health-screen" aria-labelledby="health-title">
    <div class="health-page-heading health-page-heading--hero">
      <p class="health-eyebrow">BLOGCO · SỨC KHOẺ</p>
      <h1 id="health-title" tabindex="-1">Lịch sử khám bệnh</h1>
      <p>Lưu trữ và tra cứu các lần khám bệnh của bạn. Dữ liệu lưu cục bộ trên thiết bị này.</p>
    </div>

    <div class="health-toolbar">
      <a class="health-primary-button" href="#/health/add">＋ Thêm lần khám mới</a>
      <button type="button" class="health-secondary-button" data-export>⬇ Export JSON</button>
      <button type="button" class="health-secondary-button" data-import-trigger>⬆ Import</button>
      <a class="health-secondary-button" href="#/health/stats">📊 Thống kê chi phí</a>
      <input type="file" accept="application/json,.json" data-import-input hidden aria-label="Chọn file JSON để nhập">
    </div>

    <div class="health-card health-search">
      <label class="health-field health-field--full">
        <span class="health-search__label">🔍 Tìm kiếm</span>
        <input type="search" data-search-input value="${escapeHtml(searchState.query)}" placeholder="Tên bệnh nhân / mã BN / bệnh / ICD / cơ sở...">
      </label>
      <div class="health-search__filters">
        <label class="health-field">Năm
          <select data-filter-year>
            <option value="">Tất cả</option>
            ${years.map((year) => `<option value="${escapeHtml(year)}"${searchState.year === year ? ' selected' : ''}>${escapeHtml(year)}</option>`).join('')}
          </select>
        </label>
        <label class="health-field">Cơ sở khám
          <select data-filter-facility>
            <option value="">Tất cả</option>
            ${facilities.map((facility) => `<option value="${escapeHtml(facility)}"${searchState.facility === facility ? ' selected' : ''}>${escapeHtml(facility)}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <section class="health-card" aria-label="Danh sách lần khám">
      ${renderHistoryResults({ allVisits: state.visits })}
    </section>
    <p class="health-disclaimer">Công cụ ghi chép cá nhân, không thay thế hồ sơ y tế chính thức hay tư vấn của nhân viên y tế.</p>
  </section>${toastMarkup()}`;
  const heading = root.querySelector('h1');
  if (heading && document.title) heading.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Medical knowledge (offline/local-first)
// ---------------------------------------------------------------------------

function medicalTabs(active) {
  const tab = (key, label, href) => `<a class="medical-tab${active === key ? ' is-active' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="medical-tabs" aria-label="Điều hướng Y Học">
    ${tab('input', '▣ Nhập liệu', '#/health/medical/input')}
    ${tab('search', '⌕ Tra cứu', '#/health/medical/search')}
    ${tab('sync', '⇅ Đồng bộ', '#/health/medical/sync')}
    <button type="button" class="medical-tab" data-medical-refresh>↻ Làm mới online</button>
  </nav>`;
}

function setMedicalProgress(root, visible) {
  const progress = root.querySelector('[data-medical-progress]');
  if (!progress) return;
  progress.hidden = !visible;
  progress.setAttribute('aria-hidden', String(!visible));
}

function renderMedicalPreview(root, entry, collapsed = false, saved = false) {
  const preview = root.querySelector('[data-medical-preview]');
  if (!preview) return;
  preview.classList.toggle('is-collapsed', collapsed);
  preview.innerHTML = `<div class="medical-preview__head"><div><p class="health-eyebrow">STRUCTURED DATA PREVIEW</p><h2>Kết quả phân tích</h2></div><span class="health-badge">${escapeHtml(entry.category)}</span></div>
    <ul class="medical-preview__list">
      <li><strong>Tên bệnh / chủ đề:</strong> ${escapeHtml(entry.title)}</li>
      <li><strong>Triệu chứng:</strong>${entry.symptoms.length ? `<ul>${entry.symptoms.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ' Chưa nhận diện được'}</li>
      <li><strong>Điều trị:</strong>${entry.treatment ? `<ul><li>${escapeHtml(entry.treatment)}</li></ul>` : ' Chưa nhận diện được'}</li>
      <li><strong>Thuốc liên quan:</strong>${entry.relatedMedications.length ? `<ul>${entry.relatedMedications.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ' Chưa nhận diện được'}</li>
    </ul>
    ${saved
      ? '<p class="medical-saved-note">✓ Đã lưu offline và đồng bộ GitHub.</p><div class="health-actions"><button type="button" class="health-secondary-button" data-medical-toggle aria-expanded="false">Mở ra ▼</button><a class="health-ghost-button" href="#/health/medical/search">Tra cứu kho tri thức</a></div>'
      : '<div class="health-actions"><button type="button" class="health-primary-button" data-medical-save>✓ Xác nhận lưu &amp; đồng bộ GitHub</button><button type="button" class="health-ghost-button" data-medical-clear>Nhập lại</button></div>'}`;
  preview.hidden = false;
  const toggle = preview.querySelector('[data-medical-toggle]');
  if (toggle) {
    toggle.textContent = collapsed ? 'Mở ra ▼' : 'Thu gọn ▲';
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }
}

function renderMedicalInput(root) {
  seedMedicalKnowledge();
  root.innerHTML = `<section class="health-screen medical-screen" aria-labelledby="medical-title">
    <div class="health-page-heading health-page-heading--hero">
      <a class="health-back" href="#/health/medical/search">← Tra cứu Y Học</a>
      <p class="health-eyebrow">Y HỌC · NHẬP LIỆU KIẾN THỨC</p>
      <h1 id="medical-title" tabindex="-1">Nhập liệu tri thức</h1>
      <p>Dán văn bản y khoa để phân tích offline. Dữ liệu chỉ lưu trên thiết bị này, không gửi tới API trả phí.</p>
    </div>
    ${medicalTabs('input')}
    <form class="health-card medical-input-form" data-medical-input-form>
      <label class="health-field">Danh mục
        <select name="category"><option>Bệnh lý</option><option>Thuốc</option><option>Dinh dưỡng</option></select>
      </label>
      <label class="health-field medical-raw-field">Dữ liệu thô (Text / Markdown)
        <textarea name="rawContent" rows="12" placeholder="Ví dụ:\nTên bệnh: Cúm mùa\nTriệu chứng: Sốt, ho, đau họng\nĐiều trị: Nghỉ ngơi, uống đủ nước\nThuốc liên quan: Paracetamol, Oseltamivir" required></textarea>
      </label>
      <p class="medical-offline-note">ⓘ Bộ phân tích offline nhận diện các nhãn như “Tên bệnh”, “Triệu chứng”, “Điều trị”, “Thuốc liên quan”. Khi xác nhận, dữ liệu sẽ sync lên GitHub nếu bạn đã <a href="#/blog/new">kết nối token</a>.</p>
      <div class="health-actions"><button type="submit" class="health-primary-button" data-medical-analyze>✦ Phân tích &amp; lưu trữ</button><a class="health-secondary-button" href="#/health/medical/search">Tra cứu kho tri thức</a></div>
      <div class="medical-progress" data-medical-progress hidden aria-hidden="true"><span></span></div>
    </form>
    <section class="health-card medical-preview" data-medical-preview hidden aria-live="polite"></section>
  </section>${toastMarkup()}`;
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}

function renderMedicalSync(root) {
  const settings = getSessionGitHubSettings();
  root.innerHTML = `<section class="health-screen medical-screen" aria-labelledby="medical-title">
    <div class="health-page-heading health-page-heading--hero">
      <a class="health-back" href="#/health/medical/search">← Tra cứu Y Học</a>
      <p class="health-eyebrow">Y HỌC · ĐỒNG BỘ</p>
      <h1 id="medical-title" tabindex="-1">Đồng bộ lên GitHub</h1>
      <p>Đẩy ${getMedicalEntries().length} mục tri thức đang lưu offline lên kho JSON chung để tra cứu online.</p>
    </div>
    ${medicalTabs('sync')}
    <form class="health-card medical-sync-form" data-medical-sync-form>
      <label class="health-field">GitHub Personal Access Token (PAT)
        <input type="password" name="token" data-medical-sync-token value="${escapeHtml(settings.token)}" placeholder="github_pat_…" autocomplete="off">
      </label>
      <div class="medical-sync-grid">
        <label class="health-field">Repository (owner/repo)
          <input type="text" name="repo" data-medical-sync-repo value="${escapeHtml(settings.repo)}" placeholder="username/repo-name" required>
        </label>
        <label class="health-field">Branch
          <input type="text" name="branch" data-medical-sync-branch value="${escapeHtml(settings.branch || 'main')}" placeholder="main" required>
        </label>
      </div>
      <label class="health-field">Đường dẫn file JSON
        <input type="text" name="filePath" data-medical-sync-path value="${escapeHtml(settings.filePath)}" placeholder="static/data/medical-knowledge.json" required>
      </label>
      <p class="medical-security-warning">⚠️ PAT chỉ được giữ trong <code>sessionStorage</code> của tab này và sẽ mất khi đóng tab. Không chia sẻ token hoặc dùng token có quyền rộng hơn cần thiết; nếu token bị lộ, hãy revoke ngay.</p>
      <div class="health-actions"><button type="submit" class="health-primary-button" data-medical-sync-submit>⇅ Đồng bộ lên GitHub</button><a class="health-secondary-button" href="#/health/medical/search">← Tra cứu</a></div>
      <div class="medical-sync-status" data-medical-sync-status role="status" aria-live="polite">Chưa đồng bộ</div>
      <pre class="medical-sync-log" data-medical-sync-log>Log sẽ hiển thị tại đây. Token không được ghi vào log.</pre>
    </form>
  </section>${toastMarkup()}`;
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}

function ensureMedicalRemote(root) {
  if (medicalRemoteEntries !== null || medicalRemotePromise) return;
  medicalRemotePromise = loadRemoteMedicalKnowledge(getSessionGitHubSettings())
    .then((entries) => {
      medicalRemoteEntries = entries;
      medicalRemotePromise = null;
      if (routeName(root) === '/health/medical/search') renderMedicalSearch(root);
    })
    .catch(() => {
      medicalRemoteEntries = [];
      medicalRemotePromise = null;
    });
}

function renderMedicalSearch(root) {
  seedMedicalKnowledge();
  const source = medicalRemoteEntries === null
    ? getMedicalEntries()
    : mergeMedicalEntries(getMedicalEntries(), medicalRemoteEntries);
  const results = searchMedicalKnowledge(medicalSearchQuery, source);
  root.innerHTML = `<section class="health-screen medical-screen" aria-labelledby="medical-title">
    <div class="health-page-heading health-page-heading--hero">
      <a class="health-back" href="#/health/history">← Sức Khoẻ</a>
      <p class="health-eyebrow">Y HỌC · TRA CỨU TRI THỨC</p>
      <h1 id="medical-title" tabindex="-1">Tra cứu Y Học</h1>
      <p>Tìm nhanh theo tên bệnh, triệu chứng, hướng điều trị hoặc thuốc liên quan trong kho cục bộ.</p>
    </div>
    ${medicalTabs('search')}
    <form class="health-card medical-search-form" data-medical-search-form role="search">
      <label class="health-field health-field--full">Từ khoá hoặc câu hỏi
        <input type="search" name="query" data-medical-search-input value="${escapeHtml(medicalSearchQuery)}" placeholder="Ví dụ: thuốc điều trị cúm mùa...">
      </label>
      <div class="health-actions"><button type="submit" class="health-primary-button">⌕ Tìm kiếm</button><a class="health-secondary-button" href="#/health/medical/input">＋ Nhập tri thức</a></div>
    </form>
    <section class="medical-results" aria-live="polite">
      <div class="medical-results__head"><h2>Kết quả</h2><span class="health-muted">${results.length} mục</span></div>
      ${results.length ? results.map(renderMedicalEntry).join('') : '<p class="health-empty">Không tìm thấy tri thức phù hợp. Thử từ khoá khác hoặc nhập dữ liệu mới.</p>'}
    </section>
    <p class="health-disclaimer">Kho tri thức cá nhân chạy offline; nội dung y khoa chỉ mang tính tham khảo, không thay thế tư vấn của nhân viên y tế.</p>
  </section>${toastMarkup()}`;
  root.querySelector('h1')?.focus?.({ preventScroll: true });
  ensureMedicalRemote(root);
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

export function extractFollowUpDays(treatment = '') {
  const match = String(treatment).match(/tái khám[^\d]{0,20}(\d{1,3})\s*ngày/i) || String(treatment).match(/(\d{1,3})\s*ngày[^\n]{0,20}tái khám/i);
  return match ? Number(match[1]) : null;
}

function addDays(dateKey, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '') || !Number.isFinite(days)) return '';
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function renderInvoiceView(title, url) {
  const href = safeUrl(url);
  if (!href) return `<div class="health-invoice-view"><strong>${escapeHtml(title)}</strong><p class="health-muted">Chưa có ảnh.</p></div>`;
  return `<div class="health-invoice-view"><strong>${escapeHtml(title)}</strong><a href="${escapeHtml(href)}" target="_blank" rel="noopener"><img src="${escapeHtml(href)}" alt="${escapeHtml(title)}" loading="lazy"></a></div>`;
}

function renderDetail(root, id) {
  const visit = getVisitById(id);
  if (!visit) {
    root.innerHTML = `<section class="health-screen">${pageHeader('Không tìm thấy', 'Lần khám này không tồn tại trên thiết bị.')}</section>${toastMarkup()}`;
    return;
  }
  const medicines = visit.medicines || [];
  const followUpDays = extractFollowUpDays(visit.diagnosis?.treatment);
  const followUpDate = addDays(visit.visit?.date, followUpDays);
  const interactions = checkInteractions(medicines);
  root.innerHTML = `<section class="health-screen" aria-labelledby="health-title">
    <div class="health-page-heading">
      <a class="health-back" href="#/health/history" aria-label="Quay lại danh sách">← Danh sách</a>
      <p class="health-eyebrow">LẦN KHÁM · ${escapeHtml(formatDate(visit.visit?.date))}</p>
      <h1 id="health-title" tabindex="-1">${escapeHtml(visit.visit?.facility || 'Lần khám bệnh')}</h1>
      <p>${escapeHtml(visit.visit?.address || '')}</p>
    </div>

    <section class="health-card">
      <div class="health-detail-identity">
        <p>👤 <strong>${escapeHtml(visit.patient?.fullName || '—')}</strong> · ${escapeHtml(visit.patient?.patientId || '—')} · ${escapeHtml(visit.patient?.dob ? formatDate(visit.patient.dob) : '—')} · ${escapeHtml(genderLabel(visit.patient?.gender))}</p>
        <p>📅 ${escapeHtml(formatDate(visit.visit?.date))}${visit.visit?.time ? ` · ${escapeHtml(visit.visit.time)}` : ''}${visit.visit?.doctor ? ` · ${escapeHtml(visit.visit.doctor)}` : ''}</p>
      </div>

      <h2 class="health-section-title">Chẩn đoán</h2>
      <dl class="health-detail-list">
        <div><dt>Bệnh</dt><dd>${escapeHtml(visit.diagnosis?.disease || '—')}</dd></div>
        <div><dt>Mã ICD</dt><dd>${escapeHtml(visit.diagnosis?.icd || '—')}${getICD(visit.diagnosis?.icd) ? ` · ${escapeHtml(getICD(visit.diagnosis.icd).name)}` : ''}</dd></div>
        <div><dt>Triệu chứng</dt><dd>${escapeHtml(visit.diagnosis?.symptoms || '—')}</dd></div>
        <div><dt>Hướng điều trị</dt><dd>${escapeHtml(visit.diagnosis?.treatment || '—')}</dd></div>
        ${visit.diagnosis?.notes ? `<div><dt>Ghi chú</dt><dd>${escapeHtml(visit.diagnosis.notes)}</dd></div>` : ''}
      </dl>

      ${followUpDate ? `<p class="health-reminder">🔔 Nhắc tái khám dự kiến: <strong>${escapeHtml(formatDate(followUpDate))}</strong> (sau ${followUpDays} ngày theo hướng điều trị).</p>` : ''}

      <h2 class="health-section-title">Thuốc</h2>
      ${medicines.length ? `<ul class="health-medicine-view">${medicines.map((med) => `<li>
        <strong>💊 ${escapeHtml(med.name)}</strong>
        <span>${escapeHtml(med.dosage || '—')}${med.duration ? ` · ${escapeHtml(med.duration)} ngày` : ''}</span>
        ${med.usage ? `<small>Công dụng: ${escapeHtml(med.usage)}</small>` : ''}
        ${med.notes ? `<small>Ghi chú: ${escapeHtml(med.notes)}</small>` : ''}
      </li>`).join('')}</ul>` : '<p class="health-muted">Không có thuốc được ghi nhận.</p>'}
      ${interactions.length ? `<div class="health-interactions is-visible"><strong>⚠️ Cảnh báo tương tác (tham khảo):</strong><ul>${interactions.map((warning) => `<li>${escapeHtml(warning.pair)} — ${escapeHtml(warning.message)}</li>`).join('')}</ul></div>` : ''}

      <h2 class="health-section-title">Chi phí</h2>
      <dl class="health-detail-list health-detail-list--cost">
        <div><dt>Tiền khám</dt><dd>${escapeHtml(formatVnd(visit.cost?.examFee))}</dd></div>
        <div><dt>Tiền thuốc</dt><dd>${escapeHtml(formatVnd(visit.cost?.medicineFee))}</dd></div>
        <div><dt>Tổng</dt><dd>${escapeHtml(formatVnd(visit.cost?.total))}</dd></div>
        <div><dt>BHYT</dt><dd>${escapeHtml(formatVnd(visit.cost?.insurance))}</dd></div>
        <div><dt>Thực trả</dt><dd><strong>${escapeHtml(formatVnd(visit.cost?.paid))}</strong></dd></div>
      </dl>

      <h2 class="health-section-title">Hoá đơn</h2>
      <div class="health-invoice-view-grid">
        ${renderInvoiceView('Hoá đơn khám', visit.invoices?.examInvoiceUrl)}
        ${renderInvoiceView('Hoá đơn thuốc', visit.invoices?.medicineInvoiceUrl)}
      </div>
    </section>

    <div class="health-actions">
      <a class="health-secondary-button" href="#/health/history">← Danh sách</a>
      <a class="health-primary-button" href="#/health/edit/${escapeHtml(visit.id)}">Sửa</a>
      <button type="button" class="health-secondary-button" data-print>⬇ PDF / In</button>
      <button type="button" class="health-ghost-button health-ghost-button--danger" data-delete-visit="${escapeHtml(visit.id)}">Xoá</button>
    </div>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Stats view
// ---------------------------------------------------------------------------

function renderStats(root) {
  const stats = computeStats(getHealthState().visits);
  const maxMonth = stats.maxMonthTotal || 1;
  const monthRows = stats.byMonth.slice(0, 12).map((month) => {
    const width = Math.round((month.total / maxMonth) * 100);
    return `<li class="health-stat-row">
      <span class="health-stat-row__label">${escapeHtml(month.label)}<small>${month.count} lần khám</small></span>
      <span class="health-stat-bar" role="img" aria-label="${escapeHtml(month.label)}: ${escapeHtml(formatVnd(month.total))}"><span style="width:${width}%"></span></span>
      <strong>${escapeHtml(formatVnd(month.total))}</strong>
    </li>`;
  }).join('');
  const facilityRows = stats.byFacility.slice(0, 8).map((facility) => `<li><span>${escapeHtml(facility.facility)}</span><strong>${escapeHtml(formatVnd(facility.total))} <small>(${facility.count})</small></strong></li>`).join('');
  const diseaseRows = stats.byDisease.slice(0, 8).map((disease) => `<li><span>${escapeHtml(disease.disease)}</span><strong>${disease.count} lần</strong></li>`).join('');

  root.innerHTML = `<section class="health-screen" aria-labelledby="health-title">
    ${pageHeader('Thống kê chi phí', 'Tổng hợp chi phí khám bệnh theo tháng, năm, cơ sở và bệnh.')}
    ${stats.count === 0 ? '<p class="health-empty">Chưa có dữ liệu để thống kê. Thêm một lần khám để bắt đầu.</p>' : `
    <div class="health-summary-grid">
      <div class="health-summary-card"><span>Số lần khám</span><strong>${stats.count}</strong></div>
      <div class="health-summary-card"><span>Tổng chi phí</span><strong>${escapeHtml(formatVnd(stats.totalSpend))}</strong></div>
      <div class="health-summary-card"><span>BHYT chi trả</span><strong>${escapeHtml(formatVnd(stats.totalInsurance))}</strong></div>
      <div class="health-summary-card"><span>Thực trả</span><strong>${escapeHtml(formatVnd(stats.totalPaid))}</strong></div>
      <div class="health-summary-card"><span>Trung bình / lần</span><strong>${escapeHtml(formatVnd(stats.averageSpend))}</strong></div>
      <div class="health-summary-card"><span>Lần tốn nhất</span><strong>${escapeHtml(formatVnd(stats.maxSpend))}</strong></div>
    </div>

    <section class="health-card"><h2 class="health-section-title">Theo tháng</h2>
      <ul class="health-stat-list">${monthRows || '<li class="health-muted">Chưa có dữ liệu.</li>'}</ul>
    </section>

    <div class="health-stats-grid">
      <section class="health-card"><h2 class="health-section-title">Theo năm</h2>
        <ul class="health-stat-simple">${stats.byYear.map((year) => `<li><span>${escapeHtml(year.year)}</span><strong>${escapeHtml(formatVnd(year.total))} <small>(${year.count})</small></strong></li>`).join('') || '<li class="health-muted">—</li>'}</ul>
      </section>
      <section class="health-card"><h2 class="health-section-title">Theo cơ sở khám</h2>
        <ul class="health-stat-simple">${facilityRows || '<li class="health-muted">—</li>'}</ul>
      </section>
      <section class="health-card"><h2 class="health-section-title">Bệnh thường gặp</h2>
        <ul class="health-stat-simple">${diseaseRows || '<li class="health-muted">—</li>'}</ul>
      </section>
    </div>`}
    <div class="health-actions"><a class="health-secondary-button" href="#/health/history">← Danh sách</a></div>
  </section>${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Add / edit form view
// ---------------------------------------------------------------------------

function renderFormPage(root, visitId = '') {
  const visit = visitId ? getVisitById(visitId) : null;
  if (visitId && !visit) {
    root.innerHTML = `<section class="health-screen">${pageHeader('Không tìm thấy', 'Lần khám cần sửa không tồn tại.')}</section>${toastMarkup()}`;
    return;
  }
  const mode = visitId ? 'edit' : 'add';
  const nextId = `visit-${new Date().toISOString().slice(0, 10)}-...`;
  root.innerHTML = `<section class="health-screen" aria-labelledby="health-title">
    ${pageHeader(mode === 'edit' ? 'Sửa lần khám bệnh' : 'Thêm lần khám bệnh', mode === 'edit' ? `Cập nhật thông tin cho ${visitId}.` : `Mã dự kiến: ${nextId}.`, '/health/history')}
    ${renderVisitForm(visit || {}, { mode })}
  </section>${toastMarkup()}`;
  const form = root.querySelector('#health-visit-form');
  if (form) {
    updateCostDisplays(form);
    updateInteractions(form);
    updateMedicineEmpty(form);
  }
  const heading = root.querySelector('h1');
  heading?.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Form live behaviour
// ---------------------------------------------------------------------------

function updateCostDisplays(form) {
  const data = new FormData(form);
  const total = computeTotal({ examFee: data.get('examFee'), medicineFee: data.get('medicineFee') });
  const paid = computePaid({ examFee: data.get('examFee'), medicineFee: data.get('medicineFee'), insurance: data.get('insurance') });
  const totalDisplay = form.querySelector('[data-total-display]');
  const paidDisplay = form.querySelector('[data-paid-display]');
  if (totalDisplay) totalDisplay.value = `${total.toLocaleString('vi-VN')} đ`;
  if (paidDisplay) paidDisplay.value = `${paid.toLocaleString('vi-VN')} đ`;
}

function updateInteractions(form) {
  const box = form.querySelector('[data-interactions]');
  if (!box) return;
  const warnings = checkInteractions(readMedicines(form));
  if (!warnings.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.classList.add('is-visible');
  box.innerHTML = `<strong>⚠️ Cảnh báo tương tác thuốc (tham khảo):</strong><ul>${warnings.map((warning) => `<li>${escapeHtml(warning.pair)} — ${escapeHtml(warning.message)}</li>`).join('')}</ul><small>Đây là kiểm tra thô dựa trên tên thuốc, không thay thế tư vấn dược sĩ/bác sĩ.</small>`;
}

function updateMedicineEmpty(form) {
  const empty = form.querySelector('[data-medicine-empty]');
  if (!empty) return;
  const hasRow = Boolean(form.querySelector('[data-medicine-row]'));
  empty.hidden = hasRow;
}

function fillFieldIfEmpty(form, name, value) {
  if (!value) return false;
  const field = form.querySelector(`[name="${name}"]`);
  if (!field || String(field.value || '').trim()) return false;
  field.value = value;
  return true;
}

// ---------------------------------------------------------------------------
// ICD-10 lookup — autocomplete + fuzzy search in the visit form
// ---------------------------------------------------------------------------

function icdMenu(form) {
  return form?.querySelector('[data-icd-menu]') || null;
}

function icdOptionHtml(entry) {
  const english = entry.en ? `<small>${escapeHtml(entry.en)}</small>` : '';
  const group = entry.group ? `<small class="health-icd-option__group">${escapeHtml(entry.group)}</small>` : '';
  return `<button type="button" class="health-icd-option" role="option" aria-selected="false" data-icd-option data-code="${escapeHtml(entry.code)}" data-name="${escapeHtml(entry.name)}">
    <span class="health-icd-option__code">${escapeHtml(entry.code)}</span>
    <span class="health-icd-option__text">
      <strong>${escapeHtml(entry.name)}</strong>
      ${english}
      ${group}
    </span>
  </button>`;
}

function highlightIcdOption(menu) {
  const options = [...menu.querySelectorAll('[data-icd-option]')];
  const active = Number(menu.dataset.active ?? '0');
  options.forEach((option, index) => {
    const on = index === active;
    option.classList.toggle('is-active', on);
    option.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  options[active]?.scrollIntoView?.({ block: 'nearest' });
}

function showIcdMenu(form, query) {
  const menu = icdMenu(form);
  if (!menu) return;
  const results = searchICD(query, 8);
  menu.innerHTML = results.length
    ? results.map(icdOptionHtml).join('')
    : '<p class="health-icd-empty">Không tìm thấy mã phù hợp. Thử tên bệnh (Việt/Anh) hoặc mã khác.</p>';
  menu.dataset.active = results.length ? '0' : '-1';
  menu.hidden = false;
  form.querySelector('[name="icd"]')?.setAttribute('aria-expanded', 'true');
  highlightIcdOption(menu);
}

function hideIcdMenu(form) {
  const menu = icdMenu(form);
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  menu.innerHTML = '';
  form.querySelector('[name="icd"]')?.setAttribute('aria-expanded', 'false');
}

function chooseIcd(form, option) {
  if (!form || !option) return;
  const code = option.dataset.code || '';
  const name = option.dataset.name || '';
  const input = form.querySelector('[name="icd"]');
  if (input) input.value = code;
  const disease = form.querySelector('[name="disease"]');
  if (disease && name && !disease.value.trim()) disease.value = name;
  const result = form.querySelector('[data-icd-result]');
  if (result) result.innerHTML = `✅ <strong>${escapeHtml(code)}</strong> — ${escapeHtml(name)}`;
  hideIcdMenu(form);
}

function appendMedicine(form, medicine = {}) {
  const list = form.querySelector('[data-medicine-list]');
  if (!list) return;
  const index = list.querySelectorAll('[data-medicine-row]').length;
  list.insertAdjacentHTML('beforeend', renderMedicineRow(medicine, index));
  renumberMedicineRows(form);
  updateMedicineEmpty(form);
  updateInteractions(form);
}

function applyOcrResult(form, result, kind) {
  const filled = [];
  const mark = (label, changed) => { if (changed) filled.push(label); };
  mark('cơ sở khám', fillFieldIfEmpty(form, 'facility', result.facility));
  mark('địa chỉ', fillFieldIfEmpty(form, 'address', result.address));
  mark('ngày khám', fillFieldIfEmpty(form, 'date', result.date));
  mark('giờ khám', fillFieldIfEmpty(form, 'time', result.time));
  mark('họ tên', fillFieldIfEmpty(form, 'fullName', result.patientName));
  mark('mã bệnh nhân', fillFieldIfEmpty(form, 'patientId', result.patientId));
  mark('bác sĩ', fillFieldIfEmpty(form, 'doctor', result.doctor));
  mark('bệnh', fillFieldIfEmpty(form, 'disease', result.disease));
  mark('ICD', fillFieldIfEmpty(form, 'icd', result.icd));

  if (kind === 'exam' && result.amounts?.examFee !== undefined) mark('tiền khám', fillFieldIfEmpty(form, 'examFee', result.amounts.examFee));
  if (kind === 'medicine' && result.amounts?.medicineFee !== undefined) mark('tiền thuốc', fillFieldIfEmpty(form, 'medicineFee', result.amounts.medicineFee));
  if (result.amounts?.insurance !== undefined) mark('BHYT', fillFieldIfEmpty(form, 'insurance', result.amounts.insurance));

  if (Array.isArray(result.medicines) && result.medicines.length) {
    const existing = readMedicines(form);
    if (!existing.length) {
      // Drop the auto-seeded blank row so OCR medicines replace it cleanly.
      form.querySelectorAll('[data-medicine-row]').forEach((row) => {
        const hasValue = [...row.querySelectorAll('input')].some((input) => input.value.trim());
        if (!hasValue) row.remove();
      });
    }
    result.medicines.forEach((med) => appendMedicine(form, med));
    filled.push(`${result.medicines.length} thuốc`);
  }

  updateCostDisplays(form);
  return filled;
}

async function runOcr(root, form, block) {
  const input = block.querySelector('[data-invoice-input]');
  const status = block.querySelector('[data-invoice-status]');
  const file = input?.files?.[0] || block._pendingFile;
  if (!file) {
    if (status) status.textContent = 'Hãy chọn ảnh hoá đơn trước khi OCR.';
    return;
  }
  const kind = block.dataset.invoiceKind;
  if (status) status.textContent = 'Đang tải bộ OCR…';
  try {
    const text = await recognizeImage(file, {
      onProgress: (message) => {
        if (status && message?.status) {
          const percent = message.progress ? ` ${Math.round(message.progress * 100)}%` : '';
          status.textContent = `OCR: ${message.status}${percent}`;
        }
      },
    });
    const textArea = block.querySelector('[name$="OcrText"]');
    if (textArea) textArea.value = text;
    const result = parseInvoiceText(text, kind);
    if (!text.trim()) {
      if (status) status.textContent = 'OCR không đọc được chữ nào. Hãy thử ảnh rõ hơn hoặc nhập tay.';
      return;
    }
    const filled = applyOcrResult(form, result, kind);
    if (status) {
      status.textContent = filled.length
        ? `Đã điền: ${filled.join(', ')}. Kiểm tra lại trước khi lưu.`
        : 'OCR xong nhưng chưa tìm thấy trường mới để điền — bạn kiểm tra phần nội dung bên dưới.';
    }
  } catch (error) {
    if (status) status.textContent = `${error.message} Bạn có thể nhập tay.`;
  }
}

function compressImage(file, maxDim = 1100, quality = 0.7) {
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
  const hint = block.querySelector('.health-dropzone__hint');
  const clear = block.querySelector('[data-invoice-clear]');
  const valueInput = block.querySelector('[data-invoice-value]');
  block._pendingFile = file;
  const dataUrl = await compressImage(file);
  if (preview) {
    preview.src = dataUrl;
    preview.hidden = false;
  }
  if (hint) hint.hidden = true;
  if (clear) clear.hidden = false;
  block.querySelector('[data-dropzone]')?.classList.add('has-image');
  if (valueInput) valueInput.value = dataUrl;
  const status = block.querySelector('[data-invoice-status]');
  if (status) status.textContent = 'Đã nạp ảnh. Bấm “OCR tự động” để trích xuất.';
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function routeName(root) {
  if (location.hash.startsWith('#/health')) return location.hash.slice(1).replace(/\/$/, '') || '/health';
  const initial = root.dataset.initialRoute;
  if (initial) {
    const map = { history: '/health/history', list: '/health/history', add: '/health/add', stats: '/health/stats', vaccine: '/health/vaccine', 'medical-input': '/health/medical/input', 'medical-search': '/health/medical/search', 'medical-sync': '/health/medical/sync' };
    return map[initial] || '/health/history';
  }
  return '/health/history';
}

function showRoute(root) {
  const route = routeName(root);
  const [, , action = 'history', param = ''] = route.split('/');
  const titles = { history: 'Lịch sử khám bệnh', add: 'Thêm lần khám bệnh', edit: 'Sửa lần khám bệnh', detail: 'Chi tiết lần khám', stats: 'Thống kê chi phí', vaccine: 'Nhật ký tiêm ngừa', medical: 'Y Học' };
  document.title = `${titles[action] || 'Lịch sử khám bệnh'} | BlogCo`;

  if (action === 'medical') {
    if (param === 'input') renderMedicalInput(root);
    else if (param === 'sync') renderMedicalSync(root);
    else renderMedicalSearch(root);
  } else if (action === 'add') renderFormPage(root, '');
  else if (action === 'edit') renderFormPage(root, decodeURIComponent(param));
  else if (action === 'detail') renderDetail(root, decodeURIComponent(param));
  else if (action === 'stats') renderStats(root);
  else if (action === 'vaccine') { mountVaccineView(root); return; }
  else renderHistory(root);

  if (pendingToast) {
    const message = pendingToast;
    pendingToast = '';
    showToast(root, message);
  }
  const heading = root.querySelector('h1[tabindex="-1"], h1');
  heading?.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function refreshHistoryResults(root) {
  const container = root.querySelector('[data-history-results]');
  if (!container) return;
  container.outerHTML = renderHistoryResults({ allVisits: getHealthState().visits });
}

export function mountHealthApp(root) {
  if (!root) return;
  if (mountedRoots.has(root)) {
    showRoute(root);
    return;
  }
  mountedRoots.add(root);

  root.addEventListener('input', (event) => {
    const form = event.target.closest('#health-visit-form');
    if (form && ['examFee', 'medicineFee', 'insurance'].includes(event.target.name)) updateCostDisplays(form);
    if (form && event.target.name === 'medName') updateInteractions(form);
    if (form && event.target.name === 'icd') showIcdMenu(form, event.target.value);
    if (event.target.matches('[data-search-input]')) {
      searchState.query = event.target.value;
      searchState.page = 1;
      refreshHistoryResults(root);
    }
  });

  root.addEventListener('focusin', (event) => {
    const input = event.target.closest?.('[name="icd"]');
    const form = input?.closest('#health-visit-form');
    if (form) showIcdMenu(form, input.value);
  });

  root.addEventListener('mousedown', (event) => {
    // Keep focus in the ICD input so the suggestion menu stays open on click.
    if (event.target.closest?.('[data-icd-option]')) event.preventDefault();
  });

  root.addEventListener('keydown', (event) => {
    const input = event.target.closest?.('[name="icd"]');
    const form = input?.closest('#health-visit-form');
    const menu = form && icdMenu(form);
    if (!form || !menu) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (menu.hidden) {
        showIcdMenu(form, input.value);
        return;
      }
      const options = [...menu.querySelectorAll('[data-icd-option]')];
      if (!options.length) return;
      const active = Number(menu.dataset.active ?? '0');
      menu.dataset.active = String(event.key === 'ArrowDown'
        ? Math.min(active + 1, options.length - 1)
        : Math.max(active - 1, 0));
      highlightIcdOption(menu);
      return;
    }
    if (event.key === 'Enter' && !menu.hidden) {
      const options = [...menu.querySelectorAll('[data-icd-option]')];
      const active = Number(menu.dataset.active ?? '0');
      if (options[active]) {
        event.preventDefault();
        chooseIcd(form, options[active]);
      }
      return;
    }
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      hideIcdMenu(form);
    }
  });

  // Close any open ICD menu when clicking outside the combobox.
  root.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-icd-combo]')) return;
    root.querySelectorAll('#health-visit-form').forEach((form) => hideIcdMenu(form));
  });

  root.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.matches('[data-filter-year]')) {
      searchState.year = target.value;
      searchState.page = 1;
      refreshHistoryResults(root);
    }
    if (target.matches('[data-filter-facility]')) {
      searchState.facility = target.value;
      searchState.page = 1;
      refreshHistoryResults(root);
    }
    if (target.matches('[data-invoice-input]')) {
      const block = target.closest('[data-invoice-block]');
      const file = target.files?.[0];
      if (block && file) await handleInvoiceFile(block, file);
    }
    if (target.matches('[data-import-input]')) {
      const file = target.files?.[0];
      if (!file) return;
      try {
        const payload = await readJsonFile(file);
        const result = importVisits(payload);
        pendingToast = `Đã nhập ${result.added} lần khám mới, cập nhật ${result.updated}. Tổng ${result.total}.`;
        searchState = { query: '', year: '', facility: '', page: 1 };
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
    if (zone) {
      event.preventDefault();
      zone.classList.add('is-dragover');
    }
  });
  root.addEventListener('dragleave', (event) => {
    const zone = event.target.closest('[data-dropzone]');
    if (zone) zone.classList.remove('is-dragover');
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

    const medicalSave = target.closest('[data-medical-save]');
    if (medicalSave) {
      const draft = medicalDrafts.get(root);
      if (!draft) return;
      try {
        setMedicalProgress(root, true);
        const saved = saveMedicalKnowledge(draft);
        medicalSave.disabled = true;
        medicalSave.textContent = 'Đang đồng bộ GitHub…';
        const synced = await syncMedicalKnowledge();
        medicalRemoteEntries = synced.items;
        medicalRemotePromise = null;
        medicalDrafts.delete(root);
        renderMedicalPreview(root, saved, true, true);
        showToast(root, `Đã lưu và đồng bộ “${saved.title}” lên GitHub (${synced.count} mục).`);
      } catch (error) {
        showToast(root, `Đã lưu offline nhưng chưa sync được. ${error.message || ''}`.trim(), true);
      } finally {
        setMedicalProgress(root, false);
        medicalSave.disabled = false;
        medicalSave.textContent = '✓ Xác nhận lưu & đồng bộ GitHub';
      }
      return;
    }
    if (target.closest('[data-medical-toggle]')) {
      const preview = root.querySelector('[data-medical-preview]');
      if (!preview) return;
      const collapsed = !preview.classList.contains('is-collapsed');
      preview.classList.toggle('is-collapsed', collapsed);
      const toggle = preview.querySelector('[data-medical-toggle]');
      if (toggle) {
        toggle.textContent = collapsed ? 'Mở ra ▼' : 'Thu gọn ▲';
        toggle.setAttribute('aria-expanded', String(!collapsed));
      }
      return;
    }
    if (target.closest('[data-medical-refresh]')) {
      medicalRemoteEntries = null;
      medicalRemotePromise = null;
      if (routeName(root) === '/health/medical/search') renderMedicalSearch(root);
      else {
        ensureMedicalRemote(root);
        showToast(root, 'Đang làm mới dữ liệu online…');
      }
      return;
    }
    if (target.closest('[data-medical-clear]')) {
      medicalDrafts.delete(root);
      root.querySelector('[data-medical-input-form]')?.reset();
      const preview = root.querySelector('[data-medical-preview]');
      if (preview) preview.hidden = true;
      return;
    }

    const icdOption = target.closest('[data-icd-option]');
    if (icdOption) {
      chooseIcd(icdOption.closest('#health-visit-form'), icdOption);
      return;
    }
    if (target.closest('[data-add-medicine]')) {
      const form = target.closest('#health-visit-form');
      if (form) {
        appendMedicine(form, {});
        form.querySelector('[data-medicine-row]:last-of-type [name="medName"]')?.focus();
      }
      return;
    }
    const removeMedicine = target.closest('[data-remove-medicine]');
    if (removeMedicine) {
      const form = removeMedicine.closest('#health-visit-form');
      removeMedicine.closest('[data-medicine-row]')?.remove();
      if (form) {
        renumberMedicineRows(form);
        updateMedicineEmpty(form);
        updateInteractions(form);
      }
      return;
    }
    if (target.closest('[data-icd-lookup]')) {
      const form = target.closest('#health-visit-form');
      const result = form?.querySelector('[data-icd-result]');
      const input = form?.querySelector('[name="icd"]');
      const code = input?.value || '';
      const entry = getICD(code);
      if (result) {
        if (entry) {
          result.innerHTML = `✅ <strong>${escapeHtml(entry.code)}</strong> — ${escapeHtml(entry.name)} <span class="health-muted">(${escapeHtml(entry.group)})</span>`;
          const disease = form.querySelector('[name="disease"]');
          if (disease && !disease.value.trim()) disease.value = entry.name;
        } else {
          const suggestions = searchICD(code, 5).map((item) => `${item.code} — ${item.name}`);
          result.innerHTML = code.trim() ? `Không khớp chính xác.${suggestions.length ? ` Gợi ý: ${suggestions.map(escapeHtml).join(' · ')}` : ' Hãy kiểm tra lại mã.'}` : 'Nhập mã ICD để tra cứu.';
        }
      }
      input?.focus();
      showIcdMenu(form, code);
      return;
    }

    const ocrButton = target.closest('[data-invoice-ocr]');
    if (ocrButton) {
      const block = ocrButton.closest('[data-invoice-block]');
      const form = target.closest('#health-visit-form');
      if (block && form) await runOcr(root, form, block);
      return;
    }
    const clearButton = target.closest('[data-invoice-clear]');
    if (clearButton) {
      const block = clearButton.closest('[data-invoice-block]');
      await applyClearInvoice(block);
      return;
    }
    if (target.closest('[data-export]')) {
      exportVisits();
      return;
    }
    if (target.closest('[data-import-trigger]')) {
      root.querySelector('[data-import-input]')?.click();
      return;
    }
    if (target.closest('[data-print]')) {
      window.print();
      return;
    }

    const pageButton = target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      searchState.page = Number(pageButton.dataset.page);
      refreshHistoryResults(root);
      root.querySelector('[data-history-results]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const deleteButton = target.closest('[data-delete-visit]');
    if (deleteButton) {
      const id = deleteButton.dataset.deleteVisit;
      if (window.confirm(`Xoá lần khám ${id} khỏi thiết bị này?`)) {
        removeVisit(id);
        if (routeName(root).includes('/detail/')) {
          location.hash = '#/health/history';
        } else {
          showRoute(root);
        }
        showToast(root, `Đã xoá ${id}.`);
      }
    }
  });

  root.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.matches('[data-medical-sync-form]')) {
      event.preventDefault();
      const button = form.querySelector('[data-medical-sync-submit]');
      const status = form.querySelector('[data-medical-sync-status]');
      const log = form.querySelector('[data-medical-sync-log]');
      const setSyncFeedback = (state, message, lines) => {
        status.className = `medical-sync-status${state ? ` is-${state}` : ''}`;
        status.textContent = message;
        log.textContent = lines.join('\n');
      };
      const token = form.elements.token.value.trim();
      const settings = {
        token,
        repo: form.elements.repo.value.trim(),
        branch: form.elements.branch.value.trim(),
        filePath: form.elements.filePath.value.trim(),
      };
      button.disabled = true;
      button.textContent = 'Đang đồng bộ…';
      setSyncFeedback('syncing', 'Đang đồng bộ', [
        '[1/4] Đọc Structured Data từ localStorage…',
        `[2/4] Kiểm tra file ${settings.filePath} trên GitHub…`,
        '[3/4] Mã hoá JSON Base64 và cập nhật bằng PUT…',
      ]);
      try {
        saveSessionGitHubSettings(settings);
        syncMedicalKnowledge(settings).then((result) => {
          medicalRemoteEntries = result.items;
          medicalRemotePromise = null;
          setSyncFeedback('success', 'Đồng bộ thành công', [
            '[1/4] Đã đọc dữ liệu local.',
            `[2/4] Đã xử lý SHA file ${result.created ? '(tạo file mới)' : '(cập nhật file cũ)'}.`,
            `[3/4] Đã gửi ${result.count} mục JSON lên GitHub.`,
            `[4/4] Commit hoàn tất${result.commit ? `: ${result.commit}` : '.'}`,
          ]);
        }).catch((error) => {
          setSyncFeedback('error', 'Đồng bộ lỗi', [
            '[1/4] Đã đọc dữ liệu local.',
            '[2/4] GitHub từ chối hoặc không thể truy cập file.',
            `[Lỗi] ${error.message || 'Không rõ nguyên nhân.'}`,
          ]);
        }).finally(() => {
          button.disabled = false;
          button.textContent = '⇅ Đồng bộ lên GitHub';
        });
      } catch (error) {
        setSyncFeedback('error', 'Đồng bộ lỗi', [`[Lỗi] ${error.message || 'Không lưu được cấu hình phiên.'}`]);
        button.disabled = false;
        button.textContent = '⇅ Đồng bộ lên GitHub';
      }
      return;
    }
    if (form.matches('[data-medical-input-form]')) {
      event.preventDefault();
      const button = form.querySelector('[data-medical-analyze]');
      if (button?.disabled) return;
      button.disabled = true;
      button.textContent = 'Đang phân tích…';
      setMedicalProgress(root, true);
      window.setTimeout(() => {
        try {
          const entry = extractMedicalKnowledge(form.elements.rawContent.value, form.elements.category.value);
          medicalDrafts.set(root, entry);
          renderMedicalPreview(root, entry);
        } catch (error) {
          showToast(root, error.message || 'Không phân tích được dữ liệu.', true);
        } finally {
          setMedicalProgress(root, false);
          button.disabled = false;
          button.textContent = '✦ Phân tích & lưu trữ';
        }
      }, 40);
      return;
    }
    if (form.matches('[data-medical-search-form]')) {
      event.preventDefault();
      medicalSearchQuery = form.elements.query.value.trim();
      showRoute(root);
      return;
    }
    if (form.id !== 'health-visit-form') return;
    event.preventDefault();
    try {
      if (!form.reportValidity()) return;
      const input = readVisitForm(form);
      const record = saveVisit(input, input.id);
      pendingToast = `Đã lưu lần khám ${record.id} · ${record.diagnosis.disease}.`;
      searchState = { query: '', year: '', facility: '', page: 1 };
      location.hash = '#/health/history';
      if (routeName(root) === '/health/history') showRoute(root);
    } catch (error) {
      showToast(root, error.message || 'Không lưu được dữ liệu.', true);
    }
  });

  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/health')) showRoute(root);
  });
  window.addEventListener('health:data-changed', () => {
    if (routeName(root) === '/health/medical/input' && medicalDrafts.has(root)) return;
    showRoute(root);
  });
  showRoute(root);
}

async function applyClearInvoice(block) {
  const preview = block.querySelector('[data-invoice-preview]');
  const hint = block.querySelector('.health-dropzone__hint');
  const clear = block.querySelector('[data-invoice-clear]');
  const valueInput = block.querySelector('[data-invoice-value]');
  const status = block.querySelector('[data-invoice-status]');
  block._pendingFile = null;
  if (preview) {
    preview.src = '';
    preview.hidden = true;
  }
  if (hint) hint.hidden = false;
  if (clear) clear.hidden = true;
  block.querySelector('[data-dropzone]')?.classList.remove('has-image');
  if (valueInput) valueInput.value = '';
  if (status) status.textContent = 'Đã xoá ảnh hoá đơn.';
}

// Exported for the toolbar buttons (used by tests / future wiring).
export { renderHistory, renderDetail, renderStats, renderFormPage, applyOcrResult };
