# R7 — Chạy local

Ngày 23/10/2026, cập nhật verification24/10. Không deploy, không reset DB, không dùng shared/staging/production. Các lệnh dưới đây là hướng dẫn; kết quả R7 gốc ở `R7_IMPLEMENTATION_REPORT.md`, kết quả follow-up ở [AUTH_FOUNDATION_VERIFICATION_REPORT.md](AUTH_FOUNDATION_VERIFICATION_REPORT.md).

## Toolchain / cài dependency

Node **24.12+ trong dòng Node 24** cho Argon2id built-in; pnpm theo workspace hiện có. PostgreSQL 16 local và Docker Engine local đang chạy nếu dùng native runner. Không cần thêm dotenv.

Từ repository root:

```powershell
pnpm.cmd install --frozen-lockfile
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Chỉ copy khi file đích **chưa tồn tại**; không ghi đè cấu hình owner. Điền `.env` bằng editor riêng, không paste secret vào chat/log/Git. Hai example không chứa credential hoạt động. Các `.env` thực được gitignore; `.env.example` phải review trước Git.

## PostgreSQL local và restricted LOGINs

Runtime bắt buộc hai kết nối riêng: `R4_AUTH_URL` thuộc group `educore_r4_auth`, `R4_API_URL` thuộc `educore_r4_api`. Worker optional dùng `educore_r4_worker`. Không dùng migration user cho runtime, không dùng `DATABASE_URL` fallback, không migrate bằng restricted LOGIN. `assertRuntime()` từ chối superuser/owner/DDL/raw credential access/combined capabilities.

Để có dev DB mới: owner tạo **một cluster/container local riêng**, xác minh literal loopback, tên DB/dev-purpose, empty public schema và ownership trước khi chạy migration. Không tái dùng container R4/R6 cũ chỉ vì thấy trên máy. Không dùng `prisma migrate reset` hoặc schema push/rebaseline.

Sau khi owner xác minh target và cấu hình `DATABASE_URL` bằng migration LOGIN riêng, từ `apps/api`:

```powershell
node --env-file=.env node_modules/prisma/build/index.js migrate deploy
```

Đây là thao tác **owner chạy trên DB local đã xác minh**, không phải task R7 đã chạy. Migrator/operator provisioning giữ đặc quyền tách khỏi HTTP process. Trên cluster mới, DBA tạo các LOGIN riêng qua `psql` và đặt mật khẩu tương tác bằng `\password` (không viết plaintext vào SQL file), ví dụ:

```sql
CREATE ROLE educore_local_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE educore_local_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT educore_r4_auth TO educore_local_auth;
GRANT educore_r4_api TO educore_local_api;
\password educore_local_auth
\password educore_local_api
```

Nếu bật worker, tạo LOGIN khác cùng các hạn chế và GRANT đúng `educore_r4_worker`. Không gán owner/operator/migration capabilities cho ba LOGIN runtime. Tham khảo `apps/api/test/r4/README.md` và native harness về kiểm tra quyền; local DBA phải xác minh không có database/schema CREATE qua PUBLIC hoặc grant cũ.

Tạo tenant/Manager bằng controlled operator CLI hiện có, không public bootstrap. Operator credentials chỉ cung cấp cho process CLI, **không đặt trong env HTTP runtime**. Xem R4 README phần Controlled bootstrap. OTP activation cần SMTP được owner cho phép hoặc capture adapter trong test; `unavailable` không tạo được password/recovery hợp lệ. Không tạo fake session hoặc sửa credentials production để thử login. Tài khoản test do native harness tạo chỉ thuộc DB disposable của harness.

## Biến môi trường từ source hiện tại

| Biến | Local / điều kiện | Production |
|---|---|---|
| DATABASE_URL | Prisma CLI validate/generate/migrate; migration target riêng | Không phải runtime fallback; chỉ process migration |
| R4_AUTH_URL, R4_API_URL | Bắt buộc HTTP; LOGIN riêng như trên | Bắt buộc, restricted |
| R4_JWT_SECRET, R4_OTP_PEPPER | Hai secret random độc lập, mỗi secret >=32 bytes; không có shared sample key | Secret manager, không log |
| R4_JWT_ISSUER, R4_JWT_AUDIENCE | Bắt buộc; example `educore-local`, `educore-web-local` | Giá trị deployment riêng |
| R4_WEB_ORIGINS | Exact comma-separated origins; `http://localhost:5173`, không slash cuối | Exact HTTPS origins, không wildcard |
| R4_OTP_MODE | Bắt buộc: unavailable (default example), capture (test/dev memory), hoặc smtp | capture bị từ chối; smtp cho OTP vận hành |
| R4_SMTP_HOST/PORT/USER/PASSWORD/FROM | Chỉ bắt buộc với smtp, port 465 TLS hoặc 587 required STARTTLS | SMTP account được phép; chỉ OTP |
| R4_WORKER_ENABLED | Chỉ chuỗi `1` bật; example `0` | Theo cấu hình vận hành |
| R4_WORKER_URL | Bắt buộc khi bật worker; nếu cung cấp dù worker tắt thì connection vẫn được assert | Restricted worker LOGIN riêng |
| R5_PRIVATE_STORAGE_ROOT | Bắt buộc; absolute dedicated private directory | Private volume, không static hosting |
| PORT | Optional, default 3000, integer 1–65535 | Port service |
| NODE_ENV | `development` local | `production` để Secure cookie/HTTPS Origin validation |
| R4_OPERATOR_URL | Chỉ operator CLI; không cần/không cung cấp cho HTTP | Secret riêng process operator |
| VITE_API_BASE_URL | Public API origin: `http://localhost:3000` | HTTPS API same-site đã review; không secret |

Runtime nguồn: `main.ts`, `identity-access/config.ts`, `crypto.ts`, `otp-delivery.ts`, `r4-repository.ts`, `tenant-policy/operator-cli.ts`, `file-management/private-volume.adapter.ts`; Prisma `prisma.config.ts`; web `App.tsx`/`api.ts`. Không có biến VITE để bật navigation chưa được review.

## Private storage

Owner tạo thư mục **absolute** dành riêng, chẳng hạn `D:/EduCorePrivate/local-uploads` bên ngoài web root/repo. Gán ACL chỉ cho API OS identity và admin cần thiết; POSIX dùng mode directory 0700/file 0600. Điền path bằng dấu `/` trong `.env`. Không chọn drive root, không symlink/junction, không public static middleware. Adapter kiểm tất cả path components, containment, file links và giới hạn bytes. R7 không tự tạo/sửa ACL ngoài workspace và không chứng nhận ACL của máy.

## Env loading thực tế / khởi động

Nest CLI/Prisma config cũ chỉ đọc `process.env`; bản thân file `.env` không tự load. R7 scripts chạy Node `--env-file-if-exists=.env` tại cwd `apps/api`, sau đó Node khởi động Nest CLI hoặc Prisma CLI và truyền env cho process con. Env từ process ưu tiên hơn file. Blank required values sẽ fail-closed, không có default secrets. `prisma.config.ts` vẫn lấy DATABASE_URL, không đổi semantics.

```powershell
pnpm.cmd --dir apps/api prisma:generate
pnpm.cmd --dir apps/api prisma:validate
pnpm.cmd --dir apps/api start:dev
```

Nếu chạy production-style local: `pnpm.cmd --dir apps/api build` rồi `pnpm.cmd --dir apps/api start:prod`. Main kiểm restricted DB và private storage **trước listen**. Không coi build thành công là API đã khởi động với DB thật.

Terminal khác:

```powershell
pnpm.cmd --dir apps/web dev
```

Vite tự load `.env.local`; `VITE_API_BASE_URL` giữ nguyên contract. Dev script pin `localhost:5173 --strictPort`; port bận sẽ dừng thay vì tự đổi sang origin 5174 không được allowlist. Dùng cùng hostname `localhost` cho web/API; không trộn với `127.0.0.1` trong browser vì cookie/Origin khác. Không có Vite API proxy; ApiClient ghép API origin với `/api/v1/...`, bỏ slash cuối origin. `credentials:include` chỉ login/refresh/logout; selected-tenant và me dùng Bearer. Request timeout 15 giây.

## Reachability và auth checks

```powershell
Invoke-WebRequest -Uri http://localhost:3000/ -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:3000/api/v1/auth/me -UseBasicParsing
```

`/` chỉ reachability, không chứng nhận business readiness; `/auth/me` không Bearer phải 401 (PowerShell có thể ném HTTP exception như mong đợi). Browser login gửi Origin tự động; curl/PowerShell thử login phải tự cung cấp exact Origin, không bỏ guard. Refresh còn cần HttpOnly cookie và CSRF từ cùng session, không tự lấy CSRF từ storage/URL.

```powershell
pnpm.cmd --dir apps/web test:r7
pnpm.cmd --dir apps/api exec vitest run test/r4/auth.spec.ts test/r4/r7-environment.spec.ts test/r4/r7-http.spec.ts --no-file-parallelism
```

Test consumer HTTP double không chứng minh DB/security end-to-end. Native R4 chỉ qua runner safe hiện có:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
```

Runner tự tạo cluster PostgreSQL16 unique, admission fresh-loopback, secret memory, restricted LOGINs; giữ lại resource để inspect, không xóa/reset DB có sẵn. Nếu Docker daemon không chạy thì dừng, không set admission thủ công. Không lấy `DATABASE_URL` của ứng dụng làm `R4_TEST_URL`. Navigation SQL proposal không chạy mặc định. Owner đã cho phép fixtures trong DB disposable của task verification; production vẫn PENDING_REVIEW. Để tái lập riêng chế độ test đã được phép, trong process terminal dành riêng:

```powershell
$env:R7_NAVIGATION_PROPOSAL_TESTS='OWNER_APPROVED_DISPOSABLE_PROPOSAL_TEST'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
Remove-Item Env:R7_NAVIGATION_PROPOSAL_TESTS
```

Mỗi invocation tạo cluster mới. Không đặt acknowledgement này trong `.env` ứng dụng hoặc production. A19 dùng Edge headless nếu binary có sẵn (Windows default hoặc `R7_TEST_EDGE_PATH`); khởi động Vite strict localhost5173, Nest ephemeral port và restricted PostgreSQL thật. Thiếu browser thì A19 SKIP, không được báo browser PASS. Profile/cookie/CDP payload nằm ngoài artifact; không archive profile hay environment secrets.

## Windows checkout và baseline integrity

Nếu backend integrity test báo hash R1a khác chỉ vì CRLF checkout, từ repository root chạy:

```powershell
node apps/api/scripts/verify-r1a-checkout.mjs
node apps/api/scripts/verify-r1a-checkout.mjs --restore
pnpm.cmd --dir apps/api exec vitest run test/schema-integrity/r1b-static.spec.ts
```

Helper xác minh HEAD/index đều khớp checksum lịch sử hiện có trong test và working content chỉ khác CRLF/LF trước khi khôi phục riêng file R1a từ Git index bằng checkout tạm có `core.autocrlf=false`, `core.eol=lf` chỉ cho invocation đó. Không sửa SQL authored, test expectation, migrations table, global/local Git config hoặc `.gitattributes`. Nếu có sửa nội dung/index thì dừng, không ghi đè. Lần checkout sau với Git system `core.autocrlf=true` có thể tái tạo CRLF; chạy lại helper khi cần. Migration history và checksum nguồn không đổi; không archive tệp migration như một source change.

Raw migration checksum phụ thuộc byte/EOL. Không dùng checkout repair này như một kế hoạch upgrade cho DB đã có history/checksum khác; phải inventory và review riêng, không sửa `_prisma_migrations`. Verification chỉ migrate cluster disposable mới, không dùng DB đã tồn tại.

## Hành vi hiện tại / giới hạn

Login → me → AU02 → selected principal → AU05 khi chưa có business evidence. Self-service account là landing hợp lệ. Navigation endpoint/mapping chưa được review nên business routes trả 403, không cấp quyền theo role. Màn hình business chưa nối data provider hiển thị pending/empty theo component hiện có, không lấy Preview fixtures. Preview chỉ DEV dynamic import; production build không chứa fixture modules.

Access/CSRF chỉ memory. Reload yêu cầu login; cookie refresh một mình không đủ bootstrap. Refresh trong phiên có cookie + CSRF; revalidation/expiry/network failure không khôi phục grants cũ. Logout local có hiệu lực ngay kể cả API lỗi, UI nói rõ chưa xác nhận server revocation. Production TLS/same-site domains/SMTP/Volume ACL và multi-tab refresh coordination cần kiểm tra riêng.
