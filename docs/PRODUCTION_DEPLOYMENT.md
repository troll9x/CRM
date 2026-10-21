# Triển khai thử nghiệm trên crm.nguyenhongson.vn

Checkout phát hành: `integration/merge-crm`. Chỉ dùng `compose.production.yaml`; `compose.yaml` chạy development, công khai cổng PostgreSQL và không phù hợp cho VPS. Không chạy `compose.override.yaml` cùng cấu hình production.

## Trước khi khởi động

- Xác nhận DNS trỏ tới VPS, dung lượng còn đủ, Docker Compose và Nginx hoạt động. Xác nhận hostname chưa có virtual host riêng trước khi tạo.
- Tạo `/srv/son-crm/.env.production` với quyền `0600`, bên ngoài Git. Tối thiểu: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL=postgresql://<user>:<password>@db:5432/<db>?schema=public`. Mật khẩu dùng ký tự an toàn cho URL hoặc phải URL encode.
- API cần `WEB_ORIGIN=https://crm.nguyenhongson.vn` và cookie Secure; Compose đã đặt cố định. Facebook/Zalo chỉ thêm App Secret, token mã hóa, webhook verify và OAuth URI khi đã kiểm quyền thật. Không sao chép `.env` local lên VPS.
- Trước mọi migration của database có dữ liệu, lưu backup và thử phục hồi trên database riêng. Database mới có thể migrate rồi bootstrap một lần.

## Database mới và tài khoản đầu tiên

```sh
cd /srv/son-crm
docker compose --env-file .env.production -f compose.production.yaml build api
docker compose --env-file .env.production -f compose.production.yaml up -d db
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps api npm run db:migrate:deploy
```

Seed chỉ cho production khi `BOOTSTRAP_EMPTY_PRODUCTION_DB=yes` và chưa có business hay nhân viên. Cấp `DATABASE_URL`, `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` (ít nhất 12 ký tự) từ tệp bí mật chỉ root đọc; không đưa mật khẩu vào lệnh, log, Git hay chat. Chạy seed một lần, rồi cất/thu hồi tệp bí mật theo quy trình của chủ dự án. Seed không tự động chạy khi container khởi động.

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d api web
docker compose --env-file .env.production -f compose.production.yaml ps
```

Database không publish cổng. API và web chỉ publish trên `127.0.0.1` để Nginx proxy. Tạo virtual host riêng: `/api/` tới `http://127.0.0.1:4000`, các đường dẫn khác tới `http://127.0.0.1:3000`. Cấp chứng chỉ TLS hợp lệ; chuyển hướng HTTP sang HTTPS sau khi kiểm ACME challenge. Đừng sửa virtual host của các website khác.

## Nghiệm thu và vận hành

- `https://crm.nguyenhongson.vn/api/v1/health/live` và `/ready` phải trả HTTP 200; trang đăng nhập phải hiển thị qua HTTPS.
- Kiểm cookie đăng nhập `Secure`, `HttpOnly`, `SameSite=Lax`, thao tác đăng xuất và một quyền backend với tài khoản owner. Không dùng tài khoản test local làm bằng chứng production.
- Tạo backup PostgreSQL định kỳ, lưu ngoài VPS, kiểm phục hồi trên database riêng. Thiết lập giám sát dung lượng, uptime, lỗi API, hạn chứng chỉ và container restart trước khi dùng dữ liệu khách hàng thật.
- Chưa coi Messenger, bình luận, Zalo hay shop là live chỉ vì CRM đã chạy. Giữ dashboard Meta nguyên trạng cho tới khi callback HTTPS/OAuth kiểm riêng từ Internet và chủ dự án duyệt thay đổi URL cụ thể.

Rollback ứng dụng: lưu image/tag cũ và backup DB trước khi đổi phiên bản; ngừng traffic ghi, khôi phục image/config tương ứng. Không tự rollback schema đã ghi dữ liệu mới. Có thể tạm chuyển Nginx sang trang bảo trì khi backend lỗi, nhưng không trỏ hostname CRM vào website khác.
