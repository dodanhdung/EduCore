# EduCore — API Specifications

> **Document ID:** EC-API-001  
> **Version:** 1.1-approved-group-A · **Date:** 17/10/2026 · **Status:** Approved group A API contract — NOT implemented  
> **Actual repository path:** `docs/design/api_specification.md`
> **Audience:** NestJS backend, React/Vite frontend, Codex and QA.  
> **Baselines:** Requirements Analysis **v5 đồng bộ vào repo (nhánh docs/approve-design-baseline-20261017)**, Use Case Specifications **v1.3**, Architectural Design (Accepted stack), Database Design v1.1 (Approved group A), 14 Class Design files v1.0 (Proposed), `docs/design/detailed_design.md`.

**Changelog — v1.1 + O-12 amendment, 18/10/2026 (`Asia/Ho_Chi_Minh`):** business A=A, B=B1, C=C1, D=D đã được chủ dự án phê duyệt trực tiếp; [Decision Register](../ai/DECISION_REGISTER.md#f-o-12--approved-business-decision-2026-10-18). DTO/generation/recompute transport bên dưới là **PROPOSED / PENDING API REVIEW**, không routes đã implemented hoặc phê duyệt schema/migration. Không thêm endpoint recompute vào route catalog.

## 0. Cảnh báo đồng bộ source of truth

Theo việc kiểm tra `dodanhdung/EduCore` nhánh `main` ngày 17/10/2026, file `docs/requirements/requirements_analysis.md` đã được đồng bộ bản v5 trên nhánh tài liệu, trong khi bản Requirements Library đã có Q-01–Q-15. **Phải merge nhánh tài liệu trước khi sinh mã.** App NestJS hiện chỉ có controller/service scaffold, chưa có các routes dưới đây, không có Prisma migrations; routes/permission string/request schemas trong tài liệu này là **hợp đồng kỹ thuật đề xuất**, không phải mô tả runtime hiện hành.

**Precedence:** FR/BR/Q v5 và UC v1.3 > Accepted Architecture > Proposed Database/Class Design > đề xuất API tại đây. Với domain đã có quy định P0/P1, **không tự nâng cấp P1 thành P0**. Bất kỳ API dưới đây ghi `P1` phải trả 404/không mount route ở P0, thay vì trả dữ liệu mô phỏng.

## 1. Protocol và security contract

### 1.1. Base URL, version, transport

- JSON REST v1 qua HTTPS: `/api/v1` (Approved group A). Routes business tenant-scoped: `/api/v1/tenants/{tenantId}/...`; global auth: `/api/v1/auth/...`.
- `Content-Type: application/json; charset=utf-8`; datetime ISO-8601 UTC, ví dụ `2026-10-20T02:00:00Z`; date-only `YYYY-MM-DD`, local time `HH:mm`, IANA timezone từ tenant. API không nhận client timezone như nguồn chân lý.
- UUID strings; monetary amount VND **decimal integer string** (`"1250000"`), không JSON floating point; percent trong policy internal dưới dạng decimal string. Score 0–10 một chữ số thập phân, ví dụ `8.5`.
- `X-Request-Id` optional; `correlationId` trong response/error và audit. Headers `Authorization: Bearer <accessToken>` cho protected APIs. Tenant selection từ **path và active membership** chứ không tin custom client header để cấp quyền.
- Refresh P0: access token trong JS memory (không lưu localStorage), refresh token hash trong DB và rotate mỗi lần refresh, cookie host-only HttpOnly Secure SameSite=Lax Path=/api/v1/auth. Production web/API ở 2 subdomain cùng site; CORS allowlist + credentials, Origin check + CSRF token với cookie-auth mutation. Cross-site preview phải proxy hoặc test riêng, không tự đổi SameSite=None. Không trả refresh token ra URL/query/log.
- Pagination `page` (1-based), `pageSize` (Approved default 20, max 100), `sort` theo allowlist, optional `q`, `status`, `from/to`; server filter tenant/permission/scope **trước** paging/count.
- For mutable resources include `revision`; client write sends `If-Match: "<revision>"` where noted. Business-changing POST uses `Idempotency-Key` (UUID hoặc opaque 16–128 chars đề xuất) when marked `IDEMP`. Same key + same fingerprint replays result; same key + different payload returns `409 IDEMPOTENCY_KEY_REUSED`.
- Permission labels như `schedule.confirm` are **proposed stable keys**, mapped to permissions catalog/seed after review; **role titles are not authorization checks**.

### 1.2. Standard envelopes (Approved group A)

**Success — object:** API trả thẳng JSON resource hoặc operation result với `id`, `status`/`revision` cần thiết. Collection response:

```json
{
  "items": [{"id": "b7c79a8f-88f0-4316-ac85-235b25690618", "name": "Lớp A"}],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "asOf": "2026-10-17T09:00:00Z"
}
```

**Error:**

```json
{
  "code": "SCHEDULE_CONFLICT",
  "message": "Không thể xác nhận vì tài nguyên trùng lịch.",
  "correlationId": "be84da6e-20c2-40ef-94b5-05a9b679c4ca",
  "details": {"conflicts": [{"resourceKind":"ROOM", "startAt":"2026-10-20T02:00:00Z", "endAt":"2026-10-20T03:30:00Z"}]}
}
```

`details` phải đã lọc theo quyền, không chứa đối tượng/cá nhân của tenant khác; 404 dùng cho ID không thuộc tenant/scope khi cần tránh enumeration.

### 1.3. Response status conventions

| HTTP | Ý nghĩa | Trường hợp |
|---|---|---|
| 200 | thành công read/command hoặc replay cùng idempotency key | list/detail, confirm đã lặp hợp lệ |
| 201 | tạo resource | profile, draft, payment, submission version |
| 202 | đã tiếp nhận nghiệp vụ chạy bất đồng bộ, trả operation/job ID | billing run/job execution khi enqueue |
| 204 | thành công không cần body | logout/mark-read nếu chọn không trả trạng thái |
| 400 | JSON sai dạng / input không parse được | query invalid, body syntax |
| 401 | chưa/không còn xác thực | expired/invalid token |
| 403 | permission không hợp lệ trên resource được phép trả 403 | access denied |
| 404 | resource không tồn tại **hoặc không nhìn thấy** | tenant, child, invoice target outside scope |
| 409 | cạnh tranh / idempotency / state conflict | revision stale, double issue, schedule overlap |
| 413 | file payload quá lớn | >10MB mỗi file |
| 415 | MIME không hỗ trợ | file extension/MIME không cho phép |
| 422 | business rule violation / dữ liệu chưa đầy đủ | INVALID_STATE, SOURCE_NOT_FINALIZED |
| 429 | rate limit | login/OTP flooding |
| 500/503 | lỗi bất thường / hạ tầng không sẵn sàng | DB, provider tạm lỗi |

### 1.4. Principal, policies, visibility

```ts
interface EffectivePrincipal {
  userId: UUID;
  membershipId: UUID; // checked active in tenantId
  tenantId: UUID;
  effectivePermissions: string[]; // refreshed/revalidated by Backend
  scopes: Array<{kind: 'TENANT' | 'CLASS' | 'STUDENT'; id?: UUID}>;
}
```

Authorization is **deny by default**. Resource path ID → query tenant-filtered resource → traverse resource ownership (`class`, `student`, `membership`, `invoice`, `submission`) → assert permission+scope. Parent access is constrained to `parent_student_links` verified and active; a user’s multiple roles are unioned only within the same tenant; no role grants cross-tenant access. Platform operator needs specifically authorized support grant and audit, not implicit PII access. Every background job and approved-operation execution rechecks effective actor/grant.

### 1.5. Functional security policies

- Login/password reset: password ≥12, Argon2id, OTP email one-use 15 minutes, access token 15 minutes, refresh ≤7 days, revoke sessions on password reset, login+OTP throttling, no account enumeration.
- Sensitive financial workflows always require permission and reason; issued invoice changes require manual approval; `SELF_APPROVED` is audited flag under allowed single-manager exception, **not workflow status**.
- Request IDs, audit and logs must redact credentials, OTP, JWT/refresh and unnecessary PII; never return `privateStorageKey` for files.
- OTP email is the **only external business delivery in P0**; no notification email, payment gateway, banking reconciliation, Google Sign-In, calendar integration.

## 2. Common DTOs & validations

| DTO / Value | Fields, type, constraints | Notes |
|---|---|---|
| `ResourceRef` | `id: UUID`, `tenantId` only when response needs it | ID cross tenant treated invisible |
| `MoneyVnd` | string regex `^(0|[1-9][0-9]*)$`, server parses `bigint` | signed adjustments use separate signed string validator |
| `DateTimeUtc` | RFC3339 full UTC datetime | session half-open range |
| `DateOnly` / `TimeOnly` | `YYYY-MM-DD` / `HH:mm` | series is local-time input |
| `MutationMeta` | optional `reason`, `revision`, `correlationId`; `policyVersionId` server-origin | not client-supplied authority |
| `PageRequest` | `page≥1`, `1≤pageSize≤100`, filters allowlist | defaults are proposed |
| `ApprovalDecisionInput` | `decision: APPROVE/REJECT/REQUEST_INFO`, `reason: nonempty string` | selfApproved server-calculated |
| `FileInfo` | `id`, `originalFilename`, `mimeType`, `sizeBytes: string`, `status` | no private storage path |
| `EventTrace` | `correlationId`, `operationId`, `policyVersionId`, `status` | readable only in appropriate scope |
| `StudentRef` | `studentId: UUID` resolved to student profile, not global user | profile may have no login |

For Zod/class-validator, explicit DTO for every mutation, reject unknown security-critical fields (`tenantId` inside body, `approvedBy`, `priceOverride`, `role` without relevant endpoint), never use Prisma model as public DTO. For patch requests, whitelist mutable fields per status.

## 3. Route catalog — P0

**Table conventions:** `T` = `/api/v1/tenants/{tenantId}`; `G` = `/api/v1`; `P` = permission key proposed; `SELF/REL` = domain ownership checks; `IDEMP` = required `Idempotency-Key`. GET operations also require permission/scope unless endpoint explicitly public. CRUD methods are **proposed** representations of UC actions.

### 3.1. Authentication & tenant selection — UC-01–03, UC-36 (P0)

| Method & path | Input → output / semantics | P / constraints |
|---|---|---|
| `POST G/auth/login` | `{email,password}` → `{user,allowedTenants,requiresTenantSelection}` plus session flow | PUBLIC; throttle; no account enumeration |
| `POST G/auth/select-tenant` | `{tenantId}` → `{accessToken,expiresInSeconds:900,principal}` | authenticated pre-tenant session; active membership |
| `POST G/auth/refresh` | protected refresh cookie/session → new short-lived access token | valid unrevoked session; CSRF mitigation |
| `POST G/auth/logout` | revoke current session → 204 | current session |
| `POST G/auth/password/otp/request` | `{email}` → generic accepted response | PUBLIC; OTP 15m; only external OTP email |
| `POST G/auth/password/reset` | `{email,otp,newPassword}` → 204 | verify OTP purpose PASSWORD_RESET, consume, Argon2id, revoke sessions atomically |
| `POST G/auth/activation/otp/request` | `{email}` → generic 202 accepted; purpose ACTIVATION | P0 account activation, OTP email only; throttle | 
| `POST G/auth/activation/complete` | `{email,otp,newPassword}` → 204 | purpose ACTIVATION; atomic activate user and membership, 12+ chars Argon2id, enable first Manager tenant only after active | 
| `GET G/auth/me` | principal + permitted tenant memberships/scopes summary | authenticated; sanitized |

**Approved:** Không có endpoint verify OTP riêng trong P0. Reset là atomic command; generic responses và rate limiting chống enumeration.

### 3.2. Identity & relationships — UC-04–06 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/members` | `q,status,page` → member page | `member.read`, scope TENANT |
| `POST T/members` | `{email,displayName,roleAssignments?}` → PENDING_ACTIVATION membership; sends no invitation email, user self-activates with OTP | `member.create`; no temporary password, explicit existing-user checks and scope |
| `PATCH T/members/{membershipId}` | `{status,displayName?}` → updated member | `member.update`; no last Manager removal |
| `GET T/roles` | seeded catalog + permission references | `role.read` |
| `PUT T/members/{membershipId}/role-assignments` | `{assignments:[{roleId,scopeKind,scopeId?}]}` → effective grants | `role.assign`; P0 role defaults, not dynamic role editor; audit |
| `GET T/parent-student-links` | `parentMembershipId?`, `studentId?` → scoped verified links | `relationship.read` or SELF/REL |
| `POST T/parent-student-links` | `{parentMembershipId,studentId,evidenceReference}` → pending/verified link | `relationship.create`; verification required before active |
| `POST T/parent-student-links/{id}/verify` | `{reason}` → active link | `relationship.verify`; audit |
| `POST T/parent-student-links/{id}/revoke` | `{reason}` → revoked | `relationship.revoke`; audit |
| `POST T/sibling-verifications` | `{studentAId,studentBId,evidenceReference}` → verification | `discount.verify`; independent of parent link |

Do not infer sibling discount solely from common phone/surname; verification in Q-02/Q-09 remains a manual proof workflow.

### 3.3. Academic management — UC-07–10 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/students` / `GET T/students/{id}` | `q,status,classId,page` / detail | `student.read`; Parent/Student SELF/REL via separate scoped view or same route with projection |
| `POST T/students` / `PATCH T/students/{id}` | name, code, DOB?, status; patch whitelisted fields | `student.create/update`; tenant unique code; never hard-delete history |
| `GET T/teachers` / `GET T/teachers/{id}` | filtered list / teacher profile | `teacher.read`/assigned scope |
| `POST T/teachers` / `PATCH T/teachers/{id}` | `{teacherCode,fullName,competencies?}` / patch | `teacher.create/update`; can exist without account |
| `GET T/subjects` / `POST T/subjects` | catalog / `{name,code}` | `academic.read/manage` |
| `GET T/levels` / `POST T/levels` | level catalog / create | `academic.read/manage` |
| `GET T/courses` / `POST T/courses` | course page / `{subjectId,levelId,name}` | `course.read/create` |
| `PATCH T/courses/{id}` | editable course metadata | `course.update`; protect historical references |
| `GET T/classes` / `GET T/classes/{id}` | class page/detail | `class.read`, scope |
| `POST T/classes` / `PATCH T/classes/{id}` | `{courseId,capacity,startDate?,name}` / status or metadata | `class.create/update`; capacity >0 |
| `POST T/classes/{id}/teacher-assignments` | `{teacherId,validFrom,validTo?,roleKind}` → assignment | `class.assign_teacher`; same tenant/competency/time |
| `GET T/classes/{id}/enrollments` | student enrollments | `enrollment.read`, class scope |
| `POST T/classes/{id}/enrollments` | `{studentId,effectiveFrom}` → enrollment | `enrollment.create` + room/class capacity and schedule check, IDEMP recommended |
| `POST T/enrollments/{id}/transfer` | `{targetClassId,effectiveFrom?,reason}` → transfer request/result | `enrollment.transfer`; confirmed by authorized staff; future only, **IDEMP** |
| `PATCH T/enrollments/{id}/status` | `{status,reason}` | `enrollment.update`; preserve enrollment history; P1 SUSPENDED workflow disabled P0 |

### 3.4. Rooms, availability & schedules — UC-11–14 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/rooms` / `POST T/rooms` | list / `{name,capacity,location?}` | `room.read/manage`; capacity>0 |
| `PATCH T/rooms/{id}` | whitelisted metadata/status | `room.manage`; historical booking protected |
| `GET T/resource-unavailability` | filters resource/date | `resource.read`, scope |
| `POST T/resource-unavailability` | `{resourceKind,resourceId,startAt,endAt,reason}` → draft | `resource.manage` |
| `POST T/resource-unavailability/{id}/confirm` | confirm blocking unavailability | `resource.manage`; conflict check, **IDEMP** |
| `POST T/resource-unavailability/{id}/cancel` | reason → release | `resource.manage`; audit, **IDEMP** |
| `GET T/schedule/series` | classId/date range → page | `schedule.read`, scope |
| `POST T/schedule/series` | `{classId,teacherId,roomId?,weekday,localStartTime,durationMinutes,validFrom,validTo}` → drafts | `schedule.create`; weekly ≤6 months, tenant timezone |
| `POST T/schedule/series/{id}/preview` | calculate prospective session conflicts | `schedule.preview`; advisory, not a reservation |
| `POST T/schedule/series/{id}/confirm` | series all-or-nothing → confirmed sessions | `schedule.confirm`, **IDEMP**, resource locks, conflict recheck |
| `GET T/sessions` / `GET T/sessions/{id}` | `from,to,classId?,teacherId?,studentId?` / detail | `schedule.read`, scoped; bounded range |
| `POST T/sessions` | single draft `{classId,teacherId,roomId?,startAt,endAt}` | `schedule.create`; validation |
| `POST T/sessions/{id}/confirm` | draft→confirmed | `schedule.confirm`, **IDEMP**, no overlaps |
| `POST T/sessions/{id}/reschedule` | `{startAt,endAt,roomId?,reason,revision}` → updated | `schedule.update`, **IDEMP**, future only, release/rebook atomic |
| `POST T/sessions/{id}/cancel` | `{reason,revision}` → CANCELLED | `schedule.cancel`, **IDEMP**, release resources, outbox |

`POST /schedule/series/{id}/confirm` must fail as a whole if one occurrence conflicts; frontend may display preview conflicts but cannot rely on preview result at confirmation time.

### 3.5. Attendance & leave — UC-15–16 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/sessions/{id}/attendance` | participants + draft/finalization/lock info | `attendance.read`, class/child scope |
| `PUT T/sessions/{id}/attendance` | `{records:[{participantId,status}],revision}` → drafts | `attendance.mark`; Teacher assigned; EXCUSED requires approved leave |
| `POST T/sessions/{id}/attendance/finalize` | finalization summary | `attendance.finalize`; **IDEMP**, all participants present |
| `POST T/attendance-records/{id}/corrections` | `{newStatus,reason}` → correction/approval if locked | `attendance.correct`; audit; issued invoice routed to billing adjustment |
| `GET T/absence-requests` | status/studentId/from/to page | `absence.read`, or SELF/REL |
| `POST T/absence-requests` | `{participantId,reason}` → pending request | `absence.create` SELF/REL; late notice flagged |
| `POST T/absence-requests/{id}/approve` | `{reason}` → approved/EXCUSED eligibility | `absence.approve`; late requires `absence.approve_late` |
| `POST T/absence-requests/{id}/reject` | `{reason}` → rejected | `absence.approve`; audit |

Notice cutoff ≥24h is classified by server using session start; no submission auto approval. Teacher marking ATTENDED overrides approved leave where actual attendance occurred.

### 3.6. Billing & receivables — UC-21–26 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/price-rules` / `POST T/price-rules` | filters / `{scope:SESSION|CLASS|COURSE,scopeId,unitPriceVnd,effectiveFrom,effectiveTo?}`; effective dates `YYYY-MM-DD`, `[from,to)` | `pricing.read/manage`; no overlap same tenant/target; selection by local session-start date, future-only tariff publication |
| `PATCH T/price-rules/{id}` | modify future-effective rule; protect begun sessions and captured selection even before draft | `pricing.manage`; no historical amount/target/backdated override, no implicit past-tariff repair; snapshots immutable |
| `GET T/billing/periods` | `{year?}` → monthly periods | `billing.read` |
| `POST T/billing/runs` | `{period:YYYY-MM,studentIds?}` → job(s)/run(s), 202 possible | `billing.generate_draft`, **IDEMP**; only confirmed attendance; early next month |
| `GET T/billing/runs/{id}` | status/snapshot error/source completeness | `billing.read`, scoped |
| `GET T/invoices` / `GET T/invoices/{id}` | period/status/studentId page / summary+lines+ledger | `invoice.read` or SELF/REL child invoice |
| `POST T/invoices/{id}/issue` | `{revision?}` → ISSUED, dueAt | `invoice.issue`, **IDEMP**; manual issue, freeze snapshot |
| `GET T/invoices/{id}/receivable` | amount issued, valid allocations, outstanding | `invoice.read`, scope |
| `POST T/invoices/{id}/payments` | `{amountVnd,method:CASH|BANK_TRANSFER,receivedAt?,externalReference?}` → payment | `payment.record`, **IDEMP**; manual reconciliation, amount ≤ outstanding |
| `GET T/invoices/{id}/payments` | payments/reversals/allocations | `payment.read`, scope |
| `POST T/payments/{id}/reversals` | `{reason}` → reversal request/record | `payment.reverse`, **IDEMP**; audited authority |
| `POST T/invoices/{id}/adjustment-requests` | `{kind,amountDeltaVnd,reason,evidence?}` → approval request | `invoice.adjust_request`; manual approval mandatory |
| `POST T/invoices/{id}/cancellation-requests` | `{reason}` → approval request | `invoice.cancel_request`; manual approval mandatory |
| `GET T/receivables` | `studentId?,status?,dueBefore?` → page | `receivable.read`, tenant/student scope |

No P0 endpoint to collect money via bank API, gateway, auto issue invoice or auto refund. `payment.method=BANK_TRANSFER` means **manual recording after outside reconciliation**. An issued invoice’s raw line amount cannot be patched directly.

### 3.7. Assignments, submissions & grading — UC-27–29 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/assignments` / `GET T/assignments/{id}` | classId/studentId/status page / scoped detail | `assignment.read`, SELF/REL for student/parent |
| `POST T/assignments` | `{classId?,studentIds?,title,description,priority,deadlineAt}` → DRAFT | `assignment.create`, teacher assigned; priority 1..5 |
| `PATCH T/assignments/{id}` | mutable draft fields/deadline extension with reason | `assignment.update`, `If-Match`; cannot silently shorten after submission |
| `POST T/assignments/{id}/publish` | `{recipientStudentIds?}` → PUBLISHED + recipient snapshot | `assignment.publish`, **IDEMP**, outbox for notification |
| `GET T/assignments/{id}/recipients` | students and submission status | `assignment.read`, Teacher assigned scope |
| `POST T/assignment-recipients/{id}/submissions` | `{answerText?,fileIds?:UUID[]}` → new submission version | `submission.create` SELF; **IDEMP**, max 5 READY files, deadline+7d, no post-grade resubmit |
| `GET T/assignment-recipients/{id}/submissions` | version history for owner/assigned teacher | `submission.read` SELF/REL/TEACHER; no other student's files |
| `PUT T/submission-versions/{id}/grade-draft` | `{score,feedback,reason?}` → draft/revision | `grade.write`, Teacher assigned, latest valid version, score 0..10 step 0.1 |
| `POST T/submission-versions/{id}/grades/publish` | `{revision}` → published grade | `grade.publish`, **IDEMP** |
| `POST T/grades/{id}/revisions` | `{score,feedback,reason}` → new published-grade revision/draft per policy | `grade.correct`, **IDEMP**, audit reason |
| `GET T/students/{id}/published-grades` | published only, scoped | `grade.read_published` SELF/REL |

Student/Parent grade visibility only after explicit publication. Parent may view child assignment/submission status but **may not submit on child’s behalf** unless separate validated policy permits (not part of v5 baseline).

### 3.8. File Management — UC-28 support (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `POST T/files` | `multipart/form-data`, one file → FileInfo | `file.upload` SELF within authorized assignment context; 10MB/file; MIME allowlist; private staging |
| `GET T/files/{id}` | safe metadata | `file.read` + submission owner/class scope |
| `GET T/files/{id}/download` | authorized streaming, attachment disposition | `file.download`; never reveal internal key |

Allowed: `application/pdf`, DOCX official MIME, `image/jpeg`, `image/png`; bytes signature/extension/MIME validate; no public object URL or direct volume access. More than 5 files per submission version rejected when linking to version, even if separately uploaded.

### 3.9. In-app notifications — UC-31 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/notifications` | `unreadOnly?,page` → recipient inbox | authenticated membership SELF; assigned scope |
| `GET T/notifications/unread-count` | `{count}` | authenticated membership SELF |
| `POST T/notifications/{id}/read` | mark read (idempotent) | recipient only |

Notifications are materialized **only** after `ScheduleChanged` and `AssignmentPublished` committed or manager admin alert; dedupe `(eventId,recipientId,kind)`. P1 deadline reminders are **not** active in P0.

### 3.10. Reporting — UC-32 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/dashboard/overview` | `{asOf,scope,activeStudents,activeClasses,outstandingReceivablesVnd}` | `dashboard.view`, effective scope; SQL aggregate read-only |

`activeStudents` = distinct student with ACTIVE enrollment, `activeClasses` = ACTIVE classes, outstanding from ISSUED invoice + applied adjustments − valid allocated payments/credits. Not draft invoice or unused advance. Parent does not get tenant-wide dashboard.

### 3.11. Workflow & approvals — UC-26,33–34 (P0 bounded)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/approvals` / `GET T/approvals/{id}` | status/operationType/page, scoped details | `approval.read` with target scope |
| `POST T/approvals/{id}/decisions` | `{decision,reason}` → APPROVED/REJECTED/NEEDS_INFORMATION | `approval.decide` and operation-specific permission; **IDEMP** |
| `POST T/approvals/{id}/execute` | approved request → execution result `COMPLETED` or `FAILED` | `approval.execute`, **IDEMP**, revalidate permission/target/conflicts |
| `GET T/approvals/{id}/timeline` | decisions/status timeline | `approval.read` scoped |

P0 does **not** provide dynamic workflow-policy editors. `APPROVED` response must never imply already modified business resource; use `COMPLETED` only when application coordinator committed change. Self approval only if permitted policy + eligible single-manager case with reason and audit.

### 3.12. Automation jobs & audit — UC-35/37 (P0)

| Method & path | Input → output | P / invariants |
|---|---|---|
| `GET T/jobs` / `GET T/jobs/{id}` | filters READY/RUNNING/NEEDS_INFORMATION/PENDING_APPROVAL/COMPLETED/FAILED; job details | `job.read` on authorized tenant/scope |
| `POST T/jobs/{id}/retry` | `{reason}` → requeued or denied | `job.retry`, **IDEMP**; permission recheck, same policyVersion and operationKey |
| `GET T/audit` | targetType/targetId/from/to/actor/page → filtered event list | `audit.read`, tenant and target scope, redact secrets |
| `GET T/audit/operations/{correlationId}` | explanation of triggered/rule/actor/result | `audit.explain`, scoped, can omit internal PII |

System/internal worker endpoints for scheduler `claim/run/outbox dispatch` are **not public REST routes** in P0: run within NestJS API process with internal service calls, lease and transaction protections.

## 4. P1 route design — NOT mounted in MVP

All routes below are **design placeholders only**. They must remain disabled until product scope is promoted, migrations/permissions are reviewed, and test cases exist.

| Module (P1) | Proposed endpoints under `T` | Guard / business rule |
|---|---|---|
| Makeup (UC-17) | `GET /makeup/options?originParticipantId=...`, `POST /makeup/requests`, `POST /makeup/requests/{id}/confirm`, `POST /makeup/requests/{id}/reschedule` | approved EXCUSED, same subject/level/content, 30 days local, max 1 consumed; no charge twice |
| Suspension/return (UC-18/19) | `POST /suspensions`, `POST /suspensions/{id}/approve`, `POST /suspensions/{id}/resume`, `GET /tuition-credits` | no overlapping suspensions; credit only actual paid allocated unused sessions; no auto-refund |
| Teacher substitution (UC-20) | `GET /substitutions/options`, `POST /substitutions`, `POST /substitutions/{id}/accept`, `POST /substitutions/{id}/confirm` | teacher accepts first, staff authorized confirm, ≤8h/day/40h/week |
| Prepaid/combo (UC-22–25) | `POST /prepaid-packages`, `GET /prepaid-packages`, `POST /tuition-credits/{id}/allocations` | 6 months paid, 5% then sibling 10%; net 14.5%, no retroactive recalculation |
| Dynamic policy & RBAC (UC-05/33) | `GET/POST /policies/versions`, `POST /policies/versions/{id}/publish`, `PATCH /roles/{id}/permissions`, `GET/POST /approval-policies` | version snapshots, required privileged approval |
| Learning/financial reporting (UC-30/32) | `GET /students/{id}/progress`, `GET /reports/attendance`, `GET /reports/financial` | only published grades, Q-12 numerator/denominator; role scope |
| Reminders/external channel (UC-31) | `GET/POST /notification-preferences`, `GET /reminder-schedules` | 24h/1h before deadline; email business delivery P1 only |
| Tenant lifecycle platform (UC-36) | platform-privileged `/api/v1/platform/tenants` create/transition/archive | P1 UI; no automatic access to tenant records |

## 5. Request/response contracts for critical flows

### 5.1. Login + tenant selection (P0)

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email":"user@example.com","password":"<redacted>"}
```

```json
{
  "user": {"id":"8995a617-9a6f-4bee-a1cc-4e60b21af2a5","displayName":"User A"},
  "allowedTenants": [{"id":"7d5bfdd9-e22a-44d6-9d3b-01b8c8130864","name":"Trung tâm A"}],
  "requiresTenantSelection": true
}
```

`select-tenant` must verify that the account is active and is a member of the selected tenant, then issue a 900-second access token. The example IDs/data are illustrative only, not existing source data. Avoid returning passwords, hashes, or full privileged grants in a public login response.

### 5.2. Confirm recurring series: all-or-nothing (P0)

```http
POST /api/v1/tenants/7d5bfdd9-e22a-44d6-9d3b-01b8c8130864/schedule/series/4f8d6a58-bf55-4a0c-988f-47b538a54a11/confirm
Authorization: Bearer <accessToken>
Idempotency-Key: confirm-series-20261020-a0
```

Successful `200`:

```json
{
  "seriesId": "4f8d6a58-bf55-4a0c-988f-47b538a54a11",
  "status": "CONFIRMED",
  "confirmedSessions": 12,
  "policyVersionId": "1ba15ba3-d8d4-467a-930a-b158b2f48750",
  "correlationId": "672361b8-43f6-4707-996b-a3e791e57afc"
}
```

Conflict `409` uses `SCHEDULE_CONFLICT` and a safe list of localizable conflict windows; transaction rolls back all sessions in the series. `cancel/reschedule` require future-only business validation; cancellation releases bookings and emits outbox event after committed schedule change.

### 5.3. Finalize attendance (P0)

```http
POST /api/v1/tenants/{tenantId}/sessions/{sessionId}/attendance/finalize
Authorization: Bearer <accessToken>
Idempotency-Key: final-20261020-session-1
```

`200` response:

```json
{"sessionId":"8f0a6582-0b47-43e9-8bd9-9a9161223f13","finalized":true,"recordCount":10,"finalizedAt":"2026-10-20T04:35:00Z"}
```

Possible `422 SOURCE_NOT_FINALIZED` if an active participant has no eligible attendance; `422 ABSENCE_NOT_APPROVED` if EXCUSED lacks approved leave; `409 ATTENDANCE_LOCKED` on normal edit after 48h or invoice issuance.

### 5.4. Draft → issue invoice (P0)

Draft request:

```http
POST /api/v1/tenants/{tenantId}/billing/runs
Authorization: Bearer <accessToken>
Idempotency-Key: billing-2026-09-student-88
Content-Type: application/json

{"period":"2026-09","studentIds":["75f622d8-f910-4696-be61-871ee713c83b"]}
```

`202` (async) example:

```json
{"jobId":"35058f3f-6985-48c4-9e26-6812b17e1ef1","status":"READY","policyVersionId":"1ba15ba3-d8d4-467a-930a-b158b2f48750"}
```

Example finalized DRAFT invoice read model, after worker success:

```json
{
  "id":"a20ab050-35ae-45d6-a631-0c9d243ffbe2",
  "status":"DRAFT","period":"2026-09",
  "studentId":"75f622d8-f910-4696-be61-871ee713c83b",
  "grossVnd":"1000000","discountVnd":"100000","totalVnd":"900000",
  "discounts":[{"kind":"VERIFIED_SIBLING","rate":"0.10"}],
  "lineCount":8,"issuedAt":null,"dueAt":null,"revision":1
}
```

**Arithmetic example**, not tariff baseline: 8 confirmed charge units × sample 125,000 VND = 1,000,000; verified sibling discount 10% → 900,000; combo not applied P0. Issuing is separate `POST /invoices/{id}/issue` with `invoice.issue` and idempotency key; response includes `status=ISSUED`, issue timestamp and `dueAt = issuedAt + 7 days` according to business timezone/calendar rule selected consistently. If sources incomplete, run returns `NEEDS_INFORMATION`, not an issued invoice.

#### O-12 contract amendment — business approved; DTO/transport pending API review

Every line derives `sourceBusinessDate=pricingLocalDate=local_date(ClassSession.startsAt,timezoneSnapshot)` on the server; `billingMonth=first_day_of_month(sourceBusinessDate)`. One logical invoice/student/tenant/month may contain different rates for different session dates. Window `effectiveFrom <= pricingLocalDate < effectiveTo` (NULL end=infinity), SESSION > CLASS > COURSE. Source class/course is historical lineage, not current enrollment after transfer. Initial monthly draft requires closed period `[monthStart,nextMonthStart)` and confirmed attendance, with CANCELLED units0 exception; missing price even for cancelled source → NEEDS_INFORMATION, not implicit 0.

| Read DTO field (proposed) | Format / meaning / authority |
|---|---|
| `sourceBusinessDate`, `pricingLocalDate` | `YYYY-MM-DD`, equal per line, server-derived from session start and frozen z; not from charge/generation/issue/worker/client date |
| `timezoneSnapshot`, `billingMonth` | IANA ID, `YYYY-MM`; frozen C1, source-start month, not UTC calendar month |
| `priceRuleId`, `effectiveFrom`, `effectiveTo` | UUID; DATE strings and nullable DATE end, captured selection window |
| `unitPriceVnd`, `baseAmountVnd`, totals/discounts | exact integer decimal strings, e.g. `"100000"`; no money JSON number; HALF_UP once at invoice end |
| `selectionTier`, `selectionSourceId`, `sourceLineage` | SESSION/CLASS/COURSE, selected UUID and original session/class/course IDs/revisions; proof readable only in authorized scope |
| `generationId`, `generationNo`, `baseGenerationId`, `appliedGenerationId` | UUID/positive integer/pointers, separate historical generation result from current invoice projection |
| `chargeCreatedAt`, `generationCreatedAt`, `calculationPolicyVersionId` | server UTC RFC3339 instant(s), audit/admission and request-policy pin only; never tariff selector. Tariff policy provenance separately reported |
| `requestHash`, `recomputeReason`, `beforeAfterDiff`, `correlationId` | canonical server hash, authorized reason and safe totals/rule/source/policy diff, audit correlation; no arbitrary client snapshot |

Read model example for **one line** (not a second complete invoice fixture):

```json
{
  "sourceBusinessDate":"2026-09-20","pricingLocalDate":"2026-09-20",
  "timezoneSnapshot":"Asia/Ho_Chi_Minh","billingMonth":"2026-09",
  "priceRuleId":"603c6e0a-87b3-46fc-9ac9-3f3ce5d963ab",
  "effectiveFrom":"2026-09-01","effectiveTo":"2026-10-01",
  "selectionTier":"COURSE","selectionSourceId":"230564e0-bc32-42bd-b01e-62be5bbf2c74",
  "unitPriceVnd":"100000","baseAmountVnd":"100000",
  "generationCreatedAt":"2026-10-02T02:00:00Z"
}
```

| Operation | Required behavior |
|---|---|
| Initial via catalog `POST T/billing/runs` | Durable G1 receipt + source/price/policy/zone capture atomically with job enqueue if async; existing monthly identity reused/unique. Worker never picks a fresh policy or price clock |
| Retry same typed Idempotency-Key/hash | Return/continue same G1/pinned inputs/result, current permission rechecked. Different hash → conflict. Historical G1 replay after G2 must not overwrite current G2 |
| Deliberate recompute | **PROPOSED / PENDING API REVIEW:** new key, nonempty reason, expected base + applied generation/CAS, new G2/history/diff; only before issue, no second logical invoice. G2 pins policy for new request but resolves all prices at their session dates. Concrete route/path, permission mapping and exact DTO/status transitions require review; neither a new endpoint nor a new mode of existing POST is approved here |
| Issue via existing catalog command | Validate current applied G, no pending/stale recompute, source revisions/completeness/snapshot/current authority; retain per-session prices/policy, create permanent claims including units0 and number/issue/audit atomically; no price lookup at issue date |
| Issued correction/adjustment | Reject recompute/reprice/line patch; UC-26 authorized append-only adjustment flow and original basis/audit; no automatic refund/credit |

Reject unknown/server-owned write fields: pricingLocalDate/sourceBusinessDate, timezoneSnapshot, generation/charge clock, selected priceRuleId/unitPriceVnd/result override (except unitPriceVnd in authorized tariff configuration), policyVersion override. Use HTTP 400 validation for these proposed DTO violations, never trust a client price date. Same logical key with new arbitrary body is not recompute. Freeze C1 after first ScheduleSeries/ClassSession (including DRAFT), BillingPeriod or BillingRun/generation; even Ops cannot change frozen zone through ordinary operations. No new timezone endpoint is introduced.

**Proposed error mapping (pending API review):** 409 GENERATION_CONFLICT/GENERATION_STALE for expected-generation/source mismatch or pending recompute; 409 IDEMPOTENCY_KEY_REUSED for hash mismatch; 409 INVOICE_ALREADY_ISSUED for recompute/illegal mutate; 422 PERIOD_NOT_CLOSED/PERIOD_SOURCE_MISMATCH, PRICE_NOT_DEFINED/PRICE_AMBIGUOUS or SOURCE_NOT_FINALIZED (run NEEDS_INFORMATION for missing valid input); 422 TIMEZONE_FROZEN/PRICE_HISTORY_PROTECTED for prohibited ordinary config changes. Existing 401/403/404 authority rules remain; missing permission is not NEEDS_INFORMATION. Infrastructure retry must keep key/G/pin; unknown commit lookup receipt first. Failure rolls back business effects; error attempts can be audited separately after rollback.

New tariff applies future local dates only; DATE cannot price intraday. No historical amount/target edit or backdated rule/override for already-started sessions even if no invoice exists. Future close of an open window must preserve old selections/snapshots; irrelevant future tariff changes do not stale/reprice G1. Missing historic prices require explicit data-repair review outside ordinary create/update; never silently use current tariff. Scheduling/attendance/price writer vs capture/apply/issue must follow the reviewed common transaction protocol in [DB §3.6](database_design.md) and [DD §5.7](detailed_design.md); O-01 SQL privileges/lock order remain pending, no concurrency safety claim here. Acceptance [O12-AC-01–27](../ai/reviews/database/O12_DECISION_PROPOSAL.md#n5-acceptance-matrix-hien-hanh--o12-aa) is a test specification, not test evidence.

### 5.5. Payment (P0)

```http
POST /api/v1/tenants/{tenantId}/invoices/{invoiceId}/payments
Authorization: Bearer <accessToken>
Idempotency-Key: manual-payment-receipt-487
Content-Type: application/json

{"amountVnd":"400000","method":"BANK_TRANSFER","externalReference":"MANUAL-RECON-487"}
```

`201`:

```json
{"paymentId":"9c489d49-0f12-4121-a45b-fb534d25be2b","invoiceId":"a20ab050-35ae-45d6-a631-0c9d243ffbe2","amountVnd":"400000","outstandingVnd":"500000","status":"RECORDED"}
```

The amount is verified manually by authorized staff **outside EduCore**. Server locks invoice/receivable, validates non-overpayment, inserts one payment + allocation + audit in one transaction; same key replay returns the same payment; same key with altered amount returns `409 IDEMPOTENCY_KEY_REUSED`. No gateway callback or auto bank validation endpoint P0.

### 5.6. Financial approval is not execution (P0)

**Request:** `POST T/invoices/{id}/adjustment-requests` with `{kind:"REDUCE",amountDeltaVnd:"-100000",reason:"Điều chỉnh có chứng cứ"}` creates `PENDING_APPROVAL`; `POST T/approvals/{id}/decisions` with `{decision:"APPROVE",reason:"Đã đối chiếu"}` returns `APPROVED` only. **Only** `POST T/approvals/{id}/execute` may append adjustment to ledger and transition to `COMPLETED` after recheck. If worker executes later, response is `202` with job state rather than false completion. Audit decision and execution separately.

### 5.7. Upload + submit + publish grade (P0)

1. `POST T/files` multipart → `FileInfo(id,status=READY)` after validated staging/promotion (or STAGING until ready, in which case submit is blocked).
2. `POST T/assignment-recipients/{id}/submissions` `{answerText:"...",fileIds:[...]}` → `201 {submissionId,versionId,versionNo,isLate,submittedAt}`; latest version set, old versions remain immutable.
3. `PUT T/submission-versions/{id}/grade-draft` `{score:8.5,feedback:"..."}` → DRAFT grade visible only to grader.
4. `POST T/submission-versions/{id}/grades/publish` → PUBLISHED grade, visible to Student/linked Parent; fixing published grade uses revision with reason, not silent overwrite.

## 6. Error code taxonomy (proposed, to be frozen during API review)

| Code | HTTP | Used by | Meaning / UX |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | all | show field errors; never echo raw secrets |
| `AUTH_REQUIRED` / `SESSION_REVOKED` | 401 | auth | reauthenticate, clear session |
| `PERMISSION_DENIED` | 403 | protected | no permission in actual target scope |
| `RESOURCE_NOT_FOUND` | 404 | all | absent or invisible to principal |
| `VERSION_CONFLICT` | 409 | patch/write | stale revision; refetch UI |
| `IDEMPOTENCY_KEY_REUSED` | 409 | IDEMP commands | same key, different fingerprint |
| `SCHEDULE_CONFLICT` / `RESOURCE_UNAVAILABLE` | 409 | scheduling | no partial confirm; show safe conflicts |
| `CAPACITY_EXCEEDED` | 422 | academic/scheduling | no remaining class/room capacity |
| `INVALID_STATE_TRANSITION` | 422 | workflow/academic | illegal state operation |
| `ABSENCE_NOT_APPROVED` | 422 | attendance | EXCUSED requires approved leave |
| `ATTENDANCE_LOCKED` | 409 | attendance | 48h/issued invoice lock; use correction workflow |
| `SOURCE_NOT_FINALIZED` / `PRICE_NOT_DEFINED` | 422 | billing | run NEEDS_INFORMATION; resolve inputs |
| `INVOICE_ALREADY_ISSUED` | 409 | billing | cannot issue duplicate or mutate snapshot |
| `PAYMENT_EXCEEDS_RECEIVABLE` | 422 | payment | P0 rejects amount above outstanding |
| `APPROVAL_REQUIRED` | 422 | finance/workflow | create or complete approval first |
| `SUBMISSION_WINDOW_CLOSED` | 422 | assignments | after deadline +7d |
| `RESUBMISSION_NOT_ALLOWED` | 422 | assignments | already graded / out of window |
| `GRADE_NOT_PUBLISHED` | 404/403 | grades | hide draft from Student/Parent |
| `FILE_TOO_LARGE` | 413 | files | max 10MB per file |
| `FILE_TYPE_UNSUPPORTED` | 415 | files | PDF/DOCX/JPG/PNG only |
| `FILE_COUNT_EXCEEDED` | 422 | submissions | max 5 file links/version |
| `RATE_LIMITED` | 429 | auth/OTP | throttle without user enumeration |
| `DEPENDENCY_UNAVAILABLE` | 503 | OTP/DB/storage | safe retry when appropriate |

## 7. Idempotency, locks, audit, outbox

| Mutation | Lock/idempotency strategy | Audit / event |
|---|---|---|
| schedule confirm series | `tenant+series+operation`, sorted resource locks, exclusion constraints, rollback all | `SCHEDULE_CONFIRMED`; schedule-change event only when relevant |
| schedule reschedule/cancel | `If-Match` + operation key; resource release/rebook atomic | `ScheduleChanged` (in-app recipients via outbox) |
| finalize attendance | one finalization/session + operation key; full participant set | attendance finalized + correction audit |
| billing run | `(tenant,student,period)` logical unique; generation typed key/hash, new-command expected-generation CAS; session-date pricing snapshots | initial/retry/recompute diff/history audit; job attempts separate; O-12 transport pending review |
| issue invoice | invoice row lock + unique participation charge claim | issued audit; no auto in-app billing message P0 |
| payment record | invoice lock + `(tenant,operationType,idempotencyKey)` unique | payment recorded audit; no duplicate allocation |
| finance approve/execute | approval revision + unique target execution operation | decision and execution audit separately |
| publish assignment | assignment lock/revision + unique assignment event | `AssignmentPublished` outbox |
| submit version | recipient/submission row lock + version unique index | submission audit; READY file links |
| mark notification read | notification recipient-scoped update | idempotent no duplicate notification |
| job retry | persisted operationKey + lease claim + pinned policy | attempts, FAILED manager alert |

**Retry semantics (Q-13):** transient operation errors: initial attempt + at most 3 retries at 1, 5, 15 minutes; no infinite retries for `NEEDS_INFORMATION` or `PENDING_APPROVAL`; no new policyVersionId or idempotency key after retry. A failed notification consumer never rolls back original scheduling/assignment commit. Scheduler/worker control is a private NestJS service, not public user endpoints.

## 8. Response projections, query safety & performance

- `GET /students`, `/classes`, `/invoices`, `/assignments`, `/audit` use server-side pagination with index-friendly tenant/scope filters; never return `passwordHash`, `otpHash`, private file storage path, approval secrets or draft grades to unauthorized clients.
- Normal reads target NFR-01 p95 within 1 second; conflict detection NFR-02 within 2 seconds on agreed dataset; these are **targets not measured achievements**.
- Date range GET sessions requires bounded range; use existing index on `(tenant_id,start_at)` and resource-specific indexes as DB Design suggests; resource overlap checks must hit database constraints.
- Dashboard read model must aggregate consistent `asOf` snapshot; if scopes restrict class/student, restrict all three KPI consistently or mark inaccessible KPI explicitly — do not leak total tenant count through response.
- `GET /audit` retention baseline 24 months, safe audit field redaction. Do not expose server stack/SQL in `details`.

## 9. OpenAPI / NestJS implementation guidance

**Deliverable for backend build:** generate authoritative `openapi.json` from NestJS Swagger decorators / DTOs at CI build and verify against this Markdown contract. This Markdown is the **human-readable contract proposal**; generated OpenAPI becomes the executable interface once approved.

Suggested `operationId` naming convention: `AuthController_login`, `SchedulingController_confirmSeries`, `BillingController_generateDraft`, `InvoiceController_issue`, `PaymentController_record`, `AssignmentController_publish`, `SubmissionController_submitVersion`, `WorkflowController_decideApproval`; API clients generate typed SDK from OpenAPI or use shared Zod when justified. Avoid hand-maintained DTO duplicates across web and api.

```ts
// Pseudocode: exact NestJS decorator choices are implementation proposals.
@Post('invoices/:invoiceId/payments')
@RequirePermission('payment.record')
async recordPayment(
  @TenantPrincipal() principal: Principal,
  @Param('invoiceId') invoiceId: string,
  @Headers('idempotency-key') key: string,
  @Body() body: RecordPaymentDto,
) {
  return this.paymentCoordinator.record({principal, invoiceId, key, body});
}
```

Every controller delegates to application coordinator; DTO validation and authorization must be performed again within service/transaction for sensitive effects. Do not use API docs as permission bypass or as evidence that repository code already exists.

## 10. Test matrix for contract acceptance

| Contract gate | Test examples | Trace |
|---|---|---|
| Authentication | 15min access, 7d refresh, OTP 15min one-use, 12-char Argon2id password, revocation, throttling | Q-01/UC-01–03 |
| Authorization | multi-role same tenant; scope CLASS/STUDENT; Parent linked child only; cross-tenant GET/POST/IDOR all denied | BR-08,10/UC-36 |
| Scheduling | adjacent periods allowed, room/teacher/student overlap denied, cancelled resource freed, concurrent same resource only one commit, series atomic | BR-01/Q-04/UC-12/13 |
| Attendance | approved leave vs actual ATTENDED, 24h notice, 48h lock/issue lock, incomplete finalization blocks billing | Q-05/UC-15/16 |
| Billing | price precedence SESSION>CLASS>COURSE, only confirmed attendance, sibling 10%, one final rounding, issue manual, due 7 days | Q-08/09/UC-21–24 |
| Payment | partial payments, no overpayment, one invoice/payment, duplicate key same body replay, different body 409, reversal append-only | Q-10/UC-25/26 |
| Grading | priority 1–5, latest version, late ≤7 days, 10MB×5, accepted MIME, score one decimal, no draft leak, published revision audit | Q-11/UC-27–29 |
| Notification/jobs | no email notification P0, outbox after commit, dedupe same event+recipient, retries 1/5/15, alert FAILED/needs approver | Q-13/UC-31/37 |
| Audit | actor/policy/correlation/reason recorded, redaction, read scope, 24mo retention | Q-14/UC-35 |
| Dashboard | exactly three P0 metrics; distinct ACTIVE students, classes ACTIVE, issued outstanding only, no cross-scope leakage | Q-12/UC-32 |

Do not accept API implementation until contract tests cover error cases, authorization boundaries, idempotency after timeout, and at least the concurrency scenarios above. Scheduling and billing unit suites target **≥80% branch coverage** (NFR-12).

## A. Chốt group A: API contracts 17/10/2026

### A.1. HTTP conventions
- Business route /api/v1/tenants/{tenantId}, auth route /api/v1/auth. Object response JSON direct; collection {items,page,pageSize,total,asOf}, page=1, pageSize=20 default max=100; errors {code,message,correlationId,details?}. Date RFC3339 UTC, VND decimal integer string, scores decimal. Invalid body 400, auth 401, forbidden 403, invisible 404, stale/idempotency 409, business 422, throttle 429.
- If-Match: quoted revision on mutable records marked; Idempotency-Key required for paths marked IDEMP. Same key + request hash replay, different payload 409. Tenant ID from URL is never proof of authorization.

### A.2. Auth runtime security
- Access token expires in 900 seconds, JS in-memory only. Refresh token maximum 7 days stored as DB hash with rotation and replay detection; HttpOnly Secure SameSite=Lax host-only cookie Path=/api/v1/auth; logout revokes refresh session.
- Two same-site custom subdomains for Vercel web + Railway API, HTTPS. CORS with credentials only on explicit frontend origin allowlist. On cookie-auth POST request (refresh/logout/auth session-changing) validate Origin and double-submit CSRF or synchronizer token (token bound to session; not same value as refresh token). No cookie-based auth for other business mutation: Bearer access token with current server authorization.
- Cross-site Vercel/Railway default domains do not automatically work with SameSite=Lax; use same-site production domains or tested reverse-proxy; no unconditional SameSite=None.

### A.3. Atomic OTP endpoints
| Method | Request | Result |
|---|---|---|
| POST /api/v1/auth/password/otp/request | {email} | 202 generic, OTP PASSWORD_RESET if eligible |
| POST /api/v1/auth/password/reset | {email,otp,newPassword} | 204 on success; verify+consume OTP+change Argon2id hash+revoke sessions in one transaction |
| POST /api/v1/auth/activation/otp/request | {email} | 202 generic, OTP ACTIVATION if eligible |
| POST /api/v1/auth/activation/complete | {email,otp,newPassword} | 204 on success; activate user/membership transactionally, first Manager enables tenant |

No standalone otp/verify endpoint. OTP expires in 15 min, hashed one-use with attempt/rate limits, no plaintext email invitation nor temporary password; generic account-existence responses.

### A.4. P0 bootstrap contract and permissions
- Tenant+initial Manager provision by operator CLI only (not public REST), seeds baseline policy, permission catalog and role mappings; Manager pending activation. Manager creates further memberships with role assignment by secured /members POST; activation OTP email is only external business email.
- Seed permissions and default role mapping are enumerated in detailed_design.md §A.2; dynamic role/permission editing is P1. Every API route must map to one concrete catalog permission; no wildcard runtime grant. MANAGER TENANT, TEACHER CLASS assigned, STUDENT self, PARENT verified linked STUDENT, ACCOUNTANT/ACADEMIC_STAFF scoped assignment. Never disable last active Manager.
- API routes for financial decisions still require operation-specific approval, scope and audit; approval.decide does not imply any financial action permission. All P1 routes unmounted in P0.

### A.5. P0 invoices
- One invoice per student per tenant per billing month aggregates enrollment lines. Invoice number assigned at issue only. After approved negative adjustment on already paid invoice, outstanding never negative; excess stored in payment_excess_resolutions (PENDING_RESOLUTION), visible to authorized accounting and not automatically refunded/credited.
- Schema/DTO for excess reconciliation is part of billing vertical slice, not authorization to mount refund or credit endpoints in P0.
## 11. Decisions pending per-slice review (not group A)

1. Billing asynchronous 202 vs synchronous 201, dueAt timezone/day-boundary, reversal approval and excess resolution exact state transitions.
2. Isolation level, SQL exclusion/locking and concurrency test gates.
3. Approval execution sync/async and policy rechecks.
4. OpenAPI client generation, fixtures, backup/restore and measurable NFR gates.

---

**Versioning/change control:** When v5 requirements is checked into the repo and contract is reviewed, keep group A as approved and finish per-slice contract review before full implementation and generate matching OpenAPI JSON. New FR/Q changes require traceability update, acceptance tests and explicit API version compatibility review.
