# FB-MEDIA-SOURCE-LINK-01 — Ảnh Messenger và liên kết bài viết nguồn

Ngày 2026-11-04. Phạm vi: hộp thư Facebook đã kết nối, dùng dữ liệu Meta thật đã lưu theo Page.

## Luồng và bất biến

- Người có `integrations.read` và quyền đọc đúng Page được xem ảnh của tin nhắn thuộc hội thoại trong business. Đầu vào: ID hội thoại, ID tin, vị trí ảnh (0–9). Đầu ra: bytes ảnh JPEG/PNG/WebP/GIF, tối đa 8 MB; API không trả token hay signed CDN URL cho trình duyệt.
- Backend hỏi Graph theo external message ID để lấy URL ảnh mới, vì URL lưu từ webhook có thể hết hạn. Nếu Graph lỗi, thử URL đã lưu sau khi kiểm host. Chỉ tải HTTPS từ `fbcdn.net` hoặc `fbsbx.com`; mọi chuyển hướng cũng phải thuộc các host đó. Không lưu ảnh lâu dài.
- Người có cùng quyền xem Page được mở bài viết kèm bình luận qua permalink của comment. Đầu vào: ID comment CRM. Backend dùng `sourceUrl` hợp lệ đã lưu, hoặc hỏi Graph theo external comment ID, kiểm URL HTTPS Facebook rồi lưu lại. Không tự ghép URL từ post ID.
- Lỗi: bản ghi sai business/không tồn tại trả 404; thiếu quyền hành động/Page bị chặn; Page cần kết nối lại trả 409; Meta hoặc ảnh không truy cập được trả 502; ảnh quá 8 MB trả 413; MIME không hỗ trợ trả 415. UI cho thử lại khi nguồn tạm lỗi.
- Không sửa lịch sử tin/bình luận, không ghi kho, tiền, khách hàng hoặc đơn. Không có migration.

## Nghiệm thu

1. Tin có ảnh/sticker thật hiển thị ảnh trong hội thoại đúng Page, kể cả URL webhook cũ đã hết hạn khi Graph còn trả ảnh mới.
2. Bình luận không có `sourceUrl` trong DB có nút mở bài viết và bình luận sau khi Meta trả permalink; lần sau đọc từ giá trị đã lưu.
3. Người không có quyền Page hoặc truy cập ID business khác không lấy được ảnh/liên kết.
4. URL ảnh ngoài host Meta, redirect ngoài host Meta, tệp không phải ảnh và ảnh vượt giới hạn bị từ chối; token và signed URL không xuất hiện trong JSON tin nhắn.
5. Chạy unit test, typecheck, lint, build; kiểm tra trình duyệt với tài khoản có quyền Page trước khi xác nhận UI live.

## Bằng chứng và giới hạn

- Kiểm tra read-only trên Meta Page đang kết nối ngày 2026-11-04: Graph trả permalink cho comment ID; Graph trả URL ảnh mới cho cả 4 tin có metadata ảnh, cả 4 ảnh mới trả HTTP 200. Hai trong năm URL ảnh cũ trả 403. Đây là bằng chứng nguồn provider, chưa tự nó xác nhận giao diện sau triển khai.
- Ảnh được tải khi mở hội thoại, không có bản lưu bền vững. Khi Page token mất quyền hoặc Meta không trả ảnh, người dùng sẽ thấy lỗi và nút thử lại.
