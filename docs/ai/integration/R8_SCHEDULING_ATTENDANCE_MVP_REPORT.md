# R8 Scheduling & Attendance Limited MVP — owner review

**Verdict: `R8_SCHEDULING_ATTENDANCE_MVP_PARTIAL`.** The core schedule-to-attendance journey works against a fresh disposable PostgreSQL 16 database. The remaining gaps below require owner review before Git integration. No shared database was migrated.

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
| AT02 Attendance | WORKING | Roster, draft marks, complete-sheet finalization and embedded correction. `EXCUSED` requires approved leave; finalized sheets reject ordinary marks. |
| AT03 Leave request | WORKING | Self/verified-child participant choices and request submission. Late notice is shown; R3 validates deadline and duplicate requests. |
| AT04 Leave decisions | WORKING | Scoped list and permission-gated approve/reject, including separate late-approval permission. |
| AT05 Correction | LIMITED | Embedded in AT02; R3 reason, revision, lock and audit guards apply. Issued-invoice impact stays fail-closed pending a reviewed financial adjustment path. |

## Implementation

- Added R4 session-bound routes under `/api/v1/tenants/:tenantId/scheduling`: `GET calendar`, `personal`, `sessions/:id`, `rooms`, `unavailability`, `resources`, `choices`, `capabilities`, `drafts/:id/preview`; `POST sessions`, `series`, `sessions/:id/confirm`, `series/:id/confirm`, `sessions/:id/reschedule`, `sessions/:id/cancel`, `rooms`, `unavailability`, `unavailability/:id/confirm`, `unavailability/:id/cancel`; `PATCH rooms/:id`.
- Added R4 session-bound routes under `/api/v1/tenants/:tenantId/attendance`: `GET due`, `sessions/:id`, `leaves`, `my-participants`; `POST sessions/:id/marks`, `sessions/:id/finalize`, `records/:id/correct`, `leaves`, `leaves/:id/approve`, `leaves/:id/reject`.
- Migration `202610250007_r8_schedule_attendance_reads` adds restricted R4 JSON readers, a read-only schedule draft preview and self/linked-child leave guard. It forwards R3 attendance checks so finalized sheets cannot be marked, correction requires a reason, and leave approval checks invoice claims after resolving the participant. The existing R3 command functions remain the mutation authority.
- Migration `202610250008_r8_schedule_attendance_navigation` adds only SC01/02/03/05/06 and AT01/02/03/04 routes to existing navigation. SC04 and AT05 are embedded. Existing Academic/Management grants remain available.
- The production React routes now use these APIs. The preview components remain in the repository but are not mounted for these production routes.

## Verification actually run

| Check | Result |
|---|---|
| Restore missing tracked files from HEAD; `git status --short`; `git ls-files --deleted` | PASS; 326 unintended deletions gone, zero tracked deletions. Existing changes/untracked files preserved. |
| Fresh PostgreSQL 16, `prisma migrate deploy` | PASS; 36 migrations, including both new R8 migrations. Disposable local database only. |
| Live R4 HTTP Scheduling → Attendance journey | PASS; login, select tenant, add room, draft/preview/confirm, calendar, roster, mark, finalize, read result; conflict, adjacent boundary, booking release and tenant denial assertions. |
| R3 Scheduling and Attendance focused native tests | PASS; 14 passed, 42 outside filter skipped, against disposable PostgreSQL. |
| API HTTP boundary tests | PASS; 4 tests. |
| API build and lint | PASS. |
| Web build; full web tests | PASS; 245/245 web tests, including production screen tests and navigation regression. |
| Targeted R7 Academic/navigation tests | PASS; 48 tests. |
| Web lint | Exit 0 with two `react-hooks/set-state-in-effect` warnings: one pre-existing AT03 preview warning and one in the new production component. |
| `git diff --check` | PASS. |
| Browser E2E | `BROWSER_E2E_NOT_RUN`; no browser automation was used. |

An initial live test command was rejected by its disposable-target guard because the test requires `R8_TEST_*` environment variables. It passed after supplying the correct guard and local test URL; no shared target was touched.

## Security, integrity and limits

The R4 readers check tenant, effective permission and resource scope in PostgreSQL; the controllers use the selected R4 session and tenant-bound transaction. Personal schedules include only the assigned teacher or an authorized student/verified child. Leave submission resolves its participant server-side. Mutation commands retain R3 transaction, locking, revision, idempotency, audit and policy behavior. Preview does not reserve a slot; confirm rechecks conflicts. Issued invoice history is not rewritten. External business notifications and P1 workflows are absent.

**MUST_FIX_BEFORE_COMMIT:** No failing build, admission test, or observed tenant/data-integrity defect remains in the exercised path. The authorization matrix is narrower than the requested test strategy: Parent/Student linked-child denials, concurrent series confirmation, all leave decision variants, and issued-invoice correction require more native coverage before production deployment. If owner policy requires those tests as a commit gate, keep this packet partial until they are added.

**BACKLOG_R9_OR_LATER:** SC04 occurrence-level preview polish, SC05 recipient timeline and bulk future-series changes, SC06 child selector, broader browser workflows, the new web lint warning, and safe financial coordination for issued-invoice correction. The latter remains disabled/fail-closed until separately approved.

## Git and owner review

Current branch: `feat/r8-scheduling-attendance-mvp`; base HEAD: `b4319415baf45989a30e662af7a4362672259934`. No commit, stage, push, pull, merge, PR, or deploy was performed. `git diff --check` passed. `git status --short` after restoration and implementation lists five modified paths and nine new paths (the nine include this report); no deleted tracked paths.

Modified paths:

- `apps/api/src/identity-access/r4.module.ts`
- `apps/web/package.json`
- `apps/web/src/App.tsx`
- `apps/web/src/foundation.test.mjs`
- `apps/web/src/navigation.ts`

New paths for owner review:

- `apps/api/prisma/migrations/202610250007_r8_schedule_attendance_reads/migration.sql`
- `apps/api/prisma/migrations/202610250008_r8_schedule_attendance_navigation/migration.sql`
- `apps/api/src/attendance/attendance.controller.ts`
- `apps/api/src/scheduling/scheduling.controller.ts`
- `apps/api/test/r4/r8-scheduling-attendance.postgres.test.ts`
- `apps/api/test/r4/scheduling-attendance-http.spec.ts`
- `apps/web/src/screens/Scheduling & Resources/SchedulingAttendanceProduction.tsx`
- `apps/web/src/screens/Scheduling & Resources/scheduling-attendance-production.test.mjs`
- `docs/ai/integration/R8_SCHEDULING_ATTENDANCE_MVP_REPORT.md`

The single review archive is `artifacts/R8_SCHEDULING_ATTENDANCE_MVP_REVIEW.zip`; it contains only the 14 paths above, preserving repository-relative paths. It is for owner review and was not committed.
