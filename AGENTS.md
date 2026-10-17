# Agents.md - House Rules for BlogCo

## 1. Tech Stack & Architecture
- Framework: Next.js 14 (App Router) + Tailwind CSS.
- State management: Zustand.
- Không tự ý thêm thư viện mới nếu chưa được approve.

## 2. UI/UX Rules (Quan trọng cho task Dropdown vừa rồi)
- **Dropdowns:** Chiều rộng tối đa 500px, padding 16px. Không dùng tagline phụ trong menu. Font chữ menu: 14px (semibold).
- **Icons:** Sử dụng Lucide React, size 16px.
- **Màu sắc:** Tuân thủ bảng màu trong `tailwind.config.js` (Primary: #1e3a8a).

## 3. Coding Conventions
- Component: Dùng Functional Component, export default.
- Tên file: PascalCase cho components (VD: `HealthMenu.tsx`), camelCase cho utils.
- Comment: Chỉ comment những đoạn logic phức tạp.

## 4. Git & CI/CD Workflow
- Trước khi push: Bắt buộc chạy `npm run lint` và `npm run build` để check lỗi.
- Commit message: Tuân theo Conventional Commits (VD: `feat: update health dropdown UI`).
