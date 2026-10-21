# SOCIAL-INBOX-TICKET-01 — Hộp thư ba vùng và ticket nội bộ

Ngày 2026-10-14. Checkout `C:\Users\Admin\Downloads\CRM`, branch `integration/merge-crm`, HEAD `1925a9f` trước sửa. Worktree đã có FB-UNBLOCK-BACKFILL-01 chưa commit; giữ nguyên. Không push/deploy, không sửa `.env` hoặc migration DB vận hành.

## Dữ liệu, quyền và bất biến

- Vào: chat/comment đã lưu và được đọc qua `integrations.read`; tạo ticket nhận nguồn, loại yêu cầu, ưu tiên, tóm tắt, nhãn, assignee và request key. Cập nhật nhận expected version. Ra: ticket + tối đa 20 event gần nhất, danh sách tối đa 100 ticket gần nhất; giao diện lọc trên tối đa 100 chat, 100 comment, 100 ticket đã tải.
- `integrations.inbox.manage` cần cho tạo/sửa ticket và đánh dấu đã đọc; `integrations.read` cần cho xem ticket/assignee. Nguồn và assignee được tra theo business trên server, assignee phải ACTIVE. Một ticket chỉ có đúng một nguồn; `SocialTicketEvent` và ticket ghi trong cùng transaction. Request key unique theo business; replay cùng payload trả ticket cũ, payload khác trả 409. Cập nhật version cũ trả 409. Chỉ đóng ticket đã xử lý.
- Ticket/ghi chú là tác nghiệp nội bộ, không gọi Meta Send API, không tạo đơn/kho/tiền. Comment author ID không được dùng làm Messenger identity/Customer. Đơn ngoài chỉ hiện trong hồ sơ khi Customer đã liên kết thực.
- Lỗi: nguồn/assignee khác business hoặc không tồn tại 404, thiếu quyền 403, payload sai 400, request key/version/vòng đời xung đột 409. UI hiển thị lỗi API; không giả gửi reply.

## Code và thử nghiệm

- `apps/api/prisma/schema.prisma`, migration `20261014010000_social_tickets`; `apps/api/src/integrations/{integration.dto,integrations.controller,integrations.module,integrations.service,social-tickets.service}.ts`; `apps/api/test/social-tickets.e2e-spec.ts`.
- `apps/web/app/integrations-workspace.tsx`, `apps/web/app/globals.css`, `apps/web/app/social-inbox-filter.spec.ts`: tab Hộp thư ba vùng, filter, nguồn Page/OA/shop, chat inbound/outbound, comment post/parent/permalink, hồ sơ/ticket/ghi chú/assignee. Trên màn hẹp dùng danh sách → nội dung → hồ sơ. Không có ô soạn khi API gửi chưa được chứng minh. Avatar là chữ đầu tên do provider chưa có URL đáng tin; media chỉ có nhãn metadata nếu backend lưu.
- PostgreSQL scratch `social_scratch`/container tmpfs riêng: 30/30 migrations + seed thử thành công. `social-tickets.e2e-spec.ts` 1/1 pass: business scope, assignee, request key, version, vòng đời, audit, mark-read, ticket từ comment. `integrations.e2e-spec.ts` 1/1 pass gồm fixture webhook/backfill cũ. API unit 11 files/48, web unit 4 files/10 pass (gồm lọc kênh/tài khoản, unread, assignment, priority, nhãn, trạng thái); API/web lint/typecheck/build pass. Prisma schema valid. Schema diff scratch → model chỉ còn tên index `integration_auth_attempts_business_id_actor_id_status_expires_a` từ migration 2026-10-09 khác quy ước Prisma hiện tại; không liên quan ticket mới.
- DB local UI `son_crm_ui_account` đọc **chỉ count** vào 14/10: 0 job webhook MESSAGE/COMMENT, 2 hội thoại, 8 tin (cả 8 là backfill), 0 comment. Trước migration đã backup và restore thử: `C:\Users\Admin\AppData\Local\SonCRM\Backups\son_crm_ui_account_pre_social_20261014_01.dump`, SHA-256 `3034F7CE2E6BAABEAA65F07CF4DD5E2787DA72D88EEF89CFD52274D19FF2DE7A`; restore riêng cũng đối chiếu bảng social `2|8|0|2` với nguồn. Migration ticket 30/30 đã áp vào DB local, recreate API/web không chạm DB/worker, readiness API 200, web HTTP 200, docs-json có route mới. Sau migration count giữ `2|8|0|2`, ticket/event 0. Không có sự kiện inbound mới để đánh dấu `LIVE_VERIFIED`; không in nội dung/ID khách. Backup chứa dữ liệu chưa mã hóa, cần chuyển kho được bảo vệ theo retention.

## Facebook và nghiệm thu còn mở

| Tuyến | Trạng thái 14/10 | Bằng chứng |
| --- | --- | --- |
| Messenger mới | `WAITING_FOR_META` | DB 0 job webhook; không có event thật. Chrome extension xác nhận app chưa phát hành, Meta ghi rõ sẽ không phân phối production webhook kể cả app role. Các quyền `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`, `pages_show_list` vẫn “Sẵn sàng thử nghiệm”, chưa chứng minh Advanced Access/production delivery. |
| Comment/reply mới | `WAITING_FOR_META`, `BLOCKED_PERMISSION` | DB 0 comment. Graph code 10 checkpoint 13/10. Trong bảng quyền Messenger đọc trên Chrome 14/10 không thấy `pages_read_user_content`; chưa xác minh use case khác/grant mới. |
| Messenger cũ | `LIVE_PARTIAL` cho 8 tin đã xác minh 13/10; count-only 14/10 | DB 2 hội thoại/8 tin, tất cả `import_job_id` có. Không chứng minh Meta trả hết lịch sử. |
| Comment/reply cũ | `BLOCKED_PERMISSION` | DB 0 comment; code 10 ở checkpoint 13/10, chưa có grant mới được kiểm. |
| Ticket/hộp thư mới | `CODE_READY/LOCAL_TESTED` | Scratch E2E/build pass; local DB/API/web đã nâng theo backup/restore thử, API/web HTTP 200. Chưa browser visual acceptance hoặc tạo ticket với dữ liệu khách thật. |

Windows Computer Use bị lỗi geometry/capture nên dừng theo skill. Cầu nối Chrome extension riêng sau đó đọc trực tiếp tab Meta: trang **Đăng** có nút phát hành disabled và dẫn tới mục URL chính sách quyền riêng tư; tab **Webhooks → Page** hiển thị callback `https://held-moss-program-mats.trycloudflare.com/api/v1/webhooks/facebook`, verify token che, `messages` và `feed` đã đăng ký v26.0. Trong bảng Page, 70/71 trường đang đăng ký (trừ `message_context`); phạm vi này cần rà trước khi phát hành. Meta nêu rõ app chưa phát hành chỉ nhận webhook thử nghiệm từ dashboard, không phân phối dữ liệu production kể cả app role. Kiểm tra DNS callback 14/10 bằng `curl` không phân giải được host (`HTTP 000`), nên URL Quick Tunnel hiện không hoạt động. Không sửa cấu hình, không nộp review hoặc phát hành. Chrome local CRM hiện màn hình đăng nhập, chưa có phiên nhân viên để nghiệm thu visual; không có ảnh trước/sau. Bản nháp review tại `FB-META-REVIEW-DRAFT.md` vẫn chưa nộp.

## Demo trên môi trường local hiện có

1. Đăng nhập nhân viên có `integrations.read` và `integrations.inbox.manage`, mở **Đồng bộ đa kênh → Hộp thư**; lọc Chat/Bình luận/Ticket, Page và trạng thái chưa đọc.
2. Chọn chat đã lưu, xem chi tiết tin và phân biệt nguồn lịch sử/webhook; mở bình luận để xem post ID, parent nếu có, permalink hợp lệ. Tạo ticket và chọn loại/ưu tiên/nhãn/người xử lý; đổi trạng thái đến RESOLVED rồi CLOSED và kiểm event.
3. Dùng cùng request key/payload trong API để thấy cùng ticket; đổi payload cùng key hoặc dùng expectedVersion cũ để thấy 409. Chọn tin chưa đọc để đánh dấu đã đọc, số mục unread cập nhật sau refresh.
4. Trên viewport hẹp, đi danh sách → nội dung → hồ sơ và quay lại; xác nhận bộ lọc/selection còn nguyên. Không chụp nội dung khách thật lên ảnh công khai.
