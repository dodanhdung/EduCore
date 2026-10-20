# EduCore — Stitch → Vibecoding v1.0: reuse and reconciliation report

**Status:** APPROVED AS KIT v1.0 · 17/10/2026 · **No Git changes**.

**Historical billing note:** Section 3 records the 17/10 Group A review. For new pure-Wallet sources, Requirements v5.1 and Decision Register §G (19/10) take precedence; legacy/mixed cases retain their original history and need separate policy. This note preserves the 17/10 findings as provenance.

## 1. Compare sources

| Dimension | Previous v0.9 kit | Uploaded Stitch package | Merged v1.0 review |
|---|---|---|---|
| Coverage | 44 proposed P0 screen IDs, sometimes coarse | 70 design units: 58 P0 +12 P1 | 71 design units: 59 P0 +12 P1 incl. AU06 |
| Level of detail | Summary route/actor/permission/states | 70 detailed UI/actions/states cards | Canonical per-card detailed descriptions + permissions/API corrections |
| Visual system | Semantic token meanings, generic values | Colors, typography, sizing, icons, reference patterns | `DESIGN_TOKENS.md` with exact candidate palette, `UI_GUIDELINES.md` for behaviors |
| Scenario coverage | Across feature templates and skills | 7 explicit F01–F07 user journeys | `SCREEN_FLOWS.md` retains 7 journeys, adds activation and payment excess |
| Screen IDs | AUTH-01, FIN-01 etc. | AU01, BL07 etc. | Stitch IDs canonical; old IDs listed as aliases, no duplicate pages |
| Routes | `/app/:tenantId` scoped | Mostly root `/academic/...` | Tenant-scoped proposed UI routes; global unauthenticated routes; no API path conflation |
| Automation | Codex skills and review gates | Google Stitch paste/generate/handoff | Figma **optional**, Codex prompts one approved screen at a time; Git requires review |
| Ownership | P0 + Group A recognized | Based on pre-Group-A October 13 docs | Group A respected; tokens/routes approved as kit baseline, individual screens still proposed for implementation |

## 2. Retained from Stitch

- Detailed screen cards for staff operations, parent/student/teacher portals, and P1 concepts with FR/UC/BR/Q mapping.
- Eight component patterns: AUTH, DASH, LIST, DETAIL, FORM, CAL, REVIEW, TASK.
- Reference set G01 dashboard, AC01 table, SC03 complex schedule form, AT02/AS07 mobile task; do NOT mass-generate all screens.
- Light slate/white + blue/teal **approved kit** palette: #2563EB, #1D4ED8, #0D9488, #F8FAFC, #FFFFFF, #0F172A; Be Vietnam Pro / Inter; 256px sidebar, 64px header, responsive at 1440 / 390.
- Seven flows F01–F07 and Vietnamese mock fixtures (samples, not authoritative data).
- Status/errors, timezone, VND formatting, table density, mobile affordances and accessibility expectations.

## 3. Corrected or added

1. **ID collision:** `AUTH-01`/`FIN-01` vs `AU01`/`BL01`. Stitch ID becomes canonical; `SCREEN_MAP.md` includes full v0.9 alias table.
2. **Route collision:** Stitch's `/academic/students` etc. vs v0.9's `/app/:tenantId/students`. All v1.0 business paths use approved UI convention `/app/:tenantId/*` (per-screen route validation still required). These are UI navigation routes, **NOT approved API endpoints**; nested panels don't require a page.
3. **Activation:** New P0 `AU06` and F01 activation branch. Approved technical onboarding: CLI tenant+first Manager, OTP ACTIVATION request/complete, no email invitation or temporary password.
4. **OTP reset:** AU04 one atomic OTP verification + password reset API, not a standalone OTP verify step.
5. **Billing:** BL05 one invoice per tenant/student/month across classes; BL07/BL09/BL10 show after-adjustment excess `PENDING_RESOLUTION` separate from nonnegative receivables and no P0 auto-refund/credit. BL08 initial payment > outstanding still rejected.
6. **Permissions:** OP01 incorrect broad `user.manage` label replaced with catalog member.* actions (UI still awaits exact endpoint permission); per-record scope always Backend-enforced.
7. **Assignments resubmit:** Q-11's “before grading/publication” may be interpreted in more than one way. Preserve as business text and flag draft-grade cutoff for explicit per-slice review, not silent policy change.
8. **P0/P1 safety:** EX01–EX12 segregated as concept-only, not mounted in P0/sidebar. P0 Manager G01 stays exactly three business KPIs.
9. **Source priority:** Original Stitch files cite older repository state as of 13/10; v1.0 reflects approved Group A **design decisions** while requiring actual branch verification before coding.
10. **Model guidance:** Keep selection by task complexity, verify models in available Codex menu; API token rates are not Codex subscription usage/credits. Figma is optional, no assumed writable file.

## 4. Not merged as requirements

- `STITCH_START_HERE.md` and Stitch batch prompts: **tool-specific**, not needed now; replaced with `UI_PROMPTS.md` one-screen workflow.
- Stitch mock numbers, tenant names, UI navigation labels, palette and 1440/390 geometry are **demonstration/proposal**, not requirement baselines.
- 71 design units are a planning map. Reuse sheets/drawers and shared components; do not require 71 routes or frames.
- New payment-excess and activation presentations are **UI implications of previously approved design**; detailed financial resolution screens/actions not yet approved. `NEEDS_SLICE_REVIEW` applies before code.

## 5. Approved kit defaults and implementation-specific review gates

| Area | Proposed default | Owner decision needed |
|---|---|---|
| Design tokens / visual identity | Stitch palette and typography | APPROVED KIT; no formal logo |
| Canonical ID policy | Stitch IDs, v0.9 aliases | APPROVED KIT |
| Frontend routes | `/app/:tenantId/*` and global auth | APPROVED CONVENTION; exact page route per-slice |
| Screen splitting | Page vs embedded panel/dialog per `SCREEN_MAP` | APPROVED DEFAULT; review exceptions per slice |
| Mobile nav | Teacher/Student/Parent bottom nav <=5 items when useful | APPROVED UI DEFAULT; adapt per screen |
| AU06 activation UI | Group A OTP + password form | APPROVED COVERAGE; final layout/copy per screen |
| Excess resolution UI | Internal pending item in BL07/BL09/BL10 | REVIEW with Billing slice (workflow pending) |
| AS07 resubmit cutoff | Match reviewed grading state machine | NEEDS_SLICE_REVIEW |
| First design reference | G01 desktop, AC01 list, SC03 form, AT02 mobile | APPROVED KIT REFERENCE SET |

**Approved documentation artifact only:** No repo files, branch, Figma document or live code were changed when approving this v1.0 package.
