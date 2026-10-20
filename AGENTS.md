# EduCore — Codex repository instructions

> APPROVED KIT v1.0, 17/10/2026. Recommended repository root **only after separate explicit Git-copy authorization**. Keep this file concise: Codex automatically receives it as context. Do not paste all project documents into AGENTS.md.

## Mission

Build EduCore P0 via **one approved vertical slice per task**. Treat every request as bounded by the user's explicit scope. Start with a short plan and touched-file list; deliver code/tests **only if implementation is requested**. A docs-only request must not edit source, migrate DB, use external services, push, commit, create PR or deploy.

## Sources and precedence

1. `docs/requirements/requirements_analysis.md` **v5.1** (v5 + O-12/Wallet amendments; FR/BR/NFR, Q-01–Q-15).
2. `docs/requirements/usecase/specification.md` v1.3 (UC-01–UC-37 + AC).
3. `docs/architectural/architectural_design.md` (Accepted ADRs).
4. `docs/design/database_design.md` v1.1 after group-A approval; `docs/design/class design/` module file; `docs/design/detailed_design.md`; `docs/design/api_specification.md` — **only those versions actually present in the working branch**.
5. Approved feature slice spec; `docs/ai/*` for approved UI framework, screen candidates and on-demand workflow. Individual screens require per-slice review.

If missing, outdated, conflicting, or not merged: **report it**. Do not claim the repository has a document/version or implemented route without checking. BR/Q beat design proposals; never silently edit their meaning. Record assumptions as `PROPOSED`, not `APPROVED`.

## Hard boundaries

- P0 is **Internal-first**; external business integration ONLY OTP-email delivery. No payments gateway, bank reconciliation API, email business notifications, SMS/Zalo, Google login/calendar/drive, push or external refund automation. Wallet B1 permits only internal net-excess credit during successful authorized execution of an approved invoice adjustment/cancellation; it does not permit automatic approval or bank refund. P1 features such as makeup/suspension/substitution/prepaid/deadline reminders/advanced reporting are out of scope unless explicitly opened.
- Modular monolith NestJS + React/Vite TypeScript + PostgreSQL/Prisma + REST/OpenAPI, pnpm workspace. Separate tenant + permission + resource scope **server-side**, not by hiding UI.
- Critical mutations: transaction, correct locks/constraints, audit, policy version + correlation; jobs and outbox persisted and idempotent. `APPROVED` ≠ `COMPLETED`.
- VND as bigint/decimal strings over JSON; UTC storage and tenant timezone display; `[start,end)` intervals. Immutable issued invoice/payment history/submission versions/grades/audit: append adjustment/reversal/revision.
- Respect existing source files: never overwrite UI/API starter files broadly unless slice demands it. Never invent DB migration success or run commands that have not been run.

## Efficient task workflow

1. Read `docs/ai/PROJECT_CONTEXT.md` **and only relevant FR/UC/Q/BR, design sections, API endpoints and module file**.
2. For UI tasks: use `.agents/skills/educore-ui-slice/SKILL.md`, ONE canonical ID from `SCREEN_MAP.md`, ONLY that card in `SCREEN_SPECIFICATIONS.md`, plus approved `DESIGN_TOKENS.md` / `UI_GUIDELINES.md` sections; never paste all 71 cards. Canonical IDs are AU01/G01/SC03/BL07 (v0.9 IDs aliases only). For full stack tasks: use `educore-feature-slice`.
3. Inspect repository state. State allowed file paths, expected outputs, acceptance tests, and unresolved questions. If an unresolved decision changes business behavior or security, **stop that part and ask for approval**; proceed only with independent safe work.
4. Implement minimally, add meaningful tests, run available relevant checks, summarize what **actually ran** and what was skipped.
5. Do not commit, push, create branch/PR, deploy, mutate Library or Figma unless user **explicitly authorizes the action**. **Any new file needs review before Git; user has explicitly required review-first for all new files.**

## Completion format

`Scope / Sources / Files changed / Tests actually run / Risks & deviations / Pending review`.
