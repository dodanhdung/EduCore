import postgres from 'postgres';
import { passwordHash } from '../src/identity-access/crypto.ts';
import { seed, type Query } from '../test/schema-integrity/support.ts';

const databaseUrl = process.env.DEMO_DATABASE_URL;
const confirmation = process.env.DEMO_SEED_CONFIRM;
const expectedConfirmation = 'I_UNDERSTAND_DEMO_DATA';

if (!databaseUrl || confirmation !== expectedConfirmation) {
  throw new Error(
    'Set DEMO_DATABASE_URL and DEMO_SEED_CONFIRM=I_UNDERSTAND_DEMO_DATA to seed a local demo database.',
  );
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(databaseUrl);
} catch {
  throw new Error('DEMO_DATABASE_URL must be a valid PostgreSQL URL.');
}

if (
  !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname) ||
  !/^\/educore_demo_[a-z0-9_]+$/.test(parsedUrl.pathname) ||
  parsedUrl.search ||
  parsedUrl.hash
) {
  throw new Error(
    'Demo seed only accepts a local PostgreSQL database named educore_demo_* without URL options.',
  );
}

const email = 'admin@educore.local';
const password = 'EduCoreDemo!2026';
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 5,
  idle_timeout: 5,
  connection: { application_name: 'educore_local_demo_seed' },
  onnotice: () => undefined,
});

try {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM public.tenants WHERE code = 'DEMO_EDUCORE_01'
  `;
  if (existing) {
    console.log(
      'Demo dataset already exists (DEMO_EDUCORE_01); no changes made.',
    );
    process.exitCode = 0;
  } else {
    const hash = await passwordHash(password);
    await sql.begin(async (tx) => {
      const fixture = await seed(tx as unknown as Query, {
        start: '2026-10-26T09:00:00.000Z',
        end: '2026-10-26T10:00:00.000Z',
        enrollmentFrom: '2026-09-01T00:00:00.000Z',
        policyEffectiveFrom: '2026-10-01T00:00:00.000Z',
        periodStart: '2026-10-01',
        periodEnd: '2026-11-01',
      });
      await tx`
        UPDATE public.tenants SET code = 'DEMO_EDUCORE_01', name = 'EduCore Demo'
        WHERE id = ${fixture.tenant}::uuid
      `;
      await tx`
        UPDATE public.users SET email_normalized = ${email}, display_name = 'Demo Manager'
        WHERE id = ${fixture.user}::uuid
      `;
      await tx`
        SELECT educore_r4.seed(${fixture.tenant}::uuid)
      `;
      await tx`
        INSERT INTO public.credentials(user_id, password_hash, password_changed_at)
        VALUES (${fixture.user}::uuid, ${hash}, clock_timestamp())
      `;
    });
    console.log('Created the compact EduCore demo dataset.');
    console.log(`Tenant: DEMO_EDUCORE_01`);
    console.log(`Login: ${email}`);
    console.log(`Password: ${password}`);
    console.log(
      'Contains 1 manager, 2 students, 1 teacher, 1 course, 2 classes, 1 enrollment, 1 draft session and 1 draft invoice.',
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
