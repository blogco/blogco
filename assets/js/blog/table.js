// GitHub-Flavored Markdown table helpers for the #/blog/new editor.
//
// The editor parses GitHub-Flavored Markdown locally. There is no network call,
// model configuration, or API key involved in table creation.
//
// Pure functions only — no DOM, no network — so they are unit-testable.

function escapeCell(value = '') {
  return String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function splitTableRow(line = '') {
  const source = String(line).trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && source[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isSeparatorRow(line = '') {
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function looksLikeMarkdownTable(text = '') {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  return lines.length >= 3 && splitTableRow(lines[0]).length >= 2 && isSeparatorRow(lines[1]);
}

// Parse a Markdown table into a rows[][] (used to render it inside the editor).
export function parseMarkdownTable(markdown = '') {
  return String(markdown)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('|') && !isSeparatorRow(line))
    .map(splitTableRow)
    .filter((row) => row.some(Boolean));
}

export function rowsToMarkdown(rows = []) {
  const clean = rows.filter((row) => row.length).map((row) => row.map(escapeCell));
  if (clean.length < 2) return '';
  const width = Math.max(...clean.map((row) => row.length));
  const pad = (row) => [...row, ...Array(width - row.length).fill('')];
  const line = (cells) => `| ${pad(cells).join(' | ')} |`;
  const header = pad(clean[0]);
  return [line(header), line(header.map(() => '---')), ...clean.slice(1).map(line)].join('\n');
}
