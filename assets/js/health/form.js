// Renders the "add / edit visit" form and reads it back. Kept separate from the
// router so the markup can be reused for the add and edit routes.

import { escapeHtml, renderMedicineRow, readMedicines, emptyMedicineHtml } from './medicine.js';
import { allICD } from './icd.js';

function value(field, fallback = '') {
  return field === null || field === undefined ? fallback : escapeHtml(field);
}

function selected(current, option) {
  return current === option ? ' selected' : '';
}

function icdDatalist() {
  return `<datalist id="health-icd-suggest">${allICD().map((entry) => `<option value="${escapeHtml(entry.code)}">${escapeHtml(entry.name)}</option>`).join('')}</datalist>`;
}

function medicineDatalist() {
  const suggestions = ['Paracetamol 500mg', 'Amoxicillin 500mg', 'Ibuprofen 400mg', 'Omeprazol 20mg', 'Cetirizin 10mg', 'Amlodipin 5mg', 'Metformin 500mg', 'Vitamin C 500mg'];
  return `<datalist id="health-medicine-suggest">${suggestions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>`;
}

export function renderInvoiceBlock(kind, title, invoiceUrl = '', ocrText = '') {
  const hasImage = Boolean(invoiceUrl);
  const previewSrc = hasImage ? escapeHtml(invoiceUrl) : '';
  return `<div class="health-invoice" data-invoice-block data-invoice-kind="${kind}">
    <div class="health-invoice__head">
      <strong>${escapeHtml(title)}</strong>
      <span class="health-badge health-badge--muted">OCR hoặc nhập tay</span>
    </div>
    <label class="health-dropzone${hasImage ? ' has-image' : ''}" data-dropzone>
      <input type="file" accept="image/*" data-invoice-input hidden aria-label="Chọn ảnh ${escapeHtml(title)}">
      ${hasImage ? `<img data-invoice-preview src="${previewSrc}" alt="Xem trước ${escapeHtml(title)}">` : '<img data-invoice-preview alt="Xem trước hoá đơn" hidden>'}
      <span class="health-dropzone__hint"${hasImage ? ' hidden' : ''}>
        <span aria-hidden="true">📎</span>
        <span>Kéo ảnh vào đây hoặc bấm để chọn</span>
        <small>JPG · PNG · WEBP</small>
      </span>
    </label>
    <div class="health-invoice__actions">
      <button type="button" class="health-secondary-button" data-invoice-ocr>🔍 OCR tự động</button>
      <button type="button" class="health-ghost-button" data-invoice-clear${hasImage ? '' : ' hidden'}>Xoá ảnh</button>
    </div>
    <p class="health-invoice__status" data-invoice-status role="status" aria-live="polite"></p>
    <textarea class="health-invoice__text" name="${kind}OcrText" rows="2" placeholder="Nội dung OCR sẽ hiện ở đây (bạn có thể sửa hoặc dán tay)">${value(ocrText)}</textarea>
    <input type="hidden" name="${kind}Invoice" value="${hasImage ? escapeHtml(invoiceUrl) : ''}" data-invoice-value>
  </div>`;
}

export function renderVisitForm(visit = {}, { mode = 'add', nextId = '' } = {}) {
  const patient = visit.patient || {};
  const info = visit.visit || {};
  const diagnosis = visit.diagnosis || {};
  const cost = visit.cost || {};
  const invoices = visit.invoices || {};
  const medicines = visit.medicines?.length ? visit.medicines : [{}];
  const today = new Date().toISOString().slice(0, 10);
  const title = mode === 'edit' ? 'Sửa lần khám bệnh' : 'Thêm lần khám bệnh';

  return `<form id="health-visit-form" class="health-card health-form" novalidate data-mode="${mode}">
    <input type="hidden" name="id" value="${value(visit.id)}">
    ${icdDatalist()}
    ${medicineDatalist()}

    <fieldset class="health-fieldset">
      <legend>Thông tin bệnh nhân</legend>
      <div class="health-form-grid">
        <label class="health-field">Họ và tên <span aria-hidden="true">*</span>
          <input name="fullName" type="text" maxlength="160" required value="${value(patient.fullName)}" placeholder="Nguyễn Văn A" autocomplete="name">
        </label>
        <label class="health-field">Mã bệnh nhân <span aria-hidden="true">*</span>
          <input name="patientId" type="text" maxlength="80" required value="${value(patient.patientId)}" placeholder="BN-2026-001">
        </label>
        <label class="health-field">Ngày sinh
          <input name="dob" type="date" value="${value(patient.dob)}">
        </label>
        <fieldset class="health-field health-choice">
          <legend>Giới tính</legend>
          <label><input type="radio" name="gender" value="male"${patient.gender === 'male' ? ' checked' : ''}> Nam</label>
          <label><input type="radio" name="gender" value="female"${patient.gender === 'female' ? ' checked' : ''}> Nữ</label>
          <label><input type="radio" name="gender" value="other"${patient.gender === 'other' ? ' checked' : ''}> Khác</label>
        </fieldset>
      </div>
    </fieldset>

    <fieldset class="health-fieldset">
      <legend>Thông tin lần khám</legend>
      <div class="health-form-grid">
        <label class="health-field">Cơ sở khám <span aria-hidden="true">*</span>
          <input name="facility" type="text" maxlength="200" required value="${value(info.facility)}" placeholder="Bệnh viện Đại học Y Dược">
        </label>
        <label class="health-field">Địa chỉ khám <span aria-hidden="true">*</span>
          <input name="address" type="text" maxlength="240" required value="${value(info.address)}" placeholder="215 Hồng Bàng, Q.5, TP.HCM">
        </label>
        <label class="health-field">Ngày khám <span aria-hidden="true">*</span>
          <input name="date" type="date" required value="${value(info.date, today)}">
        </label>
        <label class="health-field">Giờ khám
          <input name="time" type="time" value="${value(info.time)}">
        </label>
        <label class="health-field health-field--full">Bác sĩ
          <input name="doctor" type="text" maxlength="160" value="${value(info.doctor)}" placeholder="BS. Trần Thị B">
        </label>
      </div>
    </fieldset>

    <fieldset class="health-fieldset">
      <legend>Chẩn đoán</legend>
      <div class="health-form-grid">
        <label class="health-field">Bệnh gì (chẩn đoán) <span aria-hidden="true">*</span>
          <input name="disease" type="text" maxlength="240" required value="${value(diagnosis.disease)}" placeholder="Viêm đường hô hấp trên">
        </label>
        <label class="health-field">Mã ICD-10 <span aria-hidden="true">*</span>
          <span class="health-icd-field">
            <input name="icd" type="text" maxlength="20" required value="${value(diagnosis.icd)}" placeholder="J06.9" list="health-icd-suggest" autocomplete="off">
            <button type="button" class="health-ghost-button" data-icd-lookup aria-label="Tra cứu mã ICD đã nhập">Tra cứu</button>
          </span>
        </label>
        <label class="health-field health-field--full">Triệu chứng
          <textarea name="symptoms" rows="2" maxlength="1200" placeholder="Ho, sốt nhẹ, đau họng">${value(diagnosis.symptoms)}</textarea>
        </label>
        <label class="health-field health-field--full">Hướng điều trị <span aria-hidden="true">*</span>
          <textarea name="treatment" rows="3" maxlength="1200" required placeholder="Nghỉ ngơi, uống nhiều nước, tái khám sau 5 ngày nếu không đỡ">${value(diagnosis.treatment)}</textarea>
        </label>
        <label class="health-field health-field--full">Ghi chú
          <textarea name="notes" rows="2" maxlength="1200" placeholder="Ghi chú thêm">${value(diagnosis.notes)}</textarea>
        </label>
      </div>
      <p class="health-icd-result" data-icd-result role="status" aria-live="polite"></p>
    </fieldset>

    <fieldset class="health-fieldset">
      <legend>Thuốc điều trị</legend>
      <div data-medicine-list>${medicines.map((med, index) => renderMedicineRow(med, index)).join('')}</div>
      <button type="button" class="health-secondary-button" data-add-medicine>＋ Thêm thuốc</button>
      <p class="health-empty" data-medicine-empty hidden>Chưa thêm thuốc nào. Bấm “Thêm thuốc” để ghi từng loại với công dụng riêng.</p>
      <div class="health-interactions" data-interactions role="status" aria-live="polite" hidden></div>
    </fieldset>

    <fieldset class="health-fieldset">
      <legend>Chi phí</legend>
      <div class="health-form-grid">
        <label class="health-field">Tiền khám (đ)
          <input name="examFee" type="number" min="0" step="1000" value="${value(cost.examFee, 0)}" inputmode="numeric">
        </label>
        <label class="health-field">Tiền thuốc (đ)
          <input name="medicineFee" type="number" min="0" step="1000" value="${value(cost.medicineFee, 0)}" inputmode="numeric">
        </label>
        <label class="health-field">Tổng cộng (tự tính)
          <input name="total" type="text" value="${escapeHtml((cost.total ?? 0).toLocaleString('vi-VN'))} đ" readonly data-total-display aria-readonly="true">
        </label>
        <label class="health-field">BHYT chi trả (đ)
          <input name="insurance" type="number" min="0" step="1000" value="${value(cost.insurance, 0)}" inputmode="numeric">
        </label>
        <label class="health-field health-field--full">Thực trả (tự tính)
          <input name="paid" type="text" value="${escapeHtml((cost.paid ?? 0).toLocaleString('vi-VN'))} đ" readonly data-paid-display aria-readonly="true">
        </label>
      </div>
    </fieldset>

    <fieldset class="health-fieldset">
      <legend>Hoá đơn (OCR hoặc nhập tay)</legend>
      <div class="health-invoice-grid">
        ${renderInvoiceBlock('exam', 'Hoá đơn khám', invoices.examInvoiceUrl, invoices.examOcrText)}
        ${renderInvoiceBlock('medicine', 'Hoá đơn thuốc', invoices.medicineInvoiceUrl, invoices.medicineOcrText)}
      </div>
      <p class="health-muted">Sau khi OCR, thông tin sẽ tự điền vào form phía trên — bạn kiểm tra và sửa lại trước khi lưu. Ảnh được nén và lưu ngay trên thiết bị này.</p>
    </fieldset>

    <div class="health-actions">
      <a class="health-secondary-button" href="#/health/history">❌ Huỷ</a>
      <button class="health-primary-button" type="submit">💾 ${mode === 'edit' ? 'Cập nhật lần khám' : 'Lưu lần khám'}</button>
    </div>
  </form>`;
}

export function readVisitForm(form) {
  const data = new FormData(form);
  const scalar = (name) => String(data.get(name) ?? '');
  return {
    id: scalar('id'),
    fullName: scalar('fullName'),
    patientId: scalar('patientId'),
    dob: scalar('dob'),
    gender: scalar('gender'),
    facility: scalar('facility'),
    address: scalar('address'),
    date: scalar('date'),
    time: scalar('time'),
    doctor: scalar('doctor'),
    disease: scalar('disease'),
    icd: scalar('icd'),
    symptoms: scalar('symptoms'),
    treatment: scalar('treatment'),
    notes: scalar('notes'),
    medicines: readMedicines(form),
    examFee: scalar('examFee'),
    medicineFee: scalar('medicineFee'),
    insurance: scalar('insurance'),
    examInvoice: scalar('examInvoice'),
    medicineInvoice: scalar('medicineInvoice'),
    examOcrText: scalar('examOcrText'),
    medicineOcrText: scalar('medicineOcrText'),
  };
}

export { emptyMedicineHtml };
