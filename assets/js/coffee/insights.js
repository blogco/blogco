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
  let itemCount = 0;

  list.forEach((receipt) => {
    const date = receipt?.date || '';
    const day = dayNumber(date);
    const inWeek = day !== null && nowDay !== null && day <= nowDay && day > nowDay - weekDays;
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
    });
  });

  const topItems = [...itemsMap.values()].sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 8);
  const topBrands = [...brandsMap.values()].sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 6);
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

  return {
    hasData: list.length > 0,
    receiptCount: list.length,
    itemCount,
    uniqueItems: itemsMap.size,
    topItems,
    topBrands,
    topSeasons,
    peakWeekday: peakWeekday ? { day: peakWeekday[0], label: WEEKDAYS[peakWeekday[0]], count: peakWeekday[1] } : null,
    categoryCounts: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category] || CATEGORY_LABELS.other, count }))
      .sort((a, b) => b.count - a.count),
    health,
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

export function renderAiInsights(receipts = [], options = {}) {
  const data = buildInsights(receipts, options);

  const body = !data.hasData
    ? '<p class="coffee-empty">Chưa có dữ liệu để phân tích. Thêm giao dịch (hoặc hoá đơn) rồi bấm “Làm mới Insights”.</p>'
    : `
    <div class="coffee-insight-grid">
      <section class="coffee-card coffee-insight-card">
        <p class="coffee-eyebrow">THÓI QUEN</p>
        <h3 class="coffee-insight-card__title">⭐ Món yêu thích (Top Favorite Items)</h3>
        <ul class="coffee-insight-list">${listRows(data.topItems, { empty: 'Chưa có tên món — thêm cột Items khi nhập liệu.' })}</ul>
      </section>

      <section class="coffee-card coffee-insight-card">
        <p class="coffee-eyebrow">ĐỊA ĐIỂM & THỜI ĐIỂM</p>
        <h3 class="coffee-insight-card__title">🏬 Thương hiệu ghé nhiều nhất</h3>
        <ul class="coffee-insight-list">${listRows(data.topBrands, { empty: 'Chưa có dữ liệu.', format: (entry) => formatVnd(entry.total) })}</ul>
        <h3 class="coffee-insight-card__title coffee-insight-card__title--sub">🌦️ Mùa & thời điểm thường mua</h3>
        <div class="coffee-insight-tags">
          ${data.topSeasons.length
            ? data.topSeasons.map((season) => `<span class="coffee-chip">${escapeHtml(season.label)} · ${season.count}</span>`).join('')
            : '<span class="coffee-chip coffee-chip--muted">Chưa rõ mùa</span>'}
          ${data.peakWeekday ? `<span class="coffee-chip coffee-chip--muted">Thường mua: ${escapeHtml(data.peakWeekday.label)}</span>` : ''}
        </div>
      </section>
    </div>

    <section class="coffee-card coffee-insight-card coffee-insight-health">
      <p class="coffee-eyebrow">SỨC KHỎE & DINH DƯỠNG</p>
      <h3 class="coffee-insight-card__title">🩺 Cảnh báo & lời khuyên từ AI</h3>
      <ul class="coffee-insight-alerts">
        ${data.alerts.map((alert) => `<li class="coffee-insight-alert is-${alert.tone}">
          <span class="coffee-insight-alert__icon" aria-hidden="true">${alert.icon}</span>
          <span><strong>${escapeHtml(alert.title)}</strong> — ${escapeHtml(alert.message)}</span>
        </li>`).join('')}
      </ul>
      <h3 class="coffee-insight-card__title coffee-insight-card__title--sub">🥗 Gợi ý thay thế lành mạnh</h3>
      <ul class="coffee-insight-alt">
        ${data.alternatives.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
      </ul>
      <p class="coffee-insight-note">Phân tích dựa trên TÊN món đã nhập, không phải tư vấn y khoa. Thành phần và khẩu phần thực tế thay đổi theo công thức mỗi quán.</p>
    </section>`;

  return `<section class="coffee-ai-insights" data-ai-insights aria-labelledby="ai-insights-title">
    <div class="coffee-ai-insights__head">
      <div>
        <p class="coffee-eyebrow">BLOGCO · AI</p>
        <h2 id="ai-insights-title">💡 AI Insights &amp; Phân Tích Thói Quen</h2>
        <p class="coffee-muted">Tần suất món yêu thích, thương hiệu ghé nhiều, mùa mua sắm và cảnh báo sức khỏe từ danh sách món.</p>
      </div>
      <button type="button" class="coffee-secondary-button" data-ai-refresh>🔄 Làm mới Insights</button>
    </div>
    ${body}
  </section>`;
}
