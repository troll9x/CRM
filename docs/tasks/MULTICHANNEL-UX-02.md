# MULTICHANNEL-UX-02 — Giao diện đa kênh gọn và kết nối theo khả năng thật

## Phạm vi đã giao

Chủ dự án yêu cầu sửa giao diện đa kênh đang giống phần mềm lỗi, bỏ banner “Trạng thái thật”, kết nối Zalo OA/Shopee/TikTok Shop thuận tiện. Ngày 12/11 xác nhận chưa có ứng dụng tích hợp của ba nền tảng này.

## Hành vi

- Đầu vào: connection và provider preflight thật từ API. Đầu ra: bốn thẻ nền tảng, trạng thái dịch vụ và danh sách tài khoản; không tạo connection khi chỉ mở hướng dẫn.
- Người có `connectors.manage` mới xem nút thiết lập/cấp quyền và chẩn đoán. Tab nhật ký/SKU chỉ hiện theo quyền tương ứng. Backend tiếp tục kiểm quyền trên actor/business/record.
- Facebook/Zalo có adapter OAuth: khi preflight cho phép, bấm kết nối mở nền tảng; callback quay đúng module `#integrations` rồi chọn tài khoản được cấp quyền.
- Thiếu cấu hình mở hướng dẫn riêng qua dialog có Escape, nút đóng, focus bản địa và liên kết cổng nhà phát triển; không có ô nhận secret trong frontend. Shopee/TikTok ghi rõ chưa có bộ kết nối cấp quyền trong bản hiện tại.
- `CONNECTED` được ghi nhãn “Đã cấp quyền”; khai báo thủ công không được đếm. Chẩn đoán webhook/quyền gửi được thu gọn, không bị xóa hay nâng trạng thái.
- Sửa gốc CSS `.dashboard-shell nav` thành phạm vi sidebar. Tab module có kiểu riêng, cuộn ngang trên màn hẹp. Thẻ nền tảng 4/2/1 cột theo viewport.
- Không đổi schema, dependency, kho/tiền hoặc nghiệp vụ đơn sàn. Không mang thay đổi private reply/comment còn dở vào release này.

## Thiết lập dịch vụ còn phải làm

1. Zalo: tạo ứng dụng ở [Zalo Developers](https://developers.zalo.me/), xin quyền OA theo tài liệu nền tảng và OA đủ điều kiện. Lưu `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_SECRET_KEY`, `ZALO_OAUTH_REDIRECT_URI` trực tiếp trong cấu hình backend. Callback đang có: `https://crm.nguyenhongson.vn/api/v1/integrations/oauth/zalo/callback`. Cấu hình webhook theo tài liệu triển khai hiện có, reload API/worker, sau đó chủ OA cấp quyền từ CRM và thử sự kiện thật.
2. Shopee: đăng ký app/partner ở [Shopee Open Platform](https://open.shopee.com/) đúng thị trường; lấy tài liệu app và quyền gian hàng. Adapter OAuth/refresh và nhập đơn vẫn cần triển khai, kiểm thử trước khi bật. Không đăng ký callback chưa có route thật.
3. TikTok Shop: tạo app/dịch vụ ở [TikTok Shop Partner Center](https://partner.tiktokshop.com/) đúng thị trường; xác nhận service ID, scope và API hiện hành. Adapter OAuth/refresh và nhập đơn vẫn cần triển khai, kiểm thử trước khi bật.

Không gửi secret, code cấp quyền, access/refresh token qua chat hoặc commit. Preflight trên VPS trước thay đổi xác nhận cả ba dịch vụ thiếu cấu hình; Facebook đủ cấu hình. Có app/config chưa chứng minh nhận/gửi dữ liệu thật.

## Bằng chứng kiểm tra

- Node 24.18.0 đúng engine; build API/contracts/web, typecheck và lint đạt trên worktree sạch từ `b974417`.
- API unit 62/62, web unit 19/19; kiểm tra không quảng bá OAuth cho provider chưa hỗ trợ, không coi khai báo thủ công là tài khoản cấp quyền và không lộ tên secret trong thẻ kênh.
- OAuth Facebook/Zalo: 11/11 E2E đạt trên PostgreSQL 17.6 scratch `channel_auth_scratch`, 34 migration và seed fixture. Kiểm tra fragment callback, state/replay, actor/business, reconnect/disconnect và token rotation hiện có; provider được mock, không phải live evidence.
- Browser host không sẵn sàng và công cụ Windows đã chặn Computer Use do không xác định được URL. Chưa nghiệm thu trực quan/focus/tương tác dialog trên trình duyệt; ảnh người dùng cung cấp và CSS chứng minh nguyên nhân lỗi cũ, build không thay kiểm tra trực quan mới.
- Không chạy migration/seed trên production hoặc gửi tin nhắn thật.

## Nghiệm thu còn mở

Desktop/mobile và thao tác OAuth trực quan; app approval, credentials và consent thật cho ba kênh; Shopee/TikTok authorization/order adapters; webhook và gửi/nhận thật theo quyền từng tài khoản.


## Triển khai VPS — 12/11/2026

- Source release `7fe0bc4` đã push và fast-forward trên `/srv/son-crm`; production Docker build thành công bằng Node 24.18.0. API/web đang chạy image `sha256:db106430f9e3ecf69d1df266bf74468a5bdd37b51c2ce945f4277e5147cb04d9`, tag `son-crm-app:release-7fe0bc4`; API health đạt. Không migrate/seed DB production.
- Public `/`, `/api/v1/health/ready`, `/privacy`, `/data-deletion` trả 200. Đã tải 10 JS/CSS assets từ HTML public, đều 200; xác nhận có component/style kênh mới, sidebar selector đã thu hẹp, không có chuỗi banner cũ trong JS. `/` dùng cache `private, no-cache, no-store`; preflight chưa đăng nhập trả 401. Đây là bằng chứng HTTP/assets, không phải thao tác giao diện hoặc tích hợp live.
- Rollback API giữ tại `son-crm-app:rollback-api-before-channel-ux`, web tại `son-crm-app:rollback-web-before-channel-ux` (hai image trước đó khác nhau). Trong `/srv/son-crm`: tag image rollback API thành `son-crm-app:production`, chạy compose `up -d --no-build --no-deps api`; sau khi API healthy, tag image rollback web thành `son-crm-app:production`, chạy compose `up -d --no-build --no-deps web`. Dùng cùng `--profile ai --env-file .env.production -f compose.production.yaml`; kiểm lại health và public assets sau quay lui.
