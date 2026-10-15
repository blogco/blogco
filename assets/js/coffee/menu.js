// Menu classification for Highlands Coffee receipts.
//
// Receipts rarely carry a machine-readable category, so we bucket each line by
// keyword. Matching is done on an accent-stripped copy of the name so "Trà Sữa"
// and "tra sua" resolve the same way. This never invents prices — it only labels
// a name the user (or OCR) already provided.

export const CATEGORY_LABELS = {
  coffee: 'Cà phê',
  tea: 'Trà',
  freeze: 'Đá xay / Sinh tố',
  bakery: 'Bánh & đồ ăn',
  other: 'Khác',
};

export const CATEGORY_ORDER = ['coffee', 'tea', 'freeze', 'bakery', 'other'];

// Ordered so more specific drinks win over generic words (e.g. "Freeze Trà
// Xanh" is a blend, not a plain tea).
const RULES = [
  [/freeze|freezy|da xay|sinh to|smoothie|blend|frappe|ice blended|iceblend/, 'freeze'],
  [/tra\b|tra\s|oolong|o long|sen vang|thach|matcha|hong tra|peach|tea\b|tra sua|tra xanh|tra den|tra dao|tra sen/, 'tea'],
  [/phin|ca phe|cafe|coffee|espresso|expresso|americano|latte|cappuccino|mocha|macchiato|bac xiu|bac siu|den da|cold brew|robusta|arabica|sua da|caramel/, 'coffee'],
  [/banh|croissant|muffin|cookie|sandwich|banh mi|brownie|tiramisu|cake|wrap|baguette|\bpie\b|flan|panna/, 'bakery'],
];

// Lowercase + strip Vietnamese diacritics so both accents and plain ASCII match.
export function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyItem(name = '') {
  const text = normalizeName(name);
  if (!text) return 'other';
  for (const [pattern, category] of RULES) {
    if (pattern.test(text)) return category;
  }
  return 'other';
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || CATEGORY_LABELS.other;
}
