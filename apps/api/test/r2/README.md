# R2 native verification

Run from the repository root with an already installed and running **local Docker Engine**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r2/start-r2-native.ps1 -RunTests
```

The script creates a fresh PostgreSQL 16 container, anonymous volume, database and loopback port for each run. It refuses a remote Docker context and does not reuse an R1b target, install software, remove resources or modify an existing database. It waits for the final TCP server, rather than PostgreSQL image initialization's temporary Unix-socket server. Containers and evidence remain available for review; cleanup is a separate operator action.

Credentials are random and passed privately through process environment. Do not copy connection strings, passwords, Docker inspection environment or private harness files into Git/review packages. The printed environment/evidence paths identify the task-owned target without publishing its credentials. Never run this harness against a shared, historical or production database.

The native suite uses actual Nest dependency injection, Prisma's PostgreSQL adapter and restricted PostgreSQL LOGINs bound to persisted sessions. Administrative fixture connections provision data and principals; financial commands run through restricted connections. This verifies an internal command boundary, **not production pooled HTTP authentication or a deployed API**. `BillingModule` is not mounted into the application and exposes no controllers.

## Migration failure test

Do not manually deploy migrations before invoking the suite. On its admitted empty target, the harness first injects a division-by-zero fault before the new financial migration's COMMIT. It proves transactional DDL rollback and absence of R2 tables/roles. Only then does it use Prisma's supported `migrate resolve --rolled-back` for that failed attempt and deploy the original migrations. The failed rolled-back history row is retained. There is no mark-applied shortcut, history-table rewrite or populated-database adoption. Never copy this recovery step to another database without investigating its actual state.

## Offline checks

```powershell
pnpm.cmd --dir apps/api test
pnpm.cmd --dir apps/api exec prisma validate
pnpm.cmd --dir apps/api exec prisma generate
pnpm.cmd --dir apps/api exec tsc --noEmit
pnpm.cmd --dir apps/api build
```

`test:r2:native` is the lower-level runner used by the setup script; it needs the harness's explicit private target/admission environment. Offline validation and generated types do not establish PostgreSQL concurrency safety.

The final implementation report records native evidence, test IDs, acceptance coverage and exclusions. In particular, R3 attendance/transfer workflows, R4 pooled authentication/job leasing, REST contracts, legacy financial adoption and a business policy for nonexistent DST due times remain separate work. The DST gap branch currently rejects ISSUE atomically rather than changing the approved local due time silently.
