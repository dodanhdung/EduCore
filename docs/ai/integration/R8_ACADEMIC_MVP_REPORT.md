# R8 Academic Management MVP — owner review

**Closure update:** See `R8_ACADEMIC_MINIMAL_CLOSURE_REPORT.md` for the owner-approved AC01–AC08 navigation, AC04 assignment, tenant time handling, and current verification. The earlier partial review below is historical evidence; its pending-navigation and assignment statements are superseded.

Status: **R8_ACADEMIC_MVP_PARTIAL** (2026-10-25). Branch `feat/r8-academic-management-mvp`, HEAD `d4504386901b700e5141d4eceed957c7bef21066`. Work continued the uncommitted reader slice. No Git write or deployment occurred.

## Scope and sources

Consulted `AGENTS.md`, `PROJECT_CONTEXT.md`, FR-07–FR-10, UC-07–UC-10, applicable BR/Q, architectural/database/detailed/API design, AC01–AC09 cards, R7 inventory, R8 backlog, and existing R3/R4 code. Historical migrations were not edited.

| Screen | Backend | Frontend | Tests | Status | Blocker |
| --- | --- | --- | --- | --- | --- |
| AC01 | Student list/search/page/create | Real list and create form | Reader A01–A04, profile A01/A02, component | Partial | Navigation approval |
| AC02 | Scoped detail/history/update | Real detail, edit, enrollment entry | Reader A02–A04, profile A01/A02, component | Partial | Resource-aware navigation |
| AC03 | Teacher list/create | Real list and create form | Reader A01–A04, profile A01/A02 | Partial | Navigation approval |
| AC04 | Detail/assignments/update | Real detail and edit; assignment view | Reader A04, profile A01/A02 | Partial | Assignment contract |
| AC05 | Subject/level list/create/update/active | Real catalog tabs and forms | Catalog B01/B02 | Partial | Navigation approval |
| AC06 | Course list/create/update | Real list and forms | Catalog B01/B02 | Partial | Navigation approval |
| AC07 | Class list/create/update/count | Real list and forms | Catalog B01/B02 | Partial | Navigation; lifecycle policy |
| AC08 | Scoped detail and restricted roster/assignments | Real detail and restricted sections | Reader A04, capability D01 | Partial | Resource-aware navigation |
| AC09 | Placement, ENROLL, TRANSFER_REQUEST | Embedded confirmed action form | Command C01/C02, capability D01, component smoke | Partial | TRANSFER_CONFIRM financial review |

Production AC01–AC08 use typed authenticated API data. Existing preview fixtures remain in PreviewApp. `App.tsx` mounts the production component only after `resolveRoute`; Academic production routes currently remain fail-closed because no navigation grant was added.

## Public HTTP surface

Under `/api/v1/tenants/:tenantId/academic`: GET `/students`, `/students/:id`, `/teachers`, `/teachers/:id`, `/subjects`, `/levels`, `/courses`, `/classes`, `/classes/:id`, `/classes/:classId/students/:studentId/placement-context`, and `/permissions/capabilities/current`; POST/PATCH `/profiles/students` and `/profiles/teachers`; POST/PATCH `/catalog/subjects`, `/levels`, `/courses`, and `/classes`; POST `/enrollments` and `/transfers` (request only).

Readers accept bounded `q`, `page`, `pageSize`. Writers use strict DTOs, current tenant, SQL permission checks, audit and transactions. Commands require `confirmed:true`, reason and `Idempotency-Key`. The controller fixes the R3 operation inside an R4 session-bound transaction. It accepts no request-supplied actor or database role and does not expose unrestricted R3 commands. UI capabilities are advisory; every write reauthorizes in SQL.

## Migrations and privileges

`202610250001_r8_academic_reads` adds security-definer scoped projections with separately guarded nested data. `202610250002_r8_academic_profiles` adds profile create/update without implicit account, membership or role creation. `202610250003_r8_academic_catalog` adds subject/level/course/class create/update with tenant reference and deactivation checks. `202610250004_r8_academic_capabilities` adds an advisory permission projection. Functions are owned by `educore_r4_owner`; execute is restricted to `educore_r4_api`. No request API role table grants were added. All four migrations were applied through the safe R4 runner to a fresh admitted, disposable local PostgreSQL 16 cluster.

## Actual verification

| Check | Result |
| --- | --- |
| Reader A01–A04, owner-provided prior task evidence | 4 PASS, 99 SKIP on disposable PostgreSQL; not rerun here |
| Initial profile A01/A02 native attempt | 1 PASS, 1 FAIL (ambiguous SQL `contact`); fixed before final pass |
| R4 native runner, filter `R8 academic (A0\|B0\|C0\|D01)` | **7 PASS, 103 SKIP, 0 FAIL** on fresh admitted PostgreSQL 16; evidence `C:\Users\Admin\AppData\Local\Temp\educore-r4-evidence-QLLzqO\evidence.json` |
| API build / lint | PASS / PASS |
| Reader unit test | 2 PASS |
| Web build / lint | PASS / exit 0, one warning in untouched AT03 screen |
| Academic preview / production component tests | 13 PASS / 3 PASS; preview run logged a transient Vite HMR port warning |
| `git diff --check` | PASS |

C01/C02 covered real placement, enrollment, idempotent replay, pending transfer preservation, invalid evidence, missing permission, CLASS scope and revoked grant. A01/A02 covered profile persistence, duplicates, invalid input, cross-tenant denial, STUDENT scope and account separation. B01/B02 covered catalog persistence, duplicates, invalid and cross-tenant references, referenced-record safety and scoped class update. D01 covered current capabilities. The direct R3 integrity suite was not rerun because its safe runner has no focus filter and this task excludes a full unrelated suite; C01/C02 exercised R3 commands through the new public binding.

## Pending owner decisions and deferred UX

1. **ACADEMIC_NAVIGATION_PENDING_OWNER_APPROVAL.** See `R8_ACADEMIC_NAVIGATION_PROPOSAL.md`. Current R7 navigation cannot express resource-scoped detail links; no tenant-wide shortcut was added.
2. Teacher assignment stays disabled: R3 checks active teacher and affected sessions, but a public competency/eligibility and scheduling contract needs review.
3. Transfer confirmation stays disabled pending a future-effective financial review and approval contract. Transfer requests remain REQUESTED and do not mutate enrollment or invoices.
4. New profiles default ACTIVE, courses ACTIVE, classes PLANNED. These defaults and later class/course status transitions are **PROPOSED** for review before navigation is enabled.
5. AC09 supports one published grade reference per submission. Multi-grade selection, richer pickers, and full production interaction coverage across AC03–AC09 are deferred. Unchanged submission retries reuse the same idempotency key.

## Manifest and review

Modified tracked files: `apps/api/src/identity-access/r4.module.ts`, `apps/api/test/r4/r4.postgres.test.ts`, `apps/web/src/App.tsx`, `apps/web/src/api.ts`.

New files requiring owner review before Git:

- `apps/api/prisma/migrations/202610250001_r8_academic_reads/migration.sql`
- `apps/api/prisma/migrations/202610250002_r8_academic_profiles/migration.sql`
- `apps/api/prisma/migrations/202610250003_r8_academic_catalog/migration.sql`
- `apps/api/prisma/migrations/202610250004_r8_academic_capabilities/migration.sql`
- `apps/api/src/academic/academic-read.controller.ts`
- `apps/api/src/academic/academic-profile.controller.ts`
- `apps/api/src/academic/academic-catalog.controller.ts`
- `apps/api/src/academic/academic-command.controller.ts`
- `apps/api/test/r8/academic-read.spec.ts`
- `apps/web/src/screens/Academic Management/AcademicApi.ts`
- `apps/web/src/screens/Academic Management/AcademicProduction.tsx`
- `apps/web/src/screens/Academic Management/AcademicAdmission.tsx`
- `apps/web/src/screens/Academic Management/academic-production.test.mjs`
- `docs/ai/integration/R8_ACADEMIC_NAVIGATION_PROPOSAL.md`
- `docs/ai/integration/R8_ACADEMIC_MVP_REPORT.md`

Unrelated pre-existing `.gitignore` deletion, generated directories, `roadmap.md`, previous archives and secrets are excluded. Review ZIP: `artifacts/educore-r8-academic-management-full-review.zip`.
