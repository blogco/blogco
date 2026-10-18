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
