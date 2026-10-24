# EduCore Navigation Authorization — Phase B local implementation report

**Status: `NAVIGATION_PHASE_B_PARTIAL` (owner review; no production activation).**

## Scope and approval

Owner explicitly approved `APPROVE_MINIMAL_CONTRACT` in the current task conversation for exactly §4, §5 and §6.3 of `NAVIGATION_AUTHORIZATION_APPROVAL_PACKET.md`: OP01/member.read, OP04+OP05/approval.read, OP06/audit.read and OP07/job.read, all TENANT read-only; the exact navigation HTTP contract; and the frozen SQL draft with NC-01 correction. Local implementation and disposable testing only were authorized. No commit, push, merge, shared-DB migration or production deployment was authorized or performed.

Baseline: branch `feat/foundation-auth-tenant-access`, HEAD `4412e260182be7e3b530dbd5887fc365468ecc95`; working tree clean before this task. The approval packet and frozen draft were present. No baseline drift or owner-authored changes were found.

## Implementation

- Forward-only migration `202610240001_r7_navigation_access` creates `educore_r4.navigation_access(uuid)` from the frozen candidate with only the approved NC-01 principal-error correction. It retains SECURITY DEFINER, the fixed search path, `educore_r4_owner`, explicit PUBLIC revoke and API-only EXECUTE grant. No role seed, permission widening or business DML was added. The migration has **not** been applied to any database in this task.
- NestJS mounts `GET /api/v1/tenants/:tenantId/access/navigation` behind `SessionGuard`. The service independently verifies the JWT, binds through the restricted API transaction, calls the SQL function with a parameterized tenant UUID and validates the exact five-field response and JWT identity/session/tenant binding. Valid membership with no applicable grants returns an empty `screenIds`; denial and errors never become empty success. The route rejects query/body input and emits no-store JSON without ETag/304. The startup repository check requires the approved function owner/configuration/ACL before this runtime can start.
- React fetches the route with Bearer, `credentials:'omit'` and `cache:'no-store'`. It rejects unknown, duplicate, unsorted, unpaired or malformed screen IDs and DTO fields, binds evidence to the current principal/session/tenant/epoch, caps validity at the response, access-token and request-start deadlines, and clears it when expired. AU05 self-service stays available while a live session remains. OP05 has no unresolved-ID menu link. Actual resource APIs still authorize each read; navigation does not grant mutations or enable Preview data.
- Existing SQL fixture module now targets the migrated function by default in the admitted disposable native harness. It no longer installs the draft separately. N17 adds independent-connection lock-wait expiry/rotation cases, and ACL checks include OPERATOR. Native HTTP and Edge journey tests were updated for the five-screen contract. Unit and JSDOM coverage includes schema rejection, no ETag/304, stale response, 401 loss, timer expiry, mobile menu and Preview isolation.

## Verification actually run

| Check | Result |
|---|---|
| `pnpm.cmd --dir apps/api build` | PASS |
| `pnpm.cmd --dir apps/api lint` | PASS |
| `pnpm.cmd --dir apps/api prisma:validate` | PASS; Prisma schema valid |
| `pnpm.cmd --dir apps/api test` | PASS, 81 tests in 11 files; mocks/unit/static checks, **not native PostgreSQL** |
| `pnpm.cmd --dir apps/web build` | PASS; production asset list has no Preview fixture chunk |
| `pnpm.cmd --dir apps/web lint` | PASS with one existing warning in AT03 `LeaveRequestFormScreen.tsx` |
| `pnpm.cmd --dir apps/web test` | PASS, 233 tests; JSDOM/browser simulation, **not Edge+PG end-to-end** |
| `git diff --check` | PASS |
| Native R4 disposable runner | **NOT RUN**: local Docker daemon unavailable. Initial runner invocation also hit an unreadable user Docker config; a fresh temporary `DOCKER_CONFIG` bypassed that warning, then `docker info` failed before cluster admission. Starting Docker Desktop and its service did not make the daemon available. No PostgreSQL container, database or migration was created. |

## Security verification still required

The changed migration and NC-01 correction have **no execution PASS** on PostgreSQL 16. The N01–N17 SQL cases, actual Nest+restricted-PostgreSQL HTTP cases A20–A22, A19 Edge browser journey, migration replay, live `pg_proc`/ACL catalog assertions and drift checks remain unverified. Do not promote this artifact or declare production readiness. Once a local Docker daemon is available, run the repository's fresh-disposable `apps/api/test/r4/start-r4-native.ps1 -RunTests`; inspect failures and rerun on a new admitted disposable cluster after fixes. Production deployment and any shared migration require separate authorization.

## Owner review

Review all new files before Git. The owner-review ZIP `artifacts/educore-navigation-phase-b-owner-review.zip` contains only this task's modified and new repository files at relative paths. It excludes secrets, generated builds, Docker/browser/database contents, `.git` and prior archives. No Git action was performed.
