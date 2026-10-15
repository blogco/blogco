// Trang "AI Training — Huấn luyện đọc hoá đơn" (#/coffee/training).
//
// Workbench 7 bước: tải hoá đơn → AI phân tích → sửa dữ liệu → xác minh →
// xác nhận dữ liệu chuẩn → đưa vào tập training → xem kết quả. Logic thuần nằm ở
// extract/verify/training-model/training-store; component bảng ở training-table.js;
// lịch sử ở training-history.js. Ở đây chỉ dựng markup + nối sự kiện.

import { escapeHtml, formatVnd, toNumber } from './store.js';
import { recognizeReceipt, isPdf, pdfToPageCanvases } from './ocr.js';
import { LINE_TYPES, LINE_TYPE_LABELS } from './extract.js';
import {
  BRANDS, brandLabel, brandSlug, loadPatterns, learnFromSample, nextSampleId,
  saveTrainingSample, getSaveMode, hasGitHubToken, setGitHubToken, loadTrainingIndex,
  accuracyFromCount, applyLearnedFixes,
} from './training.js';
import {
  createSession, recompute as recomputeSession, updateItem, addManualItem, removeItem, reclassifyLine,
  buildLabeledFields, editedFieldCount, canConfirm, reviewFields, clone,
} from './training-model.js';
import {
  listTrainingRecords, getTrainingRecord, saveTrainingRecord, removeTrainingRecord,
  sessionFromRecord, filterTrainingRecords, TRAINING_STATUS,
} from './training-store.js';
import { VERIFY_STATUS, verifyLine } from './verify.js';
import { renderItemsTable, formatMoneyInput, parseMoneyInput } from './training-table.js';
import { renderTrainingHistory } from './training-history.js';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const OCR_MAX_PDF_PAGES = 5;
const PREVIEW_MAX_PDF_PAGES = 8;
const ACCEPTED = /(image\/(png|jpe?g|webp|bmp|gif)|application\/pdf)/i;
const DATASET_IMAGE_MAX_DIM = 1000;
const DATASET_IMAGE_QUALITY = 0.72;

// Băm rẻ, tất định — đủ để định danh ảnh trong dataset (không dùng cho bảo mật).
function hashString(value = '') {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không đọc được ảnh hoá đơn.'));
    image.src = url;
  });
}

// Đóng gói cặp (Ảnh hoá đơn + dữ liệu chuẩn) thành dataset: ảnh được nén thành
// data URL JPEG gọn nhẹ để nhét vừa file JSON commit lên GitHub.
async function buildDatasetImage({ file, previewPages = [] } = {}) {
  if (typeof document === 'undefined') return '';
  const renderedPage = previewPages.find((page) => String(page.url).startsWith('data:'));
  if (renderedPage) return renderedPage.url;
  if (!file || !/^image\//i.test(file.type || '')) return '';
  try {
    const source = await readFileDataUrl(file);
    const image = await loadImageElement(source);
    const scale = Math.min(1, DATASET_IMAGE_MAX_DIM / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', DATASET_IMAGE_QUALITY);
  } catch {
    return '';
  }
}

function verifyChip(status) {
  const meta = VERIFY_STATUS[status] || VERIFY_STATUS.insufficient;
  return `<span class="coffee-chip is-${meta.tone}">${escapeHtml(meta.label)}</span>`;
}

function statusChip(state) {
  const map = {
    idle: ['muted', 'Sẵn sàng'],
    analyzing: ['warning', 'Đang xử lý'],
    ready: ['success', 'Sẵn sàng'],
    saving: ['warning', 'Đang lưu'],
    saved: ['success', 'Đã lưu'],
    error: ['danger', 'Lỗi'],
  };
  const [tone, label] = map[state.status] || map.idle;
  return `<span class="coffee-chip is-${tone}" data-header-status>${escapeHtml(label)}</span>`;
}

function receiptInput(field, value, label, { suffix = 'đ', placeholder = '?' } = {}) {
  return `<label class="coffee-field coffee-reconcile__field">${escapeHtml(label)}
    <span class="coffee-money-input"><input type="text" inputmode="numeric" data-receipt-field="${field}" value="${formatMoneyInput(value)}" placeholder="${placeholder}"><span aria-hidden="true">${escapeHtml(suffix)}</span></span>
  </label>`;
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

export function renderTrainingPage() {
  return `<section class="coffee-screen" data-training aria-labelledby="coffee-title">
    <div class="coffee-page-heading coffee-training-head">
      <a class="coffee-back" href="#/coffee" aria-label="Quay lại">← Quay lại</a>
      <p class="coffee-eyebrow">BLOGCO · CHI PHÍ CÀ PHÊ</p>
      <h1 id="coffee-title" tabindex="-1">AI Training – Huấn luyện đọc hoá đơn</h1>
      <p>Tải hoá đơn mẫu, để AI trích xuất, sửa lại cho đúng rồi xác nhận thành dữ liệu chuẩn. Dữ liệu đã xác nhận được lưu vào tập training để cải thiện OCR — mô hình chỉ được huấn luyện lại khi pipeline backend thực sự hỗ trợ.</p>
      <div class="coffee-training-head__status">
        <span data-header-status-slot>${statusChip({ status: 'idle' })}</span>
        <span class="coffee-chip coffee-chip--muted" data-header-counts>0 hoá đơn · 0 chờ xác nhận · 0 cần sửa</span>
      </div>
      <div class="coffee-invoice__actions">
        <button type="button" class="coffee-secondary-button" data-toggle-history>🕘 Lịch sử training</button>
      </div>
    </div>

    <p class="coffee-training-alert" data-training-alert role="status" aria-live="polite" hidden></p>

    <section class="coffee-card coffee-training-step" data-upload-card>
      <div class="coffee-card-heading"><h2 class="coffee-section-title">1 · Tải hoá đơn</h2><span class="coffee-chip coffee-chip--muted">PDF · PNG · JPG</span></div>
      <div data-upload-body></div>
    </section>

    <section class="coffee-training-workspace" data-workspace hidden>
      <ol class="coffee-steps" data-steps aria-label="Tiến trình training">
        <li data-step="upload">Tải lên</li>
        <li data-step="analyze">AI phân tích</li>
        <li data-step="edit">Sửa dữ liệu</li>
        <li data-step="verify">Xác minh</li>
        <li data-step="confirm">Xác nhận</li>
        <li data-step="train">Tập training</li>
      </ol>

      <div class="coffee-tabs" role="tablist" data-tabs>
        <button type="button" role="tab" class="coffee-tab is-active" data-tab="invoice">Hoá đơn gốc</button>
        <button type="button" role="tab" class="coffee-tab" data-tab="data">Dữ liệu nhận diện</button>
      </div>

      <div class="coffee-training-grid" data-grid>
        <div class="coffee-training-col coffee-training-col--invoice" data-invoice-viewer></div>
        <div class="coffee-training-col coffee-training-col--data" data-data-col>
          <section class="coffee-card coffee-training-panel" aria-label="Bảng sản phẩm">
            <div class="coffee-card-heading"><h2 class="coffee-section-title">2 · Sản phẩm nhận diện</h2><span data-items-summary></span></div>
            <div class="coffee-invoice__actions">
              <button type="button" class="coffee-secondary-button" data-add-item>＋ Thêm sản phẩm thủ công</button>
              <button type="button" class="coffee-ghost-button" data-undo disabled>↶ Hoàn tác xoá/sửa</button>
            </div>
            <div data-items-table></div>
          </section>

          <section class="coffee-card coffee-training-panel" aria-label="Các dòng chưa phân loại">
            <div class="coffee-card-heading"><h2 class="coffee-section-title">3 · Các dòng AI chưa phân loại chắc chắn</h2></div>
            <p class="coffee-muted">Đổi loại cho từng dòng nếu AI hiểu sai. Dòng không phải sản phẩm sẽ không bị tính vào số món.</p>
            <div data-lines-panel></div>
          </section>

          <section class="coffee-card coffee-training-panel" aria-label="Dữ liệu gốc để kiểm tra">
            <div class="coffee-card-heading"><h2 class="coffee-section-title">Kiểm tra dữ liệu gốc</h2></div>
            <p class="coffee-muted">Ba lớp dữ liệu để truy vết lỗi: <strong>Raw OCR</strong> → <strong>JSON trích xuất ban đầu</strong> → <strong>dữ liệu cuối trên bảng</strong>.</p>
            <div data-debug-panel></div>
          </section>

          <section class="coffee-card coffee-training-panel" aria-label="Đối chiếu hoá đơn">
            <div class="coffee-card-heading"><h2 class="coffee-section-title">4 · Đối chiếu hoá đơn</h2><span data-reconcile-chip></span></div>
            <div data-reconcile-panel></div>
          </section>

          <section class="coffee-card coffee-training-panel" aria-label="Xác nhận và lưu">
            <div class="coffee-card-heading"><h2 class="coffee-section-title">5 · Xác nhận dữ liệu chuẩn</h2></div>
            <div data-confirm-panel></div>
            <div class="coffee-workflow-actions">
              <button type="button" class="coffee-secondary-button" data-save-draft>💾 Lưu bản nháp</button>
              <button type="button" class="coffee-primary-button" data-confirm disabled>✅ Xác nhận dữ liệu chuẩn</button>
            </div>
          </section>
        </div>
      </div>
    </section>

    <section class="coffee-card coffee-training-step" data-trainset-card hidden>
      <div class="coffee-card-heading"><h2 class="coffee-section-title">6 · Đưa vào tập training</h2></div>
      <p class="coffee-muted">Dữ liệu đã xác nhận được lưu thành mẫu chuẩn (ground truth). Việc này <strong>không</strong> huấn luyện lại mô hình ngay — mẫu được dùng để cải thiện OCR ở pipeline backend.</p>
      <div data-trainset-body></div>
    </section>

    <section class="coffee-card coffee-training-step" data-history-card hidden>
      <div class="coffee-card-heading"><h2 class="coffee-section-title">7 · Lịch sử training &amp; quản lý dữ liệu mẫu</h2></div>
      <div data-history></div>
    </section>

    <div class="coffee-actions"><a class="coffee-secondary-button" href="#/coffee">← Danh sách hoá đơn</a></div>
  </section>
  <div class="coffee-toast" data-coffee-toast role="status" aria-live="polite" aria-atomic="true"></div>`;
}

// ---------------------------------------------------------------------------
// Mount / wiring
// ---------------------------------------------------------------------------

export async function mountTraining(root) {
  const container = root.querySelector('[data-training]');
  if (!container) return;

  const state = {
    session: null,
    file: null,
    previewUrl: '',
    previewPages: [],
    zoom: 1,
    status: 'idle',
    progress: '',
    pageCount: 0,
    totalPages: 0,
    undoStack: [],
    filters: { query: '', status: '', from: '', to: '' },
    brand: 'highlands',
    patterns: {},
    activeTab: 'invoice',
    trainsetStatus: '',
  };

  const $ = (selector) => container.querySelector(selector);
  const alertBox = $('[data-training-alert]');

  function showToast(text, isError = false) {
    const toast = root.querySelector('[data-coffee-toast]');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-visible');
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove('is-visible'), 4500);
  }

  function setAlert(text, tone = 'warning') {
    if (!alertBox) return;
    if (!text) { alertBox.hidden = true; alertBox.textContent = ''; return; }
    alertBox.hidden = false;
    alertBox.textContent = text;
    alertBox.dataset.tone = tone;
  }

  function pushUndo() {
    if (!state.session) return;
    state.undoStack.push(clone({ items: state.session.items, receipt: state.session.receipt, lines: state.session.lines, meta: state.session.meta }));
    if (state.undoStack.length > 30) state.undoStack.shift();
    const undo = $('[data-undo]');
    if (undo) undo.disabled = false;
  }

  function currentBrand() { return state.brand; }

  // --- Upload render -------------------------------------------------------
  function renderUpload() {
    const body = $('[data-upload-body]');
    if (!body) return;
    if (!state.file) {
      body.innerHTML = `
        <label class="coffee-dropzone" data-dropzone>
          <input type="file" accept="application/pdf,.pdf,image/png,image/jpeg,image/jpg,image/webp" data-file-input hidden aria-label="Chọn hoá đơn PDF/ảnh">
          <span class="coffee-dropzone__hint">
            <span aria-hidden="true">📥</span>
            <span>Kéo hoá đơn PDF/ảnh vào đây hoặc bấm để chọn</span>
            <small>PDF · PNG · JPG/JPEG · tối đa 15MB</small>
          </span>
        </label>`;
      return;
    }
    const sizeKb = Math.max(1, Math.round((state.file.size || 0) / 1024));
    body.innerHTML = `
      <div class="coffee-file-row">
        <span aria-hidden="true">📄</span>
        <div><strong>${escapeHtml(state.file.name)}</strong><small>${sizeKb.toLocaleString('vi-VN')} KB · ${escapeHtml(state.file.type || 'không rõ định dạng')}</small></div>
        <span class="coffee-chip ${state.status === 'analyzing' ? 'is-warning' : 'is-success'}">${state.status === 'analyzing' ? 'Đang xử lý' : 'Đã nạp'}</span>
      </div>
      ${state.progress ? `<div class="coffee-progress" role="progressbar" aria-label="Tiến trình xử lý"><span style="width:${state.progressPercent || 0}%"></span></div><p class="coffee-muted">${escapeHtml(state.progress)}</p>` : ''}
      ${state.totalPages > OCR_MAX_PDF_PAGES ? `<p class="coffee-training-alert" data-tone="warning">⚠️ Hoá đơn ${state.totalPages} trang nhưng chỉ ${OCR_MAX_PDF_PAGES} trang đầu được OCR. Hãy kiểm tra kỹ phần bị bỏ qua.</p>` : ''}
      <div class="coffee-invoice__actions">
        <button type="button" class="coffee-primary-button" data-analyze ${state.status === 'analyzing' ? 'disabled' : ''}>🔍 Phân tích hoá đơn</button>
        <button type="button" class="coffee-ghost-button" data-replace>Thay file</button>
        <button type="button" class="coffee-ghost-button coffee-ghost-button--danger" data-clear-file>Huỷ</button>
        <input type="file" accept="application/pdf,.pdf,image/png,image/jpeg,image/jpg,image/webp" data-file-input hidden aria-label="Chọn hoá đơn khác">
      </div>`;
  }

  // --- Viewer render -------------------------------------------------------
  function renderViewer() {
    const viewer = $('[data-invoice-viewer]');
    if (!viewer) return;
    const pages = state.previewPages.length
      ? state.previewPages
      : (state.previewUrl ? [{ url: state.previewUrl, label: 'Trang 1' }] : []);
    if (!pages.length) {
      viewer.innerHTML = `<section class="coffee-card coffee-training-panel"><p class="coffee-empty">Chưa có bản xem trước hoá đơn.</p></section>`;
      return;
    }
    viewer.innerHTML = `<section class="coffee-card coffee-training-panel coffee-invoice-viewer">
      <div class="coffee-card-heading"><h2 class="coffee-section-title">Hoá đơn gốc</h2>
        <div class="coffee-viewer-zoom">
          <button type="button" class="coffee-ghost-button" data-zoom="-1" aria-label="Thu nhỏ">−</button>
          <span data-zoom-label>${Math.round(state.zoom * 100)}%</span>
          <button type="button" class="coffee-ghost-button" data-zoom="1" aria-label="Phóng to">＋</button>
        </div>
      </div>
      <div class="coffee-invoice-scroll" data-invoice-scroll>
        ${pages.map((page) => `<figure class="coffee-invoice-page"><img src="${escapeHtml(page.url)}" alt="${escapeHtml(page.label || 'Hoá đơn')}" style="width:${Math.round(state.zoom * 100)}%"><figcaption>${escapeHtml(page.label || '')}</figcaption></figure>`).join('')}
      </div>
    </section>`;
  }

  // --- Items table render --------------------------------------------------
  function renderTable() {
    const host = $('[data-items-table]');
    if (host) host.innerHTML = renderItemsTable(state.session.items);
    const summary = $('[data-items-summary]');
    if (summary) {
      const count = state.session.items.length;
      const flagged = state.session.items.filter((item) => item.needsReview).length;
      summary.innerHTML = `<span class="coffee-chip coffee-chip--muted">${count} sản phẩm</span>${flagged ? ` <span class="coffee-chip is-warning">${flagged} cần kiểm tra</span>` : ''}`;
    }
    const undo = $('[data-undo]');
    if (undo) undo.disabled = state.undoStack.length === 0;
  }

  // --- Lines panel ---------------------------------------------------------
  function renderLines() {
    const host = $('[data-lines-panel]');
    if (!host) return;
    const types = state.session.lines;
    const uncertain = types.filter((line) => ['unknown', 'modifier'].includes(line.type));
    const others = types.filter((line) => !['unknown', 'modifier'].includes(line.type));
    const lineRow = (line) => {
      const status = verifyLine(line);
      return `<li class="coffee-line" data-line-index="${line.index}">
      <span class="coffee-line__text" title="${escapeHtml(line.text)}">${escapeHtml(line.text || '(dòng trống)')}</span>
      <span class="coffee-chip is-${escapeHtml(status.tone)}" data-line-verify>${escapeHtml(status.label)}</span>
      ${line.amount !== null ? `<span class="coffee-line__amount">${line.amount.toLocaleString('vi-VN')} đ</span>` : ''}
      <select data-line-type="${line.index}" aria-label="Loại của dòng ${line.index + 1}">
        ${LINE_TYPES.map(([key, label]) => `<option value="${key}"${line.type === key ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select>
    </li>`;
    };
    host.innerHTML = `
      ${uncertain.length
        ? `<ul class="coffee-line-list">${uncertain.map(lineRow).join('')}</ul>`
        : '<p class="coffee-muted">Không còn dòng nào chưa phân loại chắc chắn.</p>'}
      <details class="coffee-lines-all"><summary>Xem tất cả ${types.length} dòng OCR</summary>
        <ul class="coffee-line-list">${others.map(lineRow).join('') || '<li class="coffee-muted">—</li>'}</ul>
      </details>`;
  }

  // --- Reconcile panel -----------------------------------------------------
  function renderReconcile() {
    const host = $('[data-reconcile-panel]');
    if (!host) return;
    const v = state.session.verification;
    const r = state.session.receipt;
    const netRows = state.session.items.filter((item) => item.netAmount !== null);
    const related = v.status === 'mismatch'
      ? state.session.items.filter((item) => item.needsReview || item.discountAmount > 0)
      : [];
    host.innerHTML = `
      <dl class="coffee-reconcile-list">
        <div><dt>Tổng tiền hàng trước giảm <small>(AI tính)</small></dt><dd>${formatVnd(v.grossSum)}</dd></div>
        <div><dt>Tổng giảm giá <small>(AI tính)</small></dt><dd>${v.discountTotal ? `− ${formatVnd(v.discountTotal)}` : '0 đ'}</dd></div>
        <div><dt>Thành tiền sau giảm <small>(AI tính)</small></dt><dd>${formatVnd(v.netSum)}</dd></div>
        <div><dt>Tổng tiền AI tính</dt><dd><strong>${formatVnd(v.computedTotal)}</strong></dd></div>
        <div><dt>Tổng tiền trên hoá đơn <small>(OCR)</small></dt><dd>${v.printedTotal === null ? '—' : formatVnd(v.printedTotal)}</dd></div>
        <div><dt>Chênh lệch</dt><dd class="${v.discrepancy ? 'is-danger' : ''}">${v.discrepancy === null ? '—' : `${v.discrepancy > 0 ? '+' : ''}${formatVnd(v.discrepancy)}`}</dd></div>
      </dl>
      <p class="coffee-reconcile-msg is-${VERIFY_STATUS[v.status]?.tone || 'muted'}">${escapeHtml((v.messages || [])[0] || '')}</p>
      ${related.length ? `<p class="coffee-muted">Dòng có khả năng liên quan: ${escapeHtml(related.map((item) => item.name || '?').join(', '))}</p>` : ''}
      <details class="coffee-reconcile-edit"><summary>Chỉnh số liệu OCR (thuế, phí, giảm giá, tổng)</summary>
        <div class="coffee-form-grid coffee-reconcile__grid">
          ${receiptInput('levelDiscount', r.levelDiscount, 'Giảm giá cấp hoá đơn')}
          ${receiptInput('tax', r.tax, 'Thuế (VAT)')}
          ${receiptInput('fee', r.fee, 'Phí / dịch vụ')}
          ${receiptInput('subtotal', r.subtotal, 'Tổng tiền hàng (OCR)')}
          ${receiptInput('total', r.total, 'Tổng thanh toán (OCR)')}
        </div>
      </details>`;
    const chip = $('[data-reconcile-chip]');
    if (chip) chip.innerHTML = verifyChip(v.status);
  }

  // --- Confirm panel -------------------------------------------------------
  function renderConfirm() {
    const host = $('[data-confirm-panel]');
    if (!host) return;
    const reviews = reviewFields(state.session);
    const ok = canConfirm(state.session);
    host.innerHTML = ok
      ? '<p class="coffee-reconcile-msg is-success">✅ Dữ liệu đã khớp và đủ điều kiện xác nhận.</p>'
      : `<p class="coffee-reconcile-msg is-warning">Chưa thể xác nhận. Còn ${reviews.length || state.session.items.length} mục cần kiểm tra:</p>
         <ul class="coffee-review-list">${reviews.slice(0, 8).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>Cần bổ sung sản phẩm hoặc tổng thanh toán.</li>'}</ul>
         <p class="coffee-muted">Bạn vẫn có thể lưu bản nháp; các mục chưa xác minh sẽ được ghi rõ.</p>`;
    const confirmBtn = $('[data-confirm]');
    if (confirmBtn) confirmBtn.disabled = !ok;
  }

  function renderHeaderCounts() {
    const records = listTrainingRecords();
    const pending = records.filter((record) => record.status === 'pending' || record.status === 'draft').length;
    const needsFix = records.filter((record) => record.verification?.status && record.verification.status !== 'verified').length;
    const slot = $('[data-header-counts]');
    if (slot) slot.textContent = `${records.length} hoá đơn · ${pending} chờ xác nhận · ${needsFix} cần sửa`;
    const statusSlot = $('[data-header-status-slot]');
    if (statusSlot) statusSlot.innerHTML = statusChip(state);
  }

  function renderTrainset() {
    const host = $('[data-trainset-body]');
    if (!host) return;
    const mode = getSaveMode();
    const modeLabel = mode === 'cms' ? 'CMS local → GitHub'
      : mode === 'github' ? 'GitHub API (PAT)'
      : 'tải file JSON để commit thủ công';
    host.innerHTML = `
      <div class="coffee-form-grid">
        <label class="coffee-field">Thương hiệu
          <select data-brand-select>
            ${BRANDS.map((brand) => `<option value="${brand.id}"${brand.id === state.brand ? ' selected' : ''}>${escapeHtml(brand.label)}</option>`).join('')}
          </select>
        </label>
        <label class="coffee-field">GitHub token (contents:write) — chỉ lưu trên thiết bị
          <input type="password" data-trainset-token autocomplete="off" placeholder="${hasGitHubToken() ? '••••••••' : 'ghp_… (bỏ trống nếu dùng CMS/tải file)'}">
        </label>
      </div>
      <p class="coffee-muted">Chế độ lưu hiện tại: <strong>${escapeHtml(modeLabel)}</strong>.</p>
      <div class="coffee-invoice__actions">
        <button type="button" class="coffee-primary-button" data-add-training ${canConfirm(state.session) ? '' : 'disabled'}>🧠 Đưa vào tập training</button>
        <button type="button" class="coffee-secondary-button" data-export-sample>💾 Export mẫu</button>
      </div>
      ${state.trainsetStatus ? `<p class="coffee-invoice__status">${escapeHtml(state.trainsetStatus)}</p>` : ''}
      <div data-training-progress></div>`;
  }

  function renderHistory() {
    const host = $('[data-history]');
    if (!host) return;
    const records = filterTrainingRecords(listTrainingRecords(), state.filters);
    host.innerHTML = renderTrainingHistory(records, state.filters);
  }

  // --- Debug: raw OCR → raw extraction → final UI data ---------------------
  function renderDebug() {
    const host = $('[data-debug-panel]');
    if (!host) return;
    if (!state.session) { host.innerHTML = '<p class="coffee-empty">Chưa có dữ liệu.</p>'; return; }
    const original = state.session.original || {};
    const extraction = original.extraction || {};
    const rawOcr = original.rawOcrText || state.session.rawText || '';
    const rawExtraction = {
      receipt: original.receipt || {},
      items: original.items || [],
      validation: extraction.validation || {},
      adjustments: extraction.adjustments || [],
    };
    const finalUi = state.session.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      netAmount: item.netAmount,
    }));
    const block = (title, value) => `<h3 class="coffee-section-title">${escapeHtml(title)}</h3><pre class="coffee-debug__pre">${escapeHtml(value)}</pre>`;
    host.innerHTML = `<details class="coffee-debug">
      <summary>🔎 Xem Raw OCR · JSON trích xuất · Dữ liệu cuối</summary>
      ${block('1 · Raw OCR (trước khi trích xuất)', rawOcr.slice(0, 6000))}
      ${block('2 · JSON trích xuất ban đầu', JSON.stringify(rawExtraction, null, 2).slice(0, 8000))}
      ${block('3 · Dữ liệu cuối trên bảng', JSON.stringify(finalUi, null, 2))}
    </details>`;
  }

  function renderWorkspaceVisibility() {
    const workspace = $('[data-workspace]');
    const trainset = $('[data-trainset-card]');
    const ready = Boolean(state.session);
    if (workspace) workspace.hidden = !ready;
    if (trainset) trainset.hidden = !ready;
  }

  function renderAll() {
    renderUpload();
    renderWorkspaceVisibility();
    if (state.session) {
      renderViewer();
      renderTable();
      renderLines();
      renderReconcile();
      renderConfirm();
      renderTrainset();
      renderDebug();
    }
    renderHeaderCounts();
    renderHistory();
    applyTab();
  }

  function applyTab() {
    const grid = $('[data-grid]');
    if (grid) grid.dataset.active = state.activeTab;
    container.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tab === state.activeTab);
    });
  }

  // --- Derived refresh (không re-render input để giữ focus) ----------------
  function refreshDerived() {
    if (!state.session) return;
    state.session = recalcSession(state.session);
    state.session.items.forEach((item) => {
      const cell = container.querySelector(`[data-net-for="${CSS.escape(item.id)}"]`);
      if (cell) cell.textContent = item.netAmount === null ? '—' : item.netAmount.toLocaleString('vi-VN');
      const row = container.querySelector(`[data-item-row][data-item-id="${CSS.escape(item.id)}"]`);
      if (row) {
        const v = item.verification || {};
        const expr = row.querySelector('[data-verify-expr]');
        const statusChip = row.querySelector('[data-verify-status]');
        if (expr) expr.textContent = v.expression || 'Chưa đủ dữ liệu để đối chiếu';
        if (statusChip) {
          statusChip.className = `coffee-chip is-${v.tone || 'muted'}`;
          statusChip.textContent = v.label || 'Cần kiểm tra';
        }
      }
    });
    const summary = $('[data-items-summary]');
    if (summary) {
      const flagged = state.session.items.filter((item) => item.needsReview).length;
      summary.innerHTML = `<span class="coffee-chip coffee-chip--muted">${state.session.items.length} sản phẩm</span>${flagged ? ` <span class="coffee-chip is-warning">${flagged} cần kiểm tra</span>` : ''}`;
    }
    renderReconcile();
    renderConfirm();
    const addTrain = $('[data-add-training]');
    if (addTrain) addTrain.disabled = !canConfirm(state.session);
  }

  // recalc wrapper (dùng updateItem để đảm bảo recompute)
  function recalcSession(session) {
    // recompute qua updateItem không phù hợp; dùng recompute trực tiếp.
    return recomputeSession(session);
  }

  // --- File handling -------------------------------------------------------
  function resetFile() {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.file = null;
    state.previewUrl = '';
    state.previewPages = [];
    state.progress = '';
    state.status = 'idle';
    state.totalPages = 0;
    state.zoom = 1;
    setAlert('');
    renderAll();
  }

  async function buildPreview(file) {
    state.previewPages = [];
    if (isPdf(file)) {
      try {
        const { canvases, total } = await pdfToPageCanvases(file, { maxPages: PREVIEW_MAX_PDF_PAGES, scale: 1.6 });
        state.totalPages = total;
        state.previewPages = canvases.map((canvas, index) => ({ url: canvas.toDataURL('image/jpeg', 0.82), label: `Trang ${index + 1}/${total}` }));
      } catch (error) {
        setAlert(`Không xem trước được PDF: ${error.message}`, 'danger');
      }
    } else if (state.previewUrl) {
      state.previewPages = [{ url: state.previewUrl, label: 'Ảnh hoá đơn' }];
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (!(ACCEPTED.test(file.type) || isPdf(file) || /\.(png|jpe?g|webp|pdf)$/i.test(file.name))) {
      setAlert('Định dạng không hỗ trợ. Chỉ nhận PDF, PNG, JPG/JPEG, WebP.', 'danger');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setAlert(`File ${Math.round(file.size / 1024 / 1024)}MB vượt giới hạn 15MB.`, 'danger');
      return;
    }
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.file = file;
    state.status = 'idle';
    state.progress = '';
    state.session = null;
    state.undoStack = [];
    setAlert('');
    if (!isPdf(file)) state.previewUrl = URL.createObjectURL(file);
    else state.previewUrl = '';
    await buildPreview(file);
    renderAll();
    const first = $('[data-analyze]');
    first?.focus?.({ preventScroll: true });
    setAlert('Đã nạp file. Bấm “Phân tích hoá đơn” để trích xuất — thao tác này chưa đưa dữ liệu vào tập training.', 'info');
  }

  // --- Analyze -------------------------------------------------------------
  async function analyze() {
    if (!state.file) return;
    state.status = 'analyzing';
    state.progress = 'Đang tải bộ OCR…';
    state.progressPercent = 8;
    renderUpload();
    try {
      const { text, pages } = await recognizeReceipt(state.file, {
        maxPdfPages: OCR_MAX_PDF_PAGES,
        onProgress: (message) => {
          if (message?.status) {
            state.progress = `OCR: ${message.status}${message.progress ? ` ${Math.round(message.progress * 100)}%` : ''}`;
            state.progressPercent = message.progress ? Math.max(8, Math.round(message.progress * 100)) : state.progressPercent;
            renderUpload();
          }
        },
      });
      if (!text.trim()) {
        state.status = 'error';
        state.progress = '';
        renderAll();
        setAlert('OCR không đọc được chữ nào. Hãy thử ảnh rõ hơn hoặc kiểm tra file.', 'danger');
        return;
      }
      // Áp bảng sửa lỗi tiếng Việt đã học trước khi trích xuất.
      let ocrText = text;
      try {
        const { data: patterns } = await loadPatterns(currentBrand());
        state.patterns = patterns || {};
        ocrText = applyLearnedFixes(text, patterns?.vietnameseFixes || {});
      } catch { /* dùng text gốc */ }

      state.session = createSession(ocrText, {
        fileName: state.file.name,
        fileSize: state.file.size,
        pageCount: state.pageCount,
        pageWarning: state.totalPages > OCR_MAX_PDF_PAGES ? `Chỉ OCR ${OCR_MAX_PDF_PAGES}/${state.totalPages} trang` : '',
        brand: currentBrand(),
      });
      // Giữ raw OCR (mỗi trang + phương thức đọc + bbox dòng) để truy vết lỗi.
      state.session.original.rawOcrText = text;
      state.session.original.pages = pages.map((page) => ({
        pageNumber: page.pageNumber,
        method: page.method,
        text: page.text,
        lines: page.lines,
      }));
      state.undoStack = [];
      state.status = 'ready';
      state.progress = '';
      setAlert('');
      renderAll();
      const totalSlots = $('[data-workspace]')?.querySelector('[data-reconcile-chip]')?.innerHTML || '';
      showToast(`Đã phân tích: ${state.session.items.length} sản phẩm. Kiểm tra và xác nhận.`);
      void totalSlots;
    } catch (error) {
      state.status = 'error';
      state.progress = '';
      renderAll();
      setAlert(`${error.message} Bạn có thể thử lại hoặc dùng file khác.`, 'danger');
    }
  }

  // --- Save / confirm ------------------------------------------------------
  function persist(status, note = '') {
    if (!state.session) return;
    state.session.editedFieldCount = editedFieldCount(state.session);
    state.session.status = status;
    try {
      const record = saveTrainingRecord(state.session, { status, note });
      state.session.id = record.id;
      showToast(status === 'confirmed' ? 'Đã lưu và xác nhận dữ liệu chuẩn.' : 'Đã lưu bản nháp.');
      renderHeaderCounts();
      renderHistory();
      return record;
    } catch (error) {
      setAlert(error.message || 'Không lưu được dữ liệu.', 'danger');
      showToast(error.message || 'Không lưu được dữ liệu.', true);
      return null;
    }
  }

  function confirmData() {
    if (!canConfirm(state.session)) return;
    persist('confirmed', 'Người dùng xác nhận dữ liệu chuẩn.');
  }

  async function addToTrainingSet() {
    if (!canConfirm(state.session)) return;
    const tokenInput = $('[data-trainset-token]');
    const tokenValue = tokenInput?.value?.trim() || '';
    if (tokenValue && !tokenValue.startsWith('•')) setGitHubToken(tokenValue);
    const brand = currentBrand();
    const slug = brandSlug(brand);
    try {
      const rawText = state.session.editedText || state.session.rawText;
      const { data: patterns } = await loadPatterns(brand);
      const labeledFields = buildLabeledFields(state.session, { brandLabel: brandLabel(brand) });
      // Dataset mẫu = cặp (Ảnh hoá đơn + dữ liệu chuẩn đã chỉnh sửa).
      const image = await buildDatasetImage({ file: state.file, previewPages: state.previewPages });
      const sample = {
        id: '', brand: slug, createdAt: new Date().toISOString(), source: 'training',
        rawText, labeledFields,
        ...(image ? { image, imageHash: `sha256:${hashString(image)}` } : {}),
      };
      const learned = learnFromSample(brand, sample, patterns || {});
      sample.id = nextSampleId(brand, sample.createdAt.slice(0, 10), patterns?.sampleCount || 0);
      const outcome = await saveTrainingSample({ brand: slug, sample, patterns: learned });
      const desc = outcome.mode === 'github' ? `${outcome.result.files} file đã push lên GitHub`
        : outcome.mode === 'cms' ? 'đã lưu qua CMS local'
        : `đã tải ${outcome.result.file} (commit thủ công)`;
      state.trainsetStatus = `Đã lưu mẫu chuẩn ${sample.id} · ${desc}. Mô hình OCR chưa tự huấn luyện lại; mẫu sẽ dùng cho pipeline cải thiện OCR.`;
      persist('confirmed', `Đã đưa vào tập training (${outcome.mode}).`);
      renderTrainset();
      showToast('Đã lưu mẫu chuẩn vào tập training.');
    } catch (error) {
      state.trainsetStatus = '';
      renderTrainset();
      showToast(error.message || 'Không lưu được mẫu chuẩn.', true);
      setAlert(error.message || 'Không lưu được mẫu chuẩn.', 'danger');
    }
  }

  // --- History open/delete -------------------------------------------------
  function openRecord(id) {
    const session = sessionFromRecord(getTrainingRecord(id));
    if (!session) return;
    state.session = recomputeSession(session);
    state.undoStack = [];
    state.file = null;
    state.previewPages = [];
    state.previewUrl = '';
    state.status = 'ready';
    state.brand = session.brand || 'highlands';
    setAlert(`Đang mở lại ${session.fileName || session.id}. Kết quả OCR gốc vẫn được giữ để đối chiếu.`, 'info');
    renderAll();
  }

  function deleteRecord(id) {
    if (!window.confirm(`Xoá dữ liệu training ${id}? Thao tác không thể hoàn tác.`)) return;
    removeTrainingRecord(id);
    showToast(`Đã xoá ${id}.`);
    renderHeaderCounts();
    renderHistory();
  }

  // --- Events --------------------------------------------------------------
  container.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.matches('[data-file-input]')) {
      const file = target.files?.[0];
      if (file) await handleFile(file);
      return;
    }
    if (target.matches('[data-item-field]')) {
      const row = target.closest('[data-item-row]');
      const id = row?.dataset.itemId;
      if (!id) return;
      const field = target.dataset.itemField;
      const value = field === 'category' ? target.value : target.value;
      const patch = {};
      if (field === 'name') patch.name = value;
      else if (field === 'category') patch.category = value;
      else if (field === 'quantity') patch.quantity = value.trim() === '' ? null : Math.max(0, Math.round(toNumber(value)));
      else patch[field] = parseMoneyInput(value);
      state.session = updateItem(state.session, id, patch);
      if (field !== 'name' && field !== 'category') target.value = formatMoneyInput(parseMoneyInput(target.value));
      if (field === 'name') renderTable();
      else refreshDerived();
      return;
    }
    if (target.matches('[data-line-type]')) {
      pushUndo();
      state.session = reclassifyLine(state.session, target.dataset.lineType, target.value);
      renderTable();
      renderLines();
      refreshDerived();
      return;
    }
    if (target.matches('[data-receipt-field]')) {
      const field = target.dataset.receiptField;
      const value = parseMoneyInput(target.value);
      target.value = formatMoneyInput(value);
      state.session.receipt[field] = value;
      refreshDerived();
      return;
    }
    if (target.matches('[data-brand-select]')) {
      state.brand = target.value;
      try {
        const { data } = await loadPatterns(state.brand);
        state.patterns = data || {};
      } catch { /* ignore */ }
      return;
    }
    if (target.matches('[data-history-status]')) { state.filters.status = target.value; renderHistory(); return; }
    if (target.matches('[data-history-from]')) { state.filters.from = target.value; renderHistory(); return; }
    if (target.matches('[data-history-to]')) { state.filters.to = target.value; renderHistory(); return; }
  });

  container.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-item-field]') && ['quantity', 'unitPrice', 'discountAmount'].includes(target.dataset.itemField)) {
      const row = target.closest('[data-item-row]');
      const id = row?.dataset.itemId;
      if (!id) return;
      const field = target.dataset.itemField;
      const patch = {};
      if (field === 'quantity') patch.quantity = target.value.trim() === '' ? null : Math.max(0, Math.round(toNumber(target.value)));
      else patch[field] = parseMoneyInput(target.value);
      state.session = updateItem(state.session, id, patch);
      refreshDerived();
      return;
    }
    if (target.matches('[data-history-search]')) { state.filters.query = target.value; renderHistory(); return; }
  });

  container.addEventListener('dragover', (event) => {
    const zone = event.target.closest('[data-dropzone]');
    if (zone) { event.preventDefault(); zone.classList.add('is-dragover'); }
  });
  container.addEventListener('dragleave', (event) => {
    event.target.closest('[data-dropzone]')?.classList.remove('is-dragover');
  });
  container.addEventListener('drop', async (event) => {
    const zone = event.target.closest('[data-dropzone]');
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) await handleFile(file);
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (target.closest('[data-analyze]')) { void analyze(); return; }
    if (target.closest('[data-replace]')) { container.querySelector('[data-file-input]')?.click(); return; }
    if (target.closest('[data-clear-file]')) { resetFile(); return; }

    if (target.closest('[data-add-item]')) {
      pushUndo();
      state.session = addManualItem(state.session, {});
      renderTable();
      renderLines();
      refreshDerived();
      return;
    }
    const removeBtn = target.closest('[data-remove-item]');
    if (removeBtn) {
      pushUndo();
      state.session = removeItem(state.session, removeBtn.dataset.removeItem);
      renderTable();
      refreshDerived();
      showToast('Đã xoá dòng. Bấm “Hoàn tác xoá/sửa” nếu muốn khôi phục.');
      return;
    }
    if (target.closest('[data-undo]')) {
      const snapshot = state.undoStack.pop();
      if (!snapshot || !state.session) return;
      state.session.items = snapshot.items;
      state.session.receipt = snapshot.receipt;
      state.session.lines = snapshot.lines;
      state.session.meta = snapshot.meta;
      state.session = recomputeSession(state.session);
      renderTable();
      renderLines();
      refreshDerived();
      showToast('Đã hoàn tác.');
      return;
    }

    if (target.closest('[data-save-draft]')) { persist('draft', 'Bản nháp chưa xác minh đầy đủ.'); return; }
    if (target.closest('[data-confirm]')) { confirmData(); return; }
    if (target.closest('[data-add-training]')) { void addToTrainingSet(); return; }
    if (target.closest('[data-export-sample]')) {
      const payload = { app: 'BlogCo', feature: 'ocr-training', exportedAt: new Date().toISOString(), session: state.session };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `training-${state.session.id || 'sample'}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    const zoom = target.closest('[data-zoom]');
    if (zoom) {
      state.zoom = Math.min(3, Math.max(0.5, state.zoom + Number(zoom.dataset.zoom) * 0.25));
      renderViewer();
      return;
    }
    const tab = target.closest('[data-tab]');
    if (tab) { state.activeTab = tab.dataset.tab; applyTab(); return; }

    if (target.closest('[data-toggle-history]')) {
      const card = $('[data-history-card]');
      if (card) card.hidden = !card.hidden;
      if (card && !card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const openBtn = target.closest('[data-open-record]');
    if (openBtn) { openRecord(openBtn.dataset.openRecord); return; }
    const delBtn = target.closest('[data-delete-record]');
    if (delBtn) { deleteRecord(delBtn.dataset.deleteRecord); return; }
  });

  // --- Init ----------------------------------------------------------------
  try {
    const { data: index } = await loadTrainingIndex();
    const host = $('[data-training-progress]');
    if (host && index?.brands) {
      const rows = ['highlands', 'starbucks', 'phuclong'].map((slug) => {
        const entry = index.brands[slug] || { samples: 0 };
        const percent = Math.round((entry.accuracy ?? accuracyFromCount(entry.samples)) * 100);
        return `<li class="coffee-stat-row"><span class="coffee-stat-row__label">${escapeHtml(brandLabel(slug))}<small>${entry.samples} mẫu</small></span><span class="coffee-stat-bar"><span style="width:${percent}%"></span></span><strong>${percent}%</strong></li>`;
      }).join('');
      host.innerHTML = `<h3 class="coffee-section-title">Tiến độ học theo thương hiệu</h3><ul class="coffee-stat-list">${rows}</ul>`;
    }
  } catch { /* best effort */ }

  renderAll();
}
