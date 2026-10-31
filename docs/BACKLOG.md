# Backlog theo phụ thuộc

## AI-CUSTOMER-INSIGHTS-01 — yêu cầu được nhắc lại 31/10/2026

**CHƯA TRIỂN KHAI.** Không có module AI phân tích khách hàng trong code hoặc VPS; dashboard số liệu và hồ sơ 360° không phải AI. [Phạm vi, dữ liệu, quyền và tiêu chí nghiệm thu](tasks/AI-CUSTOMER-INSIGHTS-01.md). Ưu tiên thực hiện sau cổng dữ liệu/riêng tư; không gửi dữ liệu khách tới model bên ngoài hoặc hiển thị dự báo giả khi chưa có cấu hình, quyền và bằng chứng kiểm thử.

## Cổng nghiệm thu 31/10/2026

[Đối chiếu kế hoạch gốc](ACCEPTANCE_GAP_AUDIT_2026-10-31.md) là thứ tự khắc phục hiện hành. Chủ dự án xác nhận giữ chính sách 07/10: giao đủ một lần, không bán chịu, không COD; đây là thay đổi phạm vi so với kế hoạch gốc. P0 còn lại: dữ liệu/chính sách hàng thật; hoàn tiền/giảm nợ; import khách/đơn; chi phí nhập/cảnh báo tồn; báo cáo net/giá vốn; kịch bản hai đơn liên module; nghiệm thu giao diện; backup off-host và phục hồi DB+file. Không đánh dấu Đợt 08 DONE dựa trên build hoặc HTTP 200. Toàn bộ API E2E trên PostgreSQL scratch mới đạt 18 suite/63 test ngày 31/10; điều này không thay browser/live acceptance. Import Shopee đã deploy 30/10; vẫn cần workbook thực tế và nghiệm thu qua UI. Các checkpoint cũ bên dưới giữ để truy vết, không phải trạng thái mới nhất.

## SOCIAL-INBOX-TICKET-01 — tiếp sau code local 2026-10-14

- Kiểm tra browser desktop/mobile với dữ liệu scratch; xác nhận vùng cuộn, focus, chuyển mục, tạo/cập nhật ticket và ảnh không chứa khách thật.
- Thêm phân trang/count/filter server cho hơn 100 hội thoại/bình luận/ticket và dữ liệu bài viết gốc/avatar/media hợp lệ; hiện UI ghi rõ chỉ lọc tối đa 100 mục đã tải mỗi loại.
- Quyết định visibility/retention của tin, bình luận, ticket trước khi đưa vào Customer 360. Gửi chat/reply chỉ triển khai sau khi endpoint/quyền provider được kiểm chứng live.

## Ưu tiên hiện hành 2026-10-13 — FB-UNBLOCK-BACKFILL-01

- `LIVE_PARTIAL` Messenger history: 8 tin thật/2 hội thoại đã nhập, nhập lại 100 trang không tăng số tin. Chưa chứng minh UI browser hoặc độ phủ toàn Page. Job giới hạn trang và có thể mở rộng checkpoint có kiểm soát.
- `BLOCKED_PERMISSION` comment history: Page posts đọc được, Graph `/post/comments` code 10; cần quyền `pages_read_user_content`/App Review rồi reconnect grant.
- `WAITING_FOR_META` Messenger/comment realtime: app Sơn CRM chưa phát hành vì thiếu URL chính sách quyền riêng tư, Quick Tunnel cũ đã hết phiên. Chuẩn bị URL/chính sách thật, xét duyệt và webhook ổn định; sau đó nghiệm thu từng event mới từ Meta đến UI. Chi tiết [`tasks/FB-UNBLOCK-BACKFILL-01.md`](tasks/FB-UNBLOCK-BACKFILL-01.md).

## Ưu tiên hiện hành 2026-10-12 — CRM-CONTINUE-SOL-01

- `P0 FB-SYNC-FIX-01 — PARTIAL/BLOCKED LIVE`: Parser comment edit/remove đã sửa và kiểm thử local; Messenger grant/Page subscription xác minh bằng Graph thật. Webhook Meta đã Verify & Save host HTTPS mới ngày 2026-10-12; Meta app vẫn chưa phát hành và bình luận thiếu `pages_read_user_content`. Không có live inbound job. Theo dõi tại [`tasks/FB-SYNC-FIX-01.md`](tasks/FB-SYNC-FIX-01.md).
- Sau khi hoàn tất phát hành/quyền Meta và tự tạo tin+bình luận mới, trace qua DB/API/UI/replay mới đóng P0. P1 độc lập kế tiếp: health/lifecycle connection, Zalo OA và adapters sàn theo tài liệu/quyền thật; không tự bật đồng bộ dữ liệu giả.

## CHANNEL-AUTH-01 — trải nghiệm kết nối Facebook (2026-10-11)

- `DONE LOCAL — UX`: người quản lý Page chỉ cần nút Kết nối Facebook, đăng nhập/cấp quyền và chọn Page; không nhập App ID/secret hay tạo Meta app. Chi tiết cấu hình và khai báo thủ công được thu gọn dưới mục dành cho người triển khai.
- `WAITING — nền tảng`: CRM/đơn vị triển khai phải cấu hình một Meta app dùng cho dịch vụ, HTTPS callback/webhook và quyền phù hợp; chủ dự án xác nhận hiện chưa có app. Đừng chuyển việc này thành bước onboarding của từng chủ Page.
- `WAITING — nghiệm thu`: cần chạy UI OAuth trên Page sikeoLC, Page subscription, Messenger/feed comment thật, replay và lỗi quyền trước khi gọi kết nối thật. UI chưa thử trực quan do browser helper vẫn dừng.

## MERGE-CRM-01 — hợp nhất checkout

- `DONE — lịch sử Git`: `CRM-home/main` (`71c7369`) là tổ tiên; merge commit `f4ea342` đã tích hợp nhánh này vào `CRM/main`. Không tạo merge lặp.
- `DONE — chuẩn hóa local`: nhánh `integration/merge-crm` từ `19ccb7e`; xem [`MERGE_REPORT.md`](MERGE_REPORT.md). Hai checkout nguồn được giữ nguyên để đối chiếu.
- `WAITING — xác minh`: chạy kiểm tra hiện trạng, build/test và migration fresh/upgrade trên DB scratch. Không sử dụng database local đang chứa dữ liệu.

## Đợt A — audit tham chiếu AMIS và khách hàng 360° (2026-10-08)

- Ma trận audit theo yêu cầu cửa hàng và tham chiếu AMIS: [`AMIS_FEATURE_MATRIX.md`](AMIS_FEATURE_MATRIX.md). Không coi tính năng AMIS theo gói là cam kết hoặc đặc tả CRM này.
- Đã thêm CustomerNote append-only có audit; API timeline cursor hợp nhất hồ sơ/ghi chú/task/opportunity/quote/order từ module hiện có; response lọc theo quyền module và chỉ business hiện tại. UI thêm ghi chú/lịch sử phân trang, vẫn tách ghi chú profile hiện tại khỏi sự kiện.
- Cấm suy ra “đã mua”/revenue từ quote, opportunity hay đơn nháp. Tiêu chí AC-360 ở `ACCEPTANCE.md`.
- Đã kiểm tra fresh migration/E2E/lint/typecheck/build; còn browser visual acceptance và import/export khách. Ticket kế tiếp sau Đợt A: hoàn thiện import/export khách hoặc chọn ticket B theo backlog, không mở rộng nghiệp vụ giá/kho/tiền.

## Cập nhật triển khai đa kênh 2026-10-08

- `DONE LOCAL`: additive connection/job/conversation/comment/external-order/SKU-mapping schema; Meta signature/challenge ingress; DB worker lease/retry/dead-letter; tenant/RBAC APIs; duplicate-safe order import/AdminAlert; UI tabs và setup guide.
- `DONE LOCAL`: Zalo OA inbound message webhook event/signature/payload normalization and replay-safe persistence; signature/payload fixtures only.
- `WAITING`: browser UI acceptance; Zalo comment API verification; official Shopee order endpoint/sign/pagination; TikTok order client/OAuth/signature; test app/shop credentials và evidence.
- `WAITING`: retention/PII deletion policy và staff visibility matrix trước khi nhận dữ liệu khách vận hành.
- Không đánh dấu connector `DONE` hoặc production-ready cho tới khi test provider thật, duplicate/revoke/error/replay và evidence redacted được lưu.

Trạng thái: `DONE` tài liệu/prototype đã tạo; `WAITING` cần xác nhận/bằng chứng; `READY` đủ đặc tả để bắt đầu khi dependency xong; `LATER` chưa đến đợt.

## Đợt 00 — đặc tả và thử quyền

| ID     | Việc                           | Trạng thái | Bằng chứng/điều kiện xong                                                                                                          |
| ------ | ------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| S00-01 | Chuẩn hóa PRD/phạm vi          | DONE       | `PRD.md` tách confirmed/assumption/open                                                                                            |
| S00-02 | Quy tắc nghiệp vụ có mã        | DONE       | `BUSINESS_RULES.md` gồm bất biến kho/tiền/quyền                                                                                    |
| S00-03 | Mô hình dữ liệu đích mức khung | DONE       | `DATA_MODEL.md`, không tạo schema sớm                                                                                              |
| S00-04 | Khung API v1                   | DONE       | `API_CONTRACT.md`, lỗi/idempotency/concurrency                                                                                     |
| S00-05 | Backlog và acceptance          | DONE       | Tài liệu này + `ACCEPTANCE.md`                                                                                                     |
| S00-06 | Tối đa 5 quyết định chặn       | PARTIAL    | OPEN-03/04/05 đã chốt ngày 2026-10-07; OPEN-01 chọn Facebook nhưng thiếu Page/app/test access; thời hạn trả hàng còn thiếu số ngày |
| S00-07 | Prototype 6 màn hình           | DONE       | `prototype/`, nhãn dữ liệu mẫu, responsive                                                                                         |
| S00-08 | Người dùng chính thử prototype | WAITING    | Biên bản tại `UI_PROTOTYPE.md`                                                                                                     |
| S00-09 | Thử quyền Facebook thật        | WAITING    | Facebook được chọn; cần Fanpage, developer app/test account và evidence theo `INTEGRATION_READINESS.md`                            |

Đợt 00 chỉ hoàn thành hoàn toàn khi S00-06, S00-08 và ít nhất kết luận khả thi/không khả thi có bằng chứng của S00-09 được ghi nhận. Không để chờ cấp quyền kênh chặn chuẩn bị core, nhưng không đổi trạng thái connector thành “đã tích hợp”.

## Roadmap

| Đợt | Phạm vi                                               | Phụ thuộc                  | Trạng thái                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Monorepo, môi trường, auth nhân viên, RBAC, audit, CI | 00 đủ quyết định core      | DONE LOCAL; chờ lần chạy CI remote                                                                                                                                                                                                                                                                                     |
| 02  | Khách, nhóm sỉ/lẻ, nhiều địa chỉ, nhắc việc           | 01                         | DONE LOCAL; chờ phản hồi người dùng                                                                                                                                                                                                                                                                                    |
| 03  | Sản phẩm, SKU, đơn vị, ảnh                            | 01 + OPEN-02               | DONE LOCAL theo giả định tạm                                                                                                                                                                                                                                                                                           |
| 04  | Nhà cung cấp, nhập hàng, tồn đầu, sổ kho              | 03 + OPEN-05               | 04A–04C-B đã qua migration/E2E local; cần kiểm tra UI trực quan và chốt BR-STOCK-10                                                                                                                                                                                                                                    |
| 05  | Giá sỉ/lẻ, bậc giá, báo giá                           | 02,03 + OPEN-03            | 05A–05C đã qua migration/seed/E2E local; chính sách thuế chốt, còn browser check trước vận hành                                                                                                                                                                                                                        |
| 06  | Đơn, xác nhận, giữ, hủy, giao                         | 04,05 + policy 03–05       | 06A–06E core draft/reservation/paid confirmation/full shipment, delivery, and warehouse queue implemented locally; browser check pending; COD excluded pending policy resolution                                                                                                                                       |
| 07  | Thu tiền, công nợ, chi phí                            | 06 + policy 04/07          | 07A receipts/allocation/AR; 07B customer-credit application/reversal and read-only receivables screen implemented locally; expenses and cash refunds remain; COD blocked by policy conflict                                                                                                                            |
| 08  | Đổi trả, COD tay, báo cáo, import, backup/pilot       | 06,07 + return window      | 08A return intake/config/QA/stock ledger; 08B gross report with date filters/CSV; Postgres restore verification with representative order/stock/AR/return rows tested locally. File restore, secure retention, import, net-after-return, COD/refund accounting and pilot remain. Day-count semantics need confirmation |
| 09  | Hộp thư connector đã kiểm chứng                       | 00,02,06 + Facebook access | Facebook selected first; Page/app/test account/scopes/evidence still missing; no integration claimed                                                                                                                                                                                                                   |
| 10  | AI gợi ý và đơn nháp                                  | 09 + chính sách duyệt      | LATER                                                                                                                                                                                                                                                                                                                  |
| 11  | Website mua lại, OTP                                  | 02,05–08                   | LATER                                                                                                                                                                                                                                                                                                                  |
| 12  | Online payment + một hãng giao                        | 11 + hợp đồng provider     | LATER                                                                                                                                                                                                                                                                                                                  |
| 13  | Một sàn ưu tiên rồi sàn tiếp                          | 03–08 + quyền              | LATER                                                                                                                                                                                                                                                                                                                  |
| 14  | Marketing/chăm sóc/báo cáo nâng cao                   | 09–13 theo nhu cầu         | LATER                                                                                                                                                                                                                                                                                                                  |
| 15  | API đối tác, dự báo, tối ưu                           | Core ổn định, đủ dữ liệu   | LATER                                                                                                                                                                                                                                                                                                                  |

### Phản hồi giao diện cần tiếp tục

- `UX-01 — LOCAL IMPLEMENTED; BROWSER CHECK PENDING`: sau phản hồi cỡ 14px/16px vẫn quá nhỏ, đã nâng nhãn phụ/trợ giúp/bảng lên 16px và điều khiển lên 18px trong CRM. Mở desktop/mobile để rà độ tràn, hàng bảng và cỡ chữ thực tế.
- `UX-02 — WAITING ĐỢT 06`: biểu đồ doanh thu theo tháng và sản phẩm bán chạy cần module đơn bán/dữ liệu thật, thời gian báo cáo và chính sách giao/trả; không sinh dữ liệu giả.
- `UX-03 — WAITING ĐỢT 09`: hộp thư/chat ưu tiên Facebook; cần Fanpage, tài khoản developer/test và quyền API; cần evidence nhận/gửi trước khi coi là tích hợp.
- `UX-04 — BROWSER CHECK PENDING`: source UI là UTF-8, có `<html lang="vi">` và test chống mojibake; kiểm tra dấu tiếng Việt trên giao diện được đăng nhập, các dữ liệu nhập và luồng in báo giá bằng browser.

### Tiến độ Đợt 05 sau khi nhận quy tắc bậc từ chủ dự án

- `05A IMPLEMENTED; VERIFIED LOCAL 2026-10-06` — API/UI/DB lưu giá admin lẻ tại bậc 1 và giá theo SKU/bậc sỉ; đơn vị bán cố định; resolver nhận lượng thập phân, trả `PRICE_NOT_CONFIGURED` khi thiếu giá. Có `price.edit`, expectedVersion, idempotency và audit. 12 migration + seed và 8 file/32 E2E pass trên PostgreSQL 17.6 thử cô lập; UI cần browser check.
- `PROTOTYPE ONLY` — prototype tĩnh vẫn minh họa cùng quy tắc nhưng không lưu; màn hình CRM chính dùng API/DB thật.
- `DECIDED 2026-10-05` — bảng giá chung; mỗi SKU một đơn vị bán cố định; admin nhập giá lẻ và các bậc theo đơn vị đó; dưới 5 dùng giá lẻ, từ 5 lên bậc mỗi 5; lượng lẻ tới 6 chữ số; làm tròn từng dòng VND nửa lên; thiếu giá thì không tự tính; giảm phần trăm/VND trên dòng/toàn báo giá; báo giá hết hạn sau 72 giờ từ lúc khách nhận; PDF/in/chia sẻ thủ công giai đoạn đầu; có phí giao/thuế/cọc/ghi chú; chuyển báo giá còn hạn giữ snapshot; cần thông báo Admin khi khách đặt qua nền tảng.
- `05B IMPLEMENTED; VERIFIED LOCAL 2026-10-06` — API/UI cho báo giá nháp, snapshot giá, giảm dòng/toàn báo giá, phí giao/thuế/cọc, revision bất biến, ghi nhận nhận báo giá và in/lưu PDF qua trình duyệt; 13 migration + seed, 9 file/33 E2E pass. Chính sách tính thuế được chốt 2026-10-07; còn browser check trực quan trước vận hành.
- `DECIDED 2026-10-07` — thuế hỗ trợ % hoặc VND; mỗi báo giá chọn một kiểu, phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc. Chủ dự án chọn giữ cách tính hiện tại (03-A). Còn browser check trước vận hành; người có `price.edit` tự quyết định mức giảm, không có trần riêng.
- `05C IMPLEMENTED; VERIFIED LOCAL 2026-10-07` — `POST /quotes/{id}/convert` chỉ nhận quote `SENT` còn hạn, tạo đúng một order `DRAFT` từ revision đã chốt, đổi quote thành `ACCEPTED`, ghi audit và alert nội bộ cho nhân viên có `staff.manage` trong cùng transaction. Không giữ kho/ghi công nợ. Migration + seed và 9 file/33 E2E pass trên PostgreSQL thử mới; typecheck/lint/unit/format/build pass. Browser UI vẫn cần rà trực quan. Không có thông báo nền tảng đến khi connector được kiểm chứng bằng tài khoản thử.

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
- `02 — CUSTOMER CHANNEL GROUPING IMPLEMENTED LOCALLY 2026-10-08` — Facebook/Messenger và Zalo tự xếp khách sỉ; Shopee/TikTok Shop tự xếp khách lẻ. Backend override nhóm client gửi khi nguồn thuộc các kênh đã chốt; nguồn khác vẫn thủ công. Connector và đồng bộ khách từ nền tảng vẫn chờ tài khoản/quyền/evidence.
- **03A:** product/variant/SKU; **03B:** unit conversion được backend kiểm tra; **03C:** ngừng bán + media metadata.
- **04A:** purchase order không tăng tồn; **04B:** goods receipt từng phần sinh ledger; **04C:** tồn đầu/kiểm kê/điều chỉnh.
- **05A:** price resolver có test thứ tự và 9/10/11; **05B:** quote snapshot/version; **05C:** convert thành draft order và kiểm tra lại.
- **06A–06E:** list/detail/manual draft, quote reservation/cancel, full-payment confirmation, allocations/AR settlement, full shipment/delivery, and a warehouse queue that does not require `orders.read` implemented locally. 07B credit application/reversal and read-only AR list are implemented; expenses and cash refunds remain. 08A returns and 08B gross delivered-sales report are implemented locally, but COD, return financial adjustments, net reports/imports and browser acceptance remain; day-count semantics need policy confirmation. 09 needs Facebook Page/app/test access and evidence.
- **08 backup check:** `scripts/backup-and-verify.ps1` creates a custom-format Postgres dump from an explicitly named source container, refuses overwrite, restores to a fresh isolated scratch container and compares critical table counts. Optional `BACKUP_VERIFY_SOURCE_CONTAINER` E2E now exercises it while a confirmed/delivered/returned fixture with stock and AR settlement is present. File storage/restore, encrypted retention and production scheduling remain outside this local check.
- **08B UI follow-up:** authorized users can choose the report date range and download the currently displayed delivered-goods gross and best-seller data as CSV. Browser visual acceptance remains pending.

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
- `CODED; CHECKS PENDING` — nhập catalog từ file Shopee `.xlsx`: inspect/mapping/preview/apply, transaction Serializable, idempotency, metadata ảnh HTTPS; không nhập giá/tồn. Cần chạy migration/API test trên PostgreSQL scratch và browser acceptance. Chỉ dùng dữ liệu vận hành sau xác nhận `OPEN-02`.

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

### 2026-10-15 — SOCIAL-OPERATIONS

- Meta: callback HTTPS ổn định + privacy policy/app publish/review; thử webhook tin mới từ tài khoản kiểm soát, gửi từ CRM và đối chiếu Messenger. Hiện CODE_READY, chưa LIVE_VERIFIED.
- Meta comments: cấp pages_read_user_content/pages_manage_engagement và Page MODERATE thực tế, sau đó thử reply. Hiện PERMISSION_REQUIRED.
- Chat → báo giá/đơn: nút mở báo giá nháp đã điền Customer liên kết và ghi chú nguồn hội thoại; còn cần FK nguồn bất biến, ticket source, thử bằng dữ liệu có SKU/giá/tồn và xác nhận chuyển đơn. Không tự chốt hoặc ghi tiền.
- Cập nhật 2026-10-15: FK Conversation/Message/Ticket đã thêm ở Quote, Order truy qua sourceQuote; scratch E2E cho tạo báo giá/nguồn/idempotency đạt. Còn nghiệm thu UI trực quan chat → báo giá → đơn và live Messenger sau khi callback, app publish đủ điều kiện. Không đưa fixture vào DB vận hành.
- Shopee/TikTok: app/shop OAuth + scope thật trước adapter nhận đơn/fulfillment. Zalo: OA/app grant và account test trước adapter gửi. Hiện NOT_CONNECTED.

### 2026-10-16 — Multi-Page và live acceptance

- Multi-Page code + staff access đã kiểm trên DB scratch; chưa áp migration mới lên DB vận hành. Cần nghiệm thu UI trên môi trường scratch tách biệt và kiểm thêm phản hồi permission khi nhân viên bị thu quyền giữa lúc đang mở hội thoại.
- Hostname HTTPS cố định chưa được cấp. Chuẩn bị ngrok assigned dev domain hoặc Cloudflare named Tunnel với tên miền chủ dự án; kiểm riêng OAuth/webhook từ Internet rồi mới trình URL cụ thể và rollback trước khi đổi Meta.
- Khi Meta app/role và callback cho phép, thử một tin mới + một câu trả lời CRM xuất hiện trên Messenger cho Page đầu; sau đó Page thứ hai. Giữ bằng chứng event/job/DB/UI theo Page và echo không trùng. Chưa gọi fixture live.
- Cần chủ dự án xác nhận tên đơn vị, email yêu cầu dữ liệu, retention, Page thứ hai và tài khoản thử trước khi chốt privacy policy/review và thử live.
