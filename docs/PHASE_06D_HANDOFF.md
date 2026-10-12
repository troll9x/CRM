# Bàn giao Đợt 06D — xuất kho và ghi nhận giao hàng

Ngày: 2026-10-08
Trạng thái: backend/API hoàn thành local; queue tác nghiệp kho riêng đã bổ sung trong lát cắt 06E. Browser acceptance vẫn chưa chạy. Chưa deploy.

## Quy tắc đã thực hiện

- Chỉ xuất từ đơn `CONFIRMED` có reservation đủ; không có request quantity nên không thể giao thiếu.
- Mỗi đơn có tối đa một shipment đủ toàn bộ dòng, tại một kho.
- Tạo shipment giảm `onHand` và `reserved` đồng thời; ghi `Shipment`, `ShipmentLine`, `StockMovement(SALE_SHIPMENT)`, audit và `OrderCommand` trong transaction Serializable.
- Giá vốn chụp theo WAC hiện tại; biến động số lượng/giá trị âm, không lộ cost trên response shipment.
- Doanh thu bằng 0 đến khi delivery được xác nhận; sau đó ghi giá trị hàng trên snapshot đơn sau giảm giá, loại phí giao và thuế.
- Tạo shipment và đánh dấu delivered đều cần version, permission, idempotency key và actor/time UTC.

## API và UI

- `POST /api/v1/shipments` — `{ orderId, expectedVersion }`, `shipments.create`.
- `POST /api/v1/shipments/{id}/deliver` — `{ expectedVersion }`, `shipments.deliver`.
- Nút giao hàng trong màn hình đơn vẫn là luồng cho người có `orders.read`; queue riêng cho vai trò kho được bổ sung tại `PHASE_06E_HANDOFF.md`.
- Không có API COD/đối soát, return, refund hay shipment nhiều lần.

## Kiểm chứng

- PostgreSQL test sạch ở cổng `55440`, chỉ migration có `migration.sql` được áp tuần tự; seed thành công. `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: không có khác biệt.
- 06D E2E: 1/1 test pass, gồm quyền, chặn quantity/partial, cạnh tranh hai lệnh, retry cùng key, ledger WAC, tồn giữ và doanh thu sau delivery.
- Toàn bộ API E2E: 10/10 file, 35/35 test pass.
- Unit: API 13/13, Web 2/2; lint, typecheck, format, `git diff --check`, production build pass.
- Browser visual acceptance chưa thực hiện. Tại thời điểm bàn giao 06D, hai thư mục migration legacy rỗng chặn `prisma migrate deploy`; đã được sửa bằng no-op SQL comment và xác minh deploy chuẩn tại `PHASE_06F_HANDOFF.md`. Không chạm DB dev cổng 5432.

## Quyết định còn vướng

- COD: BR-COD-01 yêu cầu xác nhận tiền COD thực nhận sau giao; BR-AR-02 cấm xác nhận đơn trước khi thu đủ. Không tự tạo ngoại lệ. Cần chốt quy trình trước khi code đối soát.
- Đổi trả: chưa có số ngày từ lúc giao để giới hạn nhận trả; tiếp tục giữ policy là mở.
- Facebook: mới chọn kênh đầu tiên; chưa có Page/app/tài khoản thử/scope và bằng chứng gọi API. Không ghi nhận là đã tích hợp.

## Bước tiếp theo

1. Chạy browser flow desktop/mobile cho queue shipment, giữ nguyên ranh giới `orders.read`.
2. Làm tiếp phần 07B: dùng số dư khách hàng, hoàn tiền/đảo, chi phí và màn hình công nợ theo nghiệp vụ đã chốt; không mở COD trước khi xử lý xung đột.
3. Hoàn thiện 08 sau khi cấu hình/chốt được số ngày đổi trả; QA, quarantine, hoàn tiền và báo cáo doanh thu/bán chạy.
4. Chuẩn bị Facebook connector sau khi có tài khoản thử; chỉ đánh dấu tích hợp thật khi lưu được evidence.
5. Chạy browser flow desktop/mobile; sau đó xem diff và mới xem xét commit/push khi lát cắt đủ điều kiện.

Không commit/push trong lần bàn giao này; repository vẫn còn các giai đoạn 07B–09 chưa xong và cần giữ nguyên file người dùng `accout.md` ngoài staging.
