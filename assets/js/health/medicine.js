// Medicine list helpers: markup for dynamic rows, reading rows back from the
// DOM, and a lightweight drug-interaction warning table (best effort, not a
// clinical tool).

import { normalizeText } from './icd.js';

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

let medicineRowSeed = 0;

export function renderMedicineRow(medicine = {}, index = 0) {
  medicineRowSeed += 1;
  const rowId = `med-${medicineRowSeed}`;
  const label = `Thuốc #${index + 1}`;
  return `<div class="health-medicine" data-medicine-row>
    <div class="health-medicine__head">
      <strong data-medicine-label>${escapeHtml(label)}</strong>
      <button type="button" class="health-icon-button" data-remove-medicine aria-label="Xoá ${escapeHtml(label)}">✕ Xoá</button>
    </div>
    <div class="health-form-grid health-form-grid--medicine">
      <label class="health-field">Tên thuốc <span aria-hidden="true">*</span>
        <input name="medName" type="text" maxlength="160" value="${escapeHtml(medicine.name)}" placeholder="Paracetamol 500mg" list="health-medicine-suggest" aria-label="${escapeHtml(label)} — tên thuốc">
      </label>
      <label class="health-field">Liều dùng
        <input name="medDosage" type="text" maxlength="160" value="${escapeHtml(medicine.dosage)}" placeholder="1 viên × 3 lần/ngày">
      </label>
      <label class="health-field">Số ngày
        <input name="medDuration" type="number" min="0" max="3650" step="1" value="${medicine.duration === null || medicine.duration === undefined ? '' : escapeHtml(medicine.duration)}" placeholder="5">
      </label>
      <label class="health-field">Công dụng
        <input name="medUsage" type="text" maxlength="400" value="${escapeHtml(medicine.usage)}" placeholder="Giảm đau, hạ sốt">
      </label>
      <label class="health-field health-field--full">Ghi chú
        <input name="medNotes" type="text" maxlength="400" value="${escapeHtml(medicine.notes)}" placeholder="Uống sau ăn">
      </label>
    </div>
  </div>`;
}

export function emptyMedicineHtml() {
  return renderMedicineRow({}, 0);
}

export function readMedicines(form) {
  return [...form.querySelectorAll('[data-medicine-row]')].map((row) => ({
    name: row.querySelector('[name="medName"]')?.value || '',
    dosage: row.querySelector('[name="medDosage"]')?.value || '',
    duration: row.querySelector('[name="medDuration"]')?.value ?? '',
    usage: row.querySelector('[name="medUsage"]')?.value || '',
    notes: row.querySelector('[name="medNotes"]')?.value || '',
  })).filter((med) => med.name.trim() || med.dosage.trim() || med.usage.trim() || med.notes.trim());
}

export function renumberMedicineRows(form) {
  form.querySelectorAll('[data-medicine-row]').forEach((row, index) => {
    const label = row.querySelector('[data-medicine-label]');
    if (label) label.textContent = `Thuốc #${index + 1}`;
  });
}

// Keyword groups. Each entry maps a group to a matcher over the normalised drug
// name. Matching is substring based, so it catches common brand + generic forms
// ("Amlor" still contains no "amlodipine" — kept conservative on purpose).
const GROUPS = {
  nsaid: ['ibuprofen', 'diclofenac', 'naproxen', 'meloxicam', 'celecoxib', 'piroxicam', 'indomethacin', 'aspirin', 'salicyl', 'ketoprofen', 'etoricoxib', 'nimesulide'],
  anticoagulant: ['warfarin', 'rivaroxaban', 'apixaban', 'dabigatran', 'edoxaban', 'acenocoumarol'],
  antiplatelet: ['clopidogrel', 'ticagrelor', 'prasugrel', 'dipyridamole'],
  corticosteroid: ['prednisolon', 'prednisone', 'dexamethason', 'methylprednisolon', 'betamethason', 'hydrocortison'],
  ssri: ['fluoxetin', 'sertralin', 'paroxetin', 'citalopram', 'escitalopram', 'fluvoxamin'],
  tramadol: ['tramadol'],
  macrolide: ['clarithromycin', 'erythromycin', 'azithromycin', 'roxithromycin'],
  statin: ['simvastatin', 'atorvastatin', 'rosuvastatin', 'lovastatin', 'pravastatin'],
  nitrate: ['nitroglycerin', 'nitrat', 'isosorbid', 'glyceryl trinitrat'],
  pde5: ['sildenafil', 'tadalafil', 'vardenafil'],
  acei_arb: ['enalapril', 'lisinopril', 'ramipril', 'perindopril', 'captopril', 'losartan', 'valsartan', 'telmisartan', 'candesartan', 'irbesartan'],
  potassium_sparing: ['spironolacton', 'eplerenon', 'amilorid', 'triamteren'],
  metformin: ['metformin'],
  paracetamol: ['paracetamol', 'acetaminophen'],
  quinolone: ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'ofloxacin', 'norfloxacin'],
  antacid_mineral: ['antacid', 'nhom hydroxid', 'magnesi hydroxid', 'calci carbonat', 'sắt', 'sulfat sắt', 'ferrous', 'kẽm', 'zinc'],
  beta_blocker: ['bisoprolol', 'metoprolol', 'atenolol', 'propranolol', 'carvedilol', 'nebivolol'],
  biguanide_contrast: ['iod', 'contrast'],
};

const RULES = [
  { a: 'nsaid', b: 'anticoagulant', message: 'NSAID + thuốc chống đông: tăng nguy cơ chảy máu tiêu hoá — hỏi bác sĩ trước khi dùng chung.' },
  { a: 'nsaid', b: 'antiplatelet', message: 'NSAID + thuốc kháng kết tập tiểu cầu: tăng nguy cơ chảy máu — cần cân nhắc.' },
  { a: 'nsaid', b: 'nsaid', message: 'Hai loại NSAID dùng chung: tăng nguy cơ loét/chảy máu dạ dày — thường không nên phối hợp.' },
  { a: 'nsaid', b: 'corticosteroid', message: 'NSAID + corticoid: tăng nguy cơ viêm loét dạ dày — nên dùng cùng bảo vệ dạ dày.' },
  { a: 'ssri', b: 'tramadol', message: 'SSRI + tramadol: nguy cơ hội chứng serotonin — theo dõi và hỏi bác sĩ.' },
  { a: 'ssri', b: 'nsaid', message: 'SSRI + NSAID: tăng nhẹ nguy cơ chảy máu tiêu hoá.' },
  { a: 'statin', b: 'macrolide', message: 'Statin + kháng sinh macrolid: tăng nguy cơ đau cơ/tiêu cơ — có thể cần đổi thuốc.' },
  { a: 'nitrate', b: 'pde5', message: 'Nitrat + sildenafil/tadalafil: tụt huyết áp nguy hiểm — CHỐNG CHỈ ĐỊNH dùng chung.' },
  { a: 'acei_arb', b: 'potassium_sparing', message: 'Ức chế men chuyển/ARB + lợi tiểu giữ kali: nguy cơ tăng kali máu — cần theo dõi.' },
  { a: 'quinolone', b: 'antacid_mineral', message: 'Quinolon + thuốc có kim loại (nhôm/magnes/calci/sắt/kẽm): giảm hấp thu kháng sinh — uống cách xa nhau.' },
  { a: 'metformin', b: 'biguanide_contrast', message: 'Metformin + thuốc cản quang chứa iod: nguy cơ toan lactic — cần tạm ngưng theo hướng dẫn.' },
  { a: 'warfarin', b: 'paracetamol', message: 'Warfarin + paracetamol liều cao kéo dài: có thể tăng tác dụng chống đông — theo dõi INR.' },
];

function groupsFor(name) {
  const normalized = normalizeText(name);
  return Object.entries(GROUPS)
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([group]) => group);
}

export function checkInteractions(medicines = []) {
  const named = medicines
    .map((med) => ({ name: (med.name || '').trim(), groups: groupsFor(med.name || '') }))
    .filter((med) => med.name);
  const warnings = [];
  for (let i = 0; i < named.length; i += 1) {
    for (let j = i + 1; j < named.length; j += 1) {
      const left = named[i];
      const right = named[j];
      RULES.forEach((rule) => {
        const forward = left.groups.includes(rule.a) && right.groups.includes(rule.b);
        const backward = left.groups.includes(rule.b) && right.groups.includes(rule.a);
        if (forward || backward) {
          warnings.push({ pair: `${left.name} · ${right.name}`, message: rule.message });
        }
      });
    }
  }
  // Dedupe by pair+message text.
  const seen = new Set();
  return warnings.filter((warning) => {
    const key = `${warning.pair}|${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
