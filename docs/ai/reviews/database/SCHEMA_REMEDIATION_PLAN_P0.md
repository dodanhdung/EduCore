# EduCore P0 — Schema Remediation Plan

**DRAFT LOCAL · 18/10/2026 · Asia/Saigon · chờ review, chưa phê duyệt triển khai.**

**Final refinement — lịch sử trước R1a/O-12 approval:** chủ dự án đã chấp thuận có điều kiện **hướng thiết kế R1–R6**. Các điều kiện bên dưới và mọi lựa chọn chi tiết vẫn **RECOMMENDED / PENDING_REVIEW**; chưa có authorization implementation hoặc migration. Ghi nhận này không cập nhật trạng thái trong `DECISION_REGISTER.md`.

**O-12 post-approval amendment · 18/10/2026 · Asia/Ho_Chi_Minh:** **O12-A=A, O12-B=B1, O12-C=C1, O12-D=D — APPROVED BUSINESS DECISION, 2026-10-18**, theo chỉ đạo trực tiếp của chủ dự án; [Decision Register §F](../../DECISION_REGISTER.md#f-o-12--approved-business-decision-2026-10-18), [O-12 addendum N](O12_DECISION_PROPOSAL.md#n-final-approved-decision--2026-10-18). Recommendation O12-A=B (charge-time pricing) trước đây **SUPERSEDED**. Chỉ O-12 business đã được duyệt; O-01/O-04/O-13 và technical proposals khác vẫn RECOMMENDED/PENDING_REVIEW. R1a có evidence schema local ở [R1a §7](SCHEMA_REMEDIATION_R1A.md#7-acceptance-checklist--mức-evidence); R1b/R2 chưa triển khai, PostgreSQL/migrations NOT RUN, H-04 chưa đóng. Các mô tả snapshot/line numbers/test evidence ở §2, §3.1–3.3 và §7 là lịch sử, không được dùng để ghi đè working copy hoặc phủ nhận approval mới.

## 1. Scope và kết luận đề xuất

**Wallet/Phase2 amendment · 19/10/2026:** owner trực tiếp **BUSINESS APPROVED B1–B5**, **PRINCIPLE ACCEPTED** minimal architecture; [Register §G](../../DECISION_REGISTER.md#g-wallet-p0--owner-business-approval-2026-10-19), [Wallet addendum N](WALLET_P0_SIMPLIFICATION_PROPOSAL.md#n-owner-business-approval--phase-2-docs-sync-2026-10-19). Đây là contract hiện hành bổ sung O-12, không approval toàn technical Q1–Q8. §10 cập nhật roadmap/source/status; các task scope/checks ở §1/2/7/9 trước đây là lịch sử. §4.5 excess-case/FIFO engine và §4.7 separate receipt-table proposal được giới hạn/supersede như nhãn dưới; không triển khai mới cho wallet-only cohort. H-04 **OPEN**, R1b/R2 chưa triển khai, PG/runtime NOT RUN. Không sửa AGENTS/schema/code trong Phase2.

Kế hoạch này xử lý audit Giai đoạn 3 và đồng bộ planning sau O-12 approval, không thực hiện technical remediation. Các lựa chọn kỹ thuật mới vẫn **RECOMMENDED**, không phải APPROVED. Audit NOT_READY chưa đóng; phản ví dụ H-02/student H-04 ở snapshot cũ đã có sửa chữa PSL local R1a, nhưng H-04 period/price/source guards chưa triển khai và PostgreSQL enforcement chưa được kiểm chứng. Không suy diễn đây là lỗi production đã xảy ra.

Hướng đề xuất: dùng composite FK cho identity/session/student; dùng SQL CHECK/UQ/EXCLUDE cho invariant biểu diễn được; dùng PostgreSQL guard có khóa và bảo vệ cả phía parent cho quan hệ thời gian; dùng transaction protocol cho completeness, authorization, ledger và retry. Không dùng CHECK chứa subquery hoặc chỉ dựa vào service để đóng confirmed relational defects.

**Phạm vi post-approval18/10 — lịch sử:** `docs/ai/reviews/database/SCHEMA_REMEDIATION_PLAN_P0.md`, và chỉ sửa hai alias đường dẫn DD/API trong `AGENTS.md`, `docs/ai/PROJECT_CONTEXT.md` (không có PROJECT_CONTEXT.md ở root). Lượt refinement lịch sử chỉ sửa plan ở đường dẫn cũ `docs/ai/SCHEMA_REMEDIATION_PLAN_P0.md`; report nay đã chuyển vào reviews/database, không restore vị trí cũ. Các giới hạn/checks scope này là lịch sử; Phase2 wallet19/10 chỉ18existing docs theo §10, **không sửa AGENTS/schema/code/migrations**. Các đường dẫn triển khai tương lai trong §5 là proposal, không authorization tạo file/triển khai slice.

## 2. Sources, Git và provenance

### 2.1. Snapshot thực tế

**Snapshot lịch sử trước R1a/O-12 amendment**, giữ nguyên paths/hash/line numbers và nhận định provenance bên dưới để truy vết. Sources hiện hành dùng đường dẫn đã kiểm ở §9.1; không hiểu các số 387 dòng hoặc schema hash cũ như trạng thái working copy sau đồng bộ O-12.

- Branch: `feat/prisma-p0-schema`; HEAD: `6173e2efc7d1c2c0d9b8559baf2a858c37b7f867`.
- Đầu task: `M apps/api/prisma/schema.prisma`, `M docs/ai/SCHEMA_REVIEW.md`, `M docs/requirements/requirements_analysis.md`, `?? docs/ai/SCHEMA_AUDIT_P0.md`; không có staged diff. Đây là thay đổi có trước, phải giữ nguyên.
- Audit áp dụng cho **working copy**. Hash schema và schema review hiện tại khớp snapshot audit; Requirements đã thay đổi so với snapshot audit. Không gọi schema working copy là schema HEAD hoặc bản đã merge.
- Diff có trước (`git diff --numstat`, theo cấu hình newline hiện có): schema +525/−31 dòng; schema review +48/−15; Requirements +91/−0. Đây là thống kê Git, không phải thay đổi của task này.
- Khi bắt đầu refinement, report này cũng đã là untracked; branch/HEAD và các thay đổi nguồn trên giữ nguyên. Chụp hash 82 file Git tracked/untracked không bị ignore để kiểm chứng chỉ report thay đổi; không stage report để xem diff.

| File | SHA-256 đầu task |
|---|---|
| `apps/api/prisma/schema.prisma` | `7f78d2bd1d625a3a685e3a161ad8611fd591a1223872f8da8afabaf5f85598ec` |
| `docs/ai/SCHEMA_REVIEW.md` | `36a2eebea85fd9725d6280320deb32019ecf998c8fbee06b43a5c11c8bc6fc24` |
| `docs/ai/SCHEMA_AUDIT_P0.md` | `621054cbdd853417769a5e40f8da44efe900297df702a948e341ce04e3ecdaa1` |
| `docs/requirements/requirements_analysis.md` | `fd5120769b4e9cb09be53b99b192d75ceaa1f28f3b877d8e1ff92bc1464f481d` |

### 2.2. Authority dùng để lập kế hoạch

| Nguồn đã đọc | Phần liên quan / giới hạn |
|---|---|
| `docs/requirements/requirements_analysis.md` | Changelog v5; BR-01/04/06/08–14; §7 Q-01–Q-15; §8 Internal-first. Working copy hiện có 387 dòng, khác HEAD; phân tích H-18 ở §3.3. |
| `docs/requirements/usecase/specification.md` | UC-10–16, UC-21–29, UC-31/32, UC-34–37; Q ở §7; audit dùng C và AC tương ứng. Register gọi v1.3 nhưng file không có header v1.3 độc lập; giữ giới hạn provenance đó. |
| `docs/architectural/architectural_design.md` | Accepted modular monolith, PostgreSQL/Prisma, tenant, transaction/outbox; không biến isolation/lock proposal thành quyết định đã duyệt. |
| `docs/design/database_design.md` | v1.1, §3.5–3.8, DB-01–14, §5, §9; Group A Billing ở dòng 233–239. SQL minh họa chưa phải migration đã thử. |
| `docs/design/detailed_design.md` | §5 domain, §6 coordinators, §9 Group A, §A.4 quyết định còn mở. Đây là tên file thật; `detailed_des.md` trong context là tham chiếu cũ. |
| `docs/design/api_specification.md` | Contract auth/billing/workflow và §11 pending; không phải API đã implement. `api_spec.md` là tham chiếu cũ. |
| `docs/design/class design/` | Invariants/open decisions và appendix Group A của academic, resource-scheduling, attendance-leave, billing-receivables, identity-access, tenant-policy, workflow-approval, automation-jobs, audit-traceability, assignments-grading, file-management; notification/reporting theo các invariant audit dẫn. Các class/service signatures là đề xuất. |
| `docs/ai/DECISION_REGISTER.md` | BASE-01–04, GA-01–07, SCH-TECH/BILL-TECH/WF-TECH, UI-GRADE và review-first; không đổi trạng thái tại đây. |
| `docs/ai/SCHEMA_AUDIT_P0.md` | H-01–20, M-01–08, L-01; E-01–40 là enforcement backlog, T-01–42 là test plan, O-01–13 là quyết định mở. Dùng ID gốc, không coi audit là business authority. |
| `docs/ai/SCHEMA_REVIEW.md`, `PROJECT_CONTEXT.md` | Đối chiếu nhận định trước; snapshot “chưa có schema” trong context đã cũ. |

Đã đọc `.agents/skills/educore-feature-slice/SKILL.md` để đối chiếu các gate nguồn/Git/integrity. Task này là planning audit rộng theo phạm vi explicit của người dùng; không mở một implementation slice hay tạo feature spec phụ. Không truy cập nguồn ngoài workspace.

## 3. Confirmed defects — xác minh độc lập và thiết kế khắc phục

§3.1 và phần FK student §3.2 giữ evidence/phương án ở snapshot audit trước R1a; [R1a](SCHEMA_REMEDIATION_R1A.md) mới là evidence local hiện hành cho H-02A/H-04A student-only. Chỉ Gate S trong giới hạn report đó, chưa Gate P/R; không yêu cầu owner phê duyệt lại hai lựa chọn local đã cho phép. Phần period/parent/locking dưới đây đã được đồng bộ planning theo O-12, vẫn cần technical sign-off trước R1b.

### 3.1. H-02 — AttendanceRecord có thể gắn finalization khác session

**Xác minh:** `AttendanceRecord` ở schema dòng 1042 dùng participant FK `(tenantId,participantId) → SessionParticipant(tenantId,id)` và finalization FK nullable `(tenantId,finalizationId) → AttendanceFinalization(tenantId,id)`. `AttendanceFinalization.sessionId` ở dòng 1022 không tham gia FK của record. Có thể chọn P/S1 và F/S2 cùng tenant; cả hai FK đều hợp lệ. `@@unique([tenantId,participantId])` không nối hai session. Đây là suy luận constraint, chưa INSERT thật.

Invariant cần bảo vệ: mọi record có finalization phải thỏa `participant.sessionId = finalization.sessionId`; draft NULL vẫn hợp lệ. Điều này không tự chứng minh Teacher đủ quyền hay toàn bộ roster đã được xác nhận (H-03).

| Phương án | Integrity, hiệu năng | Maintainability / Prisma | Kết luận |
|---|---|---|---|
| A. Schema extension `AttendanceRecord.sessionId` + hai composite FK | Declarative, chặn mọi INSERT/UPDATE qua DB; thêm UUID/row và một candidate UQ; lookup FK bằng B-tree, không chạy join trigger mỗi lần ghi. Phải chặn re-key/cascade làm đổi lịch sử. | Schema/client nhìn thấy quan hệ; cần backfill nếu có dữ liệu và kiểm nested connect với FK chồng cột. | **RECOMMENDED**: độ rõ và độ bền cao nhất cho equality invariant. |
| B. Giữ cột hiện tại, PostgreSQL trigger join participant/finalization | Ít đổi PSL, nhưng trigger phải bao phủ child INSERT/UPDATE và parent đổi session; khóa/re-read để tránh write skew. Chỉ trigger trên record không đủ. | SQL tùy biến, logic ngoài Prisma và cần catalog/drift tests; join/index/lock trên mỗi lần ghi. | Hợp lý nếu bắt buộc giữ schema, rủi ro bảo trì cao hơn A. |

**Danh mục thay đổi chính xác cho A — chưa áp dụng:**

| Model / đối tượng | Thay đổi RECOMMENDED |
|---|---|
| `AttendanceRecord` | Thêm required `sessionId String @map("session_id") @db.Uuid`. Đổi relation `participant` sang `(tenantId,sessionId,participantId) → (tenantId,sessionId,id)`; đích UQ đã có ở `SessionParticipant`. |
| `AttendanceFinalization` | Thêm `@@unique([tenantId,sessionId,id], map: "af_tenant_session_id_uq")`; giữ UQ `(tenantId,sessionId)` và `(tenantId,id)`. |
| `AttendanceRecord.finalization` | Thay FK cũ bằng `(tenantId,sessionId,finalizationId) → AttendanceFinalization(tenantId,sessionId,id)`, tên dự kiến `ar_finalization_session_fk`; `onDelete: Restrict, onUpdate: Restrict`. FK participant dự kiến `ar_participant_session_fk`, cùng actions. |
| Index / guards | Giữ UQ record/participant và candidate phục vụ InvoiceLine. Review index `(tenantId,sessionId,finalizationId)` cho FK reverse lookup; không tự xóa index cũ. Freeze identity của record/participant/finalization khi có lịch sử; H-20/R3/R4. |

```prisma
// PSEUDO-DIFF CHỈ ĐỂ REVIEW; không phải schema hoàn chỉnh/đã validate.
model AttendanceRecord {
  // + sessionId String @map("session_id") @db.Uuid
  // ~ participant @relation(fields: [tenantId, sessionId, participantId],
  //     references: [tenantId, sessionId, id],
  //     onDelete: Restrict, onUpdate: Restrict, map: "ar_participant_session_fk")
  // ~ finalization? @relation(fields: [tenantId, sessionId, finalizationId],
  //     references: [tenantId, sessionId, id],
  //     onDelete: Restrict, onUpdate: Restrict, map: "ar_finalization_session_fk")
}
model AttendanceFinalization {
  // + @@unique([tenantId, sessionId, id], map: "af_tenant_session_id_uq")
}
```

FK nullable dùng semantics MATCH SIMPLE: `finalizationId=NULL` bỏ kiểm FK đó, nhưng required session/participant FK vẫn buộc record đúng session. Không chọn MATCH FULL vì draft có tenant/session non-NULL và finalization NULL. Giữ back-relations hiện tại; không cần direct `AttendanceRecord → ClassSession` dư thừa để chứng minh equality. Phải validate PSL/client sau khi phương án được duyệt; snippet không chứng minh Prisma chấp nhận mọi thao tác nested write.

**Acceptance H-02 / mở rộng T-09:**

| Case | Kết quả PostgreSQL bắt buộc sau này |
|---|---|
| P/S1, F/S2, record.session=S1 | INSERT bị FK finalization từ chối, SQLSTATE `23503`. |
| P/S1, F/S2, record.session=S2 | INSERT bị FK participant từ chối, `23503`. |
| P/S1, F/S1; cùng tenant | Thành công; giữ at-most-one attendance/participant. |
| P/S1, F=NULL, session=S1 | Draft thành công, không đủ điều kiện billing nguồn thường. |
| Đổi finalizationId/sessionId/participantId hoặc tenant để bypass | UPDATE sai bị FK/identity guard từ chối; đúng draft edit vẫn hoạt động theo whitelist. |
| Đổi session của P/F, re-key parent hoặc cascaded update | Không làm record đã tồn tại đổi nghĩa; Restrict/identity guard từ chối. Test cả SQL trực tiếp và Prisma. |
| Hai connection: gắn record trong lúc parent bị đổi session | Không có final committed state vi phạm; một bên chờ rồi thất bại/retry. |

Nếu có dữ liệu, backfill session từ participant; tách danh sách F khác session để đối soát, không tự sửa sang F mới hoặc xóa dữ liệu. Chỉ NOT NULL/validate constraint sau khi không còn vi phạm. Chưa xác minh database nào tồn tại; đây là quy trình tương lai.

### 3.2. H-04 — InvoiceLine thiếu student identity và period containment

**Xác minh:** `Invoice` dòng 1180 nối BillingRun bằng `(tenant,billingRun,student,period)`, đúng cho header. `InvoiceLine` dòng 1223 chỉ nối invoice bằng `(tenant,invoiceId)`; participant bằng `(tenant,sessionId,participantId)` và attendance bằng `(tenant,participantId,attendanceId)`. Không có FK nối `Invoice.studentId` với `SessionParticipant.studentId`, cũng không có guard so thời gian session với BillingPeriod.

Phản ví dụ: I của X/tháng 09, P của Y/buổi tháng 08, attendance A đúng P; line trỏ I/P/session(P)/A cùng tenant vẫn thỏa các FK. Kể cả X=Y, sai tháng vẫn được PSL cho phép. FK priceRule cùng tenant cũng không chứng minh đúng target/hiệu lực/ưu tiên; phần này thuộc H-09/M-04 và service contract, không gộp thành bằng chứng FK student đã giải quyết giá.

| Phương án | Integrity / hiệu năng | Maintainability / Prisma | Đánh giá |
|---|---|---|---|
| A. Hybrid: thêm `InvoiceLine.studentId`, composite FK hai phía; SQL guard cho period | Equality được FK bảo vệ; period guard join invoice→period/session/tenant có index và khóa. Một UUID thêm trên line, hai candidate keys; tránh nhân bản month/date/timezone trên mọi line. | Phần quan hệ nằm trong PSL; SQL thời gian phải được quản lý/test riêng. | Student FK có R1a local S evidence; O-12 business đã duyệt, period technical D/P còn pending. |
| B. Giữ schema, trigger kiểm cả student và period | Không thêm cột/key; mọi write phải join nhiều parent, có guards cho reverse mutation và concurrency. | Client ít thay nhưng integrity ẩn nhiều trong SQL; chi phí drift/debug lớn hơn A. | Phương án dự phòng hợp lý khi không được extension schema. |
| C. Materialize thêm student/period/businessDate/timezone hoặc session→billing-period mapping | Composite FK chứng minh các giá trị lưu bằng nhau; vẫn cần guard chứng minh businessDate xuất phát từ session và nằm trong tháng, nhất là reschedule/timezone. FK không tự kiểm range. | Nhiều cột/UQ/backfill, đồng bộ mapping; có ích khi thật sự cần snapshot/session attribution riêng. | Chưa có căn cứ cho mức extension này ở P0; không gọi đây là lời giải thuần FK cho period. |

**Danh mục thay đổi chính xác cho A — chưa áp dụng:**

| Model / constraint | Đề xuất |
|---|---|
| `InvoiceLine` | Thêm required `studentId String @map("student_id") @db.Uuid`; không thêm `periodId` trùng header. |
| `Invoice` | Thêm `@@unique([tenantId,id,studentId], map: "inv_tenant_id_student_uq")`; đổi line.invoice FK sang `(tenantId,invoiceId,studentId) → (tenantId,id,studentId)`, tên `il_invoice_student_fk`. |
| `SessionParticipant` | Thêm `@@unique([tenantId,sessionId,studentId,id], map: "sp_tenant_session_student_id_uq")`; đổi line.participant FK sang `(tenantId,sessionId,studentId,participantId) → (tenantId,sessionId,studentId,id)`, tên `il_participant_student_fk`. |
| Relations / indexes | Hai FK mới dùng `onDelete: Restrict, onUpdate: Restrict`; giữ back-relations, attendance/session/claim FKs và UQ đang có. Đánh giá index referencing `(tenantId,invoiceId,studentId)`; không xóa candidate keys đang phục vụ H-02 hoặc claim. |
| PostgreSQL guard | Dự kiến `il_period_guard` và các parent guards cho `ClassSession.startsAt/endsAt`, `Invoice.periodId/studentId`, `BillingPeriod.monthStart/monthEnd`, `Tenant.timezone`; bảng/cột vật lý theo `@map`. Không thêm cột cho period trong A. |

```text
PSEUDO-DIFF, KHÔNG ÁP DỤNG:
+ InvoiceLine.studentId : UUID NOT NULL
+ Invoice UNIQUE(tenantId, id, studentId)
+ SessionParticipant UNIQUE(tenantId, sessionId, studentId, id)
~ InvoiceLine.invoice FK (tenantId, invoiceId, studentId)
    -> Invoice(tenantId, id, studentId) RESTRICT DELETE/UPDATE
~ InvoiceLine.participant FK (tenantId, sessionId, studentId, participantId)
    -> SessionParticipant(tenantId, sessionId, studentId, id) RESTRICT DELETE/UPDATE

GUARD period(line), proposal kỹ thuật theo O-12 business đã duyệt:
  lock referenced tenant/period/session/invoice in reviewed common order;
  freshly re-read I, B=I.period, S=line.session, T=I.tenant;
  assert all identities/tenant agree (also enforced by FKs);
  z = frozen tenant timezone;            // approved C1, trusted snapshot, not client input
  d = local_date(S.startsAt, z);         // approved B1 sourceBusinessDate
  assert B.monthStart <= d AND d < B.monthEnd;
  otherwise reject with stable constraint/error name;
  store source timezone, session revision, attribution rule version in snapshot.
```

**Period/C1 business APPROVED; parent enforcement RECOMMENDED:** tháng theo ngày bắt đầu session tại timezone tenant, không split buổi qua tháng. C1 freeze atomically ở first ScheduleSeries/ClassSession (kể cả DRAFT), BillingPeriod hoặc BillingRun/generation; sticky kể cả hủy/xóa nguồn. Ops chỉ cấu hình trước boundary, không bypass sau freeze. Snapshot giữ z và derived dates; không dùng UTC month/session end/draft month hoặc client JSON thay source. Lựa chọn timezone transition không thuộc P0 hiện hành; schema marker, SQL/privileges, backfill/tzdata controls cần technical review O-01/O-04/O-13, không hỏi lại C1.

Guard chạy cả INSERT/UPDATE line, kể cả zero/CANCELLED source; NULL attendance cho buổi hủy vẫn được phép. Parent identity và kỳ đã dùng không được re-key âm thầm. Session có issued source không đổi thời gian để tính lại invoice; xử lý correction/adjustment. Draft reschedule chỉ qua transaction khóa nguồn, bỏ/recompute các draft lines bị ảnh hưởng rồi kiểm lại; không để stale line commit. Parent guards phải kiểm tra ngược khi session/period/invoice/timezone đổi; không chỉ kiểm child.

SQL trigger không tự tạo concurrency safety. Contract cụ thể ở §3.2.1–3.2.3 thay phần mô tả khóa tổng quát trước refinement. Conditional history guards triển khai cùng relational fix cần thiết; không đợi toàn bộ R4 mới bảo vệ parent này.

**Acceptance H-04 / mở rộng T-14/17/38:**

| Case | Kết quả bắt buộc sau này |
|---|---|
| I/X, P/Y, line.student=X hoặc Y | Một trong hai composite FK từ chối `23503`; không có giá trị student giúp bypass. |
| I/X/tháng09, P/X/buổi tháng08 hoặc tháng10 | SQL period guard từ chối INSERT/UPDATE dù các FK student đều đúng. |
| Buổi bắt đầu đúng đầu kỳ; đúng đầu tháng kế tiếp | Đầu kỳ được nhận; đầu tháng sau bị loại khỏi kỳ trước theo `[start,end)`. |
| `2026-08-31T17:00:00Z` tại Asia/Ho_Chi_Minh | Thuộc 01/09; không dùng ngày UTC để gán tháng. |
| Buổi 30/09 23:30→01/10 00:30 local | Theo B1 đã duyệt: chỉ một nguồn tháng09, không duplicate tháng10; pricing date cũng 30/09 theo A=A. |
| Hủy buổi, attendance=NULL, cùng student/tháng | Line zero hợp lệ; không tạo attendance giả. Thiếu attendance ở nguồn thường phải NEEDS_INFORMATION/block ISSUE. |
| Đổi header student/period, participant owner, session thời gian, month bounds hoặc timezone sau line | Reject hoặc transaction recompute draft hợp lệ; issued snapshot/claims không đổi nghĩa. |
| Hai connection: insert line vs reschedule/đổi kỳ/timezone | Không có state sai period/student commit; chạy cả SQL trực tiếp, Prisma update/nested connect và rollback. |
| Valid identity/period nhưng price target sai | ISSUE bị domain/SQL price guard đã review từ chối; không ghi PASS cho H-04 rồi mặc nhiên đóng pricing. |

H-04 chỉ được đóng khi student/period/price-source obligations liên quan có enforcement/test đúng layer, gồm parent/race coverage; R1a student FK không đủ. O-12 business đã APPROVED; period vẫn OPEN tới technical O-01/O-04/O-13 phù hợp, R1b SQL và R2/R3 cross-domain evidence. Backfill student phải so invoice và participant trước, không tự lấy một phía rồi che mismatch.

#### 3.2.1. Transaction contract H-04 — RECOMMENDED, chưa triển khai

**Chọn một protocol đủ xác định để kiểm chứng:** P0 dùng **một transaction mutex trên row Tenant hiện có**, `SELECT id FROM tenants WHERE id=:tenant FOR NO KEY UPDATE`, giữ đến commit/rollback. Hai người ghi cùng tenant phải tuần tự qua row này; hai tenant khác nhau vẫn chạy độc lập. Chọn NO KEY UPDATE để không xung đột vô ích với FK KEY SHARE; nó vẫn xung đột với writer giữ NO KEY UPDATE/UPDATE, gồm timezone update. Không dùng KEY SHARE làm mutex, không dùng PostgreSQL session advisory lock hoặc lock trong transaction khác.

Đây là technical refinement của O-01, có đánh đổi throughput. Resource/class/session locks và GiST vẫn giữ cho các invariant riêng; chưa được bỏ mutex để tối ưu khi chưa có chứng minh/test thay thế. R6 phải đo API/scheduling NFR trên fixture; nếu gate này quá chậm, review lại fine-grained student/period/source anchors và predicate protection trước khi đổi protocol. Không tuyên bố hiệu năng đã đạt.

**Mọi writer cần đi qua gate trước đọc quyết định hoặc DML:** tạo/sửa/xóa draft line; ISSUE/claim; reschedule/cancel/create session; participant/enrollment/transfer/roster; finalization/attendance/absence/correction; price/policy/effective-source thay đổi; period/run/invoice; payment/reversal/adjustment/excess; approval effect và thay đổi quyền tenant có thể làm authorization stale. Worker execute dùng cùng đường. Read UI/preview không giữ gate và không có quyền đặt chỗ. Global User disable cần coordinator R4 khóa đủ các tenant liên quan theo thứ tự trước mutation; không được bắt đầu giữ invoice rồi quay lên lấy tenant gate.

**Boundary DB bắt buộc để protocol không chỉ là quy ước service:** runtime role không có INSERT/UPDATE/DELETE trực tiếp trên các bảng/cột nguồn được bảo vệ; chỉ EXECUTE các command functions đã review. Function owner tối thiểu quyền, không DDL/superuser, cố định search_path, qualify tên bảng, REVOKE EXECUTE FROM PUBLIC, không nhận SQL do client cung cấp. Command kiểm actor/tenant/target hiện hành; API authorization vẫn bắt buộc. Prisma transaction gọi gateway qua parameterized SQL, không dựa vào nested write tự lấy khóa. Direct DML của runtime bị permission denied; test FK bằng fixture role riêng, test runtime bằng gateway. Migration/restore owner có thể vượt protection nên không được dùng làm runtime role. Nếu muốn giữ Prisma direct DML, phải trình một DB-enforced entry/locking protocol khác và chứng minh snapshot/race tương đương trước approval; không coi một GUC “đã lấy gate” do client đặt là chứng cứ.

**Transaction isolation:** READ COMMITTED cho protocol này. Gate acquisition là SQL statement riêng, hoàn tất **trước** statement đọc nguồn và trước DML. Sau khi chờ gate, thực hiện truy vấn mới để lấy snapshot committed mới; không dùng dữ liệu preview/SELECT trước gate để tính tiếp. Các gateway phải giữ semantics fresh snapshot bằng các statement volatile/PL/pgSQL đã review, không gộp lock và validation trong một CTE/STABLE function dùng snapshot cũ. REPEATABLE READ/SERIALIZABLE không tự thay thế contract này; nếu hỗ trợ phải có nhánh retry và snapshot proof riêng. Gateway không tự COMMIT bên trong transaction của caller.

| Rank sau BEGIN | Khóa/đọc theo thứ tự tăng; nhiều IDs luôn sort |
|---|---|
| 1 | Tenant gate; command nhiều tenant lấy toàn bộ tenant IDs tăng dần từ đầu hoặc abort/restart nếu khám phá thêm tenant thấp hơn. |
| 2 | Current authorization dưới gate; idempotency `(operationType,key)`; ApprovalRequest nếu có, FOR UPDATE; xác minh hash/revision/decision intent. |
| 3 | BillingPeriod FOR SHARE; BillingRun/generation FOR UPDATE theo ID nếu command dùng; immutable payload và expected base/current generation CAS theo O12-D. |
| 4 | Course/class/pricing anchors, resource registry, ClassSession theo ID; FOR UPDATE khi mutate, FOR SHARE khi chỉ validate. |
| 5 | SessionParticipant, AttendanceFinalization, AttendanceRecord/absence theo type+ID; khóa ghi hoặc SHARE tương ứng. |
| 6 | Tất cả invoices liên quan FOR UPDATE, rồi lines/discounts/claims và financial children theo type+ID. |
| 7 | Counter/excess case/history, receipt/idempotency result/audit/outbox; append cùng transaction. |

Gate đã ngăn writer cùng tenant nên source set không đổi trong bước khám phá. Khám phá complete dependency set **sau gate**, trước khóa ranks thấp hơn; nếu cần thêm parent có rank đã đi qua, rollback/restart và lấy full set, không đảo thứ tự để “sửa nhanh”. Không external I/O trong critical section; timeout và pool behavior phải được test. Thứ tự này ràng buộc cả R2/R3/R4, thay các mô tả trước chưa cố định request→invoice/source ordering.

```text
H04 command, PSEUDOCODE KHÔNG EXECUTE:
BEGIN READ COMMITTED;
  acquire tenant gate as separate statement;
  re-read current actor scope; reserve/compare typed idempotency key;
  discover current OLD+NEW dependencies; lock parents in rank order;
  re-read source revisions, timezone, month and draft/issued state;
  apply authorized domain change; invalidate affected drafts/generations atomically;
  do not refresh immutable G1; explicit new-key/reason/CAS G2 required to recompute;
  reject/rollback if retained lines cannot satisfy final period/source guards;
  check student/session equality via immediate FK;
  SET CONSTRAINTS <named deferred source/period guards> IMMEDIATE;
  save result + audit/outbox in same TX; run any newly queued final checks;
COMMIT;  // only now return success; errors roll back the whole command
```

**Per-command behavior:** line insert locks actual participant/session plus target invoice, lấy student từ nguồn và đối chiếu invoice; không tin student/date từ request. Reschedule chỉ tương lai theo Q-04, khám phá OLD+NEW sessions/resources và mọi draft liên quan; past/claimed/issued nguồn không được đổi thời gian/identity. Authorized attendance correction có flow riêng, issued financial effect qua adjustment. Source mutation hợp lệ invalidate affected drafts/current generation, chặn ISSUE; không tự rewrite/refresh G1 hoặc tạo G2 từ retry. Muốn rebuild cần explicit command/key/reason/expected-generation CAS, dùng cùng reviewed protocol; nếu chưa có command được phép thì bỏ mutable stale lines khi hợp lệ hoặc reject/rollback whole mutation, không commit wrong-period line chờ job sửa. Không đổi invoice student/tenant/month identity hoặc tự tạo monthly draft trước kỳ đóng; admission G2 và current applied pointer theo §4.12/R2. Price mutation không backdate/reprice buổi đã bắt đầu; source class/course lineage lịch sử giữ. Payload/result G1 và original issued amounts/claims không sửa.

Theo C1 đã duyệt, Tenant.timezone không đổi sau boundary nguồn đầu tiên ở §3.2; sticky marker/DB immediate guard là đề xuất kỹ thuật chưa applied. BillingPeriod.monthStart/monthEnd và Invoice tenant/student/period/run identity bất biến sau tạo theo proposed parent guard contract; parent re-key/child re-parent lịch sử bị cấm. Không chuyển invoice cũ sang tháng khác; attribution/timezone business không còn pending. O-01/O-04/O-13 và SQL/data-precheck/concurrency sign-off vẫn pending trước DDL.

#### 3.2.2. Immediate/deferred guards, rollback và retry

| Layer | Thời điểm / trách nhiệm |
|---|---|
| Permission gate | Trước DML; runtime direct table mutation bị từ chối. Không tin trigger tự lấy mutex sau khi statement đã đọc snapshot. |
| FK/UQ/row CHECK | Immediate/non-deferrable: tenant/student/session identity, unique source/claim/month, amount/shape và history identity guard. Không trì hoãn FK để tạm trỏ student sai. |
| Period/source cross-row constraints | AFTER ROW constraint triggers, DEFERRABLE INITIALLY DEFERRED, trên line INSERT/UPDATE/DELETE và parent INSERT/UPDATE/DELETE có liên quan. Recheck **current final rows** theo OLD+NEW dependency IDs; line đã bị xóa thì không dùng NEW tuple cũ để kiểm. Parent trigger kiểm ngược tất cả line còn tồn tại; không chỉ child trigger. |
| Draft intermediate state | Được bỏ/rebuild lines trong cùng transaction, chưa được caller thấy; cuối transaction mọi line còn lại phải đúng kỳ và mọi run đánh complete phải đủ nguồn. Không deferred history rewrite của issued data. |
| Commit boundary | Gateway ép SET CONSTRAINTS các guard có tên IMMEDIATE sau final mutations để nhận lỗi trước trả response; lỗi trong COMMIT vẫn là command failure. Không trả success từ giữa transaction. |

Gate loại phantom writer; deferred trigger kiểm trạng thái cuối chứ không bổ sung concurrency protection còn thiếu. FK period matching không làm thay completeness của ISSUE: R2 vẫn kiểm nguồn mới/override/roster dưới cùng gate và claim toàn bộ kể cả zero lines. Thêm guard/index/inverse coverage được catalog test; không sửa SQL trong task này.

`40P01`/`40001` và lock timeout có thể retry **toàn transaction** từ BEGIN sau rollback, cùng operation key/hash/policy và expected revision; số lần/budget request phải được O-01/S-ops duyệt, không mượn lịch 1/5/15 phút của persistent jobs làm retry vô hạn cho HTTP. `23503/23514` hoặc period mismatch là lỗi dữ liệu/business, không blind retry; `23505` phân biệt replay key cùng hash với logical conflict; `23P01` là booking conflict phải re-evaluate. Mất connection tại COMMIT là outcome unknown: lấy gate lại, kiểm result/effect unique key trước retry. Rollback phải bỏ toàn bộ reschedule/recomputed lines/new run/counter/claims/audit business/outbox; không để mutation “đã thành công một nửa”.

#### 3.2.3. H-04 concurrency acceptance — test plan chưa chạy

| Hai connections / fault point | Kết quả cần chứng minh ở gate PostgreSQL |
|---|---|
| A insert tháng09 giữ gate; B reschedule sang tháng10 | B chờ và đọc fresh; runtime past/issued reschedule bị reject theo Q-04/claims, không auto chuyển draft. Fixture đặc quyền kiểm inverse guard riêng: mutation hợp pháp phải invalidate/rebuild bằng command được phép hoặc rollback, không final line sai kỳ. A rollback thì B không thấy phantom line. |
| B reschedule commit trước; A insert từ preview tháng09 | A chỉ đọc lại sau gate, reject sai kỳ hoặc tạo nguồn tháng10 đúng command; không dùng preview cũ. |
| Hai line inserts cùng participant/invoice hoặc cùng source ở ISSUE | Serial qua gate; duplicate logical line/UQ/claim không tạo hiệu ứng thứ hai; khác key không bypass claim. |
| Attendance/price/roster INSERT mới giữa preview và ISSUE | Writer trước gate được ISSUE đọc lại; writer sau ISSUE bị history/source policy xử lý. Không có price override/participant phantom lọt snapshot. |
| Parent đổi timezone/month bounds/student hoặc cascade re-key | Immediate immutable guard/FK reject; kể cả line không được UPDATE trực tiếp. |
| Xóa stale draft line, đổi session, thêm line tháng mới rồi lỗi guard | Rollback cả ba bước; invoice/run/booking/audit/outbox quay về trạng thái trước. |
| Tạo line tạm sai kỳ rồi sửa/xóa trước SET CONSTRAINTS | Trạng thái cuối hợp lệ pass; giữ line sai kỳ đến SET/COMMIT fail. FK sai student vẫn fail ngay. |
| Runtime raw SQL/Prisma nested DML; gateway đúng quyền | DML trực tiếp permission denied; gateway hợp lệ pass. Fixture role chứng minh FK/trigger còn reject khi bypass service validation. |
| Gate wait/timeout/deadlock/unknown commit; hai tenant khác nhau | Bounded retry không duplicate; khác tenant không bị mutex chung. Đo contention; chưa có performance/concurrency PASS. |

### 3.3. H-18 — Requirements đầy đủ đã có ở working copy, chưa đồng bộ HEAD

Đã tìm thấy ứng viên đúng mô tả người dùng ngay tại `docs/requirements/requirements_analysis.md`: **387 dòng**, §7 dòng 297, đủ 15 heading Q-01–Q-15, §8 Internal-first dòng 369, §9 truy vết dòng 376. Không cần yêu cầu cung cấp lại vì bản đầy đủ phù hợp mô tả đã có trong workspace. Không có bản đính kèm độc lập/hash gốc để chứng nhận byte-for-byte đây chính là lần cung cấp riêng; provenance đó vẫn cần review.

Có đủ hai bản để lập diff: bản repository tại HEAD (296 dòng) và bản working copy hiện tại (387 dòng). So sánh nội dung chuẩn hóa CRLF/LF cho thấy **toàn bộ 296 dòng cũ giống nhau**, chỉ nối thêm 91 dòng. Byte hash được lưu riêng ở §2; không đồng nhất so sánh newline với byte equality.

```diff
--- HEAD:docs/requirements/requirements_analysis.md (296 dòng)
+++ working copy:docs/requirements/requirements_analysis.md (387 dòng)
@@ sau dòng 296; +91 dòng, không xóa/sửa phần cũ @@
+ §7: Q-01–Q-15, dòng 297–368
+ §8: Internal-first, dòng 369–375
+ §9: quản lý thay đổi/truy vết, dòng 376–387
```

Đây là structural diff; full diff review bằng `git diff -- docs/requirements/requirements_analysis.md`, không tái tạo Q trong báo cáo. Q-08/10/11/13/14 trong phần thêm xác nhận baseline 7 ngày, payment thủ công, không auto refund, file/grade, retry và audit; vẫn còn các chi tiết kỹ thuật ở O-01–13.

**Đồng bộ RECOMMENDED, task riêng sau review:** giữ working copy hiện tại; review đúng diff +91 dòng/provenance với bản người dùng đã cung cấp, đối chiếu UC §7 và Group A; sau đó mới cho phép sync Git bằng authorization riêng. Nếu phát hiện khác bản gốc, yêu cầu bản gốc để diff, không tự tái tạo hay ghi đè Requirements. Audit cũ giữ nguyên làm bằng chứng lịch sử; lần delta review dẫn snapshot mới và phân biệt “thiếu nội dung đã hết ở working copy” với “nguồn được review/đã sync”. Không đổi H-18 hay register thành APPROVED/RESOLVED trong task này.

**Acceptance nguồn:** reviewer xác nhận provenance của bản 387 dòng; đủ Q-01–15/§8, không mất FR/BR/NFR cũ; không conflict chưa giải quyết với UC/Group A; ghi branch/commit/hash khi sync được phép. Hiện đạt kiểm tra cấu trúc local, **chưa đạt sign-off provenance/Git**. Có thể tiếp tục planning độc lập; R6 sign-off nguồn còn bị gate này chặn.

## 4. O-01–O-13 — decision board

Mỗi default kỹ thuật dưới đây vẫn **RECOMMENDED**. Ngoại lệ đã có authority: **O12-A=A/B=B1/C=C1/D=D business APPROVED 2026-10-18** ở §4.12; không còn chờ owner chọn lại. “Không đổi PSL” vẫn có thể cần SQL migration. Các câu hỏi tài chính/học vụ/security khác giữ pending, không tự approve O-01/O-04/O-13 hoặc mở lại Group A.

### 4.1. O-01 — locks, isolation và completeness guards

- **Đã chốt:** BR-01/Q-04; all-or-nothing, kiểm lại khi ghi; Group A registry + SQL exclusion, không chỉ preflight. Chưa chốt SCH-TECH lock hierarchy/isolation.
- **A:** row locks trên resource registry + class/session/roster/pricing aggregate anchors, READ COMMITTED và fresh re-read; dễ quan sát, nhưng tất cả writers phải cùng protocol để ngăn phantom/capacity race. **B:** transaction advisory locks cho logical key chưa có row; ít schema, nhưng mapping/namespace/order sai sẽ bỏ khóa. **C:** SERIALIZABLE + bounded retry cùng constraints; bảo vệ predicate tốt hơn nhưng abort/chi phí cao, phải retry toàn operation.
- **RECOMMENDED A**, cụ thể hóa ở §3.2.1: P0 source/financial writers lấy Tenant FOR NO KEY UPDATE trước source/resource/aggregate locks, READ COMMITTED fresh reads, gateway/privileges bảo đảm mọi writer tham gia. Chỉ bỏ gate thô sau review protocol fine-grained và tests tương đương; giới hạn throughput phải đo. GiST/UQ/FK vẫn là defense cuối; GiST không chứng minh đủ booking.
- **Schema/migration:** SQL EXCLUDE/CHECK/partial UQ/guard/index; không tự thêm PSL field cho isolation. Lock graph phải có scope revocation, roster, session, pricing, ISSUE và approval; không khóa rows đã tồn tại rồi bỏ qua insert nguồn mới.
- **Cần review kỹ thuật:** anchor/rank/order và retry SQLSTATE `40P01/40001/23P01`, không cần chủ dự án chọn lại quy tắc conflict. Owner chỉ cần duyệt technical package trước implementation; performance chứng minh bằng T-01–05/12/17/42.

### 4.2. O-02 — invoice counter và format

- **Đã chốt:** Group A `database_design.md:235` yêu cầu cấp số khi ISSUE, counter tenant/năm, unique tenant và format `INV-{YEAR}-{SEQUENCE}`. §9:407 lại gọi format là proposal: đây là conflict provenance, không mở lại one-invoice hay logical counter.
- **A:** counter row `(tenantId,year,nextValue)` trong ISSUE transaction, UPSERT/locked increment RETURNING; rollback cùng invoice, contention theo tenant/year. **B:** PostgreSQL sequence mỗi tenant/year; nhanh hơn nhưng gaps và nhiều object lifecycle. Không đưa MAX+1 không có anchor vào danh sách hợp lệ.
- **RECOMMENDED A**, logical model dự kiến `InvoiceNumberCounter`, tenant relation/back-relation, PK/UQ `(tenantId,year)`, positive BigInt value; cấp một lần khi chuyển DRAFT→ISSUED, không dùng lại số đã issued/cancelled. Giữ unique number đang có; stable stored number.
- **Schema/migration:** thêm model/counter table, keys/checks; không tạo ở task này. Constraints năm/width không được hard-code trước lựa chọn.
- **Owner cần trả lời:** ưu tiên dòng Group A về format hay sửa conflict bằng quyết định khác; padding/width, năm theo tenant-local issuedAt, có yêu cầu gapless cho các số đã commit không. Default đề xuất giữ format Group A, local issue year, tăng tuần tự/không reuse, không cam kết pháp lý gapless. T-19 gồm rollover/rollback/retry/overflow counter.

### 4.3. O-03 — hạn 7 ngày và calendar cutoff

- **Đã chốt:** Q-08 có 7 ngày sau phát hành; không hỏi lại số ngày.
- **A:** issuedAt + 168 giờ. **B:** +7 ngày lịch tenant, cùng giờ địa phương. **C:** cuối ngày địa phương thứ 7. A dễ tái hiện; B hợp calendar nhưng khác ở DST; C rộng hơn trong ngày và phải xác định độ chính xác cutoff. Tại UTC+7, A/B tương đương nếu timezone giữ nguyên, C vẫn khác.
- **RECOMMENDED B**, lưu dueAt UTC bất biến lúc ISSUE cùng timezone/policy snapshot; thời điểm bằng dueAt chưa quá hạn, quá hạn khi `now > dueAt`. Đây là đề xuất cần duyệt.
- **Schema/migration:** giữ field hiện có, SQL issue metadata CHECK/immutable guard; không CHECK dùng `now()`. Nếu chọn future DST contract phải test thật.
- **Owner cần chọn:** cùng giờ hay cuối ngày; nếu muốn elapsed 168 giờ thì ghi rõ. Boundary/year/month/leap test ở T-19 mở rộng; không cần đổi baseline Q-08.

### 4.4. O-04 — snapshot JSON hay bảng nguồn riêng

- **Đã chốt:** issued history bất biến, pin policy/revision và giải thích được; DB Design gọi `billing_source_snapshots` là đề xuất, có thể gộp JSON.
- **A:** JSON header/line có schema version, IDs/revisions, raw prices/discount/evidence, eligibility, time attribution/timezone và reasons; ít tables nhưng query/diff khó. **B:** snapshot table theo run generation + structured rows; tra cứu/recompute history tốt, thêm cardinality/retention/backfill và consistency.
- **RECOMMENDED A cho payload versioned JSON**, canonical serializer/hash/validation; **O12-D đã yêu cầu giữ G1/G2 inputs/result/history**, không còn phương án chỉ giữ mutable current draft. Generation identity, key/hash/base/current pointer, durable admission, per-source dates/price evidence và diff/audit là contract bắt buộc; technical representation A/B vẫn chưa duyệt. Hash không thay nội dung; retry không repin; issued snapshot frozen.
- **Schema/migration:** không tiếp tục giả định A giữ nguyên toàn PSL: JSON payload vẫn cần durable per-generation metadata/history/pointers, có thể model riêng hoặc representation tương đương được review, theo DB Design O-12 amendment/O-12 N.3. Không có một pricingLocalDate chung cho generation nhiều sources; snapshot table nếu có keyed generation+participant. Typed keys/FKs/UQs/CAS/backfill/retention và projection atomicity phải chốt trước migration. Header/line JSON không thay FK.
- **Cần review O-04 (TECHNICAL PENDING, không APPROVED):** chọn storage schema/JSON validation, immutable payload vs mutable attempts, latest/base/applied pointers và missing/stale generation retention; fixtures reconstruct G1/G2/issued. Không hỏi lại có cần history hay không vì O12-D đã duyệt. T-17/18/38/40 và O12-AC-03/10/11/13/17/18.

### 4.5. O-05 — excess lifecycle và full reversal authority

**HISTORICAL / LIMITED-SUPERSEDED 19/10:** toàn phân tích/extension/equations/E1–E13 trong §4.5.1–4.5.4 dưới lưu provenance trước wallet approval, **không là normative requirement phát triển case/movement/FIFO engine cho new wallet-only flow** và không bắt phải triển khai cho legacy. Contract mới: B1–B5, immutable signed Allocation RELEASE+wallet credit cùng approved execution, current remaining/refund=max(P_before−N_after,0), nguồn/refund uniqueness. Existing legacy cases phải inventory/policy riêng, không tự convert/resolve. Technical signed fields/partial keys/LIFO/payment full-reversal net-remaining và SQL/grants vẫn pending; xem §10/Wallet C–E. No new excess engine hoặc dual credit cho cùng event.

- **Đã chốt:** Group A tách excess khỏi receivable, không auto refund/credit; P0 đảo toàn payment, giữ bản gốc; amount >0, approval/permission/audit thích hợp. Việc đảo sai payment không mặc nhiên có nghĩa tiền đã rời trung tâm.
- **Excess A:** immutable delta-event mỗi adjustment, derive current excess từ ledger; truy vết tốt, cần reconcile negative movement sau reversal/tăng total. **Excess B:** một current case/invoice + movement history; đọc queue dễ nhưng cần schema cho case/history và cấm cập nhật số tiền mất dấu. **Reversal authority:** direct authorized command có reason/audit hoặc manual approval trước effect; hai lựa chọn có latency/risk khác nhau, nullable approval FK không tự chọn policy.
- **RECOMMENDED A với extension cụ thể dưới đây:** giữ mỗi positive excess event là một case, thêm signed reconciliation history và remaining balance. Đây là phần bổ sung cần review, thay kết luận draft cũ “chưa đủ để đề xuất cột/model”. `amountVnd` gốc bất biến; không SUM các amount lịch sử để ra excess hiện tại. Không đóng case bằng refund/credit engine P1.
- **Owner cần chốt trước E-25:** chấp nhận contract case/movements, technical FIFO attribution, system RECONCILED khác financial RESOLVED; resolutionKind/chứng cứ/authority thực sự cho phép ở P0; reversal direct hay approval. Không tự mở endpoint giải quyết tiền dư. Chưa chọn policy thì chỉ dòng đối soát kế toán được review; runtime resolution/reversal route còn blocked.

#### 4.5.1. Ledger equations và invariant tại commit

Với một invoice đã issued, kể cả sau cancellation:

```text
N = original issued total + SUM(APPLIED adjustment.deltaVnd), N >= 0
P = SUM(allocation.amountVnd WHERE payment has NO full reversal)
D = max(0, N - P)                    // khoản phải thu
E = max(0, P - N)                    // excess hiện tại, không phải refund/credit
deltaE = E_after - E_before          // có thể âm, dương hoặc 0
```

Tính N và P bằng aggregates tách riêng rồi join theo invoice; không JOIN nhiều adjustments×allocations tạo fan-out. Một payment đảo thì allocation mất hiệu lực một lần; không vừa loại allocation vừa trừ reversal.amount lần nữa. Cancellation là một APPLIED delta `−N_before`, vì vậy N_after=0; không chỉ filter invoice CANCELLED rồi bỏ khỏi ledger. Adjustment tăng sau cancellation bị deny tới khi có reinstatement workflow được duyệt; không silently mở lại invoice.

**Invariant RECOMMENDED:** `SUM(case.remainingVnd của mọi case invoice)=E`; remaining≥0, amount gốc>0, remaining≤amount gốc. Case còn remaining>0 **iff** status PENDING_RESOLUTION; RECONCILED/RESOLVED chỉ khi remaining=0. Queue pending chọn remaining>0 tại cùng snapshot/financialRevision; không chọn chỉ theo amount gốc hoặc status cũ. Read header/ledger/cases cùng một SQL snapshot (hoặc repeatable read read-only), trả revision/asOf; mismatch là integrity failure/alert, không âm thầm clamp/hide.

System offset do N tăng/P giảm đưa remaining về0 thì ghi **RECONCILED**, không ghi RESOLVED như thể một người đã duyệt xử lý tiền. Nếu owner cần administrative acknowledgement khi E vẫn dương, phải là annotation riêng không giảm E/remaining hay che khoản còn phải đối soát. Financial RESOLVED phải có nghiệp vụ hợp lệ đã được phản ánh trong authoritative ledger, approval/reason/evidence và remaining=0. Khi chưa có resolutionKind P0 được duyệt, command RESOLVED bị deny; không giả một reversal/refund để đóng queue.

#### 4.5.2. Schema extension RECOMMENDED — chỉ minh họa, chưa áp dụng

Model hiện tại thiếu remaining, signed offset, source reversal và revision; `triggerAdjustmentId` required chỉ giải thích lần mở positive excess. Không thể chứng minh chống stale bằng cách đổi status/amount của row cũ mà không có history. Đề xuất tối thiểu cho contract A:

| Model / field / constraint mới | Vai trò và giới hạn |
|---|---|
| `Invoice.financialRevision BigInt` | Khởi đầu0 khi issued, tăng1 trong mỗi committed payment/allocation/reversal/adjustment/cancellation; không tăng khi replay. Chỉ gateway được đổi. Không thay total gốc. |
| `PaymentExcessResolution.remainingVnd BigInt`, `reconciledAt?`, `lastReconciliationId?` | Projection cập nhật dưới invoice/gate lock; `amountVnd`, `triggerAdjustmentId` gốc immutable. FK last reconciliation cùng tenant/invoice; nullable chỉ tại bootstrap trước event đầu, không giữ NULL ở case đã mở. |
| `PaymentExcessResolutionStatus.RECONCILED` | Technical terminal state cho ledger offset; giữ PENDING_RESOLUTION và RESOLVED hiện có. CHECK status/remaining/timestamps: pending remaining>0, reconciled remaining=0/reconciledAt có, resolved remaining=0/approval/resolutionKind/resolvedAt có theo policy. |
| Case UQ `(tenantId,triggerAdjustmentId)` | Với cardinality đề xuất một positive delta/case/APPLIED adjustment; giữ tenant/invoice FK và operationKey UQ. Chưa phê duyệt thêm constraint này. |
| `ExcessReconciliation` append-only | Fields: id, tenantId, invoiceId, financialRevision, operationType, operationKey, sourceAdjustmentId?, sourcePaymentId?, sourceReversalId?, netBefore/AfterVnd, paidBefore/AfterVnd, excessBefore/AfterVnd, deltaVnd signed, policyVersionId, correlationId, createdAt. Một row cho **mỗi** financial mutation, kể cả deltaE=0. |
| Reconciliation keys/guards | UQ `(tenantId,invoiceId,financialRevision)` và `(tenantId,operationType,operationKey)`; candidate `(tenantId,invoiceId,id)` cho child FK. Source-kind XOR: adjustment/cancel→adjustmentId, payment→paymentId, reversal→reversalId; source identity unique theo kind để đổi key không tạo reconciliation thứ hai. CHECK equations/local amounts; guarded/deferred checks so before/after với revision và ledger. |
| `ExcessReconciliationAllocation` append-only | Fields: id, tenantId, invoiceId, reconciliationId, resolutionId, deltaVnd signed≠0, createdAt. UQ `(tenantId,reconciliationId,resolutionId)`; composite FK cùng invoice tới reconciliation và case (thêm candidate `(tenantId,invoiceId,id)` trên case). `SUM(child.delta)=parent.deltaE` tại commit; delta0 không có child. |

Payment FK cùng invoice dùng candidate đang có `(tenantId,id,invoiceId)`; adjustment dùng candidate `(tenantId,invoiceId,id)`. `PaymentReversal` hiện **không có invoiceId**, nên reconciliation.sourceReversalId dùng tenant FK rồi guarded join qua reversal.payment→invoice dưới gate; không bịa candidate same-invoice FK đã tồn tại. Nếu muốn declarative equality cho reversal, cần extension invoiceId/candidate riêng được review. FK PolicyVersion/actor giữ tenant scope; migration indexes/referential actions phải được inventory tại R6.

**`remaining_after = SUM(all signed allocations vào case)`**, gồm OPEN dương và các offset âm. OPEN +20 rồi offset −15 ⇒ remaining5; amountVnd gốc là evidence của OPEN, không được cộng thêm lần nữa. Case projection và history phải khớp. Một positive reconciliation tạo case amount=deltaE và OPEN allocation +deltaE. Negative reconciliation phân bổ `−min(remaining, còn phải giảm)` theo FIFO `(createdAt,id)` cho các open cases; FIFO là attribution history, không chuyển payment sang invoice khác. Thêm policy version FIFO vào contract; owner có thể chọn cách khác nhưng không đổi tổng E.

#### 4.5.3. Transaction/recovery contract

1. Lấy Tenant gate và locks theo §3.2.1; reserve/compare idempotency key, lock request nếu có rồi invoice. Re-read N_before/P_before/E_before và revision, assert cases projection khớp; nếu không khớp reject/alert để đối soát, không tự tạo adjustment chữa dữ liệu.
2. Kiểm current authorization, approved target/body/expected financialRevision; append **một** authoritative financial effect. Compute N_after/P_after; reject N<0, overpayment hoặc partial reversal trái P0.
3. Tăng financialRevision một lần; append reconciliation before/after/sources. deltaE>0 mở case mới; deltaE<0 append offsets và cập nhật remaining/status RECONCILED khi0; delta0 không tạo case. Positive delta trong P0 chỉ do giảm net/cancellation, vì payment không được vượt due và reversal chỉ giảm P. Nếu gặp positive delta từ source khác thì fail invariant, không điền triggerAdjustmentId giả.
4. Deferred guards kiểm ledger equations, revision chain, case SUM=E, allocation SUM=deltaE, required source/approval/timestamps; persist receipt/idempotency result/audit/outbox và commit cùng effect. Không có job “sửa pending sau” trong committed normal path.
5. Cùng key/hash replay trả result sau current authorization, không tăng revision/movement/case. Khác key nhưng cùng source effect cũng bị source uniqueness/request receipt chặn. Crash trước commit rollback tất cả; sau commit trước response tra key+receipt/revision trước retry. Recovery job chỉ rebuild projection từ immutable valid ledger/movements dưới gate và audit, không nhân financial effect; mismatch không chứng minh được thì đưa đối soát thủ công.

**Chứng minh bằng quy nạp trên committed revision:** issued đầu tiên P=E=0 và chưa có case. Mỗi mutation có đúng một deltaE; tổng remaining tăng/giảm đúng deltaE qua allocations, nên từ SUM_before=E_before suy ra SUM_after=E_after. Nếu deltaE âm, `−deltaE ≤ E_before` vì E_after≥0; FIFO luôn đủ remaining để offset, không cần balance âm. Status iff remaining predicate được update và kiểm cùng commit nên không có stale pending sau khi case về0. Unique effect/source/revision và atomic rollback giữ giả thiết khi retry/race. Đây là chứng minh thiết kế có điều kiện trên gateway/guards; chưa là PostgreSQL test evidence.

#### 4.5.4. Scenario matrix — số VND rút gọn, mỗi hàng độc lập trừ chuỗi E1

| Case | Trước N/P/E | Mutation và sau N/P/E | Reconciliation/case expectation |
|---|---|---|---|
| E1 chuỗi giảm | 100/100/0 | −20 ⇒80/100/20; rồi −10 ⇒70/100/30 | OPEN20, OPEN10; total remaining30, không tạo20+30. |
| E2 tăng một phần | 70/100/30, cases20+10 | +15 ⇒85/100/15 | offset−15 FIFO; cases5+10; pending15. |
| E3 tăng hết excess | 70/100/30 | +40 ⇒110/100/0, D10 | offset−30, mọi case RECONCILED; không offset40 hay còn pending30. |
| E4 đảo payment duy nhất | 70/100/30 | Full reversal100 ⇒70/0/0, D70 | offset−30; không trừ100 hai lần khỏi P; không pending cũ. |
| E5 đảo một trong hai payments | 30/100/70, payments60+40 | Full reversal40 ⇒30/60/30 | offset−40, remaining30 vẫn pending; không đóng hết case chỉ vì có reversal. |
| E6 đảo vượt current excess | 70/100/30, payments60+40 | Full reversal40 ⇒70/60/0, D10 | offset−30, không−40; phần due10 không là negative excess. |
| E7 cancel khi đã excess | 70/100/30 | cancellation delta−70 ⇒0/100/100 | OPEN thêm70; old remaining30 giữ, tổng100; không mở thêm100 thành130. |
| E8 cancel partpaid/unpaid | 70/40/0 hoặc70/0/0 | cancel ⇒0/40/40 hoặc0/0/0 | OPEN40 hoặc không case; không tạo case0. |
| E9 reversal sau cancel | 0/100/100, payments60+40 | reverse40 ⇒0/60/60; reverse60 ⇒0/0/0 | offset40 rồi60; hết pending sau lần cuối, original cancellation/receipts giữ nguyên. |
| E10 cancel sau reversal | 70/0/0 | cancel ⇒0/0/0 | reconciliation delta0, không case; cancellation vẫn audit/receipt đúng một lần. |
| E11 hồi phục excess | Đã offset hết, N110/P100/E0 | approved −20 ⇒90/100/10 | Case mới10; không sửa OPEN amount hoặc reopen lịch sử đã reconciled. |
| E12 cancelled rồi adjustment tăng | Invoice CANCELLED | Không có reinstatement contract | Reject, không movement/status/revision mới; không tự thay N. |
| E13 race/replay/crash | Cùng invoice, adjustment tăng vs reversal/cancel | Gate serialize; command thứ hai đọc revision mới | Stale approved revision reject/đòi review lại; không auto đổi approved amount. Retry/replay không thêm effect/event/case; rollback giữ đủ before state. |

T-24–26 mở rộng phải kiểm từng hàng, cả thứ tự tăng-vs-reversal/cancel, assertions `SUM(remaining)=E`, pending iff remaining>0 và movement chain liên tục. Model extension/closure policy/reversal authority còn RECOMMENDED; không được gọi R2 migration-ready khi còn thiếu chúng.

### 4.6. O-06 — cancellation khi đã thu/đã tham dự

- **Business hiện hành B1–B5,19/10:** cancellation/adjustment có căn cứ qua manual approval kể cả đã thu/học, original totals/number/payment/claims giữ, N_after>=0. Refund đúng net excess về ví cùng signed releases/receipt/audit, không pending case mới cho wallet-only.
- **Historical alternatives:** A approved cancellation với reconciliation so với B cấm khi còn payment; business đã chọn wallet refund path, không hỏi lại B1 hoặc ép đảo payment đúng trước hủy. Legacy/mixed thiếu policy vẫn block affected execution, không conversion tự động.
- **Technical RECOMMENDED:** cancellation delta=−current adjusted N được approved/pinned target; execution kiểm obligation version, release net remaining+credit exact amount, không negate riêng originalTotal khi có adjustment trước. Không xóa attendance/release claim/reissue nguồn; read history cancelled giữ.
- **Schema/migration:** có thể giữ fields hiện tại, cần cancellation transition/issue metadata CHECK, history/ledger guards và read projection. Nếu thêm cancelledAt/reason riêng, phải review extension; không bắt buộc để đổi trạng thái.
- **Còn technical/security sign-off:** exact eligibility/state/approved payload version/grants/atomic refund/reversal guards, T-24–26/38+W06–09/20/23/24/27–30/36. Không yêu cầu owner xác nhận lại B1–B5 hoặc BR-11 manual approval.

### 4.7. O-07 — approval execution sync/async

**Current business amendment19/10:** durable APPROVED decision + explicit authorized execution, COMPLETED chỉ cùng effect thành công; execution failure giữ decision. UC/DB/DD/API đã đồng bộ hai boundaries. Các route A/C và source-conflict discussion bên dưới là phân tích lịch sử/alternative, **không mở lại câu hỏi có mất approval khi failure**. Technical default Q7 là B synchronous và existing IdempotencyRecord root/approved version, không generic workflow hoặc bảng receipt mới nếu chưa chứng minh cần; exact schema/routing/security còn **PENDING TECHNICAL SIGN-OFF**.

- **Business đã đồng bộ19/10:** manual financial approval/current rights/APPROVED≠COMPLETED; UC-26/34/DB/DD/API dùng durable D1 decision và explicit E1, failure giữ approval. Same-TX source prose trước đây đã sửa trong Phase2, không còn yêu cầu owner chọn có mất approval khi fail.
- **Historical comparisons:** A gộp decide+effect rollback cả decision nên không đáp ứng current wallet durability; B durable decision/explicit synchronous execute là current technical default; C background executor không mặc định P0 wallet, chỉ mở bằng scope/contract review riêng.
- **RECOMMENDED B implementation:** one short E1 transaction cho financial changes sau D1, không generic workflow/auto-enqueue finance. Business boundaries đã approved, exact sync routing/executor/receipt/privileges/recovery vẫn pending Q7, không API/runtime approval.
- **Schema/migration:** recommend reuse IdempotencyRecord root approved version/hash và completion/source guards; không bảng receipt mới nếu chưa chứng minh invariant thiếu. Không global UQ mọi ApprovalDecision vì resubmit cần history; receipt không thay decision.
- **Còn technical/security review:** executor current permission/approved version, source uniqueness, failure audit/unknown commit, exact cardinality/native constraints/role tests. Không hỏi lại B1–B5 hoặc durable decision requirement; không tự triển khai routes.

#### 4.7.1. APPROVED có phải committed intermediate state không?

| Route | Committed states và ý nghĩa | Failure semantics / recovery |
|---|---|---|
| A: một transaction | PENDING_APPROVAL→(logical APPROVED)→COMPLETED trong cùng commit; **không cần committed intermediate APPROVED**. Immutable APPROVE decision + success audit chứng minh ai duyệt; không cần ghi hai UPDATE chỉ để tạo trạng thái tạm. | Lỗi trước commit rollback cả decision/effect; request ở state trước command, không thể nói “đã lưu approval nhưng execute failed”. Chỉ dùng A nếu operation contract chấp nhận no accepted approval khi rollback; nếu cần durable decision/failure thì A không đáp ứng một mình. |
| B: decide commit, execute riêng | D1 commit APPROVE decision, pinned approved body/hash/revision, request APPROVED + decision audit. E1 đọc APPROVED, recheck rồi commit effect+receipt+COMPLETED. **APPROVED là committed state có thể tồn tại lâu**. | E1 rollback giữ APPROVED/decision; execution failure/attempt được ghi riêng sau rollback. Recovery tìm approved request chưa có receipt, chỉ thực thi khi current authority/expected revision vẫn hợp lệ. |
| C: decide+enqueue commit, worker riêng | D1 commit approval/audit + một persistent job atomically; worker E1 như B cùng fencing token và effect dedup. | Crash D1 trước commit không có job/decision; sau commit job còn để reclaim; worker crash/retry không nhân effect. APPROVED tồn tại tới successful effect commit. |

**RECOMMENDED failure representation cho B/C:** transient execution failure không sửa approval thành REJECTED và không tạo APPROVE mới; request giữ APPROVED, outcome/error/attempt ở execution log/job. Dữ liệu/quyền đã đổi làm request không còn thực thi được: không auto sửa approved body; block execute, hiển thị lý do cần review lại, giữ decision history. Dùng request FAILED/NEEDS_INFORMATION cho execution failure chỉ sau O-13 state table chỉ rõ đây là execution status và retry transition vẫn cần decision cũ; không đánh đồng FAILED với “chưa từng duyệt”. COMPLETED chỉ commit cùng root effect/receipt, không set trước rồi chạy effect.

#### 4.7.2. Idempotency và root effect receipt — RECOMMENDED extension

**Representation update19/10:** bảng `ApprovalExecutionReceipt` dưới là historical option; current minimal recommendation **reuse IdempotencyRecord** với root key server-derived từ approvalRequestId+approved version/hash, source uniqueness và completion guards. Root identity/effect/COMPLETED/audit invariants giữ, không bắt thêm bảng hoặc movements/cases. Ledger children hiện hành gồm signed allocation releases/wallet credits, không new O-05 reconciliation engine.

Đề xuất `ApprovalExecutionReceipt`: id, tenantId, approvalRequestId, invoiceId (financial route), operationType, approvedPayloadHash, policyVersionId, executedByMembershipId?, effectAdjustmentId?, effectReversalId?, completedAt, correlationId. UQ `(tenantId,approvalRequestId)` cho **một root execution/request**; XOR effect kind, typed same-invoice/tenant FK khi có candidate, guarded join cho reversal như §4.5.2. Receipt append-only; deferred guard `request.COMPLETED iff valid receipt+root effect exist` cho operations này, và inverse guard **mọi committed root effect cần approval (APPLIED adjustment hoặc reversal thuộc route cần duyệt) phải có đúng receipt** với approved decision/target/body/policy hợp lệ. Không để root effect đơn lẻ commit khi request còn APPROVED mà receipt chưa được ghi. Financial adjustment/cancellation có một root adjustment; excess cases/movements/audit là derived children, không áp global unique approval trên mọi child. Nếu sau này một approval cho phép nhiều root effects thì phải đổi operation/cardinality contract, không bypass UQ bằng key khác.

Decision/execution có typed identity riêng; execution root server-derived theo approvalRequestId+approved version/hash, không caller key tùy ý. Fingerprint gồm tenant/request/operation/approved body/expected obligation revision/manual intent; worker instance/attempt không thay nghĩa. D1 current auth/request CAS→decision+receipt/audit commit. E1 common entry→request/source anchors→Wallet→Invoice, recheck authority/body/obligation rồi effect+allocation releases/wallet credits+root receipt+COMPLETED+audit atomic. One root winner dù hai client keys; historical separate receipt-table option có thể map vào existing IdempotencyRecord. Root result không cho replay ngoài current scope.

Same key/different hash conflict; completed root trả current-authorized result, không new decision/effect/receipt. In-flight chờ/tra durable outcome, không fake success. Approved body/obligation revision đổi thì block E1; payment changes chỉ làm refund derive từ current remaining, không tự đổi approved delta/cancel target. Retry giữ pin/quyền hiện hành, không refresh accepted intent hoặc tạo key mới.

#### 4.7.3. Failure, attempts audit và retry matrix

| Fault point | Durable evidence / hành động đúng |
|---|---|
| A effect/guard fail trước commit | Không có accepted APPROVE decision hoặc business-success audit; request giữ original state. Command failure có attempt/outcome audit riêng; không dùng audit thất bại để cho phép execute. |
| B/C D1 committed, E1 validation/permission/revision fail | APPROVE decision/audit vẫn còn, request chưa COMPLETED, không receipt/effect. Ghi lý do blocked; owner chọn review/resubmit theo lifecycle, không blind retry business conflict. |
| E1 deadlock/serialization/timeout trước commit | Rollback effect/receipt/COMPLETED/result/business audit; bounded retry toàn E1 với cùng execution key/hash và decision cũ. Không append APPROVE mỗi attempt. |
| COMMIT thành công nhưng response/ACK mất | Outcome unknown; recovery lấy gate, tra request+receipt+idempotency. Có receipt hợp lệ thì replay result/ACK; không execute lần hai. Không có receipt và command cũ đã kết thúc thì có thể retry sau checks. |
| C worker W1 hết lease, W2 reclaim, W1 resume | Stale W1 không được commit effect dù approval vẫn APPROVED; fencing check và receipt/idempotency cùng effect TX. Retry schedule UC-37 áp dụng job, không tự duyệt mới. |
| Effect có nhưng thiếu receipt/result/COMPLETED, hoặc receipt không có effect | Integrity failure: không phải normal crash state của atomic E1. Quarantine/alert và đối soát migration/manual bypass; không “recover” bằng tạo thêm effect. |

Business success audit có đúng một logical effect ID/receipt và commit cùng effect. Mỗi technical attempt có `attemptId`, parent command/execution key, correlationId, actor/policy, startedAt và safe outcome/error; retries khác attemptId nhưng cùng logical execution. Có thể dùng append-only AuditLog hiện có cho STARTED/FAILED/RECOVERED, hoặc persisted JobAttempt cho C. Attempt STARTED có thể được append trong transaction riêng trước E1; log fail append sau E1 rollback, không giả đã tồn tại trong transaction vừa rollback. Crash giữa hai bước có thể để STARTED/UNKNOWN; recovery lấy gate rồi tra receipt/result để append recovered outcome, không ghi fail khi chưa biết COMMIT đã xảy ra. Không cam kết mọi process-kill luôn có synchronous failure log.

Nếu B chưa enqueue job tự động, recovery scan chỉ nêu approved-but-unexecuted/failed-attempt để authorized executor retry; không tự thực thi manual operation khi chưa có routing/authority. D1 retry sau mất response chỉ trả decision cũ; E1 retry chỉ chạy decision đã lưu. A internal database retry phải giữ cùng verified manual intent; không biến rollback decision thành background auto-approval. T-27/28/35/36/40 phải kiểm cả manual self-approval exception, REQUEST_INFO rounds, khác key cùng request và failure audit/crash windows.

### 4.8. O-08 — draft grade khóa resubmit từ lúc nào

- **Đã chốt:** Q-11 “trước khi chấm/công bố”, latest valid version, published-only visibility và append revision khi sửa điểm. Chưa rõ draft được tính là bắt đầu chấm hay chưa; class design:276 và UI-GRADE giữ open.
- **A:** grade DRAFT đầu tiên trên submission khóa resubmit; tránh teacher chấm bản cũ, có thể khóa sớm do draft thử. **B:** chỉ PUBLISHED khóa; linh hoạt hơn nhưng phải stale/invalidate grade khi current version đổi và cấm publish nhầm version.
- **RECOMMENDED A** theo nghĩa “trước khi chấm”, khóa chung Submission cho submit/grade/publish; không dùng UI để quyết định thay học vụ.
- **Schema/migration:** không bắt buộc thêm field; SQL history/transition guard nếu có, service transaction/CAS là chính; FK currentVersion không tự chứng minh latest. Thêm gradingStartedAt chỉ khi cần attribution riêng và được review.
- **Owner học vụ cần chọn A/B** và việc bỏ draft có mở lại nộp hay cần explicit exception. T-29–31 chạy cả hai thứ tự resubmit-vs-grade; draft mới không che published revision cũ.

### 4.9. O-09 — file bytes, late cutoff, namespace và cleanup

- **Đã chốt:** 10 MB/file, 5 files/submission, PDF/DOCX/JPG/PNG, late tối đa7 ngày; private Railway Volume/self-managed, history immutable. Không hỏi lại quota/type/window.
- **Bytes:** A=10,000,000; B=10,485,760. A theo MB thập phân; B theo MiB nhưng UI cần ghi đúng quy ước. **Cutoff:** A=deadline+168h; B=cuối ngày thứ7 tenant, rộng hơn. **Namespace:** A=server path `(tenantId,randomKey)`; B=globally unique full key + global UQ. Mỗi sub-choice có hai phương án; cleanup dùng TTL staging ngắn hoặc giữ dài/quét thủ công, cả hai phải bảo vệ reference/history.
- **RECOMMENDED:** 10,000,000 bytes, nhận đến `deadline+168h` inclusive, tenant-prefixed server random key. Giữ UQ `(tenantId,privateStorageKey)` hiện có nếu resolver luôn prefix tenant; không ép global UQ. MIME canonical theo E-27, sniff bytes thật; checksum SHA-256; không public key. Historical attachments không bị TTL staging xóa.
- **Schema/migration:** size/MIME/checksum CHECK, attachment/history guards; global UQ chỉ nếu chọn namespace B. Cleanup TTL thường không đổi schema nhưng marker/reference locking contract phải đủ.
- **Owner cần xác nhận:** quy ước bytes/cutoff ảnh hưởng người học; retention/TTL orphan thật sự được phép trước job destructive. Không tự đặt số giờ TTL hoặc chính sách xóa PII. Có thể để cleanup tự động tắt tới slice file; trước chạy thật phải chốt. T-31–34 gồm max−1/max/max+1, spoof MIME, collisions, link-vs-delete và restore DB+Volume.

### 4.10. O-10 — money bounds và Decimal precision

- **Đã chốt:** VND BigInt/Decimal, strings JSON, HALF_UP một lần cuối; chưa có business ceiling. `InvoiceDiscount.rawDiscountDecimal Decimal(20,6)` chỉ có14 chữ số nguyên, hẹp hơn miền tiền BigInt.
- **A:** cap tiền đủ thấp để giữ Decimal(20,6); dễ schema nhưng đặt giới hạn nghiệp vụ mới. **B:** tăng NUMERIC raw lên `(25,6)` để có19 chữ số nguyên, biểu diễn được mọi BigInt không âm với6 số lẻ; vẫn phải kiểm intermediate sums/products bằng Numeric/Decimal trước cast BigInt.
- **RECOMMENDED B** như technical representability fix; `InvoiceDiscount.rawDiscountDecimal @db.Decimal(25,6)`. Không dùng JS number cho phép tính/JSON. Việc chọn caps thấp hơn storage max là quyết định business riêng, không cần invent để sửa precision.
- **Schema/migration:** PSL precision + ALTER numeric; nonnegative/range/check totals/units; aggregate overflow phải reject nguyên tử, không làm tròn từng discount. Raw sibling = gross×.10, discountVnd=gross−roundedNet.
- **Owner chỉ cần trả lời nếu muốn cap nghiệp vụ thấp hơn** signed BIGINT; technical reviewer duyệt precision/range/overflow guards. T-18 gồm giới hạn14/15/19 digits, >2^53, SUM overflow, gross5→net5, gross15→net14 và nhiều lines chỉ round cuối.

### 4.11. O-11 — initial Manager assigner/operator

- **Đã chốt:** controlled Ops CLI, pending activation qua OTP, không temporary password/public bootstrap; tenant ACTIVE chỉ sau Manager hợp lệ. Required `MembershipRole.assignedByMembershipId` không tạo vòng FK bất khả thi: membership được insert trước grant.
- **A:** ngoại lệ CLI self-reference membership đầu tiên + audit actorKind=OPERATOR và operator identity, không coi membership pending là người đã có quyền. Ít schema nhưng cần ngoại lệ hẹp được duyệt. **B:** nullable assigner + explicit operator provenance; rõ nghĩa hơn nhưng thêm actor shape/schema. Không dùng platform actor giả membership tenant.
- **RECOMMENDED A** nếu security chấp nhận attribution: before/after safe chỉ rõ beneficiary và operator thực, correlationId/policyVersion; public APIs vẫn cấm self-grant. CLI không tự mở quyền đọc PII cross-tenant.
- **Schema/migration:** A giữ field required, cần audit actor shape/guard + role privileges; B đổi nullable và thêm provenance/constraint. Không cần DEFERRABLE để giải quyết semantics actor.
- **Owner IAM/security cần duyệt ngoại lệ A hoặc chọn B**, cùng nguồn nhận diện operator đáng tin. T-01/38/39 kiểm pending→active, rollback, operator attribution và không API bypass.

### 4.12. O-12 — policy, giá, month attribution và timezone

**O-12 BUSINESS APPROVED — 2026-10-18 (Asia/Ho_Chi_Minh): O12-A=A, O12-B=B1, O12-C=C1, O12-D=D.** Authority: chỉ đạo trực tiếp của chủ dự án, [Decision Register §F](../../DECISION_REGISTER.md#f-o-12--approved-business-decision-2026-10-18), [O-12 N.1–N.3](O12_DECISION_PROPOSAL.md#n-final-approved-decision--2026-10-18). BR-06/UC-21/DB-08/DD §5.7/API và class design đã đồng bộ theo amendment; không hỏi lại bốn lựa chọn.

```text
timezoneSnapshot = frozen tenant timezone
sourceBusinessDate = local_date(ClassSession.startsAt,timezoneSnapshot)
pricingLocalDate = sourceBusinessDate                 // per source/line
billingMonth = first_day_of_month(sourceBusinessDate)
eligible = effectiveFrom <= pricingLocalDate
           AND (effectiveTo IS NULL OR pricingLocalDate < effectiveTo)
precedence = SESSION > CLASS > COURSE                 // original source hierarchy
```

- **A=A:** PriceRule window là local calendar DATE `[from,to)`, không UTC instant. Không dùng `chargeCreatedAt`, `generationCreatedAt`, invoice.createdAt/issuedAt hoặc worker/client clock để chọn giá. Một invoice có thể nhiều đơn giá theo từng ngày học. Session20/09 giá100k, tariff150k từ01/10, draft02/10 và G2Nov ⇒ vẫn unit100k khi nguồn/tariff hợp lệ không đổi. Tariff mới chỉ cho buổi từ ngày hiệu lực tương lai; không ordinary sửa amount/target/backdate/higher-tier override để đổi giá buổi đã bắt đầu, kể cả chưa billed. DATE không intraday; future window-close không được phá selection/value lịch sử, không stale vì updatedAt đơn độc.
- **B=B1:** period `[monthStart,nextMonthStart)` theo local session start; 30/09 23:30→01/10 00:30 thuộcSep, 01/10 00:00 thuộcOct. Không split, không UTC month, không tháng tạo draft. Initial monthly admission sau kỳ đóng. Giữ một logical run/invoice/student/tenant/month; permanent issued participation claims kể cả units0/hủy invoice, không reissue cùng nguồn ở kỳ khác.
- **C=C1:** freeze ở first ScheduleSeries/ClassSession (kể cả DRAFT), BillingPeriod hoặc BillingRun/generation; marker/source atomic, sticky dù cancel/delete. Ops chỉ cấu hình trước boundary; không reinterpret session cũ/draft/issued. Marker field/guards/privileges, historical precheck và tzdata controls cần technical sign-off, không mở C2 transition P0.
- **D=D:** G1 pin immutable source/price/calculation-policy/timezone/result snapshots. Retry cùng typed key/hash giữ G1, không chọn lại tariff/policy; khác hash conflict. Recompute command/key mới + reason + expected base/applied generation/CAS tạo G2/history/diff/audit, không invoice thứ hai. G2 có thể pin calculation policy request mới theo BR-14, nhưng từng giá vẫn chọn bằng ngày session. Relevant source change → stale/block apply/issue, không refresh G1; pending recompute cũng chặn issue current draft. Apply G2 atomic với current applied pointer/policy/hash/lines/result. Replay G1 sau G2 trả historical result, không write-back invoice. NEEDS_INFORMATION chưa có invoice cũng có thể nhận explicit G2.
- **Snapshot/lineage:** per line lưu sourceBusinessDate=pricingLocalDate, z, source UTC/revisions/finalization, original session/class/course/enrollment chain, selected ruleId/window/unitPrice/tier/target/selection proof. Không dùng class/enrollment hiện tại sau transfer; không một generation-wide pricing date. `chargeCreatedAt/generationCreatedAt` giữ vai trò admission/audit/idempotency và pin calculation policy TIMESTAMPTZ theo request; không là tariff selector. Tariff/scheduling policy provenance không mặc định bằng calculation-policy ID.
- **Giữ baseline/ngoại lệ hiện hành:** confirmed attendance mới là nguồn thường hợp lệ; ATTENDED/UNEXCUSED1, approved EXCUSED/CANCELLED0; missing source/price hoặc ambiguous tier → NEEDS_INFORMATION, không implicit0. Theo nguồn hiện hành, CANCELLED không cần attendance giả nhưng vẫn cần PriceRule hợp lệ; không sửa quy tắc này trong task review. Thiếu tariff quá khứ không ordinary backdate repair; needs-info/đối soát, data-repair task riêng nếu được mở. Sibling10%, HALF_UP cuối, no combo/prepaid P1 giữ nguyên. ISSUE recheck current rights/source/current applied G/no pending/no stale/snapshot rồi claims/number/audit atomic; không reprice/repin. ISSUED chỉ correction/adjustment được duyệt, không recompute/rewrite original history.
- **Historical disposition:** recommendation O12-A=B và conflict BR-06/DB-08 vs DD cũ **SUPERSEDED**, giữ nguyên proposal A–M và 28 cases gốc ở O-12 report; addendum N cùng 27 O12-AC mới là contract hiện hành. Không xem B là lựa chọn cần approve hay điều kiện R1b/R2; không sửa historical line-number citations.
- **Technical design / schema / migration:** O-01 shared locking/gateway, O-04 generation/snapshot representation, O-13 states/actors/ops vẫn **RECOMMENDED / PENDING_REVIEW**; không tự approve chúng. R1b cần period shape + child/inverse-parent guards/C1/history/source mutation protocol; R2 cần durable generations/pointers/price proof/CAS/stale/claims. SQL chưa tạo/apply/test, R1b/R2 chưa triển khai, H-04 chưa đóng. Chỉ chọn concrete fields/DDL khi có technical sign-off và authorization riêng.
- **Acceptance/dependencies:** đối chiếu [O12-AC-01–27](O12_DECISION_PROPOSAL.md#n5-acceptance-matrix-hien-hanh--o12-aa), R1b §5.1 và blockers §9.2. T-14/15/17/40, E-16/18/36 còn cần PostgreSQL thật; business approval không chứng minh Gate S/P/R hoặc trigger/concurrency đã an toàn.

### 4.13. O-13 — lifecycle, attempts, actor và retention predicates

- **Đã chốt:** workflow states baseline, selfApproved là cờ; domain enums khác nhau, retry3 sau lần đầu/1–5–15 phút; audit24 tháng, history immutable. Text status không tự là lỗi; state set và allowed transition/required metadata mới cần chốt.
- **A:** text + SQL CHECK/partial predicates theo state table từng aggregate; dễ evolve, cần đồng bộ ứng dụng/SQL. **B:** PostgreSQL enums; type chặt, đổi/remove state phức tạp hơn và vẫn cần transition guard. **JobAttempt:** insert khi start rồi cho finalize đúng một lần hoặc insert terminal immutable row khi kết thúc; lựa chọn terminal-only cần nơi lưu bằng chứng attempt chết trước completion.
- **RECOMMENDED A** cho cột đang text, giữ enums hiện có; không tái dùng ApprovalStatus cho mọi bảng. JobAttempt insert-at-start, cho UPDATE whitelist unfinished→terminal một lần, terminal immutable; dùng attemptNo/generation hiện có để fence job thay vì tự thêm token cột nếu đủ bằng chứng. Outbox DB-only consumer ưu tiên transaction ngắn giữ row lock đến effect/ACK; không có committed PROCESSING bị bỏ lại. Nếu tách claim/execute phải thêm lease/generation contract và review migration.
- **Schema/migration:** status CHECK, partial UQ (active absence/roles/links), attempt/lease metadata CHECK, terminal/history/actor guards; cột lease/generation mới chỉ khi protocol cần. IAM/Audit actor User↔Membership có thể composite FK thêm candidate hoặc trigger; không invent platform access P1.
- **Review bắt buộc:** domain owner duyệt state/transition/required-fields matrix, active absence predicate và financial idempotency retention trước SQL; security xác nhận WORKER/OPERATOR actor shape. Kỹ thuật chốt one-time finalization/lease protocol. Chưa có căn cứ đặt TTL xóa key tài chính; giữ domain dedup bền vững. Không hỏi lại24 tháng audit. T-06/10/27/35–41.

### 4.14. Tóm tắt tác động và câu hỏi ưu tiên

| ID | Phần Group A/baseline giữ nguyên | Tác động default RECOMMENDED | Cần chủ dự án trả lời trước phần phụ thuộc |
|---|---|---|---|
| O-01 | Locks/recheck + exclusion | SQL; PSL chỉ khi thiếu anchor | Không có policy mới; duyệt technical lock package. |
| O-02 | Counter tenant/year, chỉ ISSUE, unique | **PSL + SQL** counter | Conflict format, padding, year boundary/gaps. |
| O-03 | 7 ngày | SQL/contract; không field mới | Calendar cutoff. |
| O-04 | Frozen source/policy; G1/G2 history bắt buộc theo O12-D | **PSL/SQL representation cần review** + versioned JSON | Technical storage/current-pointer/CAS, không hỏi lại có giữ history hay không. |
| O-05 | B1–B5 BUSINESS APPROVED19/10: wallet-only refund, legacy riêng | **PSL/SQL pending** wallet2tables/Payment.WALLET/signed releases/partial base UQ, source/effect guards | Không hỏi lại wallet/no-expiry/staff-only/legacy; cần technical sign-off allocation/reversal/receipt/SQL, không FIFO case engine mới |
| O-06 | Approved cancellation giữ history/claims, net-excess refund theo B1 | SQL/state/approved body/read model pending | Exact eligibility/CAS/source effects, không hỏi lại paid/attended qua approved correction |
| O-07 | Durable APPROVED + explicit execute + COMPLETED iff effect success | Reuse IdempotencyRecord root/version là recommendation, SQL/guards pending | Current sync default B, execution recovery/grants; DB same-TX prose đã đồng bộ Phase2, không generic workflow |
| O-08 | Version/published-only | TX/guards, không bắt buộc PSL | Draft grade và mở lại resubmit. |
| O-09 | 10MB/5/type/late7d/private | SQL; PSL chỉ nếu global full-key | Byte/cutoff, cleanup retention trước xóa thật. |
| O-10 | BigInt/Decimal/round cuối | **PSL + SQL** precision | Chỉ business cap thấp hơn storage nếu cần. |
| O-11 | CLI/OTP/pending Manager | SQL/actor; PSL nếu B | Ngoại lệ assigner/operator. |
| O-12 | **Business APPROVED 2026-10-18: A=A/B=B1/C=C1/D=D** | Technical SQL/C1/generation/line snapshots còn review | Không còn câu hỏi business O-12; O-01/O-04/O-13 và slice approvals riêng. |
| O-13 | Domain states/retry/audit baseline | SQL; PSL nếu thiếu actor/lease/history | State tables, actor shapes, safe retention predicates. |

O-12 business đã duyệt; ưu tiên **technical sign-off O-01/O-04/O-13** trước phần phụ thuộc R1b/R2. O-02/03/05/06/07 vẫn cần disposition financial; O-11/13 security/lifecycle, O-08/09 learning/files theo slice. H-18 là provenance/source gate riêng, không chốt lại Q. Technical defaults O-01/04/10 review đúng kỹ thuật, không biến thành câu hỏi kinh doanh nếu không cần.

## 5. Remediation roadmap — sáu batch có gate riêng

Batch là phạm vi review, không đồng nghĩa phải tạo một migration khổng lồ hoặc mở sáu feature slices cùng lúc. Đường dẫn SQL dưới đây dùng placeholder `<reviewed_batch>`; tên/timestamp/test harness mới phải được review trước Git. Các thư mục module chỉ là đích dự kiến của service implementation sau authorization, không khẳng định đã tồn tại.

### R1. Confirmed relational defects và source provenance

- **Findings:** H-02, H-04 (student và thiết kế period), H-18; phần H-20 bảo vệ parent identities liên quan. Backlog E-13/17/18/28; tests T-09/14/38/41.
- **Files dự kiến sau authorization:** `apps/api/prisma/schema.prisma`; `apps/api/prisma/migrations/<reviewed_batch>/migration.sql`; test mới dự kiến `apps/api/test/schema-integrity/attendance-billing-relations.spec.ts`; delta report ở R6. Nếu sync H-18 được phép, `docs/requirements/requirements_analysis.md` chỉ giữ diff đã review trong task tài liệu/Git riêng; không ghi đè bản hiện có. `SCHEMA_REVIEW.md`/`DECISION_REGISTER.md` chỉ update bằng task được duyệt, giữ audit cũ.
- **Bảo vệ:** finalization đúng session; line đúng student và định nghĩa period đầy đủ; nguồn Q/Internal-first có provenance.
- **Phê duyệt trước:** H-02A/H-04A student-only đã được phép thử local R1a, evidence S theo report, không hỏi lại; O-12 business đã APPROVED. **R1b** chưa được phép triển khai: cần O-01 lock/parent/gateway, phần O-04 attribution snapshot/generation interface liên quan và O-13 freeze/history/state/ops guards; provenance/backfill H-18 review riêng. Không phải đợi mọi financial decision R2 để review period design độc lập.
- **Acceptance:** phản ví dụ H-02 và student H-04 bị SQL từ chối; valid draft/zero/cancel branch vẫn hợp lệ; không có silent re-key; field/key/backfill/no-data path rõ. H-18 đủ source review evidence. Không đóng H-04 nếu chỉ có student FK.
- **Dependencies:** R1a keys là đầu vào R1b/R2/R3. R1b dùng A=A/B1/C1/D đã duyệt, cần common source mutation/locking/privilege protocol với R2/R3/R4; review contract chung trước, không tạo vòng phải triển khai xong R2 mới thiết kế R1b. Period guards có thể kiểm độc lập trên DB được phép; đóng toàn H-04 còn price/source/issue evidence R2/R3. Không đợi toàn R4 để thiết kế history guard tối thiểu, nhưng không gọi runtime ready khi chưa có auth/audit.
- **PostgreSQL sau này:** fresh DDL, catalog FK actions/candidate UQ, SQL INSERT/UPDATE/parent mutation, optional NULL, 2-client insert-vs-rekey/reschedule; Prisma client/nested connect và data-violation precheck nếu có dữ liệu.
- **Có thể để service:** quyền Teacher, batch finalization completeness, giá/discount eligibility; phải có contract R2/R3 và gate trước runtime. **Không trì hoãn** session/student equality hoặc period enforcement chỉ bằng lời hứa service.

### R2. Billing & financial integrity — R2-A/B/C/D sau wallet business approval

- **Findings:** H-04 (period closure), H-05–09 (pricing), H-16/20 (financial portions), M-01/04/05; money/period phần M-02. E-15–25/28/33/36/37/39; T-13–28/38/40.
- **Files dự kiến:** schema; reviewed SQL migrations; `apps/api/test/schema-integrity/billing-ledger.spec.ts`, `billing-issue-concurrency.spec.ts`. Sau mở slice: `apps/api/src/modules/billing-receivables/**` và workflow coordinator liên quan; thay contract/design chỉ trong task riêng sau quyết định nguồn.
- **Bảo vệ:** O-12 local-month/session-date pricing/lineage/confirmed sources/G history/CAS/units/sibling/HALF_UP giữ. Manual ISSUE/claims immutable; B1–B5 top-up/pay/internal refund/full top-up reversal/staff scope/no expiry/no cash-out, current B/due/remaining/no double debit/refund; legacy separate. Không filter reversed wallet payment rồi trừ release lần2.
- **Phê duyệt trước:** O-12/B1–B5 business đã APPROVED, simplification principle ACCEPTED; không hỏi lại. **Technical pending:** Q1–Q8/O-01/04/13, counter/due/precision, signed allocation/source/root receipt/reversal/state/SQL/grants; API wallet/recompute transport/permissions **PENDING API REVIEW**. Legacy inventory/cutover/policy trước affected data/commands, không ngầm mở conversion.
- **Acceptance:** O12-AC-01–27 và W01–W36 theo layer, approved UC-25/26/34/37 AC specs **DESIGNED**. Number/ISSUE/claims/source atomic; debit/payment/base equality; signed releases/credit=exact excess; partial/multiple/repeated adjust/payment reversal/unknown commit/rollback, B=ΣWT>=0 và B+A=T. E1–E13 old case math là history, không mandatory new wallet engine. H-04 giữ OPEN tới actual student+period/source/parent/race enforcement/tests; S không là P/R. Runtime protected raw DML deny phải test thật.
- **Dependencies:** R1a keys + R1b attribution/freeze/parent guards; R3 original source lineage/confirmed attendance và same mutation lock contract; R4 current authorization/durable key/audit/jobs primitives. O-12 contract đã settled. Có thể review static CHECK/precision/counter hoặc generation representation độc lập; không nghiệm thu runtime ISSUE/payment/adjustment trước dependencies thực sự R3/R4, không bắt toàn bộ R3/R4 hoàn tất để review R1b design.
- **PostgreSQL sau này:** T-13–28/38/40 + O12-AC concurrency obligations: two different-key recomputes same base, admission/apply/issue vs source mutation/price override insert, pending/stale current pointer, replay G1 sau G2, crash/unknown commit/rollback, no current tariff clock drift. Payment/adjust/reversal/issue races, deferred exactly-one, wrong approval target/duplicate effect, EXCLUDE `btree_gist`, HALF_UP/BigInt, cancellation giữ number/claim. SQL/catalog/privilege và ≥2 connections thật; không dùng Prisma validate thay proof.
- **Có thể để service:** pricing/sibling/dueAt/hash/scoped read/approved effect orchestration theo reviewed contract; **không trì hoãn** money types/row checks/ownership/base+release cardinality/pairing/history/source/root uniqueness/privilege/lock design sau migration sign-off. Refund API tự do hoặc worker auto-finance không P0.

| R2 slice | Deliverable / dependencies | Gate / stop |
|---|---|---|
| **R2-A** | Typed generations+immutable JSON/current pointer, session-date price/full source recheck/CAS, G1/G2 history; R1b required P gate và authorization riêng | D technical→S schema/client→P actual PG→R service/jobs/auth. Wallet changes không tạo G2 |
| **R2-B** | ISSUE/local-year counter/dueAt/claims, durable decisions/explicit adjustment-cancel; refund interface với C | Reviewed independent slice; không enable paid-wallet correction trước C atomic effect/integration evidence |
| **R2-C** | WalletAccount/Transaction logical2tables, top-up/pay/refund/reversals, signed allocation/receipt uniqueness/permissions; legacy policy/cutover | B1–B5 approved không tự authorize schema/SQL/API. W01–36 PG/runtime evidence sau allowed implementation |
| **R2-D** | Billing/Wallet/Approval/Jobs/Reporting/auth integration, migration upgrade/restore/retry/crash/two-client tests | Independent delta/readiness review, no feature ready từ Prisma validate. Không tự chuyển batch |

### R3. Scheduling, Attendance & concurrency

- **Findings:** H-01/03/09 (booking)/17; H-02 parent/roster protocols; phần M-02/07/08. E-07–14/37; T-02–05/09–12/17.
- **Files dự kiến:** schema nếu thêm student/class lineage candidate keys theo H-01; SQL migrations; `apps/api/test/schema-integrity/scheduling-attendance-concurrency.spec.ts`. Service sau authorization: modules `academic/**`, `resource-scheduling/**`, `attendance-leave/**` và source lock adapter Billing. Các tên module là design target.
- **Bảo vệ:** roster/enrollment/transfer đúng student/class và khoảng hiệu lực; capacity class/room; registry exact shape; booking đúng source/resource/time và đầy đủ; [start,end), ≤6 tháng/all-or-nothing; confirmed absence, cấm self-approve absence; khóa48h/ISSUE mốc sớm hơn; correction append-only/audit.
- **Phê duyệt trước:** O-01 lock graph/isolation/predicate anchors và O-13 active states/ops; O-12 timezone/attribution business đã APPROVED, technical enforcement còn review. Review H-01 extension vs trigger/source lineage riêng, không tự thêm P1 MAKEUP models.
- **Acceptance:** GiST không nhận overlap kể cả unavailability; adjacent pass; missing/wrong bookings không tạo confirmed session hợp lệ; tranh chỗ cuối không vượt capacity. Chỉ Teacher scoped/current permission xác nhận đủ active roster; EXCUSED cần đúng approved leave. ISSUE/correction/roster/pricing writer phối hợp nguồn, stale revision không commit; cancellation release booking nguyên tử, giữ lịch sử đã hoàn tất. Đúng48h bị khóa dù lockedAt chưa được job điền.
- **Dependencies:** H-02/R1 keys; R4 permission/audit/workflow foundation. Lock graph phải thống nhất R2 trước feature tests; R2/R3 cùng sign-off nguồn, không đợi nhau theo vòng vô hạn: review protocol chung trước, mỗi batch kiểm invariant của mình rồi chạy cross-domain suite.
- **PostgreSQL sau này:** `23P01` overlap races teacher/student/room, 6-month/leap boundaries, enrollment exclude/lineage/transfer target identity, two-client capacity/room resize/roster-vs-confirm/finalize/ISSUE, occurrence cuối fail rollback cả series/audit/outbox; deadlock/retry bounds.
- **Có thể để service:** recurrence expansion, Teacher assignment permissions, content/grade eligibility, absence24h policy evaluation, lock48h command evaluation. DB shapes/exclusions/lineage identity và source mutation protection phải được thiết kế trước DDL; không CHECK `now()` hay count/cross-table subquery.

### R4. IAM, Workflow, Jobs & Audit

- **Findings:** H-10/11/14–16/19/20 (cross-domain), M-02/03/07; policy phần M-04. E-01–06/28–37; T-01/06–08/27/28/35–41.
- **Files dự kiến:** schema nếu chọn actor/execution/lease extension; SQL constraints/role grants/guards trong reviewed migrations hoặc reviewed operational SQL; `apps/api/test/schema-integrity/iam-workflow-jobs-audit.spec.ts`. Runtime sau mở slice: `identity-access/**`, `tenant-policy/**`, `workflow-approval/**`, `automation-jobs/**`, `audit-traceability/**`, `notification/**`.
- **Bảo vệ:** global user + tenant membership + permission gắn đúng grant/scope, không mất Manager cuối kể cả global disable nhiều tenants; role/link active uniqueness và scope shape; actor attribution đúng; approved target/body pinned/execution unique; durable jobs/outbox/idempotency không stale effect; audit redaction/24 tháng; runtime không sửa history/DDL.
- **Phê duyệt trước:** O-01/07/11/13; operation allowlist/target resolver, request execution cardinality, state matrix, WORKER/OPERATOR identity, financial key retention. Static P0 catalog/CLI/token/OTP design đã chốt, chỉ cần exact seed/contract/tests, không hỏi lại framework quyền hay auth TTL.
- **Acceptance:** two-last-manager revokes/global disable không làm tenant ACTIVE mất Manager; cross-tenant writes FK fail và wrong-scope reads bị service chặn; OTP one-time/refresh rotate đúng. Một request không có hai conflicting terminal decisions/root receipts; B/C giữ committed APPROVE khi E1 fail, A rollback không giả durable approval; COMPLETED cùng effect/receipt/result/audit, payload sau approve không đổi. W1 hết lease/W2 reclaim/W1 resume không commit stale effect; tối đa4 attempts; retry1/5/15; outbox crash/replay không mất hoặc nhân business effect. ActorUser U1/Membership U2 bị từ chối. Runtime UPDATE/DELETE history/ALTER bị chặn, allowed gateway/system/draft updates vẫn chạy.
- **Dependencies:** primitives R4 là đầu vào runtime R2/R3/R5, có thể review/triển khai foundation trước runtime các batch dù số R4 đứng sau. Financial payload/retention guards cần O-05–07 contracts R2. Cùng lock hierarchy, không trộn request→invoice và invoice→request tùy command.
- **PostgreSQL sau này:** T-01/06–08/27/28/35–40, direct SQL với migration/runtime/retention roles riêng; concurrent grant/link/decision/OTP, SKIP LOCKED + attempt fencing, process death trước/sau commit/ACK, replay100 lần; early purge/partition detach denied. Auth cookie/domain và redaction/API scope còn cần integration tests ngoài PG.
- **Có thể để service:** JWT/cookie/CSRF, permission evaluation/target resolver, canonical fingerprint, safe payload allowlist/redaction, scheduling dispatch và notification recipient hiện hành; giữ contract trước DDL. **Không trì hoãn** actor/nullability, effect identity, persisted recovery metadata hoặc role/history guard design nếu service cần schema đó. Operational retention/restore phải đạt trước production.

### R5. Assignments, Files và constraints còn lại

- **Findings:** H-01 (recipient), H-12/13/20 (learning/file); M-02/06/07/08; residual scalar/temporal E-08/26–28/38. T-29–34/38/41.
- **Files dự kiến:** schema nếu recipient identity/namespace extension được chọn; SQL migrations; `apps/api/test/schema-integrity/assignments-files.spec.ts`. Sau mở slice: `assignments-grading/**`, `file-management/**`; file bytes/restore fixtures cần permission riêng, không tạo trong task planning.
- **Bảo vệ:** recipient/student/enrollment/class lineage; latest submission/grade concurrency; submission version + attachment set bất biến; published grade history và published-only projection; priority1–5/score0–10/revision>0; file owner/READY/MIME/size/count≤5, tenant-safe bytes và orphan race.
- **Phê duyệt trước:** O-08/09/13, H-01 candidate/trigger choice; byte constant/cutoff trước CHECK/runtime, cleanup retention trước job delete. Không mở Parent upload thay Student hay P1 progress/reporting.
- **Acceptance:** resubmit-vs-grade/publish có một coherent result theo O-08; chỉ latest valid version được chấm, draft không rò/che published cũ; 8.55 bị API reject trước Decimal(3,1) cast; 10.1 bị range reject. SQL không sửa/add/delete attachments của version đã nộp. Hai writers từ4 files không thể thành6; wrong owner/STAGING/ORPHANED bị chặn; key trùng hai tenant không overwrite bytes; cleanup không xóa reference/history.
- **Dependencies:** R1/R3 enrollment/recipient identity, R4 permissions/history/audit/jobs primitives. Không cần Billing engine để scalar/file constraints được review; không làm file cleanup destructive trước retention answer.
- **PostgreSQL sau này:** T-29–33 + parent mutation T-38, locks file/version/submission, score/priority/time/checksum/MIME metadata boundaries, concurrent versionNo/current pointer; T-34 fault injection filesystem và DB+Volume restore phải chạy ở môi trường riêng, PostgreSQL test một mình không chứng minh bytes an toàn.
- **Có thể để service:** MIME sniffing/streaming, authorizer/download, latest published selection, assignment edit policy; cleanup job có thể trì hoãn/tắt. **Không trì hoãn** recipient identity/immutability/namespace contract, scalar range, schema dữ liệu version/grade để đợi UI.

### R6. Independent delta review và migration readiness

- **Findings:** toàn bộ H-01–20/M-01–08/L-01, residual E-01–40; T-41/42 và rerun có mục tiêu các tests bị delta ảnh hưởng. L-01 tối ưu sau correctness, không làm blocker giả cho index chưa benchmark.
- **Files dự kiến:** reviewed schema/migrations/test diff R1–R5; report mới dự kiến `docs/ai/reviews/database/SCHEMA_DELTA_REVIEW_P0.md` (chưa tồn tại, phải review trước Git); decision/source updates chỉ khi có authority riêng. Không ghi đè independent audit snapshot gốc.
- **Bảo vệ:** source/schema/SQL/Prisma client/permissions/runtime contracts nhất quán; custom SQL không mất do drift/introspection; không claim migration-ready chỉ vì PSL validate.
- **Phê duyệt trước:** dispositions O-01–13 có evidence/authority, ghi O-12 business đã APPROVED và technical gates riêng; H-18 provenance. Source change O-06/07 nếu cần hòa giải upstream vẫn riêng, không mở lại source-price conflict O-12 đã disposition. Authorization riêng cho migration draft/test DB/tests; release/shared DB cần approval riêng, roadmap không cấp quyền đó.
- **Acceptance:** mỗi finding có layer, owner, evidence và resolved/pending reason; confirmed defects có negative+positive+parent-update+race tests thật. Không có unresolved schema/security/financial modeling decision ảnh hưởng DDL. Catalog chứng minh FK MATCH/actions/UQ/CHECK/GiST/partial guards/privileges; fresh apply và retry deploy không drift, data precheck/backfill/restore/rollback-or-forward-fix được review. Không cần mọi UI/service hoàn tất để review DDL, nhưng service-dependent invariants phải có schema đủ + contract/test gate và chưa được bật khi thiếu enforcement.
- **Dependencies:** các nhánh thiết kế R1–R5 đã hội tụ; runtime test evidence theo slice nào thật sự được mở. Không gọi migration sign-off là P0 production-ready nếu runtime/restore/NFR chưa được chứng minh.
- **PostgreSQL sau này:** T-42 fresh database/correct target PG version/extensions/role separation, introspection drift inventory, EXPLAIN fixtures, migration failure/retry/backup restore; cross-domain races T-01–42 liên quan có evidence; destructive upgrade/recovery chỉ trên môi trường được duyệt. Không hứa down migration sẽ phục hồi financial history tự động.
- **Có thể trì hoãn:** index không ảnh hưởng correctness, broad NFR tuning và UI/service chưa mở slice; trước production phải có SLO/backup evidence. Không trì hoãn index bắt buộc cho exclusion/FK target hoặc guard query nếu làm protocol không khả thi.

### 5.1. Dependency order và quản lý gate

1. **O-12 sync (history) → Wallet Phase2 source sync19/10 → review → separate R1b preparation authorization/technical sign-off** O-01/minimal O-04/O-13 → authorized R1b S/P → separate R2-A/B/C/D → R6 delta/readiness. Business O-12/B1–B5 settled, Q1–Q8 technical pending; không tự implementation authorization. No PG environment/evidence thì không claim P gate hoặc tự chuyển R2.
2. Thiết kế song song về logic (không phải authorization chạy agent/code): R4 foundation contracts và R3 source contracts; R2 static money/period/counter DDL dựa trên quyết định đã duyệt. Các phần có business/security ambiguity giữ pending.
3. R2 ISSUE/payment/adjustment nghiệm thu sau R3 source consistency và R4 execute/idempotency/audit; R5 sau IAM/history/file choices. Bounded synchronous execute vẫn có thể là E1 riêng sau committed decision; không đồng nhất sync với same-transaction. Các task triển khai sau này vẫn một approved vertical slice/lần.
4. R6 độc lập theo diff/hash mới; phát hiện regression mở lại finding tương ứng. Chỉ sau R6 mới xin migration/release approval cho artifact cụ thể.

**R1b acceptance package — proposal để technical sign-off:** monthly period CHECK, InvoiceLine insert/update/final-state guard, inverse coverage trên ClassSession/SessionParticipant/Invoice/BillingPeriod/Tenant (OLD+NEW dependencies), C1 sticky freeze/source atomic, immediate identity/issued guards và deferred draft containment; lock order/shared gateway/roles/fresh-snapshot/rollback/retry. Backfill/precheck giữ provenance, không rewrite issued source. PostgreSQL sau này phải kiểm local midnight/overnight/UTC-vs-local/wrong-month, parent mutation, first-source-vs-zone, line-vs-reschedule/issue hai connections, raw DML vs command privileges và deferred failure rollback. Cần review minimal snapshot/source interface O-04; **không bắt triển khai full BillingRunGeneration R2** để định nghĩa month guard. R1a S evidence không chứng minh các guards này.

**R2 acceptance package — proposal:** per-source pricing/date/lineage/PriceRule/window snapshots + durable G/key/hash/c/policy/z/history; latest/base/current-applied pointers/CAS và one-pending semantics; source mutation invalidate/no G1 refresh, explicit G2/new-request policy/session-date tariff/diff/audit; issue no pending/no stale/no reprice, immutable snapshot/permanent claims. Typed field/FK/UQ/JSON/state representation review trước schema/migrations. API recompute route/permission/DTO chưa approved; standalone design/static-check reviews có thể tiến hành độc lập, runtime feature còn cần R3/R4 contracts. Database Verification diễn ra từng batch khi được phép, cross-domain suite/R6 hội tụ cuối; không trì hoãn mọi test DB tới khi runtime xong và không coi chronology này là quyền chạy DB.

### 5.2. Finding coverage — batch chủ trì và phối hợp

Một finding chỉ đóng khi đủ mọi phần, không đóng riêng vì batch chủ trì đã xong. Các test IDs giữ định nghĩa của audit gốc; acceptance mở rộng tại §3/§5 không phải kết quả đã chạy.

| Finding | Batch chủ trì / phối hợp | Điều kiện đóng chính |
|---|---|---|
| H-01 | R3 / R5 | Enrollment-transfer-participant-recipient đúng student/class/lineage; T-04/05/29. |
| H-02 | R1 / R3 | Composite session equality và parent protection; T-09. |
| H-03 | R3 / R2/R4 | Full roster/authority/48h/ISSUE serialization; T-10–12. |
| H-04 | R1 / R2/R3 | Student FK **và** period guard O-12, parent/race tests; T-14/17. |
| H-05 | R2 | Amount/units/issue metadata/month/sibling enforcement; T-13/16/18/19. |
| H-06 | R2 / R3 | Claims đầy đủ, nguồn/snapshot không phantom/stale; T-17/19/20. |
| H-07 | R2 | Allocation/full reversal equality, exactly-one, overpay races; T-21–24. |
| H-08 | R2 / R4 | Approved target/payload/effect và excess reconciliation; T-25–28. |
| H-09 | R2 / R3 | Price và booking SQL EXCLUDE + concurrent rejection; T-02/03/15. |
| H-10 | R4 | Last Manager bao gồm global User/multi-tenant mutation; T-01. |
| H-11 | R4 | Scope/link shape, active UQ và authorization read/write; T-06–08. |
| H-12 | R5 | Version/grade/recipient concurrency, latest published projection; T-29–31. |
| H-13 | R5 | File owner/READY/count/bytes guards; T-32–34. |
| H-14 | R4 | Actor coherence, redaction, retention controls; T-38/39. |
| H-15 | R4 | Lease fencing bảo vệ effect và outbox recovery; T-35–37. |
| H-16 | R4 / R2 | Fingerprint/current authorization, atomic durable effect/result; T-20/21/35/40. |
| H-17 | R3 | Booking identity/time/completeness, capacity, whole-series atomicity; T-02–05. |
| H-18 | R1 / R6 | Review provenance bản 387 dòng, source sync được phép, delta evidence; T-41. |
| H-19 | R4 / R2 | Decision/execute state CAS và one effect/approval; T-27/28. |
| H-20 | R4 / R1/R2/R3/R5 | Lifecycle-specific immutable identity/history, role/trigger SQL tests; T-38/39. |
| M-01 | R2 | Raw NUMERIC đủ miền tiền và safe arithmetic; T-18. |
| M-02 | R2/R3/R4/R5, R6 kiểm residual | Scalar/temporal CHECK inventory E-01/02/08/10/12/26/27/32; T-08/13/29/35. |
| M-03 | R4 | Approved bootstrap assigner/operator semantics; T-01/38. |
| M-04 | R2 / R4 | Policy pin/effective source/timezone snapshot contract; T-17/40. |
| M-05 | R2 / R4 | O-02–07 dispositions và counter/financial state design; T-19/25–28. |
| M-06 | R5 | Canonical tenant-safe physical namespace; T-34. |
| M-07 | R4 / R2/R3/R5 | Per-domain state/transition/predicate tables trước constraints; T-35/41. |
| M-08 | R3 / R4/R5 | P0 command allowlist, deny P1 dù enum có slot; T-05/41. |
| L-01 | R6 | Inventory candidate-key dependencies, EXPLAIN trước index removal; T-42. |

### 5.3. Acceptance gates — design khác schema, database và runtime

**Ghi nhận hiện tại:** hướng R1–R6 có điều kiện, **O-12 business APPROVED18/10 và WALLET-B1–B5 BUSINESS APPROVED19/10**, simplification principle ACCEPTED; technical D/Q1–Q8 chưa ký. R1a H-02A/H-04A student-only có S evidence lịch sử; R1b/R2 chưa implemented, P NOT RUN, R chưa nghiệm thu. Không đổi O-01/O-04/O-13 thành APPROVED hoặc xem docs consistency là SQL/runtime proof; H-04 OPEN.

| Gate | Bằng chứng để được công nhận ở task sau | Không suy ra từ gate này |
|---|---|---|
| **D — Design approved** | Reviewer có authority chọn phương án/closure semantics, source conflicts được disposition, schema+DDL+lock/permission/recovery contracts và acceptance cases được ký theo batch. Có record rõ điều kiện còn treo và phần nào được phép làm độc lập. | Không cấp quyền tự implementation/migration/Git; không chứng minh schema/client/SQL đang đúng. Conditional direction hiện tại chưa đủ để bỏ business/security blockers. |
| **S — Schema implemented and validated** | Có authorization sửa schema; reviewed diff đúng design, field/key/nullability/native precision/back-relations đủ; Prisma validate **và** client/type compatibility của delta, schema-to-DDL inventory/backfill plan. | Prisma validate chỉ kiểm PSL; không sinh chứng cứ trigger/GiST/roles hay concurrent PostgreSQL INSERT đã an toàn. S không đồng nghĩa migrations được phép chạy. |
| **P — PostgreSQL migrations applied and tested** | Authorization riêng cho migration draft và test DB; actual reviewed migrations applied trên disposable PostgreSQL target/version/extensions/roles; catalog assertions và positive/negative/parent-update/2-client/crash/retry tests đạt; upgrade/restore evidence phù hợp. Ghi DB target/SQL hash/commands/results, không dùng mocks. | Không cho phép apply shared/prod DB hoặc deploy. DB integrity pass không chứng minh API authorization/grade visibility/jobs/file bytes hay feature ready. |
| **R — Runtime feature ready** | Slice được mở riêng, service/gateway/authorization/current-scope/idempotency/worker/file contracts implemented; API/integration/concurrency/security tests thật đạt, operational/recovery evidence và UX/error paths đúng phạm vi. | Không tự cho phép commit/push/PR/deploy; runtime của một slice không đồng nghĩa toàn P0 đã sẵn sàng. |

| Batch | D — deliverable/điều kiện ký | S — delta schema phải có | P — test database evidence | R — điều kiện feature ready |
|---|---|---|---|---|
| R1 | R1a choices đã được phép local; O-12 business approved. R1b cần O-01/O-04 phần source/C1/O-13 và §3.2 protocol/data-provenance sign-off. | Giữ session/student R1a keys; R1b period/freeze/history guards/interface và precheck/backfill; không bắt full G model để định nghĩa period. | T-09/14/38/41 + §3.2.3, child/inverse/C1/privileges/timing/race thật; H-04 chưa đóng bởi student S pass. | Attendance/Billing callers dùng approved protocol; draft/zero/cancel/wrong-scope và source invalidation đúng; R1 relational pass chưa đủ feature. |
| R2 | O-12/B1–B5 business settled; Q1–Q8 technical/SQL/API/legacy policy pending; no old new-excess engine requirement. | R2-A G JSON/current pointer; B counter/precision/approval; C wallet/signed allocation/base partial UQ/root identity, history/owner guards; no schema edits in Phase2. | T/O12-AC + W01–W36 actual migrations/constraints/roles/two-client/fault/native precision, no double reversed-filter/offset. | R2-D finance/generation/jobs/auth/reporting/legacy integration; API wallet/recompute review riêng, no unapproved financial routes. |
| R3 | O-01/12/13, source/time/capacity/roster/48h/ISSUE lock graph gồm tenant gate. | H-01/H-02 source keys/guards, CHECK/EXCLUDE/active predicates không mở P1. | T-02–05/09–12/17; complete booking/roster và parent/source races, all-series rollback. | Authorization Teacher/absence/correction và scheduling commands/recurrence thực hiện recheck; UI preview không reserve. |
| R4 | O-07/11/13; gateway privilege model, request→receipt/failure/recovery, actor/retention/seed contracts. | Receipt/source identity, actor/attempt/lease state đủ; GRANT/REVOKE/trigger inventory, catalog seed reviewed. | T-01/06–08/27/28/35–40; raw DML denied, last Manager, replay/fencing/outbox/actor/retention guards. | Current authorization, cookie/OTP/CSRF domains, jobs permissions/recovery và attempt audit được test; no stale worker effect. |
| R5 | O-08/09/13, file/recipient/history và cleanup policy. | Version/recipient/grade/file scalar/identity/immutability và namespace constraints đủ. | T-29–33/38, DB+filesystem fault/restore T-34 riêng; grade-vs-resubmit/file-count race. | API chặn draft grade/wrong owner, stream MIME/size/private download, bytes restore thật; cleanup chỉ khi policy được duyệt. |
| R6 | Independent reviewer disposition từng finding/O/source; phân biệt migration-readiness và feature readiness. | Re-review delta R1–R5, PSL/client và custom SQL inventory khớp; không tạo schema “riêng cho R6”. | T-41/42 + affected regressions; catalog/drift/upgrade/retry/restore và NFR fixtures, không tái dùng lời nói “validate pass”. | Review release readiness theo các slice thực sự đã mở, nêu pending runtime gates; migration review có thể xong khi runtime một số slice chưa được phép bật. |

Mỗi finding ghi evidence theo **D/S/P/R**, không một cột “DONE” gom bốn mức. Ví dụ H-04 có D được ký và S validate nhưng P chưa chạy vẫn **chưa chứng minh DB fixed**; H-11 có FK/shape P-pass nhưng service read-scope R-fail vẫn **chưa security-ready**. Mỗi chuyển gate cần authorization đúng hành động; chấp thuận plan không tự cấp quyền triển khai.

## 6. Acceptance checklist cho lần review kế hoạch

- [ ] Review các điều kiện bổ sung H-02A/H-04A, gateway/tenant-gate/deferred guard contract; không yêu cầu chấp thuận lại hướng R1–R6 đã được chấp thuận có điều kiện. H-04 chưa đóng khi chỉ student FK.
- [ ] Review full diff Requirements +91 dòng/provenance; không yêu cầu chốt lại Q/Group A hoặc cung cấp lại khi đã tìm thấy bản đầy đủ phù hợp mô tả.
- [x] O12-A=A/O12-B=B1/O12-C=C1/O12-D=D business APPROVED 2026-10-18 đã truy vết và đồng bộ §4.12/boards/R1b/R2; recommendation B superseded, không hỏi lại.
- [ ] O-01/O-04/O-13 và các decision khác ảnh hưởng DDL có technical authority/evidence; RECOMMENDED không tự thành APPROVED. H-04 period guards/data/concurrency và O-05/06/07 financial lifecycle cần sign-off trước predicates/cardinality tương ứng.
- [ ] Danh sách file, schema extensions, custom SQL và test harness mới được review trước Git; triển khai được tách theo approved slice.
- [ ] Mỗi invariant chọn layer rõ: equality FK; scalar CHECK; temporal EXCLUDE; cross-row guards/locks; authorization/aggregate/snapshot service; history role+trigger. Không gán đúng tenant bằng đúng scope.
- [ ] Thống nhất nghiệm thu database tests với hai connections/SQL trực tiếp/Prisma, positive cases, failure injection; không dùng mocks/validate thay PostgreSQL evidence.
- [ ] Service-deferred items có contract/owner và gate trước runtime; modeling/financial/security ambiguity không được trì hoãn qua migration readiness.
- [ ] Ký riêng E1–E13, committed approval/failure/recovery và technical board §8; O-12 business đã duyệt, các technical O khác vẫn RECOMMENDED tới review có authority.
- [ ] D/S/P/R có evidence độc lập; chưa có authorization implementation/migration/database/Git trong lượt refinement.

## 7. Tests actually run, risks & deviations, pending review — historical draft/refinement evidence

Các kết quả, đường dẫn cũ và risks/pending dưới đây thuộc **lượt draft/refinement trước R1a/O-12 approval**, giữ nguyên để truy vết, không mô tả status hiện hành. O-12 business conflict và Billing class monthly-identity wording đã được disposition trong 9 tài liệu đồng bộ; reference aliases tại AGENTS/context được sửa ở task post-approval. Xem §9 cho review hiện hành; không cộng các test lịch sử thành lượt PostgreSQL/runtime mới.

**Lượt lập draft trước — bằng chứng lịch sử, không tính là chạy lại trong refinement:** Git status/branch/HEAD/diff stat và diff Requirements; đọc nguồn/schema bằng `rg`/`Get-Content -Encoding UTF8`; SHA-256 các file nguồn; Node read-only so HEAD với working Requirements (296→387, identical prefix296, +91, đủ15 Q); kiểm tra cấu trúc/IDs/whitespace của báo cáo và diff; đối chiếu hash nguồn cuối lượt đó. Các lệnh này không kết nối database.

| Kiểm tra local | Kết quả thực tế |
|---|---|
| Node assertions cho draft | PASS: 13 decision headings, 6 batch × 8 trường review, 29 finding rows, tên model trong schema, code fences cân bằng, không trailing whitespace/blank EOF. Lần đầu check nhãn tiếng Việt lỗi encoding PowerShell→stdin; đã chạy lại bằng Unicode escapes và đạt. |
| `git diff --check` | Exit0, không whitespace defect; có cảnh báo LF→CRLF ở hai file đã modified trước task. |
| `git diff --no-index --check -- NUL docs/ai/SCHEMA_REMEDIATION_PLAN_P0.md` | Không whitespace diagnostic; exit1 vì file mới khác NUL, có cảnh báo LF→CRLF. Không ghi là exit0. |
| SHA-256 / Git cuối task | 10 file nguồn đối chiếu không đổi; không staged diff; so status ban đầu chỉ thêm đúng report này. |

**Lượt refinement hiện tại:** đọc lại working schema/plan, Group A/register, BR-06/08–14, Q-08/10 và UC-34 failure path; kiểm Git/HEAD, chụp hash 82 file tracked/untracked không bị ignore trước sửa report. Chỉ dùng read-only scripts và patch đúng report.

| Check refinement | Evidence / giới hạn |
|---|---|
| Offline BigInt/FIFO arithmetic | PASS: 12 numeric scenarios/14 transitions E1–E11 (E8 có hai nhánh), assert exact delta, nonnegative remaining, SUM cases=E và pending projection. Không thực thi SQL, không chứng minh E12/E13 rejection/concurrency/idempotency. |
| Document structure/coverage | PASS: 13 O headings, 6 batches, 29 finding rows, 13 rows ở final decision board, đủ D/S/P/R, code fences/whitespace. Model/field hiện tại được đối chiếu nguồn; không validate các proposed models. |
| Scope preservation | PASS: so hash 82 file đầu/cuối, chỉ report đổi; 81 file khác giữ nguyên, không file mới/xóa, Git status/index không thay đổi. Không tạo file test/script, migration hay artifact phụ. |
| Whitespace/diff | Kiểm trực tiếp UTF-8 draft và `git diff --no-index --check -- NUL <report>`; exit1 của file untracked khác NUL không là PG/test failure. `git diff --check` chỉ bao phủ tracked changes, không dùng nó thay check report này. |

**NOT RUN:** Prisma validate/generate/format, project build/typecheck/test, PostgreSQL/SQL/concurrency/migration/EXPLAIN/load/restore. Kết quả Prisma validate được audit cũ ghi lại không phải kết quả chạy mới của task này. T-01–42 và các acceptance tables ở đây đều là kế hoạch, chưa có PG PASS.

**Risks & deviations:** tài liệu class design có đoạn cũ gọi one-invoice chưa chốt, format invoice mâu thuẫn ngay trong DB Design, **BR-06/DB-08 vs DD §5.7** về effective price, UC-34 failure semantics vs DB decision/effect same-TX, tên file context cũ và provenance UC version chưa độc lập. Giữ nguồn cao hơn/Group A; chỉ ghi conflict, không sửa source. Default O-07 đổi A→B để review durable decision; O-05 thêm model contract, O-01 thêm coarse tenant gate/gateway privilege boundary cần review throughput và operations. Trigger/composite extensions chưa validate Prisma/client hay benchmark; protocol phải được chứng minh thay vì tin pseudocode. Không xác minh remote merge state hoặc database đang triển khai. Phạm vi P0 Internal-first giữ nguyên, không thêm payment gateway/refund/credit engine/makeup/substitution/reminders/policy editor; SQL command gateway là DB integrity boundary nội bộ.

**Pending review:** duy nhất báo cáo draft này. Dừng ở planning; mọi remediation/schema/source synchronization/migration/test database/Git action cần task và authorization tiếp theo đúng phạm vi. Approval kế hoạch không tự cấp quyền commit/push/PR/deploy hoặc cập nhật register thành APPROVED.

## 8. Decision register preparation — bảng cuối để review, chưa ghi vào register

**Phân nhóm:** **T** = technical recommendation có thể ký ở Gate D; **B** = business choice; **S** = security/operations cần authority. O-12 business đã **APPROVED 2026-10-18**, B không còn pending; implementation details T/S còn review. Các lựa chọn kỹ thuật mới/decision khác vẫn **RECOMMENDED / PENDING_REVIEW**, duyệt một phần không tự đóng phần khác. Không dùng conditional direction R1–R6 để approve O-01/O-04/O-13; giữ Group A.

Mỗi technical decision còn mở cần selected option + authority/evidence/date + remaining conditions và D/S/P/R links khi được duyệt. O-12 approval đã ghi thật trong Register §F bởi task trước; bảng này chỉ **đồng bộ lại status đó**, không cập nhật register trong task hiện tại. H-18 provenance là gate nguồn riêng, không hỏi lại Q.

| ID / nhóm | T — đề xuất có thể ký theo thiết kế | B — lựa chọn owner còn cần | S — security/operations approval | Dependencies / gate và finding bị chặn |
|---|---|---|---|---|
| O-01 **T+S** | Tenant gate NO KEY UPDATE + READ COMMITTED fresh statements, rank order, gateway/privilege boundary và deferred guards §3.2; GiST giữ. | Không hỏi lại conflict/all-or-nothing/capacity. | Role/function ownership/search_path/EXECUTE grants, timeout/retry budget, contention/throughput fixtures; fine-grained replacement cần review mới. | O-12 source semantics, O-13 actors/states; D→S→P2-client; H-03/H-04/H-06/H-09/H-10/H-17/H-19. |
| O-02 **T+B** | Counter row tenant/year transactional, rollback cùng ISSUE, stable stored number; giữ baseline chỉ cấp khi ISSUE. | Hòa giải format prose Group A/§9; padding, local year boundary/gaps display. Không hỏi lại logical counter. | Ops giới hạn counter/restore không reuse số; không tuyên bố legal invoice sequencing. | O-03/12 timezone; R2 D/S/P T-19; H-05/H-06, M-05. |
| O-03 **B** | Pin dueAt UTC và issue metadata/immutability, không CHECK now(). | +7 local calendar days cùng giờ (recommended) hay elapsed168h/cuối ngày; đúng dueAt chưa overdue. | Test timezone/DST nếu môi trường hỗ trợ, không tự đổi baseline7 ngày. | O-12 timezone; R2 D trước due CHECK/ISSUE; H-05, M-05. |
| O-04 **T+S — PENDING_REVIEW** | Versioned JSON payload + durable generation metadata/history/pointers hoặc bảng structured tương đương, keys/CAS/atomic projection theo §4.4; không chỉ mutable current draft. | Không hỏi lại history G1/G2, đã bắt buộc theo O12-D; chỉ technical storage representation còn chọn. | Snapshot PII/read scope/retention/serializer/hash + historical source provenance/backfill. | O-12 business settled, O-01 source locks; block phần snapshot/generation DDL R2 và minimal R1b source interface tương ứng; H-06/H-20, M-04; T-17/38/40. |
| O-05 **B APPROVED19/10; T+S PENDING** | Signed Allocation RELEASE+wallet refund/source/pair UQs, existing IdempotencyRecord root; no new case/movement/FIFO engine wallet-only | B1–B5 settled, không hỏi lại; legacy/mixed inventory/policy riêng trước affected execution | Current financial rights, immutable receipts/ledger, no dual credit, no external cash-out | O-01/06/07/13; R2-B/C/D exact fields/partial keys/SQL/reversal/pair guard pending; H-07/08/20/M-05, W01–36 DESIGNED |
| O-06 **B APPROVED; T+S PENDING** | Approved cancel delta=−currentN, release/refund remaining, giữ original invoice/claims/payment | B1 paid/attended cancellation với chứng cứ/manual approval đã chọn; no reinstatement | Eligibility/approved body/CAS/current scope/self-approval audit phải implement/test | O-05/07/13; R2 financial state/root/guard; H-05/07/08/20/M-05 |
| O-07 **BUSINESS CONTRACT ALIGNED; T+S PENDING** | Durable APPROVED D1, explicit E1 effect+receipt+audit+COMPLETED; reuse IdempotencyRecord recommendation | Không mở lại durable decision/explicit execute; synchronous routing/executor details pending | Execute/retry authority, root version/hash, failure/unknown commit, no worker auto-finance | O-01/05/06/13; R2/R4 SQL/cardinality/API sign-off; H-08/15/16/19/20/M-05 |
| O-08 **B** | Shared Submission lock/CAS, latest valid version, published history không bị draft che. | Draft grade có khóa resubmit (A recommended) và điều kiện mở lại nộp khi bỏ draft. | Teacher/current Student/Parent scope theo baseline, không thêm quyền Parent submit. | O-13 learning states, R4 IAM; R5 D/P T-29–31/R; H-12/H-20. |
| O-09 **T+B+S** | Tenant-prefixed random key, size/MIME/checksum constraints và file/version locks; preserve attachments. | 10,000,000 vs10,485,760 bytes; exact late cutoff so với EOD; không hỏi lại5 files/type/late7 ngày. | Cleanup TTL/retention/xóa bytes, namespace containment, orphan-vs-link/restore proof; không tự đặt TTL. | O-08/13, R4 file actor/jobs; block file CHECK/cleanup tương ứng; H-13/H-20, M-06/M-02. |
| O-10 **T**, B nếu cap | NUMERIC(25,6) raw và checked BigInt/Decimal arithmetic/string JSON, HALF_UP cuối. | Chỉ cần owner nếu muốn cap nghiệp vụ thấp hơn storage; không tự thêm ceiling. | Overflow/error behavior/test fixture, không dùng JS number. | R2 S/P T-18; H-05, M-01. Không cần đợi cap mới review technical widening. |
| O-11 **S** | CLI self-reference ngoại lệ hẹp (A recommended) hoặc nullable assigner+operator provenance B nếu security chọn. | Không hỏi lại controlled CLI/OTP pending Manager; không tạo platform tenant role giả. | Chấp nhận attribution/operator identity trust, activation/last Manager và public API không self-grant. | O-13 actor shapes/R4 IAM; block bootstrap semantics/actor guards; H-10/H-14, M-03. |
| O-12 **BUSINESS APPROVED 2026-10-18; T/S PENDING_REVIEW** | **O12-A=A, O12-B=B1, O12-C=C1, O12-D=D**; session-date price/month/frozen z, immutable G1/retry/new G2/current-pointer/CAS/diff/issued claims theo §4.12. `chargeCreatedAt` chỉ admission/audit/policy pin. | **Đã APPROVED**, nguồn owner18/10 + Register §F/O-12 N; không còn bốn câu hỏi. Recommendation O12-A=B **SUPERSEDED**. | C1 enforcement/privileges/tzdata/backfill và generation storage theo O-01/O-04/O-13 còn pending; không tự approve technical package. | Business unblock đã có; technical sign-off trước R1b/R2, SQL/PG **NOT RUN**, R1b/R2 **NOT IMPLEMENTED**, **H-04 OPEN**. H-04/H-06/H-09/M-04 cần D/S/P/R evidence riêng. |
| O-13 **T+B+S** | Per-domain text+CHECK/transition/predicate tables, terminal attempts immutable, one-time finalize, durable dedup/recovery. | Active absence/cancellation/excess/grade predicates khi liên quan business; không dùng ApprovalStatus cho mọi domain. | WORKER/OPERATOR actor shapes, runtime/migration/retention roles, financial key retention, audit24 tháng giữ nguyên. | O-05–09/11/12; R2–R5 DDL predicates cần freeze; H-03/H-08/H-11/H-14/H-15/H-16/H-19/H-20, M-07/M-08. |

## 9. O-12 Post-Approval Documentation Review — 2026-10-18

### 9.1. Current sources, reference disposition và consistency

Đối chiếu **working copy** trên branch `feat/prisma-p0-schema`, HEAD `6173e2efc7d1c2c0d9b8559baf2a858c37b7f867`; không dùng HEAD Requirements cũ ghi đè docs chưa commit. Baseline trước sửa: 86 Git tracked/untracked inventory entries (gồm deleted path và patch O-12 có trước), index rỗng; snapshot/manifest/hash và before copies ba file whitelist lưu ngoài repo trong Temp `educore-o12-postreview-xadpSR`. Root `PROJECT_CONTEXT.md` không tồn tại, actual file `docs/ai/PROJECT_CONTEXT.md`; sửa đúng file đã xác minh, không tạo bản trùng.

| Current source / section | Contract đối chiếu với plan | Disposition |
|---|---|---|
| [Decision Register §F](../../DECISION_REGISTER.md#f-o-12--approved-business-decision-2026-10-18) / [O-12 N](O12_DECISION_PROPOSAL.md#n-final-approved-decision--2026-10-18) | Owner18/10 A=A/B=B1/C=C1/D=D, B superseded; business khác technical approval | §4.12/4.14/8 đã đồng bộ; không sửa hai sources này |
| [Requirements BR-06, BR-14, Q-04/Q-08](../../../requirements/requirements_analysis.md) | Session-date PriceRule DATE, B1/C1/D, separate request-policy pin; unchanged discount/P0 rules | §3.2/4.4/4.12/R1b/R2 giữ cùng contract |
| [UC-21/23/24](../../../requirements/usecase/specification.md) | Price evidence/original lineage, closed-month draft, no implicit0, same-key retry/new G2, stale/issue checks | R1b/R2 acceptance cùng [O12-AC-01–27](O12_DECISION_PROPOSAL.md#n5-acceptance-matrix-hien-hanh--o12-aa), chưa thực thi |
| [DB Design DB-08/§3.6](../../../design/database_design.md) / [DD §5.7](../../../design/detailed_design.md) | Source date=price date per line; C1/immutable G history/current pointer; child/inverse guards/locks | Planning đồng bộ; fields/SQL/locking pending technical sign-off |
| [API §3.6/5.4](../../../design/api_specification.md) | Server-derived price/date/zone/VND strings; retry/recompute/issue distinction; recompute transport pending review | Không thêm endpoint/permission mới hoặc gọi route implemented |
| [Billing Class Design §3/4](../../../design/class%20design/billing-receivables.md) | resolvePrice(source,pricingLocalDate), per-line snapshots/history, original class/course after transfer | O-04/R2 không còn cho bỏ G1/G2 history; representation vẫn open |
| [Scheduling Class Design §4](../../../design/class%20design/resource-scheduling.md) | Canonical startsAt/z/lineage, future-only mutation, shared source invalidation/locking | §3.2 runtime không mở past reschedule/automatic G2; giữ Billing arithmetic ở Billing |
| [R1a §7](SCHEMA_REMEDIATION_R1A.md#7-acceptance-checklist--mức-evidence) / [Independent audit](SCHEMA_AUDIT_P0.md) / [Schema review](SCHEMA_REVIEW.md) | R1a S evidence có giới hạn; audit/review snapshots pre-R1a giữ lịch sử, P NOT RUN | Không đóng H-04/NOT_READY, không sửa report/hash/findings cũ |

**Reference fixes được phép:** `AGENTS.md` Sources item4 và `docs/ai/PROJECT_CONTEXT.md` §2 thay `detailed_des.md`→`detailed_design.md`, `api_spec.md`→`api_specification.md`; chỉ thay paths, không đổi hierarchy/instructions/scope/permissions. Current plan links trỏ reports tại cùng thư mục reviews/database. Old paths/hash/line-number citations trong §2/3.3/7 và O-12 A–M giữ đúng lịch sử; R6 future delta-report path đổi theo thư mục review hiện tại và ghi rõ chưa tồn tại. Không restore report đã move hoặc sửa patch export có trước.

**Ngoài scope cần lưu ý:** audit/Schema Review có câu pre-R1a về FK và O-12 pending — là historical evidence, cần dẫn delta evidence khi review mới, không overwrite snapshot. O-12 N.6 còn ghi Remediation Plan/AGENTS/context cần sync — nay là ghi nhận của task trước, đọc cùng §9 này; không sửa addendum chỉ để đổi câu chữ. Patch `O12_DOCUMENTATION_SYNC.patch` là export của lượt đồng bộ 9 docs trước, không bao gồm delta post-review này. Không thấy conflict mới buộc mở lại O-12 business; các vấn đề kỹ thuật dưới đây vẫn pending.

**Broken reference ngoài whitelist đã xác minh:** `docs/ai/README-START-HERE.md:198` vẫn dùng `docs/design/api_spec.md` làm current API source; đề nghị đổi thành `docs/design/api_specification.md` trong task được phép sau. Không sửa README trong lượt này; lỗi alias ngoài scope không làm thay đổi O-12 contract hoặc chặn technical design review với actual source đã dẫn ở trên.

### 9.2. Genuine technical blockers — không là approval

| Decision / dependency | Vấn đề cần sign-off, tài liệu liên quan | Ảnh hưởng R1b / R2 | Status / bằng chứng còn thiếu |
|---|---|---|---|
| **O-01** | §3.2.1–3.2.3/4.1; DB §3.6, DD §5.7, O-12 N.3: tenant mutex vs equivalent, rank/order/fresh snapshots, parent/child immediate/deferred, runtime gateway grants/search_path/ownership, bounded retry/unknown commit | **Block technical D R1b** và mọi source/financial writer R2; cùng contract R3/R4 | **RECOMMENDED / PENDING TECHNICAL+SECURITY SIGN-OFF**; cần reviewed lock graph, SQL/privilege inventory và ≥2-connection/fault/throughput evidence sau authorization |
| **O-04** | §4.4, DB generation/snapshot proposal, O-12 N.3: typed generation metadata/payload/schemaVersion, per-line dates/pricing/lineage, base/latest/current-applied FK/UQ/pending/CAS, immutable history vs attempt status | R1b cần minimal trusted attribution/source interface; **full generation schema/history/current-pointer blocks R2**, không buộc implement full G trước month guard design | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; cần concrete model/field/JSON/key/backfill/serializer contract + G1/G2/stale/replay fixtures; history obligation đã approved theo O12-D |
| **O-13** | §4.13, O-12 N.7: per-domain state/required metadata/predicates, frozen-zone authority, actor shape, runtime/migration/retention roles, financial key retention/recovery | **Block phần guards/states/ops R1b/R2 liên quan**, không dùng generic enum/TTL đoán | **RECOMMENDED / PENDING SECURITY+OPERATIONS SIGN-OFF**; thiếu state/transition/privilege/retention matrix và runtime-role denial/fencing/restore evidence |
| **O-02 / O-03** | §4.2/4.3, DB §3.6/§9 và Q-08/API: counter row/format prose discrepancy, padding/year semantics; dueAt calendar cutoff | Không block local month attribution design; **block counter/dueAt/ISSUE contract R2** | **PENDING_APPROVAL** đúng chi tiết còn mở; cần selected semantics/design và rollover/rollback/replay/calendar cases; không hỏi lại one-invoice hoặc 7 ngày |
| **O-05 / O-06 / O-07** | B1–B5 BUSINESS APPROVED19/10; §10/UC-25/26/34/DB/DD/API wallet contract aligned. Exact signed offsets/partial base UQs/source/root receipt/full reversal/approved state/privileges còn review | Không block period math R1b; **block related R2-B/C financial DDL/runtime và R4 executor contract** | **RECOMMENDED / PENDING TECHNICAL+SECURITY SIGN-OFF**, legacy policy/data inventory pending; W01–36 DESIGNED, PG/fault/race chưa chạy. No new wallet excess-case engine requirement |
| **O-10** | §4.10, audit M-01: NUMERIC(25,6) raw discount widening, BigInt intermediate overflow/JSON/HALF_UP | Không block R1b; block financial precision DDL R2 theo storage contract | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; cần field/native precision diff/range proof và DB arithmetic tests; business ceiling chỉ nếu owner mở riêng |
| **H-01/R3 + source/backfill provenance** | Audit H-01/H-18/H-20, R1a §6, O-12 N.7: original session/class/course lineage, existing data mismatches, C1/tzdata/history inventory/backfill không bịa | Minimal mutation/source contract R1b; price/source correctness R2; provenance/precheck trước data migration, không chặn independent docs/design review | **PENDING REVIEW / DATA NOT INSPECTED**; thiếu approved inventory/backfill strategy và DB source/parent/transfer tests; không rewrite legacy issued price basis bằng O-12 |
| **API slice review / R4 foundations** | API §5.4/DD §5.7: recompute concrete path/permission/DTO/error/status; durable admission+job pin/current auth/audit/recovery primitives | Không block independent period guard proposal; **block runtime Billing feature readiness R2**, schema phải đủ cho reviewed persistence contract | **PROPOSED / PENDING API REVIEW**; cần route/permission/state sign-off và real API/job/replay/auth integration tests; không tự thêm endpoint |

Không coi O-11 bootstrap toàn phần hoặc O-08/O-09 learning/file choices là blocker giả cho independent R1b month guard. Chỉ mang vào dependency khi slice/actor/DDL thật sự cần; R4/R3 contracts có thể review trước, không tạo dependency cycle. **R1b/R2 vẫn cần authorization triển khai riêng sau technical approvals.**

### 9.3. Review gates và stop condition

**Kết luận documentation review: READY FOR TECHNICAL SIGN-OFF.** Tài liệu và dependency board nay dùng A=A/B1/C1/D, historical B marked superseded, genuine technical blockers đã liệt kê. Đây không là technical sign-off, không là READY FOR R1B IMPLEMENTATION, không đóng H-04 và không tạo PostgreSQL/runtime PASS.

**Offline checks thực sự chạy:** 138 assertions PASS (83 protected inventory entries, đúng ba file whitelist thay đổi, instruction/context chỉ đổi aliases, các O sections không liên quan giữ nguyên, O-12/board/roadmap/history/gates/whitespace/HEAD/index); kiểm 20 Markdown links/anchors hiện có trong plan không lỗi. Kiểm thêm 20 concrete file/directory paths trong AGENTS/context và column shape của 24 Markdown tables trong plan đều PASS. `git diff --check` exit0; `git status --short`/`git diff --name-only` đã chạy, đọc cùng before-manifest để tách pre-existing changes. Các lệnh này không kết nối DB hoặc chạy business implementation.

Checks task này chỉ Git/status/HEAD/index, actual paths, source consistency, Markdown links/anchors/fences/tables, task-local diff/whitespace và SHA-256 preservation; các kết quả/số lượng thực sự chạy được báo riêng ở câu trả lời cuối. Không chạy Prisma validate/generate/typecheck, implementation tests, SQL/migrations/PostgreSQL/concurrency/NFR/restore. Giữ nguyên 9 docs O-12 (gồm original A–M, addendum N, 28 historical và 27 current cases), schema R1a, audit/R1a reports, exported patch và các pre-existing changes. Dừng sau docs review, không tự thực hiện technical sign-off/R1b/R2 hoặc Git write.

## 10. Wallet Phase 2 Documentation Sync — 2026-10-19

### 10.1. Authority và limited supersession

Owner trực tiếp19/10 **BUSINESS APPROVED WALLET-B1–B5**, **PRINCIPLE ACCEPTED ARCH-SIMPLIFY-P0**, ghi [Register §G](../../DECISION_REGISTER.md#g-wallet-p0--owner-business-approval-2026-10-19). Không tự ký Q1–Q8 hoặc O-01/O-04/O-13. Business Source of Truth cập nhật trước: Requirements5.1 FR-30/31/BR-08/11/Q-10/12/§8 → UC-25/26/34/37 → Register → DB/DD/API → classes → plan/proposal addenda/context. Không thêm UC-38, không đổi IDs, giữ O-12/Group A phần không superseded.

Current finance: staff-only verified TOP_UP trước invoice được phép, một account/student/tenant/no expiry/no cash-out; explicit WALLET payment chỉ ISSUED same owner, amount<=balance/due. Approved execution giảm/hủy releases net allocation và credit đúng excess atomic, permanent claims/payment/issued history giữ. Full top-up reversal khi balance đủ, permission/reason/audit, thiếu thì reject. No legacy/mixed automatic conversion/credit, cần inventory/policy trước affected migration/collection/adjustment. New wallet-only không build excess-case engine/FIFO/movements/remaining projections; old §4.5 chỉ lịch sử/legacy analysis không authorize implementation.

### 10.2. Current simplified technical recommendations — chưa sign-off

| Q / affected decision | Một default hiện hành | Exact blocking scope |
|---|---|---|
| Q1/O-01 | User SHARE/UPDATE current-auth anchors trước Tenant NK/RC/fresh statements, fixed domain order; Wallet trước Invoice; narrow commands+FK/UQ/CHECK/history/privileges, không global advisory framework mặc định | **R1b** source/period/IAM gate/parent/inverse/timing/grants/concurrency; R2 all critical writers. Mọi writer coverage phải review/test |
| Q2/O-04 | Một typed G+immutable versioned per-source JSON, currentApplied pointer/indexed latest/CAS/full source recheck, không typed Source table/epoch/pointer layers bắt buộc | R1b minimum source/snapshot interface, **R2-A full generation**; không buộc add G/wallet để month guard |
| Q3/O-13 | State per-domain, immutable history+audit/actor/current rights, least privileges, fenced attempts/DB-only outbox; không generic policy/state engine | Required R1b guards/states/roles subset; R2/R4 actual permissions/receipt/attempt/retention |
| Q4/retry | Initial+3 auto/backoff giữ. Requeue<4, explicit manual synchronous execution sau4 cùng root/G là proposal, giữ exhausted history/no fifth worker attempt | R2/R4 recovery path/receipt/fencing/API sign-off, không R1b period math. `attempt_count<=4` hiện prose, không SQL CHECK; không nới/reset |
| Q5/O-02/03 | Counter tenant/local issue-year, INV format, +7local calendar days cùng giờ/DST rules ở Wallet E.Q5 | R2-B issue field/counter/dueAt DDL/service; không hỏi lại7days/manual ISSUE |
| Q6/O-05 | Wallet2tables + Payment.WALLET + signed RELEASE + partial base UQ/pair/source guards; LIFO payment attribution/full nominal reversal net credit là pending | R2-B/C/D financial DDL/queries/reversal/cutover; legacy policy/data inventory riêng. Không B1–B5 business blocker giả |
| Q7/O-06/07 | Business durable decision/explicit execution settled; technical sync B/IdempotencyRecord root approved version/guards/failure recovery recommendation | R2-B/C/R4 executor/receipt/state/schema/SQL/API. D1 giữ APPROVED khi E1 fail, root/pairs/COMPLETED atomic |
| Q8/O-10/H-01/API | BigInt exact/Decimal/HALF_UP once/JSON money strings, proven(25,6) widening nếu needed, original lineage/no fabricated history; transport riêng review | R1b minimum historic-source guards; R2 precision/native range/full snapshots/API. Không unapproved business cap |

### 10.3. Roadmap và acceptance hiện hành

Phase2 docs review → **separate authorization** Phase3 R1b implementation plan/technical sign-off → explicit R1b minimal schema/SQL/disposable-DB tests (Phase4) → **separate** R2-A generations/B invoice lifecycle/C wallet/D integration → feature slices/E2E/deploy scopes riêng. Không tự tạo `R1B_IMPLEMENTATION_PLAN.md` trong task này. R3/R4/R5/R6 không liên quan giữ; source/auth/audit contracts lấy đúng subset thật sự cần, không chờ full modules để review period design.

W01–W36 original Wallet matrix **DESIGNED**, không sửa lịch sử hoặc nâng trạng thái từ offline vectors. UC thêm AC-25-03–10, AC-26-04–10, AC-34-04/05, AC-37-05/06; manual recovery AC còn proposal. Required future PG tests: receipt key/body/source duplicate, wallet/invoice concurrent pay, adjustment/cancel vs pay, optionalR1a finalization/negative student FK, H-04 inverse/C1/month boundaries, exact native ranges/partial keys, grants/history, approval fail/root replay, worker stale token/unknown commit/crash, legacy migration/restore và B+A=T. Runtime current scope/API/jobs/reporting riêng; S validation không chứng minh P safety.

### 10.4. Remaining scope limits và preservation

Wallet/R1b/R2 schema/API/runtime **NOT IMPLEMENTED**, SQL/migrations/PG/runtime **NOT RUN**, H-04 **OPEN**. Current branch/HEAD trước task: `feat/prisma-p0-schema` / `9d5fb7c39a6dcd605fe36bc544d85bf217009e63`, hai untracked proposal có trước. Snapshot87files và binary diffs ở `C:/Users/Admin/AppData/Local/Temp/educore-wallet-phase2-4UYOpg/`; allowed18existing docs, no new repo file. Original A–M Wallet/A–L Technical giữ byte prefix, addenda cuối; O12 report/R1a/audit/schema/code/migration inventory/AGENTS unchanged. Actual offline check counts/results được báo trong final, không reuse old §7/9 PASS như task evidence.

**Ngoài whitelist:** `AGENTS.md` còn “refund automation”, Architecture §1.2 còn “tự hoàn tiền”; không sửa instructions/Architecture trong task này. Requirements/UC/DB/DD hiện chỉ rõ limited internal-wallet exception sau approved execution, external refund vẫn cấm. Owner cần reconcile wording các file ngoài scope trước implementation nếu gây hiểu nhầm; đây không authorization agent vượt hard boundaries. UI/SCREEN_MAP/README no-credit references là backlog cho authorized UI/docs review, không sửa theo task này.

**Phase2 status:** business/source synchronization hoàn tất để review, không technical or implementation sign-off. Dừng sau documentation/Git verification; không mở R1b preparation/DB hoặc R2.
