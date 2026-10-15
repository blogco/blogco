// In-browser editor that publishes a post to the blog repository via the GitHub
// contents API. Mounted at #/blog/new (the "Viết blog mới" entry).
//
// The body is a contenteditable "rich text" surface: authors paste ordinary
// prose (no Markdown syntax), format with the toolbar if they want, and the
// editor converts everything to clean Markdown on save. Cover image still comes
// from one of two modes (see the “Ảnh đại diện” panel):
//   • upload — pick/drag a file; it is committed to the repo (static/uploads)
//              and reused as both the cover and the first image of the post.
//   • auto   — fetch a stock photo (Unsplash/Pexels) or a seeded illustration.
//
// Inline images are managed in place: hovering a picture reveals a floating
// toolbar to align it (left / center / full), add a caption, or delete it
// without touching the surrounding prose.

import TurndownService from 'turndown';
import {
  slugify, buildFrontMatter, buildPostMarkdown, isoNow, postPath,
  uploadFilename, assetPublicUrl, parsePostMarkdown, slugFromPostPath,
} from './lib.js';
import {
  getSettings, saveSettings, getDraft, saveDraft, clearDraft, commitPost,
  uploadImage, mediaConfig, listPostFiles, fetchPostText, getPostFile, deletePost,
} from './store.js';
import { pickThumbnail } from './thumbnail.js';
import {
  escapeHtml, plainTextToHtml, sanitizePastedHtml, cleanMarkdown,
  figureShortcode, expandFigureShortcodes, FIGURE_ALIGNMENTS,
} from './rich.js';
import { scoreArticle } from './score.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // GitHub contents API friendly ceiling.
const DEFAULT_ALIGN = 'center';

let turndown;
function markdownFromHtml(html = '') {
  if (!turndown) {
    const Service = TurndownService?.default || TurndownService;
    turndown = new Service({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_',
    });
    // An editor <figure> becomes a Hugo shortcode so alignment + caption survive
    // the Goldmark build (raw HTML would be stripped with `unsafe = false`).
    turndown.addRule('blogFigure', {
      filter: (node) => node.nodeName === 'FIGURE' && Boolean(node.classList?.contains('blog-figure')),
      replacement: (_content, node) => {
        const img = node.querySelector('img');
        const src = img?.getAttribute('src') || '';
        if (!src) return '';
        const block = figureShortcode({
          src,
          alt: img.getAttribute('alt') || '',
          caption: node.querySelector('figcaption')?.textContent?.trim() || '',
          align: node.dataset?.align || DEFAULT_ALIGN,
        });
        return block ? `\n\n${block}\n\n` : '';
      },
    });
  }
  return cleanMarkdown(turndown.turndown(html || ''));
}

let markedPromise;
function loadMarked() {
  markedPromise ??= import('marked').then((mod) => mod.marked || mod.default);
  return markedPromise;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TOOLBAR = [
  { action: 'bold', label: 'B', title: 'In đậm' },
  { action: 'italic', label: 'I', title: 'In nghiêng' },
  { action: 'h2', label: 'H2', title: 'Tiêu đề lớn', block: 'h2' },
  { action: 'h3', label: 'H3', title: 'Tiêu đề nhỏ', block: 'h3' },
  { action: 'bullet', label: '•', title: 'Danh sách chấm', cmd: 'insertUnorderedList' },
  { action: 'number', label: '1.', title: 'Danh sách số', cmd: 'insertOrderedList' },
  { action: 'quote', label: '❝', title: 'Trích dẫn', block: 'blockquote' },
  { action: 'link', label: '🔗', title: 'Chèn liên kết', link: true },
  { action: 'image', label: '🖼️', title: 'Chèn ảnh vào bài (chọn nhiều ảnh)', image: true },
  { action: 'wipe', label: '🧹 Xoá trắng', title: 'Xoá trắng khung soạn thảo (làm mới bài viết)', wipe: true },
];

const BUBBLE = ['bold', 'italic', 'h2', 'quote', 'link'];
const ALIGN_BUTTONS = [
  { value: 'left', label: '⯇', title: 'Căn trái' },
  { value: 'center', label: '↔', title: 'Căn giữa' },
  { value: 'full', label: '⛶', title: 'Tràn lề (rộng hết)' },
];

function toolButton(tool) {
  return `<button type="button" class="blog-tool" data-blog-tool="${tool.action}" title="${escapeHtml(tool.title)}" aria-label="${escapeHtml(tool.title)}">${escapeHtml(tool.label)}</button>`;
}

function toolbarHtml() {
  return TOOLBAR.map(toolButton).join('');
}

function bubbleHtml() {
  return BUBBLE
    .map((action) => TOOLBAR.find((tool) => tool.action === action))
    .filter(Boolean)
    .map((tool) => `<button type="button" class="blog-bubble__btn" data-blog-tool="${tool.action}" title="${escapeHtml(tool.title)}" aria-label="${escapeHtml(tool.title)}">${escapeHtml(tool.label)}</button>`)
    .join('');
}

function figurebarHtml() {
  const aligns = `<div class="blog-figurebar__group" role="group" aria-label="Căn chỉnh ảnh">${ALIGN_BUTTONS
    .map((btn) => `<button type="button" class="blog-figurebar__btn" data-blog-fig-align="${btn.value}" title="${escapeHtml(btn.title)}" aria-label="${escapeHtml(btn.title)}">${btn.label}</button>`)
    .join('')}</div>`;
  return `${aligns}
    <button type="button" class="blog-figurebar__btn" data-blog-fig-caption title="Thêm / sửa chú thích">🏷️ <span>Chú thích</span></button>
    <button type="button" class="blog-figurebar__btn blog-figurebar__btn--danger" data-blog-fig-delete title="Xoá ảnh khỏi bài viết">🗑️ <span>Xoá</span></button>`;
}

function renderEditor(root, state) {
  const settings = getSettings();
  const draft = getDraft();
  const isUpload = settings.imageMode === 'upload';
  // Older drafts may hold plain/Markdown text; turn those into paragraphs.
  const rawBody = draft.body || '';
  const initialBody = rawBody && !/<[a-z][\s\S]*>/i.test(rawBody) ? plainTextToHtml(rawBody) : rawBody;
  root.innerHTML = `<section class="blog-screen" aria-labelledby="blog-title">
    <header class="blog-head">
      <a class="blog-back" href="#" data-blog-home>← Trang chủ</a>
      <p class="blog-eyebrow">BLOGCO · STUDIO</p>
      <h1 id="blog-title" tabindex="-1">Viết blog mới</h1>
      <p>Dán nội dung, chọn ảnh rồi sync thẳng lên GitHub. Không cần gõ Markdown.</p>
    </header>

    <div class="blog-layout">
      <div class="blog-editor">
        <label class="blog-field blog-field--title">Tiêu đề bài viết
          <input type="text" data-blog-title value="${escapeHtml(draft.title)}" placeholder="VD: Kinh nghiệm uống cà phê lành mạnh">
        </label>

        <div class="blog-toolbar" role="toolbar" aria-label="Định dạng văn bản">
          <div class="blog-toolbar__tools">${toolbarHtml()}</div>
          <div class="blog-toolbar__actions">
            <button type="button" class="blog-tool blog-tool--ghost" data-blog-preview-open title="Xem trước bài viết" aria-label="Xem trước bài viết">👁️ Xem trước</button>
            <button type="button" class="blog-tool blog-tool--ghost" data-blog-score-open title="Chấm điểm AI" aria-label="Chấm điểm AI">🤖 Điểm AI</button>
          </div>
          <input type="file" accept="image/*" multiple data-blog-image-input hidden>
        </div>

        <div class="blog-canvas">
          <label class="blog-field blog-field--body">Nội dung bài viết
            <div class="blog-rich" data-blog-body contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-placeholder="Bắt đầu viết… Dán nội dung hoặc gõ trực tiếp. Bôi đen chữ để định dạng, rê chuột lên ảnh để chỉnh."></div>
          </label>
          <div class="blog-bubble" data-blog-bubble hidden role="toolbar" aria-label="Định dạng nhanh">${bubbleHtml()}</div>
          <div class="blog-figurebar" data-blog-figurebar hidden role="toolbar" aria-label="Tuỳ chỉnh ảnh">${figurebarHtml()}</div>
        </div>

        <div class="blog-actions">
          <button type="button" class="blog-primary" data-blog-save>Lưu &amp; đồng bộ GitHub</button>
          <button type="button" class="blog-ghost" data-blog-clear>🗑️ Xoá nháp</button>
        </div>
        <p class="blog-status" data-blog-status></p>
      </div>

      <aside class="blog-side" aria-label="Xuất bản">
        <h2 class="blog-side__title">Xuất bản</h2>
        <label class="blog-field">GitHub token (contents:write)
          <input type="password" data-blog-token value="${escapeHtml(settings.token)}" placeholder="ghp_… hoặc github_pat_…" autocomplete="off">
        </label>
        <label class="blog-field">Repository
          <input type="text" data-blog-repo value="${escapeHtml(settings.repo)}" placeholder="owner/repo">
        </label>
        <label class="blog-field">Branch
          <input type="text" data-blog-branch value="${escapeHtml(settings.branch)}" placeholder="main">
        </label>
        <label class="blog-field">Tags (phẩy)
          <input type="text" data-blog-tags value="${escapeHtml(draft.tags || '')}" placeholder="sức khoẻ, cà phê">
        </label>
        <label class="blog-field">Tác giả (tuỳ chọn)
          <input type="text" data-blog-author value="${escapeHtml(settings.author)}" placeholder="Tên bạn">
        </label>

        <fieldset class="blog-media">
          <legend class="blog-media__legend">Ảnh đại diện &amp; ảnh đầu bài</legend>

          <div class="blog-modes" role="radiogroup" aria-label="Nguồn ảnh">
            <label class="blog-mode"><input type="radio" name="blog-image-mode" value="upload" data-blog-mode ${isUpload ? 'checked' : ''}> <span>📤 Dùng ảnh tải lên (Local)</span></label>
            <label class="blog-mode"><input type="radio" name="blog-image-mode" value="auto" data-blog-mode ${isUpload ? '' : 'checked'}> <span>✨ Dùng ảnh Unsplash</span></label>
          </div>
          <p class="blog-mode-hint" data-blog-mode-hint hidden></p>

          <div class="blog-dropzone" data-blog-dropzone role="button" tabindex="0" aria-label="Tải ảnh lên" ${isUpload ? '' : 'hidden'}>
            <input type="file" accept="image/*" data-blog-file hidden>
            <span class="blog-dropzone__icon" aria-hidden="true">🖼️</span>
            <span class="blog-dropzone__hint">Kéo thả ảnh vào đây hoặc <strong>bấm để chọn</strong></span>
            <span class="blog-dropzone__name" data-blog-filename></span>
          </div>

          <div class="blog-thumb__frame"><img data-blog-thumb alt="Ảnh đại diện" hidden><span data-blog-thumb-empty>Chưa có ảnh</span></div>
          <div class="blog-thumb__actions">
            <button type="button" class="blog-ghost blog-ghost--sm" data-blog-thumb-refresh>🔄 Lấy ảnh khác</button>
            <button type="button" class="blog-ghost blog-ghost--sm" data-blog-thumb-clear>✖️ Xoá ảnh</button>
          </div>
          <p class="blog-thumb__credit" data-blog-credit></p>
        </fieldset>
      </aside>

      <!-- Preview is a right slide-over drawer over a dimmed backdrop; it never
           reflows the editor layout behind it. -->
      <div class="blog-preview-overlay" data-blog-preview-overlay hidden>
        <div class="blog-preview-drawer" role="dialog" aria-modal="true" aria-labelledby="blog-preview-label">
          <div class="blog-preview-drawer__head">
            <span id="blog-preview-label">👁️ Xem trước bài viết</span>
            <button type="button" class="blog-drawer__close" data-blog-preview-close aria-label="Đóng xem trước (Esc)">✕</button>
          </div>
          <div class="blog-preview-drawer__body">
            <article class="blog-preview-drawer__article">
              <h1 class="blog-preview-drawer__title" data-blog-preview-title></h1>
              <p class="blog-preview-drawer__meta" data-blog-preview-meta></p>
              <figure class="blog-preview-drawer__cover" data-blog-preview-cover-wrap hidden>
                <img data-blog-preview-cover alt="Ảnh đại diện">
              </figure>
              <div class="blog-preview-drawer__content md-content" data-blog-preview-content></div>
            </article>
          </div>
        </div>
      </div>
    </div>

    <aside class="blog-score-panel" data-blog-score-panel hidden aria-labelledby="blog-score-label">
      <div class="blog-score-panel__head">
        <span id="blog-score-label">🤖 Chấm điểm AI</span>
        <button type="button" class="blog-drawer__close" data-blog-score-close aria-label="Đóng bảng điểm (Esc)">✕</button>
      </div>
      <div class="blog-score-panel__body">
        <div class="blog-score-hero">
          <span class="blog-score-hero__value" data-blog-score-value>0.0</span>
          <span class="blog-score-hero__max">/5</span>
        </div>
        <p class="blog-score-hero__verdict" data-blog-score-verdict></p>
        <div class="blog-score-cats" data-blog-score-cats></div>
        <h3 class="blog-score-tips__title">Gợi ý nhanh</h3>
        <ul class="blog-score-tips__list" data-blog-score-tips></ul>
        <button type="button" class="blog-ghost blog-ghost--sm blog-score-panel__refresh" data-blog-score-open>🔄 Chấm lại</button>
      </div>
    </aside>
  </section>`;
  const rich = richEl(root);
  if (rich) rich.innerHTML = initialBody;
  restoreBody(root, state);
  syncImageMode(root, state);
  syncEmptyState(root);
  root.querySelector('#blog-title')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

function setStatus(root, message, kind = '') {
  const el = root.querySelector('[data-blog-status]');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('is-error', kind === 'error');
  el.classList.toggle('is-ok', kind === 'ok');
}

function richEl(root) {
  return root.querySelector('[data-blog-body]');
}

function syncEmptyState(root) {
  const rich = richEl(root);
  if (!rich) return;
  const empty = !rich.textContent?.trim() && !rich.querySelector('img');
  rich.classList.toggle('is-empty', empty);
}

function readForm(root) {
  return {
    title: root.querySelector('[data-blog-title]')?.value?.trim() || '',
    html: richEl(root)?.innerHTML || '',
    tags: root.querySelector('[data-blog-tags]')?.value || '',
    token: root.querySelector('[data-blog-token]')?.value?.trim() || '',
    repo: root.querySelector('[data-blog-repo]')?.value?.trim() || '',
    branch: root.querySelector('[data-blog-branch]')?.value?.trim() || '',
    author: root.querySelector('[data-blog-author]')?.value?.trim() || '',
    imageMode: root.querySelector('input[name="blog-image-mode"]:checked')?.value || 'auto',
  };
}

function persistDraft(root) {
  const form = readForm(root);
  saveDraft({ title: form.title, body: form.html, tags: form.tags });
}

// Wipe the whole working surface: title, body, staged inline images, the cover
// thumbnail and any open preview/score panels. `tags` clears the tag field too
// (used by the "Xoá nháp" action that also drops the saved draft).
function resetEditor(root, state, { tags = false } = {}) {
  const title = root.querySelector('[data-blog-title]');
  if (title) title.value = '';
  if (tags) {
    const tagField = root.querySelector('[data-blog-tags]');
    if (tagField) tagField.value = '';
  }
  const rich = richEl(root);
  if (rich) rich.innerHTML = '';
  clearDraft();

  if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = ''; }
  state.blobs.forEach((url) => URL.revokeObjectURL(url));
  state.blobs.clear();
  state.images.clear();
  state.imageSeq = 0;
  state.file = null;
  state.thumb = null;

  clearFigureSelection(root, state);
  hideFigurebar(root, state);
  hideBubble(root);
  closePreview(root);
  closeScore(root);
  resetDropzone(root);
  showThumb(root, null);
  syncImageMode(root, state);
  syncEmptyState(root);
}

// Toolbar "Xoá trắng": wipe everything after a quick confirmation.
function wipeEditor(root, state) {
  if (!window.confirm('Bạn có muốn xoá toàn bộ nội dung hiện tại để viết bài mới không?')) return;
  resetEditor(root, state);
  setStatus(root, 'Đã xoá trắng khung soạn thảo. Sẵn sàng cho bài mới.');
  root.querySelector('#blog-title')?.focus({ preventScroll: true });
}

// True when the author has supplied at least one image from their own device:
// a chosen cover file, a staged inline image, or a locally-uploaded thumbnail.
function hasLocalUpload(state) {
  return Boolean(state.file) || state.images.size > 0 || state.thumb?.provider === 'upload';
}

// Reflect the chosen source: uploads open the dropzone, Unsplash hides it. Both
// sources are allowed at once — an Unsplash cover can live alongside uploaded
// images in the body, so nothing is forced or locked here.
function syncImageMode(root, state) {
  const upload = root.querySelector('input[name="blog-image-mode"][value="upload"]');
  const usingUpload = Boolean(upload?.checked);
  setUploadZone(root, usingUpload);
  const hint = root.querySelector('[data-blog-mode-hint]');
  if (hint) { hint.textContent = ''; hint.hidden = true; }
  return usingUpload;
}

// Restore the draft body, dropping any images whose blob URL is no longer alive
// (a blob: URL dies on reload) so the editor never shows a broken-image icon.
function restoreBody(root, state) {
  const rich = richEl(root);
  if (!rich) return;
  let dropped = 0;
  rich.querySelectorAll('img[src^="blob:"]').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (state.blobs.has(src)) return;
    (img.closest('.blog-figure') || img).remove();
    dropped += 1;
  });
  enhanceFigures(root);
  if (dropped) {
    setStatus(root, `${dropped} ảnh chưa kịp upload đã bị xoá khi tải lại trang — vui lòng chèn lại.`, 'error');
  }
}

// First inline image that already points at a real URL (after uploads resolve),
// used as a fallback cover when the author only inserted images mid-post.
function firstInlineImageUrl(root) {
  const rich = richEl(root);
  if (!rich) return '';
  for (const img of rich.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (src && !src.startsWith('blob:')) return src;
  }
  return '';
}

// Wrap legacy/plain images (e.g. from an older draft) in the managed <figure>
// shape so the hover toolbar, caption and alignment work everywhere.
function enhanceFigures(root) {
  const rich = richEl(root);
  if (!rich) return;
  rich.querySelectorAll('img').forEach((img) => {
    if (img.closest('.blog-figure')) return;
    const figure = document.createElement('figure');
    figure.className = 'blog-figure';
    figure.dataset.align = DEFAULT_ALIGN;
    img.replaceWith(figure);
    figure.appendChild(img);
  });
}

function runCommand(root, command, value) {
  const rich = richEl(root);
  if (!rich) return;
  rich.focus({ preventScroll: true });
  try {
    if (value === undefined) document.execCommand(command); else document.execCommand(command, false, value);
  } catch { /* unsupported command */ }
  syncEmptyState(root);
}

function applyTool(root, action) {
  const tool = TOOLBAR.find((item) => item.action === action);
  if (!tool) return;
  if (tool.cmd) return runCommand(root, tool.cmd);
  if (tool.block) return runCommand(root, 'formatBlock', `<${tool.block}>`);
  if (tool.link) {
    const url = window.prompt('Nhập địa chỉ liên kết:', 'https://');
    if (url) runCommand(root, 'createLink', url);
    return;
  }
  if (tool.image) {
    root.querySelector('[data-blog-image-input]')?.click();
    return;
  }
  if (tool.clear) {
    runCommand(root, 'removeFormat');
    return runCommand(root, 'formatBlock', '<p>');
  }
  return runCommand(root, action);
}

// ---------------------------------------------------------------------------
// Inline image editing (hover toolbar, alignment, caption, delete)
// ---------------------------------------------------------------------------

function figurebarEl(root) {
  return root.querySelector('[data-blog-figurebar]');
}

function selectFigure(root, state, figure) {
  if (!figure) return;
  clearFigureSelection(root, state);
  figure.classList.add('is-selected');
  state.selectedFigure = figure;
}

function clearFigureSelection(root, state) {
  if (state.selectedFigure?.isConnected) state.selectedFigure.classList.remove('is-selected');
  state.selectedFigure = null;
}

function positionFigurebar(root, state) {
  const bar = figurebarEl(root);
  const figure = state.activeFigure;
  if (!bar || bar.hidden || !figure?.isConnected) return;
  const rect = figure.getBoundingClientRect();
  const width = bar.offsetWidth || 240;
  const height = bar.offsetHeight || 40;
  const top = Math.max(8, Math.min(rect.top + 10, window.innerHeight - bar.offsetHeight));
  const left = Math.max(8, Math.min(rect.right - bar.offsetWidth - 10, window.innerWidth - bar.offsetWidth - 8));
  bar.style.top = `${Math.round(top)}px`;
  bar.style.left = `${Math.round(left)}px`;
}

function showFigurebar(root, state, figure) {
  if (!figure?.isConnected) return;
  state.activeFigure = figure;
  const bar = figurebarEl(root);
  if (!bar) return;
  bar.hidden = false;
  if (window.clearTimeout) window.clearTimeout(state.figurebarTimer);
  positionFigurebar(root, state);
}

function hideFigurebar(root, state) {
  const bar = figurebarEl(root);
  if (bar) bar.hidden = true;
  state.activeFigure = null;
}

function scheduleHideFigurebar(root, state) {
  window.clearTimeout(state.figurebarTimer);
  state.figurebarTimer = window.setTimeout(() => hideFigurebar(root, state), 180);
}

function setFigureAlign(root, state, figure, align) {
  if (!figure) return;
  figure.dataset.align = FIGURE_ALIGNMENTS.includes(align) ? align : DEFAULT_ALIGN;
  persistDraft(root);
  positionFigurebar(root, state);
}

function focusFigureCaption(root, state, figure) {
  if (!figure) return;
  let caption = figure.querySelector('figcaption');
  if (!caption) {
    caption = document.createElement('figcaption');
    caption.setAttribute('contenteditable', 'plaintext-only');
    caption.dataset.placeholder = 'Viết chú thích cho ảnh…';
    figure.appendChild(caption);
  }
  const range = document.createRange();
  range.selectNodeContents(caption);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  caption.focus();
  syncEmptyState(root);
}

function deleteFigure(root, state, figure) {
  if (!figure) return;
  const staged = figure.querySelector('img[data-blog-upload]');
  if (staged) {
    const id = staged.getAttribute('data-blog-upload');
    const item = state.images.get(id);
    if (item?.url) {
      URL.revokeObjectURL(item.url);
      state.blobs.delete(item.url);
    }
    state.images.delete(id);
  }
  figure.remove();
  clearFigureSelection(root, state);
  hideFigurebar(root, state);
  syncImageMode(root, state);
  syncEmptyState(root);
  persistDraft(root);
  setStatus(root, 'Đã xoá ảnh khỏi bài viết.');
}

function showFigurebarFor(root, state, target) {
  const rich = richEl(root);
  const figure = target.closest?.('.blog-figure');
  if (figure && rich?.contains(figure)) {
    showFigurebar(root, state, figure);
    return true;
  }
  return false;
}

// Lightweight floating format bubble shown when the author selects text.
function hideBubble(root) {
  const bubble = root.querySelector('[data-blog-bubble]');
  if (bubble) bubble.hidden = true;
}

function updateBubble(root) {
  const bubble = root.querySelector('[data-blog-bubble]');
  const rich = richEl(root);
  if (!bubble || !rich) return;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) { bubble.hidden = true; return; }
  const range = selection.getRangeAt(0);
  if (!rich.contains(range.commonAncestorContainer) || !range.toString().trim()) { bubble.hidden = true; return; }
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) { bubble.hidden = true; return; }
  bubble.hidden = false;
  const width = bubble.offsetWidth || 220;
  const height = bubble.offsetHeight || 40;
  let top = rect.top - height - 8;
  if (top < 8) top = rect.bottom + 8;
  let left = rect.left + (rect.width / 2) - (width / 2);
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  bubble.style.top = `${Math.round(top)}px`;
  bubble.style.left = `${Math.round(left)}px`;
}

function showThumb(root, image) {
  const img = root.querySelector('[data-blog-thumb]');
  const empty = root.querySelector('[data-blog-thumb-empty]');
  const credit = root.querySelector('[data-blog-credit]');
  if (img) {
    if (image?.url) { img.src = image.url; img.hidden = false; }
    else { img.removeAttribute('src'); img.hidden = true; }
  }
  if (empty) empty.hidden = Boolean(image?.url);
  if (credit) {
    if (image?.provider === 'upload') credit.textContent = `Ảnh tải lên: ${image.credit || 'ảnh của bạn'}`;
    else if (image?.credit) credit.textContent = `Ảnh: ${image.credit} · ${image.provider}`;
    else if (image?.provider === 'auto') credit.textContent = 'Ảnh minh hoạ tự động';
    else credit.textContent = '';
  }
}

function setUploadZone(root, visible) {
  const zone = root.querySelector('[data-blog-dropzone]');
  if (zone) zone.hidden = !visible;
}

function resetDropzone(root) {
  const zone = root.querySelector('[data-blog-dropzone]');
  zone?.classList.remove('is-dragging', 'has-file');
  const name = root.querySelector('[data-blog-filename]');
  if (name) name.textContent = '';
}

async function refreshThumbnail(root) {
  const form = readForm(root);
  if (form.imageMode === 'upload') {
    root.querySelector('[data-blog-file]')?.click();
    return null;
  }
  if (!form.title && !form.tags) {
    setStatus(root, 'Nhập tiêu đề trước để lấy ảnh phù hợp.', 'error');
    return null;
  }
  setStatus(root, 'Đang tìm ảnh minh hoạ…');
  const image = await pickThumbnail({ title: form.title, tags: form.tags, slug: slugify(form.title) });
  showThumb(root, image);
  setStatus(root, '');
  return image;
}

// Accept a picked/dropped file: validate, preview locally, switch to upload mode.
function acceptFile(root, file, state) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { setStatus(root, 'Chỉ hỗ trợ tệp ảnh (PNG, JPG, WEBP…).', 'error'); return; }
  if (file.size > MAX_IMAGE_BYTES) { setStatus(root, `Ảnh vượt quá ${formatBytes(MAX_IMAGE_BYTES)}.`, 'error'); return; }

  const uploadRadio = root.querySelector('input[name="blog-image-mode"][value="upload"]');
  if (uploadRadio) uploadRadio.checked = true;
  setUploadZone(root, true);

  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.file = file;
  state.thumb = null;
  state.previewUrl = URL.createObjectURL(file);

  showThumb(root, { url: state.previewUrl, provider: 'upload', credit: file.name });
  const zone = root.querySelector('[data-blog-dropzone]');
  zone?.classList.add('has-file');
  const name = root.querySelector('[data-blog-filename]');
  if (name) name.textContent = `${file.name} · ${formatBytes(file.size)}`;
  syncImageMode(root, state);
  setStatus(root, 'Ảnh sẵn sàng — sẽ được upload lên GitHub khi bạn bấm Lưu.');
}

// Insert HTML where the caret is (falls back to appending at the end).
function insertHtmlAtCursor(root, html) {
  const rich = richEl(root);
  if (!rich) return;
  rich.focus({ preventScroll: true });
  const selection = window.getSelection();
  const hasCaret = selection && selection.rangeCount
    && rich.contains(selection.getRangeAt(0).commonAncestorContainer);
  try {
    if (hasCaret) document.execCommand('insertHTML', false, html);
    else rich.insertAdjacentHTML('beforeend', html);
  } catch {
    rich.insertAdjacentHTML('beforeend', html);
  }
  syncEmptyState(root);
}

// Toolbar 🖼️ button: pick any number of files, preview them inline at the caret
// and stage each one for upload when the post is saved.
function acceptToolbarImages(root, fileList, state) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  let added = 0;
  let skipped = 0;
  for (const file of files) {
    if (!/^image\//.test(file.type) || file.size > MAX_IMAGE_BYTES) { skipped += 1; continue; }
    const id = `img${++state.imageSeq}`;
    const url = URL.createObjectURL(file);
    state.blobs.add(url);
    state.images.set(id, { file, url });
    const label = escapeHtml(file.name.replace(/\.[^.]+$/, ''));
    insertHtmlAtCursor(root, `<figure class="blog-figure" data-align="${DEFAULT_ALIGN}"><img src="${url}" alt="${label}" data-blog-upload="${id}"></figure>`);
    added += 1;
  }
  if (added) {
    setStatus(root, `Đã chèn ${added} ảnh — sẽ upload lên GitHub khi bạn bấm Lưu.${skipped ? ` (bỏ qua ${skipped} tệp không hợp lệ)` : ''}`);
  } else {
    setStatus(root, 'Không có ảnh hợp lệ nào được chọn.', 'error');
  }
  syncImageMode(root, state);
}

// Upload every staged inline image and swap its blob URL for the GitHub URL.
async function resolvePendingImages(root, state, { repo, branch, token, slug }) {
  if (!state.images.size) return;
  const media = mediaConfig();
  for (const [id, item] of Array.from(state.images.entries())) {
    const img = root.querySelector(`[data-blog-upload="${id}"]`);
    if (!img) { state.images.delete(id); continue; }
    const filename = uploadFilename(slug, item.file.name);
    const asset = await uploadImage({ repo, branch, dir: media.dir, filename, file: item.file, token });
    img.src = assetPublicUrl(media.siteUrl, asset.path);
    img.removeAttribute('data-blog-upload');
  }
}

// ---------------------------------------------------------------------------
// Preview drawer (slide-over, not a fullscreen overlay)
// ---------------------------------------------------------------------------

function openPreview(root) {
  const overlay = root.querySelector('[data-blog-preview-overlay]');
  if (!overlay) return;
  const form = readForm(root);
  overlay.querySelector('[data-blog-preview-title]').textContent = form.title || 'Chưa có tiêu đề';
  const tags = form.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  overlay.querySelector('[data-blog-preview-meta]').textContent = [
    form.author,
    tags.length ? tags.map((tag) => `#${tag}`).join(' ') : '',
    new Date().toLocaleDateString('vi-VN'),
  ].filter(Boolean).join(' · ');

  const coverWrap = overlay.querySelector('[data-blog-preview-cover-wrap]');
  const coverImg = overlay.querySelector('[data-blog-preview-cover]');
  const coverUrl = root.querySelector('[data-blog-thumb]')?.getAttribute('src') || '';
  if (coverUrl) { coverImg.src = coverUrl; coverWrap.hidden = false; }
  else { coverImg.removeAttribute('src'); coverWrap.hidden = true; }

  const content = overlay.querySelector('[data-blog-preview-content]');
  content.innerHTML = '<p class="blog-preview__loading">Đang dựng bản xem trước…</p>';
  overlay.hidden = false;
  root.querySelector('.blog-screen')?.classList.add('is-previewing');
  document.body.classList.add('blog-drawer-open');
  const markdown = expandFigureShortcodes(markdownFromHtml(form.html));
  void loadMarked().then((marked) => {
    const render = typeof marked === 'function' ? marked : marked.parse;
    content.innerHTML = markdown ? render(markdown) : '<p><em>Chưa có nội dung.</em></p>';
  });
}

function closePreview(root) {
  const overlay = root.querySelector('[data-blog-preview-overlay]');
  if (overlay) overlay.hidden = true;
  root.querySelector('.blog-screen')?.classList.remove('is-previewing');
  document.body.classList.remove('blog-drawer-open');
}

// ---------------------------------------------------------------------------
// AI scoring panel (floating card, does not cover the writing area)
// ---------------------------------------------------------------------------

function scoreLevel(score) {
  if (score >= 4) return 'is-good';
  if (score >= 3) return 'is-mid';
  return 'is-low';
}

function openScore(root) {
  const panel = root.querySelector('[data-blog-score-panel]');
  if (!panel) return;
  const form = readForm(root);
  const result = scoreArticle({ title: form.title, markdown: markdownFromHtml(form.html) });

  panel.querySelector('[data-blog-score-value]').textContent = result.score.toFixed(1);
  const verdict = panel.querySelector('[data-blog-score-verdict]');
  verdict.textContent = result.verdict;
  verdict.dataset.level = scoreLevel(result.score).replace('is-', '');

  panel.querySelector('[data-blog-score-cats]').innerHTML = result.categories.map((cat) => `
    <article class="blog-score-cat ${scoreLevel(cat.score)}">
      <div class="blog-score-cat__head">
        <span class="blog-score-cat__label">${escapeHtml(cat.label)}</span>
        <span class="blog-score-cat__score">${cat.score.toFixed(1)}<small>/5</small></span>
      </div>
      <div class="blog-score-cat__bar"><span style="width:${(cat.score / 5) * 100}%"></span></div>
    </article>`).join('');

  const tips = result.suggestions.length
    ? result.suggestions
    : ['Tuyệt vời! Bài viết đã đạt gần như tối đa các tiêu chí.'];
  panel.querySelector('[data-blog-score-tips]').textContent = '';
  panel.querySelector('[data-blog-score-tips]').innerHTML = tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('');

  panel.hidden = false;
}

function closeScore(root) {
  const panel = root.querySelector('[data-blog-score-panel]');
  if (panel) panel.hidden = true;
}

function handleEscape(root, state) {
  const preview = root.querySelector('[data-blog-preview-overlay]');
  const score = root.querySelector('[data-blog-score-panel]');
  if (preview && !preview.hidden) { closePreview(root); return; }
  if (score && !score.hidden) { closeScore(root); return; }
  hideBubble(root);
  const bar = figurebarEl(root);
  if (bar && !bar.hidden) hideFigurebar(root, state);
  if (state.selectedFigure) clearFigureSelection(root, state);
}

async function onSave(root, state) {
  const form = readForm(root);
  const body = markdownFromHtml(form.html);
  if (!form.title) { setStatus(root, 'Vui lòng nhập tiêu đề bài viết.', 'error'); return; }
  if (!body) { setStatus(root, 'Vui lòng nhập nội dung bài viết.', 'error'); return; }
  if (!form.token) { setStatus(root, 'Nhập GitHub token để sync.', 'error'); return; }
  if (!/^[^/\s]+\/[^/\s]+$/.test(form.repo)) { setStatus(root, 'Repository phải có dạng owner/repo.', 'error'); return; }

  saveSettings({ token: form.token, repo: form.repo, branch: form.branch, author: form.author, imageMode: form.imageMode });

  const saveButton = root.querySelector('[data-blog-save]');
  if (saveButton) saveButton.disabled = true;
  try {
    const slug = state.editSlug || slugify(form.title);
    if (state.images?.size) {
      setStatus(root, 'Đang upload ảnh trong bài lên GitHub…');
      await resolvePendingImages(root, state, { repo: form.repo, branch: form.branch, token: form.token, slug });
    }
    // Re-read after inline uploads so the Markdown holds the final image URLs.
    const finalBody = markdownFromHtml(richEl(root)?.innerHTML || '');
    let cover = null;
    // Both sources can be used together: an uploaded cover wins the thumbnail
    // slot, otherwise the chosen Unsplash image, otherwise an auto pick. Inline
    // local images always stay in the body either way.
    if (state.file) {
      const media = mediaConfig();
      const filename = uploadFilename(slug, state.file.name);
      setStatus(root, 'Đang upload ảnh lên GitHub…');
      const asset = await uploadImage({
        repo: form.repo, branch: form.branch, dir: media.dir,
        filename, file: state.file, token: form.token,
      });
      cover = { url: assetPublicUrl(media.siteUrl, asset.path), provider: 'upload', credit: state.file.name };
    } else if (state.thumb?.url) {
      cover = state.thumb;
    } else {
      cover = await pickThumbnail({ title: form.title, tags: form.tags, slug });
    }

    const frontMatter = buildFrontMatter({
      title: form.title,
      date: isoNow(),
      tags: form.tags,
      cover: cover?.url || '',
      coverAlt: form.title,
      draft: false,
      author: form.author,
    });
    const content = buildPostMarkdown({
      frontMatter,
      image: cover?.url || '',
      imageAlt: form.title,
      body: finalBody,
    });

    setStatus(root, `Đang commit ${postPath(slug)} …`);
    const result = await commitPost({
      repo: form.repo, branch: form.branch, slug, path: state.editPath || undefined,
      title: form.title, content, token: form.token, sha: state.editSha || undefined,
    });
    clearDraft();
    const editing = Boolean(state.editPath);
    setStatus(root, `${result.created ? 'Đã tạo' : 'Đã cập nhật'} ${result.path}. ${editing ? 'Đang về danh sách…' : 'Đang về trang chủ…'}`, 'ok');
    window.setTimeout(() => {
      if (editing) { window.location.hash = '#/blog'; return; }
      const home = document.querySelector('.navbar__logo')?.getAttribute('href') || '/';
      window.location.assign(home);
    }, 1400);
  } catch (error) {
    setStatus(root, error.message || 'Không lưu được bài viết.', 'error');
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Routes + post manager (#/blog = list, #/blog/new = new, #/blog/edit/<path>)
// ---------------------------------------------------------------------------

function blogRoute() {
  const hash = location.hash || '';
  if (hash.startsWith('#/blog/edit/')) {
    return { view: 'editor', path: decodeURIComponent(hash.slice('#/blog/edit/'.length)) };
  }
  if (hash.startsWith('#/blog/new')) return { view: 'editor', path: '' };
  return { view: 'list', path: '' };
}

// Markdown → editor HTML: expand figure shortcodes then render with `marked`,
// converting the resulting <figure>s back into the editor's managed shape.
async function markdownToEditorHtml(markdown = '') {
  const marked = await loadMarked();
  const render = typeof marked === 'function' ? marked : marked.parse;
  const tpl = document.createElement('div');
  tpl.innerHTML = render(expandFigureShortcodes(markdown));
  tpl.querySelectorAll('figure').forEach((fig) => {
    if (!fig.querySelector('img')) return;
    const align = fig.classList.contains('md-figure--center') ? 'center'
      : fig.classList.contains('md-figure--full') ? 'full' : 'left';
    tpl.querySelectorAll;
    fig.className = 'blog-figure';
    fig.dataset.align = align;
  });
  return tpl.innerHTML;
}

function coverProvider(url = '') {
  return /\/uploads\//.test(url) ? 'upload' : 'auto';
}

async function loadPostIntoEditor(root, state, path) {
  const settings = getSettings();
  setStatus(root, 'Đang tải bài viết để chỉnh sửa…');
  const { text, sha } = await getPostFile({ repo: settings.repo, branch: settings.branch, token: settings.token, path });
  const parsed = parsePostMarkdown(text);

  // The cover is also the first body image (see buildPostMarkdown); drop it from
  // the body so saving again does not duplicate it.
  let body = parsed.body;
  let cover = parsed.cover;
  const lead = body.match(/^\s*!\[[^\]]*\]\(([^)\s]+)[^)]*\)\s*/);
  if (lead) {
    if (!cover) cover = lead[1];
    if (lead[1] === cover) body = body.slice(lead[0].length);
  }

  root.querySelector('[data-blog-title]').value = parsed.title || '';
  root.querySelector('[data-blog-tags]').value = (parsed.tags || []).join(', ');
  const rich = richEl(root);
  if (rich) rich.innerHTML = await markdownToEditorHtml(body);

  state.thumb = cover
    ? { url: cover, provider: /\/uploads\//.test(cover) ? 'upload' : 'auto', credit: '' }
    : null;
  state.file = null;
  showThumb(root, state.thumb);
  state.editPath = path;
  state.editSha = '';
  state.editSlug = slugFromPostPath(path);
  enhanceFigures(root);
  syncImageMode(root, state);
  syncEmptyState(root);
  setStatus(root, `Đang sửa “${parsed.title || state.editSlug}”. Lưu sẽ cập nhật bài trên GitHub.`);
}

function managerShellHtml(settings) {
  return `<section class="blog-screen blog-manage" aria-labelledby="blog-manage-title">
    <header class="blog-head">
      <a class="blog-back" href="#" data-blog-home>← Trang chủ</a>
      <p class="blog-eyebrow">BLOGCO · QUẢN LÝ</p>
      <h1 id="blog-manage-title" tabindex="-1">Quản lý bài viết</h1>
      <p>Sửa hoặc xoá bài đã đăng. Thay đổi áp dụng thẳng lên GitHub.</p>
    </header>
    <div class="blog-manage__bar">
      <a class="blog-primary" href="#/blog/new">✍️ Viết bài mới</a>
      <button type="button" class="blog-ghost" data-blog-list-refresh>🔄 Tải lại</button>
      <details class="blog-manage__settings">
        <summary>⚙️ Kết nối GitHub</summary>
        <label class="blog-field">Token
          <input type="password" data-blog-token value="${escapeHtml(settings.token)}" placeholder="ghp_… (cần quyền contents:write)" autocomplete="off">
        </label>
        <label class="blog-field">Repository
          <input type="text" data-blog-repo value="${escapeHtml(settings.repo)}" placeholder="owner/repo">
        </label>
        <label class="blog-field">Branch
          <input type="text" data-blog-branch value="${escapeHtml(settings.branch)}" placeholder="main">
        </label>
      </details>
    </div>
    <p class="blog-status" data-blog-status></p>
    <ul class="blog-manage__list" data-blog-list aria-busy="true"></ul>
  </section>`;
}

function postCardHtml(post) {
  const tags = (post.tags || []).map((tag) => `#${tag}`).join(' ');
  const date = post.date ? new Date(post.date).toLocaleDateString('vi-VN') : '';
  const meta = [date, tags].filter(Boolean).join(' · ');
  const cover = post.cover
    ? `<img src="${escapeHtml(post.cover)}" alt="" loading="lazy">`
    : '<span aria-hidden="true">📝</span>';
  const href = `#/blog/edit/${post.path.split('/').map(encodeURIComponent).join('/')}`;
  return `<li class="blog-manage__item" data-blog-post data-blog-path="${escapeHtml(post.path)}" data-blog-sha="${escapeHtml(post.sha || '')}">
    <span class="blog-manage__media">${cover}</span>
    <div class="blog-manage__body">
      <h2 class="blog-manage__title">${escapeHtml(post.title || post.name || 'Không có tiêu đề')}</h2>
      ${meta ? `<p class="blog-manage__meta">${escapeHtml(meta)}</p>` : ''}
    </div>
    <div class="blog-manage__actions">
      <a class="blog-ghost blog-ghost--sm" href="${escapeHtml(href)}">✏️ Sửa</a>
      <button type="button" class="blog-ghost blog-ghost--sm blog-ghost--danger" data-blog-post-delete>🗑️ Xóa</button>
    </div>
  </li>`;
}

async function renderList(root, state) {
  const settings = getSettings();
  state.view = 'list';
  state.editPath = '';
  root.innerHTML = managerShellHtml(settings);
  const list = root.querySelector('[data-blog-list]');
  list.innerHTML = '<li class="blog-manage__state">Đang tải danh sách bài viết…</li>';
  try {
    const files = (await listPostFiles({ repo: settings.repo, branch: settings.branch, token: settings.token }))
      .filter((file) => /\.md$/i.test(file.name || ''));
    if (!files.length) {
      list.setAttribute('aria-busy', 'false');
      list.innerHTML = '<li class="blog-manage__state">Chưa có bài viết nào. Bấm “Viết bài mới” để tạo bài đầu tiên.</li>';
      return;
    }
    const posts = await Promise.all(files.map(async (file) => {
      let meta = { title: '', date: '', tags: [], cover: '' };
      try {
        meta = parsePostMarkdown(await fetchPostText(file, { repo: settings.repo, branch: settings.branch }));
      } catch { /* keep filename fallback */ }
      return { ...meta, path: file.path, sha: file.sha, name: file.name };
    }));
    posts.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    list.setAttribute('aria-busy', 'false');
    list.innerHTML = posts.map(postCardHtml).join('');
  } catch (error) {
    list.setAttribute('aria-busy', 'false');
    list.innerHTML = `<li class="blog-manage__state is-error">${escapeHtml(error.message || 'Không tải được danh sách bài viết.')}</li>`;
  }
}

async function deletePostItem(root, state, item) {
  if (!item) return;
  const settings = getSettings();
  if (!window.confirm('Bạn có chắc chắn muốn xóa bài viết này không?')) return;
  if (!settings.token) { setStatus(root, 'Nhập GitHub token (mục “Kết nối GitHub”) để xoá bài viết.', 'error'); return; }
  const button = item.querySelector('[data-blog-post-delete]');
  if (button) button.disabled = true;
  try {
    await deletePost({ repo: settings.repo, branch: settings.branch, token: settings.token, path: item.dataset.blogPath, sha: item.dataset.blogSha });
    item.remove();
    setStatus(root, 'Đã xoá bài viết.', 'ok');
    if (!root.querySelector('[data-blog-post]')) {
      root.querySelector('[data-blog-list]').innerHTML = '<li class="blog-manage__state">Chưa còn bài viết nào.</li>';
    }
  } catch (error) {
    if (button) button.disabled = false;
    setStatus(root, error.message || 'Không xoá được bài viết.', 'error');
  }
}

function renderRoute(root, state) {
  const route = blogRoute();
  const key = `${route.view}:${route.path}`;
  if (state.routeKey !== key) {
    state.routeKey = key;
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = ''; }
    state.blobs.clear();
    state.images.clear();
    state.imageSeq = 0;
    state.file = null;
    state.thumb = null;
    state.editPath = '';
    state.editSha = '';
    state.editSlug = '';
    state.selectedFigure = null;
    state.activeFigure = null;
    state.view = route.view;
  }
  if (route.view === 'list') { void renderList(root, state); return; }
  renderEditor(root, state);
  if (route.path) {
    void loadPostIntoEditor(root, state, route.path)
      .catch((error) => setStatus(root, error.message || 'Không tải được bài viết.', 'error'));
  }
}

export function mountBlogApp(root = document.querySelector('[data-blog-app]')) {
  if (!root) return;
  const state = {
    thumb: null, file: null, previewUrl: '',
    images: new Map(), blobs: new Set(), imageSeq: 0,
    activeFigure: null, selectedFigure: null,
  };
  if (!root.dataset.mounted) {
    root.dataset.mounted = 'true';
    const dropzone = () => root.querySelector('[data-blog-dropzone]');
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ }

    root.addEventListener('click', (event) => {
      const tool = event.target.closest('[data-blog-tool]');
      if (tool) {
        if (tool.dataset.blogTool === 'wipe') { wipeEditor(root, state); return; }
        applyTool(root, tool.dataset.blogTool); hideBubble(root); return;
      }

      const align = event.target.closest('[data-blog-fig-align]');
      if (align) { setFigureAlign(root, state, state.activeFigure, align.dataset.blogFigAlign); return; }
      if (event.target.closest('[data-blog-fig-caption]')) { focusFigureCaption(root, state, state.activeFigure); return; }
      if (event.target.closest('[data-blog-fig-delete]')) { deleteFigure(root, state, state.activeFigure); return; }

      if (event.target.closest('[data-blog-dropzone]')) {
        if (!event.target.closest('[data-blog-file]')) root.querySelector('[data-blog-file]')?.click();
        return;
      }
      if (event.target.closest('[data-blog-thumb-refresh]')) { void refreshThumbnail(root).then((img) => { if (img) state.thumb = img; }); return; }
      if (event.target.closest('[data-blog-thumb-clear]')) {
        if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = ''; }
        state.file = null;
        state.thumb = null;
        resetDropzone(root);
        showThumb(root, null);
        syncImageMode(root, state);
        setStatus(root, 'Đã xoá ảnh.');
        return;
      }
      if (event.target.closest('[data-blog-save]')) { void onSave(root, state); return; }
      if (event.target.closest('[data-blog-preview-open]')) { openPreview(root); return; }
      if (event.target.closest('[data-blog-preview-close]')) { closePreview(root); return; }
      if (event.target.closest('[data-blog-preview-overlay]') && !event.target.closest('.blog-preview-drawer')) { closePreview(root); return; }
      if (event.target.closest('[data-blog-score-open]')) { openScore(root); return; }
      if (event.target.closest('[data-blog-score-close]')) { closeScore(root); return; }
      if (event.target.closest('[data-blog-clear]')) {
        if (window.confirm('Xoá bản nháp đang soạn trên thiết bị này?')) {
          resetEditor(root, state, { tags: true });
          setStatus(root, 'Đã xoá nháp.');
        }
        return;
      }

      const deleteBtn = event.target.closest('[data-blog-post-delete]');
      if (deleteBtn) { void deletePostItem(root, state, deleteBtn.closest('[data-blog-post]')); return; }
      if (event.target.closest('[data-blog-list-refresh]')) { void renderList(root, state); return; }

      // Select an inline image (enables Delete/Backspace) or clear the selection.
      const image = event.target.closest('img');
      if (image && richEl(root)?.contains(image)) {
        const figure = image.closest('.blog-figure');
        if (figure) selectFigure(root, state, figure);
        return;
      }
      if (event.target.closest('[data-blog-body]') && !event.target.closest('.blog-figure')) {
        clearFigureSelection(root, state);
      }
    });

    // Keep the text selection alive when clicking the floating format bubble.
    root.addEventListener('mousedown', (event) => {
      if (event.target.closest('[data-blog-bubble]')) event.preventDefault();
    });

    root.addEventListener('mouseover', (event) => {
      if (showFigurebarFor(root, state, event.target)) return;
      if (event.target.closest?.('[data-blog-figurebar]')) { window.clearTimeout(state.figurebarTimer); return; }
      if (state.activeFigure) scheduleHideFigurebar(root, state);
    });

    root.addEventListener('mouseleave', () => { if (state.activeFigure) scheduleHideFigurebar(root, state); });

    root.addEventListener('mouseup', (event) => {
      if (!event.target.closest?.('[data-blog-figurebar]')) window.setTimeout(() => updateBubble(root), 0);
    });

    root.addEventListener('keyup', (event) => {
      if (event.key === 'Shift' || event.key === 'Meta' || event.key === 'Control') return;
      window.setTimeout(() => updateBubble(root), 0);
    });

    root.addEventListener('input', (event) => {
      if (event.target.matches?.('input[name="blog-image-mode"]')) return;
      if (!richEl(root)) return; // manager view has no draft
      if (event.target.closest?.('[data-blog-body]')) syncEmptyState(root);
      persistDraft(root);
    });

    root.addEventListener('paste', (event) => {
      if (!event.target.closest?.('[data-blog-body]')) return;
      const data = event.clipboardData;
      if (!data) return;
      event.preventDefault();
      const html = data.getData('text/html');
      const payload = html ? sanitizePastedHtml(html) : plainTextToHtml(data.getData('text/plain'));
      try {
        document.execCommand('insertHTML', false, payload);
      } catch {
        richEl(root)?.insertAdjacentHTML('beforeend', payload);
      }
      enhanceFigures(root);
      window.setTimeout(() => syncEmptyState(root), 0);
    });

    root.addEventListener('keydown', (event) => {
      const zone = event.target.closest?.('[data-blog-dropzone]');
      if (zone && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        root.querySelector('[data-blog-file]')?.click();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace')
        && state.selectedFigure
        && event.target.closest?.('[data-blog-body]')
        && !event.target.closest('figcaption')) {
        event.preventDefault();
        deleteFigure(root, state, state.selectedFigure);
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.target.closest?.('[data-blog-body]')) {
        if (event.key === 'b') { event.preventDefault(); runCommand(root, 'bold'); }
        if (event.key === 'i') { event.preventDefault(); runCommand(root, 'italic'); }
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') handleEscape(root, state);
    });

    const reposition = () => { if (state.activeFigure) positionFigurebar(root, state); };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    root.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches?.('[data-blog-mode]')) {
        const wantsAuto = target.value === 'auto';
        if (wantsAuto) {
          if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = ''; }
          state.file = null;
          resetDropzone(root);
          showThumb(root, state.thumb?.provider === 'upload' ? null : state.thumb);
          setStatus(root, 'Chế độ Unsplash: bấm “Lấy ảnh khác” để lấy ảnh minh hoạ.');
        } else {
          if (state.thumb?.provider !== 'upload') { state.thumb = null; }
          showThumb(root, state.previewUrl ? { url: state.previewUrl, provider: 'upload', credit: state.file?.name || '' } : null);
          setStatus(root, 'Chế độ tải lên: chọn ảnh từ máy để làm ảnh đại diện.');
        }
        syncImageMode(root, state);
        return;
      }
      if (target.matches?.('[data-blog-file]')) { acceptFile(root, target.files?.[0], state); return; }
      if (target.matches?.('[data-blog-image-input]')) { acceptToolbarImages(root, target.files, state); return; }
      if (target.matches?.('[data-blog-token], [data-blog-repo], [data-blog-branch], [data-blog-author]')) {
        saveSettings({
          token: root.querySelector('[data-blog-token]')?.value?.trim() || '',
          repo: root.querySelector('[data-blog-repo]')?.value?.trim() || '',
          branch: root.querySelector('[data-blog-branch]')?.value?.trim() || '',
          author: root.querySelector('[data-blog-author]')?.value?.trim() || '',
        });
      }
    });

    root.addEventListener('dragover', (event) => {
      if (!dropzone()) return;
      event.preventDefault();
      dropzone()?.classList.add('is-dragging');
    });
    root.addEventListener('dragleave', (event) => {
      if (event.target === dropzone()) dropzone()?.classList.remove('is-dragging');
    });
    root.addEventListener('drop', (event) => {
      const zone = dropzone();
      if (!zone || !event.target.closest?.('[data-blog-dropzone]')) return;
      event.preventDefault();
      zone.classList.remove('is-dragging');
      acceptFile(root, event.dataTransfer?.files?.[0], state);
    });
  }
  renderRoute(root, state);
}
