# R5 implementation report

Date: **2026-10-20, Asia/Ho_Chi_Minh**. Local implementation and disposable verification only.

## A. Executive summary

**R5 IMPLEMENTED — POSTGRESQL, HTTP & FILESYSTEM VERIFIED — READY FOR REVIEW**

Implemented R5-A through R5-E: authenticated assignment creation/publication,
recipient snapshots, immutable submission versions, explicit grade publication
and corrections, private file storage and non-destructive reconciliation. Uses
the existing Grade table, R4 authentication/permissions/audit/outbox and R3 grade
placement. No frontend, R6, P1, deployment or external business integration.

Verification: R5 combined native run **42/42 PASS**, followed by the added A05/E03
calendar/security-contract tests **2/2 PASS** on a separate fresh cluster. All **44 distinct
R5 native cases** have passed; the final A05/E03 invocation intentionally filtered
out the other 42. There was no single 44-case run. Filesystem tests **10/10 PASS**
in the final default suite; full default suite **51/51 PASS**; scaffold E2E
**1/1 PASS**. R1b **39 PASS / 3 existing skips**, R2 **57/57**, R3 **56/56**,
R4 **54/54**. Typecheck, build, lint, Prisma validation/generation and schema
drift checks passed. See exact runs and limitations below.

## B. Repository baseline and sources

- Branch: `feat/assignments-grading-files-r5`.
- HEAD: `1f059711b864719ac73ecaeb2b7e26f61e4df414`, committed R4 baseline.
- Verified preceding R3 follow-up `ca18e59`, R3 `24482eb`, R2 `aaff62e`, and
  R1b native/integrity commits `fd01a7a` / `91f7f1a`.
- Requirements v5 with current wallet amendments; UC specification v1.3;
  accepted architectural design; checked-out database/detailed/API design;
  Assignments/Grading, File, Academic, IAM, Notification, Jobs, Audit and Tenant
  Policy module documents; remediation plan R5 §5; R2/R3/R4 reports.
- Business trace: FR-32–35, FR-37/39, UC-27–29 and UC-31, BR-08/12/14, Q-11.
  Proposed class diagrams did not provide independent business approval.
- `PROJECT_CONTEXT.md` and parts of the Decision Register describe historical
  scaffold/non-implementation states. Actual checked-out code and commit history
  establish the implemented R1–R4 baseline; those documents were not rewritten.
- The owner's attached FULL R5 implementation request is the approved task
  specification and explicitly opens all five sequential R5 checkpoints.

### Decisions approved directly during this task

**O-08 A:** Saving a draft locks resubmission. Cancelling the draft reopens
submission only without published history. Grade only the current submitted
version. A correction draft cannot hide the newest published revision.

**O-09 A:** **10,000,000 bytes/file**. Cutoff is effective deadline plus exactly
**168 hours, inclusive**. No automatic physical deletion or invented cleanup TTL.
The owner explicitly selected these options. The Decision Register was left
unchanged, as requested. This report records the session authority.

**O-13:** Existing Assignment/SubmissionVersion/Grade/StoredFile enum contracts
were retained. Draft cancellation is retained metadata, not a new public enum
state. ApprovalStatus was not reused for learning objects; no P1 states opened.

## C. Files changed

Modified tracked files:

- `apps/api/package.json`: R5 scripts; no new dependency or lockfile change.
- `apps/api/prisma/schema.prisma`: recipient class/file context, version deadline
  evidence, draft cancellation, unbounded numeric score, matching unique indexes.
- `apps/api/src/identity-access/r4.module.ts`: R5 services/controllers using the
  existing AuthService and optional injected private storage; CORS `If-Match`.
- `apps/api/src/main.ts`: initialize required `R5_PRIVATE_STORAGE_ROOT`.
- `apps/api/test/r3/r3.postgres.test.ts`: valid legacy-history fixture import and
  stronger published-grade immutability/revision expectations.

New files, all **untracked and pending review**:

```text
apps/api/prisma/migrations/202610200019_r5_assignments/migration.sql
apps/api/prisma/migrations/202610200020_r5_submissions/migration.sql
apps/api/prisma/migrations/202610200021_r5_grading/migration.sql
apps/api/prisma/migrations/202610200022_r5_private_files/migration.sql
apps/api/prisma/migrations/202610200023_r5_notification_source/migration.sql
apps/api/src/assignments-grading/assignment.service.ts
apps/api/src/assignments-grading/submission.service.ts
apps/api/src/assignments-grading/grading.service.ts
apps/api/src/assignments-grading/learning.controller.ts
apps/api/src/file-management/file-validation.ts
apps/api/src/file-management/private-volume.adapter.ts
apps/api/src/file-management/file.service.ts
apps/api/src/file-management/file.controller.ts
apps/api/test/r5/file-fixtures.ts
apps/api/test/r5/files.spec.ts
apps/api/test/r5/r5.postgres.test.ts
apps/api/test/r5/start-r5-native.ps1
apps/api/test/r5/README.md
apps/api/vitest.config.r5.ts
docs/ai/reviews/database/R5_IMPLEMENTATION_REPORT.md
```

Pre-existing tracked deletions, preserved without restoration or staging:
`EduCore-R3-changes-2026-10-19.zip`,
`EduCore-R3-follow-up-changes-2026-10-19.zip`,
`EduCore_R4_changes_20261019.zip`,
`docs/ai/reviews/database/O12_DOCUMENTATION_SYNC.patch`,
`docs/ai/reviews/database/WALLET_PHASE2_DOCUMENTATION_SYNC.patch`, and the
root artifact whose Git-quoted name is
`"ma P0 schema through billing (2A-2E)\357\200\242"`.
These deletions are not R5-authored changes. Generated Prisma/build outputs use
the existing ignored directories.

## D. R5-A — assignments and recipients

Teacher identity comes from the current authenticated membership and active
Teacher profile. Each target requires both current permission/scope and an
effective class-teacher assignment. The client cannot select another Teacher ID.
Class targeting or explicit student targeting is supported. Ambiguous multiple
eligible classes require an explicit classId rather than choosing silently.

Draft selection is retained in recipient rows. Publication revalidates effective
enrollment and profile status under the existing User → Tenant lock protocol,
then commits PUBLISHED, immutable student/enrollment/class snapshots, audit,
idempotency receipt and one ASSIGNMENT_PUBLISHED outbox event atomically.
Transfer does not rewrite the published recipient's class/enrollment identity.

Priority is 1–5; deadlines are finite timestamps. Revision/If-Match guards reject
stale edits. Submitted requirements cannot be rewritten or deadlines shortened;
extension requires a reason and audit. Recipient-specific extension and
revocation require a reason and assignment revision. Revocation preserves rows
and blocks further submissions. Archive preserves history. No edit notification
or deadline reminder was added.

## E. R5-B — submissions

Only the actual Student owner can submit, even if a Parent has read permission.
The authenticated transaction rechecks recipient lineage and current authority.
One container per recipient; every successful submission appends the next version
and atomically advances the composite current-version pointer. Deferred checks
ensure the pointer identifies the latest version; version content and submitted
file lists cannot be updated, deleted or appended later.

DB time sets submittedAt, lateness and the effective-deadline snapshot. Deadline
and recipient override use the greater timestamp, so an earlier override cannot
undo a later extension. Exact deadline is on time; +1 microsecond is late;
deadline +168 hours is accepted; the next microsecond is rejected. A failed file
or metadata transaction does not create a successful submission.

Shared tenant/submission locking serializes resubmit, draft creation, publication,
assignment edits and extensions. Any uncancelled draft or published grade blocks
resubmission. Old versions, including their original late flags, remain intact.

## F. R5-C — grades and historical evidence

Reuses `grades`; no parallel grading system. Both HTTP/application and SQL
validate decimal-string score input before storage. The column is unbounded
numeric with range/scale CHECK, preventing Decimal(3,1) pre-check rounding.

Saving a draft appends a revision and cancels a previous live draft. CAS uses the
latest revision, and a partial unique index permits only one live draft/version.
Cancellation retains the draft row. Publishing is explicit. Corrections require
current `grade.correct`, reason and CAS, produce a draft revision, and require
explicit publication. Published rows cannot be updated or deleted.

Student/Parent queries select PUBLISHED rows server-side and exclude superseded
published revisions. Draft read requires current Teacher scope. R3 evidence keeps
its original grade ID/revision/hash; a later correction neither rewrites a receipt
nor re-evaluates enrollment. R3 source joins also support student-targeted
assignments through the recipient's historical class snapshot.

## G. R5-D — private files

FileStoragePort and PrivateVolumeStorageAdapter use a dedicated private root,
server-generated tenant/UUID keys, exclusive writes, atomic no-overwrite
promotion, symlink/ancestor checks, private modes where supported, bounded reads,
size and SHA256 verification. The API OS identity must exclusively control the
root and its ancestors; application checks do not replace OS filesystem ACLs.

Upload uses authenticated bounded multipart, extension + declared MIME + actual
signature checks. DOCX validates a bounded ZIP directory and required OOXML parts;
it rejects path escapes, encryption, ZIP64/unsupported forms, oversized expansion,
macros/embedded binaries, external relationships and entity declarations.
This is type validation, not an antivirus or complete document/raster decoder.

Metadata commits STAGING, bytes stage/promote privately, then verified READY
metadata commits. Submission validates READY ownership and actual bytes inside
its transaction. Five unique slots bound attachments even under competing
writers; immutable submitted snapshots eliminate post-submit append races.

Download requires a current session, tenant, resource lineage, permission and
actual SubmissionFile link before reading bytes. It returns an attachment stream
with nosniff and private no-store headers. FileInfo and errors expose no private
key/path. Parent file permission is not a new default grant; when explicitly
granted it still requires the current verified relationship.

Reconciliation requires existing tenant-wide audit.read. It scans under the
tenant gate and reports missing/corrupt/unfinished/orphaned metadata and unknown
volume objects, with a summary audit. It performs **zero physical cleanup** and
does not rewrite references or attempt automatic restoration. Operational
promotion unlinks only its own staging hardlink after creating the final object;
this is not a historical-file cleanup policy.

## H. R5-E — R3/R4 integration

R4's registered live access token binds the private transaction principal;
services use that same restricted API repository. Controllers use SessionGuard,
strict field allowlists and UUID/revision validation. Domain commands recheck
permission after locking. R5 activates only learning permissions in the existing
R4 predicate and the Q-11 Teacher correction grant. No second IAM framework.

Assignment publication writes the actual R4 event source. R5 events notify only
the eligible snapshotted Students, recheck access when read, and deduplicate
delivery. Uncommitted publication is invisible to dispatch. Worker failure is
separate from the committed assignment. R4 scheduling-event behavior is retained.

R4 audit/policy/correlation primitives are reused. Audit snapshots contain result
IDs/status, not answers, draft feedback or file bytes. The E01 HTTP journey covers
Teacher/Student/Parent/Academic Staff login, upload/submission, draft hiding,
publish, placement evidence/enrollment pinning, correction, download and replay.

## I. Database and migrations

019 adds assignment/recipient integrity, class snapshot, learning permission
activation and narrow assignment commands. 020 adds version/current-pointer,
attachment and submission guards plus recipient file context. 021 adds numeric
precision, draft/publication/revision immutability and R3 evidence compatibility.
022 adds file metadata/namespace/ownership/state guards. 023 connects the actual
notification source and recipient extension/revocation commands.

Uses existing NOLOGIN `educore_r4_owner` and restricted R4 API/auth/worker LOGINs.
No new superuser runtime, generalized procedure gateway, raw runtime DML grant or
caller-selected role. R5 functions have fixed search paths and no PUBLIC execute;
only the necessary entrypoints are granted to the API role. Existing tenant gates
serialize predicates; row locks and FK/UNIQUE/CHECK/partial indexes enforce local
identity and state. Grade source gates continue to serialize R3 placement.

**All 18 historical migration files were compared as raw bytes against HEAD and
are identical.** New migrations were applied using Prisma migrate deploy on fresh
disposable databases. No db push, shared database, Railway database or production
migration was used. R2/R4 Prisma drift checks passed against the current schema.

Existing deployed learning/file data must be inventoried before adopting the new
constraints: invalid namespaces, inconsistent pointers, orphan metadata or
historical duplicates must not be silently normalized. No deployed-data adoption
or destructive backfill was authorized or claimed.

## J. Native PostgreSQL evidence

PostgreSQL **16.15** (`server_version_num=160015`), Docker local Linux engine.
Each runner created and admitted a new labeled container, loopback port, database
and anonymous image volume; all were retained. No existing verification target
was reset or reused. Credentials were generated in memory, never written to the
sanitized evidence or report. Runtime startup checked separate restricted roles.

Combined R5 run: container/database suffix
`e7aaa7e993ec4d729165888de8925ea3`, loopback port 54694.
Sanitized evidence:
`C:\Users\Admin\AppData\Local\Temp\educore-r5-evidence-jMoPxr\evidence.json`.
It records 42 passing cases and **26 concurrency observations**. PostgreSQL wait
edges were observed through pg_blocking_pids; filesystem/outbox boundaries use
explicit latches, not sleep-based winner assumptions. Source-withdrawal and
adversarial-pointer fixture mutations use the disposable owner; ordinary domain
commands use restricted API connections.

A05/E03 follow-up: fresh suffix `81a6f5c82171433bb1d75acdb66c0aad`, port 55925;
evidence `C:\Users\Admin\AppData\Local\Temp\educore-r5-evidence-nG1KuQ\evidence.json`.
It verifies calendar-date rejection, UTC normalization preserving six fractional
digits, HTTP 413/415/422, the native r5_score constraint, and every R5 function's
private ACL/fixed search path.

### Requested concurrency matrix

| Scenario from task §22 | Verified case |
|---|---|
| 1 Publish vs enrollment change | R07, both orders |
| 2 Competing publication | R08; A04 |
| 3 Edit vs submit | R05, both orders |
| 4 Extension vs submit | R06; B02 |
| 5 Concurrent first submission | R01 commit/rollback; B03 |
| 6 Concurrent resubmission | R08 |
| 7 Resubmit vs draft | R02, both orders |
| 8 Resubmit vs publish | R03; a saved draft already forbids submit |
| 9 Publish vs correction | R09, both orders |
| 10 Concurrent corrections | R04; C04 |
| 11 Publication vs R3 evidence | R10 both orders; E01 pinned receipt; R3 FU-B07 |
| 12 Attachment limit race | R11, immutable four/five-file snapshots; six denied |
| 13 Link vs reconciliation | R11; D03, no deletion path |
| 14 Storage failure vs finalize | R16 promoted-byte barrier; D03 |
| 15 Teacher revoke vs publish/grade | R12, both mutations |
| 16 Parent revoke vs grade/file read | R13, both resources |
| 17 Current pointer vs write | R14; B01 deferred constraint |
| 18 Outbox replay vs publication | R15 uncommitted visibility/replay; E01 |

## K. Filesystem evidence

Native private volume:
`C:\Users\Admin\AppData\Local\Temp\educore-r5-native-volume-lOrOqA`.
File tests use separate mkdtemp roots and real writes/opens/promotion/reads.
They verify four allowed signature/type fixtures, max−1/max/max+1 bytes, MIME
spoofing, unsafe ZIP/OOXML, traversal/encoded/absolute paths, directory/object
junctions, ancestor-junction initialization, collisions, tenant namespaces,
checksums, missing bytes and interrupted promotion. D02/R11 verify immutable
attachment limits with real metadata and stored bytes. D03/R16 preserve bytes
after failed finalization and deny successful submission.

DB/Volume mismatch detection is verified with missing and corrupt actual objects.
**A coordinated backup/restore procedure was not executed.** This report does
not claim restored historical file availability or complete T-34 restore proof.

## L. HTTP/E2E evidence

Real Nest application and Supertest requests with password login and tenant
selection; E01 includes all four actors. No fake principal. Verified unauthenticated
401, resource/role/link scope failures, cross-tenant denial, hidden drafts,
strict score input, upload limits, private downloads and active revocation.
HTTP handlers do not accept server-owned version/time/late/current-pointer fields.
E03 asserts exact final file-error status codes. Scaffold E2E is reported
separately and is not substituted for this authenticated journey.

## M. Commands and regression results

Commands below actually ran, from repository root unless stated otherwise.
Exploratory checkpoint runs and earlier failures were corrected and rerun; the
table records the final relevant successful runs, not every exploratory attempt.

| Command | Result |
|---|---|
| `powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r5/start-r5-native.ps1 -RunTests` | 42 PASS, evidence jMoPxr; before adding A05/E03 |
| Same runner with `-TestFilter 'A05\|E03'` | 2 PASS / 42 filter skips, evidence nG1KuQ |
| R1b runner `apps/api/test/schema-integrity/start-r1b-native.ps1 -RunTests` | 39 PASS / 3 existing skips, evidence nVF7hO |
| R2 runner `apps/api/test/r2/start-r2-native.ps1 -RunTests` | 57 PASS, evidence bC46Wm |
| R3 runner `apps/api/test/r3/start-r3-native.ps1 -RunTests` | 56 PASS, evidence PplPEZ |
| R4 runner `apps/api/test/r4/start-r4-native.ps1 -RunTests` | 54 PASS, evidence 9Zk6x5 |
| In apps/api: `pnpm.cmd exec prisma validate` | PASS |
| In apps/api: `pnpm.cmd exec prisma generate` | PASS, client 7.10.1 |
| In apps/api: `pnpm.cmd exec tsc --noEmit` | PASS |
| In apps/api: `pnpm.cmd build` | PASS |
| In apps/api: `pnpm.cmd lint` | PASS, no warnings in final run |
| In apps/api: `pnpm.cmd test` | 6 files, 51 PASS; includes 10 actual filesystem tests and offline/WASM/unit regressions |
| In apps/api: `pnpm.cmd test:e2e` | 1 PASS, scaffold endpoint only |
| `git diff --check` | PASS |
| Raw Buffer comparison of historical SQL to `git show HEAD:<path>` | 18 byte-identical files |

R1b's existing skips remain T-37 legacy timezone adoption, T-41 historical placeholder
for authenticated runtime, and T-42 independent restore/tzdata upgrade. R5/R4
runtime evidence covers this slice's actual HTTP behavior; those skipped test
definitions were not relabeled PASS.

R3 fixture adjustment is limited to synthetic pre-R5 history. The disposable owner
temporarily suspends only the server-time version insertion trigger inside a
fixture transaction, fills the current pointer, validates deferred constraints
and restores the trigger before commit. All runtime tests run with all guards
enabled. Former in-place published-score mutations now assert rejection, then
append a revision to exercise the original stale-evidence/replay checks.
No financial/source expectations were weakened.

## N. Acceptance and finding matrix

Paths in this table are relative to apps/api unless prefixed docs/.

| Requirement / finding | UC / rule | Implementation | Test evidence | Status |
|---|---|---|---|---|
| FR-32/33; H-01 recipient; T-29 | UC-27, BR-08/Q-11 | assignment.service, migration019 | A01–04, R07/08 | PASS |
| Published snapshots survive transfer/source changes | UC-27, H-01/H-20 | recipient_guard, class snapshot | A01/A03/R07; R3 history | PASS |
| Submitted requirement lock and extension audit | UC-27, Q-11 | assignment_guard, recipient_change | B02/E02/R05/06 | PASS |
| FR-34; H-12; T-30 | UC-28, Q-11 | submission.service, migration020 | B01–04, R01/02/08/14 | PASS |
| Approved cutoff and server time | UC-28, O-09 A | is_late/version_guard | B02/B04 | PASS |
| O-08 A resubmit/draft/publication | UC-28/29 | grade/version shared lock | C01/R02/03/09 | PASS |
| FR-35; score precision; M-02 | UC-29, Q-11 | grading.service, migration021 | C02/E03 native r5_score | PASS |
| Draft hiding and newest published projection; T-31 | UC-29, Q-11 | published_grades/draft | C01/C03/E01 | PASS |
| Published evidence/revisions; H-12/H-20 | UC-29, BR-14 | grade_guard + R3 evidence | C01/E01/R04/R10; R3 FU-B01–08 | PASS |
| H-13 ownership/READY/count; T-32/33 | UC-28 | file.service, attachment_guard | D01–03/R11/R16 | PASS |
| M-06 namespace; signature/bytes | UC-28, O-09 A | private adapter/validator | F01–07/E03 | PASS |
| T-34 mismatch/fault detection | UC-28 | reconcile/verifyBytes | D03/R16/F06 | PASS for detection |
| T-34 coordinated DB+Volume restore | Operations | No restore procedure added | Not executed | DEFERRED |
| FR-37/39, BR-12 | UC-31 | publication outbox + R4 consumer | E01/R15; R4 consumer regression | PASS |
| BR-08 current authority; T-38 | UC-27–29 | R4 predicate + SessionGuard | C03/C04/R12/13/E02 | PASS |
| M-07/O-13 domain lifecycles | Q-11, H-20 | domain checks/transitions | A/B/C/D, no generic ApprovalStatus | PASS for R5 subset |
| M-08/P0 commands; T-41 | P0 boundary | fixed controller operations, SQL ACLs | E03; R4 D07; strict DTOs | PASS for R5 subset |
| R1–R4 preservation | Existing BR/Q | no historical SQL changes | 39+57+56+54 native passes; 3 existing skips | PASS within stated coverage |

This matrix is R5 evidence, not a global closure decision for H-01/H-12/H-13/H-20,
M-02/M-06/M-07/M-08, H-04 or R6's independent residual review.

## O. Outstanding issues and limits

- Owner review of every new file and migration before any Git action.
- Actual Railway Volume provisioning, production OS ACLs/mount/backups and
  configuration of required R5_PRIVATE_STORAGE_ROOT: not deployed or verified.
- Coordinated DB+Volume backup/restore and deployed-data adoption inventory:
  deferred. Detection tests do not establish restore completeness; H-04 remains open.
- File validation is bounded type checking, not malware scanning or full document
  decoding. No external scanner contract/integration was invented.
- No automatic physical cleanup, TTL, recovery/destructive reconciliation or
  historical metadata deletion. Operators review reported anomalies.
- R6 integrity review, performance, capacity, load/coverage measurement and
  operational retention sizing remain deferred. Tenant-wide serialization favors
  correctness; its throughput has not been benchmarked.
- Universal grade-to-level thresholds and P1 progress/reporting remain deferred.
- Ambiguous student class context requires classId. Parent submission remains
  forbidden; Parent file access is permission-dependent, not automatically granted.

## P. Git preservation and pending review

Branch and HEAD stayed at the baseline. Index remained empty. No checkout,
branch creation, reset, merge, rebase, stage, commit, push, PR or deployment.
No Figma/Library changes, Decision Register edit, frontend/R6 work, external
business service, shared database mutation or backup deletion.
Historical migrations 001–018 are byte-identical. The six pre-existing deletions
remain attributable to the starting working tree, not this implementation.
All new R5 files and the five new migrations are pending owner review before Git.

## Q. Final verdict

**R5 IMPLEMENTED — POSTGRESQL, HTTP & FILESYSTEM VERIFIED — READY FOR REVIEW**

This verdict covers the local P0 implementation and the specific successful
verification above. It does not claim deployment, production readiness, completed
backup/restore, R6 completion or H-04 closure.
