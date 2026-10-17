# Rollback — BlogCo Branding

Design system hiện tại: **Samsung Corporate** (Immersive · Dynamic · Distinctive).
Single source of truth: `assets/css/brand/brand-guidelines.css` (khối `:root` với các
biến `--blogco-*`) và `assets/js/brand/main.js` (dữ liệu hiển thị trên trang
`#/brand-guidelines`).

## Quay lại phong cách Ericsson (bản cũ)

Chỉ cần đổi các giá trị trong khối `:root` của
`assets/css/brand/brand-guidelines.css` về bảng dưới, và cập nhật tương ứng
`COLOR_TOKENS` / `CSS_TOKENS` trong `assets/js/brand/main.js`:

| Token | Giá trị cũ |
| --- | --- |
| `--blogco-primary` | `#002561` |
| `--blogco-primary-hover` | `#001b46` |
| `--blogco-accent-sky` | `#0082f0` |
| `--blogco-accent-bg` | `#EAF3FE` |
| `--blogco-bg` | `#F4F8FC` |
| `--blogco-card-bg` | `#FFFFFF` |
| `--blogco-text-main` | `#002561` |
| `--blogco-text-body` | `#33475B` |
| `--blogco-text-muted` | `#5B6B7F` |
| `--blogco-border` | `#D5E3F0` |
| `--blogco-font-family` | `'Inter', 'Helvetica Neue', system-ui, sans-serif` |

Toàn bộ module (`brand.css`, `water.css`, `health.css`, `coffee.css`, `thuoc.css`,
`blog.css`, `auth.css`, `table.css`) đều dùng `var(--blogco-*)` nên tự động đổi theo.

## Cách khác: dùng Git

```bash
git log --oneline -- assets/css/brand/brand-guidelines.css
git revert <commit-hash>
```
