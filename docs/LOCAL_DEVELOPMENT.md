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

```powershell
docker compose up -d db
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

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

Đợt 05A ban đầu bổ sung bảng giá admin theo SKU/bậc: `GET/PUT /price-tiers`, `GET /price-tiers/resolve`, quyền `price.edit`, audit/version/idempotency và màn hình Bảng giá trong CRM. Phần mở rộng tại working tree thêm đơn vị bán cố định, giá lẻ ở bậc 1 và lượng thập phân; bậc thiếu trả `PRICE_NOT_CONFIGURED`. Migration mới `20261005150000_phase05a_selling_unit_retail_price` chưa được chạy xác minh vì Docker Desktop hiện chưa hoạt động. Kết quả 32 E2E phía dưới thuộc migration ban đầu trên PostgreSQL thử riêng `crm-05a-pricing-db`; không xem là kiểm chứng migration mới. UI cần kiểm tra trực quan sau khi đăng nhập owner.

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
