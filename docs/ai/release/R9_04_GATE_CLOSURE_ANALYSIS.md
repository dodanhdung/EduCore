# R9.4 regression gate closure analysis — 27 October 2026

Baseline: committed `6b24f86` on `test/r9-04-release-candidate`. This task changes only R4 test verification and adds a dedicated R8 runner/configuration and release evidence. No production auth, SQL, permission, financial, or worker behavior was changed. Exact sanitized numbers are in `R9_04_GATE_CLOSURE_EVIDENCE.json`; the original full failure remains in `R9_04_TEST_MATRIX.md`.

## Gate A: OTP account-enumeration timing — unresolved

The R8 C03 test sends 400 known and 400 unknown OTP requests in **each** of `healthy`, `slow_reject`, and `concurrency_four`. It makes 100 blocks of eight requests, two waves of four, balances each slot at 50 known requests, randomizes complementary orders with a fixed seed, and uses 10,000 block-bootstrap resamples. Acceptance requires the whole 95% AUC interval within `[0.45,0.55]`, the whole median-difference interval within ±10 ms, and the whole p95-difference interval within ±25 ms (the calculated limits in these runs). Response status, body, cache headers, content type, and cookie/retry headers must match. No samples, conditions, limits, or result values were changed.

`AuthController.otp` registers a common 100 ms response floor before account-dependent SQL, then uses the restricted auth connection for throttling, readiness and `request_recovery_otp`. The known account path locks an active User and may append OTP/delivery rows; an unknown address returns false. The separate recovery worker claims and sends asynchronously through its restricted connection. The service path is consistently slower for known accounts (about 1.1–1.3 ms at the median), while HTTP medians remain near 108 ms and usually differ by less than 0.21 ms. This shows the floor masks the measured normal service difference in these fixtures; it does **not** establish absence of a side channel under every load or deployment.

| Current diagnostic run | Healthy AUC point [95% CI] | Slow reject | Four concurrent | Result |
| --- | --- | --- | --- | --- |
| Original full (`educore-r4-evidence-9Tdpus`) | 0.50649 [0.47840, 0.53470] | 0.47336 [0.44069, 0.50475] | 0.47668 [0.44936, 0.50342] | FAIL in slow reject and concurrent |
| Fresh focused (`educore-r4-evidence-mPLopX`) | 0.47411 [0.44698, 0.50045] | 0.48890 [0.45525, 0.52214] | 0.50080 [0.47392, 0.52822] | FAIL in healthy |
| Fresh complete R4 (`educore-r4-evidence-HBfZiP`) | 0.48866 [0.45556, 0.52205] | 0.49156 [0.46062, 0.52279] | 0.46872 [0.43669, 0.50103] | FAIL in concurrent |

Every run retained 400/400 samples per condition, exactly 50 known in each of eight slots, and response-shape equivalence. In all three runs, median and p95 intervals met their unchanged limits; AUC interval alone failed, in different conditions. HTTP p95 changed substantially between the original and fresh focused environments, while service p95 stayed in single-digit milliseconds. The evidence does not support unequal slots, a reproducible same-condition known/unknown HTTP shift, or a demonstrated defect in the AUC/bootstrap arithmetic. Database and Node scheduling, connection contention, and background-worker interference remain plausible contributors to observed jitter, but these runs do not isolate one of them as the cause. The known-path service difference is real and should remain visible in the evidence.

**Owner decision needed:** The current equivalence definition has repeatedly failed near a confidence boundary even when point estimates stay close to 0.5. Changing its threshold, interval, sample design, or stratification is a security acceptance decision; no such change was made. A proposed follow-up is to preregister a statistical power/error analysis and a controlled measurement plan that separates HTTP scheduling, auth-pool and worker effects before approving any revised method or production change. Until then, Gate A is **FAIL/UNRESOLVED**, and no favorable focused run may clear it.

## Gate B: revoked-worker ADMIN_ALERT — closed as test sequencing

`perform_job` rechecks the initiating session/permission after claiming a lease. When the role is revoked, it records a FAILED attempt and `JOB_FAILED` audit, omits a successful business `R4:JOB` receipt, and calls `job_alert`. That function inserts one `ADMIN_ALERT` outbox event with key `JOB:<jobId>:<fence>:FAILED` and only `{jobId,status}` payload. `can_event` requires **both** current `job.read` and `notification.read`; `inbox` rechecks live authority. `dispatch_event` returns after **one** eligible event, even if earlier events are queued. The original test called it once and immediately checked unread count, without proving it had selected this job's alert.

The revised C03 test checks exactly one event, its key, safe payload and eligibility; verifies the Manager's two grants; dispatches only up to the snapshot count of eligible queued events; and verifies that the target event reached DONE, created exactly one notification tied to that event for the authorized Manager, created none for the revoked initiator, and is visible as the exact inbox item. It retains the no-business-receipt and `JOB_FAILED` assertions. No role grant, SQL dispatcher, or worker implementation changed.

Fresh focused R4 passed **1 selected / 156 total / 155 skipped**, with the target reached in one dispatch. Fresh complete R4 passed the same C03 case and needed **two dispatches**, directly confirming a preceding queued event caused the original one-call failure. The original FAIL remains historical evidence. This closes the test sequencing defect for the approved contract; deployed notification delivery is a separate operations gate.

## Gate D and regression status

No safe dedicated R8 runner existed. A new runner checks local Docker context, new container identity/label, loopback port, anonymous volume, empty PostgreSQL 16 catalog and conflicting roles before migration. It applies the current chain, requires 50 finished migrations, zero failures and zero tenants, then supplies the test's fixed `educore_r4_r8` admission only inside its process. The first runner attempt executed **zero tests** because Vitest default selection was `*.spec.ts`; the added dedicated config corrected selection. A **new** cluster then passed the complete standalone R8 file **1/1, 0 skipped**, including real HTTP scheduling, conflict, scoped Parent leave read and attendance finalization. No prior database was reused.

The current full R4 run passed **155/156, 0 skipped**; OTP C03 alone failed. R9 F-B01–03 Edge finance cases passed, as did the academic browser and worker cases. API offline unit 102/102, E2E 1/1, typecheck, build, lint and `git diff --check` passed. No frontend/shared contract, migration, or production SQL changed; web and native R1b/R2/R3/R5/R6 were **not rerun in this task**. The prior checkpoint's passes remain historical evidence at its tested source state, not new verification.

## Release dimensions

- Automated regression: **`R9_04_REGRESSION_GATE_PARTIAL`** because Gate A and the full R4 suite fail. Gates B and D are closed with fresh evidence.
- Overall candidate: **`R9_04_RC_PARTIAL`**. Guided six-actor demo, mobile finance browser verification, hosted CI, target deployment rehearsal and policy-blocked PO05/transfer/legacy finance work remain separate and not run or approved here.
