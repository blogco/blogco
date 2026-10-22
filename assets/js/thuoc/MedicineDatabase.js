import { escapeHtml } from './store.js';
import { getMedicineProducts } from './medicine-db.js';

export async function renderMedicineDatabase(root, tab = 'scan') {
  root.innerHTML = `<section class="thuoc-screen medicine-db" aria-labelledby="thuoc-title">
    <div class="thuoc-page-heading thuoc-page-heading--hero"><a class="thuoc-back" href="#/thuoc">← Quản lý thuốc</a><p class="thuoc-eyebrow">BLOGCO · THƯ VIỆN THUỐC</p><h1 id="thuoc-title" tabindex="-1">Cơ sở dữ liệu thuốc</h1><p>Nhận diện nhãn trên thiết bị, lưu hồ sơ riêng và tra cứu nhãn tham khảo có nguồn.</p></div>
    <nav class="medicine-db__tabs" aria-label="Các chức năng DB Thuốc">
      <button type="button" data-db-tab="scan" class="${tab === 'scan' ? 'is-active' : ''}">Quét nhãn thuốc</button>
      <button type="button" data-db-tab="search" class="${tab === 'search' ? 'is-active' : ''}">Tra cứu / Kiến thức dược lý</button>
      <button type="button" data-db-tab="library" class="${tab === 'library' ? 'is-active' : ''}">Kho thuốc</button>
    </nav>
    <div data-db-content></div>${root.querySelector('[data-thuoc-toast]')?.outerHTML || '<div class="thuoc-toast" data-thuoc-toast role="status" aria-live="polite"></div>'}
  </section>`;
  root.dataset.dbTab = tab;
  const content = root.querySelector('[data-db-content]');
  if (tab === 'scan') content.innerHTML = `<div class="medicine-db__grid"><div class="thuoc-card"><h2>Quét nhãn hoặc hộp thuốc</h2><p>Ảnh được đọc trên thiết bị bằng OCR. Không gửi ảnh lên máy chủ.</p><label class="medicine-db__upload">Chọn hoặc chụp ảnh thuốc<input type="file" accept="image/*" capture="environment" multiple data-medicine-images></label><div data-scan-status class="thuoc-muted" aria-live="polite">Chọn ảnh để bắt đầu nhận diện tự động.</div><pre data-ocr-raw class="medicine-db__raw" hidden></pre></div>
      <form class="thuoc-card medicine-db__form" data-medicine-form><h2>Kiểm tra thông tin trước khi lưu</h2><p class="thuoc-muted">OCR có thể sai; hãy xác nhận đúng sản phẩm và hàm lượng.</p>${[['brandName','Tên biệt dược'],['genericName','Hoạt chất'],['strength','Hàm lượng'],['dosageForm','Dạng bào chế'],['manufacturer','Nhà sản xuất'],['registrationNumber','Số đăng ký'],['expirationDate','Hạn sử dụng']].map(([name,label])=>`<label class="thuoc-field">${label}<input name="${name}" autocomplete="off"></label>`).join('')}<label class="thuoc-field">Ghi chú / bảo quản<textarea name="storageInstructions" rows="2"></textarea></label><button class="thuoc-primary-button" type="submit">Xác nhận và lưu vào kho thuốc</button></form></div>`;
  else if (tab === 'search') content.innerHTML = `<div class="thuoc-card"><h2>Tra cứu nhãn thuốc tham khảo</h2><p>Tra cứu gửi tên thuốc bạn nhập tới openFDA. Ảnh và hồ sơ cá nhân không được gửi. Kết quả Hoa Kỳ không xác minh sản phẩm tại Việt Nam.</p><form data-reference-search class="medicine-db__search"><label class="thuoc-field">Tên thuốc / hoạt chất<input data-reference-query required placeholder="Ví dụ: paracetamol"></label><button class="thuoc-primary-button">Tra cứu nguồn tham khảo</button></form><div data-reference-results aria-live="polite"></div><p class="medicine-db__notice">Trang tĩnh hiện chưa có dịch vụ AI phía máy chủ. Vì vậy không tạo lời giải thích AI; nội dung dưới đây chỉ hiển thị trích đoạn thực tế từ nhãn nguồn, kèm nguồn và giới hạn áp dụng.</p></div>`;
  else {
    content.innerHTML = `<div class="thuoc-card"><h2>Kho thuốc cá nhân</h2><label class="thuoc-field">Tìm trong kho<input type="search" data-library-query placeholder="Tên thuốc, hoạt chất, hàm lượng"></label><div data-library-results>Đang tải kho thuốc…</div></div>`;
    await refreshMedicineLibrary(root);
  }
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}

export async function refreshMedicineLibrary(root) {
  const host = root.querySelector('[data-library-results]');
  if (!host) return;
  try {
    const products = await getMedicineProducts();
    host.innerHTML = products.length ? `<div class="medicine-db__records">${products.map((item) => `<article class="medicine-db__record"><div><h3>${escapeHtml(item.brandName || 'Chưa có tên')}</h3><p>${escapeHtml([item.genericName,item.strength,item.dosageForm].filter(Boolean).join(' · ') || 'Chưa bổ sung hoạt chất/hàm lượng')}</p><small>Thông tin do người dùng xác nhận từ bao bì · ${escapeHtml(item.manufacturer || 'Chưa rõ nhà sản xuất')}</small></div><button type="button" class="thuoc-ghost-button thuoc-ghost-button--danger" data-delete-product="${escapeHtml(item.id)}">Xóa</button></article>`).join('')}</div>` : '<p class="thuoc-empty">Kho chưa có thuốc. Quét ảnh nhãn để thêm thuốc đầu tiên.</p>';
  } catch (error) { host.textContent = error.message || 'Không tải được kho thuốc.'; }
}
