// Giáo án tiếng Hàn cơ bản — metadata form, ngân hàng nội dung theo chủ đề,
// và bộ sinh giáo án rule-based (fallback khi không gọi được AI).

export const MODE = 'korean';

export const META = {
  emoji: '🇰🇷',
  label: 'Tiếng Hàn cơ bản',
  eyebrow: 'BLOGCO · SOẠN GIÁO ÁN · TIẾNG HÀN',
  heading: 'Soạn giáo án tiếng Hàn cơ bản',
  description: 'Nhập thông tin lớp học, để AI soạn giáo án từ vựng – ngữ pháp – hội thoại, rồi xuất PDF dạng slide.',
  topicPlaceholder: 'Ví dụ: Chào hỏi và giới thiệu bản thân',
  audiencePlaceholder: 'Ví dụ: Người mới bắt đầu, 18-30 tuổi',
  levels: ['Sơ cấp 1', 'Sơ cấp 2', 'Trung cấp'],
  defaultLevel: 'Sơ cấp 2',
  skills: ['Nghe', 'Nói', 'Đọc', 'Viết'],
  defaultSkills: ['Nghe', 'Nói'],
  defaultTopic: 'Chào hỏi và giới thiệu bản thân',
  defaultAudience: 'Người mới bắt đầu, 18-30 tuổi',
  defaultDuration: 90,
};

const PACKS = {
  greeting: {
    label: 'Chào hỏi & giới thiệu',
    vocabulary: [
      { korean: '안녕하세요', romanization: 'annyeonghaseyo', vietnamese: 'Xin chào', english: 'Hello', example: '안녕하세요, 선생님.' },
      { korean: '안녕히 계세요', romanization: 'annyeonghi gyeseyo', vietnamese: 'Tạm biệt (người ở lại)', english: 'Goodbye (to one staying)', example: '먼저 가겠습니다. 안녕히 계세요.' },
      { korean: '안녕히 가세요', romanization: 'annyeonghi gaseyo', vietnamese: 'Tạm biệt (người đi)', english: 'Goodbye (to one leaving)', example: '안녕히 가세요. 내일 봐요.' },
      { korean: '감사합니다', romanization: 'gamsahamnida', vietnamese: 'Cảm ơn', english: 'Thank you', example: '도와주셔서 감사합니다.' },
      { korean: '죄송합니다', romanization: 'joesonghamnida', vietnamese: 'Xin lỗi', english: 'I am sorry', example: '늦어서 죄송합니다.' },
      { korean: '네 / 아니요', romanization: 'ne / aniyo', vietnamese: 'Vâng / Không', english: 'Yes / No', example: '네, 맞아요. 아니요, 괜찮아요.' },
      { korean: '이름', romanization: 'ireum', vietnamese: 'Tên', english: 'Name', example: '제 이름은 민수입니다.' },
      { korean: '나이', romanization: 'nai', vietnamese: 'Tuổi', english: 'Age', example: '나이가 어떻게 되세요?' },
      { korean: '고향', romanization: 'gohyang', vietnamese: 'Quê quán', english: 'Hometown', example: '제 고향은 하노이입니다.' },
      { korean: '직업', romanization: 'jigeop', vietnamese: 'Nghề nghiệp', english: 'Occupation', example: '직업이 뭐예요?' },
      { korean: '학생', romanization: 'haksaeng', vietnamese: 'Học sinh, sinh viên', english: 'Student', example: '저는 학생입니다.' },
      { korean: '만나서 반갑습니다', romanization: 'mannaseo bangapseumnida', vietnamese: 'Rất vui được gặp', english: 'Nice to meet you', example: '만나서 반갑습니다, 김 선생님.' },
    ],
    grammar: [
      { point: 'N + 입니다 / N + 이에요·예요', explanation: 'Mẫu câu “là N”. 입니다 trang trọng; 이에요/예요 thân mật (có 받침 dùng 이에요, không 받침 dùng 예요).', examples: ['저는 학생입니다.', '저는 응우옌이에요.', '제 고향은 하노이예요.'] },
      { point: 'N + 은/는 (trợ từ chủ đề)', explanation: 'Đánh dấu chủ đề của câu. Có 받침 dùng 은, không 받침 dùng 는.', examples: ['저는 베트남 사람입니다.', '이름은 민수예요.'] },
      { point: 'N + 이/가 (trợ từ chủ ngữ)', explanation: 'Đánh dấu chủ ngữ, thường dùng trong câu hỏi và câu nhấn mạnh.', examples: ['이름이 뭐예요?', '직업이 뭐예요?'] },
    ],
    dialogue: [
      { speaker: 'A', korean: '안녕하세요. 저는 응우옌입니다.', vietnamese: 'Xin chào. Tôi là Nguyễn.' },
      { speaker: 'B', korean: '안녕하세요. 만나서 반갑습니다. 저는 김민수입니다.', vietnamese: 'Xin chào. Rất vui được gặp. Tôi là Kim Minsu.' },
      { speaker: 'A', korean: '어느 나라 사람이에요?', vietnamese: 'Bạn là người nước nào?' },
      { speaker: 'B', korean: '베트남 사람입니다. 하노이에서 왔어요.', vietnamese: 'Tôi là người Việt Nam. Tôi đến từ Hà Nội.' },
      { speaker: 'A', korean: '직업이 뭐예요?', vietnamese: 'Nghề của bạn là gì?' },
      { speaker: 'B', korean: '저는 학생이에요. 한국어를 배우고 있습니다.', vietnamese: 'Tôi là sinh viên. Tôi đang học tiếng Hàn.' },
    ],
    exercises: [
      'Nghe – nhắc lại 12 từ vựng, chú ý âm cuối và ngữ điệu câu chào.',
      'Điền trợ từ 은/는 hoặc 이/가 vào 5 câu cho sẵn.',
      'Đóng vai theo mẫu hội thoại: tự giới thiệu tên, quốc tịch, nghề nghiệp.',
      'Viết 5 câu tự giới thiệu (tên, tuổi, quê quán, nghề nghiệp, sở thích).',
    ],
    homework: [
      'Học thuộc 12 từ vựng, viết mỗi từ 3 lần kèm phiên âm.',
      'Ghi âm 30 giây tự giới thiệu bản thân bằng tiếng Hàn.',
      'Chuẩn bị 3 câu hỏi để hỏi bạn cùng lớp ở buổi sau.',
    ],
  },
  food: {
    label: 'Ăn uống & gọi món',
    vocabulary: [
      { korean: '음식', romanization: 'eumsik', vietnamese: 'Món ăn, thức ăn', english: 'Food', example: '한국 음식을 좋아해요.' },
      { korean: '밥', romanization: 'bap', vietnamese: 'Cơm', english: 'Rice, meal', example: '밥을 먹었어요.' },
      { korean: '물', romanization: 'mul', vietnamese: 'Nước', english: 'Water', example: '물 주세요.' },
      { korean: '김치', romanization: 'gimchi', vietnamese: 'Kim chi', english: 'Kimchi', example: '김치가 매워요.' },
      { korean: '불고기', romanization: 'bulgogi', vietnamese: 'Thịt nướng', english: 'Bulgogi', example: '불고기 두 인분 주세요.' },
      { korean: '메뉴', romanization: 'menyu', vietnamese: 'Thực đơn', english: 'Menu', example: '메뉴 주세요.' },
      { korean: '주문하다', romanization: 'jumunhada', vietnamese: 'Gọi món, đặt hàng', english: 'To order', example: '주문하시겠어요?' },
      { korean: '맛있다', romanization: 'masitda', vietnamese: 'Ngon', english: 'Delicious', example: '정말 맛있어요!' },
      { korean: '매운', romanization: 'maeun', vietnamese: 'Cay', english: 'Spicy', example: '매운 음식을 못 먹어요.' },
      { korean: '계산서', romanization: 'gyesanseo', vietnamese: 'Hoá đơn', english: 'Bill', example: '계산서 주세요.' },
      { korean: '식당', romanization: 'sikdang', vietnamese: 'Nhà hàng, quán ăn', english: 'Restaurant', example: '근처에 식당이 있어요?' },
      { korean: '맛집', romanization: 'matjip', vietnamese: 'Quán ăn ngon', english: 'Famous eatery', example: '여기가 유명한 맛집이에요.' },
    ],
    grammar: [
      { point: 'N + 을/를 + V', explanation: 'Trợ từ tân ngữ: có 받침 dùng 을, không 받침 dùng 를.', examples: ['밥을 먹어요.', '물을 마셔요.', '김치를 좋아해요.'] },
      { point: 'V + -고 싶어요', explanation: 'Diễn tả mong muốn “muốn làm gì”.', examples: ['불고기를 먹고 싶어요.', '한국에 가고 싶어요.'] },
      { point: 'V + -주세요', explanation: 'Yêu cầu lịch sự “xin hãy…”.', examples: ['물 주세요.', '메뉴 주세요.', '천천히 말해 주세요.'] },
    ],
    dialogue: [
      { speaker: 'A', korean: '어서 오세요. 주문하시겠어요?', vietnamese: 'Chào mừng quý khách. Quý khách muốn gọi món chưa?' },
      { speaker: 'B', korean: '네, 메뉴 주세요.', vietnamese: 'Vâng, cho tôi xin thực đơn.' },
      { speaker: 'A', korean: '여기 있습니다. 뭐 드시겠어요?', vietnamese: 'Đây ạ. Quý khách dùng gì?' },
      { speaker: 'B', korean: '불고기 두 인분 주세요.', vietnamese: 'Cho tôi hai phần thịt nướng.' },
      { speaker: 'A', korean: '매운 거 괜찮으세요?', vietnamese: 'Anh/chị có ăn cay được không?' },
      { speaker: 'B', korean: '네, 괜찮아요. 그리고 물 주세요.', vietnamese: 'Vâng, được. Và cho tôi thêm nước.' },
    ],
    exercises: [
      'Ghép 12 từ vựng với hình minh hoạ tương ứng.',
      'Đặt 5 câu dùng mẫu -고 싶어요 về món ăn yêu thích.',
      'Đóng vai gọi món tại nhà hàng theo mẫu hội thoại.',
      'Viết thực đơn mini bằng tiếng Hàn cho một bữa ăn.',
    ],
    homework: [
      'Học thuộc 12 từ vựng chủ đề ăn uống.',
      'Viết 3 câu dùng -주세요 khi gọi món.',
      'Tìm 5 món ăn Hàn Quốc và viết tên tiếng Hàn.',
    ],
  },
  travel: {
    label: 'Du lịch & chỉ đường',
    vocabulary: [
      { korean: '여행', romanization: 'yeohaeng', vietnamese: 'Du lịch', english: 'Travel', example: '한국으로 여행을 가요.' },
      { korean: '공항', romanization: 'gonghang', vietnamese: 'Sân bay', english: 'Airport', example: '공항이 어디예요?' },
      { korean: '지하철', romanization: 'jihacheol', vietnamese: 'Tàu điện ngầm', english: 'Subway', example: '지하철로 가요.' },
      { korean: '버스', romanization: 'beoseu', vietnamese: 'Xe buýt', english: 'Bus', example: '버스를 타세요.' },
      { korean: '표', romanization: 'pyo', vietnamese: 'Vé', english: 'Ticket', example: '표를 사고 싶어요.' },
      { korean: '호텔', romanization: 'hotel', vietnamese: 'Khách sạn', english: 'Hotel', example: '호텔을 예약했어요.' },
      { korean: '오른쪽 / 왼쪽', romanization: 'oreunjjok / oenjjok', vietnamese: 'Bên phải / bên trái', english: 'Right / Left', example: '오른쪽으로 가세요.' },
      { korean: '똑바로', romanization: 'ttokbaro', vietnamese: 'Thẳng', english: 'Straight', example: '똑바로 가세요.' },
      { korean: '가깝다 / 멀다', romanization: 'gakkapda / meolda', vietnamese: 'Gần / xa', english: 'Near / Far', example: '여기서 가까워요?' },
      { korean: '얼마예요?', romanization: 'eolmayeyo?', vietnamese: 'Bao nhiêu tiền?', english: 'How much?', example: '이 표는 얼마예요?' },
      { korean: '길', romanization: 'gil', vietnamese: 'Đường, lối đi', english: 'Road, way', example: '길을 잃었어요.' },
      { korean: '도와주세요', romanization: 'dowajuseyo', vietnamese: 'Xin giúp đỡ', english: 'Please help me', example: '죄송하지만 도와주세요.' },
    ],
    grammar: [
      { point: 'N + 에 / 에서', explanation: '에 chỉ đích đến hoặc vị trí; 에서 chỉ nơi hành động diễn ra / xuất phát.', examples: ['공항에 가요.', '하노이에서 왔어요.'] },
      { point: 'N + (으)로', explanation: 'Chỉ phương tiện hoặc hướng di chuyển.', examples: ['지하철로 가요.', '오른쪽으로 가세요.'] },
      { point: 'V + -고 싶어요', explanation: 'Diễn tả mong muốn.', examples: ['표를 사고 싶어요.', '호텔에 가고 싶어요.'] },
    ],
    dialogue: [
      { speaker: 'A', korean: '실례합니다. 공항에 어떻게 가요?', vietnamese: 'Xin lỗi. Tôi đi sân bay bằng cách nào?' },
      { speaker: 'B', korean: '지하철로 가세요. 여기서 가까워요.', vietnamese: 'Hãy đi tàu điện ngầm. Ở đây gần thôi.' },
      { speaker: 'A', korean: '표는 얼마예요?', vietnamese: 'Vé bao nhiêu tiền?' },
      { speaker: 'B', korean: '사천 원이에요.', vietnamese: '4.000 won.' },
      { speaker: 'A', korean: '어디에서 내려요?', vietnamese: 'Tôi xuống ở đâu?' },
      { speaker: 'B', korean: '두 정거장 후에 내리세요.', vietnamese: 'Hãy xuống sau hai trạm.' },
    ],
    exercises: [
      'Đọc bản đồ mini và viết 4 câu chỉ đường bằng tiếng Hàn.',
      'Điền trợ từ 에/에서 vào 5 câu.',
      'Đóng vai hỏi đường và mua vé theo mẫu hội thoại.',
      'Nghe số tiền và viết lại bằng chữ Hàn.',
    ],
    homework: [
      'Học thuộc 12 từ vựng chủ đề du lịch.',
      'Viết 3 câu dùng (으)로 để chỉ phương tiện.',
      'Chuẩn bị một đoạn hội thoại hỏi đường 6 câu.',
    ],
  },
  default: {
    label: 'Tiếng Hàn tổng hợp',
    vocabulary: [
      { korean: '안녕하세요', romanization: 'annyeonghaseyo', vietnamese: 'Xin chào', english: 'Hello', example: '안녕하세요, 반갑습니다.' },
      { korean: '감사합니다', romanization: 'gamsahamnida', vietnamese: 'Cảm ơn', english: 'Thank you', example: '도와주셔서 감사합니다.' },
      { korean: '네 / 아니요', romanization: 'ne / aniyo', vietnamese: 'Vâng / Không', english: 'Yes / No', example: '네, 알겠습니다.' },
      { korean: '친구', romanization: 'chingu', vietnamese: 'Bạn bè', english: 'Friend', example: '친구를 만나요.' },
      { korean: '학교', romanization: 'hakgyo', vietnamese: 'Trường học', english: 'School', example: '학교에 가요.' },
      { korean: '회사', romanization: 'hoesa', vietnamese: 'Công ty', english: 'Company', example: '회사에서 일해요.' },
      { korean: '오늘', romanization: 'oneul', vietnamese: 'Hôm nay', english: 'Today', example: '오늘은 날씨가 좋습니다.' },
      { korean: '내일', romanization: 'naeil', vietnamese: 'Ngày mai', english: 'Tomorrow', example: '내일 만나요.' },
      { korean: '좋다', romanization: 'jota', vietnamese: 'Tốt, thích', english: 'Good', example: '한국어가 좋아요.' },
      { korean: '배우다', romanization: 'baeuda', vietnamese: 'Học', english: 'To learn', example: '한국어를 배우고 있습니다.' },
      { korean: '이름', romanization: 'ireum', vietnamese: 'Tên', english: 'Name', example: '제 이름은 민수입니다.' },
      { korean: '만나서 반갑습니다', romanization: 'mannaseo bangapseumnida', vietnamese: 'Rất vui được gặp', english: 'Nice to meet you', example: '만나서 반갑습니다.' },
    ],
    grammar: [
      { point: 'N + 은/는 / 이/가', explanation: 'Trợ từ chủ đề và chủ ngữ, chọn theo 받침 của danh từ.', examples: ['저는 학생입니다.', '이름이 뭐예요?'] },
      { point: 'V + -습니다 / -아요·어요', explanation: 'Hai sắc thái: trang trọng (합니다체) và thân mật lịch sự (해요체).', examples: ['한국어를 배웁니다.', '한국어를 배워요.'] },
      { point: 'V + -고 있습니다', explanation: 'Diễn tả hành động đang diễn ra.', examples: ['한국어를 배우고 있습니다.', '친구를 기다리고 있어요.'] },
    ],
    dialogue: [
      { speaker: 'A', korean: '안녕하세요. 요즘 뭐 하세요?', vietnamese: 'Xin chào. Dạo này bạn làm gì?' },
      { speaker: 'B', korean: '한국어를 배우고 있어요.', vietnamese: 'Tôi đang học tiếng Hàn.' },
      { speaker: 'A', korean: '어디에서 배워요?', vietnamese: 'Bạn học ở đâu?' },
      { speaker: 'B', korean: '학교에서 배워요. 친구들도 같이 공부해요.', vietnamese: 'Tôi học ở trường. Bạn bè cùng học với tôi.' },
      { speaker: 'A', korean: '한국어가 재미있어요?', vietnamese: 'Tiếng Hàn có thú vị không?' },
      { speaker: 'B', korean: '네, 아주 재미있어요. 그리고 어려워요.', vietnamese: 'Vâng, rất thú vị. Và cũng khó nữa.' },
    ],
    exercises: [
      'Nghe – nhắc lại 12 từ vựng, luyện phát âm đúng.',
      'Đặt 5 câu với trợ từ 은/는 và 이/가.',
      'Đóng vai hội thoại hỏi thăm hoạt động hằng ngày.',
      'Viết đoạn 5 câu giới thiệu việc học tiếng Hàn của bạn.',
    ],
    homework: [
      'Học thuộc 12 từ vựng và viết mỗi từ 3 lần.',
      'Viết 5 câu dùng -고 있습니다.',
      'Ghi âm đoạn hội thoại ngắn 6 câu với bạn cùng lớp.',
    ],
  },
};

const TOPIC_KEYS = [
  { key: 'greeting', words: ['chào', 'chao', 'giới thiệu', 'gioi thieu', '안녕', '자기소개', 'hello', 'introduce', 'bản thân', 'ban than'] },
  { key: 'food', words: ['ăn', 'an uong', 'uống', 'đồ ăn', 'nhà hàng', '음식', '먹', 'food', 'restaurant', 'ẩm thực', 'am thuc'] },
  { key: 'travel', words: ['du lịch', 'du lich', 'đi lại', 'chỉ đường', '여행', 'travel', 'direction', 'giao thông', 'sân bay'] },
];

export function detectPack(topic = '') {
  const text = String(topic).toLowerCase();
  for (const entry of TOPIC_KEYS) {
    if (entry.words.some((word) => text.includes(word))) return entry.key;
  }
  return 'default';
}

function levelDepth(level) {
  if (level === 'Sơ cấp 1') return { vocab: 10, grammar: 3, perSlide: 8 };
  if (level === 'Trung cấp') return { vocab: 14, grammar: 4, perSlide: 8 };
  return { vocab: 12, grammar: 3, perSlide: 8 };
}

function buildTimeline(config, pack) {
  const total = Math.max(30, Number(config.duration) || 90);
  const skills = (config.skills || []).join(', ') || 'Nghe, Nói';
  const blocks = [
    ['Khởi động (Warm-up)', 0.10, `chào hỏi, giới thiệu chủ đề “${config.topic}”, tạo không khí lớp học.`],
    ['Ôn tập đầu giờ', 0.10, 'kiểm tra từ vựng bài trước, sửa lỗi phát âm nhanh.'],
    ['Từ vựng mới', 0.25, `giới thiệu bộ từ vựng chủ đề “${pack.label}”, luyện đọc và phiên âm.`],
    ['Ngữ pháp trọng tâm', 0.20, `phân tích ${pack.grammar.length} điểm ngữ pháp, lấy ví dụ và đặt câu.`],
    ['Luyện hội thoại', 0.20, `đóng vai theo mẫu hội thoại, tập trung kỹ năng: ${skills}.`],
    ['Thực hành & sửa lỗi', 0.10, 'làm bài tập tại lớp, giáo viên sửa và nhận xét.'],
    ['Tổng kết & giao bài', 0.05, 'nhắc lại trọng tâm, giao bài tập về nhà.'],
  ];
  let cursor = 0;
  return blocks.map(([name, ratio, note]) => {
    const start = Math.round(cursor);
    cursor += total * ratio;
    const end = Math.round(cursor);
    return { time: `${start}-${end} phút`, activity: `${name}: ${note}` };
  });
}

export function buildLesson(config = {}) {
  const packKey = detectPack(config.topic);
  const pack = PACKS[packKey];
  const depth = levelDepth(config.level);
  const language = config.language === 'en' ? 'en' : 'vi';
  const translate = (entry) => (language === 'en' && entry.english ? entry.english : entry.vietnamese);
  const vocabulary = pack.vocabulary.slice(0, depth.vocab).map((entry) => ({
    ...entry,
    meaning: translate(entry),
  }));
  const sessions = Math.max(1, Number(config.sessions) || 1);

  return {
    mode: MODE,
    language,
    topic: config.topic || META.defaultTopic,
    title: `${META.emoji} ${META.label} — ${config.topic || META.defaultTopic}`,
    subtitle: pack.label,
    level: config.level || META.defaultLevel,
    audience: config.audience || META.defaultAudience,
    duration: Math.max(30, Number(config.duration) || META.defaultDuration),
    sessions,
    skills: config.skills && config.skills.length ? config.skills : META.defaultSkills,
    notes: config.notes || '',
    objectives: [
      `Hiểu và sử dụng thành thạo bộ từ vựng chủ đề “${pack.label}” (${vocabulary.length} mục).`,
      `Nắm ${pack.grammar.length} điểm ngữ pháp trọng tâm và đặt được câu ví dụ.`,
      `Thực hành hội thoại theo tình huống, tập trung kỹ năng: ${(config.skills || META.defaultSkills).join(', ')}.`,
      `Phát âm đúng và tự tin trình bày trước lớp ở trình độ ${config.level || META.defaultLevel}.`,
    ],
    materials: [
      'Máy chiếu / màn hình trình bày slide giáo án.',
      'Flashcard từ vựng và file nghe của giáo trình.',
      'Bảng, bút lông và phiếu bài tập in sẵn.',
      `Mẫu hội thoại và kịch bản đóng vai (${pack.dialogue.length} lượt lời).`,
      'Thiết bị ghi âm để học viên nghe lại phần phát âm.',
    ],
    timeline: buildTimeline(config, pack),
    vocabulary,
    grammar: pack.grammar.slice(0, depth.grammar),
    dialogue: pack.dialogue,
    exercises: pack.exercises,
    homework: sessions > 1
      ? [...pack.homework, `Buổi ${sessions - 1 + 1}/${sessions}: hoàn thành phần tự học trước khi vào buổi tiếp theo.`]
      : pack.homework,
    assessment: `Đánh giá qua mức độ tham gia hoạt động, độ chính xác khi đặt câu và 1 bài kiểm tra nhanh ${Math.max(5, Math.round((config.duration || 90) * 0.08))} phút ở cuối buổi.`,
    packKey,
    generatedBy: 'rule',
  };
}

export function buildPrompt(config = {}) {
  const pack = PACKS[detectPack(config.topic)];
  return `Bạn là giáo viên tiếng Hàn giàu kinh nghiệm, chuyên soạn giáo án cho người Việt.
Hãy soạn giáo án chi tiết cho:

Chủ đề: ${config.topic || META.defaultTopic}
Trình độ: ${config.level || META.defaultLevel}
Đối tượng: ${config.audience || META.defaultAudience}
Thời lượng: ${config.duration || META.defaultDuration} phút
Số buổi: ${config.sessions || 1}
Kỹ năng: ${(config.skills || META.defaultSkills).join(', ')}
Ngôn ngữ giảng dạy: ${config.language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}
Ghi chú: ${config.notes || 'Không có'}
Gợi ý nội dung tham khảo: ${pack.label}

Cấu trúc giáo án (JSON):
{
  "title": "...",
  "objectives": ["...", "..."],
  "materials": ["...", "..."],
  "timeline": [{ "time": "0-10 phút", "activity": "Warm-up: ..." }],
  "vocabulary": [{ "korean": "안녕하세요", "romanization": "annyeonghaseyo", "vietnamese": "Xin chào", "example": "안녕하세요, 저는 민수입니다." }],
  "grammar": [{ "point": "N + 입니다", "explanation": "...", "examples": ["...", "..."] }],
  "dialogue": [{ "speaker": "A", "korean": "...", "vietnamese": "..." }],
  "exercises": ["...", "..."],
  "homework": ["...", "..."],
  "assessment": "..."
}

Trả về JSON thuần, không kèm markdown. Soạn tối thiểu 10 từ vựng và 6 lượt hội thoại để đủ 10-15 slide.`;
}

export function buildFallback(config = {}) {
  return buildLesson(config);
}
