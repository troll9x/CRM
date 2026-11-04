# AI phân tích khách hàng trên VPS

Lát cắt 01 dùng Ollama `0.12.11` và model `qwen3:1.7b` trên CPU. API chỉ gửi số đơn đã giao, giá trị hàng giao, ngày giao và tối đa 3 ID đơn gần nhất tới model. Không gửi tên, số điện thoại, email, địa chỉ hoặc hội thoại. Model chỉ gợi ý; các số liệu hiển thị được backend tính từ chứng từ.

## Khởi tạo model

Model phải được tải vào volume `crm_ai_benchmark` **trước khi** bật mạng nội bộ `ai_internal`. Trên VPS có mạng ra ngoài để tải trọng số, chạy:

```sh
docker run -d --name crm-ai-bootstrap -v crm_ai_benchmark:/root/.ollama ollama/ollama:0.12.11
docker exec crm-ai-bootstrap ollama pull qwen3:1.7b
docker stop crm-ai-bootstrap
docker rm crm-ai-bootstrap
docker compose --profile ai --env-file .env.production -f compose.production.yaml up -d ollama
```

Container `ollama` chỉ nối `ai_internal`, không mở port ra host. API cũng nối mạng này và gọi `http://ollama:11434` cố định. Mỗi yêu cầu AI tải model rồi giải phóng; backend chỉ nhận một yêu cầu đồng thời và giới hạn nhân viên phân tích lại cùng khách trong 5 phút. Timeout 90 giây.

## Kiểm tra

1. `docker compose --profile ai --env-file .env.production -f compose.production.yaml ps` phải cho thấy `api`, `web`, `db`, `ollama` đang chạy.
2. Nhân viên có `customers.read` và `orders.read` mở hồ sơ khách. Nếu chưa có đơn đã xác nhận và giao đủ, nhấn **Phân tích bằng AI** phải trả “Chưa có đơn đã giao”, không gọi model.
3. Với dữ liệu kiểm thử tách production, so sánh số đơn, tổng giá trị hàng giao và ngày giao gần nhất với chứng từ. Gợi ý phải có ID đơn hợp lệ. Nút **Hữu ích/Chưa đúng** ghi phản hồi vào audit log.
4. Thử tài khoản thiếu quyền, customer ngoài business, model ngắt kết nối, ID chứng cứ giả và gọi lại trong 5 phút. Không có hành động gửi tin, đổi đơn, giá, kho hoặc tiền từ AI.

Ngày 04/11/2026, model được đo trên VPS với dữ kiện tổng hợp giả lập 2 đơn: phản hồi JSON tiếng Việt đúng số và ID, mất khoảng 75 giây, RAM container xấp xỉ 2 GiB. Đây là kiểm thử model bằng dữ liệu giả lập, chưa phải xác nhận độ chính xác trên dữ liệu khách thật. Production lúc kiểm tra có 0 customer, 0 sales order, 0 shipment nên chỉ có thể xác minh nhánh thiếu dữ liệu cho đến khi có chứng từ thật.

## Bằng chứng triển khai 04/11/2026

- Source VPS ở commit `24d4570`; API và web cùng image `sha256:9ab4b87d698d6ab94725438c0b28dd578d8932806a28d4d3256c4688b0e2fc40`.
- `api` và `db` healthy, `web` và `ollama` chạy. HTTPS `/` trả 200, `/api/v1/health/ready` trả 200, POST AI chưa đăng nhập trả 401.
- API container gọi được `/api/tags` của Ollama và thấy `qwen3:1.7b`. Mạng `ai_internal` có `Internal=true`; Ollama không publish cổng 11434 ra host.
- Gọi `/api/generate` từ chính API container bằng dữ kiện tổng hợp 2 đơn trả 200 sau 57 giây, JSON tiếng Việt có 2 ID đơn hợp lệ và tổng 300.000 VND đúng đầu vào. Trong lúc chạy, public health vẫn 200; Ollama dùng khoảng 1,7 GiB RAM. Đây là dữ kiện thử, không phải kết quả khách thật.
- VPS còn khoảng 5,1 GB sau dọn cache build. Chưa xác minh giao diện hồ sơ khách và kết quả AI trên chứng từ production vì hiện chưa có customer/đơn. Chưa coi đây là nghiệm thu độ chính xác của model.
