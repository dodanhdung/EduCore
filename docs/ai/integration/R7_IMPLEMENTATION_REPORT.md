# R7 — Báo cáo implementation và owner review

Ngày **23/10/2026**, timezone Asia/Saigon. Trạng thái bàn giao: **R7_PARTIAL_REVIEW_REQUIRED**.

## Scope / kết quả

Đã triển khai foundation local configuration, AU01/AU02 thực sự gọi ApiClient/SessionController, memory session/refresh/logout/race protection, navigation consumer fail-closed, AppShell và tests. Không tích hợp nghiệp vụ R8, không sửa Figma, không thay business rules, không activate security-sensitive SQL chưa duyệt.

Owner đã trả lời trong phiên: **giữ navigation ở PENDING_REVIEW, production fail-closed và bàn giao proposal cùng ZIP R7**. Vì vậy production hiện login → me → AU02 → selected-tenant AU05. Không có server-authoritative business navigation endpoint mới được mount; phần đó chưa hoàn tất production integration.

## Git baseline

- Branch: `feat/r7-foundation-auth-integration` đã tồn tại khi bắt đầu; không tạo nhánh khác.
- HEAD/base/origin-main sau fetch: `2daefa87d0b4bafe8613751c7329cb914cc9cdee`, merge PR #16 Management & Operations UI. Không có commit branch-only so với origin/main.
- Working tree lúc bắt đầu: `.gitignore` modified, `educore-ui-changes.zip` deleted; không có task files staged. Giữ nguyên owner changes.
- Trong lúc thực hiện, owner/external process stage `.gitignore` với thêm ignore `docs/ai/` và staged removal 34 files `docs/ai/*`; chúng vẫn có trên filesystem. Agent không chạy stage/reset/restore/rm-cached và không thay đổi index đó. ZIP không chứa các staged removals hoặc `.gitignore` của owner.
- Kiểm tra Git cuối sau packaging phát hiện current branch đã đổi ngoài các lệnh của task sang `feat/foundation-auth-tenant-access`; HEAD vẫn `2daefa8`. Baseline lúc bắt đầu đúng nhánh yêu cầu; agent không tạo/rename/switch branch trong task và không tự đảo lựa chọn nhánh đang diễn ra bên ngoài. Owner cần xử lý mismatch tên nhánh trước Git review/commit.
- Tất cả thay đổi R7 source/new files giữ local, không stage/commit/push/merge/PR/deploy. Tài liệu R7 nằm trong vùng `docs/ai/` hiện bị ignore; không force-add.

## Sources

Đã đối chiếu AGENTS/feature-slice/UI-slice skills, PROJECT_CONTEXT và DECISION_REGISTER; Requirements v5 + Wallet amendment v5.1 (FR-01/03/04/06/42, Q-01/02/15, BR-08/10/14); UC v1.3 UC-01/02/36, AC-01-01–03 và C-01–04; architecture thật ở `docs/architectural/architectural_design.md`, Detailed Design §5.1/A.2/A.3, API auth sections, current DB/R4 authorization migrations, module Identity & Access; AU01/AU02 screen cards/F01, relevant tokens/guidelines; R4/R5 implementation và R6 verification reports.

PROJECT_CONTEXT/register có snapshot scaffold lịch sử; class design có provenance DB v1.0 proposed. Không dùng các mô tả cũ để phủ nhận source hiện có, hoặc dùng API design proposals để khẳng định public routes đã chạy. Inventory source-backed liệt kê rõ partial/missing contracts.

## Environment

- Mới: `apps/api/.env.example`, `apps/web/.env.example`; secret/runtime URL để trống, không shared signing key. Không tạo actual `.env`/`.env.local` và không đọc/log credential thật.
- API start/start:dev/start:debug/start:prod và Prisma validate/generate launch qua Node `--env-file-if-exists=.env`; không thêm dotenv/dependency. Prisma config vẫn chỉ lấy DATABASE_URL, runtime vẫn bắt buộc restricted R4_AUTH_URL/R4_API_URL, optional worker URL riêng.
- Guide: [R7_LOCAL_DEVELOPMENT.md](R7_LOCAL_DEVELOPMENT.md), bao gồm role provisioning boundary, migrations bằng migrator local riêng, controlled operator onboarding, private absolute storage/ACL, OTP mode, commands và limitations.
- Vite giữ VITE_API_BASE_URL, dev pin localhost:5173 với strictPort; không tự chạy sang port CORS khác, không thêm proxy hoặc backend secrets vào VITE variables.
- **Thực chạy:** Vite ready tại localhost:5173; GET `/login` và `/src/App.tsx` trả 200; transformed module có API origin `http://localhost:3000`. Server smoke đã dừng sau kiểm tra.
- **Thực chạy:** compiled API trong child process env sạch thiếu config exit1 với fixed `API_STARTUP_FAILED`, trước DB connection. Đây là fail-closed startup check, không phải startup thành công với DB/storage thật. HTTP API localhost:3000 không reach được vì không có runtime disposable đang chạy.
- Prisma validate với synthetic non-operational DATABASE_URL thành công, không connect DB. Node v24.12.0/pnpm12.11.2 hiện có; dependencies đã được cài trước task. Không chạy install/migrate/reset/seed hoặc real SMTP trong R7.

## Authentication / session

- AU01 truyền actual email/password vào `ApiClient.login`, sau đó `me`; loading/duplicate guard, safe Vietnamese errors, không enumeration/account-state details. Xóa password và visibility sau kết quả. Success mới navigate AU02.
- AU02 chỉ hiển thị tenants từ fresh principal; gửi actual ID; chỉ server-returned selected principal thay context. Invalid selection không navigate hoặc false success. Authorized landing lấy evidence hiện hành; chưa có business evidence thì AU05.
- Revision + serialized auth mutations ngăn stale login/selection/refresh khôi phục phiên hoặc Set-Cookie chồng nhau trong một tab. Tenant change xóa visible context và grants ngay; giữ rotated credential private chỉ cho intent mới đang xếp hàng, không render response cũ.
- Refresh single-flight dùng HttpOnly cookie + X-CSRF-Token và browser Origin theo existing contract; sau refresh gọi me và lấy grants mới nếu reader được duyệt. Background revalidation không supersede explicit tenant selection. Max60s revalidation/focus, refresh trước expiry60s và hard expiry timer.
- Expiry tính từ request-start, trừ1s và không vượt original seven-day deadline. Logout xóa memory privileges ngay; API failure hiện thông báo local logout/server revocation chưa xác nhận. Không lưu access/CSRF vào persistent storage/URL/log.
- Reload fail-closed, không tự refresh từ cookie vì không còn CSRF. Multi-tab refresh coordination và secure reload bootstrap chưa có contract; có thể cần login lại khi cookies/requests đua giữa tab hoặc kết quả server không rõ.

## Authorization

Nguồn hiện hành: registered access/session hash + private transaction principal; active tenant membership; role_permissions/access_scopes; role revocation và Parent links; R2/R3/R4/R5 resource coordinators. Role labels không phải evidence. Runtime restricted API không được đọc trực tiếp các bảng grants hoặc gọi private permission helper để liệt kê tùy ý.

Consumption contract đã kiểm tra userId/sessionId/tenantId/tenantEpoch/validUntil và canonical screenIds. Evidence chỉ có từ trusted code-injected reader; production không cấu hình reader, không có query/storage/Preview grant input. Test HTTP doubles kiểm consumer, không giả là live backend grants.

Đề xuất mới: [R7_NAVIGATION_PROPOSAL.md](R7_NAVIGATION_PROPOSAL.md) và [SQL draft](proposals/R7_navigation_access.sql). Endpoint, mapping tenant-scope OP01/OP04/OP05/OP06/OP07 và privilege grant đều **chưa duyệt/chưa chạy**. SQL nằm ngoài Prisma migrations; không có schema/historical migration thay đổi. CLASS/STUDENT/Parent navigation mapping còn chờ resource-aware review, không mở tenant-wide access từ grants hẹp.

## AppShell / protected routes / Preview

Tái dùng AppShell: eligible P0 navigation groups, active link, current tenant, self-service, logout, empty navigation, native mobile details/summary. `resolveRoute` và `canView` giữ tenant/session/evidence boundaries; navigation eligibility không cấp quyền resource. Unresolved/missing/stale/revoked evidence không render protected business screen. Màn hình chưa có production provider giữ pending/empty states hiện hữu, không cấp fake fixture data/mutation success.

Không đổi `main.tsx` DEV dynamic-import boundary hoặc fixture modules. Full frontend suite kiểm Preview thật và production output; rebuilt production bundle không chứa marker fixture đã kiểm. DOM tests kiểm labels/busy/errors/mobile semantics, không phải visual screenshot audit hoặc chứng nhận đầy đủ usability/contrast trên thiết bị thật.

## Tests actually run

Các số dưới là kết quả từng invocation; **không cộng các rerun thành số test độc lập**.

| Command / check | PASS | FAIL | SKIP | Kết quả / giới hạn |
|---|---:|---:|---:|---|
| `pnpm.cmd --dir apps/web build` | — | — | — | Exit0; tsc + production Vite bundle |
| `pnpm.cmd --dir apps/web lint` | — | — | — | Exit0; một warning AT03 có sẵn, không warning mới còn lại |
| `pnpm.cmd --dir apps/web test` (final) | 222 | 0 | 0 | Bao gồm foundation, R7, auth/shared và tất cả module UI hiện có |
| `pnpm.cmd --dir apps/web test:r7` (final) | 47 | 0 | 0 | 8 foundation +39 R7 consumer/UI tests |
| `pnpm.cmd --dir apps/api build` | — | — | — | Exit0 |
| `pnpm.cmd --dir apps/api lint` | — | — | — | Exit0, không warning |
| `pnpm.cmd --dir apps/api test` (final) | 75 | 1 | 0 | 10 files; hash baseline CRLF/LF pre-existing failure |
| `pnpm.cmd --dir apps/api exec vitest run test/r4/auth.spec.ts test/r4/r7-environment.spec.ts test/r4/r7-http.spec.ts --no-file-parallelism` (final) | 18 | 0 | 0 | 8 R4 crypto/config +10 R7 env/HTTP; service double cho HTTP |
| `pnpm.cmd --dir apps/api prisma:validate` với synthetic DATABASE_URL | — | — | — | Exit0, schema valid, không DB connection |
| `git diff --check` | — | — | — | Exit0; EOL notices từ Git không phải whitespace error |
| Node env-file process test + fail-closed compiled startup smoke | — | — | — | Env override đúng; thiếu config exit1 như expected |
| Vite localhost smoke HTTP | — | — | — | 2 HTTP200, correct public API origin |
| Native R4 PowerShell runner | 0 | 0 | Không có test count | ENVIRONMENT_BLOCKED trước suite/admission: Docker info không hoạt động |

Intermediate invocations: focused frontend44/0/0 rồi46/0/0 trước final47; full frontend219/0/0 rồi221/0/0 trước final222 do thêm race/expiry/deadline cases. API lần đầu chạy cùng frontend nặng:72 PASS/2 FAIL/0 SKIP (Argon2 timeout5s + same hash mismatch). Serial rerun73/1/0 trên74 tests trước thêm2 HTTP cases; focused crypto/env/HTTP16/0/0 trước final18. Chạy API final riêng75/1/0 trên76 tests xác nhận Argon2 timeout không tái hiện. Không tăng timeout hoặc đổi crypto code.

### Phân loại lỗi và warnings

Baseline `apps/api/prisma/migrations/202610190001_r1a_baseline/migration.sql` có `i/lf w/crlf` trong checkout. Raw working SHA256 `b63fe72993f39fb6abd5c2ea0b8fc69de8012f93640272f06eed73b5a760069e`; Git HEAD blob và LF-normalized working content cùng `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20`, đúng test expectation. Đã so sánh byte-content sau normalization bằng Node: bằng HEAD blob. Không sửa migration/test/hash expectation để che failure.

Pre-existing web lint: `AT03/LeaveRequestFormScreen.tsx:33` react(set-state-in-effect). Existing frontend Vite test servers có warning HMR port24678 dùng trùng; tests vẫn pass. API in cảnh báo vite-tsconfig-paths plugin hiện có. New no-children-prop warning trong test R7 đã sửa; final lint không còn warning đó.

Native command thực chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
```

Lần sandbox dừng ở Docker config access; retry với escalation được phép đọc context nhưng dừng ở Docker `info`. Chưa tạo cluster/database/volume hoặc chạy migrations; không set admission thủ công hoặc dùng R6 container có sẵn. R4 native security/revocation/scope/Parent/multi-role/full PostgreSQL HTTP journey chưa được chạy trong R7, không ghi giả PASS/SKIP counts. R1–R6 native full regression, browser↔DB end-to-end, new SQL activation, real SMTP/domain/TLS/storage ACL cũng NOT RUN/NOT VERIFIED.

## API integration inventory / R8

[R7_API_INVENTORY.md](R7_API_INVENTORY.md): **59 P0 design units** =53 actual registered routes + GL02 guard state +5 embedded units. Bao phủ auth/shared, operations, academic, scheduling/resources, attendance/leave, billing/wallet, assignments/grading và portals. Mỗi hàng có actual endpoint/status/permission/scope/R7-R8 disposition; rõ source-backed route với partial DTO/public transport gaps.

[R8_BACKLOG.md](R8_BACKLOG.md): ưu tiên navigation review gate; auth recovery/self/child context; IAM/relationships; reference data/enrollment; resources/scheduling; leave/attendance; assignments/submission/grading; billing/issue/wallet; decisions/execution; inbox/operations; scoped aggregates. Không implement các workflow này trong R7.

## Files changed — danh sách đầy đủ cho owner review

### Modified (10 files)

1. `apps/api/package.json`
2. `apps/web/package.json`
3. `apps/web/src/App.css`
4. `apps/web/src/App.tsx`
5. `apps/web/src/api.ts`
6. `apps/web/src/auth.ts`
7. `apps/web/src/foundation.test.mjs`
8. `apps/web/src/screens/Authentication & Shared/AU01/LoginScreen.tsx`
9. `apps/web/src/screens/Authentication & Shared/AU02/TenantSelectionScreen.tsx`
10. `apps/web/src/screens/Authentication & Shared/batch.test.mjs`

### New (13 files, chưa Git)

1. `apps/api/.env.example`
2. `apps/api/test/r4/r7-environment.spec.ts`
3. `apps/api/test/r4/r7-http.spec.ts`
4. `apps/web/.env.example`
5. `apps/web/src/r7.test.mjs`
6. `apps/web/src/r7-ui.test.mjs`
7. `docs/ai/integration/R7_FOUNDATION_SPEC.md`
8. `docs/ai/integration/R7_LOCAL_DEVELOPMENT.md`
9. `docs/ai/integration/R7_NAVIGATION_PROPOSAL.md`
10. `docs/ai/integration/proposals/R7_navigation_access.sql`
11. `docs/ai/integration/R7_API_INVENTORY.md`
12. `docs/ai/integration/R8_BACKLOG.md`
13. `docs/ai/integration/R7_IMPLEMENTATION_REPORT.md`

### Review ZIP (mới, không stage)

`artifacts/educore-r7-owner-review-20261023.zip` —23 source/document entries, repository-relative paths. ZIP gồm đúng10 modified và13 new files trên, bao gồm report này. Kiểm tra packaging đối chiếu từng entry/hash với file hiện tại. Không chứa `.env`, credentials, `.git`, dependencies, generated Prisma/builds, prior archives, ignored generated files hoặc owner changes. Tài liệu R7 được yêu cầu bàn giao vẫn được include dù owner mới ignore `docs/ai/`; owner đã yêu cầu rõ proposal đi cùng ZIP, không force-add tài liệu vào Git. Không đưa các tài liệu `docs/ai` lịch sử khác vào archive.

## Risks & deviations / pending review

| Phân loại | Nội dung |
|---|---|
| VERIFIED | Local config loader, Prisma validation, web dev origin/HTTP200, build/lint, auth consumer/form/race/expiry tests, actual Nest HTTP contract qua service double, production Preview isolation assertions |
| PENDING_API | Live navigation endpoint chưa có; public academic/schedule/attendance/full finance reads/writes và self/verified-child context còn thiếu như inventory; AU03/04/06 chưa connected |
| NEEDS_REVIEW | Owner quyết định giữ navigation endpoint/mapping/forward SQL PENDING_REVIEW; mọi file mới và ZIP; baseline EOL/hash test remediation; separate staged owner removal/ignore policy; current branch ngoài task đã đổi tên thành feat/foundation-auth-tenant-access |
| ENVIRONMENT_BLOCKED | Docker native runner/real PostgreSQL HTTP end-to-end/actual API startup với restricted DB và private storage; production TLS/domain/SMTP/ACL chưa được kiểm thử |

Không tuyên bố hoàn tất server-authoritative business navigation, full backend test pass hoặc production readiness. Không thay thế grants bằng role map/Preview, không sửa historical migrations, không sử dụng/mutate DB shared/pre-existing. UI layout giữ nguyên ngoại trừ busy/errors/navigation controls cần thiết; không có visual redesign/screenshot certification.

## Git readiness

Chỉ đề xuất commit message sau owner review và xử lý riêng staging của owner: `feat(r7): integrate local authentication and session foundation`.

Current branch quan sát cuối khác tên nhánh trong request; không tự switch khi working tree có owner/task changes. Đây là mục Git review riêng, không phải branch được agent tự chọn.

Không commit/push/PR/deploy. Giữ navigation activation cho task được review riêng; không suy ra approval từ consumer test PASS. Bàn giao R7 tại trạng thái **R7_PARTIAL_REVIEW_REQUIRED**.
