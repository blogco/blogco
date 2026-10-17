// Router + view layer cho trang "BlogCo Corporate Identity & Brand Guidelines".
//
// Route (hash based, mount trên trang chủ):
//   #/brand-guidelines → bảng màu, typography, UI components, CSS tokens
//   #/ci               → alias của #/brand-guidelines

const mountedRoots = new WeakSet();

// ---------------------------------------------------------------------------
// Nội dung design system (nguồn dữ liệu duy nhất cho cả bảng màu và token CSS)
// ---------------------------------------------------------------------------

const COLOR_TOKENS = [
  {
    name: 'Primary — Samsung Blue',
    token: '--blogco-primary',
    hex: '#1428A0',
    usage: 'Logo BlogCo, nút CTA chính, tiêu đề H1/H2, cột/phân đoạn biểu đồ chủ đạo.',
  },
  {
    name: 'Primary Hover — Deep Indigo',
    token: '--blogco-primary-hover',
    hex: '#0F1F7A',
    usage: 'Trạng thái hover/pressed của nút chính, liên kết đang focus.',
  },
  {
    name: 'Secondary Accent — Sky Blue',
    token: '--blogco-accent-sky',
    hex: '#0689D8',
    usage: 'Active state, border nổi bật, điểm nhấn biểu đồ và thanh tiến trình.',
  },
  {
    name: 'Accent Background — Soft Blue',
    token: '--blogco-accent-bg',
    hex: '#E8F0FE',
    usage: 'Nền card thông báo, badge/tag nổi bật, trạng thái hover của bảng.',
  },
  {
    name: 'Background — Pure White',
    token: '--blogco-bg',
    hex: '#FFFFFF',
    usage: 'Nền trang giao diện sáng (Light Mode), ưu tiên khoảng trắng rộng rãi.',
  },
  {
    name: 'Surface — Card Background',
    token: '--blogco-card-bg',
    hex: '#F7F7F7',
    usage: 'Nền card hiển thị nội dung, nền bảng biểu dữ liệu.',
  },
  {
    name: 'Text — Title / High Contrast',
    token: '--blogco-text-main',
    hex: '#000000',
    usage: 'Tiêu đề H1, H2, H3 và các nhãn quan trọng.',
  },
  {
    name: 'Text — Body',
    token: '--blogco-text-body',
    hex: '#75787B',
    usage: 'Nội dung bài viết, đoạn văn bản chính.',
  },
  {
    name: 'Text — Muted / Secondary',
    token: '--blogco-text-muted',
    hex: '#A6A6A6',
    usage: 'Ngày tháng, tác giả, ghi chú phụ, chú thích.',
  },
  {
    name: 'Border — Hairline',
    token: '--blogco-border',
    hex: '#E6E6E6',
    usage: 'Viền mảnh phân tách card, bảng và các khối nội dung.',
  },
];

const CSS_TOKENS = `:root {
  --blogco-primary: #1428A0;
  --blogco-primary-hover: #0F1F7A;
  --blogco-accent-sky: #0689D8;
  --blogco-accent-bg: #E8F0FE;
  --blogco-bg: #FFFFFF;
  --blogco-card-bg: #F7F7F7;
  --blogco-text-main: #000000;
  --blogco-text-body: #75787B;
  --blogco-text-muted: #A6A6A6;
  --blogco-border: #E6E6E6;
  --blogco-font-family: 'SamsungOne', 'Helvetica Neue', Arial, sans-serif;
  --blogco-font-display: 'Samsung Sharp Sans', 'Helvetica Neue', Arial, sans-serif;
}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const int = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader() {
  return `<header class="brand-hero">
    <p class="brand-eyebrow">BLOGCO · DESIGN SYSTEM</p>
    <h1 class="brand-hero__title" tabindex="-1">BlogCo Corporate Identity &amp; Brand Guidelines</h1>
    <p class="brand-lead">Hệ thống nhận diện thương hiệu theo ngôn ngữ thiết kế <em>Samsung Corporate</em>: đắm chìm, năng động, khác biệt. Trang này là nguồn tham chiếu duy nhất cho màu sắc, typography và các UI component dùng trên toàn bộ BlogCo.</p>
    <div class="brand-lockups" aria-label="Mẫu logo BlogCo">
      <div class="brand-lockup brand-lockup--light">
        <span class="brand-lockup__mark" aria-hidden="true">◆</span>
        <span class="brand-lockup__word">BlogCo</span>
      </div>
      <div class="brand-lockup brand-lockup--brand">
        <span class="brand-lockup__mark" aria-hidden="true">◆</span>
        <span class="brand-lockup__word">BlogCo</span>
      </div>
    </div>
  </header>`;
}

function renderColorCard(color) {
  const { r, g, b } = hexToRgb(color.hex);
  return `<article class="brand-swatch" data-swatch="${escapeHtml(color.token)}">
    <div class="brand-swatch__chip" style="background:${color.hex}" role="img" aria-label="Màu ${escapeHtml(color.name)}"></div>
    <div class="brand-swatch__body">
      <h3 class="brand-swatch__name">${escapeHtml(color.name)}</h3>
      <code class="brand-swatch__token">${escapeHtml(color.token)}</code>
      <dl class="brand-swatch__meta">
        <div><dt>HEX</dt><dd>${color.hex.toUpperCase()}</dd></div>
        <div><dt>RGB</dt><dd>${r}, ${g}, ${b}</dd></div>
      </dl>
      <p class="brand-swatch__usage">${escapeHtml(color.usage)}</p>
    </div>
  </article>`;
}

function renderColors() {
  return `<section class="brand-section" aria-labelledby="brand-colors">
    <p class="brand-section__index">01 · Color Palette</p>
    <h2 id="brand-colors">Bảng màu thương hiệu</h2>
    <p class="brand-section__intro">Bảng màu chuẩn Samsung Corporate (Samsung Blue · Trắng · Xám trung tính). Mỗi màu đi kèm mã HEX, RGB và phạm vi áp dụng.</p>
    <div class="brand-swatches">${COLOR_TOKENS.map(renderColorCard).join('')}</div>
  </section>`;
}

function typeRow(tag, spec, sampleHtml) {
  return `<div class="brand-type-row">
    <div class="brand-type-row__meta">
      <span class="brand-type-tag">${escapeHtml(tag)}</span>
      <code class="brand-type-spec">${escapeHtml(spec)}</code>
    </div>
    <div class="brand-type-row__sample">${sampleHtml}</div>
  </div>`;
}

function renderTypography() {
  return `<section class="brand-section" aria-labelledby="brand-type">
    <p class="brand-section__index">02 · Typography</p>
    <h2 id="brand-type">Quy chuẩn Typography</h2>
    <p class="brand-section__intro">Font chính: <code>SamsungOne</code> (body) và <code>Samsung Sharp Sans</code> (tiêu đề) cùng hệ font dự phòng. Thang kích thước &amp; line-height thống nhất cho toàn site.</p>
    <div class="brand-font-note">
      <strong>Primary font-family</strong>
      <code>'SamsungOne', 'Helvetica Neue', Arial, sans-serif</code>
    </div>
    <div class="brand-type-list">
      ${typeRow('H1', '2.25rem (36px) · 700 · lh 1.2 · #1428A0', '<h1 class="brand-demo-h1">Điều hướng bằng dữ liệu</h1>')}
      ${typeRow('H2', '1.75rem (28px) · 600 · lh 1.3 · #000000', '<h2 class="brand-demo-h2">Kết nối con người, vận hành thông minh</h2>')}
      ${typeRow('H3', '1.25rem (20px) · 600 · lh 1.4 · #1428A0', '<h3 class="brand-demo-h3">Kết nối người dùng với mọi dịch vụ</h3>')}
      ${typeRow('Body', '1.0rem (16px) · 400 · lh 1.6 · #75787B', '<p class="brand-demo-p">BlogCo xây dựng nội dung rõ ràng, mạch lạc và dễ đọc. Mọi đoạn văn giữ nhịp thở thoáng với line-height 1.6, đảm bảo trải nghiệm đọc thoải mái trên mọi thiết bị.</p>')}
      ${typeRow('Link', 'Inherit body · #1428A0 · gạch chân 1px', '<p class="brand-demo-p">Xem thêm trong <a href="#/brand-guidelines">tài liệu thương hiệu BlogCo</a> để biết chi tiết.</p>')}
      ${typeRow('Blockquote', 'Body · viền trái 4px #0689D8 · nền #E8F0FE', '<blockquote class="brand-demo-quote">Thiết kế tốt là thiết kế ít đi — mỗi thành phần đều phải phục vụ người đọc.</blockquote>')}
      ${typeRow('Small', '0.875rem (14px) · 400 · #A6A6A6', '<p class="brand-demo-small">Cập nhật lần cuối · 15/10/2026 · BlogCo Design Team</p>')}
    </div>
  </section>`;
}

function renderComponents() {
  return `<section class="brand-section" aria-labelledby="brand-components">
    <p class="brand-section__index">03 · UI Components</p>
    <h2 id="brand-components">Thư viện thành phần giao diện</h2>
    <p class="brand-section__intro">Các mẫu component tái sử dụng theo gam Samsung Blue · Trắng · Xám trung tính: nút bấm, card nội dung / thống kê và bảng dữ liệu.</p>

    <h3 class="brand-subtitle">Buttons</h3>
    <div class="brand-buttons">
      <button type="button" class="brand-btn brand-btn--primary">Primary Button</button>
      <button type="button" class="brand-btn brand-btn--secondary">Secondary Button</button>
      <button type="button" class="brand-btn brand-btn--outline">Outline Button</button>
      <button type="button" class="brand-btn brand-btn--ghost">Ghost Button</button>
    </div>

    <h3 class="brand-subtitle">Cards</h3>
    <div class="brand-cards">
      <article class="brand-card brand-card--article">
        <div class="brand-card__thumb" aria-hidden="true"></div>
        <div class="brand-card__body">
          <p class="brand-card__meta">TIN TỨC · 15/10/2026</p>
          <h4 class="brand-card__title">Tối ưu vận hành giao hàng cho doanh nghiệp</h4>
          <p class="brand-card__text">Ứng dụng dữ liệu vận hành để cắt giảm chi phí và tăng tốc độ giao hàng trên mọi khu vực.</p>
          <span class="brand-card__more">Đọc tiếp →</span>
        </div>
      </article>
      <article class="brand-card brand-card--stat">
        <p class="brand-stat__label">Tổng chi phí tháng 10</p>
        <p class="brand-stat__value">1.284.000 <span>đ</span></p>
        <p class="brand-stat__delta brand-stat__delta--up">▲ 12,4% so với tháng trước</p>
        <div class="brand-stat__bar" role="presentation"><span style="width: 68%"></span></div>
      </article>
    </div>

    <h3 class="brand-subtitle">Data Table</h3>
    <div class="brand-table-wrap">
      <table class="brand-table">
        <caption class="brand-table__caption">Chi phí theo thương hiệu</caption>
        <thead>
          <tr><th scope="col">Thương hiệu</th><th scope="col">Số giao dịch</th><th scope="col" class="is-num">Tổng tiền</th><th scope="col" class="is-num">Tỉ trọng</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">Highlands Coffee</th><td>12</td><td class="is-num">820.000 đ</td><td class="is-num">63,9%</td></tr>
          <tr><th scope="row">The Coffee House</th><td>5</td><td class="is-num">284.000 đ</td><td class="is-num">22,1%</td></tr>
          <tr><th scope="row">Phúc Long</th><td>3</td><td class="is-num">180.000 đ</td><td class="is-num">14,0%</td></tr>
        </tbody>
        <tfoot>
          <tr><th scope="row">Tổng cộng</th><td>20</td><td class="is-num">1.284.000 đ</td><td class="is-num">100%</td></tr>
        </tfoot>
      </table>
    </div>
  </section>`;
}

function renderTokens() {
  return `<section class="brand-section" aria-labelledby="brand-tokens">
    <p class="brand-section__index">04 · CSS Tokens</p>
    <h2 id="brand-tokens">CSS Global Variables</h2>
    <p class="brand-section__intro">Dán khối biến dưới đây vào <code>:root</code> để mọi trang trong BlogCo tái sử dụng thống nhất màu sắc và font chữ.</p>
    <div class="brand-code">
      <div class="brand-code__head">
        <span class="brand-code__lang">CSS</span>
        <button type="button" class="brand-btn brand-btn--outline brand-code__copy" data-brand-copy>📋 Copy CSS</button>
      </div>
      <pre class="brand-code__pre"><code>${escapeHtml(CSS_TOKENS)}</code></pre>
    </div>
  </section>`;
}

export function renderBrandGuidelines() {
  return `<div class="brand-screen">
    ${renderHeader()}
    ${renderColors()}
    ${renderTypography()}
    ${renderComponents()}
    ${renderTokens()}
  </div>`;
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountBrandApp(root) {
  if (mountedRoots.has(root)) return;
  mountedRoots.add(root);
  root.innerHTML = renderBrandGuidelines();

  root.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('[data-brand-copy]');
    if (!copyButton) return;
    const original = copyButton.textContent;
    try {
      await navigator.clipboard.writeText(CSS_TOKENS);
      copyButton.textContent = '✅ Đã copy';
    } catch {
      copyButton.textContent = '⚠️ Không copy được';
    }
    setTimeout(() => { copyButton.textContent = original; }, 2000);
  });
}

export { COLOR_TOKENS, CSS_TOKENS };
