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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('stores:data-changed'));
  }
}

export function allStores() {
  return [...builtinStores(), ...readCustomStores().map((store) => decorate(store.brand, store))];
}

export function nextCustomId(brand) {
  const prefix = brand === 'starbucks' ? 'sb-custom-' : 'hls-custom-';
  const used = readCustomStores()
    .map((store) => store.id)
    .filter((id) => String(id).startsWith(prefix))
    .map((id) => Number(String(id).slice(prefix.length)))
    .filter((value) => Number.isInteger(value));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
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
  if (!store.district) throw new Error('Vui lòng chọn quận.');
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

function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = a[i - 1] === b[j - 1]
        ? diagonal
        : Math.min(diagonal, prev[j - 1], prev[j]) + 1;
      diagonal = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}

function wordsOf(value) {
  return value.split(/[^a-z0-9]+/).filter(Boolean);
}

// Accent-insensitive relevance score. Returns a number (higher = more
// relevant) or null when the store does not match the needle at all. The
// needle is expected to be normalized already.
//
// Phrase tiers beat per-word tiers so an exact address hit outranks a store
// that merely shares one word:
//   100  phrase inside the address
//    90  phrase inside the district
//    80  phrase inside the city
//    70  phrase spanning fields (e.g. "hoan kiem ha noi")
//    60  compact phrase, punctuation/spacing removed (e.g. "lethaito")
//    <60 per-word matches: exact > prefix > one typo (5+ char words only,
//        so "Lê" never reaches "Lý")
function scoreStore(store, needle) {
  if (!needle) return 0;
  const address = normalizeText(store.address);
  const district = normalizeText(store.district);
  const city = normalizeText(store.city);
  const haystack = [address, district, city, normalizeText(store.brandName)].filter(Boolean).join(' ');

  let score = 0;
  if (address.includes(needle)) score = Math.max(score, 100);
  if (district.includes(needle)) score = Math.max(score, 90);
  if (city.includes(needle)) score = Math.max(score, 80);
  if (haystack.includes(needle)) score = Math.max(score, 70);

  const compactNeedle = needle.replace(/[^a-z0-9]+/g, '');
  const compactHaystack = haystack.replace(/[^a-z0-9]+/g, '');
  if (compactNeedle && compactHaystack.includes(compactNeedle)) score = Math.max(score, 60);

  const words = wordsOf(haystack);
  const tokens = wordsOf(needle);
  if (!tokens.length) return score;
  let wordScore = 0;
  const everyWord = tokens.every((token) => {
    if (words.some((word) => word === token)) wordScore += 12;
    else if (token.length >= 4 && words.some((word) => word.includes(token))) wordScore += 8;
    else if (token.length >= 5 && words.some((word) => editDistance(word, token) <= 1)) wordScore += 5;
    else return false;
    return true;
  });
  // Cap word-only matches below the weakest phrase tier so phrase hits always win.
  if (everyWord) score = Math.max(score, Math.min(wordScore, 59));

  return score || null;
}

export function searchStores(stores, { brand = 'all', query = '', city = '', district = '' } = {}) {
  const needle = normalizeText(query);
  return stores
    .filter((store) => (brand === 'all' || store.brand === brand))
    .filter((store) => (!city || store.city === city))
    .filter((store) => (!district || store.district === district))
    .map((store) => ({ store, score: scoreStore(store, needle) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => (
      b.score - a.score
      || a.store.city.localeCompare(b.store.city, 'vi')
      || a.store.district.localeCompare(b.store.district, 'vi')
      || a.store.address.localeCompare(b.store.address, 'vi')
    ))
    .map((entry) => entry.store);
}
