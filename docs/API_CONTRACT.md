# Hợp đồng API v1

## API đa kênh (local implementation; provider rollout vẫn chờ credentials/evidence)

- `GET/POST /integrations/connections`: xem/khai báo external account; tạo mới luôn `NEEDS_SETUP`, không giả nhận OAuth.
- `GET /integrations/providers/preflight` (`connectors.manage`): tên cấu hình server còn thiếu và trạng thái adapter; không trả secret. Facebook và Zalo OA có `canStartAuthorization=true` chỉ khi đủ cấu hình hợp lệ; Shopee/TikTok Shop vẫn false.
- Preflight là chẩn đoán cho người triển khai, không phải biểu mẫu để chủ Page nhập App ID/secret. UI mặc định chỉ báo tính năng sẵn sàng hay chưa; chi tiết tên biến nằm trong mục kỹ thuật thu gọn. Cấu hình app thuộc backend dùng chung, không nằm trong từng `IntegrationConnection`.
- `POST /integrations/oauth/facebook/start` (`connectors.manage`) nhận `{ reconnectConnectionId? }`, trả `{ attemptId, expiresAt, authorizationUrl }`. Reconnect ID phải cùng business/provider. URL chỉ chứa app ID, redirect, scope/config ID và state ngẫu nhiên; không có secret/token.
- Public `GET /integrations/oauth/facebook/callback` nhận `state` và `code` hoặc `error`, claim attempt PENDING atomically và redirect 303 về `WEB_ORIGIN` cấu hình cố định với attempt ID/status. Unknown/expired/replayed state trả 400/409. Callback không trả token.
- `GET /integrations/oauth/facebook/attempts/:id` và `POST .../:id/finalize` (`connectors.manage`) gắn actor/business của attempt; finalize nhận `{ pageIds: string[] }` gồm 1–50 Page không trùng từ danh sách Graph cấp, hoặc `{ pageId }` cũ cho một Page. Reconnect chỉ nhận đúng một Page và đúng connection cũ. Thiếu task Page, scope, subscription hoặc ID không hợp lệ bị từ chối. Thành công upsert từng connection cùng business/Page trong một transaction, giữ history/mapping và mã hóa token riêng; bản mới trả `{ connections: [{ id, status, displayName }] }`, bản cũ trả một connection. Lặp finalize trả 409. Nếu một Page không subscribe được, DB không lưu kết nối nào từ attempt và có thể thử lại; các Page đã subscribe trước lỗi có thể còn ở upstream. `pageSubscription=VERIFIED` chỉ xác nhận Page-level `subscribed_apps`; `webhookSubscription=APP_CONFIGURATION_PENDING` cho tới khi webhook app-level và delivery inbound được xác minh.
- `POST /integrations/oauth/facebook/connections/:id/disconnect` (`connectors.manage`) dừng local sync, xóa ciphertext local, giữ history. Response `upstreamUnsubscribed=false`: không tuyên bố đã revoke subscription phía Meta.
- `GET /integrations/connections/:id/staff-access` và `PUT /integrations/connections/:id/staff-access/:staffId` (`connectors.manage`): chỉ connection và nhân viên ACTIVE cùng business; PUT nhận `{canRead:boolean,canSend:boolean}` với `canSend` yêu cầu `canRead`; cả hai false thu hồi quyền. Audit cùng transaction. Người có `connectors.manage` xem/quản lý mọi connection; nhân viên khác cần grant riêng cho từng connection ngoài RBAC vai trò. GET connections/inbox/comments/tickets/orders lọc theo grant; API bản ghi social kiểm connection nguồn ở backend, gửi Messenger/reply comment cần `canSend`. Quote tạo từ chat cũng kiểm grant đọc Page nguồn. Không gộp danh tính hai Page theo tên.
- `POST /integrations/oauth/zalo/start` (`connectors.manage`) nhận `{ reconnectConnectionId? }`, trả `{ attemptId, expiresAt, authorizationUrl }`; URL OA permission chứa state và PKCE challenge, verifier chỉ lưu mã hóa phía backend.
- Public `GET /integrations/oauth/zalo/callback` nhận `state`, `code`, `oa_id` hoặc `error`; claim một lần, đổi code tại OA token endpoint, xác minh metadata từ `/v2.0/oa/getoa`, đối chiếu callback OA ID rồi redirect 303 về `WEB_ORIGIN` với attempt/status, không đưa token/code ra frontend.
- `GET /integrations/oauth/zalo/attempts/:id`, `POST .../:id/finalize` (`connectors.manage`): actor/business scoped; finalize nhận `{ oaId }` chỉ đúng OA đã xác minh, upsert cùng connection/history, mã hóa access/refresh token. Worker làm mới token gần expiry dưới DB lock; refresh hết hạn yêu cầu reconnect. Lặp finalize trả 409.
- `POST /integrations/oauth/zalo/connections/:id/disconnect` (`connectors.manage`) dừng sync và xóa token local, giữ history, trả `upstreamUnsubscribed=false`. OAuth không tự chứng minh app-level webhook đã cấu hình; capability ghi `APP_CONFIGURATION_PENDING` tới khi sự kiện thật được thử.
- Facebook/Zalo webhook chỉ route tới connection có `status=CONNECTED|REAUTH_REQUIRED` và `capabilities.authorization=VERIFIED`; signed delivery không tự cấp quyền hoặc tự đổi status. Khai báo Page/OA thủ công không đủ điều kiện dispatch.
- `POST /integrations/identities/:id/link-preview`, `POST .../link-customer`, `POST .../transfer-customer`, `POST .../unlink-customer`: preview/link/chuyển/gỡ identity social. Lệnh ghi cần `integrations.customer.link`, `integrations.read`, `customers.read`, expected version và trạng thái Customer hiện tại; chuyển/gỡ là thao tác riêng có audit. External user ID được mask trong response.
- `GET /integrations/connections` trả thêm `webhookEventObserved`, chỉ đúng khi đã xử lý job `MESSAGE`/`COMMENT` thành công; backfill không làm cờ này thành true. `GET /integrations/inbox`, `GET /integrations/comments`, `PATCH /integrations/conversations/:id`, `POST /integrations/conversations/:id/notes`. `GET /integrations/conversations/:id/messages?limit=1..100&cursor?` yêu cầu `integrations.read`, kiểm quyền business trên hội thoại và cursor; trả `{items,nextCursor}` theo `providerAt` giảm dần, chỉ dữ liệu tin trong hội thoại đó, có `importJobId` để phân biệt tin lịch sử.
- `POST /integrations/conversations/:id/mark-read` (`integrations.inbox.manage`) xóa `unreadAt` nếu hội thoại cùng business, lặp lại an toàn; không đổi trạng thái hội thoại. Chi tiết tin trả thêm `mediaMetadata` khi provider đã lưu.
- `GET /integrations/tickets` và `GET /integrations/assignees` (`integrations.read`) chỉ trả bản ghi/nhân viên ACTIVE cùng business; danh sách ticket tối đa 100 mục gần nhất. `POST /integrations/tickets` (`integrations.inbox.manage`) nhận `{sourceType: CONVERSATION|COMMENT, sourceId, requestKey, kind, priority, summary, labels?, assignedStaffId?}`. Nguồn và assignee khác business trả 404. Cùng request key/payload trả ticket cũ; khác payload trả 409. `PATCH /integrations/tickets/:id` nhận `{expectedVersion, kind?, priority?, status?, summary?, labels?, assignedStaffId?}`; version cũ/đóng trái vòng đời trả 409. Loại: `PRODUCT|QUOTE|ORDER|DELIVERY|COMPLAINT|OTHER`; ưu tiên `NORMAL|HIGH|URGENT`; trạng thái `OPEN|IN_PROGRESS|WAITING|RESOLVED|CLOSED`. Event audit ghi cùng transaction. Không có endpoint gửi reply từ CRM trong lát cắt này.
- `POST /integrations/comments/:id/link-customer` không chấp nhận comment author ID làm Messenger identity khi chưa có mapping được xác minh.
- `GET /integrations/orders`, `POST /integrations/orders/:id/link-customer`, `POST /integrations/product-mappings`.
- `GET /integrations/jobs`, `POST /integrations/jobs/:id/retry` (connector manager only).
- Public `GET/POST /webhooks/facebook`: challenge trả plain text; POST requires raw-body Meta `x-hub-signature-256`; nhận Page Messenger/feed-comment event, lưu durable job trước response. Public `POST /webhooks/zalo` chỉ nhận event inbound được hỗ trợ khi chữ ký `X-ZEvent-Signature` hợp lệ và đúng một OA đã xác minh; không mở endpoint giả cho Shopee/TikTok.

### SOCIAL-IDENTITY-01 — Customer duplicate và merge

- `GET /customers/duplicate-suggestions` liệt kê đề xuất Customer pair pending; `POST /customers/{id}/duplicate-suggestions/scan` nhận `{ version }` để scan incremental từ Customer vừa đổi; `POST /customers/duplicate-suggestions/{suggestionId}/decision` nhận `{ decision, versionA, versionB, reason? }`. Decision là `CONFIRM_SAME`, `REJECT` hoặc `REVIEW_AGAIN`; lý do bắt buộc cho REJECT/REVIEW_AGAIN. Đây là quyết định review, không tự merge.
- Matching dùng exact normalized phone/email hoặc tên kèm địa chỉ có cấu trúc đầy đủ; chỉ giống tên, avatar, phone bị mask hoặc nội dung tin nhắn không tạo bằng chứng. 0/+84 được quy về cùng phone VN; email không bỏ dấu chấm/`+tag`. Suggestion lưu fingerprint/version và chống tạo lại khi cùng evidence đã bị reject.
- `POST /customers/{sourceId}/merge-preview` nhận `{ targetCustomerId }`; `POST /customers/{sourceId}/merge` nhận `{ targetCustomerId, sourceVersion, targetVersion }` cùng `Idempotency-Key`. Cần `customers.read` và `customers.merge`; service kiểm thêm quyền trên từng loại quan hệ bị chuyển. Target profile fields được giữ; source redirect thành `MERGED`. Owner khác nhau hoặc xung đột số dư tín dụng bị chặn để xử lý thủ công. Cùng key/payload trả kết quả cũ; khác payload trả conflict.
- Merge chỉ chuyển liên kết lịch sử, không sửa snapshot chứng từ và không phát sinh event/AdminAlert, kho hay tiền. ID cũ resolve về target trong detail/timeline; không xóa source.
- Identity-to-Customer auto-suggestion chưa có vì model provider hiện không có phone/email đã xác minh; tìm/link thủ công qua S2 vẫn khả dụng. Facebook OAuth code local đã có; credentials/consent/provider evidence vẫn thiếu.

Tất cả API quản trị yêu cầu session, permission và tenant-scoped lookup. Payload đơn ngoài lưu decimal strings thành Decimal, không có API chuyển sang SalesOrder trong lát cắt này.

Tài liệu này khóa quy ước chung. Endpoint Đợt 01–07, 08A đổi trả và 08B báo cáo giao hàng được triển khai/kiểm tra local; OpenAPI sinh từ code tại `/docs-json` là hợp đồng máy đọc được. COD, hoàn tiền, báo cáo net sau trả và connector Facebook vẫn chưa hoàn tất. Thay đổi phá vỡ phải tạo version mới hoặc có kế hoạch chuyển đổi.

## 1. Quy ước giao tiếp

### Hồ sơ khách hàng 360° (Đợt A)

- `GET /api/v1/customers/{id}/timeline?limit=20&cursor=...` yêu cầu `customers.read`; giới hạn 1–50, cursor opaque base64url. Trả danh sách theo thời điểm tạo giảm dần và khóa type/id ổn định, `sourceId`, loại hoạt động, trạng thái hiện tại và `hasMore/nextCursor`.
- Timeline chỉ truy vấn từng nguồn theo quyền: `tasks.manage`, `opportunities.manage`, `quotes.read`, `orders.read`, `receivables.view`; ghi chú chỉ dành cho business hiện tại. Không trả count hoặc preview của module người xem thiếu quyền. `amountVnd` của quote/order chỉ là tổng snapshot chứng từ; phiếu thu là tiền thực nhận, không phải doanh thu. Hội thoại/bình luận/ticket/đơn staging không được tự suy ra từ snapshot và chưa vào timeline này.
- `POST /api/v1/customers/{id}/notes` yêu cầu `customers.write`; body `{ content }` tối đa 2.000 ký tự. Ghi chú append-only vào `customer_notes`, actor/time UTC và audit `customer.note.created`; khách ngoài business trả 404.
- `GET /customers/{id}` và `GET /customers` không trả task/opportunity hoặc count của module đó nếu thiếu quyền module tương ứng.
- Timeline dùng thời điểm tạo và trạng thái hiện tại của bản ghi, không giả lập lịch sử chuyển trạng thái/gửi/giao từ snapshot. `DRAFT` được gắn nhãn “Đơn nháp”, không có trường “đã mua” hay doanh thu ở hồ sơ.

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

| Đợt | Resource/operation                                                                                                                                                                                             | Quyền chính                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 01  | `POST /auth/sessions`, `DELETE /auth/session`, `GET /me`, `GET/POST/PATCH /staff`, `PUT /staff/{id}/roles`, `GET /roles`, `/health/*`                                                                          | public login / authenticated / `staff.manage`                                         |
| 02  | `GET/POST/PATCH /customers`, `/customers/{id}/addresses`, `/customers/groups`, `/customers/duplicate-candidates`, `/tasks`, `/opportunities`                                                                   | `customers.read/write`, `tasks.manage`, `opportunities.manage`; export vẫn tách riêng |
| 03  | `GET/POST/PATCH /products`, `POST /products/{id}/variants`, `PATCH /variants/{id}`, `PUT /variants/{id}/unit-conversions`, `PUT /variants/{id}/selling-unit`, `POST /products/{id}/media`, `PATCH /media/{id}` | `catalog.read/write`, `media.manage`                                                  |

Khi tạo SKU, `sellingUnitCode` tùy chọn chọn đơn vị bán cố định trong đơn vị gốc hoặc một `conversions[].unitCode` đã khai báo cùng request; nếu bỏ trống thì dùng đơn vị gốc. `PUT /variants/{id}/selling-unit` nhận `{ version, sellingUnitCode }`, lấy tên/hệ số từ danh mục quy đổi phía server và chỉ cho đổi trước khi SKU có giá. Danh sách quy đổi không được sửa/xóa nếu làm thay đổi đơn vị bán cố định.
| UI | `GET /overview` | `overview.read`; KPI, bảng so sánh và đơn mua gần đây từ dữ liệu thật |
| 04A | `GET/POST/PATCH /suppliers`, `GET/POST/PATCH /purchase-orders`, `POST /purchase-orders/{id}/order`, `POST /purchase-orders/{id}/cancel` | `purchasing.read/write`; đơn mua không tăng tồn |
| 04B | `GET/POST /goods-receipts`, `GET /warehouses`, `GET /stock-balances`, `GET /stock-movements` | `inventory.read/receive`; trường giá vốn chỉ có với `cost.view` |
| 04C-A | `GET/POST /stock-openings` | `inventory.read/adjust`; giá vốn chỉ hiện với `cost.view` |
| 04C-B | `GET/POST /stock-adjustments` kiểm kê/điều chỉnh | `inventory.read/adjust`; giá vốn chỉ hiện với `cost.view` |
| 05A | `GET /price-tiers`, `PUT /price-tiers`, `GET /price-tiers/resolve` | `price.edit`; admin set-price, idempotency/version; missing price is unresolved |
| 05B | `GET/POST /quotes`, `GET/PATCH /quotes/{id}`, `POST /quotes/{id}/send`, `GET /quotes/{id}/revisions/{n}` | `quotes.read/write/send`; giảm và cấu hình thuế cần `price.edit`; quote snapshot/revision |
| 05C/06B | `POST /quotes/{id}/convert`, `POST /orders/{id}/cancel` | giữ hàng khi chấp nhận báo giá và nhả giữ khi hủy đơn nháp đã triển khai local; xác nhận sau khi thu đủ thuộc 06C và đã triển khai |
| 06A | `GET /orders?query=&status=&limit=`, `GET /orders/{id}`, `POST /orders` | `orders.read` / `orders.create`; đọc trong business hiện tại; tạo đơn nháp thủ công với giá do backend phân giải |
| 06C | `POST /orders/{id}/confirm` | `orders.confirm`; chỉ xác nhận khi đã thu đủ; ghi receivable/settlements và giữ đủ hàng trong transaction |
| 06D/06E | `GET /shipments`, `GET /shipments/ready-orders`, `POST /shipments`, `POST /shipments/{id}/deliver` | `shipments.read/create/deliver`; warehouse-scoped queue, full shipment, stock/WAC ledger at dispatch, revenue recognized at delivery; COD reconciliation pending |
| 07A | `POST /payments`, `GET /payments/suggestions`, `GET /customer-credit/{customerId}` | `payments.manage` / `receivables.view`; partial/multiple receipts, explicit allocation, unallocated overpayment to customer credit |
| 07B | `POST /customer-credit/{customerId}/applications`, `GET /receivables` | `payments.manage` / `receivables.view`; credit apply/reversal and AR list; expenses and cash refunds pending |
| 08A | `GET/PATCH /business-policy/return-window`, `GET /returns`, `GET /returns/eligible-shipments`, `POST /returns`, `POST /returns/{id}/inspect` | `returns.read/manage/inspect`, `returns.policy.manage`; cấu hình ngày để trống tới khi quản lý đặt; nhận hàng và QA/ledger kho; chưa hoàn tiền/COD |
| 08B | `GET /reports/sales?from=&to=` | `sales-reports.read`; doanh thu hàng giao theo tháng và top sản phẩm theo lượng gốc giao; doanh thu gross trước hàng trả. UI cho chọn kỳ và xuất CSV |

Hợp đồng khách hàng: `POST /customers` và `PATCH /customers/{id}` vẫn nhận `source` dạng chuỗi và `groupCode`. Nếu `source` nhận diện được là `Facebook`, `Facebook Messenger`/`Messenger` hoặc `Zalo`, backend lưu nhóm `wholesale`; nếu là `Shopee`, `TikTok` hoặc `TikTok Shop`, backend lưu nhóm `retail`, bất kể `groupCode` gửi kèm. Không phân biệt hoa/thường và khoảng trắng thừa. Nguồn khác/để trống giữ quy tắc chọn `groupCode` hiện có. Response trả nhóm thực tế sau phân loại; connector nền tảng không nằm trong hợp đồng này.
| 08C | `/reports/*`, `/imports`, COD reconciliation | Báo cáo net sau trả, import và COD còn chờ chính sách/quy tắc đối soát |

`POST /payments` nhận `{ customerId, amountVnd, allocations?: [{ orderId, amountVnd }], reference?, note? }`; `amountVnd`/allocation phải là VND nguyên dương. Nhân viên có `payments.manage` ghi nhận số thực nhận do server đóng dấu UTC; tổng phân bổ không vượt khoản thu, đơn phải thuộc cùng customer/business và còn `DRAFT`, không phân bổ trùng đơn hoặc vượt tổng đơn. Phần chưa phân bổ được ghi thành số dư khách. `Idempotency-Key` bắt buộc, cùng payload trả lại cùng phiếu thu. `GET /payments/suggestions?customerId=...` gợi ý đơn nháp còn thiếu tiền theo thứ tự cũ nhất trước. `GET /customer-credit/{customerId}` cần `receivables.view`.

`POST /orders/{id}/confirm` nhận `{ expectedVersion }`, cần `orders.confirm` và `Idempotency-Key`. Server kiểm tra đã thu đủ 100%, reservation đủ, tạo receivable và settlement từ các allocation đã có, xác nhận đơn và audit trong transaction Serializable. Không bán chịu; lệnh giao ở 06D chỉ xuất đủ một lần.

`POST /shipments` nhận `{ orderId, expectedVersion }`, cần `shipments.create` và `Idempotency-Key`; chỉ đơn `CONFIRMED` có đủ reservation tại đúng một kho mới được xuất. Không nhận trường số lượng từ client và không giao thiếu; một đơn chỉ có một shipment. Trong một transaction Serializable, server trừ on-hand và reserved, ghi `SALE_SHIPMENT` âm theo giá vốn bình quân gia quyền đã snapshot, shipment/line, audit và command chống trùng. Retry cùng key/payload trả cùng shipment; shipment thứ hai hoặc stale order trả conflict. `POST /shipments/{id}/deliver` nhận `{ expectedVersion }`, cần `shipments.deliver` và `Idempotency-Key`; chỉ shipment `IN_TRANSIT` được giao đủ, đóng dấu UTC và ghi nhận doanh thu hàng hóa từ snapshot đơn (không gồm phí giao/thuế) đúng một lần. Trước delivery, recognized revenue là 0. Không có endpoint COD/đối soát ở lát cắt này.

`GET /shipments/ready-orders` và `GET /shipments?status=IN_TRANSIT` cần `shipments.read`, chỉ truy vấn business của phiên đăng nhập và trả tối đa 100 bản ghi. Queue đơn sẵn sàng chỉ gồm đơn `CONFIRMED` chưa có shipment; vai trò kho không cần `orders.read`. Tạo/xác nhận giao vẫn qua command có version, quyền riêng và idempotency; danh sách không làm thay đổi tồn hoặc trạng thái.

`POST /customer-credit/{customerId}/applications` nhận `{ orderId, amountVnd, expectedVersion }`, cần `payments.manage` và `Idempotency-Key`. Backend kiểm tra khách/đơn trong business và cùng customer, đơn phải `DRAFT`, số tiền là VND nguyên dương không vượt customer credit balance hoặc phần đơn còn thiếu. Trong một transaction Serializable, server khóa version đơn và balance, giảm balance, ghi `CustomerCreditApplication`, event append-only, audit và kết quả idempotent. Đơn được trả `paidVnd` gồm phiếu thu phân bổ và credit application; xác nhận chỉ thành công nếu tổng đúng bằng 100%, rồi tạo `ReceivableSettlement` cho cả hai nguồn. Hủy đơn nháp khi không có phiếu thu tiền mặt đảo application và cộng lại customer credit trong transaction; nếu đã có tiền mặt thì vẫn từ chối hủy để chờ quy trình hoàn/đối trừ. Lặp key/payload trả kết quả ban đầu; dùng key cho payload khác trả 409.

COD hiện chưa thể vận hành: BR-COD-01 yêu cầu chỉ ghi nhận tiền COD sau khi nhân viên đối soát tiền thực nhận, trong khi BR-AR-02 cấm xác nhận đơn nếu chưa thu đủ 100%. Cần một quyết định nghiệp vụ dung hòa thời điểm xác nhận, giao và thu COD trước khi thêm lệnh đối soát; không tự ghi nhận tiền COD.

`GET /receivables` cần `receivables.view`, chỉ trả dữ liệu `businessId` hiện tại (tối đa 200, cũ trước), gồm khách/đơn, tổng phải thu, đã thanh toán/đối trừ và số dư còn lại. Đây là endpoint và màn hình đọc; không tự phân bổ tiền hay đổi trạng thái khoản phải thu.

### 08A — Đổi trả đã tiếp nhận và kiểm tra (không gồm hoàn tiền)

- `GET /business-policy/return-window` cần `returns.read`; `PATCH` nhận `{ days, expectedVersion }`, cần `returns.policy.manage`, số ngày nguyên 1–3650 và version chống ghi đè. Mặc định `days=null`; chưa cấu hình thì API từ chối tiếp nhận trả hàng.
- `GET /returns/eligible-shipments` và `GET /returns` giới hạn theo `businessId` phiên đăng nhập; danh sách tối đa 100 mục. Phiếu đủ điều kiện phải đã giao, còn trong hạn và còn số lượng giao có thể trả.
- `POST /returns` cần `returns.manage`, `Idempotency-Key`, `{ shipmentId, lines: [{ shipmentLineId, quantity }], notes? }`. Chỉ nhận shipment đã giao; backend snapshot ngày giao, số ngày chính sách và hạn trả, kiểm tra thời hạn inclusive (`now <= deliveredAt + days * 24h`) và tổng số lượng trả không vượt số đã giao. Một transaction Serializable khóa version shipment, ghi chứng từ/dòng, audit và command idempotent.
- `POST /returns/{id}/inspect` cần `returns.inspect`, `Idempotency-Key`, `{ expectedVersion, lines: [{ returnLineId, saleableQuantity, quarantineQuantity, reason? }] }`. Phải phân loại đầy đủ mọi dòng và tổng hai lượng khớp chính xác lượng nhận. Cùng transaction cộng lượng nhận vào on-hand; phần lỗi cộng unavailable; giá vốn nhập lại theo unit cost snapshot của lần xuất, bình quân gia quyền; ghi `CUSTOMER_RETURN` positive movement, inspection, audit và version.
- Dữ liệu Decimal trả dạng chuỗi. Không có lệnh hoàn tiền, điều chỉnh khoản phải thu, hủy/trừ doanh thu hay tự ghi nhận COD trong 08A. Những nghiệp vụ tiền cần quy tắc riêng trước khi mở.

### 08B — Báo cáo doanh thu hàng giao và sản phẩm giao nhiều

- `GET /reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` cần `sales-reports.read`; mặc định trả 12 tháng lịch gần nhất theo timezone doanh nghiệp; khoảng tối đa 731 ngày và hai đầu ngày được tính inclusive theo `Business.timezone`.
- Doanh thu tháng là tổng `Shipment.recognizedRevenueVnd` cho shipment `DELIVERED` (chỉ hàng hóa, không phí giao/thuế theo hợp đồng 06D). Top 10 SKU xếp theo tổng `ShipmentLine.baseQuantity`, hiển thị đơn vị gốc.
- Response nêu `revenueBasis=DELIVERED_GOODS_GROSS_BEFORE_RETURNS` và `quantityBasis=DELIVERED_BASE_UNIT_QUANTITY`: báo cáo gross hàng đã giao, chưa trừ trả. Không xem đây là doanh thu thuần/kế toán; chưa có chính sách hoàn giảm doanh thu.
- Mọi truy vấn khóa `businessId`; finance/owner mặc định được quyền. Quản lý vai trò có thể cấp `sales-reports.read` tường minh.

Đợt 06A: `GET /orders` trả `{ items }`, mặc định tối đa 50 và giới hạn `limit` 1–100; `status` hiện chỉ nhận `DRAFT`. `query` tìm không phân biệt hoa thường theo mã đơn/tên khách và theo mã khách/báo giá/SKU. `GET /orders/{id}` và list đều yêu cầu `orders.read`, giới hạn `businessId` từ phiên đăng nhập; ID ngoài phạm vi trả 404. VND và Decimal trả dạng chuỗi; hai endpoint chỉ đọc, không thay đổi trạng thái hoặc dữ liệu kho/tiền.

`POST /orders` nhận `{ customerId, lines: [{ variantId, quantity }] }`, cần `orders.create` và `Idempotency-Key` an toàn dài 8–100 ký tự. Backend chỉ chấp nhận khách/SKU đang hoạt động trong business hiện tại, phân giải giá từ `PriceTier` theo `priceQuantityFrom`, làm tròn VND từng dòng HALF_UP và lưu snapshot. Cùng key/payload replay kết quả; cùng key payload khác trả `409 IDEMPOTENCY_KEY_REUSED`. Đây là đơn `DRAFT` nhập tay (`sourceQuoteId=null`, revision 0); tạo thông báo nội bộ cho staff có `staff.manage`; chưa hỗ trợ sửa, giảm giá, phí giao, thuế, cọc, xác nhận, giữ kho, công nợ hoặc thanh toán. Không gửi qua nền tảng ngoài.

Lệnh `POST /goods-receipts` nhận `purchaseOrderId`, `warehouseId`, `notes?` và 1–100 dòng `{ purchaseOrderLineId, receivedQuantity, actualUnitCostVnd }`. Header `Idempotency-Key` bắt buộc; khóa duy nhất theo business, payload khác trả `409 IDEMPOTENCY_KEY_REUSED`. Server ấn định `receivedAt` ở UTC, tính quy đổi/thành tiền/tồn/giá vốn và ghi audit/sổ kho trong một transaction. Dòng nhận vượt số còn lại trả `422 PURCHASE_QUANTITY_EXCEEDED`. Giá vốn trên response bị bỏ nếu không có `cost.view`.

Lệnh `POST /stock-openings` nhận `{ warehouseId, variantId, quantity, unitCostVnd, notes? }`; `quantity` dương tối đa 6 số lẻ theo đơn vị gốc, `unitCostVnd` là số nguyên không âm. Giá trị `quantity × unitCostVnd` phải là số nguyên VND. Header `Idempotency-Key` bắt buộc (8–100 ký tự an toàn), khóa duy nhất theo business; cùng key/nội dung trả cùng chứng từ, khác nội dung trả `409 IDEMPOTENCY_KEY_REUSED`. SKU/kho đã có balance hoặc movement trả `409 OPENING_STOCK_ALREADY_EXISTS`. Backend lấy snapshot SKU/tên/đơn vị từ catalog, ấn định `postedAt` UTC và ghi chứng từ/balance/movement/audit trong transaction Serializable. `GET /stock-openings` hỗ trợ `warehouseId`, `query`, `limit` như các danh sách kho; giá vốn/giá trị bị bỏ khỏi response nếu thiếu `cost.view`.

`POST /stock-adjustments` nhận `{ warehouseId, variantId, expectedVersion, countedQuantity, reason, unitCostVnd?, notes? }`; `countedQuantity` là số không âm tối đa 6 số lẻ theo đơn vị gốc, `reason` bắt buộc. Client gửi version từ balance đã hiển thị; backend tính `quantityDelta = countedQuantity - onHandQuantity`, từ chối chênh lệch 0, version cũ (`409 STOCK_VERSION_CONFLICT`), balance thấp hơn phần đang giữ/không đủ điều kiện bán (`409 STOCK_BELOW_PROTECTED_QUANTITY`) và balance chưa tồn tại. Tăng trên balance còn hàng dùng giá vốn bình quân hiện tại; giảm dùng giá vốn bình quân hiện tại. Theo quy tắc tạm BR-STOCK-10, tăng từ 0 phải gửi `unitCostVnd`; nếu không có sẽ trả `422 ADJUSTMENT_COST_REQUIRED`. `Idempotency-Key` bắt buộc; cùng key/nội dung trả cùng chứng từ, nội dung khác trả `409 IDEMPOTENCY_KEY_REUSED`. Backend snapshot SKU/tên/đơn vị và tồn hệ thống, ấn định `postedAt` UTC, cập nhật balance version, ghi chứng từ/movement/audit trong cùng transaction Serializable. `GET /stock-adjustments` hỗ trợ `warehouseId`, `query`, `limit`; trường giá trị/giá vốn chỉ trả cho `cost.view`. Movement dùng chênh lệch có dấu; giảm tồn ghi số lượng và giá trị âm. Không sửa/xóa chứng từ đã ghi.

`GET /price-tiers?variantId={id}` trả giá admin đã nhập của SKU trong business hiện tại, gồm VND dạng chuỗi nguyên, version, tên sản phẩm/SKU và đơn vị bán cố định. `PUT /price-tiers` nhận `{ variantId, quantityFrom, expectedVersion, priceVnd }`; `quantityFrom` là 1 cho giá lẻ hoặc bội số 5 từ 5 trở lên; `priceVnd` là chuỗi VND nguyên dương, `null` xóa giá. Cần `price.edit` và header `Idempotency-Key`. Cùng key/nội dung trả kết quả gốc; dùng lại key với payload khác trả `409 IDEMPOTENCY_KEY_REUSED`; version cũ trả `409 PRICE_TIER_VERSION_CONFLICT`. Giá lưu theo SKU/bậc cho business hiện tại. `GET /price-tiers/resolve?variantId={id}&quantity={n}` nhận số thập phân dương tối đa 6 chữ số: dưới 5 chọn giá lẻ bậc 1, từ 5 trở lên chọn `floor(n/5)*5`; thiếu giá trả `PRICE_NOT_CONFIGURED` và không trả số tiền. Endpoint chưa tạo báo giá/đơn và chưa áp dụng giảm thêm.

Hợp đồng 05B: `POST /quotes` nhận `{ customerId, lines: [{ variantId, quantity, discountMode?, discountValue? }], orderDiscountMode?, orderDiscountValue?, shippingFeeVnd?, taxMode?, taxValue?, depositVnd?, paymentNote? }`. Số lượng/VND/tỷ lệ truyền dạng chuỗi thập phân; server phân giải bậc admin, làm tròn từng dòng half-up VND, tính giảm/tổng/thuế/cọc. Giảm dòng được áp dụng trước giảm toàn báo giá; mỗi loại giảm không được vượt số tiền làm cơ sở. Thiếu giá trả `422 PRICE_NOT_CONFIGURED`. Giảm dòng/toàn báo giá và thuế do server kiểm soát quyền `price.edit`; sales có thể tạo nháp/gửi nhưng không tự đặt giảm/thuế. `Idempotency-Key` bắt buộc; cùng key/nội dung trả kết quả cũ, payload khác `409 IDEMPOTENCY_KEY_REUSED`.

`PATCH /quotes/{id}` chỉ sửa `DRAFT`, cần `expectedVersion` và `Idempotency-Key`; stale version trả `409 QUOTE_VERSION_CONFLICT`. Sửa bảng giá không thay giá trong báo giá nháp đã lưu hoặc revision. `POST /quotes/{id}/send` nhận `{ expectedVersion, receivedAt }`; ghi nhận việc người dùng đã chia sẻ thủ công, tạo revision snapshot bất biến và `expiresAt = receivedAt + 72h`; không tự gửi email/Zalo/Facebook. `GET /quotes/{id}/revisions/{n}` trả snapshot dùng để in/lưu PDF bằng trình duyệt. `POST /quotes/{id}/convert` nhận `{ expectedVersion }` cùng `Idempotency-Key`, chỉ chấp nhận quote `SENT` có `expiresAt > now`; trong cùng transaction, code kiểm tra đúng một kho đang hoạt động, cộng gộp lượng cần theo SKU, kiểm tra tồn khả dụng, tạo đơn nháp từ revision bất biến, tăng `reservedQuantity`, ghi ledger `RESERVED`, đổi quote thành `ACCEPTED`, audit, alert nội bộ và idempotency command. Thiếu tồn trả `409 INSUFFICIENT_AVAILABLE_STOCK` và rollback toàn bộ; không giữ một phần. Không có kho trả `409 ACTIVE_WAREHOUSE_REQUIRED`; nhiều kho trả `409 WAREHOUSE_SELECTION_REQUIRED` cho tới khi kho được chọn ở hợp đồng. Giữ hàng không tự hết hạn. `POST /orders/{id}/cancel` cần quyền `orders.cancel`, `{ expectedVersion }` và `Idempotency-Key`; chỉ hủy đơn nháp, ghi ledger `RELEASED`, giảm projection giữ kho và chuyển `CANCELED` cùng transaction. Chỉ vai trò được cấp quyền quản lý mặc định được hủy. Lệnh retry an toàn; hủy đơn đã giao/xác nhận chưa được hỗ trợ. Xác nhận và thu đủ trước xác nhận đã được triển khai ở 06C/07A; xem hợp đồng endpoint phía trên. Không gửi thông báo Facebook ra ngoài cho tới khi connector được thử thật. Alert nội bộ vẫn được lưu cùng transaction.

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

Hợp đồng đích khi bổ sung `/confirm`: tải đơn trong business; kiểm tra permission; kiểm tra transition và đã thu đủ; yêu cầu reservation còn hiệu lực; tạo phải thu và phân bổ khoản thu; ghi audit/idempotency; commit một lần. Reservation đã được tạo ở thời điểm chấp nhận quote, không tạo lại lúc xác nhận. Không dựa trên `availableStock` hoặc tổng tiền do client gửi.

## 9. Webhook và job (nền inbound hiện hành)

### Facebook backfill (2026-10-13)

- `POST /integrations/facebook/backfills`: `connectors.manage`; body `{ connectionId, dataset: "MESSAGES"|"COMMENTS", since, until, pageLimit?: 1..500 }`. Connection phải thuộc business, Facebook OAuth thật ở `CONNECTED`; khoảng UTC `[since,until)` tối đa 366 ngày, không quá ngày hiện tại. Cùng connection/dataset/range trả cùng job, không enqueue trùng.
- `GET /integrations/facebook/backfills?connectionId?`: `connectors.manage`, tối đa 50 job business-scoped, chỉ trả progress/status/phase/khoảng/page budget và mã lỗi đã che, không trả token/cursor/payload nội bộ. `GET /integrations/facebook/backfills/preflight?connectionId&dataset` gọi Graph read-only tối thiểu; kết quả `ACCESSIBLE_SAMPLE`, `ACCESSIBLE_EMPTY_*`, `BLOCKED_PERMISSION` (kèm numeric Graph code/subcode nếu có), hoặc `REAUTH_REQUIRED`.
- `POST /integrations/facebook/backfills/:id/pause`: dừng tại ranh giới batch, giữ checkpoint. `POST /:id/resume`: chỉ job tạm dừng thủ công, tiếp từ checkpoint khi Page còn CONNECTED. `POST /:id/restart`: chỉ job dừng/thành công; quét lại cùng phạm vi, unique keys không tạo trùng. `POST /:id/extend` body `{ additionalPages: 1..500 }`: chỉ job bị giới hạn trang, tăng budget và tiếp từ checkpoint. Tất cả kiểm business/permission.
- Worker GET Graph host/version/path allowlist, token trong header, chỉ cursor `paging.cursors.after`; lỗi quyền/token/giới hạn không bị coi là trang rỗng. Tin/bình luận lịch sử không sinh webhook event/job giả, unread hoặc thông báo; không tác động order/kho/tiền.

- `POST /webhooks/facebook`: Meta challenge `GET` và POST `x-hub-signature-256`; chỉ ACK HTTP 200 sau khi event vào durable queue.
- `POST /webhooks/zalo`: xác minh `X-ZEvent-Signature` trên raw body theo SHA-256 của `app_id + raw JSON body + timestamp + OA secret`; chỉ `user_send_*` tạo message job. Cần `ZALO_OA_SECRET_KEY` server-side.
- Webhook chỉ ACK sau khi ghi durable `IntegrationJob`; worker có lease, retry/backoff/dead-letter. Event key gồm connection + provider message/comment/order ID; dữ liệu staging dùng external IDs duy nhất.
- `GET /integrations/connections`, `/inbox`, `/comments`, `/orders`, `/jobs` và các lệnh link customer/SKU/note/retry được mô tả trong `INTEGRATIONS_SETUP.md`; mọi query giới hạn theo business và RBAC.
- Inbox webhook hiện nhận-only. Chưa có endpoint gửi tin; Zalo lịch sử hội thoại/API comments chưa bật. Shopee/TikTok poller chưa triển khai.
- Sai thứ tự không được làm lùi trạng thái nghiệp vụ; dữ liệu đơn ngoài chỉ nằm trong staging.
- Outbound side effect dùng transactional outbox; worker không nhân đôi logic giá/kho/đơn.

## 10. OpenAPI checklist từ Đợt 01

Mỗi endpoint phải có schema request/response, permission, error codes, idempotency behavior, pagination/filter, ví dụ Việt hóa và trường nhạy cảm. Contract test phải chứng minh response khớp schema và các trường không được phép không bị lộ.

## Social outbound (2026-10-15)

GET /integrations/connections/:id/facebook-grants yêu cầu connectors.manage, kiểm Graph read-only với token giải mã tại server và trả status, boolean của pages_messaging, pages_read_user_content, pages_manage_engagement, Page task messaging/moderation; không trả token. GET /integrations/conversations/:id/send-capability và GET /integrations/comments/:id/reply-capability yêu cầu integrations.read, trả status và canSend; capability là theo record và kiểm lại khi POST. GET .../:id/outbounds trả tối đa 50 intent của business hiện tại.

POST /integrations/conversations/:id/send và POST /integrations/comments/:id/reply yêu cầu integrations.inbox.manage, body { "body": "...", "requestKey": "UUID" }. Server giới hạn 1–2000 ký tự, kiểm business/assignment/Page/recipient/window/Graph grant; request key duy nhất theo business và chỉ dùng lại cho cùng nguồn/nội dung. Response intent có status SENT_TO_PROVIDER/FAILED/UNKNOWN, providerObjectId nếu có, không trả secret. SENT_TO_PROVIDER chỉ xác nhận Graph chấp nhận. UNKNOWN không tự POST lại. 401/403 khi thiếu session/RBAC, 404 khi nguồn ngoài business, 409 khi capability chặn hoặc key xung đột, 400 khi body/key không hợp lệ.

## Nguồn social của báo giá (2026-10-15)

`POST /quotes` nhận thêm tùy chọn `sourceConversationId`, `sourceMessageId`, `sourceTicketId` (ID nội bộ). Tin/phiếu cần hội thoại nguồn. Backend yêu cầu `quotes.write`, thêm `integrations.read` và grant xem Page khi có nguồn; hội thoại phải thuộc business hiện tại và Customer đã liên kết đúng `customerId`. Tin và phiếu phải thuộc hội thoại đó. Lỗi: 403 thiếu quyền/Page grant, 404 hội thoại ngoài business/không có, 422 thiếu hội thoại hoặc nguồn/Customer không khớp. ID nguồn tham gia hash idempotency và audit; bất biến sau khi tạo, `PATCH /quotes/:id` không nhận các trường này. Response quote chứa ba ID nullable và `sourceAccount` `{provider,displayName}` hoặc null để UI chỉ rõ Page/OA nguồn; response order từ báo giá chứa các ID trong `sourceQuote`. Đơn nhập tay có `sourceQuote=null`.
