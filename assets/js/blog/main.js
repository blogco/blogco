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

import TurndownService from 'turndown';
import {
  slugify, buildFrontMatter, buildPostMarkdown, isoNow, postPath,
  uploadFilename, assetPublicUrl,
} from './lib.js';
import {
  getSettings, saveSettings, getDraft, saveDraft, clearDraft, commitPost,
  uploadImage, mediaConfig,
} from './store.js';
import { pickThumbnail } from './thumbnail.js';
import { escapeHtml, plainTextToHtml, sanitizePastedHtml, cleanMarkdown } from './rich.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // GitHub contents API friendly ceiling.

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
  }
  return cleanMarkdown(turndown.turndown(html || ''));
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
  { action: 'clear', label: '✨', title: 'Xoá định dạng', clear: true },
];

function toolbarHtml() {
  return TOOLBAR.map((tool) => `<button type="button" class="blog-tool" data-blog-tool="${tool.action}" title="${escapeHtml(tool.title)}" aria-label="${escapeHtml(tool.title)}">${escapeHtml(tool.label)}</button>`).join('');
}

function renderEditor(root) {
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
        <label class="blog-field">Tiêu đề bài viết
          <input type="text" data-blog-title value="${escapeHtml(draft.title)}" placeholder="VD: Kinh nghiệm uống cà phê lành mạnh">
        </label>

        <div class="blog-toolbar" role="toolbar" aria-label="Định dạng văn bản">${toolbarHtml()}</div>

        <label class="blog-field blog-field--grow">Nội dung bài viết
          <div class="blog-rich" data-blog-body contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" data-placeholder="Dán nội dung bài viết vào đây — xuống dòng và đoạn văn tự nhận."></div>
        </label>

        <div class="blog-actions">
          <button type="button" class="blog-primary" data-blog-save>💾 Lưu &amp; Sync GitHub</button>
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

        <fieldset class="blog-media">
          <legend class="blog-media__legend">Ảnh đại diện &amp; ảnh đầu bài</legend>

          <div class="blog-modes" role="radiogroup" aria-label="Nguồn ảnh">
            <label class="blog-mode"><input type="radio" name="blog-image-mode" value="upload" data-blog-mode ${isUpload ? 'checked' : ''}> <span>📤 Upload từ máy</span></label>
            <label class="blog-mode"><input type="radio" name="blog-image-mode" value="auto" data-blog-mode ${isUpload ? '' : 'checked'}> <span>✨ Tự động (Unsplash/Pexels)</span></label>
          </div>

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
    </div>
  </section>`;
  const rich = root.querySelector('[data-blog-body]');
  if (rich) {
    rich.innerHTML = initialBody;
    syncEmptyState(root);
  }
  root.querySelector('h1')?.focus?.({ preventScroll: true });
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
    branch: root.querySelector('[data-blog-branch]')?.value?.trim() || 'main',
    author: root.querySelector('[data-blog-author]')?.value?.trim() || '',
    imageMode: root.querySelector('input[name="blog-image-mode"]:checked')?.value || 'auto',
  };
}

function runCommand(root, command, value = null) {
  const rich = richEl(root);
  rich?.focus?.();
  try { document.execCommand(command, false, value); } catch { /* unsupported command */ }
  syncEmptyState(root);
}

function applyTool(root, action) {
  const spec = TOOLBAR.find((item) => item.action === action);
  if (!spec) return;
  if (spec.cmd) return runCommand(root, spec.cmd);
  if (spec.block) return runCommand(root, 'formatBlock', `<${spec.block}>`);
  if (spec.link) {
    const url = window.prompt('Nhập địa chỉ liên kết:', 'https://');
    if (url) runCommand(root, 'createLink', url);
    return;
  }
  if (spec.clear) {
    runCommand(root, 'removeFormat');
    return runCommand(root, 'formatBlock', '<p>');
  }
  return runCommand(root, action);
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
  state.previewUrl = URL.createObjectURL(file);

  showThumb(root, { url: state.previewUrl, provider: 'upload', credit: file.name });
  const zone = root.querySelector('[data-blog-dropzone]');
  zone?.classList.add('has-file');
  const name = root.querySelector('[data-blog-filename]');
  if (name) name.textContent = `${file.name} · ${formatBytes(file.size)}`;
  setStatus(root, 'Ảnh sẵn sàng — sẽ được upload lên GitHub khi bạn bấm Lưu.');
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
    const slug = slugify(form.title);
    let cover = null;

    if (form.imageMode === 'upload') {
      if (state.file) {
        const media = mediaConfig();
        const filename = uploadFilename(slug, state.file.name);
        setStatus(root, 'Đang upload ảnh lên GitHub…');
        const asset = await uploadImage({
          repo: form.repo, branch: form.branch, dir: media.dir,
          filename, file: state.file, token: form.token,
        });
        cover = { url: assetPublicUrl(media.siteUrl, asset.path), provider: 'upload', credit: state.file.name };
      } else if (state.thumb?.provider === 'upload') {
        cover = state.thumb;
      } else {
        setStatus(root, 'Hãy chọn ảnh để upload, hoặc chuyển sang chế độ “Tự động”.', 'error');
        return;
      }
    } else {
      cover = state.thumb?.provider && state.thumb.provider !== 'upload'
        ? state.thumb
        : await pickThumbnail({ title: form.title, tags: form.tags, slug });
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
      body,
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
    const state = { thumb: null, file: null, previewUrl: '' };
    const dropzone = () => root.querySelector('[data-blog-dropzone]');
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ }

    root.addEventListener('click', (event) => {
      const tool = event.target.closest('[data-blog-tool]');
      if (tool) { applyTool(root, tool.dataset.blogTool); return; }
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
        setStatus(root, 'Đã xoá ảnh.');
        return;
      }
      if (event.target.closest('[data-blog-save]')) { void onSave(root, state); return; }
      if (event.target.closest('[data-blog-clear]')) {
        if (window.confirm('Xoá bản nháp đang soạn trên thiết bị này?')) {
          root.querySelector('[data-blog-title]').value = '';
          root.querySelector('[data-blog-tags]').value = '';
          const rich = richEl(root);
          if (rich) rich.innerHTML = '';
          clearDraft();
          if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = ''; }
          state.file = null;
          state.thumb = null;
          resetDropzone(root);
          showThumb(root, null);
          syncEmptyState(root);
          setStatus(root, 'Đã xoá nháp.');
        }
        return;
      }
      if (event.target.closest('[data-blog-home]')) {
        event.preventDefault();
        window.location.hash = '';
      }
    });

    root.addEventListener('change', (event) => {
      const input = event.target;
      if (input.matches?.('[data-blog-file]')) {
        acceptFile(root, input.files?.[0], state);
        input.value = '';
        return;
      }
      if (input.matches?.('input[name="blog-image-mode"]')) {
        const upload = input.value === 'upload';
        setUploadZone(root, upload);
        if (!upload && state.thumb?.provider === 'upload') {
          if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = ''; }
          state.file = null;
          state.thumb = null;
          resetDropzone(root);
          showThumb(root, null);
        }
        setStatus(root, upload
          ? 'Chế độ upload: chọn ảnh từ máy để dùng làm ảnh đại diện.'
          : 'Chế độ tự động: bấm “Lấy ảnh khác” để tìm ảnh minh hoạ.');
      }
    });

    root.addEventListener('paste', (event) => {
      if (!event.target.closest?.('[data-blog-body]')) return;
      const data = event.clipboardData;
      if (!data) return;
      event.preventDefault();
      const html = data.getData('text/html');
      const payload = html ? sanitizePastedHtml(html) : plainTextToHtml(data.getData('text/plain'));
      try { document.execCommand('insertHTML', false, payload); } catch { richEl(root).insertAdjacentHTML('beforeend', payload); }
      window.setTimeout(() => syncEmptyState(root), 0);
    });

    root.addEventListener('keydown', (event) => {
      const zone = event.target.closest?.('[data-blog-dropzone]');
      if (zone && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        root.querySelector('[data-blog-file]')?.click();
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.target.closest?.('[data-blog-body]')) {
        if (event.key === 'b') { event.preventDefault(); runCommand(root, 'bold'); }
        if (event.key === 'i') { event.preventDefault(); runCommand(root, 'italic'); }
      }
    });

    root.addEventListener('input', (event) => {
      if (event.target.matches?.('input[name="blog-image-mode"]')) return;
      if (event.target.closest?.('[data-blog-body]')) syncEmptyState(root);
      const form = readForm(root);
      saveDraft({ title: form.title, body: form.html, tags: form.tags });
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
  renderEditor(root);
}
