// Offline ICD-10 lookup (Vietnamese + English labels).
//
// The catalogue is a curated subset of common codes for quick reference — it is
// NOT a complete ICD-10 catalogue and must not be used as a billing/clinical
// source. Codes follow the WHO ICD-10 structure (letter + 2 digits + optional
// .x). The full Chapter XII (diseases of the skin and subcutaneous tissue,
// L00–L99) is loaded from `assets/data/icd10-dermatology.json` and merged with
// the general-practice subset below.

import Fuse from 'fuse.js';
import dermatology from '../../data/icd10-dermatology.json' with { type: 'json' };

const ICD_ENTRIES = [
  ['A09', 'Tiêu chảy và viêm dạ dày - ruột do nhiễm trùng', 'Bệnh nhiễm trùng đường tiêu hoá'],
  ['A15', 'Lao phổi', 'Bệnh nhiễm trùng'],
  ['A46', 'Viêm mô tế bào (erysipelas)', 'Bệnh nhiễm trùng da'],
  ['A49.9', 'Nhiễm khuẩn không xác định', 'Bệnh nhiễm trùng'],
  ['B01.9', 'Thuỷ đậu không biến chứng', 'Bệnh virus'],
  ['B34.9', 'Nhiễm virus không đặc hiệu', 'Bệnh virus'],
  ['B37.0', 'Nhiễm nấm Candida miệng', 'Bệnh nấm'],
  ['D50.9', 'Thiếu máu do thiếu sắt', 'Bệnh máu'],
  ['E03.9', 'Suy giáp không đặc hiệu', 'Bệnh nội tiết'],
  ['E05.9', 'Cường giáp', 'Bệnh nội tiết'],
  ['E10', 'Đái tháo đường type 1', 'Bệnh nội tiết'],
  ['E11', 'Đái tháo đường type 2', 'Bệnh nội tiết'],
  ['E11.9', 'Đái tháo đường type 2 không biến chứng', 'Bệnh nội tiết'],
  ['E66.9', 'Béo phì không rõ nguyên nhân', 'Bệnh chuyển hoá'],
  ['E78.5', 'Rối loạn lipid máu không đặc hiệu', 'Bệnh chuyển hoá'],
  ['E86', 'Mất nước (giảm thể tích tuần hoàn)', 'Bệnh chuyển hoá'],
  ['F32.9', 'Rối loạn trầm cảm không đặc hiệu', 'Bệnh tâm thần'],
  ['F41.1', 'Rối loạn lo âu lan toả', 'Bệnh tâm thần'],
  ['F43.2', 'Rối loạn thích ứng', 'Bệnh tâm thần'],
  ['G40.9', 'Động kinh không đặc hiệu', 'Bệnh thần kinh'],
  ['G43.9', 'Đau nửa đầu (migraine)', 'Bệnh thần kinh'],
  ['G44.2', 'Đau đầu căng cơ', 'Bệnh thần kinh'],
  ['G47.0', 'Rối loạn khởi phát và duy trì giấc ngủ (mất ngủ)', 'Rối loạn giấc ngủ'],
  ['H10.9', 'Viêm kết mạc không đặc hiệu', 'Bệnh mắt'],
  ['H52.1', 'Cận thị', 'Bệnh mắt'],
  ['H66.9', 'Viêm tai giữa không đặc hiệu', 'Bệnh tai - mũi - họng'],
  ['H81.1', 'Chóng mặt kịch phát lành tính (BPPV)', 'Bệnh tai'],
  ['I10', 'Tăng huyết áp vô căn (nguyên phát)', 'Bệnh tim mạch'],
  ['I11.9', 'Bệnh tim do tăng huyết áp không suy tim', 'Bệnh tim mạch'],
  ['I20.0', 'Đau thắt ngực không ổn định', 'Bệnh tim mạch'],
  ['I21.9', 'Nhồi máu cơ tim cấp không đặc hiệu', 'Bệnh tim mạch'],
  ['I25.9', 'Bệnh tim thiếu máu cục bộ mạn', 'Bệnh tim mạch'],
  ['I48', 'Rung nhĩ và cuồng nhĩ', 'Bệnh tim mạch'],
  ['I63.9', 'Nhồi máu não không đặc hiệu (đột quỵ thiếu máu)', 'Bệnh mạch máu não'],
  ['I83.9', 'Suy tĩnh mạch chi dưới', 'Bệnh mạch máu'],
  ['I84.9', 'Trĩ không đặc hiệu', 'Bệnh hậu môn - trực tràng'],
  ['J00', 'Viêm mũi họng cấp (cảm lạnh thông thường)', 'Bệnh hô hấp'],
  ['J01.9', 'Viêm xoang cấp không đặc hiệu', 'Bệnh hô hấp'],
  ['J02.9', 'Viêm họng cấp không đặc hiệu', 'Bệnh hô hấp'],
  ['J03.9', 'Viêm amidan cấp không đặc hiệu', 'Bệnh hô hấp'],
  ['J06.9', 'Viêm đường hô hấp trên cấp, không đặc hiệu', 'Bệnh hô hấp'],
  ['J11.1', 'Cúm có biểu hiện hô hấp khác', 'Bệnh hô hấp'],
  ['J18.9', 'Viêm phổi không đặc hiệu', 'Bệnh hô hấp'],
  ['J20.9', 'Viêm phế quản cấp không đặc hiệu', 'Bệnh hô hấp'],
  ['J30.1', 'Viêm mũi dị ứng do phấn hoa', 'Bệnh dị ứng'],
  ['J30.4', 'Viêm mũi dị ứng không đặc hiệu', 'Bệnh dị ứng'],
  ['J42', 'Viêm phế quản mạn tính không đặc hiệu', 'Bệnh hô hấp mạn'],
  ['J44.9', 'Bệnh phổi tắc nghẽn mạn tính (COPD)', 'Bệnh hô hấp mạn'],
  ['J45.9', 'Hen phế quản không đặc hiệu', 'Bệnh hô hấp mạn'],
  ['K21.9', 'Trào ngược dạ dày - thực quản (GERD)', 'Bệnh tiêu hoá'],
  ['K29.7', 'Viêm dạ dày không đặc hiệu', 'Bệnh tiêu hoá'],
  ['K30', 'Khó tiêu (chứng khó tiêu)', 'Bệnh tiêu hoá'],
  ['K35.8', 'Viêm ruột thừa cấp khác', 'Bệnh tiêu hoá'],
  ['K44.9', 'Thoát vị hoành (thoát vị cơ hoành)', 'Bệnh tiêu hoá'],
  ['K59.0', 'Táo bón', 'Bệnh tiêu hoá'],
  ['K80.2', 'Sỏi túi mật không viêm túi mật', 'Bệnh tiêu hoá'],
  ['K81.0', 'Viêm túi mật cấp', 'Bệnh tiêu hoá'],
  ['L03.9', 'Viêm mô tế bào không đặc hiệu', 'Bệnh da'],
  ['L20.9', 'Viêm da cơ địa (chàm thể tạng)', 'Bệnh da'],
  ['L23.9', 'Viêm da tiếp xúc dị ứng', 'Bệnh da'],
  ['L30.9', 'Viêm da không đặc hiệu', 'Bệnh da'],
  ['L40.9', 'Vảy nến không đặc hiệu', 'Bệnh da'],
  ['L50.9', 'Mày đay không đặc hiệu', 'Bệnh da'],
  ['L60.9', 'Bệnh móng không đặc hiệu', 'Bệnh da'],
  ['M17.9', 'Thoái hoá khớp gối', 'Bệnh cơ xương khớp'],
  ['M25.5', 'Đau khớp', 'Bệnh cơ xương khớp'],
  ['M54.5', 'Đau thắt lưng', 'Bệnh cơ xương khớp'],
  ['M54.2', 'Đau cổ', 'Bệnh cơ xương khớp'],
  ['M75.1', 'Viêm gân xoay vai (hội chứng chóp xoay)', 'Bệnh cơ xương khớp'],
  ['M79.1', 'Đau cơ', 'Bệnh cơ xương khớp'],
  ['N10', 'Viêm thận - bể thận cấp', 'Bệnh tiết niệu'],
  ['N20.0', 'Sỏi thận', 'Bệnh tiết niệu'],
  ['N30.0', 'Viêm bàng quang cấp', 'Bệnh tiết niệu'],
  ['N39.0', 'Nhiễm khuẩn đường tiết niệu không đặc hiệu', 'Bệnh tiết niệu'],
  ['N40', 'Tăng sản tuyến tiền liệt lành tính', 'Bệnh tiết niệu'],
  ['O26.9', 'Biến chứng thai kỳ không đặc hiệu', 'Thai kỳ'],
  ['R05', 'Ho', 'Triệu chứng hô hấp'],
  ['R07.4', 'Đau ngực không đặc hiệu', 'Triệu chứng tim mạch'],
  ['R10.4', 'Đau bụng khác và không đặc hiệu', 'Triệu chứng tiêu hoá'],
  ['R11', 'Buồn nôn và nôn', 'Triệu chứng tiêu hoá'],
  ['R42', 'Hoa mắt, chóng mặt', 'Triệu chứng thần kinh'],
  ['R50.9', 'Sốt không đặc hiệu', 'Triệu chứng toàn thân'],
  ['R51', 'Đau đầu', 'Triệu chứng thần kinh'],
  ['R53', 'Mệt mỏi, suy nhược', 'Triệu chứng toàn thân'],
  ['R55', 'Ngất', 'Triệu chứng tuần hoàn'],
  ['Z00.0', 'Khám sức khoẻ tổng quát', 'Khám dự phòng'],
  ['Z23', 'Tiêm chủng', 'Dự phòng'],
  ['Z76.0', 'Cấp lại đơn thuốc', 'Hành chính y tế'],
];

// Merge the general subset with Chapter XII (dermatology). A Map keeps the
// general-practice codes first while letting the richer dermatology records
// (English label + specific group) override any duplicate code.
const BY_CODE = new Map();
for (const [code, name, group] of ICD_ENTRIES) {
  BY_CODE.set(code, { code, name, en: '', group });
}
for (const { code, vi, en, group } of dermatology.codes) {
  BY_CODE.set(code, { code, name: vi, en: en || '', group: group || dermatology.title });
}
const INDEX = [...BY_CODE.values()];

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

// Fuzzy index over accent-stripped Vietnamese/English labels, so typing either
// language (with or without diacritics) or the code itself all works.
const FUSE = new Fuse(
  INDEX.map((entry) => ({
    entry,
    code: entry.code.toUpperCase(),
    name: normalizeText(entry.name),
    en: normalizeText(entry.en),
    group: normalizeText(entry.group),
  })),
  {
    keys: ['code', 'name', 'en', 'group'],
    threshold: 0.34,
    ignoreLocation: true,
    minMatchCharLength: 1,
    includeScore: true,
  },
);

export function getICD(code = '') {
  const needle = String(code).trim().toUpperCase();
  if (!needle) return null;
  return INDEX.find((entry) => entry.code === needle)
    || INDEX.find((entry) => entry.code.startsWith(needle.replace(/\.$/, '')))
    || null;
}

export function searchICD(query = '', limit = 8) {
  const raw = String(query).trim();
  if (!raw) return INDEX.slice(0, limit);

  const needle = normalizeText(raw);
  const codeNeedle = raw.toUpperCase().replace(/\s/g, '');
  const seen = new Set();
  const results = [];
  const push = (entry) => {
    if (!entry || seen.has(entry.code) || results.length >= limit) return;
    seen.add(entry.code);
    results.push(entry);
  };

  // 1. Exact/partial code, then substring matches on code, Vietnamese and
  //    English labels — deterministic and highest-confidence.
  push(getICD(codeNeedle));
  for (const entry of INDEX) {
    if (results.length >= limit) break;
    if (entry.code.toUpperCase().startsWith(codeNeedle)
      || normalizeText(entry.name).includes(needle)
      || normalizeText(entry.group).includes(needle)
      || (entry.en && normalizeText(entry.en).includes(needle))) {
      push(entry);
    }
  }

  // 2. Fuzzy fallback for typos and odd word order.
  if (results.length < limit && needle.length >= 2) {
    for (const { item } of FUSE.search(needle)) {
      if (results.length >= limit) break;
      push(item.entry);
    }
  }

  return results;
}

export function allICD() {
  return [...INDEX];
}
