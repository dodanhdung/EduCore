# R6 — Independent schema delta and release readiness review

**2026-10-20 · Asia/Ho_Chi_Minh · local review draft.**

## A. Executive summary

**R6 VERIFICATION INCOMPLETE — required evidence and approval obligations remain.**

The executed local checks support fresh PostgreSQL 16 migration integrity and the
specific runtime/security/concurrency contracts below. They do not support an
unconditional R6 sign-off. H-04 remains OPEN. Populated legacy adoption,
a changed-version tzdata rehearsal, remaining producer/runtime
acceptance vectors and production operations remain separate gates.

Independent baseline verification reran the existing suites before application
changes. Three defects were reproduced and corrected: malformed
refresh-cookie encoding produced HTTP 500; unexpected HTTP failures were silently
discarded by the global exception filter; verified sibling evidence accepted a
self-link which closed-period billing capture selected for discount. No invoice
was issued in that reproduction. No cross-tenant or historical rewrite exploit
was reproduced. This statement is bounded by
the tests, not a proof of absence in untested paths.

Final native results: R1b **39 PASS / 3 existing skips**; R2 **57 PASS**;
R3 **56 PASS**; R4 **54 PASS**; R5 **44 PASS**; independent R6 **13 PASS**.
Default offline/WASM/unit/filesystem suite: **66 PASS**; scaffold E2E: **1 PASS**.
The [verification report](R6_VERIFICATION_REPORT.md) gives commands, timings,
earlier failures, artifacts, NFR results and limitations. Repeated runs are not
added together.

## B. Audit baseline

| Item | Verified baseline |
|---|---|
| Branch / HEAD | `chore/r6-integrity-review` / `ba57648379d9b250d4672df7bdcfc7e8075fef99` |
| R1 ancestry | `91f7f1a`, native follow-up `fd01a7a` |
| R2 / R3 ancestry | `aaff62e`; `24482eb` and follow-up `ca18e59` |
| R4 / R5 ancestry | `1f05971`; HEAD `ba57648` |
| Pre-existing change | Deleted `EduCore-R5-changes-2026-10-20.zip`; preserved, never restored/staged |
| Earlier six deletions mentioned by R5 | No longer six outstanding deletions at this baseline; do not attribute historical deletions to R6 |
| Initial index | Empty |
| Tracked manifest | 175 paths, one already missing ZIP; `apps/api/coverage/r6/baseline.json` |
| Prisma | 68 models / 28 enums; SHA-256 `333742ca8a9b34120ce976f3fe16019cba76665434b42cc1fac4ef404668ca71` |
| Historical migrations | 001–023 present, applied and checksummed; unchanged by R6 |
| Decision Register / source documents | Unchanged |

The initial assessment and failed tests are preserved separately from successful
verification artifacts. Application remediation began only after reproductions
were recorded. Harness failures are distinguished from application defects.

## C. Source and decision provenance

Sources inspected in this checkout: AGENTS, PROJECT_CONTEXT, DECISION_REGISTER;
Requirements v5 plus O-12 and v5.1 wallet amendments; Use Case specification;
accepted Architecture; DB Design v1.1, Detailed Design and API specification;
all files in `docs/design/class design/`, emphasizing domain ownership,
transactions, invariants, open decisions and Group A appendices; original
SCHEMA_AUDIT_P0, remediation plan §§3–5/8–10; R1B/R2/R3/R4/R5 implementation
reports and actual source/migrations/tests. Proposed class signatures and old
NOT IMPLEMENTED passages are not current implementation authority.

Primary business trace: FR-01–14/16–19/25–35/37/39–45; BR-01/04/06/08–14;
Q-01–05/08–15; UC-01–16/21–29/31–37. P1 academic exceptions, progress,
dynamic policy editing and external notification integrations remain excluded.

| Decision | Current authority/evidence | R6 disposition |
|---|---|---|
| O-01 locking/security gateway | Register §G.1 and plan retain technical sign-off pending; actual R1b/R2/R3/R4 gateways and native races exist | Technical implementation verified for named schedules; do not relabel owner approval |
| O-02 number | R2 report records owner choice; current R6 request restates tenant/year counter | Local issue-year counter, `INV-{year}-{at least 6 digits}`, non-gapless; R2 I02/I03/C05 rerun |
| O-03 due date | Owner-recorded seven local calendar days; same wall time in R2 report | R2 I02/I04 rerun; nonexistent due wall time remains fail-closed, no new policy |
| O-04 generation representation | O12-D approved business; Register still pending technical representation | Immutable generation JSON, typed pointers and CAS verified; technical approval reconciliation outstanding |
| O-05 wallet | Register §G B1–B5 and current request | Wallet funding/payment/refund verified; concrete LIFO/signed-offset choices are implementation review items |
| O-06 cancellation/reversals | Manual approval + explicit execution recorded by R2 and restated in request | APPROVED survives failure; effect/receipt/COMPLETED atomic; no compensating write to issued source |
| O-07 execution routing | Durable decision business contract; technical routing still pending in register | Current synchronous execution verified; no inferred approval of generic executors |
| O-08 grade draft | Current owner request confirms A; R5 records implementation | Live draft blocks resubmission; cancelled draft reopens eligible submission |
| O-09 bytes/cutoff | Current owner request confirms A | 10,000,000 bytes/file; five files; +168 hours inclusive; no destructive cleanup policy invented |
| O-10 money | BigInt/decimal strings, no lower business cap; actual raw discount Decimal(24,6) | R2 G13/G17 and unit limits verified; 24,6 suffices for sibling discount at signed-BIGINT maximum, despite older 25,6 proposal |
| O-11 first Manager | Current request confirms A; R4 owner record | Controlled operator self-reference, separate OPERATOR audit; no public bootstrap |
| O-12 | Register §F and request: A=A/B=B1/C=C1/D=D | Current business authority; old charge-time recommendation superseded |
| O-13 states/actors/operations | Register §G.1 still pending technical sign-off | Implemented domain-specific guards/leases/grants verified; operational retention/deployment approval incomplete |

**H-18:** the first 387-line candidate at `de333c0` did not match the recorded
snapshot hash. A complete search of all nine Git versions then found commit
`6026eecd32b30eccffc49bf9c3923371325aa46d`: materializing its content with CRLF
produces exactly `fd5120769b4e9cb09be53b99b192d75ceaa1f28f3b877d8e1ff92bc1464f481d`,
the historical working-copy SHA-256 recorded by the remediation plan. Git LF hash
is `bd0701b964d597e2908c9996931a192b8478df1cd38d5af9ff1e225c29941bf5`.
The extra trailing newline explains the split-array count388 versus387 content
lines. All Q-01–Q-15 and Internal-first are present; the current407-line version
contains later approved amendments. `source-provenance-history.json` records
every candidate/hash variant. The historical source-gap/provenance obligation is
verified relative to that recorded snapshot; technical decision approval is a
different gate. No source was recreated or edited.

## D. Schema delta inventory

The PSL remains unchanged. Forward-only migration024 adds a sibling self-link
CHECK and unordered active-pair uniqueness for the reproduced E-06 defect.
The fresh final catalog contains:

| Object | Count / evidence |
|---|---|
| Domain PSL models / enums | 68 / 28; all enum labels inventoried |
| Public tables including Prisma history | 69 |
| Public columns | 710, with native type, nullability and default |
| Primary keys / foreign keys | 69 / 211 |
| CHECK / EXCLUDE / deferred constraint-trigger entries | 38 / 2 / 29 |
| Indexes / unique indexes / partial indexes | 340 / 221 / 12 |
| Non-internal public trigger attachments | 89, all enabled |
| Custom functions / SECURITY DEFINER functions | 139 / 126 |
| Migration history | 24 healthy entries: original23 unchanged plus R6 correction024; exact SHA-256 matches |
| Prisma schema drift | `No difference detected.` |

All 211 FKs use MATCH SIMPLE. Update actions are 197 CASCADE, 12 RESTRICT and two
NO ACTION: FK actions alone do not establish immutability. Runtime DML denial,
parent identity/history triggers and tested cascaded/re-key rejections are the
other required protections. Optional AttendanceRecord finalization retains the
documented scalar-only unlink restriction; unsafe nested disconnect remains
rejected without making required identity columns nullable.

Exact model/table/field/key/FK/default/reference/index/constraint/trigger/function
inventories are in `apps/api/coverage/r6/catalog.json` and
`enum-fk-inventory.json`. These generated, sanitized local artifacts are ignored
by Git and reproducible with the R6 runner. They contain no row data or passwords.

Tables without `tenant_id` were individually classified: `tenants` is the root;
`users`, `credentials`, `auth_sessions`, `password_reset_otps` and
`refresh_token_history` are global user/session data; `permissions` is the static
catalog; `r2_principal_bindings` resolves a session/tenant through its FK;
`_prisma_migrations` is operational history. Private auth-throttle,
transaction-principal, worker-context and effect-permit tables are separately
privileged. None of these classifications grants a platform actor tenant data.

The two native GiST exclusions are enrollment interval overlap and active resource
booking overlap. Price-tier overlap is also protected by SQL command/trigger
logic; it is not a third GiST exclusion in this catalog. Do not claim an index
exists from a design illustration.

## E. Custom SQL, replacement safety and privileges

The catalog artifact records each function's effective definition, owner,
security mode, fixed search path, ACL, checksum and declaration migration(s).
Dynamic `pg_get_functiondef` replacement sites are listed separately; declaration
regexes alone are not a complete replacement lineage.

R6-03 compares the populated checkpoint018 catalog against checkpoint024. Exactly
four pre-existing function bodies change:

| Function | Actual R5 delta | Preservation evidence |
|---|---|---|
| `educore_r4.has_permission` | Activate resource-specific learning/file permission predicates | Exact old-body transformation comparison; original scope/current-auth branches retained |
| `educore_r4.seed` | Teacher `grade.correct` grant | Exact old-body transformation comparison |
| `educore_r3.published_grade_evidence` | Use recipient class when assignment class is absent | Exact original body plus COALESCE replacement |
| `educore_r4.can_event` | Actual ASSIGNMENT_PUBLISHED recipient source | Exact inserted block; older event branches retained |

Every other pre-existing custom function body is unchanged across that upgrade;
owners, ACLs, definer flags and configurations remain equal. Full before/after
evidence is `r4-r5-function-preservation.json`.

All 139 custom functions deny PUBLIC execution. Definers have pg_catalog-first
fixed search paths. Effective owners are `educore_r1b_guard_owner`,
`educore_r2_owner`, `educore_r3_owner`, `educore_r4_owner`; all are NOLOGIN,
non-superuser/non-CREATEROLE/non-CREATEDB/non-BYPASSRLS. Restricted API/auth/worker
roles are separate. R6-04 and R1b/R2/R3/R4 security cases reject raw historical
DML, DDL/helper access, unauthorized role grants and unbound principal use.
Restored runtime profiles pass `assertRuntime` on a separate cluster.

Fresh migration into another DB on a cluster containing R1b roles is deliberately
refused. The immutable migration will not adopt unknown role membership. This is
an operational topology constraint; R6 rehearsals use new clusters. Managed-host
role creation/provisioning is not certified by the local superuser rehearsal.

## F. R1–R5 domain integrity

| Domain | Executed evidence | Practical limit |
|---|---|---|
| IAM/tenant | R4 A01–17, X01–06/16/17, D02/07/09; R6-04/05; R5 R12/13 | Real login/select-tenant/HTTP reads and writes; deployed cookie/domain/TLS and SMTP not verified |
| Billing/wallet | R2 G/I/W/F/C cases; R4 B01–03/X07–10/14; R3 D/X/FU-A | Frozen G1/G2, ledger, CAS, issued claims, approval execution and rollback verified; exact H-04 residuals remain |
| Academic/scheduling/attendance | R3 A/B/C/D/X and follow-up; R6-08/09 | Actual internal command protocol, capacity and observed races; public academic/scheduling/attendance write transports are incomplete |
| Workflow/jobs/outbox | R4 C01–07/X11–15; R5 R15 | Lease and deferred commit fence, retries 1/5/15, fourth terminal attempt, recipient dedup; no universal TCP/process-crash proof |
| Assignments/grades | All 44 R5 native cases, including A05/E03 and integration E01 | Draft visibility/current version/published revisions and R3 evidence preservation verified |
| Files/recovery | R5 D/R/F cases; R6-06 | Real bytes restored with metadata, private reads and mismatch detection; tiny quiescent local fixture, no live production restore or OS ACL certification |

Concurrency claims use independent PostgreSQL backends plus observed
`pg_blocking_pids` edges. Final artifacts contain 32/35/29/18/26 race entries for
R1b/R2/R3/R4/R5 respectively. Of these, 32/35/29/17/24 explicitly record
`observedWait=true`; remaining entries use their documented deadlock/fence or
outbox/filesystem latches. They are not all described as PostgreSQL lock waits.
Startup polling is not concurrency evidence.

## G. H-01–H-20 independent acceptance gates

**Legend:** P=PASS for the stated local contract; PT=PARTIAL; NV=NOT VERIFIED;
N/A=not a database/runtime gate for the source-only finding.
D is authoritative design/contract, S schema/client shape, P PostgreSQL evidence,
R runtime evidence. A tested local invariant is not formal production closure.
PT identifies a specific remaining obligation, not a newly reproduced violation.

| Finding / original obligation | D | S | P | R | Evidence and closure recommendation |
|---|---|---|---|---|---|
| H-01 class/student/enrollment/transfer lineage | PT | P | P | PT | R3 A01–08/X02/03/08, R5 A01–03/R07. Source lineage retained; full public write workflow/technical sign-off pending |
| H-02 finalization session equality | P | P | P | PT | Composite FKs, R1b T02/T08/T21 and R3 C04. Scalar-unlink restriction preserved; exact authenticated public finalization writer unavailable |
| H-03 roster/leave/48h vs ISSUE | PT | P | P | PT | R3 C02–06, X09/11/12/15/16, FU-A01–06. Sealed correction intentionally fail-closed; approved coordinated correction contract missing |
| H-04 student/period/price/source | PT | PT | PT | PT | See exact submatrix below; OPEN |
| H-05 invoice arithmetic/issue metadata/sibling | P | P | P | PT | R2 G05/G13/G17/I01–04; zero/units guards. Full public ISSUE writer and exact residual H-04 pricing vectors not supplied |
| H-06 complete claims/coherent generations/no phantom | PT | P | P | PT | R2 G02/03/10–12/C04/05/10–12, R3 D01/02/X12/13. Same raw-source races do not prove every real producer path |
| H-07 allocation/reversal/overpayment | PT | P | P | PT | R2 W01–12/C01–03/06/07/09/F01–05, R4 B01/X08/14. Signed wallet contract verified; technical sign-off/full public funding transport pending |
| H-08 approved target/payload/excess effects | PT | P | P | P | R4 B01–03/X07–09/14 plus R2 F02/03/W02–10. Local effect/receipt atomic; legacy policy and concrete technical approval outstanding |
| H-09 overlap SQL enforcement | P | P | P | P | Native exclusions, R2 G07; R3 B01–07/X01/05/06; R6-08. Local tested invariant verified; not a load sign-off |
| H-10 last valid Manager/global User paths | P | P | P | P | R4 A09/11/16/X01/02/17, R1b T26. Controlled bootstrap and current mutation boundaries verified locally |
| H-11 scope/link/current authorization | P | P | P | P | R4 A03/10/12/14/15, R5 C03/R12/13, R6-04. Local read/write isolation verified; production identity configuration separate |
| H-12 recipient/version/grade concurrency | P | P | P | P | R5 A/B/C/E and R01–10/14; R3 FU-B07/08; restored published grade. Verified local contract, no automatic level rubric inferred |
| H-13 file owner/READY/count/bytes | P | P | P | P | R5 D01–03/R11/16, 10 filesystem tests, R6-06. Verified local fixture; production storage/ACL/backup gate remains |
| H-14 audit actor/redaction/retention | PT | P | P | PT | R4 D03/05/06/07, R6 redacted error tests, restore manifests. Runtime early deletion denied; long-term retention/privileged operations not certified |
| H-15 worker fence/outbox recovery | PT | P | P | P | R4 C01–07/X11/13/15, R5 R15. Tested stale-worker commit rejection; exact operational recovery/retention sign-off pending |
| H-16 fingerprint/current auth/atomic result | PT | P | P | P | R2 G01/02/F01–06, R4 C01/X10/14, R6 recovery units. Tested durable-outcome lookup; exhaustive network faults not implied |
| H-17 bookings/roster/capacity/series atomicity | P | P | P | PT | R3 B/X01–08, R6-08. Internal real command behavior verified; complete public write transport absent |
| H-18 Requirements provenance | P | N/A | N/A | N/A | Historical working-copy hash exactly reproduced from Git6026eec with CRLF; current Q/integration sections and amendment ancestry present. Source finding verified; not a runtime gate |
| H-19 decision/execution state CAS | PT | P | P | P | R4 B01–03/X07–09/14; R2 C07/F02/03. Manual decision and explicit execution verified; concrete routing approval reconciliation remains |
| H-20 lifecycle/history mutation protection | PT | P | P | PT | R1b parent/issued tests, R2 immutable finance, R4 audit/decisions, R5 grade/version/file snapshots. Tested local states; all historical/privileged adoption and lifecycle sign-off incomplete |

### H-04 exact residual assessment

| Obligation | Result / exact evidence |
|---|---|
| Student and BillingPeriod equality | PASS: R1b T02–06/T12–17, R2 G06/G14 |
| Local midnight/overnight/month/year attribution | PASS: R1b T04–06, R2 G06/I02, R6-09 |
| Original enrollment/class/course lineage | PASS for executed cases: R1b T14–16, R2 G16, R3 A08/D01 |
| Session-date pricing and precedence | PASS named vectors: R2 G01/G06–09 plus R6-12 exact100k+120k=220k and CLASS150k fallback after SESSION300k expires |
| Child/inverse-parent guards | PASS tested counterexamples: R1b T09–17/21–24 |
| G1/G2/current pointer/ISSUE recheck | PASS tested cases: R2 G02/10/C04/05/10–12; R3 D02/X12/13 |
| New source versus ISSUE/G2 | PARTIAL overall: R2 C11/12 observed raw-source schedules; R3 X11–13/FU-A04 cover actual named commands, not every producer/price-writer schedule |
| Permanent issued history and claims | PASS tested cases: R1b T17, R2 I01/W05, R3 D01/FU-A |
| EXCUSED/CANCELLED/explicit zero price | PASS named vectors: R2 G04/G11, R3 D04; R6-12 explicit zero-priced CANCELLED ISSUE, immutable claim, denied recompute/cross-period reuse |
| Restricted DML / valid runtime entry | PASS security boundary; R6-04 and R4 HTTP finance/role cases; public ISSUE/source producer workflow coverage remains PARTIAL |
| Technical design authority | PARTIAL: Register O-01/O-04/O-13 not changed or assumed approved |

**H-04 remains OPEN.** These gaps are not converted into successes by nearby tests.

## H. M-01–M-08 gates

| Finding | D | S | P | R | Evidence / remaining limit |
|---|---|---|---|---|---|
| M-01 raw decimal representability | P | P | P | P | Decimal(24,6), R2 G13/G17, calculator overflow/rounding units; no new business ceiling |
| M-02 residual scalar/temporal checks | PT | P | PT | PT | 38 CHECKs plus triggers, including R6 sibling correction; R1b/R3/R4/R5 negative cases. No exhaustive independent negative for every nullable metadata branch |
| M-03 first Manager attribution | P | P | P | P | O-11 A, R4 A09/A13/D03, controlled CLI boundary |
| M-04 policy/effective price/snapshot pin | PT | P | P | PT | R2 G01/02/08/15/C10, R4 C05; broader policy editor P1 excluded; technical authority reconciliation pending |
| M-05 numbering/due/reversal/execution | PT | P | P | PT | R2 I02–04/W/F, R4 B/X; DST due gap safely rejected, legacy handling and technical choices remain reviewed separately |
| M-06 physical storage namespace | P | P | P | P | R5 filesystem paths/junctions/collisions; canonical tenant/UUID key; restored byte reads |
| M-07 domain state/terminal transition catalog | PT | PT | PT | PT | Current SQL guards inventoried; R3/R4/R5 negatives verified, no universal approved state table or deployed adoption proof |
| M-08 P0 allowlists despite P1 enum slots | P | P | P | P | R3 unsupported/P1 commands, R4 D07/job allowlist, R5 strict DTOs; no generic status/SQL endpoint |

## I. E-01–E-40 and L-01 residual inventory

E IDs remain enforcement obligations from the original audit. PASS below is local
evidence for the stated predicate; a PT gate keeps the broader obligation open.
The current wallet amendment supersedes the old no-credit/excess-engine proposal;
it does not authorize legacy conversion.

| ID / predicate | D | S | P | R | Executed evidence / residual |
|---|---|---|---|---|---|
| E-01 normalized email/status | P | P | P | P | R4 A01/02/07–09; r4_email_normalized; Unicode normalization at HTTP |
| E-02 credentials/session/OTP TTL and attempts | P | P | P | P | R4 A02/04–08/17, X05/06/16, crypto units; malformed-cookie regression |
| E-03 active grants/history interval | P | P | P | P | Partial active uniqueness; R4 X03/17 |
| E-04 last valid Manager | P | P | P | P | R1b T26; R4 A11/16/X01/02 |
| E-05 scope shape and permission pairing | P | P | P | P | r4_scope_shape; R4 A15, R6-04 |
| E-06 parent/sibling verification and active identity | P | P | P | PT | R2 G05/S04, R3 C02, R4 A12/X04; R6-10 reversed-pair commit/rollback/regrant and self rejection; R6-11 preflight. Full metadata/transport matrix still partial |
| E-07 resource kind/exactly-one registry | P | P | P | P | r3_resource_shape; R3 B02/03/B07, R6-08 |
| E-08 capacity/interval/enrollment overlap | P | P | P | PT | R3 A01/02/A07/X02–04; complete public enrollment writer absent |
| E-09 transfer/participant/recipient lineage | PT | P | P | PT | R3 A03/08/FU-B05, R5 A01–03/R07; named internal producer paths verified |
| E-10 schedule/series intervals and revision | P | P | P | PT | R3 B04–06, R6-08/09; public scheduling write transport absent |
| E-11 booking source/exclusion/completeness | P | P | P | P | R3 B01–07/X01/05–08; R6-08 |
| E-12 active absence/approval/late notice | P | P | P | PT | R3 C02/03/06/FU-A01–06; exact public absence writer missing |
| E-13 finalization/session relation | P | P | P | PT | R1b T02/T08/T21, R3 C04; scalar unlink restriction |
| E-14 full roster/48h/issued lock/corrections | PT | P | P | PT | R3 C04/X09/11/12/15 and early ISSUE follow-up; sealed correction remains blocked |
| E-15 canonical month shape | P | P | P | P | bp_month_shape_ck; R1b T13/R2 G06 |
| E-16 valid price targets/windows/no overlap | P | P | P | PT | R2 G06–09 and R6-12 exact mixed dates/expired-SESSION fallback; full public tariff writer remains absent |
| E-17 InvoiceLine student identity | P | P | P | P | Composite student/participant/invoice FKs, R1b T02/R2 G14 |
| E-18 source period/price/lineage proof | PT | PT | PT | PT | H-04 exact residual matrix applies |
| E-19 line/header amounts and issue shape | P | P | P | PT | R2 G13/G17/I01–04 and unit arithmetic; public ISSUE writer absent |
| E-20 single sibling discount/evidence/precision | P | P | P | PT | R2 G05/G17; exhaustive sibling revoke/eligibility schedules incomplete |
| E-21 complete/permanent claims | PT | P | P | PT | R2 I01/C05/G10–12; R6-12 cancelled/zero issued claim, denied recompute/cross-period reuse; all real producers still not covered |
| E-22 payment/allocation equality and outstanding | PT | P | P | PT | R2 W/C/F; wallet signed-offset contract, public funding transport/technical sign-off pending |
| E-23 full reversal/effect cardinality | PT | P | P | PT | R2 W06–10/C07, reversal after refund net remaining verified |
| E-24 approved financial target/body/effect | PT | P | P | P | R4 B01–03/X07–09/14; R2 F02/03 |
| E-25 excess lifecycle | PT | PT | PT | PT | Wallet W02–10 passes current business contract; exact legacy existing excess-case vector/policy missing; old case-engine proposal superseded |
| E-26 assignment/version/grade scalar and state | P | P | P | P | R5 A05/B/C/E03; score 8.55 rejected before cast and by native CHECK |
| E-27 file metadata/owner/READY/count | P | P | P | P | R5 D01–03/R11/16/files; R6-06 |
| E-28 immutable financial/learning history | PT | P | P | PT | R1b/R2 history tests, R5 versions/attachments/revisions, restored manifests; privileged adoption unverified |
| E-29 approval state/decision/completion | PT | P | P | P | R4 B/X07–09/14, R2 durable D1/E1 tests |
| E-30 audit actor coherence | P | P | P | P | R4 D03/05, C05, A09; USER/WORKER/OPERATOR source bindings |
| E-31 audit redaction/retention/scoped reads | PT | P | P | PT | R4 D03/05/06/07 and R6 sanitized logs/restore; long-term backup/retention operations not verified |
| E-32 attempts/leases/terminal behavior | PT | P | P | P | R4 C02–05/C07/X15; four total attempts and backoff; operational recovery approval separate |
| E-33 typed hash/idempotency/durable result | PT | P | P | P | R2 G/C/F, R4 C01/X10/14, R6 outcome unit cases |
| E-34 outbox/notification dedup and recovery | PT | P | P | P | R4 C06/X13; R5 E01/R15; R6-13 exact100 redeliveries preserve one notification and publication |
| E-35 runtime vs owner/retention privileges | PT | P | P | PT | R1b T31/32, R4 D07, R6-01/04/06; managed deploy/privileged retention plan unverified |
| E-36 immutable policy/retry pin/state | PT | P | P | PT | R2 G15/C10, R4 C05; policy P1 editor excluded, technical state authority pending |
| E-37 common lock order/atomic audit/effect | PT | P | P | PT | Observed native races and deferred worker commit fence; not all producer/recovery schedules |
| E-38 private path/promotion/reference/restore | P | P | P | P | R5 filesystem/latches, R6 coordinated quiescent restore and missing/corrupt/excess detection; live production snapshot separate |
| E-39 ISSUE-only number/counter | P | P | P | PT | R2 I01–04/C05; rollback counter verified; full public ISSUE transport absent |
| E-40 index/custom SQL/migration verification | PT | P | P | PT | R6-01/02/03/06/07/08; all candidate/FK index dependencies inventoried; changed-version upgrade/representative plans incomplete |
| L-01 candidate/index dependencies and plans | P | P | P | PT | All 211 referenced target indexes captured; resource-booking EXPLAIN ANALYZE on small fixture. No index removed; broad populated query workload not benchmarked |

## J. T-01–T-42 traceability

These are **roadmap/original-audit T IDs**, not `R1B-Tnn`. In particular roadmap
T-37 is notification eligibility, whereas R1B-T37 is populated adoption. Test
names and commands are linked in the verification report and native artifact.
All native entries below use PostgreSQL 16.15 in owned local clusters.

| ID / original acceptance | Existing or new executed cases | Result / remaining gap |
|---|---|---|
| T-01 Manager revoke/global disable | R1b T26; R4 A11/16/X01/02/17 | PASS local schedules |
| T-02 resource overlap/adjacency | R3 B01/02/07/X01; R6-08 | PASS local fixtures |
| T-03 busy/series/cancel/reschedule atomicity | R3 B03–05/X05–07; R6-08 | PASS named cases |
| T-04 last seat/transfer/room capacity | R3 A02/07/08/X02–04 | PASS named cases |
| T-05 source lineage/recurrence/P1 denial | R3 A01/08/B05/06; R5 A03; R6-08 | PARTIAL: exhaustive multi-hop lineage cycle counterexamples not separately reproduced |
| T-06 active grants/scopes/regrant/pairing | R4 A15/X03/17; R6-04 | PASS named cases |
| T-07 cross-tenant/scope/parent/sibling | R1b T30; R2 G05/S03/04; R3 C02; R5 C03/E02; R6-10/11 | PASS named cases including reversed-pair uniqueness and self-link denial; full metadata transport remains outside this test |
| T-08 normalized account/OTP/refresh | R4 A01–08/17/X05/06/16; R6-05 | PASS named cases; real SMTP separate |
| T-09 finalization relation/parent guards | R1b T02/T08/T21, R3 C04 | PASS with documented nested-disconnect restriction |
| T-10 leave exact notice/authority/source | R3 C02/03/06/FU-A01–06 | PASS named notice/claim cases; no public write transport claim |
| T-11 full roster/attendance override | R3 C04/06/X15 | PASS local command cases |
| T-12 48h/ISSUE/correction CAS | R3 C04/X09/11/FU-A03 | PARTIAL: sealed coordinated financial correction contract absent |
| T-13 canonical period/leap/duplicate | R1b T13; R2 G06 | PASS tested month shapes |
| T-14 student/month/midnight | R1b T02–06; R2 G06/G14; R6-09 | PASS tested attribution |
| T-15 tariff precedence/overlap/windows | R2 G06–09; R6-12 | PARTIAL: mixed-price and CLASS fallback now PASS; exhaustive real price-writer races missing |
| T-16 sibling/zero/cancel units | R2 G04/05/G11; R3 D04; R6-10/12 | PARTIAL: zero-issued claim/reuse and self/duplicate evidence now PASS; exhaustive sibling eligibility metadata still incomplete |
| T-17 source stale/phantom/policy/zone | R2 G10–12/15/C11/12; R3 D02/X12/13; R1b T24 | PARTIAL: every real producer/price-writer path not exercised |
| T-18 precision/rounding/BIGINT | R2 G13/G17; calculator and R6 unit cases | PASS local integer/precision vectors |
| T-19 ISSUE number/retry/year/rollback | R2 I01–04/C05 | PASS executed internal command cases |
| T-20 complete/permanent claims/idempotency | R2 I01/G10/C05; R1b T17; R6-12 | PARTIAL overall: cancelled/zero claim cross-period reuse/recompute denial now PASS; producer completeness paths still partial |
| T-21 competing pay/changed key body | R2 W01–04/C01/02/09/F04 | PASS local wallet cohort |
| T-22 allocation/payment equality | R2 W02–06/F01 and reconciliation guards | PASS current wallet cohort; legacy adoption excluded |
| T-23 full reversal/cardinality | R2 W06–10/C07 | PASS current wallet cohort |
| T-24 payment/adjustment/reversal ordering | R2 C06/07/W05/06 | PASS named local schedules |
| T-25 repeated reductions/root replay | R2 W02/03/05/09/C07 | PASS current approved wallet replacement semantics; old no-credit expectation superseded |
| T-26 reversed/refunded/cancelled history | R2 W05/06/10/11 | PARTIAL: legacy/mixed excess policy and exact existing-case fixture missing |
| T-27 decision/race/body/current auth | R4 B01–03/X07–09, R2 F03/C08 | PASS tested manual execution |
| T-28 self approval/atomic execution | R4 B01/X14; R2 F02/03; R3 C02 | PASS tested sync manual contract; generic async execution not claimed |
| T-29 publication/roster/recipient/edits | R5 A01–05/E01/R05–08 | PASS local authenticated contract |
| T-30 resubmit/grade/pointer concurrency | R5 B01–04/R01–03/08/14 | PASS local authenticated contract |
| T-31 score/revisions/late cutoff | R5 C01–04/E03/B02/B04/R04/09/10 | PASS local precision and inclusive cutoff |
| T-32 file owner/READY/type/size/private read | R5 D01–03/E03/files; R6-06 | PASS tested local contract |
| T-33 attachment race/immutable set/orphan | R5 D02/R11/16 | PASS tested non-destructive contract |
| T-34 promotion/crash/path/DB+Volume restore | R5 D03/R16/files; R6-06 | PARTIAL overall: local quiescent restore PASS; live-writer production recovery point/OS ACLs not verified |
| T-35 stale worker/attempt4/5/permission | R4 C01–05/C07/X11/12/15 | PASS named lease/fence scenarios |
| T-36 outbox producer/crash/replay | R4 C06/X13; R5 E01/R15; R6-13 | PARTIAL overall: exact100-replay and named crash schedules PASS; exhaustive process/TCP crash matrix not run |
| T-37 notification eligibility/alerts | R4 C04/C06/X04/13; R5 E01/R13/15 | PASS named recipient/revocation/alert cases; distinct from R1B-T37 |
| T-38 history/actor/rekey/raw DML | R1b T09–17/31/32; R2 S01; R4 D03/07; R5 B/C/D/E03; R6-04 | PASS tested histories; no privileged adoption claim |
| T-39 audit secrecy/access/retention/restore | R4 D03/05/06/07; R6-06 and error unit tests | PARTIAL: local redaction/deletion denial/restore PASS; long-term privileged retention operations unverified |
| T-40 pin/hash/replay/current authorization | R2 G01/02/15/C10; R4 C01/C05/X10; R5 B01; R6 units | PASS tested durable replay; no dedup purge policy introduced |
| T-41 provenance/domain states/P1 allowlists | All nine Git source versions, R3 unsupported commands, R4 D07, R5 E02/03 | PARTIAL overall: historical snapshot provenance now PASS; full domain state/technical authority remains unresolved |
| T-42 fresh apply/catalog/plans/recovery/restore | R6-01/02/03/06/07/08/09 | PARTIAL: local tests PASS; different tzdata/PostgreSQL upgrade and representative workload missing |

R1b's separate skipped obligations: **R1B-T37** valid populated legacy adoption
remains BLOCKED pending target inventory/plan; **R1B-T41** is partially covered by
later authenticated R4/R5/R6 runtime but not relabeled PASS; **R1B-T42** local
restore now has evidence, changed-version tzdata remains NOT RUN. The three
original skipped definitions were preserved.

## K. New defects discovered

| ID / severity | Reproduction before remediation | Impact and cause |
|---|---|---|
| R6-F01 / LOW | Real HTTP POST `/api/v1/auth/refresh`, allowed Origin, syntactically present CSRF, `Cookie: educore_refresh=%ZZ` ⇒ expected 401, actual 500; initial R6-05 FAIL | URIError from decodeURIComponent bypassed intended authentication denial; no authentication bypass or database mutation shown |
| R6-F02 / MEDIUM | Direct global filter invocation with unexpected Error and Logger spy ⇒ no diagnostic emitted; initial observability unit FAIL | Global catch-all suppressed application failures, violating NFR-13 traceability; response already sanitized but operations lost the correlation/error signal |
| R6-F03 / HIGH data integrity | Baseline023 accepted a verified self-link; separate closed-period capture returned sibling=true (`sibling-defect-capture.json`), without issuing an invoice | E-06 lacked distinct-student and active unordered-pair constraints. Incorrect trusted/imported evidence could authorize an unearned10% discount; ordinary runtime raw DML was still denied, so no public privilege bypass is claimed |

Harness corrections are not product defects: an auxiliary DB reused cluster-wide
roles that R1b correctly refuses; restore used a different grantor bootstrap;
Prisma's aborted-transaction logging hid the original error; naive timestamp
transport changed the test input; a readiness probe saw the temporary socket-only
server; the table-manifest allowlist initially excluded the digit in
`r2_principal_bindings`. Initial artifacts and failure dispositions remain in the
verification report. No expected financial/security rejection was removed.

## L. Corrective changes and re-verification

Only application source changed: `apps/api/src/identity-access/http.ts`.
R6-F01 catches URIError and emits 401; malformed UTF-8, percent, duplicate and
invalid token cookies are tested through HTTP. R6-F02 logs a fixed structured
event, status, correlation and validated SQLSTATE for server errors; it excludes
exception messages/stacks/query arguments/credentials and does not log ordinary
authentication denials as unexpected failures. Two redaction/error tests pass.

Migration024 adds `r6_sibling_distinct` and `r6_active_sibling_pair` using
LEAST/GREATEST. Existing valid pair orientation and revoked history are retained;
no canonical ordering or automatic repair is imposed. Invalid self-links or
duplicate active pairs fail preflight, leaving evidence untouched. R6-10/11 prove
native rejection, two observed races, rollback/regrant, valid reversed-pair
upgrade and fail-closed populated-data handling.

No PSL, financial writer, business/security policy, dependency or Decision
Register change. Final R1b–R5 regressions and R6 native/unit checks pass
within the scopes above. Every new file remains unstaged for owner review.

## M. Open decisions and risks

1. O-01/O-04/O-07/O-13 technical sign-off/status reconciliation; implementation
   reports and committed code do not silently approve pending register entries.
2. H-04 remaining source-writer/public-transport/technical-authority coverage;
   exact mixed-date/fallback/zero-claim vectors now have R6-12 evidence.
3. H-18 historical snapshot hash is verified from Git6026eec/CRLF; review this
   evidence without confusing it with O-01/O-04/O-13 technical approval.
4. R1B-T37/legacy and mixed financial adoption: no populated deployment inspected,
   no conversion/backfill authorized or attempted.
5. Sealed attendance/leave correction remains fail-closed; no unapproved financial
   compensation. Automatic grade-level recommendation remains deferred without a
   universal approved rubric; explicit grade-backed placement is implemented and
   tested, including migration009 and R5 revision preservation.
6. Different PostgreSQL/tzdata upgrade not run. Existing DST gap rejection remains
   safe; no silent wall-time adjustment policy selected.
7. Real SMTP, production HTTPS/domain/cookies, Railway roles/Volume/OS ACLs,
   scheduled backups, production RPO/RTO/availability and representative load
   remain NOT VERIFIED. Audit retention after privileged operations is not proved
   by runtime DELETE denial alone.
8. Restore uses a matching bootstrap grantor and separately provisioned secrets;
   data dump alone is insufficient. Single-writer quiescence is the recovery-point
   assumption; the rehearsal does not establish a live snapshot procedure.
9. TypeScript unit branch coverage is 100%, but Scheduling has only two measured
   branches and 41.66% line coverage; SQL business branches are not V8-instrumented.
   No broad SQL coverage claim follows from this metric.

## N. Independent sign-off recommendation

| Readiness | Recommendation |
|---|---|
| Fresh schema migration on the verified isolated PostgreSQL16 topology | Local evidence supports conditional technical review; no drift/checksum/ACL regression found |
| Existing populated/historical migrations | NOT VERIFIED; target-specific adoption gate required |
| Backend feature completeness | PARTIAL; named local contracts verified, missing public write transports and sealed correction retained |
| Local logical DB + private-file restore | PASS for the documented quiescent synthetic fixture |
| Operational release / production | NOT READY FOR SIGN-OFF; required evidence/decisions remain |
| Full requested R6 verdict | **R6 VERIFICATION INCOMPLETE** |

Scope: R6 verification and two scoped corrections. Sources: §C. Files and exact
commands: [R6_VERIFICATION_REPORT.md](R6_VERIFICATION_REPORT.md). Risks: §M.
Pending review: all new files, source diff and explicit owner dispositions;
no staging, commit, push, branch change, PR, deployment, Library or Figma action.
