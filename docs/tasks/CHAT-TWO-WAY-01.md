# CHAT-TWO-WAY-01 — Tin nhắn hai phía và quyền trả lời Fanpage

## Dữ liệu, vai trò và bất biến

Chủ dự án báo thiếu tin phía người trả lời và hỏi có cần đăng nhập Facebook khi vào chat. Đầu vào là webhook/history được Meta cấp quyền, tin DB và capability của từng Page/hội thoại. Đầu ra là timeline hai phía và hành động cấp lại quyền khi cần; không tạo tin giả hoặc gửi tin thử cho khách thật.

Người quản trị cấp quyền Page qua OAuth một lần; nhân viên dùng phiên CRM, cần quyền vai trò và grant xem/gửi trên Page. Token lưu mã hóa server; UI không nhận token hoặc mật khẩu Facebook. Giữ điều kiện recipient, assignment, cửa sổ phản hồi và idempotency backend. Không gửi dưới danh tính Facebook cá nhân của nhân viên.

## Chẩn đoán và thay đổi

- Trước sửa, truy vấn tổng hợp VPS: 27 `INBOUND`, không có `OUTBOUND_ECHO`, không có outbound intent. Cả hai Page có `pages_messaging` và tác vụ `MESSAGING`; Page subscription chỉ có `messages,feed`. App-level subscription active và đã có `message_echoes`.
- Sửa OAuth client đăng ký `messages,message_echoes,feed` và bắt buộc đọc lại đủ field cho đúng app. Hai Page đang chạy đã được bổ sung echo và Graph GET readback trả đủ cả ba field (POST/GET 200). Không thay scope consent hoặc các field app-level khác.
- UI trước đó so sánh `OUTBOUND`, trong khi enum DB là `OUTBOUND_ECHO`; sửa thành bubble Page, có test hiển thị phân biệt khách/Page/system. Bỏ nhãn nguồn “Webhook” sai cho mọi tin chưa có import job.
- Khi mở lại hội thoại luôn tải lại thay vì giữ cache vô hạn. Khi đang mở chat, đọc dữ liệu CRM mỗi 10 giây, chỉ khi tab trình duyệt visible; không poll Graph từ browser. Abort/cleanup khi đổi hội thoại/module, giữ tin đã tải và cursor khi các trang chồng nhau; nếu không còn chồng trang thì dùng cursor của trang mới để tránh khoảng hổng bị giấu.
- Khi capability báo cần kết nối lại/thiếu quyền, quản trị có nút cấp lại quyền ngay tại ô chat. Không tự mở Facebook khi xem tin và không coi cấp lại quyền là cách vượt cửa sổ phản hồi.

## Nhập bù có giới hạn

Đã tạo hai tác vụ MESSAGES cho khoảng UTC `2026-10-13T15:49:25.734Z` đến `2026-11-12T15:49:25.734Z`, bắt đầu 50 trang/Page, qua service hiện có với checkpoint/unique key. Tác vụ thứ hai hoàn tất 6 trang, không có tin mới. Tác vụ thứ nhất đạt giới hạn 50 trang: 56 tin thêm, 27 trùng, không lỗi; đã tăng thêm 50 trang qua service để tiếp tục. Tại checkpoint đó DB có 54 tin Page, 29 tin khách. Đây là nhập lịch sử, chưa chứng minh echo realtime mới hoặc tin đã tới thiết bị khách.

Không chạy migration hoặc seed production, không in nội dung tin/UID/token vào bằng chứng. Dữ liệu chỉ được thêm qua importer, không xóa lịch sử.

## Kiểm tra

- Node 24.18.0: typecheck/lint/build API/contracts/web đạt trên worktree nền `e8c6e32`, giữ riêng private reply/comment đang dở.
- Unit API 64/64, web 22/22; OAuth Facebook/Zalo E2E mock 11/11 trên PostgreSQL 17.6 scratch với 34 migration. E2E kiểm state/tenant/actor và reconnect; unit mới kiểm readback thiếu echo không được chấp nhận.
- Browser access vẫn không sẵn sàng; chưa nghiệm thu trực quan hoặc gửi/nhận thật từ CRM. Việc đọc quyền/subscription thật và nhập bù được ghi riêng với các test mock.

## Cách dùng

Kết nối Facebook ở mục Kết nối → chủ Page đăng nhập/cấp quyền → chọn Page → cấp quyền nhân viên trên Page. Sau đó nhân viên mở Hộp thư và trả lời dưới tên Fanpage. Chỉ bấm Cấp lại quyền Facebook khi CRM báo token/quyền cần bổ sung. Nếu quá cửa sổ phản hồi, cần khách nhắn lại; không yêu cầu đăng nhập Facebook để xử lý lỗi này.


## Kết quả cuối và triển khai — 12/11/2026

- Nhập bù Page thứ nhất dừng ở giới hạn mở rộng 110 trang, còn 21 task trong checkpoint và root chưa quét hết: 444 record fetched, 74 conversation discovered, 56 message inserted, 27 duplicate, 314 skipped, 0 failed. Page thứ hai SUCCEEDED sau 6 trang và không thêm tin. DB cuối kiểm tra: 54 OUTBOUND_ECHO, 29 INBOUND. Không coi đây là toàn bộ lịch sử 30 ngày; có thể tiếp tục bằng mở rộng quota ở nhật ký đồng bộ, giữ checkpoint/chống trùng.
- Release `003d161` đã push/build/deploy API và web với image `sha256:1a188ca3905518e7357cf48b14ef495e9f085017d97399f666bda2bb78cc3962`, tag `son-crm-app:release-003d161`. Hai container running, API healthy. Image trước giữ ở `son-crm-app:rollback-before-chat-two-way`.
- Public `/` và readiness 200; 10 JS/CSS assets đều 200, JS có direction OUTBOUND_ECHO và nút cấp lại quyền mới; inbox chưa đăng nhập trả 401. HTTP/assets không thay nghiệm thu thao tác trình duyệt hoặc xác nhận gửi/nhận live.
- Nếu cần rollback: tại `/srv/son-crm`, tag `son-crm-app:rollback-before-chat-two-way` thành `son-crm-app:production`, dùng compose production `up -d --no-build --no-deps --wait api web`, rồi kiểm readiness và assets. Rollback image không xóa dữ liệu đã nhập hoặc thay subscription echo đã được Meta xác nhận.
