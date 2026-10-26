# R9.4 P0 scope audit and decision addendum

**Verdict: `R9_04_RC_PARTIAL`.** This checkout supports substantial synthetic P0 journeys, including an Edge financial lifecycle, but the full R4 regression gate failed and no complete manual multi-actor demo was run. No confirmed cross-tenant leak, unauthorized/duplicate committed financial effect, false `COMPLETED`, or broken migration was observed in the passing cases. That is not a clearance of those risks outside the tested fixtures.

Sources checked: `docs/ai/PROJECT_CONTEXT.md`; Requirements v5.1 O-12/Wallet FR-30/31, BR-08/11, Q-10/12; UC-21/23/24/25/26/34/37; accepted architecture; current controllers/routes/migrations and R1b–R6 runner documentation. Older `DECISION_REGISTER.md` rows marked NOT IMPLEMENTED are historical snapshots and do not override the current code inspection. Current source and tests are evidence of implementation, not owner policy sign-off.

| Approved P0 area | Current implementation and API/UI | Server boundary and current evidence | Partial / blocked case |
| --- | --- | --- | --- |
| Authentication, tenant access | Auth HTTP/session and AU01–AU06, tenant selection, guarded navigation | R4 login/session/role/scope/CSRF tests; R9 Edge login and tenant switch; 290 web tests | Production SMTP/key custody, cross-origin deployment behavior and live delivery unverified; R4 OTP timing acceptance failed. |
| Members, relationships | Member/role and parent-link read/write HTTP; OP01–03 | R4 fresh TENANT grants, last-Manager and verified-child tests; R9 parent Edge scope/revoke | Dynamic permission editor outside P0. |
| Academic | Profile/catalog/course/class, teacher assignment, enrollment HTTP and AC01–08 | R3/R4 tenant/scope/capacity/placement tests; R9 Edge academic journey | AC09 `TRANSFER_CONFIRM` remains deliberately unavailable pending financial handoff policy. |
| Scheduling/resources | Room, availability, draft/preview/confirm/change HTTP and SC01–06 | R3 conflicts/locks; R4 and R9 Edge schedule/conflict | Preview does not reserve a booking; only confirm commits. |
| Attendance/leave | Due/roster/mark/finalize/correct/leave HTTP and AT01–04 | R3/R4 finalized-source and scoped leave tests; R9 Edge attendance/leave | Late/locked actions require their explicit permission; AT05 is a preview concept, not a production route. |
| Assignments/submissions/grades/files | R5 HTTP for assignments, versions, grade publish/revise, private file upload/download; AS01–07 | R5 44 native cases, including parent revocation, private bytes and grade visibility; R9 Edge teacher/student | Draft grade and private files remain inaccessible to Student/Parent without allowed published scope. |
| Billing/receivables | Billing price/period/generation/recompute/issue/read HTTP; BL01–07, BL09–10 | R2 financial invariants, R4 HTTP and R9 Edge source→invoice→wallet chain; finance access binds permission plus STUDENT/TENANT scope | Legacy/mixed invoice adoption and external bank refund are blocked. H-04 historical design decision requires separate reconciliation/policy; do not imply universal finance closure. |
| Wallet/approvals | Manual top-up, wallet payment, reversal request, adjustment/cancel request, decision then explicit execution; finance UI | R2 59 native cases; R4 finance HTTP and R9 Edge F-B01–03; `APPROVED` stays distinct from `COMPLETED` | Only internal net-excess credit after authorized execution. No gateway, auto-approval, cash-out or automatic legacy conversion. |
| Notifications/audit/jobs | GL01, OP06–07 and scoped HTTP; persisted worker/outbox | R4 current-scope/audit/job tests; R6 100 outbox redeliveries | Historical R4 revoked-worker C03 expected unread alert was absent after one dispatch. Follow-up proved a preceding queued event; exact-event delivery now passed focused and full R4. Authorized job retry only. |
| Dashboard G01 | Production route and three scoped KPI projection | R4 native P01 and web G01 tests | Class-scope summary is intentionally partial; no advanced reporting. |
| Role portals PO01–PO05 | Production routes and portal context/teacher/student/child/billing reads | R4 P02–P04; R9 Edge child switch/revocation and web stale-state tests | **PO05 Student finance PARTIAL. Parent/Student wallet-reader PARTIAL** where current grants/verified links do not authorize them. No role-name shortcut. Preview fixtures do not establish availability. |

The production web entry imports `ui-preview/PreviewApp` only under `import.meta.env.DEV`; the production build and web tests passed. AT05/AC09 are preview concepts; BL08/BL11 are embedded dialogs rather than standalone production routes. Synthetic variants are not evidence of a committed operation.

## Operational readiness

| Check | Current result |
| --- | --- |
| Lockfile install | Existing-cache `--frozen-lockfile --offline` passed. Clean empty-cache installation NOT RUN. |
| Production builds | API Nest and web Vite builds passed locally. No deployed build tested. |
| Environment inventory | API `.env.example` lists `DATABASE_URL` for migration only; restricted `R4_AUTH_URL`, `R4_API_URL`, optional `R4_WORKER_URL`, auth secrets/issuer/audience/origins, OTP SMTP settings, `R5_PRIVATE_STORAGE_ROOT`, `PORT`; web has public `VITE_API_BASE_URL`. No real values copied. R4 recovery worker needs separate `R4_OTP_WORKER_URL` and key/SMTP custody per R4 README. |
| Migration chain/redeploy | R4 D08 and R6-01/02/03 passed on admitted disposable PostgreSQL 16, including failed migration recovery, replay and synthetic populated checkpoint. Production adoption and legacy migration remain unvalidated. |
| Restricted DB principals | R4/R6 test separate AUTH/API/WORKER/OPERATOR capabilities and raw DML denial. Deployment grants and secret rotation not exercised. |
| Private files | R5 private-volume adapter and authorized download tests passed. No actual Railway volume or production file restore tested. |
| Worker/lease/outbox | R4/R6 lease, fencing, restart/failure and idempotence tests ran. Historical R4 C03 alert assertion failed; the follow-up exact-event C03 passed in a fresh full R4 run. Deployed start/stop behavior remains unvalidated. |
| Health/error logs | R4 error filter and correlation tests produced safe code/correlation output; no deployed log-sink or full secret scan. |
| Backup/restore | R6-06 passed a coordinated **local** DB/private-volume restore with fresh role provisioning. No production backup policy, uptime, RPO/RTO or security compliance claim. |

## Decision addendum and release risks

1. **R4 gate still FAIL — release decision open.** H01 remains corrected. The revoked-worker alert root cause was test sequencing: `dispatch_event()` processed an older queued event first, and the bounded exact-event test now passes. OTP timing statistical acceptance still failed in a fresh focused run and the full R4 run; no thresholds or production auth code changed. Original failures remain in the matrix. See `R9_04_GATE_CLOSURE_ANALYSIS.md`.
2. **PO05 and wallet readers remain PARTIAL.** Review Student financial permission catalog and Parent verified-child read contract as a separate approved slice. Do not grant finance access by role label or by hiding controls.
3. **Academic transfer confirmation remains policy-blocked.** Show the unavailable state; decide/classify financial difference and approval handoff in a separate scope before enabling a writer.
4. **Legacy/mixed finance and deployment data adoption remain blocked.** No automatic conversion. A reviewed reconciliation/adoption plan is required for populated deployment data.
5. **Production decision remains separate.** Review all new files before Git, clear R4, verify representative manual multi-actor demo and mobile finance browser behavior, provision runtime secrets/restricted grants/private storage/SMTP, rehearse actual target deployment and restore, and approve operational ownership. No deployment performed.

### Follow-up gate status, 27 October 2026

Standalone R8 scheduling/attendance passed **1/1, zero skipped** on its own newly admitted PostgreSQL 16 cluster. The current full R4 run passed **155/156, zero skipped**; only OTP timing C03 failed. Academic and R9 F-B01/02/03 Edge cases were executed with no browser skips. API offline unit, E2E, typecheck, build and lint passed. This is **`R9_04_REGRESSION_GATE_PARTIAL`** and the overall **`R9_04_RC_PARTIAL`**. Guided six-actor demo, mobile finance browser, hosted CI and deployment rehearsal remain **NOT RUN**. No conclusion about production uptime, backup targets, RPO/RTO, SMTP deliverability or security compliance follows from these local runs.

## MVP pilot acceptance addendum — 27 October 2026

The tracked branch is now `test/r9-04-release-candidate` at `6d274fda8a5606519b0ad84e7fa864bec4cb4f24`. Current local CI equivalents pass, and a **new disposable** PostgreSQL 16 smoke started built `dist/main.js` with four restricted runtime roles, built Web preview, local fake SMTP and a synthetic Manager. Login/select/navigation/dashboard, wrong-tenant denial, OTP generic response and local worker acceptance, logout and session revocation passed. No production source or SQL changed. The initial built-Web Edge dump did not verify React, but a subsequent isolated local Edge check **rendered the built login form**. No authenticated built-Web browser journey or target-host test followed; earlier development-Vite Edge journeys remain valid previous evidence only.

For a proposed first small pilot, Manager, Teacher, Student and verified-linked Parent are candidate roles subject to each role's target-host walkthrough and owner approval. Academic Staff and Accountant remain excluded from the access list until their independent login/navigation/operation runs pass. PO05 Student finance/Parent–Student wallet reads, AC09 transfer and legacy/mixed adoption stay unavailable as in the historical scope audit. This addendum does not expand permission or change Wallet B1–B5.

The OTP timing acceptance remains FAIL and requires explicit owner pilot-risk acceptance; D1 was not run here. A distinct **operational blocker** for production-mode pilot recovery is that the current separate OTP worker throws `PRODUCTION_OTP_WORKER_NOT_APPROVED` under `NODE_ENV=production`. The local smoke used development mode and fake SMTP, so it does not establish real-user email delivery. A separately reviewed delivery/operating decision is required before a production-mode pilot; do not simply disable the guard. Target-host Web browser render, paired DB/private-file restore, hosted CI and guided included-role journeys are also open. See the acceptance, risk and operations documents for exact pre-session gates. Current verdict is `R9_04_MVP_PILOT_PARTIAL`; `R9_COMPLETE_MVP_PILOT_READY` is not declared.
