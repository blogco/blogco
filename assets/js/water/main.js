import {
  addWaterEntry, downloadCsv, downloadJsonBackup, getNextEntryId,
  getWaterState, removeWaterEntry, saveWaterProfile,
} from './store.js';
import { groupEntriesByDate, searchWaterEntries } from './search.js';
import { buildDailyInsights, getTargetMl, getWeeklyTotals, localDateKey } from './insights.js';

const mountedRoots = new WeakSet();
let pendingToast = '';
let reminderTimer;
let searchState = null;

const DRINK_LABELS = {
  water: 'Nước lọc', tea: 'Trà', coffee: 'Cà phê', juice: 'Nước trái cây',
  milk: 'Sữa', other: 'Khác',
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatDate(dateKey, options = { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'long' }) {
  return new Intl.DateTimeFormat('vi-VN', options).format(new Date(`${dateKey}T12:00:00`));
}

function formatMl(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')} ml`;
}

function routeName(root) {
  const hash = location.hash.startsWith('#/water') ? location.hash.slice(1).replace(/\/$/, '') : '';
  if (hash) return hash;
  const initial = root.dataset.initialRoute;
  return initial ? `/water/${initial === 'dashboard' ? '' : initial}`.replace(/\/$/, '') || '/water' : '/water';
}

function renderEntry(entry, query = '') {
  const safeQuery = query.trim();
  const id = escapeHtml(entry.id);
  let idHtml = id;
  if (safeQuery && safeQuery.toUpperCase().includes('WTR-')) {
    const escaped = safeQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    idHtml = id.replace(new RegExp(`(${escaped})`, 'ig'), '<mark>$1</mark>');
  }
  const drink = entry.customDrink || DRINK_LABELS[entry.drinkType] || 'Khác';
  return `<li class="water-log-row">
    <div><strong>${idHtml}</strong><time datetime="${escapeHtml(entry.date)}T${escapeHtml(entry.time)}">${escapeHtml(entry.time)}</time></div>
    <span class="water-log-amount">${formatMl(entry.amountMl)}</span>
    <span>${escapeHtml(drink)}</span>
    <button class="water-icon-button" type="button" data-delete-entry="${id}" aria-label="Xoá bản ghi ${id}">Xoá</button>
  </li>`;
}

function pageHeader(title, description, back = '/water') {
  return `<div class="water-page-heading">
    <a class="water-back" href="#${back}" aria-label="Quay lại trang trước">← Quay lại</a>
    <p class="water-eyebrow">BLOGCO · THEO DÕI ĐỒ UỐNG</p>
    <h1 tabindex="-1">${title}</h1><p>${description}</p>
  </div>`;
}

function renderDashboard(root) {
  const state = getWaterState();
  const today = localDateKey();
  const goal = getTargetMl(state.profile);
  const insight = buildDailyInsights(state.entries, goal, today);
  const recent = [...state.entries].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).slice(0, 5);
  const percent = Math.min(100, insight.score);
  const circumference = 2 * Math.PI * 44;
  const offset = circumference * (1 - percent / 100);
  root.innerHTML = `<section class="water-screen" aria-labelledby="water-title">
    <div class="water-dashboard-top">
      <div>
        <p class="water-eyebrow">HÔM NAY · ${escapeHtml(formatDate(today))}</p>
        <h1 id="water-title" tabindex="-1">Water Intake Insights</h1>
        <p class="water-lead">Ghi nhận đồ uống và theo dõi mục tiêu nhắc nhở cá nhân.</p>
      </div>
      <button type="button" class="water-secondary-button" data-export-json aria-label="Tải bản sao lưu JSON">Tải sao lưu JSON</button>
    </div>

    <section class="water-card water-progress-card" aria-label="Tiến độ đồ uống hôm nay">
      <div class="water-progress-layout">
        <div class="water-ring" role="img" aria-label="Hoàn thành ${percent} phần trăm mục tiêu nhắc nhở">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="water-ring-track" cx="50" cy="50" r="44"></circle>
            <circle class="water-ring-value" cx="50" cy="50" r="44" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset}"></circle>
          </svg>
          <span class="water-ring-label"><strong>${percent}%</strong><small>mục tiêu</small></span>
        </div>
        <div class="water-progress-copy">
          <p class="water-total"><strong>${formatMl(insight.totalMl)}</strong><span>/ ${formatMl(goal)}</span></p>
          <div class="water-progress-track" role="progressbar" aria-label="Tiến độ mục tiêu nhắc nhở" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
            <span style="width:${percent}%"></span>
          </div>
          <p class="water-status ${percent >= 80 ? 'is-success' : percent >= 50 ? 'is-warning' : 'is-danger'}">${escapeHtml(insight.status)}</p>
          <p class="water-muted">${insight.remainingMl ? `Còn ${formatMl(insight.remainingMl)} theo mục tiêu đã đặt.` : 'Đã chạm mục tiêu nhắc nhở hôm nay.'}</p>
        </div>
      </div>
      <div class="water-actions">
        <a class="water-primary-button water-ripple" href="#/water/add">＋ Ghi đồ uống</a>
        <a class="water-secondary-button" href="#/water/search">⌕ Tra cứu</a>
      </div>
    </section>

    <div class="water-dashboard-grid">
      <section class="water-card water-insight-preview">
        <div class="water-card-heading"><div><p class="water-eyebrow">INSIGHTS HÔM NAY</p><h2>Gợi ý tự động</h2></div><span class="water-badge">Rule-based</span></div>
        <p>${escapeHtml(insight.recommendation)}</p>
        <a class="water-text-link" href="#/water/insights">Xem chi tiết <span aria-hidden="true">→</span></a>
      </section>
      <section class="water-card water-recent-card">
        <div class="water-card-heading"><div><p class="water-eyebrow">NHẬT KÝ</p><h2>Ghi nhận gần đây</h2></div><a class="water-text-link" href="#/water/search">Xem tất cả →</a></div>
        ${recent.length ? `<ul class="water-log-list">${recent.map((entry) => renderEntry(entry)).join('')}</ul>` : '<p class="water-empty">Chưa có dữ liệu. Ghi lần uống đầu tiên để bắt đầu theo dõi.</p>'}
      </section>
    </div>
    <p class="water-disclaimer">Đây là công cụ ghi chép và nhắc mục tiêu, không đo tình trạng mất nước hay thay thế tư vấn y tế. <a href="#/water/insights">Đọc lưu ý và nguồn tham khảo</a>.</p>
  </section>${toastMarkup()}`;
}

function renderAddForm(root) {
  const now = localDateTimeValue();
  const [today, time] = now.split('T');
  const nextId = escapeHtml(getNextEntryId());
  root.innerHTML = `<section class="water-screen" aria-labelledby="water-title">
    ${pageHeader('Nhập đồ uống', 'Lưu thời gian và lượng đồ uống vào thiết bị này.')}
    <form id="water-entry-form" class="water-card water-form" novalidate>
      <div class="water-form-grid">
        <label>Ngày uống <span aria-hidden="true">*</span><input name="date" type="date" value="${today}" max="${today}" required></label>
        <label>Giờ uống <span aria-hidden="true">*</span><input name="time" type="time" value="${time}" required></label>
        <label class="water-amount-field">Lượng đồ uống (ml) <span aria-hidden="true">*</span><div class="water-amount-input"><input id="water-amount" name="amountMl" type="number" min="25" max="5000" step="25" value="250" required><span>ml</span></div></label>
        <div class="water-quick-amounts" aria-label="Chọn lượng nhanh">${[150, 200, 250, 300, 500].map((amount) => `<button type="button" class="water-chip" data-amount="${amount}">${amount} ml</button>`).join('')}</div>
        <label>Loại đồ uống<select name="drinkType"><option value="water">Nước lọc</option><option value="tea">Trà</option><option value="coffee">Cà phê</option><option value="juice">Nước trái cây</option><option value="milk">Sữa</option><option value="other">Khác</option></select></label>
        <label id="water-custom-drink-wrap" hidden>Tên đồ uống<input name="customDrink" maxlength="60" placeholder="Ví dụ: nước điện giải"></label>
        <label class="water-full-field">Ghi chú <span class="water-muted">(tuỳ chọn)</span><textarea name="note" maxlength="300" rows="3" placeholder="Ghi chú riêng, chỉ lưu trên thiết bị này"></textarea></label>
      </div>
      <div class="water-preview"><p class="water-eyebrow">XEM TRƯỚC</p><strong>ID dự kiến: ${nextId}</strong><span>Sẽ lưu ngày ${escapeHtml(formatDate(today, { day: '2-digit', month: '2-digit', year: 'numeric' }))} · ${escapeHtml(time)} · <span data-preview-amount>250</span> ml</span></div>
      <p class="water-inline-note">Lượng này ghi đồ uống bạn đã chọn; thực phẩm cũng góp phần vào tổng lượng nước hằng ngày.</p>
      <div class="water-actions"><a class="water-secondary-button" href="#/water">Huỷ</a><button class="water-primary-button water-ripple" type="submit">Lưu dữ liệu</button></div>
    </form>
  </section>${toastMarkup()}`;
}

function renderSearchPage(root) {
  const previous = searchState || { mode: 'id', idQuery: '', date: localDateKey(), startDate: '', endDate: '', entries: null };
  const results = previous.entries;
  const state = getWaterState();
  const target = getTargetMl(state.profile);
  const total = results?.reduce((sum, entry) => sum + entry.amountMl, 0) || 0;
  const avg = results?.length ? Math.round(total / results.length) : 0;
  let resultList = '<p class="water-empty">Nhập điều kiện rồi chọn Tìm kiếm.</p>';
  if (results) {
    if (!results.length) resultList = '<p class="water-empty">Không tìm thấy bản ghi phù hợp.</p>';
    else if (previous.mode === 'range') {
      const groups = groupEntriesByDate(results);
      resultList = Object.entries(groups).map(([day, rows]) => `<section class="water-result-day"><h3>${escapeHtml(formatDate(day))} <span>${formatMl(rows.reduce((sum, row) => sum + row.amountMl, 0))}</span></h3><ul class="water-log-list">${rows.map((entry) => renderEntry(entry, previous.idQuery)).join('')}</ul></section>`).join('');
    } else resultList = `<ul class="water-log-list">${results.map((entry) => renderEntry(entry, previous.idQuery)).join('')}</ul>`;
  }
  root.innerHTML = `<section class="water-screen" aria-labelledby="water-title">
    ${pageHeader('Tra cứu đồ uống', 'Tìm theo ID, một ngày hoặc khoảng ngày; kết quả được cộng tự động.')}
    <form id="water-search-form" class="water-card water-search-form">
      <fieldset><legend>Tìm theo</legend><div class="water-choice-row">
        <label><input type="radio" name="searchMode" value="id" ${previous.mode === 'id' ? 'checked' : ''}> ID</label>
        <label><input type="radio" name="searchMode" value="date" ${previous.mode === 'date' ? 'checked' : ''}> Ngày</label>
        <label><input type="radio" name="searchMode" value="range" ${previous.mode === 'range' ? 'checked' : ''}> Khoảng ngày</label>
      </div></fieldset>
      <label data-search-field="id" ${previous.mode !== 'id' ? 'hidden' : ''}>ID (có thể nhập nhiều ID, cách nhau bằng dấu phẩy)<input name="idQuery" value="${escapeHtml(previous.idQuery)}" placeholder="#WTR-001, WTR-002"></label>
      <label data-search-field="date" ${previous.mode !== 'date' ? 'hidden' : ''}>Chọn ngày<input name="date" type="date" value="${escapeHtml(previous.date)}"></label>
      <div class="water-date-range" data-search-field="range" ${previous.mode !== 'range' ? 'hidden' : ''}><label>Từ ngày<input name="startDate" type="date" value="${escapeHtml(previous.startDate)}"></label><label>Đến ngày<input name="endDate" type="date" value="${escapeHtml(previous.endDate)}"></label></div>
      <button class="water-primary-button" type="submit">⌕ Tìm kiếm</button>
    </form>
    <section class="water-card water-search-results" aria-live="polite">
      <div class="water-card-heading"><h2>Kết quả</h2>${results?.length ? '<button class="water-secondary-button" type="button" data-export-csv>Xuất CSV</button>' : ''}</div>
      ${resultList}
      ${results?.length ? `<div class="water-summary-grid"><div><span>Số lần ghi</span><strong>${results.length}</strong></div><div><span>Tổng lượng</span><strong>${formatMl(total)}</strong></div><div><span>Trung bình/lần</span><strong>${formatMl(avg)}</strong></div><div><span>So với mục tiêu đã chọn</span><strong>${target ? `${Math.min(100, Math.round(total / target * 100))}%` : '—'} · còn ${formatMl(Math.max(0, target - total))}</strong></div></div>` : ''}
    </section>
    <div class="water-actions"><button class="water-secondary-button" type="button" data-export-json>Tải sao lưu JSON</button><a class="water-primary-button" href="#/water/insights">Xem Insights</a></div>
  </section>${toastMarkup()}`;
}

function renderInsightsPage(root) {
  const state = getWaterState();
  const profile = state.profile;
  const target = getTargetMl(profile);
  const today = localDateKey();
  const insight = buildDailyInsights(state.entries, target, today);
  const week = getWeeklyTotals(state.entries, target);
  const good = insight.good.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const improve = insight.improve.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  root.innerHTML = `<section class="water-screen" aria-labelledby="water-title">
    ${pageHeader('Insights uống nước', 'Tóm tắt hoạt động ghi nhận, không phải phép đo y tế.')}
    <section class="water-card water-score-card">
      <div><p class="water-eyebrow">HOÀN THÀNH MỤC TIÊU NHẮC NHỞ HÔM NAY</p><h2>${insight.score} <span>/ 100</span></h2><p class="water-status ${insight.score >= 80 ? 'is-success' : insight.score >= 50 ? 'is-warning' : 'is-danger'}">${escapeHtml(insight.status)}</p></div>
      <div class="water-score-track" role="progressbar" aria-label="Tỷ lệ lượng đã ghi trên mục tiêu nhắc nhở" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${insight.score}"><span style="width:${insight.score}%"></span></div>
      <p>Đã ghi ${formatMl(insight.totalMl)} trên mục tiêu tuỳ chọn ${formatMl(target)}. Điểm này chỉ là tỷ lệ hoàn thành mục tiêu trong ứng dụng, không xác định tình trạng đủ/thiếu nước của cơ thể.</p>
    </section>
    <div class="water-insights-grid">
      <section class="water-card"><h2>Điểm tích cực</h2><ul class="water-insight-list is-good">${good}</ul></section>
      <section class="water-card"><h2>Có thể lưu ý</h2><ul class="water-insight-list is-caution">${improve}</ul></section>
    </div>
    <section class="water-card"><div class="water-card-heading"><div><p class="water-eyebrow">GỢI Ý TỪ QUY TẮC CỤC BỘ</p><h2>Hành động nhẹ nhàng</h2></div><span class="water-badge">Không gửi dữ liệu ra ngoài</span></div>
      <p>${escapeHtml(insight.recommendation)}</p>
      <button type="button" class="water-secondary-button" data-reminders>♧ Bật nhắc nhở mỗi 90 phút</button>
      <p class="water-muted">Thông báo chỉ chạy khi trang còn mở; trình duyệt sẽ xin quyền riêng. Nội dung nhắc không kèm số ml bắt buộc.</p>
      <p class="water-toast" data-reminder-status role="status" aria-live="polite"></p>
    </section>
    <section class="water-card"><div class="water-card-heading"><div><p class="water-eyebrow">7 NGÀY GẦN NHẤT</p><h2>Đồ uống đã ghi nhận</h2></div></div><div data-weekly-chart class="water-chart-wrap"><p class="water-muted">Đang tải biểu đồ…</p></div><ul class="water-week-list">${week.map((day) => `<li><span>${escapeHtml(formatDate(day.date, { weekday: 'short', day: '2-digit', month: '2-digit' }))}</span><strong>${formatMl(day.totalMl)}</strong><span>${day.totalMl >= target ? 'Đạt mục tiêu đã đặt' : `còn ${formatMl(Math.max(0, target - day.totalMl))}`}</span></li>`).join('')}</ul></section>
    <section class="water-card"><h2>Thiết lập mục tiêu nhắc nhở</h2>
      <form id="water-profile-form" class="water-form-grid water-profile-form">
        <label>Mục tiêu tuỳ chỉnh<input name="goalMl" type="number" min="250" max="10000" step="50" value="${escapeHtml(profile.goalMl)}"> <span class="water-muted">ml/ngày</span></label>
        <label class="water-check"><input name="useFormula" type="checkbox" ${profile.useFormula ? 'checked' : ''}> Dùng ước tính tham khảo trong demo</label>
        <label>Nhóm công thức<select name="sex"><option value="">Không chọn</option><option value="female" ${profile.sex === 'female' ? 'selected' : ''}>Nữ</option><option value="male" ${profile.sex === 'male' ? 'selected' : ''}>Nam</option></select></label>
        <label>Cân nặng<input name="weightKg" type="number" min="20" max="300" step="0.1" value="${escapeHtml(profile.weightKg)}" placeholder="kg"> <span class="water-muted">kg</span></label>
        <label>Vận động mỗi ngày<input name="activityMinutes" type="number" min="0" max="600" step="5" value="${escapeHtml(profile.activityMinutes)}"> <span class="water-muted">phút</span></label>
        <label class="water-check"><input name="hotWeather" type="checkbox" ${profile.hotWeather ? 'checked' : ''}> Ngày nóng trên 32°C</label>
        <label class="water-check"><input name="pregnancyOrBreastfeeding" type="checkbox" ${profile.pregnancyOrBreastfeeding ? 'checked' : ''}> Đang mang thai/cho con bú</label>
        <button class="water-primary-button" type="submit">Lưu thiết lập</button>
      </form>
      <p class="water-disclaimer">Công thức theo cân nặng và các phần cộng thêm ở đây chỉ là mô hình demo do người dùng tự chọn, chưa phải khuyến cáo y tế. Nhu cầu thay đổi theo tuổi, sức khoẻ, thuốc, thai kỳ, vận động và khí hậu. Người có bệnh thận/tim, giới hạn dịch hoặc đang điều trị cần hỏi nhân viên y tế trước khi đặt mục tiêu.</p>
    </section>
    <section class="water-card water-sources"><h2>Cơ sở tham khảo</h2><ul>
      <li><a href="https://www.nationalacademies.org/read/10925/chapter/2" target="_blank" rel="noopener noreferrer">National Academies — Dietary Reference Intakes for Water</a>: AI 3,7 L (nam) và 2,7 L (nữ) là tổng nước từ đồ uống và thực phẩm ở người trưởng thành trẻ; không phải lượng nước lọc bắt buộc.</li>
      <li><a href="https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html" target="_blank" rel="noopener noreferrer">CDC — About Water and Healthier Drinks</a>: nhu cầu thay đổi theo tuổi, giới, thai kỳ/cho con bú, hoạt động và môi trường.</li>
      <li><a href="https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/water/art-20044256" target="_blank" rel="noopener noreferrer">Mayo Clinic — Water: How much should you drink every day?</a>: lượng phù hợp phụ thuộc cơ thể, hoạt động và môi trường.</li>
      <li><a href="https://www.vinmec.com/vie/bai-viet/uong-nuoc-bao-nhieu-la-du-vi" target="_blank" rel="noopener noreferrer">Vinmec — Uống nước: Bao nhiêu là đủ?</a>: tổng lượng có thể đến từ nhiều đồ uống và thực phẩm.</li>
    </ul><p class="water-disclaimer">Bản demo không chẩn đoán mất nước, không đưa lời khuyên điều trị và không gửi dữ liệu nhật ký tới AI/dịch vụ bên ngoài.</p></section>
  </section>${toastMarkup()}`;
  void import('./chart.js').then(({ renderWeeklyChart }) => {
    const chart = root.querySelector('[data-weekly-chart]');
    if (chart) renderWeeklyChart(chart, week);
  });
}

function toastMarkup() {
  return '<div class="water-toast" data-water-toast role="status" aria-live="polite" aria-atomic="true"></div>';
}

function showToast(root, text, isError = false) {
  const toast = root.querySelector('[data-water-toast]');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('is-visible'), 3800);
}

function showRoute(root) {
  const route = routeName(root);
  const routes = {
    '/water': renderDashboard,
    '/water/add': renderAddForm,
    '/water/search': renderSearchPage,
    '/water/insights': renderInsightsPage,
  };
  const render = routes[route] || renderDashboard;
  const title = route === '/water/add' ? 'Nhập đồ uống' : route === '/water/search' ? 'Tra cứu đồ uống' : route === '/water/insights' ? 'Insights uống nước' : 'Water Intake Insights';
  document.title = `${title} | BlogCo`;
  render(root);
  if (pendingToast) {
    const message = pendingToast;
    pendingToast = '';
    showToast(root, message);
  }
  const heading = root.querySelector('h1[tabindex="-1"]');
  if (heading) heading.focus({ preventScroll: true });
}

function readSearchForm(form) {
  const data = new FormData(form);
  const mode = data.get('searchMode') || 'id';
  const filters = {
    mode,
    idQuery: String(data.get('idQuery') || ''),
    date: String(data.get('date') || ''),
    startDate: String(data.get('startDate') || ''),
    endDate: String(data.get('endDate') || ''),
  };
  const entries = searchWaterEntries(getWaterState().entries, filters);
  searchState = { ...filters, entries };
}

function enableReminders(root) {
  const status = root.querySelector('[data-reminder-status]');
  if (!('Notification' in window)) {
    if (status) status.textContent = 'Thông báo trình duyệt không khả dụng.';
    return;
  }
  const requestPermission = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
  requestPermission.then((permission) => {
    if (permission !== 'granted') {
      if (status) status.textContent = 'Bạn chưa cấp quyền thông báo; có thể bật lại trong cài đặt trình duyệt.';
      return;
    }
    clearInterval(reminderTimer);
    reminderTimer = setInterval(() => {
      if (!document.hidden) new Notification('Nhắc nhẹ từ BlogCo', { body: 'Nếu bạn thấy phù hợp, hãy ghi lại đồ uống hoặc uống theo nhu cầu cá nhân.' });
    }, 90 * 60 * 1000);
    if (status) status.textContent = 'Đã bật nhắc mỗi 90 phút khi trang đang mở.';
  }).catch(() => {
    if (status) status.textContent = 'Không thể bật thông báo trên trình duyệt này.';
  });
}

export function mountWaterApp(root) {
  if (!root) return;
  if (mountedRoots.has(root)) {
    showRoute(root);
    return;
  }
  mountedRoots.add(root);
  root.addEventListener('click', (event) => {
    const amountButton = event.target.closest('[data-amount]');
    if (amountButton) {
      const amount = root.querySelector('#water-amount');
      const preview = root.querySelector('[data-preview-amount]');
      if (amount) amount.value = amountButton.dataset.amount;
      if (preview) preview.textContent = amountButton.dataset.amount;
    }
    const deleteButton = event.target.closest('[data-delete-entry]');
    if (deleteButton) {
      const id = deleteButton.dataset.deleteEntry;
      if (window.confirm(`Xoá bản ghi ${id} khỏi thiết bị này?`)) {
        removeWaterEntry(id);
        showRoute(root);
        showToast(root, `Đã xoá ${id}.`);
      }
    }
    if (event.target.closest('[data-export-json]')) downloadJsonBackup();
    if (event.target.closest('[data-export-csv]')) downloadCsv(searchState?.entries || []);
    if (event.target.closest('[data-reminders]')) enableReminders(root);
    const ripple = event.target.closest('.water-ripple');
    if (ripple) {
      ripple.classList.remove('is-rippling');
      void ripple.offsetWidth;
      ripple.classList.add('is-rippling');
      setTimeout(() => ripple.classList.remove('is-rippling'), 550);
    }
  });
  root.addEventListener('change', (event) => {
    if (event.target.name === 'drinkType') {
      const custom = root.querySelector('#water-custom-drink-wrap');
      if (custom) custom.hidden = event.target.value !== 'other';
    }
    if (event.target.name === 'searchMode') {
      root.querySelectorAll('[data-search-field]').forEach((field) => {
        field.hidden = field.dataset.searchField !== event.target.value;
      });
    }
    if (event.target.id === 'water-amount') {
      const preview = root.querySelector('[data-preview-amount]');
      if (preview) preview.textContent = event.target.value || '0';
    }
  });
  root.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      if (form.id === 'water-entry-form') {
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        const entry = addWaterEntry(Object.fromEntries(data.entries()));
        pendingToast = `Đã lưu ${entry.id} · ${entry.amountMl} ml lúc ${entry.time}.`;
        searchState = null;
        location.hash = '#/water';
        if (routeName(root) === '/water') showRoute(root);
      } else if (form.id === 'water-search-form') {
        readSearchForm(form);
        showRoute(root);
      } else if (form.id === 'water-profile-form') {
        const data = new FormData(form);
        saveWaterProfile(Object.fromEntries(data.entries()));
        showRoute(root);
        showToast(root, 'Đã lưu mục tiêu trên thiết bị này.');
      }
    } catch (error) {
      showToast(root, error.message || 'Không lưu được dữ liệu.', true);
    }
  });
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/water')) {
      searchState = null;
      showRoute(root);
    }
  });
  window.addEventListener('water:data-changed', () => showRoute(root));
  showRoute(root);
}
