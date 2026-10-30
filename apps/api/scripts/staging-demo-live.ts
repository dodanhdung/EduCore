/** Sanitized, consistent demo projection. Historical source rows stay in encrypted backups. */
import postgres from 'postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  connection,
  decrypt,
  encrypt,
  sha,
  snapshot,
  comparableSchema,
  requireImportTarget,
  qi,
  fail,
  type PayloadRow,
  type Snapshot,
} from './staging-data-transfer.ts';
import { passwordHash } from '../src/identity-access/crypto.ts';

type Options = ReturnType<typeof connection>;
type Fk = {
  s: string;
  t: string;
  rs: string;
  rt: string;
  cols: string[];
  refs: string[];
};
type Projected = PayloadRow & {
  patch: Record<string, unknown>;
  hold: string[];
};
type Manager = {
  userId: string;
  tenantId: string;
  email: string;
  password: string;
  hash: string;
};
type Plan = {
  runId: string;
  sourceDigest: string;
  targetDigest: string;
  rows: PayloadRow[];
  held: { table: string; key: string; reasons: string[] }[];
  counts: Record<string, number>;
  sourceCounts: Record<string, string>;
  tenants: string[];
  managers: Manager[];
  fks: Fk[];
  digest: string;
};
const ALLOWED = new Set([
  'tenants',
  'users',
  'policy_versions',
  'permissions',
  'tenant_memberships',
  'roles',
  'role_permissions',
  'membership_roles',
  'access_scopes',
  'teacher_profiles',
  'student_profiles',
  'subjects',
  'levels',
  'courses',
  'classes',
  'teacher_competencies',
  'class_teacher_assignments',
  'enrollments',
  'enrollment_transfers',
  'parent_student_links',
  'verified_sibling_relationships',
  'rooms',
  'schedulable_resources',
  'resource_unavailability',
  'schedule_series',
  'class_sessions',
  'session_participants',
  'resource_bookings',
  'absence_requests',
  'attendance_finalizations',
  'attendance_records',
  'attendance_corrections',
  'price_rules',
  'billing_periods',
  'billing_runs',
  'invoices',
  'invoice_lines',
  'invoice_discounts',
  'invoiced_participation_claims',
  'wallet_accounts',
  'invoice_number_counters',
  'assignments',
  'assignment_recipients',
]);
const POLICY_KEYS = new Set([
  'fixtureOnly',
  'invoiceAutoIssue',
  'absenceNoticeHours',
  'siblingDiscountRate',
  'auditRetentionMonths',
  'jobRetryDelaysMinutes',
  'batch',
  'financeDemo',
]);
const HELD_FINANCE = new Set([
  'billing_periods',
  'billing_runs',
  'invoices',
  'invoice_lines',
  'invoice_discounts',
  'invoiced_participation_claims',
  'invoice_number_counters',
]);
const stable = (x: unknown): string =>
  Array.isArray(x)
    ? '[' + x.map(stable).join(',') + ']'
    : x && typeof x === 'object'
      ? '{' +
        Object.entries(x)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
          .join(',') +
        '}'
      : JSON.stringify(x);
export function projectRow(
  row: PayloadRow,
  trustedJson: Set<string>,
  walletHistory: Set<string>,
): Projected {
  const t = row.table.split('.').at(-1)!,
    d = JSON.parse(row.json),
    patch: Record<string, unknown> = {},
    hold: string[] = [];
  const tag = sha(String(d.id ?? row.key)).slice(0, 16);
  if (!ALLOWED.has(t))
    hold.push('HISTORICAL_AUTH_WORKFLOW_OR_UNREVIEWED_TABLE');
  if (HELD_FINANCE.has(t))
    hold.push('SOURCE_FINANCIAL_HISTORY_RETAINED_WITH_ORIGINAL_TENANT');
  const label = (field: string, value: unknown) => {
    if (Object.hasOwn(d, field)) patch[field] = value;
  };
  if (t === 'tenants') {
    label('name', 'EduCore Staging Demo ' + tag.slice(0, 6));
    if (
      ![
        'DEMO_EDUCORE_01',
        'DEMO_R10_CG',
        'DEMO_R10_HD',
        'DEMO_R10_LB',
      ].includes(d.code)
    )
      label('code', 'STG_' + tag);
  }
  if (t === 'users') {
    label('email_normalized', 'demo.' + tag + '@staging.invalid');
    label('display_name', 'Demo User ' + tag.slice(0, 6));
  }
  if (t === 'student_profiles') {
    label('full_name', 'Học viên Demo ' + tag.slice(0, 6));
    label('student_code', 'S_' + tag);
    label('date_of_birth', null);
  }
  if (t === 'teacher_profiles') {
    label('full_name', 'Giáo viên Demo ' + tag.slice(0, 6));
    label('teacher_code', 'T_' + tag);
    label('contact', null);
  }
  for (const [table, prefix] of [
    ['subjects', 'Môn'],
    ['levels', 'Cấp độ'],
    ['courses', 'Khóa'],
    ['classes', 'Lớp'],
    ['rooms', 'Phòng'],
  ] as const)
    if (t === table) {
      label('name', prefix + ' Demo ' + tag.slice(0, 6));
      label('code', table.slice(0, 2).toUpperCase() + '_' + tag);
      label('description', null);
      label('location', null);
    }
  if (t === 'roles') label('name', 'Demo ' + String(d.code));
  if (t === 'permissions')
    label('description', 'Staging permission ' + String(d.code));
  if (t === 'assignments') {
    label('title', 'Bài tập Demo ' + tag.slice(0, 6));
    label('description', 'Nội dung demo đã khử định danh.');
  }
  if (t === 'parent_student_links') {
    label('evidence_reference', null);
    label('relationship', 'PARENT');
  }
  for (const field of [
    'reason',
    'decision_reason',
    'cancel_reason',
    'error_reason',
    'note',
    'notes',
    'evidence_reference',
  ])
    if (d[field] !== undefined && d[field] !== null)
      label(field, 'Sanitized staging demo');
  if (
    t === 'wallet_accounts' &&
    (String(d.balance_vnd) !== '0' || walletHistory.has(String(d.id)))
  )
    hold.push('PRESERVE_FUNDED_WALLET_HISTORY_AT_SOURCE');
  if (t === 'invoices' && !trustedJson.has(stable(d.snapshot_json)))
    hold.push('INVOICE_SNAPSHOT_NOT_PROVEN_TECHNICAL');
  if (t === 'policy_versions') {
    const cfg = d.config_snapshot;
    const technical =
      cfg &&
      typeof cfg === 'object' &&
      Object.entries(cfg).every(
        ([k, v]) =>
          POLICY_KEYS.has(k) &&
          ((k === 'siblingDiscountRate' &&
            typeof v === 'string' &&
            /^0\.10*$/.test(v)) ||
            typeof v === 'boolean' ||
            typeof v === 'number' ||
            (Array.isArray(v) && v.every((x) => typeof x === 'number')) ||
            (typeof v === 'string' && trustedJson.has(stable({ [k]: v })))),
      );
    if (!technical) hold.push('POLICY_CONFIG_NOT_PROVEN_TECHNICAL');
  }
  return { ...row, patch, hold };
}
function db(opts: Options, readOnly = true) {
  return postgres({
    ...opts,
    max: 1,
    prepare: false,
    connect_timeout: 20,
    idle_timeout: 3,
    onnotice: () => {},
    connection: {
      application_name: 'educore_approved_demo_transfer',
      default_transaction_read_only: readOnly,
      statement_timeout: 180000,
      lock_timeout: 5000,
    },
  });
}
async function readSnapshot(opts: Options) {
  const sql = db(opts);
  try {
    return await sql.begin(
      'isolation level repeatable read read only',
      snapshot,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
const schemaDigest = (s: Snapshot) =>
  sha(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(comparableSchema(s.schema)).filter(
          ([k]) => k !== 'owners',
        ),
      ),
    ),
  );
async function foreignKeys(sql: ReturnType<typeof db>): Promise<Fk[]> {
  return (await sql`SELECT n.nspname s,c.relname t,rn.nspname rs,rc.relname rt,
 ARRAY(SELECT a.attname FROM unnest(x.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num ORDER BY k.ord) cols,
 ARRAY(SELECT a.attname FROM unnest(x.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=rc.oid AND a.attnum=k.num ORDER BY k.ord) refs
 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_class rc ON rc.oid=x.confrelid JOIN pg_namespace rn ON rn.oid=rc.relnamespace
 WHERE x.contype='f' AND n.nspname='public' ORDER BY 1,2,x.conname`) as unknown as Fk[];
}
function graph(rows: PayloadRow[], fks: Fk[], holdMode = false) {
  const data = rows.map((r) => JSON.parse(r.json)),
    deps = rows.map(() => new Set<number>()),
    missing = new Set<number>();
  for (const fk of fks) {
    const table = fk.s + '.' + fk.t,
      ref = fk.rs + '.' + fk.rt,
      index = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.table === ref) index.set(stable(fk.refs.map((c) => data[i][c])), i);
    });
    rows.forEach((r, i) => {
      if (r.table !== table) return;
      const tuple = fk.cols.map((c) => data[i][c]);
      if (tuple.some((x) => x === null || x === undefined)) return;
      const n = index.get(stable(tuple));
      if (n === undefined) missing.add(i);
      else if (n !== i) deps[i].add(n);
    });
  }
  // Reconstruct a sealed roster before inserting its finalization; never add participants to an already sealed roster.
  rows.forEach((r, i) => {
    if (r.table !== 'public.attendance_finalizations') return;
    rows.forEach((p, j) => {
      if (
        p.table === 'public.session_participants' &&
        data[j].tenant_id === data[i].tenant_id &&
        data[j].session_id === data[i].session_id
      )
        deps[i].add(j);
    });
  });
  if (holdMode) return { deps, missing, levels: [] as number[][] };
  if (missing.size) fail('PROJECTED_FK_DEPENDENCY_MISSING');
  const left = new Set(rows.map((_, i) => i)),
    levels: number[][] = [];
  while (left.size) {
    const ready = [...left].filter((i) =>
      [...deps[i]].every((d) => !left.has(d)),
    );
    if (!ready.length) fail('PROJECTED_DATA_CYCLE');
    levels.push(ready);
    ready.forEach((i) => left.delete(i));
  }
  return { deps, missing, levels };
}
async function canonicalRows(
  sql: ReturnType<typeof db>,
  rows: Projected[],
): Promise<PayloadRow[]> {
  const out: PayloadRow[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const values = batch.map((r) => ({ raw: r.json, patch: r.patch }));
    const cleaned =
      await sql`SELECT ((v->>'raw')::jsonb||(v->'patch'))::text json FROM jsonb_array_elements(${JSON.stringify(values)}::text::jsonb) WITH ORDINALITY x(v,ord) ORDER BY ord`;
    batch.forEach((r, n) =>
      out.push({ table: r.table, key: r.key, json: String(cleaned[n].json) }),
    );
  }
  return out;
}
async function fingerprint(
  sql: postgres.TransactionSql | ReturnType<typeof db>,
  tables: string[],
) {
  const out: Record<string, { count: number; digest: string }> = {};
  for (const table of [...tables].sort()) {
    const r = await sql.unsafe(
      `SELECT to_jsonb(t)::text j FROM ${table.split('.').map(qi).join('.')} t ORDER BY to_jsonb(t)::text`,
    );
    const normalize = (j: string) => {
      if (table !== 'public.tenants') return j;
      const d = JSON.parse(j);
      d.timezone_frozen_at = null;
      d.updated_at = null;
      for (const field of ['created_at', 'activated_at'])
        if (d[field]) d[field] = new Date(d[field]).toISOString();
      return stable(d);
    };
    out[table] = {
      count: r.length,
      digest: sha(JSON.stringify(r.map((x) => normalize(String(x.j))).sort())),
    };
  }
  return out;
}
function expected(plan: Plan) {
  const out: Record<string, { count: number; digest: string }> = {};
  for (const table of Object.keys(plan.counts).sort()) {
    const rows = plan.rows
      .filter((r) => r.table === table)
      .map((r) => {
        if (table !== 'public.tenants') return r.json;
        const d = JSON.parse(r.json);
        d.timezone_frozen_at = null;
        d.updated_at = null;
        for (const field of ['created_at', 'activated_at'])
          if (d[field]) d[field] = new Date(d[field]).toISOString();
        return stable(d);
      })
      .sort();
    out[table] = { count: rows.length, digest: sha(JSON.stringify(rows)) };
  }
  return out;
}

async function httpEvidence(plan: Plan) {
  const api = 'https://educore-staging-api.onrender.com',
    origin = 'https://edu-core-rosy.vercel.app';
  const call = async (
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
  ) => {
    const request: RequestInit = {
      method,
      headers: {
        Origin: origin,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      signal: AbortSignal.timeout(60000),
    };
    if (body !== undefined) request.body = JSON.stringify(body);
    const response = await fetch(api + path, request);
    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data,
      cors: response.headers.get('access-control-allow-origin') === origin,
    };
  };
  const managers = [];
  for (const manager of plan.managers) {
    const login = await call('/api/v1/auth/login', 'POST', {
      email: manager.email,
      password: manager.password,
    });
    const summary: {
      tenantId: string;
      login: number;
      cors: boolean;
      select?: number;
      students?: unknown;
      teachers?: unknown;
      classes?: unknown;
      dashboard?: unknown;
      calendar?: unknown;
      crossTenantDenied?: boolean;
      logout?: number;
      passed: boolean;
    } = {
      tenantId: manager.tenantId,
      login: login.status,
      cors: login.cors,
      passed: false,
    };
    if (login.status !== 200 || typeof login.data.accessToken !== 'string') {
      managers.push(summary);
      continue;
    }
    const select = await call(
      '/api/v1/auth/select-tenant',
      'POST',
      { tenantId: manager.tenantId },
      login.data.accessToken,
    );
    summary.select = select.status;
    const token = select.data.accessToken;
    if (select.status !== 200 || typeof token !== 'string') {
      managers.push(summary);
      continue;
    }
    const root = '/api/v1/tenants/' + manager.tenantId;
    const students = await call(
        root + '/academic/students?pageSize=100',
        'GET',
        undefined,
        token,
      ),
      teachers = await call(
        root + '/academic/teachers?pageSize=100',
        'GET',
        undefined,
        token,
      ),
      classes = await call(
        root + '/academic/classes?pageSize=100',
        'GET',
        undefined,
        token,
      ),
      dashboard = await call(
        root + '/portal/overview',
        'GET',
        undefined,
        token,
      );
    const other = plan.tenants.find((t) => t !== manager.tenantId);
    const denied = other
      ? await call(
          '/api/v1/tenants/' + other + '/academic/students',
          'GET',
          undefined,
          token,
        )
      : null;
    summary.students = { status: students.status, total: students.data.total };
    summary.teachers = { status: teachers.status, total: teachers.data.total };
    summary.classes = { status: classes.status, total: classes.data.total };
    summary.dashboard = {
      status: dashboard.status,
      students: dashboard.data.students,
      classes: dashboard.data.classes,
      outstandingVnd: dashboard.data.outstandingVnd,
    };
    const dates = plan.rows
      .filter(
        (r) =>
          r.table === 'public.class_sessions' &&
          JSON.parse(r.json).tenant_id === manager.tenantId,
      )
      .map((r) => Date.parse(JSON.parse(r.json).starts_at))
      .sort((a, b) => b - a);
    if (dates.length) {
      const from = new Date(dates[0] - 27 * 86400000).toISOString(),
        to = new Date(dates[0] + 86400000).toISOString();
      const calendar = await call(
        root +
          '/scheduling/calendar?pageSize=100&from=' +
          encodeURIComponent(from) +
          '&to=' +
          encodeURIComponent(to),
        'GET',
        undefined,
        token,
      );
      summary.calendar = {
        status: calendar.status,
        items: Array.isArray(calendar.data.items)
          ? calendar.data.items.length
          : null,
      };
    }
    summary.crossTenantDenied = !!denied && [403, 404].includes(denied.status);
    const count = (table: string) =>
      plan.rows.filter(
        (r) =>
          r.table === 'public.' + table &&
          JSON.parse(r.json).tenant_id === manager.tenantId,
      ).length;
    summary.passed =
      summary.cors &&
      [students, teachers, classes, dashboard].every((r) => r.status === 200) &&
      students.data.total === count('student_profiles') &&
      teachers.data.total === count('teacher_profiles') &&
      classes.data.total === count('classes') &&
      summary.crossTenantDenied;
    summary.logout = (
      await call('/api/v1/auth/logout', 'POST', undefined, token)
    ).status;
    managers.push(summary);
  }
  const front = await fetch(origin + '/login', {
    signal: AbortSignal.timeout(30000),
  });
  const host = new URL(front.url).hostname;
  return {
    apiManagersPassed: managers.every((m) => m.passed),
    managers,
    frontend: {
      status: front.status,
      finalHost: host,
      appAccessible: host === new URL(origin).hostname,
      vercelProtection: host === 'vercel.com',
    },
  };
}

export async function runDemo(c: {
  mode: string;
  root: string;
  dir: string;
  key: Buffer;
  config: {
    context: string;
    container: string;
    database: string;
    pgPort: number;
  };
}) {
  const { mode, root, dir, key, config } = c;
  const load = <T>(name: string): T =>
    JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
  const open = (name: string) => decrypt(readFileSync(join(dir, name)), key);
  const seal = (name: string, value: unknown) =>
    writeFileSync(
      join(dir, name),
      encrypt(Buffer.from(JSON.stringify(value)), key),
      { flag: 'wx' },
    );
  const save = (name: string, value: unknown) =>
    writeFileSync(join(dir, name), JSON.stringify(value, null, 2), {
      flag: 'wx',
    });
  const renderRaw = readFileSync(
      process.env.EDUCORE_TRANSFER_TARGET_SECRET_PATH ?? '',
      'utf8',
    ).trim(),
    render = connection(renderRaw, 'render');
  const previous = join(
    root,
    '.local/staging-transfer/r13-preparation-20261030-e',
  );
  const isolated = JSON.parse(
    readFileSync(join(previous, 'isolated.json'), 'utf8'),
  );
  const isoSecret = JSON.parse(
    decrypt(
      readFileSync(join(previous, 'isolated-secret-final.enc')),
      key,
    ).toString(),
  );
  function docker(args: string[], input?: Buffer, env: NodeJS.ProcessEnv = {}) {
    const r = spawnSync('docker', ['--context', config.context, ...args], {
      input,
      encoding: null,
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
    if (r.status !== 0) {
      seal('demo-process-failure-' + randomUUID() + '.enc', {
        stderr: r.stderr?.toString(),
        args: args.filter((a) => !a.includes('PASSWORD')),
      });
      fail('DEMO_LOCAL_POSTGRES_TOOL_FAILED');
    }
    return r.stdout;
  }
  let activePort = isolated.port;
  const inspect = () => {
    const x = JSON.parse(
      docker(['inspect', '--format', '{{json .}}', isolated.name]).toString(),
    );
    if (
      x.Id !== isolated.containerId ||
      x.Config.Labels['educore.transfer'] !== isolated.id
    )
      fail('ISOLATED_IDENTITY_MISMATCH');
    if (x.State.Running) {
      const ports = x.NetworkSettings.Ports['5432/tcp'];
      if (ports.length !== 1 || ports[0].HostIp !== '127.0.0.1')
        fail('ISOLATED_LOOPBACK_REQUIRED');
      activePort = Number(ports[0].HostPort);
    }
    return x;
  };
  const isoOpts = (database: string) =>
    connection(
      `postgresql://${isolated.maint}:${encodeURIComponent(isoSecret.maintPass)}@127.0.0.1:${activePort}/${database}`,
      'isolated',
    );
  const probeDb = existsSync(join(dir, 'demo-recovery.json'))
    ? load<{ db: string }>('demo-recovery.json').db
    : 'educore_transfer_' + sha(dir).slice(0, 12) + '_probe';
  if (mode === 'demo-plan') {
    if (existsSync(join(dir, 'demo-plan.enc')))
      fail('DEMO_PLAN_ALREADY_EXISTS');
    const sourceBackup = JSON.parse(
        open('source.snapshot.enc').toString(),
      ) as Snapshot,
      targetBackup = JSON.parse(
        open('target.snapshot.enc').toString(),
      ) as Snapshot;
    for (const label of ['source', 'target'])
      if (
        sha(open(label + '.dump.enc')) !==
        load<{ sha256: string }>(label + '.backup-receipt.json').sha256
      )
        fail('BACKUP_HASH_MISMATCH');
    const source = connection(
      `postgresql://local_admin:${encodeURIComponent(process.env.EDUCORE_TRANSFER_SOURCE_PASSWORD ?? '')}@127.0.0.1:${config.pgPort}/${config.database}`,
      'source',
      config.database,
    );
    const currentSource = await readSnapshot(source);
    if (
      JSON.stringify(currentSource.tables) !==
        JSON.stringify(sourceBackup.tables) ||
      schemaDigest(currentSource) !== schemaDigest(sourceBackup)
    )
      fail('SOURCE_CHANGED_NEW_BACKUP_REQUIRED');
    const currentTarget = await readSnapshot(render);
    if (
      JSON.stringify(currentTarget.tables) !==
      JSON.stringify(targetBackup.tables)
    )
      fail('TARGET_CHANGED_NEW_BACKUP_REQUIRED');
    if (schemaDigest(currentSource) !== schemaDigest(currentTarget))
      fail('SOURCE_TARGET_APP_SCHEMA_MISMATCH');
    const info = inspect();
    if (!info.State.Running) docker(['start', isolated.name]);
    let ready = false;
    for (let n = 0; n < 80; n++) {
      const probe = spawnSync(
        'docker',
        [
          '--context',
          config.context,
          'exec',
          isolated.name,
          'pg_isready',
          '-q',
          '-h',
          '127.0.0.1',
        ],
        { windowsHide: true },
      );
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) fail('DEMO_PROBE_SERVER_NOT_READY');
    inspect();
    if (!existsSync(join(dir, 'demo-recovery.json'))) {
      const admin = db(isoOpts(isolated.databases.target), false);
      try {
        const [attr] =
          await admin`SELECT NOT rolsuper AND NOT rolbypassrls safe FROM pg_roles WHERE rolname=session_user`;
        if (!attr.safe) fail('NON_SUPERUSER_REQUIRED');
        const owner = targetBackup.schema.owners.find(
          (x) => x.s === 'public' && x.t === 'tenants',
        )?.owner;
        if (typeof owner !== 'string') fail('INVALID_BACKUP_OWNER');
        await admin.unsafe(
          `CREATE DATABASE ${qi(probeDb)} OWNER ${qi(owner)} TEMPLATE template0`,
        );
      } finally {
        await admin.end({ timeout: 3 });
      }
      const bytes = open('target.dump.enc'),
        list = docker(
          ['exec', '-i', isolated.name, 'pg_restore', '--list'],
          bytes,
        ).toString();
      const omitted = list
        .split('\n')
        .filter(
          (l) =>
            /^\d+;/.test(l) &&
            / DEFAULT ACL /.test(l) &&
            / postgres\s*$/.test(l),
        );
      docker(
        [
          'exec',
          '-i',
          isolated.name,
          'sh',
          '-c',
          'cat > /tmp/educore-demo-recovery.list',
        ],
        Buffer.from(
          list
            .split('\n')
            .filter((l) => !omitted.includes(l))
            .join('\n'),
        ),
      );
      const pgEnv = {
        PGHOST: '127.0.0.1',
        PGUSER: isolated.maint,
        PGPASSWORD: isoSecret.maintPass,
        PGDATABASE: probeDb,
      };
      docker(
        [
          'exec',
          '-i',
          ...Object.keys(pgEnv).flatMap((k) => ['--env', k]),
          isolated.name,
          'pg_restore',
          '--dbname',
          probeDb,
          '--use-list=/tmp/educore-demo-recovery.list',
          '--single-transaction',
          '--exit-on-error',
        ],
        bytes,
        pgEnv,
      );
      const recovered = await readSnapshot(isoOpts(probeDb));
      if (
        JSON.stringify(recovered.tables) !==
          JSON.stringify(targetBackup.tables) ||
        JSON.stringify(comparableSchema(recovered.schema)) !==
          JSON.stringify(comparableSchema(targetBackup.schema))
      )
        fail('FRESH_TARGET_RECOVERY_MISMATCH');
      save('demo-recovery.json', {
        passed: true,
        db: probeDb,
        tables: 74,
        providerDefaultAclsOmitted: omitted.length,
        nonSuperuser: true,
      });
    } else {
      const recovered = await readSnapshot(isoOpts(probeDb));
      if (
        JSON.stringify(recovered.tables) !==
          JSON.stringify(targetBackup.tables) ||
        JSON.stringify(comparableSchema(recovered.schema)) !==
          JSON.stringify(comparableSchema(targetBackup.schema))
      )
        fail('RECOVERY_PROBE_ALREADY_MODIFIED');
    }
    const sql = db(isoOpts(probeDb));
    try {
      const fks = await foreignKeys(sql),
        raw = JSON.parse(open('payload.enc').toString()) as PayloadRow[];
      const trusted = new Set<string>([stable({ fixtureOnly: true })]);
      for (const file of [
        'demo-data/educore-r10-three-centers.sql',
        'demo-data/educore-r10-role-test-accounts.sql',
      ]) {
        const text = readFileSync(join(root, file), 'utf8');
        for (const match of text.matchAll(/'((?:''|[^'])*)'/g)) {
          const literal = match[1].replaceAll("''", "'");
          // Exact marker literals from the synthetic generator, not arbitrary source free text.
          if (/^(?:R10|R1B|DEMO)[A-Za-z0-9_-]{0,80}$/.test(literal)) {
            trusted.add(stable({ batch: literal }));
            trusted.add(stable({ source: literal }));
          }
          if (!literal.trim().startsWith('{')) continue;
          try {
            const value = JSON.parse(literal);
            trusted.add(stable(value));
            for (const [k, v] of Object.entries(value))
              trusted.add(stable({ [k]: v }));
          } catch {
            /* non-JSON SQL literal */
          }
        }
      }
      const walletHistory = new Set(
        raw
          .filter((r) => r.table === 'public.wallet_transactions')
          .map((r) => String(JSON.parse(r.json).wallet_id)),
      );
      const projected = raw.map((r) => projectRow(r, trusted, walletHistory));
      // Free staging could not sustain the full deferred-booking workload (rolled back, receipt absent).
      // Keep an entire, consistent confirmed session per source tenant; retain all draft/cancelled sessions.
      const confirmed = new Map<string, { id: string; start: string }[]>();
      for (const r of raw.filter((r) => r.table === 'public.class_sessions')) {
        const d = JSON.parse(r.json);
        if (d.status === 'CONFIRMED')
          confirmed.set(d.tenant_id, [
            ...(confirmed.get(d.tenant_id) ?? []),
            { id: d.id, start: d.starts_at },
          ]);
      }
      const allowedConfirmed = new Set(
        [...confirmed.values()].flatMap((a) =>
          a
            .sort((x, y) => y.start.localeCompare(x.start))
            .slice(0, 1)
            .map((x) => x.id),
        ),
      );
      for (const r of projected) {
        if (r.table === 'public.class_sessions') {
          const d = JSON.parse(r.json);
          if (d.status === 'CONFIRMED' && !allowedConfirmed.has(d.id))
            r.hold.push('RESOURCE_BOUNDED_CONSISTENT_CONFIRMED_COHORT');
        }
      }
      const tenantMap = new Map(
        projected
          .filter((r) => r.table === 'public.tenants')
          .map((r) => [r.key, randomUUID()]),
      );
      const createdAt = new Date().toISOString();
      for (const row of projected) {
        const d = JSON.parse(row.json);
        if (row.table === 'public.tenants') {
          row.patch = {
            ...row.patch,
            id: tenantMap.get(row.key),
            code: 'STG_' + sha(row.key).slice(0, 12).toUpperCase(),
            timezone_frozen_at: null,
            created_at: createdAt,
            updated_at: createdAt,
            activated_at: createdAt,
          };
          row.key = String(tenantMap.get(row.key));
        } else if (typeof d.tenant_id === 'string') {
          const tenant = tenantMap.get(d.tenant_id);
          if (!tenant) row.hold.push('UNKNOWN_SOURCE_TENANT');
          else row.patch.tenant_id = tenant;
        }
      }
      let kept = projected.filter((r) => !r.hold.length),
        held = projected
          .filter((r) => r.hold.length)
          .map((r) => ({ table: r.table, key: r.key, reasons: r.hold }));
      while (true) {
        const missing = graph(kept, fks, true).missing;
        if (!missing.size) break;
        kept = kept.filter((r, i) => {
          if (missing.has(i)) {
            held.push({
              table: r.table,
              key: r.key,
              reasons: ['HELD_PARENT_DEPENDENCY'],
            });
            return false;
          }
          return true;
        });
      }
      const rows = await canonicalRows(sql, kept);
      graph(rows, fks);
      const counts: Record<string, number> = {};
      rows.forEach((r) => (counts[r.table] = (counts[r.table] ?? 0) + 1));
      if (
        (counts['public.student_profiles'] ?? 0) < 1 ||
        (counts['public.classes'] ?? 0) < 1
      )
        fail('NO_INDEPENDENT_DEMO_COHORT');
      const memberships = rows
          .filter((r) => r.table === 'public.tenant_memberships')
          .map((r) => JSON.parse(r.json)),
        roles = rows
          .filter((r) => r.table === 'public.roles')
          .map((r) => JSON.parse(r.json)),
        assignments = rows
          .filter((r) => r.table === 'public.membership_roles')
          .map((r) => JSON.parse(r.json));
      const managers: Manager[] = [];
      for (const tenant of rows.filter((r) => r.table === 'public.tenants')) {
        const role = roles.find(
            (r) => r.tenant_id === tenant.key && r.code === 'MANAGER',
          ),
          grant = assignments.find(
            (r) =>
              r.tenant_id === tenant.key &&
              r.role_id === role?.id &&
              r.revoked_at === null,
          ),
          member = memberships.find((m) => m.id === grant?.membership_id);
        const user = rows.find(
          (r) => r.table === 'public.users' && r.key === member?.user_id,
        );
        if (!user) fail('MANAGER_COHORT_INCOMPLETE');
        const password = randomBytes(32).toString('base64url');
        managers.push({
          userId: user.key,
          tenantId: tenant.key,
          email: String(JSON.parse(user.json).email_normalized),
          password,
          hash: await passwordHash(password),
        });
      }
      const body = {
        runId: randomUUID(),
        sourceDigest: sourceBackup.digest,
        targetDigest: targetBackup.digest,
        rows,
        held,
        counts,
        sourceCounts: Object.fromEntries(
          sourceBackup.tables.map((t) => [t.name, t.count]),
        ),
        tenants: rows
          .filter((r) => r.table === 'public.tenants')
          .map((r) => r.key),
        managers,
        fks,
      };
      const plan: Plan = { ...body, digest: sha(JSON.stringify(body)) };
      seal('demo-plan.enc', plan);
      save('demo-plan-summary.json', {
        runId: plan.runId,
        digest: plan.digest,
        counts,
        heldByTable: held.reduce<Record<string, number>>(
          (o, r) => ((o[r.table] = (o[r.table] ?? 0) + 1), o),
          {},
        ),
        total: rows.length,
        managers: managers.length,
        tenantMapping: Object.fromEntries(tenantMap),
        sourceDigest: plan.sourceDigest,
        targetDigest: plan.targetDigest,
      });
      console.log(
        JSON.stringify({
          mode,
          runId: plan.runId,
          planDigest: plan.digest,
          counts,
          total: rows.length,
          held: held.length,
          managers: managers.length,
        }),
      );
    } finally {
      await sql.end({ timeout: 3 });
    }
    return;
  }
  const plan = JSON.parse(open('demo-plan.enc').toString()) as Plan,
    { digest, ...body } = plan;
  if (sha(JSON.stringify(body)) !== digest) fail('DEMO_PLAN_DIGEST_MISMATCH');
  if (mode === 'demo-rehearsal' || mode === 'import') {
    const live = mode === 'import';
    if (!live) inspect();
    let opts = isoOpts(probeDb);
    if (live) {
      const rehearsal = load<{ passed: boolean; digest: string }>(
        'demo-rehearsal.json',
      );
      if (
        !rehearsal.passed ||
        process.env.EDUCORE_TRANSFER_EXPECTED_PLAN !== digest
      )
        fail('LIVE_PLAN_NOT_REHEARSED');
      opts = requireImportTarget(renderRaw, {
        scope: process.env.EDUCORE_TRANSFER_LIVE_SCOPE ?? '',
        plan: digest,
        rehearsed: rehearsal.digest,
      });
      if (!load<{ passed: boolean }>('demo-recovery.json').passed)
        fail('RECOVERY_PROOF_REQUIRED');
      const before = await readSnapshot(opts),
        baseline = JSON.parse(
          open('target.snapshot.enc').toString(),
        ) as Snapshot;
      if (
        JSON.stringify(comparableSchema(before.schema)) !==
        JSON.stringify(comparableSchema(baseline.schema))
      )
        fail('LIVE_SCHEMA_DRIFT');
    }
    const sql = db(opts, false);
    let stage = 'admission';
    try {
      const evidence = await sql.begin(
        'isolation level read committed',
        async (tx) => {
          await tx`SET LOCAL TIME ZONE 'UTC'`;
          await tx`SET LOCAL row_security=on`;
          const [identity] =
            await tx`SELECT current_database() db,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) super`;
          if (identity.super || identity.db !== opts.database)
            fail('UNSAFE_EXECUTION_IDENTITY');
          const tables = [
            ...new Set([
              'public.users',
              'public.tenants',
              ...Object.keys(plan.counts),
              'public.credentials',
              'public.audit_logs',
            ]),
          ];
          for (const table of tables)
            await tx.unsafe(
              `LOCK TABLE ${table.split('.').map(qi).join('.')} IN SHARE ROW EXCLUSIVE MODE`,
            );
          for (const t of (
            JSON.parse(open('target.snapshot.enc').toString()) as Snapshot
          ).tables) {
            if (
              t.name === 'public._prisma_migrations' ||
              t.name === 'educore_r4.auth_throttles'
            )
              continue;
            const [r] = await tx.unsafe(
              `SELECT count(*)::text n FROM ${t.name.split('.').map(qi).join('.')}`,
            );
            if (r.n !== '0') fail('TARGET_NOT_EMPTY_REFUSE_REPLAY');
          }
          const catalog =
            await tx`SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' OR n.nspname LIKE 'educore%') AND c.relrowsecurity`;
          if (catalog[0].n) fail('RLS_POLICY_REQUIRES_COVERAGE_REVIEW');
          const columns = (
            JSON.parse(open('target.snapshot.enc').toString()) as Snapshot
          ).schema.columns;
          for (const level of graph(plan.rows, plan.fks).levels) {
            const groups = new Map<string, PayloadRow[]>();
            for (const n of level) {
              const row = plan.rows[n];
              groups.set(row.table, [...(groups.get(row.table) ?? []), row]);
            }
            for (const [table, rows] of groups) {
              stage = table;
              const cols = columns
                .filter((x) => x.s + '.' + x.t === table)
                .sort((a, b) => Number(a.o) - Number(b.o))
                .map((x) => qi(String(x.n)))
                .join(',');
              for (let n = 0; n < rows.length; n += 150) {
                const json =
                  '[' +
                  rows
                    .slice(n, n + 150)
                    .map((r) => r.json)
                    .join(',') +
                  ']';
                await tx.unsafe(
                  `INSERT INTO ${table.split('.').map(qi).join('.')} (${cols}) SELECT ${cols} FROM jsonb_populate_recordset(NULL::${table.split('.').map(qi).join('.')},$1::text::jsonb)`,
                  [json],
                );
              }
            }
          }
          stage = 'credentials';
          for (const manager of plan.managers) {
            await tx`INSERT INTO public.credentials(user_id,password_hash,password_changed_at) VALUES(${manager.userId}::uuid,${manager.hash},clock_timestamp())`;
          }
          stage = 'receipt';
          for (const tenant of plan.tenants) {
            const [policy] =
              await tx`SELECT id::text FROM policy_versions WHERE tenant_id=${tenant}::uuid AND effective_from<=now() ORDER BY effective_from DESC LIMIT 1`;
            if (!policy) fail('CURRENT_POLICY_REQUIRED');
            await tx`INSERT INTO audit_logs(id,tenant_id,actor_kind,operator_identity,event_type,entity_type,entity_id,action,reason,after_json,policy_version_id,correlation_id)
      VALUES(${randomUUID()}::uuid,${tenant}::uuid,'OPERATOR',session_user,'STAGING_DEMO_IMPORT','StagingMigration',${plan.runId}::uuid,'STAGING_DEMO_IMPORT',
       'Owner authorized sanitized independent demo cohort',${JSON.stringify({ planDigest: digest, sourceDigest: plan.sourceDigest, credentialUsers: plan.managers.filter((m) => m.tenantId === tenant).map((m) => m.userId) })}::text::jsonb,${policy.id}::uuid,${plan.runId}::uuid)`;
          }
          stage = 'constraints';
          await tx`SET CONSTRAINTS ALL IMMEDIATE`;
          const [tenantMarkers] =
            await tx`SELECT count(*)::int n FROM tenants WHERE timezone_frozen_at IS NULL OR timezone_frozen_at<created_at OR updated_at<created_at`;
          if (tenantMarkers.n) fail('NEW_DEMO_TENANT_FREEZE_INVALID');
          stage = 'fingerprints';
          const fingerprints = await fingerprint(tx, Object.keys(plan.counts));
          if (JSON.stringify(fingerprints) !== JSON.stringify(expected(plan))) {
            const wanted = expected(plan);
            const tables = Object.keys(wanted).filter(
              (t) =>
                JSON.stringify(wanted[t]) !== JSON.stringify(fingerprints[t]),
            );
            console.error(
              JSON.stringify({ fingerprintMismatchedTables: tables }),
            );
            fail('LIVE_GUARD_CHANGED_PROJECTED_HISTORY');
          }
          const [financial] =
            await tx`SELECT (SELECT count(*)::int FROM wallet_accounts WHERE balance_vnd<>0) nonzero_wallets,(SELECT count(*)::int FROM invoices WHERE total_vnd<>gross_vnd-discount_vnd) invalid_invoice_totals`;
          if (financial.nonzero_wallets || financial.invalid_invoice_totals)
            fail('FINANCIAL_INVARIANT_FAILED');
          return {
            passed: true,
            digest,
            runId: plan.runId,
            rows: plan.rows.length,
            counts: plan.counts,
            fingerprints,
            credentials: plan.managers.length,
            auditReceipts: plan.tenants.length,
          };
        },
      );
      save(live ? 'demo-live-receipt.json' : 'demo-rehearsal.json', evidence);
      console.log(
        JSON.stringify({
          mode,
          passed: true,
          rows: evidence.rows,
          credentials: evidence.credentials,
          auditReceipts: evidence.auditReceipts,
          digest,
        }),
      );
      if (live) {
        seal(
          'staging-managers.enc',
          plan.managers.map(({ userId, tenantId, email, password }) => ({
            userId,
            tenantId,
            email,
            password,
          })),
        );
        const script =
          "$ErrorActionPreference='Stop';$x=[Console]::In.ReadToEnd()|ConvertFrom-Json;foreach($m in $x.managers){$s=ConvertTo-SecureString $m.password -AsPlainText -Force;$c=[pscredential]::new($m.email,$s);$c|Export-Clixml -LiteralPath (Join-Path $x.root ('manager-'+$m.tenantId+'.credential.xml'));$s.Dispose()}";
        const r = spawnSync(
          'powershell.exe',
          ['-NoProfile', '-Command', script],
          {
            input: JSON.stringify({ root: dir, managers: plan.managers }),
            encoding: 'utf8',
            windowsHide: true,
          },
        );
        if (r.status !== 0)
          fail('LIVE_IMPORTED_CREDENTIAL_EXPORT_FAILED_VERIFY_ONLY');
      }
    } catch (error) {
      const e = error as { code?: string; message?: string };
      seal('demo-failure-' + randomUUID() + '.enc', {
        stage,
        code: e.code,
        message: e.message,
      });
      const safe =
        e.message && /^[A-Z0-9_]+$/.test(e.message)
          ? e.message
          : (e.code ?? 'DETAILS_PRIVATE');
      console.error(JSON.stringify({ mode, stage, failure: safe }));
      throw Error('DEMO_EXECUTION_ABORTED');
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }
  if (mode === 'demo-verify') {
    const sql = db(render);
    try {
      const actual = await fingerprint(sql, Object.keys(plan.counts));
      if (JSON.stringify(actual) !== JSON.stringify(expected(plan)))
        fail('LIVE_VERIFY_FINGERPRINT_FAILED');
      const [r] =
        await sql`SELECT count(*)::int n FROM audit_logs WHERE event_type='STAGING_DEMO_IMPORT' AND entity_id=${plan.runId}::uuid`;
      if (r.n !== plan.tenants.length) fail('LIVE_RECEIPT_INCOMPLETE');
      const runtime =
        await sql`SELECT rolname name,NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls
        AND NOT has_schema_privilege(rolname,'public','CREATE') AND NOT has_database_privilege(rolname,current_database(),'CREATE')
        AND NOT has_table_privilege(rolname,'public.credentials','SELECT')
        AND pg_has_role(rolname,CASE WHEN rolname='educore_auth_login' THEN 'educore_r4_auth' ELSE 'educore_r4_api' END,'MEMBER')
        AND NOT EXISTS(SELECT FROM unnest(ARRAY['educore_r4_auth','educore_r4_api','educore_r4_worker','educore_r4_operator','educore_r4_owner','educore_r2_owner','educore_r3_owner','educore_r1b_guard_owner']) other
          WHERE other<>CASE WHEN rolname='educore_auth_login' THEN 'educore_r4_auth' ELSE 'educore_r4_api' END AND pg_has_role(rolname,other,'MEMBER')) safe
        FROM pg_roles WHERE rolname IN ('educore_auth_login','educore_api_login') ORDER BY 1`;
      if (runtime.length !== 2 || runtime.some((r) => !r.safe))
        fail('RUNTIME_ROLE_VERIFICATION_FAILED');
      save('demo-live-verification-' + randomUUID() + '.json', {
        passed: true,
        digest,
        rows: plan.rows.length,
        counts: plan.counts,
        auditReceipts: r.n,
        runtime,
      });
      console.log(
        JSON.stringify({
          mode,
          passed: true,
          rows: plan.rows.length,
          counts: plan.counts,
        }),
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
    const http = await httpEvidence(plan);
    save('demo-http-verification-' + randomUUID() + '.json', http);
    console.log(JSON.stringify({ http }));
  }
}
