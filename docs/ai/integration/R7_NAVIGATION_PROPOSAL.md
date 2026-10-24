# R7 — Navigation access: PROPOSED / PENDING_REVIEW

Ngày 23/10/2026. **Chưa được duyệt hoặc kích hoạt. Không có endpoint này trong runtime.**

Quyết định owner trong phiên R7: **giữ PENDING_REVIEW, production fail-closed; bàn giao proposal cùng ZIP R7**. Không chuyển SQL này thành migration hoặc bật reader trong R7.

Follow-up verification trên commit `1323972`: [security review](R7_NAVIGATION_SECURITY_REVIEW.md). SQL draft được bổ sung explicit NULL-tenant denial và đọc lại session sau User→Tenant checks/locks. Không có production migration, endpoint hoặc reader được bật. Fixtures PostgreSQL riêng cho proposal nằm trong native R4 test harness, mặc định skip và chỉ chạy với acknowledgement dành riêng cho test disposable.

Owner đã cho phép chạy fixtures **chỉ trên DB disposable**, vẫn giữ production PENDING_REVIEW. Kết quả opt-in:16 fixtures PASS trong native suite73 PASS/0 FAIL/0 SKIP. Test approval không phải contract approval; chi tiết trong [verification report](AUTH_FOUNDATION_VERIFICATION_REPORT.md).

## Evidence hiện có và boundary

R4 identity migration tạo `bind(token)`, `session_id()`, `me()` và `select_tenant`; principal gắn PID + transaction ID, token hash hiện hành, user ACTIVE, access/session chưa hết hạn và chưa revoked. `me` chỉ trả identity/allowed tenants. `SessionGuard` kiểm selected tenant và active allowed membership mỗi request.

R4 authorization migration: `has_permission(t,m,p,c,s)` ghép active membership, non-revoked membership_roles, tenant-bound roles/role_permissions, static permission catalog và access_scopes. CLASS/STUDENT phải khớp c/s; Parent còn cần verified/non-revoked child link, Teacher có class assignment hiện hành, Student đúng self profile. R5 có resource-specific learning authorizers; không được giả định R4 helper bao phủ toàn bộ assignment/grade semantics.

`educore_r4_api` có EXECUTE ở các gateway được allowlist, không SELECT bảng grant/raw credentials và không EXECUTE `has_permission` trực tiếp. `read(...,'ROLES')` cần `role.read` và trả catalog, không trả effective grants của caller. Dùng catalog làm quyền hoặc nới raw SELECT đều không chấp nhận.

## Contract tối thiểu xin review

`GET /api/v1/tenants/:tenantId/access/navigation`, Bearer access, SessionGuard. Không query/body role/scope/permission, không idempotency key vì read only. Backend dùng `R4Repository.transaction(token, ...)`, execute đúng một `educore_r4.navigation_access(tenantId)` bằng restricted API LOGIN. JWT vẫn verify issuer/audience/expiry trước bind. Không cache chung; `Cache-Control: no-store` hiện có.

Response consumer đề xuất:

```ts
{
  userId: string;
  sessionId: string;
  tenantId: string;
  screenIds: string[];
  validUntil: number; // Unix epoch milliseconds, maximum 60s and current access/session expiry
}
```

Không trả role, secret, token/hash, membershipId, classId/studentId/child list. Frontend tự gắn tenantEpoch sau response hiện hành; epoch không phải input bảo mật cho server. Evidence bị loại khi identity/tenant/epoch/freshness mismatch. 401 invalid/expired/revoked session; 403 selected tenant/membership mismatch; 200 `{screenIds:[]}` chỉ khi session/membership hợp lệ và không có eligible grants. SQL failures không đổi thành empty-success. 404 chỉ khi route chưa được activate; frontend vẫn đóng route nghiệp vụ.

## Mapping bước đầu: chỉ gateway tenant-scope hiện có

| Canonical screen | Permission hiện có | Scope gate / lý do |
|---|---|---|
| OP01 | member.read | TENANT; đúng gateway `read(...,'MEMBERS')` |
| OP04, OP05 | approval.read | TENANT; đúng read gateway. Không cấp approve/execute |
| OP06 | audit.read | TENANT; audit.explain không tự được cấp |
| OP07 | job.read | TENANT; job.retry/enqueue không tự được cấp |

Mapping này **PROPOSED**, chưa phải approved mapping. Union đa role chỉ trong cùng tenant và chỉ permission có TENANT scope. CLASS/STUDENT grants không biến thành tenant-wide navigation; bước đầu deny-conservative cho các grants này. Không có Parent portal grant trong proposal; liên kết Parent không được dùng để mở OP screens. Không có role-name switch trong mapping.

Các screen AC/SC/AT/BL/AS/PO/G01/GL01 còn cần mapping riêng với authorizer R2/R3/R4/R5 và read-provider/empty-state contract. Đặc biệt Teacher/Student/Parent cần existential resource witness hiện hành mà không lộ ID; không OR permission từ một scope với resource thuộc scope khác. Không dùng SQL proposal này để tuyên bố toàn bộ P0 navigation hoàn tất.

## SQL / role review gate

[Forward-only SQL draft](proposals/R7_navigation_access.sql) đặt ngoài `apps/api/prisma/migrations`; không sửa/rebaseline R1–R6. Function owner `educore_r4_owner` NOLOGIN, fixed search_path, explicit PUBLIC revoke; chỉ GRANT EXECUTE cho `educore_r4_api`. Không cấp AUTH/WORKER/OPERATOR raw access, không fallback migration LOGIN. Chỉ đọc và gọi helper hiện hữu; repository bind có ghi transaction context kỹ thuật như mọi authenticated read hiện tại, không ghi nghiệp vụ.

Chỉ sau sign-off mapping/contract/SQL mới chuyển thành migration timestamp mới, mount controller/service, bật trusted NavigationReader trong production. Phải test fresh disposable cluster, never shared/pre-existing DB. Review SQL chưa chạy không được tính là validated migration.

## Acceptance trước activation

Native PostgreSQL + HTTP: 401 missing/expired/revoked session; 403 wrong selected tenant/revoked membership; current grant succeeds; revoked role excluded; multi-role same tenant union; cross-tenant grant absent; CLASS/STUDENT không thành TENANT; Parent verified link không cấp OP hoặc child unrelated; no raw table SELECT/DDL/owner-role access; no secret/resource IDs; time bound <= access/session expiry; permission loss/revalidation. Frontend consumer tests hiện tại dùng HTTP double, không thay thế các vectors này.

NEEDS_REVIEW: owner phê duyệt phạm vi tối thiểu và mapping trên, hoặc yêu cầu mở đầy đủ scope-aware P0 mapping như một revision được review. Cho đến đó production giữ self-service và protected routes fail-closed.
