import { recognizeImage } from '../health/ocr.js';

const DB_NAME = 'blogco.medicine-db';
const DB_VERSION = 2;
const STORE = 'products';
const REFERENCE_STORE = 'references';

export function normalizeMedicineSearch(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function extractMedicineFields(rawText = '') {
  const lines = String(rawText).split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const find = (pattern) => lines.find((line) => pattern.test(line)) || '';
  const strength = find(/\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|g|ml|iu)\b/i).match(/\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|g|ml|iu)\b/i)?.[0] || '';
  const registration = find(/(?:số đăng ký|sđk|reg(?:istration)?\.?\s*(?:no|number)?)/i).replace(/^.*?(?:số đăng ký|sđk|reg(?:istration)?\.?\s*(?:no|number)?)\s*[:#-]?\s*/i, '');
  const manufacturer = find(/(?:sản xuất bởi|nhà sản xuất|manufactured by|manufacturer)/i).replace(/^.*?(?:sản xuất bởi|nhà sản xuất|manufactured by|manufacturer)\s*[:#-]?\s*/i, '');
  const expiry = find(/(?:hạn dùng|hạn sử dụng|exp(?:iry)?\.?|use before)/i).replace(/^.*?(?:hạn dùng|hạn sử dụng|exp(?:iry)?\.?|use before)\s*[:#-]?\s*/i, '');
  const ingredient = find(/(?:thành phần|hoạt chất|active ingredient|each tablet|each capsule)/i);
  const name = lines.find((line) => line.length > 2 && line.length < 100 && /[a-zà-ỹ]/i.test(line) && !/(thành phần|hoạt chất|sản xuất bởi|nhà sản xuất|hạn dùng|hạn sử dụng|số đăng ký|sđk)/i.test(line)) || '';
  return { brandName: name, genericName: ingredient.replace(/^.*?(?:thành phần|hoạt chất|active ingredient)\s*[:#-]?\s*/i, ''), strength, manufacturer, registrationNumber: registration, expirationDate: expiry, rawOcrText: String(rawText) };
}

export function findMedicineDuplicates(records, candidate) {
  const key = (record) => [record.brandName, record.genericName, record.strength, record.dosageForm, record.manufacturer, record.registrationNumber].map(normalizeMedicineSearch).join('|');
  const exact = key(candidate);
  return records.filter((record) => exact === key(record));
}

export function buildDrugSearchUrls(query = '') {
  const term = String(query || '').trim();
  if (!term) return [];
  const q = encodeURIComponent(term);
  return [
    { name: 'Tìm trên web', url: `https://www.google.com/search?q=${q}+thu%E1%BB%91c+ho%E1%BA%A1t+ch%E1%BA%A5t` },
    { name: 'DailyMed', url: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${q}` },
    { name: 'Cục Quản lý Dược Việt Nam', url: `https://dav.gov.vn/` },
  ];
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Trình duyệt không hỗ trợ lưu kho thuốc cục bộ.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains(REFERENCE_STORE)) request.result.createObjectStore(REFERENCE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không mở được kho thuốc.'));
  });
}

async function transact(storeName, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try { result = action(store); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Không thể cập nhật kho thuốc.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Giao dịch lưu kho thuốc bị hủy.')); };
  });
}

export async function getMedicineProducts() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result || []); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveMedicineProduct(input, images = [], id = '') {
  const record = { ...input, id: id || input.id || `med-${crypto.randomUUID()}`, images, updatedAt: new Date().toISOString(), createdAt: input.createdAt || new Date().toISOString() };
  await transact(STORE, 'readwrite', (store) => store.put(record));
  return record;
}

export async function deleteMedicineProduct(id) { await transact(STORE, 'readwrite', (store) => store.delete(id)); }

export async function saveMedicineReference(input) {
  const sourceUrl = new URL(String(input.sourceUrl || ''));
  if (!['http:', 'https:'].includes(sourceUrl.protocol)) throw new Error('URL nguồn phải bắt đầu bằng http hoặc https.');
  const record = { id: `ref-${crypto.randomUUID()}`, medicineName: String(input.medicineName || '').trim().slice(0, 160), title: String(input.title || '').trim().slice(0, 200), sourceUrl: sourceUrl.href, content: String(input.content || '').trim().slice(0, 20000), createdAt: new Date().toISOString() };
  if (!record.medicineName || !record.content) throw new Error('Cần tên thuốc và nội dung tham khảo đã kiểm tra.');
  await transact(REFERENCE_STORE, 'readwrite', (store) => store.put(record));
  return record;
}

export async function getMedicineReferences() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(REFERENCE_STORE, 'readonly').objectStore(REFERENCE_STORE).getAll();
    request.onsuccess = () => { db.close(); resolve((request.result || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function scanMedicineImage(file, onProgress) {
  return recognizeImage(file, { lang: 'vie+eng', onProgress });
}
