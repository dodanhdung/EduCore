# Management & Operations

Eight React screens implemented as reviewable UI Preview flows. Production keeps the existing deny-by-default authorization guard. Live reads and writes remain unavailable until server-authoritative grant evidence and complete read models are connected. No local mutation simulates server success.

## Sources

Task 2026-10-23; branch `feat/ui-management-operations`, original HEAD `266d3a3e54b0c30920ba2b9ed23a79332fc88262`. Requirements v5.1 amendments, UC v1.3 amendments, accepted architecture, DB v1.1 / Detailed Design group A, relevant identity/reporting/workflow/audit/jobs class modules, API specification §§3.2/3.10–3.12, PROJECT_CONTEXT, selected screen rows/cards, F01/F05/F07, tokens, UI guidelines and review template/checklist. Some class files cite historical proposed DB v1.0; those citations do not override present v1.1 or runtime evidence.

Runtime inspected read-only: `apps/api/src/workflow-approval/runtime.controller.ts`, `runtime.service.ts`, migrations `202610190012_r4_workflow` (read model) and `202610190013_r4_jobs` (retry). No migrations or backend tests ran. See [screen contracts](SCREEN_CONTRACTS.md), [Figma mapping](FIGMA_FRAME_MAP.md), and [delivery report](IMPLEMENTATION_REPORT.md).

## Screen / route / contract matrix

UI route prefix `/app/:tenantId`; API prefix `/api/v1/tenants/:tenantId`. All eight screens mount through ManagementScreen in App.tsx after the unchanged guard. DEV Preview URLs: `/__ui-preview/G01` through `/__ui-preview/OP07`.

| ID / Figma | Component | Route suffix | Business trace | Actual backend contract / status |
|---|---|---|---|---|
| G01 / 43:3 | G01/ManagerDashboardScreen.tsx | /overview | FR-40 / UC-32 / Q-12 | GET dashboard/overview absent; PENDING_API. Exactly three snapshot KPIs, no speculative aggregation |
| OP01 / 47:2 | OP01/MembersScreen.tsx | /settings/members | FR-02 / UC-04 | GET/POST members, PATCH disabled exist. GET only id/userId/status; missing names/emails/roles; unlock absent |
| OP02 / 47:560 | OP02/MemberDetailScreen.tsx | /settings/members/:membershipId | FR-03/04 / UC-04/05 | POST role-assignments and assignment/revoke exist (proposed PUT is not runtime). GET member details/assignments absent |
| OP03 / 47:1079 | OP03/RelationshipsScreen.tsx | /relationships | FR-06 / UC-06 / Q-02 | POST links/verify/revoke exist. GET links and complete scoped selector/evidence DTOs absent |
| OP04 / 47:1637 | OP04/ApprovalsScreen.tsx | /approvals | FR-41/45 / UC-26/34 / BR-08–11 | GET list page/pageSize only; requester/time/evidence/execution projection incomplete |
| OP05 / 47:2199 | OP05/ApprovalDetailScreen.tsx | /approvals/:requestId | UC-26/34 / BR-11 | GET detail; POST decisions APPROVE/REJECT/REQUEST_INFO; POST execute exist. Timeline GET absent; receipt integration pending |
| OP06 / 47:2720 | OP06/AuditScreen.tsx | /audit | FR-41 / UC-35 / Q-14 | GET audit and audit/operations/:correlationId exist; actorKind returned but actor identity/result absent; full server filters pending |
| OP07 / 47:3280 | OP07/JobsScreen.tsx | /operations/jobs | UC-37 / BR-12 / Q-13 | GET list/detail, POST retry exist. Read model lacks attempt history/root; FAILED or NEEDS_INFORMATION count<4 is a candidate, never a grant |

## States and interaction

- Shared populated, empty, loading, 401/403/404/409/422 and network/server error views. Error views suppress underlying records. `?state=empty|loading|unauthenticated|forbidden|not-found|conflict|invalid|error`.
- Lists: immediate search/status filters, filtered empty, selected ID navigation, semantic tables/captions and mobile cards. Counts describe the provided sample dataset, not server-wide totals. Unsupported server filters are never sent.
- G01: zero and missing KPI (`?state=partial`), tenant/scope/timestamp/timezone, BigInt VND. Preview explicitly supplies detail navigation; production supplies none without grants.
- OP01/02: name/email/reason validation, pending activation, no temporary password; role/scope review, duplicate active assignment rejection, CLASS/STUDENT scope ID required, revoked roles retained. Revocation names the exact membership and assignment ID, scope and consequence. Last Manager fixture protected; server must enforce the real invariant. No unlock or dynamic permission editor.
- OP03: pending/ACTIVE/INACTIVE distinguished, evidence and verifier, same-tenant fixture selectors, reviewable verify/revoke. Dialog names relationship ID, Preview identity IDs, status, evidence and consequence. No local verification or parent access grants.
- OP04/05: pending/needs-information/approved/completed/rejected and separate failed-execution outcome. `?state=approved|failed|self-approved`; OP05 completed fixture `?recordId=YC-24015`. Approve/reject/request-info each require reason; execution is a separate action. Source status is preserved even when receipt or execution conflicts. Receipt alone cannot prove effect/receipt/audit committed; authoritative completion verification is PENDING_API. SELF_APPROVED is an audit flag. Supported finance request replaces the Figma attendance example whose generic decision transport is not proven.
- OP06: text/object/correlation, actor, local-date and result filters; invalid range; details and correlation timeline; display allowlist only, no arbitrary JSON; 24-month baseline and read-only controls. Free-form actor/target/reason require a server-redacted DTO. Without its trusted projection, details are unavailable; backend redaction verification is PENDING_API.
- OP07: six job states, attempts/error/policy/correlation/root. Candidate state is separate from remediation readiness, fresh authorization and actual execution. NEEDS_INFORMATION remains blocked, count4 and committed effects cannot replay. No recovery cycle, counter reset or infinite retry.
- `?state=read-only` removes mutation-review controls. Dialogs have labels, validation, native focus/Escape/Tab handling and focus restoration. Final mutation remains disabled. No “success” transition is generated locally. Preview receipt is illustrative, not proof of atomic completion.

## Production boundary

auth.ts/routes.ts/ApiClient are unchanged. No fabricated grant evidence is supplied to resolveRoute. Roles, URL parameters and fixtures cannot authorize production routes. ManagementScreen returns a neutral pending-authorization view in production, even if fixture props are mistakenly passed. Fixtures are imported only by DEV Preview and excluded from production bundles.

No live API calls are wired because this task explicitly requires established permission evidence first. Connecting real transport requires server evidence, adequate DTOs and reviewed mutation results. Existing decision/execute/retry endpoints require reason + Idempotency-Key; preserve current bearer/CSRF/error semantics and inspect revision semantics rather than inventing them. No backend work is authorized by this handoff.

## Outstanding review

- PENDING_API: authoritative grants, dashboard/list relationships/member detail/assignments, full identity/evidence/execution receipt/job-history projections and scoped filters/pagination; server-redacted audit actor/target/reason DTO, remediation evidence, completion commit verification and fresh retry authorization. `safeProjection` and `remediationEvidence` in the Preview types are PROPOSED UI-only fields, not implemented API outputs. Existing endpoints and absent endpoints are distinguished in the matrix.
- NEEDS_REVIEW: every new file, per-screen UX/forms, proposed mobile layouts, disabled final confirmations and changed action labels. No full WCAG audit or live end-to-end mutation verification.
- DESIGN_UNVERIFIED: pixel parity, exact typography, shell differences and browser geometry where unavailable. All cited source frames/screenshots were verified; see report for actual browser outcomes.

Windows commands: `pnpm.cmd --dir apps/web test`, `build`, `lint` (pnpm.ps1 is blocked by execution policy). Targeted suite from apps/web: `node --experimental-strip-types --test "src/screens/Management & Operations/management.test.mjs"`.
