import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import { requestTrace } from './request-context.js';
export type R4Tx = Prisma.TransactionClient;
export async function result<T>(
  tx: R4Tx | PrismaClient,
  query: string,
  ...args: unknown[]
): Promise<T> {
  const rows = await tx.$queryRawUnsafe<{ result: T }[]>(query, ...args);
  return rows[0]?.result;
}
/** Three separate restricted LOGIN credentials. Never a DATABASE_URL fallback,
 * SET ROLE from request, or process-global request principal. */
export class R4Repository {
  readonly auth: PrismaClient;
  readonly api: PrismaClient;
  readonly worker?: PrismaClient;
  constructor(authUrl: string, apiUrl: string, workerUrl?: string) {
    if (!authUrl || !apiUrl) throw Error('R4_CONNECTIONS_REQUIRED');
    const client = (url: string) =>
      new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    this.auth = client(authUrl);
    this.api = client(apiUrl);
    if (workerUrl) this.worker = client(workerUrl);
  }
  async assertRuntime() {
    for (const [client, role] of [
      [this.auth, 'educore_r4_auth'],
      [this.api, 'educore_r4_api'],
      ...(this.worker ? [[this.worker, 'educore_r4_worker']] : []),
    ] as [PrismaClient, string][]) {
      const rows = await client.$queryRawUnsafe<{ safe: boolean }[]>(
        `SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls
        AND pg_has_role(session_user,$1::text,'MEMBER') AND NOT has_schema_privilege(session_user,'public','CREATE')
        AND NOT has_database_privilege(session_user,current_database(),'CREATE')
        AND NOT has_table_privilege(session_user,'public.credentials','SELECT')
        AND NOT EXISTS(SELECT FROM unnest(ARRAY['educore_r4_auth','educore_r4_api','educore_r4_worker','educore_r4_operator','educore_r4_owner','educore_r2_owner','educore_r3_owner','educore_r1b_guard_owner']) other
          WHERE other<>$1::text AND pg_has_role(session_user,other,'MEMBER')) safe FROM pg_roles WHERE rolname=session_user`,
        role,
      );
      if (!rows[0]?.safe) throw Error('UNSAFE_R4_RUNTIME_LOGIN');
    }
  }
  transaction<T>(token: string, action: (tx: R4Tx) => Promise<T>) {
    return this.api.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");
        await result(tx, 'SELECT educore_r4.bind($1::text) result', token);
        const correlation = requestTrace.getStore()?.correlationId;
        if (correlation)
          await result(
            tx,
            'SELECT educore_r4.set_correlation($1::uuid)::text result',
            correlation,
          );
        const value = await action(tx);
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
        return value;
      },
      { isolationLevel: 'ReadCommitted', timeout: 20_000, maxWait: 5_000 },
    );
  }
  async close() {
    await Promise.all([
      this.auth.$disconnect(),
      this.api.$disconnect(),
      this.worker?.$disconnect(),
    ]);
  }
  onModuleDestroy() {
    return this.close();
  }
}
