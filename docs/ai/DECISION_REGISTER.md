# EduCore Vibecoding — Decision Register / Review Queue

**Version 1.0 · 2026-10-17 · OWNER-APPROVED KIT BASELINE**  
Purpose: distinguish **already-approved business/architecture/group-A decisions** from **UI proposals** and technical details that still need review. This document only reports status; it does not constitute approval to commit anything to GitHub.

**Wallet amendment 19/10/2026:** §G là business authority hiện hành cho WALLET-B1–B5. GA-02/UI-EXCESS và các mô tả no-auto-credit/direct-payment-only trước đó giữ provenance lịch sử, được giới hạn cho new wallet cohort bởi §G; không phê duyệt UI/API/SQL hoặc sửa O-12 §F.

## A. Baseline / already agreed

| ID | Decision | Source / authority | Status |
|---|---|---|---|
| BASE-01 | Requirements Analysis **v5**, FR-01–45, BR-01–14, NFR-01–16 and Q-01–15 as business source | Requirements v5, owner-confirmed | APPROVED BUSINESS BASELINE |
| BASE-02 | UC-01–37, Use Case Spec v1.3 | UC document | APPROVED BUSINESS BASELINE |
| BASE-03 | Modular Monolith, React/Vite, NestJS, Prisma/PostgreSQL, pnpm, transactional outbox, internal worker, Vercel/Railway | Accepted Architectural Design | ACCEPTED ARCHITECTURE |
| BASE-04 | P0 only OTP email external business API; P1 boundaries kept | Requirements/Architecture | APPROVED BUSINESS BASELINE |
| GA-01 | Use Requirements v5 in repo; design source order | Group A explicit user approval | APPROVED DESIGN, PR/main sync must be checked |
| GA-02 | Database Design v1.1 after review; one internal invoice/student/month; excess resolution separate from receivables | Group A explicit user approval | APPROVED DESIGN; not migrated/tested |
| GA-03 | 14 bounded contexts modular monolith, vertical-slice implementation | Group A | APPROVED DESIGN |
| GA-04 | Static P0 permission catalog + default role grants + TENANT/CLASS/STUDENT scope | Group A | APPROVED DESIGN; exact seed/test still required |
| GA-05 | REST `/api/v1`, business tenant routes, direct object + paginated envelopes | Group A | APPROVED CONTRACT; not implemented |
| GA-06 | Access 15min in memory, refresh rotated/hashed cookie, CORS+Origin/CSRF in same-site production | Group A | APPROVED DESIGN; must test actual domains |
| GA-07 | OTP reset atomic with no intermediate verify endpoint; CLI initial tenant/Manager activation via OTP | Group A | APPROVED DESIGN; not implemented |

## A.1. Kit-wide UI decisions approved (not individual screen sign-off)

| ID | Proposal | Source / review status |
|---|---|---|
| UI-IDS | Use Stitch-style IDs AU01/G01/AC01/SC03/BL07 as canonical; old v0.9 IDs are aliases | APPROVED KIT BASELINE; migration map in SCREEN_MAP.md |
| UI-ROUTE | UI pages grouped under `/app/:tenantId/*`, public auth global, embedded panels do not require routes | APPROVED NAVIGATION CONVENTION; route/action per screen reviewed separately |
| UI-STYLE | Reuse Stitch color/token/layout set in DESIGN_TOKENS.md | APPROVED VISUAL BASELINE; no official logo/trademark or Figma variables yet |
| UI-DETAIL | Reuse 70 Stitch design units; add AU06 for Group A activation, 59 P0 candidates/12 P1 concepts | APPROVED PLANNING COVERAGE, NOT 71 implementation approvals/routes |
| UI-EXCESS | BL07/BL09/BL10 expose internal pending excess reconciliation separate from debt | UI implication of Group A, specific resolution workflow pending Billing slice review |
| UI-GRADE | Whether grading draft locks resubmission | NEEDS_SLICE_REVIEW per Q-11 and Detailed Design |

## B. Kit-level decisions now approved; screen/feature reviews still pending

| ID | Question for owner/reviewer | Suggested default | Status |
|---|---|---|---|
| UI-01 | Frontend URL navigation uses `/app/:tenantId`? | Yes; no assumption about tenant slug | APPROVED KIT |
| UI-02 | Screen inventory SCREEN_MAP IDs, labels, work areas and navigation order? | Canonical IDs and design-unit inventory; details per screen reviewed before implementation | APPROVED KIT |
| UI-03 | Visual token system, colors, density, table vs cards? | Semantic tokens, slate/white/blue; check accessibility per screen | APPROVED KIT |
| UI-04 | Shared pages for multiple roles instead of separate redundant role dashboards? | Yes, if scoped access can be represented clearly | APPROVED KIT |
| WF-01 | One feature spec and explicit review gate before code? | Yes | APPROVED WORKFLOW |
| WF-02 | New-file review before Git; no auto-push/PR/deploy/Figma? | **User explicitly required this** | APPROVED WORKING AGREEMENT |
| WF-03 | Default start slice for Codex? | Tenant + Manager activation / IAM | RECOMMENDATION, not feature approval |
| MODEL-01 | Model routing strategy Luna→Sol→Astra with evidence-based escalation? | Yes, verify availability and actual usage | APPROVED RECOMMENDATION; menu availability not guaranteed |

## C. Implementation decisions intentionally **not** silently closed

- `SCH-TECH`: exact transaction isolation and PostgreSQL exclusion migration/lock ordering/concurrency test plan.
- `BILL-TECH`: precise invoice dueAt calendar semantics, reversal workflow, overpayment resolution lifecycle/approval.
- `WF-TECH`: sync vs persistent-job execution after approval by operation.
- `AUTH-OPS`: domain and cookie CSRF integration tests for Vercel/Railway preview and production.
- `FIGMA-OPS`: whether a Figma file/design system exists, its URL and write permissions.
- `QUALITY-OPS`: performance fixtures, backup/restore test evidence; no “tested” claim yet.

These require a named slice review before implementation. Do not turn a technical proposal into a new FR/Q baseline without authorization.

## D. Source branch reality

On 2026-10-17 repo `main` read-only inventory showed `apps/api`/`apps/web` scaffolding and older Requirements. A separate PR **#1** was created in the prior task to synchronize v5/group A. This **vibecoding package has not been written to GitHub**. At each start of Codex work, inspect actual `git branch --show-current`, commit and docs content; never assume PR #1 merged.

## E. Kit approval record (does not approve Git operations)

| Area | Reviewer | Decision/date | Notes |
|---|---|---|---|
| Model selection and token strategy | Project owner | APPROVED KIT — 17/10/2026 | Conditional on current product availability |
| Root AGENTS instructions | Project owner | APPROVED KIT — 17/10/2026 | Git copy needs separate approval |
| Feature skill + UI skill | Project owner | APPROVED KIT — 17/10/2026 | Per-slice sign-off remains |
| Screen map IDs/routes, palette, P0 vs P1 | Project owner | APPROVED PLANNING BASELINE — 17/10/2026 | Individual screen implementations still require review |
| UI behavior/a11y | Project owner | APPROVED KIT — 17/10/2026 | Validate each screen |
| Feature template and Scheduling example | Project owner | APPROVED AS TEMPLATE/EXAMPLE — 17/10/2026 | Example is not approval to implement schedule slice |
| Permissions/CSRF/security claims | Project owner | GROUP A DESIGN ONLY | Requires integration and security testing |
| Approved copy-to-repo file list | — | NOT AUTHORIZED | User requested no Git until separate authorization |

**Do not auto-sync this v1.0 package to GitHub.**

**After owner approval:** copy only reviewed files; review diff once more; user explicitly authorizes any Git changes separately.

## F. O-12 — Approved business decision 2026-10-18

**Amendment v1.0/O-12 · 18/10/2026 · Asia/Ho_Chi_Minh.** Nguồn phê duyệt: chỉ đạo trực tiếp của chủ dự án trong cuộc trao đổi ngày 18/10/2026; đối chiếu [O-12 addendum N](reviews/database/O12_DECISION_PROPOSAL.md#n-final-approved-decision--2026-10-18), [Requirements v5 amendment](../requirements/requirements_analysis.md) BR-06/Q-04/Q-08 và UC-21/23/24. Không tạo tên người duyệt, chữ ký hoặc bằng chứng khác. Chỉ bốn quyết định O-12 dưới đây được cập nhật; các mục A–E và quyết định kỹ thuật khác giữ trạng thái cũ.

| ID | Approved business choice / P0 contract | Lý do và trade-offs | Điều kiện / finding liên quan | Status |
|---|---|---|---|---|
| O12-A | **A — Local session date**: `pricingLocalDate=sourceBusinessDate=local_date(ClassSession.startsAt,timezoneSnapshot)`; PriceRule DATE `[effectiveFrom,effectiveTo)`, SESSION > CLASS > COURSE. Thay thế recommendation **O12-A=B** (charge-time) trong proposal lịch sử. | Học phí gắn ngày cung cấp dịch vụ; charge/draft/G2 muộn không làm tăng giá buổi đã học. Đổi BR-06/UC-21/DB-08; cần giữ tariff history/lineage và snapshot từng line, một invoice có thể nhiều giá. | Không backdate/mutate giá buổi đã bắt đầu; không reprice ISSUED; thiếu giá không implicit 0. H-04 phần attribution/price, H-06/H-09, M-04. | **APPROVED BUSINESS DECISION — 2026-10-18** |
| O12-B | **B1 — Local session start**: billingMonth theo tháng của sourceBusinessDate; `[monthStart,nextMonthStart)`, không split session, không lấy UTC month hay tháng tạo draft. | Overnight thuộc tháng bắt đầu; dễ đối chiếu một source/kỳ. Không proration theo phút. | Giữ Group A một logical invoice/student/tenant/month, permanent issued participation claim; monthly initial draft sau kỳ đóng. **H-04 period guard**. | **APPROVED BUSINESS DECISION — 2026-10-18** |
| O12-C | **C1 — Freeze timezone P0** sau first ScheduleSeries/ClassSession (kể cả DRAFT), BillingPeriod hoặc BillingRun/generation; Ops chỉ cấu hình trước boundary. | Không reinterpret historical date/period/price; ít phức tạp hơn timezone transition. Phải chọn đúng zone trước nguồn đầu; thay muộn cần task riêng. | Freeze/source cùng transaction; sticky kể cả hủy/xóa nguồn; z + derived dates snapshot; tzdata/privilege/backfill còn technical review. H-04/M-04/H-20. | **APPROVED BUSINESS DECISION — 2026-10-18** |
| O12-D | **D — Generation-based recompute**: retry same key/hash giữ G1; deliberate recompute mới key/reason/expected-generation/CAS tạo G2 giữ G1/diff/audit; ISSUED bất biến. | Phân biệt replay với business correction; giữ một logical invoice. Cần persistence/history/current pointer; G2 được pin calculation policy của request mới theo BR-14, nhưng PriceRule vẫn theo session date. | No implicit repricing theo ngày G2; nguồn/giá thiếu NEEDS_INFORMATION, nguồn stale chặn issue; financial correction UC-26. H-06/H-16/H-20/M-04. | **APPROVED BUSINESS DECISION — 2026-10-18** |

**Approval nghiệp vụ ≠ IMPLEMENTED/TESTED.** Chỉ cho phép đồng bộ tài liệu trong task này. Không cho phép triển khai R1b/R2, sửa Prisma schema, tạo/chạy migrations hoặc kết nối PostgreSQL. H-04 chưa đóng. O-01 lock/gateway, O-04 snapshot representation, O-13 security/operations và các quyết định khác không được chuyển thành APPROVED bởi amendment này. Recompute route/permission/DTO cụ thể và SQL/concurrency phải review/test riêng; không hỏi lại Group A hay bốn lựa chọn đã duyệt.

## G. Wallet P0 — Owner business approval 2026-10-19

**Authority:** xác nhận trực tiếp của chủ dự án trong cuộc trao đổi ngày **19/10/2026**, yêu cầu Phase2 Documentation Synchronization (`Asia/Ho_Chi_Minh`). Không tạo chữ ký, reviewer ID hoặc external approval record. [Requirements v5.1](../requirements/requirements_analysis.md) FR-30/31, BR-08/11, Q-10/12 và UC-25/26/34/37 là nguồn nghiệp vụ đã đồng bộ. [Wallet Proposal addendum N](reviews/database/WALLET_P0_SIMPLIFICATION_PROPOSAL.md#n-owner-business-approval--phase-2-docs-sync-2026-10-19) ghi supersession; original A–M là historical proposal. WALLET-B1 khác giá trị B1 của O12-B.

| Decision ID / date | Decision | Authority / status | Rationale | P0 scope / limited previous baseline | Dependencies | Implementation status |
|---|---|---|---|---|---|---|
| **WALLET-B1 · 2026-10-19** | New P0 funding: manual verified TOP_UP; invoice payment bằng WALLET; internal refund đúng excess khi execute adjustment/hủy đã được duyệt, kể cả đã thu/học có căn cứ | Owner business approval — **BUSINESS APPROVED** | Một nguồn tiền khả dụng/student, tránh stale pending excess cho wallet-only; không giữ tiền vừa allocated vừa credit | Supersede có giới hạn GA-02/no-auto-credit/direct-invoice-only cho giao dịch mới. Một Payment/invoice và permanent claims giữ; không external refund/auto-approve | Source sync; signed allocations/effect identity/O-01/04/13, API/DB technical review; R2-B/C | **NOT IMPLEMENTED** schema/API/runtime; no migrations/PG evidence |
| **WALLET-B2 · 2026-10-19** | Chỉ nhân sự có current financial permission đúng scope được top-up/pay/reverse/balance mutations; Student/Parent chỉ đọc theo quyền/liên kết hiện hành | Owner business approval — **BUSINESS APPROVED** | Chặn request/chứng từ tự cộng tiền và unauthorized debit | Không tự cấp quyền từ tên role; platform operator không mặc định finance; permission codes/DTO cụ thể chưa approved | IAM permission/read scope review, verified principal/current auth, audit; R4 minimum/R2-C | **NOT IMPLEMENTED** |
| **WALLET-B3 · 2026-10-19** | Một ví/student/tenant, balance không âm/không expiry, không cash-out/tự rút/external bank refund/cross-wallet transfer | Owner business approval — **BUSINESS APPROVED** | Giữ leftover rõ ràng, P0 không fintech | Không mở prepaid package/combo5% P1; wallet chưa dùng không revenue/allocated payment | Ownership/retention/financial guards, reporting definitions; R2-C/D | **NOT IMPLEMENTED** |
| **WALLET-B4 · 2026-10-19** | Invalid TOP_UP reversal full original amount, financial permission+reason/audit; chỉ khi available balance đủ, nếu thiếu chặn và xử lý có kiểm soát | Owner business approval — **BUSINESS APPROVED** | Không âm ví/che sai receipt, giữ compensation history | Không xóa TOP_UP hoặc tự đảo payment đúng để có balance; top-up reversal khác payment reversal | Reversal reference/source uniqueness/current balance lock; approval routing chi tiết Q6/Q7 còn review | **NOT IMPLEMENTED** |
| **WALLET-B5 · 2026-10-19** | Không tự convert legacy CASH/BANK_TRANSFER/mixed thành ví; inventory và policy riêng trước affected migration/collection/adjustment | Owner business approval — **BUSINESS APPROVED** | Không mint opening balance từ tiền đã allocated, không double settlement | Giữ lịch sử/cases, chặn mixed payment/excess-producing execution khi thiếu policy; không auto RESOLVED | Authorized data inventory/provenance/legacy disposition và cutover plan; no DB accessed | **NOT IMPLEMENTED / DATA NOT INSPECTED** |
| **ARCH-SIMPLIFY-P0 · 2026-10-19** | Minimal NestJS modular monolith/PostgreSQL, reuse existing modules/tables, một FinancialCoordinator; ACID/row locks/FK/UQ/CHECK/idem; custom SQL chỉ cho invariant cụ thể | Owner architecture direction — **PRINCIPLE ACCEPTED** | Phù hợp đồ án MVP dễ hiểu/test/bảo trì | Không general ledger/event-sourcing/distributed locking/generic workflow/recovery-cycle framework | Review concrete Q1–Q8, field/SQL/grant/contract/test deltas riêng | **NOT IMPLEMENTED** cho wallet/R1b/R2 |

### G.1. Technical decisions remain pending

| IDs | Recommendation hiện hành để sign-off, không approval | Status / blocked work |
|---|---|---|
| Q1 / O-01 | Wallet E.Q1: per-User current-auth anchor trước Tenant NK/RC/fresh reads, fixed domain order/narrow commands; không global advisory framework mặc định | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF** + security; R1b minimum guard/grants/concurrency và R2 writers |
| Q2 / O-04 | Một typed Generation + immutable versioned JSON + current applied pointer/full-source recheck/CAS; không Source/projection layers nếu chưa cần | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; R1b source interface, full R2-A |
| Q3 / O-13 | Domain states, audit/actor/current authorization, privilege boundary, fenced jobs/DB-only outbox; không generic state engine | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF** + security/operations; required R1b/R2/R4 subset |
| Q4 / retry | Initial+3 automatic theo baseline; manual recovery path/requeue dưới4, synchronous manual sau4 là proposal; lifetime4 không tự nới | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; DB prose `attempt_count<=4` chưa SQL CHECK; không block R1b period math |
| Q5 / O-02/03 | Local issue-year counter/INV format và exact7local-calendar-day cutoff/DST semantics | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; R2-B ISSUE, không hỏi lại baseline7days |
| Q6 / O-05 | Wallet business B1–B5 đã APPROVED; signed offset fields/UQs/pairing/LIFO/full payment reversal net-remaining design chưa technical approved | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; R2-B/C/legacy policy, không new wallet excess-case engine |
| Q7 / O-06/07 | Durable APPROVED + explicit execution là business contract; existing IdempotencyRecord root/version/receipt, failure/recovery/schema/SQL routing còn review | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**; R2-B/C/R4, không coi mọi workflow executor được duyệt |
| Q8 / O-10/H-01/API | Exact VND/precision range/source lineage/backfill, reviewed wallet/recompute transport/permissions | **RECOMMENDED / PENDING TECHNICAL SIGN-OFF / PENDING API REVIEW**; R1b minimum history, R2 precision/source/API |

**Gate:** chỉ **business B1–B5** và **simplification principle** được phê duyệt ở đây. O-12 §F không đổi; Q1–Q8/O-01/O-04/O-13 không TECHNICALLY APPROVED. Wallet schema/API/runtime **NOT IMPLEMENTED**, R1b/R2 chưa triển khai/không tự được authorize; H-04 **OPEN**. Phase2 là documentation-only, W01–W36 **DESIGNED**, không migrations/SQL/PG/runtime PASS. Dừng sau docs review; next phase cần authorization mới và technical sign-off phần thực sự phụ thuộc.
