# R4 verification and runtime

Local review material. No deployment, production data adoption or real email
delivery is certified by this harness. Node **24.12+ in the Node 24 line** is
required for the built-in asynchronous Argon2id implementation.

## Verification

From the repository root, with an installed local Docker Engine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r4/start-r4-native.ps1 -RunTests
```

The runner creates a unique PostgreSQL 16 cluster, database and anonymous volume,
admits only a fresh literal-loopback target, generates passwords in memory,
applies all migrations using Prisma migrate deploy, and creates separate
restricted AUTH/API/WORKER/OPERATOR LOGINs. It never reuses, drops or resets
another database. Containers and volumes are retained for inspection.

For a focused rerun, append `-TestFilter 'C06|X13'`. The harness invokes Node
directly for this case so regex metacharacters never pass through `pnpm.cmd`.
Filtered skips are not full-suite evidence. Each rerun still uses a new cluster.

`test:r4:native` requires `R4_TEST_URL` and the explicit
`R4_TEST_DISPOSABLE=I_OWN_THIS_DISPOSABLE_CLUSTER` admission. Never set these for a
shared database. It does not fall back to `DATABASE_URL`. Evidence JSON and
sanitized environment metadata are written to the OS temporary directory.

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
password recovery configuration**. SMTP uses authenticated TLS on 465 or required
STARTTLS on 587, certificate validation, bounded timeouts, no debug logging,
attachments, filesystem content or URL content. Actual delivery must be verified
separately with authorized credentials. No SMTP send was performed in this task.
Delivery starts after OTP persistence without delaying the generic response, so
SMTP latency does not identify eligible emails. It is best effort; a restart
during delivery may require an explicit resend after the throttle window.

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
