# EduCore — Screen flow contracts (APPROVED PLANNING BASELINE)

**Source:** 7 flows F01–F07 reused from uploaded Stitch specification, augmented with Group A onboarding, O-12 (18/10) and Wallet B1–B5 (19/10). Business amendments are approved in Requirements/UC; screen paths/actions below remain **PROPOSED per-screen UX**. This is a screen interaction map, not a test suite, API contract or implementation. Wallet Q1–Q8 remain pending technical sign-off.

## A. Shared UI rules

- UI route convention is approved as a baseline, but individual paths/actions still need slice review. Server response is authoritative for permissions, state and totals. No optimistic success for money, schedule confirmation or approval execution.
- Empty/loading/validation/conflict/forbidden/expired token handling is required where applicable; mobile flow also handles full-screen forms, keyboard and focus.
- No P1 actions hidden behind a fake toggle in P0.

## B. P0 business flows and prototype interactions (reference F01–F07)

### F01 — Login / chọn tenant / điều hướng theo quyền [P0]
`AU01 → AU02 (nếu nhiều tenant) → landing theo permission hiện hành`; click logo/profile/menu và đăng xuất `AU05 → AU01`. Nếu chỉ một tenant hợp lệ thì có thể bỏ bước AU02. Không hiển thị tenant không được phép. Khôi phục: `AU01 → AU03 → AU04 → AU01`. **Kích hoạt tài khoản (Group A):** `AU06 (request OTP → complete activation)` → `AU01`; tenant bootstrap bằng CLI (không phải màn hình platform). Đủ trường hợp lỗi chung và OTP hết hạn.

### F02 — Tuyển sinh/ghi danh/chuyển lớp [P0]
`AC01 → AC02 → AC09 → AC08`: tạo profile khác tạo tài khoản; ghi danh kiểm tra room/class capacity, trình độ, lịch. Chuyển lớp phải có confirmed future-effective date, lịch sử enrollment cũ còn đọc được, không tự chuyển lớp. Nếu phát sinh tài chính đã issued, dẫn tới BL10 chứ không chỉnh invoice trực tiếp.

### F03 — Tạo lịch và chống trùng [P0]
`SC01 → SC03 → SC04 → SC01/SC05`: single hoặc weekly ≤6 tháng. Giao diện phải cho thấy rõ **conflict source** (giáo viên/phòng/học sinh/lịch bận/capacity), buổi đầu và cuối chuỗi, số buổi bị ảnh hưởng. Nút Confirm bị chặn khi conflict; khi save xuất hiện race conflict thì hiển thị toàn chuỗi thất bại, không fake partial success. `SC05` edit/hủy đúng quyền và chỉ tương lai.

### F04 — Đơn nghỉ → điểm danh → học phí [P0]
`AT03 → AT04 (duyệt) → AT02 (Teacher finalizes) → BL03 → BL05`. Đơn đúng hạn **không tự động được duyệt**. `EXCUSED=0`, `ATTENDED/UNEXCUSED=1`. `BL03` cần dễ nhìn thấy `NEEDS_INFORMATION` khi thiếu điểm danh xác nhận hoặc PriceRule; không ngầm giá 0. Kỳ/giá của buổi theo local session-start date tại timezone tenant đã freeze, không theo ngày xử lý điểm danh/draft. `AT05` correction sau khóa phải giữ audit và xử lý invoice đã issued qua adjustment.

### F05 — Tính kỳ → draft → phát hành; nạp ví, trả invoice và điều chỉnh [P0]
`BL01/BL02 → BL03 → BL04 → BL05 → BL06/BL07` là nhánh tính và phát hành; TOP_UP và WALLET payment là hai hành động riêng bên dưới, không tự xảy ra sau ISSUE. `BL01` chọn PriceRule theo ngày bắt đầu buổi tại timezone tenant đã freeze; BL03 gán kỳ theo cùng local start. Review ở BL05 hiển thị nguồn/ngày/giá từng dòng, lý do 0/1 charge unit, current generation và calculation policy đã pin; retry giữ generation, recompute DRAFT có chủ đích tạo generation mới và giữ diff/history. **Phát hành** thủ công, chặn source/generation stale; không reprice hay trừ ví ở draft/issue.

`BL09 → BL08 (TOP_UP) → BL09`: staff đúng financial permission xác minh CASH/BANK_TRANSFER rồi nạp ví cho student/tenant, **không cần invoice**; TOP_UP không tạo invoice Payment/giảm công nợ. `BL07 → BL08 (WALLET pay) → BL07/BL09`: staff chọn invoice ISSUED cùng student/tenant, nhập amount partial/full rõ ràng; amount vượt balance hoặc outstanding bị từ chối, không tự thu partial. Parent/Student `PO05 → BL07` chỉ xem theo liên kết/scope, không nạp/trả ví. `BL11` đảo TOP_UP sai toàn phần chỉ khi balance khả dụng đủ; Payment reversal là luồng tách biệt còn chờ chi tiết kỹ thuật.

Nếu cần sửa invoice đã phát hành: `BL10 → OP04/OP05 (APPROVED) → explicit authorized execution → BL07/BL09 (COMPLETED)`; không inline edit. Với nguồn thuần Wallet, execution commit adjustment/cancel + signed allocation release + credit **đúng net excess** vào ví + receipt/audit cùng lúc. Execution lỗi giữ APPROVED và không báo đã hoàn; legacy/mixed hoặc excess cũ thiếu policy bị chặn để đối soát, không tự chuyển ví hay hoàn qua ngân hàng.

### F06 — Teacher giao bài → Student nộp → Teacher công bố [P0]
`AS01 → AS02 (Publish) → GL01 + AS06 → AS07 (versioned upload) → AS04/AS05 (draft grade) → Publish grade → AS07 read-only result`. Các thông báo in-app chỉ phát sinh sau khi giao bài thành công, không phải khi lưu draft. Điểm nháp chỉ Teacher được xem; Parent chỉ được xem điểm đã công bố và child liên kết.

### F07 — Decision / Job / Audit [P0]
`OP04 → OP05 → quyết định APPROVED bền vững → explicit execution → COMPLETED nếu effect/receipt/audit commit`; nếu execution lỗi, giữ APPROVED và ghi outcome lỗi riêng để đối soát/retry cùng root. Job có `FAILED`, `NEEDS_INFORMATION`, `PENDING_APPROVAL` và retry có permission; manual recovery sau retry exhaustion vẫn PROPOSED/PENDING TECHNICAL SIGN-OFF, không vẽ nút đã duyệt. UI không dùng `SELF_APPROVED` làm workflow status. Notification lỗi **không rollback** hành động gốc đã hoàn tất.


## C. Review gates

- Each flow: record entry screen, permission+scope at each action, transition API, success/error UI and one UC acceptance test.
- For F03/F05/F07 include conflict/idempotency and stale state screenshot.
- For F05 include TOP_UP without invoice, insufficient balance, over-outstanding, approval vs execution failure, legacy/mixed blocked, O-12 cross-month/cross-price and G1→G2 draft comparison. Treat those as designed acceptance scenarios, not evidence of passing tests.
- For F01 include new AU06 activation, password reset, multi-tenant/no-membership and expired OTP.
- Mock/prototype data marked `Dữ liệu mẫu`, not a completed real backend action.
