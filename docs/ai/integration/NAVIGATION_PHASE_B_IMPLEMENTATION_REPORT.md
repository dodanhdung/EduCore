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

## Native verification follow-up — 24/10/2026

**Historical checkpoint disposition: `NAVIGATION_PHASE_B_VERIFICATION_PARTIAL`; superseded by the resumed verification section below.** This section adds evidence after the implementation checkpoint; the earlier results above remain the historical Phase B implementation record. The owner committed that checkpoint at `ac2db77139c50400d03bfd2f65bd506dbba4e754` on `feat/foundation-auth-tenant-access`. The working tree was clean before this follow-up. The 21 paths changed from baseline `4412e260182be7e3b530dbd5887fc365468ecc95` match the previous owner-review ZIP exactly, including per-entry SHA-256 content. Historical R1–R6 migrations were unchanged in that commit; the new migration sorts after `202610200024_r6_sibling_integrity`.

### Docker and database admission

`docker context show` returned `default`; `docker context inspect default` resolved to local `npipe:////./pipe/docker_engine`. Docker CLI version was 29.8.2. `docker version`, `docker info`, `docker ps -a` and `docker image ls postgres:16` could not reach that named pipe, so running containers and local image availability could not be determined. The user Docker config produced an access-denied warning; an empty task-specific temporary `DOCKER_CONFIG` removed the warning but did not restore daemon access. Docker Desktop was installed and was opened without mutating containers, but six checks still found no daemon and `com.docker.service` remained `Stopped`. The R4 runner was invoked with the temporary config and stopped at its `docker info` gate **before** generating a run ID, container, database, password or admission flag. No PostgreSQL 16 server was observed.

Consequently, `202610240001_r7_navigation_access/migration.sql` was **not applied** in this follow-up. Its runtime SQL version, `_prisma_migrations` entry/checksum, replay behavior, `pg_proc` definition/owner/SECURITY DEFINER/search path/ACL, restricted LOGIN privileges, raw-table denials, `R4Repository.assertRuntime()` against PostgreSQL, and schema drift are **NOT RUN**. Static source review and the unit test comparing the migration body to the frozen draft plus NC-01 are PASS, but are not database evidence. No shared or production DB was touched.

### Native security, HTTP and browser gates

N01–N17, including both independently coordinated NC-01 lock-wait variants, executed **0 cases** because the runner never admitted a cluster; their outcome is **NOT RUN**, not PASS or SKIP. The required live-membership/tenant denial, rotation/revocation and unexpected SQL-failure classifications therefore remain unverified on the installed function. A20–A22 actual NestJS+restricted-PostgreSQL HTTP cases and migration replay/drift tests likewise remain **NOT RUN**. Existing HTTP service-double tests pass in the default API suite; they do not prove DB integration, SQLSTATE mapping or runtime ACLs. Edge binary was found locally, but A19 actual Edge→React→NestJS→PostgreSQL journey was **NOT RUN** because its database prerequisite failed. Web JSDOM tests cover navigation validation, expiry, stale responses, logout, tenant switching and mobile menu without replacing actual browser evidence. Production Preview fixture isolation was checked by the web build asset list, which had no Preview fixture chunk.

### Full regression rerun

| Exact command | PASS | FAIL | SKIP / note |
|---|---:|---:|---|
| `pnpm.cmd --dir apps/api build` | 1 | 0 | Build completed |
| `pnpm.cmd --dir apps/api lint` | 1 | 0 | No lint warning |
| `pnpm.cmd --dir apps/api test` | 81 tests | 0 | First concurrent attempt timed out in the PGlite setup hook (66 PASS, 15 SKIP); standalone rerun passed 81/81 in 11 files. Vite reported a tsconfig-paths advisory. |
| `pnpm.cmd --dir apps/web build` | 1 | 0 | Vite build completed |
| `pnpm.cmd --dir apps/web lint` | 1 | 0 | One warning in unchanged AT03 `LeaveRequestFormScreen.tsx` (`react(set-state-in-effect)`) |
| `pnpm.cmd --dir apps/web test` | 233 tests | 0 | Reported a Vite WebSocket port-24678 warning; tests passed |
| `git diff --check` | 1 | 0 | Re-run after documentation updates |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests` | 0 | 0 | **NOT RUN:** runner stopped at local Docker `info` prerequisite before tests |

No Phase B source or test defect was confirmed by a native run; this follow-up changes documentation only. The follow-up owner-review ZIP is `artifacts/educore-navigation-phase-b-verification-review.zip` and contains only this report and `R7_LOCAL_DEVELOPMENT.md` at repository-relative paths. Mandatory PostgreSQL, NC-01, HTTP and Edge gates are still missing, so owner acceptance for activation or merge is **not recommended**. Next action: make the local Docker Engine available, run the unchanged fresh-disposable runner, inspect its sanitized evidence, and repair only confirmed in-scope failures. Shared/production migration, deploy and Git actions remain separate owner decisions.

## Native verification resumed and closed — 24/10/2026

**Current disposition: `NAVIGATION_PHASE_B_VERIFIED_READY_FOR_OWNER_REVIEW` for the approved local five-screen Phase B contract.** The preceding PARTIAL checkpoint remains as historical evidence. The owner made Docker Engine available after that checkpoint. Direct sandboxed Docker access returned named-pipe `permission denied`; read-only `docker info` and the already-authorized runner succeeded from an elevated tool session against the same local `default` context. Docker Server was 29.8.2. The runner's local-context, fresh-container identity/label, loopback-only binding, no external mounts, empty public schema, no migration table/role conflicts and PostgreSQL-16 admission checks passed before tests. No unrelated container was modified.

### Disposable migration and catalog evidence

The final runner invocation was `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests`. It admitted fresh task container `educore-r4-native-46f19c1c997f49e08444e64b27bb1769`, database `educore_r4_native_46f19c1c997f49e08444e64b27bb1769`, loopback port 55241 and PostgreSQL 16.15 (`server_version_num=160015`). Sanitized runner evidence is at `C:\Users\Admin\AppData\Local\Temp\educore-r4-native-46f19c1c997f49e08444e64b27bb1769\environment.json`; sanitized test evidence is at `C:\Users\Admin\AppData\Local\Temp\educore-r4-evidence-cqOsJB\evidence.json`. These local evidence files are outside the ZIP and contain no password/token values.

The final test database recorded all 25 ordered migrations, ending with `202610240001_r7_navigation_access` checksum `d91a1c808905f2948bb9ef29f6c6408b078f4e3f97080ea7ec7d9a66fa23d474`. The prior R1–R6 source migrations were unchanged. D08 confirmed a second `migrate deploy` reported `NO_PENDING_MIGRATIONS` and schema drift was `EMPTY`. A read-only `pg_proc` query showed `educore_r4.navigation_access(uuid)` owned by non-LOGIN `educore_r4_owner`, `prosecdef=true`, fixed `search_path=pg_catalog, educore_r4, pg_temp`, and no PUBLIC EXECUTE. The installed `prosrc` MD5 `1add881de85d48f4364824bad73f7d94` equals the exact body extracted from the new migration. `educore_r4_api` had EXECUTE; AUTH, WORKER and OPERATOR roles did not. N11 confirmed the restricted API LOGIN cannot SELECT raw credentials, role permissions or access scopes. `R4Repository.assertRuntime()` passed before the suite. No shared or production database was touched.

### Native security, HTTP and Edge results

The final native suite ran **78 PASS / 0 FAIL / 0 SKIP** in one file. All **19 navigation-labeled assertions** passed: N01–N16 (N06/07 as separate CLASS and STUDENT cases), both N17 NC-01 variants, and the added unexpected-SQL-failure regression. N02/N03 tested wrong or NULL selected tenant and revoked membership; N04/N09 tested revoked or absent grants; N05/N08/N15 tested exact TENANT mapping, role union and tenant isolation; N10–N14 tested Parent restriction, raw table denial, exact response/TTL, expired/revoked sessions and disabled user. The two NC-01 cases used independently controlled connections and observed a User-row lock wait before expiring or rotating credentials; both returned SQLSTATE `28000` without navigation evidence. Wrong tenant/membership cases returned authorization denial `42501`. The new cancellation case observed the same lock wait, canceled the restricted query, and received SQLSTATE `57014` rather than empty success. The five-screen mapping remained OP01/OP04/OP05/OP06/OP07; OP05 was excluded from menu links because it needs a resource ID.

A20–A22 all passed against actual NestJS and restricted PostgreSQL credentials: unauthenticated 401; authenticated 200 with exactly five response fields, bounded `validUntil`, no-store, no ETag, request ID and no cookie; malformed query/body 400; wrong selected tenant and revoked membership 403; no relevant permission 200 with `screenIds:[]`; expired session 401; and OP05 resource denial despite menu eligibility. A21 also sent `If-None-Match: *` through actual NestJS+PostgreSQL and received 200 with no-store/no ETag, never a cached 304. D05 covered correlated HTTP audit. A19 used actual headless Edge, React and NestJS against restricted PostgreSQL and passed the login→tenant selection→navigation→AppShell journey. Its evidence recorded all 11 booleans true: actual HTTP sequence, desktop/mobile authorized links, unreviewed route denial, reload fail-closed, logout and server revocation, no local/session storage secrets, no password/token in DOM, and HttpOnly refresh cookie. Role-specific eligibility and invalid/expired/stale navigation states were additionally checked in N01–N17 and web JSDOM tests; the Edge harness itself exercised the representative Manager journey rather than every role permutation.

The first disposable native run had **76 PASS / 1 FAIL / 0 SKIP**: A21 threw `TypeError: actor is not a function` because its local session variable shadowed the `actor()` test helper before the empty-permission HTTP assertion. This was a test-harness defect, not an authorization failure. Renaming that local variable let A21 run its remaining empty-permission, revoked-membership and expiry assertions. A second fresh cluster gave 77/77 PASS; the added cancellation regression gave 78/78 PASS on a third. After adding the actual conditional-cache HTTP assertion, a fourth run reached **77 PASS / 1 FAIL** when D08's Prisma replay/diff CLI stalled after loading its config and timed out; all navigation, HTTP and Edge cases had passed. Docker stayed healthy, and the same full suite on a fifth fresh cluster completed **78 PASS / 0 FAIL / 0 SKIP**, including D08 replay/drift, in 83.20 seconds. This isolated D08 timeout did not justify a source or migration change. No source business logic or migration was altered. The five runner-owned containers `educore-r4-native-075eea6742fb47809f92c21a334c442f`, `educore-r4-native-836df3100da04a6a8789759ddab7b387`, `educore-r4-native-bfb6716ada1b49dfa0cf5459a5dc2f89`, `educore-r4-native-3f9e0e11cd3c49fe8240a24558262781` and `educore-r4-native-46f19c1c997f49e08444e64b27bb1769` and their anonymous volumes were retained under task labels for owner review; none was cleaned automatically.

### Final regressions, files and review boundary

| Exact command | Final result | Note |
|---|---|
| `pnpm.cmd --dir apps/api build` | PASS | Nest build |
| `pnpm.cmd --dir apps/api lint` | PASS | No warning |
| `pnpm.cmd --dir apps/api test` | 81 PASS / 0 FAIL / 0 SKIP | Existing Vite tsconfig-paths advisory |
| `pnpm.cmd --dir apps/web build` | PASS | No Preview fixture chunk in production asset list |
| `pnpm.cmd --dir apps/web lint` | PASS | One pre-existing AT03 `react(set-state-in-effect)` warning |
| `pnpm.cmd --dir apps/web test` | 233 PASS / 0 FAIL / 0 SKIP | Existing Vite port-24678 warning |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests` | 78 PASS / 0 FAIL / 0 SKIP | Fresh local disposable PostgreSQL 16.15 and actual Edge |
| `git diff --check` | PASS | Run after final documentation edits |

Changed files in this follow-up: `apps/api/test/r4/r4.postgres.test.ts` (A21 harness repair), `apps/api/test/r4/navigation-proposal.cases.ts` (unexpected SQL cancellation regression), this report and `docs/ai/integration/R7_LOCAL_DEVELOPMENT.md`. No new source file, historical migration edit, staged file, commit, push, PR, merge or deployment. The refreshed `artifacts/educore-navigation-phase-b-verification-review.zip` contains exactly these four files with repository-relative paths; each entry is verified against its source SHA-256. This is local owner-review readiness, not production deployment approval. The owner reviews these changes before Git and separately authorizes any shared/production migration, activation or deployment. The representative Edge harness does not prove every role and race in a real browser; native SQL/HTTP and JSDOM assertions supply those complementary checks. Production TLS, cookies/domains, SMTP, volume ACL and multi-tab behavior remain deployment-environment checks.
