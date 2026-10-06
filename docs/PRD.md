# PRD — CRM bán sỉ và bán lẻ

Trạng thái: 05A và backend/UI cơ bản 05B đã qua kiểm tra local; 05B còn chờ kiểm tra trực quan trên browser, 05C chưa triển khai. Thuế báo giá hỗ trợ nhập theo phần trăm hoặc VND trên toàn báo giá. Tạm dùng: một cách thuế trên mỗi báo giá; phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc. Quy ước này chỉ phục vụ báo giá nội bộ, cần chủ dự án xác nhận trước vận hành. 04C-B còn chờ UI trực quan và xác nhận BR-STOCK-10 trước vận hành thật.
Nguồn: `ke-hoach-vibe-code-crm.md` phiên bản 1.0, ngày 30/09/2026

## 1. Bài toán

Chủ cửa hàng cần một luồng thống nhất để biết khách nào cần trả lời, đơn nào cần giao, hàng nào còn bán được, tiền nào đã nhận và ai đang nợ. Người dùng chính là em gái anh Sơn; cửa hàng bán sỉ và bán lẻ, ưu tiên nguồn khách Facebook và Zalo.

Đã có mã nguồn nền tảng, module khách hàng, danh mục sản phẩm/SKU, nhà cung cấp, đơn mua và nhận hàng/tồn kho dùng PostgreSQL thật trong môi trường local. Đơn mua không tăng tồn; phiếu nhận đã ghi tồn, giá vốn bình quân và sổ kho trong một giao dịch. Chưa có dữ liệu vận hành thật hoặc connector đã kiểm chứng; mọi nội dung về kênh bên ngoài vẫn là mục tiêu/điều kiện thử, không phải chức năng đã hoạt động.

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
- Facebook Fanpage và Zalo OA là tuyến tích hợp dự kiến.
- Bảng giá dùng chung; mỗi SKU có một đơn vị bán cố định do admin chọn, admin nhập giá lẻ và giá bậc theo đơn vị đó. Cho phép số lượng lẻ; từ lượng 5 trở lên bậc giá tăng mỗi 5 đơn vị bán. Thiếu giá không tự tính.

### Đợt 05 — phần đã xác nhận ngày 2026-10-05, cập nhật 2026-10-06

- Giá đơn tính theo đơn vị bán đã cấu hình (ví dụ gói, kg hoặc thùng 10kg), không mặc định tính theo từng món lẻ.
- Số lượng lẻ tối đa 6 chữ số thập phân; thành tiền làm tròn từng dòng về VND nguyên, nửa đồng làm tròn lên.
- Giảm giá thêm theo phần trăm hoặc VND, áp dụng theo dòng hoặc toàn báo giá; giới hạn phụ thuộc quyền quản lý.
- Báo giá gồm phí giao, giảm giá, thuế nhập theo phần trăm hoặc VND toàn báo giá, cọc dự kiến và ghi chú thanh toán. Tạm dùng một cách thuế trên mỗi báo giá; phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc. Đây là giả định cần xác nhận trước vận hành. Chuyển báo giá còn hạn sang đơn nháp giữ giá đã chốt.
- Báo giá hết hạn sau 72 giờ từ lúc khách nhận; bước đầu gửi bằng PDF/in/chia sẻ thủ công và ghi nhận lúc khách nhận. Gửi tự động qua kênh cần tài khoản thử.
- Khi khách đặt hàng qua nền tảng, cần thông báo Admin. Người có `price.edit` tự đặt mức giảm không có trần số riêng.

### Cần xác nhận

Chỉ giữ 5 quyết định chặn Đợt 01–06 tại `docs/DECISIONS.md`: `OPEN-01` đến `OPEN-05`. Các câu hỏi không chặn được để trong backlog của đợt liên quan, không tự biến thành quy tắc chạy thật.

## 7. Ngoài phạm vi hiện tại

- Kế toán pháp định/hóa đơn điện tử khi chưa rõ mô hình pháp nhân và nhà cung cấp.
- Sản xuất, gia công, cân nặng, lô/hạn dùng/serial; cần xác nhận nhu cầu ngành hàng thật qua `OPEN-02` trước pilot.
- Tự động gửi tin, tự đổi giá/chính sách, tự cấp nợ.
- Website, AI nâng cao, Shopee, TikTok Shop, marketing và production deployment trong Đợt 00.
- Cam kết connector khi chưa có tài khoản thử, quyền được cấp và bằng chứng API thật.

## 8. Thước đo

Đo đường cơ sở trước pilot, sau đó theo dõi: thời gian từ tiếp nhận đến xác nhận đơn; số lần nhập lại; hội thoại bỏ sót; chênh kiểm kê; đơn thiếu hàng; nợ quá hạn; COD chưa đối soát; lỗi job; và kết quả bài thử phục hồi. Không đặt con số mục tiêu tùy ý khi chưa có dữ liệu gốc.
