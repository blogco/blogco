const featureLoaders = {
  markdown: () => import('./features/markdown.js'),
  transformers: () => import('./features/transformers.js'),
};

import './navigation.js';
import './github-actions.js';
import { requireAuth, hideAuthLock, isSensitiveRoute, mountAuthControl } from './auth.js';

let waterAppPromise;
let healthAppPromise;
let coffeeAppPromise;
let thuocAppPromise;
let brandAppPromise;
let blogAppPromise;
let travelAppPromise;
let passportPhotoAppPromise;

function syncWaterRoute() {
  const root = document.querySelector('[data-water-app]');
  if (!root) return;
  const hashRoute = location.hash.startsWith('#/water');
  const directRoute = Boolean(root.dataset.initialRoute);
  const active = hashRoute || directRoute;
  root.hidden = !active;
  document.body.classList.toggle('water-route', active);
  if (!active) return;
  if (!requireAuth()) return;
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
  if (!requireAuth()) return;
  healthAppPromise ??= import('./health/main.js');
  void healthAppPromise.then(({ mountHealthApp }) => mountHealthApp(root));
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
  if (!requireAuth()) return;
  coffeeAppPromise ??= import('./coffee/main.js');
  void coffeeAppPromise.then(({ mountCoffeeApp }) => mountCoffeeApp(root));
}

function syncThuocRoute() {
  const root = document.querySelector('[data-thuoc-app]');
  if (!root) return;
  const hashRoute = location.hash.startsWith('#/thuoc');
  const directRoute = Boolean(root.dataset.initialRoute);
  const active = hashRoute || directRoute;
  root.hidden = !active;
  document.body.classList.toggle('thuoc-route', active);
  if (!active) return;
  if (!requireAuth()) return;
  thuocAppPromise ??= import('./thuoc/main.js');
  void thuocAppPromise.then(({ mountThuocApp }) => mountThuocApp(root));
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

function syncBlogRoute() {
  const root = document.querySelector('[data-blog-app]');
  if (!root) return;
  const hash = location.hash;
  const hashRoute = hash === '#/blog' || hash.startsWith('#/blog/');
  const active = hashRoute || Boolean(root.dataset.initialRoute);
  root.hidden = !active;
  document.body.classList.toggle('blog-route', active);
  if (!active) return;
  blogAppPromise ??= import('./blog/main.js');
  void blogAppPromise.then(({ mountBlogApp }) => mountBlogApp(root));
}

function syncTravelRoute() {
  const root = document.querySelector('[data-travel-app]');
  if (!root) return;
  const active = location.hash.startsWith('#/travel') || Boolean(root.dataset.initialRoute);
  root.hidden = !active;
  document.body.classList.toggle('travel-route', active);
  if (!active || !requireAuth()) return;
  travelAppPromise ??= import('./travel/main.js');
  void travelAppPromise.then(({ mountTravelApp }) => mountTravelApp(root));
}

function syncPassportPhotoRoute() {
  const root = document.querySelector('[data-passport-photo-app]');
  if (!root) return;
  const active = location.hash.startsWith('#/tools/passport-photo');
  root.hidden = !active;
  document.body.classList.toggle('passport-photo-route', active);
  if (!active) return;
  passportPhotoAppPromise ??= import('./passport-photo/main.js');
  void passportPhotoAppPromise.then(({ mountPassportPhotoApp }) => mountPassportPhotoApp(root));
}

window.addEventListener('hashchange', syncWaterRoute);
window.addEventListener('hashchange', syncHealthRoute);
window.addEventListener('hashchange', syncCoffeeRoute);
window.addEventListener('hashchange', syncThuocRoute);
window.addEventListener('hashchange', syncBrandRoute);
window.addEventListener('hashchange', syncBlogRoute);
window.addEventListener('hashchange', syncTravelRoute);
window.addEventListener('hashchange', syncPassportPhotoRoute);
syncWaterRoute();
syncHealthRoute();
syncCoffeeRoute();
syncThuocRoute();
syncBrandRoute();
syncBlogRoute();
syncTravelRoute();
syncPassportPhotoRoute();

// Unlock/lock → re-evaluate the sensitive apps; leave the home/brand pages
// without a lingering lock overlay when no personal route is active.
window.addEventListener('blogco:auth-changed', () => {
  syncWaterRoute();
  syncHealthRoute();
  syncCoffeeRoute();
  syncThuocRoute();
  syncTravelRoute();
});
window.addEventListener('hashchange', () => {
  const dedicated = '[data-water-app][data-initial-route]:not([hidden]), [data-health-app][data-initial-route]:not([hidden]), [data-coffee-app][data-initial-route]:not([hidden]), [data-thuoc-app][data-initial-route]:not([hidden]), [data-travel-app][data-initial-route]:not([hidden])';
  if (!isSensitiveRoute(location.hash) && !document.querySelector(dedicated)) hideAuthLock();
});
mountAuthControl();
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
