# EC-OPS-LOCAL-RENDER-DATA — preparation and rehearsal

Status: **LIVE INDEPENDENT DEMO IMPORTED**, 30/10/2026. Owner's subsequent FAST-TRACK request explicitly authorized live staging migration and a consistent independent demo fallback. Branch remains `deploy/r13-staging`; no commit/push/deploy or auth/business/security-guard/historical-migration changes.

Business trace: Requirements v5 + Wallet/v5.1, FR-01–06, Q-01/02/14/15, NFR-04/08; UC-01–06/35–37; DB Design v1.1 Group A; ADR-002/003/004/005/006/011. The V2 audit results in the conversation remain the baseline; the earlier V2 ZIP was absent from the workspace at preparation start. This document does not approve new business or authorization behavior.

## Current outcome

Live plan `fe12a0a251681a4de6422af6b159a42c0a8783a9d98b06be0831a01093b7d7f5` committed **4,673 projected rows + 4 fresh Manager credentials + 4 operator audit receipts**. Post-commit fingerprints and runtime-role catalog checks passed. All four Managers passed API login/tenant selection, dashboard, academic lists and cross-tenant denial. Vercel redirects unauthenticated visits to Vercel Login; actual frontend rendering remains blocked by that protection. No protection/configuration was changed.

The four staging tenants are **new identities**, mapped to source tenants. Source frozen-tenant identity/history stays intact locally. Imported profiles/classes retain source UUIDs and business timestamps; new-tenant creation/activation/freeze markers describe the new staging environment. Names/codes/emails/contact/DOB/free text are sanitized locally before sending rows to Render. Original billing, funded-wallet history, audit/workflow/submission/grade history and the excluded confirmed-calendar cohort remain at source. No amount/date was shifted to force acceptance.

The first larger live attempt lost its connection during deferred checks. A new read-only connection verified zero tenants/users/students/credentials/receipts and no remaining migration session: full rollback, no replay. The smaller plan was generated, rehearsed and executed independently. It retains every draft/cancelled session and one complete confirmed session per source tenant with a confirmed session. There are 343 sessions, 2,134 participants and 123 bookings, alongside all 152 students, 25 teachers, 38 classes and 226 enrollments.

Current private run: `.local/staging-transfer/r13-live-safe-20261030/`. Its `demo-plan-summary.json` contains source→staging tenant mapping and counts; `demo-live-receipt.json`, `demo-live-verification*.json` and `demo-http-verification*.json` record execution. `manager-<stagingTenantUUID>.credential.xml` is a Windows DPAPI-protected PSCredential for each Manager; `Import-Clixml` under the same Windows account can consume it without putting the password in arguments. Do not print passwords into logs/transcripts or commit these files.

For an interactive local view, select one Manager credential file and run the following under that Windows account. Password retrieval goes directly into a masked local dialog, not terminal output; no clipboard is written automatically:

```powershell
# This Manager belongs to STG_757BD1B3CA3D: 50 students / 8 teachers / 12 classes.
$credentialFile = Get-Item 'D:\EduCore\.local\staging-transfer\r13-live-safe-20261030\manager-6cd3b33a-5eaa-41a8-9ae5-12755799e631.credential.xml'
$credential = Import-Clixml -LiteralPath $credentialFile.FullName
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object Windows.Forms.Form
$dialog.Text = 'EduCore staging Manager'; $dialog.Width = 560; $dialog.Height = 170
$emailBox = New-Object Windows.Forms.TextBox
$emailBox.SetBounds(12,12,510,24); $emailBox.ReadOnly = $true; $emailBox.Text = $credential.UserName
$passwordBox = New-Object Windows.Forms.TextBox
$passwordBox.SetBounds(12,46,510,24); $passwordBox.ReadOnly = $true
$passwordBox.UseSystemPasswordChar = $true; $passwordBox.Text = $credential.GetNetworkCredential().Password
$reveal = New-Object Windows.Forms.CheckBox
$reveal.SetBounds(12,80,240,24); $reveal.Text = 'Show password in this local dialog'
$reveal.Add_CheckedChanged({ $passwordBox.UseSystemPasswordChar = -not $reveal.Checked })
$dialog.Controls.AddRange(@($emailBox,$passwordBox,$reveal))
[void]$dialog.ShowDialog()
$passwordBox.Clear(); $dialog.Dispose(); $credential = $null
```

### Earlier preparation evidence (retained)

Full local and Render backups were created through read-only exported snapshots and restored into a new, loopback-only PostgreSQL 16 cluster. Restore uses a non-superuser maintenance LOGIN. Initial cluster bootstrap uses PostgreSQL's bootstrap administrator solely to create that LOGIN; no application restore, fixture, or transfer operation runs as superuser. Restricted runtime logins have new database passwords, not copied role passwords.

Restore reconstructs a fresh database in PostgreSQL's normal pre-data/data/post-data order. Constraints and triggers are present and enabled in the final restored database. It does not prove data-only import into an already protected schema: historical guards are not invoked while reconstructing data before post-data triggers. No `--clean`, trigger disabling, session_replication_role, or owner-role switching is used to import data through live guards.

Full original-history migration remains **BLOCKED**. The existing R5 trigger always overwrites `submitted_at` with `clock_timestamp()`. A native test resolves the nullable submission/version cycle with active constraints, then proves the timestamp changes. Tenant insertion also forbids importing an existing freeze marker. The live fallback therefore uses new staging tenant identities and holds original guarded history. Do not change guards to make historical adoption succeed.

The preparation manifest had 79 INCLUDE / 8,540 HOLD / 280 EXCLUDE. The live projection replaces unverified identifiers locally and executes a dependency-closed cohort: 4,673 projected rows, 3,946 held source business rows, and the same 280 excluded auth/runtime/migration rows. No blanket synthetic attestation was fabricated. Two funded wallets and their five transactions remain local; 149 zero-balance wallets were copied. No original invoice/billing/grade/submission/audit history is claimed migrated.

## Files and boundaries

- `scripts/migrate-local-to-render.ps1`: branch/source/container allowlists, NTFS ACL, DPAPI key custody and process-only secrets.
- `apps/api/scripts/staging-data-transfer.ts`: authenticated AES-GCM private archives, consistent backup, manifest, isolated restore, verification and hard import gate.
- `apps/api/test/staging-data-transfer.spec.ts`: unit guards, encryption/tamper, attestation, cycle detection, conservative schema comparison and credential-plan boundaries.
- `apps/api/test/staging-data-transfer.postgres.spec.ts`: explicit disposable-URL gate, real FK cycle/timestamp behavior, tenant denial, restricted AUTH/API logins and restored wallet/audit evidence. All mutation fixtures roll back.
- `apps/api/scripts/staging-demo-live.ts`: local projection, FK/business ordering, exact plan gate, isolated/live execution, fingerprints and HTTP evidence.
- `apps/api/test/staging-demo-live.spec.ts`: PII redaction, full-UUID aliasing, financial holds, pinned decimal-string policy and digest/scope gate tests.

The tool does not implement full-history adoption, persistent file storage or SMTP changes. The live path provisions only the projected synthetic Managers with independently generated passwords through existing Argon2id `passwordHash()`, atomically with the cohort/operator receipt. `credentialPlan()` remains a design-only helper for the older full-adoption proposal. No source password/hash/session/OTP is copied into the transfer payload. Full recovery backups contain original DB auth history and stay encrypted/private; they are not staging import payloads.

## Windows operation

Prerequisites: same Windows owner, Node >=24.12, existing pnpm dependencies, Docker Desktop local context with `postgres:16`, branch `deploy/r13-staging`, `.local/config.json` with the V2 container identity. The external Render URL is only read from `C:\Users\Admin\.educore-secrets\render-db-url.txt`. Do not paste it or pass it in arguments. Exact Render hostname/database are compiled allowlists. TLS certificate verification remains enabled; libpq receives Node's public CA bundle in the source container's temporary client directory.

Choose a **new** private run directory for backup. The wrapper protects it to the current Windows SID and SYSTEM, stores an AES key protected by Windows DPAPI, and removes process secret variables when finished. Backup binary is never redirected through PowerShell text output or stored plaintext on disk. Do not copy this directory into Git/artifacts or a public share. DPAPI requires the same Windows user/profile; off-machine recovery/key escrow is not established by this local exercise.

```powershell
Set-Location D:\EduCore
$run = '.local/staging-transfer/NEW_UNIQUE_RUN'
.\scripts\migrate-local-to-render.ps1 -Mode backup -PrivateRoot $run
.\scripts\migrate-local-to-render.ps1 -Mode audit -PrivateRoot $run
.\scripts\migrate-local-to-render.ps1 -Mode dry-run -PrivateRoot $run
.\scripts\migrate-local-to-render.ps1 -Mode rehearsal -PrivateRoot $run
.\scripts\migrate-local-to-render.ps1 -Mode verify -PrivateRoot $run -RunFocusedTests
```

`audit` checks encrypted archive hashes and inventories the backup snapshots; its status explicitly says it is **not a new live audit**. Source/target snapshots have their own capture times. `dry-run` creates a manifest once and stops at HOLD; it does not write either database. Rehearsal restores only into a newly created labelled local cluster; it does not process held records. `verify` only accesses the isolated clones. `-RunFocusedTests` creates synthetic rollback fixtures only in the empty target clone and uses fresh local restricted logins. The PostgreSQL spec is skipped in an ordinary test run without its explicit disposable environment; use the wrapper for full evidence.

For the completed exercise, private evidence is under `.local/staging-transfer/r13-preparation-20261030-e/`. Backups were initially captured in the `...-b` attempt, then copied byte-for-byte with hash verification to later isolated attempts; no source or Render backup was repeated to resolve local restore issues. Failed attempt directories remain encrypted/private. Attempt containers were stopped, not deleted.

Important modes:

- `backup -ResumeBackup`: explicit resume only after examining a partial backup. It reuses an existing receipt only if the encrypted archive decrypts and its SHA256 matches; it never silently overwrites an archive. A complete run cannot be replayed.
- `rehearsal`: refuses an existing `isolated.json`; a failed attempt is not auto-retried or cleaned. Inspect failure evidence, stop the exact labelled container, and prepare a new private attempt with verified encrypted inputs. Do not rerun restore against partially populated DBs.
- `verify`: requires the recorded isolated container running. If it was stopped after review, verify its full ID and label from `isolated.json` before starting it; do not start the application/worker.
- `import`: remains fail-closed without the explicit owner-authorized scope switch and exact successful rehearsal digest. The earlier unconditional preparation block is superseded by the live execution gate below.

## Live execution gate and verification

The actual committed run is not replayable against a populated target. Example of the already completed sequence:

```powershell
$run = '.local/staging-transfer/r13-live-safe-20261030'
# demo-plan: exact source/target checks; fresh target backup restore proof on an isolated probe;
# local de-identification; immutable encrypted plan. Depends on the verified preparation clone/key custody.
# demo-rehearsal: full isolated transaction with guards active, including roster before finalization.
# import: requires both the owner's explicit scope switch and the exact successful rehearsal digest.
# Do NOT rerun this import; the dataset is already committed.
# .\scripts\migrate-local-to-render.ps1 -Mode import -PrivateRoot $run `
#   -ExecuteApprovedLiveDemo -ExpectedPlanDigest fe12a0a251681a4de6422af6b159a42c0a8783a9d98b06be0831a01093b7d7f5
.\scripts\migrate-local-to-render.ps1 -Mode demo-verify -PrivateRoot $run
```

`demo-verify` uses read-only DB access and normal synthetic Manager API login/logout. It writes new, append-only verification evidence. It never reimports data. The executor locks affected tables, refuses existing business data, inserts dependency levels without disabling constraints/RLS, provisions fresh credentials, writes per-tenant receipts, forces all deferred constraints and compares fingerprints before COMMIT. A lost connection is reconciled by reading receipts/counts before any new plan, never blind replay. Full-history source data remains held. This is a one-time tool bound to the reviewed local configuration, preparation clone and DPAPI key; it is not a general database synchronizer.

## Evidence and equivalence

Each backup receipt records raw custom-archive SHA256/bytes, PostgreSQL version, consistent-snapshot digest and table counts. `.dump.enc`, `.snapshot.enc`, `payload.enc` and failure diagnostics are AES-256-GCM encrypted; `key.dpapi` is Windows-user-protected. Receipts/manifests/isolated identity contain metadata only and still stay private. Runtime database passwords are generated afresh and encrypted; they are never emitted.

Verification compares all 74 table counts and ordered row fingerprints, including UUIDs, amounts, timestamps, audit and auth recovery history, plus columns/collations, constraints/validation/deferrability, indexes, functions/security owners/ACLs, triggers and enum labels. Data fingerprints use SHA256 over sorted PostgreSQL MD5 row fingerprints; archive authentication and SHA256 independently protect the backup bytes. This is integrity evidence, not a claim of production backup availability/RPO/RTO.

Comparison explicitly handles PostgreSQL internal trigger OID names, equivalent associative AND/OR parentheses produced by dump/reparse, and NULL ACL versus the same table-owner default ACL. It preserves meaningful AND/OR grouping and does not strip arbitrary parentheses. Five source CHECK definitions re-deparse with flattened AND grouping; one owner-only ACL becomes NULL/default. Original definitions remain in encrypted snapshots; no constraint is edited.

The isolated DB owner is reconstructed from the backed-up public application owner, restoring the implicit public-schema permission context. Four target provider default-ACL entries owned by `postgres` are deliberately omitted from the isolated restore TOC; no membership in postgres is granted. Existing app object owners/ACLs/functions/guards match. This is application/current-object equivalence, not an exact clone of Render's platform-global role/default settings. Source local_admin is recreated non-superuser in isolation. Neither mapping changes Render or source rights.

## Acceptance and blockers before live import

- [x] Source/Render full logical backups, archive listing/hash verification, encrypted storage and consistent exported snapshots.
- [x] Both restored on isolated PG16 through a non-superuser LOGIN; counts/fingerprints/app schema verified.
- [x] Focused unit/native checks, FK cycle proof with active guards, tenant-scope denial, fresh restricted AUTH/API credential-read denial, wallet totals and audit counts.
- [ ] Owner attestation for synthetic DOB/contact/free-text and a digest-bound INCLUDE/EXCLUDE/HOLD policy. No PII may be silently classified synthetic.
- [ ] Approved solution for preserving immutable submission timestamps and other guarded/audit history; do not weaken guard or change original history.
- [ ] Reviewed dependency closure/row-level execution plan, least-privilege adoption capability, durable import receipt and lost-COMMIT-ACK reconciliation. Current graph helper only detects unsupported cycles; it is not an importer.
- [ ] Reviewed synthetic Manager credential provisioning; real accounts keep normal OTP/activation. Existing operator CLI cannot provision an existing migrated user.
- [ ] Current target quota/free-space/plan/expiry, coordinated cutover/write freeze, fresh conflicts/security checks, target recovery plan and off-machine key custody.
- [ ] Full dataset import rehearsal preserving UUID/time/financial/audit history, failure/recovery tests and scoped API/browser verification.
- [x] Owner explicitly authorized live independent-demo execution in FAST-TRACK request; rehearsed exact cohort committed and verified. Full-history adoption remains a separate unresolved capability. No commit/push/deploy performed.

Recovery for this exercise: decrypt/restore only into a **new** isolated DB after verifying hash and identity. Do not delete/imported history to undo a committed transfer; do not restore over active Render. Routing/env changes require their own approval. Old sessions/OTP must not be resurrected into an eventual live staging payload.
