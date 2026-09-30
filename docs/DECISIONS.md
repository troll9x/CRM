# Nhật ký quyết định

## 1. Quyết định đã chốt ở mức kiến trúc

| ID      | Trạng thái | Quyết định                                                                                                                                               | Lý do/hệ quả                                                                           |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ADR-001 | Accepted   | Modular monolith, chưa dùng microservices                                                                                                                | Giao dịch kho/tiền đơn giản hơn; vẫn chia module và owner rõ                           |
| ADR-002 | Accepted   | Next.js + React + TypeScript cho web; NestJS + TypeScript cho API                                                                                        | Một ngôn ngữ, hợp đồng có kiểu; phiên bản cụ thể khóa ở Đợt 01                         |
| ADR-003 | Accepted   | PostgreSQL + Prisma; migration tăng dần                                                                                                                  | Ràng buộc/giao dịch mạnh; không tạo toàn schema ngay                                   |
| ADR-004 | Accepted   | REST `/api/v1` + OpenAPI                                                                                                                                 | CRM, website và đối tác dùng cùng backend; contract test từ Đợt 01                     |
| ADR-005 | Accepted   | Redis/BullMQ chỉ thêm từ đợt cần job/connector                                                                                                           | Không thêm vận hành sớm; phải có retry/dead-letter/quan sát khi dùng                   |
| ADR-006 | Accepted   | UTC khi lưu, `Asia/Ho_Chi_Minh` khi xác định ngày báo cáo; VND số nguyên                                                                                 | Tránh lệch ngày và sai số tiền                                                         |
| ADR-007 | Accepted   | Snapshot chứng từ + sổ biến động; projection không thay sổ                                                                                               | Lịch sử không đổi và số tổng truy ngược được                                           |
| ADR-008 | Accepted   | Prototype Đợt 00 là tĩnh, gắn nhãn dữ liệu mẫu                                                                                                           | Xác nhận UX mà không giả là nghiệp vụ đã hoạt động                                     |
| ADR-009 | Accepted   | Node.js 24 LTS, Next.js 16.3.7, NestJS 12.1.2, PostgreSQL 17.6 và Prisma 7.10.0 cho Đợt 01                                                               | Khóa phiên bản bằng lockfile/container; Node 25 local không thuộc dải hỗ trợ của dự án |
| ADR-010 | Accepted   | Phiên nhân viên lưu phía server; trình duyệt chỉ giữ cookie `HttpOnly`, `SameSite=Lax`; token lưu DB dưới dạng SHA-256 và request ghi bị kiểm tra origin | Có thể thu hồi/khóa phiên, không lộ token cho JavaScript và giảm rủi ro CSRF           |

### Ghi chú phụ thuộc Đợt 01

`npm audit` ngày 2026-09-30 còn báo 4 cảnh báo mức high trong cây công cụ Prisma CLI (`deepmerge-ts`/`mysql2`). Phương án tự động duy nhất hiện được npm đề xuất là hạ Prisma xuống major 6, nên chưa dùng `--force` vì sẽ phá vỡ ADR-009 và cấu hình Prisma 7. Cần kiểm tra lại khi Prisma phát hành bản ổn định có cây phụ thuộc đã sửa; không xem cảnh báo này là đã xử lý.

## 2. Quy ước tạm dùng

Các mục sau đủ để viết tài liệu/prototype nhưng **không tự động trở thành cấu hình production**: một đơn vị kinh doanh, một kho; báo giá không giữ hàng; giá vốn bình quân gia quyền; giá sỉ theo nhóm/bậc; vận đơn nhập tay; AI chỉ gợi ý có duyệt.

## 3. Năm quyết định cần chủ dự án xác nhận trước Đợt 01–06

Không thêm câu hỏi chặn mới vào danh sách này; câu hỏi phát sinh phải gộp vào mục phù hợp hoặc đưa sang backlog của đợt sau.

### OPEN-01 — Kênh bán thực tế và tài khoản có thể thử

- Cần trả lời: Facebook đang dùng Fanpage hay tài khoản cá nhân, có bao nhiêu Page? Zalo đang dùng OA hay tài khoản cá nhân? Kênh nào phải làm trước sau bản nội bộ?
- Tạm dùng: thiết kế connector cho một Fanpage và một Zalo OA; vẫn nhập khách/đơn thủ công.
- Ảnh hưởng: khả năng tích hợp chính thức, định danh khách, quyền app, webhook, thời gian xét duyệt.
- Không tự làm: không dùng cách tự động hóa tài khoản cá nhân và không tuyên bố đã tích hợp khi chưa có test API thật.

### OPEN-02 — Ngành hàng, SKU và cách quản lý đơn vị/lô

- Cần trả lời: bán mặt hàng gì, khoảng bao nhiêu SKU, dùng cái/hộp/thùng hay cân nặng, có màu/size, hạn dùng, lô hoặc serial không?
- Tạm dùng: hàng có sẵn; SKU biến thể; một đơn vị cơ sở và quy đổi cái/hộp/thùng; không lô/hạn dùng/serial.
- Ảnh hưởng: precision số lượng, schema kho, kiểm kê, giá vốn, quy trình trả hàng và vận chuyển.

### OPEN-03 — Chính sách giá sỉ và giảm giá

- Cần trả lời: giá sỉ theo từng SKU, nhóm/đại lý, tổng đơn hay thương lượng? Bậc số lượng tính theo một SKU hay cộng nhóm? Ai được giảm tối đa bao nhiêu?
- Tạm dùng: giá riêng khách → bảng giá nhóm → bậc theo SKU → giá mặc định; không cộng dồn.
- Ảnh hưởng: PriceRule, báo giá, quyền duyệt, bộ test ranh giới 9/10/11.

### OPEN-04 — Chính sách mua nợ

- Cần trả lời: khách nào được nợ, hạn mức, kỳ hạn, mốc phát sinh phải thu và ai duyệt vượt hạn mức?
- Tạm dùng: mặc định không cho nợ; chỉ chủ cửa hàng cấp riêng. Bộ mẫu giả định phải thu phát sinh lúc xác nhận đơn.
- Ảnh hưởng: xác nhận đơn, đặt cọc, công nợ, tuổi nợ và quyền override.

### OPEN-05 — Giữ hàng, giao một phần và giá vốn

- Cần trả lời: chỉ giữ khi xác nhận hay giữ từ báo giá; reservation hết hạn khi nào; có cho giao nhiều đợt/backorder; dùng bình quân gia quyền hay FIFO; hàng trả đủ điều kiện nhập lại thế nào?
- Tạm dùng: đơn xác nhận mới giữ; không tự hết hạn; cho giao nhiều đợt; giá vốn bình quân gia quyền; hàng trả qua kiểm tra chất lượng.
- Ảnh hưởng: transaction cạnh tranh, reservation job, sổ kho, cost snapshot, trả hàng và báo cáo lãi gộp.

## 4. Cách ghi nhận câu trả lời

Khi được xác nhận, đổi `OPEN-*` thành ADR mới gồm ngày, người quyết định, lựa chọn, ví dụ cụ thể và tác động tới `BUSINESS_RULES`, `DATA_MODEL`, `API_CONTRACT`, `ACCEPTANCE`. Không xóa nội dung cũ; ghi quyết định thay thế để truy vết.
