// Router + giao diện cho tính năng "Soạn giáo án".
//
// Route (hash, dùng trên trang chủ và trang riêng):
//   #/lessons/korean  → giáo án tiếng Hàn cơ bản
//   #/lessons/typing  → giáo án tin học tiếng Hàn (đánh máy)
//
// Trạng thái form + giáo án cuối được lưu cục bộ (localStorage). API key chỉ
// giữ trong bộ nhớ phiên, không lưu xuống thiết bị.

import { generateLesson, PROVIDERS } from './ai.js';
import { lessonToSlides, escapeHtml } from './templates.js';
import { exportLessonPdf, slugifyFileName } from './export-pdf.js';
import { META as KOREAN_META } from './korean.js';
import { META as TYPING_META } from './typing.js';

const MODES = { korean: KOREAN_META, typing: TYPING_META };
const STORE_KEY = 'blogco.lessons.v1';
const SLIDE_WIDTH_PX = 1122.52; // 297mm @ 96dpi
const SLIDE_HEIGHT_PX = 793.7; // 210mm @ 96dpi

const mountedRoots = new WeakSet();
const state = { modes: {}, options: { provider: 'auto', apiProvider: 'openai', apiKey: '', model: '' } };
let toastTimer;

function defaultConfig(mode) {
  const meta = MODES[mode];
  return {
    mode,
    topic: meta.defaultTopic,
    level: meta.defaultLevel,
    audience: meta.defaultAudience,
    duration: meta.defaultDuration,
    sessions: 1,
    skills: [...meta.defaultSkills],
    language: 'vi',
    notes: '',
    reference: '',
  };
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && raw.version === 1 && raw.modes) state.modes = raw.modes;
  } catch {
    /* bỏ qua dữ liệu hỏng */
  }
}

function saveStore() {
  try {
    const modes = {};
    for (const [key, value] of Object.entries(state.modes)) {
      modes[key] = { config: value.config, lesson: value.lesson, source: value.source };
    }
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, modes }));
  } catch {
    /* localStorage đầy hoặc bị chặn — bỏ qua */
  }
}

function routeMode(root) {
  const hash = location.hash.startsWith('#/lessons') ? location.hash.slice(1).replace(/\/$/, '') : '';
  if (hash) {
    const segment = hash.split('/')[2];
    if (segment === 'typing') return 'typing';
    if (segment === 'korean') return 'korean';
  }
  return root.dataset.initialRoute === 'typing' ? 'typing' : 'korean';
}

function currentConfig(mode) {
  return state.modes[mode]?.config || defaultConfig(mode);
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

function toastMarkup() {
  return '<div class="lessons-toast" data-lessons-toast role="status" aria-live="polite" aria-atomic="true"></div>';
}

function providerOptions(selected) {
  return Object.entries(PROVIDERS)
    .map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function renderApp(root, mode) {
  const meta = MODES[mode];
  const cfg = currentConfig(mode);
  const opts = state.options;
  const checked = (list, value) => (list.includes(value) ? ' checked' : '');

  root.innerHTML = `
    <div class="lessons-page-heading">
      <p class="lessons-eyebrow">${escapeHtml(meta.eyebrow)}</p>
      <h1>${escapeHtml(meta.heading)}</h1>
      <p>${escapeHtml(meta.description)}</p>
    </div>

    <section class="lessons-card">
      <div class="lessons-card__head">
        <div>
          <p class="lessons-eyebrow">Thông tin giáo án</p>
          <h2>Nhập thông tin buổi học</h2>
        </div>
        <span class="lessons-badge">${meta.emoji} ${escapeHtml(meta.label)}</span>
      </div>
      <form id="lessons-form" novalidate>
        <div class="lessons-form-grid">
          <label class="lessons-field lessons-field--full">
            <span>Chủ đề *</span>
            <input type="text" name="topic" required maxlength="160" value="${escapeHtml(cfg.topic)}" placeholder="${escapeHtml(meta.topicPlaceholder)}">
          </label>

          <fieldset class="lessons-fieldset">
            <legend>Trình độ *</legend>
            <div class="lessons-choices">
              ${meta.levels.map((level) => `<label class="lessons-choice"><input type="radio" name="level" value="${escapeHtml(level)}"${cfg.level === level ? ' checked' : ''}><span>${escapeHtml(level)}</span></label>`).join('')}
            </div>
          </fieldset>

          <label class="lessons-field">
            <span>Đối tượng *</span>
            <input type="text" name="audience" required maxlength="160" value="${escapeHtml(cfg.audience)}" placeholder="${escapeHtml(meta.audiencePlaceholder)}">
          </label>
          <label class="lessons-field">
            <span>Thời lượng (phút) *</span>
            <input type="number" name="duration" min="30" max="300" step="5" required value="${Number(cfg.duration) || meta.defaultDuration}">
          </label>
          <label class="lessons-field">
            <span>Số buổi</span>
            <input type="number" name="sessions" min="1" max="30" step="1" value="${Number(cfg.sessions) || 1}">
          </label>

          <fieldset class="lessons-fieldset">
            <legend>${mode === 'typing' ? 'Nội dung trọng tâm' : 'Kỹ năng chính'}</legend>
            <div class="lessons-choices">
              ${meta.skills.map((skill) => `<label class="lessons-choice"><input type="checkbox" name="skills" value="${escapeHtml(skill)}"${checked(cfg.skills, skill)}><span>${escapeHtml(skill)}</span></label>`).join('')}
            </div>
          </fieldset>

          <fieldset class="lessons-fieldset">
            <legend>Ngôn ngữ dạy</legend>
            <div class="lessons-choices">
              <label class="lessons-choice"><input type="radio" name="language" value="vi"${cfg.language !== 'en' ? ' checked' : ''}><span>Tiếng Việt</span></label>
              <label class="lessons-choice"><input type="radio" name="language" value="en"${cfg.language === 'en' ? ' checked' : ''}><span>Tiếng Anh</span></label>
            </div>
          </fieldset>

          <label class="lessons-field lessons-field--full">
            <span>Ghi chú</span>
            <textarea name="notes" rows="3" maxlength="600" placeholder="Ví dụ: Lớp học online qua Zoom">${escapeHtml(cfg.notes || '')}</textarea>
          </label>
        </div>

        <details class="lessons-ai">
          <summary>⚙️ Tuỳ chọn AI (ưu tiên mô hình cục bộ → API nếu có key → mẫu có sẵn)</summary>
          <div class="lessons-form-grid">
            <label class="lessons-field">
              <span>Nguồn soạn</span>
              <select name="provider">${providerOptions(opts.provider)}</select>
            </label>
            <label class="lessons-field">
              <span>Nhà cung cấp API</span>
              <select name="apiProvider">
                <option value="openai"${opts.apiProvider === 'openai' ? ' selected' : ''}>OpenAI (GPT-4o-mini)</option>
                <option value="gemini"${opts.apiProvider === 'gemini' ? ' selected' : ''}>Google Gemini (1.5 Flash)</option>
              </select>
            </label>
            <label class="lessons-field">
              <span>API key (chỉ lưu trong phiên)</span>
              <input type="password" name="apiKey" value="${escapeHtml(opts.apiKey)}" placeholder="sk-... hoặc AIza..." autocomplete="off">
            </label>
            <label class="lessons-field">
              <span>Model</span>
              <input type="text" name="model" maxlength="80" value="${escapeHtml(opts.model)}" placeholder="gpt-4o-mini / gemini-1.5-flash">
            </label>
          </div>
          <p class="lessons-reference">Mẹo: để trống API key và chọn “Mẫu có sẵn” nếu muốn soạn nhanh, không cần mạng.</p>
        </details>

        <p class="lessons-reference" data-reference-status>${cfg.reference ? `📎 Đã nạp tài liệu tham khảo (${cfg.reference.length} ký tự).` : ''}</p>

        <div class="lessons-actions">
          <button class="lessons-button" type="submit" data-generate>🤖 Soạn giáo án với AI</button>
          <label class="lessons-button lessons-button--ghost" for="lessons-reference-input">⬆ Upload tài liệu tham khảo</label>
          <input id="lessons-reference-input" class="lessons-file-input" type="file" accept=".txt,.md,.csv,text/plain" data-reference-input>
        </div>
      </form>
      <div class="lessons-status" data-status role="status" aria-live="polite"></div>
    </section>

    <section class="lessons-card">
      <div class="lessons-card__head">
        <div>
          <p class="lessons-eyebrow">Kết quả giáo án</p>
          <h2 data-results-title>Chưa có giáo án</h2>
        </div>
      </div>
      <div data-results>
        <p class="lessons-empty">Nhập thông tin rồi bấm “Soạn giáo án với AI” để xem trước các slide.</p>
      </div>
    </section>
    ${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Status / toast
// ---------------------------------------------------------------------------

function setStatus(root, message, spinner = false, isError = false) {
  const box = root.querySelector('[data-status]');
  if (!box) return;
  if (!message) {
    box.className = 'lessons-status';
    box.innerHTML = '';
    return;
  }
  box.className = `lessons-status is-visible${isError ? ' is-error' : ''}`;
  box.innerHTML = `${spinner ? '<span class="lessons-spinner" aria-hidden="true"></span>' : ''}<span>${escapeHtml(message)}</span>`;
}

function showToast(root, message, isError = false) {
  const toast = root.querySelector('[data-lessons-toast]');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 4200);
}

function setBusy(root, busy) {
  root.querySelectorAll('[data-generate], [data-export-pdf], [data-regenerate]').forEach((button) => {
    button.disabled = busy;
  });
}

// ---------------------------------------------------------------------------
// Form <-> config
// ---------------------------------------------------------------------------

function readConfig(form, mode) {
  const data = new FormData(form);
  const skills = data.getAll('skills').map(String);
  return {
    mode,
    topic: String(data.get('topic') || '').trim() || MODES[mode].defaultTopic,
    level: String(data.get('level') || MODES[mode].defaultLevel),
    audience: String(data.get('audience') || '').trim() || MODES[mode].defaultAudience,
    duration: Math.max(30, Number(data.get('duration')) || MODES[mode].defaultDuration),
    sessions: Math.max(1, Number(data.get('sessions')) || 1),
    skills: skills.length ? skills : [...MODES[mode].defaultSkills],
    language: data.get('language') === 'en' ? 'en' : 'vi',
    notes: String(data.get('notes') || '').trim(),
    reference: state.modes[mode]?.config?.reference || '',
  };
}

function readOptions(form) {
  const data = new FormData(form);
  state.options = {
    provider: String(data.get('provider') || 'auto'),
    apiProvider: String(data.get('apiProvider') || 'openai'),
    apiKey: String(data.get('apiKey') || '').trim(),
    model: String(data.get('model') || '').trim(),
  };
  return state.options;
}

// ---------------------------------------------------------------------------
// Results + preview scaling
// ---------------------------------------------------------------------------

function sourceLabel(source) {
  if (source === 'api') return '✨ AI · API';
  if (source === 'local') return '✨ AI · Cục bộ';
  return '📄 Mẫu có sẵn';
}

function fitPreview(root) {
  const viewport = root.querySelector('[data-slides-viewport]');
  const scaleEl = root.querySelector('[data-slides-scale]');
  if (!viewport || !scaleEl) return;
  const count = scaleEl.querySelectorAll('.pdf-slide').length || 1;
  const width = viewport.clientWidth;
  if (!width) return;
  const scale = width / SLIDE_WIDTH_PX;
  scaleEl.style.transform = `scale(${scale})`;
  viewport.style.height = `${SLIDE_HEIGHT_PX * scale * count}px`;
}

function renderResults(root, lesson, source, errors = []) {
  const mode = lesson.mode || routeMode(root);
  const cfg = state.modes[mode]?.config || currentConfig(mode);
  const slides = lessonToSlides(lesson, cfg);
  const results = root.querySelector('[data-results]');
  const title = root.querySelector('[data-results-title]');
  if (title) title.textContent = `${slides.length} slide · ${lesson.title}`;

  results.innerHTML = `
    <div class="lessons-results__meta">
      <span class="lessons-badge">${sourceLabel(source)}</span>
      <span class="lessons-badge">${escapeHtml(lesson.level)}</span>
      <span class="lessons-badge">${Number(lesson.duration)} phút</span>
      <span class="lessons-badge">${Number(lesson.sessions)} buổi</span>
      <span class="lessons-badge">${escapeHtml((lesson.skills || []).join(' · '))}</span>
    </div>
    ${errors.length ? `<div class="lessons-status is-visible is-error" role="status">${escapeHtml(errors.join('; '))}</div>` : ''}
    <div class="lessons-toolbar">
      <button class="lessons-button lessons-button--ghost" type="button" data-edit>✏️ Chỉnh sửa</button>
      <button class="lessons-button lessons-button--ghost" type="button" data-regenerate>🔄 Sinh lại</button>
      <button class="lessons-button" type="button" data-export-pdf>📥 Xuất PDF</button>
    </div>
    <div class="lessons-slides-viewport" data-slides-viewport>
      <div class="lessons-slides-scale" data-slides-scale>${slides.map((slide) => slide.html).join('\n')}</div>
    </div>`;
  fitPreview(root);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function composeConfig(mode, config) {
  if (!config.reference) return config;
  return {
    ...config,
    notes: `${config.notes ? `${config.notes}\n\n` : ''}Tài liệu tham khảo:\n${config.reference.slice(0, 4000)}`,
  };
}

async function handleGenerate(root) {
  const mode = routeMode(root);
  const form = root.querySelector('#lessons-form');
  if (!form) return;
  if (!form.reportValidity()) {
    showToast(root, 'Vui lòng nhập đủ Chủ đề, Đối tượng và Thời lượng.', true);
    return;
  }
  const config = readConfig(form, mode);
  const options = readOptions(form);
  state.modes[mode] = { ...(state.modes[mode] || {}), config };
  saveStore();

  setBusy(root, true);
  setStatus(root, 'Đang soạn giáo án…', true);
  try {
    const { lesson, source, errors } = await generateLesson(composeConfig(mode, config), {
      ...options,
      onProgress: (message) => setStatus(root, message, true),
    });
    state.modes[mode] = { config, lesson, source };
    saveStore();
    renderResults(root, lesson, source, errors);
    if (source === 'rule' && errors.length) {
      setStatus(root, `Không gọi được AI (${errors.join('; ')}). Đã dùng mẫu có sẵn.`, false, true);
    } else if (source === 'rule') {
      setStatus(root, 'Đã dựng giáo án từ mẫu có sẵn (offline).');
    } else {
      setStatus(root, source === 'api' ? 'Đã soạn giáo án bằng API AI.' : 'Đã soạn giáo án bằng mô hình cục bộ.');
    }
  } catch (error) {
    setStatus(root, error.message || 'Không soạn được giáo án.', false, true);
  } finally {
    setBusy(root, false);
  }
}

async function handleExport(root) {
  const mode = routeMode(root);
  const saved = state.modes[mode];
  if (!saved?.lesson) {
    showToast(root, 'Chưa có giáo án để xuất. Hãy soạn giáo án trước.', true);
    return;
  }
  const slides = lessonToSlides(saved.lesson, saved.config || currentConfig(mode));
  setBusy(root, true);
  setStatus(root, 'Đang tạo PDF…', true);
  try {
    const result = await exportLessonPdf(slides.map((slide) => slide.html).join('\n'), {
      filename: slugifyFileName(saved.lesson.topic || saved.lesson.title),
    });
    if (result.method === 'print') {
      setStatus(root, 'Không tải được html2pdf — đã mở hộp thoại in để lưu PDF.', false, true);
      showToast(root, 'Chọn “Lưu thành PDF” trong hộp thoại in.', true);
    } else {
      setStatus(root, `Đã xuất ${slides.length} slide ra PDF.`);
      showToast(root, 'Đã xuất PDF.');
    }
  } catch (error) {
    setStatus(root, error.message || 'Không xuất được PDF.', false, true);
  } finally {
    setBusy(root, false);
  }
}

async function handleReferenceUpload(root, file) {
  if (!file) return;
  try {
    const text = await file.text();
    const mode = routeMode(root);
    const config = { ...currentConfig(mode), reference: text };
    state.modes[mode] = { ...(state.modes[mode] || {}), config };
    saveStore();
    const status = root.querySelector('[data-reference-status]');
    if (status) status.textContent = `📎 Đã nạp “${file.name}” (${text.length} ký tự).`;
    showToast(root, `Đã nạp tài liệu tham khảo: ${file.name}`);
  } catch {
    showToast(root, 'Không đọc được tệp tài liệu.', true);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function showRoute(root) {
  const mode = routeMode(root);
  document.body.dataset.lessonsMode = mode;
  // Chỉ đổi tiêu đề khi đang ở trang chuyên dụng (không phải trang chủ dùng hash).
  if (root.dataset.initialRoute) {
    document.title = `${MODES[mode].heading} | BlogCo`;
  }
  renderApp(root, mode);
  const saved = state.modes[mode];
  if (saved?.lesson) {
    renderResults(root, saved.lesson, saved.source, []);
    setStatus(root, saved.source === 'rule' ? 'Giáo án đã lưu trên thiết bị (mẫu có sẵn).' : 'Giáo án đã lưu trên thiết bị.');
  } else {
    setStatus(root, '');
  }
}

export function mountLessonsApp(root) {
  if (!root) return;
  loadStore();
  if (mountedRoots.has(root)) {
    showRoute(root);
    return;
  }
  mountedRoots.add(root);

  root.addEventListener('submit', (event) => {
    if (event.target.closest('#lessons-form')) {
      event.preventDefault();
      void handleGenerate(root);
    }
  });

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (target.closest('[data-generate]')) {
      // submit event sẽ xử lý; chỉ chặn hành vi mặc định của nút.
      return;
    }
    if (target.closest('[data-edit]')) {
      root.querySelector('#lessons-form [name="topic"]')?.focus({ preventScroll: false });
      root.querySelector('.lessons-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (target.closest('[data-regenerate]')) {
      void handleGenerate(root);
      return;
    }
    if (target.closest('[data-export-pdf]')) {
      void handleExport(root);
    }
  });

  root.addEventListener('change', (event) => {
    const input = event.target.closest('[data-reference-input]');
    if (input) {
      const file = input.files?.[0];
      input.value = '';
      void handleReferenceUpload(root, file);
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitPreview(root), 120);
  });

  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/lessons') || root.dataset.initialRoute) {
      if (location.hash.startsWith('#/lessons')) showRoute(root);
    }
  });

  showRoute(root);
}

export { defaultConfig, routeMode, readConfig };
