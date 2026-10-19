# EduCore — R1b Implementation & Verification Report

**19/10/2026 · Local working copy · Owner-authorized R1b only.**

**R1B IMPLEMENTED — VERIFICATION INCOMPLETE**

Schema, baseline/custom migrations, security companion scripts và automated harness đã được viết. Prisma/client/typecheck/build đạt. **29 tests đạt: 14 static + 14 PostgreSQL WASM smoke + 1 scaffold.** Exact SQL đã áp dụng trong database PostgreSQL WASM in-memory; **chưa áp dụng bằng Prisma migrate deploy trên PostgreSQL server**, chưa chạy các backend độc lập. Không tuyên bố P-gate PASS hoặc runtime ready. H-04 **OPEN**.

## A. Verified baseline & authority

- Branch `feat/prisma-p0-schema`; HEAD trước/sau `703cdd4efecf6ffb4c2400f513dddfcf4648f2c0`, subject `docs: align P0 wallet business rules and simplified architecture`.
- Trước task: index sạch, tracked diff sạch; duy nhất [Implementation Plan](R1B_IMPLEMENTATION_PLAN.md) untracked. File đó được bảo toàn, không chỉnh trạng thái dự đoán thành kết quả.
- Snapshot trước sửa: `C:/Users/Admin/AppData/Local/Temp/educore-r1b-implementation-uTU26s/`, gồm manifest SHA-256 của **89 files**, staged/unstaged binary diffs và bản schema R1a. Không đọc/ghi production/shared DB hoặc nội dung DATABASE_URL.
- Schema ban đầu **62 models/28 enums**, R1a composites có thật, chưa migration directory/freeze marker. R1a SHA-256 `28b993a418340523e6e0246fca3bc94bb73e7d5f269a3fb8cf46472565d51b28`.
- Dùng skill [educore-feature-slice](../../../../.agents/skills/educore-feature-slice/SKILL.md), [AGENTS](../../../../AGENTS.md), [Project Context](../../PROJECT_CONTEXT.md), [Decision Register](../../DECISION_REGISTER.md), Requirements BR-04/06/14, Q-04/08; UC-13/21/23/24 và AC liên quan; accepted Architecture; DB/Detailed/API/Class Design Billing, Scheduling, Tenant, IAM, Audit. Đối chiếu R1a/Audit/Remediation/O12/Technical/Wallet proposals dưới cùng thư mục review.
- O12-A=A/B=B1/C=C1/D=D và WALLET-B1–B5 giữ nguyên. Owner trong yêu cầu hiện tại cho phép triển khai **minimal R1b design subset**, không phải blanket approval Q1–Q8/R2/R4 hoặc production deployment. Không sửa register/source-of-truth/approved business rules.
- `AGENTS.md:21` và Architecture §1.2:25 còn historical refund wording đã ghi ở plan; không sửa ngoài whitelist. Không ảnh hưởng R1b, cần amendment riêng trước Wallet R2-C.

## B. Exact changed files

**4 existing files sửa có chủ đích:**

| Path | Delta |
|---|---|
| [schema.prisma](../../../../apps/api/prisma/schema.prisma) | One nullable Tenant marker; formatter chỉ align các scalar trong Tenant |
| [package.json](../../../../apps/api/package.json) | 4 test scripts; test-only dependencies `postgres@3.4.7`, `@electric-sql/pglite@0.4.3`, `@prisma/adapter-pg@7.10.1`; không đổi existing dependency versions |
| [pnpm-lock.yaml](../../../../pnpm-lock.yaml) | Importers và adapter dependencies tương ứng |
| [.gitignore](../../../../.gitignore) | Ignore đúng generator output `apps/api/src/generated/prisma/`; cần vì validate/generate tạo client, không đưa generated implementation vào review diff |

**12 new files của task:**

| File | Purpose |
|---|---|
| [R1a baseline SQL](../../../../apps/api/prisma/migrations/202610190001_r1a_baseline/migration.sql) | Exact generated existing schema, chưa marker |
| [R1b migration SQL](../../../../apps/api/prisma/migrations/202610190002_r1b_integrity/migration.sql) | Marker, preflight, CHECK, helpers/guards, private owner/ACL |
| [migration_lock.toml](../../../../apps/api/prisma/migrations/migration_lock.toml) | PostgreSQL provider |
| [r1b-precheck.sql](../../../../apps/api/prisma/security/r1b-precheck.sql) | Read-only catalog/roles/legacy/source anomaly inventory |
| [r1b-runtime-profile.sql](../../../../apps/api/prisma/security/r1b-runtime-profile.sql) | Explicit companion: new closed-write profiles, refuses existing names/inherited PUBLIC data rights |
| [support.ts](../../../../apps/api/test/schema-integrity/support.ts) | Safe target admission, real DB fixtures/current-auth/audit, finite test-only retry, barriers/evidence/setup |
| [r1b.postgres.test.ts](../../../../apps/api/test/schema-integrity/r1b.postgres.test.ts) | Native matrix T01–T42; Prisma query engine and independent-connection tests |
| [r1b-static.spec.ts](../../../../apps/api/test/schema-integrity/r1b-static.spec.ts) | 14 offline safety/scope/client-input checks |
| [r1b-wasm-smoke.spec.ts](../../../../apps/api/test/schema-integrity/r1b-wasm-smoke.spec.ts) | 14 actual single-process PostgreSQL WASM SQL smoke tests |
| [Test README](../../../../apps/api/test/schema-integrity/README.md) | Reproduction, environment contract, evidence limitations |
| [vitest.config.r1b.ts](../../../../apps/api/vitest.config.r1b.ts) | Native DB-only suite, serial files/timeouts |
| This report | Implementation evidence and residuals |

The plan untracked trước task là **pre-existing work**, không tính như file mới của R1b implementation. Generated client/build/tsbuildinfo là ignored tool outputs. Không viết handwritten application module, API, UI hoặc fixture trong production migrations.

## C. Exact Prisma delta

```prisma
timezoneFrozenAt DateTime? @map("timezone_frozen_at") @db.Timestamptz(6)
```

Không default/index mới; **62 models/28 enums** giữ nguyên. Không thêm period/student/class/course scalar vào Line. R1a relation/back-relations/candidate keys/actions/nullability giữ nguyên. Offline `prisma migrate diff --from-schema <snapshot-r1a> --to-schema prisma/schema.prisma --script` chỉ sinh:

```sql
ALTER TABLE "tenants" ADD COLUMN "timezone_frozen_at" TIMESTAMPTZ(6);
```

Schema hiện tại SHA-256 `a21a016a08a527c156805f1da98aca64d9f1645521fd01f5c4cb0949636ee565`. Static normalized fingerprint chứng minh phần còn lại đúng R1a, không Billing/Wallet model changes.

## D. Migration inventory & existing-data strategy

| Artifact | Implemented | Actually applied |
|---|---|---|
| `202610190001_r1a_baseline` | Prisma7.10.1 generated `--from-empty --to-schema` **trước** marker;62 tables/28 enums, existing keys/FKs | PGlite only |
| `202610190002_r1b_integrity` | Explicit BEGIN/COMMIT, one column, preflight, one CHECK,8functions/13attachments/private owner | PGlite only |
| Runtime companion | Separate operator-reviewed role setup; not automatic live role mutation | PGlite only |
| Native Prisma migrate deploy/history | Harness invokes installed Prisma CLI with validated disposable URL | **NOT RUN** |

Baseline được sinh lại độc lập từ snapshot R1a sau sửa và **byte-identical**. Baseline SHA-256 `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20`; R1b SHA-256 `028fb6ffe8c05aed978a44da980df764020be94b7c20a296dff69a91f440bb76`.

**Fresh target:** baseline → R1b → explicit closed runtime profile; migration role cần reviewed DDL/role-management quyền phù hợp. Role names đã tồn tại hoặc PUBLIC data grants không tương thích ⇒ stop, không adopt/revoke live quyền tự động. Cluster-level roles khiến test target phải là **dedicated disposable cluster**, không chỉ một database mới trên shared cluster.

**Populated target:** không được tự mark baseline applied. Read-only inventory/catalog equivalence, backup/restore, source anomalies và original timezone evidence phải được review trước. Main R1b migration **refuses any existing Series/Session/Period/Run** bằng `r1b_legacy_adoption_required`; ALTER marker và mọi DDL được rollback. Đây là fail-closed boundary, không legacy adoption implementation. Target cụ thể có đủ chứng cứ vẫn cần reviewed adoption migration/manifest/audit `TENANT_TIMEZONE_FREEZE_ADOPTED_LEGACY` và migration-history reconciliation; chưa có dữ liệu/approval đó để sinh một script backfill an toàn. Không gán MIN(createdAt), timezone hiện tại hoặc giả snapshot.

WASM smoke đã kiểm một baseline có wrong-month issued fixture: R1b upgrade bị chặn, issued JSON giữ nguyên và marker column không bị để lại sau rollback. **Chưa chứng minh valid populated adoption thành công**; T37 BLOCKED. Không reset/drop/truncate database hiện có, không NULL hóa wrong finalization/student, không rewrite issued source.

## E. SQL constraints/functions/triggers/roles implemented

`bp_month_shape_ck`: finite DATEs, start ngày1, end=start+1month. Cross-table guard dùng `localDate=(actual Participant→Session.starts_at AT TIME ZONE frozen Tenant.timezone)::date`, `period.start<=localDate<period.end`. Không dùng JSON, UTC calendar month, end time hoặc draft creation time để quyết định kỳ.

**8 functions trong `educore_private`:** `r1b_lock_tenant(uuid)`, `r1b_freeze_tenant(uuid)`, `r1b_tenant_guard`, `r1b_calendar_guard`, `r1b_billing_guard`, `r1b_line_guard`, `r1b_lineage_guard`, `r1b_attendance_guard`. VOLATILE, fixed `pg_catalog,educore_private,pg_temp`, fully qualified protected reads, no untrusted dynamic SQL. Tenant guard **SECURITY INVOKER**; bảy functions còn lại SECURITY DEFINER. PUBLIC EXECUTE revoked; guard-owner default function EXECUTE cũng revoked globally.

| Attachment | Table / timing | Implemented invariant |
|---|---|---|
| T01 `r1b_tenant_guard_trg` | tenants BIUD | Named zone, immutable id, only helper initializes marker, frozen zone/marker/delete denied |
| T02 `r1b_series_guard_trg` | schedule_series BIUD | First-source freeze, series zone=frozen tenant; used class/delete protected |
| T03 `r1b_session_guard_trg` | class_sessions BIUD | First-source freeze; past/billed source facts and used lineage cannot be rewritten; harmless completion/revision metadata allowed |
| T04 `r1b_period_guard_trg` | billing_periods BIUD | First-source freeze; identity/month bounds immutable; monthly CHECK |
| T05 `r1b_run_guard_trg` | billing_runs BIUD | First-source freeze; owner/period/op-key immutable; used policy/input hash protected |
| T06 `r1b_invoice_guard_trg` | invoices BUD | Monthly identity immutable; was-issued basis/delete/reset denied |
| T07 `r1b_claim_guard_trg` | invoiced_participation_claims BUD | UPDATE/DELETE always rejected |
| T08 `r1b_line_guard_trg` | invoice_lines BIUD | Existing FKs plus live month containment; DB-derived namespace; source/financial field overwrite denied; was-issued children freeze |
| T09 `r1b_class_guard_trg` | classes BUD | Identity immutable; used original course lineage preserved |
| T10 `r1b_enrollment_guard_trg` | enrollments BUD | Referenced owner/class re-key/delete denied; normal closure metadata not blanket-frozen |
| T11 `r1b_participant_guard_trg` | session_participants BIUD | Nonnull enrollment.class=actual session.class, preserve used participant source facts |
| T12 `r1b_record_guard_trg` | attendance_records BIUD | Preserve R1a nullable finalization; billed semantic facts freeze; both old/new reconnect destinations checked |
| T13 `r1b_finalization_guard_trg` | attendance_finalizations BIUD | Captured confirmation facts freeze; one-time lockedAt allowed, no clear/rewrite |

BIUD/BUD đều immediate BEFORE ROW; không deferred repair/STale/G2. Existing FK/UNIQUE/Restrict vẫn chạy, không auto-fix scalar IDs. Không new indexes, FK hoặc dropped existing constraint.

**C1:** first INSERT Series/Session(any status)/Period/Run calls freeze helper trong cùng transaction; sticky marker survives last-source deletion. A valid Run already needs a Period, nên fresh guarded catalog không có valid “Run-only first source”; Run helper vẫn bảo vệ boundary và giữ marker, invalid first Run/FK failure được thiết kế rollback test.

**O-04:** new Line `r1bAttribution` namespace derives actual owner/source/period/class/course/enrollment, frozen zone/local date/month, exact UTC6digit session timestamps, cancelled flag, optional attendance/confirmation facts, revision evidence/capture time. Client namespace bị thay bằng DB facts; scalar IDs không được sửa để qua FK. Root JSON object required; namespace immutable after insert. Không full G history; no issued backfill.

**O-01/O-13:** test-only adapters lock sorted involved User rows before Tenant NK, READ COMMITTED, fresh authorization/source reads after entry. Global disable locks User UPDATE before membership discovery; attach anchors target User; test last-Manager count under shared tenant gate. Unsupported isolation25000. Retry adapter full rollback/current recheck, tối đa2 retries/finite budget; production commands chưa mở. No global advisory/distributed/generic workflow layer.

**Roles:** `educore_r1b_guard_owner` NOLOGIN/no super/CREATEROLE/BYPASSRLS, parent SELECT + only Tenant marker/updatedAt UPDATE; không table owner/history DML. Companion tạo mới `educore_r1b_api`/`educore_r1b_worker` NOLOGIN closed-write, không owner SET ROLE/private helper/PII broad read/DDL/TRUNCATE. Script checks effective table/column PUBLIC inheritance, không chỉ tin REVOKE text. Chưa map real application LOGIN hoặc cấp production command EXECUTE. Existing live grants/writers vẫn là deployment compatibility gate.

## F. Deviations from blueprint

1. **Legacy adoption:** chọn fail closed cho existing time-based sources; không thể viết correct generic backfill thiếu historical evidence. Valid populated upgrade chưa implemented/verified cho target cụ thể, T37 blocked; fresh path và immutable history guards vẫn triển khai độc lập.
2. **Single-process SQL smoke bổ sung:** dùng cached PGlite0.4.3/PostgreSQL17.5 để chạy actual SQL. Đây là additional functional evidence, không substitutes native server/16.x target, Prisma migrate history, isolation hoặc multi-backend tests.
3. **Test transport/dependencies:** `postgres` cho independent connections; official `PrismaPg` adapter cho actual nested-query test; PGlite chỉ dev smoke. Không production module/SQL write gateway. Schema/client generation output được ignore ở đúng path.
4. **Metadata revision:** attendance/finalization revision-only + updatedAt không bị coi là changed semantic source. Snapshot revision là capture evidence; protected facts giữ. Used Run policy/hash được freeze để tránh sửa admitted evidence. Không generation engine.
5. **Privilege rollout:** closed NOLOGIN profiles là explicit companion. Không biết live roles nên không tự map/revoke chúng; production grant transition phải inventory riêng. Guard/helper counts vẫn đúng8/13.

## G. Actual target classification

| Target | Classification / safety / limits |
|---|---|
| Native PostgreSQL server | **C — no authorized configured disposable target available.** Windows PATH không psql/pg_ctl/initdb/docker; service inspection không thấy PostgreSQL/Docker; WSL Ubuntu có nhưng command checks không tìm PostgreSQL/Docker tooling. Không suy ra mọi server trên máy chắc chắn không tồn tại |
| Native harness admission | R1B_TEST_DISPOSABLE chưa xác nhận; runner failed before connect với `R1B_POSTGRESQL_NOT_RUN`. Không dùng DATABASE_URL fallback, không probe arbitrary local/remote/shared DB |
| Supplemental engine | **Fresh ephemeral in-memory PGlite0.4.3, PostgreSQL17.5 wasm32**, version queried; no external DB URL/credentials/persisted production data. Separate memory instance cho migration-failure/legacy case, closed after tests |
| Existing populated DB | Không truy cập/kiểm kê/migrate/baseline-mark. Không có inventory/equivalence/timezone provenance để claim readiness |

Native harness requires explicit dedicated-cluster confirmation + literal127.0.0.1/::1 + `educore_r1b_*` DB + no URL options, then empty catalog/role prechecks. It creates no DB and deletes none. Fixture rows live only in disposable target; no fixture SQL ships in production migrations.

## H. Commands actually run & evidence

| Command/check | Actual result |
|---|---|
| Git status/branch/HEAD/diffs + before snapshot/final preservation | PASS; baseline and O below |
| `pnpm.cmd --dir apps/api exec prisma --version` | Prisma/client7.10.1; Node24.12.0; TS6.0.3 |
| `prisma migrate diff --from-empty --to-schema <R1a> --script` | PASS offline, exact baseline generated and reproduced byte-for-byte |
| `prisma migrate diff --from-schema <R1a> --to-schema prisma/schema.prisma --script` | PASS offline, only marker ADD COLUMN |
| `prisma format`, `prisma validate`, `prisma generate` | PASS, generator output ignored; only Tenant alignment changed |
| `pnpm.cmd --dir apps/api exec tsc --noEmit` | PASS including native fixtures/generated nested inputs/PrismaPg client code |
| `pnpm.cmd --dir apps/api build` | PASS Nest build; không runtime feature proof |
| `pnpm.cmd --dir apps/api test:r1b:offline` | PASS14static checks |
| `vitest run test/schema-integrity/r1b-wasm-smoke.spec.ts` / final `pnpm.cmd --dir apps/api test` | Final **29/29 PASS across3files**:14static +14WASM +1existing scaffold; latest full run11:45 local tool output |
| `oxlint --type-aware test/schema-integrity/` | PASS,0warnings after removing unused type import |
| Prettier write/check on new TS/config | PASS; no broad source formatting |
| `pnpm.cmd install --lockfile-only --frozen-lockfile --offline --ignore-scripts` | PASS; restored original frontend importer/peer snapshots after pnpm incidental deduplication, retained only required API test dependency additions |
| `pnpm.cmd --dir apps/api test:schema-integrity` | **Exit1/environment admission failure;42tests skipped**, no native test body/connection executed. Not SQL assertion FAIL and not PostgreSQL PASS |
| `pnpm.cmd peers check` | **FAIL pre-existing peer mismatch:** tsconfck3.1.6 wants TS^5, installed6.0.3. Both exact inputs present in original HEAD; no unrelated downgrade/plugin replacement made |
| Native `prisma migrate deploy`, P2, real Prisma nested, restore/tzdata | **NOT RUN** |
| `git diff --check` + untracked whitespace/links/scope inventory | **PASS:** no whitespace/scope errors,22report links valid,42native slots/42report rows,12new artifacts; HEAD/index unchanged. No SQL/concurrency inference |

Native admission evidence: `C:/Users/Admin/AppData/Local/Temp/educore-r1b-pg-evidence-wAef32/evidence.json`; races array empty. This is environment/admission evidence, **no wait graph or committed native mutation trace**. Snapshot directory contains regenerated baseline and `implementation-inventory.json` with current hashes/allowed changes. No credentials stored in report/evidence.

## I. R1B-T01–T42 disposition

**Native acceptance status:** PASS0, executed SQL-assertion FAIL0, NOT RUN40, BLOCKED1(T37), DEFERRED TO RUNTIME1(T41). Vitest suite itself exits1 due missing safe environment; all42cases skipped. WASM observations below are **partial functional evidence**, never upgrade native status.

| ID | Native status | Implemented case / supplemental evidence |
|---|---|---|
| R1B-T01 | NOT RUN | Valid live owner/month/JSON; WASM valid-line capture passed |
| R1B-T02 | NOT RUN | Isolated named invoice/participant student FKs; WASM wrong-student rejection |
| R1B-T03 | NOT RUN | Wrong month/forged namespace; WASM rejection passed |
| R1B-T04 | NOT RUN | Microseconds/exact month boundary; WASM UTC6digits + wrong-month subset |
| R1B-T05 | NOT RUN | Overnight start-month and other-period rejection; WASM overnight valid subset |
| R1B-T06 | NOT RUN | UTC/local and SQL TimeZone; WASM local-start/NewYork session setting |
| R1B-T07 | NOT RUN | Cancelled0/NULLattendance; WASM passed |
| R1B-T08 | NOT RUN | SQL same-session FK + real Prisma nested create/connect/disconnect/Line connects with current-auth entry; only WASM optional SQL + generated-type evidence ran |
| R1B-T09 | NOT RUN | Reconnect/source field immutability; WASM JSON/source subset |
| R1B-T10 | NOT RUN | Same/cross-month billed reschedule; WASM same-month reject + harmless completion |
| R1B-T11 | NOT RUN | Future unused vs past source edits; no native evidence |
| R1B-T12 | NOT RUN | Invoice/Run monthly identity and used input freeze; WASM invoice-owner subset |
| R1B-T13 | NOT RUN | Month shape/infinity/bounds; WASM finite invalid-month subset |
| R1B-T14 | NOT RUN | Used participant owner/enrollment/removal/delete; native fixture prepared |
| R1B-T15 | NOT RUN | Enrollment class child/inverse; WASM both directions |
| R1B-T16 | NOT RUN | Class/course cascade/delete; WASM direct Class course guard subset |
| R1B-T17 | NOT RUN | Issued reset/Line/claim permanence; WASM subset passed |
| R1B-T18 | NOT RUN | First viable sources, Run dependency/helper rollback/stickiness; WASM Series/Session/Period-first + last-source deletion passed, no native Run failure evidence |
| R1B-T19 | NOT RUN | Zone validity/series mismatch/manual marker; WASM manual marker rejection subset |
| R1B-T20 | NOT RUN | Sticky freeze/delete/Ops attempts; WASM last-period deletion + permanent zone |
| R1B-T21 | NOT RUN | Billed attendance/finalization facts; WASM detach/lockedAt/revision subset |
| R1B-T22 | NOT RUN | Line vs reschedule,2connections,both winners,commit/rollback; **no P2 evidence** |
| R1B-T23 | NOT RUN | Child insert vs invoice parent owner mutation, both orders/rollback; other inverse guards have separate functional cases |
| R1B-T24 | NOT RUN | First-source vs zone config, both winners/rollback; **no P2 evidence** |
| R1B-T25 | NOT RUN | Operation vs scope/permission revoke, audited effect, both orders/rollback |
| R1B-T26 | NOT RUN | Global disable/operation, membership-attach phantom, competing last-Manager disables; explicit target User/complete Tenant locks |
| R1B-T27 | NOT RUN | Different tenants/actors proceed without global fence |
| R1B-T28 | NOT RUN | Observed real deadlock/timeout, rollback, bounded retry, RR/SERIALIZABLE rejection; **no P2 evidence** |
| R1B-T29 | NOT RUN | Actual seeded current auth; WASM stored grants/scope positive, revoke and cross-tenant denial passed |
| R1B-T30 | NOT RUN | Cross-tenant command/FK mutation denial; WASM current-auth cross-tenant subset |
| R1B-T31 | NOT RUN | Actual ordinary runtime identities: raw writes/DDL/TRUNCATE/helper/SET ROLE denied; WASM marker raw-write subset |
| R1B-T32 | NOT RUN | Definer/owner/ACL/search_path/temp shadow catalog assertions; WASM SQL applied and owner boundary paths executed, native complete audit not run |
| R1B-T33 | NOT RUN | Trusted JSON replacement/array reject/immutable evidence; WASM derive/rewrite subset |
| R1B-T34 | NOT RUN | Effect/audit/FK failure atomic rollback; WASM migration atomicity only, not command fault proof |
| R1B-T35 | NOT RUN | Adapter discards COMMIT reply then reconnect/current-authorize/durable receipt lookup; fixture does not emulate every TCP commit window |
| R1B-T36 | NOT RUN | Actual native Prisma migrate deploy/history; WASM applies same SQL but does not prove Prisma history |
| R1B-T37 | BLOCKED | Reviewed valid legacy adoption migration/evidence absent; no automatic fabricated backfill |
| R1B-T38 | NOT RUN | Legacy block/precheck/history preservation; supplemental WASM wrong-month issued upgrade rejection + identical JSON passed |
| R1B-T39 | NOT RUN | Native failed deployment rollback/redeploy/history; WASM injected SQL-DDL fault rollback + reapply baseline passed, no native migration-history recovery claim |
| R1B-T40 | NOT RUN | Full native catalog/FK actions/candidates/indexes/13guards; WASM8functions/13attachments plus preserved baseline/type/static evidence |
| R1B-T41 | DEFERRED TO RUNTIME | No NestJS authenticated domain mutations implemented/authorized here |
| R1B-T42 | NOT RUN | Independent backup restore/tzdata upgrade; explicit skip, no production backup action |

P2 harness uses separate max1 native clients, explicit acquired-lock barrier, observer `pg_blocking_pids`, SQLSTATE/final state/audit assertions. Polling only schedules observer; it never proves a race by sleeping. Native migration harness refuses existing data/roles before mutation, exercises rollback, invokes Prisma CLI, checks history and installs disposable profiles. This describes **written test behavior**, not successful execution.

## J. Root causes, fixes & unresolved checks

- PowerShell execution policy blocked `pnpm.ps1`: used installed `pnpm.cmd`, no machine policy change.
- pnpm store lock access required tool escalation; packages cached except Prisma adapter, downloaded through separately permitted dependency command. No cloud database provisioning or business integration.
- Offline adapter metadata unavailable: installed official matching7.10.1 adapter to make T08 actual query-engine test executable rather than only type assertions.
- Review fixes before verification: effective PUBLIC ACL tested via `aclexplode`, runtime session identity via SESSION AUTHORIZATION (superuser SET ROLE alone would mis-test privilege), helper global default EXECUTE revoke, old+new attendance reconnect coverage, revision metadata exclusion. No claim these were native test-discovered bugs.
- Initial unused import lint warning removed; final lint clean. pnpm sorting noise in existing package entries và incidental frontend peer-context deduplication được loại khỏi diff; original frontend lock resolutions preserved, frozen/offline lock check passed.
- No failing WASM SQL assertion remained. Native environment error deliberately not bypassed. Existing tsconfck/TS peer issue left visible for a separate toolchain task; current typecheck/build/tests succeed.

## K. R1a regression evidence

Candidate/FK map names/actions preserved: `il_invoice_student_fk`, `il_participant_student_fk`, `ar_participant_session_fk`, `ar_finalization_session_fk`; `inv_tenant_id_student_uq`, `sp_tenant_session_student_id_uq`, `af_tenant_session_id_uq`, `ar_tenant_session_participant_uq`, `ar_tenant_session_finalization_idx`. No duplicates/new relations/nullability change.

Generated checked input fixtures compile: optional finalization omission, connect using tenant/session/id, disconnect=true, Line nested invoice/student and participant/session/student tuples. WASM covers NULL/attach/detach SQL and wrong-student rejection. Native T08/T40 will verify actual Prisma shared-field disconnect, wrong-session FK and deployed catalog. **Those native query-engine results remain unknown.**

## L. Remaining blockers & risks

1. No configured authorized native disposable PostgreSQL ⇒ migrations/Prisma nested/P2/security catalog server checks unavailable. **P-gate NOT RUN**, no assertion that locks/concurrency are safe from validate/TS/WASM.
2. Legacy target needs independently reviewed evidence/adoption/baseline history; main migration safely blocks. Do not run against populated/shared DB by changing flags.
3. Actual server version/tzdata/extensions/roles/default privileges/backup recovery/runtime writers uninspected. Guard role ownership/DDL requires correct deployment privileges; existing name/grant collision fails safely. Standalone WASM17.5 results cannot prove server16.x compatibility or row-lock waits.
4. Runtime ordinary LOGIN mapping, reviewed domain commands, HTTP identity/permission/scope, audit failure/recovery/real current-auth port remain runtime gates. Closed profiles and fixtures are not an implemented authorization API.
5. Same-tenant write serialization may cause contention; budgets are test/proposed configuration, no throughput/NFR claims. No external I/O inside command transaction.
6. No backup/tzdata upgrade evidence or full network-failure exploration. Native runner leaves test data/roles for inspection; a fresh isolated cluster/database is needed for subsequent full runs, not an automatic reset.

## M. H-04 status & gates

| Gate | Result |
|---|---|
| Design authorization | Owner explicitly authorized minimal R1b subset in this task; register not rewritten |
| Schema/client | PASS: exact one-field delta/format/validate/generate/typecheck; R1a shapes preserved |
| Supplemental SQL smoke | PASS14 on actual single-process PostgreSQL WASM; exact SQL applied there |
| Native PostgreSQL migrations/concurrency/security verification | **NOT RUN / INCOMPLETE** |
| Runtime feature | **DEFERRED**, no domain API |

H-04 **OPEN**: R1a student equality + new period/history/C1 SQL implementation and partial functional evidence do not close pricing eligibility, confirmed-source completeness, units/policy/price history, G/recompute/ISSUE lifecycle. No auto-repricing, no period repair by JSON or changing invoice identity.

## N. R2/R3/R4 deferred boundaries

Không WalletAccount/WalletTransaction/Payment.WALLET/signed releases; không BillingRunGeneration/SourceEpoch/CAS/G2; không ISSUE/counter/dueAt/cancellation/refund executor. R2-A cần sealed generation/current projection/recompute before runtime recompute, R2 financial pricing/history/claims completeness riêng. R3 giữ scheduling/capacity/transfer/enrollment intervals/cycles/full H-01 và Attendance confirmation/correction. R4 giữ full IAM/session authentication/Jobs/Workflow/Audit implementation. Không frontend/Figma/P1.

## O. Git preservation & final checks

89 pre-existing files snapshotted; **85 byte-identical**,4allowed tracked files modified. The pre-existing untracked plan is byte-identical. **12 new files** are listed in B, none staged; generated output ignored. HEAD/branch/index unchanged. No add/commit/push/reset/checkout/branch/PR/deploy. No existing requirements/design/register/audit/plan/R1a report edits.

Final repository verification **PASS**: `.gitignore`, API package/schema, lockfile modified; implementation artifacts new; old plan still pre-existing untracked. `implementation-inventory.json` captures hashes with0unexpected changes; `final-static-checks.json` records0errors, A–Q sections,42native slots/42matrix rows,22valid report links and12new files. Markdown tables/fences/whitespace and untracked-file scope checked separately from tracked `git diff --check`; no document check is PostgreSQL evidence.

## P. Next owner action

Review exact [schema diff](../../../../apps/api/prisma/schema.prisma), [R1b SQL](../../../../apps/api/prisma/migrations/202610190002_r1b_integrity/migration.sql), companion privilege profile and tests, with explicit attention to the legacy fail-closed boundary. Supply/identify a dedicated local disposable PostgreSQL cluster for the already-authored native verification command; do not repurpose an unknown/shared DB. Execute mandatory native tests and review evidence before R2-A readiness. Populated-target adoption remains a separate data-specific approval; T41 runtime is a separately approved slice. No repeat approval requested for settled O-12/Wallet business choices.

## Q. Final verdict

**R1B IMPLEMENTED — VERIFICATION INCOMPLETE**

Local implementation delivered for review; native server/P2/nested-query gates remain unverified. Stop after WP4/report. No automatic R2, deployment, Git operation or H-04 closure.

## Native PostgreSQL Verification — 2026-10-19

**Current verdict: R1B NATIVE VERIFICATION INCOMPLETE. Environment: NATIVE ENVIRONMENT BLOCKED.** Owner subsequently instructed to finish with available tools, report missing installations and stop. Historical sections A–Q above are preserved; their test counts describe the previous run.

### A. Environment

- Windows PowerShell; Node `v24.12.0`, pnpm `12.11.2`, Prisma/client `7.10.1`; current Vitest runner reports `4.1.11`.
- Windows command/service/common-install-path checks found no available Docker CLI/engine or PostgreSQL tools (`psql`, `pg_ctl`, `initdb`). The WSL Ubuntu metadata probe also found no Docker/PostgreSQL tools. No system software was installed.
- Classification: **Option C — prepare setup, run available checks, native environment blocked**. No PostgreSQL server version, target database, cluster role privileges or migration history could be inspected. No port/cluster/database was allocated. No unknown `DATABASE_URL`, production, Railway, shared or development database was used.
- Added test-only [PowerShell setup](../../../../apps/api/test/schema-integrity/start-r1b-native.ps1) and [usage instructions](../../../../apps/api/test/schema-integrity/README.md). They prepare a new local `postgres:16` container, random private credential, new anonymous storage and loopback-only dynamic port; validate fresh catalog/cluster ownership; then invoke the existing harness. No automatic resource deletion or manual pre-deploy.
- Setup verification here: PowerShell AST parser **PASS**, actual missing-Docker invocation exits `1` with the expected environment error **before** resource creation/admission. Successful Docker provisioning and its positive-path admission are **NOT RUN**; script readiness is not PostgreSQL evidence.
- To continue later, install/start **one** environment: Docker Desktop with a local Linux-container engine (the script then supplies PostgreSQL 16), **or** native PostgreSQL 16 tools plus a dedicated disposable cluster. Both installations are unnecessary. No additional project dependency is currently needed for the offline checks.

### B. Migrations

**No native migration was applied in this run.** Native `test:schema-integrity` and `test:r1b:concurrency` were not invoked because no verified disposable target exists. The harness must own `prisma migrate deploy`; do not deploy manually before it.

| Artifact | Actual evidence this run | Native result |
|---|---|---|
| `202610190001_r1a_baseline` | Original SHA256 `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20` unchanged; applied by WASM suite | NOT RUN |
| `202610190002_r1b_integrity` | Original SHA256 `028fb6ffe8c05aed978a44da980df764020be94b7c20a296dff69a91f440bb76` unchanged; applied by WASM suite | NOT RUN |
| SQL shape | Source retains `bp_month_shape_ck`, eight functions and 13 trigger attachments; supplemental WASM assertions pass | Server catalog NOT RUN |
| Security companion | Original file unchanged; executed in WASM suite | Server role/ACL verification NOT RUN |
| R1a keys/indexes | Original schema/baseline unchanged; offline regression assertions pass | Native Prisma/catalog NOT RUN |
| Migration history, deploy/redeploy and failed native DDL recovery | No native target; no history edits or fabricated adoption | NOT RUN |

WASM applies real SQL in a single-process engine; it does not exercise Prisma Migrate history or independent server connections. Schema remains 62 models/28 enums with the existing `Tenant.timezoneFrozenAt` R1b field; this run changes neither schema nor migration SQL.

### C. Test Results

| Command/check actually executed | Result |
|---|---|
| `pnpm.cmd install --frozen-lockfile --offline --ignore-scripts` | PASS after sandbox permission escalation for pnpm store lock; cached packages only, repository package/lock files unchanged |
| `pnpm.cmd --dir apps/api exec prisma validate` | PASS |
| `pnpm.cmd --dir apps/api exec prisma generate` | PASS; ignored generated output only |
| `pnpm.cmd --dir apps/api exec tsc --noEmit` | PASS, including strengthened native test source |
| `pnpm.cmd --dir apps/api build` | PASS |
| `pnpm.cmd --dir apps/api test:r1b:offline` | **14 PASS, 0 FAIL** |
| `pnpm.cmd --dir apps/api test:r1b:wasm` | **15 PASS, 0 FAIL** |
| `pnpm.cmd --dir apps/api exec vitest run src/app.controller.spec.ts` | **1 PASS, 0 FAIL** |
| `pnpm.cmd --dir apps/api exec oxlint --type-aware test/schema-integrity/` | PASS |
| Prettier on the two changed TypeScript test files | PASS |
| PowerShell AST parse; setup `-RunTests` with Docker absent | Syntax PASS; expected setup rejection with exit 1, native runner never started |
| `git diff --check` | PASS; Git reports expected LF/CRLF conversion notices |

**30 available tests PASS, 0 FAIL**, across three separately invoked suites. This is **not** 30 native test passes. Vite emits an informational `vite-tsconfig-paths` deprecation/redundancy message; unrelated configuration was left unchanged.

Native matrix below records availability, not failures of unexecuted assertions. **0 PASS, 0 assertion FAIL, 40 NOT RUN, 1 BLOCKED, 1 DEFERRED TO RUNTIME.**

| Native test | Scope | Status / evidence gap |
|---|---|---|
| R1B-T01 | Source/student ownership | NOT RUN — no native target |
| R1B-T02 | Source identity | NOT RUN — no native target |
| R1B-T03 | Period containment | NOT RUN — no native target |
| R1B-T04 | Local start/month boundary | NOT RUN — no native target |
| R1B-T05 | Cross-midnight attribution | NOT RUN — no native target |
| R1B-T06 | UTC/local and SQL timezone | NOT RUN — no native target |
| R1B-T07 | Cancelled/zero source | NOT RUN — no native target |
| R1B-T08 | Real Prisma nested relations/R1a FK | NOT RUN — type/WASM evidence cannot substitute |
| R1B-T09 | Source immutability/DRAFT metadata | NOT RUN — added protected-row assertion is compiled only |
| R1B-T10 | Billed rescheduling | NOT RUN — no native target |
| R1B-T11 | Unused/past source edits | NOT RUN — no native target |
| R1B-T12 | Invoice/Run identity | NOT RUN — no native target |
| R1B-T13 | Month CHECK/bounds | NOT RUN — no native target |
| R1B-T14 | Participant inverse guards | NOT RUN — no native target |
| R1B-T15 | Enrollment inverse guards | NOT RUN — no native target |
| R1B-T16 | Class/course inverse guards | NOT RUN — no native target |
| R1B-T17 | Issued header/line/claim freeze | NOT RUN — new cancellation/reason checks are compiled only |
| R1B-T18 | First-source sticky freeze/rollback | NOT RUN — no native target |
| R1B-T19 | Zone validity/provenance | NOT RUN — no native target |
| R1B-T20 | Permanent freeze/deletion | NOT RUN — no native target |
| R1B-T21 | Attendance/finalization lineage | NOT RUN — no native target |
| R1B-T22 | Line vs reschedule race | NOT RUN — no independent backend evidence |
| R1B-T23 | Child vs parent ownership race | NOT RUN — no independent backend evidence |
| R1B-T24 | First source vs timezone race | NOT RUN — no independent backend evidence |
| R1B-T25 | Revoke vs authorized mutation | NOT RUN — no independent backend evidence |
| R1B-T26 | Disable/membership/last-Manager races | NOT RUN — no independent backend evidence |
| R1B-T27 | Independent tenants/actors | NOT RUN — no independent backend evidence |
| R1B-T28 | Deadlock/timeout/bounded retry | NOT RUN — no SQLSTATE/wait evidence |
| R1B-T29 | Current authorization reads | NOT RUN — no native target |
| R1B-T30 | Cross-tenant denial | NOT RUN — no native target |
| R1B-T31 | Ordinary runtime role boundary | NOT RUN — no native target |
| R1B-T32 | Definer/owner/ACL/search_path | NOT RUN — no native catalog |
| R1B-T33 | Trusted immutable JSON evidence | NOT RUN — no native target |
| R1B-T34 | Command/audit atomic rollback | NOT RUN — no native target |
| R1B-T35 | Lost COMMIT reply/recovery | NOT RUN — no native target |
| R1B-T36 | Real Prisma migrate history | NOT RUN — no native target |
| R1B-T37 | Populated legacy adoption | **BLOCKED — requires reviewed legacy adoption**; compatibility deferred for a future populated deployment |
| R1B-T38 | Invalid legacy upgrade rejection | NOT RUN — no native target |
| R1B-T39 | Native DDL rollback/redeploy | NOT RUN — no native target |
| R1B-T40 | Native FK/index/trigger catalog | NOT RUN — no native catalog |
| R1B-T41 | Authenticated NestJS mutation paths | **DEFERRED TO RUNTIME** |
| R1B-T42 | Independent restore/tzdata upgrade | NOT RUN — no native restore/tzdata environment |

T01–T42 remain the existing suite; no replacement concurrency suite, mock-based acceptance or lowered expected business behavior was introduced.

### D. Concurrency Evidence

**Zero native test connections were opened.** No observed `pg_blocking_pids`, acquired-lock barrier, server lock wait, COMMIT/ROLLBACK race or deadlock SQLSTATE exists from this run. Existing T22–T28 still require separate transaction clients plus the observer. Their correctness cannot be inferred from Prisma validation, build, AST parsing or WASM PASS. Locking order and bounded retry remain written protocols awaiting native execution.

### E. Errors & Fixes

1. **Missing native tools:** prepared the minimal PowerShell setup and README instead of installing system software or selecting an unknown database. Positive provisioning remains unverified.
2. **pnpm store access:** the permitted elevated frozen/offline install reconciled cached `node_modules`; no dependency/version/schema/SQL change resulted. This is not a database defect.
3. **Cluster roles:** the migration creates `educore_r1b_guard_owner`; fresh test cluster setup deliberately requires an administrator. Native role/security behavior remains unknown. Managed deployment may require an operator with role-creation/ownership/grant privileges to run reviewed setup; do not grant application users those privileges. No production credential or role was changed.
4. **ISSUED → CANCELLED:** existing R1b guards reject it. Added a WASM rejection assertion (PASS) and a native T17 assertion (NOT RUN). Controlled cancellation/adjustment is an explicit R2-B/R2-C dependency, not enabled here.
5. **`InvoiceLine.reason_code`:** retained as DRAFT explanatory metadata. Database Design InvoiceLine/zero-line explanation and Billing class design determine eligibility/amount from attendance, charge units and price evidence, not from this label. Added a WASM test proving metadata edits preserve every other line field except `updated_at`, then reject reason edits after issue; PASS. T09 now compares the protected native row before/after the same edit; T17 rejects post-issue reason edits; both native assertions are NOT RUN. R2 services must validate reason/source consistency and must never derive amount, eligibility, period or repricing authorization solely from a mutable label. No SQL relaxation or audit framework was added.

No actual native SQL failure was observed because native execution was unavailable. The assertions above clarify existing behavior; they do not claim native-discovered bug fixes.

### F. Remaining Blockers

- **Immediate blocker:** no available local Docker engine or native PostgreSQL 16 disposable cluster. Install/start one option, then run the documented setup/full suite. Review actual mandatory native results before changing the gate.
- T37 remains a reviewed-evidence requirement for a **populated** deployment. It is not an extra blocker to fresh development. This task does not establish whether any real EduCore deployment has business data, and does not fabricate historical timezone provenance.
- T41 belongs to authenticated runtime implementation. T42 needs a safe restore/tzdata environment. Neither is converted into a false prerequisite that every R1b native test must PASS.
- Native server compatibility, catalog privileges, migration history, actual Prisma nested behavior and concurrency remain unverified. The Docker setup positive path itself also awaits available tooling.

### G. R1b Gate Decision

| Gate | Result after this run |
|---|---|
| Approved minimal R1b design | Existing owner authorization retained; no new business approval claimed |
| Schema implemented and validated | **PASS** — original schema unchanged; validate/generate/typecheck/build succeed |
| Supplemental offline/WASM checks | **PASS** — 14 static + 15 WASM; separate scaffold 1 PASS |
| PostgreSQL migrations applied and tested | **NOT RUN / INCOMPLETE** |
| Native concurrency/privileges/real Prisma integration | **NOT RUN / INCOMPLETE** |
| Runtime feature ready | **DEFERRED TO RUNTIME** |

**R1B NATIVE VERIFICATION INCOMPLETE.** H-04 remains **OPEN**. No native gate, runtime readiness or R2 financial completeness is inferred from the available checks.

### H. R2-A Readiness

Design preparation/review can use the existing R1b implementation, preserved source evidence and passing offline checks. **R2-A implementation is not unlocked by this verification run:** mandatory native migrations, R1a regression, period/timezone/parent guards, Prisma integration, privilege and multi-connection evidence remain missing. T37 is target-specific deferred compatibility; T41/T42 retain their phase/environment boundaries. No R2-A/B/C/D work was started.

### I. Git Preservation

- Initial snapshot: HEAD `703cdd4efecf6ffb4c2400f513dddfcf4648f2c0`, branch `feat/prisma-p0-schema`, SHA256 inventory of 101 existing files, staged/unstaged patches and original report saved in OS temp directory `C:/Users/Admin/AppData/Local/Temp/educore-r1b-native-verification-PAWmro/`.
- During the turn, an external Git update was observed: current HEAD `91f7f1a9b2e576aadcd746856ef15a00cfb14872` (`feat(db): implement R1b integrity guards, migrations and test harness`). The agent performed no Git write and did not undo that update. The original four modified tracked files and previous implementation artifacts are now represented in current HEAD; filesystem hashes confirm their contents were preserved outside the explicit test/report changes.
- This verification changes four existing files only: this report (append only), test README, WASM smoke test, and native T09/T17 assertions. One new file: `apps/api/test/schema-integrity/start-r1b-native.ps1`. **97 of the 101 snapshotted existing files remain byte-identical**, with no missing file; the four differences are the allowed changes just listed. Historical report content before this dated section remains byte-identical.
- Schema SHA256 remains `a21a016a08a527c156805f1da98aca64d9f1645521fd01f5c4cb0949636ee565`; both migrations and security scripts are unchanged. Requirements/design/API/register/R1a report untouched. Generated client/build files remain ignored outputs.
- Index remains empty; no add/commit/push/reset/checkout/branch/PR/deploy by the agent. New setup file remains for owner review before Git. Sanitized preservation/check evidence is stored in the temporary snapshot directory; no credential file, URL or secret is added to the repository.

Stop here. Owner next action: install/start one local PostgreSQL environment when convenient; the README provides the command for a fresh Docker-backed run. No software installation or database write was performed by this verification task.

## Native PostgreSQL Verification — 2026-10-19 (Docker follow-up)

**Latest verdict: R1B POSTGRESQL VERIFIED — READY FOR R2-A REVIEW**, for the approved fresh-cluster R1b subset and the Prisma compatibility restriction below. This follow-up supersedes the earlier environment-blocked gate result; all preceding evidence remains historical and unchanged. The owner installed Docker Desktop on D: and reported completion; verification resumed under the existing native-verification authorization. No R2 implementation, runtime readiness or H-04 closure is claimed.

### A. Environment

| Item | Observed value / evidence |
|---|---|
| Docker | CLI `D:/Docker/Desktop/resources/bin/docker.exe`; local named-pipe context; engine `29.8.2`. Desktop was initially stopped and was started; no software installation by the agent |
| PostgreSQL | **16.15**, Debian `16.15-1.pgdg13+2`, x86_64 Linux, official `postgres:16` image |
| Image ID | `sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d` |
| Final container | `educore-r1b-native-052c311d47c84abf8bcd698c362af060`, ID `936a002ad6bc595751d4f11b538b0f33da93d1b48125b5736c78854a44315117` |
| Final target | New database `educore_r1b_native_052c311d47c84abf8bcd698c362af060`, published only at `127.0.0.1:60012` |
| Storage | New anonymous volume `3bd4fe55e7ca1f14593c2f28d149b4fab9685ad40739cd8dfdfc5b503eacdc50`, container path `/var/lib/postgresql/data`; no supplied existing mount |
| Admission before writes | Label/container identity and loopback binding matched; server version `160015`; public tables `0`, migration tables `0`, conflicting R1b roles `0`, unrelated non-template/non-postgres databases `0`; dedicated-cluster superuser verified |
| Final setup result | `nativeTestExitCode: 0`, `SUITE_FINISHED_REVIEW_REQUIRED`; test/gate evidence reviewed separately below |

The setup generated a private random test credential and used only its validated disposable URL; it did not read or connect to a real application `DATABASE_URL`. No password, connection URL or full Docker `Config.Env` was logged/saved. Containers/volumes from failed and final test runs are retained for inspection; no reset/drop/cleanup or production/shared/Railway database operation occurred.

Evidence paths (local temporary files, not repository artifacts):

- Final sanitized environment: `C:/Users/Admin/AppData/Local/Temp/educore-r1b-native-052c311d47c84abf8bcd698c362af060/environment.json`.
- Final native assertions/races: `C:/Users/Admin/AppData/Local/Temp/educore-r1b-pg-evidence-XIKs6J/evidence.json`.
- Earlier failing-run evidence: `educore-r1b-pg-evidence-FyuUpZ/evidence.json` and `educore-r1b-pg-evidence-wkgJZp/evidence.json`, under the same OS temp root. They remain preserved; neither is presented as the final result.
- Resume snapshot/consolidated preservation evidence: `C:/Users/Admin/AppData/Local/Temp/educore-r1b-native-resume-5UtyYC/`.

### B. Migrations

The existing harness actually ran **Prisma `migrate deploy`** on each admitted fresh cluster, after its rollback/preflight tests. No manual pre-deploy or migration-history edits were used.

| Verification | Final native result |
|---|---|
| `202610190001_r1a_baseline` | **PASS** — history row finished, `rolled_back_at = NULL` |
| `202610190002_r1b_integrity` | **PASS** — history row finished, `rolled_back_at = NULL` |
| History/catalog | **PASS T36/T40** — two completed migrations; 62 domain tables + history; `timezone_frozen_at`; monthly `bp_month_shape_ck`; 13 enabled trigger attachments |
| Function/security catalog | **PASS T31/T32** — eight functions, correct definer/invoker attributes, VOLATILE/search_path/owner, no PUBLIC EXECUTE; guard owner NOLOGIN/non-superuser/non-CREATEROLE/non-BYPASSRLS; no InvoiceLine UPDATE privilege |
| Security companion | Applied successfully; ordinary API/worker identities denied protected raw writes, DDL, TRUNCATE, private helpers and guard-owner SET ROLE |
| R1a regressions | **PASS T02/T08/T40** — mapped composite FKs, Restrict actions, MATCH SIMPLE, candidate keys/indexes and optional finalization behavior tested |
| Legacy/failure recovery | **PASS T38/T39** — invalid legacy adoption refused; exact baseline/R1b DDL with injected failure rolled back, then fresh deploy succeeded; immutable evidence preserved |

Original migration SHA256 values remain unchanged: baseline `c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20`; R1b `028fb6ffe8c05aed978a44da980df764020be94b7c20a296dff69a91f440bb76`. T39 verifies injected transactional DDL rollback followed by successful Prisma deployment, not every failed-Prisma-history repair scenario on an existing database. Populated valid adoption remains T37, not implied by fresh deployment.

### C. Test Results

Final native invocation: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/schema-integrity/start-r1b-native.ps1 -RunTests`, which calls the existing `pnpm.cmd --dir apps/api test:schema-integrity`. **39 PASS, 0 FAIL, 3 skipped by the runner**, classified explicitly below. No mandatory DB test was skipped.

| Test | Final status | Actual coverage / limitation |
|---|---|---|
| R1B-T01 | PASS | Correct ownership and DB-derived source evidence |
| R1B-T02 | PASS | Wrong-student mapped composite FK rejections |
| R1B-T03 | PASS | Forged JSON cannot admit a wrong-month source |
| R1B-T04 | PASS | Six-digit microsecond source; exclusive next-month boundary |
| R1B-T05 | PASS | Overnight session belongs to local start month only |
| R1B-T06 | PASS | Tenant-local attribution despite UTC/SQL timezone differences |
| R1B-T07 | PASS | Cancelled zero line without fabricated attendance |
| R1B-T08 | PASS | Real Prisma nested create/connect, unsafe disconnect rejection/rollback, safe scalar unlink and InvoiceLine nested connects; restriction in E |
| R1B-T09 | PASS | Reconnect/source overwrite rejected; DRAFT label preserves protected row |
| R1B-T10 | PASS | Same/cross-month billed reschedule rejected |
| R1B-T11 | PASS | Allowed unused future edit; ordinary past edit rejected |
| R1B-T12 | PASS | Invoice/Run identity and used input immutable |
| R1B-T13 | PASS | Month shape/infinity/inverse bounds checks |
| R1B-T14 | PASS | Used participant identity/enrollment/removal/delete guards |
| R1B-T15 | PASS | Enrollment child and inverse guards |
| R1B-T16 | PASS | Class/course source lineage guards |
| R1B-T17 | PASS | Issued header/line/claim immutable, including cancellation/reason rejection |
| R1B-T18 | PASS | Four first-source boundaries and rollback |
| R1B-T19 | PASS | Invalid zone/Series mismatch/manual marker denied |
| R1B-T20 | PASS | Sticky marker after last-source deletion; no Ops bypass |
| R1B-T21 | PASS | Billed attendance/finalization facts frozen; allowed metadata edits |
| R1B-T22 | PASS | Line/reschedule race, both winners and commit/rollback |
| R1B-T23 | PASS | Child/parent owner race, both orders and rollback |
| R1B-T24 | PASS | First-source/timezone race, both winners and rollback |
| R1B-T25 | PASS | Permission/scope revoke vs authorized audited effect |
| R1B-T26 | PASS | Global disable, membership attach, last-Manager races |
| R1B-T27 | PASS | Independent tenants proceed without global serialization |
| R1B-T28 | PASS | Observed deadlock, lock timeout, rollback, bounded retry, unsupported isolation rejection |
| R1B-T29 | PASS | Fresh actual permission/session/scope rows, not an authorization boolean mock |
| R1B-T30 | PASS | Cross-tenant command/composite source denial |
| R1B-T31 | PASS | Ordinary runtime-role privilege boundary |
| R1B-T32 | PASS | Function/owner/ACL/search_path and temporary-table shadow checks |
| R1B-T33 | PASS | DB namespace replaces forgery; non-object JSON rejected |
| R1B-T34 | PASS | Effect/audit/source failure atomic rollback |
| R1B-T35 | PASS | Withheld COMMIT reply, durable lookup and single effect; not every TCP failure window |
| R1B-T36 | PASS | Actual Prisma migration history/catalog |
| R1B-T37 | BLOCKED — requires reviewed legacy adoption | Valid populated-target adoption compatibility deferred; no fabricated backfill |
| R1B-T38 | PASS | Legacy rejection/precheck preserves immutable evidence |
| R1B-T39 | PASS | Injected DDL rollback then successful deploy |
| R1B-T40 | PASS | R1a keys/actions/indexes, CHECK and 13 enabled guards |
| R1B-T41 | DEFERRED TO RUNTIME | Authenticated NestJS domain mutations not implemented here |
| R1B-T42 | NOT RUN | Independent restore/tzdata upgrade not exercised |

Available checks were also executed: Prisma validate/generate **PASS**; TypeScript `tsc --noEmit` and Nest build **PASS**; offline **14 PASS**, final WASM **15 PASS**, scaffold **1 PASS**; targeted oxlint/type-aware and Prettier **PASS**. Final logical inventory across those suites: **69 PASS, 0 FAIL, 1 BLOCKED, 1 NOT RUN, 1 DEFERRED TO RUNTIME**. Repeated earlier runs are not added to this count. The offline suite was rerun after the initial transport fixes; final timestamp transport was then covered by native T04 and the rerun WASM suite. Informational Vite plugin notices remain unrelated.

### D. Concurrency Evidence

- Final `evidence.json` records **32 race entries**, all with `observedWait: true`, using **64 distinct participant backend PIDs**. Each race uses two independent max-one-connection clients plus a separate observer querying `pg_blocking_pids`; these are actual backend waits, not a delay/mock.
- Example line-first race: PIDs `120/121`, commit winner ⇒ first succeeds, second rejected `23514`; rollback counterpart `122/123` ⇒ both allowed after rollback. Reverse-winner cases and parent/source/zone/revoke variants also pass final-state assertions.
- Entries include four membership-attach races and four last-Manager races, varying first actor/commit/rollback. Current authorization is read after User/Tenant locks; denial `42501` occurs where the committed revoke requires it. Different tenants proceed independently in T27.
- T28 additionally observes a real deadlock wait edge and exactly one `40P01` victim, verifies `55P03` lock timeout/rollback, rejects unsupported isolation with `25000`, and completes the bounded retry with exactly one resulting line. These assertions passed; individual T28 SQLSTATE events are asserted by the test rather than stored as separate race entries.
- This proves the authored R1b protocols on PostgreSQL 16.15 in the disposable environment. It is not a throughput benchmark, production lock-budget validation or evidence that future runtime commands already follow the protocol.

### E. Errors & Fixes

| Observed failure | Root cause and minimal correction | Final evidence |
|---|---|---|
| Docker first pull interrupted by `NativeCommandError` | Windows PowerShell `Stop` treated native stderr progress as failure. Setup locally captures stderr and judges the actual exit code, restoring the prior error preference | Fresh container provisioning/admission and complete suite exit 0 |
| First native run: 22 failures, 17 passes | Most line fixtures reached JSONB as a JSON string: postgres.js serialized the already serialized fixture again. Test-only `put` now uses explicit `text::jsonb` transport and serializes object inputs once | Valid object and rejected array/forged-evidence cases pass; SQL guard unchanged |
| T13 `RangeError: Invalid time value` | Driver attempted JS Date serialization of PostgreSQL date `infinity`; fixture now sends text cast to date so the real DB CHECK rejects it | T13 PASS with original expected SQLSTATE/constraint |
| Second run: T04 only failure, `.999999` became `.999000` | Driver converted timestamp strings through millisecond JS Date. Fixture now sends timestamp text cast by PostgreSQL, retaining all six digits; Date objects explicitly use ISO text | Final T04 PASS with original exact microsecond expectation; no weakened boundary |
| T08 nested `disconnect` rejected with `23514: Attendance identity is immutable` | Prisma 7.10.1 attempts to clear shared required FK identity fields. R1a report §5 already marked this query-engine behavior unproven; the old harness assumed success. Native test now proves rejection/transaction rollback and verifies the required columns/old finalization remain, then clears **only** nullable `finalizationId` in a fresh current-auth command transaction | T08 PASS; safe optional unlink succeeds and tenant/session remain; billed unlink still rejected in T21 |

**Compatibility restriction:** direct `AttendanceRecord.finalization.disconnect` is **not supported** with the current generated client/composite relation. A trusted authorized command must use the verified scalar-only unlink for an unused record; never expose unchecked update DTOs or make required tenant/session nullable. T08 passing is not a claim that the convenience nested disconnect succeeded. The corrected test enforces the unchanged identity/optional-unlink business contract; no trigger/FK was disabled, expected data-integrity rejection removed or new business transition approved. This runtime integration restriction is documented in the test README and must carry into the future Attendance implementation/review.

Known integration risks remain bounded:

- **Cluster roles:** creation/ownership/ACL passed with a dedicated cluster administrator. Managed deployment still needs a reviewed privileged migrator/operator capable of role setup; application login must not receive those rights. No dynamic role framework or production account change.
- **ISSUED → CANCELLED:** remains rejected and tested. Controlled R2-B/R2-C correction/cancellation must be implemented separately; no opening of issued edits here.
- **`reason_code`:** DRAFT metadata change preserves every other protected line field except `updated_at`; issued reason edits fail. Pricing/eligibility/month must not depend on this mutable label. No audit framework added.

All fixes are confined to setup/test transport and the verified client usage restriction. **No schema, migration, security SQL or backend business implementation was changed in this follow-up.**

### F. Remaining Blockers / Limits

- Native tooling blocker is resolved; no additional PostgreSQL installation is needed while this Docker engine is available.
- T37 remains blocked for **valid populated-target adoption** until reviewed evidence/migration exists. This does not block fresh-database R1b development, and does not establish whether any real deployment contains business data.
- T41 remains deferred until authenticated NestJS domain mutations exist. Test-only current-auth adapters/NOLOGIN profiles are not runtime login mapping or an implemented HTTP authorization gateway.
- T42 remains NOT RUN: the fresh migration suite does not perform an independent backup restore or tzdata upgrade. The Docker image provides PostgreSQL utilities, but their presence does not establish restore/upgrade correctness; no production backup action or package/tzdata transition was attempted.
- Safe scalar-only unlink is mandatory for the current Prisma relation; nested disconnect remains intentionally rejected. Managed-host permissions, populated rollout/adoption, production performance, real runtime writers and complete network-failure recovery require their own evidence.

### G. R1b Gate Decision

| Gate | Latest result |
|---|---|
| Minimal R1b design | Existing explicit owner authorization; no new APPROVED decision/register edits |
| Schema implemented/validated | **PASS**, preserved 62 models/28 enums and original schema hash |
| PostgreSQL migrations applied/tested | **PASS on fresh PostgreSQL 16.15 cluster** |
| Mandatory R1b integrity/timezone/Prisma/privilege/concurrency | **PASS 39/39**, with explicit nested-disconnect restriction and verified scalar unlink |
| Valid populated adoption / independent restore/tzdata | Target-specific BLOCKED / NOT RUN; not fresh-gate passes |
| Runtime feature ready | **DEFERRED TO RUNTIME** |

**R1B POSTGRESQL VERIFIED — READY FOR R2-A REVIEW.** This closes the native verification blocker for the approved fresh-cluster R1b subset. **H-04 remains OPEN** for broader pricing/eligibility/confirmed-source/completeness and ISSUE/recompute lifecycle work; runtime is not READY.

### H. R2-A Readiness

The R1b database prerequisite is now supported by actual native migration/catalog/R1a regression/period/timezone/parent/security/concurrency evidence. **R2-A may proceed to owner technical review**, carrying the scalar-unlink integration restriction, current-auth/lock protocol, managed-role deployment limit and immutable issued/cancellation boundary. Existing G/recompute/source projection/CAS/pricing/completeness decisions still require their own sign-off and implementation authorization. T37 is relevant only to a populated target. No R2-A/B/C/D code, schema or migration was started automatically.

### I. Git Preservation

- Resume baseline HEAD/branch: `91f7f1a9b2e576aadcd746856ef15a00cfb14872`, `feat/prisma-p0-schema`; existing index empty. Snapshot includes **102 existing files**, the pre-existing unstaged patch, staged patch and full report before this follow-up.
- Only five files differ from that resume snapshot: setup PowerShell, README, native test T08, test `support.ts`, and this append-only report. **97/102 existing files remain byte-identical**, no file removed/new file added during the follow-up. Earlier WASM/T09/T17 changes are preserved; their files are not reset to HEAD.
- Relative to current Git HEAD, five tracked files are modified (README, WASM smoke test, native test, support, report) and the already-untracked setup script remains untracked. New script still needs owner review before Git.
- Schema SHA256 remains `a21a016a08a527c156805f1da98aca64d9f1645521fd01f5c4cb0949636ee565`; migrations/security scripts/package/lockfiles and Requirements/design/API/register/R1a report unchanged. Historical report prefix before this follow-up is byte-identical. Generated outputs remain ignored.
- HEAD/branch/index unchanged during the follow-up; no stage/commit/push/reset/branch/PR/deploy. PostgreSQL writes were limited to the admitted task-owned disposable clusters. Failed/final containers and sanitized evidence remain available for review; no automatic deletion.

Stop after this report and preservation checks. No further software installation is required for this verified Docker-backed path; no automatic R2 continuation.
