# R8 Member & Relationship Management MVP — báo cáo review

Ngày 24/10/2026. Trạng thái: **R8_MANAGEMENT_MVP_PARTIAL**.

## Scope và baseline

- Nhánh thực tế: `feat/r8-member-relationships-mvp`; HEAD trước sửa: `f6ac1445b10e3afd60e9b75741b56a57221e7c25`; working tree ban đầu sạch.
- OP01: đọc danh sách thành viên thật theo tenant, trang 20 bản ghi, tìm/lọc trong trang, tạo thành viên, vô hiệu hóa bằng writer hiện có và lý do, trạng thái lỗi. Global user mới nhận `PENDING_ACTIVATION`, tự kích hoạt AU06. Writer hiện có gắn user ACTIVE đã tồn tại với membership ACTIVE; không thay đổi quy tắc này trong R8.
- OP02: có reader chi tiết với tất cả role/scope hiện hành, role seed catalog, form gán/thu hồi với lý do và xác nhận. **Chưa truy cập được trong production** vì R7 navigation chưa phê duyệt OP02.
- OP03: có reader quan hệ, selector Parent/Student được phân quyền theo tenant, tạo pending, xác minh và thu hồi với lý do/xác nhận. Nếu selector lỗi hoặc hơn 100 bản ghi, thao tác tạo bị tắt. **Chưa truy cập được trong production** vì R7 navigation chưa phê duyệt OP03.

## API và quyền

- Thêm `GET /api/v1/tenants/:tenantId/members/:id`, `GET /api/v1/tenants/:tenantId/parent-student-links`, `GET /api/v1/tenants/:tenantId/parent-student-links/parents`, `GET /api/v1/tenants/:tenantId/parent-student-links/students`.
- Mở rộng projection của `GET /api/v1/tenants/:tenantId/members` qua `educore_r4.management_read`; không sửa writer lịch sử.
- Tái sử dụng `POST /members`, `PATCH /members/:id` (`DISABLED`), `GET /roles`, `POST /members/:id/role-assignments`, `POST /members/:id/role-assignments/:assignmentId/revoke`, `POST /parent-student-links`, `POST /parent-student-links/:id/verify`, `POST /parent-student-links/:id/revoke`.
- Reader mới gọi `educore_r4.authorize` trên live session/current tenant: `member.read`, `relationship.read`, `relationship.create` hoặc `student.read` theo loại. Selector Student yêu cầu TENANT-level `student.read`. Hàm `SECURITY DEFINER` thuộc `educore_r4_owner`; `EXECUTE` chỉ cấp `educore_r4_api`, không cấp PUBLIC. Writer hiện có và FK cùng tenant giữ các kiểm tra mutation. Preview fixtures không được import vào production.

## NEEDS_OWNER_DECISION — navigation

Đề xuất tối thiểu để owner duyệt riêng: OP02 chỉ khi cùng tenant có **cả** TENANT-level `member.read` và `role.read`; OP03 chỉ khi có TENANT-level `relationship.read`. Các mutation và selector vẫn phải dùng permission riêng tại Backend; screen grant không cấp resource operation. Cần migration forward-only sửa `navigation_access`, cập nhật allowlist client và native negative matrix (không quyền, scope CLASS/STUDENT, tenant khác, phiên bị thu hồi, multi-role không ghép phạm vi). R8 hiện không cấp OP02/OP03. Frontend negative test xác nhận cả hai vẫn bị từ chối dù response không duyệt chứa ID đó.

## Files changed

- `apps/api/prisma/migrations/202610240003_r8_management_reads/migration.sql` **NEW**
- `apps/api/src/workflow-approval/runtime.controller.ts`
- `apps/api/src/workflow-approval/runtime.service.ts`
- `apps/api/test/r4/management-http.spec.ts` **NEW**
- `apps/api/test/r4/r4.postgres.test.ts`
- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/screens/Management & Operations/ProductionManagement.tsx` **NEW**
- `apps/web/src/screens/Management & Operations/management-production.test.mjs` **NEW**
- `apps/web/src/screens/Management & Operations/management.test.mjs`
- `docs/ai/integration/R8_MEMBER_RELATIONSHIPS_MVP_REPORT.md` **NEW**

## Tests actually run

- `pnpm.cmd --filter web test`: PASS 242/242 (trước chỉnh sửa UI cuối); focused management sau chỉnh sửa: PASS 27/27; production OP01: PASS 1/1.
- `pnpm.cmd --dir apps/api exec vitest run test/r4/management-http.spec.ts test/r4/navigation.spec.ts`: PASS 8/8.
- R4 safe disposable PostgreSQL runner `-TestFilter R8`: PASS 14, SKIP 80 (gồm 2 reader tests mới; migration triển khai trên cluster riêng). `-TestFilter 'A11|A13|A14|X01|X03|X04'`: PASS 6, SKIP 88 (Manager cuối, onboarding, duplicate role, tenant isolation, parent revoke).
- `pnpm.cmd --filter web build`, `pnpm.cmd --filter api build`, `pnpm.cmd --filter api lint`, `pnpm.cmd --filter web lint`, `git diff --check`: PASS. Web lint còn 1 warning cũ ở `AT03/LeaveRequestFormScreen.tsx` ngoài scope.

## Risks/deferred

- OP02/OP03 production navigation cần owner duyệt mapping và negative tests trên migration tương lai. Không có đường vòng từ OP01.
- Tìm/lọc chỉ trong trang hiện tại; selector quan hệ giới hạn 100 mục và fail closed. Cần reader tìm kiếm có phân trang khi dữ liệu lớn.
- Native test mới xác minh reader/permission/trạng thái; các trường hợp writer và race trọng yếu dùng test R4 sẵn có. Không chạy full native suite, stress, benchmark, shared DB.
- Chưa commit/push/PR/deploy. Toàn bộ file **NEW** ở trên cần owner review trước Git.

Review ZIP: `artifacts/educore-r8-member-relationships-mvp-review.zip`.
