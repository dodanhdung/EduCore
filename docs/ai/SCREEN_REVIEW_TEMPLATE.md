# EduCore — Single Screen Review and Handoff Template

> Copy to `docs/vibecoding/screens/<SCREEN_ID>.md` only for a planned, approved-review task. Status starts `PROPOSED`, never `APPROVED` automatically. Screen IDs from `SCREEN_MAP.md` are canonical. Route/UI fields are **proposals** until reviewer confirms.

## Metadata

| Field | Value |
|---|---|
| Screen ID and title | `[AU06] — [Kích hoạt tài khoản]` |
| Review status | `PROPOSED / CHANGES_REQUESTED / REVIEWED / APPROVED_FOR_IMPLEMENTATION` |
| Scope | `P0 / P1 concept only` |
| UI route/presentation | `[page/dialog/sheet/state under /app/:tenantId or global]` |
| Actor/permission | `[exact permission code and object scope; role is descriptive]` |
| Business trace | `[FR/BR/Q + UC scenario and acceptance criterion]` |
| Source branch/doc revision | `[git commit SHA, spec revision, API contract when checked]` |
| Design reference | `[verified Figma frame URL or NOT_CONNECTED / local snapshot]` |

## 1. Goal, fields and evidence

**User goal:** `[What is achieved; not just what page looks like]`.

| Field / element | Read/source or write target | Validation | Visibility/scope | States |
|---|---|---|---|---|
| `[field]` | `[response field OR fixture]` | `[required, format, range]` | `[role + object]` | `[idle/loading/error]` |

**Demo fixture:** `[link MOCK_FIXTURES only; label Dữ liệu mẫu]`.

## 2. Actions → API mapping

| User action | Permission + scope | API or `UNAVAILABLE` | Loading/error/success | Confirmation/audit |
|---|---|---|---|---|
| `[CTA]` | `[key] + [resource scope]` | `[verb/path if actually approved]` | `[states]` | `[reason/idempotency/revision]` |

No unapproved API route is implied by a Figma CTA.

## 3. State design and responsive frames

- [ ] Desktop 1440 (if staff) and mobile 390 (if role task) or explicitly justified.
- [ ] Default, loading, empty, filtered-empty, validation error, 401, 403/404, business conflict 409/422, retry/5xx, success.
- [ ] Keyboard labels/tab order/focus, contrast, 44px mobile targets; long Vietnamese text; financial/time locale.
- [ ] Tenant switch and Parent child switch revoke stale cache; do not leak out-of-scope info.
- [ ] P0 excludes P1; no action looks real in demo without backend response.

## 4. UX flow and layout

- Source Fxx flow: `[F01-F07 / none]`.
- Navigation in/out: `[routes]`.
- Reusable components: `[G01 shell, AC01 table, SC03 form, ...]`.
- Interaction details: `[focus, sticky CTA, warnings, unsaved changes, confirm drawer]`.
- Accepted style version: `[DESIGN_TOKENS.md review ID]`.

## 5. Out of scope and open decisions

- `[P1 exclusions, technical decisions B, proposed labels or backend gaps]`.
- `NEEDS_SLICE_REVIEW` when API/permission/transaction rule not yet approved.

## 6. Review signoff (no automatic Git)

| Reviewer | Decision | Date | Approved paths / notes |
|---|---|---|---|
| `[owner]` | `[ ]` | `[ ]` | `[ ]` |

**Important:** Approving a screen/spec does **not** itself authorize commit, push, PR, deploy, or Figma write. Obtain explicit approval for those actions separately.
