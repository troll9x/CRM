# PRD — CRM bán sỉ và bán lẻ

## Phạm vi bổ sung 09 — đa kênh (2026-10-08)

Lát cắt hộp thư social 2026-10-14: giao diện desktop ba vùng, điều hướng vùng trên màn hẹp và ticket nội bộ lưu DB từ chat/comment. Bộ lọc trên tối đa 100 bản ghi gần nhất mỗi loại hiện là bộ lọc dữ liệu đã tải; chưa có phân trang/count toàn bộ từ server. Gửi trả lời từ CRM chưa có API/provider permission được kiểm chứng nên không mở ô soạn.

Đã giao triển khai nền nhập dữ liệu inbound cho Facebook Page (Messenger + feed comments), Zalo OA messages, Shopee orders và TikTok Shop orders, cùng inbox/đơn ngoài và mapping CRM. Phạm vi này **không** tự tạo đơn bán, xuất/giữ hàng, thu tiền, công nợ hoặc ghi doanh thu. Tình trạng triển khai và dependency tài khoản nằm trong [`INTEGRATIONS_SETUP.md`](INTEGRATIONS_SETUP.md); chưa coi provider nào là kết nối thật nếu chưa có evidence từ tài khoản được cấp.

Trạng thái: 06A–06F (queue kho và migration deploy sạch), 07A/07B (gồm danh sách công nợ), 08A đổi trả/QA, 08B báo cáo gross theo hàng giao và backup/restore DB với dữ liệu order/stock/AR/return đại diện đã kiểm tra local. Đợt 09 có inbox/staging, Facebook Page webhook inbound và Zalo OA message webhook adapter local; chưa provider nào có account evidence. Còn Shopee/TikTok order pollers, Zalo comment API chưa xác minh, retention/security review, browser acceptance và cấu hình kênh. Các connector thật cần app/shop test account + scope được cấp; không có dữ liệu mẫu được dùng để báo tích hợp.

## Audit tham chiếu AMIS và Đợt A — hồ sơ khách 360° (2026-10-08)

Ma trận chức năng, phạm vi tham chiếu và phụ thuộc nằm tại [`AMIS_FEATURE_MATRIX.md`](AMIS_FEATURE_MATRIX.md). Đợt A dùng source record đã lưu trong Customer/Task/Opportunity/Quote/Order/PaymentReceipt; ghi chú nội bộ được lưu append-only. Timeline không tạo chỉ số “đã mua”/doanh thu từ đơn nháp, cơ hội hoặc phiếu thu. Hội thoại/bình luận/đơn staging chưa vào timeline khách khi thiếu dữ liệu provider thật và chính sách retention/visibility.
Nguồn: `ke-hoach-vibe-code-crm.md` phiên bản 1.0, ngày 30/09/2026

## 1. Bài toán

Chủ cửa hàng cần một luồng thống nhất để biết khách nào cần trả lời, đơn nào cần giao, hàng nào còn bán được, tiền nào đã nhận và ai đang nợ. Người dùng chính là em gái anh Sơn; cửa hàng bán sỉ và bán lẻ, ưu tiên nguồn khách Facebook và Zalo.

Đã có mã nguồn nền tảng, module khách hàng, danh mục sản phẩm/SKU, nhà cung cấp, đơn mua và nhận hàng/tồn kho dùng PostgreSQL thật trong môi trường local. Đơn mua không tăng tồn; phiếu nhận đã ghi tồn, giá vốn bình quân và sổ kho trong một giao dịch. Chưa có dữ liệu vận hành thật hoặc connector đã kiểm chứng; mọi nội dung về kênh bên ngoài vẫn là mục tiêu/điều kiện thử, không phải chức năng đã hoạt động.

## 2. Kết quả mong muốn

Đối với Facebook, người dùng cuối chỉ bấm kết nối trong CRM, đăng nhập/cấp quyền một lần với Meta và chọn Fanpage được cấp quyền nếu cần. Họ không tạo Meta Developer app, không nhập App ID/secret/callback/webhook. CRM/đơn vị triển khai thiết lập một app nền tảng ở phía server trước khi mở tính năng; hiện chưa có app thật nên chưa nghiệm thu kết nối Page.

### Bản nội bộ đầu tiên — sau Đợt 08

- Quản lý khách và nhiều địa chỉ, nhóm sỉ/lẻ, nhắc việc.
- Quản lý sản phẩm, SKU, đơn vị và quy đổi; nhập hàng loạt catalog từ file Excel Shopee qua xem trước/ánh xạ cột, không nhập giá hoặc tồn kho.
- Nhập hàng, tồn đầu kỳ, sổ kho, giữ/xuất/điều chỉnh có chứng từ.
- Bảng giá, bậc số lượng, báo giá và phiên bản giá đã chốt.
- Xử lý trọn một đơn sỉ và một đơn lẻ; theo chính sách ngày 2026-10-07, không giao thiếu, mỗi đơn giao đủ lượng còn lại trong một lần.
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
- Báo giá chưa được khách chấp nhận không giữ hàng; chấp nhận báo giá giữ tồn đủ cho đơn, không tự hết hạn, hủy đơn mới giải phóng (chủ dự án chốt 2026-10-07).
- Nhập vận đơn thủ công ở bản nội bộ đầu tiên.
- AI chỉ gợi ý để người dùng duyệt; không tự tạo chứng từ tiền/kho hay cấp nợ.

### Giả định tạm dùng, chưa phải quyết định chạy thật

- Một chủ cửa hàng, có thể thêm nhân viên.
- Hàng có sẵn; chưa xử lý sản xuất/gia công/đặt trước.
- Facebook được chọn làm kênh tích hợp đầu tiên; dự kiến Messenger của Fanpage. Page cụ thể, app developer, quyền và tài khoản thử chưa cung cấp/kiểm chứng; Zalo chưa được chọn cho thứ tự đầu.
- Bảng giá dùng chung; mỗi SKU có một đơn vị bán cố định do admin chọn, admin nhập giá lẻ và giá bậc theo đơn vị đó. Cho phép số lượng lẻ; từ lượng 5 trở lên bậc giá tăng mỗi 5 đơn vị bán. Thiếu giá không tự tính.

### Đợt 05 — phần đã xác nhận ngày 2026-10-05, cập nhật 2026-10-06

- Giá đơn tính theo đơn vị bán đã cấu hình (ví dụ gói, kg hoặc thùng 10kg), không mặc định tính theo từng món lẻ.
- Số lượng lẻ tối đa 6 chữ số thập phân; thành tiền làm tròn từng dòng về VND nguyên, nửa đồng làm tròn lên.
- Giảm giá thêm theo phần trăm hoặc VND, áp dụng theo dòng hoặc toàn báo giá; giới hạn phụ thuộc quyền quản lý.
- Báo giá gồm phí giao, giảm giá, thuế nhập theo phần trăm hoặc VND toàn báo giá, cọc dự kiến và ghi chú thanh toán. Dùng một cách thuế trên mỗi báo giá; phần trăm tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc; thứ tự này được chủ dự án xác nhận ngày 2026-10-07. Chuyển báo giá còn hạn sang đơn nháp giữ giá đã chốt.
- Báo giá hết hạn sau 72 giờ từ lúc khách nhận; bước đầu gửi bằng PDF/in/chia sẻ thủ công và ghi nhận lúc khách nhận. Gửi tự động qua kênh cần tài khoản thử.
- Khi khách đặt hàng qua nền tảng, cần thông báo Admin. Người có `price.edit` tự đặt mức giảm không có trần số riêng.
- Khách đến từ Facebook/Messenger hoặc Zalo được xếp nhóm sỉ; khách đến từ Shopee hoặc TikTok Shop được xếp nhóm lẻ. Backend là nguồn quyết định nhóm khi nguồn đã biết; nguồn khác vẫn cho phép nhập nhóm thủ công.

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

### Trạng thái triển khai 06–09 (08/10/2026)

Đã có luồng local cho đơn nháp, giữ/nhả hàng, thu đủ trước xác nhận, phiếu thu/phân bổ, dùng số dư khách vào đơn nháp, phải thu, giao đủ một lần và doanh thu hàng ghi nhận khi giao xong. Chưa hoàn tất màn hình tác nghiệp kho riêng, công nợ/chi phí/hoàn tiền, đổi trả/QA, báo cáo bán chạy/tháng và Facebook. COD tạm hoãn vì yêu cầu đối soát sau giao mâu thuẫn với quy tắc thu đủ trước xác nhận. Đây chưa phải trạng thái sẵn sàng production.
