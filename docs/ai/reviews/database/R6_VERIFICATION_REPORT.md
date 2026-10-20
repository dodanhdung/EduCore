# R6 — Verification report

**2026-10-20 · Asia/Ho_Chi_Minh · local review draft.**

**Verdict: R6 VERIFICATION INCOMPLETE.** Local executed suites pass, with three
preserved R1b skips and the unverified obligations below. Full finding analysis,
D/S/P/R gates, O-01–O-13 provenance and T-01–T-42 traceability are in
[SCHEMA_DELTA_REVIEW_P0.md](SCHEMA_DELTA_REVIEW_P0.md). This report does not claim
production readiness, H-04 closure or historical populated migration safety.

## 1. Git baseline and preservation

Actual commands: `git status -sb`, `git branch --show-current`, `git rev-parse
HEAD`, `git log -12 --oneline --decorate`, `git diff --stat`, `git diff --cached
--name-status`. Branch `chore/r6-integrity-review`; HEAD
`ba57648379d9b250d4672df7bdcfc7e8075fef99`; R1–R5 commits in ancestry.
Index empty. One pre-existing deletion, `EduCore-R5-changes-2026-10-20.zip`,
preserved. R5 report's previous six deletions are not six outstanding changes in
this checkout.

Baseline SHA-256 inventory captured 175 tracked paths before source remediation.
Historical migrations 001–023 and all requirements/design/register/report source
snapshots remain unchanged. The final preservation check compares raw bytes
against that inventory and reports only the authorized HTTP source change among
pre-existing tracked files. New R6 files remain unstaged for review. No Git
checkout/reset/merge/rebase/add/commit/push/branch/PR/deploy was executed.

Final manifest:173 pre-existing tracked files byte-identical, the one original
missing ZIP still missing, only `http.ts` changed among existing tracked files;
ten new files (including migration024) remain unstaged. HEAD/branch/index are
unchanged. All24 migration hashes match this report; original001–023 match the
initial baseline exactly.

## 2. Environment and safety inventory

| Item | Actual final environment |
|---|---|
| Host | Windows x64, Node v24.12.0, Intel i5-12450H, 12 logical CPUs, 16,782,360,576 host RAM bytes |
| Docker | Local `desktop-linux` named-pipe context; server 29.8.2 |
| PostgreSQL | 16.15, server_version_num 160015, official `postgres:16` |
| Image | `sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d` |
| Local available PostgreSQL image tags | Only `postgres:16` observed via `docker image ls postgres` |
| tzdata | `2026c-0+deb13u1` |
| Prisma client | 7.10.1 generated locally |
| Test runtime | Vitest 4.1.11, installed coverage-v8 provider |
| Final R6 source container | `educore-r6-native-f6de6ac710cb4d47875d889bb6ee4c58` |
| Source target | Owned fresh `educore_r6_native_f6de6ac710cb4d47875d889bb6ee4c58`, loopback port 64912 |
| Restore container | `educore-r6-restore-c7871b6896a84d83b5c973ceaa4d98db`, loopback port 58080 |
| Restore database | `educore_r6_restored_c7871b6896a84d83b5c973ceaa4d98db` |
| Auxiliary migration targets | Fresh labelled recovery and upgrade clusters; separate from the source cluster |
| Storage fixture | Ignored `apps/api/coverage/r6/volume-c7871b6896a84d83b5c973ceaa4d98db` and distinct backup/restored/empty roots |

Docker access required sandbox escalation; automatic review allowed the local
operations. No permission rejection remained. No production/shared credentials or
application DATABASE_URL were read. Test-only URLs were generated in memory.
Admission verified ownership labels, literal loopback binding, intended database,
empty public schema, PostgreSQL major16, superuser migrator and cluster isolation
before migration writes. Runtime auth/API/worker connections use separate
restricted LOGINs; the migrator is not used by domain requests.

All task-created containers and anonymous volumes are retained. No existing
container/volume or user-owned file was removed. Reconciliation performs zero
physical deletes. Auxiliary readiness polls TCP, avoiding PostgreSQL's temporary
socket-only initialization server. Polling is not race-test evidence.

## 3. Files changed

| File | Purpose |
|---|---|
| `apps/api/src/identity-access/http.ts` | URIError→401; structured sanitized server-error diagnostics with correlation |
| `apps/api/prisma/migrations/202610200024_r6_sibling_integrity/migration.sql` (new) | Fail-closed distinct-student CHECK and active unordered sibling-pair uniqueness |
| `apps/api/test/r6/r6.postgres.test.ts` (new) | Independent catalog/migration/upgrade/security/restore/timezone/NFR fixtures |
| `apps/api/test/r6/support.ts` (new) | Owned-cluster admission, restricted runtime composition, real HTTP actors, sanitized evidence |
| `apps/api/test/r6/financial-scheduling.spec.ts` (new) | Valuable financial validation/rollback/outcome and scheduling intent/decision unit cases |
| `apps/api/test/r6/http-errors.spec.ts` (new) | Unexpected error logging and secret-redaction regression |
| `apps/api/test/r6/start-r6-native.ps1` (new) | Fresh local PostgreSQL16 runner; no reset/reuse/cleanup |
| `apps/api/test/r6/README.md` (new) | Reproduction and safety assumptions |
| `apps/api/vitest.config.r6.ts` (new) | Serial native R6 test configuration |
| `docs/ai/reviews/database/SCHEMA_DELTA_REVIEW_P0.md` (new) | Primary independent review and acceptance matrices |
| This report (new) | Commands, measurements, limitations and disposition |

One new forward-only migration, `202610200024_r6_sibling_integrity/migration.sql`,
corrects the independently reproduced sibling evidence defect. No historical
migration, PSL, package/lockfile, frontend, Decision Register or existing audit
report was edited. Generated Prisma/build/coverage files are ignored local
outputs. Disposable migration copies/probes are under ignored coverage, not the
repository's historical migration directory.

## 4. Prisma validate/generate

From `apps/api`, actually run before remediation and after the final source work:

```text
pnpm.cmd exec prisma validate
pnpm.cmd exec prisma generate
```

PASS; current schema valid, client7.10.1 generated. These are compatibility checks,
not substitutes for PostgreSQL constraints or concurrency verification.

## 5. TypeScript/build/lint/format

Actually executed in `apps/api`:

```text
pnpm.cmd exec tsc --noEmit
pnpm.cmd build
pnpm.cmd lint
pnpm.cmd exec prettier --check src/identity-access/http.ts test/r6/*.ts vitest.config.r6.ts
```

Final results PASS; lint zero warnings/errors, formatting PASS. Earlier test-code
diagnostics (unknown submitted response type, floating promises and an unnecessary
row spread) were corrected; they were not application defects. An exploratory
`tsc` invocation at workspace root failed because that root has no tsc command;
the required API check was subsequently run from `apps/api` and passed.
`git diff --check` PASS; Git's LF→CRLF advisory is not a failed check.

## 6. Fresh migrations and SHA-256 inventory

Every native runner admitted a new target and invoked Prisma `migrate deploy`.
R6-01 checks 24 finished/non-rolled-back history entries, their disk SHA-256 and a
second no-op deployment. No `db push`, baseline mark-applied or direct
`_prisma_migrations` edits.

Migration paths are `apps/api/prisma/migrations/<name>/migration.sql`:

| Name | SHA-256 |
|---|---|
| 202610190001_r1a_baseline | `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20` |
| 202610190002_r1b_integrity | `028fb6ffe8c05aed978a44da980df764020be94b7c20a296dff69a91f440bb76` |
| 202610190003_r2_billing_wallet | `3450ef76383b805b27114f0d7cad1ad9cfb1b6b0902cac98ab0e376f1c56d5e1` |
| 202610190004_r2_financial_integrity | `5c6952a0099ade2f2bbe30d86c01b7f2a5d2667daf538a6d31d9298913bcd0c0` |
| 202610190005_r3_academic | `f24943e6953eb71ee1b35202cb679de79af371e6347e8e8f280d3f6567053f12` |
| 202610190006_r3_scheduling | `c152c9b8541be0cddce9ee072d888b6b921dba399fb0484274e5e62cc6b5ddf4` |
| 202610190007_r3_attendance | `270857d6b050d86a391e21d7a0fb2624c278ef319120f36bc3c0e23415886a7f` |
| 202610190008_r3_leave_claim_guard | `88d947296253dcfd674466562e612daaf873e0dbd2cb755722ae64a9330e30dd` |
| 202610190009_r3_grade_placement | `1a87180879defb3f7e542e0d8dcd1324efd802b58cade08fc7e25d9d00d211b6` |
| 202610190010_r4_identity | `494fdf6cc818c1e9bd90005771d6001100c731a5b8c95aa6d04c9e41b81e1f78` |
| 202610190011_r4_authorization | `51d778e3f2336df21150663f4bec2cf215c554e7e48872884509c5d7c9f940c8` |
| 202610190012_r4_workflow | `c4b408350938d1dea75135cbd7b4aa36ede8858fef0abc5996a5bdb46edb8b04` |
| 202610190013_r4_jobs | `f3011ac1948b7e48ff5bd2a0d1b6ef3a080c1e91c6c31db254a2c573263af13e` |
| 202610190014_r4_notifications_audit | `2645786fbd109887d75298b558eed7ca4c683b0640c2db44914e891b4682d62b` |
| 202610190015_r4_bootstrap | `f09a1353d9a6329a8707d9b81e02e935dc08b71a16ce4dcf2220ceaaf6b7ba07` |
| 202610190016_r4_auth_audit | `7a31c56960a1b020d0d0f2ff0ef8ad6895f7bdd68881cb65498bf65bdfca2dc4` |
| 202610190017_r4_execution_boundary | `76d01de5438c02766db334c8a34df5fd4245a9783e235a29b3af9883516921d0` |
| 202610190018_r4_members | `32e1c3bd012d836f5a1b8867c50a45001e5e046011bae20241cc3e81897d81de` |
| 202610200019_r5_assignments | `02943c0a0f6cca2b407e01977a955e0e8ef2935bb40312ae8c5d5dd596e334d0` |
| 202610200020_r5_submissions | `410de73a07890bc3761d9191f0a8ff9984c377c97d8a2685695f4c22115a0b0d` |
| 202610200021_r5_grading | `768dfdcd001c368058ad54b0ca1acfdffcc174942749719a39f681dd5431c7c6` |
| 202610200022_r5_private_files | `923e797d7c4cf74fe080f0ab943980269d440cca5f47c1e0959d8bda05101ab1` |
| 202610200023_r5_notification_source | `210011e1b6dc38c34aad184f9ba732cffe2a833df3ebe3edef7072a0f2db7c95` |
| 202610200024_r6_sibling_integrity (new) | `f8d48894d6590827306a96713429775209056c8f27128a9b3676f99b471f465d` |

Inventory is also machine-readable in baseline/catalog artifacts; final
preservation verifies these exact bytes remain unchanged.

## 7. Drift/catalog/failed migration/upgrade verification

R6-01 runs:

```text
prisma migrate deploy
prisma migrate diff --from-config-datasource --to-schema <actual schema.prisma> --exit-code
```

The harness invokes the installed Prisma CLI using Node, with its own in-memory
DATABASE_URL. Result: second deployment `No pending migrations`; diff
`No difference detected.` Live catalog: 68 domain models, 28 enums, 69 public
tables, 710 columns, 211 FKs, 38 CHECKs, 2 exclusions, 89 non-internal enabled
triggers, 139 custom functions and 340 indexes. 221 unique/12 partial indexes;
FK candidate dependencies recorded. All public FKs are validated/MATCH SIMPLE,
with DELETE RESTRICT; UPDATE actions include cascades protected by separate
history/identity guards. No indexes removed.

R6-02 runs a disposable **test-only** migration025 after all24:
`BEGIN; CREATE TABLE r6_probe...; SELECT 1/0; COMMIT`. Observed unfinished failed
Prisma history and absent table; raw reproduction SQLSTATE22012 confirms the
root failure when Prisma reports only aborted transaction. Redeploy refuses the
failed migration; supported `prisma migrate resolve --rolled-back <probe>` runs
only after rollback proof. The test-only probe is corrected and actually deployed;
one healthy finished effect. No mark-applied or fabricated success. An explicit
transaction also demonstrates SQLSTATE25P02 after error, ROLLBACK and reuse.

R6-03 applies the original001–018 on a new cluster, seeds valid synthetic
tenant/enrollment/session/draft-invoice history, then deploys019–024. Enrollment
JSON remains identical. Comparison of all **112 pre-R5 custom functions** proves
only four expected bodies change; all prior owner/ACL/security/search-path
attributes remain equal. This is not a populated historical learning/file or
production-data adoption proof.

## 8. Role and privilege tests

R6-01/04, existing R1b T31/32, R2 S01, R3 A06 and R4 D07 all executed. All139 custom
functions deny PUBLIC execute; all126 definers have pg_catalog-first fixed paths;
four owners are NOLOGIN/non-superuser/non-CREATEROLE/non-BYPASSRLS. Restricted
runtime SQL cannot UPDATE invoice history, grant owner roles, invoke private
helpers without a bound principal, or inherit another request's transaction
principal. Authenticated HTTP actors alternate through the same repository pool.
Revoked grants/Parent links and cross-tenant IDs are denied in native/HTTP tests.
The separate restored cluster passes runtime profile checks with restored grants.

## 9. Cross-domain concurrency evidence

| Suite | Recorded race entries | Explicit observed PostgreSQL waits | Additional method |
|---|---:|---:|---|
| R1b | 32 | 32 | Two participants plus observer; commit/rollback and winner permutations |
| R2 | 35 | 35 | Wallet, payment, approval, G1/G2, ISSUE/source schedules |
| R3 | 29 | 29 | Capacity/bookings/roster/finalization/correction/ISSUE and published-grade evidence |
| R4 | 18 | 17 | Remaining deferred worker-commit fence uses its explicit barrier |
| R5 | 26 | 24 | Remaining outbox/filesystem visibility tests use explicit latches |

Case names, backend PIDs where recorded, outcomes and `observedWait` are retained
in `native-regressions.json`, with original evidence paths. Do not sum all entries
as lock waits, distinct business scenarios or exhaustive cross-domain coverage.
Unknown-commit tests withhold successful responses/use durable lookups; they are
not exhaustive TCP/process-kill experiments. H-04 residual schedules are listed
in the primary review.

## 10. Full regression matrix and actual commands

From repository root, both baseline and final passes used:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/schema-integrity/start-r1b-native.ps1 -RunTests
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r2/start-r2-native.ps1 -RunTests
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r3/start-r3-native.ps1 -RunTests
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r5/start-r5-native.ps1 -RunTests
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r6/start-r6-native.ps1 -RunTests
```

Each runner internally invokes the matching existing Vitest native config; R6
uses `pnpm.cmd --dir apps/api exec vitest run --config ./vitest.config.r6.ts`.
R3 includes its follow-up, R4/R5 include authenticated HTTP, R5 includes both
A05/E03 previously split between historical runs. Baseline suites were started
independently and concurrently on separate containers. Final suite duration is
wall time reported by Vitest, not an isolated performance benchmark.

| Final verification group | PASS | FAIL | SKIP | Duration | Original temp evidence suffix |
|---|---:|---:|---:|---:|---|
| R1b native | 39 | 0 | 3 | 61.55s | `educore-r1b-pg-evidence-zA6kNN` |
| R2 native/integration | 57 | 0 | 0 | 122.98s | `educore-r2-evidence-uH1vHB` |
| R3 native + follow-up | 56 | 0 | 0 | 147.42s | `educore-r3-evidence-OqWnga` |
| R4 native/authenticated HTTP | 54 | 0 | 0 | 139.49s | `educore-r4-evidence-MnGf8c` |
| R5 native/authenticated HTTP | 44 | 0 | 0 | 149.61s | `educore-r5-evidence-Y1xlEd` |
| R6 native/catalog/recovery/restore/NFR | 13 | 0 | 0 | 68.47s | Local `coverage/r6/verification.json` |
| Default offline/WASM/unit/filesystem | 66 | 0 | 0 | 9.61s | `final-default-suite.json` |
| Scaffold E2E | 1 | 0 | 0 | 1.82s | Actual console run; scaffold route only |
| Focused Billing/Scheduling coverage | 16 | 0 | 0 | 1.46s final rerun | `final-unit-coverage/coverage-summary.json` |

Temp suffix paths are under `C:/Users/Admin/AppData/Local/Temp/`, filename
`evidence.json`. The consolidated local artifact retains exact case/race records.

Default suite composition: R1b offline14, WASM15; Billing calculator3; R4 crypto8;
R5 filesystem10; R6 financial/scheduling13 and error2; scaffold unit1. Coverage's
16 tests overlap calculator3/R6 financial-scheduling13 and are not extra passes.

In `apps/api`, actual default/scaffold commands:

```text
pnpm.cmd test --reporter=json --outputFile=D:/EduCore/apps/api/coverage/r6-baseline-unit.json
pnpm.cmd exec vitest run --reporter=json --outputFile=coverage/r6/final-default-suite.json
pnpm.cmd test:e2e
```

Baseline: R1b39+3 skips, R2 57, R3 56, R4 54, R5 44, default51. Native baseline
durations were40.54/98.18/119.49/117.84/105.65s respectively. These are recorded as
baseline, not counted again in final results. R1b's existing timeout warning and
Vite's tsconfig-paths notice did not fail assertions; no configuration was changed
to suppress them.

The three R1b skipped definitions remain R1B-T37 valid legacy adoption, R1B-T41
runtime placeholder and R1B-T42 restore/tzdata placeholder. Later runtime/restore
evidence partially satisfies their underlying obligations but does not turn
their original skipped executions into PASS.

The final matrix includes a third full R1b–R5 pass after migration024. A preceding
post-HTTP/pre-024 pass also passed39/57/56/54/44 (46.85/115.41/139.99/135.94/142.94s);
it is intermediate evidence, not added to final totals.

## 11. PostgreSQL backup/restore commands and outcome

R6-06 performs standard PostgreSQL operations inside newly owned containers.
The following are the actual command shapes; target names come from validated
in-memory manifests, and no credential-bearing URL is logged:

```text
docker --context desktop-linux exec <source> pg_dumpall -U r6_test_admin --roles-only --no-role-passwords
docker --context desktop-linux exec <source> pg_dump -U r6_test_admin -d <source-db> --format=custom
docker --context desktop-linux exec -i <fresh-target> psql -X -v ON_ERROR_STOP=1 -U r6_test_admin -d postgres
docker --context desktop-linux exec <fresh-target> createdb -U r6_test_admin <restore-db>
docker --context desktop-linux exec -i <fresh-target> pg_restore -U r6_test_admin --exit-on-error -d <restore-db>
```

The runner streams the password-free role SQL and custom dump through pipes in
memory. It does not write database dumps or passwords into Git. The target uses
the **same bootstrap grantor name**; its existing `CREATE ROLE r6_test_admin`
statement is omitted exactly once, while all dumped ALTER ROLE and membership
statements remain. The first different-grantor rehearsal failed under PG16's
GRANTED BY/admin-option checks; its failure was retained. Restricted LOGIN
passwords are separately provisioned in memory before restart. This establishes
global role provisioning as well as database restore; restoring the database
alone would not establish roles or application secrets.

Final result: **LOCAL LOGICAL DB RESTORE PASS**. All69 public tables' counts and
data hashes match before any restored runtime read; all custom function source
hashes/owners/ACL/config/security attributes and89 trigger definitions match.
All24 migration history rows survive, no invalid constraints, restored runtime
profiles pass. Restored published grade and wallet summary are read using the
original live token and restricted application repository. Secrets/configuration
are supplied separately, not declared restored from the database dump.

## 12. Coordinated DB + private Volume restore

Recovery point: **2026-10-20T13:29:38.423Z** (20:29:38.423 local). R6 fixture is
single-writer and quiescent: uploads/submission/grade publication/top-up all
finished; worker disabled; no pending operation. The same file tree is copied to
a backup root before the database dump, with no writers during either operation.
Restoration uses a new database and new filesystem root.

The fixture includes tenant/student/recipient/submission/current version/immutable
file link, actual READY metadata and private PDF bytes, a published8.5 grade,
wallet TOP_UP123456 VND, and their audit/receipts. Existing synthetic enrollment,
session and draft invoice history is also restored; this is not a restore of
every possible financial/payment lifecycle combination.

| Measurement / check | Actual outcome |
|---|---|
| Database bytes after restore | 15,727,639 |
| Custom dump size | 752,158 bytes |
| File size | 77 bytes, synthetic PDF |
| File SHA-256 | `6f71714ba1d09b1fc838e8661ee4d0170fd38f6913426432ad289af8ecc52510` |
| Measured restore segment | 5,231.11ms, from dump acquisition through new target provisioning/data restore/file-tree copy |
| Successful download | Byte-for-byte equal, SHA-256 equal; Student owner and assigned Teacher pass |
| Unauthorized actor | Actor created after recovery point is absent after restore and denied |
| Published grade / wallet read | Restored8.5 and123456 VND values verified with current authority |
| Missing bytes / DB-newer-than-volume shape | Separate empty file-root clone reports MISSING_OBJECT; zero deletes |
| Wrong/truncated bytes | Wrong bytes fail size/hash validation and authorized download fails closed; reconciliation reports anomaly |
| Extra bytes / volume-newer-than-DB shape | Unreferenced actual file is detected; zero deletes |
| STAGING after crash | Existing R5 D03/R16 independently rerun; promoted-not-finalized cannot submit |
| ORPHANED/immutable reference rules | R5 D02/R11/D03 and SQL file guards rerun; no cleanup or historical rewrite |

Missing/excess snapshot cases reproduce their actual data/byte shapes; they are
not full live-writer timestamp-skew backup experiments. The corrupt restore test
repairs only its synthetic test bytes; the immutable metadata is never changed
or deleted. All public table hashes, functions and trigger comparisons are saved
in `restore-manifest.json` without exposing row contents.

**LOCAL RESTORE REHEARSAL: PASS for this quiescent fixture.**
**PRODUCTION RPO/RTO: NOT VERIFIED.** No scheduled backup, offsite retention,
live-writer recovery protocol, production scale, actual Railway restart or
production filesystem permissions were tested. The measured tiny fixture cannot
establish daily backups, RPO≤24h or RTO≤4h at production scale.

## 13. Timezone/tzdata verification

R6-09 verifies Ho_Chi_Minh local midnight/month/year attribution, preceding
microsecond, New York DST gap and overlap rejection with SQLSTATE22007, and a
valid post-DST local9am mapping to13:00UTC. R1b source/freeze races, R2 local-year
calendar due dates and nonexistent due-time rejection I04, and R3 recurrence
DST cases were rerun independently.

Source/restored tzdata fingerprints match:

| Zone | SHA-256 |
|---|---|
| Asia/Ho_Chi_Minh | `2e7bf5be950d017068f2fd1bf5df40429cbe004c8ee506b6220d0fbc3923ae65` |
| America/New_York | `e9ed07d7bee0c76a9d442d091ef1f01668fee7c4f26014c0a868b19fe6c18a95` |

Only one local postgres image/tzdata version was available. **Actual changed-version
PostgreSQL/tzdata upgrade NOT RUN**. Same-image UTC preservation, fingerprints and
restore are not upgrade acceptance. No DST due-date policy was invented.

## 14. NFR latency measurements

Ordinary API fixture: actual HTTP password login + tenant selection, restricted
pooled repository, one scoped Student with zero published grade rows in the
measured query; other synthetic R6 tenants remain in the DB. GET
`/api/v1/tenants/{tenantId}/students/{studentId}/published-grades`; no SMTP/external
network in measurement. First request44.08ms, five warmups, then100 measured
requests at concurrency4.

| API latency | ms |
|---|---:|
| p50 | 49.53 |
| p95 | 92.56 |
| p99 | 148.27 |
| worst sampled | 176.58 |

NFR-01: **PASS for this small local fixture**; overall performance acceptance
PARTIAL, because workload/scale/SLO agreement and representative endpoints are
not established by a single empty-result read. Local Supertest transport overhead
is included; external network latency is absent. Hardware is §2; Docker allocation
and production hardware equivalence were not established.

Scheduling fixture: two classes, two teachers, two rooms, one enrolled student,
26 weekly onsite sessions January–June2099 and79 active bookings. It confirms
the recurrence and measures ten denied confirmations each for isolated teacher,
room, student and confirmed unavailability overlap;40 attempts, concurrency1.
Tokens come from real HTTP login/select-tenant; the measured operation uses the
authenticated restricted R4 transaction and actual R3 SQL scheduling command.
There is no public scheduling-write endpoint to benchmark as HTTP.

| Scheduling measurement | ms |
|---|---:|
| Recurrence confirmation | 123.43 |
| Conflict p95 | 17.13 |
| Worst conflict attempt | 38.12 |

NFR-02: **PASS on the declared small domain-command fixture**, overall PARTIAL.
This measures actual conflict rejection and atomic recurrence, not merely a mock
or an EXPLAIN estimate. It does not certify large-tenant scans, tenant-gate
contention, throughput or a public API contract. A separate EXPLAIN ANALYZE
resource-booking read uses an existing tenant index on its small fixture; no
redundant/candidate index was removed or promoted into an unmeasured blocker.

## 15. Unit branch coverage

Initial actual command in `apps/api`:

```text
pnpm.cmd exec vitest run test/r2/calculator.spec.ts --coverage --coverage.include=src/billing/** --coverage.include=src/scheduling/** --coverage.reporter=json-summary --coverage.reporter=text --coverage.reportsDirectory=coverage/r6/initial-unit-coverage
```

Initial Billing13/33 branches=39.39%; Scheduling0/2=0%; combined13/35=37.14%.
Calculator alone13/16=81.25% was not reported as whole-module coverage.

Final actual command:

```text
pnpm.cmd exec vitest run test/r2/calculator.spec.ts test/r6/financial-scheduling.spec.ts --coverage --coverage.include=src/billing/** --coverage.include=src/scheduling/** --coverage.reporter=json-summary --coverage.reporter=text --coverage.reportsDirectory=coverage/r6/final-unit-coverage
```

| Application scope | Branches | Lines | Functions |
|---|---:|---:|---:|
| Billing TypeScript | 33/33 =100% | 80.76% | 65.62% |
| Scheduling TypeScript | 2/2 =100% | 41.66% | 36.36% |
| Combined included source | 35/35 =100% | 75.55% | 58.13% |

All module TypeScript files were included, including currently unexecuted wrapper
methods/module composition; no difficult branch was excluded. New units exercise
invalid money/intent/receipt admission, all three independently mismatched DB
totals, validation before deferred success, unknown successful commit receipt,
no-effect/denied recovery preserving the original error, canonical receipt
identity, and busy-cancel versus busy-confirm routing. They do not pretend mocked
repositories establish database isolation.

**NFR-12 TypeScript unit metric: PASS** against≥80%. PostgreSQL functions contain
most scheduling/business branches; V8 does not instrument PL/pgSQL. High wrapper
branch coverage alongside low Scheduling line/function coverage must not be
presented as80% coverage of all database business logic. SQL correctness evidence
is the separate native matrix, not a SQL branch percentage.

## 16. Security boundary verification

Actual authenticated HTTP and negative tests cover forged tenant/user fields,
cross-tenant resource IDs, current grant/link revocation, stale/expired sessions,
refresh replay, CSRF/Origin, production cookie flags in test composition, pooled
principal separation, private file scopes and malformed cookies. SQL negative
tests reject raw DML/owner grants/DDL/private helpers. Bootstrap uses controlled
operator provenance and has no public self-bootstrap route.

Passwords are salted Argon2id; OTP uses HMAC+pepper, one-time bounded verification;
registered access hashes bind JWT sessions. OTP failure tests verify generic
responses and no credential mutation from failed/absent delivery. Capture/local
adapters and slow/failure delivery paths are verified; **real SMTP delivery NOT
VERIFIED**. Application error logs now expose only fixed event/status/correlation
and a validated SQLSTATE; regression tests prohibit raw secret-bearing exception
messages. This does not certify deployed log transport/retention, CORS domain,
TLS termination, proxy policy or OS mount ACLs.

## 17. Missing, blocked and partially verified obligations

| Obligation | Disposition |
|---|---|
| H-04 source-writer/public-transport coverage and technical authority | PARTIAL/OPEN; exact220k, expired-SESSION fallback and zero-issued claim/reuse vectors now PASS in R6-12 |
| H-18 historical387-line snapshot provenance | PASS relative to recorded hash: Git6026eec with CRLF exactly reproduces fd512076…f481d; all nine versions checked |
| R1B-T37 valid populated adoption | BLOCKED by absent target inventory/provenance/approved plan; no destructive normalization |
| R1B-T41 complete runtime/source evidence | PARTIALLY COVERED by later real HTTP R4/R5/R6; academic/scheduling/attendance/full finance public writes incomplete |
| R1B-T42 and roadmap T-42 changed-version tzdata upgrade | NOT RUN; source/restored same-version behavior verified |
| Sealed financial attendance/leave correction | Existing fail-closed behavior retained; no approved coordination contract |
| Automatic grade-level recommendation | Deferred without approved rubric; explicit grade-backed staff confirmation implemented/tested |
| Exact legacy excess-case and exhaustive metadata/lineage vectors | NOT RUN / policy and counterexample coverage remain explicit; self/duplicate sibling vectors now PASS |
| All process/TCP crash windows | NOT RUN; named replay/lock/fence/latch scenarios only; exact100-redelivery fixture is included in final R6 |
| Representative API/scheduling load and sustained tenant serialization | NOT VERIFIED; small fixtures measured |
| Production TLS/domain/cookie/SMTP/Railway grants/Volume/OS ACLs | NOT VERIFIED |
| Daily backups/production RPO/RTO/availability/privileged retention | NOT VERIFIED |
| Frontend/browser/usability | NOT RUN; no frontend implementation authorized |

## 18. Baseline failures, corrective actions and reruns

| Checkpoint | Actual result | Classification and action |
|---|---|---|
| Existing baseline suites | All available assertions passed; R1b3 skips | Preserved baseline, independent of historical PASS claims |
| First R6 native | 3 PASS /4 FAIL | Product F01 cookie500; harness role-reuse and missing assignment description; initial catalog/security/latency evidence retained |
| Second R6 native | 4 PASS /3 FAIL | Cookie500 persists; probe expected only original CLI error, PG aborted logging differs; global-role restore grantor failure |
| Initial observability units | 1 PASS /1 FAIL | Product F02 unexpected failures emit no log; evidence before source correction |
| Interim R6 seven-case run | 7 PASS | Cookie corrected, fresh auxiliary clusters, explicit SQLSTATE probe proof, matching bootstrap grantor restore |
| Expanded nine-case run | 8 PASS /1 FAIL | Naive timestamp parameter converted by driver; test fixed to text::timestamp, no function changed |
| Preservation/DST follow-up | 7 PASS /2 FAIL | Auxiliary readiness saw temporary socket server; DST SQLSTATE assertion incorrectly expected23514 instead of documented22007 |
| Full data-manifest follow-up | 8 PASS /1 FAIL | Harness table-name allowlist rejected digit in `r2_principal_bindings`; widened safely to SQL identifier characters |
| Pre-sibling-correction R6 | 9 PASS /0 FAIL /0 SKIP | Full69-table data hash and custom function/trigger restore manifests equal; all assertions retained |
| Sibling defect baseline | 1 FAIL /9 filter skips | Self-link accepted on023; closed-period supplement shows sibling=true, no invoice issued |
| Corrective migration verification | 11 PASS /0 FAIL | Self/active-pair/race/preflight and reversed-pair upgrade verified |
| Exact pricing follow-up | 12 PASS /0 FAIL | Mixed220k, CLASS fallback, zero-issued permanent claim and cross-period rejection |
| Outbox follow-up | 12 PASS /1 FAIL |100 redeliveries passed; later latency actor setup correctly received429 after exhausting real login throttle |
| Final R6 including reused authenticated latency fixture | 13 PASS /0 FAIL /0 SKIP | No throttle reset/disable/IP forgery; reuse unchanged Student token from scheduling fixture; all checks retained |
| Default run during concurrent native suites | 65 PASS /1 FAIL | WASM injected-DDL case failed at5.96s with generic STACK_TRACE_ERROR; raw JSON preserved; isolated unchanged WASM rerun15 PASS |
| Final R1b–R5/default/E2E | §10 | Full requested local regression after application remediation |

HTTP corrections are R6-F01/F02. R6-F03 was found while reconciling E-06 with the
live catalog: baseline023 admitted a self-link, and a closed-period capture
selected it for sibling discount. No invoice was issued. The initial filtered
R6-10 run failed (one failure, nine filter skips); its capture supplement proves
the financial eligibility impact. Migration024 adds distinct-student CHECK and
active unordered-pair uniqueness, retaining valid orientation and revoked
history. R6-10 tests rejection/races/regrant; R6-11 tests fail-closed preflight and
evidence preservation; R6-03 upgrades a valid reversed pair without rewriting it.
The SQL has no automatic cleanup/backfill. A separate test-only migration025 is
the recovery probe. All original001–023 bytes remain unchanged.

Earlier sanitized checkpoint artifacts retained under `apps/api/coverage/r6/`:
`initial-verification.json`, `initial-catalog.json`, `second-verification.json`,
`second-catalog.json`, `initial-error-observability.json`,
`expanded-verification-before-transport-fix.json`,
`fifth-verification-before-harness-fixes.json`,
`sixth-verification-before-manifest-identifier-fix.json`. The successful interim
seven-case run also exists in its retained source/restore clusters and tool
transcript; its shared verification output was subsequently replaced by a later
checkpoint. No missing standalone artifact is claimed for that interim result.

Additional artifacts: `sibling-defect-baseline.json`,
`sibling-defect-capture.json`, `outbox-pass-latency-setup-rate-limit.json`,
`default-under-concurrent-native-failure.json`. The WASM failure is consistent
with timing/resource sensitivity during parallel native runs, but its raw JSON
does not prove a root cause. No timeout or expectation was changed; the final
default suite was rerun after concurrent native suites completed.

## 19. NFR acceptance and release risk register

| NFR | Target | Local method/result | Overall disposition / next gate |
|---|---|---|---|
| 01 | Ordinary API95%≤1s |100 authenticated reads, p95=92.56ms | PARTIAL: fixture PASS; representative workload/scale approval pending |
| 02 | Conflict≤2s on defined dataset |40 actual conflict rejections, p95=17.13ms;26-session confirm123.43ms | PARTIAL: small fixture PASS; scale/contention/public transport pending |
| 03 | Multi-center isolation | Native composites/current auth; R4/R5/R6 cross-tenant reads/writes denied | PASS for tested local isolation; production scale separate |
| 04 | HTTPS + appropriate password hashing | Argon2id/crypto/cookie tests PASS | PARTIAL: actual deployed HTTPS/domain/proxy not verified |
| 05 | Backend permission enforcement | Current permission/scope/link checks and raw DML denial | PASS tested local boundaries |
| 06 | Multi-row transactional integrity | Native source/finance/failure/race tests | PASS named P0 local transactions; excluded P1 not inferred |
| 07 |99.5% monthly availability | No deployed monitoring period | NOT VERIFIED; production observation required |
| 08 | Daily backup; RPO≤24h/RTO≤4h | Logical DB/global roles/file restore PASS,5.23s tiny measured segment | PARTIAL local; production schedule/size/RPO/RTO NOT VERIFIED |
| 09 | Responsive usable UI | No UI changes/testing | NOT VERIFIED |
| 10 | Supported Chrome/Edge/Firefox | No browser matrix | NOT VERIFIED |
| 11 | Maintainable independent modules | Existing module/application/SQL boundaries reviewed; build/regressions PASS | PARTIAL qualitative review; cross-schema SQL coupling remains an implementation trade-off |
| 12 | Scheduling/Billing unit branches≥80% | TS33/33 and2/2 branches | PASS literal TypeScript metric; SQL unmeasured, thin-wrapper limitation explicit |
| 13 | Errors/trace without secrets | Correlation/audit, new sanitized error logger and redaction tests | PARTIAL: local error path PASS; request/job latency telemetry and deployed log handling incomplete |
| 14 | Authorized student/learning/finance privacy | Real HTTP role/link/file/draft isolation negatives | PASS tested local boundaries; privileged backup/access controls require deployment review |
| 15 | No duplicate automated effects | Durable roots, retries/fences/claims/outbox tests | PASS named local schedules, not every network fault |
| 16 | Trigger/policy/result/actor/time trace | R4 audit/correlation/worker and R5 receipts; restore | PASS named local contracts; historical/source sign-off still separate |

| Release risk | Severity / disposition |
|---|---|
| Unreconciled O-01/O-04/O-07/O-13 technical authority | HIGH sign-off gate; owner review of concrete implementation/status, no register edit by R6 |
| H-04 residual producer/runtime evidence | HIGH acceptance gate; H-18 recorded snapshot provenance is now verified separately |
| Shared-cluster/managed-role migration topology | HIGH deployment prerequisite; immutable R1b refuses unknown existing role, fresh cluster only verified |
| Historical populated/legacy/mixed adoption | HIGH target-specific gate; inventory/approved migration plan absent |
| Production DB+Volume recovery point and scheduled backups | HIGH operational gate; tiny quiescent local rehearsal insufficient |
| Missing sealed correction/full public writer routes | Backend completeness limit; fail-closed preserved, no automatic compensation |
| Real SMTP/TLS/cookies/Volume ACL/telemetry | Deployment verification outstanding |
| Representative load/SQL branch coverage/different tzdata | Explicit performance/verification limitations; no speculative index blocker or lock-order optimization |

## 20. Evidence inventory and final recommendation

Sanitized generated artifacts are retained at **`D:/EduCore/apps/api/coverage/r6/`**
(ignored, not staged/committed). Main artifacts:

| Artifact | Contents |
|---|---|
| `baseline.json` / `preservation.json` | Initial tracked hashes and final raw-byte preservation result |
| `environment.json` | Final admitted source cluster without Config.Env/password/URL |
| `catalog.json` | Exact24 history checksums,139 effective function definitions/owners/ACL/search paths, declaration lineage/dynamic replacement sites,349 constraints,89 attachments,340 indexes, roles/grants/columns/extensions |
| `enum-fk-inventory.json` |28 enum label lists and211 FK MATCH/action/target-index dependencies |
| `r4-r5-function-preservation.json` |112 pre-R5 definitions and full upgraded catalog; four expected body replacements only |
| `verification.json` | Final R6 cases, environment/catalog/recovery/upgrade/restore/timezone/performance, sibling races/preflight, exact pricing and100-redelivery vector |
| `restore-manifest.json` | Source/restored69 public table counts+hashes, functions and triggers; no row contents |
| `native-regressions.json` | Final R1b–R5 exact case/race records and original temporary evidence paths |
| `performance.json` / `scheduling-performance.json` | Actual latency samples, fixture, concurrency, hardware, query plan and limits |
| `initial-unit-coverage/` / `final-unit-coverage/` | Raw V8 branch/line/function denominators |
| `final-default-suite.json` |66 final default results, exact names/counts/duration |
| Initial/failing checkpoint artifacts | Before/after evidence described in §18 |
| `sibling-defect-baseline.json` / `sibling-defect-capture.json` | Pre-correction self-link acceptance and closed-period sibling eligibility, no invoice issue |
| `source-provenance-history.json` | All nine Git versions and LF/CRLF hashes; exact historical snapshot match at6026eec |

The retained Docker setup manifests are in their printed OS-temp directories;
the final source setup is
`C:/Users/Admin/AppData/Local/Temp/educore-r6-native-f6de6ac710cb4d47875d889bb6ee4c58/environment.json`.
No credentials or database dump files are submitted for Git review.

**Fresh schema migration readiness:** supported on the admitted PostgreSQL16
topology by actual deploy/redeploy/drift/catalog/ACL/recovery evidence.
**Backend feature readiness:** partial; tested local contracts are stated
individually. **Operational/production readiness:** not established.
**Requested full R6:** VERIFICATION INCOMPLETE because the missing obligations in
§17 and the primary review remain, even though the final executable suites pass.

Scope / Sources / Files changed / Tests actually run / Risks & deviations /
Pending review are documented above and in the linked primary artifact. Owner
review remains required for all new files and the HTTP diff before any Git action.
