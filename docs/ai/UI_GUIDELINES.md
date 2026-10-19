# EduCore — UI Guidelines (approved baseline for Figma / React)

**Version:** 1.0 · **Status:** APPROVED UI defaults; never supersede FR/UC/Q/BR or replace screen-level approval. 

## 1. Guiding priorities

1. **Clarity over decoration:** Scheduling conflicts, unpaid invoices, attendance locks, permission limitations, and workflow stages need distinct visual/semantic treatment.
2. **Evidence before irreversible actions:** Preview before weekly schedule confirm; show month/source/discount before invoice issue; show reason and policy for adjustments; show recipient count/deadline before assignment publish.
3. **Accessible by default:** Keyboard/label/contrast/focus, not color-only status.
4. **Never imply backend success from local UI state.** Await real API result and reconcile server state; preview is advisory, not a reservation.
5. **Responsive:** Staff-heavy tables on desktop; Teacher/Student/Parent touch workflows on mobile; no information hidden solely on mobile if essential.

## 2. Approved navigation baseline (screen details still reviewed)

Authenticated shell: tenant context → navigation according to **effective permissions** → page heading with primary action → scoped filters → result view → detail/drawer/modal as appropriate → feedback. A user with several roles has **one selected tenant**, not separate identities. User-facing actions must still be rejected server-side if current permission/relationship has changed.

Navigation work areas: Tổng quan, Học viên & giáo viên, Lớp & ghi danh, Lịch & phòng, Điểm danh & xin nghỉ, Học phí & thu tiền, Bài tập & chấm điểm, Thông báo, Phê duyệt, Nhật ký/tác vụ, Tài khoản. Exact labels/routes in `SCREEN_MAP.md` require design review.

## 3. Design tokens (visual proposal; exact values in DESIGN_TOKENS.md)

Tokens must be implemented once, with Tailwind/shadcn-ui semantic variables when those libraries are installed. Do not hardcode arbitrary hex colors per component. The **token meanings and candidate visual values** are described in `DESIGN_TOKENS.md` (derived from former Stitch DESIGN.md); they still require owner visual approval, not a locked brand palette. This file remains the authoritative UX behavior guide.

| Token | Meaning |
|---|---|
| `background`, `foreground`, `card`, `card-foreground` | surfaces and readable text |
| `primary`, `primary-foreground` | main actions (e.g. Confirm) |
| `secondary`, `muted`, `muted-foreground` | supporting controls/metadata |
| `destructive`, `destructive-foreground` | delete/cancel/irreversible danger |
| `border`, `input`, `ring` | visible controls, focus |
| `status-info`, `status-success`, `status-warning`, `status-danger` | domain states, always plus text/icon |

Spacing: 4/8/12/16/24/32px increments; body 14–16px; page title 24–30px; minimum target 44×44px for touch. Use a grid for tables/forms; reserve colors and icons for real status. Verify WCAG AA contrast (4.5:1 normal text, 3:1 large text/meaningful UI). Honor reduced motion and locale Vietnamese formatting.

## 4. Component vocabulary (shared, no invented business semantics)

| Component | Required behavior |
|---|---|
| `AppShell` + `TenantSwitcher` | membership-derived tenants, preserve scope, clear tenant cache on switch |
| `PageHeader` | title, breadcrumbs, context and one main action |
| `Button` | Center the visible label horizontally and vertically within every button, including icon-and-text, disabled, desktop and mobile variants. Keep the icon and label group centered as a unit. |
| `PermissionGate` | hide unavailable action for usability but rely on API 403; show safe forbidden page |
| `DataTable` | labeled search/filters, pagination, sorting if API supports, empty/loading/errors, keyboard alternatives |
| `EntityForm` | typed inputs, inline validation, submit pending/disable, server validation messages |
| `StateBadge` | domain-specific status labels, no misleading equivalence (APPROVED ≠ COMPLETED) |
| `ConfirmDialog` | display consequences, reason if required; never auto-trigger destructive action on open |
| `ResourceConflictList` | resource type, time window, conflict reason safe for scope; no leaking other tenant names |
| `MoneyVnd` | decimal string from API, BigInt-safe handling, local VND formatting and no float arithmetic |
| `DateTimeTenant` | timestamp UTC to selected tenant timezone; local time labels, calendar consistency |
| `NotificationsInbox` | read/unread dedup; in-app only P0 |
| `FileUploadField` | allowed extensions, MIME, max 10MB per file, max 5 files/submission, errors, never direct volume path |
| `AuditTrail` | permission-filtered, redact secrets, actor/result/reason/policy/time |

Do not build a complex generic component framework before one actual slice validates its need.

## 5. Mandatory UI states

Every view/action should specify and test: `idle`, `loading`, `empty`, `success`, `validation_error`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `stale_revision`, `rate_limited` (auth), `server_error`. Async job views additionally show `PENDING_APPROVAL`, `NEEDS_INFORMATION`, `FAILED`, and `COMPLETED` as separate states; `APPROVED` means approved decision, **not** completed execution.

**Error discipline:** 401 → session recovery/login; 403 → explain lack of permission without leaking resource existence; 404 → safe not found; 409 → refresh stale/conflict and preserve draft; 422 → input/business validation; 429 → retry-after guidance; 5xx → no false success. P0 must not display “sent email” for business notifications—only OTP email service is external.

## 6. Scheduling UX — UC-12/13

- Form for single session vs weekly series, local time `Asia/Ho_Chi_Minh` by default; weekly up to six months.
- Preview pane with counts and **all** candidate conflicts; show room/teacher/student/unavailability safely. `[08:00,09:00)` and `[09:00,10:00)` are consecutive and non-overlapping.
- Confirm all-or-nothing; send `Idempotency-Key`. UI must explicitly say one conflict blocks whole series. Confirm request performs fresh server conflict validation; preview is **not a lock**.
- `409 SCHEDULE_CONFLICT`: keep draft intact, highlight conflicts, offer edit/preview again—not “partial confirm”. A cancelled session releases booking; changed future sessions trigger in-app notification via backend outbox.

## 7. Other high-risk UX

**Attendance:** distinguish draft vs finalization, show deadline (48h from session end or invoice issued, whichever first), `EXCUSED` only after approved absence; Teacher attendance status `ATTENDED` if child actually attended despite leave approval. Locked corrections require authorized reason/audit.

**Billing:** Separate DRAFT vs ISSUED. One internal invoice per student/month aggregates class lines; don't label it an electronic legal tax invoice. Use server-derived debt (issued, adjusted, allocated) only; no green zero-debt card that hides **pending excess resolutions**. Show payment method CASH or BANK_TRANSFER manually recorded; do not imply bank verification.

**Assignments:** Draft, publish, submission versions and grade DRAFT/PUBLISHED. Student/Parent must not see draft grades. Late submission <=7 days visibly flagged. File type/size checks client-side **and server-side**.

**Approval:** Request submitted → pending → approved decision → execution completed; distinguish approval decision from execution result. Self-approval sensitive finance is recorded with reason when permitted, never silently skipped.

## 8. Figma → React handoff

One screen review must use canonical Stitch-style SCREEN-ID from `SCREEN_MAP.md` and `SCREEN_REVIEW_TEMPLATE.md`, with user goal, actor/scope, UC/FR/Q, navigation proposal, desktop/mobile frames, fields, states, button-to-API contract, errors, accessibility, pending decisions and approval status. See the single corresponding section of `SCREEN_SPECIFICATIONS.md` and Fxx path in `SCREEN_FLOWS.md`; do not load all 71 descriptions.

Use Figma **optionally for design** if an editable design and explicitly authorized target are available. Do not claim code/DB from a picture. Before translating into shadcn/ui, check exact repo packages and dependencies: initially Tailwind/shadcn/React Router/TanStack Query may **not yet be installed**. Avoid adding unrelated libraries when reproducing a frame.

## 9. Test checklist per page

- Roles and parent/teacher scope, including cross-tenant requests; keyboard focus and screen-reader labels.
- 320/375/768/1024/1440px layouts and long Vietnamese text; low bandwidth, double-click/retry, invalid form, slow response and timeout.
- Compare displayed business state to API. Never show private file URL, OTP, token or unredacted audit data.
- Confirmations and errors match acceptance criteria; align UI strings with actual implemented endpoint states.

## 10. Canonical patterns from the retired Stitch kit

The approved palette/layout baseline is in `DESIGN_TOKENS.md`; keep UI classes/tokens semantic rather than copying RGB per screen. Use G01 desktop as shell reference, AC01 as list, SC03+SC04 for complex form and conflict, AT02 or AS07 for mobile. Display one design unit per review; `SC04` and `BL08` are embedded interactions, not necessarily independent URL pages.
