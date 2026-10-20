# EduCore — SCREEN_SPECIFICATIONS (Stitch specification reused, tool-agnostic)

**Version:** 1.0 · **Authority:** Approved candidate UI inventory and specification baseline; individual screen behavior still requires per-screen sign-off. Not requirements or implemented code.

**Provenance:** Reworked from user-supplied `design.md` for Google Stitch (13/10/2026), plus EduCore Vibecoding 0.9 and approved Group A IAM/Billing technical decisions (17/10/2026). Retains screen cards' **Khối UI / Thao tác / Trạng thái** and FR/UC/BR/Q references; removes Stitch-specific generation instructions. New `AU06` is an implementation-design proposal derived from approved onboarding, not a new business FR.

**Read selectively:** open ONLY the requested screen ID and linked business UC; see `SCREEN_MAP.md` for canonical route/status. All 59 P0 design units are approved planning coverage, NOT 59 implemented/individually signed-off routes and NOT a request to generate all at once. `EX01`–`EX12` are future P1 **concepts only**.

**Normative precedence:** Requirements v5 baseline + O-12/Wallet v5.1 amendments → Use Case Spec v1.3 + corresponding amendments → Accepted Architecture → approved DB/Detailed/API contracts when actually available in checkout → this UI planning baseline (per-screen approval still required). User role listed is descriptive; Backend checks permission+scope. UI paths here are frontend proposals, not `/api/v1` endpoints. For screen approval use `SCREEN_REVIEW_TEMPLATE.md`.

**Amendment 20/10/2026 (docs alignment):** O-12 (18/10) và Wallet B1–B5 (19/10) là quyết định **business approved** của Requirements/UC hiện tại. Các cách đặt component/host và trạng thái UX bên dưới là **PROPOSED** cho review từng màn hình; Q1–Q8 Wallet về schema/API/locking/receipt còn **PENDING TECHNICAL SIGN-OFF**. AC là DESIGNED, không phải runtime PASS. Không suy ra route hoặc tính năng đã triển khai.

## A. Reusable patterns

| Pattern | When to reuse | Core example |
|---|---|---|
| AUTH | Login, OTP, activation, select tenant | AU01/AU04/AU06 |
| DASH | Only approved business KPI and next task | G01/PO01 |
| LIST | Tables and scoped filters | AC01/BL06/OP04 |
| DETAIL | Read-only evidence plus permission-gated actions | AC02/BL07 |
| FORM | Validation, review and unsaved warning | SC03/AC09 |
| CAL | Calendar and agenda, accessible resources | SC01/SC06 |
| REVIEW | Explicit consequences, decision vs execution | SC04/OP05/BL05 |
| TASK | Quick attendance/grading/submission mobile flow | AT02/AS07 |

Keep page shell reference `G01`, canonical data list `AC01`, complex form `SC03`, mobile task `AT02`/`AS07`. Design default/loading/empty/validation/forbidden/conflict/success+responsive; also specific business edge states below. Each design acceptance checklist must link API status and data semantics before coding.

## B. Detailed screen cards (P0 and separate P1 concepts)

### Chi tiết màn hình (dùng Screen ID để tìm; P1 chỉ concept)

#### A. Authentication & Shared

**AU01 — Đăng nhập [P0]**  
`UI route đề xuất:` `/login` · `Actor thường gặp:` Tất cả · `Nguồn trace:` UC-01 · Q-01 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Logo EduCore, email, mật khẩu, quên mật khẩu, vùng thông báo không tiết lộ tài khoản.
- **Thao tác & luồng:** Đăng nhập → chọn tenant nếu có nhiều membership; trạng thái loading; lỗi đăng nhập chung không tiết lộ email tồn tại.
- **Trạng thái cần thiết kế:** Lỗi dữ liệu, sai thông tin, tài khoản không hoạt động, giới hạn lượt thử.


- **Nhóm A:** Access token không lưu localStorage; refresh cookie HttpOnly chỉ được xử lý theo API contract. Không tự thêm “Remember me” khi chưa có hợp đồng sản phẩm.

**AU02 — Chọn trung tâm [P0]**  
`UI route đề xuất:` `/select-tenant` · `Actor thường gặp:` Người có nhiều tenant · `Nguồn trace:` UC-01 · UC-36 · Q-15 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Danh sách thẻ tenant được phép, tên và mã, trạng thái membership, current selection.
- **Thao tác & luồng:** Chọn tenant ACTIVE/được phép; chuyển tiếp đến landing theo quyền; không liệt kê tenant ngoài membership.
- **Trạng thái cần thiết kế:** Một tenant, nhiều tenant, tenant bị khóa, hết phiên.

**AU03 — Yêu cầu OTP khôi phục [P0]**  
`UI route đề xuất:` `/forgot-password` · `Actor thường gặp:` Người quên mật khẩu · `Nguồn trace:` UC-03 · Q-01 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Email field, lời giải thích gửi OTP một lần qua email, trạng thái đã yêu cầu và thông tin chống spam trung tính.
- **Thao tác & luồng:** Gửi yêu cầu; điều hướng nhập OTP; không hiển thị email có tồn tại hay không.
- **Trạng thái cần thiết kế:** Đang gửi, giới hạn yêu cầu, lỗi mail service, đã gửi phản hồi trung tính.

**AU04 — Nhập OTP và đặt mật khẩu [P0]**  
`UI route đề xuất:` `/reset-password` · `Actor thường gặp:` Người đang khôi phục · `Nguồn trace:` UC-03 · Q-01 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Ô nhập OTP, hạn 15 phút, nhập mật khẩu mới ≥12 ký tự, xác nhận mật khẩu, tiêu chí hợp lệ.
- **Thao tác & luồng:** Xác thực OTP một lần; đổi mật khẩu; hết hạn → xin mã mới; thành công quay lại login.
- **Trạng thái cần thiết kế:** OTP sai/hết hạn/đã sử dụng, mật khẩu yếu, thành công.


- **Nhóm A:** OTP được xác minh + đổi mật khẩu trong **một** request `/api/v1/auth/password/reset`; không dựng bước verify riêng hoặc reset authorization token.

**AU05 — Hồ sơ tài khoản & phiên [P0]**  
`UI route đề xuất:` `/app/:tenantId/me` · `Actor thường gặp:` Tất cả user đã đăng nhập · `Nguồn trace:` UC-02 · UC-04 · Q-01 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Tên/email (đúng quyền cập nhật), tenant hiện tại, vai trò được gán, nút đổi mật khẩu khi API hỗ trợ, đăng xuất.
- **Thao tác & luồng:** Chỉnh sửa trường self-service đã cho phép; đăng xuất thu hồi phiên; không cho user tự đổi role/permission.
- **Trạng thái cần thiết kế:** Read-only field, đang lưu, hết phiên, lỗi xác thực.


**AU06 — Kích hoạt tài khoản lần đầu bằng OTP [P0 — Group A onboarding]**  
`UI route đề xuất:` `/activate-account` · `Actor:` Manager đầu tiên hoặc thành viên PENDING_ACTIVATION · `Trace:` Group A IAM / UC-01/04 hỗ trợ · `Artboard:` Desktop + Mobile  
- **Khối UI:** Email đã đăng ký (hoặc nhập email), yêu cầu mã OTP email, nhập OTP (15 phút), mật khẩu mới tối thiểu 12 ký tự, xác nhận mật khẩu, nút Kích hoạt tài khoản. Gắn nhãn trạng thái chưa kích hoạt.  
- **Thao tác & luồng:** `/api/v1/auth/activation/otp/request` trả phản hồi trung tính; `/api/v1/auth/activation/complete` xác minh OTP purpose ACTIVATION, đặt Argon2id password và kích hoạt account atomically. Manager đầu tiên kích hoạt thành công mới cho tenant hoạt động.  
- **Trạng thái:** pending, OTP expired/incorrect, retry rate limit, already active, invalid password, success, no tenant access. Không gửi email invitation nghiệp vụ hoặc mật khẩu tạm.  
- **Bảo mật:** không lộ người dùng/email có tồn tại; không lưu OTP/password vào logs, không giả lập kích hoạt thành công trong prototype.  

**GL01 — Trung tâm thông báo in-app [P0]**  
`UI route đề xuất:` `/app/:tenantId/notifications` · `Actor thường gặp:` Các recipient hợp lệ · `Nguồn trace:` UC-31 · FR-37–39 · Q-13 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Thông báo đổi/hủy lịch đã xác nhận và bài tập mới được giao, chưa đọc/đã đọc, thời điểm, liên kết nguồn.
- **Thao tác & luồng:** Đánh dấu đã đọc; mở đúng lịch/bài tập nếu có quyền; chống tạo trùng.
- **Trạng thái cần thiết kế:** Empty inbox, unread/read, liên kết không còn quyền, loading.

**GL02 — Không đủ quyền / không tìm thấy [P0]**  
`UI route đề xuất:` `/403 · /404` · `Actor thường gặp:` Tất cả · `Nguồn trace:` UC-36 · FR-04 · FR-42 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Thông báo ngắn, không để lộ tenant/record, nút quay lại trang phù hợp.
- **Thao tác & luồng:** Không có nút vượt quyền; không hiển thị thông tin về sự tồn tại record ngoài tenant.
- **Trạng thái cần thiết kế:** 403, 404, hết phiên/tenant không hợp lệ.


#### B. Management & Operations

**G01 — Dashboard quản lý [P0]**  
`UI route đề xuất:` `/app/:tenantId/overview` · `Actor thường gặp:` Manager/người có permission reporting · `Nguồn trace:` UC-32 · FR-40 · Q-12 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** ĐÚNG 3 thẻ KPI: học sinh ACTIVE duy nhất, lớp ACTIVE, công nợ ISSUED còn phải thu; phạm vi tenant và mốc cập nhật; lối tắt đến danh sách có quyền.
- **Thao tác & luồng:** Click KPI → trang tương ứng; đổi tenant khi có quyền; không đưa báo cáo chuyên cần/doanh thu nâng cao vào P0.
- **Trạng thái cần thiết kế:** KPI = 0, truy vấn lỗi, loading, thiếu quyền từng KPI.

**OP01 — Tài khoản người dùng [P0]**  
`UI route đề xuất:` `/app/:tenantId/settings/members` · `Actor thường gặp:` Manager/người có quyền member.read/member.create/member.update · `Nguồn trace:` UC-04 · FR-02 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng tên, email, trạng thái, membership trong tenant, nhóm role; lọc và tìm kiếm.
- **Thao tác & luồng:** Tạo/quản lý tài khoản theo quyền, khóa/mở khi hợp lệ; click xem chi tiết; không xóa cứng tùy tiện.
- **Trạng thái cần thiết kế:** Không tìm thấy, tài khoản khóa, giới hạn quyền.

**OP02 — Chi tiết tài khoản và gán role [P0]**  
`UI route đề xuất:` `/app/:tenantId/settings/members/:membershipId` · `Actor thường gặp:` Manager/người có quyền IAM · `Nguồn trace:` UC-04–05 · FR-03–04 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Thông tin tài khoản, trạng thái, role hiện tại, scope Tenant/Class/Student, lịch sử điều chỉnh cơ bản.
- **Thao tác & luồng:** Gán/thu hồi role seed có phạm vi và xác nhận; P0 không cho cấu hình động permission catalog.
- **Trạng thái cần thiết kế:** Một user nhiều role, thao tác nguy hiểm, không đủ quyền, role đang có hiệu lực.


- **Nhóm A:** chỉ gán role nằm trong permission seed P0 và theo phạm vi được cấp; protect last active Manager. Member mới bắt đầu PENDING_ACTIVATION, không gửi mật khẩu tạm.

**OP03 — Liên kết phụ huynh–học sinh [P0]**  
`UI route đề xuất:` `/app/:tenantId/relationships` · `Actor thường gặp:` Manager/Academic Staff được cấp quyền · `Nguồn trace:` UC-06 · Q-02 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng phụ huynh ↔ học sinh, trạng thái xác minh, căn cứ và người xác minh, form tạo/thu hồi liên kết.
- **Thao tác & luồng:** Tìm Parent và Student **cùng tenant**, xác minh dựa chứng cứ rồi kích hoạt; revoke phải có xác nhận.
- **Trạng thái cần thiết kế:** Pending verification, active, revoked, child không thuộc tenant.

**OP04 — Danh sách phê duyệt [P0]**  
`UI route đề xuất:` `/app/:tenantId/approvals` · `Actor thường gặp:` Người có permission approve · `Nguồn trace:` UC-26 · UC-34 · BR-08–11 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Tab Chờ xử lý / Cần bổ sung / Đã duyệt chờ thực thi / Hoàn thành; loại yêu cầu, mức độ khẩn, người yêu cầu, thời điểm, scope.
- **Thao tác & luồng:** Mở request; lọc theo nghiệp vụ tài chính/học vụ; không tự nhận quyền chỉ vì tên role.
- **Trạng thái cần thiết kế:** PENDING_APPROVAL, NEEDS_INFORMATION, REJECTED, APPROVED (decision bền vững/chưa hoàn tất), COMPLETED; execution lỗi có outcome riêng.

**OP05 — Xem xét và quyết định phê duyệt [P0]**  
`UI route đề xuất:` `/app/:tenantId/approvals/:requestId` · `Actor thường gặp:` Người có quyền xử lý request · `Nguồn trace:` UC-26 · UC-34 · BR-11 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Evidence/đối tượng gốc; request reason; chính sách áp dụng; timeline; fields lý do, quyết định; cảnh báo self-approve financial.
- **Thao tác & luồng:** Approve/Reject/Request information; lưu quyết định APPROVED trước, sau đó chỉ người có quyền mới thực thi rõ ràng và kiểm tra lại quyền/dữ liệu/payload đã duyệt. Chỉ báo COMPLETED khi effect, receipt, audit commit; lỗi thực thi giữ quyết định APPROVED và cho đối soát/retry cùng root khi hợp lệ.
- **Trạng thái cần thiết kế:** Not authorized, stale/changed context, approval success but execution failed, SELF_APPROVED flag.

**OP06 — Tra cứu audit log [P0]**  
`UI route đề xuất:` `/app/:tenantId/audit` · `Actor thường gặp:` Manager/được phép đọc audit · `Nguồn trace:` UC-35 · Q-14 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng action, object, actor, time, result, reason; lọc đối tượng/người/thời gian/kết quả; detail timeline drawer.
- **Thao tác & luồng:** Chỉ read-only; lọc theo tenant/scope; không lộ OTP, mật khẩu, nội dung riêng tư; retention baseline 24 tháng.
- **Trạng thái cần thiết kế:** No records, denied, long text safely truncated, detail expanded.

**OP07 — Quản lý job và retry [P0]**  
`UI route đề xuất:` `/app/:tenantId/operations/jobs` · `Actor thường gặp:` Manager/người có permission vận hành · `Nguồn trace:` UC-37 · BR-12 · Q-13 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Danh sách job: loại, source, policy version, status, attempt, error reason, correlation ID; filter FAILED/NEEDS_INFORMATION/PENDING_APPROVAL.
- **Thao tác & luồng:** Xem job; retry thủ công nếu được phép; xác nhận rerun; cùng idempotency root, không hiển thị auto-infinite retry. Manual recovery sau exhausted retries là PROPOSED/PENDING TECHNICAL SIGN-OFF, chưa thành nút P0 được duyệt.
- **Trạng thái cần thiết kế:** Queued, running, failed, needs info, retried, completed.


#### C. Academic Management

**AC01 — Danh sách học sinh [P0]**  
`UI route đề xuất:` `/app/:tenantId/students` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-07 · FR-07 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** DataTable: mã, tên, lớp ACTIVE, trạng thái hồ sơ, liên hệ theo quyền; tìm kiếm, lọc lớp/trình độ, phân trang.
- **Thao tác & luồng:** Tạo hồ sơ, xem chi tiết, mở sửa; row action theo permission; StudentProfile không bắt buộc có tài khoản login.
- **Trạng thái cần thiết kế:** No students, no results, duplicate student code, restricted columns.

**AC02 — Chi tiết/chỉnh sửa học sinh [P0]**  
`UI route đề xuất:` `/app/:tenantId/students/:studentId` · `Actor thường gặp:` Người có quyền hồ sơ/học vụ · `Nguồn trace:` UC-07 · UC-10 · UC-06 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Header name/code; tabs Hồ sơ · Ghi danh · Lịch học · Người giám hộ/liên kết · Lịch sử; thông tin cơ bản.
- **Thao tác & luồng:** Edit side sheet; mở luồng ghi danh/chuyển lớp; chỉ dữ liệu đúng scope; không pha dashboard P1 tiến độ.
- **Trạng thái cần thiết kế:** No enrollment, inactive record, linked parent, audit/history loading.

**AC03 — Danh sách giáo viên [P0]**  
`UI route đề xuất:` `/app/:tenantId/teachers` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-07 · UC-09 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng teacher code, họ tên, môn/trình độ năng lực, lớp phụ trách, status.
- **Thao tác & luồng:** Tạo/sửa hồ sơ; xem chi tiết; lọc theo môn/trình độ; profile có thể tồn tại trước account.
- **Trạng thái cần thiết kế:** No data, inactive teacher, no assigned classes.

**AC04 — Chi tiết giáo viên & phân công [P0]**  
`UI route đề xuất:` `/app/:tenantId/teachers/:teacherId` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-07 · UC-09 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Hồ sơ, năng lực/môn dạy, danh sách phân công hiện hành và lịch sử, lịch dạy liên kết.
- **Thao tác & luồng:** Phân công vào lớp theo quyền, cập nhật/cắt hiệu lực có dấu vết; kiểm tra eligibility/lịch khi xếp thực tế.
- **Trạng thái cần thiết kế:** Teacher chưa có membership, nhiều lớp, không có năng lực được xác minh.

**AC05 — Danh mục môn & trình độ [P0]**  
`UI route đề xuất:` `/app/:tenantId/academic/catalog` · `Actor thường gặp:` Người có quyền quản lý đào tạo · `Nguồn trace:` UC-08 · FR-08 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Hai tab Subjects và Levels; code/name, status, sort order; CRUD side sheets.
- **Thao tác & luồng:** Tạo/sửa/ẩn danh mục theo quyền; cảnh báo khi đã được khóa/lớp tham chiếu.
- **Trạng thái cần thiết kế:** Empty, duplicate code, inactive category.

**AC06 — Danh sách khóa học [P0]**  
`UI route đề xuất:` `/app/:tenantId/courses` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-08 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng mã/tên khóa, môn, trình độ, trạng thái; form tên, môn, level, mô tả.
- **Thao tác & luồng:** Tạo/sửa, mở lớp thuộc khóa; không xóa làm mất lịch sử.
- **Trạng thái cần thiết kế:** Khóa chưa có lớp, inactive subject, form invalid.

**AC07 — Danh sách lớp học [P0]**  
`UI route đề xuất:` `/app/:tenantId/classes` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-08–10 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng mã/lớp, khóa, teacher, capacity, ACTIVE status, số học sinh; filter và CTA tạo lớp.
- **Thao tác & luồng:** Tạo/sửa lớp; mở chi tiết, xếp lịch, ghi danh; không vượt số chỗ.
- **Trạng thái cần thiết kế:** Planned/Active/Completed, empty/no results, full class.

**AC08 — Chi tiết lớp & học sinh ghi danh [P0]**  
`UI route đề xuất:` `/app/:tenantId/classes/:classId` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-08–10 · UC-14 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Thông tin lớp, môn/trình độ/capacity, teacher assignments, danh sách enrollment với trạng thái, lịch sắp tới và history.
- **Thao tác & luồng:** Ghi danh, chuyển lớp có xác nhận, chỉnh sửa teacher assignment, xem buổi học; tôn trọng class scope.
- **Trạng thái cần thiết kế:** Lớp đầy, enrollment PENDING/ACTIVE/TRANSFERRED, lịch rỗng.

**AC09 — Ghi danh / chuyển lớp [P0]**  
`UI route đề xuất:` `embedded: /enrollments (wizard/sheet)` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-10 · Q-03 · BR-13 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Wizard chọn học sinh/lớp, kiểm tra chỗ/trình độ/lịch, thời điểm hiệu lực tương lai, summary tác động học vụ/tài chính.
- **Thao tác & luồng:** Confirm thủ công bởi người có permission; ghi lịch sử lớp cũ; tài chính chênh lệch đưa vào review đúng quyền.
- **Trạng thái cần thiết kế:** Capacity conflict, schedule conflict, insufficient permission, future-effective, rollback.


#### D. Scheduling & Resources

**SC01 — Lịch học trung tâm [P0]**  
`UI route đề xuất:` `/app/:tenantId/schedule` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-12–14 · BR-01 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Calendar tuần/ngày/tháng; bộ lọc giáo viên/phòng/lớp; màu status, legend; thông tin thời gian, resource, attendance markers.
- **Thao tác & luồng:** Chọn slot → tạo buổi; click buổi → details; đổi/hủy nếu có quyền; khi P0 xung đột chỉ cảnh báo/chặn, **không gợi ý tối ưu giờ tự động**.
- **Trạng thái cần thiết kế:** DRAFT/CONFIRMED/CANCELLED, no events, overlapping blocked, timezone.

**SC02 — Phòng học & lịch bận tài nguyên [P0]**  
`UI route đề xuất:` `/app/:tenantId/resources` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-11 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Tab Phòng học và Lịch bận; room capacity/location/status; calendar/timeline unavailable room/teacher/student theo quyền.
- **Thao tác & luồng:** Tạo/sửa phòng; khai báo unavailable range; cảnh báo overlap; xác nhận lịch bận.
- **Trạng thái cần thiết kế:** Room capacity invalid, blocked slot, cancelled unavailability.

**SC03 — Tạo lịch/buổi học [P0]**  
`UI route đề xuất:` `/app/:tenantId/schedule/create` · `Actor thường gặp:` Manager/Academic Staff có quyền · `Nguồn trace:` UC-12 · BR-01 · Q-04 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Form chọn lớp, giáo viên, phòng/online, ngày/giờ start-end; single/weekly repeat, weekday, from-to ≤6 tháng; review preview list.
- **Thao tác & luồng:** Validate; kiểm tra xung đột giáo viên/phòng/học sinh/capacity; tạo draft/confirm series **all-or-nothing**; action có quyền.
- **Trạng thái cần thiết kế:** Error per field, conflict summary with affected session, concurrent conflict at commit, series rejected entirely.


- **Không được hiểu nhầm:** preview chỉ là đề xuất kiểm tra; chưa giữ phòng/lớp. Backend recheck khi confirm, commit cả chuỗi hoặc không buổi nào.

**SC04 — Xem/xác nhận xung đột lịch [P0]**  
`UI route đề xuất:` `embedded: SC03/SC05 conflict panel` · `Actor thường gặp:` Người được xếp lịch · `Nguồn trace:` UC-12–13 · BR-01 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng các buổi conflict: thời gian, lớp, resource chung, lý do, liên kết lịch liên quan; phân biệt overlap và capacity.
- **Thao tác & luồng:** Chỉ xác nhận khi không có conflict và đủ capacity; nút sửa lại lịch; không có nút override quy tắc cấm.
- **Trạng thái cần thiết kế:** Zero conflict success, 1/many conflicts, race conflict khi submit.

**SC05 — Chi tiết buổi / đổi / hủy lịch [P0]**  
`UI route đề xuất:` `/app/:tenantId/schedule/sessions/:sessionId` · `Actor thường gặp:` Người xem lịch hợp lệ; edit theo quyền · `Nguồn trace:` UC-13–14 · Q-04 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Thông tin lớp, teacher, room, attendees theo scope, trạng thái, timeline thay đổi; actions sửa một buổi hoặc các buổi tương lai, hủy với lý do.
- **Thao tác & luồng:** Recheck conflict khi đổi, confirm rồi mới thông báo in-app; không sửa lịch quá khứ; hủy giải phóng tài nguyên.
- **Trạng thái cần thiết kế:** Cancelled, history-only, future series change, permission-denied, notification queued.

**SC06 — Lịch cá nhân [P0]**  
`UI route đề xuất:` `/app/:tenantId/my/schedule` · `Actor thường gặp:` Teacher/Student/Parent (trong scope) · `Nguồn trace:` UC-14 · UC-30 (phần xem P0) · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Calendar read-only hoặc danh sách buổi sắp tới; Teacher xem lịch được phân công; Student lịch mình; Parent chọn con liên kết.
- **Thao tác & luồng:** Đi đến session details; Parent đổi child; không sửa lịch nếu thiếu permission.
- **Trạng thái cần thiết kế:** Không có lịch, cancelled event, nhiều con, Mobile agenda.


#### E. Attendance & Leave

**AT01 — Danh sách buổi cần điểm danh [P0]**  
`UI route đề xuất:` `/app/:tenantId/attendance` · `Actor thường gặp:` Teacher và người có quyền theo scope · `Nguồn trace:` UC-15 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Buổi hôm nay/quá hạn/chưa xác nhận; lớp, thời gian, student count, trạng thái finalization.
- **Thao tác & luồng:** Mở sheet điểm danh, sắp theo buổi; nêu deadline khóa ở chi tiết.
- **Trạng thái cần thiết kế:** No classes, not started, finalized, locked.

**AT02 — Bảng điểm danh theo buổi [P0]**  
`UI route đề xuất:` `/app/:tenantId/sessions/:sessionId/attendance` · `Actor thường gặp:` Teacher phụ trách có quyền · `Nguồn trace:` UC-15 · BR-04 · Q-05 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Danh sách học sinh với radio ATTENDED/EXCUSED/UNEXCUSED, mã/ghi chú, trạng thái đơn nghỉ duyệt, công tắc xác nhận toàn bộ.
- **Thao tác & luồng:** Lưu nháp; xác nhận bộ điểm danh; không đánh dấu EXCUSED thiếu đơn hợp lệ; sau khóa chuyển correction.
- **Trạng thái cần thiết kế:** Partially filled, excused approved, not confirmed, finalized, locked (48h/issued invoice).

**AT03 — Gửi đơn xin nghỉ [P0]**  
`UI route đề xuất:` `/app/:tenantId/leave-requests/new` · `Actor thường gặp:` Student/Parent cho child liên kết · `Nguồn trace:` UC-16 · BR-04 · Q-02 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Chọn student (Parent), buổi học sắp tới, lý do, thời gian còn lại tới giờ bắt đầu, status giải thích.
- **Thao tác & luồng:** Submit request; gửi trước ≥24h mới là đúng hạn nhưng vẫn phải chờ duyệt; đơn muộn flagged exception, không tự EXCUSED.
- **Trạng thái cần thiết kế:** On time, late notice warning, duplicate active request, not authorized.

**AT04 — Danh sách và xử lý đơn nghỉ [P0]**  
`UI route đề xuất:` `/app/:tenantId/leave-requests` · `Actor thường gặp:` Student/Parent xem đơn mình; staff có quyền duyệt · `Nguồn trace:` UC-16 · Q-02 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Queue PENDING/APPROVED/REJECTED, thông tin học sinh/buổi/lý do, badge nộp muộn; tabs đơn mình/chờ xử lý theo permission.
- **Thao tác & luồng:** Review, approve/reject với lý do; xử lý muộn cần exception permission; Student/Parent không tự duyệt.
- **Trạng thái cần thiết kế:** Pending, approved, rejected, needs info, permission blocked.

**AT05 — Đề nghị điều chỉnh điểm danh [P0]**  
`UI route đề xuất:` `embedded: /attendance/corrections (sheet/list)` · `Actor thường gặp:` Người có permission correction · `Nguồn trace:` UC-15 · Q-05 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** So sánh trạng thái cũ/mới; lý do; impacted invoice marker; audit timeline.
- **Thao tác & luồng:** Sửa sau khóa bằng luồng đặc biệt; nếu invoice ISSUED thì tạo luồng điều chỉnh tài chính riêng, không sửa invoice gốc.
- **Trạng thái cần thiết kế:** Locked, adjustment required, approved, rejected.


#### F. Billing & Receivables

**BL01 — Bảng đơn giá học phí [P0]**  
`UI route đề xuất:` `/app/:tenantId/finance/pricing` · `Actor thường gặp:` Accountant/Manager được cấp quyền · `Nguồn trace:` UC-21 · Q-08 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng PriceRule theo scope Buổi/Lớp/Khóa, VND, cửa sổ ngày hiệu lực `[from,to)`, timezone tenant đã freeze, version và trạng thái; ví dụ ngày bắt đầu buổi so với ngày tạo draft.
- **Thao tác & luồng:** Tạo rule có ngày hiệu lực hợp lệ; hiển thị thứ tự Session→Class→Course. Giá buổi chọn theo local date của **session start**, không theo ngày nhập phí/draft/issue; không backdate giá đã có buổi bắt đầu hoặc cập nhật ngầm invoice ISSUED. Calculation policy pin riêng với ngày chọn PriceRule.
- **Trạng thái cần thiết kế:** Overlapping rules, missing price, mutation hồi tố bị chặn, read-only historical version.

**BL02 — Xác minh và áp dụng ưu đãi anh/chị/em [P0]**  
`UI route đề xuất:` `/app/:tenantId/finance/discount-eligibility` · `Actor thường gặp:` Accountant/Manager có quyền · `Nguồn trace:` UC-22 · Q-02 · Q-09 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Danh sách cặp học sinh được xác minh, tenant, evidence status, ưu đãi 10%, enrollment hợp lệ; workflow xác minh.
- **Thao tác & luồng:** Approve eligibility dựa vào chứng cứ, không dựa chung parent/name; chỉ một loại ưu đãi P0, không hiển thị combo P1.
- **Trạng thái cần thiết kế:** Unverified, verified, revoked, enrollment inactive.

**BL03 — Kỳ học phí & generation tính [P0]**

`UI route đề xuất:` `/app/:tenantId/finance/billing-periods` · `Actor thường gặp:` Accountant/Manager · `Nguồn trace:` UC-23 · BR-04 · Q-08 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Chọn kỳ tháng theo local session-start date tại timezone tenant đã freeze; tiến độ nguồn, billing run và current generation, policy pin, lý do/diff khi tính lại draft.
- **Thao tác & luồng:** Tạo draft sau kỳ khi đủ dữ liệu; thiếu giá/điểm danh đã xác nhận → NEEDS_INFORMATION, không mặc định giá 0. Retry cùng key/generation giữ kết quả; recompute có chủ đích cho DRAFT cần key/lý do/expected generation mới và giữ lịch sử G1/G2. Không recompute invoice ISSUED hoặc tự debit ví.
- **Trạng thái cần thiết kế:** Not ready, running, needs information, completed, failed, stale generation/concurrent recompute.

**BL04 — Danh sách hóa đơn dự thảo [P0]**  
`UI route đề xuất:` `/app/:tenantId/finance/drafts` · `Actor thường gặp:` Accountant/Manager · `Nguồn trace:` UC-23–24 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** DataTable mã draft, học sinh, kỳ, tổng trước/sau ưu đãi, policy, status; filter.
- **Thao tác & luồng:** Mở review; chỉ phát hành thủ công khi đã kiểm tra và có quyền; không nút bulk auto-issue P0.
- **Trạng thái cần thiết kế:** DRAFT, NEEDS_INFORMATION, no draft, failed calculation.

**BL05 — Rà soát và phát hành hóa đơn nội bộ [P0]**  
`UI route đề xuất:` `/app/:tenantId/finance/drafts/:draftId` · `Actor thường gặp:` Accountant/Manager có quyền phát hành · `Nguồn trace:` UC-23–24 · BR-13 · Q-08–09 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Student, kỳ theo local start, current generation và snapshot từng session: source date/timezone, PriceRule/window/unit price, pinned calculation policy; ATTENDED/UNEXCUSED=1, EXCUSED/CANCELLED=0; gross, sibling 10% nếu hợp lệ, HALF_UP một lần cuối, total, due +7 ngày theo Backend. Cùng tháng có thể có nhiều đơn giá.
- **Thao tác & luồng:** Chỉ phát hành sau xác nhận thủ công; kiểm quyền, nguồn và current generation lại trước issue; source/generation stale thì chặn và yêu cầu review, không reprice hoặc repin tại issue. Không tự trừ ví khi tạo draft/issue.
- **Trạng thái cần thiết kế:** Incomplete attendance/price, discrepancy, approval needed, stale source/generation, issue success.


- **Billing O-12:** một hóa đơn logic cho mỗi (tenant, student, local-start month), dòng có thể đến từ nhiều lớp/giá; số hóa đơn chỉ cấp lúc ISSUE. Hạn 7 ngày sau phát hành hiển thị theo kết quả Backend. ISSUED giữ line/claim lịch sử, điều chỉnh qua UC-26.

**BL06 — Danh sách hóa đơn đã phát hành [P0]**  
`UI route đề xuất:` `/app/:tenantId/finance/invoices` · `Actor thường gặp:` Accountant/Manager; người xem theo scope · `Nguồn trace:` UC-24–26 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng số hóa đơn nội bộ, Student, issued/due date, total, paid, outstanding, trạng thái; filter theo kỳ/hạn/đã thu. Khi được phép xem, phân biệt Payment WALLET mới với CASH/BANK_TRANSFER legacy; balance ví chưa phân bổ không tính vào paid.
- **Thao tác & luồng:** Mở chi tiết; request adjustment/cancel; không có action sửa thẳng tiền/line ISSUED.
- **Trạng thái cần thiết kế:** ISSUED/settled/overdue/cancelled (nhãn thể hiện đúng domain), empty.

**BL07 — Chi tiết hóa đơn & lịch sử thu [P0]**  
`UI route đề xuất:` `/app/:tenantId/finance/invoices/:invoiceId` · `Actor thường gặp:` Accountant/Manager; Student/Parent scope view · `Nguồn trace:` UC-24–26 · Q-10 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Invoice ID nhãn HÓA ĐƠN NỘI BỘ; line snapshot gồm ngày buổi/giá áp dụng; original và adjusted obligation, WALLET payment, outstanding, due date và adjustment/refund timeline. Nhân sự có quyền xem allocation/signed releases để đối soát; Student/Parent chỉ thấy summary/history được phép. Balance ví tách khỏi tiền đã trả invoice và công nợ.
- **Thao tác & luồng:** Nhân sự có financial permission đúng student/tenant scope mở BL08 để trả invoice từ ví hoặc BL10 để đề nghị điều chỉnh; Parent/Student chỉ read-only đúng người; không in nhãn hóa đơn điện tử hợp pháp.
- **Trạng thái cần thiết kế:** Insufficient wallet balance, partially/fully paid, overdue, adjustment pending, APPROVED chưa execute, refunded/completed; legacy/mixed history vẫn đọc theo quyền, affected mutation thiếu policy thì blocked.


- **Wallet amendment:** với nguồn thuần Wallet, sau authorized execution của điều chỉnh/hủy đã duyệt, chỉ phần payment **ròng vượt nghĩa vụ mới** được release/credit vào ví và hiển thị receipt; APPROVED riêng COMPLETED. Legacy/mixed hoặc excess cũ thiếu policy/bằng chứng: chặn execution liên quan để đối soát, không tự chuyển ví. Parent/Student chỉ xem dữ liệu được phép, không thấy công cụ xử lý nội bộ.

**BL08 — Nạp ví thủ công / thanh toán invoice từ ví [P0]**

`UI host đề xuất:` `embedded: BL09 student wallet panel; BL07 invoice payment dialog` · `Actor thường gặp:` nhân sự có financial permission hiện hành đúng student/tenant scope · `Nguồn trace:` UC-25 · FR-30 · Q-10 (Wallet) · `Artboard đề xuất:` Desktop + Mobile review · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Hai hành động tách biệt. **Nạp ví:** chọn student, receipt đã xác minh ngoài hệ thống, CASH/BANK_TRANSFER, amount VND>0, receivedAt/reference/evidence; không cần invoice. **Trả invoice:** invoice ISSUED của cùng student/tenant, balance khả dụng, outstanding, amount nhập rõ (partial/full), xem trước balance/due sau thao tác. Không hiển thị CASH/BANK_TRANSFER là phương thức Payment của invoice mới.
- **Thao tác & luồng:** Staff xác nhận nạp sau đối soát thủ công; TOP_UP tăng ví và không tạo invoice Payment/doanh thu. Staff chủ động trả một invoice bằng WALLET; yêu cầu `0<amount<=balance` và `<=outstanding`, không tự giảm amount thành partial. Chờ receipt/server state sau submit, cùng key/receipt không tăng ví hoặc debit lặp. Không tự debit khi draft/issue/recompute, Student/Parent không có mutation.
- **Trạng thái cần thiết kế:** Receipt duplicate/key conflict, insufficient balance, over-outstanding, invoice draft/cancelled, partial/full success, concurrent/stale conflict, unknown commit cần tra receipt, forbidden; affected legacy/mixed collection thiếu policy thì blocked.

**BL09 — Công nợ, ví & khoản thu [P0]**

`UI route đề xuất:` `/app/:tenantId/finance/receivables` · `Actor thường gặp:` Accountant/Manager có quyền · `Nguồn trace:` UC-25 · Q-12 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Bảng student/invoice, outstanding, due date, overdue; khu vực ví theo student với balance và lịch sử TOP_UP/debit/credit/reversal theo quyền. Tách rõ verified cash received, wallet balance, invoice allocated payments và công nợ; tổng công nợ chỉ ISSUED sau điều chỉnh/allocation hợp lệ.
- **Thao tác & luồng:** Lọc, mở invoice; nhân sự đủ quyền mở BL08 nạp ví độc lập invoice hoặc trả invoice từ ví. Không tự lấy số dư ví để giảm công nợ; hạn chế export nâng cao nếu chưa xác định.
- **Trạng thái cần thiết kế:** No debt, wallet no history/balance 0, overdue, partially paid, paid, legacy/mixed cần đối soát.


- **Wallet amendment:** phần credit sau approved execution được thể hiện trong lịch sử ví và allocation release, không cộng thêm vào verified cash received. Excess legacy/mixed chưa có policy được gắn cờ cần đối soát riêng; KPI công nợ P0 chỉ tổng phải thu không âm từ ISSUED invoices, không tính unused wallet.

**BL10 — Yêu cầu điều chỉnh/hủy hóa đơn [P0]**  
`UI route đề xuất:` `/app/:tenantId/finance/invoices/:invoiceId/adjust` · `Actor thường gặp:` Accountant/Manager có quyền · `Nguồn trace:` UC-26 · BR-11 · Q-10 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Invoice original read-only; loại AMOUNT/CANCELLATION, nghĩa vụ trước/sau, payment ròng còn allocate, phần refund dự kiến `max(P_before−N_after,0)` với `P_before` là net allocated payment hiện hành khi nguồn thuần Wallet, lý do/evidence và tác động balance/due dự kiến.
- **Thao tác & luồng:** Tạo PENDING_APPROVAL; OP05 duyệt thủ công rồi authorized execution riêng kiểm lại điều kiện. Sau commit mới show COMPLETED và release/credit đúng net excess vào ví, receipt/audit; không edit ISSUED hoặc tự hoàn ra ngân hàng. Self-approval theo BR-11 cần lý do và SELF_APPROVED audit flag.
- **Trạng thái cần thiết kế:** Needs approval, rejected, APPROVED chờ/thực thi lỗi, completed with/without wallet refund, stale payment, legacy/mixed blocked.


- **Wallet amendment:** thu vượt có thể phát sinh khi nghĩa vụ giảm **sau** payment. Preview không phải credit đã commit; partial payment chưa vượt nghĩa vụ mới thì refund bằng 0. Không xóa Payment, không credit cùng phần đã release trước đó.

**BL11 — Đảo nạp ví sai / đối soát đảo Payment [P0]**

`UI host đề xuất:` `embedded: BL09/BL08 TOP_UP reversal; Payment reversal host NEEDS_DECISION` · `Actor thường gặp:` nhân sự có financial permission đúng scope · `Nguồn trace:` UC-25–26 · Q-10 (Wallet) · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý). Route `/app/:tenantId/finance/payments/:paymentId/reversal` là mapping đề xuất lịch sử để review, chưa là route/API đã duyệt.
- **Khối UI:** TOP_UP gốc, full original amount, balance khả dụng, lý do/evidence và cảnh báo nếu thiếu balance; Payment WALLET có lịch sử riêng, không trộn với TOP_UP reversal.
- **Thao tác & luồng:** Chỉ đảo toàn bộ TOP_UP bằng compensating entry khi balance đủ và có permission/reason/audit; thiếu balance thì từ chối/đối soát, không đảo Payment đúng để tạo đủ tiền. Payment reversal là nghiệp vụ tách riêng theo UC-26; chi tiết full nominal/release net còn pending technical sign-off, không suy ra route/API đã có.
- **Trạng thái cần thiết kế:** Already reversed, insufficient balance, permission blocked, legacy/mixed blocked, pending/failed execution; history gốc luôn còn.


#### G. Assignments & Grading

**AS01 — Danh sách bài tập của giáo viên [P0]**  
`UI route đề xuất:` `/app/:tenantId/teaching/assignments` · `Actor thường gặp:` Teacher có quyền lớp tương ứng · `Nguồn trace:` UC-27 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** List/table draft/published, class, deadline, priority stars, số bài nộp, số chưa chấm.
- **Thao tác & luồng:** Tạo bài, mở chi tiết, chỉnh draft; không tự thay đổi đề/giảm deadline sau khi đã có submission.
- **Trạng thái cần thiết kế:** Draft, published, closed, no assignments.

**AS02 — Tạo/chỉnh sửa/giao bài [P0]**  
`UI route đề xuất:` `/app/:tenantId/teaching/assignments/new` · `Actor thường gặp:` Teacher có quyền · `Nguồn trace:` UC-27 · Q-11 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Title, mô tả, lớp/học sinh nhận, deadline, priority 1–5, attachment (nếu thiết kế hỗ trợ); review danh sách recipient.
- **Thao tác & luồng:** Save draft, Publish/Giao bài; chỉ sau publish mới gửi notification in-app đúng recipient; warning khi sửa published có submission.
- **Trạng thái cần thiết kế:** Validation, no recipients, published, cannot shorten deadline silently.

**AS03 — Chi tiết bài tập & lượt nộp [P0]**  
`UI route đề xuất:` `/app/:tenantId/teaching/assignments/:assignmentId` · `Actor thường gặp:` Teacher có quyền · `Nguồn trace:` UC-27–29 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Assignment content, priority, deadline, recipients; bảng status NOT_SUBMITTED/SUBMITTED/LATE/GRADED (label UX), latest version; feedback visibility.
- **Thao tác & luồng:** Mở grading; gia hạn có audit theo luật, không tự sửa yêu cầu sau submission; click student scoped.
- **Trạng thái cần thiết kế:** Empty submissions, late, published grades, historical versions.

**AS04 — Danh sách cần chấm [P0]**  
`UI route đề xuất:` `/app/:tenantId/teaching/grading` · `Actor thường gặp:` Teacher có quyền · `Nguồn trace:` UC-29 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Table bài, student, class, nộp lúc, version, late badge, grading status.
- **Thao tác & luồng:** Lọc chưa chấm, mở bài nộp mới nhất hợp lệ.
- **Trạng thái cần thiết kế:** No submissions, late, graded unpublished, grades published.

**AS05 — Chấm bài và công bố điểm [P0]**  
`UI route đề xuất:` `/app/:tenantId/teaching/submissions/:submissionId/grade` · `Actor thường gặp:` Teacher được phân công · `Nguồn trace:` UC-29 · Q-11 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Preview/download file qua Backend, danh sách phiên bản nộp, điểm 0–10 bước .1, nhận xét, grading draft, nút công bố.
- **Thao tác & luồng:** Save grade draft; công bố thủ công; Student/Parent không nhìn grade draft; sửa grade công bố yêu cầu lý do/audit.
- **Trạng thái cần thiết kế:** Invalid score, missing file, published, correction after publish.

**AS06 — Bài tập của tôi [P0]**  
`UI route đề xuất:` `/app/:tenantId/my/assignments` · `Actor thường gặp:` Student · `Nguồn trace:` UC-28 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Cards bài chưa nộp/đã nộp/quá hạn, title, teacher/class, priority stars, deadline, status; filter.
- **Thao tác & luồng:** Mở assignment detail; không liệt kê bài học sinh khác.
- **Trạng thái cần thiết kế:** Empty, active, due today, late, graded published.

**AS07 — Chi tiết và nộp bài [P0]**  
`UI route đề xuất:` `/app/:tenantId/my/assignments/:assignmentId` · `Actor thường gặp:` Student nhận bài · `Nguồn trace:` UC-28 · Q-11 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Nội dung/deadline; file uploader PDF/DOCX/JPG/PNG, ≤10 MB each, ≤5 files; submission versions + timestamps; published grade/feedback if available.
- **Thao tác & luồng:** Submit/resubmit trước chấm/công bố và trong hạn ≤7 ngày trễ; cảnh báo LATE; không cho nộp không đúng quyền.
- **Trạng thái cần thiết kế:** Empty upload, bad MIME, >10MB, >5 files, late window expired, graded.


#### H. Teacher / Student / Parent Portals


- **Điểm cần review khi vào slice Grading:** Q-11 ghi “trước khi chấm/công bố”; Detailed Design đề xuất khóa nộp lại khi đã có bản chấm nháp. UI không tự chọn ngưỡng khóa khác với API đã duyệt, đánh dấu `NEEDS_SLICE_REVIEW`.

**PO01 — Trang chủ giáo viên [P0]**  
`UI route đề xuất:` `/app/:tenantId/teacher` · `Actor thường gặp:` Teacher · `Nguồn trace:` UC-14–15 · UC-27–29 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Hôm nay: các buổi dạy, điểm danh chưa xác nhận, bài cần chấm, bài đang giao; các thẻ action trực tiếp.
- **Thao tác & luồng:** Điểm danh nhanh, mở buổi học, mở grading/assignment; không thấy lớp không được phân công.
- **Trạng thái cần thiết kế:** Day off, no students, locked attendance, overdue grading.

**PO02 — Trang chủ học sinh [P0]**  
`UI route đề xuất:` `/app/:tenantId/student` · `Actor thường gặp:` Student · `Nguồn trace:` UC-14 · UC-16 · UC-28 · UC-31 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Buổi học kế tiếp; bài tập sắp hạn; submission status; thông báo in-app; shortcut gửi đơn nghỉ.
- **Thao tác & luồng:** Đi lịch/bài/đơn nghỉ; không thêm progress analytics P1.
- **Trạng thái cần thiết kế:** No upcoming classes, empty assignments, recent cancellation.

**PO03 — Trang chủ phụ huynh [P0]**  
`UI route đề xuất:` `/app/:tenantId/parent` · `Actor thường gặp:` Parent · `Nguồn trace:` UC-06 · UC-14 · UC-16 · UC-25 (quyền xem) · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Chọn con được liên kết hợp lệ; lịch sắp tới của con, bài mới/đã công bố, công nợ hóa đơn nội bộ của con, thông báo.
- **Thao tác & luồng:** Chuyển giữa các con đã xác minh, mở lịch/bài/học phí; gửi đơn nghỉ đúng child; read-only billing.
- **Trạng thái cần thiết kế:** 1/n child, link revoked, no classes/debt, permission denied.

**PO04 — Thông tin học tập của con (P0 read-only) [P0]**  
`UI route đề xuất:` `/app/:tenantId/parent/children/:studentId` · `Actor thường gặp:` Parent đã liên kết · `Nguồn trace:` UC-06 · UC-14 · UC-28–29 (phần hiển thị kết quả đã công bố) · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Student header, lớp ACTIVE, lịch, danh sách bài tập và **điểm đã công bố** nếu có, đơn nghỉ; không hiển thị progress KPI P1.
- **Thao tác & luồng:** Đổi tab và đi tới trang đúng scope; ẩn grade chưa công bố, không xem dữ liệu học sinh khác.
- **Trạng thái cần thiết kế:** No active enrollment, incomplete info, linked child only.

**PO05 — Học phí & ví của con / học sinh (chỉ xem) [P0]**

`UI route đề xuất:` `/app/:tenantId/my/billing` · `Actor thường gặp:` Parent đã liên kết hoặc Student có quyền xem chính mình · `Nguồn trace:` UC-25 · Q-10 · Q-12 (quyền xem) · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Chọn child (Parent), danh sách invoice ISSUED/outstanding, due date, WALLET payment history và balance/lịch sử ví được cấp theo scope; nhãn rõ số dư ví khác tiền đã trả hóa đơn.
- **Thao tác & luồng:** Mở BL07 ở chế độ xem; không có nút tự nạp/trả invoice/đảo giao dịch cho Student/Parent, không card/bank connect P0. Liên kết Parent hiện hành bị thu hồi thì chặn đọc.
- **Trạng thái cần thiết kế:** No invoices nhưng có ví, balance 0, partially paid, overdue, out-of-scope/link revoked.


## C. P1 CONCEPTS — DO NOT IMPLEMENT OR MOUNT IN P0

#### I. P1 Extensions (do not implement in MVP)


- **Quyền và dữ liệu:** financial resolution ledger là thông tin nhân sự, không tự hiển thị khoản thu vượt/operation nội bộ cho Parent/Student nếu API không cấp dữ liệu tương ứng.

**EX01 — Tìm và đăng ký học bù [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/makeup` · `Actor thường gặp:` Student/Parent; staff review · `Nguồn trace:` UC-17 · BR-02–03 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Chọn buổi nghỉ EXCUSED đã duyệt, các buổi tương đương và hạn 30 ngày; 1 quyền dùng/buổi gốc; liên kết booking gốc.
- **Thao tác & luồng:** Request, review, confirm đúng quyền; không tự gia hạn; không tính phí 2 lần.
- **Trạng thái cần thiết kế:** No suitable session, expired, used right, conflict.

**EX02 — Điều phối học bù [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/makeup/management` · `Actor thường gặp:` Academic Staff/Manager · `Nguồn trace:` UC-17 · Q-04–07 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Queue học bù, bộ lọc môn/trình độ/nội dung, capacity, available slot, proof.
- **Thao tác & luồng:** Đề xuất/chốt booking, xử lý exception; lịch sử và billing impact.
- **Trạng thái cần thiết kế:** Capacity conflict, content mismatch, no slots.

**EX03 — Yêu cầu bảo lưu [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/suspensions/new` · `Actor thường gặp:` Student/Parent · `Nguồn trace:` UC-18 · BR-05 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Student, thời gian bắt đầu-kết thúc, lý do, tác động lớp/học phí, pending approval.
- **Thao tác & luồng:** Gửi yêu cầu, xem trạng thái; không tự hoàn tiền.
- **Trạng thái cần thiết kế:** Overlap, missing reason, approval pending.

**EX04 — Xử lý bảo lưu và quay lại [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/suspensions` · `Actor thường gặp:` Academic Staff/Manager/Accountant theo permission · `Nguồn trace:` UC-18–19 · Q-06 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Queue duyệt bảo lưu; eligible unconsumed paid tuition credits, timeline, class placement checks khi quay lại.
- **Thao tác & luồng:** Approve, re-enroll, apply credit after pricing/discount; phải kiểm tra lịch/chỗ/trình độ.
- **Trạng thái cần thiết kế:** Early return, no suitable class, insufficient credit.

**EX05 — Đề xuất dạy thay và giáo viên nhận lớp [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/substitutions` · `Actor thường gặp:` Academic Staff/Manager; Teacher nhận · `Nguồn trace:` UC-20 · BR-07 · Q-07 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Session cần thay, candidate cùng môn/trình độ/availability, giới hạn 8h/ngày 40h/tuần, trạng thái Teacher acceptance.
- **Thao tác & luồng:** Staff đề xuất → Teacher nhận → Staff đủ quyền xác nhận; không tự confirm mặc định.
- **Trạng thái cần thiết kế:** No candidate, rejected by Teacher, pending staff approve.

**EX06 — Cấu hình policy version theo tenant [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/settings/policies` · `Actor thường gặp:` Manager có quyền · `Nguồn trace:` UC-33 · BR-14 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Danh sách version hiệu lực, snapshot, changelog, draft comparison, effective dates.
- **Thao tác & luồng:** Tạo/duyệt version theo quyền; không hồi tố invoice issued, retry giữ snapshot.
- **Trạng thái cần thiết kế:** Conflicting effective period, immutable old version.

**EX07 — Biên tập role-permission động [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/settings/permissions` · `Actor thường gặp:` Người có permission đặc biệt · `Nguồn trace:` UC-05 · FR-05 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Role/permission matrix, sensitive privilege badges, scopes and assignment preview.
- **Thao tác & luồng:** Edit quyền role theo phê duyệt và audit; không cấp ngoài tenant.
- **Trạng thái cần thiết kế:** Sensitive approval required, permission conflict.

**EX08 — Chính sách phê duyệt và tự động hóa [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/settings/workflows` · `Actor thường gặp:` Manager/người cấu hình · `Nguồn trace:` UC-33–34 · FR-44–45 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Rules by operation, risk, thresholds, permissions, preview decision tree, version.
- **Thao tác & luồng:** Edit/activate policy sau kiểm tra; không cho tự duyệt invoice cancellation.
- **Trạng thái cần thiết kế:** Invalid rule, version collision, requires manual approval.

**EX09 — Báo cáo nâng cao & tiến độ [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/reports` · `Actor thường gặp:` Manager/Teacher/Parent theo scope · `Nguồn trace:` UC-30 · UC-32 · Q-12 · `Artboard đề xuất:` Desktop + Mobile · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Progress attendance/assignment rates, published grade avg; financial earned/issued/paid/outstanding/overdue tách nghĩa; filters.
- **Thao tác & luồng:** Drill-down; zero denominator → N/A; Parent chỉ thấy con được liên kết.
- **Trạng thái cần thiết kế:** No denominator, permission scope, no stats.

**EX10 — Ưu đãi combo và gói trả trước [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/billing/prepaid` · `Actor thường gặp:` Accountant/Manager · `Nguồn trace:` UC-22–23 · Q-06/09 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Gói 6 tháng paid-in-full, combo 5% trước và sibling 10% sau; credit ledger.
- **Thao tác & luồng:** Ghi nhận gói và tính 14,5% nếu đủ cả hai; không tự hoàn tiền/hồi tố invoice.
- **Trạng thái cần thiết kế:** Not fully prepaid, sibling not verified, partial credit.

**EX11 — Nhắc deadline và email nghiệp vụ [P1]**  
`UI route đề xuất:` `/app/:tenantId/p1/settings/notifications` · `Actor thường gặp:` Người có quyền · `Nguồn trace:` UC-31 · Q-13 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Templates/kênh nếu được duyệt, reminders 24h/1h, delivery attempts/retries.
- **Thao tác & luồng:** Bật cấu hình theo policy; P0 không có màn này.
- **Trạng thái cần thiết kế:** External send failed, retry, stopped.

**EX12 — Quản trị vòng đời tenant nền tảng [P1]**  
`UI route đề xuất:` `/platform/tenants` (P1 proposal; platform-only route, not a tenant workspace) · `Actor thường gặp:` System Administrator theo grant giới hạn · `Nguồn trace:` UC-36 · Q-15 · `Artboard đề xuất:` Desktop · `Permission+scope:` kiểm tra theo Backend (role chỉ gợi ý)
- **Khối UI:** Tenant list lifecycle CREATED/ACTIVE/SUSPENDED/ARCHIVED, status, audit; KHÔNG hiện hồ sơ/công nợ tenant.
- **Thao tác & luồng:** Provision/activate/suspend có kiểm soát; hỗ trợ tenant data chỉ qua grant cụ thể và audit.
- **Trạng thái cần thiết kế:** No grant, suspended, restore permissions.


