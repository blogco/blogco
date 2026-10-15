// Dashboard aggregation + render for the "Chi phí cà phê" statistics page.
//
// computeDashboard() turns the raw receipts into the datasets the charts need:
//   • seasons     — stacked column (cost per season, split by brand)
//   • brandProfile— donut (share of spend per chain)
//   • drinkProfile— ring (sugary / caffeinated vs. light & healthy)
//   • avgCost     — vertical bars (average cost per receipt, per quarter)
//   • frequency   — vertical bars + KPI (visits per month, avg days between visits)
//
// renderDashboard() only builds an HTML string (no DOM) so it is unit-testable.

import { escapeHtml, formatVnd, toNumber } from './store.js';
import { CATEGORY_LABELS, classifyItem } from './menu.js';
import { SEASONS } from './season.js';
import { classifyHealth } from './insights.js';
import {
  PALETTE, colorAt, formatShort, stackedColumnChart, donutChart, barChart, legend,
} from './charts.js';

function dayNumber(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateKey || ''));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
}

function quarterOf(dateKey) {
  const match = /^(\d{4})-(\d{2})/.exec(String(dateKey || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Math.ceil(Number(match[2]) / 3);
  return { key: `${year}-Q${quarter}`, year, quarter, label: `Q${quarter}/${year}` };
}

// Brand → color map shared by the stacked chart and the donut, so a brand keeps
// the same colour everywhere. Brands beyond `keep` are folded into "Khác".
function rankedBrands(receipts, keep = 5) {
  const totals = new Map();
  receipts.forEach((receipt) => {
    const name = String(receipt?.store || '').trim() || 'Không rõ';
    totals.set(name, (totals.get(name) || 0) + toNumber(receipt?.total));
  });
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const shown = ranked.slice(0, keep);
  const colorMap = new Map();
  shown.forEach((name, index) => colorMap.set(name, colorAt(index)));
  colorMap.set('Khác', PALETTE.gray);
  const groupOf = (name) => (shown.includes(name) ? name : 'Khác');
  return { ranked, shown, colorMap, groupOf };
}

export function computeDashboard(receipts = [], { now = new Date() } = {}) {
  const list = Array.isArray(receipts) ? receipts : [];
  const brands = rankedBrands(list);

  // --- Stacked columns: cost per season, split by brand --------------------
  const seasonMap = new Map(SEASONS.map((season) => [season.key, { season, total: 0, count: 0, byBrand: new Map() }]));
  list.forEach((receipt) => {
    const month = Number(String(receipt?.date || '').slice(5, 7));
    const season = SEASONS.find((entry) => entry.months.includes(month));
    if (!season) return;
    const bucket = seasonMap.get(season.key);
    const total = toNumber(receipt?.total);
    const brand = brands.groupOf(String(receipt?.store || '').trim() || 'Không rõ');
    bucket.total += total;
    bucket.count += 1;
    bucket.byBrand.set(brand, (bucket.byBrand.get(brand) || 0) + total);
  });

  const brandOrder = [...brands.shown, ...(brands.ranked.length > brands.shown.length ? ['Khác'] : [])];
  const seasons = SEASONS.map((season) => {
    const bucket = seasonMap.get(season.key);
    const segments = brandOrder
      .map((name) => ({ name, value: bucket.byBrand.get(name) || 0, color: brands.colorMap.get(name) }))
      .filter((segment) => segment.value > 0);
    return { key: season.key, label: `${season.emoji} ${season.label}`, total: bucket.total, count: bucket.count, segments };
  });

  const brandLegend = brandOrder.map((name) => ({
    name,
    value: list.reduce((sum, receipt) => {
      if (brands.groupOf(String(receipt?.store || '').trim() || 'Không rõ') !== name) return sum;
      return sum + toNumber(receipt?.total);
    }, 0),
    color: brands.colorMap.get(name),
  })).filter((entry) => entry.value > 0);

  // --- Brand profile donut -------------------------------------------------
  const totalSpend = list.reduce((sum, receipt) => sum + toNumber(receipt?.total), 0);
  const brandProfile = {
    total: totalSpend,
    segments: brandLegend,
  };

  // --- Drinks profile ring (sugary/caffeine vs. light & healthy) -----------
  let riskCount = 0;
  let healthyCount = 0;
  list.forEach((receipt) => {
    (Array.isArray(receipt?.items) ? receipt.items : []).forEach((item) => {
      const name = String(item?.name || '').trim();
      if (!name) return;
      const qty = Math.max(1, Math.round(toNumber(item.qty) || 1));
      const flags = classifyHealth(name);
      if (flags.healthy) healthyCount += qty;
      else if (flags.sweet || flags.caffeine || flags.highCalorie) riskCount += qty;
      else healthyCount += qty; // trung tính xếp vào nhóm nhẹ nhàng
    });
  });
  const drinkProfile = {
    total: riskCount + healthyCount,
    riskCount,
    healthyCount,
    segments: [
      { name: 'Ngọt / Nhiều caffeine', value: riskCount, color: PALETTE.warning },
      { name: 'Ít đường / Lành mạnh', value: healthyCount, color: PALETTE.primary },
    ].filter((segment) => segment.value > 0),
  };

  // --- Average cost per receipt, per quarter -------------------------------
  const quarterMap = new Map();
  list.forEach((receipt) => {
    const quarter = quarterOf(receipt?.date);
    if (!quarter) return;
    const entry = quarterMap.get(quarter.key) || { ...quarter, count: 0, total: 0 };
    entry.count += 1;
    entry.total += toNumber(receipt?.total);
    quarterMap.set(quarter.key, entry);
  });
  const avgCost = [...quarterMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6)
    .map((entry, index) => ({
      label: entry.label,
      value: entry.count ? Math.round(entry.total / entry.count) : 0,
      color: index % 2 ? PALETTE.mint : PALETTE.primaryAlt,
      caption: formatShort(entry.count ? Math.round(entry.total / entry.count) : 0),
    }));

  // --- Frequency: visits per month + average days between visits -----------
  const visitDays = [...new Set(list.map((receipt) => dayNumber(receipt?.date)).filter((day) => day !== null))].sort((a, b) => a - b);
  let avgDaysBetween = 0;
  if (visitDays.length >= 2) {
    const span = visitDays[visitDays.length - 1] - visitDays[0];
    avgDaysBetween = Math.round((span / (visitDays.length - 1)) * 10) / 10;
  }
  const monthMap = new Map();
  list.forEach((receipt) => {
    const key = String(receipt?.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    monthMap.set(key, (monthMap.get(key) || 0) + 1);
  });
  const frequency = {
    avgDaysBetween,
    visitCount: list.length,
    uniqueDays: visitDays.length,
    bars: [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, count]) => ({ label: `T${Number(key.slice(5, 7))}`, value: count, caption: `${count}`, color: PALETTE.primary })),
  };

  // --- Meta ----------------------------------------------------------------
  const latest = list.map((receipt) => receipt?.date || '').filter(Boolean).sort().pop() || '';
  const latestQuarter = quarterOf(latest);
  const updatedLabel = latestQuarter ? `Đến hết ${latestQuarter.label}` : 'Chưa có dữ liệu';

  return {
    count: list.length,
    totalSpend,
    updatedLabel,
    brands: brandLegend,
    seasons,
    brandProfile,
    drinkProfile,
    avgCost,
    frequency,
    categoryTotals: CATEGORY_LABELS,
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function panel(title, eyebrow, body, { className = '' } = {}) {
  return `<section class="coffee-card coffee-dash-panel ${className}">
    ${eyebrow ? `<p class="coffee-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
    <h3 class="coffee-dash-panel__title">${escapeHtml(title)}</h3>
    ${body}
  </section>`;
}

export function renderDashboard(receipts = [], options = {}) {
  const data = computeDashboard(receipts, options);

  if (!data.count) {
    return `<section class="coffee-dash coffee-card">
      <p class="coffee-empty">Chưa có dữ liệu để dựng dashboard. Thêm một hoá đơn hoặc nhập chi phí thủ công để bắt đầu.</p>
    </section>`;
  }

  const stacked = stackedColumnChart(data.seasons, {
    ariaLabel: 'Tổng chi phí theo mùa, phân tách theo thương hiệu',
  });

  const brandDonut = donutChart(data.brandProfile.segments, {
    ariaLabel: 'Cơ cấu thương hiệu theo tỷ trọng chi tiêu',
    centerValue: formatShort(data.brandProfile.total),
    centerLabel: 'Tổng chi',
    size: 240,
  });

  const drinkRing = donutChart(data.drinkProfile.segments, {
    ariaLabel: 'Cơ cấu đồ uống: ngọt/caffeine so với ít đường/lành mạnh',
    centerValue: data.drinkProfile.riskCount && data.drinkProfile.total
      ? `${Math.round((data.drinkProfile.riskCount / data.drinkProfile.total) * 100)}%`
      : '—',
    centerLabel: 'ngọt/caffeine',
    size: 240,
    thickness: 34,
  });

  const avgChart = barChart(data.avgCost, {
    ariaLabel: 'Chi phí trung bình mỗi hoá đơn theo quý',
    height: 230,
  });

  const freqChart = barChart(data.frequency.bars, {
    ariaLabel: 'Số lần ghé quán theo tháng',
    height: 230,
  });

  const heroLegend = legend(data.brands, { valueFormatter: formatVnd, percentOf: data.totalSpend });

  return `<section class="coffee-dash" aria-label="Dashboard chi phí cà phê">
    <section class="coffee-card coffee-dash-hero">
      <div class="coffee-dash-hero__head">
        <div>
          <p class="coffee-eyebrow">TỔNG CHI PHÍ THEO MÙA</p>
          <h2 class="coffee-dash-hero__title">Chi phí cà phê · phân tách theo thương hiệu</h2>
        </div>
        <div class="coffee-dash-hero__meta">
          <span class="coffee-chip coffee-chip--muted">${escapeHtml(data.updatedLabel)}</span>
          <span class="coffee-chip">${escapeHtml(formatVnd(data.totalSpend))}</span>
        </div>
      </div>
      <div class="coffee-chart-scroll">${stacked}</div>
      ${heroLegend}
    </section>

    <div class="coffee-dash-grid">
      ${panel('Cơ cấu thương hiệu', 'BRAND PROFILE', `
        <div class="coffee-donut-wrap">${brandDonut}
          ${legend(data.brandProfile.segments, { valueFormatter: formatVnd, percentOf: data.brandProfile.total })}
        </div>
        <p class="coffee-dash-foot">Tổng chi: <strong>${escapeHtml(formatVnd(data.brandProfile.total))}</strong></p>`,
      { className: 'coffee-dash-panel--donut' })}

      ${panel('Cơ cấu đồ uống', 'DRINKS PROFILE', `
        <div class="coffee-donut-wrap">${drinkRing}
          ${legend(data.drinkProfile.segments, { valueFormatter: (v) => `${v} ly`, percentOf: data.drinkProfile.total })}
        </div>
        <p class="coffee-dash-foot">${data.drinkProfile.total} lượt món được phân loại theo tên.</p>`,
      { className: 'coffee-dash-panel--donut' })}

      ${panel('Chi phí trung bình / hoá đơn', 'COST BREAKDOWN', `
        <div class="coffee-chart-scroll">${avgChart || '<p class="coffee-chart-empty">Chưa có dữ liệu.</p>'}</div>
        <p class="coffee-dash-foot">So sánh theo quý gần nhất.</p>`)}

      ${panel('Tần suất ghé quán', 'TIME MATURITY', `
        <div class="coffee-dash-kpis">
          <div><span>TB ngày / lần</span><strong>${data.frequency.avgDaysBetween || '—'}</strong></div>
          <div><span>Lượt ghé</span><strong>${data.frequency.visitCount}</strong></div>
        </div>
        <div class="coffee-chart-scroll">${freqChart || '<p class="coffee-chart-empty">Chưa có dữ liệu.</p>'}</div>`) }
    </div>
  </section>`;
}

export { classifyItem };
