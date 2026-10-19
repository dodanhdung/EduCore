import { R4Repository, result } from '../identity-access/r4-repository.js';
export interface Claim {
  id: string;
  tenantId: string;
  fence: string;
  leaseUntil: string;
}
/** Each tick/claim/effect uses a separate DB transaction and never performs
 * external I/O while holding a lease/effect transaction. */
export class R4Worker {
  private timer?: ReturnType<typeof setTimeout>;
  private stopping = false;
  constructor(
    private readonly repository: R4Repository,
    private readonly enabled = false,
  ) {}
  private get client() {
    if (!this.repository.worker) throw Error('WORKER_CONNECTION_REQUIRED');
    return this.repository.worker;
  }
  claim() {
    return result<Claim | null>(
      this.client,
      'SELECT educore_r4.claim_job() result',
    );
  }
  perform(claim: Claim) {
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='3s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
        const data = await result(
          tx,
          'SELECT educore_r4.perform_job($1::uuid,$2::bigint) result',
          claim.id,
          claim.fence,
        );
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
        return data;
      },
      { isolationLevel: 'ReadCommitted', timeout: 25_000 },
    );
  }
  dispatch() {
    return result(this.client, 'SELECT educore_r4.dispatch_event() result');
  }
  async tick() {
    const claim = await this.claim();
    if (claim) await this.perform(claim);
    await this.dispatch();
  }
  onModuleInit() {
    if (!this.enabled) return;
    const run = async () => {
      try {
        await this.tick();
      } catch {
        console.warn('R4_WORKER_TICK_FAILED');
      }
      if (!this.stopping) this.timer = setTimeout(() => void run(), 1000);
    };
    this.timer = setTimeout(() => void run(), 0);
  }
  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
