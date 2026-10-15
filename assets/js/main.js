const featureLoaders = {
  search: () => import('./features/search.js'),
  markdown: () => import('./features/markdown.js'),
  transformers: () => import('./features/transformers.js'),
};

import './category-bar.js';
import './navigation.js';
import './github-actions.js';

let waterAppPromise;
let healthAppPromise;
let storesAppPromise;
let lessonsAppPromise;
let coffeeAppPromise;
let brandAppPromise;

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

function syncStoresRoute() {
  const root = document.querySelector('[data-stores-app]');
  if (!root) return;
  const hashRoute = location.hash.startsWith('#/stores');
  const directRoute = Boolean(root.dataset.initialRoute);
  const active = hashRoute || directRoute;
  root.hidden = !active;
  document.body.classList.toggle('stores-route', active);
  if (!active) return;
  storesAppPromise ??= import('./stores/main.js');
  void storesAppPromise.then(({ mountStoresApp }) => mountStoresApp(root));
}

function syncLessonsRoute() {
  const root = document.querySelector('[data-lessons-app]');
  if (!root) return;
  const hashRoute = location.hash.startsWith('#/lessons');
  const directRoute = Boolean(root.dataset.initialRoute);
  const active = hashRoute || directRoute;
  root.hidden = !active;
  document.body.classList.toggle('lessons-route', active);
  if (!active) return;
  lessonsAppPromise ??= import('./lessons/main.js');
  void lessonsAppPromise.then(({ mountLessonsApp }) => mountLessonsApp(root));
}

function syncCoffeeRoute() {
  const root = document.querySelector('[data-coffee-app]');
  if (!root) return;
  const hashRoute = location.hash.startsWith('#/coffee');
  const directRoute = Boolean(root.dataset.initialRoute);
  const active = hashRoute || directRoute;
  root.hidden = !active;
  document.body.classList.toggle('coffee-route', active);
  if (!active) return;
  coffeeAppPromise ??= import('./coffee/main.js');
  void coffeeAppPromise.then(({ mountCoffeeApp }) => mountCoffeeApp(root));
}

function syncBrandRoute() {
  const root = document.querySelector('[data-brand-app]');
  if (!root) return;
  const hash = location.hash;
  const hashRoute = hash.startsWith('#/brand') || hash === '#/ci' || hash.startsWith('#/ci/');
  const directRoute = Boolean(root.dataset.initialRoute);
  const active = hashRoute || directRoute;
  root.hidden = !active;
  document.body.classList.toggle('brand-route', active);
  if (!active) return;
  brandAppPromise ??= import('./brand/main.js');
  void brandAppPromise.then(({ mountBrandApp }) => mountBrandApp(root));
}

window.addEventListener('hashchange', syncWaterRoute);
window.addEventListener('hashchange', syncHealthRoute);
window.addEventListener('hashchange', syncStoresRoute);
window.addEventListener('hashchange', syncLessonsRoute);
window.addEventListener('hashchange', syncCoffeeRoute);
window.addEventListener('hashchange', syncBrandRoute);
syncWaterRoute();
syncHealthRoute();
syncStoresRoute();
syncLessonsRoute();
syncCoffeeRoute();
syncBrandRoute();
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
