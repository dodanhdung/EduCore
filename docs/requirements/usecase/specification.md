# EduCore — Use Case Specifications
## 1. Mục đích và quy ước

Tài liệu mô tả các tương tác để đạt mục tiêu nghiệp vụ của EduCore, phục vụ thiết kế, lập trình và xây dựng test case. Các ID `UC-01`–`UC-37` được tạo mới cho đặc tả này; không thay thế hoặc đánh số lại US/FR/BR trong nguồn.

- **Actor** là vai trò tương tác, không phải một nhân sự bắt buộc. Một tài khoản có thể kiêm nhiệm nhiều role.
- Actor ghi trong use case là bên thường đảm nhận nghiệp vụ. **Permission hiện hành + tenant + phạm vi lớp/học sinh** mới quyết định quyền thực hiện; không mặc định cấp quyền chỉ từ tên chức danh.
- Các quyền mới được chốt trong Q-02/Q-14/Q-15 chỉ áp dụng đúng thao tác và phạm vi; không tự cấp quyền vượt tenant cho Student/Parent hay System Administrator.
- Mỗi use case có mục tiêu, trigger, tiền điều kiện, dữ liệu chính, luồng chính, luồng thay thế/ngoại lệ, hậu điều kiện và tiêu chí nghiệm thu. Nhãn `2a`, `3b` chỉ nhánh phát sinh từ bước tương ứng của luồng chính.
- **P0** là MVP; **P1** là mở rộng. Use case có nhiều mức ưu tiên phải triển khai đúng phần được chỉ rõ. `P0*` theo FR-42: **tenant isolation bắt buộc ở P0**; dấu `*` chỉ chưa triển khai bộ công cụ quản trị tenant nâng cao (Q-15).
- Các bước tổ chức tương tác áp dụng 14 BR đã chốt cùng quyết định Q-01–Q-15 của đồ án tại mục 7 và Requirements Analysis mục 7. Thay đổi chính sách sau này cần kiểm soát phiên bản.
- `Hóa đơn` là bảng kê/chứng từ học phí **nội bộ**, không mặc nhiên là hóa đơn điện tử hợp pháp. Thanh toán trong phạm vi này là ghi nhận/đối soát; không bao gồm tích hợp cổng thanh toán hay tự hoàn tiền.
- Bộ máy tự động, bộ lập lịch tác vụ và cơ sở dữ liệu là thành phần bên trong biên hệ thống, **không phải actor bên ngoài**. UC-37 mô tả xử lý tác vụ và tương tác giám sát; sự kiện theo lịch chỉ là trigger.

### 1.1. Điều kiện và bảo đảm chung

Các điều kiện sau áp dụng cho mọi UC nghiệp vụ, trừ những ngoại lệ xác thực được ghi riêng tại UC-01–UC-03.

| Mã | Ràng buộc chung |
|---|---|
| C-01 | Người dùng đã đăng nhập bằng tài khoản hoạt động; tác vụ nội bộ phải có nguồn gọi hợp lệ. |
| C-02 | Backend kiểm tra permission hiện hành tại mỗi lần thực thi, kể cả phê duyệt và retry. |
| C-03 | Dữ liệu, chính sách và đối tượng tham chiếu thuộc tenant được phép; không vượt phạm vi lớp/học sinh được giao. |
| C-04 | Đối tượng liên quan tồn tại và ở điều kiện cho phép thao tác; lỗi xác thực/quyền không được biến thành yêu cầu xin bỏ qua kiểm soát. |
| C-05 | Thiếu dữ liệu trong workflow → NEEDS_INFORMATION; hợp lệ nhưng cần duyệt → PENDING_APPROVAL; vi phạm điều cấm → từ chối thao tác. |
| C-06 | Thay đổi nhiều dữ liệu liên quan phải nhất quán; lỗi không để lại tác động nghiệp vụ dang dở. Kiểm tra lại tài nguyên/quyền trước khi ghi hoặc thực thi sau duyệt. |
| C-07 | Tác vụ tự động có tác động dữ liệu dùng mã chống lặp; retry giữ policy_version, tối đa 3 lần thử lại có giãn cách với lỗi tạm thời. |
| C-08 | Ghi nhật ký thao tác quan trọng/quyết định tự động/phê duyệt: sự kiện, đối tượng, người hoặc nguồn gọi, thời điểm, lý do, chính sách, kết quả và thay đổi liên quan. |
| C-09 | Thất bại: không áp dụng thay đổi bị từ chối; giữ dữ liệu đã hợp lệ. Được lưu yêu cầu chờ, dữ liệu dự thảo hợp lệ và audit nếu nhánh tương ứng quy định. |
| C-10 | P0 có thông báo **trong ứng dụng** khi lịch thay đổi hợp lệ/bài tập mới được giao (FR-37) và lưu trạng thái đã đọc/chưa đọc, chống trùng (FR-39). P1 có nhắc deadline (FR-38) và gửi ngoài ứng dụng/retry (FR-37, FR-39). Cảnh báo tác vụ lỗi hoặc thiếu người duyệt cho Manager theo BR-12 vẫn bắt buộc ở P0. Không để lỗi thông báo làm mất hiệu lực nghiệp vụ gốc đã hoàn tất. |
| C-11 | **P0 Internal-first:** không gọi API nghiệp vụ ngoài; ngoại lệ duy nhất là chuyển phát OTP email để khôi phục/xác minh tài khoản. Notification P0 chỉ in-app; thanh toán thủ công; bài tập lưu bằng hạ tầng tự quản lý. |

### 1.2. Trạng thái và tham số baseline

| Loại | Quy ước |
|---|---|
| Workflow | DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, NEEDS_INFORMATION, COMPLETED, FAILED. |
| Phân biệt duyệt/thực thi | APPROVED biểu thị quyết định chấp thuận; chỉ COMPLETED khi thực thi thành công. Các bước chuyển chi tiết thuộc Detailed Design. |
| Tự duyệt tài chính | SELF_APPROVED là cờ kiểm toán, không phải trạng thái workflow. |
| Điểm danh | ATTENDED, EXCUSED, UNEXCUSED; trạng thái xác nhận điểm danh là thuộc tính riêng. |
| Hủy lịch | CANCELLED không chiếm tài nguyên. Không đồng nhất trạng thái lịch với workflow hay trạng thái hóa đơn. |
| Nghỉ đúng hạn | Gửi ít nhất 24 giờ trước giờ bắt đầu và được chấp thuận. |
| Học bù | Tối đa 1 lượt được sử dụng/buổi nghỉ có phép; trong 30 ngày từ ngày học gốc. |
| Khôi phục P0 | OTP email một lần, 15 phút; mật khẩu ≥ 12 ký tự, băm Argon2id; access token 15 phút, refresh token tối đa 7 ngày. |
| Giảm giá P0 | Anh/chị/em đủ điều kiện: 10%; không áp dụng combo ở P0. |
| Giảm giá P1 | Combo trả trước đủ 6 tháng: 5% trước; anh/chị/em đủ điều kiện: 10% sau; tổng hiệu dụng 14,5%. |
| Mặc định tự xác nhận | invoice_auto_issue=false trong P0; teacher_substitution_auto_confirm=false; student_transfer_auto_confirm=false. |

Các giá trị baseline là lựa chọn thiết kế trong nguồn, không phải kết quả khảo sát trung tâm. Không đổi chúng khi triển khai nếu chưa cập nhật tài liệu yêu cầu và các đặc tả liên quan.

## 2. Danh mục use case

Tên actor viết gọn trong bảng chỉ giúp tra cứu. Đọc phần đặc tả để xác định permission và phạm vi thực hiện.

| ID | Use case | Ưu tiên | Actor/bên tương tác |
|---|---|---|---|
| [UC-01](#uc-01) | Đăng nhập | P0 | Tất cả người dùng có tài khoản |
| [UC-02](#uc-02) | Đăng xuất | P0 | Người dùng đã đăng nhập |
| [UC-03](#uc-03) | Khôi phục mật khẩu | P0 | Người dùng quên mật khẩu |
| [UC-04](#uc-04) | Quản lý tài khoản và trạng thái hoạt động | P0 | Manager hoặc người được cấp quyền quản lý tài khoản |
| [UC-05](#uc-05) | Gán nhiều vai trò và cấu hình quyền | P0: gán role/quyền mặc định; P1: cấu hình quyền động | Manager hoặc người được ủy quyền về phân quyền |
| [UC-06](#uc-06) | Liên kết phụ huynh với học sinh | P0 | Người có quyền quản lý liên kết phụ huynh–học sinh |
| [UC-07](#uc-07) | Quản lý hồ sơ giáo viên và học sinh | P0 | Manager; người được cấp quyền quản lý hồ sơ |
| [UC-08](#uc-08) | Quản lý khóa học, trình độ và lớp học | P0 | Manager; người có quyền quản lý đào tạo |
| [UC-09](#uc-09) | Phân công giáo viên phụ trách lớp | P0 | Manager hoặc Academic Staff có quyền phân công |
| [UC-10](#uc-10) | Ghi danh, chuyển lớp và cập nhật trạng thái học tập | P0 | Manager hoặc Academic Staff có quyền tương ứng |
| [UC-11](#uc-11) | Quản lý phòng học, sức chứa và lịch bận | P0 | Manager/Academic Staff hoặc người có quyền quản lý tài nguyên |
| [UC-12](#uc-12) | Tạo và xác nhận lịch học | P0; đề xuất tài nguyên/khung giờ P1 | Academic Staff hoặc Manager có quyền xếp lịch |
| [UC-13](#uc-13) | Thay đổi, hủy hoặc sắp xếp lại lịch học | P0 (gồm thông báo in-app); kênh ngoài P1 | Academic Staff hoặc Manager có quyền sửa lịch |
| [UC-14](#uc-14) | Xem lịch học và lịch dạy | P0 | Teacher, Student, Parent; Manager/Academic Staff có quyền xem |
| [UC-15](#uc-15) | Điểm danh và xác nhận kết quả tham gia | P0 | Teacher phụ trách buổi/lớp và có quyền điểm danh |
| [UC-16](#uc-16) | Ghi nhận và xử lý đơn xin nghỉ học | P0; cấu hình workflow nâng cao P1 | Student/Parent đã liên kết gửi đơn; người có quyền duyệt nghỉ/ngoại lệ |
| [UC-17](#uc-17) | Tìm, đăng ký và sắp xếp lại học bù | P1 | Student/Parent gửi yêu cầu; Academic Staff/Manager có quyền học bù và duyệt |
| [UC-18](#uc-18) | Yêu cầu và phê duyệt bảo lưu | P1 | Student/Parent gửi yêu cầu; người có permission phê duyệt bảo lưu |
| [UC-19](#uc-19) | Tiếp nhận học sinh quay lại sau bảo lưu | P1 | Academic Staff/Manager có quyền xếp lớp; người có quyền tài chính khi khấu trừ tín dụng |
| [UC-20](#uc-20) | Đề xuất và xác nhận giáo viên dạy thay | P1 | Academic Staff/Manager có quyền phân công; Teacher được đề xuất nhận dạy thay |
| [UC-21](#uc-21) | Cấu hình đơn giá học phí | P0 | Accountant/Manager hoặc người có quyền cấu hình đơn giá |
| [UC-22](#uc-22) | Áp dụng và cấu hình chính sách giảm giá | P0: một loại ưu đãi; P1: kết hợp và cấu hình | Accountant/Manager có quyền tương ứng |
| [UC-23](#uc-23) | Tính học phí và tạo bảng kê/hóa đơn dự thảo | P0; phần học bù/bảo lưu/kết hợp ưu đãi P1 | Accountant/Manager có quyền yêu cầu tính phí; sự kiện tự động hợp lệ là tác nhân khởi phát nội bộ |
| [UC-24](#uc-24) | Kiểm tra và phát hành hóa đơn nội bộ | P0; chính sách phát hành tự động có điều kiện P1 | Accountant/Manager có permission phát hành hóa đơn |
| [UC-25](#uc-25) | Ghi nhận thanh toán và theo dõi công nợ | P0 | Accountant/Manager có quyền tài chính; người có quyền xem chỉ tra cứu |
| [UC-26](#uc-26) | Yêu cầu và duyệt điều chỉnh/hủy hóa đơn đã phát hành | P0: kiểm soát thủ công; P1: cấu hình tách nhiệm vụ | Accountant/Manager có quyền tạo yêu cầu; người có permission phê duyệt tài chính |
| [UC-27](#uc-27) | Tạo, chỉnh sửa và giao bài tập | P0 (gồm thông báo in-app); kênh ngoài P1 | Teacher có quyền trong lớp/học sinh được phân công |
| [UC-28](#uc-28) | Xem bài tập, nộp bài và xem trạng thái | P0 | Student được giao bài |
| [UC-29](#uc-29) | Đánh giá, chấm điểm và phản hồi bài tập | P0 | Teacher có quyền chấm trong lớp phụ trách |
| [UC-30](#uc-30) | Theo dõi tiến độ và thông tin học tập của con | P1: tổng hợp tiến độ; quyền xem lịch/học phí dùng các UC P0 | Student; Parent đã liên kết; Teacher/Manager có quyền xem |
| [UC-31](#uc-31) | Nhận thông báo và xử lý gửi thất bại | P0: in-app; P1: nhắc deadline, gửi kênh ngoài/retry | Người nhận: Student, Parent, Teacher/người liên quan theo sự kiện; người có quyền xử lý gửi lỗi |
| [UC-32](#uc-32) | Xem báo cáo tổng quan trung tâm | P0: dashboard cơ bản; P1: báo cáo nâng cao | Manager hoặc người được cấp quyền báo cáo |
| [UC-33](#uc-33) | Cấu hình chính sách nghiệp vụ, tự động hóa và phê duyệt | P1; P0 dùng baseline cố định và ghi dấu vết | Manager hoặc người được ủy quyền cấu hình chính sách |
| [UC-34](#uc-34) | Tiếp nhận và xử lý yêu cầu phê duyệt/ngoại lệ | P0: xử lý thủ công giới hạn; P1: workflow cấu hình đầy đủ | Người có permission xử lý nghiệp vụ trong tenant/lớp; Manager đủ quyền khi kiêm nhiệm |
| [UC-35](#uc-35) | Tra cứu nhật ký và giải thích quyết định | P0: ghi audit + màn hình tra cứu cơ bản; P1: mở rộng | Manager hoặc người có quyền kiểm tra nghiệp vụ tương ứng |
| [UC-36](#uc-36) | Truy cập dữ liệu theo phạm vi trung tâm | P0: tenant isolation bắt buộc; P1: quản trị tenant nâng cao | Mọi người dùng có quyền tenant; System Administrator chỉ theo quyền nền tảng cụ thể |
| [UC-37](#uc-37) | Theo dõi và xử lý tác vụ tự động | P0: kiểm tra lịch, tính phí, tạo dự thảo và chống lặp; P1: mở rộng theo chính sách | Manager/người có quyền nghiệp vụ giám sát; sự kiện/lịch chạy là trigger nội bộ |

## 3. Đặc tả chi tiết

Các tiêu chí nghiệm thu bên dưới là tập kiểm tra tối thiểu cho từng UC, kết hợp các bảo đảm chung C-01–C-10. Chúng không thay thế toàn bộ kế hoạch kiểm thử.

<a id="uc-01"></a>

### UC-01 — Đăng nhập

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Thiết lập phiên truy cập đúng tài khoản và phạm vi được cấp. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Tất cả người dùng có tài khoản |
| Kích hoạt | Người dùng chọn đăng nhập. |
| Tiền điều kiện | Có tài khoản hợp lệ; chưa cần có phiên đăng nhập. |
| Dữ liệu chính | Email và mật khẩu; ngữ cảnh tenant nếu tài khoản thuộc nhiều tenant. |
| Yêu cầu liên quan | FR-01 |
| Business Rules | BR-10, BR-14 |
| User Stories | Hỗ trợ xuyên suốt các User Stories; không có US riêng trong nguồn |

**Luồng chính**

1. Người dùng nhập thông tin đăng nhập.
2. Hệ thống kiểm tra thông tin xác thực và trạng thái hoạt động của tài khoản.
3. Hệ thống xác định các tenant và quyền hiện hành được phép truy cập.
4. Người dùng chọn ngữ cảnh được phép nếu có nhiều tenant; hệ thống tạo phiên và hiển thị chức năng tương ứng.

**Luồng thay thế và ngoại lệ**

- 2a. Sai email/mật khẩu, tài khoản không hoạt động hoặc quá giới hạn thử: không tạo phiên; giới hạn thử sai và không tiết lộ dữ liệu nhạy cảm.
- 3a. Không có quyền vào tenant được yêu cầu: từ chối truy cập tenant đó.
- 4a. System Administrator truy cập phạm vi nền tảng theo quyền riêng; không mặc định được đọc dữ liệu nghiệp vụ mọi tenant.

**Hậu điều kiện:** Thành công: có phiên hợp lệ trong phạm vi được cấp. Thất bại: không có phiên mới. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Mật khẩu ≥12 ký tự, băm Argon2id; access token 15 phút, refresh token tối đa 7 ngày có thể thu hồi. Chọn tenant được phép nếu tài khoản thuộc nhiều tenant. Không tích hợp Google Sign-In trong P0.

**Tiêu chí nghiệm thu**

- AC-01-01: Tài khoản có nhiều role nhận các quyền được cấp trong tenant đang chọn.
- AC-01-02: Đăng nhập thành công không cho phép truy cập dữ liệu tenant khác bằng cách đổi mã dữ liệu.
- AC-01-03 (P0): Đăng nhập sai quá giới hạn bị hạn chế thử tiếp; hết phiên/thu hồi token không vượt quyền tenant.

<a id="uc-02"></a>

### UC-02 — Đăng xuất

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Kết thúc phiên truy cập hiện tại. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Người dùng đã đăng nhập |
| Kích hoạt | Người dùng chọn đăng xuất. |
| Tiền điều kiện | Có phiên đăng nhập hiện tại. |
| Dữ liệu chính | Phiên truy cập hiện tại. |
| Yêu cầu liên quan | FR-01 |
| Business Rules | — |
| User Stories | Hỗ trợ xuyên suốt các User Stories; không có US riêng trong nguồn |

**Luồng chính**

1. Người dùng yêu cầu đăng xuất.
2. Hệ thống kết thúc phiên hiện tại và đưa người dùng về màn hình đăng nhập.

**Luồng thay thế và ngoại lệ**

- 1a. Phiên đã hết hạn: đưa về màn hình đăng nhập; không coi việc lặp yêu cầu là lỗi nghiệp vụ.

**Hậu điều kiện:** Phiên đã đăng xuất không còn được chấp nhận cho thao tác yêu cầu xác thực. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Đăng xuất thu hồi phiên/refresh token tương ứng; khi đổi hoặc khôi phục mật khẩu, thu hồi toàn bộ phiên cũ của tài khoản.

**Tiêu chí nghiệm thu**

- AC-02-01: Sau đăng xuất, yêu cầu dùng phiên cũ bị từ chối.

<a id="uc-03"></a>

### UC-03 — Khôi phục mật khẩu

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Khôi phục quyền đăng nhập sau khi xác minh chủ tài khoản. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Người dùng quên mật khẩu |
| Kích hoạt | Người dùng chọn quên mật khẩu. |
| Tiền điều kiện | Người dùng có thông tin khôi phục tài khoản; không cần phiên đăng nhập. |
| Dữ liệu chính | Email tài khoản, OTP khôi phục, mật khẩu mới. |
| Yêu cầu liên quan | FR-01 |
| Business Rules | — |
| User Stories | Hỗ trợ xuyên suốt các User Stories; không có US riêng trong nguồn |

**Luồng chính**

1. Người dùng nhập email và yêu cầu OTP khôi phục.
2. Backend sinh OTP một lần, lưu bản bảo vệ, gửi OTP qua dịch vụ chuyển phát email; phản hồi không làm lộ email có tài khoản hay không.
3. Người dùng nhập OTP nhận qua email và mật khẩu mới (tối thiểu 12 ký tự).
4. Backend kiểm tra OTP còn hạn/chưa dùng, giới hạn số lần nhập, cập nhật mật khẩu băm Argon2id; vô hiệu OTP và thu hồi phiên cũ; trả kết quả.

**Luồng thay thế và ngoại lệ**

- 2a. Không gửi được OTP: giữ mật khẩu cũ; thông báo không thể hoàn tất yêu cầu mà không lộ trạng thái tài khoản.
- 3a. OTP sai, quá hạn 15 phút, đã dùng hoặc quá số lần thử: từ chối đặt lại và yêu cầu OTP mới khi đủ điều kiện.
- P0 chỉ tích hợp dịch vụ chuyển phát **OTP qua email**; không dùng link reset, SMS, Gmail OAuth hoặc gửi email nghiệp vụ.

**Hậu điều kiện:** Chỉ tài khoản đã xác minh được đổi mật khẩu; không hiển thị hoặc gửi lại mật khẩu cũ. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-03-01: Xác minh thất bại không làm đổi mật khẩu.
- AC-03-02: Mật khẩu mới được bảo vệ theo NFR-04.
- AC-03-03 (P0): OTP hết hạn sau 15 phút và không sử dụng lại được; sau đổi mật khẩu, phiên cũ không còn hợp lệ.
- AC-03-04 (P0): Không lưu OTP rõ trong nhật ký và không tiết lộ tài khoản có tồn tại qua phản hồi quên mật khẩu.

<a id="uc-04"></a>

### UC-04 — Quản lý tài khoản và trạng thái hoạt động

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Tạo, tra cứu và cập nhật tài khoản phục vụ vận hành trung tâm. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Manager hoặc người được cấp quyền quản lý tài khoản |
| Kích hoạt | Người có quyền mở quản lý tài khoản. |
| Tiền điều kiện | Điều kiện chung C-01–C-04; được quản lý tài khoản trong tenant hiện tại. |
| Dữ liệu chính | Định danh, thông tin tài khoản, trạng thái hoạt động và tenant. |
| Yêu cầu liên quan | FR-02 |
| Business Rules | BR-08, BR-10, BR-14 |
| User Stories | US-03, US-18 |

**Luồng chính**

1. Người dùng tìm tài khoản hoặc chọn tạo mới.
2. Hệ thống hiển thị dữ liệu trong phạm vi được phép.
3. Người dùng nhập thông tin hoặc đổi trạng thái hoạt động.
4. Hệ thống kiểm tra dữ liệu và bảo đảm tenant hoạt động còn ít nhất một Manager hợp lệ.
5. Hệ thống lưu thay đổi và trả kết quả.

**Luồng thay thế và ngoại lệ**

- 4a. Vô hiệu hóa Manager hợp lệ cuối cùng: từ chối.
- 4b. Dữ liệu định danh không hợp lệ hoặc trùng theo quy tắc được chốt: không lưu, yêu cầu sửa.
- 3a. Gán/thu hồi role: thực hiện UC-05 với kiểm tra quyền riêng.

**Hậu điều kiện:** Tài khoản được cập nhật hợp lệ; khi thất bại giữ nguyên dữ liệu. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-04-01: Không thể làm tenant hoạt động mất Manager hợp lệ cuối cùng.
- AC-04-02: Người không có quyền không được đổi trạng thái tài khoản.

<a id="uc-05"></a>

### UC-05 — Gán nhiều vai trò và cấu hình quyền

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Phân công quyền nghiệp vụ theo tài khoản, role và phạm vi dữ liệu. |
| Ưu tiên | P0: gán role/quyền mặc định; P1: cấu hình quyền động |
| Actor/bên tương tác | Manager hoặc người được ủy quyền về phân quyền |
| Kích hoạt | Người có quyền chọn thay đổi phân quyền. |
| Tiền điều kiện | C-01–C-04; có thẩm quyền thay đổi các quyền được chọn. |
| Dữ liệu chính | Tài khoản, danh sách role, permission, phạm vi tenant/lớp/học sinh. |
| Yêu cầu liên quan | FR-03, FR-04, FR-05 |
| Business Rules | BR-08, BR-10, BR-14 |
| User Stories | US-03, US-18 |

**Luồng chính**

1. Người dùng chọn tài khoản và xem các role hiện có.
2. Người dùng gán hoặc thu hồi role và phạm vi được phép.
3. Ở P1, người có thẩm quyền sửa tập permission của role mà không sửa mã nguồn.
4. Hệ thống kiểm tra quyền nhạy cảm, giới hạn tenant và sự tồn tại của Manager hợp lệ.
5. Hệ thống lưu thay đổi, ghi audit và áp dụng quyền hiện hành cho các thao tác tiếp theo.

**Luồng thay thế và ngoại lệ**

- 4a. Người thao tác không được ủy quyền cho quyền nhạy cảm: từ chối.
- 4b. Thu hồi quyền/role khiến tenant không còn Manager hợp lệ: từ chối.
- 2a. Một người kiêm nhiệm giáo vụ và kế toán: gán nhiều role nếu được phép, không tạo tài khoản riêng bắt buộc.

**Hậu điều kiện:** Phân quyền được cập nhật có nhật ký; không tự cấp quyền vì thiếu một chức danh. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-05-01: Yêu cầu được tạo trước khi thu hồi quyền vẫn phải kiểm tra quyền hiện hành khi thực thi.
- AC-05-02: Giáo viên không thể chấm bài lớp ngoài phạm vi dù biết mã bài.

<a id="uc-06"></a>

### UC-06 — Liên kết phụ huynh với học sinh

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Thiết lập phạm vi học sinh mà phụ huynh được theo dõi. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Manager/Academic Staff có permission quản lý liên kết Parent–Student |
| Kích hoạt | Người có quyền tạo hoặc cập nhật liên kết. |
| Tiền điều kiện | C-01–C-04; tài khoản phụ huynh và hồ sơ học sinh tồn tại. |
| Dữ liệu chính | Tài khoản phụ huynh và một hoặc nhiều học sinh được xác minh. |
| Yêu cầu liên quan | FR-06, FR-04 |
| Business Rules | BR-08, BR-14 |
| User Stories | US-14 |

**Luồng chính**

1. Người dùng chọn phụ huynh.
2. Hệ thống hiển thị liên kết hiện có trong tenant.
3. Người dùng chọn học sinh và xác nhận cơ sở liên kết theo quy trình của trung tâm.
4. Hệ thống kiểm tra quyền, tenant và lưu liên kết.

**Luồng thay thế và ngoại lệ**

- 3a. Chưa đủ căn cứ liên kết: không mở quyền xem học sinh; yêu cầu bổ sung.
- 4a. Học sinh ngoài tenant/phạm vi: từ chối.
- Chỉ Manager/Academic Staff có quyền mới tạo/xác minh/thu hồi liên kết; mã mời (nếu có) không thay thế xác minh quan hệ; không tự xác nhận chỉ từ họ tên/số điện thoại.

**Hậu điều kiện:** Phụ huynh xem được đúng học sinh đã liên kết hợp lệ. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-06-01: Một phụ huynh có thể liên kết nhiều học sinh.
- AC-06-02: Liên kết phụ huynh không tự chứng minh quan hệ anh/chị/em để hưởng giảm giá.
- AC-06-03 (P0): Chỉ tài khoản được cấp quyền mới kích hoạt/thu hồi liên kết sau xác minh; Parent không thể tự gán học sinh bất kỳ.

<a id="uc-07"></a>

### UC-07 — Quản lý hồ sơ giáo viên và học sinh

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Duy trì hồ sơ phục vụ đào tạo. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Manager; người được cấp quyền quản lý hồ sơ |
| Kích hoạt | Người dùng thêm, sửa hoặc tìm kiếm hồ sơ. |
| Tiền điều kiện | C-01–C-04. |
| Dữ liệu chính | Thông tin giáo viên/học sinh; dữ liệu chuyên môn, trình độ phục vụ nghiệp vụ liên quan. |
| Yêu cầu liên quan | FR-07 |
| Business Rules | BR-08, BR-14 |
| User Stories | US-01 |

**Luồng chính**

1. Người dùng chọn loại hồ sơ và tìm kiếm hoặc tạo mới.
2. Hệ thống trả hồ sơ trong phạm vi được cấp.
3. Người dùng nhập hoặc cập nhật thông tin.
4. Hệ thống kiểm tra dữ liệu bắt buộc và lưu hồ sơ.

**Luồng thay thế và ngoại lệ**

- 4a. Dữ liệu không hợp lệ: chỉ rõ trường cần sửa; không lưu bản không hợp lệ.
- 2a. Không tìm thấy: trả danh sách rỗng, không tiết lộ hồ sơ ngoài phạm vi.
- Nguồn không yêu cầu xóa cứng hồ sơ; không bổ sung luồng xóa mặc định.

**Hậu điều kiện:** Hồ sơ được lưu và tra cứu đúng phạm vi. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-07-01: Có thể thêm, sửa và tìm hồ sơ giáo viên/học sinh.
- AC-07-02: Thông tin cá nhân bị giới hạn theo NFR-14.

<a id="uc-08"></a>

### UC-08 — Quản lý khóa học, trình độ và lớp học

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Thiết lập cấu trúc khóa học, trình độ và lớp phục vụ ghi danh/xếp lịch. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Manager; người có quyền quản lý đào tạo |
| Kích hoạt | Người dùng mở danh mục đào tạo. |
| Tiền điều kiện | C-01–C-04. |
| Dữ liệu chính | Khóa học, môn học, trình độ, lớp và sức chứa lớp. |
| Yêu cầu liên quan | FR-08 |
| Business Rules | BR-01, BR-14 |
| User Stories | US-01 |

**Luồng chính**

1. Người dùng tra cứu hoặc tạo khóa học/trình độ/lớp.
2. Người dùng nhập thông tin và các liên kết giữa lớp, khóa học, trình độ.
3. Hệ thống kiểm tra tính hợp lệ và tenant của dữ liệu liên quan.
4. Hệ thống lưu cấu hình đào tạo và hiển thị kết quả.

**Luồng thay thế và ngoại lệ**

- 3a. Thay đổi ảnh hưởng lịch hoặc sĩ số đang có: kiểm tra BR-01; không cho thao tác dẫn tới xác nhận lịch vượt sức chứa.
- 3b. Tham chiếu không tồn tại hoặc ngoài tenant: từ chối.

**Hậu điều kiện:** Danh mục đào tạo nhất quán, có thể dùng cho UC-09–UC-12. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-08-01: Lớp được gắn đúng khóa học/trình độ của tenant.
- AC-08-02: Không chấp nhận tham chiếu lớp của trung tâm khác.

<a id="uc-09"></a>

### UC-09 — Phân công giáo viên phụ trách lớp

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Gắn giáo viên phụ trách với lớp học. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Manager hoặc Academic Staff có quyền phân công |
| Kích hoạt | Người có quyền yêu cầu phân công. |
| Tiền điều kiện | C-01–C-04; lớp và giáo viên tồn tại trong tenant. |
| Dữ liệu chính | Lớp, giáo viên và phạm vi phân công. |
| Yêu cầu liên quan | FR-09 |
| Business Rules | BR-01, BR-08 |
| User Stories | US-01 |

**Luồng chính**

1. Người dùng chọn lớp và giáo viên phụ trách.
2. Hệ thống kiểm tra quyền và dữ liệu liên quan.
3. Nếu phân công tác động tới lịch đã có, hệ thống kiểm tra xung đột của giáo viên trên các buổi bị ảnh hưởng.
4. Người có quyền xác nhận; hệ thống lưu phân công.

**Luồng thay thế và ngoại lệ**

- 3a. Có xung đột: từ chối xác nhận, hiển thị các buổi cần xử lý.
- 1a. Chỉ thay giáo viên cho buổi cụ thể: dùng UC-20 tại P1.

**Hậu điều kiện:** Phân công hợp lệ được lưu; lịch không bị xác nhận với xung đột. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-09-01: Giáo viên được phân công có phạm vi lớp tương ứng theo cấu hình quyền.
- AC-09-02: Không thể tạo lịch trùng bằng cách đổi giáo viên sau khi tạo lịch.

<a id="uc-10"></a>

### UC-10 — Ghi danh, chuyển lớp và cập nhật trạng thái học tập

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Quản lý việc học sinh tham gia lớp và thay đổi lớp có kiểm soát. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Manager hoặc Academic Staff có quyền tương ứng |
| Kích hoạt | Người có quyền tạo ghi danh, chuyển lớp hoặc đổi trạng thái học tập. |
| Tiền điều kiện | C-01–C-04; học sinh và lớp tồn tại; có dữ liệu trình độ và lịch liên quan. |
| Dữ liệu chính | Học sinh, lớp nguồn/đích, trạng thái và thời điểm áp dụng dự kiến. |
| Yêu cầu liên quan | FR-10 |
| Business Rules | BR-01, BR-08, BR-09, BR-13 |
| User Stories | US-01 |

**Luồng chính**

1. Người dùng chọn học sinh và thao tác.
2. Hệ thống kiểm tra điều kiện tham gia, lịch học sinh và sức chứa lớp/phòng liên quan.
3. Hệ thống trình bày thay đổi dự kiến và các dữ liệu bị ảnh hưởng.
4. Người có quyền xác nhận; chuyển lớp không tự xác nhận mặc định.
5. Hệ thống cập nhật ghi danh/trạng thái một cách nhất quán và lưu dấu vết cần thiết.

**Luồng thay thế và ngoại lệ**

- 2a. Trùng lịch hoặc vượt sức chứa: không xác nhận.
- 2b. Thiếu dữ liệu quyết định: yêu cầu bổ sung; nếu có workflow, dùng NEEDS_INFORMATION.
- 4a. Cần phê duyệt theo chính sách: chuyển UC-34; chỉ áp dụng sau khi đủ điều kiện.
- 3a. Chuyển lớp phát sinh chênh lệch học phí: giữ hóa đơn đã phát hành; tạo yêu cầu điều chỉnh/tín dụng qua UC-26 có thẩm quyền; không sửa trực tiếp chứng từ gốc.

**Hậu điều kiện:** Ghi danh/trạng thái thay đổi đúng quyền; yêu cầu chờ duyệt chưa làm thay đổi lớp chính thức. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Trạng thái **ghi danh theo lớp**: `PENDING`, `ACTIVE`, `SUSPENDED`, `COMPLETED`, `WITHDRAWN`, `TRANSFERRED`; không đồng nhất với trạng thái hồ sơ học sinh. Chuyển lớp được xác nhận thủ công, hiệu lực từ buổi tương lai chưa diễn ra (mặc định buổi tiếp theo); bảo toàn lịch sử lớp cũ.

**Tiêu chí nghiệm thu**

- AC-10-01: Chuyển lớp không tự có hiệu lực khi mới được đề xuất.
- AC-10-02: Kiểm tra lại chỗ trống và lịch trước khi lưu, kể cả khi vừa được phê duyệt.
- AC-10-03 (P0): Chuyển lớp chỉ có hiệu lực từ buổi tương lai đã chọn, không ghi đè dữ liệu buổi đã học.

<a id="uc-11"></a>

### UC-11 — Quản lý phòng học, sức chứa và lịch bận

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Cung cấp dữ liệu tài nguyên và lịch bận cho việc kiểm tra lịch. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Manager/Academic Staff hoặc người có quyền quản lý tài nguyên |
| Kích hoạt | Người dùng tạo hoặc cập nhật phòng/lịch bận. |
| Tiền điều kiện | C-01–C-04. |
| Dữ liệu chính | Phòng, sức chứa, tài nguyên, khoảng thời gian bận và trạng thái xác nhận. |
| Yêu cầu liên quan | FR-11 |
| Business Rules | BR-01, BR-08 |
| User Stories | US-01, US-04 |

**Luồng chính**

1. Người dùng chọn phòng hoặc tài nguyên cần cập nhật.
2. Người dùng nhập sức chứa hoặc khoảng thời gian bận.
3. Hệ thống kiểm tra thời gian và các lịch đã xác nhận bị ảnh hưởng.
4. Hệ thống lưu dữ liệu hợp lệ và sử dụng trong các lần kiểm tra lịch.

**Luồng thay thế và ngoại lệ**

- 3a. Khoảng thời gian không hợp lệ: yêu cầu sửa.
- 3b. Cập nhật tạo mâu thuẫn với lịch chính thức: hiển thị lịch bị ảnh hưởng và yêu cầu xử lý qua UC-13, không âm thầm bỏ qua BR-01.

**Hậu điều kiện:** Tài nguyên/lịch bận hợp lệ được ghi nhận. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-11-01: Lịch bận đã xác nhận của giáo viên/học sinh được tính khi kiểm tra xung đột.
- AC-11-02: Phòng học trực tiếp phải đáp ứng sức chứa.

<a id="uc-12"></a>

### UC-12 — Tạo và xác nhận lịch học

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Tạo buổi học riêng lẻ hoặc lịch lặp hằng tuần không xung đột. |
| Ưu tiên | P0; đề xuất tài nguyên/khung giờ P1 |
| Actor/bên tương tác | Academic Staff hoặc Manager có quyền xếp lịch |
| Kích hoạt | Người có quyền tạo lịch. |
| Tiền điều kiện | C-01–C-04; đã có lớp, danh sách học sinh và các tài nguyên cần thiết. |
| Dữ liệu chính | Lớp, giáo viên, phòng nếu học trực tiếp, thời điểm bắt đầu/kết thúc; quy luật và phạm vi lặp. |
| Yêu cầu liên quan | FR-12, FR-13, FR-14, FR-15 |
| Business Rules | BR-01, BR-08, BR-09, BR-12, BR-13 |
| User Stories | US-04 |

**Luồng chính**

1. Người dùng nhập lịch một buổi hoặc cấu hình lặp hằng tuần.
2. Hệ thống tạo danh sách buổi dự kiến và kiểm tra từng buổi với lịch giáo viên, học sinh, phòng, lịch bận và sức chứa.
3. Hệ thống hiển thị kết quả kiểm tra để người dùng rà soát.
4. Người có quyền yêu cầu xác nhận toàn bộ chuỗi khi tất cả buổi hợp lệ (all-or-nothing); lịch một buổi được xác nhận riêng.
5. Hệ thống kiểm tra lại quyền và tính khả dụng ngay khi ghi; lưu lịch và nhật ký.

**Luồng thay thế và ngoại lệ**

- 2a. Có giao nhau theo BR-01 hoặc vượt sức chứa: chặn xác nhận các buổi vi phạm, chỉ rõ tài nguyên và thời gian.
- 2b. Ở P1, tra cứu/đề xuất giờ hoặc tài nguyên khả dụng; người dùng chọn rồi kiểm tra lại, không tự chốt đề xuất.
- 5a. Người khác vừa đặt cùng tài nguyên: từ chối xác nhận cả chuỗi tương ứng, không ghi một phần chuỗi.
- Lịch lặp tuần có ngày đầu/cuối, tối đa 6 tháng/lần tạo; chỉ xác nhận nếu cả chuỗi hợp lệ, không lưu một phần chuỗi khi gặp lỗi.

**Hậu điều kiện:** Các buổi được xác nhận không xung đột; không sinh buổi trùng do retry. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Mốc giờ lưu UTC cùng timezone tenant (mặc định `Asia/Ho_Chi_Minh`); so sánh khoảng nửa mở `[start,end)` như BR-01. Có thể đổi/hủy một buổi hoặc các buổi tương lai trong chuỗi qua UC-13.

**Tiêu chí nghiệm thu**

- AC-12-01: Hai buổi 08:00–09:00 và 09:00–10:00 không xung đột.
- AC-12-02: Hai buổi giao nhau cùng giáo viên/phòng/học sinh bị chặn; buổi CANCELLED không chiếm tài nguyên.
- AC-12-03 (P0): Một buổi vi phạm xung đột khiến toàn bộ chuỗi lặp không được xác nhận.

<a id="uc-13"></a>

### UC-13 — Thay đổi, hủy hoặc sắp xếp lại lịch học

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Điều chỉnh lịch và phản ánh đúng các tác động liên quan. |
| Ưu tiên | P0, gồm thông báo in-app; kênh thông báo ngoài ứng dụng ở P1 |
| Actor/bên tương tác | Academic Staff hoặc Manager có quyền sửa lịch |
| Kích hoạt | Người có quyền chọn buổi cần thay đổi/hủy. |
| Tiền điều kiện | C-01–C-04; buổi học tồn tại. |
| Dữ liệu chính | Buổi học, thông tin thay đổi, lý do và tác động đến các đăng ký liên quan. |
| Yêu cầu liên quan | FR-13, FR-14, FR-16; FR-37 (P0 in-app/P1 kênh ngoài) |
| Business Rules | BR-01, BR-03, BR-04, BR-08, BR-12 |
| User Stories | US-04 |

**Luồng chính**

1. Người dùng chọn buổi và thao tác đổi lịch/hủy/sắp xếp lại.
2. Hệ thống hiển thị học sinh, giáo viên và các đăng ký học bù bị ảnh hưởng.
3. Với lịch mới, hệ thống kiểm tra lại xung đột và sức chứa.
4. Người có quyền xác nhận; hệ thống cập nhật lịch, giải phóng tài nguyên của buổi hủy và lưu audit.
5. Hệ thống chuyển tác động tính phí sang UC-23/UC-26; sau khi thay đổi lịch được xác nhận và lưu thành công, tạo thông báo in-app cho người liên quan qua UC-31 (P0). Gửi kênh ngoài nếu có được mở rộng ở P1.

**Luồng thay thế và ngoại lệ**

- 3a. Lịch mới vi phạm BR-01: từ chối; giữ nguyên lịch cũ.
- 4a. Trung tâm hủy buổi: số buổi tính phí của buổi đó là 0.
- 4b. Trung tâm hủy buổi học bù: cho sắp lại trong hạn còn lại; hết hạn do trung tâm thì chuyển duyệt ngoại lệ.
- 5a. Hóa đơn đã phát hành: không sửa trực tiếp; dùng UC-26.

**Hậu điều kiện:** Lịch mới/hủy được lưu có dấu vết; thông báo lỗi không làm đảo ngược thay đổi lịch đã hoàn tất. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Khi áp dụng cho chuỗi lặp chỉ thay một buổi hoặc những buổi **tương lai**; dùng timezone tenant, không sửa lịch sử. P0 chỉ thông báo in-app; không gọi Google Calendar, email thông báo hay FCM.

**Tiêu chí nghiệm thu**

- AC-13-01: Hủy buổi giải phóng tài nguyên và không tự chỉnh hóa đơn đã phát hành.
- AC-13-02: Thay lịch phải kiểm tra cả xung đột học sinh.

<a id="uc-14"></a>

### UC-14 — Xem lịch học và lịch dạy

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Tra cứu lịch theo ngày/tuần và vai trò trong phạm vi được cấp. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Teacher, Student, Parent; Manager/Academic Staff có quyền xem |
| Kích hoạt | Người dùng mở lịch. |
| Tiền điều kiện | C-01–C-04; phụ huynh có liên kết hợp lệ khi xem lịch con. |
| Dữ liệu chính | Khoảng ngày/tuần, đối tượng/lớp được phép. |
| Yêu cầu liên quan | FR-17, FR-04, FR-06 |
| Business Rules | BR-14 |
| User Stories | US-04, US-10, US-13, US-14 |

**Luồng chính**

1. Người dùng chọn chế độ ngày hoặc tuần và bộ lọc.
2. Hệ thống xác định phạm vi lịch theo quyền hiện hành và quan hệ phụ huynh–học sinh.
3. Hệ thống trả các buổi phù hợp và trạng thái lịch.
4. Người dùng mở chi tiết một buổi trong phạm vi được phép.

**Luồng thay thế và ngoại lệ**

- 3a. Không có lịch: hiển thị trạng thái rỗng.
- 4a. Chi tiết ngoài phạm vi: từ chối, không trả dữ liệu.

**Hậu điều kiện:** Lịch được hiển thị; không thay đổi dữ liệu. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-14-01: Giáo viên thấy lịch được phân công; học sinh thấy lịch của mình.
- AC-14-02: Phụ huynh chỉ xem lịch học sinh liên kết hợp lệ.

<a id="uc-15"></a>

### UC-15 — Điểm danh và xác nhận kết quả tham gia

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Ghi nhận tham gia từng buổi làm căn cứ chuyên cần và tính phí. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Teacher phụ trách buổi/lớp và có quyền điểm danh |
| Kích hoạt | Giáo viên mở danh sách điểm danh. |
| Tiền điều kiện | C-01–C-04; buổi và danh sách tham gia hợp lệ tồn tại. |
| Dữ liệu chính | Buổi học, học sinh chính thức/học bù, trạng thái tham gia và đơn nghỉ đã duyệt. |
| Yêu cầu liên quan | FR-18, FR-04 |
| Business Rules | BR-02, BR-03, BR-04, BR-08 |
| User Stories | US-10 |

**Luồng chính**

1. Giáo viên chọn buổi được phân công.
2. Hệ thống tải danh sách tham gia; ở P1 gồm học sinh học bù nhưng không nhập họ vào danh sách chính thức lớp đích.
3. Giáo viên ghi nhận ATTENDED hoặc UNEXCUSED; EXCUSED phải dựa trên đơn nghỉ đã được chấp thuận.
4. Giáo viên kiểm tra và xác nhận điểm danh theo thẩm quyền.
5. Hệ thống lưu kết quả và dấu hiệu đã xác nhận, cung cấp dữ liệu cho tính phí.

**Luồng thay thế và ngoại lệ**

- 3a. Có đơn nghỉ muộn chưa được duyệt ngoại lệ: không tự gán EXCUSED.
- 4a. Chưa xác nhận điểm danh: dữ liệu chưa đủ để chốt bảng kê tự động.
- 5a. Sửa điểm danh tác động hóa đơn đã phát hành: chỉ xử lý học phí qua UC-26.
- Điểm danh thông thường khóa sau 48 giờ từ khi kết thúc buổi hoặc ngay khi đã phát hành hóa đơn sử dụng dữ liệu đó, tùy mốc trước; chỉ permission điều chỉnh điểm danh được sửa sau khóa kèm lý do/audit.

**Hậu điều kiện:** Điểm danh được lưu; trạng thái tham gia và trạng thái xác nhận được phân biệt. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Teacher có quyền ghi/xác nhận trong/sau buổi. Quá hạn mà chưa xác nhận thì Manager/Academic Staff có permission xử lý; không tự xác nhận thay giáo viên. Nếu học sinh nghỉ có phép nhưng thực tế tham dự thì `ATTENDED` ghi đè `EXCUSED`, tính 1 và không phát sinh quyền học bù.

**Tiêu chí nghiệm thu**

- AC-15-01: ATTENDED và UNEXCUSED tính 1; EXCUSED và buổi trung tâm hủy tính 0.
- AC-15-02: Giáo viên ngoài phạm vi không được ghi hoặc sửa điểm danh.
- AC-15-03 (P0): Điểm danh đã khóa không sửa được bởi giáo viên thông thường; sửa đặc biệt phải có permission, lý do, audit và điều chỉnh hóa đơn riêng nếu cần.

<a id="uc-16"></a>

### UC-16 — Ghi nhận và xử lý đơn xin nghỉ học

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Ghi nhận lý do nghỉ và xác định nghỉ có phép đúng điều kiện. |
| Ưu tiên | P0; cấu hình workflow nâng cao P1 |
| Actor/bên tương tác | Student hoặc Parent đã liên kết gửi đơn; Manager/Academic Staff có permission duyệt và xử lý ngoại lệ |
| Kích hoạt | Có yêu cầu xin nghỉ một buổi học. |
| Tiền điều kiện | C-01–C-04; học sinh có quyền tham gia buổi học liên quan. |
| Dữ liệu chính | Học sinh, buổi gốc, lý do, thời điểm gửi và thông tin bổ sung. |
| Yêu cầu liên quan | FR-19, FR-18; FR-44 (P1) |
| Business Rules | BR-04, BR-08, BR-09, BR-11, BR-14 |
| User Stories | Hỗ trợ xuyên suốt các User Stories; không có US riêng trong nguồn |

**Luồng chính**

1. Student/Parent đã liên kết tạo đơn nghỉ và nêu lý do; nhân sự được cấp quyền có thể ghi nhận hộ.
2. Hệ thống ghi thời điểm gửi và so với giờ bắt đầu buổi học.
3. Hệ thống xác định đơn gửi trước ít nhất 24 giờ hay cần duyệt ngoại lệ do nộp muộn.
4. Người có quyền xem xét và chấp thuận theo chính sách áp dụng; P0 không mặc định tự duyệt.
5. Hệ thống lưu quyết định; chỉ khi được chấp thuận mới ghi nhận EXCUSED và dùng làm căn cứ tính phí/quyền học bù.

**Luồng thay thế và ngoại lệ**

- 3a. Gửi muộn hơn mốc 24 giờ: phải được người có quyền duyệt ngoại lệ mới thành EXCUSED.
- 4a. Thiếu dữ liệu: NEEDS_INFORMATION; không mặc định chấp thuận.
- 4b. Bị từ chối: không xác lập nghỉ có phép; trạng thái thực tế do điểm danh xác định.
- Người gửi đơn không được tự phê duyệt; nghỉ muộn vẫn cần người có permission duyệt ngoại lệ, không tự xác nhận EXCUSED.

**Hậu điều kiện:** Đơn và quyết định có dấu vết; đơn chờ xử lý không tự tạo EXCUSED. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-16-01: Gửi đúng 24 giờ trước buổi học và được chấp thuận đáp ứng nghỉ có phép.
- AC-16-02: Gửi trước 23 giờ dù có lý do vẫn phải qua duyệt ngoại lệ.
- AC-16-03 (P0): Parent chỉ gửi đơn cho con đã liên kết; người gửi không tự duyệt đơn.

<a id="uc-17"></a>

### UC-17 — Tìm, đăng ký và sắp xếp lại học bù

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Sử dụng đúng một quyền học bù cho buổi nghỉ có phép đã duyệt. |
| Ưu tiên | P1 |
| Actor/bên tương tác | Student/Parent gửi yêu cầu; Academic Staff/Manager có permission đăng ký/xác nhận học bù và ngoại lệ |
| Kích hoạt | Người có quyền yêu cầu tìm hoặc đăng ký học bù. |
| Tiền điều kiện | C-01–C-04; có buổi nghỉ EXCUSED đã duyệt, quyền học bù chưa sử dụng/đóng. |
| Dữ liệu chính | Buổi nghỉ gốc, học sinh, môn, trình độ, nội dung, ngày học và số chỗ còn lại. |
| Yêu cầu liên quan | FR-20, FR-21 |
| Business Rules | BR-01, BR-02, BR-03, BR-04, BR-08, BR-09, BR-12 |
| User Stories | US-05 |

**Luồng chính**

1. Student/Parent hoặc người có quyền gửi yêu cầu, chọn buổi nghỉ gốc hợp lệ.
2. Hệ thống kiểm tra quyền học bù và hạn 30 ngày tính từ ngày học gốc.
3. Hệ thống tìm buổi cùng môn, trình độ tương đương, nội dung tương đương, còn chỗ và không trùng lịch học sinh.
4. Người dùng chọn buổi; hệ thống xác định yêu cầu có cần người có quyền phê duyệt theo chính sách.
5. Khi đủ xác nhận cần thiết, hệ thống kiểm tra lại chỗ, lịch và quyền học bù; lưu đăng ký cùng liên kết buổi gốc trong một giao dịch.
6. Kết quả điểm danh học bù cập nhật việc sử dụng quyền và căn cứ tính phí theo BR-03/BR-04.

**Luồng thay thế và ngoại lệ**

- 3a. Chưa xác định nội dung tương đương: chuyển người có quyền duyệt, không tự khẳng định tương đương.
- 3b. Không có buổi phù hợp hoặc có xung đột/vượt sức chứa: không đăng ký; tìm phương án khác.
- 5a. Người dùng đổi lịch trước khi buổi học bù diễn ra: kiểm tra toàn bộ điều kiện rồi thay đăng ký; không tạo thêm quyền.
- 6a. Đã tham dự hoặc vắng không phép: đóng quyền học bù; buổi thay thế tính 1, buổi gốc vẫn 0.
- 6b. Trung tâm hủy buổi học bù: tính 0; được sắp lại trong hạn còn lại; hết hạn do trung tâm chuyển duyệt ngoại lệ.
- 5b. Đăng ký đồng thời hoặc retry: không chiếm hai chỗ hoặc tạo hai lượt sử dụng cho cùng quyền.

**Hậu điều kiện:** Có đăng ký hợp lệ gắn buổi gốc; không thay danh sách chính thức lớp đích, không tính phí hai lần. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Nội dung tương đương phải cùng môn, trình độ và bài học/mục tiêu tương đương; không chắc chắn -> chuyển người có permission xem xét. Hạn học bù kết thúc cuối ngày thứ 30 từ ngày gốc theo timezone tenant. Nghỉ có phép tại buổi bù có thể đổi lịch trong hạn gốc, không tạo thêm lượt hoặc gia hạn tự động; vắng không phép đóng quyền.

**Tiêu chí nghiệm thu**

- AC-17-01: Một buổi nghỉ chỉ có tối đa một lượt học bù được sử dụng.
- AC-17-02: Học bù phải đáp ứng đồng thời môn/trình độ/nội dung, lịch, sức chứa và thời hạn.
- AC-17-03: Học bù UNEXCUSED đã giữ chỗ đóng quyền và tính 1; trung tâm hủy thì tính 0.

<a id="uc-18"></a>

### UC-18 — Yêu cầu và phê duyệt bảo lưu

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Tạm dừng học có thời hạn và bảo toàn phần học phí chưa sử dụng theo quy tắc. |
| Ưu tiên | P1 |
| Actor/bên tương tác | Student/Parent gửi yêu cầu; người có permission bảo lưu phê duyệt |
| Kích hoạt | Người có quyền tạo yêu cầu bảo lưu. |
| Tiền điều kiện | C-01–C-04; học sinh có hồ sơ học tập và dữ liệu học phí liên quan. |
| Dữ liệu chính | Học sinh, ngày bắt đầu/kết thúc, lý do và các khoản đã trả/buổi chưa sử dụng. |
| Yêu cầu liên quan | FR-22, FR-23 |
| Business Rules | BR-05, BR-08, BR-09, BR-11, BR-14 |
| User Stories | US-06 |

**Luồng chính**

1. Student/Parent hoặc nhân sự được cấp quyền nhập khoảng bảo lưu và lý do.
2. Hệ thống kiểm tra dữ liệu, hiển thị các buổi và học phí bị ảnh hưởng.
3. Hệ thống chuyển yêu cầu cho người có quyền phê duyệt qua UC-34.
4. Sau phê duyệt, hệ thống kiểm tra lại điều kiện và ghi nhận thời gian/trạng thái bảo lưu.
5. Hệ thống loại các buổi phát sinh trong khoảng bảo lưu khỏi số buổi tính phí; phần đã đóng cho buổi chưa sử dụng được ghi nhận thành tín dụng học phí theo dữ liệu được đối soát.

**Luồng thay thế và ngoại lệ**

- 2a. Khoảng ngày không hợp lệ hoặc thiếu căn cứ xác định khoản chưa sử dụng: yêu cầu bổ sung.
- 3a. Chưa có người duyệt: giữ PENDING_APPROVAL, thông báo Manager, không tự áp dụng.
- 3b. Từ chối: giữ trạng thái học tập hiện tại.
- 5a. Có tác động tới hóa đơn đã phát hành hoặc yêu cầu hoàn/điều chỉnh tiền: dùng UC-26; không tự hoàn tiền.
- Tín dụng bằng phần **đã thu thực tế** phân bổ cho buổi chưa sử dụng sau ưu đãi; ưu tiên phân bổ tiền đã thu cho buổi đã dùng, không sinh tín dụng trên khoản chưa thu.

**Hậu điều kiện:** Bảo lưu có hiệu lực sau duyệt; tín dụng có căn cứ, không tự phát sinh hoàn tiền. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Không cho bảo lưu chồng lấn; thay đổi khoảng phải duyệt lại. Tín dụng không tự hết hạn, chỉ dùng trong tenant cho chính học sinh và chỉ khấu trừ học phí tương lai sau khi áp dụng ưu đãi; không tự hoàn tiền.

**Tiêu chí nghiệm thu**

- AC-18-01: Yêu cầu chưa được duyệt chưa làm ngừng tính phí.
- AC-18-02: Trong thời gian bảo lưu đã được duyệt không tính buổi học phát sinh cho học sinh.
- AC-18-03 (P1): Tín dụng không vượt phần tiền thực tế đã thanh toán được phân bổ cho các buổi chưa sử dụng.

<a id="uc-19"></a>

### UC-19 — Tiếp nhận học sinh quay lại sau bảo lưu

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Khôi phục việc học và sử dụng tín dụng học phí còn lại. |
| Ưu tiên | P1 |
| Actor/bên tương tác | Academic Staff/Manager có quyền xếp lớp; người có quyền tài chính khi khấu trừ tín dụng |
| Kích hoạt | Học sinh quay lại sau bảo lưu. |
| Tiền điều kiện | C-01–C-04; có hồ sơ bảo lưu và dữ liệu tín dụng nếu có. |
| Dữ liệu chính | Học sinh, trình độ hiện tại, lớp dự kiến, ngày quay lại và tín dụng còn lại. |
| Yêu cầu liên quan | FR-23 |
| Business Rules | BR-01, BR-05, BR-08, BR-13 |
| User Stories | US-06 |

**Luồng chính**

1. Người dùng mở hồ sơ bảo lưu và xác nhận nhu cầu quay lại.
2. Hệ thống hiển thị trình độ, lịch, lớp phù hợp và tín dụng còn lại.
3. Người dùng chọn lớp; hệ thống kiểm tra trình độ, lịch và sức chứa.
4. Người có quyền xác nhận xếp lớp/cập nhật trạng thái; hệ thống ghi nhận việc trở lại học.
5. Khi lập học phí tương lai, hệ thống khấu trừ tín dụng có căn cứ và lưu lịch sử sử dụng.

**Luồng thay thế và ngoại lệ**

- 3a. Không có lớp phù hợp: giữ yêu cầu chờ xử lý; không tự xếp lớp vượt điều kiện.
- 5a. Không còn tín dụng: học phí tương lai tính theo chính sách thông thường.
- 5b. Retry khấu trừ: không dùng một khoản tín dụng nhiều lần.
- Trở lại trước hạn phải được người có permission xác nhận và kết thúc/điều chỉnh bảo lưu trước khi xếp lớp; tính giá và ưu đãi hợp lệ trước rồi trừ tín dụng, không tự hoàn tiền.

**Hậu điều kiện:** Học sinh có lớp hợp lệ và lịch sử tín dụng nhất quán. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-19-01: Không xếp lại lớp nếu trùng lịch hoặc vượt sức chứa.
- AC-19-02: Tín dụng chỉ được sử dụng đến giá trị còn lại, không tự hoàn thành tiền mặt.
- AC-19-03 (P1): Tín dụng áp dụng sau ưu đãi hợp lệ và không khiến số tiền còn phải nộp âm.

<a id="uc-20"></a>

### UC-20 — Đề xuất và xác nhận giáo viên dạy thay

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Bố trí người dạy thay đủ điều kiện và đủ xác nhận. |
| Ưu tiên | P1 |
| Actor/bên tương tác | Academic Staff/Manager có quyền phân công; Teacher được đề xuất nhận dạy thay |
| Kích hoạt | Giáo viên chính vắng một buổi cần bố trí dạy thay. |
| Tiền điều kiện | C-01–C-04; buổi học và nhu cầu dạy thay được xác định. |
| Dữ liệu chính | Buổi học, môn/trình độ, giáo viên ứng viên, khả dụng và giới hạn phân công. |
| Yêu cầu liên quan | FR-24 |
| Business Rules | BR-01, BR-07, BR-08, BR-09, BR-13 |
| User Stories | US-07 |

**Luồng chính**

1. Người có quyền tạo yêu cầu dạy thay cho buổi cụ thể.
2. Hệ thống đề xuất giáo viên cùng tenant, đúng chuyên môn/cấp độ, rảnh toàn buổi và không vượt giới hạn phân công.
3. Người xử lý chọn ứng viên; giáo viên được đề xuất xác nhận nhận lớp.
4. Người có quyền kiểm tra và xác nhận phân công theo baseline.
5. Hệ thống kiểm tra lại điều kiện, cập nhật lịch chính thức, ghi nhật ký và tạo thông báo.

**Luồng thay thế và ngoại lệ**

- 2a. Không có người phù hợp: tạo ngoại lệ để người có quyền đổi/hủy lịch qua UC-13.
- 3a. Giáo viên từ chối hoặc chưa xác nhận: không cập nhật lịch; tiếp tục tìm ứng viên hoặc chờ xử lý.
- 5a. Ứng viên phát sinh xung đột: từ chối thực hiện, tìm phương án khác.
- Baseline P1 **không tự xác nhận dạy thay**: Teacher nhận lớp, sau đó người được cấp permission xác nhận; chỉ đổi quy trình nếu có sửa/duyệt quy tắc BR-07/BR-13 trong phiên bản tương lai.

**Hậu điều kiện:** Chỉ phân công chính thức khi đủ điều kiện và xác nhận; đề xuất chưa làm thay đổi lịch. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Giới hạn phân công baseline: tối đa 8 giờ/ngày, 40 giờ/tuần trong lịch xác nhận của tenant; giáo viên đúng môn/cấp độ và khả dụng toàn buổi. Gợi ý không đồng nghĩa phân công chính thức.

**Tiêu chí nghiệm thu**

- AC-20-01: Giáo viên chưa nhận lớp không được phân công chính thức theo baseline.
- AC-20-02: Không tự chọn giáo viên thiếu năng lực khi không tìm thấy ứng viên.
- AC-20-03 (P1): Không chốt dạy thay khi vượt giờ giới hạn dù không có xung đột lịch.

<a id="uc-21"></a>

### UC-21 — Cấu hình đơn giá học phí

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Xác định đơn giá áp dụng cho khóa học, lớp hoặc buổi học. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Accountant/Manager hoặc người có quyền cấu hình đơn giá |
| Kích hoạt | Người có quyền thiết lập hoặc cập nhật đơn giá. |
| Tiền điều kiện | C-01–C-04; đối tượng áp dụng tồn tại. |
| Dữ liệu chính | Phạm vi khóa/lớp/buổi, đơn giá và thời điểm hiệu lực. |
| Yêu cầu liên quan | FR-25 |
| Business Rules | BR-06, BR-08, BR-14 |
| User Stories | US-08 |

**Luồng chính**

1. Người dùng chọn phạm vi áp dụng và nhập đơn giá.
2. Hệ thống kiểm tra dữ liệu, tenant và thời điểm hiệu lực.
3. Người có quyền xác nhận lưu; hệ thống ghi dấu vết cấu hình đã áp dụng.
4. Các khoản tính phí mới sử dụng mức giá có hiệu lực tại thời điểm lập khoản tính phí.

**Luồng thay thế và ngoại lệ**

- 2a. Có nhiều mức giá có hiệu lực: chọn theo thứ tự **buổi học → lớp học → khóa học**, ghi căn cứ; nếu cùng mức ưu tiên còn mâu thuẫn thì cần bổ sung/sửa dữ liệu.
- 4a. Giá mới khác giá hóa đơn đã phát hành: không tính lại hóa đơn cũ; điều chỉnh qua UC-26 nếu được ủy quyền.

**Hậu điều kiện:** Đơn giá có phạm vi và hiệu lực rõ ràng; lịch sử khoản tính phí được bảo toàn. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-21-01: Không cập nhật hồi tố hóa đơn đã phát hành khi đổi giá.
- AC-21-02 (P0): Khi đồng thời có giá buổi, lớp, khóa, hệ thống ưu tiên giá theo buổi; giá đã dùng được lưu với khoản tính phí.

<a id="uc-22"></a>

### UC-22 — Áp dụng và cấu hình chính sách giảm giá

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Áp dụng đúng điều kiện, tỷ lệ và thứ tự giảm giá. |
| Ưu tiên | P0: một loại ưu đãi; P1: kết hợp và cấu hình |
| Actor/bên tương tác | Accountant/Manager có quyền tương ứng |
| Kích hoạt | Khoản học phí được tính hoặc người có quyền cấu hình ưu đãi ở P1. |
| Tiền điều kiện | C-01–C-04; có khoản tính phí và căn cứ về điều kiện hưởng ưu đãi. |
| Dữ liệu chính | Giá gốc, ghi danh, quan hệ anh/chị/em đã xác minh, gói trả trước và phiên bản chính sách. |
| Yêu cầu liên quan | FR-27, FR-28 |
| Business Rules | BR-06, BR-08, BR-14 |
| User Stories | US-08 |

**Luồng chính**

1. Hệ thống xác định chính sách có hiệu lực khi lập khoản tính phí.
2. Hệ thống kiểm tra điều kiện: anh/chị/em đã xác minh và ghi danh hợp lệ cùng tenant; combo phải đóng trước đủ 6 tháng.
3. P0 chỉ áp dụng **anh/chị/em 10%** nếu đã xác minh; không áp dụng combo ở P0. P1 nếu đủ cả hai thì giảm combo 5% trước, anh/chị/em 10% trên phần còn lại.
4. Hệ thống làm tròn kết quả cuối đến đồng Việt Nam, bảo đảm không âm và hiển thị từng bước giảm.
5. Ở P1, người có quyền có thể cấu hình ưu đãi/hiệu lực qua UC-33; không thay đổi kết quả hóa đơn đã phát hành.

**Luồng thay thế và ngoại lệ**

- 2a. Chưa xác minh quan hệ hoặc không đủ điều kiện: không áp dụng ưu đãi đó; chỉ rõ căn cứ còn thiếu.
- 3a. Có ưu đãi khác chưa có chính sách phối hợp: không cộng dồn tùy ý.
- Nếu người học đủ cả hai điều kiện trong P0 thì vẫn chỉ áp dụng 10% anh/chị/em; combo/kết hợp ở P1 theo BR-06.

**Hậu điều kiện:** Kết quả giảm giá có thể giải thích và truy vết về điều kiện/chính sách. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-22-01: P1: 1.000.000 × 0,95 × 0,90 = 855.000 đồng; không giảm trực tiếp 15%.
- AC-22-02: Gói trả trước dưới 6 tháng không đủ điều kiện combo.
- AC-22-03 (P0): Học phí 1.000.000đ đủ điều kiện anh/chị/em và combo tương lai thì P0 tính 900.000đ, không áp dụng 5% combo.

<a id="uc-23"></a>

### UC-23 — Tính học phí và tạo bảng kê/hóa đơn dự thảo

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Tạo dự thảo chi tiết có căn cứ, chưa phát sinh việc phát hành tự động. |
| Ưu tiên | P0; phần học bù/bảo lưu/kết hợp ưu đãi P1 |
| Actor/bên tương tác | Accountant/Manager có quyền yêu cầu tính phí; sự kiện tự động hợp lệ là tác nhân khởi phát nội bộ |
| Kích hoạt | Người có quyền yêu cầu tính phí hoặc tác vụ tính phí đến hạn theo cấu hình. |
| Tiền điều kiện | Tenant hợp lệ; người/sự kiện gọi hợp lệ; có dữ liệu học sinh, lịch, đơn giá và chính sách. |
| Dữ liệu chính | Kỳ/phạm vi tính phí, điểm danh đã xác nhận, đơn nghỉ, đơn giá, ưu đãi; P1 có học bù, bảo lưu và tín dụng. |
| Yêu cầu liên quan | FR-26, FR-27, FR-29, FR-45 |
| Business Rules | BR-03, BR-04, BR-05, BR-06, BR-09, BR-12, BR-13, BR-14 |
| User Stories | US-08 |

**Luồng chính**

1. Hệ thống xác định phạm vi tính phí, mã chống lặp và phiên bản chính sách.
2. Hệ thống kiểm tra tính đầy đủ và trạng thái xác nhận điểm danh.
3. Hệ thống phân loại từng buổi: ATTENDED/UNEXCUSED = 1; EXCUSED/trung tâm hủy = 0; áp dụng các quy tắc P1 nếu đã triển khai.
4. Hệ thống áp dụng đơn giá và giảm giá hợp lệ; trình bày chi tiết số buổi, căn cứ, số tiền và điều chỉnh/tín dụng nếu có chính sách đã chốt.
5. Hệ thống lưu dự thảo, phiên bản chính sách và dấu vết tính toán.
6. Hệ thống trả dự thảo để người có quyền kiểm tra; phát hành qua UC-24.

**Luồng thay thế và ngoại lệ**

- 2a. Chưa xác nhận điểm danh, thiếu đơn giá hoặc dữ liệu: NEEDS_INFORMATION; không tự chốt dự thảo hoàn tất bằng cách coi dữ liệu thiếu là 0.
- 3a. P1: buổi gốc EXCUSED vẫn 0; học bù đã thực hiện/UNEXCUSED đã giữ chỗ tính 1 hoặc trừ quyền theo gói thích hợp; không tính hai lần.
- 3b. P1: buổi trong khoảng bảo lưu không phát sinh số buổi tính phí.
- 5a. Lỗi tạm thời: xử lý theo UC-37, retry cùng khóa không sinh thêm hóa đơn.
- 5b. Đã có hóa đơn phát hành liên quan: không ghi đè; sai lệch phải qua UC-26.

**Hậu điều kiện:** Có dự thảo có căn cứ hoặc yêu cầu bổ sung rõ lý do; P0 không tự phát hành. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- P0 tính theo kỳ tháng, dự thảo kỳ trước được lập đầu tháng sau khi điểm danh đã xác nhận; hạn thanh toán 7 ngày từ khi phát hành. Ưu tiên đơn giá buổi → lớp → khóa, làm tròn `ROUND_HALF_UP` một lần tại cuối công thức đến đồng. Gói trả trước 6 tháng/phân bổ gói là P1.

**Tiêu chí nghiệm thu**

- AC-23-01: Chưa xác nhận điểm danh thì không chốt bảng kê tự động.
- AC-23-02: Retry cùng yêu cầu không tạo thêm hóa đơn.
- AC-23-03: Dự thảo hiển thị số buổi tính phí và chính sách dùng để tính.

<a id="uc-24"></a>

### UC-24 — Kiểm tra và phát hành hóa đơn nội bộ

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Phát hành chứng từ học phí nội bộ sau kiểm tra/xác nhận đúng quyền. |
| Ưu tiên | P0; chính sách phát hành tự động có điều kiện P1 |
| Actor/bên tương tác | Accountant/Manager có permission phát hành hóa đơn |
| Kích hoạt | Người có quyền mở dự thảo để phát hành. |
| Tiền điều kiện | C-01–C-04; có dự thảo đầy đủ, dữ liệu tính phí hợp lệ. |
| Dữ liệu chính | Hóa đơn dự thảo, chi tiết tính phí, chính sách và thông tin phê duyệt nếu cần. |
| Yêu cầu liên quan | FR-29 |
| Business Rules | BR-08, BR-09, BR-11, BR-13, BR-14 |
| User Stories | US-08, US-09 |

**Luồng chính**

1. Người dùng xem dự thảo và các căn cứ tính phí.
2. Hệ thống kiểm tra quyền tài chính hiện hành, tenant và các điều kiện phát hành.
3. Người có quyền xác nhận phát hành; nếu chính sách yêu cầu phê duyệt riêng thì thực hiện UC-34.
4. Hệ thống kiểm tra lại điều kiện và ghi nhận hóa đơn đã phát hành cùng người/thời điểm xác nhận.
5. Hệ thống đưa hóa đơn vào theo dõi thanh toán/công nợ và chặn sửa trực tiếp.

**Luồng thay thế và ngoại lệ**

- 2a. Thiếu dữ liệu hoặc dữ liệu nguồn thay đổi làm dự thảo không còn hợp lệ: dừng, yêu cầu rà soát; không phát hành số tiền chưa xác thực.
- 3a. Người kiểm tra yêu cầu sửa dự thảo: trở về UC-23, giữ lịch sử cần thiết.
- 4a. Yêu cầu lặp cho hóa đơn đã phát hành: trả kết quả hiện có; không tạo hóa đơn mới.
- P1 chỉ tự phát hành khi tenant bật chính sách rủi ro thấp đáp ứng BR-09/BR-14; P0 invoice_auto_issue=false.

**Hậu điều kiện:** Hóa đơn nội bộ đã phát hành có dấu vết; không còn được sửa trực tiếp. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-24-01: Tạo dự thảo thành công không đồng nghĩa đã phát hành.
- AC-24-02: Người chỉ có quyền xem hóa đơn không được phát hành.

<a id="uc-25"></a>

### UC-25 — Ghi nhận thanh toán và theo dõi công nợ

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Ghi nhận khoản thanh toán và phản ánh công nợ nhất quán. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Accountant/Manager có quyền tài chính; người có quyền xem chỉ tra cứu |
| Kích hoạt | Có khoản thanh toán cần ghi nhận hoặc người dùng tra cứu công nợ. |
| Tiền điều kiện | C-01–C-04; tồn tại học sinh/hóa đơn hoặc khoản phải thu hợp lệ được đối soát. |
| Dữ liệu chính | Khoản phải thu, số tiền, thời điểm thanh toán, thông tin đối soát và định danh chống ghi trùng. |
| Yêu cầu liên quan | FR-30 |
| Business Rules | BR-08, BR-12, BR-14 |
| User Stories | US-09, US-14 |

**Luồng chính**

1. Người dùng mở hóa đơn và xem số phải thu, đã thanh toán, còn nợ.
2. Người có quyền nhập khoản thanh toán và thông tin đối soát.
3. Hệ thống kiểm tra dữ liệu, quyền, tenant và dấu hiệu giao dịch trùng.
4. Hệ thống ghi khoản thanh toán và cập nhật số dư/công nợ trong cùng giao dịch.
5. Hệ thống trả kết quả và lịch sử thanh toán.

**Luồng thay thế và ngoại lệ**

- 1a. Chỉ tra cứu: trả dữ liệu theo quyền, không thay đổi khoản thu.
- 3a. Gửi lại cùng khoản thanh toán đã xử lý: không cộng tiền lần thứ hai.
- 3b. P0 chỉ nhận thanh toán tiền mặt/chuyển khoản nhập thủ công cho **một hóa đơn**; từ chối khoản vượt công nợ còn lại, không chia một khoản sang nhiều hóa đơn.
- 4a. Cập nhật công nợ thất bại: không để thanh toán và công nợ lệch nhau; rollback hoặc phục hồi nhất quán.

**Hậu điều kiện:** Khoản thu và công nợ khớp nhau; có dữ liệu truy vết. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Ghi nhận tiền mặt hoặc chuyển khoản đã được người có permission xác minh bằng đối soát thủ công; cho phép thu một phần, kiểm tra trùng. Không kết nối ngân hàng/cổng thanh toán. Bản ghi khoản thu sai được **đảo/điều chỉnh** có lý do/audit, không xóa lịch sử. P1 có phân bổ nhiều hóa đơn và xử lý tín dụng trả thừa.

**Tiêu chí nghiệm thu**

- AC-25-01: Retry không ghi nhận trùng thanh toán.
- AC-25-02: Giao dịch thất bại không được ghi nhận thu tiền một phần nhưng công nợ chưa cập nhật.

<a id="uc-26"></a>

### UC-26 — Yêu cầu và duyệt điều chỉnh/hủy hóa đơn đã phát hành

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Điều chỉnh chứng từ đã phát hành qua quy trình có kiểm soát, giữ lịch sử. |
| Ưu tiên | P0: kiểm soát thủ công; P1: cấu hình tách nhiệm vụ |
| Actor/bên tương tác | Accountant/Manager có quyền tạo yêu cầu; người có permission phê duyệt tài chính |
| Kích hoạt | Phát hiện sai lệch hoặc có yêu cầu điều chỉnh/hủy hóa đơn. |
| Tiền điều kiện | C-01–C-04; hóa đơn đã phát hành và người tạo có quyền lập yêu cầu. |
| Dữ liệu chính | Hóa đơn gốc, thay đổi đề nghị, lý do, chứng cứ và tác động công nợ/thanh toán. |
| Yêu cầu liên quan | FR-31, FR-41; FR-44 (P1) |
| Business Rules | BR-05, BR-08, BR-09, BR-11, BR-13, BR-14 |
| User Stories | US-08, US-09 |

**Luồng chính**

1. Người dùng lập yêu cầu điều chỉnh/hủy, nhập lý do và nội dung thay đổi.
2. Hệ thống lưu liên kết hóa đơn gốc cùng giá trị trước/sau dự kiến; không sửa trực tiếp hóa đơn.
3. Hệ thống chuyển người có quyền duyệt thủ công; ưu tiên người khác người tạo nếu có người đủ quyền.
4. Người duyệt kiểm tra căn cứ và chọn chấp thuận, từ chối hoặc yêu cầu bổ sung.
5. Khi chấp thuận, hệ thống kiểm tra lại quyền hiện hành, điều kiện và chính sách gắn với yêu cầu.
6. Hệ thống thực hiện nghiệp vụ điều chỉnh được ủy quyền, cập nhật công nợ liên quan nhất quán và lưu đầy đủ audit.

**Luồng thay thế và ngoại lệ**

- 3a. Trung tâm chỉ có một Manager đủ quyền: cho tự duyệt theo BR-11, bắt buộc lý do và cờ SELF_APPROVED.
- 3b. Chưa có người đủ quyền: giữ PENDING_APPROVAL và thông báo Manager, không bỏ duyệt.
- 4a. Thiếu chứng cứ: NEEDS_INFORMATION; từ chối: REJECTED; hóa đơn gốc chưa bị thay đổi.
- 5a. Người duyệt đã bị thu hồi quyền: từ chối thực thi dù trước đó có quyền.
- 6a. Hóa đơn đã có thanh toán/điều chỉnh khác khiến yêu cầu không còn hợp lệ: dừng để đối soát; không tự hoàn tiền qua cổng thanh toán.

**Hậu điều kiện:** Có quyết định và lịch sử điều chỉnh kiểm tra được; hóa đơn gốc không bị sửa lén hoặc mất dấu vết. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- P0 không tích hợp hoàn tiền hay cổng thanh toán; hóa đơn đã thu tiền khi giảm/hủy phải tạo khoản cần xử lý/tín dụng qua phê duyệt tài chính, giữ chứng từ gốc và lịch sử thu/đảo.

**Tiêu chí nghiệm thu**

- AC-26-01: Không có cấu hình nào được tự động duyệt điều chỉnh/hủy hóa đơn đã phát hành.
- AC-26-02: SELF_APPROVED là cờ kiểm toán, không phải trạng thái workflow.
- AC-26-03: Audit có người duyệt, thời điểm, lý do, kết quả và thay đổi.

<a id="uc-27"></a>

### UC-27 — Tạo, chỉnh sửa và giao bài tập

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Giao nhiệm vụ học tập với deadline và mức độ ưu tiên. |
| Ưu tiên | P0, gồm thông báo in-app; kênh thông báo ngoài ứng dụng ở P1 |
| Actor/bên tương tác | Teacher có quyền trong lớp/học sinh được phân công |
| Kích hoạt | Giáo viên tạo mới hoặc sửa bài tập. |
| Tiền điều kiện | C-01–C-04; có lớp/học sinh trong phạm vi phụ trách. |
| Dữ liệu chính | Nội dung bài, đối tượng nhận, deadline và priority stars. |
| Yêu cầu liên quan | FR-32, FR-33; FR-37 (P0 in-app/P1 kênh ngoài) |
| Business Rules | BR-08, BR-14 |
| User Stories | US-11 |

**Luồng chính**

1. Giáo viên chọn tạo hoặc chỉnh sửa bài tập trong phạm vi phụ trách.
2. Giáo viên nhập nội dung, deadline, mức độ ưu tiên và lớp/học sinh nhận bài.
3. Hệ thống kiểm tra dữ liệu và quyền đối với từng đối tượng nhận.
4. Giáo viên xác nhận giao; hệ thống lưu bài tập và hiển thị cho học sinh được giao.
5. Khi giao bài tập mới thành công, hệ thống tạo thông báo in-app cho học sinh được giao qua UC-31 (P0); ở P1 có thể gửi thêm qua kênh ngoài. Chỉnh sửa bài đã giao không mặc nhiên phát thông báo mới nếu chưa có chính sách.

**Luồng thay thế và ngoại lệ**

- 3a. Thiếu dữ liệu hoặc priority ngoài **1–5 sao**: yêu cầu sửa.
- 3b. Có học sinh/lớp ngoài phạm vi: không giao cho đối tượng không được phép.
- 1a. Đã có bài nộp: không âm thầm sửa yêu cầu/rút deadline; có thể gia hạn deadline với audit, giữ bài nộp và lịch sử.

**Hậu điều kiện:** Bài tập được giao có deadline/ưu tiên; học sinh đích xem được bài. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-27-01: Giáo viên không thể giao/sửa bài cho lớp ngoài phạm vi.
- AC-27-02: Bài được giao lưu đủ deadline và mức độ ưu tiên.
- AC-27-03 (P0): Priority stars chỉ nhận giá trị 1–5; gia hạn deadline sau khi có bài nộp có dấu vết.

<a id="uc-28"></a>

### UC-28 — Xem bài tập, nộp bài và xem trạng thái

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Hoàn thành bài tập và theo dõi tình trạng xử lý bài của mình. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Student được giao bài |
| Kích hoạt | Học sinh mở bài tập hoặc gửi bài nộp. |
| Tiền điều kiện | C-01–C-04; bài tập được giao cho học sinh. |
| Dữ liệu chính | Bài tập, nội dung bài nộp theo định dạng được hỗ trợ và thời điểm gửi. |
| Yêu cầu liên quan | FR-34, FR-04 |
| Business Rules | BR-14 |
| User Stories | US-13 |

**Luồng chính**

1. Học sinh xem danh sách bài được giao, deadline và mức ưu tiên.
2. Học sinh mở chi tiết và nhập/đính kèm bài làm theo hình thức được hỗ trợ.
3. Học sinh chọn nộp bài.
4. Hệ thống kiểm tra quyền, dữ liệu và điều kiện nộp theo chính sách đã chốt.
5. Hệ thống lưu bài nộp, thời điểm và trạng thái; học sinh xem xác nhận và kết quả chấm khi có.

**Luồng thay thế và ngoại lệ**

- 4a. Dữ liệu không hợp lệ hoặc lưu thất bại: thông báo chưa nộp thành công, cho phép sửa/gửi lại.
- 4b. Nộp muộn tối đa 7 ngày sau deadline được nhận và đánh dấu `LATE`; quá hạn thì từ chối. Nộp lại trước khi bài được chấm/công bố và trong hạn nhận bài, giữ phiên bản nộp cũ; tệp sai định dạng/kích thước thì từ chối.
- 1a. Bài không giao cho học sinh: từ chối truy cập.

**Hậu điều kiện:** Bài nộp được ghi nhận đúng học sinh; thất bại không hiển thị như đã nộp. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- P0 hỗ trợ tệp PDF, DOCX, JPG, PNG; mỗi tệp tối đa 10 MB, tối đa 5 tệp/lần nộp; tệp được lưu trong vùng lưu trữ do EduCore tự quản, không đòi Google Drive/S3.

**Tiêu chí nghiệm thu**

- AC-28-01: Học sinh xem trạng thái bài của mình.
- AC-28-02: Không được nộp bài thay học sinh khác bằng cách đổi định danh.
- AC-28-03 (P0): Bài nộp ngày thứ 7 sau deadline có cờ LATE; sau giới hạn bị từ chối. Tệp sai loại/quá kích thước bị từ chối.

<a id="uc-29"></a>

### UC-29 — Đánh giá, chấm điểm và phản hồi bài tập

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Ghi nhận kết quả và phản hồi phục vụ học tập. |
| Ưu tiên | P0 |
| Actor/bên tương tác | Teacher có quyền chấm trong lớp phụ trách |
| Kích hoạt | Giáo viên mở bài nộp cần đánh giá. |
| Tiền điều kiện | C-01–C-04; bài nộp nằm trong phạm vi giáo viên được phân công. |
| Dữ liệu chính | Bài nộp, đánh giá, điểm và nội dung phản hồi. |
| Yêu cầu liên quan | FR-35, FR-04 |
| Business Rules | BR-08, BR-14 |
| User Stories | US-12 |

**Luồng chính**

1. Giáo viên chọn bài tập và bài nộp.
2. Hệ thống kiểm tra phạm vi, hiển thị bài làm và kết quả hiện có.
3. Giáo viên nhập đánh giá, điểm và phản hồi.
4. Hệ thống kiểm tra dữ liệu theo thang điểm được chốt và lưu kết quả.
5. Giáo viên chủ động **công bố điểm**; chỉ sau đó hệ thống hiển thị kết quả cho học sinh/Parent hợp lệ và dùng để tổng hợp tiến độ P1.

**Luồng thay thế và ngoại lệ**

- 2a. Bị thu hồi quyền/lớp không còn phụ trách: từ chối.
- 4a. Điểm không hợp lệ: không lưu, yêu cầu sửa.
- Điểm 0–10 với một chữ số thập phân. Trước công bố, học sinh không thấy kết quả nháp; sửa điểm sau công bố yêu cầu lý do, audit và quyền hợp lệ.

**Hậu điều kiện:** Kết quả chấm gắn đúng bài nộp, người chấm và phản hồi. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-29-01: Backend chặn chấm điểm ngoài lớp phụ trách.
- AC-29-02: Học sinh được xem kết quả thuộc bài làm của mình theo quyền.
- AC-29-03 (P0): Không hiển thị điểm chưa công bố; sửa điểm đã công bố phải ghi lý do và audit.

<a id="uc-30"></a>

### UC-30 — Theo dõi tiến độ và thông tin học tập của con

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Theo dõi kết quả học tập và, với phụ huynh, các thông tin được phép về con. |
| Ưu tiên | P1: tổng hợp tiến độ; quyền xem lịch/học phí dùng các UC P0 |
| Actor/bên tương tác | Student; Parent đã liên kết; Teacher/Manager có quyền xem |
| Kích hoạt | Người dùng mở hồ sơ theo dõi học sinh. |
| Tiền điều kiện | C-01–C-04; có dữ liệu liên quan và quan hệ phụ huynh–học sinh hợp lệ nếu cần. |
| Dữ liệu chính | Học sinh, khoảng thời gian, lớp và quyền xem từng loại dữ liệu. |
| Yêu cầu liên quan | FR-36, FR-06, FR-04; FR-17, FR-30 |
| Business Rules | BR-14 |
| User Stories | US-12, US-14 |

**Luồng chính**

1. Người dùng chọn học sinh trong phạm vi được phép.
2. Hệ thống kiểm tra quyền theo loại dữ liệu; phụ huynh phải có liên kết hợp lệ.
3. Hệ thống tổng hợp chuyên cần, bài tập và kết quả học tập ở P1.
4. Hệ thống hiển thị kết quả; phụ huynh có thể xem lịch qua UC-14 và nghĩa vụ học phí qua nhánh tra cứu UC-25 nếu được cấp quyền.

**Luồng thay thế và ngoại lệ**

- 3a. Thiếu dữ liệu: hiển thị chưa có/chưa đủ dữ liệu; không coi thiếu điểm là 0.
- 2a. Liên kết phụ huynh bị thu hồi: dừng truy cập học sinh đó.
- P1: chuyên cần = ATTENDED/(ATTENDED+UNEXCUSED), bài nộp hợp lệ / bài đã đến hạn, điểm trung bình từ bài đã chấm/công bố; mẫu số 0 hiển thị N/A. Parent chỉ thấy dữ liệu con đã liên kết, kể cả điểm công bố và học phí, không xem dữ liệu nội bộ của trung tâm.

**Hậu điều kiện:** Thông tin được tổng hợp và hiển thị đúng phạm vi; không thay đổi dữ liệu nguồn. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-30-01: Phụ huynh không xem được học sinh chưa liên kết.
- AC-30-02: Giáo viên không tự có quyền xem dữ liệu tài chính chỉ vì phụ trách lớp.

<a id="uc-31"></a>

### UC-31 — Nhận thông báo và xử lý gửi thất bại

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | P0 hiển thị thông báo trong ứng dụng khi lịch thay đổi hoặc bài tập mới được giao; P1 bổ sung nhắc deadline và kênh gửi ngoài ứng dụng có khả năng truy vết. |
| Ưu tiên | **P0:** nhận/xem và đánh dấu đã đọc thông báo in-app; **P1:** nhắc deadline, kênh ngoài và retry gửi kênh ngoài |
| Actor/bên tương tác | Người nhận: Student, Parent, Teacher/người liên quan theo sự kiện; người có quyền theo dõi lỗi gửi thông báo |
| Kích hoạt | P0: lịch học thay đổi đã được xác nhận hoặc bài tập mới giao thành công; P1: đến thời điểm nhắc deadline đã cấu hình hoặc phát sinh tác vụ gửi kênh ngoài. |
| Tiền điều kiện | Sự kiện nghiệp vụ gốc đã ghi thành công; xác định được người nhận có quyền trong tenant. Với P1 kênh ngoài/nhắc deadline phải có cấu hình hợp lệ. |
| Dữ liệu chính | Sự kiện nguồn, đối tượng liên quan, tenant, người nhận, nội dung thông báo, trạng thái đã đọc/chưa đọc và khóa chống trùng (P0); kênh ngoài, thời điểm nhắc và lịch sử gửi (P1). |
| Yêu cầu liên quan | FR-37 (P0/P1), FR-39 (P0/P1); FR-38 (P1) |
| Business Rules | BR-12, BR-14 |
| User Stories | US-15 |

**Luồng chính — P0 (thông báo trong ứng dụng)**

1. Khi thay đổi lịch được xác nhận hoặc bài tập mới được giao thành công, hệ thống nhận sự kiện hợp lệ.
2. Hệ thống xác định người nhận theo tenant, lớp/học sinh và liên kết phụ huynh hợp lệ; không đưa dữ liệu ngoài phạm vi vào nội dung thông báo.
3. Hệ thống lưu một thông báo trong ứng dụng cho mỗi người nhận và sự kiện, chống tạo bản ghi trùng khi nhận lại sự kiện.
4. Người nhận mở danh sách thông báo, xem nội dung trong phạm vi quyền hiện hành và đánh dấu đã đọc; hệ thống lưu trạng thái đã đọc/chưa đọc.

**Luồng mở rộng — P1**

5. Với nhắc deadline đã cấu hình, hệ thống phát sinh sự kiện nhắc và xác định người nhận theo chính sách.
6. Nếu có kênh ngoài ứng dụng được hỗ trợ, hệ thống gửi theo cấu hình và ghi nhận trạng thái, lịch sử từng lần thử.

**Luồng thay thế và ngoại lệ**

- 2a. Người nhận không thuộc phạm vi quyền hoặc liên kết phụ huynh không hợp lệ: không tạo/hiển thị thông báo chứa dữ liệu trái quyền.
- 3a. Nhận lại sự kiện đã xử lý: không sinh thông báo in-app trùng cho cùng người nhận/sự kiện.
- 3b. Lỗi tạo thông báo: ghi nhận lỗi và chuyển xử lý theo cơ chế tác vụ thích hợp; không đảo ngược lịch/bài tập đã lưu thành công.
- 6a (P1). Lỗi gửi kênh ngoài tạm thời: thử lại tối đa 3 lần có giãn cách; hết số lần thì FAILED và báo Manager xử lý.
- 5a (P1). Chưa có cấu hình nhắc/kênh: không tự chọn thời điểm hoặc kênh ngoài; chỉ thực hiện phần đã cấu hình hợp lệ.
- P1 nhắc deadline tại 24 giờ và 1 giờ trước hạn; gửi email nghiệp vụ chỉ có ở P1 nếu triển khai. Retry lỗi tạm thời sau 1, 5, 15 phút (tối đa 3 lần) giữ idempotency key; P0 chỉ có in-app.

**Hậu điều kiện:** P0 có thông báo in-app với quyền truy cập và trạng thái đọc rõ ràng; P1 có lịch sử gửi/nhắc theo phạm vi triển khai. Lỗi thông báo không hủy kết quả nghiệp vụ gốc. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Ngoại lệ email OTP khôi phục ở UC-03 **không** phải email thông báo nghiệp vụ của UC-31 và không mở kênh email thông báo P0.

**Tiêu chí nghiệm thu**

- AC-31-01 (P1): Nhắc deadline tại hai mốc 24 giờ và 1 giờ trước giờ đến hạn theo timezone áp dụng.
- AC-31-02 (P1): Tác vụ gửi kênh ngoài bị lỗi không được thử lại vô hạn.
- AC-31-03 (P0): Lịch đổi/hủy đã xác nhận hoặc bài tập mới được giao tạo thông báo in-app đúng người nhận; không tạo trùng khi xử lý lại cùng sự kiện.
- AC-31-04 (P0): Chỉ người nhận có quyền được đọc thông báo, có trạng thái chưa đọc/đã đọc; không rò dữ liệu khác tenant hoặc học sinh không liên kết.

<a id="uc-32"></a>

### UC-32 — Xem báo cáo tổng quan trung tâm

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | P0 cung cấp dashboard thống kê cơ bản cho Manager; P1 mở rộng sang báo cáo tình trạng học tập và học phí chuyên sâu. |
| Ưu tiên | **P0:** dashboard số học sinh, số lớp, công nợ; **P1:** báo cáo chi tiết, bộ lọc và phân tích nâng cao |
| Actor/bên tương tác | Manager hoặc người được cấp quyền xem dashboard/báo cáo trong phạm vi tenant |
| Kích hoạt | Người dùng mở dashboard hoặc báo cáo. |
| Tiền điều kiện | C-01–C-04; có quyền truy cập số liệu và dữ liệu nghiệp vụ tương ứng. |
| Dữ liệu chính | Tenant, thời điểm dữ liệu, số học sinh, số lớp, công nợ học phí (P0); kỳ báo cáo, tình trạng học tập và bộ lọc nâng cao (P1). |
| Yêu cầu liên quan | FR-40 (P0/P1) |
| Business Rules | BR-08, BR-14 |
| User Stories | US-02 |

**Luồng chính — P0 (dashboard cơ bản)**

1. Người dùng mở dashboard trong tenant đang làm việc.
2. Hệ thống kiểm tra permission và giới hạn dữ liệu theo tenant/phạm vi được phép.
3. Hệ thống tổng hợp và hiển thị **số lượng học sinh**, **số lớp học** và **công nợ học phí** theo dữ liệu nghiệp vụ hiện có.
4. Hệ thống hiển thị thời điểm/phạm vi số liệu, phân biệt dữ liệu chưa được xác nhận hoặc chưa đối soát nếu có.

**Luồng mở rộng — P1**

5. Người có quyền chọn kỳ, lớp/khóa học và bộ lọc nâng cao để xem báo cáo tình trạng học tập, học phí và các phân tích chi tiết.

**Luồng thay thế và ngoại lệ**

- 3a. Không có dữ liệu: trả dashboard/báo cáo với số liệu rỗng hoặc 0 có giải thích phù hợp.
- 3b. Dữ liệu chưa đầy đủ/chưa xác nhận: hiển thị giới hạn dữ liệu, không mô tả là số liệu đã đối soát.
- 2a. Không có quyền xem số liệu của tenant/phạm vi: từ chối, không hiển thị thống kê lộ thông tin.
- P0 đếm học sinh có ít nhất một ghi danh `ACTIVE` (không trùng), lớp đang hoạt động, và tổng **số dư còn phải thu** của hóa đơn đã phát hành sau điều chỉnh/tín dụng phân bổ; không đưa dự thảo hoặc trả trước chưa phân bổ vào công nợ.
- Nguồn chưa yêu cầu xuất Excel/PDF; không đưa chức năng xuất vào baseline P0.

**Hậu điều kiện:** Người dùng có quyền xem dashboard P0; dữ liệu nguồn không bị thay đổi. Báo cáo chi tiết thuộc P1. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- P1 bổ sung: doanh thu theo dịch vụ đã cung cấp, giá trị hóa đơn phát hành, đã thu ròng, phải thu và công nợ quá hạn. Không yêu cầu tích hợp hệ thống BI hoặc xuất Excel/PDF trong P0.

**Tiêu chí nghiệm thu**

- AC-32-01 (P0): Dashboard/báo cáo của tenant A không chứa số liệu tenant B.
- AC-32-02 (P0/P1): Không cộng tiền trả trước chưa sử dụng vào doanh thu đã thực hiện hoặc công nợ; chỉ số được định nghĩa và truy vết theo Q-12 đã chốt.
- AC-32-03 (P0): Dashboard hiển thị được số học sinh, số lớp và công nợ trong đúng phạm vi truy cập, nêu rõ thời điểm và tình trạng dữ liệu.
- AC-32-04 (P0): Một học sinh có nhiều ghi danh ACTIVE chỉ được đếm một lần; công nợ chỉ tính hóa đơn phát hành hợp lệ.

<a id="uc-33"></a>

### UC-33 — Cấu hình chính sách nghiệp vụ, tự động hóa và phê duyệt

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Cấu hình chính sách riêng của tenant với phiên bản và phạm vi tự động hóa rõ ràng. |
| Ưu tiên | P1; P0 dùng baseline cố định và ghi dấu vết |
| Actor/bên tương tác | Manager hoặc người được ủy quyền cấu hình chính sách |
| Kích hoạt | Người có quyền tạo hoặc thay đổi chính sách. |
| Tiền điều kiện | C-01–C-04; người thao tác có quyền đối với nhóm chính sách. |
| Dữ liệu chính | Loại nghiệp vụ, điều kiện, ngưỡng rủi ro, permission phê duyệt, tham số, thời điểm hiệu lực và người sửa. |
| Yêu cầu liên quan | FR-43, FR-44 |
| Business Rules | BR-06, BR-08, BR-09, BR-11, BR-13, BR-14 |
| User Stories | US-16 |

**Luồng chính**

1. Người dùng xem chính sách hiện hành và đề nghị thay đổi.
2. Người dùng nhập điều kiện/ngưỡng, người có quyền xử lý, tham số và thời điểm hiệu lực.
3. Hệ thống kiểm tra cấu hình không vượt các quy tắc cấm và không tự cấp quyền do thiếu role.
4. Người dùng xác nhận; hệ thống lưu phiên bản mới, người sửa, thời điểm hiệu lực và audit.
5. Yêu cầu mới sau thời điểm hiệu lực gắn phiên bản mới; yêu cầu đang có/retry giữ phiên bản đã dùng.

**Luồng thay thế và ngoại lệ**

- 3a. Cấu hình tự động duyệt điều chỉnh/hủy hóa đơn đã phát hành: từ chối.
- 3b. Bật tự phát hành ở phạm vi P0: từ chối vì BR-13.
- 5a. Muốn thay đổi kết quả cũ: tạo nghiệp vụ điều chỉnh được ủy quyền, không áp dụng hồi tố.
- Quyền hiện hành luôn được kiểm tra khi thực thi dù yêu cầu dùng policy_version cũ.

**Hậu điều kiện:** Chính sách được quản trị theo tenant và phiên bản; không âm thầm đổi căn cứ yêu cầu cũ. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-33-01: Retry sau cập nhật chính sách vẫn dùng phiên bản gắn với yêu cầu ban đầu.
- AC-33-02: Đổi policy_version không khôi phục quyền của người đã bị thu hồi.

<a id="uc-34"></a>

### UC-34 — Tiếp nhận và xử lý yêu cầu phê duyệt/ngoại lệ

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Giải quyết yêu cầu đang chờ bằng quyết định có căn cứ và đúng thẩm quyền. |
| Ưu tiên | P0: xử lý thủ công giới hạn; P1: workflow cấu hình đầy đủ |
| Actor/bên tương tác | Người có permission xử lý nghiệp vụ trong tenant/lớp; Manager đủ quyền khi kiêm nhiệm |
| Kích hoạt | Nghiệp vụ phát sinh yêu cầu cần duyệt hoặc người có quyền mở danh sách chờ. |
| Tiền điều kiện | C-01–C-04; yêu cầu có nguồn gốc, loại nghiệp vụ và chính sách xác định. |
| Dữ liệu chính | Nội dung yêu cầu, căn cứ, lý do chờ, policy_version, người tạo và quyết định xử lý. |
| Yêu cầu liên quan | FR-45, FR-41; FR-44 (P1) |
| Business Rules | BR-08, BR-09, BR-10, BR-11, BR-12, BR-14 |
| User Stories | US-16, US-17 |

**Luồng chính**

1. Hệ thống tiếp nhận yêu cầu hợp lệ cần duyệt và lưu PENDING_APPROVAL cùng lý do.
2. Người có quyền mở danh sách chờ trong phạm vi của mình.
3. Người dùng xem dữ liệu gốc, quy tắc/phiên bản và lý do yêu cầu.
4. Người dùng chọn duyệt, từ chối hoặc yêu cầu bổ sung; ghi lý do quyết định.
5. Khi duyệt, hệ thống kiểm tra lại quyền hiện hành, tách nhiệm vụ nếu áp dụng và mọi ràng buộc nghiệp vụ.
6. Hệ thống ghi quyết định; nếu thực thi thành công thì hoàn tất nghiệp vụ, lưu audit và thông tin kết quả.

**Luồng thay thế và ngoại lệ**

- 1a. Thiếu dữ liệu: NEEDS_INFORMATION; người tạo bổ sung rồi gửi lại để kiểm tra; giữ lịch sử và chính sách đã gắn.
- 1b. Xung đột/vi phạm điều cấm: từ chối thao tác, không biến phê duyệt thành cách bỏ qua ràng buộc.
- 2a. Chưa có người thích hợp: giữ PENDING_APPROVAL, thông báo Manager; không tự cấp quyền.
- 4a. Từ chối: REJECTED, không áp dụng thay đổi; trả bổ sung: NEEDS_INFORMATION.
- 5a. Tự duyệt: chỉ cho phép theo BR-11; tài chính nhạy cảm dùng UC-26.
- 6a. Đã duyệt nhưng thực thi thất bại: ghi trạng thái/lý do thực thi, xử lý lỗi theo UC-37; không báo COMPLETED.

**Hậu điều kiện:** Yêu cầu có kết quả xử lý truy vết được; APPROVED không đồng nghĩa đã thực thi thành công. Bảo đảm thất bại theo C-09.

**Tiêu chí nghiệm thu**

- AC-34-01: Role chỉ có quyền xem không được duyệt.
- AC-34-02: Phê duyệt không được bỏ qua xung đột lịch hoặc sức chứa.
- AC-34-03: Quyết định ngoại lệ luôn có người, thời điểm, lý do và kết quả.

<a id="uc-35"></a>

### UC-35 — Tra cứu nhật ký và giải thích quyết định

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Kiểm tra thay đổi quan trọng và căn cứ quyết định tự động/phê duyệt. |
| Ưu tiên | P0: ghi audit + tra cứu cơ bản; P1: nâng cao |
| Actor/bên tương tác | Manager hoặc người có quyền kiểm tra nghiệp vụ tương ứng |
| Kích hoạt | Người có quyền yêu cầu xem lịch sử một đối tượng hoặc quyết định. |
| Tiền điều kiện | C-01–C-04; có nhật ký trong phạm vi được phép. |
| Dữ liệu chính | Đối tượng, khoảng thời gian, loại sự kiện, người thao tác và mã tương quan. |
| Yêu cầu liên quan | FR-41, FR-45 |
| Business Rules | BR-08, BR-11, BR-12, BR-14 |
| User Stories | US-19 |

**Luồng chính**

1. Người dùng chọn đối tượng hoặc bộ lọc nhật ký.
2. Hệ thống kiểm tra quyền xem cả đối tượng và dữ liệu nhật ký liên quan.
3. Hệ thống hiển thị sự kiện khởi phát, người/thời điểm, thay đổi/kết quả, lý do và policy_version khi áp dụng.
4. Người dùng mở chuỗi xử lý gồm quyết định, lần thử lại và kết quả cuối; xem SELF_APPROVED nếu có.

**Luồng thay thế và ngoại lệ**

- 2a. Ngoài phạm vi: từ chối, không làm lộ dữ liệu qua log.
- 3a. Không có nhật ký phù hợp: hiển thị rõ chưa có dữ liệu; không suy diễn quyết định.
- P0 có màn hình lọc log theo đối tượng, người thao tác, thời điểm và kết quả; Manager chỉ xem tenant của mình, học vụ/tài chính chỉ theo permission và phạm vi dữ liệu.

**Hậu điều kiện:** Người có quyền hiểu căn cứ quyết định; thao tác tra cứu không sửa lịch sử. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Lưu audit mặc định 24 tháng (cần rà soát yêu cầu pháp lý khi triển khai thực tế); không cho sửa/xóa log qua UI, không ghi mật khẩu/OTP hoặc dữ liệu nhạy cảm không cần thiết. P1 mới xuất/điều tra log nâng cao.

**Tiêu chí nghiệm thu**

- AC-35-01: Audit ghi được đổi lịch, điều chỉnh hóa đơn và thay đổi phân quyền.
- AC-35-02: Không ghi mật khẩu/bí mật xác thực hoặc dữ liệu nhạy cảm không cần thiết vào log.

<a id="uc-36"></a>

### UC-36 — Truy cập dữ liệu theo phạm vi trung tâm

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Thực hiện nghiệp vụ trong tenant được cấp, bảo đảm dữ liệu các trung tâm độc lập. |
| Ưu tiên | P0 tenant isolation bắt buộc; P1 quản trị tenant nâng cao |
| Actor/bên tương tác | Mọi người dùng có quyền tenant; System Administrator chỉ theo quyền nền tảng cụ thể |
| Kích hoạt | Người dùng chọn tenant hoặc gọi một chức năng nghiệp vụ. |
| Tiền điều kiện | Đã xác thực; có phạm vi tenant được cấp cho thao tác yêu cầu. |
| Dữ liệu chính | Ngữ cảnh tenant, người dùng, permission và đối tượng nghiệp vụ. |
| Yêu cầu liên quan | FR-42, FR-04 |
| Business Rules | BR-08, BR-10, BR-14 |
| User Stories | Hỗ trợ xuyên suốt các User Stories; không có US riêng trong nguồn |

**Luồng chính**

1. Người dùng truy cập một tenant được cấp.
2. Hệ thống xác định tenant và quyền hiện hành từ ngữ cảnh đã xác thực.
3. Khi đọc/ghi nghiệp vụ, hệ thống kiểm tra tenant của mọi đối tượng và phạm vi lớp/học sinh.
4. Hệ thống chỉ trả/lưu dữ liệu phù hợp phạm vi; chính sách áp dụng thuộc tenant đó.

**Luồng thay thế và ngoại lệ**

- 1a. Tenant không được cấp: từ chối.
- 3a. Truyền định danh dữ liệu tenant khác hoặc tham chiếu chéo: từ chối.
- System Administrator không mặc nhiên được xem/sửa hồ sơ, điểm, học phí của mọi tenant. P0 tenant được khởi tạo/bật/tạm khóa qua vận hành có kiểm soát; P1 mới có UI vòng đời tenant `CREATED`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`.

**Hậu điều kiện:** Dữ liệu không bị đọc, sửa hoặc liên kết chéo tenant trái phép. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- Dấu P0* chỉ giới hạn giao diện quản trị vòng đời, không phải giảm mức bảo vệ dữ liệu. Tenant ACTIVE luôn có ít nhất một Manager hợp lệ; hỗ trợ xuyên tenant chỉ khi được ủy quyền giới hạn, có audit.

**Tiêu chí nghiệm thu**

- AC-36-01: Tài khoản nhiều role không được cộng quyền để vượt tenant.
- AC-36-02: Thao tác xem lịch, hóa đơn, báo cáo và nhật ký đều chịu kiểm tra phạm vi.

<a id="uc-37"></a>

### UC-37 — Theo dõi và xử lý tác vụ tự động

| Thuộc tính | Đặc tả |
|---|---|
| Mục tiêu | Hoàn thành tác vụ được phép hoặc chuyển đúng người xử lý mà không tạo tác động trùng. |
| Ưu tiên | P0: kiểm tra lịch, tính phí, tạo dự thảo và chống lặp; P1: mở rộng theo chính sách |
| Actor/bên tương tác | Manager/người có quyền nghiệp vụ giám sát; sự kiện/lịch chạy là trigger nội bộ |
| Kích hoạt | Yêu cầu người dùng, sự kiện theo lịch hoặc lần retry hợp lệ khởi phát tác vụ. |
| Tiền điều kiện | Có loại nghiệp vụ và tenant xác định; sự kiện/người gọi có nguồn gốc hợp lệ. |
| Dữ liệu chính | Mã chống lặp, dữ liệu nghiệp vụ, policy_version, quyền hiện hành và số lần thử lại. |
| Yêu cầu liên quan | FR-45, FR-41; FR-39 (P1) |
| Business Rules | BR-08, BR-09, BR-12, BR-13, BR-14 |
| User Stories | US-16, US-17, US-19 |

**Luồng chính**

1. Hệ thống tiếp nhận tác vụ, gắn mã chống lặp và phiên bản chính sách; tìm kết quả xử lý trước đó của cùng yêu cầu.
2. Hệ thống kiểm tra quyền hiện hành, tenant, tính đầy đủ và các điều kiện nghiệp vụ.
3. Nếu đủ điều kiện tự động và không cần phê duyệt, hệ thống thực hiện nghiệp vụ trong phạm vi được phép.
4. Hệ thống lưu kết quả cùng lịch sử thực thi, trả kết quả cho người gọi/người có quyền giám sát.
5. Người có quyền xem tác vụ chưa hoàn tất và xử lý dữ liệu thiếu hoặc ngoại lệ qua UC-34/UC-35.

**Luồng thay thế và ngoại lệ**

- 1a. Tác vụ đã hoàn tất: trả kết quả trước đó, không lặp tác động.
- 2a. Thiếu dữ liệu: NEEDS_INFORMATION, không retry vô hạn.
- 2b. Hợp lệ nhưng cần duyệt: PENDING_APPROVAL; chưa có người duyệt thì báo Manager và giữ chờ.
- 2c. Xung đột hoặc vi phạm quy tắc cấm: từ chối; không thực hiện.
- 3a. Lỗi tạm thời: thử lại tối đa 3 lần ngoài lần thực thi ban đầu, có giãn cách, cùng mã chống lặp và policy_version; hết lượt thì FAILED và báo Manager.
- 3b. P0 gặp yêu cầu tự phát hành/chuyển lớp/dạy thay: không tự xác nhận; chuyển quy trình đúng quyền.

**Hậu điều kiện:** Tác vụ hoàn tất một lần hoặc có trạng thái/lý do xử lý rõ; không mất dấu vết khi retry. Bảo đảm thất bại theo C-09.

**Quyết định áp dụng từ Q đã chốt**

- P0 hiển thị cho Manager danh sách `FAILED`, `PENDING_APPROVAL`, `NEEDS_INFORMATION` và lý do; cho người có permission chạy lại sau khi kiểm tra, cùng khóa chống trùng. Tối đa 3 retry sau lần đầu, giãn cách 1/5/15 phút; không gọi dịch vụ ngoài trong P0 trừ gửi OTP UC-03.

**Tiêu chí nghiệm thu**

- AC-37-01: Lần retry không sinh thêm buổi, hóa đơn hay thanh toán.
- AC-37-02: Quyền bị thu hồi giữa hai lần thử được kiểm tra ở lần thực thi kế tiếp.
- AC-37-03: Tự động hóa không được bỏ qua phê duyệt thủ công bắt buộc.
- AC-37-04 (P0): Khi retry hết lượt tác vụ trở thành FAILED và Manager xem được danh sách lỗi; retry thủ công không nhân đôi kết quả nghiệp vụ.

## 4. Quan hệ giữa các use case

Bảng sau là quan hệ phụ thuộc/điều phối nghiệp vụ, **không mặc nhiên là quan hệ UML include/extend**. Khi dựng Use Case Diagram, chỉ dùng include nếu hành vi luôn được gọi, extend nếu hành vi là mở rộng có điều kiện tại điểm mở rộng xác định. Kiểm tra quyền và audit có thể được biểu diễn như ràng buộc chung thay vì thêm actor “Hệ thống”.

| Use case | Phụ thuộc/phối hợp |
|---|---|
| UC-04, UC-05, UC-06 | Tài khoản, quyền và liên kết xác định phạm vi thực hiện các UC nghiệp vụ. |
| UC-12, UC-13, UC-17, UC-19, UC-20 | Dùng dữ liệu tài nguyên và kiểm tra xung đột/sức chứa BR-01 trước khi ghi thay đổi. |
| UC-16 → UC-15, UC-17, UC-23 | Đơn nghỉ được chấp thuận là căn cứ EXCUSED, quyền học bù P1 và tính phí. |
| UC-17 → UC-15 → UC-23 | Học bù hợp lệ, kết quả tham gia và phí được liên kết về buổi nghỉ gốc. |
| UC-18 → UC-19 → UC-23 | Bảo lưu, quay lại và khấu trừ tín dụng học phí theo dữ liệu được xác nhận. |
| UC-21, UC-22 → UC-23 → UC-24 → UC-25 | Đơn giá/ưu đãi → dự thảo → phát hành → thanh toán/công nợ. |
| UC-26 ↔ UC-34 | Điều chỉnh/hủy hóa đơn luôn cần duyệt thủ công; workflow không được bỏ qua BR-11. |
| UC-27 → UC-28 → UC-29 → UC-30 | Giao bài, nộp bài, đánh giá rồi tổng hợp tiến độ. |
| UC-13, UC-27 → UC-31 | Phát sinh thông báo **in-app P0** sau khi thay đổi lịch/giao bài thành công; nhắc deadline và gửi kênh ngoài ở P1. |
| UC-33 → UC-34, UC-37 | Chính sách điều khiển phê duyệt/tự động hóa; quyền thực thi luôn là quyền hiện hành. |
| UC-35, UC-36 | Tra cứu dấu vết và cô lập tenant là các mối quan tâm xuyên suốt. |

## 5. Ma trận truy vết

### 5.1. Functional Requirements → Use Cases

Mức ưu tiên dưới đây sao lại từ nguồn, không nâng các chức năng P1 thành P0. Một FR xuất hiện ở nhiều UC do được dùng trong nhiều mục tiêu hoặc làm ràng buộc chung.

| FR | Ưu tiên trong nguồn | UC bao phủ |
|---|---|---|
| FR-01 | P0 | UC-01, UC-02, UC-03 |
| FR-02 | P0 | UC-04 |
| FR-03 | P0 | UC-05 |
| FR-04 | P0 | UC-05, UC-06, UC-14, UC-15, UC-28, UC-29, UC-30, UC-36 |
| FR-05 | P1 | UC-05 |
| FR-06 | P0 | UC-06, UC-14, UC-30 |
| FR-07 | P0 | UC-07 |
| FR-08 | P0 | UC-08 |
| FR-09 | P0 | UC-09 |
| FR-10 | P0 | UC-10 |
| FR-11 | P0 | UC-11 |
| FR-12 | P0 | UC-12 |
| FR-13 | P0 | UC-12, UC-13 |
| FR-14 | P0 | UC-12, UC-13 |
| FR-15 | P1 | UC-12 |
| FR-16 | P0 | UC-13 |
| FR-17 | P0 | UC-14, UC-30 |
| FR-18 | P0 | UC-15, UC-16 |
| FR-19 | P0 | UC-16 |
| FR-20 | P1 | UC-17 |
| FR-21 | P1 | UC-17 |
| FR-22 | P1 | UC-18 |
| FR-23 | P1 | UC-18, UC-19 |
| FR-24 | P1 | UC-20 |
| FR-25 | P0 | UC-21 |
| FR-26 | P0 | UC-23 |
| FR-27 | P0 | UC-22, UC-23 |
| FR-28 | P1 | UC-22 |
| FR-29 | P0 | UC-23, UC-24 |
| FR-30 | P0 | UC-25, UC-30 |
| FR-31 | P0 | UC-26 |
| FR-32 | P0 | UC-27 |
| FR-33 | P0 | UC-27 |
| FR-34 | P0 | UC-28 |
| FR-35 | P0 | UC-29 |
| FR-36 | P1 | UC-30 |
| FR-37 | P0 (in-app); P1 (kênh ngoài) | UC-13, UC-27, UC-31 |
| FR-38 | P1 | UC-31 |
| FR-39 | P0 (lưu/đọc/chống trùng in-app); P1 (retry gửi ngoài) | UC-31, UC-37 |
| FR-40 | P0 (dashboard cơ bản); P1 (chi tiết) | UC-32 |
| FR-41 | P0 | UC-26, UC-34, UC-35, UC-37 |
| FR-42 | P0* | UC-36 |
| FR-43 | P1 | UC-33 |
| FR-44 | P1 | UC-16, UC-26, UC-33, UC-34 |
| FR-45 | P0 (phạm vi giới hạn) | UC-23, UC-34, UC-35, UC-37 |

### 5.2. User Stories → Use Cases

| US | UC đáp ứng/hỗ trợ |
|---|---|
| US-01 | UC-07, UC-08, UC-09, UC-10, UC-11 |
| US-02 | UC-32 |
| US-03 | UC-04, UC-05 |
| US-04 | UC-11, UC-12, UC-13, UC-14 |
| US-05 | UC-17 |
| US-06 | UC-18, UC-19 |
| US-07 | UC-20 |
| US-08 | UC-21, UC-22, UC-23, UC-24, UC-26 |
| US-09 | UC-24, UC-25, UC-26 |
| US-10 | UC-14, UC-15 |
| US-11 | UC-27 |
| US-12 | UC-29, UC-30 |
| US-13 | UC-14, UC-28 |
| US-14 | UC-06, UC-14, UC-25, UC-30 |
| US-15 | UC-31 |
| US-16 | UC-33, UC-34, UC-37 |
| US-17 | UC-34, UC-37 |
| US-18 | UC-04, UC-05 |
| US-19 | UC-35, UC-37 |

### 5.3. Business Rules → Use Cases

Các ràng buộc quyền, tenant, audit và chống lặp còn áp dụng xuyên suốt theo mục 1.1, kể cả khi không lặp lại ở từng dòng.

| BR | UC áp dụng trực tiếp |
|---|---|
| BR-01 | UC-08, UC-09, UC-10, UC-11, UC-12, UC-13, UC-17, UC-19, UC-20 |
| BR-02 | UC-15, UC-17 |
| BR-03 | UC-13, UC-15, UC-17, UC-23 |
| BR-04 | UC-13, UC-15, UC-16, UC-17, UC-23 |
| BR-05 | UC-18, UC-19, UC-23, UC-26 |
| BR-06 | UC-21, UC-22, UC-23, UC-33 |
| BR-07 | UC-20 |
| BR-08 | UC-04, UC-05, UC-06, UC-07, UC-09, UC-10, UC-11, UC-12, UC-13, UC-15, UC-16, UC-17, UC-18, UC-19, UC-20, UC-21, UC-22, UC-24, UC-25, UC-26, UC-27, UC-29, UC-32, UC-33, UC-34, UC-35, UC-36, UC-37 |
| BR-09 | UC-10, UC-12, UC-16, UC-17, UC-18, UC-20, UC-23, UC-24, UC-26, UC-33, UC-34, UC-37 |
| BR-10 | UC-01, UC-04, UC-05, UC-34, UC-36 |
| BR-11 | UC-16, UC-18, UC-24, UC-26, UC-33, UC-34, UC-35 |
| BR-12 | UC-12, UC-13, UC-17, UC-23, UC-25, UC-31, UC-34, UC-35, UC-37 |
| BR-13 | UC-10, UC-12, UC-19, UC-20, UC-23, UC-24, UC-26, UC-33, UC-37 |
| BR-14 | UC-01, UC-04, UC-05, UC-06, UC-07, UC-08, UC-14, UC-16, UC-18, UC-21, UC-22, UC-23, UC-24, UC-25, UC-26, UC-27, UC-28, UC-29, UC-30, UC-31, UC-32, UC-33, UC-34, UC-35, UC-36, UC-37 |

## 6. Yêu cầu chất lượng và kiểm thử chéo

Các chỉ tiêu NFR là **mục tiêu đề xuất trong nguồn**, chưa phải kết quả đã kiểm chứng. Cần thống nhất quy mô dữ liệu, tải và hạ tầng trước khi nghiệm thu.

| NFR | Áp dụng/kiểm chứng |
|---|---|
| NFR-01 | API thông thường: 95% yêu cầu trong 1 giây, không tính độ trễ mạng ngoài; đo trên tải đã thống nhất. |
| NFR-02 | UC-12/UC-13 và các bước kiểm tra xung đột: phản hồi trong 2 giây với bộ dữ liệu thử nghiệm đã chốt. |
| NFR-03 | Thiết kế đa tenant; kiểm thử UC-36 và mọi truy vấn/ghi nghiệp vụ không lẫn dữ liệu. |
| NFR-04 | UC-01–UC-03 và toàn bộ giao tiếp: HTTPS, mật khẩu băm phù hợp như Argon2id/bcrypt. |
| NFR-05 | Kiểm tra quyền Backend trên mọi thao tác, gồm API gọi trực tiếp và quyền bị thu hồi sau khi tạo yêu cầu. |
| NFR-06 | UC-17, UC-23–UC-26 và nghiệp vụ nhiều thay đổi: kiểm thử lỗi giữa chừng, rollback/khôi phục nhất quán. |
| NFR-07 | Vận hành production hướng tới khả dụng 99,5%/tháng, không tính bảo trì có kế hoạch. |
| NFR-08 | Sao lưu hằng ngày; mục tiêu RPO ≤ 24 giờ, RTO ≤ 4 giờ; cần kiểm chứng khả năng khôi phục. |
| NFR-09 | Các luồng người dùng sử dụng được trên máy tính, máy tính bảng, điện thoại. |
| NFR-10 | Kiểm tra các phiên bản phổ biến còn hỗ trợ của Chrome, Edge, Firefox tại thời điểm nghiệm thu. |
| NFR-11 | Phân tách tương đối module để thay đổi chính sách không phá các nghiệp vụ không liên quan. |
| NFR-12 | Unit test module xếp lịch và học phí đạt tối thiểu 80% branch coverage theo mục tiêu nguồn. |
| NFR-13 | Ghi nhận lỗi và mã truy vết; tránh ghi thông tin nhạy cảm không cần thiết. |
| NFR-14 | Quyền đọc dữ liệu cá nhân, học tập và thanh toán được kiểm tra riêng; đặc biệt UC-06, UC-25, UC-30, UC-31 (người nhận thông báo), UC-32 (dashboard), UC-35. |
| NFR-15 | Thử gửi lặp, timeout rồi retry; không sinh thêm buổi học, hóa đơn hoặc khoản thu. |
| NFR-16 | Đối chiếu quyết định với sự kiện khởi phát, policy_version, kết quả, người duyệt nếu có và thời điểm. |

### 6.1. Kịch bản kiểm tra liên nghiệp vụ tối thiểu

| ID | Tình huống | Kết quả mong đợi |
|---|---|---|
| E2E-01 | Hai người cùng xác nhận lịch chiếm cùng tài nguyên trong thời gian giao nhau | Chỉ kết quả không vi phạm được lưu; yêu cầu còn lại bị chặn khi kiểm tra lại tại thời điểm ghi. |
| E2E-02 | Nghỉ gửi trước 24 giờ, được duyệt; học sinh học bù hợp lệ và tham dự (P1) | Buổi gốc EXCUSED = 0; buổi học bù = 1 hoặc trừ 1 quyền theo gói; không thu hai lần. |
| E2E-03 | Nghỉ muộn chưa duyệt ngoại lệ | Không tự EXCUSED; không tự tạo quyền học bù; điểm danh thực tế quyết định trạng thái tham gia. |
| E2E-04 | Vắng không phép buổi học bù đã giữ chỗ (P1) | Tính 1 buổi, đóng quyền học bù; không cho dùng lại buổi nghỉ để hưởng lượt thứ hai. |
| E2E-05 | Trung tâm hủy học bù khiến hết hạn (P1) | Buổi hủy tính 0; chuyển duyệt ngoại lệ thời hạn, không tự gia hạn và không bỏ qua xung đột/sức chứa. |
| E2E-06 | Tính phí khi điểm danh chưa được xác nhận | Không tự chốt; chỉ rõ dữ liệu cần bổ sung/xác nhận. |
| E2E-07 | Tạo dự thảo thành công trong MVP | Dừng ở dự thảo; người đủ quyền xác nhận mới phát hành. |
| E2E-08 | Một Manager duy nhất tự duyệt điều chỉnh hóa đơn | Duyệt thủ công, đúng quyền, có lý do, audit và cờ SELF_APPROVED. |
| E2E-09 | Đổi chính sách rồi retry một yêu cầu cũ | Giữ phiên bản gắn với yêu cầu; kiểm tra quyền hiện hành, không áp dụng hồi tố hóa đơn đã phát hành. |
| E2E-10 | Retry thanh toán sau timeout | Chỉ một khoản thanh toán và một lần cập nhật công nợ. |
| E2E-11 | Phụ huynh đổi mã học sinh trên yêu cầu đọc dữ liệu | Từ chối nếu chưa liên kết/ngoài phạm vi; không làm lộ dữ liệu. |
| E2E-12 | Đã duyệt bảo lưu với học phí trả trước còn buổi chưa sử dụng (P1) | Không tính buổi phát sinh trong khoảng bảo lưu; giữ giá trị chưa sử dụng dưới dạng tín dụng có căn cứ, không tự hoàn tiền. |
| E2E-13 | Người duyệt bị thu hồi permission trước lúc thực thi | Không thực thi quyết định bằng quyền cũ; ghi rõ lý do. |
| E2E-14 | Retry tác vụ lỗi tạm thời đến hết giới hạn | Tối đa 3 lần thử lại có giãn cách; sau đó FAILED và báo Manager, không bỏ qua duyệt. |
| E2E-15 | P0 đổi lịch hợp lệ và giao bài mới, sự kiện được phát lại | Đúng người nhận thấy thông báo in-app; không tạo trùng; người khác tenant hoặc không liên kết không xem được; trạng thái đã đọc được lưu. |
| E2E-16 | P0 Manager mở dashboard có dữ liệu học sinh, lớp, công nợ và một khoản chưa xác nhận | Hiển thị ba số liệu trong đúng tenant/phạm vi, có thời điểm dữ liệu; không trình bày khoản thiếu xác nhận thành công nợ đã đối soát. |
| E2E-17 | P0 yêu cầu khôi phục mật khẩu, nhập OTP đúng/sai/hết hạn hoặc dùng lại | Chỉ OTP gửi email còn hạn 15 phút, chưa dùng được chấp nhận; mật khẩu băm mới và phiên cũ bị thu hồi, không rò tài khoản qua phản hồi. |
| E2E-18 | P0 tạo chuỗi lịch 6 tháng có một buổi trùng phòng | Không buổi nào trong chuỗi được xác nhận (all-or-nothing); không sinh tác động một phần. |
| E2E-19 | P0 học sinh được nghỉ hợp lệ nhưng vẫn đến lớp, sau đó khóa điểm danh/phát hành hóa đơn | Chốt ATTENDED = 1, không sinh quyền học bù; sửa sau khóa cần permission và audit, không sửa hóa đơn phát hành trực tiếp. |
| E2E-20 | P0 học phí 1.000.000đ đủ điều kiện ưu đãi anh/chị/em 10% và có đăng ký gói combo tương lai | P0 chỉ giảm 10%, thành 900.000đ; combo 5% và mức tổng 14,5% chỉ được áp dụng ở P1 khi đủ điều kiện thanh toán. |
| E2E-21 | P0 ghi nhận tiền mặt hoặc chuyển khoản thủ công, thanh toán một phần rồi gửi khoản vượt số còn nợ | Khoản hợp lệ cập nhật công nợ đúng một lần; khoản vượt bị từ chối, không gọi cổng thanh toán/ngân hàng. |
| E2E-22 | P0 đổi lịch, giao bài và mở dashboard khi dịch vụ gửi email OTP tạm thời không hoạt động | Các nghiệp vụ nội bộ, thông báo in-app và dashboard tiếp tục hoạt động; chỉ luồng chuyển phát OTP chịu lỗi dịch vụ email và báo trạng thái phù hợp. |

## 7. Các quyết định Q-01–Q-15 đã được chốt

Các câu hỏi của bản 1.0–1.2 đã được **quyết định làm baseline thiết kế của đồ án EduCore**, không còn ở trạng thái chờ trả lời. Bảng này là tóm tắt để truy vết; **điều kiện đầy đủ** tại `requirements_analysis.md` mục 7, giới hạn tích hợp tại mục 8 và luồng/AC tương ứng trong từng UC. Chúng chưa phải các chính sách đã được trung tâm thực tế xác nhận. Các chức năng gắn P1 không được tự coi là P0.

| ID | Quyết định áp dụng | UC chịu ảnh hưởng | Trạng thái |
|---|---|---|---|
| **Q-01** | Email/mật khẩu; OTP email một lần 15 phút, mật khẩu ≥12 ký tự/Argon2id; access 15 phút, refresh 7 ngày, thu hồi phiên. | UC-01–UC-04 | Đã chốt |
| **Q-02** | Manager/Academic Staff có quyền xác minh liên kết; Student/Parent tự gửi đơn nghỉ P0 và yêu cầu học bù/bảo lưu P1 nhưng không tự duyệt; xác minh anh/chị/em riêng. | UC-05, UC-06, UC-16–UC-18, UC-22 | Đã chốt |
| **Q-03** | Ghi danh PENDING/ACTIVE/SUSPENDED/COMPLETED/WITHDRAWN/TRANSFERRED; chuyển lớp có xác nhận, hiệu lực từ buổi tương lai; chênh lệch tài chính qua điều chỉnh. | UC-08–UC-10, UC-23, UC-26 | Đã chốt |
| **Q-04** | Lịch lặp tối đa 6 tháng, xác nhận all-or-nothing; sửa một buổi hoặc các buổi tương lai; timezone Asia/Ho_Chi_Minh, [start,end), hạn bù cuối ngày thứ 30. | UC-11–UC-13, UC-17 | Đã chốt |
| **Q-05** | Teacher xác nhận điểm danh; khóa sau 48h hoặc khi đã phát hành hóa đơn; sửa đặc biệt có audit; dự học thực tế = ATTENDED; xử lý học bù trong hạn gốc. | UC-15–UC-17, UC-23 | Đã chốt |
| **Q-06** | Tín dụng chỉ tính từ tiền đã thu cho buổi chưa dùng sau ưu đãi; khấu trừ sau ưu đãi mới, không tự hoàn/hết hạn; quay lại trước hạn cần duyệt. | UC-18, UC-19, UC-23, UC-26 | Đã chốt |
| **Q-07** | Dạy tối đa 8h/ngày, 40h/tuần baseline; bù cùng môn/trình độ/nội dung; dạy thay cần Teacher nhận + người có quyền duyệt, không tự xác nhận. | UC-17, UC-20, UC-33 | Đã chốt |
| **Q-08** | Ưu tiên giá buổi → lớp → khóa; tính theo tháng P0, hạn thanh toán 7 ngày, ROUND_HALF_UP cuối phép tính; gói trả trước P1. | UC-21–UC-25 | Đã chốt |
| **Q-09** | P0 ưu đãi anh/chị/em 10%; P1 thêm combo 5% trước rồi 10% sau, hiệu dụng 14,5%; không cộng dồn tùy ý. | UC-22, UC-23 | Đã chốt |
| **Q-10** | P0 tiền mặt/chuyển khoản đối soát và nhập thủ công, thu một phần/1 hóa đơn, từ chối vượt nợ; đảo khoản thu sai, không kết nối cổng thanh toán. | UC-25, UC-26 | Đã chốt |
| **Q-11** | Priority 1–5; điểm 0–10 (1 chữ số); PDF/DOCX/JPG/PNG, ≤10 MB/tệp và 5 tệp; nộp muộn 7 ngày, nộp lại trước chấm, công bố điểm thủ công. | UC-27–UC-29 | Đã chốt |
| **Q-12** | Dashboard P0 đếm học sinh ACTIVE duy nhất, lớp hoạt động và nợ hóa đơn phát hành; P1 có công thức chuyên cần/bài tập/điểm và báo cáo tài chính phân biệt. | UC-25, UC-30, UC-32 | Đã chốt |
| **Q-13** | P0 chỉ in-app + Manager xem tác vụ lỗi; P1 nhắc 24h/1h và email nghiệp vụ nếu triển khai; 3 retry sau 1/5/15 phút, chống trùng. | UC-31, UC-34, UC-37 | Đã chốt |
| **Q-14** | P0 ghi audit + tra cứu cơ bản có kiểm soát quyền, giữ 24 tháng baseline, log không sửa qua UI/không lộ OTP; P1 tra cứu nâng cao. | UC-35 | Đã chốt |
| **Q-15** | P0* = tenant isolation tuyệt đối, khởi tạo tenant qua vận hành; P1 vòng đời CREATED/ACTIVE/SUSPENDED/ARCHIVED; System Administrator không mặc định đọc dữ liệu tenant. | UC-36 | Đã chốt |

**Ràng buộc chung P0 Internal-first:** Không dùng dịch vụ nghiệp vụ ngoài. Chỉ cho phép gọi dịch vụ chuyển phát OTP email phục vụ xác minh/khôi phục tài khoản tại UC-03; OTP được sinh và kiểm tra trong Backend EduCore. Thanh toán được nhân sự ghi nhận thủ công, bài nộp do EduCore quản lý, thông báo P0 chỉ in-app, dashboard lấy dữ liệu nội bộ. Không tích hợp thanh toán tự động, Google Calendar, Gmail API/Google Sign-In, FCM/SMS/Zalo hoặc Google Drive/S3 bắt buộc trong MVP.

**Trạng thái:** 15/15 câu hỏi **đã giải quyết về mặt baseline đặc tả**; việc triển khai, test và hiệu chỉnh theo trung tâm thực tế là các công việc riêng. Nếu sửa chính sách, thay đổi Requirements Analysis trước rồi đối chiếu UC/AC/E2E.

## 8. Kiểm soát thay đổi đặc tả

1. Khi thay đổi thời hạn nghỉ/học bù, công thức học phí/giảm giá, thẩm quyền, mức tự động hóa hoặc ranh giới tích hợp P0, cập nhật tài liệu Requirements Analysis trước hoặc đồng thời với đặc tả này.
2. Giữ nguyên ID US/FR/BR và UC đã dùng; ghi phiên bản, lý do, người xác nhận và các UC/AC bị ảnh hưởng.
3. Đối chiếu lại các ma trận ở mục 5 và kịch bản mục 6; chỉ coi quyết định mục 7 là baseline đồ án đã chốt, không mặc định đó là chính sách đã xác nhận của trung tâm thực tế.
4. Luồng trạng thái chi tiết, schema dữ liệu, hợp đồng API và giao diện thuộc bước thiết kế tiếp theo; phải tuân thủ quy tắc và giới hạn P0/P1 đã nêu.
