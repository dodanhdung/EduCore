# AU06 Account Activation MVP — owner review

**Ngày:** 24/10/2026 · **Branch:** `feat/auth-password-recovery` · **HEAD trước/sau công việc:** `841850efc5d01d81e4ac3db0579106c55ff6bcd8` (không commit).

## Scope / Sources

Nối AU06 với `POST /api/v1/auth/activation/otp/request` và `POST /api/v1/auth/activation/complete`. Nguồn: AGENTS.md, `educore-feature-slice`, PROJECT_CONTEXT, SCREEN_MAP AU06, SCREEN_SPECIFICATIONS AU06, FR-01/02, Q-01, Group A activation contract trong API specification và backend R4 hiện có. Chỉ sử dụng purpose `ACTIVATION`; không thay đổi D01/C03, backend, migration hay delivery adapter. C03 vẫn OPEN với kết quả cũ.

## Files changed

| Path | Nội dung |
|---|---|
| `apps/web/src/api.ts` | Hai phương thức activation, kiểm tra chính xác 202/204 và DTO. |
| `apps/web/src/App.tsx` | Nối AU06 với ApiClient. |
| `apps/web/src/screens/Authentication & Shared/AU06/ActivationScreen.tsx` | Request OTP, phản hồi trung tính, xác thực form, complete, retry, chặn nhấp trùng, abort khi unmount và chuyển `/login` sau 204. |
| `apps/web/src/screens/Authentication & Shared/batch.test.mjs` | API doubles và kiểm tra hành vi AU06. |
| `docs/ai/integration/AU06_ACTIVATION_MVP_REPORT.md` | Báo cáo này — **tệp mới cần owner review**. |

## Tests actually run

| Check | Kết quả |
|---|---|
| `pnpm.cmd --dir apps/web exec node --experimental-strip-types --test --test-name-pattern AU06 "src/screens/Authentication & Shared/batch.test.mjs"` | **PASS 4/4**; exact DTO/status, generic 202, validation Unicode/UTF-8, 400/429/network retry, duplicate clicks, no persistence, abort on unmount, 204 clears fields then `/login`. |
| `pnpm.cmd --dir apps/web build` | **PASS**. |
| `pnpm.cmd --dir apps/web lint` | **PASS**; một warning AT03 có sẵn, ngoài phạm vi AU06. |
| `pnpm.cmd --dir apps/api build` | **PASS**; chuẩn bị runner native. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests -TestFilter 'A08b|A09'` | **PASS 2/2, SKIP 90 do filter** trên cluster mới do runner tạo và kiểm tra (`017fceffa4f84b86b8d8427c5f48bbad`). A08b từ chối recovery OTP dùng cho activation; A09 bootstrap→activation→login thành công. |
| `git diff --check` | **PASS**; Git chỉ cảnh báo chuyển LF sang CRLF cho AU06. |

Lượt runner đầu tiên **FAIL trước khi tạo cluster** vì sandbox không đọc được Docker config. Chạy lại cùng runner với quyền đọc Docker config đã thành công; không đặt thủ công biến admission và không dùng database chung. Không chạy C03. Backend HTTP tests **SKIP** vì không sửa backend; browser test riêng **SKIP** theo phạm vi MVP, hành vi UI được kiểm tra bằng DOM/API doubles.

## Risks & deviations / Pending review

Activation email vẫn best-effort như backend hiện có; HTTP 202 không chứng minh SMTP hoặc inbox delivery. Không tự đăng nhập sau kích hoạt. Generic 400 từ complete không công bố trạng thái account. Các test frontend dùng doubles; native focused test xác nhận luồng backend kích hoạt/đăng nhập và purpose isolation, nhưng không phải phép thử SMTP production. Owner review tệp mới và ZIP trước khi Git; không commit, push, PR, merge hoặc deploy trong tác vụ này.
