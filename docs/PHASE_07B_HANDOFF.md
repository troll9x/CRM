# Bàn giao Đợt 07B — sử dụng số dư khách hàng

Ngày: 2026-10-08
Trạng thái: API và UI trong màn Đơn hàng đã code; local E2E pass. Chưa phải release/production.

## Luồng

1. Phiếu thu tiền thực nhận không phân bổ hoặc thu thừa tạo `CustomerCreditBalance` và event `OVERPAYMENT`.
2. Nhân viên có `payments.manage` có thể chọn số tiền để áp dụng balance vào đơn `DRAFT` của đúng khách. Không vượt balance hoặc phần đơn còn thiếu.
3. Lệnh dùng version đơn, idempotency key, audit và transaction Serializable; balance/order version cập nhật nguyên tử. Lịch sử nằm ở `CustomerCreditApplication` và event `APPLICATION`.
4. `paidVnd` và gợi ý còn phải thu tính cả receipt allocations lẫn các credit application ACTIVE; không gọi credit application là tiền mặt.
5. Xác nhận đơn sau khi tổng hai nguồn bằng đúng 100%; `ReceivableSettlement` tham chiếu từng payment allocation hoặc customer credit application.
6. Đơn nháp có credit application nhưng không có thu tiền mặt được hủy; hệ thống đánh dấu application `REVERSED`, ghi event đảo và cộng lại số dư. Đơn đã nhận tiền mặt vẫn không thể hủy vì chưa có quy trình hoàn/đối trừ.

Đây là cơ chế dùng số dư CRM, không phát sinh refund tiền mặt. COD vẫn chưa được hỗ trợ vì mâu thuẫn giữa ghi COD sau giao và yêu cầu thu đủ trước xác nhận.

## Thay đổi kỹ thuật

- Migration `20261008210000_customer_credit_application_events`: event types `APPLICATION/REVERSAL`, status enum.
- Migration `20261008211000_customer_credit_applications`: application table, source cho settlement và event, check constraint bắt buộc đúng nguồn.
- `POST /api/v1/customer-credit/{customerId}/applications` nhận `{ orderId, amountVnd, expectedVersion }`, yêu cầu `payments.manage` và header `Idempotency-Key`.
- Màn Đơn hàng hiển thị riêng tiền mặt, credit và phần còn lại; cho phép thu tiền hoặc sử dụng credit; sau hủy refresh lại số dư khách.

## Kiểm chứng

- DB test sạch: toàn bộ migration SQL áp tuần tự, seed thành công, `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` trả `No difference detected`.
- E2E 07B pass: dùng thừa 12.000đ; hai lệnh concurrent 7.000đ chỉ một thành công; retry cùng key trả response ban đầu; dùng thêm 3.000đ; xác nhận phải thu và settlement 10.000đ; hủy một đơn khác hoàn application về balance.
- Toàn API E2E: 11/11 file, 36/36 test pass ở PostgreSQL cô lập cổng 55440.
- Sau các chỉnh sửa cuối: typecheck, lint, unit (API 13/Web 2), format và production build pass; `git diff --check` đang kiểm tra trước bàn giao. Browser acceptance chưa thực hiện.
- Không dùng DB dev cổng 5432. `prisma migrate deploy` tiêu chuẩn chưa chạy được trong checkout do các thư mục migration legacy rỗng đã ghi tại handoff 06D.

## Còn lại trong Đợt 07

- Danh sách/tra cứu receivables và công nợ theo khách.
- Hoàn tiền/đảo khoản thu và chi phí vận hành: cần xác định audit/approval, hướng sổ và nghiệp vụ hoàn tiền trước khi ghi ledger.
- Hủy đơn có receipt tiền mặt vẫn bị chặn, cho tới khi hoàn tiền/đối trừ được triển khai.
- Browser acceptance và queue giao hàng riêng cho role kho chưa xong.
