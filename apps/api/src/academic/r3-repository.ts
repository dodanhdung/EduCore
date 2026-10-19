import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export const R3_CONNECTION = Symbol('R3_CONNECTION');
export type R3Result = Record<string, unknown> & { id: string };

/** Trusted internal composition only. Login/session binding is operator-owned;
 * no request actor or fallback admin DATABASE_URL is accepted. */
@Injectable()
export class R3Repository implements OnModuleDestroy {
  readonly prisma: PrismaClient;
  constructor(@Inject(R3_CONNECTION) connection: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: connection }),
    });
  }
  command(
    domain: 'academic' | 'scheduling' | 'attendance',
    tenant: string,
    body: Record<string, unknown>,
  ) {
    const query = {
      academic: 'SELECT educore_r3.academic($1::uuid,$2::jsonb) result',
      scheduling: 'SELECT educore_r3.scheduling($1::uuid,$2::jsonb) result',
      attendance: 'SELECT educore_r3.attendance($1::uuid,$2::jsonb) result',
    }[domain];
    if (!query) throw new Error('UNSUPPORTED_R3_DOMAIN');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");
        const rows = await tx.$queryRawUnsafe<{ result: R3Result }[]>(
          query,
          tenant,
          JSON.stringify(body),
        );
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
        return rows[0].result;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 20_000 },
    );
  }
  async calendar(tenant: string, from: string, to: string, student?: string) {
    const rows = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");
        return tx.$queryRawUnsafe<{ result: unknown[] }[]>(
          'SELECT educore_r3.calendar($1::uuid,$2::timestamptz,$3::timestamptz,$4::uuid) result',
          tenant,
          from,
          to,
          student ?? null,
        );
      },
      { isolationLevel: 'ReadCommitted', timeout: 10_000 },
    );
    return rows[0].result;
  }
  async placementContext(tenant: string, student: string, classId: string) {
    const rows = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");
        return tx.$queryRawUnsafe<{ result: unknown }[]>(
          'SELECT educore_r3.placement_context($1::uuid,$2::uuid,$3::uuid) result',
          tenant,
          student,
          classId,
        );
      },
      { isolationLevel: 'ReadCommitted', timeout: 10_000 },
    );
    return rows[0].result;
  }
  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
