# Bàn giao Đợt 06E — queue xuất kho cho vai trò kho

Ngày: 2026-10-08
Trạng thái: API/UI local đã triển khai và kiểm tra tự động; chưa nghiệm thu trực quan trên browser, chưa deploy.

## Thay đổi

- Thêm quyền đọc riêng `shipments.read`; role warehouse được seed quyền này cùng quyền xuất và ghi nhận giao đủ. Không cấp `orders.read` cho kho.
- `GET /shipments/ready-orders` chỉ trả đơn `CONFIRMED` chưa có shipment; `GET /shipments?status=IN_TRANSIT` chỉ trả phiếu đang giao. Cả hai giới hạn theo business của session, tối đa 100 mục.
- Giao diện “Xuất kho & giao” hiển thị đơn/phiếu đủ thông tin tác nghiệp. Nút xuất và “Đã giao đủ” gọi command cũ có version + Idempotency-Key; service tiếp tục kiểm tra trạng thái, tồn/reservation và chống cạnh tranh.
- Queue là read-only; không phát sinh tồn, tiền hoặc doanh thu cho tới khi lệnh tương ứng thành công. Quy tắc không giao thiếu vẫn giữ nguyên.

## Kiểm chứng

- Ở thời điểm 06E, PostgreSQL scratch cổng 55442 được dựng bằng cách áp SQL thủ công vì hai thư mục migration legacy còn trống. Được khắc phục sau đó ở 06F; xem `PHASE_06F_HANDOFF.md` để biết xác minh deploy chuẩn mới nhất.
- API E2E: 11 file / 36 test pass. Test shipment xác minh sales bị 403 ở queue, role kho thấy đơn phù hợp, đơn biến mất khỏi queue sau xuất, shipment hiển thị trong danh sách đang giao, sales vẫn bị từ chối, và role kho hoàn tất xuất/giao qua command.
- Root typecheck, lint, unit (API 13/Web 2), format check, production build và `git diff --check` pass.
- Cổng dev PostgreSQL 5432 không được dùng. Container scratch đã xóa sau kiểm thử.
- Browser visual acceptance desktop/mobile chưa thực hiện; chưa coi UI là nghiệm thu trực quan.

## Còn lại

- Rà giao diện trên browser với tài khoản warehouse và responsive mobile.
- Các blockers toàn roadmap vẫn còn: cash refund/expense, net reports và ảnh hưởng AR sau trả, mâu thuẫn COD, import/backup/pilot, xác nhận số ngày trả, BR-STOCK-10, và Facebook Page/app/test scope/evidence.
- Không commit/push trong lát cắt này; file người dùng `accout.md` giữ nguyên ngoài staging.
