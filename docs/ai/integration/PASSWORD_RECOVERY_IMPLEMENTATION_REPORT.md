# Password Recovery AU03/AU04 — Local implementation handoff

**Ngày:** 24/10/2026 (`Asia/Saigon`) · **Trạng thái:** `PASSWORD_RECOVERY_READY_FOR_OWNER_REVIEW` cho tích hợp cục bộ. **P0 end-to-end delivery vẫn OPEN** theo D01/UC-03 nhánh 2a. Chưa owner review cho Git.

## Scope, authority và baseline

- Owner phê duyệt `APPROVE_PASSWORD_RECOVERY_SLICE` cho [feature spec](../features/password-recovery-au03-au04.md): D01 giữ 202 trung tính và OTP delivery hiện có; D02 email field AU04/copy an toàn; D03 password 12 Unicode code points–1.024 UTF-8 bytes.
- FR-01, Q-01, UC-03/AC-03-01–04, NFR-04/09/10/13; UC-03 không gán BR riêng. R7 inventory xác nhận backend routes có sẵn, AU03/AU04 chưa tích hợp trước task.
- Branch `feat/auth-password-recovery`; HEAD `85b7d4b14de35f2c20901288bb23cdfa21d70b41`, bằng `main` lúc bắt đầu. Working tree trước task chỉ có spec mới từ gate trước, không có owner source changes khác.
- Không sửa controller/service/SQL, migration, provider, AU06, navigation grants, login/refresh/logout hoặc business module ngoài scope. Không commit/push/PR/merge/deploy/Figma write.

## Thay đổi thực hiện

- ApiClient có `requestPasswordResetOtp` và `completePasswordReset`, dùng request timeout/envelope hiện có, buộc status 202/204 và body acceptance đúng; không gửi Bearer/cookie cho hai public commands.
- AU03 validate email, khóa double submit, thông báo trung tính chỉ sau API 202, báo 429/network/5xx và cho thử lại; link AU04 không mang dữ liệu nhạy cảm.
- AU04 có email field để mở trực tiếp/reload, validate OTP/password/xác nhận, gửi đúng DTO, khóa double submit; 400 dùng phản hồi chung vì backend không phân biệt OTP sai/hết hạn/đã dùng; 204 mới xóa state và về login. Không auto-login.
- Shared validation dùng `Array.from(password).length` và `TextEncoder` để khớp chính sách backend. Form có `aria-busy`, label/error links, focus vào input lỗi; AU03 focus link tiếp theo sau acceptance. Giữ layout responsive và UI components cũ.
- Bổ sung test consumer/UI, HTTP service double, PostgreSQL purpose/throttle và browser Edge dùng OTP capture test-only.

## Kiểm tra thực chạy

| Lệnh / lớp | Kết quả cuối | Giới hạn |
|---|---|---|
| `pnpm.cmd --dir apps/api build` | PASS | Nest build. |
| `pnpm.cmd --dir apps/api lint` | PASS, 0 warning sau sửa | Source + test type-aware. |
| `pnpm.cmd --dir apps/api test` | **85 PASS, 0 FAIL, 0 SKIP**, 11 files | Unit + HTTP double; không thay bằng PostgreSQL evidence. |
| `pnpm.cmd --dir apps/web build` | PASS | TypeScript + Vite. |
| `pnpm.cmd --dir apps/web lint` | PASS, 1 warning cũ ở AT03 | Không thuộc slice này. |
| `pnpm.cmd --dir apps/web test` | **240 PASS, 0 FAIL, 0 SKIP** | Consumer/UI JSDOM + các regressions AU01/AU02/navigation. |
| `start-r4-native.ps1 -RunTests -TestFilter 'A07\|A08\|A17\|A19\|D10'` | **7 PASS, 0 FAIL, 73 SKIP** | Fresh disposable PostgreSQL 16, restricted roles; A19 là Edge thật qua React→NestJS→PostgreSQL, OTP capture test-only. Filter bỏ các ca R4 không liên quan. |
| `git diff --check` + kiểm trailing whitespace ở file mới | PASS | Diff tracked và ba file mới; không kiểm generated files. |

Native run cuối dùng task-owned container `educore-r4-native-1ee7335414d348cfae291a687c2b671b`, loopback only; sanitized environment evidence ở OS temp `educore-r4-native-1ee7335414d348cfae291a687c2b671b`, test evidence `educore-r4-evidence-L4xeX3/evidence.json`. Hai run trước cũng để lại container task-owned `educore-r4-native-049d6c0fc5124f1ba7268c2a31b862d5` và `educore-r4-native-ef58d505f4034c56821c9620ec156390` theo chính sách runner giữ tài nguyên để kiểm tra. Không tái dùng shared DB hoặc đóng gói temp evidence/DB vào ZIP.

**Lượt đầu có FAIL do chạy đồng thời:** API test 2 Argon2 timeouts + PGlite `beforeAll` timeout; web test 1 file process fail cùng Vite cache `EPERM`/port contention. Sau đó chạy lại API và web test **tuần tự**, kết quả cuối ở bảng trên. Không coi lượt lỗi đầu là test PASS; nguyên nhân được nhận diện qua timeout/collision, không sửa code nghiệp vụ để che lỗi.

## Security / acceptance evidence

- PostgreSQL A07: email có/không có tài khoản cùng 202 body; OTP consume một lần; Argon2id hash; old access session bị revoke; mật khẩu cũ fail, mật khẩu mới login được.
- PostgreSQL A08/A08b/A08c/A17: OTP sai/quá số lần, purpose mismatch, hết hạn, per-IP throttle và per-user resend window. HTTP double kiểm 400/429/envelope và DTO; UI double kiểm network failure, retry, duplicate submit và không có false success.
- Edge A19 kiểm browser thực gọi 202/204, AU04 vẫn dùng được sau reload trực tiếp, điều hướng/login bằng mật khẩu mới, URL/storage và DOM sau reset không chứa OTP/password. Test dùng `CaptureOtpDelivery` trong môi trường non-production, không API capture công khai.
- **Chưa xác minh SMTP thật hoặc địa chỉ khách hàng.** HTTP 202 không bảo đảm phát thư. UC-03 nhánh 2a vẫn OPEN; cần thiết kế và kiểm chứng riêng trước khi nói toàn bộ P0 recovery đã được nghiệm thu.

## Manifest để owner review

**Modified:**

1. `apps/api/test/r4/auth.spec.ts`
2. `apps/api/test/r4/browser-auth.ts`
3. `apps/api/test/r4/r4.postgres.test.ts`
4. `apps/api/test/r4/r7-http.spec.ts`
5. `apps/web/package.json`
6. `apps/web/src/App.tsx`
7. `apps/web/src/api.ts`
8. `apps/web/src/screens/Authentication & Shared/AU03/RecoveryRequestScreen.tsx`
9. `apps/web/src/screens/Authentication & Shared/AU04/ResetPasswordScreen.tsx`
10. `apps/web/src/screens/Authentication & Shared/AuthComponents.tsx`
11. `apps/web/src/screens/Authentication & Shared/BatchPrimitives.tsx`
12. `apps/web/src/screens/Authentication & Shared/authFormValidation.ts`
13. `apps/web/src/screens/Authentication & Shared/batch.test.mjs`

**New, review before Git:**

14. `apps/web/src/screens/Authentication & Shared/recovery.test.mjs`
15. `docs/ai/features/password-recovery-au03-au04.md`
16. `docs/ai/integration/PASSWORD_RECOVERY_IMPLEMENTATION_REPORT.md`

Owner-review archive: `artifacts/educore-password-recovery-owner-review.zip`; repository-relative paths only; archive itself ignored by existing policy and not committed.
