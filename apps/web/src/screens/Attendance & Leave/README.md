# Attendance & Leave — P0 UI slice

UI Preview dùng dữ liệu mẫu, không gọi Attendance/Leave API. Màn production giữ route và auth guard hiện có, hiển thị trạng thái chưa có dữ liệu đến khi API và quyền được nối. Mọi quyết định quyền, hạn khóa, liên kết phụ huynh và kết quả ghi vẫn do backend xác nhận.

## Hợp đồng màn hình (PROPOSED, chờ owner review)

| ID | Mục đích / đối tượng | Route hoặc host | Figma frame và trạng thái |
| --- | --- | --- | --- |
| AT01 | Danh sách buổi theo teacher/staff scope · UC-15 | `/app/:tenantId/attendance` | `62:2` mặc định; `62:2801` rỗng; `62:4488` mobile |
| AT02 | Điểm danh theo buổi · UC-15, BR-04, Q-05 | `/app/:tenantId/sessions/:sessionId/attendance` | `62:574` chưa xác nhận; `62:2959` finalized; `62:3115` locked; `62:4524` mobile |
| AT03 | Gửi đơn trong child/student scope · UC-16, BR-04, Q-02 | `/app/:tenantId/leave-requests/new` | `62:1143` mặc định; `62:3271` nộp muộn; `62:3377` trùng; `62:4585` mobile; `62:4668` forbidden |
| AT04 | Xem và xem xét đơn · UC-16, Q-02 | `/app/:tenantId/leave-requests` | `62:1673` staff; `62:3490` parent; `62:3720` approved; `62:3943` rejected; `62:4619` mobile; `62:4781` forbidden |
| AT05 | Đề nghị sửa sau khóa · UC-15, Q-05 | Embedded trong AT02; Preview `/__ui-preview/AT05` mở AT02 với sheet | `62:2261` mặc định; `62:4166` approved; `62:4327` rejected |

Không có frame Tablet riêng. CSS phản hồi ở 320/390/768/1440; trạng thái được gộp trong từng component thay vì tách trang. F04 chỉ nối AT03 → AT04 → AT02; BL03/BL05 chờ màn/API riêng.

## State và hành động

| Màn | CONNECTED_UI | PENDING_API | Empty / lỗi / phạm vi |
| --- | --- | --- | --- |
| AT01 | Tab, tìm kiếm, lọc, mở đúng session ID | Tải danh sách thực | Empty, loading, forbidden, unavailable, no results |
| AT02 | Chọn radio, ghi chú, kiểm tra đủ học sinh, dialog, mở AT05 | Lưu nháp, xác nhận, quyền/lock/leave | Invalid ID, empty roster, finalized, locked, unavailable |
| AT03 | Chọn học sinh đã liên kết, chọn buổi, nhập lý do, review | Nộp đơn, xác nhận hạn/quan hệ | Empty, duplicate, late warning, forbidden, unavailable |
| AT04 | Tab, tìm kiếm, xem đơn, mở review dialog, kiểm tra lý do | Duyệt, từ chối, cần bổ sung, duyệt ngoại lệ | Empty, forbidden, unavailable; student/parent không có nút duyệt |
| AT05 | Mở/đóng sheet, chọn đề xuất, nhập lý do, kiểm tra khác trạng thái gốc | Gửi correction, cập nhật hóa đơn | Lịch sử mẫu chỉ trong Preview; không có production route |

Thiết kế Figma dùng dữ liệu minh họa không trùng hoàn toàn với Academic/Scheduling Preview hiện tại. Preview mới ưu tiên các ID lớp, buổi và học sinh có quan hệ xác minh được trong fixture hiện có; số học sinh minh họa vì vậy ít hơn Figma. Không gán tên nhân sự hoặc timestamp mẫu trong production component. Các action PENDING_API chỉ hiển thị trạng thái chờ, không báo lưu thành công và không sửa fixture.
