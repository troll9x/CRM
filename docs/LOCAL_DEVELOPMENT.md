# Chạy môi trường local — Đợt 01–03

## Yêu cầu

- Docker Desktop đang chạy.
- Git.
- Nếu chạy npm trực tiếp: Node.js 24.18+ LTS và npm 11. Node 25 không được hỗ trợ vì đã EOL.

## Khởi tạo lần đầu

```powershell
Copy-Item .env.example .env
```

Sửa ít nhất `POSTGRES_PASSWORD`, `DATABASE_URL` và `SEED_OWNER_PASSWORD` trong `.env`. Đây chỉ là secret local; không commit file này.

### Lưu ý database local hiện tại (2026-10-08)

Database cũ `son_crm` có 11 migration từ nhánh schema 04C lịch sử. Schema đó đã tạo bảng kiểm kê theo cấu trúc khác với migration 05A hiện tại; không chạy chuỗi migration mới trực tiếp lên DB đó. Dữ liệu cũ được giữ nguyên.

Để xem giao diện theo source hiện tại, local override bị Git bỏ qua `compose.override.yaml` trỏ API tới DB riêng `son_crm_ui_account`. DB này đã chạy đủ 24 migration và seed owner `admin.test@crm.local`; mật khẩu lấy từ `account.md`, không ghi vào tài liệu. `docker compose up -d` sẽ dùng override này trên máy hiện tại. Không commit/push override local. Trước khi chuyển dữ liệu cũ cần thiết kế và thử bridge migration riêng trên bản restore.

```powershell
docker compose up -d db
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Hai thư mục migration legacy `20261004120000_phase04c_stock_adjustments` và `20261004123000_phase04c_signed_adjustment_movements` trước đây thiếu `migration.sql`, khiến Prisma deploy dừng. Nay mỗi thư mục có file no-op chỉ gồm SQL comment để giữ thứ tự lịch sử mà không thay schema; chuỗi `prisma migrate deploy` sạch đã chạy đủ 24 migration. Trước khi deploy lên database tồn tại, kiểm tra `_prisma_migrations`/checksum của đúng môi trường và backup đã kiểm tra phục hồi; không sửa migration đã áp dụng.

Khởi động hai terminal:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

- Web: http://localhost:3000
- API live: http://localhost:4000/api/v1/health/live
- API ready: http://localhost:4000/api/v1/health/ready
- OpenAPI: http://localhost:4000/docs

Đăng nhập bằng `SEED_OWNER_EMAIL` và `SEED_OWNER_PASSWORD` trong `.env`. Seed chạy lại không đổi mật khẩu của owner đã tồn tại; muốn đổi mật khẩu phải dùng luồng quản trị sau này hoặc tạo database local mới có chủ đích.

## Chạy toàn bộ bằng Docker

Sau khi `.env` đã tồn tại và dependencies đã được cài vào volume:

```powershell
docker compose run --rm api npm ci
docker compose run --rm api npm run db:generate
docker compose run --rm api npm run db:migrate:deploy
docker compose run --rm api npm run db:seed
docker compose up -d api web
```

## Kiểm tra

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

E2E cần PostgreSQL đã migrate và seed. Bài kiểm tra chứng minh: endpoint bảo vệ trả 401, đăng nhập đặt cookie HttpOnly, owner đọc được quyền, nhân viên sales bị từ chối gọi API quản trị, logout thu hồi phiên và DTO từ chối field ngoài schema.

Đợt 02 bổ sung E2E cho hai hồ sơ trùng không bị tự gộp, tìm theo liên hệ chuẩn hóa, nhiều địa chỉ, task/cơ hội, optimistic version và role kho bị từ chối gọi API khách hàng. E2E tự dọn dữ liệu mang nhãn `E2E` sau khi chạy.

Đợt 03 bổ sung E2E cho SKU/barcode duy nhất, tìm theo SKU, hệ số quy đổi, optimistic version, metadata ảnh HTTPS và quyền role kho chỉ đọc catalog. Dữ liệu sản phẩm có tên bắt đầu bằng `E2E Catalog` được tự dọn sau test.

Đợt 04A bổ sung E2E cho nhà cung cấp, snapshot quy đổi trên đơn mua, phát hành không tăng tồn, khóa sửa sau phát hành và quyền kho/sales. Đợt 04B kiểm tra nhận từng phần, bình quân gia quyền, idempotency, nhận vượt, cạnh tranh đồng thời và ẩn giá vốn. Dữ liệu có nhãn `E2E Supplier`, SKU `E2E-PO-SKU`/`E2E-INV-*` và tài khoản `purchasing-*`/`inventory-*` được tự dọn sau test.

Đợt 04C-A bổ sung E2E tồn đầu cho SKU/kho chưa có lịch sử tồn: snapshot danh mục, giá trị VND nguyên, balance/ledger, gửi lại/chống trùng, cạnh tranh đồng thời và quyền xem giá vốn. Dữ liệu `E2E-OPEN-*` được tự dọn sau test; không nhập dữ liệu hàng thật qua bài thử.

Đợt 04C-B bổ sung kiểm kê/điều chỉnh bằng chứng từ: API `GET/POST /stock-adjustments`, snapshot tồn hệ thống và danh mục, chênh lệch có dấu trên ledger, lý do/actor/audit, idempotency và kiểm tra version. Migration mới và 29 E2E đã chạy thành công trên PostgreSQL kiểm thử cô lập `crm-04cb-verification` (host port 55432), không dùng database cục bộ ở cổng 5432. Bài E2E kiểm tra chuỗi 100→97→102, retry, stale version, định giá, quyền và cạnh tranh. UI đã build nhưng chưa được xác minh thao tác bằng trình duyệt.

## Backup PostgreSQL và xác minh restore local (thử nghiệm)

Script `scripts/backup-and-verify.ps1` yêu cầu chỉ rõ container nguồn, database/user và đường dẫn backup mới. Script từ chối ghi đè, tạo archive custom-format, phục hồi vào một container PostgreSQL scratch mới không publish port, so sánh row count các bảng business/customer/product/order/shipment/stock/receivable rồi xóa container scratch. Container nguồn chỉ được đọc; backup archive được giữ tại đường dẫn người dùng đã chọn và **không được mã hóa**.

Chạy mẫu sau khi xác định đúng container/database; không dùng placeholder và không đưa mật khẩu vào command line:

```powershell
docker compose ps
./scripts/backup-and-verify.ps1 `
  -SourceContainer '<exact-running-db-container-name>' `
  -DatabaseName '<database-name>' `
  -DatabaseUser '<database-user>' `
  -BackupPath 'D:\CRM-Backups\son-crm-YYYYMMDD.dump'
```

Chỉ dùng với DB thử/local được phép đọc. Archive CRM chứa PII/giá trị kinh doanh; phải lưu trong vị trí mã hóa, giới hạn truy cập và có retention được duyệt. Verifier so sánh số dòng business/customer/product/order/stock/payment/AR/shipment/return giữa nguồn và bản restore; test với dữ liệu order/stock/AR/return được chạy qua E2E tùy chọn bên dưới. Đây chưa phải kế hoạch backup/restore production và chưa chứng minh phục hồi file upload. Trước khi dùng thật cần file storage, encrypted retention và restore drill được phê duyệt.

Để xác minh trên fixture E2E có order, stock, AR, shipment và return (Windows + source DB chạy trong Docker), sau khi migrate/seed DB scratch:

```powershell
$env:BACKUP_VERIFY_SOURCE_CONTAINER = 'crm-backup-fixture-20261008'
Push-Location apps/api
try { npx vitest run test/shipments.e2e-spec.ts --pool=forks --maxWorkers=1 } finally { Pop-Location }
```

Trước đó phải đặt `DATABASE_URL`, `SEED_OWNER_EMAIL` và `SEED_OWNER_PASSWORD` của E2E trỏ tới chính DB scratch này. Test chỉ gọi backup verifier khi `BACKUP_VERIFY_SOURCE_CONTAINER` được đặt; archive tạm được xóa sau restore. Không đặt biến này với DB development/production. Bài này xác minh bảng DB nghiệp vụ và không xác minh binary/file storage.

Đợt 05A bổ sung bảng giá admin theo SKU/bậc: `GET/PUT /price-tiers`, `GET /price-tiers/resolve`, quyền `price.edit`, audit/version/idempotency và màn hình Bảng giá trong CRM. Migration `20261005150000_phase05a_selling_unit_retail_price` thêm đơn vị bán cố định, giá lẻ ở bậc 1 và lượng thập phân; bậc thiếu trả `PRICE_NOT_CONFIGURED`. Ngày 2026-10-06, 12 migration được deploy và seed trên PostgreSQL 17.6 mới cô lập ở cổng 55434; cả 32 E2E pass. UI cần kiểm tra trực quan sau khi đăng nhập owner. Lưu ý `prisma migrate diff` báo một chênh tên index đã tồn tại từ migration kho 04C-B; xem `docs/ACCEPTANCE.md`, chưa đổi schema/migration kho trong lát cắt giá.

Đợt 05B thêm API báo giá nháp/revision và workspace CRM: `GET/POST/PATCH /quotes`, `POST /quotes/{id}/send`, `GET /quotes/{id}/revisions/{n}`. Lập nháp chỉ dùng giá backend đã cấu hình; không giữ kho. Chia sẻ vẫn thủ công: ghi nhận thời điểm khách nhận, mở revision rồi in/lưu PDF trên trình duyệt. 13 migration + seed và 33 E2E đã pass trên PostgreSQL 17.6 cô lập cổng 55435. Thuế phần trăm/VND toàn báo giá; tạm dùng phần trăm trên tiền hàng sau giảm cộng phí giao, không gồm cọc — phải xác nhận chính sách trước vận hành. Chưa kiểm tra UI thực tế bằng browser.

Đợt 06B thêm `StockReservationEvent`, giữ tồn khi chấp nhận báo giá và `POST /orders/{id}/cancel` để nhả giữ. Owner được hủy; role sales không có `orders.cancel`. Chạy `npm run db:generate`, `npm run db:migrate:deploy`, sau migration chạy lại `npm run db:seed` để nạp permission/role mới. E2E báo giá/giữ/hủy chạy trên PostgreSQL 17.6 cô lập; browser acceptance còn chờ.

## Migration mới

Chỉ chạy khi schema thay đổi có chủ đích:

```powershell
npm run db:migrate:dev -- --name ten_migration
```

Xem SQL được tạo trong `apps/api/prisma/migrations/` trước khi commit. Production/staging chỉ dùng `npm run db:migrate:deploy`.

## Dừng môi trường

```powershell
docker compose down
```

Lệnh trên giữ volume database. Chỉ dùng `docker compose down -v` khi chủ động muốn xóa toàn bộ dữ liệu local và đã xác nhận đúng project.
