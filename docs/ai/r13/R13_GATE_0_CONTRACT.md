# R13 Gate 0 — contract sửa correctness

Ngày2026-10-29 · Baseline6319759742313b17b805db7574ac1883e5f1fa17.
Implementation scope được owner yêu cầu; patch mới **PENDING OWNER REVIEW**. Contract theo SCREEN_REVIEW_TEMPLATE, hai màn được owner chỉ định rõ; không reconstruct visual.

## Màn / nguồn / scope
AS01: Teacher, lớp được backend cấp; route /app/:tenantId/teaching/assignments; UC27/Q11, F06. Shared container AS02–AS07 cần giữ publish/version/upload/grade semantics.
BL03: Accountant/Manager với financial permission thực; /app/:tenantId/finance/billing-periods; UC23/BR04/Q08O12, F04/F05. BL07 UC24–26/Q10 là control.
Nguồn: SCREEN_MAP, đúng cards AS01/BL03/BL07, UI_GUIDELINES§4–5, DESIGN_TOKENS baseline, auth.ts/API request helpers, bốn audit reports được đọc từ ZIP.

## API/field/action giữ nguyên
AS: teaching assignments + assignment-classes; detail recipients/histories, mine, grading queue/context. Server status/revision/timezone giữ nguyên. Existing create/publish/submit/grade handlers giữ payload, If-Match, operation keys và file rules.
BL03: billing periods page/pageSize20; students first100; period timezone/source date/generations giữ nguyên. Paging và explicit mutations giữ semantics.
BL07: invoice/receivable/wallet riêng; BigInt VND; ambiguous payment chỉ receipt lookup original key, không auto POST retry.

## State matrix
| Trigger | Render / data | Action |
|---|---|---|
| Loading / scope đổi | Không hiển thị rows/detail/selection/draft thuộc scope cũ | Cancel đọc cũ; guard continuations; không action cũ |
| Ready / empty | Chỉ payload scope hiện tại; empty khác error | Existing permission-derived links |
|401 | Xóa protected state, thông báo phiên hết hạn | Đăng nhập lại; không GET retry như transient |
|403 | Xóa protected state, thông báo không có quyền | Không retry, không protected action |
|404 | Safe not-found | Không generic retry |
|409 | Conflict cần refresh/review; giữ draft cùng scope khi an toàn | Không tự resend mutation |
|400/422 | Validation/business error | Sửa input; không generic read retry |
|5xx/network | Error riêng, không false success | Explicit GET retry; không financial write retry tự động |

AS keyed scope boundary reset toàn bộ state khi tenant/token/screen/resource đổi; request sequence +AbortSignal chống out-of-order cùng scope. Không đổi auth architecture;401 link về login hiện hữu. Mutation/upload continuation không được gửi bước tiếp theo hay navigate sau scope đã mất. Draft cùng scope được giữ khi lỗi validation/transient; auth denial phải xóa.
BL03 boundary reset theo tenant/token/resource; read errors typed, terminal read state không render protected controls. Không remount BL07 theo token hoặc reset receipt refs bằng thay đổi Gate0.

## Allowlist
Sửa4file hiện có:
- apps/web/src/screens/Assignments & Grading/AssignmentsProduction.tsx
- apps/web/src/screens/Assignments & Grading/assignments-production.test.mjs
- apps/web/src/screens/Billing & Receivables/BillingProduction.tsx
- apps/web/src/screens/Billing & Receivables/billing-production.test.mjs

Mới2file: tài liệu này và R13_ARCHITECTURE_AND_ADR_EXCEPTION.md cùng directory.
Giữ nguyên owner decision record đã staged và .gitignore staged. Decision record được đưa vào reviewZIP để đủ docs group, không chỉnh bytes/index.
Không sửa API/auth/routes/AppShell/CSS/backend/DB/Figma/dependency. Temporary test/browser evidence ngoài source, chỉ vào ZIP nếu an toàn.

## Acceptance / verification
- AS01 loaded→403/401; tenant/token; A→B→A và late response; detail/history/grade/mine isolation; abort forwarded; same-scope retry; mutation continuation guard.
- BL03 loaded→403 no retry;401 safe state;5xx/network explicit retry;409/422 distinction; paging/scope; no automatic writes.
- BL07 separated amounts/unavailablewallet; ambiguous outcome receipt uses original key, retains key until COMMITTED; no extra POST.
- Existing affected/frontend suites, typecheck,lint,build,diffcheck; screenshots state1280/390 if available, mock transport explicitly labelled.
- Exact executed results/warnings in Vietnamese report inside review ZIP, không auto-check PASS ở contract.
- Owner review newfiles và proposed3commitgroups trước Git; R13.1 chỉ khi Gate0 acceptance/review được đóng.

Out of scope: UI reconstruction, missingAPIprojections, badgepolish, newbusinesspolicy, actualDB/authenticatedE2E. No fake success. Authorization vẫn do server.

