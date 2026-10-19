# EduCore — R1a Confirmed Relational Integrity Fixes

**LOCAL SCHEMA DRAFT · 18/10/2026 · Asia/Saigon · chờ review diff trước bước tiếp theo.**

## 1. Scope / Sources

Theo authorization explicit trong phiên này, chỉ triển khai local **H-02A** và **H-04A phần student** của `SCHEMA_REMEDIATION_PLAN_P0.md` §3.1/§3.2. Không triển khai phần period/timezone, tenant gateway O-01, history triggers, R2–R6 hoặc bất kỳ migration/database/runtime feature nào. Không cập nhật trạng thái quyết định.

Nguồn đã đối chiếu: working schema; kế hoạch remediation đã review; Requirements v5 Q-05/BR-04 và Q-08; Database Design v1.1 §3.5/DB-07 và Group A; invariants Attendance/Billing trong class design. Các đoạn class design cũ gọi one-invoice chưa chốt không được dùng để thay Group A. `PROJECT_CONTEXT.md` và `educore-feature-slice/SKILL.md` dùng cho workflow; user đã cho phép chính xác slice này nên không mở thêm feature/template file.

**Kết quả:** draft schema thêm 2 scalar fields, 4 unique keys (3 candidate targets + 1 Prisma cardinality key), thay 4 FK relations và thêm 1 index; **62 models/28 enums giữ nguyên**, không đổi enum. Chỉ 5 model thay đổi: AttendanceRecord, AttendanceFinalization, SessionParticipant, Invoice, InvoiceLine. Delta riêng R1a **+11/−4 dòng**, so với working copy trước lượt này, không phải so HEAD.

## 2. Snapshot và bảo toàn thay đổi có trước

Branch `feat/prisma-p0-schema`; HEAD `6173e2efc7d1c2c0d9b8559baf2a858c37b7f867`. Đầu lượt có:

```text
 M apps/api/prisma/schema.prisma
 M docs/ai/SCHEMA_REVIEW.md
 M docs/requirements/requirements_analysis.md
?? docs/ai/SCHEMA_AUDIT_P0.md
?? docs/ai/SCHEMA_REMEDIATION_PLAN_P0.md
```

Không staged diff. Schema/review/Requirements đã modified và audit/plan đã untracked trước R1a. Audit/plan cũ tiếp tục mô tả snapshot trước R1a; không sửa chúng để che sự khác biệt hash hoặc tuyên bố findings đã đóng.

**Snapshot local ngoài source tree:** `C:/Users/Admin/AppData/Local/Temp/educore-r1a-yIhx6c`.

- [working-tree-before.patch](/C:/Users/Admin/AppData/Local/Temp/educore-r1a-yIhx6c/working-tree-before.patch): toàn bộ tracked working diff `git diff --binary --no-ext-diff`, SHA-256 `7426c9a6b3742590acefbb0ee54c2323ec472d02088ed4c87be7625e9f4280c2`.
- `index-before.patch`: snapshot index diff (rỗng); `status-before.txt`, `snapshot.json`: Git status/HEAD/branch/hash.
- `before/<repo-relative-path>`: byte copy của toàn bộ **82 tracked/untracked files không bị ignore** ở đầu lượt, gồm cả schema, Requirements, SCHEMA_REVIEW, audit và remediation plan. Có bản đầy đủ các file untracked mà Git diff không chứa.
- [schema-r1a-only.patch](/C:/Users/Admin/AppData/Local/Temp/educore-r1a-yIhx6c/schema-r1a-only.patch): delta riêng R1a, cũng được nhúng đầy đủ ở §3. Đây là snapshot/review artifact, không phải migration.
- Các schema copies/generated client/type fixtures/check script/results nằm trong thư mục tạm này; không thêm vào source tree. Snapshot tạm local cần giữ tới khi review xong; không phải backup đã commit hoặc lưu ngoài máy.

| File/hash | Giá trị |
|---|---|
| Schema trước R1a SHA-256 | `7f78d2bd1d625a3a685e3a161ad8611fd591a1223872f8da8afabaf5f85598ec` |
| Schema draft R1a SHA-256 | `28b993a418340523e6e0246fca3bc94bb73e7d5f269a3fb8cf46472565d51b28` |
| Delta R1a SHA-256 | `50194a9f579a6423f24e4b2bfa1cf5a583e474ca827d55a0e173d172004e3d0b` |

Không reset/restore toàn working tree; không stage, commit, push, đổi branch hoặc tạo PR. Snapshot được lưu **trước schema mutation đầu tiên**. Kiểm cuối đối chiếu hash các file có trước, cho phép đúng schema thay đổi và một report mới; generated code không xuất hiện dưới `apps/api/src`.

## 3. Files changed và exact R1a diff

| Model | Thay đổi / lý do |
|---|---|
| AttendanceRecord | Required `sessionId UUID @map("session_id")`; participant FK và nullable finalization FK đều mang tenant+session. Hai FK explicit `onDelete: Restrict, onUpdate: Restrict`. |
| AttendanceFinalization | Candidate UQ `(tenantId,sessionId,id)`, map `af_tenant_session_id_uq`; giữ UQ session và mọi field cũ. |
| SessionParticipant | Candidate UQ `(tenantId,sessionId,studentId,id)`, map `sp_tenant_session_student_id_uq`; giữ candidate 3 cột phục vụ AttendanceRecord. |
| InvoiceLine | Required `studentId UUID @map("student_id")`; invoice FK `(tenant,invoice,student)` và participant FK `(tenant,session,student,participant)`. Hai FK explicit Restrict delete/update. |
| Invoice | Candidate UQ `(tenantId,id,studentId)`, map `inv_tenant_id_student_uq`; không đổi period/run/status/amount/policy fields hoặc quan hệ period. |

**Prisma compatibility key bổ sung:** lần validate đầu phát hiện P1012: quan hệ một-một participant yêu cầu unique đúng các cột FK. Thêm `AttendanceRecord @@unique([tenantId,sessionId,participantId], map: "ar_tenant_session_participant_uq")`, đồng thời giữ unique `(tenantId,participantId)` cũ. Đây là superkey logic dư nhưng cần cho Prisma nhận diện one-to-one; không đổi cardinality hay thêm business rule.

**Index:** thêm `ar_tenant_session_finalization_idx(tenantId,sessionId,finalizationId)` cho truy vấn session/finalization và referencing lookup; giữ index `(tenantId,finalizationId)` hiện có. InvoiceLine đã có unique index prefix `(tenantId,invoiceId,...)`, `(tenantId,participantId,...)` và session index; không thêm một index invoice/student trùng prefix khi chưa có query/load evidence cần thiết. Không xóa index/unique có trước; chi phí write của các candidate/cardinality keys cần review PostgreSQL sau này, chưa benchmark.

Back-relations giữ nguyên tên và cardinality: `AttendanceFinalization.records[]`, `SessionParticipant.attendanceRecord?`, `SessionParticipant.invoiceLines[]`, `Invoice.lines[]`. Prisma validate/generate và type fixtures xác nhận chúng vẫn nối đúng model. Không cần thêm direct AttendanceRecord→ClassSession hoặc InvoiceLine→StudentProfile: parent FKs hiện tại đã bảo đảm sự tồn tại transitively.

Dòng context trống trong fenced diff dưới đây được bỏ dấu cách cuối dòng để tránh trailing whitespace; snapshot patch giữ nguyên byte canonical.

```diff
diff --git a/apps/api/prisma/schema.prisma b/apps/api/prisma/schema.prisma
index 22c4660..6a66988 100644
--- a/apps/api/prisma/schema.prisma (working copy before R1a)
+++ b/apps/api/prisma/schema.prisma (R1a draft)
@@ -955,6 +955,7 @@ model SessionParticipant {
   @@unique([tenantId, id])
   @@unique([tenantId, sessionId, id])
   @@unique([tenantId, sessionId, studentId])
+  @@unique([tenantId, sessionId, studentId, id], map: "sp_tenant_session_student_id_uq")
   @@index([tenantId, studentId, sessionId])
   @@index([tenantId, enrollmentId])
   @@map("session_participants")
@@ -1034,6 +1035,7 @@ model AttendanceFinalization {

   @@unique([tenantId, id])
   @@unique([tenantId, sessionId])
+  @@unique([tenantId, sessionId, id], map: "af_tenant_session_id_uq")
   @@index([tenantId, confirmedByMembershipId])
   @@map("attendance_finalizations")
 }
@@ -1042,6 +1044,7 @@ model AttendanceFinalization {
 model AttendanceRecord {
   id                     String           @id @default(uuid()) @db.Uuid
   tenantId               String           @map("tenant_id") @db.Uuid
+  sessionId              String           @map("session_id") @db.Uuid
   participantId          String           @map("participant_id") @db.Uuid
   finalizationId         String?          @map("finalization_id") @db.Uuid
   attendanceStatus       AttendanceStatus @map("attendance_status")
@@ -1052,8 +1055,8 @@ model AttendanceRecord {
   updatedAt              DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

   tenant       Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Restrict)
-  participant  SessionParticipant      @relation(fields: [tenantId, participantId], references: [tenantId, id], onDelete: Restrict)
-  finalization AttendanceFinalization? @relation(fields: [tenantId, finalizationId], references: [tenantId, id], onDelete: Restrict)
+  participant  SessionParticipant      @relation(fields: [tenantId, sessionId, participantId], references: [tenantId, sessionId, id], onDelete: Restrict, onUpdate: Restrict, map: "ar_participant_session_fk")
+  finalization AttendanceFinalization? @relation(fields: [tenantId, sessionId, finalizationId], references: [tenantId, sessionId, id], onDelete: Restrict, onUpdate: Restrict, map: "ar_finalization_session_fk")
   recordedBy   TenantMembership        @relation(fields: [tenantId, recordedByMembershipId], references: [tenantId, id], onDelete: Restrict)
   corrections  AttendanceCorrection[]
   invoiceLines InvoiceLine[]
@@ -1061,7 +1064,9 @@ model AttendanceRecord {
   @@unique([tenantId, id])
   @@unique([tenantId, participantId, id])
   @@unique([tenantId, participantId])
+  @@unique([tenantId, sessionId, participantId], map: "ar_tenant_session_participant_uq")
   @@index([tenantId, finalizationId])
+  @@index([tenantId, sessionId, finalizationId], map: "ar_tenant_session_finalization_idx")
   @@index([tenantId, recordedByMembershipId])
   @@map("attendance_records")
 }
@@ -1212,6 +1217,7 @@ model Invoice {
   @@unique([tenantId, id])
   @@unique([tenantId, billingRunId])
   @@unique([tenantId, billingRunId, studentId, periodId])
+  @@unique([tenantId, id, studentId], map: "inv_tenant_id_student_uq")
   @@unique([tenantId, periodId, studentId])
   // PostgreSQL unique permits multiple NULL draft numbers, but no duplicate issued number.
   @@unique([tenantId, invoiceNumber])
@@ -1224,6 +1230,7 @@ model InvoiceLine {
   id                 String   @id @default(uuid()) @db.Uuid
   tenantId           String   @map("tenant_id") @db.Uuid
   invoiceId          String   @map("invoice_id") @db.Uuid
+  studentId          String   @map("student_id") @db.Uuid
   participantId      String   @map("participant_id") @db.Uuid
   sessionId          String   @map("session_id") @db.Uuid
   attendanceId       String?  @map("attendance_id") @db.Uuid
@@ -1238,8 +1245,8 @@ model InvoiceLine {
   updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

   tenant      Tenant                      @relation(fields: [tenantId], references: [id], onDelete: Restrict)
-  invoice     Invoice                     @relation(fields: [tenantId, invoiceId], references: [tenantId, id], onDelete: Restrict)
-  participant SessionParticipant          @relation(fields: [tenantId, sessionId, participantId], references: [tenantId, sessionId, id], onDelete: Restrict)
+  invoice     Invoice                     @relation(fields: [tenantId, invoiceId, studentId], references: [tenantId, id, studentId], onDelete: Restrict, onUpdate: Restrict, map: "il_invoice_student_fk")
+  participant SessionParticipant          @relation(fields: [tenantId, sessionId, studentId, participantId], references: [tenantId, sessionId, studentId, id], onDelete: Restrict, onUpdate: Restrict, map: "il_participant_student_fk")
   session     ClassSession                @relation(fields: [tenantId, sessionId], references: [tenantId, id], onDelete: Restrict)
   attendance  AttendanceRecord?           @relation(fields: [tenantId, participantId, attendanceId], references: [tenantId, participantId, id], onDelete: Restrict)
   priceRule   PriceRule?                  @relation(fields: [tenantId, priceRuleId], references: [tenantId, id], onDelete: Restrict)
```

## 4. Optional finalization và nested Prisma relations

| Đường ghi / kiểu generated | Kiểm tra thực sự và giới hạn |
|---|---|
| Checked AttendanceRecord create draft | Fixture bỏ `finalization`, connect tenant/participant/recordedBy: typecheck PASS. Checked input lấy session từ relation; không có scalar sessionId độc lập trên checked input. |
| Unchecked create draft | Required tenantId/sessionId/participantId; `finalizationId?: string | null`. Fixture NULL và omission hợp lệ; thiếu sessionId bị TypeScript reject qua negative fixture. |
| Finalized create/connect | Generated selector `AttendanceFinalization.tenantId_sessionId_id`; connect cùng participant session: typecheck PASS. Selector thiếu sessionId bị negative fixture reject. `connect:{id:...}` vẫn có thể dùng vì id global unique; không thay FK cần kiểm ở DB. |
| InvoiceLine checked/unchecked | Selector `Invoice.tenantId_id_studentId` và `SessionParticipant.tenantId_sessionId_studentId_id` có đủ tuple. Unchecked input thiếu studentId hoặc selector invoice thiếu studentId bị negative fixture reject. |
| Nested back-relations / transaction callback | Nested records create, invoice.lines create, include các back-relations và typed `$transaction` callback đều compile PASS. Fixture không được execute; không tạo PrismaClient/adapter hoặc gửi query. |
| Update để bỏ finalization | `AttendanceRecordUncheckedUpdateInput {finalizationId:null}` compile PASS, không yêu cầu đặt tenantId/sessionId NULL. Lifecycle/quyền cho phép detach chưa được triển khai. |
| `finalization:{disconnect:true}` | Generated checked update nhận shape này, typecheck PASS. Vì FK dùng chung required tenantId/sessionId, **chưa chứng minh query engine xử lý disconnect an toàn**; có thể lỗi runtime nếu thao tác cố null shared fields. Phải thử real Prisma+PostgreSQL trước cho phép caller dùng. Không đổi required fields để né vấn đề. |
| Semantic mismatch | Fixture cố connect participant/finalization khác session hoặc invoice/participant khác student vẫn compile: TypeScript chỉ biết UUID là string, không chứng minh value equality. FK là protection DB dự kiến; phải có PG test thật. |

PostgreSQL FK nullable mặc định MATCH SIMPLE theo thiết kế: finalizationId=NULL bỏ kiểm FK finalization, nhưng sessionId và participant FK required vẫn bảo vệ record. Không dùng MATCH FULL vì draft có tenant/session non-NULL. Chưa generate/apply DDL hoặc xác minh catalog trong task này.

**R1a không thêm lifecycle enforcement:** child UPDATE đổi đồng thời các IDs sang một bộ parent hợp lệ khác vẫn có thể thỏa FK; Restrict không tự freeze historical record. Không quảng bá kiểu unchecked/nested update như quyền sửa lịch sử hoặc bypass service authorization.

## 5. Tests actually run

Các lệnh Prisma đặt `CHECKPOINT_DISABLE=1`, `PRISMA_HIDE_UPDATE_MESSAGE=1`, và process-only dummy `DATABASE_URL=postgresql://r1a_offline:r1a_offline@127.0.0.1:1/educore_r1a_offline`. Không dùng credentials thật; validate/generate không chạy database. Không sửa env/config file.

| Command/check | Kết quả thực tế |
|---|---|
| `pnpm.cmd --filter api exec prisma validate` trên working schema | Lần đầu FAIL P1012 do thiếu unique exact tuple của one-to-one; thêm cardinality key nêu §3. Lần cuối PASS, CLI 7.10.1. Không coi validate là test FK PostgreSQL. |
| `pnpm.cmd --filter api exec prisma generate --schema '<snapshot>/validation/prisma/schema.prisma' --generator client --no-hints` | PASS, generated Prisma Client 7.10.1. Schema copy byte-identical với final working schema, generator declaration giữ nguyên; output relative rơi vào `<snapshot>/validation/src/generated/prisma`. Load config đang có; không sửa output path/generator trong repo và không generate application code dưới apps/api/src. |
| `pnpm.cmd --filter api exec tsc --noEmit --incremental false --project tsconfig.json` | PASS, gồm lần chạy sau schema final. Không emit dist/tsbuildinfo. API hiện chưa import generated Prisma client nên đây là project compatibility, không chứng minh service callers đã migrate. |
| `pnpm.cmd --filter api exec tsc --noEmit --incremental false --project '<snapshot>/validation/tsconfig.relations.json'` | PASS cho generated-client fixtures ở §4, có 4 negative `@ts-expect-error` cases. Lần đầu temp harness FAIL TS2339 ở transaction delegates do wildcard runtime-module alias không resolve đúng; sửa **temp config** sang exact runtime/client.d.ts alias rồi PASS. Không sửa project tsconfig/dependencies. |
| `node '<snapshot>/offline-check.cjs'` | PASS **17 schema-derived assertions**: old counterexamples, same/wrong session, spoof session, nullable/omitted finalization, missing required keys, wrong tenant, parent-session mutation, wrong/matching student, no student value bypass, four Restrict mappings/candidates, back-relations và scope preservation. Đây là relation algebra bằng dữ liệu synthetic, không execute INSERT/UPDATE. |
| Generated client inspection | Metadata giữ relation names/back-relations; generated create/update/where types có session/student keys và finalization optional. Không execute generated query engine. |
| Period/scope static checks | PASS: 57 model khác giữ nguyên byte text, mọi enum/generator/datasource và text ngoài model giữ nguyên; BillingPeriod/BillingRun/ClassSession/Tenant/PolicyVersion unchanged. Counterexample đúng student nhưng sai tháng vẫn được relation algebra nhận, xác nhận **không thêm period rule**. |
| Snapshot/hash/Git/whitespace checks | Snapshot diff/index/status và 82 file có trước; kiểm preservation và exact R1a patch. Report mới kiểm riêng vì đang untracked. Kết quả cuối ghi ở acceptance §7. |

**NOT RUN:** migrate/migrate diff/db push/reset/seed/SQL/DDL/PostgreSQL/concurrency/catalog/EXPLAIN, database connection, API runtime tests, frontend tests, toàn R2–R6, Prisma format toàn file hoặc dependency install. Không sinh migration SQL để kiểm FK. Generate client/typecheck/17 assertions không được ghi thành PostgreSQL PASS.

Temp evidence: `offline-check.cjs`, `offline-check-result.json`, `validation/relation-inputs.ts`, `validation/tsconfig.relations.json`, generated client và copied schema; có thể rerun local để review, không được đưa vào Git. Không thêm persistent test source ngoài phạm vi hai file được cho phép.

## 6. INSERT/UPDATE, dữ liệu lịch sử và backfill tương lai

**H-02:** source shape tương lai cần sessionId trên mọi AttendanceRecord. Với P/S1, F/S2, chọn record.session=S1 vi phạm finalization FK; chọn S2 vi phạm participant FK. P/S1 + F/S1 hoặc NULL finalization là shape hợp lệ. Với referenced parent đang có child, sửa participant.sessionId hoặc finalization.sessionId/id sẽ bị Restrict dự kiến chặn; record draft có finalization NULL vẫn tham chiếu participant bằng session.

**H-04 student:** line phải có studentId bằng cả Invoice.studentId và SessionParticipant.studentId, đồng thời giữ participant/session equality cũ. I/X và P/Y không có studentId nào làm hai FK cùng đúng. Thêm required field làm các unchecked caller cũ thiếu student không còn compile; checked nested callers phải connect parents coherent. Existing parent student/id re-key có thể bị các FK Restrict mới chặn, gồm các cascaded update từ upstream parent; phải test chuỗi cascades với PostgreSQL.

**Lịch sử:** không sửa attendance/payment/issued invoice rows hoặc claims, không chuyển line sang student khác, không tạo correction/adjustment. FK chỉ bảo vệ equality/existence và referenced update/delete, không bảo đảm append-only, Teacher/financial scope, roster completeness, batch authority, 48h lock, snapshot, pricing, monthly containment hay transaction concurrency. Những phần này vẫn ngoài R1a. Không blanket set onUpdate cho quan hệ khác.

**Backfill plan chỉ phân tích, chưa áp dụng:**

1. Lấy data snapshot/backup và inventory sai quan hệ bằng read-only query trong task DB được phép. Không biết hiện có DB hay bao nhiêu rows; không claim data sạch.
2. Migration tương lai nếu có dữ liệu cần staged nullable columns, chốt write-path compatibility/maintenance strategy, rồi backfill có kiểm chứng; schema final required trong draft không phải lệnh ADD NOT NULL trực tiếp trên bảng đang có dữ liệu.
3. AttendanceRecord.sessionId lấy từ participant sau kiểm tenant. Nếu finalization tồn tại nhưng session không khớp, quarantine/review nguồn và history; **không tự đổi finalizationId, tạo F mới, đặt NULL hay xóa row** để qua FK.
4. InvoiceLine.studentId chỉ backfill khi invoice.studentId=participant.studentId và participant/session/attendance link hiện hữu hợp lệ. Mismatch không được che bằng chọn một phía; case đã issued/claimed cần business review và authorized correction/adjustment ở task riêng, giữ chứng cứ.
5. Sau đối soát: tạo candidate/cardinality keys, backfill đủ, xác minh NULL/mismatch=0 rồi add/validate FK và NOT NULL theo approved migration plan. Giữ shape draft finalization nullable. Kiểm concurrency writer/backfill và row-lock/index impact trên PG thật trước deploy.
6. Rollback schema draft nếu user yêu cầu sau review phải dùng before-R1a snapshot/delta, không `git reset` về HEAD vì sẽ mất các sửa đổi đã có. Chưa thực hiện rollback hoặc data migration nào.

## 7. Acceptance checklist / mức evidence

| Acceptance | Local evidence | PostgreSQL/runtime sau này |
|---|---|---|
| H-02 participant/finalization cùng session | PASS PSL/generation/types + algebra counterexamples; two tenant/session FKs đúng map/actions. | NOT RUN: actual invalid INSERT/UPDATE→23503, parent Restrict/cascade tests, optional NULL và valid finalized create. |
| H-04 line cùng student với invoice/participant | PASS PSL/generation/types + algebra; candidate keys và old session/attendance/claim relations giữ. | NOT RUN: mismatch student INSERT/UPDATE, nested connect contradictory values, parent student re-key. |
| One-to-one/back-relations | PASS exact cardinality UQ; generated back-relations/types giữ. | NOT RUN: query engine nested create/connectOrCreate/upsert/disconnect và transactional persistence. |
| Optional finalization | PASS scalar nullable, omit/NULL draft, checked shape; required session không đổi nullable. | NOT RUN: detach chỉ finalizationId và disconnect shared-required-field behavior. |
| Không đổi Period/O-01/R2–R6 | PASS model/text diff; cùng student/sai tháng vẫn ngoài FK. Không trigger/gateway/financialRevision/receipt/model mới. | H-04 period còn OPEN; không tính R1a là full H-04 remediation hoặc migration-ready. |
| Giữ thay đổi có trước | Before snapshot 82 files; final compare chỉ schema thay và report mới, không source khác mất/thay. | Không apply patch/schema tới DB hoặc shared environment. |
| Whitespace/review artifact | Delta +11/−4; tracked diff check exit0. Report no-index check exit1 do file mới khác NUL, không whitespace diagnostic sau khi bỏ context spaces trong Markdown. Raw snapshot patch vẫn canonical. | File report cần user review trước mọi Git action. |

**Gate D:** user đã cho phép H-02A và H-04A student-only thử nghiệm local, không mở toàn R1–R6. **Gate S:** schema draft đã implemented/validate/generate và typechecked trong giới hạn trên. **Gate P:** NOT RUN. **Gate R:** NOT IMPLEMENTED/NOT READY. Không đóng NOT_READY audit hoặc coi findings đã được PostgreSQL bảo vệ chỉ vì S đạt.

## 8. Risks & deviations / Pending review

- Bổ sung duy nhất ngoài danh sách candidate targets của plan là cardinality unique exact tuple bắt buộc do Prisma P1012; giữ invariant một attendance/participant. Một index session/finalization mới, không index removal hoặc blanket formatter.
- Shared FK scalar columns làm nested disconnect/upsert/connect behavior cần PG integration; types không ngăn contradictory UUID values. History identities có thể bị child mutation sang một bộ parent hợp lệ nếu service/SQL lifecycle guard chưa có.
- Period guard, source locking/gateway, immutable history/policy/audit, financial lifecycle/reconciliation/approval receipts vẫn chưa triển khai. Plan/audit/register/Requirements/design files được giữ nguyên; report này ghi đúng delta mới.
- Snapshot và generated/typecheck evidence nằm ở local temp, không phải artifact đã versioned. Không hứa dữ liệu hiện hữu đã có thể migrate hoặc NFR đã đạt.

**Pending review:** đúng schema delta §3 và report này; không đổi thêm gì sau R1a. Dừng trước migration/PostgreSQL/runtime/Git actions để chủ dự án review và cho phép bước tiếp theo.
