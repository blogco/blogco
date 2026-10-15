import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, buildFrontMatter, buildPostMarkdown, postPath, parseRepo,
  contentsApiUrl, toBase64, buildCommitPayload, commitMessage,
  thumbnailFallbackUrl, thumbnailQuery, stockApiUrl, pickStockImage,
} from './lib.js';
import { applyWrap, applyLinePrefix, applyBlock } from './main.js';

test('slugify handles Vietnamese diacritics and punctuation', () => {
  assert.equal(slugify('Kinh nghiệm uống cà phê lành mạnh'), 'kinh-nghiem-uong-ca-phe-lanh-manh');
  assert.equal(slugify('Đường & Sức khoẻ!'), 'duong-suc-khoe');
  assert.equal(slugify('   '), 'bai-viet');
  assert.equal(slugify('a'.repeat(200)).length, 80);
});

test('buildFrontMatter emits valid YAML with cover + tags', () => {
  const fm = buildFrontMatter({
    title: 'Cà phê "sạch"', date: '2026-10-15T00:00:00.000Z',
    tags: 'sức khoẻ, cà phê', cover: 'https://x/y.jpg', coverAlt: 'Ảnh', author: 'Duy',
  });
  assert.match(fm, /^---\n/);
  assert.match(fm, /title: "Cà phê \\"sạch\\""/);
  assert.match(fm, /draft: false/);
  assert.match(fm, /author: "Duy"/);
  assert.match(fm, /cover:\n {2}image: "https:\/\/x\/y\.jpg"/);
  assert.match(fm, /tags:\n {2}- "sức khoẻ"\n {2}- "cà phê"/);
  assert.match(fm, /\n---\n$/);
});

test('buildPostMarkdown uses the thumbnail as the first image', () => {
  const md = buildPostMarkdown({
    frontMatter: '---\ntitle: "X"\n---',
    image: 'https://img/cover.jpg', imageAlt: 'Bìa', body: '# Thân bài\n\nNội dung.',
  });
  const expected = '---\ntitle: "X"\n---\n\n![Bìa](https://img/cover.jpg)\n\n# Thân bài\n\nNội dung.\n';
  assert.equal(md, expected);
  assert.ok(md.indexOf('![Bìa]') < md.indexOf('# Thân bài'), 'image precedes the body');
});

test('postPath + parseRepo + contentsApiUrl build the right GitHub targets', () => {
  assert.equal(postPath('Cà phê ngon'), 'content/posts/ca-phe-ngon.md');
  assert.deepEqual(parseRepo('blogco/blogco'), { owner: 'blogco', name: 'blogco' });
  assert.equal(
    contentsApiUrl('blogco/blogco', 'content/posts/x.md', 'main'),
    'https://api.github.com/repos/blogco/blogco/contents/content/posts/x.md?ref=main',
  );
});

test('toBase64 + buildCommitPayload encode UTF-8 content for the API', () => {
  assert.equal(toBase64('hello'), 'aGVsbG8=');
  assert.equal(toBase64('Cà phê'), 'Q8OgIHBow6o=');
  const payload = buildCommitPayload({ message: 'post: X', content: 'hello', branch: 'main' });
  assert.deepEqual(payload, { message: 'post: X', content: 'aGVsbG8=', branch: 'main' });
  assert.equal(buildCommitPayload({ message: 'm', content: 'x', branch: 'main', sha: 'abc' }).sha, 'abc');
  assert.equal(commitMessage('  '), 'post: bài viết mới');
});

test('thumbnail helpers pick a query + provider URLs', () => {
  assert.equal(thumbnailQuery({ title: 'Uống nước', tags: 'sức khoẻ, nước' }), 'sức khoẻ');
  assert.equal(thumbnailFallbackUrl('Ca phe ngon'), 'https://picsum.photos/seed/ca-phe-ngon/1200/630');
  assert.equal(stockApiUrl('pexels', 'coffee'), 'https://api.pexels.com/v1/search?query=coffee&per_page=1&orientation=landscape');
  assert.equal(stockApiUrl('unsplash', 'coffee'), 'https://api.unsplash.com/search/photos?query=coffee&per_page=1&orientation=landscape');
  assert.equal(stockApiUrl('nope', 'coffee'), '');
});

test('pickStockImage reads the first result for each provider', () => {
  assert.deepEqual(
    pickStockImage('pexels', { photos: [{ src: { landscape: 'L' }, photographer: 'P', url: 'U' }] }),
    { url: 'L', credit: 'P', link: 'U' },
  );
  assert.deepEqual(
    pickStockImage('unsplash', { results: [{ urls: { regular: 'R' }, user: { name: 'N' }, links: { html: 'H' } }] }),
    { url: 'R', credit: 'N', link: 'H' },
  );
  assert.equal(pickStockImage('pexels', { photos: [] }), null);
});

test('toolbar helpers wrap selections and prefix lines', () => {
  const wrap = { value: 'hello world', selectionStart: 6, selectionEnd: 11, focus() {}, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } };
  applyWrap(wrap, '**', '**');
  assert.equal(wrap.value, 'hello **world**');

  const line = { value: 'a\nb\nc', selectionStart: 0, selectionEnd: 5, focus() {} };
  applyLinePrefix(line, '- ');
  assert.equal(line.value, '- a\n- b\n- c');

  const block = { value: 'code', selectionStart: 0, selectionEnd: 4, focus() {} };
  applyBlock(block, '```\n', '\n```');
  assert.equal(block.value, '```\ncode\n```');
});
