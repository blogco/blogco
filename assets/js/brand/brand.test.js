import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBrandGuidelines, COLOR_TOKENS, CSS_TOKENS } from './main.js';

test('brand guidelines exposes the Ericsson-inspired palette tokens', () => {
  const byToken = Object.fromEntries(COLOR_TOKENS.map((c) => [c.token, c.hex.toUpperCase()]));
  assert.equal(byToken['--blogco-primary'], '#002561');
  assert.equal(byToken['--blogco-primary-hover'], '#001B46');
  assert.equal(byToken['--blogco-accent-sky'], '#0082F0');
  assert.equal(byToken['--blogco-accent-bg'], '#EAF3FE');
  assert.equal(byToken['--blogco-bg'], '#F4F8FC');
  assert.equal(byToken['--blogco-card-bg'], '#FFFFFF');
  assert.equal(byToken['--blogco-text-main'], '#002561');
  assert.equal(byToken['--blogco-text-body'], '#33475B');
  assert.equal(byToken['--blogco-text-muted'], '#5B6B7F');
  assert.equal(byToken['--blogco-border'], '#D5E3F0');
});

test('CSS tokens snippet defines the reusable :root variables', () => {
  assert.match(CSS_TOKENS, /:root\s*\{/);
  assert.match(CSS_TOKENS, /--blogco-primary:\s*#002561;/);
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
  assert.match(html, /--blogco-primary: #002561;/);
});
