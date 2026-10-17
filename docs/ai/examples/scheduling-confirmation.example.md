# Example Feature Slice — UC-12 Confirm Weekly Schedule Series

**ID:** EC-SL-SCH-012 · **v0.1-review · DRAFT** · **NOT approved for implementation**  
**Purpose:** Demonstrate how to fill the feature template with *one* P0 business operation; **not** a request to implement Scheduling now.

## 1. Sources and explicit boundary

- Requirements v5: `FR-12`, `FR-13`, `FR-14`, `FR-15`; `BR-01`, `BR-08`, `BR-09`, `BR-12`, `BR-13`; `Q-04`; UC v1.3: **UC-12**, **AC-12-01/02/03**.
- Architectural Design: Modular Monolith + PostgreSQL + transactional outbox; design: Resource & Scheduling class spec, Database Design resource booking exclusion.
- **P0:** User-defined weekly series, preview + confirm all-or-nothing; **no P1 auto-suggest optimal times/rooms**.
- **Group A API proposed path (not runtime):** `/api/v1/tenants/{tenantId}/schedule/series/{seriesId}/confirm` (POST). Frontend proposed screen `SCH-03` under `/app/:tenantId/schedule/series/:seriesId/review`.
- **Prerequisites:** Active tenant/member, class/enrollment roster, teacher, room for onsite, busy times, authorized `schedule.confirm` permission and class scope. All resource references same tenant.

## 2. User outcome

Academic Staff/Manager prepares a weekly series of class sessions (date range max six months). Preview shows each candidate occurrence and conflicts. Confirmation succeeds **only if all occurrences are valid on server recheck**, otherwise no occurrence in the series is committed.

## 3. UI structure and states

- Header “Xác nhận lịch học định kỳ” with class, teacher, room, local weekly weekday/start, duration, start/end dates, timezone, candidate count, “Xem trước” and “Xác nhận toàn bộ”.
- Preview list: day, local times, teacher, room, projected participants, room capacity, conflict reason/time/resource class if authorized. Warning: **Preview chưa giữ chỗ**.
- State `preview_ready`: show all valid + invalid occurrences. If any conflict: disable confirm with explanation; never permit “skip only failed occurrence” for a single confirm.
- `confirm_pending`: disable duplicate click; persistent idempotency key per logical confirmation attempt (not new key on network retry).
- `confirmed`: display server-confirmed number and link to schedule; never claim success from preview alone.
- `409 SCHEDULE_CONFLICT`: preserve input, display safe conflicts, ask to edit and preview again. `403`: hide sensitive resource details, show forbidden. `5xx`: do not show success; support retry with same idempotency key.
- Mobile: preview as stacked cards with local date/time; desktop: conflict matrix/table with accessible row labels. No color-only errors.

## 4. Endpoint contract excerpt (API spec §3.4/§5.2)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `T/schedule/series` | Create DRAFT series `{classId,teacherId,roomId?,weekday,localStartTime,durationMinutes,validFrom,validTo}` |
| `POST` | `T/schedule/series/{id}/preview` | Advisory conflict preview, **no reservation** |
| `POST` | `T/schedule/series/{id}/confirm` | Atomic confirmation with `Idempotency-Key`, recheck and resource locking |

`T` means `/api/v1/tenants/{tenantId}`. Access via Bearer token selected for tenant. Example success 200 `{seriesId,status:"CONFIRMED",confirmedSessions,policyVersionId,correlationId}`; 409 with `SCHEDULE_CONFLICT` and safe details, **zero confirmed sessions** for failed logical operation. Endpoint schema finalization/permission catalog must match the approved API in working branch.

## 5. Invariants and transaction

1. Calculate session occurrences in tenant local time, translate to UTC for overlap; weekly limit 6 months. Check `[start,end)`; 08–09 and 09–10 are adjacent, NOT conflicting.
2. For every occurrence verify teacher/room/student blocking resource bookings + confirmed unavailability, capacity and same-tenant IDs.
3. On CONFIRM, inside one DB transaction: verify current permission/scope, pin original policy version, lock eligible resource IDs in deterministic order, recheck conflicts, insert all sessions/participants/bookings, mark series confirmed, write audit; outbox only for domain events that requirements support. PostgreSQL exclusion constraint is last-line race protection; any failed insert rolls back **all** session confirmation mutations.
4. Duplicate retry with same key and same payload returns previous outcome; same key and differing payload rejects. Later business correction uses explicit reschedule/cancel UC-13, not silent direct update.
5. **P0 notification** for legitimate schedule changes (UC-13); do not claim creating a fresh series must emit the same change notification without source justification.
6. Do not add Google Calendar/API email alerts, schedule optimization or automatic approvals.

### Note on unresolved implementation details

Exact PostgreSQL exclusion DDL and transaction isolation, `If-Match`/revision handling for series create/confirm, and whether confirmed scheduling emits a new assignment-style notification remain **per-slice review items**. They cannot be guessed by Codex. Preview and test fixtures may be implemented locally only after approval.

## 6. Acceptance tests (derived from UC-12)

| Test ID | Setup | Expected |
|---|---|---|
| AC-12-01 | Two separate sessions 08:00–09:00 and 09:00–10:00 with same resource | Both valid (half-open intervals) |
| AC-12-02a | Teacher/room overlapping a confirmed booking | 409 conflict; zero committed sessions |
| AC-12-02b | One student in both classes overlapping | Conflict detected; no series partial commit |
| AC-12-02c | Previous booking CANCELLED | No longer blocks resource |
| AC-12-03 | 12-week series with one overlapping candidate | Entire series remains unconfirmed, no bookings added |
| ACL-01 | Authorized User of tenant A tries tenant B series | Denied, no resource detail leakage |
| CONC-01 | Two transactions try same teacher/room concurrently | At most one confirms; rejected one leaves no partial state |
| IDEMP-01 | Same key and request repeated after timeout | No duplicate sessions; replay consistent |
| AUD-01 | Success / rejected conflict | Correct actor, target, policy and outcome recorded without secrets |

## 7. Allowed implementation scope once explicitly approved

Candidate paths (do not create until inspected): `apps/api/src/modules/scheduling/...`, PostgreSQL migrations owned by scheduling, `apps/web/src/features/scheduling/...`, relevant tests and generated OpenAPI contract. No mutations outside Scheduling and required cross-module **public interfaces**, no unrelated UI overhaul.

## 8. Review gate

- [ ] Source branch contains Requirements v5 and group A design/API docs.
- [ ] API/DB constraints and lock ordering approved; permission catalog code match.
- [ ] Figma/route SCREEN-ID reviewed (design only); Teacher/Student/Parent read-only visibility stays scoped.
- [ ] AC/negative/concurrency tests are written before claiming complete.
- [ ] No actual Git/Figma writes before explicit authorization.
