// Life-expense categories + a deterministic "AI" advisor for the personal
// expense manager (#/coffee/manual-add). This module is PURE (no DOM, no
// storage) so it can be unit-tested in Node and reused by the store, the manual
// form and the statistics views.
//
// Two jobs:
//   1. classifyExpense() — pick a spending category from free text (brand,
//      item names, note) so a row can be auto-tagged ("cho phép chọn nhanh tag").
//   2. expenseAdvice() — read one saved transaction in context (month total,
//      budget, how often that category shows up) and return a personalised
//      comment + concrete tips ("AI phản hồi linh hoạt theo ngữ cảnh").

import { normalizeName } from './menu.js';
import { icon } from '../icons.js';

// `key` is what we persist; `label`/`emoji` are only for display.
export const EXPENSE_CATEGORIES = [
  { key: 'coffee', label: 'Tiền cà phê', emoji: '☕' },
  { key: 'food', label: 'Ăn uống', emoji: '🍜' },
  { key: 'grocery', label: 'Đi siêu thị / Mua sắm', emoji: '🛒' },
  { key: 'travel', label: 'Đi du lịch', emoji: '✈️' },
  { key: 'entertainment', label: 'Giải trí', emoji: '🎬' },
  { key: 'transport', label: 'Di chuyển', emoji: '🚕' },
  { key: 'health', label: 'Sức khoẻ', emoji: '🩺' },
  { key: 'bills', label: 'Hoá đơn / Tiện ích', emoji: '🧾' },
  { key: 'education', label: 'Học tập', emoji: '📚' },
  { key: 'other', label: 'Khác', emoji: '📦' },
];

export const EXPENSE_CATEGORY_ORDER = EXPENSE_CATEGORIES.map((category) => category.key);
export const EXPENSE_CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category.key, category.label]));
export const EXPENSE_CATEGORY_EMOJI = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category.key, category.emoji]));
const EXPENSE_CATEGORY_ICON_KEYS = {
  coffee: 'activity', food: 'package', grocery: 'package', travel: 'arrowRight', entertainment: 'sparkles',
  transport: 'arrowRight', health: 'heartPulse', bills: 'receipt', education: 'bookOpen', other: 'package',
};

export function expenseCategoryIcon(key, size = 16) {
  const safe = normalizeExpenseCategory(key) || DEFAULT_EXPENSE_CATEGORY;
  return icon(EXPENSE_CATEGORY_ICON_KEYS[safe] || 'package', { size });
}
export const DEFAULT_EXPENSE_CATEGORY = 'other';

// Returns a valid key, or '' when the value is missing/"auto".
export function normalizeExpenseCategory(value) {
  const key = String(value ?? '').trim();
  if (key && EXPENSE_CATEGORY_LABELS[key]) return key;
  if (key === DEFAULT_EXPENSE_CATEGORY) return key;
  return '';
}

export function expenseCategoryMeta(key) {
  const safe = normalizeExpenseCategory(key) || DEFAULT_EXPENSE_CATEGORY;
  return { key: safe, label: EXPENSE_CATEGORY_LABELS[safe], emoji: EXPENSE_CATEGORY_EMOJI[safe] };
}

// Ordered most-specific-first so a mall name wins over a generic word.
const RULES = [
  [/sieu ?thi|supermarket|winmart|coop ?mart|big ?c\b|\bgo!\b|lotte mart|mega market|aeon|emart|bach hoa|tap hoa|\bcho\b|di cho|mua sam|shopping|\bmall\b|vincom|circle k|family ?mart|ministop|gs25|thuc pham|nhu yeu pham|tap hoa/, 'grocery'],
  [/du lich|travel|\btour\b|khach san|hotel|resort|homestay|ve may bay|\bflight\b|may bay|vietjet|vietnam airlines|bamboo airways|tau hoa|tau bien|phu quoc|da nang|da lat|nha trang|sapa|ha long|\bhue\b|hoi an|\bnui\b|\bbien\b|villa|airbnb|chuyen di/, 'travel'],
  [/\bphim\b|cinema|cgv|lotte cinema|galaxy|beta cinemas|\bbhd\b|karaoke|\bgame\b|gaming|\bbar\b|\bpub\b|\bclub\b|bowling|giai tri|concert|ca nhac|cong vien|khu vui choi|thuy cung|arcade|\bbida\b|billiard/, 'entertainment'],
  [/\bgrab\b|\bgojek\b|\bbe\b|\btaxi\b|xe om|xe bus|xe buyt|\bbus\b|\bxang\b|petrol|petrolimex|do xang|gui xe|do xe|ve xe|tau dien|metro|di chuyen|xang dau|phuong tien|grab ?(car|bike)|be ?bike/, 'transport'],
  [/\bthuoc\b|nha thuoc|pharmacy|benh vien|hospital|kham benh|\bkham\b|nha khoa|bac si|vac ?xin|tiem chung|phong kham|xet nghiem|\by te\b|suc khoe|long chau|pharmacity|an khang/, 'health'],
  [/tien dien|tien nuoc|internet|\bwifi\b|dien thoai|hoa don|tien nha|tien gas|\bgas\b|truyen hinh|\bfpt\b|viettel|vnpt|\bevn\b|dien luc|cap nuoc|phi quan ly|phi dich vu|phi gui xe|tien mang|nap the|dich vu so|thanh toan hoa don/, 'bills'],
  [/hoc phi|khoa hoc|\bcourse\b|\bsach\b|\bbook\b|udemy|coursera|trung tam|luyen thi|chung chi|ielts|toeic|gia su|hoc vien|hoc tap|khoa hoc online/, 'education'],
  [/nha hang|quan an|buffet|\blau\b|nuong|\bcom\b|\bpho\b|\bbun\b|\bmi\b|pizza|kfc|lotteria|mcdonald|burger|jollibee|banh mi|do an|\bfood\b|sushi|\bbbq\b|hai san|an uong|an sang|an trua|an toi|\ban\b/, 'food'],
  [/ca phe|cafe|coffee|highlands|starbucks|phuc long|katinat|the coffee house|trung nguyen|cong ca phe|milano|passio|cheese coffee|aha coffee|ong bau|tra sua|matcha|freeze|sinh to|\btra\b|bac xiu|nuoc ep|smoothie|cold brew|americano|latte/, 'coffee'],
];

// Pick the best category for a transaction described by any free text.
export function classifyExpense(...texts) {
  const haystack = normalizeName(texts.filter(Boolean).join(' '));
  if (!haystack) return DEFAULT_EXPENSE_CATEGORY;
  for (const [pattern, key] of RULES) {
    if (pattern.test(haystack)) return key;
  }
  return DEFAULT_EXPENSE_CATEGORY;
}

// Resolve a receipt's spending category, falling back to auto-classification
// for records saved before the category field existed.
export function receiptExpenseCategory(receipt = {}) {
  const explicit = normalizeExpenseCategory(receipt.expenseCategory);
  if (explicit) return explicit;
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  return classifyExpense(
    receipt.store,
    receipt.note,
    receipt.customer,
    items.map((item) => item?.name).join(' '),
  );
}

function formatMoney(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} đ`;
}

// Base (category-specific) guidance. Travel/entertainment get a positive,
// experience-oriented tone; essentials are framed as "keep, don't over-cull".
const BASE = {
  coffee: {
    tone: 'info',
    headline: 'Tiền cà phê & đồ uống',
    message: 'Khoản cho cà phê / đồ uống. Uống đúng mức thì tỉnh táo, nhưng ghé quán mỗi ngày thì chi phí cộng dồn rất nhanh.',
    tips: [
      'Đặt trần 1–2 tách/ngày và ưu tiên size vừa.',
      'Tự pha tại nhà/văn phòng vài ngày mỗi tuần để giảm chi phí.',
      'Gộp các buổi hẹn bạn bè lại thay vì rải rác nhiều lần.',
    ],
  },
  food: {
    tone: 'info',
    headline: 'Ăn uống bên ngoài',
    message: 'Bạn đang chi cho ăn uống. Đây là nhóm dễ vượt ngân sách sinh hoạt nhất vì phát sinh thường xuyên.',
    tips: [
      'Giới hạn số bữa ăn ngoài mỗi tuần và chuẩn bị cơm hộp 2–3 ngày.',
      'Tận dụng combo / ưu đãi vào khung giờ vắng.',
      'Tách “ăn no” (bữa chính) khỏi “ăn vui” (trà sữa, ăn vặt).',
    ],
  },
  grocery: {
    tone: 'info',
    headline: 'Đi siêu thị / mua sắm',
    message: 'Khoản cho nhu yếu phẩm. Đây thường là chi tiêu thiết yếu — hãy ưu tiên nhưng tránh phát sinh mua sắm bốc đồng.',
    tips: [
      'Lập danh sách trước khi đi và đi chợ lúc đã ăn no để hạn chế mua dư.',
      'Mua số lượng lớn cho mặt hàng hay dùng (gạo, sữa, giấy…) để tối ưu đơn giá.',
      'So sánh giá giữa siêu thị và chợ/tạp hoá cho từng nhóm hàng thiết yếu.',
    ],
  },
  travel: {
    tone: 'good',
    headline: 'Đi du lịch',
    message: 'Chúc bạn có chuyến đi thật vui và đáng nhớ! Hãy để khoản này nằm trong “quỹ thưởng” thay vì tiền sinh hoạt.',
    tips: [
      'Tách riêng “quỹ trải nghiệm” và chỉ dùng khi đã trích tiết kiệm.',
      'Đặt hạn mức cho chuyến đi trước khi đặt vé/khách sạn.',
      'Săn vé và ưu đãi sớm để tối ưu chi phí.',
    ],
  },
  entertainment: {
    tone: 'good',
    headline: 'Giải trí',
    message: 'Chúc bạn thư giãn vui vẻ! Giải trí là khoản “nạp lại năng lượng” — nên chi trong quỹ thưởng cá nhân.',
    tips: [
      'Đặt ngân sách giải trí theo tuần/tháng.',
      'Ưu tiên trải nghiệm đáng nhớ thay vì nhiều lần nhỏ lẻ.',
      'Chọn suất chiếu / khung giờ ưu đãi để tiết kiệm.',
    ],
  },
  transport: {
    tone: 'info',
    headline: 'Di chuyển',
    message: 'Chi phí đi lại — thường là khoản cố định hằng ngày, tối ưu được thì tiết kiệm đáng kể.',
    tips: [
      'Cân nhắc vé tháng cho bus/metro nếu đi tuyến cố định.',
      'Ghép chuyến / carpool cho các chặng quen thuộc.',
      'Ghi lại tiền xăng và đỗ xe để biết mức thật mỗi tuần.',
    ],
  },
  health: {
    tone: 'good',
    headline: 'Sức khoẻ',
    message: 'Đây là khoản thiết yếu — hãy ưu tiên cho sức khoẻ thay vì cắt giảm.',
    tips: [
      'Duy trì khám định kỳ thay vì để bệnh mới đi.',
      'Mua thuốc theo đợt có hoá đơn để dễ đối chiếu.',
      'Tách chi phí bảo hiểm / nha khoa thành khoản riêng.',
    ],
  },
  bills: {
    tone: 'info',
    headline: 'Hoá đơn / tiện ích',
    message: 'Đây là nhóm chi phí cố định hằng tháng — hãy xem đâu là phần có thể tối ưu.',
    tips: [
      'So sánh gói internet/điện thoại và đàm phán lại khi hết cam kết.',
      'Tắt thiết bị khi không dùng để giảm tiền điện.',
      'Đặt nhắc thanh toán để tránh phí trễ hạn.',
    ],
  },
  education: {
    tone: 'good',
    headline: 'Học tập',
    message: 'Chi cho học tập là một khoản đầu tư — hãy nhìn vào giá trị nhận lại, không chỉ số tiền bỏ ra.',
    tips: [
      'Chọn khoá học thật sự dùng được trong 3–6 tháng tới.',
      'Ưu tiên tài liệu / giáo trình có thể tái sử dụng.',
      'Đặt mục tiêu cụ thể cho mỗi khoản đầu tư học tập.',
    ],
  },
  other: {
    tone: 'info',
    headline: 'Chi tiêu khác',
    message: 'Khoản này chưa khớp danh mục nào — bạn có thể gán tag cụ thể hơn để báo cáo và AI phản hồi sát hơn.',
    tips: [
      'Gán danh mục rõ ràng cho dòng chi phí này.',
      'Mô tả giao dịch đủ chữ (tên quán/cửa hàng) để tự phân loại chính xác hơn.',
    ],
  },
};

// Personalise the base guidance with this transaction's context.
export function expenseAdvice(entry = {}, context = {}) {
  const category = normalizeExpenseCategory(entry.category)
    || classifyExpense(entry.store, entry.itemsText, entry.note)
    || DEFAULT_EXPENSE_CATEGORY;
  const meta = expenseCategoryMeta(category);
  const base = BASE[category] || BASE.other;

  const total = Math.max(0, Math.round(Number(entry.total) || 0));
  const count = Math.max(1, Math.round(Number(entry.count) || 1));
  const monthTotal = Math.max(0, Math.round(Number(context.monthTotal) || 0));
  const budget = Math.max(0, Math.round(Number(context.budget) || 0));
  const categoryTotal = Math.max(total, Math.round(Number(context.categoryTotal) || 0));
  const categoryCount = Math.max(count, Math.round(Number(context.categoryCount) || 0));

  const notes = [];
  if (monthTotal > 0 && total > 0) {
    const share = Math.round((total / monthTotal) * 100);
    notes.push(`Khoản này chiếm ~${share}% chi tiêu tháng này (${formatMoney(monthTotal)}).`);
  }
  if (categoryCount > 0) {
    notes.push(`Bạn đã ghi nhận ${categoryCount} khoản “${meta.label}” (tổng ${formatMoney(categoryTotal)}).`);
  }

  let tone = base.tone;
  if (budget > 0) {
    if (monthTotal > budget) {
      tone = 'warning';
      notes.push(`Bạn đã vượt ngân sách tháng ${formatMoney(budget)} — nên hãm lại các khoản không thiết yếu.`);
    } else {
      notes.push(`Còn lại ${formatMoney(Math.max(0, budget - monthTotal))} trong ngân sách tháng ${formatMoney(budget)}.`);
    }
  }

  // Out-of-the-ordinary single transaction → nudge the user to double-check.
  if (context.categoryAverage && total > context.categoryAverage * 1.4) {
    tone = tone === 'good' ? 'info' : tone;
    notes.push(`Khoản này cao hơn mức trung bình “${meta.label}” (${formatMoney(context.categoryAverage)}/lần).`);
  }

  return {
    category: meta.key,
    label: meta.label,
    emoji: meta.emoji,
    tone,
    headline: base.headline,
    message: base.message,
    tips: [...base.tips],
    notes,
  };
}

// Aggregate a set of just-saved transactions into the review the AI shows right
// after "Lưu giao dịch".
export function buildExpenseReview(records = [], context = {}) {
  const list = Array.isArray(records) ? records : [];
  const buckets = new Map();
  list.forEach((receipt) => {
    const key = receiptExpenseCategory(receipt);
    const bucket = buckets.get(key) || { category: key, total: 0, count: 0, stores: [] };
    bucket.total += Math.max(0, Math.round(Number(receipt.total) || 0));
    bucket.count += 1;
    if (receipt.store && !bucket.stores.includes(receipt.store)) bucket.stores.push(receipt.store);
    buckets.set(key, bucket);
  });

  const advices = [...buckets.values()]
    .sort((a, b) => b.total - a.total)
    .map((bucket) => {
      const categoryTotal = context.byCategory?.get(bucket.category)?.total ?? bucket.total;
      const categoryCount = context.byCategory?.get(bucket.category)?.count ?? bucket.count;
      const categoryAverage = categoryCount ? Math.round(categoryTotal / categoryCount) : 0;
      return {
        ...expenseAdvice(
          { category: bucket.category, total: bucket.total, count: bucket.count, store: bucket.stores[0] },
          { ...context, categoryTotal, categoryCount, categoryAverage },
        ),
        total: bucket.total,
        count: bucket.count,
        stores: bucket.stores,
      };
    });

  return {
    count: list.length,
    total: list.reduce((sum, receipt) => sum + Math.max(0, Math.round(Number(receipt.total) || 0)), 0),
    advices,
  };
}
