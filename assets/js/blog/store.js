// Local-first settings + draft for the blog editor, and the GitHub contents
// API calls used to publish a post straight from the browser.

import { contentsApiUrl, buildCommitPayload, commitMessage, postPath, arrayBufferToBase64, uploadPath, rawFileUrl, POSTS_DIR } from './lib.js';

const SETTINGS_KEY = 'blogco.blog.settings.v1';
const DRAFT_KEY = 'blogco.blog.draft.v1';

function meta(name) {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';
}

function storage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function defaultSettings() {
  return {
    repo: meta('blogco-gh-repo') || 'blogco/blogco',
    branch: meta('blogco-gh-branch') || 'main',
    token: '',
    author: '',
    imageMode: 'auto',
    aiProvider: 'gemini',
    aiModel: '',
    aiKey: '',
  };
}

// Where uploaded images are committed (`dir`) and the public prefix they are
// served from (`siteUrl`, i.e. the Hugo baseURL).
export function mediaConfig() {
  return {
    dir: meta('blogco-uploads-dir') || 'static/uploads',
    siteUrl: meta('blogco-site-url') || (typeof location !== 'undefined' ? `${location.origin}/` : '/'),
  };
}

export function getSettings() {
  const store = storage();
  let saved = {};
  if (store) {
    try { saved = JSON.parse(store.getItem(SETTINGS_KEY) || '{}') || {}; } catch { saved = {}; }
  }
  return { ...defaultSettings(), ...saved };
}

export function saveSettings(patch = {}) {
  const next = { ...getSettings(), ...patch };
  try { storage()?.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function getDraft() {
  const store = storage();
  if (!store) return { title: '', body: '', tags: '' };
  try {
    const parsed = JSON.parse(store.getItem(DRAFT_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : { title: '', body: '', tags: '' };
  } catch {
    return { title: '', body: '', tags: '' };
  }
}

export function saveDraft(draft = {}) {
  try { storage()?.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
}

export function clearDraft() {
  try { storage()?.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function authHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubError(response) {
  let detail = '';
  try {
    const data = await response.json();
    detail = data?.message || '';
  } catch { /* body not json */ }
  if (response.status === 401) return 'Token GitHub không hợp lệ hoặc đã hết hạn.';
  if (response.status === 403) return 'Token thiếu quyền (cần quyền “Contents: Read and write”).' + (detail ? ` ${detail}` : '');
  if (response.status === 404) return 'Không tìm thấy repository hoặc branch.';
  if (response.status === 422) return `GitHub từ chối dữ liệu.${detail ? ` ${detail}` : ''}`;
  return `GitHub API lỗi ${response.status}.${detail ? ` ${detail}` : ''}`;
}

// Returns the blob sha when the file already exists (needed to update it).
export async function getFileSha({ repo, path, branch, token }) {
  const response = await fetch(contentsApiUrl(repo, path, branch), { headers: authHeaders(token) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await githubError(response));
  const data = await response.json();
  return data.sha || null;
}

export async function commitPost({ repo, branch = 'main', slug, path: targetPath, title, content, token, sha: knownSha, update = true }) {
  if (!token) throw new Error('Chưa nhập GitHub token.');
  const path = targetPath || postPath(slug);
  const sha = knownSha || (update ? await getFileSha({ repo, path, branch, token }) : null);
  const response = await fetch(contentsApiUrl(repo, path), {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCommitPayload({ message: commitMessage(title), content, branch, sha })),
  });
  if (!response.ok) throw new Error(await githubError(response));
  const data = await response.json();
  return {
    path,
    url: data?.content?.html_url || '',
    commit: data?.commit?.html_url || '',
    created: !sha,
  };
}

// --- Blog manager (list / read / delete published posts) --------------------

function readHeaders(token) {
  return token ? authHeaders(token) : { Accept: 'application/vnd.github+json' };
}

function decodeBase64(text = '') {
  const binary = atob(String(text).replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// List the files in content/posts (one API request). Each entry carries its
// blob sha + a public download_url so the manager can fetch text cheaply.
export async function listPostFiles({ repo, branch = 'main', token = '', dir = POSTS_DIR } = {}) {
  const response = await fetch(contentsApiUrl(repo, dir, branch), { headers: readHeaders(token), cache: 'no-store' });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(await githubError(response));
  const data = await response.json();
  return Array.isArray(data) ? data.filter((entry) => entry.type === 'file') : [];
}

// Raw text of a post (no API quota when a download_url is available).
export async function fetchPostText(file, { repo, branch = 'main' } = {}) {
  const url = file.download_url || rawFileUrl(repo, branch, file.path);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Không tải được nội dung bài viết (${response.status}).`);
  return response.text();
}

// Full text + current sha of a single post, for editing.
export async function getPostFile({ repo, branch = 'main', token = '', path } = {}) {
  const response = await fetch(contentsApiUrl(repo, path, branch), { headers: readHeaders(token), cache: 'no-store' });
  if (!response.ok) throw new Error(await githubError(response));
  const data = await response.json();
  return { text: data.content ? decodeBase64(data.content) : '', sha: data.sha };
}

export async function deletePost({ repo, branch = 'main', token, path, sha }) {
  if (!token) throw new Error('Nhập GitHub token để xoá bài viết.');
  const response = await fetch(contentsApiUrl(repo, path), {
    method: 'DELETE',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `post: xoá ${String(path).split('/').pop()}`, branch, sha }),
  });
  if (!response.ok) throw new Error(await githubError(response));
  return { path };
}

// Commit an already-base64-encoded binary asset (e.g. an uploaded image).
export async function commitAsset({ repo, branch = 'main', path, base64, message = 'asset: upload', token }) {
  if (!token) throw new Error('Chưa nhập GitHub token.');
  const sha = await getFileSha({ repo, path, branch, token });
  const response = await fetch(contentsApiUrl(repo, path), {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCommitPayload({ message, content: base64, branch, sha, encoding: 'base64' })),
  });
  if (!response.ok) throw new Error(await githubError(response));
  const data = await response.json();
  return {
    path,
    url: data?.content?.html_url || '',
    downloadUrl: data?.content?.download_url || '',
    created: !sha,
  };
}

// Read a File/Blob and push it to the repo, returning its repo path + API URLs.
export async function uploadImage({ repo, branch = 'main', dir = 'static/uploads', filename, file, token }) {
  if (!file) throw new Error('Chưa chọn ảnh để upload.');
  const path = uploadPath(dir, filename);
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const result = await commitAsset({ repo, branch, path, base64, message: `asset: ${path.split('/').pop()}`, token });
  return { ...result, path };
}
