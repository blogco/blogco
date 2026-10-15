# AI Training — dạy OCR học hoá đơn mẫu

Trang **🧠 AI Training** (`/#/coffee/training`, tĩnh: `/ca-phe/training/`) là một
**workbench** để dạy OCR đọc hoá đơn chính xác hơn:

- Tách **sản phẩm** khỏi **mã check / giảm giá / thuế / phí / tổng tiền**.
- Xem **hoá đơn gốc cạnh bảng dữ liệu** để đối chiếu trực quan.
- Sửa dữ liệu ngay trên bảng, **đối chiếu tổng tiền trực tiếp**.
- **Xác nhận dữ liệu chuẩn** (ground truth) rồi đưa vào **tập training** để
  pipeline backend cải thiện OCR về sau.

Hỗ trợ đầu vào **JPG · PNG · WebP · PDF**: PDF được render từng trang bằng `pdf.js`
(rồi chạy qua đúng pipeline tiền xử lý + OCR như ảnh, xem `assets/js/coffee/ocr.js`).

> ⚠️ **Nói thẳng:** nút "Đưa vào tập training" **không** huấn luyện lại mô hình
> ngay. Nó lưu mẫu ground truth + patterns vào DB (`data/ocr-training/`). Mô hình
> chỉ được huấn luyện lại khi pipeline backend thực sự hỗ trợ — UI không tuyên bố
> "AI đã học" nếu chỉ mới lưu dữ liệu.

## 1. Quy trình 7 bước

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🧠 AI TRAINING · HUẤN LUYỆN ĐỌC HOÁ ĐƠN                               │
│ [Trạng thái] 12 hoá đơn · 3 chờ xác nhận · 1 cần sửa   [🕘 Lịch sử]  │
├──────────────────────────────────────────────────────────────────────┤
│ 1 · TẢI HOÁ ĐƠN                                                       │
│   [ Kéo hoá đơn PDF/ảnh vào đây hoặc bấm để chọn ]  PDF·PNG·JPG 15MB │
├──────────────────────────────────────────────────────────────────────┤
│ ① Tải lên  ② AI phân tích  ③ Sửa dữ liệu  ④ Xác minh  ⑤ Xác nhận     │
├───────────────────────────────┬──────────────────────────────────────┤
│ HOÁ ĐƠN GỐC  [− 100% +]       │ 2 · SẢN PHẨM NHẬN DIỆN   [2 sản phẩm]│
│ ┌───────────────────────────┐ │  ┌────────────────────────────────┐  │
│ │                           │ │  │ Tên       SL  Đơn giá  Giảm Net│  │
│ │   (ảnh/PDF hoá đơn,       │ │  │ Matcha…    1   69.000 13.800   │  │
│ │    zoom 50–300%)          │ │  │ Banh Dua   1   45.000     0    │  │
│ │                           │ │  └────────────────────────────────┘  │
│ └───────────────────────────┘ │ 3 · DÒNG CHƯA PHÂN LOẠI CHẮC CHẮN   │
│                                 │   [text dòng ............] [loại ▾]│
│  (mobile: 2 tab — Hoá đơn gốc │ 4 · ĐỐI CHIẾU HOÁ ĐƠN  [Đã đối chiếu]│
│   ⇄ Dữ liệu nhận diện)         │   Tổng hàng … Thành tiền … Tổng …    │
│                                 │   Chênh lệch 0 đ · ✅ Tổng khớp      │
│                                 │ 5 · XÁC NHẬN DỮ LIỆU CHUẨN          │
│                                 │   [💾 Lưu bản nháp] [✅ Xác nhận]    │
├───────────────────────────────┴──────────────────────────────────────┤
│ 6 · ĐƯA VÀO TẬP TRAINING (ground truth → patterns, KHÔNG retrain)     │
│ 7 · LỊCH SỬ TRAINING & QUẢN LÝ DỮ LIỆU MẪU                            │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Tách sản phẩm khỏi check code / giảm giá / tổng tiền

Đây là bản sửa lỗi OCR quan trọng nhất. `assets/js/coffee/extract.js` phân loại
**từng dòng** thành một trong các loại (dropdown "loại dòng" cho phép người dùng
sửa lại nếu AI hiểu sai):

| Loại | Ý nghĩa |
|------|---------|
| `product` | Món/sản phẩm |
| `modifier` | Tùy chọn / topping (không phải món) |
| `discount` | Giảm giá / coupon (kể cả `-Ecode …`) |
| `tax` | Thuế (VAT/GTGT) |
| `fee` | Phí / dịch vụ |
| `subtotal` | Tổng tiền hàng |
| `total` | Tổng thanh toán |
| `payment` | Thanh toán (Payoo/tiền mặt/thẻ…) |
| `metadata` | Check/creck, quán, nhân viên, ngày, SĐT… |
| `unknown` | Không xác định |

Nguyên tắc (được kiểm thử trong `extract.test.js`):

- **Không** biến `metadata` (mã check, `Pager`, `ShopID`…) thành món.
- **Không** lấy thành tiền thay cho **đơn giá gốc**; giữ nguyên đơn giá đọc được
  và giảm giá riêng (ví dụ Matcha: đơn giá `69.000`, giảm `13.800`, net `55.200`).
- **Không** mặc định số lượng = 1 khi không đọc được → để `null` và đánh dấu
  `needs_review`.
- **Không** sửa số liệu gốc để ép tổng khớp → chỉ **báo cáo chênh lệch**.

## 3. Đối chiếu tiền tệ trực tiếp (`assets/js/coffee/verify.js`)

`reconcile({ items, receipt })` trả về trạng thái:

| Trạng thái | Điều kiện |
|-----------|-----------|
| `verified` | `|tổng in − tổng tính| ≤ 1` **và** mọi dòng đủ SL/đơn giá |
| `review` | Còn dòng thiếu số lượng/đơn giá |
| `mismatch` | Tổng lệch quá dung sai (báo số chênh) |
| `insufficient` | Thiếu tổng thanh toán hoặc thiếu sản phẩm |

Công thức: `tổng tính = Σ(đơn giá × SL − giảm dòng) + thuế + phí − giảm cấp hoá đơn`.

**Chỉ `verified` mới bật nút "✅ Xác nhận dữ liệu chuẩn".** Các trường hợp khác vẫn
lưu được **bản nháp**, nhưng ghi rõ mục nào chưa xác minh.

## 4. Kiểm soát việc huấn luyện (phân biệt rõ 4 hành động)

| Nút | Ý nghĩa thực sự |
|-----|-----------------|
| 💾 **Lưu bản nháp** | Lưu phiên vào `localStorage` thiết bị, trạng thái `draft` |
| ✅ **Xác nhận dữ liệu chuẩn** | Đánh dấu ground truth (`confirmed`), chỉ bật khi `verified` |
| 🧠 **Đưa vào tập training** | Ghi mẫu + patterns vào DB (`training.js`), **không** retrain |
| ♻️ Retrain mô hình | **Không có** — chờ pipeline backend; UI nói rõ điều này |

Mọi phiên giữ **nguyên kết quả OCR gốc** (`original.rawText` / `original.items`) để
luôn đối chiếu được gốc vs đã sửa. Lịch sử (`training-store.js`) lưu bản ghi gọn có
`versions`, hỗ trợ lọc theo từ khoá / trạng thái / ngày, mở lại và xoá.

## 5. Cấu trúc DB trên GitHub

```
data/ocr-training/
├── index.json                      # tổng hợp mọi brand (samples, accuracy, version)
├── highlands/
│   ├── samples/
│   │   └── sample-2026-10-15-highlands-001.json   # ground truth + ảnh hoá đơn
│   ├── patterns.json               # regex patterns + vietnameseFixes học được
│   ├── prompt-context.json         # system prompt + few-shot nạp cho AI OCR
│   └── accuracy.json               # log độ chính xác theo thời gian
├── starbucks/…
└── phuclong/…
```

`sample-*.json` (ground truth) — do `buildLabeledFields()` sinh ra, kèm **cặp ảnh
hoá đơn** (`image`: data URL JPEG nén, `imageHash`) để tái hiện/đối chiếu:

```json
{
  "id": "sample-2026-10-15-highlands-001", "brand": "highlands",
  "rawText": "HIGHLANDS COFFEE\n…",
  "image": "data:image/jpeg;base64,…",
  "imageHash": "sha256:1a2b3c4d",
  "labeledFields": {
    "brand": "Highlands Coffee", "checkNo": "174294", "datetime": "2026-10-15",
    "subtotal": "100200", "total": "100200",
    "items": [{ "qty": 1, "name": "Matcha Latte Da L", "price": 69000, "discount": -13800, "amount": 55200 }]
  }
}
```

## 6. Vòng học (self-learning loop)

```
1. User upload hoá đơn mẫu (ảnh hoặc PDF)
        ↓
2. OCR đọc thô (Tesseract; PDF render qua pdf.js trước)
        ↓
3. extractReceipt(): phân loại từng dòng, tách sản phẩm khỏi check/giảm giá/tổng
        ↓
4. User đối chiếu hoá đơn gốc ⇄ bảng dữ liệu, sửa inline; verify.js tính lại tổng
        ↓
5. Chỉ khi verified → "Xác nhận dữ liệu chuẩn"
        ↓
6. learnFromSample(): so ground truth với patterns hiện tại
        ↓
7. Sinh regex pattern mới + học vietnameseFixes (findClosest), bump version/accuracy
        ↓
8. Lưu sample + patterns.json + accuracy.json + index.json
        ↓
9. Push lên GitHub (CMS local → GitHub API → tải file thủ công)
        ↓
10. ⏰ GitHub Action `ocr-training.yml` (cron 02:00 VN mỗi ngày + mỗi lần push mẫu)
        ↓
11. Hợp nhất TOÀN BỘ mẫu → patterns.json + prompt-context.json (system prompt +
    few-shot + bảng sửa lỗi) cho từng thương hiệu; cập nhật index/accuracy
        ↓
12. OCR lần sau nạp context mới (`loadPatterns` → `applyLearnedFixes`) → đọc đúng
    hơn cho chính quán đó (retrain mô hình: ngoài phạm vi frontend)
```

### Vòng lặp định kỳ (Cron/Action)

`.github/workflows/ocr-training.yml` chạy `scripts/ocr-training/improve.mjs`, gọi
module thuần `assets/js/coffee/training-batch.js`:

- `rebuildPatterns(slug, samples)` — tái sinh pattern một cách **tất định** từ mọi
  mẫu (không phụ thuộc thứ tự thao tác UI).
- `buildPromptContext(slug, samples, patterns)` — sinh `prompt-context.json`
  (system prompt tiếng Việt + few-shot + patterns + vietnameseFixes) để nạp vào
  context của AI OCR.
- `appendAccuracyLog` / `buildIndex` — ghi log độ chính xác và tổng hợp index; chỉ
  ghi file khi nội dung **thực sự đổi** (không tạo commit rỗng mỗi ngày).

Chạy thủ công tại máy: `npm run train:ocr`.

## 7. Kiến trúc module

| File | Vai trò |
|------|---------|
| `extract.js` | Phân loại dòng + trích xuất có cấu trúc (hàm thuần) |
| `verify.js` | Đối chiếu tiền tệ + trạng thái xác minh (hàm thuần) |
| `training-model.js` | Phiên training: tạo/sửa/xoá dòng, recompute, ground truth |
| `training-store.js` | Lịch sử phiên trên `localStorage` (`blogco.coffee.training.v1`) |
| `training-table.js` | Bảng sản phẩm có thể sửa + input tiền Việt |
| `training-history.js` | Danh sách lịch sử + bộ lọc |
| `training-view.js` | Orchestrator workbench (markup + nối sự kiện) |
| `training.js` | Học patterns + lưu mẫu (CMS/GitHub/tải file) |
| `training-batch.js` | Hợp nhất theo lô: patterns + prompt-context + index (hàm thuần) |
| `scripts/ocr-training/improve.mjs` | Runner đọc/ghi file cho vòng lặp Cron/Action |
| `.github/workflows/ocr-training.yml` | Lịch chạy hàng ngày + commit context đã hợp nhất |

## 8. 3 cách push lên GitHub

- **A · CMS local (khuyến nghị khi chạy máy):** `POST /training/save` →
  `cms/services/training_service.py` ghi `data/ocr-training/<brand>/` rồi
  `git commit` + `git push origin main`.
- **B · GitHub API:** dán PAT (quyền `contents:write`) ở Bước 6; token chỉ lưu ở
  `localStorage` của trình duyệt (`blogco:gh_token`), không gửi đi đâu khác.
- **C · Tải file thủ công:** khi không có token/CMS, hệ thống tải
  `<brand>-<sample>.json` để bạn tự commit vào `data/ocr-training/`.

Trên trang "Thêm/Sửa hoá đơn" cũng có khối **"🧪 Kết quả trích xuất chuẩn (JSON)"**
(mặc định thu gọn) hiển thị `extractReceipt()` để đối chiếu nhanh sau khi OCR.

## 9. Kiểm thử

- `extract.test.js` — phân loại dòng, tách sản phẩm/giảm giá/metadata, giữ đơn giá
  gốc, không bịa số, báo lệch tổng.
- `verify.test.js` — 4 trạng thái đối chiếu, dung sai, thuế/phí/giảm cấp hoá đơn.
- `training-model.test.js` — phiên, recompute, thêm/sửa/xoá, đổi loại dòng,
  ground truth, `canConfirm`, `editedFieldCount`.
- `training-store.test.js` — lưu/đọc/cập nhật/xoá, phiên bản, bộ lọc.
- `training.test.js` — `escapeRegex`, `generatePattern`, `similarity`/`findClosest`,
  `accuracyFromCount`, `nextSampleId`, `learnFromSample`, `applyLearnedFixes`.
- `training-batch.test.js` — `rebuildPatterns`, `buildPromptContext`,
  `appendAccuracyLog`, `buildIndex`, `consolidate`, `fixWithContext`.

Chạy `npm test` (toàn bộ) và `npm run build:assets` (kiểm tra bundle Vite).

## 10. Phần phụ thuộc backend / ngoài phạm vi frontend

- **Huấn luyện lại mô hình OCR:** chưa fine-tune trọng số mô hình; vòng lặp tự cải
  thiện hiện dùng **prompt context** (regex patterns + bảng sửa lỗi + few-shot) sinh
  tự động bởi Action hàng ngày và nạp lại trước mỗi lần OCR.
- **Đồng bộ phiên training giữa nhiều thiết bị:** hiện lưu cục bộ (`localStorage`);
  chưa có API phiên phía server.
- **Ghi vào DB:** cần CMS local đang chạy hoặc GitHub PAT hoặc commit file thủ công.
