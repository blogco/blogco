const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderWeeklyChart(container, days) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 700 230');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Biểu đồ lượng đồ uống đã ghi nhận trong bảy ngày gần nhất');
  svg.classList.add('water-week-chart');
  const maxMl = Math.max(1000, ...days.map((day) => day.totalMl), ...days.map((day) => day.goalMl));
  const barWidth = 48;
  const gap = 43;
  const baseline = 180;
  days.forEach((day, index) => {
    const x = 25 + index * (barWidth + gap);
    const height = Math.max(2, (day.totalMl / maxMl) * 140);
    const bar = document.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('x', String(x));
    bar.setAttribute('y', String(baseline - height));
    bar.setAttribute('width', String(barWidth));
    bar.setAttribute('height', String(height));
    bar.setAttribute('rx', '10');
    bar.setAttribute('class', day.totalMl >= day.goalMl ? 'water-bar is-goal' : 'water-bar');
    bar.setAttribute('aria-label', `${day.label}: ${day.totalMl} ml`);
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(x + barWidth / 2));
    label.setAttribute('y', '207');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = day.label;
    const value = document.createElementNS(SVG_NS, 'text');
    value.setAttribute('x', String(x + barWidth / 2));
    value.setAttribute('y', String(Math.max(22, baseline - height - 8)));
    value.setAttribute('text-anchor', 'middle');
    value.setAttribute('class', 'water-chart-value');
    value.textContent = day.totalMl ? `${(day.totalMl / 1000).toFixed(1)}L` : '—';
    svg.append(bar, label, value);
  });
  container.replaceChildren(svg);
}
