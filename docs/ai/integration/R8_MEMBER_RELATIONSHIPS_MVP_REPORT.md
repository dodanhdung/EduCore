# R8 OP01–OP03 — báo cáo owner review cuối

Ngày 24/10/2026. Trạng thái: **R8_MANAGEMENT_MVP_READY_FOR_OWNER_REVIEW**. Nhánh `feat/r8-member-relationships-mvp`, baseline đầu đợt đóng MVP: `33b4cccf08087257716a145fb383d93687c212ed`. Chỉ thay đổi local; chưa commit, push, tạo PR hoặc deploy đợt đóng này.

## Scope và nguồn

OP01–OP03 theo UC-04–06, FR-02–06, BR-08/10/14; Owner approval `APPROVE_R8_OP02_OP03_NAVIGATION_MVP`. 11 file implementation trước đó đã được owner review và có trong commit baseline. Migration mới chỉ sửa navigation; mọi writer vẫn dùng kiểm tra permission/tenant/scope riêng ở Backend.

## Hoàn thành

- **OP01:** danh sách thành viên thật theo tenant, trang 20 mục, tìm/lọc trong trang, tạo thành viên, vô hiệu hóa với lý do/xác nhận; liên kết đến đúng membership OP02 khi server cấp screen grant. Tài khoản global mới chờ AU06 `PENDING_ACTIVATION`; writer hiện có có thể gắn tài khoản global ACTIVE đã tồn tại với membership ACTIVE.
- **OP02:** route production được mở khi có đồng thời TENANT-level `member.read` và `role.read`; đọc detail, nhiều role/scope hiện hành, catalog seed; gán/thu hồi qua writer hiện có với lý do/xác nhận. Screen grant không thay quyền writer.
- **OP03:** route production được mở khi có TENANT-level `relationship.read`; đọc pending/active/inactive, tạo pending, xác minh, thu hồi qua writer hiện có. Parent selector yêu cầu `relationship.create`, Student selector yêu cầu TENANT-level `student.read`; nếu thiếu quyền, lỗi hoặc hơn 100 mục thì form tạo tắt. Quan hệ pending không mở quyền xem học sinh; quan hệ verified không tự cấp ưu đãi anh/chị/em.

## Navigation, API và migrations

- Migration mới `202610240004_r8_navigation_mvp`: giữ OP01=`member.read`, OP04/05=`approval.read`, OP06=`audit.read`, OP07=`job.read`; thêm OP02=`member.read` **và** `role.read`, OP03=`relationship.read`. Dùng `has_permission(t,m,p,NULL,NULL)` sau fresh principal và tenant check, giữ expiry 60 giây/phiên. Không dùng role name hay resource ID để cấp navigation. Function owner, `SECURITY DEFINER`, search path và restricted EXECUTE giữ nguyên.
- Migration `202610240003_r8_management_reads` từ implementation trước cung cấp projection đọc. API thêm: `GET /members/:id`, `GET /parent-student-links`, `GET /parent-student-links/parents`, `GET /parent-student-links/students`; mở rộng `GET /members` (đều dưới `/api/v1/tenants/:tenantId`).
- API tái sử dụng: `POST /members`, `PATCH /members/:id` (`DISABLED`), `GET /roles`, `POST /members/:id/role-assignments`, `POST /members/:id/role-assignments/:assignmentId/revoke`, `POST /parent-student-links`, `POST /parent-student-links/:id/verify`, `POST /parent-student-links/:id/revoke`.

## Files trong ZIP (repository-relative)

- `apps/api/prisma/migrations/202610240003_r8_management_reads/migration.sql`
- `apps/api/prisma/migrations/202610240004_r8_navigation_mvp/migration.sql` **NEW — owner review trước Git**
- `apps/api/src/identity-access/navigation.dto.ts`
- `apps/api/src/workflow-approval/runtime.controller.ts`
- `apps/api/src/workflow-approval/runtime.service.ts`
- `apps/api/test/r4/management-http.spec.ts`
- `apps/api/test/r4/navigation-proposal.cases.ts`
- `apps/api/test/r4/navigation.spec.ts`
- `apps/api/test/r4/r4.postgres.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- `apps/web/src/navigation.ts`
- `apps/web/src/r7.test.mjs`
- `apps/web/src/screens/Management & Operations/ProductionManagement.tsx`
- `apps/web/src/screens/Management & Operations/management-production.test.mjs`
- `apps/web/src/screens/Management & Operations/management.test.mjs`
- `docs/ai/integration/R8_MEMBER_RELATIONSHIPS_MVP_REPORT.md`

## Tests thực chạy cho đợt đóng MVP

- PostgreSQL 16 disposable qua R4 safe runner, filter navigation/member/relationship: **19 PASS, 80 SKIP**. Bao gồm OP02 đủ/thiếu từng permission, OP03 có/không `relationship.read`, CLASS/STUDENT không mở tenant screen, grant/phiên revoked, tenant khác, selector allowed/denied và writer từ chối dù navigation được mở. Migration mới được apply trong fresh cluster.
- Frontend focused browser/navigation: **71 PASS**; cập nhật thêm một assertion ở `r7.test.mjs`, chạy riêng sau đó **40 PASS**. Bao gồm OP01→OP02 đúng membership, OP03 selector fail closed và mutation 403 không báo thành công.
- Backend focused HTTP/navigation: **8 PASS**.
- `pnpm.cmd --filter web build`, `pnpm.cmd --filter api build`, web/api lint, `git diff --check`: **PASS**. Web lint còn một warning cũ ở AT03 ngoài scope.

## Blocker và cải tiến để sau

Không còn blocker MVP đã biết trong phạm vi OP01–OP03. Tìm/lọc hiện theo từng trang; Parent/Student selector giới hạn 100 và cần reader tìm kiếm phân trang khi dữ liệu lớn. Chưa chạy full regression, benchmark, stress hoặc shared DB. Deployment cần phê duyệt riêng.

Review ZIP: `artifacts/educore-r8-member-relationships-final-review.zip`.
