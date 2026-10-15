import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeArticle, scoreArticle } from './score.js';

const GOOD = `## Giới thiệu

Cà phê là thức uống quen thuộc. Nó giúp bạn tỉnh táo. Nhưng uống quá nhiều thì không tốt cho sức khoẻ.

![Ảnh 1](https://x/a.jpg)

## Cách uống lành mạnh

- Uống 1–2 tách mỗi ngày.
- Tránh uống lúc đói.
- Hạn chế thêm đường.

Hãy **điều chỉnh** lượng cà phê mỗi ngày. Bạn sẽ **ngủ ngon** hơn. Một số người nhạy cảm nên chọn **decaf**.

![Ảnh 2](https://x/b.jpg)

## Kết luận

Uống cà phê khoa học giúp bạn tận hưởng mà vẫn khoẻ. Hãy lắng nghe cơ thể!
`;

test('analyzeArticle counts structure, images, lists and bold', () => {
  const stats = analyzeArticle({ title: 'Uống cà phê lành mạnh', markdown: GOOD });
  assert.equal(stats.imageCount, 2);
  assert.equal(stats.headingCount, 3);
  assert.equal(stats.listItemCount, 3);
  assert.equal(stats.boldCount, 3);
  assert.ok(stats.wordCount > 30);
  assert.ok(stats.maxParagraphSentences >= 1);
});

test('scoreArticle returns a 0–5 score with the three criteria groups', () => {
  const result = scoreArticle({ title: 'Uống cà phê lành mạnh: 3 nguyên tắc', markdown: GOOD });
  assert.equal(result.categories.length, 3);
  assert.deepEqual(result.categories.map((category) => category.key), ['visual', 'structure', 'engagement']);
  assert.ok(result.score >= 0 && result.score <= 5);
  assert.ok(result.score >= 4, `expected a strong article to score >=4, got ${result.score}`);
  assert.equal(typeof result.verdict, 'string');
  assert.ok(result.verdict.length > 0);
});

test('a good article keeps the actionable image/heading tips away', () => {
  const result = scoreArticle({ title: 'Uống cà phê lành mạnh: 3 nguyên tắc', markdown: GOOD });
  const joined = result.suggestions.join(' ');
  assert.ok(!/thêm ít nhất 1 ảnh/i.test(joined));
  assert.ok(!/tiêu đề phụ/i.test(joined));
});

test('an empty article scores 0 with a single nudge', () => {
  const result = scoreArticle({ title: '', markdown: '' });
  assert.equal(result.score, 0);
  assert.equal(result.suggestions.length, 1);
  assert.match(result.suggestions[0], /chưa có nội dung/i);
  assert.equal(result.categories.length, 3);
});

test('a giant paragraph and missing images raise visual/structure tips', () => {
  const wall = 'Đây là một câu khá dài để đo nhịp điệu của đoạn văn trong bài viết này. '.repeat(4);
  const markdown = `Mở bài ngắn.\n\n${Array.from({ length: 7 }, () => wall).join(' ')}\n`;
  const result = scoreArticle({ title: 'Bài viết', markdown });
  assert.ok(result.stats.maxParagraphSentences >= 6);
  const joined = result.suggestions.join(' ');
  assert.match(joined, /chia nhỏ đoạn/i);
  assert.match(joined, /ảnh minh hoạ/i);
  assert.ok(result.categories[0].score < 5);
});
