import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeMarkdownTable, parseMarkdownTable, rowsToMarkdown,
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

test('rowsToMarkdown preserves Vietnamese and renders HTML-like text as inert table content', () => {
  const md = rowsToMarkdown([['Tính năng', 'Ghi chú'], ['Độ trễ', '<script>alert(1)</script> | 5ms']]);
  assert.match(md, /Độ trễ/);
  assert.match(md, /&lt;script&gt;/);
  assert.match(md, /\\\| 5ms/);
  assert.equal(parseMarkdownTable(md)[1][1], '&lt;script&gt;alert(1)&lt;/script&gt; | 5ms');
});

test('looksLikeMarkdownTable accepts a standard GFM table', () => {
  assert.equal(looksLikeMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |'), true);
});

test('parseMarkdownTable handles escaped pipes in cells', () => {
  const md = '| A | B |\n| --- | --- |\n| 1 \\| 2 | 3 |';
  assert.deepEqual(parseMarkdownTable(md), [['A', 'B'], ['1 | 2', '3']]);
});

test('looksLikeMarkdownTable rejects prose without GFM separators', () => {
  assert.equal(looksLikeMarkdownTable('just some text\nmore text'), false);
});
