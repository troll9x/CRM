# Kịch bản thử prototype Đợt 00

Prototype ở `prototype/index.html` chỉ dùng để chốt thứ tự thao tác, cách tìm và ngôn ngữ giao diện. Không có API/database; tải lại trang sẽ mất mọi thao tác mô phỏng.

## Cách mở

```powershell
python -m http.server 4173
```

Mở `http://localhost:4173/prototype/` trên máy tính và điện thoại (hoặc thu nhỏ trình duyệt khoảng 390px).

## Kịch bản 15 phút cho người dùng chính

1. **Tổng quan:** trong 10 giây, chỉ ra số hội thoại cần trả lời, đơn cần giao và công nợ quá hạn. Bấm một thẻ để đi tới danh sách liên quan.
2. **Khách hàng:** tìm “Lan” hoặc số điện thoại; xác định khách sỉ/lẻ, người phụ trách và lần mua gần nhất. Cho biết trường nào còn thiếu.
3. **Hội thoại:** chọn tin chưa trả lời; nhìn khung bên phải và cho biết có đủ thông tin để tạo đơn chưa. Bấm “Tạo đơn nháp” và đánh giá vị trí nút.
4. **Tạo đơn:** chọn khách, tìm `TS-DEN-M`, thêm 10 cái, kiểm tra giá sỉ, phí giao và tổng. Chuyển đơn vị thử “hộp” để đánh giá cách hiển thị quy đổi.
5. **Kho:** tìm SKU; phân biệt “thực tế”, “đang giữ”, “không bán được” và “có thể bán”. Nếu khó hiểu, ghi tên gọi người dùng muốn.
6. **Công nợ:** tìm khoản của khách sỉ; phân biệt tổng đơn, đã nhận, còn phải thu và ngày đến hạn. Bấm “Ghi nhận thu” và đánh giá các thông tin cần nhập.
7. Lặp nhanh trên màn hình điện thoại: tạo đơn và xem hội thoại có thao tác được bằng một tay không.

## Phiếu phản hồi cần ghi

| Câu hỏi                                                    | Trả lời       |
| ---------------------------------------------------------- | ------------- |
| Ba việc làm thường xuyên nhất theo đúng thứ tự?            | Chưa ghi nhận |
| Từ màn hình hội thoại, thông tin nào phải nhìn thấy ngay?  | Chưa ghi nhận |
| Tìm hàng chủ yếu bằng tên, SKU, mã vạch hay ảnh?           | Chưa ghi nhận |
| Khi thêm hàng, người dùng chọn cái/hộp/thùng như thế nào?  | Chưa ghi nhận |
| Tên “giữ hàng”, “có thể bán”, “phải thu” có dễ hiểu không? | Chưa ghi nhận |
| Nút xác nhận đơn nên ở đâu, cần cảnh báo gì?               | Chưa ghi nhận |
| Trên điện thoại, phần nào quá chật hoặc nhiều bước?        | Chưa ghi nhận |
| Trường nào đang hiển thị nhưng không cần?                  | Chưa ghi nhận |

Sau buổi thử, chuyển phản hồi thành issue/backlog cụ thể. Không coi việc người dùng thích bố cục là nghiệm thu nghiệp vụ; các đợt sau vẫn phải dùng API và dữ liệu lưu thật.
