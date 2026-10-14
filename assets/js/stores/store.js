// Data layer for the "Tra cứu cửa hàng" feature (Highlands Coffee + Starbucks).
//
// The built-in catalogue lives in `assets/data/stores.json` and is bundled at
// build time. Users can add their own stores, which are persisted in
// localStorage (`blogco:stores:custom`) and merged with the built-in data on
// every read. Everything runs client-side — no API, no backend.

import catalogue from '../../data/stores.json' with { type: 'json' };

const CUSTOM_KEY = 'blogco:stores:custom';

export const BRANDS = {
  highlands: { key: 'highlands', name: catalogue.brands.highlands.name, emoji: catalogue.brands.highlands.emoji, color: catalogue.brands.highlands.brand_color },
  starbucks: { key: 'starbucks', name: catalogue.brands.starbucks.name, emoji: catalogue.brands.starbucks.emoji, color: catalogue.brands.starbucks.brand_color },
};

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

export { normalizeText };

function decorate(brandKey, store) {
  const brand = BRANDS[brandKey];
  return {
    id: store.id,
    brand: brandKey,
    brandName: brand.name,
    brandEmoji: brand.emoji,
    brandColor: brand.color,
    city: store.city || '',
    district: store.district || '',
    address: store.address || '',
    phone: store.phone || '',
    hours: store.hours || '',
    custom: Boolean(store.custom),
  };
}

function builtinStores() {
  const rows = [];
  for (const key of Object.keys(BRANDS)) {
    for (const store of catalogue.brands[key].stores) rows.push(decorate(key, store));
  }
  return rows;
}

export function readCustomStores() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((store) => store && store.brand in BRANDS && store.address)
      .map((store) => ({ ...store, custom: true }));
  } catch {
    return [];
  }
}

function writeCustomStores(stores) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(stores));
  window.dispatchEvent(new CustomEvent('stores:data-changed'));
}

export function allStores() {
  return [...builtinStores(), ...readCustomStores().map((store) => decorate(store.brand, store))];
}

export function nextCustomId(brand) {
  const prefix = brand === 'starbucks' ? 'sb-custom' : 'hls-custom';
  const existing = readCustomStores().filter((store) => store.brand === brand).length;
  return `${prefix}-${String(existing + 1).padStart(3, '0')}`;
}

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

export function buildStore(input = {}, { id } = {}) {
  const brand = input.brand in BRANDS ? input.brand : 'highlands';
  return {
    id: id || nextCustomId(brand),
    brand,
    city: text(input.city, 120),
    district: text(input.district, 120),
    address: text(input.address, 240),
    phone: text(input.phone, 60),
    hours: text(input.hours, 120),
    custom: true,
  };
}

export function addCustomStore(input) {
  const store = buildStore(input);
  if (!store.address) throw new Error('Vui lòng nhập địa chỉ cửa hàng.');
  if (!store.city) throw new Error('Vui lòng chọn thành phố.');
  writeCustomStores([...readCustomStores(), store]);
  return store;
}

export function updateCustomStore(id, input) {
  const stores = readCustomStores();
  const index = stores.findIndex((store) => store.id === id);
  if (index === -1) throw new Error('Không tìm thấy cửa hàng để sửa.');
  const updated = buildStore(input, { id });
  stores[index] = updated;
  writeCustomStores(stores);
  return updated;
}

export function removeCustomStore(id) {
  writeCustomStores(readCustomStores().filter((store) => store.id !== id));
}

export function exportCustomStores() {
  return JSON.stringify({ version: 1, stores: readCustomStores() }, null, 2);
}

export function importCustomStores(jsonText) {
  const parsed = JSON.parse(jsonText);
  const incoming = Array.isArray(parsed) ? parsed : parsed.stores;
  if (!Array.isArray(incoming)) throw new Error('Tệp JSON không hợp lệ.');
  const cleaned = incoming
    .filter((store) => store && store.brand in BRANDS && store.address)
    .map((store) => ({ ...buildStore(store, { id: store.id }), custom: true }));
  if (!cleaned.length) throw new Error('Không tìm thấy cửa hàng hợp lệ trong tệp.');
  const byId = new Map(readCustomStores().map((store) => [store.id, store]));
  cleaned.forEach((store) => byId.set(store.id, store));
  writeCustomStores([...byId.values()]);
  return cleaned.length;
}

// ---------------------------------------------------------------------------
// Search / filtering
// ---------------------------------------------------------------------------

export function uniqueValues(stores, field) {
  return [...new Set(stores.map((store) => store[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
}

export function searchStores(stores, { brand = 'all', query = '', city = '', district = '' } = {}) {
  const needle = normalizeText(query);
  return stores
    .filter((store) => (brand === 'all' || store.brand === brand))
    .filter((store) => (!city || store.city === city))
    .filter((store) => (!district || store.district === district))
    .filter((store) => {
      if (!needle) return true;
      const haystack = normalizeText([store.address, store.district, store.city, store.brandName, store.phone].join(' '));
      return haystack.includes(needle);
    })
    .sort((a, b) => (
      a.city.localeCompare(b.city, 'vi')
      || a.district.localeCompare(b.district, 'vi')
      || a.address.localeCompare(b.address, 'vi')
    ));
}
