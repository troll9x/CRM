# Sẵn sàng tích hợp và bằng chứng quyền

Tình hình code/mức độ chặn mới nhất và từng bước cấu hình ở [`INTEGRATIONS_SETUP.md`](INTEGRATIONS_SETUP.md). Facebook OAuth/Page selection/subscription và Zalo OA OAuth/PKCE/token refresh có code và tests mock local từ 2026-10-10; Meta Page webhook và Zalo OA inbound message có adapter local nhưng chưa có account evidence. Page URL do chủ dự án cung cấp: `https://www.facebook.com/sikeoLC/` (chưa đối chiếu numeric Page ID qua OAuth). Zalo comment API chưa xác minh; Shopee/TikTok chưa có account-authorized order poller. E2E fixtures chỉ chứng minh code path local, không chứng minh provider integration.

Rà soát ban đầu ngày 2026-10-08 trước khi viết adapter: Facebook được chọn làm kênh đầu tiên ngày 2026-10-07; lúc đó chưa thấy biến môi trường Meta/Facebook/Messenger trong process hiện tại; không đọc nội dung `.env`. Hiện worktree đã có adapter inbound local như ghi ở trên nhưng chưa có app ID/Page thử hoặc kết quả gọi API bằng tài khoản có thể dùng làm bằng chứng. Vì vậy connector vẫn **CHƯA XÁC MINH**, không phải “đã tích hợp thật”. Không lưu token/secret/OTP trong file này.

## 1. Ma trận năng lực

| Kênh        | Tài khoản dự kiến                                      | Nhận tin                           | Gửi tin                       | Đơn            | Sản phẩm/tồn   | Đăng nội dung             | Trạng thái    |
| ----------- | ------------------------------------------------------ | ---------------------------------- | ----------------------------- | -------------- | -------------- | ------------------------- | ------------- |
| Facebook    | Page URL `facebook.com/sikeoLC/` đã cung cấp; numeric ID chưa lấy từ grant | OAuth/webhook local có code; chưa có app/Page grant/event thật | Chưa xác minh điều kiện gửi   | Không giả định | Không giả định | Cần xét riêng             | CHƯA XÁC MINH |
| Zalo        | OA đang chờ duyệt; chưa có app grant | OAuth/PKCE/refresh và inbound `user_send_*` adapter local; cần OA/App test evidence | Chưa có connector gửi; không giả định hạn mức | Không giả định | Không giả định | Cần xét riêng             | CHƯA XÁC MINH |
| Shopee      | Shop + partner/developer app                           | Quyền chat xét riêng               | Quyền chat xét riêng          | Đợt 13         | Đợt 13         | Không trong core          | CHƯA XÁC MINH |
| TikTok Shop | Shop + partner app                                     | Quyền conversation xét riêng       | Quyền conversation xét riêng  | Đợt 13         | Đợt 13         | Direct Post là tuyến khác | CHƯA XÁC MINH |

Tên scope/quyền cụ thể chỉ được ghi sau khi xem trong app console của tài khoản thử và đối chiếu tài liệu chính thức tại ngày thử; không sao chép tên scope cũ từ bài viết bên ngoài.

## 2. Điều kiện đầu vào để thử Facebook/Zalo

- `OPEN-01` ngày 2026-10-07 chọn Facebook đầu tiên; Page URL `https://www.facebook.com/sikeoLC/` và quyền quản lý đã được chủ dự án xác nhận. Numeric Page ID/authorization vẫn phải lấy qua OAuth, không nhập tay để coi là verified. Zalo OA đang chờ duyệt.
- Tài khoản developer/app của chính cửa hàng hoặc môi trường test hợp lệ.
- Callback HTTPS staging, secret trong secret store, người có quyền thao tác console.
- Hai tài khoản người dùng thử và nội dung tin không chứa dữ liệu khách thật.
- Quyết định retention dữ liệu tin/ảnh và người được xem.

Nếu cửa hàng chỉ dùng tài khoản cá nhân, dừng nhánh connector chính thức tương ứng và giữ quy trình nhập thủ công; không dùng browser automation né điều kiện nền tảng.

## 3. Evidence bắt buộc cho từng năng lực

Quy tắc phân nhóm nội bộ theo nguồn (Facebook/Zalo → sỉ; Shopee/TikTok → lẻ) đã có ở CRM backend. Đây chỉ áp dụng khi hồ sơ được tạo/cập nhật có tên nguồn; không đồng bộ khách, hội thoại hoặc đơn từ nền tảng và không làm thay đổi trạng thái connector bên dưới.

| Evidence ID | Bằng chứng giữ lại (đã loại bí mật)                                             |
| ----------- | ------------------------------------------------------------------------------- |
| E-ACCOUNT   | Loại account, ID đã che, owner/admin xác nhận, môi trường test/live             |
| E-APP       | App id đã che, sản phẩm/API/version, trạng thái review/mode                     |
| E-SCOPE     | Danh sách quyền thực tế được cấp và ảnh chụp/response debug không có token      |
| E-WEBHOOK   | Request id/event id, thời điểm, signature verified, event được lưu đúng một lần |
| E-INBOUND   | Gửi từ user test và tin xuất hiện đúng conversation/customer identity           |
| E-OUTBOUND  | Message id/provider response và tin đến user test; ghi điều kiện/thời gian gửi  |
| E-DUP       | Replay cùng event không nhân đôi message/order/side effect                      |
| E-REVOKE    | Thu hồi/hết hạn token tạo lỗi quan sát được; không fallback trái phép           |
| E-PRIVACY   | Dữ liệu lưu, retention, xóa/xuất và người có quyền đã được duyệt                |

Evidence file (ảnh/log đã che) sau này đặt ngoài Git nếu có PII; file này chỉ ghi đường dẫn kho bằng chứng, ngày, người thử và kết luận.

## 4. Kịch bản thử tối thiểu

1. Đăng ký callback staging và verify challenge/signature theo tài liệu chính thức.
2. Nhận một tin text từ account thử; lưu unique event; hiển thị vào đúng hội thoại.
3. Replay payload hai lần; DB chỉ có một message/event nghiệp vụ.
4. Gửi một phản hồi từ CRM; lưu provider message id và trạng thái nhận.
5. Tạo ghi chú nội bộ; chứng minh không có API gửi ra.
6. Hết hạn/thu hồi token; job thất bại rõ, không mất event, không tự chuyển kênh.
7. Gửi ngoài điều kiện được phép; UI nêu lỗi/giới hạn, không thử cách lách.

## 5. Nhật ký thử

| Ngày       | Kênh/năng lực            | Account/App                                             | Evidence | Kết quả                                                                                                      | Người thử                   |
| ---------- | ------------------------ | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ | --------------------------- |
| 30/09/2026 | Rà soát đầu vào          | Chưa được cung cấp                                      | Không có | BLOCKED — thiếu account/app thử; core vẫn có thể chuẩn bị                                                    | AI + chủ dự án cần phối hợp |
| 08/10/2026 | Rà soát lại worktree/env | Không thấy biến env provider-specific; không đọc secret | Không có | BLOCKED — thiếu Page/app/test và quyết định retention/phạm vi người xem; chưa có connector hoặc API evidence | AI                          |

## 6. Nguồn chính thức để đối chiếu tại ngày thử

- Meta Messenger Platform: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api
- Zalo OA OpenAPI: https://docs.zaloplatforms.com/docs/OA/bat-dau/kham-pha
- Shopee Open Platform: https://open.shopee.com/developer-guide/14
- TikTok Shop Partner Center: https://partner.tiktokshop.com/docv2/page/get-order-list-202309
- Zalo OA inbound messages/webhook: https://stc-developers.zdn.vn/docs/v2/official-account/webhook/tin-nhan/su-kien-nguoi-dung-gui-tin-nhan?lang=vi

Các URL và điều kiện quyền có thể đổi; phải xác minh lại bằng tài khoản thật ở thời điểm tích hợp.
