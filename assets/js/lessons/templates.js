// Chuyển giáo án JSON → các slide HTML (mỗi slide = 1 trang PDF A4 landscape).
// Hàm thuần, không truy cập DOM nên có thể test bằng node.

import { KEYBOARD_ROWS } from './typing.js';

const MODES = {
  typing: { emoji: '⌨️', label: 'Tin học tiếng Hàn' },
};

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function chunk(items, size) {
  const list = asArray(items);
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function formatLessonDate(lesson = {}) {
  const date = lesson.date ? new Date(lesson.date) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

// Chuẩn hoá giáo án về dạng thống nhất (nhận cả snake_case từ AI lẫn camelCase).
export function normalizeLesson(raw = {}, config = {}) {
  const mode = raw.mode || config.mode || 'typing';
  const layout = raw.keyboardLayout || raw.keyboard_layout || null;
  const keyboardLayout = layout ? {
    image: layout.image || '/images/lessons/hangul-keyboard.png',
    consonants: asArray(layout.consonants),
    vowels: asArray(layout.vowels),
    rows: asArray(layout.rows).length ? layout.rows : KEYBOARD_ROWS,
  } : null;

  return {
    mode,
    language: raw.language || config.language || 'vi',
    topic: raw.topic || config.topic || '',
    title: raw.title || config.topic || MODES[mode]?.label || 'Giáo án',
    subtitle: raw.subtitle || '',
    level: raw.level || config.level || '',
    audience: raw.audience || config.audience || '',
    duration: Number(raw.duration || config.duration) || 90,
    sessions: Number(raw.sessions || config.sessions) || 1,
    skills: asArray(raw.skills).length ? raw.skills : asArray(config.skills),
    notes: raw.notes || config.notes || '',
    date: raw.date || new Date().toISOString().slice(0, 10),
    wpmTarget: raw.wpmTarget || raw.wpm_target || 0,
    objectives: asArray(raw.objectives),
    materials: asArray(raw.materials),
    timeline: asArray(raw.timeline),
    vocabulary: asArray(raw.vocabulary).map((item) => ({
      korean: item.korean || '',
      romanization: item.romanization || item.romanisation || '',
      meaning: item.meaning || item.vietnamese || item.english || '',
      example: item.example || '',
    })),
    grammar: asArray(raw.grammar).map((item) => ({
      point: item.point || '',
      explanation: item.explanation || '',
      examples: asArray(item.examples),
    })),
    dialogue: asArray(raw.dialogue).map((item) => ({
      speaker: item.speaker || '',
      korean: item.korean || '',
      meaning: item.meaning || item.vietnamese || item.english || '',
    })),
    exercises: asArray(raw.exercises),
    homework: asArray(raw.homework),
    assessment: raw.assessment || '',
    tools: asArray(raw.tools),
    tips: asArray(raw.tips),
    practiceTexts: asArray(raw.practiceTexts || raw.practice_texts),
    keyboardLayout,
    generatedBy: raw.generatedBy || 'ai',
  };
}

function meta(lesson) {
  const mode = MODES[lesson.mode] || MODES.typing;
  return { ...mode, date: formatLessonDate(lesson) };
}

function slideHeader({ brand, right }) {
  return `<header class="pdf-slide__header"><span class="pdf-slide__brand">${brand}</span><span class="pdf-slide__header-meta">${right}</span></header>`;
}

function slideFooter(lesson, page, total) {
  const m = meta(lesson);
  return `<footer class="pdf-slide__footer"><span>BlogCo · Giáo án ${escapeHtml(m.label)}</span><span>${escapeHtml(m.date)} · Trang ${page}/${total}</span></footer>`;
}

export function lessonToSlides(input = {}, config = {}) {
  const lesson = normalizeLesson(input, config);
  const m = meta(lesson);
  const brand = `${m.emoji} ${escapeHtml(m.label)}`;
  const topic = escapeHtml(lesson.topic || lesson.title);
  const slides = [];

  const push = (variant, title, body, headerRight) => slides.push({ variant, title, body, headerRight });

  // 1. Cover
  push('cover', lesson.title,
    `<div class="pdf-cover__emoji">${m.emoji}</div>
     <div class="pdf-slide__title">${escapeHtml(lesson.title)}</div>
     <div class="pdf-slide__subtitle">${escapeHtml(lesson.subtitle || topic)}</div>
     <div class="pdf-cover__meta">
       <span>🎯 Trình độ: ${escapeHtml(lesson.level)}</span>
       <span>⏱ ${escapeHtml(String(lesson.duration))} phút</span>
       <span>📅 ${escapeHtml(String(lesson.sessions))} buổi</span>
       ${lesson.wpmTarget ? `<span>⌨️ Mục tiêu ${escapeHtml(String(lesson.wpmTarget))} WPM</span>` : ''}
       <span>👥 ${escapeHtml(lesson.audience)}</span>
     </div>`,
    lesson.generatedBy === 'rule' ? 'Mẫu có sẵn' : 'AI soạn');

  // 2. Objectives
  push('default', 'Mục tiêu bài học',
    `<div class="pdf-slide__lead">Sau buổi học, học viên có thể:</div>
     <ul class="pdf-checklist">${lesson.objectives.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
     ${lesson.notes ? `<div class="pdf-note"><strong>Ghi chú lớp học:</strong> ${escapeHtml(lesson.notes)}</div>` : ''}`,
    'Mục tiêu');

  // 3. Materials
  push('default', 'Học liệu & chuẩn bị',
    `<div class="pdf-columns">
       <div class="pdf-panel pdf-panel--accent">
         <span class="pdf-panel__label">Giáo viên chuẩn bị</span>
         <ul class="pdf-bullets">${lesson.materials.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
       </div>
       <div class="pdf-panel">
         <span class="pdf-panel__label">Kỹ năng trọng tâm</span>
         <ul class="pdf-chips">${lesson.skills.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
       </div>
     </div>`,
    'Học liệu');

  // Typing: tools
  if (lesson.mode === 'typing' && lesson.tools.length) {
    push('default', 'Phần mềm & công cụ',
      `<ul class="pdf-chips">${lesson.tools.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
       <div class="pdf-note">Cài bộ gõ trước khi vào bài: Windows dùng Microsoft IME, macOS dùng 2-Set Korean. Kiểm tra bằng cách gõ thử “안녕하세요”.</div>`,
      'Công cụ');
  }

  // Typing: keyboard diagram
  if (lesson.mode === 'typing' && lesson.keyboardLayout) {
    const rows = lesson.keyboardLayout.rows.length ? lesson.keyboardLayout.rows : KEYBOARD_ROWS;
    push('default', 'Sơ đồ bàn phím 2-set (두벌식)',
      `<div class="pdf-keyboard">${rows.map((row) => `<div class="pdf-keyboard__row">${row.map((cap) => `<span class="pdf-keycap"><span class="pdf-keycap__hangul">${escapeHtml(cap.hangul)}</span><span class="pdf-keycap__key">${escapeHtml(cap.key)}</span></span>`).join('')}</div>`).join('')}</div>
       <div class="pdf-keyboard__legend">Phím trên cùng hiển thị ký tự Hangul; chữ nhỏ bên dưới là phím tương ứng trên bàn phím QWERTY.</div>`,
      'Bàn phím');
  }

  // 4. Timeline
  if (lesson.timeline.length) {
    push('default', 'Tiến trình buổi học',
      `<table class="pdf-timeline-table">
         <thead><tr><th>Thời gian</th><th>Hoạt động</th></tr></thead>
         <tbody>${lesson.timeline.map((row) => `<tr><td>${escapeHtml(row.time)}</td><td>${escapeHtml(row.activity)}</td></tr>`).join('')}</tbody>
       </table>`,
      'Tiến trình');
  }

  // Typing: consonants / vowels tables
  if (lesson.mode === 'typing' && lesson.keyboardLayout) {
    const tableRows = (items) => items.map((item) => `<tr><td class="pdf-roman">${escapeHtml(item.key)}</td><td class="pdf-korean">${escapeHtml(item.hangul)}</td><td>${escapeHtml(item.romanization)}</td></tr>`).join('');
    if (lesson.keyboardLayout.consonants.length) {
      push('default', '14 phụ âm cơ bản (자음)',
        `<table class="pdf-vocab-table"><thead><tr><th>Phím</th><th>Hangul</th><th>Phiên âm</th></tr></thead><tbody>${tableRows(lesson.keyboardLayout.consonants)}</tbody></table>`,
        'Phụ âm');
    }
    if (lesson.keyboardLayout.vowels.length) {
      push('default', '10 nguyên âm cơ bản (모음)',
        `<table class="pdf-vocab-table"><thead><tr><th>Phím</th><th>Hangul</th><th>Phiên âm</th></tr></thead><tbody>${tableRows(lesson.keyboardLayout.vowels)}</tbody></table>`,
        'Nguyên âm');
    }
  }

  // Vocabulary (chunked)
  if (lesson.vocabulary.length) {
    const perSlide = lesson.mode === 'typing' ? 8 : 8;
    const groups = chunk(lesson.vocabulary, perSlide);
    groups.forEach((group, index) => {
      const heading = groups.length > 1 ? `Từ vựng (${index + 1}/${groups.length})` : 'Từ vựng';
      push('default', heading,
        `<table class="pdf-vocab-table">
           <thead><tr><th>Tiếng Hàn</th><th>Phiên âm</th><th>Nghĩa</th><th>Ví dụ</th></tr></thead>
           <tbody>${group.map((item) => `<tr>
             <td class="pdf-korean">${escapeHtml(item.korean)}</td>
             <td class="pdf-roman">${escapeHtml(item.romanization)}</td>
             <td>${escapeHtml(item.meaning)}</td>
             <td class="pdf-example">${escapeHtml(item.example)}</td>
           </tr>`).join('')}</tbody>
         </table>`,
        `Từ vựng ${index + 1}/${groups.length}`);
    });
  }

  // Grammar
  if (lesson.grammar.length) {
    push('default', 'Ngữ pháp trọng tâm',
      lesson.grammar.map((item) => `<div class="pdf-grammar-card">
         <div class="pdf-grammar-card__point">${escapeHtml(item.point)}</div>
         <p>${escapeHtml(item.explanation)}</p>
         ${item.examples.length ? `<ul>${item.examples.map((ex) => `<li>${escapeHtml(ex)}</li>`).join('')}</ul>` : ''}
       </div>`).join(''),
      'Ngữ pháp');
  }

  // Dialogue
  if (lesson.dialogue.length) {
    push('default', 'Hội thoại mẫu',
      `<ul class="pdf-dialogue">${lesson.dialogue.map((line) => `<li>
         <span class="pdf-dialogue__who">${escapeHtml(line.speaker)}</span>
         <span><span class="pdf-dialogue__korean">${escapeHtml(line.korean)}</span><span class="pdf-dialogue__viet">${escapeHtml(line.meaning)}</span></span>
       </li>`).join('')}</ul>`,
      'Hội thoại');
  }

  // Typing: practice texts
  if (lesson.mode === 'typing' && lesson.practiceTexts.length) {
    push('default', 'Câu luyện gõ',
      `<ul class="pdf-bullets">${lesson.practiceTexts.map((text) => `<li><span class="pdf-korean" style="font-size:19px;">${escapeHtml(text)}</span></li>`).join('')}</ul>
       ${lesson.tips.length ? `<div class="pdf-note"><strong>Mẹo luyện gõ:</strong> ${escapeHtml(lesson.tips[0])}</div>` : ''}`,
      'Luyện gõ');
  }

  // Exercises
  if (lesson.exercises.length) {
    push('default', 'Bài tập trên lớp',
      `<ul class="pdf-checklist">${lesson.exercises.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
      'Bài tập');
  }

  // Homework + assessment
  const homeworkBody = [
    lesson.homework.length ? `<div class="pdf-slide__heading">Bài tập về nhà</div><ul class="pdf-bullets">${lesson.homework.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '',
    lesson.assessment ? `<div class="pdf-note"><strong>Đánh giá:</strong> ${escapeHtml(lesson.assessment)}</div>` : '',
  ].join('');
  if (homeworkBody) push('default', 'Về nhà & đánh giá', homeworkBody, 'Về nhà');

  // Closing
  push('closing', '감사합니다!',
    `<div class="pdf-slide__title">감사합니다!</div>
     <div class="pdf-slide__subtitle">Cảm ơn — hẹn gặp lại ở buổi học tiếp theo</div>
     <p class="pdf-slide__lead">${escapeHtml(lesson.title)} · Trình độ ${escapeHtml(lesson.level)} · ${escapeHtml(String(lesson.duration))} phút</p>`,
    'Kết thúc');

  const total = slides.length;
  return slides.map((slide, index) => {
    const heading = slide.variant === 'default'
      ? `<div class="pdf-slide__heading">${escapeHtml(slide.title)}</div>`
      : '';
    return {
      variant: slide.variant,
      title: slide.title,
      headerRight: slide.headerRight,
      html: `<section class="pdf-slide pdf-slide--${slide.variant}" data-slide="${index + 1}">
      ${slideHeader({ brand, right: `${escapeHtml(slide.headerRight || '')} · Slide ${index + 1}` })}
      <div class="pdf-slide__body">${heading}${slide.body}</div>
      ${slideFooter(lesson, index + 1, total)}
    </section>`,
    };
  });
}

export function renderSlidesHtml(input = {}, config = {}) {
  return lessonToSlides(input, config).map((slide) => slide.html).join('\n');
}

export { chunk };
