# PRD — CRM bán sỉ và bán lẻ

Trạng thái: đặc tả đang triển khai — Đợt 01–03 đã có code và nghiệm thu local
Nguồn: `ke-hoach-vibe-code-crm.md` phiên bản 1.0, ngày 30/09/2026

## 1. Bài toán

Chủ cửa hàng cần một luồng thống nhất để biết khách nào cần trả lời, đơn nào cần giao, hàng nào còn bán được, tiền nào đã nhận và ai đang nợ. Người dùng chính là em gái anh Sơn; cửa hàng bán sỉ và bán lẻ, ưu tiên nguồn khách Facebook và Zalo.

Đã có mã nguồn nền tảng, module khách hàng và danh mục sản phẩm/SKU dùng PostgreSQL thật trong môi trường local. Chưa có dữ liệu vận hành thật hoặc connector đã kiểm chứng; mọi nội dung về kênh bên ngoài vẫn là mục tiêu/điều kiện thử, không phải chức năng đã hoạt động.

## 2. Kết quả mong muốn

### Bản nội bộ đầu tiên — sau Đợt 08

- Quản lý khách và nhiều địa chỉ, nhóm sỉ/lẻ, nhắc việc.
- Quản lý sản phẩm, SKU, đơn vị và quy đổi.
- Nhập hàng, tồn đầu kỳ, sổ kho, giữ/xuất/điều chỉnh có chứng từ.
- Bảng giá, bậc số lượng, báo giá và phiên bản giá đã chốt.
- Xử lý trọn một đơn sỉ và một đơn lẻ, kể cả giao một phần.
- Thu nhiều lần, đặt cọc, công nợ, trả thừa, đổi trả và báo cáo cơ bản.
- Nhập nguồn đơn thủ công khi connector chưa đủ quyền.

### Các bản sau

- Đợt 09–10: hộp thư đa kênh và AI gợi ý có người duyệt.
- Đợt 11–12: khách đặt lại, OTP, thanh toán online và một hãng giao hàng.
- Đợt 13–15: từng sàn ưu tiên, marketing, API đối tác và phân tích nâng cao.

## 3. Người dùng và quyền cấp cao

| Người dùng              | Mục tiêu                                               | Ranh giới                                                             |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Chủ cửa hàng            | Kiểm soát toàn bộ vận hành, cấu hình và duyệt ngoại lệ | Hành động quan trọng vẫn có audit log                                 |
| Nhân viên bán hàng      | Khách, hội thoại, báo giá, đơn                         | Không mặc định xem giá vốn, điều chỉnh kho hoặc xuất khách            |
| Nhân viên kho           | Nhận, giữ, xuất, kiểm kê                               | Không tự sửa giá bán hoặc ghi nhận tiền                               |
| Người theo dõi thu chi  | Thu/chi, phân bổ, công nợ, đối soát                    | Không tự xác nhận/xuất đơn nếu chưa có quyền                          |
| Khách hàng (sau Đợt 11) | Xem và đặt lại dữ liệu của mình                        | Không xem giá sỉ/công nợ khi chưa được cấp; không truy cập khách khác |

Một nhân viên có thể giữ nhiều vai trò. Backend phải kiểm tra quyền hành động và quyền trên bản ghi; ẩn nút ở UI không được xem là kiểm soát quyền.

## 4. Yêu cầu trải nghiệm

- Giao diện tiếng Việt, ưu tiên thao tác điện thoại, định dạng VND và ngày nhất quán.
- Tìm nhanh theo tên, số điện thoại, mã khách, SKU và mã đơn.
- Mọi màn hình có trạng thái tải, trống, lỗi và thông báo hành động rõ ràng.
- Nút ảnh hưởng kho/tiền phải cho biết hậu quả và chống bấm/gửi lại tạo trùng.
- Màn hình tổng hợp phải truy ngược được chứng từ tạo ra số liệu.
- Prototype Đợt 00 phải được người dùng chính thử trước khi khóa luồng nhập liệu.

## 5. Yêu cầu phi chức năng

- Một backend module hóa, một PostgreSQL giao dịch; chưa tách microservices.
- API REST có phiên bản `/api/v1` và OpenAPI; website/CRM dùng cùng quy tắc.
- Thời điểm lưu UTC; báo cáo theo ngày `Asia/Ho_Chi_Minh`.
- Tiền VND lưu số nguyên; số lượng dùng Decimal khi đơn vị/ngành hàng yêu cầu.
- Hành động kho, tiền, quyền và connector có audit log; log không chứa bí mật.
- Có local, staging và production tách biệt; backup cả database và file, có bài thử phục hồi.
- Webhook/job có khóa chống trùng, retry an toàn và hàng đợi lỗi quan sát được.

## 6. Yêu cầu đã xác nhận, giả định và phần mở

### Đã có trong kế hoạch

- VND; múi giờ nghiệp vụ Việt Nam; dữ liệu thời điểm lưu UTC.
- Hỗ trợ sỉ/lẻ và nhiều đơn vị; một đơn vị kinh doanh, một kho ban đầu.
- Báo giá không giữ hàng mặc định; đơn xác nhận mới giữ hàng.
- Nhập vận đơn thủ công ở bản nội bộ đầu tiên.
- AI chỉ gợi ý để người dùng duyệt; không tự tạo chứng từ tiền/kho hay cấp nợ.

### Giả định tạm dùng, chưa phải quyết định chạy thật

- Một chủ cửa hàng, có thể thêm nhân viên.
- Hàng có sẵn; chưa xử lý sản xuất/gia công/đặt trước.
- Giá vốn bình quân gia quyền; Facebook Fanpage và Zalo OA là tuyến tích hợp dự kiến.
- Giá sỉ theo nhóm khách, có thể thêm bậc số lượng.

### Cần xác nhận

Chỉ giữ 5 quyết định chặn Đợt 01–06 tại `docs/DECISIONS.md`: `OPEN-01` đến `OPEN-05`. Các câu hỏi không chặn được để trong backlog của đợt liên quan, không tự biến thành quy tắc chạy thật.

## 7. Ngoài phạm vi hiện tại

- Kế toán pháp định/hóa đơn điện tử khi chưa rõ mô hình pháp nhân và nhà cung cấp.
- Sản xuất, gia công, cân nặng, lô/hạn dùng/serial nếu `OPEN-02` chưa yêu cầu.
- Tự động gửi tin, tự đổi giá/chính sách, tự cấp nợ.
- Website, AI nâng cao, Shopee, TikTok Shop, marketing và production deployment trong Đợt 00.
- Cam kết connector khi chưa có tài khoản thử, quyền được cấp và bằng chứng API thật.

## 8. Thước đo

Đo đường cơ sở trước pilot, sau đó theo dõi: thời gian từ tiếp nhận đến xác nhận đơn; số lần nhập lại; hội thoại bỏ sót; chênh kiểm kê; đơn thiếu hàng; nợ quá hạn; COD chưa đối soát; lỗi job; và kết quả bài thử phục hồi. Không đặt con số mục tiêu tùy ý khi chưa có dữ liệu gốc.
