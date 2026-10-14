const featureLoaders = {
  search: () => import('./features/search.js'),
  markdown: () => import('./features/markdown.js'),
  transformers: () => import('./features/transformers.js'),
};

let waterAppPromise;

function syncWaterRoute() {
  const root = document.querySelector('[data-water-app]');
  if (!root) return;
  const hashRoute = location.hash.startsWith('#/water');
  const directRoute = Boolean(root.dataset.initialRoute);
  const active = hashRoute || directRoute;
  root.hidden = !active;
  document.body.classList.toggle('water-route', active);
  if (!active) return;
  waterAppPromise ??= import('./water/main.js');
  void waterAppPromise.then(({ mountWaterApp }) => mountWaterApp(root));
}

window.addEventListener('hashchange', syncWaterRoute);
syncWaterRoute();

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
