# EduCore Vibecoding — Decision Register / Review Queue

**Version 1.0 · 2026-10-17 · OWNER-APPROVED KIT BASELINE**  
Purpose: distinguish **already-approved business/architecture/group-A decisions** from **UI proposals** and technical details that still need review. This document only reports status; it does not constitute approval to commit anything to GitHub.

## A. Baseline / already agreed

| ID | Decision | Source / authority | Status |
|---|---|---|---|
| BASE-01 | Requirements Analysis **v5**, FR-01–45, BR-01–14, NFR-01–16 and Q-01–15 as business source | Requirements v5, owner-confirmed | APPROVED BUSINESS BASELINE |
| BASE-02 | UC-01–37, Use Case Spec v1.3 | UC document | APPROVED BUSINESS BASELINE |
| BASE-03 | Modular Monolith, React/Vite, NestJS, Prisma/PostgreSQL, pnpm, transactional outbox, internal worker, Vercel/Railway | Accepted Architectural Design | ACCEPTED ARCHITECTURE |
| BASE-04 | P0 only OTP email external business API; P1 boundaries kept | Requirements/Architecture | APPROVED BUSINESS BASELINE |
| GA-01 | Use Requirements v5 in repo; design source order | Group A explicit user approval | APPROVED DESIGN, PR/main sync must be checked |
| GA-02 | Database Design v1.1 after review; one internal invoice/student/month; excess resolution separate from receivables | Group A explicit user approval | APPROVED DESIGN; not migrated/tested |
| GA-03 | 14 bounded contexts modular monolith, vertical-slice implementation | Group A | APPROVED DESIGN |
| GA-04 | Static P0 permission catalog + default role grants + TENANT/CLASS/STUDENT scope | Group A | APPROVED DESIGN; exact seed/test still required |
| GA-05 | REST `/api/v1`, business tenant routes, direct object + paginated envelopes | Group A | APPROVED CONTRACT; not implemented |
| GA-06 | Access 15min in memory, refresh rotated/hashed cookie, CORS+Origin/CSRF in same-site production | Group A | APPROVED DESIGN; must test actual domains |
| GA-07 | OTP reset atomic with no intermediate verify endpoint; CLI initial tenant/Manager activation via OTP | Group A | APPROVED DESIGN; not implemented |

## A.1. Kit-wide UI decisions approved (not individual screen sign-off)

| ID | Proposal | Source / review status |
|---|---|---|
| UI-IDS | Use Stitch-style IDs AU01/G01/AC01/SC03/BL07 as canonical; old v0.9 IDs are aliases | APPROVED KIT BASELINE; migration map in SCREEN_MAP.md |
| UI-ROUTE | UI pages grouped under `/app/:tenantId/*`, public auth global, embedded panels do not require routes | APPROVED NAVIGATION CONVENTION; route/action per screen reviewed separately |
| UI-STYLE | Reuse Stitch color/token/layout set in DESIGN_TOKENS.md | APPROVED VISUAL BASELINE; no official logo/trademark or Figma variables yet |
| UI-DETAIL | Reuse 70 Stitch design units; add AU06 for Group A activation, 59 P0 candidates/12 P1 concepts | APPROVED PLANNING COVERAGE, NOT 71 implementation approvals/routes |
| UI-EXCESS | BL07/BL09/BL10 expose internal pending excess reconciliation separate from debt | UI implication of Group A, specific resolution workflow pending Billing slice review |
| UI-GRADE | Whether grading draft locks resubmission | NEEDS_SLICE_REVIEW per Q-11 and Detailed Design |

## B. Kit-level decisions now approved; screen/feature reviews still pending

| ID | Question for owner/reviewer | Suggested default | Status |
|---|---|---|---|
| UI-01 | Frontend URL navigation uses `/app/:tenantId`? | Yes; no assumption about tenant slug | APPROVED KIT |
| UI-02 | Screen inventory SCREEN_MAP IDs, labels, work areas and navigation order? | Canonical IDs and design-unit inventory; details per screen reviewed before implementation | APPROVED KIT |
| UI-03 | Visual token system, colors, density, table vs cards? | Semantic tokens, slate/white/blue; check accessibility per screen | APPROVED KIT |
| UI-04 | Shared pages for multiple roles instead of separate redundant role dashboards? | Yes, if scoped access can be represented clearly | APPROVED KIT |
| WF-01 | One feature spec and explicit review gate before code? | Yes | APPROVED WORKFLOW |
| WF-02 | New-file review before Git; no auto-push/PR/deploy/Figma? | **User explicitly required this** | APPROVED WORKING AGREEMENT |
| WF-03 | Default start slice for Codex? | Tenant + Manager activation / IAM | RECOMMENDATION, not feature approval |
| MODEL-01 | Model routing strategy Luna→Sol→Astra with evidence-based escalation? | Yes, verify availability and actual usage | APPROVED RECOMMENDATION; menu availability not guaranteed |

## C. Implementation decisions intentionally **not** silently closed

- `SCH-TECH`: exact transaction isolation and PostgreSQL exclusion migration/lock ordering/concurrency test plan.
- `BILL-TECH`: precise invoice dueAt calendar semantics, reversal workflow, overpayment resolution lifecycle/approval.
- `WF-TECH`: sync vs persistent-job execution after approval by operation.
- `AUTH-OPS`: domain and cookie CSRF integration tests for Vercel/Railway preview and production.
- `FIGMA-OPS`: whether a Figma file/design system exists, its URL and write permissions.
- `QUALITY-OPS`: performance fixtures, backup/restore test evidence; no “tested” claim yet.

These require a named slice review before implementation. Do not turn a technical proposal into a new FR/Q baseline without authorization.

## D. Source branch reality

On 2026-10-17 repo `main` read-only inventory showed `apps/api`/`apps/web` scaffolding and older Requirements. A separate PR **#1** was created in the prior task to synchronize v5/group A. This **vibecoding package has not been written to GitHub**. At each start of Codex work, inspect actual `git branch --show-current`, commit and docs content; never assume PR #1 merged.

## E. Kit approval record (does not approve Git operations)

| Area | Reviewer | Decision/date | Notes |
|---|---|---|---|
| Model selection and token strategy | Project owner | APPROVED KIT — 17/10/2026 | Conditional on current product availability |
| Root AGENTS instructions | Project owner | APPROVED KIT — 17/10/2026 | Git copy needs separate approval |
| Feature skill + UI skill | Project owner | APPROVED KIT — 17/10/2026 | Per-slice sign-off remains |
| Screen map IDs/routes, palette, P0 vs P1 | Project owner | APPROVED PLANNING BASELINE — 17/10/2026 | Individual screen implementations still require review |
| UI behavior/a11y | Project owner | APPROVED KIT — 17/10/2026 | Validate each screen |
| Feature template and Scheduling example | Project owner | APPROVED AS TEMPLATE/EXAMPLE — 17/10/2026 | Example is not approval to implement schedule slice |
| Permissions/CSRF/security claims | Project owner | GROUP A DESIGN ONLY | Requires integration and security testing |
| Approved copy-to-repo file list | — | NOT AUTHORIZED | User requested no Git until separate authorization |

**Do not auto-sync this v1.0 package to GitHub.**

**After owner approval:** copy only reviewed files; review diff once more; user explicitly authorizes any Git changes separately.
