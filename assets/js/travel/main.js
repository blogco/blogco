import { deleteTrip, duplicateTrip, exportTrips, findTrip, importTrips, listTrips, readRateCache, saveTrip, writeRateCache } from './store.js';
import { BUDGET_ITEMS, CURRENCIES, buildTrip, buildTripRequest, convertVnd, displayDate, fetchRates, formatVndInput, money, sumBudget, validateBudgetVnd } from './planner.js';

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const formatVnd = (amount) => money(amount, 'VND');
let rates = null;
let rateStatus = '';
let currentTrip = null;
let mounted;
let rateLoading = false;
let rateAttempted = false;
let tripCreating = false;

function route() { return decodeURIComponent(location.hash.replace(/^#/, '') || '/travel'); }
function link(path, label, active = '') { return `<a class="travel-tab${active === path ? ' is-active' : ''}" href="#${path}">${label}</a>`; }
function tabs(active) { return `<nav class="travel-tabs" aria-label="Travel Studio">${link('/travel', 'Tổng quan', active)}${link('/travel/planner', 'Lập kế hoạch', active)}${link('/travel/itinerary', 'Lịch trình', active)}${link('/travel/trips', 'Chuyến đã lưu', active)}</nav>`; }
function shell(title, description, active, body) {
  return `<main class="travel-shell"><header class="travel-header"><div><p class="travel-eyebrow">BLOGCO · TRAVEL STUDIO</p><h1>${title}</h1><p>${description}</p></div><a class="travel-button travel-button--quiet" href="#/travel/planner">+ Tạo chuyến đi</a></header>${tabs(active)}${body}<p class="travel-private-note">Dữ liệu chuyến đi được lưu trên thiết bị này; chưa đồng bộ giữa các thiết bị.</p></main>`;
}

function overview() {
  const trips = listTrips();
  const recent = trips.slice(0, 3);
  return shell('Travel Studio', 'Lên kế hoạch chuyến đi, theo dõi ngân sách và chuẩn bị lịch trình có thể in.', '/travel', `<section class="travel-hero"><div><span class="travel-kicker">KẾ HOẠCH CỦA BẠN</span><h2>Du lịch có kế hoạch,<br>ngân sách rõ ràng.</h2><p>Bắt đầu với điểm đến, số ngày và ngân sách. Mọi chi phí ban đầu đều được đánh dấu là ước tính — không có đặt chỗ hay dữ liệu du lịch giả.</p><a class="travel-button" href="#/travel/planner">Bắt đầu lập kế hoạch <span aria-hidden="true">→</span></a></div><div class="travel-hero-art" aria-hidden="true"><svg viewBox="0 0 280 190" fill="none"><path d="M31 145 237 50M31 145l60 9 146-104-76 155-20-51-110-9Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="205" cy="50" r="29" stroke="currentColor" stroke-width="2"/><path d="M204 36v15l10 6M34 37h58M50 22h32M188 146h58" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div></section><section class="travel-section"><div class="travel-section-head"><div><h2>Chuyến đi gần đây</h2><p>${trips.length} chuyến đang lưu trên thiết bị</p></div><a href="#/travel/trips">Xem tất cả →</a></div>${recent.length ? `<div class="travel-trip-grid">${recent.map(tripCard).join('')}</div>` : `<div class="travel-empty"><div class="travel-empty-icon" aria-hidden="true">＋</div><h3>Chưa có chuyến đi nào</h3><p>Tạo lịch trình đầu tiên — có thể bắt đầu chỉ với ba thông tin cơ bản.</p><a class="travel-button travel-button--outline" href="#/travel/planner">Tạo chuyến đi</a></div>`}</section><section class="travel-note"><strong>Thông tin minh bạch</strong><span>Không có kết nối AI trong site tĩnh hiện tại. Lịch trình do bạn nhập; tỷ giá lấy từ nguồn tham chiếu miễn phí nếu truy cập được. Có thể in thành PDF qua hộp thoại in của trình duyệt.</span></section>`);
}

function tripCard(trip) {
  const date = trip.startDate ? `${displayDate(trip.startDate)} – ${displayDate(trip.endDate)}` : `${trip.daysCount} ngày · Chưa chốt ngày`;
  return `<a class="travel-trip-card" href="#/travel/trips/${encodeURIComponent(trip.id)}"><span class="travel-trip-card__icon" aria-hidden="true">⌁</span><span class="travel-trip-card__title">${esc(trip.title || trip.destination)}</span><span class="travel-trip-card__meta">${esc(date)} · ${trip.travelers || 1} khách</span><strong>${formatVnd(trip.budgetVnd)}</strong></a>`;
}

function plannerForm() {
  return shell('Lập kế hoạch chuyến đi', 'Tạo bản nháp có ngân sách VND gốc không đổi và lịch trình dễ chỉnh sửa.', '/travel/planner', `<form class="travel-form" data-trip-create novalidate><div class="travel-form-intro"><span class="travel-step">01</span><div><h2>Thông tin chuyến đi</h2><p>Chỉ cần điền ba trường bắt buộc để bắt đầu.</p></div></div><div class="travel-form-grid"><label class="travel-field travel-field--wide">Điểm đến <span>*</span><input name="destination" required maxlength="100" placeholder="Ví dụ: Seoul, Hàn Quốc" autocomplete="country-name" aria-describedby="destination-error"><small class="travel-field-error" data-field-error="destination" id="destination-error"></small></label><label class="travel-field">Thời lượng (ngày) <span>*</span><input name="days" type="number" min="1" max="90" step="1" value="5" required aria-describedby="days-error"><small class="travel-field-error" data-field-error="days" id="days-error"></small></label><label class="travel-field">Tổng ngân sách (VND) <span>*</span><input name="budgetVnd" inputmode="numeric" type="text" autocomplete="off" placeholder="20.000.000 ₫" required aria-describedby="budget-error"><small class="travel-field-error" data-field-error="budgetVnd" id="budget-error"></small></label><label class="travel-field">Thành phố khởi hành<input name="departureCity" placeholder="Ví dụ: TP. Hồ Chí Minh"></label><label class="travel-field">Ngày khởi hành (tuỳ chọn)<input name="startDate" type="date" lang="vi" aria-describedby="startDate-error"><small class="travel-field-error" data-field-error="startDate" id="startDate-error"></small></label><label class="travel-field">Số hành khách<input name="travelers" type="number" min="1" max="30" value="1"></label><label class="travel-field">Mục đích chuyến đi<select name="purpose"><option value="Du lịch">Du lịch</option><option value="Thăm thân">Thăm thân</option><option value="Công tác">Công tác</option><option value="Khác">Khác</option></select></label><label class="travel-field">Tiền tệ địa phương<select name="currency"><option value="">Tự nhận diện từ điểm đến</option>${Object.entries(CURRENCIES).map(([code, name]) => `<option value="${code}">${code} · ${name}</option>`).join('')}</select></label><label class="travel-field travel-field--wide">Địa điểm muốn ghé thăm (tuỳ chọn)<input name="places" placeholder="Nhập các địa điểm bạn đã xác minh"></label></div><label class="travel-check"><input type="checkbox" name="visaMode"> Tạo lịch trình hỗ trợ hồ sơ visa (bản đề xuất, không phải xác nhận đặt chỗ)</label><p class="travel-form-error" data-form-error role="alert" aria-live="polite"></p><button class="travel-button" type="submit" data-create-button>Tạo kế hoạch du lịch <span aria-hidden="true">→</span></button></form><aside class="travel-note"><strong>Ước tính, không phải báo giá</strong><span>Ngân sách được chia thành các nhóm tham khảo. Bạn có thể sửa từng nhóm sau khi tạo; vé và khách sạn không được đánh dấu là đã đặt.</span></aside>`);
}

function rateMarkup(trip, conversions) {
  if (!trip.currency) return `<p class="travel-muted">Chưa nhận diện tiền tệ điểm đến. Chọn mã tiền tệ để quy đổi.</p>`;
  const exchange = trip.exchange || rates;
  const info = exchange ? `<p class="travel-rate-source">${esc(exchange.source)} · ngày tỷ giá ${esc(exchange.rateDate || 'không nêu')} · lấy lúc ${esc(new Date(exchange.retrievedAt).toLocaleString('vi-VN'))}</p>` : `<p class="travel-rate-source">${esc(rateStatus || 'Chưa có tỷ giá khả dụng. Không hiển thị số quy đổi giả.')}</p>`;
  return `<div class="travel-currency-grid"><div><span>Ngân sách gốc</span><strong>${formatVnd(trip.budgetVnd)}</strong></div>${conversions ? `<div><span>Tương đương USD</span><strong>${money(conversions.usd, 'USD')}</strong></div><div><span>${esc(trip.currency)} tham khảo</span><strong>${money(conversions.local, trip.currency)}</strong></div>` : `<div><span>Quy đổi USD / ${esc(trip.currency)}</span><strong>Chưa có dữ liệu</strong></div>`}<div><span>Mỗi ngày · mỗi người</span><strong>${formatVnd(trip.budgetVnd / trip.daysCount / trip.travelers)}</strong></div></div>${info}<div class="travel-rate-actions"><button class="travel-button travel-button--small travel-button--outline" type="button" data-refresh-rate>↻ Cập nhật tỷ giá</button><button class="travel-text-button" type="button" data-manual-rate-toggle>Nhập tỷ giá thủ công</button></div><form class="travel-manual-rate" data-manual-rate hidden><label>1 USD = <input type="number" name="usdVnd" min="1" step="1" placeholder="VND"></label><label>1 USD = <input type="number" name="usdLocal" min="0.0001" step="any" placeholder="${esc(trip.currency)}"></label><button class="travel-button travel-button--small" type="submit">Lưu tỷ giá</button></form>`;
}

function budgetRows(trip) {
  return `${trip.budget.map((item, index) => `<div class="travel-budget-row"><label for="budget-${index}">${esc(item.label)}</label><label class="travel-budget-input"><span>Dự kiến</span><input id="budget-${index}" type="number" min="0" step="1000" value="${Number(item.estimateVnd) || 0}" data-budget-index="${index}"></label><label class="travel-budget-input"><span>Đã xác nhận</span><input type="number" min="0" step="1000" value="${Number(item.confirmedVnd) || 0}" data-budget-confirmed="${index}"></label><small>VND</small></div>`).join('')}<p class="travel-confirmed-total">Tổng chi phí đã xác nhận: <strong data-confirmed-total>${formatVnd(sumBudget(trip.budget, 'confirmedVnd'))}</strong></p>`;
}

function tripDetail(trip) {
  currentTrip = trip;
  const active = route().includes('/itinerary') ? '/travel/itinerary' : '/travel/planner';
  const converted = convertVnd(trip.budgetVnd, trip.exchange || rates, trip.currency);
  const planned = sumBudget(trip.budget);
  return shell(esc(trip.destination), `${trip.daysCount} ngày${trip.startDate ? ` · ${displayDate(trip.startDate)} – ${displayDate(trip.endDate)}` : ' · Ngày đi chưa xác định'} · ${trip.travelers} khách`, active, `<div class="travel-detail-actions"><a class="travel-button travel-button--outline travel-button--small" href="#/travel/trips">← Chuyến đã lưu</a><button class="travel-button travel-button--outline travel-button--small" type="button" data-export-json>Xuất JSON</button><button class="travel-button travel-button--outline travel-button--small" type="button" data-duplicate>Nhân bản</button><button class="travel-button travel-button--small" type="button" data-print>In / lưu PDF</button><button class="travel-text-button travel-delete" type="button" data-delete> Xoá chuyến</button></div><section class="travel-section travel-section--bordered"><div class="travel-section-head"><div><h2>Ngân sách & quy đổi</h2><p>Ngân sách VND gốc được giữ nguyên khi tỷ giá thay đổi.</p></div><span class="travel-status">BẢN NHÁP · ƯỚC TÍNH</span></div>${rateMarkup(trip, converted)}</section><div class="travel-detail-grid"><section class="travel-section travel-section--bordered"><div class="travel-section-head"><div><h2>Phân bổ ngân sách</h2><p>Tổng phân bổ hiện tại <strong data-budget-total>${formatVnd(planned)}</strong> / ${formatVnd(trip.budgetVnd)}</p></div></div><div class="travel-budget-list">${budgetRows(trip)}</div><p class="travel-budget-warning" data-budget-warning>${planned > trip.budgetVnd ? 'Phân bổ vượt ngân sách. Hãy điều chỉnh trước khi xác nhận kế hoạch.' : planned < trip.budgetVnd ? `Còn lại chưa phân bổ: ${formatVnd(trip.budgetVnd - planned)}.` : 'Phân bổ khớp ngân sách.'}</p></section><section class="travel-section travel-section--bordered travel-visa-panel"><div class="travel-section-head"><div><h2>${trip.visaMode ? 'Lịch trình visa' : 'Chuẩn bị hồ sơ'}</h2><p>Bản đề xuất; không thay thế hướng dẫn chính thức.</p></div></div><p>Định dạng gọn, có thể in bằng tiếng Việt hoặc tiếng Anh từ hộp thoại in.</p><label class="travel-field">Tên người nộp (tuỳ chọn)<input data-trip-field="applicantName" value="${esc(trip.applicantName || '')}" placeholder="Tên trên giấy tờ"></label><label class="travel-field">Quốc tịch (tuỳ chọn)<input data-trip-field="nationality" value="${esc(trip.nationality || '')}" placeholder="Ví dụ: Việt Nam"></label><label class="travel-field">Ngôn ngữ bản in<select data-trip-field="documentLanguage"><option value="vi" ${trip.documentLanguage !== 'en' && trip.documentLanguage !== 'ko' ? 'selected' : ''}>Tiếng Việt</option><option value="en" ${trip.documentLanguage === 'en' ? 'selected' : ''}>English</option><option value="ko" ${trip.documentLanguage === 'ko' ? 'selected' : ''}>한국어 · Korean</option></select></label><p class="travel-source-links">Tham khảo chính thức: <a href="${visaSource(trip.destination)}" target="_blank" rel="noopener">Cơ quan di trú / visa</a></p></section></div><section class="travel-section"><div class="travel-section-head"><div><h2>Lịch trình từng ngày</h2><p>Thêm các điểm đến đã tự kiểm tra; các gợi ý dưới đây không tự điền địa điểm.</p></div><button class="travel-button travel-button--outline travel-button--small" type="button" data-add-day>+ Thêm ngày</button></div><div class="travel-days">${trip.days.map(dayCard).join('')}</div></section><div class="travel-bottom-actions"><button class="travel-button" type="button" data-save> Lưu thay đổi</button><button class="travel-button travel-button--outline" type="button" data-print>In / lưu PDF</button><span data-save-status role="status" aria-live="polite"></span></div><p class="travel-disclaimer">Lịch trình này là kế hoạch đề xuất, không phải bằng chứng đặt vé hoặc khách sạn. Luôn kiểm tra yêu cầu visa mới nhất trên trang chính thức trước khi nộp.</p>${printDocument(trip, converted)}`);
}

function visaSource(destination) {
  const text = destination.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/my|usa|united states/.test(text)) return 'https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html';
  if (/uc|australia/.test(text)) return 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600';
  if (/han quoc|south korea|korea/.test(text)) return 'https://www.visa.go.kr/';
  if (/dai loan|taiwan/.test(text)) return 'https://www.boca.gov.tw/';
  return 'https://www.iatatravelcentre.com/';
}

function dayCard(day, index) {
  const slots = [['morning', 'Buổi sáng'], ['lunch', 'Ăn trưa'], ['afternoon', 'Buổi chiều'], ['dinner', 'Ăn tối'], ['evening', 'Buổi tối']];
  return `<details class="travel-day" ${index === 0 ? 'open' : ''}><summary><span class="travel-day-number">${String(day.day).padStart(2, '0')}</span><span><strong>Ngày ${day.day}${day.date ? ` · ${displayDate(day.date)}` : ''}</strong><small>${esc(day.city || 'Chưa chọn thành phố')} · ${esc(day.morning || day.afternoon || 'Chưa thêm hoạt động')}</small></span><span class="travel-day-state">${day.locked ? 'ĐÃ KHOÁ' : 'BẢN NHÁP'}</span></summary><div class="travel-day-fields"><label class="travel-field">Thành phố / khu vực<input data-day="${index}" data-key="city" value="${esc(day.city)}"></label><label class="travel-field">Di chuyển<input data-day="${index}" data-key="transport" value="${esc(day.transport)}" placeholder="Chưa xác định"></label>${slots.map(([key, label]) => `<label class="travel-field travel-field--wide">${label}<input data-day="${index}" data-key="${key}" value="${esc(day[key])}" placeholder="Nhập hoạt động hoặc để trống"></label>`).join('')}<label class="travel-field">Lưu trú<input data-day="${index}" data-key="accommodation" value="${esc(day.accommodation || 'Chưa đặt')}"></label><label class="travel-field">Chi phí dự kiến (VND)<input data-day="${index}" data-key="estimateVnd" type="number" min="0" value="${Number(day.estimateVnd) || 0}"></label><label class="travel-field travel-field--wide">Ghi chú<input data-day="${index}" data-key="notes" value="${esc(day.notes)}"></label><label class="travel-check"><input type="checkbox" data-day="${index}" data-key="locked" ${day.locked ? 'checked' : ''}> Khoá các hoạt động đã xác nhận</label></div></details>`;
}

function printDocument(trip, converted) {
  const labels = trip.documentLanguage === 'en'
    ? { title: 'Proposed Travel Itinerary', summary: 'Travel Summary', date: 'Date', city: 'City', activities: 'Planned Activities', transport: 'Transportation', stay: 'Accommodation', warning: 'Proposed plan — not proof of booking.' }
    : trip.documentLanguage === 'ko'
      ? { title: '여행 일정 계획서', summary: '여행 요약', date: '날짜', city: '도시', activities: '예정 활동', transport: '교통', stay: '숙박', warning: '예정된 여행 계획이며 예약 증명서가 아닙니다.' }
      : { title: 'Lịch trình chuyến đi dự kiến', summary: 'Tóm tắt chuyến đi', date: 'Ngày', city: 'Thành phố', activities: 'Hoạt động dự kiến', transport: 'Di chuyển', stay: 'Lưu trú', warning: 'Kế hoạch dự kiến — không phải bằng chứng đặt chỗ.' };
  const dates = trip.startDate ? `${displayDate(trip.startDate)} – ${displayDate(trip.endDate)}` : `${trip.daysCount} ngày · ngày cụ thể chưa xác định`;
  const budget = converted ? `${formatVnd(trip.budgetVnd)} · ${money(converted.usd, 'USD')} · ${money(converted.local, trip.currency)}` : formatVnd(trip.budgetVnd);
  return `<article class="travel-print-document"><h1>${labels.title}</h1><p>${labels.warning}</p><h2>${labels.summary}</h2><dl><dt>Người nộp / Applicant</dt><dd>${esc(trip.applicantName || '—')}</dd><dt>Quốc tịch / Nationality</dt><dd>${esc(trip.nationality || '—')}</dd><dt>Điểm đến / Destination</dt><dd>${esc(trip.destination)}</dd><dt>Ngày đi / Travel dates</dt><dd>${esc(dates)}</dd><dt>Hành khách / Travelers</dt><dd>${trip.travelers}</dd><dt>Ngân sách dự kiến / Estimated budget</dt><dd>${budget}</dd></dl><h2>Ngân sách dự kiến / Estimated Budget</h2><table><thead><tr><th>Khoản mục</th><th>Ước tính (VND)</th><th>Trạng thái</th></tr></thead><tbody>${trip.budget.map((item) => `<tr><td>${esc(item.label)}</td><td>${formatVnd(item.estimateVnd)}</td><td>${item.status === 'confirmed' ? 'Đã xác nhận' : 'Ước tính'}</td></tr>`).join('')}</tbody><tfoot><tr><th>Tổng ngân sách</th><th>${formatVnd(trip.budgetVnd)}</th><th>${trip.exchange?.rateDate ? `Tỷ giá ${esc(trip.exchange.rateDate)}` : 'Chưa có tỷ giá'}</th></tr></tfoot></table><h2>Lịch trình từng ngày</h2><table><thead><tr><th>${labels.date}</th><th>${labels.city}</th><th>${labels.activities}</th><th>${labels.transport}</th><th>${labels.stay}</th></tr></thead><tbody>${trip.days.map((day) => `<tr><td>${day.date ? displayDate(day.date) : `Ngày ${day.day}`}</td><td>${esc(day.city || trip.destination)}</td><td>${[['Sáng', day.morning], ['Trưa', day.lunch], ['Chiều', day.afternoon], ['Tối', day.dinner], ['Buổi tối', day.evening]].filter(([, value]) => value).map(([label, value]) => `<strong>${label}:</strong> ${esc(value)}`).join('<br>') || 'Chưa có hoạt động cụ thể'}</td><td>${esc(day.transport || 'Chưa xác định')}</td><td>${esc(day.accommodation || 'Chưa đặt')}</td></tr>`).join('')}</tbody></table><p>${labels.warning} Không tạo thông tin chuyến bay, khách sạn hay xác nhận đặt chỗ. Hãy xác minh yêu cầu hiện hành tại nguồn chính thức.</p></article>`;
}

function tripsList() {
  const trips = listTrips();
  return shell('Chuyến đi đã lưu', 'Các kế hoạch được lưu riêng trên trình duyệt này.', '/travel/trips', `${trips.length ? `<div class="travel-trip-grid">${trips.map(tripCard).join('')}</div>` : `<div class="travel-empty"><h2>Chưa có chuyến đi</h2><p>Tạo kế hoạch đầu tiên để lưu tại đây.</p><a class="travel-button" href="#/travel/planner">Tạo chuyến đi</a></div>`}<div class="travel-import-export"><button type="button" class="travel-button travel-button--outline travel-button--small" data-export-all>Xuất dữ liệu chuyến đi (JSON)</button><label class="travel-button travel-button--outline travel-button--small">Nhập bản sao lưu<input type="file" accept="application/json,.json" data-import-trips hidden></label></div>`);
}

function render(root) {
  const path = route();
  if (path === '/travel/planner') root.innerHTML = plannerForm();
  else if (path === '/travel/trips') root.innerHTML = tripsList();
  else if (path.startsWith('/travel/trips/')) {
    const trip = findTrip(path.split('/')[3]);
    root.innerHTML = trip ? tripDetail(trip) : shell('Không tìm thấy chuyến đi', 'Có thể chuyến này đã bị xoá khỏi trình duyệt.', '/travel/trips', `<a class="travel-button" href="#/travel/trips">Về danh sách chuyến đi</a>`);
    currentTrip = trip;
  } else if (path === '/travel/itinerary') {
    const trip = currentTrip || listTrips()[0];
    root.innerHTML = trip ? tripDetail(trip) : shell('Lịch trình', 'Hãy tạo hoặc mở một chuyến đi để bắt đầu.', '/travel/itinerary', `<a class="travel-button" href="#/travel/planner">Tạo chuyến đi</a>`);
  } else root.innerHTML = overview();
  if ((path.startsWith('/travel/trips/') || path === '/travel/itinerary') && currentTrip && !rates && !currentTrip.exchange && !rateLoading && !rateAttempted) void refreshRates();
}

function collectTrip(root) {
  if (!currentTrip) return null;
  const trip = structuredClone(currentTrip);
  root.querySelectorAll('[data-day][data-key]').forEach((input) => {
    const day = trip.days[Number(input.dataset.day)];
    if (!day) return;
    day[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Math.max(0, Number(input.value) || 0) : input.value;
  });
  root.querySelectorAll('[data-budget-index]').forEach((input) => {
    const item = trip.budget[Number(input.dataset.budgetIndex)];
    if (item) item.estimateVnd = Math.max(0, Number(input.value) || 0);
  });
  root.querySelectorAll('[data-budget-confirmed]').forEach((input) => {
    const item = trip.budget[Number(input.dataset.budgetConfirmed)];
    if (item) item.confirmedVnd = Math.max(0, Number(input.value) || 0);
  });
  root.querySelectorAll('[data-trip-field]').forEach((input) => { trip[input.dataset.tripField] = input.value; });
  return trip;
}

function updateBudgetTotal(root) {
  const total = [...root.querySelectorAll('[data-budget-index]')].reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
  const output = root.querySelector('[data-budget-total]');
  const confirmedOutput = root.querySelector('[data-confirmed-total]');
  const confirmed = [...root.querySelectorAll('[data-budget-confirmed]')].reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
  const warning = root.querySelector('[data-budget-warning]');
  if (output) output.textContent = formatVnd(total);
  if (confirmedOutput) confirmedOutput.textContent = formatVnd(confirmed);
  if (warning) warning.textContent = total > currentTrip.budgetVnd ? 'Phân bổ vượt ngân sách. Hãy điều chỉnh trước khi xác nhận kế hoạch.' : total < currentTrip.budgetVnd ? `Còn lại chưa phân bổ: ${formatVnd(currentTrip.budgetVnd - total)}.` : 'Phân bổ khớp ngân sách.';
}

async function refreshRates() {
  if (rateLoading) return;
  rateLoading = true;
  rateAttempted = true;
  rateStatus = 'Đang lấy tỷ giá tham chiếu…';
  try {
    rates = await fetchRates();
    writeRateCache(rates);
    rateStatus = '';
  } catch (error) {
    rates = readRateCache();
    rateStatus = rates ? `Không kết nối được nguồn. Đang dùng tỷ giá lưu ngày ${rates.rateDate || 'không rõ'} (cache).` : `${error.message} Bạn có thể nhập tỷ giá thủ công.`;
  }
  rateLoading = false;
  if (currentTrip) {
    const latest = mounted?.querySelector('[data-budget-index]') ? collectTrip(mounted) : findTrip(currentTrip.id) || currentTrip;
    currentTrip = saveTrip({ ...latest, exchange: rates ? { ...rates } : null });
  }
  render(mounted);
}

function setManualRates(form) {
  const usdVnd = Number(form.elements.usdVnd.value);
  const usdLocal = Number(form.elements.usdLocal.value);
  if (!(usdVnd > 0) || !(usdLocal > 0)) return;
  const currency = currentTrip?.currency;
  if (!currency) return;
  rates = { USD: { VND: usdVnd, [currency]: usdLocal }, source: 'Người dùng nhập thủ công', retrievedAt: new Date().toISOString(), rateDate: new Date().toISOString().slice(0, 10), manual: true };
  writeRateCache(rates);
  const latest = mounted?.querySelector('[data-budget-index]') ? collectTrip(mounted) : currentTrip;
  currentTrip = saveTrip({ ...latest, exchange: rates });
  render(mounted);
}

function downloadJson(filename, data) {
  const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(href);
}

function bind(root) {
  root.addEventListener('submit', async (event) => {
    const form = event.target;
    if (form.matches('[data-trip-create]')) {
      event.preventDefault();
      if (tripCreating) return;
      const values = Object.fromEntries(new FormData(form));
      const errors = { destination: !String(values.destination || '').trim() ? 'Vui lòng nhập điểm đến.' : '', days: !/^\d+$/.test(String(values.days || '')) || Number(values.days) < 1 || Number(values.days) > 90 ? 'Thời lượng phải từ 1 đến 90 ngày.' : '', budgetVnd: validateBudgetVnd(values.budgetVnd).error, startDate: '' };
      if (values.startDate && !validIsoDate(values.startDate)) errors.startDate = 'Vui lòng chọn ngày khởi hành hợp lệ.';
      Object.entries(errors).forEach(([name, message]) => {
        const field = form.elements.namedItem(name);
        const output = form.querySelector(`[data-field-error="${name}"]`);
        if (output) output.textContent = message;
        field?.setAttribute('aria-invalid', String(Boolean(message)));
      });
      const firstInvalid = Object.keys(errors).find((name) => errors[name]);
      if (firstInvalid) { form.elements.namedItem(firstInvalid)?.focus(); return; }
      try {
        tripCreating = true;
        const button = form.querySelector('[data-create-button]');
        const errorOutput = form.querySelector('[data-form-error]');
        if (button) { button.disabled = true; button.textContent = 'Đang lập kế hoạch...'; }
        if (errorOutput) errorOutput.textContent = '';
        const request = buildTripRequest(values);
        await new Promise((resolve) => window.setTimeout(resolve, 60));
        const trip = buildTrip({ ...request, visaMode: form.elements.visaMode.checked });
        if (rates) trip.exchange = rates;
        currentTrip = saveTrip(trip);
        location.hash = `#/travel/trips/${encodeURIComponent(trip.id)}`;
      } catch (error) {
        console.error('Travel plan generation failed:', error);
        const output = form.querySelector('[data-form-error]');
        if (output) output.textContent = error?.message || 'Không thể tạo kế hoạch. Vui lòng thử lại.';
        const button = form.querySelector('[data-create-button]');
        if (button) { button.disabled = false; button.textContent = 'Thử lại tạo kế hoạch'; }
      } finally {
        tripCreating = false;
        const button = form.querySelector('[data-create-button]');
        if (button && location.hash.includes('/planner') && !button.disabled) button.textContent = 'Tạo kế hoạch du lịch';
      }
    }
    if (form.matches('[data-manual-rate]')) { event.preventDefault(); setManualRates(form); }
  });
  root.addEventListener('input', (event) => { if (event.target.matches('[data-budget-index], [data-budget-confirmed]')) updateBudgetTotal(root); });
  root.addEventListener('input', (event) => {
    const name = event.target.name;
    if (!['destination', 'days', 'budgetVnd', 'startDate'].includes(name)) return;
    const output = root.querySelector(`[data-field-error="${name}"]`);
    const blank = !String(event.target.value || '').trim();
    const valid = name === 'destination' ? !blank
      : name === 'days' ? /^\d+$/.test(event.target.value) && Number(event.target.value) >= 1 && Number(event.target.value) <= 90
        : name === 'budgetVnd' ? validateBudgetVnd(event.target.value).valid
          : blank || validIsoDate(event.target.value);
    if (valid) { event.target.setAttribute('aria-invalid', 'false'); if (output) output.textContent = ''; }
  });
  root.addEventListener('focusout', (event) => {
    if (!event.target.matches('[name="budgetVnd"]')) return;
    const result = validateBudgetVnd(event.target.value);
    if (result.valid) event.target.value = formatVndInput(result.amount);
  });
  root.addEventListener('change', async (event) => {
    if (event.target.matches('[data-import-trips]') && event.target.files?.[0]) {
      try { const text = await event.target.files[0].text(); importTrips(text); render(root); }
      catch (error) { window.alert(error.message || 'Không đọc được tệp.'); }
    }
  });
  root.addEventListener('click', async (event) => {
    if (event.target.closest('[data-refresh-rate]')) { await refreshRates(); return; }
    if (event.target.closest('[data-manual-rate-toggle]')) { const form = root.querySelector('[data-manual-rate]'); form.hidden = !form.hidden; return; }
    if (event.target.closest('[data-save]')) {
      currentTrip = saveTrip(collectTrip(root));
      const status = root.querySelector('[data-save-status]'); if (status) status.textContent = 'Đã lưu trên thiết bị này.';
      return;
    }
    if (event.target.closest('[data-add-day]')) {
      currentTrip = collectTrip(root);
      currentTrip.days.push({ day: currentTrip.days.length + 1, date: currentTrip.startDate ? addDate(currentTrip.startDate, currentTrip.days.length) : '', city: currentTrip.destination, morning: '', lunch: '', afternoon: '', dinner: '', evening: '', transport: '', accommodation: 'Chưa đặt', estimateVnd: 0, notes: '', locked: false });
      currentTrip.daysCount = currentTrip.days.length;
      currentTrip.endDate = currentTrip.startDate ? currentTrip.days.at(-1).date : '';
      currentTrip = saveTrip(currentTrip); render(root); return;
    }
    if (event.target.closest('[data-print]')) { currentTrip = saveTrip(collectTrip(root)); render(root); document.body.classList.add('travel-printing'); window.print(); window.setTimeout(() => document.body.classList.remove('travel-printing'), 500); return; }
    if (event.target.closest('[data-delete]')) {
      if (!window.confirm('Xoá chuyến đi này khỏi thiết bị?')) return;
      deleteTrip(currentTrip.id); currentTrip = null; location.hash = '#/travel/trips'; return;
    }
    if (event.target.closest('[data-duplicate]')) { const copy = duplicateTrip(currentTrip.id); if (copy) location.hash = `#/travel/trips/${encodeURIComponent(copy.id)}`; return; }
    if (event.target.closest('[data-export-json]')) { currentTrip = collectTrip(root); saveTrip(currentTrip); downloadJson('blogco-travel-trip.json', JSON.stringify(currentTrip, null, 2)); return; }
    if (event.target.closest('[data-export-all]')) { downloadJson('blogco-travel-backup.json', exportTrips()); return; }
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('travel-printing'));
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDate(date, days) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

export function mountTravelApp(root) {
  if (root.dataset.travelMounted) { render(root); return; }
  root.dataset.travelMounted = 'true';
  mounted = root;
  rates = readRateCache();
  if (rates) rateStatus = rates.manual ? 'Tỷ giá thủ công đã lưu.' : `Tỷ giá lưu từ ${rates.rateDate || 'ngày không rõ'}.`;
  bind(root);
  render(root);
  window.addEventListener('hashchange', () => render(root));
}
