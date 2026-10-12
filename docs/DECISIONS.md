# Nhật ký quyết định

## DEC-CHANNEL-UX-01 — Người dùng kết nối Fanpage không cấu hình Meta app (2026-10-11)

- **Đã chốt theo phản hồi của chủ dự án:** người quản lý Fanpage không cần biết Meta for Developers, App ID, App Secret, Graph version, callback hoặc webhook. Luồng họ dùng là mở CRM → bấm Kết nối Facebook → đăng nhập/cấp quyền trong Meta → chọn Fanpage nếu có nhiều Page → hoàn tất. Cấp lại quyền khi hết hạn/thu hồi dùng nút Kết nối lại.
- **Phân trách nhiệm:** CRM/đơn vị triển khai cấu hình và duy trì một Meta app của dịch vụ ở backend trước khi mở nút cho người dùng. App ID/secret, scope, HTTPS callback/webhook, review và vận hành không phải bước onboarding của từng khách. Không thể bỏ qua yêu cầu app của Meta bằng cách chỉ biết URL Page hoặc dùng đăng nhập Facebook cá nhân để cào dữ liệu.
- **Trạng thái hiện tại:** chủ dự án xác nhận chưa có Meta app; UI chỉ báo dịch vụ chưa sẵn sàng, không tuyên bố Page đã kết nối. Code OAuth local tiếp tục được tái sử dụng; kiểm thử live chờ app/permissions và browser/helper hoặc thao tác cấp quyền của chủ Page.

## DEC-SYNC-01 — Nhập đa kênh inbound-only (2026-10-08)

- **Đã chốt theo yêu cầu giao việc:** nền quản lý connection/webhook/job; Messenger + Page comments; Zalo OA messages và kiểm tra riêng comment API; Shopee/TikTok Shop orders; inbox/staging UI và mapping. V1 chỉ nhập dữ liệu, không ghi order/stock/payment/AR/revenue.
- **Bất biến:** unique external keys và alert dedupe; link customer/SKU thủ công; không auto-merge; internal note never outbound; provider capability chỉ verified sau test thật.
- **Chưa chốt / cần giữ blocker:** credential/OAuth lifecycle; retention tin/ảnh/recipient data; scope nhân viên xem; Zalo comment API; cấp quyền/review của từng app/shop và evidence test thật.
- **Tác động:** additive schema migration + integration APIs/UI. Không commit/push/deploy trong lượt này; không chạy migration lên DB vận hành.
- **Cập nhật code local 2026-10-08:** Zalo OA `user_send_*` inbound webhook có verifier/payload adapter theo tài liệu chính thức, vẫn cần test OA để xác nhận chữ ký/payload thực tế. Không coi unit/E2E fixture là evidence tích hợp.

## 1. Quyết định đã chốt ở mức kiến trúc

| ID      | Trạng thái | Quyết định                                                                                                                                               | Lý do/hệ quả                                                                           |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ADR-001 | Accepted   | Modular monolith, chưa dùng microservices                                                                                                                | Giao dịch kho/tiền đơn giản hơn; vẫn chia module và owner rõ                           |
| ADR-002 | Accepted   | Next.js + React + TypeScript cho web; NestJS + TypeScript cho API                                                                                        | Một ngôn ngữ, hợp đồng có kiểu; phiên bản cụ thể khóa ở Đợt 01                         |
| ADR-003 | Accepted   | PostgreSQL + Prisma; migration tăng dần                                                                                                                  | Ràng buộc/giao dịch mạnh; không tạo toàn schema ngay                                   |
| ADR-004 | Accepted   | REST `/api/v1` + OpenAPI                                                                                                                                 | CRM, website và đối tác dùng cùng backend; contract test từ Đợt 01                     |
| ADR-005 | Accepted   | Redis/BullMQ chỉ thêm từ đợt cần job/connector                                                                                                           | Không thêm vận hành sớm; phải có retry/dead-letter/quan sát khi dùng                   |
| ADR-006 | Accepted   | UTC khi lưu, `Asia/Ho_Chi_Minh` khi xác định ngày báo cáo; VND số nguyên                                                                                 | Tránh lệch ngày và sai số tiền                                                         |
| ADR-007 | Accepted   | Snapshot chứng từ + sổ biến động; projection không thay sổ                                                                                               | Lịch sử không đổi và số tổng truy ngược được                                           |
| ADR-008 | Accepted   | Prototype Đợt 00 là tĩnh, gắn nhãn dữ liệu mẫu                                                                                                           | Xác nhận UX mà không giả là nghiệp vụ đã hoạt động                                     |
| ADR-009 | Accepted   | Node.js 24 LTS, Next.js 16.3.7, NestJS 12.1.2, PostgreSQL 17.6 và Prisma 7.10.0 cho Đợt 01                                                               | Khóa phiên bản bằng lockfile/container; Node 25 local không thuộc dải hỗ trợ của dự án |
| ADR-010 | Accepted   | Phiên nhân viên lưu phía server; trình duyệt chỉ giữ cookie `HttpOnly`, `SameSite=Lax`; token lưu DB dưới dạng SHA-256 và request ghi bị kiểm tra origin | Có thể thu hồi/khóa phiên, không lộ token cho JavaScript và giảm rủi ro CSRF           |

### Ghi chú phụ thuộc Đợt 01

`npm audit` ngày 2026-09-30 còn báo 4 cảnh báo mức high trong cây công cụ Prisma CLI (`deepmerge-ts`/`mysql2`). Phương án tự động duy nhất hiện được npm đề xuất là hạ Prisma xuống major 6, nên chưa dùng `--force` vì sẽ phá vỡ ADR-009 và cấu hình Prisma 7. Cần kiểm tra lại khi Prisma phát hành bản ổn định có cây phụ thuộc đã sửa; không xem cảnh báo này là đã xử lý.

Lần `npm ci` ngày 2026-10-05 trong Node 24.18.0 báo 9 high severity vulnerabilities trên 739 package được audit. Chưa chạy `npm audit` để phân tích advisory mới; không chạy `npm audit fix` và không thay dependency cho tới khi xem tác động lên ADR-009.

## 2. Quy ước tạm dùng

Các mục sau đủ để viết tài liệu/prototype nhưng **không tự động trở thành cấu hình production**: một đơn vị kinh doanh, một kho; giá vốn bình quân gia quyền; giá sỉ theo nhóm/bậc; vận đơn nhập tay; AI chỉ gợi ý có duyệt. Giả định cũ “báo giá không giữ hàng” đã được thay thế ngày 2026-10-07: giữ đủ hàng khi khách chấp nhận báo giá, nhả khi hủy đơn.

Đợt 03 dùng đơn vị gốc và quy đổi cái/hộp/thùng, thuộc tính biến thể dạng metadata, chưa có lô/hạn dùng/serial. Ảnh chỉ lưu metadata URL HTTPS; không tuyên bố có upload/kho file.

Đợt 04A chỉ triển khai nhà cung cấp và đơn mua theo các quy đổi đã có; giá dự kiến trên dòng là metadata số nguyên VND, không cập nhật giá vốn. Đợt 04B dùng giả định kỹ thuật một kho, SKU đóng gói, số lượng tối đa 6 số lẻ, nhận từng phần và giá vốn bình quân gia quyền để kiểm chứng luồng local. Đây chưa phải xác nhận chính sách hàng thật; cần đối chiếu `OPEN-02/05` trước pilot.

Đợt 04C-A thêm chứng từ tồn đầu một lần cho mỗi SKU/kho chưa có lịch sử tồn, dùng giá trị nguyên VND và snapshot danh mục. Đây là thao tác ghi sổ thật trong môi trường local, không phải import hàng thật được duyệt. Kiểm kê/điều chỉnh sẽ là chứng từ riêng ở 04C-B; không cho sửa trực tiếp balance.

## 3. Năm quyết định cần chủ dự án xác nhận trước Đợt 01–06

Không thêm câu hỏi chặn mới vào danh sách này; câu hỏi phát sinh phải gộp vào mục phù hợp hoặc đưa sang backlog của đợt sau.

### OPEN-01 — Kênh bán thực tế và tài khoản có thể thử

- Cập nhật 2026-10-07: đã chọn Facebook làm kênh tích hợp đầu tiên. Chưa xác nhận đây là Messenger của Fanpage nào hay loại tài khoản cụ thể; chưa có app/quyền/tài khoản thử.
- Còn cần trước khi gọi API: Page/account ID (không cần gửi secret trong chat), app developer/test, quyền được cấp, và quyền nhận/gửi tin cần thử.
- Tạm dùng: chuẩn bị kiến trúc cho Facebook Page Messenger; giữ nhập khách/đơn thủ công cho tới khi có kiểm chứng.
- Ảnh hưởng: khả năng tích hợp chính thức, định danh khách, quyền app, webhook, thời gian xét duyệt.
- Không tự làm: không dùng cách tự động hóa tài khoản cá nhân và không tuyên bố đã tích hợp khi chưa có test API thật.

### OPEN-02 — Ngành hàng, SKU và cách quản lý đơn vị/lô

- Trạng thái: **Chưa xác nhận cho dữ liệu thật**. Đợt 04B chạy local theo giả định kỹ thuật ở mục 2; nếu hàng thật cần cân nặng, lô, hạn dùng hoặc serial thì phải thiết kế bổ sung trước pilot.

- Cần trả lời: bán mặt hàng gì, khoảng bao nhiêu SKU, dùng cái/hộp/thùng hay cân nặng, có màu/size, hạn dùng, lô hoặc serial không?
- Tạm dùng: hàng có sẵn; SKU biến thể; một đơn vị cơ sở và quy đổi cái/hộp/thùng; không lô/hạn dùng/serial.
- Ảnh hưởng: precision số lượng, schema kho, kiểm kê, giá vốn, quy trình trả hàng và vận chuyển.

### OPEN-03 — Chính sách giá sỉ và giảm giá

- Trạng thái: **Đã chốt ngày 2026-10-07.**
- Đã xác nhận: bảng giá dùng chung; mỗi SKU có một đơn vị bán cố định do admin chọn (ví dụ gói, kg hoặc thùng 10kg); giá admin nhập theo đơn vị này. Số lượng dưới 5 dùng giá lẻ theo đơn vị bán; từ 5 trở lên bậc 5–9 dùng giá bậc 5, 10–14 dùng bậc 10, 15–19 dùng bậc 15 và tiếp tục mỗi 5. Giá còn thiếu không tự tính. Cho phép số lượng lẻ; thành tiền từng dòng làm tròn về VND nguyên, nửa đồng làm tròn lên. Báo giá hết hạn sau đủ 72 giờ từ lúc khách nhận; nhận báo giá ban đầu được ghi nhận thủ công khi PDF được chia sẻ. Gửi giai đoạn đầu bằng PDF/in/chia sẻ thủ công; gửi tự động chờ tài khoản thử. Giảm thêm hỗ trợ phần trăm hoặc VND trên dòng hoặc toàn báo giá. Báo giá có phí giao, thuế, cọc dự kiến, ghi chú thanh toán. Chuyển báo giá còn hạn giữ giá đã chốt. Khi khách đặt qua nền tảng cần thông báo Admin.
- Trạng thái code trước khi mở rộng: lưu giá admin theo business/SKU/bậc nguyên cách 5. Phần mở rộng thêm đơn vị bán cố định, giá lẻ bậc 1 và số lượng thập phân; migration fresh DB và E2E đã xác minh local ngày 2026-10-06.
- Cập nhật: người có quyền quản lý (`price.edit`) được tự đặt mức giảm phần trăm hoặc VND, theo dòng hoặc toàn báo giá; không có trần số tiền/tỷ lệ cấu hình sẵn.
- Đã xác nhận ngày 2026-10-06: báo giá cho phép nhập thuế theo phần trăm hoặc số tiền VND; phạm vi là toàn báo giá.
- Chốt ngày 2026-10-07: giữ cách tính đang triển khai — giảm theo dòng trước, giảm toàn báo giá sau; chọn một cách thuế trên mỗi báo giá; thuế phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc.
- Ảnh hưởng: khóa đơn vị bán và bậc Decimal, cách tính tổng báo giá, audit quyền giảm, snapshot, hạn hiệu lực và chuyển sang đơn nháp.

### OPEN-04 — Chính sách mua nợ

- Trạng thái: **Đã chốt ngày 2026-10-07: không bán chịu; thu đủ trước khi xác nhận đơn. Phải thu ghi nhận tại thời điểm xác nhận.**
- Nhiều lần thu/thu một phần được phép trước xác nhận; đơn chưa thu đủ vẫn là nháp. Khi xác nhận, ghi nhận phải thu rồi đối trừ khoản thu đã phân bổ để số dư còn phải thu bằng 0.
- Không có hạn mức nợ/override bán chịu theo lựa chọn hiện tại.

### OPEN-05 — Giữ hàng, giao một phần và giá vốn

- Trạng thái: **Đã chốt phần giữ hàng/giao/giá vốn ngày 2026-10-07; thời hạn trả hàng thuộc Đợt 08 còn thiếu số ngày.**

- Đã chốt: giữ tồn khi khách chấp nhận báo giá; không tự hết hạn, chỉ giải phóng khi hủy đơn; không cho giao thiếu; giá vốn bình quân gia quyền; hàng trả chỉ vào tồn khả dụng sau kiểm tra, hàng lỗi vào khu chờ xử lý.
- Hệ quả triển khai: vì giữ toàn bộ lượng và không giao thiếu, nếu tồn khả dụng không đủ thì từ chối chuyển báo giá thành đơn (không giữ một phần). Đây là hệ quả logic của lựa chọn; sẽ báo rõ lỗi thiếu tồn.
- Còn thiếu cho Đợt 08: thời hạn nhận trả hàng, tính từ ngày giao, cần số ngày cụ thể.
- Cập nhật 2026-10-08: triển khai cấu hình nullable, không mặc định số ngày; quản lý nhập số nguyên 1–3650 thì mới tiếp nhận. Request snapshot số ngày và hạn; cách tính kỹ thuật hiện là đủ 24 giờ × số ngày, hạn inclusive. Đây là cách diễn giải kỹ thuật chưa thay thế xác nhận “số ngày cụ thể” trước pilot.
- Ảnh hưởng: chuyển báo giá thành đơn, transaction cạnh tranh, reservation, hủy/giải phóng, xuất kho, trả hàng và báo cáo.

## 4. Chính sách đã chốt bổ sung ngày 2026-10-07

- **Thu tiền (Đợt 07):** cho phép thu nhiều lần và thu một phần; nhân viên chủ động chọn khoản nợ/đơn để phân bổ, hệ thống có thể gợi ý khoản cũ nhất. Tiền thu thừa trở thành số dư khách hàng. Không bán chịu; phải thu ghi nhận lúc xác nhận đơn sau khi thu đủ 100%, rồi bù trừ các khoản đã phân bổ trước đó.
- **Đổi trả/COD/báo cáo (Đợt 08):** hàng hoàn chỉ nhập tồn khả dụng sau kiểm tra chất lượng; hàng lỗi vào khu chờ xử lý. COD chỉ ghi nhận khi nhân viên đối soát số tiền thực nhận. Doanh thu ghi theo lượng hàng đã giao. Thời hạn nhận trả kể từ ngày giao chưa có số ngày nên vẫn mở.
- **Kênh đầu tiên (Đợt 09):** Facebook được chọn ưu tiên; chuẩn bị lõi kỹ thuật thuộc phạm vi dự án, nhưng chưa có Page/app/quyền/tài khoản thử để gọi API hoặc nghiệm thu connector thật.
- Các lựa chọn này cập nhật `BUSINESS_RULES.md`, `DATA_MODEL.md`, `API_CONTRACT.md`, `ACCEPTANCE.md`, `BACKLOG.md` và `INTEGRATION_READINESS.md`. Quyết định nghiệp vụ không phải bằng chứng code đã hỗ trợ.

## 5. Cách ghi nhận câu trả lời

Khi được xác nhận, đổi `OPEN-*` thành ADR mới gồm ngày, người quyết định, lựa chọn, ví dụ cụ thể và tác động tới `BUSINESS_RULES`, `DATA_MODEL`, `API_CONTRACT`, `ACCEPTANCE`. Không xóa nội dung cũ; ghi quyết định thay thế để truy vết.

## 6. Quyết định nghiệp vụ bổ sung

### DEC-CUS-01 — Phân nhóm theo kênh nguồn (2026-10-08)

- **Trạng thái:** Đã chốt bởi chủ dự án.
- **Quyết định:** Facebook/Messenger và Zalo là nguồn khách sỉ; Shopee và TikTok Shop là nguồn khách lẻ.
- **Cách áp dụng:** Backend tự đặt nhóm trong create/update nếu nguồn nhận diện thuộc các kênh trên; dữ liệu nhóm do client gửi không được ghi đè mapping. Nguồn khác/không rõ vẫn dùng lựa chọn thủ công.
- **Tác động:** Không đổi schema; lưu tiếp vào `Customer.source` và dùng `Customer.groupId` hiện có. Có E2E cho mapping; không đồng nghĩa connector đã kết nối.
