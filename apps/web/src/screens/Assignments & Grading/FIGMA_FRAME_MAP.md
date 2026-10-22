# Figma frame inventory — Page `71:2`

File `xEdI4S3TJU0mKqQYUSPZhp`, Page “G. Assignments & Grading”. Những khung dưới đây là con trực tiếp được xác nhận qua Figma metadata, không suy đoán ID. Kích thước khung mặc định 1280 px, Mobile 390 px. Tablet dùng CSS responsive giữa desktop/mobile.

| Screen ID | Figma node IDs | Responsive variant | UI state | Planned component |
| --- | --- | --- | --- | --- |
| AS01 | `71:547`, `71:4284`, `71:10222` | Desktop, Mobile | Default, Empty | `AS01/TeacherAssignmentListScreen.tsx` |
| AS02 | `71:1091`, `71:4774`, `71:5277` | Desktop | Draft, Validation, Published edit warning | `AS02/AssignmentEditorScreen.tsx` |
| AS03 | `71:1620`, `71:5779` | Desktop | Default, Empty | `AS03/AssignmentDetailScreen.tsx` |
| AS04 | `71:2165`, `71:6272`, `71:10253` | Desktop, Mobile | Default, Empty | `AS04/GradingQueueScreen.tsx` |
| AS05 | `71:2708`, `71:6762`, `71:7263` | Desktop | Default, Grade Draft, Correction | `AS05/GradeSubmissionScreen.tsx` |
| AS06 | `71:3239`, `71:7761`, `71:10292` | Desktop, Mobile | Default, Empty | `AS06/MyAssignmentsScreen.tsx` |
| AS07 | `71:3755`, `71:8248`, `71:8741`, `71:9237`, `71:9731`, `71:10327` | Desktop, Mobile | Default, Upload error, Late, Closed, Expired | `AS07/MyAssignmentDetailScreen.tsx` |

Figma reference code uses Tailwind and repeats an absolute-positioned shell. Implementation uses the existing React/CSS AppShell and semantic components. This keeps existing route/guard behavior. Any remaining visual difference needs browser screenshot comparison and owner review.
