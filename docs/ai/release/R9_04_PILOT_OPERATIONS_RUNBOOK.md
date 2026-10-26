# R9.4 controlled-pilot operations runbook — proposed, not deployed

This procedure is for owner review before the first real pilot session. It does not authorize deployment, production data access, Git operations or real email integration. Local proof: `R9_04_PILOT_SMOKE_EVIDENCE.json`. The smoke runner `apps/api/test/pilot/start-pilot-smoke.ps1` admits a **new disposable loopback PostgreSQL 16** container, uses `seed-demo.ts`, starts built API/Web and local fake SMTP/OTP worker, checks synthetic HTTP operations, stops helper processes and retains the container. It is **not** a target-host deployment tool.

## 1. Pilot scope and accountable operators

Before provisioning, the owner records: pilot tenant, named users and roles, included workflows, excluded PO05/AC09/legacy cases, finance approval authority, OTP residual-risk decision, technical operator, backup operator and daily review contact. Proposed first access list: Manager, Teacher, Student and verified-linked Parent. Academic Staff and Accountant stay excluded until their own login/navigation/operation walkthrough passes. If the pilot requires either, that walkthrough is a pre-session gate. Use only current approved grants and resource scopes; no role-name shortcut. Keep external payment, refund, bank reconciliation, SMS/Zalo and other P1 integration disabled.

## 2. Environment inventory and admission

| Component | Required pilot check |
| --- | --- |
| Runtime | Node 24.12+; frozen `pnpm-lock.yaml`; reviewed source revision; API and Web builds from that revision. No checked-in secrets. |
| PostgreSQL | PostgreSQL 16, owner-approved isolated database; record server minor, image/tzdata and migration baseline. `DATABASE_URL` belongs only to migration/operator process, never HTTP or worker runtime. Take a pre-migration backup and record migration manifest/checksums. Apply `prisma migrate deploy` only after admission and a recovery plan. |
| Restricted principals | Separate LOGINs for `educore_r4_auth`, `educore_r4_api`, `educore_r4_worker`, `educore_r4_otp_delivery` and controlled operator; deny superuser/CREATE/cross-role membership. API startup must pass `R4Repository.assertRuntime`; OTP worker must pass `RecoveryWorker.assertRuntime`. Rotate/hold each credential separately. |
| API | `R4_AUTH_URL`, `R4_API_URL`, optional enabled `R4_WORKER_URL`, random `R4_JWT_SECRET` and `R4_OTP_PEPPER`, issuer/audience, exact HTTPS Web origin, `R5_PRIVATE_STORAGE_ROOT`, `PORT`. `apps/api/.env.example` is an inventory, not deployable values. Preserve Origin/CSRF, secure cookie and cache-control behavior. |
| Web | Build with the intended **public** `VITE_API_BASE_URL`; serve `apps/web/dist` through the approved HTTPS host. Do not put secrets in `VITE_*`. Open real login and protected routes in a browser against the same API. |
| OTP recovery | Active recovery key ID/material on API; worker receives only restricted `R4_OTP_WORKER_URL`, key map and SMTP transport settings. No actual OTP or credential in logs/review ZIP. The current worker entry point **rejects `NODE_ENV=production`**. A production-mode pilot must not proceed with password recovery until an owner-approved delivery worker/operating mode passes security review and real delivery/expiry/reset smoke. Development-mode fake SMTP is local verification only. |
| Private files | Dedicated non-public directory/volume, writable by API identity only; verify upload/download authorization and include it in backup/restore. No public static mount. |

Do not run the native admission suite against a shared, already populated or real customer database. Do not manually set `R4_TEST_DISPOSABLE`. The current `seed-demo.ts` accepts only local `educore_demo_*`, creates a compact Manager fixture with a known **test-only** credential and draft records, and is unsuitable for real pilot accounts or a six-actor fixture. Use controlled operator bootstrap and individually provision synthetic training fixtures or owner-approved real pilot identities after the security/backup gates. No production data was modified in this task.

## 3. Startup and verification sequence

1. Freeze reviewed revision and configuration; record which branch/commit was built. Run frozen install, Prisma validate/generate, migration manifest, typecheck, API/Web tests/build/lint. Do not treat local checks as hosted CI.
2. Admit isolated PostgreSQL 16 and private file root, take recovery checkpoint, apply only reviewed migrations. Confirm all migrations finished and no failures. Create restricted logins by controlled operator, then test runtime grants. Keep migration/admin URL out of API/Web/worker environments.
3. Start the API from built `apps/api/dist/main.js` with exact restricted AUTH/API/business-worker environment. Verify process stays running and root health/basic HTTP responds; a build-only PASS is insufficient.
4. Start the approved OTP delivery worker as a separate restricted process **only after resolving the production-mode guard and SMTP/key custody**. Validate it cannot use API/worker/operator DB rights. For local test, fake SMTP must bind loopback and accept only `.invalid` synthetic recipients.
5. Serve built Web with the intended API origin. Use a real browser to render `/login`, sign in with each included role, select tenant, open server-derived navigation and its approved operation, then logout and verify revoked session denial. Verify cross-tenant and unrelated-resource requests fail. A separate local Edge check rendered the built login form, but target-host authenticated built-Web interaction remains a pre-session check.
6. For finance, use an eligible source and current authorized actor: generate/review/issue; manual TOP_UP creates no invoice Payment; explicit wallet payment creates one; request/APPROVE creates no financial effect; execute creates one root receipt/adjustment and correct internal net-excess credit. Re-read DB/authorized outcomes and audit. Stop on any mismatch.
7. Confirm authorized notification/inbox, audit correlation, job state and worker heartbeat/retry visibility. Distinguish `APPROVED`, queued/running, failed and `COMPLETED`. Review safe unavailable states for PO05, AC09 and legacy/mixed finance.

For each session, record timestamp, actor/tenant/scope, route, expected and actual HTTP/UI outcome, server receipt or safe denial, and owner initials. Keep access tokens, cookies, OTPs, passwords, personal data, raw browser profiles and database dumps out of the review packet.

## 4. Backup, restore and forward recovery

R6-06 previously rehearsed a coordinated **local same-image** PostgreSQL/private-files recovery point with passwordless role metadata restored and restricted passwords reprovisioned afterward. It did not establish a target-host RPO/RTO. Before real data, the owner chooses a backup schedule (daily is the proposed minimum for a small pilot), retention/location, encryption and a named restore operator. Finance or file-heavy activity may require more frequent checkpoints; this is an owner operating decision.

At a consistent recovery point, pause new writes and wait for in-flight finance, assignment/file and worker operations to settle. Back up PostgreSQL with a version-matched `pg_dump --format=custom` using an approved protected credential source such as `PGSERVICEFILE`/`PGPASSFILE`, not a password in a command argument. Snapshot the **private file root at the same checkpoint** and record object manifest/hash, DB dump hash, migration revision, server version and UTC time. Resume writes only after both artifacts are verified. Never include backups in Git or review ZIP.

Rehearse restore into a **different empty isolated database and private root**: provision appropriate passwordless role metadata, `pg_restore --no-owner --no-acl --dbname="service=educore_pilot_restore" <protected.dump>`, reprovision restricted LOGIN passwords through the controlled operator, restore private files, start API/worker against the restore target, then verify tenant-bound login, an issued invoice/wallet outcome, a published grade and authorized private-file download. The exact restore command and owner role mapping must be adapted and reviewed for the target host. Do not run `pg_restore` over a live pilot database. Failed forward migration calls for stopping writes, preserving the failing state/backup and a reviewed forward fix or isolated restore; do not edit applied migration history or manually rewrite issued financial records.

## 5. Daily operating and incident procedure

- At opening: verify API/Web and both worker processes, DB/volume health, last successful paired backup, migration revision and OTP delivery state. If any essential dependency is down, suspend the affected workflow.
- Review `FAILED`/retry jobs and outbox/inbox alerts daily with current authorized `job.read`/`notification.read`; use only explicit eligible retry. Inspect audit correlation, finance receipts/idempotency and unexpected OTP 429/503 patterns. Log a bug with actor, route, UTC time, expected/actual and redacted correlation ID.
- On finance discrepancy, unauthorized access, stale sensitive data, missing file or failed restore: stop new writes/affected access, preserve immutable evidence, take a coordinated checkpoint if safe, revoke compromised grants/sessions and inform the owner. Reconcile through approved adjustment/reversal; never silently edit issued history or mark `APPROVED` as `COMPLETED`.
- On repeatable account-enumeration signal or account takeover: suspend recovery endpoint/pilot invitations and request security review. The unresolved R4 timing equivalence failure itself remains recorded; owner risk acceptance is required before limited exposure.
- Resume only after root cause, authorized correction, focused verification and an owner go decision. No automatic bank refund, external reconciliation or unapproved migration is part of recovery.

## 6. What this task actually proved

The local smoke proved a fresh restricted built-API start, built-Web HTTP preview, synthetic Manager HTTP authentication/navigation/dashboard, wrong-tenant denial, local fake-SMTP recovery delivery and logout revocation. A separate Edge check rendered the built-Web login form; it did not authenticate. Prior R6 proved same-image local DB/files restore. **NOT RUN:** target pilot deployment, target backup/restore, production-mode OTP worker, real email, authenticated built-Web Edge journey, guided six-actor demo and hosted GitHub Actions. Do not invite real users until the pre-session gates in the risk register and closure proposal are resolved.
