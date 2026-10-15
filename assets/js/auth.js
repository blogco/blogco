// Client-side privacy gate for the personal SPA features.
//
// The site is fully static, so this is a convenience lock (a passcode shipped
// in the page + a device token kept in localStorage) — NOT a server-enforced
// secret. It keeps casual visitors out of the personalised modules
// (Sức khoẻ · Đồ uống · Chi phí · Tiêm ngừa) and remembers an unlocked device
// across reloads / F5 so the user isn't asked again and again.
//
// Storage shape (localStorage "blogco.auth.v1"):
//   { deviceId, isAuthenticated: true, issuedAt, device }

const STORAGE_KEY = 'blogco.auth.v1';
const EVT = 'blogco:auth-changed';

export const DEFAULT_PASSCODE = '123456';

// Hash routes that must be unlocked before their app mounts.
export const SENSITIVE_PREFIXES = ['#/water', '#/health', '#/coffee'];

export function isSensitiveRoute(hash = '') {
  return SENSITIVE_PREFIXES.some((prefix) => hash.startsWith(prefix));
}

export function verifyCode(input, expected = DEFAULT_PASSCODE) {
  if (input === null || input === undefined) return false;
  const normalized = String(input).trim().toLowerCase();
  const reference = String(expected ?? '').trim().toLowerCase();
  return reference.length > 0 && normalized === reference;
}

export function createDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function metaContent(name) {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';
}

export function lockEnabled() {
  return metaContent('blogco-lock') !== 'false';
}

export function currentPasscode() {
  return metaContent('blogco-lock-code') || DEFAULT_PASSCODE;
}

function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readAuth() {
  const store = storage();
  if (!store) return null;
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  const auth = readAuth();
  return Boolean(auth?.isAuthenticated && auth.deviceId);
}

function persist(auth) {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(auth));
  } catch {
    /* Ignore quota / private-mode failures — the user can retry. */
  }
}

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVT));
}

// Verify the code, then remember this device so reloads skip the lock screen.
export function unlock(input) {
  if (!verifyCode(input, currentPasscode())) {
    const error = new Error('Mã khoá không đúng. Vui lòng thử lại.');
    error.code = 'INVALID_CODE';
    throw error;
  }
  const previous = readAuth();
  const auth = {
    deviceId: previous?.deviceId || createDeviceId(),
    isAuthenticated: true,
    issuedAt: new Date().toISOString(),
    device: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 140) : '',
  };
  persist(auth);
  hideAuthLock();
  announce();
  return auth;
}

// Forget this device entirely (Đăng xuất / Khoá lại).
export function lock() {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing else to do. */
  }
  announce();
}

// ---------------------------------------------------------------------------
// Lock screen (DOM) — only touched in the browser.
// ---------------------------------------------------------------------------

let overlay;

function setError(message) {
  const el = overlay?.querySelector('[data-auth-error]');
  if (el) el.textContent = message || '';
}

function buildLock() {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.className = 'auth-lock';
  el.hidden = true;
  el.innerHTML = `
    <div class="auth-lock__backdrop" aria-hidden="true"></div>
    <form class="auth-lock__card" data-auth-form role="dialog" aria-modal="true" aria-labelledby="auth-lock-title">
      <div class="auth-lock__badge" aria-hidden="true">🔒</div>
      <h2 class="auth-lock__title" id="auth-lock-title">Khu vực riêng tư</h2>
      <p class="auth-lock__text">Nhập mã khoá để mở các tính năng cá nhân
        (<strong>Sức khoẻ · Đồ uống · Chi phí · Tiêm ngừa</strong>). Thiết bị này sẽ được ghi nhớ sau lần mở khoá đầu tiên.</p>
      <label class="auth-lock__field">Mã khoá bảo mật
        <input type="password" data-auth-input autocomplete="current-password" placeholder="Nhập mã khoá…" aria-describedby="auth-lock-error">
      </label>
      <p class="auth-lock__error" id="auth-lock-error" data-auth-error role="alert"></p>
      <label class="auth-lock__remember"><input type="checkbox" checked disabled> Ghi nhớ thiết bị này</label>
      <button type="submit" class="auth-lock__button">🔓 Mở khoá</button>
      <a class="auth-lock__home" href="/" data-auth-home>← Về trang chủ</a>
    </form>`;
  document.body.appendChild(el);

  el.querySelector('[data-auth-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = el.querySelector('[data-auth-input]');
    try {
      unlock(input?.value ?? '');
      if (input) input.value = '';
      setError('');
    } catch (error) {
      setError(error.message);
      input?.select?.();
    }
  });
  el.querySelector('[data-auth-home]')?.addEventListener('click', (event) => {
    event.preventDefault();
    hideAuthLock();
    const logo = document.querySelector('.navbar__logo') || document.querySelector('a.logo');
    window.location.href = logo?.getAttribute('href') || '/';
  });
  return el;
}

function ensureLock() {
  if (!overlay) overlay = buildLock();
  return overlay;
}

export function showAuthLock() {
  const el = ensureLock();
  if (!el) return;
  el.hidden = false;
  document.body.classList.add('auth-locked');
  const input = el.querySelector('[data-auth-input]');
  if (input) {
    input.value = '';
    window.requestAnimationFrame(() => input.focus());
  }
  el.querySelector('[data-auth-input]')?.select?.();
}

export function hideAuthLock() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('auth-locked');
  setError('');
}

// Returns true when the route may mount, false when the lock screen is shown.
export function requireAuth() {
  if (!lockEnabled() || isAuthenticated()) {
    hideAuthLock();
    return true;
  }
  showAuthLock();
  return false;
}

// Wire the header "Khoá lại" button; it is only visible once authenticated.
export function mountAuthControl() {
  const control = document.querySelector('[data-auth-control]');
  const button = document.querySelector('[data-auth-lock]');
  const sync = () => {
    const authed = lockEnabled() && isAuthenticated();
    if (control) control.hidden = !authed;
    if (button) button.hidden = !authed;
  };
  button?.addEventListener('click', () => {
    if (!window.confirm('Đăng xuất và khoá lại các tính năng cá nhân trên thiết bị này?')) return;
    lock();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
  }
  sync();
}
