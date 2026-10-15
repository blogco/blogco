// Simple bar dashboard for the medicine log: breakdown by month and by drug
// group, built from the pure stats module. No chart library.

import { computeThuocStats } from './stats.js';
import { escapeHtml } from './store.js';

function meter(label, count, max) {
  const width = max ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return `<li class="thuoc-meter">
    <span class="thuoc-insight-list__name">${label}</span>
    <span class="thuoc-budget-bar"><span style="width:${width}%"></span></span>
    <strong>${count}</strong>
  </li>`;
}

export function renderThuocDashboard(entries = []) {
  const stats = computeThuocStats(entries);
  if (!stats.count) return '';

  const maxMonth = stats.maxMonthCount || 1;
  const maxCategory = stats.byCategory.reduce((max, category) => Math.max(max, category.count), 0) || 1;

  const monthBars = stats.byMonth
    .filter((month) => month.key !== '—')
    .slice(0, 8)
    .map((month) => meter(escapeHtml(month.label), month.count, maxMonth))
    .join('');

  const categoryBars = stats.byCategory
    .map((category) => meter(`${category.emoji} ${escapeHtml(category.label)}`, category.count, maxCategory))
    .join('');

  return `<section class="thuoc-card thuoc-insight-card" aria-label="Bảng tổng quan thuốc">
    <div class="thuoc-card-heading">
      <div><p class="thuoc-eyebrow">TỔNG QUAN</p><h2>Theo tháng &amp; nhóm thuốc</h2></div>
    </div>
    <div class="thuoc-insight-grid">
      <div>
        <h3 class="thuoc-insight-card__title thuoc-insight-card__title--sub">📅 Theo tháng</h3>
        ${monthBars ? `<ul class="thuoc-insight-list">${monthBars}</ul>` : '<p class="thuoc-muted">Chưa có dữ liệu.</p>'}
      </div>
      <div>
        <h3 class="thuoc-insight-card__title thuoc-insight-card__title--sub">💊 Theo nhóm thuốc</h3>
        ${categoryBars ? `<ul class="thuoc-insight-list">${categoryBars}</ul>` : '<p class="thuoc-muted">Chưa có dữ liệu.</p>'}
      </div>
    </div>
  </section>`;
}
