# Scheduling & Resources

## Phạm vi UI SC01–SC06 — đề xuất để chủ sở hữu rà soát

SC01–SC06 dùng AppShell và route có kiểm tra phiên/tenant/quyền hiện hành; SC04 nhúng vào SC03/SC05, không có route nghiệp vụ. Do chưa có hợp đồng API dữ liệu lịch/tài nguyên, route production hiển thị trạng thái chưa kết nối an toàn; dữ liệu mẫu chỉ có ở UI Preview trong môi trường phát triển. Mọi thao tác ghi là `PENDING_API`, không tạo/sửa dữ liệu mẫu và không xác nhận khả dụng tài nguyên.

| ID | Figma frame | Vai trò trong React |
|---|---|---|
| SC01 | 57:2, 59:2, 59:245, 59:488 | Cùng một màn lịch: tuần, ngày, tháng, trống |
| SC02 | 57:597, 59:701 | Cùng một màn tài nguyên: phòng học và tab lịch bận |
| SC03 | 57:1183, 60:2 | Một form với bước nhập, xem trước, rà soát; chuỗi tuần/một buổi |
| SC04 | 57:1783, 60:213, 60:430 | Panel nhúng: nhiều, không, một và xung đột lúc xác nhận |
| SC05 | 58:2, 60:687, 60:1394 | Chi tiết, đã hủy, mobile; dialog đổi/hủy |
| SC06 | 58:567, 60:1045, 60:1221, 60:1425, 60:1462 | Giáo viên, phụ huynh, trống, mobile, học viên |

**SC01:** Người có quyền xem lịch trong tenant; đổi kỳ/ngày hôm nay, ba chế độ lịch, bộ lọc lớp/giáo viên/phòng, xem nhanh buổi, đi đến SC03/SC05 trong preview là `CONNECTED_UI`. Trạng thái: lịch có buổi, trống, tải, lỗi; các trạng thái buổi xác nhận/nháp/đã hủy có nhãn. Không dùng màu làm dấu hiệu duy nhất. Lịch mẫu hiển thị theo `Asia/Ho_Chi_Minh`; nguồn ngày mẫu được cố định để preview tái lập.

**SC02:** Người có quyền xem tài nguyên trong tenant; tab, tìm/lọc, xem phòng không phải bản ghi đầu tiên, xem lịch bận, mở/đóng dialog và kiểm tra sức chứa/khoảng thời gian là `CONNECTED_UI`. Lưu phòng, sửa phòng và đăng ký lịch bận là `PENDING_API`. Trạng thái: có dữ liệu, lọc trống, tải, lỗi, mã phòng không hợp lệ, phòng ngưng hoạt động, lịch bận đã hủy, lỗi trường nhập. API sẽ phải xác minh sức chứa, quyền và chồng lấn với lịch có hiệu lực.

**SC03/SC04:** UC-12, BR-01, Q-04, F03. Form chọn lớp, giáo viên, phòng/hình thức, ngày giờ và một buổi/chuỗi tuần. `SchedulingLogic` kiểm tra trường và sáu tháng, tạo danh sách ngày để rà soát; kết quả này không chứng minh chỗ trống hoặc giữ tài nguyên. SC04 là panel nhúng với nguồn giáo viên, phòng, học sinh, lịch bận và sức chứa; trạng thái zero/one/many/race chỉ là fixture. Nút xác nhận luôn bị khóa chờ API có quyền, kiểm tra lại toàn chuỗi và ghi all-or-nothing. Việc quay lại bước nhập giữ giá trị người dùng.

**SC05:** UC-13–14, Q-04. Chi tiết theo `sessionId` chính xác, mã sai hiển thị không tìm thấy; bảng học sinh chỉ dùng dữ liệu đã được cung cấp trong scope. Nút đổi/hủy chỉ hiện khi có `canEdit` tường minh, buổi tương lai và chưa hủy. Dialog kiểm tra ngày/giờ/lý do tại chỗ, SC04 có thể mở trong luồng đổi lịch. Không đổi/hủy fixture và không báo thành công. Lịch sử/notification thực tế chờ API.

**SC06:** UC-14, UC-30 phần xem. Lịch chỉ đọc với scope giáo viên, học viên hoặc phụ huynh được truyền tường minh; preview có lựa chọn con liên kết và từ chối `childId` lạ. Bảng desktop, agenda mobile, tuần/danh sách, trống và buổi hủy đều cùng một design unit. Route production không suy ra quyền từ tên vai trò hoặc fixture.

**Responsive:** Dùng lưới co giãn; lịch tuần và bảng tài nguyên cuộn ngang trong vùng nội dung trên màn hẹp; lịch cá nhân đổi sang agenda card. Điều hướng mobile thuộc AppShell hiện có. Figma screenshot được dùng làm đích so sánh; phần shell giữ cấu trúc repository và khác ảnh Figma. Cần kiểm tra screenshot ở đúng viewport 320/390/768/1440 trước khi chốt visual.
