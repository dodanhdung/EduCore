import { AsyncLocalStorage } from 'node:async_hooks';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { from, lastValueFrom } from 'rxjs';
import { correlation } from '../identity-access/http.js';

export type AdmissionMode = 'open' | 'closed';
const health = (req: Request) => ['GET', 'HEAD'].includes(req.method) && req.originalUrl === '/';

export class AdmissionClosed extends ServiceUnavailableException {
  constructor() { super('MAINTENANCE'); }
}

/** Operator-owned process admission. No public switch or permission bypass.
 * Metadata startup queries remain separate from request/business execution. */
export class WriteAdmission {
  private closed: boolean;
  private drained = false;
  private active = 0;
  private scheduled = false;
  private readonly context = new AsyncLocalStorage<boolean>();
  private readonly waiters = new Set<() => void>();

  constructor(mode: AdmissionMode = 'open') { this.closed = mode === 'closed'; }
  snapshot() { return { mode: this.closed ? 'closed' : 'open', active: this.active, drained: this.drained }; }
  close() { this.closed = true; this.notify(); }

  private enter() {
    if (this.drained || (this.closed && !this.context.getStore())) throw new AdmissionClosed();
    this.active++;
    let released = false;
    return () => { if (!released) { released = true; this.active--; this.notify(); } };
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const release = this.enter();
    try { return await this.context.run(true, operation); }
    finally { release(); }
  }

  private notify() {
    if (!this.closed || this.active || !this.waiters.size || this.scheduled) return;
    this.scheduled = true;
    // Guards can hand off to controllers in microtasks. Check after that handoff,
    // never report drain merely because the HTTP connection was closed.
    setImmediate(() => {
      this.scheduled = false;
      if (!this.closed || this.active) return;
      this.drained = true;
      for (const done of this.waiters) done();
    });
  }

  async closeAndDrain(timeoutMs = 30_000) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw Error('INVALID_DRAIN_TIMEOUT');
    this.close();
    if (this.drained) return;
    await new Promise<void>((resolve, reject) => {
      const done = () => { clearTimeout(timer); this.waiters.delete(done); resolve(); };
      const timer = setTimeout(() => {
        this.waiters.delete(done);
        reject(Error('MAINTENANCE_DRAIN_TIMEOUT'));
      }, timeoutMs);
      this.waiters.add(done);
      this.notify();
    });
  }

  middleware(req: Request, res: Response, next: NextFunction) {
    if (health(req)) return next();
    let release: () => void;
    try { release = this.enter(); }
    catch (error) {
      if (!(error instanceof AdmissionClosed)) throw error;
      const correlationId = correlation(req);
      res.setHeader('X-Request-Id', correlationId);
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ code: 'MAINTENANCE', message: 'MAINTENANCE', correlationId });
      return;
    }
    res.once('finish', release);
    res.once('close', release);
    this.context.run(true, next);
  }
}

/** Subscribe independently of socket cancellation. A controller's Promise
 * (including password work or DB commit) must settle before its lease ends. */
export class AdmissionInterceptor implements NestInterceptor {
  constructor(private readonly admission: WriteAdmission) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    if (health(context.switchToHttp().getRequest<Request>())) return next.handle();
    return from(this.admission.run(() => lastValueFrom(next.handle())));
  }
}

export function admissionFromEnv(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === 'production' && env.R13_ADMISSION_MODE === undefined)
    throw Error('ADMISSION_MODE_REQUIRED_IN_PRODUCTION');
  const mode = env.R13_ADMISSION_MODE ?? 'open';
  if (mode !== 'open' && mode !== 'closed') throw Error('INVALID_ADMISSION_MODE');
  return new WriteAdmission(mode);
}
