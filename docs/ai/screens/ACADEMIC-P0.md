# Academic Batch A — screen review proposal

Status: `PROPOSED` · 21/10/2026 · Owner review pending. Updated to cover AC01–AC09.

## Scope and sources

AC01–AC09, Figma Page `50:2` / `C. Academic Management`; desktop frames `52:2`, `52:565`, `52:1100`, `52:1663`, `52:2218`, `52:2800`, `52:3386`, `52:3949`, `52:4520`. AC09 state frames: `84:708`, `84:969`, `84:1230`, `84:1491`, `84:1752`. Sources: `SCREEN_MAP.md` AC01–AC09, matching `SCREEN_SPECIFICATIONS.md` cards, `SCREEN_FLOWS.md` F02, UI guidelines and design tokens. UC-07–10, UC-06, UC-14, FR-07–08, Q-03 and BR-13 are trace references. Desktop design inspected; separate mobile frames were not found at Page root.

## Screen contracts

| ID | Goal and actor/scope | UI content and navigation | Local states | Server action |
| --- | --- | --- | --- | --- |
| AC01 | Authorized academic staff browse tenant-scoped students | Summary, search, class/level filters, table, pagination; detail link to AC02 | sample, no results, pending API | Create/profile data and permission checks `PENDING_API` |
| AC02 | Authorized staff inspect a scoped student | Profile header, tabs, guardian/enrollment/history, edit dialog | sample, tab, validation, pending API | Save, enrollment and transfer `PENDING_API`; AC09 remains embedded |
| AC03 | Authorized academic staff browse tenant-scoped teachers | Summary, search, subject/level filters, table, pagination; detail link to AC04 | sample, no results, pending API | Create/profile data and permission checks `PENDING_API` |
| AC04 | Authorized staff inspect teacher competence and assignments | Profile, tabs, competence, assignment summary/history, edit dialog | sample, tab, validation, pending API | Save/assignment eligibility `PENDING_API` |
| AC05 | Authorized staff inspect subjects and levels | Subject/level tabs, search, status filter, edit form | sample, no results, validation, pending API | Save/hide `PENDING_API` |
| AC06 | Authorized staff inspect courses | Search, filters, course list and edit form | sample, no results, validation, pending API | Save/create `PENDING_API` |
| AC07 | Authorized staff inspect classes | Search, filters, capacity/status table, create dialog | sample, no results, validation, pending API | Create/class data `PENDING_API` |
| AC08 | Authorized staff inspect a class | Tabs, capacity, teacher assignment, enrollment list and history | sample, tabs, pending API | Class/enrollment data `PENDING_API` |
| AC09 | Authorized staff prepare enrollment/transfer | Embedded side sheet from AC08, steps, fields, conflict variants, financial consequence copy | validation, capacity/schedule/permission/future/rollback presentation | Confirm and all authoritative checks `PENDING_API`; no independent business route |

Production entry remains behind existing tenant and permission checks. No authoritative grants contract or Academic read API is connected, so production screens present a pending data state. Fixtures live only under development UI Preview. No local interaction claims a committed business result. Responsive design uses a single screen per ID; tables scroll within their card at narrow widths. AC09 uses AC08 as host. Chrome DevTools checked all nine Preview IDs at 320, 390, 768 and 1440px without horizontal overflow or render errors. Screenshots of AC01 and AC09 were inspected, but pixel-level comparison and business flow validation remain pending.
