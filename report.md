# Báo cáo trạng thái CRM

Cập nhật: 2026-10-06 (Asia/Ho_Chi_Minh)

## Tóm tắt

Repo đang ở branch `main`, HEAD `0ec36c4` (đã có trên `origin/main`); phần tiếp theo Đợt 05B hiện là thay đổi local chưa commit/push. Đợt 05B đã có API/UI báo giá, snapshot/revision, giảm giá, phí giao, thuế, cọc và in/lưu PDF qua trình duyệt. PostgreSQL 17.6 thử cô lập đã nhận 13 migration và seed; 9 file/33 E2E pass trong môi trường Node 24. Đợt 05C chuyển báo giá thành đơn nháp chưa triển khai.

Đợt 05A có API/UI/DB cho giá admin theo SKU/bậc; phần mở rộng và 05B đã migration-verified và E2E-verified trên PostgreSQL 17.6 thử riêng. Bảng giá dùng chung; giá lẻ và bậc do admin nhập; số lượng thập phân được phép; giá thiếu không tự tính. Người có `price.edit` tự đặt mức giảm và thuế. Chủ dự án đã xác nhận thuế có thể nhập theo phần trăm hoặc VND, áp dụng toàn báo giá; cơ sở tính phần trăm và việc kết hợp hai kiểu đang là giả định tạm, cần xác nhận trước khi dùng vận hành.

## Tiến độ theo đợt

| Đợt                                          | Trạng thái hiện tại                                                                                                                                                       | Còn thiếu                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00 — Đặc tả/prototype                        | Tài liệu và prototype có sẵn; prototype bảng giá được bổ sung trong lần này.                                                                                              | Chưa có biên bản người dùng chính thử giao diện; chưa có bằng chứng thử connector Facebook/Zalo bằng tài khoản/quyền thật; OPEN-01..05 chưa chốt đầy đủ. |
| 01 — Nền tảng/auth/RBAC                      | Đã có code local, migration, seed và CI workflow theo docs/backlog.                                                                                                       | Chạy CI với các thay đổi local hiện tại; hoàn thiện kiểm tra vận hành/backup trước pilot.                                                                |
| 02 — Khách hàng                              | Đã có UI/API/DB/E2E local.                                                                                                                                                | Chưa có phản hồi user test; kiểm tra hồ sơ/quy trình với dữ liệu thật trước pilot.                                                                       |
| 03 — Sản phẩm/SKU/đơn vị                     | Đã có UI/API/DB/E2E local theo giả định kỹ thuật.                                                                                                                         | Chốt OPEN-02 trước khi nhập danh mục thật; chưa hỗ trợ lô, hạn dùng, serial.                                                                             |
| 04A–04C-B — Mua hàng/kho                     | Đã có đơn mua, nhận hàng, tồn đầu, kiểm kê/điều chỉnh có chứng từ; migration và E2E local đã qua.                                                                                 | Chưa kiểm tra trực quan UI 04C-B. BR-STOCK-10 còn chờ xác nhận trước dữ liệu vận hành.                                                                   |
| 05A — Giá admin theo SKU                     | API/UI/schema có đơn vị bán cố định, giá lẻ bậc 1 và resolver lượng thập phân; 12 migration + seed và 8 file/32 E2E pass trên DB thử mới.                                    | UI chưa được kiểm tra trực quan; `migrate diff` hiện rỗng khi so schema với DB mới.                                                                        |
| 05B — Báo giá                                | API/UI báo giá nháp, snapshot/revision bất biến, giảm giá, phí giao, thuế, cọc, hạn 72 giờ và in/lưu PDF; 13 migration + seed, 9 file/33 E2E pass trên DB thử.            | Chưa kiểm tra UI trực quan trên browser; xác nhận quy ước tính thuế trước vận hành.                                                                       |
| 05C — Chuyển đơn nháp                        | Chưa triển khai.                                                                                                                                                          | Chuyển báo giá còn hạn giữ snapshot và thông báo Admin cần làm trong lát cắt riêng.                                                                       |
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

Đã chốt: thuế được nhập theo phần trăm hoặc số tiền VND, phạm vi toàn báo giá. Tạm triển khai chọn một kiểu trên mỗi báo giá; thuế phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc; thứ tự giảm theo dòng rồi giảm toàn báo giá. Cần xác nhận/điều chỉnh giả định này trước vận hành. Người có `price.edit` tự đặt mức giảm/thuế, không áp trần số riêng. Khách đặt qua nền tảng cần thông báo Admin; connector thông báo tự động đợi tài khoản thử và quyền API.

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
- PostgreSQL 17.6 thử cô lập trên cổng 55434: deploy đủ 12 migration, seed và E2E 8 file/32 tests pass trên Node 24. Container thử `crm-05a-review-20261006` đã được dọn sau kiểm thử; không đụng PostgreSQL local cổng 5432. `prisma migrate diff` còn duy nhất đề xuất rename index stock adjustment từ migration 04C-B; chưa sửa ngoài phạm vi.
- Chưa kiểm tra trực quan UI qua trình duyệt; typecheck/build/E2E không xác nhận bố cục và thao tác thực tế trên browser.
- `npm ci` trước đó báo 9 cảnh báo high severity; chưa phân tích bằng `npm audit`, chưa tự ý đổi dependency.
- CI trên merge commit `f4ea342` đã pass; thay đổi tài liệu đang ở working tree chưa commit.
- Không xóa DB/volume thử, không tác động PostgreSQL cục bộ ở cổng 5432. Không commit/push/deploy khi chưa được yêu cầu.

## Việc nên làm tiếp

1. Mở CRM local theo `docs/LOCAL_DEVELOPMENT.md`, kiểm tra trực quan UI Kho 04C-B và Bảng giá 05A; ghi nhận phản hồi.
2. Xác nhận BR-STOCK-10 trước khi dùng tồn kho thật.
3. Kiểm tra trực quan UI 05B trên browser và xin xác nhận giả định cơ sở/ghép cách tính thuế.
4. Triển khai 05C chuyển báo giá còn hạn thành đơn nháp và thông báo Admin theo phạm vi/đặc tả riêng.
5. Không commit/push/deploy nếu chưa được yêu cầu; các thay đổi chưa commit hiện có được giữ nguyên.
