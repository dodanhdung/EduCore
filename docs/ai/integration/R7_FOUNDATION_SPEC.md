# R7 — Foundation authentication integration

Ngày 23/10/2026. Baseline `2daefa87d0b4bafe8613751c7329cb914cc9cdee`, nhánh `feat/r7-foundation-auth-integration`.

## Scope / authority

Yêu cầu Full R7 do owner cung cấp là task specification và cho phép implementation A–J. Tài liệu này ghi lại hợp đồng triển khai để review; không tự phê duyệt navigation API/SQL/mapping mới. Primary screen AU01, supporting AU02, AU05/AppShell; không redesign, không sửa Figma, không tích hợp nghiệp vụ R8/P1.

Nguồn hiện có: Requirements v5 + amendment Wallet v5.1, FR-01/03/04/06/42, Q-01/02/15, BR-08/10/14; UC v1.3 UC-01/02/36, AC-01-01–03, C-01–04; Accepted Architecture §2.4/2.5; Detailed Design §3/5.1/A.2/A.3; API auth contract; module `class design/identity-access.md`; AU01/AU02 cards, SCREEN_FLOWS F01, UI_GUIDELINES §2/4/5, DESIGN_TOKENS. Đã đọc PROJECT_CONTEXT, DECISION_REGISTER, R4/R5/R6 reports. Snapshot scaffold trong context/register đã cũ; module class design còn nhắc DB v1.0 proposed, trong khi design hiện có group-A v1.1. Availability lấy từ runtime controller và migration hiện tại, không lấy từ các snapshot lịch sử.

## Baseline / blockers trước code

- HEAD và origin/main cùng SHA sau fetch; PR #16 đã merge. Nhánh đúng tên đã tồn tại, không có commit riêng, không cần tạo nhánh mới.
- Owner có `.gitignore` sửa và `educore-ui-changes.zip` xóa; giữ nguyên, không đưa vào ZIP R7.
- AU01 có callback nhưng App chưa truyền; AU02 gọi API nhưng hardcode landing `/me`.
- Access/CSRF trong memory, reload không bootstrap. Session controller cũ thiếu refresh và bảo vệ đủ các race.
- `canView` cũ chấp nhận evidence chỉ tenant/screen; `/auth/me` chưa trả grants. Role label không được dùng thay evidence.
- Không có public navigation read contract hoặc grant SQL cho restricted API để liệt kê effective grants. Phần mới cần owner review; đề xuất đặt ngoài migration runner.
- Docker daemon chưa kết nối được tại thời điểm kiểm tra; không dùng container/database R6 có sẵn.

## Authentication contract đang chạy trong source

Base `/api/v1/auth`. POST `login` nhận email/password, yêu cầu exact Origin, trả accessToken/expiresInSeconds/csrfToken, refresh cookie HttpOnly. GET `me` dùng Bearer và trả id/sessionId/tenantId/allowedTenants, không grants. POST `select-tenant` nhận tenantId + Bearer và trả accessToken/expiresInSeconds/principal. POST `refresh` dùng cookie + exact Origin + X-CSRF-Token, rotate refresh/CSRF/access. POST `logout` dùng Bearer, 204 và clear cookie sau revoke thành công. OTP/password routes nằm trong inventory; R7 không nối thêm AU03/04/06.

## Frontend contract

AU01 nhập email/password → real ApiClient → SessionController → AU02, kể cả chỉ một tenant. AU02 chỉ hiển thị allowedTenants từ `me`; server-returned principal mới xác định tenant. Landing lấy eligible routes, nếu không có thì AU05.

Auth mutations dùng một hàng đợi trong tab để tránh Set-Cookie/token rotations chồng nhau; revision từ lúc bắt đầu ý định, tenantEpoch thay đổi khi xác minh/chuyển context. Logout và chuyển tenant ẩn ngay context/quyền cũ. Phản hồi stale không điều hướng; stale login bị revoke best effort. Refresh single-flight; gọi `me` sau refresh, không tái dùng grants. Xác minh mỗi tối đa 60 giây và khi focus; refresh trước hạn 60 giây. Timer độc lập cắt access đúng hạn frontend. Lỗi xác minh/network fail-closed, không báo thành công. HTTP timeout 15 giây.

Access token/CSRF không lưu vào localStorage/sessionStorage/URL. Expiry tính bảo thủ từ thời điểm bắt đầu request, trừ 1 giây, và không vượt deadline 7 ngày từ login ban đầu khi refresh/chuyển tenant. Reload cần login vì CSRF không được bootstrap. Không làm logout hàng loạt các tab: mỗi tab có memory riêng nhưng dùng cookie chung; multi-tab refresh coordination chưa có contract. Refresh race giữa tab hoặc request có kết quả commit không rõ có thể buộc login lại; không khôi phục grants cũ.

Navigation consumption type có userId/sessionId/tenantId/tenantEpoch/validUntil/screenIds, không role hoặc resource IDs. Reader chỉ được dependency-inject từ code tin cậy sau review; production hiện không cấu hình reader, không gọi endpoint đề xuất. Test reader/HTTP doubles là kiểm thử consumer, không chứng minh backend security. `navigationRoutes` chỉ lấy route P0 có path hoàn chỉnh, guard kiểm tra evidence/freshness/context. Backend phải authorize resource ở từng request.

## UI states / accessibility

Giữ assets/layout AU01/AU02. Form labels, aria-invalid/describedby, aria-busy, alert/status; khóa double-submit bằng ref đồng bộ; xóa password/visibility sau kết quả. Lỗi 401/403/404/409/429/network có copy Việt an toàn, không render message SQL từ server. AU02 thất bại không navigate. AppShell nhóm link đủ evidence, active state, tenant, self-service, logout, empty navigation; mobile dùng native details/summary để có keyboard toggle. Layout responsive hiện có được giữ; kiểm tra DOM không tương đương screenshot/browser usability certification.

## Files / database boundary

Cho phép sửa foundation App/auth/api/css, AU01/AU02/tests, package scripts; thêm env examples, test R7 và tài liệu trong thư mục integration. Không sửa AGENTS, nguồn nghiệp vụ, Prisma schema, historical migrations, owner files. Runtime giữ riêng AUTH/API/WORKER connections. Không đổi audit/transaction/domain code. Đề xuất read-only SQL dưới `proposals/` không nằm trong Prisma migration path và chưa chạy.

## Acceptance / validation

Test hành vi: actual ApiClient payloads, form journey, safe failures, invalid tenant, overlapping login/logout/switch/refresh, stale evidence, permission loss, role-only denial, resource denial, no persistent storage, default no navigation request, AppShell eligible links/mobile semantics, Preview isolation. Nest HTTP tests kiểm CORS/Origin/cookie/CSRF/204 với service double; native R4 mới chứng minh SQL boundaries. Báo cáo riêng build/lint/unit/native; không gọi unit/mock PASS là end-to-end PostgreSQL PASS.

## Review / rollback

Owner review tất cả file mới trước Git. Navigation endpoint/mapping/forward SQL proposal cần sign-off riêng, có negative PostgreSQL vectors trước activation. Rollback implementation bằng review diff cụ thể; không reset working tree và không thay đổi DB. Không commit/push/PR/deploy.
