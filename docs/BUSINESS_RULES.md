# Quy tắc nghiệp vụ

Trạng thái: code đã triển khai tới Đợt 05A; phần mở rộng giá 05A đang ở working tree và chờ xác minh migration bằng DB. Quy tắc 05B–C đã được chốt một phần; cách tính thuế còn chờ. Mỗi quy tắc có mã ổn định để API, test và audit cùng tham chiếu. Ký hiệu **Tạm dùng** nghĩa là chưa được chủ dự án xác nhận để chạy dữ liệu thật.

## 1. Khách hàng và quyền

- **BR-CUS-01:** Mỗi khách có `customer_id` nội bộ; định danh Facebook/Zalo/sàn là liên kết theo kênh và tài khoản kênh.
- **BR-CUS-02:** Số điện thoại/email chỉ dùng tìm kiếm và gợi ý trùng. Trùng tên hoặc số không tự chứng minh hai hồ sơ là một người.
- **BR-CUS-03:** Gộp khách cần người có quyền, bằng chứng, bản ghi sống sót và audit; hội thoại, đơn, địa chỉ và lịch sử không được mất.
- **BR-CUS-04:** Cơ hội bán, trạng thái hội thoại, nhóm sỉ/lẻ và mua lần đầu/mua lại là các khái niệm riêng.
- **BR-AUTH-01:** Backend kiểm tra cả quyền hành động và phạm vi bản ghi; khách/nhân viên không thể đổi ID trên URL/API để đọc bản ghi ngoài quyền.
- **BR-AUTH-02:** Các quyền nhạy cảm tách riêng: xem giá vốn, sửa giá, xác nhận đơn, điều chỉnh kho, thu/chi, xem công nợ, xuất khách và cấu hình connector.

## 2. Tiền, giá và ảnh chụp chứng từ

- **BR-MON-01:** Tiền VND dùng số nguyên đồng. Không dùng `number` JavaScript để tính tiền nếu phép tính có thể tạo sai số.
- **BR-MON-02:** Tổng đơn, giảm giá, phí và thuế (nếu có sau này) do backend tính; tổng frontend gửi lên chỉ là dữ liệu hiển thị, không phải nguồn sự thật.
- **BR-PRICE-01 — OPEN-03 chốt một phần:** Bảng giá dùng chung cho khách. Mỗi SKU có một đơn vị bán cố định do admin cấu hình (gói, kg, thùng...). Giá admin nhập theo đơn vị bán này. Lượng dưới 5 dùng giá lẻ theo đơn vị bán; từ 5 trở lên, bậc 5–<10 dùng giá bậc 5, 10–<15 dùng bậc 10, 15–<20 dùng bậc 15 và tiếp tục mỗi 5 đơn vị bán; với lượng lẻ, bậc được xác định bằng `floor(quantity / 5) * 5`. Giá lẻ và mọi bậc đều do admin nhập; không tự suy đoán giá còn thiếu.
- **BR-PRICE-02 — OPEN-03 chốt một phần:** Cho phép giảm thêm theo phần trăm hoặc số VND, áp dụng ở dòng hàng hoặc toàn báo giá. Backend chỉ cho người có quyền quản lý (`price.edit`) đặt mức giảm; không áp trần số riêng. Thuế còn chờ chốt cách nhập/tính.
- **BR-PRICE-03:** Cho phép số lượng lẻ tối đa 6 chữ số thập phân theo đơn vị bán. Đơn giá là VND nguyên; backend tính bằng số thập phân chính xác và làm tròn thành tiền từng dòng về VND nguyên, nửa đồng làm tròn lên.
- **BR-QUOTE-03:** Báo giá hết hạn sau đúng 72 giờ từ lúc khách nhận. Khi gửi bằng PDF/chia sẻ thủ công, nhân viên ghi nhận thời điểm khách xác nhận đã nhận; timestamp lưu UTC.
- **BR-QUOTE-04:** Báo giá hỗ trợ phí giao, giảm giá, thuế, tiền cọc dự kiến và ghi chú thanh toán; các khoản là snapshot của báo giá. Cách nhập/tính thuế còn chờ xác nhận. Chuyển báo giá còn hạn thành đơn nháp giữ nguyên giá đã chốt.
- **BR-QUOTE-05:** Khi khách đặt qua nền tảng, hệ thống cần thông báo Admin. Kênh và cơ chế thông báo cụ thể được chốt theo phạm vi tích hợp; không tuyên bố gửi thật khi chưa thử bằng tài khoản/quyền thật.
- **BR-SNAP-01:** Báo giá/đơn lưu snapshot tên hàng, SKU, đơn vị, hệ số quy đổi, giá, giảm giá, địa chỉ và điều kiện tại thời điểm chốt.
- **BR-SNAP-02:** Đổi danh mục, địa chỉ, quy đổi hoặc bảng giá không làm thay đổi chứng từ cũ.

## 3. Đơn vị và kho

- **BR-CAT-01:** SKU là duy nhất trong một đơn vị kinh doanh; SKU/sản phẩm đã có lịch sử được ngừng bán thay vì xóa.
- **BR-CAT-02:** Barcode nếu có là duy nhất trong một đơn vị kinh doanh; thuộc tính biến thể là metadata, không thay thế SKU nội bộ.
- **BR-UOM-01:** Mỗi SKU có một đơn vị cơ sở. Biến động kho quy về đơn vị cơ sở và lưu hệ số tại thời điểm giao dịch.
- **BR-UOM-02:** Không đổi/xóa quy đổi đã được chứng từ tham chiếu; tạo phiên bản/hiệu lực mới.
- **BR-UOM-03:** Đơn vị gốc luôn có hệ số 1; quy đổi khác phải có mã riêng và hệ số dương. Đợt 03 cho thay danh sách vì chưa có chứng từ tham chiếu; từ Đợt 04 trở đi phải áp dụng `BR-UOM-02`.
- **BR-STOCK-01:** `có thể bán = thực tế - giữ hàng - không đủ điều kiện bán`; ba đại lượng được theo dõi riêng.
- **BR-STOCK-02:** Mọi nhận, xuất, trả và điều chỉnh phải có chứng từ và dòng sổ kho bất biến; không sửa thẳng số tồn thay cho chứng từ.
- **BR-STOCK-03:** Tạo đơn mua không tăng tồn. Chỉ phiếu nhận thực tế tăng tồn; nhận nhiều đợt không vượt phần được phép nhận.
- **BR-PUR-01:** Đơn mua nháp lưu nhà cung cấp, SKU, đơn vị đặt và số lượng; backend lấy hệ số hiện hành rồi snapshot đơn vị, hệ số và số lượng cơ sở. Client không được gửi hệ số quy đổi.
- **BR-PUR-02:** Phát hành đơn mua khóa nội dung dòng; sửa lịch sử dùng chứng từ/transition phù hợp. Đơn mua nháp, phát hành hoặc hủy đều không tạo biến động tồn.
- **BR-STOCK-04:** Tồn đầu kỳ là một chứng từ có người tạo, thời điểm, số lượng và giá trị; import lại phải chống trùng.
- **BR-STOCK-04A — Tạm dùng:** Mỗi SKU/kho chỉ ghi tồn đầu khi chưa có balance hoặc biến động; chứng từ lưu snapshot SKU/tên/đơn vị, lượng đơn vị gốc và giá vốn nguyên VND. Cùng idempotency key và nội dung chỉ tạo một chứng từ; khác nội dung bị từ chối. Chưa dùng dữ liệu hàng thật trước khi xác nhận `OPEN-02/05`.
- **BR-STOCK-09:** Kiểm kê nhận số đếm thực tế và version tồn đã xem; backend tính chênh lệch với tồn hệ thống, từ chối nếu version cũ, không cho số tồn thấp hơn lượng đang giữ/không đủ điều kiện bán. Mỗi lần chênh lệch ghi chứng từ snapshot, movement và audit bất biến trong một transaction; không sửa trực tiếp balance.
- **BR-STOCK-10 — Tạm dùng chờ xác nhận:** Tăng tồn trên balance còn hàng dùng giá vốn bình quân hiện tại; giảm tồn định giá theo giá vốn bình quân hiện tại. Giá trị chênh lệch làm tròn về VND nguyên gần nhất; tồn về 0 có giá trị và giá vốn bình quân bằng 0. Tăng từ 0 cần giá vốn đơn vị được ghi rõ trên chứng từ.
- **BR-STOCK-05:** Xác nhận đơn kiểm tra hàng có thể bán và tạo giữ hàng trong cùng giao dịch có kiểm soát cạnh tranh.
- **BR-STOCK-06:** Xuất hàng giảm tồn thực tế và giảm giữ tương ứng trong cùng nghiệp vụ. Cùng idempotency key không tạo lần xuất thứ hai.
- **BR-STOCK-07:** Hủy đơn chỉ giải phóng phần chưa xuất. Phần đã giao phải qua trả hàng/điều chỉnh.
- **BR-STOCK-08:** Hàng trả/lỗi chỉ trở lại tồn có thể bán sau kiểm tra chất lượng.
- **BR-COST-01 — Tạm dùng:** Giá vốn bình quân gia quyền theo đơn vị cơ sở được cập nhật khi nhận hàng; giá vốn xuất được snapshot và không đổi theo chỉnh sửa danh mục sau đó.

## 4. Báo giá, đơn và giao hàng

- **BR-QUOTE-01:** Báo giá có trạng thái `DRAFT`, `SENT`, `ACCEPTED`, `EXPIRED`, `REJECTED`; gửi báo giá tạo phiên bản bất biến.
- **BR-QUOTE-02 — Tạm dùng:** Báo giá không giữ hàng. Chuyển thành đơn phải kiểm tra lại giá, hiệu lực, quyền và tồn.
- **BR-ORDER-01:** Đơn có trạng thái vòng đời riêng với trạng thái giao và thanh toán; không suy ra tất cả từ một trường.
- **BR-ORDER-02:** Xác nhận đơn kiểm tra giá, quyền mua nợ, tồn và snapshot; thao tác lặp chỉ tạo một reservation/event.
- **BR-ORDER-03:** Dòng đã giao/đã ghi nhận tiền không sửa làm đổi lịch sử; sửa bằng chứng từ trả/điều chỉnh có liên kết.
- **BR-SHIP-01:** Một đơn có thể giao nhiều lần. Giao một phần không tự hoàn tất phần còn lại.
- **BR-SHIP-02:** Mã đơn nội bộ tách khỏi mã kênh; trạng thái kênh tách khỏi trạng thái nội bộ.
- **BR-COD-01:** Đã giao không có nghĩa COD đã về; COD chỉ được ghi nhận tiền qua đối soát/giao dịch hợp lệ.

## 5. Thu tiền và công nợ

- **BR-PAY-01:** Một đơn có nhiều khoản thu; một khoản thu có thể phân bổ nhiều chứng từ.
- **BR-PAY-02:** Không ghi đè “đã nhận”. Mỗi thu/hoàn/đảo là giao dịch có lịch sử và khóa chống trùng.
- **BR-PAY-03:** Đặt cọc và tiền trả thừa/tạm ứng theo dõi riêng, không tạo khoản phải thu âm.
- **BR-PAY-04:** Không xóa chứng từ đã ghi sổ để sửa sai; dùng đảo/điều chỉnh với quyền và audit.
- **BR-AR-01 — Tạm dùng cho bộ mẫu:** Phải thu phát sinh khi đơn được xác nhận; doanh thu hàng hóa ghi nhận theo phần đã giao. Quy tắc chạy thật phải được chốt trước Đợt 07.
- **BR-AR-02:** Mua nợ chỉ áp dụng cho khách được cấp quyền, trong hạn mức/kỳ hạn; vượt mức cần quy trình duyệt đã chốt.

## 6. Đổi trả, đồng bộ và AI

- **BR-RET-01:** Dòng trả liên kết dòng đã giao; tổng trả không vượt số đã giao trừ số đã trả trước đó.
- **BR-RET-02:** Tiền hoàn không vượt số đủ điều kiện hoàn; giảm nợ và hoàn tiền là hai tác động riêng được hạch toán rõ.
- **BR-SYNC-01:** Sự kiện ngoài có khóa duy nhất theo kênh + shop/tài khoản + mã sự kiện/đơn. Webhook trùng và retry phải an toàn.
- **BR-SYNC-02:** Sự kiện sai thứ tự không được làm lùi trạng thái; sự kiện không ánh xạ được vào hàng chờ xử lý, không tự trừ kho.
- **BR-SYNC-03:** Không suy ra quyền chat từ quyền đơn/sản phẩm; mỗi năng lực connector có bằng chứng riêng.
- **BR-AI-01:** AI chỉ tóm tắt/gợi ý/trích xuất/tạo nháp để người dùng duyệt; không tự cấp nợ, đổi chính sách, tạo chứng từ tiền/kho hoặc bịa giá/tồn.
- **BR-AI-02:** Khi thiếu biến thể/thông tin hoặc nguồn không chắc chắn, AI phải nêu thiếu và chuyển người; khi người tiếp quản, tự động trả lời dừng.

## 7. Thời gian, audit và bảo mật

- **BR-TIME-01:** Lưu timestamp UTC; ranh giới ngày báo cáo dùng `Asia/Ho_Chi_Minh`.
- **BR-AUDIT-01:** Audit lưu người/actor, thời điểm, hành động, loại/id bản ghi, request/idempotency key và thay đổi quan trọng; không lưu token/OTP.
- **BR-SEC-01:** Secret chỉ ở kho bí mật/biến môi trường phía server; không vào Git, bundle frontend hoặc log.
- **BR-SEC-02:** Phiên đăng xuất/khóa tài khoản phải mất hiệu lực theo cơ chế phiên đã chọn.

## 8. Bất biến dùng để kiểm tra

- Tồn thực tế, giữ và không đủ điều kiện bán không âm, trừ quy trình điều chỉnh ngoại lệ có quyền và cảnh báo rõ.
- Tổng số lượng giao/trả/giữ trên một dòng không vượt giới hạn hợp lệ của dòng đó.
- Tổng phân bổ của một khoản thu không vượt số tiền khoản thu; phần dư ở tài khoản tạm ứng/trả thừa.
- Một external key hoặc idempotency key chỉ có một kết quả nghiệp vụ thành công.
- Snapshot chứng từ đã chốt không đổi khi master data đổi.
- Báo cáo tổng hợp phải truy ngược được dòng chứng từ/sổ tạo số liệu.
