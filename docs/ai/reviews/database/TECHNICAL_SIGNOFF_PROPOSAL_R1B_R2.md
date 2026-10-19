# EduCore — Technical Sign-off Proposal for R1b & R2

**DRAFT LOCAL · 2026-10-19 · Asia/Ho_Chi_Minh · RECOMMENDED / PENDING_APPROVAL.**

## A. Executive Summary

**Verdict: READY FOR OWNER TECHNICAL REVIEW.** Hồ sơ đủ để review các lựa chọn kỹ thuật; chưa có technical approval, authorization implementation/migration hoặc PostgreSQL/runtime evidence. H-04 vẫn OPEN. Owner đã phê duyệt O-12 ngày18/10: **O12-A=A, O12-B=B1, O12-C=C1, O12-D=D**; không mở lại bốn lựa chọn này.

| Decision | Một recommendation duy nhất | Phạm vi và giới hạn |
|---|---|---|
| O-01 | **Tenant row gate FOR NO KEY UPDATE + READ COMMITTED, trusted command gateway, fresh reads và một lock graph chung**; thêm global authorization fence S/X cho global identity mutations | Refinement proposal C. Không chứng minh safe chỉ bằng pseudocode. Global fence là phần technical mới cần duyệt, không phải cơ chế đã có |
| O-04 | **Hybrid:** relational generation metadata + typed per-participation source rows + immutable versioned JSON evidence/result | Bảo vệ ownership/CAS bằng FK/UQ/guards, lưu nguyên chứng cứ G1/G2; không generation-wide pricing date. Model/field names D đều là proposal |
| O-13 | **Per-domain state/transition guards; privileged gateways; explicit USER/WORKER/OPERATOR provenance; one-time attempt finalization; durable dedup/retention; fenced jobs và DB-only atomic outbox consumer** | E. Financial keys không TTL/purge mặc định; audit baseline24 tháng giữ nguyên. Manual job recovery cycle còn approval riêng, không âm thầm nới4 attempts |

R1b cần D cho phần period/freeze/inverse/source/privilege contract tối thiểu; không phải chờ mọi financial choice O-02–10 hoặc full R2 engine. R2 generation/pricing design còn O-04/O-13; ISSUE/ledger/excess/cancellation/effect DDL còn O-02/03/05/06/07/10 và source/API/R4 dependencies. Duyệt ba O chính không mở toàn bộ R2.

**Baseline thực tế:** branch `feat/prisma-p0-schema`, HEAD `9d5fb7c39a6dcd605fe36bc544d85bf217009e63`, commit `docs(db): approve O-12 session-date pricing and align remediation plan`, commit time `2026-10-18T23:47:36+07:00`. Đầu task working tree/index sạch. HEAD và working copy đều chứa O-12 approval/post-review; dùng baseline này, không dùng HEAD cũ6173… để phủ định tài liệu hiện hành. Chưa kiểm remote/main/deployment.

Schema actual: **62 models/28 enums**, SHA-256 `28b993a418340523e6e0246fca3bc94bb73e7d5f269a3fb8cf46472565d51b28`; R1a student/session FKs có trong draft. **Không có `apps/api/prisma/migrations/` trong checkout**; không suy ra có/không có DB bên ngoài. Không kết nối DB, không chạy Prisma hoặc implementation tests. Chỉ thêm report này.

## B. Source & Authority Matrix

Các line numbers dưới đây áp dụng cho baseline HEAD nêu A; links mở actual files, historical citations ở các report cũ giữ nguyên. Authority là approval user/source, không đến từ tên file “design”.

| Source / section / baseline lines | Authority / evidence | Disposition cho hồ sơ |
|---|---|---|
| [AGENTS](../../../../AGENTS.md), Sources/Hard boundaries; [Project Context](../../PROJECT_CONTEXT.md) §2/4/5 | Current instructions; Group A baseline; context §7 là scaffold snapshot lịch sử | Docs-only, không external service/code/DB/Git write; precedence Requirements→UC→Architecture→design |
| [Decision Register](../../DECISION_REGISTER.md#f-o-12--approved-business-decision-2026-10-18) §F,78–89 | O-12 business APPROVED18/10; technical O-01/O-04/O-13 chưa approved | Giá/month/session date/C1/D giữ; không cập nhật register |
| [Requirements](../../../requirements/requirements_analysis.md) BR-06:222, BR-14:230, Q-04:319, Q-08:338, Q-10/13/14 | Approved business; request policy pin khác DATE tariff; audit24 tháng, transient3 retries | O-12 invariant D.1; no automatic issue/refund/credit/comboP1 |
| [Use Cases](../../../requirements/usecase/specification.md) UC-21/23/24; AC-21-03/04, AC-23-04–07, AC-24-03/04; UC-26/34/37 | Approved behavior; current auth, immutable issue, retry/manual recovery | Source/issue gates; financial failure decisions F; job retry ambiguity E.3 không tự giải quyết |
| [Architecture](../../../architectural/architectural_design.md) Accepted stack/transaction/automation | Accepted modular monolith/PG/Prisma/outbox | Module public ports/coordinator chung transaction; không microservices/queue ngoài |
| [Remediation Plan](SCHEMA_REMEDIATION_PLAN_P0.md) §3.2:174–245, §4.1–4.14, §5.3, §8/9.2 | Technical RECOMMENDED; post-review READY FOR TECHNICAL SIGN-OFF | Kế thừa coarse gate/gateway; C/E làm rõ global IAM, queue/fencing và representation, không tự approve plan |
| [O-12](O12_DECISION_PROPOSAL.md#n-final-approved-decision--2026-10-18) N; N.5:27 AC | Approved business addendum; A–M/28 T là history superseded ở charge-time | Giữ nguyên A–M/N; use N thay historical B/I04/I06/I11 |
| [Database Design](../../../design/database_design.md) §3.6 O-12/DB-08:311; [DD](../../../design/detailed_design.md) §5.7:224–284 | Group A + O-12 business; concrete SQL/persistence proposed | Hybrid cụ thể hóa nghĩa vụ, không claim fields/SQL đã implemented |
| [API](../../../design/api_specification.md) §5.4:405–446, §5.6:467–469 | Group A conventions; recompute path/DTO/permission PENDING API REVIEW | Không thêm endpoint; API sample không phê duyệt execution mode O-07 |
| [Billing class](../../../design/class%20design/billing-receivables.md) §3/4, [Scheduling class](../../../design/class%20design/resource-scheduling.md) §3/4 | Logical types/ports proposal; O-12 amendment đã đồng bộ | Original lineage/startsAt; Billing resolve giá; Scheduling không arithmetic |
| [Tenant/Policy class](../../../design/class%20design/tenant-policy.md) §3–5; [Jobs class](../../../design/class%20design/automation-jobs.md) §3–5 | Baseline pin/dedup; storage/execution proposed | Freeze theo O-12 có ưu tiên; không mở P1 lifecycle/policy editor |
| [Workflow class](../../../design/class%20design/workflow-approval.md) §3–5; [Audit class](../../../design/class%20design/audit-traceability.md) §3–5 | APPROVED≠COMPLETED, actor/append-only/24 tháng | Technical one-time finish khác unlimited UPDATE; E/F nêu proposed refinements |
| [Independent audit](SCHEMA_AUDIT_P0.md) H-01/03–09/14–20, M-01/04/05/07 | Historical findings/backlog, không business authority | Findings không tự đóng; test layers H; source history H-01 còn guard/design gap |
| [R1a](SCHEMA_REMEDIATION_R1A.md) §5–8 | Historical PSL/generate/typecheck, NOT PG | R1b không dùng R1a S evidence như SQL/concurrency PASS |
| [Actual Prisma](../../../../apps/api/prisma/schema.prisma) Tenant:180; PriceRule:1103; Run:1148; Invoice/Line:1181/1227; jobs/audit:1614–1840 | Actual fields/FKs, không trigger/migration evidence | Field inventory D/E/G. No generation/freeze marker/receipt/history guards hiện có |

**Conflict/clarification cần disposition trước phần phụ thuộc, không cản owner review hồ sơ:**

1. O-12 pricing conflict đã resolved bằng approval/amendment; không còn charge-time option hiện hành. Context/plan §2/7 line counts/hash cũ là provenance lịch sử; baseline hôm nay đã committed.
2. DB §3.6:233 còn “decision+APPLIED effect cùng transaction”, trong khi UC-34 failure path/plan §4.7 và API separate decide/execute đòi quyết định bền qua failure. Recommendation O-07=B cần owner chọn và authorization nguồn riêng trước financial implementation.
3. DB Group A:237 có `INV-{YEAR}-{SEQUENCE}`, DB §9:437 lại gọi format proposed. Giữ invariant counter/year/manual issue; F đề xuất presentation details, không hỏi lại một invoice/tháng.
4. DB jobs:291 nói `attempt_count<=4` lifetime, UC-37 có manual retry sau FAILED. Không reset fencing counter hoặc tự thêm vòng automatic retry. E.3 đề xuất explicit recovery cycles, **PENDING_APPROVAL** và cần amend technical source riêng nếu chọn.
5. “Append-only JobAttempt/OutboxEvent” ở class docs đi kèm finish/status methods; E phân tách immutable identity/payload với whitelist execution metadata, không cho update history tùy ý.

## C. O-01 Technical Review

### C.1. Options và một recommendation

| Option | Integrity / operational trade-offs | Kết luận |
|---|---|---|
| A — coarse tenant row gate, RC + ordered anchors/gateway | Tenant row luôn tồn tại; serializes predicates/phantom writes của cùng tenant; dễ quan sát. Tăng contention, cần gateway cho tất cả writers, global IAM và queue order riêng | **RECOMMENDED** kèm C.2–C.7 |
| B — fine-grained row/advisory keys cho source/class/student/period | Throughput tốt hơn, nhưng absent source/price override/last-seat/revocation đòi full predicate anchors và collision/order proof, nhiều paths | Chưa đủ evidence P0 để chọn; có thể review thay thế sau benchmark, không bỏ coarse gate ngầm |
| C — SERIALIZABLE + bounded retry và constraints | Có predicate protection nhưng abort/retry, version/driver behavior và authorization/leases vẫn cần contract; không thay history/permissions | Không default P0; muốn đổi isolation phải review/test riêng |

Không bỏ GiST/exclusion resource/price, UQ/FK/CHECK đã duyệt. Gate chỉ có sức mạnh nếu **mọi writer** đi qua cùng boundary; trigger lấy lock sau statement snapshot hoặc FK KEY SHARE không thay mutex.

### C.2. Lock graph cụ thể, global identity và queue

**Total order proposal**, khóa giữ tới end transaction; các ID cùng node sort theo type order rồi UUID byte order cố định, không phụ thuộc locale. Chỉ ordinary read/preview được ngoài protocol, dữ liệu ấy advisory. Lock graph không là Mermaid artifact cần công cụ ngoài; dùng bảng để review chính xác.

| Rank | Resource / mode / rule |
|---|---|
| 0 | **Global authorization fence:** một reserved **transaction advisory** key do migration định nghĩa, không client key/hash UUID. Tenant commands lấy shared; global User disable/credential revocation/user↔membership attachment/lifecycle mutation lấy exclusive ngay từ đầu. Không S→X upgrade; không session advisory lock |
| 1 | Full tenant set sorted, `Tenant FOR NO KEY UPDATE`; một tenant thông thường. Global fence exclusive cho phép discover stable affected tenants trước row gates; tenant creation/membership attachments cũng tuân rank0. Không khám phá thêm tenant rồi lấy rank1 sau rank thấp hơn: abort/restart |
| 2a–2e | Fresh current authority; typed idempotency receipt → ApprovalRequest → existing OutboxEvent (nếu consumer) → AutomationJob → JobAttempt, mỗi type sort IDs. Discover dependencies sau rank1 trước row locks; existing FK parents được nắm trước children |
| 3a–3c | BillingPeriod SHARE → BillingRun UPDATE → BillingRunGeneration UPDATE. Cùng run/student/period; base/current CAS không dùng preview |
| 4a–4f | Course → Class → ScheduleSeries → SchedulableResource → ClassSession → PriceRule rows, type+ID sorted; SHARE cho validate, UPDATE cho mutation. Target discovery dưới gate, FK parents của new session-scoped rule đã có trước child. Đây là sub-order refinement cần ký thống nhất, không suy từ một module riêng |
| 5a–5e | Enrollment/transfer → SessionParticipant → AbsenceRequest → AttendanceFinalization → AttendanceRecord/correction; type+ID sorted. H-01 candidate/lineage consistency còn review; immediate FK side effects phải inventory |
| 6a–6f | All affected Invoice UPDATE → InvoiceLine → InvoiceDiscount → permanent claims → Payment/PaymentReversal/Allocation → Adjustment, type+ID sorted; financial root request đã ở rank2 |
| 7 | Counter tenant/year, excess/reconciliation projections/history, new result/audit/outbox rows. New invisible rows inserted theo parent-before-child; constraints/FK/index waits vẫn phải test. Không quay lại lock existing event/job rank2 sau invoice |

**Global fence là refinement mới RECOMMENDED:** Tenant gates riêng không ngăn global User.disable đổi authority khi tenant command đang chạy hoặc membership set thêm phantom. Một shared global fence không serialize tenant A với tenant B; exclusive global IAM chờ mọi shared commands kết thúc và chặn commands mới, rồi khóa đủ tenants, sửa user/membership+last-Manager checks/audit atomic. Chi phí global exclusive có thể lớn; không giữ lâu hoặc làm batch external I/O. Namespace key/pooling/revoke paths cần Ops sign-off. Không có root row/schema mới cho fence; mọi helper lấy lock nội bộ, caller không chứng minh đã khóa bằng GUC. Không chọn user-first row lock rồi tenant-first ở các writers khác tạo cycle.

Global shared objects/uniques (`User.emailNormalized`, `Tenant.code`, global permission catalog) không sửa dưới rootS của tenant command: dùng reviewed global-X command hoặc migration maintenance barrier. Không claim tenant gates loại mọi wait trên global UQ/FK. Namespace của advisory key chỉ một fixed reviewed key, không hash collisions từ tenant/resource IDs; entry kind S/X do function/command allowlist quyết định, không client tự chọn.

**Queue worker không đảo order:** poll SELECT candidate IDs không lock chỉ advisory; mỗi candidate rootS→tenant gate→rank2 Outbox/Job `FOR UPDATE SKIP LOCKED`, recheck due/status/lease rồi claim. Không `SELECT jobs FOR UPDATE` trong poller trước tenant gate; SKIP LOCKED chỉ skip locked queue row, không là business-consistency proof. Claim commit ngắn; compute ngoài transaction; effect reacquire graph và fence epoch. Outbox DB-only consumer xử lý effect+ACK trong cùng transaction E.4. Poller không giữ hàng loạt job/tenant locks để chờ source.

### C.3. Design argument và giới hạn tránh deadlock

Trong tập participating writers, cùng tenant không giữ lower-ranked row lock rồi chờ tenant gate; một writer giữ gate, writer cùng tenant còn lại chờ trước khi nắm descendants. Global IAM lấy X rank0 trước tenant, không giữ tenant rồi xin global X. Cross-tenant commands khóa full set ascending; mọi waits tiếp theo đi tăng trên một total order; không tạo directed cycle từ một rank lớn về nhỏ. Bởi vậy graph ngăn **cycles do application lock-order inversion theo các giả thiết này**.

Đây **không** là chứng minh mọi PostgreSQL deadlock biến mất: FK implicit lock, index/exclusion, DDL, retention, rogue SQL, function volatility/snapshot và failover đều ngoài suy luận nếu chưa inventory/test. Migration owner/bypass không được chạy live DDL đồng thời bằng quyền runtime. Explicit SHARE→UPDATE upgrades trên cùng row giữa hai writers khác tenant/global objects phải tránh; biết write intent từ đầu. Nếu phát hiện dependency rank đã đi qua, rollback/restart, không “lấy thêm lock nhanh”. PG tests C/H phải chứng minh actual catalog paths; SQLSTATE40P01 vẫn được xử lý.

### C.4. Transaction/pseudocode — proposal, không execute

`enter()` và helpers dưới đây là proposed trusted gateway internals, không API đã tồn tại. Prisma interactive transaction phải cùng connection/transaction client; không dùng pool-level/session advisory locks. Function không tự COMMIT. Mọi mutation gateway tự enforce enter/locks; caller bỏ entry call cũng không bypass. Khuyến nghị hai top-level statements entry rồi command; trong command dùng VOLATILE PL/pgSQL, fresh internal SQL sau lock, không STABLE hoặc một CTE vừa lock vừa validate snapshot cũ. Behavior phải test H-03.

```text
common(command, intent):
  BEGIN READ COMMITTED
  enter: global fence S (X only for global-IAM command), sorted tenant gates
  -- separate completed statement; now fresh read, not cached pre-gate authorization
  bind verified backend principal; check current User/membership/permission/scope
  canonical typed key/hash lookup under rank2; replay only if currently authorized
  discover OLD+NEW dependency IDs after gate; acquire all needed locks in total order
  read source set/revisions, timezone, canonical period, draft/issued/claims afresh
  compare expected revisions/generation pointers; reject stale intent, no silent refresh
  execute one allowed domain mutation
  force named deferred final-state guards IMMEDIATE; audit/result/outbox atomic
  COMMIT; only then success
```

**Source mutation (create/reschedule/cancel/attendance/price):**

```text
source_change(cmd):
  common prefix; for first series/session/period/run, freeze timezone in SAME transaction
  past/issued session identity/time reschedule -> reject; valid future operation only
  require original session/class/course lineage; no reparent historical source via class.course
  price writer -> reject historical amount/target/backdated override; DATE future publication
  capture OLD+NEW affected source sets; mutation revision++, affected DRAFT run sourceEpoch++ (R2)
  invalidate READY/current draft and PREPARED generation; no refresh of sealed G1 inputs/result
  issued-source attendance correction -> append authorized correction/financial follow-up,
      keep issued Run/G/Invoice/claims frozen; never reopen as recomputable stale draft
  if retained mutable lines would violate final month/date:
      reject whole mutation unless explicit reviewed rebuild/removal command can fix atomically
  never auto create G2 or new monthly invoice from source invalidation
  future tariff close preserving value/eligibility at captured d is not semantic staleness
  force guards, audit and commit; historical financial correction uses separate approved flow
```

**Participant mutation:** same graph; lock source enrollment/class/session plus participant and all affected finalized/draft/issued dependencies. New REGULAR source must match student/class/enrollment effective interval; roster insert/remove increments relevant source epoch and invalidates draft completeness, including absent→present phantom. Required student/session identity and issued claims cannot be re-keyed; transfer only future participants, old source chain retained. Attendance batch completeness and authorization stay R3 duties; R1b FK/period guard alone does not prove them.

**Period/line command and reverse paths:**

```text
check_final_line(lineId):
  load CURRENT final line, not stale NEW tuple; if deleted, skip line equality only
  join Invoice I -> BillingPeriod B; SessionParticipant P -> ClassSession S; Tenant T
  assert tenant/student/session equalities (also R1a immediate FKs)
  d = (S.startsAt AT TIME ZONE T.timezone)::date  // T frozen, snapshot derived server-side
  assert B.start first of month and B.end = first of next month
  assert B.start <= d < B.end
  assert supplied source/date evidence equals captured facts at allowed creation/apply boundary
  else raise named period/source constraint violation
```

BillingPeriod tenant/id/month bounds và Invoice tenant/student/period/run identity immutable sau tạo; wrong monthly draft được sửa nguồn qua explicit contract, không chuyển header tháng. Child trigger INSERT/UPDATE/DELETE và inverse parent guards trên ClassSession time/class/status/keys, Participant owner/session/keys, Invoice, Period, Tenant zone/keys; source lineage thêm Class.course/Enrollment paths H-01. Enumerate OLD+NEW IDs/all surviving lines. Immediate reject issued child/history mutation, protected re-key/C1 change; DEFERRABLE INITIALLY DEFERRED chỉ cho draft final-state containment. Deleting/rebuilding draft line không xóa sealed GenerationSource. At first source, freeze marker sticky; rollback source rollback first marker; cancel/delete nguồn cuối không clear. Zone validate IANA against deployed PG catalog before source; approved z snapshot/date không client input. Không row CHECK chứa subquery/now(); future-only evaluated inside command under locks.

**ISSUE boundary (full R2, not R1b):** rootS→tenant→key/request/job(if applicable)→period/run/G→source/price/class anchors→participants/attendance→invoice/lines/claims→counter. Require current applied generation/no pending/no stale, same captured source set/semantic price facts/confirmed attendance/discount evidence and current rights. No resolve at issue-time or policy repin. Claim **every** participation incl units0, allocate number once, freeze header/lines/discount/evidence, set Run projection ISSUED, result/audit atomic. Unique claim cannot release after invoice cancellation. Pending/invalidation wins first ⇒ ISSUE rejects; ISSUE wins first ⇒ future mutation follows issued guards/correction, cannot rewrite frozen snapshot. Live attendance status after authorized correction is not required to remain equal to issued line's historical status; source/date structural identity remains protected, financial follow-up is separate.

### C.5. Privilege and identity boundary

Recommendation role matrix E.2; commands SECURITY DEFINER owned by NOLOGIN minimal DML function owner, separate NOLOGIN table owner/migration identity. Fixed `search_path=pg_catalog,educore_private,pg_temp`, fully qualified tables/types/helpers; schemas not writable by runtime/PUBLIC. REVOKE PUBLIC EXECUTE on new/existing helpers **in same reviewed DDL transaction**, set applicable default privileges for actual creator, grant explicit command signatures only. No dynamic SQL/table names/client predicate, no runtime SET ROLE to owner, no DDL/TRUNCATE/TRIGGER/BYPASSRLS/replication/superuser privilege. Restrict role membership/inherited grants as well as direct grants. Test temp-object shadowing and unqualified helper calls.

Runtime Prisma API/worker cannot direct INSERT/UPDATE/DELETE protected Tenant zone, Series/Session/Participant/Attendance/Absence/Price/Policy/Period/Run/G/Invoice/Line/Claim/Ledger/Approval/Job/Attempt/Audit rows; gateway owns narrow writes. No broad raw SELECT PII/finance granted as a shortcut; use scoped query boundary or separately reviewed read grants. Worker gets only approved job/claim/effect/outbox methods; cannot decide manual approval. Fixture role may bypass service to prove FK/guards, never production role. Maintenance role cannot operate concurrently through bypass without controlled barrier.

**Authn trust limitation explicit:** same DB login cannot cryptographically identify HTTP end user from arbitrary `actorId`, GUC or connection user. Verified backend principal comes from auth middleware/service and is bound to canonical intent; gateway rechecks tenant/current stored grants. Do not treat client-supplied actor/GUC as identity. DB boundary prevents DML/gateway bypass under granted interfaces; it does not prove safety against a compromised trusted backend impersonating a principal or DB owner. If threat model requires that, signed capabilities/separate auth boundary needs security design approval, not an invented implemented feature. USER/WORKER/OPERATOR audit does not itself grant business rights.

### C.6. Timeouts, retry, failure and unknown commit

**Proposed local budgets for owner/Ops review:** lock wait2s, statement5s, idle-in-transaction10s; API interactive transaction cap10s, request retry wall budget15s, at most2 retries after initial for40P01/40001/lock contention with jitter50–200ms and remaining budget check. These are technical defaults, not measured NFR/SLO or current config; fail fast/requeue bounded when budget ends, never silently relax guards. Long compute/external I/O outside locks; monthly multi-student work split per logical student/run admission, not partial commit of one invoice. PG version/pool/Prisma transaction options must be checked in implementation task.

| Failure | Required action |
|---|---|
|40P01/40001/lock timeout | Rollback complete phase before retry, same key/hash/pinned accepted G/policy/expected CAS. No retry inside aborted transaction; user intent unchanged |
|23503/23514/period mismatch/23P01 | Data or domain conflict; no blind retry. Rollback; report safe conflict/missing/stale appropriately |
|23505 | Distinguish authorized same-key replay from payload mismatch/logical monthly/claim conflict; never catch-all “success” |
|Source changed between admitted G and apply | G becomes STALE or run invalidated under fresh separate transaction; no refresh same G. New G2 command needed |
|COMMIT response lost | Reconnect, re-enter locks, lookup durable typed receipt/G/result/effect. Committed result ⇒ replay; absent after old transaction ended ⇒ retry phase; unresolved in-flight outcome ⇒ wait/bounded recovery, do not declare failure or create G2 |
|Apply rolls back | Lines/pointers/claims/audit success all rollback; earlier durable admission remains. Attempt failure appended separately after rollback, never pretend it survived rollback |
|Admission rolls back | No accepted G/clock exists; same intent retry may admit first durable G. If receipt already committed, clock/pin never resampled |
|Persistent job attempt fails transiently | Use exactly Q-13 initial+3 at1/5/15 minutes; **no extra inner HTTP retry loop** multiplying job attempts. Key/G/policy same; E.3 fences and recovery |

### C.7. Contention and readiness limit

Same tenant finance/scheduling writes serialize, including long source capture; throughput cannot exceed critical-section capacity for that tenant. Distinct tenants share only compatible rootS and can proceed; global IAM X is a brief rare barrier. Measure gate wait percentiles, held duration, source count, retry/deadlock rate and pool saturation at NFR fixture load. No hard throughput assertion without data. If too slow, separately review fine-grained replacement with full predicate tests; do not remove gate for selected writers. R1b D can approve this contract; P evidence H still mandatory and R4 auth/role implementation needed before runtime exposure.

## D. O-04 Technical Review

### D.1. Approved obligations and options

```text
z = frozen tenant timezoneSnapshot
sourceBusinessDate = local_date(ClassSession.startsAt,z)
pricingLocalDate = sourceBusinessDate
billingMonth = first_day_of_month(sourceBusinessDate)
price eligible iff effectiveFrom <= pricingLocalDate
   AND (effectiveTo is NULL OR pricingLocalDate < effectiveTo)
SESSION > CLASS > COURSE; choose original session/class/course lineage
```

`generationCreatedAt` (aka chargeCreatedAt if retained for compatibility) is server admission/audit/request-policy clock only. Prefer one stored instant with alias in explanation, not two independently writable clocks. Calculation PolicyVersion is pinned at that instant under BR-14; PriceRule DATE selection is per session. Tariff/scheduling policy provenance are separate IDs. No charge-time pricing, no global pricing date shared by every line.

| Storage option | Strength / cost / tests | Verdict |
|---|---|---|
| A — typed G metadata + one versioned JSON aggregate per G | Few tables, atomically seal whole blob; participant/rule/owner/date relationships inside JSON need more guards, duplicate-source queries/backfill harder | Valid fallback only with equivalent validation; not chosen |
| B — fully relational snapshots/selection candidates/discount/result trees | Strong typed traversal and SQL queries; many tables/FKs/candidate versions, financial policy shape evolves, larger migration/test surface | Too much P0 complexity for every evidence detail |
| C — hybrid metadata + typed per-participation source rows + immutable JSON proofs/results | SQL keys/ownership/date/source indexes plus raw explanation history, bounded schema; serializer/guard duplication must be tested | **RECOMMENDED**; row CHECK/FK guard actual identities, JSON explains facts |

### D.2. Logical model, fields and cardinality — all PROPOSED

One BillingRun per `(tenant,student,period)`, Run1→G0..N, G1→Source0..N (incomplete generations may have missing-data evidence), Run1→Invoice0..1. Invoice DRAFT projects one **applied** G; source rows of old G immutable. Invoice ISSUED permanently references applied G and claimed participant lines; no second invoice/root run per month.

| Entity / exact proposed delta | Fields / ownership / rule |
|---|---|
| `BillingRun` existing | Keep current logical UQs and initial operationKey. Add `latestGenerationId?`, `currentAppliedGenerationId?`, `pendingGenerationId?` UUID, `sourceEpoch BigInt default0`; state projection per E.1. Epoch monotonic for relevant source changes, not every updatedAt |
| `BillingRunGeneration` new | id/tenantId/billingRunId/studentId/periodId; generationNo positive Int; baseGenerationId?; expectedAppliedGenerationId?; operationType=BILLING_GENERATION shared key namespace, operationMode INITIAL/RECOMPUTE, operationKey/requestHash; generationCreatedAt TIMESTAMPTZ(6); calculationPolicyVersionId; timezoneSnapshot TEXT; capturedSourceEpoch BigInt; payloadSchemaVersion Int; inputHash; sourceSetJson/discountEvidenceJson; reason (required recompute); inputSealedAt?; state; resultJson/resultHash?/completedAt?/errorCode?/diffJson? |
| `BillingGenerationSource` new | id/tenantId/billingRunId/generationId/studentId/periodId/participantId/sessionId; attendanceId?/finalizationId?/source revisions; sourceClassId/sourceCourseId/enrollmentId?; startsAtSnapshot/endsAtSnapshot TIMESTAMPTZ(6); sourceBusinessDate/pricingLocalDate DATE; timezoneSnapshot; selectedPriceRuleId?/priceEffectiveFrom?/priceEffectiveTo?/unitPriceVnd?/chargeUnits?/baseAmountVnd?; selectionTier?/selectedTargetId?; evidenceJson/schemaVersion/rowHash; complete Boolean + missingReason? |
| `Invoice` existing | Proposed `generationId?` transitionally during legacy migration, required for newly materialized O-12 invoice; same tenant/run/student/period FK to applied G; current projection policy/hash/revision updated with G apply |
| `InvoiceLine` existing | Add `generationSourceId?` transitionally (required for new supported invoices) and exact same-source ownership reference; keep R1a student/session/participant FKs. Existing sourceSnapshotJson remains projection of sealed evidence, not authority client JSON |
| `Tenant` R1b | Add sticky `timezoneFrozenAt TIMESTAMPTZ(6)?`; no timezone editor, no arbitrary timezone snapshot field on Tenant required for month guard |
| D-related technical records | Typed durable command receipt can use reviewed IdempotencyRecord extension/result binding; Job result/attempt fields E; ApprovalExecutionReceipt F is independent financial decision, not required to admit initial Billing G |

Nullable PriceRule/amount fields only for **explicit incomplete capture**, not READY/APPLIED or implicit0. For complete cancelled source price required, units0; no fake attendance. JSON carries ordered candidates/absence-of-higher-tier proof, approved EXCUSED evidence, sibling verification/eligible enrollments, tariff/scheduling provenance, original chain labels/revisions, safe missing reasons. Result JSON is exact BigInt strings/discount evidence/totals and full operation diff; no current live joins needed to explain old G. Client cannot supply trusted snapshots/date/clock/result.

### D.3. Keys, pointers, sealing and schema guard inventory

| Invariant / key proposal | Enforcement / need for PG proof |
|---|---|
| G→Run ownership | FK `(tenant,billingRunId,studentId,periodId)` → existing Run `(tenant,id,studentId,periodId)`; existing candidate available |
| G identifiers | UQ `(tenant,billingRunId,generationNo)`, typed `(tenant,operationType,operationKey)`, candidate `(tenant,billingRunId,studentId,periodId,id)`; operation namespace matches durable receipt, not two independent uncorrelated dedup authorities |
| latest/current/pending pointers | Composite FK Run tuple + pointer → G candidate above; base/expectedApplied refs same run tuple, nullable initial. Guard generationNo(base)<newNo, no self/cycle; latest is most recent admitted not most recent applied |
| Source identity | UQ `(tenant,generationId,participantId)`, candidate `(tenant,generationId,sessionId,studentId,participantId,id)`; G owner FK; Participant FK to R1a tuple `(tenant,session,student,id)`; attendance/finalization same-source proof. Class/course/enrollment tenant FKs plus H-01 lineage guard, not assertion all composite keys already exist |
| Line projection | Need same source/gen/invoice ownership: proposed candidate Source `(tenant,generationId,sessionId,studentId,participantId,id)` and composite line FK; line therefore also stores required `generationId` for new data. Invoice candidate `(tenant,id,studentId,generationId)` + line FK forbids cross-generation invoice line. Additional candidate/FK cycles/nullability/actions must validate Prisma in authorized S task |
| Current applied coherence | Deferred final guard Invoice.generation=Run.currentApplied and G APPLIED/result; policy/hash/totals/sourceEpoch projections agree for READY. Pointer cannot move backward to replayed G1; historical G APPLIED remains APPLIED after G2, not rewritten “SUPERSEDED” |
| One pending | Run pending pointer and partial UQ `G(tenant,run) WHERE state=PREPARED`; final guard equivalence, pending belongs to latest; G1 missing/failed/stale terminal permits explicit G2 even currentApplied NULL |
| Per-source date/money | CHECK pricingLocalDate=sourceBusinessDate, ranges/units/nonnegative; creation/capture guard derives date from startsAtSnapshot/z and trusted live source under locks, period containment inverse guards; row CHECK cannot query parent/calendar zone catalog |
| Seal | During admission only, insert G/input children then set inputSealedAt. Deferred final guard **no committed unsealed G**; children INSERT only while unsealed in current admission transaction. Once sealed no INSERT/UPDATE/DELETE source/evidence or clear seal; lifecycle/results narrowly whitelisted |
| Result one-time finalization | PREPARED→APPLIED writes result/diff/hash/completedAt once atomically with projection; NEVER overwrite result on retry. NEEDS_INFORMATION terminal captured at admission with explicit missing evidence; failed/stale execution errors are separate terminal/attempt metadata, no fake applied result |

All relations default intended RESTRICT on history/identity; no cascade wiping history. Keep existing Run/Invoice/Claim uniques. These are logical target keys, not a validated Prisma diff; no claim nested relation defaults will choose safe update ordering. Deferrable generation/current projection guards and custom SQL complement Prisma, not generated automatically by it.

**CAS meanings:** G2 client intent identifies `expectedLatestGenerationId` (base, including NEEDS_INFORMATION) **and** `expectedAppliedGenerationId` (may NULL). Under Run lock compare null-safely `IS NOT DISTINCT FROM`; require no pending and not issued. Increment generationNo monotonic (overflow rejects, no reuse), set latest/pending in same admission. At apply require pending=this G, latest=this G, currentApplied still expectedApplied, sourceEpoch=capturedEpoch and semantic source fingerprints valid; then project/currentApplied/result/pending=NULL atomically. Two keys same expected base cannot both admit; rejected loser does not get a phantom accepted G or overwrite reason/hash. Abandoned pending generation needs reviewed authorized failure/recovery path, not TTL auto replacement.

**Insert/bootstrap order:** Run pointer FKs nullable MATCH SIMPLE with explicit coherence guards, not MATCH FULL. Tenant gate protects absent logical Run; after fresh dependency discovery capture c/V/input hash, insert new Run with required existing policyVersionId/inputSnapshotHash and preparing/needs-info state plus NULL pointers, then G→Source, seal G, then set latest/pending. Never insert fake policy/hash merely to satisfy current required Run fields. Existing Run.lock path remains above; no pending pointer before referenced G exists, no READY run without applied result. Counter generationNo allocation/current projections in same TX; potential cyclic back-relations and exact composite nullability require S/PG validation.

INITIAL requires latest/currentApplied NULL and no invoice; a different key for a second INITIAL on an existing run does not mint G2. Subsequent admission must be explicit RECOMPUTE with reason/base/current expectations. INITIAL and RECOMPUTE share BILLING_GENERATION key namespace; reusing opaque K1 with a different mode/body is a hash conflict, not an acceptable “new key” hidden behind operationType.

### D.4. Protocol and immutable evidence across phases

```text
D1 admit INITIAL or explicit RECOMPUTE:
  common C locks/current authority; idem lookup BEFORE rejecting already-issued replay
  same key/hash -> historical receipt/state/result; never recapture
  enforce month closed, canonical run, expected latest/applied CAS and no pending
  require invoice absent or DRAFT (not cancelled-after-issue)
  c = DB clock after gates; pin calculation policy V at c, frozen z
  capture full source SET/revisions/lineage/eligibility; resolve each PriceRule at session local date
  seal G+Source rows+sourceSetHash with receipt and job enqueue atomically
  complete capture -> PREPARED/latest/pending; missing -> NEEDS_INFORMATION/latest, no pending/apply
  commit receipt; G input/price/policy/clock evidence now immutable

D2 apply same G:
  optional pure compute outside locks from sealed inputs; no external services
  reacquire C locks, current rights, optional job fencing E.3, current pointers/sourceEpoch
  re-read entire source set and semantic price/eligibility facts at pinned source dates
  mismatch -> persist STALE/current run invalidation in allowed atomic path, no projection writes
  valid -> exact arithmetic HALF_UP once invoice end, sibling10% only P0
  materialize/update SAME logical draft + lines/discount projection + applied G/result/diff
  set Run.currentApplied=G, pending=NULL, policy/hash/state coherent
  named final guards; audit/receipt/job completion iff effect committed; commit
```

**Immediate-FK draft replacement order:** lock invoice and existing mutable lines/discounts; require no issued claim/history reference that forbids replacement; remove old draft projection children first, update same Invoice.generationId/policy/totals to G2, insert G2 lines/discounts, then move Run.currentApplied/pending and finalize G result before named deferred coherence checks. Keep G1/Source/result intact. Do not update invoice generation candidate key while old lines still reference it with RESTRICT and expect deferred FK magic; current identity FKs stay immediate. Historical G result references stable GenerationSource identities/content, not a required FK to deleted mutable draft line IDs. Any mid-rebuild failure rolls the whole projection change back.

For application `NEEDS_INFORMATION` admission G input seal contains explicit missing-source facts, replay returns that historical missing result even after data repaired; G2 new command reads repaired source. Ordinary backdated tariff repair remains forbidden by O-12; approval of D does not authorize it. Source invalidation increments Run.sourceEpoch and blocks issue, including new participant/override inserts absent in G1; future bounds/updatedAt changes not affecting semantic selected d/value do not invalidate by themselves. Approved changed calculation policy may alter net on G2 request; unchanged source/tariff never changes unit price merely because c2 is later.

G2 fails transiently: old G1 applied result/current pointer remains readable as **historical/stale view**, not issue-ready; pending G2 retried same sealed payload under budget. G2 terminal FAILED/STALE clears pending with guarded receipt/attempt/audit; latest remains G2, currentApplied may remain G1 but run not READY. New G3 explicit baseG2/expectedAppliedG1 required; no silent fallback ISSUE G1. Applied G1 later invalidated remains immutable APPLIED history; run state and append-only invalidation audit carry current staleness. Retry G1 after G2 applied only returns G1 historical result, no write-back.

ISSUE uses D current applied pointers and immutable line projections, source set/hash+semantic recheck and O-02/03 metadata; creates claims only at ISSUE, never during PREPARED/apply. Missing/ambiguous PriceRule→NEEDS_INFORMATION; confirmed attendance except approved CANCELLED branch; exact `ROUND_HALF_UP(SUM(units*unitPrice)*discountFactor)` at end; amounts JSON decimal strings. No prepaid/comboP1, no automatic issue.

### D.5. Canonical serialization/hash and collision behavior

**PROPOSED contract v1:** UTF-8 canonical JSON with schemaVersion; keys lexicographically sorted by fixed Unicode code-point ordering (implementation must name/test canonicalizer), reject duplicate keys/non-finite numbers; typed object property names ASCII; do not Unicode-normalize arbitrary free text silently. UUID lowercase canonical; DATE exactly YYYY-MM-DD; UTC timestamps explicit Z, six fractional digits for DB instant snapshots (driver precision preservation required); VND/Decimal/BigInt as canonical strings, no JSON monetary number/exponent/negative0; absent vs null normalized by declared schema, not guessed. Source arrays sort by participantId, candidate arrays by tier/target/ruleId; no locale sorts. Unknown fields rejected at command boundary; versioned evidence upgrades append a new encoding/artifact, never rewrite old sealed bytes.

`requestHash=SHA256(domainTag + canonical intent)` includes tenant/op/student/period, filters, explicit reason/base/applied expectations and **intent principal binding**. Does not include generated IDs/clocks, worker instance, attempt, lease, correlation/request delivery ID. Worker loads stored original intent rather than recanonicalizing itself as a new principal; current executor attribution separate. `inputHash` covers captured source-set/per-row hashes/discount/V/z/c/schemaVersion; `resultHash` covers final values/diff/reference IDs. Hash is integrity/corruption detection, not signature/authority and not a substitute for content. Same typed key/different canonical request rejects; even same hash with different stored canonical bytes rejects/quarantines suspected collision, never overwrite. Hash of JSONB textual output alone is not portable canonical bytes; store canonical payload bytes/text or deterministic canonicalizer version and hash them consistently.

### D.6. Backfill and minimal R1b contract

No DB rows inspected. Do not infer old charge admission time/policy/original class/course from today's tariff/enrollment, current now(), worker timestamp or invoice.createdAt. Future authorized inventory classifies empty DB; provable DRAFT; unprovable DRAFT; ISSUED/claimed legacy. Empty DB: seed clean typed model through reviewed migrations, not assumed today's DB. Provable drafts can attach explicitly labeled legacy evidence with source proof/reason; incomplete drafts require reviewed invalidate+new command, never fabricated G1. Issued legacy snapshots/price/claims untouched even if historical B-price differs A; migration provenance status/nullable legacy refs or separate legacy record must be selected **before** NOT NULL/FK validation. No fake complete G/result from totals alone. Freeze marker backfill proves original z and source date attribution; contradictions quarantine/manual review, not shift invoice month. Immutable evidence retain protected references when FK coverage expanded; restore forward-fix rather than destructive downgrade deleting issued history.

**R1b minimum:** keep R1a keys; propose only Tenant.timezoneFrozenAt PSL addition (actual schema lacks it), BillingPeriod shape CHECK, actual source/student/month/inverse/history guards and C gateway/security/tzdata/precheck contract. Existing sourceSnapshotJson can hold server-derived z/date/revision versioned evidence; live frozen Tenant/session join is month authority. R1b need not add full G/Source/pointers/financial receipt. Until R2 exists, source mutation that would invalidate an existing draft must mark blocked through an approved minimal state adapter or reject; no half-implemented auto recompute or falsely READY invoice. Select that adapter in G checklist, no service call needed to “repair later”.

Full relational G/Source, Run.sourceEpoch/pointers, new Line generation/source fields and Invoice.generation FK, JSON/result sealing/diff and worker integration belong R2. Indices target Source `(tenant,participant)`, `(tenant,session)`, G `(tenant,run,no)`/state and inverse source queries; existing Line `(tenant,session)` usable R1b. Actual query plans/write overhead/Prisma circular back-relations and upgrade-safe nullable stages remain S/P validation requirements.

## E. O-13 Technical Review

### E.1. Per-domain transition and required-fields matrix

Recommendation: giữ enums hiện có khi phù hợp; text statuses dùng CHECK allowlist riêng từng bảng + named transition guards, không một WorkflowStatus cho mọi domain. Các tên Run/G/Attempt mới là **PROPOSED / PENDING_APPROVAL**, không giả đã tồn tại trong schema. Foreign references, required fields và allowed update columns được kiểm cả child/inverse parent dưới C, không chỉ UI status.

| Domain | Allowed transition / required fields | Rejection / history rule |
|---|---|---|
| Tenant timezone | Configurable→frozen cùng first Series/Session(any status)/Period/Run/G; frozenAt DB instant, timezone valid and original z retained | No frozen→unfrozen, reset marker, historical zone change, even Ops. Before-source change requires verified Ops actor/reason + expected z/CAS under gate |
| BillingPeriod | Proposed OPEN→CLOSED khi local nextMonthStart reached and command verifies cutoff; month bounds/id/tenant immutable after create | State label cannot override clock/source completeness. Initial draft before closed month reject; not an automatic job-authority exception |
| BillingRun projection | EMPTY→PREPARING→READY; missing→NEEDS_INFORMATION; draft source change→STALE; new pending G→PREPARING; successful G2→READY; ISSUE→ISSUED frozen basis | READY iff applied result valid, pending NULL, epoch matches and source checks pass. ISSUED history cannot reopen for recompute; after-issue source correction is append-only follow-up, no live-epoch revalidation rewriting financial basis |
| Generation admission | Unsealed transient input assembly→PREPARED or NEEDS_INFORMATION in one admission TX; required seal/c/key/hash/V/z/epoch/owner/snapshot | No committed unsealed input. Captured child set sealed before commit; complete vs incomplete fields explicit; no mutable late source append |
| Generation execution | PREPARED→APPLIED/STALE/FAILED; APPLIED requires result/diff/hash/appliedAt and atomic projection. Transient retry can stay PREPARED with separate attempts | APPLIED/NEEDS_INFORMATION/STALE/FAILED terminal input/history retained; no same-G refresh/reopen, no APPLIED→superseded rewrite. New explicit G handles new input |
| Invoice | DRAFT→ISSUED; issued metadata number/actor/time/due/G/snapshot + complete claims. Cancellation after issue through approved APPLIED adjustment | No ISSUED→DRAFT or cancelled-after-issue→recompute; status CANCELLED does not erase was-issued history, numbers/payments/claims |
| InvoiceAdjustment | PROPOSED→APPLIED or REJECTED; APPLIED only valid manual approval/root receipt/O-05 ledger reconciliation | APPLIED immutable; no root effect without approved payload/target/current rights; F O-05–07 still pending |
| Payment/reversal | Append payment+full same-invoice allocation; one full reversal/payment, current authority/required approval/reason/audit | No amount mutation/delete, partial reversal or automatic refund/credit; resolved balance derived, not status bypass |
| ApprovalRequest/Decision | DRAFT/NEEDS_INFORMATION→PENDING_APPROVAL; decision→APPROVED/REJECTED/NEEDS_INFORMATION; APPROVED→COMPLETED only effect+receipt atomic | O-07=B RECOMMENDED; APPROVED remains on execution failure, attempt outcome separate. Rejected/completed terminal; resubmit retains previous decisions with reviewed decision round/body pin |
| ClassSession/Participant | DRAFT→CONFIRMED→COMPLETED; future valid reschedule/cancel, revision/booking/roster coherence and C gates | No past/issued source reparent/time rewrite; historical attendance correction separate. No P1 MAKEUP use via enum slot |
| Attendance/finalization | Draft record optional finalization; confirm full roster under same session/teacher/current scope. Normal edits lock min(end+48h,issue) | Finalization/record/session FK R1a not completeness proof; after-lock authorized correction append, no issued invoice rewrite; CANCELLED exception retained |
| AutomationJob | READY→RUNNING requires claim owner/until, incremented monotonic fence/attempt; RUNNING→COMPLETED/READY/NEEDS_INFORMATION/PENDING_APPROVAL/FAILED | COMPLETED iff durable result/effect consistent; READY transient retry only within approved budget. Need-info/approval no infinite retries, current permission required |
| JobAttempt | Insert STARTED/finishedAt NULL; one-time STARTED→SUCCEEDED/TRANSIENT_FAILURE/BUSINESS_BLOCKED/FAILED/ABANDONED with finishedAt≥startedAt and safe error | Only unfished→terminal whitelist UPDATE once, identity/time-start/fence immutable, no terminal UPDATE/DELETE; recovery finishes abandoned once under job lock |
| OutboxEvent | NEW→PROCESSING→DONE **inside one DB-only consumer TX**, not committed PROCESSING; failed attempt rollback then separate safe retry/error metadata | Event identity/payload/occurredAt immutable; notification effect+dedup+DONE atomic; old committed PROCESSING requires reviewed recovery inventory |
| IdempotencyRecord | Receipt created with accepted intent/admission; pending→terminal result/status once; typed key/hash/input binding immutable | Same key/hash historical replay only after auth; different intent reject; expiresAt never permits purge/reuse financial key |
| AuditLog | INSERT-only for domain success; separate STARTED/FAILED/RECOVERED events for attempts when appropriate | No runtime UPDATE/DELETE/TRUNCATE, no plaintext tokens/OTP/password; denial logs do not become execution authority |

R1b can use minimal existing Run.state `STALE` + errorReason/source invalidation interface **only after** targeted O-13 state allowlist/issue deny guards approved. If this minimal adapter not implemented, block/reject affected mutation instead of leaving invalid final lines; full G lifecycle remains R2. States of payments are derivations from immutable ledger, not a new generic status model.

### E.2. Actor, authorization and database-role matrices

**Proposed AuditLog extensions:** `jobId?`, `jobAttemptId?` (same-tenant FKs), `workerRef? TEXT`, `operatorRef? TEXT`. Existing actorUserId/actorMembershipId remain; optional original initiator in sealed job/G intent, not impersonated as current executor. Add candidate Membership `(tenant,id,userId)` and composite actor coherence reference or reviewed inverse guard. Exact fields/FK actions require S validation. Audit actor shape is not a permission grant.

Audit job/attempt consistency requires proposed JobAttempt candidate `(tenantId,jobId,id)` and matching composite reference, not two independent tenant FKs. Proposed immutable `JobAttempt.workerRef` captured at claim binds audit executor to that attempt, not current mutable Job.leaseOwner after reclaim. System authority needs proposed typed `AutomationJob.authorityKind=MEMBERSHIP|SYSTEM` and server-issued allowlisted systemAuthorityCode when actorMembershipId NULL; current nullable actor field alone is insufficient proof. These extensions are design deltas, not existing fields or a generic platform role.

| Actor kind | Required identity / current authorization | Must not do |
|---|---|---|
| USER | Verified authenticated user + same-tenant membership; membership.userId must match actorUserId; current active user/membership/permission+TENANT/CLASS/STUDENT scope | Supply arbitrary actor IDs from body; use old JWT permission claims to bypass current DB state; cross-tenant scope |
| WORKER delegated | workerRef + persisted job/attempt/fence; audit actorUserId/actorMembershipId NULL to identify machine executor; original intent principal stored on job/G; recheck that delegated principal/grant still valid + job allowlist | Use worker DB role as universal finance/Teacher permission; fabricate human actor or change root intent/pricing/policy when reclaimed |
| WORKER system | workerRef/job/attempt; explicit internal SYSTEM authority in trusted job metadata for permitted schedule-check/draft automation only, tenant-specific policy/correlation | Manual approval, issue, transfer/substitution, unrestricted PII queries, arbitrary null-actor jobs treated as allowed. Proposed typed authorityKind/grant evidence needs review |
| OPERATOR | Verified Ops credential/operatorRef and reason/correlation; actorMembershipId NULL, actorUserId only actual global identity when available; limited config-before-source/maintenance functions | Implicit tenant Manager/financial rights, frozen-zone override or spoof pending bootstrap beneficiary as authorizer |

| DB role / proposed separation | Allowed | Explicitly denied / validation |
|---|---|---|
| `educore_api` | CONNECT, USAGE reviewed schema, EXECUTE scoped query/business gateway signatures | Raw protected-table DML, arbitrary owner-role SET ROLE, CREATE/ALTER/TRUNCATE/TRIGGER, broad tenant reads, PUBLIC unsafe helpers |
| `educore_worker` | Narrow claim/run/fenced effect/DB-outbox functions; reads minimum sealed authorized payload | Manual approval/issue/financial resolution or direct DML; role alone not authority |
| `educore_gateway_owner` NOLOGIN | SECURITY DEFINER owner, minimum SELECT/DML required by reviewed functions, no DDL | Runtime login/inheritance, superuser/BYPASSRLS/CREATEROLE; no PUBLIC CREATE schema path |
| `educore_table_owner` NOLOGIN | Own objects; migration-only controlled SET ROLE | Membership granted to API/worker; use as app credential |
| `educore_migrator` | DDL/ownership transition only in reviewed maintenance/test/release task | Stored in API/worker config; uncoordinated live schema changes/history rewrite |
| `educore_retention` / recovery operator | Only reviewed archive/recovery function with eligibility/barrier/audit/approval, no financial dedup purge by default | Blanket DELETE/DROP partition/TRUNCATE, source repair by force-setting success, automatic action inferred from actorKind |
| Database owner / restore admin | Break-glass backup/restore/deployment under authorized process | Claim SQL guards protect against owner bypass. Immutable means protected operational boundary + backups/audit, not impossible superuser tampering |
| Disposable fixture role | Direct table writes for negative FK/trigger tests in test DB, no prod credentials | Used as runtime or evidence that runtime authorization was tested |

Negative auth/privilege cases H: raw Prisma nested write/direct SQL denied; helper EXECUTE PUBLIC denied; cross-tenant or mismatched actor USER rejected; worker missing job/attempt/fence/revoked principal denied; system job cannot manual approve/issue; Ops cannot change frozen z; temp schema/type shadow cannot redirect function; API role cannot SET ROLE migrator or delete terminal rows. Gateway still trusts verified backend principal as C.5 explicitly states; a forged user argument cannot be ruled out against a fully compromised trusted backend by a mere CHECK.

### E.3. Job fencing, bounded retry and manual-recovery clarification

**Recommended fenced automatic cycle:** claim transaction enters C, locks job, verifies due/state/lease expired; increment AutomationJob.attemptCount **monotonically, never reset**, set leaseOwner/until, insert JobAttempt with attemptNo equal new count, STARTED, commit. Compute outside locks. Effect transaction enters C and locks job at rank2; require status RUNNING, attemptCount=claimedNo, matching owner/current attempt, lease valid at entry and finalize check, pinned intent/G, current auth and CAS. Hold job row through effect/receipt/job completion; reclaimer cannot advance fence while effect commits. Lease time alone is not fencing. W2 reclaim after W1 expiry finalizes unfinished old attempt ABANDONED once, increments count, then W1's old token is rejected even if W1 has approval/G payload.

Atomic completion: business effect + typed receipt/G apply/current projection + Job COMPLETED/result + current attempt success + audit same TX. If COMMIT response lost, re-enter and reconcile receipt; don't mark FAILED before outcome known. If failure TX rolls back, separate locked reconciliation/attempt failure TX can finalize failed attempt and schedule next retry; if current fence changed meanwhile, old worker cannot write failure over W2 success. A process kill can leave STARTED; recovery reconciles committed receipts before ABANDONED. Policy/G/requestHash never repinned by attempts; missing/stale input requires approved new G, not manual retry recapture.

**Actual unresolved manual recovery detail:** DB Design §3.8 caps `attempt_count<=4` lifetime, while UC-37 permits authorized manual rerun after FAILED. It is unsafe to reset attemptCount (ABA/stale token reuse) or create a second root job/effect with a different operationKey. **Recommendation for owner approval:** automatic cycle remains initial+3 at1/5/15; add proposed Job `retryCycleNo`, `cycleAttemptCount`, Attempt `retryCycleNo/cycleAttemptNo`, and durable manual-retry receipt binding new retry command key/reason/current authority to SAME root operationKey/G/policy. Lifetime attemptCount remains monotonic fence; manual cycle start advances cycle number, resets only cycleAttemptCount, never lifetime fence. Each automatic cycle ≤4; exact allowed manual recovery action requires permission/reason/expected current failed-cycle CAS, no automatic repeat cycles. New source/policy or terminal stale/missing G cannot be refreshed by manual retry; explicit new business command/G2 required.

This **RECOMMENDED / PENDING_APPROVAL** interpretation requires explicit source/DB job constraint amendment in a later authorized task if accepted; it is not claimed as existing baseline. If not accepted, keep current lifetime4 and leave after-exhaustion manual-cycle route blocked pending disposition, not silently implement it. Neither choice changes initial+3 automatic baseline or allows repeat financial effect. Does not block independent R1b period guard; blocks full job/manual recovery runtime contract and related R2/R4 DDL.

### E.4. Outbox, mutation versus history

**DB-only outbox default:** candidate discovery advisory, enter rootS→tenant→event row lock at rank2; verify event immutable payload/current recipient scope; materialize permitted P0 in-app notifications using existing UQ `(tenant,outboxEvent,recipient,kind)` and mark DONE in same short TX. PROCESSING is transient within TX; crash rollback yields NEW/no effect, post-commit ACK loss yields DONE/existing dedup, no duplicate. No committed PROCESSING lease needed for this selected path. Failure after rollback may record safe attemptCount/availableAt/FAILED in separate gated TX after checking event still not DONE. Persistent failure retries follow bounded Q-13; no email business notification or external delivery P0. If work must span external I/O/long compute, claim/lease/fence extension becomes a separately reviewed alternative, not enabled by this contract.

| Data | Mutation allowed | Immutable boundary / guard |
|---|---|---|
| Tenant/source identity/history | Before-source z change; future schedule/revision; authorized attendance correction | C1 sticky; original student/session/class-course lineage/issued used time not reparented; correction append record |
| Run/current draft | States/pointers/epoch, replace allowed mutable draft projection by explicit G2 apply | Owner tuple stable; cannot issue stale or delete G/Source history when replacing draft lines |
| Generation inputs/Source rows | Assemble only admission before input seal | After seal INSERT/UPDATE/DELETE source proof forbidden; result set once with permitted terminal transition, attempts separate |
| Issued Invoice/Line/Discount/Claim | Financial corrections via approved append-only adjustment/reversal | Header totals/date/G/number/price snapshots/claims frozen, claim never released after cancellation |
| PriceRule/PolicyVersion | Future tariff publication/future bound close preserving historical selection; baseline policy new version under controlled process | No historical amount/target/backdate/override; used policy config/version/hash immutable; no same-request repin |
| ApprovalDecision/ExecutionReceipt | Append valid decision rounds/root receipt | Approved body/hash/decision/receipt immutable; no completion without exact root effect |
| Job/Attempt | State/lease/monotonic count, one terminal finish for unfinished attempt | Intent/key/G/policy unchanged; terminal attempt no update/delete; old worker not allowed to finish new fence |
| Outbox/Notification | Execution metadata only; notification readAt permitted scoped update | Payload/identity/event time/dedup key immutable; no dispatcher DELETE effect/ledger or impersonated user |
| Audit/financial Idempotency | Append audit; receipt pending→final result metadata | No runtime delete/purge/key reuse; failed attempt logs separate from rollback success audit |

### E.5. Retention & recovery matrix

| Object | Retention recommendation / authority | Recovery contract / evidence needed |
|---|---|---|
| Financial typed keys/receipts/issued claims/G history | **No automatic TTL/delete** in P0; expiresAt not purge authority, typed key namespace never reused. Any future compaction must preserve durable no-reexecution tombstone + explanation with approved policy | Backup restore preserves receipt/effect/source UQs; replay after restore must lookup before effects. Restored DB may lack acknowledged later writes: quarantine/reconcile external acknowledgements under authorized recovery, not assume exactly-once across data loss |
| Draft/failed generations | Retain immutable accepted inputs/results/missing/stale proof; no deletion schedule invented | New G references history, reconstruction from canonical payload/hash; lost/unprovable inputs not reconstructed by current tariff |
| AuditLog | Baseline **24 months**, no app DELETE; recommend no automated purge in this slice until controlled retention/legal/PII/backup policy approved | Archive/restore scoped/restricted, redact at write; after24 months is eligibility review, not instruction to erase linked finance history |
| Job/attempt/outbox dedup | Durable identity/fence/result; retention horizon **pending Ops**, no arbitrary TTL | STARTED/RUNNING expiry reconcile receipt then terminal/retry; queue/effect ACK atomic, stale worker fenced; dead letter visible to authorized Manager |
| Approval/effect/ledger/excess | Immutable decisions/root receipts/ledger/movement history; no financial purge schedule invented | Restore exact financialRevision/remaining chain/receipt, no double-count allocation+reversal, mismatch quarantine rather than auto-create money |
| C1/source lineage | Freeze marker/original z/derived dates/evidence retained; tzdata upgrades controlled | Check old/new month/DATE fixtures before rollout, do not reinterpret historical snapshots; source provenance repair reviewed separately |

**SQL guard recommendations summary:** typed UQ/FKs and row CHECK for shape/ranges; history UPDATE/DELETE/child-insert whitelist by state; immutable monthly/issued identities; sticky C1 on source insert and Tenant update; named deferred inverse period/current-G/result/claim completeness guards; attempts unfinished→terminal CAS; job fence/state/result coherence; actor shape/coherence; PUBLIC/default grant inventory and no raw runtime DML. Guards must themselves use qualified safe SQL under C's entry, not acquire tenant late after caller DML; disabling triggers/replication bypass denied to runtime. No generic `status!='DRAFT'` freeze across all domains, no CHECK(now()) to implement transitions, no partition detach bypass retention. R1b introduces only minimum guard/state surface; full fields/states E for R2/R4 remain pending.

## F. R2 Secondary Decisions

All recommendations below remain **PENDING_APPROVAL** for the remaining choice; Group A/O-12 invariants already approved are not reopened. Location links to detailed existing options: [Plan §4](SCHEMA_REMEDIATION_PLAN_P0.md), [DB Design](../../../design/database_design.md), [UC-26/34/37](../../../requirements/usecase/specification.md).

| ID / authority | Open choice → unique recommended default + rationale | Exact dependency / missing evidence / status |
|---|---|---|
| O-02 T+B/Ops | Counter row `(tenant,localIssuedYear,nextValue)` increment/number/ISSUE in same TX; year from frozen tenant-local issuedAt; retain Group A `INV-{YEAR}-{SEQUENCE}`, **decimal sequence without imposed minimum padding**, no reuse of committed number, no legal gapless promise. Sequence alternative not chosen due lifecycle/gaps | No R1b month guard blocker; blocks counter/number/ISSUE DDL R2. Resolve DB Group A/§9 prose conflict and approve display/year defaults; new model/check/overflow + year rollover/rollback/replay/catalog tests **PENDING_APPROVAL** |
| O-03 B | DueAt **+7 tenant-local calendar days, same local time**, persist UTC and z on issue; equality at dueAt not yet overdue, now>dueAt overdue. Alternative EOD changes payable interval so not default; elapsed168h differs at DST | Does not block R1b C1/month math; blocks due/ISSUE runtime contract R2. Owner cutoff approval, leap/month/year and supported-zone DST ambiguity fixture required; no new CHECK(now()) **PENDING_APPROVAL** |
| O-05 T+B+S | Plan §4.5 signed reconciliation+allocations, immutable positive case opening/remaining projection/financialRevision; offsets FIFO(createdAt,id), RECONCILED distinct RESOLVED. `E=max(P-N,0)`; sum remaining=E, no double-count allocations/reversals. **No RESOLVED action while E>0 without approved real ledger effect; no automatic refund/credit; ordinary P0 resolutionKind allowlist empty until separately authorized**. Recommend manual approval for full payment reversal due financial risk, retaining full-reversal baseline | Not a R1b blocker; **blocks excess/reversal schema/cardinality/state/effect R2**. Approve FIFO/status/authority semantics and source shapes; E1–E13 numeric/race/restore proof, fields/UQ/guard plan/backfill/queue correctness missing **PENDING_APPROVAL** |
| O-06 B+S | Allow evidenced manual cancellation of issued unpaid/partpaid/fully-paid/attended invoices through approved adjustment `delta=-currentAdjustedNet`, retain original history/claims/payment, reconcile excess atomic. Do not blanket forbid paid cancellation contrary UC-26; reject post-cancellation increase until reinstatement contract separately opened | No R1b; blocks cancellation/ledger lifecycle R2. Owner approve reason/eligibility/authority/default delta, self-approval audit exception preserved. Need prior-adjustment/cancellation/idempotency/excess fault tests **PENDING_APPROVAL** |
| O-07 T+B+S | **B: committed manual APPROVED D1, synchronous explicit execute E1**; E1 effect+same-target/body/root receipt+COMPLETED+audit atomic. Transient failure keeps approval, records attempt separately, recovery presents approved-unexecuted to authorized executor; no auto execute from a scan. One root receipt/request; C only for separately approved long async route, A rollback decision not default | Does not block period guard; **blocks financial receipt/execution/completion R2/R4**. Resolve DB same-TX conflict before implementation; approve route/failed presentation/resume authority. Need exact receipt FK/XOR/source target + two-key/unknown-commit/crash tests **PENDING_APPROVAL** |
| O-10 T | Widen raw discount NUMERIC to **(25,6)**, checked BigInt/Decimal exact intermediate SUM/product before cast, positive/range/identity checks and JSON strings. Gross5 sibling10% ⇒ raw0.5, netHALF_UP4.5=5, discountVnd0; not rounding discount separately. No new business ceiling | No R1b; blocks financial precision schema/DDL R2. Need reviewed field diff/native limits/SUM-overflow/large-string fixtures; `(25,6)` representability alone not arbitrary aggregate overflow proof **PENDING_APPROVAL** |
| H-01/source lineage T+data owner | Keep existing FK ownership and add reviewed cross-row source/enrollment/class/course + inverse history guards, capture typed original chain/evidence at admission; don't use current enrollment after transfer. Prefer this minimal guard approach over duplicating every academic link solely for R1b; FK extensions if demonstrably required are separate reviewed diff | R1b needs minimum immutable source/parent identity and precheck; full lineage validity blocks R2 pricing/source closure, not isolated local-month formula review. Existing unprovable/legacy rows require inventory/quarantine/approved backfill, not invent history; no DB inspected **PENDING_APPROVAL** |
| API/R4 T+S | New recompute remains application command contract; route/permission/DTO/error/CAS fields selected in dedicated API review; no endpoint invented. Root generation admission+job atomically pin same policy, current auth/durable dedup/audit/fencing; static permission catalog invariant stays | Does not block independent R1b period DDL design; required persistence interfaces before affected R2 DDL and runtime/API before feature ready. Need endpoint/state permission review + actual API/jobs/security tests; no public worker route **PENDING_APPROVAL** |

For O-05 proof obligation: every committed financial revision computes separate aggregates N/P before/after; exactly one deltaE, positive opens case, negative FIFO offsets remaining, zero creates reconciliation without fake0 case. `SUM(case.remaining)=E`, pending iff remaining>0, reversal removes payment allocation once (not subtract reversal twice). Queue/header reads same snapshot/revision. Permission/approved revision/hash mismatch fails whole financial TX; recovery can't synthesize adjustment just to fix pending. Approval of O-01/O-04/O-13 does not choose these financial business semantics.

## G. R1b Design Readiness

Status vocabulary applies **per obligation/gate**, not one overall DONE. ALREADY APPROVED means business or historical authorized scope only; REQUIRES POSTGRESQL VERIFICATION means no actual P evidence. Current schema metadata read today is not fresh Prisma validation.

| Obligation | Current assessment / exact required delta | Status |
|---|---|---|
| A=A/B1/C1/D + Group A | Session-date price/month/frozen z, same-key G/new intentional G, one logical invoice/permanent claim, no P1 expansion | **ALREADY APPROVED** business |
| R1a identities | Existing required AR.sessionId/IL.studentId, composite keys/FKs and optional finalization remain; historical S evidence report | **ALREADY APPROVED** local scope; **REQUIRES POSTGRESQL VERIFICATION** |
| Period shape/attribution | BillingPeriod month first/next bounds CHECK; line child and inverse parents, explicit tenant zone conversion/OLD+NEW final rows | **RECOMMENDED / PENDING APPROVAL** C; P still **REQUIRES POSTGRESQL VERIFICATION** |
| C1 storage/guard | Proposed Tenant.timezoneFrozenAt optional PSL field; atomic first-source/freeze, sticky no clear, valid z/expected change before source | **RECOMMENDED / PENDING APPROVAL**; **BLOCKED BY DEPENDENCY** Ops/backfill/z provenance |
| Source/lineage history | Prevent past/issued re-key/time/class/course/student change; correct participant ownership; current enrollment not history | **BLOCKED BY DEPENDENCY** H-01 minimal guard/data precheck; full pricing chain R2/R3 |
| Shared gateway/lock order | C root fence/tenant/ordered locks + safe grants/helpers; queue/identity writers participate, fresh RC statements | **RECOMMENDED / PENDING APPROVAL** O-01/O-13; **REQUIRES POSTGRESQL VERIFICATION** |
| Mutation invalidation adapter | R1b minimal reviewed Run.state STALE/errorReason + issue deny/parent guards, or reject mutation while no adapter. **Recommend minimal STALE adapter; no G1 rewrite/automatic G2** | **RECOMMENDED / PENDING APPROVAL** O-13 state/guard; runtime adapter implementation separately authorized |
| Minimum evidence | Trusted existing sourceSnapshotJson schema version/z/date/source revisions; derive from live frozen source for month, not JSON authority | **RECOMMENDED / PENDING APPROVAL** O-04 minimum; full hybrid G/Source belongs R2 |
| Prisma delta | R1b proposed Tenant marker/back-relations unchanged plus custom-SQL inventory; keep R1a keys/actions; no G/Counter/Receipt added just for month guard | **RECOMMENDED / PENDING APPROVAL**; S NOT IMPLEMENTED |
| SQL/function/privilege delta | Period CHECK; child/inverse/C1/history/state guards; source insert freeze; entry/global fence/safe function ownership/grants + tenant/source lookup indexes | **RECOMMENDED / PENDING APPROVAL**, P NOT RUN; not expressible by Prisma validate alone |
| Precheck/backfill | Authorize test-data inventory before required constraints, classify mismatches/zone/history, staged validation/quarantine, no fake defaults | **BLOCKED BY DEPENDENCY** approved data strategy/DB access, not permission inferred from this report |
| Migration/rollback/restore | Fresh DB target/PG version/extensions/roles, existing-data upgrade and failure boundaries; restore forward-fix preserving claims/history | **REQUIRES POSTGRESQL VERIFICATION** after specific migration/test authorization |
| Security/negative permissions | Raw SQL/nested DML blocked, helper/temp-path/actor/worker/owner separation; no bypass grant | **REQUIRES POSTGRESQL VERIFICATION** plus R4/API auth tests |
| D / S / P / R | D pending owner technical choice; S future approved schema/client diff; P actual DB tests; R service/job/auth/API integration | **RECOMMENDED / PENDING APPROVAL** D; S/P/R not passed for R1b |

O-02/03/05/06/07/10 **do not block** independent R1b month/freeze/parent design. They block exactly F's financial pieces later. R1b not feature-ready while R4 authority/mutation adapter unimplemented; no SQL period guard without source writer/privilege boundary can be called safe. No circular requirement “implement all R2 to review R1b”; approve shared interfaces now, implement only an explicitly opened slice later.

## H. PostgreSQL Verification Plan

**All H-01–H-40 below: NOT RUN.** These IDs are this proposal's tests (**TS-Hxx**), not audit finding IDs. Required environment: separately authorized disposable PostgreSQL target/version/extensions, actual reviewed migrations and role fixtures, ≥2 independent DB connections A/B with explicit barriers and transaction states recorded. No mock, sleeps-only orchestration or Prisma validate as concurrency proof. Role names/DDL/functions are proposals, not executable files added today.

For each case record: source Git/schema/SQL hashes, DB server version/isolation/TimeZone/tzdata/roles, exact setup/commands, A/B begin/wait/release/commit order, SQLSTATE/constraint names, before/after rows/receipt/claims/epoch/audit and invariant queries; rollback cleanup only disposable fixtures. Expected success/reject are **acceptance assertions**, not PASS claims. Cover order reversal, COMMIT and ROLLBACK winner, connection loss. Privileged test fixtures deliberately bypass service only for testing guards; runtime cases use gateway.

| Test | Setup / action / A-B interleaving or fault | Expected assertion | Scope | Status |
|---|---|---|---|---|
| TS-H01 | Fresh apply on empty disposable DB, target version+btree_gist+roles; repeat deployment no drift | Catalog FK actions/candidate UQ/CHECK/GiST/triggers/grants exactly reviewed; no accidental P1 or PUBLIC write | Migration | NOT RUN |
| TS-H02 | Line student/session/finalization same/wrong/NULL plus nested Prisma integration | Wrong student/session23503, optional draft finalization valid; nested operations respect privileges, not just types | R1a/R1b | NOT RUN |
| TS-H03 | A holds tenant gate/source mutation; B gateway starts while A uncommitted then A commit/rollback | B waits then reads new committed state or original after rollback; skipping client enter still gateway enforces fresh internal reads, no stale CTE/STABLE read | O-01 | NOT RUN |
| TS-H04 | A line insert/UPDATE correct Sep; B inverse parent date/period/student/zone mutation | Correct local-month valid; illegal identity/frozen change reject; wrong final period cannot commit even line not updated | R1b | NOT RUN |
| TS-H05 | Start30/09 23:30→01/10 00:30; Oct1 00:00; UTC Sep30 18:00; leap/month ends | Start-local month/date only; no split/UTC-month; bound `[monthStart,nextMonthStart)` | R1b/O-12 | NOT RUN |
| TS-H06 | Draft line temporarily wrong month then fixed/deleted before SET; wrong student intermediate | Deferred final valid accepted, retained wrong period reject; FK wrong student rejects immediately | Guard timing | NOT RUN |
| TS-H07 | A first Series/Session(DRAFT)/Period/Run insert; B pre-source timezone config; both orderings | Config wins then source reads new z/CAS; source wins config denied; first-source rollback rolls back freeze | C1 | NOT RUN |
| TS-H08 | Cancel/delete last source then Ops clear marker/change z/re-key Tenant | Sticky freeze persists, all ordinary bypasses denied, no reinterpret dates/history | C1/negative | NOT RUN |
| TS-H09 | Past/issued source reschedule vs line/issue; valid future fixture vs parent guards | Runtime past/issued reject; controlled future inverse fixture invalidate/rebuild via approved command or whole rollback, never early monthly draft | R1b/source | NOT RUN |
| TS-H10 | A global User disable/attach membership holds rootX; B tenant writer rootS; reverse order | Root barrier prevents authority/affected-tenant phantom; current auth/last-Manager checks consistent, no tenant→root upgrade cycle | O-01/IAM | NOT RUN |
| TS-H11 | A tenantX mutation vs B tenantY, both rootS; multi-tenant global order test | Different tenants proceed until real shared object contention; full ordered tenant set; rollback/restart late dependency, no fabricated global serialization | O-01/NFR | NOT RUN |
| TS-H12 | Raw API/worker SQL nested INSERT/UPDATE/DELETE/TRUNCATE/ALTER and helper/PUBLIC/SET ROLE/temp shadow attempts | Permission denied or safe scoped gateway path; fixture wrong data still fails FK/guard; runtime not owner | Privilege | NOT RUN |
| TS-H13 | G1Oct/G2Nov for Sep20 with Sep100k/Oct150k/Nov200k, unchanged inputs | Both unit100k, invoiceSep; calculation policy change separately visible, not tariff by c2 | O-04/O-12 | NOT RUN |
| TS-H14 | Same-month sessions before/after midmonth tariff bound; SESSION/CLASS/COURSE overrides | Each line correct source date/window/tier; correct mixed rates, no generation-wide date | Pricing | NOT RUN |
| TS-H15 | A/B same-target adjacent vs overlapping PriceRule inserts/overrides, NULL end | EXCLUDE prevents overlapping same target; adjacent/different tier allowed; capture handles no phantom selection | Pricing race | NOT RUN |
| TS-H16 | Update/backdate/higher-tier override for begun/used source; future-close preserves value | Historical repricing rejected; allowed future close not stale solely updatedAt; snapshot bound retained | Pricing history | NOT RUN |
| TS-H17 | Confirmed/unconfirmed/approved EXCUSED/CANCELLED with/without eligible price/explicit0 price | Confirmed rules, CANCELLED no fake attendance but requires tariff; missing price NEEDS_INFORMATION vs explicit0 distinct | Source completeness | NOT RUN |
| TS-H18 | Student transfers/current class-course differs from source; wrong enrollment class fixture | Original source chain resolved; mismatched H-01 relation rejected/quarantined, not new enrollment fallback | Lineage | NOT RUN |
| TS-H19 | A/B initial admission same typed key/body, same key/different body; connection lost after commit | One G/receipt/job, current-authorized replay; hash mismatch conflict; no new clock/policy/G from network retry | Idempotency | NOT RUN |
| TS-H20 | A/B recompute different keys but same expectedLatest/Applied, both barriers before Run lock | At most one admitted pending/current winner, loserCAS conflict; no second logical run/invoice | Generation CAS | NOT RUN |
| TS-H21 | G1 NEEDS_INFORMATION(no invoice); source fixed; replay K1 then new K2/G2 with NULL applied pointer | K1 retains missing result; explicit G2 allowed/latest ownership valid; no fake initial invoice | Generation history | NOT RUN |
| TS-H22 | Source roster/attendance/price override writer between capture/apply, both orders | Epoch/fingerprint/set recheck blocks stale G, no refresh; no partial projection; new command necessary | Source race | NOT RUN |
| TS-H23 | After APPLIED G1, pending G2 vs ISSUE; G2 terminal failure vs ISSUE | Pending/stale blocks; failure preserves old historical result but no READY fallback; explicit G3 expected pointers | Issue race | NOT RUN |
| TS-H24 | ISSUE vs source correction/invalidation; force failure after number/first claim/audit before commit | Either coherent issued snapshot+all claims or complete rollback/counter no reused issued number; losing writer follows history guards | Issue rollback | NOT RUN |
| TS-H25 | Replay G1 after applied G2; attempt source child insert/delete after seal/result rewrite | Historical replay no current-pointer write-back; sealed input/terminal result rejects UPDATE/DELETE/new child | Snapshot immutability | NOT RUN |
| TS-H26 | Cross-run/student/month G/base/current/source FKs, cycle/baseNo invalid, unsealed commit, pointer drift; draft replacement immediate-FK ordering and mid-rebuild fault | Candidate/FK/guard named violations; no committed unsealed/incoherent G/projection; old draft children removed before header generation update, G1 history preserved; fail rolls back whole rebuild | Hybrid SQL | NOT RUN |
| TS-H27 | Canonical request order/null/money/6-digit time/Unicode/duplicate keys; forced same hash/different bytes harness | Stable canonical v1 vector; duplicates invalid, forged equality rejected; exact monetary strings and timestamp precision preserved through driver | Serializer/client | NOT RUN |
| TS-H28 | Job claim A token1, expire, B reclaim token2, A resumes; vary A effect lock before reclaim | Stale token1 cannot commit; row lock+current fence/lease gate coherent; one result/effect, terminal attempts once | Worker fencing | NOT RUN |
| TS-H29 | Process kill before claim commit, after claim before effect, during effect, after commit before ACK | Rollback/no orphan effect; abandoned STARTED recovered once; receipt-first unknown outcome, no duplicate effect or premature FAILED | Crash/recovery | NOT RUN |
| TS-H30 | Job budget initial+3 transient1/5/15; missing/approval/denied; manual recovery cycle if approved | No inner retry multiplication; no infinite retries; monotonic fence not reset; same root/key/G/policy across recovery. Manual-cycle test gated on E.3 approval | Job states | NOT RUN |
| TS-H31 | Competing attempt.finish/reclaimer/old worker finishes; invalid terminal updates | One finish iff unfinished and correct fence, old worker cannot overwrite success, terminal row immutable | Attempt CAS | NOT RUN |
| TS-H32 | Outbox A consumer emits notif then dies before ACK; B retries; postcommit ACK lost | Effect+DONE atomic, UQ dedup; no committed PROCESSING normal path; source commit retained on consumer failure | Outbox | NOT RUN |
| TS-H33 | USER mismatched user/member, WORKER no job/current grant, OPERATOR fake tenant identity; API principal override | Denied by correct DB/API layer; system worker allowlist cannot manual approve/issue; current auth revoked between attempts enforced | Actor/security | NOT RUN |
| TS-H34 | Concurrent approval decisions/execute keys; D1 commit then E1 failure/unknown commit | O-07 selected routing, durable decision retained for B, one same-body/root receipt/effect, COMPLETED iff successful E1 | Approval | NOT RUN |
| TS-H35 | O-05 E1–E13 plus adjustment increase/reversal/cancel A/B races and revision mismatch | Exact N/P/E, SUMremaining=E, pending iff>0, no stale cases/double-count; unauthorized/stale amount rollback | Financial | NOT RUN |
| TS-H36 | Two payments80/due100; full reversal amount mismatch/partial; cancelled issued claims re-use | No overpay/full allocation equality; no partial reversal/P1 refund; permanent claim prevents second issue even units0 | Ledger/claims | NOT RUN |
| TS-H37 | Boundary19-digit/large SUM/NUMERIC raw HALF_UP/money JSON/counter year and due cutoff | Checked overflow atomic, no JS number/double rounding; O-02/03 selected calendar/sequence contract | Precision/metadata | NOT RUN |
| TS-H38 | early retention DELETE/expired finance key/partition detach, restore old dedup and replay | Privilege/policy deny, no key reuse; ≥24mo audit baseline retained; restore/recovery reconciles lost acknowledgements instead of claiming exactly-once across loss | Retention/restore | NOT RUN |
| TS-H39 | Legacy upgrade clean/mismatched/unprovable issued data, fail backfill/constraint validation midbatch | Approved quarantine/provenance path, no invented G1/date/price; original history preserved; retry migration/recovery reviewed | Backfill/rollback | NOT RUN |
| TS-H40 | Forced deadlock/timeout/serialization/PG restart; sustained same/different tenant writes, tzdata upgrade fixtures | Bounded retry same receipt/G, no half-effects; actual query plans/gate waits/NFR/restore measured, no bypass optimization; SQL/runtime tz dates consistent | Ops/fault/NFR | NOT RUN |

### H.1. Minimal two-connection scripts — illustrative protocol only

```text
Fixture: known tenant T, frozen z, Sep source/participant and Sep invoice draft (test role).
A: BEGIN RC; gateway entry(T); hold named barrier after gate; INSERT valid line through gateway.
B: BEGIN RC; invoke source mutation/issue entry(T); assert wait/timeout, no descendant row lock first.
Harness: release A barrier; choose A COMMIT or ROLLBACK; await B, capture fresh read + result.
Assert final joins: student/session equality, Sep local source bounds, no partial audit/effect.
Repeat reverse winner; runtime past reschedule must reject, privileged fixture separately tests inverse guard.

Fixture G1 applied, expectedLatest=G1, expectedApplied=G1, no pending.
A: newKeyK2/reason/baseG1; gate+run lock; barrier before durable admission commit.
B: newKeyK3/reason/same baseG1; waits then must fail expectedLatest/current CAS.
Disconnect A after server COMMIT before response; retry K2 must recover G2 receipt (not G3).
Inject source writer before D2 apply; G2 stale/no projection; G1 remains historical, ISSUE blocked.
```

No SQL executed from this report, no migration generated. Runtime tests using Prisma gateway still need actual query engine/nested behavior, current authorization and parameter binding; catalog tests alone not API scope proof. Restore tests on approved disposable environment only, not production.

## I. Proposed Decisions for Owner Approval

All rows **RECOMMENDED / PENDING_APPROVAL**, approval must name selected package/conditions/date/authority in a later authorized decision record. Owner approval of design is **not** permission to implement schema/migration, run DB, expose routes or Git. Questions below request remaining choices, not Group A/O-12 confirmation.

| Question ID | Câu hỏi ngắn, default recommendation | Hệ quả / next gate |
|---|---|---|
| Q1 — O-01 | **Duyệt contract C:** tenant gate RC/gateway + global authorization fence S/X, common lock order và proposed timeout/retry budgets? | Cho phép chốt D source/period/security graph; global identity/queue writers phải tham gia, contention phải đo. Chưa authorize implementation |
| Q2 — O-04 | **Duyệt hybrid D:** typed G/Source metadata+ownership/CAS/pointers và immutable JSON evidence/results; R1b chỉ marker/source interface, full G thuộc R2? | Chốt modeling/history obligations, new fields/keys/backfill + S/P tests sau authorized diff; không hỏi lại có giữ G1/G2 history |
| Q3 — O-13 | **Duyệt core E:** state guards/actor+role boundaries/one-time finalization, fenced jobs, atomic DB-only outbox, no financial TTL, audit24mo giữ nguyên? | Chốt minimum R1b states/privileges và R2/R4 core; actor/system authority và maintenance roles phải có actual security review; không auto approve financial routing |
| Q4 — manual job recovery | **Chọn explicit authorized retry cycles E.3** (recommend), giữ lifetime fence monotonic và mỗi cycle initial+3, thay lifetime4 constraint theo task nguồn riêng; hay giữ lifetime4 và chưa mở after-exhaustion manual route? | Chỉ block related R2/R4 job recovery/DDL, không R1b. Không reset counter hoặc thêm automatic cycles khi chưa trả lời |
| Q5 — O-02/O-03 | **Chọn local issue-year counter/INV-year-sequence không minimum padding/no reuse, dueAt+7 local calendar days cùng giờ** (recommend) hay yêu cầu presentation/cutoff khác? | Chốt counter/dueAt/ISSUE R2; baseline one invoice/tháng, counter tenant/year và7 ngày không hỏi lại |
| Q6 — O-05 | **Duyệt signed reconciliation/FIFO remaining + RECONCILED distinct RESOLVED; full reversal cần manual approval** (recommend), và chưa mở RESOLVED khi còn excess/no authorized ledger action? | Cần exact resolution/reversal authority/cardinality trước financial DDL; no refund/credit engine P0, unresolved excess vẫn hiển thị |
| Q7 — O-06/O-07 | **Cho phép cancellation có chứng cứ dù đã học/thu qua delta−currentNet và routing B: decision commit rồi explicit execute** (recommend)? | Chốt eligible reasons/authority/failure recovery và sửa same-TX source conflict riêng; approval/cancellation receipt DDL R2/R4 còn blocked tới disposition |
| Q8 — O-10/H-01/API | **Duyệt technical defaults F** cho precision(25,6)/checked arithmetic và source-lineage guard+provenance plan; tách API path/permission sign-off sang slice review? | Không đặt business cap mới hoặc bịa historical rows; API transport vẫn pending trước runtime, actual lineage/schema/backfill diff review riêng |

Có thể duyệt **Q1–Q3 cho minimum R1b D** với rõ điều kiện, giữ Q4–Q8/financial pieces pending; không yêu cầu owner approve cả R2 để đi tiếp phần độc lập. Mọi business/security lựa chọn chưa trả lời chỉ ở mức proposal; không coi silence, report title hay verdict L là approval. Sau trả lời vẫn cần authorization cụ thể cho next artifact/action, không tự bắt đầu R1b/R2.

## J. Remaining Risks & Dependencies

| Risk / finding | Material limitation / control / dependency |
|---|---|
| H-04/H-06/H-09, M-04 | No period/price/source/current-G SQL yet; FK student R1a insufficient; P tests H02–H27 needed before closure |
| H-01/H-03/H-17 | Actual source enrollment/class/course/roster/booking completeness and attendance authority/time locks still R3; typed historical snapshot not proof original input was valid |
| H-14/H-16/H-20 | Actor/coherence/retention and privilege gaps; gateway principal trust cannot defend compromised backend/owner; deferred/history/role guards must cover all parent/child paths |
| H-15/H-19 | Job lease/fence/attempt/outbox/receipt exact behavior pending E/F; no generic retry/APPROVED success shortcut; manual retry lifetime4 conflict needs Q4 |
| H-05/H-07/H-08, M-01/M-05 | Secondary precision/counter/due/ledger/excess/cancellation/approval unresolved; approving primary3 not financial DDL sign-off |
| C global barrier and coarse contention | Additional coordination beyond plan's tenant gate needed for global identity/membership-set stability; unique advisory namespace/grant/helper ordering and global-X duration require PG/Ops review |
| Snapshot size/serialization/microseconds | Captured sets/candidates/diffs may grow; no hash-as-content shortcut; driver Date millisecond truncation/canonical timestamps must be tested; no fabricated storage limit/PII retention rule |
| Migration and Prisma compatibility | New circular generation pointers/composite FKs/nullable legacy transitions/custom partial/deferred constraints need S/client validation; P catalog/upgrade/backfill/projection guard proof, no claim report DDL is ready to apply |
| No existing migrations / target unknown | Cannot assert target PostgreSQL version/extensions/pool privileges or data volume; disposable target and restore fixture require authorization before P |
| Source sync/provenance status | O-12/plan now committed at current HEAD; H-18 old “HEAD missing Q” no longer current. Independent source provenance/delta review still needed, not asking for nonexistent missing Requirements. No audit finding status edited |
| External services/P1 | No outside services used; OTP-only external baseline kept, no gateway/refund/credit/prepaid/combo/timezone editor/business email or new public worker/recompute endpoint |

Scope-specific sequence: review Q1–Q3/minimum R1b D → separately authorize concrete R1b schema/SQL proposal/implementation and test DB → S/P evidence for that slice → R2 generation D/S/P after O-04/O-13, financial subparts after their F decisions → runtime R with R3/R4/API dependencies → independent delta review. Parts can be reviewed independently; no blanket phase authorization or requirement to finish full runtime before every DB test. H-04 stays OPEN until full finding obligations have negative+positive+inverse/concurrency evidence.

## K. Git/File Preservation

Initial working copy/index clean at HEAD9d5fb7c39a6dcd605fe36bc544d85bf217009e63, branch feat/prisma-p0-schema; 85 existing tracked/untracked inventory files hashed before write. Snapshot/manifest and Git metadata outside repo at Temp `educore-signoff-prep-7LXhOH`. Output path was verified absent; create only this report. Do not stage to view untracked diff, overwrite existing source or roll back to older HEAD. Current task creates no script/test source/migration or generated client in repository.

Required offline verification for final response: all 85 prior file hashes, exact one-new-file inventory/status, unchanged branch/HEAD/index, balanced A–L/fences/tables/links/anchors, 40 uniquely numbered TS-H tests all NOT RUN, current O-12 invariant and primary recommendations/statuses, source actual-model assertions and whitespace `git diff --check` plus explicit check of untracked report. Checks are documentation/static inspection, not behavioral proof. Verification results reported after actually running; earlier plan/R1a/O-12 PASS results remain historical, not this task's PostgreSQL evidence.

**Offline checks actually run:** 117 static/document/preservation assertions PASS, including 85 original-file hashes, 23 local links/anchors and shape consistency of 18 Markdown tables; A–L, 40 TS-H rows all NOT RUN, eight owner questions, source metadata and no charge-clock pricing assignment checked. No PG/state-machine/SQL success inferred from these checks. Final scope/whitespace check repeated after review refinements; result reported in final response, no source/test artifact added.

**NOT RUN in this task:** Prisma validate/generate/typecheck/build/application tests; PostgreSQL connection/SQL/catalog/concurrency/migrate/db push/seed/EXPLAIN/load/restore; API/backend/frontend implementation; external network services; Git add/commit/push/branch/PR. Proposed SQL/types/role names/state values in this Markdown are not migrations or code files.

## L. Final Verdict

**READY FOR OWNER TECHNICAL REVIEW.** One recommendation per primary decision, explicit authority/dependencies, concrete model/locks/security/failure and test protocols are prepared; actual choices remain **RECOMMENDED / PENDING_APPROVAL**. Owner must answer I for affected scope. Not technically approved, not ready for R1b implementation, no H-04 closure or PostgreSQL/runtime PASS. Stop after report/offline verification; no automatic transition to technical approval or implementation.

## M. Wallet Business Approval & Simplification Addendum — 2026-10-19

**Authority:** owner xác nhận trực tiếp19/10/2026, Phase2 Documentation Synchronization; [Register §G](../../DECISION_REGISTER.md#g-wallet-p0--owner-business-approval-2026-10-19), [Wallet addendum N](WALLET_P0_SIMPLIFICATION_PROPOSAL.md#n-owner-business-approval--phase-2-docs-sync-2026-10-19). Original **A–L giữ nguyên byte prefix**, mọi baseline/head/117checks/TS-H results/owner questions ở đó là lịch sử, không status Phase2. Không yêu cầu trả lời lại B1–B5 bằng cách dùng historical I.Q6/Q7.

**BUSINESS APPROVED B1–B5:** new manual top-up→explicit wallet invoice pay/refund sau approved execution; staff-only mutations/scoped Student-Parent reads; no negative/no expiry/no cash-out; full invalid-topup reversal chỉ khi đủ balance/permission/reason; no auto legacy/mixed conversion, cần inventory/policy riêng. **PRINCIPLE ACCEPTED** simplification, **không TECHNICALLY APPROVED Q1–Q8/O-01/O-04/O-13**. O-12 A=A/B=B1/C=C1/D=D/Group A invoice identity/claims/manual approval/issued history giữ; no-credit/direct-pay-only limited-superseded cho new wallet cohort, không external refund.

| Historical recommendation | Current recommendation/supersession để review | Authority/status |
|---|---|---|
| Q1/C global advisory fence + broad gateway infrastructure | Wallet E.Q1 per-User auth anchor trước Tenant NK/RC/fresh reads, fixed order/narrow domain commands; full IAM writer/phantom/last-Manager coverage phải chứng minh, không bỏ protection | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; principle không tự chọn SQL/role design |
| Q2/D G+typed Source table/many pointers/epoch | Một typed G+versioned immutable source JSON/currentApplied pointer/indexed latest/full source recheck/CAS, typed source table chỉ nếu invariant/performance cần | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; O12-D history vẫn mandatory |
| Q3/E state/actor/privilege/fencing/outbox full matrix | Per-domain minimum states/actor proof/roles/attempt fences, reuse versioned audit payload khi đủ; no generic state/policy engine | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**, security/ops/PG tests chưa có |
| Q4/E.3 retry cycles/recovery schema | Không recovery-cycle framework; initial+3 automatic và lifecycle4 prose giữ. Requeue<4/manual synchronous root recovery sau4 là pending recommendation, không worker attempt5/reset | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; `attempt_count<=4` chưa actual SQL CHECK |
| Q5/F local counter/year/due cutoff | Keep local issue-year counter/+7calendar-day recommendation, no distributed numbering; exact format/DST/year/replay/restore details chưa approved | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF** |
| Q6/F O-05 FIFO excess-case remaining/movements | **Không new engine cho wallet-only.** Signed Allocation releases đối ứng credit đúng excess trong approved execution, nguồn/root uniqueness; legacy history/policy riêng | Wallet direction **BUSINESS APPROVED**; fields/partial keys/LIFO/reversal/SQL/grants **PENDING TECHNICAL SIGN-OFF** |
| Q7/F O-06/07 routing/receipt/new table option | Business durable APPROVED+explicit effect; sync default/existing IdempotencyRecord root-version recommendation, không new receipt table/generic workflow nếu chưa cần | Business contract aligned; exact execution/schema/recovery/security/API **PENDING TECHNICAL SIGN-OFF** |
| Q8/F precision/H-01/API | Keep exact VND/HALF_UP once/proven widening/source lineage/no fabricated history; wallet/recompute operations không approved REST paths | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF / PENDING API REVIEW**, no new cap |

Đây **thay current recommendation**, không tuyên bố các phương án kỹ thuật cũ đã được owner phê duyệt rồi hủy. TS-H01–H40 original vẫn **NOT RUN**; TS-H35/36 excess/no-credit expectations là historical/legacy nơi xung đột, current wallet acceptance W01–W36/UC-25/26/34/37 ACs đều **DESIGNED**. No filter-reversed-plus-offset double subtraction; paid800k/refunded100k/full nominal reversal chỉ credit remaining700k, fields/guards chưa schema.

R1b chỉ period/C1/source/parent/inverse/history/current auth/grants/minimal snapshot interface và migration precheck/test contract; không full wallet/G/counter engine. R2 tách A generations/B invoice lifecycle/C wallet/D integration, mỗi scope authorization riêng sau required R1b P gate; không chờ toàn R3/R4 modules để review subset contracts. H-04 **OPEN**, wallet/R1b/R2 **NOT IMPLEMENTED**, migrations/PG/runtime NOT RUN. AGENTS/Architecture wording ngoài authorized docs còn backlog trước implementation, không sửa instructions hoặc mở agent quyền.

**Phase2 documentation sync completed for owner review; technical sign-off remains pending. Dừng, không R1b preparation/implementation hoặc R2 tự động.**
