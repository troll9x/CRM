# Vận hành đa kênh trong CRM — checkpoint 2026-10-15

## Phạm vi và bằng chứng

- Checkout `C:\Users\Admin\Downloads\CRM`, `integration/merge-crm`, HEAD ban đầu `1925a9f`; giữ nguyên worktree đang sửa. DB local `son_crm_ui_account` được backup và thử phục hồi trước migration 31. Backup: `C:\Users\Admin\AppData\Local\SonCRM\Backups\son_crm_ui_account_pre_outbound_20261014_01.dump`, SHA256 `E38329840F0FBA8D85C45191BAD339735E7AD0359E911EA0F4D8DDB9FD530ADB`.
- Trước/sau migration: 2 hội thoại, 8 tin nhập lịch sử, 0 bình luận, 0 outbound. Không tạo fixture trong DB này.
- Chrome trên máy chủ dự án, CRM tài khoản thử: một Facebook Page đã kết nối. Nút **Kiểm tra quyền gửi Meta** gọi Graph thực tế ngày 2026-10-15: `CHECKED`; `pages_messaging` và Page task nhắn tin có; `pages_read_user_content` và `pages_manage_engagement` thiếu, Page task `MODERATE` có. Hai hội thoại hiện có đã cũ (9 và 11/10), capability `OUTSIDE_24H_WINDOW`; không POST tin tới khách.
- Meta dashboard: app `Sơn CRM` đang **Đã hủy đăng**, nút Đăng bị vô hiệu, còn thiếu URL chính sách quyền riêng tư. Webhook Page vẫn trỏ Quick Tunnel `held-moss-program-mats.trycloudflare.com`; endpoint đó không còn hoạt động. CRM chưa ghi nhận webhook thật. Lịch sử nhập từ Graph không phải webhook live.
- Một Quick Tunnel thử được dựng qua gateway local allowlist; GET không challenge trả 401, đường ngoài allowlist trả 404. Chủ dự án chọn **giữ cấu hình Meta hiện tại**, nên URL mới không được lưu vào Meta; gateway/tunnel đã dừng. Quick Tunnel chỉ phục vụ thử nghiệm, không phải endpoint vận hành ổn định.
- Không có thử nghiệm tin mới → webhook → CRM → Messenger; `LIVE_VERIFIED` = **không** cho tuyến này. Không có bình luận hoặc đơn sàn thử thật.

## Ma trận capability theo tài khoản và tác vụ

`CODE_READY` chỉ là code và test local, không phải quyền của tài khoản. `PERMISSION_REQUIRED`/`REVIEW_PENDING` là chặn ở provider; UI gửi chỉ mở khi endpoint riêng trả `CAN_SEND` cho đúng record.

| Provider / tài khoản | Tác vụ, API và điều kiện | Code / gọi thật | Trạng thái |
| --- | --- | --- | --- |
| Facebook Page `157…230` | Đọc Messenger: Page webhook `messages`, Conversations API, Page token, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, task Page; Advanced Access để đọc người ngoài vai trò app | Webhook ký HMAC + queue/checkpoint, 8 tin lịch sử / 2 chat; không có webhook thật; callback chết | `CODE_READY`, `PERMISSION_REQUIRED` cho vận hành ngoài vai trò app |
| Facebook Page `157…230` | Gửi Messenger: `POST /{page-id}/messages`, Page token, `pages_messaging`, Page `MESSAGE`, PSID cùng Page, inbound trong 24 giờ, app mode/review phù hợp | Graph GET grant live `CHECKED`: quyền/task có; 2 chat cũ bị khóa; POST chỉ qua test fixture, chưa thấy tin trên Messenger | `CODE_READY`, chờ tin mới và callback, **chưa `LIVE_VERIFIED`** |
| Facebook Page `157…230` | Đọc bình luận: Page feed/comments, `pages_read_user_content` và quyền Page tương ứng | Backfill Graph từng trả code 10, 0 comment local | `PERMISSION_REQUIRED` |
| Facebook Page `157…230` | Reply: `POST /{comment-id}/comments`, `pages_manage_engagement` + đọc nội dung + `MODERATE` task | Graph GET grant live: hai quyền thiếu, task `MODERATE` có; adapter local chưa POST thật | `PERMISSION_REQUIRED` |
| Facebook Page `157…230` | Đơn/sản phẩm/kho: không thuộc API inbox Page; không tự tạo đơn từ tin | Không có nguồn đơn Page được cấp | `UNSUPPORTED` trong mốc này |
| Zalo OA | Đọc/gửi OA: OAuth OA token, OA webhook và điều kiện tương tác Zalo; xác thực OA/app thực tế | Không có OA kết nối, không bật gửi | `NOT_CONNECTED` |
| Zalo OA | Bình luận, đơn, sản phẩm/kho | Chưa xác nhận API/scope hoặc account cụ thể | `UNSUPPORTED` / `NOT_CONNECTED` |
| Shopee shop | Đọc đơn/cập nhật, sản phẩm/kho: Shopee Open Platform partner credentials, shop authorization, scope và signed API/webhook | Chỉ có model `ExternalOrder`/`IMPORT_ONLY`, mapping và UI; không có shop token, không có API live | `NOT_CONNECTED` |
| Shopee shop | Chat/comment/gửi | Chưa xác nhận scope cho shop/app này; không có adapter gửi | `NOT_CONNECTED` |
| TikTok Shop | Đọc đơn: Open API `order/202309/orders/search`, shop access token, `shop_cipher`, signed request, scope Order; webhook tương ứng | Chỉ có hàng đợi đơn ngoài và UI, chưa có app/shop authorization | `NOT_CONNECTED` |
| TikTok Shop | Fulfillment, sản phẩm/kho, chat/comment/gửi | Scope theo từng API/app/shop và trạng thái review chưa kiểm được; không ghi ngược ra sàn | `NOT_CONNECTED` |

Nguồn chính thức: [Meta Messenger Send API](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api), [Meta Conversations API](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a), [Zalo Developers](https://developers.zalo.me/docs), [Shopee Open Platform](https://open.shopee.com/), [TikTok Shop Order API](https://partner.tiktokshop.com/docv2/page/get-order-list-202309), [TikTok Shop common authentication](https://partner.tiktokshop.com/docv2/page/common-parameters).

## Đã triển khai và kiểm thử local

- `SocialOutbound` có request key duy nhất theo business, trạng thái `PENDING/SENDING/SENT_TO_PROVIDER/FAILED/UNKNOWN`, provider ID và audit. Graph timeout/rate limit để `UNKNOWN`, không tự POST lại. Echo webhook dedupe bằng provider message ID. `SENT_TO_PROVIDER` chỉ nghĩa Graph trả ID, không nghĩa khách nhận/đọc.
- API capability theo từng hội thoại/bình luận và read-only grant theo Page; kiểm CRM RBAC, scope business, assignment, Page PSID, 23 giờ an toàn, token, quyền/task Graph ngay trước POST. Comment dùng endpoint riêng và parent comment ID; Graph code 10 trở thành lỗi quyền, không hiện đã đăng.
- UI soạn/gửi chỉ hiện khi `CAN_SEND`, phân biệt chấp nhận/unknown/thất bại. Với tài khoản chưa đủ quyền có lý do cụ thể.
- Từ hội thoại có Customer đã liên kết và quyền `quotes.write`, nhân viên mở báo giá nháp với Customer được chọn sẵn, ghi chú nội bộ mang ID hội thoại; họ vẫn phải chọn SKU, kiểm giá/tồn và tự lưu/phát hành/chuyển đơn bằng flow quote hiện có. DB UI hiện có 0 Customer/0 SKU, nên chưa nghiệm thu thao tác tạo báo giá từ chat trên dữ liệu thật; nguồn hiện là ghi chú, chưa có FK bất biến tới hội thoại.
- Scratch E2E outbound 3/3 đạt: cross-business 404, guest 401, Graph acceptance + provider ID, idempotent replay, echo không nhân đôi, comment bị chặn/được cấp và reply đúng parent, timeout UNKNOWN không tự phát lại. API unit 48, web unit 10; typecheck/lint/build API+web và Prisma validate đạt trước bổ sung khôi phục SENDING cuối cùng. Nút grant đã được kiểm qua Chrome/Graph thật.

## Mốc tiếp theo cần bằng chứng ngoài local

1. Meta: công bố URL chính sách quyền riêng tư hợp lệ và xét duyệt/publish app; dựng HTTPS callback ổn định do dự án sở hữu, xác minh Meta Page webhook. Đây là việc cấu hình/publish bên ngoài, không đánh dấu hoàn tất khi chưa có event.
2. Tài khoản thử do chủ dự án kiểm soát gửi **tin mới** tới đúng Page, nhân viên thấy webhook tin mới trong CRM rồi gửi một câu thử từ CRM; đối chiếu provider ID và ảnh Messenger. Không dùng chat cũ hoặc gửi khách thật.
3. Meta cấp quyền bình luận thực tế, thử một bình luận kiểm soát và reply Page; đối chiếu ID và UI Page. `code 10` giữ ở trạng thái thiếu quyền.
4. Với Shopee/TikTok và Zalo: cần app/shop/OA OAuth, scope và account test trước API live. Chưa có các thứ này thì hàng đợi `IMPORT_ONLY` và UI không được gọi là tích hợp live.

## Tiếp tục 2026-10-15 (sau checkpoint trên)

- Đã thêm FK bất biến Conversation/Message/Ticket trên Quote, Order đọc nguồn qua `sourceQuote`; ghi chú không còn là chứng cứ duy nhất. Scratch E2E tạo Customer/SKU/giá/tồn, quote→revision→order và kiểm scope/idempotency đạt 3/3. API/web build, typecheck, API lint đạt.
- DB local `son_crm_ui_account` đã backup/restore-verify rồi áp migration cộng thêm 32/32; 2 chat/8 tin/0 comment/0 outbound/0 quote trước và sau. Không seed dữ liệu thử. API/web readiness 200. UI hiện chưa có Customer/SKU liên kết để nghiệm thu thao tác thật.
- Gateway local có health/readiness và bài thử 1/1 cho allowlist, GET challenge, POST giữ nguyên chữ ký. Webhook E2E scratch 1/1 cho HMAC/queue/worker/dedupe. Chưa có HTTPS cố định công khai hoặc event Meta thật. Xem [đề xuất callback](FB-STABLE-CALLBACK-PROPOSAL-2026-10-15.md); Meta giữ nguyên theo chỉ đạo. Tài khoản hiện chưa có tên miền/máy chủ, có phương án ngrok dev domain cố định cho giai đoạn thử nếu chủ dự án tạo tài khoản.
- Dashboard Meta quan sát lại: app chưa phát hành; Page webhook vẫn URL Quick Tunnel cũ; `messages`/`feed` hiển thị đăng ký. Messenger use case chỉ hiện các quyền Page đọc/nhắn tin, chưa có `pages_read_user_content`/`pages_manage_engagement`. Bản nháp review đã cập nhật theo luồng reply hiện có. Không nộp review và không phát tin bình luận khi quyền thiếu.
