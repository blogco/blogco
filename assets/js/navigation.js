const header = document.querySelector('.blogco-header');
const menu = header?.querySelector('[data-primary-nav]');
const toggle = header?.querySelector('.navbar__toggle');

function setMenuOpen(isOpen, returnFocus = false) {
  if (!header || !menu || !toggle) return;
  header.classList.toggle('is-menu-open', isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-label', isOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng');
  if (returnFocus) toggle.focus();
}

function normalizePath(path) {
  return path.replace(/\/{2,}/g, '/').replace(/\/?$/, '/');
}

function syncActiveNavigation() {
  if (!menu) return;
  const currentPath = normalizePath(window.location.pathname);
  const hashRoute = window.location.hash.startsWith('#/') ? window.location.hash.slice(1).replace(/\/$/, '') : '';

  menu.querySelectorAll('[data-nav-key]').forEach((link) => {
    const key = link.dataset.navKey;
    const targetPath = normalizePath(new URL(link.dataset.navPath, window.location.href).pathname);
    let isActive = false;

    if (key === 'home') isActive = currentPath === targetPath && !hashRoute;
    if (key === 'posts' || key === 'knowledge') isActive = currentPath === targetPath || currentPath.startsWith(targetPath);
    if (key === 'water') isActive = hashRoute.startsWith('/water') || currentPath === targetPath || currentPath.startsWith(targetPath);

    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

if (header && menu && toggle) {
  toggle.addEventListener('click', () => setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!header.contains(event.target)) setMenuOpen(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-menu-open')) setMenuOpen(false, true);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) setMenuOpen(false);
  });
  window.addEventListener('hashchange', syncActiveNavigation);
  window.addEventListener('popstate', syncActiveNavigation);
  syncActiveNavigation();
}
