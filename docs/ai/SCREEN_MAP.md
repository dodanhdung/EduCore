# EduCore — SCREEN_MAP (approved canonical inventory; per-screen review required)

**Version:** 1.0 · **Date:** 2026-10-17 · **Authority:** Approved UI planning baseline, never business baseline or implemented routes.

This is a merged **design-unit inventory**, not 71 mandatory routes or 71 separate Figma frames. **Source:** 70 Stitch concept units (58 P0 +12 P1) + one group-A onboarding design unit (`AU06`). Total **71 (59 P0 +12 P1)**. Each can be a page, state, sheet, dialog, or reused role-specific layout.

**Canonical ID:** legacy Stitch IDs (`AU01`, `G01`, `BL07`, etc.). `AUTH-01`, `FIN-01` etc. from kit v0.9 are **aliases only**; do not create duplicate screens. Full content in `SCREEN_SPECIFICATIONS.md`; tokens in `DESIGN_TOKENS.md`; flow contracts in `SCREEN_FLOWS.md`.

**Routes:** `/app/:tenantId/*` is the approved UI navigation convention; listed route paths are preferred defaults subject to **individual screen review** (not NestJS API). Tenant ID grants no access. Unauthenticated routes remain global. `embedded:` entries are components/flows and require no standalone route unless a slice review decides otherwise.

**Business amendments (18–19/10/2026):** O-12 và Wallet B1–B5 đã được duyệt ở mức nghiệp vụ trong Requirements v5.1/UC-21/23–26/34/37; các thay đổi card/host tài chính bên dưới là **PROPOSED UI**, chưa duyệt từng màn hình hay route/API. Giữ 71 design units; `BL08` bao cả nạp ví không cần invoice và thanh toán invoice từ ví, `BL11` phân biệt đảo TOP_UP với đảo Payment. Q1–Q8 kỹ thuật Wallet vẫn chờ sign-off; không suy ra tính năng đã triển khai.

## A. P0 screen/design-unit inventory

| ID | Name | Route / host (kit default; per-screen review) | Trace (source) | Review |
|---|---|---|---|---|
| `AU01` | Đăng nhập | `/login` | UC-01 · Q-01 | PROPOSED |
| `AU02` | Chọn trung tâm | `/select-tenant` | UC-01 · UC-36 · Q-15 | PROPOSED |
| `AU03` | Yêu cầu OTP khôi phục | `/forgot-password` | UC-03 · Q-01 | PROPOSED |
| `AU04` | Nhập OTP và đặt mật khẩu | `/reset-password` | UC-03 · Q-01 | PROPOSED |
| `AU05` | Hồ sơ tài khoản & phiên | `/app/:tenantId/me` | UC-02 · UC-04 · Q-01 | PROPOSED |
| `AU06` | Kích hoạt tài khoản bằng OTP (nhóm A) | `/activate-account` | Group A IAM onboarding; UC-01/04 supporting | PROPOSED |
| `GL01` | Trung tâm thông báo in-app | `/app/:tenantId/notifications` | UC-31 · FR-37–39 · Q-13 | PROPOSED |
| `GL02` | Không đủ quyền / không tìm thấy | `/403 · /404` | UC-36 · FR-04 · FR-42 | PROPOSED |
| `G01` | Dashboard quản lý | `/app/:tenantId/overview` | UC-32 · FR-40 · Q-12 | PROPOSED |
| `OP01` | Tài khoản người dùng | `/app/:tenantId/settings/members` | UC-04 · FR-02 | PROPOSED |
| `OP02` | Chi tiết tài khoản và gán role | `/app/:tenantId/settings/members/:membershipId` | UC-04–05 · FR-03–04 | PROPOSED |
| `OP03` | Liên kết phụ huynh–học sinh | `/app/:tenantId/relationships` | UC-06 · Q-02 | PROPOSED |
| `OP04` | Danh sách phê duyệt | `/app/:tenantId/approvals` | UC-26 · UC-34 · BR-08–11 | PROPOSED |
| `OP05` | Xem xét và quyết định phê duyệt | `/app/:tenantId/approvals/:requestId` | UC-26 · UC-34 · BR-11 | PROPOSED |
| `OP06` | Tra cứu audit log | `/app/:tenantId/audit` | UC-35 · Q-14 | PROPOSED |
| `OP07` | Quản lý job và retry | `/app/:tenantId/operations/jobs` | UC-37 · BR-12 · Q-13 | PROPOSED |
| `AC01` | Danh sách học sinh | `/app/:tenantId/students` | UC-07 · FR-07 | PROPOSED |
| `AC02` | Chi tiết/chỉnh sửa học sinh | `/app/:tenantId/students/:studentId` | UC-07 · UC-10 · UC-06 | PROPOSED |
| `AC03` | Danh sách giáo viên | `/app/:tenantId/teachers` | UC-07 · UC-09 | PROPOSED |
| `AC04` | Chi tiết giáo viên & phân công | `/app/:tenantId/teachers/:teacherId` | UC-07 · UC-09 | PROPOSED |
| `AC05` | Danh mục môn & trình độ | `/app/:tenantId/academic/catalog` | UC-08 · FR-08 | PROPOSED |
| `AC06` | Danh sách khóa học | `/app/:tenantId/courses` | UC-08 | PROPOSED |
| `AC07` | Danh sách lớp học | `/app/:tenantId/classes` | UC-08–10 | PROPOSED |
| `AC08` | Chi tiết lớp & học sinh ghi danh | `/app/:tenantId/classes/:classId` | UC-08–10 · UC-14 | PROPOSED |
| `AC09` | Ghi danh / chuyển lớp | `embedded: /enrollments (wizard/sheet)` | UC-10 · Q-03 · BR-13 | PROPOSED |
| `SC01` | Lịch học trung tâm | `/app/:tenantId/schedule` | UC-12–14 · BR-01 | PROPOSED |
| `SC02` | Phòng học & lịch bận tài nguyên | `/app/:tenantId/resources` | UC-11 | PROPOSED |
| `SC03` | Tạo lịch/buổi học | `/app/:tenantId/schedule/create` | UC-12 · BR-01 · Q-04 | PROPOSED |
| `SC04` | Xem/xác nhận xung đột lịch | `embedded: SC03/SC05 conflict panel` | UC-12–13 · BR-01 | PROPOSED |
| `SC05` | Chi tiết buổi / đổi / hủy lịch | `/app/:tenantId/schedule/sessions/:sessionId` | UC-13–14 · Q-04 | PROPOSED |
| `SC06` | Lịch cá nhân | `/app/:tenantId/my/schedule` | UC-14 · UC-30 (phần xem P0) | PROPOSED |
| `AT01` | Danh sách buổi cần điểm danh | `/app/:tenantId/attendance` | UC-15 | PROPOSED |
| `AT02` | Bảng điểm danh theo buổi | `/app/:tenantId/sessions/:sessionId/attendance` | UC-15 · BR-04 · Q-05 | PROPOSED |
| `AT03` | Gửi đơn xin nghỉ | `/app/:tenantId/leave-requests/new` | UC-16 · BR-04 · Q-02 | PROPOSED |
| `AT04` | Danh sách và xử lý đơn nghỉ | `/app/:tenantId/leave-requests` | UC-16 · Q-02 | PROPOSED |
| `AT05` | Đề nghị điều chỉnh điểm danh | `embedded: /attendance/corrections (sheet/list)` | UC-15 · Q-05 | PROPOSED |
| `BL01` | Bảng đơn giá học phí | `/app/:tenantId/finance/pricing` | UC-21 · BR-06 · Q-08 (O-12) | PROPOSED |
| `BL02` | Xác minh và áp dụng ưu đãi anh/chị/em | `/app/:tenantId/finance/discount-eligibility` | UC-22 · Q-02 · Q-09 | PROPOSED |
| `BL03` | Kỳ học phí & generation tính | `/app/:tenantId/finance/billing-periods` | UC-23 · BR-04 · Q-08 (O-12) | PROPOSED |
| `BL04` | Danh sách hóa đơn dự thảo | `/app/:tenantId/finance/drafts` | UC-23–24 | PROPOSED |
| `BL05` | Rà soát và phát hành hóa đơn nội bộ | `/app/:tenantId/finance/drafts/:draftId` | UC-23–24 · BR-13 · Q-08–09 | PROPOSED |
| `BL06` | Danh sách hóa đơn đã phát hành | `/app/:tenantId/finance/invoices` | UC-24–26 | PROPOSED |
| `BL07` | Chi tiết hóa đơn & lịch sử thu | `/app/:tenantId/finance/invoices/:invoiceId` | UC-24–26 · Q-10 | PROPOSED |
| `BL08` | Nạp ví thủ công / thanh toán invoice từ ví | `embedded: BL09 student wallet panel; BL07 payment dialog` | UC-25 · FR-30 · Q-10 (Wallet) | PROPOSED |
| `BL09` | Công nợ, ví & khoản thu | `/app/:tenantId/finance/receivables` | UC-25 · Q-10/12 (Wallet) | PROPOSED |
| `BL10` | Yêu cầu điều chỉnh/hủy hóa đơn | `/app/:tenantId/finance/invoices/:invoiceId/adjust` | UC-26 · BR-11 · Q-10 | PROPOSED |
| `BL11` | Đảo nạp ví sai / đối soát đảo Payment | `embedded: BL09/BL08 TOP_UP reversal; Payment reversal host NEEDS_DECISION` | UC-25–26 · Q-10 (Wallet) | PROPOSED |
| `AS01` | Danh sách bài tập của giáo viên | `/app/:tenantId/teaching/assignments` | UC-27 | PROPOSED |
| `AS02` | Tạo/chỉnh sửa/giao bài | `/app/:tenantId/teaching/assignments/new` | UC-27 · Q-11 | PROPOSED |
| `AS03` | Chi tiết bài tập & lượt nộp | `/app/:tenantId/teaching/assignments/:assignmentId` | UC-27–29 | PROPOSED |
| `AS04` | Danh sách cần chấm | `/app/:tenantId/teaching/grading` | UC-29 | PROPOSED |
| `AS05` | Chấm bài và công bố điểm | `/app/:tenantId/teaching/submissions/:submissionId/grade` | UC-29 · Q-11 | PROPOSED |
| `AS06` | Bài tập của tôi | `/app/:tenantId/my/assignments` | UC-28 | PROPOSED |
| `AS07` | Chi tiết và nộp bài | `/app/:tenantId/my/assignments/:assignmentId` | UC-28 · Q-11 | PROPOSED |
| `PO01` | Trang chủ giáo viên | `/app/:tenantId/teacher` | UC-14–15 · UC-27–29 | PROPOSED |
| `PO02` | Trang chủ học sinh | `/app/:tenantId/student` | UC-14 · UC-16 · UC-28 · UC-31 | PROPOSED |
| `PO03` | Trang chủ phụ huynh | `/app/:tenantId/parent` | UC-06 · UC-14 · UC-16 · UC-25 (quyền xem) | PROPOSED |
| `PO04` | Thông tin học tập của con (P0 read-only) | `/app/:tenantId/parent/children/:studentId` | UC-06 · UC-14 · UC-28–29 (phần hiển thị kết quả đã công bố) | PROPOSED |
| `PO05` | Học phí & ví của con / học sinh (chỉ xem) | `/app/:tenantId/my/billing` | UC-25 · Q-10/12 (quyền xem Wallet) | PROPOSED |

## B. P1 concepts — NOT TO BE MOUNTED IN P0

| ID | Concept | Proposed location | Trace | Status |
|---|---|---|---|---|
| `EX01` | Tìm và đăng ký học bù | `/app/:tenantId/p1/makeup` | UC-17 · BR-02–03 | P1_CONCEPT_ONLY |
| `EX02` | Điều phối học bù | `/app/:tenantId/p1/makeup/management` | UC-17 · Q-04–07 | P1_CONCEPT_ONLY |
| `EX03` | Yêu cầu bảo lưu | `/app/:tenantId/p1/suspensions/new` | UC-18 · BR-05 | P1_CONCEPT_ONLY |
| `EX04` | Xử lý bảo lưu và quay lại | `/app/:tenantId/p1/suspensions` | UC-18–19 · Q-06 | P1_CONCEPT_ONLY |
| `EX05` | Đề xuất dạy thay và giáo viên nhận lớp | `/app/:tenantId/p1/substitutions` | UC-20 · BR-07 · Q-07 | P1_CONCEPT_ONLY |
| `EX06` | Cấu hình policy version theo tenant | `/app/:tenantId/p1/settings/policies` | UC-33 · BR-14 | P1_CONCEPT_ONLY |
| `EX07` | Biên tập role-permission động | `/app/:tenantId/p1/settings/permissions` | UC-05 · FR-05 | P1_CONCEPT_ONLY |
| `EX08` | Chính sách phê duyệt và tự động hóa | `/app/:tenantId/p1/settings/workflows` | UC-33–34 · FR-44–45 | P1_CONCEPT_ONLY |
| `EX09` | Báo cáo nâng cao & tiến độ | `/app/:tenantId/p1/reports` | UC-30 · UC-32 · Q-12 | P1_CONCEPT_ONLY |
| `EX10` | Ưu đãi combo và gói trả trước | `/app/:tenantId/p1/billing/prepaid` | UC-22–23 · Q-06/09 | P1_CONCEPT_ONLY |
| `EX11` | Nhắc deadline và email nghiệp vụ | `/app/:tenantId/p1/settings/notifications` | UC-31 · Q-13 | P1_CONCEPT_ONLY |
| `EX12` | Quản trị vòng đời tenant nền tảng | `/platform/tenants` (P1 platform route proposal) | UC-36 · Q-15 | P1_CONCEPT_ONLY |

## C. v0.9 → 1.0 ID migration (do not duplicate)

| v0.9 ID | Canonical design unit(s) in v1.0 |
|---|---|
| `AUTH-01` | `AU01` |
| `AUTH-02` | `AU03` |
| `AUTH-03` | `AU04` |
| `AUTH-04` | `AU06` |
| `COMMON-01` | `G01` |
| `IAM-01` | `OP01` |
| `IAM-02` | `OP01`, `OP02` |
| `IAM-03` | `OP02` |
| `IAM-04` | `OP03`, `BL02` |
| `ACAD-01` | `AC01` |
| `ACAD-02` | `AC02` |
| `ACAD-03` | `AC03` |
| `ACAD-04` | `AC04` |
| `ACAD-05` | `AC05`, `AC06` |
| `ACAD-06` | `AC07` |
| `ACAD-07` | `AC08` |
| `ACAD-08` | `AC09` |
| `RES-01` | `SC02` |
| `RES-02` | `SC02` |
| `SCH-01` | `SC01`, `SC06` |
| `SCH-02` | `SC03` |
| `SCH-03` | `SC04` |
| `SCH-04` | `SC05` |
| `ATT-01` | `AT02` |
| `ATT-02` | `AT04` |
| `ATT-03` | `AT03` |
| `FIN-01` | `BL01`, `BL02` |
| `FIN-02` | `BL03`, `BL04` |
| `FIN-03` | `BL04`, `BL06` |
| `FIN-04` | `BL05`, `BL07`, `BL08`, `BL10` |
| `FIN-05` | `BL08`, `BL11` |
| `FIN-06` | `BL09` |
| `FIN-07` | `BL10` |
| `ASG-01` | `AS01`, `AS06` |
| `ASG-02` | `AS02` |
| `ASG-03` | `AS03`, `AS07` |
| `ASG-04` | `AS07` |
| `ASG-05` | `AS03`, `AS04` |
| `ASG-06` | `AS05` |
| `NOTIF-01` | `GL01` |
| `WF-01` | `OP04` |
| `WF-02` | `OP05` |
| `OPS-01` | `OP07` |
| `AUD-01` | `OP06` |

## D. Navigation and role/scoped views

- Shared `AppShell`+`TenantSwitcher` (only permitted memberships), menu based on **effective** permission, not role labels. Parent selects only **verified linked student**; Teacher sees current assigned classes; student sees own records.
- Manager dashboard `G01`: exactly 3 P0 business KPIs; Teacher/Student/Parent landing `PO01/02/03` are task summaries, not extra manager KPI dashboards.
- `SC01` vs `SC06`, `AC02` vs `PO04`, `BL07` vs `PO05`, `AS03` vs `AS07` can reuse components. Different view != duplicated business flow.
- `BL08` top-up thuộc student/tenant và không cần invoice; payment chỉ từ ví cho một invoice ISSUED. `BL11` không dùng đảo Payment hợp lệ để bù top-up sai. Chỉ financial staff đúng permission/scope có nút mutation; Student/Parent chỉ xem dữ liệu được cấp. Host Payment reversal chờ screen/API review; `/app/:tenantId/finance/payments/:paymentId/reversal` là route đề xuất lịch sử để đối chiếu, không phải route/API đã duyệt.
- Do not ship `EX01`–`EX12`, P1 controls, or a platform tenant lifecycle UI in P0. P1 conceptual routes are not permission to implement.

## E. Required review per screen

The canonical inventory has owner approval; **rows still marked PROPOSED mean that individual UI screens are awaiting their own implementation sign-off**. Read the matching `SCREEN_SPECIFICATIONS.md` card, prepare one `SCREEN_REVIEW_TEMPLATE.md`, verify permission/API/UX, compare design references and responsive states, then mark `PROPOSED → REVIEWED → APPROVED_FOR_IMPLEMENTATION`. A design frame never changes Q/BR by itself. New files and ANY Git writes require explicit owner approval separately.
