const STORAGE_KEY = 'blogco.water.v1';
const BACKUP_KEY = 'blogco.water.backup.v1';
const DEFAULT_PROFILE = {
  goalMl: 2000,
  useFormula: false,
  sex: '',
  weightKg: '',
  activityMinutes: 0,
  hotWeather: false,
  pregnancyOrBreastfeeding: false,
};

let memoryCache;

function blankState() {
  return { version: 1, nextId: 1, entries: [], profile: { ...DEFAULT_PROFILE } };
}

function readState() {
  if (memoryCache) return structuredClone(memoryCache);
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    memoryCache = parsed && parsed.version === 1
      ? { ...blankState(), ...parsed, profile: { ...DEFAULT_PROFILE, ...parsed.profile } }
      : blankState();
  } catch {
    memoryCache = blankState();
  }
  return structuredClone(memoryCache);
}

function writeState(state) {
  const serialized = JSON.stringify(state);
  try {
    localStorage.setItem(BACKUP_KEY, serialized);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    throw new Error('Không thể lưu dữ liệu trên thiết bị này. Hãy tải bản sao lưu trước khi tiếp tục.');
  }
  memoryCache = structuredClone(state);
  window.dispatchEvent(new CustomEvent('water:data-changed'));
}

export function getWaterState() {
  return readState();
}

export function getNextEntryId() {
  return `WTR-${String(readState().nextId).padStart(3, '0')}`;
}

export function addWaterEntry(input) {
  const state = readState();
  const amountMl = Number(input.amountMl);
  if (!Number.isFinite(amountMl) || amountMl < 25 || amountMl > 5000) {
    throw new Error('Lượng ghi nhận phải từ 25 đến 5.000 ml.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) {
    throw new Error('Vui lòng kiểm tra ngày và giờ.');
  }
  const id = `WTR-${String(state.nextId).padStart(3, '0')}`;
  state.entries.push({
    id,
    date: input.date,
    time: input.time,
    amountMl,
    drinkType: String(input.drinkType || 'water').slice(0, 32),
    customDrink: String(input.customDrink || '').trim().slice(0, 60),
    note: String(input.note || '').trim().slice(0, 300),
    createdAt: new Date().toISOString(),
  });
  state.nextId += 1;
  writeState(state);
  return { ...state.entries[state.entries.length - 1] };
}

export function removeWaterEntry(id) {
  const state = readState();
  const before = state.entries.length;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  if (state.entries.length === before) return false;
  writeState(state);
  return true;
}

export function saveWaterProfile(input) {
  const state = readState();
  const goalMl = Number(input.goalMl);
  const weightKg = input.weightKg === '' ? '' : Number(input.weightKg);
  if (!Number.isFinite(goalMl) || goalMl < 250 || goalMl > 10000) {
    throw new Error('Mục tiêu tuỳ chỉnh phải từ 250 đến 10.000 ml.');
  }
  if (weightKg !== '' && (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300)) {
    throw new Error('Cân nặng cần nằm trong khoảng 20–300 kg.');
  }
  state.profile = {
    goalMl,
    useFormula: Boolean(input.useFormula),
    sex: ['male', 'female'].includes(input.sex) ? input.sex : '',
    weightKg,
    activityMinutes: Math.max(0, Math.min(600, Number(input.activityMinutes) || 0)),
    hotWeather: Boolean(input.hotWeather),
    pregnancyOrBreastfeeding: Boolean(input.pregnancyOrBreastfeeding),
  };
  writeState(state);
  return state.profile;
}

export function downloadJsonBackup() {
  const blob = new Blob([JSON.stringify(readState(), null, 2)], { type: 'application/json' });
  downloadBlob(blob, `blogco-water-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export function downloadCsv(entries) {
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [
    ['ID', 'Ngày', 'Giờ', 'Lượng (ml)', 'Loại đồ uống', 'Ghi chú'],
    ...entries.map((item) => [item.id, item.date, item.time, item.amountMl, item.customDrink || item.drinkType, item.note]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'blogco-water-logs.csv');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) memoryCache = undefined;
});
