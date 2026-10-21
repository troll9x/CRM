# Sơn CRM — hồ sơ Meta App Review (bản nháp, chưa nộp)

Cập nhật hạ tầng 2026-10-21 (nội dung quyền theo checkpoint 2026-10-16). CRM pilot đã chạy HTTPS tại `crm.nguyenhongson.vn`; GET webhook challenge đúng/sai và OAuth callback state sai đã được kiểm qua hostname, POST sai chữ ký bị từ chối. Chưa kiểm POST HMAC hợp lệ vì App Secret chưa cấp trên VPS, chưa kiểm OAuth consent/token exchange, webhook Meta thật hoặc tin Messenger hai chiều. Dashboard Meta vẫn giữ callback cũ; không nộp hồ sơ khi thiếu privacy policy được chủ dự án duyệt, quyền cần thiết và video thao tác thật.

## Chức năng và quyền cần xin

Chủ Page đăng nhập Facebook, xem danh sách Page do Meta trả về và chọn Page cần kết nối. CRM lưu kết nối, token mã hóa, quyền và trạng thái riêng từng Page. Nhân viên xem tin nhắn, bình luận và nhập lịch sử trong phạm vi Graph cho phép; gửi trả lời Messenger hoặc bình luận thủ công. CRM chỉ đánh dấu đã gửi khi Meta chấp nhận và trả ID. Code chặn gửi nếu token, task, quyền, nguồn hoặc điều kiện thời gian không hợp lệ. Không đăng bài mới, xóa bình luận hay gửi marketing tự động bằng các quyền này.

Một lần consent có thể chọn nhiều Page từ danh sách `/me/accounts`; mỗi Page được lưu theo `(business, FACEBOOK, Page ID)` và có grant, task, subscription, trạng thái kết nối riêng. Quản trị viên cấp quyền xem/gửi cho nhân viên trên từng Page. Ngắt một Page xóa token local của Page đó, không xóa dữ liệu hoặc token Page khác; upstream unsubscribe chưa được xác nhận. Kiểm thử này hiện chỉ dùng mock Graph và DB scratch.

| Quyền | Mục đích | Bằng chứng hiện tại |
| --- | --- | --- |
| `pages_show_list` | Liệt kê Page được cấp để chủ Page chọn | Đã có trong grant Page đầu. |
| `pages_manage_metadata` | Đăng ký và đọc subscription Page cho `messages`/`feed` | Subscription đã đọc lại; chưa chứng minh delivery mới. |
| `pages_messaging` | Nhận/đọc Messenger và gửi trả lời thủ công | Grant và task nhắn tin đã thấy; lịch sử 2 chat/8 tin đã nhập. Chưa có outbound hiện trên Messenger. |
| `pages_read_engagement` | Đọc bài của Page làm nguồn bình luận | Graph trả 25 bài ở trang đầu. |
| `pages_read_user_content` | Đọc bình luận khách trên bài Page | Chưa có trong grant; Graph `/post/comments` trả code 10. |
| `pages_manage_engagement` | Trả lời bình luận khách | Chưa có trong grant; task `MODERATE` không thay thế quyền này. Chưa gửi live. |

Trạng thái “Sẵn sàng thử nghiệm” ở dashboard không đồng nghĩa với Advanced Access hay grant trên token. App chưa phát hành; dashboard cảnh báo chưa chuyển event thật. Kiểm tra lại quyền và review trong dashboard trước khi nộp.

## Mô tả cho reviewer (English draft)

> Sơn CRM lets an authorized Page owner connect and select the Facebook Pages they manage. Authorized CRM staff view Page Messenger conversations and comments on Page posts, and manually send Messenger replies or reply to customer comments. The app also imports accessible Page conversation and comment history with Page-scoped IDs and original timestamps. For each Page, the app checks the granted token, permissions, Page tasks, source record and staff authorization before attempting an action. A reply is marked sent only after Meta accepts it and returns an ID. The app does not publish Page posts, delete comments, or send automated marketing messages through these permissions.

`pages_messaging`: CRM receives Messenger events, reads accessible history and lets authorized staff send a manual Page reply within Meta's messaging rules. A queued local job is not proof of delivery.

`pages_read_user_content`: CRM reads customer comments and replies on posts belonging to the selected Page, storing Page-scoped IDs, text, author data provided by Meta, timestamp and source references.

`pages_manage_engagement`: authorized staff manually reply to a specific customer comment. CRM checks source Page, granted permission and `MODERATE` task; it records the returned comment ID only after Graph accepts it.

## Video và bằng chứng trước khi nộp

1. Kiểm HTTPS CRM và riêng OAuth `/api/v1/integrations/oauth/facebook/callback`, webhook `/api/v1/webhooks/facebook` từ Internet; GET challenge, POST HMAC đúng/sai, OAuth redirect.
2. Chủ Page consent, xem danh sách, chọn ít nhất hai Page; quyền/token/subscription/health hiển thị riêng, không lộ token.
3. Tài khoản thử gửi tin mới vào từng Page; event vào đúng hộp thư, câu trả lời CRM được Meta chấp nhận và hiện trên đúng Messenger; echo không tạo trùng.
4. Tài khoản thử bình luận trên bài Page; bình luận vào CRM, reply CRM hiện trên Facebook. Chỉ quay khi grant comment thật đã có.
5. Che token, cookie, dữ liệu khách và thông tin đăng nhập. Giữ request ID, thời điểm, Page ID đã che, kết quả từng Page. Fixture không thay bằng chứng live.

## Điều kiện còn thiếu

- Privacy policy công khai được chủ dự án duyệt: tên đơn vị vận hành, email liên hệ công khai để nhận yêu cầu dữ liệu, chính sách lưu theo mục đích cho tin/bình luận/backup và nhóm nhân viên được xem. Prompt AMIS không quy định số ngày tự xóa; không công bố một thời hạn hoặc khả năng xóa/xuất tự động khi chưa được chốt và kiểm thử. Không tự điền thông tin pháp lý.
- Hostname HTTPS `crm.nguyenhongson.vn` đã kiểm từ Internet. Webhook dự kiến `https://crm.nguyenhongson.vn/api/v1/webhooks/facebook`; OAuth riêng `https://crm.nguyenhongson.vn/api/v1/integrations/oauth/facebook/callback`. Còn cần App Secret trên VPS, POST HMAC hợp lệ, OAuth consent/token exchange và phương án quay lui từng callback trước khi trình thay đổi dashboard. Chủ dự án chọn giữ cấu hình Meta hiện tại.
- App publication/Advanced Access theo dashboard thực tế, grant comment, hai Page do chủ dự án quản lý, tài khoản thử và video live. Chưa nộp App Review.

Nguồn chính thức: [Meta permissions](https://developers.facebook.com/docs/permissions/reference/), [Messenger Platform API](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api).
