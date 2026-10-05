# Báo cáo trạng thái CRM

Cập nhật: 2026-10-05 (Asia/Ho_Chi_Minh)

## Tóm tắt

Repo đang ở branch `main`, merge hai phiên bản home/main tại `f4ea342`; CI trên commit merge đã pass. Đợt 05A đang được mở rộng tại working tree với đơn vị bán cố định, giá lẻ và số lượng thập phân. Tài liệu Đợt 05B–C đang được cập nhật theo quyết định nghiệp vụ nhận ngày 2026-10-05; chưa triển khai báo giá/chuyển đơn.

Đợt 05A có API/UI/DB cho giá admin theo SKU/bậc; phần mở rộng hiện thêm migration cho đơn vị bán cố định và giá lẻ bậc 1, còn chờ kiểm tra migration/build. Bảng giá dùng chung; giá lẻ và bậc do admin nhập; số lượng thập phân được phép; giá thiếu không tự tính. Người có `price.edit` tự đặt mức giảm không có trần số riêng. Chỉ cách nhập/tính thuế còn chờ chốt.

## Tiến độ theo đợt

| Đợt                                          | Trạng thái hiện tại                                                                                                                                                       | Còn thiếu                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00 — Đặc tả/prototype                        | Tài liệu và prototype có sẵn; prototype bảng giá được bổ sung trong lần này.                                                                                              | Chưa có biên bản người dùng chính thử giao diện; chưa có bằng chứng thử connector Facebook/Zalo bằng tài khoản/quyền thật; OPEN-01..05 chưa chốt đầy đủ. |
| 01 — Nền tảng/auth/RBAC                      | Đã có code local, migration, seed và CI workflow theo docs/backlog.                                                                                                       | Chạy CI với các thay đổi local hiện tại; hoàn thiện kiểm tra vận hành/backup trước pilot.                                                                |
| 02 — Khách hàng                              | Đã có UI/API/DB/E2E local.                                                                                                                                                | Chưa có phản hồi user test; kiểm tra hồ sơ/quy trình với dữ liệu thật trước pilot.                                                                       |
| 03 — Sản phẩm/SKU/đơn vị                     | Đã có UI/API/DB/E2E local theo giả định kỹ thuật.                                                                                                                         | Chốt OPEN-02 trước khi nhập danh mục thật; chưa hỗ trợ lô, hạn dùng, serial.                                                                             |
| 04A–04C-B — Mua hàng/kho                     | Đã có đơn mua, nhận hàng, tồn đầu, kiểm kê/điều chỉnh có chứng từ; thay đổi hiện nằm trong working tree. Migration và 29 E2E đã qua trên DB kiểm thử cô lập theo handoff. | Chưa kiểm tra trực quan UI 04C-B. BR-STOCK-10 còn chờ xác nhận trước dữ liệu vận hành.                                                                   |
| 05A — Giá admin theo SKU                     | API/UI/schema có phần mở rộng đơn vị bán cố định, giá lẻ bậc 1 và resolver lượng thập phân; typecheck/lint/unit test/build đạt.                                                | Migration/E2E DB chưa chạy vì Docker Desktop chưa hoạt động; UI chưa được kiểm tra trực quan.                                                             |
| 05B–C — Báo giá/chuyển đơn nháp              | Đặc tả một phần đã cập nhật: PDF/chia sẻ tay, hạn 72 giờ từ lúc nhận, giá snapshot và các khoản báo giá.                                                                   | Cần chốt cách tính thuế; sau đó triển khai quote/revision/PDF và chuyển thành đơn nháp.                                                                   |
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

Đã chốt: bảng giá chung; một đơn vị bán cố định cho mỗi SKU; dưới 5 dùng giá lẻ, từ 5 trở lên dùng bậc 5/10/15 theo mỗi 5 đơn vị; cho phép lượng lẻ đến 6 chữ số thập phân; làm tròn từng dòng VND nửa lên; thiếu giá thì không tự tính. Giảm % hoặc VND theo dòng/toàn báo giá, phí giao, thuế, cọc dự kiến và ghi chú. Báo giá hết hạn sau 72 giờ từ lúc khách nhận; giai đoạn đầu xuất PDF/in/chia sẻ thủ công. Chuyển báo giá còn hạn giữ giá snapshot.

Chưa chốt: tính thuế theo phần trăm hay số VND. Người có `price.edit` tự đặt mức giảm, không áp trần số riêng. Khách đặt qua nền tảng cần thông báo Admin; connector thông báo tự động đợi tài khoản thử và quyền API.

## Mã giả resolver Đợt 05A

```text
 nếu số_lượng <= 0 hoặc vượt precision 6 chữ số thập phân:
    từ chối đầu vào
 nếu số_lượng < 5:
    dùng giá lẻ theo đơn vị bán cố định của SKU
ngược lại:
    bậc = floor(số_lượng / 5) * 5
    nếu admin đã nhập giá cho (business, SKU, bậc):
        dùng giá admin nhập
    nếu chưa nhập:
        trả PRICE_NOT_CONFIGURED, không trả số tiền
```

UI CRM chính lưu giá admin qua API. Prototype tĩnh trong `prototype/` vẫn chỉ dùng dữ liệu mẫu và không lưu. Giá lẻ đã có thể cấu hình ở bậc 1 theo đơn vị bán; báo giá và đơn bán chưa triển khai; resolver báo thiếu giá thay vì tự tính.

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
- CI trên merge commit `f4ea342` đã pass; thay đổi tài liệu đang ở working tree chưa commit.
- Không xóa DB/volume thử, không tác động PostgreSQL cục bộ ở cổng 5432. Không commit/push/deploy khi chưa được yêu cầu.

## Việc nên làm tiếp

1. Mở CRM local theo `docs/LOCAL_DEVELOPMENT.md`, kiểm tra trực quan UI Kho 04C-B và Bảng giá 05A; ghi nhận phản hồi.
2. Xác nhận BR-STOCK-10 trước khi dùng tồn kho thật.
3. Chốt phần OPEN-03 còn thiếu: cách nhập/tính thuế.
4. Hoàn tất kiểm tra migration/build của phần mở rộng 05A đang có trong working tree; sau đó làm báo giá 05B và chuyển đơn nháp 05C.
5. Không commit/push/deploy nếu chưa được yêu cầu; các thay đổi chưa commit hiện có được giữ nguyên.
