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

| Đợt | Phạm vi                                               | Phụ thuộc                   | Trạng thái                         |
| --- | ----------------------------------------------------- | --------------------------- | ---------------------------------- |
| 01  | Monorepo, môi trường, auth nhân viên, RBAC, audit, CI | 00 đủ quyết định core       | DONE LOCAL; chờ lần chạy CI remote |
| 02  | Khách, nhóm sỉ/lẻ, nhiều địa chỉ, nhắc việc           | 01                          | READY sau khi chốt phạm vi         |
| 03  | Sản phẩm, SKU, đơn vị, ảnh                            | 01 + OPEN-02                | WAITING OPEN-02                    |
| 04  | Nhà cung cấp, nhập hàng, tồn đầu, sổ kho              | 03 + OPEN-05                | LATER                              |
| 05  | Giá sỉ/lẻ, bậc giá, báo giá                           | 02,03 + OPEN-03             | LATER                              |
| 06  | Đơn, xác nhận, giữ, hủy, giao một phần                | 04,05 + OPEN-04/05          | LATER                              |
| 07  | Thu tiền, đặt cọc, công nợ, chi phí                   | 06 + chốt ghi nhận phải thu | LATER                              |
| 08  | Đổi trả, COD tay, báo cáo, import, backup/pilot       | 06,07                       | LATER                              |
| 09  | Hộp thư connector đã kiểm chứng                       | 00,02,06 + quyền thật       | LATER                              |
| 10  | AI gợi ý và đơn nháp                                  | 09 + chính sách duyệt       | LATER                              |
| 11  | Website mua lại, OTP                                  | 02,05–08                    | LATER                              |
| 12  | Online payment + một hãng giao                        | 11 + hợp đồng provider      | LATER                              |
| 13  | Một sàn ưu tiên rồi sàn tiếp                          | 03–08 + quyền               | LATER                              |
| 14  | Marketing/chăm sóc/báo cáo nâng cao                   | 09–13 theo nhu cầu          | LATER                              |
| 15  | API đối tác, dự báo, tối ưu                           | Core ổn định, đủ dữ liệu    | LATER                              |

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

## Definition of Done cho đợt có code

- Luồng UI → API → DB dùng được trong môi trường test; cả success và lỗi được demo.
- Migration chạy trên DB mới và seed test; API/model/docs cùng cập nhật.
- Test quy tắc liên quan, quyền trực tiếp API, idempotency/concurrency nếu ảnh hưởng kho/tiền.
- Lint, typecheck, test và build chạy; phần không chạy được ghi rõ.
- Không còn lỗi nghiêm trọng về giá/kho/tiền/quyền trong phạm vi.
- Diff được xem; thay đổi ngoài phạm vi được loại bỏ; có commit truy vết.
- Người dùng chính thực hiện được thao tác chính và phản hồi được ghi vào backlog.
