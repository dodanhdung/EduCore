# EduCore — Requirements Analysis
## 1. Mục tiêu và phương pháp
EduCore là hệ thống web quản lý trung tâm đào tạo, tập trung vào bốn nhóm nghiệp vụ: xếp lịch và giải quyết xung đột; học phí theo biến động; theo dõi bài tập và tiến độ; quản lý phân quyền.
### 1.1. Lịch sử thay đổi
| Phiên bản | Thay đổi |
|---|---|
| **1** | Xác định Actors, 15 User Stories, 43 FR, 14 NFR, 8 Business Rules. |
| **2** | Làm rõ Role khác Job Position; cho phép một tài khoản có nhiều role; định hướng Automation-first / Human-in-the-loop; bổ sung US-16 đến US-19, FR-44 và FR-45, NFR-15 đến NFR-16, BR-09 đến BR-14. |
| **3** | Chốt 14 Business Rules thành quy tắc có điều kiện/ngoại lệ rõ ràng; xác định tham số chính sách mặc định, phạm vi P0/P1 và minh họa kiểm thử; cập nhật sơ đồ Automation-first bằng tiếng Việt. |
| **4** | Đưa thông báo **trong ứng dụng** về P0 (FR-37, phần P0 của FR-39) và dashboard **thống kê cơ bản** về P0 (phần P0 của FR-40); giữ thông báo email, nhắc deadline và báo cáo nâng cao ở P1. Đồng bộ US-02, US-15 và ranh giới triển khai. |
| **5** | Chốt Q-01–Q-15 làm baseline thiết kế; chọn OTP email cho khôi phục mật khẩu; chốt quyền, lịch, học phí, bài tập, chỉ số và audit; ràng buộc P0 **Internal-first** (chỉ kết nối ngoài để gửi OTP email). Đồng bộ UC và tiêu chí nghiệm thu. |

### 1.2. Thuật ngữ
- **Role:** Nhóm quyền trong hệ thống (ví dụ `ACCOUNTANT`, `ACADEMIC_STAFF`); không đồng nhất với một vị trí tuyển dụng.
- **Job Position:** Vị trí/đầu việc trong tổ chức; một người có thể kiêm nhiệm nhiều vị trí.
- **Permission:** Quyền thao tác cụ thể, ví dụ `invoice.adjust`, `schedule.approve`.
- **Automation-first:** Tự động tính toán/xử lý trường hợp đủ điều kiện theo quy tắc đã xác nhận.
- **Human-in-the-loop:** Cần người được ủy quyền kiểm tra, phê duyệt hoặc giải quyết trường hợp ngoại lệ.
- **Tenant:** Một trung tâm (hoặc một tổ chức quản lý trung tâm) có phạm vi dữ liệu và cấu hình riêng.

## 2. Actors — Các vai trò sử dụng

| Actor / Role | Trách nhiệm chính trong hệ thống | Có cần nhân sự riêng? |
|---|---|---|
| **Manager (Quản lý)** | Cấu hình chính sách, quản lý hoạt động, giám sát, phê duyệt ngoại lệ theo quyền được cấp. | Vai trò nghiệp vụ cốt lõi của trung tâm. |
| **Academic Staff (Giáo vụ)** | Giám sát lịch học, xử lý các trường hợp học bù, bảo lưu, dạy thay và xung đột phức tạp. | **Không bắt buộc.**|
| **Accountant (Kế toán)** | Kiểm soát học phí, đối soát thanh toán, xử lý điều chỉnh và ngoại lệ tài chính. | **Không bắt buộc.**|
| **Teacher (Giáo viên)** | Xem lịch dạy, điểm danh, giao/chấm bài tập, phản hồi học sinh. | Phụ thuộc mô hình đào tạo. |
| **Student (Học sinh)** | Xem lịch học, nộp bài, theo dõi tiến độ. | Là nhóm người dùng nghiệp vụ. |
| **Parent (Phụ huynh)** | Theo dõi học tập, lịch học và nghĩa vụ học phí của con. | Là nhóm người dùng nghiệp vụ. |
| **System Administrator (Quản trị nền tảng)** | Quản lý các tenant và vận hành nền tảng khi triển khai mô hình đa trung tâm. | Thuộc bên vận hành EduCore, **khác** Manager của trung tâm. |

### Quy tắc ánh xạ User – Role – Permission
1. **Một tài khoản có thể được gán nhiều role** trong phạm vi tenant được phép.
2. **Một role có nhiều permission**; các kiểm tra quyền và phạm vi dữ liệu được thực hiện ở Backend. Không dựa vào việc ẩn nút ở Frontend để bảo vệ nghiệp vụ.
3. **Không giả định mỗi role tương ứng một tài khoản độc lập.** Trung tâm lớn có thể phân công riêng, trung tâm nhỏ có thể kiêm nhiệm.
4. Các hành động cần phê duyệt dựa trên **permission** và chính sách trung tâm, không gắn cứng vào tên chức danh. Với thao tác tài chính nhạy cảm, có thể cấu hình người phê duyệt khác người tạo yêu cầu.
5. Một người có nhiều quyền **không được phép vượt phạm vi tenant hoặc phạm vi lớp/học sinh** mà họ được phân công.

## 3. User Stories
Định dạng: **As a [Role], I want [Feature], so that [Benefit].**
### 3.1. Quản lý trung tâm
| ID | User Story |
|---|---|
| US-01 | Là quản lý, tôi muốn quản lý thông tin giáo viên, học sinh, khóa học và lớp học để tổ chức hoạt động đào tạo. |
| US-02 | Là quản lý, tôi muốn xem dashboard cơ bản về số học sinh, số lớp và công nợ (P0), sau đó xem báo cáo chi tiết tình trạng lớp học, học phí và tiến độ học tập (P1) để đánh giá hoạt động trung tâm. |
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
| US-15 | Là học sinh hoặc phụ huynh, tôi muốn nhận thông báo trong ứng dụng khi lịch học thay đổi hoặc có bài tập mới (P0), và được nhắc trước hạn nộp bài (P1), để không bỏ lỡ thông tin. |

### 3.6. Bổ sung
| ID | User Story |
|---|---|
| US-16 | Là quản lý, tôi muốn cấu hình những nghiệp vụ được xử lý tự động và những trường hợp phải chờ phê duyệt để phù hợp chính sách trung tâm. |
| US-17 | Là người có quyền xử lý, tôi muốn nhận và quản lý danh sách yêu cầu ngoại lệ đang chờ duyệt để không bỏ sót công việc. |
| US-18 | Là quản lý, tôi muốn một tài khoản có thể đảm nhận nhiều vai trò để vận hành trung tâm nhỏ mà không phải tạo tài khoản nhân sự không cần thiết. |
| US-19 | Là người được phân quyền, tôi muốn xem lý do, quy tắc áp dụng và lịch sử thao tác của quyết định tự động để có thể kiểm tra, giải quyết sai lệch. |

**Ghi chú:** 
- **US-16, US-18:** Bổ sung cho Manager.
- **US-17, US-19:** Bổ sung cho các actor có vai trò xử lý / kiểm tra tương ứng.

## 4. Functional Requirements (FR)
**Mức ưu tiên:**
- **P0 — Must Have:** Cần có trong MVP.
- **P1 — Should Have:** Quan trọng, có thể hoàn thiện sau MVP.
- **P2 — Could Have:** Có thể phát triển ở phiên bản tiếp theo.

### 4.1. User & Access Management
| ID | Functional Requirement | Priority |
|---|---|---|
| FR-01 | Hệ thống cho phép đăng nhập bằng email/mật khẩu, đăng xuất/thu hồi phiên và khôi phục mật khẩu bằng **OTP gửi email**; xác thực OTP do Backend thực hiện. | P0 |
| FR-02 | Hệ thống cho phép quản lý tài khoản người dùng và trạng thái hoạt động. | P0 |
| FR-03 | Hệ thống hỗ trợ phân quyền theo vai trò/quyền thao tác, đồng thời cho phép một tài khoản có nhiều vai trò trong cùng tenant. | P0 |
| FR-04 | Hệ thống kiểm soát quyền truy cập theo phạm vi dữ liệu, ví dụ giáo viên chỉ được chấm điểm lớp mình phụ trách. | P0 |
| FR-05 | Hệ thống cho phép người có thẩm quyền cấu hình quyền cho từng vai trò mà không cần sửa mã nguồn; các quyền nhạy cảm chỉ được thay đổi bởi người được ủy quyền. | P1 |
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
| FR-15 | Hệ thống cho phép tra cứu/đề xuất các khung giờ và tài nguyên khả dụng để hỗ trợ giải quyết xung đột; không tự xác nhận lịch mới nếu chưa thỏa chính sách. | P1 |
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
| FR-24 | Hệ thống hỗ trợ đề xuất/phân công giáo viên dạy thay, kiểm tra năng lực và xung đột lịch; xác nhận tự động chỉ khi chính sách cho phép. | P1 |

### 4.5. Dynamic Billing & Payment Management
| ID | Functional Requirement | Priority |
|---|---|---|
| FR-25 | Hệ thống hỗ trợ cấu hình đơn giá học phí theo khóa học, lớp học hoặc buổi học. | P0 |
| FR-26 | Hệ thống tính số buổi được thu phí dựa trên lịch học, điểm danh và chính sách nghỉ học. | P0 |
| FR-27 | Hệ thống hỗ trợ áp dụng chính sách giảm giá khi tính học phí. | P0 |
| FR-28 | Hệ thống cho phép cấu hình nhiều loại ưu đãi như giảm giá anh em ruột, combo hoặc khuyến mãi. | P1 |
| FR-29 | Hệ thống tự động tính và tạo bảng kê/hóa đơn dự thảo chi tiết; việc phát hành hóa đơn tuân theo chính sách xác nhận và phê duyệt của trung tâm. | P0 |
| FR-30 | Hệ thống cho phép ghi nhận các khoản thanh toán và theo dõi công nợ. | P0 |
| FR-31 | Hệ thống lưu lịch sử điều chỉnh hóa đơn và ngăn sửa trực tiếp hóa đơn đã phát hành nếu không thông qua quy trình điều chỉnh được ủy quyền. | P0 |

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
| FR-37 | Hệ thống tạo và hiển thị **thông báo trong ứng dụng** cho đúng người nhận khi thay đổi lịch học đã được xác nhận hoặc khi giao bài tập mới (P0); có thể bổ sung kênh gửi ngoài ứng dụng như email ở P1. | **P0 (in-app); P1 (kênh ngoài)** |
| FR-38 | Hệ thống tự động nhắc nhở trước deadline bài tập theo thời điểm được cấu hình. | P1 |
| FR-39 | Hệ thống lưu thông báo trong ứng dụng cùng trạng thái **chưa đọc/đã đọc** và chống tạo trùng cho cùng sự kiện (P0); theo dõi trạng thái gửi qua kênh ngoài và hỗ trợ retry khi gửi thất bại ở P1. | **P0 (in-app); P1 (gửi ngoài/retry)** |

**Ranh giới MVP của Notification:** P0 chỉ yêu cầu thông báo in-app khi **lịch đã thay đổi hợp lệ** hoặc **bài tập mới đã được giao**; chỉ người nhận thuộc tenant/phạm vi hợp lệ được xem. Lỗi tạo/hiển thị thông báo không được làm mất kết quả nghiệp vụ gốc đã hoàn tất. P0 không bắt buộc email, push notification hay nhắc deadline tự động; retry tác vụ tự động có tác động dữ liệu theo BR-12 vẫn áp dụng độc lập.

### 4.8. Reporting & System Administration
| ID | Functional Requirement | Priority |
|---|---|---|
| FR-40 | Hệ thống cung cấp **dashboard thống kê cơ bản** cho người có quyền: số lượng học sinh, số lớp học và công nợ học phí trong phạm vi tenant (P0); cung cấp báo cáo chi tiết tình trạng học tập, học phí, bộ lọc và phân tích mở rộng ở P1. | **P0 (dashboard cơ bản); P1 (báo cáo nâng cao)** |
| FR-41 | Hệ thống lưu nhật ký thay đổi cho các thao tác quan trọng như đổi lịch, sửa hóa đơn và thay đổi phân quyền. | P0 |
| FR-42 | Hệ thống hỗ trợ quản lý dữ liệu độc lập theo từng trung tâm, bảo đảm người dùng không truy cập dữ liệu của trung tâm khác. | P0* |
| FR-43 | Hệ thống cho phép cấu hình chính sách riêng cho từng trung tâm như học phí và quy định nghỉ học. | P1 |

**Ranh giới MVP của Reporting:** Dashboard P0 tổng hợp **số học sinh ghi danh ACTIVE (không đếm trùng), số lớp hoạt động và tổng khoản công nợ học phí chưa thu từ hóa đơn đã phát hành**, sau điều chỉnh/tín dụng đã phân bổ; phải thể hiện phạm vi/thời điểm dữ liệu, không gộp doanh thu với đã thu. Công thức chi tiết đã chốt tại Q-12 ở mục 7; báo cáo nâng cao vẫn thuộc P1.

### 4.9. Automation & Approval Workflow
| ID | Functional Requirement | Priority |
|---|---|---|
| **FR-44** | Hệ thống cho phép cấu hình chính sách phê duyệt theo **loại nghiệp vụ, điều kiện, ngưỡng rủi ro và permission**; một yêu cầu có thể được duyệt, từ chối hoặc trả về bổ sung thông tin. | **P1** |
| **FR-45** | Hệ thống tự động thực hiện nghiệp vụ **đủ điều kiện theo Business Rules đã cấu hình**; nếu không đủ điều kiện hoặc phát sinh ngoại lệ, hệ thống không tự chốt kết quả mà tạo yêu cầu xử lý/phê duyệt cho người có quyền, kèm lý do và nhật ký. | **P0 (phạm vi giới hạn)** |

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
| **NFR-15** | Workflow Reliability | Các tác vụ tự động cần tránh xử lý trùng gây phát sinh hóa đơn, ghi nhận thanh toán hoặc thay đổi lịch nhiều lần khi retry (idempotency đối với tác vụ có tác động). |
| **NFR-16** | Traceability | Mỗi quyết định tự động/phê duyệt quan trọng phải có dấu vết kiểm tra được: sự kiện khởi phát, bộ quy tắc/phiên bản chính sách, kết quả, người phê duyệt (nếu có) và thời điểm. |

> **Lưu ý:** Các mục tiêu về độ sẵn sàng, sao lưu và hiệu năng áp dụng khi triển khai chính thức. Chưa được xem là đã đáp ứng nếu chưa kiểm thử.

## 6. Business Rules — Bộ quy tắc nghiệp vụ chốt cho EduCore (Baseline v3)

**Trạng thái:** Được lựa chọn làm **baseline thiết kế và kiểm thử cho đồ án EduCore**. Đây là **các quyết định nghiệp vụ đề xuất**, được cụ thể hóa từ các câu hỏi BR-01 đến BR-14 ở phiên bản 2; **chưa phải chính sách đã được một trung tâm thực tế xác nhận**. Khi triển khai thương mại, trung tâm cần chấp thuận hoặc điều chỉnh các tham số ở mục 6.2 trước khi áp dụng. Giữ nguyên mã BR để truy vết đến FR, Use Case và Test Case.

### 6.1. Quy tắc nghiệp vụ đã xác định

| ID | Quy tắc đã chọn | Phạm vi triển khai |
|---|---|---|
| **BR-01 — Xung đột lịch** | Hai buổi `A`, `B` bị trùng khi `A.start < B.end` **và** `B.start < A.end`, đồng thời cùng sử dụng **ít nhất một** giáo viên, phòng học (nếu học trực tiếp) hoặc học sinh trong cùng tenant. Lịch bận đã xác nhận của giáo viên/học sinh cũng được tính là xung đột. Lịch `CANCELLED` không chiếm tài nguyên; hai buổi tiếp giáp tại thời điểm kết thúc/bắt đầu không bị coi là trùng. Không cho xác nhận lịch còn xung đột hoặc vượt sức chứa phòng/lớp. Kiểm tra lại tính khả dụng khi ghi dữ liệu để hạn chế đặt trùng đồng thời. | **P0** |
| **BR-02 — Điều kiện học bù** | Chỉ cho đăng ký học bù khi có **một buổi nghỉ có phép đã duyệt** và chưa dùng quyền học bù; buổi học thay thế phải cùng môn và trình độ tương đương, còn chỗ, không trùng lịch học sinh, nằm trong hạn học bù và nội dung tương đương (nếu không xác định được mức tương đương thì chuyển người có quyền duyệt). Buổi học bù phải liên kết với buổi nghỉ gốc; không làm thay đổi danh sách học sinh chính thức của lớp đích. | **P1** |
| **BR-03 — Số lần và thời hạn học bù** | **Một buổi nghỉ có phép tối đa một lượt học bù được sử dụng**, trong vòng **30 ngày** kể từ ngày học gốc. Được đổi lịch học bù trước khi diễn ra nếu còn hợp lệ; học bù đã tham dự hoặc vắng không phép thì đóng quyền học bù. Nếu trung tâm hủy buổi học bù, học sinh được sắp lại trong thời hạn còn lại; trường hợp hết hạn do phía trung tâm chuyển duyệt ngoại lệ. **Không được tính học phí hai lần** cho buổi gốc và buổi học bù thay thế. | **P1** |
| **BR-04 — Nghỉ học và số buổi tính phí** | Đơn nghỉ được gửi **ít nhất 24 giờ** trước giờ bắt đầu và được chấp thuận thì ghi nhận `EXCUSED`; nộp muộn chỉ được tính `EXCUSED` khi người có quyền duyệt ngoại lệ. Buổi `ATTENDED` và `UNEXCUSED` được tính **1 buổi tính phí**; buổi `EXCUSED` được tính **0**; buổi do trung tâm hủy được tính **0**. Nếu học bù cho buổi `EXCUSED` được thực hiện, chỉ buổi học bù được tính **1** (hoặc trừ 1 quyền học trong gói trả trước), buổi gốc vẫn là **0**. Vắng không phép tại buổi học bù đã giữ chỗ tính **1**; buổi học bù bị trung tâm hủy tính **0**. Không chốt bảng kê tự động nếu điểm danh chưa được xác nhận. | **P0** (nghỉ/điểm danh/tính phí); **P1** (học bù) |
| **BR-05 — Bảo lưu** | Bảo lưu có ngày bắt đầu, ngày kết thúc và phải được người có quyền phê duyệt. Trong khoảng bảo lưu, không tính buổi học phát sinh cho học sinh; số tiền đã đóng cho **các buổi chưa sử dụng** được giữ dưới dạng **số dư tín dụng học phí**, không tự động hoàn tiền. Khi quay lại, phải kiểm tra trình độ, lịch, sức chứa trước khi xếp lớp; tín dụng còn lại được khấu trừ vào học phí tương lai. Mọi hoàn/điều chỉnh tiền phải đi qua quy trình tài chính có kiểm soát, không sửa trực tiếp hóa đơn đã phát hành. | **P1** |
| **BR-06 — Giảm giá và thứ tự tính** | Học sinh được nhận ưu đãi anh/chị/em khi **quan hệ anh chị em được xác minh** và các em có ghi danh hợp lệ cùng tenant; ưu đãi combo chỉ áp dụng cho **gói đóng trước đủ 6 tháng**. Mặc định cho phép áp dụng đồng thời hai ưu đãi: **combo 5% trước, anh/chị/em 10% sau** trên số tiền còn lại. Không cộng trực tiếp thành 15% (tổng ưu đãi thực tế khi đủ hai điều kiện là **14,5%**). Không áp dụng cùng lúc ưu đãi khác nếu chưa có chính sách riêng; số tiền cuối cùng không âm, làm tròn đến đồng Việt Nam khi kết thúc phép tính. Chỉ áp dụng điều kiện và mức giá có hiệu lực tại thời điểm lập khoản tính phí, không tự tính lại hóa đơn đã phát hành. | **P0** (một loại ưu đãi); **P1** (kết hợp ưu đãi, cấu hình) |
| **BR-07 — Giáo viên dạy thay** | Giáo viên thay thế phải thuộc cùng tenant, đáp ứng môn/chuyên môn, cấp độ giảng dạy phù hợp, còn khả dụng trong toàn bộ buổi học và không vượt giới hạn phân công. Hệ thống **đề xuất**, giáo viên thay thế **xác nhận nhận lớp**, sau đó người có quyền **xác nhận phân công**. Chỉ khi đủ các điều kiện mới cập nhật lịch chính thức và gửi thông báo; nếu không có người phù hợp thì tạo ngoại lệ để đổi/hủy lịch, không tự phân công người không đạt điều kiện. | **P1** |
| **BR-08 — Thẩm quyền phê duyệt** | Việc duyệt dựa trên **permission + phạm vi tenant/lớp**, không dựa đơn thuần vào tên role. Mặc định: học bù/bảo lưu/dạy thay/ngoại lệ lịch thuộc `ACADEMIC_STAFF` hoặc `MANAGER` được cấp quyền tương ứng; phát hành/điều chỉnh hóa đơn thuộc `ACCOUNTANT` hoặc `MANAGER` được cấp quyền tài chính tương ứng. Phê duyệt ngoại lệ phải ghi **người duyệt, thời điểm, lý do và kết quả**. Vai trò chỉ có quyền xem không được duyệt. | **P0** (quyền mặc định); **P1** (quy trình duyệt nâng cao) |
| **BR-09 — Tự động hay chờ duyệt** | Chỉ xử lý tự động khi: người/sự kiện gọi hợp lệ; dữ liệu đầy đủ; cùng tenant; không vi phạm ràng buộc; nghiệp vụ nằm trong danh sách được tự động hóa; và không cần phê duyệt theo chính sách đang hiệu lực. Nếu **thiếu dữ liệu**, chuyển `NEEDS_INFORMATION`; nếu **hợp lệ nhưng cần duyệt/ngoại lệ**, chuyển `PENDING_APPROVAL`; nếu **xung đột hoặc vi phạm quy tắc cấm**, từ chối thao tác, không tự ghi kết quả. Giai đoạn P0 chỉ tự động kiểm tra xung đột, tính phí và tạo **hóa đơn dự thảo**, không mặc định tự phê duyệt hành động nhạy cảm. | **P0** (giới hạn); **P1** (mở rộng) |
| **BR-10 — Không có Giáo vụ/Kế toán riêng** | Mỗi tenant đang hoạt động phải có **ít nhất một tài khoản Manager hợp lệ**. Khi không có tài khoản Giáo vụ/Kế toán riêng, Manager có permission thích hợp đảm nhiệm công việc phê duyệt tương ứng. Không tự cấp quyền cho một người chỉ vì role nghiệp vụ vắng mặt; không cho truy cập vượt tenant hoặc phạm vi được giao. | **P0** |
| **BR-11 — Tự phê duyệt và tách nhiệm vụ** | Với yêu cầu thông thường, người tạo **có thể** tự duyệt nếu có permission và chính sách cho phép. **Điều chỉnh/hủy hóa đơn đã phát hành** luôn phải được xét duyệt thủ công, có lý do và audit log; ưu tiên **người duyệt khác người tạo** nếu có người đủ quyền. Đối với trung tâm chỉ có một Manager, cho phép Manager tự duyệt ngoại lệ tài chính để không khóa hoạt động, nhưng phải đánh dấu `SELF_APPROVED`, lưu lý do và lịch sử thay đổi; không bao giờ tự động duyệt loại này. | **P0** (kiểm soát thủ công); **P1** (cấu hình tách nhiệm vụ) |
| **BR-12 — Xử lý lỗi tác vụ** | Mỗi thao tác tự động có mã chống lặp (*idempotency key*) để retry không sinh thêm buổi học, hóa đơn hoặc thanh toán. Với lỗi tạm thời, thử lại tối đa **3 lần** có giãn cách; sau đó chuyển `FAILED` và thông báo người quản lý xử lý. Với thiếu dữ liệu, chuyển `NEEDS_INFORMATION`, không retry vô hạn. Với yêu cầu cần duyệt nhưng chưa có người thích hợp, giữ `PENDING_APPROVAL` và thông báo Manager; **không bỏ qua bước duyệt**. | **P0** cho tác vụ tác động dữ liệu |
| **BR-13 — Những quyết định không tự xác nhận mặc định** | Hệ thống **được tự tạo hóa đơn dự thảo**, nhưng **không tự phát hành hóa đơn** trong P0; người có quyền phải xác nhận phát hành. Hệ thống **không tự phân công giáo viên dạy thay** và **không tự chuyển lớp** theo mặc định; hai nghiệp vụ chỉ có hiệu lực sau khi được xác nhận đúng quyền và điều kiện. Ở P1, từng tenant **có thể** bật tự xác nhận các trường hợp rủi ro thấp khi thỏa chính sách BR-09/BR-14; điều chỉnh/hủy hóa đơn đã phát hành vẫn không được tự duyệt. | **P0** (giới hạn an toàn); **P1** (cấu hình tự động) |
| **BR-14 — Chính sách theo tenant và phiên bản** | Chính sách nghiệp vụ/giảm giá/tự động hóa thuộc **tenant** và có `policy_version`, thời điểm hiệu lực và người sửa. Khi một yêu cầu được tạo, hệ thống gắn **phiên bản chính sách đã dùng**; xử lý lại/retry không âm thầm đổi phiên bản. Chính sách mới áp dụng cho yêu cầu tạo sau ngày hiệu lực, **không áp dụng hồi tố** cho hóa đơn đã phát hành; nếu muốn thay đổi kết quả cũ phải tạo nghiệp vụ điều chỉnh được ủy quyền. **Quyền truy cập luôn kiểm tra theo quyền hiện hành tại thời điểm thực thi**, kể cả khi yêu cầu từng được tạo hợp lệ. | **P0** (tenant isolation, audit); **P1** (quản trị phiên bản chính sách) |

### 6.2. Các tham số chính sách mặc định đề xuất

Các giá trị dưới đây được **chọn để thống nhất thiết kế và viết test**, **không phải dữ liệu khảo sát từ trung tâm**. Trong MVP có thể lưu dưới dạng cấu hình cố định của tenant thử nghiệm; đến P1 cần hỗ trợ cấu hình theo FR-43/FR-44 mà vẫn lưu phiên bản chính sách theo BR-14.

| Tham số | Giá trị baseline | BR liên quan |
|---|---|---|
| `absence_notice_hours` | **24 giờ** trước buổi học; trường hợp khẩn cấp chuyển duyệt thủ công | BR-04 |
| `makeup_valid_days` | **30 ngày** tính từ ngày buổi nghỉ gốc | BR-03 |
| `makeup_max_used_per_absence` | **1 lượt** trên mỗi buổi nghỉ có phép | BR-03 |
| `sibling_discount_rate` | **10%** sau khi xác minh quan hệ anh/chị/em | BR-06 |
| `six_month_prepaid_discount_rate` | **5%** cho gói trả trước đủ 6 tháng | BR-06 |
| `discount_application_order` | Combo **trước**, anh/chị/em **sau** | BR-06 |
| `auto_retry_max_attempts` | **3 lần thử lại** cho lỗi tạm thời, cùng idempotency key | BR-12 |
| `invoice_auto_issue` | **false** ở MVP: chỉ tự tạo dự thảo | BR-13 |
| `teacher_substitution_auto_confirm` | **false** mặc định | BR-07, BR-13 |
| `student_transfer_auto_confirm` | **false** mặc định | BR-13 |

**Phân biệt khoản thu:** `hóa đơn` trong phạm vi EduCore là **chứng từ/bảng kê học phí nội bộ**, không mặc nhiên là **hóa đơn điện tử hợp pháp**. Phát hành hóa đơn điện tử theo quy định thuế hoặc hoàn tiền qua cổng thanh toán cần được đặc tả thành chức năng riêng nếu đưa vào phạm vi sau này.

### 6.3. Ví dụ kiểm chứng tính nhất quán

1. **Xếp lịch (BR-01):** Giáo viên A dạy 18:00–19:30 thì lịch 19:30–21:00 **không** xung đột; lịch 19:00–20:30 **có** xung đột. Hai yêu cầu đặt cùng phòng đồng thời phải có cơ chế ngăn cả hai cùng được xác nhận.
2. **Nghỉ có phép và học bù (BR-02 đến BR-04):** Học sinh xin nghỉ trước 24 giờ và được duyệt: buổi gốc tính **0**. Nếu tham gia 1 buổi học bù hợp lệ: buổi học bù tính **1**, **không** tính lại buổi gốc. Nếu không tham gia học bù: không phát sinh khoản thu cho buổi nghỉ có phép theo baseline này.
3. **Nghỉ không phép (BR-04):** Học sinh vắng nhưng không được xác nhận nghỉ có phép: buổi gốc vẫn tính **1**; không tự sinh quyền học bù.
4. **Giảm giá (BR-06):** Học phí trước giảm là **1.000.000 VND**, đủ điều kiện cả combo và anh/chị/em: sau combo 5% còn **950.000**, sau anh/chị/em 10% còn **855.000 VND**.
5. **Duyệt hóa đơn (BR-11, BR-13):** Hệ thống tính được dự thảo, nhưng chưa tự phát hành. Sau khi hóa đơn phát hành, sửa số tiền không được cập nhật trực tiếp vào hóa đơn gốc mà phải tạo bản điều chỉnh có người duyệt và nhật ký.
6. **Chính sách thay đổi (BR-14):** Một yêu cầu được tạo theo `policy_version = 3` vẫn được tính theo bản 3 nếu retry; nhưng người duyệt phải còn permission hợp lệ ở thời điểm duyệt.

### 6.4. Ánh xạ về yêu cầu hệ thống

| Nhóm Business Rules | Các FR liên quan chính |
|---|---|
| BR-01 | FR-11, FR-12, FR-13, FR-14, FR-16 |
| BR-02, BR-03 | FR-18, FR-19, FR-20, FR-21 |
| BR-04, BR-05, BR-06 | FR-18, FR-19, FR-22, FR-23, FR-25 đến FR-31 |
| BR-07 | FR-09, FR-13, FR-24 |
| BR-08 đến BR-11 | FR-03, FR-04, FR-05, FR-41, FR-44, FR-45 |
| BR-12 | FR-39, FR-41, FR-45; NFR-15, NFR-16 |
| BR-13 | FR-10, FR-24, FR-29, FR-31, FR-44, FR-45 |
| BR-14 | FR-42, FR-43, FR-44; NFR-16 |

### 6.5. Quy trình Automation-first & Human-in-the-loop

```mermaid
flowchart TD
    A["Yêu cầu người dùng / Sự kiện theo lịch"] --> B{"Hợp lệ về quyền và phạm vi tenant?"}
    B -- "Không" --> X["Từ chối truy cập"]
    B -- "Có" --> C{"Dữ liệu đầy đủ và hợp lệ?"}
    C -- "Không" --> N["Yêu cầu bổ sung thông tin"]
    C -- "Có" --> D{"Đủ điều kiện tự động xử lý?"}
    D -- "Có" --> E["Thực hiện thao tác tự động được phép"]
    D -- "Không - cần duyệt" --> F["Tạo yêu cầu ngoại lệ / phê duyệt"]
    D -- "Không - vi phạm quy tắc cấm" --> X
    F --> G["Người có quyền xem xét"]
    G --> H{"Phê duyệt?"}
    H -- "Có" --> I["Kiểm tra lại quyền và điều kiện, rồi thực hiện"]
    H -- "Không" --> J["Từ chối / Yêu cầu bổ sung thông tin"]
    X --> K["Lưu kết quả và nhật ký"]
    N --> K
    E --> K
    I --> K
    J --> K
    K --> L["Thông báo cho người dùng liên quan khi cần"]
```

**Trạng thái workflow dùng ở baseline:** `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `NEEDS_INFORMATION`, `COMPLETED`, `FAILED`. `SELF_APPROVED` là **cờ kiểm toán** đối với quyết định tự duyệt, **không phải trạng thái workflow**. Luồng chuyển trạng thái chi tiết của từng nghiệp vụ được xây dựng ở Detailed Design.

**Quy tắc thay đổi sau khi chốt:** Nếu thay đổi hạn xin nghỉ, thời hạn học bù, công thức giảm giá, người có quyền phê duyệt hoặc mức tự động hóa, phải tăng phiên bản tài liệu, cập nhật Business Rules liên quan và đối chiếu lại FR/Use Cases/Test Cases. Không tự ý thay đổi các giả định trên khi lập trình.

## 7. Quyết định chi tiết đã chốt từ Q-01 đến Q-15

Các quyết định dưới đây được **người xây dựng EduCore chấp thuận ngày 11/10/2026** làm baseline phân tích/thiết kế của đồ án. Đây không phải chính sách đã khảo sát hoặc được một trung tâm thương mại xác nhận. Tại P0, chỉ triển khai phạm vi gắn nhãn P0; các chức năng P1 không được tự đưa vào MVP. Các giá trị có tính chính sách phải được quản lý theo tenant và phiên bản khi triển khai phần cấu hình P1 (BR-14). Nếu có xung đột, yêu cầu an toàn trong BR-01–BR-14 tiếp tục bắt buộc; quyết định chi tiết này làm rõ chứ không cho phép bỏ qua quy tắc cấm.

### Q-01 — Đăng nhập, phiên và khôi phục bằng OTP email (P0)
- Đăng nhập bằng **email + mật khẩu**; một tài khoản có thể được gán nhiều tenant/role; sau xác thực chọn tenant được phép. Mật khẩu tối thiểu **12 ký tự**, lưu băm bằng **Argon2id**. Giới hạn thử sai đăng nhập/OTP và tránh tiết lộ email có tài khoản hay không qua thông báo khôi phục.
- Dùng **OTP gửi qua email** để khôi phục mật khẩu, **không dùng link khôi phục**. OTP do Backend tạo và xác minh, chỉ sử dụng **một lần**, hết hạn sau **15 phút**; chỉ lưu dạng băm/giá trị đã được bảo vệ, không ghi mã vào audit/log. Email chỉ là kênh chuyển mã; không giao xác thực cho Gmail.
- Access token có hạn **15 phút**; refresh token tối đa **7 ngày**, có khả năng thu hồi và được bảo vệ khi lưu/truyền. Đăng xuất thu hồi phiên hiện tại; đổi/khôi phục mật khẩu thu hồi các phiên cũ. P0 **không bắt buộc OAuth/Google Sign-In, SMS hay SSO**.

### Q-02 — Thẩm quyền, liên kết phụ huynh và yêu cầu học vụ (P0/P1)
- Manager/Academic Staff được cấp permission có thể **tạo, xác minh, thu hồi** liên kết Parent–Student; chỉ kích hoạt sau khi đối chiếu căn cứ quan hệ; mã mời nội bộ (nếu dùng) không thay thế xác minh. Student/Parent được **gửi đơn nghỉ P0** và **gửi yêu cầu học bù/bảo lưu P1** cho chính mình/con đã liên kết; gửi yêu cầu không đồng nghĩa được duyệt.
- Người có quyền học vụ phê duyệt nghỉ/học bù/bảo lưu; nghỉ muộn cần **permission duyệt ngoại lệ**. Người có permission tài chính xác minh ưu đãi anh/chị/em và phát hành/điều chỉnh học phí. Xác minh quan hệ anh/chị/em là quy trình độc lập với liên kết phụ huynh; không dựa chỉ vào trùng họ tên/số điện thoại. Mọi quyền đều kiểm tra ở Backend theo tenant/phạm vi (BR-08, BR-10).

### Q-03 — Trạng thái ghi danh và chuyển lớp (P0)
- Tách trạng thái hồ sơ học sinh khỏi **trạng thái ghi danh theo lớp**: `PENDING`, `ACTIVE`, `SUSPENDED`, `COMPLETED`, `WITHDRAWN`, `TRANSFERRED` (trạng thái ghi danh lớp cũ).
- Ghi danh/chuyển lớp kiểm tra tenant, trình độ, chỗ, lịch và thẩm quyền. Chuyển lớp phải có xác nhận của người có permission; mặc định hiệu lực từ **buổi tương lai tiếp theo chưa diễn ra** hoặc một ngày/buổi tương lai được chỉ định. Giữ nguyên lịch sử buổi đã học.
- Chênh lệch học phí được ghi nhận để xử lý qua tín dụng/điều chỉnh có quyền; **không sửa trực tiếp hóa đơn đã phát hành**. P0 xác nhận/chuyển lớp và xử lý tài chính thủ công khi cần; P1 hỗ trợ đề xuất/phân bổ tín dụng tự động.

### Q-04 — Lịch lặp, múi giờ và hạn học bù (P0/P1)
- Lịch lặp hằng tuần trong khoảng có ngày đầu/cuối, **tối đa 6 tháng cho một lần tạo**. Xác nhận chuỗi theo **all-or-nothing**: có bất cứ buổi nào vi phạm thì chưa xác nhận buổi nào trong cả chuỗi; có thể sửa/loại buổi không hợp lệ rồi thử lại. Đổi/hủy được một buổi hoặc những buổi **tương lai** trong chuỗi, không sửa lịch sử.
- Múi giờ mặc định của tenant tại Việt Nam: `Asia/Ho_Chi_Minh`; lưu thời điểm UTC và timezone tenant. Xung đột dùng khoảng `[start, end)` theo BR-01. Hạn 30 ngày học bù tính từ **ngày buổi gốc**, buổi học bù phải bắt đầu không muộn hơn cuối ngày thứ 30 theo giờ địa phương tenant.

### Q-05 — Điểm danh, khóa và nghỉ tại buổi học bù (P0/P1)
- Teacher phụ trách ghi/duyệt điểm danh trong buổi hoặc sau khi kết thúc; khóa chỉnh sửa thông thường sau **48 giờ kể từ giờ kết thúc** hoặc **ngay khi dữ liệu đã được dùng phát hành hóa đơn**, tùy mốc nào đến trước. Chưa xác nhận thì không chốt dự thảo tính phí tự động. Manager/Academic Staff có permission xử lý bản chưa được xác nhận quá hạn.
- Sau khóa, chỉ permission điều chỉnh điểm danh mới được sửa, phải ghi lý do/audit; thay đổi ảnh hưởng hóa đơn đã phát hành đi qua UC-26. Nếu đã được duyệt nghỉ mà học sinh thực tế dự học, trạng thái cuối là `ATTENDED`, tính 1 buổi và không có quyền học bù.
- P1: nghỉ có phép tại chính buổi học bù cho phép **đổi lịch** nếu còn hạn từ buổi gốc và quyền chưa bị sử dụng/đóng; không tự gia hạn 30 ngày. Vắng không phép tại buổi học bù đã giữ chỗ thì tính 1 và đóng quyền; trung tâm hủy thì tính 0, hết hạn do trung tâm chuyển duyệt ngoại lệ.

### Q-06 — Tín dụng học phí khi bảo lưu (P1)
- Tín dụng bảo lưu = **phần tiền thực tế đã thu được phân bổ cho các buổi chưa sử dụng** sau ưu đãi đã áp dụng hợp lệ; ưu tiên phân bổ phần tiền đã thu cho buổi đã sử dụng, **không tạo tín dụng từ công nợ chưa thu**. Không áp dụng hồi tố ưu đãi/hóa đơn cũ.
- Với học phí mới: tính đơn giá và ưu đãi hợp lệ **trước**, rồi mới khấu trừ tín dụng (số còn phải trả không âm). Tín dụng gắn học sinh/tenant, không tự chuyển cho người khác, mặc định **không tự hết hạn**, chỉ dùng học phí tương lai, không tự hoàn tiền.
- Không chấp nhận hai khoảng bảo lưu chồng lấn; thay đổi khoảng phải duyệt lại. Quay lại trước hạn cần xác nhận của người có quyền, kiểm tra trình độ/lịch/sức chứa và cập nhật trạng thái bảo lưu trước khi sắp lớp.

### Q-07 — Tương đương học bù và giáo viên dạy thay (P1)
- Giới hạn phân công baseline: **tối đa 8 giờ dạy/ngày và 40 giờ dạy/tuần** trên lịch đã xác nhận trong tenant; có thể cấu hình theo tenant về sau. Buổi học bù phải cùng môn, trình độ và **nội dung/bài học tương đương**; nếu không xác định được thì chuyển người có quyền xử lý.
- Dạy thay: hệ thống chỉ **đề xuất** người cùng tenant, đúng chuyên môn/cấp độ, không xung đột, không quá giới hạn; **Teacher nhận lớp trước, người có permission xác nhận phân công sau**, rồi mới đổi lịch và thông báo. Mặc định **không bật tự xác nhận dạy thay cả ở P1 baseline** để giữ BR-07; BR-13 chỉ mở khả năng thiết kế chính sách tương lai sau khi sửa/duyệt rõ ranh giới tương ứng.

### Q-08 — Đơn giá, kỳ và làm tròn học phí (P0/P1)
- Khi có nhiều giá cùng hiệu lực, ưu tiên **buổi học → lớp học → khóa học**. P0 tính theo các buổi thực tế đủ điều kiện/đã xác nhận trong **kỳ tháng**; lập dự thảo **đầu tháng sau** khi dữ liệu tháng trước đầy đủ và phát hành thủ công. Hạn thanh toán baseline **7 ngày sau phát hành**.
- Chỉ làm tròn **một lần ở cuối phép tính** đến đồng Việt Nam theo `ROUND_HALF_UP`; không làm tròn tiền ưu đãi ở từng bước trung gian. Gói trả trước đủ 6 tháng và hạch toán phân bổ theo buổi thuộc P1; quyền hưởng combo chỉ được chốt sau khi đã đóng đủ gói, không tự tính lại hóa đơn phát hành.

### Q-09 — Ưu đãi P0 và phối hợp ưu đãi P1
- **P0 chỉ áp dụng ưu đãi anh/chị/em 10%** sau xác minh quan hệ và ghi danh hợp lệ cùng tenant. Nếu cũng đáp ứng combo thì P0 vẫn chỉ áp dụng 10%, không tự cộng thêm ưu đãi chưa triển khai.
- **P1:** combo trả trước đủ 6 tháng **5% trước**, sau đó anh/chị/em **10% trên phần còn lại**; đủ hai điều kiện cho mức giảm hiệu dụng **14,5%**. Ưu đãi khác hoặc cộng dồn khác chỉ áp dụng khi có chính sách được duyệt/phiên bản rõ ràng (BR-06).

### Q-10 — Thanh toán và điều chỉnh (P0/P1)
- P0 **chỉ ghi nhận thủ công** tiền mặt hoặc chuyển khoản do nhân sự đối soát bên ngoài hệ thống; cho phép thanh toán một phần, mỗi khoản gắn **một hóa đơn**, có chống ghi trùng. **Không kết nối ngân hàng/cổng thanh toán**, không tự xác minh chuyển khoản. Nếu số tiền nhập vượt công nợ còn lại thì từ chối phần vượt ở P0.
- Khoản thu ghi sai phải đảo/điều chỉnh bằng bản ghi mới có thẩm quyền/lý do/audit, không xóa lịch sử. Hóa đơn đã thu bị giảm/hủy: phần tiền thu vượt chờ xử lý tín dụng/điều chỉnh đã được phê duyệt, không tự hoàn tiền. P1 mới hỗ trợ phân bổ một khoản cho nhiều hóa đơn, tự ghi tín dụng khi trả thừa hoặc tích hợp đối soát theo phạm vi dự án sau.

### Q-11 — Bài tập và chấm điểm (P0)
- Priority stars từ **1 đến 5**; thang điểm **0–10**, chính xác **1 chữ số thập phân**. Tệp nộp: PDF, DOCX, JPG, PNG; tối đa **10 MB/tệp**, **5 tệp/lần nộp**. P0 lưu tệp bằng hạ tầng lưu trữ **do EduCore tự quản lý**, không bắt buộc Google Drive/S3.
- Nộp muộn tối đa **7 ngày** sau deadline, đánh dấu `LATE`; được nộp lại **trước khi chấm/công bố điểm** và khi vẫn còn trong hạn nhận bài, lưu phiên bản cũ. Giáo viên chấm phiên bản hợp lệ mới nhất.
- Khi đã có bài nộp, không âm thầm thay đổi yêu cầu hoặc rút ngắn deadline; chỉ có thể gia hạn có dấu vết. Kết quả chỉ hiện cho Student/Parent sau khi giáo viên **chủ động công bố**. Sửa điểm đã công bố phải có lý do và audit.

### Q-12 — Thống kê, tiến độ và quyền xem (P0/P1)
- **Dashboard P0:** đếm học sinh có ít nhất một ghi danh `ACTIVE` trong tenant (đếm duy nhất học sinh); đếm lớp đang hoạt động; công nợ = **tổng số còn phải thu chưa thanh toán của hóa đơn nội bộ đã phát hành**, sau các điều chỉnh/tín dụng đã phân bổ hợp lệ. Không trộn với hóa đơn dự thảo hoặc tiền trả trước chưa sử dụng; gắn thời điểm và phạm vi số liệu.
- **Tiến độ P1:** tỷ lệ chuyên cần = `ATTENDED / (ATTENDED + UNEXCUSED) × 100%` (loại buổi `EXCUSED`/trung tâm hủy, không đếm lại buổi gốc học bù); tỷ lệ hoàn thành bài tập = số bài đã nộp hợp lệ / tổng bài đến hạn (không tính bài đã hủy); điểm trung bình là trung bình bài **đã chấm và công bố**, không coi bài chưa chấm là 0. Mẫu số = 0 → `N/A` thay vì tự coi 0%.
- **Báo cáo P1:** phân biệt doanh thu học phí ghi nhận theo buổi/dịch vụ đã cung cấp; giá trị hóa đơn phát hành sau điều chỉnh; **đã thu** ròng khoản thu hợp lệ sau đảo/hoàn; **phải thu** là phần chưa thanh toán; **công nợ quá hạn** là phần phải thu quá hạn thanh toán. Không đồng nhất tiền trả trước với doanh thu đã thực hiện.
- Parent chỉ xem lịch, chuyên cần, bài tập, **điểm đã công bố**, tiến độ và học phí **của học sinh đã liên kết**; không xem học sinh khác hoặc sổ tài chính nội bộ trung tâm.

### Q-13 — Thông báo và retry tác vụ (P0/P1)
- **P0:** chỉ thông báo **in-app** khi lịch đã được đổi/hủy hợp lệ hoặc bài tập mới giao thành công; lưu trạng thái chưa đọc/đã đọc, chống trùng theo `(sự kiện, người nhận)`. Lỗi tạo thông báo không đảo ngược sự kiện gốc; Manager có danh sách tác vụ `FAILED` hoặc `PENDING_APPROVAL` cần xử lý trong ứng dụng.
- **P1:** nhắc deadline **24 giờ và 1 giờ trước hạn**; email ngoài ứng dụng có thể bổ sung nhưng **không thuộc P0**. Lỗi gửi tạm thời/tác vụ có retry: **tối đa 3 lần thử lại** sau lần đầu, giãn cách **1, 5, 15 phút** và giữ cùng idempotency key/policy_version. Hết lượt -> `FAILED`; người có permission mới được chạy lại sau kiểm tra, vẫn chống trùng tác động dữ liệu. Thiếu dữ liệu -> `NEEDS_INFORMATION`, không retry vô hạn.

### Q-14 — Nhật ký và quyền kiểm tra (P0/P1)
- P0 ghi audit **và có màn hình tra cứu cơ bản** với bộ lọc đối tượng, người thực hiện, khoảng thời gian, kết quả. Mặc định Manager chỉ thấy log tenant của mình; người có quyền học vụ/tài chính chỉ xem log đúng phạm vi được giao. Log quan trọng có actor, thời điểm, sự kiện, thay đổi, lý do, kết quả và policy_version khi có.
- Baseline lưu nhật ký **24 tháng**, không cho sửa/xóa lịch sử qua giao diện; tránh ghi mật khẩu, OTP và dữ liệu nhạy cảm không cần thiết. Thời hạn lưu cần rà soát theo pháp luật/chính sách sản phẩm khi thương mại hóa. Xuất/điều tra audit nâng cao thuộc P1.

### Q-15 — P0* và vòng đời tenant
- **FR-42 `P0*` nghĩa là tenant isolation bắt buộc từ P0**; dấu `*` chỉ phạm vi: công cụ quản trị vòng đời tenant nâng cao chưa nằm trong MVP, không phải ngoại lệ bảo mật.
- P0: bên vận hành khởi tạo tenant và bật/tạm khóa bằng thao tác vận hành có kiểm soát, không cần trang quản trị SaaS đầy đủ; mỗi tenant `ACTIVE` phải có ít nhất một Manager hợp lệ. P1: quản lý tenant qua giao diện với trạng thái `CREATED`, `ACTIVE`, `SUSPENDED`, `ARCHIVED` và chính sách/gói dịch vụ nếu được đặc tả.
- System Administrator **không tự có quyền xem/sửa dữ liệu cá nhân, học tập và tài chính** của mọi tenant; hỗ trợ kỹ thuật đặc biệt (nếu có về sau) phải được ủy quyền có phạm vi, thời hạn và audit.

## 8. Ranh giới tích hợp P0 — Internal-first

1. **P0 xử lý toàn bộ nghiệp vụ cốt lõi nội bộ EduCore**, gồm quản lý học vụ/lịch/điểm danh, ghi nhận thanh toán thủ công, học phí, nộp bài bằng vùng lưu trữ do hệ thống quản lý, dashboard tổng hợp từ DB, thông báo in-app, audit và workflow. Không phụ thuộc API nghiệp vụ hệ thống ngoài để vận hành các chức năng này.
2. **Ngoại lệ duy nhất được phép ở P0:** kết nối máy chủ/dịch vụ gửi **OTP qua email** cho khôi phục/xác minh tài khoản. Email đích có thể là Gmail hoặc hộp thư khác; **không cần Gmail API**, có thể dùng SMTP hoặc nhà cung cấp chuyển phát email. Backend EduCore tự tạo/kiểm tra OTP.
3. **Không thuộc P0:** cổng thanh toán/ngân hàng tự động, Google Sign-In/OAuth bên thứ ba, Google Calendar, gửi email thông báo nghiệp vụ, SMS, Zalo, web push qua FCM, Google Drive/S3 bắt buộc, AI API bên ngoài hay đồng bộ dữ liệu hệ thống khác. Các phương án tích hợp ở P1/P2 chỉ được triển khai khi có đặc tả và được duyệt phạm vi.
4. Web hosting, HTTPS, sao lưu và DB là **hạ tầng vận hành**, không được hiểu là API nghiệp vụ bên ngoài; tuy nhiên các dịch vụ hạ tầng được lựa chọn không làm phát sinh yêu cầu tích hợp nghiệp vụ P0. Triển khai production vẫn phải đáp ứng NFR đã đặt ra.

## 9. Quản lý thay đổi và truy vết quyết định

| Quyết định | FR chính | UC liên quan | BR cần giữ |
|---|---|---|---|
| Q-01, Q-02 | FR-01–FR-06 | UC-01–UC-06, UC-16–UC-18 | BR-08, BR-10, BR-14 |
| Q-03–Q-05 | FR-09–FR-19 | UC-09–UC-17 | BR-01–BR-04, BR-07–BR-09 |
| Q-06–Q-10 | FR-20–FR-31 | UC-17–UC-26 | BR-03–BR-14 |
| Q-11–Q-13 | FR-32–FR-40, FR-45 | UC-27–UC-32, UC-37 | BR-08, BR-12, BR-14 |
| Q-14–Q-15 | FR-41–FR-42 | UC-35–UC-36 | BR-08, BR-10, BR-14 |
| Internal-first | FR-01, FR-30, FR-34, FR-37–FR-40 | UC-03, UC-25, UC-28, UC-31–UC-32 | BR-12, BR-14 |

Không tự thay đổi các baseline/giới hạn này trong lúc lập trình; nếu thay đổi phải cập nhật tài liệu Requirements Analysis trước, sau đó Use Case Specifications và test cases liên quan.