// "Convert to Table" helpers for the #/blog/new editor.
//
// The editor can turn a block of pasted raw text into a Markdown table two ways:
//   1. An AI model (Gemini / OpenAI) when the author supplies an API key.
//   2. A deterministic local fallback for well-separated input (tabs, pipes,
//      2+ spaces, or one cell per line), so the button still works offline.
//
// Pure functions only — no DOM, no network — so they are unit-testable.

// Models used when the author leaves the model field blank.
export const DEFAULT_MODELS = { gemini: 'gemini-2.0-flash', openai: 'gpt-4o-mini' };

const INSTRUCTION = [
  'Hãy phân tích đoạn văn bản thô sau và chuyển đổi chính xác 100% thành cấu trúc Bảng Markdown (Markdown Table).',
  'Tự động nhận diện đâu là tiêu đề cột (Header) và đâu là các dòng dữ liệu (Rows).',
  'Chỉ trả về duy nhất định dạng Markdown Table, không kèm theo câu giải thích hay lời dẫn, không bọc trong code fence.',
].join(' ');

function escapeCell(value = '') {
  return String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

// Strip an optional ```markdown ... ``` fence and any leading/trailing prose so
// we keep only the table block we asked the model for.
export function extractTableMarkdown(raw = '') {
  let text = String(raw).trim();
  const fence = text.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const start = lines.findIndex((line) => line.startsWith('|') || /\|/.test(line));
  if (start === -1) return '';
  let end = lines.length - 1;
  while (end >= start && !lines[end]) end -= 1;
  return lines.slice(start, end + 1).join('\n');
}

export function looksLikeMarkdownTable(text = '') {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return false;
  const separator = lines[1];
  return lines[0].includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(separator);
}

// Parse a Markdown table into a rows[][] (used to render it inside the editor).
export function parseMarkdownTable(markdown = '') {
  return String(markdown)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('|') && !/^\|?[\s:|-]+\|[\s:|-]*\|?$/.test(line))
    .map((line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
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

// Split one-cell-per-line input assuming a repeated, equal-height grid. Picks
// the column count that divides the line count evenly (falls back to the header
// token count) — good enough for text pasted from a spreadsheet column.
function gridFromLines(lines) {
  const total = lines.length;
  const candidates = [];
  for (let columns = 2; headerCols(4, 8); ) break; // placeholder, replaced below
  for (let k = 2; k <= 8; k += 1) if (total % k === 0) candidates.push(k);
  const k = candidates.length ? Math.max(...candidates) : Math.min(5, lines.length);
  const rows = [];
  for (let i = 0; i < lines.length; i += k) rows.push(lines.slice(i, i + k));
  return rows;
}

// Deterministic fallback converter.
export function toMarkdownTable(input = '') {
  const lines = String(input)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error('Cần ít nhất 2 dòng (tiêu đề + dữ liệu) để tạo bảng.');

  let rows;
  if (lines.some((line) => line.includes('\t'))) {
    rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()));
  } else if (lines.some((line) => line.includes('|'))) {
    rows = lines.map((line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  } else if (lines.some((line) => /\s{2,}/.test(line))) {
    rows = lines.map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()));
  } else if (allSameTokenCount(lines)) {
    rows = lines.map((line) => line.split(/\s+/).filter(Boolean));
  } else {
    rows = null;
  }

  const markdown = rows ? rowsToMarkdown(rows) : '';
  if (markdown) return markdown;

  // Fallback: one cell per line. Guess the column count that divides evenly.
  const perLine = guessColumns(lines);
  const grid = [];
  for (let i = 0; i < lines.length; i += perLine) grid.push(lines.slice(i, i + perLine));
  return rowsToMarkdown(grid);
}

function tokenCounts(line = '') {
  const text = line.trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function guessColumns(lines = []) {
  const total = lines.length;
  for (let k = 8; k >= 2; k -= 1) {
    if (total % k === 0 && total / k >= 2) return k;
  }
  return Math.max(2, Math.ceil(Math.sqrt(total)));
}

function allSameTokenCount(lines = []) {
  const counts = lines.map(tokenCounts);
  return counts.length > 1 && counts.every((count) => count === counts[0]) && counts[0] > 1;
}

// ---------------------------------------------------------------------------
// AI providers
// ---------------------------------------------------------------------------

export function buildTablePrompt(text = '') {
  return `${INSTRUCTION}\n\n---\n${String(text).trim()}\n---`;
}

export function aiEndpoint({ provider = 'gemini', model = '', key = '' } = {}) {
  const chosen = model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;
  if (provider === 'openai') return { url: 'https://api.openai.com/v1/chat/completions', model: chosen };
  return { url: `https://generativelanguage.googleapis.com/v1beta/models/${chosen}:generateContent`, model: chosen };
}

function pickText(provider, data = {}) {
  if (provider === 'openai') return data?.choices?.[0]?.message?.content || '';
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

// Ask the configured provider to convert `text` into a Markdown table.
export async function convertToTableViaAI(text, { provider = 'gemini', model = '', key = '' } = {}) {
  if (!key) throw new Error('Chưa có API key cho AI. Nhập trong mục “AI tạo bảng”.');
  const { url, model: resolved } = aiEndpoint({ provider, model, key });
  const prompt = buildTablePrompt(text);
  const headers = { 'Content-Type': 'application/json' };
  let body;
  if (provider === 'openai') {
    headers.Authorization = `Bearer ${key}`;
    body = JSON.stringify({ model: resolved, messages: [{ role: 'user', content: prompt }], temperature: 0 });
  } else {
    body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } });
  }
  const target = provider === 'openai' ? url : `${url}?key=${encodeURIComponent(key)}`;
  const response = await fetch(target, { method: 'POST', headers, body });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`AI trả lỗi ${response.status}. ${detail.slice(0, 160)}`.trim());
  }
  const data = await response.json();
  const table = extractTableMarkdown(pickText(provider, data));
  if (!table) throw new Error('AI không trả về bảng Markdown hợp lệ.');
  return table;
}
