// Reusable, dependency-free chart primitives for the "Chi phí cà phê" dashboard.
//
// Every builder is a PURE function that returns an HTML/SVG string (no DOM), so
// the layouts can be unit-tested in Node and dropped straight into innerHTML.
//
// Design system palette (Samsung corporate blue / neutral), matching coffee.css.

import { escapeHtml } from './store.js';

export const PALETTE = Object.freeze({
  primary: '#1428A0',
  primaryAlt: '#2E4BD6',
  primaryDark: '#0E1E78',
  mint: '#7C93E8',
  mintSoft: '#D5DBF0',
  gray: '#C4CBD8',
  grayText: '#5B6675',
  bg: '#F4F6F9',
  border: '#DDE2EA',
  ink: '#0B1524',
  warning: '#B26A00',
  warningSoft: '#F2D6A6',
  danger: '#C81E1E',
  success: '#127A4B',
  info: '#2E4BD6',
});

// Ordered palette for categorical series (brands, categories…). Blue-forward with
// enough contrast between neighbouring slices/segments.
export const SERIES_COLORS = [
  '#1428A0', '#2E4BD6', '#5C78E6', '#7C93E8', '#0E1E78',
  '#8FA0DA', '#B26A00', '#127A4B', '#8A94A6', '#A9B6DA',
];

export function colorAt(index) {
  return SERIES_COLORS[((index % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length];
}

// Short Vietnamese money label: 1 250 000 → "1,25 tr", 320 000 → "320k".
export function formatShort(value) {
  const n = Math.round(Number(value) || 0);
  const abs = Math.abs(n);
  const pretty = (v, unit) => `${v.toFixed(1).replace(/\.0$/, '').replace('.', ',')} ${unit}`;
  if (abs >= 1e9) return pretty(n / 1e9, 'tỷ');
  if (abs >= 1e6) return pretty(n / 1e6, 'tr');
  if (abs >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const EMPTY = '<p class="coffee-chart-empty">Chưa có dữ liệu.</p>';

// ---------------------------------------------------------------------------
// Stacked column chart (e.g. cost per season, split by brand)
// ---------------------------------------------------------------------------
// columns: [{ label, total, segments: [{ name, value, color }] }]
export function stackedColumnChart(columns = [], {
  height = 300,
  ariaLabel = 'Biểu đồ cột chi phí, phân tách theo thương hiệu',
  valueFormatter = formatShort,
} = {}) {
  const list = (columns || []).filter(Boolean);
  if (!list.length) return EMPTY;

  const padX = 46;
  const top = 40;
  const baseline = height - 42;
  const step = 92;
  const width = padX * 2 + Math.max(list.length, 1) * step;
  const barW = Math.min(58, step * 0.6);
  const maxTotal = Math.max(1, ...list.map((col) => col.total ?? (col.segments || []).reduce((sum, seg) => sum + seg.value, 0)));
  const scale = (baseline - top) / maxTotal;

  let body = '';
  list.forEach((col, index) => {
    const cx = padX + step * index + step / 2;
    const x = cx - barW / 2;
    let y = baseline;
    const segments = col.segments || [];
    segments.forEach((seg) => {
      const segHeight = Math.max(0, (Number(seg.value) || 0) * scale);
      if (segHeight <= 0.5) return;
      y -= segHeight;
      body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${segHeight.toFixed(1)}" rx="4" fill="${seg.color || PALETTE.primary}"><title>${escapeHtml(`${seg.name}: ${formatVndShort(seg.value)}`)}</title></rect>`;
      if (segHeight >= 18) {
        body += `<text x="${cx.toFixed(1)}" y="${(y + segHeight / 2 + 4).toFixed(1)}" text-anchor="middle" class="cc-seg-label">${escapeHtml(valueFormatter(seg.value))}</text>`;
      }
    });
    const total = col.total ?? segments.reduce((sum, seg) => sum + seg.value, 0);
    body += `<text x="${cx.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" class="cc-total-label">${escapeHtml(valueFormatter(total))}</text>`;
    body += `<text x="${cx.toFixed(1)}" y="${baseline + 24}" text-anchor="middle" class="cc-axis-label">${escapeHtml(col.label)}</text>`;
    if (col.sublabel) {
      body += `<text x="${cx.toFixed(1)}" y="${baseline + 40}" text-anchor="middle" class="cc-axis-sub">${escapeHtml(col.sublabel)}</text>`;
    }
  });

  const axis = `<line x1="${padX - 10}" y1="${baseline}" x2="${width - padX + 10}" y2="${baseline}" class="cc-axis-line" />`;
  return `<svg class="coffee-chart coffee-chart--stacked" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">${axis}${body}</svg>`;
}

function formatVndShort(value) {
  return `${formatShort(value)} đ`.replace(' đ đ', ' đ');
}

// ---------------------------------------------------------------------------
// Donut / ring chart (brand profile, drinks profile)
// ---------------------------------------------------------------------------
// segments: [{ name, value, color, label? }]
export function donutChart(segments = [], {
  size = 240,
  thickness = 30,
  centerValue = '',
  centerLabel = '',
  ariaLabel = 'Biểu đồ tròn tỷ trọng',
  percent = true,
} = {}) {
  const list = (segments || []).filter((seg) => Number(seg.value) > 0);
  const total = list.reduce((sum, seg) => sum + Number(seg.value), 0);
  if (!total) return EMPTY;

  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  let arcs = '';
  list.forEach((seg) => {
    const value = Number(seg.value);
    const fraction = value / total;
    const length = fraction * circumference;
    const gap = list.length > 1 ? 2 : 0;
    const dash = Math.max(0.5, length - gap);
    const display = seg.label || (percent ? `${Math.round(fraction * 100)}%` : formatShort(value));
    arcs += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${seg.color || PALETTE.primary}" stroke-width="${thickness}" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${escapeHtml(`${seg.name}: ${display}`)}</title></circle>`;
    offset += length;
  });

  const valueText = centerValue
    ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="cc-donut-value">${escapeHtml(centerValue)}</text>`
    : '';
  const labelText = centerLabel
    ? `<text x="${cx}" y="${cy + 20}" text-anchor="middle" class="cc-donut-label">${escapeHtml(centerLabel)}</text>`
    : '';

  return `<svg class="coffee-chart coffee-chart--donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(ariaLabel)}">${arcs}${valueText}${labelText}</svg>`;
}

// ---------------------------------------------------------------------------
// Vertical bar chart (average cost per period, visits per month)
// ---------------------------------------------------------------------------
// bars: [{ label, value, color?, caption? }]
export function barChart(bars = [], {
  height = 240,
  ariaLabel = 'Biểu đồ cột',
  valueFormatter = formatShort,
} = {}) {
  const list = (bars || []).filter(Boolean);
  if (!list.length) return EMPTY;

  const padX = 42;
  const top = 34;
  const baseline = height - 38;
  const step = 78;
  const width = padX * 2 + Math.max(list.length, 1) * step;
  const barW = Math.min(46, step * 0.55);
  const max = Math.max(1, ...list.map((bar) => Number(bar.value) || 0));
  const scale = (baseline - top) / max;

  let body = '';
  list.forEach((bar, index) => {
    const value = Number(bar.value) || 0;
    const cx = padX + step * index + step / 2;
    const barHeight = Math.max(2, value * scale);
    const y = baseline - barHeight;
    body += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="5" fill="${bar.color || PALETTE.primaryAlt}"><title>${escapeHtml(`${bar.label}: ${valueFormatter(value)}`)}</title></rect>`;
    body += `<text x="${cx.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" class="cc-bar-value">${escapeHtml(bar.caption ?? valueFormatter(value))}</text>`;
    body += `<text x="${cx.toFixed(1)}" y="${baseline + 22}" text-anchor="middle" class="cc-axis-label">${escapeHtml(bar.label)}</text>`;
  });
  const axis = `<line x1="${padX - 10}" y1="${baseline}" x2="${width - padX + 10}" y2="${baseline}" class="cc-axis-line" />`;
  return `<svg class="coffee-chart coffee-chart--bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">${axis}${body}</svg>`;
}

// ---------------------------------------------------------------------------
// Horizontal progress meter (sugar / caffeine intake vs. recommendation)
// ---------------------------------------------------------------------------
// tone: 'primary' | 'warning' | 'danger' | 'success'
export function progressMeter({
  label,
  value = 0,
  max = 1,
  valueText = '',
  tone = 'primary',
  hint = '',
} = {}, escapeValueText = true) {
  const safeMax = Number(max) > 0 ? Number(max) : 1;
  const pct = clamp(Math.round((Number(value) / safeMax) * 100), 0, 100);
  const shown = valueText || `${value}/${safeMax}`;
  return `<div class="coffee-meter is-${tone}">
    <div class="coffee-meter__head">
      <span class="coffee-meter__label">${escapeHtml(label)}</span>
      <strong class="coffee-meter__value">${escapeValueText ? escapeHtml(shown) : shown}</strong>
    </div>
    <div class="coffee-meter__track" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
    ${hint ? `<p class="coffee-meter__hint">${escapeHtml(hint)}</p>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// Horizontal bar chart (top items & frequency)
// ---------------------------------------------------------------------------
// items: [{ label, value, color?, caption? }]
export function horizontalBarChart(items = [], {
  ariaLabel = 'Biểu đồ cột ngang',
  valueFormatter = (value) => String(value),
  max = 0,
  barColor = PALETTE.primary,
} = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return EMPTY;
  const top = max || Math.max(1, ...list.map((item) => Number(item.value) || 0));
  return `<div class="coffee-hbar" role="img" aria-label="${escapeHtml(ariaLabel)}">${list.map((item) => {
    const value = Number(item.value) || 0;
    const pct = Math.max(3, Math.round((value / top) * 100));
    const fill = item.color || barColor;
    return `<div class="coffee-hbar__row">
      <span class="coffee-hbar__label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
      <span class="coffee-hbar__track"><span class="coffee-hbar__fill" style="width:${pct}%;background:${fill}"></span></span>
      <strong class="coffee-hbar__value">${escapeHtml(item.caption ?? valueFormatter(value))}</strong>
    </div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------
// items: [{ name, value, color }]
export function legend(items = [], { valueFormatter = formatShort, percentOf = 0 } = {}) {
  if (!items.length) return '';
  return `<ul class="coffee-chart-legend">${items.map((item) => {
    const share = percentOf > 0 ? ` · ${Math.round((Number(item.value) / percentOf) * 100)}%` : '';
    return `<li><span class="coffee-chart-legend__dot" style="background:${item.color || PALETTE.primary}"></span><span class="coffee-chart-legend__name">${escapeHtml(item.name)}</span><strong>${escapeHtml(valueFormatter(item.value))}${share}</strong></li>`;
  }).join('')}</ul>`;
}
