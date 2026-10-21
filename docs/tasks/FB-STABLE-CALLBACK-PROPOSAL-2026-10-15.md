# Đề xuất callback HTTPS cố định — chưa áp dụng trên Meta

Ngày 2026-10-15. Chủ dự án xác nhận hiện **chưa có tên miền hoặc máy chủ công khai** và chọn giữ nguyên cấu hình Meta. Vì vậy chưa có URL ổn định có thể đăng ký; không dùng Quick Tunnel như một địa chỉ cố định.

Cập nhật 2026-10-16: chủ dự án hỏi về cấu hình trên VPS. **Có thể dùng VPS** làm điểm nhận HTTPS ổn định; câu hỏi này chưa xác nhận VPS/hostname đã có hoặc cho phép triển khai. Giữ nguyên dashboard Meta cho đến khi biết hostname thật, kiểm endpoint qua Internet và trình URL cũ/mới cùng cách quay lui.

Có thêm phương án thử không cần mua tên miền: ngrok cấp **dev domain HTTPS cố định gắn với tài khoản**. Máy hiện chưa cài ngrok và chưa có cấu hình tài khoản. Domain thật chỉ biết sau khi chủ dự án tạo/đăng nhập tài khoản; không dùng địa chỉ ví dụ để đăng ký Meta. Ngrok Free có giới hạn lưu lượng và trang cảnh báo trên yêu cầu trình duyệt; cần thử GET verify thực tế từ Meta vì Meta không thể bấm bỏ qua cảnh báo. Phương án này phù hợp mốc nghiệm thu thử, chưa mặc nhiên là hạ tầng vận hành lâu dài.

## Trạng thái quan sát

- Meta Page webhook hiện lưu `https://held-moss-program-mats.trycloudflare.com/api/v1/webhooks/facebook`. Đây là Quick Tunnel cũ; dashboard cảnh báo app chưa phát hành thì không phân phối sự kiện thực, kể cả từ vai trò app. Trường `messages` và `feed` hiển thị đã đăng ký, nhưng chưa chứng minh tin mới đến CRM.
- Runtime API có `FACEBOOK_OAUTH_REDIRECT_URI` trỏ sang một Quick Tunnel khác. OAuth redirect và Page webhook là hai endpoint riêng. Chưa có `FACEBOOK_WEBHOOK_CALLBACK_URL` runtime; verify token/App Secret chỉ kiểm tra có, không ghi giá trị.
- `scripts/facebook-dev-gateway.mjs` chỉ chuyển tiếp GET OAuth, GET/POST webhook và health; API xác minh challenge và chữ ký HMAC của POST trước khi enqueue. Gateway chỉ nghe loopback.

## Kiến trúc đề xuất khi có tên miền

1. Chủ dự án cung cấp một tên miền quản lý trong Cloudflare hoặc máy chủ HTTPS có hostname cố định. Nếu dùng Cloudflare, tạo named Tunnel `son-crm-meta` và hostname `meta.<ten-mien>` trỏ tới `http://127.0.0.1:4100`. Máy chạy API, worker và `cloudflared` phải hoạt động liên tục; chạy `cloudflared` dạng Windows service với token lưu ngoài Git. Cloudflare phát TLS công khai cho hostname.
2. Chạy gateway từ repo bằng `node scripts/facebook-dev-gateway.mjs`, `FACEBOOK_DEV_API_ORIGIN=http://127.0.0.1:4000`, restart tự động qua service manager. Health công khai: `https://meta.<ten-mien>/_gateway/health`; readiness phải báo 200 khi API/DB sẵn.
3. Webhook callback dự kiến: `https://meta.<ten-mien>/api/v1/webhooks/facebook`. OAuth redirect dự kiến: `https://meta.<ten-mien>/api/v1/integrations/oauth/facebook/callback`. Cả hai phải được kiểm riêng. Khi chuyển OAuth, cập nhật `FACEBOOK_OAUTH_REDIRECT_URI` trên API và URI hợp lệ trong Facebook Login; khi chuyển webhook, cập nhật đúng callback/verify trên Page Webhooks. Không nhập secret qua Git/tài liệu.
4. Trước khi đổi Meta: GET challenge đúng/sai qua public HTTPS; POST chữ ký đúng/sai và kiểm job/worker/DB trên môi trường thử; DNS/TLS, restart tunnel/gateway/API/worker, Page subscription readback. Sau khi đổi: yêu cầu tài khoản thử gửi một tin mới; kiểm tra Meta delivery, inbound CRM, gửi một câu trả lời trong CRM và kiểm tra Messenger. Chỉ kết luận live khi có dấu vết cả hai chiều.

### Phương án VPS do chủ dự án quản lý

1. Nếu chủ dự án có VPS và hostname quản lý được, trỏ DNS của một hostname cố định (ví dụ `meta.<ten-mien>`) tới VPS, cấp TLS hợp lệ, cho phép HTTPS trên cổng 443. Reverse proxy chỉ chuyển hai route callback bên dưới và health cần thiết tới gateway/API nghe trên loopback hoặc mạng riêng. Không công khai cổng API, database hay kho secret.
2. Webhook là `https://<hostname>/api/v1/webhooks/facebook`; OAuth redirect là `https://<hostname>/api/v1/integrations/oauth/facebook/callback`. Hai route dùng cùng hostname nhưng có nhiệm vụ và cấu hình Meta riêng. Nếu CRM chạy ở máy khác, VPS cần đường chuyển tiếp được bảo vệ tới máy đó; nếu toàn bộ CRM chạy trên VPS, phải chuẩn bị DB, worker, backup/restore, giám sát và secret store trước khi dùng cho dữ liệu thật.
3. Trước thay đổi Meta, kiểm DNS/TLS và chạy `scripts/facebook-public-callback-smoke.mjs` **từ Internet ngoài VPS**; kiểm riêng GET challenge, POST HMAC và OAuth callback/state. Kiểm smoke chỉ chứng minh đường vào và xác thực cơ bản, không thay thế consent Page, webhook Meta thật hay tin Messenger hai chiều.
4. Khi hostname thật và kết quả kiểm đã có, ghi đúng URL đang lưu trong Meta, URL dự kiến thay, cấu hình `FACEBOOK_OAUTH_REDIRECT_URI`, và thao tác hoàn nguyên từng route. Chỉ cập nhật Meta sau khi chủ dự án duyệt bản thay đổi cụ thể; không khôi phục về Quick Tunnel cũ nếu nó không còn sống.

## Điều kiện và rollback

- Cần tên miền/hostname cụ thể, Cloudflare account hoặc máy chủ TLS, quy trình lưu token tunnel an toàn, uptime và cấu hình privacy/app publication của Meta. Không tạo tunnel, DNS, service hay đổi Meta trong checkpoint này.
- Nếu callback mới lỗi sau khi được duyệt chuyển, khôi phục URL Meta đã lưu trước đó **chỉ khi endpoint cũ còn hoạt động**; nếu không, tắt luồng gửi trong CRM và giữ job để retry, không báo đã nhận live. OAuth redirect rollback độc lập với webhook.
- Phương án cụ thể để phê duyệt sau khi có tên miền: đúng hostname, route, service, thời điểm chuyển, kết quả smoke test, URL cũ/mới, người vận hành và cách hoàn nguyên. Trước lúc đó các URL `meta.<ten-mien>` chỉ là mẫu, không phải URL đã cấp.

### Lựa chọn ngrok dev domain cho mốc thử

1. Chủ dự án tạo/đăng nhập tài khoản ngrok và lấy assigned dev domain trong Gateway → Domains; không gửi authtoken trong chat. Cài agent từ nguồn chính thức, lưu token ngoài Git, chạy `ngrok http 4100 --url https://<assigned-dev-domain>` sau khi gateway và API sẵn. Cấu hình agent khởi động lại cùng máy; nếu máy tắt, hostname còn nhưng callback không hoạt động.
2. URL cần duyệt sau khi có domain: `https://<assigned-dev-domain>/api/v1/webhooks/facebook`; OAuth riêng là `https://<assigned-dev-domain>/api/v1/integrations/oauth/facebook/callback`. Dùng `/_gateway/health` để giám sát.
3. Bắt buộc kiểm từ Internet bằng GET challenge thật và POST HMAC thử, đặc biệt vì trang cảnh báo Free; nếu Meta bị chặn, dừng phương án này và chọn named tunnel/hostname riêng. Chỉ khi đạt mới trình đúng URL và thay đổi Meta để chủ dự án quyết định.

Tham khảo: [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/), [Cloudflare routing](https://developers.cloudflare.com/tunnel/concepts/routing/), [ngrok static dev domains](https://ngrok.com/blog/free-static-domains-ngrok-users).

## Kiểm chứng local trong checkpoint này

Cập nhật 2026-10-16: `scripts/facebook-public-callback-smoke.mjs` đã chuẩn bị cho **hostname thật**. Chạy với `FB_CALLBACK_BASE_URL`, `FACEBOOK_WEBHOOK_VERIFY_TOKEN`, `FACEBOOK_APP_SECRET` được cấp qua environment/secret store; script không in secret. Nó kiểm `/_gateway/health`, GET challenge đúng/sai, POST HMAC đúng/sai với `entry: []` không tạo job, và OAuth callback với state sai phải trả 400. Kết quả này chỉ chứng minh hai route HTTPS có thể tiếp cận và xác minh cơ bản; OAuth consent/token exchange và tin Meta mới vẫn cần thử riêng sau khi dashboard được đổi. Hiện không có hostname thật để chạy script từ Internet, và cấu hình Meta giữ nguyên.

- `node --test scripts/facebook-dev-gateway.test.mjs`: 1/1, allowlist, GET challenge, POST giữ nguyên body và chữ ký, health chuyển tới API readiness. Đây là HTTP local qua gateway giả lập upstream; chưa chứng minh TLS/hostname công khai.
- `integrations.e2e-spec.ts` trên `crm_social_quote_scratch_20261015`: 1/1, GET verify token, POST HMAC đúng/sai, enqueue/worker/dedupe/DB. Đây là fixture, không phải Meta delivery.
- Migration quote source đã chạy trên scratch và DB local UI sau backup/restore thử. Backup local: `%LOCALAPPDATA%\SonCRM\Backups\son_crm_ui_account_pre_quote_source_20261015_01.dump`, SHA256 `EEBB7F3A6A6517337F072B930C1D9789AC6DB22A28CE4341CFC4054778018B03`. DB local 32 migrations, API/web health 200; dữ liệu social trước/sau `2 conversations | 8 messages | 0 comments | 0 outbounds | 0 quotes`. Không seed DB local. Trong UI Chrome, hai chat lịch sử vẫn ngoài cửa sổ gửi và chưa liên kết Customer; không có điều kiện để thử nút báo giá với dữ liệu vận hành.
