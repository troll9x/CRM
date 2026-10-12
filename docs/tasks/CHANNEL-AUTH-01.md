# CHANNEL-AUTH-01 — Kết nối và vòng đời tài khoản kênh

## Checkpoint 2026-10-11 — Handshake HTTPS thành công

### Đính chính runtime — 2026-10-11

- `FACEBOOK_APP_SECRET` đã có trong root `.env`. Kết luận trước đó rằng file thiếu secret là sai: lúc kiểm tra, API/worker chưa được nạp lại sau lần lưu `.env`. Đã recreate riêng API và worker; kiểm tra presence trong cả hai runtime thành công, không in giá trị secret.
- API readiness trả 200. Handshake HTTPS tới `GET /api/v1/webhooks/facebook`: verify token đúng → 200, body đúng bằng `hub.challenge`; token sai → 401. Webhook URL chính xác `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/webhooks/facebook`; OAuth callback riêng `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/integrations/oauth/facebook/callback`.
- Đã khởi chạy OAuth từ CRM; Meta hiển thị xác nhận kết nối tài khoản với Sơn CRM cùng nút “Đã hiểu”. Chưa xác minh callback, scope grant cuối cùng, Page list/selection, persisted connection/token hoặc subscription. Chủ tài khoản tiếp tục consent trên trang Meta; không gửi authorization code/token qua chat.
- Các checkpoint cũ bên dưới được giữ làm lịch sử và không còn mô tả trạng thái cấu hình hiện tại. Status hiện tại: `LOCAL_TESTED`; OAuth/Page/subscription/event vẫn chưa `LIVE_VERIFIED`.

- API và `integration-worker` Docker Compose được recreate; cả hai runtime thấy `FACEBOOK_WEBHOOK_VERIFY_TOKEN` và `INTEGRATION_TOKEN_ENCRYPTION_KEY`. API health/readiness và web đều HTTP 200.
- `FACEBOOK_APP_SECRET` không có trong `C:\Users\Admin\Downloads\CRM\.env` và runtime của API/worker (chỉ kiểm tra presence, không đọc/in giá trị). OAuth exchange, `/me/accounts`, consent → chọn Page và Page subscription đang BLOCKED vì thiếu biến này. Chủ dự án cần kiểm tra đúng file root `.env` và key `FACEBOOK_APP_SECRET=` rồi báo đã lưu.
- HTTP client từ API container qua HTTPS tunnel xác nhận GET `/api/v1/webhooks/facebook`: token đọc trực tiếp từ config trả 200 với body chính xác `hub.challenge`; token sai trả 401. Webhook URL: `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/webhooks/facebook`. OAuth callback riêng: `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/integrations/oauth/facebook/callback`.
- Tab Meta hiện ở Page Webhooks; webhook URL đã điền, verify token chưa nhập, “Xác minh và lưu” chưa hoạt động. Người dùng tự nhập `FACEBOOK_WEBHOOK_VERIFY_TOKEN` trực tiếp từ `.env` vào trường Meta và bấm Verify & Save vì không có cơ chế browser an toàn để chuyển secret từ file mà không lộ vào tool/chat log. Chưa đánh dấu verified.
- Permissions dashboard hiển thị `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement` “Sẵn sàng thử nghiệm”; đây không phải bằng chứng user grant hoặc Page subscription. Trong bảng quyền Messenger hiện tại không thấy `pages_read_user_content`; tài liệu Meta đang trả 429, nên điều kiện/API review cho scope này còn BLOCKED/UNVERIFIED riêng. Các webhook fields Page `messages` và `feed` hiện chưa đăng ký.
- Kiểm thử: API unit 10/10 files, 39/39 tests PASS; Web integration UI 1/1 PASS; toàn API E2E 15/15 files, 50/50 tests PASS trên PostgreSQL scratch trong tmpfs (đã dừng/xóa; DB vận hành không bị migrate/seed); runtime health/web 200; remote webhook correct-token 200/challenge exact, wrong-token 401. LIVE Messenger/OAuth/Page selection/Page subscription/event delivery chưa đạt.

## Checkpoint 2026-10-11 — Cấu hình Facebook tiếp diễn

Trạng thái này thay thế các ghi chú “đang chờ xác nhận” ở checkpoint trước cho các mục đã hoàn tất:

- Người dùng đã đồng ý thêm `pages_read_engagement` và bật HTTPS tunnel thử nghiệm. Quyền đầu tiên đã thêm trong Meta và dashboard xác nhận “Sẵn sàng thử nghiệm”. `pages_read_user_content` không hiện trong danh sách quyền của Messenger use case; chưa được thêm và cần xác minh đường cấp quyền phù hợp/App Review.
- Webhooks capability đã được thêm vào Messenger use case. Trong dashboard, phải chọn đối tượng `Page` (không phải `Permissions`) cho webhook; URL callback hiện nhập đúng Page object, các trường feed/messages vẫn chưa đăng ký.
- Tunnel Quick Tunnel hiện tại: `https://screenshots-velvet-steam-address.trycloudflare.com` → gateway giới hạn `127.0.0.1:4100`. Kiểm tra HTTPS: path ngoài allowlist 404; callback thiếu `state` 400; webhook thiếu verify token 401. Tunnel là tạm thời, host đổi sau khi dừng/khởi chạy lại.
- Meta OAuth Valid Redirect URI đã lưu chính xác: `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/integrations/oauth/facebook/callback`; screenshot Meta hiện toast “Changes saved”. URL webhook đã nhập vào trường callback nhưng chưa bấm Verify & Save vì thiếu verify token trong form.
- `.env` được cập nhật an toàn bằng `scripts/configure-facebook-public-config.mjs` với App ID, Graph `v26.0`, các scope thử nghiệm và HTTPS redirect; script hỗ trợ `--redirect-uri` và không hiển thị giá trị secret. App Secret còn thiếu. API/worker runtime chưa reload cấu hình.
- Tiếp tục: người dùng nhập App Secret thẳng vào `C:\Users\Admin\Downloads\CRM\.env` ở `FACEBOOK_APP_SECRET=`; nhập `FACEBOOK_WEBHOOK_VERIFY_TOKEN` từ cùng file thẳng vào trường Xác minh mã trong Meta và Verify & Save. Sau đó recreate API/worker, chạy preflight, OAuth từ CRM, chọn Page `sikeoLC`, Page subscription và kiểm thử sự kiện thực.
- Bằng chứng hiện chỉ là UI/config/HTTP path check; chưa có OAuth consent, Page token, Page subscription hoặc Messenger/comment thật. Giữ `LOCAL_TESTED`; không đánh dấu `LIVE_VERIFIED`/`UI_TESTED` cho connector. Không commit/push hoặc mở cổng CRM/DB ra Internet.

## Checkpoint 2026-10-11 — Meta app đã tạo

- App `Sơn CRM` đã được tạo sau khi chủ dự án tự xác thực lại tài khoản; App ID `1682297180226928`. Use case `Messenger from Meta`; không có Business portfolio. App Secret không được đọc hoặc ghi vào tài liệu/chat.
- Đã xem trực tiếp Meta Graph API changelog: phiên bản mới nhất `v26.0` (29/07/2026). App dashboard cho phép thử các scope `pages_show_list`, `pages_messaging`, `pages_manage_metadata`; App-level webhook, callback HTTPS, Page grant và event delivery chưa thiết lập.
- Scope đọc Page/comment chưa được thêm; đang chờ xác nhận action-time cho `pages_read_engagement` và `pages_read_user_content`. Hai scope này là để hiển thị ngữ cảnh bài Page và nhập nội dung bình luận, không bao gồm trả lời/xóa/gửi ra ngoài.
- Meta Basic đang thiếu App domains, Privacy Policy/Terms/deletion URLs; không tạo URL giả. Local `.env` đã nhận App ID/v26.0/ba scope thử nghiệm qua safe config script; Docker API chưa recreate nên runtime chưa nạp chúng. App Secret/redirect vẫn thiếu. Gateway chạy `127.0.0.1:4100`, chỉ cho callback/webhook; HTTP checks ngoài allowlist 404, callback thiếu state 400, webhook thiếu verify token 401. Cloudflare tunnel chưa public, chờ action-time confirmation.
- Đang chờ action-time confirmation để yêu cầu thêm `pages_read_engagement` và `pages_read_user_content` cho mục tiêu inbound comment; không yêu cầu quyền quản lý/trả lời bình luận.
- Trạng thái: implementation `IMPLEMENTED`, local tests `LOCAL_TESTED`, app created; `LIVE_VERIFIED=false`, CRM `UI_TESTED=false`, `DEPLOYED=false`. Tiếp tục cấu hình local app ID/version, HTTPS callback, webhook, secret backend-only, rồi OAuth từ CRM và test event thật.

## Checkpoint bổ sung 2026-10-11 — SOCIAL-ONECLICK-FINAL-01

- Khi kiểm tra trên Chrome session hiện có, tab localhost hiển thị nút `Kết nối Facebook` disabled. API container bind mount checkout hiện tại; năm biến Facebook OAuth đều false/empty trong runtime. Meta dashboard hiển thị chưa có app; wizard chọn app `Sơn CRM` + Messenger use case, chưa chọn business portfolio. Chủ dự án đã xác nhận email liên hệ Meta tự điền. Wizard đang ở trang tổng quan, trước nút cuối tạo app/chấp nhận điều khoản; chưa tạo app hoặc nhận App ID, đang chờ action-time confirmation riêng. Không lưu email trong checkpoint.
- Đọc trọn prompt giao việc cùng hướng dẫn repo và tài liệu liên quan; giữ checkout/worktree. CRM đang chạy sẵn: web 3000, API 4000, DB 5432, worker; health/readiness đều 200.
- Tên Meta env còn thiếu: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_API_VERSION`, `FACEBOOK_OAUTH_REDIRECT_URI`, `FACEBOOK_OAUTH_SCOPES`. Callback route `/api/v1/integrations/oauth/facebook/callback`; webhook route `/api/v1/webhooks/facebook`. Hiện không có tunnel/gateway HTTPS đang chạy nên chưa có URL hostname để đăng ký; không dùng lại URL quick-tunnel cũ.
- Scratch PostgreSQL 17.6 tạm cô lập: 28 migrations + seed, Facebook OAuth/integration E2E 2 files/4 tests PASS. API unit 10/39, Web unit 3/5, API/Web typecheck và lint PASS. Node local 25.9.0 khác Node 24 chuẩn. Scratch đã dừng/xóa; database Compose hiện có không bị migrate/seed.
- Sửa acceptance state: Page-level `subscribed_apps` không còn bị coi là xác minh webhook app-level. Facebook finalize ghi `pageSubscription=VERIFIED`, `messages/comments=PAGE_SUBSCRIBED`, `webhookSubscription=APP_CONFIGURATION_PENDING`; E2E kiểm tra các trạng thái này. Cập nhật hợp đồng API.
- Chưa `LIVE_VERIFIED`, `UI_TESTED` hoặc `DEPLOYED`. Helper recovery policy không cho lặp UI sau lỗi state capture đã retry; chưa truy cập dashboard/tạo Meta app. Meta docs trả 429, Shopee docs trả 403, TikTok docs chỉ trả shell React; không đoán protocol. Zalo official OA overview có thể đọc được, nhưng chưa có OA được duyệt/app grant.
- Tiếp tục an toàn: cần một Meta app dùng chung do nhà cung cấp CRM vận hành, credential được nhập trực tiếp vào secret store/backend và hostname HTTPS ổn định; chủ Page chỉ login/consent/chọn sikeoLC. Lưu ý computer-use confirmation policy yêu cầu xác nhận ngay trước bước tạo account/app hoặc API/OAuth key, dù nhiệm vụ đã ủy quyền chung. Chưa yêu cầu người dùng tự tạo app cho từng Page.

## Checkpoint bổ sung 2026-10-11 — Docker đã chạy, chờ cấu hình Meta

- Docker Engine `29.1.3`; container DB healthy, API/web/worker đều Up. Frontend `localhost:3000`, API `/api/v1/health/live` và `/api/v1/health/ready` trả HTTP 200; DB readiness connected. Không chạy lại migration hoặc seed.
- Chrome accessibility tree xác nhận Sơn CRM hiển thị phiên Chủ cửa hàng và menu `Đồng bộ đa kênh`. Screenshot capture lỗi hai lần với `window capture timed out: timed out waiting on channel`; thao tác click menu không chuyển trang. Đã dừng UI đúng recovery policy, chưa xác minh trực quan hoặc thao tác Facebook.
- Tên cấu hình còn thiếu trong `.env`: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_API_VERSION`, `FACEBOOK_OAUTH_REDIRECT_URI`, `FACEBOOK_OAUTH_SCOPES`. `FACEBOOK_WEBHOOK_VERIFY_TOKEN` và `INTEGRATION_TOKEN_ENCRYPTION_KEY` đã có (không đọc/in giá trị). Vì vậy nút bắt đầu OAuth chưa thể hoạt động; chưa tạo app/grant hoặc báo live.
- Không sửa code/schema/DB và không stage/commit/push trong checkpoint này.

## Checkpoint bổ sung 2026-10-11 — Chrome/helper và ứng dụng local

- Dùng Computer Use skill đang cài `26.1007.21434`: `sky.list_apps()` nhận diện một cửa sổ Chrome; hai lần chụp trạng thái (lần hai sau khi refresh app/window theo policy) đều báo `window capture timed out: timed out waiting on channel`. Dừng UI theo recovery policy; không thao tác trang, không đăng nhập/cấp quyền. Đây không phải bằng chứng Chrome phía người dùng không hoạt động.
- HTTP read-only tới frontend `localhost:3000` và API readiness `localhost:4000/api/v1/health/ready` đều không kết nối được. Chưa chạy app vì cần xác nhận Docker/DB trước; checkpoint trước ghi Docker daemon chưa hoạt động.
- Không sửa code trong lượt kiểm tra này. Trạng thái live/provider giữ nguyên như ma trận bên dưới; chưa có Meta app hoặc grant nên Facebook không thể báo `LIVE_VERIFIED`.

## Checkpoint bổ sung 2026-10-11

- Xác minh local không dùng DB: API unit 10 files/39 tests, Web unit 3 files/5 tests, API/Web typecheck và workspace lint đều PASS trên Node 25.9.0 (ngoài Node 24 yêu cầu; cần chạy lại môi trường chuẩn trước nghiệm thu). Docker daemon không hoạt động nên không chạy migration/E2E DB trong checkpoint này.
- Computer Use `@oai/sky` nhận diện cửa sổ Chrome bằng `list_apps()`, nhưng chụp giao diện timeout ở lần đầu và lần retry có hướng dẫn. Không đọc được tab, không đăng nhập/điều hướng/cấp quyền; `UI_TESTED` vẫn false. Đây là lỗi capture của helper, không phải bằng chứng Chrome trên máy chủ dự án không chạy.
- Tình trạng code/live matrix dưới đây không đổi. Không có Meta app, credential hoặc grant thật; không đánh dấu Facebook `LIVE_VERIFIED`.

## Làm rõ trải nghiệm một chạm — 2026-10-11

Chủ dự án xác nhận chưa có Meta Developer app và không muốn chủ Fanpage phải tạo app/nhập cấu hình kỹ thuật. Đây là phần thiết lập một lần của CRM/đơn vị triển khai. Người dùng Page chỉ bấm Kết nối Facebook, đăng nhập/cấp quyền, chọn Page được Meta trả và hoàn tất. UI đã chuyển danh sách biến preflight và biểu mẫu khai báo ID thủ công vào mục kỹ thuật thu gọn; khi app chưa cấu hình, nút bị khóa và hiển thị giải thích dễ hiểu. Đây là cải thiện UX local, **không phải** bằng chứng `LIVE_VERIFIED`; vẫn cần Meta app thật và quyền được cấp để thử Page sikeoLC.

Checkpoint 2026-10-10. Đây là S1 của SOCIAL-IDENTITY-01; S2–S4/merge được giữ nguyên. Code ở checkout chuẩn `CRM`, branch `integration/merge-crm` tại `2d5ef75` cộng thay đổi local chưa commit. Không có provider credential/token thật được sử dụng.

## Ma trận theo provider

| Hạng mục | Facebook | Zalo OA | Shopee | TikTok Shop |
| --- | --- | --- | --- | --- |
| Cấu hình app | PARTIAL — tên biến/config validation và HTTPS tunnel thử local; chưa thấy Meta app thật. | PARTIAL — preflight và HTTPS callback đã có; OA đang chờ duyệt, chưa có app grant. | BLOCKED — chưa có Partner Center app/tài liệu đọc được. | PARTIAL — preflight; chưa có app/shop. |
| Authorization start | LOCAL_TESTED — manager start, state hash 15 phút, URL Facebook; browser live chưa thử. | LOCAL_TESTED — manager start, state hash 10 phút, PKCE challenge và verifier mã hóa; browser live chưa thử. | BLOCKED — không dựng URL/signature theo phỏng đoán. | PARTIAL — official Seller flow đã nghiên cứu, chưa code. |
| Callback/token exchange | LOCAL_TESTED — atomic claim, deny/replay/expiry, backend exchange + extension, scope verification; mock Meta. | LOCAL_TESTED — atomic claim, deny/replay/expiry, OA code exchange + PKCE; mock Zalo. | BLOCKED. | MISSING. |
| Account selection / finalize | LOCAL_TESTED — `/me/accounts` Page/token/task; actor/business scope, Page membership, subscription POST/GET, upsert. | LOCAL_TESTED — `/v2.0/oa/getoa` xác minh OA ID/name, UI chọn OA, actor/business scope, upsert cùng connection. App-level webhook vẫn cần cấu hình. | BLOCKED. | MISSING. |
| Token encryption / refresh | PARTIAL — AES-256-GCM persistent key, ciphertext/key version, Meta long-lived exchange; không giả định có refresh token. Expiry chuyển `REAUTH_REQUIRED`, reconnect để cấp lại; live chưa xác minh. | LOCAL_TESTED — AES-256-GCM, worker xoay access/refresh token gần expiry dưới DB lock; refresh token hết hạn chuyển `REAUTH_REQUIRED`. Mock provider, chưa kiểm chứng vòng đời thật. | BLOCKED. | MISSING. |
| Webhook subscription / health | LOCAL_TESTED — mock subscription/readback; signed inbound/worker guard có từ trước; `lastSyncAt` chỉ sau xử lý event. App-level Webhooks và event thật chưa xác minh. | PARTIAL — inbound signed webhook/worker guard; OA khai báo tay bị chặn. | NOT APPLICABLE TO CURRENT ORDER IMPORT. | NOT APPLICABLE TO CURRENT ORDER IMPORT. |
| Reconnect / disconnect / revoke | PARTIAL — reconnect giữ connection/history và grant cũ khi subscription thất bại; disconnect local xóa ciphertext/chặn sync. Upstream unsubscribe/revoke chưa xác minh/triển khai. | PARTIAL — reconnect giữ connection/history; disconnect local xóa ciphertext/chặn sync. Upstream revoke chưa triển khai. | BLOCKED. | MISSING. |
| Tests | LOCAL_TESTED — PostgreSQL scratch, OAuth success/deny/replay/expiry/exchange/scope/Page/crypto/reconnect/disconnect và worker. | LOCAL_TESTED — 3 E2E mới cho PKCE/claim/deny/expiry/metadata mismatch/refresh/reconnect/disconnect; tổng suite 15 file/50 tests. | PARTIAL — blocked-state assertion. | PARTIAL — shared preflight only. |
| Live evidence | BLOCKED — chưa có Meta app/Page test, granted permissions, callback HTTPS hay event evidence. | BLOCKED — chưa có OA test/app grant. | BLOCKED — chưa có Partner Center app/test shop. | BLOCKED — chưa có Partner Center app/region/shop grant. |

## Thay đổi lát cắt này

- `GET /api/v1/integrations/providers/preflight` chỉ trả tên cấu hình còn thiếu; Facebook và Zalo chỉ mở start khi HTTPS redirect và key hợp lệ. Shopee/TikTok chưa bật.
- Schema/migration `IntegrationAuthAttempt`, `FacebookOAuthClient`, `FacebookAuthService` và API start/callback/attempt/finalize/disconnect. Zalo tái sử dụng cùng attempt/crypto/connection qua `ZaloOAuthClient`/`ZaloAuthService`, PKCE và refresh worker; UI kết nối, chọn Page/OA, reconnect và ngắt local; biểu mẫu nhập ID cũ vẫn chỉ là ghi nhận cần cấu hình.
- Postman collection không chứa secret ở `docs/postman/channel-auth-01.postman_collection.json`. Gateway `scripts/facebook-dev-gateway.mjs` chỉ cho callback và webhook.
- Facebook/Zalo webhook chỉ dispatch khi binding có `status=CONNECTED|REAUTH_REQUIRED` và capability `authorization=VERIFIED`; signed webhook không tự nâng connection lên CONNECTED. Record nhập tay không được nhận webhook.
- Tests có fixture thể hiện khai báo thủ công bị từ chối; Meta/Zalo mock PASS chỉ là `LOCAL_TESTED`, không phải bằng chứng tích hợp.

## Chẩn đoán công cụ UI và môi trường

- Windows native PowerShell/VS Code 1.141.0 x64, ChatGPT/Codex extension `openai.chatgpt@26.1007.21434`. WSL Ubuntu 2 được cài nhưng nhiệm vụ/tool chạy trên Windows, không dùng WSL để điều khiển Chrome.
- Computer Use plugin `26.1002.52244`, API `@oai/sky` qua MCP `node_repl`. Cấu hình MCP thực tế có `[mcp_servers.node_repl]`, `node_repl.exe` tồn tại, args được cấu hình và `startup_timeout_sec=120`; không có khóa `enabled` hiện rõ nhưng tool MCP đã khởi tạo JavaScript thành công. Lightweight `sky.list_apps()` báo (không chứa secret): `Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified.`
- Theo `C:\Users\Admin\.codex\plugins\cache\openai-bundled\computer-use\26.1002.52244\docs\guidance.md` mục Recovery, sau retry và reset JavaScript session vẫn lỗi thì dừng input UI và báo helper có thể lỗi. Đã thực hiện đúng chuỗi này trong lượt trước, không khởi tạo/khôi phục thêm. Không có bằng chứng để kết luận nguyên nhân native pipe. Chưa xem Chrome/Meta app hoặc Postman qua UI.
- API `localhost:4000`, web `localhost:3000`, PostgreSQL `son-crm-db-1` cổng `5432`, worker đang chạy. HTTP ready/web 200. `.env` local hiện thiếu tên khóa Meta/OAuth/encryption (kiểm tra tên, không in giá trị).
- `cloudflared` 2026.10.0 từ winget official hash-verified; HTTPS quick tunnel `https://fill-penguin-broadcast-athletic.trycloudflare.com` đang chạy trong phiên này. HTTP client qua tunnel: route ngoài phạm vi 404, callback thiếu state 400, webhook thiếu verify token 401. Tunnel thay host khi khởi động lại; chưa đăng ký vào Meta dashboard.

## Giao thức và phụ thuộc đã kiểm tra

- Zalo OA: tài liệu chính thức mô tả authorization code + PKCE (`code_verifier`), đổi token qua OA token endpoint và lấy OA metadata; SDK Zalo xác nhận URL OA permission và refresh endpoint. Code local theo đó nhưng cần thử app/OA thực: [Zalo Open APIs](https://docs.zaloplatforms.com/docs/OA), [Zalo PHP SDK](https://github.com/zaloplatform/zalo-php-sdk/blob/master/src/Authentication/OAuth2Client.php), [OA metadata](https://docs.zaloplatforms.com/docs/OA/quan-ly/quan-ly-thong-tin-oa/lay-thong-tin-zalo-official-account).
- TikTok Shop: tài liệu Seller/Partner Center phân biệt regional authorization host, seller `service_id`, token exchange và authorized shops; cần app credentials, service configuration và region của người dùng. Nguồn: [Create your App](https://partner.us.tiktokshop.com/docv2/page/create-your-app), [API versioning](https://partner.tiktokshop.com/docv2/page/api-versioning).
- Shopee: official Open Platform authorization pages không truy cập được ở thời điểm kiểm tra; không tự viết URL, signature hoặc token semantics. Cần user cung cấp tài liệu/export không bí mật hoặc quyền truy cập Partner Center.
- Meta: official Facebook Login for Business docs bị giới hạn truy cập ở lần tra cứu; cần xác nhận đúng app type/login configuration, scope tối thiểu cho Messenger/comment, Graph version, Page tasks và subscription endpoint từ Meta Developer docs. Không bật luồng phỏng đoán.

## Acceptance còn lại

Facebook code/API `IMPLEMENTED` và `LOCAL_TESTED`, UI code đã build/typecheck nhưng chưa `UI_TESTED`; `LIVE_VERIFIED=false`, `DEPLOYED=false`. Cần App ID/Secret, Graph version, scopes/config ID đúng app, HTTPS URL/verify token/crypto key trong backend và owner consent. Sau đó test sikeoLC Page selection, Meta subscription, signed Messenger và feed comment event đi qua worker đúng business; replay không trùng. Upstream revoke, long-lived token behavior và app-level webhook settings phải xác minh riêng; dashboard chưa truy cập được do UI helper. Zalo OAuth code/API cũng `IMPLEMENTED` và `LOCAL_TESTED`, UI chưa thử trực quan; OA đang chờ duyệt và chưa có Zalo App credentials. Shopee/TikTok vẫn theo ma trận; không nhận credential giả để báo pass.

## Checkpoint bổ sung 2026-10-10 — Zalo OA và DB UI

- DB local giao diện `son_crm_ui_account` trước đó có 26/28 migration; trước khi sửa đã backup/restore thành công bằng `scripts/backup-and-verify.ps1` vào `%LOCALAPPDATA%\SonCRM\Backups\son_crm_ui_account_pre_channel_auth_20261010_001639.dump` (SHA-256 `63528858060D824DCD7129C531D4FB81854B05E3DABFEA7E5A28429934083A8C`). ACL file chỉ cho Admin/SYSTEM/Administrators; archive **chưa mã hóa**, phải chuyển sang kho backup mã hóa trước khi dùng dữ liệu thật. `son_crm` cũ không bị sửa.
- `scripts/init-channel-local-secrets.mjs` đã tạo ngẫu nhiên `FACEBOOK_WEBHOOK_VERIFY_TOKEN` và `INTEGRATION_TOKEN_ENCRYPTION_KEY` vào root `.env` bị Git ignore, không in giá trị; ACL `.env` giới hạn Admin/SYSTEM/Administrators. Không đổi khóa qua restart; sao lưu an toàn ngoài Git. App ID/secret/Graph version/redirect/scopes vẫn chưa có, nên Facebook preflight chưa mở start. Zalo cũng chưa có app/OA secret và redirect.
- Sau restore drill, áp đúng 2 migration additive `20261008250000_social_identity_01`, `20261009120000_channel_auth_attempts` lên DB UI; Prisma status báo 28/28 up to date. API/worker được recreate. Không có Customer/IntegrationConnection nào trong DB UI trước/sau migration.
- `ZaloOAuthClient` dùng official OA permission + PKCE + token/metadata API; `ZaloAuthService` tái dùng attempt một lần, mã hóa verifier/grant/token, chọn đúng OA, upsert cùng business/OA, reconnect/disconnect local. Worker refresh token dưới advisory lock; app webhook phải cấu hình trong dashboard, không báo `SUBSCRIBED` chỉ vì OAuth.
- Gateway HTTPS local đã giới hạn thêm Zalo callback/webhook. HTTP client nhận 400 từ callback thiếu state qua tunnel, route ngoài allowlist 404; đây không phải OA live evidence. API/web 4000/3000, DB Docker 5432, gateway 4100. Tunnel host có thể đổi bất kỳ lúc nào.
- E2E scratch PostgreSQL 17.6: 28 migrations + seed, toàn bộ 15 files/50 tests pass; API unit 10/39, web unit 2/4, API/web typecheck/lint/build pass. Không `UI_TESTED` do lỗi native pipe đã ghi ở trên; không thử khôi phục UI lặp lại. Không commit/push/deploy.

## Quan hệ với SOCIAL-IDENTITY-01

SOCIAL-IDENTITY-01 S1 được thay bằng checklist này; S2–S4 giữ nguyên. Không thêm checklist OAuth song song vào SOCIAL-IDENTITY-01. Customer linking/merge không thay đổi trong nhiệm vụ này.
