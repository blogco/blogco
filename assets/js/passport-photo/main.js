import { COUNTRIES, DOCUMENTS, getProfile, REQUIREMENTS_VERSION } from './requirements.js';
import visaDataset from './visa-guides.json';
import visaKnowledge from './visa-knowledge.json';
import { isStaleKnowledge, retrieveApprovedClaims } from './visa-knowledge.js';

const WASM_URL = `${import.meta.env.BASE_URL}assets/mediapipe/wasm`;
const MODEL_URL = `${import.meta.env.BASE_URL}assets/mediapipe/face_landmarker.task`;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let mountedRoot;
let boundRoot;
let detectorPromise;
let detector;
let detectorBackend = 'GPU';
let lastGpuError = null;
let jobId = 0;
let photo = null;
const visaProfile = { nationality: 'VN', residence: 'Việt Nam', stay: '', date: '', passport: 'Phổ thông', permits: '' };

function aspectFor(profile) {
  if (profile.digitalWidthPx && profile.digitalHeightPx) return profile.digitalWidthPx / profile.digitalHeightPx;
  if (profile.physicalWidthMm && profile.physicalHeightMm) return profile.physicalWidthMm / profile.physicalHeightMm;
  return 1;
}

function profileMeta(profile) {
  if (profile.verificationStatus !== 'verified') return '<span class="pp-status pp-status--unknown">Chưa xác minh tiêu chuẩn hiện hành. Vui lòng kiểm tra nguồn chính thức.</span>';
  const size = profile.physicalWidthMm ? `${profile.physicalWidthMm} × ${profile.physicalHeightMm} mm` : `${profile.digitalWidthPx} × ${profile.digitalHeightPx} px`;
  return `<span class="pp-status pp-status--verified">Có thông tin đã đối chiếu · ${escapeHtml(profile.lastVerifiedAt)}</span><p class="pp-profile-meta">${escapeHtml(profile.applicationChannel)} · ${size}</p>`;
}

function render(root) {
  const countryOptions = COUNTRIES.map(([code, label]) => `<option value="${code}">${escapeHtml(label)}</option>`).join('');
  const documentOptions = DOCUMENTS.map(({ id, label }) => `<option value="${id}">${label}</option>`).join('');
  root.innerHTML = `<main class="pp-shell"><header class="pp-header"><div><p class="pp-eyebrow">BLOGCO · PHOTO STUDIO</p><h1>Ảnh hộ chiếu & visa</h1><p>Tạo khung ảnh, kiểm tra một số tiêu chí kỹ thuật và xuất tệp ngay trên thiết bị.</p></div><span class="pp-private-badge"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>Ảnh không tải lên</span></header><nav class="pp-steps" aria-label="Các bước"><span class="is-current">01 <b>Yêu cầu</b></span><i></i><span>02 <b>Ảnh & căn khung</b></span><i></i><span>03 <b>Kiểm tra & tải</b></span></nav><div class="pp-layout"><section class="pp-controls"><div class="pp-card"><h2>1. Chọn giấy tờ</h2><label class="pp-field">Quốc gia / khu vực<select data-country><option value="">Chọn quốc gia</option>${countryOptions}</select></label><label class="pp-field">Loại giấy tờ<select data-document>${documentOptions}</select></label><div data-profile-meta class="pp-profile-meta">Chọn quốc gia và giấy tờ để xem thông tin tiêu chuẩn.</div><div data-source-link class="pp-source-link"></div></div><div class="pp-card"><h2>2. Tải hoặc chụp ảnh</h2><label class="pp-dropzone" data-dropzone><span class="pp-upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg></span><strong>Chọn ảnh hoặc chụp ngay</strong><span>JPG, PNG, WebP · tối đa 20 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="user" data-photo-input></label><p class="pp-muted">Ảnh được xử lý trong trình duyệt, không lưu vào Blogco. HEIC chưa được hỗ trợ trực tiếp — hãy xuất sang JPG trước.</p><button type="button" class="pp-text-button" data-delete-photo disabled>Xoá ảnh khỏi phiên này</button></div><div class="pp-card pp-card--privacy"><h3>Riêng tư & chỉnh sửa</h3><p>Ảnh và crop ở trong bộ nhớ trình duyệt. Không chỉnh da, khuôn mặt hay nền. Thư viện, model và dữ liệu ảnh đều được xử lý cục bộ trong trình duyệt; không gửi nội dung ảnh lên mạng.</p></div></section><section class="pp-preview"><div class="pp-preview-heading"><div><h2>Ảnh của bạn</h2><p data-photo-status aria-live="polite">Chọn tiêu chuẩn và tải ảnh để bắt đầu.</p><button type="button" class="pp-text-button" data-face-retry hidden>Thử nhận diện lại</button></div><button type="button" class="pp-icon-button" data-rotate aria-label="Xoay ảnh 90 độ" disabled>↻</button></div><div class="pp-comparison"><div class="pp-image-panel"><span>Ảnh gốc</span><div class="pp-image-frame"><img data-original alt="Ảnh gốc đã chọn" hidden><div data-original-empty class="pp-placeholder"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="7" width="36" height="34" rx="5"/><circle cx="24" cy="19" r="6"/><path d="M13 37c1-7 5-10 11-10s10 3 11 10"/></svg><span>Ảnh chỉ hiển thị trên thiết bị</span></div></div></div><div class="pp-image-panel"><span>Khung ảnh đã căn</span><div class="pp-image-frame pp-image-frame--crop"><canvas data-crop-canvas width="600" height="600" hidden></canvas><div data-crop-empty class="pp-placeholder"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="5" width="30" height="38" rx="3"/><circle cx="24" cy="18" r="6"/><path d="M14 37c1-6 4-9 10-9s9 3 10 9"/></svg><span>Khung căn ảnh sẽ xuất hiện tại đây</span></div><span class="pp-crop-guide" data-crop-guide hidden aria-hidden="true"></span></div></div></div><div class="pp-crop-tools" data-crop-tools hidden><label>Thu phóng <input type="range" min="0.8" max="1.7" value="1" step="0.01" data-zoom><output data-zoom-value>100%</output></label><p>Kéo ảnh để đổi vị trí trong khung. Khung không làm thay đổi tỉ lệ khuôn mặt.</p></div><div class="pp-dimension-line" data-dimensions></div><section class="pp-checks"><div class="pp-section-heading"><div><h2>Kiểm tra ảnh</h2><p>Không phải xác nhận hoặc bảo đảm chấp nhận hồ sơ.</p></div><span class="pp-status pp-status--unknown" data-check-overall>Chưa phân tích</span></div><div data-checklist class="pp-checklist"><p class="pp-muted">Chọn quốc gia, giấy tờ và ảnh để xem các kiểm tra áp dụng.</p></div></section></section><aside class="pp-export"><div class="pp-card"><h2>Xuất ảnh</h2><label class="pp-field">Định dạng<select data-export-format><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label><button type="button" class="pp-primary-button" data-download disabled>Tải ảnh đã căn</button><p class="pp-muted" data-export-note>Ảnh xuất chỉ áp dụng crop/xoay đã chọn; tiêu chuẩn chưa xác minh sẽ không được gắn nhãn đạt.</p></div><div class="pp-card"><h2>In ảnh</h2><label class="pp-field">Khổ giấy<select data-paper><option value="a4">A4</option><option value="4x6">10 × 15 cm (4 × 6 in)</option></select></label><label class="pp-field">Số bản<input type="number" min="1" max="24" value="4" data-copies></label><label class="pp-check-field"><input type="checkbox" data-cut-guides checked> Hiện đường cắt</label><button type="button" class="pp-secondary-button" data-print disabled>Tạo bản in / PDF</button><p class="pp-muted">Trong hộp thoại in, chọn tỉ lệ 100% hoặc Kích thước thực, bỏ “Vừa trang”. Đối chiếu kích thước giấy trước khi dùng.</p></div><div class="pp-disclaimer">Luôn kiểm tra nguồn chính thức và yêu cầu của đúng cơ quan tiếp nhận. Ảnh có thể bị từ chối dù các chỉ số kỹ thuật phù hợp.</div></aside></div><section class="pp-visa-guide" data-visa-guide aria-labelledby="pp-visa-title"><div data-visa-content></div></section><details class="pp-admin-trainer"><summary>Visa AI Knowledge Trainer – Huấn luyện kiến thức thủ tục visa</summary><div class="pp-admin-trainer__body"><p>Quy trình nhập liệu nằm trong repository riêng. Trang công khai không nhận văn bản nguồn, tài liệu riêng hoặc khóa truy cập.</p><p><a href="https://github.com/blogco/visa-knowledge-private/actions/workflows/ingest.yml" target="_blank" rel="noopener">Mở quy trình nhập visa dành cho quản trị viên ↗</a></p><ol><li>Đăng nhập GitHub bằng tài khoản quản trị repository riêng.</li><li>Chọn Actions → Visa knowledge intake, dán nội dung nguồn, hoặc dùng source URL trực tiếp cho tài liệu HTML/PDF/TXT/Markdown nếu không dán văn bản.</li><li>Rà soát claim, bằng chứng, trùng lặp và mâu thuẫn trong issue riêng.</li><li>Chỉ dùng /approve sau khi kiểm tra; nội dung công khai được đề xuất qua Pull Request.</li></ol><p class="pp-admin-trainer__note">Trạng thái thật được lưu trong GitHub Actions và hồ sơ rà soát riêng: Chưa nhập dữ liệu · Đang phân tích · Đã trích xuất · Phát hiện trùng lặp · Có thông tin mâu thuẫn · Cần xác minh · Chờ phê duyệt · Đã phê duyệt · Đang tạo Pull Request · Đã xuất bản sau khi PR được merge và GitHub Pages hoàn tất.</p><p class="pp-admin-trainer__note">Đây là tìm kiếm tĩnh trên claim đã duyệt, không phải huấn luyện liên tục mô hình AI.</p></div></details><section class="pp-print-sheet" data-print-sheet hidden></section><p class="pp-page-version">Cơ sở tiêu chuẩn phiên bản ${REQUIREMENTS_VERSION} · Các trường chưa được xác minh sẽ không tự điền.</p></main>`;
  bind(root);
  updateProfile(root);
}

function selectedProfile(root) {
  const country = root.querySelector('[data-country]').value;
  const doc = root.querySelector('[data-document]').value;
  return country ? getProfile(country, doc) : null;
}

function updateProfile(root) {
  const profile = selectedProfile(root);
  const format = root.querySelector('[data-export-format]');
  const formats = profile?.acceptedFormats?.length ? profile.acceptedFormats : ['image/jpeg', 'image/png'];
  const currentFormat = format.value;
  format.innerHTML = formats.map((mime) => `<option value="${mime}">${mime === 'image/png' ? 'PNG' : 'JPG'}</option>`).join('');
  format.value = formats.includes(currentFormat) ? currentFormat : formats[0];
  const meta = root.querySelector('[data-profile-meta]');
  const source = root.querySelector('[data-source-link]');
  if (!profile) {
    meta.innerHTML = 'Chọn quốc gia và giấy tờ để xem thông tin tiêu chuẩn.';
    source.innerHTML = '';
  } else {
    meta.innerHTML = `${profileMeta(profile)}${profile.backgroundRequirements ? `<p><strong>Nền:</strong> ${escapeHtml(profile.backgroundRequirements)}</p>` : ''}${profile.digitalAlterationRules ? `<p><strong>Chỉnh sửa số:</strong> ${escapeHtml(profile.digitalAlterationRules)}</p>` : ''}`;
    source.innerHTML = `<a href="${escapeHtml(profile.officialSourceUrl)}" target="_blank" rel="noopener">Mở nguồn chính thức ↗</a>${profile.verificationStatus !== 'verified' ? '<span> · Chưa xác minh</span>' : ''}`;
  }
  refreshChecks(root);
  drawCrop(root);
  renderVisaGuide(root);
}

const CLAIM_TYPE_LABELS = {
  visa_requirement: 'Điều kiện visa', visa_exemption: 'Miễn visa', eligibility: 'Điều kiện đủ',
  application_procedure: 'Thủ tục nộp', required_document: 'Hồ sơ cần nộp', fee: 'Lệ phí',
  processing_time: 'Thời gian xử lý', appointment_rule: 'Lịch hẹn', biometrics: 'Sinh trắc học',
  passport_requirement: 'Yêu cầu hộ chiếu', photo_specification: 'Quy cách ảnh',
  official_application_link: 'Liên kết nộp hồ sơ',
};
function residenceCode() {
  const value = String(visaProfile.residence || '').trim().toLocaleLowerCase();
  const known = { 'việt nam': 'VN', vietnam: 'VN', 'hoa kỳ': 'US', 'united states': 'US', 'hàn quốc': 'KR', 'south korea': 'KR', 'vương quốc anh': 'GB', 'united kingdom': 'GB', japan: 'JP', nhật: 'JP', singapore: 'SG', úc: 'AU', australia: 'AU', canada: 'CA', 'thái lan': 'TH', thailand: 'TH', china: 'CN', 'trung quốc': 'CN' };
  return known[value] || value.toUpperCase();
}
function renderPublishedKnowledge(guide, destination) {
  const hostProfile = {
    destinationCountry: destination,
    passportNationality: visaProfile.nationality,
    residenceCountry: residenceCode(),
    visaCategory: guide?.visaCategory || '',
  };
  const result = retrieveApprovedClaims(visaKnowledge, hostProfile, visaProfile.date || new Date().toISOString().slice(0, 10));
  if (!result.claims.length) return '<p class="pp-muted">Chưa có claim đã phê duyệt từ nguồn chính thức phù hợp với hồ sơ này. Hãy đối chiếu yêu cầu hiện hành với cơ quan tiếp nhận.</p>';
  const warning = result.hasConflicts
    ? '<p class="pp-knowledge-warning" role="status">Có thông tin mâu thuẫn trong các claim phù hợp. Hãy mở và so sánh nguồn chính thức trước khi áp dụng.</p>'
    : '';
  const stale = result.claims.some((claim) => isStaleKnowledge(claim))
    ? '<p class="pp-knowledge-warning" role="status">Ít nhất một nguồn đã lâu chưa được kiểm tra lại. Xác nhận thông tin hiện hành trước khi nộp.</p>'
    : '';
  const cards = result.claims.map((claim) => {
    const type = CLAIM_TYPE_LABELS[claim.claim_type] || 'Thông tin visa';
    const staleBadge = isStaleKnowledge(claim) ? '<span class="pp-knowledge-badge pp-knowledge-badge--stale">Cần kiểm tra lại</span>' : '';
    const effective = claim.effective_date ? ' · hiệu lực ' + escapeHtml(claim.effective_date) : '';
    const checked = claim.last_verified_at ? ' · kiểm tra ' + escapeHtml(claim.last_verified_at.slice(0, 10)) : '';
    const sourceName = escapeHtml(claim.source_title || claim.publisher || 'Nguồn chính thức');
    return '<article class="pp-knowledge-claim"><div><span class="pp-knowledge-type">' + escapeHtml(type) + '</span>' + staleBadge + '</div><p>' + escapeHtml(claim.claim_text) + '</p><small>' + sourceName + effective + checked + '</small><a href="' + escapeHtml(claim.source_url) + '" target="_blank" rel="noopener">Mở nguồn chính thức ↗</a></article>';
  }).join('');
  return '<div class="pp-knowledge-list">' + warning + stale + cards + '</div><p class="pp-knowledge-caption">Claim được truy xuất từ dữ liệu tĩnh đã duyệt. Mỗi mục dẫn tới nguồn; nội dung nguồn và ghi chú rà soát riêng không được phát hành.</p>';
}

function renderVisaGuide(root) {
  const host = root.querySelector('[data-visa-content]');
  const code = root.querySelector('[data-country]').value;
  const country = COUNTRIES.find(([id]) => id === code);
  if (!country) { host.innerHTML = '<p class="pp-muted">Chọn quốc gia đến để xem hướng dẫn visa.</p>'; return; }
  const guide = visaDataset.guides[code];
  const nationalityOptions = [['VN','Việt Nam'],['US','Hoa Kỳ'],['GB','Vương quốc Anh'],['CN','Trung Quốc'],['IN','Ấn Độ'],['JP','Nhật Bản'],['KR','Hàn Quốc'],['SG','Singapore'],['TH','Thái Lan'],['AU','Úc'],['CA','Canada'],['TW','Đài Loan']].map(([id,label]) => `<option value="${id}" ${id === (visaProfile.nationality || 'VN') ? 'selected' : ''}>${label}</option>`).join('');
  if (!guide || guide.verificationStatus !== 'verified') {
    host.innerHTML = `<h2 id="pp-visa-title">Hướng dẫn xin visa du lịch tự túc – ${escapeHtml(country[1])}</h2><p class="pp-status pp-status--unknown">Chưa có hướng dẫn được xác minh</p><section class="pp-published-knowledge" aria-labelledby="pp-published-knowledge-title"><h3 id="pp-published-knowledge-title">Kiến thức visa đã được duyệt</h3><div data-published-visa-knowledge aria-live="polite"></div></section><p>Chưa có dữ liệu visa đã được đối chiếu cho quốc gia/khu vực này. Hãy kiểm tra trực tiếp cơ quan chính thức trước khi lên kế hoạch; yêu cầu phụ thuộc quốc tịch hộ chiếu, nơi cư trú hợp pháp và hoàn cảnh cá nhân.</p><p><a href="${escapeHtml(country[2])}" target="_blank" rel="noopener">Mở cổng chính thức tham khảo: ${escapeHtml(country[1])} ↗</a></p>${profileFields(nationalityOptions)}<p class="pp-visa-note">${visaDisclaimer}</p>`;
    root.querySelector('[data-published-visa-knowledge]').innerHTML = renderPublishedKnowledge(null, code); bindVisaProfile(root); return;
  }
  const checklist = guide.requiredDocuments.map((item, index) => `<label class="pp-visa-check"><input type="checkbox" data-visa-check="${index}"><span><strong>${escapeHtml(item.label)}</strong><small>${item.status === 'mandatory' ? 'Bắt buộc theo nguồn' : item.status === 'conditional' ? 'Tuỳ trường hợp' : 'Tài liệu hỗ trợ tuỳ chọn'} · ${escapeHtml(item.detail)}</small></span></label>`).join('');
  const links = guide.sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.title)} ↗</a><small>${escapeHtml(source.authority)} · kiểm tra ${escapeHtml(source.checkedAt)} · áp dụng: ${escapeHtml(source.applicability)}</small></li>`).join('');
  const list = (items) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  const photo = guide.photoRequirements;
  const photoMismatch = photo.preset && code === photo.preset.split(':')[0] && root.querySelector('[data-document]').value !== photo.preset.split(':')[1];
  const photoNote = photoMismatch ? `<p class="pp-visa-warning">Tiêu chuẩn ảnh đã chọn có thể khác yêu cầu visa. <button type="button" class="pp-text-button" data-visa-photo-switch>Dùng preset ${escapeHtml(photo.preset.split(':')[1])}</button> Ảnh gốc và chỉnh sửa hiện tại được giữ nguyên.</p>` : '';
  const publishedKnowledge = renderPublishedKnowledge(guide, code);
  const profileCovered = visaProfile.nationality === guide.passportNationality && visaProfile.passport === 'Phổ thông';
  const overview = profileCovered ? guide.eligibilityConditions.join(' ') : 'Hướng dẫn chi tiết bên dưới hiện được kiểm chứng cho hộ chiếu phổ thông Việt Nam. Chưa có kết luận đủ dữ liệu cho quốc tịch hoặc loại hộ chiếu đã chọn; kiểm tra cơ quan chính thức theo hồ sơ của bạn.';
  host.innerHTML = `<details class="pp-visa-wrap" open><summary><span><span class="pp-eyebrow">BLOGCO VISA GUIDE</span><h2 id="pp-visa-title">Hướng dẫn xin visa du lịch tự túc – ${escapeHtml(country[1])}</h2></span><span class="pp-status pp-status--verified">Đã đối chiếu · ${escapeHtml(guide.sources[0].checkedAt)}</span></summary><div class="pp-visa-body"><p class="pp-visa-lead">${profileCovered ? `Thông tin dựa trên hồ sơ hộ chiếu phổ thông Việt Nam, du lịch tự túc đến ${escapeHtml(country[1])}.` : 'Thông tin dưới đây không được xác nhận áp dụng cho hồ sơ bạn vừa chọn.'} Đây là hướng dẫn tham khảo; quyết định và yêu cầu có thể phụ thuộc hồ sơ cá nhân.</p><div class="pp-visa-profile">${profileFields(nationalityOptions)}</div><section class="pp-published-knowledge" aria-labelledby="pp-published-knowledge-title"><h3 id="pp-published-knowledge-title">Kiến thức visa đã được duyệt</h3><div data-published-visa-knowledge>${publishedKnowledge}</div></section><p class="pp-visa-overview">${escapeHtml(overview)}</p><div class="pp-visa-grid">${accordion('Loại visa, miễn trừ & điều kiện', `<p><strong>Nhóm phù hợp:</strong> ${escapeHtml(guide.visaCategory)}</p>${list(guide.exemptionRules)}`)}${accordion('Hồ sơ cần chuẩn bị', `<div class="pp-visa-checklist">${checklist}</div><p class="pp-muted">Tích checklist chỉ lưu trong phiên trình duyệt hiện tại.</p>`)}${accordion('Trình tự nộp hồ sơ', list(guide.applicationSteps))}${accordion('Lịch hẹn & sinh trắc học', `<p>${escapeHtml(guide.appointmentBiometrics)}</p>`)}${accordion('Phí & thời gian xử lý', `<p><strong>Phí chính phủ:</strong> ${escapeHtml(guide.fees.official)}</p><p><strong>Phí dịch vụ:</strong> ${escapeHtml(guide.fees.service)}</p><p><strong>Thời gian:</strong> ${escapeHtml(guide.fees.processing)}</p>`)}${accordion('Yêu cầu ảnh visa', `<p><strong>Kích thước:</strong> ${escapeHtml(photo.dimensions)}</p><p><strong>Nền / căn mặt:</strong> ${escapeHtml(photo.background)}; ${escapeHtml(photo.head)}</p><p><strong>Định dạng / thời hạn:</strong> ${escapeHtml(photo.format)}; ${escapeHtml(photo.recency)}</p>${photoNote}<p class="pp-muted">Thông số ảnh có thể tuỳ loại visa, cách nộp và trung tâm tiếp nhận. Không mặc định preset hộ chiếu tương đương ảnh visa.</p>`)}${accordion('Lỗi thường gặp & chuẩn bị', list(guide.mistakes))}${accordion('Nguồn chính thức & ngày kiểm tra', `<ul class="pp-visa-sources">${links}</ul>`)}</div><p class="pp-visa-note">${visaDisclaimer}</p></div></details>`;
  bindVisaProfile(root);
  host.querySelector('[data-visa-photo-switch]')?.addEventListener('click', () => { root.querySelector('[data-document]').value = photo.preset.split(':')[1]; updateProfile(root); });
}

const visaDisclaimer = 'Thông tin chỉ nhằm hỗ trợ chuẩn bị hồ sơ du lịch tự túc. Quy định thị thực có thể thay đổi. Vui lòng xác nhận với cơ quan lãnh sự hoặc cơ quan di trú chính thức trước khi nộp hồ sơ.';
function profileFields(nationalityOptions) { return `<div class="pp-visa-fields"><label class="pp-field">Quốc tịch hộ chiếu<select data-visa-nationality>${nationalityOptions}</select></label><label class="pp-field">Nơi cư trú hợp pháp<input data-visa-residence value="${escapeHtml(visaProfile.residence)}"></label><label class="pp-field">Thời gian dự định lưu trú<input data-visa-stay type="number" min="1" max="365" value="${escapeHtml(visaProfile.stay)}" placeholder="Số ngày"></label><label class="pp-field">Ngày dự kiến khởi hành<input data-visa-date type="date" value="${escapeHtml(visaProfile.date)}"></label><label class="pp-field">Loại hộ chiếu<select data-visa-passport>${['Phổ thông','Công vụ','Ngoại giao','Giấy thông hành/khác'].map((label) => `<option ${label === visaProfile.passport ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="pp-field">Visa hoặc thẻ cư trú còn hiệu lực<input data-visa-permits value="${escapeHtml(visaProfile.permits)}" placeholder="Không bắt buộc khai chi tiết"></label></div>`; }
function accordion(title, content) { return `<details class="pp-visa-item"><summary>${title}</summary><div>${content}</div></details>`; }
function bindVisaProfile(root) {
  root.querySelectorAll('[data-visa-residence],[data-visa-stay],[data-visa-date],[data-visa-passport],[data-visa-permits]').forEach((el) => {
    const key = ({ 'data-visa-residence': 'residence', 'data-visa-stay': 'stay', 'data-visa-date': 'date', 'data-visa-passport': 'passport', 'data-visa-permits': 'permits' })[el.getAttributeNames().find((name) => name.startsWith('data-visa-'))];
    el.addEventListener('change', () => { visaProfile[key] = el.value; if (key === 'residence' || key === 'date') { const code = root.querySelector('[data-country]').value; const claimsHost = root.querySelector('[data-published-visa-knowledge]'); if (claimsHost) claimsHost.innerHTML = renderPublishedKnowledge(visaDataset.guides[code], code); } });
  });
  root.querySelectorAll('[data-visa-nationality]').forEach((el) => el.addEventListener('change', () => {
    visaProfile.nationality = el.value;
    const code = root.querySelector('[data-country]').value;
    const guide = visaDataset.guides[code];
    const status = root.querySelector('[data-visa-content] .pp-visa-overview');
    if (!guide || !status) return;
    const passport = root.querySelector('[data-visa-passport]')?.value || 'Phổ thông';
    const claimsHost = root.querySelector('[data-published-visa-knowledge]');
    if (claimsHost) claimsHost.innerHTML = renderPublishedKnowledge(guide, code);
    status.textContent = el.value === guide.passportNationality && passport === 'Phổ thông' ? guide.eligibilityConditions.join(' ') : 'Hướng dẫn chi tiết hiện được kiểm chứng cho hộ chiếu phổ thông Việt Nam. Chưa có kết luận đủ dữ liệu cho hồ sơ đã chọn; hãy kiểm tra cơ quan chính thức theo quốc tịch, nơi cư trú và loại hộ chiếu.';
  }));
}

function currentCrop() {
  if (!photo) return null;
  const width = photo.source.width;
  const height = photo.source.height;
  const profile = selectedProfile(mountedRoot) || {};
  const aspect = aspectFor(profile);
  let cropHeight = Math.min(height, width / aspect);
  let cropWidth = cropHeight * aspect;
  const zoom = Number(mountedRoot.querySelector('[data-zoom]').value || 1);
  cropWidth = Math.min(width, cropWidth / zoom);
  cropHeight = cropWidth / aspect;
  if (cropHeight > height) { cropHeight = height; cropWidth = cropHeight * aspect; }
  const centerX = photo.centerX ?? (photo.face ? photo.face.x + photo.face.width / 2 : width / 2);
  const centerY = photo.centerY ?? (photo.face ? photo.face.y + photo.face.height * .48 : height / 2);
  const x = Math.max(0, Math.min(width - cropWidth, centerX - cropWidth / 2));
  const y = Math.max(0, Math.min(height - cropHeight, centerY - cropHeight / 2));
  return { x, y, width: cropWidth, height: cropHeight, aspect };
}

function drawCrop(root) {
  const canvas = root.querySelector('[data-crop-canvas]');
  const empty = root.querySelector('[data-crop-empty]');
  const guide = root.querySelector('[data-crop-guide]');
  if (!photo) {
    showRetry(root, false);
    canvas.hidden = true; empty.hidden = false; guide.hidden = true;
    root.querySelector('[data-download]').disabled = true;
    root.querySelector('[data-print]').disabled = true;
    root.querySelector('[data-rotate]').disabled = true;
    root.querySelector('[data-crop-tools]').hidden = true;
    root.querySelector('[data-dimensions]').textContent = '';
    return;
  }
  const crop = currentCrop();
  const width = 600;
  const height = Math.round(width / crop.aspect);
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d', { alpha: false }).drawImage(photo.source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  canvas.hidden = false; empty.hidden = true; guide.hidden = false;
  root.querySelector('[data-crop-tools]').hidden = false;
  root.querySelector('[data-download]').disabled = false;
  const profile = selectedProfile(root);
  root.querySelector('[data-print]').disabled = !(profile?.physicalWidthMm && profile?.physicalHeightMm);
  root.querySelector('[data-rotate]').disabled = false;
  root.querySelector('[data-dimensions]').textContent = `Ảnh gốc ${photo.source.width} × ${photo.source.height} px · khung ${Math.round(crop.width)} × ${Math.round(crop.height)} px · tỷ lệ ${crop.aspect.toFixed(3)}:1`;
  root.querySelector('[data-zoom-value]').value = `${Math.round(Number(root.querySelector('[data-zoom]').value) * 100)}%`;
  refreshChecks(root);
}

function checklistRow(status, title, detail) {
  const labels = { pass: 'Đạt kiểm tra', fail: 'Cần điều chỉnh', manual: 'Cần kiểm tra thủ công', unknown: 'Không thể xác minh tự động' };
  return `<li class="pp-check-item pp-check-item--${status}"><span class="pp-check-mark" aria-hidden="true">${status === 'pass' ? '✓' : status === 'fail' ? '!' : '·'}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div><span>${labels[status]}</span></li>`;
}

function refreshChecks(root) {
  const profile = selectedProfile(root);
  const list = root.querySelector('[data-checklist]');
  const overall = root.querySelector('[data-check-overall]');
  if (!profile) { list.innerHTML = '<p class="pp-muted">Chọn quốc gia, giấy tờ và ảnh để xem các kiểm tra áp dụng.</p>'; return; }
  if (!photo) { list.innerHTML = '<p class="pp-muted">Tải ảnh lên để kiểm tra kích thước, khuôn mặt và chất lượng kỹ thuật.</p>'; overall.textContent = 'Chưa phân tích'; return; }
  const crop = currentCrop();
  const rows = [];
  if (profile.digitalWidthPx && profile.digitalHeightPx) {
    const exact = crop.width / crop.height === profile.digitalWidthPx / profile.digitalHeightPx;
    rows.push(checklistRow(exact ? 'pass' : 'fail', 'Tỷ lệ khung', `Yêu cầu ${profile.digitalWidthPx} × ${profile.digitalHeightPx} px; kích thước pixel cuối được áp dụng khi xuất.`));
  } else {
    rows.push(checklistRow('manual', 'Kích thước giấy', profile.physicalWidthMm ? `Đã biết ${profile.physicalWidthMm} × ${profile.physicalHeightMm} mm; tự kiểm tra tỉ lệ in ở mức 100%.` : 'Kích thước giấy của lựa chọn này chưa được xác minh.'));
  }
  if (profile.headHeightRange || profile.headHeightRangePercent) rows.push(checklistRow('manual', 'Chiều cao đầu', 'Chưa đo được chính xác đỉnh đầu và cằm; cần đối chiếu trực tiếp với hướng dẫn chính thức.'));
  rows.push(checklistRow(photo.faceCount === 1 ? 'pass' : photo.faceCount === null ? 'unknown' : 'fail', 'Số khuôn mặt', photo.faceCount === null ? 'Chưa chạy được nhận diện trên trình duyệt này.' : `Nhận diện cục bộ phát hiện ${photo.faceCount}; không đánh giá được tính xác thực hay danh tính.`));
  if (photo.eyeLandmarks?.length) rows.push(checklistRow('manual', 'Vị trí mắt', `Đã xác định ${photo.eyeLandmarks.length} điểm landmark quanh mắt; vui lòng kiểm tra căn chỉnh bằng mắt.`));
  rows.push(checklistRow('manual', 'Nền ảnh', profile.backgroundRequirements || 'Nền chưa được đánh giá tự động; hãy so với yêu cầu chính thức.'));
  rows.push(checklistRow(photo.quality.exposure ? 'pass' : 'fail', 'Độ sáng (ước lượng)', photo.quality.exposure ? 'Mức sáng tổng thể nằm trong dải tham khảo; bóng đổ vẫn cần kiểm tra bằng mắt.' : 'Ảnh có thể quá tối hoặc quá sáng. Hãy chụp lại với ánh sáng đều.'));
  rows.push(checklistRow(photo.quality.sharp ? 'pass' : 'manual', 'Độ nét (heuristic)', photo.quality.sharp ? 'Có đủ chi tiết cạnh theo phép đo ảnh cơ bản.' : 'Phép đo có thể báo ảnh mềm/mờ; hãy kiểm tra mắt và đường nét bằng mắt.'));
  rows.push(checklistRow(profile.backgroundRequirements ? 'manual' : 'unknown', 'Chỉnh sửa nền', profile.digitalAlterationRules ? 'Thay nền bị tắt để tránh vi phạm quy định chỉnh sửa.' : 'Chưa xác minh việc chỉnh sửa nền được phép; tính năng thay nền bị tắt.'));
  if (profile.maxFileSizeBytes) rows.push(checklistRow(photo.file.size <= profile.maxFileSizeBytes ? 'pass' : 'fail', 'Dung lượng nguồn', `Tệp gốc ${Math.ceil(photo.file.size / 1024)} KB · giới hạn ${Math.floor(profile.maxFileSizeBytes / 1024)} KB; sẽ kiểm tra lại tệp xuất.`));
  rows.push(checklistRow('manual', 'Biểu cảm, kính, mũ và tuổi ảnh', 'Cần người dùng đối chiếu thủ công; công cụ không xác thực được các yêu cầu này.'));
  list.innerHTML = rows.join('');
  overall.textContent = profile.verificationStatus === 'verified' ? 'Không bảo đảm chấp nhận' : 'Tiêu chuẩn chưa xác minh';
  overall.className = `pp-status ${profile.verificationStatus === 'verified' ? 'pp-status--verified' : 'pp-status--unknown'}`;
}

async function loadFaceDetector(forceRetry = false) {
  if (detector) return detector;
  if (forceRetry) detectorPromise = null;
  detectorPromise ||= (async () => {
    const [{ FaceLandmarker, FilesetResolver }, modelResponse] = await Promise.all([
      import('@mediapipe/tasks-vision'),
      fetch(MODEL_URL, { cache: 'force-cache' }),
    ]);
    if (!modelResponse.ok) throw new Error(`Không tải được model (${modelResponse.status}).`);
    const model = new Uint8Array(await modelResponse.arrayBuffer());
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const options = { baseOptions: { modelAssetBuffer: model, delegate: 'GPU' }, runningMode: 'IMAGE', numFaces: 3, minFaceDetectionConfidence: .55, minFacePresenceConfidence: .55, minTrackingConfidence: .5, outputFaceBlendshapes: false };
    try {
      detectorBackend = 'GPU';
      detector = await FaceLandmarker.createFromOptions(fileset, options);
    } catch (error) {
      lastGpuError = error;
      detectorBackend = 'CPU';
      detector = await FaceLandmarker.createFromOptions(fileset, { ...options, baseOptions: { modelAssetBuffer: model, delegate: 'CPU' } });
    }
    return detector;
  })();
  try { return await detectorPromise; } catch (error) { detectorPromise = null; throw error; }
}

function imageQuality(canvas) {
  const small = document.createElement('canvas');
  small.width = 80; small.height = 80;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 80, 80);
  const pixels = ctx.getImageData(0, 0, 80, 80).data;
  let luminance = 0; let count = 0; let edges = 0; let edgeCount = 0;
  const gray = new Float32Array(80 * 80);
  for (let i = 0; i < gray.length; i += 1) {
    const p = i * 4;
    gray[i] = (pixels[p] * .2126 + pixels[p + 1] * .7152 + pixels[p + 2] * .0722) / 255;
    luminance += gray[i]; count += 1;
  }
  for (let y = 1; y < 79; y += 1) for (let x = 1; x < 79; x += 1) {
    const at = y * 80 + x;
    const laplace = gray[at - 80] + gray[at + 80] + gray[at - 1] + gray[at + 1] - 4 * gray[at];
    edges += laplace * laplace; edgeCount += 1;
  }
  const mean = luminance / count;
  return { exposure: mean > .15 && mean < .91, sharp: edges / edgeCount > .000035 };
}

function orientedCanvas(image, turns) {
  const quarter = Math.abs(turns % 2) === 1;
  const canvas = document.createElement('canvas');
  canvas.width = quarter ? image.naturalHeight : image.naturalWidth;
  canvas.height = quarter ? image.naturalWidth : image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(turns * Math.PI / 2);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvas;
}

async function processPhoto(root, file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_INPUT_BYTES) {
    showStatus(root, file?.size > MAX_INPUT_BYTES ? 'Ảnh vượt giới hạn 20 MB.' : 'Chỉ hỗ trợ JPG, PNG hoặc WebP. HEIC cần chuyển sang JPG trước.', true);
    return;
  }
  clearPhoto(root, false);
  const thisJob = ++jobId;
  const url = URL.createObjectURL(file);
  const image = new Image();
  photo = { file, url, image, source: null, face: null, eyeLandmarks: [], faceCount: null, quality: { exposure: false, sharp: false }, turns: 0, centerX: null, centerY: null };
  showStatus(root, 'Đang đọc ảnh trên thiết bị…');
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Không đọc được ảnh.')); image.src = url; });
    if (thisJob !== jobId) return;
    if (image.naturalWidth * image.naturalHeight > 25_000_000) {
      clearPhoto(root, false);
      showStatus(root, 'Ảnh vượt 25 megapixel; hãy giảm kích thước trước khi xử lý để tránh đầy bộ nhớ.', true);
      return;
    }
    photo.source = orientedCanvas(image, 0);
    photo.quality = imageQuality(photo.source);
    root.querySelector('[data-original]').src = url;
    root.querySelector('[data-original]').hidden = false;
    root.querySelector('[data-original-empty]').hidden = true;
    root.querySelector('[data-delete-photo]').disabled = false;
    drawCrop(root);
    showStatus(root, 'Đang tải công cụ nhận diện cục bộ…');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const faceTask = await loadFaceDetector();
    if (thisJob !== jobId) return;
    const result = faceTask.detect(photo.source);
    const faces = result.faceLandmarks || [];
    photo.faceCount = faces.length;
    if (faces.length === 1) {
      const points = faces[0];
      const xs = points.map(({ x }) => x * photo.source.width);
      const ys = points.map(({ y }) => y * photo.source.height);
      const left = Math.min(...xs); const right = Math.max(...xs);
      const top = Math.min(...ys); const bottom = Math.max(...ys);
      photo.face = { x: left, y: top, width: right - left, height: bottom - top };
      photo.centerX = (left + right) / 2;
      photo.centerY = top + (bottom - top) * .48;
      photo.eyeLandmarks = [33, 133, 159, 145, 362, 263, 386, 374].map((index) => points[index]).filter(Boolean);
    }
    showStatus(root, `Đã nhận diện ${photo.faceCount} khuôn mặt${detectorBackend === 'CPU' ? ' (chế độ CPU)' : ''}${detectorBackend === 'CPU' && lastGpuError ? ` sau lỗi GPU: ${lastGpuError.message}` : ''}. ${photo.faceCount === 1 ? 'Đã căn khung tự động; hãy kiểm tra và chỉnh lại nếu cần.' : 'Bạn có thể căn thủ công bằng thanh trượt và kéo ảnh.'}`);
    showRetry(root, false);
  } catch (error) {
    if (thisJob !== jobId) return;
    if (!photo?.source) {
      clearPhoto(root, false);
      showStatus(root, `Không đọc được ảnh (${error.message}).`, true);
      return;
    }
    photo.faceCount = null;
    showStatus(root, `Không chạy được nhận diện tự động (${error.message}). Ảnh vẫn có thể căn thủ công.`, true);
    showRetry(root, true);
  }
  drawCrop(root);
}

function showStatus(root, message, isError = false) {
  const target = root.querySelector('[data-photo-status]');
  target.textContent = message;
  target.classList.toggle('is-error', isError);
}

function showRetry(root, visible) {
  const button = root.querySelector('[data-face-retry]');
  if (button) button.hidden = !visible;
}

async function retryFaceDetection(root) {
  if (!photo?.source) return;
  const thisJob = ++jobId;
  showRetry(root, false);
  showStatus(root, 'Đang thử tải lại công cụ nhận diện cục bộ…');
  try {
    const task = await loadFaceDetector(true);
    if (thisJob !== jobId || !photo) return;
    const faces = task.detect(photo.source).faceLandmarks || [];
    photo.faceCount = faces.length;
    photo.face = null; photo.eyeLandmarks = [];
    if (faces.length === 1) {
      const points = faces[0];
      const xs = points.map(({ x }) => x * photo.source.width);
      const ys = points.map(({ y }) => y * photo.source.height);
      const left = Math.min(...xs); const right = Math.max(...xs);
      const top = Math.min(...ys); const bottom = Math.max(...ys);
      photo.face = { x: left, y: top, width: right - left, height: bottom - top };
      photo.centerX = (left + right) / 2; photo.centerY = top + (bottom - top) * .48;
      photo.eyeLandmarks = [33, 133, 159, 145, 362, 263, 386, 374].map((index) => points[index]).filter(Boolean);
    }
    showStatus(root, `Đã nhận diện ${faces.length} khuôn mặt. ${faces.length === 1 ? 'Đã căn khung tự động.' : 'Bạn có thể căn thủ công.'}`);
    drawCrop(root);
  } catch (error) {
    if (thisJob !== jobId) return;
    showStatus(root, `Vẫn chưa tải được nhận diện (${error.message}). Bạn có thể căn thủ công hoặc thử lại.`, true);
    showRetry(root, true);
  }
}

function clearPhoto(root, resetDetector = true) {
  jobId += 1;
  if (photo?.url) URL.revokeObjectURL(photo.url);
  photo = null;
  const image = root.querySelector('[data-original]');
  image.removeAttribute('src'); image.hidden = true;
  root.querySelector('[data-original-empty]').hidden = false;
  root.querySelector('[data-photo-input]').value = '';
  root.querySelector('[data-delete-photo]').disabled = true;
  root.querySelector('[data-zoom]').value = '1';
  if (resetDetector && detector) { detector.close(); detector = null; detectorPromise = null; }
  drawCrop(root);
  showStatus(root, 'Ảnh đã được xoá khỏi phiên làm việc.');
}

async function exportPhoto(root) {
  if (!photo) return;
  const profile = selectedProfile(root);
  const crop = currentCrop();
  const targetWidth = profile?.digitalWidthPx || Math.max(1, Math.round(crop.width));
  const targetHeight = profile?.digitalHeightPx || Math.max(1, Math.round(crop.height));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth; canvas.height = targetHeight;
  canvas.getContext('2d', { alpha: false }).drawImage(photo.source, crop.x, crop.y, crop.width, crop.height, 0, 0, targetWidth, targetHeight);
  const type = root.querySelector('[data-export-format]').value;
  const note = root.querySelector('[data-export-note]');
  let quality = .94;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) { note.textContent = 'Trình duyệt không thể xuất ảnh này.'; return; }
  if (profile?.maxFileSizeBytes && blob.size > profile.maxFileSizeBytes && type === 'image/jpeg') {
    for (quality = .88; quality >= .55 && blob.size > profile.maxFileSizeBytes; quality -= .08) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      if (!blob) break;
    }
  }
  if (!blob || (profile?.maxFileSizeBytes && blob.size > profile.maxFileSizeBytes)) {
    note.textContent = `Không thể đạt giới hạn ${Math.floor(profile.maxFileSizeBytes / 1024)} KB mà vẫn giữ nguyên kích thước pixel/chất lượng hợp lý; tệp chưa được tải.`;
    return;
  }
  const country = root.querySelector('[data-country]').value || 'photo';
  const doc = root.querySelector('[data-document]').value || 'id';
  const suffix = type === 'image/png' ? 'png' : 'jpg';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `passport-photo-${country}-${doc}.${suffix}`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  note.textContent = `Đã xuất ${targetWidth} × ${targetHeight} px · ${(blob.size / 1024).toFixed(0)} KB. Kết quả không đồng nghĩa ảnh được cơ quan chấp nhận.`;
}

function makePrintSheet(root) {
  if (!photo) return;
  const profile = selectedProfile(root);
  if (!profile?.physicalWidthMm || !profile?.physicalHeightMm) return;
  const canvas = root.querySelector('[data-crop-canvas]');
  const imageUrl = canvas.toDataURL('image/jpeg', .96);
  const count = Math.min(24, Math.max(1, Number(root.querySelector('[data-copies]').value) || 1));
  const sheet = root.querySelector('[data-print-sheet]');
  const paper = root.querySelector('[data-paper]').value;
  const guides = root.querySelector('[data-cut-guides]').checked;
  sheet.innerHTML = `<div class="pp-print-heading"><strong>${escapeHtml(profile.applicationChannel)}</strong><span>${profile.physicalWidthMm} × ${profile.physicalHeightMm} mm · ${count} bản</span></div><div class="pp-print-grid ${paper === '4x6' ? 'is-4x6' : 'is-a4'} ${guides ? 'has-guides' : ''}">${Array.from({ length: count }, () => `<div class="pp-print-photo" style="width:${profile.physicalWidthMm}mm;height:${profile.physicalHeightMm}mm"><img src="${imageUrl}" alt="Ảnh giấy tờ" /></div>`).join('')}</div><p class="pp-print-note">In ở kích thước thực (100%). Tắt tuỳ chọn “Vừa trang”/“Fit to page”. ${escapeHtml(profile.officialSourceUrl)}</p>`;
  sheet.hidden = false;
  const printStyle = document.createElement('style');
  printStyle.dataset.ppPage = 'true';
  printStyle.textContent = `@media print{@page{size:${paper === '4x6' ? '4in 6in' : 'A4 portrait'};margin:${paper === '4x6' ? '5mm' : '10mm'}}}`;
  root.append(printStyle);
  document.body.classList.add('pp-printing');
  window.print();
  window.setTimeout(() => { document.body.classList.remove('pp-printing'); sheet.hidden = true; printStyle.remove(); }, 700);
}

function bind(root) {
  root.querySelector('[data-face-retry]').addEventListener('click', () => { void retryFaceDetection(root); });
  root.querySelector('[data-country]').addEventListener('change', () => updateProfile(root));
  root.querySelector('[data-document]').addEventListener('change', () => updateProfile(root));
  root.querySelector('[data-photo-input]').addEventListener('change', (event) => { void processPhoto(root, event.target.files?.[0]); });
  root.querySelector('[data-delete-photo]').addEventListener('click', () => clearPhoto(root));
  root.querySelector('[data-download]').addEventListener('click', () => { void exportPhoto(root); });
  root.querySelector('[data-print]').addEventListener('click', () => makePrintSheet(root));
  root.querySelector('[data-zoom]').addEventListener('input', () => drawCrop(root));
  root.querySelector('[data-rotate]').addEventListener('click', () => {
    if (!photo) return;
    photo.turns = (photo.turns + 1) % 4;
    photo.source = orientedCanvas(photo.image, photo.turns);
    photo.face = null; photo.faceCount = null; photo.centerX = photo.source.width / 2; photo.centerY = photo.source.height / 2;
    showStatus(root, 'Ảnh đã xoay. Nhận diện khuôn mặt lại…');
    drawCrop(root);
    void loadFaceDetector().then((task) => {
      if (!photo) return;
      const faces = task.detect(photo.source).faceLandmarks || [];
      photo.faceCount = faces.length;
      if (faces.length === 1) {
        const points = faces[0];
        const xs = points.map(({ x }) => x * photo.source.width); const ys = points.map(({ y }) => y * photo.source.height);
        const left = Math.min(...xs); const right = Math.max(...xs); const top = Math.min(...ys); const bottom = Math.max(...ys);
        photo.face = { x: left, y: top, width: right - left, height: bottom - top };
        photo.centerX = (left + right) / 2; photo.centerY = top + (bottom - top) * .48;
        photo.eyeLandmarks = [33, 133, 159, 145, 362, 263, 386, 374].map((index) => points[index]).filter(Boolean);
      }
      drawCrop(root);
    }).catch((error) => { photo.faceCount = null; showStatus(root, `Không chạy được nhận diện tự động (${error.message}). Có thể căn thủ công hoặc thử lại.`, true); showRetry(root, true); refreshChecks(root); });
  });
  const frame = root.querySelector('[data-crop-canvas]');
  frame.addEventListener('pointerdown', (event) => {
    if (!photo) return;
    frame.setPointerCapture(event.pointerId);
    photo.drag = { x: event.clientX, y: event.clientY, centerX: currentCrop().x + currentCrop().width / 2, centerY: currentCrop().y + currentCrop().height / 2 };
  });
  frame.addEventListener('pointermove', (event) => {
    if (!photo?.drag) return;
    const rect = frame.getBoundingClientRect();
    const crop = currentCrop();
    photo.centerX = photo.drag.centerX - (event.clientX - photo.drag.x) * crop.width / rect.width;
    photo.centerY = photo.drag.centerY - (event.clientY - photo.drag.y) * crop.height / rect.height;
    drawCrop(root);
  });
  frame.addEventListener('pointerup', () => { if (photo) photo.drag = null; });
  const drop = root.querySelector('[data-dropzone]');
  drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
  drop.addEventListener('drop', (event) => { event.preventDefault(); drop.classList.remove('is-dragging'); void processPhoto(root, event.dataTransfer.files?.[0]); });
  window.addEventListener('pagehide', () => { if (photo?.url) URL.revokeObjectURL(photo.url); detector?.close(); }, { once: true });
}

export function mountPassportPhotoApp(root) {
  if (boundRoot === root) return;
  boundRoot = root;
  mountedRoot = root;
  render(root);
}
