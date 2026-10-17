# EduCore — Prototype data and safe demonstrations

**Status:** APPROVED AS MOCK EXAMPLES v1.0 · This is visual/sample data ONLY, not a seeded production database, actual tenant, financial evidence or test output.

## 1. Rules

- Every Figma or React fixture view must show `Dữ liệu mẫu` and must not claim backend writes, successful payments or emails sent.
- Fake users, emails and IDs must stay fictitious; do not use real users' private records, OTPs or session tokens in prompts or screen captures.
- Sample session conflict may appear only in conflict preview, not as confirmed contradictory bookings.
- Preserve accounting example arithmetic; actual totals/permissions must come from approved backend or explicitly labeled mocks.

## 2. Vietnamese prototype fixtures (UI proposal, NOT actual records)

- Tenant demo: `Trung tâm Anh ngữ Minh Tâm`, mã `MT-01`; Manager `Nguyễn Thu Hà`, Teacher `Trần Minh Anh`, Student `Lê Gia Bảo`, Parent `Lê Thanh Bình`. Nội dung này **chỉ để minh họa thiết kế**.
- Lớp: `ENG-A2-01 · Tiếng Anh A2`, `MATH-07A · Toán lớp 7`; Subject/Level hợp lệ trong demo.
- Calendar demo: `Thứ Ba, 13/10/2026`, `18:00–19:30`, Phòng `P.201`, teacher `Trần Minh Anh`; không dùng sự kiện trùng vừa hiển thị như đã `CONFIRMED` trừ khi đang mô phỏng conflict preview.
- Dashboard demo minh họa rõ nhãn `Dữ liệu mẫu`: `126` học sinh ACTIVE (distinct), `14` lớp ACTIVE, `28.450.000 ₫` tổng công nợ ISSUED; **không claim đây là dữ liệu trung tâm thật**.
- Invoice demo: `INV-2026-00001` (nội bộ), 4 buổi `ATTENDED` + 1 buổi `EXCUSED` không thu, đơn giá `250.000 ₫`/buổi, gross `1.000.000 ₫`, discount sibling verified `100.000 ₫`, total `900.000 ₫`, paid `400.000 ₫`, outstanding `500.000 ₫`.
- Assignment demo: `Ôn tập Unit 5`, deadline `20/10/2026 21:00`, priority `★★★★☆`, 1 submission `LATE` nếu đúng trường hợp; điểm chỉ hiện với Student/Parent nếu trạng thái công bố.
- Notification demo P0: `Buổi học ENG-A2-01 đổi sang 18:30` và `Bạn có bài tập mới: Ôn tập Unit 5`; **không** thêm nhắc hạn tự động nếu đang ở mock P0.


