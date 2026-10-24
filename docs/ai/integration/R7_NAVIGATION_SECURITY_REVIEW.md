# R7 — Navigation proposal security review

Follow-up baseline: `feat/foundation-auth-tenant-access`, commit `1323972c79c9af23c9762a8d215f16aca3870844`. Scope review: FR-03/04/42, UC-01/36 C-02/C-03, BR-08/10, Q-01/02/15, Detailed Design DD-01/§5.1, R4/R6 reports và runtime/migrations thực tế. Không sửa nguồn nghiệp vụ hoặc mở R8.

**Owner decision vẫn là PENDING_REVIEW, production fail-closed.** Static review hoặc disposable test không phải contract approval/production activation.

## Proposal gốc

Draft tạo `educore_r4.navigation_access(t uuid)` SECURITY DEFINER, đọc live bound session, kiểm selected tenant, gọi `educore_r3.principal(t)` và `educore_r4.has_permission(t,m,p,NULL,NULL)`. Trả userId/sessionId/tenantId/screenIds/validUntil, không resource IDs. Proposed HTTP GET `/api/v1/tenants/:tenantId/access/navigation` chưa mount. Frontend production chưa inject NavigationReader.

## Mapping review

| Screen | Static permission seeded | Actual resource read contract | Kết luận |
|---|---|---|---|
| OP01 | member.read | RuntimeController GET members → R4 read MEMBERS → authorize member.read | Phù hợp navigation read eligibility TENANT; không cấp create/update |
| OP04 | approval.read | GET approvals → read APPROVALS → authorize approval.read | Phù hợp list eligibility; không cấp decision/execute |
| OP05 | approval.read | GET approvals/:id → read APPROVALS với target ID | Phù hợp detail screen eligibility; ID vẫn phải authorize/load server-side |
| OP06 | audit.read | GET audit → read AUDIT → authorize audit.read | Không suy ra audit.explain hoặc quyền đọc raw sensitive fields |
| OP07 | job.read | GET jobs/:id/list → read JOBS → authorize job.read | Không suy ra job.retry/enqueue/current readiness |

Mọi code trên có trong static P0 seed `202610190011_r4_authorization`; R5 chỉ mở thêm learning semantics trên helper hiện hữu, không biến các read grants này thành resource mutation authority. Không map MANAGER/TEACHER/PARENT sang screen IDs trong client hoặc draft mapping. Backend helper hiện có vẫn giữ những giới hạn quan hệ/actor tương ứng của catalog; proposal tái dùng authorizer, không tự thiết kế semantics mới.

**Khuyến nghị:** owner chấp nhận mapping tối thiểu cho read-only navigation sau khi review exact contract/SQL. Static review và 16 PostgreSQL fixtures cho draft đã PASS; các điều kiện activation bên dưới vẫn áp dụng. Không khuyến nghị bật toàn bộ P0 screens, hoặc coi read grant là quyền hành động. Đây là recommendation của review, không phải APPROVED.

## Session / membership / revocation

- `bind(token)` chỉ chấp nhận registered access hash, user ACTIVE, access/session còn hạn và session chưa revoked. Transaction principal nằm ở schema riêng, gắn backend PID + transaction ID + live token hash; không GUC/header user/role của caller.
- `session_id()` kiểm lại PID/TX/hash và trạng thái live. Context không sống qua COMMIT/ROLLBACK. AuthService còn verify JWT issuer/audience/expiry trước repository transaction.
- `principal(t)` đã được R4 bridge thay principal source sang gateway_sessions; lấy User SHARE rồi Tenant gate, kiểm live user/selected tenant/membership ACTIVE/left_at NULL/tenant ACTIVE. Membership bị thu hồi không được biến thành response grants rỗng thành công; read bị từ chối.
- `has_permission` ghép đúng tenant/membership/non-revoked role assignment/static permission/access_scopes của cùng grant. TENANT scope mới khớp NULL class/student context; CLASS/STUDENT-only không thể trở thành TENANT grants. Multi-role union chỉ trong một tenant; không OR permission ở grant này với scope ở grant khác.
- Parent link chỉ thỏa các permission/context mà authorizer hiện hữu cho phép; verified link không cấp member/approval/audit/job staff access. Proposal không trả child IDs hoặc tự làm Parent directory.
- Expiry vẫn có thể xảy ra trong lúc response đang truyền; validUntil không vượt access/session expiry, client kiểm Date.now/context/epoch. Server resource operations phải authorize lại, kể cả khi menu còn visible trong cửa sổ tối đa60s.

## Roles / privileges / SECURITY DEFINER

HTTP runtime tiếp tục dùng LOGIN riêng thuộc `educore_r4_api`, không migrator/DATABASE_URL fallback; AUTH/WORKER/OPERATOR không được gom vào API LOGIN. `assertRuntime()` kiểm superuser/DDL/owner/combined capabilities/raw credential SELECT. Private effective-permission tables không được mở raw SELECT cho API.

Draft function owner `educore_r4_owner` NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS. Fixed `search_path=pg_catalog,educore_r4,pg_temp`; public tables và R3/R4 helpers được schema-qualify; không dynamic SQL hoặc permission list do client gửi. Cần EXECUTE principal/helper hiện hữu của owner (đã có trong R4), không cần thêm quyền SELECT bảng hoặc owner membership cho API. Explicit REVOKE PUBLIC, GRANT đúng function cho educore_r4_api; không GRANT AUTH/WORKER/OPERATOR.

Function chỉ đọc nghiệp vụ nhưng dùng lock/context như authenticated gateway hiện hữu: bind ghi transaction principal kỹ thuật, principal lấy User/Tenant locks. Không gọi command/seed/audit/business mutation từ navigation. Owner có khả năng đọc rộng hơn wrapper; cần giữ body allowlist, fixed search_path và kiểm source migration mới khi sau này activate.

## Findings / corrections chỉ trong draft

| ID | Finding | Xử lý |
|---|---|---|
| NAV-01 | Cả input tenant và active_tenant_id NULL làm phép IS DISTINCT FROM trả false; endpoint UUID validation sẽ chặn nhưng raw SQL contract nên deny rõ | Thêm `t IS NULL OR ...` → SQLSTATE42501 trước principal |
| NAV-02 | Session row/expiry được đọc trước khi principal có thể đợi User/Tenant locks | Đọc lại qua session_id sau principal và deny28000 nếu không còn live; trả expiry từ row đã refresh |
| NAV-03 | Navigation evidence có TTL nên không phải authorization capability cho resource | Giữ tối đa60s và ràng user/session/tenant/client epoch; revoke/switch/logout xóa evidence; resource endpoints reauthorize |
| NAV-04 | Mapping chỉ phủ năm operations screens; không có reviewed resource witness mapping cho academic/finance/learning/portals | Giữ deny-conservative, không mở các screens còn lại trong task này |

Không sửa historical migration, không tạo production migration, không thay grants trong ordinary runtime DB. SQL corrections nằm tại `proposals/R7_navigation_access.sql`, vẫn unactivated.

## Test evidence / trạng thái riêng biệt

Existing R4 native PostgreSQL suite đã chạy lại trên cluster mới và chứng minh baseline session/grant/scope/Parent/privilege behavior. Đây là evidence cho authorizers hiện hữu, **không thay thế test function proposal mới**. Browser auth journey dùng actual React/Nest/restricted PostgreSQL; business routes vẫn fail-closed.

16 proposal test cases trong `apps/api/test/r4/navigation-proposal.cases.ts`, đăng ký trong existing R4 harness, mặc định SKIP. Bao gồm: unbound; wrong/null tenant; revoked membership/role; actual TENANT read; CLASS-only; STUDENT-only; multi-role union đủ năm screens; missing permission; verified Parent; restricted raw SELECT/ACL; exact safe response fields/TTL; expired/revoked session; disabled user; cùng user có grants khác nhau ở hai tenant; function owner/search_path/PUBLIC ACL. Denial kiểm SQLSTATE cụ thể, không source-string matching hoặc mock grants.

Fixture execution được tách bằng `R7_NAVIGATION_PROPOSAL_TESTS=OWNER_APPROVED_DISPOSABLE_PROPOSAL_TEST`, đồng thời yêu cầu existing R4 fresh-cluster admission và literal-loopback unique DB name. Owner đã cho phép rõ: **“Chạy fixtures trên DB disposable; giữ production PENDING_REVIEW.”** Draft function chỉ được cài trong DB kiểm thử mới của runner. Không set acknowledgement trong runner mặc định hoặc production env; không reuse cluster suite trước. Test profile/database/generated artifacts không đóng gói.

Default native run: **57 PASS / 0 FAIL / 16 SKIP**, xác nhận function không tồn tại khi không opt-in và proposed endpoint trả404. Opt-in native run: **73 PASS / 0 FAIL / 0 SKIP**, trong đó cả16 proposal fixtures PASS; endpoint vẫn404. Chi tiết lệnh, cluster và sanitized evidence ở [verification report](AUTH_FOUNDATION_VERIFICATION_REPORT.md). Actual browser journey PASS trong cả hai chế độ. Đây là kiểm thử SQL trong disposable PostgreSQL, chưa phải kiểm thử một navigation HTTP contract đã triển khai.

| Trạng thái | Disposition |
|---|---|
| Static review | Hoàn thành, có NAV-01/02 draft corrections và giới hạn NAV-03/04 |
| PostgreSQL baseline security tests | Đã chạy thực; số cuối trong verification report |
| PostgreSQL draft-function fixtures | **16 PASS / 0 FAIL / 0 SKIP** trên fresh disposable cluster được owner cho phép; mặc định vẫn SKIP |
| Contract reviewed by agent | Có, với recommendation có điều kiện |
| Contract approved by owner | **PENDING_REVIEW** |
| Production activation | **NONE**: không endpoint/migration/reader mới |

## Activation prerequisites

1. Owner sign-off exact read DTO, selected-tenant/membership errors, mapping và freshness semantics.
2. Giữ16 proposal fixtures và native baseline regressions PASS khi chuyển draft thành migration; bước disposable verification hiện tại đã hoàn thành, không thay review migration mới.
3. Review forward-only migration mới, exact owner/privilege/search_path và schema drift. Không sửa/rebaseline R1–R6.
4. Implement/controller DTO + trusted frontend reader trong một task được approve riêng; resource authorization không đổi.
5. Kiểm HTTP401/403/no-store/revalidation/permission loss và deployment domain/TLS/cookie behavior trước production decision.

Không tuyên bố production readiness từ review này.
