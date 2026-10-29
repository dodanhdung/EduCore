# Academic Management

Mỗi màn nằm trong thư mục ID canonical riêng `AC01`–`AC09`, theo `docs/ai/SCREEN_MAP.md` và card tương ứng trong `docs/ai/SCREEN_SPECIFICATIONS.md`. AC09 là sheet nhúng do AC08 mở; không có route nghiệp vụ riêng.

AC01–AC04 dùng `AcademicPersonListView`, `AcademicPersonDetailView` và `AcademicPersonViewModel` làm một lớp trình bày cho production và DEV preview. `AcademicProduction` chuyển DTO API và capabilities thành callbacks; các wrapper AC01–AC04 chuyển fixture DEV qua cùng view. `AcademicList` và `AcademicDetail` là layout cũ, không còn được wrapper AC01–AC04 sử dụng.

`AcademicPrimitives` và `AcademicMorePrimitives` vẫn phục vụ biểu mẫu mẫu và AC05–AC08. `AcademicScreens` và `AcademicMoreScreens` chỉ chọn component theo Screen ID. Dữ liệu mẫu chỉ đặt trong `src/ui-preview`, tách khỏi dữ liệu API/phiên thật.

Khi thêm màn Academic: đặt component và test liên quan trong thư mục Screen ID, giữ route canonical trong `src/routes.ts`, và thêm Preview chỉ cho màn đã triển khai. Không đưa dữ liệu mẫu hay đường dẫn Preview vào bundle production.
