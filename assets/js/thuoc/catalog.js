// Medicine catalogue helpers: accent-insensitive normalisation, drug-group
// classification (from the name and the "công dụng" text) and label/emoji maps.
// Pure functions — no DOM, so they are cheap to unit-test.

import { icon } from '../icons.js';

export const MED_CATEGORY_LABELS = {
  pain: 'Giảm đau / Hạ sốt',
  antibiotic: 'Kháng sinh',
  antiinflam: 'Kháng viêm',
  gastric: 'Dạ dày / Tiêu hoá',
  cardio: 'Tim mạch / Huyết áp',
  diabetes: 'Tiểu đường',
  allergy: 'Dị ứng',
  respiratory: 'Hô hấp',
  neuro: 'Thần kinh / An thần',
  vitamin: 'Vitamin / Bổ sung',
  other: 'Khác',
};

export const MED_CATEGORY_EMOJI = {
  pain: '💊',
  antibiotic: '🦠',
  antiinflam: '🔥',
  gastric: '🫃',
  cardio: '❤️',
  diabetes: '🩸',
  allergy: '🤧',
  respiratory: '🫁',
  neuro: '🧠',
  vitamin: '🍊',
  other: '📦',
};

export const CATEGORY_ORDER = [
  'pain', 'antibiotic', 'antiinflam', 'gastric', 'cardio',
  'diabetes', 'allergy', 'respiratory', 'neuro', 'vitamin', 'other',
];

const KEYWORDS = {
  pain: ['paracetamol', 'acetaminophen', 'efferalgan', 'panadol', 'hapacol', 'tatanol', 'decolgen', 'ibuprofen', 'diclofenac', 'meloxicam', 'celecoxib', 'aspirin', 'analgin', 'giảm đau', 'hạ sốt', 'nhức', 'đau đầu', 'đau bụng'],
  antibiotic: ['amoxicillin', 'amoxicilin', 'augmentin', 'azithromycin', 'cefixim', 'cefuroxim', 'cephalexin', 'ciprofloxacin', 'levofloxacin', 'clindamycin', 'doxycyclin', 'metronidazol', 'kháng sinh', 'nhiễm khuẩn', 'vi khuẩn'],
  antiinflam: ['prednisolon', 'prednisone', 'dexamethason', 'methylprednisolon', 'corticoid', 'kháng viêm', 'viêm', 'sưng'],
  gastric: ['omeprazol', 'esomeprazol', 'pantoprazol', 'lansoprazol', 'ranitidin', 'gaviscon', 'phosphalugel', 'dạ dày', 'trào ngược', 'ợ nóng', 'tiêu hoá', 'đại tràng', 'tiêu chảy', 'táo bón'],
  cardio: ['amlodipin', 'losartan', 'valsartan', 'telmisartan', 'enalapril', 'lisinopril', 'bisoprolol', 'metoprolol', 'atorvastatin', 'rosuvastatin', 'simvastatin', 'huyết áp', 'tim mạch', 'mỡ máu', 'cholesterol', 'nhịp tim'],
  diabetes: ['metformin', 'gliclazid', 'glimepirid', 'empagliflozin', 'insulin', 'tiểu đường', 'đái tháo đường', 'đường huyết'],
  allergy: ['loratadin', 'cetirizin', 'fexofenadin', 'chlorpheniramin', 'diphenhydramin', 'dị ứng', 'mề đay', 'ngứa', 'sổ mũi', 'viêm mũi'],
  respiratory: ['salbutamol', 'budesonid', 'montelukast', 'ambroxol', 'bromhexin', 'acetylcystein', 'ho', 'hen', 'suyễn', 'viêm họng', 'long đờm', 'khò khè'],
  neuro: ['diazepam', 'alprazolam', 'zolpidem', 'gabapentin', 'pregabalin', 'sertralin', 'fluoxetin', 'mất ngủ', 'lo âu', 'trầm cảm', 'thần kinh', 'đau thần kinh', 'chóng mặt'],
  vitamin: ['vitamin', 'multivitamin', 'sắt', 'ferrous', 'calci', 'canxi', 'kẽm', 'zinc', 'magnesi', 'bổ sung', 'omega', 'dha', 'd3', 'b12'],
};

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

export function classifyMedicine(name = '', usage = '') {
  const haystack = `${normalizeText(name)} ${normalizeText(usage)}`;
  if (!haystack.trim()) return 'other';
  return CATEGORY_ORDER.find((key) => (KEYWORDS[key] || []).some((keyword) => haystack.includes(normalizeText(keyword))))
    || 'other';
}

export function categoryLabel(key) {
  return MED_CATEGORY_LABELS[key] || MED_CATEGORY_LABELS.other;
}

export function categoryEmoji(key) {
  return MED_CATEGORY_EMOJI[key] || MED_CATEGORY_EMOJI.other;
}

const MED_CATEGORY_ICON_KEYS = {
  pain: 'pill', antibiotic: 'shield', antiinflam: 'activity', gastric: 'activity', cardio: 'heartPulse',
  diabetes: 'activity', allergy: 'activity', respiratory: 'activity', neuro: 'activity', vitamin: 'sparkles', other: 'package',
};

export function categoryIcon(key, size = 16) {
  return icon(MED_CATEGORY_ICON_KEYS[key] || 'package', { size });
}

export function categoryMeta(key) {
  return { key, label: categoryLabel(key), emoji: categoryEmoji(key) };
}
