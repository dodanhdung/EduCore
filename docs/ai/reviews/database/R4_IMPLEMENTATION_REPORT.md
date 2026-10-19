# R4 Implementation Report — local review

Date: **2026-10-19**, Asia/Ho_Chi_Minh. Final verification recorded below.

## A. Executive summary

Implemented R4 identity/session security, scoped IAM, controlled bootstrap,
manual financial workflow adapters, fenced PostgreSQL jobs, in-app notifications,
audit protection and representative authenticated HTTP integrations. The existing
R2 financial and R3 source coordinators remain the domain execution boundaries.

Nine new migrations, **010–018**, extend the existing foundation. No historical
001–009 migration was edited. No frontend, R5, R6, shared database deployment or
external business integration was performed. SMTP is implemented but real OTP
email delivery is **NOT VERIFIED**.

Final R4 native/HTTP verification passed **54** cases after the final runtime and
migration corrections. A subsequent focused C01 run also passed its strengthened
same-key/different-valid-payload rejection assertion; production code was unchanged.
Final R1b/R2/R3 regressions passed **39 / 57 / 56** cases; R1b retains three
pre-existing skips. Offline/unit coverage run passed **41** cases; scaffold E2E
passed **1**. These are local technical results, not production readiness.

## B. Repository baseline and sources

- Initial branch: `feat/scheduling-attendance-r3`; clean working tree and index.
- Current observed branch: `feat/iam-workflow-jobs-r4`. The branch name changed
  outside the agent's actions during the task; no agent branch/checkout command.
- Initial/current HEAD: `ca18e59a880604d984410ec92add5cafa4e7aa85`.
- Committed baseline: R1b `91f7f1a`/`fd01a7a`, R2 `aaff62e`, R3 `24482eb`,
  follow-up `ca18e59`; migrations 001–009 present before implementation.
- Read AGENTS, PROJECT_CONTEXT, DECISION_REGISTER; current Requirements v5 with
  v5.1 wallet amendment; UC v1.3; accepted Architecture; current DB v1.1,
  Detailed/API designs; IAM, Tenant Policy, Workflow, Jobs, Audit, Notification,
  Billing, Academic, Scheduling and Attendance class-design contracts; remediation
  plan/audit and R1b/R2/R3 reports.
- Several context/register/design paragraphs still describe historical
  NOT IMPLEMENTED states. Code, HEAD and executed evidence were checked directly;
  those source documents were not rewritten or silently treated as current code.
- Owner explicitly approved **O-11 A** during this task: first pending Manager
  assigner self-reference, with separate real operator audit/provenance.
- O-01/O-07/O-13 register dispositions were not changed to APPROVED. R4 reuses
  the existing verified User → Tenant/domain gateway protocol and synchronous R2
  financial execution. Technical defaults and new API adapters remain reviewable.

## C. Files changed

All changes remain local and unstaged. New files require review before Git.

| Existing file                                         | Change                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma`                       | Session/refresh history, parent evidence, operator attribution, job fence/session fields; 68 models/28 enums                                |
| `apps/api/src/main.ts`                                | Mount R4, validate restricted connections/configuration, configure HTTP, sanitized startup failure                                          |
| `apps/api/package.json`                               | Native R4 test script; Nodemailer runtime dependency and types                                                                              |
| `pnpm-lock.yaml`                                      | Nodemailer 10.1.6 / types 8.0.2; package manager normalized existing Vite optional-peer snapshots without changing frontend versions/source |
| `apps/api/test/schema-integrity/support.ts`           | Valid Manager fixture and controlled CREATED → ACTIVE setup; independent Manager helpers                                                    |
| `apps/api/test/schema-integrity/r1b.postgres.test.ts` | Preserve Manager during authority-loss races; qualify fixture table under hostile temp schema                                               |
| `apps/api/test/schema-integrity/r1b-static.spec.ts`   | Account for additive refresh-history model; preserve original migration assertions                                                          |
| `apps/api/test/r2/r2.postgres.test.ts`                | Independent Manager during Student/Parent role switches; inventory appended R2 adapter function                                             |
| `apps/api/test/r3/r3.postgres.test.ts`                | Independent Manager during role/scope revocation; preserve existing scope/finance expectations                                              |

New files:

- `apps/api/prisma/migrations/202610190010_r4_identity/migration.sql`
- `apps/api/prisma/migrations/202610190011_r4_authorization/migration.sql`
- `apps/api/prisma/migrations/202610190012_r4_workflow/migration.sql`
- `apps/api/prisma/migrations/202610190013_r4_jobs/migration.sql`
- `apps/api/prisma/migrations/202610190014_r4_notifications_audit/migration.sql`
- `apps/api/prisma/migrations/202610190015_r4_bootstrap/migration.sql`
- `apps/api/prisma/migrations/202610190016_r4_auth_audit/migration.sql`
- `apps/api/prisma/migrations/202610190017_r4_execution_boundary/migration.sql`
- `apps/api/prisma/migrations/202610190018_r4_members/migration.sql`
- `apps/api/src/identity-access/{auth.service,config,crypto,http,otp-delivery,r4-repository,r4.module,request-context,session.guard}.ts`
- `apps/api/src/workflow-approval/{runtime.controller,runtime.service}.ts`
- `apps/api/src/automation-jobs/worker.ts`
- `apps/api/src/tenant-policy/operator-cli.ts`
- `apps/api/test/r4/{auth.spec.ts,r4.postgres.test.ts,start-r4-native.ps1,README.md}`
- `apps/api/vitest.config.r4.ts`
- This report.

Generated Prisma/build/coverage artifacts are ignored output. No credentials or
real `.env` file were added. Requirements, Decision Register, old reports and
frontend source/package files remain unchanged.

## D. R4-A Identity and access

Auth uses asynchronous Node Argon2id, PHC hashes with random salt, minimum 12
Unicode code points, HS256 JWT issuer/audience/expiry verification and registered
access hashes. Access is limited to 900 seconds and the live session lifetime;
refresh rotates hashes and preserves the original maximum seven-day expiry.
Reusing an old refresh secret revokes that session. Logout/password change/reset
invalidate the old sessions. Permission claims are never taken from JWT roles.

Known/unknown OTP requests return the same generic response. HMAC-protected OTPs
expire at 15 minutes, have five attempts and atomic one-time consumption. Reset
sets the Argon2id password, consumes the OTP and revokes sessions in one transaction.
SMTP delivery starts after commit without delaying HTTP; a provider delay cannot
identify eligible addresses. Delivery is best effort and a process restart may
require an explicit resend. Capture is limited to tests/local development.

The HTTP session guard checks current session and selected active membership.
SQL coordinators recheck operation permission and paired resource scope under
the User/Tenant locks. One user's grants are unioned only within one tenant.
Parent access requires a current verified link; Teacher access requires the
assigned class/session. A broader unrelated role cannot widen a financial grant.

Static role/permission seeds follow Detailed Design §A.2. Notification inbox
permissions are also granted to internal recipient roles as the minimal FR-37/39
mapping; there is no dynamic permission editor. Member creation/onboarding,
deactivation, append role assignment/revocation and parent create/verify/revoke
are exposed. Global user disable is restricted to the operator CLI.

Deferred last-Manager guards cover User status, membership, grants, role catalog,
role permissions, access scopes and ACTIVE tenant state. A valid Manager must
have an active User/member/grant, role.assign and TENANT scope. All runtime
writers use the User → Tenant lock order. Global disable discovers and locks all
affected tenants in sorted order and rolls back if any would lose its Manager.

O-11 bootstrap is one transaction: CREATED tenant, static policy/catalog, pending
User/member, self-referenced first grant, OPERATOR audit containing the actual
database LOGIN. No fake operator membership, temporary password or public
bootstrap exists. OTP activation enables the tenant only after a valid Manager.

Reviewable technical defaults: five failed logins/15-minute lock, per-IP limits
30 login / 10 OTP / 20 reset per minute, one OTP/user/minute, five OTP attempts.
These are implementation defaults, not new owner-approved business decisions.

## E. R4-B Workflow

R2 owns financial requests, decisions, immutable payloads, effects and root
receipts. R4 adds a thin decision adapter for APPROVE/REJECT/REQUEST_INFO and
adds operation-specific authority checks to APPROVE as well as execution.
Authenticated financial decisions/execution verify the pinned policy hash.

APPROVED commits without a financial effect. Explicit execution locks/rechecks
the target and approved basis, then commits effect/root receipt/audit/COMPLETED
together. Concurrent execution with a different caller key returns the same root
effect. Failure preserves the decision, rolls back financial effects and records
post-rollback no-effect reconciliation. Recovery reuses the existing coordinator.
The one-qualified-Manager self-approval exception remains manual and audited.

REQUEST_INFO preserves the original immutable financial request. Changed input
requires a new request; this task does not invent mutable approved versions or a
generic workflow engine. Existing TOP_UP/payment reversal and adjustment/cancel
commands remain manual-only. Worker operations cannot approve or reverse money.

## F. R4-C Jobs, outbox and notifications

Jobs allow only SCHEDULE_CHECK and BILLING_GENERATE. Claim uses ordered User/
Tenant admission followed by `FOR UPDATE SKIP LOCKED`, database LOGIN ownership,
30-second lease and increasing fence. The worker checks current initiating
authority, real session, pinned policy and lease at effect execution. A deferred
receipt constraint additionally rejects COMMIT after lease expiry. Lost workers
are reclaimed with preserved LEASE_EXPIRED history.

Attempts are bounded to four total. Transient failures retry after 1/5/15 minutes;
denial fails closed; missing Billing input yields NEEDS_INFORMATION. Manual retry
below exhaustion is authorized/idempotent and preserves attempts/root/policy.
No fifth worker attempt or hidden new generation is allowed. A committed
NEEDS_INFORMATION generation needs the existing explicit Billing recompute flow.
Post-exhaustion manual-domain recovery extensions remain a separate review.

Existing committed R3 ScheduleChanged events are consumed as SCHEDULE_CHANGED.
Recipient insert/dedup and outbox DONE share one database transaction; a crash
rolls back both, so there is no abandoned PROCESSING/ack gap for DB-only delivery.
Two workers skip locked work. Consumer failures have bounded persisted retry.
Inbox, unread count and mark-read recheck recipient/live resource authority;
revoked Parent/Teacher access cannot read previously delivered sensitive context.

ADMIN_ALERT is persisted for failed/needs-information/approval-required job
states. ASSIGNMENT_PUBLISHED has a consumer connection point; R5 publication is
not implemented. No business email, SMS, push or deadline reminder was added.

## G. R4-D Audit and HTTP runtime

Audit validates User/member/tenant pairing and distinct USER/WORKER/OPERATOR
shapes. Worker records preserve initiating attribution separately without fake
membership actors. Operator audit requires the real LOGIN identity. Auth events,
role/member/link mutations, financial effects and jobs leave durable evidence.
Known secret fields are recursively redacted; secret-bearing outbox payloads
are rejected. HTTP command correlation is bound to the private transaction and
propagates into atomic audit; authorized explanations can query that correlation.

R2 immutable audit/decision/receipt guards remain; job attempts and refresh
history are immutable too. Runtime credentials have no history UPDATE/DELETE or
raw table DML. Denying all purge protects the **24-month minimum**; there is no
retention deletion, partition drop, archive or financial receipt TTL implementation.

HTTP adapters include Billing wallet/receivable reads, Scheduling calendar,
Attendance scoped read, financial request/decision/execute, inbox/mark-read,
audit/explanation and job status/retry. DTO helpers reject unknown fields and
validate UUIDs, bounded query input, money strings, reasons and idempotency keys.
Errors expose only safe code/message/correlation, never Prisma SQL or secrets.

## H. Schema and privilege inventory

| Migration | Additions / enforcement                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 010       | AUTH/API/WORKER NOLOGIN groups and NOLOGIN owner; access hash/expiry/CSRF session fields; immutable refresh-token history; private transaction binding; R2/R3 principal bridge; auth/OTP functions |
| 011       | OPERATOR group; parent evidence/operator attribution; active grant/link partial uniqueness; scope/OTP/counter checks; current permission/Manager guards; static seed; scoped IAM/operator disable  |
| 012       | R2-owned decision adapter; operation-specific financial decision check; safe read projections                                                                                                      |
| 013       | Job fence/request hash/actor session/lease start; attempt/lease/allowlist CHECKs; private worker context; claim/effect/retry; immutable attempt history; generation policy pin                     |
| 014       | DB-only outbox dispatch; live recipient checks; inbox; immutable event source; secret payload rejection; worker audit attribution                                                                  |
| 015       | Owner-approved O-11 A bootstrap; activation of valid Manager tenants                                                                                                                               |
| 016       | HMAC-keyed private rate counters; password-change credential lookup; security-event audit                                                                                                          |
| 017       | Correlation binding; session recheck after User wait; deferred worker commit fence; pinned financial policy check                                                                                  |
| 018       | Controlled member onboarding; no public bootstrap or existing-user demotion                                                                                                                        |

One new public model/table: RefreshTokenHistory. Three private SQL-only tables:
transaction_principals, worker_context, auth_throttles. Existing User, membership,
scope, policy, approval, job, event, notification and audit models are reused.
Public new columns have matching Prisma fields/FKs; partial indexes/CHECKs,
triggers and private tables are intentionally SQL-owned.

Native inventory verified **50 R4 functions** with fixed trusted search paths,
NOLOGIN owner and no PUBLIC EXECUTE; the appended R2 decision function retains
the R2 owner. Separate LOGINs are provisioned by the operator/harness, never by
public HTTP. Startup rejects superuser/DDL/owner/combined capability connections.

## I. Native PostgreSQL evidence

PostgreSQL **16.15**, native Debian image on local Docker. Every runner created
its own fresh loopback cluster/database/anonymous volume with recorded image ID,
random credentials and sanitized metadata. No production/shared/earlier evidence
database was reused, reset or dropped. No `db push` was used.

Full R1a → R1b → R2 → R3 005–009 → R4 010–018 migration deploy, recorded checksum
matching, successful redeploy and empty Prisma schema drift were exercised.
R3 separately upgrades populated synthetic checkpoint 007 data through R4.
Populated unmanaged tenants/jobs fail preflight instead of receiving invented
historical managers, actors or receipts. Fresh evidence is not legacy adoption.

| Suite          | Final task-owned container                            | Evidence                                              |
| -------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| R4 full 54     | `educore-r4-native-6dc600066a5c4b329397b6ce924693e9`  | `%TEMP%/educore-r4-evidence-LiEaXD/evidence.json`     |
| R4 focused C01 | `educore-r4-native-0808144de7d4475eba980adb18b9312d`  | `%TEMP%/educore-r4-evidence-YFOHLC/evidence.json`     |
| R1b            | `educore-r1b-native-78b190fbd7414810bd01db033cd67d7d` | `%TEMP%/educore-r1b-pg-evidence-hVw91j/evidence.json` |
| R2             | `educore-r2-native-7fab43f4852149508c92b46113f5c17e`  | `%TEMP%/educore-r2-evidence-PIRaLo/evidence.json`     |
| R3             | `educore-r3-native-c6f916cc4c284aaa8b955d716f6a40a0`  | `%TEMP%/educore-r3-evidence-qK78A3/evidence.json`     |

The final complete R4 run records 18 race observations: 17 observed wait edges
and one SKIP LOCKED/rollback recipient schedule. Other R4 lease/reclaim tests and
R1b/R2/R3 multi-connection schedules provide additional independent observations.
The final evidence includes per-case results, catalog and migration checksums.
Containers/volumes are retained; no cleanup deletion was performed.

## J. HTTP/E2E evidence

R4 uses a real Nest test application, actual password login, registered JWT/session,
tenant selection, database memberships/grants and production service bindings.
There is no trusted fake-principal override. Tests cover 401/403, malicious IDs,
wrong tenant, revoked roles/links, paired scope, refresh replay, concurrent request
isolation, DTOs, CSRF/Origin, cookie flags and safe error output.

Financial HTTP tests prove manual APPROVED with zero adjustments, explicit
COMPLETED with one adjustment/refund/root, then replay without another effect.
Scheduling/Attendance/Parent and notification routes query the existing domain
gateways. Production-mode HTTP confirms host-only HttpOnly Secure SameSite=Lax
cookies and denied CORS origins. This is not a deployed-browser/subdomain test.

## K. Tests actually run

Commands from the repository root unless stated otherwise:

| Command                                                                                                             | Result                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm --dir apps/api exec prisma validate`                                                                          | PASS                                                                                  |
| `pnpm --dir apps/api exec prisma generate`                                                                          | PASS                                                                                  |
| `pnpm --dir apps/api exec tsc --noEmit`                                                                             | PASS                                                                                  |
| `pnpm --dir apps/api build`                                                                                         | PASS                                                                                  |
| `pnpm --dir apps/api lint`                                                                                          | PASS, no warnings in final run                                                        |
| `powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests`                | 54 PASS, native PostgreSQL and real authenticated HTTP                                |
| Same runner with `-TestFilter C01`                                                                                  | 1 PASS / 53 filtered skips; strengthened valid-payload idempotency conflict assertion |
| Same runner with `-TestFilter 'C06\|X13'`                                                                           | 2 PASS/42 filtered skips during defect resolution; not counted as full suite          |
| `powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/schema-integrity/start-r1b-native.ps1 -RunTests` | 39 PASS, 3 pre-existing skips                                                         |
| `powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r2/start-r2-native.ps1 -RunTests`                | 57 PASS, including native drift, financial failures/replay/concurrency                |
| `powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r3/start-r3-native.ps1 -RunTests`                | 56 PASS, including 008/009 follow-ups, populated upgrade and Billing integration      |
| `pnpm --dir apps/api test`                                                                                          | 41 PASS in offline/unit/WASM run                                                      |
| `pnpm --dir apps/api test:cov --testTimeout=15000`                                                                  | 41 PASS; coverage below                                                               |
| `pnpm --dir apps/api test:e2e`                                                                                      | 1 scaffold HTTP PASS; separate from R4 HTTP proof                                     |
| `git diff --check`                                                                                                  | PASS; line-ending notices only                                                        |

Initial implementation runs exposed SQL naming, PostgreSQL JSON transport and
deferred-constraint/fixture issues; they were fixed and complete suites rerun.
The first coverage run under four concurrent native suites exceeded an existing
WASM case's 5-second timeout. The isolated coverage rerun with 15-second timeout
passed; no functional expectation was weakened. The final four native suite runs
all passed after the final runtime/migration corrections.

V8 offline coverage: overall **70.17% branches** (includes test helper code),
BillingCalculator **81.25%**, crypto **92.5%**. It does not instrument PostgreSQL
business logic or the separate native/HTTP suite. Full Scheduling/Billing NFR-12
coverage is **NOT ESTABLISHED**. NFR-01/02 representative load/latency is **NOT
RUN**; suite timing is not a performance claim.

R1b skips remain T37 populated legacy adoption, T41 its older deferred runtime
test, and T42 restore/tzdata. R4 supplies separate real HTTP evidence; it does not
rewrite the historical skipped test to PASS or claim restore/adoption readiness.

## L. Traceability matrix

Statuses below describe bounded implementation evidence, not automatic closure
of the historical finding. Tests are in `test/r4/r4.postgres.test.ts` unless stated.

| Sources / finding                               | Implementation                                                             | Test IDs / observed evidence                                               | Status                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| FR-01; UC-01–03; Q-01                           | auth/crypto/service, migrations 010/016                                    | A01–09/17, D04/10, X05/06/16; unit crypto/config; real login/reset/revoke  | PASS                                               |
| FR-02; UC-04; BR-10                             | member/activation/operator commands                                        | A09/11/13/16, X02; no temporary credential/last Manager loss               | PASS                                               |
| FR-03/04; UC-05/36; BR-08/14; FR-42/Q-15        | session guard + SQL permission/resource gates                              | A03/10/14/15, D02, X03/04/11/12/17; current paired grants/tenant isolation | PASS                                               |
| FR-06; UC-06; Q-02                              | parent evidence/verify/revoke and live domain reads                        | A12, C06, X04; no implied sibling discount                                 | PASS                                               |
| FR-44 bounded P0; UC-26/34; BR-11; H-19; T27/28 | existing R2 coordinator + decision adapter                                 | B01–03, X07–09/14; durable decision/one root/manual self flag              | PASS                                               |
| FR-45; UC-37; Q-13; BR-09/12/13; H-15           | fenced worker and commit guard                                             | C01–05/07, X11/15; expiry/reclaim, four attempts, 1/5/15, manual replay    | PASS                                               |
| FR-37/39; UC-31; Q-13; T36/37                   | committed outbox + live recipient inbox                                    | C03/06, X13; rollback/replay/dedup/revoked reads                           | PASS                                               |
| FR-41; UC-35; Q-14; H-14/20; T38/39             | audit actors/redaction/history/retention denial                            | D03/05/06/07; wrong actor, secret event, DML/DDL/PUBLIC denied             | PASS for runtime guards                            |
| H-10; E04; T01                                  | Manager constraint + global coordinator                                    | A11/16, X01/02; native R1b T26                                             | PASS                                               |
| H-11; E03/05/06; T06/07                         | composite refs, active uniqueness, scope pairing                           | A10/12/15, X03/04/17; R2 S03/04; R3 scoped calendar                        | PASS for implemented paths                         |
| H-16; T40                                       | typed request hash/root/atomic receipt/current authority                   | C01/05/07, X08–10/14; R2 replay/fault/race suite                           | PASS                                               |
| M-02/03/07; O-11; E01–06                        | scalar/lease checks; approved bootstrap A; fixed transitions               | A08/09/13, C04, D07; 010–018 catalog                                       | PASS for R4 subset                                 |
| O-01/07/13                                      | reuse verified lock hierarchy/R2 explicit execution; no new generic engine | X01–17; R1b/R2/R3 native schedules                                         | IMPLEMENTED FOR REVIEW; register not self-approved |
| FR-37 R5 source                                 | ASSIGNMENT_PUBLISHED consumer point only                                   | Consumer branch present; no R5 source writer in this task                  | DEFERRED TO R5                                     |
| T39 restore/retention operations                | no purge/archive implementation                                            | runtime early deletion denied; restore drill not run                       | PARTIAL / operations deferred                      |
| T41 full lifecycle/P1 policy                    | allowlisted P0 only                                                        | unsupported worker actions fail; no P1 route/editor mounted                | PASS for P0 boundary; P1 deferred                  |
| H-04 remaining source/adoption dependencies     | old financial/source guards preserved                                      | full R1b/R2/R3 native regression                                           | OPEN; not closed by R4                             |

Required cross-domain concurrency scenarios map as follows: Manager/global
disable/role races X01–03/17; Parent read X04; OTP X05; refresh X06/16; decision
X07; execution X08; changed target X09; lease reclaim C02; stale finish X15;
idempotency X10; outbox crash/two workers X13; worker revoke X11; financial
execution/approval basis R2 C06/07 plus X09; R3 grant/attendance X12 and R3
X10/16; effect/receipt failure X14; history denial D03/07; tenant/actor mismatch
A03/D03. These are actual DB outcomes, not sleep-only assertions.

## M. Security review

Trust boundary: verified JWT → registered live hash → private PID/transaction
binding → current User/member/permission/resource checks → restricted SQL
coordinator. R2/R3 retain legacy operator-owned LOGIN bindings for their existing
contract; R4 API/WORKER LOGINs cannot use those as a fallback. No request actor
GUC, role header, global mutable identity or arbitrary SQL endpoint exists.

AUTH credentials can read a candidate hash through a narrow auth function and
commit a CAS-protected verified login; they cannot execute domain commands.
API/WORKER credentials cannot read credentials or acquire AUTH/owner/operator
capabilities. The trusted backend's AUTH credential/signing secrets and the
migration administrator remain privileged trust roots, not a claimed defense
against a compromised host/database owner.

R4 policy hashes, current permissions on replay, unique financial root receipts,
worker fencing at COMMIT, immutable issued sources and append-only audit remain
enforced. No critical defect remained in the completed suites. The final full
native/HTTP run includes the OTP provider-latency correction and auth audit fix.

## N. Outstanding risks and review items

- Real SMTP delivery, production browser/subdomain CSRF/SameSite behavior,
  HTTPS/database TLS, proxy/logging/secrets rotation and deployment configuration
  need environment verification. OTP delivery after commit is best effort.
- P0 REST adapters are representative, not full R2/R3 CRUD. The append role POST
  plus revoke POST, job enqueue and wallet-read transport additions need API
  review. No bulk role replacement editor or generated Swagger/OpenAPI artifact
  was added; existing Markdown contracts were not silently rewritten.
- P1 dynamic permissions/workflow/policy UI, R5 assignment publication, advanced
  reports/retention/archive and production operational monitoring remain outside
  this task. Exhausted jobs cannot start a fifth worker attempt.
- Populated historical identity/job/financial adoption needs reviewed inventory
  and provenance; no historical actors/receipts or opening balances were invented.
- R3 sealed attendance/leave financial correction and automatic grading rubric
  limitations remain closed exactly as before. H-04 remains OPEN.
- Restore/tzdata, representative performance and complete NFR-12 SQL/domain
  branch coverage are not established by these tests.
- All new files, migrations, technical defaults, privileges and API adapters
  require owner review before Git/shared deployment. No commit, push, PR, merge,
  reset, rebase, external app mutation or deployment was performed.

## O. Final verdict

**R4 IMPLEMENTED — POSTGRESQL & HTTP VERIFIED — READY FOR REVIEW**

All 54 R4 native/HTTP cases and the R1b/R2/R3 regression suites passed locally.
Database and HTTP verification do not establish production operational readiness.
Real SMTP delivery, adoption/restore, performance and complete NFR-12 evidence
remain review items above; H-04 remains OPEN. All changes are local and unstaged,
with no Git write or deployment performed. Stop here for owner review.
