# Tích hợp đa kênh — trạng thái và cấu hình

## Trạng thái Facebook — cập nhật 2026-10-11

- App `Sơn CRM` (`1682297180226928`), use case Messenger. Meta permissions table hiện cho thấy `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement` “Sẵn sàng thử nghiệm”; đó chỉ là app readiness, chưa chứng minh OAuth grant hoặc quyền trên Page. `pages_read_user_content` không xuất hiện trong bảng quyền của use case hiện tại; docs Meta trả 429 nên đường cấp quyền/review riêng chưa được xác minh.
- Callback OAuth đã lưu: `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/integrations/oauth/facebook/callback`. Webhook là route riêng theo code: `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/webhooks/facebook`. HTTP client từ API container qua tunnel xác nhận đúng verify token → 200/body khớp `hub.challenge`, token sai → 401.
- Cập nhật 2026-10-11: Meta Page Webhooks hiện hiển thị endpoint đã đăng ký, verify token dạng che, field `messages` và `feed` đã đăng ký. Tuy nhiên app chưa phát hành; dashboard cảnh báo không gửi production events cho tới khi app được phát hành. Sau khi phát hành, cần thử bằng tin nhắn thật và xác minh webhook jobs/inbox.
- Đính chính 2026-10-11: `FACEBOOK_APP_SECRET` đã có trong root `.env`; API/worker ban đầu chưa nạp lại cấu hình. Đã recreate riêng hai service và xác nhận runtime có secret (không in giá trị). Webhook HTTPS handshake đã kiểm chứng đúng token → 200/challenge chính xác, sai token → 401. OAuth đã mở từ CRM; Meta đang ở màn hình xác nhận kết nối tài khoản với Sơn CRM. Cần hoàn tất consent/callback, chọn Page, lưu connection và Page subscription; chưa `LIVE_VERIFIED`.
- Cập nhật sau OAuth: DB `son_crm_ui_account` có một Facebook connection `CONNECTED`, authorization `VERIFIED`, Page subscription `VERIFIED`; tuy nhiên `webhookSubscription=APP_CONFIGURATION_PENDING`. Hiện chưa có integration jobs/conversations/messages/comments. Tunnel handshake đã thử lại đúng token → 200/challenge match, sai token → 401. Chưa `LIVE_VERIFIED`; xem checkpoint mới nhất trong [`HANDOFF.md`](HANDOFF.md).

Cập nhật: 2026-10-11. Tài liệu này tách phần code local, tài liệu API đã đối chiếu và tích hợp đã chạy bằng tài khoản thật. Hiện chưa có channel nào được xác nhận chạy với tài khoản thật. Meta app dùng chung `Sơn CRM` đã tạo với App ID `1682297180226928`, use case Messenger; Graph API hiện mới nhất `v26.0`. Không ghi App Secret tại đây. OAuth checkpoint hiện hành: [`tasks/CHANNEL-AUTH-01.md`](tasks/CHANNEL-AUTH-01.md).

## Phạm vi bản đầu

- Chỉ nhận dữ liệu vào CRM. Không gửi trả lời, không tạo `SalesOrder`, không ghi phiếu thu/công nợ, không xuất hoặc giữ kho từ đơn ngoài.
- Webhook hợp lệ phải được xác minh chữ ký theo provider và ghi `IntegrationJob` vào PostgreSQL trước khi trả thành công.
- Khóa sự kiện duy nhất theo connection + provider event; message/comment/order được upsert theo external ID. Import lại một đơn không được tạo lại AdminAlert.
- Không tự ghép khách hàng. Nhân viên liên kết thủ công định danh ngoài/đơn/bình luận với hồ sơ CRM. Không tự đổi nhóm của khách đã có.
- Facebook/Messenger và Zalo được gợi ý nhóm khách sỉ; Shopee/TikTok Shop gợi ý nhóm khách lẻ. Phân loại nguồn không tự tạo khách hoặc thay nhóm đang có.
- Bình luận là tài nguyên riêng, không nhập vào conversation Messenger. Ghi chú hội thoại luôn nội bộ, không có endpoint gửi ra kênh.
- Chưa chốt retention nội dung tin/ảnh và phạm vi nhân viên được xem; trước pilot phải giới hạn người có `integrations.read` và chốt thời hạn lưu.

## Trạng thái theo kênh

| Kênh/năng lực | Trạng thái code | Tài liệu đã xác minh | Chưa làm/điều kiện còn thiếu |
|---|---|---|---|
| Nền DB, API, queue, worker, retry, inbox/đơn và SKU mapping | Đã có trong local worktree; migration đã áp dụng vào DB giao diện local `son_crm_ui_account` | Không cần provider | Chưa áp dụng vào DB `son_crm` cũ hoặc production; cần quy trình migration/backup riêng cho các DB đó |
| Facebook OAuth + Page webhook → Messenger | Start/callback/Page selection/subscription/reconnect đã chạy với mock provider trên DB scratch; inbound có challenge + `x-hub-signature-256`; **chưa kết nối thật** | Meta Messenger/Facebook Postman collections và Page SDK | Cần Meta app, Page grant, quyền, cấu hình webhook trong dashboard; cần test Page và sự kiện thực nhận |
| Facebook Page webhook → bình luận feed | Parser/lưu riêng theo comment ID; **chưa kết nối thật** | Meta Page/feed webhook docs cần được xác nhận lại bằng app/scope tại lúc cấp quyền | Cần quyền Page đọc tương tác và test comment thực tế; chưa có thao tác trả lời/xóa |
| Zalo OA OAuth + tin nhắn inbound | OAuth/PKCE, callback/metadata OA, token mã hóa/refresh, chọn OA/reconnect/ngắt local và webhook adapter có raw-body SHA-256 verifier, normalized inbox job/dedupe theo `msg_id`; **chưa kết nối thật** | [Zalo OA Open APIs](https://docs.zaloplatforms.com/docs/OA), [Zalo PHP SDK OA OAuth](https://github.com/zaloplatform/zalo-php-sdk/blob/master/src/Authentication/OAuth2Client.php), OA metadata; API lịch sử hội thoại tối đa 10 tin/request | Cần OA được duyệt, Zalo App và quyền cấp thực, app webhook HTTPS đã đăng ký, test OA/event/evidence; API lịch sử chưa được gọi từ CRM |
| Zalo OA bình luận | Không có adapter/API đọc bình luận được xác nhận | Chưa tìm thấy tài liệu chính thức đủ để kết luận có API đọc comment | Không triển khai bằng suy đoán. Xác minh với Zalo hoặc tiếp tục quy trình thủ công |
| Shopee order | Schema/queue/hàng chờ đơn ngoài sẵn; **API poller chưa có** | Open Platform endpoint cần đối chiếu trong tài khoản Partner Center; trang tài liệu không truy cập được trong lần rà soát | Cần Partner app, partner key, shop authorization và scope đọc đơn; cung cấp tài liệu/API permission từ console |
| TikTok Shop order | Schema/queue/hàng chờ đơn ngoài sẵn; **API poller chưa có** | Official Get Order List `/order/202309/orders/search`: `seller.order.info` hoặc scope fulfilment, page size 1–100, opaque page token, shop cipher, access-token header và request signature | Cần app review, seller shop authorization/scope và test shop. Xác nhận version đang hỗ trợ trước lúc viết API client |

“Đã có code local” không đồng nghĩa “đã tích hợp”. Test fixture trong E2E chỉ kiểm tra persistence/idempotency, không phải dữ liệu hoặc bằng chứng provider thật.

## Người quản lý Fanpage sử dụng CRM

Sau khi dịch vụ đã được người triển khai cấu hình, vào CRM → Kết nối → Kết nối Facebook → đăng nhập và cấp quyền trong Meta → chọn Fanpage → hoàn tất. Người quản lý Page không tạo Meta Developer app, không nhập App ID, App Secret, Page ID, callback hoặc webhook. Nếu dịch vụ chưa sẵn sàng, CRM báo trạng thái và không mở luồng cấp quyền. Việc cấp quyền Page không tự chứng minh tin nhắn/bình luận đã được đồng bộ; cần sự kiện thử thật.

## Cấu hình nền tảng một lần — dành cho người triển khai CRM

Các bước bên dưới là việc của đội triển khai/vận hành CRM, **không phải hướng dẫn cho mỗi chủ Fanpage**. App dùng chung `Sơn CRM` đã được tạo trong tài khoản Meta ngày 2026-10-11 (App ID `1682297180226928`, use case Messenger). Người bán/Page owner không phải tạo app.

1. Không tạo app thứ hai. Trong App settings → Basic, giữ App ID đã ghi ở trên; App Secret chỉ nhập trực tiếp vào backend/secret store, tuyệt đối không gửi qua chat. App đang để trống miền, Privacy Policy URL, Terms URL, user-data deletion URL và chưa publish; không tự điền URL chưa tồn tại.
2. Meta Graph API changelog được kiểm tra trực tiếp ngày 2026-10-11: phiên bản mới nhất là `v26.0`; `.env` hiện đã có App ID, Graph version và ba scope `pages_show_list,pages_messaging,pages_manage_metadata`. Meta dashboard cho ba scope này trạng thái “Sẵn sàng thử nghiệm”. Đang chờ chủ dự án xác nhận thêm `pages_read_engagement` + `pages_read_user_content` để đọc bài Page/bình luận; không thêm `pages_manage_engagement` vì CRM bản đầu không trả lời/xóa bình luận. Sau khi được xác nhận, cập nhật `FACEBOOK_OAUTH_SCOPES` đúng theo app.
3. Trong Facebook Login for Business, tạo/xem configuration ID nếu dashboard bắt buộc. Trong Login settings → Valid OAuth Redirect URIs nhập callback HTTPS ở bước 6, khớp từng ký tự. App role/development mode và Page task vẫn áp dụng; quyền quản lý Page tự nó chưa đủ để grant.
4. Trong Webhooks → Page, nhập webhook HTTPS ở bước 6 và `FACEBOOK_WEBHOOK_VERIFY_TOKEN` từ `.env`; bật field `messages` và `feed`. App-level webhook cấu hình và Page-level subscription đều cần. App Review/Advanced Access có thể cần cho Page/user không thuộc vai trò thử nghiệm; chưa publish app hoặc xác nhận production use.
5. `C:\Users\Admin\Downloads\CRM\.env` bị Git ignore. Giá trị verify/encryption đã được tạo ngẫu nhiên trước đó; App ID/version/scopes vừa ghi bằng `node scripts/configure-facebook-public-config.mjs` mà không hiển thị giá trị secret. Còn phải nhập `FACEBOOK_APP_SECRET` trực tiếp trong `.env` an toàn và cấu hình redirect HTTPS sau khi có tunnel. Sau khi cấu hình đủ, recreate API/worker để nạp biến; hiện các container vẫn chưa nạp App ID/version/scopes. Khóa encryption 32-byte base64 phải giữ bền vững và backup an toàn ngoài Git; không chạy lại script init với mục đích xoay khóa. Không dùng `replace-with-*`, commit hoặc chụp màn hình secret.
5. Local web `http://localhost:3000`, API `http://localhost:4000/api/v1`, PostgreSQL Docker `son-crm-db-1:5432`. Gateway `scripts/facebook-dev-gateway.mjs` lắng nghe `127.0.0.1:4100` và chỉ cho callback/webhook Facebook/Zalo. Quick Tunnel được thử với `cloudflared tunnel --url http://127.0.0.1:4100 --no-autoupdate`; URL thay đổi khi tunnel khởi động lại. Sau khi sửa `.env`, chạy `docker compose up -d --force-recreate api integration-worker` để truyền biến mới. DB UI `son_crm_ui_account` đã được backup/restore thử và áp 28/28 migration tại checkpoint 2026-10-10; DB `son_crm` cũ không được migrate tùy tiện.
6. Chưa có HTTPS tunnel/gateway đang chạy; hostname quick-tunnel từng ghi ở checkpoint cũ đã hết hiệu lực, không dùng để đăng ký Meta. Khi khởi chạy lại tunnel theo bước được chủ dự án chấp thuận, dùng đúng host live mới: Login redirect `https://<host>/api/v1/integrations/oauth/facebook/callback`; webhook `https://<host>/api/v1/webhooks/facebook`; `FACEBOOK_OAUTH_REDIRECT_URI` phải giống URL callback. Browser sau callback quay về `http://localhost:3000/?channelAttempt=<id>&channelResult=<status>` từ `WEB_ORIGIN`; không dùng Host header.
7. Trong CRM, vào Kết nối → Kết nối Facebook, tự đăng nhập/cấp quyền, chọn Page **sikeoLC** từ danh sách API cấp rồi xác nhận. URL Page công khai không phải numeric Page ID. Chỉ gọi `LIVE_VERIFIED` sau khi có subscription thật và Messenger + feed comment test vào đúng business, không nhân đôi khi replay. Postman import [`collection`](postman/channel-auth-01.postman_collection.json) và [`environment template`](postman/channel-auth-01.postman_environment.json); cả hai không chứa secret, cookie/login/token chỉ nhập trong phiên cục bộ và không export giá trị.

Quick Tunnel chỉ phục vụ thử local, không cam kết 24/7. Trước khi dùng dữ liệu khách thật cần chốt retention/phân quyền và kiểm tra app permissions/Meta review. Disconnect trong CRM dừng nhận và xóa token local nhưng hiện chưa revoke subscription upstream; nếu muốn gỡ app tại Meta, thao tác tại Page/App dashboard cho đến khi giao thức revoke được kiểm chứng.

Worker local chạy riêng: `docker compose up -d integration-worker`; worker dùng cùng DB và `INTEGRATIONS_WORKER_ENABLED=true`. API server để biến này `false` để tránh mỗi replica cùng poll. Migration phải được áp dụng bằng quy trình DB scratch/backup-restore đã duyệt; không chạy trực tiếp lên DB `son_crm` cũ chưa đủ migration.

## Cấu hình Zalo OA khi có quyền

1. Tạo/liên kết Zalo App và OA do cửa hàng quản lý; bật quyền nhận sự kiện quản lý tin nhắn phù hợp. Cấu hình URL webhook HTTPS của app là `https://<host>/api/v1/webhooks/zalo`.
2. OA OAuth/PKCE, callback, chọn OA/reconnect/ngắt local và refresh token đã có code/test mock, **chưa thử live**. Trong `.env` backend đặt `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OAUTH_REDIRECT_URI`, `ZALO_OA_SECRET_KEY` và khóa chung `INTEGRATION_TOKEN_ENCRYPTION_KEY`. App secret, webhook secret và khóa chỉ ở backend, không gửi qua chat/Git. Redirect URI chính xác: `https://<HTTPS-host>/api/v1/integrations/oauth/zalo/callback`; webhook: `https://<HTTPS-host>/api/v1/webhooks/zalo`. Nếu dùng quick tunnel đang sống ở checkpoint này, host là `fill-penguin-broadcast-athletic.trycloudflare.com`; phải kiểm tra lại trước khi nhập dashboard. Không khai báo connection thủ công bằng OA ID để nhận event; preflight đủ biến không đồng nghĩa đã cấp quyền.
3. Endpoint chỉ nhận `user_send_*`, xác minh `X-ZEvent-Signature` trên raw body rồi ghi `IntegrationJob` duy nhất theo `message.msg_id`; `oa_send_*` và event khác được bỏ qua. Replay cùng message không tạo thêm tin. Chưa có luồng gọi API đọc lịch sử; inbox hiện nhận realtime webhook.
4. Trong CRM chọn Kết nối → Kết nối Zalo OA, tự cấp quyền OA đã duyệt, kiểm tra OA metadata và xác nhận. Thiết lập webhook trong Zalo App riêng (OAuth không tự đăng ký webhook). Kiểm tra một tin nhắn từ user test và replay payload đã che; lưu evidence theo `INTEGRATION_READINESS.md`. Phần chữ ký/payload/OAuth/refresh chỉ có unit/E2E mock, chưa được xác thực với tài khoản OA thật. Token refresh lỗi tạm thời được giữ để retry; refresh token hết hạn chuyển `REAUTH_REQUIRED`.

## Chuẩn bị các kênh còn lại

- **Zalo:** webhook tin inbound đã có adapter, cần test OA/evidence trước khi coi là kết nối; API lịch sử hội thoại cần access token server-side và quyền quản lý tin nhắn, mỗi request tối đa 10 tin. Bình luận không được tuyên bố hỗ trợ khi chưa có API read chính thức.
- **Shopee:** tạo ứng dụng Open Platform, xin quyền đọc đơn, authorize shop test; lấy partner ID/key và Shop ID trong secret manager. Trước triển khai adapter phải đối chiếu công thức sign, endpoint, trạng thái, phân trang/rate-limit hiện hành từ Partner Center.
- **TikTok Shop:** đăng ký app/market, xin scope `seller.order.info` (hoặc scope fulfillment phù hợp), seller authorize shop; lưu app key/secret/access token/shop cipher trong kho bí mật. Đối chiếu lại endpoint version, HMAC signing, timestamp, pagination và trạng thái đơn trong docs hiện hành.
- Chỉ chạy sync khi shop được liên kết rõ với business và capability được đánh dấu theo kết quả xác thực API; webhook/order có status lạ được lưu hàng chờ, không tự đổi trạng thái CRM.

## Dữ liệu và vận hành

`IntegrationJob.payload` chỉ chứa normalized fields tối thiểu; không lưu access token. Job có lease, số lần thử, thời điểm chạy lại, mã lỗi an toàn và trạng thái dead-letter. Nội dung tin/bình luận, thông tin người nhận đơn và media metadata vẫn có thể là dữ liệu cá nhân: cần quyết định retention, phân quyền, export/delete và backup trước khi dùng dữ liệu khách thật.

Luồng UI dùng dữ liệu đã lưu API: tab Kết nối, Tin nhắn, Bình luận, Đơn sàn, Nhật ký đồng bộ và Liên kết SKU. Nếu danh sách rỗng nghĩa là chưa có sự kiện được xác thực/nhập, không có dữ liệu minh họa.

## Preflight kết nối

Người có `connectors.manage` xem tên biến cấu hình còn thiếu tại `GET /api/v1/integrations/providers/preflight`. API không trả giá trị cấu hình/secret. Facebook/Zalo chỉ trả `canStartAuthorization=true` khi đủ app ID, HTTPS redirect và khóa mã hóa hợp lệ (Facebook thêm Graph version/scopes); đây vẫn chưa phải bằng chứng đã cấp quyền. Shopee/TikTok Shop chưa bật OAuth. Không nhập password nền tảng, token hoặc ID tài khoản để giả lập cấp quyền.

## Tài liệu chính thức đã đối chiếu 2026-10-08

- [Meta Messenger Platform API collection](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api)
- [Meta Facebook API Postman collection — me/accounts/Page token](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)
- [Meta Python Business SDK — Page subscribed_apps](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/)
- [Zalo OA OpenAPI — Khám phá](https://docs.zaloplatforms.com/docs/OA/bat-dau/kham-pha)
- [Zalo OA — Lấy tin nhắn trong hội thoại](https://docs.zaloplatforms.com/docs/OA/tin-nhan/quan-ly-tin-nhan/lay-thong-tin-tin-nhan-trong-mot-hoi-thoai)
- [Zalo OA — Sự kiện quyền chủ thể dữ liệu và chữ ký webhook](https://docs.zaloplatforms.com/docs/OA/webhook/quan-ly/su-kien-nguoi-dung-zalo-thuc-hien-quyen-chu-the-du-lieu)
- [Zalo OA — Sự kiện người dùng gửi tin nhắn](https://stc-developers.zdn.vn/docs/v2/official-account/webhook/tin-nhan/su-kien-nguoi-dung-gui-tin-nhan?lang=vi)
- [Shopee Open Platform](https://open.shopee.com/)
- [TikTok Shop — Get Order List v202309](https://partner.tiktokshop.com/docv2/page/get-order-list-202309)
- [TikTok Shop — API versioning/signature path](https://partner.tiktokshop.com/docv2/page/api-versioning)
