# Navigation Authorization — Owner Approval Packet

Ngày 24/10/2026 · Asia/Saigon · **Contract v1 — PROPOSED**.

**Approval state: `PENDING_OWNER_APPROVAL`. Navigation authorization vẫn `PENDING_REVIEW`; production `FAIL-CLOSED`.**

## 1. Executive decision summary

**Recommendation của agent: `APPROVE_MINIMAL_CONTRACT` cho candidate được mô tả chính xác trong packet này**, gồm mapping §4, HTTP §5 và SQL security contract/correction §6. Đây là đề nghị duyệt thiết kế, không phải owner approval hoặc quyền activation. Không đề nghị đưa nguyên draft cũ chưa sửa vào migration.

Mapping năm Operations screens phù hợp với permission catalog và read gateway hiện tại. Có một correction bắt buộc cho SQL candidate: phân biệt authentication mất hiệu lực trong lúc chờ principal lock với tenant/membership denial, để giữ HTTP401/403 như contract. Candidate correction này **chưa thực thi**, không nằm trong kết quả16 fixtures trước đó. Các việc frontend cần làm trước activation: giới hạn đúng năm IDs, validate DTO nghiêm ngặt và chủ động loại evidence khi TTL hết. Tất cả được đặc tả cho Phase B, không triển khai trong task này.

Owner có thể approve exact candidate hoặc yêu cầu revision/reject. Cho đến khi có quyết định rõ: không migration mới, không endpoint, không trusted production reader. Sau contract approval vẫn cần task Phase B riêng, verification/review mới; deployment không thuộc approval này.

## 2. Scope / Git baseline

- Repository `D:/EduCore`, branch `feat/foundation-auth-tenant-access`.
- HEAD: `f3034fe6e6678d99278131aa83611e8a96ddec2c`, `test(auth): verify session lifecycle and navigation security proposal`. Expected verification commit tồn tại và là HEAD; authentication foundation commit `1323972c79c9af23c9762a8d215f16aca3870844` có trong lịch sử.
- Working tree đầu task sạch: staged/unstaged/untracked rỗng. Proposal MD, security review, verification report, SQL draft và fixtures đều tracked, không diff với committed versions. Không có source drift từ expected baseline.
- Ignored artifacts/dependencies/build/generated outputs và `/roadmap.md` được giữ nguyên. Không đổi ignore policy, không stage/commit/push/PR/merge/deploy.
- Task này chỉ tạo packet và ZIP ở §16. Không sửa source, test, SQL draft, historical migrations hoặc business source-of-truth documents.

Phạm vi candidate: OP01, OP04, OP05, OP06, OP07; read eligibility theo effective TENANT grants. OP02/03, Academic, Scheduling, Attendance, Billing, Assignments, Portals, G01, GL01 và mọi P1 screen không được mở. AU05 self-service vẫn theo existing contract, không có trong `screenIds`.

Không triển khai Operations data providers, controls mutation, approval execution, audit explanation hoặc job retry. Navigation eligibility có thể dẫn đến UI `PENDING_API` hiện hữu; không biến thành tuyên bố business screens đã hoạt động.

## 3. Sources of truth / actual runtime evidence

| Nguồn | Phần đã đối chiếu / giới hạn authority |
|---|---|
| `AGENTS.md`, skill `educore-feature-slice`, [PROJECT_CONTEXT](../PROJECT_CONTEXT.md) | Review-first, slice P0, approval/Git boundaries; context snapshots không phải runtime proof |
| [Requirements](../../requirements/requirements_analysis.md) v5 + O-12/Wallet v5.1 amendments | FR-01/02/03/04/41/42; BR-08/10/14; Q-01/02/14/15; auth, current grants, tenant/scope |
| [UC](../../requirements/usecase/specification.md) v1.3 + amendments | UC-01/35/36/37; C-01–04; live permission và tenant/resource checks |
| [Architecture](../../architectural/architectural_design.md) | §1.1, §6, §7.1: server authority, current scopes, REST/security |
| [Database Design](../../design/database_design.md) v1.1 | §3.2/§5.2: membership, role/grant/scope, session separation |
| [Detailed Design](../../design/detailed_design.md) v1.1-approved-group-A | §3, §5.1/5.2, §A.2/A.3: exact permission keys, direct DTO/error envelope |
| [API spec](../../design/api_specification.md) v1.1-approved-group-A | §1, §3.11/3.12, §A.1/A.2: scoped read, statuses, no-store-compatible security; catalog không chứng minh routes live |
| `docs/design/class design/identity-access.md` | Logical ports; file còn ghi v1.0 proposed/old source names, không dùng để khẳng định implemented class names |
| [SCREEN_MAP](../SCREEN_MAP.md) và Operations cards trong `SCREEN_SPECIFICATIONS.md` | Canonical IDs/purpose/paths; từng UI vẫn cần per-screen review, không tự cấp mutation authority |
| [Proposal](R7_NAVIGATION_PROPOSAL.md), [security review](R7_NAVIGATION_SECURITY_REVIEW.md), [verification report](AUTH_FOUNDATION_VERIFICATION_REPORT.md) | Prior accepted test evidence; approval status vẫn pending |
| `apps/api/src/workflow-approval/runtime.controller.ts`, `runtime.service.ts` | Actual members/approvals/audit/jobs read routes và parameterized R4 gateway call |
| `apps/api/src/identity-access/{http.ts,session.guard.ts,auth.service.ts,crypto.ts,r4-repository.ts,r4.module.ts,request-context.ts}` | Actual JWT/bind/error/no-store/trace/credentials behavior |
| `apps/api/prisma/migrations/202610190006_r3_scheduling` | Current R3 principal body, User SHARE→Tenant gate, live membership; R4 identity migration thay source binding |
| Migrations `202610190010_r4_identity`, `011_r4_authorization`, `012_r4_workflow`, `016_r4_auth_audit`, `017_r4_execution_boundary`, `202610200019_r5_assignments` | Bound session/roles/catalog/read/trace/live-check dependencies; R5 chỉ mở learning predicates, không đổi năm OP keys |
| `apps/web/src/{auth.ts,api.ts,App.tsx,routes.ts}`, `screens/Management & Operations/ManagementScreens.tsx` | Existing consumer, no reader injection, AppShell trong App.tsx, production ManagementScreen trả pending |

Một số design/context đoạn cũ còn nói scaffold, DB v1.0, wallet chưa implemented hoặc role quyết định initial navigation. Đọc theo current BR/Q và effective grants; không dùng các snapshot đó thay source thực tế, không sửa nghĩa source trong task này.

Frozen committed artifacts tại HEAD, SHA-256 **Git blob bytes** (không phải raw CRLF working checkout):

- SQL draft `docs/ai/integration/proposals/R7_navigation_access.sql`: `bb6655d33f6405a80c8899259f45c6b630a124bd116f84351c34bc12ca9969c4`.
- Fixtures `apps/api/test/r4/navigation-proposal.cases.ts`: `95d4f5580274f92d75cccfc5c66a8fe5bf473695f17c2e30139d675844ee5dfd`.

## 4. Exact screen-to-permission mapping

`T = /api/v1/tenants/:tenantId`. Mỗi route dưới đây **đã có**, có `SessionGuard`; `RuntimeService.read` verify JWT rồi `R4Repository.transaction(token, ...)` bind và gọi `educore_r4.read`. Mapping navigation dùng cùng current permission predicate với NULL class/student context, không tính quyền trong browser.

| ID / purpose / UI route | Actual API read / cardinality | Backend authorizer / scope | Quyền chưa được cấp / edge cases |
|---|---|---|---|
| **OP01** tài khoản người dùng; `/app/:tenantId/settings/members` | `GET T/members?page=1&pageSize=20`; collection | `read(...,'MEMBERS',q)`→`authorize(t,'member.read')`→`principal(t)` + `has_permission(t,m,'member.read',NULL,NULL)`; **TENANT** | Không member.create/update, role.read/assign, OP02/03. API hiện chỉ trả id/userId/status; chưa đủ name/email/role UI, không được fake fields hoặc nới raw SELECT |
| **OP04** danh sách phê duyệt; `/app/:tenantId/approvals` | `GET T/approvals`; collection | `read(...,'APPROVALS',q)`→`authorize(t,'approval.read')`; **TENANT** | Không approval.decide/execute hoặc operation-specific financial quyền; hiện query chỉ page/pageSize, không nhận các filter status/type trong design catalog |
| **OP05** xem xét request, read-only eligibility; `/app/:tenantId/approvals/:requestId` | `GET T/approvals/:id`; individual | Cùng `approval.read`, **TENANT**, `query.id` validate UUID, SQL `ap.tenant_id=t AND ap.id=target` | ID vẫn phải load/authorize server-side mỗi lần. Unknown/other-tenant ID→P0002/404 khi auth/grant hợp lệ; thiếu grant→403 trước lookup. Không có own-request-only predicate: TENANT grant hiện cho đọc approval trong tenant, không tự hứa hạn chế theo requester/student. Không quyết định, thực thi hoặc tải evidence gốc qua API khác |
| **OP06** tra cứu audit; `/app/:tenantId/audit` | `GET T/audit`; collection | `read(...,'AUDIT',q)`→`authorize(t,'audit.read')`; **TENANT** | `GET T/audit/operations/:correlationId` dùng **audit.explain** riêng; không được suy ra từ OP06. Không raw before/after/secret fields, sửa/xóa audit hoặc bỏ retention |
| **OP07** quan sát jobs; `/app/:tenantId/operations/jobs` | `GET T/jobs` collection; `GET T/jobs/:id` individual | `read(...,'JOBS',q)`→`authorize(t,'job.read')`; **TENANT**, tenant/id-filter khi detail | Không job.retry/enqueue, worker claim/execute, policy editor hoặc manual recovery. Current read trả metadata, không full payload; missing/other-tenant job→404 sau authorize |

**Kết luận từng mapping: đúng và bảo thủ cho read eligibility; không đủ để triển khai toàn bộ tính năng UI của screen.** OP05 có thể có evidence trong `screenIds` nhưng không có menu link đứng riêng: `navigationRoutes` hiện bỏ path có unresolved resource parameter. Chỉ mở detail từ ID đã được source có thẩm quyền cung cấp; đổi ID trên URL vẫn đi qua backend target lookup khi data provider được triển khai sau.

Năm output IDs theo thứ tự tăng dần và không trùng: `['OP01','OP04','OP05','OP06','OP07']` hoặc subset. OP04 và OP05 cùng có/cùng không vì dùng cùng read predicate. Không có role-name→screen switch. Multi-role union chỉ các grant active thuộc cùng selected tenant; permission và scope phải khớp **cùng assignment**, không ghép quyền của role A với scope của role B. CLASS/STUDENT-only không khớp NULL contexts. Các ngoại lệ Parent/Student/Teacher hiện hữu trong authorizer vẫn áp dụng; role label hoặc verified Parent link không cấp staff OP quyền. User có thêm một grant staff hợp lệ vẫn được xét grant đó, không deny chỉ vì cũng là Parent/Teacher.

## 5. Exact HTTP read contract — PROPOSED

### 5.1 Request / pipeline

`GET /api/v1/tenants/:tenantId/access/navigation`, status success200; `tenantId` dùng canonical UUID từ selected principal. Exact `Authorization: Bearer <accessToken>`, `Accept: application/json`; optional `X-Request-Id` UUID theo helper hiện có. Không body, query, pagination, student/class/role/scope/permission inputs; reject parsed body hoặc query keys với400 sau auth/guard. Không yêu cầu Idempotency-Key/If-Match, không dùng cookie hoặc CSRF làm authentication cho GET này; cookie riêng không đủ. Unknown HTTP methods không có handler.

Giữ current `SessionGuard`: auth.me verify signature/issuer/audience/expiry rồi bind; validate path UUID; selected tenant bằng route tenant và nằm trong fresh allowedTenants. Service vẫn verify JWT **lại trước** API transaction. Guard và read transaction là hai lần kiểm độc lập, không tin principal từ guard như authorization snapshot. Live SQL principal rechecks user ACTIVE, tenant ACTIVE, membership ACTIVE/left_at NULL/current grants dưới existing lock protocol. Không nhận identity từ custom headers hoặc JWT role claims.

API sử dụng restricted R4 API LOGIN, AUTH URL riêng cho auth services; không fallback DATABASE_URL/migrator, không SET ROLE từ request. `assertRuntime` tiếp tục bắt buộc. Không server/shared cache, service-worker/offline fallback, ETag/304 hoặc localStorage navigation cache.

### 5.2 Success JSON — object trực tiếp

```ts
interface NavigationAccessResponse {
  userId: string;     // canonical UUID; bound active user
  sessionId: string;  // canonical UUID; live session, không phải credential
  tenantId: string;   // canonical UUID; selected tenant == route tenant
  screenIds: Array<'OP01' | 'OP04' | 'OP05' | 'OP06' | 'OP07'>;
  validUntil: number; // safe integer Unix epoch milliseconds
}
```

Đúng **năm keys**, không thêm `data` wrapper hoặc collection envelope; `additionalProperties:false`. IDs không rỗng, valid UUID; screenIds tối đa5, unique, sorted ascending, subset allowlist trên, OP04/OP05 đồng xuất hiện. `validUntil` hữu hạn/safe integer. Không trả role/grant catalog, membershipId, class/student/child/resource IDs, permission flags cho mutation, JWT/token/hash/refresh/CSRF hoặc private evidence. Identity/session IDs chỉ để bind response, không phải bearer capability; không log whole response.

Valid session + active selected membership nhưng không eligible grants→200 với `screenIds:[]` và cùng identity/expiry fields. Membership không hợp lệ **không** được đổi thành empty success. SQL/parse/DTO/service error không được đổi thành empty success.

Response `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Request-Id` theo current middleware; không có Set-Cookie/session rotation. Không thêm correlationId vào success JSON vì contract exact keys; correlation ở header/context. Error envelope giữ runtime hiện tại `{code,message,correlationId}` (message bằng safe code, không SQL text/details).

### 5.3 Errors / compatibility

| Điều kiện tại điểm kiểm tra | HTTP / code | Ràng buộc |
|---|---|---|
| Missing/invalid/tampered JWT; wrong issuer/audience; expired JWT; token/session revoked/rotated; globally disabled user |401 `AUTH_REQUIRED` | JWT failure hoặc SQLSTATE28000. Candidate §6.3 xử lý trường hợp auth mất hiệu lực trong lúc principal chờ lock |
| Authenticated nhưng chưa selected tenant, selected tenant khác path, tenant inactive/missing, membership inactive/revoked/left |403 `FORBIDDEN` | SessionGuard hoặc SQLSTATE42501, không lộ tenant tồn tại hay không |
| Authenticated nhưng UUID sai syntax hoặc body/query không được phép |400 `INVALID_INPUT` | UUID/helper và exact input validation. Guard auth chạy trước controller; request đồng thời nhiều lỗi không cam kết body/query validation trước authentication |
| Valid membership, không relevant TENANT grants |200, `screenIds:[]` | Không403 chỉ vì menu rỗng |
| Existing lock/serialization/deadlock conflict |409 `CONFLICT` | SQLSTATE55P03/40P01/40001; không retry vô hạn, không dùng evidence cũ |
| DB unavailable, undefined function42883, statement timeout57014, unexpected service/DTO response error |500 `INTERNAL_ERROR` | Dùng current filter; không tự hứa503 vì hiện chưa có mapping đó. Service DTO check throw InternalServerErrorException. Không trả SQL message/stack/URL |
| Proposed route chưa mount, như hiện tại |404 `NOT_FOUND` | Chỉ chứng minh endpoint vắng, không phải accepted authorization behavior của endpoint tương lai |

Current filter lấy SQLSTATE từ Prisma meta/driverAdapterError và map28000→401,42501→403; không tự đổi thành refined business error codes. Privilege misconfiguration cũng có thể là42501→403 theo filter hiện tại: Phase B phải phát hiện thiếu function EXECUTE bằng startup/deployment privilege checks, không gọi lỗi đó là missing navigation grant. Không thay global filter cho cả R4 để phục vụ route mới. Unexpected SQLSTATE/500 chỉ log event/status/correlation + safe SQLSTATE theo convention; không log params.

Backward compatibility: không đổi `/auth/login`, `/auth/me`, select-tenant, refresh/logout DTO/cookie/CSRF/expiry behavior; không gắn grants vào `/auth/me`, không kéo dài session bằng navigation read. Invalid/expired authentication phải qua existing refresh/re-auth flow; navigation GET không tự refresh, không rotate access hash.

### 5.4 Freshness / expiry

SQL đặt `validUntil = floor(epoch_ms(LEAST(access_expires_at, expires_at, clock_timestamp()+60 seconds)))`. Đây là upper bound của evidence, không TTL60s được bảo đảm cho mọi response. Browser clamp tiếp với local session.expiresAt và request deadline; reject nếu đã hết hạn. Không gia hạn validUntil khi re-render hoặc dùng cache. Backend response validator reject malformed/unexpected fields; expiry đã qua lúc HTTP chuẩn bị response→401, không phát evidence usable.

Role/grant revoke commit trước request kế tiếp phải được thấy bởi live SQL checks; không cache grants trong JWT/server. Revoke cạnh tranh với request tuân theo User→Tenant serialization: read hoàn tất trước revoke có thể trả evidence hợp lệ đến TTL; read chờ sau revoke thấy current state. Membership/session revoke có thể xảy ra khi response đang truyền; không cam kết broadcast invalidation tức thời. Mọi resource API luôn authorize lại, kể cả menu vẫn visible; không offline capability.

Client timer phải remove evidence/render lại protected route tại validUntil, kể cả không có focus/navigation event. Sự cố đồng hồ client có thể làm UI đóng sớm/muộn; server không tin đồng hồ client và resource enforcement vẫn là security boundary. Không biến observed4ms Windows/Docker skew trong prior N12 thành quyền nới server60s TTL.

## 6. SQL security contract / findings

### 6.1 Reviewed draft boundaries

`educore_r4.navigation_access(uuid) RETURNS jsonb`, `LANGUAGE plpgsql VOLATILE SECURITY DEFINER`. Owner chính xác `educore_r4_owner`: NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS theo migration010. Đây là shared gateway owner có SELECT/DML capabilities rộng; wrapper body phải chỉ đọc allowlisted fields/helpers, không thể gọi là read-only DB role. API không là member owner và không được cấp raw SELECT/DML để tính effective grants.

Fixed `search_path=pg_catalog,educore_r4,pg_temp`; public tables, R3/R4 functions đều schema-qualified; không public-schema resolution hoặc dynamic SQL. `pg_temp` cuối, API không CREATE trong trusted schemas; không chấp nhận client identifiers/function names. Explicit REVOKE PUBLIC và GRANT EXECUTE đúng signature cho API group. Owner/superuser vẫn có implicit/admin powers; “API-only” nghĩa là runtime application grants, không phủ nhận DBA powers.

`bind` gắn registered live token hash với backend PID/transaction ID, không caller GUC; `session_id` rechecks token hash/session expiry/user. `principal(t)` dùng R4 gateway bridge, User SHARE→Tenant gate rồi live membership. `has_permission` join tenant/membership/active assignment/permission/scope và role relationship restrictions hiện có. NULL tenant explicit42501; selected tenant strict; re-read session sau principal. ReadCommitted và VOLATILE helpers giữ fresh reads sau lock, không kéo permission snapshot ra ngoài transaction. Bind/set_correlation ghi technical transaction context như mọi authenticated gateway; không seed/audit/command/job/domain mutation từ navigation function.

### 6.2 Findings / disposition

| ID / severity | Evidence / reproduction | Required correction / disposition | Block contract approval? |
|---|---|---|---|
| NC-01 / Medium | Static trace: session còn live lúc initial SELECT; đợi User/Tenant lock tới access expiry; `principal` thông qua gateway/session_id không còn membership row hoặc principal, ném42501 **trước** post-principal re-read. Filter trả403 dù auth đã expired. N13 chỉ expire trước bind, không cover interleaving này | Candidate §6.3 catch riêng42501 từ principal, recheck session_id: absent→28000; live→rethrow42501. Không catch mọi lỗi hoặc trả[]; thêm independent-connection expiry/rotation wait tests | Chặn duyệt **unchanged draft** như exact401 contract. Packet đã đưa correction cụ thể để owner duyệt thiết kế; chưa có execution PASS cho correction, là activation gate |
| NC-02 / Medium, activation gap | `SessionController.grants` hiện chấp nhận bất kỳ existing protected non-self-service screen ID; committed consumer tests dùng AC01. Production reader hiện chưa inject nên chưa mở route | Future reader + consumer boundary validate exact5 OP IDs; reject whole response nếu unknown/unreviewed ID, không silently filter. Tests dùng reviewed OP IDs | Không chặn mapping design; bắt buộc trước reader activation |
| NC-03 / Medium, activation gap | App revalidation timer theo access expiry/60s; không theo navigation.validUntil. `canView` chỉ đánh giá khi render; evidence ngắn hạn có thể hết trước render kế tiếp | Timer riêng tại evidence deadline; xóa evidence và notify/render, cleanup theo epoch/session. No stale fallback khi network lỗi | Không chặn TTL design; bắt buộc trước activation; chưa có browser TTL test |
| NC-04 / Low, integration limit | Actual read projections không đủ screen props; ManagementScreen hiện `!preview`→pending. OP05 action capability, OP06 audit.explain, OP07 retry khác read grant | Giữ production pending data views/action controls; không bật Preview để lấy dữ liệu, không suy ra mutation capabilities từ screenIds | Không chặn navigation contract; whole-screen readiness ngoài Phase B |
| NC-05 / Low, coverage limit | N11 chưa test OPERATOR execute trực tiếp; N12 kiểm TTL bound nhưng chưa stress gần access/session expiry; prior suite không gọi future HTTP endpoint | Retest exact migrated function, extend operator/owner attributes, deadline/concurrency/schema/HTTP/browser matrix §10 | Không chặn design; chặn activation nếu chưa verify |

NAV-01 NULL denial và NAV-02 post-lock re-read từ previous review đã có trong committed draft, không revert. Không tìm thấy privilege/tenant/scope widening trong mapping hiện tại. Không claim NC-01 đã tái hiện bằng DB trong task này: đây là kết luận static từ exact control flow, phải có regression trong Phase B. Không chạy DB mới chỉ để lặp prior accepted evidence.

### 6.3 Exact SQL correction để owner review — chưa áp dụng

Giữ nguyên toàn bộ frozen draft §3, **chỉ thay statement** `m := educore_r3.principal(t);` bằng block sau; các post-principal session re-read, mapping, TTL, owner/search_path/ACL giữ nguyên:

```sql
BEGIN
  m := educore_r3.principal(t);
EXCEPTION WHEN SQLSTATE '42501' THEN
  IF educore_r4.session_id() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';
  END IF;
  RAISE;
END;
```

Block không trao quyền mới, không biến unexpected SQL failure thành success. Failed sub-block locks được PostgreSQL unwind trước error rethrow; path lỗi kết thúc read, không tiếp tục map grants. Success path vẫn cùng lock ordering. Owner phê duyệt packet là phê duyệt phép biến đổi cụ thể này của draft, không phải tuyên bố sửa đổi đã được tested/applied. Phải kiểm fixture expiry-during-lock và rotated access hash trước migration review.

### 6.4 SQLSTATE / privilege dependencies

Bound session absent→28000; wrong/null tenant hoặc active membership denial→42501; valid principal/no grant→[]; lock timeout/deadlock→existing409 mapping; unexpected system exceptions propagate, không broad EXCEPTION handler.

Cần migration010 tạo roles/schema/session/hash/bind/gateway bridge,011 tạo has_permission và GRANT principal cho owner,012 actual protected read semantics,016 auth/audit hardening,017 correlation và refreshed access mutation boundaries; R5 learning extension vẫn giữ nguyên. Deploy trên **toàn bộ current migration chain tới024**, không chèn migration trước các dependencies hoặc chạy SQL standalone vào ordinary DB trong task này. Không thêm SELECT grants cho API/AUTH/WORKER/OPERATOR, không cấp EXECUTE has_permission trực tiếp cho API.

## 7. Data exposure / tenant-scope risk

Success tiết lộ identity/session/tenant và eligibility của chính caller; không resource enumeration. OP05 không trả approval IDs từ navigation, không chứa student IDs/evidence. IDs đoán được vẫn qua actual resource endpoint current permission + tenant-filtered query. TENANT approval.read cho phép nội bộ đọc approvals thuộc tenant theo gateway; CLASS/STUDENT grant không được nâng thành authority này. Resource-specific APIs như wallet/file/student dùng authorizer riêng, không nhận screenIds làm proof.

Không đổi static catalog/default seed grants để làm menu xuất hiện; N08 fixture tự tạo role_permissions để test predicate **không phải** đề xuất cấp quyền production cho Academic Staff. Parent verified link không tạo staff permission. Nếu cần existential resource witnesses/portal menus về sau, phải mở slice/mapping riêng, không OR vào SQL này.

Audit/job read projections và reason/correlation fields vẫn có thể chứa business information được phép theo read grant; navigation DTO không mang các trường đó. CORS/no-store không thay authorization. Không log token/bind parameters, raw response hoặc role tables; giữ secret redaction và private storage boundary.

## 8. Reviewed test evidence — historical, không chạy lại trong task này

Nguồn: verification report đã committed ở HEAD; fixture source cùng Git blob hashes §3. Đây là kiểm evidence cũ, không phải một test execution mới.

| Prior run | PASS | FAIL | SKIP | Phạm vi / hạn chế |
|---|---:|---:|---:|---|
| Final default R4 native |57 |0 |16 | Draft absent, endpoint404; proposal tests intentionally skip |
| Owner-authorized final opt-in R4 native |73 |0 |0 |16 draft SQL fixtures +57 native cases, PostgreSQL16.15/restricted LOGINs, fresh runner cluster |
| Backend default |76 |0 |0 | Offline/default tests, không thay native SQL |
| Web full / focused R7 |228 /53 |0 /0 |0 /0 | HTTP doubles + JSDOM consumers; không future navigation HTTP E2E |
| Actual Edge→React→Nest→Postgres A19 | Trong native PASS |0 |0 | Login/select/profile/logout/reload/business-denial, không gọi future navigation endpoint |

Opt-in final prior container `educore-r4-native-981624c5b54f4bfc8400f3a54480161f`, sanitized evidence `C:/Users/Admin/AppData/Local/Temp/educore-r4-evidence-79Vrjs/evidence.json`. Không inspect secret env, reuse/reset/delete container hoặc copy database/profile/evidence vào ZIP. Prior DB-clock N12 correction không nới TTL.

## 9. Outstanding risks / limitations

NC-01 candidate correction chưa chạy; strict HTTP DTO/input/error mapping chưa có endpoint để test. Navigation evidence tối đa60s có stale window; ngay cả timer đúng cũng không broadcast role revoke. Resource reauthorization là bắt buộc. Client clock drift không được biến thành authorization trust.

Multi-tab refresh coordination chưa có; reload tiếp tục login vì CSRF chỉ memory. Failed network logout không chứng minh server revoke, UI giữ trạng thái unconfirmed. Không mở secure-cookie/TLS/domain/SMTP/private-volume production validation trong task này. Shared owner vẫn có broad powers cần DBA governance; không thay owner để né review.

Contract không duyệt UI layouts hoặc business read/action providers. Approval contract không là approval implementation, Git, merge hoặc production deploy. Mọi thay đổi semantic khác candidate (mapping/response/new grants/scope) phải quay lại owner review.

## 10. Security acceptance matrix

Legend: **Prior** chỉ evidence cũ đã nêu; **M** phải test lại trên exact future migration qua fresh admitted runner. **H** navigation HTTP endpoint chưa có: mọi row ghi H cần test mới, dù generic auth/resource HTTP đã có. **B** navigation browser chưa có: mọi row ghi B cần browser mới, dù A19 auth journey đã PASS. H/B `N/A` nghĩa là assertion SQL/ACL trực tiếp, không giả vờ browser chứng minh DB privileges.

| Case / expected | Prior fixture/coverage | M | H còn thiếu | B còn thiếu |
|---|---|---|---|---|
| No auth→401; cookie-only không đủ | N01 SQL unbound; generic auth.me HTTP | Có | Bearer missing/invalid/tampered/wrong issuer/audience | Login redirect/không shell |
| Expired access→401 | N13; A17; crypto expiry | Có | JWT expiry và DB access expiry độc lập | Expired evidence/session route denied |
| Revoked session→401 | N13; A06/X06 | Có | Navigation sau logout/replay/rotation | Evidence cleared, stale response ignored |
| Disabled user→401 | N14; A02/A16 | Có | Navigation sau disable | Không restore menu khi focus |
| Wrong/unselected tenant→403 | N02; A03/A14 | Có | Wrong tenant UUID và session selected NULL | Tenant-switch pending, old menu hidden |
| Inactive tenant→403 | Predicate source; default auth checks, chưa dedicated N fixture | Có, thêm | Navigation khi tenant inactive | Không render protected shell |
| Revoked/left membership→403 | N03; generic me detects removed membership | Có | Revoke giữa guard và SQL read | Clear evidence/tenant eligibility |
| Revoked role→200[] nếu không grant khác | N04; A10 resource denial | Có | Hai request trước/sau revoke | Menu mất sau revalidation/TTL |
| Active TENANT read grant→exact subset | N05/N08/N15 | Có | Mỗi permission riêng; OP04/05 pair | Chỉ OP01/04/06/07 links; OP05 detail theo ID |
| Missing relevant grant→200[] | N09 | Có | Valid member/no permission, không403 | AU05 fallback, no fabricated links |
| CLASS-only→[] | N06; A15 | Có | Grant có permission nhưng CLASS-only | Không tenant-wide menu |
| STUDENT-only→[] | N07 | Có | Grant có permission nhưng STUDENT-only | Không tenant-wide menu |
| Multi-role trong một tenant→union | N08 (đủ5 IDs) | Có | Permission+scope không ghép khác assignment | No duplicates; matching5 IDs |
| Cùng user trong hai tenants→không union chéo | N15; A14 | Có | Switch tenant/access hash current | Delayed tenant A response không ghi đè B |
| Verified Parent không staff OP | N10; A12 | Có | Pure Parent navigation[]; Parent+staff grant riêng | Không child/staff links do label |
| Unrelated child/resource access→deny | A12/X04 kiểm link/revoke; N10 không kiểm arbitrary IDs. Chưa có direct navigation→unrelated resource proof | Có, thêm unrelated child cùng tenant và giữ domain regressions | Resource API deny; OP05 other-tenant ID404; same-tenant TENANT grant read đúng contract | Không fetch unrelated resources từ menu; không infer mutation |
| Runtime raw SELECT/DML/DDL/SET ROLE denied | N11; D01/D07 | Có, mở rộng membership_roles/roles | N/A; dùng direct restricted connection | N/A |
| Function EXECUTE API-only runtime groups | N11/N16; OPERATOR check chưa trực tiếp | Có, thêm OPERATOR/unrelated LOGIN/helper deny/owner flags | Startup/deployment check; không expose raw privilege error | N/A |
| NULL tenant→42501; malformed HTTP UUID400 sau auth | N02 SQL | Có | Không nullable path; invalid UUID/query/body rejection | Không request tenant rỗng |
| Exact field allowlist/no secrets/IDs | N12 | Có | Exact JSON keys/types; correlation header; no Set-Cookie | DTO reject extra fields, no storage/DOM secrets |
| TTL<=60s và access/session expiry | N12 bounds, chưa near-expiry stress | Có, thêm gần cả2 deadlines | Actual timestamp boundary; no expired200 | Timer tới validUntil, fake clock + actual browser; no extension on delay |
| Revocation giữa requests | N04 sequential; existing A10/X16 | Có | Fresh navigation request không stale cache | Focus/revalidate removes grants, failure no fallback |
| Auth mất trong lock wait→28000, membership mất→42501 | NC-01 static; X16 tương tự mutation, không direct nav fixture | Có, thêm independent-connection wait observations | Actual401/403 qua candidate function | Đúng auth/denial UX, không resurrect |
| HTTP401/403/400/409/500 + no empty-success | Existing filter source/generic tests; no navigation endpoint | Có: SQLSTATE assertions | Real Nest+restricted PG, DB/response fault tests; không service double thay evidence | Errors close route, safe message |
| HTTP no-store/no shared response cache | Generic r7-http login no-store assertion | SQL N/A | Success/error headers, different users/tenants, no304/cookie | Fresh request/credentials omit, no SW/offline data fallback |
| Stale async response after logout/switch/refresh | `r7.test.mjs` races + identity/session/epoch tests | SQL concurrent cases | Delayed request integration | Actual pending request then logout/switch; no stale menu |
| Malformed/unreviewed screen IDs | Generic consumer hiện chấp nhận AC01; NC-02 | SQL exact mapping | DTO allowlist rejection500 | Exact5 enum, duplicates/noninteger/extra key rejected |
| Browser fail-closed + Preview isolation | A19 actual auth; R7 JSDOM/management Preview tests | Baseline giữ | Endpoint absent today404; future enabled status tests mới | Real browser menu + refresh + direct link + TTL; production bundle không fixture modules |
| Existing R4 regression suite | Prior57 native +16 opted-in | Có full suite | Existing auth/tenant/resource routes giữ nguyên | A19 giữ + future navigation E2E riêng |

Matrix không đánh dấu SQL-only tests là HTTP endpoint PASS. Newly added cases không có execution evidence trong task design này.

## 11. Future forward-only migration specification — chưa tạo file

**Proposed path:** `apps/api/prisma/migrations/202610240001_r7_navigation_access/migration.sql`. Đây chỉ là filename proposal; Phase B kiểm collision và order sau current024 ở branch lúc thực hiện, nếu cần đổi tên phải ghi lại trước review.

1. Source: frozen SQL blob §3 + đúng block replacement §6.3. Giữ BEGIN/COMMIT, CREATE FUNCTION (không CREATE OR REPLACE/IF NOT EXISTS để che drift), signature/JSON/TTL/mapping như §4–6. Không seed roles/permissions hoặc DML nghiệp vụ. Comment bỏ “not approved” chỉ khi owner đã approve exact candidate và ghi provenance; không biến test approval cũ thành contract approval.
2. Owner `educore_r4_owner`; exact ACL statements:

   ```sql
   ALTER FUNCTION educore_r4.navigation_access(uuid) OWNER TO educore_r4_owner;
   REVOKE ALL ON FUNCTION educore_r4.navigation_access(uuid) FROM PUBLIC;
   GRANT EXECUTE ON FUNCTION educore_r4.navigation_access(uuid) TO educore_r4_api;
   ```

   Không grant AUTH/WORKER/OPERATOR/helper access; giữ schema USAGE đang có. Migration process dùng controlled migrator có CREATE trong educore_r4 và quyền ALTER OWNER tới gateway owner. Không cấp owner membership cho API để chạy migration. Explicit REVOKE quan trọng vì creator là migrator, owner default privileges không thay thế nó.
3. Preflight: inspect target identity/admission, all dependencies010–024 applied, không existing conflicting signature/overload, owner attributes/schema ownership/ACL đúng, seed keys có trên test tenant, effective restricted LOGIN roles tách biệt. Không đưa preflight query secret/URLs vào log.
4. Prisma ledger làm once-only deployment: migrate deploy lần2 không apply SQL lại. Raw SQL chạy lần2 **phải fail** duplicate function; không tự drop/recreate. Fixture opt-in cũ hiện cài draft function thủ công: Phase B phải chuyển harness sang test **migrated function**, bỏ installation trong beforeAll; không cài function lần2 sau migrate. Test A20 đổi assertion function absent thành migrated expected, route tests chỉ kỳ vọng endpoint sau mount. Không bỏ các denial assertions.
5. Verify `pg_proc` exact signature/prosecdef/owner/proconfig/proacl, `pg_roles` owner flags, `has_function_privilege` cho API/AUTH/WORKER/OPERATOR/unrelated LOGIN, helper/raw-table denials, actual `assertRuntime`. Compare `pg_get_functiondef` và ACL với reviewed candidate; không chỉ kiểm tồn tại tên function.
6. Prisma schema không cần model/column mới. `prisma migrate diff` sạch **không đủ** chứng minh SQL functions/owners/ACL không drift; custom catalog assertions phải đi kèm. Kiểm fresh deploy, replay, schema drift, preceding migration checksums không đổi. Không sửa/rebaseline R1–R6.
7. Chạy exact matrix M trên fresh admitted disposable cluster; thêm NC-01 controlled wait bằng independent connections/pg_blocking_pids, expiry khi bị lock và role/membership changes. Không dùng sleeps đơn độc làm chứng cứ concurrency. HTTP repository vẫn ReadCommitted, lock_timeout3s/statement_timeout15s/transaction timeout20s như hiện có; timeout→error, không evidence cũ.
8. Deploy design: migrator trước API endpoint/reader; không chạy proposal vào ordinary DB trong review này. Phase B verification không đồng nghĩa production migration authorization. Nếu migration lỗi trong transaction, DDL/ACL rollback; giữ logs/failed ledger để inspect, dừng rollout, không tiếp tục mount reader. Không UPDATE `_prisma_migrations`, sửa checksum hoặc xóa migration history. Controlled failed-migration recovery theo quy trình owner review riêng; nếu đã applied rồi phát hiện lỗi, dùng forward-only repair migration mới, không sửa file đã applied. App rollback có thể disable/unwire reader/endpoint và để function unused, không drop data/roles. Bất kỳ deployment/recovery production đều cần authorization riêng.

## 12. Future NestJS integration specification — chưa implement

| Future file | Exact responsibility |
|---|---|
| **New** `apps/api/src/identity-access/navigation.controller.ts` | `@Controller('api/v1/tenants/:tenantId/access')`, `@UseGuards(SessionGuard)`, `@Get('navigation')`; inject NavigationService, read bearer/uuid, reject body/query; không nhận user/session/role inputs |
| **New** `apps/api/src/identity-access/navigation.service.ts` | Inject AuthService; verify JWT trước transaction; parameterized call bên dưới; validate exact DTO và matched user/session claims/route tenant; throw safe401 for expired evidence,500 malformed output; không compute permissions từ JWT/role |
| **New** `apps/api/src/identity-access/navigation.dto.ts` | Type + runtime validator exact5 keys, UUIDs/allowlist/unique/order/pair/finite safe integer. Không thêm validation dependencies nếu helpers/manual checks hiện có đủ. Không dùng TypeScript assertion làm runtime validation |
| Modified `apps/api/src/identity-access/r4.module.ts` | Register controller/provider factory `new NavigationService(auth)`; giữ SessionGuard/filter/CORS/no-store/requestTrace; không sửa domain controllers |
| Existing `r4-repository.ts`, `session.guard.ts`, `http.ts` | Reuse, không global privilege/error refactor. Nếu phải sửa ngoài kế hoạch để đáp ứng contract thì nêu diff/review, không âm thầm widen scope |

Proposed service transaction (shape minh họa, chưa source):

```ts
const claims = auth.tokens.verify(token);
const value = await auth.repository.transaction(token, tx =>
  result<unknown>(tx,
    'SELECT educore_r4.navigation_access($1::uuid) result', tenantId));
// Validate exact DTO, identity == claims.sub/sid, selected tenant == route.
// Unexpected DTO -> safe500; expired evidence -> safe401; no catch-to-empty.
return validatedResponse;
```

Bind token và function call cùng API transaction, không AUTH/migrator fallback và không một query raw grant ngoài transaction. `claims.tid` không thay DB active tenant check. Không read-only transaction flag: bind/set_correlation ghi technical context. Read không ghi business audit mới hoặc cần policy version/mutation idempotency key; preserve requestTrace→repository set_correlation, response X-Request-Id và redacted error logging. Không log JWT hay params.

Future tests: **new** `apps/api/test/r4/navigation.spec.ts` cho DTO/controller/service unit (doubles ghi rõ); actual endpoint cases trong **modified** `r4.postgres.test.ts`, migrated fixture reuse trong **modified** `navigation-proposal.cases.ts` (có thể giữ filename và đổi opt-in semantics rõ). HTTP matrix phải dùng actual Nest R4Module+restricted PostgreSQL, không gọi service doubles là integration. Kiểm middleware success/error no-store, error envelope/correlation, input rejection, selected/membership changes sau guard, exact response và startup privileges. Không trả logged SQL/detail cho client.

## 13. Future trusted frontend reader specification — chưa enable

| Future file | Change |
|---|---|
| **New** `apps/web/src/navigation.ts` | Export reviewed5-ID schema/validator và `createNavigationReader(api)`; chỉ fetch reviewed server path, validate exact DTO từ unknown, không role map/fallback/invent IDs |
| Modified `apps/web/src/api.ts` | Add `navigation(accessToken,tenantId,signal?)` với GET/encoded tenant/credentials omit; hỗ trợ `cache:'no-store'` cho navigation request; không đổi login/refresh/logout channels |
| Modified `apps/web/src/auth.ts` | Giữ revision/epoch/serial protections; enforce exact5 enum ở consumer boundary, numeric/UUID/schema checks; bind response đúng user/session/tenant; TTL clamp, evidence-expiry invalidation/notification; không đổi canView/resolveRoute thành role shortcut |
| Modified `apps/web/src/App.tsx` | Chỉ inject trusted reader trong production instance sau migration+endpoint được verify; wire evidence deadline timer và cleanup nếu đặt timer ở React layer; AppShell vẫn dùng navigationRoutes. Không truyền preview=true/data/canReview từ read eligibility |
| Modified `apps/web/src/r7.test.mjs`, `r7-ui.test.mjs`, `apps/api/test/r4/browser-auth.ts` | Existing mock navigation examples dùng AC01 phải chuyển sang OP01/approved OP IDs khi contract activation; preserve negative AC/other-module tests. Add actual navigation browser scenarios, giữ A19 auth/reload coverage |

Reader nhận `(token, tenantId)` theo `NavigationReader` hiện có; tự kiểm requested tenant/DTO. `SessionController.grants` sở hữu trusted expected user/session/revision/epoch từ current state, kiểm match trước publish; không lấy expected identity từ response. Không tạo single global latest-request counter thay session/tenant revision.

Khi gửi request, ghi deadline cục bộ không quá request-start+60s; khi nhận validate `validUntil>Date.now()`, clamp với session.expiresAt và deadline. Reject malformed/unknown IDs/duplicates/extra keys/noninteger time; fail closed toàn response, không quietly filter unsupported IDs rồi coi DTO hợp lệ. Existing revalidation clears old navigation trước await; giữ hành vi đó.401→auth loss;403/404/409/500/network/invalid DTO→evidence absent, protected routes denied, AU05 nếu session còn hợp lệ. Không phục hồi grants từ role labels/last-success/cache.

Chọn tenant/logout/expire/auth failure xóa evidence ngay và tăng revision/epoch; pending response cũ không publish. Refresh ghi token mới trước awaits, re-read me/grants rồi mới publish đúng context. Timer evidence expiry phải kiểm captured identity/session/tenant/epoch, chỉ xóa evidence tương ứng và trigger render; không expire nhầm session mới. Tại deadline giữ session self-service nếu access còn live; background retry không kéo dài old grants. Không thêm storage/cookie/broadcast secrets; reload vẫn cần login. AppShell không render unresolved OP05 menu link, không cho OP02/03/G01/GL01 hoặc business screens khác chỉ vì tồn tại trong routes.ts.

`ManagementScreen` hiện trả pending trong production và không có data provider; giữ đúng như vậy trong navigation Phase B. Không đưa Preview data vào production để chứng minh OP screens hoạt động. Preview chỉ DEV import riêng; production bundle check không chứa fixtures. Read-only navigation không đặt `canReview=true`.

Regression tests bắt buộc: exact schema/enum, unknown protected ID, identity/session/tenant mismatch, malformed/expired TTL, deadline shorter than revalidation interval, delayed response past deadline, logout/switch/refresh races, grant revoke,403/404/network no fallback, AU05-only empty result, no persistence, no mutation capability, direct OP05 arbitrary ID không bypass resource API, no Preview imports; actual browser kiểm authenticated menu và denial cả desktop/mobile. JSDOM/fake HTTP không thay actual browser+Nest+PG navigation E2E.

## 14. Activation / verification gates

1. **Gate hiện tại:** owner review exact mapping §4, HTTP §5 và SQL candidate §6; approval state hiện `PENDING_OWNER_APPROVAL`.
2. Owner mở task Phase B riêng sau explicit contract approval; trước sửa kiểm HEAD/drift và review any new file. Không kế thừa quyền commit/deploy từ contract approval.
3. Implement migration/endpoint/reader theo §11–13, không đổi grants hoặc mở screens ngoài năm IDs. Chạy fresh migrated SQL suite + NC-01/ACL/deadline additions; rồi actual HTTP integration và browser navigation E2E.
4. Full relevant build/lint/default web/API suites + R4 regression, migration replay/custom function+ACL drift/old checksums, production bundle Preview isolation. Phân biệt PASS/FAIL/SKIP và environment blockers; không dùng prior73 PASS cho changed candidate/migration.
5. Nộp ZIP Phase B mới, owner review source/tests/new files trước bất kỳ Git action; production activation/deployment vẫn là quyết định riêng. Local endpoint/reader wiring để test thuộc task Phase B được giao rõ, không thuộc task review này. Nếu verification/security fail thì không rollout, giữ production fail-closed.

## 15. Explicit owner decisions required

Ba câu hỏi cần owner trả lời rõ cho **Contract v1 trong packet này**:

1. **Mapping:** duyệt đúng OP01→member.read; OP04/OP05→approval.read; OP06→audit.read; OP07→job.read, tất cả TENANT/read-only eligibility, không cấp mutation hoặc mở screens khác?
2. **HTTP:** duyệt exact GET/DTO/errors/no-store/TTL≤60s tại §5, gồm empty200 chỉ khi valid membership/no grant,401 mất auth và403 tenant/membership denial, resource APIs tiếp tục authorize riêng?
3. **SQL security:** duyệt frozen draft + **đúng correction NC-01 tại §6.3**, owner/search_path/ACL/lock protocol §6 và migration dependencies §11, với bắt buộc retest candidate/migrated SQL trước activation?

Agent đề nghị **APPROVE_MINIMAL_CONTRACT** nếu owner đồng ý cả ba. Nếu muốn giữ nguyên draft cũ mà không sửa NC-01, đề nghị **REVISE_CONTRACT** cho401/403 contract; không đánh dấu unchanged draft phù hợp exact401 promise. Không đề nghị reject mapping vì chưa thấy tenant/scope widening trong năm read predicates.

Owner có thể ghi quyết định `APPROVE_MINIMAL_CONTRACT`, `REVISE_CONTRACT` hoặc `REJECT_CONTRACT` kèm exact sections/changes. Không có phản hồi không phải approval. Packet này giữ **`PENDING_OWNER_APPROVAL`**; quyền chạy16 fixtures trước đây không đổi state này. Approval không tự khởi động Phase B hoặc deploy; cần user giao task tiếp theo.

## 16. Validation actually run / files / artifact

Task này là review/design docs-only. Đã chạy read-only Git branch/HEAD/log/status/ignored/tracked-file checks, merge-base ancestry của foundation commit, diff against expected commit và SHA-256 committed SQL/fixture blobs; đọc actual controller/SQL/consumer sources và đối chiếu mapping/matrix. `git diff --check` chạy sau tạo packet: exit0; kiểm trực tiếp file mới:16 sections,11 local links tồn tại, Markdown fences cân bằng,0 trailing whitespace. Không chạy build/lint/test suites mới: **NOT RUN**, vì không sửa implementation/tests; không tạo DB/container mới hoặc dùng external service. PASS/FAIL/SKIP của prior suites được ghi riêng ở §8, không cộng vào kết quả task này. Source searches ban đầu có vài path/glob không khớp; đã resolve đúng paths bằng rg --files và kiểm lại, không dùng file vắng làm source proof.

Complete task manifest:

| Loại | Path |
|---|---|
| **New — owner review trước Git** | `docs/ai/integration/NAVIGATION_AUTHORIZATION_APPROVAL_PACKET.md` |
| **New artifact — không stage/commit** | `artifacts/educore-navigation-authorization-approval-review.zip` |

ZIP chỉ chứa packet tại repository-relative path; không chứa chính archive, prior archives, SQL/source đã committed, secrets/.env/.git, generated files/dependencies, evidence/database/browser profile hoặc unrelated files. Entry hash đối chiếu source sau đóng gói. Staged diff vẫn rỗng, HEAD/branch giữ baseline; prior proposal/SQL/source không đổi.

Disposition: **NAVIGATION_CONTRACT_READY_FOR_OWNER_APPROVAL**. Đây là readiness của decision package; owner state vẫn **PENDING_OWNER_APPROVAL**, production fail-closed. Dừng tại gate này.
