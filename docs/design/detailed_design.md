# EduCore — Detailed Design

> **Document ID:** EC-DD-001  
> **Phiên bản tài liệu:** 1.1-approved-group-A · **Ngày:** 17/10/2026 · **Trạng thái:** Approved nhóm A, pending per-slice review  
> **Phạm vi:** P0 có thể triển khai thành vertical slices; P1 chỉ thiết kế điểm mở rộng, **không tự đưa vào MVP**.  
> **Vị trí thực tế trong repository:** `docs/design/detailed_design.md`
> **Quan hệ tài liệu:** đọc cùng `docs/requirements/requirements_analysis.md`, `docs/requirements/usecase/specification.md`, `docs/architectural/architectural_design.md`, `docs/design/database_design.md`, `docs/design/class design/README.md` và `docs/design/api_specification.md`.

**Changelog — v1.1 + O-12 amendment, 18/10/2026 (`Asia/Ho_Chi_Minh`):** business A=A, B=B1, C=C1, D=D được chủ dự án phê duyệt trực tiếp; §5.7 giữ session-date pricing và bổ sung generation contract. [Decision Register](../ai/DECISION_REGISTER.md#f-o-12--approved-business-decision-2026-10-18). Pseudocode/DTO/locks/persistence vẫn PROPOSED, không code/schema/migration approval.

**Wallet amendment · 19/10/2026:** **BUSINESS APPROVED B1–B5**, simplification **PRINCIPLE ACCEPTED**, xác nhận trực tiếp owner; [Register §G](../ai/DECISION_REGISTER.md#g-wallet-p0--owner-business-approval-2026-10-19). New finance flow ở §5.7 theo Requirements Q-10 amended. Exact Q1–Q8/locks/grants/G representation/recovery/API vẫn **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; chưa implementation.

## 0. Tình trạng nguồn và quy tắc ưu tiên

- **[Nguồn nghiệp vụ — BASELINE]** Bản `requirements_analysis (1).md` trong Library có lịch sử v1→**v5**, Q-01–Q-15, FR-01–FR-45, BR-01–BR-14, NFR-01–NFR-16. `use_case_specifications (1).md` là **v1.3**, UC-01–UC-37, được lập theo Requirements v5. Không thay đổi ngầm các điều kiện này.
- **[Đã kiểm tra repo 17/10/2026]** `dodanhdung/EduCore`, nhánh `main`: `docs/requirements/requirements_analysis.md` **đã được đồng bộ mục lịch sử v5 trên nhánh tài liệu**; repo có cấu trúc monorepo pnpm, app NestJS và Vite scaffold, chưa có Prisma schema/migrations và API nghiệp vụ. Vì vậy **không được xem một hành vi được mô tả ở đây là đã code hoặc đã test**. Trước khi code, merge nhánh tài liệu và đối chiếu Use Case/Architecture.
- **[Kiến trúc — ACCEPTED]** Modular Monolith; TypeScript, React/Vite, NestJS, PostgreSQL, Prisma, REST/OpenAPI, pnpm; Vercel web, Railway API/PostgreSQL + private Volume; PostgreSQL transactional outbox và internal worker; OTP email là tích hợp nghiệp vụ bên ngoài duy nhất P0.
- **[Database/Class design — PROPOSED]** `database_design.md` v1.1 Approved nhóm A cùng 14 tài liệu class design còn review theo slice. Các tên table/entity/module được tham chiếu để tạo tính liên tục, **chưa đồng nghĩa schema đã duyệt/migrate**.
- **[Chi tiết trong tài liệu này — PROPOSED]** Tên file, folder, DTO, permission key cụ thể, exception code, application coordinator, HTTP endpoint, state transition implementation và transaction isolation là phương án kỹ thuật cần review; không giả định là quyết định nghiệp vụ mới. API hợp đồng cụ thể nằm ở `api_specification.md`.
- **Quy tắc xử lý xung đột:** (1) FR/BR/Q v5 và UC v1.3; (2) quyết định Accepted trong Architecture; (3) DB/Class Design đề xuất; (4) đề xuất ở đây. Nếu có hai nguồn cùng cấp mâu thuẫn, tạo issue/ADR và **không triển khai tự suy đoán**.

## 1. Phạm vi và nguyên tắc bất biến

### 1.1. Phạm vi P0

1. IAM: email/password, refresh/revoke, OTP email 15 phút, multi-tenant membership + RBAC + scope, Parent–Student link, chứng thực anh/chị/em.
2. Academic: teacher/student profile, subject/level/course/class, teacher assignment, enrollment và chuyển lớp có xác nhận.
3. Scheduling: room/resource/unavailability, lịch tuần tối đa 6 tháng, kiểm tra/confirm all-or-nothing, reschedule/cancel tương lai, lịch xem theo scope.
4. Attendance & leave: đơn nghỉ, xác nhận kết quả ATTENDED/EXCUSED/UNEXCUSED, khóa và sửa có lý do/quyền/audit.
5. Billing: đơn giá SESSION>CLASS>COURSE, tính phí theo kỳ tháng từ attendance confirmed, sibling discount 10%, draft, phát hành hóa đơn nội bộ thủ công, ghi nhận/đảo payment và điều chỉnh theo duyệt, công nợ.
6. Assignments: tạo/giao bài, nhận file private, nộp theo version, giáo viên chấm/công bố điểm, Parent/Student chỉ thấy điểm published.
7. Notification in-app cho đổi/hủy lịch, giao bài; alert Manager khi job FAILED/thiếu approver; dashboard 3 KPI, workflow phê duyệt giới hạn, audit, jobs/outbox/idempotency.

### 1.2. Ranh giới không tự đưa vào P0

Học bù, bảo lưu/credit, dạy thay; combo 5%, trả trước 6 tháng; cấu hình role/policy/workflow động; báo cáo chuyên sâu; deadline reminder 24h/1h, notification email nghiệp vụ, Google OAuth, SMS/Zalo, Google Calendar, cổng ngân hàng/thanh toán, hoàn tiền tự động; tenant lifecycle UI. P0 vẫn phải có tenant isolation (`P0*`) và seed policy bất biến.

### 1.3. Bộ nguyên tắc chung

| ID | Invariant / hợp đồng hệ thống | Nguồn |
|---|---|---|
| DD-01 | Mọi thao tác có `Principal(userId, tenantId, membershipId, roles, effective scopes)` từ **Backend**; permission **hiện hành** được kiểm tra mỗi request và mỗi retry/execute-approved. | FR-03,04,42; C-02, C-03; BR-08,10,14 |
| DD-02 | Business row tenant-scoped, composite FK `(tenant_id,id)`, không để object lookup cross-tenant trả thông tin nhạy cảm. | DB Design §1,§4; UC-36 |
| DD-03 | `policyVersionId` được pin khi tạo nghiệp vụ và giữ nguyên khi retry; seed baseline per tenant; không sửa snapshot đã sử dụng. | Q-13, BR-13; Tenant & Policy |
| DD-04 | `[startAt,endAt)` UTC; hiển thị theo timezone tenant mặc định `Asia/Ho_Chi_Minh`; hai khoảng tiếp giáp không conflict. | BR-01, Q-04 |
| DD-05 | VND integer `bigint`; rate `Decimal`; `ROUND_HALF_UP` đúng một lần cuối công thức; serialize tiền ra JSON dưới dạng **string**. | Q-08, DB Design |
| DD-06 | Các mutate nhạy cảm ghi audit trong transaction; notification side effect qua outbox, không rollback nghiệp vụ nếu dispatch notification lỗi. | FR-41,39; Q-13,14 |
| DD-07 | Chặn trùng bằng khóa nghiệp vụ/idempotency; cùng key khác request fingerprint → CONFLICT; lease/retry worker không tạo tác động lần hai. | NFR-15, BR-12 |
| DD-08 | `APPROVED` chỉ là chấp thuận; `COMPLETED` chỉ sau thực thi thành công; `SELF_APPROVED` là audit flag, không phải workflow state. | Q-10, UC-34 |
| DD-09 | Không cập nhật/xóa lặng lẽ invoice đã phát hành, khoản thu, submission version, published grade hay audit event. | Q-10, Q-11, Q-14 |
| DD-10 | P0 không gọi dịch vụ nghiệp vụ ngoài, ngoài SMTP/provider gửi OTP. File qua Backend và private Railway Volume. | Q-01, Q-11; Architecture §1.2 |

## 2. Cấu trúc code đề xuất, dựa trên repo thực tế

**Hiện có (đã kiểm tra GitHub 17/10/2026):** `apps/api/src/app.module.ts`, `main.ts`, controller/service scaffold và test; `apps/web/src/App.tsx`, React/Vite; workspace root; `docs/requirements`, `docs/architectural`, `docs/design/class design`. **Chưa có** các thư mục tính năng ở cây dưới. Không bắt Codex tạo tất cả trước khi thực hiện slice đầu tiên.

```text
EduCore/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── identity/ tenant-policy/ academic/
│   │   │   │   ├── scheduling/ attendance/ academic-exceptions/  # exceptions: P1
│   │   │   │   ├── billing/ assignments/ notifications/
│   │   │   │   ├── reporting/ workflow/ audit/ file-management/
│   │   │   ├── common/{auth,decorators,filters,interceptors,pipes,errors}/
│   │   │   ├── infrastructure/{prisma,storage,otp,clock}/
│   │   │   ├── jobs/{scheduler,runner,outbox}/
│   │   │   └── main.ts
│   │   ├── prisma/{schema.prisma,migrations,seed.ts}/
│   │   └── test/
│   └── web/src/{app,features,components,lib}/
├── packages/contracts/                # optional: chỉ tạo khi có lợi so với OpenAPI client
├── docs/
│   ├── requirements/
│   ├── architectural/
│   └── design/{database_design.md,detailed_design.md,api_specification.md,class design/}
└── pnpm-workspace.yaml
```

**Một module NestJS theo vertical slice** có thể gồm `*.controller.ts`, `*.application-service.ts`, `domain/*.ts`, `infrastructure/*.repository.ts`, `dto/*.dto.ts`, `*.module.ts`; tránh class-only boilerplate. `AppModule` chỉ import module đã triển khai; `infrastructure/prisma` cung cấp transaction client; application coordinator không import repository private của module khác. React chia màn hình theo `features/<slice>/{api,components,pages,schemas}`; menu guard chỉ là UX, không phải authorization.

### 2.1. Abstraction/contract tối thiểu

```ts
interface Principal { userId: string; tenantId: string; membershipId: string }
interface AuthorizationPort {
  assertPermission(principal: Principal, permission: string, target: DataScope): Promise<void>;
}
interface PolicySnapshotPort {
  pinForNewOperation(tenantId: string, at: Date): Promise<PolicySnapshot>;
  loadPinned(tenantId: string, versionId: string): Promise<PolicySnapshot>;
}
interface UnitOfWork { transaction<T>(work: (tx: TxContext) => Promise<T>): Promise<T> }
interface AuditPort { append(tx: TxContext, event: SafeAuditEvent): Promise<void> }
interface OutboxPort { append(tx: TxContext, event: DomainEvent): Promise<void> }
```

`DataScope` không chỉ gồm tên role: cần `TENANT`, `CLASS`, `STUDENT` + resource ID; khi resource có quan hệ cha (submission→recipient→student; invoice→student) luôn resolve scope của target từ DB. `TxContext` truyền xuống qua explicit param hoặc injected transaction-scoped object, không mở nested transaction độc lập bất ngờ.

## 3. Request pipeline, error và concurrency

**Pipeline:** request ID → authenticate access token/session → xác định `tenantId` từ route + membership active → load quyền/scope hiện hành → DTO validate → load resource qua tenant-filtered query → business precondition → transaction với lock/recheck → audit + outbox → commit → response. Query danh sách phải filter tenant/scope tại SQL; không fetch-all rồi filter phía browser.

- Auth: access 15 phút, refresh tối đa 7 ngày, Argon2id; OTP băm, một lần, 15 phút; rate-limit password và OTP, response generic chống enumeration. Refresh cookie host-only HttpOnly Secure SameSite=Lax Path=/api/v1/auth, CORS origin allowlist, kiểm tra Origin + CSRF các cookie-auth mutations, custom subdomains cùng site; preview khác site phải test/proxy.
- Concurrency: use `revision`/`If-Match` cho bản ghi có sửa cạnh tranh; trường hợp xác nhận lịch/payment/issue invoice còn cần locks/unique DB, không dựa optimistic revision đơn độc.
- Idempotency: `UQ(tenant_id,operation_type,key)`, request hash; giữ kết quả/ref, chỉ replay khi cùng fingerprint; `operationKey` của job dùng cùng nguyên tắc.
- Errors: HTTP 400 validation, 401 unauthenticated, 403 not permitted, 404 resource absent **hoặc ngoài scope**, 409 conflict/stale/idempotency, 422 business rule, 429 throttled, 500/503 infrastructure. Response `{ code,message,correlationId,details? }`; không expose DB/secret/PII.
- Transaction: PostgreSQL atomic write; DB-level exclusion/unique cho lịch; lock order theo `resourceId` tăng dần; retry serialization/deadlock hữu hạn với operationKey giữ nguyên; không gọi external OTP/email khi đang giữ DB lock.
- File: filesystem không nằm trong DB transaction; STAGING → byte validate/checksum → READY metadata → link trong submission transaction; reconciliation STAGING/ORPHANED; không dùng client-provided storage path.

## 4. Thiết kế trạng thái nghiệp vụ

### 4.1. Workflow chung

| State hiện tại | Tác vụ | State kế tiếp | Điều kiện |
|---|---|---|---|
| `DRAFT` | submit | `PENDING_APPROVAL` | hợp lệ và policy cần người duyệt |
| `DRAFT` | submit | `NEEDS_INFORMATION` | thiếu dữ liệu cần bổ sung |
| `PENDING_APPROVAL` | approve | `APPROVED` | permission/scope hiện hành; decision/audit |
| `PENDING_APPROVAL` | reject | `REJECTED` | reason bắt buộc |
| `PENDING_APPROVAL` | request info | `NEEDS_INFORMATION` | reason bắt buộc |
| `NEEDS_INFORMATION` | bổ sung/re-submit | `PENDING_APPROVAL` hoặc `DRAFT` | xác minh lại; route tùy operation (đề xuất) |
| `APPROVED` | execute/re-check | `COMPLETED` | side effect thành công, idempotent |
| `APPROVED` | execute lỗi | giữ `APPROVED`/decision | rollback effect, ghi failure/needs-info execution outcome riêng sau rollback; chưa COMPLETED, không mất approval đã commit |
| `REJECTED`/`COMPLETED` | mutate | từ chối | giữ lịch sử; tạo yêu cầu mới nếu muốn thực hiện khác |

Trường hợp không cần duyệt có thể từ `DRAFT` → `COMPLETED` khi domain action tự động chạy hợp lệ; không tạo trạng thái `SELF_APPROVED`. Mọi transition chạy dưới transaction/compare-and-swap, chỉ một decision active tại thời điểm xử lý.

### 4.2. State machine theo domain

| Đối tượng | Trạng thái/biến đổi được hỗ trợ | Khóa bảo vệ |
|---|---|---|
| `Enrollment` | `PENDING→ACTIVE`; `ACTIVE→COMPLETED/WITHDRAWN/TRANSFERRED`; `SUSPENDED` là P1 | chuyển lớp giữ history và ảnh hưởng từ buổi tương lai |
| `ClassSession` | `DRAFT→CONFIRMED→COMPLETED`; `DRAFT/CONFIRMED→CANCELLED`; confirmed future có reschedule bằng revision | không sửa buổi đã hoàn tất, CANCELLED release booking |
| `Attendance` | từng participant = ATTENDED/EXCUSED/UNEXCUSED; `finalization` riêng | EXCUSED cần leave approved; khóa 48h hoặc issue invoice trước |
| `Invoice` | `DRAFT→ISSUED`, khi issued giữ snapshot; cancellation/adjustment qua approval, không overwrite | invoice_auto_issue=false |
| `Payment` | WALLET payment mới append-only, sai thì PaymentReversal/release có quyền; TOP_UP là receipt ví độc lập | một payment/invoice ISSUED; amount<=balance/due, new funds không direct external payment |
| `Assignment` | `DRAFT→PUBLISHED→ARCHIVED` | publish tạo recipient snapshot và outbox |
| `Submission` | nhiều immutable versions; lấy latest valid | tối đa 7 ngày late; dừng resubmit sau chấm |
| `Grade` | `DRAFT→PUBLISHED`, sửa published bằng revision có reason | Student/Parent không thấy draft |
| `Job` | `READY→RUNNING→COMPLETED/FAILED/NEEDS_INFORMATION/PENDING_APPROVAL` | lease; cùng operationKey, policy pin |
| `File` | `STAGING→READY` hoặc `ORPHANED` | byte validate, owner + tenant; cleanup riêng |

Trạng thái invoice cancellation hay `ACTIVE/RELEASED` booking tuân theo các bảng đã đề xuất trong DB Design; **không dùng một enum workflow duy nhất cho mọi aggregate**.

## 5. Detailed design theo 14 bounded contexts

### 5.1. Identity & Access — P0 (FR-01–06; UC-01–06; Q-01/02)

**Owner:** `users`, `credentials`, `auth_sessions`, `password_reset_otps`, `tenant_memberships`, `roles`, `permissions`, `membership_roles`, `access_scopes`, `parent_student_links`, `verified_sibling_relationships`, các grants liên quan theo DB Design. **Services:** AuthService, AuthorizationService, RelationshipService.

1. **Login:** normalize email → verify Argon2id + rate limit → liệt kê tenant active → chọn tenant hợp lệ → tạo session (refresh hashed) + access 15 phút. Multi-role nằm trong membership; không đưa toàn bộ quyền trusted vào JWT để miễn đối chiếu DB.
2. **Refresh/logout:** xác thực session có `revokedAt IS NULL`, rotate refresh token (đề xuất) và thu hồi token cũ; logout chỉ revoke phiên tương ứng; reset password revoke tất cả phiên trước.
3. **Forgot/reset:** yêu cầu OTP trả phản hồi giống nhau cho email có/không có user; hash OTP, expires 15 phút, one-use, giới hạn số thử; cập nhật password ≥12 ký tự bằng Argon2id rồi consume OTP/revoke sessions nguyên tử; provider chỉ gửi OTP, không xác thực thay Backend.
4. **Roles:** seed permission catalog P0, gán nhiều role một membership với scope; thay đổi role không được loại bỏ Manager có quyền cuối cùng trong tenant; quyền cấu hình role động chỉ P1.
5. **Parent link:** request verify evidence → authorized staff activate/revoke; parent chỉ được truy vấn đúng student liên kết. Sibling discount verification là record khác, có quyền tài chính riêng.

**Tests:** enumeration, reset OTP reuse/expiry, revoked session, user hai tenant, Parent ngoài child scope, teacher chấm sai lớp, Manager cuối cùng không bị gỡ quyền, role multi-tenancy.

### 5.2. Tenant & Policy — P0 foundation/P1 admin (FR-42–44; UC-33/36; Q-15)

**Owner:** `tenants`, `policy_versions`. `TenantContextService.resolve` xác định tenant + active membership. P0 tạo tenant **qua vận hành có kiểm soát** và seed snapshot baseline riêng; `PolicyService.pinForOperation` lấy snapshot hợp lệ tại thời điểm tạo và hash bất biến; retry dùng version cũ. Tenant status UI/P1 policy editor không nằm P0. Support operator không có blanket access vào PII; cần grant cụ thể và audit.

**Tests:** cùng user đổi tenant phải đổi context; object ID cùng định dạng ở tenant khác luôn chặn; job pinned trước khi policy thay đổi vẫn đọc version cũ.

### 5.3. Academic Management — P0 (FR-07–10; UC-07–10; Q-03)

**Owner:** teacher/student profiles; subjects, levels, courses, classes; competencies; class teacher assignments; enrollments/transfers. Profile có thể chưa có tài khoản đăng nhập.

- Tạo/sửa profile và catalog theo tenant, soft deactivate không mất lịch sử.
- Phân công teacher có interval hiệu lực và class scope; không suy ra quyền chấm chỉ từ hồ sơ teacher, vẫn kiểm tra assignment + permission.
- Ghi danh: validate student/class cùng tenant, course level, class capacity, conflicts theo `AvailabilityPort` và hiệu lực; ghi history enrollment.
- Chuyển lớp: application coordinator lock enrollment cũ + chỗ lớp đích; validate quyền/phạm vi, trình độ, sức chứa/lịch; xác nhận thủ công; xác định effectiveFrom là buổi tương lai đầu tiên chưa diễn ra hoặc mốc tương lai hợp lệ do staff chọn; chuyển enrollment cũ thành TRANSFERRED, tạo mới/điều chỉnh participants tương lai, giữ nguyên các buổi đã diễn ra. Mọi chênh lệch tiền cần follow-up Billing adjustment/credit có thẩm quyền, không sửa invoice issued.

**Tests:** hai ghi danh tranh chỗ cuối, chuyển lớp vào quá khứ từ chối, attendance/invoice quá khứ bất biến, cập nhật participants tương lai không tạo duplicate charge.

### 5.4. Resource & Scheduling — P0 (FR-11–17; UC-11–14; BR-01; Q-04)

**Owner:** `rooms`, `schedulable_resources`, `resource_unavailability`, `schedule_series`, `class_sessions`, `session_participants`, `resource_bookings`.

1. Lập series weekly: weekday 1..7, local start, duration>0, khoảng hiệu lực ≤6 tháng, timezone tenant; expand ra UTC drafts, snapshot class/teacher/room/regular participants tại thời điểm buổi.
2. Preview conflict: cho từng draft kiểm tra overlap `[a.start < b.end && b.start < a.end]` trên student/teacher/room và blocked unavailability; capacity class/room; trả danh sách conflict resource/time an toàn; preview chỉ advisory.
3. **Confirm all-or-nothing:** transaction, lock resources theo ID ổn định; recheck tất cả buổi và reservation hiện hành, từ chối toàn bộ nếu một conflict; insert bookings ACTIVE + set CONFIRMED + audit + outbox khi cần. Dùng DB partial/exclusion constraint/unique bổ trợ, không chỉ preflight.
4. Reschedule/cancel: future-only, revision guard; khi reschedule release booking cũ + recheck/insert mới trong **cùng transaction**; khi cancel release bookings, không xóa attendance lịch sử; chỉ emit `ScheduleChanged` sau change hợp lệ.
5. Read schedule: lọc theo tenant + assigned teacher/student/linked child; cho phép phạm vi thời gian có giới hạn.

```mermaid
sequenceDiagram
  participant UI
  participant API as SchedulingService
  participant DB as PostgreSQL
  participant Outbox
  UI->>API: confirmSeries(seriesId, idempotencyKey)
  API->>DB: begin tx / lock resources sorted
  API->>DB: recheck overlaps + capacity + unavailability
  alt ít nhất một conflict
    DB-->>API: conflict
    API-->>UI: 409 SCHEDULE_CONFLICT (không confirm buổi nào)
  else tất cả hợp lệ
    API->>DB: insert bookings; confirm all sessions; audit
    API->>Outbox: append in same tx when event required
    API->>DB: commit
    API-->>UI: confirmed series
  end
```

**Tests:** 2 requests đồng thời tranh cùng phòng/giáo viên/học sinh; adjacent non-overlap; cancelled booking không chiếm; single invalid weekly occurrence roll back toàn bộ; timezone và chuỗi dài 6 tháng; không sửa completed.

### 5.5. Attendance & Leave — P0 (FR-18–19,26; UC-15/16; BR-04/08; Q-05)

**Owner:** `absence_requests`, `attendance_records`, `attendance_finalizations`, `attendance_corrections`.

- Student/Parent gửi absence trên participant thuộc scope; `submittedAt <= startAt−24h` là notice đúng hạn; đơn muộn phải đi approval ngoại lệ, **không tự EXCUSED**. Approved leave không ghi `ATTENDED` nếu học sinh thực tế vắng, nhưng có mặt thực tế ưu tiên `ATTENDED` bất kể đơn.
- Teacher phụ trách ghi DRAFT trạng thái từng participant; `EXCUSED` chỉ hợp lệ khi có approved absence; `finalizeSession` yêu cầu toàn bộ participant active có trạng thái hợp lệ trong một transaction và lập finalization.
- Khóa sửa thường sau 48h kể từ `session.endAt` hoặc khi căn cứ được issue invoice, cái nào đến trước. Sửa hậu khóa bằng privileged permission + reason + audit; nếu invoice issued ảnh hưởng thì tạo yêu cầu điều chỉnh, không thay snapshot hóa đơn trực tiếp.
- Billing chỉ tiêu thụ attendance **confirmed**: ATTENDED/UNEXCUSED=1; EXCUSED/CANCELLED=0. Thiếu finalization → `NEEDS_INFORMATION` cho billing, không đoán vắng mặt.

**Tests:** attendance partial không cho finalize; 24h cutoff đúng/muộn; approved absence nhưng attended=charge 1; lock 48h, issue sớm khóa ngay; change sau issue cần adjustment.

### 5.6. Academic Exceptions — P1 only (FR-20–24; UC-17–20; BR-02/03/05/07)

**Không thêm endpoint chạy thực tế/migrations P1 vào P0.** `MakeupService`: origin là EXCUSED approved + quyền chưa dùng, cùng môn/trình độ/nội dung, chỗ và lịch phù hợp; start makeup không quá cuối ngày thứ 30 local; tối đa một lượt sử dụng, không đổi official enrollment, không double-charge. `SuspensionService`: không overlap, credit từ **tiền thực nhận đã phân bổ** cho buổi chưa dùng sau ưu đãi, không tạo credit từ nợ; quay lại trước hạn phải duyệt. `SubstitutionService`: giáo viên đủ chuyên môn + không conflict + ≤8h/ngày, ≤40h/tuần; teacher đồng ý trước, người có permission xác nhận sau; không auto-confirm.

### 5.7. Billing & Receivables — P0 (FR-25–31; UC-21–26; BR-04/06/11; Q-08/09/10)

**Owner:** `price_rules`, `billing_periods`, `billing_runs`, `billing_source_snapshots`, `invoices`, `invoice_lines`, `invoice_discounts`, `invoiced_participation_claims`, `payments`, `payment_reversals`, `receivable_allocations`, `invoice_adjustments` (chi tiết theo DB Design).

**Tạo draft kỳ tháng:** đầu tháng N+1 cho tháng N sau khi đủ điểm danh confirmed; một operation key per tenant/student/period; load dữ liệu committed + policy pinned → xác định `unitPrice` tại ngày buổi theo ưu tiên SESSION>CLASS>COURSE → line chargeUnits 1/0 → gross = Σ unit*price → sibling discount 10% **nếu có record verified/eligible cùng tenant** → `totalVnd=ROUND_HALF_UP(gross×0.90)` hoặc gross; tạo DRAFT + source snapshot/hash; không auto issue. Nếu thiếu attendance hoặc đơn giá → NEEDS_INFORMATION và alert, không phát hành giả.

**Issue:** người có `invoice.issue`, recheck completeness, idempotency, unique claim nguồn tham gia để chống tính 2 lần; DRAFT→ISSUED, freeze lines/discount/snapshot, due = issuedAt + 7 ngày, audit; invoice là bảng kê nội bộ, không phải hóa đơn điện tử hợp pháp.

#### O-12 algorithm contract — business approved; implementation proposed

**Inputs:** server principal/tenant/student/month, typed operation key/request hash; recompute thêm reason + expected base/applied generation; committed session/participant/finalized-attendance/absence/verified-sibling revisions và historical session/class/course lineage. Client không được truyền clock/timezone/pricing-date override hoặc arbitrary price/result snapshot. **Output:** durable generation receipt/result + same logical DRAFT invoice, per-line evidence hoặc NEEDS_INFORMATION/stale/conflict; không issue tự động.

```text
admit(command):                              // PROPOSED transaction boundary, not code
  acquire reviewed tenant gate before source reads; check current permission/scope
  if typed key exists: assert same requestHash; return authorized historical receipt/result
  lock canonical run(student,month); check expected base/current on recompute
  reject issued/cancelled-after-issue, concurrent pending generation, period not closed
  c = server DB instant sampled once at durable admission
  V = pin calculation policy effective at c (BR-14); z = frozen tenant timezone
  capture source set + revisions + sibling evidence under same transaction protocol
  for source in sources:
    assert tenant/student/session/finalization and original class/course lineage
    d = local_date(source.session.startsAt,z) // NEVER local_date(c,z) for pricing
    assert period.monthStart <= d < period.monthEnd
    eligible = rules(correct tenant/target, effectiveFrom <= d,
                     effectiveTo is NULL or d < effectiveTo)
    chosen = first nonempty tier SESSION > CLASS > COURSE
    if absent/ambiguous price or missing confirmed attendance (except CANCELLED):
      persist immutable NEEDS_INFORMATION G/receipt with captured evidence + missing reasons
      commit receipt; return NEEDS_INFORMATION // stop; no completed draft or fall-through
    units = 1 for ATTENDED/UNEXCUSED; 0 for approved EXCUSED/CANCELLED
    capture d as sourceBusinessDate AND pricingLocalDate, z, chosen ID/window/unit/tier,
            selection proof, source revisions/lineage and separate policy provenance IDs
  persist immutable G payload/key/hash/c/V/z + job enqueue atomically, commit

apply(G):
  acquire same ordered locks; check current permission and current base/pending CAS
  re-read source set/revisions/lineage/eligibility and pinned-date pricing facts
  if relevant change: mark stale/block, no refresh of G, no partial invoice writes
  gross = SUM(units * snapshot.unitPriceVnd)  // BigInt/Decimal exact arithmetic
  net = HALF_UP(gross * (verifiedSibling ? 0.90 : 1)) // once at final invoice
  atomically apply to same logical draft, lines/discounts/current G/policy/hash/result/audit
  force reviewed deferred final-state checks; commit; retain G1 payload/result history

issue(currentDraft):
  acquire same lock protocol; verify rights, current applied G, source completeness/revisions,
    snapshot/selection facts and absence of pending recompute/stale state
  do not resolve current tariff or repin policy; claim all participations incl. units 0
  atomically number + ISSUED + frozen snapshots/claims/audit; commit
```

**Ba mốc độc lập:** session local-start date chọn PriceRule và billing month; generation admission time `chargeCreatedAt/generationCreatedAt` chỉ audit/idempotency/request-policy pin (PolicyVersion TIMESTAMPTZ `[from,to)`); issue time cấp số, phát hành/dueAt, không chọn lại giá. PriceRule `effectiveFrom/effectiveTo` là local DATE `[from,to)`; không parse thành UTC để đổi ngày, không dùng một pricing date chung cho G có nhiều buổi. Policy của tariff/scheduling là provenance riêng, không phải calculation-policy ID bắt buộc bằng nhau.

**Retry / recompute / source correction:** cùng key/hash trả G1 và kết quả cũ, không đọc tariff mới để reprice; source đổi trước apply thì stale, cần command mới. Recompute mới key/reason/base/current CAS tạo G2, pin policy request mới và đọc nguồn hợp lệ; từng giá vẫn theo ngày session. Attendance correction có thể đổi units/eligibility; policy mới có thể đổi net nếu được duyệt, nhưng G2 muộn không tự nâng unitPrice của buổi cũ. Giữ G1/diff/reason/audit; new pending G chặn issue current G1. Hai recomputes cùng expected generation tối đa một thắng, replay G1 sau G2 không write-back. Invoice chưa có sau NEEDS_INFORMATION được tiếp nhận G2, không cần tạo invoice giả. ISSUED không recompute/reprice/repin; correction UC-26 append-only theo issued basis có quyền/duyệt, không lấy tariff hiện hành để tự sửa.

**Price writes / timezone / scheduling:** ordinary tariff mutation không backdate hoặc sửa amount/target/override làm đổi giá buổi đã bắt đầu, ngay cả chưa có invoice; publish local future-date (DATE không intraday). Future end-bound thay đổi chỉ hợp lệ khi không phá selection tại source dates/captured snapshots; semantic recheck thay vì updatedAt-only. Missing past tariff vẫn NEEDS_INFORMATION, sửa dữ liệu lịch sử cần task/approval riêng. C1 freeze ở first ScheduleSeries/ClassSession (kể cả DRAFT), BillingPeriod hoặc BillingRun/generation, sticky dù cancel/delete; marker/source atomic; Ops chỉ đổi trước đó với audit/CAS. Lưu z và derived dates; kiểm tzdata. Reschedule future-only cung cấp startsAt/revision/lineage đáng tin qua Scheduling port, invalidate affected drafts trong transaction, không âm thầm chuyển invoice period hoặc sửa issued sources.

**Errors / rollback / locks:** no price hoặc ambiguous/missing confirmed source → NEEDS_INFORMATION, không implicit zero (cancelled vẫn cần giá, không attendance giả); tenant/student/period/lineage mismatch hoặc key/hash conflict → reject; permission failure không thành needs-info. Source đổi → stale/block issue. O-01 tenant-gate/order/privileges vẫn cần technical review: auth/key → period/run/G → course/class/price/resources/session sorted → participants/attendance → invoices/lines/claims → counter/audit/outbox, tenant gate trước tất cả. Child và inverse-parent period guards, immediate issued immutability và deferred draft final-state checks theo DB §3.6. Deadlock/serialization timeout rollback toàn phase, bounded retry cùng key/pin; commit unknown tra receipt trước, không lấy clock/policy mới hoặc nhân claim. Không external I/O trong lock; chưa chứng minh PostgreSQL concurrency bằng pseudocode/Prisma validation.

**Acceptance:** [O12-AC-01–27, addendum N](../ai/reviews/database/O12_DECISION_PROPOSAL.md#n5-acceptance-matrix-hien-hanh--o12-aa); required PostgreSQL two-connection source/price/reschedule/line/issue races, raw DML privilege and rollback tests còn NOT RUN. Technical/schema/PG/runtime gates tách biệt; business approval không mở implementation R1b/R2.

**Wallet finance (UC-25/26, business amended19/10):** financial staff verified CASH/BANK_TRANSFER → TOP_UP độc lập invoice; hành động pay rõ amount → WALLET Payment chỉ invoice ISSUED cùng owner, `0<amount<=balance/due`, partial được. Debit+Payment+base allocation+receipt+audit atomic. Draft/ISSUE/G1/G2 không tự debit. Điều chỉnh/hủy issued luôn manual approval; explicit execution mới apply delta/release/refund đúng excess về ví. Legacy/mixed thiếu policy phải chặn affected command, không convert/auto credit; no expiry/cash-out/transfer.

**Công thức wallet cohort:** `N=issuedTotal+ΣAPPLIED deltas>=0`, `P=Σbase allocations+signed RELEASE offsets`, `outstanding=max(N−P,0)`, `refund=max(P_before−N_after,0)`. Không filter reversed wallet payment rồi trừ release lần2. Legacy positive allocations/no-full-reversal semantics giữ riêng tới approved migration; unused balance không là allocated Payment/revenue. Old pending excess/no-auto-credit Group A chỉ còn provenance/legacy, superseded có giới hạn cho new wallet refunds; không new excess-case engine cho wallet-only.

#### Wallet application operations — business approved / technical pending

Một **FinancialCoordinator** giữ transaction client chung cho Billing/Wallet/Workflow/Audit; domain methods không tự commit/repository ghi chéo module. Logical2wallet tables và signed Allocation delta xem [DB §3.6](database_design.md). Không general ledger/event-sourcing/generic workflow/recovery-cycle framework.

| Operation | Atomic effect và required checks |
|---|---|
| `topUpWallet` | Verified staff/current permission + student scope; amount>0, CASH/BANK_TRANSFER receipt reference/evidence; unique account/receipt và typed key/hash; TOP_UP+balance+audit/receipt commit. Parent request không tạo tiền; không invoice Payment |
| `payInvoiceFromWallet` | Explicit amount/current authority, same tenant/student, ISSUED payable; Wallet lock trước Invoice, fresh p<=B/due; debit+WALLET Payment+base allocation+balance+audit/receipt. Insufficient full request reject, không tự partial |
| `refundInvoicePaymentToWallet` | **Internal sub-operation**, không client tự nhập refund; root adjustment/hủy manual đã duyệt, N_after>=0, derive r=max(P_before−N_after,0); applied delta+release(s)+credit(s)+balance+receipt+audit+COMPLETED atomic; r0 không zero entry |
| `reverseInvalidTopUp` | Permission+reason, full original TOP_UP khi available balance đủ; append negative compensation/history/receipt. Thiếu thì reject/reconciliation, không đảo đúng invoice payment để đủ tiền |
| `reversePayment` | Khác top-up reversal. **Technical recommendation** full nominal one/payment; credit ví chỉ net remaining sau prior refunds:800k đã refund100k thì thêm700k; fully released thì không zero WT. Không double reversed-filter+offset |
| Read balance/history/due | Current scope/Parent link, consistent asOf, money strings; balance=ΣWT; chỉ expose receipt/audit fields được phép |

**Locking recommendation Q1, chưa sign-off:** verified actor/affected User locks → Tenant NK/RC gate → fresh current auth/key/Approval/queue roots → Period/Run/G/source anchors → Wallet → Invoice/ledger parents → new records/audit. User SHARE vs global disable/revoke UPDATE cần tất cả IAM writers tham gia; không global distributed fence framework mặc định. Không Job-before-Tenant/invoice-before-Wallet/late User locks; exact SQL/implicit FK waits/grants cần R1b/R2 review. Missing wallet không fake balance.

Immediate shape/FK/UQ/history/owner guards; cross-row final checks có thể deferred, ép named checks IMMEDIATE cuối command. Stored balance update một lần qua reviewed command cùng ledger, không service+trigger cùng cộng. Proposed grants cấm raw protected DML/DDL, narrow fixed domain commands/current scope; không generic gateway/policy engine. Không external I/O dưới lock; **chưa có SQL/concurrency proof**.

**Approval/failure:** D1 manual decision/audit commit APPROVED bền; E1 explicit execute kiểm approved body/target obligation revision/current authority. Payment thay đổi có thể làm refund derived khác estimate nhưng không tự đổi approved obligation delta. Root effect identity theo approved request/version; reuse IdempotencyRecord là recommendation, không receipt table mới bắt buộc. All E1 effects+receipt+COMPLETED một TX; fail rollback E1, giữ D1, failure audit riêng. Unknown COMMIT lookup root trước retry, không key/G/policy mới; bounded transient retry sau rollback, no blind retry data/permission conflict.

**Examples/proof:** B1m/pay800k→B200k; reduce N700k→refund100k/B300k/P700k. Paid300k reduce800→700→refund0/due400k. Reduce700→650→increase900→cancel0 chỉ hoàn thêm50k/0/remaining650k, giữ claims/history. N800k paid300+500 reduce600k→total refund200k; LIFO payment attribution còn technical recommendation. `B=ΣWT>=0`, `B+A_wallet=T_net_topups`; credit phải có release cùng amount. Top-up không revenue/allocated payment, no combo5% từ số dư6tháng.

**G representation recommendation Q2:** một typed G(owner/run/student/period/key/base/policy/z/no)+immutable versioned input/result JSON, Run currentApplied pointer/CAS và indexed latest generation; full source-set/semantic price recheck dưới gate, không Source table/epoch/nhiều pointer layers nếu không cần. O12-D giữ G1/G2/history/local-session-date prices như thuật toán trên, wallet thay đổi không tạo G2. R1b chỉ minimum live period/source/snapshot contract, full generation R2-A. W01–W36 **DESIGNED**, DB/Prisma/runtime gates riêng, chưa feature ready.

**Tests:** idempotency 2 payments đồng thời, overpayment, sibling verified/unverified, SESSION price override, tháng thiếu attendance, issue after 7 days due, issue twice conflict, adjustment authorized, ROUND_HALF_UP cuối công thức, không double billing từng participant.

### 5.8. Assignments & Grading — P0 (FR-32–36; UC-27–29; Q-11)

**Owner:** `assignments`, `assignment_recipients`, `submissions`, `submission_versions`, `submission_files`, `grades`; files via File Management.

- Teacher scoped class tạo draft, title/description, priority 1..5, deadline; publish transaction tạo snapshot recipients & `AssignmentPublished` outbox.
- Sau khi có submissions, edit instructions/deadline bị hạn chế; có thể gia hạn có audit, không tự rút ngắn deadline.
- Student được giao nộp answer/file trong deadline+7 ngày; đánh dấu LATE nếu sau deadline. Mỗi lần nộp là immutable version, tối đa 5 file READY, 10 MB/file, chỉ PDF/DOCX/JPG/PNG. Resubmit chỉ trước khi chấm và còn trong cửa sổ.
- Grade dựa latest valid version, score 0..10 với 1 decimal, feedback; draft chỉ Teacher/authorized staff thấy. Publish riêng, Parent/Student được xem sau publish; grade correction published tạo revision mới + reason + audit.

**Tests:** student khác không upload/submit/see grade; file >10MB, MIME mismatch, 6 files; exact 7-day window; resubmit after grading forbidden; published correction không overwrite lịch sử.

### 5.9. Notification — P0 (FR-37–39; UC-31; Q-13)

**Owner:** `notifications`; consume committed `outbox_events` cho `SCHEDULE_CHANGED`, `ASSIGNMENT_PUBLISHED`, `ADMIN_ALERT`. Worker resolve membership receivers theo quyền/quan hệ hiện hành, `INSERT ON CONFLICT DO NOTHING` với dedupe key `(tenant,event,recipient,kind)`; mark read idempotent. UI hiển thị unread count. Không email notification nghiệp vụ và không deadline reminder P0. Transaction gốc không phụ thuộc thành công của consumer.

### 5.10. Reporting — P0 3 KPI (FR-40; UC-32; Q-12)

`DashboardReader` với SQL scoped cùng mốc `asOf`: **activeStudents** = distinct student có ít nhất 1 enrollment ACTIVE; **activeClasses** = class ACTIVE; **outstandingReceivablesVnd** = tổng số chưa thanh toán của invoice ISSUED sau ledger hợp lệ. Không cộng invoice DRAFT hoặc tiền prepaid chưa sử dụng. Doanh thu, chuyên cần, tiến độ chi tiết, drilldown = P1. Chỉ trả aggregation trong scope được phép; parent không thấy tài chính toàn tenant.

### 5.11. Workflow & Approval — P0 bounded (FR-44/45; UC-26,33/34; Q-10/14)

`ApprovalRequest` gắn `operationType,targetType,targetId,payloadSnapshot,policyVersionId,correlationId`. Backend kiểm tra permission tại lúc quyết định **và** lúc thực thi; APPROVED rồi coordinator mới tái xác minh data/locks → COMPLETED. Manual approve cho invoice issued adjustment/cancellation và late absence; nếu chỉ một Manager đủ quyền có thể self-approve tài chính theo quy định và bắt buộc đánh `selfApproved=true` cùng reason/audit. Dynamic policy editor/threshold P1. Thiếu reviewer → queue + manager alert, không skip quyền.

### 5.12. Automation & Jobs — P0 (FR-45; UC-37; BR-09/12; Q-13)

`automation_jobs` persistent; worker claim `FOR UPDATE SKIP LOCKED` + lease; `job_attempts` append-only; operationKey/idempotency unique. Retry **tối đa 3 lần thử lại sau lần đầu**, backoff 1/5/15 phút cho transient; `NEEDS_INFORMATION`/`PENDING_APPROVAL` không retry vô hạn; `FAILED` alert Manager. Scheduler tính billing draft đầu tháng kế tiếp, không issue. Outbox dispatcher at-least-once, consumer phải idempotent. Job pin policy version từ lúc enqueue; sau restart reclaim expired lease nhưng kiểm tra lại actor permission/scope.

**Wallet/simplification19/10:** worker không tự top-up/pay/approve. Claim/effect phải cùng entry order (poll IDs advisory trước locks), monotonic fencing/lease check/one-time finish còn technical sign-off. Initial+3 giữ; DB prose `attempt_count<=4` chưa SQL constraint. **Recommendation Q4 pending:** requeue khi count<4 không reset; sau exhaustion explicit synchronous manual domain execution cùng root/G/key giữ job FAILED history/audit riêng, không worker attempt5/cycles. Accepted receipt/G inputs không refresh do job fail, stale cần explicit new G. Recovery path/API chưa technical approved. DB-only outbox notification+dedup+DONE một TX là recommendation, không extra lease framework nếu không external I/O.

### 5.13. Audit & Traceability — P0 (FR-41; UC-35; Q-14)

`audit_logs` append-only ít nhất gồm tenant, actorKind/user/membership, action/event/target, reason, safe before/after, policyVersion, correlationId, occurredAt; redact token/password/OTP/secret. Retention baseline **24 tháng**; không cung cấp update/delete qua nghiệp vụ. User được cấp permission tra cứu scoped, operator không có quyền xem tenant PII mặc định. Worker/approval records giải thích quyết định tự động, nhưng UI P0 chỉ cần tra cứu căn bản.

### 5.14. File Management — P0 (FR-34; UC-28; Q-11)

Railway private persistent Volume lưu bytes; PostgreSQL `stored_files` lưu metadata `tenantId,size,mime,sha256,privateStorageKey,status`. API validate content size/type, randomize internal path, stream download qua authorized owner query; chống traversal, extension spoofing. Failure promote/link → STAGING/ORPHANED reconciliation, không đưa internal storage key vào response. Backup/restore **cả DB metadata và private Volume**.

## 6. Transaction coordinators liên module

| Coordinator / command | Modules involved | Atomic invariant & exception |
|---|---|---|
| `ConfirmScheduleCoordinator` | Academic, Scheduling, Audit, Jobs/Outbox | toàn chuỗi confirm all-or-nothing; lock resource; lỗi overlap ⇒ không ghi buổi nào |
| `TransferEnrollmentCoordinator` | Academic, Scheduling, Billing, Workflow, Audit | scope/slot future; giữ history; issue invoice không bị sửa; finance correction cần quyền riêng |
| `FinalizeAttendanceCoordinator` | Scheduling, Attendance, Audit | tất cả active participants đủ record, một finalization/session, no partial |
| `GenerateBillingDraftCoordinator` | Attendance, Billing, TenantPolicy, Jobs, Audit | confirmed source; unique operation per student-period; incomplete ⇒ NEEDS_INFORMATION |
| `IssueInvoiceCoordinator` | Billing, Workflow/Authorization, Audit | freeze invoice + claims, issue đúng quyền, no double-charge |
| `FinancialCoordinator` (reuse financial use-case boundary) | Billing/Wallet, Workflow, Authorization, Audit | top-up/pay/reverse/approved adjustment-cancel+release/refund atomic; Wallet trước Invoice, root receipt; không nested partial commits |
| `ExecuteApprovedFinancialChangeCoordinator` (entry delegating FinancialCoordinator) | Workflow, Billing/Wallet, Audit | D1 approve không effect; E1 recheck/apply/releases/credits/receipt/COMPLETED atomic, fail giữ decision |
| `PublishAssignmentCoordinator` | Academic, Assignments, Notification/Outbox, Audit | assignment recipients + outbox committed cùng nhau |
| `SubmitAssignmentCoordinator` | Assignments, File Management, Audit | READY files + version metadata atomic DB; filesystem eventually reconciled |

**Giới hạn UoW:** DB transaction không đợi provider OTP, download/upload bytes hoặc phát in-app notification. `READ COMMITTED` + locks/unique có thể đủ cho một số case; nếu dùng `SERIALIZABLE`, handle SQLSTATE retry bounded. Mức isolation cụ thể là **đề xuất** cần chứng minh bằng concurrent tests.

## 7. Quy tắc UI/UX tối thiểu cho Codex/Figma

- Giữ một màn hình/feature thể hiện trực tiếp `UC`/`FR` và permission; bộ lọc server-side theo tenant/scope; role chỉ quyết định initial navigation, không đảm bảo API access.
- Các thao tác rủi ro có **review/confirm dialog**, hiển thị lý do rejected/NEEDS_INFORMATION và tham chiếu correlationId an toàn.
- Schedule confirm cho thấy resource/time conflicts ở mức đủ để sửa; không gợi ý tự sửa conflict qua bypass; mốc thời gian hiển thị local tenant.
- Billing UI tách DRAFT vs ISSUED, `issue` action riêng; payment partial, overpayment validation, adjustment tạo approval request; có audit trail.
- Assignment UI hiển thị deadline, late, version history, grade draft vs published; Parent view chỉ qua linked child.
- Common states cho tables/forms: loading, empty, forbidden, validation, conflict/stale, transient failure/retry; responsive desktop/tablet/mobile (NFR-09).
- Không vẽ màn hình P1 như đã vận hành P0. Cần `SCREEN_MAP.md`, `FEATURE_SPEC_TEMPLATE.md` ở repo nếu dùng pipeline vibecoding; theo kiểm tra nhánh `main` ngày 17/10 các file này **chưa xuất hiện** trong tree, nên đây là dependency UI **chưa đồng bộ**, không phải source đã đọc.

## 8. Testing/acceptance gates

| Gate | Bắt buộc | Truy vết |
|---|---|---|
| Unit | Branch coverage ≥80% Scheduling/Billing, validation và rounding bằng decimal | NFR-12, Q-08 |
| DB migration | FK cùng tenant, unique + exclusion, migration rollback/seed baseline, append-only protection | NFR-06, DB Design |
| Multi-tenant E2E | User A ở tenant X truy cập mọi resource id tenant Y → không đọc/ghi; Parent ngoài linked child → denied | BR-08/10/14, UC-36 |
| Concurrency | 2 confirmations cho cùng slot chỉ 1 thắng; 2 payments cùng outstanding chỉ 1/đúng tổng; retry same key không nhân đôi | BR-01, NFR-15 |
| Workflow | APPROVED không đồng nghĩa COMPLETED; underprivileged approver denied; self-approve exception có audit | UC-34, Q-10 |
| Billing | 1/0 charge attendance, sibling 10%, no combo P0, monthly rollup, issue manual, overpay denied | UC-21–26, Q-08–10 |
| Assignment/file | late 7 ngày, score 1 decimal, only published, file MIME/size/count, orphan cleanup | Q-11, FR-34 |
| Jobs/outbox | crash after commit/restart; no duplicate notif/charge; retry 1,5,15 và FAILED alert | BR-12, Q-13 |
| Ops targets | API p95 ≤1s (NFR-01), conflict ≤2s (NFR-02) với dataset công bố; availability 99,5%, backup daily, RPO≤24h/RTO≤4h **chỉ tuyên bố đạt sau đo/restore drill** | NFR-01,02,07,08 |

**Mandatory regression journeys:** authentication→tenant context; academic enrollment→schedule confirm→attendance finalize→billing draft→invoice issue→payment; assignment publish→in-app notification→submit files→grade publish→parent view; leave submitted→approved→EXCUSED; late leave→manual approval; financial adjustment→workflow→audit; retry worker after restart.

## 9. Traceability map rút gọn

| Slice | FR | UC | Baseline BR/Q | DB/class design |
|---|---|---|---|---|
| IAM + Parent | 01–06 | 01–06 | BR-08/10/14, Q-01/02 | identity-access.md |
| Tenant/Policy | 42–44 | 33/36 | BR-13/14, Q-15 | tenant-policy.md |
| Academic | 07–10 | 07–10 | BR-10/13, Q-03 | academic-management.md |
| Scheduling | 11–17 | 11–14 | BR-01, Q-04 | resource-scheduling.md |
| Attendance | 18/19/26 | 15/16 | BR-04/08, Q-05 | attendance-leave.md |
| Academic Exceptions (P1) | 20–24 | 17–20 | BR-02/03/05/07, Q-04/06/07 | academic-exceptions.md |
| Billing | 25–31 | 21–26 | BR-04/06/11, Q-08/09/10 | billing-receivables.md |
| Assignments + files | 32–36 | 27–30 | Q-11 | assignments-grading.md, file-management.md |
| Notification | 37–39 | 31 | BR-12, Q-13 | notification.md |
| Reporting | 40 | 32 (30 P1) | Q-12 | reporting.md |
| Workflow | 44/45 | 26/33/34 | BR-09/11/14, Q-10 | workflow-approval.md |
| Automation | 45 | 37 | BR-12, Q-13 | automation-jobs.md |
| Audit | 41 | 35 | BR-08/14, Q-14 | audit-traceability.md |

## A. Quyết định thiết kế nhóm A — Approved 17/10/2026

### A.1. Thứ tự nguồn và triển khai
Requirements Analysis v5 > Use Case v1.3 > Accepted Architecture > Database Design v1.1 > Class/Detailed Design > API Spec. Không tự thay đổi baseline FR/BR/Q. 14 bounded contexts là module logic của Modular Monolith; Codex triển khai từng vertical slice, không tạo microservices hoặc toàn bộ 14 module ngay.
Migration dependency: tenant/policy/IAM/audit/idempotency → workflow/jobs/outbox → academic → scheduling/attendance → billing → assignments/files/notification/reporting. P1 chỉ triển khai khi có quyết định slice.

### A.2. Permission catalog P0 và default grants
Permission catalog cố định, seed theo version; dynamic role editor thuộc P1. Catalog sử dụng mã:
- IAM: member.read, member.create, member.update, role.read, role.assign, relationship.read, relationship.create, relationship.verify, relationship.revoke, discount.verify.
- Academic: student.read, student.create, student.update, teacher.read, teacher.create, teacher.update, academic.read, academic.manage, course.update, class.read, class.create, class.update, class.assign_teacher, enrollment.read, enrollment.create, enrollment.update, enrollment.transfer.
- Scheduling/Attendance: room.manage, resource.read, resource.manage, schedule.read, schedule.preview, schedule.create, schedule.confirm, schedule.update, schedule.cancel, attendance.read, attendance.mark, attendance.finalize, attendance.correct, absence.read, absence.create, absence.approve, absence.approve_late.
- Billing: pricing.manage, billing.read, billing.generate_draft, invoice.read, invoice.issue, invoice.adjust_request, invoice.cancel_request, payment.read, payment.record, payment.reverse, receivable.read.
- Assignments/File: assignment.read, assignment.create, assignment.update, assignment.publish, submission.read, submission.create, file.read, file.upload, file.download, grade.write, grade.publish, grade.correct, grade.read_published.
- Infrastructure: notification.read, notification.mark_read, dashboard.view, approval.read, approval.decide, approval.execute, job.read, job.retry, audit.read, audit.explain.

| Seed role | Grants mặc định P0 (ngoài điều kiện permission luôn kiểm tra tenant/scope) |
|---|---|
| MANAGER | Toàn bộ catalog P0 trong TENANT được cấp; financial approvals vẫn chịu policy + audit, không có quyền platform khác tenant |
| ACADEMIC_STAFF | academic/student/teacher/class/enrollment/schedule/room/resource management; attendance mark/finalize/absence approve; approval.decide học vụ khi gán rõ. attendance.correct và absence.approve_late chỉ khi grant riêng |
| ACCOUNTANT | pricing.manage, billing.*, invoice.*, payment.*, receivable.read, approval.decide tài chính khi có scope/được cấp, dashboard.view |
| TEACHER | schedule.read, class.read, student.read, attendance.read/mark/finalize, absence.read, assignment.read/create/update/publish, submission.read, file.read/download, grade.write/publish, grade.read_published trên lớp đang dạy |
| STUDENT | schedule.read, attendance.read, absence.create/read, assignment.read, submission.read/create, file.upload/read/download, grade.read_published, notification.read/mark_read chỉ STUDENT của mình |
| PARENT | schedule.read, attendance.read, absence.create/read, assignment.read, submission.read, grade.read_published, invoice.read, receivable.read, notification.read/mark_read qua linked verified STUDENT |

Ký hiệu *. trong bảng role chỉ là shorthand của bộ seed, không phải wildcard runtime. Default deny. Permission cộng theo role chỉ trong một tenant, scope không được nâng rộng. Parent–Student verified còn hiệu lực; Teacher phải được phân công lớp. Không thu hồi Manager hợp lệ cuối; approval.decide chỉ dùng đúng operation/scope, self-approval chỉ trong ngoại lệ baseline được audit.

### A.3. API/Authentication/Onboarding
- API-01: HTTPS REST /api/v1, business /api/v1/tenants/{tenantId}/..., auth /api/v1/auth/....
- API-02: Access JWT 15 phút chỉ giữ memory, refresh token hashed DB/rotate mỗi lần refresh, tối đa 7 ngày; cookie HttpOnly Secure SameSite=Lax host-only Path=/api/v1/auth. Production web/API dùng custom subdomains cùng site. CORS credentials chỉ allowlisted origin; Origin + CSRF token kiểm tra với cookie-auth mutations. Preview domain khác site cần test/proxy.
- API-03: OTP request /auth/password/otp/request; reset /auth/password/reset với email,otp,newPassword trong transaction: verify purpose+expiry/attempts, hash Argon2id, consume OTP, revoke sessions. Không có endpoint otp/verify riêng.
- API-04: Response object JSON trực tiếp, collection {items,page,pageSize,total,asOf}; mặc định page 1/pageSize 20, tối đa 100; error {code,message,correlationId,details?}; VND bigint stringify; timestamps UTC; If-Match khi revision; Idempotency-Key với IDEMP commands.
- Onboarding: Ops CLI tạo tenant+baseline policy+Manager membership PENDING_ACTIVATION atomically. OTP ACTIVATION đặt mật khẩu >=12 ký tự, active account+membership; tenant ACTIVE sau khi có Manager active. Manager tạo member pending qua API, member tự kích hoạt bằng OTP email, không gửi mật khẩu tạm, không triển khai invitation email nghiệp vụ hay tenant lifecycle UI P0.
- DD-02: Database v1.1 giữ one invoice/student/tenant/month, thu vượt sau adjustment có payment_excess_resolutions trạng thái chờ xử lý; không tự refund/credit, schema migration vẫn phải có SQL tests.

### A.4. Các vấn đề chưa thuộc nhóm A
Chỉ còn các quyết định theo slice: concurrency/isolation & PostgreSQL migration tests, billing dueAt calendar interpretation, financial reversal detailed workflow, approval sync vs async, fixture/performance/restore tests. Các trạng thái này không được xem đã triển khai.
## 10. Các vấn đề cần kiểm chứng trước khi code từng slice

- Hoàn thiện SQL migrations, permission seed và test cross-tenant trước slice IAM.
- Billing ledger/concurrency, dueAt và financial workflow trước slice Billing.
- Workflow execution mode, error retry trước triển khai approval.
- NFR/load, backup restore còn yêu cầu kiểm chứng thật; không tuyên bố đã đạt.

## 11. Triển khai tuần tự khuyến nghị

1. Đồng bộ nguồn Requirements v5 và kiểm tra `git diff` tài liệu; review hai file design mới.
2. Foundation: NestJS config/security/errors/Prisma/UoW, tenant & identity, audit, seed policies và integration tests isolation.
3. Academic + resource/scheduling với tests race/constraints; UI vertical slice đầu tiên.
4. Attendance/leave + workflow cơ bản → Billing ledger/draft/issue/payments; ưu tiên tests integrity trước UI polishing.
5. Assignments/files/grading → outbox/notifications → dashboard/job management; regression E2E + CI.
6. P1 chỉ triển khai theo vertical slice riêng sau khi phụ thuộc P0 đủ và có review về acceptance.

---

**Change control:** thay đổi BR/Q/UC phải sửa upstream source trước, cập nhật traceability/test fixtures, sau đó mới sửa Detailed Design + API Contract + code. Không sử dụng document này để bỏ qua business approval.
