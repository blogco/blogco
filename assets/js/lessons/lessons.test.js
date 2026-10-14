import test from 'node:test';
import assert from 'node:assert/strict';

import { lessonToSlides, normalizeLesson, renderSlidesHtml, chunk, escapeHtml } from './templates.js';
import { buildLesson as buildKoreanLesson, buildPrompt as buildKoreanPrompt, detectPack } from './korean.js';
import { buildLesson as buildTypingLesson } from './typing.js';
import { mergeLesson, parseLessonJson, buildFallbackLesson } from './ai.js';
import { slugifyFileName } from './export-pdf.js';

const koreanConfig = {
  mode: 'korean',
  topic: 'Chào hỏi cơ bản',
  level: 'Sơ cấp 2',
  audience: 'Người mới bắt đầu',
  duration: 90,
  sessions: 1,
  skills: ['Nghe', 'Nói'],
  language: 'vi',
  notes: '',
};

const typingConfig = {
  mode: 'typing',
  topic: 'Đánh máy tiếng Hàn cơ bản',
  level: 'Cơ bản',
  audience: 'Nhân viên văn phòng',
  duration: 90,
  sessions: 1,
  skills: ['Cài đặt bộ gõ'],
  language: 'vi',
};

test('escapeHtml encodes dangerous characters', () => {
  assert.equal(escapeHtml('<b>"a" & \'b\'</b>'), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
});

test('chunk splits arrays into fixed groups', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
});

test('Korean lesson yields 10-15 slides', () => {
  const lesson = buildKoreanLesson(koreanConfig);
  const slides = lessonToSlides(lesson, koreanConfig);
  assert.ok(slides.length >= 10, `expected >= 10 slides, got ${slides.length}`);
  assert.ok(slides.length <= 15, `expected <= 15 slides, got ${slides.length}`);
  assert.ok(slides[0].html.includes('pdf-slide--cover'));
});

test('Typing lesson yields 10-15 slides with keyboard diagram', () => {
  const lesson = buildTypingLesson(typingConfig);
  const slides = lessonToSlides(lesson, typingConfig);
  assert.ok(slides.length >= 10 && slides.length <= 15, `got ${slides.length}`);
  const html = renderSlidesHtml(lesson, typingConfig);
  assert.ok(html.includes('pdf-keyboard'));
  assert.ok(html.includes('14 phụ âm'));
});

test('normalizeLesson accepts snake_case AI output', () => {
  const norm = normalizeLesson({
    title: 'Bài test',
    keyboard_layout: { consonants: [{ key: 'q', hangul: 'ㅂ', romanization: 'b/p' }] },
    practice_texts: ['안녕하세요'],
    vocabulary: [{ korean: '안녕', romanization: 'annyeong', vietnamese: 'Chào', example: '안녕.' }],
  }, { mode: 'typing' });
  assert.equal(norm.title, 'Bài test');
  assert.equal(norm.keyboardLayout.consonants.length, 1);
  assert.equal(norm.keyboardLayout.rows.length, 3);
  assert.deepEqual(norm.practiceTexts, ['안녕하세요']);
  assert.equal(norm.vocabulary[0].meaning, 'Chào');
});

test('parseLessonJson strips markdown fences', () => {
  assert.deepEqual(parseLessonJson('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(parseLessonJson('Kết quả: {"b": 2} nhé'), { b: 2 });
  assert.throws(() => parseLessonJson('không có json'));
});

test('mergeLesson keeps fallback structure while overriding AI fields', () => {
  const merged = mergeLesson('typing', typingConfig, {
    title: 'AI title',
    objectives: ['Mục tiêu AI'],
    keyboard_layout: { consonants: [{ key: 'q', hangul: 'ㅂ', romanization: 'b/p' }] },
    practice_texts: ['문장'],
  });
  assert.equal(merged.title, 'AI title');
  assert.deepEqual(merged.objectives, ['Mục tiêu AI']);
  assert.equal(merged.keyboardLayout.consonants.length, 1);
  assert.equal(merged.keyboardLayout.rows.length, 3);
  assert.deepEqual(merged.practiceTexts, ['문장']);
  assert.equal(merged.generatedBy, 'ai');
});

test('detectPack maps topics to content packs', () => {
  assert.equal(detectPack('Chào hỏi và giới thiệu'), 'greeting');
  assert.equal(detectPack('Gọi món ở nhà hàng'), 'food');
  assert.equal(detectPack('Du lịch Hàn Quốc'), 'travel');
  assert.equal(detectPack('Một chủ đề lạ'), 'default');
});

test('buildFallbackLesson returns rule-based lesson', () => {
  const lesson = buildFallbackLesson(koreanConfig);
  assert.equal(lesson.generatedBy, 'rule');
  assert.ok(lesson.vocabulary.length >= 10);
  assert.ok(lesson.dialogue.length >= 6);
});

test('buildKoreanPrompt includes topic and JSON template', () => {
  const prompt = buildKoreanPrompt(koreanConfig);
  assert.ok(prompt.includes('Chào hỏi cơ bản'));
  assert.ok(prompt.includes('"vocabulary"'));
});

test('slugifyFileName produces safe ascii filename', () => {
  const name = slugifyFileName('Chào hỏi và giới thiệu');
  assert.match(name, /^giao-an-chao-hoi-va-gioi-thieu-\d+\.pdf$/);
});
