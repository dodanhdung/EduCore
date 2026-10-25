import { BadRequestException, Body, Controller, Headers, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity-access/auth.service.js';
import { bearer, field, object, uuid } from '../identity-access/http.js';
import { result } from '../identity-access/r4-repository.js';
import { SessionGuard } from '../identity-access/session.guard.js';

const kinds = { subjects: 'SUBJECT', levels: 'LEVEL', courses: 'COURSE', classes: 'CLASS' } as const;
function date(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new BadRequestException('INVALID_DATE');
  return value;
}

function payload(kind: string, input: unknown, creating: boolean) {
  if (!Object.hasOwn(kinds, kind)) throw new BadRequestException('INVALID_RESOURCE');
  const keys = creating
    ? kind === 'subjects' ? ['code', 'name', 'reason']
      : kind === 'levels' ? ['code', 'name', 'sortOrder', 'reason']
        : kind === 'courses' ? ['code', 'name', 'subjectId', 'levelId', 'description', 'reason']
          : ['code', 'name', 'courseId', 'capacity', 'startDate', 'endDate', 'reason']
    : kind === 'subjects' ? ['name', 'active', 'reason']
      : kind === 'levels' ? ['name', 'sortOrder', 'active', 'reason']
        : kind === 'courses' ? ['name', 'description', 'reason'] : ['name', 'reason'];
  const body = object(input, keys);
  const output: Record<string, unknown> = { name: field(body, 'name', 200), reason: field(body, 'reason', 2000) };
  if (creating) output.code = field(body, 'code', 64);
  if ((kind === 'subjects' || kind === 'levels') && !creating && body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new BadRequestException('INVALID_ACTIVE');
    output.active = body.active;
  }
  if (kind === 'levels') {
    if (!Number.isSafeInteger(body.sortOrder) || (body.sortOrder as number) < 0)
      throw new BadRequestException('INVALID_SORT_ORDER');
    output.sortOrder = body.sortOrder;
  }
  if (kind === 'courses') {
    if (creating) { output.subjectId = uuid(body.subjectId); output.levelId = uuid(body.levelId); }
    if (body.description !== null && body.description !== undefined
      && (typeof body.description !== 'string' || body.description.length > 2000))
      throw new BadRequestException('INVALID_DESCRIPTION');
    output.description = body.description ?? null;
  }
  if (kind === 'classes' && creating) {
    output.courseId = uuid(body.courseId);
    if (!Number.isSafeInteger(body.capacity) || (body.capacity as number) < 1 || (body.capacity as number) > 100000)
      throw new BadRequestException('INVALID_CAPACITY');
    output.capacity = body.capacity;
    output.startDate = date(body.startDate);
    output.endDate = date(body.endDate);
    if (output.startDate && output.endDate && output.endDate < output.startDate)
      throw new BadRequestException('INVALID_DATE_RANGE');
  }
  return output;
}

@Controller('api/v1/tenants/:tenantId/academic/catalog')
@UseGuards(SessionGuard)
export class AcademicCatalogController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post(':kind')
  create(@Param('tenantId') tenantId: string, @Param('kind') kind: string,
    @Body() input: unknown, @Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
    const body = payload(kind, input, true);
    const operation = `${kinds[kind as keyof typeof kinds]}_CREATE`;
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.academic_catalog($1::uuid,$2::text,NULL::uuid,$3::jsonb) result',
        uuid(tenantId), operation, JSON.stringify(body)));
  }

  @Patch(':kind/:id')
  update(@Param('tenantId') tenantId: string, @Param('kind') kind: string, @Param('id') id: string,
    @Body() input: unknown, @Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
    const body = payload(kind, input, false);
    const operation = `${kinds[kind as keyof typeof kinds]}_UPDATE`;
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.academic_catalog($1::uuid,$2::text,$3::uuid,$4::jsonb) result',
        uuid(tenantId), operation, uuid(id), JSON.stringify(body)));
  }
}
