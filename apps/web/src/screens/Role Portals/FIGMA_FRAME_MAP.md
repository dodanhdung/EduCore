# Module H — Nhóm frame Figma (đề xuất để chủ dự án review)

| Màn hình | Frame desktop | Frame mobile | Trạng thái | Thành phần React |
|---|---|---|---|---|
| PO01 | 73:3, 73:2639, 73:3129, 73:3616 | 73:10058 | Mặc định, ngày nghỉ, không có học sinh, điểm danh khóa, chấm bài trễ, đang tải | `TeacherHomeScreen` |
| PO02 | 73:537, 73:4107, 73:4597 | 73:10093 | Mặc định, trống, buổi bị hủy, đang tải | `StudentHomeScreen` |
| PO03 | 73:1050, 73:5087, 73:5596, 73:6091 | 73:10125 | Một/nhiều con, liên kết thu hồi, không có hoạt động, không khả dụng | `ParentHomeScreen` |
| PO04 | 73:1570, 73:6585, 73:7079, 73:7575 | 73:10153 | Mặc định, không ghi danh, thiếu dữ liệu, từ chối truy cập, tab | `ChildLearningScreen` |
| PO05 | 73:2100, 73:8070, 73:8564, 73:9071, 73:9566 | 73:10181 | Phụ huynh/học sinh, không hóa đơn, quá hạn, từ chối truy cập, ví bằng 0 | `MyBillingScreen` |

Figma Page `73:2`: **H. Teacher / Student / Parent Portals**. Frame thiết bị và trạng thái cùng dùng một route canonical; không tạo route nghiệp vụ riêng cho từng biến thể.
