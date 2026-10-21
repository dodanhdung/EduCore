# Vị trí các màn hình

Mỗi màn được đặt tại `screens/<module>/<SCREEN-ID>/`. Tên nhóm theo các module trong `docs/ai/SCREEN_SPECIFICATIONS.md`; ID màn là ID canonical trong `docs/ai/SCREEN_MAP.md`. Chỉ tạo màn khi slice đó được mở; không nhân đôi màn P1 hoặc alias.

| Module trong Screen Specifications | Thư mục |
|---|---|
| Authentication & Shared | `Authentication & Shared/` |
| Management & Operations | `Management & Operations/` |
| Academic Management | `Academic Management/` |
| Scheduling & Resources | `Scheduling & Resources/` |
| Attendance & Leave | `Attendance & Leave/` |
| Billing & Receivables | `Billing & Receivables/` |
| Assignments & Grading | `Assignments & Grading/` |
| Teacher / Student / Parent Portals | `Teacher, Student & Parent Portals/` |

Tên cuối đổi dấu `/` trong tiêu đề module thành dấu phẩy và `&`, vì `/` là ký tự phân cấp thư mục trên Windows.
