# EduCore P0 — Independent Prisma Architecture & Integrity Audit

**DRAFT LOCAL — chờ chủ dự án review. Ngày: 18/10/2026, Asia/Saigon.**

## A. Executive summary và phạm vi bằng chứng

**Kết luận: NOT_READY — có khoảng hở quan hệ nghiêm trọng; chưa nên phê duyệt tạo migrations chính thức từ schema hiện tại.**

Đã review **62/62 models, 28/28 enums**, toàn bộ FK sở hữu, candidate keys, nullable và mapping bảng; không thấy model trùng hay thiếu so với danh mục P0 đã đối chiếu. `prisma validate` thành công. Đây là bằng chứng cấu trúc Prisma hợp lệ, không chứng minh tính đúng nghiệp vụ hoặc PostgreSQL constraints đã hoạt động.

Hai lỗi thiết kế quan hệ được xác nhận bằng phản ví dụ: invoice line có thể thuộc học sinh khác/kỳ khác invoice (H-04), attendance có thể được “xác nhận” bởi finalization của buổi khác (H-02). Các rủi ro High khác là **missing enforcement**, không phải tuyên bố đã có lỗi production: ledger chưa được bảo vệ bởi CHECK/giao dịch/bất biến; booking chưa được bảo đảm đầy đủ/đúng nguồn; thực thi approval và worker retry cần giao thức đồng thời cụ thể. Không có bằng chứng để gán Critical hoặc khẳng định đã thất thoát tiền/rò rỉ dữ liệu thực tế.

**Thống kê findings:** 20 High, 8 Medium, 1 Low; tổng 29. High gồm 3 confirmed defects (H-02, H-04, H-18; H-18 là lỗi đầy đủ nguồn), 17 missing enforcement. Medium gồm 4 open decisions, 2 improvements và 2 missing enforcement. Mức độ phản ánh tác động nếu đưa thiết kế vào sử dụng mà không xử lý; không dùng số findings để đo chất lượng code chưa tồn tại.

Những điểm đúng đã kiểm chứng độc lập:

- User là global; membership/role/scope tách riêng. Profile có thể không có account.
- Toàn bộ owning FK giữa các model có `tenantId` đều mang tenant trong key; các FK tới User/Permission global là ngoại lệ có chủ đích.
- Invoice gắn đúng student/period của BillingRun bằng FK bốn cột; allocation gắn đúng invoice của Payment bằng FK ba cột; claim gắn đúng participant của line.
- Unique logical invoice/student/tenant/month, unique số invoice không NULL, unique claimed participant, full-reversal tối đa một record/payment, version/revision keys và notification dedup đều đã có.
- Tất cả 188 owning relations khai báo `onDelete: Restrict`; không có cascade delete. Không có `Float`; tất cả DateTime có native TIME/DATE/TIMESTAMPTZ.

**Giới hạn:** Không chạy PostgreSQL, không sinh SQL/migration, không generate client, không chạy format/seed/db push/reset. Phản ví dụ dưới đây là suy luận từ các constraint khai báo, **chưa execute INSERT trên PostgreSQL**. Backend hiện là scaffold (`apps/api/src/app.module.ts:7`, `apps/api/src/app.controller.ts:11`); không giả định service kiểm tra nghiệp vụ đã có. Chỉ tạo báo cáo này; mọi sửa đổi schema/SQL/backend được đề xuất để review sau.

### A.1. Snapshot repository và nguồn thực tế

Branch: `feat/prisma-p0-schema`; HEAD: `6173e2efc7d1c2c0d9b8559baf2a858c37b7f867`. Đối tượng audit là **working copy**, không chỉ HEAD. Trước audit đã có `M apps/api/prisma/schema.prisma` và `M docs/ai/SCHEMA_REVIEW.md`; không hoàn nguyên/chỉnh sửa hai file này.

SHA-256 schema: `7F78D2BD1D625A3A685E3A161AD8611FD591A1223872F8DA8AFABAF5F85598EC`.

SHA-256 previous review: `36A2EEBEA85FD9725D6280320DEB32019ECF998C8FBEE06B43A5C11C8BC6FC24`.

Mọi dẫn `S:L` dưới đây là `apps/api/prisma/schema.prisma:L`. Các đường dẫn nguồn khác được ghi đầy đủ trong findings. Line numbers áp dụng cho snapshot này.

| Nguồn | Đã kiểm chứng / giới hạn |
|---|---|
| `AGENTS.md:1` | Kit v1.0; docs-only, review-first, không Git/migration/remediation. Audit rộng này theo phạm vi explicit của người dùng, không mở feature slice. |
| `docs/requirements/requirements_analysis.md:11` | Changelog ghi v5; FR-01–45, NFR-01–16, BR-01–14 có trong file. **File chỉ 296 dòng, kết thúc sau §6; thiếu §7 Q và §8 integration mà các tài liệu khác dẫn đến.** Không chứng nhận đây là bản v5 đầy đủ (H-18). |
| `docs/requirements/usecase/specification.md:15`, `:1750` | C-01–11, UC-01–37, Q-01–15 hiện có; register gọi v1.3 nhưng file không có header version v1.3 độc lập. Dùng nội dung có thật và nêu hạn chế provenance. |
| `docs/architectural/architectural_design.md:31`, `:205`, `:284` | Modular monolith/PostgreSQL/outbox/shared tenant được Accepted; loại lock/isolation cụ thể vẫn proposal. |
| `docs/design/database_design.md:3`, `:149`, `:233` | v1.1 và Group A present; phần SQL có nhãn đề xuất/chưa test. Group A không đồng nghĩa mọi chi tiết §9 đã chốt. |
| `docs/design/detailed_design.md:98`, `:146`, `:331` | Đây là **tên file thực tế**, không phải `detailed_des.md`. Review domain §5 và coordinators §6, Group A và pending. |
| `docs/design/api_specification.md:15`, `:169`, `:206`, `:227`, `:369`, `:461`, `:555` | Đây là **tên file thực tế**, không phải `api_spec.md`; là contract đề xuất, chưa phải routes đã implement. |
| `docs/design/class design/*.md` | Đọc các invariants/open decisions và phần liên quan của 13 module P0: identity, tenant, academic, scheduling, attendance, billing, assignments, files, workflow, jobs, audit, notification, reporting. Academic exceptions chỉ dùng để xác định biên P1. |
| `docs/ai/PROJECT_CONTEXT.md:4` | Context tham khảo; snapshot “chưa có schema” đã cũ so với working copy hiện tại. |
| `docs/ai/DECISION_REGISTER.md:10`, `:46` | Phân biệt Group A với SCH-TECH/BILL-TECH/WF-TECH. UI không làm nguồn thay đổi domain. |
| `docs/ai/SCHEMA_REVIEW.md:28`, `:75`, `:83`, `:124` | Báo cáo cũ được kiểm chứng lại, không làm authority. Claims về validate/SQL/service được tách riêng ở D.4. |

## B. Model completeness matrix — 62/62 đã review

**Quy ước áp dụng cho từng dòng:** R = đã rà cấu trúc, PK/UQ/FK/index, nullable/cardinality, native types, lifecycle/history và constraint còn thiếu; **R không phải PASS nghiệp vụ**. UUID PK `id` cho mọi model trừ Credential dùng `userId` UUID PK/FK. Mọi model domain có `tenantId NOT NULL` + UQ `(tenantId,id)`; Tenant là root, User/Credential/AuthSession/PasswordResetOtp/Permission global. FK domain Restrict; onUpdate không khai báo (xem D.2). VND BIGINT; rates/scores DECIMAL; JSON là JSONB; mốc thời gian TIMESTAMPTZ(6), ngày DATE, giờ series TIME(0). Các FK/index nêu trong bảng là điểm phân biệt quan trọng, không thay cho quy ước chung.

DB source: `docs/design/database_design.md`, line tham chiếu trong cột DB. Các cột nullable đáng chú ý và ràng buộc thiếu được ghi cho từng model; field không ghi `?` trong schema đã được review là required. SQL backlog E áp dụng bổ sung cho từng dòng.

| # | Model → PostgreSQL; S line / DB line | PK/UQ/FK/index và nullable/cardinality đã kiểm tra | Lifecycle / kết quả R |
|---|---|---|---|
| 1 | Tenant → tenants; 180 / 124 | code global UQ; activatedAt?; timezone/status text | R: không hard-delete history; Manager/status H-10, M-07 |
| 2 | PolicyVersion → policy_versions; 252 / 125 | tenant+versionCode UQ; creator?, end?; effectiveFrom index | R: immutable config/hash; pin/effective ambiguity M-04, H-20 |
| 3 | User → users; 280 / 133 | emailNormalized UQ; activatedAt?; 0..1 Credential | R: normalize/activation, disable đa tenant H-10, M-02 |
| 4 | Credential → credentials; 298 / 134 | userId PK/FK; lockedUntil?; failedAttempts Int | R: mutable hash/counters; CAS reset/rate-limit M-02 |
| 5 | AuthSession → auth_sessions; 310 / 135 | user, optional activeTenant; user/revoked/expiry index | R: rotate/revoke; tenant FK không chứng minh membership H-11 |
| 6 | PasswordResetOtp → password_reset_otps; 329 / 136 | user FK; purpose enum; consumedAt?; user/purpose/expiry index | R: consume một lần, attempts/TTL M-02 |
| 7 | TenantMembership → tenant_memberships; 346 / 137 | tenant+user UQ; leftAt?; global user index | R: status/last Manager/active identity H-10, M-07 |
| 8 | Role → roles; 396 / 138 | tenant+code UQ; systemSeeded Boolean | R: P0 seed cố định; không editor P1; H-10/11 |
| 9 | Permission → permissions; 414 / 139 | global code UQ; sensitive flag | R: catalog seed/version; FK không cấp quyền; H-11 |
| 10 | RolePermission → role_permissions; 425 / 140 | tenant+role+permission UQ; role cùng tenant, permission global; permission index | R: seed mapping; protect last Manager/permissions H-10 |
| 11 | MembershipRole → membership_roles; 444 / 141 | subject/role/assigner required cùng tenant; revokedAt?; không active UQ | R: giữ revoked history, active partial UQ thiếu H-11; bootstrap M-03 |
| 12 | AccessScope → access_scopes; 468 / 142 | grant FK; class?/student?; lookup indexes | R: đúng tenant nhưng shape/dedup cần SQL H-11 |
| 13 | TeacherProfile → teacher_profiles; 491 / 159 | code UQ; membership? UQ/tenant; contact? | R: nhiều profile chưa account hợp lệ; teacher scope H-01/11 |
| 14 | StudentProfile → student_profiles; 517 / 160 | code UQ; membership? UQ/tenant; DOB? DATE | R: không hard-delete; student identity H-04/11 |
| 15 | Subject → subjects; 547 / 161 | tenant+code UQ; active required | R: soft deactivate; không thấy field thừa có bằng chứng |
| 16 | Level → levels; 565 / 162 | tenant+code UQ; sortOrder Int | R: không tự áp range sort chưa chốt; M-07 |
| 17 | Course → courses; 584 / 163 | subject+level cùng tenant; code UQ; description? | R: status text; source pricing H-04/09, M-07 |
| 18 | Class → classes; 608 / 164 | course FK; code UQ; capacity Int; start/end? DATE; status/course indexes | R: capacity/calendar CHECK+locks H-01/17, M-02 |
| 19 | TeacherCompetency → teacher_competencies; 639 / 165 | teacher/subject/level UQ; verifiedAt?; subject/level index | R: basic profile data P0; không substitute P1 M-08 |
| 20 | ClassTeacherAssignment → class_teacher_assignments; 660 / 166 | class/teacher/assigner required; validTo?; effective lookups | R: lịch sử phân công, interval/authority H-01, M-02 |
| 21 | Enrollment → enrollments; 685 / 167 | candidate (tenant,student,id), (tenant,class,id); prior? cùng student; effectiveTo? | R: no ACTIVE overlap/lineage cycle enforced H-01, E-08 |
| 22 | EnrollmentTransfer → enrollment_transfers; 719 / 168 | operation UQ; targetEnrollment? buộc targetClass; confirmer?/approval? | R: không buộc source/target cùng student; H-01; history retain |
| 23 | ParentStudentLink → parent_student_links; 752 / 143 | parent/student/verifier cùng tenant; verifiedAt?/verifier?/revokedAt? | R: pair active UQ/verification coherence thiếu; H-11 |
| 24 | VerifiedSiblingRelationship → verified_sibling_relationships; 777 / 144 | two student FKs, verifier required; revoked?/evidence? | R: order/non-self/active UQ thiếu; discount eligibility H-05/11 |
| 25 | Room → rooms; 801 / 176 | code UQ; capacity Int; location? | R: capacity CHECK+concurrent edits H-17, M-02 |
| 26 | SchedulableResource → schedulable_resources; 822 / 177 | teacher?/student?/room? từng target UQ/tenant | R: at-most-one registry/target đúng; exactly-one kind chưa có H-17 |
| 27 | ResourceUnavailability → resource_unavailability; 846 / 178 | candidate (tenant,resource,id); creator FK; interval lookup | R: CONFIRMED phải có booking đúng range H-17/09 |
| 28 | ScheduleSeries → schedule_series; 871 / 179 | candidate (tenant,class,id); weekday SmallInt, TIME, DATE, timezone; status text | R: ≤6 tháng, expansion, duplicate occurrence/idempotency H-17 |
| 29 | ClassSession → class_sessions; 895 / 180 | series? cùng class; room?; teacher+policy required; revision; class/teacher/room/time indexes | R: future CAS, cancel reason?, room/time/booking constraints H-17 |
| 30 | SessionParticipant → session_participants; 934 / 181 | tenant+session+student UQ cả removed; enrollment? buộc student; candidate session/id | R: chưa chứng minh enrollment cùng class/hiệu lực H-01; claims giữ danh tính |
| 31 | ResourceBooking → resource_bookings; 964 / 182 | source session?/unavailability?; unavailability buộc resource; time indexes | R: shape/EXCLUDE/completeness chưa có H-09/17 |
| 32 | AbsenceRequest → absence_requests; 989 / 190 | participant/requester required; approver?/decided?/approval?; participant/status index | R: active UQ/status chờ chốt, không self-approve H-03/11 |
| 33 | AttendanceFinalization → attendance_finalizations; 1019 / 191 | session UQ; confirmer FK; lockedAt?, revision | R: một batch/session đúng; không bảo đảm đủ records H-02/03 |
| 34 | AttendanceRecord → attendance_records; 1042 / 192 | participant UQ và candidate participant/id; finalization? cùng tenant | R: có thể sai session H-02; locks/correction H-03 |
| 35 | AttendanceCorrection → attendance_corrections; 1070 / 193 | attendance FK; old/new enum; approver?/approval?; history index | R: append-only chưa enforced; old/new CAS và finance H-03/20 |
| 36 | PriceRule → price_rules; 1098 / 201 | scope targets?; policy+creator required; effective DATE, unit BigInt | R: target CHECK/no-overlap/price precedence H-04/09; M-04 |
| 37 | BillingPeriod → billing_periods; 1129 / 202 | monthStart UQ/tenant; monthEnd DATE; status text | R: tháng chuẩn chưa CHECK H-05; timezone boundary H-04 |
| 38 | BillingRun → billing_runs; 1148 / 203 | period+student UQ; operation UQ; four-column candidate; requester?/computed?/error? | R: logical dedup đúng; input hash/policy/recompute freeze H-06, M-04 |
| 39 | Invoice → invoices; 1180 / 204, 234 | run+student+period FK; run UQ, period+student UQ, number? UQ; issuer?/issue?/due? | R: identity tốt; issue metadata/amount/claims/counter H-04–08, M-05 |
| 40 | InvoiceLine → invoice_lines; 1223 / 205 | invoice+participant UQ; participant buộc session; attendance? buộc participant; price? cùng tenant | R: thiếu student/period proof H-04; snapshot/amount H-05/06 |
| 41 | InvoiceDiscount → invoice_discounts; 1258 / 206 | invoice+sequence UQ; rate D(6,5), raw D(20,6), evidence JSONB | R: nhiều SIBLING được phép H-05; precision M-01 |
| 42 | InvoicedParticipationClaim → invoiced_participation_claims; 1279 / 207 | participant UQ, line UQ, participant+line FK | R: chống trùng claim đúng; không bắt buộc claim khi ISSUE H-06 |
| 43 | InvoiceAdjustment → invoice_adjustments; 1299 / 208 | invoice/approval required; operation UQ; candidate invoice/id; appliedAt?/actor? | R: approval target/effect/immutability H-08/20 |
| 44 | Payment → payments; 1330 / 209 | invoice+actor required; idempotency UQ; candidate id/invoice; ref?/evidence? | R: one-invoice đúng; amount/hash/lock/allocation H-07/16 |
| 45 | PaymentReversal → payment_reversals; 1358 / 210 | payment UQ; operation UQ; approval? | R: at-most-one đúng, full amount equality chưa enforced H-07; workflow M-05 |
| 46 | ReceivableAllocation → receivable_allocations; 1384 / 211 | payment UQ; payment+invoice FK đúng; operation UQ | R: payment mandatory đúng P0; exactly-one/equal amount H-07 |
| 47 | PaymentExcessResolution → payment_excess_resolutions; 1407 / 237 | invoice+triggerAdjustment FK; operation UQ; resolutionKind?/approval?/resolvedAt? | R: đúng invoice trigger; lifecycle/delta/reversal H-08, M-05 |
| 48 | Assignment → assignments; 1436 / 245 | class?; teacher FK; priority SmallInt; publishedAt?, revision; scope indexes | R: individual targeting hợp lệ; recipient snapshot/edits H-12 |
| 49 | AssignmentRecipient → assignment_recipients; 1463 / 246 | assignment+student UQ cả revoked; enrollment? đúng student; deadlineOverride?/revoked? | R: chưa chứng minh class eligibility; frozen identity H-01/12 |
| 50 | Submission → submissions; 1489 / 247 | recipient UQ; currentVersion? FK buộc chính submission | R: nullable phá vòng insert đúng; current pointer monotonic/CAS H-12 |
| 51 | SubmissionVersion → submission_versions; 1510 / 248 | submission+versionNo UQ; answerText?/contentHash?; SUBMITTED enum | R: append-only chưa enforced; file links cũng phải freeze H-12/20 |
| 52 | StoredFile → stored_files; 1536 / 249 | uploader FK; tenant+privateKey UQ; size BigInt; MIME/hash text | R: ownership/READY/bytes H-13; physical namespace M-06 |
| 53 | SubmissionFile → submission_files; 1561 / 250 | version/file tenant FKs; pair UQ; sortOrder SmallInt | R: owner/status/count không suy từ FK H-13; immutable attachment set H-20 |
| 54 | Grade → grades; 1580 / 251 | version+revision UQ; teacher FK; score D(3,1); publishedAt?/reason? | R: đúng version FK; latest/scope/draft visibility/CAS H-12 |
| 55 | ApprovalRequest → approval_requests; 1607 / 259 | policy required; requester?; target polymorphic UUID; decidedAt?; status/target/correlation indexes | R: target/decision/execute lock H-19; finance H-08 |
| 56 | ApprovalDecision → approval_decisions; 1644 / 260 | request+decider tenant FKs; selfApproved Boolean; timeline indexes | R: append-only, đồng bộ state, exception theo operation H-19/20 |
| 57 | AutomationJob → automation_jobs; 1666 / 261 | operation UQ; idempotency chỉ index; policy required; actor?/trigger?/lease? | R: attempt/lease/CAS fencing H-15; typed hash H-16 |
| 58 | JobAttempt → job_attempts; 1703 / 262 | job+attemptNo UQ; finishedAt?/error?; outcome text | R: bounded attempts; finalize append semantics H-15, M-07 |
| 59 | IdempotencyRecord → idempotency_records; 1723 / 263 | tenant+operationType+key UQ; requestHash; resultRefType?/id?/expires? | R: dedup identity tốt; reservation/replay/hash/retention H-16 |
| 60 | OutboxEvent → outbox_events; 1746 / 264 | tenant+eventKey UQ; polymorphic aggregate; status/available indexes | R: atomic producer, crash recovery, no duplicate effects H-15/16 |
| 61 | Notification → notifications; 1776 / 265 | event+recipient+kind UQ; recipient tenant FK; readAt?; inbox indexes | R: đúng P0 kinds, dedup tốt; current visibility H-11/15 |
| 62 | AuditLog → audit_logs; 1800 / 266 | user?/membership?/policy?; actorKind; JSONB?; tenant/entity/correlation indexes | R: actor consistency/redact/retention H-14; immutable H-20 |

**Không phải thiếu models P0:** `PlatformStaffGrant` còn proposal (`database_design.md:145`); `BillingSourceSnapshot` là bảng tùy chọn có thể gộp snapshot line (`:212`); dashboard là query, không phải ba bảng KPI (`:363`). Không yêu cầu thêm bảng P1. **Counter invoice là capability còn thiếu**, không che giấu trong kết luận “đủ 62 models” (M-05).

## C. Findings — Severity trước, Domain sau

Mỗi entry có đủ evidence, rule, counterexample, impact, fix, migration implication, loại và confidence. “Missing enforcement” nghĩa là constraint/service protocol chưa được hiện thực/chứng minh trong phạm vi schema-first; không gọi thiếu service là bug implementation. Mọi khuyến nghị đều **PROPOSED**, chưa triển khai/chưa phê duyệt.

### H-01 — High — Academic: đúng tenant/student chưa đủ để chứng minh đúng lớp và transfer

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:701, 738, 949, 1478; nguồn `docs/design/database_design.md:167`, `:168`, `:181`, `:246`; `docs/design/detailed_design.md:171` (UC-10/Q-03).
- **Invariant / phản ví dụ:** enrollment A của student X/class C1, enrollment B của student Y/class C2. Transfer A→C2 có thể trỏ B: target FK chỉ buộc C2, không buộc X. REGULAR participant của X ở session C2 có thể trỏ enrollment X/C1 hoặc NULL. Recipient assignment C2 có thể dùng enrollment X/C1. Lineage X→X có thể tự tham chiếu hoặc tạo cycle, dù không đổi student.
- **Impact:** sai roster/quyền Teacher, chuyển lớp sai người, nguồn billing không đáng tin. Không kết luận FK cross-tenant bị hở.
- **Fix:** coordinator xác minh source/target student, prior/source lineage, target class, interval và tương lai; khóa source enrollment + target class/capacity + sessions/resources liên quan. Có thể thêm candidate/FK mang student vào transfer, class vào participant/recipient hoặc SQL trigger; chọn cách materialize cần review thiết kế. Self-lineage CHECK được, cycle nhiều hàng cần service/trigger.
- **Migration:** E-08/09; củng cố FK cần cột/key bổ sung hoặc trigger, không thể giải quyết bằng một index time thông thường. Test T-04/05.

### H-02 — High — Attendance: finalization có thể thuộc buổi khác

**Loại:** confirmed defect (khoảng hở mô hình quan hệ). **Confidence:** High.

- **Evidence:** S:1045–1056; finalization session tại S:1022/1036; nguồn `docs/design/database_design.md:191–192`, `:279`; `docs/requirements/usecase/specification.md:649–657`.
- **Invariant / phản ví dụ:** tenant T có participant P/session S1 và finalization F/session S2. Record `(T,P,F,ATTENDED)` thỏa cả FK participant và finalization; không có cột/key nào buộc S1=S2. F có thể do Teacher S2 xác nhận khi S1 chưa xác nhận.
- **Impact:** billing/query chỉ kiểm `finalizationId != NULL` có thể thu từ attendance chưa được xác nhận đúng buổi; Teacher authority và khóa 48 giờ bị tính sai.
- **Fix:** phương án declarative: materialize `sessionId` trong record; FK `(tenant,session,participant)` và `(tenant,session,finalization)` tới candidate tương ứng. Hoặc trigger kiểm join session cho cả INSERT/UPDATE và bảo vệ thay đổi parent. Service vẫn cần kiểm cả batch/actor.
- **Migration:** E-13, rà dữ liệu trước khi ADD/VALIDATE FK; NULL finalization vẫn cho draft. Không dùng CHECK với subquery. Test T-09.

### H-03 — High — Attendance: tính đầy đủ, quyền duyệt và khóa phải được serialize với ISSUE

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:989–1094; nguồn `docs/requirements/usecase/specification.md:657`, `:700`, `:708`; `docs/design/detailed_design.md:211–216` (BR-04/Q-05).
- **Invariant / phản ví dụ:** tạo finalization không có records hoặc còn một participant chưa điểm danh vẫn hợp lệ; EXCUSED không có approved absence; requester=approver vẫn lưu được. Correction A đọc revision r và ISSUE B đọc cùng r; A commit sau B nếu không chung lock thì issued snapshot và attendance diverge. `lockedAt=NULL` không có nghĩa chưa tới 48 giờ.
- **Impact:** thu sai 0/1 buổi, tự duyệt nghỉ trái UC-16, sửa thường sau khóa và history không khớp.
- **Fix:** lock session/finalization/roster ổn định, kiểm đủ active participants và Teacher scope; đơn sớm vẫn phải duyệt, đơn muộn cần permission ngoại lệ, **người gửi không tự duyệt absence dù BR-11 cho self-approval ở operation khác**. Tính khóa từ `min(end+48h, issue sử dụng nguồn)` ngay khi command chạy; correction compare oldStatus+revision, append correction/audit và follow-up financial request nếu cần. ISSUE và correction/participant changes phải dùng cùng giao thức khóa.
- **Migration:** E-12–14, E-37; active absence predicate chờ status decision. Không đặt CHECK phụ thuộc `now()` để “tự khóa”. Test T-10–12.

### H-04 — High — Billing: invoice line không chứng minh đúng student/period/price target

**Loại:** confirmed defect (student/period relation gap); price selection là service responsibility. **Confidence:** High.

- **Evidence:** S:1184–1202, 1226–1245, 955–957; nguồn `docs/design/database_design.md:280–281`; `docs/design/detailed_design.md:226`; `docs/requirements/usecase/specification.md:973–976`.
- **Invariant / phản ví dụ:** invoice I của X/tháng 09; P là participant của Y, session tháng 08, cùng T; A là attendance của P. Line `(T,I,P,session(P),A)` thỏa mọi FK hiện có. `Invoice.billingRun` bốn cột không nối sang `P.studentId`. Tương tự price rule của course không liên quan vẫn là FK hợp lệ. Unique claim chỉ ngăn trùng P, không chứng minh P đúng invoice.
- **Impact:** tính phí người khác/kỳ khác, đọc invoice có thể lộ nguồn của student ngoài scope.
- **Fix:** ưu tiên FK bổ sung `studentId` trên line nối cả invoice và participant qua candidate keys, hoặc trigger cross-row với parent identity immutable; service kiểm ngày session trong `[period.monthStart,monthEnd)` theo tenant timezone đã pin. Chốt trường thời gian làm căn cứ khi buổi vượt nửa đêm/cuối tháng; không tự chọn. Price phải thuộc session→class→course và hiệu lực đúng ngày, recheck precedence dưới giao thức nguồn.
- **Migration:** E-17/18; có thể cần thêm cột/key sau review. Period containment là cross-table/timezone, không suy từ FK student. Test T-14/15/17.

### H-05 — High — Billing: số tiền, trạng thái ISSUE và sibling một lần chưa được ràng buộc

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1132–1134, 1186–1195, 1231–1236, 1262–1274; nguồn `docs/design/database_design.md:202–206`, `:217–229`; `docs/requirements/usecase/specification.md:937–944`, `:992` (Q-08/09).
- **Invariant / phản ví dụ:** ISSUED với number/issuer/issuedAt/dueAt NULL; line units=2 hoặc amount âm; total khác gross−discount đều hợp lệ PSL. Hai discounts `(I,SIBLING,sequence=1)` và `(I,SIBLING,sequence=2)` cùng rate 0.10 không đụng unique: enum chỉ một kind không giới hạn số lần áp dụng. Period 15/09→15/10 vẫn unique monthStart.
- **Impact:** hóa đơn không truy vết người phát hành, thu sai tiền/kỳ và giảm nhiều lần.
- **Fix:** CHECK monthly boundaries, nonnegative amounts, units∈{0,1}, base=unit×units, header total=gross−discount và issue metadata shape; UQ `(tenant,invoice,kind)` cho SIBLING P0 và rate=0.10 theo pinned baseline. Aggregates header↔lines, evidence/enrollment eligibility, status mapping 0/1 và HALF_UP **chỉ cuối công thức** kiểm dưới ISSUE transaction; SQL trigger là defense bổ sung. DiscountVnd=gross−roundedNet, không ROUND riêng từng raw discount rồi trừ.
- **Migration:** E-15/16/19/20; cần quyết định metadata của CANCELLED đã từng issue/draft cancel trước khi viết predicate. Giữ số cũ sau cancellation. Test T-13/16/18.

### H-06 — High — Billing: claim là at-most-once, không chứng minh ISSUE đầy đủ và nguồn không đổi

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1156, 1195, 1236, 1278–1294; nguồn `docs/design/database_design.md:207`, `:231`, `:321`, `:347`; UC-24 tại `docs/requirements/usecase/specification.md:1026`.
- **Invariant / phản ví dụ:** ISSUE I không insert claim nào vẫn hợp lệ; claim của DRAFT cũng hợp lệ. Khóa các lines/sources hiện có không chặn một participant hoặc price override mới được thêm trong lúc ISSUE (phantom) nếu writer không cùng giao thức. Hash đơn lẻ không tái tạo được dữ liệu nguồn cũ.
- **Impact:** hóa đơn thiếu nguồn/không chống phát hành trùng ở write path bỏ claim, hoặc ISSUE số đã stale; khả năng giải thích retry kém.
- **Fix:** ISSUE lock logical run+invoice và domain anchors (student/period, session/roster, pricing targets theo thiết kế được review); re-read đầy đủ, so revision/hash, claim **mọi line kể cả zero** theo danh mục đã chốt, freeze snapshot + issuer/number/audit trong một transaction. Thay đổi nguồn phải phối hợp khóa, hoặc isolation có predicate protection và retry. JSON snapshot có schema/version chứa IDs/revisions/giá/policy/evidence/timezone/reasons; không coi JSON type là validation.
- **Migration:** E-21/28/37; completeness có thể constraint trigger deferred, nhưng trigger cũng cần giao thức đồng thời. BillingSourceSnapshot không bắt buộc nếu JSON đủ và frozen; xem O-04. Test T-17/19/20.

### H-07 — High — Billing: allocation/reversal chưa chứng minh bảo toàn tiền hoặc chặn concurrent overpay

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1334, 1346–1351, 1362–1377, 1389–1402; nguồn `docs/design/database_design.md:209–211`, `:222–226`, `:231`, `:348`; `docs/requirements/usecase/specification.md:1065–1073`.
- **Invariant / phản ví dụ:** payment=100, allocation=1 hoặc không allocation; reversal=1 đều không vi phạm FK/UQ, dù P0 yêu cầu allocate toàn bộ và full reversal. Hai transactions đọc due=100 cùng ghi payment=80 với hai key khác nhau => 160 nếu chỉ preflight. Payment có thể gắn DRAFT invoice.
- **Impact:** collected/outstanding lệch, overpayment hoặc xóa hiệu lực cả 100 khi reversal chỉ ghi 1.
- **Fix:** CHECK amounts>0; enforce allocation=payment.amount và reversal=payment.amount bằng candidate key+FK mang amount hoặc trigger/transaction. Exactly-one allocation tại commit cần deferred guard hoặc write protocol, không chỉ unique (unique là at-most-one). Mọi payment/reversal/adjustment dùng chung lock Invoice, tính ledger sau lock, kiểm financial-effective status, idempotency hash, append payment+allocation/reversal+audit atomically. Đảo full thì allocations mất hiệu lực qua query, không trừ reversal thêm lần nữa.
- **Migration:** E-22/23/37; không CHECK tổng ledger bằng subquery. Test T-21–24.

### H-08 — High — Billing: approval target, approved payload và excess không được nối bằng FK hiện tại

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1303–1324, 1366–1377, 1411–1431, 1610–1617; nguồn `docs/design/database_design.md:208`, `:237–238`; `docs/requirements/usecase/specification.md:1098–1117` (BR-11).
- **Invariant / phản ví dụ:** adjustment APPLIED trỏ request PENDING_APPROVAL hoặc request của invoice khác cùng tenant; hai adjustment khác operationKey dùng cùng approval và áp hai lần. Payload được duyệt −10 nhưng delta lưu −100. Excess cùng triggerAdjustment được ghi hai operationKey; nhiều lần giảm liên tiếp có thể cộng lặp số excess tích lũy (ví dụ paid=100, net 100→80→70, ghi 20 rồi 30 => sai 50 thay vì 30).
- **Impact:** thực thi tài chính chưa được duyệt/khác nội dung duyệt, dư phải xử lý bị nhân hoặc stale sau reversal/adjustment tăng.
- **Fix:** lock approval+invoice; bind operation/target/payload hash/policy/amount với authorized domain change; compare state và execution identity duy nhất để chỉ một business effect/request. Kiểm adjusted total hợp lệ sau mọi APPLIED adjustment; snapshot baseline trước/sau. Excess cần semantics approved là delta-event hay current-case, đối soát với ledger khi reversal/adjustment tiếp theo; không tự refund/credit.
- **Migration:** E-24/25/29; uniqueness approval execution và triggerAdjustment phụ thuộc cardinality được review (không tự đặt global UQ approval trên mọi child). Lifecycle còn O-05–07. Test T-25–28.

### H-09 — High — Billing / Scheduling: no-overlap cần SQL PostgreSQL, chưa có lớp bảo vệ cuối

**Loại:** missing enforcement, **không phải lỗi cú pháp Prisma**. **Confidence:** High.

- **Evidence:** S:963–985, 1097–1126; nguồn `docs/design/database_design.md:182–184`, `:236`, `:294–309`; `docs/architectural/architectural_design.md:284–286` (BR-01/Q-08).
- **Invariant / phản ví dụ:** cùng resource có hai ACTIVE booking 08–10 và 09–11; cùng course có hai price rules hiệu lực chồng nhau. B-tree indexes hiện tại không từ chối hai INSERT đồng thời.
- **Impact:** double booking hoặc giá mơ hồ khi billing.
- **Fix:** `btree_gist`; GiST exclusion `(tenant_id WITH =,resource_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE status='ACTIVE'`. Price dùng **ba exclusions có predicate theo scope/target non-NULL**, equality tenant+target và `daterange(effective_from,effective_to,'[)') &&`; NULL end là unbounded. Cần target CHECK trước để không lọt qua NULL keys. Khóa giao dịch vẫn cần cho capacity/completeness/roster.
- **Migration:** E-07/11/16; verify UUID GiST operator class, extension quyền cài trên target PostgreSQL và SQLSTATE 23P01. Không nói đã test. Test T-02/03/15.

### H-10 — High — IAM: bảo vệ Manager cuối phải bao phủ global User và các đường thu hồi quyền

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:284, 350, 425–465; nguồn `docs/requirements/requirements_analysis.md:222`; `docs/design/database_design.md:152`, `:275`; `docs/design/detailed_design.md:355` (BR-10).
- **Invariant / phản ví dụ:** hai Manager mỗi người thấy “còn một người khác” rồi đồng thời revoke chính mình. Disable global User có thể loại Manager cuối của **nhiều tenants**, dù không xóa membership role; revoke TENANT scope hoặc permission seed cũng có tác động tương tự.
- **Impact:** tenant ACTIVE không còn Manager hợp lệ hoặc hệ thống dùng membership nhưng quên global DISABLED.
- **Fix:** định nghĩa Manager hợp lệ gồm User+membership active, role grant chưa revoked, permission/scope cần thiết; serialize bằng tenant anchor và lock nhiều tenant theo thứ tự khi mutate global User. Mọi disable/revoke/leave/scope/seed mutation cùng kiểm tra. Activation chỉ làm tenant ACTIVE khi có Manager hợp lệ; không public bootstrap.
- **Migration:** E-04, E-37; cross-row invariant service/transaction, có thể constraint trigger nếu cùng lock protocol. Không đề nghị CHECK đếm Managers. Test T-01.

### H-11 — High — IAM / Security: tenant FK không chứng minh authorization và các scope/link còn thiếu shape guards

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:321, 443–487, 503/529, 752–798; nguồn `docs/design/database_design.md:141–150`, `:274–276`, `:354–359`; UC-36 tại `docs/requirements/usecase/specification.md:1499`.
- **Invariant / phản ví dụ:** scopeKind=TENANT nhưng classId/studentId có giá trị hoặc CLASS không có class; nhiều active grants/link/pair. `AuthSession.activeTenantId` trỏ tenant không có membership của user. Same-tenant Teacher/parent actor FK không buộc có permission/class/student scope; parent unverified vẫn là row hợp lệ.
- **Impact:** service suy role/tenant FK là quyền có thể mở rộng quyền/IDOR. SELECT thiếu tenant filter không được FK ngăn cản.
- **Fix:** CHECK scope exact shape, active partial UQ grants/parent/sibling, UUID sibling order, parent verifier/time pair. Service kiểm user+membership+permission+scope hiện hành, phân công Teacher, own Student, verified active Parent link ở mỗi API/job/read/notification; không default tenant scope khi grant không có scope. Scope union phải gắn **permission với đúng grant có scope**, không lấy permission từ role A cộng tenant scope của role B. Normalize email trước uniqueness; refresh/tenant switch kiểm membership.
- **Migration:** E-01–06; RLS tùy chọn theo kiến trúc, không coi thiếu RLS là defect. Tenant-aware repository và cross-tenant **read** tests bắt buộc. Test T-06–08.

### H-12 — High — Learning: snapshot recipient, latest version và grade visibility cần giao thức chung

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1436–1532, 1580–1602; nguồn `docs/design/database_design.md:245–251`; `docs/requirements/usecase/specification.md:1190`, `:1202–1203`, `:1231–1241`.
- **Invariant / phản ví dụ:** currentVersion đổi về version cũ vẫn FK hợp lệ. Teacher publish grade V1 đồng thời Student thêm V2; cả hai qua check “latest/chưa chấm” trước ghi. Recipient.studentId có thể bị đổi trong cùng tenant làm submission lịch sử đổi owner. API lấy max revision không filter PUBLISHED sẽ lộ draft.
- **Impact:** chấm nhầm bản, mất lịch sử giao bài/chủ sở hữu, lộ điểm nháp hoặc nộp sau khi đã chấm.
- **Fix:** khóa Submission/recipient chung cho submit/grade/publish, allocate versionNo dưới lock, CAS currentVersion+status; khóa Assignment khi publish/đổi deadline. Identity recipient/assignment/student/enrollment và published content phải giữ snapshot/history; reassign chỉ explicit workflow có audit. Read latest **published** revision, draft mới không che published cũ. Kiểm Teacher assignment, student/parent scope hiện hành; deadline override và lateWindow dùng server time. Điều kiện draft grade khóa resubmit chờ O-08.
- **Migration:** E-26/28/37; CHECK score/priority/revisions, immutable identity/attachments, trigger published transitions; không thêm “latest valid” FK giả. Test T-29–31.

### H-13 — High — Files: FK cùng tenant vẫn cho gắn file người khác, file chưa READY và vượt giới hạn

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1539–1575; nguồn `docs/design/database_design.md:249–253`; `docs/design/class design/file-management.md:223`, `:227–232`; UC-28 tại `docs/requirements/usecase/specification.md:1197`.
- **Invariant / phản ví dụ:** student X gắn `fileId` READY của Y trong tenant T vào version của X; hoặc gắn STAGING/ORPHANED. Sáu file khác nhau đều qua pair UQ; hai transactions từ count=4 cùng thêm một file => 6.
- **Impact:** lộ bài làm/PII cùng tenant, nộp tham chiếu bytes không sẵn sàng, vượt policy.
- **Fix:** kiểm uploader/owner qua Student membership của recipient; parent không có quyền nộp/upload thay mặc định. Lock version và files khi finalize, kiểm READY + ownership + count≤5; validate stream bytes/MIME/checksum/size thật ở upload, không tin metadata. Download private qua scope của submission và trạng thái bytes. Orphan cleanup lock/recheck references ngay trước delete; không xóa file vừa được link.
- **Migration:** E-27/28/38; MIME/size CHECK hỗ trợ metadata, không chứng minh MIME thực. Không có distributed transaction Volume–DB. Test T-32–34; 10MB byte convention O-09.

### H-14 — High — Operations / Audit: identity actor, dữ liệu nhạy cảm và retention chưa được bảo vệ

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1803–1828; nguồn `docs/design/database_design.md:266`, `:286`, `:358–359`; `docs/design/detailed_design.md:265`; Q-14 `docs/requirements/usecase/specification.md:1769`.
- **Invariant / phản ví dụ:** actorUser U1 + membership M2 của U2 vẫn thỏa hai FK; actorKind USER với cả hai NULL vẫn lưu được. JSON before/after có thể chứa OTP/token. DELETE log trước 24 tháng không bị FK/không có updatedAt ngăn lại.
- **Impact:** attribution giả, lộ secret/PII, mất căn cứ tài chính/phê duyệt.
- **Fix:** CHECK shape theo loại actor sau review (worker/operator không buộc giả membership), trigger hoặc FK `(tenant,membership,user)` khi có cả hai. Audit cùng business transaction; allowlist/redact **trước INSERT**, snapshot hash/reference cho dữ liệu không được phép log. Separate migration/runtime/retention roles, append-only; retention tối thiểu 24 tháng với backup/restore, partition detach/export cũng là thao tác retention phải kiểm soát.
- **Migration:** E-30/31/35; không tự thêm platform grant P1 hay legal retention rule ngoài baseline. Test T-38/39.

### H-15 — High — Operations / Jobs: lease hết hạn không tự ngăn stale worker; outbox PROCESSING cần recovery

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1676–1719, 1755–1769; nguồn `docs/design/detailed_design.md:261`; `docs/design/database_design.md:261–264`; BR-12 `docs/requirements/requirements_analysis.md:224`.
- **Invariant / phản ví dụ:** W1 nhận lease rồi pause; lease hết, W2 nhận lại; W1 resume và commit result/side effect sau W2 nếu không fencing/CAS+business dedup. Dispatcher đánh PROCESSING rồi chết; outbox không có leaseOwner/leaseUntil, `updatedAt` đơn độc chưa định nghĩa reclaim protocol.
- **Impact:** business effects trùng hoặc job/event mắc kẹt, alert không đến Manager.
- **Fix:** claim atomically `FOR UPDATE SKIP LOCKED`, attempt count/token tăng và conditional completion với owner/token+valid lease; **business effect cũng** phải lock/check token hoặc domain idempotency trong cùng transaction. Lease alone không exactly-once. Outbox chọn giữ row lock trong transaction consumer DB ngắn, hoặc persistent lease/recovery/fencing được review; nếu dùng timeout updatedAt phải có CAS/generation và contract rõ. No external I/O under long DB lock. Consumer notification dedup hiện có là đúng; recheck scope khi phát/đọc.
- **Migration:** E-32–34/37; nếu chọn new lease/generation columns cần review, không tự thêm. Attempt 1..4, delays 1/5/15 phút; transient retry khác NEEDS_INFORMATION/PENDING_APPROVAL. Test T-35–37.

### H-16 — High — Operations / Idempotency: unique key chưa buộc fingerprint, authorization và atomic effect

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1340/1351, 1669–1697, 1723–1741; nguồn `docs/design/database_design.md:263`, `:285`; `docs/design/api_specification.md:420`, `:461–473`; BR-14 tại `docs/requirements/requirements_analysis.md:226`.
- **Invariant / phản ví dụ:** cùng Payment key đổi amount/invoice, service trả record cũ mà không so requestHash => hành vi trái contract. Cùng job idempotency key, hai operationKey khác nhau không bị job unique chặn. Reserve key commit riêng, business effect commit rồi crash trước result => retry có thể nhân effect. Replay response cho actor đã mất scope có thể lộ dữ liệu.
- **Impact:** request bị gán nhầm kết quả, effect trùng hoặc key kẹt; rò rỉ qua replay.
- **Fix:** operationType rõ ràng, fingerprint canonical gồm target/payload nghĩa nghiệp vụ, conflict nếu khác hash; reserve/result + domain effect cùng transaction hoặc state machine recoverable với domain unique. Authorization hiện hành cả khi replay. Không bắt buộc thêm unique đơn lẻ AutomationJob.idempotencyKey vì key còn cần operation namespace; bind sang record typed trong coordinator. Expiry không xóa key tài chính nếu chưa chứng minh domain dedup vĩnh viễn.
- **Migration:** E-33/34/36; operationKey text không tự chứng minh canonicalization. Test T-20/21/35/40.

### H-17 — High — Scheduling: booking chưa chứng minh đúng resource/time, đủ roster hay capacity

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:822–843, 871–985; nguồn `docs/design/database_design.md:177–184`, `:321`; `docs/design/detailed_design.md:179–205` (BR-01/Q-04).
- **Invariant / phản ví dụ:** confirmed session teacher A nhưng booking resource B hoặc 01–02 thay vì 08–09; no booking cũng hợp lệ. Unavailability đúng resource FK nhưng booking range khác nguồn. registry kind=TEACHER nhưng studentId có giá trị/không target. Hai enrollment/participant commands tranh chỗ cuối chỉ lock hai Student resource khác nhau, vẫn có thể vượt cùng class capacity. Series hơn 6 tháng hoặc weekday=9 không bị PSL ngăn.
- **Impact:** GiST dù được thêm vẫn không bảo vệ lịch thật nếu booking sai/thiếu; overcapacity và partial confirm.
- **Fix:** CHECK source XOR/kind exact shape/valid times/room/revisions/weekly bounds. Coordinator lock class/capacity anchors + sessions và **hợp các old/new resources** theo thứ tự ổn định; re-read participants/enrollment/Teacher/room eligibility; đủ booking mọi teacher/student/onsite room và confirmed unavailability, đúng interval/identity. Cancel release atomically; reschedule release old+rebook new trong một transaction; cả series all-or-nothing, rollback mọi booking/audit/outbox nếu occurrence bất kỳ fail. Serialize roster edits với confirmation và completion; không release lịch sử COMPLETED nếu vẫn cần conflict history.
- **Migration:** E-07–11/37; row trigger/deferred guard có thể hỗ trợ completeness nhưng không thay count/authorization locks. Khóa lựa chọn chưa chốt O-01; không mở MAKEUP P1. Test T-02–05.

### H-18 — High — Sources: bản Requirements hiện có không chứa Q/integration sections được viện dẫn

**Loại:** confirmed defect (đầy đủ/provenance tài liệu, không phải schema syntax). **Confidence:** High về nội dung thiếu; không kết luận trạng thái merge remote.

- **Evidence:** `docs/requirements/requirements_analysis.md:11`, `:293–295`, EOF line 296; `docs/requirements/usecase/specification.md:1752` dẫn Requirements §7/§8; `docs/ai/DECISION_REGISTER.md:10`; model chịu ảnh hưởng là toàn bộ P0, đặc biệt S:329, 871, 1180, 1510/1580 theo Q-01/04/08/11.
- **Invariant / phản ví dụ:** reviewer theo Q-08 về 7 ngày/rounding trong nguồn ưu tiên cao nhất không thể tìm mục 7 dù changelog tuyên bố v5. “v5 đã đồng bộ đầy đủ” không được chứng minh bằng header.
- **Impact:** không thể sign-off nguồn đầy đủ hay giải quyết mọi conflict theo precedence đã yêu cầu.
- **Fix:** chủ dự án xác nhận/khôi phục bản Requirements đầy đủ trong task tài liệu riêng; audit này dùng UC Q + BR hiện có và ghi rõ giới hạn, không tự sửa nguồn/đổi ý nghĩa. Không cần dừng việc phân tích độc lập an toàn.
- **Migration:** governance blocker trước sign-off chính thức; không SQL fix. Test T-41 (source completeness/review). Không gọi web/Library để tự thay bản branch.

### H-19 — High — Workflow: approval state/decision và execution phải được serialize theo operation

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:1607–1661; nguồn `docs/design/detailed_design.md:113–125`, `:257`; `docs/requirements/usecase/specification.md:1433–1449`; BR-08/11/14 tại `docs/requirements/requirements_analysis.md:220–226`.
- **Invariant / phản ví dụ:** approve/reject đồng thời đều append decision vì không unique trên “current decision round”; request chuyển COMPLETED không có effect; request payload bị sửa sau approve; requester NULL làm selfApproved không thể suy ra. Permission approval.decide không chứng minh quyền tài chính trên target.
- **Impact:** quyết định trái nhau, self-approval sai operation hoặc effect chưa được phép.
- **Fix:** lock request, CAS expected state, validate target resolver/tenant/operation/scope và snapshot immutable sau submit/decision; giữ history REQUEST_INFO/resubmit nên **không** global unique approvalRequestId trên decisions. Kiểm selfApproved khớp APPROVE/requester=decider và policy: tài chính một Manager hợp lệ ngoại lệ thủ công; absence cấm requester self-approve. APPROVED chỉ quyết định; COMPLETED cùng commit domain effect; async giữ APPROVED/job pending đến thực thi. Recheck authorization hiện hành tại execute.
- **Migration:** E-29/37; trạng thái hợp lệ trong enum không chứng minh transition hợp lệ. Sync/async O-07. Test T-27/28.

### H-20 — High — Xuyên domain: Restrict delete và không có updatedAt không bảo đảm history bất biến

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:263–276, 1179–1294, 1298–1402, 1509–1575, 1579–1603, 1643–1661, 1799–1829; nguồn `docs/design/database_design.md:23–24`, `:231`, `:248–251`, `:286`, `:358`; FR-31/41 tại `docs/requirements/requirements_analysis.md:144`, `:168`.
- **Invariant / phản ví dụ:** UPDATE payment.amount/claim.participant/PolicyVersion.config/published Grade.score, DELETE unreferenced audit/decision đều không bị `onDelete: Restrict` bảo vệ row đó. SubmissionVersion.answer bất biến nhưng thêm/xóa SubmissionFile sau nộp vẫn đổi nội dung bài. Sửa studentId/sessionId/tenantId của các parent/child có thể làm history đổi nghĩa trong cùng tenant; không có onUpdate explicit.
- **Impact:** làm mất chứng cứ hoặc thay số tiền/owner sau phát hành/nộp/chấm mà history trông vẫn hợp lệ.
- **Fix:** ma trận mutable fields theo lifecycle + runtime DB role không DDL; REVOKE UPDATE/DELETE cho append-only, trigger conditional cho issued header/children, published grade, attachment set, immutable identities và policy. Cho phép các update cần thiết (draft, lease, readAt, currentVersion pointer) qua whitelist; không blanket freeze mọi bảng. Correction/reversal/revision là row mới; lifecycle cancellation được chốt riêng.
- **Migration:** E-28/30/35/36; tách migration owner/runtime/retention roles và test cả SQL trực tiếp, cascaded updates, nested writes. Test T-38/39.

### M-01 — Medium — Billing: Decimal(20,6) có dải hẹp hơn BIGINT VND

**Loại:** improvement (representability gap, chưa có max invoice được duyệt). **Confidence:** High.

- **Evidence:** S:1188–1190 vs S:1265; nguồn `docs/design/database_design.md:21`, `:206` giữ cùng lựa chọn type, không có business ceiling.
- **Invariant / phản ví dụ:** gross `1000000000000000` hợp BIGINT; sibling raw discount `100000000000000` (15 chữ số phần nguyên) vượt NUMERIC(20,6), chỉ có 14 chữ số nguyên. Phép nhân/tổng BIGINT còn có thể overflow dù từng unit hợp lệ.
- **Impact:** billing fail ở giá trị lớn hợp lệ về storage, không phải rounding mất tiền đã chứng minh.
- **Fix:** chọn max VND/units/total có review và validate trước phép tính, hoặc tăng precision raw discount đủ cho BIGINT cùng scale. JSON tiền dùng string, Decimal arithmetic, không JS number. Score 8.55 có thể bị DB cast thành một chữ số; API phải reject bước không hợp lệ trước cast.
- **Migration:** E-19/20/26; thay precision/caps cần owner review O-10, test T-18.

### M-02 — Medium — Foundation: CHECK scalar/temporal ngoài billing còn thiếu

**Loại:** missing enforcement. **Confidence:** High.

- **Evidence:** S:282, 302–338, 614–617, 666–667, 691–692, 875–879, 907, 1026/1050, 1443/1447, 1514, 1584/1585; nguồn `docs/design/database_design.md:134–136`, `:164–179`, `:245–251`.
- **Invariant / phản ví dụ:** attempts<0, expiry trước issue, capacity=0, interval ngược, versionNo=0, score=−1 vẫn có thể biểu đạt bằng scalar Prisma. UQ email text cho phép `A@x` và `a@x` nếu normalization không enforce.
- **Impact:** dữ liệu không thể sử dụng đúng bởi service/queries, account duplicates.
- **Fix:** constraints liệt kê **cụ thể** E-01/02/08/10/12/26/27/32; email lower/trim policy thống nhất với service; không áp arbitrary bounds cho sortOrder/status text chưa chốt. TTL dùng timestamp arithmetic theo baseline, không chỉ `expiry>created`; rate limit thời gian vẫn service.
- **Migration:** SQL CHECK/functional design, NOT NULL guards khi CHECK liên quan nullable; T-08/13/29/35.

### M-03 — Medium — IAM Bootstrap: assigner required không phải vòng FK bất khả thi nhưng thiếu actor semantics

**Loại:** open decision. **Confidence:** High.

- **Evidence:** S:449/458, 260/264; nguồn `docs/design/database_design.md:141`, `:152`; `docs/design/detailed_design.md:362`; `docs/ai/SCHEMA_REVIEW.md:127`.
- **Invariant / phản ví dụ:** membership đầu tiên đã INSERT thì grant có thể assignedBy chính membership đó dù chưa activate/chưa có quyền; FK không bế tắc, nhưng attribution nghiệp vụ chưa được duyệt. Policy creator NULL được schema cho phép.
- **Impact:** bootstrap hoặc giả danh actor tenant hoặc bị service guard chặn nếu không có ngoại lệ controlled Ops.
- **Fix:** review ngoại lệ controlled CLI tự-reference kèm operator audit, hoặc điều chỉnh thiết kế assigner nullable + operator provenance. Khuyến nghị ngoại lệ CLI hẹp có audit, không mở self-grant qua API. Không tự thay cột.
- **Migration:** O-11; thứ tự insert D.3, T-01. Không cần DEFERRABLE để giải quyết ý nghĩa actor.

### M-04 — Medium — Policy / Pricing: pinning còn cần effective selection và snapshot contract

**Loại:** open decision. **Confidence:** High.

- **Evidence:** S:256–259, 908, 1106–1108, 1155–1156, 1194–1195, 1614, 1672; nguồn `docs/requirements/requirements_analysis.md:226`; `docs/design/detailed_design.md:226`; `docs/design/class design/tenant-policy.md:186`.
- **Invariant / phản ví dụ:** cùng tenant hai PolicyVersion overlap; request pin không xác định version nào. Run policy P1, invoice policy P2 vẫn FK hợp lệ. Date/time của policy lấy ngày tạo charge còn price Detailed Design lấy ngày session; retry run theo tháng có thể âm thầm repin nếu service đổi field. Tenant timezone đổi làm period membership của session đổi.
- **Impact:** kết quả retry không lặp lại được hoặc áp hồi tố.
- **Fix:** immutable pin trên operation/retry; reconcile policy selection precedence/effective granularity, giá tại ngày session theo đề xuất DD nhưng không tự sửa BR. Nêu rõ draft recompute có phải cùng request hay operation mới và lưu version/source revisions/timezone đầy đủ. Policy overlap lower class design đã nói cấm nhưng không tự kéo mọi policy admin P1 vào P0; chọn baseline single-version P0 và gate thay version đến khi được duyệt.
- **Migration:** E-16/18/36, O-04/12; có thể EXCLUDE policy interval sau khi chốt dimension và semantics effectiveTo. Test T-17/40.

### M-05 — Medium — Billing / Workflow: counter và Group B chưa đủ để đóng migration design

**Loại:** open decision (bao gồm capability counter chưa hiện diện). **Confidence:** High.

- **Evidence:** S:1186/1193, 1366, 1413–1418, 1615; nguồn `docs/design/database_design.md:235` vs `:407–408`; `docs/ai/DECISION_REGISTER.md:48–50`; `docs/design/api_specification.md:555–559`.
- **Invariant / phản ví dụ:** UUID invoice+unique number không cấp sequence theo tenant/năm; dùng MAX+1 không khóa có thể cấp trùng/abort. RESOLVED không có kind/resolvedAt vẫn schema hợp lệ. Canceled invoice đã thu có thể bị query loại khỏi ledger nếu chỉ filter status.
- **Impact:** không thể sign-off numbering/due/reconciliation/cancellation/execution contracts.
- **Fix:** O-02–07 có phương án/trade-off/khuyến nghị và authority; logical counter per tenant/year **đã nêu Group A**, physical schema/format conflict vẫn cần review, không gọi requirement counter toàn bộ là chưa approved. 7 ngày baseline đã chốt; chỉ calendar semantics còn mở.
- **Migration:** E-24/25/29/39; chưa thêm model/counter/enum/endpoint. Test T-19/25–28.

### M-06 — Medium — Files: tenant UQ private key chưa chứng minh physical namespace cách ly

**Loại:** missing enforcement (storage contract). **Confidence:** Medium; chưa có storage adapter để kết luận exploit.

- **Evidence:** S:1540/1554; nguồn `docs/design/database_design.md:249`, `:253`; `docs/design/detailed_design.md:269`.
- **Invariant / phản ví dụ:** tenants A và B cùng `privateStorageKey='x'` vẫn hợp UQ. Nếu adapter coi key là raw path chung Volume thì có thể overwrite/read bytes tenant khác; nếu physical path có tenant prefix thì an toàn.
- **Impact:** collision/orphan deletion nhầm bytes tùy adapter; không phải FK tenant breach đã chứng minh.
- **Fix:** canonical physical namespace `(tenantId,randomKey)` do server tạo, create-exclusive/no overwrite, path containment; hoặc global random full key+global UQ nếu key là toàn path. Chốt một contract, bảo vệ downloads/cleanup/restore cùng cách resolve.
- **Migration:** E-38; có/không đổi unique tùy contract O-09. Test T-34.

### M-07 — Medium — Lifecycle: text status và transition details cần freeze trước CHECK/runtime

**Loại:** open decision. **Confidence:** High.

- **Evidence:** S:185, 350, 498, 524, 591, 615, 665, 725, 881, 997, 1134, 1154, 1494, 1710, 1729; nguồn `docs/design/database_design.md:32`, `:164`, `:190`, `:261–263`; `docs/design/class design/attendance-leave.md:210`.
- **Invariant / phản ví dụ:** typo status không bị DB reject; không thể viết chính xác active absence predicate khi chưa biết tập active states. JobAttempt nullable finishedAt với outcome chưa chốt gây hiểu sai “append-only” nếu cấm mọi UPDATE từ lúc start.
- **Impact:** records biến mất khỏi queues/filters hoặc active duplicates; lifecycle transition mâu thuẫn.
- **Fix:** approved state table per aggregate, required metadata và allowed transitions; phân biệt mutable execution row với immutable terminal attempt. **Không** tự chuyển tất cả status sang ApprovalStatus hoặc chọn tên mới. Partial UQ absence và status CHECK chỉ viết sau quyết định.
- **Migration:** E-03/12/29/32/36, O-13; có thể text+CHECK, không bắt buộc thêm enum. T-35/41.

### M-08 — Medium — P0 Boundary: enum chứa P1 không đồng nghĩa có quyền sử dụng P1

**Loại:** improvement. **Confidence:** High.

- **Evidence:** S:32, 64, 940; nguồn `docs/design/database_design.md:181`, `:377–383`; `docs/design/detailed_design.md:131`, `:220`; `docs/requirements/requirements_analysis.md:129–133`.
- **Invariant / phản ví dụ:** MAKEUP participant không cần origin leave/right model; SUSPENDED enrollment không có suspension policy. Enum cho phép lưu, nhưng không đủ để bật workflow.
- **Impact:** generic status endpoint/direct input có thể vô tình mở P1 thiếu kiểm soát/không double-charge.
- **Fix:** command allowlist/default deny P1, P0 participants REGULAR theo baseline; giữ enum đã thiết kế nếu cần nhưng không expose mass-assignment/generic status transition. Không yêu cầu thêm model học bù/bảo lưu.
- **Migration:** cân nhắc P0 gate CHECK chỉ sau review vì sẽ cần thay khi mở P1; service allowlist bắt buộc. Test T-05/41.

### L-01 — Low — Index / Maintainability: candidate superkeys phục vụ FK khác với index trùng thật

**Loại:** improvement. **Confidence:** High về redundancy logic; hiệu năng chưa benchmark.

- **Evidence:** S:1170–1175, 1212–1219, 1291–1294, 1398–1402, 1503–1505; nguồn `docs/design/database_design.md:338`.
- **Invariant / phản ví dụ:** UQ `(tenant,participant,line)` trên claim là superkey khi participant và line đã riêng UQ; UQ allocation `(tenant,payment,invoice)` logic dư khi `(tenant,payment)` UQ; UQ Invoice `(tenant,billingRun,student,period)` chưa được relation nào tham chiếu. Ngược lại BillingRun bốn cột, Enrollment student/id và Payment id/invoice là **đích FK thật**, không được xóa vì “id đã unique”. Invoice index `(tenant,student,period)` không tương đương index UQ `(tenant,period,student)` cho student queries.
- **Impact:** thừa write/storage cost, migration noise; không phải data-corruption blocker.
- **Fix:** inventory dependency và EXPLAIN trên fixture PostgreSQL trước bỏ index. FK phía referencing không tự tạo index ở PostgreSQL; xem actor/policy/job lookups theo actual queries, không tạo mọi FK index theo thói quen.
- **Migration:** E-40; chỉ tối ưu sau correctness; T-42 chưa chạy. Không sửa schema trong audit.

## D. Cross-model integrity, tenancy và concurrency architecture

### D.1. Những đường FK bảo vệ được và không bảo vệ được

| Chuỗi / candidate keys hiện có | PostgreSQL sẽ bảo đảm khi FK được migrate đúng | Backend/transaction vẫn phải bảo đảm |
|---|---|---|
| Domain `(tenantId,targetId)` → UQ `(tenantId,id)` | Không lưu child có target tenant khác khi FK không NULL | Không chặn SELECT thiếu tenant filter; không chứng minh actor có quyền |
| Invoice `(tenant,run,student,period)` → BillingRun `(tenant,id,student,period)` | Invoice đúng student+period của run; run và invoice mỗi student/month duy nhất nếu period tháng chuẩn | Policy của invoice bằng policy pinned của run, không repin; period hợp lệ; đầy đủ nguồn |
| InvoiceLine `(tenant,session,participant)` → SessionParticipant `(tenant,session,id)` | Participant thuộc session ghi trên line | Student/period của invoice, price target/precedence, attendance finalized đúng session: H-02/H-04 |
| InvoiceLine `(tenant,participant,attendance?)` → AttendanceRecord `(tenant,participant,id)` | Nếu attendanceId có giá trị thì attendance thuộc participant đó | Attendance có finalization hợp lệ/đủ, revision snapshot đúng, missing attendance chỉ hợp nhánh cancelled đã chốt |
| Claim `(tenant,participant,line)` → InvoiceLine `(tenant,participant,id)`; UQ participant và line | Không claim sai participant của line; at-most-one claim/participant/line | Every issued line có claim; không claim draft; immutable claim khi cancel; không release để bill lại |
| Payment `(tenant,id,invoice)` là candidate; Allocation `(tenant,payment,invoice)` → Payment | Allocation và payment chung invoice; UQ payment ngăn nhiều allocations | Có allocation tại commit, amount bằng payment, payment invoice đã issue, no overpay |
| Reversal UQ `(tenant,payment)` | At-most-one reversal/payment | Full amount, authorized workflow, query loại allocations đúng một lần |
| Excess `(tenant,invoice,trigger)` → Adjustment `(tenant,invoice,id)` | Trigger adjustment thuộc đúng invoice | APPLIED/downward/đã duyệt; excess delta vs cumulative, xử lý sự kiện tiếp theo |
| Enrollment `(tenant,student,id)`; prior FK | Prior enrollment cùng student | No cycle, effective chronology, source/target transfer cùng student, future changes |
| Enrollment `(tenant,class,id)`; transfer target FK | Target enrollment đúng target class | Target student đúng source, valid interval/capacity |
| Series `(tenant,class,id)`; Session series optional FK | Có series thì phải cùng class | Expansion đúng weekday/timezone/≤6 tháng, sequence revision/occurrence identity |
| Unavailability `(tenant,resource,id)`; booking optional FK | Có unavailability source thì đúng resource | Source XOR, intervals bằng nhau, status và active booking đầy đủ |
| Submission.current `(tenant,id,currentVersion?)` → Version `(tenant,submissionId,id)` | Không trỏ version của submission khác | Latest valid/current pointer forward, no grade/resubmit race |
| Grade → Version; File link → Version/File; actor → Teacher/Membership | IDs tồn tại trong tenant | Teacher phụ trách, file owner/READY/count, không lộ draft, lịch sử attachment bất biến |
| Approval/Job/Audit → PolicyVersion cùng tenant | Policy record tồn tại và cùng tenant | Pinned effective version đúng request, config/hash bất biến, authorization hiện hành |
| Target/aggregate/result UUID trong Approval/Outbox/Idempotency/Audit | Chỉ đúng kiểu UUID; **không có FK đa hình** | Allowlisted resolver kiểm target type/tenant/existence/scope, stable payload/hash |

Candidate superkeys như `(tenant,id,student,period)` có `id` đã unique toàn cục nên không phải candidate key tối thiểu theo lý thuyết quan hệ; chúng là **unique reference keys cần thiết cho composite FK**. Không xóa chúng chỉ vì có UUID PK.

### D.2. Nullable composite FK, NULL uniqueness và referential actions

188 owning relations gồm 125 composite và 63 đơn cột; 43 owning relation optional. Không có relation tới key không unique được parser tĩnh phát hiện, và Prisma validate cũng đạt. Đây không phải phân tích đầy đủ SQL DDL/introspection.

- Với PostgreSQL FK mặc định `MATCH SIMPLE`, **bất kỳ thành phần referencing nào NULL thì FK đó không bắt kiểm tra tổ hợp**. Ví dụ `(tenantId,id,currentVersionId=NULL)` hợp lệ để tạo Submission container, `(tenantId,studentId,enrollmentId=NULL)` không chứng minh enrollment nào cả. Tenant FK riêng vẫn bắt tenant tồn tại; optional FK không biến `tenantId` thành nullable. Không đề nghị đổi toàn bộ sang MATCH FULL: tenant NOT NULL + target NULL là chủ đích phổ biến, MATCH FULL sẽ từ chối draft/optional links này.
- Composite FK optional khi ID **khác NULL** vẫn enforce đúng tenant và các thành phần không NULL khác; không có bằng chứng “NULL composite làm cross-tenant tùy ý” trong schema này. Nguy cơ là business field bắt buộc theo status nhưng đang NULL (ISSUED metadata, REGULAR enrollment, approved actor…); cần CHECK/status/transaction tương ứng.
- UQ nullable mặc định PostgreSQL cho phép nhiều NULL: nhiều Teacher/Student profiles chưa account, nhiều registry rows có teacherId NULL cho student/room, nhiều draft invoice number NULL là đúng. Không áp `NULLS NOT DISTINCT` đại trà vì sẽ chặn các trường hợp hợp lệ này. Active partial uniques khác với nullable UQ.
- `CHECK` chỉ reject FALSE; UNKNOWN do NULL có thể lọt. Shape predicates phải dùng `IS NULL/IS NOT NULL` rõ, ví dụ TENANT scope yêu cầu cả ID NULL; metadata ISSUED bắt `IS NOT NULL`, không chỉ so sánh thời gian/amount.
- Tất cả onDelete là Restrict: bảo vệ parent đang được tham chiếu, **không** cấm UPDATE/DELETE chính financial/audit row, không cấm thêm child vào issued header. Restrict không đồng nghĩa append-only.
- Schema không khai báo `onUpdate`; Prisma relational default dự kiến là Cascade. **Chưa generate DDL nên cần xác minh DDL thực tế** trước migration review. Cần cấm đổi identity/tenant của dữ liệu lịch sử hoặc thiết kế referential action rõ; trigger chỉ kiểm child INSERT không đủ nếu parent identity thay đổi. Sửa tenantId riêng lẻ có thể vướng nhiều FK; không kết luận mọi cascade đều thành công hay tạo cross-tenant row hợp lệ. Rủi ro cần bảo vệ là re-key/reattribute history.
- `@default(uuid())` và `@updatedAt` là cơ chế Prisma; không mặc định PostgreSQL sẽ có `gen_random_uuid()` hoặc trigger updated_at khi INSERT/UPDATE SQL trực tiếp. DDL/runtime contract phải nói rõ ai cấp UUID/time. Giữ UTC TIMESTAMPTZ là đúng; DB không giữ tenant timezone trong một instant. DATE/TIME không đại diện instant; server phải chuyển đổi đúng. TIMESTAMPTZ(6) có độ phân giải cao hơn JS Date; revision/CAS không dựa vào timestamp millisecond để duy nhất.

### D.3. Vòng quan hệ và thứ tự insert/bootstrapping

1. **Tenant/IAM:** Tenant chưa operational → global User pending → TenantMembership pending → PolicyVersion (creator NULL hoặc membership đã tồn tại) → roles/catalog/mapping → MembershipRole/AccessScope → operator audit. Grant Manager đầu tiên có thể trỏ assigner chính membership đã có; đây là open semantics M-03, không phải impossible insert. Commit bootstrap atomically; OTP delivery sau commit, kích hoạt identity/membership/tenant dưới giao thức Manager hợp lệ.
2. **Submission ↔ Version:** insert Submission với currentVersion NULL → insert Version chứa submissionId → update currentVersion bằng FK ba cột trong cùng transaction. Không cần disabling FK hay mandatory DEFERRABLE. Sau submit có thể cần terminal-state guard không cho container thành công nhưng pointer NULL.
3. **Enrollment lineage:** insert source trước, target sau; nullable prior giúp bắt đầu. Self-reference/cycle dài vẫn có thể thỏa FK; cần no-self và service chronology/cycle protection, không coi PostgreSQL FK là DAG check.
4. **Approval ↔ domain:** target UUID đa hình không tạo FK cycle vật lý; có thể preallocate domain ID → request → adjustment (approval required) trong một transaction. Phải có trạng thái “proposed target” hợp lệ được coordinator phân biệt với target đã tồn tại; không bypass resolver vì targetId là UUID. Requests cho invoice/transfer đã tồn tại có thể tạo trước domain effect bình thường.
5. **Outbox ↔ Job:** FK chỉ Job→Outbox; insert event trước job khi có triggerEvent. Không cần sequence đặc biệt cho tenant/system job không có event. Retention event phải tính Notification/Job FK Restrict, không DELETE blindly.
6. Tạo bảng theo module không đủ: FK AccessScope→Class/Student, Audit→Membership/Policy, Adjustment→Approval và Submission↔Version cần migration dependency ordering/ADD FK sau khi mọi bảng có mặt. Prisma sinh được schema hợp lệ không chứng minh migration chia slice có thứ tự đúng.

### D.4. Kiểm chứng lại các tuyên bố quan trọng của review trước

| Tuyên bố cũ | Kết quả audit độc lập |
|---|---|
| 62 models/28 enums, FK tenant, Restrict delete (`SCHEMA_REVIEW.md:28`) | Xác nhận bằng inventory/owning-edge analysis + validate; giới hạn semantics NULL và onUpdate ở D.2. |
| Attendance chưa buộc finalization cùng session (`:75`) | Xác nhận H-02 bằng hai sessions cùng tenant; vẫn là lỗi cần giải quyết, không được bỏ qua vì đã ghi “service sau”. |
| Invoice line chưa buộc student/period (`:83`) | Xác nhận H-04. Bốn cột Invoice→Run không lan truyền sang participant của line. |
| Validate không phát hiện lỗi schema (`:124`) | Chỉ đúng ở cấp Prisma syntax/relations. Không nâng thành architectural PASS. |
| Counter chưa chốt, format còn proposal (`:90–94`, `:132`) | Tách lại: Group A `database_design.md:235` đã yêu cầu logical tenant/year counter, nhưng physical representation thiếu; format cùng file §9 gọi proposal. Conflict cần O-02 review. |
| Policy overlap chỉ technical proposal chưa nguồn cấm (`:128`) | Cần bổ sung evidence class design `tenant-policy.md:186` nói không overlap cùng loại; phạm vi/type/effectiveTo vẫn cần review, không tự làm policy administration P1. |
| `BillingSourceSnapshot` không tạo vì optional (`:94`) | Hợp thiết kế `database_design.md:212`, nếu snapshot/source lock đủ tin cậy. JSON hiện tại chưa tự chứng minh điều đó (H-06). |
| Không có runtime/migration tests (`:129`, `:145–148`) | Source inventory hiện vẫn scaffold, prisma directory chỉ schema; không chạy lại các lệnh format/install/tsc từ báo cáo cũ. Tests thực tế audit chỉ ở I. |

### D.5. Locking alternatives — khuyến nghị để review, chưa chọn thay chủ dự án

| Phương án | Ưu điểm | Giới hạn / compatibility |
|---|---|---|
| Row locks trên SchedulableResource + class/session/finance anchors; READ COMMITTED + SQL guards | Cụ thể, visible bằng PostgreSQL tools; phù hợp DB design resource registry và internal worker; re-read sau lock thấy commit mới | Mọi writer phải theo giao thức; resource row phải tồn tại; chỉ khóa resource không chặn capacity class hoặc phantom source/price. Nhiều resources/series có thể giữ lock lâu; cần bounded transaction, timeout và total order. |
| Transaction advisory locks `(tenant,kind,id)` + SQL guards | Khóa logical aggregate chưa có row, useful student/month/counter hoặc khóa resource trước registry | Mọi writer phải hợp tác; mapping UUID→advisory key cần deterministic/collision-safe; collision có thể serialize thừa, inconsistent hash có thể mất bảo vệ. Dùng xact lock, không session leak qua pool; phải document và test. |
| SERIALIZABLE + bounded retry + GiST/UQ | Bảo vệ predicate/read-write anomalies nếu mọi queries/transactions tham gia đúng; bổ sung cho source phantoms | Có serialization abort/retry, snapshot semantics cần hiểu; không giải quyết missing booking/permission/idempotency. Không tự thay approved resource-lock architecture bằng SERIALIZABLE đơn độc. |
| Optimistic revision/CAS + UQ | Tốt cho stale client, simple updates, version allocation kết hợp khóa | Không tự ngăn overlapping intervals/capacity/aggregate ledger. Không thay locks/GiST cho confirmation/payment. |
| Tenant-wide lock mọi mutation | Dễ chứng minh ở giai đoạn nhỏ nếu mọi writer tham gia | Contention lớn, tenant dài series chặn finance/attendance; không mặc định chọn và không cho phép bỏ SQL guards. Có thể dùng hẹp cho last-Manager operations. |

**Khuyến nghị PROPOSED O-01:** bắt đầu với registry row locks + aggregate anchors, READ COMMITTED re-read và GiST/UQ/CHECK; dùng SERIALIZABLE có mục tiêu nếu không chứng minh được predicate protocol. Advisory locks chỉ cho logical key chưa có anchor khi được review. Kiến trúc đã duyệt yêu cầu khóa/tái kiểm tra và SQL defense; isolation/lock hierarchy chi tiết vẫn SCH-TECH.

Lock graph phải thống nhất giữa confirm/transfer/enrollment/attendance/ISSUE/payment/adjustment: khóa aggregate theo thứ tự được định nghĩa một lần, resources theo UUID tăng dần, giữ old+new resources khi reschedule. **Không** lấy resource lock theo thứ tự từng occurrence, vì hai series khác thứ tự có thể deadlock. Retry deadlock/serialization có hạn và cùng idempotency/policy; UQ conflict/23P01 là business conflict cần phân loại, không retry mù. Không đợi upload/OTP/network trong transaction.

### D.6. Ledger read model và ví dụ chống double-counting

Đặt `N = invoice.totalVnd + SUM(APPLIED adjustment.deltaVnd)`, `P = SUM(allocation.amountVnd của payment không có full reversal)`. `outstanding = MAX(0,N−P)`, `excess_current = MAX(0,P−N)`; chỉ dùng invoice có hiệu lực tài chính theo lifecycle cancellation được chốt. Excess resolution là lịch sử/đối soát, **không tự là khoản thanh toán hoặc delta nợ**.

Ví dụ invoice 100, adjustments −10 và −20, payments 30 và 20: N=70, P=50, due=20. JOIN adjustments×allocations rồi SUM trực tiếp tạo 4 rows, adjustment bị đếm hai lần và payments bị đếm hai lần. Aggregate adjustments và valid allocations độc lập theo invoice trước JOIN; reversal dùng NOT EXISTS hoặc left anti-join theo payment UQ. Không vừa loại payment đã reverse vừa cộng reversal như khoản trừ thứ hai; không cộng Payment.amount và Allocation.amount cùng metric collected. Không `SUM(DISTINCT amount)` để vá duplicate vì hai khoản thu bằng nhau vẫn là hai khoản hợp lệ.

Các KPIs/query phải gắn tenant + authorized scope + cùng `asOf`/snapshot; role scope union không được làm duplicate invoice/enrollment. `COUNT(DISTINCT studentId)` cho enrollment ACTIVE. CANCELLED không được đơn giản biến mất khi còn tiền đã thu/chưa resolve; lifecycle O-06 phải định nghĩa read projection trước nghiệm thu.

## E. PostgreSQL constraints và execution backlog — chưa tạo SQL migration

Đây là **backlog thiết kế đề xuất**, không phải SQL đã chạy. Trong cột Prisma: **Có** = expressible bằng fields/FK/UQ/index hiện hành hoặc bổ sung sau review; **SQL** = cần SQL ngoài schema hiện tại (CHECK/EXCLUDE/trigger/privileges); **TX** = service/transaction/operation protocol bắt buộc. Partial index syntax phụ thuộc khả năng/preview của Prisma version: audit không thử feature flag hoặc đổi config; mọi partial index trong kế hoạch hiện tại được quản lý bằng reviewed SQL. Không tuyên bố mọi Prisma version đều không hỗ trợ partial indexes.

Mỗi dòng nêu bảng/cột, invariant, cơ chế, rủi ro, test PG thật và quyết định; không dùng CHECK có subquery đọc bảng khác hoặc CHECK dựa `now()` để bảo vệ trạng thái theo thời gian. Một trigger cross-row cũng cần concurrency/lock protocol, không tự chống write skew.

| ID | Bảng/cột và invariant | Prisma / SQL concept hoặc cơ chế đề xuất | Rủi ro nếu thiếu | Test PostgreSQL thật | Approval |
|---|---|---|---|---|---|
| E-01 | users.email_normalized: normalized unique; status/activated metadata hợp lệ | UQ đã Có; SQL CHECK normalized theo policy lower/trim thống nhất; status pairing review. Không cần tự thêm citext nếu không chọn. | Account trùng chữ hoa/space, active metadata sai | T-08: case/space, inactive/activation boundaries | O-13, Unicode/email normalization review |
| E-02 | credentials.failed_attempts≥0; auth_sessions expiry>issued, max 7d; OTP expiry>requested, TTL15m; attempts 0..max, max>0; consumed không trước request | SQL scalar CHECK và timestamp differences; TX compare consumedAt/expiry/attempts, atomic hash+consume+revoke; refresh rotate CAS | Reuse OTP/refresh, brute-force counter lost update, invalid TTL | T-08: hai resets cùng OTP chỉ một effect, exact expiry, refresh race | Baseline Q-01; chọn attempt threshold/rate policy, không tự số |
| E-03 | membership_roles active `(tenant,membership,role)` unique; revoked_at≥assigned_at | SQL partial UQ WHERE revoked_at IS NULL; CHECK history interval; không unconditional unique | Duplicate active grant, không thể regrant nếu sai UQ | T-06: concurrent active grants một commit, revoke rồi regrant giữ history | Baseline DB:141; status policy O-13 |
| E-04 | Tenant ACTIVE có Manager hợp lệ; global disable/revoke/leave không loại cuối | TX tenant anchor locks, global User mutation lock affected tenants sorted; optional deferred trigger cùng protocol | Tenant không có Manager | T-01: 2 revokes; disable User cuối ở nhiều tenants; rollback | O-11 bootstrap semantics; BR-10 đã chốt |
| E-05 | access_scopes shape TENANT=(NULL,NULL), CLASS=(class, NULL), STUDENT=(NULL, student); grants không bị scope duplicate/broadening | SQL CHECK OR branches dùng IS NULL; optional 3 partial UQ theo grant/kind/target; FK đã Có | Scope ambiguities, accidental escalation/count dup | T-06/07: mọi invalid combination, permission/scope grant pairing | Shape approved; scope dedup là improvement cần technical review |
| E-06 | parent links active pair unique; verification time/verifier cùng null/cùng có; sibling canonical `a<b`, active pair unique; revoked≥verified/created phù hợp | SQL partial UQ WHERE revoked_at IS NULL; CHECK a<b, verification pair, time coherence; TX evidence/role/eligibility | Self sibling, đảo cặp, duplicate active, unverified access/discount | T-07/16: concurrent pair reversed, own link, revoke/reverify | Baseline; evidence representation O-12/13, không bắt evidenceNote NN tự ý |
| E-07 | schedulable_resources đúng một target theo kind; at-most-one registry per target | SQL CHECK exact kind/non-NULL và other targets NULL; 3 UQ đã Có; TX ensure registry exists trước booking | Booking anonymous/wrong kind, bỏ resource | T-02/05: 0/2 targets, kind mismatch, duplicate registry | Baseline DB:177 |
| E-08 | classes/rooms capacity>0; class endDate≥startDate khi cả hai có; teacher assignment validTo>validFrom; enrollment effectiveTo>from, no self prior; ACTIVE student/class windows không overlap | SQL CHECK; enrollment EXCLUDE `(tenant,student,class,tstzrange(from,to,'[)')) WHERE status='ACTIVE'` với btree_gist; TX chronology/lineage/capacity | Negative capacity, cycle/duplicate concurrent enrollment, invalid intervals | T-04/05: adjacent enrollment windows pass, overlap race fail, cycles blocked theo chosen layer | Interval baseline; active semantics/transfer O-13 |
| E-09 | Transfer source/target cùng student và targetClass; REGULAR participant/recipient đúng class/student/enrollment interval | FK hiện Có một phần; thêm columns+candidate FKs sau review hoặc SQL trigger; TX check effective/scope, protect parent re-key | Wrong student transfer/roster/Teacher access | T-04/05/29: wrong class/student, null enrollment regular, history retained | O-01/13, schema extension review |
| E-10 | sessions/unavailability/bookings end>start; series weekday1..7, duration>0, validTo≥from, ≤6 calendar months; revision>0; ONSITE có room; cancellation có reason theo workflow | SQL CHECK scalar, interval, `valid_to <= (valid_from + interval '6 months')::date` nếu agreed biên; room presence bắt buộc ONSITE, ONLINE room semantics review; TX expansion/timezone/future-only | Empty/reversed ranges, invalid recurrence, roomless onsite, stale update | T-02/05: adjacent, exact6m/leap/month-end, timezone; reschedule stale revision | 6m baseline; inclusive date/end/timezone conventions O-01/12 |
| E-11 | resource_bookings đúng một source; ACTIVE no overlap teacher/student/room/unavailability; source/time/identity/completeness đúng, cancelled released | SQL CHECK XOR; btree_gist + GiST exclusion range [); optional partial UQ active `(tenant,resource,session)` và `(tenant,resource,unavailability)`; SQL deferred trigger/TX source guards | Double booking hoặc exclusion bảo vệ sai nguồn/time | T-02/03: 23P01, same/other resources, adjacent pass; missing/wrong booking rejection; cancellation rollback | O-01 lựa chọn lock/guard; exclusion baseline |
| E-12 | absence một active request/participant; approved actor/decidedAt phù hợp status; EXCUSED approved/late permission, requester không tự approve | SQL partial UQ theo **active status được duyệt**, CHECK metadata sau O-13; TX target/source/actor+24h cutoff | Duplicate/unauthorized leave, miễn phí sai | T-10: đúng24h, 23h, self-approve, concurrent requests | Active predicate O-13; self-approve cấm theo UC-16 |
| E-13 | attendance_record participant.session=finalization.session; nullable finalization chỉ draft | Có thể FK ba cột sau thêm session/candidate hoặc SQL trigger cả child và parent mutation; TX batch | Unconfirmed sources được coi confirmed | T-09: S1 participant/F2 reject; F1 pass; draft NULL pass | H-02 remediation design review |
| E-14 | finalization đầy đủ active roster; no ordinary edit ≥end+48h hoặc issued source; correction old/new/revision/audit atomic | TX locks session/roster/attendance/ISSUE; optional deferred trigger completeness và history protection; revision CHECK>0, correction old≠new nếu chỉ correction thật | Partial finalization, issue/correction race, no history | T-11/12: missing participant, add roster concurrently, lock before job lockedAt, issue early, correction stale | Baseline Q-05; no-op correction behavior technical review |
| E-15 | billing_period monthStart đầu tháng, monthEnd đầu tháng kế tiếp và >start; UQ một tháng/tenant | UQ đã Có; SQL CHECK date_trunc/date arithmetic, ví dụ month_start=date_trunc('month',month_start)::date và month_end=(month_start+interval '1 month')::date | One-invoice/month UQ bị bypass bằng periods giả | T-13: 15th invalid, February/leap year, duplicate month race | Baseline |
| E-16 | price_rules đúng một scope target; unit_price≥0; valid effective date range; no overlap cùng target | SQL CHECK explicit branches, end NULL OR end>from; **3** GiST exclusions per COURSE/CLASS/SESSION, daterange [from,to); btree_gist | Ambiguous prices, NULL target bypass | T-15: same target race fail; adjacent pass; NULL end; different targets/scopes pass | Approved Group A:236; effective date rule O-12 |
| E-17 | InvoiceLine.student=Invoice.student=Participant.student | Có thể thêm studentId+2 composite FKs/candidate keys; hoặc SQL cross-row trigger + immutable parent identity; tenant FK hiện Có | Charge người khác, leak source | T-14: X invoice/Y participant reject cả INSERT/UPDATE/cascade path | H-04 remediation review |
| E-18 | line session đúng billing period; price target/date/precedence đúng; sourceStatus/chargeUnits/finalization/cancel branch coherent | TX compare session local business date, period, revisions/policy and price hierarchy; optional trigger structural validation; snapshot schema check JSON type hỗ trợ | Bill sai kỳ/giá, missing attendance bị coi0 | T-14/15/17: midnight/endmonth, cancelled no attendance, missing price blocks | O-12 period attribution/cross-midnight, policy/timezone pin |
| E-19 | invoice gross/discount/total≥0, total=gross−discount; lines units0/1, unit/base≥0, base=unit×units; aggregates và metadata issue đầy đủ | SQL row CHECK; numeric-safe multiplication/range validation; TX aggregate gross=Σbase, rounded final net; CHECK ISSUED number/time/issuer/due NOT NULL, due≥issue; trigger immutability | Invalid accounting values, unsigned “issued” invoice | T-16/18/19: negative/unit2/nullmetadata, mismatch sum, overflow, total HALF_UP | CANCELLED metadata O-06; maxmoney O-10; due O-03 |
| E-20 | one SIBLING discount/invoice, rate .10 P0, sequence>0, raw≥0; evidence/eligible verified siblings; decimal precision fits | Có UQ `(tenant,invoice,kind)` sau review; SQL CHECK rate .10, positive seq/raw; TX evidence+formula+raw consistency; precision/cap review | Multiple10% deductions, unverified entitlement, overflow | T-16/18: two seq same kind reject, revoked sibling, 5VND→5 (4.5 HALF_UP), large raw | O-10 precision; baseline rate already approved |
| E-21 | claim at-most-once **và** every issued line has permanent claim; no claim draft | UQs/FKs đã Có; TX insert claims+ISSUE atomic; optional deferred trigger checking status/coverage; immutable claims | Omit claim defeats source dedup, canceled source reused | T-19/20: zero line claim, missing claim, draft claim, two issue race, cancellation retains | Baseline; exact zero-source coverage confirm migration review |
| E-22 | payment/allocation/reversal amount>0; allocation=payment amount; reversal full; one allocation/payment at commit | SQL CHECK; Có candidate+FK amount nếu thêm keys/columns hoặc SQL trigger; deferred exactly-one guard/TX; UQ at-most-one đã Có | Ledger lệch dù đúng invoice | T-22/23: no allocation commit reject theo guard, unequal/reverse partial reject, second reversal race | Full reversal baseline; approval O-05 |
| E-23 | all valid payments≤outstanding lúc record; payment chỉ financial-effective invoice | TX common invoice row lock for payment/reversal/adjustment; recalc ledger sau lock; domain dedup+audit atomic; SQL guarded function/trigger optional | Concurrent overpay, payment against draft/cancelled unsupported | T-21/24: two80/due100 one succeeds; pay vs downward adjustment/reversal | O-05/06 lifecycle details; overpay prohibition approved |
| E-24 | APPLIED adjustment đúng authorized approved target/payload, reason, appliedAt/actor; one effect/request; adjusted net nonnegative theo policy | SQL metadata CHECK; TX request+invoice lock, target/payload/hash+current permission; effect UQ after cardinality review; trigger terminal freeze | Apply unapproved/different amount/replay | T-25/27: wrongtarget/requeststate/payload, two keys same approval, failure rollback | O-07 execution; effect cardinality and cancellation O-06 |
| E-25 | excess>0, trigger same invoice/APPLIED/downward, PENDING/RESOLVED metadata coherent, no duplicate delta/case, subsequent reversal reconciled | Same-invoice FK đã Có; SQL amount>0+status/metadata CHECK sau lifecycle; TX recompute excess old/new; partial/UQ trigger/case sau O-05 | Duplicate excess, stale resolved balances, auto-refund leak | T-25/26: net100→80→70 paid100, reversal after excess, repeated execute | O-05/06 bắt buộc; không chọn semantics trước |
| E-26 | Assignment.priority1..5/revision>0; Version.versionNo>0; Grade.revision>0, score0..10; status/publication metadata; published correction reason | SQL CHECK; TX API step0.1 validation trước Decimal cast, latest version+scope+deadline≤7d, publish snapshot/recipient identity; triggers after lifecycle review | Invalid score/priority, draft visibility, overwrite history | T-29/30/31: 8.55 input reject,10.1 reject, draft leak, day7 boundary/race | O-08/09, archive preserves publication timestamp |
| E-27 | StoredFile size>0≤maxBytes, MIME allowlist, checksum format; SubmissionFile count≤5, owner+READY; answer/file content hợp lệ | SQL metadata CHECK MIME đề xuất `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/jpeg`, `image/png`; SHA-256 hex format; TX version/file lock cho count/ownership/readiness; bytes validate ở service | File của người khác, 6 files, MIME spoof | T-32/33: concurrency4→6, wrong uploader, STAGING, spoof headers/oversize | O-09 exact bytes/canonical MIME, empty answer policy nếu chưa nguồn |
| E-28 | Immutable issued header+lines+discounts+claims, APPLIED adjustment, payment/reversal/allocation, submission versions+attachment set, published grades, corrections/decisions | SQL privileges + lifecycle triggers; whitelist mutable draft/system columns; guard child INSERT/UPDATE/DELETE by parent historical status, parent identities too | History rewrite/owner change dù Restrict delete | T-38: direct SQL/update nested child/add file to old version, re-key parent, allowed draft edits still pass | Lifecycle exact columns O-06/08/13; history invariant approved |
| E-29 | ApprovalRequest allowed transitions; immutable approved payload/policy; decision coherence, selfApproved đúng operation; COMPLETED iff effect commit | SQL CHECK selfApproved→APPROVE và metadata local; TX lock/CAS state,target/payload/current permissions; effect unique; history decisions append | Two conflicting decisions, false COMPLETED, bypass authority | T-27/28: approve/reject race, self financial eligible/ineligible, absence self denied, worker crash | O-07 sync/async; state tables O-13 |
| E-30 | Audit actor User↔Membership match khi cả hai có; actorKind/nullable shape valid; protected target resolver | Có thể new candidate/FK triples hoặc SQL trigger; SQL shape CHECK sau actor contract; TX polymorphic resolution/attribution | False attribution or missing source | T-38/39: U1/M2 reject, valid worker/operator accepted | actor/system source O-11/13; không tự thêm staffgrant |
| E-31 | Audit payload redacted, retention≥24 tháng, sensitive projections/scopes | TX allowlist trước insert; DB privileges/masked reads; operational retention role/export/partition/backup policy, not ordinary CHECK | Secrets lưu vĩnh viễn, evidence bị xóa sớm | T-39: token/OTP redaction, unauthorized read, attempted early deletion/partition detach, restore | retention baseline; PII allowlist/cleanup review, không legal policy mới |
| E-32 | Job.attemptCount0..4; attemptNo1..4; finished≥started; lease owner/until pair và RUNNING state coherent; attempts distinct | SQL CHECK+UQ đã Có; TX claim token/attempt increment CAS, terminal row freeze; retries1/5/15 after first | Retry vô hạn/negative counter, stale writer | T-35: W1 pause,W2 reclaim,W1 resume; attempt5 reject; owner mismatch | O-01/13 worker system actor/finalize rules |
| E-33 | Idempotency operation+key UQ, immutable hash, result pair both null/both set, expiry policy safe, no unauthorized replay | UQ đã Có; SQL pair CHECK; TX reserve/effect/result atomic or recoverable; predicate CAS/hash comparison and current auth | Samekey/different payload, lost effect/repeat after purge | T-20/21/40: altered hash, concurrent reserve, crash before result, scope revoked | Canonical hash schema and financial retention O-13 |
| E-34 | Outbox.attemptCount≥0, producer+event atomic, PROCESSING reclaim, consumer effect dedup; Notification event/recipient/kind UQ và valid scope | SQL CHECK; UQ event/notification đã Có; TX producer/outbox and consumer inbox+notification; row-lock short DB path hoặc reviewed lease/fencing; worker partial lookup indexes | Lost event, permanently processing, duplicate business effect/notifications | T-36/37: crash every phase, redelivery100x, parent revoke, failure alert | O-01/13 recovery metadata, event kind allowlist P0 |
| E-35 | Runtime role không DDL hoặc update/delete immutable logs; retention role kiểm soát riêng; owner không runtime | SQL GRANT/REVOKE, privileges schema/table/function, triggers không bị runtime tắt; backups/restore controls; audit access scoped | Bypass application immutability bằng SQL, accidental purge | T-38/39: runtime UPDATE/DELETE/ALTER denied, allowed inserts and approved retain cleanup tested | Operational role/retention design review; không triển khai trong audit |
| E-36 | policy_versions config/hash/code immutable; pin không đổi khi retry; effective interval valid; text statuses/state sets approved | SQL immutable guards+interval CHECK; optional policy EXCLUDE sau chốt dimension; TX pinned refs compare and config schema/hash validation; status CHECK sau O-13 | Retry policy drift, ambiguous version/typo status | T-40/41: policy changes during retry, run/invoice mismatch, illegal transition | O-12/13; policy editor P1 excluded |
| E-37 | Unified locks/ordering, idempotent retry và atomic audit/outbox cho critical mutation | TX ordered aggregate/resource locks; SQL UQ/CHECK/EXCLUDE final defense; optional serializable, bounded deadlock/serialization retry; no external I/O in TX | Write skew, deadlock loop, half-confirm/half-payment, phantom source | T-01–05/11/12/17/19/21/24/27/35 với 2 connections thật | SCH-TECH/WF-TECH O-01/07; không tự chọn isolation |
| E-38 | Private path namespace tenant-safe; file promotion/link/reconcile atomic ở metadata, bytes eventually consistent; orphan cleanup không xóa referenced/history | TX file row/reference locks, READY no re-use after orphan marker; server path resolver, create-exclusive; optional global UQ theo storage contract | Cross-tenant byte collision, delete while link, DB-volume restore mismatch | T-32–34: fault injection promote/link/delete, same key2tenants, restore both stores | O-09; ngoài schema cần real filesystem tests |
| E-39 | Number chỉ cấp ISSUE, unique tenant, tenant/year atomic sequence; không tái sử dụng canceled issued number | UQ đã Có; SQL counter table `(tenant,year)` PK + locked increment/UPSERT returning và ISSUE cùng TX, hoặc alternative được duyệt; number format/sequence width/year timezone | Duplicate numbers/retries/gaps unexpected, counter reset sai năm | T-19: 2 invoices same tenant/year, different tenants/year boundary, rollback/retry/cancel | O-02/03; logical counter Group A, physical design cần review |
| E-40 | Index đủ cho FK references/queries/queues, không thừa keys vô ích; migration DDL/procedures/extensions thực sự tồn tại và validate | Có FK/UQ/index; SQL partial ready/running queue/inbox indexes nếu cần; EXPLAIN/pg_catalog checks và fresh DB migration/restore test sau approval | Slow locks, scan whole table/queue, schema drift bỏ custom guards | T-42: inventory pg_constraint/pg_indexes, EXPLAIN actual fixtures; migration apply fresh/repeat deploy | Technical migration review, không benchmark suy đoán |

## F. Concurrency và transaction test matrix — tất cả PG tests dưới đây NOT RUN

Điều kiện nghiệm thu sau approval: PostgreSQL đúng major version target phải được xác nhận; ít nhất **hai connections thật**, barrier kiểm soát interleaving, kiểm DB committed state sau transaction. Assert SQLSTATE 23503/23505/23514/23P01 và 40001/40P01 theo cơ chế thực tế, đồng thời kiểm API error/rollback/idempotency; không mặc định mọi conflict phải cùng SQLSTATE. Table này là test plan, không phải code/tests đã tạo.

| Test | Setup / interleaving | Kết quả bắt buộc và invariant |
|---|---|---|
| T-01 | Bootstrap pending, OTP activation; hai Manager revoke song song; User duy nhất làm Manager ở 2 tenants bị disable | ACTIVE chỉ sau Manager hợp lệ; không tenant active nào mất Manager; audit operator đúng; rollback nguyên tử nếu một tenant không hợp lệ |
| T-02 | Teacher/student/room cùng resource 08–10 vs09–11; adjacent10–11; khác tenant/resource; invalid kind/time/XOR | Chỉ một overlap commit; adjacent/different resource pass; malformed rows bị SQL reject |
| T-03 | Confirm session vs confirmed unavailability; two series có occurrence cuối conflict; cancel/reschedule giữa transaction | No double booking; all sessions/bookings/outbox/audit rollback cả series; cancel release đúng; reschedule failure giữ lịch cũ |
| T-04 | Hai enrollment tranh chỗ cuối, transfer và confirm cùng class; room/class capacity giảm đồng thời confirm | Không vượt cả hai capacities; không deadlock vô hạn; mọi writer cùng anchors/lock order |
| T-05 | Wrong class enrollment/transfer wrong student, self/cyclic lineage, adding participant khi confirm,6months boundary/leap, same-key series retry; P1 MAKEUP | Wrong source/student/time reject; exact recurrence valid theo chosen rule; no duplicate occurrence/effect; P1 denied |
| T-06 | Active grant duplicate concurrent; revoke/regrant; scope invalid combination/dedup; role A financial CLASS + role B unrelated TENANT | Partial UQ giữ history; scope shape reject; permission không được “mượn” broader scope role khác |
| T-07 | Cross-tenant FK insert/update; wrong-scope SELECT; unverified/revoked parent; reversed sibling pair/self-pair; Teacher ngoài class | FK chặn cross-tenant writes; service chặn reads/same-tenant wrong-scope; verified sibling độc lập parent |
| T-08 | Email normalization duplicates; same OTP reset/activation hai clients; expired/exhausted attempts; refresh reuse/race; global disabled user | Exactly one consume/rotation effect; no account duplicate theo normalized policy; revoke old sessions; no secret logging |
| T-09 | Attendance participant S1 gắn F2; F1; NULL draft; parent session/student identity update sau record | Wrong session bị từ chối ở chosen DB guard; draft hợp lệ; re-key không phá history |
| T-10 | Absence đúng24h,23h, unapproved, self-requester approver, parent unrelated;2active requests | Chỉ authorized approved đúng participant mới EXCUSED; late permission; cấm self-approve absence; active UQ |
| T-11 | Finalize thiếu1record; add/remove roster song song; actual attended despite approved absence | Không partial finalization; snapshot roster nhất quán; ATTENDED=1 ưu tiên thực tế |
| T-12 | Ordinary correction sát48h; lockedAt NULL nhưng đã hết hạn; ISSUE vs correction;2corrections cùng revision | Boundary lock đúng; chỉ privileged correction có reason/audit sau lock; invoice snapshot freeze; oldStatus/CAS đúng; follow-up adjustment riêng |
| T-13 | Period15/09, monthEnd sai, leap Feb,2periods cùng month | Chỉ kỳ đầu tháng→đầu tháng sau; unique real month |
| T-14 | X invoice,Y participant; right student nhưng previous/next month; exact boundary/midnight | Wrong student DB guard reject; out-of-period reject theo chosen tenant date policy |
| T-15 | COURSE/CLASS/SESSION prices đồng thời; same target overlap insert race; NULL end; adjacent ranges; unrelated price target | Same target overlap reject, independent scopes được tồn tại; pick SESSION>CLASS>COURSE; date-effective price đúng |
| T-16 | Sibling verified/invalid/revoked/enrollment không đủ;2SIBLING seq1/2; zero-cost/cancelled source; mismatch units/status | Chỉ1discount10%; no proof=no discount; 0/1 fees đúng, cancelled không cần fabricate attendance |
| T-17 | Draft snapshot rồi attendance/price/participant thay đổi; insert new override trong ISSUE; policy/timezone change | Stale draft dừng/đòi recompute, hoặc coherent pinned snapshot theo contract; no phantom missing sources; no silent repin |
| T-18 | gross5 sibling→4.5 round HALF_UP=5; gross15→13.5=14; multiple odd lines; BigInt>JS safe integer, NUMERIC precision boundary | Round một lần cuối; strings JSON exact; explicit reject/cap hoặc wider Decimal đúng review; no overflow silent |
| T-19 | ISSUE hai clients cùng invoice/key;2invoices khác student cùng counter tenant/year; year boundary/rollback; null metadata/missing claim | Một logical effect/number allocation, replay result; unique numbers; metadata+claims đầy đủ; rollback không nửa issue |
| T-20 | Duplicate source claim across invoices/different keys; DRAFT claim; zero line omitted; cancel rồi retry/source reissue | At-most-once **và** completeness; claim chỉ khi issue, giữ sau cancel; same-key khác hash conflict |
| T-21 | due100, hai payment80 keys khác; cùng key cùng body/đổi amount/invoice | Không sum160; same hash replay1effect; changed payload409; no orphan allocation/audit |
| T-22 | Payment100, allocation1/0/NULL missing row, allocation other invoice, payment draft invoice | Equality/positive/status/exactly-one enforced chosen layer; same-invoice FK fail khi mismatch |
| T-23 | Full reversal100 vs partial1; hai reversals same payment; sai actor/permission; replay | Một full reversal, giữ payment/allocations; valid due tăng đúng100, không cộng/trừ hai lần |
| T-24 | Payment vs downward adjustment, payment vs reversal, adjustment tăng/giảm khi invoice đang lock | Sequentially valid ledger under common invoice lock; no forbidden overpay lúc record, không dùng stale outstanding |
| T-25 | paid100, net100→80→70; repeated execute2keys same approval/trigger; upward adjustment sau excess | Excess hiện tại30; historical entries không cộng thành50; chosen lifecycle/delta semantics giải thích được; no automatic refund/credit |
| T-26 | Reverse payment sau pending/resolved excess; cancel đã thu; cancel/un-cancel/reissue nếu workflow không cho | Ledger/pending excess reconciliation coherent, số thu gốc giữ; operations chưa approved bị reject, no hidden debt disappearance |
| T-27 | Approve vs reject race; one approval dùng wronginvoice/delta/policy; revoke approver permission before execute; execute twice | One valid transition/effect, payload binding, current auth recheck; terminal requests không mutate |
| T-28 | Self financial approval một Manager đủ quyền vs nhiều reviewer; absence self-approval; async crash before/after effect | Appropriate manual exception flag/reason; absence cấm self; APPROVED chưa completed; effect+COMPLETED atomic/recoverable |
| T-29 | Publish assignment concurrent roster/transfer, change recipient student after submission, assignment edit/deadline shorten, Teacher wrong class | Frozen recipient/owner history, allowed extension audit; no scope bypass |
| T-30 | Student resubmit V2 vs Teacher grade/publish V1; two submissions same nextVersion; wrong Submission.currentVersion | Serialize latest-version condition; no wrong-container pointer; no duplicated version; draft-grade gating theo O-08 |
| T-31 | Grade10.1/−.1/8.55; correction published, draft revision greater number, day7exact/+1unit | API reject wrong precision; DB range; latest published still visible, drafts hidden; boundary exact theo approved clock rule |
| T-32 | Wrong uploader same tenant/cross tenant; READY vs STAGING/ORPHANED; metadata MIME vs bytes; oversize/6files | File owner/status/size/MIME checks thật; private authorized downloads only |
| T-33 | 4files rồi hai transactions thêm1; add/delete file old immutable version; mark orphan vs link | Never >5; submitted attachment set immutable; no READY race dẫn dangling bytes |
| T-34 | Crash staging/promote/metadata/link; cleanup while newly linked; key giống2tenants; restore metadata+Volume | No overwrite/leak/path traversal; reconcile recoverable; no delete referenced/history file; backup pair consistent |
| T-35 | W1 lease→pause→expire; W2 reclaim/commit; W1 resume; attempts4/5; missing info | Stale W1 cannot business commit/finish; total≤4, waits1/5/15, no infinite retry; recheck actor permission |
| T-36 | Business commit crash trước dispatch; producer rollback; consumer commit crash trước ACK; replay100x; PROCESSING abandoned | No lost event; no event from rollback; at-least-once dispatch only1consumer effect; recover stuck event |
| T-37 | Parent revoke trước notification delivery/read; eventKind mismatch; worker failure/approver missing | No recipient leakage, dedup; Manager in-app alert; no email/reminder P1; original business still committed |
| T-38 | Runtime SQL UPDATE/DELETE history, INSERT child vào issued/version cũ, actor mismatch, parent re-key/cascade, normal draft update | Prohibited writes fail; allowed lifecycle updates succeed; attribution consistent; migration owner riêng |
| T-39 | Audit contains OTP/password/token/PII, unauthorized audit read, retention deletion/partition detach<24months, restore | Redaction trước INSERT, scoped reads, early purge denied, approved backup/retention demonstrable |
| T-40 | Policy changes during retry; same key different operation/body; idempotency purge then replay; scope revoked before replay | Same pinned policy, typed key namespace/hash conflict, persistent dedup, current authorization |
| T-41 | Source sections/version provenance review; illegal text/enums transitions, P1 command attempt | Requirements completeness fixed/owner reviewed; approved lifecycle state table; P0 gates deny P1 |
| T-42 | Fresh migration after approval, pg_catalog custom guards, real load/EXPLAIN, rollback/redeploy/restore | Exact FK/MATCH/actions/UQ/CHECK/GiST/roles present; no schema drift; NFR only claim after measurement |

## G. Open decisions — phương án, trade-off, khuyến nghị và cấp phê duyệt

Tất cả **OPEN / PROPOSED**, không quyết định nào được đổi thành APPROVED bởi audit. Nhóm A/phần nghiệp vụ đã chốt được giữ nguyên; chỉ phần còn mở mới yêu cầu review. Không đợi user trả lời để tự triển khai bất kỳ phương án nào.

| ID | Vấn đề / authority | Phương án và trade-off | Khuyến nghị PROPOSED | Phê duyệt cần trước bước nào |
|---|---|---|---|---|
| O-01 | SCH-TECH lock/isolation/guard completeness (`DECISION_REGISTER.md:48`; DB:184/411) | Row locks: cụ thể nhưng cần registry+anchors; advisory: logical keys nhưng cooperative mapping; SERIALIZABLE: predicate safety nhưng retry/abort. GiST vẫn final guard | Row resources+class/session anchors, total order, GiST; review predicate source locks riêng. Không chọn SERIALIZABLE-only thay architecture | Technical architecture + owner review trước thiết kế migration/confirmation implementation; PG2clients gate |
| O-02 | Counter tenant/năm và format conflict (DB:235 vs407) | Counter row `(tenant,year,next)` trong same ISSUE TX: dễ rollback/unique, serialize tenant/year; sequence per tenant/year: throughput, gaps/lifecycle nhiều objects; MAX+1 dù có lock vẫn scan/fragile nếu writer không hợp tác. Format fixed INV-year-seq vs opaque/internal sequence+display projection | Counter row transactional; năm theo tenant-local issuedAt nếu owner chấp thuận; stable stored issued number. Xác nhận format/padding/gaps/year boundaries; không tự sinh thêm model | Logical tenant/year counter **Group A đã yêu cầu**; physical design và format conflict cần owner clarification + financial design review trước migration |
| O-03 | Due date7ngày (Q-08; API:557) | 7×24h từ issue instant: dễ test; +7 local calendar days cùng giờ hoặc end-of-day: trực quan nhưng cutoff khác. UTC+7 không DST vẫn khác nếu chọn end-of-day | Calendar local cùng giờ hoặc explicit7×24h; trình owner chọn chính xác, pin dueAt lúc ISSUE. Không thay7ngày | Owner finance quyết định semantics trước CHECK/ISSUE implementation; không cần đổi baseline7 |
| O-04 | BillingSourceSnapshot (DB:212) | Frozen JSON line/header với typed schema+revision/hash: ít tables, draft history khó hơn; snapshot table/run-generation: query/diff rõ nhưng thêm schema/version/cardinality và retention | JSON đủ cho issued explanation nếu validate+lock+freeze đầy đủ; chỉ thêm table nếu cần lưu từng lần recompute/draft. Hash đơn độc không thay snapshot | Owner/technical review snapshot contract trước Billing; thêm model cần explicit file/schema review; không tự thêm |
| O-05 | PaymentExcessResolution lifecycle và reversal workflow (DB:237; register BILL-TECH) | Delta-event per adjustment: append-only dễ trace, cần reconcile later; case current amount/invoice: dễ đọc pending nhưng cần immutable movement history; full reversal có direct authorized command vs approval bắt buộc | Tách excess_current tính ledger với history cases/events; chưa chọn cardinality/resolutionKind. Giữ pending và manual reconciliation, không auto refund/credit. Full reversal giữ nguyên baseline; approval chi tiết owner chọn | Owner finance + architecture phải chốt trước E-22/25 constraints và endpoints. Không tự thêm money-out/refund/credit |
| O-06 | Cancellation sau đã thu/đã attended (DB:408; UC-26:1111–1117) | Chặn cancel khi còn valid payment, hướng adjustment/reversal được duyệt: đơn giản nhưng có thể hạn chế nghiệp vụ; cho cancel+approved delta+excess: đáp ứng rộng, cần financial-effective read model rõ | Review state table với scenarios paid/partpaid/reversed/previous-adjustments; preserve issued totals/number/claims, debt không âm, excess riêng. Operation chưa chốt phải deny | Owner finance bắt buộc trước cancellation/status SQL; không tự loại cancelled paid invoice khỏi ledger |
| O-07 | Approval execution sync/async (register WF-TECH; API:424/559) | Sync decision+execution đơn TX: ít crash windows nhưng latency/lock lâu; separate approve rồi sync execute: explicit states; persistent job after approval: restart/retry tốt nhưng cần dedup/permissions/trace | Commands bounded có separate explicit execute; tác vụ dài enqueue durable job. Ghi APPROVED trước effect, COMPLETED chỉ cùng successful effect commit. Routing per operation cần sign-off | Owner/architecture trước workflow API/runtime; API sample không tự đóng quyết định còn open |
| O-08 | Draft grade khóa resubmit? (`assignments-grading.md:276`, register UI-GRADE; Q-11) | Lock từ first grade DRAFT: theo “trước chấm”, tránh race; chỉ lock từ PUBLISHED: cho học sinh sửa trong lúc teacher chấm nhưng cần invalidate/stale grade contract | Theo wording Q-11 ưu tiên stop từ lúc chấm, **nhưng** draft chưa published semantics vẫn cần owner xác nhận. Không dùng UI register để override source | Owner academic trước submission/grade transaction; schema chưa mã hóa lựa chọn |
| O-09 | 10MB bytes, late7day cutoff, file namespace/retention (DB:249–253; files:246–248) | 10,000,000 vs10,485,760 bytes; exactdeadline+7×24h vs endlocalday; `(tenant,key)` physical namespace vs globally unique full key; cleanup staging TTL vs history files | Explicit byte constant + canonical MIME mapping, server clock boundary exact; tenant-prefixed random keys, keep historical attachments; orphan TTL/reconciliation review | Owner/technical review trước file CHECK/runtime; không đặt số bytes/retention tự ý |
| O-10 | Max money/Decimal representability (S:1265) | Cap invoice amounts đủ raw Decimal: ít schema changes nhưng cần business ceiling; widen NUMERIC: full BIGINT range nhưng vẫn cần safe multiplication/sum limits | Đề xuất precision phù hợp với max money đã được duyệt, BigInt/Decimal strings API; verify integer overflow | Owner finance xác nhận bounds + technical precision review trước migrations |
| O-11 | Initial Manager assigner/operator audit (DB:152; S:449) | CLI self-reference membership: không đổi FK nhưng cần rõ exception; nullable assigner+operator provenance: rõ actor nhưng đổi schema; platform actor giả tenant: không khuyến nghị vì sai authority | Controlled CLI exception nhỏ, explicit OPERATOR audit, pending account không có public self-grant | Owner IAM/security trước bootstrap; không tự chốt approval exception |
| O-12 | Policy/pricing effective source, month attribution, timezone mutability (BR-14; DD:226; tenant-policy:186) | Current active baseline single version: đơn giản P0; multi effective windows: cần no-overlap dimension/closure; date session vs charge creation time có thể khác; month attribution start/end cho overnight | Giữ baseline pinned và timezone snapshot; review source conflict/attribution rõ, deny ambiguous pricing. Policy UI/new admin flows giữ P1 | Owner finance/academic + architecture trước source containment/effective EXCLUDE; thay BR phải explicit source update |
| O-13 | Text lifecycle/active predicates/job attempts/system actor/retention (M-07) | text+CHECK dễ thay nhưng cần reviewed state table; enums chặt hơn nhưng migration versioning; attempts insert-at-start+allowed finalize update vs immutable terminal insert | State/transition/required-fields table per aggregate; mutable execution state + terminal immutable history; không dùng một workflow enum chung mọi domain | Owner domain + technical review trước SQL predicate/state triggers/runtime. Include financial idempotency no arbitrary TTL |

Nguồn thiếu v5 đầy đủ H-18 là **công việc xác minh/khôi phục source**, không phải câu hỏi mời chọn policy mới. Các stale references `detailed_des.md`/`api_spec.md` và các đoạn class design cũ về “one invoice chưa chốt” phải được sửa ở task tài liệu riêng; Group A appendices và nguồn cao hơn thắng, không reopen one-invoice baseline.

## H. Danh sách thay đổi khuyến nghị — CHƯA triển khai

1. Củng cố InvoiceLine student identity và AttendanceRecord finalization/session bằng declarative composite keys hoặc reviewed SQL guards; giữ required/nullable đúng draft/cancel branch. Thêm test phản ví dụ trước khi đánh dấu resolved.
2. Chốt schema/SQL contract cho counter tenant/year, monetary checks, sibling UQ, monthly periods, issued metadata, full allocation/reversal equality và immutable history; không bổ sung P1.
3. Hoàn thiện SQL GiST resource/price/enrollment, `btree_gist`, shape CHECKs/partial active uniques và deferred history/completeness guards theo chosen design.
4. Thiết kế common transactional protocols: confirmation/transfer/capacity, finalization/correction/ISSUE, payment/reversal/adjustment/excess, approval execution, job fencing/idempotency/outbox recovery. Mọi protocol có lock anchors/order, re-read, retry/errors và audit boundary.
5. Định nghĩa snapshot JSON schema/version/hash/timezone, frozen recipient identities/attachment sets, latest published grade projection, file owner/ready/bytes/private namespace/reconciliation.
6. Tách runtime/migration/retention DB roles; append-only/conditional triggers; audit actor consistency, redaction trước INSERT và retention≥24months/restore plan.
7. Khôi phục Requirements đầy đủ và provenance; giải quyết Group B bằng review riêng. Sau correctness mới benchmark indexes, không loại candidate superkeys đang làm đích FK.

**File có thể cần ở remediation sau approval:** `apps/api/prisma/schema.prisma`, migrations SQL tương lai, test PostgreSQL/integration, services/coordinators thuộc slice được mở; tài liệu quyết định/contract cập nhật bằng task riêng. Danh sách này là đề xuất, **không phải authorization tạo/sửa các file đó**.

## I. Validation thực tế, phương pháp và giới hạn

### I.1. Commands thực sự chạy (offline/read-only đối với project)

| Kiểm tra | Kết quả thực tế ngày18/10/2026 |
|---|---|
| `git status --short`, `git branch --show-current`, `git rev-parse HEAD` | Branch/HEAD ở A.1; ban đầu2modified files; cuối thêm đúng1untracked audit report. Không đổi branch/index. |
| `node --version` | v24.12.0 |
| `pnpm.cmd --version` | 12.11.2 |
| `pnpm.cmd --filter api exec prisma --version` | CLI7.10.1, @prisma/client7.10.1, Node24.12.0, TypeScript6.0.3, win32 x64; engine hash `d1b3f377ca835d73fd50954a5e22128b9ebdd6b8` |
| `pnpm.cmd --filter api exec tsc --version` | Version6.0.3; **không** phải project typecheck |
| `pnpm.cmd --filter api exec prisma validate` | PASS với `DATABASE_URL=postgresql://audit:audit@127.0.0.1:5432/educore_audit_offline` chỉ trong process PowerShell; `CHECKPOINT_DISABLE=1`; không gọi database. CLI load existing `apps/api/prisma.config.ts` và đúng schema. Không dùng credentials thật. |
| Node scripts qua stdin, chỉ `fs.readFileSync` + parsing | 62models/28enums, không duplicate names/table maps; không unknown field types, không unused enums; 188owning FK,43optional,125composite;120`@@unique`,115`@@index`;188explicit Restrict,0explicit onUpdate;0Float,0DateTime thiếu native type. |
| Model set so với P0 danh mục và Database Design | Đủ62 models đã liệt kê B. Parser DB table rows cần review tay: excess là Group A prose:237; KPI rows không phải tables; platform_staff_grants/billing_source_snapshots là proposals; P1 tables loại khỏi expected. Không dùng expected list tự tạo làm bằng chứng độc lập duy nhất. |
| Static relation candidate/tenant scan | Mọi declared owning FK đều có reference key @id/@unique/@@unique; không thấy owning edge giữa2tenant-scoped models thiếu tenant. Đây là regex/static check hỗ trợ manual review, không parser SQL/test PG. |
| `rg --files`, `rg -n`, `Get-Content -Encoding UTF8` | Kiểm file/version/FR/UC/BR/Q/design/class sections, app source scaffold và full schema; dùng exact paths, không external services. |
| `Get-FileHash -Algorithm SHA256` | Schema, prior review và9nguồn/config governance được chụp; đối chiếu cuối không thay nội dung các11files được bảo vệ trong snapshot A.1. |
| `git diff --check` | PASS, có warnings LF→CRLF cho2file thay đổi sẵn; không phải whitespace defect. |
| `git diff --no-index --check -- NUL docs/ai/SCHEMA_AUDIT_P0.md` | Lần kiểm giữa lúc đang soạn thấy blank EOF; đã xử lý. Kiểm cuối không còn whitespace diagnostic; exit 1 của no-index phản ánh file mới khác NUL, không được ghi là exit 0. Check riêng cần thiết vì report untracked không nằm trong `git diff --check`. |
| Node read-only check báo cáo | Ma trận đủ 62 models không trùng/thiếu; 29 findings, 40 backlog items, 42 test plans, 13 open decisions; không có ID tham chiếu chưa định nghĩa; kiểm trailing whitespace/blank EOF đạt. |

### I.2. Những kiểm tra không chạy

- PostgreSQL constraints/concurrency/migration SQL/extension/locking/roles: **NOT RUN**, chưa mở database theo chỉ thị. T-01–T-42 là kế hoạch, chưa có một test PG nào được tính PASS.
- `prisma format`, generate client, migrate, db push/reset/seed, install/dependency/config changes: **NOT RUN**.
- Build/API unit/e2e/typecheck dự án: **NOT RUN**, docs-only, source nghiệp vụ chưa có; version command không thay thế typecheck. Không tái sử dụng kết quả tsc/install/format trong review giai đoạn trước làm kết quả audit này.
- EXPLAIN/load/backup/restore/Volume checks: **NOT RUN**; NFR performance, reliability, recovery chưa chứng minh. Không có adapter runtime/service để audit implementation behavior.
- Không network/web/Library/Figma/GitHub; không commit/stage/push/branch/PR/deploy. Ngoại lệ OTP-email là domain boundary, **không có OTP nào được gửi trong audit**.

### I.3. Coverage và sai số phương pháp

62/62model matrix +28enums +188owning edges đã được review; scalar/nullable/cardinality/native mapping đều đối chiếu schema. Enum chỉ giới hạn tập giá trị, không ngăn illegal transitions: UserStatus, OtpPurpose, scope/resource kinds, enrollment/session/booking/attendance, price/invoice/discount/adjustment/payment/excess, assignment/submission/file/grade, approval/job/outbox/notification/audit đều được kiểm tra theo domain phía trên. Enrollment.SUSPENDED và participant.MAKEUP là P1 slots đã khai báo, không được xem như workflows P0 đã có. P0 payment methods/discount/notification kinds không có gateway/combo/reminder ngoài scope.

FK/UQ được kiểm tra đủ quan hệ khai báo, nhưng **nghiệp vụ không được khai báo bằng FK** chính là trọng tâm phản ví dụ. Regex scripts không chứng minh generated SQL, constraint names, operator classes, isolation hay trigger privileges. Các kết luận về data states là khả năng theo schema chưa có SQL guards, không claim insert thật đã thành công. Severity/đề xuất có thể cập nhật sau owner review hoặc khi có thêm nguồn đã phê duyệt.

## J. Remediation roadmap và gate review tiếp theo

| Thứ tự | Deliverable cần review riêng | Điều kiện hoàn thành |
|---|---|---|
| 1 | Owner review draft audit; xác nhận nguồn Requirements và các quyết định Group B cần xử lý trước | H-18 source đầy đủ/provenance; O-01–13 có authority/status, vẫn không tự mở P1 |
| 2 | Remediation design cho H-02/H-04 và financial invariants H-05–08/H-20 | Key/field/SQL/service responsibility rõ; phản ví dụ bị chặn bởi layer chỉ định; numbering/lifecycle/payload binding/excess không còn ambiguity |
| 3 | Transaction/SQL migration design package từng slice, chưa execute | E-01–40 có owner, SQL concept→reviewed DDL, lock graph và idempotency/error recovery; primitives ready trước dependent business slice |
| 4 | Sau explicit authorization: schema remediation + migration draft + PostgreSQL integration tests | Review diff/new files trước Git; run target PG fresh instance và2clients; T-01–42 relevant cases có evidence, rollback/retry được chứng minh |
| 5 | Independent re-review rồi mới migration approval/release gate | High defects resolved hoặc có equivalent reviewed enforcement; no unresolved security/financial behavior; catalog/privilege/extension/retention/backup evidence, source/schema/SQL in sync |

Không yêu cầu toàn bộ feature runtime hoàn tất để bắt đầu **review migration draft** ở task sau, nhưng không thể phê duyệt schema→migration chính thức chỉ dựa `prisma validate` trong trạng thái này. Những invariant giao cho service phải có contract/tests và DB protections đúng layer; thiếu code ở giai đoạn schema-first được ghi là pending enforcement, không bịa implementation defects.

**Pending review:** chỉ báo cáo local này. Dừng sau audit; chưa sửa schema, nguồn nghiệp vụ, prior review, dependencies/config; chưa tạo migrations hoặc remediation. Kết luận NOT_READY áp dụng cho snapshot working copy nêu trên, không phải quyết định đóng P0 hoặc phê duyệt một phương án còn mở.
