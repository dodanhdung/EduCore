# R8 Academic Management — minimal closure review

Date: 2026-10-25. Branch: `feat/r8-academic-management-mvp`. Native verification used only admitted disposable PostgreSQL clusters. This report records the pre-PR release gate; no deployment or shared database use.

## Decision

**R8_ACADEMIC_MVP_PARTIAL.** AC01–AC08 have TENANT-only navigation, real Academic reads and CRUD, and AC04/AC08 teacher assignment. AC09 enrollment and transfer request work, but **TRANSFER_CONFIRM remains disabled**. R3 transfer confirmation can preserve enrollment history and check capacity and existing claims, yet it does not classify the future tuition difference, attach an approved financial decision, or create a durable finance handoff. Its financial effect cannot be proven safe within this narrow closure. No public confirmation route was exposed. The bounded slice is ready for owner review toward a **limited MVP PR** after new-file review. It is not ready to claim full AC01–AC09 closure or to merge under that claim.

**Final release verification:** The owner has accepted deferring TRANSFER_CONFIRM for the limited MVP. The current admitted native run passed 20 focused cases, including a real login → tenant selection → Academic navigation → profile/catalog/class creation → teacher assignment → enrollment → class roster HTTP journey. Duplicate enrollment and a full class were denied in that journey. Evidence: `C:\Users\Admin\AppData\Local\Temp\educore-r4-evidence-6uOBZv\evidence.json`. API and web build/lint passed; R7 navigation 40 passed; Academic UI/timezone 6 passed; API navigation/reader unit 7 passed. `BROWSER_E2E_NOT_RUN` because browser automation is unavailable. The web lint exits 0 with one warning in untouched AT03.

## Scope and sources

Followed `AGENTS.md`, `PROJECT_CONTEXT.md`, the relevant R8 requirements/design and AC01–AC09 cards, the owner-approved minimal closure instruction, and current R3/R4 code. Existing migrations were left untouched. Forward migrations `202610250005_r8_academic_navigation` and `202610250006_r8_academic_tenant_time` add TENANT-only navigation and the selected tenant timezone capability. No production fixture or broad grant was added. All R3 commands remain fixed behind an R4 authenticated transaction.

## Actual verification

| Check | Result |
| --- | --- |
| Initial closure native attempt, disposable PostgreSQL 16 | 3 PASS, 1 FAIL, 110 SKIP; J01 asserted a `status` field omitted by the catalog create response. Test corrected to inspect persisted SQL state. Evidence: `C:\Users\Admin\AppData\Local\Temp\educore-r4-evidence-y1MQWW\evidence.json`. |
| Closure native rerun, **new** admitted disposable PostgreSQL 16 | **4 PASS, 0 FAIL, 110 SKIP**: T01 assignment/idempotency/audit; T02 conflict/cross-tenant/permission/scope/validation denial; N01 live navigation/TENANT vs CLASS/STUDENT/revocation/AC07 without academic.read; J01 real login and tenant selection through navigation, profile/catalog/class creation and PLANNED enrollment. Evidence: `C:\Users\Admin\AppData\Local\Temp\educore-r4-evidence-yZVkF7\evidence.json`. |
| Broader focused native attempt | 19 PASS, 1 FAIL, 94 SKIP; A21 expected an obsolete five-entry OP menu. Existing R8 mapping emits OP02/OP03 for those grants. Test expectation corrected. Evidence: `C:\Users\Admin\AppData\Local\Temp\educore-r4-evidence-8DWidj\evidence.json`. |
| **Final focused native run**, fresh admitted disposable PostgreSQL 16 | **20 PASS, 0 FAIL, 94 SKIP**: real SQL Academic readers A01–A04, commands C01/C02, profiles A01/A02, catalog B01/B02, capabilities D01, closure T01/T02/N01/J01, and R8/A21 navigation regressions. Evidence: `C:\Users\Admin\AppData\Local\Temp\educore-r4-evidence-toJAv1\evidence.json`. |
| Earlier Academic native readers and writers | Reader 4 PASS / 99 SKIP; writer/capability 7 PASS / 103 SKIP. Both areas were rerun in the final focused native set above. See historical report. |
| API build, lint; web build, lint | PASS, PASS; PASS, exit 0 with one warning in untouched AT03. |
| API navigation + reader unit tests | 7 PASS. |
| Web R7 navigation tests | 40 PASS. |
| Academic production UI tests | 4 PASS, including AC07 when `/courses` returns 403. |
| Tenant time tests | 2 PASS for tenant zone conversion and invalid/DST local times. |
| Browser end-to-end journey | NOT RUN. J01 is a real HTTP/NestJS/PostgreSQL journey, not a browser automation test. |

The final native migration run exercised migrations `202610250001` through `006` and real reader SQL projections on the fresh cluster. AC07 no longer depends on `academic.read` for its list. Local date-time inputs now use the selected tenant's IANA zone; invalid and ambiguous times fail closed. The Academic route allowlist uses own-key checks.

## Risks and owner review

AC09 remains REQUESTED at transfer request and has no confirmation UI/API. The owner explicitly authorized the limited MVP commit and PR after the release gates in the later final-verification task. The review ZIP excludes ignored build output, secrets, prior archives, the pre-existing `.gitignore` deletion, and unrelated `roadmap.md`.
