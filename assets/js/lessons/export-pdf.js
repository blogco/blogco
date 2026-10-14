// Xuất giáo án ra PDF.
// Lazy-load html2pdf.js (chỉ tải khi bấm xuất) và render từ một root A4 landscape
// tách biệt với phần xem trước để kích thước mm luôn chuẩn.

const HTML2PDF_URL = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
const EXPORT_ROOT_ID = 'lesson-pdf-root';

let html2pdfPromise;

function loadHtml2pdf() {
  if (typeof window !== 'undefined' && window.html2pdf) return Promise.resolve(window.html2pdf);
  if (!html2pdfPromise) {
    html2pdfPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = HTML2PDF_URL;
      script.async = true;
      script.onload = () => (window.html2pdf ? resolve(window.html2pdf) : reject(new Error('html2pdf tải xong nhưng không khả dụng.')));
      script.onerror = () => reject(new Error('Không tải được html2pdf (kiểm tra kết nối mạng).'));
      document.head.appendChild(script);
    });
  }
  return html2pdfPromise;
}

function ensureExportRoot() {
  let root = document.getElementById(EXPORT_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = EXPORT_ROOT_ID;
    root.className = 'pdf-export-root';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  return root;
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') return resolve();
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function printFallback(root) {
  document.body.classList.add('pdf-print-mode');
  const cleanup = () => {
    document.body.classList.remove('pdf-print-mode');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  // Trình duyệt không phát 'afterprint' (một số bản cũ) — dọn sau 60 giây.
  setTimeout(cleanup, 60000);
}

export async function exportLessonPdf(html, options = {}) {
  const filename = options.filename || `giao-an-${Date.now()}.pdf`;
  const root = ensureExportRoot();
  root.innerHTML = html;
  await nextFrame();

  try {
    const html2pdf = await loadHtml2pdf();
    await html2pdf().set({
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(root).save();
    root.innerHTML = '';
    return { method: 'html2pdf', filename };
  } catch (error) {
    // Không tải được thư viện/không render được → mở hộp thoại in để lưu PDF.
    printFallback(root);
    return { method: 'print', filename, error };
  }
}

export function slugifyFileName(text = 'giao-an') {
  const slug = String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `giao-an-${slug || 'blogco'}-${Date.now()}.pdf`;
}

export { loadHtml2pdf };
