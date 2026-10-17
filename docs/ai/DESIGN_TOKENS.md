# EduCore — DESIGN_TOKENS (approved tool-agnostic UI baseline)

> **Version:** 1.0 — approved visual/interaction baseline by owner on 17/10/2026; not an official trademark/logo approval. Derived from uploaded `DESIGN.md`; no Google Stitch dependency. Pair with `UI_GUIDELINES.md`, `SCREEN_MAP.md` and selected `SCREEN_SPECIFICATIONS.md` card. Language vi-VN. Only P0 unless P1 concept explicitly requested for review. Do not assume these tokens already exist in apps/web.

## Product & brand

EduCore is an internal-first, multi-tenant training-center management SaaS. People using it include center managers, academic coordinators, accountants, teachers, students and parents. Experience should be calm, precise, friendly, modern and trustworthy. Prioritize readability, operational speed and explicit state. Use the wordmark `EduCore`; no logo has been formally approved. No glossy marketing pages, mascots, unrelated charts, neumorphism, glassmorphism or neon gradients.

## Color tokens

| Semantic token | Hex | Use |
|---|---|---|
| `primary` | `#2563EB` | Primary buttons, active nav, links |
| `primary-hover` | `#1D4ED8` | Hover/focus emphasis |
| `accent` | `#0D9488` | Secondary informative highlights only |
| `background` | `#F8FAFC` | App background |
| `surface` | `#FFFFFF` | Cards, forms, dialogs |
| `surface-muted` | `#F1F5F9` | Table headers, section backgrounds |
| `border` | `#E2E8F0` | Dividers and input outlines |
| `text` | `#0F172A` | Headlines, primary text |
| `text-secondary` | `#475569` | Table and explanatory copy |
| `text-muted` | `#64748B` | Helpers, metadata |
| `success` | `#15803D` | Approved/finished states (where semantically true) |
| `warning` | `#B45309` | Pending, near due, risky actions |
| `danger` | `#B91C1C` | Rejected/failed/destructive actions |
| `focus` | `#2563EB` | Keyboard focus ring |

Status must always be shown by a readable label and icon as well as color. Maintain accessible color contrast; adjust foreground pairing if necessary.

## Typography

Prefer `Be Vietnam Pro`; fallback `Inter, system-ui, sans-serif` with full Vietnamese glyph coverage. Admin base 14px / line height 1.5; portal mobile base 15–16px. Page title 26–28px semibold; section 18–20px semibold; table header 12–13px medium; labels 12–13px medium. Prices and numeric metrics use tabular lining figures. Never invent English translations for user-facing copy.

## Layout & spacing

- App desktop reference: **1440×900**, responsive at 1280 and 1024. Tablet ~834 and mobile **390×844**.
- Sidebar: `256px` open, collapsible; topbar: `64px` with current tenant, notifications and account menu.
- Content padding 24–32px desktop, 16px mobile; desktop 12-column responsive grid and max content width around 1480px.
- Spacing scale: `4 / 8 / 12 / 16 / 24 / 32` px; follow 8pt rhythm.
- Radius: `8px` form/buttons, `12px` cards, `16px` dialogs; borders subtle, shadows very light.
- Buttons minimum desktop 36–40px high, mobile tap targets at least 44px. Page actions align right on desktop; sticky save/confirm bottom on task-heavy mobile flows.
- Lists and tables compact but not cramped, strong column headers, readable row separation, searchable, filterable and paginated where relevant.

## Components

- Shared: `AppShell`, `RoleNav`, `TenantSwitcher`, `Breadcrumb`, `PageHeader`, `NotificationBell`, `UserMenu`, `DataTable`, `FilterBar`, `StatusBadge`, `Skeleton`, `EmptyState`, `ErrorState`, `PermissionState`, `Toast`, `ConfirmDialog`, `SideSheet`, `AuditTimeline`.
- Academic: `StudentListRow`, `ClassCard`, `EnrollmentStatus`, `TeacherAssignmentList`.
- Scheduling: weekly calendar / agenda, session chip, resource filter, conflict comparison panel.
- Attendance: student list with clear `ATTENDED`, `EXCUSED`, `UNEXCUSED` choices and finalization state.
- Billing: VND value summary, line items, snapshot rationale, issued-vs-draft callouts, cash/bank transfer **manual** record form.
- Assignments: 1–5 priority stars, upload with file type/size/count checks, submission version list, draft vs published grade.
- Operations: approval evidence review, explicit `APPROVED` vs `COMPLETED`, job attempts, audit timeline.

## Iconography & motion

Use Lucide-style 20px outline icons; menu icon + label, icons are never the only indication. Avoid decorative photos in data screens. Transitions limited ~120–200ms for drawers/hover/feedback, respect reduced-motion. No distracting animation.

## Responsive patterns

Desktop Admin: fixed/collapsible sidebar, topbar, page header, compact tables and detail side panels. Mobile Teacher/Student/Parent: narrow topbar, 4–5 role-based bottom-nav items if needed, cards replacing wide tables, full-screen forms, thumb-friendly primary CTA. Parent must have a visible and permission-checked child selector; manager/teacher are never shown unrelated student data.

## Content & compliance rules

- All labels and sample records in natural Vietnamese. Show dates `dd/mm/yyyy`, times `HH:mm`, monetary amounts `1.250.000 ₫`, timezone `Asia/Ho_Chi_Minh`.
- Mark seed values and dummy records as `Dữ liệu mẫu` where appropriate; do not imply live services are connected.
- P0 manager Dashboard has **exactly three** KPIs: distinct ACTIVE-enrolled students, ACTIVE classes, ISSUED-invoice outstanding receivables. No revenue chart, attendance analytics or forecast.
- P0 notifications are **in-app** only for confirmed changed/cancelled schedules and published/assigned new assignments; no automatic deadline reminders, SMS, email business alerts or external pushes.
- P0 financial UI: invoice means **internal statement**, manually issued, payments entered after cash/bank reconciliation, no online gateway. P0 sibling discount 10% only (verified). Never include prepaid combo 5% as a P0 control.
- Other P1-only features: makeup classes, suspension, teacher substitution, advanced reports, policy/permission editor, configurable workflows, platform tenant lifecycle. Do not show P1 nav or actions on P0 screens.
- Authorization is enforced by Backend; UI may conditionally show actions but may not suggest bypassing tenant or class/student scopes.

## Screen references & consistency

Canonical desktop shell is `G01 — Manager Dashboard`. Canonical list is `AC01 — Student List`. Canonical complex form is `SC03 — Create Schedule`. Canonical mobile task is `AT02 — Attendance` or `AS07 — Submit Assignment`. When designing new screens, preserve their navigation anatomy and exact token language; change only the screen-specific content and allowed actions. Source screen catalog in `SCREEN_MAP.md`; per-screen contract in `SCREEN_SPECIFICATIONS.md`; Figma/Codex prompt contract in `UI_PROMPTS.md`.

## Implementation mapping — semantic variables (validate with actual code dependencies)

Define a **single token layer** and map shadcn/Tailwind (only if installed or explicitly approved). Example token aliases:

| Canonical proposal | CSS variable example | Notes |
|---|---|---|
| `primary` | `--ec-primary: #2563EB` | One primary across admin/portals |
| `background` | `--ec-bg: #F8FAFC` | Do not hardcode per component |
| `surface` | `--ec-surface: #FFFFFF` | All cards/dialogs |
| `border` | `--ec-border: #E2E8F0` | Input, separator |
| `text` | `--ec-foreground: #0F172A` | Text contrast must be checked |
| `danger` | `--ec-danger: #B91C1C` | Paired with accessible text |

These are **approved UI palette defaults**, not a new architectural dependency, an existing CSS file or already-created Figma variables. Do not use status success/danger colors to hide state distinction (e.g., APPROVED vs COMPLETED).
