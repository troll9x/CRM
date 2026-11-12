# COMMERCIAL-UX-01 — Chuẩn hóa trải nghiệm CRM

Ngày giao: 12/11/2026. Yêu cầu: tối ưu UI/UX theo hướng sản phẩm CRM thương mại. Lát cắt này tập trung khung ứng dụng, điều hướng và trải nghiệm dữ liệu; không xác nhận toàn bộ CRM đã đủ điều kiện thương mại hoặc thay đổi nghiệp vụ đã chốt.

## Phạm vi triển khai

- Khung giao diện mới: sidebar sáng có nhóm công việc và icon thống nhất; breadcrumb, menu tài khoản/đăng xuất, vùng nội dung, footer. Tiêu đề và nút nghiệp vụ của từng module được giữ; nút đăng xuất lặp lại trong module được thay bằng menu tài khoản chung.
- Menu chỉ liệt kê chức năng có quyền từ `/me`. Màn hình URL không được cấp quyền về chức năng đầu tiên được phép. Tài khoản chưa có quyền có màn hình hướng dẫn liên hệ quản trị thay vì gọi API tổng quan không được phép. Backend vẫn là lớp bảo vệ quyền.
- Mỗi màn hình có hash URL ổn định (`#customers`, `#orders`, `#staff`...), hỗ trợ tải lại và Back/Forward. Hash chỉ chứa tên module, không lưu dữ liệu hay credential.
- Tìm nhanh màn hình theo tên/từ khóa không dấu bằng nút tìm hoặc `Ctrl/Cmd+K`; native dialog có focus, Escape, phím mũi tên và Enter. Đây là tìm điều hướng, không giả làm tìm toàn bộ dữ liệu.
- Mobile có menu trượt, backdrop, khóa cuộn nền và giới hạn Tab trong menu khi mở. Thêm skip link và đưa focus về nội dung khi đổi module. Bố cục có breakpoint 960/700px; giảm chuyển động theo thiết lập hệ điều hành.
- Màu, chữ, khoảng cách, nút, input, card, bảng, badge, cảnh báo và trạng thái trống thống nhất qua `commercial.css`. Gỡ khối ép tất cả chữ bằng `!important` trước đây; giữ hỗ trợ tiếng Việt bằng font hệ thống. Không tải font/asset từ dịch vụ ngoài.
- Trang đăng nhập mới có hiện/ẩn mật khẩu, chống bấm lặp khi đang gửi, hướng dẫn tài khoản/quên mật khẩu đúng khả năng hiện tại. Không có nút đăng ký hoặc reset qua email giả.
- API 401 từ request nghiệp vụ đưa người dùng về đăng nhập với lời giải thích. Lỗi mật khẩu sai hoặc lần đầu mở `/me` không bị coi là phiên hết hạn. Workspace có error boundary với nút thử lại; không đưa stack lỗi ra UI.
- Danh sách khách hàng dùng cursor sẵn có để tải tiếp, hiển thị số hồ sơ đã tải, giữ bộ lọc đã áp dụng, loại ID trùng và bỏ response tìm kiếm cũ. Tạo/sửa khách chỉ hiện với `customers.write`.

## Tiêu chí nghiệm thu

1. Owner có menu đủ chức năng được cấp; nhân viên chỉ có mục hợp lệ; URL `#staff` từ sales không mở module quản trị. Tài khoản không role có hướng dẫn riêng.
2. Reload, Back/Forward, tìm không dấu, `Ctrl+K`, Escape/Enter và điều hướng điện thoại hoạt động. Người dùng bàn phím không bị kẹt focus; cơ chế in báo giá không in sidebar/topbar/dialog.
3. Các module giữ API thật, dữ liệu, tổng tiền, quyền và trạng thái nghiệp vụ. Không có số liệu/đơn/khách giả trên production.
4. Khách hàng trên 25 hồ sơ có tải tiếp theo cursor; đổi tìm kiếm không nối dữ liệu của bộ lọc cũ.
5. Kiểm tra lint/typecheck/unit/build, UTF-8; kiểm tra trực quan các viewport desktop/mobile và tương tác trình duyệt riêng.

## Giới hạn xác minh

Browser access host không sẵn sàng. Công cụ Windows chặn quan sát do không xác định chắc chắn URL hiện tại; đã dừng Computer Use. Bố cục trực quan, focus và thao tác form trên trình duyệt chưa được nghiệm thu; build/test không thay bằng chứng này.

Không đổi schema hoặc hợp đồng backend. Những phần Facebook/private reply còn dở trong workspace không thuộc release UI này.

## Bằng chứng kiểm tra code

- Worktree kiểm tra riêng trên nền `bfe2c07`, chỉ đưa source UI của lát cắt này vào; không mang các sửa Facebook/private reply chưa hoàn tất.
- `npm run lint`, build API/web và typecheck web đạt; API unit 62/62, web unit 17/17. Các test mới kiểm hash không vượt quyền, landing không role, quyền đổi trả, tìm không dấu và phân biệt hết phiên với sai mật khẩu/lần đầu mở ứng dụng. UTF-8 source đạt.
- Cấu hình root Turbopack rộng hơn chỉ dùng trong worktree kiểm tra để đọc dependency junction; cấu hình repo và VPS được giữ nguyên.
