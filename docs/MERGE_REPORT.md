# MERGE-CRM-01 — Báo cáo hợp nhất hai checkout

Ngày kiểm tra: 2026-10-09. Kết luận: hai checkout không phải hai nhánh độc lập cần chép/merge lần nữa. Chúng là hai trạng thái của cùng repository và phần code của `CRM-home` đã được merge vào lịch sử `CRM` từ trước. Repo chuẩn là `C:\Users\Admin\Downloads\CRM`.

## 1. Hai nguồn và bảo toàn

| Thuộc tính | Repo chuẩn — CRM | Nguồn đối chiếu — CRM-home |
|---|---|---|
| Đường dẫn | `C:\Users\Admin\Downloads\CRM` | `C:\Users\Admin\Downloads\CRM-home` |
| Remote | `https://github.com/troll9x/CRM.git` | `https://github.com/troll9x/CRM.git` |
| Branch/HEAD lúc audit | `main` / `19ccb7ee585f83b48424c63802ea1684ba28c031` | `main` / `71c73693d305b11bb41bbadd9c6c0e0543709538` |
| Quan hệ | Hậu duệ của merge commit | Tổ tiên trực tiếp trong lịch sử tích hợp |
| Tracked/staged | 38 tracked files modified; không có staged file | Không có tracked/staged change |
| Untracked liên quan | 78 untracked files gồm migrations 04C-B/06B–08, payments/returns/shipments, integrations, customer 360/social identity, tests, docs và scripts; `accout.md` cũng untracked và được giữ ngoài staging | Bốn prompt untracked (`prompt-bo-sung-social-khach-trung.md`, `prompt-crm-tham-chieu-amis.md`, `prompt-dong-bo-da-kenh-crm.md`, `prompt-ket-noi-1-cham-crm.md`) |
| Commit so với remote | `git ls-remote` xác nhận remote main là `19ccb7e`; không có commit local chưa push. Các local changes chưa commit, không phải commit có thể push. | Remote-tracking ref trong checkout này stale ở `71c7369`; remote main đã đi tới `19ccb7e`, nên không dùng trạng thái `0/0` cục bộ làm kết luận mới nhất. |

Trước khi tạo nhánh hoặc sửa docs, đã tạo checkpoint ngoài hai checkout tại:

- `C:\Users\Admin\Downloads\MERGE-CRM-01-checkpoint-20261009\CRM` — 316 file, 11,493,306 bytes.
- `C:\Users\Admin\Downloads\MERGE-CRM-01-checkpoint-20261009\CRM-home` — 153 file, 1,281,577 bytes.

Checkpoint không bao gồm `.git`, `node_modules`, output/cache, `.env`, `account.md`, `accout.md`, `compose.override.yaml` hoặc database dump/backup. Các file đó vẫn nguyên trạng tại source; không đọc hay sửa giá trị secret. Bốn prompt untracked trong `CRM-home` được sao lưu và vẫn được giữ trong source.

Tạo branch local `integration/merge-crm` từ `19ccb7e`, giữ toàn bộ tracked/untracked changes hiện hữu. Không reset, clean, stage, commit, push, fetch hoặc deploy. Mặc dù không cần merge, branch này là đích tích hợp riêng để tiếp tục xác minh.

## 2. Bằng chứng lịch sử merge

- `git merge-base CRM/main CRM-home/main` trả `71c73693d305b11bb41bbadd9c6c0e0543709538`.
- `git log` cho thấy merge commit `f4ea342e97e6b24be7aa81f677234b7c1547c5a2`, với parents `ec5b636` và `71c7369`, tiêu đề `merge: unify home and main CRM work`.
- `git ls-remote https://github.com/troll9x/CRM.git refs/heads/main` trả `19ccb7ee585f83b48424c63802ea1684ba28c031`.
- Vì vậy không tạo unrelated-history merge, không copy-overwrite thư mục và không cần hợp nhất hai lockfile.

## 3. Ma trận chức năng

| Chức năng | CRM-home @ 71c7369 | CRM @ 19ccb7e + local dirty | Phần giữ và xử lý |
|---|---|---|---|
| Auth/RBAC/business scope/audit | Nền monolith đã có | Cùng nền; local có thay đổi permission/session/CSRF | Dùng một identity/auth stack của CRM; thay đổi local giữ nguyên, cần regression test |
| Customer/contact/tasks/opportunities | Customer CRM nền đã có | Hậu duệ; local có hồ sơ 360, social identity, merge/duplicate suggestions | Giữ Customer model/module duy nhất; code local tiếp tục là phần bổ sung, không chép từ prompt/prototype |
| Catalog/SKU/supplier/purchasing | Có catalog, purchasing | Cùng code theo ancestry; local có mappings/report additions | Giữ modules hiện hữu; không tạo bản sao |
| Pricing/quotes/orders | Giá bậc đã có ở base; quote/order chưa có tại 71c7369 | Remote main thêm fixed unit/retail pricing, quotes, draft order, admin alerts | Giữ implementation mới hơn trong CRM và snapshot/order rules của nó |
| Stock/inventory/count adjustments | Có ledger và giá admin; merge commit `f4ea342` giải quyết xung đột giữa home/main | Remote có các commit sau; local có additional migrations 04C–08 | Giữ một inventory/ledger; additive migrations cần scratch validation |
| Payments/receivables/shipments/returns/reports | Không có trong ancestor | Chỉ có trong untracked local code/migrations tại thời điểm audit | Giữ local work; chưa coi là đã merge/published, kiểm thử cần làm |
| Connections/OAuth/webhooks/worker | Không có connector branch độc lập tại HEAD 71c7369 | Local có `integrations`/worker/webhooks; webhook/order import-only; OAuth còn thiếu | Giữ một integrations module; không tạo worker/connection store thứ hai. AUTH-01 còn dở và được nêu riêng |
| Facebook/Zalo/Shopee/TikTok | Chưa có code ở checkout ancestor | Local: Facebook/Zalo inbound adapters; marketplace adapters/live auth còn thiếu | Giữ adapter hiện có, không tuyên bố provider live; không thêm fake OAuth |
| UI/API contracts/tests/scripts/docs | Monorepo npm workspaces, Prisma, Next/Nest | Cùng conventions; local bổ sung workspaces/feature screens/tests/runbooks | Giữ package manager/lockfile của CRM; không hợp nhất tay lockfile |
| Prototype | Có prototype tĩnh | Cùng prototype theo ancestry | Chỉ tham khảo UX; không nhầm với code nghiệp vụ hiện hành |

## 4. Xung đột, schema và nâng cấp dữ liệu

Merge commit `f4ea342` là bằng chứng xung đột lịch sử chính: hợp nhất stock adjustment inventory và admin price tiers. Code hiện tiếp tục theo cùng monorepo, không thấy bằng chứng về hai hệ thống auth, Customer model, integrations module hoặc worker cùng trách nhiệm giữa hai HEAD. Không sửa migration lịch sử trong lượt này.

Migration repo chuẩn gồm lịch sử tới 06A đã commit ở HEAD và một số SQL migrations local chưa theo dõi (04C-B, 06B, payment/receivable, shipment, returns, integrations, customer 360, social identity). Checkout CRM-home kết thúc ở `71c7369`; do là tổ tiên, đường nâng cấp kỹ thuật dự kiến là chạy tuần tự migrations của repo chuẩn từ trạng thái schema 71c7369, nhưng chưa đánh dấu an toàn cho dữ liệu hiện hữu. Có hai môi trường local khác nhau được ghi trong HANDOFF; không đụng DB `son_crm` cũ hoặc bất kỳ volume nào.

Đã chạy migrations và test chỉ trên PostgreSQL 17.6 scratch với tmpfs cô lập; các container/DB sẵn có được giữ nguyên.

- Fresh deploy: 27 migrations áp dụng; seed test-only hoàn tất; lần `migrate deploy` thứ hai không còn migration chờ.
- Upgrade: export migration prefix của `CRM-home@71c7369`, deploy lên scratch, sau đó chạy toàn bộ migration local mới hơn; upgrade thành công.
- `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code`: `No difference detected` trên DB fresh.
- Không migrate/seed vào DB `son_crm`, `son_crm_ui_account` hoặc volume đang chạy.

## 5. Kiểm thử và trạng thái task

Đã chạy trong MERGE-CRM-01 trên local worktree: typecheck PASS; lint PASS; API unit 9 files/35 tests PASS; Web unit 2 files/4 tests PASS; production build PASS; API E2E 13 files/44 tests PASS trên fresh scratch DB; Prisma validate PASS; migration fresh/repeat deploy, upgrade từ CRM-home prefix và schema diff PASS; `git diff --check` PASS; Prettier scoped auth files PASS.

Giới hạn: môi trường đang dùng Node `v25.9.0` trong khi `.node-version` yêu cầu `24.18.0` và root engine là `>=24 <25`; không tìm thấy Node 24 cài sẵn. Các lệnh trên đã thực sự pass nhưng cần rerun dưới Node 24 trước khi coi validation runtime là hoàn tất. `npm run format:check` chỉ còn fail `apps/web/app/globals.css`, file đã dirty trước nhiệm vụ; không format/ghi đè file ngoài phạm vi. Không chạy standalone API/web/worker startup hoặc browser acceptance. OAuth live chưa có credentials/evidence; phần preflight/webhook gate được thêm ngay trước khi yêu cầu merge ưu tiên nhiệm vụ này và chưa có live/provider test.

## 6. Thư mục chuẩn và tiếp tục

- Tiếp tục tại `C:\Users\Admin\Downloads\CRM`, branch `integration/merge-crm`.
- `CRM-home` giữ nguyên làm checkout nguồn đối chiếu; không xóa/archive.
- Lệnh chạy local theo `docs/LOCAL_DEVELOPMENT.md`; API/Web/worker scripts trong root `package.json`. Chỉ chạy migration với DB scratch cô lập.
- Prompt files trong `CRM-home` là yêu cầu/bối cảnh người dùng, không phải runtime code.
- Chỉ commit các file merge-specific có thể tách an toàn (`AGENTS.md`, `docs/MERGE_REPORT.md`) sau khi xem staged diff. Các thay đổi feature local có trước, `HANDOFF.md`/`BACKLOG.md` đang chứa worktree history rộng hơn và các file secret/account vẫn để unstaged/untracked. Không push.
