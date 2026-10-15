// AI Insights cho "Chi phí cà phê" — phân tích thói quen tiêu dùng và đưa ra
// cảnh báo sức khỏe/lời khuyên dinh dưỡng từ danh sách món (cột Items).
//
// Toàn bộ phần tính toán là hàm thuần (chạy/kiểm thử trong Node). `renderAiInsights`
// chỉ dựng chuỗi HTML từ kết quả phân tích, không đụng DOM.
//
// Lưu ý: đây là công cụ gợi ý dựa trên TÊN món, không phải chẩn đoán y khoa. Thành
// phần/khẩu phần thực tế thay đổi theo công thức và tuỳ chọn của từng quán.

import { escapeHtml, formatVnd, toNumber } from './store.js';
import { normalizeName, classifyItem, CATEGORY_LABELS } from './menu.js';
import { seasonOf, SEASON_LABELS } from './season.js';
import { progressMeter, horizontalBarChart, donutChart, legend, colorAt, formatShort } from './charts.js';

// ---------------------------------------------------------------------------
// Nhận diện thành phần theo tên món (đã bỏ dấu, chữ thường)
// ---------------------------------------------------------------------------
const SWEET_RE = /matcha|tra sua|ca phe sua|sua da|bac xiu|bac siu|caramel|mocha|freeze|sinh to|smoothie|frappe|chocolate|socola|milkshake|\bkem\b|yogurt|sua chua|duong|condensed|\blatte\b/;
const CAFFEINE_RE = /ca phe|coffee|espresso|americano|\blatte\b|cappuccino|mocha|macchiato|matcha|\btra\b|tra xanh|tra den|oolong|cold brew|bac xiu|robusta|arabica|freeze|hong tra/;
const HIGH_CAL_RE = /tra sua|sua da|freeze|sinh to|smoothie|frappe|milkshake|\bkem\b|banh|croissant|muffin|cookie|brownie|tiramisu|cake|chocolate|socola|caramel/;
const HEALTHY_RE = /khong duong|it duong|khong da|it da|tra xanh|tra den|tra nguyen|nuoc suoi|nuoc loc|americano|espresso|tra thao moc|nuoc ep|detox|atiso|khong sua|it sua/;

export function classifyHealth(name = '') {
  const text = normalizeName(name);
  if (!text) return { sweet: false, caffeine: false, highCalorie: false, healthy: false };
  const healthy = HEALTHY_RE.test(text);
  return {
    sweet: !healthy && SWEET_RE.test(text),
    caffeine: CAFFEINE_RE.test(text),
    highCalorie: !healthy && HIGH_CAL_RE.test(text),
    healthy,
  };
}

// Ước lượng dinh dưỡng theo TÊN món (gram đường, mg caffeine, kcal / khẩu phần).
// Chỉ là con số tham khảo để vẽ biểu đồ xu hướng, không phải dữ liệu nhãn sản phẩm.
const NUTRITION_RULES = [
  [/khong duong|it duong|no sugar|khong sua|it sua|khong da/, { sugar: 2, caffeine: 30, calories: 30 }],
  [/matcha/, { sugar: 32, caffeine: 70, calories: 190 }],
  [/tra sua|milk ?tea/, { sugar: 40, caffeine: 30, calories: 300 }],
  [/ca phe sua|sua da|bac xiu|bac siu/, { sugar: 22, caffeine: 110, calories: 150 }],
  [/freeze|sinh to|smoothie|frappe|milkshake|da xay/, { sugar: 45, caffeine: 20, calories: 320 }],
  [/tra dao|tra sen|tra thach|tra trai cay|hong tra|peach/, { sugar: 28, caffeine: 25, calories: 120 }],
  [/tra xanh|tra den|oolong|o long|\btra\b|tea/, { sugar: 6, caffeine: 40, calories: 20 }],
  [/mocha|caramel|latte|cappuccino|macchiato/, { sugar: 24, caffeine: 95, calories: 190 }],
  [/ca phe|coffee|espresso|americano|cold brew|phin|robusta|arabica/, { sugar: 3, caffeine: 120, calories: 15 }],
  [/banh|croissant|muffin|cookie|brownie|tiramisu|cake|flan|panna/, { sugar: 20, caffeine: 2, calories: 300 }],
  [/nuoc ngot|soda|pepsi|coca|sting/, { sugar: 35, caffeine: 20, calories: 150 }],
  [/nuoc ep|juice/, { sugar: 24, caffeine: 0, calories: 120 }],
  [/nuoc suoi|nuoc loc|atiso/, { sugar: 0, caffeine: 0, calories: 0 }],
];

export const WEEKLY_SUGAR_LIMIT = 175;   // ~25 g đường tự do/ngày (WHO) × 7
export const WEEKLY_CAFFEINE_LIMIT = 2800; // ~400 mg caffeine/ngày × 7

export function estimateNutrition(name = '') {
  const text = normalizeName(name);
  if (!text) return { sugar: 0, caffeine: 0, calories: 0 };
  let estimate = null;
  for (const [pattern, value] of NUTRITION_RULES) {
    if (pattern.test(text)) { estimate = { ...value }; break; }
  }
  if (!estimate) {
    const flags = classifyHealth(name);
    if (flags.sweet) estimate = { sugar: 25, caffeine: flags.caffeine ? 60 : 0, calories: 180 };
    else if (flags.caffeine) estimate = { sugar: 2, caffeine: 90, calories: 15 };
    else estimate = { sugar: 0, caffeine: 0, calories: 0 };
  }
  // Ưu tiên tuyệt đối nếu người dùng ghi rõ "không đường".
  if (/khong duong|no sugar/.test(text)) estimate.sugar = 0;
  return estimate;
}

function limitTone(pct) {
  if (pct >= 100) return 'danger';
  if (pct >= 70) return 'warning';
  return 'primary';
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function dayNumber(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateKey || ''));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
}

function weekdayOf(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateKey || ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildAlternatives(categoryCounts) {
  const tips = [];
  const ranked = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  ranked.slice(0, 2).forEach(([category]) => {
    if (category === 'coffee') tips.push('Chuyển sang Americano / cà phê đen ít hoặc không đường.');
    else if (category === 'tea') tips.push('Chọn trà nguyên chất (trà xanh / trà đen / atiso) và giảm 30–50% đường.');
    else if (category === 'freeze') tips.push('Đổi sang sinh tố không đường hoặc nước ép trái cây tươi, chọn size nhỏ.');
    else if (category === 'bakery') tips.push('Thay bánh ngọt bằng bánh yến mạch, các loại hạt hoặc trái cây tươi.');
  });
  tips.push('Uống đủ nước lọc trong ngày và hạn chế caffeine sau 16:00 để ngủ ngon hơn.');
  return [...new Set(tips)].slice(0, 4);
}

// ---------------------------------------------------------------------------
// Phân tích chính
// ---------------------------------------------------------------------------
export function buildInsights(receipts = [], { now = new Date(), weekDays = 7 } = {}) {
  const list = Array.isArray(receipts) ? receipts : [];
  const nowDay = dayNumber(localDateKey(now));
  const monthKey = localDateKey(now).slice(0, 7);

  const itemsMap = new Map();
  const brandsMap = new Map();
  const seasonsMap = new Map();
  const weekdayMap = new Map();
  const categoryCounts = new Map();

  const health = { sweetWeek: 0, sweetMonth: 0, caffeineWeek: 0, caffeineMonth: 0, highCalWeek: 0, healthyWeek: 0, lateCaffeine: 0 };
  const nutrition = { sugarWeek: 0, sugarPrevWeek: 0, caffeineWeek: 0, caffeinePrevWeek: 0, caloriesWeek: 0 };
  let itemCount = 0;

  list.forEach((receipt) => {
    const date = receipt?.date || '';
    const day = dayNumber(date);
    const inWeek = day !== null && nowDay !== null && day <= nowDay && day > nowDay - weekDays;
    const inPrevWeek = day !== null && nowDay !== null && day <= nowDay - weekDays && day > nowDay - weekDays * 2;
    const inMonth = String(date).slice(0, 7) === monthKey;

    const brand = String(receipt?.store || '').trim() || 'Không rõ';
    const brandEntry = brandsMap.get(brand) || { name: brand, count: 0, total: 0 };
    brandEntry.count += 1;
    brandEntry.total += toNumber(receipt?.total);
    brandsMap.set(brand, brandEntry);

    const season = receipt?.season || seasonOf(date)?.key || '';
    if (season) seasonsMap.set(season, (seasonsMap.get(season) || 0) + 1);

    const weekday = weekdayOf(date);
    if (weekday !== null) weekdayMap.set(weekday, (weekdayMap.get(weekday) || 0) + 1);

    const late = /^(\d{1,2}):(\d{2})/.exec(String(receipt?.time || ''));
    const isLate = late ? Number(late[1]) >= 16 : false;

    (Array.isArray(receipt?.items) ? receipt.items : []).forEach((item) => {
      const name = String(item?.name || '').trim();
      if (!name) return;
      const qty = Math.max(1, Math.round(toNumber(item.qty) || 1));
      const key = normalizeName(name) || name.toLowerCase();
      const entry = itemsMap.get(key) || { name, count: 0, total: 0, category: classifyItem(name) };
      entry.count += qty;
      entry.total += toNumber(item.amount);
      itemsMap.set(key, entry);
      itemCount += qty;

      categoryCounts.set(entry.category, (categoryCounts.get(entry.category) || 0) + qty);

      const flags = classifyHealth(name);
      if (flags.sweet) { if (inWeek) health.sweetWeek += qty; if (inMonth) health.sweetMonth += qty; }
      if (flags.caffeine) { if (inWeek) health.caffeineWeek += qty; if (inMonth) health.caffeineMonth += qty; }
      if (flags.highCalorie && inWeek) health.highCalWeek += qty;
      if (flags.healthy && inWeek) health.healthyWeek += qty;
      if (flags.caffeine && isLate) health.lateCaffeine += qty;

      const est = estimateNutrition(name);
      if (inWeek) {
        nutrition.sugarWeek += est.sugar * qty;
        nutrition.caffeineWeek += est.caffeine * qty;
        nutrition.caloriesWeek += est.calories * qty;
      }
      if (inPrevWeek) {
        nutrition.sugarPrevWeek += est.sugar * qty;
        nutrition.caffeinePrevWeek += est.caffeine * qty;
      }
    });
  });

  const topItems = [...itemsMap.values()].sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 8);
  const topBrands = [...brandsMap.values()].sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 6);

  // --- Các chỉ số "cốt lõi" tính thời gian thực -----------------------------
  // Món ưa thích: tần suất xuất hiện nhiều nhất, KHÔNG phân biệt thương hiệu.
  const favoriteItem = topItems[0] || null;
  // Brand "cúng" nhiều nhất: gom SUM(total) theo từng thương hiệu.
  const brandBySpend = [...brandsMap.values()].sort((a, b) => b.total - a.total);
  const brandTotal = brandBySpend.reduce((sum, brand) => sum + brand.total, 0);
  const topSpendBrand = brandBySpend.length ? { ...brandBySpend[0] } : null;
  const brandSegments = (() => {
    const head = brandBySpend.slice(0, 5);
    const tail = brandBySpend.slice(5);
    const segments = head
      .filter((brand) => brand.total > 0)
      .map((brand, index) => ({ name: brand.name, value: brand.total, color: colorAt(index) }));
    const restTotal = tail.reduce((sum, brand) => sum + brand.total, 0);
    if (restTotal > 0) segments.push({ name: 'Khác', value: restTotal, color: '#E0E0E0' });
    return segments;
  })();

  const topSeasons = [...seasonsMap.entries()]
    .map(([key, count]) => ({ key, label: SEASON_LABELS[key] || key, count }))
    .sort((a, b) => b.count - a.count);
  const peakWeekday = [...weekdayMap.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  // --- Cảnh báo sức khỏe & lời khuyên --------------------------------------
  const alerts = [];
  if (health.sweetWeek >= 5) {
    alerts.push({ tone: 'warning', icon: '🍬', title: 'Đồ uống ngọt', message: `Bạn đã dùng ${health.sweetWeek} ly đồ uống ngọt (Matcha/Cà phê sữa/Trà sữa…) trong 7 ngày qua — lượng đường cao có thể ảnh hưởng không tốt tới sức khỏe và giấc ngủ.` });
  } else if (health.sweetWeek >= 3) {
    alerts.push({ tone: 'info', icon: '🍬', title: 'Đồ uống ngọt', message: `${health.sweetWeek} ly đồ uống ngọt trong tuần này — hãy để mắt tới lượng đường.` });
  }
  if (health.caffeineWeek >= 7) {
    alerts.push({ tone: 'warning', icon: '☕', title: 'Caffeine', message: `Bạn đã dùng ${health.caffeineWeek} món chứa caffeine trong 7 ngày qua — nên cân nhắc giảm để không ảnh hưởng giấc ngủ.` });
  } else if (health.caffeineWeek >= 5) {
    alerts.push({ tone: 'info', icon: '☕', title: 'Caffeine', message: `${health.caffeineWeek} món chứa caffeine trong tuần này — mức nên theo dõi.` });
  }
  if (health.highCalWeek >= 4) {
    alerts.push({ tone: 'info', icon: '🍰', title: 'Calo cao', message: `${health.highCalWeek} món calo cao (trà sữa, đá xay, bánh ngọt…) trong 7 ngày qua.` });
  }
  if (health.lateCaffeine > 0) {
    alerts.push({ tone: 'warning', icon: '🌙', title: 'Caffeine muộn', message: `Có ${health.lateCaffeine} lần dùng caffeine sau 16:00 — có thể ảnh hưởng chất lượng giấc ngủ.` });
  }
  if (health.healthyWeek >= 3) {
    alerts.push({ tone: 'good', icon: '✅', title: 'Lựa chọn lành mạnh', message: `Bạn đã chọn ${health.healthyWeek} món ít đường/nguyên chất trong tuần — tiếp tục duy trì nhé!` });
  }
  if (!alerts.length) {
    alerts.push({ tone: 'good', icon: '👍', title: 'Chưa có cảnh báo', message: 'Chưa thấy thói quen nào vượt ngưỡng khuyến nghị trong dữ liệu hiện tại. Hãy tiếp tục ghi chép để phân tích chính xác hơn.' });
  }

  const alternatives = buildAlternatives(categoryCounts);

  const sugarPct = WEEKLY_SUGAR_LIMIT ? Math.round((nutrition.sugarWeek / WEEKLY_SUGAR_LIMIT) * 100) : 0;
  const sugarPrevPct = WEEKLY_SUGAR_LIMIT ? Math.round((nutrition.sugarPrevWeek / WEEKLY_SUGAR_LIMIT) * 100) : 0;
  const caffeinePct = WEEKLY_CAFFEINE_LIMIT ? Math.round((nutrition.caffeineWeek / WEEKLY_CAFFEINE_LIMIT) * 100) : 0;
  const caffeinePrevPct = WEEKLY_CAFFEINE_LIMIT ? Math.round((nutrition.caffeinePrevWeek / WEEKLY_CAFFEINE_LIMIT) * 100) : 0;

  if (nutrition.sugarWeek > WEEKLY_SUGAR_LIMIT) {
    const over = Math.round(((nutrition.sugarWeek - WEEKLY_SUGAR_LIMIT) / WEEKLY_SUGAR_LIMIT) * 100);
    alerts.unshift({
      tone: 'warning', icon: '🍬', title: 'Đường vượt ngưỡng',
      message: `Lượng đường tuần này ước tính ~${nutrition.sugarWeek} g, cao hơn ${over}% so với mức khuyến nghị (${WEEKLY_SUGAR_LIMIT} g/tuần) — nên giảm đồ uống ngọt để đỡ mệt mỏi buổi chiều.`,
    });
  }

  return {
    hasData: list.length > 0,
    receiptCount: list.length,
    itemCount,
    uniqueItems: itemsMap.size,
    topItems,
    topBrands,
    favoriteItem,
    topSpendBrand,
    brandSegments,
    brandTotal,
    topSeasons,
    peakWeekday: peakWeekday ? { day: peakWeekday[0], label: WEEKDAYS[peakWeekday[0]], count: peakWeekday[1] } : null,
    categoryCounts: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category] || CATEGORY_LABELS.other, count }))
      .sort((a, b) => b.count - a.count),
    health,
    nutrition: {
      ...nutrition,
      sugarPct, sugarPrevPct, caffeinePct, caffeinePrevPct,
      sugarTone: limitTone(sugarPct), caffeineTone: limitTone(caffeinePct),
      sugarLimit: WEEKLY_SUGAR_LIMIT, caffeineLimit: WEEKLY_CAFFEINE_LIMIT,
    },
    alerts,
    alternatives,
  };
}

// ---------------------------------------------------------------------------
// Render (HTML string, không đụng DOM)
// ---------------------------------------------------------------------------
function listRows(entries, { empty = '—', format = null } = {}) {
  if (!entries.length) return `<li class="coffee-muted">${escapeHtml(empty)}</li>`;
  return entries.map((entry) => `<li>
    <span class="coffee-insight-list__name">${escapeHtml(entry.name)}</span>
    <strong>${entry.count}×${format ? ` · ${escapeHtml(format(entry))}` : ''}</strong>
  </li>`).join('');
}

function frequencyLabel(count, total) {
  if (!count) return '—';
  const share = total ? count / total : 0;
  if (count >= 8 || share >= 0.3) return 'Rất cao';
  if (count >= 5) return 'Cao';
  if (count >= 3) return 'Trung bình';
  return 'Thấp';
}

export function renderAiInsights(receipts = [], options = {}) {
  const data = buildInsights(receipts, options);

  const head = `<div class="coffee-ai-insights__head">
      <div>
        <p class="coffee-eyebrow">BLOGCO · AI</p>
        <h2 id="ai-insights-title">💡 AI Insights &amp; Smart Analytics Dashboard</h2>
        <p class="coffee-muted">Phân tích chuyên sâu thời gian thực về tài chính và thói quen tiêu dùng.</p>
      </div>
      <button type="button" class="coffee-secondary-button" data-ai-refresh>🔄 Làm mới Insights</button>
    </div>`;

  if (!data.hasData) {
    return `<section class="coffee-ai-insights" data-ai-insights aria-labelledby="ai-insights-title">
      ${head}
      <p class="coffee-empty">Chưa có dữ liệu để phân tích. Thêm giao dịch (hoặc hoá đơn) rồi bấm “Làm mới Insights”.</p>
    </section>`;
  }

  const fav = data.favoriteItem;
  const favFreq = frequencyLabel(fav?.count || 0, data.itemCount);
  const topBrand = data.topSpendBrand;
  const brandShare = topBrand && data.brandTotal ? Math.round((topBrand.total / data.brandTotal) * 100) : 0;

  const itemBars = horizontalBarChart(
    data.topItems.map((item, index) => ({
      label: item.name,
      value: item.count,
      caption: `${item.count} lần`,
      color: colorAt(index),
    })),
    { ariaLabel: 'Biểu đồ tần suất gọi món', valueFormatter: (value) => `${value} lần` },
  );

  const brandDonut = donutChart(data.brandSegments, {
    ariaLabel: 'Tỷ trọng chi tiêu theo thương hiệu',
    centerValue: formatShort(data.brandTotal),
    centerLabel: 'Tổng “cúng”',
    size: 240,
  });

  return `<section class="coffee-ai-insights" data-ai-insights aria-labelledby="ai-insights-title">
    ${head}

    <p class="coffee-insight-section-label">KẾT QUẢ TỔNG QUAN HÔM NAY</p>
    <div class="coffee-insight-kpis">
      <div class="coffee-card coffee-insight-kpi">
        <span class="coffee-insight-kpi__icon" aria-hidden="true">🌟</span>
        <div>
          <span class="coffee-insight-kpi__label">Món ưa thích nhất (Top Item)</span>
          <strong class="coffee-insight-kpi__value">${fav ? escapeHtml(fav.name) : '—'}</strong>
          <small>Số lần gọi: ${fav ? fav.count : 0} lần · Tần suất: ${favFreq} (độc lập brand)</small>
        </div>
      </div>
      <div class="coffee-card coffee-insight-kpi">
        <span class="coffee-insight-kpi__icon" aria-hidden="true">👑</span>
        <div>
          <span class="coffee-insight-kpi__label">Brand “cúng” nhiều nhất (Top Spend Brand)</span>
          <strong class="coffee-insight-kpi__value">${topBrand ? escapeHtml(topBrand.name) : '—'}</strong>
          <small>Tổng tiền: ${topBrand ? escapeHtml(formatVnd(topBrand.total)) : '0 đ'} · Tỷ trọng: ${brandShare}% tổng chi phí</small>
        </div>
      </div>
    </div>

    <section class="coffee-card coffee-insight-card">
      <p class="coffee-eyebrow">BIỂU ĐỒ 1 · TẦN SUẤT GỌI MÓN</p>
      <h3 class="coffee-insight-card__title">📊 Top món uống &amp; tần suất</h3>
      ${itemBars}
    </section>

    <section class="coffee-card coffee-insight-card">
      <p class="coffee-eyebrow">BIỂU ĐỒ 2 · TỶ TRỌNG CHI TIÊU THEO BRAND</p>
      <h3 class="coffee-insight-card__title">💰 Phân bổ ngân sách thương hiệu &amp; tổng tiền “cúng”</h3>
      <div class="coffee-donut-wrap">${brandDonut}
        ${legend(data.brandSegments, { valueFormatter: formatVnd, percentOf: data.brandTotal })}
      </div>
      <p class="coffee-dash-foot">Total spend: <strong>${escapeHtml(formatVnd(data.brandTotal))}</strong></p>
    </section>

    <section class="coffee-card coffee-insight-card coffee-insight-health">
      <p class="coffee-eyebrow">BIỂU ĐỒ 3 · CHỈ SỐ DINH DƯỠNG &amp; CẢNH BÁO SỨC KHỎE</p>
      <h3 class="coffee-insight-card__title">🩺 Đường, Caffeine &amp; cảnh báo từ AI</h3>
      <div class="coffee-meter-grid">
        ${progressMeter({
          label: 'Lượng đường tuần này',
          value: data.nutrition.sugarWeek, max: data.nutrition.sugarLimit,
          valueText: `${data.nutrition.sugarWeek} g · ${data.nutrition.sugarPct}%`,
          tone: data.nutrition.sugarTone,
          hint: `Khuyến nghị ≤ ${data.nutrition.sugarLimit} g/tuần · tuần trước ${data.nutrition.sugarPrevWeek} g`,
        })}
        ${progressMeter({
          label: 'Lượng Caffeine nạp vào',
          value: data.nutrition.caffeineWeek, max: data.nutrition.caffeineLimit,
          valueText: `${data.nutrition.caffeineWeek} mg · ${data.nutrition.caffeinePct}%`,
          tone: data.nutrition.caffeineTone,
          hint: `Khuyến nghị ≤ ${data.nutrition.caffeineLimit} mg/tuần · tuần trước ${data.nutrition.caffeinePrevWeek} mg`,
        })}
      </div>
      <ul class="coffee-insight-alerts">
        ${data.alerts.map((alert) => `<li class="coffee-insight-alert is-${alert.tone}">
          <span class="coffee-insight-alert__icon" aria-hidden="true">${alert.icon}</span>
          <span><strong>${escapeHtml(alert.title)}</strong> — ${escapeHtml(alert.message)}</span>
        </li>`).join('')}
      </ul>
    </section>

    <section class="coffee-card coffee-insight-card coffee-insight-reco">
      <p class="coffee-eyebrow">AI RECOMMENDATIONS</p>
      <h3 class="coffee-insight-card__title">💡 Đề xuất thay thế thông minh</h3>
      <ul class="coffee-insight-alt">
        ${data.alternatives.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
      </ul>
      <p class="coffee-insight-note">Phân tích dựa trên TÊN món đã nhập (ước lượng tham khảo), không phải tư vấn y khoa. Thành phần và khẩu phần thực tế thay đổi theo công thức mỗi quán.</p>
    </section>
  </section>`;
}
