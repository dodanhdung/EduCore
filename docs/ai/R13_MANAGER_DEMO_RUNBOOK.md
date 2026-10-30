# R13 — Manager class operations demo

Ngày: 30/10/2026, Asia/Ho_Chi_Minh. Branch: `deploy/r13-staging`.
Phạm vi triển khai được owner yêu cầu trong task này; UI chi tiết **PROPOSED, chờ review trước Git**.

## Contract và nguồn

Một luồng P0: AC07 → AC08 (ghi danh AC09 nhúng) → SC01/SC03 → AT01/AT02 → đọc lại kết quả.
Nguồn: PROJECT_CONTEXT; Requirements v5.1 FR-07–10/12–15/18, BR-01/04/08/13, Q-03/04/05;
Use Case v1.3 UC-08/09/10/12/14/15; SCREEN_MAP và từng card tương ứng,
SCREEN_FLOWS F02/F03/F04; UI_GUIDELINES §§1/4–7; DESIGN_TOKENS v1.0.
Database v1.1 group A có trong branch; class-design academic/resource-scheduling/attendance
v1.0 vẫn ghi PROPOSED, không dùng để mở rộng contract runtime. Architectural ADR vẫn giữ,
R13 D04 cho phép tái sử dụng React/CSS hiện có. Không cần sửa G01 vì đã có ba KPI P0.

API thực tế (prefix `/api/v1/tenants/{tenantId}`):

| Thao tác | Endpoint hiện có | Bảo vệ |
|---|---|---|
| Lớp, ghi danh, phân công | GET `/academic/classes/{id}` | class.read và object scope |
| Học viên lựa chọn | GET `/academic/students?pageSize=100&page=…` | student.read; chỉ records được cấp |
| Căn cứ ghi danh | GET `/academic/classes/{id}/students/{studentId}/placement-context` | quyền và scope server |
| Ghi danh tương lai | POST `/academic/enrollments` | confirmed, placement, reason, Idempotency-Key |
| Lịch có giới hạn thời gian | GET `/scheduling/calendar?from=…&to=…` | schedule.read; lọc lớp sau khi API đã scope |
| Tạo → xem trước → xác nhận | POST `/scheduling/sessions`; GET `/scheduling/drafts/{id}/preview`; POST `/scheduling/sessions/{id}/confirm` | draft không giữ chỗ; confirm recheck transaction |
| Danh sách/bảng điểm danh | GET `/attendance/due?from=…&to=…`; GET `/attendance/sessions/{id}` | quyền theo tenant/class |
| Nháp → xác nhận | POST `/attendance/sessions/{id}/marks`; POST `/attendance/sessions/{id}/finalize` | revision, reason, key; đọc lại trước xác nhận |

Không đổi backend/DB/schema/rules/auth. Enrollment và scheduling giữ transaction/audit/policy
của API hiện có. MARK từng học viên là từng transaction, không giả định lưu nháp cả bảng atomic;
lỗi giữa chừng phải đọc lại, giữ phần chưa lưu. FINALIZE là bước riêng, toàn bộ roster phải có kết quả.
EXCUSED chỉ khi API trả approvedLeave; không thêm note vì endpoint MARK không nhận note.

## UI review contract

- AC08: tên lớp/người là thông tin chính; mã phụ; lịch theo tháng và liên kết buổi/điểm danh;
  sĩ số lấy từ endpoint danh sách lớp theo đúng ID, không đếm lịch sử enrollment.
- Ghi danh: chọn học viên theo tên từ API, lớp hiện tại cố định; capability và placement
  phải khớp cả student/class mới nhất trước submit; effectiveFrom tương lai, xác nhận thủ công.
- SC01: tên phòng/giáo viên, lớp được giữ khi đi từ AC08; SC03 chọn sẵn đúng lớp nhưng
  không tự ghi; preview khác confirmed; không override conflict.
- AT01/AT02: tên người, nhãn tiếng Việt, nháp/đã xác nhận riêng; lưu rồi review dialog
  trước finalize; reload server sau thành công. Không hiện UUID enrollment làm thông tin chính.
- Loading/empty/401/403/404/409/422/network: lỗi rõ, không fake success, auth denial xóa
  protected content, thay tenant/token/resource reset state; chỉ GET retry rõ ràng.
- Desktop và mobile: tái sử dụng DataTable, PageHeader, ResourceState, status badges;
  mobile controls ≥44px, dialog focus/Escape/Tab; không thêm framework.

Allowlist: App.tsx (truyền navigation evidence cho AT); AcademicAdmission.tsx;
AcademicCatalogModel.ts/Production.tsx/Views.tsx/Views.module.css;
AcademicClassSchedule.tsx (mới); SchedulingProduction.tsx; SC01/CentralScheduleScreen.tsx;
SC03/CreateScheduleScreen.tsx; SchedulingAttendanceProduction.tsx;
Attendance & Leave/ManagerAttendanceView.tsx và .css (mới); focused tests trong hai module;
runbook này. Script dữ liệu/API nếu cần phải review riêng, không chạy seed/import/reset.

## Recovery và dữ liệu staging

Tenant synthetic: `6cd3b33a-5eaa-41a8-9ae5-12755799e631` (tên tenant hiện có:
**EduCore Staging Demo 757bd1**). Lớp chính **Toán 8A — Nâng cao**, ID
`37c58bd5-72d7-4a8f-a4ba-fd164ee545e5`, mã cũ giữ nguyên `CL_b5601060ee1be4b0`, sức chứa 16.
Giáo viên **Nguyễn Thị Mai Phương**, ID `23a87df6-b698-47fe-a58d-bf9c917f7a20`;
khóa **Toán 8 — Bồi dưỡng nâng cao**, môn **Toán học**, trình độ **Nâng cao**.
Phòng mới **Phòng 201 — Khu học Toán**, mã `R13-TOAN-201`, ID
`12d14f78-7897-412c-aab1-1fbd2863d87e`, sức chứa 20.

Mười nhân vật dưới đây hoàn toàn hư cấu. Giữ UUID/mã profile, không thêm DOB/contact:

| Họ tên mới | Mã hiện có | Thay đổi |
|---|---|---|
| Nguyễn Minh Anh | S_819aa328e5360845 | Đổi tên, giữ ghi danh |
| Trần Đức Huy | S_68dddb78c60889c2 | Đổi tên, giữ ghi danh |
| Lê Ngọc Hà | S_5f27f18bc9d7cb48 | Đổi tên, giữ ghi danh |
| Phạm Gia Bảo | S_7f3a277fa0074798 | Đổi tên, giữ ghi danh |
| Hoàng Khánh Linh | S_89c40ea2956a5836 | Đổi tên, giữ ghi danh |
| Vũ Quang Minh | S_38d1d466dca34a12 | Đổi tên, giữ ghi danh |
| Đặng Thu Trang | S_b1080040fdfa5d6b | Đổi tên, giữ ghi danh |
| Bùi Nhật Nam | S_d9b5126799027d7e | Đổi tên, giữ ghi danh |
| Đỗ Phương Thảo | S_06056adfbdad073b | Đổi tên profile có sẵn + ghi danh mới |
| Ngô Tuấn Kiệt | S_211bb319daf68bcd | Đổi tên profile có sẵn + ghi danh mới |

Hai enrollment mới: `ed2e6399-5cb0-4c6d-8df0-5ab68b10450a` và
`21bd0a17-243e-48e9-919a-3268a4d5f284`, hiệu lực tương lai tại lúc gửi API,
đã đọc lại ACTIVE. Không tạo thêm user/login/role.
Tên subject/level/course và giáo viên được tham chiếu bởi lớp khác **trong cùng tenant**;
các lớp đó cũng thấy tên mới. Không đổi IDs, sortOrder, competency, thời gian, mã hay rule.

| Buổi chính (Asia/Ho_Chi_Minh) | ID | Trạng thái sau thực thi |
|---|---|---|
| 31/10/2026, 15:00–16:30 | `6932d8b8-1b4c-46e7-9822-4ad012e53176` | DRAFT, preview ready, chưa giữ chỗ |
| 03/11/2026, 15:00–16:30 | `8fe9cd0a-f865-4329-a492-5eb032dabf95` | CONFIRMED qua API |
| 06/11/2026, 15:00–16:30 | `95b1f25c-fc32-460f-8fc7-f101fda1bcd1` | CONFIRMED có sẵn, giữ ID/giờ, đổi phòng qua reschedule API |

Mỗi buổi có đúng 10 participants được API/DB xác nhận. Các bản nháp lịch sử trước đó
được giữ nguyên; bảng trên chỉ là 3 buổi trình bày chính.

Recovery point mới trước mutation: `.local/staging-transfer/r13-manager-recovery-20261030/`.
Full logical archive Render mã hóa AES-GCM, khóa Windows DPAPI; hash archive giải mã
khớp receipt, consistent snapshot và archive-list verified. **Chưa restore thử bản mới**.
Không chép secrets, dump, profile browser hay credentials vào Git/ZIP.
Recovery phải restore vào DB cô lập mới sau kiểm hash, không restore đè/reset Render.
Journal từng API request/ACK và trước/sau giữ riêng tại `.local/r13-manager/`.

Tổng 22 API commands được ACK/audit: 15 đổi tên (10 học viên, 1 giáo viên, 4 danh mục/lớp),
2 ghi danh, 1 phòng, 2 tạo buổi, 1 xác nhận, 1 đổi phòng của buổi có sẵn.
API tự quản lý participants/bookings/resources/outbox/audit, không ghi trực tiếp bảng.
Một request PATCH đầu tiên bị 400 do thiếu dateOfBirth bắt buộc, không đổi record;
đã đối chiếu baseline rồi gửi payload đầy đủ, giữ DOB/contact gốc.

## Thao tác demo và bằng chứng

Đăng nhập bằng Manager synthetic đã có; nhận credential qua kho DPAPI cục bộ như
`features/local-render-data-transfer.md`, không dán vào runbook/log.
Website đang có: <https://edu-core-rosy.vercel.app>. API: <https://educore-staging-api.onrender.com>.

1. Chọn **EduCore Staging Demo 757bd1** → **Lớp học** → tìm **Toán 8A — Nâng cao**.
   Kỳ vọng AC07 hiện **10 / 16**, tên lớp/khóa tự nhiên. Mở chi tiết:
   `/app/6cd3b33a-5eaa-41a8-9ae5-12755799e631/classes/37c58bd5-72d7-4a8f-a4ba-fd164ee545e5`.
2. Kiểm tra giáo viên và 10 tên ghi danh. Sau khi code được owner review/deploy riêng,
   mở **Ghi danh học viên / chuyển lớp** để chọn theo tên, ngày hiệu lực tương lai,
   căn cứ và lý do, tick xác nhận → **Xác nhận ghi danh**. Hai ghi danh Thảo/Kiệt đã được
   thực hiện qua API trong task; **không ghi danh lại**. Không thêm người khi chỉ trình bày.
3. Trong **Lịch học**, chọn tháng **10/2026** để thấy buổi nháp 31/10 hoặc **11/2026** để
   thấy 03/11 và 06/11. **Tạo buổi cho lớp** mở SC03 với đúng lớp được chọn sẵn.
   Chọn ngày tương lai trước khi chọn giáo viên, giờ, phòng; nhập lý do. Luồng là
   tạo nháp → kiểm tra xung đột → review → xác nhận. Preview ready không giữ chỗ.
   Tạo thêm chỉ khi cần chạy lại demo; không bấm tạo khi chỉ kiểm tra dữ liệu.
4. Để trình bày xác nhận mà không tạo thêm record: khi **còn trước 15:00 ngày 31/10**,
   mở SC05 buổi nháp `6932…`, **Kiểm tra lại**, review 10 học viên/phòng rồi xác nhận.
   Nếu đã qua giờ, giữ bản nháp làm lịch sử; không backdate hoặc cố xác nhận buổi quá khứ.
5. **Điểm danh** → tháng **11/2026** → buổi 03/11 → **Mở bảng điểm danh**.
   Ngày kiểm tra 30/10 phải hiện **chưa đủ điều kiện**, chọn kết quả/lưu/chốt bị khóa
   trong code local mới. Đây là expected result, không phải chốt điểm danh thành công.
6. Demo chốt bằng Manager chỉ chạy sau **05/11/2026 16:30** cho buổi 03/11: Q-05 cho
   staff xử lý nguồn quá hạn 48h, còn chưa finalized, chưa dùng tính phí, đúng quyền/scope.
   Tải lại bảng và kiểm điều kiện server. Chọn Có mặt/Vắng không phép theo kịch bản hư cấu;
   không chọn Vắng có phép khi chưa có đơn duyệt. **Lưu nháp** → chờ đọc lại đủ 10/10 →
   **Xác nhận đầy đủ** → review dialog → **Xác nhận điểm danh**. Đọc lại phải thấy
   **Đã xác nhận** và kết quả chỉ xem. Nếu 403/409/422: dừng, đọc lại, không đổi rule.

**Giới hạn nghiệm thu:** đã audit cả 4 tenant import; chỉ có 3 buổi CONFIRMED, đều 06/11,
tenant còn lại không có buổi đủ điều kiện. Không có confirmed quá khứ để Manager chốt
ngày 30/10. API cấm tạo/xác nhận lịch quá khứ; không mở Teacher login hay thay timestamp.
Luồng chốt điểm danh live và end-to-end hoàn chỉnh vì vậy **NOT VERIFIED / chưa hoàn tất**.

## Bằng chứng đã chạy

- Frontend focused: **97/97 PASS** (foundation, academic-catalog/production/time,
  scheduling/production/attendance-production, attendance). Bao gồm 401/403, token/scope,
  complete draft, partial save, double click, stale revision, future/locked, confirm/reload.
- API boundary: **6/6 PASS** với Vitest `test/r4/scheduling-attendance-http.spec.ts`
  và `test/r8/academic-read.spec.ts` (repository doubles, không phải PG native).
- `pnpm.cmd --dir apps/web run build`: PASS (TypeScript + Vite).
- Oxlint exit 0: **0 errors, 19 warnings** hooks/refs; không ghi là lint sạch.
  `git diff --check`: PASS.
- Browser code local + QA proxy cùng origin đến Render thật: 6 màn AC07/08, SC01/03,
  AT01/02 × 1280/390, **12 screenshots**, 0 JS exception, không page overflow,
  giữ class context; buổi tương lai bị khóa. Không fixture, không thay server CORS.
- Browser trực tiếp **Vercel đang deploy**: login/tenant/AC07/AC08 PASS, 2 screenshots,
  9 API responses, 0 JS exception; tên lớp/10 học viên đọc từ Render.
  **Code cải tiến chưa deploy**; không suy ra UI mới đã có trên Vercel.
- PostgreSQL Render readonly: 10 tên/mã khớp API, 3 roster ×10, 22 audit có policy/correlation;
  schema và fingerprints 25 bảng kiểm soát (migrations, roles/scope, tài chính, attendance)
  không đổi so với recovery point. Không có attendance MARK/FINALIZE live.
- Chưa chạy: native PG mutation suites, SMTP/email, tài chính, full suites, full live
  enrollment/schedule/finalize bằng UI. Các writes nghiệp vụ đã thực hiện qua API;
  browser kiểm tra reads/navigation/state, component tests kiểm tra writes bằng doubles.

Screenshot/evidence riêng tại `.local/r13-manager/` (ignored, không đưa secrets hay
generated files vào review ZIP). ZIP gồm source/doc thay đổi và báo cáo review bên trong.
Owner review 4 file source/doc mới trước Git; không commit/push/branch/PR/deploy trong task.
