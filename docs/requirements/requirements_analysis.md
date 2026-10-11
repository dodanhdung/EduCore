# EduCore — Requirements Analysis
## 1. Mục tiêu

EduCore là hệ thống web quản lý trung tâm đào tạo, tập trung vào bốn nhóm nghiệp vụ: xếp lịch và giải quyết xung đột; học phí theo biến động; theo dõi bài tập và tiến độ; quản lý phân quyền.
## 2. Actors — Các vai trò sử dụng

| Actor | Vai trò |
|---|---|
| **Manager (Quản lý)** | Quản lý hoạt động trung tâm, nhân sự, lớp học và theo dõi báo cáo. |
| **Academic Staff (Giáo vụ)** | Xếp lịch, quản lý lớp, điểm danh, học bù, bảo lưu, dạy thay. |
| **Accountant (Kế toán)** | Tính học phí, quản lý hóa đơn, thanh toán và công nợ. |
| **Teacher (Giáo viên)** | Xem lịch dạy, điểm danh, giao bài tập, chấm điểm. |
| **Student (Học sinh)** | Xem lịch học, làm bài tập, theo dõi tiến độ. |
| **Parent (Phụ huynh)** | Theo dõi kết quả học tập, lịch học, học phí của con. |
| **System Administrator (Quản trị hệ thống)** | Quản lý các trung tâm sử dụng nền tảng. |
> **Lưu ý:** System Administrator là vai trò quản trị nền tảng, khác với Manager của từng trung tâm.

## 3. User Stories

Định dạng: **As a [Role], I want [Feature], so that [Benefit].**

### 3.1. Quản lý trung tâm

| ID | User Story |
|---|---|
| US-01 | Là quản lý, tôi muốn quản lý thông tin giáo viên, học sinh, khóa học và lớp học để tổ chức hoạt động đào tạo. |
| US-02 | Là quản lý, tôi muốn xem báo cáo tình trạng lớp học, học phí và tiến độ học tập để đánh giá hoạt động trung tâm. |
| US-03 | Là quản lý, tôi muốn cấu hình vai trò và quyền truy cập để đảm bảo mỗi nhân viên chỉ được thực hiện các nghiệp vụ được cho phép. |

### 3.2. Giáo vụ

| ID | User Story |
|---|---|
| US-04 | Là giáo vụ, tôi muốn xếp lịch học và được cảnh báo khi trùng giáo viên, phòng học hoặc lịch bận để tránh xung đột. |
| US-05 | Là giáo vụ, tôi muốn tìm lớp học bù phù hợp với trình độ và lịch rảnh của học sinh để sắp xếp học bù. |
| US-06 | Là giáo vụ, tôi muốn quản lý yêu cầu bảo lưu và sắp xếp lại lớp khi học sinh quay lại. |
| US-07 | Là giáo vụ, tôi muốn tìm và chỉ định giáo viên dạy thay phù hợp khi giáo viên chính vắng mặt. |

### 3.3. Kế toán

| ID | User Story |
|---|---|
| US-08 | Là kế toán, tôi muốn hệ thống tính học phí dựa trên số buổi tính phí và các chính sách giảm giá để hạn chế sai sót. |
| US-09 | Là kế toán, tôi muốn theo dõi hóa đơn, thanh toán và công nợ để quản lý tình hình thu học phí. |

### 3.4. Giáo viên

| ID | User Story |
|---|---|
| US-10 | Là giáo viên, tôi muốn xem lịch dạy và điểm danh học sinh để theo dõi việc tham gia học tập. |
| US-11 | Là giáo viên, tôi muốn giao bài tập, đặt deadline và mức độ ưu tiên để quản lý công việc học tập của học sinh. |
| US-12 | Là giáo viên, tôi muốn đánh giá bài tập và ghi nhận tiến độ để hỗ trợ học sinh cải thiện kết quả. |

### 3.5. Học sinh và phụ huynh

| ID | User Story |
|---|---|
| US-13 | Là học sinh, tôi muốn xem lịch học, nhận bài tập và nộp bài để hoàn thành nhiệm vụ học tập. |
| US-14 | Là phụ huynh, tôi muốn theo dõi lịch học, chuyên cần, bài tập và học phí của con. |
| US-15 | Là học sinh hoặc phụ huynh, tôi muốn nhận thông báo khi sắp đến hạn nộp bài hoặc lịch học thay đổi để không bỏ lỡ thông tin. |

## 4. Functional Requirements (FR)
**Mức ưu tiên:**

- **P0 — Must Have:** Cần có trong MVP.
- **P1 — Should Have:** Quan trọng, có thể hoàn thiện sau MVP.
- **P2 — Could Have:** Có thể phát triển ở phiên bản tiếp theo.

### 4.1. User & Access Management

| ID | Functional Requirement | Priority |
|---|---|---|
| FR-01 | Hệ thống cho phép người dùng đăng nhập, đăng xuất và khôi phục mật khẩu. | P0 |
| FR-02 | Hệ thống cho phép quản lý tài khoản người dùng và trạng thái hoạt động. | P0 |
| FR-03 | Hệ thống hỗ trợ phân quyền theo vai trò và các quyền thao tác tương ứng. | P0 |
| FR-04 | Hệ thống kiểm soát quyền truy cập theo phạm vi dữ liệu, ví dụ giáo viên chỉ được chấm điểm lớp mình phụ trách. | P0 |
| FR-05 | Hệ thống cho phép người có thẩm quyền cấu hình quyền cho từng vai trò mà không cần sửa mã nguồn. | P1 |
| FR-06 | Hệ thống hỗ trợ liên kết tài khoản phụ huynh với một hoặc nhiều học sinh. | P0 |

### 4.2. Academic Management

| ID | Functional Requirement | Priority |
|---|---|---|
| FR-07 | Hệ thống cho phép thêm, sửa, tìm kiếm và quản lý hồ sơ giáo viên, học sinh. | P0 |
| FR-08 | Hệ thống cho phép quản lý khóa học, trình độ và lớp học. | P0 |
| FR-09 | Hệ thống cho phép phân công giáo viên phụ trách lớp. | P0 |
| FR-10 | Hệ thống cho phép ghi danh, chuyển lớp và cập nhật trạng thái học tập của học sinh. | P0 |
| FR-11 | Hệ thống cho phép quản lý phòng học, sức chứa và lịch bận của các tài nguyên. | P0 |

### 4.3. Scheduling & Conflict Resolution

| ID | Functional Requirement | Priority |
|---|---|---|
| FR-12 | Hệ thống cho phép tạo lịch học theo buổi riêng lẻ hoặc lịch lặp hằng tuần. | P0 |
| FR-13 | Hệ thống phát hiện xung đột lịch của giáo viên, phòng học và học sinh. | P0 |
| FR-14 | Hệ thống ngăn xác nhận lịch học khi tồn tại xung đột không được phép. | P0 |
| FR-15 | Hệ thống cho phép tra cứu các khung giờ và tài nguyên khả dụng để hỗ trợ giải quyết xung đột. | P1 |
| FR-16 | Hệ thống cho phép thay đổi, hủy và sắp xếp lại lịch học. | P0 |
| FR-17 | Hệ thống hiển thị lịch học theo ngày, tuần và theo vai trò người dùng. | P0 |

### 4.4. Attendance & Academic Exceptions

| ID | Functional Requirement | Priority |
|---|---|---|
| FR-18 | Hệ thống cho phép giáo viên điểm danh và ghi nhận trạng thái tham gia từng buổi học. | P0 |
| FR-19 | Hệ thống cho phép ghi nhận đơn xin nghỉ học và lý do nghỉ. | P0 |
| FR-20 | Hệ thống hỗ trợ tìm lớp học bù dựa trên trình độ, lịch học và số chỗ còn trống. | P1 |
| FR-21 | Hệ thống cho phép đăng ký học bù và liên kết buổi học bù với buổi nghỉ ban đầu. | P1 |
| FR-22 | Hệ thống cho phép tạo yêu cầu bảo lưu với thời gian bắt đầu và kết thúc. | P1 |
| FR-23 | Hệ thống hỗ trợ quản lý trạng thái bảo lưu và sắp xếp lại lớp khi học sinh quay lại. | P1 |
| FR-24 | Hệ thống cho phép phân công giáo viên dạy thay và kiểm tra xung đột lịch của giáo viên thay thế. | P1 |

### 4.5. Dynamic Billing & Payment Management

| ID | Functional Requirement | Priority |
|---|---|---|
| FR-25 | Hệ thống hỗ trợ cấu hình đơn giá học phí theo khóa học, lớp học hoặc buổi học. | P0 |
| FR-26 | Hệ thống tính số buổi được thu phí dựa trên lịch học, điểm danh và chính sách nghỉ học. | P0 |
| FR-27 | Hệ thống hỗ trợ áp dụng chính sách giảm giá khi tính học phí. | P0 |
| FR-28 | Hệ thống cho phép cấu hình nhiều loại ưu đãi như giảm giá anh em ruột, combo hoặc khuyến mãi. | P1 |
| FR-29 | Hệ thống tự động tạo bảng tính học phí và hóa đơn chi tiết. | P0 |
| FR-30 | Hệ thống cho phép ghi nhận các khoản thanh toán và theo dõi công nợ. | P0 |
| FR-31 | Hệ thống lưu lịch sử điều chỉnh hóa đơn và đảm bảo hóa đơn đã phát hành không bị tự ý thay đổi. | P0 |

### 4.6. Assignment & Progress Tracking

| ID | Functional Requirement | Priority |
|---|---|---|
| FR-32 | Giáo viên có thể tạo, chỉnh sửa và giao bài tập cho học sinh hoặc lớp học. | P0 |
| FR-33 | Bài tập có deadline và mức độ ưu tiên (priority stars). | P0 |
| FR-34 | Học sinh có thể nộp bài và xem trạng thái bài tập. | P0 |
| FR-35 | Giáo viên có thể đánh giá, chấm điểm và phản hồi bài tập. | P0 |
| FR-36 | Hệ thống tổng hợp tiến độ học tập và cho phép phụ huynh theo dõi kết quả của con. | P1 |

### 4.7. Notification Management

| ID | Functional Requirement | Priority |
|---|---|---|
| FR-37 | Hệ thống gửi thông báo khi lịch học thay đổi hoặc học sinh được giao bài tập mới. | P1 |
| FR-38 | Hệ thống tự động nhắc nhở trước deadline bài tập theo thời điểm được cấu hình. | P1 |
| FR-39 | Hệ thống hỗ trợ lưu trạng thái gửi thông báo và xử lý gửi lại khi thất bại. | P1 |

### 4.8. Reporting & System Administration

| ID | Functional Requirement | Priority |
|---|---|---|
| FR-40 | Hệ thống cung cấp báo cáo tổng quan số lượng học sinh, lớp học, tình trạng học tập và học phí. | P1 |
| FR-41 | Hệ thống lưu nhật ký thay đổi cho các thao tác quan trọng như đổi lịch, sửa hóa đơn và thay đổi phân quyền. | P0 |
| FR-42 | Hệ thống hỗ trợ quản lý dữ liệu độc lập theo từng trung tâm, bảo đảm người dùng không truy cập dữ liệu của trung tâm khác. | P0* |
| FR-43 | Hệ thống cho phép cấu hình chính sách riêng cho từng trung tâm như học phí và quy định nghỉ học. | P1 |

> **FR-42:** P0 nếu mục tiêu là sản phẩm đa trung tâm. Nếu demo một trung tâm trước, có thể giới hạn triển khai ban đầu, nhưng cần cân nhắc khả năng tách dữ liệu ngay trong thiết kế.

## 5. Non-functional Requirements (NFR)

NFR xác định các thuộc tính chất lượng và ràng buộc vận hành của hệ thống. Các số liệu bên dưới là **mục tiêu đề xuất**, cần thống nhất với phạm vi tải và hạ tầng trước khi nghiệm thu.

| ID | Category | Non-functional Requirement |
|---|---|---|
| NFR-01 | Performance | 95% các yêu cầu API thông thường cần được xử lý trong vòng 1 giây, không tính độ trễ mạng bên ngoài. |
| NFR-02 | Performance | Các thao tác phát hiện xung đột lịch cần phản hồi trong vòng 2 giây với quy mô dữ liệu thử nghiệm đã xác định. |
| NFR-03 | Scalability | Hệ thống cần được thiết kế để hỗ trợ nhiều trung tâm mà không làm lẫn dữ liệu. |
| NFR-04 | Security | Toàn bộ giao tiếp sử dụng HTTPS; mật khẩu phải được băm bằng thuật toán phù hợp như Argon2id hoặc bcrypt. |
| NFR-05 | Security | Mọi API yêu cầu phân quyền phải xác thực quyền truy cập tại Backend, không chỉ ẩn chức năng ở Frontend. |
| NFR-06 | Data Integrity | Những thao tác thay đổi nhiều dữ liệu liên quan, đặc biệt là thu học phí và đăng ký học bù, phải đảm bảo tính toàn vẹn giao dịch. |
| NFR-07 | Reliability | Hệ thống triển khai production hướng đến mức khả dụng tối thiểu 99,5% theo tháng, không tính bảo trì có kế hoạch. |
| NFR-08 | Recoverability | Dữ liệu được sao lưu tự động hằng ngày; mục tiêu khôi phục RPO không quá 24 giờ và RTO không quá 4 giờ. |
| NFR-09 | Usability | Giao diện dễ sử dụng, có khả năng hiển thị phù hợp trên máy tính, máy tính bảng và điện thoại. |
| NFR-10 | Compatibility | Hệ thống hỗ trợ các phiên bản phổ biến, còn được hỗ trợ của Chrome, Edge và Firefox. |
| NFR-11 | Maintainability | Các module nghiệp vụ cần có tính độc lập tương đối, dễ kiểm thử, thay đổi và mở rộng. |
| NFR-12 | Testability | Các module xếp lịch và tính học phí cần đạt tối thiểu 80% branch coverage khi chạy Unit Tests. |
| NFR-13 | Observability | Hệ thống phải ghi nhận lỗi ứng dụng và cung cấp thông tin phục vụ truy vết, không ghi thông tin nhạy cảm vào log. |
| NFR-14 | Privacy | Chỉ những người có thẩm quyền mới được truy cập thông tin cá nhân, học tập và thanh toán của học sinh. |

> **Lưu ý:** Các mục tiêu về độ sẵn sàng, sao lưu và hiệu năng áp dụng khi triển khai chính thức. Chưa được xem là đã đáp ứng nếu chưa kiểm thử.

## 6. Business Rules — Quy tắc nghiệp vụ cần xác nhận

Functional Requirements xác định hệ thống phải cung cấp chức năng gì; Business Rules xác định cách xử lý cụ thể.

| ID | Business Rule cần xác định |
|---|---|
| BR-01 | Hai buổi học như thế nào được xem là trùng lịch? Những tài nguyên nào không được phép trùng? |
| BR-02 | Điều kiện để một học sinh được học bù là gì? Cần cùng trình độ, còn chỗ và không trùng lịch hay còn điều kiện khác? |
| BR-03 | Mỗi buổi nghỉ được học bù tối đa bao nhiêu lần? Học bù có phát sinh thêm học phí không? |
| BR-04 | Học sinh nghỉ có phép được giảm học phí trong trường hợp nào? Nghỉ không phép được xử lý ra sao? |
| BR-05 | Khi bảo lưu, học phí đã đóng được giữ thành tín dụng, hoàn lại hay xử lý bằng cách khác? |
| BR-06 | Một học sinh được áp dụng đồng thời giảm giá anh em ruột và combo 6 tháng không? Nếu có, tính theo thứ tự nào? |
| BR-07 | Giáo viên dạy thay có bắt buộc cùng chuyên môn, trình độ hoặc thỏa mãn điều kiện được phân công không? |
| BR-08 | Ai có quyền phê duyệt học bù, bảo lưu, dạy thay và điều chỉnh hóa đơn? |

**Quan trọng:** Không tự động mặc định rằng mọi buổi nghỉ có phép đều được miễn học phí; mỗi trung tâm có thể áp dụng chính sách khác nhau.


