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

| Đợt | Phạm vi                                               | Phụ thuộc                   | Trạng thái                          |
| --- | ----------------------------------------------------- | --------------------------- | ----------------------------------- |
| 01  | Monorepo, môi trường, auth nhân viên, RBAC, audit, CI | 00 đủ quyết định core       | DONE LOCAL; chờ lần chạy CI remote  |
| 02  | Khách, nhóm sỉ/lẻ, nhiều địa chỉ, nhắc việc           | 01                          | DONE LOCAL; chờ phản hồi người dùng |
| 03  | Sản phẩm, SKU, đơn vị, ảnh                            | 01 + OPEN-02                | DONE LOCAL theo giả định tạm        |
| 04  | Nhà cung cấp, nhập hàng, tồn đầu, sổ kho              | 03 + OPEN-05                | 04A–04C-B DONE LOCAL                |
| 05  | Giá sỉ/lẻ, bậc giá, báo giá                           | 02,03 + OPEN-03             | LATER                               |
| 06  | Đơn, xác nhận, giữ, hủy, giao một phần                | 04,05 + OPEN-04/05          | LATER                               |
| 07  | Thu tiền, đặt cọc, công nợ, chi phí                   | 06 + chốt ghi nhận phải thu | LATER                               |
| 08  | Đổi trả, COD tay, báo cáo, import, backup/pilot       | 06,07                       | LATER                               |
| 09  | Hộp thư connector đã kiểm chứng                       | 00,02,06 + quyền thật       | LATER                               |
| 10  | AI gợi ý và đơn nháp                                  | 09 + chính sách duyệt       | LATER                               |
| 11  | Website mua lại, OTP                                  | 02,05–08                    | LATER                               |
| 12  | Online payment + một hãng giao                        | 11 + hợp đồng provider      | LATER                               |
| 13  | Một sàn ưu tiên rồi sàn tiếp                          | 03–08 + quyền               | LATER                               |
| 14  | Marketing/chăm sóc/báo cáo nâng cao                   | 09–13 theo nhu cầu          | LATER                               |
| 15  | API đối tác, dự báo, tối ưu                           | Core ổn định, đủ dữ liệu    | LATER                               |

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
- `DONE LOCAL` — 04C-B kiểm kê từng SKU/kho lưu số hệ thống, số đếm, version kỳ vọng, lý do, snapshot, idempotency và audit. Tồn/version, movement chênh lệch và chứng từ được chốt trong Serializable transaction; lượng đã giữ/không đủ điều kiện được bảo vệ. UI gọi API thật. Mỗi chứng từ xử lý một SKU; giá trị tăng/giảm tạm theo bình quân gia quyền, cần xác nhận `OPEN-02/05` trước khi dùng thật.

## Definition of Done cho đợt có code

- Luồng UI → API → DB dùng được trong môi trường test; cả success và lỗi được demo.
- Migration chạy trên DB mới và seed test; API/model/docs cùng cập nhật.
- Test quy tắc liên quan, quyền trực tiếp API, idempotency/concurrency nếu ảnh hưởng kho/tiền.
- Lint, typecheck, test và build chạy; phần không chạy được ghi rõ.
- Không còn lỗi nghiêm trọng về giá/kho/tiền/quyền trong phạm vi.
- Diff được xem; thay đổi ngoài phạm vi được loại bỏ; có commit truy vết.
- Người dùng chính thực hiện được thao tác chính và phản hồi được ghi vào backlog.
