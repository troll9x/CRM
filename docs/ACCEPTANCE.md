# Kế hoạch nghiệm thu

**Cổng nghiệm thu 31/10/2026:** [Đối chiếu kế hoạch gốc và khoảng thiếu](ACCEPTANCE_GAP_AUDIT_2026-10-31.md). Bản nội bộ Đợt 00–08 chưa đạt; các dấu kiểm bên dưới chỉ áp dụng cho đúng phạm vi và bằng chứng ghi tại từng mục. Chưa có biên bản người dùng chính nghiệm thu trọn một đơn sỉ và một đơn lẻ trên môi trường thử.

**Phạm vi đã xác nhận 31/10:** giao đủ một lần, thu đủ trước xác nhận, không bán chịu/COD. Các kịch bản cũ có giao 6 rồi 4 hoặc dư nợ khi xác nhận là ví dụ kế hoạch gốc đã được thay thế; không dùng chúng làm tiêu chí pass/fail của bản hiện tại. Vẫn phải nghiệm thu hoàn tiền/điều chỉnh sau trả hàng theo chứng từ và không ghi trùng.

## Kiểm tra production 2026-10-26

- [x] Giao diện Đơn hàng tại URL chính hiển thị danh sách rỗng/nút tạo đơn nháp; lỗi render null đã sửa. Nginx CRM không còn phục vụ HTML cũ từ proxy cache.
- [x] Page Lào Cai: 19 webhook Meta có chữ ký được worker xử lý (7 MESSAGE, 12 COMMENT); DB/UI có 3 chat và 11 bình luận duy nhất. Đây là inbound production, không phải fixture.
- [ ] Page Lào Cai: tin mới từ tài khoản thử và phản hồi CRM xuất hiện trên Messenger; kiểm echo không trùng.
- [ ] Page TQ: tin mới vào đúng hộp thư và phản hồi CRM xuất hiện ở đúng tài khoản thử; hiện 0 webhook/job.
- [ ] Bình luận: quyền `pages_read_user_content`/`pages_manage_engagement` và thử reply live; hiện thiếu trên cả hai Page, UI/backend không cho gửi.

## Checkpoint multi-Page 2026-10-16

- [x] OAuth mock Graph + DB scratch: chọn hai Page từ một consent, upsert riêng, lỗi subscription của Page thứ hai trả rõ Page lỗi và không ghi một phần; reconnect/ngắt một Page giữ Page còn lại. `/me/accounts` trang ngắn có `paging.next` vẫn đọc tiếp. Trên DB scratch mới, 8/8 bài thử OAuth và cả bộ 6 file/17 bài E2E đạt, không phải Meta live.
- [x] Webhook HMAC fixture + DB scratch: hai Page nhận cùng external user ID và vẫn có hai identity/hội thoại; replay/echo không tạo trùng, Page ID lạ không tạo job. 2/2 bài thử đạt, không phải Meta delivery.
- [x] Phân quyền nhân viên theo connection: thiếu grant không xem hộp thư, grant xem không cho gửi; quản trị viên cấp/thu hồi riêng từng tài khoản. Migration mới chỉ chạy trên DB scratch, chưa áp DB vận hành.
- [ ] Nghiệm thu trực quan UI nhiều Page trên web scratch; dev server đang chạy cùng thư mục nên không thể mở bản web scratch song song mà không ảnh hưởng môi trường đang dùng.
- [ ] Một Page và sau đó hai Page live: hostname HTTPS công khai, app/role cho phép event, tin mới vào đúng Page, reply CRM hiện trên Messenger, không trùng echo; quyền bình luận cần grant thật riêng.

## SOCIAL-INBOX-TICKET-01 (2026-10-14)

- [x] Migration và E2E trên PostgreSQL scratch: ticket từ chat/comment đã lưu, business scope 404, request key replay không nhân bản, key khác payload 409, version conflict 409, chỉ đóng sau RESOLVED, event audit và mark-read.
- [x] Hộp thư code có ba vùng desktop, điều hướng một vùng trên màn hẹp, lọc dữ liệu đã tải theo loại/kênh/tài khoản/unread/chưa xử lý/ưu tiên/người phụ trách/nhãn/trạng thái; Page/OA/shop hiển thị riêng. Luồng chat phân biệt inbound/outbound; comment hiện nguồn/post/parent khi có dữ liệu. Ô gửi không mở khi chưa có API gửi được kiểm chứng.
- [ ] Kiểm tra tương tác và ảnh desktop/mobile trên browser local; Computer Use Chrome lượt này đọc được Meta tab nhưng không click/chụp được do geometry/capture timeout. Build/test code không thay kiểm tra trực quan.
- [ ] Phân trang và tổng count toàn bộ từ backend, avatar/media URL chuẩn, nội dung post gốc từ provider, reply thật theo permission, ticket trong Customer 360 chỉ sau khi chốt visibility/retention.

## Facebook FB-UNBLOCK-BACKFILL-01 (2026-10-13)

Bốn tuyến nghiệm thu độc lập: Messenger mới, comment/reply mới, Messenger cũ, comment/reply cũ. Chỉ gắn `LIVE_VERIFIED` khi một đối tượng thật đi từ Meta → webhook/job hoặc backfill → DB → API → UI và nhập lại không trùng; fixture chỉ `LOCAL_TESTED`. Messenger history hiện `LIVE_PARTIAL`: 8 tin cũ/2 hội thoại đã xác minh Graph → DB → API → UI Chrome (5 + 3 tin có nhãn lịch sử), nhập lại 8 duplicate/0 mới; chưa chứng minh Meta trả hết Inbox. Comment history `BLOCKED_PERMISSION` Graph code 10; hai tuyến realtime `WAITING_FOR_META` vì app chưa phát hành/URL webhook tạm hết phiên. Xem [`tasks/FB-UNBLOCK-BACKFILL-01.md`](tasks/FB-UNBLOCK-BACKFILL-01.md).

## AC-SYNC — nhập đa kênh inbound-only

### CHANNEL-AUTH-01 Facebook (local contract)

- Người quản lý Page không cần tạo Meta app hoặc nhập App ID/secret/Page ID thủ công. Khi nền tảng sẵn sàng, họ bấm Kết nối Facebook, đăng nhập/cấp quyền, chọn Page từ danh sách Meta trả và hoàn tất; khi nền tảng chưa sẵn sàng, UI giải thích ngắn gọn, không đưa biến môi trường làm bước bắt buộc. Chi tiết preflight nằm trong mục kỹ thuật thu gọn. Chưa nghiệm thu trực quan vì browser helper đang dừng.

- Start chỉ cho `connectors.manage`, lưu attempt state hash một lần/15 phút cùng actor/business; callback deny, sai state, hết hạn, lặp hoặc tranh chấp đồng thời không tạo grant.
- Exchange code chỉ ở backend; Page list và scope/task lấy từ API, token mã hóa trước khi lưu; response/UI/audit không chứa token. Actor/business khác không xem hoặc finalize attempt.
- Finalize chỉ nhận Page trong grant, kiểm tra Page task và subscription đọc lại từ Graph; reconnect cùng Page cập nhật connection cũ, không tạo identity/alert/order mới. Subscription thất bại giữ credential cũ.
- Disconnect local chặn webhook/worker và xóa credential local, nhưng không báo đã unsubscribe ở Meta. Expiry của grant được worker đánh dấu `REAUTH_REQUIRED`; sự kiện inbound vẫn cần signature và binding đã xác minh.
- Tests mock provider + PostgreSQL scratch là `LOCAL_TESTED`; phải thử OAuth bằng nút UI, Page sikeoLC thật, subscription, Messenger event và feed comment event trước `LIVE_VERIFIED`.

- Signed webhook hợp lệ được ghi job trước HTTP ack; signature sai/thiếu bị từ chối. Replay cùng provider event không nhân đôi job/tin/bình luận/đơn.
- Worker crash/retry dùng lease/backoff; job chết hiển thị mã lỗi không chứa token/PII và có thể retry có quyền.
- Page Messenger/feed comments tách riêng; note nội bộ không gọi provider; external identity/comment/order chỉ link thủ công đến customer thuộc cùng business.
- Marketplace order upsert giữ source status/raw IDs/lines/mapping, cảnh báo Admin duy nhất; không phát sinh SalesOrder, stock movement/reservation, receipt, receivable hoặc revenue.
- SKU mapping sai/thiếu không chặn lưu order staging và không tự trừ kho.
- Connector chỉ pass nghiệm thu thật sau khi có E-ACCOUNT/E-APP/E-SCOPE/E-WEBHOOK/E-INBOUND/E-DUP/E-REVOKE/E-PRIVACY theo `INTEGRATION_READINESS.md`; test fixture không thay evidence tài khoản thật.

## AC-360 — hồ sơ khách hàng 360° (Đợt A)

- **AC-360-01:** hồ sơ hợp nhất dữ liệu thật customer/group/contacts/addresses/assignee và các module đã tồn tại; thông tin hiện tại phân biệt với sự kiện lịch sử.
- **AC-360-02:** ghi chú append-only được lưu trong DB cùng author/time UTC và audit; khách khác business trả 404; người thiếu `customers.write` không tạo ghi chú.
- **AC-360-03:** timeline cursor ổn định, không lặp/bỏ sót khi phân trang các timestamp trùng; mỗi item có loại, source ID và thời điểm; empty/error/loading hiển thị rõ.
- **AC-360-04:** actor thiếu `tasks.manage`, `opportunities.manage`, `quotes.read`, `orders.read` hoặc `receivables.view` không nhận dữ liệu/count/amount của module tương ứng trong detail, list hay timeline.
- **AC-360-05:** đơn nháp hiện riêng với nhãn “Đơn nháp”; hồ sơ không có metric đã mua/doanh thu từ draft, canceled hoặc opportunity.
- **AC-360-06:** UI tiếng Việt responsive dùng API thật; không hiện tab giả; kiểm tra browser thủ công được ghi riêng, không suy ra từ build.

## SOCIAL-IDENTITY-01 — identity social, khách nghi trùng và merge

- [x] Local identity link/transfer/unlink cần permission, expected current customer + version, preview/audit; một Customer nhận nhiều identity; Customer 360 giữ từng thread/account riêng và mask external IDs.
- [x] Chuẩn hóa phone 0/+84; không match số cuối, masked phone, email dấu chấm/`+tag`; lưu suggestion Customer-pair theo evidence/version; same-name-only không đề xuất; REJECT không lặp cùng fingerprint.
- [x] Merge preview/command có quyền riêng, transaction/version/idempotency/audit; giữ target fields, source `MERGED` redirect, không sửa snapshot hoặc tạo stock/payment/admin events. Conflict ownership/two credit balances bị chặn.
- [ ] CHANNEL-AUTH-01 OAuth/finalize/reconnect cho từng provider; hiện `GET /integrations/providers/preflight` là chỉ báo cấu hình, không phải chức năng OAuth. Live Page/OA/shop selection và evidence BLOCKED; manual Page/OA ID không được webhook dispatcher chấp nhận.
- [ ] Identity-to-Customer auto-suggestion: chờ phone/email được provider trả về hoặc user xác nhận qua flow an toàn; không dùng display name/comment/text làm match.
- [ ] Browser visual acceptance trên workspace/customer 360.

Kết quả kiểm thử code ngày 2026-10-08: AC-360-02–05 có E2E permission/timeline/customer scope; 12/12 API E2E files, 39/39 tests pass trên PostgreSQL 17.6 scratch mới với toàn bộ migration. Typecheck/lint/build pass. AC-360-06 chưa visual-acceptance bằng browser.

## 1. Nghiệm thu Đợt 00

- **AC-00-01:** Tất cả tài liệu trong `README.md` tồn tại và không mô tả connector/prototype là tính năng thật.
- **AC-00-02:** `DECISIONS.md` có đúng 5 câu hỏi chặn, mỗi câu có phương án tạm và ảnh hưởng.
- **AC-00-03:** Mỗi quy tắc trọng yếu giá/kho/tiền/quyền có mã để liên kết test sau này.
- **AC-00-04:** Prototype mở không cần build, có 6 màn hình, dùng tốt ở 390px và desktop, luôn hiện “DỮ LIỆU MẪU — KHÔNG LƯU”.
- **AC-00-05:** Bấm điều hướng/chọn khách/tìm hàng trong prototype không phát sinh request ngoài hoặc thay đổi dữ liệu thật.
- **AC-00-06:** Bảng tích hợp phân biệt rõ tài khoản, năng lực, quyền cần xác minh, evidence và trạng thái.
- **AC-00-07:** Người dùng chính thử kịch bản ở `UI_PROTOTYPE.md`; phản hồi được ghi trước khi khóa UI Đợt 01–06.

## 2. Nghiệm thu Đợt 01

- **AC-01-01 — PASS local:** web đăng nhập gọi API thật, đọc `/me` và hiển thị vai trò/quyền từ PostgreSQL.
- **AC-01-02 — PASS local:** live/ready phân biệt trạng thái tiến trình và kết nối database; endpoint bảo vệ trả `401` khi chưa đăng nhập.
- **AC-01-03 — PASS local:** cookie phiên là `HttpOnly`; logout thu hồi phiên; khóa nhân viên thu hồi mọi phiên còn hiệu lực.
- **AC-01-04 — PASS E2E:** owner có `staff.manage`; nhân viên sales gọi trực tiếp API quản trị nhận `403 PERMISSION_DENIED`.
- **AC-01-05 — PASS local:** migration chạy và seed idempotent tạo một business, bốn role, mười permission và owner local.
- **AC-01-06 — PASS local:** login/logout/tạo hoặc khóa nhân viên/gán role đều sinh audit; không ghi password hay session token thô.
- **AC-01-07 — PASS local:** format, lint, typecheck, unit, build và E2E; workflow CI đã cấu hình nhưng cần remote để có bằng chứng run đầu tiên.
- **AC-01-08 — PASS:** DTO từ chối field ngoài schema; OpenAPI xuất được hợp đồng của chín path Đợt 01.

## 3. Nghiệm thu Đợt 02

- **AC-02-01 — PASS E2E:** hai hồ sơ trùng tên và cùng số điện thoại vẫn có hai ID; hồ sơ thứ hai trả gợi ý `SAME_NAME`/`SAME_PHONE`, không tự gộp.
- **AC-02-02 — PASS E2E:** tìm số điện thoại định dạng `090…` khớp dữ liệu đã chuẩn hóa từ cả `090…` và `+84…`.
- **AC-02-03 — PASS E2E:** một khách lưu được nhiều địa chỉ; địa chỉ được lưu trữ thay vì xóa cứng.
- **AC-02-04 — PASS E2E:** việc nhắc và cơ hội mua lại được lưu riêng và xuất hiện trong hồ sơ khách.
- **AC-02-05 — PASS E2E:** cập nhật cùng version cũ lần thứ hai trả `409 VERSION_CONFLICT`.
- **AC-02-08 — PASS local UNIT + E2E:** nguồn Facebook/Messenger và Zalo luôn tạo/cập nhật nhóm `wholesale`; Shopee và TikTok Shop luôn tạo/cập nhật nhóm `retail`, kể cả khi client gửi `groupCode` trái quy tắc. Nguồn khác vẫn theo nhóm chọn thủ công. E2E chạy trên DB sạch cô lập; không coi mapping cục bộ là connector đã tích hợp.
- **AC-02-06 — PASS E2E:** role kho gọi trực tiếp `/customers` nhận `403 PERMISSION_DENIED`; mọi query chi tiết bị giới hạn theo business.
- **AC-02-07 — PASS local:** UI có trạng thái tải/rỗng/lỗi, tạo–tìm–sửa khách, thêm/lưu trữ địa chỉ, hoàn thành việc nhắc và cập nhật cơ hội bằng API thật.

## 4. Nghiệm thu Đợt 03

- **AC-03-01 — PASS E2E:** tạo sản phẩm cùng SKU; SKU được chuẩn hóa chữ hoa và tìm được theo mã.
- **AC-03-02 — PASS E2E:** SKU trùng trong cùng business trả `409 SKU_ALREADY_EXISTS`; barcode có unique constraint riêng.
- **AC-03-03 — PASS E2E:** đơn vị gốc luôn có hệ số 1; API từ chối lặp đơn vị gốc, factor không dương và mã quy đổi trùng.
- **AC-03-04 — PASS migration:** database có check `factor > 0` và `sort_order >= 0`, ngoài validation API.
- **AC-03-05 — PASS E2E:** cập nhật quy đổi dùng optimistic version; ngừng bán SKU giữ nguyên hồ sơ thay vì xóa.
- **AC-03-06 — PASS E2E:** media chỉ nhận URL HTTPS, liên kết đúng product/variant và được lưu trữ thay vì xóa cứng.
- **AC-03-07 — PASS E2E:** role kho đọc được catalog nhưng gọi API tạo sản phẩm nhận `403 PERMISSION_DENIED`.
- **AC-03-08 — PASS local:** UI tạo/tìm/sửa/ngừng bán sản phẩm, thêm SKU, sửa quy đổi và quản lý metadata ảnh bằng API thật.
- **AC-03-09 — CODED; local verification pending:** nhập `.xlsx` Shopee có inspect sheet/hàng tiêu đề, ánh xạ cột, preview lỗi theo dòng, nhóm theo Parent SKU, đơn vị gốc bắt buộc, chống trùng SKU/barcode và apply atomically/idempotently. Chỉ catalog/media metadata/audit được tạo; không ghi giá hoặc kho. Cần migration trên PostgreSQL scratch, API E2E quyền/idempotency và browser review trước khi đánh dấu PASS.

## 5. Nghiệm thu Đợt 04A

- **AC-04A-01 — PASS E2E:** tạo/tìm nhà cung cấp và chuẩn hóa email; migration bảo đảm mã nhà cung cấp duy nhất theo business.
- **AC-04A-02 — PASS E2E:** tạo đơn mua `2 thùng × 12` lưu snapshot đúng `24` đơn vị gốc; client không gửi hệ số.
- **AC-04A-02B — PASS E2E:** khi SKU đã được đơn mua tham chiếu, API từ chối thay danh sách quy đổi với `409 UNIT_CONVERSION_IN_USE`.
- **AC-04A-03 — PASS E2E:** tạo và phát hành đơn mua không thay đổi bản ghi SKU, không tạo audit `inventory.*`.
- **AC-04A-04 — PASS E2E:** đơn vị không thuộc SKU trả `422 UNIT_NOT_AVAILABLE_FOR_VARIANT`.
- **AC-04A-05 — PASS E2E:** sau phát hành, sửa dòng trả `409 PURCHASE_ORDER_NOT_EDITABLE`.
- **AC-04A-06 — PASS E2E:** role kho đọc/ghi mua hàng; role sales gọi trực tiếp nhận `403 PERMISSION_DENIED`.
- **AC-04A-07 — PASS migration:** DB kiểm tra line number, hệ số, số lượng đặt và số lượng cơ sở dương; giá dự kiến không âm.
- **AC-04A-08 — PASS local:** UI tạo/lưu trữ nhà cung cấp, tạo/phát hành/hủy đơn mua bằng API thật và luôn cảnh báo chưa nhập kho.

## 5B. Nghiệm thu Đợt 04B

- **AC-04B-01 — PASS E2E:** nhận một phần đơn mua quy đổi đúng về đơn vị gốc, cập nhật trạng thái `PARTIALLY_RECEIVED` và số còn phải nhận.
- **AC-04B-02 — PASS E2E:** nhận đủ chuyển đơn mua sang `RECEIVED`; tồn thực tế/có thể bán và giá vốn bình quân gia quyền khớp.
- **AC-04B-03 — PASS E2E:** gửi lại cùng `Idempotency-Key` và payload trả cùng phiếu, không thêm movement; đổi payload với cùng key trả `409 IDEMPOTENCY_KEY_REUSED`.
- **AC-04B-04 — PASS E2E:** backend từ chối nhận vượt; hai request đồng thời cho phần cuối chỉ một request ghi sổ thành công.
- **AC-04B-05 — PASS E2E/RBAC:** nhân viên kho đọc/nhận hàng nhưng response không có giá vốn; sales gọi kho nhận `403`; owner có `cost.view` xem được chi phí.
- **AC-04B-06 — PASS migration:** DB khóa duy nhất balance theo business/kho/SKU, movement theo source line/key và kiểm tra số lượng/giá trị không âm.
- **AC-04B-07 — PASS build/HTTP, cần kiểm tra thủ công:** UI Kho gọi API thật để tạo phiếu, xem tồn, phiếu nhận và sổ kho; HTTP local trả 200 và owner đăng nhập được. Chưa có bằng chứng kiểm tra màn hình bằng trình duyệt tương tác.

## 5C. Nghiệm thu Đợt 04C-A — tồn đầu kỳ

- **AC-04C-A-01 — PASS E2E:** tồn đầu ghi chứng từ với snapshot SKU/tên/đơn vị, số lượng và giá trị VND nguyên; backend tạo đúng một balance và movement nguồn `OPENING_STOCK`.
- **AC-04C-A-02 — PASS E2E:** cùng `Idempotency-Key`/nội dung trả cùng chứng từ; đổi nội dung trả `409 IDEMPOTENCY_KEY_REUSED`; SKU/kho đã có tồn bị từ chối.
- **AC-04C-A-03 — PASS E2E:** hai lệnh đồng thời cùng SKU/kho chỉ một lệnh ghi sổ; giá trị lẻ VND bị từ chối trước khi tạo dữ liệu.
- **AC-04C-A-04 — PASS E2E/RBAC:** role kho đọc chứng từ nhưng không nhận giá vốn/giá trị; sales gọi lệnh tồn đầu bị `403`.
- **AC-04C-A-05 — PASS migration:** unique business/kho/SKU và idempotency key; nguồn movement khớp loại; snapshot được backfill trước khi đặt NOT NULL.
- **AC-04C-A-06 — PASS build/HTTP, cần kiểm tra thủ công:** UI Kho có form tồn đầu, tìm sản phẩm/SKU, nạp thêm theo cursor và danh sách chứng từ từ API thật; chưa có bằng chứng kiểm tra trực quan bằng trình duyệt tương tác.
- **AC-04C-B-01 — PASS E2E:** kiểm kê 100→97 ghi delta -3 và 97→102 ghi delta +5; tồn cuối khớp balance.
- **AC-04C-B-02 — PASS E2E:** chứng từ snapshot tồn hệ thống/số đếm/lý do/người tạo; movement signed, audit và balance cập nhật đồng nhất trong transaction.
- **AC-04C-B-03 — PASS E2E:** cùng key/nội dung trả cùng chứng từ; cùng key/nội dung khác bị `409`; stale version bị `409 STOCK_VERSION_CONFLICT`; cạnh tranh không ghi đè tồn mới.
- **AC-04C-B-04 — PASS E2E:** chặn số tồn thấp hơn giữ/không đủ điều kiện bán; vai trò thiếu `inventory.adjust` bị từ chối; thiếu `cost.view` không nhận giá trị/giá vốn.
- **AC-04C-B-05 — PASS MIGRATION:** migration được áp dụng trên PostgreSQL kiểm thử mới, gồm chứng từ, idempotency, snapshot, liên kết nguồn movement, signed delta và check constraints.
- **AC-04C-B-06 — IMPLEMENTED, NEED UI CHECK:** UI Kho kiểm kê balance đã tải, hiển thị version, xử lý lỗi stale version và liệt kê chứng từ/ledger qua API thật.

### Nghiệm thu Đợt 05A — giá admin theo SKU

Kết quả chạy ngày 2026-10-05 trên PostgreSQL cô lập:

- **PASS UNIT/E2E:** quy tắc bậc 5/9→5, 10/14→10, 15/19→15 và các biên khác.
- **PASS E2E:** giá admin lưu/resolver; bậc trống báo chờ OPEN-03; idempotency, payload khác cùng key, version cũ và xóa giá giữ version.
- **PASS E2E/RBAC:** role sales bị từ chối và SKU thuộc business khác không đọc/sửa được.
- **UI IMPLEMENTED; BROWSER CHECK PENDING:** màn hình CRM nhập/xóa giá và gọi resolver thật; chưa có kiểm tra trực quan bằng trình duyệt.

Kết quả xác minh phần mở rộng ngày 2026-10-06: đủ 12 migration deploy và seed trên PostgreSQL 17.6 mới cô lập ở cổng 55434; 8 file / 32 E2E pass, bao gồm giá lẻ, đơn vị bán cố định, lượng Decimal và khóa thay đổi sau khi cấu hình giá. `prisma migrate diff` còn một đề xuất rename index stock adjustment phát sinh từ migration 04C-B trước đó; chưa sửa vì ngoài phạm vi 05A. UI vẫn cần nghiệm thu bằng browser.

- **AC-05A-01:** lượng 5–<10 chọn bậc 5; 10–<15 chọn bậc 10; 15–<20 chọn bậc 15; giá dưới 5 chọn bậc lẻ 1; lượng thập phân sát ranh giới phân bậc chính xác.
- **AC-05A-02:** admin lưu giá lẻ ở bậc 1 và giá sỉ tại bậc 5/10/15...; resolver nhận số lượng tối đa 6 chữ số lẻ, trả đúng đơn vị bán và giá admin dưới dạng chuỗi VND. Bậc thiếu trả `PRICE_NOT_CONFIGURED`, không tạo số tiền.
- **AC-05A-03:** role thiếu `price.edit` bị từ chối ở API; tenant khác không đọc/sửa SKU ngoài business.
- **AC-05A-04:** cùng `Idempotency-Key` và payload trả cùng response; cùng key khác payload trả `409`; `expectedVersion` cũ trả `409`.
- **AC-05A-05:** xóa giá admin giữ version của bậc để lệnh cũ không thể âm thầm tạo lại giá; resolver trở về trạng thái chưa có giá.
- **AC-05A-06:** UI CRM đọc sản phẩm/giá qua API, nhập/xóa giá qua API; preview resolver gọi backend. Giá lẻ đã cấu hình được tại bậc 1; báo giá/giảm giá chưa triển khai và không tự tính giá thiếu.
- **AC-05A-07:** đơn vị bán phải là đơn vị gốc hoặc quy đổi đã khai báo; quản lý có thể chọn/đổi trước khi cấu hình giá; đổi đơn vị sau khi có giá hoặc sửa/xóa quy đổi đang cố định bị backend từ chối.

### Tiêu chí đã xác nhận cho Đợt 05B–C

- Bảng giá dùng chung; mỗi SKU có một đơn vị bán cố định như gói, kg hoặc thùng, không mặc định giá theo từng món lẻ.
- Có thể nhập số lượng lẻ tối đa 6 chữ số thập phân; dưới 5 dùng giá lẻ, từ 5 trở lên bậc được lấy theo `floor(quantity/5)*5`; thành tiền từng dòng làm tròn VND nửa lên.
- Giảm giá hỗ trợ phần trăm hoặc VND, theo dòng hoặc toàn báo giá; backend chỉ cho `price.edit`, không áp trần số riêng.
- Báo giá có phí giao, thuế, cọc dự kiến và ghi chú thanh toán; sửa bảng giá sau khi gửi không đổi revision đã phát hành.
- Báo giá còn hạn chuyển thành đơn nháp với giá snapshot; thông báo Admin được tạo khi có đơn khách đặt từ nền tảng.
- Gửi báo giá phải có revision và bản in/PDF; connector gửi tự động chỉ nghiệm thu sau khi có bằng chứng API thật.
- Hạn báo giá là đủ 72 giờ từ lúc khách nhận; luồng PDF/chia sẻ thủ công cần ghi nhận timestamp nhận.
- Người có `price.edit` được đặt mức giảm phần trăm hoặc VND theo dòng hoặc toàn báo giá; không áp trần số riêng. Thuế nhập theo phần trăm hoặc VND áp dụng toàn báo giá. Quyết định 03-A ngày 2026-10-07 giữ cách tính hiện tại: một kiểu thuế mỗi báo giá; giảm dòng trước giảm toàn báo giá; thuế phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc. Còn browser acceptance trước vận hành; kênh gửi tự động chờ tài khoản thử.

Kết quả 05B local ngày 2026-10-06: 13 migration + seed pass trên PostgreSQL 17.6 mới; 9 file / 33 API E2E pass. Gồm resolver không tự tính giá thiếu, Decimal × VND làm tròn từng dòng 0,5 lên, thuế phần trăm/VND, giảm theo quyền, version/idempotency, snapshot revision không đổi khi bảng giá đổi và thời hạn đúng 72 giờ. Typecheck/lint/unit/format/build đều pass trên Node 24. UI build pass nhưng chưa được nghiệm thu trực quan trên browser; phát hành hiện chỉ ghi nhận chia sẻ thủ công và in/lưu PDF bằng trình duyệt.

### Nghiệm thu 05C — chuyển báo giá thành đơn nháp

- Chỉ nhân viên có `orders.create` được chuyển quote `SENT` và chưa hết hạn; quote khác business không bị lộ, stale version/đã chuyển/hết hạn trả lỗi ổn định.
- Backend tạo đúng một order `DRAFT` từ revision mới nhất, giữ nguyên dòng/số tiền/thuế/phí/cọc/ghi chú; không gọi lại price resolver và không nhận tổng tiền từ client.
- Tạo order, order lines, cập nhật quote `ACCEPTED`, audit, `AdminAlert` tới mọi staff đang hoạt động có `staff.manage` và lệnh idempotency nằm trong một transaction. Cạnh tranh/ retry không tạo order hoặc alert trùng; cùng key/payload replay, key khác payload bị từ chối.
- `GET /admin-alerts` chỉ lộ thông báo actor; đánh dấu đã đọc chỉ tác động alert thuộc actor/business. Admin thấy đơn chuyển thành công ở Tổng quan sau khi tải dữ liệu.
- Tại nghiệm thu 05C, đơn draft chưa tạo giữ hàng. Sau lát cắt 06B, đơn từ báo giá giữ tồn; đơn nháp nhập tay vẫn chưa giữ. Cả hai chưa xác nhận/giao hoặc ghi nhận tiền.

Quyết định nghiệp vụ ngày 2026-10-07 thay đổi hành vi đích. Lát cắt 06B đã triển khai giữ đủ tồn trong transaction chấp nhận quote/tạo đơn; thiếu tồn thì rollback, không tạo đơn/giữ một phần. Giữ hàng không tự hết hạn; lệnh hủy nhả giữ theo ledger. Lát cắt 06C/07A đã triển khai thu đủ trước xác nhận. 06D chỉ xuất đủ một lần và ghi nhận doanh thu sau giao đủ; COD chưa hỗ trợ vì chính sách thu COD sau giao chưa dung hòa với thu đủ trước xác nhận.

### Nghiệm thu 06B — giữ và nhả tồn

- Khi chấp nhận quote, backend quy đổi dòng sang đơn vị cơ sở, cộng gộp trùng SKU, kiểm tra `onHand - reserved - unavailable`, rồi cập nhật reserved, ledger sự kiện `RESERVED`, đơn/quote/alert/audit/idempotency trong một transaction Serializable.
- Thiếu tồn của bất kỳ SKU nào trả `409 INSUFFICIENT_AVAILABLE_STOCK`; quote vẫn `SENT`, không có order, ledger hoặc phần giữ một phần. Cạnh tranh không được vượt tồn.
- Hủy cần `orders.cancel`, version và idempotency; chỉ hủy `DRAFT`, ghi `RELEASED` đúng một lần, giảm reserved và chuyển `CANCELED` cùng transaction. Ngoài business trả 404; thiếu quyền 403; version cũ 409.
- Kiểm thử local 2026-10-07: hai dòng cùng SKU giữ đúng tổng 7; quote vượt tồn bị từ chối không tạo đơn; hủy nhả 7, replay không nhả lần hai; hai lệnh convert đồng thời chỉ tạo một đơn/alert.

Kết quả 05C local ngày 2026-10-07: 14 migration + seed trên PostgreSQL 17.6 thử cô lập; 9 file/33 E2E pass, gồm idempotency, hết hạn, RBAC, alert nội bộ và hai lệnh convert đồng thời chỉ tạo một đơn/alert. Typecheck, lint, 13 unit test, 2 test UTF-8, format và production build pass. UI API đã trả HTTP 200 sau restart web; chưa có nghiệm thu trực quan qua browser.

### Nghiệm thu nền 06A — tra cứu đơn nháp

- `GET /orders` và `GET /orders/{id}` yêu cầu `orders.read`; chỉ trả dữ liệu thuộc business của actor và các snapshot đã lưu.
- Tìm kiếm theo mã đơn, mã/tên khách, mã báo giá hoặc SKU; `limit` được giới hạn 1–100.
- Nhân viên sales xem được đơn; vai trò không có `orders.read` nhận `403`; ID không tồn tại hoặc ngoài business trả `404`.
- Màn hình chỉ đọc, hiển thị nguồn báo giá, revision, dòng hàng và tổng tiền; không có lệnh xác nhận/hủy/giữ/xuất.
- Lát cắt đọc ban đầu chỉ hiển thị đơn đã chuyển từ báo giá; nghiệm thu tạo nháp thủ công được theo dõi riêng bên dưới.

### Nghiệm thu 06A — tạo đơn nháp nhập tay

- `POST /orders` cần `orders.create`, `Idempotency-Key`, khách/SKU đang hoạt động thuộc đúng business; backend tự phân giải bậc giá và nhận quantity Decimal tối đa 6 số lẻ.
- Giá trị mỗi dòng làm tròn VND HALF_UP; thiếu giá trả `422 PRICE_NOT_CONFIGURED`; payload lặp với cùng key replay một đơn, đổi payload với cùng key trả `409 IDEMPOTENCY_KEY_REUSED`.
- Đơn tạo ở `DRAFT`, có snapshot SKU/đơn vị/giá; đơn báo giá giữ nguồn báo giá, đơn nhập tay không có nguồn báo giá.
- Không có giảm giá/phí giao/thuế/cọc trong form nhập tay; không xác nhận đơn, giữ/ghi kho, tạo công nợ/thanh toán. Tạo thông báo nội bộ cho staff có `staff.manage`; chưa gửi thông báo qua nền tảng ngoài.
- Xác minh local 2026-10-07: 15 migration + seed trên PostgreSQL 17.6 tạm biệt lập; 9 file/34 API E2E pass (gồm làm tròn nửa đồng, idempotency, RBAC, alert); lint, typecheck, 15 unit tests, format và production build pass. Chưa kiểm tra UI trực quan qua browser.

### Nghiệm thu 06D — xuất kho và giao đủ

- `POST /shipments` chỉ cho đơn đã xác nhận và giữ đủ hàng ở đúng một kho; body không nhận số lượng để không thể giao thiếu. Một đơn chỉ có một shipment.
- Ghi shipment/line snapshot, trừ `onHand` và `reserved`, lưu giá vốn bình quân gia quyền và `SALE_SHIPMENT` trong transaction Serializable; cùng key replay an toàn, cạnh tranh chỉ một request thành công.
- `POST /shipments/{id}/deliver` đóng dấu người/thời điểm UTC một lần; trước đó doanh thu ghi nhận bằng 0, sau đó là giá trị hàng theo snapshot trừ giảm giá, không gồm phí giao/thuế.
- Vai trò kho có `shipments.read/create/deliver`, nhìn thấy queue đơn đã xác nhận chưa xuất và phiếu đang giao trong đúng business mà không cần `orders.read`; nhân viên bán không đọc queue kho nếu thiếu quyền. Queue chỉ đọc; xuất và giao đủ vẫn phải qua command kiểm tra version/idempotency.
- E2E trên PostgreSQL test sạch: 10/10 file, 35/35 test pass; migration SQL áp tuần tự rồi seed, Prisma schema diff không phát hiện lệch. Lint, typecheck, unit test, format và production build pass.
- Chưa nghiệm thu bằng browser. Luồng shipment trong màn hình đơn vẫn cần `orders.read`; queue riêng cho vai trò kho được bổ sung ở AC-06E. COD chưa triển khai do xung đột BR-COD-01/BR-AR-02.

### Nghiệm thu bổ sung 06E — queue tác nghiệp kho

- `shipments.read` tách khỏi `orders.read`; role kho có thể xem đơn đã xác nhận chưa xuất và phiếu đang giao trong business của mình. Role bán thiếu quyền bị 403.
- Queue đơn chỉ đọc và tối đa 100 mục; xuất/giao vẫn qua endpoint command có `shipments.create/deliver`, version, idempotency và toàn bộ kiểm tra tồn hiện hành.
- E2E trên PostgreSQL cô lập kiểm tra quyền, nội dung queue trước/sau xuất, danh sách IN_TRANSIT và xuất/giao đủ cho role kho. Browser visual acceptance vẫn pending.

### Nghiệm thu 07B — sử dụng số dư khách hàng

- `POST /customer-credit/{customerId}/applications` chỉ áp dụng số dư khách của đúng customer vào đơn nháp, số tiền VND nguyên dương không vượt balance hoặc phần đơn còn thiếu; backend kiểm tra business, quyền `payments.manage`, version và idempotency.
- Phân bổ giảm balance và ghi application/event/audit trong transaction; phiếu thu tiền mặt và credit application cùng được tính vào cổng thu đủ trước xác nhận và settlement khi ghi phải thu.
- Nếu hủy đơn nháp chưa nhận tiền mặt, application được đảo bằng event riêng và số dư được hoàn lại đúng một lần. Đơn đã có tiền mặt vẫn bị chặn hủy cho tới khi có quy trình hoàn/đối trừ.
- E2E xác minh race hai lần dùng cùng balance chỉ một lệnh thành công, replay trả cùng response, phần còn lại thanh toán được, receivable settlement đúng và hủy hoàn số dư. Toàn bộ API E2E sau thay đổi: 11/11 file, 36/36 test pass trên PostgreSQL sạch; migration/seed và Prisma schema diff pass.
- Đây là dùng số dư lưu tại CRM, không phải hoàn tiền mặt; màn công nợ riêng, phiếu chi/hoàn tiền và browser visual acceptance vẫn còn.

### Nghiệm thu giao diện và tổng quan

- **AC-UI-UTF8 — PASS unit/build:** tài liệu HTML khai báo `lang=vi`, UTF-8 và font stack có glyph tiếng Việt; test quét source không có ký tự thay thế hoặc chuỗi mojibake thường gặp.
- **AC-UI-TYPE — LOCAL IMPLEMENTED, BROWSER CHECK PENDING:** sau phản hồi chữ 14px/16px còn quá nhỏ, nhãn phụ, bảng và nội dung trợ giúp trong CRM được nâng lên 16px; trường nhập/nút thao tác lên 18px. CSS mới được server local trả HTTP 200; cần mở browser kiểm tra desktop/mobile, độ tràn hàng và khả năng đọc thực tế.
- **AC-UI-VI — BROWSER CHECK PENDING:** rà các luồng đăng nhập, khách hàng, danh mục, mua hàng, kho, bảng giá, báo giá; xác nhận dấu tiếng Việt và nội dung dữ liệu nhập hiển thị đúng. Unit test UTF-8 chỉ kiểm tra source, không thay nghiệm thu rendering.
- **AC-OV-01 — PASS E2E:** owner gọi `/overview` nhận KPI và các bảng so sánh khách/cơ hội/danh mục/mua hàng từ DB; response không trả danh sách quyền hoặc thông tin phiên để lấp chỗ.
- **AC-OV-02 — PASS local:** trang Tổng quan bỏ toàn bộ thẻ kỹ thuật “phiên/quyền/audit”, có liên kết đi thẳng tới dữ liệu khách, sản phẩm và mua hàng.
- **AC-OV-03 — IMPLEMENTED LOCALLY, GROSS BEFORE RETURNS:** biểu đồ theo tháng từ shipment `DELIVERED`, theo timezone doanh nghiệp, không dùng dữ liệu mẫu; chưa khấu trừ return/refund.
- **AC-OV-04 — IMPLEMENTED LOCALLY, GROSS BEFORE RETURNS:** top SKU theo base quantity đã giao, có khoảng ngày; nhãn nêu chưa trừ hàng trả. Net sales vẫn chờ quyết định hoàn doanh thu.
- **AC-CHAT-01 — WAITING Đợt 09:** hộp thư khách hàng chỉ nghiệm thu sau khi có connector, tài khoản/quyền thử, hội thoại thật được đồng bộ và kiểm tra gửi/nhận; không gắn nhãn tích hợp trước khi có bằng chứng.

## Chính sách đã chốt, nghiệm thu code còn chờ

- **AC-POLICY-03 — DECIDED, IMPLEMENTATION PARTIAL:** giữ phép tính hiện hành: giảm theo dòng trước, giảm toàn báo giá sau; một kiểu thuế trên mỗi báo giá; thuế phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc. Đối chiếu kết quả backend và snapshot; không thay thứ tự tính khi chuyển đơn.
- **AC-POLICY-04 — IMPLEMENTED LOCALLY:** không bán chịu; thu nhiều lần/một phần trước xác nhận, chỉ xác nhận khi thu đủ; receivable và settlement được ghi lúc xác nhận. COD ngoại lệ chưa triển khai do mâu thuẫn thời điểm.
- **AC-POLICY-05 — IMPLEMENTED LOCALLY, UI CHECK PENDING:** giữ đủ tồn khi chấp nhận quote; không tự hết hạn; hủy nhả đúng một lần; giao đủ một lần; WAC movement; doanh thu chỉ sau khi đánh dấu giao. Trả hàng/QA chưa có.
- **AC-POLICY-07 — IMPLEMENTED LOCALLY, CASH REFUND PENDING:** receipt nhiều lần/partial, phân bổ tường minh, gợi ý đơn cũ; tiền thừa thành số dư khách và có thể được nhân viên áp dụng vào đơn nháp. Không có hoàn tiền mặt; hủy đơn chưa thu cash thì đảo application về balance.
- **AC-POLICY-08 — PARTIAL DECISION:** doanh thu theo lượng đã giao; COD chỉ ghi nhận khi nhân viên đối soát số tiền thực nhận; hàng trả cần QA trước nhập lại tồn. Thời hạn nhận trả hàng chưa có số ngày nên tiêu chí chấp nhận trả còn mở.
- **AC-POLICY-09 — CHANNEL SELECTED, CONNECTOR UNVERIFIED:** Facebook được chọn đầu tiên. Chưa có Fanpage/app/test account/quyền và bằng chứng API nên không nghiệm thu connector hoặc hộp thư.
- **AC-POLICY-08A — IMPLEMENTED LOCALLY, FINANCIAL FLOW PENDING:** quản lý cấu hình thời hạn; để trống thì không nhận trả; chỉ shipment đã giao/còn hạn và không vượt lượng giao; snapshot chính sách; chống trùng/cạnh tranh; QA đầy đủ; hàng lỗi tăng tồn cách ly; WAC + ledger/audit. Chưa có hoàn tiền, điều chỉnh AR/doanh thu, COD, báo cáo, browser acceptance hay xác nhận cách hiểu “ngày” 24 giờ trước pilot.
- **AC-POLICY-08B — IMPLEMENTED LOCALLY, GROSS BEFORE RETURNS:** API/UI reports are permission-checked and business-scoped; monthly delivered-goods gross revenue excludes shipping/tax; best sellers use delivered base quantity; date bounds follow business timezone. Returns/refunds are intentionally not deducted; browser visual acceptance pending.
- **AC-POLICY-08B-UI — IMPLEMENTED LOCALLY:** người có quyền báo cáo chọn ngày bắt đầu/kết thúc, tải lại dữ liệu từ API và xuất CSV đúng kỳ đang hiển thị; CSV chỉ gồm doanh thu hàng đã giao và lượng sản phẩm giao, không diễn giải thành doanh thu thuần.
- **AC-AR-01 — IMPLEMENTED LOCALLY:** `GET /receivables` chỉ hiện khoản phải thu trong business hiện tại, gồm tổng, đã settle và còn lại; permission `receivables.view`. Endpoint/UI chỉ đọc, không tự phân bổ.

## 6. Bộ dữ liệu chuẩn liên module

Đây là dữ liệu kiểm thử, không phải giá/tồn thật. Theo chính sách hiện hành: thu đủ trước khi xác nhận; khoản phải thu ghi nhận tại xác nhận rồi đối trừ tiền đã thu; không giao thiếu, doanh thu theo lượng đã giao. Không dùng ví dụ này để suy diễn quy tắc hoàn phí/hoàn tiền chưa được chốt.

| Bước                                              | Kỳ vọng                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Nhận 100 cái, giá vốn 50.000đ/cái                 | Thực tế 100; giữ 0; có thể bán 100                                                                                    |
| Giá lẻ và các bậc do admin nhập theo đơn vị bán   | Dưới 5 dùng giá lẻ; 5–<10 dùng bậc 5; 10–<15 dùng bậc 10; thiếu giá thì không tự tính (minh họa, không phải giá thật) |
| Khách sỉ đặt 10 đơn vị + phí giao 30.000đ         | Tiền hàng 800.000đ; tổng 830.000đ (giá chỉ là dữ liệu kiểm thử)                                                       |
| Thu 300.000đ rồi thu tiếp 530.000đ trước xác nhận | Tổng thu 830.000đ; đơn vẫn nháp cho tới khi thu đủ                                                                    |
| Chấp nhận báo giá và giữ 10                       | Thực tế 100; giữ 10; có thể bán 90; thiếu tồn thì toàn lệnh bị từ chối                                                |
| Xác nhận sau khi đã thu đủ                        | Ghi phải thu 830.000đ rồi phân bổ 830.000đ đã thu; số dư phải thu 0                                                   |
| Giao đủ 10 trong một lần                          | Thực tế 90; giữ 0; doanh thu hàng 800.000đ; giá vốn 500.000đ; lãi gộp 300.000đ                                        |
| Trả 2 cái sau khi QA đạt                          | Tồn khả dụng tăng 2; hạch toán hoàn tiền/doanh thu theo chính sách trả hàng khi được chốt                             |
| Đổi bảng giá hiện tại                             | Mọi snapshot và kết quả quá khứ ở trên không đổi                                                                      |

## 7. Tình huống bắt buộc trước khi dùng thật

| ID         | Tình huống                                                 | Kết quả bắt buộc                                               |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| AC-CON-01  | Hai request đồng thời mua phần hàng cuối                   | Số xác nhận không vượt tồn; test phải thật sự concurrent       |
| AC-IDEM-01 | Xác nhận/hủy/thu hai lần hoặc retry sau timeout            | Một chứng từ/movement/payment; trả kết quả cũ hoặc lỗi ổn định |
| AC-RET-01  | Trả một phần sau nhiều lần giao                            | Số trả hợp lệ; tồn, hoàn tiền và công nợ khớp                  |
| AC-PAY-01  | Thu vượt số còn phải thu                                   | Phần thừa theo dõi riêng, không tạo nợ âm                      |
| AC-SNAP-01 | Đổi giá/địa chỉ/quy đổi sau đơn                            | Đơn cũ không đổi                                               |
| AC-RBAC-01 | Nhân viên thiếu quyền gọi API giá vốn/xuất khách           | 403/404 phù hợp; không rò trường nhạy cảm                      |
| AC-IDOR-01 | Khách đổi ID URL/API sang đơn người khác                   | Bị từ chối, không lộ sự tồn tại/nội dung                       |
| AC-SYNC-01 | Webhook trùng/sai thứ tự/token hết hạn/job lỗi             | Không lặp/lùi trạng thái; quan sát và retry an toàn            |
| AC-MAP-01  | Đơn sàn có SKU chưa mapping                                | Vào hàng chờ; không trừ kho                                    |
| AC-AI-01   | Khách yêu cầu AI đổi giá/chính sách hoặc hỏi hàng không có | Không cấp quyền, không bịa, chuyển người                       |
| AC-IPN-01  | IPN sai/lặp/muộn                                           | Không ghi sai/trùng; tiền về muộn có quy trình                 |
| AC-DR-01   | Restore vào môi trường sạch                                | Đơn, kho, công nợ và file dùng lại/đối chiếu được              |
| AC-IMP-01  | Import có dòng lỗi hoặc chạy lại                           | Báo lỗi theo dòng; không nhập trùng                            |
| AC-TIME-01 | Giao dịch gần nửa đêm UTC/VN                               | Báo cáo đúng ngày `Asia/Ho_Chi_Minh`                           |

`scripts/backup-and-verify.ps1` hiện là kiểm tra local một phần cho AC-DR-01: tạo archive, restore vào PostgreSQL scratch mới và so sánh row count các bảng lõi. Chạy E2E shipment với `BACKUP_VERIFY_SOURCE_CONTAINER` đã xác minh đơn xác nhận/giao, khách/SKU, tồn, thu/settlement, AR, shipment, stock movements và return/QA. Chưa đạt AC-DR-01 vì chưa kiểm tra file upload/remote storage, mã hóa/retention hay quy trình production được duyệt.

## 8. Mẫu test cho từng lát cắt

Mỗi test ghi: Given dữ liệu/role/version; When request hoặc thao tác; Then response, state DB, audit/event, side effect và hành vi retry. Với kho/tiền phải kiểm cả ledger và projection, không chỉ JSON trả về. Test UI chỉ bổ sung cho test backend, không thay thế chúng.

## 9. Cổng phát hành

- **Bản nội bộ:** hoàn thành AC liên quan Đợt 01–08, restore test, import dry-run và pilot một nhóm hàng/đơn.
- **Đa kênh:** mỗi năng lực nhận/gửi có evidence tài khoản thử, duplicate/out-of-order/revoke test.

Đợt 09 local: Facebook Messenger/comment và Zalo inbound message adapters có fixture tests cho raw-body signatures, normalized event và idempotency; đây chưa phải provider acceptance. Zalo comment API, Shopee/TikTok order adapter và account-authorized evidence vẫn chặn nghiệm thu connector thật.

- **Tự phục vụ:** có IDOR/OTP/rate limit, giá/tồn theo quyền và late-payment reconciliation.
- **Sàn:** mapping failure, duplicate external order, inventory lag và recovery đã chạy với shop thử.

### Social outbound 2026-10-15

- Local: guest/ngoài business bị từ chối; quyền Page/tác vụ, PSID, người phụ trách và cửa sổ phản hồi được kiểm ở server. Graph chấp nhận phải lưu provider ID; timeout/rate-limit là UNKNOWN; key phát lại và webhook echo không tạo gửi/tin trùng.
- Live Messenger chỉ đạt khi tài khoản thử gửi tin mới → webhook vào CRM → POST từ CRM trả provider ID → tin xuất hiện trên Messenger của tài khoản thử. Chưa đạt ngày 2026-10-15.
- Live comment chỉ đạt khi comment thử vào CRM và reply hiện trên Page. Quyền Graph hiện thiếu, chưa đạt. Zalo/Shopee/TikTok chưa có tài khoản kết nối/thử thật, chưa đạt.

### Nguồn chat → báo giá/đơn (scratch DB, 2026-10-15)

- Tạo Customer/SKU/giá admin/tồn trên DB `crm_social_quote_scratch_20261015`; source Conversation/Message/Ticket thuộc business và Customer liên kết được lưu bằng FK trong Quote. Lặp key trả cùng quote; tin sai hội thoại trả 422; vai trò thiếu quyền tạo báo giá trả 403; PATCH đổi nguồn trả 400. Phát hành revision rồi chuyển đơn nháp; GET order trả `sourceQuote` chứa đủ ba ID nguồn.
- Bộ quote E2E 3/3 và webhook E2E 1/1 chạy trên DB scratch; migration 32/32. API/web typecheck, API lint, gateway smoke (allowlist/GET/POST chữ ký/health) đạt. Chưa có nghiệm thu UI trình duyệt cho đường dẫn này hoặc gửi Messenger live.
