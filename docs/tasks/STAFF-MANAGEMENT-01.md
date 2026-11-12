# STAFF-MANAGEMENT-01 — Tài khoản và phân quyền

Ngày giao: 12/11/2026. Hoàn thiện màn hình quản trị trên nền RBAC hiện có; không thay stack hay schema.

## Luồng sử dụng

Chủ cửa hàng mở **Tài khoản & phân quyền** → tạo nhân viên bằng tên, email, mật khẩu tối thiểu 12 ký tự → chọn một hoặc nhiều vai trò hiện có → xem danh sách quyền trước khi lưu. Không chọn vai trò thì tài khoản chưa có quyền nghiệp vụ. Email duy nhất không phân biệt hoa/thường. Mật khẩu chỉ gửi tới backend qua request, được băm; API/audit không trả hoặc lưu mật khẩu thô.

Chọn nhân viên để sửa tên/email, thay vai trò, đặt lại mật khẩu, khóa hoặc mở khóa. Đổi vai trò, đặt lại mật khẩu và khóa thu hồi mọi phiên cũ. Mở khóa giữ nguyên vai trò, yêu cầu đăng nhập mới. Chức năng reset dành cho tài khoản khác; thay đổi mật khẩu cá nhân không nằm trong màn hình này.

Quyền Page/OA/shop dùng `IntegrationStaffAccess` hiện có: cần vai trò đọc/xử lý hộp thư và grant riêng trên từng kênh. Vai trò có `connectors.manage` quản lý toàn bộ kênh của đơn vị. Màn hình hiển thị rõ hai lớp quyền; quyền Meta vẫn được kiểm tra khi gửi.

## Quyền và bất biến

- Danh sách/tạo/sửa/khóa/reset cần `staff.manage`; đọc vai trò cần `roles.manage`; gán vai trò cần cả `staff.manage` và `roles.manage`. Tạo có vai trò cần thêm `roles.manage`.
- Không cấp hoặc quản lý tài khoản có quyền vượt quyền người thao tác. Chỉ người đang giữ vai trò `owner` được cấp/quản lý vai trò owner. Vai trò khác business bị từ chối.
- Không tự khóa, tự đổi vai trò hoặc reset mật khẩu của mình qua màn hình quản trị. Không khóa/hạ quyền chủ cửa hàng ACTIVE cuối cùng.
- Mọi mutation và tạo session đăng nhập khóa hàng business trong transaction; reload quyền actor sau khóa. Đăng nhập kiểm lại status/password hash sau xác minh mật khẩu để không tạo phiên từ thông tin trước khi reset/khóa.
- Thay đổi và audit cùng transaction. Mọi ID nhân viên giới hạn business phía backend. Không có xóa tài khoản, không tạo tài khoản test trên production.

## API

- `GET /staff`: thêm `permissions` (quyền hiệu lực), `canManage` (gợi ý UI, không thay kiểm tra khi ghi); giữ `roles[].role.code/name` cũ.
- `POST /staff`: `{displayName,email,password,roleCodes}`; 201 hoặc 409 `EMAIL_ALREADY_EXISTS`, 422 `UNKNOWN_ROLE`, 403 khi cấp vượt quyền.
- `PATCH /staff/:id`: `{displayName,email}`; 200.
- `PUT /staff/:id/roles`: `{roleCodes}`; 200, `sessionsRevoked=true`.
- `PATCH /staff/:id/lock`: `{locked}`; 200.
- `POST /staff/:id/reset-password`: `{password}`; 201, `sessionsRevoked=true`.
- `GET /roles`: thêm mô tả quyền tại `permissions[].permission.description`.
- Lỗi chung: 401 chưa đăng nhập, 403 thiếu quyền hoặc vượt phạm vi cấp quyền, 404 ID ngoài business, 400 DTO sai, 422 tự khóa/tự sửa vai trò/reset, 409 không còn owner hoạt động khác.

## Nghiệm thu và demo

1. Đăng nhập bằng owner của DB scratch; mở menu mới, tạo nhân viên sales và kiểm tra quyền của vai trò.
2. Đăng nhập nhân viên: không thấy và không gọi được API quản trị. Chỉ xem Page được cấp grant.
3. Đổi vai trò/reset/khóa: cookie cũ bị 401; mật khẩu cũ sau reset bị 401; mở khóa đăng nhập lại và giữ đúng vai trò.
4. Tạo trùng email, tên chỉ khoảng trắng, ID business khác, cấp owner từ quản trị giới hạn đều bị chặn.
5. Hai owner khóa chéo đồng thời: chỉ một request thành công, vẫn còn một owner ACTIVE.
6. Chạy E2E DB scratch, typecheck, lint, build. Kiểm tra giao diện desktop/mobile riêng; ghi rõ nếu chưa kiểm tra được qua trình duyệt.

## Bằng chứng 12/11/2026

- PostgreSQL scratch riêng `crm_staff_scratch`: `staff-management.e2e-spec.ts` và `auth.e2e-spec.ts` đạt 6/6 bài; không dùng DB vận hành.
- Unit trong workspace: API 69/69, web 11/11. Typecheck đạt. Lint toàn bộ và build API/web đạt trong worktree kiểm tra chỉ chứa module này trên nền `05db25f`; không đưa các sửa Facebook chưa hoàn tất vào bản kiểm tra.
- Build web ở worktree kiểm tra đặt root Turbopack rộng hơn để dùng dependency junction; cấu hình này chỉ thuộc môi trường kiểm tra, không thay `next.config.ts` của repo chuẩn.
- Browser access host không sẵn sàng, chưa nghiệm thu UI trực quan hoặc thao tác form bằng trình duyệt; không tạo/reset tài khoản vận hành khi kiểm tra.

## Triển khai VPS 12/11/2026

- Release ứng dụng `b9519cd` đã build thành công bằng Dockerfile production và chạy tại `https://crm.nguyenhongson.vn/`. API/web cùng image `sha256:96a22b7f1d0256e0522c936ad6920ea42bd93b7685be0b215bd62e0f9ab9b714`; API healthy. Không chạy migration, không đổi dữ liệu hay mật khẩu tài khoản thật.
- Public `/` và `/api/v1/health/ready` trả 200. HTML có `private, no-cache, no-store` và tham chiếu bundle mới `/_next/static/chunks/3u07x84h-376r.js` trả 200, chứa module staff/reset-password. `/api/v1/staff`, `/api/v1/roles` chặn chưa đăng nhập bằng 401; API log xác nhận route sửa tài khoản/reset/role/lock được đăng ký. Chưa thay bằng chứng này cho nghiệm thu UI đăng nhập.
- Image trước deploy được giữ ở `son-crm-app:rollback-05db25f-20261112`. Khi cần quay lại: tag image đó thành `son-crm-app:production`, rồi `docker compose --profile ai --env-file .env.production -f compose.production.yaml up -d --no-build api web` trong `/srv/son-crm`; kiểm tra health và domain sau chuyển.
