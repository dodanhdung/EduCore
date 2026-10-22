# Module H — Cổng giáo viên, học sinh và phụ huynh

Trạng thái: **UI Module H ban đầu đã được chủ dự án review; bản sửa phạm vi và chỉ xem đang chờ review**. PO01–PO05 dùng AppShell và route tenant hiện có. [Bảng frame](FIGMA_FRAME_MAP.md) liệt kê frame desktop, trạng thái và mobile.

| Màn hình | Vai trò và phạm vi dữ liệu | Điều hướng, trạng thái cục bộ | Hợp đồng còn thiếu |
|---|---|---|---|
| PO01 | `teacherId` có phân công trong buổi và bài tập | SC05, SC06, AT01/02, AS01/03/04; ngày nghỉ, trống, chờ điểm danh | API phân công, điểm danh, hàng chờ chấm |
| PO02 | `studentId` hiện tại, bài được giao, điểm đã công bố | SC06, AS06/07, AT03, GL01; trống, buổi bị hủy | API dữ liệu cá nhân, điểm, thông báo |
| PO03 | Chỉ liên kết con VERIFIED; đổi con tính lại mọi khối | PO04, GL01; PO05/AT03 xem thử với con đã chọn, production chờ phạm vi xác thực | API liên kết hiện hành, bàn giao con đang chọn và bản tóm tắt theo phạm vi |
| PO04 | `studentId` trên route phải có liên kết VERIFIED | Tab lớp, lịch, bài tập/điểm, đơn nghỉ; AS07 xem thử chỉ đọc, production chờ phạm vi xác thực | API ghi danh, phản hồi đã công bố, đơn nghỉ và quyền phụ huynh xem chi tiết bài |
| PO05 | Học sinh của chính mình hoặc con VERIFIED; chỉ hóa đơn ISSUED | Chọn con, BL07 xem thử an toàn; ví thiếu dữ liệu khác ví 0 | API hóa đơn/ví và quyền xem BL07 theo học sinh |

`PortalData` là hợp đồng dữ liệu trình bày. Production hiện chưa cung cấp dữ liệu portal hoặc bằng chứng quyền hiệu lực, nên guard hiện có từ chối truy cập hoặc màn hình hiển thị trạng thái chờ. UI Preview dùng fixture có nhãn và không tạo phiên đăng nhập production. Tương tác cục bộ không ghi dữ liệu nghiệp vụ. VND giữ dạng chuỗi thập phân, tổng dùng `BigInt`; công nợ lấy từ snapshot hóa đơn đã phát hành và không tự trừ số dư ví.

`CONNECTED_UI`: chọn con VERIFIED, tab PO04, bản xem trước AS07 chỉ đọc, BL07 learner và bàn giao con đang chọn trong Preview. `PENDING_API`: dữ liệu portal thật, liên kết con hiện hành, quyền hiệu lực, thông báo, snapshot tài chính và bàn giao phạm vi con cho AS07/BL07/AT03 production. `PENDING_SCREEN`: không có. `NEEDS_SLICE_REVIEW`: PO01 có SLA chấm bài trễ được duyệt hay chưa; phụ huynh có được mở BL07 qua route tài chính hiện tại và được xem những trường hóa đơn nào; hợp đồng bàn giao con đang chọn sang AS07/AT03/PO05 production mà không xem tham số URL là bằng chứng quyền.

Quan hệ mẫu trong Preview được khai báo rõ. `student-minh-anh` và `student-hai-dang` là hai con khác nhau đã xác minh; người thứ nhất có hoạt động học tập, người thứ hai có hóa đơn và ví. ID buổi portal được chiếu sang Preview Scheduling và Attendance. Tham số `source=portal` chỉ dùng trong UI Preview môi trường phát triển. Điều hướng production vẫn theo tenant và guard hiện có.
