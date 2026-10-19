import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { result } from '../identity-access/r4-repository.js';
/** Run compiled with operator LOGIN supplied by the deployment operator.
 * Inputs are non-secret; never use the migration/superuser connection. */
async function main() {
  const url = process.env.R4_OPERATOR_URL;
  if (!url) throw Error('R4_OPERATOR_URL_REQUIRED');
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const rows = await client.$queryRawUnsafe<{ safe: boolean }[]>(
      "SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND pg_has_role(session_user,'educore_r4_operator','MEMBER') safe FROM pg_roles WHERE rolname=session_user",
    );
    if (!rows[0]?.safe) throw Error('UNSAFE_OPERATOR_LOGIN');
    const [command, ...args] = process.argv.slice(2);
    if (command === 'bootstrap' && args.length === 5) {
      const value = await result(
        client,
        'SELECT educore_r4.bootstrap($1::text,$2::text,$3::text,$4::text,$5::text) result',
        ...args,
      );
      console.log(JSON.stringify(value));
    } else if (command === 'seed' && args.length === 1) {
      await result(
        client,
        'SELECT educore_r4.seed($1::uuid)::text result',
        args[0],
      );
      console.log('P0 baseline seeded');
    } else if (command === 'disable-user' && args.length === 2) {
      await result(
        client,
        'SELECT educore_r4.disable_user($1::uuid,$2::text)::text result',
        ...args,
      );
      console.log('User disabled');
    } else
      throw Error(
        'USAGE: bootstrap <code> <name> <timezone> <email> <displayName> | seed <tenantUUID> | disable-user <userUUID> <reason>',
      );
  } finally {
    await client.$disconnect();
  }
}
try {
  await main();
} catch {
  console.error(
    'OPERATOR_COMMAND_FAILED: inspect configuration, input and database audit using authorized operator tools',
  );
  process.exitCode = 1;
}
