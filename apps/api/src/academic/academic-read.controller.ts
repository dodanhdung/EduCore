import { BadRequestException, Controller, Get, Headers, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity-access/auth.service.js';
import { bearer, uuid } from '../identity-access/http.js';
import { result } from '../identity-access/r4-repository.js';
import { SessionGuard } from '../identity-access/session.guard.js';

const lists = {
  students: 'STUDENTS', teachers: 'TEACHERS', subjects: 'SUBJECTS',
  levels: 'LEVELS', courses: 'COURSES', classes: 'CLASSES',
} as const;
const details = { students: 'STUDENT', teachers: 'TEACHER', classes: 'CLASS' } as const;

function page(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new BadRequestException('INVALID_PAGE');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > max) throw new BadRequestException('INVALID_PAGE');
  return number;
}

@Controller('api/v1/tenants/:tenantId/academic')
@UseGuards(SessionGuard)
export class AcademicReadController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get('permissions/capabilities/current')
  capabilities(@Param('tenantId') tenantId: string, @Query() query: Record<string, unknown>,
    @Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    if (Object.keys(query).some((key) => !['classId', 'studentId'].includes(key)) || req.body !== undefined)
      throw new BadRequestException('INVALID_INPUT');
    const classId = query.classId === undefined ? null : uuid(query.classId);
    const studentId = query.studentId === undefined ? null : uuid(query.studentId);
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.academic_capabilities($1::uuid,$2::uuid,$3::uuid) result',
        uuid(tenantId), classId, studentId));
  }

  @Get(':kind')
  list(@Param('tenantId') tenantId: string, @Param('kind') kind: string,
    @Query() query: Record<string, unknown>, @Headers('authorization') authorization: string | undefined,
    @Req() req: Request) {
    if (!Object.hasOwn(lists, kind) || Object.keys(query).some((key) => !['q', 'page', 'pageSize'].includes(key))
      || (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 100))
      || req.body !== undefined) throw new BadRequestException('INVALID_INPUT');
    const operation = lists[kind as keyof typeof lists];
    const pageNo = page(query.page, 1, 100000);
    const pageSize = page(query.pageSize, 20, 100);
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.academic_read($1::uuid,$2::text,NULL::uuid,$3::text,$4::int,$5::int) result',
        uuid(tenantId), operation, query.q || null, pageNo, pageSize));
  }

  @Get(':kind/:id')
  detail(@Param('tenantId') tenantId: string, @Param('kind') kind: string,
    @Param('id') id: string, @Headers('authorization') authorization: string | undefined,
    @Req() req: Request) {
    if (!Object.hasOwn(details, kind) || Object.keys(req.query).length || req.body !== undefined)
      throw new BadRequestException('INVALID_INPUT');
    const operation = details[kind as keyof typeof details];
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.academic_read($1::uuid,$2::text,$3::uuid) result',
        uuid(tenantId), operation, uuid(id)));
  }

  @Get('classes/:classId/students/:studentId/placement-context')
  placement(@Param('tenantId') tenantId: string, @Param('classId') classId: string,
    @Param('studentId') studentId: string, @Headers('authorization') authorization: string | undefined,
    @Req() req: Request) {
    if (Object.keys(req.query).length || req.body !== undefined)
      throw new BadRequestException('INVALID_INPUT');
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r3.placement_context($1::uuid,$2::uuid,$3::uuid) result',
        uuid(tenantId), uuid(studentId), uuid(classId)));
  }
}
