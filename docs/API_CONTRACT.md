# Hợp đồng API v1

Tài liệu này khóa quy ước chung. Endpoint Đợt 01–05B đã triển khai và kiểm tra local; OpenAPI sinh từ code tại `/docs-json` là hợp đồng máy đọc được. Các endpoint 05C trở đi vẫn chỉ là dự kiến. Thay đổi phá vỡ phải tạo version mới hoặc có kế hoạch chuyển đổi.

## 1. Quy ước giao tiếp

- Base path: `/api/v1`.
- JSON UTF-8; tên trường `camelCase`; ID truyền dạng chuỗi.
- Timestamp ISO 8601 UTC, ví dụ `2026-09-30T03:15:00.000Z`; ngày nghiệp vụ là `YYYY-MM-DD` kèm quy tắc timezone.
- Tiền: `{ "amount": 830000, "currency": "VND" }`; API không nhận số thập phân cho VND.
- Số lượng: chuỗi decimal khi cần precision, ví dụ `{ "quantity": "10", "unitCode": "CAI" }`.
- Client không gửi hoặc không được tin cậy các trường do server tính như `grandTotal`, `availableStock`, `amountDue`, `cost`.
- `Content-Type: application/json`; file dùng upload flow riêng khi được triển khai.

## 2. Xác thực và quyền

- Staff session tách Customer session. Đợt 01 dùng session phía server, cookie `HttpOnly`, `SameSite=Lax`; request ghi dùng cookie phải qua kiểm tra `Origin`/`Sec-Fetch-Site` với allowlist `WEB_ORIGIN`.
- Mỗi operation khai báo permission; service còn kiểm tra quyền với business/record.
- `403` dùng khi đã xác thực nhưng thiếu quyền; `404` có thể dùng thay `403` cho customer-facing resource để không lộ sự tồn tại.
- Trường nhạy cảm như cost, credential và PII chỉ được serializer phía server đưa vào khi đủ quyền.

## 3. Envelope

### Thành công một bản ghi

```json
{
  "data": {
    "id": "cus_01J...",
    "version": 3
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

### Danh sách

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

Mặc định cursor pagination. Endpoint hỗ trợ filter/sort phải liệt kê allowlist; không chuyển trực tiếp field/query của client cho ORM.

### Lỗi

```json
{
  "error": {
    "code": "INSUFFICIENT_AVAILABLE_STOCK",
    "message": "Không đủ hàng có thể bán để xác nhận đơn.",
    "details": [{ "field": "lines[0].quantity", "reason": "available=9 requested=10" }],
    "retryable": false
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

Không trả stack trace, SQL, token hoặc dữ liệu khách không liên quan.

## 4. Mã lỗi ổn định ban đầu

| HTTP    | Code                                          | Ý nghĩa                                 |
| ------- | --------------------------------------------- | --------------------------------------- |
| 400     | `VALIDATION_ERROR`                            | Payload sai schema                      |
| 401     | `AUTHENTICATION_REQUIRED` / `SESSION_EXPIRED` | Chưa/không còn xác thực                 |
| 403     | `PERMISSION_DENIED`                           | Thiếu quyền hành động/bản ghi           |
| 404     | `RESOURCE_NOT_FOUND`                          | Không tồn tại hoặc cố ý không tiết lộ   |
| 409     | `VERSION_CONFLICT`                            | Bản ghi đã đổi từ lần đọc               |
| 409     | `IDEMPOTENCY_KEY_REUSED`                      | Cùng key nhưng payload khác             |
| 409     | `INVALID_STATE_TRANSITION`                    | Chuyển trạng thái không hợp lệ          |
| 409     | `INSUFFICIENT_AVAILABLE_STOCK`                | Không đủ hàng tại lúc transaction       |
| 409     | `DUPLICATE_EXTERNAL_EVENT`                    | Sự kiện đã xử lý; trả kết quả cũ nếu có |
| 422     | `BUSINESS_RULE_VIOLATION`                     | Dữ liệu đúng schema nhưng sai quy tắc   |
| 429     | `RATE_LIMITED`                                | Vượt giới hạn                           |
| 500/503 | `INTERNAL_ERROR` / `DEPENDENCY_UNAVAILABLE`   | Lỗi server/phụ thuộc, có request id     |

## 5. Idempotency và cạnh tranh

- Các lệnh xác nhận/hủy/xuất/nhận/thu/hoàn và webhook bắt buộc chống trùng.
- Client gửi `Idempotency-Key` cho lệnh có tác động; server lưu actor, operation, request hash, trạng thái và response.
- Cùng key + cùng payload trả cùng kết quả; cùng key + payload khác trả `IDEMPOTENCY_KEY_REUSED`.
- Tạo/giữ/xuất kho và ghi tiền kiểm tra lại bên trong transaction; kiểm tra trước ở UI không đủ.
- Resource sửa thông thường dùng `version`/ETag; stale write trả `VERSION_CONFLICT`.

## 6. Command thay vì sửa trạng thái tùy ý

Không cho client `PATCH status` để tạo tác động nghiệp vụ. Dùng command endpoint rõ ràng:

```text
POST /api/v1/orders/{orderId}/confirm
POST /api/v1/orders/{orderId}/cancel
POST /api/v1/shipments
POST /api/v1/goods-receipts
POST /api/v1/payments
POST /api/v1/returns/{returnId}/receive
```

Mỗi command khai báo quyền, trạng thái trước/sau, idempotency, transaction boundary, audit event và lỗi nghiệp vụ.

## 7. Inventory endpoint theo đợt

Ký hiệu `R` đọc, `C` tạo, `U` sửa master data, `CMD` lệnh nghiệp vụ. Các dòng tới 04C-A đã triển khai; các đợt sau vẫn là inventory hợp đồng dự kiến.

| Đợt   | Resource/operation                                                                                                                                                          | Quyền chính                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 01    | `POST /auth/sessions`, `DELETE /auth/session`, `GET /me`, `GET/POST/PATCH /staff`, `PUT /staff/{id}/roles`, `GET /roles`, `/health/*`                                       | public login / authenticated / `staff.manage`                                         |
| 02    | `GET/POST/PATCH /customers`, `/customers/{id}/addresses`, `/customers/groups`, `/customers/duplicate-candidates`, `/tasks`, `/opportunities`                                | `customers.read/write`, `tasks.manage`, `opportunities.manage`; export vẫn tách riêng |
| 03    | `GET/POST/PATCH /products`, `POST /products/{id}/variants`, `PATCH /variants/{id}`, `PUT /variants/{id}/unit-conversions`, `PUT /variants/{id}/selling-unit`, `POST /products/{id}/media`, `PATCH /media/{id}` | `catalog.read/write`, `media.manage` |

Khi tạo SKU, `sellingUnitCode` tùy chọn chọn đơn vị bán cố định trong đơn vị gốc hoặc một `conversions[].unitCode` đã khai báo cùng request; nếu bỏ trống thì dùng đơn vị gốc. `PUT /variants/{id}/selling-unit` nhận `{ version, sellingUnitCode }`, lấy tên/hệ số từ danh mục quy đổi phía server và chỉ cho đổi trước khi SKU có giá. Danh sách quy đổi không được sửa/xóa nếu làm thay đổi đơn vị bán cố định.
| UI    | `GET /overview`                                                                                                                                                             | `overview.read`; KPI, bảng so sánh và đơn mua gần đây từ dữ liệu thật                 |
| 04A   | `GET/POST/PATCH /suppliers`, `GET/POST/PATCH /purchase-orders`, `POST /purchase-orders/{id}/order`, `POST /purchase-orders/{id}/cancel`                                     | `purchasing.read/write`; đơn mua không tăng tồn                                       |
| 04B   | `GET/POST /goods-receipts`, `GET /warehouses`, `GET /stock-balances`, `GET /stock-movements`                                                                                | `inventory.read/receive`; trường giá vốn chỉ có với `cost.view`                       |
| 04C-A | `GET/POST /stock-openings`                                                                                                                                                  | `inventory.read/adjust`; giá vốn chỉ hiện với `cost.view`                             |
| 04C-B | `GET/POST /stock-adjustments` kiểm kê/điều chỉnh                                                                                                                            | `inventory.read/adjust`; giá vốn chỉ hiện với `cost.view`                             |
| 05A   | `GET /price-tiers`, `PUT /price-tiers`, `GET /price-tiers/resolve`                                                                                                          | `price.edit`; admin set-price, idempotency/version; missing price is unresolved       |
| 05B   | `GET/POST /quotes`, `GET/PATCH /quotes/{id}`, `POST /quotes/{id}/send`, `GET /quotes/{id}/revisions/{n}`                                                                    | `quotes.read/write/send`; giảm và cấu hình thuế cần `price.edit`; quote snapshot/revision |
| 05C   | `/quotes/{id}/convert`                                                                                                                                                       | Chưa triển khai; đơn nháp và thông báo Admin                                           |
| 06    | `/orders`, `/orders/{id}/confirm`, `/orders/{id}/cancel`, `/shipments`                                                                                                      | order create/confirm / fulfillment                                                    |
| 07    | `/payments`, `/payment-allocations`, `/receivables`, `/expenses`, `/refunds`                                                                                                | collect/pay/refund / receivable view                                                  |
| 08    | `/returns`, `/reports/*`, `/imports`                                                                                                                                        | returns / report permission / import                                                  |

Lệnh `POST /goods-receipts` nhận `purchaseOrderId`, `warehouseId`, `notes?` và 1–100 dòng `{ purchaseOrderLineId, receivedQuantity, actualUnitCostVnd }`. Header `Idempotency-Key` bắt buộc; khóa duy nhất theo business, payload khác trả `409 IDEMPOTENCY_KEY_REUSED`. Server ấn định `receivedAt` ở UTC, tính quy đổi/thành tiền/tồn/giá vốn và ghi audit/sổ kho trong một transaction. Dòng nhận vượt số còn lại trả `422 PURCHASE_QUANTITY_EXCEEDED`. Giá vốn trên response bị bỏ nếu không có `cost.view`.

Lệnh `POST /stock-openings` nhận `{ warehouseId, variantId, quantity, unitCostVnd, notes? }`; `quantity` dương tối đa 6 số lẻ theo đơn vị gốc, `unitCostVnd` là số nguyên không âm. Giá trị `quantity × unitCostVnd` phải là số nguyên VND. Header `Idempotency-Key` bắt buộc (8–100 ký tự an toàn), khóa duy nhất theo business; cùng key/nội dung trả cùng chứng từ, khác nội dung trả `409 IDEMPOTENCY_KEY_REUSED`. SKU/kho đã có balance hoặc movement trả `409 OPENING_STOCK_ALREADY_EXISTS`. Backend lấy snapshot SKU/tên/đơn vị từ catalog, ấn định `postedAt` UTC và ghi chứng từ/balance/movement/audit trong transaction Serializable. `GET /stock-openings` hỗ trợ `warehouseId`, `query`, `limit` như các danh sách kho; giá vốn/giá trị bị bỏ khỏi response nếu thiếu `cost.view`.

`POST /stock-adjustments` nhận `{ warehouseId, variantId, expectedVersion, countedQuantity, reason, unitCostVnd?, notes? }`; `countedQuantity` là số không âm tối đa 6 số lẻ theo đơn vị gốc, `reason` bắt buộc. Client gửi version từ balance đã hiển thị; backend tính `quantityDelta = countedQuantity - onHandQuantity`, từ chối chênh lệch 0, version cũ (`409 STOCK_VERSION_CONFLICT`), balance thấp hơn phần đang giữ/không đủ điều kiện bán (`409 STOCK_BELOW_PROTECTED_QUANTITY`) và balance chưa tồn tại. Tăng trên balance còn hàng dùng giá vốn bình quân hiện tại; giảm dùng giá vốn bình quân hiện tại. Theo quy tắc tạm BR-STOCK-10, tăng từ 0 phải gửi `unitCostVnd`; nếu không có sẽ trả `422 ADJUSTMENT_COST_REQUIRED`. `Idempotency-Key` bắt buộc; cùng key/nội dung trả cùng chứng từ, nội dung khác trả `409 IDEMPOTENCY_KEY_REUSED`. Backend snapshot SKU/tên/đơn vị và tồn hệ thống, ấn định `postedAt` UTC, cập nhật balance version, ghi chứng từ/movement/audit trong cùng transaction Serializable. `GET /stock-adjustments` hỗ trợ `warehouseId`, `query`, `limit`; trường giá trị/giá vốn chỉ trả cho `cost.view`. Movement dùng chênh lệch có dấu; giảm tồn ghi số lượng và giá trị âm. Không sửa/xóa chứng từ đã ghi.

`GET /price-tiers?variantId={id}` trả giá admin đã nhập của SKU trong business hiện tại, gồm VND dạng chuỗi nguyên, version, tên sản phẩm/SKU và đơn vị bán cố định. `PUT /price-tiers` nhận `{ variantId, quantityFrom, expectedVersion, priceVnd }`; `quantityFrom` là 1 cho giá lẻ hoặc bội số 5 từ 5 trở lên; `priceVnd` là chuỗi VND nguyên dương, `null` xóa giá. Cần `price.edit` và header `Idempotency-Key`. Cùng key/nội dung trả kết quả gốc; dùng lại key với payload khác trả `409 IDEMPOTENCY_KEY_REUSED`; version cũ trả `409 PRICE_TIER_VERSION_CONFLICT`. Giá lưu theo SKU/bậc cho business hiện tại. `GET /price-tiers/resolve?variantId={id}&quantity={n}` nhận số thập phân dương tối đa 6 chữ số: dưới 5 chọn giá lẻ bậc 1, từ 5 trở lên chọn `floor(n/5)*5`; thiếu giá trả `PRICE_NOT_CONFIGURED` và không trả số tiền. Endpoint chưa tạo báo giá/đơn và chưa áp dụng giảm thêm.

Hợp đồng 05B: `POST /quotes` nhận `{ customerId, lines: [{ variantId, quantity, discountMode?, discountValue? }], orderDiscountMode?, orderDiscountValue?, shippingFeeVnd?, taxMode?, taxValue?, depositVnd?, paymentNote? }`. Số lượng/VND/tỷ lệ truyền dạng chuỗi thập phân; server phân giải bậc admin, làm tròn từng dòng half-up VND, tính giảm/tổng/thuế/cọc. Giảm dòng được áp dụng trước giảm toàn báo giá; mỗi loại giảm không được vượt số tiền làm cơ sở. Thiếu giá trả `422 PRICE_NOT_CONFIGURED`. Giảm dòng/toàn báo giá và thuế do server kiểm soát quyền `price.edit`; sales có thể tạo nháp/gửi nhưng không tự đặt giảm/thuế. `Idempotency-Key` bắt buộc; cùng key/nội dung trả kết quả cũ, payload khác `409 IDEMPOTENCY_KEY_REUSED`.

`PATCH /quotes/{id}` chỉ sửa `DRAFT`, cần `expectedVersion` và `Idempotency-Key`; stale version trả `409 QUOTE_VERSION_CONFLICT`. Sửa bảng giá không thay giá trong báo giá nháp đã lưu hoặc revision. `POST /quotes/{id}/send` nhận `{ expectedVersion, receivedAt }`; ghi nhận việc người dùng đã chia sẻ thủ công, tạo revision snapshot bất biến và `expiresAt = receivedAt + 72h`; không tự gửi email/Zalo/Facebook. `GET /quotes/{id}/revisions/{n}` trả snapshot dùng để in/lưu PDF bằng trình duyệt. Tạm dùng: thuế mỗi báo giá chọn `PERCENTAGE` hoặc `FIXED_VND`; tỷ lệ tính trên tiền hàng sau giảm cộng phí giao, không gồm cọc. Cơ sở thuế này cần xác nhận trước vận hành thật. `convert` thuộc 05C chưa triển khai.

## 8. Ví dụ hợp đồng xác nhận đơn

```http
POST /api/v1/orders/ord_01J.../confirm
Idempotency-Key: 2a93c3f8-...
Content-Type: application/json

{
  "version": 4,
  "creditOverrideApprovalId": null
}
```

Server phải: tải đơn trong phạm vi business; kiểm tra permission; kiểm tra transition; tính lại giá/tổng; kiểm tra điều kiện nợ; khóa balance cần thiết; tạo reservation; ghi event/audit/idempotency record; commit một lần. Response trả snapshot mới và `version`; không dựa trên `availableStock` do client gửi.

## 9. Webhook và job (khi tới đợt tích hợp)

- Endpoint theo connector, xác minh chữ ký trước parse nghiệp vụ; raw payload lưu tối thiểu theo chính sách dữ liệu.
- Trả nhanh sau khi ghi duy nhất `WebhookEvent`; xử lý nền có retry/backoff/dead-letter.
- Event key gồm connector + account/shop + external event id. Sai thứ tự được so với version/event time, không làm lùi trạng thái.
- Outbound side effect dùng transactional outbox; worker không nhân đôi logic giá/kho/đơn.

## 10. OpenAPI checklist từ Đợt 01

Mỗi endpoint phải có schema request/response, permission, error codes, idempotency behavior, pagination/filter, ví dụ Việt hóa và trường nhạy cảm. Contract test phải chứng minh response khớp schema và các trường không được phép không bị lộ.
