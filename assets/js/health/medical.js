// Local-first medical knowledge store and offline extractor.
// Raw text never leaves the device: extraction uses labels and common medical
// keywords instead of a paid LLM/API.

import { escapeHtml } from './medicine.js';
import { getDefaultGitHubSettings, getSessionGitHubSettings, parseRepo, syncToGitHub } from './github-sync.js';
import { rawFileUrl } from '../blog/lib.js';

export const MEDICAL_STORAGE_KEY = 'blogco.health.medical.v1';
const BACKUP_KEY = 'blogco.health.medical.backup.v1';
const SEED_KEY = 'blogco.health.medical.seeded.v1';
export const MEDICAL_REPO_PATH = 'static/data/medical-knowledge.json';

const SAMPLE_ENTRY = {
  id: 'medical-cum-mua',
  title: 'Cúm mùa',
  category: 'Bệnh lý',
  symptoms: ['Sốt', 'Ho', 'Đau họng', 'Đau mỏi người'],
  treatment: 'Nghỉ ngơi, uống đủ nước, theo dõi dấu hiệu nặng và dùng thuốc theo hướng dẫn của nhân viên y tế.',
  relatedMedications: ['Paracetamol — giảm đau, hạ sốt', 'Oseltamivir — thuốc kháng virus, cần được kê đơn'],
  rawContent: 'Cúm mùa\nTriệu chứng: sốt, ho, đau họng, đau mỏi người.\nĐiều trị: nghỉ ngơi, uống đủ nước, dùng thuốc theo hướng dẫn.\nThuốc liên quan: Paracetamol, Oseltamivir.',
};

let memoryCache;
let storageError = '';

function medicalStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function text(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function multiline(value, max = 6000) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function blankState() {
  return { version: 1, nextId: 1, items: [] };
}

export function generateInputId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8).toUpperCase()
    || Math.random().toString(36).slice(2, 10).toUpperCase();
  return `INPUT-${date}-${random}`;
}

function slugify(value) {
  return String(value || 'tri-thuc-y-khoa')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'tri-thuc-y-khoa';
}

function normalizeList(value, maxItems = 24) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(typeof item === 'string' ? item : `${item?.name || ''}${item?.note ? ` — ${item.note}` : ''}`, 240)).filter(Boolean).slice(0, maxItems);
}

export function normalizeMedicalEntry(input = {}, existing = {}) {
  const title = text(input.title, 240) || 'Tri thức y khoa chưa đặt tên';
  const createdAt = existing.createdAt || input.createdAt || new Date().toISOString();
  return {
    id: existing.id || text(input.id, 100) || `medical-${slugify(title)}-${Date.now()}`,
    inputId: existing.inputId || text(input.inputId, 100) || generateInputId(),
    commitId: text(input.commitId || existing.commitId, 7),
    title,
    category: ['Bệnh lý', 'Thuốc', 'Dinh dưỡng'].includes(input.category) ? input.category : 'Bệnh lý',
    symptoms: normalizeList(input.symptoms),
    treatment: multiline(input.treatment, 2400),
    relatedMedications: normalizeList(input.relatedMedications || input.related_medications),
    rawContent: multiline(input.rawContent || input.raw_content, 8000),
    createdAt,
    updatedAt: input.updatedAt || existing.updatedAt || new Date().toISOString(),
  };
}

function readState() {
  if (memoryCache) return clone(memoryCache);
  const storage = medicalStorage();
  let raw = null;
  let parsed = null;
  let hasStoredValue = false;
  try {
    raw = storage?.getItem(MEDICAL_STORAGE_KEY) || null;
    hasStoredValue = raw !== null;
    if (hasStoredValue) parsed = JSON.parse(raw);
  } catch {
    storageError = 'Không đọc được dữ liệu tri thức y khoa. Dữ liệu lỗi đã được tạm reset về rỗng.';
  }
  const hasStoredState = parsed && parsed.version === 1 && Array.isArray(parsed.items);
  if (hasStoredState) storageError = '';
  memoryCache = hasStoredState
    ? { ...blankState(), ...parsed, items: parsed.items.map((item) => normalizeMedicalEntry(item, item)) }
    : blankState();
  if (hasStoredValue && !hasStoredState && !storageError) {
    storageError = 'Dữ liệu tri thức y khoa không đúng định dạng. Dữ liệu đã được tạm reset về rỗng.';
  }
  if (hasStoredState && storage) {
    try {
      storage.setItem(MEDICAL_STORAGE_KEY, JSON.stringify(memoryCache));
      storage.setItem(BACKUP_KEY, JSON.stringify(memoryCache));
      storage.setItem(SEED_KEY, '1');
    } catch { /* keep the in-memory migration when storage is unavailable */ }
  }
  return clone(memoryCache);
}

function writeState(state) {
  const serialized = JSON.stringify(state);
  const storage = medicalStorage();
  try {
    if (!storage) throw new Error('localStorage unavailable');
    storage.setItem(BACKUP_KEY, serialized);
    storage.setItem(MEDICAL_STORAGE_KEY, serialized);
    storage.setItem(SEED_KEY, '1');
  } catch {
    throw new Error('Không thể lưu tri thức y khoa trên thiết bị này.');
  }
  storageError = '';
  memoryCache = clone(state);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('health:data-changed'));
}

export function getMedicalEntries() {
  return readState().items;
}

export function reloadMedicalEntries() {
  memoryCache = undefined;
  return getMedicalEntries();
}

export function getMedicalStorageError() {
  return storageError;
}

export function saveMedicalKnowledge(input = {}) {
  const state = readState();
  const existingIndex = state.items.findIndex((item) => item.id === input.id || (input.inputId && item.inputId === input.inputId));
  const existing = existingIndex >= 0 ? state.items[existingIndex] : {};
  const entry = normalizeMedicalEntry(input, existing);
  if (existingIndex >= 0) state.items[existingIndex] = entry;
  else {
    state.items.unshift(entry);
    state.nextId += 1;
  }
  writeState(state);
  return clone(entry);
}

export function deleteMultiple(inputIds = []) {
  const state = readState();
  const ids = new Set(inputIds.filter(Boolean));
  const nextItems = state.items.filter((item) => !ids.has(item.inputId));
  if (nextItems.length === state.items.length) return 0;
  writeState({ ...state, items: nextItems });
  return state.items.length - nextItems.length;
}

export function deleteRecord(inputId) {
  return deleteMultiple([inputId]) > 0;
}

function levenshteinSimilarity(left, right) {
  const a = fold(left);
  const b = fold(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function symptomSimilarity(left = [], right = []) {
  const a = new Set(left.flatMap((item) => tokens(item)));
  const b = new Set(right.flatMap((item) => tokens(item)));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / new Set([...a, ...b]).size;
}

function recordSimilarity(left = {}, right = {}) {
  const titleScore = levenshteinSimilarity(left.title, right.title);
  const hasSymptoms = Array.isArray(left.symptoms) && Array.isArray(right.symptoms)
    && (left.symptoms.length || right.symptoms.length);
  const symptomScore = hasSymptoms ? symptomSimilarity(left.symptoms, right.symptoms) : 0;
  return hasSymptoms ? titleScore * .6 + symptomScore * .4 : titleScore;
}

export function detectDuplicate(newRecord = {}, existingRecords = getMedicalEntries()) {
  const candidates = existingRecords.filter((record) => record.inputId !== newRecord.inputId && record.id !== newRecord.id);
  let closest = null;
  candidates.forEach((record) => {
    const score = recordSimilarity(newRecord, record);
    if (score > .8 && (!closest || score > closest.similarity)) {
      closest = { record, inputId: record.inputId, similarity: score, percentage: Math.round(score * 100) };
    }
  });
  return closest;
}

export function detectAllDuplicates(records = getMedicalEntries()) {
  const duplicates = [];
  const orderedRecords = [...records].sort(compareCreatedAt);
  for (let leftIndex = 0; leftIndex < orderedRecords.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < orderedRecords.length; rightIndex += 1) {
      const first = orderedRecords[leftIndex];
      const second = orderedRecords[rightIndex];
      const similarity = recordSimilarity(first, second);
      if (similarity > .8) {
        duplicates.push({ first, second, similarity, percentage: Math.round(similarity * 100) });
      }
    }
  }
  return duplicates.sort((left, right) => right.similarity - left.similarity);
}

function recommendationStorage() {
  return medicalStorage();
}

const RECOMMENDATION_SKIP_KEY = 'blogco.health.medical.recommendation-skips.v1';

export function getSkippedRecommendationKeys() {
  try {
    const saved = JSON.parse(recommendationStorage()?.getItem(RECOMMENDATION_SKIP_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

export function skipRecommendation(key) {
  const keys = getSkippedRecommendationKeys();
  keys.add(String(key));
  try { recommendationStorage()?.setItem(RECOMMENDATION_SKIP_KEY, JSON.stringify([...keys])); } catch { /* ignore unavailable storage */ }
}

function createdAtValue(record = {}) {
  const value = String(record.createdAt || '').trim();
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  const localDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (localDate) return Date.parse(`${localDate[3]}-${localDate[2]}-${localDate[1]}T00:00:00Z`);
  return Number.MAX_SAFE_INTEGER;
}

function compareCreatedAt(left = {}, right = {}) {
  return createdAtValue(left) - createdAtValue(right)
    || String(left.inputId || left.id || '').localeCompare(String(right.inputId || right.id || ''));
}

export function generateRecommendations(duplicatePairs = []) {
  if (!duplicatePairs.length) return [];
  const orderedPairs = duplicatePairs.map((pair) => {
    const endpoints = [pair.first, pair.second].sort(compareCreatedAt);
    return { ...pair, first: endpoints[0], second: endpoints[1] };
  }).sort((left, right) => compareCreatedAt(left.first, right.first)
    || compareCreatedAt(left.second, right.second));
  const records = new Map();
  const parent = new Map();
  const find = (inputId) => {
    let current = inputId;
    while (parent.get(current) && parent.get(current) !== current) current = parent.get(current);
    return current;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  orderedPairs.forEach((pair) => {
    [pair.first, pair.second].forEach((record) => {
      records.set(record.inputId, record);
      if (!parent.has(record.inputId)) parent.set(record.inputId, record.inputId);
    });
    union(pair.first.inputId, pair.second.inputId);
  });

  const clusters = new Map();
  records.forEach((record, inputId) => {
    const root = find(inputId);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(record);
  });

  return [...clusters.values()].map((cluster) => {
    const ordered = [...cluster].sort((left, right) => createdAtValue(left) - createdAtValue(right)
      || String(left.inputId).localeCompare(String(right.inputId)));
    const original = { ...ordered[0], isOriginal: true };
    const clusterIds = ordered.map((record) => record.inputId).sort();
    const pairs = orderedPairs.filter((pair) => clusterIds.includes(pair.first.inputId) && clusterIds.includes(pair.second.inputId));
    const toDelete = ordered.slice(1).map((record) => {
      const relatedPair = pairs
        .filter((pair) => pair.first.inputId === record.inputId || pair.second.inputId === record.inputId)
        .sort((left, right) => right.similarity - left.similarity)[0];
      const percentage = relatedPair?.percentage || Math.max(...pairs.map((pair) => pair.percentage));
      return {
        ...record,
        isOriginal: false,
        similarity: relatedPair?.similarity || Math.max(...pairs.map((pair) => pair.similarity)),
        percentage,
        reason: `Bản ghi nhập sau, trùng với nội dung gốc ${original.inputId} (độ tương đồng: ${percentage}%).`,
      };
    });
    return {
      key: clusterIds.join('|'),
      clusterIds,
      original,
      toDelete,
      keepId: original.inputId,
      removeIds: toDelete.map((record) => record.inputId),
      percentage: Math.max(...pairs.map((pair) => pair.percentage)),
      similarity: Math.max(...pairs.map((pair) => pair.similarity)),
      reason: `Bản ghi nhập sau, trùng với nội dung gốc ${original.inputId}.`,
      pairs,
    };
  }).sort((left, right) => right.similarity - left.similarity);
}

export function markMedicalEntriesSynced(entries = [], commitId = '') {
  const state = readState();
  const normalized = entries.map((item) => normalizeMedicalEntry({ ...item, commitId }, item));
  const nextId = Math.max(state.nextId, normalized.length + 1);
  writeState({ ...state, nextId, items: normalized });
  return clone(normalized);
}

export function seedMedicalKnowledge() {
  const state = readState();
  const storage = medicalStorage();
  let wasSeeded = false;
  try { wasSeeded = storage?.getItem(SEED_KEY) === '1'; } catch { /* ignore unavailable storage */ }
  if (!state.items.length && !storageError && !wasSeeded) {
    state.items = [normalizeMedicalEntry(SAMPLE_ENTRY, SAMPLE_ENTRY)];
    state.nextId = 2;
    writeState(state);
  }
  return state.items;
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function tokens(value) {
  return [...new Set(fold(value).split(/[^a-z0-9]+/).filter((token) => token.length > 1))];
}

export function searchMedicalKnowledge(query = '', source = getMedicalEntries()) {
  const entries = source;
  const needle = tokens(query);
  if (!needle.length) return entries;
  return entries.map((entry) => {
    const fields = {
      title: fold(entry.title),
      category: fold(entry.category),
      symptoms: fold(entry.symptoms.join(' ')),
      treatment: fold(entry.treatment),
      medication: fold(entry.relatedMedications.join(' ')),
      raw: fold(entry.rawContent),
    };
    const score = needle.reduce((total, token) => total
      + (fields.title.includes(token) ? 12 : 0)
      + (fields.medication.includes(token) ? 8 : 0)
      + (fields.symptoms.includes(token) ? 6 : 0)
      + (fields.treatment.includes(token) ? 4 : 0)
      + (fields.category.includes(token) ? 3 : 0)
      + (fields.raw.includes(token) ? 1 : 0), 0);
    return { entry, score };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score).map((result) => result.entry);
}

export function mergeMedicalEntries(...collections) {
  const byId = new Map();
  collections.flat().filter(Boolean).forEach((item) => {
    const entry = normalizeMedicalEntry(item, item);
    const current = byId.get(entry.id);
    if (!current || new Date(entry.updatedAt || 0) >= new Date(current.updatedAt || 0)) byId.set(entry.id, entry);
  });
  return [...byId.values()].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

async function fetchRemotePayload(settings = getDefaultGitHubSettings()) {
  const repo = settings.repo || 'blogco/blogco';
  const branch = settings.branch || 'main';
  const filePath = settings.filePath || MEDICAL_REPO_PATH;
  const url = `${rawFileUrl(repo, branch, filePath)}?t=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) return { items: [] };
  if (!response.ok) throw new Error(`Không tải được kho tri thức online (${response.status}).`);
  const payload = await response.json();
  return { ...payload, items: Array.isArray(payload) ? payload : (payload.items || []) };
}

export async function loadRemoteMedicalKnowledge(settings = getDefaultGitHubSettings()) {
  const payload = await fetchRemotePayload(settings);
  return mergeMedicalEntries(payload.items);
}

export async function syncMedicalKnowledge(syncSettings = getSessionGitHubSettings()) {
  const settings = { ...getSessionGitHubSettings(), ...syncSettings };
  if (!settings.token) throw new Error('Chưa có GitHub PAT. Mở tab “Đồng bộ” để nhập token trong phiên này.');
  const localItems = getMedicalEntries();
  const remotePayload = await fetchRemotePayload(settings);
  const items = mergeMedicalEntries(remotePayload.items, localItems);
  const payload = {
    app: 'BlogCo',
    feature: 'medical-knowledge',
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };
  const { owner, name } = parseRepo(settings.repo);
  const result = await syncToGitHub(settings.token, owner, name, settings.branch || 'main', settings.filePath || MEDICAL_REPO_PATH, JSON.stringify(payload, null, 2));
  const syncedItems = result.commitId ? markMedicalEntriesSynced(items, result.commitId) : items;
  return { ...result, items: syncedItems, count: syncedItems.length };
}

function sectionText(lines, patterns) {
  const index = lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));
  if (index < 0) return '';
  const first = lines[index].replace(/^[^:：]+[:：]\s*/, '').trim();
  const values = first ? [first] : [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (/^\s*(?:tên|title|danh mục|category|triệu chứng|symptoms|điều trị|treatment|thuốc liên quan|related medications?)\s*[:：]/i.test(lines[cursor])) break;
    if (lines[cursor]) values.push(lines[cursor]);
  }
  return values.join(' ').trim();
}

function parseList(value) {
  return [...new Set(String(value || '').split(/[,;•\n]|\s+-\s+/).map((item) => text(item, 240)).filter(Boolean))].slice(0, 24);
}

const MEDICATION_NAMES = ['Paracetamol', 'Oseltamivir', 'Ibuprofen', 'Amoxicillin', 'Cetirizine', 'Vitamin C'];

export function extractMedicalKnowledge(rawContent, category = 'Bệnh lý') {
  const raw = multiline(rawContent, 8000);
  if (!raw) throw new Error('Hãy dán dữ liệu thô trước khi phân tích.');
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const titleLine = lines.find((line) => /^(?:tên bệnh|tên thuốc|tiêu đề|title)\s*[:：]/i.test(line));
  const title = text(titleLine?.replace(/^[^:：]+[:：]\s*/, '') || lines.find((line) => /^#\s+/.test(line))?.replace(/^#+\s*/, '') || lines[0], 240);
  const symptomText = sectionText(lines, [/^(?:triệu chứng|symptoms?)\s*[:：]/i]);
  const treatment = sectionText(lines, [/^(?:điều trị|treatment)\s*[:：]/i]) || lines.filter((line) => /(?:điều trị|nghỉ ngơi|uống đủ|dùng thuốc|theo dõi)/i.test(line)).join(' ');
  const medicationText = sectionText(lines, [/^(?:thuốc liên quan|related medications?)\s*[:：]/i]);
  const knownMedications = MEDICATION_NAMES.filter((name) => fold(raw).includes(fold(name)));
  const symptoms = parseList(symptomText || (/(?:sốt|ho|đau họng|đau đầu|buồn nôn|tiêu chảy|phát ban)/i.test(raw) ? raw.match(/(?:sốt|ho|đau họng|đau đầu|buồn nôn|tiêu chảy|phát ban)/gi) : []));
  const relatedMedications = [...new Set([...parseList(medicationText), ...knownMedications])];
  return normalizeMedicalEntry({ title, category, symptoms, treatment, relatedMedications, rawContent: raw });
}

export function renderMedicalEntry(entry, { allowDelete = false } = {}) {
  const commitBadge = entry.commitId ? `<span class="medical-sync-badge">Synced #${escapeHtml(entry.commitId)}</span>` : '';
  const recordMeta = `<p class="medical-record-meta"><code>${escapeHtml(entry.inputId || 'Chưa có INPUT ID')}</code>${commitBadge}</p>`;
  const deleteButton = allowDelete ? `<button type="button" class="medical-record-delete" data-medical-delete="${escapeHtml(entry.inputId)}" aria-label="Xoá ${escapeHtml(entry.title)}">🗑️ Xoá</button>` : '';
  return `<article class="medical-result-card">
    <div class="medical-result-card__top"><div><span class="health-badge">${escapeHtml(entry.category)}</span><h2>${escapeHtml(entry.title)}</h2>${recordMeta}</div>${deleteButton}</div>
    ${entry.symptoms.length ? `<div class="medical-result-card__section"><strong>Triệu chứng</strong><div class="medical-chip-list">${entry.symptoms.map((item) => `<span class="medical-chip">${escapeHtml(item)}</span>`).join('')}</div></div>` : ''}
    ${entry.treatment ? `<div class="medical-result-card__section"><strong>Điều trị</strong><p>${escapeHtml(entry.treatment)}</p></div>` : ''}
    ${entry.relatedMedications.length ? `<div class="medical-result-card__section"><strong>Thuốc liên quan</strong><ul>${entry.relatedMedications.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
  </article>`;
}
