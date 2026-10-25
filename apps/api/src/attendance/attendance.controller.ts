import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity-access/auth.service.js';
import { bearer, field, object, uuid } from '../identity-access/http.js';
import { result } from '../identity-access/r4-repository.js';
import { SessionGuard } from '../identity-access/session.guard.js';
import { instant, operationKey, page, revision } from '../scheduling/scheduling.controller.js';

function noQuery(req: Request) {
  if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
}
function commandInput(input: unknown, keys: string[], key: string | undefined) {
  const body = object(input, keys);
  return { body, key: operationKey(key), reason: field(body, 'reason', 2000) };
}
function status(value: unknown) {
  if (!['ATTENDED','UNEXCUSED','EXCUSED'].includes(String(value))) throw new BadRequestException('INVALID_ATTENDANCE_STATUS');
  return value;
}

@Controller('api/v1/tenants/:tenantId/attendance')
@UseGuards(SessionGuard)
export class AttendanceController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private read(tenantId: string, authorization: string | undefined, kind: string,
    target: string | null = null, from: string | null = null, to: string | null = null, pageNo = 1, pageSize = 20) {
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.attendance_mvp_read($1::uuid,$2::text,$3::uuid,$4::timestamptz,$5::timestamptz,$6::int,$7::int) result',
        uuid(tenantId), kind, target, from, to, pageNo, pageSize));
  }
  private command(tenantId: string, authorization: string | undefined, body: Record<string, unknown>) {
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r3.attendance($1::uuid,$2::jsonb) result', uuid(tenantId), JSON.stringify(body)));
  }
  @Get('due')
  due(@Param('tenantId') t: string, @Query() q: Record<string, unknown>, @Headers('authorization') a: string | undefined) {
    if (Object.keys(q).some((key) => !['from','to','page','pageSize'].includes(key))) throw new BadRequestException('INVALID_INPUT');
    return this.read(t, a, 'DUE', null, instant(q.from), instant(q.to), page(q.page, 1, 100000), page(q.pageSize, 20, 100));
  }
  @Get('sessions/:id')
  sheet(@Param('tenantId') t: string, @Param('id') id: string, @Headers('authorization') a: string | undefined, @Req() req: Request) {
    noQuery(req); return this.read(t, a, 'SHEET', uuid(id));
  }
  @Get('leaves')
  leaves(@Param('tenantId') t: string, @Query() q: Record<string, unknown>, @Headers('authorization') a: string | undefined) {
    if (Object.keys(q).some((key) => !['page','pageSize'].includes(key))) throw new BadRequestException('INVALID_INPUT');
    return this.read(t, a, 'LEAVES', null, null, null, page(q.page, 1, 100000), page(q.pageSize, 20, 100));
  }
  @Get('my-participants')
  participants(@Param('tenantId') t: string, @Query() q: Record<string, unknown>, @Headers('authorization') a: string | undefined) {
    if (Object.keys(q).some((key) => !['page','pageSize'].includes(key))) throw new BadRequestException('INVALID_INPUT');
    return this.read(t, a, 'MY_PARTICIPANTS', null, null, null, page(q.page, 1, 100000), page(q.pageSize, 20, 100));
  }
  @Post('sessions/:id/marks')
  mark(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { body, reason, key: operationKey } = commandInput(input, ['participantId','status','revision','reason'], key);
    return this.command(t, a, { operation: 'MARK', key: operationKey, reason, sessionId: uuid(id),
      participantId: uuid(body.participantId), status: status(body.status), revision: revision(body.revision) });
  }
  @Post('sessions/:id/finalize')
  finalize(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { reason, key: operationKey } = commandInput(input, ['reason'], key);
    return this.command(t, a, { operation: 'FINALIZE', key: operationKey, reason, sessionId: uuid(id) });
  }
  @Post('records/:id/correct')
  correct(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { body, reason, key: operationKey } = commandInput(input, ['status','revision','reason'], key);
    return this.command(t, a, { operation: 'CORRECT', key: operationKey, reason, attendanceId: uuid(id),
      status: status(body.status), revision: revision(body.revision) });
  }
  @Post('leaves')
  submitLeave(@Param('tenantId') t: string, @Body() input: unknown, @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { body, reason, key: operationKey } = commandInput(input, ['participantId','reason'], key);
    const tenantId = uuid(t), participantId = uuid(body.participantId);
    return this.auth.repository.transaction(bearer(a), async (tx) => {
      await result(tx, 'SELECT educore_r4.leave_self_guard($1::uuid,$2::uuid)::text result', tenantId, participantId);
      return result(tx, 'SELECT educore_r3.attendance($1::uuid,$2::jsonb) result', tenantId,
        JSON.stringify({ operation: 'LEAVE_SUBMIT', key: operationKey, reason, participantId }));
    });
  }
  @Post('leaves/:id/approve')
  approveLeave(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { reason, key: operationKey } = commandInput(input, ['reason'], key);
    return this.command(t, a, { operation: 'LEAVE_APPROVE', key: operationKey, reason, absenceId: uuid(id) });
  }
  @Post('leaves/:id/reject')
  rejectLeave(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { reason, key: operationKey } = commandInput(input, ['reason'], key);
    return this.command(t, a, { operation: 'LEAVE_REJECT', key: operationKey, reason, absenceId: uuid(id) });
  }
}
