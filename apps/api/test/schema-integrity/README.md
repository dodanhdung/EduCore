# R1b verification harness

Test-only code; no application module imports this directory. Source-of-truth and approved scope: `docs/ai/reviews/database/R1B_IMPLEMENTATION_PLAN.md` and the owner's R1b implementation authorization.

## Offline checks

From repository root:

```powershell
pnpm.cmd --dir apps/api exec prisma validate
pnpm.cmd --dir apps/api exec prisma generate
pnpm.cmd --dir apps/api exec tsc --noEmit
pnpm.cmd --dir apps/api test:r1b:offline
pnpm.cmd --dir apps/api test:r1b:wasm
```

Offline tests check safety admission, schema/baseline preservation and generated nested input types. The separate WASM smoke suite applies the exact baseline, R1b SQL and companion profile to a fresh in-memory PGlite PostgreSQL engine, executes real SQL/PL/pgSQL and tests selected source/history/privilege paths. It uses one process and is not evidence of server concurrency, Prisma migrate deploy, or real Prisma nested queries. Neither suite satisfies the native PostgreSQL verification gate.

## Disposable PostgreSQL only

Use a dedicated local disposable PostgreSQL cluster (target 16.x), not a database on a shared cluster: the migration creates cluster-level NOLOGIN roles. The test login must be the dedicated cluster administrator because fixtures inspect roles and model ordinary runtime sessions. No existing roles are adopted or dropped. No production/shared/remote target is allowed.

Create an empty database with a unique name beginning `educore_r1b_` using tools you control. These tests never create/drop/reset/truncate an unknown database, and refuse a nonempty `public` schema. Set, without printing credentials:

```powershell
$env:R1B_TEST_DISPOSABLE = 'I_OWN_THIS_DISPOSABLE_CLUSTER'
# Set R1B_TEST_URL privately to the new database: loopback literal 127.0.0.1 or ::1,
# database educore_r1b_<unique>, no URL query parameters. DATABASE_URL is ignored.
pnpm.cmd --dir apps/api test:schema-integrity
```

Setup exercises rollback of baseline+R1b DDL on an injected failure, then runs actual `prisma migrate deploy` using ONLY this validated URL. It applies the runtime-profile companion SQL separately. Production migrations contain no fixtures. A legacy time-based source blocks automatic upgrade; a per-target reviewed adoption migration is required instead of inventing timezone evidence.

Every test uses controlled synthetic inputs and a single-connection client per participant. Transactional tests roll back; concurrency fixtures commit within this disposable database and are left for inspection. Reruns use a new empty database/cluster; the runner does not delete old evidence or cluster roles. SQLSTATE, named FK, source state, catalog and effective privilege assertions must actually pass.

Two-connection tests use an acquired-lock barrier and a third observer reading `pg_blocking_pids`. Polling schedules the observer; a sleep is never accepted as proof of a wait. Races vary the winner and commit/rollback. Test-only current authorization reads real User/session/membership/role/permission/scope rows after User/Tenant locks. It does not authenticate an HTTP principal or ship a generic SQL write gateway. The retry adapter is test-only, bounded to two retries, and rechecks authorization on each attempt.

Evidence is written to a new OS temporary directory. Native T08 uses the real generated Prisma client with PrismaPg, runs nested create/connect/disconnect and InvoiceLine nested connects inside User-before-Tenant transactions, and reads current authorization after locks. This test still requires the disposable server; TS compatibility and WASM SQL behavior alone do not prove it passed. T37 reviewed legacy upgrade, T41 real runtime, and T42 backup/tzdata upgrade are explicitly not claimed by this harness. No P-gate PASS may be inferred from skipped or missing mandatory evidence.

Prisma 7.10.1 compatibility restriction, verified by native T08: `AttendanceRecord.finalization.disconnect` attempts to clear shared required identity columns and is rejected (`23514`); the transaction retains the original finalization/tenant/session. A trusted authorized command must unlink an unused finalization with `data: { finalizationId: null }`, inside the same User-before-Tenant transaction, preserving required tenant/session fields. The existing history guard still rejects this unlink for billed attendance. Do not expose generic nested disconnect or unchecked update payloads in an API, and do not make shared identity columns nullable to accommodate the client. T08 proves rejection/rollback plus this safe scalar unlink, not successful generic nested disconnect.

After review, cleanup is the owner's explicit disposal of the dedicated test cluster. No cleanup command against an existing data directory is provided here.

## Windows: prepare a fresh Docker test cluster

Install/start **Docker Desktop with a local Linux-container engine** separately if it is unavailable. This route does not require a separate Windows PostgreSQL installation. Alternatively, provision a dedicated native PostgreSQL 16 cluster and follow the safety admission above; Docker is then unnecessary.

From repository root, once Docker is available:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/schema-integrity/start-r1b-native.ps1 -RunTests
```

The execution-policy option applies only to this child process. The script does not install software or change machine policy. It pins a local Docker context, starts a uniquely named `postgres:16` container with fresh storage and a dynamically selected loopback-only port, verifies ownership and an empty PostgreSQL 16 catalog, then passes a private random credential to the existing harness. First use may download the official image. It never reads `DATABASE_URL`, reuses a cluster, or runs manual migrations before the harness.

Each full run creates a new cluster. Containers/anonymous volumes are deliberately retained for inspection; the script does not reset or delete resources. Sanitized `environment.json` is saved in a new OS temporary directory; native test evidence is saved by the existing harness. No password/connection URL is written by the setup script. Review the actual test statuses and evidence before declaring the native gate passed. Without Docker the script fails before creating resources or setting admission flags.
