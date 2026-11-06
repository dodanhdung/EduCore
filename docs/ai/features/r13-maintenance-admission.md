# R13 maintenance admission — local review candidate

Date: 06/11/2026. Baseline: deploy/r13-staging, 876df8ac3e85a58379515b03c03bbd10ca3dc0d9.
Authority: owner master task, Step 2 explicitly permits a minimal local maintenance implementation and native tests. Implementation review and live activation are separate. No staging configuration or deployment is authorized.

## Scope and sources

Requirements NFR-05/06/08/13, Q-01/14/15, BR-08/14; current identity/access, automation jobs, API composition and immutable audit/receipt contracts. Reuse existing permissions, transactions and commands. No permission, OTP, tenant lifecycle, business state, schema, migration or UI change.

## Operator contract

`R13_ADMISSION_MODE=open|closed`, process environment only. Production must specify a value explicitly; omission or an invalid value fails startup. Development/native callers retain an open default. No HTTP toggle, header, query-string secret or role-based bypass. Changing mode requires a separately authorized process restart/deployment. Closed blocks every application request, including login and protected GET context writes, before guards; only the existing DB-free GET/HEAD `/` is admitted. Rejection is 503 MAINTENANCE, no-store, correlation ID, and no DB call.

The same gate covers the production HTTP composition, repository transactions and business worker claim/perform/dispatch, including direct tick calls. Recovery-worker entry refuses closed admission before creating a delivery client. Its existing production/local-only guard remains intact. Local/native callers without a gate retain their existing behavior.

## Drain and limitations

On shutdown, close admission before disconnecting DB clients. Track the actual controller promise and interactive transaction, not merely the client socket: an aborted request can still commit admitted work. Existing admitted operations finish under unchanged transaction rules; new work is rejected. Resolve drain only after active operations reach zero at an event-loop checkpoint. A drain timeout stays closed and fails, never reports quiescence. After successful drain, even stale request context cannot admit later work.

This is process-level admission, not a PostgreSQL superuser restriction. All old API instances, separate workers, cron and operator scripts must be inventoried and stopped/frozen. Verify provider release identity and DB transaction visibility before declaring a global write freeze. Activation SMTP already in flight is not recalled by HTTP drain; old processes/delivery must be separately accounted for. No live MAINTENANCE_READY claim follows from local tests.

## Release sequence

First bridge the old release to an explicitly CLOSED API with workers disabled, or prove provider isolation. Verify the old processes have exited and DB writers drained. Capture the independently authorized recoverable checkpoint. Apply only reviewed pending Prisma migrations; compare ledger, grants and function definitions. Validate exact API/Web tuple while admission remains closed, then obtain authorization to reopen. No blind SQL replay, down migration or restore over useful data.

## Acceptance

Unit tests cover configuration, direct-origin denial, strict health exception, no public bypass, shared/nested admission, real promise completion after cancellation, drain timeout and stale-context denial. Native PG tests cover no HTTP/context/business effects while closed, worker no-op denial, in-flight committed work and client abort with observed DB blocking, and unchanged open authorization. Existing R3/R4/R8, API boundaries, frontend suite, browser journeys, builds and lint remain required. Independent restored-DB startup and private-file integrity are separate recovery checks.
