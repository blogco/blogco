// Renders the "Thêm / sửa giao dịch cà phê" form and reads it back. Kept separate
// from the router so the markup can be reused for the edit and detail views.

import { escapeHtml, toNumber } from './store.js';
import { CATEGORY_LABELS, POPULAR_ITEMS } from './menu.js';
import { EXPENSE_CATEGORIES } from './expense.js';

function value(field, fallback = '') {
  return field === null || field === undefined ? fallback : escapeHtml(field);
}

function selected(current, option) {
  return current === option ? ' selected' : '';
}

export function renderItemRow(item = {}, index = 0) {
  const qty = item.qty ?? 1;
  const unit = item.unitPrice ?? '';
  const amount = item.amount ?? '';
  const category = item.category || 'other';
  return `<div class="coffee-item-row" data-item-row>
    <label class="coffee-field coffee-field--name">Tên món
      <input name="itemName" type="text" maxlength="160" list="coffee-item-suggest" value="${value(item.name)}" placeholder="Phin sữa đá">
    </label>
    <label class="coffee-field coffee-field--qty">SL
      <input name="itemQty" type="number" min="1" max="999" step="1" value="${value(qty)}" inputmode="numeric">
    </label>
    <label class="coffee-field coffee-field--unit">Đơn giá (đ)
      <input name="itemUnitPrice" type="number" min="0" step="1000" value="${value(unit)}" inputmode="numeric" placeholder="45000">
    </label>
    <label class="coffee-field coffee-field--amount">Thành tiền (đ)
      <input name="itemAmount" type="number" min="0" step="1000" value="${value(amount)}" inputmode="numeric" placeholder="45000">
    </label>
    <label class="coffee-field coffee-field--category">Nhóm
      <select name="itemCategory">
        ${Object.entries(CATEGORY_LABELS).map(([key, label]) => `<option value="${key}"${selected(category, key)}>${escapeHtml(label)}</option>`).join('')}
      </select>
    </label>
    <button type="button" class="coffee-ghost-button coffee-item-remove" data-remove-item aria-label="Xoá món ${index + 1}">✕</button>
  </div>`;
}

function itemSuggestions() {
  return `<datalist id="coffee-item-suggest">${POPULAR_ITEMS.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>`;
}

export function renderReceiptForm(receipt = {}, { mode = 'add', nextId = '' } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const items = receipt.items?.length ? receipt.items : [{}];
  const title = mode === 'edit' ? 'Sửa giao dịch' : 'Thêm giao dịch';
  const paymentOptions = [['', 'Chưa rõ'], ['cash', 'Tiền mặt'], ['card', 'Thẻ'], ['ewallet', 'Ví điện tử'], ['transfer', 'Chuyển khoản'], ['other', 'Khác']];

  return `<form id="coffee-receipt-form" class="coffee-card coffee-form" novalidate data-mode="${mode}">
    <input type="hidden" name="id" value="${value(receipt.id)}">
    ${itemSuggestions()}

    <fieldset class="coffee-fieldset">
      <legend>Thông tin chung</legend>
      <div class="coffee-form-grid">
        <label class="coffee-field">Quán / chi nhánh <span aria-hidden="true">*</span>
          <input name="store" type="text" maxlength="160" required value="${value(receipt.store)}" placeholder="Highlands Coffee - Landmark 81">
        </label>
        <label class="coffee-field">Mã hoá đơn
          <input name="orderCode" type="text" maxlength="80" value="${value(receipt.orderCode)}" placeholder="HD-000123">
        </label>
        <label class="coffee-field">Ngày <span aria-hidden="true">*</span>
          <input name="date" type="date" required value="${value(receipt.date, today)}">
        </label>
        <label class="coffee-field">Giờ
          <input name="time" type="time" value="${value(receipt.time)}">
        </label>
        <label class="coffee-field coffee-field--full">Địa chỉ
          <input name="address" type="text" maxlength="240" value="${value(receipt.address)}" placeholder="Tầng 1, Vincom Landmark 81, Q. Bình Thạnh">
        </label>
        <label class="coffee-field">Hình thức thanh toán
          <select name="paymentMethod">
            ${paymentOptions.map(([key, label]) => `<option value="${key}"${selected(receipt.paymentMethod || '', key)}>${label}</option>`).join('')}
          </select>
        </label>
        <label class="coffee-field">Danh mục chi phí
          <select name="expenseCategory">
            <option value=""${receipt.expenseCategory ? '' : ' selected'}>✨ Tự động (AI phân loại)</option>
            ${EXPENSE_CATEGORIES.map((category) => `<option value="${category.key}"${selected(receipt.expenseCategory || '', category.key)}>${category.emoji} ${escapeHtml(category.label)}</option>`).join('')}
          </select>
        </label>
        <label class="coffee-field">Khách hàng
          <input name="customer" type="text" maxlength="120" value="${value(receipt.customer)}" placeholder="Nguyễn Duy Khang">
        </label>
      </div>
    </fieldset>

    <fieldset class="coffee-fieldset">
      <legend>Món đã gọi</legend>
      <div data-item-list>${items.map((item, index) => renderItemRow(item, index)).join('')}</div>
      <button type="button" class="coffee-secondary-button" data-add-item>＋ Thêm món</button>
      <p class="coffee-empty" data-item-empty hidden>Chưa có món nào. Bấm “Thêm món” hoặc để trống nếu chỉ muốn ghi tổng tiền.</p>
    </fieldset>

    <fieldset class="coffee-fieldset">
      <legend>Chi phí</legend>
      <div class="coffee-form-grid">
        <label class="coffee-field">Tổng tiền hàng (tự tính)
          <input name="subtotal" type="text" value="${escapeHtml((receipt.subtotal ?? 0).toLocaleString('vi-VN'))}" readonly data-subtotal-display aria-readonly="true">
          <input type="hidden" name="subtotalValue" value="${value(receipt.subtotal, 0)}">
        </label>
        <label class="coffee-field">Giảm giá (đ)
          <input name="discount" type="number" min="0" step="1000" value="${value(receipt.discount, 0)}" inputmode="numeric">
        </label>
        <label class="coffee-field">VAT / thuế (đ)
          <input name="vat" type="number" min="0" step="1000" value="${value(receipt.vat, 0)}" inputmode="numeric">
        </label>
        <label class="coffee-field">Tổng thanh toán (tự tính)
          <input name="total" type="text" value="${escapeHtml((receipt.total ?? 0).toLocaleString('vi-VN'))} đ" readonly data-total-display aria-readonly="true">
          <input type="hidden" name="totalValue" value="${value(receipt.total, 0)}">
        </label>
      </div>
    </fieldset>

    <fieldset class="coffee-fieldset">
      <legend>Ghi chú</legend>
      <label class="coffee-field coffee-field--full">
        <textarea name="note" rows="3" maxlength="600" placeholder="Ví dụ: đi với đồng nghiệp, họp sáng...">${value(receipt.note)}</textarea>
      </label>
    </fieldset>

    <div class="coffee-actions">
      <a class="coffee-secondary-button" href="#/coffee">❌ Huỷ</a>
      <button class="coffee-primary-button" type="submit">💾 ${title === 'Sửa giao dịch' ? 'Cập nhật giao dịch' : 'Lưu giao dịch'}</button>
    </div>
  </form>`;
}

export function readItems(form) {
  return [...form.querySelectorAll('[data-item-row]')].map((row) => ({
    name: row.querySelector('[name="itemName"]')?.value || '',
    qty: row.querySelector('[name="itemQty"]')?.value || '1',
    unitPrice: row.querySelector('[name="itemUnitPrice"]')?.value || '',
    amount: row.querySelector('[name="itemAmount"]')?.value || '',
    category: row.querySelector('[name="itemCategory"]')?.value || 'other',
  })).filter((item) => item.name.trim() || toNumber(item.amount));
}

export function readReceiptForm(form) {
  const data = new FormData(form);
  const scalar = (name) => String(data.get(name) ?? '');
  return {
    id: scalar('id'),
    store: scalar('store'),
    address: scalar('address'),
    date: scalar('date'),
    time: scalar('time'),
    orderCode: scalar('orderCode'),
    customer: scalar('customer'),
    paymentMethod: scalar('paymentMethod'),
    expenseCategory: scalar('expenseCategory'),
    note: scalar('note'),
    subtotal: scalar('subtotalValue'),
    discount: scalar('discount'),
    vat: scalar('vat'),
    total: scalar('totalValue'),
    items: readItems(form),
  };
}
