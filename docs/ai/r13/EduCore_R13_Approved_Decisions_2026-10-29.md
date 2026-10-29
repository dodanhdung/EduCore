# EduCore R13 — Owner Decision Record (R13.0 approval / Gate 0 entry)

**Decision date:** 2026-10-29 (Asia/Bangkok)  
**Project:** `dodanhdung/EduCore`  
**Working branch:** `feature/frontend-architecture-reconstruction`  
**Baseline at review:** `6319759742313b17b805db7574ac1883e5f1fa17`  
**Decision:** Owner has accepted the proposed R13.0 direction and decisions D01–D08 in the current conversation. This file is a **draft repository decision record prepared for review**; it has **not** been committed or pushed. Do not claim Gate 0 is complete.

## Scope and source precedence

Business requirements, approved use cases and accepted architectural constraints remain authoritative. This approval covers frontend reconstruction **strategy** and a **temporary, bounded implementation exception**; it does not permit altering backend contracts, authorization, tenancy, financial invariants, database schema or production user data. Refer to `AGENTS.md` and the approved requirements and architectural documents in the checked-out branch.

## Approved decisions (D01–D08)

| ID | Approved decision | Boundary and follow-up |
|---|---|---|
| D01 | Use existing branch HEAD `6319759` as R13 baseline; do not replay R10/R12 ZIPs wholesale. | Verify actual HEAD and working-tree state before each implementation task; preserve existing staged `.gitignore` and any owner changes. If HEAD advanced, revalidate against current diff. |
| D02 | Open a dedicated **Gate 0 corrective slice** for AS01 and BL03. | No API/DB/RBAC modifications. Review separate patch + tests before Git writes. |
| D03 | Preserve feature/module organization; progressively introduce `shared/shell`, `shared/ui`, `shared/styles` and typed view models/data adapters. | Do not mass-rename or rewrite the entire frontend; keep a compatibility boundary for legacy screens. |
| D04 | Approve a **temporary exception** to Accepted ADR-009/012 during R13 frontend visual slices: do not simultaneously migrate React Router, TanStack Query, Tailwind, shadcn, React Hook Form or Zod. | Document explicitly as an exception, **not** a silent change to or revocation of the accepted ADRs. Reassess after R13.4; deviations must be visible. |
| D05 | Use verified desktop Figma shell measures as a starting point (approximately 256px sidebar and 64px header). Keep mobile tenant switch/account/logout accessible and preserve focus/keyboard usability. | Breadcrumb placement and responsive details require screenshot/prototype verification; do not invent or claim approved mobile frames. Test 320, 390, 834, 1024, 1280px. No fake search/bell functionality. |
| D06 | Keep current text wordmark pending separate brand approval; R12 logo/favicon remain **candidates**. | Verify authorized font loading/licensing for Be Vietnam Pro; otherwise use documented fallback and mark visual deviation. |
| D07 | G01 production may use the three approved overview KPIs. Figma-only operational aggregates/panels with missing API projections remain **deferred**. | No fabricated totals, no counting current page as tenant total, no mocked production success or invented endpoints. |
| D08 | Implement sequentially: Gate 0 → R13.1 AppShell → R13.2 shared components → R13.3 G01 → R13.4 scoped screens; BL07 is a financial regression control. | One bounded slice at a time, with test evidence, owner review of every new file before Git commit/push/PR. |

## Gate 0 acceptance criteria

- [ ] R13.0 decisions above are transferred to a reviewable repo-relative docs patch, with an ADR exception memo; owner reviews the new files before Git.
- [ ] AS01 handles initial success → 401/403, tenant/token switch, and out-of-order requests **fail closed**. Protected rows/actions are not left visible for an unverified scope. Abort/sequence guard, stale state clearing and explicit retry where safe are covered by tests.
- [ ] BL03 distinguishes 401, 403, retryable 5xx/network errors, and avoids offering Retry for authorization failures. Retry does not bypass normal auth or mutate server data.
- [ ] BL07 regression coverage proves invoice/wallet receipt reconciliation and original idempotency key are unaffected by the changes.
- [ ] Scope-limited frontend tests, TypeScript check, lint and build run; record exact commands, PASS/FAIL and outstanding warnings. Screenshot/test labels distinguish fixtures from authenticated real-API evidence.
- [ ] Backend, database, API contracts, business policy, tenant isolation and payment semantics unchanged; existing staging/dirty files preserved.
- [ ] Deliver a review ZIP with repository-relative changed files, test evidence and a Markdown review report. **No auto-commit, push, PR or deployment.**

## Proposed commit sequence (only after owner review)

1. `docs(r13): approve frontend reconstruction blueprint` — approved decision record, target architecture and bounded exception, excluding raw audit ZIP/screenshots/logs.
2. `fix(web): prevent stale assignment data across auth scopes` — AS01 fix + regression tests.
3. `fix(web): distinguish forbidden and retryable billing errors` — BL03 fix + tests; preserve BL07 regression.

Do not combine unrelated changes or staged owner files in these commits. **The owner's approval here is approval of the plan/architecture, not proof that the new file patches have passed review.**

## Next stage

Only after Gate 0 passes and review completes: begin **R13.1 — Figma-first AppShell Reconstruction**. No comprehensive screen rewrite in Gate 0.

## References

- `R13_0_BLOCKERS_AND_DECISIONS.md` in the supplied R13.0 audit ZIP (D01–D08)
- `R13_0_ADR_PROPOSALS.md` (R13-ADR-01–07; proposals to be formalized as an approved bounded exception)
- `R13_0_TARGET_ARCHITECTURE.md`, `R13_0_ACCEPTANCE_GATES.md`
- `EduCore_R13_0_Independent_Review_2026-10-29.md`
