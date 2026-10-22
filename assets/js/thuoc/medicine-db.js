import { recognizeImage } from '../health/ocr.js';

const DB_NAME = 'blogco.medicine-db';
const DB_VERSION = 1;
const STORE = 'products';

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

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Trình duyệt không hỗ trợ lưu kho thuốc cục bộ.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không mở được kho thuốc.'));
  });
}

async function transact(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
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
  await transact('readwrite', (store) => store.put(record));
  return record;
}

export async function deleteMedicineProduct(id) { await transact('readwrite', (store) => store.delete(id)); }

export async function scanMedicineImage(file, onProgress) {
  return recognizeImage(file, { lang: 'vie+eng', onProgress });
}

export async function searchOpenFda(query) {
  const term = String(query || '').trim();
  if (!term) throw new Error('Nhập tên thuốc để tra cứu nguồn tham khảo.');
  const encoded = term.replace(/["\\]/g, ' ').trim();
  const queries = ['brand_name', 'generic_name', 'substance_name'];
  const responses = await Promise.all(queries.map(async (field) => {
    const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(`openfda.${field}:"${encoded}"`)}&limit=5`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Nguồn openFDA trả về lỗi (${response.status}).`);
    const payload = await response.json();
    return payload.results || [];
  }));
  const unique = new Map();
  responses.flat().forEach((item) => unique.set(item.id || JSON.stringify(item.openfda || {}), item));
  return [...unique.values()].map((item) => ({
    title: item.openfda?.brand_name?.[0] || item.openfda?.generic_name?.[0] || term,
    genericName: item.openfda?.generic_name?.[0] || '',
    ingredients: item.openfda?.substance_name || [],
    manufacturer: item.openfda?.manufacturer_name?.[0] || '',
    indications: item.indications_and_usage?.[0] || '',
    clinicalPharmacology: item.clinical_pharmacology?.[0] || '',
    mechanism: item.mechanism_of_action?.[0] || '',
    pharmacokinetics: item.pharmacokinetics?.[0] || '',
    adverseReactions: item.adverse_reactions?.[0] || '',
    contraindications: item.contraindications?.[0] || '',
    source: 'Nhãn thuốc Hoa Kỳ trong openFDA; không xác minh tương đương sản phẩm tại Việt Nam.',
    url: 'https://open.fda.gov/apis/drug/label/',
  }));
}
