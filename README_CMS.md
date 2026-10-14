# BlogCo local CMS

Double-click `BlogCo CMS.command` (hoặc `run_cms.command`) để khởi động CMS và Hugo preview. Lần đầu, launcher tạo môi trường Python, cài dependencies và yêu cầu bạn nhập mã truy cập hai lần (không hiện ký tự khi gõ); `.env` lưu hash PBKDF2-SHA256 có salt cùng session secret ngẫu nhiên, quyền file `0600`. Mã truy cập không nằm trong mã nguồn.

Browser mở tại `http://127.0.0.1:5001/`. Đăng nhập, chọn **Viết bài mới**, soạn Markdown, lưu nháp hoặc chuẩn bị preview tại `http://127.0.0.1:1313/blogco/`. Chọn **Publish lên GitHub** để CMS stage đúng file bài viết và ảnh cover được gắn với bài, tạo commit cụ thể rồi push `main` lên `origin`.

CMS chỉ bind vào `127.0.0.1`, dùng cookie `HttpOnly`/`SameSite=Strict`, có giới hạn session 8 giờ và giới hạn thử đăng nhập. Publish dừng nếu branch không phải `main` hoặc index Git đã có file stage. Không dùng `git add .`; file `.env`, virtualenv và cache bị gitignore. Đóng Terminal sẽ dừng CMS và Hugo preview.

Yêu cầu: macOS, Python 3, Hugo Extended, Git đã xác thực với GitHub. Mã truy cập được thiết lập cục bộ ở lần chạy đầu và không được lưu trong repo.
