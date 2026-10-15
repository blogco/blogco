// Local-first settings + draft for the blog editor, and the GitHub contents
// API calls used to publish a post straight from the browser.

import { contentsApiUrl, buildCommitPayload, commitMessage, postPath } from './lib.js';

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
    autoImage: true,
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

export async function commitPost({ repo, branch = 'main', slug, title, content, token, update = true }) {
  if (!token) throw new Error('Chưa nhập GitHub token.');
  const path = postPath(slug);
  const sha = update ? await getFileSha({ repo, path, branch, token }) : null;
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
