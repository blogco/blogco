const POSITION_KEY = 'blogco.navigation.scroll.v1';
const ROUTE_PREFIX = '#/';

function routeKey() {
  const hash = window.location.hash;
  return hash.startsWith(ROUTE_PREFIX) ? hash.replace(/\/$/, '') || '#/' : `${window.location.pathname}${window.location.search}`;
}

function readPositions() {
  try {
    const value = JSON.parse(sessionStorage.getItem(POSITION_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function documentScroller() {
  return document.scrollingElement || document.documentElement;
}

function getPosition() {
  return { x: window.scrollX, y: window.scrollY };
}

function setPosition(position) {
  const scroller = documentScroller();
  const x = Number.isFinite(position?.x) ? position.x : 0;
  const y = Number.isFinite(position?.y) ? position.y : 0;
  scroller.scrollTo?.({ left: x, top: y, behavior: 'instant' });
  if (!scroller.scrollTo) window.scrollTo({ left: x, top: y, behavior: 'instant' });
}

function isHashRoute(hash) {
  return hash.startsWith(ROUTE_PREFIX);
}

function isAnchorNavigation(event) {
  const link = event.target.closest?.('a[href*="#"]');
  if (!link || link.target || link.hasAttribute('download')) return false;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.search !== window.location.search) return false;
  if (!url.hash || url.hash === window.location.hash) return false;
  return !isHashRoute(url.hash);
}

function viewIsMounted(key) {
  if (!key.startsWith('#/')) return true;
  const route = key.slice(1);
  const selectors = {
    '/water': '[data-water-app]', '/health': '[data-health-app]', '/coffee': '[data-coffee-app]',
    '/thuoc': '[data-thuoc-app]', '/brand': '[data-brand-app]', '/ci': '[data-brand-app]',
    '/blog': '[data-blog-app]', '/travel': '[data-travel-app]', '/tools/passport-photo': '[data-passport-photo-app]',
  };
  const selector = Object.keys(selectors).sort((a, b) => b.length - a.length).find((prefix) => route === prefix || route.startsWith(`${prefix}/`));
  const root = selector && document.querySelector(selectors[selector]);
  return Boolean(root && !root.hidden && root.isConnected && (root.childElementCount > 0 || root.hasAttribute('data-mounted') || root.hasAttribute('data-travel-mounted')));
}

export class NavigationScrollManager {
  constructor() {
    this.positions = readPositions();
    this.currentKey = routeKey();
    this.sequence = 0;
    this.pending = null;
    this.mountObserver = null;
    this.handleHashChange = this.handleHashChange.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.saveCurrentPosition = this.saveCurrentPosition.bind(this);
    this.handlePageShow = this.handlePageShow.bind(this);
    window.history.scrollRestoration = 'manual';
    window.addEventListener('hashchange', this.handleHashChange);
    window.addEventListener('popstate', this.handleHashChange);
    window.addEventListener('pagehide', this.saveCurrentPosition);
    window.addEventListener('pageshow', this.handlePageShow);
    window.addEventListener('scroll', this.saveCurrentPosition, { passive: true });
    document.addEventListener('click', this.handleClick, true);
  }

  saveCurrentPosition() {
    if (this.currentKey) this.positions[this.currentKey] = getPosition();
    try { sessionStorage.setItem(POSITION_KEY, JSON.stringify(this.positions)); } catch { /* session storage may be unavailable */ }
  }

  handlePageShow(event) {
    if (event.persisted) return;
    this.currentKey = routeKey();
    const navigationType = performance.getEntriesByType?.('navigation')?.[0]?.type;
    if (navigationType === 'back_forward') {
      const sequence = ++this.sequence;
      this.pending = { sequence, key: this.currentKey, position: this.positions[this.currentKey] || { x: 0, y: 0 } };
      this.waitForMount(this.pending);
    }
  }

  handleClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (isAnchorNavigation(event)) return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.search !== window.location.search || !isHashRoute(url.hash)) return;
    const targetKey = url.hash.replace(/\/$/, '');
    if (targetKey === this.currentKey) return;
    this.saveCurrentPosition();
    this.positions[targetKey] = undefined;
  }

  handleHashChange(event) {
    const nextKey = routeKey();
    if (nextKey === this.currentKey) return;
    const previousKey = this.currentKey;
    this.saveCurrentPosition();
    const isHistoryNavigation = event.type === 'popstate';
    this.currentKey = nextKey;
    const sequence = ++this.sequence;
    this.mountObserver?.disconnect();
    this.mountObserver = null;
    this.pending = { sequence, key: nextKey, position: isHistoryNavigation ? this.positions[nextKey] : { x: 0, y: 0 } };
    if (previousKey === nextKey) return;
    this.waitForMount(this.pending);
  }

  waitForMount(pending) {
    const route = pending.key.slice(1);
    const selectors = {
      '/water': '[data-water-app]', '/health': '[data-health-app]', '/coffee': '[data-coffee-app]',
      '/thuoc': '[data-thuoc-app]', '/brand': '[data-brand-app]', '/ci': '[data-brand-app]',
      '/blog': '[data-blog-app]', '/travel': '[data-travel-app]', '/tools/passport-photo': '[data-passport-photo-app]',
    };
    const prefix = Object.keys(selectors).sort((a, b) => b.length - a.length).find((value) => route === value || route.startsWith(`${value}/`));
    const root = prefix && document.querySelector(selectors[prefix]);
    const initialMarkup = root?.innerHTML;
    const finish = () => {
      if (!this.pending || this.pending.sequence !== pending.sequence || routeKey() !== pending.key || !viewIsMounted(pending.key)) return;
      requestAnimationFrame(() => {
        if (!this.pending || this.pending.sequence !== pending.sequence || routeKey() !== pending.key) return;
        setPosition(pending.position || { x: 0, y: 0 });
        this.pending = null;
        this.mountObserver?.disconnect();
        this.mountObserver = null;
      });
    };
    if (!root || initialMarkup === undefined) {
      finish();
      return;
    }
    this.mountObserver = new MutationObserver(() => {
      if (root.innerHTML !== initialMarkup) finish();
    });
    this.mountObserver.observe(root, { childList: true, subtree: true, characterData: true });
    if (root.innerHTML !== initialMarkup) finish();
    else if (root.childElementCount > 0 || root.hasAttribute('data-mounted') || root.hasAttribute('data-travel-mounted')) {
      requestAnimationFrame(() => {
        if (this.pending?.sequence === pending.sequence && root.innerHTML === initialMarkup) finish();
      });
    }
  }
}

export const navigationScrollManager = new NavigationScrollManager();
