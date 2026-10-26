# R9.4 release test matrix — 27 October 2026

Target commit `f2691ae` (merged R9.3 on `origin/main`). Working branch is `test/r9-04-release-candidate`; the requested `chore/r9-04-release-candidate` branch was not created. All native runs used distinct newly admitted local PostgreSQL 16 Docker containers. This is current-checkout evidence; R9.1–R9.3 review archives were not present in tracked files.

| Gate actually executed | Result | Selected / total / skipped | Evidence and limits |
| --- | --- | --- | --- |
| `pnpm.cmd install --frozen-lockfile --offline` | PASS | N/A | Existing local cache; lockfile unchanged. Fresh empty-cache/network install NOT RUN. Initial sandbox attempt was blocked by pnpm store lock permissions; authorized rerun passed. |
| Prisma validate and generate | PASS | N/A | Current schema valid, client generated. |
| Migration manifest | PASS | 1 / 1 / 0 | Offline Vitest. |
| Web component/static suite | PASS | 290 / 290 / 0 | Node test runner, including tenant/child stale-state and keyboard cases. |
| Web production build | PASS | N/A | TypeScript and Vite production build. |
| Web lint | PASS with 11 warnings | N/A | Exit 0; existing React effect/dependency warnings remain. |
| API offline unit/static | PASS | 102 / 102 / 0 | 16 test files. |
| API offline E2E | PASS | 1 / 1 / 0 | Does not replace native/browser journeys. |
| R1b offline | PASS | 14 / 14 / 0 | Static. |
| R1b WASM | PASS | 15 / 15 / 0 | PGlite smoke, no server concurrency claim. |
| API repository typecheck, before fix | FAIL | N/A | Four R9 browser callbacks returned boolean instead of `Promise`; TS2322. |
| API repository typecheck, after fix | PASS | N/A | `tsc --noEmit --allowImportingTsExtensions`. |
| API production build and lint | PASS | N/A | Nest build, type-aware oxlint. |
| R1b native | PASS | 39 / 42 / 3 | `educore-r1b-native-4e510b1f77ae430caebe4ee319329ed9`; evidence `educore-r1b-pg-evidence-vlohyN`. |
| R2 native | PASS | 59 / 59 / 0 | `educore-r2-native-23cbe280b5d54e329c8c5f60c26ea514`; evidence `educore-r2-evidence-Gxq8CB`. |
| R3 native | PASS | 56 / 56 / 0 | `educore-r3-native-2bd2cd5566674fa5b495e0b4aa47ef14`; evidence `educore-r3-evidence-36o3Dr`. |
| R4 native, original full run | FAIL | 156 / 157 / 1; 153 pass, 3 fail | `educore-r4-native-43cda50e494049eea13817b4f508c8ef`; evidence `educore-r4-evidence-9Tdpus`. A second R8-only file also had a suite setup error (`DISPOSABLE_REQUIRED`) because the R4 config selected it despite its separate admission contract. Failures: stale BL09 expectation, OTP enumeration timing condition, revoked-worker alert count. |
| R4 H01 focused, first fix | FAIL | 1 / 156 / 155 | Fresh `educore-r4-native-189de65139e5415596cb15df9fd84a64`: the second BL09 expectation was stale too. |
| R4 H01 focused, complete fix | PASS | 1 / 156 / 155 | Fresh `educore-r4-native-84206042425040ccb79e7d0fc46dd4a6`; evidence `educore-r4-evidence-RfCgfY`. Does not clear the full R4 gate. |
| R5 native | PASS | 44 / 44 / 0 | `educore-r5-native-f686af7328c84adea26b0708d6aaee4a`; evidence `educore-r5-evidence-JUPaQ8`. |
| R6 native | PASS | 13 / 13 / 0 | `educore-r6-native-e1f9a2369aa1472ca6976778611f082a`; fresh migration/restore targets managed by runner. |

R4's Edge journeys **did execute** in the failed full run. Its evidence records R9.2 parent two-child/revocation, delayed-child race, teacher/student assignment lifecycle, schedule/conflict, attendance/leave, tenant switch, and R9 F-B01–03 financial lifecycle, revoked execution, tenant isolation as PASS. The finance browser case records one adjustment, one root receipt, a 100000 VND credit and 700000 VND final allocation. Desktop academic viewports included 1280×800; mobile academic cases used 390×844. Finance browser viewport was not explicitly resized in the test. Web jsdom tests cover mobile navigation and focus behavior, but this is not a separate mobile financial browser pass.

**R4 failures retained:** H01 was a test expectation left behind by the approved BL09 navigation addition and is fixed/verified only in the focused run. The OTP benchmark had equivalent headers and point median differences under 0.2 ms, but its `slow_reject` and `concurrency_four` statistical acceptance conditions failed; no lucky rerun or threshold relaxation was used. Revoked-worker C03 correctly failed the job without a business receipt and wrote a `JOB_FAILED` audit, but expected unread `ADMIN_ALERT` count was zero after dispatch. Root cause and user impact are unresolved. The separate R8-only file is now excluded from R4 configuration; its own admission suite was NOT RUN here. The current edited checkout has **no post-fix full R4 PASS**.

All container/evidence identifiers above refer to local retained disposable resources. The original checkpoint package contained no credentials, raw database dumps, or evidence JSON. One failed native gate prevented an RC-ready conclusion at that checkpoint.

## Regression gate closure follow-up — 27 October 2026

Baseline is the owner's committed checkpoint `6b24f86`; the follow-up source/test edits are uncommitted and packaged for review. The table above remains the **historical checkpoint**, including its failures. Aggregate-only current evidence is in `R9_04_GATE_CLOSURE_EVIDENCE.json`; see `R9_04_GATE_CLOSURE_ANALYSIS.md` for the two root-cause assessments.

| Current task gate and exact command | Result | Selected / total / skipped | Fresh evidence |
| --- | --- | --- | --- |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests -TestFilter 'R8 C03 preregistered account enumeration timing protocol'` | FAIL | 1 / 156 / 155 | `educore-r4-native-983e138e1450406fa20f1b092a245a01`, `educore-r4-evidence-mPLopX`; healthy AUC lower CI below 0.45. One diagnostic run, not a lucky rerun series. |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r8-scheduling-attendance-native.ps1 -RunTests` (first version) | FAIL, no tests selected | 0 selected; total/skipped not enumerated | Fresh `educore-r8-scheduling-native-37fb56620f6c4d41b62accfe34e9cb6f`; 50 migrations applied, Vitest default `*.spec.ts` excluded the `.postgres.test.ts` file. |
| Same R8 command after dedicated config | PASS | 1 / 1 / 0 | **New** `educore-r8-scheduling-native-818e091d30334fa18f2988a2660780e1`; 50 finished migrations, zero failed migrations, zero tenants before test; real HTTP scheduling/attendance journey passed. |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests -TestFilter 'C03 revoked worker intent fails without business effects'` | PASS | 1 / 156 / 155 | `educore-r4-native-07134df3a7c24a30969ff8f97cc4246b`, `educore-r4-evidence-WjILwC`; target alert created once, delivered in one dispatch, one authorized unread recipient, zero revoked-initiator notifications. |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests` | **FAIL** | **156 / 156 / 0; 155 pass, 1 fail** | Fresh `educore-r4-native-116cfa6758064d39846bfc9e2509d0be`, `educore-r4-evidence-HBfZiP`. OTP C03 four-concurrent AUC lower CI was 0.43669 (<0.45). Revoked-worker C03 passed and required **two** dispatches. Edge R9 F-B01/02/03 and academic browser cases passed; browser skips **0**. |
| `pnpm.cmd --dir apps/api test` | PASS | 102 / 102 / 0 | 16 offline files, current follow-up checkout. |
| `pnpm.cmd --dir apps/api test:e2e` | PASS | 1 / 1 / 0 | Offline E2E, current follow-up checkout. |
| `pnpm.cmd --dir apps/api exec tsc --noEmit --allowImportingTsExtensions`, `pnpm.cmd --dir apps/api build`, `pnpm.cmd --dir apps/api lint`, `git diff --check` | PASS | N/A | Current follow-up checkout. |

Web tests/build, hosted GitHub CI, guided six-actor demo, mobile financial browser and deployment rehearsal were **NOT RUN** in this follow-up. R1b/R2/R3/R5/R6 native suites were also **NOT RERUN**: the current changes are R4 test verification, standalone R8 runner/configuration and documentation only; no production SQL, auth, finance, shared frontend or API behavior changed. Prior PASS evidence above remains tied to its earlier tested checkout. The full R4 FAIL keeps the automated regression gate **PARTIAL**.
