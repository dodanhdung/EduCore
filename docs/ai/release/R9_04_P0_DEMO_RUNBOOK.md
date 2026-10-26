# R9.4 synthetic P0 demo runbook

This runbook is for an **isolated local/disposable** demonstration, not production. The reproducible automated path is the documented fresh-container R1b–R6 runners in `R9_04_TEST_MATRIX.md`; R4's native suite creates its own synthetic principals and sources and drove real Edge→React→Nest→restricted PostgreSQL journeys. Its full gate currently **FAILS**, so demonstrate the passing cases with that caveat and do not call the whole RC ready.

## 1. Admission and preparation

1. Verify a clean intended checkout and commit `f2691ae` plus reviewed R9.4 test-only edits. Install with frozen lockfile, generate Prisma, build API/web. Use Node 24.12+ and local PostgreSQL 16 Docker per the runner READMEs.
2. For automated evidence, invoke each `start-r1b-native.ps1`, `start-r2-native.ps1`, `start-r3-native.ps1`, `start-r4-native.ps1`, `start-r5-native.ps1`, `start-r6-native.ps1` with `-RunTests` from the repository root. Each invocation must admit a **new** disposable cluster. Do not set admission flags manually, reuse a test database or redirect a runner to a shared target. R4 currently fails; see the matrix before presenting its output.
3. For a guided manual walkthrough, prepare a separate owner-controlled disposable demo tenant with controlled operator bootstrap, separate restricted runtime principals, a private test storage directory and local fake OTP transport. Use only `.invalid` addresses and invented names/codes. Never use the native test database as the manual demo target.
4. Provision six distinct synthetic actors with current tenant-scoped grants: Manager, Academic Staff, Teacher assigned to the demo class, Student with one enrollment, Parent with one **verified** link to that Student, and Accountant with approved finance scope. Provision a second student/tenant only for explicit isolation checks. Capture IDs and fixture dates in a private local note, not in this ZIP. Do not give Student or Parent staff finance grants to make a screen appear.
5. The existing `apps/api/scripts/seed-demo.ts` was inspected but **not executed**. It creates a compact manager-only fixture and draft records, uses a local test credential, and cannot supply the six-actor demonstration. It accepts only a loopback `educore_demo_*` database but has no full multi-actor admission workflow. Do not treat it as a full demo seed.

## 2. Guided actor sequence

For each row, use a fresh login or a deliberately selected tenant; show the network response/receipt or a read-only state. Never call a review modal a committed operation.

| Actor and path | Action and expected visible evidence | Classification |
| --- | --- | --- |
| Manager: AU01→AU02→G01 | Log in, select the demo tenant; show exactly three scoped KPIs, with unavailable distinct from zero. Switch tenant and show prior data removed; log out and confirm protected route denies access. | **Read-only** except session selection/logout. R9 Edge academic tenant-switch and web tests cover this behavior. |
| Manager: OP01→OP02→OP03 | Create a synthetic member, assign/revoke a scoped role, create then verify a Parent→Student link. Re-read the server response and current grant/link state. | **Committed** only after successful HTTP response and subsequent read. R4 native coverage; a full manual sequence remains to be run. |
| Academic Staff: AC01/AC05/AC07/AC08 | Inspect/create catalog, class, teacher assignment and enrollment using current scoped permission; show class roster and placement evidence. Open a transfer request, then show confirmation unavailable. | Reads plus **committed** allowed writes. `TRANSFER_CONFIRM` is **unavailable by policy**. R9 Edge academic journey covers a subset. |
| Academic Staff: SC01→SC03→SC05→AT01→AT02 | Create a draft session, preview resource conflicts, explicitly confirm, then mark and finalize an eligible session. Show denied conflict and locked attendance states. | Preview is **read-only**; confirmation/finalization are **committed** after receipts. R9 Edge schedule/attendance journeys passed. |
| Teacher: PO01→AS01→AS05 | View assigned classes, publish one synthetic assignment, review a submitted version, save a grade draft then publish. Show Student cannot see the draft. | Published assignment/grade are **committed**; draft is private. R5 native and R9 Edge assignment journey passed. |
| Student: PO02→AS06→AS07 | View own published work, submit synthetic text/file only to own recipient, then view the published grade. Open personal schedule and leave request where authorized. | Submission/leave request are **committed** only on server acknowledgement; other views **read-only**. R5 native and R9 Edge cases passed. |
| Parent: PO03→PO04 | Select verified child A, inspect child learning and published grade; select child B and verify A disappears; revoke a link and show denial. | **Read-only** child learning; link revocation is staff **committed** action. R9 Edge two-child and delayed-response cases passed. |
| Accountant/eligible finance staff: BL03→BL05→BL07→BL09→BL10→OP05 | Start/review a closed-period generation from existing eligible source; issue only reviewed draft; manually verify a synthetic CASH/BANK_TRANSFER top-up; pay an ISSUED invoice from wallet; request a downward adjustment; show `APPROVED` with no effect, then explicit execution and one receipt/net-excess internal credit. | Generation, issue, top-up, wallet payment, request, decision, execution are separate **committed** operations. BL09/BL10 R9 Edge chain passed under an eligible finance actor; an independent Accountant browser login was not separately exercised. |
| Parent/Student: PO05 | Attempt permitted child/self billing read. Show a safe unavailable/forbidden state if current catalog/link does not grant that specific finance read; do not expose staff wallet ledger. | **PARTIAL read-only**, no Parent/Student financial mutation. |
| Authorized Manager: GL01→OP06→OP07 | Show a committed notification, scoped audit correlation and eligible job state/attempts. Retry only an eligible failed job with an explicit authorized request; distinguish queued/running/failed/completed. | Inbox/audit **read-only** except mark-read; retry **committed** only on server receipt. R4 revoked-worker alert case failed, so avoid claiming all alert delivery works. |

Use a **closed** billing period and an already eligible, finalized source for the financial sequence. The R4 native fixture creates such synthetic historical sources within its admitted test transaction; this runbook does not authorize backdated manual writes to manufacture a bill. Each financial UI action needs fresh current permission/resource scope, an idempotency key, explicit confirmation and a persisted result. Never show `APPROVED` as `COMPLETED` before execution; never use a Preview fixture as a finance receipt.

## 3. Visible unavailable and preview states

- `AC09` transfer confirmation: policy-blocked until approved finance classification/handoff exists. A request alone does not transfer enrollment.
- PO05 Student finance and Parent/Student wallet reader: **PARTIAL**, show server-authorized data only; denied scope is a valid safe unavailable demo outcome.
- Legacy/mixed invoice wallet adoption, external refund, gateway, auto-approval, P1 reminders/makeup: unavailable.
- Development `/__ui-preview/...` screens are synthetic UI **Preview**. Production `main.tsx` gates that import on `import.meta.env.DEV`; preview dialogs and fixtures are not committed operations.

## 4. Evidence to retain locally after an actual guided session

Record the demo tenant ID, synthetic actor role/scope, route, operation key, HTTP status, server receipt ID, before/after authoritative values and timestamp in an access-controlled owner note. Redact tokens, cookies, OTPs, connection strings and personal data. Until that guided session is actually run, mark its steps **NOT RUN**; the native and Edge test evidence in the matrix is the reproducible evidence currently available.
