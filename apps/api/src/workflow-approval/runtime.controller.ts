import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { bearer, email, field, object, uuid } from '../identity-access/http.js';
import { RuntimeService } from './runtime.service.js';
import { SessionGuard } from '../identity-access/session.guard.js';

function meta(
  input: unknown,
  keys: string[],
  key?: string,
): Record<string, unknown> {
  const b = object(input, [...keys, 'reason']);
  return {
    ...b,
    reason: field(b, 'reason'),
    ...(arguments.length >= 3 ? { key: field({ key }, 'key', 200) } : {}),
  };
}
function page(query: unknown) {
  const b = object(query, ['page', 'pageSize']);
  const out: Record<string, number> = {};
  for (const k of ['page', 'pageSize'])
    if (b[k] !== undefined) {
      const value = b[k];
      if (typeof value !== 'string' || !/^\d{1,6}$/.test(value))
        throw new BadRequestException();
      out[k] = Number(value);
    }
  return out;
}
function filteredPage(input: unknown, fields: string[]) {
  const b = object(input, ['page', 'pageSize', ...fields]);
  const p: Record<string, string | number> = page({ page: b.page, pageSize: b.pageSize });
  for (const key of fields) {
    if (b[key] !== undefined) {
      if (typeof b[key] !== 'string' || (b[key] as string).length > 100)
        throw new BadRequestException('INVALID_FILTER');
      p[key] = b[key] as string;
    }
  }
  return p;
}
@Controller('api/v1/tenants/:tenantId')
@UseGuards(SessionGuard)
export class RuntimeController {
  constructor(
    @Inject(RuntimeService) private readonly service: RuntimeService,
  ) {}
  private read(
    authorization: string | undefined,
    tenant: string,
    kind: string,
    query: Record<string, unknown>,
  ) {
    return this.service.read(bearer(authorization), uuid(tenant), kind, query);
  }
  @Get('roles') roles(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
  ) {
    return this.read(a, t, 'ROLES', {});
  }
  @Get('members') members(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() q: unknown,
  ) {
    return this.service.managementRead(bearer(a), uuid(t), 'MEMBERS', undefined, page(q));
  }
  @Get('members/:id') member(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.managementRead(bearer(a), uuid(t), 'MEMBER', uuid(id));
  }
  @Get('parent-student-links') relationships(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() q: unknown,
  ) {
    return this.service.managementRead(bearer(a), uuid(t), 'RELATIONSHIPS', undefined, page(q));
  }
  @Get('parent-student-links/parents') parents(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() q: unknown,
  ) {
    return this.service.managementRead(bearer(a), uuid(t), 'PARENTS', undefined, page(q));
  }
  @Get('parent-student-links/students') studentsForLinks(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() q: unknown,
  ) {
    return this.service.managementRead(bearer(a), uuid(t), 'STUDENTS', undefined, page(q));
  }
  @Post('members') createMember(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Body() input: unknown,
  ) {
    const b = meta(input, ['email', 'displayName']);
    return this.service.run(
      bearer(a),
      'SELECT educore_r4.create_member($1::uuid,$2::text,$3::text,$4::text) result',
      uuid(t),
      email(b),
      field(b, 'displayName', 200),
      b.reason,
    );
  }
  @Patch('members/:id') deactivate(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = meta(input, ['status']);
    if (b.status !== 'DISABLED')
      throw new BadRequestException('UNSUPPORTED_STATUS');
    return this.service.iam(bearer(a), uuid(t), {
      ...b,
      id: uuid(id),
      operation: 'MEMBER_DEACTIVATE',
    });
  }
  @Post('members/:id/role-assignments') assign(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = meta(input, ['roleId', 'scopeKind', 'classId', 'studentId']);
    uuid(b.roleId);
    if (!['TENANT', 'CLASS', 'STUDENT'].includes(String(b.scopeKind)))
      throw new BadRequestException();
    if (b.classId !== undefined) uuid(b.classId);
    if (b.studentId !== undefined) uuid(b.studentId);
    return this.service.iam(bearer(a), uuid(t), {
      ...b,
      id: uuid(id),
      operation: 'ROLE_ASSIGN',
    });
  }
  @Post('members/:id/role-assignments/:assignmentId/revoke') revoke(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Param('assignmentId') assignment: string,
    @Body() input: unknown,
  ) {
    return this.service.iam(bearer(a), uuid(t), {
      ...meta(input, []),
      id: uuid(id),
      assignmentId: uuid(assignment),
      operation: 'ROLE_REVOKE',
    });
  }
  @Post('parent-student-links') parent(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Body() input: unknown,
  ) {
    const b = meta(input, [
      'parentMembershipId',
      'studentId',
      'evidenceReference',
    ]);
    uuid(b.parentMembershipId);
    uuid(b.studentId);
    field(b, 'evidenceReference');
    return this.service.iam(bearer(a), uuid(t), {
      ...b,
      operation: 'PARENT_CREATE',
    });
  }
  @Post('parent-student-links/:id/verify') verifyParent(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.service.iam(bearer(a), uuid(t), {
      ...meta(input, []),
      id: uuid(id),
      operation: 'PARENT_VERIFY',
    });
  }
  @Post('parent-student-links/:id/revoke') revokeParent(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.service.iam(bearer(a), uuid(t), {
      ...meta(input, []),
      id: uuid(id),
      operation: 'PARENT_REVOKE',
    });
  }
  @Get('students/:id/wallet') wallet(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.run(
      bearer(a),
      'SELECT educore_r2.summary($1::uuid,$2::uuid) result',
      uuid(t),
      uuid(id),
    );
  }
  @Get('finance/students') financeStudents(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string, @Query() q: unknown,
  ) {
    const p = page(q);
    return this.service.run(bearer(a),
      'SELECT educore_r4.finance_students($1::uuid,$2::int,$3::int) result',
      uuid(t), p.page ?? 1, p.pageSize ?? 20);
  }
  @Get('finance/students/:id') financeWallet(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string, @Param('id') id: string,
  ) {
    return this.service.run(bearer(a),
      'SELECT educore_r4.finance_wallet($1::uuid,$2::uuid) result',
      uuid(t), uuid(id));
  }
  @Get('finance/students/:id/receivables') financeReceivables(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string, @Param('id') id: string,
  ) {
    return this.service.run(bearer(a),
      'SELECT educore_r4.finance_receivables($1::uuid,$2::uuid) result',
      uuid(t), uuid(id));
  }
  @Get('finance/invoices/:id/request-preview') financeRequestPreview(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string, @Param('id') id: string,
  ) {
    return this.service.run(bearer(a),
      'SELECT educore_r4.finance_request_preview($1::uuid,$2::uuid) result',
      uuid(t), uuid(id));
  }
  @Get('finance/students/:id/outcomes/:operation/:key') financeOutcome(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Param('operation') operation: string, @Param('key') key: string,
  ) {
    if (!['TOP_UP', 'PAY', 'ADJUST_REQUEST', 'CANCEL_REQUEST', 'REVERSE_TOP_UP_REQUEST', 'EXECUTE_APPROVAL'].includes(operation))
      throw new BadRequestException('INVALID_OPERATION');
    return this.service.run(bearer(a),
      'SELECT educore_r4.finance_outcome($1::uuid,$2::uuid,$3::text,$4::text) result',
      uuid(t), uuid(id), operation, field({ key }, 'key', 200));
  }
  @Post('students/:id/wallet/top-ups') @HttpCode(200) topUp(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string, @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = object(input, ['amountVnd', 'method', 'receiptReference', 'evidence', 'reason', 'confirmed']);
    if (b.confirmed !== true || typeof b.amountVnd !== 'string' || !/^[1-9]\d*$/.test(b.amountVnd)
      || !['CASH', 'BANK_TRANSFER'].includes(String(b.method))) throw new BadRequestException('INVALID_TOP_UP');
    return this.service.billing(bearer(a), uuid(t), {
      operation: 'TOP_UP', studentId: uuid(id), key: field({ key }, 'key', 200),
      amountVnd: b.amountVnd, method: b.method,
      receiptReference: field(b, 'receiptReference', 200).normalize('NFC').trim(),
      evidence: field(b, 'evidence', 2000), reason: field(b, 'reason', 2000),
    });
  }
  @Post('invoices/:id/wallet-payments') @HttpCode(200) walletPayment(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string, @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = object(input, ['amountVnd', 'reason', 'confirmed']);
    if (b.confirmed !== true || typeof b.amountVnd !== 'string' || !/^[1-9]\d*$/.test(b.amountVnd))
      throw new BadRequestException('INVALID_PAYMENT');
    return this.service.billing(bearer(a), uuid(t), {
      operation: 'PAY', invoiceId: uuid(id), key: field({ key }, 'key', 200),
      amountVnd: b.amountVnd, reason: field(b, 'reason', 2000),
    });
  }
  @Post('wallet/top-ups/:id/reversal-requests') @HttpCode(200) reverseTopUp(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string, @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = object(input, ['reason', 'confirmed']);
    if (b.confirmed !== true) throw new BadRequestException('CONFIRMATION_REQUIRED');
    return this.service.billing(bearer(a), uuid(t), {
      operation: 'REVERSE_TOP_UP_REQUEST', topUpId: uuid(id),
      key: field({ key }, 'key', 200), reason: field(b, 'reason', 2000),
    });
  }
  @Get('invoices/:id/receivable') invoice(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.run(
      bearer(a),
      'SELECT educore_r2.receivable($1::uuid,$2::uuid) result',
      uuid(t),
      uuid(id),
    );
  }
  @Get('sessions') calendar(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() input: unknown,
  ) {
    const b = object(input, ['from', 'to', 'studentId']);
    const from = field(b, 'from', 40),
      to = field(b, 'to', 40);
    if (
      ![from, to].every(
        (d) =>
          /^\d{4}-\d\d-\d\dT.*Z$/.test(d) && Number.isFinite(Date.parse(d)),
      ) ||
      Date.parse(to) <= Date.parse(from) ||
      Date.parse(to) - Date.parse(from) > 93 * 86400_000
    )
      throw new BadRequestException('INVALID_RANGE');
    return this.service.run(
      bearer(a),
      'SELECT educore_r3.calendar($1::uuid,$2::timestamptz,$3::timestamptz,$4::uuid) result',
      uuid(t),
      from,
      to,
      b.studentId === undefined ? null : uuid(b.studentId),
    );
  }
  @Get('participants/:id/attendance') attendance(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.read(a, t, 'ATTENDANCE', { id: uuid(id) });
  }
  @Get('approvals') approvals(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() q: unknown,
  ) {
    const p = page(q);
    return this.service.run(bearer(a),
      'SELECT educore_r4.finance_approvals($1::uuid,NULL,$2::int,$3::int) result',
      uuid(t), p.page ?? 1, p.pageSize ?? 20);
  }
  @Get('approvals/:id') approval(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.run(bearer(a),
      'SELECT educore_r4.finance_approvals($1::uuid,$2::uuid) result',
      uuid(t), uuid(id));
  }
  @Post('invoices/:id/adjustment-requests') adjust(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = meta(input, ['amountDeltaVnd'], key);
    const delta = field(b, 'amountDeltaVnd', 21);
    if (!/^-?[1-9]\d*$/.test(delta))
      throw new BadRequestException('INVALID_MONEY');
    return this.service.billing(bearer(a), uuid(t), {
      key: b.key,
      reason: b.reason,
      invoiceId: uuid(id),
      deltaVnd: delta,
      operation: 'ADJUST_REQUEST',
    });
  }
  @Post('invoices/:id/cancellation-requests') cancel(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.service.billing(bearer(a), uuid(t), {
      ...meta(input, [], key),
      invoiceId: uuid(id),
      operation: 'CANCEL_REQUEST',
    });
  }
  @Post('approvals/:id/decisions') @HttpCode(200) decide(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = meta(input, ['decision'], key);
    if (!['APPROVE', 'REJECT', 'REQUEST_INFO'].includes(String(b.decision)))
      throw new BadRequestException();
    return this.service.decide(bearer(a), uuid(t), {
      ...b,
      approvalId: uuid(id),
    });
  }
  @Post('approvals/:id/decision-outcomes') @HttpCode(200) decisionOutcome(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string, @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = object(input, ['key', 'decision', 'reason']);
    if (!['APPROVE', 'REJECT', 'REQUEST_INFO'].includes(String(b.decision)))
      throw new BadRequestException('INVALID_DECISION');
    return this.service.run(bearer(a),
      'SELECT educore_r4.finance_decision_outcome($1::uuid,$2::uuid,$3::text,$4::text,$5::text) result',
      uuid(t), uuid(id), field(b, 'key', 200), String(b.decision), field(b, 'reason', 2000));
  }
  @Post('approvals/:id/execute') @HttpCode(200) execute(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.service.execute(bearer(a), uuid(t), {
      ...meta(input, [], key),
      approvalId: uuid(id),
    });
  }
  @Get('audit') audit(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() q: unknown,
  ) {
    return this.service.run(bearer(a),
      'SELECT educore_r4.ops_audit($1::uuid,$2::jsonb) result',
      uuid(t), JSON.stringify(filteredPage(q, ['eventType', 'entityType', 'entityId', 'actor', 'actorKind', 'from', 'to', 'outcome'])));
  }
  @Get('audit/operations/:correlationId') explain(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('correlationId') id: string,
    @Query() q: unknown,
  ) {
    return this.service.run(bearer(a),
      'SELECT educore_r4.ops_audit($1::uuid,$2::jsonb) result',
      uuid(t), JSON.stringify({ ...page(q), correlationId: uuid(id) }));
  }
  @Get('jobs') jobs(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() q: unknown,
  ) {
    return this.service.run(bearer(a),
      'SELECT educore_r4.ops_jobs($1::uuid,$2::jsonb) result',
      uuid(t), JSON.stringify(filteredPage(q, ['status'])));
  }
  @Get('jobs/:id') job(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.run(bearer(a),
      'SELECT educore_r4.ops_jobs($1::uuid,$2::jsonb) result',
      uuid(t), JSON.stringify({ id: uuid(id) }));
  }
  @Post('jobs/:id/retry') @HttpCode(200) retry(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = object(input, ['reason', 'confirmed']);
    if (b.confirmed !== true) throw new BadRequestException('CONFIRMATION_REQUIRED');
    return this.service.run(
      bearer(a),
      'SELECT educore_r4.ops_retry($1::uuid,$2::uuid,$3::text,$4::text,$5::boolean) result',
      uuid(t),
      uuid(id),
      field(b, 'reason', 2000),
      field({ key }, 'key', 200),
      true,
    );
  }
  @Post('jobs') enqueue(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Body() input: unknown,
  ) {
    const b = object(input, ['kind', 'payload']);
    const kind = field(b, 'kind', 40);
    if (!['BILLING_GENERATE', 'SCHEDULE_CHECK'].includes(kind))
      throw new BadRequestException('UNSUPPORTED_JOB');
    const payload = object(
      b.payload,
      kind === 'BILLING_GENERATE' ? ['studentId', 'periodId'] : ['sessionId'],
    );
    for (const required of kind === 'BILLING_GENERATE'
      ? ['studentId', 'periodId']
      : ['sessionId'])
      uuid(payload[required]);
    return this.service.run(
      bearer(a),
      'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
      uuid(t),
      kind,
      JSON.stringify(payload),
      field({ key }, 'key', 200),
    );
  }
  @Get('notifications') inbox(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() input: unknown,
  ) {
    const q = filteredPage(input, ['unreadOnly']);
    if (q.unreadOnly !== undefined && !['true', 'false'].includes(String(q.unreadOnly)))
      throw new BadRequestException('INVALID_FILTER');
    return this.service.run(
      bearer(a),
      'SELECT educore_r4.ops_inbox($1::uuid,$2::boolean,$3::int,$4::int) result',
      uuid(t),
      q.unreadOnly === 'true',
      q.page ?? 1,
      q.pageSize ?? 20,
    );
  }
  @Get('notifications/unread-count') unread(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
  ) {
    return this.service.run(
      bearer(a),
      'SELECT educore_r4.inbox($1::uuid,$2::text) result',
      uuid(t),
      'UNREAD_COUNT',
    );
  }
  @Post('notifications/:id/read') @HttpCode(200) markRead(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.run(
      bearer(a),
      'SELECT educore_r4.inbox($1::uuid,$2::text,$3::uuid) result',
      uuid(t),
      'MARK_READ',
      uuid(id),
    );
  }
}
