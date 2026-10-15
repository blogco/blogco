# AI Training — dạy OCR học hoá đơn mẫu

Trang **🧠 AI Training** (`/#/coffee/training`, tĩnh: `/ca-phe/training/`) cho phép
người dùng dạy OCR nhận diện hoá đơn của một thương hiệu, lưu mẫu vào **DB trên
GitHub** (`data/ocr-training/`), và lần OCR sau sẽ chính xác hơn. Càng nhiều mẫu,
độ chính xác càng cao (self-learning loop).

Hỗ trợ đầu vào **JPG · PNG · WebP · PDF**: PDF được render từng trang bằng `pdf.js`
(rồi chạy qua đúng pipeline tiền xử lý + OCR như ảnh, xem `assets/js/coffee/ocr.js`).

## 1. Wireframe (5 bước)

```
┌──────────────────────────────────────────────────────────────────┐
│ 🧠 AI TRAINING · DẠY AI NHẬN DIỆN HOÁ ĐƠN                         │
├──────────────────────────────────────────────────────────────────┤
│ 1 · CHỌN THƯƠNG HIỆU                                             │
│   (•) Highlands Coffee   ( ) Starbucks   ( ) Phúc Long   ( ) Khác │
│   Khác: [ ______________________ ]                                │
├──────────────────────────────────────────────────────────────────┤
│ 2 · UPLOAD HOÁ ĐƠN MẪU                                           │
│   [ Kéo ảnh/PDF vào đây hoặc bấm để chọn ]                       │
│   JPG · PNG · WebP · PDF · tối đa 10MB/tệp · nhiều tệp           │
├──────────────────────────────────────────────────────────────────┤
│ 3 · KIỂM TRA / SỬA TEXT OCR                                      │
│   [🔍 OCR ảnh đã chọn]  [Xoá text]                               │
│   ┌────────────────────────────────────────────────────────────┐ │
│   │ HIGHLANDS COFFEE                                           │ │
│   │ 126 Hong Bang, Phuong Cho Lon, TP.HCM                      │ │
│   │ Creck: 174294 POS01                                        │ │
│   │ Ngay: 15-10-2026 06:52 …                                   │ │
│   └────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│ 4 · ĐÁNH DẤU CÁC TRƯỜNG QUAN TRỌNG                               │
│   Bôi đen text ở ô trên rồi bấm nhãn:                            │
│   [🏷 Thương hiệu][🏷 Địa chỉ][🏷 SĐT][🏷 ShopID][🏷 Check]…      │
│   [🏷 brand][🏷 address][🏷 phone][🏷 shopId][🏷 checkNo]…        │
│   [✨ Gợi ý từ OCR]                                               │
├──────────────────────────────────────────────────────────────────┤
│ 5 · HUẤN LUYỆN & LƯU VÀO DB                                      │
│   GitHub PAT (contents:write) [ •••••• ]                          │
│   [🧠 Huấn luyện AI với mẫu này] [💾 Export] [⬆ Import]          │
├──────────────────────────────────────────────────────────────────┤
│ 📊 TIẾN ĐỘ HỌC                                                   │
│   Highlands Coffee  ▓▓▓░░░░░░  56%  (1 mẫu)                      │
│   Starbucks         ▓▓░░░░░░░  45%  (0 mẫu)                      │
│   Phúc Long         ▓▓░░░░░░░  45%  (0 mẫu)                      │
│   💡 Upload thêm 11 mẫu Highlands để tiệm cận 95%.               │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Cấu trúc DB trên GitHub

```
data/ocr-training/
├── index.json                      # tổng hợp mọi brand (samples, accuracy, version)
├── highlands/
│   ├── samples/
│   │   └── sample-2026-10-15-highlands-001.json   # ground truth
│   ├── patterns.json               # regex patterns + vietnameseFixes học được
│   └── accuracy.json               # log độ chính xác theo thời gian
├── starbucks/…
└── phuclong/…
```

`index.json`

```json
{ "updatedAt": "…", "brands": { "highlands": { "samples": 1, "accuracy": 0.56, "version": 1 } } }
```

`patterns.json`

```json
{
  "brand": "highlands", "version": 1, "sampleCount": 1, "accuracy": 0.56,
  "patterns": { "checkNo": "Check[:\\s]+(\\d+)", "total": "Tong\\s*tien[:\\s]+([\\d.,]+)" },
  "vietnameseFixes": { "Creck": "Check", "Thu rean": "Thu ngan" }
}
```

`sample-*.json` (ground truth)

```json
{
  "id": "sample-2026-10-15-highlands-001", "brand": "highlands",
  "rawText": "HIGHLANDS COFFEE\\n…",
  "labeledFields": { "checkNo": "174294", "datetime": "15-10-2026 06:52", "total": "100200",
    "items": [{ "qty": 1, "name": "Matcha Latte Da L", "price": 69000, "discount": -13800 }] }
}
```

## 3. Vòng học (self-learning loop)

```
1. User upload hoá đơn mẫu (ảnh hoặc PDF)
        ↓
2. OCR đọc thô (Tesseract; PDF render qua pdf.js trước)
        ↓
3. User sửa text + gán nhãn trường (bôi đen → bấm nhãn, hoặc “Gợi ý từ OCR”)
        ↓
4. learnFromSample(): so ground truth với patterns hiện tại
        ↓
5. Sinh regex pattern mới + học vietnameseFixes (findClosest)
        ↓
6. Tăng version + sampleCount, cập nhật accuracy (bão hoà theo số mẫu)
        ↓
7. Lưu sample + patterns.json + accuracy.json + index.json
        ↓
8. Push lên GitHub (CMS local → GitHub API → tải file thủ công)
        ↓
9. OCR lần sau dùng patterns/fixes mới → chính xác hơn
```

## 4. Hàm học (`assets/js/coffee/training.js`)

| Hàm | Vai trò |
|-----|---------|
| `generatePattern(field, value)` | Sinh regex cho trường (phone/shopId/checkNo/datetime/total…) + fallback escape |
| `similarity(a, b)` / `findClosest(lines, target)` | So khớp mờ (Dice token) để học bảng sửa lỗi |
| `learnFromSample(brand, sample, patterns)` | Hàm thuần: sinh patterns + fixes, bump version, tính accuracy |
| `applyLearnedFixes(text, fixes)` | Áp fixes đã học vào text OCR trước khi parse |
| `accuracyFromCount(n)` | Ước lượng độ chính xác theo số mẫu (tiệm cận 99%) |
| `loadPatterns` / `loadTrainingIndex` | Đọc DB từ GitHub raw, fallback bundle |
| `saveTrainingSample` | Lưu qua CMS local / GitHub API / tải file JSON |

## 5. 3 cách push lên GitHub

- **A · CMS local (khuyến nghị khi chạy máy):** `POST /training/save` →
  `cms/services/training_service.py` ghi `data/ocr-training/<brand>/` rồi
  `git commit` + `git push origin main`.
- **B · GitHub API:** dán PAT (quyền `contents:write`) ở Bước 5; token chỉ lưu ở
  `localStorage` của trình duyệt (`blogco:gh_token`), không gửi đi đâu khác.
- **C · Tải file thủ công:** khi không có token/CMS, hệ thống tải
  `<brand>-<sample>.json` để bạn tự commit vào `data/ocr-training/`.

## 6. Kiểm thử

`assets/js/coffee/training.test.js` phủ `escapeRegex`, `generatePattern`,
`similarity`/`findClosest`, `accuracyFromCount`, `nextSampleId`, `learnFromSample`
và `applyLearnedFixes`. Chạy `npm test`.
