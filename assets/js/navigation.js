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
    if (key === 'insights') isActive = hashRoute === '/water/insights';
    if (key === 'health') isActive = hashRoute.startsWith('/health');
    if (key === 'wellness') isActive = hashRoute === '/water/add' || hashRoute === '/water/insights' || hashRoute.startsWith('/health');
    if (key === 'water') isActive = hashRoute === '/water/add' || (!hashRoute && (currentPath === targetPath || currentPath.startsWith(targetPath)));
    if (key === 'coffee') isActive = hashRoute.startsWith('/coffee');
    if (key === 'brand') isActive = hashRoute === '/brand-guidelines' || hashRoute === '/ci';

    link.classList.toggle('is-active', isActive);
    const dropdown = link.closest('[data-nav-dropdown]');
    if (dropdown) dropdown.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

if (header && menu && toggle) {
  const headerNav = header.querySelector('.header-nav');
  const navigationRegion = header.querySelector('.navbar__navigation-region');
  let resizeFrame = 0;
  let escapedFocusItem = null;

  const isCompact = () => header.classList.contains('is-compact');

  const closeDropdown = (item) => {
    item.classList.remove('is-open');
    item.querySelector('.navbar__link--dropdown')?.setAttribute('aria-expanded', 'false');
  };

  const closeDropdowns = (except = null) => {
    header.querySelectorAll('[data-nav-dropdown].is-open').forEach((item) => {
      if (item !== except) closeDropdown(item);
    });
  };

  const openDropdown = (item) => {
    closeDropdowns(item);
    item.classList.add('is-open');
    item.querySelector('.navbar__link--dropdown')?.setAttribute('aria-expanded', 'true');
  };

  const updateCompactLayout = () => {
    resizeFrame = 0;
    if (!headerNav || !navigationRegion) return;

    const wasCompact = isCompact();
    if (wasCompact) header.classList.remove('is-compact');

    const menuStyle = window.getComputedStyle(menu);
    const visibleItems = [...menu.children].filter((item) => window.getComputedStyle(item).display !== 'none');
    const menuGap = Number.parseFloat(menuStyle.columnGap || menuStyle.gap) || 0;
    const requiredMenuWidth = visibleItems.reduce((width, item) => {
      const itemStyle = window.getComputedStyle(item);
      return width + item.getBoundingClientRect().width
        + (Number.parseFloat(itemStyle.marginInlineStart) || 0)
        + (Number.parseFloat(itemStyle.marginInlineEnd) || 0);
    }, 0) + Math.max(0, visibleItems.length - 1) * menuGap
      + (Number.parseFloat(menuStyle.paddingInlineStart) || 0)
      + (Number.parseFloat(menuStyle.paddingInlineEnd) || 0);
    const availableMenuWidth = navigationRegion.clientWidth;
    const shouldCompact = requiredMenuWidth > availableMenuWidth + 1;
    header.classList.toggle('is-compact', shouldCompact);

    if (wasCompact !== shouldCompact) {
      setMenuOpen(false);
      closeDropdowns();
    }
  };

  const scheduleCompactLayout = () => {
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(updateCompactLayout);
  };

  toggle.addEventListener('click', () => setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (event) => {
    const dropdownToggle = event.target.closest('.navbar__link--dropdown');
    if (dropdownToggle) {
      event.preventDefault();
      const item = dropdownToggle.closest('[data-nav-dropdown]');
      if (!item) return;

      if (!isCompact()) {
        openDropdown(item);
        return;
      }

      const willOpen = !item.classList.contains('is-open');
      closeDropdowns();
      if (willOpen) openDropdown(item);
      return;
    }
    if (event.target.closest('a')) {
      const compact = isCompact();
      const activeDropdown = event.target.closest('[data-nav-dropdown]');
      setMenuOpen(false, compact);
      closeDropdowns();
      if (!compact && activeDropdown?.querySelector('.navbar__mega')?.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
  });

  // Hover and keyboard focus share the same explicit open state.
  header.querySelectorAll('[data-nav-dropdown]').forEach((item) => {
    const btn = item.querySelector('.navbar__link--dropdown');
    if (!btn) return;
    item.addEventListener('mouseenter', () => {
      if (!isCompact()) openDropdown(item);
    });
    item.addEventListener('mouseleave', () => {
      if (!isCompact() && !item.contains(document.activeElement)) closeDropdown(item);
    });
    item.addEventListener('focusin', (event) => {
      if (!isCompact() && !(event.target === btn && escapedFocusItem === item)) openDropdown(item);
    });
    item.addEventListener('focusout', () => {
      window.requestAnimationFrame(() => {
        if (!item.contains(document.activeElement) && !item.matches(':hover')) closeDropdown(item);
      });
    });
  });

  menu.addEventListener('keydown', (event) => {
    const item = event.target.closest('[data-nav-dropdown]');
    if (!item || !item.classList.contains('is-open')) return;

    const links = [...item.querySelectorAll('.navbar__mega a[href], .navbar__mega button:not([disabled])')];
    if (!links.length) return;

    const currentIndex = links.indexOf(document.activeElement);
    let nextIndex;
    if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % links.length;
    else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? links.length - 1 : (currentIndex - 1 + links.length) % links.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = links.length - 1;
    else return;

    event.preventDefault();
    links[nextIndex].focus();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!header.contains(event.target)) {
      if (menu.contains(document.activeElement)) document.activeElement.blur();
      setMenuOpen(false);
      closeDropdowns();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openItem = header.querySelector('[data-nav-dropdown].is-open');
    if (openItem) {
      const button = openItem.querySelector('.navbar__link--dropdown');
      closeDropdowns();
      if (isCompact()) button?.focus();
      else {
        escapedFocusItem = openItem;
        button?.focus();
        escapedFocusItem = null;
      }
      return;
    }
    if (header.classList.contains('is-menu-open')) setMenuOpen(false, true);
  });

  window.addEventListener('resize', scheduleCompactLayout);
  window.visualViewport?.addEventListener('resize', scheduleCompactLayout);
  if (window.ResizeObserver && headerNav) {
    const resizeObserver = new ResizeObserver(scheduleCompactLayout);
    resizeObserver.observe(headerNav);
  }
  if (window.MutationObserver) {
    const menuObserver = new MutationObserver(scheduleCompactLayout);
    menuObserver.observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  document.fonts?.ready.then(scheduleCompactLayout);

  updateCompactLayout();
  window.addEventListener('hashchange', syncActiveNavigation);
  window.addEventListener('popstate', syncActiveNavigation);
  syncActiveNavigation();
}
