# EduCore R9.4 local MVP — Windows owner guide

**Scope:** synthetic, single-computer use only. This guide was verified on `test/r9-04-release-candidate` at local HEAD `c12f7325a268261d5b4986571aa145e56325ee53`, with uncommitted launcher changes awaiting owner review. It does not configure real-user pilot email or production hosting.

## First time

Install Node.js **24.12 or newer** (verified `24.12.0`), pnpm (verified `12.11.2`) and Docker Desktop with Linux containers. Docker Desktop must be running. From PowerShell:

```powershell
cd D:\EduCore
pnpm.cmd install --frozen-lockfile
.\scripts\start-local.ps1 -Initialize
```

`-Initialize` creates one dedicated PostgreSQL **16** container named `educore-local-mvp-<id>`, bound only to loopback. It admits an **empty** `educore_demo_local_<id>` database, deploys the repository migrations, provisions separate restricted API/auth/worker logins, and invokes the protected `seed-demo.ts` once. It renames the synthetic Manager to `admin@local.invalid`; the tenant is **EduCore Demo**. The first launch runs Prisma Client generation if missing and builds the API. It starts the built NestJS API with an internal business worker and Vite development Web server. Password recovery/email remains unavailable locally; login uses the test-only seeded password.

The launcher stores its database identity and Windows-user-encrypted secrets under ignored `.local/config.json`, with persistent private files in `.local/private-files` and logs in `.local/logs`. Keep the same Windows account and Docker container for restarts. Do not copy `.local` into Git, ZIPs or a public share. If Docker container/config identity differs, the launcher stops for review; it never creates a replacement database on a normal start. There is no reset command.

To see the **synthetic demo password** on this computer, inspect the single `const password` line in the local seed source:

```powershell
Select-String -Path apps/api/scripts/seed-demo.ts -Pattern '^const password ='
```

Use that password only with `admin@local.invalid` in this isolated database. The seed has a compact Manager fixture (two students, one teacher, course/classes and draft records); it is not a complete six-actor organization. Never invite real people or enter real records. The owner may explore only actions currently allowed by this synthetic Manager's server grants.

## Daily use

Start Docker Desktop, then:

```powershell
cd D:\EduCore
.\scripts\start-local.ps1
```

Open **http://127.0.0.1:5173/login**. Sign in as `admin@local.invalid`, choose **EduCore Demo**, then use Manager dashboard, academic student list and BL09 finance where current permissions allow. The dashboard shows the three P0 KPIs. Manual TOP_UP is a synthetic test operation: it changes a wallet only after server confirmation and does not create an invoice Payment. Other implemented routes are available according to the server-derived navigation and fixture data; empty or unavailable screens are expected for missing fixtures or deferred flows.

The API health URL is **http://127.0.0.1:3000/**. Logs are `.local/logs/api-*.stdout.log`, `.local/logs/api-*.stderr.log`, `.local/logs/web-*.stdout.log` and `.local/logs/web-*.stderr.log`. View a recent error log with `Get-Content (Get-ChildItem .local/logs/api-*.stderr.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName -Tail 50`. Keep log contents private.

To stop only launcher-owned API/Web processes and the dedicated database container:

```powershell
.\scripts\stop-local.ps1
```

The container and its PostgreSQL volume are **stopped, not deleted**. `.local/private-files` stays in place. Start again with `start-local.ps1` (without `-Initialize`); the launcher checks migration status and uses the same database, credentials and file root. A second initialization is refused. The verified restart kept the original TOP_UP: the next browser run observed one pre-existing transaction and a 1,000 VND balance before a second test TOP_UP.

## Common errors

| Message/symptom | Operator action |
| --- | --- |
| `DEPENDENCIES_MISSING` or `PRISMA_CLIENT_GENERATION_FAILED` | Run `pnpm.cmd install --frozen-lockfile`; rerun the launcher. Confirm Node/pnpm versions. |
| `DOCKER_DESKTOP_UNAVAILABLE` or `POSTGRES_16_REQUIRED` | Start Docker Desktop Linux containers; verify `docker info`. Do not point the script at a remote Docker context or existing database. |
| `LOCAL_SETUP_REQUIRED` | Run `start-local.ps1 -Initialize` once. If `.local/config.json` or the named container already exists unexpectedly, stop and review rather than deleting it. |
| `LOCAL_MIGRATION_MISMATCH` or `LOCAL_DATABASE_NOT_EMPTY` | Stop. Review the migration history and configured dedicated database. The daily launcher never applies pending migrations automatically. Do not reset or migrate an unknown database. |
| `LOCAL_PORT_IN_USE` | Find the owner of ports **3000** or **5173** and stop it yourself if appropriate. The launcher will not kill it. |
| `LOCAL_ALREADY_RUNNING` | Use the current URL or run `stop-local.ps1` before starting again. |
| Login rejected | Use `admin@local.invalid` and the test-only password from `seed-demo.ts`. Confirm the **EduCore Demo** tenant and that the API health URL responds. A real account or prior test-container account is not part of this local fixture. |
| Frontend cannot reach API | Check both URLs, recent API/Web error logs, and whether another process changed ports. The Web origin and API URL are loopback only. |
| Local OTP worker unavailable | Expected: `R4_OTP_MODE=unavailable`. Synthetic login works; email reset/activation is outside this local closure. Do not switch to development fake SMTP for real users. |
| `LOCAL_CONTAINER_IDENTITY_OR_STORAGE_MISMATCH` or encrypted config cannot be read | Preserve `.local` and Docker data; review the selected context, container ID/label, current Windows account and volume. Do not delete/recreate to make startup pass. |

## R9 boundary

The local MVP readiness decision is separate from the historical R9.4 automated regression/RC and real-user pilot decisions. The official OTP timing equivalence test remains FAIL; production OTP delivery, target-host restore, hosted CI, public deployment, multi-actor pilot and production monitoring are not proved here. AC09, PO05 finance reads, legacy/mixed finance and P1 remain deferred or excluded. Only the owner may formally declare `R9_COMPLETE_MVP_LOCAL_READY` after reviewing the local evidence and files.
