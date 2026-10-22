# Đề xuất chuyển callback Meta sang CRM HTTPS — 2026-10-22

Trạng thái: đã chuẩn bị và thử endpoint ngoài Meta; **chưa thay cấu hình Meta**. App ID `1682297180226928` (`Sơn CRM`). Không đưa App Secret, verify token, OAuth code hay Page token vào tài liệu.

## Hai thay đổi riêng

1. Trong Facebook Login/OAuth, thêm **Valid OAuth Redirect URI** `https://crm.nguyenhongson.vn/api/v1/integrations/oauth/facebook/callback`. Giữ URI cũ trong giai đoạn chuyển nếu dashboard đang lưu; kiểm URI cũ trực tiếp trước khi sửa. CRM production đã dùng URI mới. Đây là callback nhận `code` sau khi chủ Page consent.
2. Trong Webhooks, object **Page**, đổi **Callback URL** từ `https://held-moss-program-mats.trycloudflare.com/api/v1/webhooks/facebook` sang `https://crm.nguyenhongson.vn/api/v1/webhooks/facebook`. Dùng verify token hiện có trên VPS qua kênh bí mật, giữ nguyên các fields đã subscribe. Đây là callback nhận event; không thay bằng URL OAuth.

Graph readback hiện xác nhận app subscription `page` active nhưng URL vẫn là Quick Tunnel cũ. Chưa xác minh OAuth allowlist trong dashboard vì kết nối điều khiển trình duyệt chưa hoạt động.

## Bằng chứng trước khi đổi

- HTTPS public `/api/v1/health/ready` trả 200; webhook GET challenge token đúng trả nguyên challenge, token sai 401.
- Webhook POST payload Page rỗng ký bằng App Secret thật trả 200; chữ ký sai trả 401. Payload rỗng không chứng minh event Page được giao.
- OAuth callback state sai trả 400. Tài khoản owner CRM gọi `POST /api/v1/integrations/oauth/facebook/start` được URL Meta với URI production và bốn scope Messenger/Page. Chưa có consent/token exchange live.

## Kiểm sau khi đổi

Đọc lại OAuth redirect allowlist và Page app subscription. Chủ Page đăng nhập Facebook trong luồng CRM, tự hoàn tất OTP/consent; CRM phải hiển thị danh sách Page được cấp. Chọn Page đầu, xác minh grant, task, subscription và health riêng. Yêu cầu tài khoản thử gửi tin **mới**; kiểm chữ ký, Page ID routing, DB message một lần, trả lời từ CRM được Meta trả ID và xuất hiện trong Messenger, echo không nhân đôi. Chỉ sau bước này mới bật worker integration cho luồng cần job. Page thứ hai nghiệm thu riêng theo cùng tiêu chí. Bình luận chỉ bật khi grant thực tế có các quyền cần thiết và Graph chấp nhận reply.

## Quay lui

- OAuth: bỏ URI production khỏi allowlist nếu còn URI cũ hoạt động; khôi phục `FACEBOOK_OAUTH_REDIRECT_URI` trên VPS theo bản sao cấu hình trước chuyển và tái tạo riêng API. Không dùng URI cũ nếu tunnel đã ngừng.
- Webhook: đặt lại Callback URL cũ và verify token cũ; kiểm Meta challenge rồi đọc lại subscription. Quick Tunnel cũ có thể đã chết nên bước quay lui này không bảo đảm khôi phục delivery; phương án an toàn khi thất bại là ngừng kết nối Page/worker và khắc phục endpoint cố định trước khi nhận tin mới.
- Giữ backup `.env.production` trước thay đổi tại `/root/son-crm-env-before-meta-20261022` (0600). Không phục hồi toàn bộ file nếu VPS đã có thay đổi cấu hình khác; chỉ đối chiếu các khóa Meta liên quan.
