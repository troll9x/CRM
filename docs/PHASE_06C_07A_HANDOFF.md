# Handoff — Đợt 06C/07A: thu tiền và xác nhận đơn

Ngày cập nhật: 2026-10-07

## Đã triển khai

- Migration `20261007200000_phase07_payments_and_receivables` thêm phiếu thu, phân bổ, phải thu/đối trừ và sổ số dư khách hàng.
- `POST /payments` ghi khoản thực nhận bằng VND nguyên; server đóng dấu UTC. Nhân viên chọn allocation vào các đơn nháp cùng khách; tổng phân bổ không vượt khoản thu hoặc tổng đơn. Thu nhiều lần và thu một phần được hỗ trợ.
- Số tiền thu nhưng chưa phân bổ được ghi vào customer credit. `GET /payments/suggestions` đề xuất đơn còn thiếu tiền theo thứ tự cũ nhất; `GET /customer-credit/{customerId}` đọc số dư theo quyền.
- `POST /orders/{id}/confirm` chỉ thành công khi đã thu đủ 100% và hàng được giữ đủ; tạo receivable/settlements, cập nhật trạng thái/người xác nhận, audit và idempotency trong transaction Serializable.
- Không cho hủy đơn đã có allocation thu tiền trước khi có quy trình hoàn/đối trừ; UI ẩn thao tác hủy và giải thích điều kiện này.
- Màn Đơn hàng có nhập phiếu thu/phân bổ, hiển thị đã thu/còn thiếu và xác nhận.

## Chạy thử

1. Chạy migration trên database local đã backup/kiểm tra theo quy trình dự án; sau migration chạy `npm run db:seed` để nạp permission `payments.manage` và `receivables.view`.
2. Đăng nhập bằng owner hoặc nhân viên được cấp `payments.manage`; tạo đơn nháp.
3. Ghi khoản thu nhỏ hơn tổng đơn, chọn phân bổ; kiểm tra đơn vẫn DRAFT và số còn thiếu chính xác.
4. Thử xác nhận sớm; API phải từ chối. Thu phần còn thiếu, sau đó xác nhận.
5. Với khoản thu lớn hơn allocation, kiểm tra số dư credit qua API có quyền `receivables.view`. Replay cùng `Idempotency-Key` không được nhân đôi phiếu thu/credit.

Không dùng account/file cấu hình hoặc số dư thử cho giao dịch vận hành. Chưa có UI áp dụng credit vào đơn hay hoàn tiền.

## Bằng chứng hiện có

- `npm run typecheck`, `npm run lint` và `npm test` đã pass.
- E2E trên PostgreSQL cô lập: 9 files/34 tests pass, gồm quote/payment, reservation, insufficient stock, permissions, replay và concurrency.
- Migration SQL áp tuần tự trên PostgreSQL 17.6 test cô lập; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` báo không có khác biệt.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run format:check` và `git diff --check` pass.
- Chưa kiểm tra trực quan UI qua trình duyệt. Không khẳng định acceptance UI hoặc production readiness.

## Chưa hoàn tất 06–09

- Đợt 06D: giao toàn bộ đơn trong một lần, trừ tồn và ghi nhận giao.
- Đợt 07B: áp dụng credit, hoàn tiền và chi phí; việc hủy đơn đã thu tiền cần quy trình hoàn/đối trừ an toàn.
- Đợt 08: đổi trả/kiểm tra chất lượng, báo cáo doanh thu theo hàng giao và COD đối soát. Người dùng chưa chốt số ngày tối đa nhận trả hàng; không tự đặt.
- Đợt 09: Facebook là kênh đầu tiên nhưng chưa có Page/App/quyền/tài khoản thử. Chưa tích hợp API thật và không giả lập trạng thái tích hợp.

Các thao tác DB/tiền chỉ được kiểm tra trong test database riêng. Không chạy migration production hay deploy.
