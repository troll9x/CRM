# Handoff — Đợt 08B báo cáo bán hàng gross (2026-10-08)

## Đã triển khai

- `GET /api/v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` với quyền `sales-reports.read`, scope bắt buộc theo business phiên đăng nhập.
- Mặc định 12 tháng lịch gần nhất. Hai đầu ngày inclusive theo timezone của Business; tối đa 731 ngày; khoảng sai trả lỗi validation.
- Biểu đồ dashboard doanh thu hàng hóa đã giao theo tháng; top 10 SKU theo tổng lượng cơ sở giao. UI chỉ hiện khi staff được cấp `sales-reports.read`.
- Finance và owner được cấp quyền mặc định trong seed; có thể gán cho role khác qua role management.
- Báo cáo nêu rõ basis: gross delivered trước hàng trả/hoàn tiền. Doanh thu lấy từ `recognizedRevenueVnd` đã ghi lúc giao đủ, không gồm phí vận chuyển/thuế; lượng hàng theo `ShipmentLine.baseQuantity`.

## Chủ ý không suy diễn

- Không trừ return request/QA khỏi doanh thu hoặc top seller; chưa có chính sách doanh thu/hoàn tiền/AR sau trả.
- Đây không phải báo cáo doanh thu thuần/kế toán và không thể dùng thay đối soát COD.
- Browser visual acceptance chưa được chạy.

## Bằng chứng kiểm tra

- Root `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run format:check`, `npm run build` đều pass.
- Fresh PostgreSQL cô lập port 55441: áp tuần tự toàn bộ `migration.sql` hiện có, seed thành công; Prisma schema diff báo `No difference detected`.
- API E2E: 11 files / 36 tests pass, gồm doanh thu tháng, lượng cơ sở, từ chối permission và date validation.
- `git diff --check` pass. DB dev port 5432 không được dùng trong lượt kiểm tra này.
- Browser visual acceptance chưa chạy; không tuyên bố nghiệm thu UI trực quan.

## Phần còn mở Đợt 08–09

- Net report sau trả, hoàn tiền và tác động AR/doanh thu cần chính sách; COD vẫn mâu thuẫn với thu đủ trước xác nhận.
- Chi phí, import/backup/pilot và browser acceptance còn lại.
- Facebook Messenger cần Page/app/test account, quyền `pages_messaging`, callback HTTPS và evidence inbound/outbound/replay. Chưa thực hiện API thật/mocking thay thế.

## Xác minh mới nhất sau sửa migration chain

- Fresh DB scratch cổng 55446: Prisma `migrate deploy` chuẩn áp đủ 24 migration, seed pass, schema diff `No difference detected`, full API E2E 11 file / 36 test pass.
- Backup/restore validator cũng được chạy trong fixture shipment/return có dữ liệu order, stock, cash settlement/AR và return; E2E mục tiêu 1/1 pass. File storage, mã hóa/retention và production backup chưa được xác minh.
- Đây là xác minh local; browser visual acceptance và pilot vẫn chưa chạy.
