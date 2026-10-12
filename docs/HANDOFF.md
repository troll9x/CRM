# Handoff — 04C-B kiểm kê và điều chỉnh kho

## Cập nhật 2026-10-11 — Facebook connected nhưng chưa có inbound events

- Người dùng báo đã kết nối Facebook nhưng chưa thấy tin nhắn/thông báo. DB đang dùng cho CRM là `son_crm_ui_account`: Facebook connection `CONNECTED`, `authorization=VERIFIED`, `pageSubscription=VERIFIED`, nhưng `webhookSubscription=APP_CONFIGURATION_PENDING`; các capability message/comment mới ở mức Page-subscription, chưa xác nhận app webhook.
- Meta Developer → Webhooks → Page hiện hiển thị verify token đã lưu (chỉ thấy dạng che), endpoint đã đăng ký và field `messages`/`feed` đã bật. GET handshake từ API runtime vẫn đúng token → 200/challenge khớp, sai token → 401. Không có integration job/conversation/message/comment; chưa nhận event thật.
- Đã probe tunnel từ API runtime: verify token cấu hình đúng → HTTP 200 và challenge khớp; token sai → 401. Endpoint hiện tại còn sống. Không gửi token/secret qua chat hoặc log.
- Meta dashboard vẫn cảnh báo app chưa phát hành thì chỉ nhận test webhook từ dashboard, không gửi production events. Cần xử lý phát hành/quyền Meta trước khi thử tin thật từ Page. Tùy chọn “Đính kèm chứng thực máy khách” hiện bật; chưa xác minh riêng tương thích với HTTPS gateway.
- “Thông báo” CRM: schema `AdminAlertType` hiện chỉ có loại đơn/báo giá; webhook message worker chỉ cập nhật hội thoại và unread state, không tạo alert cho từng tin nhắn. Nếu người dùng muốn push/alert nội bộ khi có tin mới, cần chốt người nhận (admin, nhân viên được giao, hay cả hai) và chính sách gộp/tần suất; không nhầm việc đó với webhook notification của Meta.
- Sự cố bảo mật 2026-10-11: kết quả accessibility khi chỉ đọc Meta Basic Settings đã trả App Secret rõ vào tool output; verify token cũng xuất hiện trong nội dung user gửi. Không lưu/in lại hai giá trị. Cần chủ app xoay cả App Secret và `FACEBOOK_WEBHOOK_VERIFY_TOKEN`, cập nhật root `.env`, cập nhật verify token mới trong Meta, recreate API/worker, xác minh handshake lại; có thể cần OAuth reconnect nếu Meta vô hiệu access grant cũ. Chưa tự reset vì cần action-time xác nhận.
- UI local đã được sửa để không nói “đã đăng ký webhook” khi mới xác nhận Page; trạng thái kết nối nay giải thích app webhook đang pending, và hộp thư phân biệt unread với notification riêng. Web tests 7/7 và typecheck pass. Chưa thêm dữ liệu hoặc giả lập tin nhắn. OAuth/Page authorization đã verified, nhưng Messenger inbound và notification chưa `LIVE_VERIFIED`.

## Cập nhật 2026-10-11 — App Secret đã có và được nạp

- Đính chính checkpoint ngay bên dưới: `FACEBOOK_APP_SECRET` có trong root `.env`; API và `integration-worker` lúc kiểm tra ban đầu chưa được recreate sau khi `.env` được lưu. Đã recreate riêng API/worker (không đụng DB), và xác nhận cả hai runtime đều có secret mà không in giá trị.
- API/web readiness HTTP 200. Qua HTTPS tunnel, webhook `GET /api/v1/webhooks/facebook`: verify token đúng trả 200 với body đúng bằng `hub.challenge`; token sai trả 401. Webhook URL là `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/webhooks/facebook`; OAuth callback riêng là `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/integrations/oauth/facebook/callback`.
- Đã mở luồng OAuth từ CRM. Facebook hiện hiển thị xác nhận kết nối tài khoản với Sơn CRM và nút “Đã hiểu”; đây mới là màn hình OAuth phía Facebook, chưa phải bằng chứng callback, consent đầy đủ, chọn Page, lưu connection hoặc subscription. Người dùng cần tiếp tục thao tác consent trên chính màn hình Facebook nếu được yêu cầu; không chia sẻ mã/URL callback chứa authorization code.
- Giữ nguyên kết quả test trước đó: API unit 39/39, web integration 1/1, API E2E 50/50 trên PostgreSQL scratch; runtime/handshake đã kiểm tra lại. OAuth E2E, Page grant/subscription và event thật vẫn chưa `LIVE_VERIFIED`.
- Việc còn lại: hoàn tất consent do chủ tài khoản thao tác; xác nhận CRM callback/list Page `sikeoLC`; lưu connection/token, subscribe Page, rồi thử nhận Messenger event. Meta Webhooks verify/save và Page fields `messages`/`feed` vẫn cần hoàn tất thủ công trên dashboard nếu chưa lưu.

## Handoff 2026-10-11 — Facebook webhook handshake đã qua; OAuth còn chặn

- Giữ đúng checkout `C:\Users\Admin\Downloads\CRM`, remote `https://github.com/troll9x/CRM.git`, branch `integration/merge-crm`, HEAD `2d5ef7514d801d34d56f2b2696fa12ede0a9f356`; worktree dirty rộng từ trước, không stage/commit/push/reset.
- API `localhost:4000`, web `localhost:3000`, DB và `integration-worker` Docker Compose đang chạy. API/worker vừa được recreate. Readiness API và trang web trả HTTP 200. API và worker đều đọc được `FACEBOOK_WEBHOOK_VERIFY_TOKEN` và `INTEGRATION_TOKEN_ENCRYPTION_KEY`; không in giá trị.
- Kiểm tra tồn tại cấu hình cho thấy `FACEBOOK_APP_SECRET` **thiếu trong root `.env` và thiếu trong cả API lẫn worker runtime**, dù chủ dự án cho biết đã lưu. Các cấu hình không nhạy cảm khác gồm App ID, Graph version, redirect URI và OAuth scopes đang có. Chưa thể OAuth token exchange hoặc gọi `/me/accounts` cho tới khi lưu secret đúng vào `C:\Users\Admin\Downloads\CRM\.env` với key chính xác `FACEBOOK_APP_SECRET=` rồi recreate API/worker.
- HTTP client chạy từ API container qua HTTPS hostname hiện tại và xác nhận endpoint code `GET /api/v1/webhooks/facebook`: token cấu hình đúng trả 200, body khớp nguyên văn `hub.challenge`; token sai trả 401. URL Meta webhook chính xác: `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/webhooks/facebook`. OAuth callback là URL khác: `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/integrations/oauth/facebook/callback`. Tunnel Quick Tunnel là tạm thời, nên phải cập nhật Meta nếu hostname đổi.
- Chrome Meta dashboard: app `Sơn CRM`, Messenger use case. Permissions table hiển thị `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement` ở trạng thái “Sẵn sàng thử nghiệm”; điều này chưa chứng minh user grant hay Page subscription. `pages_read_user_content` không xuất hiện trong bảng quyền hiện tại; official docs trả HTTP 429 nên đường cấp quyền/review riêng còn chưa xác minh. Ở Page webhook object, messages/feed vẫn chưa đăng ký. Đã nhập lại URL callback webhook trong form, nhưng Verify & Save đang bị khóa do thiếu verify token trong form.
- Cần người dùng tự lấy giá trị `FACEBOOK_WEBHOOK_VERIFY_TOKEN` từ `.env` và gõ vào trường “Xác minh mã” trong tab Meta hiện đang mở (không gửi giá trị trong chat); sau đó bấm “Xác minh và lưu”. Hạn chế tool hiện tại không cho chuyển giá trị secret từ file sang browser mà không đưa nó qua tool/chat log. Khi người dùng báo đã lưu, kiểm tra UI trạng thái; tiếp tục chọn `Page`, đăng ký fields `messages` và `feed` theo phạm vi, rồi OAuth, consent, chọn `sikeoLC`, lưu connection, Page subscription, nhận test event, reconnect/restart/dedupe. Không giả lập live bằng fixture.
- Kiểm thử lượt này: API unit 10 files/39 tests PASS; Web integration workspace 1 file/1 test PASS; toàn API E2E 15 files/50 tests PASS trên PostgreSQL scratch riêng trong tmpfs (đã xóa scratch; DB vận hành không migrate/seed); readiness/web 200; HTTPS webhook handshake đúng token 200/challenge exact, token sai 401. LIVE Messenger, OAuth/Page grant, Page subscription và event thật vẫn chưa xác minh.

## Handoff 2026-10-11 — CHANNEL-AUTH-01 Facebook live setup

- Repo chuẩn vẫn là `C:\Users\Admin\Downloads\CRM`, remote `https://github.com/troll9x/CRM.git`, branch `integration/merge-crm`, HEAD `2d5ef7514d801d34d56f2b2696fa12ede0a9f356` lúc tiếp tục. Worktree vốn dirty/untracked rộng; giữ nguyên, không stage/commit/push/reset. `CRM-home`, account files và DB `son_crm` cũ không đổi.
- Chrome extension browser tool đã hoạt động trên app Meta `Sơn CRM` (ID `1682297180226928`, Messenger use case). User xác nhận quyền `pages_read_engagement` và tunnel; Meta dashboard sau thao tác hiển thị quyền này “Sẵn sàng thử nghiệm”. `pages_read_user_content` không có trong danh sách Messenger use case đang hiển thị; chưa bật.
- Đã thêm capability Webhooks cho Messenger use case. Callback webhook đang nhập dưới đối tượng `Page` (không phải `Permissions`); chưa nhập verify token, chưa Verify & Save, chưa bật feed/messages.
- Cloudflare Quick Tunnel hiện chạy hidden, hostname `https://screenshots-velvet-steam-address.trycloudflare.com`, chỉ trỏ `127.0.0.1:4100` gateway allowlist. HTTP probe HTTPS: `/not-allowed` 404, callback thiếu state 400, webhook thiếu verify token 401. Hostname sẽ đổi khi tunnel dừng; chưa deploy.
- Đã lưu Meta Valid OAuth Redirect URI `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/integrations/oauth/facebook/callback`; Meta xác nhận “Changes saved”. Webhook callback đã nhập `https://screenshots-velvet-steam-address.trycloudflare.com/api/v1/webhooks/facebook` nhưng chưa xác minh/lưu do trường verify token cần giá trị từ local `.env`.
- `scripts/configure-facebook-public-config.mjs` chỉ cập nhật key không bí mật, nay hỗ trợ `--redirect-uri`. `.env` có App ID, Graph `v26.0`, scopes gồm `pages_read_engagement`, redirect URI. Không đọc/hiển thị App Secret. App Secret vẫn thiếu; container API/worker chưa recreate với cấu hình mới.
- Việc tiếp theo ngắn: người dùng nhập App Secret trực tiếp vào `.env` tại `FACEBOOK_APP_SECRET=`; đồng thời nhập `FACEBOOK_WEBHOOK_VERIFY_TOKEN` trực tiếp từ `.env` vào Meta Webhooks và bấm Verify & Save. Sau đó agent recreate API/worker, kiểm tra preflight HTTP, chạy OAuth từ localhost, owner tự consent, chọn Page sikeoLC, subscribe Page, gửi thử event thật, kiểm tra inbox/dedupe.
- Hiện chưa có Facebook OAuth grant, token/Page selection, webhook subscription hoặc dữ liệu thật. Status: implementation/local HTTP checks chỉ, `LIVE_VERIFIED=false`, chưa xác nhận UI CRM end-to-end. Xem [`tasks/CHANNEL-AUTH-01.md`](tasks/CHANNEL-AUTH-01.md) và [`INTEGRATIONS_SETUP.md`](INTEGRATIONS_SETUP.md).

## Checkpoint 2026-10-11 — Meta app đã tạo, tiếp tục Facebook local

- Sau khi chủ dự án tự nhập lại mật khẩu trong Meta, app dùng chung `Sơn CRM` được tạo thành công: App ID `1682297180226928`. App dùng use case `Messenger from Meta`, không gắn Business portfolio. Không mở/đọc/ghi App Secret vào tài liệu. Graph API version chính thức hiện mới nhất được Meta hiển thị là `v26.0` (Meta changelog, 2026-10-11).
- Dashboard hiện có `pages_show_list`, `pages_messaging`, `pages_manage_metadata` ở trạng thái “Sẵn sàng thử nghiệm”; app-level Page webhook và Page grant vẫn chưa thiết lập. Scope đọc nội dung Page/comment chưa bật. Đang chờ chủ dự án xác nhận action-time việc thêm `pages_read_engagement` + `pages_read_user_content`; chưa gửi/cấp consent cho Page.
- App Basic đang để trống App domains, Privacy Policy URL, Terms URL và user-data deletion URL; không tự điền URL công khai chưa tồn tại. App Secret, HTTPS redirect và webhook callback chưa đăng ký. `.env` local đã được cập nhật App ID/version/scopes (không in giá trị) bằng `scripts/configure-facebook-public-config.mjs`; API container chưa được recreate nên runtime hiện vẫn báo năm OAuth values false. `FACEBOOK_APP_SECRET` và redirect còn phải đặt an toàn.
- Gateway `scripts/facebook-dev-gateway.mjs` đang chạy cục bộ tại `127.0.0.1:4100`, chưa public. HTTP client xác nhận `/not-allowed` → 404, Facebook callback thiếu state → 400, webhook thiếu verify token → 401. `cloudflared` 2026.10.0 đã cài nhưng tunnel chưa chạy; đang chờ chủ dự án action-time xác nhận trước khi public hóa callback/webhook.
- Tài liệu Meta được xem trực tiếp ở `https://developers.facebook.com/docs/graph-api/changelog/`, xác nhận v26.0 mới nhất, phát hành 29/07/2026. Meta use-case dashboard đang mở trên Chrome; quyền đọc Page/bình luận đang chờ chủ dự án xác nhận action-time. Chưa `LIVE_VERIFIED`, `UI_TESTED` trên CRM hay `DEPLOYED`.
- Checkout `C:\Users\Admin\Downloads\CRM`, remote `https://github.com/troll9x/CRM.git`, branch `integration/merge-crm`, HEAD `2d5ef7514d801d34d56f2b2696fa12ede0a9f356`; worktree dirty từ trước, giữ nguyên, không stage/commit/push. Tiếp tục ở [`tasks/CHANNEL-AUTH-01.md`](tasks/CHANNEL-AUTH-01.md); không dùng dữ liệu/identity mẫu để nhận kết nối thật.

## Checkpoint bổ sung 2026-10-11 — SOCIAL-ONECLICK-FINAL-01

- Follow-up sau phản ánh không kết nối được local: Chrome extension browser session đọc trực tiếp tab CRM cho thấy nút `Kết nối Facebook` disabled cùng thông báo hệ thống chưa sẵn sàng. Runtime API container mount đúng workspace `/workspace`; kiểm tra boolean env cho thấy năm giá trị `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_API_VERSION`, `FACEBOOK_OAUTH_REDIRECT_URI`, `FACEBOOK_OAUTH_SCOPES` đều thiếu; hai khóa verify/encryption hiện diện. `/integrations/providers/preflight` không auth trả 401 như thiết kế.
- Meta Developers tab đăng nhập hiện hiển thị “Chưa có ứng dụng nào”. Đã mở wizard app dùng chung tên `Sơn CRM`, chọn use case “Tương tác với khách hàng trên Messenger from Meta”, không gắn business portfolio (Meta báo không có hồ sơ nào) và không thấy yêu cầu bổ sung ở bước wizard. Chủ dự án đã xác nhận dùng email liên hệ đang điền; email không ghi vào repo. Trang tổng quan hiện ở nút cuối “Tạo ứng dụng”, có thông báo chấp nhận điều khoản/chính sách Meta. Chưa nhấn nút cuối; đang chờ action-time confirmation riêng cho thao tác tạo app/chấp nhận terms. Chưa có App ID hay quyền Page.
- Đọc toàn bộ `bo-cau-hinh-va-prompt-ket-noi-1-cham-crm.md`, `AGENTS.md`, handoff, CHANNEL-AUTH-01, SOCIAL-IDENTITY-01 và các tài liệu nghiệp vụ/API/schema. Checkout chuẩn đúng: `C:\Users\Admin\Downloads\CRM`, remote `https://github.com/troll9x/CRM.git`, branch `integration/merge-crm`, HEAD `2d5ef7514d801d34d56f2b2696fa12ede0a9f356`. Worktree đã dirty rộng từ trước; giữ nguyên, không stage/commit/push.
- Docker 29.1.3 đang chạy sẵn; API `4000`, web `3000`, PostgreSQL `5432`, worker đều Up; web, health/live và health/ready HTTP 200. Không restart/migrate/seed DB dùng thật. Tên biến Meta còn thiếu vẫn là `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_API_VERSION`, `FACEBOOK_OAUTH_REDIRECT_URI`, `FACEBOOK_OAUTH_SCOPES`; không đọc/in giá trị `.env`.
- LOCAL_TESTED trong DB scratch tạm cô lập `channel_auth_scratch` (PostgreSQL 17.6, port 55445, tmpfs): deploy đủ 28 migrations, seed, Facebook OAuth + integration E2E **2 files / 4 tests PASS**; API unit **10 files / 39 tests PASS**, Web unit **3 files / 5 tests PASS**, API/Web typecheck và lint PASS. Scratch container đã dừng và tự xóa; DB `son_crm_ui_account` và DB cũ `son_crm` không bị đụng. Node local là `25.9.0` (ngoài Node 24 của repo), nên cần rerun canonical checks trên Node 24 trước khi xem là kiểm chứng môi trường chuẩn.
- Không có tunnel `cloudflared` hoặc listener gateway `4100` đang chạy tại lần kiểm tra; hostname quick-tunnel ở checkpoint cũ không còn được xem là hiện hành. Callback path theo code là `/api/v1/integrations/oauth/facebook/callback`; webhook path là `/api/v1/webhooks/facebook`. Chưa có hostname HTTPS ổn định để đăng ký Meta.
- Computer Use skill đã được đọc lại; recovery record trước cho biết state capture thất bại sau lần thử phục hồi được phép. Không lặp điều khiển Chrome, không vào dashboard và không tạo app/credential. Tài liệu Meta trả 429 trong lần kiểm tra web; Shopee Open Platform trả 403; TikTok Partner Center chỉ trả vỏ React không có giao thức đọc được. Không suy đoán permission/API. Zalo OA docs truy cập được và mô tả OAuth2 + PKCE; OA/app grant vẫn chưa có.
- Rà soát acceptance phát hiện Page-level `subscribed_apps` readback không chứng minh app-level webhook setup/event delivery. Đã sửa Facebook finalize để chỉ ghi `pageSubscription=VERIFIED`, `messages/comments=PAGE_SUBSCRIBED`, `webhookSubscription=APP_CONFIGURATION_PENDING`; UI vốn hiển thị capability webhook, nên không còn gắn nhãn webhook verified quá sớm. API contract và E2E assertion đã cập nhật. Sau sửa: Facebook/integration E2E 2 files/4 tests, API unit 10/39, API typecheck/lint PASS trên scratch/local.
- **Chưa LIVE_VERIFIED / UI_TESTED / DEPLOYED.** Chưa có Meta app, App ID/secret, HTTPS callback host, Page grant hay event thật từ `sikeoLC`. Facebook connection implementation/test local đã có; không cần người bán tạo app riêng. Shopee/TikTok order adapters chưa thể viết an toàn khi giao thức chính thức không đọc được; Zalo OA còn chờ duyệt. Xem [`tasks/CHANNEL-AUTH-01.md`](tasks/CHANNEL-AUTH-01.md) để tiếp tục.

## Checkpoint bổ sung 2026-10-11 — chạy CRM và kiểm tra kết nối một chạm

- Người dùng đã mở Docker Desktop. Khi kiểm tra, Docker Engine `29.1.3`; Compose có `son-crm-db-1` healthy và `son-crm-api-1`, `son-crm-web-1`, `son-crm-integration-worker-1` đều Up. Đây là trạng thái có sẵn; không restart container, migrate, seed hay thay dữ liệu.
- HTTP read-only: `http://localhost:3000`, `/api/v1/health/live`, `/api/v1/health/ready` đều trả 200; readiness xác nhận DB connected.
- Chrome đang có một cửa sổ. Accessibility state đọc được trang Sơn CRM, phiên Chủ cửa hàng `admin.test@crm.local`, menu `Đồng bộ đa kênh`. Chưa xác minh được trang đó bằng ảnh hoặc chuyển menu: screenshot capture timeout hai lần (`window capture timed out: timed out waiting on channel`); một lần click không chuyển trang. Theo recovery policy của Computer Use, dừng thao tác UI, không tiếp tục đoán click/tọa độ.
- Kiểm tra tên biến trong `.env` mà không đọc/in giá trị: thiếu `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_API_VERSION`, `FACEBOOK_OAUTH_REDIRECT_URI`, `FACEBOOK_OAUTH_SCOPES`; `FACEBOOK_WEBHOOK_VERIFY_TOKEN` và `INTEGRATION_TOKEN_ENCRYPTION_KEY` đã có. Do app/callback/scopes thiếu, OAuth Facebook không thể khởi chạy và chưa có grant live. Không nhập secret, không tạo Meta app, không gửi/cấp quyền.
- Không thay source/schema/DB; không stage/commit/push. Worktree giữ nguyên.

## Checkpoint bổ sung 2026-10-11 — kiểm tra Chrome tiếp tục

- Theo yêu cầu tiếp tục phần kết nối có thể thử trên Chrome, đọc đầy đủ skill Computer Use hiện cài (`26.1007.21434`) cùng guidance/API/confirmation policy trước khi thao tác.
- `sky.list_apps()` hoạt động và trả đúng một cửa sổ Chrome. `get_window_state()` báo `window capture timed out: timed out waiting on channel`; làm mới danh sách app/cửa sổ rồi thử lại đúng một lần theo recovery policy vẫn cho cùng lỗi. Đã dừng UI; không điều hướng, đăng nhập, nhập mật khẩu/OTP hoặc cấp quyền. Không kết luận Chrome của người dùng bị hỏng — lỗi là ở kênh capture của helper.
- Kiểm tra HTTP read-only: `http://localhost:3000` và `http://localhost:4000/api/v1/health/ready` đều không kết nối được tại thời điểm kiểm tra. Chưa khởi chạy app vì API cần DB và Docker daemon đã được ghi nhận không khả dụng trong checkpoint ngay dưới đây.
- Kết quả này không thay đổi trạng thái CHANNEL-AUTH-01: Facebook/Zalo OAuth là LOCAL_TESTED; chưa có Meta app/grant nên Facebook vẫn chưa LIVE_VERIFIED. Không có source/schema thay đổi trong lượt chẩn đoán này.

## Checkpoint bổ sung 2026-10-11 — tiếp tục CHANNEL-AUTH-01

- Xác minh đúng checkout `C:\Users\Admin\Downloads\CRM`, remote `https://github.com/troll9x/CRM.git`, branch `integration/merge-crm`, HEAD `2d5ef751`. Worktree đã có nhiều thay đổi tracked/untracked trước lượt này; giữ nguyên, không stage/commit/push/reset.
- Đọc lại trạng thái OAuth Facebook/Zalo và yêu cầu một chạm. Code Facebook start/callback/exchange/Page selection/encryption/subscription/reconnect/disconnect cùng Zalo OA đã có; matrix và evidence vẫn như [`docs/tasks/CHANNEL-AUTH-01.md`](tasks/CHANNEL-AUTH-01.md). Không có Meta app/grant thật nên chưa LIVE_VERIFIED.
- Xác minh độc lập không dùng DB: API unit `10 files / 39 tests` PASS; Web unit `3 files / 5 tests` PASS; API và Web typecheck PASS; workspace lint PASS. Các lệnh chạy với Node `v25.9.0`, ngoài `engines` yêu cầu Node 24, nên đây là bằng chứng kiểm tra bổ sung chứ chưa thay cho lần xác minh canonical Node 24.
- Docker Desktop daemon hiện không trả lời (`dockerDesktopLinuxEngine` pipe không tồn tại); vì vậy không chạy migration hoặc E2E có database và không đổi DB nào. Trước khi chạy E2E cần khởi động Docker rồi dùng database scratch có tên phù hợp guard của suite; tuyệt đối không nhắm vào DB giao diện/DB vận hành.
- Dùng Computer Use `@oai/sky` qua `node_repl`: `list_apps()` trả về cửa sổ Chrome đang mở. Kích hoạt cửa sổ được nhưng hai lần chụp trạng thái đều timeout (`FrameArrived timed out`, sau refresh là `window capture timed out`). Không đăng nhập, không nhập mật khẩu/OTP, không điều hướng hoặc đổi quyền. Chưa `UI_TESTED`.
- Việc tiếp tục bị chặn ở live Facebook bởi Meta app dùng chung, App ID/Secret, Graph version/scopes/login config và HTTPS callback/webhook ổn định. Đây là cấu hình một lần phía CRM/đơn vị triển khai, không phải việc mỗi chủ Page tự tạo app. Khi các giá trị được thiết lập an toàn ở backend và helper đọc được UI, tiếp tục luồng sikeoLC; không dùng Page ID nhập tay làm bằng chứng.

## Checkpoint 2026-10-11 — menu Đồng bộ đa kênh trên DB giao diện

- Người dùng báo menu Đồng bộ đa kênh không hiện trong phiên chủ cửa hàng. Code web chỉ hiển thị menu khi có `integrations.read`; API cấp quyền từ bảng `role_permissions` theo từng request. DB giao diện `son_crm_ui_account` có owner role 38 quyền nhưng chỉ có `connectors.manage`, chưa có bất kỳ `integrations.*` nào. Một nhân viên được gán owner role.
- Đã thêm bằng transaction, chỉ trên DB giao diện local, bốn permission `integrations.read`, `integrations.inbox.manage`, `integrations.customer.link`, `integrations.mapping.manage` và grant cho owner role; ghi một audit log `role.permissions.sync_local`. Không reset/seed lại, không đổi mật khẩu, không đổi role khác, không đụng DB cũ `son_crm`. Sau sửa: owner có `integrations.read=1`, `connectors.manage=1`, bốn quyền `integrations.*`; web và API ready HTTP 200. Người dùng cần tải lại trang để `/me` cập nhật quyền trong React state. Chưa xác nhận trực quan trên browser vì UI helper vẫn ở trạng thái dừng.
- Nguyên nhân vận hành: schema/code quyền đã mở rộng sau lần seed role cũ. `SEED_OWNER_EMAIL` hiện tại không khớp account test trong DB giao diện; **không** chạy lại full seed vì có thể tạo owner khác và ghi đè role system. Khi triển khai ở môi trường khác, cần đồng bộ quyền bằng quy trình có kiểm tra/backup riêng. Menu xuất hiện không đồng nghĩa Facebook OAuth đã sẵn sàng: Meta app dùng chung vẫn thiếu.

## Checkpoint mới nhất 2026-10-11 — sửa định nghĩa “kết nối một chạm”

- Chủ dự án xác nhận **chưa có Meta Developer app** và yêu cầu người dùng không rành CNTT chỉ bấm Kết nối Facebook → đăng nhập/cấp quyền → chọn Fanpage. Cấu hình app/secret/Graph/callback/webhook là trách nhiệm thiết lập một lần của CRM/đơn vị triển khai, không phải bước của từng chủ Page. Ghi chú cũ bên dưới yêu cầu chủ dự án tự vào Meta for Developers tạo app không còn là hướng dẫn trải nghiệm người dùng; chỉ còn là phụ thuộc kỹ thuật phải giải quyết bằng tài khoản/ủy quyền hợp lệ.
- Trong worktree local `integration/merge-crm`/HEAD `2d5ef75`, đã sửa `apps/web/app/integrations-workspace.tsx`: thông điệp đơn giản khi Facebook/Zalo chưa sẵn sàng, ẩn preflight kỹ thuật và form khai báo ID thủ công sau mục thu gọn, giữ luồng OAuth/Page selection có sẵn. Thêm test SSR kiểm nội dung/ranh giới người dùng-kỹ thuật. Web test 3 files/5 tests, typecheck, lint, build, Prettier targeted và `git diff --check` đều pass. Không đổi schema/API/credential/DB, không stage/commit/push. Cập nhật `PRD`, `DECISIONS`, `API_CONTRACT`, `ACCEPTANCE`, `BACKLOG`, `INTEGRATIONS_SETUP`, nhiệm vụ này. Chưa có live grant, chưa test browser trực quan và không báo `LIVE_VERIFIED`.
- Bước kỹ thuật tiếp theo: người triển khai đăng ký/cấu hình một Meta app cho CRM dưới quyền chủ sở hữu phù hợp; xin/cấp quyền cần thiết, HTTPS callback/webhook ổn định và test với Page sikeoLC. Chủ Page chỉ cần thao tác đăng nhập/OTP/consent trong Facebook. Browser helper vẫn theo trạng thái dừng UI từ checkpoint cũ, không tự khởi tạo lại để vòng qua lỗi.

## Handoff 2026-10-08 — nền tích hợp đa kênh local

- Đã đọc prompt nhiệm vụ, AGENTS và handoff hiện tại; trước khi tiếp tục đã ghi nhận worktree local có nhiều thay đổi/untracked từ người dùng. Không reset, không stage, không commit/push và không đụng DB vận hành.
- Thêm migration 20261008230000 và schema cho connection, durable jobs, identities, conversations/messages/internal notes, comments, external orders/lines, SKU mappings, external AdminAlerts.
- API/worker có tenant RBAC, Facebook raw-body signature + challenge adapter, DB claim lease/backoff/dead-letter, duplicate-safe persistence, customer/SKU linking. UI thêm trạng thái kết nối/tin nhắn/bình luận/đơn ngoài/jobs/mapping. Luồng marketplace chỉ staging; không SalesOrder/stock/payment/AR/revenue.
- Xác minh trên PostgreSQL 17.6 scratch biệt lập: toàn bộ 25 migration deploy, seed test, Prisma diff rỗng, E2E integration 1/1 pass (webhook signature/replay, dedupe order/message/alert, không stock/payment/order side effects). Không đụng port 5432.
- Unit API 25, web 4; API/web typecheck và lint pass. Chưa chạy build/browser acceptance/full existing E2E sau thay đổi cuối.
- **Chưa tích hợp thật:** không có Page/OA/Shopee/TikTok credentials hoặc test account. Meta/Zalo adapters local chưa có account evidence; Zalo comment API chưa xác minh; Shopee API tài liệu không truy cập được; TikTok order poller chưa code. Xem [`INTEGRATIONS_SETUP.md`](INTEGRATIONS_SETUP.md) và checklist cấu hình.
- Worktree vẫn chứa thay đổi local từ trước; giữ nguyên toàn bộ và không tuyên bố hoàn tất provider/production.

### Cập nhật tiếp 2026-10-08 — Zalo OA inbound message

- Bổ sung `POST /api/v1/webhooks/zalo`: xác minh header `X-ZEvent-Signature` trên raw JSON bằng công thức SHA-256 theo event docs, chỉ nhận `user_send_*`, enqueue unique theo `msg_id`, worker ghi hội thoại/tin nhắn; HTTP 200 sau khi enqueue. Dùng `ZALO_OA_SECRET_KEY` server-side; không có secret thật trong repo.
- Chỉnh Facebook webhook POST thành HTTP 200 (provider ACK) và không tự chuyển kết nối đang PAUSED về CONNECTED khi có event đến.
- Kiểm thử Zalo parser/signature unit và E2E fixtures; E2E integration pass trên PostgreSQL 17.6 scratch sau khi cleanup chính xác fixture còn lại từ lần test lỗi. Fixtures chứng minh code path local, không phải Zalo OA thật.
- Zalo comment API vẫn chưa tìm thấy tài liệu chính thức đủ xác minh. Shopee order adapter chưa code vì tài liệu Open Platform trả 403 trong lần tra cứu; TikTok endpoint đã có tài liệu official nhưng client chưa code/chưa có app/shop token. Cần xử lý tiếp sau khi xác lập credential/configuration an toàn; không gọi API thật.

Ngày cập nhật: 2026-10-06 (Asia/Ho_Chi_Minh)

## Trạng thái repo lúc bắt đầu

- Branch `main`, HEAD `6639854 feat: add opening stock ledger command`.
- Trước khi sửa, tracked working tree sạch. Prompt `prompt-tiep-tuc-crm.md` là file untracked do người dùng cung cấp; giữ nguyên.
- Môi trường Windows: Node `v26.1.0` (ngoài yêu cầu repo Node 24), npm `12.0.1`; Docker Desktop/WSL đang chạy. Kiểm tra chuẩn Node 24 được chạy trong Compose project riêng `crm-04cb-node24` với image `node:24.18.0-bookworm`.
- Có hai PostgreSQL kiểm thử cô lập: `crm-04cb-verification` ở host port `55432` và `crm-04cb-node24` ở `55433`. Cả hai có volume test riêng; host port `5432` tiếp tục thuộc PostgreSQL cục bộ (PID 6584). Không chạy `down -v` lên các project này nếu cần giữ bằng chứng test.

## Đã triển khai trong working tree

- Thêm `StockAdjustment` snapshot một SKU/chứng từ và enum movement `STOCK_ADJUSTMENT`; migration tăng dần `20261005100000_phase04c_stock_adjustments`.
- API `POST/GET /api/v1/stock-adjustments`, permission `inventory.adjust`/`inventory.read`, idempotency theo business, kiểm tra `expectedVersion`, kiểm soát transaction Serializable/retry, snapshot actor/reason và audit. Giá trị/giá vốn ẩn nếu thiếu `cost.view`.
- Sổ kho cho phép chênh lệch số lượng/giá trị có dấu; DB ràng buộc source movement đúng loại. Không sửa/xóa lịch sử.
- UI Kho có form đếm balance và gửi version đã xem, báo chênh lệch/lỗi qua API, cùng danh sách chứng từ.
- Thêm E2E chuỗi 100→97→102, idempotency, stale version và giá trị ledger; test dùng SKU chuyên biệt để không phụ thuộc trạng thái test cạnh tranh. Cập nhật BUSINESS_RULES, DATA_MODEL, API_CONTRACT, ACCEPTANCE, BACKLOG, LOCAL_DEVELOPMENT.

## Quy tắc định giá đang là giả định tạm

`BR-STOCK-10` đang ghi Tạm dùng chờ xác nhận: tăng khi balance còn hàng dùng bình quân hiện tại; giảm định giá theo bình quân hiện tại; giá trị delta làm tròn về VND nguyên gần nhất; tồn bằng 0 đặt bình quân về 0; tăng từ 0 cần đơn giá vốn nhập trên chứng từ. Chưa dùng cho dữ liệu thật trước khi chủ dự án xác nhận.

`OPEN-03` đã nhận một phần câu trả lời từ người dùng: admin nhập giá sỉ theo sản phẩm; lượng 5–9 dùng bậc 5, 10–14 bậc 10, rồi mỗi 5 đơn vị tiếp theo; giá admin nhập trực tiếp thắng giá tự tính; giảm thêm chỉ admin được thực hiện; báo giá 3 ngày. Còn chờ xác nhận công thức/nguồn giá tự tính cho bậc trống, giá sỉ dùng chung hay tùy nhóm/khách, dạng/phạm vi giảm thêm, ý nghĩa duyệt đơn và ranh giới hết hạn 3 ngày. **Trạng thái tại lần handoff trước:** Đợt 05 chưa triển khai; cập nhật 05A mới nhất ở cuối tài liệu.

## Kiểm tra đã chạy

- PASS: `npx prisma validate`, `npm run lint`, `npm run typecheck`, `npm test` (3 tests unit), `npm run format:check`, `npm run build`, `git diff --check`.
- PASS: `npm run db:migrate:deploy` áp dụng đủ 10 migration lên database PostgreSQL 17.6 cô lập; `npm run db:seed` thành công; `npm run test:e2e` pass 7 file/29 tests.
- PASS trên Node `v24.18.0` trong Docker: `npm ci` (735 packages), Prisma generate/validate, migrate đủ 10 migration, seed, lint, typecheck, 3 unit tests, format, production build và E2E (7 file/29 tests). Build cần `NODE_ENV=production`; chạy với Compose mặc định `NODE_ENV=development` khiến Next prerender `/_global-error` thất bại.
- `npm ci` báo 9 high severity vulnerabilities trong dependency audit; chưa chạy `npm audit` để phân tích từng advisory và không tự nâng/hạ dependency.
- CI remote gần nhất là [run 36970455887](https://github.com/troll9x/CRM/actions/runs/36970455887), success ngày 2026-10-02 trên commit `6639854`. Run này không chứa các thay đổi local hiện tại.
- Chưa xác minh thao tác UI trực quan qua trình duyệt; build/typecheck đã pass. Công cụ trình duyệt không trả về browser khả dụng trong phiên này nên không mở được app để thao tác. Database kiểm thử và Docker container riêng hiện được giữ lại; không reset database/volume và không dừng PostgreSQL cục bộ cổng 5432.
- Không có commit mới; các thay đổi vẫn ở working tree trên `main`, gồm prompt untracked do người dùng cung cấp.

## Bước tiếp theo

1. Mở UI Kho trong trình duyệt với owner/kho để kiểm tra form kiểm kê, lỗi version cũ và danh sách chứng từ.
2. Xác nhận BR-STOCK-10 trước khi dùng dữ liệu vận hành; quyết định này ảnh hưởng trực tiếp giá trị tồn kho.
3. Đợt 05A hiện có UI/API/DB nhập giá admin theo SKU/bậc; migration và 32 E2E pass Node 24 trên PostgreSQL thử cô lập mới.
4. Chốt cách nhập/tính thuế; hoàn tất kiểm tra migration của phần mở rộng 05A, rồi triển khai 05B–C.
5. Xem `report.md` để biết các phần chưa làm và cách chạy. DB thử Đợt 05A ở `crm-05a-pricing-db` cổng 55434, volume `crm_05a_pricing_data`; giữ nguyên cùng DB thử cũ và PostgreSQL cục bộ cổng 5432.

## Cập nhật 2026-10-05 — prototype Đợt 05

- Chủ dự án chốt bậc theo đơn vị bán: 5–9 dùng bậc 5, 10–14 dùng bậc 10, 15–19 dùng bậc 15 và lặp mỗi 5; giá admin nhập ưu tiên giá tự tính. Phần này được thêm vào prototype, không ảnh hưởng API/DB hiện hành.
- Khi để trống, prototype hiển thị “Chưa có công thức giá tự tính”; chưa tự đưa ra số tiền. Giá admin nhập chỉ lưu trong bộ nhớ trang, nhãn toàn trang ghi “DỮ LIỆU MẪU — KHÔNG LƯU”.
- Danh sách phần chưa hoàn thành và điều kiện bắt đầu được ghi tại `report.md`. Còn cần user test prototype, kiểm tra trực quan 04C-B, chốt BR-STOCK-10 và phần còn lại của OPEN-03.
- Kiểm tra prototype mới: `node --check prototype/app.js`, `node --check prototype/pricing-prototype.js`, Prettier check và `git diff --check` đều pass; Python local server trả HTTP 200 cho trang và script. Chưa kiểm tra trực quan bằng trình duyệt.

## Cập nhật 2026-10-05 — Đợt 05A giá admin theo SKU

- Thêm `PriceTier` và `PriceTierCommand` cùng migration `20261005120000_phase05a_admin_price_tiers`; giá là VND nguyên, bậc phải là bội số 5 từ 5, giá được xóa bằng tombstone giữ version.
- API: `GET /price-tiers`, `PUT /price-tiers` và `GET /price-tiers/resolve`. `price.edit` giới hạn cả đọc/sửa ở backend. Lệnh ghi dùng `Idempotency-Key`, request hash, optimistic version và audit trong transaction Serializable.
- UI CRM chính có màn hình Bảng giá, chọn SKU, nhập/xóa giá, thêm bậc và gọi resolver backend. Giá lưu theo SKU/bậc dùng chung trong business hiện tại. Chưa dùng để tạo báo giá/đơn.
- Ghi chú trạng thái 05A trước cập nhật 2026-10-05: bậc thiếu trả `AUTO_PRICE_RULE_REQUIRED`; từ cập nhật này, thiếu giá trả `PRICE_NOT_CONFIGURED` và lượng dưới 5 dùng bậc giá lẻ 1.
- Kiểm tra Node 24: lint, typecheck, unit 15 tổng (API 13 + web 2), format, production build và E2E 8 file/32 test pass. 11 migration (gồm 05A) deploy và seed pass trên PostgreSQL 17.6 cô lập cổng 55434. Đây là DB thử riêng; không dùng cổng 5432.
- Chưa xác minh browser UI trực quan; build/typecheck và E2E chứng minh hợp đồng/API, không thay thế kiểm tra thao tác UI.
- Tại thời điểm handoff cũ còn thiếu OPEN-03; cập nhật quyết định ngày 2026-10-05 ở mục sau.

## Cập nhật 2026-10-05 — quyết định tiếp tục Đợt 05B–C

- Repo đã hợp nhất hai phiên bản tại commit `f4ea342`; CI của commit này pass. Branch `main` trên GitHub đồng bộ.
- Bảng giá dùng chung; mỗi SKU có một đơn vị bán cố định (gói/kg/thùng...) và admin nhập giá theo đơn vị này. Lượng dưới 5 dùng giá lẻ; từ 5 lên dùng bậc mỗi 5. Giá thiếu không tự tính.
- Cho phép lượng lẻ tối đa 6 chữ số thập phân; thành tiền từng dòng làm tròn VND nửa lên.
- Giảm phần trăm hoặc VND theo dòng hoặc toàn báo giá. Báo giá hết hạn sau 72 giờ từ lúc khách nhận; ban đầu xuất PDF/in/chia sẻ thủ công và người dùng ghi nhận lúc khách nhận. Báo giá có phí giao, thuế, cọc dự kiến và ghi chú; chuyển khi còn hạn giữ giá snapshot.
- Khách đặt qua nền tảng cần báo Admin; connector tự động chờ tài khoản thử và quyền API.
- Người có quyền `price.edit` tự đặt mức giảm phần trăm hoặc VND theo dòng/toàn báo giá; không có trần số riêng. Còn chờ cách nhập/tính thuế.

## Cập nhật 2026-10-06 — xác minh phần mở rộng 05A

- Commit `0ec36c4` đã push lên `main`; fresh PostgreSQL 17.6 thử cô lập ở cổng 55434 nhận đủ 12 migration và seed thành công.
- Toàn bộ E2E API: 8 file / 32 test pass, gồm giá lẻ, đơn vị bán thùng 10kg, biên lượng Decimal, khóa đổi đơn vị sau khi có giá và RBAC.
- Typecheck, lint, unit test, build và format pass. Chưa kiểm tra UI bằng browser.
- `prisma migrate diff` chỉ đề xuất rename một index stock adjustment (`...posted_at` sang `...poste_idx`); đó là lệch tên từ migration 04C-B có trước, không thuộc thay đổi 05A và chưa được sửa.
- Hai thư mục migration 04C-B rỗng, không tracked, trong checkout khiến Prisma deploy nhận nhầm directory thiếu `migration.sql`. Đã tạm chuyển ra khỏi đường dẫn migration để kiểm tra rồi khôi phục nguyên trạng; không xóa chúng.

## Cập nhật 2026-10-06 — Đợt 05B báo giá

- Đợt 05B hiện là thay đổi local trên `main`, chưa commit/push; HEAD vẫn là `0ec36c4` trên `origin/main`. 05C (chuyển báo giá thành đơn nháp) chưa triển khai.
- Thêm migration `20261006141527_phase05b_quotes`, model báo giá/dòng/revision/lệnh idempotent, quyền `quotes.read/write/send` và API tạo/đọc/sửa/gửi/đọc revision. Backend tự tính tiền bằng Decimal, làm tròn từng dòng VND half-up, kiểm tra RBAC, optimistic version, idempotency, audit và transaction Serializable.
- UI báo giá hỗ trợ nháp, giảm giá theo dòng/toàn báo giá, phí giao, thuế, cọc, ghi nhận thời điểm khách nhận, revision và in/lưu PDF bằng trình duyệt. Chia sẻ là thủ công; chưa có gửi tự động/connector.
- Chủ dự án đã xác nhận thuế cho phép % hoặc VND, áp dụng toàn báo giá. Tạm triển khai chọn một kiểu thuế mỗi báo giá; phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc; giảm dòng trước giảm toàn báo giá. Đây là giả định cần xác nhận trước sử dụng vận hành.
- Kiểm tra local: 13 migration + seed trên PostgreSQL 17.6 thử cô lập; schema diff với DB mới rỗng; 9 file/33 E2E, 15 unit tests, typecheck, lint, format và production build pass trên Node 24. Chưa kiểm tra trực quan thao tác UI bằng browser.
- Môi trường PostgreSQL thử `crm-05b-review-20261006` đã dừng và xóa sau xác minh; hai thư mục migration 04C-B rỗng đã được khôi phục đúng chỗ. Không tác động PostgreSQL local cổng 5432.
- Việc tiếp theo: browser-check 05B, xác nhận quy ước tính thuế; sau đó giao riêng phạm vi 05C. Chưa commit/push/deploy.

## Cập nhật 2026-10-06 — phản hồi giao diện CRM

- Từ phản hồi người dùng: chữ khó đọc/nhỏ, nghi ngờ lỗi dấu tiếng Việt, cần biểu đồ tháng và sản phẩm bán chạy, chưa thấy chat.
- Đã đặt cỡ chữ nhãn phụ/trợ giúp/bảng 14px, điều khiển 16px tại `apps/web/app/globals.css` sau khi ảnh người dùng cho thấy mức 12/14px trước đó vẫn quá nhỏ. Next dev server ban đầu còn trả CSS cũ; đã restart riêng dịch vụ web và xác minh CSS asset mới trả HTTP 200, có rule 14px/16px. Người dùng cần tải lại cứng trang bằng `Ctrl+F5` nếu trình duyệt còn cache. Chưa nghiệm thu trực quan trên browser, cần rà desktop/mobile và độ tràn bảng.
- Kiểm tra source locale: `<html lang="vi">` đã có; unit test UTF-8/mojibake 2/2 pass. Điều này không chứng minh dữ liệu/render trên browser đều đúng; kiểm tra dấu trên các luồng và dữ liệu người dùng vẫn đang chờ.
- Tổng quan hiện có bar comparison theo nhóm khách, giai đoạn cơ hội, danh mục và mua hàng; chưa có doanh thu từng tháng hoặc hàng bán chạy. Không tạo biểu đồ bằng dữ liệu giả; triển khai sau khi có đơn bán/dữ liệu doanh thu thật ở Đợt 06 và quy tắc giao/trả phù hợp.
- Chat/hộp thư khách chưa có trong menu/API. Giữ ở Đợt 09, phụ thuộc kênh Facebook/Zalo, tài khoản thử và quyền API; chưa tuyên bố tích hợp.
- Đã ghi tiêu chí và việc chờ tại `docs/ACCEPTANCE.md`, `docs/BACKLOG.md`. Việc tiếp theo tại công ty: chạy web local, mở browser desktop/mobile, đăng nhập và rà font/dấu; ghi ảnh/kích thước viewport và lỗi cụ thể. Sau đó cấp/chốt kênh thử nếu muốn ưu tiên chat.

## Cập nhật 2026-10-06 — tăng thêm cỡ chữ theo phản hồi

- Người dùng báo chữ vẫn rất bé sau lần tăng trước. Đã nâng nhãn phụ, mô tả, bảng và chữ điều hướng từ 14px lên 16px; điều khiển nhập liệu/nút từ 16px lên 18px ở CRM và trang đăng nhập (`apps/web/app/globals.css`). Tiêu đề chính không đổi. Sau restart riêng dịch vụ web, stylesheet mới trả HTTP 200 và chứa các rule 16px/18px.
- Cần tải lại cứng bằng `Ctrl+F5`. Chưa có browser automation khả dụng trong môi trường này nên chưa xác nhận kích thước render/khả năng tràn ở desktop và mobile; không coi việc đổi CSS là nghiệm thu trực quan.

## Trạng thái Git sau cập nhật

- Theo yêu cầu của chủ dự án, thay đổi 05B và tăng cỡ chữ đã commit/push lên `main` tại `363a3a7` (`feat(quotes): add quote workflow and improve readability`); `origin/main` đã khớp commit này.
- File `account.md` chứa tài khoản local tiếp tục bị ignore, không được commit. `accout.md` là file untracked và cũng không được đưa lên GitHub.
- Kiểm tra sau thay đổi: typecheck, lint, 15 unit tests, format, `git diff --check` và phản hồi CSS HTTP 200 đều pass. Migration/seed cùng 9 file/33 E2E đã pass trước đó trên PostgreSQL thử cô lập; không chạy lại và không chạm DB local cổng 5432 trong lượt này.

## Cập nhật 2026-10-07 — Đợt 05C chuyển báo giá thành đơn nháp

- Thêm `SalesOrder`/`SalesOrderLine` trạng thái `DRAFT`, liên kết duy nhất với báo giá nguồn và revision đã phát hành. `POST /quotes/{id}/convert` yêu cầu `orders.create`, `expectedVersion` và `Idempotency-Key`; chỉ chuyển báo giá `SENT` còn hạn, giữ nguyên toàn bộ snapshot/giá/thuế/phí/cọc/ghi chú, không gọi lại resolver giá.
- Chuyển báo giá sang `ACCEPTED`, tạo order/dòng, audit và `AdminAlert` cho nhân viên đang hoạt động có `staff.manage` trong cùng transaction Serializable. Alert hiển thị ở Tổng quan, lọc theo business/người nhận và có thể đánh dấu đã đọc. Không có connector/email; không giữ tồn, phát sinh công nợ, thu tiền hay xác nhận đơn.
- Migration `20261007133548_phase05c_quote_conversion` và seed đã chạy trên PostgreSQL 17.6 mới ở cổng thử 55436; 9 file/33 E2E pass, bao gồm stale/expired/already-converted, replay idempotency, role scope, alert, không tạo movement và hai request đồng thời không nhân đôi đơn/alert. Typecheck, lint, 13 unit test + 2 test UTF-8, format và production build pass.
- PostgreSQL thử cô lập `crm-05c-review-20261007` cùng volume tạm đã được dừng/xóa; hai thư mục migration 04C-B rỗng được khôi phục nguyên trạng. PostgreSQL local 5432 không bị dùng để kiểm thử. Dịch vụ web được restart sau production build và trả HTTP 200.
- Còn chờ browser check trực quan cho báo giá/Tổng quan, xác nhận quy tắc thuế và `BR-STOCK-10`; 05C không kích hoạt kho/công nợ. Thay đổi đã commit và push lên `main` tại `46ee362` (`feat(orders): convert accepted quotes to draft orders`); `HEAD` khớp `origin/main`.

## Cập nhật 2026-10-07 — nền tra cứu đơn Đợt 06A

- Bổ sung quyền `orders.read` riêng, gán cho vai trò sales; API `GET /orders` và `GET /orders/{id}` chỉ đọc trong business hiện tại, tìm kiếm mã đơn/khách/báo giá/SKU và trả snapshot tiền dưới dạng chuỗi. Không thêm lệnh sửa trạng thái, giữ kho hoặc thu tiền.
- Khi cập nhật môi trường local hiện có, chạy `npm run db:seed` để tạo permission mới và gán quyền đọc đơn cho role sales; lát cắt này không có migration schema.
- Màn hình Đơn hàng cho phép tìm và xem đơn nháp từ báo giá, nguồn/revision, dòng hàng và tổng tiền. Chưa có tạo/sửa nháp thủ công; chưa có browser visual acceptance.
- 9 file/33 API E2E pass trên PostgreSQL 17.6 cô lập cổng 55437, gồm sales được đọc, vai trò kho bị 403, chi tiết và mã không tồn tại. Test container/volume tạm đã dọn; PostgreSQL local cổng 5432 không dùng. Lint, typecheck, 15 unit tests, format, production build pass.
- Cập nhật chi tiết sau dòng này supersedes trạng thái lịch sử bên trên: 06B reservation/cancel và 06C payment-gated confirmation đã được code; Đợt 07A receipt/allocation/customer credit/AR settlement đã được code. 06D shipment, 07 expenses/refunds/credit application, 08 returns/reporting và 09 Facebook vẫn chưa hoàn tất.
- Code 06A nền đã commit/push lên `main` tại `468d435` (`feat(orders): add draft order read workspace`); `HEAD` khớp `origin/main` tại thời điểm cập nhật.

## Cập nhật 2026-10-07 — 06A tạo đơn nháp nhập tay

- `POST /orders` nhận khách và dòng SKU/số lượng; backend kiểm tra cùng business, khách/SKU đang hoạt động, phân giải `PriceTier`, làm tròn từng dòng VND HALF_UP, và lưu snapshot. Có `OrderCommand`, idempotency key/hash, transaction Serializable, audit; lặp payload trả lại đơn cũ, dùng lại key với payload khác trả 409.
- `SalesOrder.sourceQuoteId` nay nullable; đơn tay dùng `sourceRevision=0`, trong khi chuyển từ báo giá còn hạn vẫn giữ snapshot nguồn. Migration `20261007180000_phase06a_manual_order_drafts` tạo bảng command và loại alert `MANUAL_ORDER_CREATED`.
- UI Đơn hàng có biểu mẫu tạo nháp, chọn khách/SKU và số lượng; thông báo nội bộ tới staff có `staff.manage` trong cùng transaction. Không gửi Facebook/Zalo/email, không giảm giá/phí giao/thuế/cọc, không xác nhận, giữ kho, ghi công nợ hay thanh toán.
- Kiểm tra cuối local: migration + seed trên PostgreSQL 17.6 biệt lập, 9 file/34 API E2E pass; lint, typecheck, 15 unit test, format, production build và `git diff --check` pass. Không chạm PostgreSQL local cổng 5432. UI browser chưa được nghiệm thu trực quan.
- Còn lại: 06A sửa nháp/chốt đủ thành phần tổng tiền; 06B–D chờ OPEN-04/05; 07–08 chờ chính sách tiền/trả hàng; 09 chờ kênh và thông tin tài khoản/quyền thử. Chưa deploy production.
- Chỉ đưa các file triển khai và tài liệu thuộc 06A vào commit; giữ `accout.md` untracked/ngoài commit.

## Cập nhật 2026-10-07 — chốt chính sách 03–09

- Chủ dự án chốt giữ cách tính thuế/giảm giá hiện tại; không bán chịu, thu đủ trước khi xác nhận và khoản phải thu ghi nhận khi xác nhận; giữ tồn khi chấp nhận báo giá đến khi hủy; không giao thiếu; giá vốn bình quân gia quyền; trả hàng nhập lại khả dụng sau QA, hàng lỗi cách ly.
- Cho phép thu nhiều lần/partial; nhân viên chọn phân bổ, gợi ý nợ cũ nhất; thu thừa thành số dư khách hàng. Doanh thu ghi theo lượng đã giao; COD chỉ ghi nhận sau đối soát thực nhận. Kênh đầu tiên chọn Facebook.
- Ghi nhận tại `BUSINESS_RULES.md`, `DECISIONS.md`, `PRD.md`, `DATA_MODEL.md`, `API_CONTRACT.md`, `ACCEPTANCE.md`, `BACKLOG.md`, `INTEGRATION_READINESS.md`. Đây là quyết định nghiệp vụ, không có nghĩa code đã hỗ trợ.
- Việc kế tiếp: triển khai giữ tồn giao dịch/idempotent khi chuyển quote thành đơn, nhả khi hủy; sau đó thu tiền trước khi xác nhận. Chưa có số ngày nhận trả hàng, Fanpage/app/quyền Facebook. Chưa triển khai hoặc kiểm thử API Facebook; browser acceptance và xác nhận BR-STOCK-10 vẫn còn.

## Cập nhật 2026-10-07 — Đợt 06B giữ/nhả hàng

- Chấp nhận quote còn hạn giờ kiểm tra một kho hoạt động, cộng gộp nhu cầu theo SKU/đơn vị cơ sở, kiểm tra tồn khả dụng và giữ toàn bộ trong transaction tạo đơn. Ledger `StockReservationEvent` ghi `RESERVED`; không đủ tồn rollback quote/order/alert/ledger.
- `POST /orders/{id}/cancel` dùng `orders.cancel`, version và idempotency; chỉ hủy đơn nháp, ghi `RELEASED`, giảm projection giữ hàng và audit cùng transaction. Thêm trạng thái `CANCELED`; role owner có quyền, sales mặc định không.
- E2E test đã xác minh hai dòng SKU trùng giữ đúng 7, tồn thiếu không tạo order, lệnh hủy/replay nhả đúng một lần, concurrent convert không nhân đơn/alert. Typecheck, lint và E2E quote pass; browser acceptance chưa chạy.
- Lịch sử 06B: migration deploy tiêu chuẩn từng bị chặn bởi hai thư mục cũ rỗng; trạng thái này được khắc phục sau đó tại 06F bằng no-op SQL comment và kiểm tra deploy đầy đủ trên DB mới. Không xóa/chỉnh SQL schema cũ.
- Việc tiếp: thiết kế/triển khai thu tiền nhiều lần và phân bổ thủ công trước xác nhận; sau đó confirm đủ 100%, AR và giao đủ trong một lần. Đổi trả còn thiếu số ngày; Facebook còn thiếu Page/app/test access. Không deploy hoặc push trong lát cắt này.

## Cập nhật 2026-10-08 — Đợt 06D xuất kho/giao hàng

- Backend thêm `Shipment`/`ShipmentLine`, `SALE_SHIPMENT`, `POST /shipments` và `/shipments/{id}/deliver`. Chỉ đơn xác nhận và giữ đủ mới xuất; luôn xuất đủ trong một lần; transaction trừ tồn thực tế + giữ, ghi WAC movement/audit/idempotency. Doanh thu hàng chỉ ghi khi giao đủ.
- E2E test trên PostgreSQL test sạch đạt 10/10 file, 35/35 test. Unit API 13, Web 2; lint, typecheck, format, build và diff-check pass. Prisma diff schema báo không có khác biệt sau khi áp migration SQL.
- UI shipment nằm trong workspace đơn; vai trò kho không có `orders.read` theo regression security test, vì vậy còn thiếu queue shipment riêng. Browser acceptance chưa chạy.
- COD chưa code: yêu cầu ghi COD sau đối soát mâu thuẫn với “thu đủ trước xác nhận”. 07B/08 còn thao tác credit/refund/expense/returns/report; return window chưa có số ngày; Facebook thiếu tài khoản test/evidence.
- `prisma migrate deploy` chuẩn vẫn bị hai thư mục migration cũ rỗng chặn; migration mới được xác minh trên DB test sạch bằng áp SQL tuần tự. Dev DB cổng 5432 không bị động tới.
- Chi tiết ở `PHASE_06D_HANDOFF.md`. Chưa commit/push; `accout.md` tiếp tục là file người dùng không được đưa vào staging.

## Cập nhật 2026-10-08 — 07B áp dụng số dư khách

- Thêm `CustomerCreditApplication`, event ledger `APPLICATION/REVERSAL`, settlement source và `POST /customer-credit/{customerId}/applications`. Nhân viên có `payments.manage` dùng số dư trả thừa cho đơn nháp cùng khách; đơn/version và balance được bảo vệ trong transaction Serializable.
- Cổng thu đủ và gợi ý thanh toán nay cộng cả phiếu thu tiền mặt lẫn credit application. Khi xác nhận, phải thu được settle từ từng nguồn; khi hủy đơn nháp không có cash receipt, application bị đảo và tiền quay về balance. Không biến credit thành receipt/cash refund.
- UI Đơn hàng hiển thị cash vs credit tách biệt, có thao tác ghi tiền thực nhận và sử dụng số dư khách; hủy đơn credit-only trả số dư về khách.
- E2E trên DB test sạch: migration/seed, Prisma schema diff “No difference detected”, 11 file/36 test pass. Typecheck, lint, unit (API 13/Web 2), format và production build pass sau sửa đổi 07B; browser chưa được nghiệm thu.
- Ghi chú lịch sử: trạng thái gần nhất được cập nhật trong mục 08A bên dưới; các việc công nợ đọc và 08A đã có code sau mốc này.

### Handoff cập nhật 2026-10-08 — Đợt 08A

- 08A triển khai cấu hình `returnWindowDays` nullable, API tiếp nhận phiếu giao còn hạn, hạn chế trả vượt số đã giao, QA phân tách hàng đạt/cách ly, WAC + stock movement, transaction Serializable, idempotency, audit và UI workspace. Thêm GET read-only `/receivables` và màn công nợ.
- Thời hạn chưa được gán mặc định. Cấu hình manager nhập số nguyên 1–3650; hệ thống từ chối tiếp nhận nếu còn null. Diễn giải hiện dùng 24 giờ × số ngày kể từ deliveredAt và inclusive deadline, cần xác nhận trước pilot.
- Không tự động hoàn tiền, giảm AR/doanh thu hoặc đối soát COD; 08A không thay đổi giao dịch tiền.
- Fresh PostgreSQL cô lập port 55441: tất cả SQL migrations chạy, seed, Prisma schema diff `No difference detected`; API E2E 11 files/36 tests pass; API/web lint, typecheck, API unit 13/13, format check và workspace build pass. Browser visual acceptance chưa chạy. `prisma migrate deploy` không dùng vì 2 thư mục migration lịch sử 04C rỗng; đã apply SQL hiện hữu theo thứ tự vào DB cô lập.
- Một lần chạy nhầm lệnh E2E không set `DATABASE_URL` đã dùng URL `.env` và thất bại do schema DB dev thiếu bảng/cột giai đoạn mới; sau đó không tiếp tục truy cập DB đó. Không có xác nhận từ bước này về trạng thái dữ liệu DB đó; các kiểm tra sau dùng DB cô lập.
- Tiếp theo: kiểm tra diff/build, rà UI trực quan; hoàn thiện báo cáo, cash refund/AR impact theo chính sách; quyết định COD mâu thuẫn; Facebook cần Page/app/quyền/tài khoản thử. Không push khi còn thiếu giai đoạn 09.
- Chi tiết: `PHASE_07B_HANDOFF.md`. Chưa commit/push; `accout.md` giữ nguyên ngoài staging.

### Cập nhật 2026-10-08 — Đợt 06E queue giao hàng cho kho và 08B báo cáo

- Đã bổ sung `shipments.read`, `GET /shipments/ready-orders`, `GET /shipments?status=IN_TRANSIT` và màn hình “Xuất kho & giao”; warehouse role không cần `orders.read`, sales thiếu quyền bị 403. Xem `PHASE_06E_HANDOFF.md`.
- Trạng thái 08B báo cáo gross theo hàng giao và giới hạn chưa trừ returns/không gồm phí giao-thuế được bàn giao tại `PHASE_08B_HANDOFF.md`.
- Kiểm tra hiện tại trên DB cô lập: SQL migrations/seed, Prisma diff không khác biệt, API E2E 11 file/36 test, typecheck/lint/unit/format/build/diff-check pass. Browser acceptance vẫn chưa chạy; scratch DB đã tắt/xóa, cổng 5432 không dùng.
- Chưa commit/push; `accout.md` là file người dùng, không staging.

### Cập nhật 2026-10-08 — Đợt 06F khôi phục migration deploy chuẩn

- Hai thư mục migration legacy không được Git theo dõi và không có file SQL đã được lấp bằng comment-only `migration.sql`; chúng không thực hiện DDL/DML, chỉ cho Prisma đi qua thứ tự lịch sử một cách nhất quán.
- PostgreSQL 17.6 mới cô lập cổng 55444: `npm run db:migrate:deploy` áp dụng đủ 24 migrations; seed pass; lần deploy thứ hai báo không có migration chờ; ledger ghi 24 applied; Prisma schema diff `No difference detected`.
- Toàn bộ API E2E 11 file / 36 test pass trên đúng DB sau deploy chuẩn. DB scratch đã được xóa, dev cổng 5432 không dùng.
- Với database đã tồn tại, vẫn cần kiểm tra migration ledger/checksum và có backup-restore đã xác minh trước khi triển khai; chưa thử deploy lên bất kỳ database vận hành nào.
- Chi tiết: `PHASE_06F_HANDOFF.md`. Chưa commit/push; `accout.md` giữ nguyên ngoài staging.

### Xác minh tiếp 2026-10-08 — DB sạch + backup fixture

- Full E2E chạy lại trên PostgreSQL scratch mới sau `prisma migrate deploy` chuẩn và seed: 24 migrations, `No difference detected`, 11 file / 36 test pass.
- Backup/restore tùy chọn chạy bên trong fixture E2E đã khôi phục hàng/stock/payment/AR/shipment/return có dữ liệu và so khớp row counts; 1/1 shipment test pass. Đây chưa kiểm chứng file upload/remote storage hoặc retention.
- Unit 13 API + 2 Web, typecheck, lint, format, diff-check pass. DB scratch đã tắt/xóa; không dùng cổng 5432.

### Cập nhật 2026-10-08 — Bộ lọc và CSV báo cáo 08B

- Màn tổng quan cho người có `sales-reports.read` chọn khoảng ngày, tải lại báo cáo từ API và xuất CSV dữ liệu đang hiển thị. CSV giữ nguyên cơ sở gross hàng đã giao, không gồm phí giao/thuế và không trừ hàng trả; giá trị text được quote và chặn công thức bảng tính.
- Hàm xuất CSV có unit test cho tháng thiếu, UTF-8/escaping và formula injection. Web typecheck, lint, production build, unit (4 tests), Prettier và `git diff --check` pass; chưa có browser visual acceptance.
- COD, đối soát hoàn tiền/AR, import nguồn đơn và tích hợp Facebook vẫn chờ quy tắc hoặc quyền/tài khoản thử. Không staging file `accout.md`; chưa commit/push.

### Xác minh lại 2026-10-08 — E2E toàn API trên DB sạch

- Tạo PostgreSQL 17.6 scratch biệt lập ở cổng host ngẫu nhiên; `prisma migrate deploy` áp dụng 24 migrations và seed hoàn tất. Không dùng database CRM đang chạy ở cổng 5432.
- API E2E pass 11 file / 36 test. Bật verifier backup tùy chọn trong fixture order/stock/payment/AR/shipment/return; suite pass. Container scratch tự xóa sau khi chạy; các container CRM và ERPNext đang có vẫn chạy nguyên trạng.
- Đây là kiểm tra local, không thay thế thao tác browser hoặc connector thật; chưa commit/push.

### Rà soát 2026-10-08 — quyết định thuế và sẵn sàng Facebook

- Đồng bộ BACKLOG/ACCEPTANCE theo quyết định 03-A: giữ thứ tự giảm và cơ sở tính thuế hiện tại; browser acceptance vẫn chờ.
- Làm mới `INTEGRATION_READINESS.md`: Facebook là kênh đầu tiên, nhưng chưa có connector/API evidence; rà tên biến môi trường process mà không đọc secret cho thấy không có tên provider-specific hiện diện. Retention tin/ảnh và phạm vi nhân viên được xem vẫn cần quyết định.
- Chưa tạo adapter hoặc ghi nhận nội dung hội thoại; thiếu Page/app/test và chính sách dữ liệu để làm luồng inbox thật an toàn.

### Cập nhật 2026-10-08 — kiểm chứng backup local một phần

- Thêm `scripts/backup-and-verify.ps1`: archive từ container nguồn được chỉ định, không ghi đè file đích, restore vào container PostgreSQL scratch mới, xác minh row count các bảng lõi và dọn scratch.
- Ban đầu script được thử với DB chỉ có seed. Sau đó E2E tùy chọn chạy verifier khi fixture đã có order, stock movement, receipt/settlement, receivable, shipment và return/QA; restore và các count khớp. File upload, mã hóa/retention/remote storage hoặc backup production chưa được xác minh. Xem `LOCAL_DEVELOPMENT.md` và backlog.

### Cập nhật 2026-10-08 — khởi chạy UI local và cô lập database schema cũ

- Lỗi đăng nhập ban đầu là Prisma `P2022`: DB `son_crm` thiếu `businesses.return_window_days`; ledger có 11/24 migration.
- Thẩm định checksum hai migration lịch sử từ Git, rồi phát hiện migration 05A mới sẽ tạo lại `stock_adjustments` đã tồn tại với schema khác. Không migrate, xóa hay sửa dữ liệu trong `son_crm`.
- Tạo backup custom-format trong thư mục EFS/AES-256, phục hồi vào PostgreSQL scratch và xác minh danh sách 29 bảng cùng row count. Backup giữ tại thư mục local của user, không nằm trong repo.
- Dựng DB local riêng `son_crm_ui_account`; deploy đủ 24 migration và seed `admin.test@crm.local` bằng mật khẩu trong `account.md` (không ghi password vào log/tài liệu). `compose.override.yaml` local bị `.gitignore` trỏ API tới DB này; DB `son_crm` cũ vẫn nguyên vẹn.
- Xác minh login `201`, cookie HttpOnly được đặt, `/api/v1/me` và `/api/v1/overview` trả `200`; web `localhost:3000` và API ready trả `200`. Browser visual acceptance chưa được thực hiện.
- Mở http://localhost:3000 và đăng nhập bằng `admin.test@crm.local` cùng mật khẩu trong `account.md`. Database giao diện mới chỉ có owner, chưa có dữ liệu khách/sản phẩm/đơn; database cũ vẫn cần bridge migration đã kiểm thử trước khi tái sử dụng.

### Xác minh cuối lượt — 2026-10-08 — đa kênh

- Áp dụng migration `20261008230000_integrations_foundation` chỉ lên `son_crm_ui_account`; worker `prisma migrate status` xác nhận đúng database và schema up-to-date. DB `son_crm` cũ không bị migrate.
- Sửa Compose override local để API/worker cùng trỏ `son_crm_ui_account`; worker service chạy ổn định với `INTEGRATIONS_WORKER_ENABLED=true`. Worker dùng build+Node compiled entrypoint vì `tsx` thiếu Nest decorator metadata và Nest watch không boot app-context entrypoint trong cấu hình repo này; bỏ `unref()` để process không thoát lúc queue rỗng.
- Build workspace Node 24 pass; API/web typecheck + lint pass; API unit 29/29, web unit 4/4; full API E2E 12 files / 38 tests pass trên PostgreSQL 17.6 scratch; integration E2E chạy lại pass. `git diff --check` và Prettier cho code integration pass. `/api/v1/health/ready` và web localhost trả HTTP 200.
- Chưa có browser visual acceptance, provider account test/evidence hoặc API calls thật. Shopee/TikTok order sync chưa code; Zalo comment API vẫn chưa xác minh. `prompt-dong-bo-da-kenh-crm.md` không có ở path repo hiện tại; phạm vi triển khai được đối chiếu từ yêu cầu người dùng trong thread.
- Giữ nguyên worktree dirty, không stage/commit/push/deploy. `compose.override.yaml` vốn bị ignore được cập nhật có giới hạn để worker không trỏ nhầm DB cũ; `.env` không được đọc/ghi secret.

### Handoff 2026-10-08 — audit AMIS và hồ sơ khách hàng 360°

- Đã đọc prompt `C:\Users\Admin\Downloads\CRM-home\prompt-crm-tham-chieu-amis.md` (prompt hiện ở checkout CRM-home cùng máy, không nằm trong repo CRM này), AGENTS, PRD, BUSINESS_RULES, DATA_MODEL, API_CONTRACT, DECISIONS và kiểm tra code/schema/Git trước sửa. Ma trận portable được lưu ở [`AMIS_FEATURE_MATRIX.md`](AMIS_FEATURE_MATRIX.md); roadmap và connector checkpoint cũ được giữ lại.
- Checkout bắt đầu từ `main` / `19ccb7e`, worktree đã dirty do các lát cắt local. Toàn bộ thay đổi người dùng được giữ; không stage, commit, push hoặc deploy.
- Đợt A thêm migration additive `20261008240000_customer_profile_360` với `CustomerNote`; `POST /customers/{id}/notes` ghi nội dung/author/time và audit trong transaction. `GET /customers/{id}/timeline` hợp nhất note/task/opportunity/quote/order và phiếu thu theo permission, business scope, source ID, cursor ổn định và timestamp. Detail/list cũng ẩn task/opportunity counts/records nếu thiếu permission.
- Đơn `DRAFT` chỉ ghi “Đơn nháp”; không có cờ “đã mua” hoặc phép tính doanh thu trong hồ sơ. Quote/order amounts là tổng snapshot chứng từ theo quyền; phiếu thu chỉ lộ với `receivables.view` và ghi nhãn tiền đã thu. Không đưa conversation/comment/ticket/external staging order vào timeline: chưa có provider account/data evidence; retention/visibility chưa chốt và ticket chưa có module nguồn.
- Migration deploy trên DB sạch PostgreSQL 17.6 scratch (26 migrations) và áp riêng trên DB UI local `son_crm_ui_account`; `prisma migrate status` báo up-to-date. DB `son_crm` cũ không bị truy cập/migrate. Scratch container và anonymous volume fixture đã dừng/xóa.
- Kiểm tra: API E2E **12/12 files, 39/39 tests** (tenant scope, module permissions, cursor/timestamp ties, note save, DRAFT, receipt); API unit 29/29 + web unit 4/4; lint/typecheck pass; production build Node 24 pass; Prettier các file thuộc lát cắt và `git diff --check` pass; localhost API ready/UI HTTP 200. Root `format:check` còn báo `apps/web/app/globals.css` (file đã dirty trước lát cắt và ngoài phạm vi; không tự format/ghi đè).
- Browser visual acceptance chưa làm được trong môi trường này; HTTP 200/build không thay thế thao tác UI. Local UI DB theo handoff trước chỉ có owner, nên hồ sơ mới trống tới khi nhập khách/hoạt động thật. Dùng http://localhost:3000 và tài khoản local trong file hướng dẫn account; không ghi mật khẩu vào handoff.
- Connector còn ở mốc local/import-only: Facebook/Zalo adapters chưa có provider account/evidence; Shopee/TikTok order poller chưa code; Zalo comment API chưa xác minh; retention/security và browser acceptance còn pending. Không báo tích hợp thật.
- Để tiếp tục ở máy khác, cần mang/sync worktree chưa commit theo quy trình an toàn; `HANDOFF.md` và `AMIS_FEATURE_MATRIX.md` mang theo bối cảnh/nghiệm thu, nhưng code local hiện chưa được push. Ticket kế tiếp: mở CRM 360 trên browser ở desktop/mobile với dữ liệu hợp lệ đã có hoặc tạo fixture test được gắn nhãn; sau đó bắt đầu import/export khách có preview/staging, không đụng schema giá/kho/tiền đang có quyết định mở.

### Handoff 2026-10-09 — SOCIAL-IDENTITY-01

- Đã đọc prompt `C:\Users\Admin\Downloads\CRM-home\prompt-bo-sung-social-khach-trung.md`, AGENTS, HANDOFF, các tài liệu nghiệp vụ/API/schema, prompt cũ liên quan và kiểm tra trạng thái Git. Worktree đã dirty nhiều trước nhiệm vụ; các thay đổi local được giữ nguyên, không stage/commit/push/deploy.
- Ma trận và trạng thái chi tiết nằm trong [`tasks/SOCIAL-IDENTITY-01.md`](tasks/SOCIAL-IDENTITY-01.md). Tóm tắt: S1 PARTIAL (OAuth live BLOCKED); S2 DONE cho local/import flow; S3 PARTIAL (Customer-pair làm được, identity-to-Customer bị chặn vì không có contact đã xác minh trong model/provider payload); S4 DONE cho các quan hệ hiện có, nhưng browser acceptance còn chờ.
- Migration additive `20261008250000_social_identity_01` thêm MERGED redirect, version/actor cho identity, persistent duplicate suggestions và merge command idempotency. API/UI dùng module customers/integrations hiện có; merge không tạo order, alert, kho hoặc tiền. Chi tiết API, model, acceptance và ADR được cập nhật cùng checkpoint.
- Bằng chứng: PostgreSQL scratch cô lập, API E2E 13 files/44 tests PASS; API unit 8 files/32 tests PASS; Web unit 2 files/4 tests PASS; API/Web typecheck và lint PASS; Prettier scoped files PASS. Prisma `migrate status` up-to-date và schema diff trên scratch báo `No difference detected`. Chưa chạy browser visual acceptance hay provider API thật.
- Lưu ý kiểm tra DB: một lần gọi `prisma migrate diff` thiếu URL scratch tường minh đã đọc cấu hình datasource local từ `.env`; đây chỉ là schema diff chỉ-đọc, không migrate hay ghi dữ liệu. Các migration/test/schema diff được dùng làm bằng chứng ở trên đều chạy lại và xác nhận trên PostgreSQL scratch cô lập.
- Phụ thuộc provider: cần Meta/Facebook app ID + secret được lưu qua secret manager/env theo quy định, HTTPS callback được Meta chấp thuận, quyền/Page test account và review; tương tự cần Zalo OA app credentials/callback, OA test account và scope được cấp. Không gửi credential vào chat. Identity matching tự động cần phone/email do provider trả hợp lệ hoặc nhân viên xác minh/lưu qua flow phù hợp.
- Trạng thái code vẫn nằm trong worktree local chung, chưa push sang máy khác. Tiếp tục bằng: (1) kiểm tra UI Customer 360/Integrations trên browser; (2) owner cấu hình provider an toàn và cấp tài khoản thử; (3) sau evidence thật mới làm OAuth/page-OA selection/reconnect và identity-to-customer matching bằng contact được xác nhận. Không chạy lại prompt cũ.

### Handoff 2026-10-09 — MERGE-CRM-01

- Hai checkout đã xác định: repo chuẩn `C:\Users\Admin\Downloads\CRM`, remote `https://github.com/troll9x/CRM.git`, nhánh cũ `main` tại `19ccb7ee585f83b48424c63802ea1684ba28c031`; checkout nguồn đối chiếu `C:\Users\Admin\Downloads\CRM-home`, cùng remote, nhánh `main` tại `71c73693d305b11bb41bbadd9c6c0e0543709538`.
- Lịch sử không cần merge lại: `71c7369` là tổ tiên của `19ccb7e`; commit `f4ea342` có hai parent `ec5b636` và `71c7369`, tiêu đề `merge: unify home and main CRM work`. Remote GitHub `refs/heads/main` được xác minh chỉ-đọc bằng `git ls-remote` là `19ccb7e`; repo chuẩn đồng bộ 0 ahead/behind ở thời điểm kiểm tra. `CRM-home` chưa fetch nên remote-tracking ref của nó cũ; không coi số ahead/behind stale là trạng thái remote hiện tại.
- Trước thao tác Git đã sao lưu source/tài liệu tại `C:\Users\Admin\Downloads\MERGE-CRM-01-checkpoint-20261009\CRM` và `...\CRM-home`. Checkpoint loại trừ `.git`, `node_modules`, build/cache, `.env`, `account.md`, `accout.md`, `compose.override.yaml` và dump/backup; các file cấu hình bí mật ở nguồn không bị sửa/di chuyển. Hai checkpoint lần lượt có 316 file / 11,493,306 bytes và 153 file / 1,281,577 bytes.
- Nhánh tích hợp local `integration/merge-crm` được tạo từ `19ccb7e`; commit local `2d5ef75` chỉ gồm `AGENTS.md` và `docs/MERGE_REPORT.md`, không push. Những thay đổi local khác vẫn unstaged/untracked; không stage/commit nhầm. `CRM-home` vẫn giữ nguyên và chứa bốn prompt untracked.
- Ma trận và phạm vi merge chi tiết ở [`MERGE_REPORT.md`](MERGE_REPORT.md). Chọn `CRM` làm nguồn chuẩn vì là hậu duệ đã tích hợp của `CRM-home`, tiếp tục có các lát cắt báo giá/đơn; `CRM-home` chỉ giữ lại vai trò đối chiếu/prompt. Không tìm thấy module nghiệp vụ riêng trong checkout cũ cần chép bổ sung ngoài những gì merge commit lịch sử đã tích hợp.
- Migrations có commit chung và migration 05A–06A trong lịch sử remote; migrations 04C-B/06B–08 và integrations/profile/social hiện là untracked local additions trong checkout chuẩn. Fresh deploy 27 migrations, seed, repeated deploy, schema diff và upgrade từ migration prefix của `CRM-home@71c7369` đã pass trên PostgreSQL scratch. Không migrate DB local.
- Trong lượt ngay trước khi MERGE-CRM-01 được ưu tiên, có thêm một phần CHANNEL-AUTH-01 chưa hoàn tất (preflight, chặn webhook của binding thủ công, tests/docs). Các thay đổi này có trong checkpoint nhưng không phải OAuth hoàn chỉnh. Typecheck/lint/unit/E2E/build đã pass trong lượt merge, nhưng môi trường chạy Node 25 thay vì 24.18.0; cần rerun trên Node 24. `format:check` chỉ còn báo `apps/web/app/globals.css` vốn dirty trước nhiệm vụ. Không push/deploy hoặc chạm `.env`/DB `son_crm` cũ.

### Handoff 2026-10-10 — CHANNEL-AUTH-01 Facebook local OAuth

- Repo chuẩn `C:\Users\Admin\Downloads\CRM`, remote `https://github.com/troll9x/CRM.git`, branch `integration/merge-crm`, HEAD `2d5ef75` khi bắt đầu. Worktree vốn dirty rất rộng (gồm SOCIAL-IDENTITY-01 và merge), không reset/stage/commit/push; mọi thay đổi mới cũng chưa commit. `CRM-home`, `account.md`/`accout.md`, `.env` và DB `son_crm` cũ không bị sửa.
- Đã thêm `IntegrationAuthAttempt` + migration additive `20261009120000_channel_auth_attempts`, AES-256-GCM context-bound, Facebook OAuth start/callback/token exchange/Page list/finalize/subscription/readback/reconnect/local disconnect, UI trong integrations workspace, preflight, Postman collection và gateway HTTPS path-limited. API/web 4000/3000; Docker PostgreSQL 5432, worker đang chạy. Chi tiết endpoint/đầu vào ở `API_CONTRACT.md` và `INTEGRATIONS_SETUP.md`.
- PostgreSQL scratch container `son-crm-channel-auth-scratch` dùng DB `channel_auth_scratch` cổng 55445, tmpfs; 28 migrations + seed pass. API full E2E 14 files/47 tests pass; API unit 10 files/39 tests pass; API/Web lint và typecheck pass; API build Node 24 pass. Web build Node 24 pass khi đặt `NODE_ENV=production` (compose dev đặt `development` khiến prerender build thất bại). Mock provider nên chỉ `LOCAL_TESTED`. Scratch container đã dừng và tự xóa; DB UI `son_crm_ui_account` chưa áp migration mới; chưa gọi Facebook thật hoặc visual browser.
- Windows Computer Use `@oai/sky` qua MCP node_repl báo `native pipe unavailable` sau chuỗi recovery chuẩn, nên dừng UI. Diagnostic cụ thể trong `tasks/CHANNEL-AUTH-01.md`; không kết luận nguyên nhân. Không truy cập Meta dashboard/Page hoặc Postman qua UI.
- Gateway local `127.0.0.1:4100` và cloudflared 2026.10.0 quick tunnel đang chạy trong session tại thời điểm handoff: `https://fill-penguin-broadcast-athletic.trycloudflare.com`. HTTP client xác nhận qua HTTPS: restricted 404, callback thiếu state 400, webhook thiếu verify token 401. URL đổi khi tunnel dừng; đây không phải deploy. Login redirect `/api/v1/integrations/oauth/facebook/callback`, webhook `/api/v1/webhooks/facebook` trên host đó. Không có app ID/secret/Graph version/scopes/login config ID, verify token hoặc encryption key trong backend local; không được gọi `LIVE_VERIFIED`.
- Tiếp tục: user kiểm tra/tạo Meta app và cung cấp App ID/Graph version/config ID không bí mật; tự điền secret/key vào root `.env`, cấu hình Redirect URI/Webhooks đúng URL còn sống. Trước khi áp migration lên DB UI, kiểm tra ledger/checksum và backup/restore theo quy trình; sau đó `docker compose up -d --force-recreate api integration-worker`. Chạy nút Kết nối, chọn Page sikeoLC từ grant, test Messenger + feed comment, signature/dedupe/worker; ghi evidence đã che. Nếu helper UI chưa sửa, user thao tác dashboard/browser, agent tiếp tục HTTP/API tests.

### Handoff 2026-10-10 — CHANNEL-AUTH-01 Zalo OA local + DB UI ready

- Tiếp tục cùng branch `integration/merge-crm`/HEAD `2d5ef75`, remote `troll9x/CRM`; giữ toàn bộ dirty/untracked cũ, không stage/commit/push/deploy. `CRM-home`, `.env`, tài khoản và DB `son_crm` cũ không bị sửa. Nhiệm vụ CHANNEL-AUTH-01 còn mở: Facebook/Zalo chưa có `LIVE_VERIFIED` hoặc `UI_TESTED`.
- Dựa trên [Zalo OA Open APIs](https://docs.zaloplatforms.com/docs/OA), [official Zalo PHP SDK OA authorization/refresh](https://github.com/zaloplatform/zalo-php-sdk/blob/master/src/Authentication/OAuth2Client.php) và OA metadata API, đã thêm Zalo OA state + PKCE, callback claim một lần, code exchange, xác minh OA ID/name, actor/business-scoped finalize, AES-GCM token, reconnect không nhân connection, disconnect local, worker xoay refresh token dưới DB lock. UI chung hiển thị chọn OA, trạng thái và nút connect/reconnect/disconnect. Zalo webhook từ chối OA gắn đa business. Gateway HTTPS giới hạn thêm callback/webhook Zalo. Postman collection/API/data model/setup/task docs cập nhật; không có sample credential được dùng như tích hợp thật.
- DB giao diện local `son_crm_ui_account` trước đó thiếu 2 migration; đã sao lưu và thử phục hồi vào container scratch bằng `scripts/backup-and-verify.ps1`, SHA-256 `63528858060D824DCD7129C531D4FB81854B05E3DABFEA7E5A28429934083A8C`, archive `%LOCALAPPDATA%\SonCRM\Backups\son_crm_ui_account_pre_channel_auth_20261010_001639.dump`. ACL file chỉ Admin/SYSTEM/Administrators nhưng archive **chưa mã hóa**, cần chuyển kho mã hóa. Sau đó deploy đúng 2 migration additive social identity + auth attempt; Prisma status 28/28 up-to-date; 0 Customer và 0 IntegrationConnection trong DB UI trước/sau. API/worker được recreate, ready HTTP 200. `son_crm` cũ không đổi.
- Tạo an toàn hai giá trị local còn thiếu `FACEBOOK_WEBHOOK_VERIFY_TOKEN` và `INTEGRATION_TOKEN_ENCRYPTION_KEY` vào root `.env` bằng script mới `scripts/init-channel-local-secrets.mjs`; không in secret, không ghi Git, giữ nguyên giá trị sẵn có; ACL `.env` chỉ Admin/SYSTEM/Administrators. Khóa mã hóa phải được backup an toàn và giữ nguyên khi restart. Meta App ID/Secret/Graph version/scopes/HTTPS callback và Zalo App/OA grant vẫn chưa có.
- Scratch PostgreSQL `channel_auth_scratch` port 55445 (tmpfs) chạy 28 migrations + seed; full E2E 15 files/50 tests pass, API unit 10/39, web unit 2/4, API/Web lint/typecheck/build pass Node 24. Zalo E2E mới 3 tests kiểm PKCE, state deny/replay/expiry, exchange/OA mismatch, mã hóa, refresh, reconnect/disconnect. Scratch container đã dừng và auto-remove sau kiểm thử. HTTPS quick tunnel tại thời điểm này `https://fill-penguin-broadcast-athletic.trycloudflare.com`; Zalo callback thiếu state 400, route khác ngoài allowlist 404. Host có thể đổi khi tunnel restart; đây không phải deploy/Meta/Zalo evidence.
- Browser helper `@oai/sky` vẫn theo trạng thái dừng UI vì `native pipe unavailable` theo hướng dẫn Recovery; không thử khôi phục lại, không truy cập Meta/Zalo dashboard hoặc Postman qua UI. User cần tự mở `https://developers.facebook.com/apps` để xác định App ID/Graph version/config ID cho Page sikeoLC và tự điền secret/khóa vào `.env`; Zalo OA đang chờ duyệt, cần app ID/secret và quyền OA thật. Cấu hình/callback từng kênh ở `INTEGRATIONS_SETUP.md`. Tiếp tục live Facebook Page grant + Messenger/feed comment test trước, sau đó Zalo OA; Shopee/TikTok chưa có Partner/Seller account nên không suy đoán protocol. Không tuyên bố provider nào đã kết nối thật.
