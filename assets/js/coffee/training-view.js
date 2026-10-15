// Trang "AI Training" — UI 5 bước dạy OCR học hoá đơn mẫu.
//
// Route: #/coffee/training. Markup + wiring nằm ở đây; logic học thuần nằm ở
// training.js; OCR tái dùng recognizeImage/parseHighlandsReceipt của ocr.js.

import { escapeHtml } from './store.js';
import { recognizeImage, parseHighlandsReceipt } from './ocr.js';
import { extractReceipt } from './extract.js';
import {
  BRANDS, LABEL_FIELDS, brandLabel, brandSlug, learnFromSample, nextSampleId,
  loadPatterns, loadTrainingIndex, saveTrainingSample, getSaveMode, hasGitHubToken,
  setGitHubToken, applyLearnedFixes, accuracyFromCount,
} from './training.js';

function fieldInput(name, label, value = '') {
  return `<label class="coffee-field">${escapeHtml(label)}
    <input name="${name}" data-training-field="${name}" type="text" value="${escapeHtml(value)}" placeholder="—">
  </label>`;
}

export function renderTrainingPage() {
  const brandRadios = BRANDS.map((brand, index) => `<label class="coffee-training-brand">
    <input type="radio" name="trainingBrand" value="${brand.id}"${index === 0 ? ' checked' : ''}>
    <span>${escapeHtml(brand.label)}</span>
  </label>`).join('');

  return `<section class="coffee-screen" data-training aria-labelledby="coffee-title">
    <div class="coffee-page-heading">
      <a class="coffee-back" href="#/coffee" aria-label="Quay lại">← Quay lại</a>
      <p class="coffee-eyebrow">BLOGCO · CHI PHÍ CÀ PHÊ</p>
      <h1 id="coffee-title" tabindex="-1">🧠 AI Training</h1>
      <p>Dạy AI nhận diện hoá đơn: upload mẫu, sửa text OCR, gán nhãn trường rồi lưu vào DB GitHub. Càng nhiều mẫu, OCR càng chính xác.</p>
    </div>

    <section class="coffee-card coffee-training-step">
      <h2 class="coffee-section-title">1 · Chọn thương hiệu</h2>
      <div class="coffee-training-brands">${brandRadios}</div>
      <label class="coffee-field coffee-training-custom" data-training-custom hidden> Tên thương hiệu khác
        <input name="trainingBrandCustom" type="text" maxlength="60" placeholder="Ví dụ: Cộng Cà Phê">
      </label>
    </section>

    <section class="coffee-card coffee-training-step">
      <h2 class="coffee-section-title">2 · Upload hoá đơn mẫu</h2>
      <label class="coffee-dropzone" data-training-dropzone>
        <input type="file" accept="image/*,application/pdf,.pdf" multiple data-training-input hidden aria-label="Chọn ảnh hoặc PDF hoá đơn mẫu">
        <span class="coffee-dropzone__hint">
          <span aria-hidden="true">📥</span>
          <span>Kéo ảnh/PDF vào đây hoặc bấm để chọn</span>
          <small>JPG · PNG · WebP · PDF · tối đa 10MB/tệp · chọn được nhiều tệp</small>
        </span>
      </label>
      <p class="coffee-muted" data-training-filecount>Chưa chọn ảnh nào.</p>
    </section>

    <section class="coffee-card coffee-training-step">
      <h2 class="coffee-section-title">3 · Kiểm tra / sửa text OCR</h2>
      <div class="coffee-invoice__actions">
        <button type="button" class="coffee-secondary-button" data-training-ocr>🔍 OCR ảnh đã chọn</button>
        <button type="button" class="coffee-ghost-button" data-training-clear>Xoá text</button>
      </div>
      <p class="coffee-invoice__status" data-training-status role="status" aria-live="polite"></p>
      <textarea class="coffee-invoice__text coffee-training-text" data-training-text rows="10" placeholder="Text OCR thô (bạn có thể sửa trực tiếp tại đây)"></textarea>
    </section>

    <section class="coffee-card coffee-training-step">
      <h2 class="coffee-section-title">4 · Đánh dấu các trường quan trọng</h2>
      <p class="coffee-muted">Bôi đen text ở ô trên rồi bấm nhãn tương ứng, hoặc bấm “Gợi ý từ OCR” để AI tự điền.</p>
      <div class="coffee-training-labels">
        ${LABEL_FIELDS.map(([field, label]) => `<button type="button" class="coffee-ghost-button coffee-training-label" data-label-field="${field}">${escapeHtml(label)}</button>`).join('')}
      </div>
      <div class="coffee-form-grid coffee-training-fields">
        ${fieldInput('brand', '🏷 Thương hiệu')}
        ${fieldInput('address', '🏷 Địa chỉ')}
        ${fieldInput('phone', '🏷 SĐT')}
        ${fieldInput('shopId', '🏷 ShopID')}
        ${fieldInput('checkNo', '🏷 Check')}
        ${fieldInput('datetime', '🏷 Ngày giờ')}
        ${fieldInput('cashier', '🏷 Thu ngân')}
        ${fieldInput('pager', '🏷 Pager')}
        ${fieldInput('pos', '🏷 POS')}
        ${fieldInput('subtotal', '🏷 Thành tiền')}
        ${fieldInput('total', '🏷 Tổng tiền')}
        ${fieldInput('payment', '🏷 Thanh toán')}
      </div>
      <label class="coffee-field coffee-field--full">🍹 Danh sách món (JSON)
        <textarea name="items" data-training-field="items" rows="4" placeholder='[{"qty":1,"name":"Matcha Latte Da L","price":69000,"discount":-13800}]'></textarea>
      </label>
      <div class="coffee-invoice__actions">
        <button type="button" class="coffee-secondary-button" data-training-suggest>✨ Gợi ý từ OCR</button>
      </div>
      <details class="coffee-ocr-json" data-training-json hidden>
        <summary>🧪 Trích xuất chuẩn (JSON) xem trước</summary>
        <p class="coffee-ocr-json__note" data-training-json-note></p>
        <pre class="coffee-ocr-json__pre" data-training-json-pre></pre>
      </details>
    </section>

    <section class="coffee-card coffee-training-step">
      <h2 class="coffee-section-title">5 · Huấn luyện &amp; lưu vào DB</h2>
      <label class="coffee-field coffee-field--full">GitHub Personal Access Token (contents:write) — chỉ lưu trên thiết bị này
        <input name="trainingToken" data-training-token type="password" autocomplete="off" placeholder="ghp_… (bỏ trống nếu dùng CMS local hoặc tải file)">
      </label>
      <p class="coffee-muted" data-training-savehint></p>
      <div class="coffee-invoice__actions">
        <button type="button" class="coffee-primary-button" data-training-save>🧠 Huấn luyện AI với mẫu này</button>
        <button type="button" class="coffee-secondary-button" data-training-download>💾 Export training data</button>
        <button type="button" class="coffee-ghost-button" data-training-import-trigger>⬆ Import từ máy khác</button>
        <input type="file" accept="application/json,.json" data-training-import hidden aria-label="Chọn file training để nhập">
      </div>
      <p class="coffee-invoice__status" data-training-result role="status" aria-live="polite"></p>
    </section>

    <section class="coffee-card coffee-training-step">
      <h2 class="coffee-section-title">📊 Tiến độ học</h2>
      <div data-training-progress><p class="coffee-muted">Đang tải…</p></div>
    </section>

    <div class="coffee-actions"><a class="coffee-secondary-button" href="#/coffee">← Danh sách hoá đơn</a></div>
  </section>
  <div class="coffee-toast" data-coffee-toast role="status" aria-live="polite" aria-atomic="true"></div>`;
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

function progressMarkup(index) {
  const brands = index?.brands || {};
  const slugs = ['highlands', 'starbucks', 'phuclong'];
  const rows = slugs.map((slug) => {
    const entry = brands[slug] || { samples: 0, accuracy: 0.45 };
    const accuracy = Math.round((entry.accuracy ?? accuracyFromCount(entry.samples)) * 100);
    const label = brandLabel(slug);
    return `<li class="coffee-stat-row">
      <span class="coffee-stat-row__label">${escapeHtml(label)}<small>${entry.samples} mẫu đã học</small></span>
      <span class="coffee-stat-bar" role="img" aria-label="${escapeHtml(label)}: ${accuracy}%"><span style="width:${accuracy}%"></span></span>
      <strong>${accuracy}%</strong>
    </li>`;
  }).join('');
  const total = slugs.reduce((sum, slug) => sum + (brands[slug]?.samples || 0), 0);
  const highlands = brands.highlands?.samples || 0;
  const hint = highlands >= 12 ? 'Highlands đã đủ mẫu để đạt ~95%.' : `💡 Upload thêm ${Math.max(1, 12 - highlands)} mẫu Highlands để tiệm cận 95%.`;
  return `<ul class="coffee-stat-list">${rows}</ul>
    <p class="coffee-muted">Tổng mẫu đã học: <strong>${total}</strong> · ${escapeHtml(hint)}</p>
    <p class="coffee-muted">Lần học gần nhất: ${escapeHtml(index?.updatedAt ? new Date(index.updatedAt).toLocaleString('vi-VN') : '—')}</p>`;
}

function readField(container, name) {
  return container.querySelector(`[data-training-field="${name}"]`)?.value || '';
}

function collectSample(container, brand) {
  const labeledFields = {};
  for (const [field] of LABEL_FIELDS) {
    const value = readField(container, field).trim();
    if (value) labeledFields[field] = value;
  }
  const itemsRaw = readField(container, 'items').trim();
  if (itemsRaw) {
    try {
      labeledFields.items = JSON.parse(itemsRaw);
    } catch {
      throw new Error('Danh sách món (JSON) không hợp lệ.');
    }
  }
  return {
    id: container.dataset.sampleId || '',
    brand: brandSlug(brand),
    createdAt: new Date().toISOString(),
    source: 'training',
    rawText: container.querySelector('[data-training-text]')?.value || '',
    labeledFields,
  };
}

function fillSuggestion(container, text) {
  let parsed;
  try {
    parsed = parseHighlandsReceipt(text);
  } catch {
    return 0;
  }
  const map = {
    brand: parsed.brand, address: parsed.address, phone: parsed.phone, shopId: parsed.shopId,
    checkNo: parsed.checkNo, datetime: parsed.datetime, cashier: parsed.cashier,
    pager: parsed.pager, pos: parsed.pos, subtotal: parsed.subtotal, total: parsed.total,
    payment: parsed.payment,
  };
  let filled = 0;
  for (const [field, value] of Object.entries(map)) {
    if (value === null || value === undefined || value === '') continue;
    const input = container.querySelector(`[data-training-field="${field}"]`);
    if (input && !input.value.trim()) { input.value = String(value); filled += 1; }
  }
  if (Array.isArray(parsed.items) && parsed.items.length) {
    const itemsField = container.querySelector('[data-training-field="items"]');
    if (itemsField && !itemsField.value.trim()) { itemsField.value = JSON.stringify(parsed.items, null, 2); filled += 1; }
  }
  return filled;
}

// Xem trước cấu trúc trích xuất chuẩn (system prompt hoá đơn chính xác) từ text OCR.
function renderExtractPreview(container, text) {
  const panel = container.querySelector('[data-training-json]');
  const pre = container.querySelector('[data-training-json-pre]');
  const note = container.querySelector('[data-training-json-note]');
  if (!panel || !pre) return;
  let extraction;
  try {
    extraction = extractReceipt(text);
  } catch {
    panel.hidden = true;
    return;
  }
  pre.textContent = JSON.stringify(extraction, null, 2);
  if (note) {
    const { validation } = extraction;
    const label = { passed: '✅ Khớp tổng', failed: '⚠️ Lệch tổng', not_verified: '❔ Chưa xác minh' }[validation.arithmetic_check]
      || validation.arithmetic_check;
    const parts = [`${extraction.items.length} dòng hàng`, label];
    if (validation.discrepancy_amount) parts.push(`lệch ${Number(validation.discrepancy_amount).toLocaleString('vi-VN')} đ`);
    if (validation.warnings.length) parts.push(`${validation.warnings.length} cảnh báo`);
    note.textContent = parts.join(' · ');
  }
  panel.hidden = false;
}

// Gắn sự kiện cho trang training sau khi markup được render vào `root`.
export async function mountTraining(root) {
  const container = root.querySelector('[data-training]');
  if (!container) return;
  const status = container.querySelector('[data-training-status]');
  const result = container.querySelector('[data-training-result]');
  const textArea = container.querySelector('[data-training-text]');
  const fileCount = container.querySelector('[data-training-filecount]');
  const saveHint = container.querySelector('[data-training-savehint]');
  const tokenInput = container.querySelector('[data-training-token]');
  const state = { files: [], sampleId: '', index: null, patterns: {}, brand: 'highlands' };

  if (tokenInput && hasGitHubToken()) tokenInput.value = '••••••••••••••••';

  const currentBrand = () => {
    const picked = container.querySelector('input[name="trainingBrand"]:checked')?.value || 'highlands';
    if (picked !== 'other') return picked;
    return container.querySelector('[name="trainingBrandCustom"]')?.value?.trim() || 'other';
  };

  const refreshSaveHint = () => {
    const mode = tokenInput?.value && !tokenInput.value.startsWith('•') ? 'github' : getSaveMode();
    const label = mode === 'github' ? 'sẽ push trực tiếp lên GitHub (data/ocr-training/)'
      : mode === 'cms' ? 'sẽ lưu qua CMS local rồi push GitHub'
      : 'chưa có token/CMS — hệ thống sẽ tải file JSON để bạn commit thủ công';
    if (saveHint) saveHint.textContent = `Chế độ lưu: ${label}.`;
  };

  const loadBrand = async (brand) => {
    const { data } = await loadPatterns(brand);
    state.patterns = data || { patterns: {}, vietnameseFixes: {} };
  };

  const refreshProgress = async () => {
    const { data } = await loadTrainingIndex();
    state.index = data;
    const host = container.querySelector('[data-training-progress]');
    if (host) host.innerHTML = progressMarkup(data);
  };

  // Brand radios + custom name.
  container.querySelectorAll('input[name="trainingBrand"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      const custom = container.querySelector('[data-training-custom]');
      if (custom) custom.hidden = currentBrand() !== 'other';
      state.brand = currentBrand();
      await loadBrand(state.brand);
    });
  });

  // File dropzone.
  const input = container.querySelector('[data-training-input]');
  input?.addEventListener('change', () => {
    state.files = [...(input.files || [])];
    if (fileCount) fileCount.textContent = state.files.length ? `Đã chọn ${state.files.length} ảnh: ${state.files.map((f) => f.name).join(', ')}` : 'Chưa chọn ảnh nào.';
  });
  const zone = container.querySelector('[data-training-dropzone]');
  zone?.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-dragover'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone?.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragover');
    state.files = [...(event.dataTransfer?.files || [])];
    if (fileCount) fileCount.textContent = state.files.length ? `Đã chọn ${state.files.length} ảnh: ${state.files.map((f) => f.name).join(', ')}` : 'Chưa chọn ảnh nào.';
  });

  // OCR.
  container.querySelector('[data-training-ocr]')?.addEventListener('click', async () => {
    if (!state.files.length) { if (status) status.textContent = 'Hãy chọn ít nhất một ảnh hoá đơn mẫu.'; return; }
    const chunks = [];
    for (const file of state.files) {
      try {
        const text = await recognizeImage(file, {
          onProgress: (message) => {
            if (status && message?.status) status.textContent = `OCR ${file.name}: ${message.status}${message.progress ? ` ${Math.round(message.progress * 100)}%` : ''}`;
          },
        });
        chunks.push(text);
      } catch (error) {
        if (status) status.textContent = `${error.message} (${file.name})`;
      }
    }
    const combined = [textArea.value.trim(), ...chunks].filter(Boolean).join('\n\n---\n\n');
    textArea.value = combined;
    if (status) status.textContent = 'OCR xong. Sửa lại text cho đúng rồi gán nhãn.';
  });
  container.querySelector('[data-training-clear]')?.addEventListener('click', () => { textArea.value = ''; if (status) status.textContent = 'Đã xoá text OCR.'; });

  // Label buttons — gán đoạn text đang bôi đen vào trường.
  container.querySelectorAll('[data-label-field]').forEach((button) => {
    button.addEventListener('click', () => {
      const field = button.dataset.labelField;
      const input = container.querySelector(`[data-training-field="${field}"]`);
      if (!input) return;
      const selected = textArea.value.slice(textArea.selectionStart, textArea.selectionEnd).trim();
      if (selected) input.value = selected;
      else input.focus();
      if (status) status.textContent = selected ? `Đã gán "${selected.slice(0, 40)}" vào ${button.textContent.trim()}.` : `Bôi đen text ở ô OCR rồi bấm lại nhãn ${button.textContent.trim()}.`;
    });
  });

  // Suggest from OCR.
  container.querySelector('[data-training-suggest]')?.addEventListener('click', () => {
    const text = applyLearnedFixes(textArea.value, state.patterns?.vietnameseFixes || {});
    const filled = fillSuggestion(container, text);
    renderExtractPreview(container, text);
    if (status) status.textContent = filled ? `Đã gợi ý ${filled} trường từ OCR.` : 'Không đọc thêm được trường nào — bạn gán nhãn thủ công.';
  });

  // Save / train.
  container.querySelector('[data-training-save]')?.addEventListener('click', async () => {
    const tokenValue = tokenInput?.value?.trim() || '';
    if (tokenValue && !tokenValue.startsWith('•')) setGitHubToken(tokenValue);
    try {
      const brand = currentBrand();
      const slug = brandSlug(brand);
      const rawText = textArea.value.trim();
      if (!rawText) throw new Error('Chưa có text OCR. Hãy OCR hoặc dán text hoá đơn.');
      const sample = collectSample(container, brand);
      if (!Object.keys(sample.labeledFields).length) throw new Error('Chưa gán nhãn trường nào.');
      const { data: patterns } = await loadPatterns(brand);
      const learned = learnFromSample(brand, sample, patterns || {});
      sample.id = sample.id || nextSampleId(brand, sample.createdAt.slice(0, 10), (patterns?.sampleCount || 0));
      container.dataset.sampleId = sample.id;
      const outcome = await saveTrainingSample({ brand: slug, sample, patterns: learned });
      const desc = outcome.mode === 'github' ? `đã push ${outcome.result.files} file lên GitHub`
        : outcome.mode === 'cms' ? 'đã lưu qua CMS local'
        : `đã tải ${outcome.result.file} (commit thủ công vào data/ocr-training/)`;
      if (result) result.textContent = `🧠 Đã học mẫu ${sample.id} · v${learned.version} · accuracy≈${Math.round(learned.accuracy * 100)}% · ${desc}.`;
      showToast(root, `AI đã học mẫu ${sample.id}.`);
      await loadBrand(brand);
      await refreshProgress();
    } catch (error) {
      if (result) result.textContent = '';
      showToast(root, error.message || 'Không lưu được mẫu.', true);
    }
  });

  // Export.
  container.querySelector('[data-training-download]')?.addEventListener('click', () => {
    const payload = { app: 'BlogCo', feature: 'ocr-training', exportedAt: new Date().toISOString(), brand: brandSlug(currentBrand()), patterns: state.patterns, rawText: textArea.value };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ocr-training-${brandSlug(currentBrand())}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Import.
  const importInput = container.querySelector('[data-training-import]');
  container.querySelector('[data-training-import-trigger]')?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || 'null'));
        if (payload.rawText) textArea.value = payload.rawText;
        if (payload.patterns) state.patterns = payload.patterns;
        fillSuggestion(container, textArea.value);
        showToast(root, 'Đã nhập training data từ file.');
      } catch {
        showToast(root, 'File training không hợp lệ.', true);
      }
    };
    reader.readAsText(file);
  });

  refreshSaveHint();
  await loadBrand(currentBrand());
  await refreshProgress();
}
