# Wireframe cấu trúc hoá đơn Highlands Coffee (vùng A–I)

Tài liệu này là "bản đồ" để parser (`assets/js/coffee/ocr.js`) — và bất kỳ AI
Agent nào đọc hoá đơn — hiểu đúng **vùng/section** của hoá đơn Highlands, thay vì
parse mù rồi nhầm dòng giảm giá / dòng thanh toán thành món.

## 1. Wireframe theo vùng

```
┌─────────────────────────────────────────────────────────────┐ Y=0
│ ▓▓▓ VÙNG A: HEADER (LOGO + TÊN QUÁN) ▓▓▓                     │
│   HIGHLANDS COFFEE                                          │
├─────────────────────────────────────────────────────────────┤ Y≈80
│ ▓▓▓ VÙNG B: THÔNG TIN CƠ SỞ ▓▓▓                              │
│   126 Hong Bang, Phuong Cho Lon, TP.HCM                     │
│   SĐT: 028.7301.6978                                        │
│   ShopID: 1039                                              │
├─────────────────────────────────────────────────────────────┤ Y≈180
│ ▓▓▓ VÙNG C: LOẠI HOÁ ĐƠN ▓▓▓                                 │
│   Hoa Don Thanh Toan    Pager: 13                           │
├─────────────────────────────────────────────────────────────┤ Y≈240
│ ▓▓▓ VÙNG D: METADATA ĐƠN ▓▓▓                                 │
│   In Store                                                  │
│   Check: 174294 POS01                                       │
│   Ngay: 15-10-2026 06:52                                    │
│   Thu ngan: Thu Ngan ca sang 1                              │
├─────────────────────────────────────────────────────────────┤ Y≈360
│ ▓▓▓ VÙNG E: DANH SÁCH MÓN (ITEMS) ▓▓▓                        │
│   1 Matcha Latte Da L     69.000   ← ITEM                   │
│   -Ecode Coupon giam     -13.800   ← DISCOUNT (vào item trên)│
│   1 Banh Dua              45.000   ← ITEM                   │
├─────────────────────────────────────────────────────────────┤ Y≈470
│ ▓▓▓ VÙNG F: TỔNG KẾT TIỀN ▓▓▓                                │
│   Thanh tien: 100.200                                       │
│   Tong tien:  100.200                                       │
├─────────────────────────────────────────────────────────────┤ Y≈540
│ ▓▓▓ VÙNG G: PHƯƠNG THỨC THANH TOÁN ▓▓▓                       │
│   Payoo Bank Card   100.200    ← PAYMENT                    │
├─────────────────────────────────────────────────────────────┤ Y≈580
│ ▓▓▓ VÙNG H: TÊN KHÁCH HÀNG ▓▓▓                               │
│   Nguyen Duy Khang                                          │
├─────────────────────────────────────────────────────────────┤ Y≈620
│ ▓▓▓ VÙNG I: FOOTER (MARKETING + QR) — BỎ QUA ▓▓▓             │
│   * Chia se y kien cua ban voi chung toi *                  │
│   customerservice@highlandscoffee.com.vn                    │
│   San Qua 100% Trung Thuong · Tai App Highlands Dat ngay!   │
│   [QR] Xuat hoa don · [QR] · Xin cam on Quy khach!          │
└─────────────────────────────────────────────────────────────┘ Y=end
```

## 2. Bảng nhãn ngữ nghĩa theo vùng

| Vùng | Tên vùng        | Trường           | Kiểu     | Pattern ví dụ                    |
|------|-----------------|------------------|----------|----------------------------------|
| A    | Header          | `brand`          | string   | `HIGHLANDS COFFEE`               |
| B    | Thông tin cơ sở | `address`        | string   | `126 Hong Bang, ...`             |
| B    |                 | `phone`          | string   | `SĐT: 028.7301.6978`             |
| B    |                 | `shopId`         | int      | `ShopID: 1039`                   |
| C    | Loại hoá đơn    | `receiptType`    | string   | `Hoa Don Thanh Toan`             |
| C    |                 | `pager`          | int      | `Pager: 13`                      |
| D    | Metadata        | `checkNo`        | int      | `Check: 174294`                  |
| D    |                 | `pos`            | string   | `POS01`                          |
| D    |                 | `datetime`       | string   | `15-10-2026 06:52`               |
| D    |                 | `cashier`        | string   | `Thu Ngan ca sang 1`             |
| E    | Items           | `items[]`        | array    | mỗi dòng item                    |
| E    |                 | `items[].discount` | number | dòng bắt đầu bằng `-`            |
| F    | Tổng kết        | `subtotal`       | number   | `Thanh tien: 100.200`            |
| F    |                 | `total`          | number   | `Tong tien: 100.200`             |
| G    | Thanh toán      | `payment`        | string   | `Payoo Bank Card`                |
| G    |                 | `paymentAmount`  | number   | `100.200`                        |
| H    | Khách hàng      | `customer`       | string   | `Nguyen Duy Khang`               |
| I    | Footer          | —                | —        | marketing + QR (bỏ qua)          |

## 3. Rule phân biệt ITEM vs DISCOUNT vs PAYMENT

Thứ tự kiểm tra trong `parseHighlandsItems` (dòng đã được `fixVietnamese` sửa):

1. **PAYMENT** — dòng khớp `payoo|bank card|visa|master|jcb|momo|zalopay|vnpay|
   shopeepay|napas|qr pay|chuyen khoan|ngan hang|tien mat|cash|the|card`
   → gán `payment` + `paymentAmount`, **không** phải món.
2. **DISCOUNT** — dòng bắt đầu bằng `-` (hoặc chứa `coupon|voucher|ecode|khuyen mai`)
   → gán `discount` (số âm) + `discountLabel` vào **item liền trước**, không tạo món mới.
   *Lưu ý:* "Giảm giá X" / "Chiết khấu X" đứng riêng (vùng F) là giảm giá cấp hoá đơn
   → `subtotal/total` xử lý, không gán vào item.
3. **ITEM** — dòng có số tiền, không phải label tổng kết (vùng F) và không thuộc
   metadata (vùng D: `check|pos|ngay|thu ngan|pager|shopid|sdt`) → món.

## 4. Hậu xử lý tiếng Việt (`VI_FIXES`)

Bảng sửa lỗi Tesseract thường gặp, áp dụng cho toàn văn trước khi parse (chuỗi dài
khớp trước để tránh sửa lệch). Ví dụ:

`Creck→Check`, `May→Ngay`, `Tae tim→Thanh tien`, `Tog tien→Tong tien`,
`Thu rean→Thu ngan`, `Xoyen Ouy Khang→Nguyen Duy Khang`,
`Payoo Bark Card→Payoo Bank Card`, `Matchadi Latte→Matcha Latte`, `Latte 0→Latte Da`,
`Ecoce Coupon giae→Ecode Coupon giam`, `Y tt→Banh Dua`, `Lon, TP.HN→Lon, TP.HCM`…

## 5. Kiểm thử

`assets/js/coffee/coffee.test.js` có test `parseHighlandsReceipt` chạy trên text OCR
thô đã cho và kỳ vọng: `checkNo=174294`, `datetime=15-10-2026 06:52`,
`cashier=Thu Ngan ca sang 1`,
`items=[{Matcha Latte Da L, 69.000, −13.800}, {Banh Dua, 45.000}]`,
`subtotal=total=100.200`, `payment=Payoo Bank Card`, `paymentAmount=100.200`,
`customer=Nguyen Duy Khang`.
