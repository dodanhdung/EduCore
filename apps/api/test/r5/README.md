# R5 verification

Run from the repository root on Windows with an installed, running local Docker Engine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r5/start-r5-native.ps1 -RunTests
```

The runner admits only a new loopback-bound PostgreSQL 16 container and database,
with a new anonymous volume. It checks ownership, version, empty catalog and role
conflicts before setting `R5_TEST_DISPOSABLE`. It never uses `DATABASE_URL` as a
test target, reuses an old verification database, or removes a container/volume.
Each run leaves sanitized environment evidence in its printed temporary folder.
The native test creates separate restricted R4 auth/API/worker LOGINs and uses
real password login and tenant selection, including HTTP login in E01. Other
fixtures use the same actual AuthService login with password verification.
No fake principal or request-controlled actor ID is used.

The test also leaves sanitized case/race/migration evidence and a dedicated
temporary private volume. Tests preserve these native artifacts for review.
Only `files.spec.ts` cleans its own verified `mkdtemp` directories.

```powershell
pnpm.cmd --dir apps/api test:r5:files
pnpm.cmd --dir apps/api test:r5:native
```

The second command needs the runner's admitted environment in the same shell.
Use the runner for a fresh invocation; do not copy private connection strings.
An optional `-TestFilter 'Checkpoint A'` selects a checkpoint on a fresh cluster.
The combined suite uses independent PostgreSQL connections and observes
`pg_blocking_pids`, with explicit barriers for filesystem/outbox boundaries.

## Runtime configuration and contract

`R5_PRIVATE_STORAGE_ROOT` is a required absolute, dedicated, private directory
for the executable API. Use a persistent private Railway Volume in deployment.
The API OS identity must exclusively control this directory and its parents;
never serve it as static/public content. Startup rejects symbolic-link ancestors.
The existing R4 database credentials, JWT/OTP settings and OTP delivery apply.
Tests inject a separate temporary adapter; there is no production-root fallback.

Assignments: create/publish/edit/archive under the authenticated tenant routes.
`Idempotency-Key` is required on commands. Assignment updates/publication use
`If-Match` with the current numeric assignment revision. Student-targeted drafts
can omit `classId` when each student has exactly one eligible class taught by the
actor; ambiguous membership returns validation failure and requires `classId`.
Recipient IDs come from the scoped recipients response. Recipient revocation and
deadline-extension commands require a reason and the assignment revision.

Uploads: `POST /api/v1/tenants/:tenantId/files`, multipart fields `recipientId`
and `file`. PDF/DOCX/JPG/JPEG/PNG; **10,000,000 bytes**, at most five files per
immutable submitted version. Files are STAGING until physical promotion and
verified READY metadata commit. No upload/finalize endpoint accepts a client
storage path. Download requires an actual authorized submission-file link.
Private keys are never returned in FileInfo, downloads or reconciliation reports.

Submission cutoff is the greater of assignment deadline and recipient override,
plus **168 hours inclusive**. Server/DB time determines submittedAt and lateness.
Every successful submission creates the next immutable version and atomically
sets the current pointer. Ready-file bytes are checked inside the authenticated
submission transaction before links commit.

Grades use **decimal strings**, e.g. `"8.5"`. `"8.55"` is rejected before numeric
storage; PostgreSQL also checks unbounded numeric precision/range. A draft save
appends a revision, cancelling a previous live draft without deleting history.
The first save accepts no `If-Match` (revision 0); subsequent draft saves and
correction creation require `If-Match` equal to the latest grade revision.
Publish/cancel commands specify `{revision}`. Cancellation requires a reason.
Published correction creates a draft with a reason, followed by explicit publish.
Only the newest PUBLISHED revision is exposed; a newer draft cannot conceal it.
Cancelling an unpublished draft reopens submission only without published history.

R5 activates the R4 learning predicates and the Q-11 Teacher correction grant.
Parent file permission is not granted by default: a verified relationship alone
does not grant a permission missing from the approved role catalog. If explicitly
granted, file access still requires that current verified relationship.

Reconciliation is `POST .../files/reconciliation`, requiring existing tenant-wide
`audit.read`. It reports missing/mismatched/unfinished/orphaned/unreferenced
objects under the same tenant gate as linking. **No TTL, physical deletion or
automatic restore exists.** Missing or corrupt READY bytes fail closed on submit
and download. A failed upload leaves inspectable private STAGING evidence.

Actual deployment, malware scanning, coordinated DB/Volume backup/restore,
performance/coverage and R6 review remain separate evidence obligations.
