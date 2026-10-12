# Bàn giao Đợt 06F — sửa đường migration deploy chuẩn

Ngày: 2026-10-08
Trạng thái: migration chain local được khôi phục và xác minh trên DB mới; chưa triển khai lên database có sẵn/staging/production.

## Thay đổi

- Hai thư mục timestamp legacy `20261004120000_phase04c_stock_adjustments` và `20261004123000_phase04c_signed_adjustment_movements` thiếu `migration.sql`, khiến `prisma migrate deploy` thất bại.
- Thêm vào mỗi thư mục một `migration.sql` chỉ chứa comment; không có DDL, DML hay thay đổi schema. Mục tiêu là giữ đúng thứ tự folder legacy để Prisma Migrate đọc chuỗi nhất quán; không đổi/xóa migration schema cũ.

## Bằng chứng kiểm tra

- PostgreSQL 17.6 scratch mới ở cổng 55444: `npm run db:migrate:deploy` thành công và áp đủ 24 migration, bao gồm 2 no-op.
- `npm run db:seed` pass; deploy lần hai trả “No pending migrations”; `_prisma_migrations` ghi 24 migration hoàn tất.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: `No difference detected`.
- API E2E sau deploy chuẩn: 11 file / 36 test pass; gồm queue kho, đơn, thanh toán, giao và đổi trả.
- PostgreSQL scratch đã xóa; không dùng DB dev cổng 5432. `git diff --check` pass.

### Xác minh bổ sung

- Sau khi thêm backup fixture hook, chạy lại riêng shipment/returns E2E với verifier bật: 1/1 test pass và restore có dữ liệu `sales_orders`, `stock_balances`, payment/settlement, shipment, stock movement, receivable và return/inspection; source/restore containers và archive scratch đã dọn.
- Chạy lại toàn bộ E2E (không bật hook) trên DB mới qua `prisma migrate deploy`: 11/11 file, 36/36 test pass; 24 migrations và schema diff không khác biệt.
- Typecheck, lint, unit (API 13/Web 2), format và diff-check pass sau harness.

## Ranh giới triển khai

- Xác minh trên DB mới không chứng minh an toàn cho database đã tồn tại. Trước deployment môi trường cũ cần sao lưu và thử restore, xác minh migration ledger/checksum từ đúng môi trường và chuẩn bị kế hoạch rollback; chưa thực hiện deploy.
- Không thay thế việc nghiệm thu browser, BR-STOCK-10, pilot, backup dữ liệu đại diện, COD hay Facebook connector.
- Chưa commit/push; không đưa `accout.md` vào staging.
