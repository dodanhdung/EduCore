import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export const R2_CONNECTION = Symbol('R2_CONNECTION');
export type R2Result = Record<string, unknown> & { id?: string };

/** Explicit connection supplied by a trusted backend composition root, never a
 * request URL. SQL binds session_user to an operator-provisioned auth session.
 * No default DATABASE_URL fallback or superuser runtime connection is created.
 */
@Injectable()
export class R2Repository implements OnModuleDestroy {
  readonly prisma: PrismaClient;
  constructor(@Inject(R2_CONNECTION) url: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
  }
  async command(
    tenantId: string,
    command: Record<string, unknown>,
    validate?: (result: R2Result) => void,
  ): Promise<R2Result> {
    // PostgreSQL command owns locks/fresh authorization and all effects inside
    // this Prisma transaction. Replayed responses are durable snapshots.
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");
          await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");
          const rows = await tx.$queryRawUnsafe<{ result: R2Result }[]>(
            'SELECT educore_r2.execute($1::uuid,$2::jsonb) AS result',
            tenantId,
            JSON.stringify(command),
          );
          validate?.(rows[0].result);
          await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
          return rows[0].result;
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 20_000 },
      );
    } catch (error) {
      if (command.operation === 'EXECUTE_APPROVAL') {
        try {
          const rows = await this.prisma.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");
              return tx.$queryRawUnsafe<{ result: R2Result | null }[]>(
                'SELECT educore_r2.execution_outcome($1::uuid,$2::uuid,$3::text) result',
                tenantId,
                command.approvalId,
                command.key,
              );
            },
            { isolationLevel: 'ReadCommitted', timeout: 10_000 },
          );
          if (rows[0].result) return rows[0].result;
        } catch {
          /* Preserve the original error; revoked rights deny lookup. */
        }
      }
      throw error;
    }
  }
  async summary(tenantId: string, studentId: string): Promise<R2Result> {
    const rows = await this.prisma.$queryRawUnsafe<{ result: R2Result }[]>(
      'SELECT educore_r2.summary($1::uuid,$2::uuid) AS result',
      tenantId,
      studentId,
    );
    return rows[0].result;
  }
  async receivable(tenantId: string, invoiceId: string): Promise<R2Result> {
    const rows = await this.prisma.$queryRawUnsafe<{ result: R2Result }[]>(
      'SELECT educore_r2.receivable($1::uuid,$2::uuid) result',
      tenantId,
      invoiceId,
    );
    return rows[0].result;
  }
  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
