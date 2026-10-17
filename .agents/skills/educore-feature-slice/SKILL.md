---
name: educore-feature-slice
description: Implement or review one explicitly approved EduCore backend/full-stack vertical slice (NestJS, PostgreSQL/Prisma, REST, tests); use when the task includes business logic, persistence, authorization or cross-module transactions. Do not use for a UI-only mock/Figma screen.
---

# EduCore — full-stack feature slice

## Trigger / non-trigger

Use this skill only when asked to design/implement/test **one named feature slice** involving backend/domain/API/DB or full stack. For UI-only work use `educore-ui-slice`. For initial brainstorming use `PROJECT_CONTEXT.md` first, not every source document.

## Strict gates

1. Check git ref and inspect current files; confirm Requirements v5 and approved design group A exist **in checked-out branch**. If missing, flag mismatch; do not silently use outdated docs.
2. Read `docs/vibecoding/PROJECT_CONTEXT.md`, feature slice spec (if none exists: use `FEATURE_SPEC_TEMPLATE.md` and produce **review draft only**), relevant UC and acceptance cases + related FR/BR/Q, one module class design, owned DB/API sections. Read only relevant sections.
3. Before code show a concise plan: source IDs, priorities P0/P1, actor/permissions/scope, operations/state transitions, affected tables, transaction boundary, touched file list, tests and unresolved decisions. Design remains `PROPOSED` unless explicitly approved.
4. When approval to implement exists: write minimal code under allowed paths, make backend authorization server-side, enforce composite tenant references + per-record scope, audit/immutability, idempotency and outbox when applicable. `APPROVED` vs `COMPLETED` stays distinct. No fake API behavior.
5. Add test cases for success, invalid input, 401/403, wrong tenant, wrong student/class scope, race/duplicate, retry, failed transaction, business invariants and P0/P1 boundary. For PG-specific locking use real DB integration tests rather than mocks only.
6. Run *available* build/test/lint scripts and record exact commands/results. If environment/dependencies missing, say `NOT RUN` and why; never fabricate passing tests.
7. Return `Files touched | Scope/IDs | Tests actually run | Security | Risks | Needs review`. Keep local changes for review; **do not create new Git branches, commit, push, PR or deploy** unless this precise action is explicitly requested and approved. Every new file needs review before Git.

## Priority business invariants

- Multi-tenant isolation P0, multi-role but scoped memberships, verified Parent link, last valid Manager, no privilege elevation. Permission checked anew on each mutation and worker retry.
- Schedule: weekly <=6 months, `[start,end)`, no teacher/student/room conflict including unavailability; PostgreSQL concurrency protection; all-or-nothing confirmation. Preview is advisory only.
- Attendance finalized sources for monthly billing; `ATTENDED/UNEXCUSED=1`, `EXCUSED/CANCELLED=0` (with applicable UC cases). Locked edits via authorized audit/financial adjustments.
- Money VND bigint + Decimal rates + ROUND_HALF_UP once, sibling 10% P0, invoice draft automatically generated but **not auto-issued**; one invoice per student/month per tenant; no bank API/gateway/automatic refunds. Financial excess after downward adjustment is recorded separately.
- Submission versions immutable; limits 5 files x 10MB, PDF/DOCX/JPG/PNG; published grades only visible externally; audit and jobs carry correlationId/policyVersion.
- No P1 actions or third-party business APIs except OTP email delivery P0.

## If blocked

For missing rule, list exact source conflict and 2–3 resolution choices; do not change FR/BR/Q or invent algorithm. Continue with unaffected tasks only. If new DB migration affects finances/security, require explicit design review before executing against shared environments.
