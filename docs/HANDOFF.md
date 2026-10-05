# Handoff — 04C-B kiểm kê và điều chỉnh kho

Ngày cập nhật: 2026-10-05 (Asia/Ho_Chi_Minh)

## Trạng thái repo lúc bắt đầu

- Branch `main`, HEAD `6639854 feat: add opening stock ledger command`.
- Trước khi sửa, tracked working tree sạch. Prompt `prompt-tiep-tuc-crm.md` là file untracked do người dùng cung cấp; giữ nguyên.
- Môi trường Windows: Node `v26.1.0` (ngoài yêu cầu repo Node 24), npm `12.0.1`; Docker Desktop/WSL đang chạy. Kiểm tra chuẩn Node 24 được chạy trong Compose project riêng `crm-04cb-node24` với image `node:24.18.0-bookworm`.
- Có hai PostgreSQL kiểm thử cô lập: `crm-04cb-verification` ở host port `55432` và `crm-04cb-node24` ở `55433`. Cả hai có volume test riêng; host port `5432` tiếp tục thuộc PostgreSQL cục bộ (PID 6584). Không chạy `down -v` lên các project này nếu cần giữ bằng chứng test.

## Đã triển khai trong working tree

- Thêm `StockAdjustment` snapshot một SKU/chứng từ và enum movement `STOCK_ADJUSTMENT`; migration tăng dần `20261005100000_phase04c_stock_adjustments`.
- API `POST/GET /api/v1/stock-adjustments`, permission `inventory.adjust`/`inventory.read`, idempotency theo business, kiểm tra `expectedVersion`, kiểm soát transaction Serializable/retry, snapshot actor/reason và audit. Giá trị/giá vốn ẩn nếu thiếu `cost.view`.
- Sổ kho cho phép chênh lệch số lượng/giá trị có dấu; DB ràng buộc source movement đúng loại. Không sửa/xóa lịch sử.
- UI Kho có form đếm balance và gửi version đã xem, báo chênh lệch/lỗi qua API, cùng danh sách chứng từ.
- Thêm E2E chuỗi 100→97→102, idempotency, stale version và giá trị ledger; test dùng SKU chuyên biệt để không phụ thuộc trạng thái test cạnh tranh. Cập nhật BUSINESS_RULES, DATA_MODEL, API_CONTRACT, ACCEPTANCE, BACKLOG, LOCAL_DEVELOPMENT.

## Quy tắc định giá đang là giả định tạm

`BR-STOCK-10` đang ghi Tạm dùng chờ xác nhận: tăng khi balance còn hàng dùng bình quân hiện tại; giảm định giá theo bình quân hiện tại; giá trị delta làm tròn về VND nguyên gần nhất; tồn bằng 0 đặt bình quân về 0; tăng từ 0 cần đơn giá vốn nhập trên chứng từ. Chưa dùng cho dữ liệu thật trước khi chủ dự án xác nhận.

`OPEN-03` đã nhận một phần câu trả lời từ người dùng: admin nhập giá sỉ theo sản phẩm; lượng 5–9 dùng bậc 5, 10–14 bậc 10, rồi mỗi 5 đơn vị tiếp theo; giá admin nhập trực tiếp thắng giá tự tính; giảm thêm chỉ admin được thực hiện; báo giá 3 ngày. Còn chờ xác nhận công thức/nguồn giá tự tính cho bậc trống, giá sỉ dùng chung hay tùy nhóm/khách, dạng/phạm vi giảm thêm, ý nghĩa duyệt đơn và ranh giới hết hạn 3 ngày. **Trạng thái tại lần handoff trước:** Đợt 05 chưa triển khai; cập nhật 05A mới nhất ở cuối tài liệu.

## Kiểm tra đã chạy

- PASS: `npx prisma validate`, `npm run lint`, `npm run typecheck`, `npm test` (3 tests unit), `npm run format:check`, `npm run build`, `git diff --check`.
- PASS: `npm run db:migrate:deploy` áp dụng đủ 10 migration lên database PostgreSQL 17.6 cô lập; `npm run db:seed` thành công; `npm run test:e2e` pass 7 file/29 tests.
- PASS trên Node `v24.18.0` trong Docker: `npm ci` (735 packages), Prisma generate/validate, migrate đủ 10 migration, seed, lint, typecheck, 3 unit tests, format, production build và E2E (7 file/29 tests). Build cần `NODE_ENV=production`; chạy với Compose mặc định `NODE_ENV=development` khiến Next prerender `/_global-error` thất bại.
- `npm ci` báo 9 high severity vulnerabilities trong dependency audit; chưa chạy `npm audit` để phân tích từng advisory và không tự nâng/hạ dependency.
- CI remote gần nhất là [run 36970455887](https://github.com/troll9x/CRM/actions/runs/36970455887), success ngày 2026-10-02 trên commit `6639854`. Run này không chứa các thay đổi local hiện tại.
- Chưa xác minh thao tác UI trực quan qua trình duyệt; build/typecheck đã pass. Công cụ trình duyệt không trả về browser khả dụng trong phiên này nên không mở được app để thao tác. Database kiểm thử và Docker container riêng hiện được giữ lại; không reset database/volume và không dừng PostgreSQL cục bộ cổng 5432.
- Không có commit mới; các thay đổi vẫn ở working tree trên `main`, gồm prompt untracked do người dùng cung cấp.

## Bước tiếp theo

1. Mở UI Kho trong trình duyệt với owner/kho để kiểm tra form kiểm kê, lỗi version cũ và danh sách chứng từ.
2. Xác nhận BR-STOCK-10 trước khi dùng dữ liệu vận hành; quyết định này ảnh hưởng trực tiếp giá trị tồn kho.
3. Đợt 05A hiện có UI/API/DB nhập giá admin theo SKU/bậc; migration và 32 E2E pass Node 24 trên PostgreSQL thử cô lập mới.
4. Chốt cách nhập/tính thuế; hoàn tất kiểm tra migration của phần mở rộng 05A, rồi triển khai 05B–C.
5. Xem `report.md` để biết các phần chưa làm và cách chạy. DB thử Đợt 05A ở `crm-05a-pricing-db` cổng 55434, volume `crm_05a_pricing_data`; giữ nguyên cùng DB thử cũ và PostgreSQL cục bộ cổng 5432.

## Cập nhật 2026-10-05 — prototype Đợt 05

- Chủ dự án chốt bậc theo đơn vị bán: 5–9 dùng bậc 5, 10–14 dùng bậc 10, 15–19 dùng bậc 15 và lặp mỗi 5; giá admin nhập ưu tiên giá tự tính. Phần này được thêm vào prototype, không ảnh hưởng API/DB hiện hành.
- Khi để trống, prototype hiển thị “Chưa có công thức giá tự tính”; chưa tự đưa ra số tiền. Giá admin nhập chỉ lưu trong bộ nhớ trang, nhãn toàn trang ghi “DỮ LIỆU MẪU — KHÔNG LƯU”.
- Danh sách phần chưa hoàn thành và điều kiện bắt đầu được ghi tại `report.md`. Còn cần user test prototype, kiểm tra trực quan 04C-B, chốt BR-STOCK-10 và phần còn lại của OPEN-03.
- Kiểm tra prototype mới: `node --check prototype/app.js`, `node --check prototype/pricing-prototype.js`, Prettier check và `git diff --check` đều pass; Python local server trả HTTP 200 cho trang và script. Chưa kiểm tra trực quan bằng trình duyệt.

## Cập nhật 2026-10-05 — Đợt 05A giá admin theo SKU

- Thêm `PriceTier` và `PriceTierCommand` cùng migration `20261005120000_phase05a_admin_price_tiers`; giá là VND nguyên, bậc phải là bội số 5 từ 5, giá được xóa bằng tombstone giữ version.
- API: `GET /price-tiers`, `PUT /price-tiers` và `GET /price-tiers/resolve`. `price.edit` giới hạn cả đọc/sửa ở backend. Lệnh ghi dùng `Idempotency-Key`, request hash, optimistic version và audit trong transaction Serializable.
- UI CRM chính có màn hình Bảng giá, chọn SKU, nhập/xóa giá, thêm bậc và gọi resolver backend. Giá lưu theo SKU/bậc dùng chung trong business hiện tại. Chưa dùng để tạo báo giá/đơn.
- Ghi chú trạng thái 05A trước cập nhật 2026-10-05: bậc thiếu trả `AUTO_PRICE_RULE_REQUIRED`; từ cập nhật này, thiếu giá trả `PRICE_NOT_CONFIGURED` và lượng dưới 5 dùng bậc giá lẻ 1.
- Kiểm tra Node 24: lint, typecheck, unit 15 tổng (API 13 + web 2), format, production build và E2E 8 file/32 test pass. 11 migration (gồm 05A) deploy và seed pass trên PostgreSQL 17.6 cô lập cổng 55434. Đây là DB thử riêng; không dùng cổng 5432.
- Chưa xác minh browser UI trực quan; build/typecheck và E2E chứng minh hợp đồng/API, không thay thế kiểm tra thao tác UI.
- Tại thời điểm handoff cũ còn thiếu OPEN-03; cập nhật quyết định ngày 2026-10-05 ở mục sau.

## Cập nhật 2026-10-05 — quyết định tiếp tục Đợt 05B–C

- Repo đã hợp nhất hai phiên bản tại commit `f4ea342`; CI của commit này pass. Branch `main` trên GitHub đồng bộ.
- Bảng giá dùng chung; mỗi SKU có một đơn vị bán cố định (gói/kg/thùng...) và admin nhập giá theo đơn vị này. Lượng dưới 5 dùng giá lẻ; từ 5 lên dùng bậc mỗi 5. Giá thiếu không tự tính.
- Cho phép lượng lẻ tối đa 6 chữ số thập phân; thành tiền từng dòng làm tròn VND nửa lên.
- Giảm phần trăm hoặc VND theo dòng hoặc toàn báo giá. Báo giá hết hạn sau 72 giờ từ lúc khách nhận; ban đầu xuất PDF/in/chia sẻ thủ công và người dùng ghi nhận lúc khách nhận. Báo giá có phí giao, thuế, cọc dự kiến và ghi chú; chuyển khi còn hạn giữ giá snapshot.
- Khách đặt qua nền tảng cần báo Admin; connector tự động chờ tài khoản thử và quyền API.
- Người có quyền `price.edit` tự đặt mức giảm phần trăm hoặc VND theo dòng/toàn báo giá; không có trần số riêng. Còn chờ cách nhập/tính thuế. Đợt 05A đang được mở rộng tại working tree; chưa chạy migration trên cơ sở dữ liệu.
