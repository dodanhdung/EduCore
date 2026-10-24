# R7 — Inventory tích hợp API thực tế

Baseline `2daefa8`, 23/10/2026. Kiểm tra source controller → service → restricted SQL gateway; không coi API design document là endpoint runtime. `T` = `/api/v1/tenants/:tenantId`; `U` = `/app/:tenantId`. Screen ID lấy SCREEN_MAP; route thực tế từ `apps/web/src/routes.ts`, embedded không tạo route mới.

Status:

- IMPLEMENTED_AND_VERIFIED: source có route và R7 đã chạy kiểm thử HTTP contract với service double; **không** chứng nhận PostgreSQL/end-to-end.
- IMPLEMENTED_NOT_INTEGRATED: source có controller/service/gateway; chưa nối UI và chưa chạy lại native DB trong R7.
- PARTIAL_CONTRACT: có một phần API nhưng thiếu read/write/projection cần cho workflow.
- MISSING_ENDPOINT: không tìm thấy public controller cho thao tác yêu cầu, dù có thể có internal SQL command.
- PENDING_REVIEW: contract/mapping/SQL mới chưa được duyệt.

Nguồn runtime: `identity-access/http.ts`, `auth.service.ts`, `r4-repository.ts`, `session.guard.ts`; `workflow-approval/runtime.controller.ts` + `runtime.service.ts`; `assignments-grading/learning.controller.ts` + Assignment/Submission/Grading services; `file-management/file.controller.ts`/`file.service.ts`; registered trong `R4Module`. Authorization ở migrations R2/R3/R4/R5 hiện có; R7 không sửa chúng. Báo cáo R4/R5/R6 là provenance lịch sử, không tự tính là suite đã chạy trong R7.

## Authentication & Shared

| Screen ID | UI route | Required operation | Actual backend endpoint | Backend status | Permission/scope | R7/R8 status |
|---|---|---|---|---|---|---|
| AU01 | /login | login; load identity | POST /api/v1/auth/login; GET /api/v1/auth/me | IMPLEMENTED_AND_VERIFIED | Exact Origin/login throttle; registered live Bearer for me | R7 connected; HTTP-double + form tests |
| AU02 | /select-tenant | choose allowed tenant | POST /api/v1/auth/select-tenant | IMPLEMENTED_AND_VERIFIED | Live session + ACTIVE allowed membership, selected server principal | R7 connected; HTTP service-double/consumer tests; native DB blocked |
| AU03 | /forgot-password | request reset OTP | POST /api/v1/auth/password/otp/request | IMPLEMENTED_NOT_INTEGRATED | Generic response; per-IP/user throttle | R8 connect recovery flow; UI hiện pending |
| AU04 | /reset-password | atomic reset | POST /api/v1/auth/password/reset | IMPLEMENTED_NOT_INTEGRATED | Email + purpose/OTP + newPassword; revoke sessions | R8; không có separate verify-OTP endpoint |
| AU05 | U/me | identity/session; password change/logout | GET /api/v1/auth/me; POST /api/v1/auth/password/change; POST /api/v1/auth/logout; POST /api/v1/auth/refresh | PARTIAL_CONTRACT | Self-service selected tenant; change oldPassword/newPassword; logout Bearer; refresh cookie+Origin+CSRF | R7 profile/session/logout/refresh; email/displayName/profile editor chưa có me projection |
| AU06 | /activate-account | OTP request / complete | POST /api/v1/auth/activation/otp/request; POST /api/v1/auth/activation/complete | IMPLEMENTED_NOT_INTEGRATED | Activation purpose; atomic initial password/activation | R8 connect; unavailable delivery không chứng minh gửi email |
| GL01 | U/notifications | list/count/mark read | GET T/notifications; GET T/notifications/unread-count; POST T/notifications/:id/read | IMPLEMENTED_NOT_INTEGRATED | R4 inbox rechecks current recipient/resource authority | R8 adapter, pagination/read persistence |
| GL02 | guard state (không registered /403,/404 route) | show 403/404 safe | Error filter on actual endpoints; no standalone error resource | IMPLEMENTED_AND_VERIFIED | Không lộ resource/SQL | R7 local guard/error UI; HTTP filter unit tests |

AU01/AU02 verified ở mức HTTP contract với service double và consumer integration; không suy ra endpoint hoạt động với DB hiện tại từ HTTP double.

## Management & Operations

| Screen ID | UI route | Required operation | Actual backend endpoint | Backend status | Permission/scope | R7/R8 status |
|---|---|---|---|---|---|---|
| G01 | U/overview | three KPI aggregate | Không có dashboard controller | MISSING_ENDPOINT | dashboard.view + scoped aggregates (contract cần review) | R8 dashboard read workflow |
| OP01 | U/settings/members | list/create/disable member | GET/POST T/members; PATCH T/members/:id | IMPLEMENTED_NOT_INTEGRATED | member.read/create/update, TENANT in R4; reason for writes | R8 DTO/projection adapter |
| OP02 | U/settings/members/:membershipId | detail/catalog/grants/assign/revoke | GET T/roles; POST T/members/:id/role-assignments; POST T/members/:id/role-assignments/:assignmentId/revoke; PATCH T/members/:id | PARTIAL_CONTRACT | role.read/assign, member.update; last-Manager guard, no self-escalation | R8 lacks GET member detail + current assignment/scope projection |
| OP03 | U/relationships | list/create/verify/revoke links | POST T/parent-student-links; POST T/parent-student-links/:id/verify; POST T/parent-student-links/:id/revoke | PARTIAL_CONTRACT | relationship.create/verify/revoke, TENANT; verification evidence | R8 missing list/detail readers, evidence-safe DTO |
| OP04 | U/approvals | list/filter | GET T/approvals | IMPLEMENTED_NOT_INTEGRATED | approval.read, TENANT gateway | R8 server currently page/pageSize only; UI status/operation filters missing |
| OP05 | U/approvals/:requestId | detail/decision/execute | GET T/approvals/:id; POST T/approvals/:id/decisions; POST T/approvals/:id/execute | IMPLEMENTED_NOT_INTEGRATED | R4 read; R2 decision/operation/current student scope; reason + idempotency-key | R8 map decision separately from COMPLETED/receipt |
| OP06 | U/audit | audit list/correlation explain | GET T/audit; GET T/audit/operations/:correlationId | PARTIAL_CONTRACT | audit.read / audit.explain, TENANT; safe projection | R8 UI actor/entity/date filters absent from public query |
| OP07 | U/operations/jobs | list/detail/enqueue/retry | GET/POST T/jobs; GET T/jobs/:id; POST T/jobs/:id/retry | IMPLEMENTED_NOT_INTEGRATED | job.read/retry; enqueue SQL checks operation permissions, scoped target; pinned policy/attempt limits | R8 readiness DTO not equivalent to permission/execution result |

## Academic Management

| Screen ID | UI route | Required operation | Actual backend endpoint | Backend status | Permission/scope | R7/R8 status |
|---|---|---|---|---|---|---|
| AC01 | U/students | list/create/search | Không public student CRUD | MISSING_ENDPOINT | student.read/create + scope | R8 enrollment workflow |
| AC02 | U/students/:studentId | profile/edit/learning history | GET T/students/:id/published-grades; GET T/students/:id/placement-context (không profile CRUD) | PARTIAL_CONTRACT | R5 published-grade visibility; placement requires enrollment scope | R8 profile reader/writer needed |
| AC03 | U/teachers | list/create | Không public teacher CRUD | MISSING_ENDPOINT | teacher.read/create | R8 roster workflow |
| AC04 | U/teachers/:teacherId | detail/edit/class assignments | Không public teacher/assignment management endpoint | MISSING_ENDPOINT | teacher.read/update, class.assign_teacher | R8 resource assignment workflow |
| AC05 | U/academic/catalog | subjects/levels CRUD | Không public catalog CRUD | MISSING_ENDPOINT | academic.read/manage | R8 reference data workflow |
| AC06 | U/courses | course CRUD | Không public course CRUD | MISSING_ENDPOINT | academic.read/manage, course.update | R8 reference data workflow |
| AC07 | U/classes | class CRUD/list | Không public class CRUD | MISSING_ENDPOINT | class.read/create/update | R8 enrollment workflow |
| AC08 | U/classes/:classId | class detail/roster/enrollment context | Không public class/roster GET; placement-context là student-scoped prerequisite riêng | MISSING_ENDPOINT | class.read, enrollment.read | R8 prerequisite readers |
| AC09 | embedded AC02/AC08 | enroll/transfer | GET T/students/:id/placement-context là prerequisite; chưa public enrollment writers | PARTIAL_CONTRACT | enrollment.create/transfer + grade-backed placement; R3 internal commands không phải public endpoint | R8 atomic enrollment/transfer; no fabricated recommendation |

## Scheduling & Resources

| Screen ID | UI route | Required operation | Actual backend endpoint | Backend status | Permission/scope | R7/R8 status |
|---|---|---|---|---|---|---|
| SC01 | U/schedule | calendar range read | GET T/sessions?from=...&to=...&studentId? | IMPLEMENTED_NOT_INTEGRATED | R3 calendar resource scope; max range 93 days, ISO UTC | R8 calendar adapter |
| SC02 | U/resources | rooms/resources/unavailability CRUD | Không public resource endpoints | MISSING_ENDPOINT | resource.read/manage, room.manage | R8 prerequisites + locking |
| SC03 | U/schedule/create | preview/create/confirm | Không public schedule writer/preview | MISSING_ENDPOINT | schedule.preview/create/confirm; R3 internal commands exist | R8 all-or-nothing schedule workflow |
| SC04 | embedded SC03/SC05 | conflict projection/confirm | Không public conflict/confirm endpoint | MISSING_ENDPOINT | Same scoped resource authorization, no cross-tenant detail | R8 advisory preview, not reservation |
| SC05 | U/schedule/sessions/:sessionId | detail/reschedule/cancel | GET T/sessions chỉ range list; no single detail/write routes | PARTIAL_CONTRACT | schedule.read/update/cancel in R3 internal coordinator | R8 history/revision/changes contract |
| SC06 | U/my/schedule | current self/linked-child calendar | GET T/sessions?from=...&to=...&studentId? | PARTIAL_CONTRACT | Fresh Teacher/Student/verified Parent resource scope | R8 needs self/child selector projection; no arbitrary IDs from navigation |

## Attendance & Leave

| Screen ID | UI route | Required operation | Actual backend endpoint | Backend status | Permission/scope | R7/R8 status |
|---|---|---|---|---|---|---|
| AT01 | U/attendance | sessions needing attendance | GET T/sessions gives calendar only | PARTIAL_CONTRACT | schedule.read ≠ attendance finalization authority | R8 due-session/roster read projection |
| AT02 | U/sessions/:sessionId/attendance | roster/batch/finalize | GET T/participants/:id/attendance (single participant read) | PARTIAL_CONTRACT | attendance.read paired class/student; missing batch writers | R8 attendance workflow |
| AT03 | U/leave-requests/new | create leave request | Không public leave create endpoint | MISSING_ENDPOINT | absence.create; self/verified child | R8 leave-to-attendance workflow |
| AT04 | U/leave-requests | list/approve/reject | Không public leave list/decision endpoints | MISSING_ENDPOINT | absence.read/approve, approve_late extra | R8 late approval/financial boundary |
| AT05 | embedded AT02 | locked attendance correction | Không public correction writer | MISSING_ENDPOINT | attendance.correct + reason/audit, issued basis immutable | R8 coordination gate, not silent invoice rewrite |

## Billing & Receivables

| Screen ID | UI route | Required operation | Actual backend endpoint | Backend status | Permission/scope | R7/R8 status |
|---|---|---|---|---|---|---|
| BL01 | U/finance/pricing | tariff CRUD/history | Không public price-rule routes | MISSING_ENDPOINT | pricing.manage; O-12 source date / immutable captured prices | R8 financial source workflow |
| BL02 | U/finance/discount-eligibility | sibling verify/revoke | Không public sibling routes (Parent link writer là nghiệp vụ khác) | MISSING_ENDPOINT | discount.verify, independent sibling evidence | R8 reviewed financial eligibility |
| BL03 | U/finance/billing-periods | periods/run/generation read/start | POST T/jobs kind BILLING_GENERATE is minimal enqueue, không periods/runs reader | PARTIAL_CONTRACT | billing.generate_draft; payload studentId/periodId, pinned policy | R8 generation workflow/public readers |
| BL04 | U/finance/drafts | draft list | Không public invoices list | MISSING_ENDPOINT | invoice.read/billing.read + student scope | R8 billing generation/issue |
| BL05 | U/finance/drafts/:draftId | lines/source/generation/recompute/issue | Không public draft detail/recompute/issue | MISSING_ENDPOINT | invoice.issue, pinned sources/generation/idempotency | R8 manual issue; no auto-issue |
| BL06 | U/finance/invoices | issued list | Không public invoices list | MISSING_ENDPOINT | invoice.read + resource scope | R8 invoice read workflow |
| BL07 | U/finance/invoices/:invoiceId | invoice detail/ledger/due | GET T/invoices/:id/receivable only | PARTIAL_CONTRACT | R2 receivable authority/current student scope; not full invoice/ledger DTO | R8 invoice projection + wallet workflow |
| BL08 | embedded BL07/BL09 | TOP_UP / WALLET payment | Không public top-up/pay endpoints | PENDING_REVIEW | payment.record + current financial scope; R2 internal commands exist | R8 transport review, no speculative financial API |
| BL09 | U/finance/receivables | receivables list/wallet/history | GET T/students/:id/wallet; GET T/invoices/:id/receivable | PARTIAL_CONTRACT | R2 current student financial read authority | R8 summary vs list/history DTO gap |
| BL10 | U/finance/invoices/:invoiceId/adjust | adjustment/cancel request | POST T/invoices/:id/adjustment-requests; POST T/invoices/:id/cancellation-requests | IMPLEMENTED_NOT_INTEGRATED | invoice.adjust_request/cancel_request, reason + idempotency; approval mandatory | R8 bind OP04/05 and confirmed execution outcome |
| BL11 | embedded BL08/09 | TOP_UP reversal / Payment reversal reconciliation | Không public reversal request writer | PENDING_REVIEW | payment.reverse + reviewable transport; immutable original | R8 preserve legacy/mixed gate |

## Assignments & Grading

| Screen ID | UI route | Required operation | Actual backend endpoint | Backend status | Permission/scope | R7/R8 status |
|---|---|---|---|---|---|---|
| AS01 | U/teaching/assignments | list teacher assignments | GET T/assignments | IMPLEMENTED_NOT_INTEGRATED | R5 assignment.read with current class/recipient scopes | R8 learning workflow |
| AS02 | U/teaching/assignments/new | create/edit/publish/archive | POST T/assignments; PATCH T/assignments/:id; POST T/assignments/:id/publish; POST T/assignments/:id/archive | IMPLEMENTED_NOT_INTEGRATED | assignment.create/update/publish; teacher assignment; idempotency-key/If-Match | R8 map actual DTO/revision |
| AS03 | U/teaching/assignments/:assignmentId | detail/recipients/submission history | GET T/assignments/:id; GET T/assignments/:id/recipients; GET T/assignment-recipients/:id/submissions; POST recipient revocation/deadline-extension | IMPLEMENTED_NOT_INTEGRATED | R5 current class/recipient/submission scopes | R8 selected resource IDs, no fixture fallback |
| AS04 | U/teaching/grading | grading queue | No dedicated queue; assignments/recipients/history readers exist | PARTIAL_CONTRACT | submission.read/grade.write + class/version linkage | R8 bounded queue projection, avoid unbounded N+1 |
| AS05 | U/teaching/submissions/:submissionId/grade | draft/publish/cancel/correct | GET/PUT T/submission-versions/:id/grade-draft; POST T/submission-versions/:id/grades/publish; POST T/submission-versions/:id/grade-draft/cancel; POST T/grades/:id/revisions | IMPLEMENTED_NOT_INTEGRATED | grade.write/publish/correct; versionId not route submissionId; revisions/idempotency | R8 resolver + lock/resubmit semantics |
| AS06 | U/my/assignments | own published assignment list | GET T/assignments?studentId=... | IMPLEMENTED_NOT_INTEGRATED | R5 SELF/verified linked child visibility; no draft leakage | R8 self context reader |
| AS07 | U/my/assignments/:assignmentId | detail/upload/submit/history/published grade | GET T/assignments/:id; GET/POST T/assignment-recipients/:id/submissions; POST T/files; GET T/files/:id; GET T/files/:id/download; GET T/students/:id/published-grades | IMPLEMENTED_NOT_INTEGRATED | submission.create SELF; files private recipient binding; Parent read-only | R8 recipient/version/file adapter, exact 10,000,000 bytes ×5 |

## Teacher / Student / Parent Portals

| Screen ID | UI route | Required operation | Actual backend endpoint | Backend status | Permission/scope | R7/R8 status |
|---|---|---|---|---|---|---|
| PO01 | U/teacher | self context/counts/calendar/queue | GET T/sessions; GET T/assignments; recipient readers; no portal aggregate/self-context endpoint | PARTIAL_CONTRACT | Current teacher membership/class assignments, separate operation permissions | R8 self context + aggregate |
| PO02 | U/student | own schedule/assignments/results | GET T/sessions; GET T/assignments; GET T/students/:id/published-grades; no self-profile resolver | PARTIAL_CONTRACT | SELF student profile; published only | R8 self context workflow |
| PO03 | U/parent | verified child list + child summaries | No scoped current-parent child-list endpoint | MISSING_ENDPOINT | Active verified non-revoked Parent links + grant per operation | R8 critical prerequisite; membership ID not student ID |
| PO04 | U/parent/children/:studentId | child read-only learning | GET T/sessions?studentId=...; GET T/assignments?studentId=...; GET T/students/:id/published-grades | PARTIAL_CONTRACT | Current Parent link + matching permission/resource; no child IDs from navigation | R8 context resolver/summary; no parent submissions |
| PO05 | U/my/billing | own/child issued invoices/wallet/due | GET T/students/:id/wallet; GET T/invoices/:id/receivable; no scoped invoice list | PARTIAL_CONTRACT | R2 scoped read; Student financial grants must follow actual catalog, not inferred from role | R8 read-only financial projection; no TOP_UP/payment controls |

## Complete transport notes / DTO gaps

- Auth refresh/logout HTTP tests run separately from DB: refresh rotates CSRF and cookie; me has no roles/email/displayName/effective grants. Reload has no CSRF bootstrap. No new navigation endpoint activated (`PENDING_REVIEW`).
- Runtime `GET roles` returns `{items,page,pageSize,total,asOf}` but only role id/code/name. Member list returns id/userId/status, not email/displayName/roleAssignments/last-valid-Manager indicator. Public GET member detail does not exist. UI fixtures are richer and must not be treated as response DTOs.
- Management public pagination accepts only page/pageSize. Relationship list, dashboard, audit actor/entity/date filters and full job readiness not available. Financial decision transport accepts decision/reason; no client-made COMPLETED state.
- Approval detail payload is safe subset studentId/invoiceId/amountDeltaVnd/paymentId/topUpId with decisions. Execute and decision remain separate transactions; only confirmed receipt/outcome can drive COMPLETED UI.
- Calendar requires from/to UTC and max93d; frontend timezone belongs to tenant contract, currently Tenant DTO only id/name. Never guess tenant timezone for production session/date/price semantics.
- Single-participant attendance read cannot supply session roster or batch writer. Internal R3 schedule/enrollment/attendance/leave functions are not controller endpoints.
- Wallet summary/receivable are narrow R2 reads; not invoice document, payment history, top-up writer or reversal API. Historical direct-cash payment design is not active new-wallet transport.
- Assignment detail, recipientId, submissionId and versionId are different identities. `If-Match`/idempotency-key and reason must map exact controller contract. Shared ApiClient currently exposes GET/POST JSON for foundation; R8 adds reviewed PATCH/PUT/multipart/download support per workflow, not fake local success.
- File upload is multipart field `file` + `recipientId` (not arbitrary context JSON); private GET/download still authorizes. `POST T/files/reconciliation` exists for privileged safe reconciliation, not a delete-all workflow.
- `POST T/assignment-recipients/:id/revocation` and `/deadline-extension` exist; reasons/revision/idempotency are required as in controller. Grade draft 0-vs-existing revision has explicit semantics; never infer current version from first fixture.
- P0 notification read actions use inbox SQL and server response. AU03/04/06 have backend routes but frontend pending; email delivery success is not inferred from accepted OTP response.

Coverage: **59 P0 design units** (53 registered routes + GL02 guard state + AC09/SC04/AT05/BL08/BL11 embedded). Không thêm 12 P1 concepts. R8 priorities và acceptance trong [backlog](R8_BACKLOG.md).
