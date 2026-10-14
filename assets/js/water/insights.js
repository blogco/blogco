// Drink groups describe common ingredients, not a medical rating. Actual recipes and portions vary.
export const DRINK_CATEGORIES = Object.freeze({
  water: { label: 'Nước lọc', impact: 'positive', score: 10, note: 'Lựa chọn đơn giản để ghi nhận lượng uống.' },
  mineral: { label: 'Nước khoáng', impact: 'positive', score: 9, note: 'Thành phần khoáng tuỳ sản phẩm.' },
  herbalTea: { label: 'Trà thảo mộc', impact: 'positive', score: 7, note: 'Kiểm tra nhãn nếu có caffeine hoặc đường thêm.' },
  greenTea: { label: 'Trà xanh', impact: 'neutral', score: 3, note: 'Caffeine và đường thay đổi theo cách pha.' },
  tea: { label: 'Trà', impact: 'neutral', score: 2, note: 'Caffeine tuỳ loại trà và cách pha.' },
  coffee: { label: 'Cà phê', impact: 'warning', score: -3, note: 'Có thể chứa caffeine; lượng thay đổi theo khẩu phần/cách pha.' },
  soda: { label: 'Nước ngọt', impact: 'negative', score: -6, note: 'Có thể có đường thêm và năng lượng; xem nhãn sản phẩm.' },
  juiceBox: { label: 'Nước trái cây đóng hộp', impact: 'negative', score: -5, note: 'Đường và năng lượng khác nhau theo sản phẩm.' },
  juice: { label: 'Nước trái cây', impact: 'warning', score: -3, note: 'Nước ép có thể chứa đường tự do; khẩu phần và thành phần quan trọng.' },
  milkSweet: { label: 'Sữa có đường', impact: 'warning', score: -2, note: 'Kiểm tra lượng đường thêm và năng lượng trên nhãn.' },
  milk: { label: 'Sữa', impact: 'neutral', score: 1, note: 'Có thể cung cấp dinh dưỡng; thành phần khác nhau theo loại.' },
  energyDrink: { label: 'Nước tăng lực', impact: 'negative', score: -8, note: 'Caffeine/đường có thể cao; xem nhãn và khẩu phần.' },
  beer: { label: 'Bia', impact: 'negative', score: -7, note: 'Có cồn; không xem đây là lựa chọn bù nước.' },
  wine: { label: 'Rượu vang', impact: 'negative', score: -7, note: 'Có cồn; không xem đây là lựa chọn bù nước.' },
  bubbleTea: { label: 'Trà sữa', impact: 'negative', score: -8, note: 'Đường và năng lượng tuỳ công thức/tuỳ chọn.' },
  other: { label: 'Khác', impact: 'unknown', score: 0, note: 'Chưa đủ thông tin để phân loại thành phần.' },
});

export function getTargetMl(profile) {
  if (!profile.useFormula || !profile.sex || !profile.weightKg) return Number(profile.goalMl) || 2000;
  let estimate = Number(profile.weightKg) * (profile.sex === 'male' ? 35 : 31);
  if (Number(profile.activityMinutes) > 60) estimate += 500;
  if (profile.hotWeather) estimate += 300;
  if (profile.pregnant || profile.breastfeeding || profile.pregnancyOrBreastfeeding) estimate += 300;
  return Math.round(Math.max(250, Math.min(10000, estimate)) / 50) * 50;
}

const CATEGORY_ALIASES = [
  [/nuoc khoang|mineral/, 'mineral'], [/tra thao moc|herbal/, 'herbalTea'], [/tra xanh|green tea/, 'greenTea'],
  [/ca phe|coffee/, 'coffee'], [/nuoc ngot|soda|soft drink/, 'soda'], [/nuoc trai cay.*hop|juice box|dong hop/, 'juiceBox'],
  [/tra sua|bubble tea/, 'bubbleTea'], [/nuoc tang luc|energy drink/, 'energyDrink'], [/bia|beer/, 'beer'],
  [/ruou vang|wine/, 'wine'], [/sua.*duong|sweet milk/, 'milkSweet'], [/nuoc trai cay|juice/, 'juice'],
  [/sua|milk/, 'milk'], [/nuoc loc|water/, 'water'], [/tra|tea/, 'tea'],
];

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function resolveDrinkCategory(entry) {
  const type = String(entry.drinkType || 'other');
  if (type !== 'other' && DRINK_CATEGORIES[type]) return { key: type, ...DRINK_CATEGORIES[type] };
  const customName = normalizeText(entry.customDrink || '');
  for (const [pattern, key] of CATEGORY_ALIASES) {
    if (pattern.test(customName)) return { key, ...DRINK_CATEGORIES[key] };
  }
  return { key: 'other', ...DRINK_CATEGORIES.other, label: entry.customDrink || DRINK_CATEGORIES.other.label };
}

function amountMetric(entries, field) {
  const available = entries.map((entry) => entry[field]).filter((raw) => raw !== undefined && raw !== null && String(raw).trim() !== '')
    .map(Number).filter((value) => Number.isFinite(value) && value >= 0);
  return { amount: available.reduce((sum, value) => sum + value, 0), count: available.length, total: entries.length };
}

function minutesOfDay(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function durationLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours && remainder ? `${hours} giờ ${remainder} phút` : hours ? `${hours} giờ` : `${remainder} phút`;
}

function localWeekday(date) {
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getDay()];
}

export function getDrinkAnalysis(entries) {
  const groups = new Map();
  let drinkScore = 0;
  let positiveMl = 0;
  let totalMl = 0;
  for (const entry of entries) {
    const category = resolveDrinkCategory(entry);
    const amountMl = Math.max(0, Number(entry.amountMl) || 0);
    totalMl += amountMl;
    drinkScore += category.score;
    if (category.impact === 'positive' || category.impact === 'neutral') positiveMl += amountMl;
    const group = groups.get(category.key) || { ...category, amountMl: 0, count: 0, scoreTotal: 0 };
    group.amountMl += amountMl;
    group.count += 1;
    group.scoreTotal += category.score;
    groups.set(category.key, group);
  }
  return {
    groups: [...groups.values()].sort((a, b) => b.amountMl - a.amountMl || a.label.localeCompare(b.label, 'vi')),
    drinkScore,
    positiveMl,
    totalMl,
    positivePercent: totalMl ? Math.round(positiveMl / totalMl * 100) : 0,
  };
}

export function buildDailyInsights(entries, targetMl, dateKey, profile = {}, now = new Date()) {
  const today = entries.filter((entry) => entry.date === dateKey);
  const totalMl = today.reduce((sum, entry) => sum + (Number(entry.amountMl) || 0), 0);
  const percent = targetMl > 0 ? Math.round(totalMl / targetMl * 100) : 0;
  const score = Math.max(0, Math.min(100, percent));
  const remainingMl = Math.max(0, targetMl - totalMl);
  const ordered = [...today].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const validTimes = ordered.map((entry) => ({ entry, minute: minutesOfDay(entry.time) })).filter((item) => item.minute !== null);
  const gaps = validTimes.slice(1).map((item, index) => ({ minutes: item.minute - validTimes[index].minute, from: validTimes[index], to: item }));
  const longestGap = gaps.reduce((longest, gap) => gap.minutes > longest.minutes ? gap : longest, { minutes: 0 });
  const drinks = getDrinkAnalysis(today);
  const nutrients = {
    sugarGrams: amountMetric(today, 'sugarGrams'),
    caffeineMg: amountMetric(today, 'caffeineMg'),
    caloriesKcal: amountMetric(today, 'caloriesKcal'),
    alcoholGrams: amountMetric(today, 'alcoholGrams'),
  };
  const categoryKeys = new Set(today.map((entry) => resolveDrinkCategory(entry).key));
  const healthAlerts = [];
  const positives = [];
  const warnings = [];
  const suggestions = [];
  const first = validTimes[0]?.entry;

  if (first && minutesOfDay(first.time) < 12 * 60) positives.push(`Bản ghi đầu ngày lúc ${first.time}, thuộc buổi sáng.`);
  if (validTimes.length > 1 && longestGap.minutes <= 180) positives.push(`Khoảng cách ghi nhận dài nhất là ${durationLabel(longestGap.minutes)}.`);
  if (drinks.positiveMl > 0) positives.push(`${drinks.positivePercent}% lượng đã ghi thuộc nhóm nước/trà ít thành phần được phân loại trung tính hoặc tích cực.`);
  if (!today.length) positives.push('Chưa có bản ghi hôm nay; thêm dữ liệu để Insights có ngữ cảnh.');

  if (score < 50) warnings.push(`Mới ghi ${score}% mục tiêu nhắc nhở cá nhân; còn ${remainingMl.toLocaleString('vi-VN')} ml theo thiết lập.`);
  else if (score < 80) warnings.push(`Đang ở mức ${score}% mục tiêu nhắc nhở cá nhân; còn ${remainingMl.toLocaleString('vi-VN')} ml theo thiết lập.`);
  else warnings.push(`Đã đạt ${score}% mục tiêu nhắc nhở đã chọn; đây không phải phép đo tình trạng đủ nước của cơ thể.`);

  if (longestGap.minutes >= 180) {
    warnings.push(`Khoảng trống ${durationLabel(longestGap.minutes)} giữa ${longestGap.from.entry.time} và ${longestGap.to.entry.time}.`);
    suggestions.push('Nếu phù hợp với lịch sinh hoạt, hãy chia việc ghi nhận đều hơn thay vì uống dồn.');
  }
  if (today.length && dateKey === localDateKey(now) && (now.getHours() * 60 + now.getMinutes()) >= 14 * 60 && !validTimes.some((item) => item.minute >= 14 * 60)) {
    warnings.push('Chưa có bản ghi sau 14:00 hôm nay.');
    suggestions.push('Kiểm tra xem bạn có muốn ghi lại đồ uống buổi chiều không.');
  }
  const cautionGroups = drinks.groups.filter((group) => group.impact === 'warning' || group.impact === 'negative');
  if (cautionGroups.length) {
    warnings.push(`Có ${cautionGroups.reduce((sum, group) => sum + group.count, 0)} bản ghi thuộc nhóm cần xem thành phần/khẩu phần.`);
    suggestions.push('Đối chiếu đường, caffeine, cồn và năng lượng trên nhãn thay vì chỉ dựa vào tên đồ uống.');
  }

  const sugarReference = 25; // 5% of 2,000 kcal as an optional WHO reference, not a universal fixed cap.
  if (nutrients.sugarGrams.count) {
    const ratio = nutrients.sugarGrams.amount / sugarReference;
    if (ratio >= 0.8) healthAlerts.push(`Đường đã ghi ${nutrients.sugarGrams.amount.toLocaleString('vi-VN')} g / mốc tham khảo 25 g (${Math.round(ratio * 100)}%).`);
    if (ratio > 1) healthAlerts.push('Lượng đã nhập vượt mốc tham khảo tuỳ chọn; nhu cầu cá nhân và tổng năng lượng có thể khác.');
  } else if (['soda', 'juiceBox', 'juice', 'milkSweet', 'bubbleTea', 'energyDrink'].some((key) => categoryKeys.has(key))) {
    healthAlerts.push('Có đồ uống có thể chứa đường; chưa nhập số gram, hãy kiểm tra nhãn và khẩu phần.');
  }

  const caffeineReference = profile.pregnant || profile.breastfeeding ? 200 : 400;
  if (nutrients.caffeineMg.count && nutrients.caffeineMg.amount >= caffeineReference * 0.8) {
    healthAlerts.push(`Caffeine đã ghi ${nutrients.caffeineMg.amount.toLocaleString('vi-VN')} mg / mốc tham khảo ${caffeineReference} mg (${Math.round(nutrients.caffeineMg.amount / caffeineReference * 100)}%).`);
  } else if (!nutrients.caffeineMg.count && ['coffee', 'tea', 'greenTea', 'energyDrink'].some((key) => categoryKeys.has(key))) {
    healthAlerts.push('Có đồ uống có thể chứa caffeine; chưa nhập mg, lượng thực tế tuỳ loại và cách pha.');
  }
  if (nutrients.caffeineMg.amount > caffeineReference) healthAlerts.push('Caffeine đã nhập vượt mốc tham khảo; độ nhạy cá nhân và nguồn caffeine khác cũng quan trọng.');
  if (validTimes.some(({ entry, minute }) => minute >= 16 * 60 && Number(entry.caffeineMg) > 0)) {
    healthAlerts.push('Có caffeine được ghi nhận sau 16:00; caffeine có thể ảnh hưởng giấc ngủ tuỳ độ nhạy và thời điểm ngủ.');
  }

  const hasAlcohol = categoryKeys.has('beer') || categoryKeys.has('wine') || nutrients.alcoholGrams.amount > 0;
  if (hasAlcohol && !nutrients.alcoholGrams.count) healthAlerts.push('Có ghi nhận bia/rượu; lượng cồn chưa được nhập và không nên xem đây là lựa chọn bù nước.');
  else if (hasAlcohol) healthAlerts.push(`Cồn đã ghi ${nutrients.alcoholGrams.amount.toLocaleString('vi-VN')} g; cồn có thể góp phần làm mất nước.`);
  if (nutrients.caloriesKcal.count && nutrients.caloriesKcal.amount > 200) {
    healthAlerts.push(`Năng lượng từ đồ uống đã nhập là ${nutrients.caloriesKcal.amount.toLocaleString('vi-VN')} kcal, trên mốc cảnh báo ứng dụng 200 kcal.`);
  }

  if (!remainingMl) suggestions.push('Tiếp tục uống theo cảm giác khát và hướng dẫn y tế riêng nếu có; không cần cố uống thêm để đạt điểm cao hơn.');
  else if (!suggestions.length) suggestions.push('Nếu muốn, chia phần còn lại theo các lần nhỏ trong thời gian còn thức; không ép uống nhanh hoặc vượt nhu cầu.');
  const status = score < 50 ? 'Dưới 50% mục tiêu nhắc nhở' : score < 80 ? 'Đang tiến gần mục tiêu nhắc nhở' : 'Đã đạt ít nhất 80% mục tiêu nhắc nhở';

  return {
    totalMl, percent, score, remainingMl, status,
    good: positives.length ? positives : ['Chưa có điểm tích cực để rút ra từ dữ liệu hiện tại.'],
    improve: warnings.length ? warnings : ['Chưa thấy điểm cần lưu ý từ dữ liệu đã ghi.'],
    warnings, positives, suggestions, recommendation: suggestions.join(' '),
    drinks, nutrients, healthAlerts, caffeineReference, sugarReference,
    longestGapMinutes: longestGap.minutes,
  };
}

export function getWeeklyTotals(entries, targetMl, now = new Date()) {
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12);
    const key = localDateKey(day);
    const totalMl = entries.filter((entry) => entry.date === key).reduce((sum, entry) => sum + (Number(entry.amountMl) || 0), 0);
    days.push({ date: key, label: localWeekday(day), totalMl, goalMl: targetMl });
  }
  return days;
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
