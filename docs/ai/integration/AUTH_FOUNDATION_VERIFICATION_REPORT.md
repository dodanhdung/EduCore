# Authentication Foundation — Verification & Security Review Closure

Trạng thái: **AUTH_FOUNDATION_VERIFICATION_READY_FOR_OWNER_REVIEW**.

Follow-up ngày23–24/10/2026, Asia/Saigon. Scope: xác minh và sửa lỗi đã chứng minh của authentication/tenant-access foundation; không mở R8. Navigation contract tiếp tục **PENDING_REVIEW**, production fail-closed. Báo cáo này bổ sung kết quả mới, không viết lại lịch sử trong `R7_IMPLEMENTATION_REPORT.md`.

## Git baseline

- Repository local: `D:/EduCore`, branch `feat/foundation-auth-tenant-access`.
- HEAD đầu/cuối task: `1323972c79c9af23c9762a8d215f16aca3870844`, `feat(auth): integrate authentication and tenant session foundation`. Foundation commit đã có; parent `2daefa8` là merge PR16.
- Trước sửa: không staged, unstaged hoặc untracked changes. Không thấy34 staged deletions từng được báo; R7 spec/report/local guide/proposals còn trên đĩa và tracked trong HEAD.
- Đã kiểm ignored files/config: `artifacts/`, dependencies/build/generated outputs và `/roadmap.md` bị ignore; `docs/ai/` hiện không bị ignore. Không sửa `.gitignore`, không force-add.
- Sau sửa: chỉ7 modified +5 new source/document files liệt kê dưới đây; staged diff vẫn rỗng. Historical migrations và `.gitignore` không có diff. ZIP bị ignore theo policy hiện có.
- Không reset/clean/stash, đổi branch, stage, commit, push, tạo PR, merge hay deploy. Một lần refresh stat cache của riêng R1a index sau checkout repair không thay staged content.

## Sources / phạm vi đã đọc

`AGENTS.md`, skill `educore-feature-slice`, `PROJECT_CONTEXT`; Requirements hiện có v5 + Wallet/O-12 v5.1 amendments (FR-01/03/04/06/42, BR-08/10/14, Q-01/02/15); UC v1.3 + O-12 (UC-01/02/36 và AC/C liên quan); Accepted Architecture, Detailed Design DD-01/§5.1, API auth contract, module `class design/identity-access.md`; R4 implementation/R6 verification reports; R7 foundation spec/implementation report/local guide/navigation proposal/SQL; React auth/API/tests, Nest identity-access và actual R4/R5 authorizers/migrations.

Một số context/design snapshots còn mô tả scaffold hoặc DB v1.0 proposed trong khi branch đã có runtime và DB design v1.1. Route/privilege availability trong review được đối chiếu source/migrations hiện tại; không xem snapshot cũ là bằng chứng runtime. Không thay đổi BR/Q hay nguồn nghiệp vụ.

## Findings resolved

### R1a checkout / integrity

Đã tái hiện focused integrity test **13 PASS / 1 FAIL / 0 SKIP**. Working file R1a dùng CRLF trong khi HEAD/index dùng LF; normalize CRLF→LF cho byte-identical với Git blob. System Git `C:/Program Files/Git/etc/gitconfig` đặt `core.autocrlf=true`, không có path EOL attributes áp dụng.

| Byte source | SHA-256 |
|---|---|
| Working checkout trước repair, CRLF | `b63fe72993f39fb6abd5c2ea0b8fc69de8012f93640272f06eed73b5a760069e` |
| HEAD/index, LF; expected checksum nguyên bản | `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20` |
| Working checkout sau repair | `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20` |

Git blob object `ca9813c2d35be630f55fb2418028d945cef8a599`. Không sửa authored SQL, expected checksum, migration history hoặc `_prisma_migrations`; không đổi Git config hay policy EOL toàn repo.

Helper mới `verify-r1a-checkout.mjs` kiểm HEAD/index/working content rồi materialize đúng một path bằng `git -c core.autocrlf=false -c core.eol=lf checkout-index --temp -- <path>`. Chỉ copy khi nội dung Git đúng checksum và working file chỉ khác EOL, có kiểm chống ghi đè thay đổi trong lúc chạy. Temporary checkout được xóa. Lệnh `--force` ban đầu không rewrite do stat cache; dùng `--temp` giải quyết. Stat-only dirty marker sau repair đã refresh riêng path; index content không đổi. Final `i/lf w/lf`, không migration diff.

Focused test sau repair: **14 PASS / 0 FAIL / 0 SKIP**. Helper verification cuối khớp cả HEAD/index/working. Checkout sau với autocrlf có thể tái tạo CRLF; cách chạy lại ghi trong local guide. Đây không phải upgrade/reconciliation cho DB đã có checksum khác; các migration verification chỉ dùng cluster mới.

### Auth/session regressions

Ba regression tests ban đầu FAIL chứng minh các race: logout chạy trong refresh báo thất bại dù token mới đã revoke; refresh đã rotate nhưng `/me` lỗi khiến queued logout bỏ sót token mới; stale login cleanup lỗi nhưng logout báo thành công. Bổ sung kiểm replacement login bị logout supersede và repeated logout dùng chung kết quả.

`SessionController` dùng revocation target chung cho in-flight work và queued logout; ghi token mới ngay khi nhận response, ghi nhận successful revocation, giữ logout local có hiệu lực ngay và báo `logout-unconfirmed` khi server chưa xác nhận. Work stale không publish session/grants. Không persistence, không thay `canView()`/`resolveRoute()` hay role-based fallback. Năm race regressions PASS sau sửa.

Browser thật phát hiện thêm login không phát HTTP request: native fetch được gọi qua `this.transport(...)` với receiver sai. Unit double trước đó không bắt được. Thêm regression FAIL trước sửa, bind transport với `globalThis` trong `ApiClient`; regression và Browser→React→Nest→Postgres đều PASS sau sửa. Tổng cộng6 web regressions mới.

### SQL draft corrections

Chỉ sửa proposal ngoài migration: deny explicit NULL tenant; sau User→Tenant checks/locks đọc lại live session/expiry bằng `session_id()`, deny nếu session không còn live. Chi tiết NAV-01–04 và giới hạn ở [security review](R7_NAVIGATION_SECURITY_REVIEW.md). Không cài vào ordinary runtime DB.

## Backend verification / tests actually run

| Lệnh | PASS | FAIL | SKIP | Kết quả khác |
|---|---:|---:|---:|---|
| `node apps/api/scripts/verify-r1a-checkout.mjs --restore` | — | — | — | Exit0; exact Git bytes restored |
| `node apps/api/scripts/verify-r1a-checkout.mjs` | — | — | — | Exit0; final unchanged checksum |
| `pnpm.cmd --dir apps/api exec vitest run test/schema-integrity/r1b-static.spec.ts` | 14 | 0 | 0 | Sau repair |
| `pnpm.cmd --dir apps/api build` | — | — | — | Exit0 |
| `pnpm.cmd --dir apps/api lint` | — | — | — | Exit0 |
| `pnpm.cmd --dir apps/api test` | 76 | 0 | 0 |10 files; default suite, không phải native DB suite |
| `pnpm.cmd --dir apps/web build` | — | — | — | Exit0; TypeScript + Vite |
| `pnpm.cmd --dir apps/web lint` | — | — | — | Exit0;1 warning có sẵn |
| `pnpm.cmd --dir apps/web test` | 228 | 0 | 0 | Full web suite |
| `pnpm.cmd --dir apps/web test:r7` | 53 | 0 | 0 | Focused auth/routing/contract regressions |
| `git diff --check` | — | — | — | Exit0 |

Warnings có sẵn: web `AT03/LeaveRequestFormScreen.tsx:33` set-state-in-effect; backend vite-tsconfig-paths warning; full web test Vite HMR port24678 conflicts. Git thông báo LF sẽ được chuyển CRLF ở lần Git touch tiếp theo; không phải whitespace/test failure. Không thấy lint/build warning mới từ auth changes. Không báo các warning này là test failures hay tự sửa unrelated code.

## PostgreSQL verification

Node24.12, pnpm12.11.2; Docker Desktop đã cài nhưng engine ban đầu dừng nên runner lần đầu không qua admission (`Docker operation failed(info)`). Đã khởi động installed Desktop ẩn cửa sổ; Docker Engine29.8.2, context `desktop-linux`, local named pipe. PostgreSQL16.15 (Debian16.15-1.pgdg13+2), image `postgres:16` local.

Đã inspect existing containers và cấu hình DB local trước khi chạy; không có app `.env` thực hay process DATABASE_URL/R4_TEST_URL ban đầu. Không reuse/start/reset/delete cluster cũ. Mỗi run qua runner hiện hữu tạo container/DB mới, kiểm fresh-loopback admission và provisioning riêng AUTH/API/WORKER restricted LOGINs. Không bypass admission, không dùng migrator trong HTTP runtime. Task containers giữ nguyên theo runner để owner inspect.

Lệnh default:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
```

Lệnh opt-in, sau khi owner cho phép rõ **“Chạy fixtures trên DB disposable; giữ production PENDING_REVIEW.”**:

```powershell
$env:R7_NAVIGATION_PROPOSAL_TESTS='OWNER_APPROVED_DISPOSABLE_PROPOSAL_TEST'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
```

Acknowledgement chỉ ở child process test, không ghi vào app env hay runner defaults. Default final: **57 PASS / 0 FAIL / 16 SKIP**; opt-in final: **73 PASS / 0 FAIL / 0 SKIP**, gồm16 actual PostgreSQL draft-function fixtures. A20 default xác nhận không có draft function và HTTP endpoint404; opt-in chỉ cài function trong disposable DB, endpoint vẫn404. Không tuyên bố đã chạy mọi native suite R1–R6.

| Run / task-owned container suffix | Port | PASS / FAIL / SKIP | Evidence suffix / ghi chú |
|---|---:|---|---|
| `ce08c851f8fd40a8930fd19a3ab10896` |49683 |54 /0 /0 | `K9B4rs`, baseline trước bổ sung |
| `34a1d6afa1d14fb7bcf9515db2ea02af` |53391 |55 /1 /16 | `W0O8Kn`, browser login lỗi trước fetch fix |
| `d5756edd7fa9428a92b1bef1b507a0a1` |55143 |0 /1 /71 | `sHwED3`, focused A19 trước fix |
| `d97514b44b78421da6f370739aa14693` |63866 |0 /1 /71 | `z4BQ2Q`, focused A19 trước fix |
| `fdf5357adead42b1b745657ba66071b4` |59518 |1 /0 /71 | `F8Bo1G`, focused A19 sau fix |
| `16426d63097d4d37ba6be767fcf8e1d3` |49866 |57 /0 /16 | `u8z4Sn`, final default |
| `05b26adbd025476b8cad73fe025d0ecf` |50812 |73 /0 /0 | `LdpLSW`, opt-in đầu tiên |
| `100150a4fcd8481380d434c295ac8f48` |58401 |72 /1 /0 | `8WHNfC`, đủ mapping/cùng-user isolation PASS; N12 lệch Docker/Node clock4ms |
| `981624c5b54f4bfc8400f3a54480161f` |64967 |73 /0 /0 | `79Vrjs`, final opt-in, N12 dùng PostgreSQL clock và kiểm access/session deadline |

Container names có prefix `educore-r4-native-`. Sanitized evidence của mỗi run ở `C:/Users/Admin/AppData/Local/Temp/educore-r4-evidence-<suffix>/evidence.json`; metadata môi trường ở `C:/Users/Admin/AppData/Local/Temp/educore-r4-native-<container suffix>/environment.json`. Các path này chỉ để inspect local, không đóng gói generated evidence/DB/profile. Không in connection URLs/secret/token.

Native cases xác minh live membership/role revocation, tenant isolation, CLASS/STUDENT boundaries, Parent links, privileged/raw SELECT denial, session expiry/revoke/rotation/replay, CSRF/Origin, real HTTP errors, concurrent lock/revocation behavior và domain regressions vốn có của R4 harness. N12 ban đầu so PostgreSQL timestamp với Node Date.now và gặp lệch4ms giữa Docker VM/Windows; sửa fixture dùng cùng PostgreSQL clock, không nới60s TTL hay sửa production time semantics. Bổ sung assertion không vượt access/session deadline.

## Authentication integration

**Browser E2E thực đã PASS**: Edge155.0.4283.62 headless → React/Vite localhost5173 → Nest ephemeral HTTP port → PostgreSQL16.15 với restricted LOGINs. Không fake fetch/auth repository hoặc HTTP service double. Test module dùng actual R4Module; không gửi OTP ngoài (UnavailableOtpDelivery). Không chứng nhận toàn main/private-volume/SMTP/deployment stack.

A19 thao tác AU01 → POST login200 → GET me200 → AU02 chọn tenant → POST select-tenant200 → AU05, sau đó business route bị chặn403 UI, reload yêu cầu đăng nhập, fresh login/select và logout HTTP204; database có revoked session thực. Cả10 safe browser booleans true: actualBrowser, actualNestPostgres, actualHttpSequence, noStorage, noPasswordInDOM, noTokensInDOM, httpOnlyRefreshCookie, forbiddenWithoutEvidence, reloadFailClosed, logout.

CDP kiểm refresh cookie HttpOnly/path/SameSite=Lax; localStorage/sessionStorage rỗng và không thấy password/JWT trong DOM. Access/CSRF chỉ memory; reload không tự bootstrap bằng cookie. Đây là assertion trên hành trình đã kiểm, không phải audit toàn bộ browser profile. Cookie values, debugger payloads, credentials và DOM raw không log/archive. Profile test ở OS temp không đóng ZIP.

A18 real HTTP account không membership login/me thành công với `allowedTenants:[]`, select tenant403, logout204. Các A02/A03/A04/A05/A06/A14/A17/D09/X06/X16 xác minh invalid credentials, wrong/cross tenant, access expiry/revoked session, rotation/replay, Origin/CSRF, production cookie flags, race revocation. Stale async/tenant switch/navigation freshness được cover bởi web regressions/consumer tests; không gọi chúng là browser coverage. Production navigation chưa có endpoint nên không có navigation HTTP E2E.

## Navigation security review / risks & deviations

Static review đối chiếu protected route/read gateway và permission seed hiện tại: OP01→member.read, OP04/05→approval.read, OP06→audit.read, OP07→job.read. Recommendation: owner duyệt mapping read-only tối thiểu sau review exact contract/SQL; **không tự chuyển thành APPROVED**.

16 isolated fixtures PASS với actual bound sessions/restricted API: no auth, wrong/null tenant, revoked membership/role, TENANT grants, CLASS/STUDENT denial, multi-role union, no relevant grant, Parent linkage denial, raw SELECT/ACL, safe exact fields/TTL, expired/revoked/disabled user, same-user cross-tenant isolation, SECURITY DEFINER owner/search_path/PUBLIC ACL. Five screen mappings được exercise qua actual grant rows. Không dùng client role label để authorize.

Function draft owner `educore_r4_owner` NOLOGIN; fixed `pg_catalog,educore_r4,pg_temp`, schema-qualified references, PUBLIC revoked, EXECUTE chỉ API group. Không mở raw credential/grant SELECT hoặc kết hợp AUTH/WORKER capabilities. TTL tối đa60s vẫn cho phép menu stale trong cửa sổ đó; từng resource request phải authorize lại. Không response student/class/child IDs hay token/hash. Tests không chứng minh mọi concurrency interleaving; phải giữ gateway locks/live checks khi làm migration mới.

Giới hạn còn lại: chỉ5 operations screens, chưa có resource-witness mapping cho toàn P0; multi-tab refresh coordination chưa triển khai; sau reload cần login vì CSRF không persisted; local logout khi network lỗi không bảo đảm server đã revoke (UI báo rõ); TLS/domain/SameSite/SMTP/private-volume ACL thực tế cần validation riêng trước deployment. Không tuyên bố production readiness.

## Files changed

Manifest ZIP gồm đúng12 source/document files, paths tương đối repository. Historical migration không phải source change và không có trong ZIP.

| Loại | Path | Mục đích |
|---|---|---|
| Modified | `apps/api/test/r4/r4.postgres.test.ts` | Đăng ký proposal fixtures; A18/A19/A20 |
| Modified | `apps/web/src/api.ts` | Native fetch receiver |
| Modified | `apps/web/src/auth.ts` | Auth/session revocation race fixes |
| Modified | `apps/web/src/r7.test.mjs` |6 focused regressions |
| Modified | `docs/ai/integration/R7_LOCAL_DEVELOPMENT.md` | EOL repair và disposable test hướng dẫn |
| Modified | `docs/ai/integration/R7_NAVIGATION_PROPOSAL.md` | Review/test evidence; giữ pending |
| Modified | `docs/ai/integration/proposals/R7_navigation_access.sql` | NULL/session-reread draft corrections |
| **New — owner review trước Git** | `apps/api/scripts/verify-r1a-checkout.mjs` | Narrow checkout integrity/repair helper |
| **New — owner review trước Git** | `apps/api/test/r4/browser-auth.ts` | Actual Edge CDP journey |
| **New — owner review trước Git** | `apps/api/test/r4/navigation-proposal.cases.ts` |16 isolated PostgreSQL cases |
| **New — owner review trước Git** | `docs/ai/integration/R7_NAVIGATION_SECURITY_REVIEW.md` | Security findings/recommendation |
| **New — owner review trước Git** | `docs/ai/integration/AUTH_FOUNDATION_VERIFICATION_REPORT.md` | Báo cáo này |

Artifact mới cần owner review riêng: `artifacts/educore-auth-foundation-verification-review.zip`. Artifact không nằm trong chính ZIP và không stage/commit tự động.

## Pending decisions

| Nhóm | Trạng thái |
|---|---|
| VERIFIED | EOL/hash,76 backend tests,228 web tests,53 focused tests, builds/lints, default native57 PASS và opt-in native73 PASS, actual browser journey, static + PostgreSQL SQL proposal review |
| NEEDS_REVIEW | Owner review cả12 files và ZIP; navigation contract/mapping/SQL vẫn **PENDING_REVIEW**; test-only approval đã được thực hiện đúng giới hạn |
| PENDING_API | Production navigation endpoint/forward-only migration/trusted reader chưa triển khai; whole-P0 navigation mapping và R8 business integration ngoài task |
| ENVIRONMENT_BLOCKED | Không còn blocker cho verification đã yêu cầu trên máy này. Production deployment/domain/TLS/SMTP/storage ACL chưa được test và nằm ngoài task |

## Owner review

ZIP: `artifacts/educore-auth-foundation-verification-review.zip`, giữ repository-relative paths; chỉ explicit manifest12 files. Không secrets, `.env`, `.git`, dependencies/build/coverage/generated files, DB/browser profile, previous archives hoặc unrelated owner changes. Archive entries được đối chiếu hash với source sau đóng gói.

Các thay đổi sẵn sàng để owner review trước khi quyết định Git; không tự commit. Review new files vẫn bắt buộc. Checkout repair không cần commit historical SQL. Giữ SQL proposal trong `proposals/` và giữ production fail-closed; nếu sau này owner duyệt activation, cần task riêng cho migration/HTTP contract/reader và deployment validation. Dừng sau targeted closure này.
