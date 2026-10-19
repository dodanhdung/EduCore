# R3 native verification

From the repository root on Windows, with an installed local Docker Engine:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r3/start-r3-native.ps1 -RunTests
```

The runner creates a new PostgreSQL 16 container and anonymous volume, a random
loopback port and a unique `educore_r3_native_*` database. It verifies ownership,
empty tables, role conflicts and database isolation before granting test admission.
Credentials stay in process memory/environment and are never written to evidence.
The harness applies all migrations through Prisma, then invokes real Nest services
and Prisma transactions with restricted actor-bound LOGINs.

`pnpm --dir apps/api test:r3:native` requires `R3_TEST_URL` and
`R3_TEST_DISPOSABLE=I_OWN_THIS_DISPOSABLE_CLUSTER` from a verified disposable
cluster. It never falls back to `DATABASE_URL`. An already migrated database is
rejected. Each full rerun needs a fresh cluster; the runner never resets a target,
deletes a container/volume or bypasses migration admission.

Groups in `r3.postgres.test.ts`: A Academic, B Scheduling, C Attendance/Leave,
D Billing/catalog, X independent-connection races. X records observed PostgreSQL
blocking edges with `pg_blocking_pids`; timing alone is not concurrency evidence.
Historical fixtures explicitly construct synthetic original source data; they are
not a production backfill or permission to enroll into completed sessions.

The runner prints sanitized environment and evidence paths under the OS temporary
directory. Failed and successful containers/volumes are retained for inspection.
The implementation report records the final successful targets and remaining
grade-policy, sealed-financial-source, HTTP authentication and delivery boundaries.
