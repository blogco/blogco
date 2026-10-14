const bars = document.querySelectorAll('[data-category-bar]');

for (const bar of bars) {
  const links = [...bar.querySelectorAll('.category-bar__item')];
  const path = window.location.pathname.replace(/\/$/, '') || '/';

  for (const link of links) {
    const linkPath = new URL(link.href, window.location.href).pathname.replace(/\/$/, '') || '/';
    if (linkPath === path) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  }

  const activeLink = bar.querySelector('.category-bar__item.is-active');
  if (activeLink && window.matchMedia('(max-width: 1023px)').matches) {
    activeLink.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  let scrollQueued = false;
  const updateShadow = () => {
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(() => {
      bar.classList.toggle('is-scrolled', window.scrollY > 0);
      scrollQueued = false;
    });
  };

  window.addEventListener('scroll', updateShadow, { passive: true });
  updateShadow();
}
