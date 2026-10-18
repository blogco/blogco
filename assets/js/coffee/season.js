// Season ("Mùa") auto-calculation for coffee expenses.
//
// The season is never entered by hand — it is derived from the transaction
// date. The month ranges follow the conventional four-season split used by the
// existing "Chi phí cà phê" screens:
//   Xuân (Spring): tháng 1–3
//   Hạ   (Summer): tháng 4–6
//   Thu  (Autumn): tháng 7–9
//   Đông (Winter): tháng 10–12

export const SEASONS = [
  { key: 'spring', label: 'Xuân', emoji: '🌸', months: [1, 2, 3] },
  { key: 'summer', label: 'Hạ', emoji: '☀️', months: [4, 5, 6] },
  { key: 'autumn', label: 'Thu', emoji: '🍂', months: [7, 8, 9] },
  { key: 'winter', label: 'Đông', emoji: '❄️', months: [10, 11, 12] },
];

export const SEASON_LABELS = Object.fromEntries(SEASONS.map((season) => [season.key, season.label]));

export function seasonIcon(key, size = 16) {
  const source = SEASONS.find((season) => season.key === key);
  return source ? `<svg class="ui-icon ui-icon--season" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v18M5 7l14 10M19 7 5 17"/></svg>` : '';
}

// Returns the season descriptor ({ key, label, emoji, months }) for a
// `YYYY-MM-DD` date key, or null when the date is missing/invalid.
export function seasonOf(dateKey) {
  const month = Number(String(dateKey || '').slice(5, 7));
  if (!month) return null;
  return SEASONS.find((season) => season.months.includes(month)) || null;
}

export function seasonLabel(dateKey) {
  const season = seasonOf(dateKey);
  return season ? season.label : '—';
}

export function seasonKey(dateKey) {
  const season = seasonOf(dateKey);
  return season ? season.key : '';
}
