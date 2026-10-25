# R8 Scheduling & Attendance Limited MVP — owner review

**Verdict: `R8_SCHEDULING_ATTENDANCE_MVP_READY_FOR_OWNER_REVIEW`.** The limited core journey and the two final fixes pass focused verification against a disposable PostgreSQL 16 database. This is an owner-review verdict, not a production deployment claim. No shared database was migrated.

## Scope and screen status

| Screen | Status | Implemented scope / limit |
|---|---|---|
| SC01 Calendar | WORKING | Scoped real sessions, day/week/month views, class/teacher/room filters, tenant timezone display. |
| SC02 Rooms and resources | WORKING | Room list/create/edit and resource unavailability draft/confirm/cancel through R3 commands. |
| SC03 Create schedule | WORKING | Single and weekly-series draft, server preview, explicit confirm. R3 enforces six-month limit and atomic confirmation. |
| SC04 Preview | LIMITED | Embedded in SC03 and draft detail; conflict IDs and readiness are shown, but occurrence detail presentation is basic. |
| SC05 Session detail | LIMITED | Detail, draft confirm, future reschedule/cancel with revision and idempotency. No bulk future-series change or recipient timeline. |
| SC06 Personal schedule | LIMITED | Scoped Teacher, Student, verified-child Parent reads; no dedicated child selector. |
| AT01 Due attendance | WORKING | Scoped due-session list from live data. |
| AT02 Attendance | WORKING | Roster, draft marks, complete-sheet finalization and embedded correction. Unsaved marks block finalization; a fresh server sheet is checked before confirmation. `EXCUSED` requires approved leave; finalized sheets reject ordinary marks. |
| AT03 Leave request | WORKING | Self/verified-child participant choices and request submission. Late notice is shown; R3 validates deadline and duplicate requests. |
| AT04 Leave decisions | WORKING | Scoped list and permission-gated approve/reject, including separate late-approval permission. Parent reads require both resource scope and a verified child link; Parent receives no decision control. |
| AT05 Correction | LIMITED | Embedded in AT02; R3 reason, revision, lock and audit guards apply. Issued-invoice impact stays fail-closed pending a reviewed financial adjustment path. |

## Implementation

- Added R4 session-bound routes under `/api/v1/tenants/:tenantId/scheduling`: `GET calendar`, `personal`, `sessions/:id`, `rooms`, `unavailability`, `resources`, `choices`, `capabilities`, `drafts/:id/preview`; `POST sessions`, `series`, `sessions/:id/confirm`, `series/:id/confirm`, `sessions/:id/reschedule`, `sessions/:id/cancel`, `rooms`, `unavailability`, `unavailability/:id/confirm`, `unavailability/:id/cancel`; `PATCH rooms/:id`.
- Added R4 session-bound routes under `/api/v1/tenants/:tenantId/attendance`: `GET due`, `sessions/:id`, `leaves`, `my-participants`; `POST sessions/:id/marks`, `sessions/:id/finalize`, `records/:id/correct`, `leaves`, `leaves/:id/approve`, `leaves/:id/reject`.
- Migration `202610250007_r8_schedule_attendance_reads` adds restricted R4 JSON readers, a read-only schedule draft preview and self/linked-child leave guard. It forwards R3 attendance checks so finalized sheets cannot be marked, correction requires a reason, and leave approval checks invoice claims after resolving the participant. The existing R3 command functions remain the mutation authority.
- Migration `202610250008_r8_schedule_attendance_navigation` adds only SC01/02/03/05/06 and AT01/02/03/04 routes to existing navigation. SC04 and AT05 are embedded. Existing Academic/Management grants remain available.
- Migration `202610250009_r8_parent_leave_read` backfills `absence.read` only for existing seeded Parent roles. The checked-in seed function already contains this grant; the migration also patches an older seed if encountered, so future tenants receive it. R4 `has_permission` still requires the existing access scope and verified child link, even when a membership has a TENANT scope.
- The production React routes now use these APIs. The preview components remain in the repository but are not mounted for these production routes.
- AT02 disables finalization while any displayed mark differs from the persisted sheet. Successful draft save refreshes the server sheet. Finalization refreshes again and rejects changed statuses/revisions before calling the existing R3 command.

## Verification actually run

| Check | Result |
|---|---|
| Restore missing tracked files from HEAD; `git status --short`; `git ls-files --deleted` | PASS; 326 unintended deletions gone, zero tracked deletions. Existing changes/untracked files preserved. |
| Fresh PostgreSQL 16, `prisma migrate deploy` | PASS; 37 migrations, including the Parent forward migration. Disposable local database only. |
| Live R4 HTTP Scheduling → Attendance and Parent permission journey | PASS; 1 focused native test. Added checks for future-seeded Parent grant, existing-tenant backfill using the migration SQL, unverified/revoked link, removed resource scope, wrong tenant and no Parent approval control. |
| API HTTP boundary tests; API navigation regressions | PASS; 4 and 5 tests respectively. |
| API build and lint; Web build and lint | PASS; all exit 0. |
| AT02/SC01/AT04 production component tests | PASS; 3 tests, including failed save keeping confirmation blocked and successful save enabling it. |
| Targeted R7 navigation regressions | PASS; 48 tests. |
| Earlier R8 R3 Scheduling and Attendance native tests | PASS in the initial R8 implementation turn: 14 passed, 42 outside filter skipped; not rerun for this minimal fix. |
| Earlier full web suite | PASS in the initial R8 implementation turn: 245/245; not rerun for this minimal fix. |
| Web lint | Exit 0 with two `react-hooks/set-state-in-effect` warnings: one pre-existing AT03 preview warning and one in the new production component. |
| `git diff --check` | PASS. |
| Browser E2E | `BROWSER_E2E_NOT_RUN`; no browser automation was used. |

The first trial of the new migration failed its baseline guard because the checked-in seed already includes `absence.read`. The migration was corrected to accept that seed and retested successfully on a fresh disposable database. No shared target was touched.

## Security, integrity and limits

The R4 readers check tenant, effective permission and resource scope in PostgreSQL; the controllers use the selected R4 session and tenant-bound transaction. Personal schedules include only the assigned teacher or an authorized student/verified child. Leave submission resolves its participant server-side. Mutation commands retain R3 transaction, locking, revision, idempotency, audit and policy behavior. Preview does not reserve a slot; confirm rechecks conflicts. Issued invoice history is not rewritten. External business notifications and P1 workflows are absent.

**MUST_FIX_BEFORE_COMMIT:** No failing build, focused test, or observed tenant/data-integrity defect remains in the exercised path. The two owner-identified core issues are fixed and tested. Broader concurrency and finance-adjacent cases are not claimed as verified in this minimal fix.

**BACKLOG_R9_OR_LATER:** SC04 occurrence-level preview polish, SC05 recipient timeline and bulk future-series changes, SC06 child selector, broader browser workflows, the new web lint warning, and safe financial coordination for issued-invoice correction. The latter remains disabled/fail-closed until separately approved.

## Git and owner review

Current branch: `feat/r8-scheduling-attendance-mvp`; current HEAD: `9fb07eaf963b1ed492a17234600e1b5a78511c56`. No commit, stage, push, pull, merge, PR, or deploy was performed for this fix. `git diff --check` passed. The current worktree contains four modified paths and one new migration, with no tracked deletions. The ZIP includes the full final R8 file set from this branch, not only the five fix paths.

Original R8 paths included in the combined review ZIP:

- `apps/api/src/identity-access/r4.module.ts`
- `apps/web/package.json`
- `apps/web/src/App.tsx`
- `apps/web/src/foundation.test.mjs`
- `apps/web/src/navigation.ts`

Other original R8 files and the new forward migration for owner review:

- `apps/api/prisma/migrations/202610250007_r8_schedule_attendance_reads/migration.sql`
- `apps/api/prisma/migrations/202610250008_r8_schedule_attendance_navigation/migration.sql`
- `apps/api/prisma/migrations/202610250009_r8_parent_leave_read/migration.sql` (new in this fix)
- `apps/api/src/attendance/attendance.controller.ts`
- `apps/api/src/scheduling/scheduling.controller.ts`
- `apps/api/test/r4/r8-scheduling-attendance.postgres.test.ts`
- `apps/api/test/r4/scheduling-attendance-http.spec.ts`
- `apps/web/src/screens/Scheduling & Resources/SchedulingAttendanceProduction.tsx`
- `apps/web/src/screens/Scheduling & Resources/scheduling-attendance-production.test.mjs`
- `docs/ai/integration/R8_SCHEDULING_ATTENDANCE_MVP_REPORT.md`

The single final review archive is `artifacts/R8_SCHEDULING_ATTENDANCE_MVP_REVIEW.zip`; it contains only the 15 paths above, preserving repository-relative paths. It is for owner review and was not committed.
