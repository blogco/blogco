// "AI" scoring for the #/blog/new editor. The site is fully static, so instead
// of calling a remote model this runs a deterministic heuristic analyser that
// grades an article out of 5 across three groups: visual presentation, text
// structure, and engagement / readability. Pure functions → easy to unit-test.

const LONG_SENTENCE = 25; // words
const PARAGRAPH_SOFT_MAX = 4; // sentences
const PARAGRAPH_HARD_MAX = 6; // sentences

// Inline images can arrive either as classic Markdown or as the editor's Hugo
// `figure` shortcode (used for alignment + captions).
const IMAGE_MARKDOWN = /!\[[^\]]*\]\([^)]*\)/g;
const IMAGE_SHORTCODE = /\{\{[<%]\s*figure\b[^}]*\}\}/gi;

function countImages(markdown = '') {
  const text = String(markdown);
  return (text.match(IMAGE_MARKDOWN) || []).length + (text.match(IMAGE_SHORTCODE) || []).length;
}

function withoutImages(markdown = '') {
  return String(markdown).replace(IMAGE_MARKDOWN, ' ').replace(IMAGE_SHORTCODE, ' ');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function words(value = '') {
  const text = String(value).trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function stripInline(value = '') {
  return String(value)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^[>\s]*/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(value = '') {
  return String(value)
    .replace(/\s*\n\s*/g, ' ')
    .replace(/([.!?…]+)\s+/g, '$1\u0000')
    .split('\u0000')
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function analyzeArticle({ title = '', markdown = '' } = {}) {
  const text = String(markdown || '').replace(/\r\n?/g, '\n').trim();
  const lines = text.split('\n');

  const imageCount = countImages(text);
  const headingCount = lines.filter((line) => /^#{1,6}\s+\S/.test(line)).length;
  const h3Count = lines.filter((line) => /^###\s+\S/.test(line)).length;
  const h2Count = headingCount - h3Count;
  const listItemCount = lines.filter((line) => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)).length;
  const boldCount = (text.match(/(\*\*|__)[^*_\n]+(\*\*|__)/g) || []).length;
  const blockquoteCount = lines.filter((line) => /^>\s?/.test(line)).length;

  const isSpecialBlock = (block) => (
    /^#{1,6}\s/.test(block)
    || /^>\s?/.test(block)
    || /^\s*(?:[-*+]|\d+[.)])\s+/.test(block)
    || /^!\[[^\]]*\]\([^)]*\)$/.test(block)
    || /^\{\{[<%]\s*figure\b/.test(block)
  );
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const paragraphs = blocks.filter((block) => !isSpecialBlock(block));
  const paragraphSentenceCounts = paragraphs
    .map((paragraph) => splitSentences(stripInline(paragraph)).length)
    .filter((count) => count > 0);

  const sentences = paragraphs
    .flatMap((paragraph) => splitSentences(stripInline(paragraph)))
    .filter(Boolean);
  const sentenceLengths = sentences.map((sentence) => words(sentence)).filter((length) => length > 0);
  const longSentenceCount = sentenceLengths.filter((length) => length >= LONG_SENTENCE).length;
  const shortSentenceCount = sentenceLengths.filter((length) => length <= 10).length;

  const bodyWords = words(stripInline(withoutImages(text)));
  const cleanTitle = String(title || '').trim();

  return {
    title: cleanTitle,
    titleLength: cleanTitle.length,
    titleWords: words(cleanTitle),
    wordCount: bodyWords,
    paragraphCount: paragraphs.length,
    paragraphSentenceCounts,
    maxParagraphSentences: paragraphSentenceCounts.length ? Math.max(...paragraphSentenceCounts) : 0,
    imageCount,
    headingCount,
    h2Count,
    h3Count,
    listItemCount,
    boldCount,
    blockquoteCount,
    sentenceCount: sentenceLengths.length,
    sentenceLengths,
    avgSentenceWords: round1(mean(sentenceLengths)),
    sentenceStdDev: round1(stdDev(sentenceLengths)),
    longSentenceCount,
    shortSentenceRatio: sentenceLengths.length ? round1(shortSentenceCount / sentenceLengths.length) : 0,
    longSentenceRatio: sentenceLengths.length ? round1(longSentenceCount / sentenceLengths.length) : 0,
  };
}

// ---------------------------------------------------------------------------
// Per-group scoring
// ---------------------------------------------------------------------------

function scoreVisual(stats) {
  let value = 5;
  const notes = [];
  const tips = [];

  if (stats.imageCount === 0) {
    value -= 2;
    notes.push('Chưa có ảnh minh hoạ nào.');
    tips.push('Thêm ít nhất 1 ảnh minh hoạ (nút 🖼️ trên thanh công cụ) để bài sinh động hơn.');
  } else if (stats.imageCount === 1) {
    value -= 0.5;
    notes.push('Mới có 1 ảnh minh hoạ.');
    tips.push('Thêm 1–2 ảnh nữa rải đều trong bài để dễ lướt.');
  } else {
    notes.push(`Có ${stats.imageCount} ảnh minh hoạ.`);
  }

  if (stats.maxParagraphSentences > PARAGRAPH_HARD_MAX) {
    value -= 1.5;
    notes.push(`Có đoạn dài tới ${stats.maxParagraphSentences} câu.`);
    tips.push('Chia nhỏ đoạn văn dài thành các đoạn 2–4 câu cho thoáng.');
  } else if (stats.maxParagraphSentences > PARAGRAPH_SOFT_MAX) {
    value -= 0.75;
    notes.push(`Đoạn dài nhất ${stats.maxParagraphSentences} câu.`);
    tips.push('Giữ mỗi đoạn khoảng 2–4 câu để bố cục dễ nhìn.');
  } else if (stats.paragraphCount) {
    notes.push(`Đoạn văn gọn (tối đa ${stats.maxParagraphSentences} câu).`);
  }

  if (stats.boldCount === 0) {
    value -= 1;
    notes.push('Chưa in đậm cụm từ khoá nào.');
    tips.push('In đậm 2–4 cụm từ khoá quan trọng để người đọc lướt nhanh.');
  } else if (stats.boldCount > 8) {
    value -= 0.75;
    notes.push('In đậm hơi nhiều.');
    tips.push('Giảm bớt chữ in đậm, chỉ giữ các cụm từ khoá chính.');
  } else {
    notes.push(`Đã in đậm ${stats.boldCount} cụm từ khoá.`);
  }

  return { value: round1(clamp(value, 0, 5)), notes, tips };
}

function scoreStructure(stats) {
  let value = 5;
  const notes = [];
  const tips = [];

  if (stats.headingCount === 0 && stats.wordCount >= 250) {
    value -= 2;
    notes.push('Bài dài nhưng thiếu tiêu đề phụ.');
    tips.push('Thêm 2–3 thẻ tiêu đề phụ (H2/H3) để chia bố cục.');
  } else if (stats.headingCount < 2 && stats.wordCount >= 150) {
    value -= 1;
    notes.push('Còn ít tiêu đề phụ.');
    tips.push('Bổ sung tiêu đề phụ H2/H3 để chia phần rõ ràng.');
  } else if (stats.headingCount >= 2) {
    notes.push(`Có ${stats.headingCount} tiêu đề phụ.`);
  }

  if (stats.listItemCount === 0 && stats.wordCount >= 150) {
    value -= 1;
    notes.push('Chưa có danh sách gạch đầu dòng.');
    tips.push('Thêm danh sách gạch đầu dòng cho các ý liệt kê.');
  } else if (stats.listItemCount) {
    notes.push(`Có ${stats.listItemCount} mục danh sách.`);
  }

  if (stats.longSentenceRatio > 0.25) {
    value -= 1;
    notes.push(`${stats.longSentenceCount} câu dài trên ${LONG_SENTENCE} từ.`);
    tips.push('Rút ngắn các câu dài, tách thành 2 câu ngắn hơn.');
  } else if (stats.longSentenceRatio > 0.1) {
    value -= 0.5;
    notes.push('Một vài câu khá dài.');
    tips.push('Cân nhắc rút gọn vài câu dài cho dễ đọc.');
  } else if (stats.sentenceCount) {
    notes.push('Câu văn có độ dài hợp lý.');
  }

  if (stats.wordCount < 150) {
    value -= 1;
    notes.push(`Bài hơi ngắn (${stats.wordCount} từ).`);
    tips.push('Bổ sung thêm nội dung (khoảng 150–300 từ) để bài đầy đủ hơn.');
  }

  return { value: round1(clamp(value, 0, 5)), notes, tips };
}

function scoreEngagement(stats) {
  let value = 5;
  const notes = [];
  const tips = [];

  if (!stats.titleLength) {
    value -= 1.5;
    notes.push('Chưa có tiêu đề.');
    tips.push('Đặt tiêu đề rõ ràng, gợi mở cho bài viết.');
  } else {
    if (stats.titleLength < 20) {
      value -= 0.5;
      notes.push('Tiêu đề hơi ngắn.');
      tips.push('Tiêu đề nên dài 30–70 ký tự và gợi tò mò.');
    } else if (stats.titleLength > 80) {
      value -= 0.5;
      notes.push('Tiêu đề hơi dài.');
      tips.push('Rút gọn tiêu đề còn khoảng 30–70 ký tự.');
    }
    const hook = /\d/.test(stats.title) || /[?:]/.test(stats.title);
    if (!hook) {
      value -= 0.5;
      notes.push('Tiêu đề chưa có “móc” gây chú ý.');
      tips.push('Thêm con số, câu hỏi hoặc lợi ích cụ thể vào tiêu đề.');
    } else {
      notes.push('Tiêu đề có điểm nhấn gây chú ý.');
    }
  }

  if (stats.sentenceCount >= 3) {
    if (stats.sentenceStdDev < 3) {
      value -= 1;
      notes.push('Câu văn khá đều, thiếu nhịp điệu.');
      tips.push('Trộn câu ngắn và câu dài để tạo nhịp điệu.');
    } else {
      notes.push('Nhịp câu đa dạng, dễ đọc.');
    }
    if (stats.shortSentenceRatio < 0.1) {
      value -= 0.5;
      notes.push('Thiếu câu ngắn để nhấn ý.');
      tips.push('Thêm vài câu ngắn để nhấn mạnh ý chính.');
    }
  }

  if (stats.wordCount < 150) {
    value -= 0.5;
    notes.push('Nội dung chưa đủ dài để tạo sức hút.');
    tips.push('Viết thêm để bài giàu thông tin và cuốn hút hơn.');
  }

  return { value: round1(clamp(value, 0, 5)), notes, tips };
}

function verdictFor(score) {
  if (score >= 4.5) return 'Xuất sắc — sẵn sàng xuất bản!';
  if (score >= 3.5) return 'Khá tốt, chỉnh vài điểm là đạt 5/5.';
  if (score >= 2.5) return 'Tạm ổn, cần cải thiện vài mục dưới đây.';
  return 'Cần bổ sung khá nhiều để đạt 5/5.';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scoreArticle({ title = '', markdown = '' } = {}) {
  const stats = analyzeArticle({ title, markdown });

  // Not enough to grade meaningfully.
  if (stats.wordCount < 30) {
    return {
      score: 0,
      verdict: 'Cần bổ sung khá nhiều để đạt 5/5.',
      categories: [
        { key: 'visual', label: 'Trình bày Visual', score: 0, notes: ['Chưa đủ nội dung để đánh giá.'] },
        { key: 'structure', label: 'Cấu trúc văn bản', score: 0, notes: ['Chưa đủ nội dung để đánh giá.'] },
        { key: 'engagement', label: 'Độ cuốn hút & Dễ đọc', score: 0, notes: ['Chưa đủ nội dung để đánh giá.'] },
      ],
      suggestions: ['Bài viết chưa có nội dung — hãy viết vài đoạn văn rồi chấm điểm lại.'],
      stats,
    };
  }

  const visual = scoreVisual(stats);
  const structure = scoreStructure(stats);
  const engagement = scoreEngagement(stats);

  const score = round1(clamp((visual.value + structure.value + engagement.value) / 3, 0, 5));
  const suggestions = [...visual.tips, ...structure.tips, ...engagement.tips];

  return {
    score,
    verdict: verdictFor(score),
    categories: [
      { key: 'visual', label: 'Trình bày Visual', score: visual.value, notes: visual.notes },
      { key: 'structure', label: 'Cấu trúc văn bản', score: structure.value, notes: structure.notes },
      { key: 'engagement', label: 'Độ cuốn hút & Dễ đọc', score: engagement.value, notes: engagement.notes },
    ],
    suggestions,
    stats,
  };
}
