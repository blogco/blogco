// Plain-text helpers for the #/blog/new editor. The editor is a contenteditable
// "rich text" surface: authors paste ordinary prose and the site converts it to
// Markdown on save, so no Markdown syntax ever has to be typed by hand.

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
