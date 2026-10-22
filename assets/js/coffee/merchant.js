export function normalizeMerchantName(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function merchantIdForName(name, merchants = []) {
  const base = `merchant-${encodeURIComponent(normalizeMerchantName(name)).slice(0, 120) || 'new'}`;
  let id = base;
  let suffix = 2;
  const used = new Set(merchants.map((merchant) => merchant.id));
  while (used.has(id)) id = `${base}-${suffix++}`;
  return id;
}

export function merchantSuggestions(query, merchants = [], receipts = []) {
  const needle = normalizeMerchantName(query);
  const counts = new Map();
  receipts.forEach((receipt) => {
    const key = normalizeMerchantName(receipt.store);
    if (!key) return;
    const current = counts.get(key) || { count: 0, recent: '' };
    current.count += 1;
    if (String(receipt.date || '') > current.recent) current.recent = String(receipt.date || '');
    counts.set(key, current);
  });
  return merchants.map((merchant) => {
    const keys = [merchant.normalizedName || merchant.name, ...(merchant.aliases || [])].map(normalizeMerchantName).filter(Boolean);
    const key = normalizeMerchantName(merchant.name);
    const exact = Boolean(needle) && keys.includes(needle);
    const starts = Boolean(needle) && keys.some((key) => key.startsWith(needle));
    const contains = !needle || keys.some((key) => key.includes(needle) || needle.includes(key));
    return { ...merchant, exact, possible: Boolean(needle) && !exact && contains, usage: counts.get(key) || { count: 0, recent: '' }, relevance: !needle ? 100 : exact ? 1000 : starts ? 700 : contains ? 400 : 0 };
  }).filter((merchant) => merchant.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.usage.count - a.usage.count || b.usage.recent.localeCompare(a.usage.recent) || a.name.localeCompare(b.name, 'vi'))
    .slice(0, 6);
}

export function merchantCreateOption(query, merchants = []) {
  const name = String(query || '').replace(/\s+/g, ' ').trim();
  const needle = normalizeMerchantName(name);
  return Boolean(name) && !merchants.some((merchant) => [merchant.name, ...(merchant.aliases || [])].some((alias) => normalizeMerchantName(alias) === needle));
}
