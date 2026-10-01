# Kế hoạch nghiệm thu

## 1. Nghiệm thu Đợt 00

- **AC-00-01:** Tất cả tài liệu trong `README.md` tồn tại và không mô tả connector/prototype là tính năng thật.
- **AC-00-02:** `DECISIONS.md` có đúng 5 câu hỏi chặn, mỗi câu có phương án tạm và ảnh hưởng.
- **AC-00-03:** Mỗi quy tắc trọng yếu giá/kho/tiền/quyền có mã để liên kết test sau này.
- **AC-00-04:** Prototype mở không cần build, có 6 màn hình, dùng tốt ở 390px và desktop, luôn hiện “DỮ LIỆU MẪU — KHÔNG LƯU”.
- **AC-00-05:** Bấm điều hướng/chọn khách/tìm hàng trong prototype không phát sinh request ngoài hoặc thay đổi dữ liệu thật.
- **AC-00-06:** Bảng tích hợp phân biệt rõ tài khoản, năng lực, quyền cần xác minh, evidence và trạng thái.
- **AC-00-07:** Người dùng chính thử kịch bản ở `UI_PROTOTYPE.md`; phản hồi được ghi trước khi khóa UI Đợt 01–06.

## 2. Nghiệm thu Đợt 01

- **AC-01-01 — PASS local:** web đăng nhập gọi API thật, đọc `/me` và hiển thị vai trò/quyền từ PostgreSQL.
- **AC-01-02 — PASS local:** live/ready phân biệt trạng thái tiến trình và kết nối database; endpoint bảo vệ trả `401` khi chưa đăng nhập.
- **AC-01-03 — PASS local:** cookie phiên là `HttpOnly`; logout thu hồi phiên; khóa nhân viên thu hồi mọi phiên còn hiệu lực.
- **AC-01-04 — PASS E2E:** owner có `staff.manage`; nhân viên sales gọi trực tiếp API quản trị nhận `403 PERMISSION_DENIED`.
- **AC-01-05 — PASS local:** migration chạy và seed idempotent tạo một business, bốn role, mười permission và owner local.
- **AC-01-06 — PASS local:** login/logout/tạo hoặc khóa nhân viên/gán role đều sinh audit; không ghi password hay session token thô.
- **AC-01-07 — PASS local:** format, lint, typecheck, unit, build và E2E; workflow CI đã cấu hình nhưng cần remote để có bằng chứng run đầu tiên.
- **AC-01-08 — PASS:** DTO từ chối field ngoài schema; OpenAPI xuất được hợp đồng của chín path Đợt 01.

## 3. Nghiệm thu Đợt 02

- **AC-02-01 — PASS E2E:** hai hồ sơ trùng tên và cùng số điện thoại vẫn có hai ID; hồ sơ thứ hai trả gợi ý `SAME_NAME`/`SAME_PHONE`, không tự gộp.
- **AC-02-02 — PASS E2E:** tìm số điện thoại định dạng `090…` khớp dữ liệu đã chuẩn hóa từ cả `090…` và `+84…`.
- **AC-02-03 — PASS E2E:** một khách lưu được nhiều địa chỉ; địa chỉ được lưu trữ thay vì xóa cứng.
- **AC-02-04 — PASS E2E:** việc nhắc và cơ hội mua lại được lưu riêng và xuất hiện trong hồ sơ khách.
- **AC-02-05 — PASS E2E:** cập nhật cùng version cũ lần thứ hai trả `409 VERSION_CONFLICT`.
- **AC-02-06 — PASS E2E:** role kho gọi trực tiếp `/customers` nhận `403 PERMISSION_DENIED`; mọi query chi tiết bị giới hạn theo business.
- **AC-02-07 — PASS local:** UI có trạng thái tải/rỗng/lỗi, tạo–tìm–sửa khách, thêm/lưu trữ địa chỉ, hoàn thành việc nhắc và cập nhật cơ hội bằng API thật.

## 4. Nghiệm thu Đợt 03

- **AC-03-01 — PASS E2E:** tạo sản phẩm cùng SKU; SKU được chuẩn hóa chữ hoa và tìm được theo mã.
- **AC-03-02 — PASS E2E:** SKU trùng trong cùng business trả `409 SKU_ALREADY_EXISTS`; barcode có unique constraint riêng.
- **AC-03-03 — PASS E2E:** đơn vị gốc luôn có hệ số 1; API từ chối lặp đơn vị gốc, factor không dương và mã quy đổi trùng.
- **AC-03-04 — PASS migration:** database có check `factor > 0` và `sort_order >= 0`, ngoài validation API.
- **AC-03-05 — PASS E2E:** cập nhật quy đổi dùng optimistic version; ngừng bán SKU giữ nguyên hồ sơ thay vì xóa.
- **AC-03-06 — PASS E2E:** media chỉ nhận URL HTTPS, liên kết đúng product/variant và được lưu trữ thay vì xóa cứng.
- **AC-03-07 — PASS E2E:** role kho đọc được catalog nhưng gọi API tạo sản phẩm nhận `403 PERMISSION_DENIED`.
- **AC-03-08 — PASS local:** UI tạo/tìm/sửa/ngừng bán sản phẩm, thêm SKU, sửa quy đổi và quản lý metadata ảnh bằng API thật.

## 5. Nghiệm thu Đợt 04A

- **AC-04A-01 — PASS E2E:** tạo/tìm nhà cung cấp và chuẩn hóa email; migration bảo đảm mã nhà cung cấp duy nhất theo business.
- **AC-04A-02 — PASS E2E:** tạo đơn mua `2 thùng × 12` lưu snapshot đúng `24` đơn vị gốc; client không gửi hệ số.
- **AC-04A-02B — PASS E2E:** khi SKU đã được đơn mua tham chiếu, API từ chối thay danh sách quy đổi với `409 UNIT_CONVERSION_IN_USE`.
- **AC-04A-03 — PASS E2E:** tạo và phát hành đơn mua không thay đổi bản ghi SKU, không tạo audit `inventory.*`.
- **AC-04A-04 — PASS E2E:** đơn vị không thuộc SKU trả `422 UNIT_NOT_AVAILABLE_FOR_VARIANT`.
- **AC-04A-05 — PASS E2E:** sau phát hành, sửa dòng trả `409 PURCHASE_ORDER_NOT_EDITABLE`.
- **AC-04A-06 — PASS E2E:** role kho đọc/ghi mua hàng; role sales gọi trực tiếp nhận `403 PERMISSION_DENIED`.
- **AC-04A-07 — PASS migration:** DB kiểm tra line number, hệ số, số lượng đặt và số lượng cơ sở dương; giá dự kiến không âm.
- **AC-04A-08 — PASS local:** UI tạo/lưu trữ nhà cung cấp, tạo/phát hành/hủy đơn mua bằng API thật và luôn cảnh báo chưa nhập kho.

## 5B. Nghiệm thu Đợt 04B

- **AC-04B-01 — PASS E2E:** nhận một phần đơn mua quy đổi đúng về đơn vị gốc, cập nhật trạng thái `PARTIALLY_RECEIVED` và số còn phải nhận.
- **AC-04B-02 — PASS E2E:** nhận đủ chuyển đơn mua sang `RECEIVED`; tồn thực tế/có thể bán và giá vốn bình quân gia quyền khớp.
- **AC-04B-03 — PASS E2E:** gửi lại cùng `Idempotency-Key` và payload trả cùng phiếu, không thêm movement; đổi payload với cùng key trả `409 IDEMPOTENCY_KEY_REUSED`.
- **AC-04B-04 — PASS E2E:** backend từ chối nhận vượt; hai request đồng thời cho phần cuối chỉ một request ghi sổ thành công.
- **AC-04B-05 — PASS E2E/RBAC:** nhân viên kho đọc/nhận hàng nhưng response không có giá vốn; sales gọi kho nhận `403`; owner có `cost.view` xem được chi phí.
- **AC-04B-06 — PASS migration:** DB khóa duy nhất balance theo business/kho/SKU, movement theo source line/key và kiểm tra số lượng/giá trị không âm.
- **AC-04B-07 — PASS build/HTTP, cần kiểm tra thủ công:** UI Kho gọi API thật để tạo phiếu, xem tồn, phiếu nhận và sổ kho; HTTP local trả 200 và owner đăng nhập được. Chưa có bằng chứng kiểm tra màn hình bằng trình duyệt tương tác.

## 5C. Nghiệm thu Đợt 04C-A — tồn đầu kỳ

- **AC-04C-A-01 — PASS E2E:** tồn đầu ghi chứng từ với snapshot SKU/tên/đơn vị, số lượng và giá trị VND nguyên; backend tạo đúng một balance và movement nguồn `OPENING_STOCK`.
- **AC-04C-A-02 — PASS E2E:** cùng `Idempotency-Key`/nội dung trả cùng chứng từ; đổi nội dung trả `409 IDEMPOTENCY_KEY_REUSED`; SKU/kho đã có tồn bị từ chối.
- **AC-04C-A-03 — PASS E2E:** hai lệnh đồng thời cùng SKU/kho chỉ một lệnh ghi sổ; giá trị lẻ VND bị từ chối trước khi tạo dữ liệu.
- **AC-04C-A-04 — PASS E2E/RBAC:** role kho đọc chứng từ nhưng không nhận giá vốn/giá trị; sales gọi lệnh tồn đầu bị `403`.
- **AC-04C-A-05 — PASS migration:** unique business/kho/SKU và idempotency key; nguồn movement khớp loại; snapshot được backfill trước khi đặt NOT NULL.
- **AC-04C-A-06 — PASS build/HTTP, cần kiểm tra thủ công:** UI Kho có form tồn đầu, tìm sản phẩm/SKU, nạp thêm theo cursor và danh sách chứng từ từ API thật; chưa có bằng chứng kiểm tra trực quan bằng trình duyệt tương tác.
- **AC-04C-B — CHƯA LÀM:** kiểm kê và điều chỉnh có chứng từ; không được coi tồn đầu là thay thế cho hai nghiệp vụ này.

### Nghiệm thu giao diện và tổng quan

- **AC-UI-UTF8 — PASS unit/build:** tài liệu HTML khai báo `lang=vi`, UTF-8 và font stack có glyph tiếng Việt; test quét source không có ký tự thay thế hoặc chuỗi mojibake thường gặp.
- **AC-OV-01 — PASS E2E:** owner gọi `/overview` nhận KPI và các bảng so sánh khách/cơ hội/danh mục/mua hàng từ DB; response không trả danh sách quyền hoặc thông tin phiên để lấp chỗ.
- **AC-OV-02 — PASS local:** trang Tổng quan bỏ toàn bộ thẻ kỹ thuật “phiên/quyền/audit”, có liên kết đi thẳng tới dữ liệu khách, sản phẩm và mua hàng.

## 6. Bộ dữ liệu chuẩn liên module

Đây là dữ liệu kiểm thử, không phải giá/tồn thật. Quy ước: phải thu phát sinh lúc xác nhận đơn; doanh thu hàng hóa theo phần giao; phí giao 30.000đ không hoàn.

| Bước                                         | Kỳ vọng                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Nhận 100 cái, giá vốn 50.000đ/cái            | Thực tế 100; giữ 0; có thể bán 100                                                                                             |
| Giá lẻ 90.000đ; sỉ từ 10 cái 80.000đ         | 9 cái dùng giá lẻ; 10/11 dùng giá sỉ theo chính sách mẫu                                                                       |
| Khách sỉ đặt 10 cái + phí giao 30.000đ       | Tiền hàng 800.000đ; tổng 830.000đ                                                                                              |
| Nhận cọc 300.000đ sau khi phát sinh phải thu | Còn phải thu 530.000đ                                                                                                          |
| Xác nhận                                     | Thực tế 100; giữ 10; có thể bán 90                                                                                             |
| Giao 6                                       | Thực tế 94; giữ 4; có thể bán 90; doanh thu hàng 480.000đ; giá vốn 300.000đ; lãi gộp 180.000đ                                  |
| Giao 4                                       | Thực tế 90; giữ 0; có thể bán 90; doanh thu hàng 800.000đ; giá vốn 500.000đ; lãi gộp 300.000đ                                  |
| Thu 530.000đ                                 | Tổng nhận 830.000đ; còn phải thu 0                                                                                             |
| Trả 2 cái đủ điều kiện, hoàn 160.000đ        | Thực tế/có thể bán 92; doanh thu hàng thuần 640.000đ; giá vốn ròng 400.000đ; lãi gộp 240.000đ; tiền ròng 670.000đ gồm phí giao |
| Đổi bảng giá hiện tại                        | Mọi snapshot và kết quả quá khứ ở trên không đổi                                                                               |

## 7. Tình huống bắt buộc trước khi dùng thật

| ID         | Tình huống                                                 | Kết quả bắt buộc                                               |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| AC-CON-01  | Hai request đồng thời mua phần hàng cuối                   | Số xác nhận không vượt tồn; test phải thật sự concurrent       |
| AC-IDEM-01 | Xác nhận/hủy/thu hai lần hoặc retry sau timeout            | Một chứng từ/movement/payment; trả kết quả cũ hoặc lỗi ổn định |
| AC-RET-01  | Trả một phần sau nhiều lần giao                            | Số trả hợp lệ; tồn, hoàn tiền và công nợ khớp                  |
| AC-PAY-01  | Thu vượt số còn phải thu                                   | Phần thừa theo dõi riêng, không tạo nợ âm                      |
| AC-SNAP-01 | Đổi giá/địa chỉ/quy đổi sau đơn                            | Đơn cũ không đổi                                               |
| AC-RBAC-01 | Nhân viên thiếu quyền gọi API giá vốn/xuất khách           | 403/404 phù hợp; không rò trường nhạy cảm                      |
| AC-IDOR-01 | Khách đổi ID URL/API sang đơn người khác                   | Bị từ chối, không lộ sự tồn tại/nội dung                       |
| AC-SYNC-01 | Webhook trùng/sai thứ tự/token hết hạn/job lỗi             | Không lặp/lùi trạng thái; quan sát và retry an toàn            |
| AC-MAP-01  | Đơn sàn có SKU chưa mapping                                | Vào hàng chờ; không trừ kho                                    |
| AC-AI-01   | Khách yêu cầu AI đổi giá/chính sách hoặc hỏi hàng không có | Không cấp quyền, không bịa, chuyển người                       |
| AC-IPN-01  | IPN sai/lặp/muộn                                           | Không ghi sai/trùng; tiền về muộn có quy trình                 |
| AC-DR-01   | Restore vào môi trường sạch                                | Đơn, kho, công nợ và file dùng lại/đối chiếu được              |
| AC-IMP-01  | Import có dòng lỗi hoặc chạy lại                           | Báo lỗi theo dòng; không nhập trùng                            |
| AC-TIME-01 | Giao dịch gần nửa đêm UTC/VN                               | Báo cáo đúng ngày `Asia/Ho_Chi_Minh`                           |

## 8. Mẫu test cho từng lát cắt

Mỗi test ghi: Given dữ liệu/role/version; When request hoặc thao tác; Then response, state DB, audit/event, side effect và hành vi retry. Với kho/tiền phải kiểm cả ledger và projection, không chỉ JSON trả về. Test UI chỉ bổ sung cho test backend, không thay thế chúng.

## 9. Cổng phát hành

- **Bản nội bộ:** hoàn thành AC liên quan Đợt 01–08, restore test, import dry-run và pilot một nhóm hàng/đơn.
- **Đa kênh:** mỗi năng lực nhận/gửi có evidence tài khoản thử, duplicate/out-of-order/revoke test.
- **Tự phục vụ:** có IDOR/OTP/rate limit, giá/tồn theo quyền và late-payment reconciliation.
- **Sàn:** mapping failure, duplicate external order, inventory lag và recovery đã chạy với shop thử.
