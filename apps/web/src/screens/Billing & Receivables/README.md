# Billing & Receivables — Batch A review

Trạng thái: **BILLING_UI_PARTIAL**. Đã có BL01–BL03; BL04–BL11 còn chờ triển khai. Ánh xạ 88 frame Figma nằm trong [FIGMA_FRAME_MAP.md](FIGMA_FRAME_MAP.md). Page được xác nhận là `65:5 — F. Billing & Receivables`.

| Screen | UC / quy tắc | Route | Thành phần | Trạng thái UI |
|---|---|---|---|---|
| BL01 | UC-21, BR-06, Q-08, O-12 | `/app/:tenantId/finance/pricing` | `BL01/PriceRulesScreen.tsx` | Bộ lọc, phiên bản lịch sử chỉ đọc, biểu mẫu local, thiếu giá/chồng lấn |
| BL02 | UC-22, Q-02/Q-09 | `/app/:tenantId/finance/discount-eligibility` | `BL02/SiblingDiscountScreen.tsx` | Chứng cứ verified/unverified/revoked; ghi danh; ưu đãi 10% tách khỏi xác minh |
| BL03 | UC-23, BR-04, Q-08, O-12 | `/app/:tenantId/finance/billing-periods` | `BL03/BillingPeriodsScreen.tsx` | Kỳ, nguồn, generation G1/G2, stale, failed, running, NEEDS_INFORMATION, dialog tính lại |

## Hợp đồng màn hình Batch A

- Mục tiêu: xem và rà soát PriceRule, điều kiện ưu đãi anh/chị/em, trạng thái kỳ/generation trước khi phát hành draft.
- Actor/scope: Accountant hoặc Manager khi Backend cấp permission và resource scope; UI không tự suy quyền từ nhãn role. `AppView` vẫn dùng guard hiện có. Production chưa có finance read API nên chỉ hiện trạng thái chờ dữ liệu; không tải fixture vào route sản xuất.
- Dữ liệu và field: PriceRule có scope, VND string, `[effectiveFrom,effectiveTo)`, policy, trạng thái; sibling có chứng cứ và ghi danh riêng; kỳ có timezone, tình trạng điểm danh, PriceRule, policy pin và generation history.
- Điều hướng: BL01/02/03 theo route registry hiện có. BL03 liên kết BL04, hiện là `PENDING_SCREEN`. Preview ở `/__ui-preview/BL01`, `/BL02`, `/BL03` chỉ được tải bởi `import.meta.env.DEV`.
- Trạng thái: `loading/error/forbidden` phụ thuộc API tương lai; hiện production báo chưa có dữ liệu. Preview có populated, empty qua filter, historical, revoked, missing source, stale, failed và running. Các trạng thái được dẫn bằng text, không chỉ màu.
- Thao tác `CONNECTED_UI`: lọc, mở/đóng dialog, nhập field, kiểm tra field bắt buộc, chọn kỳ/generation, xem thông tin và lịch sử. `PENDING_API`: lưu PriceRule, xác minh quan hệ, tạo/retry/recompute billing run. Không có local mutation hoặc thông báo thành công.
- Quy tắc: local session-start tại timezone tenant đã freeze quyết định giá và kỳ; SESSION→CLASS→COURSE; thiếu nguồn là `NEEDS_INFORMATION`; retry giữ generation; tính lại DRAFT có lý do và expected generation; ISSUED bất biến; không trừ ví lúc tính.
- Responsive: một thành phần React mỗi Screen ID; desktop 3 metric cards, mobile một cột, bảng cuộn ngang trong card, dialog cuộn trong viewport. Kiểm tra viewport 320/390/768/1440 được ghi trong báo cáo task.
- **PROPOSED:** cách trình bày thông báo `PENDING_API`, trạng thái rỗng và khoảng cách responsive của Batch A chờ owner review. Không coi Figma là phê duyệt API hoặc hành vi tài chính.

## Nguồn đối chiếu

`PROJECT_CONTEXT.md` §5/10/11; `SCREEN_MAP.md` BL01–BL03; `SCREEN_SPECIFICATIONS.md` BL01–BL03; `SCREEN_FLOWS.md` F05; `DESIGN_TOKENS.md`; `UI_GUIDELINES.md` §3/4/7/9; Requirements v5.1 BR-04/BR-06/Q-08/O-12; Usecase v1.3 UC-21–23; Figma frame 67:2, 67:572, 67:1120 và biến thể cùng ID.

## Checkout caveat

HEAD `64dbf60` thiếu toàn bộ `apps/web/src/ui-preview` dù `main.tsx` và các test cũ import. Sáu tệp Preview cũ được phục hồi từ commit `e3d847b` trong working tree, sau đó `PreviewApp.tsx`/`preview.css` được mở rộng cho Billing. Các tệp này cần owner review như tệp mới của nhánh hiện tại.
