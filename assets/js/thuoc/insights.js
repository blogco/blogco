// Offline "AI" insights for the medicine log: KPI tiles and rule-based reminders
// derived from the recorded entries. Deterministic, no network call.

import { computeThuocStats } from './stats.js';
import { escapeHtml } from './store.js';
import { icon as uiIcon } from '../icons.js';

function kpi(icon, label, value, note) {
  return `<div class="thuoc-insight-kpi">
    <span class="thuoc-insight-kpi__icon" aria-hidden="true">${icon}</span>
    <div><span class="thuoc-insight-kpi__label">${escapeHtml(label)}</span><strong class="thuoc-insight-kpi__value">${escapeHtml(value)}</strong>${note ? `<span class="thuoc-muted">${escapeHtml(note)}</span>` : ''}</div>
  </div>`;
}

function buildAlerts(stats) {
  const alerts = [];
  const antibiotic = stats.byCategory.find((category) => category.category === 'antibiotic');
  const pain = stats.byCategory.find((category) => category.category === 'pain');
  const chronic = ['cardio', 'diabetes'].map((key) => stats.byCategory.find((category) => category.category === key)).filter(Boolean);

  if (antibiotic) {
    alerts.push({ tone: 'warning', icon: uiIcon('shield', { size: 18 }), title: 'Kháng sinh cần dùng đủ liều', message: `Bạn đã ghi ${antibiotic.count} lần thuốc kháng sinh. Hãy dùng đủ liều theo chỉ định và không tự ý ngưng giữa chừng.` });
  }
  if (pain && pain.count >= 3) {
    alerts.push({ tone: 'warning', icon: uiIcon('pill', { size: 18 }), title: 'Không lạm dụng thuốc giảm đau', message: `Đã ghi ${pain.count} lần thuốc giảm đau/hạ sốt. Nếu đau kéo dài, nên đi khám thay vì tự dùng thêm.` });
  }
  if (chronic.length) {
    alerts.push({ tone: 'info', icon: uiIcon('heartPulse', { size: 18 }), title: 'Thuốc dùng dài hạn', message: 'Có thuốc tim mạch/huyết áp hoặc tiểu đường — hãy tái khám định kỳ và mang theo sổ thuốc này.' });
  }
  if (stats.facilityCount > 1) {
    alerts.push({ tone: 'info', icon: uiIcon('activity', { size: 18 }), title: `Theo dõi ở ${stats.facilityCount} cơ sở`, message: 'Khi đi khám ở cơ sở mới, nên thông báo các thuốc đang dùng để tránh trùng lặp hoặc tương tác.' });
  }
  if (!alerts.length) {
    alerts.push({ tone: 'good', icon: uiIcon('check', { size: 18 }), title: 'Chưa có cảnh báo đặc biệt', message: 'Tiếp tục ghi lại tên thuốc, công dụng và cơ sở khám để theo dõi tốt hơn.' });
  }
  return alerts;
}

export function renderThuocInsights(entries = []) {
  const stats = computeThuocStats(entries);
  const alerts = buildAlerts(stats);

  const listOf = (items, render) => items.length
    ? `<ul class="thuoc-insight-list">${items.map(render).join('')}</ul>`
    : '<p class="thuoc-muted">Chưa có dữ liệu.</p>';

  const alertMarkup = alerts.map((alert) => `<li class="thuoc-insight-alert is-${alert.tone}">
    <span class="thuoc-insight-alert__icon" aria-hidden="true">${alert.icon}</span>
    <div><strong>${escapeHtml(alert.title)}</strong><br>${escapeHtml(alert.message)}</div>
  </li>`).join('');

  return `<section class="thuoc-card thuoc-insight-card" data-ai-insights aria-label="Phân tích thuốc">
    <div class="thuoc-card-heading">
      <div><p class="thuoc-eyebrow">AI INSIGHTS</p><h2>Phân tích &amp; nhắc nhở</h2></div>
      <button type="button" class="thuoc-secondary-button" data-ai-refresh>${uiIcon('refresh', { size: 16 })} Làm mới</button>
    </div>

    <div class="thuoc-insight-kpis">
      ${kpi(uiIcon('fileText', { size: 18 }), 'Lượt ghi thuốc', String(stats.count), `${stats.medicineCount} loại thuốc`)}
      ${kpi(uiIcon('activity', { size: 18 }), 'Cơ sở khám', String(stats.facilityCount), 'đã từng đi khám')}
      ${kpi(uiIcon('calendar', { size: 18 }), 'Tháng này', String(stats.currentMonthCount), 'lượt ghi trong tháng')}
      ${kpi(uiIcon('barChart', { size: 18 }), 'Trung bình / tháng', String(stats.byMonth.length ? Math.round(stats.count / stats.byMonth.filter((m) => m.key !== '—').length || 1) : 0), 'lượt mỗi tháng có dữ liệu')}
    </div>

    <h3 class="thuoc-insight-card__title thuoc-insight-card__title--sub">${uiIcon('sparkles', { size: 17 })} Nhắc nhở cho bạn</h3>
    <ul class="thuoc-insight-alerts">${alertMarkup}</ul>

    <div class="thuoc-insight-grid">
      <div>
        <h3 class="thuoc-insight-card__title thuoc-insight-card__title--sub">Thuốc ghi nhiều nhất</h3>
        ${listOf(stats.topMedicines, (item) => `<li><span class="thuoc-insight-list__name">${escapeHtml(item.name)}</span><strong>${item.count} lần</strong></li>`)}
      </div>
      <div>
        <h3 class="thuoc-insight-card__title thuoc-insight-card__title--sub">Cơ sở khám</h3>
        ${listOf(stats.byFacility, (item) => `<li><span class="thuoc-insight-list__name">${escapeHtml(item.facility)}</span><strong>${item.count} lần</strong></li>`)}
      </div>
    </div>

    <p class="thuoc-insight-note">${uiIcon('alertTriangle', { size: 16 })} Đây là công cụ ghi chép &amp; nhắc nhở tự động, không thay thế tư vấn của bác sĩ. Luôn hỏi ý kiến chuyên môn trước khi dùng thuốc.</p>
  </section>`;
}
