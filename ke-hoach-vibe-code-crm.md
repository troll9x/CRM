# Kế hoạch xây dựng CRM bán sỉ và bán lẻ bằng công cụ AI

Ngày lập kế hoạch: 30 tháng 9 năm 2026. Phiên bản kế hoạch: 1.0.

## 1 Mục tiêu và phạm vi

Xây dựng một hệ thống để chủ cửa hàng quản lý hội thoại, khách hàng, báo giá, đơn hàng, kho, giao hàng, thu chi và công nợ trong một luồng thống nhất. Người dùng chính là em gái của anh Sơn, bán sỉ và bán lẻ, với Facebook và Zalo là các kênh ưu tiên. Hiện chưa có mã nguồn; kế hoạch này là đặc tả triển khai, không phải thông báo rằng các tích hợp đã hoạt động.

Mục tiêu bản đầu: xử lý trọn một đơn sỉ và một đơn lẻ; biết khách nào cần trả lời, đơn nào cần giao, hàng nào còn bán được, tiền nào đã nhận và ai đang nợ. Website mua lại, Shopee, TikTok Shop, marketing tự động và AI nâng cao được triển khai theo các đợt tiếp theo.

### 1.1 Giả định dùng để lập kế hoạch

- Một đơn vị kinh doanh, một kho ban đầu, một chủ cửa hàng và khả năng thêm nhân viên. Đây là giả định thiết kế, chưa phải thông tin đã được người dùng xác nhận.
- Tiền tệ VND, múi giờ nghiệp vụ Asia/Ho_Chi_Minh. Lưu thời điểm UTC; báo cáo theo ngày tại Việt Nam.
- Hàng có sẵn; hỗ trợ bán sỉ/lẻ và đơn vị cái/hộp/thùng khi cần. Hàng theo cân nặng, sản xuất, gia công và đặt trước cần đặc tả bổ sung.
- Chưa biết ngành hàng, số SKU, lượng đơn, kho dữ liệu cũ, số người dùng và ngân sách. Các mục phụ thuộc được ghi rõ trong kế hoạch.
- Đây là hệ thống theo dõi vận hành và tài chính bán hàng. Kết nối hóa đơn điện tử và yêu cầu kế toán cụ thể được xác định theo đơn vị kinh doanh trước khi triển khai chức năng tương ứng.

### 1.2 Các quyết định cần ghi vào đặc tả trước khi code nghiệp vụ

| Quyết định | Phương án tạm dùng | Thông tin cần xác nhận |
| --- | --- | --- |
| Facebook | Tích hợp Fanpage được cửa hàng quản lý | Fanpage hay tài khoản cá nhân, số Page |
| Zalo | Connector chính thức dành cho Zalo OA | Đang bán bằng Zalo cá nhân hay OA |
| Giá sỉ | Bảng giá theo nhóm khách; có thể thêm bậc số lượng | Giá theo từng SKU, tổng đơn, đại lý hay thương lượng |
| Mua nợ | Chỉ khách được chủ cửa hàng cấp quyền | Hạn mức, kỳ hạn, cách duyệt vượt hạn mức |
| Giữ hàng | Đơn được xác nhận mới giữ; đơn nháp không giữ | Có giữ khi báo giá, thời hạn giữ hàng |
| Giá vốn | Bình quân gia quyền khi nhận hàng để giảm độ phức tạp | Có nhu cầu FIFO, quản lý lô hoặc hạn dùng không |
| Website | Cho khách đặt lại, giá sỉ cần duyệt nhóm | Có mở cho khách mới và công khai giá không |
| Giao hàng | Nhập vận đơn thủ công trước, kết nối hãng vận chuyển sau | Hãng thường dùng, giao nhiều đợt, COD |
| AI | Gợi ý để người dùng duyệt | Phạm vi tự động được phép ở đợt sau |

Không dùng giả định để tự bật bán công nợ, gửi tin tự động hoặc thay đổi bảng giá khi chạy thật. Những lựa chọn này trở thành cấu hình hoặc quy tắc đã xác nhận.

## 2 Kiến trúc và công nghệ đề xuất

### 2.1 Kiến trúc

Một backend chia module rõ ràng, một cơ sở dữ liệu giao dịch trung tâm, các connector độc lập cho từng nền tảng. Website và CRM gọi cùng backend để dùng chung quy tắc về giá, tồn, đơn hàng và quyền truy cập. Chưa cần chia thành microservices.

| Thành phần | Lựa chọn đề xuất | Mục đích |
| --- | --- | --- |
| Giao diện CRM và website | Next.js, React, TypeScript | Một bộ công nghệ giao diện; phân vùng màn hình nhân viên và khách hàng |
| Backend nghiệp vụ | NestJS, TypeScript | Chia module khách hàng, giá, kho, đơn, tiền và tích hợp |
| Cơ sở dữ liệu | PostgreSQL | Giao dịch, ràng buộc dữ liệu và truy vấn báo cáo |
| Truy cập dữ liệu | Prisma | Schema, migration, truy vấn có kiểu; chọn phiên bản tương thích khi khởi tạo |
| Đồng bộ nền | BullMQ và Redis từ đợt tích hợp | Nhận webhook, gửi tin, thử lại tác vụ, nhắc việc |
| File ảnh và tài liệu | Kho lưu trữ đối tượng tương thích S3 | Không phụ thuộc ổ đĩa tạm của ứng dụng |
| API | REST có phiên bản, tài liệu OpenAPI | Dùng cho CRM, website và ứng dụng tương lai |
| Kiểm tra | Kiểm tra nghiệp vụ, tích hợp và luồng trình duyệt | Tập trung giá, kho, tiền, quyền và tích hợp |
| Môi trường | Local, staging, production; Git và CI | Kiểm tra trước khi đưa thay đổi vào dữ liệu thật |

Đây là đề xuất để chốt một stack thống nhất, không phải yêu cầu phải mua toàn bộ dịch vụ ngay. Chọn phiên bản ổn định tương thích, ghi rõ trong tài liệu quyết định và khóa bằng lockfile. Không để AI trộn ví dụ của nhiều phiên bản framework/ORM hoặc tự nâng cấp giữa các đợt.

### 2.2 Cấu trúc repo dự kiến

| Đường dẫn | Vai trò |
| --- | --- |
| apps/web | Giao diện CRM và khu vực khách hàng |
| apps/api | Backend và module nghiệp vụ |
| packages/contracts | Kiểu dữ liệu giao tiếp dùng chung; không đưa bí mật backend ra frontend |
| docs/PRD.md | Mục tiêu, người dùng và phạm vi từng bản |
| docs/BUSINESS_RULES.md | Quy tắc giá, kho, đơn, công nợ và báo cáo |
| docs/DATA_MODEL.md | Thực thể, quan hệ, ràng buộc và quyền sở hữu dữ liệu |
| docs/API_CONTRACT.md | Endpoint, dữ liệu, lỗi, quyền và chống xử lý trùng |
| docs/BACKLOG.md | Công việc theo thứ tự phụ thuộc và trạng thái |
| docs/ACCEPTANCE.md | Các tình huống nghiệm thu bằng dữ liệu mẫu |
| docs/DECISIONS.md | Các quyết định đã chốt và lý do |
| AGENTS.md | Hướng dẫn cho công cụ AI khi làm việc trong repo |

Worker đồng bộ có thể chạy thành tiến trình riêng từ cùng mã nguồn backend khi cần. Không nhân đôi logic đơn hàng hoặc kho trong worker và frontend.

## 3 Các quy tắc dữ liệu bắt buộc

| Chủ đề | Quy tắc cần triển khai |
| --- | --- |
| Định danh khách | customer_id nội bộ; liên kết định danh theo kênh và tài khoản kênh. Số điện thoại dùng để tìm kiếm/gợi ý, không tự động chứng minh hai hồ sơ là một người. |
| Trạng thái khách | Tách cơ hội bán hàng, trạng thái hội thoại, loại sỉ/lẻ và nhóm mua lần đầu/mua lại. |
| Tiền | Dùng số nguyên cho số tiền VND hoặc Decimal có quy tắc làm tròn. Không dùng số thực JavaScript để cộng/trừ tiền mà không kiểm soát. |
| Giá áp dụng | Theo thứ tự được chốt: giá riêng khách, bảng giá nhóm, giá bậc số lượng, giá mặc định. Không tự cộng dồn chiết khấu. |
| Ảnh chụp dữ liệu đơn | Lưu tên hàng, SKU, đơn vị, hệ số quy đổi, giá, giảm giá và địa chỉ tại thời điểm bán. Thay đổi danh mục không làm đổi đơn cũ. |
| Kho | Tồn thực tế, giữ hàng và hàng không đủ điều kiện bán là các số riêng. Tồn có thể bán = tồn thực tế - giữ hàng - hàng không đủ điều kiện bán. |
| Đơn vị | Mỗi SKU có đơn vị cơ sở. Mọi biến động kho quy về đơn vị cơ sở; lưu hệ số tại thời điểm giao dịch. |
| Nhật ký kho | Mọi nhận hàng, xuất hàng, trả hàng, điều chỉnh đều có chứng từ và nhật ký. Không sửa trực tiếp số tồn để thay cho chứng từ. |
| Xác nhận đơn | Kiểm tra giá, quyền mua nợ và tồn; giữ hàng trong giao dịch dữ liệu có kiểm soát cạnh tranh. |
| Xuất hàng | Giảm tồn thực tế và phần giữ tương ứng trong cùng nghiệp vụ. Không trừ lại vì nhận webhook hoặc bấm nút lần nữa. |
| Hủy đơn | Giải phóng phần giữ chưa xuất. Phần đã giao xử lý theo quy trình trả hàng, không hoàn tồn bằng cách hủy trạng thái. |
| Thanh toán | Một đơn có nhiều giao dịch thanh toán; một giao dịch có thể phân bổ cho nhiều đơn. Không ghi đè số tiền đã nhận mà thiếu lịch sử. |
| Công nợ | Phát sinh từ chứng từ đủ điều kiện; giảm khi thanh toán hoặc có điều chỉnh hợp lệ. Đặt cọc và tiền khách trả thừa theo dõi riêng, tránh giả tạo nợ âm. |
| Giá vốn | Lưu giá vốn xuất theo quy tắc đã chọn; nhận hàng trễ, trả hàng và điều chỉnh phải có chính sách rõ. |
| Đổi trả | Liên kết với dòng hàng đã giao; giới hạn số lượng trả; kiểm tra chất lượng trước khi đưa lại hàng vào tồn có thể bán. |
| Đồng bộ | Khóa duy nhất theo kênh + shop + mã đơn/sự kiện. Webhook trùng, đến sai thứ tự hoặc tác vụ thử lại phải an toàn. |
| Nhật ký | Lưu ai thực hiện, thời điểm, chứng từ và thay đổi quan trọng; log không chứa token, OTP hoặc dữ liệu nhạy cảm không cần thiết. |
| Quyền | Kiểm tra trên backend, cả quyền hành động và quyền với từng bản ghi. Khách A không xem được dữ liệu khách B bằng cách sửa URL. |

### 3.1 Chứng từ và trạng thái

- Báo giá: nháp, đã gửi, được chấp nhận, hết hạn, từ chối. Chuyển thành đơn có kiểm tra lại giá và tồn; báo giá không tự giữ hàng mặc định.
- Đơn hàng: nháp, đã xác nhận, đang thực hiện, hoàn tất, hủy. Theo dõi riêng trạng thái thanh toán và giao hàng, tính từ các chứng từ liên quan.
- Giao hàng: chưa giao, giao một phần, đã giao; trạng thái vận chuyển và COD bổ sung theo vận đơn.
- Tiền: chưa nhận, nhận một phần, đủ tiền; hoàn tiền và giao dịch lỗi có lịch sử riêng.
- Đơn mua: nháp, đã đặt, nhận một phần, đã nhận, hủy. Chỉ phiếu nhận thực tế làm tăng tồn.

## 4 Kế hoạch chi tiết từng phần

### 4.1 Nền tảng và quản trị

**Mục tiêu:** có một môi trường thật để xây các nghiệp vụ tiếp theo.

- Tạo repo, ứng dụng web/API, kết nối PostgreSQL, migration, seed và cấu hình môi trường.
- Đăng nhập nhân viên, phiên đăng nhập, đăng xuất, khóa tài khoản, khôi phục truy cập; tách khỏi tài khoản khách hàng.
- Các vai trò ban đầu: chủ cửa hàng, bán hàng, kho, người theo dõi thu chi. Một người có thể giữ nhiều vai trò.
- Quyền cụ thể: xem giá vốn, sửa giá, xác nhận đơn, điều chỉnh kho, thu/chi, xem công nợ, xuất danh sách khách, cấu hình connector.
- Giao diện tiếng Việt, dùng tốt trên điện thoại; định dạng tiền và ngày nhất quán; trạng thái tải, rỗng và lỗi rõ ràng.
- Nhật ký cho giao dịch quan trọng, quản lý file, kiểm tra tình trạng dịch vụ và hướng dẫn chạy local/staging.

**Nghiệm thu:** người không có quyền không gọi được API tương ứng; khởi tạo cơ sở dữ liệu mới bằng migration/seed thành công; bí mật không xuất hiện trong Git/frontend/log; đăng xuất vô hiệu hóa phiên theo cơ chế đã chọn.

### 4.2 Khách hàng và cơ hội bán hàng

**Màn hình:** danh sách khách, tạo/sửa, hồ sơ chi tiết, địa chỉ, lịch sử tương tác, nhắc việc và danh sách cơ hội.

**Dữ liệu:** tên, liên hệ, nhiều địa chỉ, nguồn khách, nhóm sỉ/lẻ, bảng giá, người phụ trách, ghi chú, lựa chọn nhận marketing; thông tin pháp nhân và người liên hệ nếu khách sỉ cần.

**Nghiệp vụ:** chuẩn hóa số điện thoại/email để tìm kiếm; gợi ý hồ sơ trùng; gộp chỉ khi có bằng chứng và giữ nhật ký. Không mất lịch sử khi gộp. Tách cơ hội mua hiện tại khỏi lịch sử mua lại của khách.

**Nghiệm thu:** một khách có thể có nhiều địa chỉ, nhiều hội thoại và nhiều đơn; khách mua lại vẫn mở được cơ hội mới; trùng tên không bị gộp tự động; lưu hồ sơ không làm thay đổi địa chỉ trên đơn cũ.

### 4.3 Sản phẩm và biến thể

**Màn hình:** danh mục, sản phẩm, biến thể/SKU, hình ảnh, giá, đơn vị và trạng thái bán.

**Dữ liệu:** sản phẩm, SKU duy nhất, màu/size nếu cần, mã vạch tùy chọn, đơn vị cơ sở, quy đổi hộp/thùng, giá mặc định, trọng lượng/kích thước khi cần vận chuyển.

**Nghiệp vụ:** ngừng bán thay cho xóa SKU đã có giao dịch; thay đổi quy đổi không tác động chứng từ cũ. Mỗi listing trên sàn liên kết tới SKU nội bộ. Ngành hàng có hạn dùng/lô/serial phải bổ sung từ trước khi nhập thật.

**Nghiệm thu:** chống trùng SKU; đơn không nhận SKU ngừng bán trừ quyền được chỉ định; 2 thùng x 12 cái được ghi nhận đúng 24 cái; sản phẩm đã bán vẫn tra cứu được sau khi ngừng bán.

### 4.4 Kho và mua hàng

**Màn hình:** tồn theo SKU, sổ kho, đơn mua, phiếu nhận, kiểm kê, điều chỉnh, cảnh báo tồn thấp và nhà cung cấp.

**Nghiệp vụ:** nhận từng phần theo đơn mua; phân bổ chi phí nhập theo cách đã chốt; theo dõi giá vốn; giữ/giải phóng hàng; xuất từng phần; hàng lỗi/đổi trả có trạng thái riêng. Tồn đầu kỳ được nhập bằng chứng từ có số lượng và giá trị.

**Ranh giới:** module kho sở hữu số lượng và biến động kho; module mua hàng sở hữu yêu cầu đặt hàng; tài chính sở hữu khoản phải trả và giao dịch thanh toán.

**Nghiệm thu:** tạo đơn mua không tăng tồn; nhận hàng tăng đúng tồn; tồn sau kiểm kê truy ra chứng từ; hai người cùng xác nhận đơn không bán vượt hàng có thể bán; hủy và thử lại không nhân đôi biến động.

### 4.5 Bảng giá sỉ và báo giá

**Màn hình:** bảng giá, nhóm khách, bậc số lượng, tạo báo giá, gửi/xuất báo giá, lịch sử phiên bản và chuyển thành đơn.

**Nghiệp vụ:** chốt quy tắc thứ tự giá; số lượng tối thiểu theo SKU hoặc đơn; hiệu lực bảng giá; mức giảm và người duyệt; thời hạn báo giá. Báo giá lưu giá, quy đổi và điều kiện ở thời điểm gửi. Thông tin giá vốn chỉ dành cho người có quyền.

**Nghiệm thu:** cùng SKU có thể có giá sỉ/lẻ đúng nhóm; kiểm tra tại ranh giới bậc 9/10/11 sản phẩm bằng chính sách mẫu; hết hạn báo giá không tự xác nhận; sửa bảng giá không làm đổi báo giá/đơn cũ; giảm vượt quyền bị từ chối từ backend.

### 4.6 Đơn hàng

**Màn hình:** danh sách đơn, tạo đơn nhanh, chi tiết, dòng thời gian, xác nhận, xuất hàng, thanh toán và lịch sử sửa.

**Dữ liệu:** khách, nguồn đơn, dòng SKU, đơn vị, giá chốt, giảm giá, phí giao, địa chỉ, đặt cọc, điều kiện thanh toán, người xử lý, mã ngoài nếu có.

**Nghiệp vụ:** tạo nháp từ khách/báo giá/hội thoại/website/sàn; kiểm tra rồi xác nhận; giữ hàng; tạo phiếu xuất; tính tổng trên backend. Khóa hoặc kiểm soát sửa dòng đã giao/thu tiền; thay đổi sau đó dùng chứng từ điều chỉnh. Tách mã đơn nội bộ khỏi mã sàn.

**Nghiệm thu:** đơn sỉ có giá và đơn vị đúng; đơn thiếu tồn báo lỗi rõ; bấm xác nhận hai lần chỉ có một lần giữ; giao một phần không tự hoàn tất phần còn lại; frontend sửa tổng tiền không làm thay đổi tổng backend tính.

### 4.7 Giao vận và đổi trả

**Màn hình:** đơn cần đóng gói, phiếu giao, vận đơn, giao thất bại, COD và yêu cầu đổi trả.

**Nghiệp vụ:** một đơn nhiều lần giao; theo dõi phí giao thực tế và bên chịu phí; xử lý hoàn hàng, hàng lỗi, hoàn tiền hoặc giảm nợ. Đổi hàng được liên kết tới đơn gốc và đơn thay thế. Với sàn, trạng thái sàn được lưu cùng trạng thái nội bộ, không ép tất cả vào một trường.

**Triển khai:** nhập thông tin vận đơn thủ công ở bản đầu; chọn một hãng để thử API sau. Không coi đơn đã giao là COD đã về.

**Nghiệm thu:** trả tối đa phần đã giao chưa trả; hàng lỗi không trở lại hàng có thể bán; tiền hoàn không vượt số được hoàn; webhook giao trùng không tạo thêm phiếu xuất; COD nhận được khớp khoản đối soát.

### 4.8 Thu chi và công nợ

**Màn hình:** thu/chi, tiền đặt cọc, nợ khách, nợ nhà cung cấp, hạn nợ, phân bổ thanh toán, đối soát COD/sàn và chi phí vận hành.

**Nghiệp vụ:** chọn thời điểm phát sinh phải thu/phải trả; thanh toán từng phần; một khoản thu phân bổ nhiều đơn; lưu khoản trả thừa/tạm ứng riêng. Không xóa chứng từ đã ghi sổ để sửa sai; lập đảo/điều chỉnh với quyền và nhật ký.

**Nghiệm thu bằng ví dụ:** đơn mẫu 1.000.000 đồng, nhận 300.000 đồng thì còn phải thu 700.000 đồng khi đơn đủ điều kiện ghi nợ. Nhận thêm 700.000 đồng thì hết nợ. Nhận 800.000 đồng cần xử lý 100.000 đồng trả thừa riêng. Thử lại cùng mã thanh toán không ghi thu lần nữa.

**Đầu ra:** tuổi nợ, hạn thanh toán, số đã nhận và số còn phải thu; xuất báo cáo để phục vụ đối soát với công cụ kế toán/hóa đơn nếu cần.

### 4.9 Hộp thư chung và chăm sóc khách

**Màn hình:** danh sách hội thoại, khung chat, thông tin khách bên cạnh, mẫu trả lời, ghi chú nội bộ, phân công và tạo đơn nháp.

**Nghiệp vụ:** quản lý theo kênh/tài khoản kênh/định danh người dùng; chống trùng tin; hiển thị gửi thành công/thất bại; thử lại có kiểm soát; nhắc hội thoại chưa phản hồi; lưu comment/nguồn bài nếu quyền hỗ trợ. Từ chat có thể tra hàng, giá, tạo báo giá và đơn nháp.

**Facebook:** thử với Fanpage và quyền thật trước; kiểm tra webhook và điều kiện gửi tin. **Zalo:** xác minh OA; tin nhắn cá nhân chưa được coi là phạm vi có API chính thức hỗ trợ của kế hoạch này. Nếu chưa tích hợp được, core CRM vẫn cho nhập khách/đơn thủ công và ghi liên kết nguồn.

**Nghiệm thu:** tin vào được lưu và xuất hiện ở CRM; tin gửi ra nhận được ở tài khoản thử; nhận cùng sự kiện hai lần không nhân đôi; ghi chú nội bộ không gửi cho khách; hết quyền/ngoài điều kiện gửi hiển thị rõ và không tự chuyển qua cách gửi khác.

### 4.10 AI hỗ trợ tư vấn và tạo đơn

**Đợt đầu:** tóm tắt, gợi ý câu trả lời, trích dữ liệu khách và tạo đơn nháp để người dùng duyệt.

**Dữ liệu hỗ trợ:** danh mục sản phẩm, FAQ, chính sách giao/đổi trả đã duyệt; các công cụ có phân quyền để lấy giá, tồn và tình trạng đơn hiện tại. Không gửi toàn bộ dữ liệu khách vào model khi chỉ cần một hội thoại.

**Quy tắc:** khách nhắn không được thay đổi chính sách; AI không tự tạo chứng từ tiền/kho hoặc cấp nợ. Kiểm tra thiếu thông tin, biến thể chưa rõ và báo giá không chắc chắn; chuyển người xử lý. Khi người tiếp quản, tự động trả lời dừng.

**Nghiệm thu:** bộ hội thoại mẫu gồm hỏi hàng hết, hỏi giá sỉ, sai biến thể, yêu cầu giảm vượt mức, địa chỉ thiếu và yêu cầu bỏ qua chính sách. AI không bịa giá/tồn; đơn nháp phải qua kiểm tra backend; đo tỷ lệ người sửa, độ chính xác và chi phí.

**Đợt sau:** chỉ tự gửi trong các tình huống đã duyệt và điều kiện kênh cho phép; có nút tắt, nhật ký, giới hạn chi phí và chuyển người thật.

### 4.11 Website mua lại và tài khoản khách

**Màn hình:** danh mục, chi tiết hàng, giỏ, đăng nhập OTP, địa chỉ, lịch sử đơn, đặt lại, theo dõi giao và công nợ được phép xem.

**Nghiệp vụ:** đăng ký không tự nhận nhóm sỉ; chủ duyệt quyền bảng giá và mua nợ. Đặt lại dùng giá/tồn hiện tại và giải thích thay đổi. OTP xác minh liên hệ hiện tại; liên kết với lịch sử cũ cần xử lý hồ sơ trùng và bằng chứng phù hợp, không tự mở toàn bộ lịch sử chỉ vì trùng số điện thoại.

**Hiển thị:** mặc định còn/sắp hết/hết; số lượng cụ thể chỉ dành cho nhóm được duyệt. Giá vốn và thông tin kho nội bộ không xuất hiện ở API khách hàng.

**Nghiệm thu:** khách chỉ xem dữ liệu của mình; khách lẻ không truy cập giá sỉ bằng URL/API; OTP hết hạn/sai/quá số lần bị từ chối; giỏ không giữ hàng vô hạn; đặt lại không dùng giá cũ một cách âm thầm.

### 4.12 Thanh toán online

**Trước tích hợp:** xác minh dịch vụ merchant, điều kiện hợp đồng/phí và môi trường thử. COD/chuyển khoản xác nhận thủ công vẫn hoạt động với lịch sử người xác nhận.

**VNPAY:** tạo mã thanh toán gắn đơn và số tiền; xử lý IPN máy chủ; kiểm tra chữ ký, mã, số tiền, trạng thái và chống ghi nhận trùng. Return URL phục vụ trải nghiệm người dùng; không phải căn cứ duy nhất để ghi nhận đã thu tiền. Có truy vấn/đối soát khi thiếu thông báo.

**Tình huống bắt buộc:** thành công, thất bại, hết hạn, khách đóng trang, IPN đến trước/sau Return URL, IPN lặp, sai chữ ký, sai số tiền, đơn hết thời hạn giữ nhưng tiền về sau.

**Nghiệm thu:** không ghi thu khi chữ ký/số tiền sai; một giao dịch chỉ nhận tiền một lần; đơn có tiền về muộn đi vào xử lý rõ ràng, không âm thầm xuất hàng hoặc bỏ mất tiền.

### 4.13 Shopee và TikTok Shop

**Chọn từng kênh:** tài khoản developer/partner, loại ứng dụng, quyền, shop và thị trường phải được kiểm chứng. Quyền sản phẩm, đơn, tài chính và chat được ghi riêng; không suy ra quyền chat từ quyền đơn.

**Thứ tự:** đọc đơn -> ánh xạ SKU -> trạng thái/giao/hoàn -> đồng bộ tồn -> đăng/cập nhật sản phẩm -> đối soát tiền -> chat nếu được cấp quyền. Thử một shop và một nhóm SKU trước.

**Nghiệp vụ:** mapping SKU, mã biến thể và listing theo từng sàn; giá bán theo kênh, phí sàn, quy tắc tồn phân bổ và tồn đệm. Lưu hàng đợi thất bại, đồng bộ bù và cảnh báo token hết hạn. Kiểm tra quyền giữ dữ liệu, dữ liệu bị che và giới hạn sử dụng trước khi lưu/dùng cho marketing.

**Nghiệm thu:** đơn ngoài chỉ có một bản nội bộ; SKU chưa mapping không tự xuất kho; không nhân đôi đơn đã nhập tay; webhook sai thứ tự không lùi trạng thái; đồng bộ lỗi hiển thị và có thể phục hồi. Không cam kết loại bỏ hoàn toàn bán vượt tồn khi nhiều kênh cập nhật có độ trễ.

### 4.14 Marketing và nội dung

**Bản đầu của module:** lịch nội dung, thư viện ảnh/video, soạn nháp, duyệt, lịch đăng, trạng thái đăng, liên kết sản phẩm và chiến dịch. Xuất nội dung để đăng thủ công nếu chưa có quyền API.

**Mở rộng:** đăng website/Fanpage khi quyền phù hợp; mỗi kênh có định dạng và trạng thái riêng; chăm sóc sau mua, nhắc mua lại và ưu đãi theo nhóm đồng ý nhận. Có hạn mức và cách ngừng nhận.

**TikTok:** Direct Post API có yêu cầu kiểm duyệt, trải nghiệm người dùng và mục đích sử dụng; công cụ nội bộ chỉ phục vụ tài khoản của mình/đội mình có hạn chế theo hướng dẫn hiện tại. Không coi đăng TikTok tự động là chức năng chắc chắn sẽ được duyệt cho CRM riêng này; xác minh tuyến tích hợp phù hợp hoặc dùng quy trình xuất/đăng thủ công.

**Nghiệm thu:** nội dung nháp chưa duyệt không phát hành; thử lại không đăng trùng; đúng kênh và tài khoản; người ngừng nhận không được đưa vào chiến dịch; ghi nhận nguồn đơn theo bằng chứng sẵn có, không khẳng định mọi đơn đều được quy nguồn chính xác.

### 4.15 Dashboard và phân tích

**Bản đầu:** tổng đơn, doanh thu thuần theo quy tắc ghi nhận, tiền thực nhận, khoản chưa thu, giá trị tồn, hàng sắp hết, sản phẩm bán chạy, khách mua lại và chi phí.

**Định nghĩa:** doanh thu khác tiền thu; tiền mua hàng nhập kho khác giá vốn hàng bán. Ghi rõ thời điểm ghi nhận doanh thu và cách xử lý hủy/trả/giảm giá. Lợi nhuận gộp = doanh thu thuần hàng hóa - giá vốn hàng đã bán. Kết quả sau chi phí cần cộng/trừ phí và doanh thu dịch vụ liên quan theo cấu hình đã chốt, không tự gọi mọi con số còn lại là lợi nhuận ròng kế toán.

**Màn hình:** bộ lọc ngày/kênh/nhóm sỉ lẻ/SKU; biểu đồ; bảng chi tiết; bấm vào số tổng để truy chứng từ; xuất dữ liệu với quyền tương ứng.

**AI sau này:** giải thích biến động, gợi ý nhập, hàng chậm và khách có khả năng mua lại. Thử dự báo trên dữ liệu quá khứ có tách giai đoạn đánh giá; so với trung bình gần đây; công bố sai số và khoảng dự báo. Chưa đủ dữ liệu thì trả lời rõ, không bịa dự báo.

**Nghiệm thu:** tổng báo cáo khớp chứng từ mẫu; ngày theo giờ Việt Nam; giá vốn không đổi khi sửa giá nhập danh mục; người không có quyền không xem được giá vốn/lợi nhuận qua API xuất.

### 4.16 API mở rộng và vận hành

**API từ đầu:** /api/v1, schema đầu vào/đầu ra, lỗi có mã, phân trang, bộ lọc và OpenAPI; backend kiểm tra mọi quy tắc. API nội bộ đã có không đồng nghĩa mở công khai ngay.

**API cho đối tác ở đợt sau:** credentials/scopes, hết hạn/thu hồi, giới hạn gọi, khóa chống xử lý trùng, webhook có chữ ký, thử lại và lịch sử giao. Không dùng tài khoản chủ hoặc token frontend làm khóa tích hợp lâu dài.

**Vận hành:** staging tách dữ liệu/credentials thật; theo dõi lỗi, tác vụ tồn đọng, token hết hạn, disk/storage và thời gian phản hồi; backup dữ liệu cùng file và thử phục hồi. Log loại bỏ bí mật và giảm dữ liệu cá nhân. Triển khai có migration được xem xét và đường phục hồi ứng dụng/dữ liệu phù hợp.

**Nghiệm thu:** thu hồi khóa có hiệu lực; dữ liệu mẫu phục hồi được sang môi trường sạch; tác vụ thất bại truy ra và chạy lại an toàn; không mất đơn đã xác nhận sau sự cố được mô phỏng trong phạm vi bài kiểm tra.

## 5 Mô hình dữ liệu ở mức lập kế hoạch

Đây là nhóm thực thể để phân tích quan hệ, không yêu cầu AI tạo toàn bộ bảng ngay ở đợt đầu. Mỗi đợt chỉ migration phần cần dùng; giữ mô hình đích để tránh thiết kế lại các khóa và quan hệ trung tâm.

| Nhóm | Thực thể dự kiến | Quan hệ quan trọng |
| --- | --- | --- |
| Nhân sự và quyền | StaffUser, Role, Permission, Session, AuditLog | Nhân viên tách khỏi tài khoản khách; nhật ký tham chiếu chứng từ |
| Khách | Customer, ContactPoint, Address, CustomerIdentity, CustomerGroup | Customer có nhiều liên hệ/địa chỉ/định danh theo kênh |
| Chăm sóc | SalesOpportunity, Task, CustomerNote | Cơ hội và việc nhắc gắn khách, người phụ trách và hạn |
| Hàng | Product, ProductVariant, UnitConversion, MediaAsset | SKU nằm ở biến thể, có đơn vị cơ sở và ảnh |
| Giá | PriceList, PriceRule, CustomerPriceAssignment | Nhóm/khách và thời hạn quyết định bảng giá |
| Báo giá | Quote, QuoteLine, QuoteRevision | Dòng lưu thông tin chốt; chuyển đơn có truy nguồn |
| Kho | Warehouse, StockBalance, StockMovement, StockReservation, StockAdjustment | SKU + kho; balance cập nhật có giao dịch và đối chiếu sổ kho |
| Mua hàng | Supplier, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine | Nhận nhiều đợt; hàng nhận sinh biến động kho |
| Bán hàng | SalesOrder, SalesOrderLine, OrderEvent | Đơn có nhiều dòng, giao dịch, phiếu giao và sự kiện |
| Giao hàng | Shipment, ShipmentLine, TrackingEvent | Mỗi phiếu giao tham chiếu số lượng từng dòng đơn |
| Trả hàng | ReturnRequest, ReturnLine, ReturnReceipt, CreditAdjustment | Gắn hàng đã giao và giới hạn số trả; chất lượng quyết định nhập lại |
| Tiền | Payment, PaymentAllocation, Refund, Expense | Thu nhiều lần; phân bổ tới đơn/chứng từ; hoàn có liên kết |
| Công nợ | ReceivableDocument, PayableDocument, SettlementEntry | Phải thu/phải trả có chứng từ và lịch sử phân bổ |
| Hội thoại | ChannelAccount, Conversation, Message, Assignment | Conversation tham chiếu định danh kênh; ghi chú nội bộ tách tin gửi khách |
| Tích hợp | ChannelListing, ExternalOrderLink, WebhookEvent, SyncJob, OutboxEvent | Khóa ngoài chống trùng; outbox lưu việc cần thực hiện sau giao dịch |
| Website | CustomerAccount, OtpChallenge, Cart | Liên kết customer theo xác minh; giỏ không phải chứng từ xuất kho |
| Marketing | Campaign, ContentItem, Publication, ConsentRecord | Một nội dung nhiều lần đăng theo kênh; consent có lịch sử |
| AI | KnowledgeDocument, AiRun, AiSuggestion, AiFeedback | Lưu phiên bản nguồn, kết quả, người duyệt và chi phí phù hợp |
| API đối tác | IntegrationCredential, ApiScope, WebhookSubscription | Khóa thu hồi được, quyền giới hạn và lịch sử giao |

Nguyên tắc kiểm soát: bảng tổng hợp như StockBalance hoặc số tiền phải thu không thay thế sổ biến động/chứng từ. Cần cơ chế đối chiếu để phát hiện lệch, và quy trình sửa bằng nghiệp vụ có quyền.

## 6 Thứ tự các đợt vibe code

Mỗi đợt đi trọn dữ liệu, backend, giao diện và nghiệm thu. Tích hợp chạy với tài khoản thử ở đợt sớm, nhưng không để thời gian chờ xét duyệt chặn việc xây core. Không triển khai toàn bộ roadmap bằng một prompt.

| Đợt | Công việc | Phụ thuộc | Đầu ra để quyết định hoàn thành |
| --- | --- | --- | --- |
| 00 | Chuẩn hóa đặc tả và thử quyền Facebook/Zalo | Không | PRD, quy tắc nghiệp vụ, phạm vi bản đầu, bảng quyền tích hợp có bằng chứng |
| 01 | Repo, môi trường, đăng nhập nhân viên, quyền, CI | 00 | Web/API chạy, migration/seed, đăng nhập và API bị bảo vệ |
| 02 | Hồ sơ khách, nhóm sỉ/lẻ, địa chỉ, nhắc việc | 01 | Thêm/tìm khách, nhiều địa chỉ, không gộp sai |
| 03 | Sản phẩm, SKU, đơn vị, hình ảnh | 01 | Sản phẩm/biến thể và quy đổi được backend kiểm tra |
| 04 | Nhà cung cấp, nhập hàng, tồn đầu kỳ, sổ kho | 03 | Tồn tăng đúng từ phiếu nhận, kiểm kê/điều chỉnh có chứng từ |
| 05 | Giá sỉ/lẻ, bậc giá và báo giá | 02, 03 | Tính đúng giá và chuyển báo giá thành đơn nháp |
| 06 | Đơn, xác nhận, giữ hàng, hủy và giao một phần | 04, 05 | Một đơn sỉ/lẻ chạy đến xuất hàng; kiểm tra cạnh tranh kho |
| 07 | Thu tiền, đặt cọc, công nợ, chi phí cơ bản | 06 | Thu nhiều lần, hạn nợ, phân bổ và báo cáo đối chiếu |
| 08 | Đổi trả, COD thủ công, báo cáo cơ bản, nhập dữ liệu và pilot | 06, 07 | Dùng thử trọn luồng thật; xử lý trả hàng; phục hồi backup |
| 09 | Hộp thư chung từ connector đã kiểm chứng | 00, 02, 06 | Nhận/gửi tin thật, tạo đơn nháp và xử lý lỗi đồng bộ |
| 10 | AI gợi ý trả lời và đơn nháp | 09 và dữ liệu/chính sách đã duyệt | Bộ hội thoại mẫu đạt tiêu chí; người dùng kiểm soát kết quả |
| 11 | Website mua lại, tài khoản, OTP | 02, 05–08 | Giá/tồn đúng quyền; đặt lại và theo dõi đơn |
| 12 | Thanh toán online và một hãng giao hàng | 11 và điều kiện nhà cung cấp | Sandbox đạt tình huống tiền về muộn/trùng/lỗi; đối soát được |
| 13 | Một sàn ưu tiên, sau đó sàn tiếp theo | 03–08 và quyền được cấp | Đơn, SKU, tồn và hoàn đồng bộ phục hồi được |
| 14 | Marketing, chăm sóc theo hành vi, báo cáo nâng cao | 09–13 theo kênh thực sự cần | Nội dung duyệt được, gửi đúng điều kiện, đo hiệu quả |
| 15 | API đối tác, AI dự báo và tối ưu vận hành | Core ổn định và đủ dữ liệu | Khóa API có phạm vi; dự báo có đánh giá; hiệu năng có số đo |

Trong đợt 00, phác thảo các màn hình Tổng quan, Khách hàng, Hội thoại, Tạo đơn, Kho và Công nợ bằng dữ liệu mẫu có ghi rõ. Cho em gái anh thao tác thử để chốt thứ tự nhập, cách tìm hàng và vị trí nút trước khi code luồng thật. Các mẫu này chỉ phục vụ xác nhận trải nghiệm; nghiệm thu chức năng ở đợt sau phải dùng API và dữ liệu lưu thật.

### 6.1 Các bản phát hành

- **Bản nội bộ đầu tiên:** kết thúc đợt 08. Quản lý khách, hàng, giá, đơn, tiền, công nợ, đổi trả và báo cáo. Nhập nguồn đơn thủ công nếu connector chưa sẵn sàng.
- **Bản chăm sóc đa kênh:** đợt 09–10. Làm sớm hơn ngay khi các phần phụ thuộc đã hoàn thành nếu đây là nhu cầu cấp bách nhất.
- **Bản tự phục vụ:** đợt 11–12. Khách quen đặt lại và thanh toán/giao hàng có tích hợp.
- **Bản mở rộng kênh:** đợt 13–15. Chọn theo lượng đơn và lợi ích vận hành thực tế, không bắt buộc làm tất cả cùng lúc.

Chưa đủ dữ liệu để đưa thời hạn hoặc báo giá đáng tin. Cách ước lượng đề xuất: hoàn thành đặc tả, đo thời gian của 2–3 đợt đầu, rồi ước lượng từng đợt còn lại gồm code, kiểm tra, sửa lỗi, nhập dữ liệu, vận hành và dự phòng. Thời gian cấp quyền nền tảng theo dõi riêng. Không dùng tốc độ tạo giao diện để dự đoán tốc độ hoàn thành nghiệp vụ tiền/kho.

## 7 Bộ dữ liệu và tình huống nghiệm thu chung

### 7.1 Ví dụ kiểm tra liên module

Các số sau là dữ liệu thử, không phải giá bán thực tế của cửa hàng. Quy ước của ví dụ: phải thu phát sinh khi phát hành chứng từ bán hàng tại xác nhận đơn; doanh thu hàng hóa ghi nhận theo phần đã giao; phí giao 30.000 đồng không hoàn trong ví dụ. Cửa hàng có thể chọn quy tắc khác, khi đó phải thay đổi toàn bộ kỳ vọng liên quan một cách nhất quán.

- Nhập 100 cái, giá vốn 50.000 đồng/cái; không có chi phí nhập bổ sung.
- Giá lẻ 90.000 đồng/cái; giá sỉ từ 10 cái là 80.000 đồng/cái.
- Khách sỉ đặt 10 cái; tiền hàng 800.000 đồng + phí giao 30.000 đồng = tổng 830.000 đồng.
- Nhận đặt cọc 300.000 đồng; sau khi ghi nhận phải thu, còn phải thu 530.000 đồng.
- Xác nhận đơn: tồn thực tế 100, giữ 10, có thể bán 90.
- Giao 6 cái: tồn thực tế 94, giữ 4, có thể bán 90. Doanh thu hàng hóa đã giao 480.000 đồng; giá vốn 300.000 đồng; lãi gộp hàng hóa 180.000 đồng.
- Giao 4 cái còn lại: tồn thực tế 90, giữ 0, có thể bán 90. Doanh thu hàng hóa 800.000 đồng; giá vốn 500.000 đồng; lãi gộp hàng hóa 300.000 đồng.
- Thu 530.000 đồng còn lại: hết phải thu; tổng tiền đã nhận 830.000 đồng.
- Khách trả 2 cái đủ điều kiện bán, hoàn 160.000 đồng: tồn thực tế và có thể bán đều 92; doanh thu hàng hóa thuần 640.000 đồng; giá vốn hàng bán ròng 400.000 đồng; lãi gộp hàng hóa 240.000 đồng. Tiền đã nhận sau hoàn 670.000 đồng, gồm 30.000 đồng phí giao.
- Kiểm tra lại toàn bộ kết quả sau khi đổi bảng giá hiện tại: chứng từ đã chốt và số liệu quá khứ không đổi.

### 7.2 Tình huống bắt buộc trước khi dùng thật

1. Hai yêu cầu đồng thời mua phần hàng cuối: số xác nhận không vượt tồn theo chính sách đã chốt; không chỉ kiểm tra tuần tự.
2. Bấm xác nhận/hủy/thu tiền hai lần, lỗi mạng rồi gửi lại: không nhân đôi chứng từ hoặc biến động.
3. Khách trả một phần sau khi giao nhiều đợt: tồn, tiền và công nợ khớp.
4. Thanh toán vượt số còn phải thu: xử lý khoản thừa rõ ràng.
5. Đổi giá, địa chỉ và hệ số quy đổi sau khi đã có đơn: dữ liệu trên đơn cũ không đổi.
6. Nhân viên không có quyền xem giá vốn/xuất khách gọi trực tiếp API: bị từ chối.
7. Tài khoản khách đổi ID trên URL để xem đơn người khác: bị từ chối.
8. Webhook trùng, đến sai thứ tự, token hết hạn và tác vụ lỗi: truy ra, thử lại an toàn.
9. Đơn từ sàn có SKU chưa mapping: đưa vào danh sách cần xử lý, không trừ kho sai.
10. AI gặp khách yêu cầu tự đổi chính sách/giá hoặc hỏi hàng không có: không cấp quyền, không bịa dữ liệu.
11. IPN không hợp lệ hoặc lặp: không nhận tiền sai; IPN đến muộn có quy trình xử lý.
12. Sao lưu rồi phục hồi vào môi trường sạch: đơn, kho, công nợ và file quan trọng dùng lại được.
13. Import khách/SKU/đơn từ file có dòng lỗi hoặc chạy lại: có báo cáo lỗi, không nhập trùng.
14. Ngày giao dịch gần nửa đêm: báo cáo đúng ngày Việt Nam.

### 7.3 Điều kiện hoàn thành một đợt

- Có UI dùng được với API và dữ liệu lưu thật trong môi trường kiểm tra.
- Kiểm tra nghiệp vụ có ý nghĩa theo phạm vi thay đổi đã chạy; không chỉ kiểm tra rằng nút được hiển thị.
- Typecheck, lint và build phù hợp dự án chạy thành công hoặc có ghi rõ phần chưa kiểm tra.
- Migration đã thử trên cơ sở dữ liệu mới và bản dữ liệu thử có sẵn nếu thay schema.
- API, mô hình dữ liệu và tài liệu quy tắc được cập nhật.
- Không còn lỗi nghiêm trọng trong giá/kho/tiền/quyền ở luồng được giao.
- Có bản commit có thể truy lại; xem diff và kiểm tra các thay đổi ngoài phạm vi.
- Demo gồm tình huống thành công và lỗi; em gái anh thực hiện được thao tác chính.

## 8 Quy trình làm việc với công cụ AI

### 8.1 Trước mỗi đợt

Đưa đặc tả vào repo. Cho AI đọc trạng thái hiện tại, schema, hợp đồng API, các quyết định và nhiệm vụ cụ thể. Yêu cầu AI nêu phần ảnh hưởng và thông tin thiếu. Chỉ dừng để hỏi nếu thiếu thông tin làm thay đổi nghiệp vụ quan trọng; các lựa chọn kỹ thuật nhỏ dùng quy ước đã chốt.

### 8.2 Trong mỗi đợt

1. Chọn một luồng nhỏ, ví dụ tạo khách với nhiều địa chỉ hoặc xác nhận đơn và giữ hàng.
2. Thống nhất dữ liệu đầu vào/đầu ra, quyền và tình huống lỗi.
3. Làm migration/backend/giao diện để luồng chạy thật.
4. Kiểm tra tình huống nghiệp vụ trọng yếu; sửa theo bằng chứng, không tự viết lại toàn hệ thống khi gặp một lỗi.
5. Xem diff, demo, cập nhật tài liệu và commit.
6. Chỉ chuyển nhiệm vụ tiếp theo khi phần hiện tại đạt tiêu chí hoặc phần còn thiếu được ghi rõ.

### 8.3 Hướng dẫn dự kiến cho AGENTS.md

Các hướng dẫn sau là nội dung để đưa vào repo khi bắt đầu, không phải một skill mới:

```text
Đọc docs/PRD.md, docs/BUSINESS_RULES.md, docs/DATA_MODEL.md,
docs/DECISIONS.md và nhiệm vụ hiện tại trước khi sửa.

Chỉ triển khai phạm vi nhiệm vụ. Giữ stack, phiên bản và hợp đồng API đã chốt.
Không tự nâng dependency, đổi framework hoặc thay toàn bộ schema.
Đưa quy tắc giá, kho, tiền và quyền vào backend; không tin tổng frontend gửi lên.
Các nghiệp vụ ảnh hưởng kho/tiền cần giao dịch, kiểm soát cạnh tranh và chống trùng.
Không dùng dữ liệu giả hoặc nút giả để báo hoàn thành một chức năng thật.
Mock connector phải ghi rõ là mock; chưa gọi API thật thì chưa có tích hợp thật.
Không ghi secret/OTP/dữ liệu nhạy cảm không cần thiết vào code, frontend hoặc log.
Không xóa dữ liệu thật hay chạy migration phá dữ liệu khi chưa có quy trình được duyệt.
Kiểm tra phù hợp thay đổi; báo đúng kiểm tra đã chạy và phần chưa chạy.
Cập nhật đặc tả, hợp đồng API và backlog khi có thay đổi đã được chấp nhận.
Sau cùng báo: thay đổi, cách chạy, bằng chứng kiểm tra, phần còn thiếu và rủi ro thực tế.
```

### 8.4 Mẫu prompt giao một nhiệm vụ

```text
Đọc các tài liệu đặc tả và trạng thái repo hiện tại.
Nhiệm vụ: [một luồng cụ thể của đợt hiện tại].
Người dùng/đối tượng: [vai trò và bản ghi được phép truy cập].
Phạm vi: [màn hình, API, dữ liệu và thao tác cần hoàn thành].
Ngoài phạm vi đợt này: [phần mở rộng sẽ làm sau].
Quy tắc nghiệp vụ: [trích quy tắc đã chốt].
Tiêu chí nghiệm thu: [kết quả đo được, gồm trường hợp lỗi quan trọng].
Phụ thuộc: [module/API đã có hoặc connector chưa được cấp quyền].

Trước khi sửa, kiểm tra các phần liên quan và nêu kế hoạch ngắn.
Sau đó triển khai luồng xuyên suốt với dữ liệu lưu thật.
Không đổi stack hoặc phạm vi để làm cho kiểm tra dễ hơn.
Chạy kiểm tra phù hợp, sửa lỗi, cập nhật tài liệu và hướng dẫn demo.
Báo rõ phần đã xong, kiểm tra đã chạy, phần chưa xác minh và file thay đổi.
```

### 8.5 Prompt khởi động dự án

```text
Tôi xây CRM cho một cửa hàng bán sỉ và bán lẻ, ưu tiên Facebook và Zalo.
Hiện chưa có mã nguồn. Đọc tài liệu ke-hoach-vibe-code-crm.md được cung cấp.

Nhiệm vụ đầu tiên là chuẩn hóa đợt 00, chưa triển khai nghiệp vụ bán hàng.
Tạo các tài liệu PRD, BUSINESS_RULES, DATA_MODEL, API_CONTRACT ở mức khung,
BACKLOG, ACCEPTANCE, DECISIONS và hướng dẫn AGENTS.md trong repo dự án.
Giữ rõ yêu cầu đã xác nhận, giả định tạm dùng và câu hỏi còn mở.

Kiến trúc đề xuất: Next.js/TypeScript cho web; NestJS/TypeScript cho backend;
PostgreSQL/Prisma cho dữ liệu; Redis/BullMQ khi bắt đầu tích hợp nền.
Backend chia module, một nguồn quy tắc giá/kho/đơn/tiền, API có phiên bản.

Bản nội bộ đầu tiên gồm khách, hàng, đơn vị, mua hàng/kho, giá sỉ/báo giá,
đơn hàng, giao một phần, thu tiền/công nợ, đổi trả và báo cáo cơ bản.
Tích hợp có bảng quyền riêng cho nhắn tin, đơn, sản phẩm và đăng nội dung.
Không tuyên bố Facebook/Zalo/Shopee/TikTok đã tích hợp nếu chưa thử API thật.

Đưa ra danh sách tối đa 5 quyết định nghiệp vụ cần tôi xác nhận trước đợt 01–06.
Hoàn thành các tài liệu có thể soạn từ thông tin hiện có; không tự chốt dữ liệu còn thiếu.
Chưa tạo toàn bộ bảng dữ liệu, chưa triển khai AI/website/sàn và chưa deploy production.
```

### 8.6 Những việc người chủ dự án vẫn cần kiểm soát

- Chốt quy tắc bán hàng và các ví dụ tính tiền/kho với em gái anh.
- Kiểm tra màn hình bằng vai trò nhân viên/khách, không chỉ tài khoản chủ.
- Xem diff/migration và kiểm tra bằng chứng kiểm thử trước khi dùng dữ liệu thật.
- Quản lý tài khoản, quyền API, ngân sách và bí mật dịch vụ; không dán khóa thật vào prompt chia sẻ.
- Bảo đảm dữ liệu có thể xuất và phục hồi.
- Đánh giá chức năng theo số thao tác và thời gian tiết kiệm được.

## 9 Kế hoạch đưa vào sử dụng

### 9.1 Trước chạy thử

Chốt SKU/đơn vị/bảng giá; nhập tồn đầu kỳ có kiểm kê; nhập công nợ đầu kỳ có ngày/chứng từ đối chiếu; xác minh hồ sơ khách và loại bỏ trùng theo quy trình. Import phải có xem trước, lỗi theo dòng và khóa chống nhập lại.

Chạy bộ nghiệm thu với dữ liệu giả định; sao lưu và phục hồi; thiết lập quyền; chuẩn bị hướng dẫn thao tác ngắn cho người dùng. Tài khoản thanh toán/nhắn tin thật chỉ được nối sau khi luồng thử tương ứng được xác minh.

### 9.2 Chạy thử với quy mô nhỏ

Chọn một nhóm sản phẩm và một nhóm đơn; quy định rõ dữ liệu nào là nguồn chính trong thời gian chạy thử. Nếu so sánh với sổ/Excel hiện tại, không để hai hệ thống cùng gửi tin, tạo vận đơn hoặc trừ kho thật. Đối chiếu hằng ngày đơn, tồn, tiền và nợ; ghi lỗi theo tình huống thực tế.

### 9.3 Chuyển sang sử dụng chính

Chốt thời điểm và số dư đầu kỳ; kiểm tra đơn đang xử lý và công nợ; tắt tác vụ ghi trùng ở hệ thống cũ nếu có. Cần phương án tiếp tục nhập đơn khi hệ thống lỗi, sau đó nhập bù có đối soát. Theo dõi kỹ các cảnh báo quyền API, queue và thanh toán trong thời gian đầu.

### 9.4 Chỉ số đánh giá

| Mục tiêu | Chỉ số |
| --- | --- |
| Giảm thao tác | Thời gian từ tiếp nhận tới đơn xác nhận; số lần nhập lại thông tin |
| Chăm sóc tốt hơn | Hội thoại bị bỏ sót, thời gian phản hồi, báo giá thành đơn |
| Kho đúng hơn | Chênh lệch kiểm kê, đơn thiếu hàng, lỗi đồng bộ tồn |
| Thu tiền rõ hơn | Nợ quá hạn, COD chưa đối soát, khoản thu chưa phân bổ |
| AI hữu ích | Tỷ lệ gợi ý được dùng/sửa, lỗi thông tin, chi phí hội thoại |
| Hệ thống ổn định | Lỗi thao tác, tác vụ thất bại chưa xử lý, kết quả phục hồi |

Đo hiện trạng trước và sau; đặt mục tiêu sau khi có dữ liệu gốc. Không dùng con số mục tiêu tùy ý như bằng chứng sản phẩm đã hiệu quả.

## 10 Chi phí và các rủi ro cần quản lý

| Khoản | Cách lập ngân sách |
| --- | --- |
| Công phát triển và kiểm tra | Ước lượng từng đợt sau 2–3 đợt đầu; có phần sửa lỗi và triển khai |
| AI lập trình và AI vận hành | Theo dõi riêng; giới hạn chi phí, lưu phản hồi/cache phù hợp |
| Hosting, DB, file, backup | Dựa số đơn, ảnh/video, dung lượng và nhu cầu phục hồi |
| Nhắn tin và OTP | Theo kênh gửi, lượng tin, gói dịch vụ và cơ chế kiểm soát gửi |
| Thanh toán/giao vận | Xác minh phí và điều kiện của nhà cung cấp khi ký dịch vụ |
| Kết nối nền tảng | Công đăng ký/xét quyền, thử nghiệm và bảo trì khi API thay đổi |
| Hỗ trợ vận hành | Hướng dẫn người dùng, kiểm kê/import, theo dõi lỗi và đối soát |

Rủi ro chính: AI viết quá phạm vi; giao diện có nhưng nghiệp vụ giả; schema thay đổi liên tục; trừ kho/ghi thu trùng; gộp sai khách; connector không có quyền; số liệu báo cáo không thống nhất; không có backup phục hồi được. Các tiêu chí nghiệm thu và thứ tự đợt ở trên được thiết kế để phát hiện các vấn đề này trước khi mở rộng.

## 11 Nguồn kỹ thuật để đối chiếu khi triển khai

Các nguồn chính thức đã được đối chiếu ngày 30 tháng 9 năm 2026. Quyền thực tế, phạm vi thị trường và điều kiện tài khoản vẫn phải kiểm tra lúc đăng ký/tích hợp. Các lựa chọn kiến trúc, phạm vi và nghiệm thu trong kế hoạch là đề xuất thiết kế cho dự án.

- Next.js Getting Started: https://nextjs.org/docs/app/getting-started
- Next.js Deployment: https://nextjs.org/docs/pages/getting-started/deploying
- NestJS Queues: https://docs.nestjs.com/application/queues
- Prisma Transactions: https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions (khi chọn phiên bản ORM khác phải dùng đúng bộ tài liệu của phiên bản đó)
- Meta Messenger Platform, bộ tài liệu do Meta cung cấp trên Postman: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api
- Zalo OA OpenAPI: https://docs.zaloplatforms.com/docs/OA/bat-dau/kham-pha
- Shopee App management: https://open.shopee.com/developer-guide/14
- Shopee Chat API permission: https://open.shopee.com/faq/56
- TikTok Shop Conversation API: https://partner.tiktokshop.com/docv2/page/get-conversation-202601
- TikTok Shop Order API: https://partner.tiktokshop.com/docv2/page/get-order-list-202309
- TikTok Content Sharing Guidelines: https://developers.tiktok.com/doc/content-sharing-guidelines
- VNPAY Giới thiệu tích hợp: https://sandbox.vnpayment.vn/apis/docs/gioi-thieu/
- VNPAY Thanh toán Pay: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html

Một số trang tài liệu chỉ trả nội dung đầy đủ khi chạy JavaScript hoặc có quyền; các kết luận về API cần được xác nhận lại bằng tài khoản phát triển và thử nghiệm thực tế. Chưa có quyền được cấp trong dự án này.
