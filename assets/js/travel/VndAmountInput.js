const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const ACCEPTED_FORMATTING = /[.\s,\u00a0\u202f]/g;

export function normalizeVndDigits(value) {
  return String(value ?? '').replace(ACCEPTED_FORMATTING, '');
}

export function formatVndDigits(digits) {
  const normalized = String(digits ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!normalized) return '';
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? formatter.format(amount) : normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function readVndAmount(input) {
  const digits = normalizeVndDigits(input?.value);
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : NaN;
}

function digitCount(value, end) {
  return (value.slice(0, end).match(/\d/g) || []).length;
}

function positionAfterDigits(value, count) {
  if (!count) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) seen += 1;
    if (seen === count) return index + 1;
  }
  return value.length;
}

export function formatVndInputElement(input) {
  if (!input || input.dataset.vndFormatting === 'true') return;
  input.dataset.vndFormatting = 'true';
  const render = () => {
    const before = input.value;
    const start = input.selectionStart ?? before.length;
    const end = input.selectionEnd ?? start;
    const startDigits = digitCount(before, start);
    const endDigits = digitCount(before, end);
    const digits = before.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    input.dataset.vndInvalid = /[^\d.\s,\u00a0\u202f]/.test(before) || Boolean(digits && !Number.isSafeInteger(Number(digits))) ? 'true' : 'false';
    const formatted = formatVndDigits(digits);
    input.value = formatted;
    const cursorStart = positionAfterDigits(formatted, Math.min(startDigits, digits.length));
    const cursorEnd = positionAfterDigits(formatted, Math.min(endDigits, digits.length));
    input.setSelectionRange(cursorStart, cursorEnd);
    input.dataset.vndAmount = digits && Number.isSafeInteger(Number(digits)) ? digits : '';
  };

  input.addEventListener('input', render);
  input.addEventListener('compositionend', render);
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key !== 'Backspace' && event.key !== 'Delete') return;
    const value = input.value;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (start !== end) return;
    if (event.key === 'Backspace' && start > 0 && /[.\s,\u00a0\u202f]/.test(value[start - 1])) {
      event.preventDefault();
      const previousDigit = value.slice(0, start - 1).search(/\d(?=[.\s,\u00a0\u202f]*$)/);
      if (previousDigit >= 0) {
        input.setRangeText('', previousDigit, previousDigit + 1, 'start');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else if (event.key === 'Delete' && start < value.length && /[.\s,\u00a0\u202f]/.test(value[start])) {
      event.preventDefault();
      const nextDigit = start + value.slice(start).search(/\d/);
      if (nextDigit >= start) {
        input.setRangeText('', nextDigit, nextDigit + 1, 'start');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
  render();
}
