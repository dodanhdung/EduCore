import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../identity-access/auth.service.js';
import { bearer, field, object, uuid } from '../identity-access/http.js';
import { result } from '../identity-access/r4-repository.js';
import { SessionGuard } from '../identity-access/session.guard.js';
import { BillingCalculator, type ChargeInput, vnd } from './billing-calculator.js';

/** R4's restricted API connection is bound to the bearer session in the same
 * transaction that calls R2. R2 rechecks live membership/scope under its locks. */
@Controller('api/v1/tenants/:tenantId/billing')
@UseGuards(SessionGuard)
export class BillingHttpController {
  private readonly calculator = new BillingCalculator();
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  private noQuery(req: Request) {
    if (Object.keys(req.query).length) throw new BadRequestException('INVALID_INPUT');
  }
  private key(value: string | undefined) {
    if (!value?.trim() || value.length > 200) throw new BadRequestException('OPERATION_KEY_REQUIRED');
    return value;
  }
  private list(tenant: string, authorization: string | undefined, kind: string, query: Record<string, unknown>) {
    if (Object.keys(query).some((key) => !['page', 'pageSize'].includes(key)))
      throw new BadRequestException('INVALID_INPUT');
    const number = (value: unknown, fallback: number, max: number) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max)
        throw new BadRequestException('INVALID_PAGE');
      return Number(value);
    };
    return this.auth.repository.transaction(bearer(authorization), (tx) => result(tx,
      'SELECT educore_r4.billing_read($1::uuid,$2::text,NULL,$3::int,$4::int) result',
      uuid(tenant), kind, number(query.page, 1, 100000), number(query.pageSize, 20, 100)));
  }
  private detail(tenant: string, authorization: string | undefined, kind: string, id: string) {
    return this.auth.repository.transaction(bearer(authorization), (tx) => result(tx,
      'SELECT educore_r4.billing_read($1::uuid,$2::text,$3::uuid) result', uuid(tenant), kind, uuid(id)));
  }
  private command(tenant: string, authorization: string | undefined, command: Record<string, unknown>, checkGeneration = false) {
    return this.auth.repository.transaction(bearer(authorization), async (tx) => {
      const value = await result<Record<string, unknown>>(tx,
        'SELECT educore_r2.execute($1::uuid,$2::jsonb) result', uuid(tenant), JSON.stringify(command));
      if (checkGeneration && value?.status === 'DRAFT') {
        const source = value.source as { lines: ChargeInput[]; sibling: boolean };
        const expected = this.calculator.calculate(source.lines, source.sibling);
        for (const name of ['grossVnd', 'discountVnd', 'totalVnd'] as const)
          if (value[name] !== expected[name]) throw Error('DATABASE_CALCULATION_MISMATCH');
      }
      return value;
    });
  }

  @Get('price-rules')
  priceRules(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Query() q: Record<string, unknown>) {
    return this.list(t, a, 'PRICE_RULES', q);
  }
  @Get('price-targets')
  priceTargets(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Query() q: Record<string, unknown>) {
    return this.list(t, a, 'PRICE_TARGETS', q);
  }
  @Post('price-rules')
  @HttpCode(200)
  createPriceRule(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') k: string | undefined, @Body() input: unknown, @Req() req: Request) {
    this.noQuery(req);
    const body = object(input, ['scope', 'targetId', 'amountVnd', 'effectiveFrom', 'effectiveTo', 'reason']);
    if (!['SESSION', 'CLASS', 'COURSE'].includes(String(body.scope))
      || typeof body.amountVnd !== 'string'
      || typeof body.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom)
      || (body.effectiveTo !== null && body.effectiveTo !== undefined
        && (typeof body.effectiveTo !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveTo)))
      || (typeof body.effectiveTo === 'string' && body.effectiveTo <= body.effectiveFrom))
      throw new BadRequestException('INVALID_PRICE_RULE');
    try { vnd(body.amountVnd, false); } catch { throw new BadRequestException('INVALID_PRICE_RULE'); }
    const command = { scope: body.scope, targetId: uuid(body.targetId), amountVnd: body.amountVnd,
      effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo ?? null,
      reason: field(body, 'reason'), key: this.key(k) };
    return this.auth.repository.transaction(bearer(a), (tx) => result(tx,
      'SELECT educore_r4.create_price_rule($1::uuid,$2::jsonb) result', uuid(t), JSON.stringify(command)));
  }
  @Get('sibling-evidence')
  siblings(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Query() q: Record<string, unknown>) {
    return this.list(t, a, 'SIBLINGS', q);
  }
  @Get('periods')
  periods(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Query() q: Record<string, unknown>) {
    return this.list(t, a, 'PERIODS', q);
  }
  @Post('periods')
  @HttpCode(200)
  openPeriod(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined,
    @Body() input: unknown, @Req() req: Request) {
    this.noQuery(req);
    const body = object(input, ['monthStart', 'reason']);
    if (typeof body.monthStart !== 'string' || !/^\d{4}-\d{2}-01$/.test(body.monthStart))
      throw new BadRequestException('INVALID_PERIOD');
    return this.auth.repository.transaction(bearer(a), (tx) => result(tx,
      'SELECT educore_r4.open_billing_period($1::uuid,$2::date,$3::text) result',
      uuid(t), body.monthStart, field(body, 'reason')));
  }
  @Get('students')
  students(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Query() q: Record<string, unknown>) {
    return this.list(t, a, 'STUDENTS', q);
  }
  @Get('drafts')
  drafts(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Query() q: Record<string, unknown>) {
    return this.list(t, a, 'DRAFTS', q);
  }
  @Get('drafts/:draftId')
  draft(@Param('tenantId') t: string, @Param('draftId') id: string,
    @Headers('authorization') a: string | undefined, @Req() req: Request) {
    this.noQuery(req); return this.detail(t, a, 'DRAFT', id);
  }
  @Get('invoices')
  invoices(@Param('tenantId') t: string, @Headers('authorization') a: string | undefined, @Query() q: Record<string, unknown>) {
    return this.list(t, a, 'INVOICES', q);
  }
  @Get('invoices/:invoiceId')
  invoice(@Param('tenantId') t: string, @Param('invoiceId') id: string,
    @Headers('authorization') a: string | undefined, @Req() req: Request) {
    this.noQuery(req); return this.detail(t, a, 'INVOICE', id);
  }

  @Post('periods/:periodId/students/:studentId/generations')
  @HttpCode(200)
  generate(@Param('tenantId') t: string, @Param('periodId') p: string, @Param('studentId') s: string,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') k: string | undefined,
    @Body() input: unknown, @Req() req: Request) {
    this.noQuery(req);
    const body = object(input, ['reason']);
    return this.command(t, a, { operation: 'GENERATE', periodId: uuid(p), studentId: uuid(s),
      key: this.key(k), reason: field(body, 'reason') }, true);
  }

  @Post('periods/:periodId/students/:studentId/recomputations')
  @HttpCode(200)
  recompute(@Param('tenantId') t: string, @Param('periodId') p: string, @Param('studentId') s: string,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') k: string | undefined,
    @Body() input: unknown, @Req() req: Request) {
    this.noQuery(req);
    const body = object(input, ['reason', 'expectedBase', 'expectedApplied']);
    return this.command(t, a, { operation: 'RECOMPUTE', periodId: uuid(p), studentId: uuid(s),
      expectedBase: uuid(body.expectedBase), expectedApplied: body.expectedApplied === null ? null : uuid(body.expectedApplied),
      key: this.key(k), reason: field(body, 'reason') }, true);
  }

  @Post('drafts/:draftId/issue')
  @HttpCode(200)
  issue(@Param('tenantId') t: string, @Param('draftId') id: string,
    @Headers('authorization') a: string | undefined, @Headers('idempotency-key') k: string | undefined,
    @Body() input: unknown, @Req() req: Request) {
    this.noQuery(req);
    const body = object(input, ['reason', 'expectedGenerationId', 'confirmed']);
    if (body.confirmed !== true) throw new BadRequestException('CONFIRMATION_REQUIRED');
    // R2 checks current/latest generation, source freshness and issued state in
    // its ISSUE transaction. The expected ID also pins the user's reviewed view.
    return this.command(t, a, { operation: 'ISSUE', invoiceId: uuid(id),
      expectedGenerationId: uuid(body.expectedGenerationId), key: this.key(k), reason: field(body, 'reason') });
  }

  @Get('invoices/:invoiceId/receivable')
  receivable(@Param('tenantId') t: string, @Param('invoiceId') id: string,
    @Headers('authorization') a: string | undefined, @Req() req: Request) {
    this.noQuery(req);
    return this.auth.repository.transaction(bearer(a), (tx) => result(tx,
      'SELECT educore_r2.receivable($1::uuid,$2::uuid) result', uuid(t), uuid(id)));
  }
}
