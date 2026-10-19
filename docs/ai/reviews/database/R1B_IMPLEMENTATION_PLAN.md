# EduCore — Minimal R1b Technical Sign-off & Implementation Plan

**DRAFT LOCAL · 19/10/2026 · Asia/Ho_Chi_Minh · PHASE 3 ONLY.**

**RECOMMENDED / PENDING OWNER TECHNICAL REVIEW.** Không technical approval, implementation authorization, migration hoặc database verification phát sinh từ tài liệu này.

## A. Executive Summary

**Chọn một phương án:** giữ nguyên R1a composite FKs; thêm duy nhất nullable `Tenant.timezoneFrozenAt`; CHECK hình dạng tháng trên BillingPeriod; một child period guard và các parent/history guards trực tiếp. Dùng **User-before-Tenant, Tenant FOR NO KEY UPDATE, READ COMMITTED và fresh reads**, reject/rollback source mutation làm đổi persisted billing evidence. **Không deferred/rebuild/STALE adapter trong R1b**, không generation/Wallet schema hoặc ISSUE engine.

Custom SQL được chia **2 helper functions + 6 trigger functions, 13 trigger attachments**: mỗi bảng cần bảo vệ chỉ có một row trigger, tái sử dụng freeze helper ngay trong calendar/billing INSERT guards. Không thêm trigger riêng lặp lại freeze trên4source tables, không new tables/indexes/FKs nếu R1a baseline đúng. Mỗi attachment có invariant cụ thể ở I; đây là inventory đề xuất, không SQL đã tạo/chạy.

**Privilege profile tối thiểu và có chủ ý:** runtime API/worker **không raw DML** vào protected source/history/IAM tables; R1b chưa mở production mutation entrypoints. Các SQL fixtures kiểm guards/protocol/current-auth query dưới test role riêng. Khi feature slice được mở, chỉ grant narrow reviewed domain commands tuân E/G, không generic gateway. Nhờ baseline API còn scaffold, không cần xây toàn Scheduling/Billing/IAM command layer chỉ để có database integrity package. **P-gate cho constraints/protocol không là R-gate cho API authorization.** Không dùng test-only wrapper làm production auth implementation.

Trade-off: critical writers cùng tenant phải chờ nhau; một số draft source edits bị chặn tới R2/R3 adapter. Đổi lại, không giữ committed wrong-period state, không trigger deferral orchestration hoặc sourceEpoch/G engine. Valid future unbilled scheduling còn do R3 kiểm conflict/capacity; R1b không tuyên bố lịch học/tuition/Wallet runtime ready. H-04 **OPEN**, cả khi sau này phần student/period R1b có evidence tốt.

## B. Verified Repository Baseline

### B.1. Git/schema reality

| Item | Bằng chứng hiện hành, không suy ra remote/DB |
|---|---|
| Branch | `feat/prisma-p0-schema` |
| HEAD | `703cdd4efecf6ffb4c2400f513dddfcf4648f2c0` — `docs: align P0 wallet business rules and simplified architecture` |
| Working tree/index trước task | Sạch; `git status --short`, unstaged/staged diff stat không có entries. Hai proposal và exported Phase2 patch nay đã có trong tracked inventory, không còn là untracked như snapshot9d5fb7c |
| Push | Owner xác nhận đã push; local HEAD chứa Phase2. Không fetch/network/remote verification, không độc lập xác nhận remote/main/deployment |
| Prisma | [Schema](../../../../apps/api/prisma/schema.prisma): **62 models,28 enums**, SHA-256 `28b993a418340523e6e0246fca3bc94bb73e7d5f269a3fb8cf46472565d51b28`; R1a vẫn có, chưa có freeze field/G/Wallet |
| Migration inventory | Có `apps/api/prisma/schema.prisma`; **không có `apps/api/prisma/migrations/`** trong checkout. Không suy ra DB rỗng hoặc chưa từng được tạo bằng SQL/db push |
| Tool/config | `apps/api/prisma.config.ts` đọc DATABASE_URL; packages khai báo Prisma/client7.10.1. Không đọc secrets, không kết nối URL, không chạy CLI/generate/typecheck. API AppModule chưa có business modules |
| Artifact | File plan này chưa tồn tại lúc bắt đầu; chỉ tạo file này |

### B.2. Sources và authority

Line numbers dưới đây theo HEAD703cdd4, riêng citations lịch sử trong audit/proposals giữ nguyên. Source precedence [AGENTS](../../../../AGENTS.md) → Requirements → UC → Accepted Architecture → approved design/business amendments → technical proposals. Đọc [Project Context](../../PROJECT_CONTEXT.md) §10 thay snapshot scaffold §7 khi kiểm current state.

| Source | Section/evidence và áp dụng |
|---|---|
| [Requirements](../../../requirements/requirements_analysis.md) v5+5.1 amendment | BR-04:222, BR-06:224, BR-14:232; Q-04:321–324, Q-08:340–345, Q-10/12:350 trở đi. O-12 local-start/date/month/C1/D; Wallet business scope không kéo vào R1b |
| [Use Cases](../../../requirements/usecase/specification.md) | UC-13:556/AC-13-01/02; UC-21/23/24, AC-21-03/04:920/921, AC-23-04–07:1009–1012, AC-24-03/04:1051/1052; UC-25/26/34/37 wallet amendment. No ordinary past reschedule, no issued rewrite hoặc fake confirmed source |
| [Architecture](../../../architectural/architectural_design.md) | Accepted modular monolith/PostgreSQL/Prisma; §1.2:25 có old refund wording. Không sao chép sang `docs/design/`, không sửa Architecture |
| [Decision Register](../../DECISION_REGISTER.md) §F/G | **O12-A=A/B=B1/C=C1/D=D business approved18/10**, **WALLET-B1–B5 business approved19/10**, simplification principle accepted; Q1–Q8/O-01/O-04/O-13 **PENDING TECHNICAL SIGN-OFF** |
| [DB Design](../../../design/database_design.md) §3.6/O-12/Wallet amendment | Live same-tenant/student/local-month invariants, first-source freeze, parent coverage; schema/SQL/roles vẫn proposal. Source snapshot JSON không thay FK/authorization |
| [Detailed Design](../../../design/detailed_design.md) §5.7 | Source/timezone/lineage, no late-price clock; source change không refresh G; shared protocol/history. R1b chọn immediate reject subset, full G/stale apply thuộc R2 |
| [API](../../../design/api_specification.md) §5.4/5.5/5.6 | Current scope/opaque version/DTO không source authority, wallet/recompute transport pending. Không tạo route hoặc finance executor |
| [Remediation Plan](SCHEMA_REMEDIATION_PLAN_P0.md) §3.2–3.2.3,4.1,4.4,4.13,5.3,9.2,10 | R1b minimum interface, guards, real PG gates; §10 là current wallet/simplification status. Deferred draft containment là option cũ, không obligation cho R1b reject-only design |
| [Technical Proposal](TECHNICAL_SIGNOFF_PROPOSAL_R1B_R2.md) C/D/E/G/H/M | Fresh snapshots, gateway privilege/identity limits, source/role/concurrency protocols. Addendum M giới hạn global fence/Source-table/cycle/receipt-table recommendations cũ, chưa technical approved |
| [Wallet Proposal](WALLET_P0_SIMPLIFICATION_PROPOSAL.md) E/H/I/N | R1b không full G/Wallet, reject mutation nếu chưa có adapter; business approval ở N, A–M là history. W01–W36 DESIGNED, không PG evidence |
| [O-12 Proposal](O12_DECISION_PROPOSAL.md) N.2–N.7 | Approved session-date source, sticky C1, immutable history; A–M historical charge-time recommendation không current authority |
| [R1a](SCHEMA_REMEDIATION_R1A.md) §4–8 | S/client evidence: nullable finalization, generated relations/typechecks/17synthetic assertions; no PG. Restrict không freeze mọi coherent reparent/update, vẫn cần history guards |
| [Independent audit](SCHEMA_AUDIT_P0.md) H-01/02/03/04/20 | H-01:126–134 gồm class/student/transfer/cycle gaps; H-03:146–154 attendance completeness/authority/time locks. R1b chỉ một phần source integrity, không đóng các findings toàn phần |
| [Billing](../../../design/class%20design/billing-receivables.md), [Scheduling](../../../design/class%20design/resource-scheduling.md), [Tenant](../../../design/class%20design/tenant-policy.md), [IAM](../../../design/class%20design/identity-access.md) | Original source chain/ports, C1, current auth/User-before-Tenant; no independent repositories ghi chéo module |
| [Audit](../../../design/class%20design/audit-traceability.md), [Jobs](../../../design/class%20design/automation-jobs.md), [Workflow](../../../design/class%20design/workflow-approval.md) | Existing provenance/retry/durable approval contracts; không full job/workflow/audit framework trong R1b |

**Wording ngoài scope:** `AGENTS.md:21` “refund automation”; Architecture §1.2:25 “tự hoàn tiền”. Owner19/10 đã duyệt limited internal wallet credit sau approved execution; external refund vẫn cấm. Đề xuất amendment riêng làm rõ hai cụm này trước R2-C, không sửa instructions/Architecture và không dùng chúng để kéo Wallet vào R1b. Không blocker cho independent R1b plan.

## C. R1b Scope & Non-goals

**Required:** bảo toàn R1a; chuẩn hóa month bounds; local-start containment; sticky timezone/source creation; source-chain/H-01 subset; prevent inverse/re-key/history drift; minimal current-auth/tenant transaction contract; grant boundary; existing-data precheck/migration strategy; PG verification plan.

**Không R1b:** WalletAccount/WalletTransaction/Payment.WALLET/signed allocations; BillingRunGeneration/G1/G2 persistence/sourceEpoch/current pointers; full pricing selection/EXCLUDE/discount/money engine; new ISSUE/counter/dueAt/approval lifecycle; full Scheduling conflict/capacity/roster, Attendance approval/48h correction; full IAM/Jobs/Audit/Workflow implementation. Không thêm state enum, receipt table, index “future-proof”, distributed/global advisory infrastructure.

Guard core dùng **immediate checks**. Không tạo STALE state/adapter mới, không auto G2, không commit wrong-period line để repair sau. Đây là staging boundary trước full source/recompute commands; không thay business right recompute/correction trong R2.

## D. H-04 & Source Integrity Design

### D.1. Invariant thực sự cần bảo vệ

```text
I = InvoiceLine.invoice; P = Invoice.billingPeriod
SP = InvoiceLine.participant; S = SP.classSession; T = same-tenant Tenant
sameTenant(Line,I,P,SP,S,T)
Line.studentId = I.studentId = SP.studentId       // existing R1a composite FKs
Line.sessionId = SP.sessionId                   // existing participant/session FK
T.timezoneFrozenAt IS NOT NULL
d = (S.startsAt AT TIME ZONE T.timezone)::date    // explicit named tenant zone
P.monthStart = first day of its month
P.monthEnd = (P.monthStart + interval '1 month')::date
P.monthStart <= d AND d < P.monthEnd
if SP.enrollmentId != NULL:
    enrollment.tenant/student/class = SP.tenant/student/S.class
```

`T.timezone` sau marker là frozen value; không thêm `timezoneSnapshot` column trên Tenant/Session chỉ để suy tháng. `ScheduleSeries.timezone` đã có; series mới phải khớp tenant zone khi tạo nguồn. Date source từ **actual SP→Session**, không dựa JSON/client session date/UTC month/endsAt/invoice.createdAt. Scalar IDs sai không được trigger tự sửa; FK/guard phải reject.

Không split overnight:30/09 23:30→01/10 00:30 local thuộc Sep;01/10 00:00 thuộc Oct. Một participant không được billed lại qua thay monthly identity/claim release. R1a unique logical invoice/run/issued claims giữ nguyên.

**Attendance/null boundary:** không ép optional AttendanceRecord.finalizationId thành NOT NULL; FK vẫn MATCH SIMPLE. H-04 month guard không bắt Line.attendanceId nonnull cho mọi DRAFT hoặc CANCELLED. Valid CANCELLED zero line với attendance NULL được nhận; no fake finalization. Normal confirmed-source completeness/chargeUnits/price eligibility trước ISSUE vẫn R2/R3: period success không cho phép issue incomplete draft hoặc implicit0 tariff. SQL test fixture incomplete/future draft không là business admission approval.

### D.2. Child và inverse-parent coverage

| Mutation | R1b behavior / lý do |
|---|---|
| INSERT InvoiceLine | FK student/session ownership như hiện có; period guard join actual parents dưới tenant gate; derive trusted source namespace F. Parent đã was-issued thì reject thêm line |
| UPDATE Line reconnect/financial source fields | **Reject source/evidence rewrite** sau insert trong R1b: id/tenant/invoice/student/participant/session/attendance/priceRule/sourceStatus/units/unitPrice/baseAmount/sourceSnapshot/createdAt. DRAFT nonfinancial reason/updatedAt có thể giữ, không authorized edit API mới. R2 deliberate recompute có thể replace mutable draft projection trong TX và giữ G history; không sửa frozen line |
| DELETE Line | Reject nếu parent was-issued/claimed. DRAFT delete chỉ trong reviewed command/test fixture; không xóa G history khi R2 có G. FK Restrict giữ referenced claims |
| Session reschedule/source change | Nếu startsAt đã tới, hoặc có persisted Line, reject ordinary changes tới starts/ends/class/series/policy/teacher/room/deliveryMode hoặc cancelled-vs-not-cancelled fact. Future chưa billed/started có thể đổi time theo R3 transaction, nhưng vẫn phải pass source guards; không source rewrite để “fix” wrong month |
| Session identity/delete | id/tenant immutable; delete past/billed/finalized source reject; existing Restrict FKs ngăn orphan. Class/series reparent khi có participant/finalization/line hoặc đã bắt đầu reject, empty future source chỉ khi FK/source policy hợp lệ |
| Invoice / Run owner/period | id/tenant/student/period/run identity immutable sau tạo; Run.operationKey giữ original identity. Không đổi invoice tháng để chứa session dời kỳ. FK Invoice→Run tuple đã có, không thêm field period vào Line |
| BillingPeriod bounds/id/tenant | Immutable sau insert, kể cả chưa có line; muốn tháng khác tạo đúng Period khác. CHECK monthly shape bảo vệ INSERT, guard chặn parent UPDATE gây drift |
| Participant owner/session/enrollment/kind | Existing R1a FKs chặn many referenced re-keys. Guard thêm H-01 join enrollment.class/session.class, và freeze source fields/removedAt nếu started/attendance/billed/claimed; không lookup current enrollment để thay original |
| Enrollment parent change | Nếu có participant tham chiếu, reject id/tenant/student/class re-key, ngăn parent class mutation phá H-01 mà child không UPDATE. End-date/status transfer bình thường không bị blanket freeze bởi R1b; full temporal eligibility/cycles/transfer coherence R3 |
| Class.courseId / Class id/tenant | id/tenant immutable; courseId không đổi khi Class có Session hoặc Series. Giữ original class→course chain. Course.id/tenant re-key qua FK cascade tới Class bị Class guard chặn nếu used; FK Restrict cũng chặn theo actual action. Test actual catalog/cascade path, không giả SQL action |
| AttendanceRecord/Finalization | Giữ R1a source IDs; relevant insert/update/delete sau Line cùng participant/session phải reject nếu làm đổi captured attendance/finalization evidence. Finalization lockedAt chỉ có thể set một lần như execution metadata; không đổi confirmed actor/time/source/revision khi billed. R3 correction append path chưa mở, không ghi giả correction để qua guard |
| Issued Invoice/Line/claims | Was-issued từ issuedAt/invoiceNumber/status ISSUED hoặc CANCELLED, hoặc existing claim; không thể reset DRAFT để unlock. R1b reject issued header/Line basis updates/delete, claims UPDATE/DELETE; không enable cancellation/ISSUE executor. InvoiceDiscount chưa có R1b trigger, bị đóng runtime DML theo G; full financial history guards thuộc R2. New approved correction thuộc R2 với reviewed guard extension |
| Tenant zone/id/delete | Sticky C1 D.3; Tenant id không đổi. Frozen Tenant không hard-delete để mất marker khi hết sources; no expiry/reset/unfreeze kể cả Ops |

**Không cần deferred inverse triggers:** mutable parent fields trên đã bị chặn ngay, còn child mới luôn được kiểm; không có R1b command hợp lệ cần temporarily wrong-month state rồi sửa. DELETE draft line/INSERT replacement phải từng bước hợp lệ; không move invoice monthly identity. R2 muốn guard timing khác phải review delta riêng, không auto SET CONSTRAINTS để bypass history.

### D.3. C1 freeze contract

First INSERT vào **ScheduleSeries, ClassSession(any status kể cả DRAFT), BillingPeriod, BillingRun** gọi cùng private freeze helper trong trigger transaction. Period/Run creation là boundary dù chưa có session. Generation sau này R2 phải gọi cùng helper nếu mở creation path mới. TOP_UP không thuộc R1b hoặc thêm boundary C1 mới.

Helper khóa Tenant NK, đọc z fresh, nếu marker NULL thì set **DB clock instant sau lock** và updatedAt; nếu đã nonnull giữ nguyên. Series timezone phải bằng z, invalid/mismatched zone reject. Source INSERT/audit/FK fail ⇒ marker update rollback. Cancel/delete nguồn cuối không reset marker. Tenant UPDATE timezone chỉ được trước marker, có authorized Ops intent/reason/audit và expected old zone; sau freeze thay zone hoặc sửa/clear marker reject. Validate named timezone bằng `pg_catalog.pg_timezone_names`, không client UTC offset/SQL session timezone.

Tenant guard SECURITY INVOKER chỉ cho private freeze-helper owner initialize marker NULL→nonnull; helper SECURITY DEFINER cập nhật marker với privilege tối thiểu. Runtime không có column UPDATE marker/EXECUTE helper, không GUC “đã được phép”. Backfill có chứng cứ làm trong reviewed maintenance stage **trước cài guard**, không tạo permanent bypass flag hoặc allow Ops clear marker.

Race: config thắng ⇒ source chờ rồi đọc zone mới/freeze; source thắng ⇒ config chờ rồi thấy marker nonnull/reject. Rollback winner ⇒ waiter thấy committed old state; không compare preview trước lock. Tzdata upgrade phải record/test lại derived dates trước rollout; marker giữ zone string, không tự freeze mọi future tzdata release.

### D.4. H-01 subset và residual findings

R1b chỉ thêm class-consistency join khi enrollmentId có thật, preserve IDs/chain và historical changes khi đã used. Không sửa nullability enrollmentId, không materialize class/course IDs khắp schema hoặc thêm transfer FKs/cycle engine. REGULAR enrollment-required/interval validity/transfer target student/recipient class/cycles/roster completeness vẫn R3. Course subject/level/name semantic history, full tariff/discount/policy provenance thuộc R2/R3; giữ Course ID và source snapshots, không tự tuyên toàn H-01 resolved.

Các history guards là ordinary mutation boundary; authorized after-lock attendance correction/scheduling financial follow-up chưa implement trong R1b. Nhu cầu hợp lệ phải dùng slice R3/R2 được review, không silent update nguồn đã chốt.

## E. O-01 Minimal Concurrency Design

### E.1. Một protocol chung

```text
BEGIN READ COMMITTED using one transaction connection
  1. Resolve verified backend principal + full involved actor/target User IDs (advisory lookup).
     Lock Users sorted: SHARE for executing actors; UPDATE for global disable/revoke targets.
     Select strongest needed mode upfront; no SHARE→UPDATE upgrade.
  2. Lock full Tenant set sorted FOR NO KEY UPDATE, BEFORE descendant DML/source reads.
  3. NEW completed SQL statement: current User/session/member/grants/scope/tenant writable;
     recheck principal mapping and fixed operation/resource intent, not stale JWT grants.
  4. Discover old+new source dependencies under gate. Lock rows actually mutated in order:
     Period/Run → Course/Class/Series → Enrollment/Session → Participant/Finalization/Record
     → Invoice/Line/Claim → existing receipt/result/audit inserts.
     Same type IDs sorted; new rows parent-before-child; no late User/Tenant acquisition.
  5. Validate live joins; mutate; guards/constraints immediate; audit+receipt where operation uses it.
COMMIT; any failure ROLLBACK whole command.
```

Tenant NK là shared **protocol gate**, không phải mode SHARE: cùng tenant NK writers serialize, different tenants độc lập. FK KEY SHARE không bị chặn vô ích như FOR UPDATE tenant key lock. **Không khóa SHARE mọi read-only parent row thêm lần nữa** khi gate đã loại toàn participating tenant writers; join read dưới gate đủ cho predicates. Explicit row locks cần cho rows sắp sửa nhiều bước, fixed order/implicit FK/index waits vẫn test. Không JOIN FOR UPDATE nhiều tables rồi giả planner đã theo order mong muốn.

Gateway/helper SQL đọc mới sau lock phải VOLATILE/new PLpgSQL statements; không lock+validate một CTE hoặc STABLE snapshot cũ, không continue REPEATABLE READ snapshot chưa review. SQL row trigger có thể re-enter same gate trước guarded joins để phòng fixture mistakes; **trigger lock sau target-row lock không thay entry protocol** và có thể deadlock nếu caller bypass order. Ordinary runtime raw DML bị deny, không lấy row-trigger fallback làm proof mọi writer đã đúng order.

### E.2. Writer coverage và global authorization

| Writer / resource | Mandatory synchronization |
|---|---|
| Series/Session/Period/Run create; Tenant config | Same tenant gate, freeze atomic; current actor/operator authority trước effect |
| Line/Invoice/Run/Period/claims edits; session/class/course/enrollment/participant mutation | Gate trước read/existing descendant locks; live source checks, no cross-period reparent; unused source mutation còn R3 validation |
| Attendance/finalization/absence/correction, PriceRule/Policy writers khi có billing consumers | Cùng source gate trước ảnh hưởng nguồn; relevant billed changes reject trong R1b. Full absence/price logic deferred nhưng không cho writer không tham gia protocol chạy live |
| Membership/role/scope/tenant status mutation | Actor User anchor rồi Tenant gate; recheck current state. Membership attach/change thêm target User SHARE **trước Tenant**; user↔membership identity không re-key bằng unrestricted path |
| Global User disable, credential/session revoke | Target User UPDATE trước tenants; affected memberships/tenant set discover khi đang giữ User lock, tenant IDs sorted, fresh last-active-Manager checks trước mutation. Attachment cũng lock same User nên không thêm membership phantom. Không đi Tenant→User |
| Global permission catalog / shared global uniques | P0 seed/controlled maintenance, không live editor. User.email/Tenant.code renaming không nằm trong source command chưa review. Không global advisory namespace/fence infrastructure |
| Future Billing/Wallet/ISSUE/worker effect | Chưa mở ở R1b; phải join protocol trước grant. Wallet-before-Invoice rank chèn trong R2, không Wallet lock/table ở R1b |

User SHARE chặn UPDATE disable/revoke của actor; role/scope revoke chờ Tenant gate. Mutation giữ quyền đã kiểm dưới lock có thể commit trước revoke, commands sau revoke phải bị deny. Last-Manager concurrent disables cần fresh count dưới complete tenant gates, không lock thêm User sau Tenant. Resolve thêm target/tenant muộn ⇒ rollback/restart sorted set, không opportunistic lock upgrade.

**Có thể đơn giản hơn:** scoped reads/preview không lấy gate và không reserve source; unrelated CRUD không ảnh hưởng source/auth/history không nằm R1b gate. No external I/O/long calculation dưới gate. Không serialize mọi HTTP request, không batch all tenants trong monthly job. Existing resource booking/price exclusions thuộc R3/R2 không bị bỏ bởi tenant gate.

### E.3. Retry, failure và limits

Starting config đề xuất: lock wait2s, statement5s, interactive transaction10s; tối đa2 transient command retries với jitter50–200ms/remaining wall budget15s. Chưa benchmark/SLO, không config đã có. 40P01/40001/lock timeout: rollback trước retry, cùng accepted intent/key/hash; worker budget không nhân thêm inner command retries. 23503/23514/source-history/ownership conflict: reject, không blind retry. UQ duplicate phân biệt replay vs body conflict.

Unknown commit ⇒ reconnect/current-authorize/lookup durable operation receipt hoặc stable target+expected intent sau khi original transaction resolved; absent chắc chắn mới retry. Không key mới, không tạo G2/clock/policy mới để đoán kết quả. R1b không xây idempotency framework: reuse existing IdempotencyRecord cho operation có admission, no production create/execute command exposed ⇒ không claim runtime replay đã triển khai.

Độ an toàn có điều kiện: all writers/roles thật sự theo contract, no owner/maintenance bypass concurrent. PostgreSQL implicit FK/unique/cascade/DDL waits vẫn có thể deadlock; abort/retry đúng không đồng nghĩa sai data. Tenant contention đo ở future PG tests; chưa có throughput claims. Một User nhiều tenants có thể làm related revocation đợi nhiều source commands, chấp nhận P0 critical sections ngắn.

## F. O-04 Minimum Source/Snapshot Interface

**Không new table/column cho interface.** Dùng existing scalar FKs/source columns và `InvoiceLine.sourceSnapshotJson`, chỉ thêm protected JSON namespace `r1bAttribution` cho **new inserts** trong line guard. Nó là source evidence, **không phải generation**. Client DTO không nhận arbitrary sourceSnapshot làm authority.

| Data | Authority / capture / use |
|---|---|
| tenant/student/invoice/period/participant/session | Live FK joins; owner equality do existing R1a FKs; không lấy ID từ current enrollment hoặc JSON |
| Original class/course/enrollment | SP→actual Session.classId→Class.courseId, SP.enrollmentId nếu có; H-01 class join + parent guards. Snapshot IDs đúng lúc ghi; không current transfer target thay nguồn |
| startsAt/endsAt/z/date | Actual Session TSTZ và frozen Tenant.timezone; SQL-derived local DATE/month. JSON giữ UTC text chính xác6fraction digits, z và date, không mất microseconds qua JS Date3digits |
| Source evidence | Snapshot schemaVersion1, attributionRuleVersion `O12_LOCAL_SESSION_START_V1`, source IDs/timestamps/isCancelled; optional attendance/finalization IDs/status/confirmed facts, capture time DB. Existing revisions là evidence, không tự định nghĩa mọi metadata revision bump là changed billing fact |
| Mutable metadata | updatedAt/names/CONFIRMED→COMPLETED hoặc one-time lockedAt không tự đổi local date/owner. Staleness dựa protected semantic facts, không updatedAt-only hoặc revision-only |
| Không cần R1b | G IDs/base/current pointers/sourceEpoch, input/result sealing history toàn run, price candidates/discount engine/result hash/diff orchestration; R2-A bổ sung theo O12-D |

Guard tự dựng namespace từ DB dưới gate, không tự sửa bad scalar IDs để làm FK pass; reject new root JSON non-object. Namespace/source financial fields không UPDATE sau insert, parent changes liên quan reject; không adapter STALE mới. Không hash/canonical JSON framework mới. Existing Run.policyVersionId/inputSnapshotHash required giữ, không ghi dummy policy/hash chỉ để tạo Run; production capture/admission thuộc R2, fixtures dùng synthetic known valid inputs có provenance test rõ.

**Legacy:** không yêu cầu global JSON CHECK namespace cho mọi row, không backfill/merge JSON vào ISSUED snapshot chỉ để hợp format mới. Existing issued JSON byte-preserved; mapping chứng cứ/zone/classification nằm migration manifest/audit. Validated live source/month vẫn bắt buộc khi rollout; unknown historical source không fabricated namespace. Provable DRAFT metadata backfill chỉ trong approved migration stage, không gọi đó là original G1.

R2 có thể đọc evidence schemaVersion này khi thêm G history; không suy từ một Line JSON thành toàn G1/G2 admission/result. R1b runtime write closure/reject-only không hứa full O12-D engine; R2 phải implement sealed history/CAS trước enable recompute/ISSUE. No implicit repricing/G2 từ marker hoặc wallet.

## G. O-13 Minimal Security & State Guards

### G.1. Minimal interfaces, không full R4

`CurrentActorPort.assertAuthorized(tx,verifiedPrincipal,tenant,operation,target)` bắt buộc **sau User/Tenant locks**, fresh query current User ACTIVE, session còn hạn/chưa revoked và đúng User, tenant writable/membership current, active MembershipRole (`revokedAt=NULL`), RolePermission/Permission code và AccessScope actual resource. `RolePermission` hiện không có revokedAt; đừng query field tự tưởng tượng, revoke row/grant mutation tuân Tenant gate. Parent/student/teacher relation cần current scope theo operation. Permission code/target đến fixed reviewed command, không client chọn arbitrary permission để tự chứng minh.

`AuditPort.append(tx,actor,operation,target,sourceBeforeAfter,policy?,correlation,reason?)` dùng existing AuditLog. USER membership phải cùng actor User và tenant; WORKER/OPERATOR không fake Manager. No automatic worker financial rights. Success audit/needed receipt cùng TX; failure logs riêng sau rollback, no secrets, audit24mo giữ. Không audit schema extension/retention engine trong R1b.

R1b future test fixtures implement **test-only adapter** đọc actual seeded User/session/member/grants/scopes, để kiểm fresh-query/revocation ordering; không mock quyền boolean rồi gọi là authorization verified. Test wrapper không deploy/grant API. End-user authentication/token binding, real permission catalog/parent scope/session behavior, NestJS bypass/connection pooling phải **RUNTIME VERIFICATION** ở slice sau.

### G.2. Privilege profile được chọn

| Role/capability proposal | Allowed / denied |
|---|---|
| API/worker ordinary login | No direct protected source/history/Tenant-marker/IAM/Audit DML; no DDL/TRUNCATE/disable triggers/owner SET ROLE/BYPASSRLS/replication. No execute freeze/gate helpers or fixture wrappers, no broad finance/PII SELECT grant tạm thời |
| `educore_r1b_guard_owner` NOLOGIN | SELECT parents phục vụ checks, UPDATE chỉ Tenant marker/updatedAt để freeze, execute own private helpers; không table owner/superuser/source-history arbitrary DML. Function owner không tự cấp business rights |
| Migration/table owner | Controlled deployment riêng, có thể vượt protection theo quyền owner; không runtime, không maintenance bypass live. Existing grants/role memberships phải inventory, không assume deny đã có |
| Fixture role/schema disposable DB | Seed known test data và call test-only fixed commands/coordinator query; không tắt integrity triggers. Privileged fixture setup có thể seed future DRAFT để test guard, không business admission proof |
| Future domain command owner | Chỉ thêm ở slice được authorize; fixed signatures + current actor checks + E order + audit/receipt; runtime EXECUTE cụ thể. Chưa tạo generic registry/mutation dispatcher trong R1b |

**Closed-write profile không phải complete authorization implementation.** DB R1b test phải chứng minh API/worker raw SQL không write/bypass guards; authorized fixture mutation chứng minh SQL/protocol, không claim API đã gọi đúng. Khi mở production command, nó phải tự enter/recheck; chỉ public helper `enter()` rồi cho raw DML không được chọn vì client có thể bỏ helper/GUC giả. Shared DB login không cryptographically xác minh HTTP user; compromised trusted backend/DB owner ngoài threat boundary được nêu rõ, không giả đã giải quyết bằng actorId.

Protected grant inventory cụ thể: 13 guarded tables ở I, bao gồm Tenant zone/marker; đồng thời đóng unreviewed DML cho Course/PriceRule/PolicyVersion/InvoiceDiscount, source-affecting Absence/Correction/Transfer và User/Credential/AuthSession/Membership/Role/RolePermission/AccessScope/Audit. Đây là **privilege closure**, không tuyên bố R1b thêm triggers bảo vệ mọi financial/PII table. Full issued discount/pricing/absence/policy history enforcement và public writes là R2/R3/R4 dependencies. Guard owner không cần User row-lock privileges; future narrow command/test-wrapper owner mới cần quyền thực hiện actor anchors, ordinary runtime không được cấp UPDATE User chỉ để tự SELECT FOR SHARE.

Các states chỉ dùng để nhận diện/freeze: current Invoice enum DRAFT/ISSUED/CANCELLED, Session cancelled fact, finalization/source use. Không thêm Run.STALE enum, job cycles hoặc lifecycle mới. New ISSUE/financial executors không được enable chỉ vì trigger cho phép fixture transition dùng để seed frozen history.

## H. Exact Schema/Prisma Delta

### H.1. Required / keep inventory

| Item | Existing state | Proposed delta | Prisma / SQL | Invariant | R1b necessary? |
|---|---|---|---|---|---|
| H-R01 Tenant marker | Tenant:180–188 có timezone, chưa freeze field | **Add** `timezoneFrozenAt DateTime? @map("timezone_frozen_at") @db.Timestamptz(6)`; no default/no index | PSL column + SQL behavior | Sticky C1, empty tenant chưa source vẫn configurable | Required, **duy nhất PSL delta** |
| H-R02 Line→Invoice | `il_invoice_student_fk` `(tenant,invoice,student)`→`Invoice(tenant,id,student)`, both Restrict | **Keep unchanged**; no new period/student columns | Existing PSL; verify actual FK in catalog | Correct invoice student | Required preserve, không tạo lại |
| H-R03 Line→Participant | `il_participant_student_fk` `(tenant,session,student,participant)`→SP candidate, both Restrict | Keep | Existing PSL/catalog | Same session/student source | Required preserve |
| H-R04 R1a candidates | `inv_tenant_id_student_uq`, `sp_tenant_session_student_id_uq` | Keep exact keys/maps/back-relations | Existing PSL/catalog | Composite FK targets | Required preserve |
| H-R05 Attendance relations | `ar_participant_session_fk`, `ar_finalization_session_fk`, Restrict; `finalizationId?` | Keep NULL/omission + required session; no MATCH FULL | Existing PSL/catalog | Same-session optional finalization | Required preserve |
| H-R06 Attendance candidates/index | `af_tenant_session_id_uq`, `ar_tenant_session_participant_uq`, `ar_tenant_session_finalization_idx` | Keep cardinality/candidate/index and back-relations | Existing PSL/catalog | One-to-one/type/null compatibility R1a | Required preserve |
| H-R07 Invoice→Run | `(tenant,run,student,period)` composite relation and candidate, logical monthly UQs | Keep; no generation pointer | Existing PSL/catalog + identity guard | One logical invoice/run/student/month | Required preserve |
| H-R08 BillingPeriod | DATE start/end, UQ tenant/monthStart, no PSL CHECK | Monthly-shape CHECK + immediate immutable identity/bounds guard | SQL only | Standard `[monthStart,nextMonthStart)` | Required |
| H-R09 Line containment | Source FKs + `sourceSnapshotJson` required, no local-month SQL | Child guard derive source local date + protected JSON namespace/new rows | SQL only, no columns | Same frozen local month; no client authority | Required |
| H-R10 Parent/history/C1 guards | PSL FK Restrict không freeze mọi coherent reparent/history field | Specific attachments I; no blanket FK action rewrite | SQL only | Inverse coverage/no source drift/rekey | Required |
| H-R11 H-01 minimum | Participant.enrollment FK binds tenant/student, **không class** | SQL join enrollment.class=sourceSession.class; inverse Enrollment/Class guards | SQL only, no classId duplication | Original source chain | Required subset; full H-01 deferred |
| H-R12 Source snapshots | Existing Line JSON + scalar facts/revisions | F namespace/immutability for new lines; legacy classification not issued rewrite | SQL + contract, no new model | Minimum attributable evidence | Required interface |
| H-R13 Gate/auth/privilege boundary | No callable DB/gateway/role evidence in checkout | E/G/I contract, private helpers/roles, closed runtime writes | SQL/grants/tests; no API implementation | Serialization/current-auth boundary testable | Required |
| H-R14 Existing indexes | Listed below cover lookups | **No new index by default** | Keep PSL indexes | Bound inverse-query cost without duplication | Required audit, not extra DDL |

Illustrative PSL diff **proposal only**:

```prisma
model Tenant {
  // existing fields/relations unchanged
  timezoneFrozenAt DateTime? @map("timezone_frozen_at") @db.Timestamptz(6)
}
```

Không thêm `@@unique`, relation/back-relation hoặc enum vì marker là scalar nullable. Model count62/enums28 giữ. Line không cần `periodId`, `sourceBusinessDate`, `classId` scalar mới. Source role/grant CHECK không biểu đạt bằng Prisma validate.

**Existing index use:** Tenant PK→gate; Line `(tenant,session)`→session inverse, `(tenant,participant,id)`→participant/attendance inverse, `(tenant,invoice,participant)`→header/claim lookup, `(tenant,attendance)`→record lookup; Participant `(tenant,enrollment)`→Enrollment inverse; Session `(tenant,class,startsAt)`/`(tenant,series,startsAt)` và Series `(tenant,class,validFrom)`→Class/Series guards; Class `(tenant,course)`→Course cascade inventory. Membership(userId), UQ(tenant,user), MembershipRole(tenant,membership,revokedAt), AccessScope indexes→auth queries. No GIN JSON/freeze-marker index needed.

### H.2. Conditional và deferred

| Item | Điều kiện / disposition | Prisma / SQL | Scope |
|---|---|---|---|
| H-C01 Actual DB thiếu R1a columns/FKs | Catalog khác PSL; staged nullable/backfill/prove/equality/validate prerequisite, không blindly create duplicate | Reviewed baseline/R1a upgrade SQL riêng; final PSL đã đúng | Conditional prerequisite trước R1b data gate |
| H-C02 Legacy source JSON thiếu namespace | Không sửa issued JSON; proven DRAFT có thể metadata backfill được duyệt, unknown quarantine | Existing JSON only, migration/audit manifest | Conditional data task |
| H-C03 Populated Tenant marker NULL | Evidence z/source/period consistent trước adopt marker; missing evidence block target, no inferred z | Column nullable + audited legacy adoption J | Conditional, không pretend empty DB |
| H-C04 Extra index | Chỉ nếu actual EXPLAIN/query guard cho thấy existing key không dùng được sau catalog audit | Reviewed narrow index on exact lookup, no blanket add | Conditional technical diff review |
| H-C05 Existing runtime write paths/grants | Nếu kiểm kê phát hiện application writers thật, phải close/migrate tới reviewed commands trước enable guards; không break live silently | Compatibility/privilege rollout review | Conditional scope/cost approval, no assumption deployed scaffold |
| H-D01 Full G1/G2/SourceEpoch/pointers | R1b evidence không thay G history; R2-A schema/service | Deferred | R2-A |
| H-D02 Wallet/Payment.WALLET/signed allocations | Business approved không là R1b schema authorization | Deferred | R2-C |
| H-D03 ISSUE/counter/due/claims creation/effect receipts | R1b freeze existing history, không new financial lifecycle | Deferred | R2-B/D |
| H-D04 Price selection/EXCLUDE/policy/sibling/money checks | Same-month proof không prove correct tariff/units; full H-04 residual | Deferred | R2/R3 |
| H-D05 Transfer/roster/cycles/temporal enrollment/correction | Only H-01 join/inverse subset now | Deferred | R3 |
| H-D06 Full IAM/Jobs/Audit/Workflow/RLS engine | Minimal ports/roles/protocol tests now, no production routes or global framework | Deferred | R4/runtime slices |

## I. Exact Custom SQL Inventory

**PROPOSAL ONLY, không migration file.** Qualified source tables ở `public` là default target được khuyến nghị; actual DB schema/roles/version phải inventory trước DDL, không suy từ DATABASE_URL chưa đọc. Helpers trong locked `educore_private`, no user-writable schema, fixed `search_path=pg_catalog,educore_private,pg_temp`, fully qualified references, no dynamic SQL/table-name/body từ client.

### I.1. Checks và helpers

| ID / object | Source/target / events | Exact purpose/failure semantics |
|---|---|---|
| SQL-C01 `bp_month_shape_ck` | `billing_periods` row CHECK | `isfinite(month_start) AND isfinite(month_end) AND EXTRACT(DAY FROM month_start)=1 AND month_end=(month_start+INTERVAL '1 month')::date`; timestamp-without-zone/date operations, không session TimeZone. Invalid shape23514; extreme date arithmetic error cũng reject, không arbitrary business year cap |
| SQL-F01 `r1b_lock_tenant(uuid)` | private VOLATILE helper; Tenant PK | Assert actual isolation READ COMMITTED, unsupported isolation fail closed25000; acquire Tenant NK bằng completed statement, missing tenant23503; return current z/marker sau lock. No PUBLIC/runtime EXECUTE, no nested transaction/COMMIT |
| SQL-F02 `r1b_freeze_tenant(uuid)` | private SECURITY DEFINER helper; calls F01, UPDATE Tenant nullable marker | Set once DB clock after lock, keep existing value; source failure rollback marker. Owner chỉ cần SELECT và marker/updatedAt UPDATE. No actor/GUC-based bypass; not callable ordinary runtime |

No CHECK chứa subquery, no CHECK now(), no new FK constraint trùng R1a. Check NEW source JSON object nằm trigger new-insert branch, không global namespace CHECK ép legacy issued snapshots phải rewrite.

### I.2. Six trigger functions / thirteen attachments

Tất cả là row BEFORE INSERT/UPDATE/DELETE khi event cần thiết như bảng; identity comparison dùng `IS DISTINCT FROM`, không `<>` bỏ sót NULL. Helpers/guards đọc live facts bằng SQL mới sau gate. Trigger functions chỉ đọc/validate/derive NEW, trừ C1 helper update Tenant marker; không billing arithmetic/history repair/auto-G2.

F01/F02 và calendar/billing/line/lineage/attendance guards: VOLATILE **SECURITY DEFINER**, owner `educore_r1b_guard_owner`, safe fixed search_path, fully qualified reads, revoke PUBLIC EXECUTE. **Tenant guard giữ SECURITY INVOKER** để kiểm caller DB role cho marker initialization; nếu cũng DEFINER thì mọi caller nhìn như helper-owner và role check vô nghĩa. Tenant guard dùng catalog zone read/OLD-NEW checks, không cần sensitive source SELECT grants. Không quyền owner source tables/DDL, không runtime SET ROLE guard-owner. New source helpers lồng nhau vẫn trong same transaction, no COMMIT.

| Function / attachment ID | Table / events | Required checks / actions / failure |
|---|---|---|
| SQL-T01 `r1b_tenant_guard` / `r1b_tenant_guard_trg` | Tenant BIUD, **SECURITY INVOKER** | Validate named z; NEW tenant starts markerNULL; id immutable; initialized marker immutable/nonclearable; frozen zone cannot change/delete Tenant. NULL→timestamp only private freeze-helper owner after controlled pre-guard legacy backfill; runtime no marker grant. Violation named23514/42501 |
| SQL-T02 `r1b_calendar_guard` / `r1b_series_guard_trg` | ScheduleSeries BIUD | INSERT calls F02, series.timezone=frozen z; id/tenant immutable, zone cannot drift, class reparent/delete when Session exists reject; existing FK Restrict still active |
| SQL-T03 same function / `r1b_session_guard_trg` | ClassSession BIUD | INSERT calls F02; update/delete rules D.2 for started/billed/used source; allow harmless metadata/completion, no class/series/time/cancelled fact rewrite of captured history |
| SQL-T04 `r1b_billing_guard` / `r1b_period_guard_trg` | BillingPeriod BIUD | INSERT calls F02, C01 checks shape; identity/bounds immutable, referenced delete existing FKs; deleting unused period does not clear Tenant marker |
| SQL-T05 same function / `r1b_run_guard_trg` | BillingRun BIUD | INSERT calls F02; tenant/id/student/period/operation identity immutable; source-related used delete blocked by FK/history. No G state machine or placeholder snapshots |
| SQL-T06 same function / `r1b_invoice_guard_trg` | Invoice BUD (INSERT identities via existing FKs) | Immutable id/tenant/run/student/period; was-issued header update/delete reject in R1b, including reset-to-DRAFT attempt. Fixture can establish issued setup from DRAFT; does not implement/authorize real ISSUE lifecycle |
| SQL-T07 same function / `r1b_claim_guard_trg` | InvoicedParticipationClaim BUD | Reject any UPDATE/DELETE; existing claim FK/UQ unchanged. Claim creation completeness/authority belongs ISSUE R2; no new claim command grant |
| SQL-T08 `r1b_line_guard` / `r1b_line_guard_trg` | InvoiceLine BIUD | Parent was-issued/claim→deny insert/update/delete. New DRAFT line source live date∈period, marker nonnull; equality left to current FKs, no scalar auto-fix. Fill F namespace, source-field rewrite reject; allowed draft delete/nonfinancial metadata checks. Wrong period named23514, missing parent23503, no deferred repair |
| SQL-T09 `r1b_lineage_guard` / `r1b_class_guard_trg` | Class BUD | id/tenant immutable; course change when Session/Series exists reject, preserving original course. Course parent cascade must hit this guard or actual FK Restrict; catalog/test required |
| SQL-T10 same function / `r1b_enrollment_guard_trg` | Enrollment BUD | If referenced by Participant, reject identity/student/class re-key/delete; no blanket block closing end-date/status for valid transfer. Full temporal/lineage cycles not claimed |
| SQL-T11 same function / `r1b_participant_guard_trg` | SessionParticipant BIUD | On insert/allowed update, nonnull enrollment must match source Session class (student/tenant already FK). Started/attendance/line/claim source identity/enrollment/kind/removal mutation reject, no fake current-enrollment fallback |
| SQL-T12 `r1b_attendance_guard` / `r1b_record_guard_trg` | AttendanceRecord BIUD | Keep optional finalization and R1a source FKs; if billing Line already uses participant, relevant added/changed/deleted source record reject; no ordinary detach-finalization on billed history. Full confirm/EXCUSED/48h service R3 deferred |
| SQL-T13 same function / `r1b_finalization_guard_trg` | AttendanceFinalization BIUD | Changes affecting captured confirmation when any Line uses session reject; IDs/session/confirmation facts immutable when used. One-time lockedAt metadata allowed, not clear/rewrite; no fake finalization for cancelled source |

**Count:** F01/F02 + tenant/calendar/billing/line/lineage/attendance functions =8. T01–T13 =13 attachments. Four first-source tables use existing BI branch to call freeze, no extra4triggers. Reusing a small fixed function across related tables is not configurable state/policy DSL: finite table branches, fixed SQL, no dynamic target dispatch from caller.

**Omitted intentionally:** Course/StudentProfile-specific trigger where protected reference cascade/Restrict already prevents historical re-key; prove paths K before accepting omission. Course subject/level semantic changes are residual R3/catalog module contract, not R1b historic-ID proof. Price/Policy source-history logic outside minimal attribution stays R2/R3; runtime cannot bypass via unreviewed source writes. No financial/generation/absence/job tables/triggers added.

### I.3. Grant/ownership inventory

SQL-G01: inventory actual runtime/migrator/table-owner roles, inherited memberships/default grants and schema CREATE; owner-like runtime fails acceptance. SQL-G02: private schema/function ownership/EXECUTE defaults same reviewed transaction; revoke PUBLIC/runtime helper access, grant guard-owner minimal Tenant column UPDATE/source SELECT. SQL-G03: deny runtime protected DML/DDL/TRUNCATE/trigger disabling/owner SET ROLE; include User/Credential/AuthSession/membership/role/scope mutation paths until reviewed IAM commands exist. No broad PII SELECT shortcut. SQL-G04: disposable fixture schema/roles/explicit EXECUTE only test harness, **not runtime**; no fixture code shipped/granted to production. Catalog assertions verify actual effective privileges, not just REVOKE text.

No public `r1b_write_anything(json)` or client-supplied actor/permission/SQL registry. Production wrapper implementation/grants require operation-specific slice review; closed-write DB package can be tested independently. If existing live commands actually need migration to this profile, H-C05 blocks rollout until compatibility plan, không drop/revoke live capability silently.

### I.4. Pseudo-SQL, chỉ minh họa

```sql
-- Source INSERT branch, inside the caller's transaction:
PERFORM educore_private.r1b_freeze_tenant(NEW.tenant_id);
-- First helper statement completed BEFORE subsequent source/evidence reads.

-- Line INSERT branch concept; joins tenant-scoped, using actual participant session:
SELECT (s.starts_at AT TIME ZONE t.timezone)::date, bp.month_start, bp.month_end
FROM public.session_participants sp
JOIN public.class_sessions s ON s.tenant_id=sp.tenant_id AND s.id=sp.session_id
JOIN public.tenants t ON t.id=sp.tenant_id
JOIN public.invoices i ON i.tenant_id=sp.tenant_id AND i.id=NEW.invoice_id
JOIN public.billing_periods bp ON bp.tenant_id=i.tenant_id AND bp.id=i.period_id
WHERE sp.tenant_id=NEW.tenant_id AND sp.id=NEW.participant_id;
-- Assert nonnull freeze + first-day/next-month bounds and start <= d < end.
-- Derive r1bAttribution JSON from DB; NEVER rewrite NEW.student_id/session_id to hide mismatch.
-- Existing il_invoice_student_fk / il_participant_student_fk still reject wrong scalar identity.
```

Pseudo-SQL thiếu actual exception/return clauses theo chủ ý minh họa, không migration artifact/executable test hay PostgreSQL evidence.

## J. Migration & Backfill Strategy

1. **Authorized inventory trước:** target/namespace/PG version/roles/extensions/tzdata, tables/data/constraints and `_prisma_migrations` nếu có, writes/routes thực tế, backup/restore procedure. Không đọc DATABASE_URL hoặc run DB trong task này. Pin một PostgreSQL target cho disposable tests (đề xuất16.x nếu chưa có target, không claim latest); R1b không cần GiST extension mới.
2. **Classify:** empty physical DB; valid populated; missing R1a fields/keys; wrong student/session/month; unknown/inconsistent historical zone/series/lineage; issued snapshots lacking evidence; active runtime grants. Lưu counts/IDs/reason vào audit/manifest có scope, không sửa để che lỗi.
3. **No migration directory:** future initial baseline migration từ **exact HEAD schema62models/28enums chưa R1b marker**, review generated SQL riêng. Empty disposable DB apply baseline rồi R1b delta. Baseline DDL có existing P0 tables không đồng nghĩa implement/verify mọi P0 feature hoặc Wallet. Populated DB phải so catalog với baseline; chỉ mark baseline applied sau equivalence/provenance approval. Nếu DB có migration history chưa có trong repo thì reconcile history trước, không assume baseline mới hợp lệ.
4. **R1a gaps conditional:** actual columns missing thì compatible nullable add/backfill lấy session từ Participant và student chỉ khi Invoice=Participant, mismatch quarantine; validate candidate/FK/NOT NULL theo approved R1a upgrade. Nếu already present thì preserve, không duplicate constraint/index. Không tự NULL hóa wrong finalization hoặc đổi student/invoice/month đã issued.
5. **Add Tenant marker nullable**, không default now() hoặc pretend tất cả tenants frozen. Empty/no-source tenant markerNULL. Existing-source tenant phải chứng minh original zone từ trusted snapshots/audit/backups/series evidence có provenance; **current Tenant.timezone một mình không là bằng chứng**.
6. **Legacy adoption:** khi z/source/month proven consistent, ghi marker bằng **actual cutover/adoption DB instant**, audit event `TENANT_TIMEZONE_FREEZE_ADOPTED_LEGACY` có evidence refs/earliest known source time nếu có. Không gán MIN(createdAt) như một freeze event quá khứ chưa từng được ghi. Field semantics: new tenant=first-source freeze instant; legacy=thời điểm DB bắt đầu enforce sticky freeze, không fabricated historical date. Không thêm origin column, reuse audit/migration manifest. Unknown/mismatch ⇒ block affected target rollout cho tới data disposition, no inferred z hoặc historical rewrite.
7. Precheck all old Line month/source/parent facts, optional attendance, Enrollment class/series zone, issued/claims identities. **Không rewrite issued JSON/price/period để áp O-12 mới.** Existing valid legacy JSON không bắt thêm namespace; namespace cho new inserts. Historical billing khác basis cần owner-approved data task, giữ before evidence.
8. Add monthly CHECK `NOT VALID` nếu populated, kiểm/validate sau clean precheck. Existing FK candidates được baseline/catalog match; triggers không có `NOT VALID`: cài khi existing-data queries đã sạch và writers trong maintenance boundary. New row guards/history source rules/owner functions/grants một reviewed deployment transaction; backfill marker trước guard, không permanent bypass GUC.
9. Verify actual effective role grants/function search_path/triggers enabled/FK actions/index predicates; run fresh/upgrade/negative/two-client/fault tests K. Capture schema/client validation và catalog drift riêng; custom SQL không xuất hiện trong PSL không phải lý do xóa chúng ở migration tiếp.
10. **Rollback:** disposable failure rollback whole DDL transaction khi commands transactional; failed deployment dùng reviewed migration recovery, không assume history table tự sạch. Tách nontransactional DDL nếu phát sinh conditional index build, không trộn vào atomic guarantee. Before first accepted source có thể reviewed rollback marker/guards; sau sticky freeze/issued data không drop marker/history hoặc reset DB. Forward-fix/restore backup + receipt/source reconciliation, no reset/drop un-inventoried database.

Maintenance window ngắn được ưu tiên hơn online dual-write/backfill framework cho đồ án. Duration/backup size/locks chưa đo, không hứa zero downtime. Read-only inventory/backup/test DB authorization phải có trước future execution; plan review hôm nay không cho access DB.

## K. PostgreSQL Test Matrix

**Toàn bộ R1B-T01–T42: DESIGNED / NOT RUN.** Environment: **P1**=authorized disposable PostgreSQL, actual baseline+R1b SQL, migrated schema/roles, fixture data; **P2**=P1+ít nhất2independent connections và barrier controller; **R**=future NestJS/API slice (không suy từ P1/P2). Không test production/shared DB, không sleep-only races.

Evidence mỗi case: fixture/SQL/migration hashes, server/schema/role/version, transaction result+SQLSTATE/named constraint, before/after scoped queries, audit/marker/source/claim values; P2 thêm backend PIDs, barrier trace và waits/blocker evidence. Không ghi PASS từ narrative này.

| ID | Invariant / setup | Action | Expected result | Env | Evidence đặc thù |
|---|---|---|---|---|---|
| R1B-T01 | Same tenant/student/session, frozen z, Sep period, actual Sep source | INSERT valid draft Line | Commit, correct date/namespace; FK values không bị sửa | P1 | Joined source/period+new JSON |
| R1B-T02 | Valid same-month parents nhưng invoice studentX/participantY | INSERT Line với mỗi student choice | FK/guard rejection, no line; catalog confirms both R1a FKs | P1 |23503/23514 + exact FK definitions/actions |
| R1B-T03 | Same student/session Oct, invoiceSep | INSERT Line with forged Sep JSON | Wrong period reject, no scalar/snapshot “fix” | P1 | Named containment23514, no inserted row |
| R1B-T04 | Sep30 23:59:59.999999 vs Oct1 00:00 local | Correct/wrong-period inserts | `[start,nextStart)` only; end exclusive | P1 | Exact6digits/date queries |
| R1B-T05 | Sep30 23:30→Oct1 00:30 local | Insert Sep/Oct line variants | Sep accepted/Oct rejected, no split | P1 | Local start not end |
| R1B-T06 | UTC Sep30 18:00 = Oct1 01:00 Asia/Ho_Chi_Minh; different SQL session TimeZone | Insert variants | Oct only, independent session TimeZone | P1 | SET TimeZone fixtures + same result |
| R1B-T07 | CANCELLED source, zero line, attendance NULL | Insert valid monthly line | Commit period proof, no fake attendance/finalization | P1 | NULL refs remain; not ISSUE completeness claim |
| R1B-T08 | Same/wrong session finalization, optional NULL | Attendance create/nested disconnect fixture | NULL valid; wrong-session rejected; query engine behavior tested, history detach billed rejected | P1 | R1a mapped FKs/MATCH SIMPLE + Prisma nested results |
| R1B-T09 | Existing draft Line source identity | UPDATE/reconnect same-month/different-month parents | Source rewrite reject even coherent new FK tuple, old row unchanged | P1 | Named history guard + old namespace |
| R1B-T10 | Future session with persisted test-only draft Line | Change starts/ends within same month and across month | Both source-evidence mutations reject, not just cross-month | P1 | Guard/source rows unchanged |
| R1B-T11 | Empty future unbilled session; past session | Future reschedule vs ordinary past reschedule | Future source-integrity change allowed if fixture policy valid; past reject | P1 | Time boundary; R3 conflict logic not claimed |
| R1B-T12 | Invoice/Run monthly tuple | UPDATE student/period/run/id/op identity | Reject; no cascade month/owner drift | P1 | FK/guard rows + unique monthly identities |
| R1B-T13 | BillingPeriod Jan31 or end wrong; valid period | Insert invalid then UPDATE bounds/id/tenant | Invalid CHECK rejects; valid bounds immutable after insert | P1 |23514/checkdef + before/after |
| R1B-T14 | Participant referenced by Line/attendance/claim | Re-key owner/session/enrollment/kind/removal/delete | Reject, existing source/claim identity preserved | P1 | R1a Restrict + participant guard |
| R1B-T15 | SP student correct nhưng enrollment class khác Session | Insert/update SP; mutate parent Enrollment.class later | Both directions reject | P1 | H-01 class join + inverse index paths |
| R1B-T16 | Class has Series/Session source | Reassign Class.course, Course.id/tenant cascade, delete ancestors | Used chain cannot change; unreferenced edits not silently called historical | P1 | Actual FK actions/cascade hits Class guard |
| R1B-T17 | Issued/cancelled-after-issued invoice with claims, metadata reset attempts | Insert/update/delete Line, reset header toDRAFT, delete/update claim | Reject all history bypass, claims permanent | P1 | Original amounts/IDs/counts/claim unchanged |
| R1B-T18 | First source each type: Series/SessionDRAFT/Period/Run | Insert each in distinct empty Tenant fixture | Marker set once, z stable; source failure rolls marker back | P1 |4boundary fixtures + DB timestamps |
| R1B-T19 | Invalid zone/series zone mismatch, client-supplied freeze marker | Tenant/source inserts/updates | Named zone/mismatch/manual marker rejected | P1 | Role/trigger route, no partial marker |
| R1B-T20 | Frozen tenant, all sources cancelled/deleted where allowed | Change zone/clear marker/change timestamp/deleteTenant; Ops attempt | Reject, marker survives, Ops no bypass | P1 | Same stored marker/z; guarded deletes |
| R1B-T21 | Guarded participant/session used by Line | Update/create/delete relevant Attendance/Finalization; one-time lockedAt | Relevant source rewrite reject; permitted lock metadata không clear, optional finalization policy giữ | P1 | Source facts unchanged, no fake correction |
| R1B-T22 | A insert Line vs B reschedule same future fixture source | Run protocol C1 below, both winners/commit+rollback | Line-first source reject; source-first line re-read/new period or reject; no wrong state | P2 |2PIDs/explicit barriers/waits/final join |
| R1B-T23 | Child insert vs parent participant/invoice/period/class mutation | Both orderings | Re-key/immutable changes reject; otherwise only valid final references | P2 | Parent guard cannot be skipped by child untouched |
| R1B-T24 | First-source create vs pre-source timezone config | Both winners and rollback variants | Config-first captures newz; source-first config rejects; rollback no fake freeze | P2 | C1 trace+marker/date after wait |
| R1B-T25 | Executing actor grant/session vs tenant permission/scope revoke | Protocol C2/current-auth fixture | Action-first commits then revoke; revoke-first fresh-denied | P2 | Stored auth query + audit/current grant state |
| R1B-T26 | Global User disable/revoke vs tenant command/membership attachment | User locks sorted before Tenant, both directions; last Manager variant | No stale actor execution/membership phantom, no last-Manager breach | P2 | User/Tenant wait graph, fresh lookup after locks |
| R1B-T27 | Different tenants/actors, one slow critical section | Concurrent valid source inserts | Independent tenants proceed unless shared User/global unique really conflicts; no global fence | P2 | Actual blockers/latency, not claimed NFR PASS |
| R1B-T28 | Same tenant commands / forced reversed lock order / unsupported isolation | Contention/40P01/timeout retry; try REPEATABLE READ/SERIALIZABLE entry | Full rollback/finite retries; unsupported isolation25000, không dùng stale snapshot như RC | P2 | SQLSTATE/retry counts/source/audit totals |
| R1B-T29 | Correct seeded actor vs no permission/wrong scope/revoked session | Test-only command adapter using actual DB auth rows | Authorized valid mutation works; unauthorized no effect | P1 |42501/denial + query/audit; fixture protocol only |
| R1B-T30 | T1 actor+T2 target or spoofed owner JSON | Fixture command and FK-invalid source calls | Cross-tenant command denied; mixed-tenant refs reject; no target changes | P1 | Current target lookup+FK evidence; runtime test still R |
| R1B-T31 | Actual ordinary API/worker roles | Raw protected DML/marker write/TRUNCATE/ALTER/DISABLE TRIGGER/helper call/SET ROLE | Permission denied, no bypass; scoped read grants no broad PII leak | P1 | Effective privileges/inherited roles/SQLSTATE |
| R1B-T32 | Definer ownership/search_path/temp-object shadowing/PUBLIC execute | Adversarial calls/pg_temp objects | No name hijack/helper access, only qualified protected objects | P1 | pg_proc/config/grants/schema CREATE privileges |
| R1B-T33 | New Line evidence; existing issued legacy JSON | Forge JSON/UPDATE namespace; legacy rollout | New DB-derived evidence, mutation reject; existing issued JSON byte-preserved | P1 | Exact DB UTC6digits/live source vs client strings |
| R1B-T34 | Failure after freeze/source insert, audit failure, FK failure | Fault rollback then retry same accepted intent | No source/marker/audit half-effect or fake success; no extra G/Wallet | P1/P2 | Transaction boundaries/counts/receipt where used |
| R1B-T35 | COMMIT response lost for source command fixture | Disconnect after server commit then authorized receipt lookup | One accepted effect/replay; unresolved wait, no new key/G | P2 | Durable outcome+connection trace; runtime adapter separate |
| R1B-T36 | Empty disposable DB, no migration history | Apply reviewed baseline then R1b | Correct catalog,62models/28enums+one marker, no Wallet/G tables | P1 | Migration logs/schema SQL hashes/catalog |
| R1B-T37 | Populated valid catalog/R1a/data/z evidence | Baseline equivalence/adoption+R1b upgrade | No duplicate FK/data rewrite, audited marker cutover, issued history preserved | P1 | Counts/checksums/baseline marking evidence |
| R1B-T38 | Wrong month/student/finalization/enrollment class/unknown z | Prechecks then attempted rollout | Block/quarantine before enable, no guessing/backfill issued basis | P1 | Explicit anomaly classifications/failed gate |
| R1B-T39 | Migration interrupted before validation/guard/grant commit | Fail/rollback; repair migration history then rerun | No half-installed security state claimed success, safe reapply after approved recovery | P1 | pg catalogs+history+transaction logs |
| R1B-T40 | Guard/constraint/index existing names/actions; next future schema diff | Catalog/drift check + inspect R1a nested relations | No duplicate/drop R1a keys, all13attachments/enabled functions/grants, no new useless indexes | P1 | Definitions/pg_trigger/pg_constraint/pg_index + client tests |
| R1B-T41 | Fresh auth principal/token/tenant/parent scope through real NestJS path | Actual source command/API negative/retry/pooling tests | Runtime only after reviewed wrapper/ports, no unprotected Prisma nested write | R | Real API/service integration evidence, NOT inferred from fixture |
| R1B-T42 | Backup restore/tzdata version upgrade under controlled fixtures | Restore then compare attribution/history/dedup/roles | No old acknowledged outcome replay guessed, stable local-date facts or explicit blocked discrepancy | P1/P2/R as scoped | Restore/version manifest+before/after source dates |

### K.1. Explicit two-connection protocols

**C1 — Line vs reschedule / first source vs zone:** fixtures use known Tenant/User/source/period IDs. Controller issues A BEGIN, actor locks, tenant lock; A reports barrier **after acquired gate before DML** via test channel. B opens different connection/PID and attempts same entry, reports start; controller verifies B wait using pg_stat_activity/pg_locks/blocking PIDs (controller read-only third connection có thể dùng). Release A barrier, execute A action, choose COMMIT hoặc ROLLBACK; await B then assert fresh state/result/final joined invariant. Repeat A/B roles swapped, both commit and rollback variants, no arbitrary sleeps as proof. Guard fixture future DRAFT chỉ nhằm exercise inverse paths; initial monthly business admission after closed period vẫn thuộc R2.

**C2 — Authorization:** seed actual ACTIVE actor/session/member/role/permission/scope, bind fixture principal. A acquires User SHARE + Tenant then waits; B revoke path correct User/target modes→Tenant. Action wins before revoke ⇒ permission valid during effect; reverse order ⇒ after entry fresh query denies. Global disable uses User UPDATE **before** membership-set discovery/tenant gates, attachment also takes target User SHARE. Never seed fake actor via client GUC; no mocked bool permission. Capture last-Manager case on same tenant with competing global disables. SQL fixture verifies protocol, HTTP principal trust/runtime scope remain R caseT41.

**C3 — Refresh/deadlock/unknown outcome:** hold source mutation A uncommitted, start B entry before A finishes; release A, ensure B new statement sees committed state (or original after rollback). Include negative STABLE/single-CTE harness to prove fixture detects stale snapshot failure; production recommendation does not use it. Force a wrong-order fixture deadlock, assert abort has no partial source/marker; ordinary runtime wrong-order raw DML denied. Disconnect after commit while response withheld, resolve root before retry, never claim failure only from lost response.

## L. R1b Dependencies & Technical Sign-off

| Area | Minimum technical choice recommended | Trade-off / gate / status |
|---|---|---|
| O-01 | User-before-Tenant NK/RC/fresh reads, sorted mutation targets, closed runtime DML until narrow commands, finite retries | Serialize tenant writes; all source/IAM writers coverage and implicit locks need P2 tests. **PENDING TECHNICAL SIGN-OFF**, no global fence/framework |
| O-04 | Existing source scalars + protected new-line JSON namespace, immutable semantic facts/reject changes | Không preserve full accepted-G history yet; no new source/generation tables. Full O12-D R2-A required before generation/ISSUE runtime |
| O-13 | Targeted was-issued/source/marker/claim guards, current-auth/audit ports, safe roles/functions | Fixture protocol/security proof khác real API; no full R4. Minimum actor/state/grant design pending security review |
| H-01 / R3 | Enrollment class join + Class/Enrollment inverse protections + actual FK cascade proof | Null REGULAR enrollment/transfer/cycles/temporal eligibility/capacity/confirmed attendance residual, không H-01 full closure |
| Existing data/migrations | Actual target/version/catalog/roles/z evidence, baseline strategy + rollback/backup | Data not inspected. Unknown/mismatched legacy blocks rollout target, không block review plan kỹ thuật hôm nay |
| Runtime dependency | Fixed reviewed source commands + CurrentActorPort/AuditPort and exact permission/DTO/session binding | Needed **before granting production writes**; no need implement all R4 or open finance routes for R1b DB tests |

**Không câu hỏi business mới bắt buộc:** O-12 và B1–B5 settled. Owner chỉ cần review technical package/closed-write staging và cấp authorization implementation riêng nếu chấp thuận. Target DB read-only inventory/backup/disposable test access phải được xác định trước chạy; nếu phát hiện existing live writers hoặc historical ambiguity thì xin quyết định scope/data disposition cụ thể lúc có bằng chứng, không hỏi giả định hàng loạt. Không bắt owner chọn tên function/index/SQLSTATE.

**Exit evidence tương lai:** D reviewed exact delta+conditions; S one-marker PSL/client/nested compatibility; P baseline+custom SQL actually applied, child/inverse/C1/history/roles/P2/upgrade/recovery đạt; R real authorized API/ports after scoped implementation. R1a S không prove P, R1b P không Billing/Wallet runtime readiness. H-04 vẫn có price-source/completeness/issued lifecycle R2/R3 residual, không CLOSED toàn phần chỉ từ local-month tests.

## M. Implementation Work Packages

Các paths dưới là **dự kiến**, chưa file được phép tạo/sửa trong task này. Tối đa4gói, mỗi gói dừng để review; không tự chạy Phase4.

| Package | Files dự kiến / delta | Dependencies/tests | Rollback risk / stop condition |
|---|---|---|---|
| **WP1 — Inventory/baseline preparation** | Read-only DB inventory/evidence ở approved review location; future `apps/api/prisma/migrations/<baseline>/migration.sql` và migration_lock metadata nếu target requires, baseline exact existing schema | Authorized target+backup; check existing history/R1a/catalog/z, empty vs populated classification, no data reset. T36–38 plan/evidence | Baseline marking sai có thể recreate/drop data; **stop** nếu history/catalog/provenance khác hoặc chưa backup. Review baseline SQL trước apply, không include R1b/Wallet engines ngầm |
| **WP2 — Schema + deterministic guards** | `apps/api/prisma/schema.prisma`:one nullable Tenant field; reviewed `migrations/<r1b>/migration.sql`:C01,F01/02,T01–13, required staged backfill/constraint validation | WP1 reviewed, source z proof/maintenance boundary. S validate/generate/typecheck/nested tests; PG T01–24/33/36–40 | Guards có thể reject previously unrestricted writes, marker/history không rollback bằng reset sau use. **Stop** khi original data mismatch/new PSL delta ngoài one field, no blind backfill |
| **WP3 — Privileges/protocol harness** | Same or reviewed separate R1b SQL grant section G01–04; future `apps/api/test/schema-integrity/fixtures/r1b-command-fixture.sql` + `r1b-roles.spec.ts`/`r1b-concurrency.spec.ts`; **test-only adapters**, không production Nest modules | Actual role inventory, WP2; current User/session/member/grants tables seeded, barriers/PIDs/fault hooks. T25–35/40, safe function search_path/grants | Runtime không owner/raw DML, fixture privilege phải không leak production. **Stop** nếu legacy writers/roles không migrate an toàn, missing protocol coverage; no generic command framework |
| **WP4 — Independent DB verification/readiness report** | `apps/api/test/schema-integrity/r1b-integrity.spec.ts` và approved review evidence/report; migration SQL diff adjustments chỉ khi failure/review yêu cầu | Fresh+populated+invalid DB, actual migrations/catalog/roles/P2/restore T01–40/42, R1a regression; R T41 remains separate if not authorized | Don't declare P if DB unavailable/tests missing; record partial/residual findings. **Stop after R1b review**, không auto R2/API/deploy/Git |

DB environment không available/authorized ⇒ WP P-gate **NOT RUN**, không thay mocks/offline assertions thành PostgreSQL evidence. Public source command wrappers/live write migration nếu thực sự cần là explicit runtime slice, không lén thêm vào WP3 để gọi database package “feature-ready”.

## N. Verification Actually Run

**Trong Phase3 hiện tại:** đọc actual sources/schema/config/migration inventory, Git status/branch/HEAD/diffs, snapshot/hash preservation và Markdown/static document checks. Không Prisma validate/generate/typecheck/build, SQL/DDL/DML/migrations/DB connection, source/runtime/auth/jobs/UI tests, dependency install hoặc external service. Source proof ở R1a và Phase2 vẫn chỉ history, không lần chạy mới.

| Check | Result / evidence boundary |
|---|---|
| Baseline/git/inventory/path inspection | PASS: HEAD703cdd4 khác old9d5fb7c, clean before task;88existing files; artifact chưa tồn tại, migrations dir absent |
| Snapshot preservation | **PASS:** so SHA-256 của cả 88 existing files, không file nào thay đổi; HEAD/branch/index và tracked binary diffs giữ nguyên, chỉ thêm plan này. Manifest+diffs+verification JSON ở `C:/Users/Admin/AppData/Local/Temp/educore-r1b-plan-JsIK2q/`; schema SHA-256 B.1 |
| Documentation checks | **PASS: 24/24 static/preservation checks, 0 failures.** Đủ A–O, one PSL marker proposal, 2 helpers/6 trigger functions/13 attachments, 42 unique test cases, 4 work packages, 23 local links, 14 tables; fences/whitespace/UTF-8 và 9 R1a FK/key/index names khớp actual schema. `git diff --check` sạch; report untracked được kiểm Markdown/whitespace riêng. Đây là document checks, không chứng minh SQL thực thi hoặc concurrency |
| Schema/client validation | **NOT RUN** trong task; one-field diff chỉ minh họa chưa áp dụng |
| PostgreSQL verification | **NOT RUN**; toàn K DESIGNED, no migrations/functions/triggers applied |
| Runtime verification | **NOT RUN**, no mutation routes/wrappers/adapter implementation; fixture design không là production permission proof |

Chỉ file `docs/ai/reviews/database/R1B_IMPLEMENTATION_PLAN.md` được tạo; không sửa existing docs/schema/code/migrations/AGENTS/Architecture/patches, không mất untracked work (baseline không có untracked). No git add/commit/push/branch/PR/reset/restore/checkout. New file cần review trước mọi Git operation.

## O. Final Verdict & Next Action

**R1B IMPLEMENTATION PLAN — READY FOR OWNER TECHNICAL REVIEW.**

Chọn one nullable freeze marker + existing R1a FKs + monthly CHECK + immediate child/parent/history guards, tenant gate/current-auth protocol và closed runtime writes/test-only verification boundary. Không deferred repair/generation/Wallet/IAM framework để hoàn thành period integrity. Không coi closed profile đã implement authentication, không xem month correctness là pricing/ISSUE proof.

Next owner action: review plan/technical subset và exact guard/grant trade-offs; nếu chấp thuận, cấp **authorization riêng cho implementation package và allowed DB inventory/disposable tests**. Existing-data scope chỉ chọn sau inventory có bằng chứng. Không hỏi lại O-12/B1–B5, không tự ghi TECHNICALLY APPROVED. H-04 **OPEN**; dừng Phase3, không schema edit, migration, database hoặc R1b/R2 implementation.
