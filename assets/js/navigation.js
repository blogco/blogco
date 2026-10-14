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
    if (key === 'insights') isActive = hashRoute === '/water/insights';
    if (key === 'health') isActive = hashRoute.startsWith('/health');
    if (key === 'wellness') isActive = hashRoute === '/water/add' || hashRoute === '/water/insights' || hashRoute.startsWith('/health');
    if (key === 'stores') isActive = hashRoute.startsWith('/stores') || (!hashRoute && (currentPath === targetPath || currentPath.startsWith(targetPath)));
    if (key === 'lessons') isActive = hashRoute.startsWith('/lessons') || (!hashRoute && (currentPath === targetPath || currentPath.startsWith(targetPath)));
    if (key === 'water') isActive = hashRoute === '/water/add' || (!hashRoute && (currentPath === targetPath || currentPath.startsWith(targetPath)));

    link.classList.toggle('is-active', isActive);
    const dropdown = link.closest('[data-nav-dropdown]');
    if (dropdown) dropdown.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

if (header && menu && toggle) {
  const closeDropdowns = () => {
    header.querySelectorAll('[data-nav-dropdown].is-open').forEach((item) => {
      item.classList.remove('is-open');
      item.querySelector('.navbar__link--dropdown')?.setAttribute('aria-expanded', 'false');
    });
  };

  toggle.addEventListener('click', () => setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (event) => {
    const dropdownToggle = event.target.closest('.navbar__link--dropdown');
    if (dropdownToggle) {
      event.preventDefault();
      const item = dropdownToggle.closest('[data-nav-dropdown]');
      const isOpen = item.classList.toggle('is-open');
      dropdownToggle.setAttribute('aria-expanded', String(isOpen));
      return;
    }
    if (event.target.closest('a')) setMenuOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!header.contains(event.target)) {
      setMenuOpen(false);
      closeDropdowns();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-menu-open')) setMenuOpen(false, true);
    if (event.key === 'Escape') closeDropdowns();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
      setMenuOpen(false);
      closeDropdowns();
    }
  });
  window.addEventListener('hashchange', syncActiveNavigation);
  window.addEventListener('popstate', syncActiveNavigation);
  syncActiveNavigation();
}
