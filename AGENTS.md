# Agents.md — House Rules for BlogCo

Đây là quy tắc làm việc cho BlogCo. Luôn đọc file này trước khi sửa code. Tập trung đúng yêu cầu gốc, không mở rộng phạm vi hoặc overthinking ngoài task.

## 1. Kiến trúc và Tech Stack thực tế

- **Site framework:** Hugo Extended, yêu cầu tối thiểu `0.146.0` (`hugo.toml`).
- **Theme:** PaperMod, có override tại `layouts/` và `assets/`.
- **Frontend:** HTML partials của Hugo + vanilla JavaScript ES modules. Không dùng React, Next.js, Vue, Svelte hoặc Zustand trong runtime hiện tại.
- **Asset bundler:** Vite `7.3.7`.
- **CSS:** CSS custom theo design token; `assets/css/site.css` import Tailwind CSS `4.3.3` nhưng giao diện hiện tại chủ yếu dùng class CSS riêng, không có `tailwind.config.js` hoặc `globals.css`.
- **Runtime dependencies:** `fuse.js 7.5.0`, `highlight.js 11.12.0`, `marked 15.0.12`, `turndown 7.2.0`.
- **Asset scripts:**
  - `npm run build:assets` — build Vite, tạo bundle/manifest cho Hugo.
  - `npm test` — Node test runner cho các file `*.test.js` (giữ lại để tham khảo/CI nếu cần, không thuộc workflow local bắt buộc).
  - `npm run hash` — tạo hash cho passcode CMS.
- `ai/` là toolkit Node tùy chọn, tách khỏi static site. Không đưa API key của toolkit này vào bundle trình duyệt.
- Không tự ý thêm framework, thư viện, API trả phí hoặc backend mới nếu chưa được approve.

### Cấu trúc thư mục chính

```text
layouts/                 Hugo templates, base layout và partials
  baseof.html
  _partials/header.html  Navbar
  _partials/footer.html  Footer
  _partials/health/app.html
assets/css/              CSS nguồn, design tokens và module styles
assets/js/               ES modules theo feature
  health/                Y Học và Lịch sử khám bệnh
data/footer-links.yaml   Cấu hình link Footer
static/                  File tĩnh/public data
themes/PaperMod/         Theme upstream
```

CSS/JS được nạp qua `layouts/partials/extend_head.html` từ Vite manifest `static/assets/build/manifest.json`. Không sửa trực tiếp bundle đã build.

## 2. Layout, Navbar và Footer

- Layout gốc là `layouts/baseof.html`; thứ tự chung là Header → `main` → Footer.
- Navbar là Hugo partial `layouts/_partials/header.html`, không phải React component.
- Footer là Hugo partial `layouts/_partials/footer.html`; các link lấy từ `data/footer-links.yaml`. Thêm link mới bằng một object YAML, không hardcode lại trong markup nếu không cần.
- Navbar/Footer dùng chung nền xanh thương hiệu và các token `--blogco-*`.
- Health mega menu hiện tại:
  - Rộng tối đa khoảng `480px`, grid 2 cột desktop.
  - Không dùng tagline phụ.
  - Icon hiện dùng emoji/Unicode; không giả định có Lucide React.
- Không đổi cấu trúc layout gốc hoặc đường dẫn partial nếu chưa có sự đồng ý.

## 3. UI/UX Conventions

### Design tokens

Nguồn sự thật duy nhất là `assets/css/brand/brand-guidelines.css`:

- Primary: `#1428A0` — logo, tiêu đề chính, CTA toàn site.
- Primary hover: `#0F1F7A`.
- Accent sky: `#0689D8` — active state, progress bar, điểm nhấn.
- Accent background: `#E8F0FE`.
- Page background: `#FFFFFF`.
- Card background: `#F7F7F7`.
- Main text: `#000000`.
- Body text: `#75787B`.
- Muted text: `#A6A6A6`.
- Border: `#E6E6E6`.
- Font toàn site: `SamsungOne`, fallback `Helvetica Neue`, `Arial`, sans-serif.
- Display font: `Samsung Sharp Sans`, fallback system.
- Health palette: teal `#0D9488`, teal dark `#0F766E`, soft teal `#CCFBF1`, ink `#0F172A`, border `#D1E7E3`, danger `#B91C1C`, warning `#92400E`.

Không hardcode màu mới nếu token hiện có phù hợp. Nếu cần màu đặc thù của một card y khoa, giữ trong `assets/css/health/health.css` và dùng cho đúng ngữ nghĩa.

### Typography và spacing

- Body toàn site: `18px`, weight tối thiểu 500, line-height `1.6`.
- Navbar: `SamsungOne`, `14px`, weight 700, uppercase, letter-spacing khoảng `.06em`.
- Footer link: khoảng `13px`; footer meta: khoảng `12px`.
- Heading toàn site: H1 dùng `clamp(40px, 5vw, 64px)`, H2 khoảng `32px`, H3 khoảng `24px`, nhưng health screen có override H1 `1.7rem–2.5rem` và H2 `1.15rem`.
- Ưu tiên spacing theo `rem`, `clamp()` và token hiện có; không áp dụng máy móc `p-4/m-4` của Tailwind.
- Card phổ biến: border 1px, radius `12px–16px`, padding khoảng `1rem–1.25rem`.
- Health screen rộng tối đa khoảng `1040px`, padding dưới khoảng `4rem`.

### Icons và responsive

- Hiện chưa có thư viện icon chuẩn. Dùng inline SVG cho icon điều hướng đơn giản hoặc emoji/Unicode theo pattern hiện tại.
- Không thêm Lucide/Font Awesome chỉ để thay icon nhỏ nếu chưa được approve.
- Kích thước đang dùng: hamburger `22px`, icon health mega menu khoảng `14px`, icon mega menu chung khoảng `20px`.
- Navbar desktop từ `min-width: 1025px`; mobile/tablet dùng menu accordion từ `max-width: 1024px`.
- Footer chuyển thành cột ở `max-width: 767px`.
- Health: form/grid thường thu về 2 cột ở desktop, 1 cột ở `max-width: 767px`; một số bảng thống kê có breakpoint `860px`.
- Luôn kiểm tra overflow, focus-visible và trạng thái mobile khi thêm UI.

### Quy tắc component UI

- **Card:** dùng các class hiện có như `.health-card`, `.medical-info-card`, `.medical-result-card`; border mảnh, nền rõ, radius nhất quán.
- **Button:** dùng `.health-primary-button` cho hành động chính, `.health-secondary-button` hoặc `.health-ghost-button` cho hành động phụ; trạng thái disabled phải thể hiện rõ.
- **Badge/tag:** dùng dạng pill cho trạng thái, `commitId`, nội dung gốc và symptom tags; không đưa đoạn văn dài vào badge.
- **Dialog:** nếu cần dialog trong vanilla JS, dùng markup có `role="dialog"`, `aria-modal="true"`, heading liên kết bằng `aria-labelledby`, nút đóng/thoát rõ ràng và không thêm thư viện chỉ cho dialog.
- **Toast:** dùng pattern `[data-health-toast]`, `role="status"`, `aria-live="polite"`; lỗi phải có trạng thái `.is-error`.
- Không render raw user content bằng `innerHTML` nếu chưa qua `escapeHtml`.

## 4. Coding Conventions

- Dùng ES modules (`import`/`export`) và JavaScript hiện đại tương thích browser hiện tại.
- Component/view hiện tại là hàm render vanilla JS, ví dụ `renderMedicalInfographic`, `renderDataManagement`, `renderRecommendationPanel`; dùng named export theo pattern của module.
- Không tạo file `.tsx`/`.vue`/`.svelte` cho feature mới trong kiến trúc hiện tại.
- Tên file component/view dùng PascalCase khi codebase đã dùng pattern đó (`MedicalInfographic.js`, `DataManagement.js`, `RecommendationPanel.js`); helper/store dùng camelCase (`medical.js`, `github-sync.js`, `useMedicalRecords.js`).
- Tên Hugo partial giữ lowercase theo cấu trúc `layouts/_partials/`.
- Comment chỉ dành cho logic phức tạp, security, lifecycle hoặc lý do tương thích; không comment điều hiển nhiên.
- Tách logic khỏi markup khi có thể: config/footer ở `data/`, storage/API ở module helper, render/UI ở module view.
- Dùng `try/catch` cho Local Storage, Session Storage, JSON parse, file import và fetch. Không để lỗi làm treo route.
- Fallback UI phải là danh sách rỗng/thông báo thân thiện; không nuốt lỗi mà không cập nhật trạng thái.

## 5. Y Học: UI, state và Local Storage

### Các module chính

- `assets/js/health/main.js`: hash router, event delegation, render các tab Input/Search/Sync/Manage.
- `assets/js/health/MedicalInfographic.js`: structured data → symptom tags, medication checklist, treatment bullet points/collapse.
- `assets/js/health/DataManagement.js`: bảng quản lý, duplicate map và recommendation panel.
- `assets/js/health/RecommendationPanel.js`: hiển thị đề xuất giữ/xoá.
- `assets/js/health/useMedicalRecords.js`: adapter hook-like cho vanilla JS; không phải React hook. Nó load khi mount, lắng nghe `health:data-changed`/`storage`, cập nhật state sau xoá.
- Không có `useGitHubSync.js`; logic sync nằm ở `assets/js/health/github-sync.js` và orchestration ở `medical.js`/`main.js`.

### Hash route

- Route Y Học dùng hash, ví dụ `#/health/medical/input`, `#/health/medical/search`, `#/health/medical/sync`, `#/health/medical/manage`.
- Khi thêm route, cập nhật parser trong `routeName()` và `showRoute()` của `assets/js/health/main.js`.
- Phải xử lý được cả chuyển route bằng hash và truy cập trực tiếp/F5.

### Schema và key

State được lưu dưới dạng:

```js
{
  version: 1,
  nextId: 1,
  items: [{
    id, inputId, commitId, title, category,
    symptoms: [], treatment: '', relatedMedications: [],
    rawContent: '', createdAt: '', updatedAt: ''
  }]
}
```

- Local Storage chính: `blogco.health.medical.v1`.
- Backup Local Storage: `blogco.health.medical.backup.v1`.
- Seed marker: `blogco.health.medical.seeded.v1`; không seed lại sample sau khi người dùng đã xoá hết dữ liệu.
- Recommendation skip list: `blogco.health.medical.recommendation-skips.v1`.
- Mọi thao tác ghi/xoá phải cập nhật cả storage và state/render hiện tại. Sau khi ghi phát event `health:data-changed`.
- Dữ liệu hỏng hoặc JSON parse lỗi: reset state in-memory về `[]`, hiển thị toast lỗi, không để route treo.
- Không dùng IndexedDB hoặc Context khi chưa có yêu cầu/triển khai cụ thể.

### Duplicate và Recommendation

- `detectDuplicate`/`detectAllDuplicates` dùng độ tương đồng title bằng Levenshtein và symptoms bằng Jaccard; trọng số title `.6`, symptoms `.4` khi có symptoms.
- Ngưỡng trùng hiện tại là **lớn hơn 80%**.
- `generateRecommendations` gom các cặp liên thông thành cluster bằng union-find.
- Trong mỗi cluster, record có `createdAt` sớm nhất là `isOriginal: true`, gắn badge `📌 Gốc` và tuyệt đối không tự đưa vào danh sách xoá.
- Record nhập sau nằm trong `toDelete`; lý do phải nêu record gốc và độ tương đồng.
- Nếu người dùng chọn xoá record gốc, bắt buộc confirm cảnh báo rõ hành động không thể hoàn tác.

## 6. GitHub Sync và external API

- Static GitHub Pages không chạy API backend/serverless POST của project. Không gọi `/api/...` nội bộ từ frontend để xử lý Y Học.
- Extraction hiện tại chạy offline bằng `extractMedicalKnowledge()` từ nhãn và keyword; không gọi API AI trả phí trong static runtime.
- `syncToGitHub()` trong `assets/js/health/github-sync.js`:
  1. GET `repos/{owner}/{repo}/contents/{path}?ref={branch}` để lấy SHA nếu file tồn tại.
  2. PUT cùng endpoint với `Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2022-11-28`, `branch`, nội dung Base64 và `sha` khi update.
  3. Đọc `commit.sha`, rút gọn 7 ký tự thành `commitId`.
- `syncMedicalKnowledge()` lấy record mới nhất từ Local Storage, merge payload và đánh dấu `commitId` cho các item đã sync.
- Dữ liệu remote tra cứu là JSON public từ GitHub raw URL; không coi remote data là local write nếu chưa merge theo logic hiện có.
- GitHub PAT chỉ được lưu ở `sessionStorage` với key `blogco.health.github-sync.session.v1`; tuyệt đối không lưu token vào Local Storage, cookie, log hoặc repo.
- Không commit token, repo secret, passcode plaintext hoặc API key. Nếu credential bị lộ, phải revoke ngay.
- Với mọi fetch: kiểm tra `response.ok`, xử lý 401/403/404/409, lỗi mạng và hiển thị thông báo thân thiện. Không log PAT.
- Nếu sau này tích hợp AI/external API:
  - Không hardcode API key hoặc prompt dài trong component.
  - Tách prompt/config khỏi view.
  - Yêu cầu JSON structured theo schema, parse an toàn bằng `try/catch`.
  - Frontend render symptoms/medications dạng list/tag và treatment dạng bullet/collapse, không hiển thị raw text dài.
  - Chỉ dùng endpoint/backend được approve; xử lý CORS/405 đúng với hosting static.

## 7. Git và CI/CD Workflow

- **Quy trình:** Code → Commit → Push. Không chạy test local.
- Commit message theo Conventional Commits, ví dụ:
  - `feat: add medical management filter`
  - `fix: refresh records after deletion`
  - `docs: update agents rules`
- Chỉ stage file liên quan; không dùng `git add .` cho thay đổi không được rà soát.
- Không chạy `npm run lint`, `npm run build`, `npm run build:assets`, `npm run test` hoặc test local tương đương.
- Chỉ cần rà soát lỗi cú pháp rõ ràng bằng việc đọc code và tuân thủ convention trong file này; không thực hiện bước test/build local.
- Việc kiểm tra cuối cùng sẽ được thực hiện trực tiếp trên GitHub Pages sau khi push.
- AI Agent không được tự ý chạy `npm run lint` hoặc `npm run build` trừ khi người dùng yêu cầu rõ ràng.
- Push branch/commit sau khi hoàn tất theo yêu cầu công việc. Nếu push bị reject, fetch/rebase an toàn rồi push lại; không dùng destructive reset.
- Không có quy trình Pull Request riêng được định nghĩa trong repo. Nếu tạo PR, ghi rõ phạm vi thay đổi, kiểm tra đã chạy/chưa chạy và các giới hạn còn lại.

## 8. Quy tắc đặc thù bắt buộc

- Không suy nghĩ hoặc refactor lan man ngoài yêu cầu gốc.
- Không tự ý đổi Hugo/PaperMod sang Next.js/React hoặc đổi vanilla module thành component framework.
- Không tự ý thay đổi cấu trúc thư mục gốc, key storage, schema hoặc route đang dùng.
- Không tự ý thêm dependency mới nếu chưa được approve.
- Không hardcode API key, GitHub PAT, passcode plaintext hoặc prompt AI trong UI component.
- Ưu tiên giải pháp local-first, zero-cost và tương thích GitHub Pages.
- Mọi thay đổi dữ liệu phải có fallback, confirm cho thao tác xoá và thông báo UI phù hợp.
- Giữ accessibility cơ bản: label cho input, `aria-live` cho status/toast, focus-visible, keyboard navigation cho menu/dialog.

## 9. Cam kết tuân thủ

Mọi code mới phải tuân thủ các quy tắc trong file này. Khi kiến trúc, dependency, storage schema hoặc workflow thay đổi, cập nhật `Agents.md` trong cùng thay đổi hoặc ngay sau đó.
