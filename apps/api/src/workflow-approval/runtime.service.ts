import { AuthService } from '../identity-access/auth.service.js';
import { result } from '../identity-access/r4-repository.js';
/** Owns the HTTP transaction; R2/R3 own domain locks, authorization and effects. */
export class RuntimeService {
  constructor(readonly auth: AuthService) {}
  run<T>(token: string, query: string, ...args: unknown[]) {
    this.auth.tokens.verify(token);
    return this.auth.repository.transaction(token, (tx) =>
      result<T>(tx, query, ...args),
    );
  }
  iam(token: string, tenant: string, body: Record<string, unknown>) {
    return this.run(
      token,
      'SELECT educore_r4.iam($1::uuid,$2::jsonb) result',
      tenant,
      JSON.stringify(body),
    );
  }
  read(
    token: string,
    tenant: string,
    kind: string,
    query: Record<string, unknown>,
  ) {
    return this.run(
      token,
      'SELECT educore_r4.read($1::uuid,$2::text,$3::jsonb) result',
      tenant,
      kind,
      JSON.stringify(query),
    );
  }
  billing(token: string, tenant: string, body: Record<string, unknown>) {
    return this.run(
      token,
      'SELECT educore_r2.execute($1::uuid,$2::jsonb) result',
      tenant,
      JSON.stringify(body),
    );
  }
  decide(token: string, tenant: string, body: Record<string, unknown>) {
    return this.run(
      token,
      'SELECT educore_r2.r4_decide($1::uuid,$2::jsonb) result',
      tenant,
      JSON.stringify(body),
    );
  }
  async execute(token: string, tenant: string, body: Record<string, unknown>) {
    try {
      return await this.billing(token, tenant, {
        ...body,
        operation: 'EXECUTE_APPROVAL',
      });
    } catch (error) {
      // Separate post-rollback reconciliation preserves the committed decision.
      try {
        const outcome = await this.run(
          token,
          'SELECT educore_r2.execution_outcome($1::uuid,$2::uuid,$3::text) result',
          tenant,
          body.approvalId,
          body.key,
        );
        if (outcome) return outcome;
      } catch {
        /* Preserve initial denial/failure. */
      }
      throw error;
    }
  }
}
