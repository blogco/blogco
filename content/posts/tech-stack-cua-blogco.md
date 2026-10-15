---
title: "BlogCo chạy bằng gì? Bóc tách toàn bộ tech stack"
date: 2026-10-15T04:43:00.000Z
draft: false
cover:
  image: "https://picsum.photos/seed/tech-stack-cua-blogco/1200/630"
  alt: "Tech stack của BlogCo"
  caption: "BlogCo — tất cả chỉ là file tĩnh, nhưng làm được rất nhiều thứ"
---

![BlogCo chạy bằng gì?](https://picsum.photos/seed/tech-stack-cua-blogco/1200/630)

BlogCo nhìn thì đơn giản: một trang blog. Nhưng phía sau nó là **một static site chạy không có backend, không database, không server** — vậy mà vẫn có trình soạn thảo, đăng bài trực tiếp lên GitHub, quản lý bài viết, theo dõi sức khoẻ, đo lượng nước, ghi chi phí… Tất cả nằm gọn trong vài file tĩnh.

Bài này mình "nổ" một chút: bóc tách xem BlogCo đang chạy bằng gì và tại sao kiến trúc này lại thú vị.

## 1\. Kiến trúc tổng quan

Luồng hoạt động cực kỳ đơn giản — **không có máy chủ nào ở giữa**:

```text
Người viết (trình duyệt)
        │  GitHub Contents API (PUT/DELETE)
        ▼
   Repo blogco/blogco  ──push──►  GitHub Actions
        │                              │
        │                         Hugo build + Vite
        ▼                              ▼
   Markdown (content/posts)      GitHub Pages (HTML/CSS/JS tĩnh)
```

- **Không backend, không database.** Dữ liệu nằm ở hai nơi: **file Markdown trong Git** và **localStorage trong máy người dùng**.
- **Không runtime framework.** Toàn bộ giao diện là **HTML + CSS + JavaScript thuần (ES Modules)**.
- Trang chỉ là file tĩnh, nên tải nhanh, bảo mật đơn giản, và gần như không tốn chi phí vận hành.

## 2\. Tech stack chi tiết

| Lớp | Công nghệ | Vai trò |
| --- | --- | --- |
| Ngôn ngữ | HTML, CSS, JavaScript (ES Modules) | Không framework, không runtime |
| CSS | Tailwind CSS 4 + design tokens riêng | Giao diện, theme sáng |
| Static site generator | Hugo 0.163.1 (extended) | Sinh trang từ Markdown cực nhanh |
| Theme | PaperMod (đã tuỳ biến) | Bố cục, RSS, SEO |
| Build assets | Vite 7 | Bundle + hash tên file (cache-busting) |
| Markdown | Goldmark (`unsafe = false`) | Render an toàn, chặn HTML thô |
| Xem trước | marked 15 | Render preview trong editor |
| HTML → Markdown | Turndown 7 | Editor rich-text lưu ra Markdown |
| Tô màu code | highlight.js | Syntax highlighting |
| Tìm kiếm | Fuse.js | Tìm kiếm phía client |
| Kiểm thử | Node `node --test` | Hơn 100 test, không cần framework |
| Máy chủ | GitHub Pages | Tĩnh, nhanh, miễn phí |
| CI/CD | GitHub Actions | Build + deploy mỗi lần push |
| "CMS" | GitHub Contents API | Thay thế backend |

> Điểm đáng chú ý: BlogCo **không có API server riêng**. Việc "đăng bài" thực chất là gọi **GitHub Contents API** để tạo commit — nên mỗi bài viết là một commit có lịch sử, review và rollback đầy đủ.

## 3\. Những "app con" trong một trang tĩnh

Đây mới là phần đáng nổ. Tất cả đều là **SPA điều hướng bằng hash (`#/…`)** và được **code-split** — chỉ tải khi cần:

| Ứng dụng | Route | Chức năng chính |
| --- | --- | --- |
| Blog Studio | `#/blog`, `#/blog/new` | Soạn / sửa / xoá bài, upload ảnh, AI hỗ trợ |
| Theo dõi nước | `#/water` | Ghi lượng nước, biểu đồ, insights |
| Sức khoẻ & tiêm chủng | `#/health` | Sổ khám bệnh, lịch tiêm, mã ICD, OCR |
| Chi phí | `#/coffee` | Quản lý chi tiêu, thống kê, dự báo |
| Brand | `#/brand` | Hệ thống nhận diện thương hiệu |

Mỗi app là một nhóm module JS riêng, dùng **localStorage** làm kho dữ liệu cá nhân — nghĩa là dữ liệu của bạn ở lại trên máy bạn, không đi đâu cả.

## 4\. Blog Studio — "CMS không server"

Trình soạn thảo là phần thú vị nhất về mặt kỹ thuật:

- **Editor rich-text** xây trên `contenteditable`, nhưng khi lưu sẽ chuyển toàn bộ HTML sang **Markdown sạch** bằng Turndown — kèm rule riêng để ảnh thành **shortcode `figure`** của Hugo (giữ căn lề và chú thích).
- **Chèn & chỉnh ảnh tại chỗ:** hover ảnh để căn trái / giữa / tràn lề, thêm chú thích hoặc xoá.
- **Ảnh đại diện linh hoạt:** tải lên từ máy (commit vào `static/uploads`) hoặc lấy ảnh stock (Unsplash / Pexels / ảnh minh hoạ seed theo slug).
- **Bộ đếm từ / ký tự** theo thời gian thực với hạn mức 50.000 từ.
- **Chấm điểm AI:** một bộ phân tích heuristic chạy offline, chấm điểm bài viết theo bố cục, cấu trúc và độ dễ đọc.
- **📊 Tạo bảng bằng AI:** bôi đen một đoạn văn bản thô → chuyển thành **bảng Markdown** chuẩn (gọi Gemini / OpenAI nếu có API key, hoặc dùng bộ chuyển cục bộ khi không có mạng).
- **Quản lý bài viết:** sửa và xoá bài đã đăng trực tiếp trên GitHub, danh sách cập nhật ngay lập tức.

Toàn bộ diễn ra trong trình duyệt. Đăng bài = tạo commit. Xoá bài = tạo commit xoá. Git chính là "audit log".

## 5\. CI/CD: push là xong

Mỗi lần có commit mới lên nhánh `main`, GitHub Actions sẽ tự động:

1. `npm ci` — cài đúng phiên bản phụ thuộc.
2. `npm run build:assets` — Vite bundle & hash toàn bộ JS/CSS.
3. `hugo --gc --minify` — sinh site tĩnh.
4. Upload artifact và deploy lên **GitHub Pages**.

Tên file đã được **hash theo nội dung**, nên trình duyệt luôn lấy đúng bản mới mà không bị cache cũ — một cải tiến nhỏ nhưng cứu rất nhiều lần "sao sửa rồi mà không thấy đổi".

## 6\. Chất lượng & kiểm thử

Site dùng **trình chạy test có sẵn của Node** (`node --test`) — không cần Jest, không cần cấu hình nặng. Các phần logic thuần (chấm điểm, chuyển bảng, xử lý Markdown, phân tích chi phí, tính toán sức khoẻ…) đều được phủ test:

```bash
npm test   # ✔ 112/112 test pass
```

Giữ logic **thuần (pure)**, tách khỏi DOM, giúp test nhanh và refactor an toàn.

## 7\. Bảo mật & quyền riêng tư

- **Không có server để tấn công.** Không có endpoint, không có database tập trung.
- **Token GitHub** chỉ lưu trong `localStorage` của người dùng, không commit lên repo.
- Các module cá nhân (`#/water`, `#/health`, `#/coffee`) có **khoá bằng mật khẩu phía client** (chỉ lưu **hash SHA-256**, không lưu mật khẩu gốc). Đây là "cổng tiện dụng", không phải bảo mật cấp server — và BlogCo nói rõ điều đó.

## 8\. Vì sao kiến trúc này hay?

- **Đơn giản tới mức khó tin:** không VPS, không container, không hoá đơn dịch vụ.
- **Nhanh:** trang tĩnh + CDN của GitHub Pages, thời gian tải gần như tức thì.
- **Minh bạch:** mọi thay đổi nội dung đều là commit, có thể xem lại, so sánh, khôi phục.
- **Riêng tư:** dữ liệu cá nhân nằm trên máy người dùng.
- **Rẻ:** chạy hoàn toàn trên hạ tầng miễn phí.

## Kết

BlogCo là minh chứng cho một ý tưởng: **bạn không cần backend để làm được những thứ "ra dáng có backend"**. Một generator tĩnh, một API để commit, và một chút khéo léo ở tầng trình duyệt — vậy là đủ cho cả blog, trình soạn thảo, và mấy app cá nhân nho nhỏ.

Còn bạn, stack của bạn đang chạy bằng gì? 🚀
