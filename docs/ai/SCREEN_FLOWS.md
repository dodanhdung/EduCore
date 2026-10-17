# EduCore — Screen flow contracts (APPROVED PLANNING BASELINE)

**Source:** 7 flows F01–F07 reused from uploaded Stitch specification, augmented with Group A onboarding and Billing v1.1. This is a **screen interaction map**; do not treat it as a test suite or backend implementation. Validate each against UC/AC when that slice is opened.

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
`AT03 → AT04 (duyệt) → AT02 (Teacher finalizes) → BL03 → BL05`. Đơn đúng hạn **không tự động được duyệt**. `EXCUSED=0`, `ATTENDED/UNEXCUSED=1`. `BL03` cần dễ nhìn thấy lý do `NEEDS_INFORMATION` khi dữ liệu điểm danh chưa xác nhận. `AT05` correction sau khóa phải giữ audit và xử lý invoice đã issued qua adjustment.

### F05 — Tính tháng → draft → phát hành → ghi tiền [P0]
`BL01/BL02 → BL03 → BL04 → BL05 → BL06/BL07 → BL08 → BL09`. Review invoice hiển thị nguồn từng dòng và lý do 0/1 charge unit. Button **Phát hành** riêng và phải confirm. Payment chỉ manual, một payment gắn một invoice, phần thu vượt nợ bị chặn. Nếu cần sửa invoice phát hành: `BL10 → OP04/OP05`, không có inline edit total. Nếu điều chỉnh giảm tạo khoản thu vượt: BL07/BL09 hiển thị `PENDING_RESOLUTION` riêng, không tự hoàn tiền hoặc tạo tín dụng P0.

### F06 — Teacher giao bài → Student nộp → Teacher công bố [P0]
`AS01 → AS02 (Publish) → GL01 + AS06 → AS07 (versioned upload) → AS04/AS05 (draft grade) → Publish grade → AS07 read-only result`. Các thông báo in-app chỉ phát sinh sau khi giao bài thành công, không phải khi lưu draft. Điểm nháp chỉ Teacher được xem; Parent chỉ được xem điểm đã công bố và child liên kết.

### F07 — Decision / Job / Audit [P0]
`OP04 → OP05 → kết quả APPROVED → COMPLETED hoặc FAILED`, có audit timeline. Job có `FAILED`, `NEEDS_INFORMATION`, `PENDING_APPROVAL` và retry có permission; UI không dùng `SELF_APPROVED` làm workflow status. UI làm rõ việc notification lỗi **không rollback** hành động gốc đã hoàn tất.


## C. Review gates

- Each flow: record entry screen, permission+scope at each action, transition API, success/error UI and one UC acceptance test.
- For F03/F05/F07 include conflict/idempotency and stale state screenshot.
- For F01 include new AU06 activation, password reset, multi-tenant/no-membership and expired OTP.
- Mock/prototype data marked `Dữ liệu mẫu`, not a completed real backend action.
