// Giáo án tin học tiếng Hàn — dạy đánh máy Hangul (bộ gõ, phím, tốc độ WPM).
// Gồm metadata form, bàn phím 2-set (두벌식), bài luyện gõ và bộ sinh rule-based.

export const MODE = 'typing';

export const META = {
  emoji: '⌨️',
  label: 'Tin học tiếng Hàn',
  eyebrow: 'BLOGCO · SOẠN GIÁO ÁN · TIN HỌC TIẾNG HÀN',
  heading: 'Soạn giáo án tin học tiếng Hàn (đánh máy)',
  description: 'Soạn giáo án dạy cài bộ gõ, gõ Hangul và luyện tốc độ WPM, rồi xuất PDF dạng slide.',
  topicPlaceholder: 'Ví dụ: Đánh máy tiếng Hàn cơ bản — bộ gõ và phím',
  audiencePlaceholder: 'Ví dụ: Nhân viên văn phòng, người mới học tiếng Hàn',
  levels: ['Cơ bản', 'Trung bình', 'Nâng cao'],
  defaultLevel: 'Cơ bản',
  skills: ['Cài đặt bộ gõ', 'Gõ phụ âm', 'Gõ nguyên âm', 'Tốc độ WPM', 'Văn bản hành chính', 'Phím tắt'],
  defaultSkills: ['Cài đặt bộ gõ', 'Gõ phụ âm', 'Gõ nguyên âm'],
  defaultTopic: 'Đánh máy tiếng Hàn cơ bản — bộ gõ và phím',
  defaultAudience: 'Người mới bắt đầu, nhân viên văn phòng',
  defaultDuration: 90,
};

// 14 phụ âm cơ bản và 10 nguyên âm cơ bản, kèm phím tương ứng (bố cục 2-set).
export const CONSONANTS = [
  { key: 'q', hangul: 'ㅂ', romanization: 'b/p' },
  { key: 'w', hangul: 'ㅈ', romanization: 'j' },
  { key: 'e', hangul: 'ㄷ', romanization: 'd/t' },
  { key: 'r', hangul: 'ㄱ', romanization: 'g/k' },
  { key: 't', hangul: 'ㅅ', romanization: 's' },
  { key: 'a', hangul: 'ㅁ', romanization: 'm' },
  { key: 's', hangul: 'ㄴ', romanization: 'n' },
  { key: 'd', hangul: 'ㅇ', romanization: 'ng' },
  { key: 'f', hangul: 'ㄹ', romanization: 'r/l' },
  { key: 'g', hangul: 'ㅎ', romanization: 'h' },
  { key: 'z', hangul: 'ㅋ', romanization: 'k' },
  { key: 'x', hangul: 'ㅌ', romanization: 't' },
  { key: 'c', hangul: 'ㅊ', romanization: 'ch' },
  { key: 'v', hangul: 'ㅍ', romanization: 'p' },
];

export const VOWELS = [
  { key: 'k', hangul: 'ㅏ', romanization: 'a' },
  { key: 'o', hangul: 'ㅐ', romanization: 'ae' },
  { key: 'i', hangul: 'ㅑ', romanization: 'ya' },
  { key: 'j', hangul: 'ㅓ', romanization: 'eo' },
  { key: 'p', hangul: 'ㅔ', romanization: 'e' },
  { key: 'u', hangul: 'ㅕ', romanization: 'yeo' },
  { key: 'h', hangul: 'ㅗ', romanization: 'o' },
  { key: 'y', hangul: 'ㅛ', romanization: 'yo' },
  { key: 'n', hangul: 'ㅜ', romanization: 'u' },
  { key: 'b', hangul: 'ㅠ', romanization: 'yu' },
  { key: 'm', hangul: 'ㅡ', romanization: 'eu' },
  { key: 'l', hangul: 'ㅣ', romanization: 'i' },
];

// Bàn phím 2-set đầy đủ dùng cho sơ đồ minh hoạ.
export const KEYBOARD_ROWS = [
  [
    { key: 'q', hangul: 'ㅂ' }, { key: 'w', hangul: 'ㅈ' }, { key: 'e', hangul: 'ㄷ' },
    { key: 'r', hangul: 'ㄱ' }, { key: 't', hangul: 'ㅅ' }, { key: 'y', hangul: 'ㅛ' },
    { key: 'u', hangul: 'ㅕ' }, { key: 'i', hangul: 'ㅑ' }, { key: 'o', hangul: 'ㅐ' },
    { key: 'p', hangul: 'ㅔ' },
  ],
  [
    { key: 'a', hangul: 'ㅁ' }, { key: 's', hangul: 'ㄴ' }, { key: 'd', hangul: 'ㅇ' },
    { key: 'f', hangul: 'ㄹ' }, { key: 'g', hangul: 'ㅎ' }, { key: 'h', hangul: 'ㅗ' },
    { key: 'j', hangul: 'ㅓ' }, { key: 'k', hangul: 'ㅏ' }, { key: 'l', hangul: 'ㅣ' },
  ],
  [
    { key: 'z', hangul: 'ㅋ' }, { key: 'x', hangul: 'ㅌ' }, { key: 'c', hangul: 'ㅊ' },
    { key: 'v', hangul: 'ㅍ' }, { key: 'b', hangul: 'ㅠ' }, { key: 'n', hangul: 'ㅜ' },
    { key: 'm', hangul: 'ㅡ' },
  ],
];

export const TOOLS = [
  'Bộ gõ tiếng Hàn — Microsoft IME (Windows)',
  'Bộ gõ 2-Set Korean (macOS: System Settings ▸ Keyboard ▸ Input Sources)',
  'Hancom Typing (hwp.com)',
  '타자연습 Taja (taja.co.kr)',
  '10fastfingers.com — Korean typing test',
  'Hancom Office Hwp / MS Word (bàn phím tiếng Hàn)',
];

export const PRACTICE_TEXTS = [
  '안녕하세요. 저는 응우옌 반 아입니다.',
  '한국어를 배우고 있습니다.',
  '오늘은 날씨가 좋습니다.',
  '감사합니다. 좋은 하루 되세요.',
  '저는 하노이에서 왔습니다.',
  '한국 회사에서 일하고 싶습니다.',
];

const TIPS = [
  'Ngồi thẳng, hai tay đặt đúng hàng phím cơ sở (home row) trước khi gõ.',
  'Không nhìn bàn phím; nhìn văn bản để hình thành phản xạ.',
  'Gõ 받침 (patchim) bằng cách ghép phụ âm cuối với nguyên âm trước.',
  'Luyện 15 phút mỗi ngày đều đặn hiệu quả hơn luyện dài một buổi.',
  'Đo tốc độ (WPM) sau mỗi buổi để theo dõi tiến bộ.',
];

const PHRASES = {
  admin: [
    '경영지원팀 김민수입니다. 잘 부탁드립니다.',
    '회의는 오후 두 시에 시작합니다.',
    '보고서를 이메일로 보내 주세요.',
    '확인 후 회신 부탁드립니다.',
  ],
  email: [
    '안녕하세요, 담당자님.',
    '문의 사항이 있어 연락드립니다.',
    '검토 부탁드립니다. 감사합니다.',
    '좋은 하루 되세요.',
  ],
};

function detectFocus(topic = '') {
  const text = String(topic).toLowerCase();
  if (/hành chính|hanh chinh|văn bản|công văn|email|이메일|행정|보고서/.test(text)) return 'admin';
  if (/tốc độ|toc do|wpm|speed|luyện/.test(text)) return 'speed';
  return 'basic';
}

function buildTimeline(config, focus) {
  const total = Math.max(30, Number(config.duration) || 90);
  const blocks = [
    ['Giới thiệu & cài bộ gõ', 0.17, 'hướng dẫn cài Microsoft IME (Windows) / 2-Set Korean (macOS), kiểm tra gõ thử.'],
    ['Nguyên tắc ghép Hangul', 0.12, 'cấu tạo 자음 + 모음 + 받침 và quy tắc gõ liền mạch.'],
    ['Thực hành phụ âm cơ bản', 0.25, 'gõ 14 phụ âm (ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ) theo phím 2-set.'],
    ['Thực hành nguyên âm cơ bản', 0.22, 'gõ 10 nguyên âm (ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ) và ghép âm tiết.'],
    ['Bài tập tổng hợp & đo WPM', 0.19, focus === 'speed' ? 'luyện tốc độ theo mốc WPM, thi đua giữa các học viên.' : 'ghép câu hoàn chỉnh và đo tốc độ gõ (WPM).'],
    ['Tổng kết & giao bài', 0.05, 'nhắc lại phím khó, giao bài luyện ở nhà.'],
  ];
  let cursor = 0;
  return blocks.map(([name, ratio, note]) => {
    const start = Math.round(cursor);
    cursor += total * ratio;
    const end = Math.round(cursor);
    return { time: `${start}-${end} phút`, activity: `${name}: ${note}` };
  });
}

function wpmTargetFor(level) {
  if (level === 'Nâng cao') return 45;
  if (level === 'Trung bình') return 30;
  return 20;
}

export function buildLesson(config = {}) {
  const level = config.level || META.defaultLevel;
  const focus = detectFocus(config.topic);
  const wpmTarget = wpmTargetFor(level);
  const practiceTexts = focus === 'admin'
    ? [...PHRASES.admin, ...PHRASES.email, ...PRACTICE_TEXTS.slice(0, 2)]
    : PRACTICE_TEXTS;

  return {
    mode: MODE,
    language: config.language === 'en' ? 'en' : 'vi',
    topic: config.topic || META.defaultTopic,
    title: `${META.emoji} ${META.label} — ${config.topic || META.defaultTopic}`,
    subtitle: 'Bàn phím Hangul · Bộ gõ · Tốc độ WPM',
    level,
    audience: config.audience || META.defaultAudience,
    duration: Math.max(30, Number(config.duration) || META.defaultDuration),
    sessions: Math.max(1, Number(config.sessions) || 1),
    skills: config.skills && config.skills.length ? config.skills : META.defaultSkills,
    notes: config.notes || '',
    wpmTarget,
    objectives: [
      'Cài đặt được bộ gõ tiếng Hàn trên Windows (Microsoft IME) hoặc macOS (2-Set Korean).',
      'Gõ đúng 14 phụ âm cơ bản và 10 nguyên âm cơ bản theo bố cục 2-set.',
      'Ghép đúng âm tiết Hangul có 받침 (patchim) cơ bản.',
      `Đạt tốc độ tối thiểu ${wpmTarget} WPM ở trình độ ${level}.`,
      'Biết dùng phím tắt và gõ văn bản hành chính / email tiếng Hàn.',
    ],
    materials: [
      'Máy tính có bộ gõ tiếng Hàn và phần mềm luyện gõ.',
      'Máy chiếu trình bày sơ đồ bàn phím 2-set.',
      'Phiếu bài luyện gõ (phụ âm, nguyên âm, câu mẫu).',
      'Đồng hồ bấm giây / công cụ đo WPM trực tuyến.',
    ],
    tools: TOOLS,
    tips: TIPS,
    keyboardLayout: {
      image: '/images/lessons/hangul-keyboard.png',
      consonants: CONSONANTS,
      vowels: VOWELS,
      rows: KEYBOARD_ROWS,
    },
    timeline: buildTimeline(config, focus),
    practiceTexts,
    exercises: [
      'Gõ lặp lại 14 phụ âm cơ bản 5 lần mỗi phím, không nhìn bàn phím.',
      'Gõ lặp lại 10 nguyên âm cơ bản và ghép thành âm tiết đơn giản (가, 나, 다...).',
      'Gõ 5 câu luyện mẫu, chú ý 받침 ở cuối âm tiết.',
      `Đo tốc độ 1 phút và ghi lại kết quả WPM, so với mốc ${wpmTarget} WPM.`,
      'Gõ một đoạn email/văn bản hành chính ngắn 3-4 câu.',
    ],
    homework: [
      'Cài bộ gõ và luyện gõ 15 phút mỗi ngày.',
      'Gõ lại 5 câu luyện mẫu, ghi tốc độ WPM mỗi ngày.',
      `Đặt mục tiêu đạt ${wpmTarget} WPM trước buổi tiếp theo.`,
    ],
    assessment: `Đánh giá qua bài đo tốc độ WPM (mốc ${wpmTarget} WPM), độ chính xác khi gõ chính tả và khả năng gõ câu hoàn chỉnh.`,
    generatedBy: 'rule',
  };
}

export function buildPrompt(config = {}) {
  const wpmTarget = wpmTargetFor(config.level || META.defaultLevel);
  return `Bạn là giảng viên tin học chuyên dạy đánh máy tiếng Hàn cho người Việt.
Hãy soạn giáo án chi tiết cho:

Chủ đề: ${config.topic || META.defaultTopic}
Trình độ: ${config.level || META.defaultLevel}
Đối tượng: ${config.audience || META.defaultAudience}
Thời lượng: ${config.duration || META.defaultDuration} phút
Số buổi: ${config.sessions || 1}
Nội dung trọng tâm: ${(config.skills || META.defaultSkills).join(', ')}
Mục tiêu tốc độ: ${wpmTarget} WPM
Ghi chú: ${config.notes || 'Không có'}

Cấu trúc giáo án (JSON):
{
  "title": "...",
  "objectives": ["...", "..."],
  "materials": ["...", "..."],
  "timeline": [{ "time": "0-15 phút", "activity": "Giới thiệu bộ gõ, cài đặt IME" }],
  "keyboard_layout": {
    "consonants": [{ "key": "q", "hangul": "ㅂ", "romanization": "b/p" }],
    "vowels": [{ "key": "k", "hangul": "ㅏ", "romanization": "a" }]
  },
  "practice_texts": ["안녕하세요. 저는 응우옌 반 아입니다."],
  "tools": ["Hancom Typing (hwp.com)", "타자연습 Taja (taja.co.kr)", "10fastfingers.com Korean"],
  "exercises": ["...", "..."],
  "homework": ["...", "..."],
  "assessment": "..."
}

Trả về JSON thuần, không kèm markdown. Bao gồm đủ 14 phụ âm và 10 nguyên âm cơ bản để đủ 10-15 slide.`;
}

export function buildFallback(config = {}) {
  return buildLesson(config);
}
