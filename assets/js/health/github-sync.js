// GitHub sync helpers for medical knowledge.
// The PAT is kept only in sessionStorage and is never written to localStorage.

const SESSION_KEY = 'blogco.health.github-sync.session.v1';

function meta(name) {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';
}

function sessionStorageSafe() {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

export function getDefaultGitHubSettings() {
  const repo = meta('blogco-gh-repo') || 'blogco/blogco';
  return {
    token: '',
    repo,
    branch: meta('blogco-gh-branch') || 'main',
    filePath: 'static/data/medical-knowledge.json',
  };
}

export function getSessionGitHubSettings() {
  const defaults = getDefaultGitHubSettings();
  const store = sessionStorageSafe();
  if (!store) return defaults;
  try {
    const saved = JSON.parse(store.getItem(SESSION_KEY) || '{}') || {};
    return { ...defaults, ...saved, token: saved.token || '' };
  } catch {
    return defaults;
  }
}

export function saveSessionGitHubSettings(settings = {}) {
  const next = { ...getSessionGitHubSettings(), ...settings };
  try {
    sessionStorageSafe()?.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    throw new Error('Không thể lưu cấu hình sync trong phiên trình duyệt này.');
  }
  return next;
}

export function parseRepo(repo = '') {
  const match = String(repo).trim().match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) throw new Error('Repo phải có dạng username/repo-name.');
  return { owner: match[1], name: match[2] };
}

function apiUrl(owner, repo, filePath, branch = '') {
  const path = String(filePath).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
  return branch ? `${base}?ref=${encodeURIComponent(branch)}` : base;
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
  try { detail = (await response.json())?.message || ''; } catch { /* no JSON body */ }
  if (response.status === 401) return 'PAT không hợp lệ hoặc đã hết hạn.';
  if (response.status === 403) return `PAT thiếu quyền Contents: Read and write.${detail ? ` ${detail}` : ''}`;
  if (response.status === 404) return 'Không tìm thấy repo, branch hoặc đường dẫn file.';
  if (response.status === 409) return 'GitHub báo xung đột cập nhật. Hãy thử đồng bộ lại.';
  return `GitHub API lỗi ${response.status}.${detail ? ` ${detail}` : ''}`;
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export async function syncToGitHub(token, owner, repo, branch, filePath, content) {
  if (!token) throw new Error('Vui lòng nhập GitHub PAT.');
  if (!owner || !repo) throw new Error('Thiếu owner/repo GitHub.');
  if (!branch) throw new Error('Vui lòng nhập branch.');
  if (!filePath) throw new Error('Vui lòng nhập đường dẫn file.');

  const endpoint = apiUrl(owner, repo, filePath);
  const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  let sha = null;
  if (existing.status === 200) sha = (await existing.json())?.sha || null;
  else if (existing.status !== 404) throw new Error(await githubError(existing));

  const body = {
    message: 'feat: sync medical knowledge',
    content: encodeBase64(content),
    branch,
  };
  if (sha) body.sha = sha;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await githubError(response));
  const data = await response.json();
  return {
    created: !sha,
    path: filePath,
    sha: data?.content?.sha || null,
    commit: data?.commit?.html_url || '',
    contentUrl: data?.content?.html_url || '',
  };
}
