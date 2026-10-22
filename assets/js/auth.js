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
export const SENSITIVE_PREFIXES = ['#/water', '#/health', '#/coffee', '#/thuoc', '#/travel'];

export function isSensitiveRoute(hash = '') {
  return SENSITIVE_PREFIXES.some((prefix) => hash.startsWith(prefix));
}

export function verifyCode(input, expected = DEFAULT_PASSCODE) {
  if (input === null || input === undefined) return false;
  const normalized = String(input).trim().toLowerCase();
  const reference = String(expected ?? '').trim().toLowerCase();
  return reference.length > 0 && normalized === reference;
}

// SHA-256 (hex). Used so the repo/HTML only ever stores a digest of the
// passcode — never the passcode itself.
export async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text ?? ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeHash(hash) {
  return String(hash ?? '').trim().toLowerCase();
}

export async function verifyHash(input, hash) {
  const expected = normalizeHash(hash);
  if (!expected) return false;
  const actual = await sha256Hex(String(input ?? '').trim());
  if (actual.length !== expected.length) return false;
  // Constant-time-ish comparison to avoid trivial timing leaks.
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
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

// Hash takes precedence over the plaintext fallback when configured.
export function currentPasscodeHash() {
  return metaContent('blogco-lock-hash');
}

function siteHomeUrl() {
  return metaContent('blogco-site-url') || '/';
}

// Verify an entered code: prefer the SHA-256 digest, fall back to plaintext.
export async function verify(input) {
  const hash = currentPasscodeHash();
  if (hash) return verifyHash(input, hash);
  return verifyCode(input, currentPasscode());
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
export async function unlock(input) {
  if (!(await verify(input))) {
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
      <a class="auth-lock__home" data-auth-home>← Về trang chủ</a>
    </form>`;
  document.body.appendChild(el);

  const homeLink = el.querySelector('[data-auth-home]');
  if (homeLink) homeLink.href = siteHomeUrl();

  el.querySelector('[data-auth-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = el.querySelector('[data-auth-input]');
    const button = el.querySelector('.auth-lock__button');
    if (button) button.disabled = true;
    try {
      await unlock(input?.value ?? '');
      if (input) input.value = '';
      setError('');
    } catch (error) {
      setError(error.message);
      input?.select?.();
    } finally {
      if (button) button.disabled = false;
    }
  });
  el.querySelector('[data-auth-home]')?.addEventListener('click', (event) => {
    event.preventDefault();
    hideAuthLock();
    const logo = document.querySelector('.navbar__logo') || document.querySelector('a.logo');
    window.location.href = logo?.getAttribute('href') || siteHomeUrl();
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
