const DAY_MS = 24 * 60 * 60 * 1000;

export function getTargetMl(profile) {
  if (!profile.useFormula || !profile.sex || !profile.weightKg) return Number(profile.goalMl) || 2000;
  let estimate = Number(profile.weightKg) * (profile.sex === 'male' ? 35 : 31);
  if (Number(profile.activityMinutes) > 60) estimate += 500;
  if (profile.hotWeather) estimate += 300;
  if (profile.pregnancyOrBreastfeeding) estimate += 300;
  return Math.round(Math.max(250, Math.min(10000, estimate)) / 50) * 50;
}

export function buildDailyInsights(entries, targetMl, dateKey) {
  const today = entries.filter((entry) => entry.date === dateKey);
  const totalMl = today.reduce((sum, entry) => sum + entry.amountMl, 0);
  const percent = targetMl > 0 ? Math.round(totalMl / targetMl * 100) : 0;
  const score = Math.min(100, percent);
  const remainingMl = Math.max(0, targetMl - totalMl);
  const ordered = [...today].sort((a, b) => a.time.localeCompare(b.time));
  const gaps = ordered.slice(1).map((entry, index) => {
    const [h1, m1] = ordered[index].time.split(':').map(Number);
    const [h2, m2] = entry.time.split(':').map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
  });
  const longGap = gaps.some((minutes) => minutes > 180);
  let status = 'Còn nhiều so với mục tiêu đã chọn';
  if (score >= 80) status = 'Đã gần đạt mục tiêu';
  else if (score >= 50) status = 'Đang tiếp tục bổ sung';
  return {
    totalMl,
    percent,
    score,
    remainingMl,
    status,
    good: today.length ? ['Đã ghi nhận đồ uống trong ngày; hãy tiếp tục theo nhu cầu cá nhân.'] : ['Chưa có bản ghi hôm nay.'],
    improve: [
      ...(remainingMl ? [`Còn ${remainingMl.toLocaleString('vi-VN')} ml so với mục tiêu nhắc nhở đã chọn.`] : ['Mục tiêu nhắc nhở trong ngày đã đạt.']),
      ...(longGap ? ['Các lần ghi nhận cách nhau khá lâu; hãy uống theo nhu cầu, không cần uống dồn.'] : []),
    ],
    recommendation: remainingMl
      ? `Còn ${remainingMl.toLocaleString('vi-VN')} ml theo mục tiêu của bạn. Nếu phù hợp, chia lượng còn lại thành các lần nhỏ trong thời gian còn thức; không cố uống nhanh hoặc uống quá mức.`
      : 'Bạn đã đạt mục tiêu nhắc nhở đã đặt. Hãy tiếp tục uống theo cảm giác khát và hướng dẫn y tế riêng nếu có.',
  };
}

export function getWeeklyTotals(entries, targetMl, now = new Date()) {
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(now.getTime() - offset * DAY_MS);
    const key = localDateKey(day);
    const totalMl = entries.filter((entry) => entry.date === key).reduce((sum, entry) => sum + entry.amountMl, 0);
    days.push({
      date: key,
      label: new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(day).replace('.', ''),
      totalMl,
      goalMl: targetMl,
    });
  }
  return days;
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
