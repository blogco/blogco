import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBrandGuidelines, COLOR_TOKENS, CSS_TOKENS } from './main.js';

test('brand guidelines exposes the Samsung Corporate palette tokens', () => {
  const byToken = Object.fromEntries(COLOR_TOKENS.map((c) => [c.token, c.hex.toUpperCase()]));
  assert.equal(byToken['--blogco-primary'], '#1428A0');
  assert.equal(byToken['--blogco-primary-hover'], '#0F1F7A');
  assert.equal(byToken['--blogco-accent-sky'], '#0689D8');
  assert.equal(byToken['--blogco-accent-bg'], '#E8F0FE');
  assert.equal(byToken['--blogco-bg'], '#FFFFFF');
  assert.equal(byToken['--blogco-card-bg'], '#F7F7F7');
  assert.equal(byToken['--blogco-text-main'], '#000000');
  assert.equal(byToken['--blogco-text-body'], '#75787B');
  assert.equal(byToken['--blogco-text-muted'], '#A6A6A6');
  assert.equal(byToken['--blogco-border'], '#E6E6E6');
});

test('CSS tokens snippet defines the reusable :root variables', () => {
  assert.match(CSS_TOKENS, /:root\s*\{/);
  assert.match(CSS_TOKENS, /--blogco-primary:\s*#1428A0;/);
  assert.match(CSS_TOKENS, /--blogco-font-family:/);
});

test('rendered page includes every required section', () => {
  const html = renderBrandGuidelines();
  assert.match(html, /Corporate Identity &amp; Brand Guidelines/);
  assert.match(html, /brand-swatch/);           // color palette swatches
  assert.match(html, /brand-demo-h1/);          // typography showcase
  assert.match(html, /brand-btn--primary/);     // UI component library
  assert.match(html, /brand-table/);            // data table
  assert.match(html, /data-brand-copy/);        // CSS tokens code block
  assert.match(html, /--blogco-primary: #1428A0;/);
});
