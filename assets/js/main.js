const featureLoaders = {
  search: () => import('./features/search.js'),
  markdown: () => import('./features/markdown.js'),
  transformers: () => import('./features/transformers.js'),
};

import './category-bar.js';
import './navigation.js';

let waterAppPromise;
let healthAppPromise;

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

function syncHealthRoute() {
  const root = document.querySelector('[data-health-app]');
  if (!root) return;
  const hashRoute = location.hash.startsWith('#/health');
  const directRoute = Boolean(root.dataset.initialRoute);
  const active = hashRoute || directRoute;
  root.hidden = !active;
  document.body.classList.toggle('health-route', active);
  if (!active) return;
  healthAppPromise ??= import('./health/main.js');
  void healthAppPromise.then(({ mountHealthApp }) => mountHealthApp(root));
}

window.addEventListener('hashchange', syncWaterRoute);
window.addEventListener('hashchange', syncHealthRoute);
syncWaterRoute();
syncHealthRoute();

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
