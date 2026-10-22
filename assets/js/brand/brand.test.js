import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBrandGuidelines, COLOR_TOKENS, CSS_TOKENS } from './main.js';

test('brand guidelines exposes the Blogco Editorial 2026 palette tokens', () => {
  const byToken = Object.fromEntries(COLOR_TOKENS.map((c) => [c.token, c.hex.toUpperCase()]));
  assert.equal(byToken['--blogco-primary'], '#172638');
  assert.equal(byToken['--blogco-primary-hover'], '#102032');
  assert.equal(byToken['--blogco-accent-sky'], '#087F8C');
  assert.equal(byToken['--blogco-accent-bg'], '#F3F6F4');
  assert.equal(byToken['--blogco-accent-soft'], '#DDF5EC');
  assert.equal(byToken['--blogco-bg'], '#FAFAF7');
  assert.equal(byToken['--blogco-card-bg'], '#FFFFFF');
  assert.equal(byToken['--blogco-text-main'], '#172638');
  assert.equal(byToken['--blogco-text-body'], '#374151');
  assert.equal(byToken['--blogco-text-muted'], '#4B5563');
  assert.equal(byToken['--blogco-border'], '#E5E7EB');
});

test('CSS tokens snippet defines the reusable :root variables', () => {
  assert.match(CSS_TOKENS, /:root\s*\{/);
  assert.match(CSS_TOKENS, /--blogco-primary:\s*#172638;/);
  assert.match(CSS_TOKENS, /--blogco-accent-sky:\s*#087F8C;/);
  assert.match(CSS_TOKENS, /--blogco-font-family:/);
});

test('rendered page includes every required section', () => {
  const html = renderBrandGuidelines();
  assert.match(html, /Blogco Editorial 2026/);
  assert.match(html, /brand-swatch/);           // color palette swatches
  assert.match(html, /brand-demo-h1/);          // typography showcase
  assert.match(html, /brand-btn--primary/);     // UI component library
  assert.match(html, /brand-table/);            // data table
  assert.match(html, /data-brand-copy/);        // CSS tokens code block
  assert.match(html, /--blogco-primary: #172638;/);
});
