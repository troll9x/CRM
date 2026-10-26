# Triển khai thử nghiệm trên crm.nguyenhongson.vn

Checkpoint 2026-10-26: VPS đã chạy bản sửa Đơn hàng `a65d033` và HTML động `762317b`. aaPanel Nginx có `proxy_cache` toàn cục, từng giữ shell Next.js cũ tại URL `/` dù origin đã cập nhật. Đã sao lưu vhost CRM tại `/root/crm-nginx-20261026.bak`, thêm `proxy_cache off` vào `location /` và `location /api/` HTTPS của CRM, kiểm cú pháp bằng Nginx aaPanel và reload; từ Internet, `/` trả `Cache-Control: private, no-cache, no-store`. Đơn hàng mở được trong browser production. Trước khi chạy integration worker, tạo `/var/backups/son-crm/pre-worker-20261026.dump` quyền 0600 và xác nhận `pg_restore -l` đọc được; bản dump này chưa được thử khôi phục độc lập. `.env.production` hiện có đúng một dòng `INTEGRATIONS_WORKER_ENABLED=true`; API được tạo lại và readiness 200. Worker đã xử lý 19 job Facebook tồn đọng của Page Lào Cai (7 MESSAGE, 12 COMMENT); Page TQ chưa có job. Xem số liệu và ranh giới live mới nhất tại [INTEGRATION_READINESS.md](INTEGRATION_READINESS.md). Các checkpoint cũ bên dưới chỉ là lịch sử.

Checkpoint 2026-10-22 mới: VPS checkout `945f066`; web đã được tái tạo để phục vụ hai trang công khai `/privacy`, `/data-deletion`. Từ Internet, cả hai trang và `/api/v1/health/ready` trả 200. Hai URL đã được lưu vào Meta App và kiểm sau reload. Trang Đăng đã mở nút phát hành nhưng app chưa được phát hành ở checkpoint này. Chưa có event Page production hoặc tin Messenger hai chiều; worker vẫn tắt.

Checkpoint 2026-10-21: VPS đã chạy commit `6c30574` với HTTPS, API/web/DB healthy; GET `/api/v1/health/ready` từ Internet 200. Đăng nhập → `/me` → đăng xuất đạt; cookie Secure/HttpOnly/SameSite=Lax. Chứng chỉ hết hạn 2027-01-19, `certbot renew --cert-name crm.nguyenhongson.vn --dry-run` đạt, hook reload Nginx ở `/etc/letsencrypt/renewal-hooks/deploy/son-crm-nginx-reload.sh`. Backup đầu tiên `/var/backups/son-crm/initial-20261021.dump` (quyền 0600) đã phục hồi thử vào DB scratch, sau đó dọn scratch. Mật khẩu owner ban đầu chỉ ở `/root/son-crm-initial-password` (0600); không chép vào Git/chat. Backup ngoài VPS, lịch backup, giám sát và nghiệp vụ live vẫn chờ hoàn thiện.

Checkpoint 2026-10-22: VPS checkout `7d241db`; Meta App ID/Secret đã đặt trong `.env.production` ngoài Git. HTTPS webhook GET challenge và POST HMAC đúng/sai đạt; OAuth start qua tài khoản owner đạt. Meta dashboard chưa đổi URL; chưa có Page grant/event/tin live. `INTEGRATIONS_WORKER_ENABLED` vẫn mặc định `false`. Bản sao `.env.production` trước khi thêm Meta ở `/root/son-crm-env-before-meta-20261022` (0600).

Checkout phát hành: `integration/merge-crm`. Chỉ dùng `compose.production.yaml`; `compose.yaml` chạy development, công khai cổng PostgreSQL và không phù hợp cho VPS. Không chạy `compose.override.yaml` cùng cấu hình production.

## Trước khi khởi động

- Xác nhận DNS trỏ tới VPS, dung lượng còn đủ, Docker Compose và Nginx hoạt động. Xác nhận hostname chưa có virtual host riêng trước khi tạo.
- Tạo `/srv/son-crm/.env.production` với quyền `0600`, bên ngoài Git. Tối thiểu: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL=postgresql://<user>:<password>@db:5432/<db>?schema=public`. Mật khẩu dùng ký tự an toàn cho URL hoặc phải URL encode.
- API cần `WEB_ORIGIN=https://crm.nguyenhongson.vn` và cookie Secure; Compose đã đặt cố định. Facebook/Zalo chỉ thêm App Secret, token mã hóa, webhook verify và OAuth URI khi đã kiểm quyền thật. Không sao chép `.env` local lên VPS.
- `INTEGRATIONS_WORKER_ENABLED` mặc định `false`. Chỉ đặt `true` trong `.env.production` sau khi OAuth Page grant, webhook có chữ ký và định tuyến Page được kiểm trên VPS; sau đó tái tạo riêng API và kiểm job/health. Không coi worker chạy là bằng chứng tin đã đến Messenger.
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
