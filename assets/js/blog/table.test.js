import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aiEndpoint, buildTablePrompt, extractTableMarkdown, looksLikeMarkdownTable,
  parseMarkdownTable, rowsToMarkdown, toMarkdownTable,
} from './table.js';

test('rowsToMarkdown builds a padded GFM table', () => {
  const md = rowsToMarkdown([['A', 'B'], ['1', '2'], ['3', '4']]);
  assert.equal(md, [
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '| 3 | 4 |',
  ].join('\n'));
});

test('rowsToMarkdown escapes pipes and pads short rows', () => {
  const md = rowsToMarkdown([['H1', 'H2'], ['a|b']]);
  assert.match(md, /\| a\\\|b \|\s*\|/);
});

test('toMarkdownTable splits tab-separated input', () => {
  const md = toMarkdownTable('Name\tAge\nAn\t30\nBinh\t25');
  assert.deepEqual(parseMarkdownTable(md), [['Name', 'Age'], ['An', '30'], ['Binh', '25']]);
});

test('toMarkdownTable splits on two-or-more spaces', () => {
  const md = toMarkdownTable('Tên   Giá\nCà phê   20.000');
  assert.deepEqual(parseMarkdownTable(md), [['Tên', 'Giá'], ['Cà phê', '20.000']]);
});

test('toMarkdownTable handles one cell per line with an even grid', () => {
  // 20 lines → guess 5 columns × 4 rows.
  const lines = Array.from({ length: 20 }, (_, i) => `o${i + 1}`);
  const rows = parseMarkdownTable(toMarkdownTable(lines.join('\n')));
  assert.equal(rows.length, 4);
  assert.equal(rows[0].length, 5);
  assert.deepEqual(rows[0], ['o1', 'o2', 'o3', 'o4', 'o5']);
});

test('extractTableMarkdown strips code fences and surrounding prose', () => {
  const raw = 'Đây là kết quả:\n```markdown\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```\nXong.';
  assert.equal(extractTableMarkdown(raw), '| A | B |\n| --- | --- |\n| 1 | 2 |');
});

test('looksLikeMarkdownTable detects a header + separator', () => {
  assert.equal(looksLikeMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |'), true);
  assert.equal(looksLikeMarkdownTable('just some text\nmore text'), false);
});

test('aiEndpoint resolves provider URLs and default models', () => {
  assert.deepEqual(aiEndpoint({ provider: 'gemini' }), {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    model: 'gemini-2.0-flash',
  });
  const openai = aiEndpoint({ provider: 'openai', model: 'gpt-4o-mini' });
  assert.equal(openai.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(openai.model, 'gpt-4o-mini');
});

test('buildTablePrompt embeds the raw text and the no-explanation rule', () => {
  const prompt = buildTablePrompt('A B\n1 2');
  assert.match(prompt, /Markdown Table/);
  assert.match(prompt, /A B\n1 2/);
});
