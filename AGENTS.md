# Hướng dẫn làm việc trong repo

Đọc `docs/PRD.md`, `docs/BUSINESS_RULES.md`, `docs/DATA_MODEL.md`, `docs/API_CONTRACT.md`, `docs/DECISIONS.md` và nhiệm vụ hiện tại trước khi sửa.

## Nguyên tắc bắt buộc

- Chỉ triển khai phạm vi nhiệm vụ. Giữ stack, phiên bản và hợp đồng API đã chốt.
- Không tự nâng dependency, đổi framework hoặc thay toàn bộ schema.
- Đưa quy tắc giá, kho, tiền và quyền vào backend; không tin tổng tiền hoặc quyền do frontend gửi lên.
- Nghiệp vụ ảnh hưởng kho/tiền phải có giao dịch dữ liệu, kiểm soát cạnh tranh và chống xử lý trùng.
- Không dùng dữ liệu giả hoặc nút giả để báo hoàn thành một chức năng thật. Prototype phải luôn ghi rõ là dữ liệu mẫu.
- Mock connector phải ghi rõ là mock. Chưa gọi API thật bằng tài khoản thử và chưa lưu bằng chứng thì chưa có tích hợp thật.
- Không ghi secret, access token, OTP hoặc dữ liệu nhạy cảm không cần thiết vào code, frontend, log hay tài liệu.
- Không xóa dữ liệu thật hoặc chạy migration phá dữ liệu khi chưa có quy trình được duyệt và bản sao lưu đã thử phục hồi.
- Mọi thời điểm lưu UTC; ngày nghiệp vụ và báo cáo dùng `Asia/Ho_Chi_Minh`; tiền VND không dùng số thực JavaScript không kiểm soát.
- Kiểm tra cả quyền hành động và quyền trên từng bản ghi ở backend.
- Cập nhật đặc tả, hợp đồng API, acceptance và backlog khi một thay đổi nghiệp vụ được chấp nhận.

## Cách hoàn thành một lát cắt

1. Ghi rõ dữ liệu vào/ra, vai trò, lỗi, bất biến và tiêu chí nghiệm thu.
2. Thực hiện migration, backend và UI đủ để luồng dùng dữ liệu lưu thật.
3. Chạy kiểm tra nghiệp vụ, quyền, chống trùng, typecheck, lint và build phù hợp phạm vi.
4. Xem diff, cập nhật tài liệu và hướng dẫn demo.
5. Báo chính xác: thay đổi, cách chạy, bằng chứng kiểm tra, phần chưa xác minh và rủi ro còn lại.

## Ranh giới hiện tại

Repo hiện có code cho Đợt 01–05A; không coi mô tả prototype Đợt 00 là trạng thái CRM hiện tại. 04C-B đã qua migration/E2E local; còn chờ kiểm tra UI trực quan và xác nhận BR-STOCK-10 trước khi dùng dữ liệu vận hành. 05A chỉ lưu giá admin theo SKU/bậc và báo trạng thái khi thiếu giá; giá bậc trống chưa được tính thành tiền.

Chỉ tiếp tục phạm vi đã được giao. Không tự đặt công thức giá tự tính, giá lẻ, chính sách giảm thêm, duyệt đơn hoặc thời hạn báo giá đang mở ở OPEN-03. Các module đơn bán, công nợ, website và connector chỉ triển khai khi có nhiệm vụ cụ thể cùng các quyết định nghiệp vụ liên quan. Không deploy production hoặc tích hợp API thật nếu chưa được giao và chưa có bằng chứng kiểm thử.
