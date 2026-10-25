import { BadRequestException, Body, Controller, Headers, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity-access/auth.service.js';
import { bearer, field, object, uuid } from '../identity-access/http.js';
import { result } from '../identity-access/r4-repository.js';
import { SessionGuard } from '../identity-access/session.guard.js';

function operationKey(value: string | undefined) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw new BadRequestException('OPERATION_KEY_REQUIRED');
  return value;
}

function isoInstant(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new BadRequestException('INVALID_TIME');
  return value;
}

function placement(value: unknown) {
  const raw = object(value, ['basis', 'subjectId', 'levelId', 'reason', 'grades']);
  const basis = field(raw, 'basis', 32);
  if (!['STAFF_CONFIRMATION', 'ENTRY_TEST', 'PUBLISHED_GRADES'].includes(basis))
    throw new BadRequestException('INVALID_PLACEMENT');
  const common = { basis, subjectId: uuid(raw.subjectId), levelId: uuid(raw.levelId),
    reason: field(raw, 'reason', 2000) };
  if (basis !== 'PUBLISHED_GRADES') {
    if (raw.grades !== undefined) throw new BadRequestException('INVALID_PLACEMENT');
    return common;
  }
  if (!Array.isArray(raw.grades) || !raw.grades.length || raw.grades.length > 20)
    throw new BadRequestException('INVALID_PLACEMENT');
  const grades = raw.grades.map((item: unknown) => {
    const grade = object(item, ['gradeId', 'revision', 'evidenceHash']);
    if (!Number.isInteger(grade.revision) || (grade.revision as number) < 1
      || typeof grade.evidenceHash !== 'string' || !/^[0-9a-f]{64}$/.test(grade.evidenceHash))
      throw new BadRequestException('INVALID_PLACEMENT');
    return { gradeId: uuid(grade.gradeId), revision: grade.revision, evidenceHash: grade.evidenceHash };
  });
  if (new Set(grades.map((grade) => grade.gradeId)).size !== grades.length)
    throw new BadRequestException('INVALID_PLACEMENT');
  return { ...common, grades };
}

@Controller('api/v1/tenants/:tenantId/academic')
@UseGuards(SessionGuard)
export class AcademicCommandController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('enrollments')
  enroll(@Param('tenantId') tenantId: string, @Body() input: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
    const body = object(input, ['classId', 'studentId', 'effectiveFrom', 'placement', 'reason', 'confirmed']);
    if (body.confirmed !== true) throw new BadRequestException('CONFIRMATION_REQUIRED');
    const command = { operation: 'ENROLL', key: operationKey(key), reason: field(body, 'reason', 2000),
      classId: uuid(body.classId), studentId: uuid(body.studentId),
      effectiveFrom: isoInstant(body.effectiveFrom), placement: placement(body.placement) };
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r3.academic($1::uuid,$2::jsonb) result', uuid(tenantId), JSON.stringify(command)));
  }

  @Post('transfers')
  requestTransfer(@Param('tenantId') tenantId: string, @Body() input: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
    const body = object(input, ['enrollmentId', 'targetClassId', 'effectiveAt', 'reason', 'confirmed']);
    if (body.confirmed !== true) throw new BadRequestException('CONFIRMATION_REQUIRED');
    const command = { operation: 'TRANSFER_REQUEST', key: operationKey(key), reason: field(body, 'reason', 2000),
      enrollmentId: uuid(body.enrollmentId), targetClassId: uuid(body.targetClassId),
      effectiveAt: isoInstant(body.effectiveAt) };
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r3.academic($1::uuid,$2::jsonb) result', uuid(tenantId), JSON.stringify(command)));
  }

  @Post('teacher-assignments')
  assignTeacher(@Param('tenantId') tenantId: string, @Body() input: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
    const body = object(input, ['classId', 'teacherId', 'validFrom', 'validTo', 'reason', 'confirmed']);
    if (body.confirmed !== true) throw new BadRequestException('CONFIRMATION_REQUIRED');
    const validFrom = isoInstant(body.validFrom);
    const validTo = body.validTo === undefined || body.validTo === null ? null : isoInstant(body.validTo);
    if (Date.parse(validFrom) <= Date.now() || (validTo && Date.parse(validTo) <= Date.parse(validFrom)))
      throw new BadRequestException('INVALID_ASSIGNMENT_INTERVAL');
    const command = { operation: 'ASSIGN_TEACHER', key: operationKey(key), reason: field(body, 'reason', 2000),
      classId: uuid(body.classId), teacherId: uuid(body.teacherId), validFrom, validTo };
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r3.academic($1::uuid,$2::jsonb) result', uuid(tenantId), JSON.stringify(command)));
  }
}
