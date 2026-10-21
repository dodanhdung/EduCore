# Billing & Receivables — Batch A + B + C review

Trạng thái: **BILLING_UI_PARTIAL**. Đã có UI BL01–BL11; tích hợp finance API và quyết định kỹ thuật Payment reversal còn chờ. Ánh xạ 88 frame Figma nằm trong [FIGMA_FRAME_MAP.md](FIGMA_FRAME_MAP.md). Page được xác nhận là `65:5 — F. Billing & Receivables`.

| Screen | UC / quy tắc | Route | Thành phần | Trạng thái UI |
|---|---|---|---|---|
| BL01 | UC-21, BR-06, Q-08, O-12 | `/app/:tenantId/finance/pricing` | `BL01/PriceRulesScreen.tsx` | Bộ lọc, phiên bản lịch sử chỉ đọc, biểu mẫu local, thiếu giá/chồng lấn |
| BL02 | UC-22, Q-02/Q-09 | `/app/:tenantId/finance/discount-eligibility` | `BL02/SiblingDiscountScreen.tsx` | Chứng cứ verified/unverified/revoked; ghi danh; ưu đãi 10% tách khỏi xác minh |
| BL03 | UC-23, BR-04, Q-08, O-12 | `/app/:tenantId/finance/billing-periods` | `BL03/BillingPeriodsScreen.tsx` | Kỳ, nguồn, generation G1/G2, stale, failed, running, NEEDS_INFORMATION, dialog tính lại |
| BL04 | UC-23/24, BR-04/06 | `/app/:tenantId/finance/drafts` | `BL04/DraftInvoiceListScreen.tsx` | Bảng, bộ lọc, phân trang, thiếu dữ liệu và điều hướng theo draft ID |
| BL05 | UC-24, BR-04/06/08 | `/app/:tenantId/finance/drafts/:draftId` | `BL05/DraftInvoiceReviewScreen.tsx` | Snapshot buổi học, nguồn/policy/generation, cảnh báo và xác nhận phát hành PENDING_API |
| BL06 | UC-24, BR-06/09 | `/app/:tenantId/finance/invoices` | `BL06/IssuedInvoiceListScreen.tsx` | Danh sách phát hành, thanh toán, quá hạn, hủy và điều hướng theo invoice ID |
| BL07 | UC-24, BR-06/09/11 | `/app/:tenantId/finance/invoices/:invoiceId` | `BL07/InvoiceDetailScreen.tsx` | Snapshot bất biến, nghĩa vụ/phân bổ/ví tách riêng, lịch sử, dialog BL08 và liên kết BL10 |
| BL08 | UC-25, Wallet B1/B2 | Nhúng BL07/BL09 | `BL08/WalletOperationDialogs.tsx` | TOP_UP và WALLET Payment tách biệt; form, validation, review, pending/feedback; không ghi giao dịch |
| BL09 | UC-25, Wallet B1–B5 | `/app/:tenantId/finance/receivables` | `BL09/ReceivablesWalletScreen.tsx` | Công nợ, ví theo student, lịch sử TOP_UP/debit/credit/reversal và legacy đối soát |
| BL10 | UC-26/34, BR-11 | `/app/:tenantId/finance/invoices/:invoiceId/adjust` | `BL10/InvoiceAdjustmentScreen.tsx` | Hóa đơn gốc chỉ đọc, form yêu cầu, review, PENDING_API, decision/execution riêng |
| BL11 | UC-25/26, Wallet B4 | Nhúng BL09 | `BL11/TopUpReversalDialog.tsx` | Đảo toàn phần TOP_UP, đủ/thiếu số dư, đã đảo, lý do/chứng cứ; Payment reversal NEEDS_DECISION |

## Hợp đồng màn hình Batch C

| ID | Actor và scope | Dữ liệu/điều hướng | Trạng thái UI và ranh giới |
|---|---|---|---|
| BL08 | Staff có financial permission đúng tenant/student; Parent/Student chỉ đọc | TOP_UP nhúng ví BL09; Payment WALLET nhúng hóa đơn ISSUED BL07 | Nhập, validation, review, `PENDING_API`; duplicate, concurrent, unknown, forbidden là feedback không thực thi; không tự debit hoặc tạo Payment |
| BL09 | Người xem được API cấp đúng scope | Route sẵn có; chọn ví student, mở invoice bằng ID | No debt, zero balance, lịch sử rỗng, overdue/partial, legacy cần đối soát; ví không trừ công nợ, credit không cộng tiền nhận mới |
| BL10 | Staff có quyền yêu cầu; người không có quyền chỉ xem | Route sẵn có với invoiceId; snapshot và history theo ID | Invalid/legacy/cancelled blocked; local review chỉ dẫn `PENDING_API`; APPROVED khác COMPLETED, lỗi thực thi không báo hoàn tiền |
| BL11 | Staff có quyền đúng ví/student | Dialog từ TOP_UP gốc trong BL09; không route | Full-only, thiếu balance/đã đảo/chưa quyền blocked; Payment reversal chỉ ghi `NEEDS_DECISION`, không có form/route |

**PROPOSED UI:** vị trí các dialog, tab, copy pending và dạng cảnh báo chờ owner review theo từng màn. Dữ liệu preview được gắn nhãn mẫu, chỉ có ở `import.meta.env.DEV`. Production chưa có finance read/permission API nên fail closed và không nhập fixture. Các nút xác nhận chỉ đổi bước local sang `PENDING_API`; kết quả, số dư, nghĩa vụ, receipt và audit phải do máy chủ trả.

## Hợp đồng màn hình Batch B

- Mỗi màn có một entry component theo canonical ID. BL04/06 tìm kiếm, lọc và phân trang trên dữ liệu đã được cấp; BL05/07 dùng ID thật của draft/invoice. ID không tồn tại hiển thị trạng thái an toàn, không tự chuyển sang bản ghi khác.
- Dự thảo chưa là công nợ. Thiếu nguồn không suy thành 0. BL05 trình bày buổi học, ngày nguồn theo tenant timezone, charge unit, PriceRule và cửa sổ `[from,to)`, generation và policy pin. Nút phát hành chỉ mở xác nhận local khi snapshot sẵn sàng; sau xác nhận chỉ báo `PENDING_API`, không tạo số hóa đơn.
- BL06/07 chỉ đọc snapshot phát hành. Nghĩa vụ gốc, nghĩa vụ sau điều chỉnh, phân bổ, công nợ còn lại và số dư ví độc lập. `APPROVED` và `COMPLETED` hiện riêng trong lịch sử. Bản legacy/mixed được gắn nhãn nguồn.
- `canManage` là bằng chứng quyền trình bày do host cấp, mặc định `false`; role trong URL preview chỉ minh họa Staff hoặc Parent/Student. Production chưa có finance read/permission API nên chỉ hiển thị trạng thái chờ dữ liệu, không nhập fixture.
- BL08 và BL10 được nối trong Batch C. Figma có biến thể phát hành thành công; Batch B không giả lập thành công khi chưa có API.

## Hợp đồng màn hình Batch A

- Mục tiêu: xem và rà soát PriceRule, điều kiện ưu đãi anh/chị/em, trạng thái kỳ/generation trước khi phát hành draft.
- Actor/scope: Accountant hoặc Manager khi Backend cấp permission và resource scope; UI không tự suy quyền từ nhãn role. `AppView` vẫn dùng guard hiện có. Production chưa có finance read API nên chỉ hiện trạng thái chờ dữ liệu; không tải fixture vào route sản xuất.
- Dữ liệu và field: PriceRule có scope, VND string, `[effectiveFrom,effectiveTo)`, policy, trạng thái; sibling có chứng cứ và ghi danh riêng; kỳ có timezone, tình trạng điểm danh, PriceRule, policy pin và generation history.
- Điều hướng: BL01/02/03 theo route registry hiện có. BL03 liên kết BL04. Preview chỉ được tải bởi `import.meta.env.DEV`.
- Trạng thái: `loading/error/forbidden` phụ thuộc API tương lai; hiện production báo chưa có dữ liệu. Preview có populated, empty qua filter, historical, revoked, missing source, stale, failed và running. Các trạng thái được dẫn bằng text, không chỉ màu.
- Thao tác `CONNECTED_UI`: lọc, mở/đóng dialog, nhập field, kiểm tra field bắt buộc, chọn kỳ/generation, xem thông tin và lịch sử. `PENDING_API`: lưu PriceRule, xác minh quan hệ, tạo/retry/recompute billing run. Không có local mutation hoặc thông báo thành công.
- Quy tắc: local session-start tại timezone tenant đã freeze quyết định giá và kỳ; SESSION→CLASS→COURSE; thiếu nguồn là `NEEDS_INFORMATION`; retry giữ generation; tính lại DRAFT có lý do và expected generation; ISSUED bất biến; không trừ ví lúc tính.
- Responsive: một thành phần React mỗi Screen ID; desktop 3 metric cards, mobile một cột, bảng cuộn ngang trong card, dialog cuộn trong viewport. Kiểm tra viewport 320/390/768/1440 được ghi trong báo cáo task.
- **PROPOSED:** cách trình bày thông báo `PENDING_API`, trạng thái rỗng và khoảng cách responsive của Batch A chờ owner review. Không coi Figma là phê duyệt API hoặc hành vi tài chính.

## Nguồn đối chiếu

`PROJECT_CONTEXT.md` §5/10/11; `SCREEN_MAP.md` BL01–BL03; `SCREEN_SPECIFICATIONS.md` BL01–BL03; `SCREEN_FLOWS.md` F05; `DESIGN_TOKENS.md`; `UI_GUIDELINES.md` §3/4/7/9; Requirements v5.1 BR-04/BR-06/Q-08/O-12; Usecase v1.3 UC-21–23; Figma frame 67:2, 67:572, 67:1120 và biến thể cùng ID.

## Nguồn Batch B

`SCREEN_MAP.md` BL04–BL07; `SCREEN_SPECIFICATIONS.md` bốn card tương ứng; `SCREEN_FLOWS.md` F05/F07; Requirements v5.1 BR-04/06/08/09/11/13/14, O-12/Wallet; Usecase v1.3 UC-23/24; Billing class/API design; Figma frame 67:1668, 67:2219, 67:2848, 67:4099 cùng biến thể trong frame map.

## Nguồn Batch C

`SCREEN_MAP.md` BL08–BL11; `SCREEN_SPECIFICATIONS.md` bốn card tương ứng; `SCREEN_FLOWS.md` F05/F07; Requirements v5.1 Wallet B1–B5, BR-08/11/12/14; Usecase v1.3 UC-25/26/34; Figma frame 67:5182, 109:2, 67:4642, 67:5367, 67:5910 cùng biến thể trong frame map. Q1–Q8 kỹ thuật Wallet và Payment reversal còn chờ quyết định, không được coi là API đã duyệt.
