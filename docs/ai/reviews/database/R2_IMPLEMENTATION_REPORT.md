# R2 Implementation Report — draft for review

Date: 2026-10-19. Scope: approved Full R2 implementation, local draft only. **R2 IMPLEMENTED — POSTGRESQL VERIFIED — READY FOR REVIEW.** This verdict covers the internal billing/financial command slice and the evidence below; it does not close H-04, complete R3/R4, or establish API/production readiness.

## A. Executive Summary

Implemented immutable billing generations, tenant-local session-date pricing, explicit recompute, invoice issuance, manual approval followed by explicit financial execution, student wallet funding/payment/refund/reversal and scoped financial reads. Real Nest services invoke restricted PostgreSQL commands within Prisma transactions. New SQL constraints, immutable histories, reconciliations and common locks protect effects independently of caller retry keys.

Final results: **57 R2 native tests passed; 39 R1b native regressions passed, with 3 explicitly unverified/deferred cases; 33 default offline/WASM/unit/scaffold tests passed. Total: 129 passed, 0 failed.** R2 includes 35 observed independent-connection lock schedules; the separate R1b run records 32. Prisma validation is not used as evidence for those concurrency claims.

The owner approved this turn: local issue-year numbering `INV-{year}-{sequence at least 6 digits}`, separate tenant/year counters without gapless guarantees; due time at the same local wall time seven calendar days later, overdue only at `now > dueAt`; both full Payment reversal and invalid TOP_UP reversal require **manual approval, then explicit execution**. No Decision Register status was edited. One rare unresolved business branch is nonexistent local due time during a DST gap: ISSUE fails atomically pending a policy.

## B. Verified Baseline

Working tree and index were clean at start. HEAD: `fd01a7a9353543dd0dfaf1abc413c166126fbfa9`; branch: `feat/prisma-p0-schema`. Baseline snapshot: `C:\Users\Admin\AppData\Local\Temp\educore-r2-before-9U9m7h`, containing a SHA-256 file manifest, original schema and empty tracked/staged diffs. No existing changes were discarded.

Sources read: `AGENTS.md`, `docs/ai/PROJECT_CONTEXT.md`, Requirements v5 (relevant FR/BR/Q and wallet amendments), UC-21–26/34/37, accepted architecture, database/detailed/API specifications, related billing/workflow/jobs/reporting/IAM/tenant-policy/audit/scheduling class designs, Decision Register and the database review documents linked below. Actual filenames are `docs/design/api_specification.md` and `docs/design/class design/`. Requirements and working-branch amendments take precedence over historical proposals.

- [O-12 proposal and current acceptance matrix](O12_DECISION_PROPOSAL.md): approved A=A, B=B1, C=C1, D=D; local session date, local-start month, frozen timezone, immutable retry/new generation.
- [Wallet business choices and W01–W36](WALLET_P0_SIMPLIFICATION_PROPOSAL.md): approved B1–B5; cash-backed wallet, explicit collection, exact excess refunds, no prepaid/P1 or automatic cash-out.
- [Remediation plan](SCHEMA_REMEDIATION_PLAN_P0.md), [R1a report](SCHEMA_REMEDIATION_R1A.md), [R1b plan](R1B_IMPLEMENTATION_PLAN.md), [R1b report](R1B_IMPLEMENTATION_REPORT.md): retained as historical/source evidence, not rewritten to claim new passes.
- Direct owner replies in this task supply O-02/O-03 and reversal authority approval. Engineering selections below remain implementation choices for review, not retroactive approval of every old technical proposal.

Baseline schema: 62 models/28 enums. Current draft: **67 models/28 enums**. R1a/R1b migrations retain original bytes:

| Migration                    | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `202610190001_r1a_baseline`  | `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20` |
| `202610190002_r1b_integrity` | `028fb6ffe8c05aed978a44da980df764020be94b7c20a296dff69a91f440bb76` |

## C. Files Changed

Seven existing files changed and twelve files added. Paths below are relative to the repository root; directory shorthand expands exactly to the named files.

| File                                                                           | Change / purpose                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `apps/api/package.json`                                                        | Modified: native/unit scripts; move existing adapter dependency to runtime dependencies     |
| `pnpm-lock.yaml`                                                               | Modified: corresponding dependency classification, same adapter version                     |
| `apps/api/prisma/schema.prisma`                                                | Modified: R2 models, relations, keys, financial precision                                   |
| `apps/api/test/schema-integrity/r1b-static.spec.ts`                            | Modified: evolved model count; preserve baseline migration hashes and constraint assertions |
| `apps/api/test/schema-integrity/r1b.postgres.test.ts`                          | Modified: discover appended migrations/model count while retaining semantic regressions     |
| `apps/api/test/schema-integrity/support.ts`                                    | Modified: initially cancelled fixture option; no past-cancellation privilege bypass         |
| `apps/api/test/schema-integrity/start-r1b-native.ps1`                          | Modified: wait for final TCP PostgreSQL server                                              |
| `apps/api/prisma/migrations/202610190003_r2_billing_wallet/migration.sql`      | New: commit WALLET enum addition before its use                                             |
| `apps/api/prisma/migrations/202610190004_r2_financial_integrity/migration.sql` | New: transactional schema, SQL commands, permissions, history and financial constraints     |
| `apps/api/src/billing/billing-calculator.ts`                                   | New: exact VND/BigInt, final HALF_UP calculation                                            |
| `apps/api/src/billing/billing-services.ts`                                     | New: GenerationService, InvoiceLifecycleService, FinancialCoordinator, WalletService        |
| `apps/api/src/billing/r2-repository.ts`                                        | New: Prisma transaction boundary, parameterized commands, recovery/read adapters            |
| `apps/api/src/billing/billing.module.ts`                                       | New: explicit internal Nest module registration; no controllers                             |
| `apps/api/test/r2/calculator.spec.ts`                                          | New: exact rounding/range/zero-charge tests                                                 |
| `apps/api/test/r2/r2.postgres.test.ts`                                         | New: actual Nest/Prisma/native PostgreSQL integration and races                             |
| `apps/api/test/r2/start-r2-native.ps1`                                         | New: fresh disposable local PostgreSQL setup/admission                                      |
| `apps/api/vitest.config.r2.ts`                                                 | New: explicit native test configuration                                                     |
| `apps/api/test/r2/README.md`                                                   | New: safe execution, failure recovery and limits                                            |
| `docs/ai/reviews/database/R2_IMPLEMENTATION_REPORT.md`                         | New: this review report                                                                     |

No Requirements, UC, design, API specification, Decision Register, R1a/R1b report, frontend or Figma files changed. No application root mounting or public financial endpoint was added.

## D. Prisma & Migration Inventory

New models: `BillingRunGeneration`, `WalletAccount`, `WalletTransaction`, `InvoiceNumberCounter`, `R2PrincipalBinding`. `PaymentMethod.WALLET` is appended. `BillingRun.currentGenerationId` has a typed composite FK including tenant/run/student/period identity; generations have immutable snapshots, sequence, operation key/hash, base lineage and policy reference. Wallet/account/payment/reversal relations enforce matching owners and sources.

`Invoice.financialRevision` supports obligation concurrency. `ReceivableAllocation` becomes signed history: one positive PAYMENT allocation per payment, negative RELEASE rows linked to wallet refund/reversal transactions. Its former one-row-per-payment uniqueness is replaced by a partial unique index for the positive base. Payment's inverse relation becomes plural. Unique approval/root and wallet source/receipt/reversed-top-up keys prevent alternative-key duplication. `IdempotencyRecord.resultSnapshot` stores the replay response.

`InvoiceDiscount.rawDiscountDecimal` becomes `NUMERIC(24,6)`. Proof: BIGINT max `9223372036854775807` × 10% = `922337203685477580.7`, requiring 18 integer digits plus 6 fractional digits. Native G17 stores `922337203685477580.700000` exactly. Integer money and balance bounds remain enforced; wide intermediate arithmetic does not permit an out-of-range persisted result.

Migration 003 contains the enum addition; 004 wraps financial changes in a transaction. A preflight rejects existing billing runs/invoices/payments/adjustments with `R2_LEGACY_ADOPTION_REQUIRES_REVIEW`. **This is verified fresh-development deployment, not populated financial adoption.** Historical balances, allocations, receipts and excess cases need a separately reviewed inventory/backfill/reconciliation protocol.

004 adds ownership/source/sign/amount checks, partial uniqueness, typed generation lineage, immutable history triggers, price-window/history protection, financial reconciliation and narrow command permissions. PostgreSQL-only constraints/functions are not represented fully by Prisma; native catalog assertions complement schema drift comparison.

Actual failure exercise: inject division by zero before 004 COMMIT, run Prisma deploy, prove R2 tables/roles absent after rollback, establish SQLSTATE `22012` by direct execution of the same faulty SQL, then use supported `migrate resolve --rolled-back` on that failed attempt and deploy the original migration. Prisma 7 can mask the initial error with transaction-aborted output and leave failed-row logs null; neither is treated as rollback proof. Final R2 target has four finished migrations plus the retained rolled-back 004 attempt. No mark-applied, manual history rewrite or adoption shortcut.

## E. R2-A — Generations & Pricing

Source date/month derive from session start in the frozen tenant timezone; DATE effective windows are `[effectiveFrom,effectiveTo)`. Price precedence is SESSION → CLASS → COURSE. Neither draft creation month nor current clock selects historical tuition. Capture validates enrollment/session inventory, original class/course lineage, confirmed same-session attendance, approved leave for EXCUSED and scoped sibling evidence. CANCELLED has zero units without fabricated attendance, but still requires an eligible tariff. Missing facts/tariff yield NEEDS_INFORMATION rather than implicit zero or partial valid billing.

Initial operation creates G1 and a DRAFT projection only when complete. Same key/hash replays the durable original result with fresh authorization, without source recapture, policy reselection or pointer reset. Explicit recompute requires a new key, reason, expected base and expected applied generation. It creates immutable G2, pins its policy, captures new evidence and atomically applies a same-invoice projection with CAS. Old generation snapshots remain. An incomplete newer generation is retained but blocks ISSUE. No generic worker or pending-generation framework was introduced.

Snapshots contain source identity, lineage, local date/month/timezone, price and policy evidence, amounts and relevant source/eligibility revisions. Generation result records include before/after totals and input-hash/change evidence. Safe future-only PriceRule window closure does not change captured historical price or spuriously invalidate it; the semantic fingerprint excludes that irrelevant change while immutable capture evidence retains it. Relevant historical edits are rejected or make source checks fail.

SQL exact arithmetic is independently checked by the TypeScript calculator **inside the transaction before commit**. Money crosses JSON as strings. HALF_UP occurs once at invoice final amount; two gross-5 lines with sibling 10% produce net 9, not 10. Policy pinning follows BR-14; no combo, prepaid or P1 discount was added.

## F. R2-B — Invoice Lifecycle & Approval

ISSUE checks latest/current/applied generation, source completeness/fingerprint, line identity and arithmetic before creating immutable snapshots, permanent claims, number, dueAt and audit atomically. No wallet debit occurs on draft creation, recompute or ISSUE. Number year comes from tenant-local issue time sampled after locks. Sequence is tenant/year, padded to at least six digits and allowed to grow. Cancellation retains number, source claims and issued basis.

DueAt is the same local wall time plus seven calendar days, resolved once and stored immutably. Tests cover local year rollover, leap day, and 167/169-hour DST weeks. If the target local time does not exist, ISSUE rejects with `DUE_LOCAL_TIME_GAP_REQUIRES_POLICY`; no silent shift. For repeated wall times PostgreSQL's standard-offset resolution is the current technical choice. Overdue comparison remains strictly `now > dueAt`; no reminder/job feature was added.

Approval is deliberately two transactions: D1 commits the immutable decision as APPROVED; E1 freshly authorizes, verifies its obligation hash/version and executes the effect. E1 creates the root receipt and COMPLETED with financial changes/audit in one transaction. A failed E1 retains D1 APPROVED and rolls back all effects. Approved payload cannot be edited to fit changed obligations. Payments may change before execution: they do not change the approved tuition obligation; refund is derived from the latest remaining allocations under locks.

Separate approver preference is enforced; sole eligible Manager self-approval is allowed with explicit self-approval audit evidence. Full Payment reversal and invalid TOP_UP reversal use the same manual D1/explicit E1 authority chosen by the owner. Root uniqueness prevents a new caller key executing one approved obligation twice.

After an execution error, a fresh-authorized durable outcome lookup returns a committed root if present; otherwise it records deduplicated factual `EXECUTION_NO_EFFECT` evidence after rollback. It does not assert a failed effect from an unknown COMMIT response alone. Tests cover lost successful response via adapter fault injection, not every possible TCP/process failure.

## G. R2-C — Wallet & Financial Integrity

Manual verified CASH/BANK top-up creates a positive immutable wallet transaction and audit, with receipt/source and operation identity uniqueness. It creates no Invoice Payment/revenue. Explicit payment requires ISSUED same-student/cohort invoice, positive amount within current balance and outstanding, then atomically appends wallet debit, WALLET Payment and positive allocation. No automatic collection or negative balance.

For one invoice, `N = issued net + signed adjustments`, `P = sum(signed allocations)`, `outstanding = N - P`. After approved reduction/cancellation, `refund = max(P_before - N_after, 0)`. Deterministic LIFO distributes releases across payments; each negative RELEASE has an equal positive wallet credit. Reversed payments remain in signed allocation sums: **never filter reversed payments again after subtracting release offsets**.

Example verified: pay 800k, reduce to 700k, then 650k, increase to 900k, cancel to zero → credits 100k + 50k + 0 + 650k = 800k total. A full nominal reversal of the original 800k payment after a prior 100k refund credits only remaining 700k. After full cancellation/refund it records nominal reversal/audit with zero new credit and no zero-valued wallet transaction.

Invalid top-up reversal is full-original-only, unique by source, manually approved, requires current balance at least original top-up and preserves original receipt. Insufficient balance leaves APPROVED and no partial effect. Good payments are not reversed automatically to manufacture funds. Legacy/mixed funding or a conflicting legacy excess case blocks wallet execution pending reconciliation; no legacy settlement engine or cash-out exists.

Deferred SQL reconciliation checks balance = sum(signed immutable wallet transactions) ≥ 0, payment/debit/base-allocation identity and amounts, refund/release pairs, full top-up source identity, allocation remaining within nominal payment, and issued `0 ≤ P ≤ N`. Approved-to-COMPLETED transitions require effect receipt. Private transaction-local permit rows narrowly allow financial revision/cancellation without changing original issued basis. These are not caller-forgeable GUCs; final catalog asserts zero leaked permits.

Scoped reads return string amounts, current receivable/revision/asOf and at most 100 sanitized wallet history rows. Students/Parents cannot mutate money even with accidental financial grants. Reads require own student identity or a current verified parent link; internal evidence/receipt PII is omitted. Pagination and public DTO/transport contracts remain future API work.

## H. R2-D — Integration, Security & Concurrency

Actual Nest `BillingModule.register(connection)` wires concrete services/repository and PrismaPg; it is tested through Nest TestingModule, not mocked service arithmetic alone. Connection is explicit trusted composition input with no default DATABASE_URL fallback. Runtime command tests use restricted LOGINs, while a separate administrative fixture connection provisions baseline facts. No request actor GUC or caller-supplied source snapshot is trusted.

`R2PrincipalBinding` maps database `session_user` to persisted AuthSession. Operator-only provisioning is suitable for this internal/test boundary; **production pooled request/session identity handoff is not implemented**. A normal shared application LOGIN cannot select a user by changing an argument. The module is not mounted into AppModule; no route is claimed.

`educore_r2_owner` is NOLOGIN, non-superuser, without database/role creation or BYPASSRLS. Command principals cannot SET ROLE to it, read private tables/helpers, raw-write money/history or grant themselves scope. Owner grants are constrained; `UPDATE(id)` on users exists solely because PostgreSQL requires an UPDATE privilege for the chosen row lock, with no exposed arbitrary-user updater. SECURITY DEFINER functions use explicit search paths and revoked PUBLIC execution. Only `execute`, `summary`, `execution_outcome`, `receivable` are command entrypoints. Catalog tests inspect owner flags, every function's definer/search path/ACL and public/private grants.

Lock order: current User SHARE → Tenant gateway → Wallet → Invoice → relevant source/effect rows. Fresh session, tenant, permission and resource checks run after admission. Mutations use READ COMMITTED, preserving O-01/R1b ordering and fresh authorization. Source inventory/price/history guards share the tenant gate, including parent mutations and late-source insertion; ISSUE seals source completeness for its student/month. R3 authorized historical correction remains a separate workflow, not a raw DML bypass.

Repository transactions set lock timeout 3s, statement timeout 15s and transaction timeout 20s; deferred constraints are forced immediate before commit. Deadlock/serialization/lock timeout abort the entire attempt. Callers retry the same key/body after reconciling outcome; business conflicts/stale generations require new approved input, not an automatic fresh-price retry. No new generic retry scheduler was introduced.

Race tests observe real waiting via independent backend PIDs, then both commit/rollback outcomes: payments competing for invoice/wallet, receipt duplicates, recompute CAS, ISSUE, payment versus reduction/cancellation, duplicate approval execution, permission revoke, old replay versus G2 and source insertion versus G2/ISSUE. Late source after ISSUE is rejected. This proves those command schedules; it does not prove unfinished R3/R4 writers or every production IAM mutation.

## I. Technical Decisions

| Area               | Implemented choice                                                                | Authority / review boundary                                                 |
| ------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| O-02 / O-03        | Tenant/local-year number; non-gapless; seven local calendar days                  | Direct owner approval this turn; DST gap still rejected pending choice      |
| O-04               | Immutable JSON generations with typed base/current FKs; synchronous capture/apply | Technical implementation for review; no generic generation framework        |
| O-05 / wallet      | Signed releases plus exact excess wallet credits; deterministic LIFO              | Approved wallet business direction; concrete SQL/ordering reviewed here     |
| O-07               | Committed APPROVED D1, explicit atomic E1/COMPLETED                               | Manual approval/execution; failed effect is recoverable and root-idempotent |
| Reversal authority | Both full Payment and invalid TOP_UP require D1 then E1                           | Direct owner choice; reason/evidence/current rights retained                |
| Source authority   | Current persisted source facts, local date and full recheck                       | O-12 approved business rules; actual R3 producer workflows deferred         |
| Runtime boundary   | Bound restricted LOGIN/session, four SQL entrypoints, real Nest ports             | Internal implementation; pooled HTTP authentication needs R4 review         |
| Precision          | Wide exact intermediates; NUMERIC(24,6) raw discount                              | Proven against BIGINT max and native tests, no arbitrary business cap       |
| Migration adoption | Reject populated financial baseline                                               | Safety gate; no implicit conversion/backfill approval                       |
| Command placement  | SQL owns critical integrity; Nest orchestrates transactions/calculator            | More SQL to maintain; native ACL/catalog/race testing required              |

No entry in DECISION_REGISTER.md was changed to APPROVED.

## J. Tests Actually Run

| Command / check                                                                                                         | Actual final result                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm.cmd --dir apps/api exec prisma validate`                                                                          | PASS, current schema                                                                                |
| `pnpm.cmd --dir apps/api exec prisma generate`                                                                          | PASS, 67 models / 28 enums; generated output ignored                                                |
| `pnpm.cmd --dir apps/api exec tsc --noEmit`                                                                             | PASS                                                                                                |
| `pnpm.cmd --dir apps/api build`                                                                                         | PASS                                                                                                |
| `pnpm.cmd --dir apps/api test`                                                                                          | 33 PASS: 14 R1b static, 15 WASM smoke, 3 calculator, 1 scaffold                                     |
| Targeted type-aware oxlint and Prettier checks for changed TypeScript/config                                            | PASS; no outstanding warnings                                                                       |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r2/start-r2-native.ps1 -RunTests`                | 57 PASS, 0 failed; 35 observed R2 lock schedules                                                    |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/schema-integrity/start-r1b-native.ps1 -RunTests` | 39 PASS, 0 failed, 3 skipped/not verified; 32 observed R1b lock schedules on appended R2 migrations |
| Native Prisma schema diff                                                                                               | EMPTY; SQL-only guards/catalog checked separately                                                   |
| Migration fault / rollback / supported retry                                                                            | PASS on task-owned fresh targets; failed rolled-back history retained                               |
| `git diff --check`                                                                                                      | PASS; informational Windows LF/CRLF notices do not indicate failed checks                           |

Final R2 server: PostgreSQL **16.15**, Linux x86_64, real local Docker. Container `educore-r2-native-2f439ced1b6c464e87a88f2b031bf4d6`, loopback port 52893. Evidence: `C:\Users\Admin\AppData\Local\Temp\educore-r2-evidence-kCvp7M\evidence.json`; safe target metadata: `C:\Users\Admin\AppData\Local\Temp\educore-r2-native-2f439ced1b6c464e87a88f2b031bf4d6\environment.json`.

Final R1b regression target: container `educore-r1b-native-a455362db87147ecaa55bb948f472128`, loopback port 52894. Evidence: `C:\Users\Admin\AppData\Local\Temp\educore-r1b-pg-evidence-6eev3Q\evidence.json`; target metadata under matching `educore-r1b-native-...\environment.json`. Targets/volumes remain available; no existing R1b database was reused or deleted. Credentials are not included in this report.

R1b exceptions: T37 populated adoption remains BLOCKED; T41 runtime integration DEFERRED; T42 restore/tzdata exercise NOT RUN. They are not counted as passes. Earlier development failures (row-lock grant, invalid cancellation/transfer fixture, exact fault diagnostics) were corrected and re-run; no financial assertion was weakened and no failing required R2 test was skipped. The final independent runs above supersede intermediate diagnostic output without deleting it.

Native IDs: G01–17 generation/pricing; I01–04 issuance; W01–12 wallet; S01–04 access; C01–12 concurrency; F01–06 failures; D01–02 catalog/drift. **Native test W-numbers are not the historical wallet acceptance W-numbers**; the mapping below disambiguates them.

## K. Business Acceptance

PASS refers to the stated tested scenario, not an entire unimplemented API/workflow. PARTIAL identifies a missing exact subcase or producer/transport boundary. DEFERRED is not counted as a native pass. Source matrices retain their historical status; this new report supplies current evidence.

### O12-AC-01–27

| Acceptance | Evidence / result                                                              | Scope limit                                                                         |
| ---------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| O12-AC-01  | PASS G01/G06: September session uses September price/month despite later draft | Internal command                                                                    |
| O12-AC-02  | PASS G06: October source uses October date/window                              | Internal command                                                                    |
| O12-AC-03  | PASS G02/G08/G15: G2 retains source-date price and history                     | New policy may legitimately change eligibility/net                                  |
| O12-AC-04  | PARTIAL: per-line DATE resolution implemented; G06 tests windows               | Exact two distinct within-month prices totaling 220k NOT RUN                        |
| O12-AC-05  | PASS G06: overnight session attributed to local start month                    | No split                                                                            |
| O12-AC-06  | PASS G06: month start midnight inclusive                                       | Local boundary                                                                      |
| O12-AC-07  | PARTIAL: server derives price/date; no client snapshot input                   | Public DTO unknown-field HTTP 400 test DEFERRED API                                 |
| O12-AC-08  | PASS G08: captured historical price protected                                  | No authorized retroactive repair workflow                                           |
| O12-AC-09  | PASS G08: future publication/window closure preserves past captures            | Price authoring API not exposed                                                     |
| O12-AC-10  | PASS G01/G02/G15/C10: replay unchanged, rights/hash checked                    | No repin/reapply                                                                    |
| O12-AC-11  | PASS G02/G11/C04: explicit G2/CAS/reason, same invoice/history                 | Incomplete generation blocks issue                                                  |
| O12-AC-12  | PASS I01/W05: issued recompute forbidden, cancellation preserves history       | Corrections use approval commands                                                   |
| O12-AC-13  | PARTIAL G10/C11/C12: changed inventory stales issue, explicit G2               | Actual authorized attendance correction producer DEFERRED R3                        |
| O12-AC-14  | PASS G09: absent applicable tariff yields NEEDS_INFORMATION, not current/zero  | Historical repair requires review                                                   |
| O12-AC-15  | PARTIAL G16: persisted transfer intervals retain original lineage              | Actual TransferService DEFERRED R3                                                  |
| O12-AC-16  | PASS inherited native R1b timezone freeze/first-source races                   | Runtime timezone/IAM endpoints not claimed                                          |
| O12-AC-17  | PASS C04: one recompute CAS winner, commit/rollback                            | Two real connections                                                                |
| O12-AC-18  | PASS I01/G10: ISSUE rechecks current applied source and claims                 | No reprice on issue                                                                 |
| O12-AC-19  | PASS G06/G07: DATE bounds and invalid overlap                                  | No UTC month fallback                                                               |
| O12-AC-20  | PARTIAL G07: SESSION wins over CLASS/COURSE, overlap rejected                  | Resolver implements fallback; exact CLASS-after-SESSION-expiry vector NOT RUN       |
| O12-AC-21  | PARTIAL I01/W05 + R1b claim tests: permanent claims survive cancellation       | Exact cancelled zero-valued issued-line second-period vector NOT RUN                |
| O12-AC-22  | PASS G03/G11/G12: confirmation/approved leave/completeness required            | Facts produced by fixtures, not full AttendanceService                              |
| O12-AC-23  | PASS G05/G17/unit: gross5→net5; two gross5→net9                                | No combo/P1                                                                         |
| O12-AC-24  | PASS G06: UTC date differs from tenant-local date                              | SQL local-date authority                                                            |
| O12-AC-25  | PARTIAL G04/G09: cancelled zero units still need tariff                        | Explicit zero-valued ISSUE/permanent claim vector NOT RUN                           |
| O12-AC-26  | PASS G14 + inherited student FK tests: two students, distinct logical invoices | Same session tariff, separate ownership                                             |
| O12-AC-27  | PARTIAL C11/C12 + native R1b source/zone races                                 | Actual R3/R4 writers and exhaustive price-writer schedules remain integration gates |

### Historical wallet W01–W36

| Acceptance | Native evidence / result                             | Limit                                                                                         |
| ---------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| W01        | PASS native W01                                      | Manual verified top-up; no Invoice Payment                                                    |
| W02        | PASS native W01/C03                                  | Replay/hash conflict and new-key duplicate receipt                                            |
| W03        | PASS native W02                                      | Debit/payment/allocation equal                                                                |
| W04        | PASS native W04                                      | Insufficient balance rejects whole request                                                    |
| W05        | PASS native W03                                      | Explicit partial payment                                                                      |
| W06        | PASS native W02                                      | 800→700 gives refund100 exactly                                                               |
| W07        | PASS native W03                                      | Paid300, reduce100 gives no refund, due400                                                    |
| W08        | PASS native W05                                      | Cancellation releases remaining only, preserves claims/history                                |
| W09        | PASS native W02/C07                                  | Approval/root replay under new key cannot double-credit                                       |
| W10        | PASS C09                                             | Two invoices compete for one wallet                                                           |
| W11        | PASS C02                                             | Two payments compete for invoice outstanding                                                  |
| W12        | PASS F01/F02                                         | Injected failure rolls back complete financial effect                                         |
| W13        | PASS S01/D01                                         | Raw writes/private functions/owner role denied                                                |
| W14        | PASS S03                                             | Student cannot mutate even with accidental grant                                              |
| W15        | PASS native W07/F05                                  | Insufficient top-up reversal retains APPROVED/no partial credit                               |
| W16        | PASS I01/G02                                         | No automatic debit on generation/recompute/ISSUE                                              |
| W17        | PARTIAL G16                                          | Synthetic valid transfer intervals; actual transfer workflow R3                               |
| W18        | PASS G05/G17/unit                                    | Final HALF_UP, no prepaid/combo                                                               |
| W19        | PASS G02/G08/C10                                     | Generation replay/history/new recompute                                                       |
| W20        | PASS C06                                             | Pay vs adjustment/cancellation, both orders/rollback                                          |
| W21        | PARTIAL F01/F02/F04                                  | Atomic rollback and discarded committed reply; exhaustive network/crash faults NOT RUN        |
| W22        | PASS D01/native W05                                  | Reconciliation after repeated effects; no external cash-out                                   |
| W23        | PASS native W11                                      | Legacy/mixed funding blocked; no synthetic conversion                                         |
| W24        | PASS native W05                                      | 800→700→650→900→0 credits total800                                                            |
| W25        | PASS G13/G17/native W12/unit                         | Exact BIGINT/NUMERIC extremes; overflow whole-TX rejection                                    |
| W26        | PASS S03/S04                                         | Current own/verified-parent scoped sanitized reads                                            |
| W27        | PASS native W09                                      | LIFO refund200 from latest500 of payments300+500                                              |
| W28        | PASS native W06                                      | Nominal reversal800 after refund100 credits700                                                |
| W29        | PASS native W10                                      | Fully refunded cancelled payment reversal adds zero credit                                    |
| W30        | PARTIAL: conflicting legacy excess guard implemented | Exact pre-existing excess-case injection NOT RUN; mixed guard W11 and raw-write denial tested |
| W31        | PASS native W08/F05                                  | Full top-up reversal once, original retained, recovery                                        |
| W32        | PARTIAL S02/C08 + R1b revocation/global-user races   | Actual pooled HTTP IAM writers/membership integration R4                                      |
| W33        | PARTIAL G06/C11/C12 + R1b source/zone tests          | Full R3 source correction/rescheduling producers deferred                                     |
| W34        | PASS I01/I02/I03/I04                                 | Number/due atomicity; nonexistent due time rejected pending policy                            |
| W35        | DEFERRED R4                                          | No leased worker, attempt-five/requeue/fencing implementation or test                         |
| W36        | PASS F02/F03/F05/C07                                 | Committed approval, failed effect rollback, stale payload rejection, one retry root           |

### UC coverage and business boundaries

| UC    | Implemented / verified                                                          | Remaining boundary                                                                     |
| ----- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| UC-21 | Price/date/precedence/history guards and snapshots G01/G06–09/G17               | Price authoring REST/DTO and exact CLASS fallback subcase not complete                 |
| UC-22 | P0 verified sibling 10%, policy pinning and final HALF_UP tested G05/G15/G17    | P1 combo/configurable discount authoring remains out of scope                          |
| UC-23 | Closed-month draft, exact tuition, completeness, policy and G1/G2 tests         | Runtime attendance/enrollment producers R3; job orchestration R4                       |
| UC-24 | Source recheck, numbering/due/claims, atomic ISSUE, immutability I01–04         | Public issue endpoint and all transport ACs not claimed                                |
| UC-25 | Wallet top-up/pay/history/scoped reads, rollback/races/access                   | No public wallet routes; scoped read pagination/transport review pending               |
| UC-26 | Manual approval, adjustment/cancel/refund/payment and top-up reversal, recovery | No legacy excess conversion/cash-out; public endpoints pending                         |
| UC-34 | Financial D1/E1 authorization/decision/root/audit verified                      | Scheduling/other approval producers and complete module/API workflow deferred          |
| UC-37 | Durable financial idempotency, current authorization, outcome recovery          | Persisted job leasing, maximum attempts/fencing/manual job retry R4; not marked passed |

## L. Remaining Gaps & Gates

| Gate                             | Current evidence                                                           | Required before broader readiness                                                                              |
| -------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Business/design approved         | O-12/wallet baseline and owner replies above                               | Review concrete R2 implementation choices; resolve DST nonexistent-time branch if supporting such tenant dates |
| Schema implemented and validated | 67 models/28 enums; generate/typecheck/build pass                          | Reviewer approval of exact new schema/SQL diff; no inference of source-workflow readiness                      |
| PostgreSQL applied and tested    | Four migrations on fresh PG16; rollback/retry, drift, 57 R2 +39 R1b passes | Populated adoption, restore/tzdata exercise, independent delta review R6                                       |
| Runtime feature ready            | Internal Nest/Prisma/restricted command integration verified               | Approved HTTP contracts, production identity/pool handoff, R3 producers/corrections and R4 job/IAM integration |

H-04 remains **OPEN** for full source/parent/runtime integration and independent review, despite tested period/student/claims and concurrency guards. Actual attendance confirmation, transfer, roster/capacity, authorized past correction/reschedule are not implemented here. Tests consume persisted facts and cannot establish correctness of those future producers. Existing billed-source mutation guards were retained rather than disabled to simulate a complete correction workflow.

R4 worker attempts/leases/fencing/outbox delivery, public financial transport and deployed authentication are deferred. Current Login-to-session binding is a narrow internal boundary, not a production per-user connection scaling design. Ordinary application/worker roles do not receive a broad financial writer bypass.

Legacy financial adoption and mixed/external-payment disposition remain blocked pending inventory and reviewed conversion/reconciliation. No opening wallet balance is invented. Exact matrix gaps are identified above rather than converted to PASS from source approval or Prisma validation. DST gap ISSUE rejection is safe but requires a business policy before promising issuance for every timezone/date.

No additional installation is required to review or rerun the demonstrated local verification with the currently running Docker setup. Production deployment/configuration and broader runtime features are outside this verdict.

## M. Git Preservation

Baseline manifest and original empty tracked/staged snapshots are retained in the temporary directory in B. Original R1a/R1b hashes are unchanged. Only the seven existing paths and twelve new paths in C belong to this implementation. Requirements/design/register/original reports are preserved. Prisma generated files/build output and task credentials are not review source files.

No `git add`, commit, push, branch creation, PR or application deployment was performed by this agent. New files remain untracked for review. Native targets are task-owned local containers; they are retained without automatic deletion. No schema change was applied to a shared/production database.

Final preservation compared all 102 baseline files: exactly the seven allowed existing files changed, none missing, and exactly twelve new review files. HEAD is unchanged and index is empty. Current branch is `feat/billing-wallet-r2`, whereas the starting manifest records `feat/prisma-p0-schema`. Reflog records a checkout between these branches at the same HEAD at 2026-10-19 16:57:42 +0700; this agent did not issue that checkout. The observed branch change is preserved and is not reported as an unchanged-branch check. Results are in `final-preservation.json` in the baseline snapshot directory.

## N. Final Verdict

**R2 IMPLEMENTED — POSTGRESQL VERIFIED — READY FOR REVIEW.** Review the exact schema, both new migrations, command permissions/locking and internal Nest integration. Acceptance is scoped by K/L; deferred transport, IAM/jobs, R3 producer workflows, populated migration and independent R6 review are explicit. No request is made to reapprove settled Group A/O-12/wallet choices. Stop here for owner review; do not deploy or expand the slice automatically.
