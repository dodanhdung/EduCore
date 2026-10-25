# R8 Academic navigation proposal — owner review

**Closure update, 2026-10-25:** Owner approved TENANT-only AC01–AC08 navigation using `student.read`, `teacher.read`, `academic.read`, and `class.read` respectively. Forward migration `202610250005_r8_academic_navigation` implements this. CLASS/STUDENT grants do not produce tenant-wide navigation. Resource and nested projections retain live server-side checks. The material below records the earlier proposal and is superseded where it says navigation is pending.

Historical status: **PROPOSED**. The closure update above records the later approval and implementation.

The current R7 navigation projection and `apps/web/src/navigation.ts` allow only the existing operations screens. An authenticated Academic route is therefore denied before its production component mounts. The HTTP APIs still perform live session, selected tenant, permission, and resource checks in PostgreSQL.

| Screen | Proposed route permission | Scope and constraint | Tenant-wide grant appropriate? |
| --- | --- | --- | --- |
| AC01 Student list | `student.read` | TENANT list only | Yes, for the list only |
| AC02 Student detail | `student.read` | STUDENT detail; nested enrollment needs `enrollment.read` for the enrollment's CLASS and STUDENT | No. A scoped detail link needs resource-aware navigation. |
| AC03 Teacher list | `teacher.read` | TENANT list only | Yes, for the list only |
| AC04 Teacher detail | `teacher.read` | Current detail uses TENANT read; assignments additionally require `class.read` per CLASS | No detail shortcut until a resource-aware contract is approved. |
| AC05 Subjects and levels | `academic.read` | TENANT catalog | Yes |
| AC06 Courses | `academic.read` | TENANT list | Yes |
| AC07 Class list | `class.read` | TENANT list only | Yes, for the list only |
| AC08 Class detail | `class.read` | CLASS detail; roster additionally needs `enrollment.read` for CLASS; teacher assignments need `teacher.read` | No. A scoped detail link needs resource-aware navigation. |
| AC09 Embedded actions | `enrollment.create` or `enrollment.transfer` | Verify actual CLASS and STUDENT in the transaction; separate placement read uses the same resource context | No standalone route or grant. |

AC01/03/05/06/07 navigation could use tenant-wide permissions after review. AC02/08 need a resource-scoped deep-link decision before granting entry to users who hold only STUDENT or CLASS scope. The current R7 function has no per-resource route parameters and cannot express that decision. A tenant-wide shortcut would overgrant navigation and potentially suggest broader data access than the API permits.

Required negative checks before any grant: revoked session, wrong selected tenant, cross-tenant ID, missing permission, CLASS-only versus TENANT list, STUDENT-only versus TENANT list, detail with valid versus wrong resource, nested roster/assignment redaction, and AC09 command denial after a grant is revoked. Client route admission is advisory; the SQL checks remain authoritative.
