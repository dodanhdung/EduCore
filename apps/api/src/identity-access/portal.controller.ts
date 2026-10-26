import { BadRequestException, Controller, Get, Headers, Inject, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { bearer, uuid } from './http.js';
import { result } from './r4-repository.js';
import { SessionGuard } from './session.guard.js';

@Controller('api/v1/tenants/:tenantId/portal')
@UseGuards(SessionGuard)
export class PortalController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  private read(authorization: string | undefined, tenantId: string, kind: string, target: string | null, req: Request) {
    if (Object.keys(req.query).length || req.body !== undefined) throw new BadRequestException('INVALID_INPUT');
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.portal_read($1::uuid,$2::text,$3::uuid) result', uuid(tenantId), kind, target));
  }

  @Get('context')
  context(@Headers('authorization') authorization: string | undefined, @Param('tenantId') tenantId: string, @Req() req: Request) {
    return this.read(authorization, tenantId, 'CONTEXT', null, req);
  }

  @Get('overview')
  overview(@Headers('authorization') authorization: string | undefined, @Param('tenantId') tenantId: string, @Req() req: Request) {
    return this.read(authorization, tenantId, 'OVERVIEW', null, req);
  }

  @Get('teacher-sessions')
  teacherSessions(@Headers('authorization') authorization: string | undefined, @Param('tenantId') tenantId: string, @Req() req: Request) {
    return this.read(authorization, tenantId, 'TEACHER_SESSIONS', null, req);
  }

  @Get('student-sessions')
  studentSessions(@Headers('authorization') authorization: string | undefined, @Param('tenantId') tenantId: string, @Req() req: Request) {
    return this.read(authorization, tenantId, 'STUDENT_SESSIONS', null, req);
  }

  @Get('children/:studentId')
  child(@Headers('authorization') authorization: string | undefined, @Param('tenantId') tenantId: string,
    @Param('studentId') studentId: string, @Req() req: Request) {
    return this.read(authorization, tenantId, 'CHILD', uuid(studentId), req);
  }

  @Get('billing/:studentId')
  billing(@Headers('authorization') authorization: string | undefined, @Param('tenantId') tenantId: string,
    @Param('studentId') studentId: string, @Req() req: Request) {
    return this.read(authorization, tenantId, 'BILLING', uuid(studentId), req);
  }
}
