# EduCore — Vertical Slice Specification Template

> **Instruction:** Copy this file as `docs/vibecoding/features/<feature-slug>.md` only after explicit approval. Replace bracketed fields; mark unresolved technical choices `PROPOSED` or `NEEDS_DECISION`, never quietly assume `APPROVED`. This is a feature-slice spec, not a replacement for FR/UC.

## Metadata

| Field | Fill in |
|---|---|
| Slice ID and title | `[EC-SL-XXX] — [single user outcome]` |
| Revision/date/status | `[0.1 / YYYY-MM-DD / DRAFT_FOR_REVIEW]` |
| Priority | `[P0 or explicitly approved P1]` |
| Owner/reviewer | `[role/person]` |
| Source branch SHA | `[git rev-parse HEAD]` |
| Trace | `[FR-XX, UC-XX, AC-XX, BR-XX, Q-XX, ADR if applicable]` |
| Target actor/scopes | `[roles are examples; exact backend permissions and object scope]` |
| Out of scope | `[explicit exclusions including P1]` |
| Approved by/on | `[blank until explicit signoff]` |

## 1. Objective and observable success

**As** `[actor with permission/scope]`, **I need** `[operation]`, **so that** `[business outcome]`.

Acceptance: `[specific externally observable result]`. Success MUST NOT be inferred only from UI animation or preview state.

## 2. Source-of-truth extract

- Business: `docs/requirements/requirements_analysis.md` v5, sections `[FR/Q/BR]`.
- Use case: `docs/requirements/usecase/specification.md` v1.3, `UC-XX` + named acceptance criteria.
- Architecture: relevant Accepted ADR/section.
- DB: table names, keys/indexes, schema version/review status.
- API: exact method, versioned path, DTO and errors; specify `PROPOSED` if not approved.
- Class design: **one or two** relevant module files (no full 14-module scan).
- Repo code: list actual files/packages, with status `existing / scaffold / missing`.

| Requirement ID | Interpretation within this slice | Evidence/test |
|---|---|---|
| `[AC-XX]` | `[meaning]` | `[test name]` |

## 3. UI and Figma contract (if needed)

- Screen ID/route: `[canonical ID from SCREEN_MAP (AU01/BL07 etc.), route is PROPOSED until approved]`; read matching SCREEN_SPECIFICATIONS.md card and applicable Fxx path; attach SCREEN_REVIEW_TEMPLATE.md signoff.
- Primary actions: `[button → command/API]`.
- Fields: `[name, type, required, display source, validation]`.
- States: idle/loading/empty/forbidden/conflict/validation/stale/success/failure.
- Mobile accessibility/responsiveness: `[testable targets]`.
- Component reuse: `[existing components? if not, list minimal additions]`.
- Figma reference: `[URL/file/frame only if verified and authorized; otherwise NOT_CONNECTED]`. Exact design tokens from DESIGN_TOKENS.md are PROPOSED until review.

## 4. Backend contract

| Operation | Method + path | Permission & scope | Request | Response + codes | IDEMP/revision |
|---|---|---|---|---|---|
| `[name]` | `[route]` | `[permissions; object target]` | `[schema]` | `[2xx/4xx]` | `[key/If-Match]` |

All records associated with student/teacher/class must verify active membership in tenant; never trust `tenantId` simply because it is in URL.

## 5. Domain model / invariants

- States/state machine: `[valid transitions; deny invalid transitions]`.
- Immutable/audit fields: `[actor, reason, timestamp, policy version, correlation]`.
- Amounts/times: `[BigInt VND string, UTC and tenant zone, half-open intervals]`.
- Concurrency: `[dedup key, DB locks, exclusion/check constraint, optimistic revision]`.
- Decision boundary: `NEEDS_DECISION` for any BR/Q ambiguity; do not invent rule.

## 6. Database and transaction boundary

- Owned tables/migration path: `[tables/columns/constraints; no speculative migration]`.
- Atomic operations: `[writes + audit + outbox in one DB transaction]`.
- Rollback and partial failure: `[what remains unchanged]`.
- Dependency / cross-module public interfaces: `[services/ports; avoid table writes in foreign module]`.
- Background job: `[if applicable, durability, retry, pinned policy/idempotency]`.

## 7. Negative/security cases

| Case | Expected behavior | Test |
|---|---|---|
| Unauthenticated / suspended membership | `[401/403]` | `[e2e]` |
| Wrong tenant / out-of-scope target | `[deny; no leaked data]` | `[e2e]` |
| Concurrent duplicates | `[exactly once or safe failure]` | `[integration]` |
| Stale revision / conflicts | `[409; no partial state]` | `[integration]` |
| Forbidden business transition | `[422/409 per API contract]` | `[unit/e2e]` |
| External side-effect failure | `[persist core; recover outbox without duplicate]` | `[integration]` |

## 8. Test plan (must be runnable)

- Unit: `[validator, calculation, state transitions]`.
- Integration: `[real PostgreSQL transaction, FK/exclusion/locking, isolation]`.
- HTTP contract: `[exact request/response/error codes]`.
- UI component: `[loading/forbidden/stale/conflict/accessible controls]`.
- E2E: `[happy path + one failure path per AC]`.
- Commands: `[inspect actual package scripts; do not claim imaginary commands ran]`.

## 9. Implementation boundaries

- Allowed files: `[explicit paths]`.
- New files that need review: `[list]`.
- Must not modify: `[core design/other module/prod database/Git]`.
- No commit/push/PR/deploy/Figma write unless explicitly requested.
- Open questions: `[NEEDS_DECISION: prompt human with 2–3 concrete options]`.

## 10. Review / handoff

**Definition of Ready:** sources/priority/ACL/API/DB/test cases reviewed; important missing decisions resolved.  
**Definition of Done:** changes stay inside scope; tests actually executed; no P1 leakage, permission/tenant safety, rollback/idempotency, docs updated appropriately and owner approves diff.  
**Evidence:** `[file diff, run logs, screenshots, OpenAPI snippet, failing test reproduction]`.  
**Status:** `DRAFT → REVIEWED → APPROVED_FOR_IMPLEMENTATION → IMPLEMENTED_LOCALLY → REVIEWED_FOR_GIT`.
