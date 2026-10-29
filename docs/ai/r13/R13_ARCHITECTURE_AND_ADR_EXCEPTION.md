# R13 — Blueprint và ngoại lệ ADR có giới hạn

Ngày: 2026-10-29 · Asia/Saigon. **Owner APPROVED D01–D08** theo [decision record](EduCore_R13_Approved_Decisions_2026-10-29.md) và yêu cầu Gate 0. Bản patch tài liệu này **PENDING OWNER REVIEW**; approval hướng triển khai không chứng minh Gate 0 pass hay cho phép Git/Figma/DB write.

## Nguồn và baseline
Branch `feature/frontend-architecture-reconstruction`, reviewed/current HEAD `6319759742313b17b805db7574ac1883e5f1fa17`. R10/R12 đã tích hợp; không replay ZIP. Đã đọc TARGET_ARCHITECTURE, BLOCKERS_AND_DECISIONS, ADR_PROPOSALS và ACCEPTANCE_GATES trong ZIP R13.0 ngày28/10. Requirements v5.1, UC và Accepted ADR giữ precedence. Independent Review được nhắc trong owner record chưa được cung cấp trong task này; không nhận đã review.

Decision record gốc được giữ nguyên, gồm trạng thái draft lịch sử và checklist chưa hoàn tất. File đã staged từ yêu cầu commit trước, nhưng commit bị chặn bởi lỗi quota của automatic approval; HEAD chưa đổi. Gate 0 không stage/commit thêm.

## D01–D08 và phạm vi
- D01: giữ baseline hiện tại, revalidate diff mỗi task; bảo toàn owner changes.
- D02: corrective slice AS01/BL03; API/DB/RBAC không đổi.
- D03: giữ module; shared shell/ui/styles, typed adapter/VM; compatibility facade.
- D04: ngoại lệ ADR có thời hạn dưới đây.
- D05: desktop sidebar256/header64 là tham chiếu; mobile giữ tenant/account/logout, focus/keyboard; breadcrumb/breakpoint cần evidence.
- D06: wordmark chữ; logo/favicon R12 candidate chưa approved. Font có license hoặc fallback có ghi deviation.
- D07: G01 chỉ3overviewKPI hợp lệ; panel thiếu projection deferred, không fake totals.
- D08: Gate0 → R13.1 → R13.2 → R13.3 → từng màn R13.4; BL07 control sau shared changes.

## TO-BE được chấp thuận về hướng
SessionController/tenant/navigation hiện có → một AppShell → container/adapter theo feature → typed VM → presentation → primitives/tokens.
Adapter identity gắn tenant + token/session + screen + resource/query. Token chỉ trong memory, không DOM/log/storage key. Cancel request và generation guard trước mọi commit state; không tin abort một mình. Loading/ready/empty/401/403/error phân biệt; null không biến0.
Presentation không fetch/quyết quyền; server giữ tenant+permission+resource scope. Giữ façade exports; không rename toàn tree. CSS Modules cho shared/new views phù hợp, legacy CSS tiếp tục tới cutover. Reuse approved R12 icons qua registry; candidate brand chỉ sau approval riêng. Fixture và real adapter nên dùng cùng view, fixture không chứng minh backend.

## Ngoại lệ tạm thời ADR-009/012
**APPROVED bounded exception**, không sửa hoặc thay thế Accepted ADR tại `docs/architectural/architectural_design.md` §ADR.
Trong Gate0 và R13.1–R13.4 visual slices, tiếp tục custom routing/local state/CSS hiện có; chưa đồng thời migrate React Router, TanStack Query, Tailwind, shadcn/ui, React Hook Form + Zod.
Lý do: tránh trộn migration nền tảng với correctness/layout; giữ API/auth/payment invariants có test. Không thêm dependency, không mở framework rewrite. **Reassess sau R13.4**, owner quyết task foundation riêng hoặc gia hạn có record. Ngoại lệ không áp backend stack, permission, cache cross-tenant, finance hay API.

## Milestones và unresolved
R13.1 shell sau Gate0 owner review; R13.2 primitives có consumers; R13.3 G01 baKPI; R13.4 OP01/AS01/BL03/PO01 từng task. Mỗi slice file allowlist, tests, ZIP review trước Git; BL07/AU01/AU05/GL01 regression khi shared layer đổi.
R13.0 đã đọc live frame12nodes; Gate0 không sửa/đọc lại Figma. G01/OP01/BL03 mobile chưa có node verified; exact mobile layout/breadcrumb vẫn review. Font actual face/license và logo chưa chốt. Không search/bell giả. Missing projection không mở API trong Gate0. Viewports nghiệm thu R13 là320/390/834/1024/1280; Gate0 ưu tiên state screenshots1280/390 nếu browser khả dụng.
Gate0 contract và acceptance: [R13_GATE_0_CONTRACT.md](R13_GATE_0_CONTRACT.md). Chưa mở R13.1.

