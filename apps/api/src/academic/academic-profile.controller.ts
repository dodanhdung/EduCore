import { BadRequestException, Body, Controller, Headers, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity-access/auth.service.js';
import { bearer, field, object, uuid } from '../identity-access/http.js';
import { result } from '../identity-access/r4-repository.js';
import { SessionGuard } from '../identity-access/session.guard.js';

function dateOnly(value: unknown) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new BadRequestException('INVALID_DATE');
  return value;
}

function profile(kind: string, input: unknown, creating: boolean) {
  if (kind !== 'students' && kind !== 'teachers') throw new BadRequestException('INVALID_RESOURCE');
  const student = kind === 'students';
  const body = object(input, creating
    ? student ? ['code', 'name', 'dateOfBirth', 'reason'] : ['code', 'name', 'contact', 'reason']
    : student ? ['name', 'dateOfBirth', 'reason'] : ['name', 'contact', 'reason']);
  const output: Record<string, unknown> = { name: field(body, 'name', 200), reason: field(body, 'reason', 2000) };
  if (creating) output.code = field(body, 'code', 64);
  if (student) {
    if (body.dateOfBirth === undefined && !creating) throw new BadRequestException('INVALID_INPUT');
    output.dateOfBirth = dateOnly(body.dateOfBirth ?? null);
  } else {
    if (body.contact === undefined && !creating) throw new BadRequestException('INVALID_INPUT');
    if (body.contact !== undefined && body.contact !== null
      && (typeof body.contact !== 'string' || body.contact.length > 200))
      throw new BadRequestException('INVALID_CONTACT');
    output.contact = body.contact ?? null;
  }
  return output;
}

@Controller('api/v1/tenants/:tenantId/academic/profiles')
@UseGuards(SessionGuard)
export class AcademicProfileController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** Link-only candidate: eligibility, fresh permissions, CAS and receipt are
   * enforced atomically by the existing restricted PostgreSQL command boundary. */
  @Post(':kind/:id/membership-link')
  @HttpCode(200)
  linkMembership(@Param('tenantId') tenantId: string, @Param('kind') kind: string,
    @Param('id') id: string, @Body() input: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    if (Object.keys(req.query).length || !['teachers', 'students'].includes(kind)
      || typeof key !== 'string' || !key.trim() || key.length > 200)
      throw new BadRequestException('INVALID_INPUT');
    const body = object(input, ['membershipId', 'expectedMembershipId', 'reason', 'confirmed']);
    if (body.expectedMembershipId !== null || body.confirmed !== true)
      throw new BadRequestException('INVALID_INPUT');
    const command = { membershipId: uuid(body.membershipId), expectedMembershipId: null,
      reason: field(body, 'reason', 2000), confirmed: true, key };
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.profile_membership_link($1::uuid,$2::text,$3::uuid,$4::jsonb) result',
        uuid(tenantId), kind === 'teachers' ? 'TEACHER' : 'STUDENT', uuid(id), JSON.stringify(command)));
  }

  @Post(':kind')
  create(@Param('tenantId') tenantId: string, @Param('kind') kind: string,
    @Body() input: unknown, @Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
    const body = profile(kind, input, true);
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.academic_profile($1::uuid,$2::text,NULL::uuid,$3::jsonb) result',
        uuid(tenantId), kind === 'students' ? 'STUDENT_CREATE' : 'TEACHER_CREATE', JSON.stringify(body)));
  }

  @Patch(':kind/:id')
  update(@Param('tenantId') tenantId: string, @Param('kind') kind: string,
    @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
    const body = profile(kind, input, false);
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.academic_profile($1::uuid,$2::text,$3::uuid,$4::jsonb) result',
        uuid(tenantId), kind === 'students' ? 'STUDENT_UPDATE' : 'TEACHER_UPDATE', uuid(id), JSON.stringify(body)));
  }
}
