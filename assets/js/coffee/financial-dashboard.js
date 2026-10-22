import { escapeHtml, formatVnd, toNumber } from './store.js';
import { receiptExpenseCategory, EXPENSE_CATEGORY_LABELS } from './expense.js';
import { getMerchantLearning } from './smart-entry.js';

const COLORS = ['#50B8B5', '#80CDCA', '#B7E2E1', '#8C9696', '#AFC9C8', '#6B9291', '#D0D7D7'];
const ESSENTIAL_KEY = 'blogco.coffee.category-essential.v1';
const monthKey = (date) => String(date || '').slice(0, 7);

function periodRange(period, anchor = new Date()) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  if (period === 'year') return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: `${year}` };
  if (period === 'quarter') {
    const first = Math.floor(month / 3) * 3;
    return { start: new Date(year, first, 1), end: new Date(year, first + 3, 1), label: `Quý ${Math.floor(first / 3) + 1}/${year}` };
  }
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1), label: new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(anchor) };
}

function keyOfDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function inRange(receipt, from, to) {
  const key = monthKey(receipt.date);
  return (!from || key >= from) && (!to || key <= to);
}
function isExpense(receipt) { return (receipt.transactionType || 'expense') === 'expense' || receipt.transactionType === 'refund'; }
function isIncome(receipt) { return receipt.transactionType === 'income'; }
function safeCategory(receipt) { return receiptExpenseCategory(receipt); }
function essentialMap() {
  try { const value = JSON.parse(globalThis.localStorage?.getItem(ESSENTIAL_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function canonicalMerchant(name, learning) {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  return learning.find((rule) => rule.aliases?.some((alias) => normalize(alias) === normalize(name)))?.merchant || name;
}

export function aggregateFinancialDashboard(receipts = [], { period = 'month', from = '', to = '', category = '', type = 'all' } = {}, now = new Date()) {
  const range = periodRange(period, now);
  const startKey = from || keyOfDate(range.start);
  const endKey = to || keyOfDate(new Date(range.end.getTime() - 86400000));
  const [startYear, startMonth] = startKey.split('-').map(Number);
  const [endYear, endMonth] = endKey.split('-').map(Number);
  const durationMonths = from || to ? Math.max(1, (endYear - startYear) * 12 + endMonth - startMonth + 1) : period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  const priorStart = new Date(startYear, startMonth - 1 - durationMonths, 1);
  const currentStart = new Date(startYear, startMonth - 1, 1);
  const priorRange = { start: priorStart, end: currentStart };
  const selected = receipts.filter((item) => (type === 'transfer' ? item.transactionType === 'transfer' : item.transactionType !== 'transfer') && inRange(item, startKey, endKey)
    && (type === 'all' || type === 'income' && isIncome(item) || type === 'expense' && isExpense(item) || type === 'transfer' && item.transactionType === 'transfer')
    && (!category || !isExpense(item) || safeCategory(item) === category));
  const spent = (list) => list.reduce((sum, item) => {
    if ((item.transactionType || 'expense') === 'expense') return sum + Math.max(0, toNumber(item.total));
    if (item.transactionType === 'refund') return sum - Math.max(0, toNumber(item.total));
    return sum;
  }, 0);
  const earned = (list) => list.filter(isIncome).reduce((sum, item) => sum + Math.max(0, toNumber(item.total)), 0);
  const prior = receipts.filter((item) => (type === 'transfer' ? item.transactionType === 'transfer' : item.transactionType !== 'transfer') && inRange(item, keyOfDate(priorRange.start), keyOfDate(new Date(priorRange.end.getTime() - 86400000)))
    && (type === 'all' || type === 'income' && isIncome(item) || type === 'expense' && isExpense(item) || type === 'transfer' && item.transactionType === 'transfer')
    && (!category || !isExpense(item) || safeCategory(item) === category));
  const totals = new Map();
  const previousTotals = new Map();
  const userEssential = essentialMap();
  selected.filter(isExpense).forEach((item) => {
    const key = safeCategory(item);
    const row = totals.get(key) || { key, label: EXPENSE_CATEGORY_LABELS[key] || 'Khác', amount: 0, count: 0 };
    row.amount += (item.transactionType === 'refund' ? -1 : 1) * Math.max(0, toNumber(item.total)); row.count += 1; totals.set(key, row);
  });
  prior.filter(isExpense).forEach((item) => {
    const key = safeCategory(item);
    previousTotals.set(key, (previousTotals.get(key) || 0) + (item.transactionType === 'refund' ? -1 : 1) * Math.max(0, toNumber(item.total)));
  });
  const categories = [...totals.values()].map((row) => {
    const previous = previousTotals.get(row.key) || 0;
    return { ...row, previous, changePct: previous ? ((row.amount - previous) / Math.abs(previous)) * 100 : null };
  }).sort((a, b) => b.amount - a.amount);
  const needsTotals = { essential: 0, nonessential: 0, unclassified: 0 };
  categories.forEach((row) => { needsTotals[userEssential[row.key] || 'unclassified'] += row.amount; });
  const merchants = new Map();
  const merchantLearning = getMerchantLearning();
  selected.filter(isExpense).forEach((item) => {
    const name = canonicalMerchant(String(item.store || 'Không rõ').trim(), merchantLearning);
    const row = merchants.get(name) || { name, total: 0, count: 0, recent: '' };
    row.total += (item.transactionType === 'refund' ? -1 : 1) * Math.max(0, toNumber(item.total)); row.count += 1; row.recent = [row.recent, item.date].sort().pop() || ''; merchants.set(name, row);
  });
  const monthly = new Map();
  selected.forEach((item) => {
    const key = monthKey(item.date); if (!/^\d{4}-\d{2}$/.test(key)) return;
    const row = monthly.get(key) || { key, income: 0, expense: 0, net: 0, categories: {} };
    if (isIncome(item)) row.income += Math.max(0, toNumber(item.total));
    else if ((item.transactionType || 'expense') === 'expense') {
      row.expense += Math.max(0, toNumber(item.total));
      const categoryKey = safeCategory(item);
      row.categories[categoryKey] = (row.categories[categoryKey] || 0) + Math.max(0, toNumber(item.total));
    }
    else if (item.transactionType === 'refund') row.expense -= Math.max(0, toNumber(item.total));
    row.net = row.income - row.expense;
    monthly.set(key, row);
  });
  const currentPeriodRecords = selected;
  const activeStart = currentStart;
  const activeEnd = to ? new Date(endYear, endMonth, 1) : range.end;
  const daysCovered = Math.max(1, Math.ceil((Math.min(activeEnd.getTime(), now.getTime() + 86400000) - activeStart.getTime()) / 86400000));
  const previousDays = Math.max(1, Math.ceil((priorRange.end.getTime() - priorRange.start.getTime()) / 86400000));
  const currentAvg = spent(currentPeriodRecords) / daysCovered;
  const priorAvg = spent(prior) / previousDays;
  return {
    periodLabel: from || to ? `${startKey} – ${endKey}` : range.label, start: startKey, end: endKey, transactions: selected,
    income: earned(selected), expenses: spent(selected), previousExpenses: spent(prior), net: earned(selected) - spent(selected),
    transferCount: selected.filter((item) => item.transactionType === 'transfer').length,
    transferTotal: selected.filter((item) => item.transactionType === 'transfer').reduce((sum, item) => sum + Math.max(0, toNumber(item.total)), 0),
    averageDaily: currentAvg, previousAverageDaily: priorAvg,
    averageChange: priorAvg ? ((currentAvg - priorAvg) / priorAvg) * 100 : null,
    savingsRate: earned(selected) > 0 ? ((earned(selected) - spent(selected)) / earned(selected)) * 100 : null,
    previousSavingsRate: earned(prior) > 0 ? ((earned(prior) - spent(prior)) / earned(prior)) * 100 : null,
    categories, merchants: [...merchants.values()].sort((a, b) => b.total - a.total), monthly: [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key)),
    needs: [
      { key: 'essential', label: 'Thiết yếu', amount: needsTotals.essential },
      { key: 'nonessential', label: 'Không thiết yếu', amount: needsTotals.nonessential },
      { key: 'unclassified', label: 'Chưa phân loại', amount: needsTotals.unclassified },
    ].filter((row) => row.amount > 0),
    essentialSettings: userEssential,
  };
}

function donut(rows, total, title) {
  if (!total || !rows.length) return '<p class="fin-empty">Chưa có dữ liệu trong kỳ này.</p>';
  const r = 38, c = 2 * Math.PI * r;
  let offset = 0;
  const circles = rows.map((row, i) => {
    const fraction = row.amount / total; const part = fraction * c;
    const html = `<circle r="${r}" cx="50" cy="50" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="12" stroke-dasharray="${part} ${c - part}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)"><title>${escapeHtml(row.label)}: ${formatVnd(row.amount)} (${Math.round(fraction * 100)}%)</title></circle>`;
    offset += part; return html;
  }).join('');
  return `<svg class="fin-donut" viewBox="0 0 100 100" role="img" aria-label="${escapeHtml(title)}"><circle r="38" cx="50" cy="50" fill="none" stroke="#eef3f3" stroke-width="12"/>${circles}<text x="50" y="48" text-anchor="middle" class="fin-donut__value">${escapeHtml(total >= 1e6 ? `${(total / 1e6).toFixed(1)}tr` : `${Math.round(total / 1000)}k`)}</text><text x="50" y="59" text-anchor="middle" class="fin-donut__label">Tổng chi</text></svg>`;
}

function monthBars(data, mode = 'cashflow') {
  if (!data.length) return '<p class="fin-empty">Chưa có dữ liệu trong kỳ này.</p>';
  const max = Math.max(1, ...data.flatMap((row) => [row.income, row.expense, Math.abs(row.net), ...Object.values(row.categories || {})]));
  const width = Math.max(600, data.length * 80 + 40);
  const bars = data.map((row, i) => {
    const x = 45 + i * 80; const ih = row.income / max * 180; const eh = row.expense / max * 180;
    const label = `T${Number(row.key.slice(5))}`;
    if (mode === 'categories') {
      let offset = 0;
      const segments = Object.entries(row.categories || {}).map(([key, value], index) => { const h = value / max * 180; const y = 210 - offset - h; offset += h; return `<rect x="${x + 10}" y="${y}" width="38" height="${h}" fill="${COLORS[index % COLORS.length]}"><title>${label} ${escapeHtml(EXPENSE_CATEGORY_LABELS[key] || 'Khác')}: ${formatVnd(value)}</title></rect>`; }).join('');
      return `<g>${segments}<text x="${x + 26}" y="234" text-anchor="middle">${label}</text></g>`;
    }
    if (mode === 'net') {
      const value = row.net; const h = Math.abs(value) / max * 180; const y = value >= 0 ? 210 - h : 210;
      return `<g><rect x="${x + 10}" y="${y}" width="38" height="${h}" rx="3" fill="${value >= 0 ? '#50B8B5' : '#B8B8B8'}"><title>${label} dòng tiền ròng ${formatVnd(value)}</title></rect><text x="${x + 26}" y="234" text-anchor="middle">${label}</text></g>`;
    }
    return `<g><rect x="${x}" y="${210 - ih}" width="24" height="${ih}" rx="3" fill="#50B8B5"><title>${label} thu nhập ${formatVnd(row.income)}</title></rect><rect x="${x + 28}" y="${210 - eh}" width="24" height="${eh}" rx="3" fill="#B7E2E1"><title>${label} chi tiêu ${formatVnd(row.expense)}</title></rect><text x="${x + 26}" y="${210 - Math.max(ih, eh) - 7}" text-anchor="middle" class="fin-bar-total">${Math.round((row.income + row.expense) / 1000)}k</text><text x="${x + 26}" y="234" text-anchor="middle">${label}</text></g>`;
  }).join('');
  return `<div class="fin-chart-scroll"><svg class="fin-month-chart" viewBox="0 0 ${width} 250" role="img" aria-label="${mode === 'net' ? 'Dòng tiền ròng' : mode === 'categories' ? 'Chi tiêu theo danh mục' : 'Thu nhập và chi tiêu'} theo tháng"><line x1="30" y1="210" x2="${width - 20}" y2="210"/>${bars}</svg></div>`;
}

function legend(rows, total) {
  return `<ul class="fin-legend">${rows.map((row, i) => `<li><button type="button" data-fin-category="${escapeHtml(row.key)}"><span class="fin-dot" style="--fin-color:${COLORS[i % COLORS.length]}"></span><span>${escapeHtml(row.label)}</span><strong>${Math.round(row.amount / Math.max(1, total) * 100)}%</strong><small>${escapeHtml(formatVnd(row.amount))}</small></button></li>`).join('')}</ul>`;
}

export function renderFinancialDashboard(receipts, filters = {}) {
  const data = aggregateFinancialDashboard(receipts, filters);
  const totalExpense = data.expenses;
  const topCategories = data.categories.slice(0, 5);
  const merchants = data.merchants.slice(0, 8);
  const currentLabel = data.periodLabel;
  const avgDelta = data.averageChange === null ? 'Chưa đủ dữ liệu kỳ trước' : `${data.averageChange >= 0 ? '+' : ''}${data.averageChange.toFixed(1)}% so với kỳ trước`;
  const savings = data.savingsRate === null ? 'Chưa có dữ liệu thu nhập' : `${data.savingsRate.toFixed(1)}%`;
  const needsTotal = data.needs.reduce((sum, row) => sum + row.amount, 0);
  const needsSettings = data.categories.map((row) => `<label class="fin-essential-setting"><span>${escapeHtml(row.label)}</span><select data-essential-category="${escapeHtml(row.key)}"><option value="unclassified"${(data.essentialSettings[row.key] || 'unclassified') === 'unclassified' ? ' selected' : ''}>Chưa phân loại</option><option value="essential"${data.essentialSettings[row.key] === 'essential' ? ' selected' : ''}>Thiết yếu</option><option value="nonessential"${data.essentialSettings[row.key] === 'nonessential' ? ' selected' : ''}>Không thiết yếu</option></select></label>`).join('');
  return `<div class="fin-dashboard" data-fin-dashboard>
    <header class="fin-header"><div><p class="fin-eyebrow">BLOGCO · BÁO CÁO TÀI CHÍNH</p><h2>Tổng quan tài chính</h2><p>Phân tích thu nhập, chi tiêu và xu hướng tài chính cá nhân</p></div><span class="fin-currency">VND · ${escapeHtml(currentLabel)}</span></header>
    <div class="fin-filters" aria-label="Bộ lọc báo cáo"><label>Kỳ<select data-fin-filter="period"><option value="month"${filters.period === 'month' || !filters.period ? ' selected' : ''}>Tháng</option><option value="quarter"${filters.period === 'quarter' ? ' selected' : ''}>Quý</option><option value="year"${filters.period === 'year' ? ' selected' : ''}>Năm</option></select></label><label>Từ tháng<input type="month" data-fin-filter="from" value="${escapeHtml(filters.from || '')}"></label><label>Đến tháng<input type="month" data-fin-filter="to" value="${escapeHtml(filters.to || '')}"></label><label>Loại giao dịch<select data-fin-filter="type"><option value="all"${!filters.type || filters.type === 'all' ? ' selected' : ''}>Thu và chi</option><option value="income"${filters.type === 'income' ? ' selected' : ''}>Thu nhập</option><option value="expense"${filters.type === 'expense' ? ' selected' : ''}>Chi tiêu</option><option value="transfer"${filters.type === 'transfer' ? ' selected' : ''}>Chuyển tiền nội bộ</option></select></label><label>Danh mục<select data-fin-filter="category"><option value="">Tất cả danh mục</option>${Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, label]) => `<option value="${key}"${filters.category === key ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label><button type="button" class="fin-reset" data-fin-reset>Xóa lọc</button></div>
    <div class="fin-kpis"><article><span>Thu nhập</span><strong>${data.income ? escapeHtml(formatVnd(data.income)) : '—'}</strong></article><article><span>Chi tiêu</span><strong>${escapeHtml(formatVnd(data.expenses))}</strong></article><article><span>Dòng tiền ròng</span><strong>${data.income ? escapeHtml(formatVnd(data.net)) : '—'}</strong></article><article><span>Tỷ lệ tiết kiệm</span><strong>${savings}</strong></article></div>
    ${filters.type === 'transfer' ? `<p class="fin-note" role="status">${data.transferCount} giao dịch chuyển nội bộ · ${escapeHtml(formatVnd(data.transferTotal))}. Các khoản này không tính vào thu nhập hoặc chi tiêu.</p>` : ''}
    <section class="fin-primary"><div class="fin-section-heading"><div><p class="fin-eyebrow">${escapeHtml(currentLabel)}</p><h3>Cơ cấu thu chi theo thời gian</h3></div><div class="fin-legend-inline"><span><i></i>Thu nhập</span><span><i></i>Chi tiêu</span></div></div><div class="fin-chart-modes" role="group" aria-label="Kiểu biểu đồ"><button type="button" data-fin-mode="cashflow" class="${!filters.mode || filters.mode === 'cashflow' ? 'is-active' : ''}">Thu nhập và chi tiêu</button><button type="button" data-fin-mode="categories" class="${filters.mode === 'categories' ? 'is-active' : ''}">Chi tiêu theo danh mục</button><button type="button" data-fin-mode="net" class="${filters.mode === 'net' ? 'is-active' : ''}">Dòng tiền ròng</button></div>${monthBars(data.monthly, filters.mode)}${!data.income ? '<p class="fin-note">Hiện dữ liệu lưu trữ chỉ có giao dịch chi tiêu; phần thu nhập sẽ xuất hiện khi hệ thống có bản ghi thu nhập.</p>' : ''}</section>
    <section class="fin-panel-grid"><article class="fin-panel"><h3>Cơ cấu chi tiêu</h3><div class="fin-donut-row">${donut(data.categories, totalExpense, 'Phân bổ chi tiêu')}${legend(data.categories, totalExpense)}</div></article><article class="fin-panel"><h3>Phân loại nhu cầu</h3><div class="fin-donut-row">${donut(data.needs, needsTotal, 'Thiết yếu và không thiết yếu')}${data.needs.map((row, index) => `<p class="fin-needs-row"><span class="fin-dot" style="--fin-color:${COLORS[index % COLORS.length]}"></span>${escapeHtml(row.label)} <strong>${needsTotal ? Math.round(row.amount / needsTotal * 100) : 0}%</strong></p>`).join('')}</div><details class="fin-essential-config"><summary>Thiết lập phân loại danh mục</summary><div>${needsSettings || '<p class="fin-empty">Chưa có danh mục trong kỳ để phân loại.</p>'}</div></details></article><article class="fin-panel"><h3>Chi tiêu bình quân</h3><div class="fin-compare"><strong>${escapeHtml(formatVnd(data.averageDaily))}</strong><span>/ ngày · ${escapeHtml(currentLabel)}</span><p>${escapeHtml(avgDelta)}</p><small>Kỳ trước: ${data.previousAverageDaily ? escapeHtml(formatVnd(data.previousAverageDaily)) + ' / ngày' : 'Chưa đủ dữ liệu'}</small></div></article><article class="fin-panel"><h3>Tỷ lệ tiết kiệm</h3><div class="fin-compare"><strong>${savings}</strong><span>kỳ hiện tại</span><p>${data.previousSavingsRate === null ? 'Chưa có dữ liệu kỳ trước' : `Kỳ trước: ${data.previousSavingsRate.toFixed(1)}%`}</p><small>=(Thu nhập − Chi tiêu) / Thu nhập</small></div></article></section>
    <section class="fin-secondary"><article class="fin-panel"><h3>Top danh mục chi tiêu</h3>${topCategories.length ? `<ol class="fin-rank">${topCategories.map((row) => `<li><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(formatVnd(row.amount))}</strong><small>${totalExpense ? Math.round(row.amount / totalExpense * 100) : 0}% · ${row.count} giao dịch · ${row.changePct === null ? 'Kỳ trước chưa có dữ liệu' : `${row.changePct >= 0 ? '+' : ''}${row.changePct.toFixed(1)}% so với kỳ trước`}</small></li>`).join('')}</ol>` : '<p class="fin-empty">Chưa có chi tiêu trong kỳ này.</p>'}</article><article class="fin-panel"><h3>Chi tiêu theo nơi giao dịch</h3>${merchants.length ? `<ol class="fin-rank">${merchants.map((row) => `<li><span>${escapeHtml(row.name)}</span><strong>${escapeHtml(formatVnd(row.total))}</strong><small>${row.count} giao dịch · TB ${escapeHtml(formatVnd(row.total / row.count))} · gần nhất ${escapeHtml(row.recent || '—')}</small></li>`).join('')}</ol>` : '<p class="fin-empty">Chưa có giao dịch người bán trong kỳ này.</p>'}</article><article class="fin-panel"><h3>Giao dịch định kỳ</h3><p class="fin-empty">Chưa có lịch thanh toán đã xác nhận. Không suy đoán định kỳ chỉ từ tên merchant.</p></article><article class="fin-panel"><h3>Điểm đáng chú ý</h3>${topCategories.length ? `<p>${escapeHtml(topCategories[0].label)} chiếm ${totalExpense ? Math.round(topCategories[0].amount / totalExpense * 100) : 0}% chi tiêu trong kỳ${topCategories[0].changePct === null ? '.' : `, ${topCategories[0].changePct >= 0 ? 'tăng' : 'giảm'} ${Math.abs(topCategories[0].changePct).toFixed(1)}% so với kỳ trước.`}</p>` : '<p class="fin-empty">Chưa đủ giao dịch để tạo nhận xét từ dữ liệu.</p>'}</article></section>
  </div>`;
}
