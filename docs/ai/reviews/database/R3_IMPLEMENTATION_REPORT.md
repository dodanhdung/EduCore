# R3 Implementation Report — local review draft

Date: 2026-10-19, Asia/Ho_Chi_Minh. **R3 PARTIALLY IMPLEMENTED — VERIFIED SUBSETS.**

## A. Executive summary

Implemented internal Nest/Prisma/PostgreSQL commands for teacher assignment,
ACTIVE enrollment, explicit transfer request/confirmation, future roster updates,
rooms, unavailability, single/weekly schedules, atomic confirmation, reschedule,
cancellation, scoped calendar reads, leave decisions, attendance/finalization and
revisioned corrections. Billing integration uses the existing R2 services.

Final evidence: **42 R3 native cases PASS**, including **19 observed two-connection
lock schedules**; **57 R2 native regressions PASS**; **39 R1b native regressions
PASS, 3 existing cases skipped/deferred**; **33 default offline/WASM/unit/scaffold
tests PASS**. Prisma validate/generate, TypeScript, Nest build, lint and diff checks
passed. These counts are separate suites, not interchangeable coverage claims.

Two affected branches remain closed: automatic placement evaluation when published
subject grades exist without a reviewed suitability policy, and attendance/leave
changes to sealed financial sources without an approved source/financial correction
coordinator. Neither branch silently changes grades, invoice history or wallets.
HTTP authentication, notification delivery and R4 jobs are deferred.

## B. Repository baseline and sources

- Branch: `feat/billing-wallet-r2`.
- Initial/final HEAD: `aaff62e718ff076f2c2595992027c5e5c4cf1bfd`.
- Initial working tree/index: clean. R1b commits `91f7f1a`, `fd01a7a` and R2
  `aaff62e` were present, with migrations 001–004. No checkout or branch change.
- Sources: AGENTS, PROJECT_CONTEXT, DECISION_REGISTER; Requirements v5 with
  v5.1 wallet amendment; UC Specification v1.3, UC-09–16 and related UC-23/24/26;
  accepted Architecture; current DB v1.1, Detailed/API designs; relevant Academic,
  Academic Exceptions, Resource Scheduling, Attendance, Billing, IAM, Tenant,
  Workflow, Audit, Automation and Notification class designs; Remediation Plan
  R3 §5, R1b plan/report and R2 report.
- Traceability: FR-09–19/26, BR-01/04/08/09/11–14, Q-03/04/05,
  NFR-02/06/11/12; H-01/02/03/04/06/09/17/20.
- Source caveat: PROJECT_CONTEXT and several design/register status paragraphs
  still say R1b/R2 are not implemented. The checked-out code, commits and current
  native evidence supersede those historical implementation snapshots. They were
  not rewritten. Class-design proposals do not override current BR/Q or owner
  decisions.

Owner decisions supplied during this task:

1. Admit a new enrollment as ACTIVE after authorized confirmation; transfer remains
   request → confirm. Other status transitions, including P1 SUSPENDED, stay closed.
2. No level column on StudentProfile, mandatory external certificate or universal
   0–10 score-to-level threshold. Prefer published subject assessments, considering
   score, subject, difficulty/level and time, potentially multiple results. When
   suitable scores are unavailable, entry-test/staff evidence needs reason/audit.
   Use a minimal internal contract and do not implement R5 in R3.

## C. Files changed

Five existing files modified and thirteen new files added; all remain unstaged.

| File | Purpose |
|---|---|
| `apps/api/package.json` | Add `test:r3:native`; no dependency changes |
| `apps/api/prisma/schema.prisma` | Absence policy/reason, correction revisions and original-record snapshot, mapped revision uniqueness |
| `apps/api/test/schema-integrity/support.ts` | Optional original enrollment start for synthetic historical fixtures |
| `apps/api/test/schema-integrity/r1b.postgres.test.ts` | Reschedule fixture moves both start/end, preserving the interval invariant |
| `apps/api/test/r2/r2.postgres.test.ts` | Construct historical enrollment/whole roster before sealing; discover appended migrations; preserve original financial expectations |
| `apps/api/prisma/migrations/202610190005_r3_academic/migration.sql` | New academic integrity, principal/auth, receipts/audit, commands |
| `apps/api/prisma/migrations/202610190006_r3_scheduling/migration.sql` | New booking exclusions/completeness, placement contract, scheduling/calendar |
| `apps/api/prisma/migrations/202610190007_r3_attendance/migration.sql` | New leave/correction fields, immutable history and commands |
| `apps/api/src/academic/r3-repository.ts` | Restricted connection, parameterized commands and transaction boundary |
| `apps/api/src/academic/academic.service.ts` | Academic commands and placement interfaces |
| `apps/api/src/academic/r3.module.ts` | Internal Nest composition; no public controllers |
| `apps/api/src/scheduling/scheduling.service.ts` | Scheduling/resource/calendar application service |
| `apps/api/src/attendance/attendance.service.ts` | Attendance and Leave application services |
| `apps/api/test/r3/r3.postgres.test.ts` | Real services, native catalog, billing and independent-connection cases |
| `apps/api/test/r3/start-r3-native.ps1` | Fresh local PostgreSQL16 admission and runner |
| `apps/api/test/r3/README.md` | Execution and evidence boundaries |
| `apps/api/vitest.config.r3.ts` | Explicit native suite configuration |
| `docs/ai/reviews/database/R3_IMPLEMENTATION_REPORT.md` | This report |

R2 production code, old migrations, old reports, Requirements/UC/design/register,
frontend and application root mounting were preserved. No pnpm-lock changes.

## D. Prisma and SQL inventory

Schema remains **67 models/28 enums**. No duplicate enrollment, resource or
attendance model was introduced. Existing tenant composite FKs remain intact.

| Migration | Invariants / tests |
|---|---|
| 005 Academic | `btree_gist`; enrollment half-open overlap EXCLUDE and interval/self-lineage CHECKs; class capacity and assignment interval CHECKs; aggregate capacity deferred guards; historical enrollment interval and transfer target/student/prior/interval protection; actor-bound commands; A01–09, X02/03/08, D01 |
| 006 Scheduling | Resource exactly-one shape, positive room capacity, valid session/series/busy intervals, ONSITE room; ACTIVE booking GiST exclusion and partial uniqueness; deferred resource/source/time/completeness/roster/assignment/capacity checks; B01–07, X01/04–08 |
| 007 Attendance | Absence policy FK and sealed reason/decision; one active absence; correction old/new revisions plus immutable original-record JSON and uniqueness; finalized historical roster insert protection; C01–06, D01/04, X09/11–15 |

Native catalog records **24 R3 functions**. Only `academic`, `scheduling`,
`attendance`, `calendar`, `placement_context` are executable by
`educore_r3_command`; no PUBLIC EXECUTE or raw table writes. Helpers use fixed
search paths and a NOLOGIN/NOSUPERUSER/NOCREATEROLE/NOBYPASSRLS owner.

Absence policy FK is nullable for existing historical rows; every new R3 request
pins it. Migration 007 refuses existing correction rows rather than inventing old
revisions/snapshots. Migration 006 refuses populated bookings/CONFIRMED sessions
pending adoption review. Fresh verification does not prove populated adoption.

Original migration SHA-256 values, unchanged against HEAD:

| Migration | SHA-256 |
|---|---|
| 001 | `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20` |
| 002 | `028fb6ffe8c05aed978a44da980df764020be94b7c20a296dff69a91f440bb76` |
| 003 | `3450ef76383b805b27114f0d7cad1ad9cfb1b6b0902cac98ab0e376f1c56d5e1` |
| 004 | `5c6952a0099ade2f2bbe30d86c01b7f2a5d2667daf538a6d31d9298913bcd0c0` |

## E. R3-A Academic

Enrollment validates same-tenant active student/class, future effective start,
target subject/level placement evidence, overlap, capacity and all affected future
session bookings. It synchronizes existing future DRAFT/CONFIRMED rosters atomically.
Transfer request has no enrollment effect; confirmation rechecks both class scopes,
source state, target placement/capacity/conflicts, closes the source interval and
creates a distinct enrollment with prior lineage. Historical participants retain
their original enrollment/class/course. Sealed lines/claims are never moved.

Teacher assignment records an authorized future interval. It refuses a different
teacher where existing sessions require explicit rescheduling. Assignment does not
grant roles or replace current permission/scope checks.

Placement context reads latest published revisions per submission version in the
same subject, with score, assessment level, grading/publication time and source IDs.
No fixed recency window, score cutoff or level conversion is invented. Multiple
candidate assessments can be returned. No published candidate permits the audited
staff/entry-test fallback. Candidate grades currently yield
`REQUIRES_GRADE_EVALUATION_POLICY`; enrollment/transfer through that branch fails
with `GRADE_SUITABILITY_ADAPTER_REQUIRES_REVIEWED_POLICY`. Reliability/difficulty/
recency evaluation remains an integration boundary, not a completed automatic
placement algorithm. See A09.

## F. R3-B Scheduling

Single and weekly DRAFT sources use frozen tenant timezone and UTC instants.
Weekly expansion uses local calendar dates; exactly six calendar months is
accepted, six months plus a day is rejected. Nonexistent/ambiguous local start
times fail explicitly. Duration is elapsed minutes; recurrence never adds fixed
UTC weeks. Confirm rechecks roster, valid assignment, resource bookings and both
capacities. A final occurrence conflict rolls back the entire confirmation.

Teacher/room/student and confirmed unavailability share the same resource registry
and ACTIVE exclusion. RELEASED/CANCELLED do not reserve resources. Deferred checks
reject missing/wrong bookings and inconsistent confirmed rosters, including inverse
capacity/assignment/enrollment changes. Legacy COMPLETED evidence stays under
R1b/R2 immutable source guards; it is not backfilled with fabricated bookings.

Future reschedule/cancel uses revision CAS, releases/rebooks atomically and appends
`ScheduleChanged` outbox data with policy and the audit correlation. Past/billed
source changes fail under retained R1b guards. No G2, invoice, wallet or financial
adjustment is created by those commands. Calendar reads are tenant scoped, bounded
to 31 days, filter assigned Teacher/own Student/verified Parent and return at most
1001 entries. Public paging/HTTP transport is deferred.

## G. R3-C Attendance and leave

Submission uses server time and participant scope. Exact 24h is on time; late
approval requires `absence.approve_late`. Requests never auto-approve or create
attendance. Requesters cannot approve themselves. Decisions preserve requester,
reason, actor, time and pinned policy and cannot be rewritten.

Ordinary mark/finalize requires the assigned teacher and current permission.
Scoped Manager/Academic Staff can resolve an unconfirmed overdue source as Q-05
allows. Finalize rejects incomplete active rosters. Missing attendance is never
UNEXCUSED implicitly. EXCUSED needs approved leave; actual ATTENDED overrides it.

Normal edits check the effective 48h/issued-claim lock directly. Exact 48h is
covered by the DB-time predicate test; actual late/claimed sources are exercised.
The historical ISSUE integration fixture is already older than 48h, so it does
not separately time-travel an ISSUE occurring before that boundary.

Authorized corrections use revision CAS, required reason/audit and append-only
old/new status/revision plus the complete previous attendance record snapshot.
If a persisted invoice line already seals the source, including a draft line,
the command fails closed. Existing R1b protections were not bypassed to update
source facts behind an invoice. Financially sealed correction execution remains
blocked pending a reviewed source/financial coordinator.

## H. R3-D integration

Real R2 GenerationService/InvoiceLifecycleService consume R3 finalized records.
ATTENDED and UNEXCUSED charge one; approved EXCUSED charges zero. Existing R2 G04
verifies CANCELLED zero with no fabricated attendance. Unfinalized input creates
NEEDS_INFORMATION; explicit G2 after finalization preserves G1 and applies the new
snapshot. ISSUE keeps permanent participation claims and immutable invoice history.

R3 X cases record 19 observed independent-connection schedules: competing bookings
with commit/rollback; last seats; enrollment/transfer; room resize/booking;
reschedule and unavailability vs confirmation; cancellation/rebooking; enrollment
roster/confirmation; correction CAS; permission revoke; ISSUE/correction;
finalization/G2/ISSUE; G2/source mutation in both orders; Parent link revoke/leave;
roster/finalize in both orders. Scheduling authority revocation is tested through
the staff confirmation principal; Teacher attendance scope/current revocation is
separately exercised by C05 and the observed X16 revoke/finalize race.

R2 regression supplies another 35 observed financial/source schedules; R1b records
32 shared protocol schedules. Counts are not summed into a new R3 test count.

## I. PostgreSQL verification and evidence

Installed Docker Desktop was started; no system software was installed. Tests used
separate new local Docker containers/anonymous volumes, random loopback ports and
private generated credentials. No pre-existing database/container was reset or
removed. Successful and failed task-owned targets are retained for inspection.

Final R3 target: PostgreSQL **16.15** (`server_version_num=160015`),
`educore-r3-native-2781ea56a41549e29bdf01d3604dc74f`, loopback port `58242`,
database `educore_r3_native_2781ea56a41549e29bdf01d3604dc74f`. All seven migrations
have actual finished history. Native R2 drift comparison matches current Prisma.

Sanitized evidence locations:

- R3 environment: `C:/Users/Admin/AppData/Local/Temp/educore-r3-native-2781ea56a41549e29bdf01d3604dc74f/environment.json`.
- R3 cases, migrations, catalog and 19 schedules: `C:/Users/Admin/AppData/Local/Temp/educore-r3-evidence-oOnNic/evidence.json`.
- R2 final environment run: `educore-r2-native-1eab6ba0f8c047f29b2e686d9d3f9085`; evidence `C:/Users/Admin/AppData/Local/Temp/educore-r2-evidence-qIWCBd/evidence.json`.
- R1b final environment run: `educore-r1b-native-7f100830ad0146df95542fc377814e64`; evidence `C:/Users/Admin/AppData/Local/Temp/educore-r1b-pg-evidence-TxGS7G/evidence.json`.

Earlier red runs exposed SQL alias/trigger-field defects, the real NEW outbox enum,
a JSON double-serialization issue confined to the raw concurrency harness, Prisma
index drift and old fixture assumptions. All were corrected and the full affected
suites rerun. Failed target evidence is retained; no migration was marked applied
to bypass a failed R3 deploy. R2's existing migration-fault/recovery test also reran.

## J. Acceptance matrix

Locations: A=`academic.service.ts` + migration005; B=`scheduling.service.ts` +
migration006; C=`attendance.service.ts` + migration007; tests in R3 native file
unless marked R2/R1b. PASS rows cover the stated tested behavior only.

| Requirement / acceptance | Location | Test / actual evidence | Status |
|---|---|---|---|
| FR-09 / AC-09-01 assigned class + permissions | A/auth | A05, C05 | PASS |
| AC-09-02 teacher changes cannot bypass conflicts | A/B | A05, B01, X01 | PASS |
| Q-03 / AC-10-01 request has no transfer effect | A | A03 replay/state assertions | PASS |
| AC-10-02 seat/conflict recheck | A/B | A07, X02/03/08 | PASS |
| AC-10-03 future effective transfer, old identity | A | A04/08, D01; R2 G16 | PASS |
| Owner placement amendment: fallback/context | A/B | A07/09 | PASS |
| Owner placement: automatic reliable-grade evaluation | Placement contract | A09 verifies explicit unresolved state | BLOCKED |
| FR-11 / AC-11-01 confirmed busy conflict | B | B03, X05/X06 combined case | PASS |
| AC-11-02 room capacity | B | B02, X04 | PASS |
| BR-01 / AC-12-01 adjacent sessions | B/GiST | B01 | PASS |
| AC-12-02 teacher/room/student, CANCELLED release | B/GiST | B01/07, B04, X07 | PASS |
| Q-04 / AC-12-03 all-series atomicity | B | B05 final-occurrence conflict | PASS |
| Q-04 six months/DST/C1 | B/R1b | B05/06; R1b T18–20/24 | PASS |
| FR-16 / AC-13-01 release without financial rewrite | B | B04, X07; R1b T10/11/22 | PASS |
| AC-13-02 student conflict on changed time | B | B07 + shared GiST, X05 reschedule | PASS for shared booking protection |
| UC-13 in-app event production | B/outbox | B04 committed event assertions | PASS |
| UC-13 in-app delivery runtime | R4 consumer | Event persisted, no consumer delivery claim | DEFERRED |
| AC-14-01 Teacher/Student schedule scope | B/auth | B08 assigned Teacher/own Student/class-scoped staff; C05 | PASS |
| AC-14-02 Parent current verified link | B/auth | C02; X14 leave revoke schedule | PASS for tested read/revoke branches |
| BR-04 / AC-15-01 charge units | C/R2 | D01/04; R2 G04/G11 | PASS |
| AC-15-02 wrong Teacher denied | C/auth | C05 | PASS |
| Q-05 / AC-15-03 lock/correction/audit | C/R1b | C01/04, D01, X09/11 | PASS for unsealed correction and sealed rejection |
| AC-15-03 apply financial-source correction | C→FinancialCoordinator | Deliberate fail-closed boundary, no automatic financial effect | BLOCKED |
| AC-16-01 exact 24h + approved leave | C | C01 predicate, C02 actual decision, D04 fees | PASS for combined evidence |
| AC-16-02 23h requires late permission | C | C03 | PASS |
| AC-16-03 Parent scope/no self approval | C | C02 | PASS |
| H-01 / T-04/05 enrollment/transfer lineage | A | A01/08, X02/03, D01 | PASS subset |
| H-02 / T-09 same-session FK regressions | Existing FKs/C | R1b T08/14/15 | PASS subset |
| H-03 / T-10–12 complete roster/authority/lock | C | C01/04/05, X15 both orders | PASS subset; financial correction blocked |
| H-04/H-06 / T-17 immutable monthly source/claims | Existing R1b/R2 | D01/02, X11–13; all R1b/R2 suites | PASS subset; H-04 remains OPEN |
| H-09/H-17 / T-02–05 booking EXCLUDE/completeness/capacity | B | B01–07, D03, X01–08 | PASS subset |
| H-20 append-only source/correction/audit | A/C/shared | C04, D03, R1b T17/21/32 | PASS subset |
| NFR-02 representative-scale conflict benchmark | — | Scale fixture not approved/measured | NOT RUN |
| NFR-12 ≥80% unit branch coverage | — | Native SQL tests are not a unit coverage metric | NOT RUN |
| HTTP authentication/authorization integration | R4 | Internal verified test principals only | DEFERRED |

## K. Tests actually run

Commands run from repository root; pnpm commands use `--dir apps/api`:

| Command | Final result |
|---|---|
| `pnpm.cmd --dir apps/api exec prisma validate` | PASS |
| `pnpm.cmd --dir apps/api exec prisma generate` | PASS, Prisma Client 7.10.1 |
| `pnpm.cmd --dir apps/api exec tsc --noEmit` | PASS |
| `pnpm.cmd --dir apps/api build` | PASS |
| `pnpm.cmd --dir apps/api lint` | PASS, final no diagnostics |
| `pnpm.cmd --dir apps/api test` | PASS, 33 cases / 4 files; includes static, WASM, R2 calculator and scaffold |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r3/start-r3-native.ps1 -RunTests` | PASS, 42 native cases, 19 observed schedules |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r2/start-r2-native.ps1 -RunTests` | PASS, 57 native cases, 35 observed schedules, empty Prisma drift |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/schema-integrity/start-r1b-native.ps1 -RunTests` | PASS, 39 cases / 3 existing skipped; 32 observed schedules |
| `git diff --check` | PASS |
| `git diff --quiet HEAD -- <migrations001–004>` | PASS; old migrations unchanged |

No new isolated R3 unit suite or coverage/performance claim. R1b skipped cases
remain T37 populated adoption, T41 authenticated HTTP runtime and T42 independent
restore/tzdata upgrade. They were not silently enabled or counted as passes.

## L. Technical decisions

- Reuse operator-owned R2 principal binding rather than trust actor IDs/GUCs.
- User SHARE → Tenant NO KEY UPDATE at READ COMMITTED; resolve targets and
  reauthorize under the gate, then sorted resources/source rows. Retain R2
  Wallet → Invoice order; R3 does not mutate finance.
- Use existing tables, narrow SQL commands, row locks, constraints and durable
  receipts. No generic workflow/rule/event-sourcing framework or broker.
- Service Prisma transactions force deferred checks before returning a result.
  Raw postgres.js negative fixtures also force constraints in explicit transactions
  so an implicit-commit deferred error cannot be mistaken for a successful write.
- Keep ordinary source edits blocked once R1b has sealed lines, rather than
  weakening historical source guards for correction or implicit G2.
- Reject ambiguous/nonexistent local recurrence starts pending explicit policy.
  No silent DST shift.

These are implementation choices for review, not edits to old approval registers.

## M. Remaining risks and dependencies

1. Grade suitability integration: published candidates are available, but automatic
   reliability/subject-level/recency evaluation needs a reviewed adapter/policy.
   The current conservative branch blocks even a potentially unsuitable old
   same-subject candidate; it does not falsely call that candidate reliable.
2. Sealed financial corrections: source/financial coordination and any authorized
   adjustment mapping remain blocked. No source overwrite, G2, wallet credit or
   invoice mutation is performed automatically.
3. Conservative admission: current enrollments and assignments require future
   effective starts. Other enrollment state transitions remain closed as approved.
4. HTTP AUTH / R4 INTEGRATION DEFERRED. Test LOGIN/session bindings are not
   production authentication, cookie/CSRF, IAM management or a public API contract.
5. ScheduleChanged delivery, workflow/jobs, operational retries/manual recovery
   and inbox endpoints remain R4 work; persisted events are not delivered notices.
6. Populated academic/financial adoption, original provenance/backfills, restore,
   deployment and tzdata upgrades were not verified. No shared/production target
   was touched. Retained task test resources require later cleanup review.
7. The early-ISSUE-before-48h temporal integration matrix, representative
   performance and ≥80% unit branch coverage are not established.
8. H-04 remains OPEN. Finding closure needs full D/S/P/R evidence, including
   dependent scopes, not merely this native pass. No P1 or R4 implementation was
   opened and no external business notification/integration was added.

## N. Git preservation and pending review

HEAD/branch/index unchanged; all new/modified files remain local and unstaged.
No commit, push, checkout/reset/merge/rebase, PR, deploy, Library or Figma write.
Every new file needs review before Git, per repository instructions. The four old
migration bytes/checksums and previous implementation reports are preserved.

## O. Verdict and next steps

**R3 PARTIALLY IMPLEMENTED — VERIFIED SUBSETS.** Review the local code, migrations,
tests and the closed branches above. The 42 native cases and preserved R1b/R2
regressions verify the implemented internal subset. They do not justify calling
the entire R3 acceptance matrix complete, closing H-04 or claiming authenticated
HTTP/production readiness. Work stops at R3; R4/R5/frontend were not started.

## R3 Follow-up — Leave Claim Guard & Grade-Based Placement

Date: 2026-10-19, Asia/Ho_Chi_Minh. This section records the follow-up against the
committed R3 checkpoint. Sections A–O above are preserved as historical evidence;
the changed placement and early-ISSUE statuses below supersede their old status
descriptions only. No finding or project-wide acceptance is silently closed.

### Baseline, scope and sources

- Branch: `feat/scheduling-attendance-r3`.
- Initial/final HEAD: `24482eb27b219e2339c3ecf150010857a44e725a`.
- Initial working tree and index: clean. Migrations 001–007 already existed in
  the checkpoint and remain byte-identical. No Git mutation was performed.
- Scope: repair leave claim resolution/replay ordering; enable grade-backed
  authorized enrollment/transfer; native regression and an append-only report
  update. No frontend, R4 runtime or new R5 grading application.
- Sources: the owner's R3 follow-up and prior approved enrollment/placement
  decisions; AGENTS, PROJECT_CONTEXT, DECISION_REGISTER; current Requirements
  v5/v5.1, UC v1.3 (Q-03/Q-05 and related FR/BR); existing DB/Detailed/API and
  Academic, Academic Exceptions, Attendance/Leave, Scheduling, Assignments/Grading
  and Billing class designs; actual migrations/services and R2/R3 reports.
  Historical implementation-status paragraphs in project documents remain stale;
  this report uses the checked-out branch and measured evidence.

### Root cause and forward migrations

Migration007 checked `invoiced_participation_claims.participant_id=p.id` before
loading `p`. Its NULL ID made EXISTS false. The harness deploys the original seven
migrations first and reproduces **both** APPROVE and REJECT succeeding after real
ISSUE, with `time_locked=false` and one permanent claim.

Migration008 replaces only `attendance(uuid,jsonb)`. It resolves absence → actual
participant → session within the tenant, authorizes, locks/revalidates source
rows, validates the identity chain and checks claims using the loaded participant.
The existing principal takes User SHARE → Tenant NO KEY UPDATE before resolution;
ISSUE uses that same predicate gate, including when no claim exists yet. No
invoice/wallet lock or mutation is introduced. The claim check precedes replay
and decision effects. Late approval also rechecks `absence.approve_late` before
replay, so revoking that specific permission cannot expose an old approval result.
Signature, owner, SECURITY DEFINER, search_path and command ACL are preserved.

Migration009 adds private grade-evidence helpers and replaces placement/context
and academic functions without adding tables or columns. It adds a grade source
tenant-gate trigger to serialize new revision phantoms with confirmation. Existing
source rows are locked FOR SHARE; narrow `UPDATE(id)` privileges for the NOLOGIN
owner allow those locks and confer no raw DML on runtime LOGINs. Future R5 writers
must still follow User → Tenant before source DML. This is not a grading writer,
published-grade lifecycle or authorization API.

| New migration | SHA-256 of actual file bytes |
|---|---|
| `202610190008_r3_leave_claim_guard` | `88d947296253dcfd674466562e612daaf873e0dbd2cb755722ae64a9330e30dd` |
| `202610190009_r3_grade_placement` | `1a87180879defb3f7e542e0d8dcd1324efd802b58cade08fc7e25d9d00d211b6` |

### Grade-backed placement contract — IMPLEMENTED

`placementContext` returns the target course/subject/level and same-subject
published assessment candidates, newest publication first. The database verifies
Grade → SubmissionVersion → Submission → AssignmentRecipient → Assignment →
Class → Course, including every tenant and student ownership predicate. Only
SUBMITTED versions and valid PUBLISHED grades with nonfuture publication and
`gradedAt <= publishedAt` qualify. It chooses the latest valid published revision
per submission version; a newer DRAFT does not hide an earlier published revision.

Evidence includes score as a decimal string, assessment subject/level, publication
and grading times, Grade ID/revision, source lineage and an evidence hash. There
is no hard age cutoff or universal score threshold. Different assessment levels
remain evidence for staff judgment; Level.sortOrder performs no conversion.

An authorized Manager/Academic Staff confirms within the existing ENROLL or
TRANSFER_CONFIRM command using basis `PUBLISHED_GRADES`, target subject/level,
nonempty reason and one or more `{gradeId, revision, evidenceHash}` references.
The command re-reads and locks current database evidence, rejects ineligible,
duplicate, missing or stale references, and ignores caller-supplied scores or
identity metadata. Changed score, published revision or source level invalidates
the context hash. A new context must be reviewed before retrying stale input.

The trusted snapshot is stored in `result.placementEvidence`, already persisted
immutably by audit and idempotency receipts. It contains selected DB-derived
grades, lineage, target course/subject/level, confirmer membership, DB time and
reason. Request hashing remains based on the original request. Successful replay
returns the original receipt after fresh authorization; later grade changes do
not rewrite historical confirmation evidence. Transfer still requires explicit
authorized confirmation and preserves original participant/enrollment lineage.

`ENTRY_TEST` and reasoned `STAFF_CONFIRMATION` remain available when suitable
results are unavailable. The existence of any same-subject grade alone no longer
blocks enrollment. The receipt records available candidate count and the fallback
reason. No certificate is required; StudentProfile is unchanged. Staff assesses
grade suitability, including time and difficulty, because no approved rubric is
present. **Automatic recommendation remains `DEFERRED_NO_APPROVED_RUBRIC`.**

### Cases and temporal/concurrency evidence

| Cases | Verified behavior | Result |
|---|---|---|
| Checkpoint007 → 008/009 upgrade | Old APPROVE/REJECT bug reproduced; real forward deploy; all migration checksums match; owner/ACL preserved; legacy buggy receipts denied without effects | PASS |
| FU-A01, FU-A06 | Ordinary approve/reject and replay; fresh general and specific late permission checks | PASS |
| FU-A02, FU-A05 | ISSUED claims block approval/rejection and old replay; forged participant/session hints and wrong tenant cannot bypass; finance/source/audit/receipt snapshots unchanged | PASS |
| FU-A03 | Real ISSUE with `time_locked=false`; actual assigned Teacher cannot ordinarily edit the source | PASS |
| FU-A04 | APPROVE/REJECT vs ISSUE, both writer orders and first-writer COMMIT/ROLLBACK, eight observed waits | PASS |
| FU-B01 | Latest valid published revisions, multiple dates/levels, grade-backed enrollment | PASS |
| FU-B02–04 | Wrong student/subject/tenant, DRAFT, missing/duplicate/hashless/stale evidence rejected; DB-derived immutable audit and replay | PASS |
| FU-B05–06 | Explicit authorized transfer and historical lineage; entry-test/no-grade/unsuitable-grade fallback; unauthorized actor denied | PASS |
| FU-B07 | Published revision vs confirmation, both writer orders; stale read rejected or committed receipt retained | PASS |
| FU-B08 | Grade-backed future enrollment preserves existing G1 snapshot, issued claim and wallet | PASS |
| Existing A/B/C/D/X cases | Academic, scheduling, 48h boundary, attendance, source correction, G1/G2 and authorization regressions retained; A09 updated to the now-working grade-backed branch | PASS |

Early-ISSUE fixtures use an intentionally long synthetic original interval that
starts in the previous UTC month and ends one hour before the **real PostgreSQL
clock**. Thus the local-start billing month is genuinely closed while elapsed
time after the end is under 48h. They use actual finalized attendance, G1, ISSUE
and permanent claims, without time overrides, production function substitution
or period bypass. This isolates the two independent locks; it is not evidence
of a normal class-duration contract or a production historical backfill.

On this finalized ATTENDED source, a leave decision committed before ISSUE does
not alter R2's billed status/units, so subsequent ISSUE may succeed. If ISSUE
commits first, both decisions fail. If the first ISSUE rolls back, the waiting
decision succeeds. This follows the existing R2 capture/fingerprint rather than
inventing an invoice rewrite or a new stale-generation rule.

### Verification results and retained evidence

Commands were run from repository root. Native runners use separate newly
created PostgreSQL 16 Docker clusters, anonymous volumes, loopback ports and
private process credentials. No shared database was used or reset.

| Command actually run | Final result |
|---|---|
| `pnpm.cmd --dir apps/api exec prisma validate` | PASS |
| `pnpm.cmd --dir apps/api exec prisma generate` | PASS, Client 7.10.1 |
| `pnpm.cmd --dir apps/api exec tsc --noEmit` | PASS |
| `pnpm.cmd --dir apps/api build` | PASS |
| `pnpm.cmd --dir apps/api lint` | PASS, final no diagnostics |
| `pnpm.cmd --dir apps/api test` | PASS, 33 cases / 4 files |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r3/start-r3-native.ps1 -RunTests` | PASS, 56 cases, 29 observed schedules |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r2/start-r2-native.ps1 -RunTests` | PASS, 57 cases, 35 observed schedules, EMPTY Prisma schema drift |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/schema-integrity/start-r1b-native.ps1 -RunTests` | PASS, 39 cases, 3 existing skipped, 32 observed schedules |
| `git diff --check` | PASS |
| `git diff --quiet HEAD -- apps/api/prisma/migrations` | PASS, tracked migrations 001–007 unchanged |
| Historical report prefix compared with HEAD | PASS, sections A–O preserved |

R1b still skips T37 populated adoption, T41 authenticated HTTP and T42 independent
restore/tzdata upgrade. They are not counted as passes. R1b/R2 deploy 001–009
directly on fresh targets; R3 exercises populated **synthetic checkpoint** upgrade.
Neither constitutes R6 real populated-data adoption or restore verification.

Retained final evidence:

| Suite | Container / loopback port | Sanitized evidence JSON |
|---|---|---|
| R3 | `educore-r3-native-9f88d8c908384166ba38694a94fe7593` / `49172` | `%TEMP%/educore-r3-evidence-uG6sKS/evidence.json` |
| R2 | `educore-r2-native-a69dd3a7b2284684b1bbc8b2f3860845` / `50669` | `%TEMP%/educore-r2-evidence-rypELA/evidence.json` |
| R1b | `educore-r1b-native-00184c554db94acbb139c26e2a078b4d` / `50670` | `%TEMP%/educore-r1b-pg-evidence-aIE1LE/evidence.json` |

Intermediate verification is also retained: the initial 47-case follow-up run
passed 46 cases and failed an overly strict leave-first ISSUE expectation. The
expectation was corrected against the unchanged R2 ATTENDED capture semantics;
the subsequent 55-case run passed all cases. An added 56th late-permission test
initially attempted to change immutable absence metadata and correctly failed
with `ABSENCE_REQUEST_IMMUTABLE`; its synthetic original data is now created with
the correct late notice at insert time. No production guard was weakened and no
failed migration was marked applied to bypass a failure. Failed evidence remains
under `%TEMP%/educore-r3-evidence-8fw76s/` and `educore-r3-evidence-DZhjQu/`.
The final R3 rerun passes all 56 cases, including the specific late-permission
revocation check. No final test failure remains.

### Files changed and Git preservation

Five existing files modified and two new migration files; all remain unstaged:

| File | Follow-up change |
|---|---|
| `apps/api/prisma/migrations/202610190008_r3_leave_claim_guard/migration.sql` (new) | Verified participant claim guard and authorization before replay |
| `apps/api/prisma/migrations/202610190009_r3_grade_placement/migration.sql` (new) | Private evidence verification, locks/revision gate, authorized snapshot integration |
| `apps/api/src/academic/academic.service.ts` | Published-grade reference/context internal TypeScript contract |
| `apps/api/test/r3/r3.postgres.test.ts` | Real checkpoint upgrade, defect reproduction, leave/ISSUE and placement verification |
| `apps/api/test/schema-integrity/support.ts` | Optional explicit fixture end; existing default duration unchanged |
| `apps/api/test/r3/README.md` | Upgrade and temporal/grade fixture documentation |
| `docs/ai/reviews/database/R3_IMPLEMENTATION_REPORT.md` | This appended follow-up section |

Branch, HEAD and index unchanged. No commit, push, branch/checkout, reset, merge,
rebase, PR, external application write or deployment. Every new file remains
pending review before Git. Task-owned test containers/volumes are retained for
inspection; no cleanup deletion was performed.

### Risks, deferred branches and review verdict

| Branch / acceptance | Current status |
|---|---|
| Grade-backed authorized placement confirmation | IMPLEMENTED; enrollment and transfer use database-verified immutable evidence |
| Automatic grade-to-level recommendation | DEFERRED; no approved per-subject/difficulty/recency rubric; no invented cutoff |
| Sealed attendance/leave financial correction | BLOCKED; an approved source/financial coordination contract is still absent; ordinary changes fail closed |
| HTTP authentication/controllers, full IAM, jobs/workflow and notification delivery | DEFERRED to R4 |
| Assignment/grading lifecycle and published grade write API | DEFERRED to R5; existing data reused only |
| R6 adoption/backup/restore/independent audit | NOT VERIFIED; H-04 remains OPEN |
| Representative performance and ≥80% unit branch coverage | NOT ESTABLISHED; native SQL passes are not those metrics |

Recommendation: accept the two bounded follow-up changes for code review after
the recorded checks, retaining these boundaries. **R3 remains PARTIALLY
IMPLEMENTED — VERIFIED SUBSETS**, not complete acceptance or production readiness.
