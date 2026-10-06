# Backlog theo phụ thuộc

Trạng thái: `DONE` tài liệu/prototype đã tạo; `WAITING` cần xác nhận/bằng chứng; `READY` đủ đặc tả để bắt đầu khi dependency xong; `LATER` chưa đến đợt.

## Đợt 00 — đặc tả và thử quyền

| ID     | Việc                           | Trạng thái | Bằng chứng/điều kiện xong                                                         |
| ------ | ------------------------------ | ---------- | --------------------------------------------------------------------------------- |
| S00-01 | Chuẩn hóa PRD/phạm vi          | DONE       | `PRD.md` tách confirmed/assumption/open                                           |
| S00-02 | Quy tắc nghiệp vụ có mã        | DONE       | `BUSINESS_RULES.md` gồm bất biến kho/tiền/quyền                                   |
| S00-03 | Mô hình dữ liệu đích mức khung | DONE       | `DATA_MODEL.md`, không tạo schema sớm                                             |
| S00-04 | Khung API v1                   | DONE       | `API_CONTRACT.md`, lỗi/idempotency/concurrency                                    |
| S00-05 | Backlog và acceptance          | DONE       | Tài liệu này + `ACCEPTANCE.md`                                                    |
| S00-06 | Tối đa 5 quyết định chặn       | WAITING    | Chủ dự án trả lời `OPEN-01..05`                                                   |
| S00-07 | Prototype 6 màn hình           | DONE       | `prototype/`, nhãn dữ liệu mẫu, responsive                                        |
| S00-08 | Người dùng chính thử prototype | WAITING    | Biên bản tại `UI_PROTOTYPE.md`                                                    |
| S00-09 | Thử quyền Facebook/Zalo thật   | WAITING    | Cần Page/OA, developer app/test account; evidence theo `INTEGRATION_READINESS.md` |

Đợt 00 chỉ hoàn thành hoàn toàn khi S00-06, S00-08 và ít nhất kết luận khả thi/không khả thi có bằng chứng của S00-09 được ghi nhận. Không để chờ cấp quyền kênh chặn chuẩn bị core, nhưng không đổi trạng thái connector thành “đã tích hợp”.

## Roadmap

| Đợt | Phạm vi                                               | Phụ thuộc                   | Trạng thái                                                                                     |
| --- | ----------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| 01  | Monorepo, môi trường, auth nhân viên, RBAC, audit, CI | 00 đủ quyết định core       | DONE LOCAL; chờ lần chạy CI remote                                                             |
| 02  | Khách, nhóm sỉ/lẻ, nhiều địa chỉ, nhắc việc           | 01                          | DONE LOCAL; chờ phản hồi người dùng                                                            |
| 03  | Sản phẩm, SKU, đơn vị, ảnh                            | 01 + OPEN-02                | DONE LOCAL theo giả định tạm                                                                   |
| 04  | Nhà cung cấp, nhập hàng, tồn đầu, sổ kho              | 03 + OPEN-05                | 04A–04C-B đã qua migration/E2E local; cần kiểm tra UI trực quan và chốt BR-STOCK-10            |
| 05  | Giá sỉ/lẻ, bậc giá, báo giá                           | 02,03 + OPEN-03             | 05A/05B đã kiểm tra local; còn browser check và xác nhận quy ước thuế trước vận hành; 05C chưa làm |
| 06  | Đơn, xác nhận, giữ, hủy, giao một phần                | 04,05 + OPEN-04/05          | LATER                                                                                          |
| 07  | Thu tiền, đặt cọc, công nợ, chi phí                   | 06 + chốt ghi nhận phải thu | LATER                                                                                          |
| 08  | Đổi trả, COD tay, báo cáo, import, backup/pilot       | 06,07                       | LATER                                                                                          |
| 09  | Hộp thư connector đã kiểm chứng                       | 00,02,06 + quyền thật       | LATER                                                                                          |
| 10  | AI gợi ý và đơn nháp                                  | 09 + chính sách duyệt       | LATER                                                                                          |
| 11  | Website mua lại, OTP                                  | 02,05–08                    | LATER                                                                                          |
| 12  | Online payment + một hãng giao                        | 11 + hợp đồng provider      | LATER                                                                                          |
| 13  | Một sàn ưu tiên rồi sàn tiếp                          | 03–08 + quyền               | LATER                                                                                          |
| 14  | Marketing/chăm sóc/báo cáo nâng cao                   | 09–13 theo nhu cầu          | LATER                                                                                          |
| 15  | API đối tác, dự báo, tối ưu                           | Core ổn định, đủ dữ liệu    | LATER                                                                                          |

### Phản hồi giao diện cần tiếp tục

- `UX-01 — LOCAL IMPLEMENTED; BROWSER CHECK PENDING`: sau phản hồi cỡ 14px/16px vẫn quá nhỏ, đã nâng nhãn phụ/trợ giúp/bảng lên 16px và điều khiển lên 18px trong CRM. Mở desktop/mobile để rà độ tràn, hàng bảng và cỡ chữ thực tế.
- `UX-02 — WAITING ĐỢT 06`: biểu đồ doanh thu theo tháng và sản phẩm bán chạy cần module đơn bán/dữ liệu thật, thời gian báo cáo và chính sách giao/trả; không sinh dữ liệu giả.
- `UX-03 — WAITING ĐỢT 09`: hộp thư/chat cần chốt Facebook/Zalo, cấp tài khoản developer/test và quyền API; cần evidence nhận/gửi trước khi coi là tích hợp.
- `UX-04 — BROWSER CHECK PENDING`: source UI là UTF-8, có `<html lang="vi">` và test chống mojibake; kiểm tra dấu tiếng Việt trên giao diện được đăng nhập, các dữ liệu nhập và luồng in báo giá bằng browser.

### Tiến độ Đợt 05 sau khi nhận quy tắc bậc từ chủ dự án

- `05A IMPLEMENTED; VERIFIED LOCAL 2026-10-06` — API/UI/DB lưu giá admin lẻ tại bậc 1 và giá theo SKU/bậc sỉ; đơn vị bán cố định; resolver nhận lượng thập phân, trả `PRICE_NOT_CONFIGURED` khi thiếu giá. Có `price.edit`, expectedVersion, idempotency và audit. 12 migration + seed và 8 file/32 E2E pass trên PostgreSQL 17.6 thử cô lập; UI cần browser check.
- `PROTOTYPE ONLY` — prototype tĩnh vẫn minh họa cùng quy tắc nhưng không lưu; màn hình CRM chính dùng API/DB thật.
- `DECIDED 2026-10-05` — bảng giá chung; mỗi SKU một đơn vị bán cố định; admin nhập giá lẻ và các bậc theo đơn vị đó; dưới 5 dùng giá lẻ, từ 5 lên bậc mỗi 5; lượng lẻ tới 6 chữ số; làm tròn từng dòng VND nửa lên; thiếu giá thì không tự tính; giảm phần trăm/VND trên dòng/toàn báo giá; báo giá hết hạn sau 72 giờ từ lúc khách nhận; PDF/in/chia sẻ thủ công giai đoạn đầu; có phí giao/thuế/cọc/ghi chú; chuyển báo giá còn hạn giữ snapshot; cần thông báo Admin khi khách đặt qua nền tảng.
- `05B IMPLEMENTED; VERIFIED LOCAL 2026-10-06` — API/UI cho báo giá nháp, snapshot giá, giảm dòng/toàn báo giá, phí giao/thuế/cọc, revision bất biến, ghi nhận nhận báo giá và in/lưu PDF qua trình duyệt; 13 migration + seed, 9 file/33 E2E pass. Còn browser check trực quan và xác nhận quy ước thuế trước vận hành.
- `WAITING POLICY CONFIRMATION` — thuế hỗ trợ % hoặc VND; tạm dùng chọn một kiểu mỗi báo giá và tính phần trăm trên tiền hàng sau giảm cộng phí giao, không gồm cọc. Chủ dự án cần xác nhận trước vận hành. Người có `price.edit` tự quyết định mức giảm; không có trần số riêng.
- Sau 05B: làm 05C chuyển báo giá còn hạn thành đơn nháp và thông báo. Kênh tự động đợi tài khoản thử và kiểm chứng. Không dùng giá prototype làm giá vận hành.

## Kết quả Đợt 01

1. `DONE` — npm workspace, lockfile, format/lint/typecheck/unit/build.
2. `DONE` — web tiếng Việt responsive; API live/ready.
3. `DONE` — PostgreSQL, migration đầu tiên, seed business/owner/role/permission.
4. `DONE` — login, phiên server-side, logout/revoke và khóa nhân viên; secret chỉ ở env.
5. `DONE` — guard RBAC tại backend; E2E gọi trực tiếp chứng minh nhân viên sales nhận 403.
6. `DONE` — audit login/logout/thay đổi staff-role, `/me` và OpenAPI.
7. `CONFIGURED` — GitHub Actions dùng DB sạch; local đã chạy cùng chuỗi lệnh, remote chưa có nên chưa có run CI.
8. `DONE` — `.env.example`, hướng dẫn local và demo success/401/403; backup/restore đầy đủ thuộc cổng phát hành Đợt 08.

## Lát cắt nghiệp vụ Đợt 02–06

- **02A:** tạo/tìm khách + nhiều địa chỉ + chống gộp tự động; **02B:** nhóm sỉ/lẻ + task/cơ hội.
- **03A:** product/variant/SKU; **03B:** unit conversion được backend kiểm tra; **03C:** ngừng bán + media metadata.
- **04A:** purchase order không tăng tồn; **04B:** goods receipt từng phần sinh ledger; **04C:** tồn đầu/kiểm kê/điều chỉnh.
- **05A:** price resolver có test thứ tự và 9/10/11; **05B:** quote snapshot/version; **05C:** convert thành draft order và kiểm tra lại.
- **06A:** draft order backend tính tổng; **06B:** confirm + reservation cạnh tranh/idempotency; **06C:** cancel/release; **06D:** shipment từng phần và timeline.

Mỗi lát cắt phải có migration + API + UI + dữ liệu lưu thật + test nghiệp vụ; không gom cả đợt vào một thay đổi khổng lồ.

### Kết quả Đợt 02

- `DONE` — hồ sơ khách có mã nội bộ, nhóm sỉ/lẻ, nguồn, ghi chú, marketing consent và người phụ trách.
- `DONE` — số điện thoại/email được chuẩn hóa để tìm và gợi ý trùng; tên/trùng liên hệ không tự gộp hồ sơ.
- `DONE` — nhiều địa chỉ; lưu trữ thay vì xóa cứng, sẵn sàng để đơn sau này snapshot địa chỉ.
- `DONE` — việc nhắc và cơ hội mua lần đầu/mua lại có vòng đời riêng, audit và kiểm tra phạm vi business.
- `DONE` — UI responsive, API/OpenAPI, migration, seed nhóm khách và E2E quyền/version/trùng dữ liệu.
- `WAITING` — người dùng chính thử luồng nhập/tìm khách và phản hồi tên trường/thứ tự thao tác.

### Kết quả Đợt 03

- `DONE` — sản phẩm có danh mục/thương hiệu/mô tả/trạng thái và optimistic version.
- `DONE` — SKU/barcode duy nhất theo business, biến thể có metadata màu/size tùy chọn.
- `DONE` — mỗi SKU có đơn vị gốc hệ số 1; quy đổi khác dương, mã không trùng và có DB check.
- `DONE` — thêm/sửa/ngừng bán sản phẩm hoặc SKU; không có endpoint xóa cứng.
- `DONE` — metadata ảnh chỉ nhận URL HTTPS, alt text, thứ tự và lưu trữ; chưa giả lập kho file/upload.
- `DONE` — UI responsive, API/OpenAPI, migration và E2E quyền/SKU/quy đổi/media.
- `WAITING` — xác nhận `OPEN-02` trước khi nhập dữ liệu hàng thật; hàng cần lô/hạn/serial vẫn ngoài phạm vi code hiện tại.

### Kết quả Đợt 04A

- `DONE` — nhà cung cấp có mã nội bộ, tìm kiếm, optimistic version và lưu trữ thay vì xóa.
- `DONE` — đơn mua nháp snapshot SKU, đơn vị, hệ số và số lượng cơ sở do backend tính; giá dự kiến là số nguyên VND tùy chọn, chưa ghi giá vốn.
- `DONE` — phát hành khóa sửa dòng; hủy/phát hành/tạo đơn mua không tăng tồn và đều có audit.
- `DONE` — quyền `purchasing.read/write`; owner/kho thao tác được, sales gọi trực tiếp bị `403`.
- `DONE` — UI responsive, API/OpenAPI, migration có DB check và E2E 04A.
- `DONE LOCAL` — 04B phiếu nhận từng phần cập nhật balance/giá vốn và tạo ledger trong transaction Serializable; có idempotency request hash, kiểm soát nhận vượt/cạnh tranh và UI thật. Cần xác nhận `OPEN-02/05` trước pilot.
- `DONE LOCAL` — 04C-A tồn đầu một lần theo SKU/kho chưa có lịch sử tồn; chứng từ lưu snapshot, quantity/cost/value, idempotency, audit và movement; backend dùng `inventory.adjust`, transaction Serializable và khóa unique. UI gọi API thật, tìm kiếm và nạp thêm sản phẩm qua cursor.
- `VERIFIED LOCAL; UI CHECK PENDING` — 04C-B có POST/GET chứng từ kiểm kê/điều chỉnh, migration, ledger signed, idempotency, optimistic version, API permission/cost filtering và UI Kho. Migration mới đã deploy và 29 E2E pass trên PostgreSQL kiểm thử cô lập; cần kiểm tra UI trực quan và xác nhận chính sách định giá BR-STOCK-10 trước khi dùng dữ liệu vận hành.

## Definition of Done cho đợt có code

- Luồng UI → API → DB dùng được trong môi trường test; cả success và lỗi được demo.
- Migration chạy trên DB mới và seed test; API/model/docs cùng cập nhật.
- Test quy tắc liên quan, quyền trực tiếp API, idempotency/concurrency nếu ảnh hưởng kho/tiền.
- Lint, typecheck, test và build chạy; phần không chạy được ghi rõ.
- Không còn lỗi nghiêm trọng về giá/kho/tiền/quyền trong phạm vi.
- Diff được xem; thay đổi ngoài phạm vi được loại bỏ; có commit truy vết.
- Người dùng chính thực hiện được thao tác chính và phản hồi được ghi vào backlog.
