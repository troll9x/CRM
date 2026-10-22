# Chính sách quyền riêng tư Sơn CRM — bản nháp cần chủ dự án xác nhận

**Cập nhật 2026-10-22:** chủ dự án đã chốt tên công khai Sơn CRM, email `sonnh.mkt@gmail.com`, giữ lịch sử chat/bình luận lâu dài trong thời gian phục vụ khách. Nội dung dùng để công bố được thực hiện ở `apps/web/app/privacy/page.tsx` và hướng dẫn xóa ở `apps/web/app/data-deletion/page.tsx`. Phần bên dưới là bản nháp lịch sử, gồm các placeholder không còn dùng để nộp Meta. Quy trình xóa/xuất thủ công và backup vẫn cần kiểm chứng vận hành; không tuyên bố đã tự động hóa.

**Chưa công bố và chưa dùng URL này để nộp Meta App Review.** Các trường `[CẦN XÁC NHẬN]` là thông tin vận hành/pháp lý chưa được chủ dự án cung cấp; không được tự thay bằng dữ liệu giả.

Đơn vị vận hành: **[CẦN XÁC NHẬN: tên pháp lý và địa chỉ liên hệ]**. Email liên hệ công khai để khách/chủ Page gửi câu hỏi hoặc yêu cầu về dữ liệu: **[CẦN XÁC NHẬN: email do đơn vị vận hành kiểm soát]**. Đây có thể là email hỗ trợ hiện có, không phải email dùng nhận webhook, token hay tin Messenger. Ngày hiệu lực: **[CẦN XÁC NHẬN]**.

## Dữ liệu và mục đích

Khi chủ Page/OA/shop kết nối tài khoản được quản lý, CRM lưu ID tài khoản kênh, tên hiển thị, quyền, trạng thái kết nối, subscription và token truy cập được mã hóa. CRM nhận và lưu các tin nhắn, bình luận, tác giả/ID ngoài, thời điểm, nguồn Page và nội dung cần thiết để nhân viên trả lời khách. CRM có thể nhập lịch sử trong phạm vi API của nhà cung cấp cho phép. Tin nhắn có thể lưu metadata đường dẫn tệp do nhà cung cấp trả về; hiện chưa có kho ảnh/tệp social riêng được kiểm chứng. Với thao tác gửi thủ công, CRM lưu yêu cầu gửi, trạng thái, lỗi và ID phản hồi do nhà cung cấp trả về. Nhân viên được cấp quyền có thể liên kết danh tính kênh với hồ sơ khách, tạo ticket hoặc báo giá từ nguồn chat; việc này không tự biến chat thành đơn bán, doanh thu hay chuyển kho.

Mục đích là chăm sóc khách hàng, trả lời Messenger/bình luận, theo dõi công việc và hỗ trợ báo giá/đơn của đơn vị vận hành. CRM không dùng dữ liệu này để bán cho bên thứ ba. Tin gửi đi được chuyển tới nhà cung cấp kênh tương ứng để thực hiện yêu cầu của nhân viên; nhà cung cấp xử lý theo chính sách riêng của họ.

## Quyền truy cập và bảo mật

Chủ đơn vị và nhân viên được cấp quyền CRM có thể xem dữ liệu theo vai trò. Backend có bảng cấp quyền xem/gửi theo từng Page/OA/shop; quản trị viên cấp/thu hồi quyền và nhân viên thiếu quyền không đọc được hộp thư hoặc gửi trên tài khoản đó. **[CẦN XÁC NHẬN: ai được xem/gửi trên từng Page trong vận hành thực tế.]** Token được mã hóa khi lưu; không đưa token vào frontend hoặc tài liệu. Hoạt động quan trọng có audit log. Quyền này đã có kiểm thử DB scratch, chưa nghiệm thu trên DB vận hành.

## Thời gian lưu, xóa và xuất dữ liệu

"Thời gian lưu" ở đây là thời gian **bản sao trong CRM và bản sao lưu của CRM** còn tồn tại, không phải thời gian Meta giữ cuộc trò chuyện trên Facebook. Prompt tham chiếu AMIS yêu cầu giữ lịch sử có nguồn thật và thiết kế retention/backup, nhưng không ấn định số ngày hay yêu cầu tự xóa lịch sử chat. Code hiện tại chưa có tác vụ tự xóa tin/bình luận theo tuổi; vì thế không được công bố một thời hạn xóa mà hệ thống chưa thực hiện được.

**[CẦN XÁC NHẬN: chính sách lưu theo mục đích cho tin/bình luận và metadata tệp; thời điểm kết thúc quan hệ chăm sóc hoặc đóng hồ sơ; cách xử lý token khi ngắt Page; thời gian giữ log và bản sao lưu; ngoại lệ khi cần giữ chứng từ/giải quyết tranh chấp.]** Có thể chọn giữ lịch sử phục vụ chăm sóc khách hàng lâu dài, không tự xóa theo số ngày cố định, nếu thông báo rõ mục đích và có quy trình xem xét/xóa khi mục đích kết thúc hoặc có yêu cầu hợp lệ. Không ghi "lưu vĩnh viễn" khi chưa có quyết định và quy trình xử lý yêu cầu dữ liệu.

Người có dữ liệu trong CRM có thể gửi yêu cầu xem, xuất, sửa hoặc xóa tới email liên hệ công khai phía trên. Đơn vị vận hành xác minh người yêu cầu, đánh giá phạm vi dữ liệu và nghĩa vụ lưu giữ liên quan, rồi phản hồi/xử lý theo quy trình **[CẦN XÁC NHẬN: người phụ trách, thời hạn và thao tác kỹ thuật xóa/xuất đã kiểm thử]**. CRM hiện chưa có luồng tự phục vụ để người gửi tin tự xuất/xóa; không hứa thao tác tự động trong chính sách. Ngắt Page ngừng sử dụng token trong CRM, nhưng không đồng nghĩa xóa toàn bộ lịch sử hoặc gỡ subscription phía nhà cung cấp; các thao tác này cần quy trình riêng.

## Thay đổi và liên hệ

Khi chính sách thay đổi, ngày hiệu lực và nội dung cập nhật sẽ được công bố tại URL chính sách. Mọi câu hỏi hoặc yêu cầu về dữ liệu gửi tới email liên hệ đã xác nhận phía trên.

Chỉ xuất bản sau khi chủ dự án chốt các trường còn thiếu, kiểm thử quy trình xóa/xuất thực tế và có hostname HTTPS công khai ổn định.
