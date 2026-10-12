# SOCIAL-IDENTITY-01 — Social identity, khách nghi trùng và gộp hồ sơ

Ngày audit/triển khai: 2026-10-09. Phạm vi: Facebook Fanpage và Zalo OA. Không gửi tin ra ngoài, tạo đơn mới, phát sinh kho hoặc ghi sổ tiền.

## Ma trận trước khi sửa

| Yêu cầu                                                                                        | Code/API/schema/UI/tests hiện có                                                                                                                                                                      | Trạng thái                          | Việc còn lại                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 — OAuth Facebook/Zalo, chọn Page/OA, quyền dùng, trạng thái/reconnect                       | Được chi tiết hóa bởi [`CHANNEL-AUTH-01`](CHANNEL-AUTH-01.md). Có preflight cấu hình và chặn webhook vào manual binding; OAuth/selection/token lifecycle chưa có | PARTIAL; OAuth live BLOCKED         | Theo checklist/provider blockers trong CHANNEL-AUTH-01. Không thêm checklist OAuth thứ hai tại đây. |
| S2 — nhiều identity trên một Customer, preview/link/transfer/unlink/version/audit, lịch sử 360 | `ExternalCustomerIdentity`, integration service/controller/UI và Customer 360 đã tồn tại; thiếu ghi đè an toàn, thao tác chuyển/gỡ, metadata Customer 360                                             | DONE cho luồng local/import hiện có | Chờ provider thật để xác minh identity/hội thoại live. Comment author không được dùng làm Messenger identity nếu chưa có mapping được xác minh.                                                                                                     |
| S3 — đề xuất Customer A–B có bằng chứng/version/decision bền vững                              | `customer-normalization.ts`; thêm `CustomerDuplicateSuggestion`, indexed exact phone/email, so sánh tên + địa chỉ có cấu trúc giới hạn, queue, quyết định/review/audit và UI                          | PARTIAL                             | Identity chưa liên kết → Customer chưa thể đề xuất tự động: `ExternalCustomerIdentity` hiện không có phone/email/địa chỉ đã xác minh; không dùng display name đơn lẻ hoặc PII suy ra từ nội dung tin. Luồng tìm/link thủ công của S2 vẫn dùng được. |
| S4 — merge preview, quyền, transaction, version, idempotency/audit, giữ lịch sử/snapshot       | Thêm `CustomerMergeCommand`, trạng thái `MERGED` + redirect, endpoint/UI preview/merge, FK transfer theo transaction, chống lặp/audit và E2E                                                          | DONE cho các quan hệ hiện có        | Merge bị chặn nếu owner khác nhau, cả hai Customer có số dư tín dụng, hoặc thiếu quyền đọc quan hệ cần chuyển. Chưa có undo; browser visual acceptance còn chờ.                                                                                     |

## Kết quả sau triển khai

- **S1:** Chi tiết hóa thành [`CHANNEL-AUTH-01`](CHANNEL-AUTH-01.md). Preflight chỉ hiện tên cấu hình thiếu; Facebook/Zalo manual binding không còn được promotion/dispatch webhook. OAuth, selection, token lifecycle, reconnect và live verification vẫn BLOCKED/MISSING theo từng provider trong ma trận mới.
- **S2:** Nhiều identity có thể cùng liên kết một Customer. Link cần preview, expected version và expected current Customer; chuyển liên kết là endpoint riêng; unlink cần version. Các thao tác có actor/audit. ID social được rút gọn trong response/UI. Customer 360 hiển thị link và từng hội thoại nguồn riêng, chỉ khi có quyền `integrations.read`. Tạo/reconnect cùng account không nhân connection.
- **S3:** Contact phone chuẩn hóa `0`/`+84`, email chỉ trim/lowercase; không gom dấu chấm/`+tag`, không match theo 9 số cuối, dữ liệu mask/malformed không trở thành bằng chứng. Đề xuất Customer pair được lưu theo khóa không thứ tự + fingerprint bằng chứng và version; REJECT không lặp với cùng fingerprint; REVIEW_AGAIN có lý do/audit. Tên cần khớp cùng địa chỉ đầy đủ có cấu trúc; chỉ giống tên không tạo đề xuất. Không tự link/merge.
- **S4:** Merge giữ hồ sơ target làm canonical, giữ source ở `MERGED` redirect (có chặn cycle); preview hiện khác biệt/profile fields giữ từ target và số lượng quan hệ chỉ trong quyền được cấp. Transaction kiểm version/owner/credit/quyền quan hệ, chuyển lịch sử và identity, không sửa snapshot chứng từ, không tạo alert/event/kho/tiền. Idempotency-Key cùng payload replay kết quả cũ; khác payload conflict.

## Kiểm chứng

- API E2E trên PostgreSQL scratch cô lập: **13 files / 44 tests PASS**, gồm `social-identity.e2e-spec.ts` và `customers.e2e-spec.ts`; có kiểm tra merge bị 403 nếu chỉ có `customers.read`.
- API unit: **8 files / 32 tests PASS**; Web unit: **2 files / 4 tests PASS**.
- API typecheck + lint PASS; Web typecheck + lint PASS; Prettier scoped files PASS.
- Migration `20261008250000_social_identity_01` đã được áp vào DB scratch trước lượt kiểm thử. Không migrate database local đang dùng.
- Chưa chạy browser visual acceptance; chưa gọi provider thật. HTTP/API/UI code hoặc test fixture không phải bằng chứng tích hợp Facebook/Zalo thật.

## Files chính

- Schema/migration: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261008250000_social_identity_01/migration.sql`.
- API: `apps/api/src/customers/customers.controller.ts`, `customers.service.ts`, `customer-normalization.ts`, `apps/api/src/integrations/integrations.controller.ts`, `integrations.service.ts`, `apps/api/src/identity/permissions.ts`.
- UI: `apps/web/app/customer-workspace.tsx`, `apps/web/app/integrations-workspace.tsx`.
- Tests: `apps/api/test/social-identity.e2e-spec.ts`, `apps/api/test/customers.e2e-spec.ts`, `apps/api/src/customers/customer-normalization.spec.ts`.

## Trạng thái

SOCIAL-IDENTITY-01: **PARTIAL** — S2/S4 hoàn tất cho luồng local, S3 hoàn tất phần Customer-pair nhưng identity-to-Customer auto-suggestion bị chặn do thiếu verified contact data, S1 OAuth live bị chặn do phụ thuộc provider. Bước tiếp theo: cấu hình OAuth/provider và kiểm tra UI trực quan; chỉ sau khi có dữ liệu provider hợp lệ mới đánh giá identity matching theo contact được provider/user xác nhận.
