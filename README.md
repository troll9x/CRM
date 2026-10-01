# CRM bán sỉ và bán lẻ

Đợt 04A đã có luồng **web → API → PostgreSQL** cho đăng nhập/RBAC, CRM khách hàng, danh mục sản phẩm, nhà cung cấp và đơn mua. Đơn mua lưu snapshot SKU/đơn vị/hệ số/số lượng cơ sở nhưng không làm tăng tồn. Chưa triển khai phiếu nhận, sổ kho, tồn đầu, giá vốn, giá bán, đơn bán, tiền hay connector; prototype trong `prototype/` vẫn chỉ là dữ liệu mẫu của Đợt 00.

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
- [Phát triển local](docs/LOCAL_DEVELOPMENT.md): cài đặt, migration, seed, chạy và kiểm tra Đợt 01–04A.

## Xem prototype Đợt 00

Mở trực tiếp `prototype/index.html`, hoặc chạy một máy chủ tĩnh tại thư mục dự án:

```powershell
python -m http.server 4173
```

Sau đó mở `http://localhost:4173/prototype/`. Mọi số liệu đều có nhãn **DỮ LIỆU MẪU** và không được lưu.

## Trạng thái và bước tiếp theo

1. Đợt 01–03 và lát cắt 04A đã hoàn thành, kiểm tra local; workflow CI đã cấu hình, cần một remote Git để có lần chạy CI đầu tiên.
2. Chủ dự án vẫn cần trả lời 5 mục `OPEN-01` đến `OPEN-05` trong `docs/DECISIONS.md`; các giả định tạm không phải cấu hình production.
3. Em gái anh Sơn thử prototype theo `docs/UI_PROTOTYPE.md` và giao diện đăng nhập thật, rồi ghi phản hồi vào backlog.
4. Trước khi làm phiếu nhận/sổ kho Đợt 04B hoặc nhập hàng thật, cần chốt `OPEN-02` và `OPEN-05` về ngành hàng, precision, lô/hạn dùng/serial và giá vốn. Không đưa token Facebook/Zalo vào repo.
