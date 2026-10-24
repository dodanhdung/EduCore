# EC-SL-AUTH-RECOVERY — Khôi phục mật khẩu AU03 + AU04

> **APPROVED_FOR_LOCAL_IMPLEMENTATION · 24/10/2026.** Owner phê duyệt rõ bằng `APPROVE_PASSWORD_RECOVERY_SLICE`, giới hạn D01–D03 bên dưới. Phê duyệt này không xác nhận SMTP/P0 end-to-end hoặc cho phép Git/deploy.
> Tài liệu này chỉ đặc tả một vertical slice; không sửa FR/UC/BR/Q.

## Metadata và nguồn

| Mục | Giá trị |
|---|---|
| Ưu tiên / actor | P0; người dùng quên mật khẩu, không cần phiên đăng nhập hoặc tenant đã chọn |
| Nhánh / HEAD gốc | `feat/auth-password-recovery` / `85b7d4b14de35f2c20901288bb23cdfa21d70b41` (`main` cùng SHA khi kiểm tra) |
| Truy vết | Requirements v5.1: FR-01, NFR-04/09/10/13, Q-01; UC v1.3: UC-03, AC-03-01–04, E2E-17. UC-03 không gán BR riêng. |
| Thiết kế | Architectural Design §6.1; Database Design v1.1 §3 (users/credentials/auth_sessions/password_reset_otps); Detailed Design §5.1; API Specifications §3.1, Appendix A.3; class design `identity-access.md` §3, §4 |
| UI/integration | `SCREEN_MAP.md` AU03/AU04; đúng hai card AU03/AU04 trong `SCREEN_SPECIFICATIONS.md`; `UI_GUIDELINES.md` §§2, 4, 6; `R7_API_INVENTORY.md` AU03/AU04; `R8_BACKLOG.md` priority 1 |
| Người duyệt / ngày duyệt | Owner trong cuộc trao đổi ngày 24/10/2026; `APPROVED_FOR_LOCAL_IMPLEMENTATION` cho AU03/AU04, D01–D03 |
| Trạng thái triển khai | `IMPLEMENTED_LOCALLY`, chờ owner review trước Git; UC-03 nhánh 2a vẫn OPEN |

### Quyết định owner áp dụng cho slice

- **D01 APPROVED:** giữ HTTP 202 trung tính và adapter hiện tại; Option A chỉ cho tích hợp UI/API. UC-03 nhánh 2a **OPEN** để thiết kế/kiểm chứng lỗi chuyển phát riêng trước khi tuyên bố P0 acceptance đầy đủ. Không đổi hành vi delivery backend.
- **D02 APPROVED:** AU04 có ô email tường minh, phản hồi trung tính, trạng thái lỗi và điều hướng như §3. Không dùng URL query hoặc persistent storage làm recovery context.
- **D03 APPROVED:** validation password frontend theo backend: ít nhất 12 Unicode code points, tối đa 1.024 byte UTF-8; kiểm thử các mốc biên.

## 1. Kết quả người dùng và ranh giới

Người dùng yêu cầu OTP qua email tại `/forgot-password`, nhập email + OTP + mật khẩu mới tại `/reset-password`, và chỉ sau HTTP 204 từ lệnh reset nguyên tử mới được đưa về `/login`. Không tự đăng nhập. Phản hồi yêu cầu OTP phải giống nhau cho email có/không có tài khoản; HTTP 202 chỉ có nghĩa backend đã tiếp nhận yêu cầu, **không xác nhận email được chuyển phát**.

Chỉ AU03/AU04, ApiClient hiện có và kiểm thử liên quan được phép triển khai sau khi duyệt spec. Ngoài phạm vi: AU05/AU06, navigation grants, thay đổi login/refresh/logout/chọn tenant, endpoint verify OTP riêng, migration/schema mới, SMTP thật, P1 và các business module khác.

## 2. Hợp đồng đã có và tình trạng mã

| Thao tác | Input / output thực tế | Quyền, phạm vi, giới hạn |
|---|---|---|
| `POST /api/v1/auth/password/otp/request` | JSON `{email}`; 202 `{accepted:true}` với email hợp lệ bất kể tài khoản tồn tại; 400 input/email sai; 429 giới hạn; 5xx lỗi hạ tầng | Public. Email được NFC/trim/lowercase. Controller dùng throttle theo IP cho nhóm `otp`: 10 lần/phút; SQL chỉ phát mã cho user `ACTIVE`, giới hạn một OTP/user/phút. Không có Bearer/tenant. |
| `POST /api/v1/auth/password/reset` | JSON chính xác `{email,otp,newPassword}`; 204 body rỗng; 400 input/OTP/policy sai; 429; 5xx | Public. Throttle theo IP cho nhóm `reset`: 20 lần/phút. OTP đúng 6 chữ số, purpose `PASSWORD_RESET`, tối đa 5 lần thử của OTP còn hiệu lực; mật khẩu tối thiểu 12 Unicode code points, tối đa 1024 byte. Không có Bearer/tenant. |

Backend hiện có `AuthController`/`AuthService` và SQL `educore_r4.request_otp`/`reset_password`; HMAC OTP gắn email + purpose, hạn 15 phút, một lần dùng. SQL reset giữ lock user/OTP, ghi Argon2id hash, consume OTP, revoke mọi `auth_sessions` trong một DB function/transaction. HTTP filter trả `{code,message,correlationId}`; các lỗi OTP sai, hết hạn, đã dùng, sai purpose và password policy hiện cùng status 400/code `INVALID_INPUT`, nên UI **không suy diễn** nguyên nhân cụ thể từ response. Rate limit là `429/RATE_LIMITED`. ApiClient hiện đã hỗ trợ timeout 15 giây, envelope lỗi, HTTP 204 và không lưu token lâu dài; chưa có hai method khôi phục.

AU03/AU04 hiện chỉ hiện `PENDING_API`. AU04 chưa có email input. Mã production không dùng Preview fixtures. `R7_API_INVENTORY.md` đánh dấu hai route `IMPLEMENTED_NOT_INTEGRATED`; các test R4 hiện có bao phủ một phần SQL/HTTP, nhưng chưa được chạy trong task viết spec này.

## 3. UI contract được duyệt cho tích hợp cục bộ

| Màn | Input và hành động | Các trạng thái cần hiển thị |
|---|---|---|
| AU03 | Email bắt buộc, validate tại client; gọi method ApiClient riêng một lần mỗi submit; sau 202 hiện thông báo trung tính “Nếu tài khoản đủ điều kiện, mã có thể được gửi đến email. Vui lòng kiểm tra hộp thư và thư rác.” và đường dẫn rõ ràng đến AU04. | Idle, inline validation, pending (khóa submit), accepted, 429 (hướng dẫn chờ), network/5xx (không báo thành công; cho thử lại). Không giữ OTP hay thông tin xác thực trong URL/storage. |
| AU04 | Email field tường minh để dùng được khi mở trực tiếp/reload; OTP 6 chữ số; mật khẩu mới ≥12 Unicode code points và ≤1.024 byte UTF-8; xác nhận khớp. Submit chính xác ba field backend, không gửi confirmation. | Idle, inline validation, pending (khóa submit), 400 OTP/policy với thông báo an toàn “Mã hoặc thông tin chưa hợp lệ; kiểm tra lại hoặc yêu cầu mã mới”, 429, network/5xx, success sau 204. Sau success xóa OTP/password/confirmation khỏi state và điều hướng login; không auto-login. |

Lỗi email ở AU03/AU04 báo cạnh field; backend error envelope được chuyển thành câu chữ an toàn, không hiển thị `message` nội bộ hay trạng thái tài khoản. Khi 400 do OTP, dẫn người dùng về AU03 để xin mã mới; không khẳng định mã đã hết hạn nếu API không phân biệt. Submit lặp khi pending phải bị chặn. Kết quả đến muộn sau unmount không cập nhật màn hình. Không đưa OTP/password/token vào URL, localStorage, sessionStorage, log hoặc báo cáo.

Giữ `AuthScreen/AuthCard/FormField/SafeFeedback/PrimaryButton` và style hiện có; label gắn input, `aria-invalid` + thông báo lỗi được liên kết, status/alert phù hợp, focus sau lỗi/success, có thể dùng bàn phím, kiểm tra 320/375/768/1024 px và reduced motion theo UI Guidelines. URL route AU03/AU04 hiện có trong App; không đổi navigation grants.

## 4. OTP, lỗi và transaction

`requestOtp` tạo mã trong backend; SQL lưu HMAC, phát mã qua OTP adapter sau commit. Mã request mới sẽ consume mã chưa dùng trước đó khi hợp lệ. Đường gửi hiện **best effort / fire-and-forget**: adapter lỗi được ghi log mã lỗi chung, response 202 vẫn có thể đã trả. Thử lại tuân giới hạn IP và user; không hiển thị bảo đảm chuyển phát.

`reset_password` chỉ xử lý purpose đúng và mã chưa hết hạn/chưa dùng/chưa vượt số lần thử. Sai OTP tăng `attempt_count`; thất bại giữ mật khẩu/phiên cũ. Thành công cập nhật password hash, consume OTP, revoke mọi phiên cũ nguyên tử; login bằng mật khẩu cũ bị từ chối, mật khẩu mới được chấp nhận. Không thêm endpoint xác minh OTP, token reset, persistent storage hay thay đổi provider. Capture adapter chỉ dùng trong test/non-production.

**OPEN — UC-03 nhánh 2a (D01):** UC yêu cầu báo không thể hoàn tất khi gửi OTP thất bại, nhưng adapter hiện gửi bất đồng bộ và HTTP 202 không biết kết quả chuyển phát. Owner đã chọn **A cho slice này**: giữ 202 trung tính và hướng dẫn kiểm tra/thử lại, chấp nhận chưa chứng minh nhánh 2a. Thiết kế lỗi chuyển phát bền vững/chống enumeration và SMTP thật phải review riêng trước khi xác nhận P0 acceptance đầy đủ. Không tự sửa backend delivery hoặc trả lỗi khác nhau theo tồn tại tài khoản.

**D02 APPROVED:** owner duyệt email field AU04 và copy trung tính cho triển khai cục bộ; không dùng email qua query string.

## 5. Ma trận nghiệm thu sau khi được duyệt triển khai

| ID | Cấp kiểm thử / điều cần chứng minh |
|---|---|
| T01–T05 | UI + HTTP: email hợp lệ yêu cầu 202; email lạ cùng body; email sai chặn/gặp 400; 429; network/5xx không báo thành công, retry được. |
| T06–T10 | PostgreSQL thật + HTTP: sai purpose, hết hạn, sai mã, mã đã dùng, password policy fail; mật khẩu và phiên không đổi khi thất bại. |
| T11–T16 | UI + HTTP + PostgreSQL: xác nhận mật khẩu không khớp; reset 204 nguyên tử; phiên access/refresh cũ bị thu hồi; mật khẩu cũ fail; mật khẩu mới login được; URL/storage không chứa OTP/password. |
| T17–T19 | UI/browser: double submit chỉ một request khi pending; backend fail không có false success; AU01/AU02/navigation vẫn PASS. |
| T20 | Capture OTP test-only để chứng minh đường phát request→reset. SMTP thật: ghi `NOT VERIFIED`; không dùng địa chỉ khách hàng hoặc credential thật. |

Các test R4 native chỉ chạy trên DB **mới, disposable**, đúng admission của `test/r4/start-r4-native.ps1`; HTTP double và browser được báo riêng, không gọi là real end-to-end. Lệnh kiểm tra: `pnpm.cmd --dir apps/api build`, `lint`, `test`; `pnpm.cmd --dir apps/web build`, `lint`, `test`; native R4 phù hợp; browser smoke nếu môi trường có; `git diff --check`. Kết quả thực chạy được báo riêng trong handoff.

## 6. File được phép sửa sau approval và bàn giao

File triển khai trong phạm vi: `apps/web/src/api.ts`, `apps/web/src/App.tsx`, `apps/web/src/screens/Authentication & Shared/AU03/RecoveryRequestScreen.tsx`, `AU04/ResetPasswordScreen.tsx`, `AuthComponents.tsx`, `BatchPrimitives.tsx`, `authFormValidation.ts`, các test frontend/API R4 liên quan và `apps/web/package.json` để chạy test mới. Browser helper và R4 native/HTTP tests chỉ thay phần xác minh, không đổi backend controller/service/SQL hoặc migration lịch sử.

File mới của task hiện tại: chính spec này và test recovery chuyên biệt. Mọi file mới phải review trước Git. Definition of Ready cho tích hợp cục bộ: **đạt theo D01–D03**; UC-03 nhánh 2a giữ OPEN riêng. Definition of Done cho slice này: mã trong phạm vi, test thực chạy và phân loại, diff/manifest, ZIP review; không commit/push/PR/merge/deploy/Figma write.
