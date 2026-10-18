import { escapeHtml } from './medicine.js';
import { icon } from '../icons.js';

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

function medicationParts(value) {
  const parts = String(value).split(/\s+[—–-]\s+/);
  return { name: parts.shift() || String(value), detail: parts.join(' — ') };
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
      <h3>${icon('stethoscope', { size: 19 })} Triệu chứng</h3>
      ${symptoms.length
        ? `<div class="medical-info-tags">${symptoms.map((item) => `<span class="medical-info-tag">${escapeHtml(item)}</span>`).join('')}</div>`
        : '<p class="medical-info-empty">Chưa nhận diện được.</p>'}
    </section>
    <details class="medical-info-card medical-info-card--medications" open>
      <summary class="medical-info-card__summary"><span>${icon('pill', { size: 19 })} Thuốc liên quan</span><span class="medical-info-card__summary-icon">${icon('plus', { size: 16 })}</span></summary>
      ${medications.length
        ? `<ul class="medical-medication-checklist">${medications.map((item) => {
          const medication = medicationParts(item);
          return `<li><details><summary><span class="medical-check-icon">${icon('check', { size: 16 })}</span><strong>${escapeHtml(medication.name)}</strong><span class="medical-info-card__summary-icon">${icon('plus', { size: 15 })}</span></summary>${medication.detail ? `<p>${escapeHtml(medication.detail)}</p>` : ''}</details></li>`;
        }).join('')}</ul>`
        : '<p class="medical-info-empty">Chưa nhận diện được.</p>'}
    </details>
    <details class="medical-info-card medical-info-card--treatment" open>
      <summary class="medical-info-card__summary"><span>${icon('activity', { size: 19 })} Điều trị chi tiết</span><span class="medical-info-card__summary-icon">${icon('plus', { size: 16 })}</span></summary>
      ${treatmentPoints.length
        ? `<ul class="medical-treatment-list">${treatmentPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>${treatmentToggle}`
        : '<p class="medical-info-empty">Chưa nhận diện được.</p>'}
    </details>
  </div>`;
}
