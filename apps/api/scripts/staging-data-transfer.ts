/** One-time operator tool. Never imported by the API or given a runtime URL.
 * Owner-authorized demo writes require an exact sanitized plan and successful isolated rehearsal. */
import postgres from 'postgres';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootCertificates } from 'node:tls';

export const RENDER_HOST =
  'dpg-dbi6s46i0phs73d1e29g-a.singapore-postgres.render.com';
export const RENDER_DB = 'educore_staging_k80x';
export const EXCLUDE = new Set([
  '_prisma_migrations',
  'credentials',
  'auth_sessions',
  'refresh_token_history',
  'password_reset_otps',
  'r2_principal_bindings',
  'auth_throttles',
  'transaction_principals',
  'worker_context',
  'recovery_otp_deliveries',
  'effect_permits',
]);
const MAGIC = Buffer.from('ECTRANSFER1');
export const sha = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
export function fail(code: string): never {
  throw Error(code);
}
type Row = Record<string, unknown>;
export type Entry = {
  table: string;
  key: string;
  tenant: string | null;
  decision: 'INCLUDE' | 'EXCLUDE' | 'HOLD';
  reasons: string[];
};
export type PayloadRow = { table: string; key: string; json: string };
export type Policy = {
  sourceDigest: string;
  approvedBy: string;
  syntheticTenantIds: string[];
  syntheticUserIds: string[];
};
export type Snapshot = {
  database: string;
  version: string;
  tables: { name: string; count: string; digest: string }[];
  schema: Record<string, Row[]>;
  roles: Row[];
  memberships: Row[];
  digest: string;
};
export const qi = (s: string) => '"' + s.replaceAll('"', '""') + '"';

/** Normalize associative Boolean grouping only. Never discard arbitrary parentheses or mix AND/OR. */
export function canonicalCheck(def: string): string {
  if (!def.startsWith('CHECK (')) return def;
  const parse = (input: string): unknown => {
    let s = input.trim();
    const scan = (text: string) => {
      let depth = 0,
        quote = '';
      const positions: { at: number; op: string }[] = [];
      let outerEnd = -1;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) {
          if (c === quote) {
            if (text[i + 1] === quote) i++;
            else quote = '';
          }
          continue;
        }
        if (c === "'" || c === '"') {
          quote = c;
          continue;
        }
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0 && outerEnd < 0) outerEnd = i;
        }
        if (depth === 0) {
          for (const op of ['OR', 'AND'])
            if (
              text.slice(i, i + op.length) === op &&
              !/[A-Za-z_]/.test(text[i - 1] ?? '') &&
              !/[A-Za-z_]/.test(text[i + op.length] ?? '')
            )
              positions.push({ at: i, op });
        }
      }
      return { positions, outerEnd };
    };
    while (s.startsWith('(') && scan(s).outerEnd === s.length - 1)
      s = s.slice(1, -1).trim();
    const { positions } = scan(s);
    for (const op of ['OR', 'AND']) {
      const p = positions.filter((x) => x.op === op);
      if (!p.length) continue;
      const chunks: unknown[] = [];
      let start = 0;
      for (const x of p) {
        chunks.push(parse(s.slice(start, x.at)));
        start = x.at + op.length;
      }
      chunks.push(parse(s.slice(start)));
      return [
        op,
        ...chunks.flatMap((c) =>
          Array.isArray(c) && c[0] === op ? c.slice(1) : [c],
        ),
      ];
    }
    return s;
  };
  return JSON.stringify(parse(def.slice(6)));
}
export function comparableSchema(schema: Record<string, Row[]>) {
  return Object.fromEntries(
    Object.entries(schema).map(([category, rows]) => [
      category,
      rows
        .map((r) => {
          const value = { ...r };
          if (category === 'constraints' && typeof value.def === 'string')
            value.def = canonicalCheck(value.def);
          if (category === 'owners' && value.acl === null) {
            const owner =
              typeof value.owner === 'string'
                ? value.owner
                : fail('INVALID_OWNER_METADATA');
            value.acl = `{${owner}=arwdDxt/${owner}}`;
          }
          return value;
        })
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]),
  );
}

export function connection(
  raw: string,
  kind: 'source' | 'render' | 'isolated',
  sourceDb?: string,
) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return fail('INVALID_DATABASE_IDENTITY');
  }
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    u.hash ||
    !u.username ||
    !u.password
  )
    return fail('INVALID_DATABASE_IDENTITY');
  if (kind === 'render') {
    if (
      u.hostname !== RENDER_HOST ||
      decodeURIComponent(u.pathname) !== '/' + RENDER_DB ||
      (u.port && u.port !== '5432') ||
      [...u.searchParams].some(
        ([k, v]) => k !== 'sslmode' || !['require', 'verify-full'].includes(v),
      )
    )
      fail('TARGET_NOT_ALLOWLISTED');
  } else {
    if (
      u.hostname !== '127.0.0.1' ||
      u.search ||
      (kind === 'source'
        ? decodeURIComponent(u.pathname) !== '/' + sourceDb
        : !/^\/educore_transfer_[a-f0-9]{12}_(source|target|probe)$/.test(
            u.pathname,
          ))
    )
      fail('TARGET_NOT_ALLOWLISTED');
  }
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    database: decodeURIComponent(u.pathname.slice(1)),
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: kind === 'render' ? { rejectUnauthorized: true } : (false as false),
  };
}
export function encrypt(bytes: Buffer, key: Buffer) {
  if (key.length !== 32) fail('PRIVATE_KEY_REQUIRED');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}
export function decrypt(bytes: Buffer, key: Buffer) {
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC) || key.length !== 32)
    fail('INVALID_PRIVATE_ARCHIVE');
  try {
    const n = MAGIC.length,
      decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        bytes.subarray(n, n + 12),
      );
    decipher.setAuthTag(bytes.subarray(n + 12, n + 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(n + 28)),
      decipher.final(),
    ]);
  } catch {
    return fail('PRIVATE_ARCHIVE_AUTHENTICATION_FAILED');
  }
}
function client(options: ReturnType<typeof connection>, readonly = true) {
  return postgres({
    ...options,
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 3,
    onnotice: () => {},
    connection: {
      application_name: 'educore_staging_transfer',
      default_transaction_read_only: readonly,
      statement_timeout: 120000,
      lock_timeout: 3000,
    },
  });
}
const SCHEMA: Record<string, string> = {
  columns: `SELECT n.nspname s,c.relname t,a.attname n,a.attnum o,format_type(a.atttypid,a.atttypmod) ty,a.attnotnull nn,
    a.attidentity ident,a.attgenerated gen,pg_get_expr(d.adbin,d.adrelid) def,a.attcollation::regcollation::text coll
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE (n.nspname='public' OR n.nspname LIKE 'educore%') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,4`,
  constraints: `SELECT n.nspname s,c.relname t,x.conname n,x.contype ty,x.convalidated valid,x.condeferrable deferrable,x.condeferred deferred,pg_get_constraintdef(x.oid) def
    FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' OR n.nspname LIKE 'educore%' ORDER BY 1,2,3`,
  indexes: `SELECT schemaname s,tablename t,indexname n,indexdef def FROM pg_indexes WHERE schemaname='public' OR schemaname LIKE 'educore%' ORDER BY 1,2,3`,
  triggers: `SELECT n.nspname s,c.relname t,regexp_replace(tg.tgname,'_[0-9]+$','_OID') n,tg.tgenabled enabled,
    regexp_replace(pg_get_triggerdef(tg.oid),'RI_ConstraintTrigger_[a-z]+_[0-9]+','RI_ConstraintTrigger_X_OID','g') def
    FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' OR n.nspname LIKE 'educore%' ORDER BY 1,2,3`,
  functions: `SELECT n.nspname s,p.proname n,pg_get_function_identity_arguments(p.oid) args,pg_get_userbyid(p.proowner) owner,
    p.prosecdef sd,p.proconfig config,p.proacl::text acl,pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname LIKE 'educore%' AND p.prokind='f' ORDER BY 1,2,3`,
  enums: `SELECT n.nspname s,t.typname n,e.enumsortorder o,e.enumlabel label FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' OR n.nspname LIKE 'educore%' ORDER BY 1,2,3`,
  owners: `SELECT n.nspname s,c.relname t,pg_get_userbyid(c.relowner) owner,c.relacl::text acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='public' OR n.nspname LIKE 'educore%') AND c.relkind IN ('r','p') ORDER BY 1,2`,
};
export async function snapshot(tx: postgres.TransactionSql): Promise<Snapshot> {
  await tx`SET LOCAL TIME ZONE 'UTC'`;
  const [identity] =
    await tx`SELECT current_database() database,current_setting('server_version_num') version,
    current_setting('transaction_read_only') ro,current_setting('default_transaction_read_only') dro`;
  if (
    identity.ro !== 'on' ||
    identity.dro !== 'on' ||
    Number(identity.version) < 160000 ||
    Number(identity.version) >= 170000
  )
    fail('PG16_READ_ONLY_REQUIRED');
  const tables =
    await tx`SELECT n.nspname s,c.relname n,c.relrowsecurity rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='public' OR n.nspname LIKE 'educore%') AND c.relkind IN ('r','p') ORDER BY 1,2`;
  if (tables.some((t) => t.rls)) fail('RLS_BACKUP_COVERAGE_REQUIRES_REVIEW');
  const inventory = [];
  for (const t of tables) {
    const rows = await tx.unsafe(
      `SELECT md5(to_jsonb(r)::text) h FROM ${qi(t.s)}.${qi(t.n)} r ORDER BY 1`,
    );
    inventory.push({
      name: t.s + '.' + t.n,
      count: String(rows.length),
      digest: sha(JSON.stringify(rows.map((r) => r.h))),
    });
  }
  const schema: Record<string, Row[]> = {};
  for (const [k, q] of Object.entries(SCHEMA)) {
    schema[k] = JSON.parse(
      JSON.stringify(await tx.unsafe(q)).replaceAll('\\r\\n', '\\n'),
    ) as Row[];
    // Constraint-trigger names contain OIDs; equal normalized names need a stable definition tie-breaker.
    schema[k].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  }
  const roles =
    await tx`SELECT rolname name,rolcanlogin login,rolcreatedb createdb,rolcreaterole createrole,rolinherit inherit FROM pg_roles
    WHERE rolname LIKE 'educore%' OR rolname LIKE 'local_%' ORDER BY 1`;
  const memberships =
    await tx`SELECT r.rolname role,m.rolname member,bool_or(a.admin_option) admin FROM pg_auth_members a
    JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member WHERE r.rolname LIKE 'educore%' AND (m.rolname LIKE 'educore%' OR m.rolname LIKE 'local_%') GROUP BY 1,2 ORDER BY 1,2`;
  const value = {
    database: String(identity.database),
    version: String(identity.version),
    tables: inventory,
    schema,
    roles: [...roles],
    memberships: [...memberships],
  };
  return { ...value, digest: sha(JSON.stringify(value)) };
}
export function planRows(
  rows: PayloadRow[],
  sourceDigest: string,
  policy?: Policy,
): Entry[] {
  const approved =
    policy?.sourceDigest === sourceDigest &&
    !!policy.approvedBy?.trim() &&
    Array.isArray(policy.syntheticTenantIds) &&
    Array.isArray(policy.syntheticUserIds) &&
    [...policy.syntheticTenantIds, ...policy.syntheticUserIds].every(
      (x) => typeof x === 'string' && x.length > 0,
    );
  return rows.map((row) => {
    const table = row.table.split('.').at(-1)!,
      data = JSON.parse(row.json) as Record<string, unknown>,
      tenant =
        typeof data.tenant_id === 'string'
          ? data.tenant_id
          : table === 'tenants'
            ? String(data.id)
            : null;
    const entry: Entry = {
      table: row.table,
      key: row.key,
      tenant,
      decision: 'INCLUDE',
      reasons: [],
    };
    if (EXCLUDE.has(table)) {
      entry.decision = 'EXCLUDE';
      entry.reasons = ['AUTH_RUNTIME_OR_MIGRATION_METADATA'];
      return entry;
    }
    if (
      [
        'submissions',
        'submission_versions',
        'grades',
        'submission_files',
        'billing_run_generations',
      ].includes(table)
    )
      entry.reasons.push('HISTORICAL_GUARD_OR_CYCLE_REQUIRES_REVIEW');
    if (tenant && (!approved || !policy!.syntheticTenantIds.includes(tenant)))
      entry.reasons.push('SYNTHETIC_TENANT_NOT_ATTESTED');
    if (
      table === 'users' &&
      (!approved || !policy!.syntheticUserIds.includes(String(data.id)))
    )
      entry.reasons.push('SYNTHETIC_USER_NOT_ATTESTED');
    if (table === 'audit_logs')
      entry.reasons.push('AUDIT_INSERT_REDACTION_REQUIRES_VERIFICATION');
    if (table === 'stored_files')
      entry.reasons.push('PERSISTENT_FILE_STORAGE_NOT_APPROVED');
    if (entry.reasons.length) entry.decision = 'HOLD';
    return entry;
  });
}
export function orderGraph(nodes: string[], edges: [string, string][]) {
  const remaining = new Set(nodes),
    order: string[] = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter((n) => !edges.some(([a, b]) => a === n && remaining.has(b)))
      .sort();
    if (!ready.length) fail('NONDEFERRABLE_OR_GUARDED_CYCLE');
    for (const n of ready) {
      remaining.delete(n);
      order.push(n);
    }
  }
  return order;
}
export function requireImportTarget(
  raw: string,
  gate?: { scope: string; plan: string; rehearsed: string },
) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return fail('INVALID_DATABASE_IDENTITY');
  }
  if (u.hostname !== '127.0.0.1') {
    if (
      gate?.scope !== 'OWNER_APPROVED_DEMO_20261030' ||
      !/^[a-f0-9]{64}$/.test(gate.plan) ||
      gate.plan !== gate.rehearsed
    )
      fail('RENDER_IMPORT_NOT_APPROVED');
    return connection(raw, 'render');
  }
  return connection(raw, 'isolated');
}
export function credentialPlan(
  userId: string,
  tenantId: string,
  policy: Policy,
  snapshotDigest: string,
) {
  if (
    policy.sourceDigest !== snapshotDigest ||
    !policy.approvedBy?.trim() ||
    !policy.syntheticTenantIds.includes(tenantId) ||
    !policy.syntheticUserIds.includes(userId)
  )
    fail('CREDENTIAL_PROVISIONING_REVIEW_REQUIRED');
  return {
    userId,
    tenantId,
    hashFunction: 'apps/api/src/identity-access/crypto.ts:passwordHash',
    algorithm: 'Argon2id',
    state: 'DESIGN_ONLY_NO_CREDENTIAL_WRITTEN',
    requires: [
      'operator permission review',
      'fresh hidden secret',
      'atomic credential + operator audit',
      'no existing credential',
      'no local sessions',
      'no auth endpoint change',
    ],
  };
}

async function main() {
  const root = resolve(fileURLToPath(new URL('../../..', import.meta.url))),
    mode = process.argv[2];
  if (
    ![
      'backup',
      'audit',
      'dry-run',
      'rehearsal',
      'verify',
      'import',
      'demo-plan',
      'demo-rehearsal',
      'demo-verify',
    ].includes(mode)
  )
    fail('INVALID_MODE');
  const dir = resolve(process.env.EDUCORE_TRANSFER_ROOT ?? '');
  const localRoot = join(root, '.local/staging-transfer');
  if (
    !relative(localRoot, dir) ||
    relative(localRoot, dir).startsWith('..') ||
    isAbsolute(relative(localRoot, dir))
  )
    fail('PRIVATE_ROOT_REQUIRED');
  for (let p = dir; p !== root; p = resolve(p, '..'))
    if (lstatSync(p).isSymbolicLink()) fail('PRIVATE_ROOT_SYMLINK_DENIED');
  const key = Buffer.from(process.env.EDUCORE_TRANSFER_KEY ?? '', 'base64');
  if (key.length !== 32) fail('PRIVATE_KEY_REQUIRED');
  const save = (name: string, value: unknown) =>
    writeFileSync(join(dir, name), JSON.stringify(value, null, 2), {
      flag: 'wx',
    });
  const seal = (name: string, data: Buffer) =>
    writeFileSync(join(dir, name), encrypt(data, key), { flag: 'wx' });
  const open = (name: string) => decrypt(readFileSync(join(dir, name)), key);
  const read = <T>(name: string): T =>
    JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
  const cfg = JSON.parse(
    readFileSync(join(root, '.local/config.json'), 'utf8'),
  );
  const context = String(cfg.context),
    dockerArgs = ['--context', context];
  function docker(args: string[], input?: Buffer, env: NodeJS.ProcessEnv = {}) {
    const result = spawnSync('docker', [...dockerArgs, ...args], {
      input,
      encoding: null,
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true,
      timeout: 180000,
      env: { ...process.env, ...env },
    });
    if (result.status !== 0) {
      const msg = result.stderr?.toString() ?? '';
      const reason = /must be (?:a )?member of role/.test(msg)
        ? 'ROLE_MEMBERSHIP'
        : /permission denied|must be owner/.test(msg)
          ? 'PERMISSION'
          : /already exists/.test(msg)
            ? 'OBJECT_EXISTS'
            : /password authentication failed|no password supplied/.test(msg)
              ? 'AUTHENTICATION'
              : /snapshot/.test(msg)
                ? 'SNAPSHOT'
                : /certificate|SSL/.test(msg)
                  ? 'TLS'
                  : /unrecognized option/.test(msg)
                    ? 'CLIENT_OPTION'
                    : 'PROCESS';
      const stage = args.includes('pg_dump')
        ? 'DUMP'
        : args.includes('pg_restore')
          ? 'RESTORE'
          : args.includes('psql')
            ? 'PSQL'
            : 'DOCKER';
      seal('failure-' + randomUUID() + '.enc', Buffer.from(msg));
      throw Error('POSTGRES_' + stage + '_' + reason + '_FAILED');
    }
    return result.stdout;
  }
  const sourceUrl = `postgresql://local_admin:${encodeURIComponent(process.env.EDUCORE_TRANSFER_SOURCE_PASSWORD ?? '')}@127.0.0.1:${cfg.pgPort}/${cfg.database}`;
  const source = () => connection(sourceUrl, 'source', cfg.database);
  const render = () =>
    connection(
      readFileSync(
        process.env.EDUCORE_TRANSFER_TARGET_SECRET_PATH ?? '',
        'utf8',
      ).trim(),
      'render',
    );
  const sqlRead = async <T>(
    opts: ReturnType<typeof connection>,
    action: (tx: postgres.TransactionSql) => Promise<T>,
  ) => {
    const sql = client(opts);
    try {
      return await sql.begin(
        'isolation level repeatable read read only',
        action,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
  if (mode === 'import' || mode.startsWith('demo-')) {
    const { runDemo } = await import('./staging-demo-live.ts');
    await runDemo({ mode, root, dir, key, config: cfg });
    return;
  }
  if (mode === 'backup') {
    if (existsSync(join(dir, 'backups.json')))
      fail('BACKUPS_ALREADY_EXIST_NO_AUTOMATIC_RERUN');
    const receipts = [];
    for (const [label, opts] of [
      ['source', source()],
      ['target', render()],
    ] as const) {
      if (existsSync(join(dir, label + '.backup-receipt.json'))) {
        if (process.env.EDUCORE_TRANSFER_RESUME !== '1')
          fail('PARTIAL_BACKUP_REQUIRES_EXPLICIT_RESUME');
        const previous = read<{ label: string; sha256: string; bytes: number }>(
          label + '.backup-receipt.json',
        );
        if (sha(open(label + '.dump.enc')) !== previous.sha256)
          fail('PARTIAL_BACKUP_HASH_MISMATCH');
        receipts.push(previous);
        continue;
      }
      const result = await sqlRead(opts, async (tx) => {
        const before = await snapshot(tx),
          [snap] = await tx`SELECT pg_export_snapshot() id`;
        if (label === 'target')
          docker(
            [
              'exec',
              '-i',
              cfg.container,
              'sh',
              '-c',
              'cat > /tmp/educore-transfer-public-ca.pem',
            ],
            Buffer.from(rootCertificates.join('\n')),
          );
        const env = {
          PGHOST: label === 'source' ? '127.0.0.1' : opts.host,
          PGPORT: '5432',
          PGDATABASE: opts.database,
          PGUSER: opts.username,
          PGPASSWORD: opts.password,
          PGSSLMODE: label === 'source' ? 'disable' : 'verify-full',
          PGSSLROOTCERT: '/tmp/educore-transfer-public-ca.pem',
          PGOPTIONS:
            '-c default_transaction_read_only=on -c statement_timeout=120000',
        };
        const envArgs = Object.keys(env).flatMap((k) => ['--env', k]);
        const bytes = docker(
          [
            'exec',
            '-i',
            ...envArgs,
            cfg.container,
            'pg_dump',
            '--format=custom',
            '--enable-row-security',
            '--snapshot=' + snap.id,
          ],
          undefined,
          env,
        );
        const list = docker(
          ['exec', '-i', cfg.container, 'pg_restore', '--list'],
          bytes,
        ).toString('utf8');
        if (
          !list.includes('TABLE DATA') ||
          !bytes.subarray(0, 5).equals(Buffer.from('PGDMP'))
        )
          fail('INVALID_CUSTOM_BACKUP');
        seal(label + '.dump.enc', bytes);
        seal(label + '.snapshot.enc', Buffer.from(JSON.stringify(before)));
        if (label === 'source') {
          const rows: PayloadRow[] = [];
          for (const t of before.tables) {
            const table = t.name.split('.').at(-1)!;
            if (EXCLUDE.has(table)) continue;
            const data = await tx.unsafe(
              `SELECT to_jsonb(r)::text json FROM ${t.name.split('.').map(qi).join('.')} r`,
            );
            for (const row of data) {
              const parsed = JSON.parse(row.json);
              rows.push({
                table: t.name,
                key: String(parsed.id ?? sha(row.json)),
                json: row.json,
              });
            }
          }
          seal('payload.enc', Buffer.from(JSON.stringify(rows)));
        }
        return {
          label,
          database: opts.database,
          sha256: sha(bytes),
          bytes: bytes.length,
          snapshotDigest: before.digest,
          tableCounts: before.tables.map((t) => ({
            table: t.name,
            count: t.count,
          })),
          snapshotConsistent: true,
          archiveListVerified: true,
          sourceVersion: before.version,
          encrypted: true,
        };
      });
      receipts.push(result);
      save(label + '.backup-receipt.json', result);
    }
    save('backups.json', receipts);
    console.log(
      JSON.stringify({
        mode,
        status: 'BACKED_UP_NOT_RESTORE_VERIFIED',
        receipts: receipts.map((r) => ({
          label: r.label,
          bytes: r.bytes,
          sha256: r.sha256,
        })),
      }),
    );
    return;
  }
  if (mode === 'audit' || mode === 'dry-run') {
    const backup = JSON.parse(
        open('source.snapshot.enc').toString(),
      ) as Snapshot,
      rows = JSON.parse(open('payload.enc').toString()) as PayloadRow[];
    if (mode === 'audit') {
      const archives = ['source', 'target'].map((label) => {
        const receipt = read<{ sha256: string; snapshotDigest: string }>(
          label + '.backup-receipt.json',
        );
        const stored = JSON.parse(
          open(label + '.snapshot.enc').toString(),
        ) as Snapshot;
        if (
          sha(open(label + '.dump.enc')) !== receipt.sha256 ||
          stored.digest !== receipt.snapshotDigest
        )
          fail('BACKUP_AUDIT_FAILED');
        return {
          label,
          database: stored.database,
          tables: stored.tables.length,
          snapshotDigest: stored.digest,
        };
      });
      console.log(
        JSON.stringify({
          mode,
          status: 'BACKUP_SNAPSHOT_INVENTORY_NOT_LIVE_REAUDIT',
          archives,
          sourceDigest: backup.digest,
          tables: backup.tables.map((t) => ({ table: t.name, count: t.count })),
        }),
      );
      return;
    }
    const policy = process.env.EDUCORE_TRANSFER_POLICY
      ? read<Policy>(process.env.EDUCORE_TRANSFER_POLICY)
      : undefined;
    const entries = planRows(rows, backup.digest, policy),
      manifest = {
        version: 1,
        sourceDigest: backup.digest,
        createdAt: new Date().toISOString(),
        entries,
        excluded: backup.tables.filter((t) =>
          EXCLUDE.has(t.name.split('.').at(-1)!),
        ),
        status: entries.some((e) => e.decision === 'HOLD')
          ? 'BLOCKED_HOLD'
          : 'READY_FOR_ISOLATED_REHEARSAL_ONLY',
      };
    const path = join(dir, 'manifest.json');
    if (existsSync(path)) fail('MANIFEST_EXISTS_REVIEW_BEFORE_REPLANNING');
    save('manifest.json', manifest);
    console.log(
      JSON.stringify({
        mode,
        status: manifest.status,
        include: entries.filter((e) => e.decision === 'INCLUDE').length,
        hold: entries.filter((e) => e.decision === 'HOLD').length,
        excludedRows: manifest.excluded.reduce(
          (n, t) => n + Number(t.count),
          0,
        ),
      }),
    );
    return;
  }
  // Restore/rehearsal is restricted to a newly created labelled local cluster.
  if (mode === 'rehearsal') {
    if (existsSync(join(dir, 'isolated.json')))
      fail('ISOLATED_RUN_EXISTS_NO_AUTOMATIC_REPLAY');
    const id = randomUUID().replaceAll('-', '').slice(0, 12),
      name = 'educore-transfer-' + id,
      maint = 'transfer_maint',
      maintPass = randomBytes(32).toString('hex');
    const bootstrapPassword = randomBytes(32).toString('hex');
    docker(
      [
        'run',
        '--detach',
        '--name',
        name,
        '--label',
        'educore.transfer=' + id,
        '--publish',
        '127.0.0.1::5432',
        '--env',
        'POSTGRES_PASSWORD',
        '--env',
        'POSTGRES_USER=postgres',
        '--env',
        'POSTGRES_DB=postgres',
        'postgres:16',
      ],
      undefined,
      { POSTGRES_PASSWORD: bootstrapPassword },
    );
    const inspect = JSON.parse(
      docker(['inspect', '--format', '{{json .}}', name]).toString(),
    );
    const bindings = inspect.HostConfig.PortBindings['5432/tcp'];
    if (
      inspect.Config.Labels['educore.transfer'] !== id ||
      bindings.length !== 1 ||
      bindings[0].HostIp !== '127.0.0.1'
    )
      fail('ISOLATED_IDENTITY_FAILED');
    const port = Number(
      JSON.parse(
        docker([
          'inspect',
          '--format',
          '{{json .NetworkSettings.Ports}}',
          name,
        ]).toString(),
      )['5432/tcp'][0].HostPort,
    );
    const base = {
      host: '127.0.0.1',
      port,
      database: 'postgres',
      username: maint,
      password: maintPass,
      ssl: false as false,
    };
    const isolated = {
      id,
      name,
      containerId: inspect.Id,
      port,
      maint,
      databases: {
        source: 'educore_transfer_' + id + '_source',
        target: 'educore_transfer_' + id + '_target',
      },
    };
    save('isolated.json', isolated);
    seal(
      'isolated-secret.enc',
      Buffer.from(JSON.stringify({ maintPass, logins: {} })),
    );
    let ready = false;
    for (let n = 0; n < 80; n++) {
      const probe = spawnSync(
        'docker',
        [
          ...dockerArgs,
          'exec',
          name,
          'pg_isready',
          '-q',
          '-h',
          '127.0.0.1',
          '-U',
          'postgres',
        ],
        { windowsHide: true },
      );
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) fail('ISOLATED_SERVER_NOT_READY');
    // Bootstrap superuser creates infrastructure only; all schema/data restore and probes use the non-super maint LOGIN.
    docker(
      [
        'exec',
        '-i',
        name,
        'psql',
        '-X',
        '-q',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      Buffer.from(
        `CREATE ROLE ${maint} LOGIN NOSUPERUSER NOBYPASSRLS CREATEDB CREATEROLE INHERIT PASSWORD '${maintPass}';`,
      ),
    );
    const admin = client(base, false);
    const logins: Record<string, string> = {};
    try {
      const [attribute] =
        await admin`SELECT NOT rolsuper AND NOT rolbypassrls safe FROM pg_roles WHERE rolname=session_user`;
      if (!attribute.safe) fail('NON_SUPERUSER_RESTORE_REQUIRED');
      const snaps = ['source', 'target'].map(
        (label) =>
          JSON.parse(open(label + '.snapshot.enc').toString()) as Snapshot,
      );
      const roles = new Map<string, Row>();
      for (const s of snaps)
        for (const role of s.roles) roles.set(String(role.name), role);
      for (const [role, r] of roles) {
        if (!/^(educore[a-z0-9_]*|local_[a-z0-9_]+)$/.test(role))
          fail('UNEXPECTED_ROLE_IN_BACKUP');
        const pass = randomBytes(32).toString('hex');
        if (r.login) logins[role] = pass;
        await admin.unsafe(
          `CREATE ROLE ${qi(role)} ${r.login ? 'LOGIN' : 'NOLOGIN'} NOSUPERUSER NOBYPASSRLS ${r.createdb ? 'CREATEDB' : 'NOCREATEDB'} ${r.createrole ? 'CREATEROLE' : 'NOCREATEROLE'} ${r.inherit ? 'INHERIT' : 'NOINHERIT'}${r.login ? ` PASSWORD '${pass}'` : ''}`,
        );
        await admin.unsafe(`GRANT ${qi(role)} TO ${qi(maint)}`);
      }
      for (const s of snaps)
        for (const m of s.memberships)
          await admin.unsafe(
            `GRANT ${qi(String(m.role))} TO ${qi(String(m.member))}${m.admin ? ' WITH ADMIN OPTION' : ''}`,
          );
      const restoreEvidence = [];
      for (const label of ['source', 'target'] as const) {
        const before = snaps[label === 'source' ? 0 : 1];
        // Match the source database-owner context instead of granting extra public CREATE privileges.
        const ownerValue = before.schema.owners.find(
          (r) => r.s === 'public' && r.t === 'tenants',
        )?.owner;
        if (typeof ownerValue !== 'string') fail('INVALID_OWNER_METADATA');
        const owner = ownerValue;
        if (!roles.has(owner))
          fail('RESTORE_DATABASE_OWNER_NOT_IN_REVIEWED_ROLES');
        const db = isolated.databases[label];
        await admin.unsafe(
          `CREATE DATABASE ${qi(db)} OWNER ${qi(owner)} TEMPLATE template0`,
        );
        const bytes = open(label + '.dump.enc');
        const receipt = read<{ sha256: string }>(
          label + '.backup-receipt.json',
        );
        if (sha(bytes) !== receipt.sha256) fail('BACKUP_HASH_MISMATCH');
        const list = docker(
          ['exec', '-i', name, 'pg_restore', '--list'],
          bytes,
        ).toString();
        // Provider default privileges owned by postgres are cluster infrastructure, not application objects.
        // They are not recreated under superuser or by granting postgres to the restore LOGIN.
        const omitted = list
          .split('\n')
          .filter(
            (l) =>
              /^\d+;/.test(l) &&
              / DEFAULT ACL /.test(l) &&
              / postgres\s*$/.test(l),
          );
        const filtered = list
          .split('\n')
          .filter((l) => !omitted.includes(l))
          .join('\n');
        docker(
          ['exec', '-i', name, 'sh', '-c', 'cat > /tmp/educore-restore.list'],
          Buffer.from(filtered),
        );
        const env = {
          PGPASSWORD: maintPass,
          PGUSER: maint,
          PGDATABASE: db,
          PGHOST: '127.0.0.1',
        };
        docker(
          [
            'exec',
            '-i',
            ...Object.keys(env).flatMap((k) => ['--env', k]),
            name,
            'pg_restore',
            '--dbname',
            db,
            '--use-list=/tmp/educore-restore.list',
            '--single-transaction',
            '--exit-on-error',
          ],
          bytes,
          env,
        );
        const after = await sqlRead({ ...base, database: db }, snapshot);
        const dataEqual =
            JSON.stringify(before.tables) === JSON.stringify(after.tables),
          schemaEqual =
            JSON.stringify(comparableSchema(before.schema)) ===
            JSON.stringify(comparableSchema(after.schema));
        restoreEvidence.push({
          label,
          database: db,
          nonSuperuser: true,
          dataEqual,
          schemaEqual,
          tables: after.tables.length,
          providerDefaultAclEntriesOmitted: omitted.length,
        });
        if (!dataEqual || !schemaEqual)
          fail('RESTORED_DATA_OR_APPLICATION_SCHEMA_MISMATCH');
      }
      seal(
        'isolated-secret-final.enc',
        Buffer.from(JSON.stringify({ maintPass, logins })),
      );
      save('restore-evidence.json', restoreEvidence);
      const manifest = read<{ entries: Entry[] }>('manifest.json');
      const holds = manifest.entries.filter((e) => e.decision === 'HOLD');
      save('rehearsal.json', {
        status: holds.length
          ? 'BLOCKED_HOLD_AND_HISTORICAL_GUARDS'
          : 'NOT_IMPORTED_REQUIRES_APPROVED_EXECUTION_PLAN',
        holds: holds.length,
        restoreEvidence,
        importAttempted: false,
        renderWrites: false,
        blockers: [
          'R5 version_guard rewrites submitted_at using clock_timestamp',
          'PII provenance requires explicit attestation',
          'reviewed least-privilege import/credential capability not present',
        ],
      });
      console.log(
        JSON.stringify({
          mode,
          status: 'RESTORE_VERIFIED_REHEARSAL_IMPORT_BLOCKED',
          restoreEvidence,
          holds: holds.length,
        }),
      );
    } finally {
      await admin.end({ timeout: 5 });
    }
    return;
  }
  if (mode === 'verify') {
    const i = read<{
      id: string;
      name: string;
      containerId: string;
      port: number;
      maint: string;
      databases: { source: string; target: string };
    }>('isolated.json');
    const inspect = JSON.parse(
      docker(['inspect', '--format', '{{json .}}', i.name]).toString(),
    );
    if (
      inspect.Id !== i.containerId ||
      inspect.Config.Labels['educore.transfer'] !== i.id
    )
      fail('ISOLATED_IDENTITY_FAILED');
    if (!inspect.State.Running)
      fail('ISOLATED_CLUSTER_MUST_BE_STARTED_FOR_VERIFY');
    const activePorts = inspect.NetworkSettings.Ports['5432/tcp'];
    if (activePorts.length !== 1 || activePorts[0].HostIp !== '127.0.0.1')
      fail('ISOLATED_LOOPBACK_REQUIRED');
    i.port = Number(activePorts[0].HostPort);
    const secret = JSON.parse(open('isolated-secret-final.enc').toString());
    if (process.env.EDUCORE_TRANSFER_FOCUSED_TESTS === '1') {
      const url = (user: string, password: string, db: string) =>
        `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${i.port}/${db}`;
      const run = spawnSync(
        process.execPath,
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          'test/staging-data-transfer.spec.ts',
          'test/staging-data-transfer.postgres.spec.ts',
          '--reporter=json',
        ],
        {
          cwd: join(root, 'apps/api'),
          encoding: 'utf8',
          windowsHide: true,
          timeout: 120000,
          env: {
            ...process.env,
            EDUCORE_TRANSFER_TEST_URL: url(
              i.maint,
              secret.maintPass,
              i.databases.target,
            ),
            EDUCORE_TRANSFER_TEST_SOURCE_URL: url(
              i.maint,
              secret.maintPass,
              i.databases.source,
            ),
            EDUCORE_TRANSFER_TEST_AUTH_URL: url(
              'educore_auth_login',
              secret.logins.educore_auth_login,
              i.databases.target,
            ),
            EDUCORE_TRANSFER_TEST_API_URL: url(
              'educore_api_login',
              secret.logins.educore_api_login,
              i.databases.target,
            ),
            EDUCORE_TRANSFER_TEST_DISPOSABLE:
              'I_OWN_THIS_ISOLATED_TRANSFER_DATABASE',
          },
        },
      );
      let results: {
        numPassedTests: number;
        numFailedTests: number;
        numPendingTests: number;
      };
      try {
        results = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
      } catch {
        fail('FOCUSED_TEST_RUNNER_FAILED_DETAILS_REDACTED');
      }
      const evidence = {
        passed: results.numPassedTests,
        failed: results.numFailedTests,
        skipped: results.numPendingTests,
        exitCode: run.status,
      };
      save('focused-tests-' + randomUUID() + '.json', evidence);
      console.log(JSON.stringify({ focusedTests: evidence }));
      if (
        run.status !== 0 ||
        evidence.failed ||
        evidence.skipped ||
        evidence.passed !== 11
      )
        fail('FOCUSED_TESTS_NOT_COMPLETE');
    }
    const evidence = [];
    for (const label of ['source', 'target'] as const) {
      const url = `postgresql://${i.maint}:${encodeURIComponent(secret.maintPass)}@127.0.0.1:${i.port}/${i.databases[label]}`;
      const after = await sqlRead(connection(url, 'isolated'), snapshot),
        before = JSON.parse(
          open(label + '.snapshot.enc').toString(),
        ) as Snapshot;
      evidence.push({
        label,
        dataEqual:
          JSON.stringify(after.tables) === JSON.stringify(before.tables),
        schemaEqual:
          JSON.stringify(comparableSchema(after.schema)) ===
          JSON.stringify(comparableSchema(before.schema)),
      });
    }
    if (evidence.some((e) => !e.dataEqual || !e.schemaEqual))
      fail('VERIFY_FAILED');
    save('verification-' + randomUUID() + '.json', {
      status: 'PASS_ISOLATED_RESTORE_ONLY',
      evidence,
    });
    console.log(
      JSON.stringify({ mode, status: 'PASS_ISOLATED_RESTORE_ONLY', evidence }),
    );
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    const code =
      e instanceof Error && /^[A-Z0-9_]{3,100}$/.test(e.message)
        ? e.message
        : typeof e?.code === 'string' && /^[A-Z0-9_]{3,40}$/.test(e.code)
          ? e.code
          : 'TRANSFER_FAILED_DETAILS_REDACTED';
    console.error(code);
    process.exitCode = 1;
  });
