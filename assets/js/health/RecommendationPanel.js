import { escapeHtml } from './medicine.js';
import { icon } from '../icons.js';

function formatCreatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'không rõ ngày';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function renderRecommendationPanel(recommendations = []) {
  return `<section class="health-card medical-recommendations" aria-labelledby="medical-recommendations-title">
    <div class="medical-recommendations__head">
      <div><h2 id="medical-recommendations-title">${icon('sparkles', { size: 20 })} Đề xuất xử lý trùng lặp</h2><p>${recommendations.length ? 'Bản ghi nhập sớm nhất luôn được bảo vệ là nội dung gốc.' : 'Chưa có đề xuất cần xử lý.'}</p></div>
      <button type="button" class="health-secondary-button" data-medical-recommend-apply-all${recommendations.length ? '' : ' disabled'}>Áp dụng tất cả đề xuất</button>
    </div>
    ${recommendations.length
      ? `<div class="medical-recommendations__list">${recommendations.map((recommendation) => `<article class="medical-recommendation" data-medical-recommendation="${escapeHtml(recommendation.key)}">
          <p class="medical-recommendation__pair"><strong>Cụm trùng lặp:</strong> ${recommendation.clusterIds.map((inputId) => `<code>${escapeHtml(inputId)}</code>`).join(' <span aria-hidden="true">↔</span> ')}</p>
          <p><strong>Độ tương đồng:</strong> ${recommendation.percentage}%</p>
          <p class="medical-recommendation__original">${icon('pin', { size: 16 })} <strong>Nội dung gốc (Giữ lại):</strong> ${escapeHtml(recommendation.original.inputId)} (nhập ${formatCreatedAt(recommendation.original.createdAt)})</p>
          <div class="medical-recommendation__deletions"><strong>${icon('trash', { size: 16 })} Nên xoá:</strong>${recommendation.toDelete.map((record) => `<p><code>${escapeHtml(record.inputId)}</code> (nhập ${formatCreatedAt(record.createdAt)}) — ${escapeHtml(record.reason)}</p>`).join('')}</div>
          <div class="health-actions"><button type="button" class="health-primary-button" data-medical-recommend-apply="${escapeHtml(recommendation.key)}">Áp dụng</button><button type="button" class="health-ghost-button" data-medical-recommend-skip="${escapeHtml(recommendation.key)}">Bỏ qua</button></div>
        </article>`).join('')}</div>`
      : '<p class="medical-info-empty">Không có đề xuất trùng lặp đang chờ xử lý.</p>'}
  </section>`;
}
