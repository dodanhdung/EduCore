# Assignments & Grading UI — AS01–AS07

Trạng thái: **PROPOSED / chờ chủ sở hữu review từng màn hình**. Nguồn: Figma Page `71:2` “G. Assignments & Grading”; `SCREEN_MAP.md` AS01–AS07; `SCREEN_SPECIFICATIONS.md` §G; F06; UC-27–29; Q-11. Xem [FIGMA_FRAME_MAP.md](FIGMA_FRAME_MAP.md) để đối chiếu khung.

Mỗi thư mục AS01–AS07 chứa một màn hình logic. Các trạng thái thiết kế là React state hoặc `?state=` trong UI Preview, không phải route business riêng. Route đã có trong `routes.ts`. `App.tsx` giữ các guard hiện có; màn hình production chưa có API thì hiển thị trạng thái trống, không nhập fixture. Fixture chỉ nằm trong `ui-preview/assignmentFixtures.ts`, được nạp qua entry Preview phát triển.

| ID | Actor/phạm vi | Dữ liệu và thao tác | Ranh giới |
| --- | --- | --- | --- |
| AS01 | Teacher, lớp được phân công | Tìm/lọc, chọn bài theo ID | Danh sách thật cần API có scope |
| AS02 | Teacher có quyền tạo | Nhập, kiểm tra, xem lại người nhận | Lưu nháp/xuất bản `PENDING_API`; người nhận do backend xác nhận |
| AS03 | Teacher được phân công | Chi tiết, bản nộp và ID tới AS05 | Không sửa lịch sử phiên bản |
| AS04 | Teacher được phân công | Lọc hàng chờ, mở submission ID | Không rò lớp/học sinh khác |
| AS05 | Teacher có quyền chấm | Chọn version, điểm 0–10 bước 0,1, phản hồi | Nháp/công bố/điều chỉnh `PENDING_API`; tệp riêng không có URL công khai |
| AS06 | Student tự thân | Bài đã giao cho student ID, lọc/tìm | Điểm nháp không hiển thị |
| AS07 | Student được giao | Chọn/bỏ tệp, lỗi type/MIME/size/count, lịch sử | Nộp/nộp lại `PENDING_API`; quyền nộp server quyết định |

Trạng thái loading/empty/error/not-found có mặt trên danh sách và chi tiết. Dialog có focus ban đầu, vòng Tab và Escape. Màn hình dùng AppShell, token CSS có sẵn và card mobile. Preview dữ liệu mẫu không tạo phiên đăng nhập, không gọi API, không tải tệp lên, không công bố bài hoặc điểm, không gửi thông báo.

`NEEDS_SLICE_REVIEW`: Q-11 nói nộp lại trước khi chấm/công bố, Detailed Design đề xuất khóa khi có nháp điểm. UI hiển thị sự chưa thống nhất và chờ contract backend phê duyệt.

**PROPOSED để chủ sở hữu review:** AS01 dùng cửa sổ 72 giờ theo thời điểm tuyệt đối để trình bày KPI “Sắp đến hạn”. Spec chưa định nghĩa khoảng này; đây không phải chính sách nhắc hạn hay thông báo. Preview cấp đồng hồ mẫu cố định; nếu không có mốc thời gian, KPI hiển thị “—”. ISO deadline có offset nên so sánh instant không phụ thuộc timezone máy người xem.

AS02 tạo mới với các trường trống. Chế độ sửa chỉ dùng assignment ID được chọn; bài đã giao có bài nộp bị khóa chỉnh sửa cục bộ cho đến khi có biện pháp bảo vệ được duyệt. Số người nhận chỉ lấy từ roster tường minh trong dữ liệu màn hình; fixture Preview có roster minh họa, còn thiếu roster thì báo chưa xác minh. Backend vẫn phải xác nhận người nhận cuối cùng. AS05 và AS07 gắn state chỉnh sửa tạm với submission ID hoặc cặp student/assignment ID, không ghi ngược vào fixture.

Thiếu tích hợp API; Figma được đọc trong lượt triển khai ban đầu, không chỉnh sửa trong lượt sửa này.
