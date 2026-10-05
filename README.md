# CRM bán sỉ và bán lẻ

Đã có các luồng **web → API → PostgreSQL** cho đăng nhập/RBAC, CRM khách hàng, danh mục, mua hàng, kho và 05A nhập giá admin theo SKU/bậc. Đợt 05A lưu giá có quyền/version/idempotency/audit; resolver chọn đúng bậc và báo trạng thái rõ nếu giá còn trống. Chưa có công thức giá tự tính, giá lẻ, báo giá, đơn bán hoặc giảm thêm. 04C-B trước đó qua migration và 29 E2E trên PostgreSQL thử cô lập; UI Kho còn chờ kiểm tra trực quan và BR-STOCK-10 còn chờ xác nhận. Prototype trong `prototype/` vẫn dùng dữ liệu mẫu.

## Chạy nhanh

Yêu cầu Docker Desktop đang chạy. Từ thư mục dự án:

```powershell
Copy-Item .env.example .env
# Đổi các secret local trong .env trước khi chạy
docker compose run --rm api npm ci
docker compose run --rm api npm run db:generate
docker compose run --rm api npm run db:migrate:deploy
docker compose run --rm api npm run db:seed
docker compose up -d api web
```

- Web: http://localhost:3000
- API health: http://localhost:4000/api/v1/health/ready
- OpenAPI: http://localhost:4000/docs

Đăng nhập bằng `SEED_OWNER_EMAIL` và `SEED_OWNER_PASSWORD` trong `.env`. Xem hướng dẫn đầy đủ và bộ lệnh kiểm tra tại [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md).

## Tài liệu điều hành

- [PRD](docs/PRD.md): mục tiêu, người dùng, phạm vi và yêu cầu.
- [Quy tắc nghiệp vụ](docs/BUSINESS_RULES.md): nguồn sự thật cho giá, kho, đơn và tiền.
- [Mô hình dữ liệu](docs/DATA_MODEL.md): thực thể, quan hệ, quyền sở hữu dữ liệu và bất biến.
- [Hợp đồng API](docs/API_CONTRACT.md): quy ước API v1 và inventory endpoint theo đợt.
- [Backlog](docs/BACKLOG.md): thứ tự các đợt và lát cắt triển khai.
- [Nghiệm thu](docs/ACCEPTANCE.md): dữ liệu mẫu và tình huống bắt buộc.
- [Quyết định](docs/DECISIONS.md): quyết định đã chốt, tạm dùng và tối đa 5 câu hỏi cần xác nhận.
- [Sẵn sàng tích hợp](docs/INTEGRATION_READINESS.md): quyền, bằng chứng và trạng thái Facebook/Zalo cùng các kênh sau.
- [Hướng dẫn prototype](docs/UI_PROTOTYPE.md): kịch bản thử sáu màn hình.
- [Phát triển local](docs/LOCAL_DEVELOPMENT.md): cài đặt, migration, seed, chạy và kiểm tra Đợt 01–05A.
- [Handoff](docs/HANDOFF.md): trạng thái hiện tại, kết quả kiểm tra và bước tiếp theo.
- [Báo cáo tiến độ](report.md): các phần đã làm/chưa làm và hướng tiếp tục.

## Xem prototype Đợt 00

Mở trực tiếp `prototype/index.html`, hoặc chạy một máy chủ tĩnh tại thư mục dự án:

```powershell
python -m http.server 4173
```

Sau đó mở `http://localhost:4173/prototype/`. Mọi số liệu đều có nhãn **DỮ LIỆU MẪU** và không được lưu.

## Trạng thái và bước tiếp theo

1. Đợt 01–04C-B đã qua kiểm tra local; 05A đã thêm giá admin theo SKU/bậc và qua lint, typecheck, unit, format, production build, migration, seed và 32 E2E trên PostgreSQL thử cô lập. 04C-B và 05A còn chờ kiểm tra UI trực quan; BR-STOCK-10 cần xác nhận.
2. CI remote gần nhất success trên commit nền `6639854`; các thay đổi local chưa commit chưa có lần chạy CI tương ứng.
3. Giá tự tính bậc trống, giá lẻ/nhóm khách, giảm thêm và báo giá tiếp tục phụ thuộc `OPEN-03`; không tính tiền cho phần chưa chốt. Các quyết định `OPEN-01..05` còn cần xác nhận trước vận hành thật.
4. Xem [HANDOFF](docs/HANDOFF.md) để chạy demo/test hiện tại. Prototype Đợt 00 vẫn là dữ liệu mẫu; không dùng bản hiện tại cho hàng cần lô/hạn dùng/serial hoặc dữ liệu vận hành chưa được duyệt.
