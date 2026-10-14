const featureLoaders = {
  search: () => import('./features/search.js'),
  markdown: () => import('./features/markdown.js'),
  transformers: () => import('./features/transformers.js'),
};

document.querySelectorAll('[data-blog-feature]').forEach((element) => {
  const feature = element.dataset.blogFeature;
  if (!(feature in featureLoaders)) return;
  const load = () => featureLoaders[feature]().then((module) => module.mount(element));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    }, { rootMargin: '160px' });
    observer.observe(element);
  } else {
    void load();
  }
});
