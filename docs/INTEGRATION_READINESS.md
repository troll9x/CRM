# Sẵn sàng tích hợp và bằng chứng quyền

Ngày rà soát nội bộ: 30/09/2026. Repo hiện không có credential, app id, Page/OA/shop thử hay kết quả API. Vì vậy tất cả connector là **CHƯA XÁC MINH**, không phải “đã tích hợp”. Không lưu token/secret/OTP trong file này.

## 1. Ma trận năng lực

| Kênh        | Tài khoản dự kiến            | Nhận tin                               | Gửi tin                       | Đơn            | Sản phẩm/tồn   | Đăng nội dung             | Trạng thái    |
| ----------- | ---------------------------- | -------------------------------------- | ----------------------------- | -------------- | -------------- | ------------------------- | ------------- |
| Facebook    | Fanpage do cửa hàng quản lý  | Cần xác minh app/webhook/quyền thực tế | Cần xác minh điều kiện gửi    | Không giả định | Không giả định | Cần xét riêng             | CHƯA XÁC MINH |
| Zalo        | Zalo Official Account        | Cần xác minh OA app/webhook            | Cần xác minh loại tin/hạn mức | Không giả định | Không giả định | Cần xét riêng             | CHƯA XÁC MINH |
| Shopee      | Shop + partner/developer app | Quyền chat xét riêng                   | Quyền chat xét riêng          | Đợt 13         | Đợt 13         | Không trong core          | CHƯA XÁC MINH |
| TikTok Shop | Shop + partner app           | Quyền conversation xét riêng           | Quyền conversation xét riêng  | Đợt 13         | Đợt 13         | Direct Post là tuyến khác | CHƯA XÁC MINH |

Tên scope/quyền cụ thể chỉ được ghi sau khi xem trong app console của tài khoản thử và đối chiếu tài liệu chính thức tại ngày thử; không sao chép tên scope cũ từ bài viết bên ngoài.

## 2. Điều kiện đầu vào để thử Facebook/Zalo

- Câu trả lời `OPEN-01`; URL/ID Fanpage và Zalo OA thử, xác nhận người sở hữu/được phép quản lý.
- Tài khoản developer/app của chính cửa hàng hoặc môi trường test hợp lệ.
- Callback HTTPS staging, secret trong secret store, người có quyền thao tác console.
- Hai tài khoản người dùng thử và nội dung tin không chứa dữ liệu khách thật.
- Quyết định retention dữ liệu tin/ảnh và người được xem.

Nếu cửa hàng chỉ dùng tài khoản cá nhân, dừng nhánh connector chính thức tương ứng và giữ quy trình nhập thủ công; không dùng browser automation né điều kiện nền tảng.

## 3. Evidence bắt buộc cho từng năng lực

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

| Ngày       | Kênh/năng lực   | Account/App        | Evidence | Kết quả                                                   | Người thử                   |
| ---------- | --------------- | ------------------ | -------- | --------------------------------------------------------- | --------------------------- |
| 30/09/2026 | Rà soát đầu vào | Chưa được cung cấp | Không có | BLOCKED — thiếu account/app thử; core vẫn có thể chuẩn bị | AI + chủ dự án cần phối hợp |

## 6. Nguồn chính thức để đối chiếu tại ngày thử

- Meta Messenger Platform: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api
- Zalo OA OpenAPI: https://docs.zaloplatforms.com/docs/OA/bat-dau/kham-pha
- Shopee Open Platform: https://open.shopee.com/developer-guide/14
- TikTok Shop Partner Center: https://partner.tiktokshop.com/docv2/page/get-conversation-202601

Các URL và điều kiện quyền có thể đổi; phải xác minh lại bằng tài khoản thật ở thời điểm tích hợp.
