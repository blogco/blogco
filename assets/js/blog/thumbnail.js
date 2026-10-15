// Thumbnail picker: try a stock-photo provider (Unsplash / Pexels) when a key
// is configured, otherwise fall back to a deterministic auto illustration so a
// post always ships with a cover + first image.

import { stockApiUrl, pickStockImage, thumbnailFallbackUrl, thumbnailQuery, slugify } from './lib.js';

function meta(name) {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';
}

export function providerKeys() {
  return {
    unsplash: meta('blogco-unsplash-key'),
    pexels: meta('blogco-pexels-key'),
  };
}

async function fromProvider(provider, key, query) {
  const url = stockApiUrl(provider, query, 1);
  if (!url) return null;
  const response = await fetch(url, {
    headers: provider === 'pexels' ? { Authorization: key } : { Authorization: `Client-ID ${key}` },
  });
  if (!response.ok) throw new Error(`${provider} ${response.status}`);
  const picked = pickStockImage(provider, await response.json());
  return picked?.url ? { ...picked, provider } : null;
}

// pickThumbnail({ title, tags, slug }) → { url, provider, credit }
// Never throws: a stock failure falls through to the auto illustration.
export async function pickThumbnail({ title = '', tags = [], slug = '' } = {}) {
  const query = thumbnailQuery({ title, tags });
  const keys = providerKeys();
  const attempts = [];
  if (keys.pexels) attempts.push(['pexels', keys.pexels]);
  if (keys.unsplash) attempts.push(['unsplash', keys.unsplash]);

  for (const [provider, key] of attempts) {
    try {
      const found = await fromProvider(provider, key, query);
      if (found) return found;
    } catch { /* try the next provider, then the fallback */ }
  }
  return { url: thumbnailFallbackUrl(slug || title), provider: 'auto', credit: '' };
}

export { slugify };
