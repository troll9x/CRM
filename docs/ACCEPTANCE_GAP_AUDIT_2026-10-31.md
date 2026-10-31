# Đối chiếu kế hoạch gốc trước nghiệm thu — 31/10/2026

Nguồn đối chiếu: [`ke-hoach-vibe-code-crm.md`](../ke-hoach-vibe-code-crm.md), đặc biệt mục 4, 6.1, 7.2 và 7.3. Trạng thái dưới đây phân biệt **có code**, **đã kiểm local**, **đã quan sát production** và **đã được người dùng nghiệm thu**. Không suy từ HTTP 200 hoặc giao diện có nút ra việc nghiệp vụ đã đạt.

## Kết luận cổng nghiệm thu

**Chưa đạt bản nội bộ đầu tiên (hết Đợt 08) theo kế hoạch gốc.** Tại đầu lần đối chiếu, production chạy commit `48c8ac5` và API healthy, nhưng kiểm tra chỉ số lượng bản ghi ngày 31/10 cho thấy `customers=0`, `products=0`, `product_variants=0`, `sales_orders=0`, `shipments=0`, `payment_receipts=0`, `return_requests=0`, `product_import_commands=0`. Có 4 hội thoại và 8 tin nhắn; đó không chứng minh luồng bán hàng. Chưa chạy kịch bản liên module với dữ liệu thật tại production. Không tạo dữ liệu mẫu trong database vận hành để làm đẹp dashboard.

Đã có code cho nhiều module 01–08 và kiểm thử PostgreSQL scratch từng lát cắt; đây là bằng chứng kỹ thuật, chưa phải chữ ký nghiệm thu của người vận hành. Import Excel Shopee đã deploy và 6/6 E2E catalog pass trên DB scratch ngày 30/10, nhưng chưa thử với file Shopee thực tế và tài khoản production.

## Khoảng thiếu theo bản phát hành

| Mức | Yêu cầu trong kế hoạch gốc | Hiện trạng xác minh được | Việc phải hoàn thành để đóng |
| --- | --- | --- | --- |
| P0 | Một đơn sỉ và một đơn lẻ trọn luồng, có giữ hàng, thu tiền, giao và đối chiếu (mục 1, 6.1, 7.1) | Code cho nháp/xác nhận/giao đủ/thu tiền; production chưa có khách, SKU hay đơn. | Chốt dữ liệu hàng thật và chính sách còn mở; nhập catalog, giá, tồn đầu; người vận hành chạy 2 kịch bản trên môi trường thử tách production, đối chiếu từng chứng từ/ledger và lỗi quyền/trùng. |
| P0 | Giao nhiều đợt, trả một phần và hoàn tiền/nợ đúng (4.6–4.8, 7.1–7.2) | Shipment hiện xuất đủ một lần; return/QA ghi kho nhưng chưa có chứng từ hoàn tiền hoặc điều chỉnh phải thu, báo cáo vẫn gross. | Đặc tả và code giao một phần, chứng từ hoàn/giảm nợ, idempotency/concurrency, báo cáo net; E2E số học 10→6→4→trả 2. |
| P0 | COD và mua nợ vận hành (4.7–4.8) | Quy tắc hiện yêu cầu thu đủ trước xác nhận; COD và nợ chưa có luồng chốt tương thích. | Chủ dự án chốt điều kiện xác nhận COD/nợ, hạn mức và thời điểm ghi phải thu; sau đó triển khai và kiểm đối soát COD. Không tự đổi chính sách tiền. |
| P0 | Nghiệm thu giao diện và dữ liệu vận hành (7.3) | Nhiều mục trong `ACCEPTANCE.md` còn browser check; chưa có file Shopee mẫu của cửa hàng; production nghiệp vụ rỗng. | Kiểm trực quan desktop/mobile, tiếng Việt, đăng nhập và thao tác từng màn bằng tài khoản có vai trò phù hợp; ghi kết quả và lỗi. Không dùng fixture để tuyên bố live. |
| P0 | Backup dữ liệu cùng file và phục hồi (4.16, 7.2.12) | Backup PostgreSQL trước deploy 30/10 đã phục hồi thử 71 bảng trên DB riêng. Chưa có lịch backup, bản sao ngoài VPS, kiểm phục hồi file/media. | Thiết lập backup định kỳ + off-host, retention, mã hóa/quyền, cảnh báo thất bại, thử phục hồi DB và file trên môi trường tách biệt. |
| P1 | Nhập khách/SKU/đơn từ file với lỗi dòng/chạy lại (7.2.13) | Chỉ có import **catalog** `.xlsx` Shopee tạo mới; chưa có import khách/đơn, chưa thử workbook thực tế. | Lấy file mẫu đã ẩn dữ liệu nhạy cảm; kiểm mapping/preview/apply/replay trên staging; xây riêng import khách/đơn với báo cáo lỗi và chống trùng. |
| P1 | Giá vốn nhập, hàng lỗi, cảnh báo tồn thấp (4.4) | Có giá vốn bình quân/ledger và khu chờ xử lý đổi trả; phân bổ chi phí nhập, cảnh báo tồn thấp và BR-STOCK-10 chưa chốt/đủ chứng cứ. | Chốt `OPEN-02` và BR-STOCK-10, triển khai các chứng từ/cảnh báo còn thiếu, đối chiếu ledger với balance. |
| P1 | Dashboard tiền, nợ, tồn, doanh thu thuần/lãi gộp; bộ lọc truy chứng từ (4.15) | Có so sánh nhóm/catalog/mua hàng và báo cáo doanh thu hàng **đã giao gross**; chưa có báo cáo net sau trả/hoàn, lãi gộp, chi phí, drill-down đủ loại. Production không có dữ liệu bán để vẽ biểu đồ có ý nghĩa. | Sau khi chốt quy tắc hoàn/giá vốn, triển khai báo cáo net và đối chiếu chứng từ; kiểm ngày Việt Nam và quyền giá vốn. UI tổng quan rỗng được giảm nhiễu trong lát cắt này. |
| P1 | Hộp thư Facebook/Zalo hai chiều đã kiểm chứng (4.9, Đợt 09) | Page Lào Cai có inbound production; chưa có tin mới và reply CRM xuất hiện trên Messenger được đối chiếu; Page thứ hai và comment reply chưa đạt; Zalo OA chưa có live grant. | Tài khoản thử gửi tin mới từng Page, reply từ CRM, đối chiếu Meta/DB/UI/echo, quyền comment; thử Zalo OA khi có grant thật. |
| P2 | Website khách, AI, thanh toán online, sàn, marketing, API đối tác (Đợt 10–15) | Chưa phải bản phát hành đầu; code nền tích hợp không đồng nghĩa connector/website/AI/payment live. | Lập nhiệm vụ riêng theo phụ thuộc, tài khoản/scope/provider và tiêu chí nghiệm thu của từng đợt; không ghi DONE trước khi có test thật. |

## Thứ tự khắc phục

1. **Cổng dữ liệu/chính sách:** xác nhận `OPEN-02`, BR-STOCK-10, điều kiện COD/nợ và thời hạn trả; lấy file mẫu Shopee đã loại dữ liệu nhạy cảm. Việc này quyết định schema/ledger và dữ liệu nhập.
2. **Cổng bản nội bộ:** giao nhiều đợt → hoàn/giảm nợ → COD/nợ → báo cáo net/giá vốn/chi phí; kiểm concurrency, idempotency, quyền và ví dụ số học mục 7.1.
3. **Cổng người dùng:** staging tách biệt, dữ liệu thử đại diện, kiểm màn hình desktop/mobile, nhập sản phẩm thực tế, hai đơn mẫu và lỗi; lưu biên bản đạt/chưa đạt theo `ACCEPTANCE.md`.
4. **Cổng vận hành:** backup ngoài VPS và phục hồi DB+file, giám sát, kế hoạch rollback; mới chuyển dữ liệu khách thật sau khi đạt.
5. **Các đợt 09–15:** nghiệm thu riêng từng connector và module theo quyền/provider; không dùng tính năng Đợt 10–15 làm điều kiện cho bản nội bộ đầu tiên nếu chưa được đổi phạm vi.

## Giới hạn của lần đối chiếu

Đây là kiểm tra code/tài liệu, số lượng bản ghi production và các kiểm thử đã có. Chưa có phiên thao tác trực quan đầy đủ của người dùng chính, chưa có workbook Shopee thật, chưa thử outbound provider mới trong lần này. Các trạng thái `DONE LOCAL` trong tài liệu cũ vẫn cần được xác minh lại trên build hiện tại trước khi ký nghiệm thu.
