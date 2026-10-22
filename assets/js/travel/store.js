const TRIPS_KEY = 'blogco.travel.trips.v1';
const BACKUP_KEY = 'blogco.travel.trips.backup.v1';
const RATES_KEY = 'blogco.travel.rates.v1';

function localStore() {
  try { return globalThis.localStorage; } catch { return null; }
}

function safeRead(key, fallback) {
  try {
    const value = JSON.parse(localStore()?.getItem(key) || 'null');
    return value ?? fallback;
  } catch { return fallback; }
}

function persistTrips(trips) {
  const storage = localStore();
  if (!storage) throw new Error('Trình duyệt không cho phép lưu dữ liệu trên thiết bị này.');
  try {
    const previous = storage.getItem(TRIPS_KEY);
    if (previous) storage.setItem(BACKUP_KEY, previous);
    storage.setItem(TRIPS_KEY, JSON.stringify({ version: 1, trips }));
  } catch { throw new Error('Không thể lưu chuyến đi. Có thể bộ nhớ trình duyệt đã đầy.'); }
}

export function listTrips() {
  const saved = safeRead(TRIPS_KEY, { version: 1, trips: [] });
  return Array.isArray(saved) ? saved : Array.isArray(saved?.trips) ? saved.trips : [];
}

export function findTrip(id) { return listTrips().find((trip) => trip.id === id) || null; }

export function saveTrip(trip) {
  const trips = listTrips();
  const now = new Date().toISOString();
  const index = trips.findIndex((item) => item.id === trip.id);
  const saved = { ...trip, updatedAt: now, createdAt: trip.createdAt || now };
  if (index >= 0) trips[index] = saved;
  else trips.unshift(saved);
  persistTrips(trips);
  return saved;
}

export function deleteTrip(id) {
  const trips = listTrips().filter((trip) => trip.id !== id);
  persistTrips(trips);
}

export function duplicateTrip(id) {
  const trip = findTrip(id);
  if (!trip) return null;
  const copy = structuredClone(trip);
  copy.id = globalThis.crypto?.randomUUID?.() || `trip-${Date.now().toString(36)}`;
  copy.title = `${trip.title} (bản sao)`;
  copy.createdAt = '';
  copy.updatedAt = '';
  return saveTrip(copy);
}

export function readRateCache() { return safeRead(RATES_KEY, null); }

export function writeRateCache(value) {
  try { localStore()?.setItem(RATES_KEY, JSON.stringify(value)); } catch { /* cache is optional */ }
}

export function exportTrips() {
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), trips: listTrips() }, null, 2);
}

export function importTrips(data) {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  if (!Array.isArray(parsed?.trips) || parsed.trips.some((trip) => !trip?.id || !trip?.destination || !Array.isArray(trip?.days))) {
    throw new Error('Tệp không đúng định dạng Travel Studio.');
  }
  const existing = listTrips();
  const byId = new Map(existing.map((trip) => [trip.id, trip]));
  parsed.trips.forEach((trip) => byId.set(trip.id, trip));
  persistTrips([...byId.values()]);
  return parsed.trips.length;
}
