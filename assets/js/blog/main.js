// In-browser Markdown editor that publishes a post to the blog repository via
// the GitHub contents API. Mounted at #/blog/new (a "Viết blog mới" entry).

import { slugify, buildFrontMatter, buildPostMarkdown, isoNow, postPath } from './lib.js';
import { getSettings, saveSettings, getDraft, saveDraft, clearDraft, commitPost } from './store.js';
import { pickThumbnail } from './thumbnail.js';

let markedPromise;
function loadMarked() {
  markedPromise ??= import('marked').then((mod) => mod.marked || mod.default);
  return markedPromise;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

const TOOLBAR = [
  { action: 'bold', label: 'B', title: 'In đậm (Ctrl+B)', wrap: ['**', '**'] },
  { action: 'italic', label: 'I', title: 'In nghiêng (Ctrl+I)', wrap: ['_', '_'] },
  { action: 'h2', label: 'H2', title: 'Tiêu đề H2', line: '## ' },
  { action: 'h3', label: 'H3', title: 'Tiêu đề H3', line: '### ' },
  { action: 'bullet', label: '•', title: 'Danh sách chấm', line: '- ' },
  { action: 'number', label: '1.', title: 'Danh sách số', line: '1. ' },
  { action: 'quote', label: '❝', title: 'Trích dẫn', line: '> ' },
  { action: 'link', label: '🔗', title: 'Chèn liên kết', wrap: ['[', '](https://)'] },
  { action: 'code', label: '</>', title: 'Code block', block: '```\n', blockEnd: '\n```' },
];

function toolbarHtml() {
  return TOOLBAR.map((tool) => `<button type="button" class="blog-tool" data-blog-tool="${tool.action}" title="${escapeHtml(tool.title)}" aria-label="${escapeHtml(tool.title)}">${escapeHtml(tool.label)}</button>`).join('');
}

function renderEditor(root) {
  const settings = getSettings();
  const draft = getDraft();
  root.innerHTML = `<section class="blog-screen" aria-labelledby="blog-title">
    <header class="blog-head">
      <a class="blog-back" href="#" data-blog-home>← Trang chủ</a>
      <p class="blog-eyebrow">BLOGCO · STUDIO</p>
      <h1 id="blog-title" tabindex="-1">Viết blog mới</h1>
      <p>Soạn Markdown, tự lấy ảnh thumbnail và sync thẳng lên GitHub.</p>
    </header>

    <div class="blog-layout">
      <div class="blog-editor">
        <label class="blog-field">Tiêu đề bài viết
          <input type="text" data-blog-title value="${escapeHtml(draft.title)}" placeholder="VD: Kinh nghiệm uống cà phê lành mạnh">
        </label>

        <div class="blog-toolbar" role="toolbar" aria-label="Định dạng Markdown">${toolbarHtml()}</div>

        <label class="blog-field blog-field--grow">Nội dung (Markdown)
          <textarea data-blog-body spellcheck="false" placeholder="# Tiêu đề&#10;&#10;Viết nội dung ở đây…">${escapeHtml(draft.body)}</textarea>
        </label>

        <div class="blog-actions">
          <button type="button" class="blog-primary" data-blog-save>💾 Lưu &amp; Sync GitHub</button>
          <button type="button" class="blog-ghost" data-blog-preview-toggle>👁️ Xem trước</button>
          <button type="button" class="blog-ghost" data-blog-clear>🗑️ Xoá nháp</button>
        </div>
        <p class="blog-status" data-blog-status role="status" aria-live="polite"></p>
      </div>

      <aside class="blog-side">
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
        <label class="blog-check"><input type="checkbox" data-blog-autoimage ${settings.autoImage ? 'checked' : ''}> Tự lấy ảnh thumbnail</label>

        <div class="blog-thumb">
          <p class="blog-thumb__label">Thumbnail (ảnh đầu bài)</p>
          <div class="blog-thumb__frame"><img data-blog-thumb alt="Ảnh thumbnail" hidden><span data-blog-thumb-empty>Chưa có ảnh</span></div>
          <button type="button" class="blog-ghost blog-ghost--sm" data-blog-thumb-refresh>🔄 Lấy ảnh khác</button>
          <p class="blog-thumb__credit" data-blog-credit></p>
        </div>

        <div class="blog-preview" data-blog-preview hidden>
          <p class="blog-preview__label">Xem trước</p>
          <div class="blog-preview__body md-content" data-blog-preview-body></div>
        </div>
      </aside>
    </div>
  </section>`;
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------

export function applyWrap(textarea, before, after) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
  textarea.value = next;
  const caret = start + before.length + selected.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
}

export function applyLinePrefix(textarea, prefix) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const block = value.slice(lineStart, end);
  const updated = block.split('\n').map((line) => `${prefix}${line}`).join('\n');
  textarea.value = `${value.slice(0, lineStart)}${updated}${value.slice(end)}`;
  textarea.focus();
}

export function applyBlock(textarea, open, close) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || '';
  const next = `${value.slice(0, start)}${open}${selected}${close}${value.slice(end)}`;
  textarea.value = next;
  textarea.focus();
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

function readForm(root) {
  return {
    title: root.querySelector('[data-blog-title]')?.value?.trim() || '',
    body: root.querySelector('[data-blog-body]')?.value || '',
    tags: root.querySelector('[data-blog-tags]')?.value || '',
    token: root.querySelector('[data-blog-token]')?.value?.trim() || '',
    repo: root.querySelector('[data-blog-repo]')?.value?.trim() || '',
    branch: root.querySelector('[data-blog-branch]')?.value?.trim() || 'main',
    author: root.querySelector('[data-blog-author]')?.value?.trim() || '',
    autoImage: Boolean(root.querySelector('[data-blog-autoimage]')?.checked),
  };
}

function showThumb(root, image) {
  const img = root.querySelector('[data-blog-thumb]');
  const empty = root.querySelector('[data-blog-thumb-empty]');
  const credit = root.querySelector('[data-blog-credit]');
  if (img) {
    img.src = image?.url || '';
    img.hidden = !image?.url;
  }
  if (empty) empty.hidden = Boolean(image?.url);
  if (credit) credit.textContent = image?.credit ? `Ảnh: ${image.credit}${image.provider ? ` · ${image.provider}` : ''}` : (image?.provider === 'auto' ? 'Ảnh minh hoạ tự động' : '');
}

async function refreshThumbnail(root, { force = false } = {}) {
  const form = readForm(root);
  if (!form.title && !form.tags) {
    setStatus(root, 'Nhập tiêu đề trước để lấy ảnh phù hợp.', 'error');
    return null;
  }
  setStatus(root, 'Đang tìm ảnh thumbnail…');
  const image = await pickThumbnail({ title: form.title, tags: form.tags, slug: slugify(form.title) });
  showThumb(root, image);
  setStatus(root, '');
  return image;
}

function togglePreview(root) {
  const box = root.querySelector('[data-blog-preview]');
  const body = root.querySelector('[data-blog-preview-body]');
  if (!box || !body) return;
  box.hidden = !box.hidden;
  if (box.hidden) return;
  const form = readForm(root);
  loadMarked().then((marked) => {
    const render = typeof marked === 'function' ? marked : marked.parse;
    body.innerHTML = render(form.body || '_Chưa có nội dung._');
  });
}

async function onSave(root, image) {
  const form = readForm(root);
  if (!form.title) { setStatus(root, 'Vui lòng nhập tiêu đề bài viết.', 'error'); return; }
  if (!form.body.trim()) { setStatus(root, 'Vui lòng nhập nội dung bài viết.', 'error'); return; }
  if (!form.token) { setStatus(root, 'Nhập GitHub token để sync.', 'error'); return; }
  if (!/^[^/\s]+\/[^/\s]+$/.test(form.repo)) { setStatus(root, 'Repository phải có dạng owner/repo.', 'error'); return; }

  saveSettings({ token: form.token, repo: form.repo, branch: form.branch, author: form.author, autoImage: form.autoImage });

  const saveButton = root.querySelector('[data-blog-save]');
  if (saveButton) saveButton.disabled = true;
  try {
    let cover = image;
    if (!cover?.url && form.autoImage) cover = await pickThumbnail({ title: form.title, tags: form.tags, slug: slugify(form.title) });
    const slug = slugify(form.title);
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
      image: form.autoImage ? (cover?.url || '') : '',
      imageAlt: form.title,
      body: form.body,
    });
    setStatus(root, `Đang commit ${postPath(slug)} …`);
    const result = await commitPost({ repo: form.repo, branch: form.branch, slug, title: form.title, content, token: form.token });
    clearDraft();
    setStatus(root, `${result.created ? 'Đã tạo' : 'Đã cập nhật'} ${result.path}. Đang về trang chủ…`, 'ok');
    window.setTimeout(() => {
      const home = document.querySelector('.navbar__logo')?.getAttribute('href') || '/';
      window.location.assign(home);
    }, 1400);
  } catch (error) {
    setStatus(root, error.message || 'Không lưu được bài viết.', 'error');
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

export function mountBlogApp(root = document.querySelector('[data-blog-app]')) {
  if (!root) return;
  if (!root.dataset.mounted) {
    root.dataset.mounted = 'true';
    let thumb = null;

    root.addEventListener('click', (event) => {
      const tool = event.target.closest('[data-blog-tool]');
      const textarea = root.querySelector('[data-blog-body]');
      if (tool && textarea) {
        const spec = TOOLBAR.find((item) => item.action === tool.dataset.blogTool);
        if (spec?.wrap) applyWrap(textarea, spec.wrap[0], spec.wrap[1]);
        else if (spec?.line) applyLinePrefix(textarea, spec.line);
        else if (spec?.block) applyBlock(textarea, spec.block, spec.blockEnd || '');
        return;
      }
      if (event.target.closest('[data-blog-preview-toggle]')) { togglePreview(root); return; }
      if (event.target.closest('[data-blog-thumb-refresh]')) { void refreshThumbnail(root, { force: true }).then((img) => { thumb = img; }); return; }
      if (event.target.closest('[data-blog-save]')) { void onSave(root, thumb); return; }
      if (event.target.closest('[data-blog-clear]')) {
        if (window.confirm('Xoá bản nháp đang soạn trên thiết bị này?')) {
          root.querySelector('[data-blog-title]').value = '';
          root.querySelector('[data-blog-body]').value = '';
          root.querySelector('[data-blog-tags]').value = '';
          clearDraft();
          showThumb(root, null);
          setStatus(root, 'Đã xoá nháp.');
        }
        return;
      }
      if (event.target.closest('[data-blog-home]')) {
        event.preventDefault();
        window.location.hash = '';
      }
    });

    root.addEventListener('input', () => {
      const form = readForm(root);
      saveDraft({ title: form.title, body: form.body, tags: form.tags });
    });

    root.addEventListener('keydown', (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const textarea = root.querySelector('[data-blog-body]');
      if (event.target !== textarea) return;
      if (event.key === 'b') { event.preventDefault(); applyWrap(textarea, '**', '**'); }
      if (event.key === 'i') { event.preventDefault(); applyWrap(textarea, '_', '_'); }
    });
  }
  renderEditor(root);
}
