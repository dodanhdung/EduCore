import { BadRequestException } from '@nestjs/common';
import { AuthService } from '../identity-access/auth.service.js';
import { RuntimeService } from '../workflow-approval/runtime.service.js';
export function score(value: unknown): string {
  if (typeof value !== 'string' || !/^(10(\.0)?|[0-9](\.[0-9])?)$/.test(value))
    throw new BadRequestException('INVALID_SCORE');
  return value;
}
export class GradingService extends RuntimeService {
  constructor(auth: AuthService) {
    super(auth);
  }
  grade(token: string, tenant: string, body: Record<string, unknown>) {
    if (body.score !== undefined) score(body.score);
    return this.run(
      token,
      'SELECT educore_r5.grade($1::uuid,$2::jsonb) result',
      tenant,
      JSON.stringify(body),
    );
  }
  draft(token: string, tenant: string, id: string) {
    return this.run(
      token,
      'SELECT educore_r5.draft($1::uuid,$2::uuid) result',
      tenant,
      id,
    );
  }
  published(
    token: string,
    tenant: string,
    student: string,
    q: Record<string, unknown>,
  ) {
    return this.run(
      token,
      'SELECT educore_r5.published_grades($1::uuid,$2::uuid,$3::jsonb) result',
      tenant,
      student,
      JSON.stringify(q),
    );
  }
  placement(token: string, tenant: string, student: string, classId: string) {
    return this.run(
      token,
      'SELECT educore_r3.placement_context($1::uuid,$2::uuid,$3::uuid) result',
      tenant,
      student,
      classId,
    );
  }
}
