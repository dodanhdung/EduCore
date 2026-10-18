> **QUYẾT ĐỊNH HIỆN HÀNH: xem [addendum N](#n-final-approved-decision--2026-10-18).** Chủ dự án đã duyệt O12-A=A (local session date), B=B1, C=C1, D=D ngày 18/10/2026. Toàn bộ A–M bên dưới, gồm lựa chọn O12-A=B (charge-time pricing), 28 test cases, 12 invariants và các nhận định kiểm thử cũ, là **HISTORICAL PROPOSAL / SUPERSEDED ở phần xung đột**. Giữ nguyên để truy vết; không dùng các recommendation/câu hỏi ở M hoặc chỉ dẫn đồng bộ L làm quyết định hiện hành. Approval nghiệp vụ không là approval triển khai schema/migrations.

# EduCore — O-12 Final Business & Technical Decision Proposal

**DRAFT LOCAL · 18/10/2026 · Asia/Saigon · RECOMMENDED / PENDING_APPROVAL.**

## A. Executive Summary

**Khuyến nghị duy nhất cho P0: giá theo thời điểm tạo khoản tính phí được nhận bền vững; tháng hóa đơn theo ngày bắt đầu session tại timezone tenant; freeze timezone sau nguồn thời gian đầu tiên; retry giữ generation, recompute có chủ đích tạo generation mới.** Bốn lựa chọn này giải quyết những câu hỏi khác nhau, không được gộp thành “ngày buổi = ngày áp giá = tháng tạo draft”.

| Quyết định | Recommended contract |
|---|---|
| A — Price-effective Date | **B: charge creation time**. `chargeCreatedAt` là timestamp UTC do DB lấy một lần khi nhận durable generation; `pricingLocalDate=local_date(chargeCreatedAt, timezoneSnapshot)`. PriceRule dùng DATE nên đối chiếu ngày này với `[effectiveFrom,effectiveTo)`. |
| B — Billing Period Attribution | **B1: local session start**. `sourceBusinessDate=local_date(ClassSession.startsAt,Tenant.timezone)`. Buổi qua tháng thuộc tháng bắt đầu, một participation không tách hoặc đưa vào tháng tạo draft. |
| C — Tenant Timezone | **C1: freeze P0**. Ops cấu hình trước nguồn đầu tiên; sau đó timezone/freeze marker bất biến. Snapshot lưu timezone và các ngày đã suy ra. Không mở timezone transition hoặc policy editor P1. |
| D — Retry/Recompute/Snapshot | Initial G1 pin clock/policy/pricing/source snapshot. Retry cùng key dùng G1. Recompute DRAFT có key/reason mới tạo G2 với clock/policy/pricing mới, giữ G1 history. ISSUED không recompute/repin/reprice. |

Lựa chọn A=B phù hợp **BR-06 và UC-21 bước4**, được DB-08 lặp lại. A=giá ngày session chỉ phù hợp DD §5.7 và sẽ cần đổi cả Business Source of Truth, không chỉ sửa một technical comment. Đề xuất này **giữ nguyên ý nghĩa BR-06/UC-21**, bổ sung định nghĩa còn thiếu của “lập khoản tính phí”, và đề nghị sửa DD sau approval. Không tự sửa bất kỳ nguồn nào.

Ví dụ hệ quả phải chấp nhận: buổi 20/09, tariff 100.000 đến hết 30/09, tariff 150.000 từ 01/10, charge được nhận 02/10 ⇒ **invoice tháng9, đơn giá150.000**. Đổi sang giá100.000 vì ngày học sẽ là phương án A khác business rule hiện tại. Recompute vào tháng11 có thể đổi giá của **draft tháng9**; phải là command mới, có diff/audit, không phải retry tự động.

**Phạm vi task:** chỉ tạo `docs/ai/reviews/database/O12_DECISION_PROPOSAL.md` theo chỉ dẫn vị trí review cuối của user. Không sửa schema, R1a, Requirements/design/API/register; không migration/PostgreSQL/Git write hoặc implementation. Mọi DDL/type/state/endpoint extension bên dưới là proposal, chưa applied/validated.

### A.1. Working-copy evidence và tên file thực tế

- Branch `feat/prisma-p0-schema`; HEAD `6173e2efc7d1c2c0d9b8559baf2a858c37b7f867`. Đối chiếu **working copy**, không dùng Requirements HEAD thiếu phần quyết định để bác bỏ v5 hiện tại.
- Requirements có **387 dòng**, §7 tại297, §8 tại369. Schema có **62 models/28 enums**; SHA-256 `28b993a418340523e6e0246fca3bc94bb73e7d5f269a3fb8cf46472565d51b28`, khớp R1a. Không chạy lại Prisma validate/generate trong task docs này.
- Tên thực tế: `docs/design/detailed_design.md`, `docs/design/api_specification.md`; không có `detailed_des.md`/`api_spec.md` như một số tham chiếu cũ. API file là design contract, không phải bằng chứng routes đã implemented.
- Các report hiện ở `docs/ai/reviews/database/`: `SCHEMA_AUDIT_P0.md`, `SCHEMA_REMEDIATION_PLAN_P0.md`, `SCHEMA_REMEDIATION_R1A.md`, `SCHEMA_REVIEW.md`. Không còn ba report đầu tại `docs/ai/` root. Git đã có `D docs/ai/SCHEMA_REVIEW.md` và bản ở reviews trước task; không restore/di chuyển lại.
- Git đầu task: modified schema và Requirements; deleted đường dẫn SCHEMA_REVIEW cũ; bốn report ở reviews untracked; index không có staged diff. Chụp hash **83 file có trước** để kiểm cuối chỉ thêm đúng report này, giữ nguyên các thay đổi/di chuyển của user.

## B. Source conflict matrix — file, section và line numbers

Line numbers áp dụng cho working copy đang đọc. Cột authority phân biệt baseline/Group A với proposal; nội dung tương tự nhau không làm các thời điểm trở thành tương đương.

| File / section / lines | Evidence thực tế | Authority và disposition đề xuất |
|---|---|---|
| `AGENTS.md:13–29,31–39`, Sources/Hard boundaries/Workflow | Requirements > UC > Architecture > design; một approved slice; docs-only không implementation. | Instruction hiện tại; O-12 chỉ được đề xuất, không tự approve hoặc thi hành R1b. |
| `docs/requirements/requirements_analysis.md:11,297,299,369` | Changelog v5, Q-01–15 và Internal-first hiện có đầy đủ. | Business working-copy baseline. Không nhắc lại H-18 như thể §7/8 vẫn thiếu ở working copy. Provenance/sync Git vẫn riêng. |
| Cùng file `:218`, §5 BR-06 | Điều kiện/mức giá hiệu lực tại lúc lập khoản tính phí; không tính lại issued. | Nguồn ưu tiên cao nhất, ủng hộ A=B. Chưa định nghĩa durable clock/generation; đây là phần cần approval mới. |
| Cùng file `:226,254`, BR-14/ví dụ retry | Request pin policy; retry không đổi; quyền kiểm lại hiện hành. | Baseline. Pin theo **request/generation**, không đồng nhất một logical monthly run với mọi recompute request mãi mãi. |
| Cùng file `:315–321`, Q-04/05 | Tenant-local timezone, UTC storage; thay lịch tương lai; attendance confirmed/48h/issue lock. | Baseline. Chưa chỉ định start/end cho attribution tháng hoặc cho phép đổi timezone P0. |
| Cùng file `:333–339`, Q-08/09 | Monthly sources, draft đầu tháng sau, SESSION>CLASS>COURSE, HALF_UP cuối; sibling10% P0. | Baseline; không tự thêm current-month draft, combo/prepaid hoặc daily billing. |
| `docs/requirements/usecase/specification.md:900–915`, UC-21 steps/AC | Bước4 dòng903: khoản phí mới dùng giá lúc lập khoản tính phí; AC915 lưu giá với khoản phí. | UC **cũng ủng hộ B**, không chỉ DB-08. Chọn A phải xử lý conflict với UC-21, không chỉ BR-06. |
| Cùng file `:973–998`, UC-23 | Xác định policy/idempotency, confirmed sources, thiếu giá/attendance ⇒ NEEDS_INFORMATION; retry không thêm invoice. Dòng992: kỳ trước, đầu tháng sau. | Baseline; missing data không được tự coi0. Không coi generation mới là invoice/run mới. |
| Cùng file `:1018–1028`, UC-24 | Issue recheck current rights/source; source changed thì dừng; issued replay trả kết quả cũ. | Baseline; không issue draft stale hoặc tự reprice trong ISSUE. |
| `docs/design/database_design.md:201–212`, §3.6 | Tariff scope/effective windows; monthly periods; one logical run; snapshots có thể JSON. | Group A/design hiện có. Chưa có `chargeCreatedAt` hoặc generation lifecycle chi tiết. |
| Cùng file `:233–239`, Billing Group A | Một invoice/student/tenant/month; tenant/year issue counter; price EXCLUDE `[from,to)`; excess riêng. | Đã duyệt **design**, không phải SQL đã chạy; giữ nguyên, không hỏi lại. |
| Cùng file `:281`, DB-08 | Giá/policy tại lúc lập khoản tính phí; issued không hồi tố. | Đồng hướng BR-06/UC-21; bổ sung contract B, không đổi nghĩa sang session-date. |
| `docs/design/detailed_design.md:226`, §5.7 | Giá tại ngày buổi học. | **Conflict thật** với BR-06/UC-21/DB-08. Proposed disposition: thay bằng charge-time/local pricing date sau approval. |
| Cùng file `:228,334,365–366` | Issue freeze; source precedence; per-slice decisions còn pending. | Header Group A không làm mọi sentence DD trở thành approved business exception. |
| `docs/design/api_specification.md:210–216,369–401,468–475` | Price dates/patch future-effective; monthly run IDEMP; issue riêng; policy/jobs/locks. | Contract proposal; chưa phân biệt generation/recompute clock; không chứng nhận endpoint recompute tồn tại. |
| `docs/design/class design/billing-receivables.md:73–85,255,303–315,344–348` | `resolvePrice(source,at)` chưa định nghĩa `at`; appendix one-invoice/no-overlap đã duyệt, phần314/330 cũ gọi chưa chốt. | Appendix/higher sources thắng đoạn cũ; cập nhật nghĩa `at` theo B sau approval. Không reopen Group A. |
| `docs/design/class design/academic-management.md:264–270`; `resource-scheduling.md:253–262,278` | Transfer chỉ tương lai, giữ history; recheck nguồn/locks; exact locking còn open. | Bảo vệ session/class lineage; không lấy lớp hiện tại sau transfer để đổi giá nguồn cũ. Không mở mutation quá khứ. |
| `docs/ai/DECISION_REGISTER.md:10–20,46–55` | BASE/GA đã duyệt; SCH-TECH/BILL-TECH/WF-TECH còn review. | Không đổi register. Hướng plan được conditional accept không làm O-12 thành APPROVED. |
| `docs/ai/reviews/database/SCHEMA_AUDIT_P0.md:156–164,356–364,612` | H-04 thiếu period proof; M-04 policy/timezone/selection; O-12 open. | Bằng chứng audit snapshot trước R1a, không business authority. Cần delta evidence trước đóng finding. |
| `.../SCHEMA_REMEDIATION_PLAN_P0.md:167–234,448–456,597–617,677` | Proposed O-01 gate/deferred guards; BR-06 precedence; D/S/P/R tách biệt. | Chỉ **RECOMMENDED** technical package; chưa authorization tenant gateway/migration. |
| `.../SCHEMA_REMEDIATION_R1A.md:157–172,193–205` | Validate/generate/typechecks local; student/session keys sửa; period/gateway/PG NOT RUN. | R1a chỉ Gate S có evidence. H-04 chưa fully fixed; không đổi report này. |
| `apps/api/prisma/schema.prisma:184,256–259,1103–1181,1217–1261` | Tenant timezone text; PriceRule DATE; PolicyVersion TIMESTAMPTZ; run chưa có generation/charge clock; line R1a student FK, chưa period guard. | Schema thực tế: không suy ra business month/price time chỉ từ nullable FK hoặc `createdAt`. |

## C. Các quy tắc Group A/baseline đã được duyệt

Giữ nguyên: một logical run/invoice mỗi `(tenant,student,monthlyPeriod)`, gộp nhiều lớp; invoice number chỉ cấp khi ISSUE bằng tenant/year counter; price precedence SESSION→CLASS→COURSE; no-overlap cùng tenant/target `[from,to)` và SQL EXCLUDE cần test; manual issue; confirmed attendance, ATTENDED/UNEXCUSED=1, EXCUSED/CANCELLED=0; sibling10% P0, HALF_UP một lần cuối; immutable issued history và correction/adjustment được duyệt; excess riêng, không auto refund/credit; permission+scope hiện hành; policy/request pin; Internal-first.

O-12 mới cần chọn: **clock của charge**, local-start attribution, freeze boundary và generation semantics. Counter format/dueAt cutoff/excess-resolution/approval execution O-02–07 vẫn ở decision riêng; báo cáo này không tự đóng chúng hoặc hỏi chấp thuận lại invariant đã chốt.

## D. Decision A — Price-effective Date

### D.1. So sánh hai lựa chọn khác nhau

| Tiêu chí | A — local session date | B — durable charge creation time |
|---|---|---|
| Business correctness | Gắn giá với lúc cung cấp dịch vụ, phù hợp cách hứa học phí theo ngày học nếu có policy đó. | Gắn giá với lúc lập khoản phí, phù hợp rule EduCore **đang có**; đúng nghiệp vụ không có nghĩa là hai lựa chọn tương đương. |
| Approved-source traceability | Chỉ DD226 ủng hộ; trái BR-06/UC-21 bước4/DB-08. | BR-06 + UC-21 + DB-08 cùng ủng hộ; DD226 cần sửa sau approval. |
| Explainability | Dễ giải thích “học ngày nào dùng giá ngày đó”. | Phải hiển thị tách ngày học, kỳ hóa đơn, ngày tạo charge và ngày áp giá; không mô tả như giá ngày học. |
| Predictability | Tariff thường biết khi học, ít phụ thuộc ngày tạo draft. | Giá có thể đổi từ ngày học tới đầu tháng sau, hoặc khi deliberate recompute; cần price-diff review/audit và future-effective management. |
| Effective window | DATE của session start tại tenant. | DATE của `chargeCreatedAt` tại frozen tenant timezone; không đổi native DATE sang timestamp. |
| Đổi giá giữa session/draft | Giữ tariff của tháng/ngày session. | Lấy tariff tại charge date; ví dụ Sep100→Oct150, chargeOct ⇒150. Đây là hệ quả chủ dự án phải nhìn thấy. |
| Retry/recalculation | Retry vẫn phải pin dữ liệu; sửa tariff lịch sử có thể làm replay khác nếu không snapshot. | Durable clock **và pricing snapshot** cần pin; clock đơn lẻ không chống mutable rule/backdated override. New recompute được reprice theo clock mới. |
| Invoice snapshots | Lưu sessionDate/effective rule/tariff/policy evidence. | Thêm charge instant, pricingDate, generation, timezone, candidate-selection proof; giữ sessionDate riêng. |
| Migration/service | Không cần charge clock cho pricing nhưng vẫn cần generation/replay/history; phải đổi upstream rule và dữ liệu/fixtures. | Thêm durable generation metadata/pin capture; không đổi money types/month identity; đồng bộ DD và API semantics. |

**Lựa chọn RECOMMENDED duy nhất: B.** Lý do quyết định là authority của BR-06/UC-21, không phải B rẻ hơn hay dự đoán giá tốt hơn. A là lựa chọn sản phẩm hợp lý nhưng cần explicit business change: sửa BR-06, UC-21 và DB-08, đối chiếu UC-23/24/tests rồi mới dùng DD làm contract. Không được định nghĩa ngầm `chargeCreatedAt=session.startsAt` để biến B thành A.

### D.2. Định nghĩa thời gian và tariff selection cho B

`chargeCreatedAt(G)` là **server/DB instant UTC của durable admission generation G**, lấy một lần `clock_timestamp()` sau khi lấy tenant gate và kiểm quyền/idempotency, rồi commit cùng generation/request receipt, policy pin và captured inputs. Không lấy client clock, `computedAt`, invoice.createdAt/issuedAt, thời gian worker attempt, đầu tháng hoặc giờ bắt đầu transaction trước lúc chờ lock. Mọi line trong G dùng chung instant này; batch nhiều student đã được nhận cùng command dùng chung instant, còn mỗi student vẫn có run/invoice riêng.

c là thời điểm lấy mẫu sau gate, **không phải WAL commit timestamp**. Admission chỉ được coi accepted khi commit thành công; nếu commit qua midnight, c đã persist vẫn là mốc áp giá, không lấy lại ngày mới ở apply. Snapshot lưu precision UTC thống nhất, không round giờ/ngày trước timezone conversion.

Nếu admission rollback hoàn toàn, chưa có accepted charge clock nào để giữ; retry chỉ được tạo clock đầu tiên sau khi xác minh không có committed receipt/generation. Nếu outcome COMMIT unknown, tra key trước; không tạo clock mới vì network timeout. Job enqueue/initial request và generation admission phải pin **cùng request policy/clock** atomically; không pin policy lúc enqueue rồi chọn policy khác khi worker chạy. Scheduler cũng tạo generation admission trước compute, không dùng worker wake time làm lần tạo charge mới.

```text
z = G.timezoneSnapshot                         // fixed tenant IANA timezone
c = G.chargeCreatedAt                          // UTC instant, immutable
dPrice = local_date(c, z)                      // YYYY-MM-DD, NOT UTC date
eligible(r,source,G) = sameTenant AND correctTargetHierarchy
    AND r.effectiveFrom <= dPrice
    AND (r.effectiveTo IS NULL OR dPrice < r.effectiveTo)
chosen = first nonempty tier [SESSION(source.session), CLASS(source.class),
                              COURSE(source.class.course)]
if no eligible rule OR ambiguous same-target/tier -> NEEDS_INFORMATION; no fake0
```

`PriceRule.effectiveFrom/effectiveTo` là `@db.Date`: calendar dates trong timezone tenant, validTo exclusive, NULL=infinity. API nên nhận `YYYY-MM-DD`; không parse DATE thành UTC instant rồi render ngược theo timezone để đổi ngày. Rule hết hạn đúng00:00 local không còn eligible. Hai windows tiếp giáp hợp lệ; nhiều cấp đồng thời tồn tại là hợp lệ, cùng target/tier overlap là invalid.

`PolicyVersion.effectiveFrom/effectiveTo` là **TIMESTAMPTZ**, chọn version duy nhất có hiệu lực tại admission instant c, pin cho request; overlap/không có baseline rõ ⇒ reject/NEEDS_INFORMATION, không chọn đại theo ID. P0 dùng baseline được seed/đổi có kiểm soát, không mở dynamic policy editor. `PriceRule.policyVersionId` là provenance của việc tạo tariff; `ClassSession.policyVersionId` là provenance scheduling; không mặc định phải bằng calculation policy của generation. Snapshot lưu các ID riêng. Khi draft READY, run/invoice current calculation-policy phải bằng current applied generation, không silent mismatch.

**Tariff mutation contract RECOMMENDED:** capture các eligible candidates/selected rule và chứng cứ tier không có override trong admission dưới gate. Giá/target/effective-window không được sửa hồi tố để đổi selection của generation có complete pricing capture. Cho phép future-effective rule/override và đóng open window ở ngày tương lai nếu mọi pinned pricingDate cũ vẫn hợp lệ; không đổi amount/target đã dùng. Future close `effectiveTo` có thể đổi row.updatedAt nhưng không tự làm giá pinned stale nếu eligibility/value tại dPrice không đổi. Snapshot cũ giữ original bound; ISSUE kiểm semantic facts tại pinned date, không chỉ so updatedAt/hash toàn current row. Same-date/backdated change làm khác complete captured selection bị pricing command reject. Raw privileged corruption không phải supported price-update path; phát hiện inconsistency thì block/đối soát, không auto sửa invoice.

Phân biệt **snapshot đầy đủ có selected tariff** với NEEDS_INFORMATION chưa chọn được tariff: không được sửa snapshot của cả hai, nhưng một failed/missing-price generation không giữ vĩnh viễn “quyền không có giá”. Bổ sung tariff còn thiếu cho command G2 được phép nếu không đổi selection của bất kỳ complete prepared/applied/issued generation đã có; key G1 vẫn trả kết quả thiếu cũ. DATE windows không mô tả intraday price change: khi ngày đã có complete captured charges, thay giá cho ngày đó bị chặn, publish từ ngày tương lai. Đây là rule kiểm thử được của contract A, không tự phát sinh engine định giá theo giờ.

## E. Decision B — Billing Period Attribution

**RECOMMENDED B1: dùng local date của session.startsAt.** B2 lấy end date sẽ đẩy cả buổi 30/09 23:30→01/10 00:30 sang tháng10 chỉ vì kết thúc sau midnight; nếu end đúng00:00 còn mâu thuẫn trực giác interval `[start,end)`. Không có BR/Q/UC nào yêu cầu service proration/end-date cho P0. Split theo số phút hoặc đưa vào tháng tạo charge thêm mô hình phân bổ chưa được duyệt. Không chọn B2.

```text
I = line.invoice; B = I.period; S = line.session; P = line.participant; T = I.tenant
sameTenant(line,I,B,S,P,T)
line.studentId = I.studentId = P.studentId
line.sessionId = P.sessionId = S.id
sourceBusinessDate = local_date(S.startsAt, T.timezone)
B.monthStart = first_day_of_month(B.monthStart)
B.monthEnd = first_day_of_next_month(B.monthStart)
B.monthStart <= sourceBusinessDate < B.monthEnd
attributionKey(P) = (T.id, P.studentId, first_day_of_month(sourceBusinessDate))
```

Một participation/session không split qua hai month keys. 30/09 23:30→01/10 00:30 local thuộc tháng9; bắt đầu 01/10 00:00 thuộc tháng10. At UTC+7, `2026-09-30T17:00Z` là01/10, không tháng9. Charge tạo02/10 cho sessionSep vẫn monthSep. Trong P0 Vietnam, UTC bounds tương ứng kỳ Sep là `[2026-08-31T17:00Z,2026-09-30T17:00Z)`; SQL dùng explicit IANA timezone, không session/connection TimeZone hoặc offset hard-code.

Giữ UQ run/invoice `(tenant,period,student)` và UQ permanent claimed participant khi ISSUE; zero lines cũng claim. Không release claim sau cancellation để tính lại nguồn ở kỳ khác. Mỗi student trong cùng session có participation riêng; không cấm charge hai student, nhưng line phải đúng student/invoice.

Q-08/UC-23 yêu cầu lập monthly draft sau kỳ đóng. Initial admission cần local date(c) ≥ period.monthEnd. Vì vậy **session và charge cùng tháng là test negative ở monthly-run boundary**: resolver có thể xác định tariff, nhưng không tạo completed P0 monthly DRAFT sớm. Không mở early/current-month billing để làm test case “pass”. Preview advisory không là accepted charge generation/DRAFT.

## F. Decision C — Tenant Timezone

| Concern | C1 freeze P0 — RECOMMENDED | C2 mutable timezone + attribution snapshots |
|---|---|---|
| Old sessions/month boundary | UTC/session dates có một nguồn timezone ổn định; không phân loại lại khi config đổi. | Cần xác định timezone version cho từng source, date migration, collision/gap giữa periods; giữ UTC không đủ. |
| Draft/issued | Draft/recompute dùng cùng timezone; issued snapshot giữ evidence. | Phải phân biệt old draft attribution với new config; không rewrite issued; hai month identities có thể xung đột. |
| BillingRun đang chạy | Gate/freeze reject config change; retry giữ z. | Cần transition barrier, khóa mọi affected run/source, xử lý prepared generations và backfill đồng bộ. |
| Reproducibility | Lưu z + derived dates + snapshot. Cần kiểm timezone-data upgrade, không chỉ freeze string. | Phải thêm effective timezone versions/source mappings/transition audit nhiều hơn. |
| Authority/Prisma/PostgreSQL | Sticky marker, guards và controlled Ops trước source; Prisma field + custom SQL. | Thêm tables/fields/protocol, Prisma không tự biết tz/history; vượt nhu cầu P0. |

**Contract C1:** Ops chỉ được cấu hình IANA timezone hợp lệ trước first persisted time-bearing source. Default `Asia/Ho_Chi_Minh`. Freeze ở thời điểm đầu tiên có **ScheduleSeries hoặc ClassSession (kể cả DRAFT), BillingPeriod hoặc BillingRun/generation**; dùng boundary bảo thủ để không đổi nghĩa recurrence/period đã tạo. Đây là điều kiện rõ hơn “khi có dữ liệu”, cần owner chấp thuận. Profiles không có source thời gian chưa tự freeze.

Đề xuất `Tenant.timezoneFrozenAt TIMESTAMPTZ?` là sticky marker, DB set cùng transaction tạo source đầu; không clear khi cancel/delete source cuối. Runtime không được sửa marker hoặc timezone sau freeze; không có generic Manager/Student/Parent timezone endpoint P0. Ops cũng không có quyền app bypass sau freeze; thay timezone của tenant đã có nguồn cần task migration/transition riêng, không mở C2 trong P0. Before first source, change có actor/reason/audit và expected tenant revision/timezone CAS.

First-source-vs-timezone-change cùng tenant gate: config change commit trước ⇒ source writer đọc timezone mới/kiểm expected revision, không dùng preview cũ; source commit trước ⇒ timezone change reject. Rollback first-source transaction rollback freeze cùng nguồn. Các generations giữ z bất biến. Existing sources khi backfill marker phải inventory/kiểm local month trước, không gán timezone mới hoặc dời issued history để “làm sạch”.

Snapshot lưu timezone ID, sourceBusinessDate, pricingLocalDate và UTC source bounds. Deployment PostgreSQL/runtime phải dùng timezone data tương thích; upgrade timezone DB có kiểm boundary fixtures. Không tuyên bố freeze IANA string đủ tái tạo mọi historical offset nếu nhà vận hành thay tzdata. P0 default Vietnam không cần mở sản phẩm timezone-version editor.

## G. Decision D — Retry/Recompute/Price Snapshot

### G.1. Bốn hành vi và ISSUE

| Hành vi | Giá/policy/charge clock | Snapshot/generation/audit | Không được phép |
|---|---|---|---|
| 1. Initial BillingRun tạo DRAFT | Admit G1: clock c1, local pricingDate1, policyV1 active tại c1; resolve prices từ captured catalog tại date1. | Source/price/policy payload pin trước compute; logical monthly run/invoice giữ một. Draft applied atomically, audit G1/source hash/result. | Thiếu giá/confirmed source thì NEEDS_INFORMATION; không coi thiếu là0, không auto issue. |
| 2. Retry cùng operation/key | Giữ G1/c1/V1/z/pricing snapshot, không query current catalog để chọn lại. | Replay applied G1 trả generation-result cũ; chưa applied có thể retry cùng captured inputs nếu vẫn coherent. Audit technical attempts riêng, không nhân business effect. | Không tạo G2, không đổi c theo worker retry, không repin V2. Changed sources ⇒ STALE/NEEDS_INFORMATION; cần command mới, không sửa payload G1. |
| 3. Deliberate recompute DRAFT | New key+reason+expected generation ⇒ G2, clock c2/policy active tại c2, reselect **toàn bộ** draft prices tại date2. Có thể vẫn ra giá/policy cũ nếu chưa đổi. | G1 snapshot/result giữ history; G2 mới chứa source correction/eligibility hiện hành; audit before/after totals/rule IDs/policy/clock/hash. Cùng run/invoice identity, không invoice thứ hai. | Không dùng recompute để rewrite issued. Không auto reprice chỉ vì source mutation; chưa có staff/system policy command được duyệt thì mark stale. |
| 4. ISSUED + correction/adjustment | Original charge clock/unit-price/policy giữ. Correction không gọi recompute. Proposal monetary difference dùng original issued pricing basis và phép tính có quyền; approval/adjustment riêng. | Issued header/line/discount/claim snapshots immutable; append correction/adjustment/audit. Policy hiện hành cho quyền/operation mới không viết lại old price basis. | Không lấy tariff mới để âm thầm tính lại invoice cũ, không bỏ claim/reissue tháng khác, không prepaid/combo/refund engine. |
| ISSUE current DRAFT | Không tạo price/policy selection mới hoặc reset c; issue instant chỉ cấp number/dueAt/history. | Recheck current authority, completeness, latest source revisions và pinned price eligibility; claim/freeze/issue/audit atomic. | Source relevant changed ⇒ block/review/recompute mới; không “sửa rồi phát hành” trong ISSUE. Future tariff thay đổi không liên quan date1 không tự stale/reprice. |

Nếu chủ dự án muốn recompute giữ giá/policy G1 bất kể request mới, đó là contract D khác phải chọn rõ; proposal duy nhất ở đây là **G2 là request mới**, V2/price tại c2. Điều này phù hợp BR-14 cho request mới nhưng làm dự thảo có thể đổi tiền, nên phải hiển thị diff và reason cho người review. Không giả hai semantics cùng là default.

### G.2. Durable admission và generation persistence

Đề xuất R2 thêm **BillingRunGeneration** (không thay logical run UQ). Immutable payload tối thiểu: id/tenant/run/student/period, generationNo, operationType/key, requestHash, baseGenerationId, expectedAppliedGenerationId?, chargeCreatedAt, timezoneSnapshot, pricingLocalDate, calculationPolicyVersionId, sourceSnapshotJson, pricingSnapshotJson, inputHash; mutable execution metadata riêng: state/result/error/attempt references/appliedAt. Result snapshot bất biến sau apply. Capture pricing includes candidates/precedence/absence-of-higher-tier proof, selected values/windows/provenance/content hash; nguồn gồm session/participant/attendance revisions và sibling eligibility evidence. Hash không thay snapshot content.

Keys/FKs đề xuất: UQ `(tenantId,runId,generationNo)` và `(tenantId,operationType,operationKey)`; thêm candidate `(tenantId,billingRunId,id)` để base/current/invoice generation FK buộc cùng run, không chỉ cùng tenant. Tenant/run/student/period composite consistency giữ nguyên; generation base phải có số nhỏ hơn, không self/cycle. Tối đa một pending PREPARED generation/run bằng reviewed partial predicate. State names PREPARED/APPLIED/NEEDS_INFORMATION/STALE/FAILED/SUPERSEDED là **PROPOSED**, không thêm enum/status hiện tại trong task này. Only execution status có thể tiến triển, payload đã nhận không đổi. Failed attempts không là generation mới.

| Proposed persistence field | Type / rule cụ thể |
|---|---|
| Generation `billingRunId` | UUID; `runId` trong pseudocode/key ở trên là alias của field này. FK `(tenantId,billingRunId,studentId,periodId)` → BillingRun candidate đang có. |
| `chargeCreatedAt`, `pricingLocalDate`, `timezoneSnapshot` | TIMESTAMPTZ(6), DATE, TEXT NOT NULL; immutable; local-date equality do trusted admission derive/check. |
| `generationNo`, `baseGenerationId?`, `expectedAppliedGenerationId?` | Positive Int; nullable UUID refs cùng tenant/run, không cross-student/month; generationNo tăng dưới run lock. |
| `calculationPolicyVersionId`, snapshots/hash | Tenant policy FK; JSONB có schemaVersion và exact string money/ISO UTC/date; canonical hash, không arbitrary client JSON. |
| BillingRun `currentGenerationId?`; Invoice `generationId` | Run pointer có thể NULL khi chưa có draft; materialized invoice trỏ required applied generation của cùng run/student/period. Update pointers/policy/hash cùng transaction apply. Existing rows cần provenance backfill riêng trước NOT NULL, không tự suy c từ now(). |

`baseGenerationId` là generation được nhận gần nhất của cùng run (kể cả NEEDS_INFORMATION), xác định/so expected generation dưới BillingRun lock; `expectedAppliedGenerationId` là current applied pointer hoặc NULL. Hai giá trị không bị gộp khi chưa có invoice. D2 CAS expected applied pointer và kiểm generation đang là pending/latest hợp lệ. G1 NEEDS_INFORMATION/STALE có thể được thay bằng **fresh command G2 ngay cả khi chưa tạo invoice**; nếu invoice đã có thì phải DRAFT, tuyệt đối không ISSUED/CANCELLED-after-issue. Chọn policy lại tại c2 không tự tạo PolicyVersion mới; nếu baseline chưa đổi thì policy ID vẫn V1.

**Hai transaction phases, cùng lock protocol J:**

1. **Admit/capture:** current auth + typed key/hash; verify monthly identity/closed period; sample c sau tenant gate; pin V/z; read committed source set/candidate catalog và lưu payload/receipt atomically. Nếu incomplete có durable NEEDS_INFORMATION generation, không completed DRAFT. Enqueue compute job cùng commit nếu async, giữ đúng c/V; không commit job “trước” rồi worker tự chọn lại. Duplicate key trả generation đã nhận. Không external I/O.
2. **Apply:** gate lại, load immutable G, recheck source relevant facts/current authority và expected base generation; nếu đổi thì STALE/block, không refresh G. Nếu coherent, write/update cùng logical draft invoice + lines/discounts/current generation/result/audit atomically. Run/invoice current policy projection đổi cùng pointer khi G2 applied; không đổi run.policy sang V2 lúc chỉ mới prepare G2 mà invoice vẫn là G1 READY. Initial run chưa có applied generation có thể ở preparing/needs-info, không có invoice READY.

Recompute G2 admission làm current draft không còn issue-eligible cho tới apply/review, dù có thể giữ view G1 để đối chiếu; không expose old snapshot như current verified total. G1 payload giữ nguyên, trạng thái execution/history có thể superseded. Retry G1 sau G2 trả **immutable G1 result resource**, không ghi G1 trở lại invoice G2; muốn current invoice phải đọc current-generation projection riêng. Cùng key/khác body ⇒ conflict, không đè pin; hai recomputes khác key cùng expected base không cùng thắng CAS.

Snapshot time semantics không dựa vào `BillingRun.createdAt` vì logical run sống qua nhiều requests; cũng không dựa vào `InvoiceLine.createdAt` vì draft lines được replace. `computedAt` là completion time, không được đổi ngày áp giá. Generation metadata phải durable trước expensive/retriable apply; clock-only JSON được rewrite theo draft không đủ.

### G.3. Pricing/rounding và source correction

Snapshot lưu **hai ngày** độc lập: service `sourceBusinessDate` để chọn month; `pricingLocalDate` để chọn tariff. Với G cùng student/month, các lines dùng cùng charge date nhưng mỗi session/class/course hierarchy có thể chọn tariff khác. Không dùng enrollment/class hiện tại sau transfer để rewrite source.class; dùng session/class/course lineage đã kiểm chứng và snapshot.

Gross=`SUM(chargeUnits×unitPriceVnd)`; ATTENDED/UNEXCUSED=1, approved EXCUSED/CANCELLED=0; source thường cần confirmed attendance đúng session. CANCELLED có thể không có attendance; vẫn chọn tariff hợp lệ/snapshot để giải thích, base0. Nếu thiếu tariff kể cả zero source ⇒ NEEDS_INFORMATION theo UC-23-2a, không invent giá0. Giá0 hợp lệ là một explicit PriceRule unit0, khác missing price.

P0 net=`ROUND_HALF_UP(gross×0.90)` nếu verified sibling hợp lệ, ngược lại net=gross; discountVnd=gross−net. Chỉ round một lần ở invoice cuối; VND BigInt/Decimal, JSON strings. Eligibility/policy proof pin trong G; thay đổi relevant source/verified sibling trước ISSUE làm draft stale, không đổi grant hay policy âm thầm.

After issued: attendance correction có quyền/lý do/audit, financial effect chỉ qua UC-26. Nếu cần đề xuất chênh lệch do units sai, giữ original unit-price/discount-policy basis để reviewer so sánh; không tự post adjustment. Việc đổi giá có chủ đích sau issue phải là explicit authorized adjustment riêng, không coi là O-12 repricing. O-05–07 còn phải xử lý adjusted totals/excess/approval routes trước R2 runtime.

## H. Recommended O-12 contract — invariants có thể kiểm thử

| ID | Invariant / assertion | Layer đề xuất |
|---|---|---|
| O12-I01 | For every persisted line: same tenant; `line.student=invoice.student=participant.student`; `line.session=participant.session`. | R1a FK giữ, PG verification còn pending. |
| O12-I02 | `monthStart <= local_date(session.startsAt,z) < monthEnd`, bounds là tháng chuẩn; end time không quyết định month. | R1b period CHECK + cross-row guard/transaction. |
| O12-I03 | Một `(tenant,student,month)` chỉ một logical run/invoice; mỗi participation chỉ một permanent issued claim, kể cả units0/cancellation. | UQ/FK + ISSUE completeness protocol. |
| O12-I04 | `pricingDate=local_date(G.chargeCreatedAt,G.z)`; PriceRule DATE range `[from,to)`, target đúng hierarchy, precedence cố định. | Generation checks + price-selection command/snapshot, EXCLUDE target. |
| O12-I05 | Same typed key/hash ⇒ same generation/c/policy/z/pricing payload, không duplicate invoice/result/effect; different hash ⇒ conflict. | Durable key UQ + atomic receipt/replay/current auth. |
| O12-I06 | G2 chỉ do explicit new command/reason/base CAS khi chưa issued: invoice chưa tồn tại hoặc đang DRAFT. c2/policy-selection2/pricing2 mới, G1 payload không sửa. | Generation ownership/current-pointer guards/service. |
| O12-I07 | READY current run/invoice/generation có cùng calculationPolicyVersionId và source/input hash tương ứng; source relevant changed ⇒ không ISSUE. | Atomic projection update + revalidation. |
| O12-I08 | Frozen timezone/marker không đổi/clear; new source và freeze atomic; cancelled/deleted sources không unfreeze. | Sticky field + DB privilege/guards + same gate. |
| O12-I09 | Issued snapshot/clock/basis/claims không mutate; correction/reversal/adjustment append, không auto reprice. | History privileges/triggers + approved command. |
| O12-I10 | Missing confirmed source/price/ambiguous tier không biến thành0 hoặc arbitrary first rule. | NEEDS_INFORMATION/stale state, no fake completed draft. |
| O12-I11 | Price update không đổi complete captured selection cho G pricingDate; missing-price failure không giữ tariff vacancy vĩnh viễn. Future changes/G2 không repin G cũ. | Price mutation command/dependencies + frozen catalog proof. |
| O12-I12 | `net=HALF_UP(Σunits×unit×discountFactor)` cuối cùng, amounts exact string JSON; không P1 combo/prepaid. | Decimal/BigInt computation + CHECK/issue validation. |

Trong P0 Vietnam timezone cố định, source UTC interval tương ứng month có thể dùng để index scan; predicate chuẩn vẫn explicit tenant-local date. Không dùng ngày UTC/month hiện tại, không CHECK phụ thuộc `now()` để tự chuyển kỳ. Snapshot date/id phải được server/DB derive, không chỉ tin JSON client.

## I. Decision Test Matrix

**Tất cả là acceptance plan, chưa chạy PostgreSQL/runtime.** Fixtures VND minh họa: R09 COURSE100.000 `[2026-09-01,2026-10-01)`; R10 COURSE150.000 `[2026-10-01,2026-11-01)`; R11 COURSE200.000 `[2026-11-01,∞)`. Time local=Asia/Ho_Chi_Minh trừ khi ghi UTC; V1 active trước01/11 local, V2 chỉ khi baseline mới được Ops duyệt/seed từ01/11. Default participant ATTENDED/confirmed, no sibling, one source. Các override/case cố ý bad data nêu riêng.

| Test | Input | Price-effective instant/date | Billing month | Price-selection expected | State/result và reject/rollback | Service/SQL enforcement |
|---|---|---|---|---|---|---|
| O12-T01 | Session10/09; yêu cầu charge11/09 cho kỳSep | Requested c=11/09, date11/09; chưa accepted | Sep theo session | Pure resolver R09=100k, nhưng không tạo monthly draft sớm | Reject PERIOD_NOT_CLOSED; không commit charge clock/G/DRAFT | Admission closed-period check; không mở exception Q-08 |
| O12-T02 | Session20/09, initial c=02/10 09:00 | `2026-10-02T02:00Z` /02/10 | Sep | R10=150k, không R09 | G1 DRAFT150k; snapshot chứa hai ngày khác nhau | O12-I02/I04; generation capture |
| O12-T03 | Session30/09 10:00 giá ngày học100k; charge01/10 | 01/10 local | Sep |150k; minh chứng A≠B (A sẽ100k) | DRAFT150k, không ghi nhãn “giá ngày học” | BR-06/UC-21; source/pricing snapshot riêng |
| O12-T04 | G1 c02/10; sau đó công bố R11 tương lai; retry02/11 cùng key | Vẫn c02/10/date02/10 | Sep | R10=150k/V1 từ G1, không200k/V2 | Replay/retry G1, không thêm generation/invoice | Immutable payload, typed idem/result |
| O12-T05 | G1 NEEDS_INFORMATION vì thiếu confirmed attendance; sau đó finalize | c1/date1 không đổi khi replay key | Sep | Không refresh giá/capture sources theo key cũ | Key cũ trả pending result; explicit G2 mới nhận nguồn mới | Source fingerprint; incomplete không coi0 |
| O12-T06 | G1 DRAFT150k; privileged correction ATTENDED→approved EXCUSED; recompute03/10 key mới | c2=03/10/date03/10, V1 | Sep | R10 reselected150k, units0 ⇒ base0 | G2 DRAFT0; G1 giữ history; correction thiếu quyền thì reject | Correction auth/audit, generation CAS/issue stale guard |
| O12-T07 | G1 c02/10; R10 đóng ở01/11/R11 future; intentional recompute02/11 | c2=02/11/date02/11, V2 | Sep | R11=200k cho toàn G2, không giữ150k ngầm | Same logical invoice, G2 amount200k; audit diff+reason | Date windows, new-request policy pin, current pointer atomic |
| O12-T08 | Sửa trực tiếp R10 amount150k→160k tại date đã capture | G1 date02/10 | Sep | Không cho thay snapshot/selection đã dùng | Reject pricing mutation; rollback rule change/audit business | Price writer gateway/reference guard; raw admin corruption cần alert |
| O12-T09 | Retry G1 sau G2 đã applied | c1/date1/V1 | Sep | Immutable G1 result150k, không chọn lại/G1 write-back | Current invoice vẫn G2; đọc G1 result resource, không overwrite | Result history/base CAS/current generation |
| O12-T10 | Session30/09 23:30→01/10 00:30, charge02/10 | c02/10/date02/10 | **Sep** | R10=150k toàn một participation | Một line, không split/sinh lineOct | Local-start period guard + issued claim |
| O12-T11 | Session bắt đầu01/10 00:00, charge02/11 | c02/11/date02/11 | **Oct** | R11=200k | Nhét vào Sep invoice ⇒ reject; Oct valid | Half-open lower/upper month guard |
| O12-T12 | Start `2026-09-30T18:00Z` =01/10 01:00 local | c02/11/date02/11 | Oct, không UTC Sep | R11=200k | UTC-month attribution phải fail | Explicit timezone conversion; no connection-zone dependence |
| O12-T13 | c=`2026-09-30T17:00Z` =01/10 00:00, sessionSep | PricingDate01/10, không UTC30/09 | Sep | R09 hết hạn; R10=150k tại inclusive start | G1 hợp lệ nếu nguồn đầy đủ; dateUTC chọn100k là lỗi | DATE range `[from,to)` + frozen z |
| O12-T14 | CANCELLED sessionSep, không attendance; c02/10 | date02/10 | Sep | R10=150k snapshot, units0/base0 | Valid zero line, claim khi ISSUE; không fabricate attendance | Explicit cancel branch; source/pricing checks |
| O12-T15 | CANCELLED nhưT14 nhưng không tariff eligible | date02/10 | Sep | Missing price không phải explicit tariff0 | NEEDS_INFORMATION, không complete/issue | UC-23-2a; no implicit0 fallback |
| O12-T16 | X/Y cùng sessionSep; cùng admitted batch02/10 | Cùng c/date02/10/V1 | Sep cho cả hai | Cùng tariff150k; discount evidence có thể khác | Invoice IX/PX và IY/PY; IX gắn PY ⇒ FK reject | R1a student composite FK + per-student month UQ |
| O12-T17 | Cùng X/student source nhưng cố issue ở Sep rồi Oct | Original c/date pinned | Chỉ Sep | Không chọn tariff lần2 để reissue | Second source claim reject, kể cả invoiceSep cancelled | Permanent participation claim + zero coverage + transaction |
| O12-T18 | Tenant đã có first session/period; Ops đổi timezone | G c/date/z cũ giữ | Month cũ giữ | Không recompute day/rule qua timezone mới | Reject config command; rollback toàn change | Sticky freeze/privilege + tenant gate |
| O12-T19 | First-source create vs pre-source timezone change đồng thời | c derive sau gate/expected revision | Theo zone của winner hợp lệ | Không capture một zone rồi apply zone khác | Config wins: source re-read/CAS; source wins: config reject | Gate before read, sticky marker same TX |
| O12-T20 | Admission c1 bị rollback; hoặc COMMIT response mất | Nếu receipt có: c1; nếu xác nhận chưa từng commit: first c mới | Session month | Không reselect nếu admission đã committed | Unknown outcome phải lookup; không duplicate G/job | Atomic admission+receipt/job, unique key |
| O12-T21 | Source attendance/roster thay đổi sau PREPARED trước apply | G1 c/date không đổi | Source month cũ | Không refresh price/source trong retryG1 | G1 STALE, no partial DRAFT; G2 explicit | Source mutation gate/fingerprint/base CAS |
| O12-T22 | Session reschedule vs line insert/ISSUE | Giá pinned G; không lấy time reschedule làm c mới | Re-evaluate start date only nếu mutation hợp pháp | Không silently move charged source sang tháng mới | Past/issued source reschedule reject. DB fixture đổi parent làm sai kỳ phải rollback | Future-only history guard, gate/order, inverse deferred period checks |
| O12-T23 | InvoiceSep G1 ISSUED150k; current Nov200k; correction units sai | Issued c02/10/date02/10/V1 basis | Sep giữ | Không reprice original sang200k | Recompute endpoint reject; append authorized correction/adjustment proposal, preserve original | History roles/guards + UC-26, claim retained |
| O12-T24 | SESSION175k, CLASS160k, COURSE150k cùng eligible02/10 | date02/10 | Source month | Chọn SESSION175k; SESSION expired thì CLASS160k | Hai rules overlap cùng SESSION target ⇒ reject/NEEDS_INFORMATION, không arbitrary first | Scope shape, EXCLUDE + precedence proof |
| O12-T25 | Same operation key nhưng đổi period/body; hai G2 keys cùng baseG1 | Same key c1; new keys cần own admission | Canonical monthly identity | Không reprice bằng đổi body trên key cũ | Hash mismatch conflict; hai recomputes không cùng thắng base CAS | Idem UQ/hash + one pending generation/run + locks |
| O12-T26 | Student đã transfer; sourceSep thuộc old class/course; c02/10 | date02/10, old source target chain | Sep | Rule theo old session.class/course, không new enrollment/class hiện tại | Source lineage sai ⇒ reject; không rewrite issued/draft owner | Academic snapshot/tenant/class checks, H-01 dependency |
| O12-T27 | Gross5 VND, sibling verified10%; nhiều odd lines tương tự | PricingDate pinned, unit explicit fixture | Source month | Chọn price như thường; net HALF_UP(4.5)=5 | Không round discount riêng thành1 để cho net4 | BigInt/Decimal once-at-end; eligibility snapshot |
| O12-T28 | Charge02/10 16:59Z=23:59 và17:00Z=03/10 00:00; R10 đóng03/10, tariff mới bắt đầu03/10, không overlap | Hai accepted generations có pricingDates02/10/03/10 | Cùng sourceSep | Window switch đúng local midnight; worker retry không tạo switch | G1 giữ giá02/10, chỉ G2 mới có03/10 | Server clock sampled once, DATE-only boundary + retry pin |

Ngoài matrix, PG fixture phải có leap-month/end bounds và timezone-data boundary checks; SQL/TypeScript resolver cùng một input phải trả cùng date/month/rule. Cross-domain tests phải chạy hai connections thật, gồm cả COMMIT unknown, rollback mọi line/claims/audit và old/new parent paths. Model math không thay concurrency evidence.

## J. H-04 Period Guard Implementation Design — proposal only

### J.1. Layer và DDL concept

R1a giữ nguyên các student/session FKs; không thêm `InvoiceLine.periodId` hoặc business month do client tự điền. Invoice→period là nguồn identity. Period shape dùng row CHECK; cross-table containment không biểu diễn bằng CHECK subquery hoặc FK đơn thuần.

```sql
-- DDL CONCEPT ONLY: chưa tạo migration, chưa validate/apply SQL.
-- Existing month_start/month_end đã NOT NULL trong schema.
CHECK (
  month_start = date_trunc('month', month_start::timestamp)::date
  AND month_end = (month_start + interval '1 month')::date
);

-- Function body phải re-read current final rows theo OLD+NEW IDs.
CREATE CONSTRAINT TRIGGER il_period_guard
AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_invoice_line_period_final_state();
```

```text
check current line L (nếu đã xóa thì skip row check, vẫn check parent/history guards):
  JOIN Invoice I ON (L.tenant,L.invoice)=(I.tenant,I.id)
  JOIN BillingPeriod B ON (I.tenant,I.period)=(B.tenant,B.id)
  JOIN ClassSession S ON (L.tenant,L.session)=(S.tenant,S.id)
  JOIN SessionParticipant P ON tenant/session/student/participant key
  JOIN Tenant T ON T.id=L.tenant
  d = (S.startsAt AT TIME ZONE T.timezone)::date
  assert sameTenant AND student/session equalities (also FK)
  assert first-of-month B.start/end shape AND B.start <= d < B.end
  failure => stable named constraint/error invoice_line_period_mismatch
```

SQL functions/triggers có inverse coverage: ClassSession UPDATE startsAt/endsAt/status/class/id, SessionParticipant UPDATE owner/session/id, Invoice UPDATE tenant/student/period/run, BillingPeriod UPDATE bounds/id/tenant, Tenant UPDATE timezone/marker. INSERT/DELETE paths liên quan phải giữ freeze/identity/history invariant. Parent guard enumerate affected lines qua OLD **và NEW** IDs; không chỉ trigger child. Xóa draft line có thể hợp lệ, thêm/xóa/mutate child của ISSUED bị **immediate** history guard chặn. Protected key changes/reparent lịch sử không được deferred “sửa sau”.

Recommended P0 identity: period.monthStart/monthEnd và invoice tenant/student/period/run không sửa sau tạo. Sai draft source thì bỏ stale lines/recapture bằng generation mới đúng canonical invoice, không đổi period của invoice cũ. Draft reschedule runtime vẫn phải tuân Q-04 future-only; không mở lối sửa session đã diễn ra vì invoice chưa issue. Authorized data correction riêng nếu được mở phải revalidate/invalidate affected drafts, không silent move issued nguồn.

### J.2. Locking contract tương thích O-01

**RECOMMENDED để review, chưa approved/implemented:** dùng protocol của remediation plan §3.2.1, READ COMMITTED và tenant row gate `FOR NO KEY UPDATE` trước source reads/DML, giữ tới commit. Tất cả price/source/roster/attendance/reschedule/period/line/ISSUE/timezone writers tham gia. Gate acquisition là statement riêng; sau chờ lấy fresh snapshot, không dùng preview hoặc CTE/STABLE snapshot cũ. Foreign-key KEY SHARE không phải mutex cho update cột thời gian.

| Order | Tài nguyên / thao tác |
|---|---|
| 1 | Tenant gate, sort đủ tenant IDs từ đầu nếu nhiều tenant; chưa có full set thì abort/restart, không quay lên lấy gate sau invoice. |
| 2 | Current auth, typed idempotency/command/generation và approval request nếu operation cần; không reset pinned payload. |
| 3 | BillingPeriod FOR SHARE, BillingRun/generation FOR UPDATE; discover full dependencies sau gate. |
| 4 | Course/class/pricing/resource/session anchors sorted; FOR UPDATE khi mutate, SHARE khi validate. |
| 5 | Participant/finalization/attendance/absence sorted. |
| 6 | Tất cả affected invoices FOR UPDATE rồi lines/discounts/claims; giữ base-generation CAS. |
| 7 | Current projection/result/counter/audit/outbox; SET named deferred constraints IMMEDIATE sau final mutations, rồi COMMIT. |

Gateway/privilege boundary như O-01 proposal: runtime chỉ EXECUTE reviewed command functions, không direct DML vào protected source tables; fixed search_path/minimal function-owner privileges, không DDL/superuser, no client SQL. Prisma `$transaction` gọi parameterized gateway; nested write input type không tự thực hiện protocol. Test runtime raw DML phải permission-denied, fixture role kiểm FK/trigger; privileged migration owner không là runtime. Nếu reviewer muốn direct Prisma DML/fine-grained locks, phải cung cấp protocol DB-enforced/fresh-snapshot tương đương và test trước thay thế, không chỉ bỏ gate.

Source writer trước admission ⇒ capture nguồn committed mới. Source writer giữa admit/apply ⇒ G stale, apply không refresh; source writer giữa apply/ISSUE ⇒ invalidate/review trước issue. ISSUE thắng trước reschedule/correction ⇒ issued identities/snapshot freeze; correction có quyền tạo lịch sử/follow-up tài chính riêng. Gate ngăn phantom insert mới (roster/override), deferred guard chỉ kiểm final state, không thay concurrency protocol.

Immediate: NOT NULL/UQ/FK/student/session equality, illegal history reparent, issued child mutation. Deferred: cross-row period/current-source assertions cho draft rebuild; trigger re-read final rows thay vì kiểm NEW tuple đã cũ. Any bad final state fail SET CONSTRAINTS/COMMIT rollback **toàn** lines/session/booking/claim/result/audit/outbox trong apply transaction; generation admission trước đó vẫn tồn tại để giữ clock/history, ghi failed/stale attempt riêng. Không gọi partial apply là successful DRAFT.

Transient `40P01/40001`/lock timeout: rollback toàn current phase, bounded retry cùng command/key/pin, không generation mới; budget là O-01/ops choice, không tự lấy job1/5/15 phút làm vô hạn HTTP retry. `23503/23514`/period mismatch là data conflict; `23505` phân biệt replay với conflict; `23P01` schedule overlap cần re-evaluate. Unknown commit: tra receipt/result/generation trước retry; không regenerate clock/counter/claims. No external I/O dưới long DB lock.

### J.3. Split R1b và R2, acceptance gate

**R1b sau O-12 approval:** period shape + invariant E + inverse guards + timezone freeze/storage + reviewed concurrency boundary, giữ R1a; chưa cần triển khai full pricing/generation engine để mô tả month guard đúng. Nếu R1b chỉ schema/DDL draft local, phải ghi mức S, chưa P/R. Không dùng implementation period guard service-less để claim full Billing ready.

**R2:** durable clock/generation/pricing snapshot/recompute/ISSUE semantics G; source/price no-overlap locks + financial/history dependencies. O-04 snapshot representation và O-01/O-13 primitive/status/ops còn cần technical sign-off theo contract này; không reopen Group A hoặc định nghĩa lại O-12 business defaults trong code. Technical review không đồng nghĩa đã có authorization migration.

Đóng H-04 cần actual PostgreSQL tests: valid/wrong month, local midnight, zero/cancel, cross-student, INSERT/UPDATE + inverse parent mutation, same/different tenant concurrent writers, deferred final state vs immediate FK, rollback/retry và immutable issued source. **D**=owner chọn contract; **S**=schema implemented/Prisma/client checks; **P**=reviewed migrations applied/tested ở DB được phép; **R**=runtime authorization/jobs/API/restore evidence. Hiện proposal chỉ chuẩn bị D; giữ evidence S của R1a, không tạo P/R evidence mới.

## K. Impacts: Prisma, migrations, services, APIs và audit

| Khu vực | Proposed delta sau approval / giới hạn |
|---|---|
| Prisma R1b | Không cần line.periodId duplicate; giữ 4 FK R1a. Đề xuất Tenant.timezoneFrozenAt sticky field; period row CHECK và inverse triggers nằm custom SQL, không suy từ PSL. Không thêm/sửa field trong task hiện tại. |
| Prisma R2 | BillingRunGeneration với typed immutable clocks/policy/generation keys + versioned snapshot JSON; BillingRun/Invoice current generation pointers cùng logical identity, policy projection update atomic. Giữ original run.operationKey là initial identity/provenance; recompute key ở generation, không đè run.operationKey hoặc tạo run tháng thứ hai. |
| PriceRule | Giữ native DATE và tier targets; policy provenance khác calculation policy. SQL shape/no-overlap/generation reference guards + snapshot eligibility proof; không đổi sang TIMESTAMPTZ chỉ vì charge clock là instant. |
| PostgreSQL | CHECK tháng, period inverse/deferred checks, sticky/history guards, price EXCLUDE, gateway grants; target version/extensions/catalog tests ở task riêng. Không CHECK subquery/now(), không giả Prisma validate chứng minh trigger/GiST/race. |
| Billing services | Tách source-month resolver / tariff resolver / policy pin / generation admission/apply/replay / issue. Read source qua coordinator đúng module ownership, current permission và old/new revision locks. |
| API contract | Các path trong API spec là proposal. Phân biệt initial vs recompute command, reason + expectedGeneration + new idempotency key; server-derived clock/zone/policy không cho client override. Chọn endpoint concrete ở API review, không tự mount route. Read DTO hiển thị billingMonth/sourceBusinessDate/chargeCreatedAt/pricingDate/generation/policy/rule evidence; VND strings. |
| Errors | Proposed stable semantics: PERIOD_NOT_CLOSED, PERIOD_SOURCE_MISMATCH, GENERATION_STALE, GENERATION_CONFLICT, IDEMPOTENCY_PAYLOAD_MISMATCH, PRICE_NOT_FOUND/AMBIGUOUS, TIMEZONE_FROZEN, ISSUED_IMMUTABLE. HTTP taxonomy/status chưa tự ghi vào API source. |
| Audit | Admission/generation IDs, actor/policy/correlation, clock/z/source/pricing hashes, selection reasons, initial/recompute diff, source invalidation, issue/correction và blocked timezone/price mutation. Payload không chứa secret; success audit atomic effect, failed attempt ghi riêng sau rollback, unknown outcome reconcile. |
| Backfill | Không biết có dữ liệu DB hay không. Existing month/student mismatch phải quarantine/review; không dời issued invoice/claim, không backfill chargeCreatedAt bằng now() hoặc session time. Existing issued creation clock không chứng minh được thì legacy provenance needs-review; migration strategy riêng, không tự giả lịch sử. |
| NFR | Tenant gate serialize writes cùng tenant; phải đo contention/fixture, không claim đáp ứng NFR từ design. Snapshot retention/size/backup/restore và timezone-data upgrade kiểm ở PG/runtime gates. |

## L. Thay đổi Business Source of Truth sau approval

| Nguồn / phần cần đồng bộ | Thay đổi chính xác được đề nghị, chưa áp dụng |
|---|---|
| Requirements §7 Q-08 và glossary/BR-06 clarification | Giữ meaning “lúc lập khoản tính phí”; bổ sung chargeCreatedAt durable-generation definition, local pricingDate/native DATE, B1 source month, C1 freeze và new-generation recompute semantics. Version/change log + owner approval; không đổi rate/monthly scope/issue baseline. |
| UC-21 step4/AC-21; UC-23/24 alternatives/tests | Giữ charge-time rule; thêm accepted-vs-retry-vs-recompute/ISSUED behavior, stale/need-info và không issue khi source đổi. Ghi rõ cùng tháng test là admission negative theo monthly baseline. |
| Database Design §3.1/3.6/DB-08 | Bổ sung typed generation/pointers/clock/timezone marker, pin definitions/constraints và period invariant; giữ DATE windows/one-invoice/excess. DB-08 vẫn charge-time, không đổi thành ngày session. |
| Detailed Design §5.7 dòng226 | Thay câu chọn giá “tại ngày buổi” bằng pricingDate của generation charge clock; dùng session-start date riêng để xác định tháng. Cập nhật retry/recompute/prepare/apply và ISSUE không reprice. |
| Class Billing/Academic/Scheduling/Tenant | `resolvePrice(source,at)` nhận captured pricingDate; sourceMonth nhận session local start; current vs source class lineage, freeze marker và writer lock ownership. Sửa stale “one invoice chưa chốt” bằng dẫn Group A, không hỏi duyệt lại. |
| API Specifications + decision register + review docs | Khi có authorization tài liệu riêng: contract generation/recompute/errors/read projections và dispositions O12-A/B/C/D với reviewer/date/evidence; register chỉ phản ánh approval user thực sự. Audit cũ giữ snapshot lịch sử, delta review chỉ bổ sung evidence. |

**Không cần sửa ý nghĩa BR-06/UC-21/DB-08 để chọn B.** Các định nghĩa/generation/freeze là business clarification mới phải duyệt và version, không tự gọi là đã tồn tại. Nếu owner chọn A thay recommendation, phải sửa meaning BR-06/UC-21/DB-08 rõ ràng rồi mới cho DD226 thắng; không triển khai A dưới nhãn “clarification B”.

### L.1. Checks actually run và preservation

Task này chỉ đọc/đối chiếu working files, Git status/branch/HEAD/index và SHA-256; không tạo test source/artifact phụ. **Offline reference checks PASS: 17 cases** bằng explicit Intl timezone/BigInt cho overnight/month/midnight/leap boundaries, UTC-vs-local date, charge-vs-session price, window/precedence/ambiguity/missing-vs-zero, frozen replay-vs-new selection và cuối-round. Đây không phải implementation/state-machine hoặc PostgreSQL tests.

**Report checks PASS:** đủ A–M, 28 acceptance cases có đủ7 cột, 12 invariants, 4 decision rows và đúng4 approval questions; code fences/whitespace được kiểm riêng. Validator đầu tiên gặp encoding nhãn tiếng Việt qua PowerShell stdin; đã dùng Unicode escapes/ASCII markers và chạy lại đạt, không phải source defect. Hash83 file có trước giữ nguyên; duy nhất report này mới, HEAD/index không thay. Whitespace kiểm cả tracked diff và untracked report; no-index exit1 vì file mới khác NUL, không được gọi là exit0. Sự di chuyển report có trước được giữ nguyên.

**NOT RUN:** Prisma validate/generate/typecheck/build/runtime tests trong task này; SQL/migrate/migrate diff/db push/seed/PostgreSQL/concurrency/restore/EXPLAIN; network/Library/Figma/GitHub. R1a validation evidence được dẫn là lịch sử, không là kết quả chạy mới. SQL và tests ở I/J chưa executed; offline arithmetic không chứng minh DB integrity hay locks.

## M. Final decision table — chưa ghi vào Decision Register

| Decision ID | Recommended choice | Source evidence | Reason | Trade-offs | Requires business approval? | Blocking finding | Status |
|---|---|---|---|---|---|---|---|
| O12-A | **B: durable charge creation time**, local DATE pricing window; immutable price-capture proof | BR-06:218; UC-21:903/915; DB-08:281; DD226 conflict | Giữ đúng nguồn cao hơn; clock/snapshot ổn định cho retry | Giá tháng sau có thể khác ngày học; capture/price-mutation rules và explanation nhiều hơn | **Có**, cho định nghĩa clock/price snapshots và hệ quả; không hỏi lại precedence | M-04/H-06/H-09; price-effective phần H-04 | RECOMMENDED / PENDING_APPROVAL |
| O12-B | **B1: local session start month**, không split, không charge-month attribution | Q-04:317, Q-08:334; UC-23:992; Group A DB234 | Một source/month rõ, midnight và monthly identity nhất quán | Overnight dùng toàn tháng bắt đầu, không prorate | **Có**, start-vs-end rule chưa chốt; one-invoice baseline giữ | **H-04 period guard** | RECOMMENDED / PENDING_APPROVAL |
| O12-C | **C1: freeze P0** tại first time-bearing source; sticky marker, controlled Ops pre-source | Q-04:317; schema184; audit M-04; remediation plan§3.2 | Không reinterpret lịch sử/draft khi config đổi; P0 khả thi | Phải cấu hình đúng trước first series/session/period; đổi muộn cần task transition riêng | **Có + security/ops**, boundary/authority/tzdata controls | H-04/M-04, source history H-20 | RECOMMENDED / PENDING_APPROVAL |
| O12-D | **Same key=same generation; explicit recompute=new generation/clock/policy/prices; ISSUED append-only** | BR-14:226; UC-23:973/985–997; UC-24:1026–1028; schema run UQ1177 | Tách replay khỏi business change, giữ source history/Group A | Thêm durable generation/snapshot contract; recompute có thể đổi cả lines không đổi units | **Có**, approval cho new-request repricing semantics và audit/CAS | H-06/H-16/H-20/M-04, R2 readiness | RECOMMENDED / PENDING_APPROVAL |

### Các lựa chọn thực sự cần chủ dự án phê duyệt

1. **Áp giá theo B: thời điểm nhận bền vững charge generation (default)?** Hệ quả: buổiSep, chargeOct dùng tariffOct; giữ BR-06/UC-21/DB-08 và sửa DD226. Chọn giá ngày học cần đổi upstream business rule.
2. **Gán tháng theo B1: ngày bắt đầu buổi tại tenant timezone (default)?** Hệ quả: 30/09 23:30→01/10 00:30 thuộcSep; không split hoặc lấy tháng tạo draft.
3. **Freeze timezone P0 sau first series/session/period/billing source, Ops chỉ cấu hình trước đó (default C1)?** Hệ quả: không đổi timezone in-place khi đã có dữ liệu; giữ marker/snapshot, thay muộn cần task transition riêng.
4. **Retry giữ G1; deliberate recompute tạo G2 với clock/policy/tariff mới, reason+CAS+history; issued không recompute (default D)?** Hệ quả: tiền draft có thể đổi khi recompute, phải review diff; chấp nhận durable generation metadata thay vì overwrite logical run.

**Dừng sau proposal để user review/lựa chọn. Không câu trả lời mặc định nào đã được gửi hoặc được hiểu là approval; không triển khai R1b/R2 hoặc đổi status register.**

---

## N. Final Approved Decision — 2026-10-18

### N.1. Authority, scope và decision record

**APPROVED BUSINESS DECISION · 18/10/2026 · Asia/Ho_Chi_Minh.** Nguồn: chỉ đạo trực tiếp của chủ dự án trong cuộc trao đổi ngày 18/10/2026, yêu cầu “Đồng bộ quyết định giá theo ngày buổi học”. Không gán tên người duyệt/chữ ký hoặc giả bằng chứng bên ngoài. [Decision Register §F](../../DECISION_REGISTER.md#f-o-12--approved-business-decision-2026-10-18) phản ánh approval này, không cấp quyền Git/schema/migration. A–M giữ nguyên nội dung lịch sử, kể cả line numbers/chỉ dẫn file/test evidence tại thời điểm viết; các line numbers ấy không dùng làm citation hiện tại sau đồng bộ.

| Decision ID | Current approved business choice | Rationale / trade-offs / conditions | Status |
|---|---|---|---|
| O12-A | **A — Local session date** | Học phí gắn ngày cung cấp dịch vụ; tạo charge/invoice/G2 muộn không tự tăng giá buổi đã học. Đổi BR-06/UC-21/DB-08 cũ, giữ hướng DD §5.7. Cần historical tariffs/lineage/per-line snapshots; DATE không hỗ trợ intraday | **APPROVED BUSINESS — 2026-10-18** |
| O12-B | **B1 — Local session start month** | Không split session, không UTC month, không đưa nguồn vào tháng tạo draft; giữ một logical invoice/student/tenant/month và permanent issued participation claim | **APPROVED BUSINESS — 2026-10-18** |
| O12-C | **C1 — Freeze timezone P0** | Freeze sau first ScheduleSeries/ClassSession (kể cả DRAFT), BillingPeriod hoặc BillingRun/generation, sticky kể cả hủy/xóa nguồn. Ops chỉ cấu hình trước boundary; transition muộn cần task riêng | **APPROVED BUSINESS — 2026-10-18** |
| O12-D | **D — Generation-based recompute** | Retry giữ G1; explicit command/key/reason/base+current CAS tạo G2, giữ history/diff/audit và một logical invoice; ISSUED bất biến. G2 pin calculation policy request mới, **giá vẫn theo session date** | **APPROVED BUSINESS — 2026-10-18** |

**Supersession rõ ràng:** recommendation **O12-A=B** ở A/D/M và chỉ dẫn charge-time ở G/H/I/K/L đã bị thay bởi **O12-A=A**. Lý do là business change được chủ dự án chọn, không phải suy diễn BR-06 cũ “thật ra cũng là session date”. Sources trước amendment thực sự mâu thuẫn; source conflict matrix B là bằng chứng lịch sử. Thuật ngữ “B1” vẫn là lựa chọn attribution được duyệt, không phải charge-time pricing B. Không hỏi lại bốn lựa chọn này hoặc Group A.

### N.2. Contract hiện hành và clocks

```text
z = tenant.timezoneSnapshot                     // trusted, frozen tenant IANA timezone
sourceBusinessDate = local_date(ClassSession.startsAt,z)
pricingLocalDate = sourceBusinessDate            // PER LINE, not one date per generation
billingMonth = first_day_of_month(sourceBusinessDate)
eligible(r,source) = sameTenant AND correctOriginalTargetHierarchy
  AND r.effectiveFrom <= pricingLocalDate
  AND (r.effectiveTo IS NULL OR pricingLocalDate < r.effectiveTo)
chosen = first nonempty tier [SESSION(source.session),
                              CLASS(source.originalClass), COURSE(source.originalCourse)]
no eligible price OR ambiguous same tier -> NEEDS_INFORMATION, never implicit zero
```

`PriceRule.effectiveFrom/effectiveTo` là **local calendar DATE**, inclusive start/exclusive end, không UTC instant; không convert DATE qua UTC để suy ngày khác. Dùng source startsAt UTC + z để lấy ngày; kết thúc buổi không quyết định tháng hay giá. Không dùng `chargeCreatedAt`, `generationCreatedAt`, `invoice.createdAt`, `invoice.issuedAt`, `computedAt`, `workerExecutedAt` hoặc client-supplied date/timezone để chọn PriceRule. Một invoice/generation có nhiều ngày học và có thể nhiều mức giá trong cùng tháng.

`chargeCreatedAt/generationCreatedAt` vẫn có giá trị admission/idempotency/audit và pin **calculation PolicyVersion** tại server instant c của request theo BR-14. PolicyVersion TIMESTAMPTZ effective window vẫn là instant `[from,to)`, khác PriceRule DATE; G1 retry giữ V1, G2 request mới có thể pin policy hiện hành V2. Tariff policyVersionId/scheduling policyVersionId là provenance riêng; không mặc định bằng calculation policy ID. Thay calculation policy hợp lệ có thể đổi discount/net, không biến ngày G2 thành pricingLocalDate. Giữ sibling10% P0, combo5% + combined14,5% chỉ P1, điều kiện xác minh và HALF_UP một lần cuối.

**Giá mới chỉ cho buổi tương lai:** không ordinary update/delete amount/target hoặc backdated/new higher-tier override làm đổi đơn giá buổi đã bắt đầu, kể cả chưa billed. Publish DATE tương lai phù hợp; nếu yêu cầu chỉ áp sau công bố thì chọn tối thiểu ngày local sau ngày công bố, không giả intraday tariff. Được future-close open-ended range nếu không thay selection/amount tại các ngày session đã bắt đầu hoặc complete captured/issued snapshots; snapshot giữ original effective bounds. ISSUE recheck semantic facts tại d, không so full current updatedAt rồi tự reprice vì future-close. Thiếu tariff quá khứ → NEEDS_INFORMATION/đối soát, không ordinary backdate để lấp rồi âm thầm tính lại; data repair lịch sử cần task/approval riêng. Điều này **thay** ngoại lệ historical G/D cho phép missing-price vacancy được lấp bằng backdated rule thông thường.

Monthly invariant B1 giữ như E: `period.monthStart <= sourceBusinessDate < period.monthEnd`, bounds là tháng chuẩn; không split/UTC month/charge-month attribution. Initial monthly G1 chỉ sau kỳ đóng; session/charge cùng tháng vẫn là **negative admission test**, không mở early billing. Giữ same-tenant/student/session composite keys R1a; one logical run/invoice/student/month; permanent claim participant khi issue kể cả zero/cancel, không release sau hủy invoice. Two students/same session có hai participant/invoice identities riêng.

### N.3. Resolver, snapshot, recompute, DB/API delta

| Area | Current contract replacing conflicting historical proposal | Implementation status |
|---|---|---|
| Resolver | `resolvePrice(source,pricingLocalDate)` với pricingLocalDate từ source session start/z, original class/course lineage; không từ charge instant hoặc current enrollment | Design/pseudocode, chưa runtime |
| Snapshot | Mỗi line: sourceBusinessDate=pricingLocalDate, z, UTC times, original hierarchy/revisions/finalization, selected ruleId/window/unitPrice/tier/target/selection proof, separate policy provenance; generation giữ c/key/hash/reason/base/current/history/diff | Representation/typed fields vs versioned JSON theo O-04 còn review |
| Generation-level date | **Không dùng generation-wide pricingLocalDate** như G.2 historical field table; nhiều lines có dates khác nhau. Chỉ line/source snapshot có pricing date; generation instant là audit/request admission | R2 schema extension vẫn proposed |
| Initial G1 | Closed month + current authority; atomically pin V1/z/source set/pricing evidence at each d and durable key/receipt/job, then compute/apply. ATTENDED/UNEXCUSED1; approved EXCUSED/CANCELLED0. Cancelled không cần attendance giả, vẫn tariff hợp lệ | Không completed DRAFT nếu missing price/confirmed source |
| Retry same key/hash | Giữ G1/c/V/z/line price/input/result; source relevant đổi thì stale/block không refresh. Key khác body conflict; replay G1 sau G2 chỉ trả historical G1 result, không overwrite current invoice | Không tạo G2 từ retry |
| Deliberate recompute | New command/key/reason/expected base+applied CAS, G2/new-request calculation policy + nguồn hiện hành hợp lệ; resolve từng giá theo session date. Nguồn/tariff không đổi ⇒ unit price không tăng vì G2 tháng sau. Giữ G1/G2, diff/audit, một logical invoice; chưa có invoice sau NEEDS_INFORMATION cũng cho G2 command mới | Current applied pointer/pending exclusion/atomic apply cần review |
| ISSUE / correction | Issue kiểm authority/source set/revisions/current applied G/no pending/no stale/snapshot/claims atomic; không reprice/repin. ISSUED/cancelled-after-issue không recompute; append correction/adjustment có duyệt, original basis/history không sửa | Financial O-05–07 không được đóng bởi O-12 |
| Price/timezone writers | Chặn historical repricing/backdate như N.2; C1 boundary giữ F, sticky marker/source atomic, audit/CAS before freeze; tzdata/precheck riêng | O-01/O-13 privileges/ops/SQL chưa approved |
| DB H-04 | Date/month derive từ startsAt/z như E/J; child+inverse-parent guards, immutable monthly identities/issued children; không cần lấy tháng charge hoặc line client period. Price-date proof bổ sung tại snapshot/resolver | Period guard chưa implemented; R1a student FK không đóng H-04 |
| API | Server-derived per-line date/zone/rule/window/VND string/tier/source; generation receipt/hash/CAS/reason/diff và safe failure semantics. Reject client price/time override | Không thêm endpoint. Recompute path/permission/DTO/states **PROPOSED / PENDING API REVIEW** |

**Transaction/concurrency contract J vẫn proposal:** tenant mutex trước source reads + fresh READ COMMITTED statements, shared order tenant → auth/key → period/run/G → course/class/price/resources/session → participant/attendance → invoice/line/claim → counter/audit/outbox. Toàn bộ writers phải tham gia, gồm tariff override inserts/first source/timezone, không chỉ InvoiceLine trigger. Source thay đổi trước capture thì capture mới; giữa capture/apply/issue thì stale/block, không refresh G; issue trước thì history freeze. Deferred period final-state checks re-read OLD+NEW dependencies; immediate FK/issued-history checks không hoãn. Reschedule tương lai chỉ commit khi affected draft invalidated/rebuilt đúng hoặc reject, không giữ wrong-period line chờ service sửa sau. Deadlock/serialization rollback whole phase rồi bounded same-key retry, unknown commit lookup receipt trước; durable admission cũ giữ nguyên. Privilege gateway/lock graph/isolation/NFR contention vẫn cần review riêng O-01; business O-12 approval không approve kỹ thuật đó.

### N.4. Historical invariants / test expectations bị superseded

| Historical ID | Current expected / change required when implementing new fixtures |
|---|---|
| **I04** | `pricingLocalDate=sourceBusinessDate=local_date(session.startsAt,z)` **per line**, giữ window/tier; không charge clock |
| **I06** | G2 vẫn explicit key/reason/CAS/policy request mới; pricing selection tại session dates, không c2; c2 chỉ admission/audit |
| **I11** | Price writer bảo vệ ngày session đã bắt đầu và complete captured selection, không chỉ local_date(c); ordinary backdated missing-price repair không được phép. Retry/G1 history bất biến |
| T01 | Pricing date10/09 (session), giá100k; monthly admission11/09 vẫn reject PERIOD_NOT_CLOSED |
| T02 / **T03** | Sep session/draftOct ⇒ **100k**, invoiceSep; thay old150k |
| T04 / T05 / T06 / T08 / T09 | Cơ chế retry/stale/correction/history giữ, price dates chuyển sang source dates: Sep G1/G2 unit100k; T06 units0/base0, T08 phải bảo vệ rule đã chọn theo session date; replay G1 không write-back |
| **T07** | Sep G1Oct/G2Nov nguồn/tariff không đổi ⇒ **100k unit** ở cả hai, không200k vì Nov. V2 request-policy pin chỉ khi baseline thực sự đổi, tách ảnh hưởng net |
| **T10** | Overnight source30/09 ⇒ **100k**, monthSep, không split |
| **T11 / T12** | Session local01/10 ⇒ **150k**, monthOct, không200k vì chargeNov hoặc UTC dateSep |
| **T13** | ChargeUTC boundary không ảnh hưởng price date: sourceSep ⇒ **100k**; dùng session UTC boundary để test local conversion riêng |
| T14 / T15 / T16 | Cancelled sourceSep unit100k/base0; missing tariff vẫn NEEDS_INFORMATION; X/Y sourceSep đều tariff100k với identities riêng |
| T17–T22 / T25 | Claims/freeze/atomic admission/stale/reschedule/key/CAS assertions giữ; bỏ charge-date làm tariff input trong fixtures |
| **T23** | New A fixture: invoiceSep issued snapshot100k, không reprice thành200k. **Nếu thực sự có legacy issued150k**, giữ150k/history bất biến, không “sửa” bằng O-12; migration/correction cần review riêng. Không xác minh DB nên không khẳng định có legacy rows |
| T24 / T26 / T27 | Tier tests phải có windows eligible tại **session date**, không chỉ c; transfer dùng old chain và rule ngày session; rounding gross5×0.90→5 giữ |
| **T28** | Hai G có charge dates02/10 vs03/10 nhưng cùng source date ⇒ cùng giá source. Window switch chỉ khi **session dates** đi qua exclusive bound; retry không switch |

Các I01–03/I05/I07–10/I12 còn nguyên ý nghĩa, đọc cùng N.2/N.3. Bảng H/I và 28 rows gốc được giữ nguyên làm lịch sử, không có test cũ nào được âm thầm ghi lại thành PASS cho A. Hướng đồng bộ L cũ không còn áp dụng ở đoạn charge-time; tài liệu normative hiện hành đã được cập nhật theo N.6.

<a id="n5-acceptance-matrix-hien-hanh--o12-aa"></a>

### N.5. Acceptance matrix hiện hành — O12-A=A

**27 acceptance specifications, chưa thực thi PostgreSQL/runtime.** Prefix **O12-AC** phân biệt AC theo UC và historical O12-T. Fixture A: zone Asia/Ho_Chi_Minh; R09 COURSE100.000 `[2026-09-01,2026-10-01)`, R10 COURSE150.000 `[2026-10-01,2026-11-01)`, R11 COURSE200.000 `[2026-11-01,∞)` đã publish hợp lệ từ trước ngày áp dụng; attendance ATTENDED/confirmed, no sibling trừ khi ghi khác; charge/draft admission sau kỳ đóng. Những giá khác trong test là fixtures độc lập không sửa tariff cũ. Money là VND integer/string exact.

| Case | Input | Price-effective date / billing month | Selection expected | Expected state/result | Reject / rollback condition | Service / SQL enforcement cần test |
|---|---|---|---|---|---|---|
| O12-AC-01 | Session20/09; Sep100k/Oct150k; charge02/10 | 20/09 / Sep | R09=100k, không R10 | G1 DRAFT100k invoiceSep | InvoiceOct hoặc charge-date price phải reject guard/result | Server date resolver + H-04 parent/line guard |
| O12-AC-02 | Session05/10, draft02/11 | 05/10 / Oct | R10=150k, không R11 | DRAFT150k invoiceOct | Sai UTC/draft month reject | Local-start resolver/period CHECK+join guard |
| O12-AC-03 | Session20/09; G1Oct/G2Nov; nguồn và tariff hợp lệ không đổi | 20/09 cả G / Sep | R09=100k cả hai | G2 unit100k, giữ G1; net giữ nếu policy/eligibility không đổi | CAS/reason/key thiếu → reject | Immutable generations + per-source DATE selection |
| O12-AC-04 | Fixture riêng: Sep10=100k window đếnSep15; Sep20=120k từSep15; draftOct | 10/09,20/09 / Sep | 100k và120k từng line | Một invoice gross220k, không một generation date chung | Same target overlap hoặc line dùng cùng giá sai → reject | Price EXCLUDE + per-line evidence; mixed-date resolver |
| O12-AC-05 | Start30/09 23:30 end01/10 00:30, draftOct | 30/09 / Sep | R09=100k toàn participation | Một line/claim, không split | Oct attribution/duplicate source reject | Tenant-local start + monthly half-open guard |
| O12-AC-06 | Start01/10 00:00, draftNov | 01/10 / Oct | R10=150k, start inclusive | DRAFTOct150k | Sep invoice rejected | Lower/upper month bounds + DATE window |
| O12-AC-07 | Client gửi pricingLocalDate01/10 cho session20/09 hoặc unitPriceOverride | Server20/09 / Sep | Không áp client150k/override | Proposed DTO400, nguồn/snapshot không đổi | Reject unknown/server-owned fields; rollback writes | API allowlist + service derive date/authority |
| O12-AC-08 | Ordinary sửa R09 amount/target/window làm đổi Sep snapshot đã có | 20/09 / Sep | Captured100k giữ | Rule mutation bị từ chối, history giữ | PRICE_HISTORY_PROTECTED, whole writer TX rollback | Price writer protected-history/selection dependencies |
| O12-AC-09 | Publish R11 Nov200k từ trướcNov1 | Sep20/Oct5/Nov5 → respective months | 100k/150k/200k theo ngày session | Existing Sep/Oct snapshots không đổi | Same-day/backdated override cho buổi đã bắt đầu reject | Future-DATE publication + no-overlap/history guards |
| O12-AC-10 | Retry G1Oct key K1 vàoNov khi current tariff200k | G1 source20/09 / Sep | Frozen100k, V1, cùng result | Same G1/receipt, không G2/invoice/effect mới | Hash mismatch conflict; thiếu quyền replay deny | Typed durable key/hash, current auth, immutable result |
| O12-AC-11 | New K2/reason/expected base+applied G1, DRAFT | Source20/09 / Sep | G2 vẫn100k, pin request-policy hợp lệ | G2/history/diff/audit, cùng invoiceID | Expected/pending mismatch rollback admission/apply | Run lock + base/current CAS + one pending/UQ |
| O12-AC-12 | Recompute invoice ISSUED hoặc cancelled-after-issue | Issued source date / original month | Không chọn lại | Reject; UC-26 adjustment riêng có duyệt | INVOICE_ALREADY_ISSUED; no new G/effect | Immediate history guards + service status/auth |
| O12-AC-13 | Authorized attendance correction sau G1 trước apply/issue | Original session date / original month | Không refresh G1; G2 chỉ sau command mới | G1 stale, issue blocked; G2 có thể đổi units/net | Fail source fingerprint → rollback partial apply/issue | Source/attendance revision recheck under shared locks |
| O12-AC-14 | Không PriceRule eligible tại Sep session, dù có currentOct rule | 20/09 / Sep | Missing, không150k/0 | NEEDS_INFORMATION, no complete DRAFT | Backdated ordinary repair rejected; authorized repair review riêng | Capture completeness/price mutation guards |
| O12-AC-15 | Student transfer từ classOld/courseOld sang classNew trước draftOct | Old source20/09 / Sep | Rule tại old session/class/course chain | Correct old-source100k; snapshot lineage giữ | Chain cross-tenant/inconsistent → reject, không fallback lớp mới | Source lineage FK/revisions/port, H-01 dependency |
| O12-AC-16 | Sau first session/series/period/run, Ops đổi zone | Dates/z cũ giữ / month cũ | Không reinterpret/reselect | TIMEZONE_FROZEN reject, sticky dù cancel/delete source | Whole timezone mutation rollback | Sticky marker + privileges + first-source/config shared gate |
| O12-AC-17 | Hai recomputes K2/K3 cùng expected G1 | Same source20/09 / Sep | Không current-clock pricing | Tối đa một CAS winner; loser conflict | Không hai pending/current wins, không invoice thứ hai | Run lock/UQ/pending predicate/CAS, ≥2 DB connections |
| O12-AC-18 | IssueOct2 invoiceSep chứa Sep100k, currentOct150k | Sep source dates / Sep | Giữ từng giá100k từ current G | ISSUED snapshot/claims/audit atomic | Stale/pending/source incomplete/permission failure rollback | Issue revalidate/no-reprice + history guard |
| O12-AC-19 | Window `[Sep1,Oct1)` / `[Oct1,Nov1)`; sourcesSep30/Oct1 | Sep30 / Sep; Oct1 / Oct | R09 end excluded đúngOct1, R10 start inclusive | 100k/150k đúng boundary | Invalid/overlapping same-target range reject | DATE CK/EXCLUDE, resolver; zero implicit không dùng |
| O12-AC-20 | SESSION175k/CLASS160k/COURSE100k cùng eligibleSep20 | 20/09 / Sep | SESSION175; nếu hết hạn trướcSep20 → CLASS160 | Snapshot tier/target/absence higher-tier evidence | Two same-target/tier matches reject/NEEDS_INFORMATION | Tier resolver + SQL no-overlap + phantom insert lock |
| O12-AC-21 | Participation đã issuedSep, thử issueOct kể cả sau invoiceSep cancel/zero line | Original source date / chỉSep | Không chọn giá lần2 | Second claim/period rejected | Whole second issue rollback, original claim giữ | Permanent UQ participant + H-04 + claims completeness |
| O12-AC-22 | Non-cancelled source thiếu finalization; hoặc EXCUSED không approved leave | Source date / source month | Không completed charge, không đoán0 | Missing confirmed → NEEDS_INFORMATION; invalid leave reject | No issue/partial finalize; AR finalization đúng session | R1a FK + finalization/absence eligibility under locks |
| O12-AC-23 | Explicit tariff gross5, verified sibling10%; hai lines5+5 test thêm | Session dates / source month | Snapshot hợp lệ; no comboP0 | Gross5→netHALF_UP4.5=5; gross10→net9, không sum per-line rounded10 | Sai arithmetic/eligibility hoặc floating money reject | BigInt/Decimal invoice-final rounding, money JSON strings |
| O12-AC-24 | Start2026-09-30T18:00Z =01/10 01:00 local, draftNov | 01/10 / Oct | R10=150k | Oct invoice, source date không UTC30/09 | UTC-month/source-price09 phải fail | SQL AT TIME ZONE + runtime shared fixtures/tzdata |
| O12-AC-25 | CANCELLED sourceSep, không attendance; có/không R09 | 20/09 / Sep | Có R09 unit100k, units0/base0; thiếu → missing | Valid0 line khi có tariff; thiếu NEEDS_INFORMATION | Không fake attendance/price0; issue thiếu giá reject | Cancel branch + source/date guard + zero issued claim |
| O12-AC-26 | X/Y cùng sessionSep, participants PX/PY và invoices IX/IY | Cùng20/09 / Sep | Cùng tariff100k, eligibility riêng | Hai logical invoices hợp lệ, mỗi student một | IX gắn PY cross-student reject toàn insert/update | R1a student composite FK + monthly UQ |
| O12-AC-27 | Source/price override/reschedule writer vs capture/apply/issue; first-source vs zone | d từ committed source sau gate, không từ waiter clock | Capture trước mutation: pin giữ, relevant mutation → stale; mutation trước capture: đọc mới hợp lệ | Past/issued reschedule reject; future change invalidate/rebuild đúng hoặc reject; source-first freeze chặn config | Wrong final period/price/history → rollback whole phase; 40P01/40001 bounded same-key retry; unknown commit lookup | Shared tenant/source locks, inverse/deferred final-state guards + immediate history checks, privileges; real ≥2 connections còn NOT RUN |

Giá/window fixtures phải được publish trước các session tương ứng, không tạo “tariff sửa quá khứ” để làm testcase pass. Recompute do correction không đổi ngày session trong quá khứ; authorized attendance correction đổi units chứ không mở past reschedule. Khi G1 pricing snapshot đúng và future-close window không ảnh hưởng date/value, chỉ đổi updatedAt không tự làm stale. Gate/schema/PG/runtime acceptance phải được đánh giá độc lập như N.7.

### N.6. Documentation sync và truy vết hiện hành

| Source đã đồng bộ trong task này | Section / current meaning |
|---|---|
| [Requirements](../../../requirements/requirements_analysis.md) | v5 O-12 amendment/changelog, glossary, BR-06, Q-04/Q-08/traceability: session-date tariff, B1/C1/D, giữ BR-14/ưu đãi/round/P0 |
| [Use Cases](../../../requirements/usecase/specification.md) | UC-21 step4 + AC-21-03/04; UC-23 flow/alternatives + AC-23-04–07; UC-24 issue + AC-24-03/04; Q-08 summary |
| [Decision Register](../../DECISION_REGISTER.md#f-o-12--approved-business-decision-2026-10-18) | Chỉ thêm O12-A/B/C/D approval thật; các decision khác giữ nguyên |
| [Database Design](../../../design/database_design.md) | DB-08, PriceRule DATE, §3.6 O-12 source/snapshot/generation/C1/price writer/guard contract; SQL chưa áp dụng |
| [Detailed Design](../../../design/detailed_design.md) | §5.7 algorithm/inputs/errors/clock split/retry/G2/stale/issue/lineage và link tên file thực tế |
| [API Specifications](../../../design/api_specification.md) | §3.6/5.4 DATE fields/read evidence/commands/errors/idempotency; no new recompute endpoint, DTO/permission/path pending review |
| [Billing Class Design](../../../design/class%20design/billing-receivables.md) | PriceRule.appliesTo, Calculator.resolvePrice, Run/Generation/Line/Service, history/transaction; bỏ trạng thái “monthly identity chưa chốt” trái Group A |
| [Scheduling Class Design](../../../design/class%20design/resource-scheduling.md) | canonical startsAt, source date/lineage, future-only mutation/C1/shared lock boundary, không chuyển billing arithmetic sang Scheduling |

Các đường dẫn nguồn trong bảng B/A.1 ban đầu và line numbers thuộc snapshot lịch sử, không sửa chúng để che lịch sử. [Remediation Plan §4.12, decision board O-12](SCHEMA_REMEDIATION_PLAN_P0.md) còn charge-time recommendation và pending business questions cũ; **không sửa ngoài file list được phép**. Cần task đồng bộ plan theo approval N trước dùng làm implementation instruction. Audit cũ là historical snapshot; không đổi finding status hoặc đóng H-04 chỉ vì O-12 business đã chốt. AGENTS/PROJECT_CONTEXT còn alias tên DD/API cũ, ngoài phạm vi; dùng actual files ở N.6, đề xuất sửa alias riêng.

### N.7. Gates, checks và remaining approvals

| Gate | Current evidence / what remains |
|---|---|
| **Business decision approved** | A=A, B=B1, C=C1, D=D theo owner18/10; được đồng bộ docs. Group A không mở lại |
| **Technical design approved** | Chưa mặc định approved. O-01 gate/grants/order/isolation, O-04 representation/generation field design, O-13 ops/identity/state controls, API recompute path/permission/DTO và finance O-05–07 còn review riêng |
| **Schema implemented and validated** | Không đổi schema trong docs task. R1a validation là evidence lịch sử student/session FK, không chứng minh period guard/generation đã implemented |
| **PostgreSQL migrations applied and tested** | **NOT RUN**; cần migration/backfill/privilege/inverse-trigger timing/deferred/rollback và ≥2-client races trên DB được phép. Prisma validate không chứng minh PostgreSQL concurrency |
| **Runtime feature ready** | **NOT RUN / NOT IMPLEMENTED bởi task này**; Billing/Jobs/API/current auth/idempotency/source invalidation/issue/adjustment tests và NFR/restore còn gate riêng |

**Offline verification scope:** đối chiếu working-copy sources, snapshot/hash và diff; kiểm normative pricing terminology, actual local links/anchors, Markdown fences/tables/AC IDs và frozen historical body A–M; reference calculations/date examples nếu chạy chỉ là checks của đặc tả. 17 reference checks cũ ở L.1 giữ đúng evidence cho historical B; không được tính lại thành 17 acceptance PASS cho A. 27 rows N.5 là **test specifications** cho đến khi implementation/SQL thực tế chạy. Kết quả check offline mới được báo ở câu trả lời cuối task, không bịa runtime evidence.

**Remaining work, không authorization:** technical sign-off H-04/O-01/O-04/O-13, schema/migration proposal + historical-data inventory (chưa kết nối DB), approved backfill strategy nếu có legacy rows, actual PostgreSQL ≥2-connection proof, API transport review và runtime feature slice. Không sửa legacy issued pricing basis từ B sang A bằng blanket update; preserve provenance/history và xử lý ngoại lệ qua authority riêng. Không triển khai R1b/R2, không schema/migrations/backend/frontend; không Git add/commit/push/branch/PR. Dừng sau đồng bộ tài liệu và checks để owner review diff.
