// Plain-text + Markdown helpers for the #/blog/new editor. The editor is a
// contenteditable "rich text" surface: authors paste ordinary prose and the
// site converts it to Markdown on save, so no Markdown syntax ever has to be
// typed by hand.

const BULLET = /^\s*[-*+•·]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*)$/;

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

// Pasted plain text → simple HTML blocks: a blank line starts a new paragraph,
// single newlines become line breaks, and bare bullets / numbers / # lines turn
// into lists and headings automatically.
export function plainTextToHtml(text = '') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    if (BULLET.test(line)) {
      const items = [];
      while (i < lines.length && BULLET.test(lines[i])) { items.push(BULLET.exec(lines[i])[1].trim()); i += 1; }
      out.push(`<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (ORDERED.test(line)) {
      const items = [];
      while (i < lines.length && ORDERED.test(lines[i])) { items.push(ORDERED.exec(lines[i])[1].trim()); i += 1; }
      out.push(`<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`);
      continue;
    }

    if (QUOTE.test(line)) {
      const items = [];
      while (i < lines.length && QUOTE.test(lines[i])) { items.push(QUOTE.exec(lines[i])[1].trim()); i += 1; }
      out.push(`<blockquote>${items.map((item) => escapeHtml(item)).join('<br>')}</blockquote>`);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      // Blog posts top out at H2, so a single # also maps to H2.
      const level = heading[1].length >= 3 ? 3 : 2;
      out.push(`<h${level}>${escapeHtml(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length && lines[i].trim()
      && !BULLET.test(lines[i]) && !ORDERED.test(lines[i])
      && !QUOTE.test(lines[i]) && !HEADING.test(lines[i])
    ) {
      paragraph.push(escapeHtml(lines[i].trim()));
      i += 1;
    }
    out.push(`<p>${paragraph.join('<br>')}</p>`);
  }
  return out.join('\n');
}

// Strip anything dangerous from clipboard HTML before it enters the editor
// (the editor is author-only, but scripts/styles would still run locally).
export function sanitizePastedHtml(html = '') {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|head|title)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

// Tidy the generated Markdown: normalise newlines, drop runs of blank lines and
// trim the edges. Trailing double-spaces (hard breaks) are intentionally kept.
export function cleanMarkdown(markdown = '') {
  return String(markdown)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Figures (inline images with alignment + optional caption)
//
// Hugo's Goldmark renderer runs with `unsafe = false`, so a raw `<figure>` in
// the Markdown would be stripped from published posts. The site ships PaperMod's
// `figure` shortcode (which renders a real <figure>/<figcaption> with lazy
// loading and centering), so inline images are serialised to that shortcode.
// `expandFigureShortcodes` reverses it for the client-side preview, which
// renders Markdown with `marked` (no shortcode support).
// ---------------------------------------------------------------------------

export const FIGURE_ALIGNMENTS = ['left', 'center', 'full'];

// Values must survive Hugo's shortcode lexer: no raw quotes or angle brackets.
function shortcodeValue(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/\s+/g, ' ')
    .trim();
}

export function figureShortcode({ src = '', alt = '', caption = '', align = 'center' } = {}) {
  if (!src) return '';
  const mode = FIGURE_ALIGNMENTS.includes(align) ? align : 'left';
  const params = [`src="${shortcodeValue(src)}"`];
  if (alt) params.push(`alt="${shortcodeValue(alt)}"`);
  if (caption) params.push(`caption="${shortcodeValue(caption)}"`);
  if (mode === 'center') params.push('align="center"');
  else if (mode === 'full') params.push('class="align-full"');
  return `{{< figure ${params.join(' ')} >}}`;
}

const FIGURE_SHORTCODE = /\{\{[<%]\s*figure\s+([^>]*?)\s*[>%]\}\}/gi;

function shortcodeAlign(params) {
  if (params.align === 'center') return 'center';
  if (/\balign-full\b/.test(params.class || '')) return 'full';
  return 'left';
}

// Preview-only: turn `{{< figure … >}}` back into a <figure> that `marked` (and
// the browser) can display. Values were entity-escaped on the way in, so they
// are safe to drop straight back into attributes / text nodes.
export function expandFigureShortcodes(markdown = '') {
  return String(markdown).replace(FIGURE_SHORTCODE, (whole, attrs = '') => {
    const params = {};
    const matcher = /([\w-]+)\s*=\s*"([^"]*)"/g;
    let match;
    while ((match = matcher.exec(attrs))) params[match[1].toLowerCase()] = match[2];
    if (!params.src) return whole;

    const align = shortcodeAlign(params);
    const cssClass = ['md-figure', align === 'center' ? 'md-figure--center' : '', align === 'full' ? 'md-figure--full' : ''].filter(Boolean).join(' ');
    const caption = params.caption ? `<figcaption>${params.caption}</figcaption>` : '';
    const alt = params.alt ? ` alt="${params.alt}"` : '';
    return `<figure class="${cssClass}"><img src="${params.src}"${alt} loading="lazy">${caption}</figure>`;
  });
}
