import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity-access/auth.service.js';
import { bearer, field, object, uuid } from '../identity-access/http.js';
import { result } from '../identity-access/r4-repository.js';
import { SessionGuard } from '../identity-access/session.guard.js';

export function instant(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new BadRequestException('INVALID_TIME');
  return value;
}
export function revision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new BadRequestException('INVALID_REVISION');
  return value as number;
}
export function operationKey(value: string | undefined): string {
  if (!value?.trim() || value.length > 200) throw new BadRequestException('OPERATION_KEY_REQUIRED');
  return value;
}
export function page(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max)
    throw new BadRequestException('INVALID_PAGE');
  return Number(value);
}
function noQuery(req: Request) {
  if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
}
function interval(start: unknown, end: unknown) {
  const startsAt = instant(start), endsAt = instant(end);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new BadRequestException('INVALID_INTERVAL');
  return { startsAt, endsAt };
}
function commandBody(input: unknown, keys: string[], key: string | undefined) {
  const body = object(input, keys);
  return { body, key: operationKey(key), reason: field(body, 'reason', 2000) };
}

@Controller('api/v1/tenants/:tenantId/scheduling')
@UseGuards(SessionGuard)
export class SchedulingController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private read(tenantId: string, authorization: string | undefined, kind: string,
    target: string | null = null, from: string | null = null, to: string | null = null, pageNo = 1, pageSize = 20) {
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r4.schedule_mvp_read($1::uuid,$2::text,$3::uuid,$4::timestamptz,$5::timestamptz,$6::int,$7::int) result',
        uuid(tenantId), kind, target, from, to, pageNo, pageSize));
  }
  private command(tenantId: string, authorization: string | undefined, body: Record<string, unknown>) {
    return this.auth.repository.transaction(bearer(authorization), (tx) =>
      result(tx, 'SELECT educore_r3.scheduling($1::uuid,$2::jsonb) result', uuid(tenantId), JSON.stringify(body)));
  }
  @Get('calendar')
  calendar(@Param('tenantId') tenantId: string, @Query() query: Record<string, unknown>, @Headers('authorization') auth: string | undefined) {
    if (Object.keys(query).some((key) => !['from', 'to', 'page', 'pageSize'].includes(key))) throw new BadRequestException('INVALID_INPUT');
    return this.read(tenantId, auth, 'CALENDAR', null, instant(query.from), instant(query.to), page(query.page, 1, 100000), page(query.pageSize, 20, 100));
  }
  @Get('personal')
  personal(@Param('tenantId') tenantId: string, @Query() query: Record<string, unknown>, @Headers('authorization') auth: string | undefined) {
    if (Object.keys(query).some((key) => !['from', 'to', 'page', 'pageSize'].includes(key))) throw new BadRequestException('INVALID_INPUT');
    return this.read(tenantId, auth, 'PERSONAL', null, instant(query.from), instant(query.to), page(query.page, 1, 100000), page(query.pageSize, 20, 100));
  }
  @Get('sessions/:id')
  session(@Param('tenantId') t: string, @Param('id') id: string, @Headers('authorization') a: string | undefined, @Req() req: Request) {
    noQuery(req); return this.read(t, a, 'SESSION', uuid(id));
  }
  @Get('rooms')
  rooms(@Param('tenantId') t: string, @Query() q: Record<string, unknown>, @Headers('authorization') a: string | undefined) {
    if (Object.keys(q).some((key) => !['page', 'pageSize'].includes(key))) throw new BadRequestException('INVALID_INPUT');
    return this.read(t, a, 'ROOMS', null, null, null, page(q.page, 1, 100000), page(q.pageSize, 20, 100));
  }
  @Get('unavailability')
  busy(@Param('tenantId') t: string, @Query() q: Record<string, unknown>, @Headers('authorization') a: string | undefined) {
    if (Object.keys(q).some((key) => !['page', 'pageSize'].includes(key))) throw new BadRequestException('INVALID_INPUT');
    return this.read(t, a, 'BUSY', null, null, null, page(q.page, 1, 100000), page(q.pageSize, 20, 100));
  }
  @Get('resources')
  resources(@Param('tenantId') t: string, @Query() q: Record<string, unknown>, @Headers('authorization') a: string | undefined) {
    if (Object.keys(q).some((key) => !['page', 'pageSize'].includes(key))) throw new BadRequestException('INVALID_INPUT');
    return this.read(t, a, 'RESOURCES', null, null, null, page(q.page, 1, 100000), page(q.pageSize, 20, 100));
  }
  @Get('choices')
  choices(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Req() req: Request) {
    noQuery(req); return this.read(t, a, 'CHOICES');
  }
  @Get('capabilities')
  capabilities(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Req() req: Request) {
    noQuery(req); return this.read(t, a, 'CAPABILITIES');
  }
  @Get('drafts/:id/preview')
  preview(@Param('tenantId') t: string, @Param('id') id: string, @Query() query: Record<string, unknown>,
    @Headers('authorization') a: string | undefined) {
    if (Object.keys(query).some((key) => key !== 'series') || (query.series !== undefined && query.series !== 'true'))
      throw new BadRequestException('INVALID_INPUT');
    return this.auth.repository.transaction(bearer(a), (tx) =>
      result(tx, 'SELECT educore_r4.schedule_mvp_preview($1::uuid,$2::uuid,$3::boolean) result',
        uuid(t), uuid(id), query.series === 'true'));
  }
  @Post('sessions')
  create(@Param('tenantId') t: string, @Body() input: unknown, @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req);
    const { body, reason, key: operationKey } = commandBody(input, ['classId','teacherId','roomId','deliveryMode','startsAt','endsAt','reason'], key);
    if (!['ONLINE','ONSITE'].includes(String(body.deliveryMode))) throw new BadRequestException('INVALID_DELIVERY_MODE');
    if (body.deliveryMode === 'ONSITE' && !body.roomId) throw new BadRequestException('ROOM_REQUIRED');
    return this.command(t, a, { operation: 'CREATE', key: operationKey, reason, classId: uuid(body.classId),
      teacherId: uuid(body.teacherId), roomId: body.roomId ? uuid(body.roomId) : null, deliveryMode: body.deliveryMode,
      ...interval(body.startsAt, body.endsAt) });
  }
  @Post('series')
  createSeries(@Param('tenantId') t: string, @Body() input: unknown, @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req);
    const { body, reason, key: operationKey } = commandBody(input, ['classId','teacherId','roomId','deliveryMode','weekday','localStartTime','durationMinutes','validFrom','validTo','reason'], key);
    if (!['ONLINE','ONSITE'].includes(String(body.deliveryMode)) || (body.deliveryMode === 'ONSITE' && !body.roomId)
      || !Number.isInteger(body.weekday) || (body.weekday as number) < 1 || (body.weekday as number) > 7
      || !Number.isInteger(body.durationMinutes) || (body.durationMinutes as number) < 1 || (body.durationMinutes as number) > 1440
      || typeof body.localStartTime !== 'string' || !/^\d{2}:\d{2}$/.test(body.localStartTime)
      || typeof body.validFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.validFrom)
      || typeof body.validTo !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.validTo)) throw new BadRequestException('INVALID_SERIES');
    return this.command(t, a, { operation: 'CREATE_SERIES', key: operationKey, reason, classId: uuid(body.classId),
      teacherId: uuid(body.teacherId), roomId: body.roomId ? uuid(body.roomId) : null, deliveryMode: body.deliveryMode,
      weekday: body.weekday, localStartTime: body.localStartTime, durationMinutes: body.durationMinutes,
      validFrom: body.validFrom, validTo: body.validTo });
  }
  @Post('sessions/:id/confirm')
  confirm(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { reason, key: operationKey } = commandBody(input, ['reason'], key);
    return this.command(t, a, { operation: 'CONFIRM', key: operationKey, reason, sessionId: uuid(id) });
  }
  @Post('series/:id/confirm')
  confirmSeries(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { reason, key: operationKey } = commandBody(input, ['reason'], key);
    return this.command(t, a, { operation: 'CONFIRM_SERIES', key: operationKey, reason, seriesId: uuid(id) });
  }
  @Post('sessions/:id/reschedule')
  reschedule(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { body, reason, key: operationKey } = commandBody(input, ['revision','startsAt','endsAt','roomId','reason'], key);
    return this.command(t, a, { operation: 'RESCHEDULE', key: operationKey, reason, sessionId: uuid(id), revision: revision(body.revision),
      ...(body.roomId !== undefined ? { roomId: body.roomId === null ? null : uuid(body.roomId) } : {}), ...interval(body.startsAt, body.endsAt) });
  }
  @Post('sessions/:id/cancel')
  cancel(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { body, reason, key: operationKey } = commandBody(input, ['revision','reason'], key);
    return this.command(t, a, { operation: 'CANCEL', key: operationKey, reason, sessionId: uuid(id), revision: revision(body.revision) });
  }
  @Post('rooms')
  createRoom(@Param('tenantId') t: string, @Body() input: unknown, @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { body, reason, key: operationKey } = commandBody(input, ['code','name','capacity','reason'], key);
    if (!Number.isInteger(body.capacity) || (body.capacity as number) < 1) throw new BadRequestException('INVALID_CAPACITY');
    return this.command(t, a, { operation: 'ROOM', key: operationKey, reason, code: field(body, 'code', 40), name: field(body, 'name', 200), capacity: body.capacity });
  }
  @Patch('rooms/:id')
  updateRoom(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { body, reason, key: operationKey } = commandBody(input, ['capacity','active','reason'], key);
    if (!Number.isInteger(body.capacity) || (body.capacity as number) < 1 || (body.active !== undefined && typeof body.active !== 'boolean')) throw new BadRequestException('INVALID_ROOM');
    return this.command(t, a, { operation: 'ROOM', key: operationKey, reason, roomId: uuid(id), capacity: body.capacity, ...(body.active === undefined ? {} : { active: body.active }) });
  }
  @Post('unavailability')
  createBusy(@Param('tenantId') t: string, @Body() input: unknown, @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { body, reason, key: operationKey } = commandBody(input, ['resourceKind','resourceId','startsAt','endsAt','reason'], key);
    if (!['ROOM','TEACHER','STUDENT'].includes(String(body.resourceKind))) throw new BadRequestException('INVALID_RESOURCE');
    return this.command(t, a, { operation: 'BUSY_CREATE', key: operationKey, reason, resourceKind: body.resourceKind,
      resourceId: uuid(body.resourceId), ...interval(body.startsAt, body.endsAt) });
  }
  @Post('unavailability/:id/confirm')
  confirmBusy(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { reason, key: operationKey } = commandBody(input, ['reason'], key);
    return this.command(t, a, { operation: 'BUSY_CONFIRM', key: operationKey, reason, unavailabilityId: uuid(id) });
  }
  @Post('unavailability/:id/cancel')
  cancelBusy(@Param('tenantId') t: string, @Param('id') id: string, @Body() input: unknown,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') key: string | undefined, @Req() req: Request) {
    noQuery(req); const { reason, key: operationKey } = commandBody(input, ['reason'], key);
    return this.command(t, a, { operation: 'BUSY_CANCEL', key: operationKey, reason, unavailabilityId: uuid(id) });
  }
}
