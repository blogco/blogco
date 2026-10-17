import { escapeHtml } from './medicine.js';

function removeLabel(recommendation) {
  return recommendation.removeIds.map((inputId) => `<code>${escapeHtml(inputId)}</code>`).join(', ');
}

export function renderRecommendationPanel(recommendations = []) {
  return `<section class="health-card medical-recommendations" aria-labelledby="medical-recommendations-title">
    <div class="medical-recommendations__head">
      <div><h2 id="medical-recommendations-title">💡 Đề xuất xử lý trùng lặp</h2><p>${recommendations.length ? 'Hệ thống ưu tiên bản ghi đầy đủ, mới và đã đồng bộ hơn.' : 'Chưa có đề xuất cần xử lý.'}</p></div>
      <button type="button" class="health-secondary-button" data-medical-recommend-apply-all${recommendations.length ? '' : ' disabled'}>Áp dụng tất cả đề xuất</button>
    </div>
    ${recommendations.length
      ? `<div class="medical-recommendations__list">${recommendations.map((recommendation) => `<article class="medical-recommendation" data-medical-recommendation="${escapeHtml(recommendation.key)}">
          <p class="medical-recommendation__pair"><strong>Cặp bản ghi:</strong> ${recommendation.clusterIds.map((inputId) => `<code>${escapeHtml(inputId)}</code>`).join(' <span aria-hidden="true">↔</span> ')}</p>
          <p><strong>Độ tương đồng:</strong> ${recommendation.percentage}%</p>
          <p class="medical-recommendation__decision"><strong>Đề xuất:</strong> <span>✅ Giữ lại: ${escapeHtml(recommendation.keepId)}</span> <span>🗑️ Nên xoá: ${removeLabel(recommendation)}</span></p>
          <p class="medical-recommendation__reason"><strong>Lý do:</strong> ${escapeHtml(recommendation.reason)}</p>
          <div class="health-actions"><button type="button" class="health-primary-button" data-medical-recommend-apply="${escapeHtml(recommendation.key)}">Áp dụng</button><button type="button" class="health-ghost-button" data-medical-recommend-skip="${escapeHtml(recommendation.key)}">Bỏ qua</button></div>
        </article>`).join('')}</div>`
      : '<p class="medical-info-empty">Không có đề xuất trùng lặp đang chờ xử lý.</p>'}
  </section>`;
}
