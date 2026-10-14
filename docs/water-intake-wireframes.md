# Water Intake Insights — ASCII wireframes

Các số liệu trong khung là ví dụ minh hoạ giao diện, không phải khuyến nghị hay dữ liệu người dùng. Bản chạy thật bắt đầu ở trạng thái rỗng. Tính năng chỉ ghi đồ uống, không chẩn đoán tình trạng cơ thể; nhật ký được lưu trên trình duyệt và không gửi tới AI/dịch vụ bên ngoài.

## 1. Dashboard

```text
+----------------------------------------------------------------+
| [BlogCo] Trang chủ  Bài viết  Sức khoẻ v  [Ghi đồ uống] [sáng/tối]|
+----------------------------------------------------------------+
| HÔM NAY · ngày hiện tại                                         |
| +------------------------------------------------------------+ |
| | WATER INTAKE INSIGHTS                                      | |
| |       ( vòng tiến độ )     0 / mục tiêu tuỳ chọn ml         | |
| |                             [ thanh tiến độ ]               | |
| | Chỉ là tỷ lệ ghi nhận, không phải phép đo y tế.              | |
| | [ + Ghi đồ uống ] [ Tra cứu ]                               | |
| +------------------------------------------------------------+ |
| +-------------------------------+ +--------------------------+ |
| | Insights theo quy tắc cục bộ  | | Ghi nhận gần đây         | |
| | Gợi ý trung tính, không kê đơn| | Chưa có dữ liệu          | |
| +-------------------------------+ +--------------------------+ |
| Lưu trên thiết bị · Không thay thế tư vấn y tế                  |
+----------------------------------------------------------------+
```

## 2. Form ghi đồ uống

```text
+----------------------------------------------------------------+
| <- Quay lại                 GHI ĐỒ UỐNG                         |
+----------------------------------------------------------------+
| Ngày * [ yyyy-mm-dd ]      Giờ * [ hh:mm ]                      |
| Lượng (ml) * [ 250 ]       [150] [200] [250] [300] [500]        |
| Loại [Nước lọc v]          (trà / cà phê / nước trái cây / ...) |
| Ghi chú (tuỳ chọn) [________________________________________]   |
| +------------------------------------------------------------+ |
| | XEM TRƯỚC: ID #WTR-001 · ngày · giờ · 250 ml                | |
| +------------------------------------------------------------+ |
| [ Huỷ ]                                          [ Lưu dữ liệu ]|
+----------------------------------------------------------------+
| Toast sau lưu: Đã lưu #WTR-001 · 250 ml                         |
+----------------------------------------------------------------+
```

## 3. Tra cứu

```text
+----------------------------------------------------------------+
| <- Quay lại                 TRA CỨU ĐỒ UỐNG                     |
+----------------------------------------------------------------+
| Tìm theo: (•) ID  ( ) Ngày  ( ) Khoảng ngày                     |
| [ #WTR-001, WTR-002 __________________ ] [ Tìm kiếm ]            |
| Từ ngày [____]  Đến ngày [____]                                  |
+----------------------------------------------------------------+
| KẾT QUẢ · sắp xếp theo giờ                                     |
| #WTR-001 · ngày · hh:mm · 250 ml · Nước lọc                     |
| Số lần: 1  | Tổng: 250 ml | Trung bình: 250 ml                  |
| [ Xem Insights ] [ Xuất CSV ] [ Tải JSON ]                       |
+----------------------------------------------------------------+
```

## 4. Insights

```text
+----------------------------------------------------------------+
| <- Quay lại                 INSIGHTS UỐNG NƯỚC                   |
+----------------------------------------------------------------+
| HYDRATION SCORE · tỷ lệ mục tiêu nhắc nhở: 0 / 100              |
| Đã ghi 0 ml / mục tiêu tuỳ chọn · không phải đánh giá y tế      |
+----------------------------------------------------------------+
| Điểm tốt                      | Cần lưu ý / Gợi ý theo nhật ký   |
| Gợi ý rule-based, không gọi API AI                               |
+----------------------------------------------------------------+
| Nhóm đồ uống hôm nay: trung tính/tích cực · cần xem thành phần  |
| Thành phần đã nhập: đường · caffeine · cồn · năng lượng         |
| Cảnh báo tham khảo dựa trên số bạn tự nhập, không tự đoán       |
+----------------------------------------------------------------+
| Gợi ý nhẹ nhàng · [Bật nhắc mỗi 90 phút]                         |
| 7 ngày gần nhất: biểu đồ + thanh tiến độ từng ngày              |
+----------------------------------------------------------------+
| Mục tiêu tuỳ chỉnh [____] ml · hồ sơ tuỳ chọn (thai kỳ/cho bú)  |
| Nguồn: National Academies · CDC · Mayo · WHO · FDA · ACOG · Vinmec |
+----------------------------------------------------------------+
```

## 5. Navbar

```text
+----------------------------------------------------------------+
| [BlogCo] [Trang chủ] [Bài viết] [Kiến thức] [Insights] [＋ Ghi đồ uống]|
+----------------------------------------------------------------+
| Hash routes: #/water · #/water/add · #/water/search              |
|             #/water/insights                                     |
+----------------------------------------------------------------+
```

Các trang cũng có URL tĩnh `/blogco/water/`, `/blogco/water/add/`, `/blogco/water/search/`, `/blogco/water/insights/` để mở/reload trực tiếp trên GitHub Pages.

## Ghi chú an toàn

- Điểm số chỉ là tỷ lệ hoàn thành mục tiêu do người dùng chọn, không phải “điểm hydration”. Công thức theo cân nặng trong demo không được trình bày như chuẩn y khoa.
- Mức tham khảo 3,7 L/2,7 L của National Academies bao gồm nước từ đồ uống và thực phẩm, không phải yêu cầu uống từng ấy nước lọc.
- Mọi dữ liệu cá nhân giữ trong LocalStorage; không nhúng API key hay gọi OpenAI/Gemini từ trình duyệt tĩnh.
