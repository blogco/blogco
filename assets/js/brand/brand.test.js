import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBrandGuidelines, COLOR_TOKENS, CSS_TOKENS } from './main.js';

test('brand guidelines exposes the BlogCo corporate palette tokens', () => {
  const byToken = Object.fromEntries(COLOR_TOKENS.map((c) => [c.token, c.hex.toUpperCase()]));
  assert.equal(byToken['--blogco-primary'], '#1A1A1A');
  assert.equal(byToken['--blogco-primary-hover'], '#2C3E50');
  assert.equal(byToken['--blogco-accent-sky'], '#6DC2CA');
  assert.equal(byToken['--blogco-accent-bg'], '#F4F8F9');
  assert.equal(byToken['--blogco-bg'], '#FFFFFF');
  assert.equal(byToken['--blogco-card-bg'], '#F4F8F9');
  assert.equal(byToken['--blogco-text-main'], '#1A1A1A');
  assert.equal(byToken['--blogco-text-body'], '#2C3E50');
  assert.equal(byToken['--blogco-text-muted'], '#7B8790');
  assert.equal(byToken['--blogco-border'], '#E0E0E0');
});

test('CSS tokens snippet defines the reusable :root variables', () => {
  assert.match(CSS_TOKENS, /:root\s*\{/);
  assert.match(CSS_TOKENS, /--blogco-primary:\s*#1A1A1A;/);
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
  assert.match(html, /--blogco-primary: #1A1A1A;/);
});
