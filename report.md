# Báo cáo trạng thái CRM

Cập nhật: 2026-10-05 (Asia/Ho_Chi_Minh)

## Tóm tắt

Repo đang ở branch `main`, HEAD `6639854 feat: add opening stock ledger command`. 04C-B đã được triển khai trong working tree và kiểm tra trên PostgreSQL thử cô lập theo `docs/HANDOFF.md`; chưa có commit mới. Các chỉnh sửa chưa commit từ trước được giữ nguyên. `prompt-tiep-tuc-crm.md` là file người dùng cung cấp, vẫn để nguyên.

Đợt 05A hiện được triển khai một phần thật: migration, API và UI CRM để admin lưu bậc giá theo SKU, cùng resolver chọn bậc. Giá bậc trống trả trạng thái chờ OPEN-03, không tự tính. Báo giá, giá lẻ, giảm thêm và chuyển đơn chưa được triển khai.

## Tiến độ theo đợt

| Đợt                                          | Trạng thái hiện tại                                                                                                                                                       | Còn thiếu                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00 — Đặc tả/prototype                        | Tài liệu và prototype có sẵn; prototype bảng giá được bổ sung trong lần này.                                                                                              | Chưa có biên bản người dùng chính thử giao diện; chưa có bằng chứng thử connector Facebook/Zalo bằng tài khoản/quyền thật; OPEN-01..05 chưa chốt đầy đủ. |
| 01 — Nền tảng/auth/RBAC                      | Đã có code local, migration, seed và CI workflow theo docs/backlog.                                                                                                       | Chạy CI với các thay đổi local hiện tại; hoàn thiện kiểm tra vận hành/backup trước pilot.                                                                |
| 02 — Khách hàng                              | Đã có UI/API/DB/E2E local.                                                                                                                                                | Chưa có phản hồi user test; kiểm tra hồ sơ/quy trình với dữ liệu thật trước pilot.                                                                       |
| 03 — Sản phẩm/SKU/đơn vị                     | Đã có UI/API/DB/E2E local theo giả định kỹ thuật.                                                                                                                         | Chốt OPEN-02 trước khi nhập danh mục thật; chưa hỗ trợ lô, hạn dùng, serial.                                                                             |
| 04A–04C-B — Mua hàng/kho                     | Đã có đơn mua, nhận hàng, tồn đầu, kiểm kê/điều chỉnh có chứng từ; thay đổi hiện nằm trong working tree. Migration và 29 E2E đã qua trên DB kiểm thử cô lập theo handoff. | Chưa kiểm tra trực quan UI 04C-B. BR-STOCK-10 còn chờ xác nhận trước dữ liệu vận hành.                                                                   |
| 05A — Giá admin theo SKU                     | Đã thêm migration, API CRUD bậc giá, resolver, quyền `price.edit`, version/idempotency/audit và UI CRM gọi API. Kiểm tra local Node 24 pass.                              | Chưa kiểm tra trực quan UI. Công thức bậc trống, giá lẻ, lịch giá nhóm/khách, giảm thêm và báo giá chưa làm.                                             |
| 05B–C — Báo giá/chuyển đơn nháp              | Chưa triển khai.                                                                                                                                                          | Chốt OPEN-03, thời hạn báo giá và chính sách duyệt; cần luồng báo giá snapshot trước khi nối sang đơn.                                                   |
| 06 — Đơn hàng                                | Chưa triển khai.                                                                                                                                                          | Phụ thuộc giá, quy tắc công nợ và giữ hàng.                                                                                                              |
| 07 — Thu tiền/công nợ                        | Chưa triển khai.                                                                                                                                                          | Chốt thời điểm phát sinh phải thu, phân bổ và xử lý trả thừa.                                                                                            |
| 08 — Đổi trả/COD/báo cáo/import/backup/pilot | Chưa triển khai đầy đủ.                                                                                                                                                   | Định nghĩa quy trình, chạy thử backup/restore và kiểm tra trước pilot.                                                                                   |
| 09 — Hộp thư Facebook/Zalo                   | Chưa có tích hợp thật.                                                                                                                                                    | Xác minh loại tài khoản/kênh, quyền API và thử bằng tài khoản được cấp.                                                                                  |
| 10 — AI hỗ trợ                               | Chưa triển khai.                                                                                                                                                          | Phụ thuộc hộp thư, chính sách duyệt và dữ liệu đáng tin cậy.                                                                                             |
| 11 — Website/OTP                             | Chưa triển khai.                                                                                                                                                          | Phụ thuộc khách hàng, giá, đơn, tiền và xác thực khách.                                                                                                  |
| 12 — Thanh toán online/giao vận API          | Chưa triển khai.                                                                                                                                                          | Chọn provider, có hợp đồng/tài khoản sandbox và quy tắc đối soát.                                                                                        |
| 13 — Sàn thương mại điện tử                  | Chưa triển khai.                                                                                                                                                          | Chọn sàn và xác minh quyền/API.                                                                                                                          |
| 14 — Marketing/báo cáo nâng cao              | Chưa triển khai.                                                                                                                                                          | Cần dữ liệu và nhu cầu vận hành đã được xác nhận.                                                                                                        |
| 15 — API đối tác/dự báo/tối ưu               | Chưa triển khai.                                                                                                                                                          | Chỉ xem xét khi core ổn định và có dữ liệu phù hợp.                                                                                                      |

## Quy tắc giá đã nhận và phần còn thiếu

Đã nhận: bậc tính theo đơn vị bán; lượng 5–9 dùng bậc 5, 10–14 dùng bậc 10, 15–19 dùng bậc 15, tiếp tục mỗi 5. Giá admin nhập cho bậc được ưu tiên. Admin có thể giảm thêm. Báo giá có hạn 3 ngày.

Chưa chốt: công thức/nguồn giá tự tính khi ô bậc trống; lịch giá chung hay theo nhóm/khách; kiểu và phạm vi giảm thêm; “thông báo đơn mới” chỉ gửi thông báo hay chặn đơn để chờ duyệt; 3 ngày là 72 giờ hay hết ngày thứ ba. Những mục này tác động trực tiếp số tiền và hành vi đơn hàng; chưa đưa vào API/DB thật.

## Mã giả resolver Đợt 05A

```text
nếu số_lượng < 1 hoặc không phải số nguyên:
    từ chối đầu vào
nếu số_lượng <= 4:
    dùng giá lẻ
ngược lại:
    bậc = floor(số_lượng / 5) * 5
    nếu admin đã nhập giá cho (business, SKU, bậc):
        dùng giá admin nhập
    nếu chưa nhập:
        trả AUTO_PRICE_RULE_REQUIRED, không trả số tiền
```

UI CRM chính hiện thực thao tác lưu thật các giá admin đã nhập. Prototype tĩnh trong `prototype/` vẫn chỉ dùng dữ liệu mẫu và không lưu. Resolver chưa thể tạo giá cho bậc trống; không có giá lẻ, báo giá hay đơn bán ở lát cắt này.

## Chạy project/prototype

Từ PowerShell tại repo, chạy:

```powershell
python -m http.server 4173
```

Mở `http://localhost:4173/prototype/` để xem prototype mẫu. Để thử UI dùng DB thật, chạy đầy đủ API/web theo `docs/LOCAL_DEVELOPMENT.md`, đăng nhập tài khoản có `price.edit`, mở **Bảng giá**, chọn SKU và nhập giá; giá được lưu qua API. Bậc trống sẽ được báo là đang chờ quy tắc tự tính.

## Kiểm tra và lưu ý kỹ thuật

- Trên Node 24.18.0 trong Docker: `npm run lint`, `npm run typecheck`, `npm test` (15 tests), `npm run format:check` và `NODE_ENV=production npm run build` đều pass.
- PostgreSQL 17.6 thử cô lập trên cổng 55434: Prisma validate/generate, deploy đủ 11 migration, seed và E2E 8 file/32 tests đều pass. DB là `crm-05a-pricing-db` (volume `crm_05a_pricing_data`); không đụng PostgreSQL local cổng 5432.
- Chưa kiểm tra trực quan UI qua trình duyệt; typecheck/build/E2E không xác nhận bố cục và thao tác thực tế trên browser.
- `npm ci` trước đó báo 9 cảnh báo high severity; chưa phân tích bằng `npm audit`, chưa tự ý đổi dependency.
- CI remote gần nhất chỉ chạy trên commit cũ `6639854`, không bao gồm thay đổi local.
- Không xóa DB/volume thử, không tác động PostgreSQL cục bộ ở cổng 5432. Không commit/push/deploy khi chưa được yêu cầu.

## Việc nên làm tiếp

1. Mở CRM local theo `docs/LOCAL_DEVELOPMENT.md`, kiểm tra trực quan UI Kho 04C-B và Bảng giá 05A; ghi nhận phản hồi.
2. Xác nhận BR-STOCK-10 trước khi dùng tồn kho thật.
3. Chốt các phần OPEN-03 còn thiếu: công thức/nguồn giá cho bậc trống; giá lẻ và phạm vi nhóm/khách; dạng/phạm vi giảm thêm; thông báo hay duyệt đơn; mốc hết hạn 3 ngày.
4. Sau khi có quyết định giá/duyệt/thời hạn, hoàn thiện 05A và tiếp tục báo giá 05B, chuyển đơn nháp 05C. Hiện chưa tính giá bậc trống và chưa tạo báo giá/đơn bán.
5. Không commit/push/deploy nếu chưa được yêu cầu; các thay đổi chưa commit hiện có được giữ nguyên.
