# EduCore — Project Context (compact for AI agents)

**Version 1.0 · 2026-10-17 · APPROVED KIT BASELINE (not deployed)**

**Wallet amendment · 2026-10-19:** owner trực tiếp BUSINESS APPROVED B1–B5, minimal architecture PRINCIPLE ACCEPTED; [Register §G](DECISION_REGISTER.md#g-wallet-p0--owner-business-approval-2026-10-19). §10 là current business contract; historical Group A no-credit/direct-pay ở §4/9 được limited-superseded cho new wallet cohort. Q1–Q8 technical sign-off còn phải đối chiếu; code/test về sau không tự thay đổi authority.

**UI docs alignment · 2026-10-20:** `SCREEN_MAP.md`, `SCREEN_SPECIFICATIONS.md`, `DESIGN_TOKENS.md`, `UI_GUIDELINES.md` và `SCREEN_FLOWS.md` mô tả O-12/Wallet ở mức **PROPOSED per-screen UX**; vẫn cần review từng màn hình và đối chiếu Figma. Tài liệu UI không phê duyệt API/schema/implementation hoặc chứng minh runtime.

## 1. Product in 30 seconds

EduCore is a **multi-tenant learning-center management web app** for scheduling and resource conflicts, attendance/leave, monthly tuition/receivables, assignment/submission/grading, scoped user access, in-app notifications and a simple dashboard. Target P0: internal-first MVP with human approval where required; P1 is separately scoped.

**Actors/roles:** Manager, Academic Staff, Accountant, Teacher, Student, Parent. System Administrator is a separate platform actor with **no default cross-tenant access to students or finance**. One account can hold multiple tenant-scoped roles; role ≠ job position.

## 2. Source-of-truth lookup

| Why | Source file | How to read it |
|---|---|---|
| What, why, rules, priority | `docs/requirements/requirements_analysis.md` (v5 baseline + O-12 18/10 + Wallet v5.1 amendment 19/10 in current checkout) | Relevant FR/BR/Q; do not rewrite rules |
| Scenario and acceptance | `docs/requirements/usecase/specification.md` (v1.3 baseline + O-12/Wallet amendments in current checkout) | Relevant UC, alternative paths, AC; new AC are DESIGNED, not PASS |
| Accepted stack and boundaries | `docs/architectural/architectural_design.md` | Accepted decisions vs proposals |
| DB tables and constraints | `docs/design/database_design.md` | v1.1 after review; SQL migration validation needed |
| Logical class/service ports | `docs/design/class design/<module>.md` | Module in question only |
| Transaction/state implementation design | `docs/design/detailed_design.md` | Group A approved decisions + per-slice pending |
| External REST contract proposal | `docs/design/api_specification.md` | API v1 after group A; not live API |
| Routes/screens | `docs/ai/SCREEN_MAP.md` and `SCREEN_SPECIFICATIONS.md` | Canonical 71 design units with detailed per-screen card; UI routes/proposals, not business source |

**Version caveat:** `main` inspected on 17/10/2026 was a minimal frontend/backend scaffold with an older Requirements document; v5/design group-A updates were in a **separate PR #1**, not guaranteed merged. Each coding session must inspect the **current checkout**, not assume PR is integrated.

## 3. Accepted architectural decisions

- **pnpm workspace**; `apps/web` React + Vite + TypeScript and `apps/api` NestJS + TypeScript; **React Router, Tailwind, shadcn/ui, TanStack Query, React Hook Form + Zod** selected target stack but **not necessarily installed yet**.
- REST JSON/OpenAPI; PostgreSQL + Prisma; modular monolith; internal worker/transactional outbox in PostgreSQL (no mandatory Redis/Kafka). No commercial external business API P0 except OTP email.
- Vercel for frontend; Railway API/PostgreSQL + **private Railway Volume** for files; private download via authorized backend only.
- Global users vs tenant memberships; permissions checked fresh per operation; Tenant `TENANT/CLASS/STUDENT` scope. No user/teacher/parent can infer broad access from role label alone.

## 4. Approved group A on 17/10/2026 (design decisions, not runtime)

- Requirements **v5** source priority; 14 bounded contexts, vertical slices.
- Group A Database v1.1 historical design: **one invoice per student per tenant per month**, gộp class lines; positive excess as `payment_excess_resolutions`, no auto-refund/credit. Wallet B1–B5 later **limited-supersede** this handling for new pure-Wallet transactions after authorized adjustment/cancel execution. Legacy/mixed remains blocked pending separate policy/reconciliation.
- P0 permission catalog seeded, dynamic editor P1. Auth base `/api/v1/auth/…`, business base `/api/v1/tenants/{tenantId}/…`; list `{items,page,pageSize,total,asOf}`, `pageSize=20`, max 100; VND strings.
- Access token 15m in memory, rotated refresh token max 7 days via secure HttpOnly cookie with same-site web/API subdomains, Origin+CSRF on cookie-auth mutations (requires infra testing); OTP 15m, atomic reset+activation; Manager bootstrapped by controlled CLI, email OTP to set initial password, not temporary password.

## 5. P0 invariants useful for implementation/review

| Concern | Invariant |
|---|---|
| Schedule | `[start,end)`, teacher/room/student/unavailability conflicts, weekly series max 6 months, all-or-nothing confirm; cancelled releases bookings |
| Attendance | `ATTENDED`, `EXCUSED` (approved leave), `UNEXCUSED`; confirm batch; usual edit locks at 48h or invoice issue (earlier) |
| Billing | O-12: price and billing month from local session-start date at frozen tenant timezone; SESSION>CLASS>COURSE, `[from,to)` PriceRule window; pinned calculation policy, retry same generation, intentional DRAFT recompute creates new generation, ISSUED immutable. Wallet: verified CASH/BANK_TRANSFER TOP_UP separate from invoice Payment; explicit WALLET payment on ISSUED; authorized execution credits only net excess with signed releases. Legacy/mixed separate; sibling 10%, HALF_UP once |
| Grades | 1–5 priority, score 0–10 one decimal; drafts not visible to Student/Parent, publish explicitly |
| Files | PDF/DOCX/JPG/PNG <=10 MB each, <=5 files per submission; private storage |
| Jobs | Retry on transient failures: up to **three retries after initial**, 1/5/15 minutes; pinned policy, dedup |
| Dashboard | P0 three KPIs: active distinct students, active classes, issued unpaid receivables (scoped) |
| Audit | Important actions append-only, 24-month retention baseline, no secrets in logs |

## 6. P0 screen + API discipline

- `SCREEN_MAP.md` adopts the former Stitch ID **as a canonical naming convention only**; routes, visual palette and screen splitting still require owner review. Old kit v0.9 AUTH-/FIN- aliases should not be implemented as duplicates. `SCREEN_SPECIFICATIONS.md` has 59 P0 candidates, 12 P1 concepts; read one card per task. O-12/Wallet wording updates reuse BL01/03/05/07–11, OP04/05/07 and PO05; no new canonical ID or route approved.
- UI and backend must cover loading/empty/forbidden/validation/conflict/stale states; no fake success/notifications for unimplemented operations.
- Schedule preview never reserves anything; confirmation rechecks constraints transactionally.
- Use complete feature spec before any material code, with actor/scope, input/response, error, tests, rollback/transactions, responsive states.

## 7. Repo snapshot (verified read-only)

Snapshot 17/10 của scaffold đã cũ. Ở `main` e263209 hiện có Prisma wallet/generation models, migrations và internal billing/wallet commands; R6 báo local tests có giới hạn. Public finance write transport chưa đầy đủ, H-04 OPEN, populated legacy adoption và production readiness chưa được xác minh. Luôn kiểm checkout/ref trước khi mở slice.

## 8. Source citation discipline

When planning, quote reference identifiers such as `FR-12`, `UC-12`, `Q-04`, `BR-01`, and where possible document paths/sections. If a new feature requires a decision absent from these sources, mark `NEEDS_DECISION`, do not manufacture rules.

## 9. Screen design source and new Group A views

Stitch source was a detailed screen spec, not a design implementation. In v1.0 review, its 70 cards are retained tool-neutrally and one `AU06` activation card is added (total 71 design units). Approved group A changes: reset AU04 is atomic; new member/first Manager activates via AU06. Historical BL07/BL09 pending-excess/no-credit wording is limited-superseded for new pure-Wallet transactions: after authorized execution of approved adjustment/cancel, show signed release and credit of net excess into wallet. Legacy/mixed/existing excess without policy remains blocked for reconciliation. Exact visual tokens are UI defaults in `DESIGN_TOKENS.md`, not business rules.

## 10. Current P0 Wallet amendment — 2026-10-19

Business source: Requirements5.1 FR-30/31/BR-08/11/Q-10/12/§8 and UC-25/26/34/37, WALLET-B1–B5/Register §G. **B1** top-up thủ công→explicit invoice WALLET payment, refund đúng excess khi execute approved adjustment/cancel; **B2** financial staff mutate, Student/Parent scoped read only; **B3** one student/tenant wallet/no negative/no expiry/no cash-out/transfer; **B4** full original TOP_UP reversal khi available balance đủ, permission/reason/audit, thiếu thì reject/no wrong payment reversal; **B5** no automatic legacy/mixed conversion, inventory/policy riêng. TOP_UP không invoice Payment/revenue, unused balance không tự giảm due; invoice allocations dùng signed releases không double-count reversed payment. FinancialCoordinator giữ all effect/receipt/audit atomic, durable APPROVED survives failed explicit execution, COMPLETED only after success.

Group A identity/claims/issued history/manual approval giữ, no-auto-credit/direct-payment-only clause chỉ limited-superseded cho new wallet cohort; §4/9 giữ lịch sử, không current requirement xây excess-case engine. UI wallet/refund flows đã được mô tả để **review từng màn hình**, chưa sign-off hay triển khai UI; Figma có các biến thể Wallet nhưng copy còn cần review. Ví không prepaid package6tháng/combo5% P1; sibling10%/HALF_UP once và O12-A=A/B=B1/C=C1/D=D không đổi. Draft/issue/G2 không tự debit ví.

Simplification principle ACCEPTED: NestJS modular monolith/PostgreSQL, reuse two new wallet tables và existing payment/allocation/adjustment/reversal/audit/idempotency, no general ledger/event sourcing/distributed locks/generic workflow/recovery cycles. **Q1–Q8 RECOMMENDED / PENDING TECHNICAL SIGN-OFF**: per-User→Tenant current-auth/source locks, G metadata+immutable JSON/current applied pointer/CAS, states/roles/jobs, manual recovery after4, counter/dueAt, signed allocation/pair UQs/payment reversal/source lineage/precision/API transport. Worker không tự top-up/pay/approve. `attempt_count<=4` là DB design proposal chưa SQL CHECK, manual recovery path chưa technical approved.

**Reality19/10 read-only — historical snapshot:** schema khi đó 62 models/28 enums, chưa có WalletAccount/WalletTransaction/BillingRunGeneration hoặc Tenant.timezoneFrozenAt và chưa có migrations. **At remote main e263209:** các models/migrations và internal commands đã có; R6 báo local PostgreSQL/runtime suites PASS cho ca được nêu nhưng kết luận VERIFICATION INCOMPLETE, H-04 OPEN, public finance write transport partial, legacy populated adoption và technical sign-off còn pending. Không suy ra production readiness hay quyền triển khai từ code/test. Docs alignment này không cấp phép code, migration, Git hoặc Figma write; approved exception chỉ internal credit sau authorized execution, không bank refund.

## 11. O-12 current billing rule — 2026-10-18

Requirements v5 O-12/BR-06/Q-08 và UC-21/23/24: `sourceBusinessDate = local_date(ClassSession.startsAt, timezoneSnapshot)` quyết định cả `pricingLocalDate` và billing month. PriceRule DATE window là `[effectiveFrom,effectiveTo)`, ưu tiên Session→Class→Course; timezone tenant được freeze theo C1, không lấy giờ client hoặc ngày draft/issue/recompute. Calculation policy pin độc lập giá; retry giữ generation/result, recompute DRAFT có chủ đích tạo generation mới với reason/expected generation và giữ lịch sử; issue kiểm tra nguồn/current generation, không reprice hoặc sửa ISSUED. O-12 là **APPROVED business change**; schema/API/runtime validation không suy ra từ AC đã viết.
