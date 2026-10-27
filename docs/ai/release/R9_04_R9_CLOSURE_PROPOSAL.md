# R9 closure proposal — MVP controlled pilot, 27 October 2026

## Current owner-narrowed R9 closure: local MVP

**Technical verdict:** `R9_04_MVP_LOCAL_READY_FOR_OWNER_REVIEW`. **Recommendation:** `R9_LOCAL_CLOSURE_RECOMMENDED`. The owner now defines R9 completion as `R9_COMPLETE_MVP_LOCAL_READY`, not real-user pilot readiness. Only the owner may declare it after reviewing this task's ZIP and new files. No Git/PR/merge, hosted CI or deployment was performed.

Local checklist: dedicated PostgreSQL 16 initialization and 50 migrations PASS; restricted built API and Vite Web start at loopback PASS; synthetic Manager login/select/dashboard three KPIs/AC01/BL09/UI TOP_UP/logout and protected denial PASS; finance assertion requires BL09, HTTP 200 and database top-up/payment/balance deltas PASS; stop/restart retains wallet data and private file root PASS; API/Web typecheck/build/tests/lint and schema manifest PASS; [local runbook](R9_04_LOCAL_MVP_RUNBOOK.md) complete; R10 limitations recorded in the risk register. The owner can use `start-local.ps1` daily without reseeding or resetting. The application is currently running at `http://127.0.0.1:5173/login` from the final local restart.

Historical R9.4 automated regression remains `R9_04_REGRESSION_GATE_PARTIAL` due to OTP timing FAIL. The pilot/production closure proposal below remains a separate future decision: production OTP recovery, real-user onboarding, target restore, hosted CI and public deployment were not part of this local acceptance. Any confirmed critical finance, tenant-isolation or account-takeover defect would overturn local readiness; none was confirmed in the cited local checks.

### Remaining owner action for local closure

1. Review the new launcher, browser assertion, local evidence/runbook and all task files in the ZIP before Git.
2. Run the daily start/login/stop commands on the owner's Windows account and confirm the intended synthetic-only scope.
3. Record explicit local R9 acceptance. Separately authorize any later Git/CI or real-user pilot work.

## Final owner GO/NO-GO packet at `c12f732`

**Technical verdict:** `R9_04_MVP_PILOT_READY_FOR_OWNER_REVIEW`. **Closure recommendation:** `R9_CLOSURE_CONDITIONAL`. The built application works for a synthetic Manager on fresh local PostgreSQL 16: authenticated built Web login/tenant/dashboard with three scoped KPIs, BL09 real API data, manual TOP_UP (one wallet transaction, balance `1000`, zero invoice Payments), logout and protected-route denial. Corrected HTTP smoke enforces 200/200/200/200/403/202/202/204/401, rejecting a deliberate 500-for-403 mismatch. Previous F-B01/02/03 finance execution and tenant/CLASS denials remain `PREVIOUSLY_VERIFIED` at `6d274fd` with unchanged production behavior; the current task did not repeat the entire approval execution lifecycle.

The isolated R6-06 restore passed on a new source and different restored PG16 database/private root, including wallet, published grade, authorized private file, forbidden file denial and built API Manager overview 200. The local recovery point and hashes are in the [smoke evidence](R9_04_PILOT_SMOKE_EVIDENCE.json). The same-image tiny fixture does not establish target-host RPO/RTO. Teacher, Student and verified-linked Parent have prior targeted R9 browser/native evidence but no fresh built-Web or target-host journey in this task. Academic Staff and Accountant remain excluded. Financial and resource-scope integrity has no confirmed critical defect in the cited synthetic checks.

**Real-user pilot activation remains blocked by OTP delivery.** The current production worker refuses to start, and the secure SMTP proposal is unimplemented and unapproved. The official OTP timing equivalence test remains FAIL; D1 was approved as a separate diagnostic but not run here, and residual risk has not been accepted. Hosted GitHub Actions, target deployment, target paired restore, real email and owner sign-off are `NOT RUN` or pending. No `R9_COMPLETE_MVP_PILOT_READY` claim is made.

### Smallest remaining first-session checklist

1. Owner reviews this ZIP and all new paths; approves the exact initial four-role access list, exclusions and current permission scopes. Keep Academic Staff/Accountant out unless their separate walkthrough passes.
2. Security owner reviews/approves a separate production OTP worker implementation, secure SMTP/key custody and failure procedure; verify real delivery, expiry, single use, old-session revocation and generic responses on a pilot-like host. Do not change the local-only guard as a shortcut.
3. Owner accepts or rejects the **limited-pilot** OTP timing residual risk in writing, naming D1 owner and the first R10 security checkpoint. Monitor 429/503, delivery failures and repeatable external classification; stop on credible enumeration or account takeover.
4. After separate Git/deployment authorization and hosted CI, execute built-Web login/select/essential workflow/scope denial/logout for each invited actor on the target host; verify named Manager finance grants and eligible source.
5. Establish target backup schedule/operator/encryption, take a coordinated DB/private-file snapshot and restore into a separate target; verify login, wallet/invoice, grade and authorized/forbidden file access. Record RPO/RTO observations and stop if restore fails.
6. Owner records explicit GO/NO-GO and only then may declare `R9_COMPLETE_MVP_PILOT_READY`. Noncritical observed UX defects enter the minimal R10 backlog in the risk register.

### Previous checkpoint proposal (historical where superseded)

**MVP verdict:** `R9_04_MVP_PILOT_PARTIAL`.

**R9 recommendation:** `R9_CLOSURE_CONDITIONAL`. This is a recommendation to complete the listed owner gates, **not** an R9 closure approval. `R9_COMPLETE_MVP_PILOT_READY` is **not valid yet**. The official automated regression remains `R9_04_REGRESSION_GATE_PARTIAL` and the earlier RC remains `R9_04_RC_PARTIAL` because the OTP timing equivalence test still fails.

Source: local `test/r9-04-release-candidate` HEAD `6d274fda8a5606519b0ad84e7fa864bec4cb4f24`, prior R9.4 matrix/gate/OTP packet and this task's sanitized smoke evidence. The four earlier untracked OTP decision files were preserved; this packet is separate and does not silently adopt their proposed statistical changes.

| Closure question | Evidence-based answer |
| --- | --- |
| 1. What works? | Built API starts on fresh PostgreSQL 16 with restricted roles, 50 migrations and private local storage; built Web preview serves. Previous Edge/native tests cover login, tenant/IAM, academic/schedule/attendance, assignment/submission/grade, finance lifecycle, portal scope, jobs/alerts and dashboard. The current fresh HTTP smoke passed Manager login/select/navigation/dashboard, wrong-tenant denial, local OTP acceptance and logout. |
| 2. Which workflows actually executed? | **Current task:** local CI equivalents and production-entry HTTP smoke. **PREVIOUSLY_VERIFIED:** R4/R8 and R9 Edge A–E subsets, R1b/R2/R3/R5/R6 native cases at earlier tested checkouts with unchanged production code. No guided six-actor demo or target-host finance walkthrough was run. |
| 3. Which pilot roles? | Proposed first list: Manager, Teacher, Student and verified-linked Parent with current grants and per-role target smoke. Academic Staff and Accountant excluded until independent login/navigation/operation tests pass; Manager can perform only currently authorized academic/finance tasks. Owner must approve access list. |
| 4. Critical finance/data/auth defects? | No confirmed unauthorized or duplicate financial effect, cross-tenant leak, corrupted wallet or false `COMPLETED` in passing synthetic tests. F-B01 showed zero Payment on TOP_UP and no effect at APPROVED; explicit execute made exactly one receipt/adjustment and correct credit. Production-mode OTP recovery worker is **not approved to start** by current code; live pilot recovery is unresolved. |
| 5. Accepted limitations? | None accepted by owner in this task. Proposed exclusions: AC09 transfer, PO05/Parent–Student wallet-reader gaps, legacy/mixed financial adoption, external finance/P1 integrations, mobile finance until tested. See risk register. A workflow needed by actual pilot cannot be excluded without owner approval. |
| 6. Start and recover? | Fresh local built-API/preview start passed with fake SMTP and development-mode worker; a separate local Edge check rendered the built login form. Prior R6 local same-image DB/private-file restore passed. Target pilot authenticated built-Web journey, production-mode OTP delivery, actual private volume, backup cadence and restore rehearsal are **NOT VERIFIED**. |
| 7. Local checks? | Frozen offline install (existing cache), Prisma validate/generate, migration manifest, API typecheck, API 102/102 unit, API E2E 1/1, R1b WASM 15/15, API/Web builds, Web 290/290 and lints pass; Web lint retains 11 warnings. Four historical TS2322 callbacks already contain `async` and current typecheck passes. |
| 8. GitHub CI and owner approval? | Hosted Actions `NOT RUN`; no commit/push/PR/merge/deploy. All new files and script need owner review before Git. Owner must approve pilot scope, limitations, OTP residual risk and production-mode recovery solution. |
| 9. R10 follow-up? | PO05 and wallet reader grant design, Student finance navigation, AC09 policy, legacy/mixed adoption, mobile finance browser, optional UI polish and P1/reporting. OTP D1 remains a security follow-up, **not** a silent PASS or automatically accepted R10 deferral. |
| 10. Before first real session? | Complete the ordered checklist below, then record explicit owner GO. |

## Ordered owner gate to a first pilot session

1. Review this task's ZIP and every new path; separately approve any Git/PR action. Observe hosted GitHub Actions on reviewed source. Do not count local CI as hosted PASS.
2. Choose exact pilot host, tenant, included actors and operations. Provision only current approved scopes; keep Academic Staff/Accountant excluded or prove their role journeys. Keep PO05/AC09/legacy cases safely unavailable as applicable.
3. Resolve the **production-mode OTP worker guard** with a separately reviewed security/operations decision. Demonstrate real pilot recovery delivery, expiry/single-use reset and failure behavior without exposing OTPs. Do not simply disable the guard or use development-mode insecure cookies for a real-user production host.
4. Explicitly accept or reject the **OTP timing residual risk** for restricted pilot exposure; if accepted, record D1 owner, deadline, monitoring and stop condition. The official R4 timing test remains FAIL/UNRESOLVED and production clearance is not implied.
5. Build/deploy only through separately authorized actions; render built Web login in a real target browser, sign in each included actor, complete its essential operation, verify tenant/resource denial, and log out. This resolves the current built-Web DOM gap. An independent Accountant or Academic Staff requirement adds those journeys.
6. Take coordinated target PostgreSQL/private-file backup and successfully restore to an isolated target; name backup and incident operators, choose schedule and document recovery point. Rehearse migration forward recovery before mutable pilot data.
7. Run a target-host finance walkthrough with eligible actor and authoritative before/after checks: TOP_UP not Payment, wallet payment one effect, APPROVED no effect, EXECUTE one receipt/internal credit, scoped denial. Check job/inbox/audit and worker status.
8. Owner reviews evidence and residual limitations, then records explicit GO/NO-GO and an initial small-user monitoring plan. Stop on any cross-tenant/private-file access, wrong money/approval state, unrecoverable backup or credible account enumeration.

**Closure rule:** Only after technical owner review, explicit pilot-risk acceptance, approved scope/limitations, required local and hosted CI, separately authorized Git/PR/merge, target startup/recovery smoke and explicit owner closure decision may the owner declare `R9_COMPLETE_MVP_PILOT_READY`. Producing this ZIP does not satisfy those gates.
