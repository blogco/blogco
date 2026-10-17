import { escapeHtml } from './medicine.js';

export function splitTreatment(value = '') {
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/[.!?。！？]+(?=\s|$)/g, '\n')
    .replace(/[;；]+/g, '\n')
    .split(/\n+/)
    .map((item) => item.replace(/^\s*[-•*]\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function listValue(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function renderMedicalInfographic(entry, collapsed = false) {
  const symptoms = listValue(entry.symptoms);
  const medications = listValue(entry.relatedMedications || entry.medications);
  const treatmentPoints = splitTreatment(entry.treatment);
  const treatmentToggle = treatmentPoints.length > 3
    ? `<button type="button" class="medical-info-card__toggle" data-medical-toggle aria-expanded="${String(!collapsed)}">${collapsed ? 'Mở ra ▼' : 'Thu gọn ▲'}</button>`
    : '';

  return `<div class="medical-infographic" aria-label="Tóm tắt tri thức y khoa">
    <section class="medical-info-card medical-info-card--symptoms">
      <h3><span aria-hidden="true">🩺</span> Triệu chứng</h3>
      ${symptoms.length
        ? `<div class="medical-info-tags">${symptoms.map((item) => `<span class="medical-info-tag">${escapeHtml(item)}</span>`).join('')}</div>`
        : '<p class="medical-info-empty">Chưa nhận diện được.</p>'}
    </section>
    <section class="medical-info-card medical-info-card--medications">
      <h3><span aria-hidden="true">💊</span> Thuốc liên quan</h3>
      ${medications.length
        ? `<ul class="medical-medication-checklist">${medications.map((item) => `<li><span aria-hidden="true">✓</span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>`
        : '<p class="medical-info-empty">Chưa nhận diện được.</p>'}
    </section>
    <section class="medical-info-card medical-info-card--treatment">
      <h3><span aria-hidden="true">🏥</span> Điều trị</h3>
      ${treatmentPoints.length
        ? `<ul class="medical-treatment-list">${treatmentPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>${treatmentToggle}`
        : '<p class="medical-info-empty">Chưa nhận diện được.</p>'}
    </section>
  </div>`;
}
