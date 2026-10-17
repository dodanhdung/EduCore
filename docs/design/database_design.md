# EduCore — Database Design

**Phiên bản:** 1.1 — 17/10/2026  
**Trạng thái:** Approved — quyết định nhóm A (SQL migrations chưa được kiểm thử)  
**Đầu vào:** `requirements_analysis(7).md` (FR-01–FR-45, BR-01–BR-14), `specification(1).md` (UC-01–UC-37, Q-01–Q-15), `architectural_design(1).md` (kiến trúc và ADR).  
**Đầu ra:** thiết kế logic/physical ở mức bảng, ERD, FK, UNIQUE, CHECK, index, transaction và roadmap schema. **Không phải** schema đã migration hay kết quả đã kiểm thử trên PostgreSQL.

> **Phân biệt nguồn và đề xuất:** Các mã FR/UC/BR/Q, trạng thái và tham số ghi là **Baseline** đến từ ba tài liệu. Tên bảng, cách tách thực thể, index, kiểu cột và giải pháp SQL là **Đề xuất Database Design**, chưa được nguồn xác nhận như lựa chọn triển khai cuối cùng. Không tự bổ sung nghiệp vụ ngoài P0.

## 1. Phạm vi và quyết định thiết kế

| Chủ đề | Thiết kế |
|---|---|
| DBMS | **PostgreSQL**, một database/schema dùng chung, dữ liệu nghiệp vụ tenant-scoped (`tenant_id NOT NULL`). |
| ORM | **Prisma**; migration SQL bổ sung cho composite FK, `CHECK`, partial/exclusion index, locking khi Prisma không biểu đạt được. |
| Kiến trúc | Modular Monolith NestJS, các module sở hữu bảng riêng trong cùng PostgreSQL; giao dịch liên module do application coordinator thực hiện. |
| Định danh | UUID `id` làm PK; bảng tenant-scoped thêm `UNIQUE(tenant_id,id)` để làm đích composite FK. |
| P0 bắt buộc | IAM/OTP, tenant/scope, hồ sơ và lớp học, lịch và chống trùng, điểm danh/đơn nghỉ, học phí/thu/điều chỉnh, bài tập/nộp/chấm, in-app notification, dashboard SQL, workflow cơ bản, audit/jobs/outbox. |
| P1 chưa tạo logic nghiệp vụ | Học bù, bảo lưu/tín dụng, dạy thay, combo, cấu hình quyền/policy/workflow động, nhắc deadline/kênh ngoài, báo cáo nâng cao. Có thể tạo migration P1 sau. |
| Tệp | BLOB ở **Railway private persistent Volume**, DB chỉ chứa metadata, đường dẫn nội bộ; đọc/ghi qua NestJS API, không public trực tiếp. |
| Tiền | VND lưu `BIGINT` (đồng) hoặc Prisma `BigInt`; tỉ lệ dùng `DECIMAL`, không dùng `FLOAT`. Làm tròn `ROUND_HALF_UP` **một lần cuối công thức**. |
| Thời gian | Mốc thời gian `TIMESTAMPTZ` UTC; `DATE` cho ngày nghiệp vụ; timezone mặc định `Asia/Ho_Chi_Minh` ở tenant; khung giờ `[start,end)`. |
| Xóa dữ liệu | Soft deactivate hồ sơ/danh mục phù hợp; không xóa cứng sự kiện tài chính, audit, điểm danh đã xác nhận, bài nộp phiên bản cũ. |
| Chính sách | Seed phiên bản baseline bất biến mỗi tenant ngay P0, gắn reference/snapshot vào nghiệp vụ; UI quản lý phiên bản là P1. |

### 1.1. Quy ước ký hiệu

- `PK`: khóa chính; `FK`: khóa ngoại; `UQ`: duy nhất; `CK`: CHECK constraint; `IDX`: index; `NN`: NOT NULL.
- Mỗi bảng tenant-scoped mặc định có `id UUID PK`, `tenant_id UUID NN FK -> tenants.id`, `created_at TIMESTAMPTZ NN DEFAULT now()`, `updated_at TIMESTAMPTZ NN` (trừ bảng append-only, chỉ cần `created_at`), và `UQ(tenant_id,id)`. Các trường mặc định **không lặp lại trong mọi bảng** phía dưới.
- FK giữa hai bảng tenant-scoped được hiểu là **composite** `(tenant_id, target_id) -> target(tenant_id,id)`, không chỉ tham chiếu `target.id`. Đối với bảng user toàn cục, dùng `user_id -> users.id`; khi cần kiểm tra user trong tenant phải qua `tenant_memberships`.
- `*_by_membership_id` chỉ thành viên tenant, được xác nhận quyền theo Backend; `*_by_user_id` được dùng cho nguồn toàn cục như OTP/phiên đăng nhập. Không dùng tên role để suy ra quyền.
- Cột `status`, `type`, `kind` mô tả enum/check ở cấp ứng dụng và DB; các tập giá trị dưới đây là tập đề xuất triển khai **bám sát** baseline, không gộp enum của các domain khác nhau.
- Khóa/cột chỉ được nêu ở mức thiết kế, chưa liệt kê tất cả trường UI phụ trợ như ghi chú, tên viết tắt hoặc metadata không ảnh hưởng nghiệp vụ.

## 2. Sơ đồ ERD theo bounded context

Chia ERD thành các nhóm để dễ đọc; các mối nối chéo module được diễn giải ở §4. Đây là sơ đồ các quan hệ chính, không liệt kê mọi trường/cột.

### 2.1. Identity, tenant, học viên

```mermaid
erDiagram
    tenants ||--o{ tenant_memberships : has
    users ||--o{ tenant_memberships : joins
    users ||--|| credentials : authenticates
    users ||--o{ auth_sessions : has
    users ||--o{ password_reset_otps : requests
    tenants ||--o{ policy_versions : versions
    tenant_memberships ||--o{ membership_roles : granted
    roles ||--o{ membership_roles : assigned
    roles ||--o{ role_permissions : allows
    permissions ||--o{ role_permissions : defines
    membership_roles ||--o{ access_scopes : restricted_to
    tenant_memberships ||--o| student_profiles : student_identity
    tenant_memberships ||--o| teacher_profiles : teacher_identity
    tenant_memberships ||--o{ parent_student_links : parent
    student_profiles ||--o{ parent_student_links : child
    student_profiles ||--o{ verified_sibling_relationships : sibling_a
    student_profiles ||--o{ enrollments : has
    classes ||--o{ enrollments : contains
```

### 2.2. Đào tạo, lịch, điểm danh

```mermaid
erDiagram
    subjects ||--o{ courses : subject
    levels ||--o{ courses : level
    courses ||--o{ classes : runs_as
    classes ||--o{ class_teacher_assignments : assigns
    teacher_profiles ||--o{ class_teacher_assignments : teaches
    classes ||--o{ schedule_series : plans
    classes ||--o{ class_sessions : holds
    schedule_series o|--o{ class_sessions : expands
    teacher_profiles ||--o{ class_sessions : conducts
    rooms o|--o{ class_sessions : hosts
    class_sessions ||--o{ session_participants : includes
    student_profiles ||--o{ session_participants : attends
    enrollments o|--o{ session_participants : sourced_from
    schedulable_resources ||--o{ resource_unavailability : unavailable
    schedulable_resources ||--o{ resource_bookings : reserves
    class_sessions o|--o{ resource_bookings : consumes
    session_participants ||--o| attendance_records : marked
    class_sessions ||--o| attendance_finalizations : finalizes
    session_participants ||--o{ absence_requests : asks_leave
    attendance_records ||--o{ attendance_corrections : corrected
```

### 2.3. Billing, bài tập và nền tảng

```mermaid
erDiagram
    student_profiles ||--o{ billing_runs : calculated_for
    billing_periods ||--o{ billing_runs : period
    billing_runs ||--o| invoices : creates
    invoices ||--o{ invoice_lines : lists
    session_participants ||--o{ invoice_lines : explains
    invoices ||--o{ invoice_discounts : discounts
    invoices ||--o{ invoice_adjustments : corrected_by
    invoices ||--o{ payments : paid_by
    payments ||--o| payment_reversals : reversed_by
    invoices ||--o{ receivable_allocations : receives
    payments o|--o{ receivable_allocations : funds
    assignments ||--o{ assignment_recipients : assigned_to
    student_profiles ||--o{ assignment_recipients : target
    assignment_recipients ||--o| submissions : work
    submissions ||--o{ submission_versions : versions
    submission_versions ||--o{ submission_files : attaches
    stored_files ||--o{ submission_files : stored_as
    submission_versions ||--o{ grades : graded_by
    approval_requests ||--o{ approval_decisions : reviewed_by
    automation_jobs ||--o{ job_attempts : attempts
    outbox_events ||--o{ notifications : delivered_as
```

**Lưu ý:** `billing_runs` và `invoices` là quan hệ 1–0..1 trong P0; `invoiced_participation_claims` (bảng bảo vệ chống thu trùng) và các `*_by_membership_id` được bỏ khỏi ERD vì mật độ đường nối. `approval_requests.target_type/target_id` là liên kết nghiệp vụ đa loại có kiểm tra trong service, không phải FK đa hình được PostgreSQL tự bảo đảm.

## 3. Danh mục và đặc tả bảng P0

### 3.1. Tenant & Policy — 2 bảng

| Bảng | Cột nghiệp vụ chính | Ràng buộc / ý nghĩa |
|---|---|---|
| `tenants` | `id PK`, `code TEXT`, `name TEXT`, `timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh'`, `status TEXT`, `activated_at` | `UQ(code)`; P0 tenant tạo qua vận hành. Trạng thái nâng cao `CREATED/ACTIVE/SUSPENDED/ARCHIVED` quản trị bằng UI thuộc P1. |
| `policy_versions` | `version_code TEXT`, `effective_from TIMESTAMPTZ`, `effective_to TIMESTAMPTZ?`, `config_snapshot JSONB`, `content_hash TEXT`, `created_by_membership_id?` | `UQ(tenant_id,version_code)`; snapshot bất biến, không sửa ngầm khi retry; seed tham số BR/Q ở P0. `effective_to` phục vụ mở rộng quản trị P1. |

**Baseline P0 seed:** `absence_notice_hours=24`, `sibling_discount_rate=0.10`, `invoice_auto_issue=false`, `teacher_substitution_auto_confirm=false`, `student_transfer_auto_confirm=false`, `max_retries=3`, `retry_delays_minutes=[1,5,15]`. Các giá trị học bù/combo P1 có thể nằm trong snapshot baseline để truy vết nhưng **không kích hoạt nghiệp vụ P1**.

### 3.2. Identity & Access — 13 bảng

| Bảng | Cột nghiệp vụ chính | Ràng buộc / ý nghĩa |
|---|---|---|
| `users` (toàn cục) | `id PK`, `email_normalized TEXT`, `display_name TEXT`, `status`, `created_at`, `updated_at` | `UQ(email_normalized)` theo lowercase/trim; không chứa `tenant_id`; tài khoản đa tenant. |
| `credentials` (toàn cục) | `user_id PK/FK`, `password_hash TEXT`, `password_changed_at`, `failed_attempts`, `locked_until` | Băm Argon2id; không có mật khẩu plaintext. Kiểm tra độ dài ≥12 trước khi băm. |
| `auth_sessions` (toàn cục) | `user_id FK`, `active_tenant_id? FK`, `refresh_token_hash`, `issued_at`, `expires_at`, `revoked_at`, `last_used_at` | Tối đa 7 ngày cho refresh token; thu hồi khi logout/reset password. Access token tối đa 15 phút do auth service phát hành. |
| `password_reset_otps` (toàn cục) | `user_id FK`, `otp_hash`, `requested_at`, `expires_at`, `consumed_at`, `attempt_count`, `max_attempts` | OTP một lần, hết hạn 15 phút, hạn chế thử. Không ghi OTP vào log/audit. |
| `tenant_memberships` | `user_id FK`, `status`, `joined_at`, `left_at?` | `UQ(tenant_id,user_id)`; user thuộc tenant khác nhau theo membership riêng. Ít nhất một Manager hợp lệ mỗi tenant active (service/transaction). |
| `roles` | `code TEXT`, `name TEXT`, `is_system_seeded BOOLEAN` | `UQ(tenant_id,code)`; seed `MANAGER`, `ACADEMIC_STAFF`, `ACCOUNTANT`, `TEACHER`, `STUDENT`, `PARENT` theo baseline. Cấu hình quyền động P1. |
| `permissions` (toàn cục) | `id PK`, `code TEXT`, `description TEXT`, `is_sensitive BOOLEAN` | `UQ(code)`; catalog permissions như `schedule.approve`, `invoice.issue`, `invoice.adjust`, không cấp mặc định khi chỉ có tên role. |
| `role_permissions` | `role_id`, `permission_id`, `granted_at` | `UQ(tenant_id,role_id,permission_id)`; P0 seed mapping quyền cố định theo UC; P1 cho quản lý thay đổi nếu có thẩm quyền. |
| `membership_roles` | `membership_id`, `role_id`, `assigned_by_membership_id`, `assigned_at`, `revoked_at?` | Bản ghi gán role theo tenant; `UQ(tenant_id,membership_id,role_id)` cho **role hiện hành** bằng partial UQ `WHERE revoked_at IS NULL`. |
| `access_scopes` | `membership_role_id`, `scope_kind` = `TENANT/CLASS/STUDENT`, `class_id?`, `student_id?` | CK đúng một kiểu/phạm vi; gán role có scope. FK lớp/học viên phải cùng tenant; grant scope tenant không mặc định cho mọi role. |
| `parent_student_links` | `parent_membership_id`, `student_id`, `relationship TEXT`, `verified_at?`, `verified_by_membership_id?`, `revoked_at?` | Partial UQ `(tenant_id,parent_membership_id,student_id)` khi chưa bị thu hồi. Parent chỉ xem học sinh liên kết hợp lệ. |
| `verified_sibling_relationships` | `student_a_id`, `student_b_id`, `verified_by_membership_id`, `verified_at`, `revoked_at?`, `evidence_note?` | CK `student_a_id < student_b_id` theo thứ tự UUID chuẩn hóa, UQ cho cặp active; **khác** parent link; kiểm tra hai em có ghi danh hợp lệ khi áp dụng giảm giá. |
| `platform_staff_grants` (toàn cục, đề xuất tối thiểu) | `user_id`, `grant_code`, `granted_at`, `revoked_at`, `reason` | Quyền vận hành nền tảng, **không tự cấp quyền đọc dữ liệu nghiệp vụ của tenant**; mọi hỗ trợ truy cập phải qua cấp quyền cụ thể và audit. |

**Quy tắc profile–membership:** Giáo viên/học sinh có thể được tạo hồ sơ trước khi có tài khoản; `teacher_profiles.membership_id` và `student_profiles.membership_id` được phép `NULL`, nếu có thì phải trỏ tới membership **cùng tenant** và unique (một membership không gắn hai hồ sơ giáo viên/học sinh cùng loại). Liên kết phụ huynh dùng membership đã xác minh, không phụ thuộc việc học sinh có login.

#### Quyết định IAM nhóm A (Approved 17/10/2026)
- P0 seed permission catalog/mapping role cố định, có kiểm soát version; role editor động chỉ ở P1. Danh mục quyền xem Detailed Design §A.2. Quyền được kiểm tra cùng tenant, scope TENANT/CLASS/STUDENT và parent-student verified link.
- users.status bổ sung PENDING_ACTIVATION/ACTIVE/DISABLED và activated_at nullable. OTP có purpose ACTIVATION/PASSWORD_RESET (giữ bảng password_reset_otps cho tương thích), hash, hạn 15 phút, dùng một lần, rate-limit; không gửi password tạm.
- Tenant và Manager đầu tiên tạo bằng CLI vận hành, seed policy/role/permission cùng transaction; người dùng kích hoạt bằng OTP email. Tenant ACTIVE chỉ khi có ít nhất một Manager active. Backend luôn chặn xóa quyền Manager hợp lệ cuối.
- OTP verification + set Argon2id password + consume OTP + revoke old sessions thực hiện nguyên tử trong DB transaction.

### 3.3. Academic Management — 10 bảng

| Bảng | Cột nghiệp vụ chính | Ràng buộc / ý nghĩa |
|---|---|---|
| `teacher_profiles` | `membership_id?`, `teacher_code`, `full_name`, `contact?`, `status` | UQ `(tenant_id,teacher_code)`; một hồ sơ có thể độc lập tài khoản. |
| `student_profiles` | `membership_id?`, `student_code`, `full_name`, `date_of_birth?`, `status` | UQ `(tenant_id,student_code)`; hồ sơ thuộc tenant, không dùng `users.id` làm khóa học sinh. |
| `subjects` | `code`, `name`, `active` | UQ `(tenant_id,code)`. |
| `levels` | `code`, `name`, `sort_order`, `active` | UQ `(tenant_id,code)`; trình độ có phạm vi tenant. |
| `courses` | `code`, `name`, `subject_id`, `level_id`, `status`, `description?` | UQ `(tenant_id,code)`; subject/level cùng tenant. |
| `classes` | `code`, `name`, `course_id`, `capacity INT`, `status`, `start_date?`, `end_date?` | UQ `(tenant_id,code)`; CK `capacity > 0`; status `PLANNED/ACTIVE/COMPLETED/ARCHIVED` (đề xuất, chưa khóa enum chi tiết). |
| `teacher_competencies` | `teacher_id`, `subject_id`, `level_id`, `verified_at?` | UQ `(tenant_id,teacher_id,subject_id,level_id)`; P0 lưu năng lực cơ bản nếu có, P1 sử dụng để đề xuất dạy thay. |
| `class_teacher_assignments` | `class_id`, `teacher_id`, `role_kind`, `valid_from`, `valid_to?`, `assigned_by_membership_id` | CHECK `valid_to > valid_from` nếu có; ghi lịch sử, không ghi đè phân công đã có hiệu lực. Giáo viên thực tế của buổi vẫn phải snapshot ở `class_sessions.teacher_id`. |
| `enrollments` | `student_id`, `class_id`, `status`, `effective_from`, `effective_to?`, `prior_enrollment_id?`, `created_by_membership_id` | Trạng thái baseline `PENDING/ACTIVE/SUSPENDED/COMPLETED/WITHDRAWN/TRANSFERRED`; không xóa enrollment cũ khi chuyển. CK khoảng hiệu lực hợp lệ. Chặn 2 enrollment ACTIVE trùng **cùng student/class/khoảng hiệu lực** bằng domain rule + DB constraint có thể áp dụng. |
| `enrollment_transfers` | `source_enrollment_id`, `target_class_id`, `effective_at`, `status`, `target_enrollment_id?`, `requested_by_membership_id`, `confirmed_by_membership_id?`, `approval_request_id?`, `reason`, `operation_key` | UQ `(tenant_id,operation_key)`; chỉ chuyển theo thời điểm tương lai sau xác nhận đúng quyền; phải xét lịch và tài chính. Không tự chuyển lớp mặc định. |

**Lưu ý:** `classes.capacity` là giới hạn lớp, `rooms.capacity` là giới hạn phòng, **hai điều kiện đều phải thỏa** khi ghi danh/xác nhận lịch. `class_sessions` giữ snapshot giáo viên/phòng dùng thực tế để audit, ngay cả khi sau này phân công chung của lớp thay đổi.

### 3.4. Resource & Scheduling — 7 bảng

| Bảng | Cột nghiệp vụ chính | Ràng buộc / ý nghĩa |
|---|---|---|
| `rooms` | `code`, `name`, `capacity INT`, `active`, `location?` | UQ `(tenant_id,code)`; CK `capacity > 0`. |
| `schedulable_resources` | `resource_kind=TEACHER/STUDENT/ROOM`, `teacher_id?`, `student_id?`, `room_id?` | CK **chính xác một** FK theo `resource_kind`; một profile/room có một resource registry row; dùng làm khóa chung để chống trùng nhiều loại tài nguyên. |
| `resource_unavailability` | `resource_id`, `starts_at`, `ends_at`, `status=DRAFT/CONFIRMED/CANCELLED`, `reason`, `created_by_membership_id` | CK `ends_at > starts_at`; khi CONFIRMED tạo resource booking ACTIVE trong cùng transaction. |
| `schedule_series` | `class_id`, `weekday SMALLINT`, `local_start_time TIME`, `duration_minutes INT`, `valid_from DATE`, `valid_to DATE`, `timezone`, `status` | CK `weekday BETWEEN 1 AND 7`, `duration_minutes > 0`; chuỗi lặp tối đa **6 tháng**, expand thành buổi cụ thể; xác nhận **all-or-nothing**. |
| `class_sessions` | `class_id`, `series_id?`, `teacher_id`, `room_id?`, `delivery_mode=ONSITE/ONLINE`, `starts_at`, `ends_at`, `status=DRAFT/CONFIRMED/COMPLETED/CANCELLED`, `cancel_reason?`, `revision INT`, `policy_version_id` | CK `ends_at > starts_at`; ONSITE có phòng; CANCELLED không chiếm tài nguyên. Sửa một buổi/những buổi tương lai; không ghi đè lịch sử đã diễn ra. |
| `session_participants` | `session_id`, `student_id`, `enrollment_id?`, `participant_kind=REGULAR/MAKEUP`, `added_at`, `removed_at?` | `UQ(tenant_id,session_id,student_id)` **không phụ thuộc removed_at** để tránh tạo hai danh tính tham gia cho cùng buổi; REGULAR lấy từ enrollment hợp lệ tại thời điểm buổi. MAKEUP chỉ dùng P1. Snapshot danh sách theo buổi, không đồng nhất với enrollment lớp. |
| `resource_bookings` | `resource_id`, `session_id?`, `unavailability_id?`, `starts_at`, `ends_at`, `status=ACTIVE/RELEASED` | Exactly-one source FK; 1 booking mỗi tài nguyên/buổi hoặc lịch bận. **EXCLUDE GiST** theo `(tenant_id,resource_id,time_range)` khi ACTIVE để chặn xung đột **ở DB**. |

**Cơ chế chống race bắt buộc:** Khi xác nhận buổi/chuỗi, Backend xác định participants, teacher, room; khóa những `schedulable_resources.id` có liên quan theo thứ tự ổn định; kiểm tra lại sự tham gia, lịch bận và sức chứa; ghi tất cả `class_sessions`, participants, bookings, audit/outbox trong **một transaction**. PostgreSQL exclusion constraint là lớp phòng vệ cuối; trường hợp vi phạm => rollback **toàn chuỗi**, không lưu một phần. Bắt đầu bằng một instance worker nhưng **không** dựa vào một instance để bảo đảm an toàn ghi đồng thời.

### 3.5. Attendance & Leave — 4 bảng

| Bảng | Cột nghiệp vụ chính | Ràng buộc / ý nghĩa |
|---|---|---|
| `absence_requests` | `participant_id`, `requester_membership_id`, `submitted_at`, `reason`, `is_late_notice`, `status`, `approved_by_membership_id?`, `decided_at?`, `approval_request_id?` | Tính `is_late_notice` dựa trên **24 giờ** trước giờ buổi bắt đầu; đơn sớm **vẫn cần duyệt**; đơn muộn duyệt ngoại lệ. UQ một đơn active trên participant (dùng partial index theo trạng thái). |
| `attendance_finalizations` | `session_id`, `confirmed_by_membership_id`, `confirmed_at`, `locked_at?`, `revision` | UQ `(tenant_id,session_id)`; Teacher đủ quyền xác nhận bộ điểm danh; không cho billing dùng điểm danh chưa xác nhận. Khoá nghiệp vụ ở `min(session.end+48h, invoice.issued_at)` khi điều kiện tương ứng đến. |
| `attendance_records` | `participant_id`, `finalization_id?`, `attendance_status=ATTENDED/EXCUSED/UNEXCUSED`, `recorded_by_membership_id`, `recorded_at`, `updated_at`, `revision` | UQ `(tenant_id,participant_id)`; EXCUSED phải có đơn nghỉ được duyệt; **thực tế dự học => ATTENDED**. Bản draft chưa thuộc finalization thì không đủ điều kiện billing. |
| `attendance_corrections` | `attendance_id`, `old_status`, `new_status`, `reason`, `requested_by_membership_id`, `approved_by_membership_id?`, `corrected_at`, `approval_request_id?` | Append-only; sửa sau khóa cần quyền/lý do/audit; nếu hóa đơn đã phát hành, tạo **điều chỉnh tài chính** riêng chứ không tự tính lại hóa đơn gốc. |

**Xử lý buổi trung tâm hủy:** `class_sessions.status=CANCELLED` => không thu phí; có thể không tồn tại `attendance_records` được xác nhận cho buổi đã hủy. Billing phải chấp nhận nhánh này, không tự gán `UNEXCUSED` cho học sinh.

### 3.6. Billing & Receivables — 12 bảng

| Bảng | Cột nghiệp vụ chính | Ràng buộc / ý nghĩa |
|---|---|---|
| `price_rules` | `scope_kind=COURSE/CLASS/SESSION`, `course_id?`, `class_id?`, `session_id?`, `unit_price_vnd BIGINT`, `effective_from`, `effective_to?`, `policy_version_id`, `created_by_membership_id` | CK đúng một target, giá không âm, khoảng hiệu lực hợp lệ; không cho hai giá đang hiệu lực chồng nhau **cùng target**. Thứ tự **SESSION → CLASS → COURSE**. |
| `billing_periods` | `month_start DATE`, `month_end DATE`, `status` | UQ `(tenant_id,month_start)`; CK tháng chuẩn và `month_end` là đầu tháng sau (kỳ nửa mở). P0 tính theo tháng. |
| `billing_runs` | `period_id`, `student_id`, `operation_key`, `state`, `policy_version_id`, `input_snapshot_hash`, `computed_at?`, `requested_by_membership_id?`, `error_reason?` | UQ `(tenant_id,operation_key)`; **UQ `(tenant_id,period_id,student_id)`** cho **một run logic mỗi student/tháng** ở P0 (lựa chọn thiết kế, xem §9); draft có thể tính lại có kiểm soát; retry cùng operation trả kết quả cũ. `NEEDS_INFORMATION` khi điểm danh thiếu. |
| `invoices` | `billing_run_id`, `student_id`, `period_id`, `invoice_number?`, `status=DRAFT/ISSUED/CANCELLED`, `gross_vnd BIGINT`, `discount_vnd BIGINT`, `total_vnd BIGINT`, `issued_at?`, `issued_by_membership_id?`, `due_at?`, `policy_version_id`, `snapshot_json JSONB` | UQ `(tenant_id,billing_run_id)` và partial UQ số hóa đơn đã cấp; `total_vnd >= 0`; P0 phát hành **thủ công**, hạn 7 ngày. Không sửa trực tiếp totals/lines của hóa đơn ISSUED. |
| `invoice_lines` | `invoice_id`, `participant_id`, `session_id`, `attendance_id?`, `price_rule_id?`, `source_status`, `charge_units SMALLINT`, `unit_price_vnd BIGINT`, `base_amount_vnd BIGINT`, `reason_code`, `source_snapshot_json JSONB` | UQ `(tenant_id,invoice_id,participant_id)`; `charge_units IN (0,1)`; P0 ATTENDED/UNEXCUSED=1, EXCUSED/CANCELLED=0. Lưu cả dòng 0 đồng để giải thích miễn phí. |
| `invoice_discounts` | `invoice_id`, `kind=SIBLING`, `sequence_no`, `rate DECIMAL(6,5)`, `raw_discount_decimal DECIMAL(20,6)`, `evidence_snapshot_json JSONB` | UQ `(tenant_id,invoice_id,sequence_no)`; P0 chỉ SIBLING 10% nếu có chứng cứ; P1 có thêm COMBO theo thứ tự trước SIBLING. Không làm tròn từng bước trung gian. |
| `invoiced_participation_claims` | `participant_id`, `invoice_line_id`, `claimed_at` | **UQ `(tenant_id,participant_id)`** và UQ invoice_line; claim chỉ ghi khi hóa đơn phát hành, ngăn một buổi/học sinh đi vào **hai hóa đơn đã phát hành**. Sau hủy, không xóa claim để ngăn tái phát hành âm thầm; sửa bằng adjustment. |
| `invoice_adjustments` | `invoice_id`, `approval_request_id`, `adjustment_kind=AMOUNT/CANCELLATION`, `delta_vnd BIGINT`, `reason`, `status=PROPOSED/APPLIED/REJECTED`, `applied_at?`, `applied_by_membership_id?`, `operation_key` | UQ `(tenant_id,operation_key)`; **chỉ APPLIED sau phê duyệt thủ công**; append-only sau áp dụng. Có thể âm hoặc dương, không được khiến tổng phải thu trái chính sách. |
| `payments` | `invoice_id`, `amount_vnd BIGINT`, `method=CASH/BANK_TRANSFER`, `external_reference?`, `paid_at`, `recorded_by_membership_id`, `evidence_note?`, `idempotency_key`, `created_at` | UQ `(tenant_id,idempotency_key)`; CK `amount_vnd > 0`; nhập thủ công, một payment thuộc **đúng một hóa đơn**; không cho vượt số dư còn phải thu. |
| `payment_reversals` | `payment_id`, `amount_vnd BIGINT`, `reason`, `reversed_by_membership_id`, `reversed_at`, `approval_request_id?`, `operation_key` | UQ `(tenant_id,payment_id)` và UQ operation_key ở P0 (đảo **toàn khoản**, nếu sai nhập khoản mới); không xóa/sửa payment gốc. |
| `receivable_allocations` | `invoice_id`, `payment_id?`, `tuition_credit_id? (P1)`, `amount_vnd BIGINT`, `allocated_at`, `operation_key` | CK `amount_vnd>0`, đúng một nguồn (P0 luôn `payment_id`), UQ `(tenant_id,operation_key)`; P0 một payment phân bổ duy nhất vào invoice của chính nó. Thêm composite FK bảo đảm `allocation.invoice_id = payment.invoice_id` (đích `payments(tenant_id,id,invoice_id)` cần UQ). Giữ mô hình chung cho P1 credit. |
| `billing_source_snapshots` (**đề xuất**) | `billing_run_id`, `participant_id`, `attendance_revision?`, `session_revision`, `price_rule_id?`, `source_hash`, `captured_at` | UQ `(tenant_id,billing_run_id,participant_id)`; giúp so lại dữ liệu đã đọc trước phát hành và giải thích trường hợp có thay đổi đồng thời; có thể gộp vào `invoice_lines.source_snapshot_json` nếu giữ được độ tin cậy và tránh lặp. |

**Công thức nghiệp vụ (Baseline):**

```text
Số buổi thu phí  = 1 nếu ATTENDED/UNEXCUSED; 0 nếu EXCUSED/CANCELLED.
Gross             = SUM(charge_units * unit_price_vnd), theo từng nguồn buổi học.
P0 net            = ROUND_HALF_UP(Gross * 0.90, 0) nếu đủ điều kiện sibling;
                    ngược lại = Gross.
P1 combo+sibling  = ROUND_HALF_UP(Gross * 0.95 * 0.90, 0) nếu đủ cả hai.
Due (issued)      = total_vnd + SUM(applied_adjustment.delta_vnd)
                    - SUM(valid_payment_allocations)
                    - SUM(valid_credit_allocations P1).
Valid payment     = allocations từ payment chưa đảo; khi đảo toàn bộ,
                    khoản phân bổ tương ứng mất hiệu lực tính công nợ.
```

`discount_vnd = gross_vnd - total_vnd` khi phát hành, sau khi ROUND_HALF_UP **cuối phép tính**. Với invoice nhiều lớp trong một tháng, chỉ chốt sau khi **tất cả** buổi liên quan hợp lệ. **Không** coi số tiền draft, tiền trả trước chưa phân bổ, hoặc khoản thu bị đảo là tiền đã thu hợp lệ.

**Giao dịch bắt buộc:** (i) phát hành: khóa run/invoice + nguồn, kiểm tra lại attendance/price/policy, insert `invoiced_participation_claims` và gắn `invoice_number/issued_at`, ghi audit trong cùng transaction; (ii) thu tiền: khóa invoice, tính công nợ từ ledger, kiểm tra idempotency và `amount <= due`, insert payment+allocation+audit trong **một transaction**; (iii) approval điều chỉnh/hủy: ghi quyết định, `APPLIED` adjustment và audit trong transaction; hóa đơn gốc vẫn giữ số tiền đã phát hành.

#### Quyết định Billing nhóm A (Approved 17/10/2026)
- **Một hóa đơn logic cho mỗi học sinh/tenant/tháng**, gộp các lớp thành invoice_lines; giữ unique billing_runs(tenant_id,period_id,student_id).
- Mã invoice chỉ cấp khi ISSUE qua transaction + counter theo tenant/năm, unique (tenant_id,invoice_number), format hiển thị INV-{YEAR}-{SEQUENCE}; không phải hóa đơn điện tử hợp pháp.
- price_rules: triển khai exclusion SQL trên (tenant, scope target, daterange hiệu lực [from,to)) để ngăn giá overlap, bao gồm write đồng thời. Null end biểu thị vô hạn; cần test PostgreSQL.
- Bổ sung bảng **payment_excess_resolutions**: id, tenant_id, invoice_id, trigger_adjustment_id, amount_vnd BIGINT positive, status PENDING_RESOLUTION/RESOLVED, resolution_kind nullable, approval_request_id nullable, reason, resolved_at nullable, operation_key, created_at. UQ(tenant_id,operation_key), composite tenant FKs. Khi điều chỉnh giảm sau thu làm allocation vượt adjusted total, ghi chênh lệch cần xử lý trong cùng transaction, công nợ hiển thị 0 thay vì âm. Không sửa payment gốc, không tự refund/credit P0. Phải có permission/audit/approval thích hợp để xử lý.
- Công nợ = MAX(0, issued adjusted net - valid allocations); tổng thu vượt được trình bày và đối soát riêng. Chống double count khi JOIN.
- Tên bảng/constraint là lựa chọn thiết kế, chưa phải migration đã chạy.

### 3.7. Assignments, Submissions & Files — 7 bảng

| Bảng | Cột nghiệp vụ chính | Ràng buộc / ý nghĩa |
|---|---|---|
| `assignments` | `class_id?`, `created_by_teacher_id`, `title`, `description`, `priority SMALLINT`, `deadline_at`, `published_at?`, `status=DRAFT/PUBLISHED/ARCHIVED`, `revision` | CK priority **1–5**; ghi rõ thời hạn và nguồn lớp/học sinh; Teacher chỉ được giao trong scope. Sửa sau đã có nộp phải có quy tắc/audit. |
| `assignment_recipients` | `assignment_id`, `student_id`, `enrollment_id?`, `assigned_at`, `revoked_at?`, `deadline_override_at?` | UQ `(tenant_id,assignment_id,student_id)` **kể cả khi revoked**, tránh tạo nhiều submission cho cùng người/bài; reassign sử dụng lại recipient và ghi audit. Snapshot người được giao (không tự làm thay đổi lịch sử khi chuyển lớp). |
| `submissions` | `recipient_id`, `current_version_id?`, `status`, `created_at`, `updated_at` | UQ `(tenant_id,recipient_id)`; là container ổn định cho các lần nộp; quyền truy cập dựa recipient/student. |
| `submission_versions` | `submission_id`, `version_no INT`, `submitted_at`, `answer_text?`, `is_late BOOLEAN`, `status=SUBMITTED`, `content_hash?` | UQ `(tenant_id,submission_id,version_no)`; mỗi lần nộp lại tạo version mới, **không sửa version cũ**. Hạn muộn tối đa **7 ngày** sau deadline; đã chấm thì không nộp lại. |
| `stored_files` | `uploaded_by_membership_id`, `private_storage_key`, `original_filename`, `mime_type`, `size_bytes BIGINT`, `sha256`, `storage_status=STAGING/READY/ORPHANED`, `created_at` | UQ `(tenant_id,private_storage_key)`; tối đa **10 MB/tệp**, MIME PDF/DOCX/JPG/PNG; tên file vật lý ngẫu nhiên, không public đường dẫn. |
| `submission_files` | `submission_version_id`, `file_id`, `sort_order SMALLINT` | UQ `(tenant_id,submission_version_id,file_id)`; tối đa **5 file/lần nộp** (kiểm tra dưới transaction khi finalize), file phải READY và cùng tenant. |
| `grades` | `submission_version_id`, `revision_no`, `score DECIMAL(3,1)`, `feedback?`, `graded_by_teacher_id`, `graded_at`, `status=DRAFT/PUBLISHED`, `published_at?`, `reason_for_revision?` | CK `0 <= score <= 10`, một chữ số; UQ `(tenant_id,submission_version_id,revision_no)`. Bản cũ giữ lịch sử; Student/Parent chỉ thấy **revision đã PUBLISHED**, việc công bố riêng với lưu nháp. |

**Consistency file/DB:** Không có distributed transaction giữa PostgreSQL và Railway Volume. Upload vào đường dẫn tạm → kiểm tra MIME thực tế/dung lượng/checksum → ghi metadata/trạng thái READY và link phiên bản nộp theo transaction → cleanup bản tạm/orphan bằng job. Backup DB và volume phải khớp phiên bản metadata.

### 3.8. Workflow, Jobs, Audit, Notification — 8 bảng

| Bảng | Cột nghiệp vụ chính | Ràng buộc / ý nghĩa |
|---|---|---|
| `approval_requests` | `operation_type`, `target_type`, `target_id`, `requester_membership_id?`, `policy_version_id`, `status`, `reason`, `payload_snapshot_json`, `correlation_id`, `created_at`, `decided_at?` | Status baseline `DRAFT/PENDING_APPROVAL/APPROVED/REJECTED/NEEDS_INFORMATION/COMPLETED/FAILED`; `APPROVED` **chưa** là `COMPLETED`. Đối tượng thực thi phải xác minh lại tồn tại/tenant/quyền trước khi chốt. |
| `approval_decisions` | `approval_request_id`, `decided_by_membership_id`, `decision=APPROVE/REJECT/REQUEST_INFO`, `reason`, `decided_at`, `self_approved BOOLEAN` | Append-only; khi tạo yêu cầu=người duyệt, cho phép theo policy và gắn `self_approved=true` nếu ngoại lệ tài chính một Manager. Không có workflow status `SELF_APPROVED`. |
| `automation_jobs` | `job_kind`, `operation_key`, `idempotency_key`, `policy_version_id`, `trigger_event_id?`, `actor_membership_id?`, `correlation_id`, `status`, `attempt_count`, `next_attempt_at`, `lease_owner?`, `lease_until?`, `last_error_code?`, `payload_json`, `result_json?` | UQ `(tenant_id,operation_key)`; trạng thái `READY/RUNNING/NEEDS_INFORMATION/PENDING_APPROVAL/COMPLETED/FAILED`; `attempt_count <= 4` tổng số lượt (1 đầu + 3 retry). Khi quyền thay đổi cần kiểm tra lại. |
| `job_attempts` | `job_id`, `attempt_no`, `started_at`, `finished_at?`, `outcome`, `error_code?` | UQ `(tenant_id,job_id,attempt_no)`; lịch thử lại 1/5/15 phút sau các lần lỗi tạm thời, không retry vô hạn với `NEEDS_INFORMATION`. |
| `idempotency_records` | `operation_type`, `idempotency_key`, `request_hash`, `status`, `result_ref_type?`, `result_ref_id?`, `expires_at?` | UQ `(tenant_id,operation_type,idempotency_key)`; cùng key khác `request_hash` bị từ chối, thành công lặp lại trả kết quả cũ. Không xóa key tài chính nếu chưa có retention đảm bảo chống tái chạy. |
| `outbox_events` | `event_key`, `event_type`, `aggregate_type`, `aggregate_id`, `payload_json`, `occurred_at`, `status=NEW/PROCESSING/DONE/FAILED`, `attempt_count`, `available_at`, `correlation_id` | UQ `(tenant_id,event_key)`; insert **cùng transaction** với đổi lịch/giao bài; worker xử lý ngoài transaction của nghiệp vụ, không rollback thành công gốc khi lỗi notification. |
| `notifications` | `recipient_membership_id`, `outbox_event_id`, `kind`, `title`, `body`, `created_at`, `read_at?` | **UQ `(tenant_id,outbox_event_id,recipient_membership_id,kind)`**; chỉ **in-app P0**, trạng thái đọc = `read_at IS NULL/NOT NULL`. Quyền xem/đọc lại theo tenant, scope hiện hành. |
| `audit_logs` | `actor_user_id?`, `actor_membership_id?`, `actor_kind=USER/WORKER/OPERATOR`, `event_type`, `entity_type`, `entity_id`, `action`, `reason?`, `before_json?`, `after_json?`, `policy_version_id?`, `correlation_id`, `created_at`, `ip_address?` | Append-only qua ứng dụng, người dùng chỉ tra cứu khi có quyền; baseline **giữ 24 tháng**; lọc/ẩn dữ liệu nhạy cảm, không ghi plaintext password/OTP/token. Worker và thay đổi quyền đều phải ghi audit. |

**Thông báo P0** chỉ phát cho thay đổi lịch được **xác nhận** hoặc bài tập mới được **giao**, cùng cảnh báo tác vụ thất bại/thiếu người duyệt tới Manager; không triển khai email nghiệp vụ, nhắc deadline hay retry kênh ngoài ở P0. Outbox + unique notification chống sự kiện lặp.

## 4. Ràng buộc liên bảng quan trọng

| Mã | Bất biến và nơi thực thi |
|---|---|
| DB-01 | Mọi FK tenant-scoped dùng `(tenant_id, target_id)`; tuyệt đối không cho học viên, invoice, parent link, notification tham chiếu đối tượng tenant khác. DB FK + backend authorization + integration test. |
| DB-02 | Ít nhất **một Manager active**/tenant active; khi thu hồi/xóa role Manager cuối cùng cần kiểm tra có khóa transaction theo tenant. Không thể bảo đảm chỉ bằng CHECK một dòng. (BR-10) |
| DB-03 | Một người nhiều role; quyền kiểm tra **role permission hiện hành + scope + tenant + liên kết parent/student** ở từng request/job, không dựa vào claims cũ hoặc tên chức danh. (BR-08/BR-14) |
| DB-04 | Mọi timeslot `[start,end)` và `end > start`; `CANCELLED/RELEASED` không chiếm lịch; GiST exclusion + transaction lock chặn double booking. Không chấp nhận chuỗi 6 tháng nếu bất kỳ buổi nào lỗi. (BR-01/Q-04) |
| DB-05 | Không xác nhận lịch nếu vượt sức chứa lớp/phòng; không trùng học sinh hoặc lịch bận teacher/student/room. Capacity và phạm vi ghi danh cần kiểm tra trong transaction; FK/index không tự tính được COUNT. |
| DB-06 | EXCUSED **phải được duyệt**; điểm danh phải được Teacher có quyền xác nhận; khóa sau 48 giờ hoặc khi invoice phát hành, mốc sớm hơn. Đến học thực tế => ATTENDED. (BR-04/Q-05) |
| DB-07 | `invoice_lines` gắn nguồn buổi/điểm danh/giá và lưu snapshot; kiểm tra `participant.student_id = invoice.student_id` khi phát hành (nên củng cố bằng composite FK bổ sung); draft chưa đủ điểm danh chuyển NEEDS_INFORMATION; invoice ISSUED không ghi đè amount/lines. (BR-04/06/14) |
| DB-08 | Giá ưu tiên buổi → lớp → khóa; không overlap effective rules cùng target; áp giá/policy có hiệu lực tại thời điểm lập khoản tính phí; issued invoice không bị tính lại hồi tố. (Q-08/BR-14) |
| DB-09 | Điều chỉnh/hủy hóa đơn ISSUED **manual approval**; nếu tự duyệt trường hợp một Manager phải có `self_approved` và lý do; audit đầy đủ. (BR-11) |
| DB-10 | Khoản thu thủ công chỉ áp cho **một invoice**, amount > 0, không vượt nợ dưới row lock; đảo thu lưu record, không delete payment. (Q-10) |
| DB-11 | Bài tập priority 1–5, deadline; tối đa 5 file x 10 MB PDF/DOCX/JPG/PNG; điểm 0–10 bước 0,1; nộp lại trước chấm; chỉ grade đã published mới hiển thị. (Q-11) |
| DB-12 | Unique key của outbox, notification, job và billing/payment; retry giữ `policy_version_id`, không nhân đôi hiệu ứng; `APPROVED` không đồng nghĩa `COMPLETED`. (BR-09/12/14) |
| DB-13 | Audit bất biến ở tầng app và role DB hạn chế UPDATE/DELETE; nhật ký giữ 24 tháng tối thiểu baseline. (Q-14) |
| DB-14 | Dashboard truy vấn tenant + phạm vi, `COUNT(DISTINCT student_id)` với enrollment ACTIVE, COUNT classes ACTIVE, công nợ **invoice ISSUED** (sau điều chỉnh/đã thu hợp lệ), có `as_of`. (Q-12) |

### 4.1. Ví dụ SQL migration chuyên biệt (minh họa, **chưa chạy**)

Đây là đoạn **minh họa** dùng tên bảng/cột như thiết kế, không phải migration độc lập chạy được khi chưa tạo các bảng và PK/FK tương ứng.

```sql
-- Dùng trong migration PostgreSQL bên cạnh Prisma khi tạo resource_bookings.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE resource_bookings
  ADD CONSTRAINT ck_booking_time CHECK (ends_at > starts_at),
  ADD CONSTRAINT ck_booking_source CHECK (
    (session_id IS NOT NULL)::int + (unavailability_id IS NOT NULL)::int = 1
  );

ALTER TABLE resource_bookings
  ADD CONSTRAINT ex_no_active_resource_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'ACTIVE');

-- Ví dụ index partial cho các bản gán role còn hiệu lực.
CREATE UNIQUE INDEX uq_active_membership_role
  ON membership_roles (tenant_id, membership_id, role_id)
  WHERE revoked_at IS NULL;

-- Chống thông báo lặp lại khi event được replay.
CREATE UNIQUE INDEX uq_notification_event_recipient_kind
  ON notifications (tenant_id, outbox_event_id, recipient_membership_id, kind);
```

**Điều kiện thực hiện:** `schedulable_resources` được tạo cho Teacher/Student/Room trước khi đặt lịch; mọi confirmation/unavailability update phải tạo hoặc release `resource_bookings` trong cùng transaction. GiST chỉ bảo vệ booking đã được ghi **đầy đủ**; cần test chủ động lỗi quên tạo booking và quy trình hủy/đổi buổi.

### 4.2. Index chính cho P0

| Truy vấn | Index đề xuất |
|---|---|
| Role/scope theo phiên | `tenant_memberships(tenant_id,user_id)`, `membership_roles(tenant_id,membership_id) WHERE revoked_at IS NULL`, `access_scopes(tenant_id,membership_role_id,scope_kind)` |
| Lớp và ghi danh | `enrollments(tenant_id,class_id,status,effective_from)`, `enrollments(tenant_id,student_id,status)`, `classes(tenant_id,status)` |
| Lịch tuần/lịch người học | `class_sessions(tenant_id,class_id,starts_at)`, `class_sessions(tenant_id,teacher_id,starts_at)`, `session_participants(tenant_id,student_id,session_id)`, `resource_bookings` GiST constraint |
| Điểm danh | `attendance_records(tenant_id,participant_id)`, `absence_requests(tenant_id,participant_id,status)` |
| Pricing | `price_rules(tenant_id,scope_kind,effective_from)`, bổ sung exclusion cho cùng target/hiệu lực khi chốt migration |
| Lập hóa đơn | `billing_periods(tenant_id,month_start)`, `billing_runs(tenant_id,period_id,student_id)`, `invoice_lines(tenant_id,participant_id)`, `invoiced_participation_claims(tenant_id,participant_id)` |
| Công nợ | `invoices(tenant_id,status,issued_at)`, `payments(tenant_id,invoice_id)`, `receivable_allocations(tenant_id,invoice_id)`, `invoice_adjustments(tenant_id,invoice_id,status)` |
| Bài tập và thông báo | `assignment_recipients(tenant_id,student_id,assigned_at)`, `submission_versions(tenant_id,submission_id,version_no DESC)`, `notifications(tenant_id,recipient_membership_id,created_at DESC)` |
| Worker | `automation_jobs(status,next_attempt_at) WHERE status IN ('READY','RUNNING')` (đồng thời tenant filter khi thao tác); `outbox_events(status,available_at)`; lease bằng `FOR UPDATE SKIP LOCKED` |
| Audit | `audit_logs(tenant_id,created_at DESC)`, `(tenant_id,entity_type,entity_id,created_at DESC)`, `(tenant_id,correlation_id)` |

**Ghi chú:** Không tạo mọi index theo thói quen. Index thực tế cần `EXPLAIN (ANALYZE, BUFFERS)` và benchmark NFR-01/02; chỉ thêm các index phục vụ truy vấn đã thiết kế.

## 5. Transaction, concurrency và quyền truy cập

### 5.1. Ranh giới transaction

1. **Tạo/đổi lịch:** khóa resource theo thứ tự ổn định → expand/tính participants → xác minh scope và calendar → insert/update session + bookings + audit + outbox → COMMIT; một lỗi => ROLLBACK toàn chuỗi.
2. **Xác nhận attendance:** quyền Teacher cho buổi hiện hành → kiểm tra đơn nghỉ + trạng thái đã khóa → update records + finalization + audit; billing không được thấy nửa bộ điểm danh.
3. **Tính phí:** chụp policy version, nguồn điểm danh/giá và hash → tạo/update draft hợp lệ; nguồn thiếu thì đánh dấu NEEDS_INFORMATION, không phát hành.
4. **Phát hành:** khóa invoice và nguồn, so revision/hash → tạo claim nguồn buổi + `ISSUED` + due date + audit → COMMIT; không sửa issued sau đó.
5. **Thu/đảo thu:** khóa invoice và ledger entries, tính số dư từ các nguồn bất biến, kiểm tra amount/idempotency → payment/allocations hoặc reversal + audit → COMMIT.
6. **Duyệt ngoại lệ:** ghi decision → **kiểm tra lại** quyền/scope/policy reference/điều kiện hiện tại → thực thi target → `COMPLETED` chỉ khi commit thành công; nếu không, status/trace phù hợp.
7. **Giao bài:** create/update recipients + business event outbox trong transaction; worker tạo notification sau; lỗi notification không hủy giao bài.

### 5.2. Tenant isolation và an toàn

- Mỗi API dùng `tenant_id` rút từ phiên hợp lệ **và đối chiếu membership hiện hành**; không chấp nhận tenant ID từ body làm nguồn tin cậy; cùng rule cho worker theo job source.
- Dùng composite FK và explicit `WHERE tenant_id = ...`; Prisma client nên đóng gói tenant-aware repository/service. **Không coi Prisma middleware/frontend là đủ** để ngăn IDOR/cross-tenant.
- PostgreSQL Row Level Security (RLS) có thể thêm như defense in depth khi quyết định rõ pooling, worker context và biến session transaction; **chưa mặc định RLS đã bật** hoặc thay thế authorization ở NestJS.
- P0 kiểm tra scope Teacher và Parent theo liên kết đang còn hiệu lực; `user` đa tenant có thể dùng chung email nhưng không xem chéo dữ liệu.
- Quyền DB của API/worker không được cấp khả năng tự sửa cấu trúc bảng. Audit chỉ ghi append-only trong use case; bảo vệ khỏi actor SQL đặc quyền được xử lý qua cấu hình role/backup.
- Trường PII (ngày sinh, contact, địa chỉ) giới hạn truy xuất; không đưa trực tiếp vào outbox/audit/notification nếu không cần; không lưu OTP hoặc refresh token plaintext.

## 6. Dashboard P0: truy vấn và định nghĩa

Không tạo bảng `dashboard_metrics` tại P0. Tính bằng SQL aggregate với điều kiện tenant/scope và gắn `as_of` thời điểm truy vấn (hoặc timestamp snapshot transaction).

| Chỉ số | Định nghĩa |
|---|---|
| `active_students` | `COUNT(DISTINCT enrollments.student_id)` trên enrollment `ACTIVE` hợp lệ tại `as_of` và thuộc lớp/phạm vi người xem. |
| `active_classes` | `COUNT(DISTINCT classes.id)` nơi trạng thái ACTIVE, trong phạm vi người xem. |
| `outstanding_receivables_vnd` | `SUM(MAX(0, invoice.total_vnd + SUM(APPLIED adjustments.delta_vnd) - valid allocated payments - valid allocated credits))`, chỉ trên invoice `ISSUED`/hóa đơn có hiệu lực tài chính; bỏ qua draft và chứng từ hủy có công nợ đã được xử lý. |

**Tránh nhân bản tiền:** Aggregate adjustment, allocation và reversal **theo từng invoice ở các subquery/CTE riêng** trước khi JOIN vào invoices; không JOIN ba bảng 1–n rồi SUM trực tiếp, sẽ nhân tích Descartes các khoản tiền. Công nợ theo hợp đồng/chính sách thực tế cần kiểm thử ca hủy invoice còn khoản thu và điều chỉnh âm/dương.

## 7. Mở rộng P1 (chưa migration ở MVP)

| Bảng/nhóm | Quan hệ và ý nghĩa | FR/UC/BR |
|---|---|---|
| `makeup_bookings` | `student_id`, `source_participant_id` (buổi EXCUSED), `target_session_id`, `status`, `used_at?`, `expires_on`; một lượt sử dụng/buổi gốc, trong 30 ngày, không nhập lớp đích và không thu hai lần. Mở `session_participants.participant_kind=MAKEUP`. | FR-20/21, UC-17, BR-02/03/04 |
| `suspensions` | `student_id`, `enrollment_id`, `from_date`, `to_date`, `approval_request_id`, `status`, `resumed_at?`; không thu buổi trong thời gian bảo lưu. | FR-22/23, UC-18/19, BR-05 |
| `tuition_credits` | `student_id`, `suspension_id`, `original_invoice_id`, `amount_vnd`, `remaining_vnd` (hoặc tính ledger), `reason`, `created_at`; tín dụng chỉ từ tiền **đã thu** cho buổi chưa dùng, sau ưu đãi; không tự refund/hết hạn. Bổ sung nguồn CREDIT vào `receivable_allocations`. | UC-18/19/23, Q-06 |
| `substitution_requests` | `session_id`, `proposed_teacher_id`, `accepted_at?`, `approved_at?`, `approval_request_id`, `status`; Teacher nhận dạy và nhân sự đủ quyền xác nhận, kiểm tra tối đa 8h/ngày, 40h/tuần. | FR-24, UC-20, BR-07/Q-07 |
| `prepaid_packages`, `prepaid_package_enrollments` | Gói 6 tháng, thanh toán đủ trước hạn, phân bổ buổi/tín dụng và snapshot ưu đãi COMBO 5%; không kích hoạt ở P0. | FR-28, UC-22, BR-06/Q-09 |
| `external_delivery_attempts`, `reminder_schedules` | P1 email notification nghiệp vụ, nhắc 24h/1h, retry và delivery receipt; P0 chỉ in-app, không dựng các bảng này trước. | FR-37/38/39, UC-31/Q-13 |
| `approval_policies`, `policy_change_history` | UI cấu hình điều kiện/permission và phiên bản chính sách, có audit; `policy_versions` từ P0 tiếp tục làm snapshot bất biến. | FR-43/44, UC-33, BR-14 |
| Reporting read models | Materialized view / projection kèm refresh watermark khi thực sự cần; không trộn P1 analytics vào tài chính P0. | FR-40, UC-30/32 |

## 8. Thứ tự tạo migration và kiểm thử — Approved nhóm A

| Phase | Bảng phụ thuộc | Kiểm thử |
|---|---|---|
| 1 | Tenant/policy, users/credentials/sessions/OTP, membership/roles/permissions/scopes, audit, idempotency | Bootstrap, OTP, Manager cuối, multi-tenant isolation |
| 2 | Workflow approvals, automation jobs/attempts, transactional outbox | Retry, dedup, changed-permission and worker concurrency |
| 3 | Academic/relationships, course/class/enrollment/transfer | Composite FK, transfer/capacity |
| 4 | Resource bookings, scheduling, attendance/leave | GiST exclusion, concurrent overlaps, all-or-nothing |
| 5 | Pricing, billing invoice/claims/payments/reversal/adjustment and payment_excess_resolutions | One invoice per student/month, price overlaps, excess after adjustment |
| 6 | Assignments/file/grading, notifications, dashboard SQL | Staging, permission scopes, published grade/outbox |

Tạo migration theo từng vertical slice; không migrate P1 trong P0. Tránh triển khai nghiệp vụ phụ thuộc jobs/outbox/approval trước hạ tầng cần thiết.

**Schema readiness gate trước lập trình feature:** Prisma schema và migration SQL áp dụng sạch lên DB mới; test rollback transaction; `prisma migrate deploy` chỉ chạy qua bước release kiểm soát; có seed baseline quyền/policy; kiểm thử concurrency với **hai client DB thực**; kiểm thử backup/restore PostgreSQL lẫn Volume; không được tuyên bố đạt hiệu năng/availability trước khi đo NFR.

## 9. Decision log — nhóm A đã Approved; các vấn đề khác còn review theo slice

1. **Kỳ billing [APPROVED]:** một hóa đơn/học sinh/tháng, gộp tất cả các lớp trong tenant theo §3.6.
2. **Giá trị tiền/kiểu dữ liệu:** chọn `BIGINT` nguyên VND và `DECIMAL` cho tỷ lệ; cần thống nhất trên frontend serialization `BigInt -> string` trong REST JSON, không ép sang JS `number` thiếu an toàn cho số lớn.
3. **Mã khóa ngoại với snapshot:** composite FK trên tất cả quan hệ quan trọng, song `invoice.snapshot_json`, event target đa hình, source revision vẫn phải xác minh thêm ở domain layer; DB không tự biết tính đúng của snapshot.
4. **Cấp quyền vận hành:** catalog `permissions` và mapping role seed P0 cần liệt kê từng permission cụ thể trong Authorization Detailed Design; tài liệu nguồn quy định nguyên tắc, chưa cung cấp danh sách đầy đủ permission cho từng role.
5. **Thứ tự và phương thức cấp số hóa đơn nội bộ:** chỉ cấp khi ISSUE trong transaction, unique theo tenant; format `INV-{YEAR}-{SEQUENCE}` là **đề xuất**, chưa phải quyết định nguồn. Không đồng nhất hóa đơn nội bộ với hóa đơn điện tử hợp pháp.
6. **Lịch hủy đã tham dự, học phí âm và payment khi hủy:** cần bảng chuyển trạng thái/validation rõ cho các ca đã phát hành/thu rồi, nhất là điều chỉnh giảm và refund ngoài phạm vi; không tự xóa nợ/hoàn tiền.
7. **Versioning lần nộp/chấm:** grade gắn với `submission_version`; khi có bản nháp sửa điểm sau publish, xác định rõ bản điểm published gần nhất vẫn hiển thị đến khi công bố phiên bản mới.
8. **Biên dữ liệu nhân thân:** quyết định các trường PII tối thiểu cho teacher/student/parent, thời hạn lưu và cách xử lý quyền xóa dữ liệu mà không phá lịch sử tài chính/điểm.
9. **Kiểm tra ràng buộc tài nguyên:** mô hình resource registry + exclusion constraint là phương án phòng vệ DB bổ sung so với lock giao dịch trong Architectural Design; xác minh với load/concurrency test trước khi chốt.
10. **Tình trạng đầu vào [RESOLVED]:** Requirements v5 đã đồng bộ vào docs/requirements/requirements_analysis.md. Q-01–Q-15 thuộc baseline hiện tại.

## 10. Ma trận truy vết nhanh

| Module/bảng chủ chốt | FR/UC | BR/Q |
|---|---|---|
| `users`, `tenant_memberships`, `roles`, `membership_roles`, `access_scopes`, `parent_student_links` | FR-01–06; UC-01–06, UC-36 | BR-08/10/14; Q-01/02/15 |
| `student_profiles`, `classes`, `enrollments`, `enrollment_transfers` | FR-07–10; UC-07–10 | BR-13; Q-03 |
| `class_sessions`, `resource_bookings`, `schedule_series`, `session_participants` | FR-11–17; UC-11–14 | BR-01; Q-04 |
| `absence_requests`, `attendance_records`, `attendance_finalizations` | FR-18/19; UC-15/16 | BR-04; Q-05 |
| `price_rules`, `billing_runs`, `invoices`, `invoice_lines`, `invoice_discounts` | FR-25–29; UC-21–24 | BR-04/06/13/14; Q-08/09 |
| `payments`, `payment_reversals`, `receivable_allocations`, `invoice_adjustments` | FR-30/31; UC-25/26 | BR-08/11/12; Q-10 |
| `assignments`, `assignment_recipients`, `submission_versions`, `stored_files`, `grades` | FR-32–35; UC-27–29 | Q-11 |
| `outbox_events`, `notifications` | FR-37/39 P0; UC-31 | BR-12; Q-13 |
| Dashboard aggregate queries | FR-40 P0; UC-32 | Q-12 |
| `approval_requests`, `approval_decisions`, `automation_jobs`, `idempotency_records`, `audit_logs`, `policy_versions` | FR-41/42/45; UC-34–37 | BR-08–14; Q-13/14/15 |
| P1 extension tables | FR-20–24, FR-28, FR-38, FR-43/44; UC-17–20/30/33 | BR-02/03/05/07; Q-06/07 |

---

### Kết luận thiết kế

Thiết kế sử dụng **một PostgreSQL chung với các FK gắn tenant**, giữ **nguồn dữ liệu và snapshot bất biến** cho học phí/điểm danh/bài nộp, sử dụng **transaction và resource booking exclusion** để chống tranh chấp lịch, và **job/outbox + idempotency** cho automation/notification. P0 chỉ triển khai nghiệp vụ nội bộ, ngoại lệ bên ngoài duy nhất là **gửi OTP email**. Các điểm §9 phải được chốt trong Detailed Design trước khi viết migration chính thức; tài liệu này là bản thiết kế đề xuất, không ngầm sửa baseline từ ba nguồn.