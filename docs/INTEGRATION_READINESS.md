# Sẵn sàng tích hợp và bằng chứng quyền — checkpoint 2026-10-21

## Kết quả mới nhất 2026-10-21

CRM pilot đã chạy tại `https://crm.nguyenhongson.vn` trên VPS `103.149.253.223`, checkout `integration/merge-crm` commit `6c30574`. Nginx chuyển HTTPS tới web/API chỉ nghe loopback; PostgreSQL không publish cổng. HTTPS từ máy ngoài VPS trả 200 cho trang đăng nhập và `/api/v1/health/ready`; đăng nhập owner, `/me`, đăng xuất và cờ cookie Secure/HttpOnly/SameSite=Lax đạt. Database mới đã migrate, bootstrap một owner; backup đầu tiên ở ngoài Git đã thử phục hồi vào DB scratch với 1 business/1 owner. Certbot renewal dry run đạt. Đây là **pilot hạ tầng CRM**, không phải nghiệm thu Meta live hay xác nhận toàn bộ chức năng sẵn sàng dùng dữ liệu thật.

Webhook mới có thể truy cập ở `https://crm.nguyenhongson.vn/api/v1/webhooks/facebook`: GET token đúng trả challenge, token sai trả 401, POST sai chữ ký trả 401. OAuth callback riêng `https://crm.nguyenhongson.vn/api/v1/integrations/oauth/facebook/callback` trả 400 với state sai. VPS chưa có Meta App Secret/Page grant production, nên chưa kiểm POST HMAC hợp lệ, OAuth consent/token exchange hay Messenger hai chiều. Dashboard Meta vẫn giữ nguyên callback cũ theo lựa chọn chủ dự án. API worker integration chưa bật. Messenger Page đầu tiếp tục `WAITING_FOR_META`; Page thứ hai `WAITING_FOR_PAGE_GRANT`; bình luận `BLOCKED_PERMISSION`; Zalo/shop `WAITING_FOR_PROVIDER_GRANT`. Không có kênh nào được báo live chỉ vì hostname đã hoạt động.

Backup hiện mới nằm cùng VPS, chưa có lịch và nơi lưu ngoài VPS; giám sát và nghiệm thu UI nghiệp vụ vẫn cần trước khi dùng dữ liệu khách thật. [Runbook triển khai](PRODUCTION_DEPLOYMENT.md) ghi ranh giới này.

## Checkpoint trước: 2026-10-16

Migration mới `20261016010000_integration_staff_access` đã áp trên DB scratch, chưa áp DB vận hành. Trên DB scratch **mới** `crm_channel_auth_scratch_20261016_acceptance`, sáu E2E social/quote đạt **18/18**; API unit 48/48, web unit 10/10; API/web typecheck, lint, build đạt. Lượt chạy chung đầu tiên trên DB scratch tái sử dụng có 3 lỗi đếm fixture cũ; chạy lại cùng bộ trên DB mới đạt, không xóa DB cũ. Backend đọc danh sách Page theo `paging.next` kể cả trang ngắn, lưu token/quyền/task/subscription riêng mỗi Page, trả lỗi subscription theo Page và rollback toàn bộ DB cho lần chọn nếu một Page thất bại. Quản trị viên cấp quyền xem/gửi theo connection; API hộp thư, chat, comment, ticket, đơn ngoài và tạo quote từ chat kiểm Page scope. UI có chọn nhiều Page, danh sách trạng thái từng kết nối, bộ lọc tất cả/Page và phân quyền nhân viên từng kết nối. Tất cả kết quả này là `LOCAL_TESTED`, không phải Meta live. UI bản mới chưa được xem trong browser scratch; chỉ typecheck/build, vì web dev hiện chạy cùng thư mục trên DB vận hành.

Messenger Page đầu: `WAITING_FOR_HOSTNAME` và `WAITING_FOR_META` đối với webhook tin mới và outbound live. Page thứ hai: thêm `WAITING_FOR_PAGE_GRANT`. Comments: `BLOCKED_PERMISSION` vì thiếu `pages_read_user_content`/`pages_manage_engagement`. Zalo OA và shop: `WAITING_FOR_PROVIDER_GRANT`, chức năng gửi/đơn vẫn khóa. Giữ dashboard Meta nguyên trạng; chưa có URL mới hoặc privacy policy có dữ kiện pháp lý để nộp.

Đây là trạng thái tại ngày 2026-10-16; mục 2026-10-21 phía trên thay thế các thông tin cũ về hostname/deploy. Mọi kết quả mock, fixture, build và dữ liệu lịch sử đều được tách khỏi nghiệm thu live. Không bật gửi hoặc xử lý đơn cho một tài khoản chỉ vì tài khoản khác đã được xác minh.

## Trạng thái theo tài khoản và năng lực

| Kênh/tài khoản | Đã xác minh với tài khoản thật | Đã kiểm local/fixture | Còn thiếu trước khi bật vận hành |
| --- | --- | --- | --- |
| Facebook Page sikeoLC | OAuth Page grant có `pages_messaging`, Page task nhắn tin; đọc lịch sử Graph 2 chat/8 tin; Page subscription readback. | Webhook verify/HMAC, worker, dedupe và luồng gửi được kiểm bằng fixture. | App chưa phát hành, webhook Meta lưu Quick Tunnel cũ; chưa nhận tin mới thật, chưa có trả lời CRM hiện trên Messenger. **Messenger chưa nghiệm thu live.** |
| Facebook Page thứ hai | Chưa có Page ID/grant do chủ dự án xác nhận. | Luồng chọn nhiều Page và lưu riêng đang được kiểm local. | Grant, quyền, subscription, inbound/outbound thật và echo riêng Page. |
| Bình luận Facebook Page đầu | Đọc 25 post Page; task `MODERATE` có. Graph `/post/comments` trả code 10. | Luồng trả lời có chặn quyền runtime. | Thiếu `pages_read_user_content` và `pages_manage_engagement` trong grant, chưa có reply thật. **Gửi bình luận bị chặn.** |
| Chat → báo giá/đơn nội bộ | Chưa nghiệm thu bằng dữ liệu khách/SKU vận hành. | Migration FK Conversation/Message/Ticket → Quote và Quote → Order; scratch E2E đạt. | Cần Customer/SKU hợp lệ và thao tác UI với dữ liệu vận hành. Không suy ra quyền đơn của sàn. |
| Zalo OA | Chưa có OA/app grant thật; OA đang chờ duyệt. | OAuth/PKCE/refresh, inbound adapter và màn kết nối có code/fixture. | Grant, webhook và API gửi của từng OA. **Không bật gửi.** |
| Shopee shop | Chưa có shop grant/API quyền thật. | Model/UI import hoặc mapping. | Xác minh order/product/fulfillment cho từng shop. **Không xử lý đơn tự động.** |
| TikTok Shop | Chưa có shop grant/API quyền thật. | Model/UI import hoặc mapping. | Xác minh order/product/fulfillment cho từng shop. **Không xử lý đơn tự động.** |

Một Page có thể có token và subscription riêng nhưng điều đó không chứng minh webhook ứng dụng, Meta delivery hay outbound đến người nhận. Không gộp khách hai Page bằng tên hiển thị; danh tính ngoài gắn `connectionId` và user ID của kênh.

## Callback và cấu hình Meta

- Cấu hình Meta hiện tại được giữ nguyên theo lựa chọn chủ dự án. Page webhook lưu `https://held-moss-program-mats.trycloudflare.com/api/v1/webhooks/facebook` (Quick Tunnel cũ, không được coi còn sống). OAuth runtime lưu một Quick Tunnel khác. Hai callback là hai route độc lập.
- Hostname/VPS hiện đã có; hai URL mới và các kiểm tra giới hạn nằm ở checkpoint 2026-10-21. [Đề xuất hostname, thử nghiệm và quay lui](tasks/FB-STABLE-CALLBACK-PROPOSAL-2026-10-15.md) là phương án cũ, chưa áp dụng trên Meta.
- Còn cần Meta App Secret và POST HMAC hợp lệ qua Internet, OAuth consent/token exchange, Page grant/subscription, privacy policy đã duyệt và phương án quay lui từng callback trước khi trình thay đổi dashboard. Sau đó mới yêu cầu tài khoản thử gửi tin mới và xác nhận trả lời thật trên Messenger.

## Bộ bằng chứng cho mỗi Page/OA/shop

| Mã | Bằng chứng cần lưu, đã che bí mật |
| --- | --- |
| E-ACCOUNT | Loại account, business, provider ID đã che, chủ sở hữu, môi trường. |
| E-SCOPE | Grant/token task thực tế và trạng thái review, theo từng tài khoản. |
| E-WEBHOOK | Callback, signature, request/event ID, Page ID routing, worker và DB record một lần. |
| E-INBOUND | Tin/bình luận mới từ tài khoản thử vào đúng hộp thư Page. |
| E-OUTBOUND | Provider response ID và câu trả lời hiện ở đúng tài khoản thử. |
| E-DUP | Replay và echo không nhân đôi message/side effect. |
| E-ISOLATION | Reconnect/ngắt một Page không ảnh hưởng Page khác; khách trùng tên không bị gộp. |
| E-PRIVACY | Privacy policy, thời hạn lưu, xóa/xuất và phân quyền người xem đã duyệt. |

Lưu ảnh/log chứa dữ liệu cá nhân ngoài Git; file này chỉ ghi ngày, đường dẫn bằng chứng an toàn và kết luận. Không dùng fixture như E-INBOUND/E-OUTBOUND live.

## Điều kiện review

[Hồ sơ Meta hiện hành](tasks/FB-META-REVIEW-DRAFT.md) mô tả cả gửi Messenger và trả lời bình luận. Cần privacy policy công khai được chủ dự án xác nhận tên đơn vị, email xóa/xuất, retention; URL HTTPS cố định; quyền comment thực tế; video live; trạng thái app publication/Advanced Access theo dashboard. Chưa nộp review.

Nguồn kiểm quyền tại ngày thử: [Meta Messenger API](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api), [Meta permissions](https://developers.facebook.com/docs/permissions/reference/), [Zalo OA docs](https://docs.zaloplatforms.com/docs/OA/bat-dau/kham-pha), [Shopee Open Platform](https://open.shopee.com/developer-guide/14), [TikTok Shop Partner Center](https://partner.tiktokshop.com/docv2/page/get-order-list-202309).
