import { COUNTRIES, DOCUMENTS, getProfile, REQUIREMENTS_VERSION } from './requirements.js';

const MEDIAPIPE_VERSION = '0.10.22';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/face_detector.tflite';
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let mountedRoot;
let boundRoot;
let detectorPromise;
let detector;
let jobId = 0;
let photo = null;

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
  root.innerHTML = `<main class="pp-shell"><header class="pp-header"><div><p class="pp-eyebrow">BLOGCO · PHOTO STUDIO</p><h1>Ảnh hộ chiếu & visa</h1><p>Tạo khung ảnh, kiểm tra một số tiêu chí kỹ thuật và xuất tệp ngay trên thiết bị.</p></div><span class="pp-private-badge"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>Ảnh không tải lên</span></header><nav class="pp-steps" aria-label="Các bước"><span class="is-current">01 <b>Yêu cầu</b></span><i></i><span>02 <b>Ảnh & căn khung</b></span><i></i><span>03 <b>Kiểm tra & tải</b></span></nav><div class="pp-layout"><section class="pp-controls"><div class="pp-card"><h2>1. Chọn giấy tờ</h2><label class="pp-field">Quốc gia / khu vực<select data-country><option value="">Chọn quốc gia</option>${countryOptions}</select></label><label class="pp-field">Loại giấy tờ<select data-document>${documentOptions}</select></label><div data-profile-meta class="pp-profile-meta">Chọn quốc gia và giấy tờ để xem thông tin tiêu chuẩn.</div><div data-source-link class="pp-source-link"></div></div><div class="pp-card"><h2>2. Tải hoặc chụp ảnh</h2><label class="pp-dropzone" data-dropzone><span class="pp-upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg></span><strong>Chọn ảnh hoặc chụp ngay</strong><span>JPG, PNG, WebP · tối đa 20 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="user" data-photo-input></label><p class="pp-muted">Ảnh được xử lý trong trình duyệt, không lưu vào Blogco. HEIC chưa được hỗ trợ trực tiếp — hãy xuất sang JPG trước.</p><button type="button" class="pp-text-button" data-delete-photo disabled>Xoá ảnh khỏi phiên này</button></div><div class="pp-card pp-card--privacy"><h3>Riêng tư & chỉnh sửa</h3><p>Ảnh và crop ở trong bộ nhớ trình duyệt. Không chỉnh da, khuôn mặt hay nền. Model nhận diện chỉ tải khi chọn ảnh; CDN nhận yêu cầu tải thư viện/model và thư viện có thể gửi telemetry sử dụng/hiệu năng, nhưng không gửi nội dung ảnh.</p></div></section><section class="pp-preview"><div class="pp-preview-heading"><div><h2>Ảnh của bạn</h2><p data-photo-status aria-live="polite">Chọn tiêu chuẩn và tải ảnh để bắt đầu.</p></div><button type="button" class="pp-icon-button" data-rotate aria-label="Xoay ảnh 90 độ" disabled>↻</button></div><div class="pp-comparison"><div class="pp-image-panel"><span>Ảnh gốc</span><div class="pp-image-frame"><img data-original alt="Ảnh gốc đã chọn" hidden><div data-original-empty class="pp-placeholder"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="7" width="36" height="34" rx="5"/><circle cx="24" cy="19" r="6"/><path d="M13 37c1-7 5-10 11-10s10 3 11 10"/></svg><span>Ảnh chỉ hiển thị trên thiết bị</span></div></div></div><div class="pp-image-panel"><span>Khung ảnh đã căn</span><div class="pp-image-frame pp-image-frame--crop"><canvas data-crop-canvas width="600" height="600" hidden></canvas><div data-crop-empty class="pp-placeholder"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="5" width="30" height="38" rx="3"/><circle cx="24" cy="18" r="6"/><path d="M14 37c1-6 4-9 10-9s9 3 10 9"/></svg><span>Khung căn ảnh sẽ xuất hiện tại đây</span></div><span class="pp-crop-guide" data-crop-guide hidden aria-hidden="true"></span></div></div></div><div class="pp-crop-tools" data-crop-tools hidden><label>Thu phóng <input type="range" min="0.8" max="1.7" value="1" step="0.01" data-zoom><output data-zoom-value>100%</output></label><p>Kéo ảnh để đổi vị trí trong khung. Khung không làm thay đổi tỉ lệ khuôn mặt.</p></div><div class="pp-dimension-line" data-dimensions></div><section class="pp-checks"><div class="pp-section-heading"><div><h2>Kiểm tra ảnh</h2><p>Không phải xác nhận hoặc bảo đảm chấp nhận hồ sơ.</p></div><span class="pp-status pp-status--unknown" data-check-overall>Chưa phân tích</span></div><div data-checklist class="pp-checklist"><p class="pp-muted">Chọn quốc gia, giấy tờ và ảnh để xem các kiểm tra áp dụng.</p></div></section></section><aside class="pp-export"><div class="pp-card"><h2>Xuất ảnh</h2><label class="pp-field">Định dạng<select data-export-format><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label><button type="button" class="pp-primary-button" data-download disabled>Tải ảnh đã căn</button><p class="pp-muted" data-export-note>Ảnh xuất chỉ áp dụng crop/xoay đã chọn; tiêu chuẩn chưa xác minh sẽ không được gắn nhãn đạt.</p></div><div class="pp-card"><h2>In ảnh</h2><label class="pp-field">Khổ giấy<select data-paper><option value="a4">A4</option><option value="4x6">10 × 15 cm (4 × 6 in)</option></select></label><label class="pp-field">Số bản<input type="number" min="1" max="24" value="4" data-copies></label><label class="pp-check-field"><input type="checkbox" data-cut-guides checked> Hiện đường cắt</label><button type="button" class="pp-secondary-button" data-print disabled>Tạo bản in / PDF</button><p class="pp-muted">Trong hộp thoại in, chọn tỉ lệ 100% hoặc Kích thước thực, bỏ “Vừa trang”. Đối chiếu kích thước giấy trước khi dùng.</p></div><div class="pp-disclaimer">Luôn kiểm tra nguồn chính thức và yêu cầu của đúng cơ quan tiếp nhận. Ảnh có thể bị từ chối dù các chỉ số kỹ thuật phù hợp.</div></aside></div><section class="pp-print-sheet" data-print-sheet hidden></section><p class="pp-page-version">Cơ sở tiêu chuẩn phiên bản ${REQUIREMENTS_VERSION} · Các trường chưa được xác minh sẽ không tự điền.</p></main>`;
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

async function loadFaceDetector() {
  if (detector) return detector;
  detectorPromise ||= (async () => {
    const vision = await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`);
    detector = await vision.FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_URL }, runningMode: 'IMAGE', minDetectionConfidence: .55 });
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
  photo = { file, url, image, source: null, face: null, faceCount: null, quality: { exposure: false, sharp: false }, turns: 0, centerX: null, centerY: null };
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
    const detections = result.detections || [];
    photo.faceCount = detections.length;
    if (detections.length === 1) {
      const box = detections[0].boundingBox;
      photo.face = { x: box.originX, y: box.originY, width: box.width, height: box.height };
      photo.centerX = box.originX + box.width / 2;
      photo.centerY = box.originY + box.height * .48;
    }
    showStatus(root, 'Đã phân tích trong trình duyệt. Hãy kiểm tra khung và các mục thủ công.');
  } catch (error) {
    if (thisJob !== jobId) return;
    if (!photo?.source) {
      clearPhoto(root, false);
      showStatus(root, `Không đọc được ảnh (${error.message}).`, true);
      return;
    }
    photo.faceCount = null;
    showStatus(root, `Không chạy được nhận diện tự động (${error.message}). Ảnh vẫn có thể căn thủ công.`, true);
  }
  drawCrop(root);
}

function showStatus(root, message, isError = false) {
  const target = root.querySelector('[data-photo-status]');
  target.textContent = message;
  target.classList.toggle('is-error', isError);
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
      const detections = task.detect(photo.source).detections || [];
      photo.faceCount = detections.length;
      if (detections.length === 1) {
        const box = detections[0].boundingBox;
        photo.face = { x: box.originX, y: box.originY, width: box.width, height: box.height };
        photo.centerX = box.originX + box.width / 2; photo.centerY = box.originY + box.height * .48;
      }
      drawCrop(root);
    }).catch(() => { photo.faceCount = null; refreshChecks(root); });
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
