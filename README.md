# Sơn CRM — quản lý bán sỉ và bán lẻ

CRM nội bộ theo mô hình **web → API → PostgreSQL**, viết bằng tiếng Việt. Ứng dụng hướng tới quản lý khách hàng, sản phẩm, mua hàng, tồn kho, báo giá, đơn bán, giao hàng, thu tiền và công nợ trong cùng một hệ thống.

> **GitHub:** [troll9x/CRM](https://github.com/troll9x/CRM). Checkpoint VPS 30/10 chạy nhánh `integration/merge-crm` (commit `48c8ac5`); `main` chưa được gộp. Kiểm tra branch/HEAD/status trước khi làm trên máy khác. Không dùng `git reset/clean` để xử lý chênh lệch.

**Pilot HTTPS:** [crm.nguyenhongson.vn](https://crm.nguyenhongson.vn) đã phục vụ trang đăng nhập, API và PostgreSQL mới trên VPS. Xem [runbook triển khai](docs/PRODUCTION_DEPLOYMENT.md) và [checkpoint tích hợp](docs/INTEGRATION_READINESS.md). Hạ tầng chạy được không đồng nghĩa Messenger/Zalo/shop đã live hoặc CRM đã đủ điều kiện dùng toàn bộ dữ liệu vận hành.

**Nghiệm thu 31/10:** [Bảng đối chiếu kế hoạch gốc và khoảng thiếu](docs/ACCEPTANCE_GAP_AUDIT_2026-10-31.md). Bản nội bộ đến hết Đợt 08 **chưa đạt** tiêu chí trọn luồng; production chưa có khách, sản phẩm hay đơn để nghiệm thu nghiệp vụ. Không dùng riêng trạng thái healthy của dịch vụ làm kết luận nghiệm thu.

## Tính năng hiện có trong checkout local

- Đăng nhập nhân viên, phiên làm việc, phân quyền RBAC ở backend và nhật ký thao tác.
- Hồ sơ khách hàng 360°: nhóm sỉ/lẻ, nguồn, nhiều địa chỉ, công việc/cơ hội, ghi chú và timeline. Không tự gộp khách chỉ vì tên hoặc số điện thoại giống nhau.
- Danh mục sản phẩm, SKU/barcode, đơn vị bán và quy đổi; nhập catalog hàng loạt từ Excel Shopee; nhà cung cấp, đơn mua, nhận hàng và sổ kho.
- Giá admin theo SKU/bậc; báo giá có revision, phí giao, giảm giá, thuế, tiền cọc dự kiến và chuyển báo giá hợp lệ thành đơn nháp.
- Đơn bán, giữ/nhả tồn, thu tiền nhiều lần, phân bổ tiền và số dư khách hàng; xuất kho/giao đủ; tiếp nhận đổi trả và kiểm tra chất lượng.
- Dashboard và báo cáo doanh thu hàng đã giao, cùng sản phẩm giao nhiều. Đây là báo cáo **gross**, chưa trừ hàng trả/hoàn tiền.
- Nền đồng bộ đa kênh gồm kết nối, webhook, hàng đợi/worker, nhật ký đồng bộ, hộp thư, bình luận, đơn ngoài và liên kết khách hàng/SKU.

Các tính năng trên không đồng nghĩa mọi màn hình đã được nghiệm thu trực quan hoặc sẵn sàng vận hành. API/E2E và migration đã được kiểm tra trên các database PostgreSQL cô lập theo checkpoint từng đợt; xem [HANDOFF](docs/HANDOFF.md) và các handoff theo đợt để biết chính xác bằng chứng.

## Tình trạng tích hợp kênh

- **Facebook/Messenger:** Page Lào Cai đã có inbound webhook production được worker xử lý; chưa nghiệm thu tin mới và phản hồi hai chiều từ CRM xuất hiện trên Messenger. Page thứ hai và quyền bình luận vẫn cần kiểm riêng. Xem checkpoint có bằng chứng trong [INTEGRATION_READINESS](docs/INTEGRATION_READINESS.md).
- **Zalo OA:** có code OAuth/webhook và kiểm thử local/mock; chưa xác minh với OA thật. API đọc bình luận chưa được xác nhận.
- **Shopee/TikTok Shop:** có nền lưu hàng đợi/đơn ngoài; chưa có đồng bộ đơn qua API thật.

Code có luồng gửi Messenger và trả lời bình luận với chặn quyền theo từng Page, nhưng chưa có tin outbound live từ VPS tới tài khoản thử. Zalo/shop chưa được bật gửi hoặc xử lý đơn qua API thật. Payload test/mock không phải dữ liệu khách thật. Hướng dẫn và blocker mới nhất ở [INTEGRATIONS_SETUP](docs/INTEGRATIONS_SETUP.md) và [INTEGRATION_READINESS](docs/INTEGRATION_READINESS.md).

## Chạy local

Yêu cầu: Windows/PowerShell hoặc môi trường tương thích, Node.js `>=24 <25`, npm `>=11`; Docker Desktop nếu chạy PostgreSQL/API/web bằng Compose.

1. Tạo `.env` từ `.env.example` **chỉ khi chưa có `.env`**. Điền cấu hình local và secrets trực tiếp trong `.env`; không gửi secrets qua chat, không commit `.env`.
2. Cài/generate và migrate database local mới:

```powershell
docker compose run --rm api npm ci
docker compose run --rm api npm run db:generate
docker compose run --rm api npm run db:migrate:deploy
docker compose run --rm api npm run db:seed
docker compose up -d
```

Không chạy migrate/seed lên database đang có dữ liệu trước khi xác định đúng database và có backup đã thử phục hồi. Máy phát triển hiện có cấu hình Compose override local trỏ tới database giao diện; chi tiết, lưu ý migration và cách chạy từng service nằm trong [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md). Không commit file override hoặc database local.

Sau khi khởi động:

- Web: <http://localhost:3000>
- API live: <http://localhost:4000/api/v1/health/live>
- API ready: <http://localhost:4000/api/v1/health/ready>
- OpenAPI: <http://localhost:4000/docs>

Đăng nhập bằng thông tin owner được cấu hình trong `.env`/seed local. Không lưu mật khẩu thử nghiệm trong README.

## Nhập sản phẩm từ file Shopee

1. Trong Shopee Seller Center, tải template nhập sản phẩm mới nhất theo ngành hàng. [Hướng dẫn Shopee Seller Education (ví dụ thị trường Malaysia)](https://cdngarenanow-a.akamaihd.net/shopee/seller/seller_cms/e8420f9b3f575f9d9ed24e16256aa271/Mass%20Upload%20User%20Guide%20(New%20UI)%20MY.pdf) mô tả upload theo template/ngành hàng; tên cột và phần hướng dẫn có thể khác theo thị trường. CRM nhận `.xlsx` và cho phép ánh xạ cột thủ công.
2. Mở **Danh mục hàng hóa → Nhập Excel Shopee**, chọn workbook, sheet và hàng tiêu đề. Kiểm tra gợi ý ánh xạ; bắt buộc ánh xạ tên sản phẩm, SKU và đơn vị gốc (hoặc nhập cả mã/tên đơn vị mặc định).
3. Chọn **Kiểm tra dữ liệu**. Sửa lỗi SKU/barcode trùng, tên thiếu hoặc đơn vị chưa hợp lệ trong file rồi xem trước lại. Các dòng cùng `Parent SKU` được gom thành một sản phẩm có nhiều biến thể; nếu không có `Parent SKU`, mỗi dòng là sản phẩm riêng.
4. Chọn xác nhận nhập khi preview không còn lỗi. Mỗi đợt tối đa 1.000 dòng SKU và 10 MiB; import là tạo mới, không ghi đè catalog đang có.

Giá, số lượng tồn, khuyến mãi và phí trên file Shopee không được nhập vào CRM. Ảnh chỉ lưu URL HTTPS làm metadata; CRM không tải ảnh. Tạo bảng giá và chứng từ kho theo luồng riêng. Chưa dùng dữ liệu hàng thật trước khi xác nhận `OPEN-02` trong [quyết định](docs/DECISIONS.md).

## Kiểm tra

```powershell
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build
npm run test:e2e
```

E2E cần PostgreSQL thử nghiệm riêng, đã migrate/seed và đáp ứng guard của test. Không trỏ E2E vào database vận hành hoặc database local có dữ liệu cần giữ. Các lệnh pass trên DB scratch chỉ chứng minh code path local, không chứng minh đã kết nối nền tảng thật.

## Giới hạn trước khi dùng vận hành

- Facebook mới có inbound production trên một Page; chưa chứng minh gửi hai chiều, Page thứ hai hoặc trả lời bình luận. Không suy các khả năng đó từ OAuth hoặc webhook handshake.
- COD còn vướng quy tắc thu đủ trước xác nhận; hoàn tiền mặt, chi phí và báo cáo thuần sau đổi trả chưa hoàn thiện.
- Chính sách số ngày nhận trả và một số quyết định vận hành cần được quản lý xác nhận/cấu hình trước pilot.
- Nhiều màn hình đã có API thật nhưng còn chờ nghiệm thu giao diện bằng trình duyệt. Pilot VPS đã chạy; chưa xác nhận mức sẵn sàng production cho dữ liệu khách thật.
- Không dùng dữ liệu prototype trong `prototype/` làm bằng chứng hoạt động; prototype là dữ liệu mẫu.

## Tài liệu dự án

- [PRD](docs/PRD.md) · [Quy tắc nghiệp vụ](docs/BUSINESS_RULES.md) · [Quyết định](docs/DECISIONS.md)
- [Mô hình dữ liệu](docs/DATA_MODEL.md) · [Hợp đồng API](docs/API_CONTRACT.md) · [Nghiệm thu](docs/ACCEPTANCE.md)
- [Backlog](docs/BACKLOG.md) · [Handoff hiện tại](docs/HANDOFF.md) · [Hướng dẫn local](docs/LOCAL_DEVELOPMENT.md)
- [Sẵn sàng tích hợp](docs/INTEGRATION_READINESS.md) · [Cấu hình tích hợp](docs/INTEGRATIONS_SETUP.md)
- [Ma trận chức năng AMIS](docs/AMIS_FEATURE_MATRIX.md)
