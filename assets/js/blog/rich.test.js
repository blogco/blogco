import test from 'node:test';
import assert from 'node:assert/strict';
import { plainTextToHtml, sanitizePastedHtml, cleanMarkdown, escapeHtml } from './rich.js';

test('plainTextToHtml turns blank lines into paragraphs', () => {
  assert.equal(plainTextToHtml('Đoạn một\n\nĐoạn hai'), '<p>Đoạn một</p>\n<p>Đoạn hai</p>');
});

test('plainTextToHtml keeps single newlines as line breaks', () => {
  assert.equal(plainTextToHtml('Dòng 1\nDòng 2'), '<p>Dòng 1<br>Dòng 2</p>');
});

test('plainTextToHtml auto-detects bullet, numbered and quoted lists', () => {
  assert.equal(plainTextToHtml('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(plainTextToHtml('• x\n• y'), '<ul><li>x</li><li>y</li></ul>');
  assert.equal(plainTextToHtml('1. a\n2) b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(plainTextToHtml('> trích\n> dẫn'), '<blockquote>trích<br>dẫn</blockquote>');
});

test('plainTextToHtml maps # headings to blog heading levels', () => {
  assert.equal(plainTextToHtml('# Lớn'), '<h2>Lớn</h2>');
  assert.equal(plainTextToHtml('## Vừa'), '<h2>Vừa</h2>');
  assert.equal(plainTextToHtml('### Nhỏ'), '<h3>Nhỏ</h3>');
});

test('plainTextToHtml escapes HTML and skips empty lines', () => {
  assert.equal(plainTextToHtml('a < b & c'), '<p>a &lt; b &amp; c</p>');
  assert.equal(plainTextToHtml('\n\n   \n'), '');
  assert.equal(escapeHtml('<x>'), '&lt;x&gt;');
});

test('sanitizePastedHtml removes scripts, handlers and javascript: URLs', () => {
  assert.equal(sanitizePastedHtml('<p onclick="x()">hi</p>'), '<p>hi</p>');
  assert.equal(sanitizePastedHtml('<script>bad()</script>ok'), 'ok');
  assert.equal(sanitizePastedHtml('<style>.a{}</style>ok'), 'ok');
  assert.equal(sanitizePastedHtml('<a href="javascript:alert(1)">x</a>'), '<a href="#">x</a>');
});

test('cleanMarkdown collapses blank runs and keeps hard breaks', () => {
  assert.equal(cleanMarkdown('a\n\n\n\nb\n'), 'a\n\nb');
  assert.equal(cleanMarkdown('  \nhello\n  '), 'hello');
  assert.equal(cleanMarkdown('line  \nnext'), 'line  \nnext');
});
