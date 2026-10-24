# D01 — Độ tin cậy chuyển phát OTP khôi phục mật khẩu (đề xuất để owner duyệt)

**Trạng thái:** `CONDITIONALLY_ACCEPTED_FOR_REFINEMENT / FINAL_OWNER_APPROVAL_PENDING`; owner chấp nhận có điều kiện Option B và hướng D01-1…5, yêu cầu đóng C01–C03 trước khi quyết định cho triển khai. Chưa có quyền viết code/migration.  
**Phạm vi:** UC-03 nhánh 2a, OTP `PASSWORD_RESET` của AU03/AU04. Không triển khai AU06, SMTP production, migration hay mã nguồn trong gói này.  
**Baseline đã kiểm tra:** nhánh `feat/auth-password-recovery`, HEAD `66eb60e75f9a7d73e1421974698f974a2e76e18e`; tài liệu D01 đã là file mới chưa được Git theo dõi trước lần tinh chỉnh này, không có thay đổi tracked khác. `main` cục bộ là `85b7d4b14de35f2c20901288bb23cdfa21d70b41` và là tổ tiên của HEAD. Chưa xác minh trạng thái remote; không gọi đây là bản đã merge vào remote `main`.

| Review correction | Thay đổi chính xác trong hợp đồng | Vị trí |
| --- | --- | --- |
| C01 | Trigger users hủy task khi DISABLED/đổi email; worker kiểm recipient sau giải mã, check/finish/sweep khóa và fence; thêm native race/lifecycle cases. | §6–8, §11 |
| C02 | Native chỉ qua runner R4 tự tạo và xác minh cluster mới; bỏ hướng dẫn tự đặt biến admission hoặc chạy Vitest native trực tiếp. | §9, §11, §13 |
| C03 | 503 chỉ qua gate/lỗi trước lookup, mapping filter cụ thể; lỗi sau lookup giữ 202; protocol timing nhiều mẫu, CI và điều kiện BLOCK. | §5, §11 |

## 1. Nguồn và ràng buộc

- `AGENTS.md`, `docs/ai/PROJECT_CONTEXT.md`, `.agents/skills/educore-feature-slice/SKILL.md`.
- `docs/requirements/requirements_analysis.md` v5.1: FR-01, Q-01, NFR-04/09/10/13/15/16; `docs/requirements/usecase/specification.md` v1.3: UC-03, nhánh 2a, AC-03-01–04. Q-01 yêu cầu OTP email 6 số, dùng một lần, hạn 15 phút, bảo vệ OTP, giới hạn thử, chống dò tài khoản, mật khẩu Argon2id ≥12 ký tự và thu hồi phiên.
- `docs/architectural/architectural_design.md` §6.1; `docs/design/class design/identity-access.md`; `docs/design/database_design.md` v1.1; `docs/design/detailed_design.md` §5.1/5.12; `docs/design/api_specification.md` §3.1/A.3. Thiết kế jobs/outbox là nguồn tham khảo, không thay thế kiểm tra migration và quyền chạy thực tế.
- `docs/ai/features/password-recovery-au03-au04.md`: D01 Option A chỉ được chấp thuận cho lát cắt UI/API trước đó; UC-03/2a vẫn `OPEN`. `docs/ai/integration/PASSWORD_RECOVERY_IMPLEMENTATION_REPORT.md` và `docs/ai/integration/R8_BACKLOG.md` cung cấp lịch sử kiểm thử/backlog, không phải bằng chứng SMTP thật hay phê duyệt hợp đồng D01 này.
- Nguồn thực thi đã đọc: `apps/api/src/identity-access/{auth.service,http,otp-delivery,config,r4-repository}.ts`, `apps/api/src/main.ts`, `apps/api/src/automation-jobs/worker.ts`, migration R4 identity/jobs/notifications và baseline, test R4; `apps/web/src/api.ts` và AU03/AU04 cùng test khôi phục. Khi nguồn thiết kế và mã khác nhau, phần “hiện trạng” dưới đây theo mã/migration hiện có.

## 2. Hiện trạng và nguyên nhân D01

`POST /api/v1/auth/password/otp/request` → chặn tần suất theo IP (`otp`, 10) → kiểm tra email → sinh OTP 6 số ngẫu nhiên → tính HMAC có pepper → gọi một câu SQL `educore_r4.request_otp(...)` qua tài khoản auth → PostgreSQL commit câu lệnh → nếu SQL trả `true`, gọi bất đồng bộ `delivery.deliver(...)` → trả HTTP `202 {"accepted":true}`. HTTP không đợi SMTP. Cùng route cũng có ở activation, với purpose khác.

Hàm SQL khóa hàng `users` bằng `FOR UPDATE`; trả `false` cho email không có/không đủ điều kiện và khi có **bất kỳ** OTP nào của user được yêu cầu trong 1 phút trước. Khi tạo OTP mới, hàm đánh dấu `consumed_at` trên **mọi** OTP chưa dùng của user, kể cả purpose khác, rồi chèn HMAC với hạn 15 phút. Vì vậy, yêu cầu lại trong 1 phút không sinh mã mới; sau 1 phút, yêu cầu đủ điều kiện sinh mã mới và vô hiệu mã cũ. Đây là hành vi hiện có, không mặc nhiên chấp thuận thay đổi tác động chéo purpose. Reset vẫn tìm đúng purpose, đếm tối đa 5 lần thử, đổi hash mật khẩu và thu hồi phiên trong transaction.

`SmtpOtpDelivery` dùng Nodemailer/TLS, tắt logger/debug, có timeout kết nối/greeting 10 giây và socket 15 giây. `sendMail` resolve chỉ chứng minh SMTP server nhận/đưa vào hàng đợi, **không chứng minh email đến hộp thư**. Adapter `unavailable` cũng có thể được chọn qua cấu hình hiện tại. SMTP reject/timeout dẫn đến Promise reject, được bắt và ghi cảnh báo cố định `R4_OTP_DELIVERY_FAILED`; request vẫn 202. Timeout có kết quả không rõ: SMTP server có thể đã nhận thư. Không có trạng thái chuyển phát, retry bền vững, cảnh báo phân loại hay correlation cho sự cố đó. Cảnh báo không ghi OTP/email, nhưng người có quyền đọc log và ghép thời điểm request có thể suy đoán tài khoản đủ điều kiện; cần hạn chế quyền log và không ghi định danh. Adapter thay thế ném đồng bộ trước khi trả Promise không được `.catch` hiện tại bao phủ; adapter hiện có là hàm async.

Nếu tiến trình chết sau commit trước/trong gửi, OTP chỉ còn HMAC trong DB; không thể tái tạo mã rõ để gửi lại. Một yêu cầu mới sau throttle sẽ sinh OTP khác và thu hồi OTP cũ. Mật khẩu cũ giữ nguyên nếu không reset; OTP không nhận được có thể vẫn hợp lệ tới hết hạn. Email không có tài khoản hiện nhận cùng 202/body với tài khoản đủ điều kiện trong các đường đi thông thường; nhánh SMTP không đợi ở HTTP nên không trực tiếp đổi status/body. Chưa có đo timing đối kháng để khẳng định “không thể phân biệt thực tế”.

**Nguyên nhân gốc:** cam kết lưu OTP và thao tác gửi nằm ở hai ranh giới khác nhau, giữa chúng không có bản ghi chuyển phát bền vững; HMAC hiện tại không đủ để phát lại cùng OTP.

## 3. Mô hình lỗi và đe dọa

| Tình huống | Rủi ro cần khống chế |
| --- | --- |
| SMTP reject, mạng đứt, timeout mơ hồ, provider nhận rồi mất kết nối | Không được khẳng định đã phát tới hộp thư; timeout có thể gây gửi trùng cùng mã. |
| Tiến trình chết giữa commit/gửi/ghi nhận kết quả; worker chết sau SMTP nhận | Không mất task; nhận lại lease và retry có giới hạn, chấp nhận ít nhất một lần thử, không hứa đúng một email. |
| OTP hết hạn, đã dùng, bị thay thế hoặc khác purpose | Không bắt đầu lần gửi mới; mã đã gửi trước đó có thể đến muộn nhưng phải không còn hợp lệ. |
| Người ngoài dò tài khoản qua status/body/timing; abuse yêu cầu OTP | Giữ 202 đồng nhất, throttle, kiểm thử timing dưới tải và provider lỗi; không có endpoint tra cứu trạng thái theo email. |
| Đọc DB/log/backup/queue; rò khóa; nhân viên xem cảnh báo | OTP không rõ trong DB, log, audit hay outbox chung; mã hóa xác thực, phân quyền tối thiểu, vòng đời khóa và ciphertext. |
| Worker chạy trùng, lease cũ hoàn tất muộn | Khóa/fencing ở DB; không ghi đè trạng thái đời lease mới. Vẫn có thể có hai email vì SMTP không có exactly-once. |

**Xung đột cần owner quyết:** UC-03/2a viết “không gửi được OTP ... thông báo không thể hoàn tất yêu cầu mà không lộ trạng thái tài khoản”. Nếu HTTP báo lỗi **chỉ** khi SMTP cho tài khoản thật thất bại, status/body hoặc thời gian sẽ tiết lộ sự tồn tại của tài khoản. Trả 202 đồng nhất bảo toàn AC-03-04 nhưng không đưa được thông báo riêng cho đúng người bị lỗi. Một cảnh báo sự cố SMTP *toàn hệ thống* có thể hiển thị đồng nhất cho mọi email nếu xác định độc lập trước khi tra cứu, nhưng không giải quyết lỗi theo người nhận hoặc thư bị bounce sau SMTP accept. Cần phê duyệt cách hiểu 2a hoặc kênh xác thực an toàn; không âm thầm coi 202 là hoàn thành 2a.

## 4. So sánh phương án

| Tiêu chí | A — đợi SMTP accept trong request | B — task bền vững, retry có giới hạn | C — best effort + giám sát |
| --- | --- | --- | --- |
| Thay đổi DB | Có thể không cần object mới; phải xử lý OTP đã commit khi gửi lỗi | Cần migration tiến một chiều cho queue auth và hàm quyền hẹp | Không cần migration |
| Crash/retry cùng OTP | Không giải quyết crash sau commit; HMAC không khôi phục được | Có, nếu lưu phong bì OTP mã hóa cùng transaction với HMAC | Không; yêu cầu lại sinh mã mới sau throttle |
| HTTP/chống dò | Chờ SMTP chỉ cho tài khoản thật gây lệch thời gian; lỗi theo người nhận lộ tài khoản | 202 đồng nhất; không chờ SMTP; vẫn phải đo timing DB/queue | 202 đồng nhất; vẫn phải đo timing DB |
| Timeout/SMTP accept | Mơ hồ; phản hồi lỗi hoặc thu hồi OTP có thể vô hiệu mã đã được nhận | Retry cùng OTP có thể tạo email trùng; trạng thái `ACCEPTED_BY_SMTP` chỉ là chấp nhận tại server | Mơ hồ, không khôi phục tự động |
| Tải/vận hành | Giữ HTTP trong thời gian network; tăng coupling/độ trễ | Worker, khóa, ACL, retention, alert; dùng PostgreSQL hiện có | Rẻ nhất, nhưng thiếu bền vững và nhánh lỗi 2a |
| UC-03/2a | Không thể báo lỗi riêng mà vẫn chống dò; không chứng minh inbox | Giảm lỗi mất mã và báo vận hành; **vẫn không tự đáp ứng thông báo riêng** | Không đáp ứng gửi lại sau crash và thông báo riêng |

**Khuyến nghị có điều kiện: B** cho độ tin cậy vận chuyển P0, dùng PostgreSQL hiện có và worker hẹp riêng cho OTP, không thêm Redis/Kafka. Đây là phương án nhỏ nhất giải quyết mất task khi crash và retry cùng mã một cách có kiểm soát; không được đánh dấu UC-03/2a hoàn tất trước khi owner quyết định nghĩa của “thông báo”. A/C chỉ thích hợp nếu owner chấp nhận giảm phạm vi yêu cầu và ghi rõ phần còn OPEN. B không thể bảo đảm thư đến inbox hay SMTP đúng một lần.

Không thể gắn trực tiếp vào `automation_jobs`: constraint hiện chỉ cho `SCHEDULE_CHECK`, `BILLING_GENERATE`; job có tenant/actor/policy, `perform_job` xử lý DB nội bộ. `outbox_events` cũng tenant-scoped, dành cho in-app; trigger `outbox_secret_guard` cấm payload nhạy cảm. Mở rộng hai cơ chế đó để chứa OTP/recipient là thay đổi ACL và mô hình dữ liệu lớn hơn. Có thể tái dùng **mẫu** claim `FOR UPDATE SKIP LOCKED` + lease/fence và tiến trình worker, sau security review; queue auth riêng cần migration mới và quyền riêng. Không sửa migration lịch sử.


## 5. Hợp đồng khuyến nghị cuối cùng — PROPOSED, chưa cho phép triển khai

**Chọn hướng B để owner duyệt:** PostgreSQL giữ một task chuyển phát riêng cho OTP khôi phục, payload OTP được mã hóa xác thực; worker chuyển phát dùng quyền DB và tiến trình riêng. Không thêm Redis/Kafka. Đây là hợp đồng kỹ thuật đề xuất, không phải quyết định triển khai, quyền cấu hình SMTP production hay quyền lưu khóa production.

### D01-1: API và UC-03/2a

- POST /api/v1/auth/password/otp/request nhận đúng {email}. Với email đúng cú pháp và chưa bị giới hạn theo IP, mọi email (tồn tại, không tồn tại, disabled, đang cooldown) trả cùng **202, JSON {"accepted":true}, Content-Type application/json và Cache-Control: no-store**; không header trạng thái chuyển phát, không chờ SMTP, không token/session. Giữ **400** cho email sai cú pháp và **429** cho giới hạn request hiện có; các điều kiện này không dựa vào tài khoản. Với DB/hạ tầng nhận yêu cầu hỏng toàn cục, đề xuất **503** với envelope chung {"code":"SERVICE_UNAVAILABLE","message":"SERVICE_UNAVAILABLE","correlationId":"<opaque request id>"}, cùng Content-Type/Cache-Control cho mọi email; correlationId độc lập eligibility. Không chuyển reject/bounce/timeout SMTP của một recipient thành lỗi HTTP; không có Retry-After theo tài khoản. Không có endpoint tra cứu delivery theo email.
- API chuẩn bị OTP, HMAC và phong bì AES cho **mọi** email hợp lệ trước khi gọi SQL; không dựa vào kết quả eligibility để gọi SMTP đồng bộ. Đường DB có thể vẫn khác nhau giữa tài khoản thật và giả, nên nghiệm thu yêu cầu đo phân bố thời gian/headers khi tải và lỗi; nếu đo thấy kênh dò thực tế, áp dụng thời gian sàn độc lập eligibility được đo hiệu quả rồi kiểm thử lại. Không coi jitter tùy ý là chứng minh chống dò.
- AU03 hiển thị chung: “Nếu tài khoản đủ điều kiện, mã có thể được gửi đến email. Nếu chưa nhận mã, kiểm tra thư rác và thử lại sau ít nhất 1 phút.” Sau 1 phút, yêu cầu đủ điều kiện mới thay mã cũ; thông điệp không nói đã gửi hoặc sẽ đến hộp thư. Không đưa email/OTP/mật khẩu vào URL query, local/session storage hay status công khai.
- Reset giữ cơ chế HMAC purpose-specific, 6 chữ số, hạn 15 phút, tối đa 5 lần thử, dùng một lần, Argon2id/chính sách mật khẩu hiện có và thay mật khẩu + thu hồi phiên nguyên tử. Không tạo phiên khi chỉ yêu cầu OTP. Activation tiếp tục đường hiện tại, không triển khai AU06.
- **UC-03 nhánh 2a vẫn OPEN kể cả sau khi B chạy và pass test:** queue/retry giảm sự cố và có alert nội bộ, nhưng public 202 không thể báo riêng người có tài khoản rằng email của họ bị từ chối mà vẫn chống dò tài khoản. Owner phải chấp thuận cách diễn giải “thông báo” trung tính + alert vận hành và tiêu chí nghiệm thu tương ứng, hoặc mở thiết kế kênh thông báo đã xác thực khác. Lỗi toàn hệ thống có thể báo chung trước tra cứu tài khoản; bounce sau SMTP accept và inbox delivery vẫn không biết chắc. Không gọi SMTP accept là thư đã vào inbox.

**C03 — quyết định HTTP và mapping chính xác:** Sau kiểm tra cú pháp và giới hạn theo IP (400/429 độc lập tài khoản), route kiểm tra một readiness/maintenance gate **không nhận email/user_id** trước khi gọi request_recovery_otp. Gate chỉ dùng trạng thái triển khai chung, key/config khởi động và DB connectivity/health check độc lập recipient; nếu không sẵn sàng, ném lỗi kiểu `RECOVERY_GLOBAL_UNAVAILABLE`. Lỗi DB của bước throttle trước lookup cũng được chuẩn hóa thành cùng lỗi 503; không lấy lỗi của một recipient làm tín hiệu 503. `R4ErrorFilter` hiện để 503 rơi về code `INTERNAL_ERROR`, nên pha code phải map **chỉ** lỗi global/prelookup này thành status 503 với JSON `{"code":"SERVICE_UNAVAILABLE","message":"SERVICE_UNAVAILABLE","correlationId":"<opaque request id>"}`, Content-Type `application/json; charset=utf-8`, Cache-Control `no-store`, X-Request-Id opaque; không có Set-Cookie, OTP/recipient, task id hoặc Retry-After khác nhau theo email. Trường correlationId và X-Request-Id cùng một ID ngẫu nhiên/được kiểm tra định dạng, không mã hóa eligibility. Với đầu vào hợp lệ, qua throttle và gate, cả SQL trả true/false **và mọi lỗi phát sinh sau lookup** đều trả 202 `{"accepted":true}` với cùng headers: bắt lỗi ở service/route, ghi sự kiện/alert đã khử PII, không để Prisma/SQLSTATE riêng của tài khoản đi vào filter. **Không** tự bật breaker/gate từ một lỗi post-lookup: lỗi chỉ xảy ra cho tài khoản thật có thể làm request kế tiếp thành 503 và lộ eligibility. Chỉ tín hiệu health/maintenance được đo độc lập email và áp dụng chung mọi instance mới được bật gate 503 cho các request sau; khi chưa xác minh tín hiệu chung, giữ 202 và cảnh báo. SMTP reject/timeout và độ dài hàng đợi không tham gia readiness gate. Vì vậy eligibility không quyết định 202 hay 503, kể cả qua một chuỗi request; test fault injection phải chứng minh điều này.

## 6. D01-2: schema đề xuất chính xác

Một migration Prisma **mới, tiến một chiều** tạo role NOLOGIN mới và bảng sau (DDL minh họa hợp đồng; migration thực tế cần kiểm tra preflight, ownership và quyền trên checkout). Bảng chỉ có task PASSWORD_RESET; expiry và user identity lấy từ hàng OTP có FK, không sao chép tùy ý.

~~~sql
CREATE ROLE educore_r4_otp_delivery
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

CREATE UNIQUE INDEX r8_otp_id_purpose_uq
  ON public.password_reset_otps(id,purpose);
CREATE TABLE educore_r4.recovery_otp_deliveries (
  otp_id uuid PRIMARY KEY,
  purpose public."OtpPurpose" NOT NULL DEFAULT 'PASSWORD_RESET',
  status text NOT NULL DEFAULT 'READY',
  key_id text,
  nonce bytea,
  ciphertext bytea,
  tag bytea,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz(6) DEFAULT clock_timestamp(),
  lease_owner uuid,
  lease_until timestamptz(6),
  fencing_token bigint NOT NULL DEFAULT 0,
  last_error_code text,
  created_at timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz(6),
  CONSTRAINT recovery_purpose CHECK (purpose = 'PASSWORD_RESET'),
  CONSTRAINT recovery_otp_purpose_fk FOREIGN KEY (otp_id,purpose)
    REFERENCES public.password_reset_otps(id,purpose) ON DELETE RESTRICT,
  CONSTRAINT recovery_status CHECK (status IN
    ('READY','RETRY_WAIT','SENDING','ACCEPTED_BY_SMTP',
     'FAILED','CANCELLED','EXPIRED')),
  CONSTRAINT recovery_attempts CHECK (attempt_count BETWEEN 0 AND 4),
  CONSTRAINT recovery_fence CHECK (fencing_token >= 0),
  CONSTRAINT recovery_active_attempt CHECK (
    (status <> 'READY' OR attempt_count = 0)
    AND (status <> 'SENDING' OR (attempt_count >= 1 AND fencing_token >= 1))
  ),
  CONSTRAINT recovery_error CHECK (last_error_code IS NULL OR
    last_error_code IN ('SMTP_TRANSIENT','SMTP_PERMANENT','SMTP_TIMEOUT_UNKNOWN',
                        'LEASE_LOST','KEY_UNAVAILABLE','CONFIG_UNAVAILABLE',
                        'RECIPIENT_CHANGED','USER_STATE_CHANGED',
                        'OTP_INVALIDATED','DELIVERY_WINDOW_CLOSED')),
  CONSTRAINT recovery_terminal_error CHECK (
    (status <> 'FAILED' OR last_error_code IS NOT NULL)
    AND (status <> 'ACCEPTED_BY_SMTP' OR last_error_code IS NULL)
  ),
  CONSTRAINT recovery_shape CHECK (
    (status IN ('READY','RETRY_WAIT') AND next_attempt_at IS NOT NULL
       AND lease_owner IS NULL AND lease_until IS NULL AND completed_at IS NULL)
    OR (status = 'SENDING' AND next_attempt_at IS NULL
       AND lease_owner IS NOT NULL AND lease_until IS NOT NULL
       AND completed_at IS NULL)
    OR (status IN ('ACCEPTED_BY_SMTP','FAILED','CANCELLED','EXPIRED')
       AND next_attempt_at IS NULL AND lease_owner IS NULL
       AND lease_until IS NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT recovery_cipher_shape CHECK (
    (status IN ('READY','RETRY_WAIT','SENDING')
       AND key_id IS NOT NULL AND key_id ~ '^[A-Za-z0-9._-]{1,64}$'
       AND nonce IS NOT NULL AND octet_length(nonce) = 12
       AND ciphertext IS NOT NULL AND octet_length(ciphertext) BETWEEN 10 AND 1033
       AND tag IS NOT NULL AND octet_length(tag) = 16)
    OR (status IN ('ACCEPTED_BY_SMTP','FAILED','CANCELLED','EXPIRED')
       AND key_id IS NULL AND nonce IS NULL
       AND ciphertext IS NULL AND tag IS NULL)
  )
);
CREATE INDEX recovery_ready_idx
  ON educore_r4.recovery_otp_deliveries(next_attempt_at,otp_id)
  WHERE status IN ('READY','RETRY_WAIT');
CREATE INDEX recovery_lease_idx
  ON educore_r4.recovery_otp_deliveries(lease_until,otp_id)
  WHERE status = 'SENDING';
CREATE INDEX recovery_terminal_idx
  ON educore_r4.recovery_otp_deliveries(completed_at)
  WHERE status IN ('ACCEPTED_BY_SMTP','FAILED','CANCELLED','EXPIRED');
~~~

Bảng thuộc educore_r4_owner; không GRANT trực tiếp SELECT/INSERT/UPDATE/DELETE cho auth/API/business-worker/OTP-worker/PUBLIC. Task id chính là otp_id nên PK đồng thời chống lập task trùng; FK ghép (otp_id,purpose) ràng buộc đúng purpose của OTP. Unique index ghép trên bảng OTP là đối tượng mới của migration, dù id đã là PK. Chỉ hàm issue tạo task. Không đặt OTP vào outbox_events: outbox hiện dành cho notification tenant/in-app và có outbox_secret_guard; automation_jobs chỉ cho SCHEDULE_CHECK/BILLING_GENERATE, yêu cầu tenant/actor/policy và không chạy SMTP. Dùng mẫu lease/fence, không tái dùng hàng business.

**Các chữ ký function đề xuất** (tất cả SECURITY DEFINER, VOLATILE, owner educore_r4_owner, search_path cố định pg_catalog,educore_r4,pg_temp; tên bảng/function trong body được định danh đầy đủ):

~~~sql
educore_r4.request_recovery_otp(
  email text, otp_id uuid, otp_hash text, key_id text,
  nonce bytea, ciphertext bytea, tag bytea
) RETURNS boolean
educore_r4.claim_recovery_delivery(worker_id uuid) RETURNS jsonb
educore_r4.check_recovery_delivery(
  otp_id uuid, worker_id uuid, fence bigint, expected_email text
) RETURNS boolean
educore_r4.finish_recovery_delivery(
  otp_id uuid, worker_id uuid, fence bigint,
  expected_email text, outcome text, error_code text
) RETURNS text
educore_r4.sweep_recovery_deliveries(max_rows integer) RETURNS integer
educore_r4.cancel_recovery_delivery_on_otp_invalidation() RETURNS trigger
educore_r4.cancel_recovery_delivery_on_user_change() RETURNS trigger
educore_r4.request_otp(email text,purpose public."OtpPurpose",hash text)
  RETURNS boolean  -- legacy function, CREATE OR REPLACE: chỉ ACTIVATION
~~~

Trigger của migration mới:

~~~sql
CREATE TRIGGER r8_cancel_recovery_delivery_on_otp_invalidation
AFTER UPDATE OF consumed_at,attempt_count ON public.password_reset_otps
FOR EACH ROW WHEN (
  (OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL)
  OR (OLD.attempt_count < OLD.max_attempts
      AND NEW.attempt_count >= NEW.max_attempts)
)
EXECUTE FUNCTION educore_r4.cancel_recovery_delivery_on_otp_invalidation();
CREATE TRIGGER r8_cancel_recovery_delivery_on_user_change
AFTER UPDATE OF status,email_normalized ON public.users
FOR EACH ROW WHEN (
  OLD.email_normalized IS DISTINCT FROM NEW.email_normalized
  OR (OLD.status = 'ACTIVE' AND NEW.status <> 'ACTIVE')
)
EXECUTE FUNCTION educore_r4.cancel_recovery_delivery_on_user_change();
~~~

DDL quyền cần nằm trong **migration mới**, sau khi tạo function; các chữ ký dưới đây cũng là danh sách EXECUTE đầy đủ cho task recovery:

~~~sql
ALTER TABLE educore_r4.recovery_otp_deliveries OWNER TO educore_r4_owner;
REVOKE ALL ON TABLE educore_r4.recovery_otp_deliveries FROM PUBLIC;
GRANT USAGE ON SCHEMA educore_r4 TO educore_r4_otp_delivery;
ALTER FUNCTION educore_r4.request_recovery_otp(text,uuid,text,text,bytea,bytea,bytea)
  OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.claim_recovery_delivery(uuid) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.check_recovery_delivery(uuid,uuid,bigint,text)
  OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finish_recovery_delivery(uuid,uuid,bigint,text,text,text)
  OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.sweep_recovery_deliveries(integer) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.cancel_recovery_delivery_on_otp_invalidation()
  OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.cancel_recovery_delivery_on_user_change()
  OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.request_recovery_otp(text,uuid,text,text,bytea,bytea,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.claim_recovery_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.check_recovery_delivery(uuid,uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finish_recovery_delivery(uuid,uuid,bigint,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.sweep_recovery_deliveries(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.cancel_recovery_delivery_on_otp_invalidation() FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.cancel_recovery_delivery_on_user_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.request_recovery_otp(text,uuid,text,text,bytea,bytea,bytea)
  TO educore_r4_auth;
GRANT EXECUTE ON FUNCTION educore_r4.claim_recovery_delivery(uuid),
  educore_r4.check_recovery_delivery(uuid,uuid,bigint,text),
  educore_r4.finish_recovery_delivery(uuid,uuid,bigint,text,text,text),
  educore_r4.sweep_recovery_deliveries(integer)
  TO educore_r4_otp_delivery;
~~~

request_recovery_otp chỉ nhận email đã chuẩn hóa, kiểm tra purpose cố định PASSWORD_RESET, trạng thái ACTIVE, cooldown hiện tại trên **mọi** OTP của user, HMAC và phong bì đúng độ dài; khóa user, tiêu thụ mọi OTP cũ, insert OTP với id do API cung cấp và expires_at = DB clock + 15 phút, rồi insert task trong cùng transaction. Không lưu plaintext. Giá trị boolean chỉ dùng nội bộ; HTTP vẫn 202. Legacy educore_r4.request_otp(text,OtpPurpose,text) phải được **CREATE OR REPLACE trong migration mới** để từ chối PASSWORD_RESET và giữ nguyên hành vi ACTIVATION hiện có. Như vậy credential auth không thể âm thầm đi đường fire-and-forget cho recovery; cutover cần bảo trì chung ngắn, mô tả ở §10.

claim_recovery_delivery trả JSON gồm otp_id, purpose, canonical recipient lấy từ users theo user_id của OTP, key_id/nonce/ciphertext/tag, fence, expires_at; không trả hash hoặc credential. Nó khóa user trước OTP và task; nếu user không còn ACTIVE thì chuyển task chưa terminal sang CANCELLED ngay trong claim, xóa ciphertext, tăng fence và không trả payload. Worker giải mã envelope rồi so email gốc với canonical recipient. Nếu lệch, worker gọi finish_recovery_delivery với expected_email từ envelope và outcome RECIPIENT_MISMATCH; hàm phải chuyển task sang CANCELLED/RECIPIENT_CHANGED, xóa ciphertext và tăng fence, không gọi SMTP. check_recovery_delivery kiểm tra lại ngay trước send và nhận expected_email từ envelope; nếu user không ACTIVE hoặc email DB khác expected_email, nó hủy task trong cùng transaction và trả false. finish_recovery_delivery cũng khóa/recheck user, OTP, purpose, expected_email và lease trước khi ghi kết quả SMTP; outcome allowlist là SMTP_ACCEPTED/TRANSIENT/PERMANENT/UNKNOWN/RECIPIENT_MISMATCH, lịch retry do DB tự tính, không nhận next_attempt_at từ caller. sweep_recovery_deliveries chỉ nhận 1..1000, quét hết hạn/lease và xóa metadata terminal đã quá 7 ngày; khi quét task còn sống, nó cũng hủy nếu user không ACTIVE. Sweep không giải mã envelope nên **không** tự phát hiện email bên trong khác email DB; task sai recipient do fixture/lỗi sẽ được xóa khi worker giải mã hoặc khi task hết hạn được sweep. Nếu worker/sweeper cùng offline, ciphertext mã hóa còn tồn tại đến khi dịch vụ phục hồi và cleanup chạy, không có lời hứa xóa đúng giờ.

Trigger trên public.password_reset_otps AFTER UPDATE OF consumed_at, attempt_count hủy task khi consumed_at từ NULL thành non-NULL hoặc số lần thử chạm max; nó chạy trong transaction reset/request_otp cũ/mới. Trigger mới trên public.users AFTER UPDATE OF status,email_normalized hủy tất cả task recovery chưa terminal gắn với user khi ACTIVE chuyển sang bất kỳ trạng thái không ACTIVE (bao gồm DISABLED) **hoặc** email_normalized đổi; không sửa cách user-management cho phép/thực hiện cập nhật. Cả hai trigger cập nhật task thành CANCELLED, last_error_code allowlist (OTP_INVALIDATED hoặc USER_STATE_CHANGED/RECIPIENT_CHANGED), đặt completed_at, NULL payload/next_attempt_at/lease và tăng fencing_token ngay trong transaction nguồn. Nếu transaction nguồn rollback, hủy task cũng rollback. Task đang SENDING bị hủy/fence như task chờ; worker cũ không được finalize/ghi đè. Task ACCEPTED_BY_SMTP đã terminal không đổi trạng thái, vì không thể thu hồi thư đã gửi.

Khi truy cập nhiều hàng, thứ tự khóa cố định: users -> password_reset_otps -> recovery_otp_deliveries. claim chọn candidate bằng SELECT **chưa khóa**, lấy user_id, khóa user FOR UPDATE SKIP LOCKED, sau đó OTP và task FOR UPDATE SKIP LOCKED và kiểm tra lại điều kiện; tránh claim giữ task rồi chờ user trong lúc request giữ user và chờ task. check/finish/sweep dùng cùng thứ tự sau khi đọc id không khóa; lock timeout hữu hạn. SMTP luôn nằm **ngoài** transaction. Nếu SQL issue thất bại, OTP và task cùng rollback; nếu commit xong rồi API chết, task vẫn còn. Hàm cấp mã/trigger phải từ chối việc purpose trên task khác purpose hàng OTP; claim và check luôn so sánh cả hai, trạng thái user, consumed_at, attempt_count, expires_at và “mã OTP mới nhất còn hiệu lực của user” trước gửi.

## 7. D01-3: hợp đồng mật mã, khóa và danh tính

1. API chuẩn hóa email như hiện tại, sinh **otp_id UUID v4 trước khi gọi DB**, rồi sinh OTP 6 chữ số bằng CSPRNG và tính HMAC hiện hành với email chuẩn hóa + PASSWORD_RESET + pepper. API chưa biết user_id và **không đặt user_id trong AAD**. Cả email không tồn tại cũng đi qua bước tạo ngẫu nhiên/mã hóa; nếu DB trả false, xóa bản rõ trong bộ nhớ và không tạo task.
2. API dùng AES-256-GCM với khóa đúng 32 byte từ secret store, nonce ngẫu nhiên CSPRNG đúng 12 byte cho mỗi task (không tái dùng cùng khóa), tag 16 byte. Plaintext phong bì phiên bản 1 có format nhị phân chính xác: 1 byte 0x01; 2 byte big-endian cho độ dài email; email_normalized mã UTF-8 (1..1024 byte, còn phải qua giới hạn email API hiện hành); 6 byte ASCII của OTP. Worker giải mã và kiểm tra toàn bộ format/độ dài, email chuẩn hóa, regex OTP sáu chữ số trước gửi. Ciphertext có cùng độ dài 10..1033 byte; DB chặn ngoài khoảng đó. Chỉ lưu ciphertext/nonce/tag/key_id, không lưu email/OTP rõ trong queue.
3. AAD được mã hóa nhị phân duy nhất theo thứ tự: chuỗi UTF-8 cố định “EduCore/R4/recovery-otp/v1”, byte 0x00, 16 byte UUID của otp_id, byte 0x01, chuỗi ASCII “PASSWORD_RESET”, byte 0x00, key_id ASCII. key_id phải khớp regex ^[A-Za-z0-9._-]{1,64}$; canonical UUID bytes và purpose cố định làm AAD không mơ hồ. AAD không cần lưu riêng. Task và OTP cùng id qua PK/FK; API và worker tính AAD từ id/purpose/key_id trong DB, nên đổi task sang OTP/purpose/key khác làm xác thực GCM thất bại.
4. Hàm issue SQL tìm user bằng email_normalized **bên trong DB dưới FOR UPDATE**; chỉ từ hàng users đó mới lấy user_id để insert password_reset_otps. Worker claim đi từ task -> OTP FK -> user_id -> users, lấy email_normalized hiện hành khi đã khóa/kiểm tra user ACTIVE và OTP đúng purpose, chưa tiêu thụ, chưa hết hạn, còn attempts và là OTP hiện hành. Worker không tin user_id do API đoán. Trigger users trong §6 hủy task ở transaction đổi email/trạng thái. Sau giải mã, worker so email từ phong bì với email_normalized lấy từ DB bằng so sánh byte đã chuẩn hóa; nếu khác, finish RECIPIENT_MISMATCH -> CANCELLED/RECIPIENT_CHANGED, xóa ciphertext và **không gửi**. Ngay trước SMTP, check_recovery_delivery(...,expected_email) đối chiếu lại email DB với email phong bì, purpose, OTP và lease; nó hủy atomically nếu lệch. Finish cũng recheck dưới khóa. Đổi email sau check nhưng khi send đã in-flight vẫn có race không thể thu hồi; backend phải từ chối mã nếu OTP đã bị tiêu thụ/vô hiệu.
5. Cấu hình đề xuất: API có R4_RECOVERY_ACTIVE_KEY_ID, R4_RECOVERY_ACTIVE_KEY (base64 của 32 byte); worker process riêng có keyring dạng secret-store mapping key_id -> 32-byte key, credential SMTP và **chỉ** URL DB OTP-worker. API không nhận credential SMTP; worker không nhận OTP pepper, JWT secret, DB auth/API credential. AES đối xứng nghĩa là API kỹ thuật có thể giải mã bằng khóa active; kiểm soát dựa vào phạm vi process và DB ACL, không hứa “encrypt-only” bằng AES.
6. Rotation: thêm khóa mới vào worker keyring trước, xác minh đọc được task còn sống, đổi active key_id ở API, giữ khóa cũ ít nhất qua thời gian OTP còn hạn + thời gian drain/backup được duyệt; key_id cũ chỉ bỏ sau khi không còn ciphertext cần đọc. Không log/commit/in ZIP khóa, nonce+OTP hay SMTP secret. Khi key mất/sai, worker không đoán OTP, không gửi lại mã khác dưới task cũ: trạng thái FAILED với KEY_UNAVAILABLE, xóa ciphertext qua hàm finish, alert tổng hợp; người dùng có thể yêu cầu mã mới theo cooldown hiện có. Nếu key mất nhưng worker đang offline, payload mã hóa còn trong DB/backup tới cleanup; giữ quyền backup tối thiểu.
7. Ciphertext/key_id/nonce/tag bị xóa bằng NULL **trong transaction** khi task terminal (SMTP_ACCEPTED, FAILED, CANCELLED, EXPIRED); trigger invalidation xóa ngay trong transaction đổi OTP, kể cả cross-purpose. Sweeper chạy mỗi 30 giây khi worker online để xóa payload hết hạn; khi worker offline không thể hứa xóa đúng thời điểm, nhưng claim/check và reset vẫn chặn OTP hết hạn. Metadata không PII/OTP (otp_id, trạng thái, số lần, mã lỗi allowlist, thời điểm) xóa sau **7 ngày từ completed_at**. Backup cũ có thể còn ciphertext cho tới hết retention backup; owner phải duyệt chính sách backup/key cùng với rollout production. Không ghi raw email, OTP, HMAC, ciphertext hoặc key vào log/audit/tracing/metric label; chỉ tổng số trạng thái/lỗi và correlation ngẫu nhiên với quyền vận hành.

### Ma trận quyền/secret đề xuất

| Chủ thể | DB/EXECUTE | Secret và dữ liệu được thấy | Bị cấm |
| --- | --- | --- | --- |
| API auth runtime, role educore_r4_auth | EXECUTE request_recovery_otp, các function auth hiện có; legacy request_otp chỉ ACTIVATION | Email/OTP trong RAM lúc phát hành, OTP pepper, AES active key | Raw SELECT/DML queue/OTP/credentials; claim/finish; SMTP secret |
| OTP worker runtime, role educore_r4_otp_delivery | EXECUTE claim/check/finish/sweep; schema USAGE; không role nghiệp vụ | Chỉ một claim hợp lệ: recipient, ciphertext, key_id; worker keyring, SMTP secret | issue/reset, raw table SELECT/DML, OTP pepper, JWT/API credential, business jobs/outbox |
| Business worker/API/operator runtime | Quyền cũ, **không** EXECUTE function OTP-worker | Không có OTP payload/keyring | Queue và delivery status theo email |
| educore_r4_owner NOLOGIN | Chủ bảng/function, DML cần cho SECURITY DEFINER | Chỉ dùng trong migration/function trusted | Không dùng làm login ứng dụng |
| Migration/admin và backup operator | Quyền đặc biệt theo quy trình vận hành riêng | Có thể thấy ciphertext/backup, không được cấp key mặc định | Đọc key/log rộng hoặc gửi SMTP ngoài quy trình |

Migration: ALTER TABLE recovery_otp_deliveries OWNER TO educore_r4_owner; REVOKE ALL ON TABLE ... FROM PUBLIC; GRANT USAGE ON SCHEMA educore_r4 TO educore_r4_otp_delivery; REVOKE EXECUTE ON từng function mới FROM PUBLIC rồi chỉ GRANT EXECUTE request_recovery_otp(...) TO educore_r4_auth và GRANT EXECUTE claim/check/finish/sweep TO educore_r4_otp_delivery. Cả hai trigger function không grant cho runtime. Không grant quyền raw table cho bất kỳ runtime role. Function owner đặt bằng ALTER FUNCTION ... OWNER TO educore_r4_owner sau CREATE; kiểm tra pg_proc.prosecdef, proconfig search_path, owner, ACL và login membership trong assertRuntime. Login worker riêng chỉ là member OTP-worker, không đồng thời là member educore_r4_worker/auth/api/owner; không dùng DATABASE_URL/superuser fallback. Test trực tiếp các thao tác bị cấm.

## 8. D01-4/5: state, retry, expiry, race và crash

| Từ trạng thái | Sự kiện và transaction | Sang trạng thái |
| --- | --- | --- |
| Chưa có | issue cùng transaction với HMAC OTP, next_attempt_at = DB clock | READY |
| READY/RETRY_WAIT | claim khóa user -> OTP -> task, recheck hợp lệ; tăng attempt_count và fence, lease_owner = worker UUID, lease_until = now + 90 giây; payload chỉ trả sau commit | SENDING |
| SENDING | check ngay trước SMTP thấy OTP/user/email/purpose không hợp lệ, đã dùng hoặc đã bị thay; trigger/check/finish xóa ciphertext, tăng fence | CANCELLED |
| SENDING | SMTP server chấp nhận, finish khớp owner+fence+lease và clear payload | ACCEPTED_BY_SMTP |
| SENDING | 5xx recipient/config/key lỗi vĩnh viễn hoặc số lần đã hết; finish clear payload, mã lỗi allowlist, alert tổng hợp | FAILED |
| SENDING | 4xx/network tạm thời hoặc timeout chưa rõ; finish đặt lịch do DB tính nếu còn thời gian | RETRY_WAIT |
| READY/RETRY_WAIT/SENDING | OTP consumed, 5 lần sai hoặc bị request mới thay: trigger OTP; user ACTIVE -> DISABLED/khác ACTIVE hoặc email_normalized đổi: trigger users; envelope recipient lệch email hiện tại: worker sau decrypt gọi finish RECIPIENT_MISMATCH; claim/check/finish/sweep recheck user state | CANCELLED + xóa ciphertext/lease/next attempt, tăng fence trong cùng transaction |
| READY/RETRY_WAIT/SENDING | Không đủ thời gian tối thiểu hoặc đã quá expires_at; sweeper/claim/finish clear payload | EXPIRED |
| SENDING | Worker chết, lease hết; sweeper phân loại UNKNOWN, chỉ retry cùng mã khi còn hạn và số lần; fence cũ mất hiệu lực | RETRY_WAIT hoặc EXPIRED/FAILED |

**Lịch cụ thể đề xuất:** tối đa 4 lần gửi. Claim đầu tiên gần t=0; sau lần lỗi thứ 1/2/3, chờ lần lượt **1, 3, 5 phút tính từ lúc finish thất bại**. Với mỗi send tối đa 45 giây, các mốc xấu nhất nếu không có chậm worker là t≈0, 1:45, 5:30, 11:15; lần cuối hoàn tất khoảng 12:00, còn trước 15:00. Nếu worker đến trễ, có thể chỉ 1–3 lần: không hứa đủ bốn lần. DB chỉ claim/begin send nếu clock_timestamp() + 45 giây execution bound + 30 giây safety margin < OTP.expires_at; tức cần **hơn 75 giây** còn lại. Khi lịch kế tiếp không đáp ứng điều kiện này nhưng OTP chưa hết hạn, chuyển FAILED với DELIVERY_WINDOW_CLOSED; chỉ dùng EXPIRED khi clock_timestamp() >= OTP.expires_at. Khi attempt_count đạt 4 và SMTP vẫn lỗi, chuyển FAILED. 429/5-lần-thử OTP là giới hạn khác, không reset counter delivery.

**Giới hạn SMTP/lease:** giữ timeout Nodemailer hiện tại 10 giây connection, 10 giây greeting, 15 giây socket; bọc một watchdog **45 giây wall-clock**. Với đúng một recipient, worker chỉ gọi SMTP_ACCEPTED khi kết quả sendMail xác nhận recipient đó trong danh sách accepted; rejected/không rõ kết quả được phân loại theo SMTP code, không coi resolve chung là inbox delivery. 4xx là transient, 5xx recipient/config là permanent, timeout/mất kết nối sau khi có thể đã gửi là UNKNOWN. Watchdog phải đóng transport/socket, đợi đóng hoặc dừng process worker cô lập; nếu bị kill trước khi finish thì lease expiry ghi UNKNOWN. Chỉ Promise.race mà không đóng kết nối là không đạt hợp đồng. Lease **90 giây**, lớn hơn bound 45 giây cộng thời gian finish/lock và biên scheduling; không dùng heartbeat trong giới hạn này. Worker_id là UUID v4 sinh mỗi process, fence tăng mỗi claim; check và finish từ chối lease/fence cũ. Nếu event loop treo, network accept sau timeout hoặc crash sau SMTP accept trước finish, SMTP có thể gửi trùng cùng OTP khi claim lại; fencing chỉ bảo vệ trạng thái DB, **không thể bảo đảm exactly-once SMTP**. Không bắt đầu lần gửi mới sau khi check thấy OTP consumed/expired/superseded; thư đã in-flight/đã vào hàng SMTP có thể đến muộn và mã phải bị backend từ chối.

**Cross-purpose giữ nguyên:** Hàm request_otp cũ cho ACTIVATION vẫn dùng cooldown 1 phút trên mọi purpose và UPDATE consumed_at trên mọi OTP chưa dùng của user. Trigger invalidation mới, dù thay đổi do activation hay recovery hay reset, hủy task recovery cùng otp_id và xóa ciphertext trong transaction đó. Không đổi quyền xác minh purpose của reset, không đổi hành vi AU06. Nếu trigger thấy task SENDING, nó không thể hủy SMTP đã bắt đầu; finish với fence cũ không làm task sống lại. Test phải dùng cả request_otp(ACTIVATION) hiện tại lẫn request_recovery_otp(PASSWORD_RESET), xác minh hai chiều supersession theo trạng thái user cho phép, và không giả tạo user ACTIVE/PENDING_ACTIVATION đồng thời nếu trạng thái hiện không cho phép.
## 9. File plan cho pha code sau phê duyệt

| File dự kiến | Phạm vi chính xác |
| --- | --- |
| apps/api/prisma/migrations/<new>_recovery_otp_delivery/migration.sql | Migration mới: role, queue, index/constraint, function/trigger, owner và EXECUTE ACL; không sửa migration cũ. |
| apps/api/prisma/schema.prisma | Ánh xạ model mới nếu Prisma generate cần; không thay schema OTP lịch sử ngoài relation cần thiết. |
| apps/api/src/identity-access/auth.service.ts và crypto helper mới | API tạo UUID/OTP/HMAC/AES với recipient trong phong bì, gọi issue function, xóa bản rõ sớm. |
| apps/api/src/identity-access/otp-delivery.ts, config.ts, r4-repository.ts, main.ts hoặc entrypoint worker mới | Tách worker runtime/secret/DB role, hard watchdog và kiểm tra ACL. Không mở AU06. |
| apps/api/src/identity-access/http.ts | Cache-Control no-store và mapping 503 chung nếu chưa có; giữ 202/DTO. |
| apps/web/src/screens/Authentication & Shared/AU03/RecoveryRequestScreen.tsx | Lời nhắc retry trung tính nếu owner duyệt; không đổi AU04 hoặc API client nếu không cần. |
| apps/api/test/r4/otp-delivery.spec.ts, otp-delivery-http.spec.ts, r4.postgres.test.ts và helper test D01 nếu cần; apps/web/src/screens/Authentication & Shared/recovery.test.mjs | Unit/fake SMTP, HTTP, PostgreSQL thật, browser. Native cases gắn vào harness R4 hiện có để một runner mới tạo/migrate đúng một cluster; không thêm suite tự trỏ DB. |
| docs/ai/integration/<D01 report mới>.md và ZIP review pha code | PASS/FAIL/SKIP thực tế, SMTP production/email inbox ghi riêng chưa xác minh. |

## 10. Rollout, quay lui và ranh giới phê duyệt

1. **Local implementation sau khi owner duyệt hợp đồng:** chỉ trên checkout/dev và PostgreSQL disposable. Tạo migration mới và tests; không chạy migration lên DB dùng chung/prod. Đảm bảo role/login test mới không kiêm các role R4 khác. Chuẩn bị secret giả và fake SMTP; không gửi email thật.
2. **Production là phê duyệt riêng:** owner vận hành phải duyệt SMTP host/from/credentials, secret store/khoá AES, quyền backup, retention, monitor/alert, người trực sự cố và bài kiểm tra gửi thật có địa chỉ kiểm soát. Local code approval không bao hàm key custody, kết nối SMTP production hay phát hành.
3. **Cutover phối hợp:** trước migration/app switch, bật chế độ bảo trì recovery **chung cho mọi email** trả 503 cùng headers/body (không dựa vào lookup). Áp dụng migration mới; xác minh function owner/ACL, queue index, trigger và runtime login. Deploy API/worker mới với keyring/fake hoặc SMTP theo môi trường đã duyệt. Chạy smoke tạo OTP+task, thử claim và 202/unknown timing; bật lại endpoint chỉ khi đủ điều kiện. Activation route hiện tại giữ nguyên chức năng. Không dùng cùng tiến trình chứa cả API secrets và SMTP secret ở production.
4. **Quay lui ứng dụng:** bật lại bảo trì recovery chung, dừng issue mới, giữ migration/table/function và worker+key cũ để drain task còn hạn; nếu không drain được thì đánh dấu FAILED/EXPIRED theo quy trình, cảnh báo tổng hợp và cho người dùng yêu cầu mới khi trở lại. Không khôi phục đường recovery fire-and-forget hoặc mở lại legacy request_otp(PASSWORD_RESET) khi còn task. Nếu phải chạy bản API cũ, recovery route ở 503 chung cho đến khi bản code tương thích được khôi phục; activation vẫn theo đường cũ. Không drop table/column hay hạ cấp migration tự động. Quay lui secret key trước khi task/backup hết hạn là không an toàn.
5. **Kiểm soát khi worker/SMTP hỏng:** task vẫn commit và 202 nếu DB còn hoạt động; alert khi backlog già, số FAILED hoặc KEY_UNAVAILABLE vượt ngưỡng owner duyệt. Nếu toàn bộ secret/SMTP không thể vận hành kéo dài, đặt recovery vào bảo trì chung trước lookup; không trả lỗi khác nhau theo recipient. Không khẳng định yêu cầu cũ đã gửi thành công.

## 11. Kế hoạch kiểm thử có thể chạy sau phê duyệt

Dùng Vitest/R4 harness hiện có. **Chỉ** chạy native qua runner đã được duyệt `apps/api/test/r4/start-r4-native.ps1 -RunTests` từ repository root; lệnh unit/HTTP không đụng DB native. Runner kiểm Docker context cục bộ, tự tạo container PostgreSQL 16 tên/label/DB ngẫu nhiên và anonymous volume mới, bind duy nhất 127.0.0.1, xác minh container ID/label/mount/port, database rỗng (không public table, migration, role xung đột hay database khác), rồi **mới** cấp R4_TEST_URL và R4_TEST_DISPOSABLE trong process cho harness; harness kiểm lại loopback/tên DB/độ rỗng trước Prisma migrate deploy. Runner giữ resource và bằng chứng sanitized để owner xem xét, không xóa/reset cluster khác. Không đặt hai biến admission thủ công, không chạy trực tiếp `test:r4:native`/Vitest native với URL tự chọn, không lấy DATABASE_URL của ứng dụng. Nếu Docker/runner/admission thất bại: báo SKIP/ENVIRONMENT_BLOCKED, **không** chuyển sang DB shared, populated, development, staging hay production và không nới kiểm tra của runner. Native D01 cases bổ sung vào R4 harness để full suite chạy trên mỗi cluster mới; lọc `-TestFilter` chỉ để chẩn đoán, không thay bằng chứng full suite. Không chạy các lệnh này trong review thiết kế.

~~~powershell
pnpm --dir apps/api exec vitest run test/r4/otp-delivery.spec.ts test/r4/otp-delivery-http.spec.ts
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
pnpm --dir apps/web test
pnpm --dir apps/api build
pnpm --dir apps/web build
~~~

| Suite | Ca bắt buộc và khẳng định |
| --- | --- |
| Unit crypto/worker + fake SMTP | UUID trước DB; OTP sáu số; AAD/key_id/nonce/tag và recipient mã hóa đúng; hoán đổi otp_id/purpose/key_id hoặc sai tag/key từ chối; email đổi sau issue hủy, không gửi; fake server trả 250 => ACCEPTED_BY_SMTP, 4xx => retry, 5xx => FAILED, timeout 45s => UNKNOWN; transport.close được gọi; 4 lần tối đa, không send khi <75s; không log PII/OTP/key; hai worker nhận cùng claim thì chỉ một fence hợp lệ. |
| Native PostgreSQL 16 | Issue OTP+task cùng commit/rollback; unknown/disabled/cooldown không có task; task PK/FK/shape CHECK/error allowlist/purpose; UUID trùng rollback; legacy recovery issue bị chặn, activation vẫn hoạt động; trigger OTP hủy task khi recovery/activation supersede, reset thành công hoặc attempts chạm max; trigger users hủy ngay khi ACTIVE -> DISABLED/khác ACTIVE hoặc email_normalized đổi; test user lock/concurrent claim/check/finish/fence cũ, rollback cập nhật user và sweep lease; worker/login auth/API/operator không SELECT queue, không EXECUTE sai; no session/token từ request; reset Argon2id/thu hồi phiên như cũ. |
| HTTP Supertest | Email hợp lệ có/không tài khoản/disabled/cooldown đều 202 + DTO/headers giống nhau; SMTP fake slow/reject/timeout không ảnh hưởng status/body/header/thời gian request; 400 cú pháp, 429 per-IP; prelookup gate/throttle DB fault chung 503 đúng envelope; lỗi SQL injected chỉ sau lookup của known hoặc unknown vẫn 202 và **request probe tiếp theo cũng 202** nếu health độc lập chưa đổi; không status route theo email; đo timing theo protocol C03 bên dưới. |
| Browser/hành trình | AU03 lời nhắc trung tính, retry sau một phút, AU04 nhập email trực tiếp, reset 204, phiên cũ vô hiệu; không email/OTP/password trong query hay storage; kiểm tra focus, lỗi mạng, 400/429 và reload. Chạy Edge CDP local theo R4 browserAuthJourney nếu có Edge; báo SKIP riêng nếu thiếu browser. |
| Crash/restart/injection | Commit xong kill API trước SMTP; kill worker trước send, khi đang send, sau SMTP 250 trước finish; restart worker và assert task hồi phục theo lease, cùng mã, không quá 4 lần; provider timeout không hứa một thư; expire/supersede giữa retry; email đến muộn nhưng OTP bị backend từ chối. Test với local fake SMTP/controlled server, không địa chỉ khách hàng/credential prod. |

**C01 — native race/lifecycle cases bắt buộc trong R4 runner:** Dùng hai kết nối PostgreSQL độc lập và barrier có kiểm soát. (a) T1 đổi ACTIVE -> DISABLED giữ transaction mở, T2 claim dùng SKIP LOCKED hoặc check/finish chờ theo lock order; sau T1 COMMIT, task READY và SENDING đều CANCELLED, payload/lease/next_attempt NULL, fence tăng, T2 không nhận mã để gửi hoặc finish bị STALE; sau T1 ROLLBACK, task vẫn hợp lệ. (b) Lặp lại với email_normalized đổi; worker đã claim trước commit phải thấy check=false/stale sau commit, không gọi fake SMTP nếu chưa bắt đầu gửi. (c) Tạo test fixture mã hóa bằng test key với recipient khác email hiện tại nhưng vẫn đúng AAD/tag: claim không thể giải mã; worker giải mã, so sánh rồi finish RECIPIENT_MISMATCH -> CANCELLED/RECIPIENT_CHANGED, ciphertext NULL, fence tăng, SMTP nhận 0 thư; finish cũ không hồi sinh task. (d) Giữa check và SMTP, COMMIT đổi user: nếu send đã bắt đầu thì chấp nhận email có thể đến muộn, nhưng trigger hủy/fence và reset OTP bị từ chối; không hứa thu hồi SMTP. (e) Sweep task có user không ACTIVE như lớp phòng thủ, không cần/không được đọc plaintext recipient; kiểm tra trigger không thay đổi quy tắc cập nhật user hay grant runtime. Mỗi ca assert trạng thái, counter/fence, ciphertext, thứ tự commit và số lần gửi, không chỉ assert HTTP.

### C03 — protocol đo chống dò tài khoản (thực thi trong R4 native runner)

1. Chạy **ba lượt trên ba cluster mới do runner tạo**, ghi seed randomization, Node/PostgreSQL version, image ID, CPU/load và cấu hình fake SMTP; không có workload khác. Mỗi lượt seed ít nhất 1.200 user ACTIVE có email duy nhất và 1.200 email không tồn tại, chia thành ba tập không giao nhau cho ba điều kiện bên dưới, cùng domain và phân bố độ dài byte/cú pháp; mỗi email chỉ yêu cầu **một lần** để cooldown 1 phút không làm biến đổi nhóm known. Thêm 100 request warm-up cân bằng hai nhóm bằng fixture khác, loại toàn bộ warm-up khỏi phân tích và đợi worker xử lý hết task warm-up trước khi đo.
2. Với mỗi điều kiện (worker fake SMTP khỏe; worker fake SMTP chậm/reject; tải HTTP cố định concurrency 4), lấy **400 phản hồi known + 400 unknown** bằng 100 block ngẫu nhiên có seed, mỗi block 4+4 và thứ tự tráo ngẫu nhiên. Throttle SQL thật vẫn chạy. Để không chạm 10 request/phút/IP, chỉ trong Nest test instance disposable cấu hình trusted loopback proxy và gán mỗi block một IP giả lập riêng qua X-Forwarded-For; IP/block và thứ tự được cân bằng, không áp dụng trust-proxy setting này cho production. Nếu harness không thể cấp các IP độc lập an toàn, dừng đo và báo INCONCLUSIVE; không tắt throttle trong code production. Test riêng giữ cấu hình proxy production và chứng minh 429 thực sự hoạt động.
3. Ghi thời gian từ gửi HTTP đến đọc xong body bằng monotonic clock; chạy cùng loopback host, request size, keep-alive và lịch tải. Với từng cặp điều kiện, so **status 202, body bytes, Content-Type, Cache-Control, Content-Length, Vary/Retry-After/Set-Cookie (nếu có)**; X-Request-Id/correlationId chỉ khác giá trị ngẫu nhiên, phải cùng format và không chứa eligibility. Fault injection prelookup gate chạy 100 known + 100 unknown, tất cả đúng 503/body code và header contract; lỗi SQL chỉ sau lookup được tiêm tách biệt vào known/unknown, mỗi request và request probe kế tiếp đều 202 khi health độc lập vẫn tốt. Provider fake chậm/lỗi không được làm HTTP chờ SMTP.
4. Báo median, p95, ECDF và phân bố theo block của hai nhóm, chênh lệch known−unknown, AUC xác suất xếp hạng latency, **95% CI bằng 10.000 bootstrap resample theo block** cho mỗi run/điều kiện; lưu seed và raw timing đã bỏ email để tái lập. Chỉ PASS khi mọi run/điều kiện có status/body/header tương đương, 95% CI của AUC nằm trọn trong [0,45;0,55], 95% CI của chênh median nằm trong ±max(10 ms,5% pooled median) và chênh p95 trong ±max(25 ms,10% pooled p95). Đây là ngưỡng nghiệm thu đề xuất để owner chốt trước khi chạy; không chỉnh ngưỡng sau khi thấy dữ liệu.
5. **BLOCK:** bất kỳ khác biệt status/body/header theo eligibility, lỗi SMTP ảnh hưởng response, CI vượt ngưỡng hoặc CI quá rộng để kết luận. Báo FAIL nếu có bằng chứng lệch; báo INCONCLUSIVE/SKIP nếu môi trường/mẫu thiếu và không tuyên bố PASS. Có thể bổ sung mẫu ở cluster mới với cùng protocol đã đăng ký, giữ mọi kết quả cũ trong báo cáo. Một cặp request giống nhau, jitter tùy ý hoặc một run PASS không chứng minh chống dò.

Phải ghi kết quả từng tầng PASS/FAIL/SKIP thực tế sau triển khai. Fake SMTP chỉ chứng minh worker logic và server chấp nhận; **inbox delivery/production SMTP vẫn chưa xác minh** cho đến bài kiểm thử vận hành riêng được duyệt.

## 12. Quyết định owner phải ghi rõ trước khi viết code

Hướng D01-1…5 đã được chấp nhận **có điều kiện để tinh chỉnh**; các mục dưới đây là danh sách xác nhận cuối cùng cùng C01–C03, không suy diễn thành quyền triển khai hay quyền dùng SMTP/key production.

1. **D01-1 / NEEDS_OWNER_APPROVAL:** Có chấp thuận hợp đồng public 202 + hướng dẫn chung + alert nội bộ, đồng thời giữ UC-03/2a OPEN cho yêu cầu thông báo thất bại cụ thể? Nếu muốn đóng 2a, phê duyệt diễn giải/tiêu chí mới hoặc thiết kế kênh an toàn riêng; không sửa UC-03/Q-01 âm thầm.
2. **D01-2 / NEEDS_OWNER_APPROVAL:** Duyệt bảng/task/hàm/role mới, migration tiến một chiều, legacy recovery guard, trigger tiêu thụ và bảo trì chung khi cutover. Option B là hướng đã chấp thuận để tinh chỉnh, **chưa là quyền triển khai**.
3. **D01-3 / NEEDS_OWNER_APPROVAL:** Duyệt AAD không user_id, AES-256-GCM với email+OTP trong phong bì, keyring/rotation/retention 7 ngày, backup và runtime secret split. Phê duyệt triển khai cục bộ tách khỏi duyệt khóa thật/SMTP production.
4. **D01-4 / NEEDS_OWNER_APPROVAL:** Duyệt 4 lần, backoff 1/3/5 phút, 45s watchdog + đóng transport, 90s lease, cửa sổ 75s, fake SMTP failure matrix và ngưỡng timing/alert đo được.
5. **D01-5 / NEEDS_OWNER_APPROVAL:** Xác nhận giữ cooldown/supersession xuyên purpose của SQL hiện tại; trigger chỉ hủy task recovery theo hiệu lực OTP. Mọi thay đổi policy cross-purpose cần quyết định riêng, không mở AU06 trong lát cắt này.

## 13. Prompt đề xuất cho Codex sau phê duyệt

> Chỉ triển khai D01 PASSWORD_RESET khi owner đã ghi phê duyệt D01-1…5 và C01–C03 của docs/ai/features/otp-delivery-reliability-d01.md. Đọc AGENTS.md, skill educore-feature-slice, FR-01/Q-01/UC-03, migration/code thực tế; xác nhận baseline và working tree. Tạo migration mới, queue/auth function/trigger OTP+users/ACL đúng hợp đồng; API tạo otp_id trước DB, AES-GCM AAD otp_id+purpose+key_id, email và OTP trong phong bì mã hóa; worker process/DB role/SMTP secret riêng, lease/fence/retry/cleanup; giữ HTTP 202 chống dò, mapping 503 chỉ trước lookup và session reset hiện tại, không triển khai AU06. Native PostgreSQL **chỉ** chạy qua apps/api/test/r4/start-r4-native.ps1 -RunTests trên cluster mới runner kiểm tra; không tự đặt admission env hay dùng DB shared/dev/staging/prod. Dùng fake SMTP, unit/HTTP/native/browser và protocol timing §11; ghi PASS/FAIL/SKIP thực tế và tách SMTP server acceptance khỏi inbox/production delivery. Không dùng key/SMTP production nếu thiếu duyệt riêng. Tạo ZIP owner review đúng đường dẫn repo; không sửa migration cũ, không commit/push/PR/merge/deploy. Nếu một quyết định chưa duyệt, dừng phần phụ thuộc và báo owner.

## 14. Kết quả của lần chỉnh hợp đồng này

Lần C01–C03 này chỉ rà soát tài liệu, SQL/HTTP hiện có và runner R4; chỉnh tài liệu đề xuất và ma trận test. Không chạy migration, DB, SMTP, HTTP, browser hoặc unit test. Do đó các ca §11 đều **SKIP/chưa chạy** trong tác vụ thiết kế; không có PASS runtime mới. Bản hợp đồng sẵn sàng để owner xem xét, UC-03/2a vẫn OPEN và sản xuất SMTP/khóa thật chưa được xác minh hoặc cấp quyền.
