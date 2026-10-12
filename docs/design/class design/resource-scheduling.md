# EduCore — Class Design: Resource & Scheduling

**Trạng thái:** Proposed for review · **Version:** 1.0 · **Ngày:** 12/10/2026 · **Phạm vi:** P0 + P1 (đã thể hiện theo lớp).

**Nguồn:** `requirements_analysis(7).md`, `specification(1).md`, `architectural_design(1).md`, `database_design.md` (Database Design v1.0 vẫn *proposed*). Truy vết: **FR-11–FR-17**, **UC-11–UC-14**, **BR-01, BR-12**.

> **Quy tắc đọc:** thông số BR/Q, hành vi UC và quyết định ADR là baseline từ nguồn; **tên class, chữ ký TypeScript, cách tách service/port, trạng thái kỹ thuật mới** trong file này là đề xuất Detailed Design, chưa phải source code hay Prisma schema đã kiểm chứng. Danh sách thuộc tính là lớp nghiệp vụ (không nhất thiết khớp 1:1 toàn bộ cột DB). Không tự coi tính năng P1 thành P0.

## 1. Ranh giới module và phạm vi

Quản lý phòng, lịch bận, chuỗi tuần và từng buổi học; chống xung đột giáo viên/phòng/học sinh kể cả thao tác đồng thời.

**Phụ thuộc ngoài module (qua public port/application contract):**
- Academic Management (class/teacher/enrollment).
- Identity & Access (quyền xếp lịch).
- Notification (event sau đổi/hủy hợp lệ).
- Attendance & Leave (buổi đã hoàn tất không sửa lịch sử).

**Hợp đồng công khai được đề xuất:**
- `ScheduleQueryPort.getSessions(scope,range): SessionSummary[]`.
- `AvailabilityPort.assertResourcesFree(bookingDrafts): void`.
- `SchedulingCommandPort.confirmSession/confirmSeries/reschedule/cancel(command): Result`.

## 2. Class Diagram (logic UML)

```mermaid
classDiagram
    class ScheduleSeries
    class ClassSession
    class SessionParticipant
    class SchedulableResource
    class ResourceBooking
    class ConflictDetector
    class SchedulingService
    ScheduleSeries "1" --> "0..*" ClassSession
    ClassSession "1" --> "0..*" SessionParticipant
    SchedulableResource "1" --> "0..*" ResourceBooking
    ResourceBooking --> ClassSession : sessionId optional
    SchedulingService ..> ConflictDetector
    SchedulingService ..> ClassSession
```

> ERD/bảng DB là nơi định nghĩa FK/constraint; UML ở đây mô tả quan hệ domain và dependency application. Class Diagram có thể lược bớt lớp hỗ trợ để dễ đọc; toàn bộ class chính được đặc tả tại §3.

## 3. Class Specifications

| Class | Vai trò | Phạm vi | Bảng/nguồn dữ liệu |
|---|---|---|---|
| `Room` | Domain entity | P0 | `rooms` |
| `SchedulableResource` | Domain entity | P0 | `schedulable_resources` |
| `ResourceUnavailability` | Domain entity | P0 | `resource_unavailability` |
| `ScheduleSeries` | Domain entity | P0 | `schedule_series` |
| `ClassSession` | Domain entity | P0 | `class_sessions` |
| `SessionParticipant` | Domain entity | P0; P1 MAKEUP | `session_participants` |
| `ResourceBooking` | Domain entity | P0 | `resource_bookings` |
| `ConflictDetector` | Domain service | P0 | `resource_bookings, sessions, unavailability` |
| `SchedulingService` | Application service | P0; P1 suggestions | `class_sessions, schedule_series, resource_bookings` |

### 3.1. `Room`

**Loại:** Domain entity · **Ưu tiên:** P0 · **Nguồn dữ liệu:** `rooms`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `id: UUID` | phòng |
| `capacity: number` | sức chứa >0 |
| `active: boolean` | khả dụng |
| `location?: string` | nơi học |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `assertCanHost(participantCount): void` | room.capacity |
| `deactivate(): void` | không xóa booking lịch sử |

### 3.2. `SchedulableResource`

**Loại:** Domain entity · **Ưu tiên:** P0 · **Nguồn dữ liệu:** `schedulable_resources`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `id: UUID` | registry tài nguyên |
| `kind: ResourceKind` | TEACHER/STUDENT/ROOM |
| `referenceId: UUID` | trỏ đúng đối tượng cùng tenant |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `assertBelongsToTenant(tenantId): void` | composite FK |
| `getLockKey(): string` | thứ tự khóa nhất quán |

### 3.3. `ResourceUnavailability`

**Loại:** Domain entity · **Ưu tiên:** P0 · **Nguồn dữ liệu:** `resource_unavailability`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `resourceId: UUID` | tài nguyên bận |
| `startAt: Date` | UTC |
| `endAt: Date` | UTC |
| `status: AvailabilityStatus` | DRAFT/CONFIRMED/CANCELLED |
| `reason: string` | lý do |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `confirm(): void` | tạo booking blocking |
| `cancel(): void` | release booking |

### 3.4. `ScheduleSeries`

**Loại:** Domain entity · **Ưu tiên:** P0 · **Nguồn dữ liệu:** `schedule_series`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `classId: UUID` | lớp |
| `weekday: number` | 1..7 |
| `localStartTime: TimeOnly` | giờ local |
| `durationMinutes: number` | >0 |
| `validFrom: DateOnly` | hiệu lực |
| `validTo: DateOnly` | ≤6 tháng |
| `timezone: string` | tz của tenant |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `expand(): SessionDraft[]` | tính UTC xử lý timezone/DST |
| `validateSixMonths(): void` | giới hạn tạo chuỗi |

### 3.5. `ClassSession`

**Loại:** Domain entity · **Ưu tiên:** P0 · **Nguồn dữ liệu:** `class_sessions`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `id: UUID` | buổi |
| `classId: UUID` | lớp |
| `teacherId: UUID` | snapshot giáo viên |
| `roomId?: UUID` | ONSITE bắt buộc |
| `startAt: Date` | UTC |
| `endAt: Date` | UTC |
| `status: SessionStatus` | DRAFT/CONFIRMED/COMPLETED/CANCELLED |
| `revision: number` | optimistic check |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `confirm(): void` | chỉ nếu đủ nguồn + no conflict |
| `reschedule(start,end): void` | chỉ buổi/đoạn tương lai |
| `cancel(reason): void` | không giữ resource |
| `complete(): void` | khóa lịch sử |

### 3.6. `SessionParticipant`

**Loại:** Domain entity · **Ưu tiên:** P0; P1 MAKEUP · **Nguồn dữ liệu:** `session_participants`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `sessionId: UUID` | buổi |
| `studentId: UUID` | người dự học |
| `enrollmentId?: UUID` | snapshot regular |
| `kind: ParticipationKind` | REGULAR/MAKEUP |
| `removedAt?: Date` | rời danh sách |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `isActive(): boolean` | hiện diện tại buổi |
| `assertRegularEnrolled(at): void` | xác minh enrollment |

### 3.7. `ResourceBooking`

**Loại:** Domain entity · **Ưu tiên:** P0 · **Nguồn dữ liệu:** `resource_bookings`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `resourceId: UUID` | resource |
| `sessionId?: UUID` | buổi chiếm |
| `unavailabilityId?: UUID` | lịch bận |
| `startAt: Date` | UTC |
| `endAt: Date` | UTC |
| `status: BookingStatus` | ACTIVE/RELEASED |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `overlaps(other): boolean` | [start,end) so sánh |
| `release(): void` | khi hủy/đổi |

### 3.8. `ConflictDetector`

**Loại:** Domain service · **Ưu tiên:** P0 · **Nguồn dữ liệu:** `resource_bookings, sessions, unavailability`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `bookingReader: ResourceBookingRepository` | overlap |
| `capacityReader: CapacityPort` | phòng + lớp |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `detect(drafts): Conflict[]` | giáo viên/phòng/học sinh + lịch bận |
| `assertNoConflict(drafts): void` | reject nếu conflict |
| `assertCapacity(drafts): void` | cả lớp và phòng |

### 3.9. `SchedulingService`

**Loại:** Application service · **Ưu tiên:** P0; P1 suggestions · **Nguồn dữ liệu:** `class_sessions, schedule_series, resource_bookings`.

**Attributes / dependencies**

| Thuộc tính (đề xuất TypeScript) | Ý nghĩa |
|---|---|
| `conflicts: ConflictDetector` | quy tắc xung đột |
| `tx: TransactionCoordinator` | khóa resources ổn định |

**Operations**

| Method/contract (đề xuất) | Trách nhiệm / kiểm soát |
|---|---|
| `confirmSeries(command): Session[]` | all-or-nothing ≤6 tháng |
| `confirmSession(command): ClassSession` | một buổi |
| `reschedule(command): void` | đổi một buổi/tương lai + outbox |
| `cancelSession(command): void` | release bookings + outbox |
| `suggestSlots(query): SlotSuggestion[]` | P1, không tự xác nhận |

## 4. Luồng phối hợp ứng dụng / transaction boundary

`SchedulingService.confirmSeries()` expand ≤6 tháng → lấy Student/Teacher/Room tại từng buổi → mở DB transaction, khóa resource IDs theo thứ tự ổn định → re-read xung đột và sức chứa → insert sessions/participants/bookings + audit/outbox → commit toàn bộ hoặc rollback toàn bộ.

**Nguyên tắc xuyên module:** Không repository trực tiếp vào bảng của module khác. Nếu phải ghi nhiều module trong cùng một nghiệp vụ, application coordinator sở hữu transaction PostgreSQL; domain service chỉ trả kết quả/điều kiện; sự kiện side effect ghi vào outbox cùng transaction khi cần.

## 5. Invariants / Business Rules phải bảo vệ

1. Overlap iff `A.start < B.end && B.start < A.end`, biên `[start,end)`; liền kề hợp lệ.
2. CANCELLED và booking RELEASED không chiếm tài nguyên; resource booking EXCLUDE GiST khi ACTIVE là guard DB đề xuất.
3. Kiểm tra lại trước commit, không chỉ UI preview; tránh race với hai người dùng.
4. Không thay lịch quá khứ/học phí đã chốt bằng mutation lặng; P1 gợi ý khung giờ không tương đương xác nhận.

## 6. Kiểm thử bắt buộc cho module

- [ ] Hai request confirm cùng Teacher/Room/Student chồng thời gian: tối đa một thành công.
- [ ] Chuỗi tuần có 1 buổi conflict → rollback toàn chuỗi.
- [ ] Buổi sát giờ không bị báo conflict; CANCELLED giải phóng booking.
- [ ] Học trực tiếp không có Room hoặc vượt capacity bị từ chối.

## 7. Phạm vi P1 và điểm nối mở rộng

- Availability finder đề xuất nguồn khác/chỗ trống, không tự reschedule.
- Nhận MAKEUP participant khi Academic Exceptions xác nhận.

## 8. Open decisions (không tự xem là baseline)

- Chọn khóa row/advisory và SQL exclusion migration rồi test concurrency; logic timezone/DST khi mở rộng ngoài Việt Nam.

## 9. Hợp đồng triển khai và cách phân lớp

```text
apps/api/src/modules/resource-scheduling/
  domain/          # entities, value objects, policies + pure domain services
  application/     # use cases, application services, port interfaces
  infrastructure/  # Prisma repositories, adapter khi thực sự cần
  presentation/    # NestJS controllers, DTO/validation, guards
```

Không bắt buộc tạo đủ thư mục/abstraction nếu module ít CRUD. **Controller không giữ business rule; guard/check quyền không chỉ nằm ở Controller**, phải đánh giá lại trong service khi xử lý job/duyệt. Các enum nghiệp vụ áp dụng TypeScript và PostgreSQL CHECK/constraint, kiểu VND dùng `bigint` hoặc `Decimal` đúng ngữ cảnh; REST JSON serialize `bigint` thành string.
