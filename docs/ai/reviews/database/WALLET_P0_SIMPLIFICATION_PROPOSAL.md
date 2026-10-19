# EduCore — Simplified P0 Architecture & Student Wallet Proposal

**DRAFT LOCAL · 19/10/2026 · Asia/Ho_Chi_Minh · PHASE 0–1 ONLY.**

**Status: RECOMMENDED / PENDING_APPROVAL.** Tài liệu này không phê duyệt nghiệp vụ ví, Q1–Q8, implementation, migrations, DB access hoặc API. Những chữ APPROVED bên dưới chỉ dẫn quyết định đã có nguồn trước task.

## A. Executive Summary

**Khuyến nghị duy nhất:** ví học phí nội bộ/student/tenant, nạp tiền đã xác minh thủ công, thanh toán từng invoice bằng hành động của nhân sự có permission, hoàn đúng phần phân bổ dư về chính ví khi thực thi adjustment/cancellation đã duyệt. Dùng **hai bảng ví mới**, một financial application coordinator, transaction PostgreSQL, row locks, constraints và lịch sử bất biến; tái sử dụng Payment/Allocation/Adjustment/Reversal/Audit/Idempotency. Không xây general ledger, event sourcing, distributed locks hoặc workflow engine.

Ví là **business change**, chưa thuộc baseline hiện hành. Cần thay có thẩm quyền Q-10/UC-25 và điều khoản Group A “không auto-credit P0”; không được gọi đây chỉ là implementation detail O-05. Hoàn ví là effect bắt buộc của **execution được cho phép sau manual approval**, không phải tự duyệt hay tự hoàn ra ngân hàng. Tiền nạp dùng dần qua nhiều invoice là ngoại lệ P0 cần đặc tả mới; mỗi Payment vẫn thuộc đúng một invoice. Không mở gói prepaid/combo P1.

Giảm chi phí Q1–Q8 bằng: giữ tenant row gate cho critical writers; thay global advisory fence bằng khóa User cụ thể cho current authorization; một bảng generation với typed owner và JSON evidence, một applied pointer; state riêng theo domain; không recovery-cycle framework; counter tenant/year; allocation offsets thay excess-case FIFO cho luồng ví mới; durable approval + explicit execute dùng receipt hiện có. Chi tiết và điều kiện không được cắt bỏ ở D/E.

**Baseline kiểm tra thực tế:** branch `feat/prisma-p0-schema`, HEAD `9d5fb7c39a6dcd605fe36bc544d85bf217009e63`; đầu task không staged/unstaged tracked changes, có một untracked `TECHNICAL_SIGNOFF_PROPOSAL_R1B_R2.md`. Schema **62 models/28 enums**, hash SHA-256 `28b993a418340523e6e0246fca3bc94bb73e7d5f269a3fb8cf46472565d51b28`; không có thư mục `apps/api/prisma/migrations/` trong checkout. API AppModule chỉ scaffold, không business modules. Không suy ra trạng thái DB/remote/deployment từ việc thiếu migrations.

R1a composite FKs có trong schema; bằng chứng validate/generate/typecheck trước đây chỉ là schema/client evidence. R1b/R2/wallet chưa có models/SQL/runtime tương ứng. H-04 period vẫn OPEN; O-12 business đã duyệt, O-01/O-04/O-13 và Q4–Q8 chưa có technical approval được tìm thấy. Không đóng findings trong task này.

## B. Source & Conflict Matrix

Authority: Requirements v5 → Use Cases → Accepted Architecture → Group A DB/Class/DD/API → review proposals. Line numbers dưới đây theo working copy đầu task, không dùng snapshot audit cũ để phủ định nội dung hiện hành. Requirements hiện chứa §7 Q-01–Q-15, §8 và O-12 amendment; H-18 thiếu mục là phát hiện lịch sử.

| Nguồn, section / lines | Authority và hiện trạng | Conflict / hướng xử lý sau approval |
|---|---|---|
| [AGENTS](../../../../AGENTS.md), Sources/Hard boundaries; [Context](../../PROJECT_CONTEXT.md) §2/4/5/9 | Instructions + Group A; context §7 là scaffold snapshot cũ | Chỉ proposal. Context “no auto refund/credit” cần addendum có authority nếu ví được duyệt; không sửa trong task này |
| [Requirements](../../../requirements/requirements_analysis.md) FR-25–31:142–148; BR-04/06/08/11/14:220–230; Q-08/09:338–346 | Business baseline, O-12 amendment đã tồn tại | Giữ attendance/pricing/month/C1/G1/G2/sibling/manual approval; FR-30/31 mở rộng cho ví, không đổi ID |
| Requirements Q-10:348–350; BR-05:221 | P0 thu CASH/BANK_TRANSFER trực tiếp một invoice; partial, reject overpay; credit/prepaid nâng cao P1 | **Conflict thật:** cho nạp trước invoice và dùng số dư sau này; wallet refund sau adjustment thay pending excess. BR-05 suspension/prepaid package vẫn P1, cần ghi ngoại lệ ví P0 rõ ràng |
| Requirements Q-12:357–361; §8 Internal-first | Reporting tách revenue/collected/receivable; OTP-email là external exception | Thêm định nghĩa wallet liability/balance, không coi unused wallet là revenue/allocated payment; không bank API hoặc business email |
| [UC](../../../requirements/usecase/specification.md) UC-21–24:887–1052 | Approved O-12/business behavior | Giữ giá local session start, initial draft sau kỳ đóng, issue thủ công; wallet không tham gia tính giá/discount/generation |
| UC-25:1056–1094, nhất là1082/1089; UC-26:1098–1139 | Payment trực tiếp một invoice, vượt nợ bị chặn; issued correction manual, excess chờ xử lý | Cần top-up độc lập invoice, pay từ wallet, partial/full offsets/refund. Mỗi Payment vẫn một invoice, top-up không phải Payment |
| UC-34:1433–1471; UC-37:1555–1597 | APPROVED≠COMPLETED; failed execution/retry có lịch sử; initial+3 automatic, manual recovery | E.Q4/Q7 giữ nguồn ưu tiên; làm rõ manual execution sau exhaustion, không reset counter |
| [Architecture](../../../architectural/architectural_design.md) Accepted stack/automation; §5.1:284–286 | Modular monolith, PostgreSQL/Prisma, internal jobs/outbox; loại locks là proposal | Actual path là `docs/architectural/architectural_design.md`; **không có** file cùng tên ở `docs/design/`. Không tạo bản sao |
| [DB](../../../design/database_design.md) §3.6:199–269; DB-10:313 | Group A và O-12; Allocation dương một/payment, valid payment loại reversed; excess riêng no auto-credit:239 | Cần sửa cả signed allocation semantics và reporting valid payment cho ví. Không chỉ thêm WalletAccount rồi dùng công thức cũ gây trừ hai lần |
| DB §3.6:233; [API](../../../design/api_specification.md) §5.6:467–469 | DB mô tả decision+effect cùng TX; API tách decide/execute, UC-34 giữ approval khi fail | E.Q7 chọn durable APPROVED + explicit execute; disposition nguồn sau approval, không giả đã hết conflict |
| DB §3.8:291–293; schema AutomationJob:1673/JobAttempt:1710 | `attempt_count<=4` là **design proposal**, chưa có CHECK SQL/migrations trong checkout | Giữ budget, không âm thầm đổi lifetime bound. E.Q4 không requeue lần5, không recovery cycles |
| [DD](../../../design/detailed_design.md) §5.7:224–284; API §3.6:210–227/§5.4 | DD O-12 đã aligned; direct invoice payment REST hiện là contract tài liệu, không route implemented | Tách top-up/cash-receipt khỏi internal allocation; wallet/recompute REST paths/DTO/permissions chưa được khóa |
| [Register](../../DECISION_REGISTER.md) §F:78–89; [O-12](O12_DECISION_PROPOSAL.md) N:382–520 | O12-A=A/B=B1/C=C1/D=D APPROVED BUSINESS 18/10 | Không mở lại O-12; phần A–M charge-time recommendation cũ là history superseded |
| [Plan](SCHEMA_REMEDIATION_PLAN_P0.md) §4/5/9; [Technical proposal](TECHNICAL_SIGNOFF_PROPOSAL_R1B_R2.md) C–I | RECOMMENDED, chưa technical approved; Q1–Q8:489–496 | Simplification mới thay **recommendations** có điều kiện, không tự sửa/approve các report cũ |
| [Audit](SCHEMA_AUDIT_P0.md) H-01/04/06/09/14–20, M-01/04/05; [R1a](SCHEMA_REMEDIATION_R1A.md) §5–8 | Findings/provenance, không business authority; S evidence không P evidence | Giữ H-04 OPEN. Student/session FKs đã draft; period/history/finance/concurrency cần các gate sau |
| [Billing](../../../design/class%20design/billing-receivables.md) §3–5; [Reporting](../../../design/class%20design/reporting.md) §3–5 | Logical service/ledger/aggregate contracts; chưa wallet | Reuse module ownership, sửa financial formulas và reporting definitions, không thêm P1 reporting engine |
| [Jobs](../../../design/class%20design/automation-jobs.md), [Workflow](../../../design/class%20design/workflow-approval.md), [Tenant](../../../design/class%20design/tenant-policy.md), [IAM](../../../design/class%20design/identity-access.md), [Audit class](../../../design/class%20design/audit-traceability.md), [Scheduling](../../../design/class%20design/resource-scheduling.md), sections3–5/8 | Current authorization, policy pin, separate domain states, traceability, source coordination | Giữ contracts; chọn orchestration tối thiểu trong E. Không blanket accept mọi open implementation detail của class docs |

**Không được supersede:** một logical invoice/student/tenant/month, permanent issued claims kể cả zero/cancel; confirmed attendance (ordinary CANCELLED không cần attendance giả nhưng vẫn cần tariff hợp lệ); O-12 local date/month `[start,end)`, C1 sticky first-source freeze; SESSION→CLASS→COURSE, không hồi tố giá buổi đã bắt đầu; request policy pin BR-14/current permission; G1 replay/G2 explicit CAS/history; sibling10% P0; combo5%/package6tháng P1; HALF_UP một lần; manual ISSUE (`invoice_auto_issue=false`), issued snapshots/payment/audit immutable; tenant isolation, Internal-first.

**Cần supersede có giới hạn nếu owner duyệt:** direct external receipt→one invoice là đường thu mới duy nhất, no automatic internal credit sau approved execution, pending-excess model cho **new wallet-origin invoices**, và allocation một dòng dương/payment. Không dùng wallet để mở auto bank refund hoặc tự credit do người học gửi yêu cầu. Quy định repo đang cấm refund automation cần được diễn giải/amend rõ ngoại lệ internal wallet effect trước implementation, không viện proposal này làm quyền vượt AGENTS.

## C. Proposed Wallet Business Contract

Toàn bộ C–J là **RECOMMENDED / PENDING_APPROVAL**, kể cả các default “chỉ nhân sự tài chính”, “không expiry” và xử lý legacy. Các ví dụ VND dưới đây dùng số nguyên, không floating-point.

### C.1. Ownership, authorization và top-up

Một WalletAccount duy nhất cho `(tenantId,studentId)`, tồn tại độc lập enrollment/account đăng nhập của student. Có thể tạo lazy khi top-up đầu, balance ban đầu0; không có opening credit vô căn cứ. Transfer class, deactivation, invoice cancellation không xóa/re-key ví hoặc history; không chuyển balance sang student/tenant khác.

Top-up đơn lẻ không chọn billing month/PriceRule và không tự thêm boundary freeze mới vào O12-C: freeze vẫn theo first ScheduleSeries/ClassSession/BillingPeriod/BillingRun-generation đã duyệt. Wallet timestamps lưu UTC; không dùng receipt date hoặc timezone lúc top-up để định kỳ học phí.

Default: chỉ Accountant/Manager **được cấp financial permission hiện hành và đúng resource scope** được top-up/pay; tên role không tự cấp quyền. Quyền top-up/pay/reverse/approve tách theo operation trong seed review sau; không tạo permission code được coi đã approved ở đây. Student/Parent chỉ được xem wallet summary/history phù hợp student SELF/verified parent link nếu read contract được duyệt, không xem audit nội bộ, không top-up/execute debit. System Administrator không mặc định quyền tài chính. Request/ảnh chuyển khoản của Parent không ghi TOP_UP.

Top-up: nhân sự xác minh CASH/BANK_TRANSFER ngoài hệ thống, amount>0, nhập một **receipt reference duy nhất trong tenant**, method, receivedAt và chứng cứ đối soát phù hợp. WalletTransaction TOP_UP chính là chứng từ thu, không tạo Payment với invoice giả/nullable để nạp. `createdAt` là DB instant ghi nhận, receivedAt là thời điểm receipt thực tế, không backdate history. Chấp nhận nạp trước invoice và số dư vượt một invoice; không gọi đó là invoice overpayment.

Dedup hai lớp: root typed idempotency key+request hash; UQ receipt reference độc lập key, bắt cả nhập lại cùng receipt bằng key khác. Bank statement transaction identity nếu có được normalize theo quy tắc đã review và dùng để đối chiếu chống duplicate; cash dùng mã phiếu thu nội bộ duy nhất. Một physical transfer được nhân sự cố tình gán hai receipt mới **không thể được DB tự nhận ra chỉ từ amount/date**; phải cùng bằng chứng/reference gốc, manual verification và audit. Không hứa “chống mọi trùng tiền thực” khi không có bank feed hay stable external identity.

### C.2. Wallet payment

Chỉ trả invoice đã ISSUED, chưa cancelled, cùng tenant/student với ví, còn outstanding. Amount request nguyên VND, `0 < p <= balance` và `p <= outstanding`; thiếu tiền thì reject full requested amount, **không tự hạ xuống phần có thể trả**. Partial payment phải là hành động/request rõ số tiền. Mỗi payment một invoice; balance có thể dùng cho nhiều invoice qua những payment độc lập có quyền, không multi-invoice allocation của một Payment.

Atomic: debit ví −p + Payment(method WALLET,p) + base Allocation(+p) + receipt + audit trong một TX. Không external I/O dưới lock. Issue/draft/recompute/top-up không tự kích hoạt debit. Payment ISSUED thành công không được UPDATE/DELETE; correction dùng C.4. Retry cùng root/body trả kết quả cũ sau current-authority check, không tạo payment mới.

### C.3. Adjustment/cancellation và refund

Đặt `N = issued.totalVnd + Σ(APPLIED adjustment.deltaVnd) >= 0`, `P = Σ signed effective allocations` của luồng ví thuần, `D = max(N-P,0)`. Trước apply giảm/hủy, lấy `P_before` và tính nghĩa vụ mới `N_after`. Refund **r=max(P_before−N_after,0)**, không lấy `−delta` làm số hoàn. Sau transaction: `P_after=P_before−r`, `D_after=max(N_after−P_after,0)`, refund wallet +r và offsets allocation −r. Tăng nghĩa vụ chỉ tăng due, không tự debit lại ví hoặc thu hồi refund đã ghi.

Refund không phải action tự do nhập số tiền; là sub-operation của approved adjustment/cancellation execution, amount tính server. Mỗi credit phải có payment gốc, invoice, adjustment/cancel đã APPLIED, root receipt và allocation offset tương ứng. Một adjustment có thể hoàn nhiều payment. Chọn **LIFO theo `(allocatedAt,id)` giảm dần**, release từ net remaining của payment mới nhất; đây chỉ là thứ tự attribution payment, không excess-case/FIFO settlement framework. Không release quá remaining từng payment; mọi số tính sau khóa, không từ màn hình approval cũ.

Ví dụ 1m top-up, trả800k: B200k/P800k. Giảm N800→700: hoàn100k, B300k/P700k. Giảm tiếp700→650: hoàn50k, B350k/P650k. Tăng650→900: B350k/P650k/due250k, không đảo refund trước. Hủy approved với N→0: chỉ hoàn remaining650k, B1m/P0. Tổng hoàn đúng800k, không100+50+900 hoặc hoàn800 lần nữa.

Partial: N800k/P300k giảm xuống700k → r0/due400k. N800k trả hai payments300k và500k, giảm còn600k → release200k từ payment500k; còn300k+300k, không hoàn200k cho mỗi payment. Cancellation tài chính có chứng cứ được đề xuất cho cả trường hợp đã học/thu; không đồng nghĩa hủy session/attendance, không release claims, không mở reinstatement cùng invoice nguồn. Các trạng thái học tập vẫn giữ nguyên.

### C.4. Hai loại reversal khác nhau

**Invalid top-up:** full reversal của đúng TOP_UP gốc, manual financial approval + reason/evidence; tối đa một lần. Chỉ khi wallet.balance >= original top-up amount mới append TOP_UP_REVERSAL âm toàn bộ, không dùng expiry, sửa balance hay xóa receipt. Tiền khả dụng là fungible; không truy từng đồng đã tiêu từ receipt nào. Nếu thiếu balance thì reject execution, giữ yêu cầu/approval và lý do chờ xử lý; chỉ thử lại khi có tiền khả dụng hợp lệ và current checks đạt. Không ghi “debt wallet” hoặc giả top-up để đủ tiền. Không đảo invoice/payment đúng chỉ để che top-up sai; không thực hiện cash/bank withdrawal dưới tên reversal. Ghi sai dữ liệu/receipt không chứng minh có cash outflow.

**Invalid wallet invoice payment:** tái sử dụng PaymentReversal **full original nominal amount**, UQ một/payment như baseline; không mở partial PaymentReversal. Nhưng amount thực trả lại ví là **net allocation remaining** của payment sau các refund trước đó. Append offset hết remaining và một wallet credit loại bổ sung `INVOICE_PAYMENT_REVERSAL`; link PaymentReversal gốc. Nếu remaining0 thì record full reversal/audit/receipt nhưng không tạo zero-valued wallet transaction. Ví dụ payment800, đã refund100 do N700: full reversal.amount800, chỉ credit thêm700, P→0/due700; không credit thêm800. Original payment/reversal nominal và released allocation là hai số khác nhau, phải trình bày rõ.

Do dùng signed offsets, **không đồng thời loại cả base allocation vì có PaymentReversal và trừ offset lần nữa**. Reversal không phải refund ra ngoài, không làm giảm cash receipt thật đã xác minh; chỉ giải phóng internal allocation. Muốn sửa thu tiền không thật phải qua invalid TOP_UP, không dùng invoice payment reversal để xóa cash receipt. Các sửa sai tài chính này mặc định require manual approval/reason/audit, không worker tự duyệt.

### C.5. Legacy, mixed payments và giới hạn

Default cutover sau approval: **new invoice-payment commands dùng WALLET**; CASH/BANK_TRANSFER là receipt top-up. Không mở direct-pay mới song song cho cùng invoice, không chuyển old Payment thành TOP_UP. Existing external-only/mixed invoice giữ nguyên chứng từ/thuật toán legacy và được gắn trạng thái nguồn suy ra từ dữ liệu, không giả payment.method=WALLET.

Không nhận wallet payment mới cho invoice có external-payment history khi chưa có mixed-policy được duyệt, kể cả external payment đã reversed; invoice chưa từng có external payment có thể dùng đường wallet bình thường. Nếu legacy còn nợ, cutover phải giải quyết approved legacy collection policy hoặc chặn đường thu affected invoice, không coi số dư mới có thể tự tất toán nợ cũ. Đây là limitation cần owner chọn ở B5, không một tính năng legacy mới được tự triển khai.

Legacy adjustment không tạo excess có thể tiếp tục theo contract đã duyệt; khi giảm/hủy tạo excess trên invoice có bất kỳ external payment, **chặn execution automated refund/excess conversion**, giữ durable approval và báo cần reconciliation. Cả invoice mixed được xử lý như legacy exception, không tự chọn hoàn phần external hay suy ra thứ tự refund hỗn hợp. Owner cần duyệt limitation này hoặc mở policy legacy riêng trước finance cutover. Không drop outstanding legacy excess; inventory/display/đối soát thủ công trước khi close case, không đánh RESOLVED bằng việc đổi tên sang wallet. Nếu có unresolved legacy case thì migration không được ghi opening balance tự động.

Cho invoices thuần wallet mới: không ghi PaymentExcessResolution song song refund. Nếu phát hiện case cùng adjustment nguồn đã có, reject toàn execution để đối soát; idempotency không đủ để chống hai subsystem dùng key khác. Existing table được giữ để đọc/provenance legacy, không xây thêm movement/FIFO/remaining engine cho đường wallet mới. Migration sau này phải quyết định bằng chứng closure; không DROP bảng hoặc xóa case trong proposal.

Default leftover **không expiry trong P0**; không tự forfeiture khi nghỉ/chuyển lớp. **Không external withdrawal/refund operation P0**, kể cả manual cash-out ghi qua UI; nhu cầu hoàn tiền ngoài hệ thống cần scope riêng, không lạm dụng TOP_UP_REVERSAL. Không cross-wallet/student/tenant transfer, overdraft, banking/payment API, interest, multi-currency, legal e-wallet, auto debit, combo hoặc prepaid package P1. Nạp số tiền tương đương6tháng không tạo quyền combo5%.

### C.6. Bốn khái niệm reporting

| Khái niệm | Công thức / ý nghĩa | Không được tính nhầm |
|---|---|---|
| Wallet balance B | Tổng signed WalletTransaction trên một account; số tiền khả dụng | Không cộng vào Payment/receivable/revenue khi chưa allocate |
| Collected cash | Receipt TOP_UP đã xác minh, net invalid-receipt corrections; legacy receipts có provenance tách riêng | Wallet pay/refund/payment reversal không tạo cash inflow/outflow mới; TOP_UP_REVERSAL không chứng minh đã chi tiền mặt/ngân hàng |
| Invoice total / adjusted N | Original issued total bất biến + applied adjustment deltas | Không giảm N bằng wallet debit; draft totals không là issued revenue |
| Outstanding D | `max(N−effective allocated payments,0)` từng issued invoice, aggregate theo tenant/scope/asOf | Không trừ toàn wallet balance hoặc đếm base Payment lẫn signed allocation cùng lúc |

Dashboard P0 vẫn ba KPI baseline, không thêm revenue dashboard P1; chỉ sửa công thức financial views cần thiết. Cash recording là bằng chứng thủ công, không báo cáo đối soát ngân hàng thật. Liabilities/unused wallet và doanh thu theo dịch vụ là hai nghĩa khác nhau; không dựng general accounting ledger để hiển thị số dư.

## D. Minimal Wallet Data Model

### D.1. Hai bảng mới và các extension có lý do

Tên/field dưới đây là **proposal**, chưa Prisma/DDL. Không dùng `referenceType/referenceId` polymorphic làm bằng chứng FK; có thể giữ để display, nhưng integrity dựa typed references.

| Model / delta | Trường, keys/constraints đề xuất | Invariant cần bảo vệ |
|---|---|---|
| **WalletAccount mới** | `id,tenantId,studentId,balanceVnd BIGINT default0,createdAt,updatedAt`; UQ `(tenantId,studentId)` và `(tenantId,id)`; composite Student FK; CHECK balance≥0; identity immutable | Một ví/student/tenant, số dư không âm và không vượt BIGINT |
| **WalletTransaction mới** | `id,tenantId,walletId,type,signedAmountVnd BIGINT,commandId,effectKey,createdAt,createdByMembershipId,reason?`; tenant Wallet/Member/IdempotencyRecord FKs; UQ `(tenantId,id)`/`(tenantId,effectKey)`; index wallet/time/id | Append-only history, actor/root receipt, deterministic per-effect dedup; một command có nhiều refund entries nên **không** UQ commandId đơn lẻ |
| WalletTransaction: receipt fields | `receiptReference?,receiptMethod?,receivedAt?,evidenceNote?`; TOP_UP bắt buộc receipt ref/method/time; UQ `(tenantId,receiptReference)` WHERE type=TOP_UP | Chống cùng receipt key khác; method chỉ CASH/BANK_TRANSFER cho top-up; giữ original receipt khi reversed |
| WalletTransaction: typed sources | `paymentId?`, `adjustmentId?`, `paymentReversalId?`, `reversesTopUpTransactionId?`; same-tenant FKs; type/null/sign shape CHECK; partial UQs payment debit, paymentReversal credit, top-up reversal source | Nguồn hoàn là payment/adjustment đúng invoice/student, một full reversal/receipt; join guard bảo đảm same wallet và đúng loại nguồn |
| WalletTransaction: refund uniqueness | Partial UQ `(tenantId,adjustmentId,paymentId)` WHERE INVOICE_REFUND; UQ `(tenantId,paymentId)` WHERE INVOICE_PAYMENT; UQ reversed-top-up và reversal-root theo type | Cùng adjustment/payment không double-credit dù key mới. Credit/offset bằng nhau, tổng releases không vượt base |
| **Payment reuse** | Thêm enum `PaymentMethod.WALLET`; không invoice nullable, không thêm Payment riêng cho TOP_UP; WALLET payment có đúng một debit entry qua paymentId | Một Payment vẫn một invoice; amount/payment/debit/base-allocation equality, owner từ invoice ↔ wallet.student |
| **ReceivableAllocation extension** | Giữ `amountVnd` nhưng chuyển thành signed entry; thêm `kind=PAYMENT/RELEASE`, `parentAllocationId?`, `walletTransactionId?`, `adjustmentId?`, `paymentReversalId?`; PAYMENT>0, RELEASE<0; self-FK parent cùng tenant/payment/invoice; one-offset-per-wallet-credit UQ | Refund partial không UPDATE payment hoặc amount allocation gốc; nguồn cụ thể cho mỗi release; không negative base hoặc parent chains |
| Allocation keys/cardinality | Thay **cả hai** UQs hiện tại `(tenant,payment)` và `(tenant,payment,invoice)` bằng partial UQ base PAYMENT/payment; giữ UQ `(tenant,id)`/operationKey và Payment FK `(tenant,payment,invoice)`; thêm candidate `(tenant,id,payment,invoice)` cho self-FK | Hai UQs cũ đều chặn nhiều release rows! Payment.allocation singular phải thành collection, lấy base qua kind; không vô tình giữ UQ cũ còn chặn refunds |
| Allocation source links | UQ walletTransactionId khi nonnull; each RELEASE link exactly one adjustment **hoặc** PaymentReversal; parent phải PAYMENT same payment/invoice; base WALLET allocation link đúng debit, release WALLET link đúng credit | Không release legacy external thành wallet; link credit/debit allocation có sign đối ứng và số tiền tuyệt đối bằng nhau |
| Adjustment/Reversal/Audit/Idempotency reuse | Giữ original fields; root financial execution receipt theo approved business effect identity; versioned audit before/after có B/N/P/refs/policy/correlation; không bảng effect receipt mới | Full reversal one/payment giữ; one effect/approval dù caller đổi key; failure không làm mất durable approval |
| PaymentExcessResolution legacy | Giữ records/candidate FKs/indexes; cấm tạo cho wallet-only adjustment; legacy exception không tự convert | Một excess không được credit hai đường; bảo toàn provenance |

Trong WalletTransaction các typed source FKs dùng `(tenantId,targetId)` đã có candidate keys; không bắt buộc thêm invoiceId/studentId lặp lại trên mọi row. `payment.invoiceId → invoice.studentId` so với `wallet.studentId` được cross-row guard kiểm cùng transaction; adjustment.invoiceId/paymentReversal.paymentId cũng phải cùng payment/invoice. Cần inverse immutability guards để không đổi parent ownership sau kiểm. Một optional self-FK không tự chứng minh source là TOP_UP hay cùng wallet; phải validate shape + source row. `commandId` tham chiếu IdempotencyRecord hiện có UQ `(tenantId,id)`; effectKey server tạo từ typed root+kind+source ID, không từ chuỗi client tùy ý. Root key replay và source UQs bổ sung nhau.

Không thêm general ledger, top-up-request table, settlement table, allocation projection table hoặc wallet balance-history table. Hai bảng ví là số bảng **wallet mới**; BillingRunGeneration/counter tối thiểu của R2 là dependencies khác, không bị giấu trong claim “toàn DB chỉ thêm2bảng”.

### D.2. Reconciliation equations và proof không double-count

Cho wallet-only cohort, mọi amount tính exact integer/numeric:

```text
B(w) = SUM(WalletTransaction.signedAmountVnd WHERE wallet=w)
T(w) = SUM(TOP_UP + TOP_UP_REVERSAL signed amounts WHERE wallet=w)
A(w) = SUM(base allocations + release offsets của wallet payments thuộc w)
Invariant: storedWalletBalance = B(w) >= 0
Invariant: B(w) + A(w) = T(w)
For each payment p: 0 <= remaining(p)=base(p)+SUM(releases(p)) <= base(p)
For each pure-wallet invoice: P=SUM(remaining(p)); D=max(N-P,0)
After any successful financial command: N>=0; 0<=P<=N

TOP_UP x:                 delta(B,A,T) = (+x,  0,+x)
INVOICE_PAYMENT x:        delta(B,A,T) = (-x, +x, 0)
INVOICE_REFUND r:         delta(B,A,T) = (+r, -r, 0)
INVOICE_PAYMENT_REVERSAL: delta(B,A,T) = (+remaining,-remaining,0)
TOP_UP_REVERSAL x:        delta(B,A,T) = (-x,  0,-x)
```

Ở mỗi command tổng `delta(B+A−T)=0`; starts0 ⇒ conservation giữ nếu tất cả writers tuân pairing/constraints. Refund retry không tạo pair mới nhờ root+source UQs. Debit không allocation, credit không release, duplicate release/credit đều không được commit. Nhiều downward adjustments dùng **current remaining** nên chỉ hoàn phần chưa release. Positive adjustment không đổi B/A/T. PaymentReversal không filter base lần hai ở signed cohort. Không áp công thức này lên legacy external bằng cách gán nhầm funding origin.

Reconciliation dùng snapshot nhất quán cho cả ba sums (một statement hoặc read-only consistent snapshot), không đọc balance trước và ledger sau từ hai RC statements giữa concurrent commits. PostgreSQL SUM(BIGINT) dùng numeric/wide arithmetic; sum toàn lịch sử không ép vào BIGINT tùy tiện. Mỗi persisted balance/amount phải nằm storage range, reject overflow atomic; không đặt business ceiling thấp hơn storage range. Tránh `abs(MIN_BIGINT)` và JS Number. Không dùng CHECK row để tuyên bố đã enforce SUM cross-table.

### D.3. Enforcement và transaction boundary

**Một FinancialCoordinator** trong application layer sở hữu transaction client; Billing/Wallet/Workflow không tự commit nested transactions hoặc repositories ghi chéo module. R1b source commands và financial commands dùng cùng E.Q1 lock convention. Narrow domain command functions/guards bảo vệ critical DB writes; không generic gateway registry/policy DSL. Exact SQL inventory/grants là deliverable Phase3/R2 contract review, không được tự triển khai ở đây.

Immediate: amount/sign/type CHECK, FK/UQ, no UPDATE/DELETE immutable history; account identity và issued invoice/claims/history guards. `WalletAccount.balanceVnd` chỉ do reviewed financial DB command cập nhật; runtime không direct UPDATE balance. **Không vừa service cộng balance vừa trigger cộng lần nữa**: chọn command sở hữu atomic increment/decrement, ledger insert và deferred reconciliation guard xác nhận kết quả cuối. Không trigger-maintained projection thứ hai.

Deferred constraint guards (custom PostgreSQL, không Prisma PSL): trên wallet transactions, account balance, Payment/Allocation/Adjustment/Reversal, kiểm source shape, pair equality, owner, per-payment remaining, final B=SUM và P≤N cho wallet cohort; inverse guards chặn parent ownership/method mutation. Named guards forced IMMEDIATE cuối command. Đây là đề xuất DB defense và cần review query cost/indexes; history/authorization không defer. Nếu direct protected DML không qua granted commands thì privilege phải reject, không trông trigger tự cấp permission.

```text
BEGIN READ COMMITTED
  lock verified actor User(s) SHARE, then Tenant NO KEY UPDATE   // E.Q1
  fresh statement: current User/session/member/permission/scope; no cached JWT grant
  bind typed root key/hash; same-key mismatch reject; replay authorized result if complete
  lock approval/job roots if applicable, then relevant period/run/source anchors
  create/get WalletAccount under tenant gate; lock wallet FOR UPDATE
  lock Invoice FOR UPDATE (if financial effect involves invoice)
  lock payment/base allocation/adjustment parents in fixed type + ID order
  re-read latest B/N/remaining and approval body under locks
  validate p or calculate r=max(P_before-N_after,0); validate pure-wallet/legacy policy
  append Payment/adjustment/reversal and signed allocation evidence as applicable
  append WalletTransaction entries; update account balance exactly once
  append audit; complete root receipt; mark approval COMPLETED only on applied success
  SET named deferred integrity checks IMMEDIATE
COMMIT
```

Parent-before-child insertion theo actual FKs, UUIDs có thể cấp trước TX insert; tránh circular required links bằng Allocation→WalletTransaction (không WT→Allocation). Source Payment/Adjustment/Reversal parents phải được tạo trước typed WT FK, WT trước Allocation có walletTransactionId. Root receipt có trước children, resultRef chỉ set khi có result. Không dùng nested Prisma writes để suy ra lock order hoặc custom deferrable constraints.

Hai pays cùng wallet/invoice hoặc pay vs adjustment/cancel cùng tenant đều chờ tenant gate trước descendants rồi fresh-read balance/due; winner commit, loser kiểm theo state mới, không stale-check trước lock. Khóa wallet trước invoice áp dụng cả adjustment/reversal, không invoice-first ở một flow. Top-up chỉ wallet; ISSUE cần source locks rồi invoice, **không tự đọc-debit ví**. R1b source writer/line writer cùng tenant gate ngăn check/parent-mutation phantom. Queue claim không giữ Job trước Tenant, poll IDs advisory rồi enter order.

Any insert/audit/guard failure rollback cả effect/receipt success/balance. Earlier committed decision còn nguyên; failure attempt audit ghi transaction riêng, không pretend success audit đã sống qua rollback. Deadlock/serialization/lock timeout rollback trước bounded retry same intent/key; technical default tối đa2 short command retries với jitter/timeout cấu hình, không nhân với automatic worker budget. Domain/FK/CHECK conflict không blind retry. Lost COMMIT response: tra durable receipt sau transaction trước kết thúc/được phân giải; committed replay, absent chắc chắn mới retry, unknown không tạo key khác. Current rights kiểm cả replay; success có trước revoke giữ history, command sau revoke không thực thi.

## E. Eight Simplified Technical Decisions

Các mục này **thay recommendation để review**, không tự approve Q1–Q8 hoặc edit technical report. Các simplification không cần owner chọn loại PostgreSQL lock; owner review package/trade-offs, implementation design phải chứng minh SQL cụ thể sau authorization.

### Q1 — O-01: Concurrency

**Original:** Technical C: all protected gateways, tenant NK gate/RC + global advisory S/X fence, full global lock graph. **Cost:** global IAM exclusive barrier chờ mọi tenant; inventory helper/grants lớn, dễ biến thành generic infrastructure.

**Simplified recommendation:** giữ **Tenant FOR NO KEY UPDATE** cho critical source/calendar/attendance/price/policy/line/generation/issue/finance/permission writers, RC và fresh statements; một common entry convention và ít explicit domain commands. Không mutex cho ordinary read/UI preview hoặc toàn request. P0 chấp nhận serial critical writes trong một tenant; chưa tách fine-grained finance gate vì chưa có throughput evidence đáng đổi proof. Source checks cần gate để bảo vệ absence-of-price/roster predicates, wallet row lock đơn độc không thay được nó.

Bỏ **global advisory fence** mặc định, thay current-auth row protocol: mọi command lấy `User FOR SHARE` cho verified actor/affected global users **trước tenant**; global disable/credential/session revocation lấy `User FOR UPDATE` của các user bị tác động, tất cả User IDs sorted, mode write intent chọn từ đầu (không S→X upgrade). Membership attach/change khóa cả actor và target User trước Tenant; global user disable giữ User lock, khám phá đầy đủ affected memberships/tenants, rồi Tenant IDs sorted và fresh last-active-Manager checks trước mutate. User↔membership identity không re-key tự do. Actor-member mapping/session binding phải resolve lại sau entry; set user/tenant cần thêm thì rollback/restart, không lấy User mới sau Tenant. Password/reset/logout/revoke paths phải dùng cùng User anchor, không chỉ tenant role writers. System draft worker chỉ có explicit allowlisted authority, hoặc lock initiator User rồi recheck current rights, không impersonate Manager.

Per-user SHARE ngăn concurrent UPDATE status/revoke của chính actor, không chặn tenant khác không liên quan; membership set không thêm phantom trong lúc global disable vì attachment cũng phải User-lock. Tenant gate giữ role/scope/last-Manager/source consistency. Global permission catalog là seed/maintenance, không live mutable P0; global email/tenant-code lifecycle changes dùng riêng reviewed maintenance/domain command, không cập nhật dưới tenant command chưa inventory. Nếu một IAM writer không tuân protocol, **chưa đạt gate**, không tuyên bố loại global fence an toàn.

**Order:** User IDs → Tenant IDs → typed receipt/Approval/existing Queue+Attempt → Period/Run/G → Course/Class/Series/Resource/Session/Price → Enrollment/Participant/Absence/Finalization/Attendance → Wallet → Invoice/children/Payment/baseAllocation/Adjustment/Reversal → counter/new evidence/audit/outbox. New rows theo parent FK order D.3; exact implicit FK/index waits phải kiểm Phase3. Không User-after-Tenant, invoice-before-wallet, job-before-entry hoặc source-after-invoice. Small command functions tự enter/fresh-check; không chỉ rely caller gọi enter.

**Preserved:** ACID, current auth, tenant isolation, no overdraw/overpay, H-04 child/inverse guard, exclusion/UQ/FK/CHECK, sorted locks và bounded retry. **Deferred:** generic distributed/advisory namespace, fine-grained optimization, live global catalog editor. **Residual:** contention tenant, implicit locks/deadlocks, global writer omissions, backend principal trust; DB role không chứng minh HTTP identity chống compromised backend/owner. **Tests:** W10–14/20/21/32/35; ≥2 PG connections cho role revoke/global disable/new membership/last-Manager, source insert/reschedule vs line/issue, both commit orders, raw-DML grants. **Dependency:** R1b cần approved source/auth/order/privilege subset; R2 dùng cùng contract, không chờ wallet approval để review month math. **Approval:** technical+security design pending, không hỏi lại O-12.

### Q2 — O-04: Generation & snapshot

**Original:** Technical D: G + typed per-source table + many generation/source FKs + latest/current/pending/sourceEpoch pointers + sealing. **Cost:** thêm source rows/projection plumbing, nhiều cyclic links và legacy backfill; vẫn phải giữ JSON evidence.

**Simplified recommendation:** **một BillingRunGeneration** typed `(tenant,run,student,period,no,key/hash,baseGenerationId?,expectedAppliedId?,policyVersionId,admittedAt,z,schemaVersion,inputJson,inputHash,resultJson?,resultHash?,state,reason)`; same-run/student/period composite FKs, UQ run/no và typed command key. Run giữ **currentAppliedGenerationId** duy nhất; latest generation tra indexed max(no) dưới Run lock, không latest/pending pointers riêng. Partial UQ tối đa một PREPARED generation/run; state ngăn ISSUE khi latest chưa APPLIED/READY hoặc nguồn stale. G1 NEEDS_INFORMATION vẫn giữ bằng chứng missing, G2 explicit có base/current null-safe CAS hợp lệ dù chưa có invoice.

Mỗi inputJson chứa per-source IDs/ownership/lineage/date/z/revisions/pricing choice/window/units và policy evidence; schemaVersion cố định, money strings, DATE ISO, exact DB UTC instants, arrays sort theo stable IDs, serializer declared fields/version và hash. Không custom canonicalization framework toàn hệ thống. Không lấy JS Date millisecond để hash timestamp DB6digit mà làm mất precision. SQL capture/apply guards kiểm JSON source IDs với same-tenant/student/period rows trước seal/use; JSON/hash không tự thành FK/authorization hoặc thay live source month guard. Existing InvoiceLine FKs giữ ownership projection. Historical source parents không re-key bởi inverse history guards; G JSON/result giữ lineage G1 kể cả old mutable draft lines bị replace.

Admission captures inputs+policy+receipt/job atomic; input không đổi sau commit. Retry dùng G1, result sealed once khi APPLIED; job fail không refresh input. Apply/ISSUE re-query **đầy đủ source set và semantic price eligibility** dưới tenant gate, không chỉ existing line revision: bắt thêm/xóa participation/higher-tier price. Không sourceEpoch riêng trong P0 nếu full recheck đạt fixture load. G2 dùng key mới/reason/expected latest+applied CAS; giữ G1/result/diff (diff có thể trong JSON, không bảng riêng). Replay G1 sau G2 trả historical result, không đổi current. Replace DRAFT children theo FK-safe order trong cùng TX, old result tham chiếu source identity, không FK bắt giữ draft rows đã thay. ISSUED không G2, repricing hoặc policy repin.

**Preserved:** O12-D history/replay/CAS/one logical invoice, local-session-date prices, BR-14. **Deferred:** BillingGenerationSource table, sourceEpoch, pending/latest projection pointers và generic event stream. **Residual:** JSON validation/full-source recheck cost, source completeness/serializer correctness; cần normalized source table sau này chỉ khi invariant/performance chứng minh cần. **Tests:** W19/33, O12-AC-01–27 và two-recompute/source-change/unknown-commit; typed owner/JSON mismatches reject. **Dependency:** R1b chỉ trusted live attribution + existing versioned snapshot interface và source history; G schema/service thuộc R2-A. Trước adapter, mutation làm draft inconsistent phải reject, không implicit G2. **Approval:** technical pending; không hỏi lại có giữ G1/G2 hay không.

### Q3 — O-13: Security & state

**Original:** Technical E full state/actor matrix, extra audit worker/operator/job FKs, gateway grants, fenced jobs/outbox/retention. **Cost:** genericizing every transition/provenance và quá nhiều fields trước có runtime path.

**Simplified recommendation:** domain-specific allowlists/guards, existing enums khi phù hợp; Run READY/STALE/PREPARING/NEEDS_INFORMATION/ISSUED, G PREPARED/APPLIED/STALE/NEEDS_INFORMATION; Invoice DRAFT→ISSUED, cancellation chỉ through adjustment; Approval APPROVED→COMPLETED iff root effect success; Job states riêng. Không shared WorkflowStatus engine. G PREPARED có thể execution-blocked do job FAILED nhưng input không đổi/result chưa có; chặn ISSUE. Nếu cần abandon để tạo G mới, authorized reason+Run CAS, stop/fence old job trước chuyển G STALE; không tự mở pending generation thứ hai.

Wallet writes P0 synchronous do financial actor; audit USER có verified User/tenant Membership; worker không top-up/pay/approve. Jobs/outbox audit WORKER với jobId/attemptNo/workerRef trong versioned immutable audit payload, join validate cùng tenant/job tại write; chưa thêm tất cả nullable actor columns nếu audit payload+existing refs đủ cho slice. Operator audit không fake tenant membership hay ngầm có quyền đọc finance. Required provenance fields phải được command/state guard kiểm, nullable actor không là universal SYSTEM authority. SYSTEM job chỉ allowlist tạo draft/notification, không approve/issue/pay.

API/worker roles không owner, superuser, BYPASSRLS, DDL, TRUNCATE, disable-trigger hoặc SET ROLE owner. Revoke raw protected financial/source/history writes; chỉ EXECUTE narrow reviewed domain commands, fully qualified SQL/safe search_path/no PUBLIC execute, scoped reads. App dùng parameterized queries; trusted backend xác minh principal, DB kiểm current stored grants. Shared DB login không chứng minh end-user identity; không claim chống compromised trusted backend/DB owner. Maintenance/migration riêng, không bypass live without reviewed boundary. Financial keys/history không TTL mặc định; audit baseline24tháng không tự purge ngày vừa đủ24tháng.

Jobs vẫn durable claim/lease + monotonic attempt number làm fencing token, one-time attempt finish, effect reacquire locks/current auth/token; old worker không commit sau reclaim. Outbox **DB-only** consumer tạo notification+dedup+DONE một TX; rollback không mất business transaction gốc, không committed PROCESSING bình thường và không extra lease engine khi không external I/O. Payload immutable, whitelist execution metadata có transition guard, không gọi status update là rewrite history.

**Preserved:** RBAC/current auth/isolation/audit/issued immutability/dedup/recovery. **Deferred:** generic state/policy/provenance framework, extra actor schema không cần slice, external notification. **Residual:** write-grant inventory, payload lineage validation và restoring dedup; không thể dùng permission label UI thay actual checks. **Tests:** W13/14/21/32/35, raw grants/history update/delete rejection, job stale token, audit required metadata, consumer crash/duplicates. **Dependency:** R1b targeted period/source/state/role rules; R2 financial/generation guards; broader R4 independent contracts không bắt implement toàn R4 trước R1b. **Approval:** security/operations design pending.

### Q4 — Retry và manual recovery

**Original:** Technical E.3/I.Q4 đề xuất retry cycles + cycle fields để mở manual recovery sau lifetime4. **Cost:** thêm counters/state/cycle orchestration; cần nới thiết kế lifetime bound, dễ automatic retries vô hạn.

**Simplified recommendation:** worker job initial+3 retries tự động, delays1/5/15phút theo pinned policy. `attemptCount` monotonic, fence không reset, max4; missing → NEEDS_INFORMATION, approval → PENDING_APPROVAL, exhaustion → FAILED + Manager in-app alert. Manual **requeue chỉ khi count<4**, kiểm reason/permission/current source và giữ cùng root/key/G/policy; không reset retry schedule/budget thành vòng mới.

Sau count4: **không requeue Job lần5**. Người có quyền chọn explicit synchronous **manual domain execution/recovery**, trỏ cùng original effect receipt/G; không phải worker attempt nên không increment/reset counter hay ghi JobAttempt5. Job FAILED giữ lịch sử exhausted; root receipt/audit thêm recovery actor/reason/result, UI hiển thị derived “đã xử lý thủ công” từ root result, không sửa attempt cũ thành success. Domain executor check source/CAS/current authorization như bình thường, effect once. G còn PREPARED vì job execution failure, không đổi sealed input; source stale thì yêu cầu explicit G mới, không manual refresh G1. Failure attempt audit ghi riêng sau rollback. Không có daemon gọi manual operation hoặc tự xin approval thay người dùng.

Root receipt của accepted generation chưa apply giữ trạng thái **ACCEPTED** trong khi Job có thể FAILED; failure thuộc job/attempt, không ghi một sealed terminal-success/failure result giả cho generation rồi overwrite khi manual recover. Receipt chỉ thành APPLIED cùng effect, hoặc kết thúc stale/needs-information qua transition được review; payload/key/hash bất biến. Nếu inventory sau này có legacy terminal FAILED receipt semantics khác, không tự đổi sang ACCEPTED/success: cần mapping/recovery disposition trước cutover.

Đây là clarification manual recovery ở UC-37, cần đồng bộ execution boundary trong docs sau approval; **không phải lách bằng đổi tên attempt**: manual path là explicit USER operation, không lease/worker dispatch/backoff, giữ job FAILED và audit riêng, không mở new job cho same effect. Nếu owner yêu cầu recovery vẫn phải chạy background, thiết kế hiện tại **chưa đáp ứng**; lúc đó cần scope/approval riêng để thay lifetime rule, không nới ngầm. `attempt_count<=4` hiện chỉ DB design prose, actual Prisma Int chưa có SQL CHECK; không khẳng định đã có database constraint.

**Preserved:** bounded automatic work, history/fencing/idempotency/pin/current auth và manual recovery. **Deferred:** cycles/recovery-job hierarchy/background recovery after exhaustion. **Residual:** manual synchronous operation phải ngắn; không giữ TX lúc tính toán dài, dùng sealed G prepare/short apply; vượt timeout dừng, không tự chuyển background. **Tests:** worker attempts1–4/fifth reject, manual-after4 effect once/job unchanged, stale G/rights rejection, unknown commit. **Dependency:** không block R1b period; R2-A/R4 worker+manual executor cần design và API review riêng. **Approval:** technical/ops pending, lifetime4 không đổi; không đòi owner chọn SQL counter details.

### Q5 — O-02/O-03: Number và dueAt

**Original:** counter tenant/year, INV-year-sequence/no padding, +7 local calendar days cùng giờ. **Cost:** chủ yếu chưa khóa cutoff/year/format và dễ dùng sequence service lớn không cần.

**Simplified recommendation:** một counter row `(tenant,localIssueYear)`, transactional increment chỉ khi ISSUE; `INV-{YEAR}-{SEQUENCE}` số nguyên tăng không minimum zero padding, unique tenant/number, không reuse issued number, không promise pháp lý gapless. Dùng **DB instant sample một lần sau locks** làm issuedAt; year=`year(local(issuedAt,frozenZ))`, không worker/request/UTC year. Replay đã issued không cấp số mới. Counter update+invoice+claims+audit+receipt một TX; rollback không để số của invoice thất bại thành issued. Không distributed number service.

`dueLocal=local(issuedAt,z)+7 calendar days` giữ giờ/phút/giây, `dueAt=resolve(dueLocal,z)` lưu UTC immutable; overdue iff now>dueAt và D>0, tại equality chưa overdue. Calendar7days qua tháng/năm/leap; không default cuối ngày/UTC+168h. Với zone DST: gap dịch tới giờ tương ứng sau gap, overlap chọn instant muộn; persist resolved instant và z, không reinterpret sau tzdata change. Asia/Ho_Chi_Minh không DST nhưng conversion phải deterministic/test, dùng timezone library/SQL reviewed, không JS local machine timezone. Thay cutoff cuối ngày là business alternative, không tự áp.

**Preserved:** counter/manual ISSUE/7days/replay. **Deferred:** padding customization, distributed numbering, legal numbering claims. **Residual:** tzdata/rollover/concurrency/counter restore. **Tests:** W34, simultaneous ISSUE same/different invoice/year, rollback after counter, replay/year transition/DST. **Dependency:** không R1b; R2-B ISSUE needs counter model/SQL/due contract. **Approval:** presentation/cutoff technical design pending, không hỏi lại7days hay one invoice/month.

### Q6 — O-05: Wallet thay excess-case engine

**Original:** Plan §4.5/Technical F signed reconciliation movements/FIFO/remaining cases/RECONCILED status + full reversal authority. **Cost:** case lifecycle/cross-case math và pending stale resolution, vẫn không thực sự credit P0 theo baseline.

**Simplified recommendation:** C/D wallet-only flow, adjustment apply cùng release allocations/refund, final P≤N; không sinh pending excess mới hoặc settlement case cho wallet event. Reuse existing allocations bằng signed immutable release **có schema extension**, không giả model hiện đủ; giữ full PaymentReversal nhưng amount trả ví là net remaining. Legacy records preserved/read/reconciliation exception, không convert hay dual credit. Không xây old O-05 movements/remaining/FIFO framework rồi thêm wallet bên cạnh. LIFO per-payment chỉ để truy đúng payment đã trả, không settlement cases.

**Preserved:** original history/claims, manual financial approval, exact amounts/no overpay, no bank refund/isolation. **Explicit amendment:** Group A no auto internal credit/pending excess và Q-10 direct-payment-only; nạp trước invoice là business scope mới P0 có điều kiện. Không gọi giữ nguyên toàn Group A. **Deferred:** legacy mixed refund engine, external cash-out, package prepaid. **Residual:** migration cohort split và signed-ledger reporting thay đổi, receipt verification vẫn con người. **Tests:** W01–31 và B+A=T, no dual case/refund W30. **Dependency:** không R1b period math; **block wallet/financial DDL R2-B/C** tới business/source approval và signed allocation diff review. **Approval:** business + financial security + technical pending; O-05 không APPROVED.

### Q7 — O-06/O-07: Approval và cancellation

**Original:** durable decision transaction D1, explicit effect transaction E1, proposed separate root receipt schema, eligible cancellation/recovery còn pending. **Cost:** có thể genericize workflow/receipt registry, hoặc gộp decide+effect làm mất approval khi effect rollback.

**Simplified recommendation:** giữ **D1 commit APPROVED**, không financial effect tại decide. E1 do explicit authorized execution, kiểm approved payload hash/target/current approval round và latest financial facts. Dùng existing **IdempotencyRecord** với server-derived root effect identity `FINANCIAL_APPROVAL_EXECUTE + approvalRequestId + approvedPayloadVersion`; root duy nhất theo approval, không theo caller retry key tùy chọn. Nếu resubmit thay nội dung phải new approved version/decision history; không sửa approved body rồi dùng lại receipt. Không new receipt table nếu existing resultRef/body/status guard đủ. Child WalletTransaction effect keys/source UQs chống duplicate từng payment; một root execution có thể tạo nhiều children.

E1: adjustment/cancel status + delta + allocation offsets + wallet credits + audit + root receipt success + Approval COMPLETED **cùng TX**. Failed E1 giữ APPROVED/decision; audit execution failure riêng, không COMPLETED/FAILED approval để che decision; exhausted job không xóa approval. Retry cùng root không thêm adjustment/refund dù request key mới, quyền hiện hành vẫn kiểm. CAS/body change hoặc obligation changed làm approved target không còn hợp lệ → rollback, yêu cầu đối soát/new approval, không tự sửa amount đã được duyệt; refund là số **derived** theo payment hiện tại trong payload contract, không fixed estimate cũ. Có thể cùng UI action gọi decide rồi execute tuần tự nhưng hai durability boundaries vẫn rõ.

Cancellation eligible có chứng cứ dù attended/paid, delta=−currentN được approve theo target obligation revision; issued basis/number/lines/claims không đổi, không reschedule hoặc restore tự động. Reversal/top-up correction manual authority như C.4, không workflow engine mới.

**Preserved:** BR-11/APPROVED≠COMPLETED/current rights/once effect/audit. **Deferred:** generalized workflow, async financial executor mặc định, approval engine thresholds P1. **Residual:** DB §3.6 same-TX conflict cần sửa sau approval; phải phân biệt obligation revision với payment changes khi tính refund. **Tests:** W08/09/20/21/28/36; approve survives fail, replay/hash mismatch/changed revision/revoke/new decision version. **Dependency:** không block R1b; R2-B/C và R4 approval contract cần sign-off/source alignment, không tự mở API execute mới. **Approval:** business eligibility+execution package pending.

### Q8 — O-10/H-01/API

**Original:** NUMERIC(25,6) widen, checked BigInt, historical source lineage guards/backfill, APIs riêng review. **Cost:** nâng precision vô cớ hoặc business caps/extra lineage tables sẽ quá mức; bỏ precision vì “P0 nhỏ” lại overflow valid storage.

**Simplified recommendation:** giữ VND BIGINT và exact decimal/rational arithmetic; sibling P0 có thể tính `(gross*9+5)/10` bằng **unbounded intermediate** để HALF_UP nonnegative net một lần; `discountVnd=gross−net`, không round discount trước. BigInt gross5 → net5, discount0. Rate decimal, no Number. `rawDiscountDecimal NUMERIC(20,6)` chỉ14digits phần nguyên, **không chứa hết raw10% của BIGINT19digits**; widening `(25,6)` có proof19integerdigits, giữ6fractiondigits hiện có, không precision framework. SUM/multiply wide numeric/unbounded intermediate, checked cast persisted BIGINT; không business cap mới.

Lưu original session/class/course/enrollment lineage ở G JSON và issued snapshot; validate chain với DB nguồn trong capture, protect parents historical bằng guard, không suy ra từ enrollment hiện tại. H-01 wrong enrollment-class/source chain cần minimal FK/guard riêng Phase3, không duplicate tất cả IDs lên mọi model. Legacy không có chứng cứ → quarantine/explicit provenance, không bịa G1/price/time. Money JSON strings, financial API contract riêng review, không thêm REST endpoints được coi approved. Các tên operations F là application contracts proposed.

**Preserved:** exact VND/HALF_UP, traceability/isolation/historical immutability. **Deferred:** arbitrary precision beyond proof, price caps, general lineage storage, unapproved wallet/recompute API. **Residual:** existing large values/client timestamps/native precision/serializer. **Tests:** W17/18/19/25/26/33, native NUMERIC boundaries/negative sign/overflow/JSON strings, H-01 lineage cases. **Dependency:** R1b cần minimal historical-source safeguards; precision/full snapshots R2-A/B/C; API delivery độc lập gated review. **Approval:** technical design pending, cap không được đề xuất như approved.

## F. Required Documentation Changes

**Chỉ sau owner approval Phase1 và authorization Phase2 mới sửa.** Các đường dẫn dưới đây đều là file có thật, trừ optional use-case ID được nêu như proposal. Giữ existing IDs; không renumber UC-01–37 hoặc FR/BR/Q.

| Thứ tự / exact path | Section / changes cần làm sau approval | Giữ nguyên / authority cần ghi |
|---|---|---|
| 1. `docs/requirements/requirements_analysis.md` | FR-30 top-up/wallet/payment; FR-31 refund-linked offsets; Q-10 cash receipt vs wallet payment/reversal/legacy, Q-12 four financial concepts; BR-08/11 new correction authority nếu cần; §8 no external refund/bank integration; clarify BR-05/Q-08 prepaid scope | O-12/BR-04/06/14/Q-08/09/P1 package giữ. Ghi explicit wallet P0 exception, authority/date/rationale, không suy expanded package discount |
| 2. `docs/requirements/usecase/specification.md` | UC-25 top-up/pay/read/partial/idem/errors; UC-26 adjustment/cancel/refund/reversal/legacy manual exception; UC-34 durable approval+explicit execute; UC-37 manual after4 vs requeue<4 | Giữ current IDs. Nếu tách use case ví riêng: đề xuất **UC-38** sau kiểm không xung đột hiện tại (max hiện37); chưa tạo/allocate ID chính thức |
| 3. `docs/ai/DECISION_REGISTER.md` | Add explicit wallet business amendment + Q1–Q8 selected technical package, supersession phạm vi O-05/direct pay/execution/recovery/cutoff | Không sửa O-12 §F; record business≠technical≠implementation authorization; RECOMMENDED không tự approve |
| 4. `docs/design/database_design.md` | §3.6 wallet2tables/Payment.WALLET/signed allocation/legacy semantics/receipt guards, sửa valid payment double-filter; Group A239 add superseding amendment; §3.8 recovery/approval; DB-07/09/10/12, §9 SQL checklist | Giữ history text/Group A provenance bằng addendum rõ phạm vi, không trình approved cũ như chưa tồn tại |
| 5. `docs/design/detailed_design.md` | §5.7 top-up/pay/refund/reverse transaction/locks/reporting; workflow/jobs coordination: D1/E1 và manual executor; minimal G/current pointer/full source recheck | Keep approved O-12 algorithm/date/month/timezone/policy/pricing; no charge-time fallback |
| 6. `docs/design/api_specification.md` | §3.6/5.4/5.6 và jobs contract: distinguish receipt vs allocation, request keys/version/CAS/body/errors/money strings; wallet/read/legacy policy; security permission scope | Application operations: `topUpWallet`, `getWalletBalance`, `listWalletTransactions`, `payInvoiceFromWallet`, `refundInvoicePaymentToWallet`, `reverseInvalidTopUp`; thêm payment-reversal operation theo reviewed existing reversal contract. **Không là REST paths**; paths/method/DTO/errors/permission cần review riêng |
| 7. `docs/design/class design/billing-receivables.md` | Wallet ownership/FinancialCoordinator/Payment/Allocation semantics, G JSON/interface, calculator và receivable queries | Không module khác ghi repository Billing trực tiếp; keep ports/one TX |
| 7. `docs/design/class design/workflow-approval.md`; `automation-jobs.md`; `reporting.md` cùng thư mục | Durable decisions/recovery count/derived manual-recovered job, cash vs allocated vs balance vs N/D | No workflow/cycle/materialized reporting framework; source pins và Manager alert giữ |
| 7. `docs/design/class design/identity-access.md`; `tenant-policy.md`; `audit-traceability.md`; `resource-scheduling.md` cùng thư mục | Per-user→tenant auth locking, permission/read scope, audit payload/provenance, shared source mutation boundary/C1 | Chỉ contracts bị ảnh hưởng, không rewrite modules hoặc mở global editor P1 |
| 8. `docs/ai/reviews/database/SCHEMA_REMEDIATION_PLAN_P0.md` | O-01/04/05/06/07/10/13 board + R1b/R2 dependencies/tests/gates: wallet supersedes new excess engine khi có authority | Preserve R1a/historical baseline; không close H-04 bằng docs |
| 9. `docs/ai/reviews/database/TECHNICAL_SIGNOFF_PROPOSAL_R1B_R2.md` | **Approved addendum sau approval**, link proposal này, identify recommendations superseded/deferred/Q4 clarification | Không rewrite original C–I/Q1–Q8 hoặc old test history. O12 report/R1a/audit byte-preserved trong task hiện tại |
| Phụ thuộc kit/context, nếu được whitelist Phase2 | `AGENTS.md`, `docs/ai/PROJECT_CONTEXT.md` §4/5/9; relevant UI candidates sau này | Cần reconcile no-refund-automation/no-auto-credit wording với internal wallet effect, không ngầm override. Không sửa instructions/context/SCREEN docs nếu authorization Phase2 không gồm chúng |

Documentation gate: không còn normative direct-payment-only/no-credit conflict cho new cohort; legacy boundary explicit; O-12/P0/P1 consistent; authority/date và supersession traceable; reviewed API không bị giả implemented; links/diff checked, no schema/code edits. New UI specs chỉ sau financial contract review, không thiết kế Figma lượt này.

## G. Acceptance Test Matrix

**Trạng thái mọi W case: DESIGNED.** Cột offline bên dưới chỉ reference arithmetic thử bằng BigInt trên dữ liệu synthetic, **không PASS implementation case**. K ghi những kiểm tra đã chạy. `POSTGRESQL PASS` cần DB thật ≥2connections/constraints/roles/fault injection; `RUNTIME PASS` cần service/API/jobs/auth tests; hai mức này đều **NOT RUN**.

| ID | Input / operation | Expected state/result | Invariant / enforcement cần kiểm | Evidence hiện tại |
|---|---|---|---|---|
| W01 | TOP_UP1m, valid finance actor, receiptR1 | B1m, T1m, A0, one history | Positive/manual verified/unique wallet; atomic receipt+balance+audit | DESIGNED; numeric offline |
| W02 | Retry W01 same key/body; new key same receipt; same key amount khác | First two replay/conflict không cộng; changed body reject | Typed receipt+hash/UQ receipt; same physical evidence can't re-key | DESIGNED |
| W03 | B1m, ISSUED N800k/P0; pay800k | B200k/P800k/D0 | −800 debit ↔ +800 base/payment, same owner, one TX | DESIGNED; numeric offline |
| W04 | B500k/N800k; request800k | Reject, B500k/P0, no partial rows | Balance guard after locks; full request semantics | DESIGNED; numeric offline |
| W05 | B1m/N800k; explicit pay300k | B700k/P300k/D500k | p>0/p≤due/p≤B, no implicit full-pay | DESIGNED; numeric offline |
| W06 | N800k/P800k/B200k; approved delta−100k | N700k/P700k/B300k/D0, refund100k once | r=max(P−Nnew,0), linked offset/credit, manual root | DESIGNED; numeric offline |
| W07 | N800k/P300k; approved delta−100k | N700k/P300k/D400k, refund0, B unchanged | Not refund whole delta on partial payment | DESIGNED; numeric offline |
| W08 | Wallet paid800k; approved cancellation delta−800k | N0/P0, B+800k, issued history/claims retained | No issued rewrite/release, cancel atomic with credits | DESIGNED; numeric offline only refund math |
| W09 | Replay refund root or another caller key for same approval/adjustment | No new credit/offset, result same | Root deterministic key + source UQs, permission on replay | DESIGNED |
| W10 | B500k, two concurrent pays400k on two invoices | One400k commit, other insufficient/B100k; no negative | Tenant→Wallet lock, fresh re-read, rollback loser; PG barriers | DESIGNED; PG NOT RUN |
| W11 | B1m/N500k, two concurrent pays400k same invoice | One commit; second would exceed due100k reject | Invoice mutex/current due; no overpay | DESIGNED; PG NOT RUN |
| W12 | After debit insert, fail allocation FK/audit/guard | B/WT/Payment/Allocation/receipt success all rollback | Atomic financial coordinator, guards forced before commit | DESIGNED; PG/runtime NOT RUN |
| W13 | T1 actor/wallet attempts T2 invoice/read | Reject without cross-tenant disclosure | Composite FKs+scoped query+resource checks, no fallback ID-only lookup | DESIGNED |
| W14 | Read-only/Student/Parent tries TOP_UP; forged actor ID | Reject, no balance change | Verified backend principal/current permission, DB privilege boundary | DESIGNED |
| W15 | Top-up1m, spent800k, B200k; reverse full1m | Reject full reversal, B200k; keep pending reason/approval, no negative | Available-balance guard; cannot reset receipt or fake credit | DESIGNED; numeric offline |
| W16 | B1m; create DRAFT/ISSUE another invoice | B1m, no Payment/debit | No auto debit on draft/issue | DESIGNED |
| W17 | Student transfers class, original session class/course differs now | Same wallet/student/tenant/history; old line source unchanged | Identity/source lineage immutable; current enrollment not history | DESIGNED |
| W18 | TOP_UP amount equivalent6months, sibling eligible | No combo5%; invoice only sibling10% where eligible | Wallet != prepaid package; calculator unaware of balance for discount | DESIGNED |
| W19 | G1→explicit G2 draft, price changed after old session | B/WT unchanged; G1 retained, correct old-session price/month; retryG1 no pointer rollback | O-12 A/B/C/D, no DRAFT Payment, G CAS/immutable JSON | DESIGNED |
| W20 | Pay vs approved down-adjust/cancel concurrent; both orderings | Pay-first: refund only excess; adjustment-first: pay≤newdue or reject; cancellation-first rejects pay | Same Tenant/Wallet/Invoice order, approved obligation revision vs derived refund | DESIGNED; PG NOT RUN |
| W21 | Crash before effect commit / after commit before response; job/manual retry | First rollback then at most one effect; unknown lookup receipt, no new credit/key/G | Durable root, attempt fence/current rights, no success before commit | DESIGNED; PG/runtime NOT RUN |
| W22 | Full wallet history TOP_UP/debit/refund/reversals | stored B=Σsigned WT≥0 and B+A=T | Deferred reconciliation/immutable history, consistent snapshot query | DESIGNED; numeric offline algebra |
| W23 | Legacy CASH payment800k, N800→700; or mixed external+wallet invoice | No auto wallet credit; excess-producing execution blocked pending reconciliation; history unchanged | Funding-origin cohort guard, no synthetic opening cash, no P0 mixed refund policy | DESIGNED |
| W24 | Pay800k; adjust800→700→650→900→cancel0 | Refund100+50+0+650=800k, final A0/B restored; no stale cases | Current remaining after each change, no refund from increase | DESIGNED; numeric offline |
| W25 | BIGINT max, sum/multiply/rate fractions; gross5 sibling10%; balance+top-up overflow | net5/discount0; exact strings; checked overflow rejects wholeTX, no wrap | Wide intermediate/HALF_UP once, NUMERIC storage proof, no business cap | DESIGNED; offline integer vectors, PG native NOT RUN |
| W26 | Student/Parent linked read own wallet, unrelated student ID, revoked link | Only approved scoped summary/history; mutation always denied; revoked read denied | Current relation/permission, no internal receipt evidence/PII leak | DESIGNED |
| W27 | Payments300k+500k/N800k; lower600k | Refund200k only from latest500k, remaining300+300; B+200k | Deterministic LIFO, release≤remaining, sum releases=refund | DESIGNED; numeric offline |
| W28 | Payment800k already refund100k; full payment reversal800k | New wallet credit700k, remaining0, N700k/D700k; reversal original.amount800k | No filter-plus-offset double subtraction, one full reversal/payment | DESIGNED; numeric offline |
| W29 | Entire payment already refunded after cancel; later full reversal | Reversal record+audit only, zero extra credit, no zero WT | Historical nominal reversal distinct net release | DESIGNED; numeric offline |
| W30 | Same wallet adjustment has existing legacy excess case; another path/key attempts credit | Reject and reconcile, never both case settlement and refund | Origin/source uniqueness/guard across subsystems, no dual credit | DESIGNED |
| W31 | TOP_UP wrong1m with B≥1m (possibly other valid funds); repeat reversal | One full negative1m, original receipt retained; second reject/replay | Positive source type/same wallet/UQ reverse-source/nonnegative | DESIGNED; numeric offline |
| W32 | Permission/global User disable or attach membership races pay; both winners | Action holding User SHARE finishes before revoke, later action fresh-denied; last Manager protected | User-before-Tenant contract across all IAM writers, no missing membership phantom | DESIGNED; PG NOT RUN |
| W33 | Source mutation/reschedule/zone change vs capture/line/apply/issue; Sep30 overnight/Oct1 boundary | Correct local period or whole rollback/stale; freeze sticky; wrong-source owner rejected | H-04 child+inverse, immediate history/C1, deferred final containment, full source recheck | DESIGNED; PG NOT RUN |
| W34 | ISSUE near local Dec31/Jan1; +7days month/leap/DST; same-key replay | Correct local-year sequence, one number, immutable resolved dueAt, equality not overdue | Counter+claims+audit atomic, issue clock after waits, no UTC-year shortcut | DESIGNED |
| W35 | Attempt4 fails then attempted worker5/requeue; authorized manual recover; old leased worker resumes | Worker5 denied/count4 unchanged; manual same-G/root effect once; job history FAILED, stale worker denied | Monotonic count/fence, explicit USER executor, current auth and root receipt | DESIGNED; PG/runtime NOT RUN |
| W36 | D1 APPROVED committed; E1 fail after refund insert; retry/new caller key; approved obligation changed | All E1 rollback, D1 retained; valid retry exactly once; stale approval requires reconciliation/new approval | Approval root/version/hash + atomic COMPLETED, no changing approved payload | DESIGNED; PG/runtime NOT RUN |

## H. Migration & Compatibility Impact

Không migrations/data inventory/DB queries được chạy. **Không giả DB rỗng chỉ vì checkout thiếu migrations.** HEAD đã chứa R1a/O-12 documentation; untracked technical report vẫn thuộc người dùng, không bị overwrite. Không dùng schema reset từ scaffold hoặc audit hash cũ.

| Phạm vi | Impact / migration protocol phải review sau này |
|---|---|
| R1a compatibility | Giữ AttendanceRecord session/optional finalization composites, InvoiceLine student/participant composites, candidate keys/Restrict/back-relations. Wallet không thay H-02/H-04A; validate nested types chỉ S, không P |
| R1b minimum | Sticky Tenant timezone marker + source/month/parent/inverse/history/role/locking guards. Không add wallet/G/counter chỉ để period guard; no O-12 changes. Mọi draft mutation không thể giữ final period invariant phải reject cho tới reviewed rebuild adapter |
| R2-A G/snapshot | Một G model + Run current-applied pointer, staged legacy refs; existing required Run.policyVersionId/inputSnapshotHash phải capture đúng trước initial insert, không dummy defaults. Old snapshot không đủ history thì không fabricate G1 |
| R2-B/C schema | Add WalletAccount/Transaction and enum WALLET; Allocation signed fields/new candidates/partial uniqueness, Payment allocation back-relation collection; inverse/immutability/pair guards và root receipt state constraints. Prisma không express partial UQ/deferred triggers/grants đầy đủ: custom SQL phải review/test |
| Existing external payments | Giữ method/amount/invoice/received evidence/reversals/allocations. **Không wallet opening TOP_UP bằng SUM(payments)**, không convert existing consumed invoice payments into spendable balance. Balance0 cho account mới là initialization, không giả receipt |
| Old allocation algorithm | Legacy unchanged positive base excluding fully reversed payment; wallet cohort uses signed base+release including reversed base offsets. Query phải branch theo proven origin, không generic filter reversed cho wallet. Nếu sau này unify legacy với offsets cần migration riêng có exact once mapping, **không** đồng thời old invalidation+new offset |
| Historical excess/mixed | Read/display inventory, stop automatic wallet conversion; prove any prior resolution before approved mapping. Unprovable case/mixed data quarantine/reconciliation, không mark resolved rồi mint balance. Không drop table/history |
| Upgrade strategy | Authorized backup + read-only mismatch/origin/zone/lineage inventory; staged nullable reference columns/classification, application compatibility barrier; backfill only proven metadata, then CHECK/FK validation/NOT NULL/partial index switch. Dừng tài chính trong maintenance cutover nếu simpler, không dual-write new wallet với old direct-pay engine |
| Rollback/restore | Trước any wallet effect có thể rollback reviewed schema delta trên disposable DB. Sau effect committed không DROP history hoặc reverse số dư bằng reset; use forward-fix/compensations/backup recovery có đối soát root keys, allocations, receipts, claims. Restore không hứa exactly-once nếu acknowledged records bị mất |
| Audit/history retention | Giữ ≥baseline audit24tháng theo policy; wallet/payment/allocation financial history và dedup không TTL/purge mặc định. Cấm expiry xóa receipt cho phép credit lại |

Compatibility gate yêu cầu generated Prisma client types phản ánh one-to-many allocations, queries sum signed entries đúng origin, indexes và FK insert order không deadlock, decimal native range, staged historical data cases. Không tuyên bố migrations safe từ Prisma validate/generate/typecheck.

## I. Phased Implementation Roadmap

Mỗi phase/slice cần authorization mới đúng phạm vi; design approval **không** tự cho sửa schema, chạy PostgreSQL, mở API, Git hoặc deploy. Frontend stable modules có thể thiết kế song song database design; tài chính chờ business/API contract tương ứng, không bắt mọi UI đợi toàn backend.

| Phase | Dependencies / deliverables | Acceptance gate / stop condition |
|---|---|---|
| **0 — Repository/source audit (lượt này)** | Actual paths/hierarchy/Git/schema/migrations/config read-only; preserve86existing files | Evidence A/B/L; không mutate sources/DB |
| **1 — Proposal (lượt này)** | Một file này: wallet contract/model/proof/Q1–Q8/W01–36/roadmap/5questions | **READY FOR OWNER BUSINESS & TECHNICAL REVIEW**; dừng, chưa design approved |
| **2 — Documentation synchronization** | Owner business+technical choices, authorization docs mới; update F theo Requirements→UC→Register→DB→DD→API→classes→plan→historical addendum | **D-source gate:** no unresolved wallet/direct-pay/no-credit/lifetime/execution conflict; explicit legacy limitation; diffs reviewed, no implementation. Nếu owner không duyệt wallet, giữ baseline, không tự implement fallback engine |
| **3 — R1b preparation** | Phase2 reviewed + separate authorization; `docs/ai/reviews/database/R1B_IMPLEMENTATION_PLAN.md` tương lai (kiểm exists trước tạo), exact minimal PSL/SQL/role/parent/inverse/C1/history/index deltas, migration precheck/rollback/test protocols | **D-technical gate:** source/auth lock graph/grants and immediate/deferred guard inventory reviewed, source history/backfill disposition. R1b không phụ thuộc full wallet schema/G engine. Dừng trước schema changes |
| **4 — R1b implementation** | Explicit R1b authorization, approved minimal diff; preserve R1a; reviewed custom SQL migration; authorized disposable PostgreSQL environment | **S:** schema/client validate/generate/typecheck/nested relations. **P:** migrations applied and catalog/negative/≥2connection/fault/role/tz/source tests actually pass. Không PG environment ⇒ P NOT RUN, không tự chuyển R2 |
| **5A — R2-A generations** | R1b required P gate + separate R2-A authorization; G1/G2/JSON/history/price/CAS, scoped API only if separately approved | D design→S schema/client→P migrations/constraints/races→R service/jobs replay/source/authorization. No wallet effect just because G schema exists |
| **5B — R2-B invoice lifecycle** | Reviewed R2-A contract/evidence + authorization; issue/counter/due/claims/approval/adjust/cancel; refund interface defined C/D | Review independently. Chưa R2-C financial implementation thì block paid-wallet adjustment effects, không fake success/no-credit gap. No R2-B runtime invoice correction release before atomic wallet integration tests |
| **5C — R2-C wallet** | Approved business/source/API permission contracts + authorized schema/SQL/service slice; top-up/pay/refund/reversals/reconciliation, signed allocation cutover | W01–36 applicable tests at P/R layers, financial history/security + legacy inventory. No background financial API exposure hoặc cash-out từ schema alone |
| **5D — R2-D integration verification** | Separately authorized integration: Billing↔Wallet↔Approval↔Jobs/Idempotency↔Reporting | Actual PG concurrency/migration upgrade/rollback and runtime permissions/unknown commit/crash tests, B+A=T/scope/report consistency; independent delta review before migration/runtime readiness claims |
| **6 — Feature delivery** | Each approved vertical slice: NestJS/API contract, Figma/UI, React, E2E, deployment, MVP acceptance | UI modules ổn định có thể parallel theo spec; Figma write/API/runtime/deploy đều cần authorization tương ứng. Không thực hiện phase này trong proposal task |

**Gates độc lập:** D = thiết kế/source được phê duyệt có authority; S = schema implemented and client validated; P = PostgreSQL migrations applied and tested với concurrent clients; R = runtime feature tested và ready theo scoped API/security. Tạo proposal không đạt D; R1a S evidence trước đây không chứng minh P/R; offline numeric examples không chứng minh SQL rollback/locking. R1b không đồng nghĩa R2/R3–R6 đã xong; roadmap R3 Scheduling/Attendance, R4 IAM/Jobs/Audit, R5 assignments/files, R6 independent delta/migration readiness vẫn giữ, chỉ lấy dependencies thật sự cần slice.

## J. Owner Approval Questions

Chỉ năm câu dưới là lựa chọn business/trade-off cần trả lời; không hỏi lại O-12/Group A invariants hoặc yêu cầu owner thiết kế PostgreSQL. Technical Q1–Q8 ở E là một package RECOMMENDED để review, chưa được auto-sign-off; owner có thể duyệt có điều kiện mà chưa authorize implementation.

| ID | Câu hỏi / default recommendation | Hệ quả cụ thể nếu chọn default |
|---|---|---|
| B1 | **Có chấp thuận ví P0 làm đường thanh toán mới và hoàn đúng excess vào ví khi execute adjustment/hủy đã duyệt, kể cả invoice đã học/thu? Default: Có, theo C/D và simplified package E.** | Amend Q-10/UC-25/26/Group A no-credit có giới hạn; mỗi Payment một invoice, claim/history giữ; bỏ new excess-case engine. Chưa cho sửa nguồn/schema/implementation |
| B2 | **Ai được chi/nạp ví? Default: chỉ nhân sự có financial permission; Student/Parent chỉ đọc đúng student theo contract.** | Không self-service payment/top-up, không tự credit từ request; RBAC/scope seed/API phải review riêng |
| B3 | **Số dư có hết hạn hoặc được rút/hoàn ra ngoài P0? Default: không expiry, không cash-out/external refund operation.** | Giữ leftover khi rời lớp/tenant ngừng học; chủ dự án chấp nhận limitation hoàn tiền ngoài; nhu cầu cash-out mở scope/policy riêng |
| B4 | **Top-up sai đã tiêu xử lý thế nào? Default: manual approval, chỉ full reversal khi available balance đủ; thiếu tiền thì chặn và đối soát, không âm ví.** | Không xóa lịch sử/giả credit/đảo payment đúng; có thể còn pending correction đến khi legitimate funds và checks cho phép |
| B5 | **Legacy/mixed có được tự chuyển thành ví? Default: không; giữ nguồn gốc, chặn mixed payment/excess-producing execution đến khi có policy riêng.** | Không opening balance từ old payments, không auto refund external portion; legacy còn nợ hoặc cần hủy/giảm gây dư phải có policy thu/đối soát riêng trước cutover affected invoices |

Không coi im lặng hoặc việc owner yêu cầu proposal là approval B1–B5/Q1–Q8. Manual recovery synchronous sau4, local calendar cutoff, lock/grant/G JSON defaults là technical recommendations có giải thích, không thêm câu hỏi PostgreSQL riêng. Nếu owner cần background-after4/cash-out/mixed refunds thì đó là scope delta trước source sync, không tự mở.

## K. Verification Actually Run

Chỉ các kiểm tra **offline** sau thuộc task này, không install dependencies hoặc gọi external services:

| Kiểm tra | Kết quả / giới hạn |
|---|---|
| Git status/branch/HEAD, unstaged/staged diff stat; actual paths/source sections/schema/package configuration | PASS: baseline A, untracked technical report ghi nhận; actual Architecture path đã resolve, no migrations dir; relevant sources B được đọc |
| Snapshot manifest SHA-256 + staged/unstaged binary diffs trước write | PASS:86existing files, temporary snapshot L; không thêm snapshot vào repo |
| Reference arithmetic bằng Node BigInt | **RUN OFFLINE:20/20 reference vectors PASS** (V01–V20): top-up/payment/refund/adjustment/reversal/conservation/precision; synthetic contract calculations, không execute service/DB code. Kết quả `offline-reference-results.json` trong temp snapshot L |
| Markdown structure/links/tables/fences, W01–W36 và Q1–Q8 completeness; whitespace | **311/311 offline assertions PASS** gồm preservation và structure:22local links,9tables,13sections,36Wcases,8Qsections và5owner questions. Kết quả `document-verification.json` trong temp snapshot L. Report mới kiểm riêng vì untracked không nằm trong tracked diff |
| Git whitespace | `git diff --check` exit0. `git diff --no-index --check -- NUL <report>` exit1 do file mới khác NUL; không whitespace diagnostic (Git có cảnh báo LF→CRLF theo checkout configuration). UTF-8 report kiểm riêng no trailing whitespace/EOF newline/fence balance |
| Preservation/head/index/allowlist check sau write | PASS: chỉ proposal mới;86files có trước giữ hash, including untracked technical report; schema hash A giữ; HEAD/branch/index/tracked diff không đổi |
| Prisma validate/generate/TypeScript/build | **NOT RUN**: schema/code không đổi, không lặp S tests để giả PostgreSQL evidence; previous R1a results chỉ dẫn nguồn |
| SQL/migrations/PG connection/catalog/negative/concurrency/roles/restore/load | **NOT RUN**, chưa authorization; không dùng offline interleaving narrative làm PG PASS |
| Runtime/API/jobs/auth/UI/Figma/E2E | **NOT RUN / wallet NOT IMPLEMENTED**, chưa schema/contract/code authorized; all W cases DESIGNED |

## L. Git Preservation

Baseline: HEAD/branch A; `git status --short` đầu task chỉ `?? docs/ai/reviews/database/TECHNICAL_SIGNOFF_PROPOSAL_R1B_R2.md`; index/unstaged tracked diff rỗng. File proposal chưa tồn tại, được tạo mới; không overwrite report có trước.

Snapshot ngoài repo: `C:/Users/Admin/AppData/Local/Temp/educore-wallet-proposal-b9Sv39/` chứa `manifest.json` (86paths+hash/status/HEAD/branch), `staged.patch`, `unstaged.patch`. Manifest lấy `git ls-files -z --cached --others --exclude-standard`, xử lý UTF-8 paths; hai diffs đầu task rỗng đúng baseline. Đây là kiểm bảo toàn existing Git inventory, không là full backup ignored dependencies/DB hoặc guarantee external user edits không xảy ra.

Allowlist duy nhất: **`docs/ai/reviews/database/WALLET_P0_SIMPLIFICATION_PROPOSAL.md`**. Final check so hashes tất cả86entries, HEAD/branch/index unchanged và added path chỉ report này. Technical proposal untracked có trước, O12 report/addendum, R1a, plan/audit, exported `O12_DOCUMENTATION_SYNC.patch`, Requirements/Design/Register/schema/code/package files được giữ. Không git add/reset/restore/checkout/commit/push/branch/PR, migration/client generation, DB hoặc external service. New report cần owner review trước mọi Git action.

## M. Final Recommendation

Chọn **student tuition wallet với hai bảng mới, signed allocation offsets trên bảng hiện có, explicit financial actions và atomic approved refund**, cùng simplified Q1–Q8 ở E. Đây là phương án nhỏ nhất trong phạm vi đã phân tích vẫn giữ history, current authority, O-12, no overdraw/overpay/double debit/refund và có equations/tests kiểm chứng; không dùng mutable payment/balance-only hoặc thêm settlement framework để giảm khó khăn biểu diễn dữ liệu.

Giới hạn được chọn rõ: staff-only mutations, no expiry/no external cash-out, reject insufficient full top-up reversal, no automatic legacy/mixed conversion; manual synchronous recovery sau exhausted4 không mở worker attempt5. Owner review B1–B5 và technical package trước Phase2; Phase2–6 cần authorization riêng. H-04 vẫn OPEN, không thay schema/code hoặc thực thi R1b/R2.

**Final status: READY FOR OWNER BUSINESS & TECHNICAL REVIEW. DỪNG SAU PHASE 1.**

## N. Owner Business Approval — Phase 2 Docs Sync 2026-10-19

### N.1. Authority và quyết định hiện hành

**Ngày:19/10/2026 · Asia/Ho_Chi_Minh. Authority:** xác nhận trực tiếp của chủ dự án trong cuộc trao đổi, yêu cầu **Phase2 Approved P0 Wallet & Simplified Architecture Documentation Synchronization**. Không tạo chữ ký, reviewer ID hoặc approval ngoài hệ thống. **A–M ở trên giữ nguyên byte content như proposal/history Phase1**, bao gồm status/questions/scope/Git/test evidence cũ; addendum N này mới quyết định business status hiện hành. Không dùng pending questions J hoặc final verdict M cũ để hỏi lại B1–B5.

| Proposal choice / register ID | Owner business choice19/10 | Status / scope |
|---|---|---|
| B1 / WALLET-B1 | Top-up verified thủ công trước invoice được phép, explicit invoice WALLET payment, internal refund đúng excess khi execute adjustment/cancel đã manual-approved kể cả đã thu/học có căn cứ | **BUSINESS APPROVED**; new P0 finance flow, mỗi Payment một invoice/claims/history giữ, no external refund/auto-approval |
| B2 / WALLET-B2 | Chỉ nhân sự có financial permission hiện hành/đúng student-tenant scope mutate; Student/Parent chỉ đọc theo quyền/liên kết hiện hành | **BUSINESS APPROVED**; không self-service payment/top-up hoặc credit từ request |
| B3 / WALLET-B3 | Một ví/student/tenant/no negative/no expiry; không cash-out/tự rút/external bank refund/cross-wallet transfer P0 | **BUSINESS APPROVED**; ví chưa dùng không revenue hoặc allocated Payment, không prepaid/combo P1 |
| B4 / WALLET-B4 | Invalid TOP_UP full reversal cần permission/reason/audit và available balance đủ; thiếu thì reject/controlled handling, không xóa receipt/âm ví/đảo payment đúng | **BUSINESS APPROVED**; top-up và payment reversal khác nhau, exact approval routing/SQL vẫn technical pending |
| B5 / WALLET-B5 | Không tự convert legacy CASH/BANK_TRANSFER/mixed thành ví; inventory/policy riêng trước affected migration/collection/adjustment | **BUSINESS APPROVED**; không opening credit từ tiền đã allocated, không tự resolve old cases |

[Decision Register §G](../../DECISION_REGISTER.md#g-wallet-p0--owner-business-approval-2026-10-19) ghi WALLET-B1–B5; [Requirements](../../../requirements/requirements_analysis.md)5.1 FR-30/31/BR-08/11/Q-10/12/§8 và [UC](../../../requirements/usecase/specification.md)25/26/34/37 là business source đã sync. WALLET-B1 không phải O12-B=B1.

### N.2. Limited supersession và technical status

Owner **PRINCIPLE ACCEPTED ARCH-SIMPLIFY-P0**: minimal NestJS modular monolith/PostgreSQL, reuse existing modules/tables và một FinancialCoordinator; transactions/row locks/FK/UQ/CHECK/idem; triggers/custom SQL chỉ bảo vệ invariant cụ thể; không general ledger/event sourcing/distributed locking/generic workflow/recovery-cycle framework. Đây **không approval chi tiết Q1–Q8**.

Group A direct-invoice external-payment-only/no-auto-credit clause được limited-superseded cho new wallet cohort: TOP_UP riêng receipt, pay.WALLET, approved financial execution ghi signed allocation release+wallet credit; không case engine/dual credit cho cùng event. Original Group A provenance/legacy excess giữ; không auto conversion hoặc suy no-bank-refund thành no-internal-credit. Issue/adjustment manual/current permission/issued history/permanent claims, một logical invoice/student/tenant/month, confirmed attendance, exact VND/HALF_UP/sibling10% và O12-A=A/B=B1/C=C1/D=D **không thay đổi**. Nạp6tháng không combo5%.

Các choice E.Q1–Q8 vẫn **RECOMMENDED / PENDING TECHNICAL SIGN-OFF**: per-User/Tenant locks/fresh RC/order/grants/all-writer coverage; G typed metadata/JSON/current-applied pointer/CAS/source recheck; state/actor/retention/jobs/fencing/outbox; manual executor sau4/requeue<4/lifetime prose clarification; local-year counter/dueAt; signed allocation fields/partial UQs/pairing/LIFO/payment reversal net remaining; exact root receipt schema/routing; precision/source lineage/API. No auto technical approval từ câu B1 “default package” của proposal cũ: owner Phase2 chỉ approve business+principle. API operations/paths/DTO/permission codes vẫn **PROPOSED / PENDING API REVIEW**, không mounted endpoints.

### N.3. Documentation synchronization và acceptance

Phase2 chỉ sửa18existing authorized docs: Requirements→Use Cases→Register→DB→DD→API→8classes→Remediation Plan→append-only proposal addenda→Project Context (thứ tự source precedence được giữ; Context là hướng dẫn tham khảo). Không UC mới/renumber IDs. DB/DD nêu rõ Allocation hiện có **hai UQs** payment và payment/invoice cùng chặn releases; propose partial base-only key/collection back-relation/signed entries, không giả schema hiện đã hỗ trợ partial refund. Wallet cohort P=base+releases, **không** exclude reversed payment rồi trừ offsets thêm lần2; full reversal800 đã refund100 chỉ credit remaining700 là technical expectation. Refund amount=max(P_before−N_after,0), B=ΣWT>=0 và B+A=T, no half-effects, no legacy minting.

**36 historical W01–W36 giữ nguyên và đều DESIGNED.** Numeric offline20vectors/311document checks ở K là **evidence task Phase1**, không Phase2 implementation/PG/runtime results. UC bổ sung AC-25-03–10/AC-26-04–10/AC-34-04/05/AC-37-05/06 đều **DESIGNED**; manual after4 path vẫn technical proposal. Không đổi test thành PASS vì business approval hoặc tài liệu aligned.

Original O12 report/addendum N, R1a/audit/schema/code/AGENTS giữ nguyên; chỉ append addendum cho report này và Technical proposal, không rewrite history. Head/branch/index trước task: `9d5fb7c39a6dcd605fe36bc544d85bf217009e63` / `feat/prisma-p0-schema`, hai proposal untracked có trước. Snapshot87files+diffs trước task ngoài repo `C:/Users/Admin/AppData/Local/Temp/educore-wallet-phase2-4UYOpg/`; preservation/offline results task này báo riêng trong final. Không new report/code/SQL file trong repo.

### N.4. Remaining gates và stop

**Verification Phase2 thực sự chạy:**355/355 offline document/preservation assertions PASS: đúng18existing allowed docs,69file ngoài scope giữ SHA-256, original prefixes của2proposal giữ byte-for-byte, FR/NFR/BR/Q/UC IDs và các O-12 sections/khối R3–R6 không liên quan giữ. Kiểm154local Markdown links/anchors,314tables không lỗi shape, fences/whitespace/19new ACs/36historical Wcases và40TS-H protocols. Hai table-escape lỗi có trước trong API money/price row được sửa formatting, không đổi pricing semantics. Kết quả `phase2-verification.json` tại temp snapshot trên; Git diff/status/stat/name checks read-only, tracked whitespace exit0. Không chạy lại20reference vectors Phase1 như implementation tests; Prisma/SQL/PG/runtime NOT RUN. Các số này là document checks, không financial feature evidence.

Wallet schema/API/runtime **NOT IMPLEMENTED**, R1b/R2 chưa triển khai, H-04 **OPEN**; Prisma/TypeScript/SQL/migrations/PostgreSQL/concurrency/runtime **NOT RUN trong Phase2**. D-source business sync không là D-technical/S/P/R. No database connection/external services/Git stage/commit/push/branch/PR.

AGENTS còn “refund automation” và Architecture còn “tự hoàn tiền” ngoài authorized edit list; giữ nguyên, ghi backlog reconcile wording trước implementation để ngoại lệ internal-wallet không bị hiểu thành external refund hoặc agent implementation permission. UI/README/SCREEN candidates không sửa; UI financial flows cần scope review riêng. Đây không cản business-source docs sync đã được owner authorize, không tự mở hard boundaries.

**Next recommendation:** owner review Phase2 diff, sau đó authorization riêng cho minimal **R1b preparation/technical sign-off** O-01/minimum O-04/O-13, exact schema/SQL/parent/inverse/C1/history/grants/precheck/two-client test plan. Không tạo plan mới hoặc chuyển phase trong task này. R2-A/B/C/D và API/runtime cần các gate/authorization sau, không hỏi lại B1–B5.

**PHASE 2 DOCS SYNC COMPLETED — READY FOR REVIEW. DỪNG SAU DOCUMENTATION VERIFICATION.**
