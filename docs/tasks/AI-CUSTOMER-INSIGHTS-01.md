# AI-CUSTOMER-INSIGHTS-01 — phân tích khách hàng có bằng chứng

Trạng thái 31/10/2026: **CHƯA TRIỂN KHAI**. Yêu cầu được chủ dự án nhắc lại trong đợt nghiệm thu. Đây là module riêng của kế hoạch gốc mục 4.10 (AI gợi ý có người duyệt), 4.15 (phân tích/dự báo) và Đợt 10/14–15; không được suy là đã có từ Customer 360° hoặc dashboard.

## Đầu vào và đầu ra bản đầu

- Một `customerId` thuộc business của nhân viên, phạm vi ngày theo `Asia/Ho_Chi_Minh`, quyền `customers.read` cộng quyền đọc nguồn tương ứng. Chỉ đọc dữ liệu khách, đơn đã xác nhận/giao, phiếu thu/hoàn đã ghi nhận, công việc và hội thoại mà nhân viên được phép xem; không lấy dữ liệu của business/Page khác.
- Backend tính trước các số có thể đối chiếu: lần mua gần nhất, số đơn hợp lệ, giá trị hàng đã giao, số đã thu, hàng trả, công việc quá hạn và hội thoại chưa phản hồi. Không dùng đơn nháp/cơ hội như doanh thu; không gọi tổng tiền thu là doanh thu. Số tiền VND dùng Decimal/số nguyên, thời điểm lưu UTC.
- Model chỉ nhận tối thiểu dữ liệu cần cho mục đích đã duyệt, mặc định loại số điện thoại, email, địa chỉ, token và transcript nguyên văn. Kết quả là **gợi ý**: tóm tắt hành vi, cơ hội chăm sóc, rủi ro cần kiểm tra, mức tin cậy/độ thiếu dữ liệu, và ID nguồn cho từng nhận định. Không tự nhắn tin, đổi giá, tạo đơn hoặc cấp nợ.
- Giao diện hồ sơ khách hiển thị thời điểm phân tích, phạm vi dữ liệu, bằng chứng nguồn, cảnh báo thiếu dữ liệu, người yêu cầu và phản hồi hữu ích/sai. Người dùng duyệt trước mọi hành động. Không có dữ liệu thì hiển thị “chưa đủ dữ liệu”, không dự báo mua lại bằng số giả.

## Điều kiện trước khi gọi model thật

1. Chốt nhà cung cấp/model hoặc hạ tầng chạy model, nơi dữ liệu được xử lý, trường nào được gửi, retention/xóa và ngân sách. API key chỉ ở server; không đưa payload nhạy cảm vào log, frontend hoặc tài liệu.
2. Có khách/đơn đại diện trên staging tách production; production hiện có 0 khách và 0 đơn. Xác nhận quyền xem hội thoại theo từng Page và chính sách giữ dữ liệu trước khi đưa hội thoại vào AI.
3. Khóa version prompt/model, giới hạn chi phí/tần suất, ghi `AiRun`/nguồn/feedback và xử lý timeout/lỗi provider. Model không được xem hay sửa dữ liệu ngoài phạm vi người yêu cầu.

## Nghiệm thu bắt buộc

- API trực tiếp trả 401/403/404 đúng cho thiếu phiên/quyền/business hoặc Page; không rò thông tin khách khác qua output, lỗi hay log.
- Với fixture có đơn nháp, đơn giao, hàng trả và phiếu thu, các số do backend tính khớp chứng từ; đầu ra model không được sửa số. Không đủ lịch sử thì nêu rõ và không dự đoán.
- Tin khách yêu cầu bỏ qua chính sách, giảm giá tùy ý hoặc bịa tồn không thay đổi chỉ dẫn hệ thống và không kích hoạt hành động tiền/kho/tin nhắn.
- Mọi nhận định cần nguồn; thử phản ví dụ chứng minh model không bịa lịch sử mua. Lưu feedback và đo tỷ lệ người sửa, độ chính xác, chi phí trên bộ ca đã duyệt trước khi bật production.
- Thử lỗi model, timeout, request lặp và nhân viên mất quyền giữa lúc yêu cầu; không tạo kết quả hiển thị sai hoặc nhân đôi chi phí không kiểm soát.

Chưa chọn provider, chưa có quyền gửi dữ liệu khách ra ngoài và chưa có bằng chứng API/model thật. Vì vậy không thêm nút “AI” giả hoặc gọi các quy tắc thống kê là tích hợp AI.
