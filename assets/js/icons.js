const ICON_PATHS = {
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  alertTriangle: '<path d="m10.3 3.5-8 14a1.8 1.8 0 0 0 1.6 2.7h16.2a1.8 1.8 0 0 0 1.6-2.7l-8-14a1.8 1.8 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7M5 12h14"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  barChart: '<path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16V5"/>',
  bookOpen: '<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v17H4.5A2.5 2.5 0 0 0 2 22Z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v17h6.5a2.5 2.5 0 0 1 2.5 2Z"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  circleInfo: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  heartPulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/><path d="M20.8 8.3A5.4 5.4 0 0 0 12 5.7a5.4 5.4 0 0 0-8.8 2.6C1.6 13.2 6.2 17 12 21c5.8-4 10.4-7.8 8.8-12.7Z"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-6h6v6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  package: '<path d="m16.5 9.4-9-5.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  pill: '<path d="m10.5 20.5 9-9a4.95 4.95 0 0 0-7-7l-9 9a4.95 4.95 0 0 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  pin: '<path d="M12 17v5M5 3h14l-2 7 2 3H5l2-3Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 4-2V2l-4 2-3-2-3 2-3-2Z"/><path d="M8 9h8M8 13h6"/>',
  refresh: '<path d="M20 11a8.1 8.1 0 0 0-14.7-3L3 11M3 5v6h6M4 13a8.1 8.1 0 0 0 14.7 3L21 13M21 19v-6h-6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  sparkles: '<path d="m12 3-1.2 4.1a4 4 0 0 1-2.7 2.7L4 11l4.1 1.2a4 4 0 0 1 2.7 2.7L12 19l1.2-4.1a4 4 0 0 1 2.7-2.7L20 11l-4.1-1.2a4 4 0 0 1-2.7-2.7Z"/><path d="m19 16-.5 1.5L17 18l1.5.5L19 20l.5-1.5L21 18l-1.5-.5Z"/>',
  stethoscope: '<path d="M6 3v5a4 4 0 0 0 8 0V3M4 3h4M12 3h4M6 12v1a6 6 0 0 0 12 0v-1"/><circle cx="18" cy="8" r="3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
  upload: '<path d="M12 3v12M7 8l5-5 5 5M5 21h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 8h18M16 14h.01"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
};

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

// Shared inline SVG icon renderer for the Hugo/vanilla-JS runtime.
export function icon(name, { size = 18, strokeWidth = 1.75, title = '' } = {}) {
  const key = ICON_PATHS[name] ? name : 'sparkles';
  const label = title
    ? ` role="img" aria-label="${escapeAttribute(title)}"`
    : ' aria-hidden="true"';
  return `<svg class="ui-icon ui-icon--${key}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" focusable="false"${label}>${ICON_PATHS[key]}</svg>`;
}
export default icon;

