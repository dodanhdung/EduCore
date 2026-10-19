import { AsyncLocalStorage } from 'node:async_hooks';
/** Trace metadata only; identity is resolved exclusively by the SQL binding. */
export const requestTrace = new AsyncLocalStorage<{ correlationId: string }>();
