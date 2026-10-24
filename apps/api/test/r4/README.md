# R4 verification and runtime

Local review material. No deployment, production data adoption or real email
delivery is certified by this harness. Node **24.12+ in the Node 24 line** is
required for the built-in asynchronous Argon2id implementation.

## Verification

From the repository root, with an installed local Docker Engine:

```powershell
pnpm.cmd --dir apps/api build
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
```

The build is required by the R8 process-kill fixture, which starts compiled API
and worker code in child processes. It does not authorize any database target.

The runner creates a unique PostgreSQL 16 cluster, database and anonymous volume,
admits only a fresh literal-loopback target, generates passwords in memory,
applies all migrations using Prisma migrate deploy, and creates separate
restricted AUTH/API/WORKER/OPERATOR LOGINs. It never reuses, drops or resets
another database. Containers and volumes are retained for inspection.

For a focused rerun, append `-TestFilter 'C06|X13'`. The harness invokes Node
directly for this case so regex metacharacters never pass through `pnpm.cmd`.
Filtered skips are not full-suite evidence. Each rerun still uses a new cluster.

Run native tests only with `powershell -NoProfile -ExecutionPolicy Bypass -File
apps/api/test/r4/start-r4-native.ps1 -RunTests` from the repository root. The
runner creates and verifies a new isolated PostgreSQL 16 cluster before it sets
`R4_TEST_URL` and `R4_TEST_DISPOSABLE` inside its process. Manually setting those
variables is not test admission. Never use a shared, populated, development,
staging or production database. Evidence JSON and sanitized environment metadata
are written to the OS temporary directory.

## R8 local recovery worker

The password-recovery route now issues an OTP and encrypted delivery task in one
SQL transaction. Set `R4_RECOVERY_ACTIVE_KEY_ID` and `R4_RECOVERY_ACTIVE_KEY`
(base64 of a **test-only** 32-byte key) on the API process. Start the separate
local worker with `node apps/api/dist/identity-access/recovery-worker-main.js`
and only these worker secrets: `R4_OTP_WORKER_URL` (a restricted LOGIN whose sole
group is `educore_r4_otp_delivery`), `R4_RECOVERY_KEYS` (JSON key-id to base64
test-key map), `R4_SMTP_HOST` (`127.0.0.1`), `R4_SMTP_PORT`, and
`R4_SMTP_FROM` ending in `.invalid`; `R4_SMTP_USER` and `R4_SMTP_PASSWORD` are
optional for a local fake server. The local worker refuses production mode,
non-loopback SMTP and non-`.invalid` recipients. Do not copy test keys or SMTP
credentials into source, logs, reports or archives. Do not use customer addresses.

`R4_OTP_MODE` and the existing activation delivery adapter remain for the legacy
ACTIVATION flow; D01 does not claim that flow's SMTP credential is isolated from
the API process. The new recovery worker never loads JWT, OTP pepper, API or
business-worker credentials. SMTP acceptance means server acceptance only; UC-03
alternative 2a and production SMTP/key custody remain open for separate approval.

The native suite kills child API/worker processes after commit, before send,
during fake SMTP and after a fake SMTP 250 reply. It advances only the runner's
disposable task lease and retry clocks to test recovery without waiting minutes.
The same eligible OTP is retried; SMTP delivery can occur twice when a process
dies after server acceptance. No inbox delivery or exactly-once guarantee follows.

Real Nest HTTP tests log in with Argon2id credentials and persistent sessions;
there is no fake principal override. SQL races use independently connected
LOGINs, `pg_blocking_pids`, explicit transactions and commit/rollback observations.
The delayed-worker case observes an advisory-lock wait **and PostgreSQL lease
expiry**, then proves that the deferred receipt guard rolls back COMMIT.

Run R1b, R2 and R3 runners separately, each with `-RunTests`. They apply the
current migration directory, including R4. Fixture changes retain a separate
Manager when the test subject loses access; financial/scope expectations remain
unchanged. R3 also tests a populated checkpoint 007 upgrade through R4.

## Runtime credentials and configuration

Apply migrations with the controlled migration credential. Then provision
different restricted LOGINs through the operator's secure credential procedure:

| Process credential | Required group role   | Other boundaries                                                           |
| ------------------ | --------------------- | -------------------------------------------------------------------------- |
| `R4_AUTH_URL`      | `educore_r4_auth`     | Auth functions only; no domain commands or raw credential reads            |
| `R4_API_URL`       | `educore_r4_api`      | Inherits R2/R3 command roles; verified transaction binding required        |
| `R4_WORKER_URL`    | `educore_r4_worker`   | Claim/fenced execution/outbox functions only                               |
| `R4_OPERATOR_URL`  | `educore_r4_operator` | CLI bootstrap/static seed/global disable; never loaded by the HTTP runtime |
| `R4_OTP_WORKER_URL` | `educore_r4_otp_delivery` | R8 local worker delivery functions only; no API/auth/business role membership |

LOGINs must be NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS, without schema or
database CREATE, owner-role membership, raw credential SELECT or combined
AUTH/API/WORKER/OPERATOR capabilities. `assertRuntime()` enforces those runtime
boundaries on startup. Do not use the migration LOGIN as a runtime connection.
Passwords/URLs belong in secret configuration, never source or command output.

Required HTTP environment:

```text
NODE_ENV=production
R4_AUTH_URL=<secret restricted AUTH connection>
R4_API_URL=<secret restricted API connection>
R4_JWT_SECRET=<independent random secret, at least 32 bytes>
R4_OTP_PEPPER=<different independent random secret, at least 32 bytes>
R4_JWT_ISSUER=<deployment issuer>
R4_JWT_AUDIENCE=<web audience>
R4_WEB_ORIGINS=https://web.example.invalid
R4_OTP_MODE=smtp
R4_SMTP_HOST=<SMTP hostname>
R4_SMTP_PORT=465
R4_SMTP_USER=<secret configuration>
R4_SMTP_PASSWORD=<secret configuration>
R4_SMTP_FROM=otp@example.invalid
R4_WORKER_ENABLED=1
R4_WORKER_URL=<secret restricted WORKER connection>
PORT=3000
```

Origin values are exact comma-separated origins, with HTTPS in production.
Use same-site web/API subdomains behind HTTPS as approved in API §A.2. No default
signing key, migration URL fallback or wildcard credentialed CORS exists.

`R4_OTP_MODE=capture` is available only outside production; it keeps captures in
an injected object for tests/local debugging and exposes no capture HTTP route.
`R4_OTP_MODE=unavailable` explicitly disables delivery while preserving auth
implementation and generic OTP request responses. This is **not an operational
password recovery configuration**. That SMTP adapter is the existing ACTIVATION
path only. Its production configuration is not approval to run the R8 recovery
worker with real SMTP or keys. R8 recovery sends only through its separate local
loopback fake-SMTP worker; HTTP never waits for that transport. A committed task
survives an API restart, and a worker restart can retry it after lease expiry.
Fake SMTP 250 is server acceptance, not proof of inbox arrival. Production SMTP
and key custody require separate owner approval.

Review reverse-proxy/database logging: never log Authorization/Cookie/OTP bodies,
connection URLs or SQL bind values. In particular, configure PostgreSQL parameter
logging appropriately (`log_parameter_max_length=0` and
`log_parameter_max_length_on_error=0`). The application error filter emits safe
codes/correlation IDs and does not log the original Prisma exception.

## Controlled bootstrap

Build with `pnpm --dir apps/api build`. Supply the OPERATOR connection only to
the CLI process, then invoke the compiled command from the repository root:

```text
node apps/api/dist/tenant-policy/operator-cli.js bootstrap <code> <name> <timezone> <email> <displayName>
node apps/api/dist/tenant-policy/operator-cli.js seed <tenantUUID>
node apps/api/dist/tenant-policy/operator-cli.js disable-user <userUUID> <reason>
```

O-11 **A** was explicitly approved by the owner during this task. Bootstrap
creates a CREATED tenant, immutable baseline, pending user/membership and first
Manager grant in one transaction. Its assigner self-reference is recorded as a
narrow pending-beneficiary exception; OPERATOR audit stores the real database
LOGIN separately and never fabricates a tenant operator membership. Existing
identity/email adoption is rejected by this bootstrap. Tenant activation occurs
only after atomic activation OTP consumption, password setup and a valid Manager.
There is no public bootstrap or temporary password.

## Contract boundaries

- Access JWT: HS256, issuer/audience checked, 900 seconds; permissions are read
  fresh from the database. Tokens additionally need a registered live hash.
- Refresh: host-only HttpOnly Secure SameSite=Lax cookie, `/api/v1/auth` path,
  original session expiry at most seven days; rotating hashes and replay revocation.
  Refresh requires exact Origin plus the distinct session CSRF secret returned by
  login/refresh. Other protected mutations use Bearer access, including logout.
- Login technical defaults: five failures then a 15-minute lock; per-IP HMAC
  counters permit 30 login, 10 OTP and 20 reset requests per minute. OTP requests
  are additionally limited to one per known user per minute; five OTP attempts.
  These are reviewable technical defaults, not newly approved business policy.
- The private principal is bound to backend PID **and transaction ID**, with a
  registered token hash rechecked by R2/R3. No user/membership header, custom GUC,
  `SET ROLE` from a request or global mutable principal is trusted.
- Financial workflow uses the existing R2 request/decision/root receipt. APPROVED
  commits independently; explicit execution owns all financial effects and
  COMPLETED atomically. REQUEST_INFO preserves the original immutable request;
  changed financial input requires a new request rather than mutating history.
- Job allowlist: SCHEDULE_CHECK and BILLING_GENERATE only. No ISSUE, approve,
  transfer, payment or reversal worker. Lease 30 seconds; monotonic fencing; at
  most four attempts; transient delays 1/5/15 minutes. Manual retry below exhaustion
  preserves attempts/root/policy. No fifth worker attempt or reset of history.
  A committed NEEDS_INFORMATION generation requires the existing explicit Billing
  recompute contract, not a fresh hidden generation on retry.
- Outbox notification effects and DONE share one database transaction. Existing
  R3 `ScheduleChanged` events map to SCHEDULE_CHANGED. Notifications recheck live
  recipient/resource authority on every inbox/read action. ASSIGNMENT_PUBLISHED
  is a consumer connection point; R5 publication is not implemented here.
- Audit/decision/attempt/receipt history is immutable. The 24-month baseline is
  protected by denying deletion entirely; there is no automatic purge or TTL for
  financial receipts. Advanced retention/archive/restore operations need review.

Representative routes live in `RuntimeController`. This is not full R2/R3 CRUD.
Role assignment uses an explicit append POST plus revoke POST; a bulk PUT
replacement editor is not provided. New job enqueue and wallet read routes are
minimal runtime adapters to existing command/read boundaries. All new files and
these API additions require owner review before Git or deployment.

References for implementation APIs: [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoargon2algorithm-parameters-callback),
[Nodemailer SMTP](https://nodemailer.com/smtp).
