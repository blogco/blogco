export const REQUIREMENTS_VERSION = 1;
export const VERIFIED_ON = '2026-10-22';

export const DOCUMENTS = [
  { id: 'passport', label: 'Hộ chiếu' },
  { id: 'tourist-visa', label: 'Visa du lịch' },
  { id: 'evisa', label: 'Visa điện tử' },
  { id: 'dv-digital', label: 'Visa DV Hoa Kỳ — ảnh số' },
  { id: 'residence', label: 'Thẻ cư trú' },
  { id: 'immigration', label: 'Ảnh nhập cư' },
  { id: 'other', label: 'Giấy tờ khác' },
];

export const COUNTRIES = [
  ['US', 'Hoa Kỳ', 'https://travel.state.gov/en/passports/apply/help/photos.html'],
  ['AU', 'Úc', 'https://immi.homeaffairs.gov.au/'],
  ['KR', 'Hàn Quốc', 'https://www.visa.go.kr/openPage.do?MENU_ID=10105&lang=en'],
  ['TW', 'Đài Loan', 'https://www.boca.gov.tw/'],
  ['JP', 'Nhật Bản', 'https://www.mofa.go.jp/j_info/visit/visa/'],
  ['VN', 'Việt Nam', 'https://dichvucong.bocongan.gov.vn/'],
  ['CA', 'Canada', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-passports.html'],
  ['GB', 'Vương quốc Anh', 'https://www.gov.uk/photos-for-passports'],
  ['CN', 'Trung Quốc', 'https://www.mfa.gov.cn/eng/'],
  ['IN', 'Ấn Độ', 'https://passportindia.gov.in/'],
  ['SCH', 'Khối Schengen', 'https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en'],
  ['SG', 'Singapore', 'https://www.ica.gov.sg/documents/passport'],
  ['TH', 'Thái Lan', 'https://www.thaievisa.go.th/'],
];

function profile(countryCode, documentType, values) {
  return {
    countryCode, documentType, applicationChannel: '', issuingAuthority: '',
    physicalWidthMm: null, physicalHeightMm: null, digitalWidthPx: null, digitalHeightPx: null,
    minResolution: null, maxFileSizeBytes: null, acceptedFormats: [], backgroundRequirements: null,
    headHeightRange: null, eyePositionRange: null, facePositionRules: null, expressionRules: null,
    glassesRules: null, headwearRules: null, imageAgeRequirements: null, digitalAlterationRules: null,
    officialSourceUrl: '', lastVerifiedAt: null, verificationStatus: 'unverified', effectiveDate: null,
    version: REQUIREMENTS_VERSION, ...values,
  };
}

export const PROFILES = {
  'US:passport': profile('US', 'passport', {
    applicationChannel: 'Hộ chiếu Hoa Kỳ — ảnh in, đơn giấy', issuingAuthority: 'U.S. Department of State',
    physicalWidthMm: 51, physicalHeightMm: 51, backgroundRequirements: 'Trắng hoặc trắng ngà, trơn, không bóng đổ.',
    headHeightRange: { minMm: 25, maxMm: 35 }, facePositionRules: 'Nhìn thẳng, đầu ở giữa và hiện đầy đủ.',
    expressionRules: 'Biểu cảm tự nhiên; mắt mở; miệng khép.', imageAgeRequirements: 'Ảnh chụp trong 6 tháng gần đây.',
    digitalAlterationRules: 'Không chỉnh sửa kỹ thuật số; không thay nền. Chỉ dùng cắt khung để bố trí bản in theo hướng dẫn.',
    officialSourceUrl: 'https://travel.state.gov/en/passports/apply/help/photos.html', lastVerifiedAt: VERIFIED_ON,
    verificationStatus: 'verified',
  }),
  'US:tourist-visa': profile('US', 'tourist-visa', {
    applicationChannel: 'Visa Hoa Kỳ — yêu cầu ảnh chung; yêu cầu DS-160/đại sứ quán có thể khác', issuingAuthority: 'U.S. Department of State',
    physicalWidthMm: 51, physicalHeightMm: 51, backgroundRequirements: 'Trắng hoặc trắng ngà, trơn.',
    headHeightRange: { minMm: 22, maxMm: 35 }, headHeightRangePercent: { min: 50, max: 69 },
    facePositionRules: 'Nhìn thẳng, chính diện.', expressionRules: 'Biểu cảm trung tính, hai mắt mở.',
    glassesRules: 'Không đeo kính, trừ ngoại lệ y tế được nêu trong hướng dẫn.',
    imageAgeRequirements: 'Ảnh chụp trong 6 tháng gần đây.',
    digitalAlterationRules: 'Không tăng cường hoặc thay đổi diện mạo; đơn DS-160 phải đối chiếu yêu cầu ảnh số và hướng dẫn lãnh sự.',
    officialSourceUrl: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html',
    lastVerifiedAt: VERIFIED_ON, verificationStatus: 'verified',
  }),
  'US:dv-digital': profile('US', 'dv-digital', {
    applicationChannel: 'Diversity Visa Program — nộp ảnh số', issuingAuthority: 'U.S. Department of State',
    digitalWidthPx: 600, digitalHeightPx: 600, maxFileSizeBytes: 240 * 1024, acceptedFormats: ['image/jpeg'],
    physicalWidthMm: 51, physicalHeightMm: 51, headHeightRangePercent: { min: 50, max: 69 },
    backgroundRequirements: 'Trắng hoặc trắng ngà, trơn.', imageAgeRequirements: 'Ảnh chụp trong 6 tháng gần đây.',
    digitalAlterationRules: 'Không chỉnh sửa làm thay đổi diện mạo; chỉ cắt/xoay ảnh theo công cụ chính thức.',
    officialSourceUrl: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html',
    lastVerifiedAt: VERIFIED_ON, verificationStatus: 'verified',
  }),
  'KR:tourist-visa': profile('KR', 'tourist-visa', {
    applicationChannel: 'Visa Hàn Quốc — thông tin chung; cơ quan lãnh sự địa phương có thể yêu cầu khác',
    issuingAuthority: 'Korea Visa Portal', physicalWidthMm: 35, physicalHeightMm: 45,
    officialSourceUrl: 'https://www.visa.go.kr/openPage.do?MENU_ID=10105&lang=en',
    lastVerifiedAt: VERIFIED_ON, verificationStatus: 'verified',
  }),
};

export function getProfile(countryCode, documentType) {
  const known = PROFILES[`${countryCode}:${documentType}`];
  if (known) return known;
  const country = COUNTRIES.find(([code]) => code === countryCode);
  return profile(countryCode, documentType, {
    applicationChannel: `${DOCUMENTS.find(({ id }) => id === documentType)?.label || 'Giấy tờ'} — chưa xác minh`,
    issuingAuthority: country?.[1] || '', officialSourceUrl: country?.[2] || '',
  });
}
