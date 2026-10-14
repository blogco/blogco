document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-upload-button]');
  if (button) {
    const form = document.querySelector('[data-editor-form]');
    const file = document.querySelector('[data-upload-file]')?.files?.[0];
    const status = document.querySelector('[data-upload-status]');
    const csrf = form?.querySelector('[name="csrf"]')?.value;
    if (!file) { if (status) status.textContent = 'Chọn một ảnh trước.'; return; }
    const payload = new FormData(); payload.append('file', file); payload.append('csrf', csrf || '');
    button.disabled = true;
    try {
      const response = await fetch('/upload', { method: 'POST', body: payload, credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Tải ảnh thất bại.');
      const image = form.querySelector('[data-image-url]'); image.value = result.url;
      if (status) status.textContent = `Đã tải ${result.filename}; lưu bài để giữ đường dẫn này.`;
    } catch (error) { if (status) status.textContent = error.message; }
    finally { button.disabled = false; }
  }
  const publish = event.target.closest('[data-publish]');
  if (publish && !window.confirm('Lưu bài, tạo commit chỉ cho bài/ảnh này và push lên origin/main?')) event.preventDefault();
});
