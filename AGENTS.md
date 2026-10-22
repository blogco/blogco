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
  - `npm test` — Node test runner cho các file `*.test.js`.
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
- Navbar/Footer dùng chung token `--blogco-*`; Navbar là floating surface bo tròn, nền trắng trong suốt nhẹ và `backdrop-filter`, Footer là surface trắng có shadow mềm.
- Health mega menu hiện tại:
  - Rộng tối đa khoảng `480px`, grid 2 cột desktop.
  - Không dùng tagline phụ.
  - Menu dùng inline SVG phong cách Lucide, không dùng emoji/Unicode hoặc ảnh AI.
- Không đổi cấu trúc layout gốc hoặc đường dẫn partial nếu chưa có sự đồng ý.

## 3. UI/UX Conventions

Ngôn ngữ thiết kế hiện tại là corporate tối giản, hiện đại, tin cậy, lấy cảm hứng từ annual-report systems; không sao chép 100% giao diện hoặc nhận diện của thương hiệu bên ngoài.

### Design tokens

Nguồn sự thật duy nhất là `assets/css/brand/brand-guidelines.css`:

- Primary/text chính: `#111827`.
- Secondary/dark text: `#1F2937`.
- Accent emerald/mint: `#10B981` — active state, progress bar, số liệu và điểm nhấn.
- Accent mint nhạt: `#ECFDF5` — tag/badge và trạng thái active nhẹ.
- Accent/background phụ: `#F8F9FA`.
- Page background: `#FAFAFA`.
- Card background: `#FFFFFF`.
- Main text: `#111827`.
- Body text: `#374151`.
- Muted text: `#4B5563`.
- Border: `#E5E7EB`.
- Depth: card dùng `--blogco-shadow-soft`, hover dùng `--blogco-shadow-hover`, radius card `16px`, radius control `12px`.
- Font toàn site: `Inter`, fallback `Helvetica Neue`, `Arial`, sans-serif.
- Display font: `Inter`, fallback system.
- Health palette kế thừa mint/corporate tokens; danger/warning chỉ dùng cho trạng thái lỗi hoặc cảnh báo.

Không hardcode màu mới nếu token hiện có phù hợp. Nếu cần màu đặc thù của một card y khoa, giữ trong `assets/css/health/health.css` và dùng cho đúng ngữ nghĩa.

### Typography và spacing

- Body toàn site: `18px`, weight tối thiểu 500, line-height `1.6`, màu `#374151`.
- Navbar: `Inter`, `14px`, weight 700, uppercase, letter-spacing khoảng `.06em`.
- Footer link: khoảng `13px`; footer meta: khoảng `12px`.
- Heading toàn site: H1 dùng `clamp(40px, 5vw, 64px)`, H2 khoảng `32px`, H3 khoảng `24px`, nhưng health screen có override H1 `1.7rem–2.5rem` và H2 `1.15rem`.
- Ưu tiên spacing theo `rem`, `clamp()` và token hiện có; không áp dụng máy móc `p-4/m-4` của Tailwind.
- Card phổ biến: nền trắng, border 1px, radius `16px`, shadow mềm, padding khoảng `1.25rem–1.5rem`; hover nâng nhẹ tối đa `4px`.
- Health screen rộng tối đa khoảng `1040px`, padding dưới khoảng `4rem`.

### Icons và responsive

- Icon chuẩn là inline SVG theo phong cách Lucide trong `assets/js/icons.js` và các Hugo partial; không dùng icon ảnh, emoji hoặc icon AI cho UI.
- Không thêm React icon package vì runtime là vanilla JS; helper SVG dùng `currentColor`, stroke `1.75–2px`.
- Kích thước icon mặc định `16px–20px`, hamburger `22px`, icon health mega menu khoảng `18px`.
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
- `assets/js/health/MedicalInfographic.js`: structured data → mint data tags, medication checklist/accordion, treatment bullet points/collapse.
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
- Kho sản phẩm DB Thuốc là một feature riêng, dùng IndexedDB `blogco.medicine-db` (versioned) để giữ ảnh Blob và hồ sơ sản phẩm; không sửa/xóa Local Storage `blogco.thuoc.entries.v1` vì đó là lịch sử dùng thuốc hiện hữu.
- OCR bao bì có thể tái sử dụng `assets/js/health/ocr.js` chạy trên thiết bị. Dữ liệu tra cứu ngoài phải gắn nguồn và không được coi nhãn nước ngoài là xác minh sản phẩm Việt Nam; không tạo nội dung AI giả khi chưa có backend an toàn.
- Tra cứu DB Thuốc ưu tiên liên kết tìm kiếm web miễn phí và ghi chú nguồn do người dùng kiểm tra/lưu. Không phụ thuộc API thương mại hoặc giả định trang tĩnh có thể scrape trang ngoài qua CORS.

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
- `syncToGitHub()` trong `assets/js/health/github-sync.js` chỉ được dùng cho luồng **Local → GitHub**:
  1. Đọc payload hiện tại từ Local Storage và gửi `PUT` trực tiếp tới `repos/{owner}/{repo}/contents/{path}`.
  2. Gửi `Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2022-11-28`, `branch`, nội dung Base64 và `sha` đã biết khi update.
  3. Không được gọi `GET`, merge hoặc tải dữ liệu remote trong luồng sync; nếu thiếu SHA của file cũ, báo người dùng dùng nút khôi phục riêng.
  4. Đọc `commit.sha`, rút gọn 7 ký tự thành `commitId` và lưu SHA file trong session để lần PUT sau cập nhật đúng file.
- `syncMedicalKnowledge()` chỉ lấy record mới nhất từ Local Storage, ghi đè toàn bộ file GitHub bằng dữ liệu local và đánh dấu `commitId` cho item đã sync. Nếu PUT thất bại, không được thay đổi dữ liệu local.
- `pullFromGitHub()`/`pullMedicalKnowledge()` là luồng **GitHub → Local** riêng, chỉ gọi `GET` khi người dùng bấm “Khôi phục từ GitHub” và xác nhận cảnh báo ghi đè toàn bộ Local Storage. GET phải có cache-busting và parse JSON an toàn.
- Trang Tra cứu luôn đọc lại Local Storage khi render/tìm kiếm; không dùng danh sách remote hoặc search index tĩnh có thể giữ record đã xoá.
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

- Mặc định triển khai theo yêu cầu trực tiếp của người dùng đến khi hoàn tất; không dừng ở đề xuất hoặc hỏi lại xác nhận cho các bước triển khai thông thường.
- Khi người dùng yêu cầu hoàn tất và push, thực hiện kiểm tra phù hợp, rà soát diff, commit các file thuộc task và push branch hiện tại. Không stage thay đổi có sẵn hoặc không liên quan; không dùng `git add .`.
- Nếu người dùng yêu cầu test/build/nghiệm thu, chạy đúng các kiểm tra liên quan và báo kết quả thực tế. Không tuyên bố đã kiểm tra nếu chưa chạy.

- **Quy trình:** Code → kiểm tra theo task → Commit → Push khi task/người dùng yêu cầu.
- Commit message theo Conventional Commits, ví dụ:
  - `feat: add medical management filter`
  - `fix: refresh records after deletion`
  - `docs: update agents rules`
- Chỉ stage file liên quan; không dùng `git add .` cho thay đổi không được rà soát.
- Không tự ý chạy lint/build/test trong task thông thường nếu người dùng không yêu cầu.
- Khi người dùng yêu cầu test/build, chạy các lệnh liên quan và báo chính xác những gì đã chạy, kết quả và giới hạn.
- Việc kiểm tra cuối cùng sẽ được thực hiện trực tiếp trên GitHub Pages sau khi push.
- Nếu người dùng yêu cầu triển khai và push, commit/push sau khi hoàn tất và kiểm tra. Nếu push bị reject, fetch/rebase an toàn rồi push lại; không dùng destructive reset.
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
