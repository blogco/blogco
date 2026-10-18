// Pure helpers for the in-browser blog editor. No DOM / network here so the
// markdown shape, slugging and GitHub payloads can be unit-tested in Node.

export function slugify(input = '') {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'bai-viet';
}

function yamlString(value = '') {
  const clean = String(value).replace(/\r?\n/g, ' ').trim();
  return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlList(key, values = []) {
  const items = (Array.isArray(values) ? values : String(values).split(','))
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (!items.length) return '';
  return `${key}:\n${items.map((item) => `  - ${yamlString(item)}`).join('\n')}\n`;
}

export function isoNow(date = new Date()) {
  return date.toISOString();
}

export function buildFrontMatter({
  title = '', date = isoNow(), description = '', tags = [], categories = [],
  cover = '', coverAlt = '', draft = false, author = '',
} = {}) {
  const parts = ['---'];
  parts.push(`title: ${yamlString(title)}`);
  parts.push(`date: ${date}`);
  parts.push(`draft: ${draft ? 'true' : 'false'}`);
  if (author) parts.push(`author: ${yamlString(author)}`);
  if (description) parts.push(`description: ${yamlString(description)}`);
  parts.push('cover:');
  parts.push(`  image: ${yamlString(cover)}`);
  parts.push(`  alt: ${yamlString(coverAlt || title)}`);
  parts.push(`  caption: ${yamlString(title)}`);
  const tagBlock = yamlList('tags', tags);
  const catBlock = yamlList('categories', categories);
  if (tagBlock) parts.push(tagBlock.trimEnd());
  if (catBlock) parts.push(catBlock.trimEnd());
  parts.push('---');
  return `${parts.join('\n')}\n`;
}

// The thumbnail doubles as the first image of the article body.
export function buildPostMarkdown({ frontMatter = '', image = '', imageAlt = '', body = '' } = {}) {
  const blocks = [frontMatter.trimEnd()];
  if (image) blocks.push(`![${imageAlt || 'Ảnh minh hoạ'}](${image})`);
  const trimmed = String(body).trim();
  if (trimmed) blocks.push(trimmed);
  return `${blocks.join('\n\n')}\n`;
}

export function postPath(slug) {
  return `content/posts/${slugify(slug)}.md`;
}

// Directory that holds published posts (listed/deleted by the blog manager).
export const POSTS_DIR = 'content/posts';

export function slugFromPostPath(path = '') {
  return String(path).split('/').pop().replace(/\.md$/i, '') || '';
}

function unquoteYaml(value = '') {
  const v = String(value).trim();
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function parseInlineList(value = '') {
  const v = String(value).trim().replace(/^\[|\]$/g, '');
  if (!v) return [];
  return v.split(',').map((item) => unquoteYaml(item)).filter(Boolean);
}

// Parse a post written by buildFrontMatter (or hand-written in the same shape):
// returns { title, date, tags, author, cover, url, body }. Best-effort on unknown keys.
export function parsePostMarkdown(markdown = '') {
  const text = String(markdown).replace(/\r\n?/g, '\n');
  const out = { title: '', date: '', tags: [], author: '', cover: '', url: '', body: '' };
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) { out.body = text.replace(/^\n+/, ''); return out; }
  out.body = text.slice(match[0].length).replace(/^\n+/, '');
  let section = '';
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem) {
      if (section === 'tags') out.tags.push(unquoteYaml(listItem[1]));
      continue;
    }
    const kv = line.match(/^\s*([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2].trim();
    const nested = /^\s/.test(line);
    if (nested) {
      if (section === 'cover' && key === 'image') out.cover = unquoteYaml(value);
      continue;
    }
    if (key === 'cover') { section = 'cover'; if (value) out.cover = unquoteYaml(value); continue; }
    if (key === 'tags') { section = 'tags'; if (value) out.tags.push(...parseInlineList(value)); continue; }
    section = '';
    if (key === 'title') out.title = unquoteYaml(value);
    else if (key === 'date') out.date = value;
    else if (key === 'author') out.author = unquoteYaml(value);
    else if (key === 'url') out.url = unquoteYaml(value);
  }
  return out;
}

// Raw text URL for a repo file, used to read posts without spending API quota.
export function rawFileUrl(repo, branch = 'main', path = '') {
  const clean = String(path).split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${clean}`;
}

export function parseRepo(repo = '') {
  const [owner = '', name = ''] = String(repo).trim().split('/');
  return { owner, name };
}

export function contentsApiUrl(repo, path, ref = '') {
  const clean = String(path).split('/').map(encodeURIComponent).join('/');
  const base = `https://api.github.com/repos/${repo}/contents/${clean}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

export function toBase64(text = '') {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

// Binary-safe base64 for uploaded image bytes (text encoding would corrupt them).
export function arrayBufferToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Pretty filename for an uploaded image: <slug>-<stamp>.<ext>
export function uploadFilename(slug, originalName = '', stamp = Date.now().toString(36)) {
  const match = String(originalName).match(/\.([a-z0-9]+)$/i);
  const ext = (match ? match[1] : 'jpg').toLowerCase();
  const safeStamp = String(stamp).replace(/[^a-z0-9]/gi, '') || 'x';
  return `${slugify(slug) || 'anh'}-${safeStamp}.${ext}`;
}

// Repo path for an uploaded asset, e.g. static/uploads/ca-phe-abc.jpg
export function uploadPath(dir, filename) {
  const name = String(filename).trim();
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const safeBase = slugify(base) || 'image';
  const cleanDir = String(dir || 'static/uploads').replace(/^\/+/, '').replace(/\/+$/, '');
  return `${cleanDir}/${safeBase}${ext ? `.${ext}` : '.jpg'}`;
}

// Public URL for a committed asset. `static/` is stripped so a Hugo `/static`
// file maps to its served path under the site base URL.
export function assetPublicUrl(siteUrl, repoPath) {
  const rel = String(repoPath).replace(/^\/+/, '').replace(/^static\//, '');
  return `${String(siteUrl || '/').replace(/\/+$/, '')}/${rel}`;
}

export function buildCommitPayload({ message, content, branch = 'main', sha, encoding = 'utf-8' } = {}) {
  const payload = {
    message,
    content: encoding === 'base64' ? String(content) : toBase64(content),
    branch,
  };
  if (sha) payload.sha = sha;
  return payload;
}

export function commitMessage(title = '') {
  return `post: ${String(title).trim() || 'bài viết mới'}`;
}

// Deterministic "auto illustration" used when no stock-photo key is available.
export function thumbnailFallbackUrl(slug, width = 1200, height = 630) {
  return `https://picsum.photos/seed/${encodeURIComponent(slugify(slug))}/${width}/${height}`;
}

export function thumbnailQuery({ title = '', tags = [] } = {}) {
  const tagsList = Array.isArray(tags) ? tags : String(tags).split(',');
  const first = tagsList.map((tag) => String(tag).trim()).filter(Boolean)[0];
  return (first || title).trim().slice(0, 60);
}

export function stockApiUrl(provider, query, count = 1) {
  const q = encodeURIComponent(query || '');
  if (provider === 'pexels') return `https://api.pexels.com/v1/search?query=${q}&per_page=${count}&orientation=landscape`;
  if (provider === 'unsplash') return `https://api.unsplash.com/search/photos?query=${q}&per_page=${count}&orientation=landscape`;
  return '';
}

export function pickStockImage(provider, data = {}) {
  if (provider === 'pexels') {
    const photo = data.photos?.[0];
    return photo ? { url: photo.src?.landscape || photo.src?.large || photo.src?.original || '', credit: photo.photographer || '', link: photo.url || '' } : null;
  }
  if (provider === 'unsplash') {
    const photo = data.results?.[0];
    return photo ? { url: photo.urls?.regular || photo.urls?.full || '', credit: photo.user?.name || '', link: photo.links?.html || '' } : null;
  }
  return null;
}
