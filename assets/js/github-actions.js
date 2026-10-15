// Footer widget that reports the latest GitHub Actions runs (commit + status)
// for this repository. Data source: https://github.com/blogco/blogco/actions
// via the public REST API. Snapshots are cached in sessionStorage so a visitor
// stays well under GitHub's 60 requests/hour anonymous rate limit.

const DEFAULT_REPO = 'blogco/blogco';
const MAX_ROWS = 5;
const CACHE_TTL = 3 * 60 * 1000; // reuse a snapshot for 3 minutes
const POLL_INTERVAL = 60 * 1000; // refresh cadence while a run is still active
const CACHE_PREFIX = 'blogco:gh-actions:';

const STATUS_LABELS = {
  queued: 'Đang chờ',
  requested: 'Đang chờ',
  waiting: 'Đang chờ',
  pending: 'Đang chờ',
  in_progress: 'Đang chạy',
};

const STATUS_TONES = {
  queued: 'pending',
  requested: 'pending',
  waiting: 'pending',
  pending: 'pending',
  in_progress: 'running',
};

const CONCLUSION_META = {
  success: { label: 'Thành công', tone: 'success' },
  failure: { label: 'Thất bại', tone: 'failure' },
  timed_out: { label: 'Quá hạn', tone: 'failure' },
  startup_failure: { label: 'Lỗi khởi động', tone: 'failure' },
  cancelled: { label: 'Đã huỷ', tone: 'neutral' },
  skipped: { label: 'Bỏ qua', tone: 'neutral' },
  neutral: { label: 'Trung lập', tone: 'neutral' },
  stale: { label: 'Quá cũ', tone: 'neutral' },
  action_required: { label: 'Cần xử lý', tone: 'pending' },
};

const ACTIVE_STATUSES = ['queued', 'in_progress', 'requested', 'waiting', 'pending'];

export function statusMeta(run = {}) {
  const status = String(run.status || '').toLowerCase();
  const conclusion = String(run.conclusion || '').toLowerCase();
  if (conclusion && CONCLUSION_META[conclusion]) return CONCLUSION_META[conclusion];
  if (status) return { label: STATUS_LABELS[status] || status, tone: STATUS_TONES[status] || 'neutral' };
  return { label: 'Không rõ', tone: 'neutral' };
}

export function isActiveRun(run = {}) {
  return ACTIVE_STATUSES.includes(String(run.status || '').toLowerCase());
}

export function shortSha(sha = '') {
  return String(sha).slice(0, 7);
}

export function relativeTime(input, now = Date.now()) {
  const time = input instanceof Date ? input.getTime() : Date.parse(input);
  if (!Number.isFinite(time)) return '';
  const minutes = Math.floor(Math.max(0, now - time) / 60000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(months / 12)} năm trước`;
}

export function runsApiUrl(repo = DEFAULT_REPO, perPage = MAX_ROWS) {
  return `https://api.github.com/repos/${repo}/actions/runs?per_page=${perPage}&exclude_pull_requests=true`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function safeGithubUrl(value = '') {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    return url.protocol === 'https:' && host === 'github.com' ? url.href : '';
  } catch {
    return '';
  }
}

function readCache(repo) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + repo);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.runs) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(repo, snapshot) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + repo, JSON.stringify(snapshot));
  } catch {
    /* storage unavailable — ignore */
  }
}

async function fetchRuns(repo, force = false) {
  const cached = readCache(repo);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached;
  try {
    const response = await fetch(runsApiUrl(repo), {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    const data = await response.json();
    const snapshot = {
      at: Date.now(),
      runs: (Array.isArray(data.workflow_runs) ? data.workflow_runs : []).slice(0, MAX_ROWS),
    };
    writeCache(repo, snapshot);
    return snapshot;
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}

function rowHtml(repo, run) {
  const meta = statusMeta(run);
  const title = run.display_title || run.name || 'Không có tiêu đề';
  const sha = shortSha(run.head_sha);
  const branch = run.head_branch || '';
  const when = relativeTime(run.updated_at || run.run_started_at || run.created_at);
  const runUrl = safeGithubUrl(run.html_url) || `https://github.com/${repo}/actions`;
  const commitUrl = sha ? `https://github.com/${repo}/commit/${sha}` : '';
  return `<li class="gh-actions__item gh-actions__item--${meta.tone}">
    <span class="gh-actions__dot" aria-hidden="true"></span>
    <a class="gh-actions__commit" href="${escapeHtml(runUrl)}" target="_blank" rel="noopener" title="${escapeHtml(title)}">${escapeHtml(title)}</a>
    <span class="gh-actions__meta">
      <span class="gh-actions__status">${escapeHtml(meta.label)}</span>
      ${branch ? `<span class="gh-actions__branch">${escapeHtml(branch)}</span>` : ''}
      ${commitUrl ? `<a class="gh-actions__sha" href="${escapeHtml(commitUrl)}" target="_blank" rel="noopener" title="Xem commit ${escapeHtml(sha)}">${escapeHtml(sha)}</a>` : ''}
      ${when ? `<span class="gh-actions__time">${escapeHtml(when)}</span>` : ''}
    </span>
  </li>`;
}

function renderState(root, html, kind) {
  const list = root.querySelector('[data-gh-list]');
  if (!list) return;
  list.setAttribute('aria-busy', 'false');
  list.innerHTML = `<li class="gh-actions__state gh-actions__state--${kind}">${html}</li>`;
}

function renderRuns(root, repo, snapshot) {
  const list = root.querySelector('[data-gh-list]');
  if (!list) return;
  const runs = snapshot.runs || [];
  list.setAttribute('aria-busy', 'false');
  if (!runs.length) {
    renderState(root, 'Chưa có lượt chạy nào.', 'empty');
    return;
  }
  list.innerHTML = runs.slice(0, MAX_ROWS).map((run) => rowHtml(repo, run)).join('');
}

export function mountGithubActions(root = document.querySelector('[data-github-actions]')) {
  if (!root || root.dataset.mounted === 'true') return;
  root.dataset.mounted = 'true';

  const repo = root.dataset.ghRepo || DEFAULT_REPO;
  let timer = null;

  const schedule = () => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (document.hidden) {
        schedule();
        return;
      }
      void refresh(true);
    }, POLL_INTERVAL);
  };

  const refresh = async (force = false) => {
    try {
      const snapshot = await fetchRuns(repo, force);
      renderRuns(root, repo, snapshot);
      if (snapshot.runs.some(isActiveRun)) schedule();
    } catch {
      renderState(root, `Không tải được trạng thái commit. <a href="https://github.com/${repo}/actions" target="_blank" rel="noopener">Xem trên GitHub</a>`, 'error');
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh(false);
  });

  void refresh(false);
}

if (typeof document !== 'undefined') {
  mountGithubActions();
}
