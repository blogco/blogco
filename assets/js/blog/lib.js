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

export function buildCommitPayload({ message, content, branch = 'main', sha } = {}) {
  const payload = { message, content: toBase64(content), branch };
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
