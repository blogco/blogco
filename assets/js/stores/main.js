// Router + view layer for the "Tra cứu cửa hàng" feature.
//
// Routes (hash based, mounted on the home page and dedicated pages):
//   #/stores/search   → tra cứu cửa hàng Highlands + Starbucks
//   #/stores/add      → nhập / sửa cửa hàng thủ công (lưu localStorage)
//
// The built-in catalogue is hard-coded in `assets/data/stores.json`; anything
// the user adds is stored locally and merged on render.

import {
  addCustomStore, allStores, BRANDS, exportCustomStores, importCustomStores,
  normalizeText, readCustomStores, removeCustomStore, searchStores, uniqueValues,
  updateCustomStore,
} from './store.js';

const mountedRoots = new WeakSet();
let pendingToast = '';
let searchState = { brand: 'all', query: '', city: '', district: '' };
let editingId = '';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

// Accent-insensitive index map: for each character of the normalized string,
// remember where it came from in the original so highlights can wrap the real
// (accented) text even when the user typed without diacritics.
function normalizeWithMap(value) {
  const lower = String(value ?? '').toLowerCase();
  const chars = [];
  const map = [];
  for (let i = 0; i < lower.length; i += 1) {
    const clean = lower[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    for (const char of clean) {
      chars.push(char);
      map.push(i);
    }
  }
  return { text: chars.join(''), map };
}

// Character ranges [start, end) in the original string that match the query,
// tried as the whole phrase first and then word by word. Overlaps are merged.
function matchRanges(value, query) {
  const needle = normalizeText(query);
  if (!needle) return [];
  const { text, map } = normalizeWithMap(value);
  const terms = [...new Set([needle, ...needle.split(/[^a-z0-9]+/).filter(Boolean)])]
    .sort((a, b) => b.length - a.length);
  const ranges = [];
  for (const term of terms) {
    let from = 0;
    while (from <= text.length - term.length) {
      const at = text.indexOf(term, from);
      if (at === -1) break;
      ranges.push([map[at], map[at + term.length - 1] + 1]);
      from = at + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function highlight(value, query) {
  const original = String(value ?? '');
  const ranges = matchRanges(original, query);
  if (!ranges.length) return escapeHtml(original);
  let html = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    html += escapeHtml(original.slice(cursor, start));
    html += `<mark class="store-mark">${escapeHtml(original.slice(start, end))}</mark>`;
    cursor = end;
  }
  return html + escapeHtml(original.slice(cursor));
}

function showToast(root, text, isError = false) {
  const toast = root.querySelector('[data-stores-toast]');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('is-visible'), 4000);
}

function toastMarkup() {
  return '<div class="store-toast" data-stores-toast role="status" aria-live="polite" aria-atomic="true"></div>';
}

function pageHeader(title, description) {
  return `<div class="store-page-heading">
    <p class="store-eyebrow">BLOGCO · CỬA HÀNG</p>
    <h1 tabindex="-1">${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
  </div>`;
}

function brandBadge(store) {
  return `<span class="store-badge" style="--store-brand:${escapeHtml(store.brandColor)}">${escapeHtml(store.brandEmoji)} ${escapeHtml(store.brandName)}</span>`;
}

function storeCard(store, query = '') {
  const custom = store.custom ? '<span class="store-tag">Tự thêm</span>' : '';
  return `<li class="store-card" style="--store-brand:${escapeHtml(store.brandColor)}">
    <div class="store-card__head">${brandBadge(store)}${custom}</div>
    <p class="store-card__address">📍 ${highlight(store.address, query)}, ${highlight(store.district, query)}, ${highlight(store.city, query)}</p>
    <p class="store-card__meta"><span>📞 ${escapeHtml(store.phone || '—')}</span><span>🕐 ${escapeHtml(store.hours || '—')}</span><span class="store-card__id">${escapeHtml(store.id)}</span></p>
  </li>`;
}

// ---------------------------------------------------------------------------
// Search page
// ---------------------------------------------------------------------------

function renderSearchPage(root) {
  const stores = allStores();
  const result = searchStores(stores, searchState);
  const cities = uniqueValues(stores, 'city');
  const districts = uniqueValues(
    stores.filter((store) => !searchState.city || store.city === searchState.city),
    'district',
  );
  const brandOption = (key, label, emoji) => {
    const checked = searchState.brand === key ? ' checked' : '';
    return `<label class="store-radio"><input type="radio" name="brand" value="${key}"${checked}> ${emoji ? `${emoji} ` : ''}${escapeHtml(label)}</label>`;
  };

  root.innerHTML = `${pageHeader('Tra cứu cửa hàng', 'Tìm cửa hàng Highlands Coffee và Starbucks theo thương hiệu, thành phố, quận hoặc địa chỉ.')}
  <section class="store-card store-panel">
    <form id="stores-search-form" class="store-search" role="search">
      <fieldset class="store-brands">
        <legend>Thương hiệu</legend>
        <div class="store-brands__row">
          ${brandOption('highlands', BRANDS.highlands.name, catalogueEmoji('highlands'))}
          ${brandOption('starbucks', BRANDS.starbucks.name, catalogueEmoji('starbucks'))}
          ${brandOption('all', 'Tất cả')}
        </div>
      </fieldset>
      <label class="store-field store-field--search">🔍 Tìm kiếm
        <input type="search" name="query" value="${escapeHtml(searchState.query)}" placeholder="Tên đường, quận, thành phố...">
      </label>
      <div class="store-filters">
        <label class="store-field">Thành phố
          <select name="city">
            <option value="">Tất cả</option>
            ${cities.map((city) => `<option value="${escapeHtml(city)}"${city === searchState.city ? ' selected' : ''}>${escapeHtml(city)}</option>`).join('')}
          </select>
        </label>
        <label class="store-field">Quận / Huyện
          <select name="district">
            <option value="">Tất cả</option>
            ${districts.map((district) => `<option value="${escapeHtml(district)}"${district === searchState.district ? ' selected' : ''}>${escapeHtml(district)}</option>`).join('')}
          </select>
        </label>
        <div class="store-filters__actions">
          <button class="store-button" type="submit">Tra cứu</button>
          <button class="store-button store-button--ghost" type="button" data-stores-reset>Xoá lọc</button>
        </div>
      </div>
    </form>
  </section>
  <section class="store-results" aria-live="polite">
    <p class="store-results__count">Kết quả: <strong>${result.length}</strong> cửa hàng</p>
    ${result.length
      ? `<ul class="store-grid">${result.map((store) => storeCard(store, searchState.query)).join('')}</ul>`
      : '<p class="store-empty">Không tìm thấy cửa hàng phù hợp. Thử từ khoá khác hoặc thêm cửa hàng ở mục “Nhập dữ liệu”.</p>'}
  </section>
  <p class="store-note">Dữ liệu mang tính tham khảo, tổng hợp từ trang công khai của thương hiệu. Bạn có thể bổ sung cửa hàng còn thiếu ở mục <a href="#/stores/add">Nhập dữ liệu</a>.</p>
  ${toastMarkup()}`;
}

function catalogueEmoji(key) {
  return BRANDS[key]?.emoji || '';
}

// ---------------------------------------------------------------------------
// Add / edit page
// ---------------------------------------------------------------------------

function customList() {
  const custom = readCustomStores();
  if (!custom.length) return '<p class="store-empty">Chưa có cửa hàng nào do bạn thêm.</p>';
  return `<ul class="store-custom-list">${custom.map((store) => {
    const brand = BRANDS[store.brand];
    return `<li class="store-custom-row">
      <div><strong>${escapeHtml(brand.emoji)} ${escapeHtml(brand.name)}</strong><small>${escapeHtml(store.address)}, ${escapeHtml(store.district)}, ${escapeHtml(store.city)}</small></div>
      <div class="store-custom-row__actions">
        <button class="store-button store-button--ghost" type="button" data-store-edit="${escapeHtml(store.id)}">Sửa</button>
        <button class="store-button store-button--danger" type="button" data-store-delete="${escapeHtml(store.id)}">Xoá</button>
      </div>
    </li>`;
  }).join('')}</ul>`;
}

function renderAddForm(root) {
  const editing = editingId ? readCustomStores().find((store) => store.id === editingId) : null;
  const store = editing || {};
  const brand = store.brand || 'highlands';
  root.innerHTML = `${pageHeader('Nhập dữ liệu cửa hàng', 'Bổ sung cửa hàng còn thiếu. Dữ liệu được lưu ngay trên thiết bị này (localStorage).')}
  <section class="store-card store-panel">
    <form id="stores-add-form" class="store-form">
      <fieldset class="store-brands">
        <legend>Thương hiệu *</legend>
        <div class="store-brands__row">
          <label class="store-radio"><input type="radio" name="brand" value="highlands"${brand === 'highlands' ? ' checked' : ''}> ☕ Highlands</label>
          <label class="store-radio"><input type="radio" name="brand" value="starbucks"${brand === 'starbucks' ? ' checked' : ''}> 🟢 Starbucks</label>
        </div>
      </fieldset>
      <div class="store-form-grid">
        <label class="store-field">Thành phố *<input name="city" required maxlength="120" value="${escapeHtml(store.city || '')}" list="store-city-list" placeholder="Hà Nội">
          <datalist id="store-city-list"><option value="Hà Nội"></option><option value="TP. Hồ Chí Minh"></option><option value="Đà Nẵng"></option><option value="Hải Phòng"></option><option value="Cần Thơ"></option></datalist>
        </label>
        <label class="store-field">Quận / Huyện *<input name="district" required maxlength="120" value="${escapeHtml(store.district || '')}" placeholder="Hoàn Kiếm"></label>
        <label class="store-field store-field--full">Địa chỉ *<input name="address" required maxlength="240" value="${escapeHtml(store.address || '')}" placeholder="38-40 Lê Thái Tổ, Hàng Trống"></label>
        <label class="store-field">Điện thoại<input name="phone" maxlength="60" value="${escapeHtml(store.phone || '')}" placeholder="(024) 3936 9017"></label>
        <label class="store-field">Giờ mở cửa<input name="hours" maxlength="120" value="${escapeHtml(store.hours || '')}" placeholder="07:00 - 22:00"></label>
      </div>
      <div class="store-form__actions">
        <button class="store-button store-button--ghost" type="button" data-store-cancel${editing ? '' : ' hidden'}>Huỷ</button>
        <button class="store-button" type="submit">${editing ? '💾 Cập nhật cửa hàng' : '💾 Lưu cửa hàng'}</button>
      </div>
    </form>
  </section>
  <section class="store-card store-panel">
    <div class="store-panel__head">
      <h2>Danh sách đã thêm</h2>
      <div class="store-panel__actions">
        <button class="store-button store-button--ghost" type="button" data-stores-export>⬇️ Xuất JSON</button>
        <button class="store-button store-button--ghost" type="button" data-stores-import>⬆️ Nhập JSON</button>
        <input type="file" accept="application/json,.json" data-stores-import-input hidden>
      </div>
    </div>
    <div data-stores-custom-list>${customList()}</div>
  </section>
  ${toastMarkup()}`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function routeName(root) {
  const hash = location.hash.startsWith('#/stores') ? location.hash.slice(1).replace(/\/$/, '') : '';
  if (hash) return hash;
  const initial = root.dataset.initialRoute;
  return initial ? `/stores/${initial}` : '/stores/search';
}

function showRoute(root) {
  const route = routeName(root);
  if (route === '/stores/add') renderAddForm(root);
  else renderSearchPage(root);
  document.title = `${route === '/stores/add' ? 'Nhập dữ liệu cửa hàng' : 'Tra cứu cửa hàng'} | BlogCo`;
  if (pendingToast) {
    const message = pendingToast;
    pendingToast = '';
    showToast(root, message);
  }
  const heading = root.querySelector('h1[tabindex="-1"]');
  if (heading) heading.focus({ preventScroll: true });
}

function readSearchForm(form) {
  const data = new FormData(form);
  searchState = {
    brand: String(data.get('brand') || 'all'),
    query: String(data.get('query') || ''),
    city: String(data.get('city') || ''),
    district: String(data.get('district') || ''),
  };
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function mountStoresApp(root) {
  if (!root) return;
  if (mountedRoots.has(root)) {
    showRoute(root);
    return;
  }
  mountedRoots.add(root);

  root.addEventListener('click', (event) => {
    const target = event.target;

    if (target.closest('[data-stores-reset]')) {
      searchState = { brand: 'all', query: '', city: '', district: '' };
      showRoute(root);
      return;
    }
    const edit = target.closest('[data-store-edit]');
    if (edit) {
      editingId = edit.dataset.storeEdit;
      renderAddForm(root);
      root.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
      return;
    }
    const del = target.closest('[data-store-delete]');
    if (del) {
      const id = del.dataset.storeDelete;
      if (window.confirm('Xoá cửa hàng này khỏi thiết bị?')) {
        removeCustomStore(id);
        if (editingId === id) editingId = '';
        renderAddForm(root);
        showToast(root, 'Đã xoá cửa hàng.');
      }
      return;
    }
    if (target.closest('[data-store-cancel]')) {
      editingId = '';
      renderAddForm(root);
      return;
    }
    if (target.closest('[data-stores-export]')) {
      download('blogco-cua-hang.json', exportCustomStores());
      showToast(root, 'Đã xuất danh sách cửa hàng tự thêm.');
      return;
    }
    if (target.closest('[data-stores-import]')) {
      root.querySelector('[data-stores-import-input]')?.click();
      return;
    }
  });

  root.addEventListener('change', (event) => {
    const input = event.target.closest('[data-stores-import-input]');
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const count = importCustomStores(String(reader.result || ''));
        editingId = '';
        renderAddForm(root);
        showToast(root, `Đã nhập ${count} cửa hàng.`);
      } catch (error) {
        showToast(root, error.message || 'Không nhập được tệp JSON.', true);
      }
    };
    reader.readAsText(file);
    input.value = '';
  });

  // Live filter on typing without losing focus: re-render, then restore the
  // caret/focus to the search input.
  let liveTimer;
  root.addEventListener('input', (event) => {
    const form = event.target.closest('#stores-search-form');
    if (!form || event.target.name !== 'query') return;
    const caret = event.target.selectionStart;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      readSearchForm(form);
      renderSearchPage(root);
      const next = root.querySelector('#stores-search-form [name="query"]');
      if (next) {
        next.focus();
        next.setSelectionRange(caret, caret);
      }
    }, 160);
  });

  root.addEventListener('change', (event) => {
    if (event.target.closest('#stores-search-form')) {
      readSearchForm(event.target.closest('#stores-search-form'));
      renderSearchPage(root);
    }
  });

  root.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'stores-search-form') {
      readSearchForm(form);
      renderSearchPage(root);
      return;
    }
    if (form.id === 'stores-add-form') {
      try {
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form).entries());
        if (editingId) {
          updateCustomStore(editingId, data);
          pendingToast = 'Đã cập nhật cửa hàng.';
          editingId = '';
        } else {
          addCustomStore(data);
          pendingToast = 'Đã lưu cửa hàng mới.';
        }
        renderAddForm(root);
        showToast(root, pendingToast);
        pendingToast = '';
      } catch (error) {
        showToast(root, error.message || 'Không lưu được cửa hàng.', true);
      }
    }
  });

  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/stores')) {
      editingId = '';
      showRoute(root);
    }
  });
  window.addEventListener('stores:data-changed', () => showRoute(root));

  showRoute(root);
}

export { normalizeText, highlight, matchRanges };
