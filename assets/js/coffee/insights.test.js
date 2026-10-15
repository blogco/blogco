import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights, classifyHealth, renderAiInsights } from './insights.js';

const NOW = new Date('2026-10-15T09:00:00');

function receipt(overrides = {}) {
  return {
    store: 'Highlands Coffee',
    date: '2026-10-14',
    total: 100000,
    items: [],
    ...overrides,
  };
}

test('classifyHealth flags sweet, caffeine, high-calorie and healthy drinks', () => {
  assert.equal(classifyHealth('Matcha Latte').sweet, true);
  assert.equal(classifyHealth('Matcha Latte').caffeine, true);
  assert.equal(classifyHealth('Trà sữa').sweet, true);
  assert.equal(classifyHealth('Cà phê sữa đá').caffeine, true);
  assert.equal(classifyHealth('Bánh croissant').highCalorie, true);
  assert.equal(classifyHealth('Trà xanh không đường').healthy, true);
  assert.equal(classifyHealth('Trà xanh không đường').sweet, false);
  assert.deepEqual(classifyHealth(''), { sweet: false, caffeine: false, highCalorie: false, healthy: false });
});

test('buildInsights ranks top items, brands and seasons', () => {
  const receipts = [
    receipt({ store: 'Highlands Coffee', items: [{ name: 'Matcha Latte', qty: 1, amount: 60000 }, { name: 'Bánh dừa', qty: 1, amount: 40000 }] }),
    receipt({ store: 'Highlands Coffee', date: '2026-10-13', items: [{ name: 'Matcha Latte', qty: 2, amount: 120000 }] }),
    receipt({ store: 'Starbucks', date: '2026-07-02', items: [{ name: 'Cold Brew', qty: 1, amount: 70000 }] }),
  ];
  const data = buildInsights(receipts, { now: NOW });
  assert.equal(data.topItems[0].name, 'Matcha Latte');
  assert.equal(data.topItems[0].count, 3);
  assert.equal(data.topBrands[0].name, 'Highlands Coffee');
  assert.equal(data.topBrands[0].count, 2);
  // Tháng 7 → Thu, tháng 10 → Đông
  assert.deepEqual(data.topSeasons.map((s) => s.label).sort(), ['Thu', 'Đông']);
});

test('buildInsights raises friendly warnings when sweets exceed the weekly threshold', () => {
  const items = [{ name: 'Matcha Latte', qty: 5, amount: 300000 }];
  const data = buildInsights([receipt({ items })], { now: NOW });
  assert.equal(data.health.sweetWeek, 5);
  const warning = data.alerts.find((alert) => alert.tone === 'warning' && /ngọt/.test(alert.title));
  assert.ok(warning, 'expects a sweet-drink warning');
  assert.match(warning.message, /5 ly đồ uống ngọt/);
});

test('buildInsights only counts the trailing week and current month', () => {
  const receipts = [
    receipt({ date: '2026-10-14', items: [{ name: 'Trà sữa', qty: 2, amount: 0 }] }),
    receipt({ date: '2026-09-01', items: [{ name: 'Trà sữa', qty: 2, amount: 0 }] }),
  ];
  const data = buildInsights(receipts, { now: NOW });
  assert.equal(data.health.sweetWeek, 2);   // chỉ tuần này
  assert.equal(data.health.sweetMonth, 2);  // chỉ tháng 10
});

test('buildInsights suggests healthy alternatives for the dominant category', () => {
  const receipts = [receipt({ items: [{ name: 'Trà sữa', qty: 3, amount: 0 }, { name: 'Freeze trà xanh', qty: 2, amount: 0 }] })];
  const data = buildInsights(receipts, { now: NOW });
  assert.equal(data.categoryCounts[0].category, 'tea');
  assert.ok(data.alternatives.length > 0);
  assert.ok(data.alternatives.some((tip) => /sinh tố|nước ép|trà nguyên chất/i.test(tip)));
});

test('renderAiInsights outputs title, refresh button and health section', () => {
  const html = renderAiInsights([receipt({ items: [{ name: 'Matcha Latte', qty: 1, amount: 60000 }] })], { now: NOW });
  assert.match(html, /AI Insights/);
  assert.match(html, /data-ai-refresh/);
  assert.match(html, /Làm mới Insights/);
  assert.match(html, /Đề xuất thay thế thông minh/);
  assert.match(html, /Matcha Latte/);
});

test('buildInsights exposes favorite item and top spend brand', () => {
  const receipts = [
    receipt({ store: 'Highlands Coffee', items: [{ name: 'Matcha Latte', qty: 1, amount: 60000 }] }),
    receipt({ store: 'Highlands Coffee', date: '2026-10-13', items: [{ name: 'Matcha Latte', qty: 2, amount: 120000 }] }),
    receipt({ store: 'Starbucks', date: '2026-10-12', total: 500000, items: [{ name: 'Cold Brew', qty: 1, amount: 90000 }] }),
  ];
  const data = buildInsights(receipts, { now: NOW });
  assert.equal(data.favoriteItem.name, 'Matcha Latte');
  assert.equal(data.favoriteItem.count, 3);
  assert.equal(data.topSpendBrand.name, 'Starbucks');
  assert.equal(data.topSpendBrand.total, 500000);
  assert.ok(data.brandSegments.length >= 1);
  assert.ok(htmlHas(renderAiInsights(receipts, { now: NOW }), 'Brand')); 
});

function htmlHas(html, text) {
  return String(html).includes(text);
}

test('renderAiInsights handles the empty state', () => {
  const html = renderAiInsights([], { now: NOW });
  assert.match(html, /Chưa có dữ liệu để phân tích/);
  assert.match(html, /data-ai-refresh/);
});
