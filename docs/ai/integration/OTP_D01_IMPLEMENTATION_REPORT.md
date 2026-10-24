# R8 D01 — Báo cáo triển khai cục bộ để owner rà soát

**Phê duyệt:** `APPROVE_OTP_D01_LOCAL_IMPLEMENTATION`; hợp đồng `docs/ai/features/otp-delivery-reliability-d01.md` D01-1…5 và C01–C03. Không có quyền production SMTP, khóa thật, DB dùng chung, deploy hoặc Git write. UC-03/2a vẫn **OPEN**.

## Baseline và phạm vi

- Nhánh `feat/auth-password-recovery`; HEAD ban đầu `66eb60e75f9a7d73e1421974698f974a2e76e18e`.
- Trước tác vụ, chỉ `docs/ai/features/otp-delivery-reliability-d01.md` là file chưa được Git theo dõi. File hợp đồng này **không bị sửa** trong tác vụ; SHA-256 giữ nguyên `86AB8B7E47A2B2806A6B3BC03338B293D5BE46D634ECA0B50B40830DAB9A8D6B`.
- Nguồn: `AGENTS.md`, skill `educore-feature-slice`, `PROJECT_CONTEXT.md`, FR-01/Q-01, UC-03/AC-03-01–04, hợp đồng D01, migration/auth R4, runner native và báo cáo AU03/AU04.
- Phạm vi mã: một migration tiến một chiều, issue OTP recovery trong cùng transaction với task mã hóa, worker DB credential riêng, HTTP 202/503, kiểm thử và lời nhắc AU03. Activation, reset/session revocation và navigation giữ qua hồi quy; không thêm AU06.

## Manifest thay đổi cho owner

**Tệp đã sửa:**

1. `apps/api/prisma/schema.prisma` — unique index OTP ghép khớp migration/drift.
2. `apps/api/src/identity-access/auth.service.ts` — recovery issue AES+HMAC, UUID trước DB và readiness độc lập email.
3. `apps/api/src/identity-access/config.ts` — cấu hình khóa recovery test; thiếu cả cặp khóa để route trả 503.
4. `apps/api/src/identity-access/http.ts` — 202 trung tính, 503 toàn cục, thời gian sàn chung 100 ms sau đo timing.
5. `apps/api/src/identity-access/r4-repository.ts` — kiểm tra owner/ACL recovery lúc khởi động API.
6. `apps/api/test/r4/README.md` — runner admission và cách chạy worker cục bộ.
7. `apps/api/test/r4/auth.spec.ts` — cấu hình khóa giả cho unit.
8. `apps/api/test/r4/browser-auth.ts` — Edge journey lấy OTP qua worker test thay vì API capture.
9. `apps/api/test/r4/r4.postgres.test.ts` — C01 race/lifecycle, retry/lease/expiry/ACL, C03 timing.
10. `apps/api/test/r4/r7-environment.spec.ts` — cấu hình khóa giả và thiếu khóa.
11. `apps/api/test/r4/r7-http.spec.ts` — 503 prelookup, 202 postlookup/probe.
12. `apps/api/vitest.config.r4.ts` — timeout đủ cho benchmark native đầy mẫu.
13. `apps/web/src/screens/Authentication & Shared/AU03/RecoveryRequestScreen.tsx` — hướng dẫn retry sau ít nhất 1 phút.

**Tệp mới, cần owner review trước Git:**

14. `apps/api/prisma/migrations/202610240002_r8_recovery_otp_delivery/migration.sql`.
15. `apps/api/src/identity-access/recovery-envelope.ts`.
16. `apps/api/src/identity-access/recovery-worker.ts`.
17. `apps/api/src/identity-access/recovery-worker-main.ts`.
18. `apps/api/test/r4/otp-delivery.spec.ts`.
19. `docs/ai/integration/OTP_D01_IMPLEMENTATION_REPORT.md` (báo cáo này).

## SQL, quyền và vận hành local

- Queue `educore_r4.recovery_otp_deliveries` có FK ghép `(otp_id,purpose)`, trạng thái/shape/attempt/fence/payload CHECK, index READY/lease/terminal. Không có email hoặc OTP rõ; payload AES-256-GCM được xóa khi terminal. Metadata terminal xóa sau 7 ngày khi sweeper chạy. Backup cũ nằm ngoài xác minh cục bộ.
- Hàm issue/claim/check/finish/sweep và hai trigger có owner `educore_r4_owner`, `SECURITY DEFINER`, fixed `search_path`; PUBLIC EXECUTE bị thu hồi. `educore_r4_auth` chỉ EXECUTE issue; `educore_r4_otp_delivery` chỉ EXECUTE claim/check/finish/sweep; runtime không được SELECT queue. Worker LOGIN riêng được kiểm tra không kiêm auth/API/business/owner role. Native ACL test và startup assertion PASS.
- Trigger OTP và user status/email hủy task trong transaction nguồn, xóa ciphertext/lease và tăng fence. Worker kiểm tra recipient sau giải mã và ngay trước send; SMTP đã bắt đầu không thể thu hồi. Recovery issue dùng user lock `SKIP LOCKED` để hàng bị khóa không tạo chênh lệch timing theo eligibility; trả 202 nếu không issue. Legacy `request_otp(PASSWORD_RESET)` bị chặn; ACTIVATION giữ đường hiện tại.
- Worker local chỉ kết nối SMTP loopback và địa chỉ `.invalid`, không chạy ở `NODE_ENV=production`. Nó có keyring/SMTP config riêng; không tải JWT/OTP pepper/API credential. Cấu hình API vẫn giữ adapter SMTP cũ cho **ACTIVATION**, nên không được suy ra toàn API production đã cô lập SMTP secret; cần xử lý trong phê duyệt vận hành/activation riêng, không mở AU06 ở D01.

## Kết quả thực chạy

| Lớp / lệnh | Kết quả | Bằng chứng/giới hạn |
| --- | --- | --- |
| `pnpm.cmd --dir apps/api build` | **PASS** | Nest/TypeScript sau mã cuối. |
| `pnpm.cmd --dir apps/api lint` | **PASS**, 0 warning | Source và test type-aware. |
| `pnpm.cmd --dir apps/api test` | **PASS 92/92**, 12 files, 0 FAIL/SKIP | AES AAD, fake SMTP 250/450/550, watchdog đóng socket, HTTP 202/503 và regression unit. |
| `pnpm.cmd --dir apps/web build` | **PASS** | TypeScript + Vite. |
| `pnpm.cmd --dir apps/web lint` | **PASS**, 1 warning cũ ở AT03 | Warning ngoài lát cắt này. |
| `pnpm.cmd --dir apps/web test` | **PASS 240/240**, 0 FAIL/SKIP | AU03 copy và hồi quy AU01/AU02/AU03/AU04/navigation. |
| `pnpm.cmd --dir apps/api prisma:validate` | **PASS** | Schema Prisma hợp lệ; native D08 kiểm drift/redeploy. |
| Native PostgreSQL full qua `powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests` | Lượt 1: **PASS 90/90**; lượt 2: **FAIL 89/90** (C03); lượt 3: **FAIL 89/90** (C03) | Ba cluster PostgreSQL 16 mới được runner tự tạo/kiểm tra; 0 SKIP; không tự đặt admission env. |
| Edge browser A19 trong mỗi full native | **PASS 3/3 lượt** | React → Nest → PostgreSQL restricted; OTP qua worker test và reset/phiên cũ. |
| SMTP production/inbox thật | **SKIP** | Chưa được duyệt, không dùng credential/địa chỉ khách hàng. |

Fake SMTP loopback cho 250/450/550 chỉ xác minh SMTP server test nhận/từ chối, không phải inbox. Native fake worker cho retry 1/3/5 phút, 4 attempt tối đa, key mất, ciphertext hỏng, expiry window 75 giây, lease 90 giây, fence cũ và payload cleanup đều PASS. Ca SMTP in-flight xác nhận task bị hủy/fence nhưng không giả vờ thu hồi thư đã bắt đầu. Không tuyên bố exactly-once.

## C03 — đo chống dò theo tiêu chí đã đăng ký

Mỗi lượt: cluster mới; 1.200 known + 1.200 unknown cho ba điều kiện (400+400 mỗi điều kiện), 100 warm-up độc lập; một request/email; 100 block tráo ngẫu nhiên mỗi điều kiện; concurrency 4; throttle vẫn bật với IP test riêng/block qua trusted loopback proxy test-only; 10.000 block-bootstrap resample, CI 95%. So status/body/header, median, p95 và AUC. 200 fault 503 toàn cục và các lỗi postlookup/probe được thử thêm. Không đổi ngưỡng [0,45;0,55] AUC CI, ±max(10 ms,5%) median hoặc ±max(25 ms,10%) p95.

| Full run cuối | Healthy AUC CI | Slow/reject AUC CI | Concurrency 4 AUC CI | Kết luận |
| --- | --- | --- | --- | --- |
| 1 | [0,4635; 0,5275] | [0,4691; 0,5203] | [0,4701; 0,5313] | PASS |
| 2 | [0,4383; 0,5112] | [0,4646; 0,5170] | [0,4682; 0,5375] | **FAIL**: healthy dưới 0,45 |
| 3 | [0,4927; 0,5573] | [0,4433; 0,5076] | [0,4402; 0,5050] | **FAIL**: cả ba điều kiện vượt ranh giới |

Baseline trước thời gian sàn và lượt 60 ms cũng có CI vượt ngưỡng; tăng thời gian sàn chung lên 100 ms sau đo, không thêm jitter và không đổi ngưỡng. Ở **cả ba lượt cuối**, status/body/header của phản hồi 202 và fault 503/202 đạt; median/p95 CI đạt ngưỡng, nhưng AUC CI không đạt ở hai lượt. Hướng lệch thay đổi giữa các nhóm/lượt, nên chưa kết luận có kênh dò ổn định; theo hợp đồng vẫn là **FAIL/BLOCK** chống dò timing. Raw timings trong OS temp đã bỏ email; không đưa vào ZIP.

## Rủi ro, sai lệch và chờ owner

- **C03 chưa PASS lặp lại**: hai trong ba lượt full có AUC CI vượt ngưỡng. Cần điều tra nguyên nhân biến động và đo tiếp với protocol đã duyệt; không đánh dấu AC-03-04 timing hoàn tất. Lượt đạt không xóa lượt FAIL.
- UC-03 alternative 2a còn **OPEN**; 202 không chứng minh SMTP/inbox delivery, và worker có thể gửi trùng cùng OTP sau timeout/crash. SMTP/key custody/backup/alert production cần phê duyệt riêng.
- Legacy ACTIVATION có cấu hình SMTP trong API như trước; D01 chỉ cô lập secret của **recovery worker** cục bộ. Không triển khai AU06 hoặc thay user-management business rules.
- **Tại thời điểm báo cáo triển khai ban đầu**, crash sau SMTP accept trước finish và kill process thật chưa được fault-inject end-to-end; lease-expiry/sweep/fence đã được chứng minh bằng PostgreSQL và fake worker. Phần kiểm chứng bổ sung bên dưới đã chạy kill tiến trình thật. JS string không thể được bảo đảm zeroize.
- Không sửa migration lịch sử, không chạy migration trên DB dùng chung, không dùng SMTP/key thật, không commit/push/PR/merge/deploy. Các container disposable do runner tạo được giữ theo chính sách runner, không xóa tài nguyên.

**Owner-review ZIP:** `artifacts/educore-otp-delivery-d01-implementation-review.zip`, chỉ các tệp trong manifest trên với đường dẫn repository-relative; loại trừ tài liệu D01 có sẵn, secret, temp evidence, generated output và ZIP cũ.

## R8 — Security verification closure, 24/10/2026

**Kết luận hiện tại: `OTP_D01_VERIFICATION_PARTIAL`; C03 vẫn FAIL/BLOCK.** Phần trên là snapshot lịch sử của lượt triển khai và ba lần đo đầu tiên; không xóa hoặc diễn giải lại các FAIL trước đó. Nhánh vẫn là `feat/auth-password-recovery`, HEAD trước thao tác Git cuối của tác vụ này là `66eb60e75f9a7d73e1421974698f974a2e76e18e`. Hợp đồng D01 và migration đã duyệt giữ nguyên; migration, `recovery-envelope.ts`, `recovery-worker.ts` giống byte-for-byte các bản trong ZIP triển khai trước.

### Chẩn đoán C03 và sửa tối thiểu

- Raw timing cũ cho thấy mọi HTTP response đo được đều trên sàn 100 ms, median known−unknown thường dưới 1 ms nhưng AUC dao động hai chiều. Harness cũ dùng cùng seed với shuffle tự do: ví dụ một vị trí trong wave có 38 known/62 unknown, trong khi median theo vị trí có thể lệch 1–2 ms. Đây là nguồn sai lệch đo **có thể** xảy ra, chưa phải bằng chứng duy nhất về nguyên nhân.
- Harness mới tạo 50 thứ tự ngẫu nhiên và 50 thứ tự bù, trộn lại 100 block: mỗi block vẫn 4 known/4 unknown, mỗi vị trí trong tám vị trí có đúng 50 known/50 unknown. Seed `0xD01C03`, 400+400/điều kiện và 10.000 block-bootstrap giữ nguyên. Test ghi thêm duration tổng của `requestOtp` theo nhóm, không ghi email hay OTP.
- Trên ba lượt cuối, median `requestOtp` known khoảng 2,64–3,02 ms, unknown khoảng 1,53–2,02 ms; chênh DB/crypto khoảng 1 ms. HTTP có thể lệch ngược chiều dưới tải. Bộ hẹn giờ sàn chung 100 ms nay được đăng ký **trước** việc issue qua SQL để thứ tự đăng ký timer không phụ thuộc thời điểm truy vấn kết thúc. Không thêm jitter, không bỏ lookup, không thay 202/503, throttle, ngưỡng hoặc migration.
- Sửa trên làm bớt một cơ chế có thể tạo timing bias nhưng **chưa đóng C03**. CI vẫn vượt ngưỡng ở cả ba lượt cuối; hướng và điều kiện thất bại thay đổi. Không có bằng chứng đủ để quy kết một kênh dò tài khoản ổn định, cũng không có bằng chứng đủ để loại trừ nó. Pool/scheduling/worker contention vẫn có thể góp phần; không tự đổi kiến trúc hoặc ngưỡng đã duyệt.

### Crash/restart và SMTP giả — bằng chứng mới

| Tình huống | Quan sát native trên PostgreSQL disposable |
| --- | --- |
| API HTTP con nhận 202 rồi bị kill sau commit | Một OTP/task READY còn trong DB; worker **tiến trình con mới** giải mã cùng task, code khớp HMAC đã lưu, hoàn tất một attempt; không sinh OTP khác. |
| Worker con bị kill trước send | Không kết nối SMTP; lease được cho hết hạn bằng đồng hồ task test-only, sweep chuyển RETRY_WAIT, fence cũ bị từ chối; worker khác dùng lại ciphertext/OTP cũ. |
| Kill sau SMTP DATA nhưng trước 250 | Fake SMTP đã nhận DATA, chưa trả 250; DB không ghi accepted; sau lease/retry dùng cùng code, có thể có kết quả provider không biết chắc. |
| Kill sau fake SMTP 250 trước finish | Fake server ghi một lần 250, DB vẫn SENDING; sau lease/retry cùng code có thể gửi trùng. Không hứa exactly-once hay inbox delivery. |
| Expire/revoke/supersede hoặc attempt thứ tư bị kill | Task terminal xóa ciphertext; không gửi sau hết hạn/thu hồi/supersede, không có attempt thứ năm. |

Các tiến trình API/worker con bị kill thật; các mốc lease 90 giây và backoff 1/3/5 phút được **gia tốc bằng UPDATE chỉ trong database disposable** để kiểm thử quyết định SQL, không phải đã chờ đủ thời gian đồng hồ thực. HTTP child và replacement worker là hai OS process riêng; fake SMTP chỉ là loopback `.invalid`. Native ACL kiểm tra `educore_r4_owner`/fixed search path/no PUBLIC và runtime LOGIN tách quyền PASS trong ba lượt cuối. Không có sửa migration hay mở rộng privilege.

### Kết quả chạy thực tế sau sửa

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| `pnpm.cmd --dir apps/api build`, `lint`, `test` | **PASS**, lint 0 warning, unit **92/92**. Một lần unit chạy đồng thời nhiều build bị test WASM cũ timeout 5 giây (**FAIL 91/92**); chạy lại riêng lẻ **PASS 92/92**. |
| `pnpm.cmd --dir apps/web build`, `lint`, `test` | **PASS**, 240/240 test; lint có 1 warning AT03 tồn tại trước lát cắt. |
| `pnpm.cmd --dir apps/api prisma:validate` | **PASS**. |
| Hai lượt native `-TestFilter` chẩn đoán ban đầu và một lượt xác nhận HTTP child | **PASS** cho ca được lọc; các ca khác SKIP, không dùng làm bằng chứng full suite. |
| Full native R4 qua duy nhất `start-r4-native.ps1 -RunTests` trên ba cluster mới cuối cùng | **FAIL 91/92**, **FAIL 91/92**, **FAIL 91/92**; mỗi lượt chỉ C03 FAIL, 0 SKIP. HTTP 202/503 và postlookup probe PASS, SQL/ACL PASS, crash tests PASS, Edge A19 PASS 3/3. |
| Một full native cluster khác bị máy sleep giữa lượt | **FAIL 86/92**, 6 FAIL thực tế; C03 **INCONCLUSIVE** do khoảng ngắt ~30 phút, các OTP hết hạn và browser timeout. Giữ evidence, không tính như lượt nghiệm thu sạch. |
| SMTP/inbox production, khóa production, DB shared | **SKIP**, không được phê duyệt. |
| `git diff --check`; `node --check apps/api/test/r4/recovery-crash-child.mjs` | **PASS** trên tracked diff/cú pháp helper. `git diff --cached --check` sau khi stage **FAIL** đúng 2 trailing spaces có sẵn trong hợp đồng D01 owner-authored chưa từng được sửa; giữ nguyên byte theo yêu cầu bảo tồn. Các LF/CRLF warning không phải lỗi test. Không dùng làm bằng chứng C03. |

Ba lượt sạch cuối trên PostgreSQL 16.15, Node 24.12.0/Windows x64, máy 12 logical CPU/16 GiB; cluster mới được runner xác minh mỗi lần. Không lấy mẫu CPU load liên tục, nên ảnh hưởng tải nền chưa được định lượng. Test dùng 100 warm-up, 100 block/điều kiện, 400 known + 400 unknown, concurrency 4, SMTP giả accepted hoặc 20 ms transient, cùng seed và ngưỡng đã duyệt. Slot balance luôn 50/50. Status/body/headers của 202, global 503 và postlookup probe tương đương ở cả ba lượt; median/p95 CI đạt ngưỡng. AUC CI 95% là blocker:

| Lượt cuối | Healthy AUC CI | Slow/reject AUC CI | Concurrency 4 AUC CI | Kết quả |
| --- | --- | --- | --- | --- |
| 1 (`8VD25A`) | [0,45355; 0,51295] | [0,46698; 0,53185] | **[0,42360; 0,47922]** | **FAIL** |
| 2 (`Bovc1m`) | **[0,44610; 0,51314]** | **[0,44549; 0,50380]** | [0,46671; 0,51801] | **FAIL** |
| 3 thay lượt sleep (`aAw4EE`) | [0,47551; 0,53126] | **[0,44952; 0,51469]** | [0,47472; 0,53130] | **FAIL** |

Các lượt chẩn đoán cũng được giữ: lượt trước chỉnh timer cân bằng slot FAIL 90/92 do fixture SQL vi phạm CHECK micro giây và C03; sau sửa timer/trước ca HTTP child: FAIL 91/92, PASS 92/92, FAIL 91/92. Ba lượt triển khai cũ vẫn nằm ở bảng lịch sử phía trên. Evidence mới `docs/ai/integration/OTP_D01_C03_EVIDENCE.json` chứa seed, version/image/admission, point/CI/giới hạn, duration dịch vụ và raw timing **chỉ** `{known,ms,block}` cho tám lượt chẩn đoán/cuối, kể cả lượt sleep; không có địa chỉ, OTP, key, ciphertext, password hoặc URL kết nối.

### Manifest của tác vụ verification và chờ owner

**Sửa:** `apps/api/src/identity-access/http.ts`; `apps/api/test/r4/r4.postgres.test.ts`; `apps/api/test/r4/README.md`; báo cáo này. **Mới, cần owner review:** `apps/api/test/r4/recovery-crash-child.mjs`, `docs/ai/integration/OTP_D01_C03_EVIDENCE.json`. Các file mới của lát cắt triển khai D01 trước (migration, envelope, worker, unit spec, báo cáo này và hợp đồng owner-authored) vẫn cần owner review theo ZIP triển khai/hợp đồng tương ứng. ZIP verification chỉ chứa sáu tệp của tác vụ này với path tương đối repo; không có DB data, browser profile, secret hoặc ZIP cũ.

**Còn chặn:** C03 chưa đạt quy tắc CI trong ba lượt sạch; không công bố anti-enumeration đã hoàn tất hoặc P0 delivery accepted. UC-03/2a vẫn OPEN. SMTP/key custody production, inbox delivery và backup/key-loss vận hành chưa được duyệt/xác minh. Giữ mọi FAIL và lượt sleep trong hồ sơ, cần owner quyết định bước điều tra/tiêu chí tiếp theo trước khi đóng C03. Owner đã yêu cầu commit cục bộ sau khi đóng ZIP; commit không tương đương merge/deploy/acceptance.

**ZIP owner review của tác vụ này:** `artifacts/educore-otp-delivery-d01-verification-review.zip`.
