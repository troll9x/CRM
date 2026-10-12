# Handoff — Đợt 08A đổi trả/QA (2026-10-08)

## Đã triển khai

- Chính sách `Business.returnWindowDays` nullable, versioned. Quản lý cấu hình 1–3650 ngày; không có mặc định và không nhận trả khi null.
- API đọc chính sách, danh sách đổi trả, shipment còn hạn/số lượng có thể trả; tiếp nhận hàng đã giao; giới hạn tổng lượng trả theo shipment line; snapshot ngày giao, thời hạn và số ngày.
- QA yêu cầu phân loại đầy đủ; hàng đạt và cách ly phải cộng đúng lượng nhận. Cộng tổng hàng vật lý trả về vào `onHandQuantity`; cộng hàng lỗi vào `unavailableQuantity`; ghi positive `CUSTOMER_RETURN` ledger movement, inspection, audit, WAC và chống lặp/cạnh tranh.
- UI workspace đổi trả theo quyền; giao diện cho quản lý cấu hình ngày, nhân viên tiếp nhận, kho kiểm tra. Thêm danh sách read-only công nợ `/receivables` và màn hình công nợ theo `receivables.view`.
- RBAC: sales `returns.read/manage`; warehouse `returns.read/inspect`; owner có toàn quyền. `returns.policy.manage` có thể gán qua quản lý vai trò.

## Hợp đồng chính

- `GET/PATCH /api/v1/business-policy/return-window`
- `GET /api/v1/returns`, `GET /api/v1/returns/eligible-shipments`
- `POST /api/v1/returns` + `Idempotency-Key`: `{ shipmentId, lines: [{ shipmentLineId, quantity }], notes? }`
- `POST /api/v1/returns/{id}/inspect` + `Idempotency-Key`: `{ expectedVersion, lines: [{ returnLineId, saleableQuantity, quarantineQuantity, reason? }] }`
- `GET /api/v1/receivables`: business-scoped, tối đa 200 khoản, không thay đổi số dư.

## Giới hạn và chính sách còn cần xác nhận

- Kỹ thuật đang diễn giải N ngày là N × 24 giờ từ `deliveredAt`, cho phép tiếp nhận đúng thời điểm deadline. Yêu cầu ban đầu chưa chốt số ngày hoặc ngày lịch; trước pilot cần xác nhận cách tính.
- WAC trả hàng dùng giá vốn shipment gốc, đánh dấu tạm dùng kỹ thuật; cần kế toán xác nhận.
- Chưa hoàn tiền tiền mặt, bù trừ/điều chỉnh phải thu, hoàn giảm doanh thu, xử lý hàng cách ly sau đó, COD, báo cáo trả hàng, browser visual acceptance.
- Facebook đã được chọn nhưng chưa có Page/app/test account/permissions/access token; không gọi API thật và không tuyên bố connector đã tích hợp.

## Kiểm tra

- Prisma schema validate/generate: pass.
- Migrations: áp dụng tuần tự các file `migration.sql` hiện có lên PostgreSQL cô lập port 55441 (không dùng database dev); Prisma schema diff báo `No difference detected`.
- API E2E: 11 files, 36 tests pass trên DB cô lập; shipment suite đã mở rộng với receive/idempotency/QA/WAC/quarantine assertion.
- API/web lint, typecheck, unit (13/13), build toàn workspace và format check pass sau khi thêm AR list. API E2E 11 files/36 tests pass trên DB cô lập.
- Browser visual flow chưa chạy.
- Hai migration folder 04C lịch sử rỗng khiến `prisma migrate deploy` không dùng được như workflow chuẩn; không xóa thư mục đó. Local SQL files được áp dụng thủ công trên database thử nghiệm.

## Tiếp theo

1. Chạy browser flow đổi trả và công nợ trên bản local, không nhận nghiệm thu thị giác từ build.
2. Chốt ngày trả và diễn giải policy; hoàn thiện hoàn tiền/công nợ/doanh thu theo rule đã duyệt.
3. Giải quyết xung đột COD vs thu đủ trước xác nhận.
4. Chỉ tiếp tục Facebook live connector sau khi có Page/app/test quyền và bằng chứng API.
5. Chưa push: branch/worktree chứa thay đổi các giai đoạn 06–08 chưa được commit/review.
