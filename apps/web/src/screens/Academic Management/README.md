# Academic Management

Mỗi màn nằm trong thư mục ID canonical riêng `AC01`–`AC09`, theo `docs/ai/SCREEN_MAP.md` và card tương ứng trong `docs/ai/SCREEN_SPECIFICATIONS.md`. AC09 là sheet nhúng do AC08 mở; không có route nghiệp vụ riêng.

`AcademicPrimitives`, `AcademicList`, `AcademicDetail` và `AcademicMorePrimitives` chứa bố cục, bảng, trường nhập và điều khiển dùng chung. `AcademicScreens` và `AcademicMoreScreens` chỉ chọn component theo Screen ID. CSS và kiểu dữ liệu dùng chung nằm ở cấp module. Dữ liệu mẫu chỉ đặt trong `src/ui-preview`, tách khỏi dữ liệu API/phiên thật.

Khi thêm màn Academic: đặt component và test liên quan trong thư mục Screen ID, giữ route canonical trong `src/routes.ts`, và thêm Preview chỉ cho màn đã triển khai. Không đưa dữ liệu mẫu hay đường dẫn Preview vào bundle production.
