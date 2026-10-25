import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthService } from './auth.service.js';

export function object(
  input: unknown,
  keys: string[],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    throw new BadRequestException('INVALID_INPUT');
  return input as Record<string, unknown>;
}
export function field(
  body: Record<string, unknown>,
  key: string,
  max = 2000,
): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BadRequestException('INVALID_INPUT');
  return value;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new BadRequestException('INVALID_UUID');
  return value;
}
export function email(body: Record<string, unknown>) {
  const e = field(body, 'email', 254).normalize('NFC').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    throw new BadRequestException('INVALID_EMAIL');
  return e;
}
export function bearer(header: string | undefined) {
  if (!header?.startsWith('Bearer '))
    throw new UnauthorizedException('AUTH_REQUIRED');
  return header.slice(7);
}
export function correlation(req: Request) {
  const header = req.get('x-request-id');
  return header &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      header,
    )
    ? header
    : randomUUID();
}
@Catch()
export class R4ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(R4ErrorFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      res = ctx.getResponse<Response>(),
      req = ctx.getRequest<Request>();
    const e = error as {
      message?: string;
      getStatus?: () => number;
      meta?: {
        code?: string;
        driverAdapterError?: { cause?: { originalCode?: string } };
      };
    };
    const sql = e.meta?.code ?? e.meta?.driverAdapterError?.cause?.originalCode;
    let status =
      e.getStatus?.() ??
      {
        '28000': 401,
        '42501': 403,
        '22023': 400,
        '22007': 400,
        '22008': 400,
        '22P02': 400,
        '23505': 409,
        '23514': 422,
        '23503': 422,
        '23P01': 409,
        '55P03': 409,
        '40P01': 409,
        '40001': 409,
        P0002: 404,
      }[sql ?? ''] ??
      500;
    if (['AUTH_REQUIRED', 'INVALID_CREDENTIALS'].includes(e.message ?? ''))
      status = 401;
    if (['INVALID_OTP', 'PASSWORD_POLICY'].includes(e.message ?? ''))
      status = 400;
    const globalRecoveryFailure = e.message === 'RECOVERY_GLOBAL_UNAVAILABLE';
    if (globalRecoveryFailure) status = 503;
    const code =
      (
        {
          400: 'INVALID_INPUT',
          401: 'AUTH_REQUIRED',
          403: 'FORBIDDEN',
          404: 'NOT_FOUND',
          409: 'CONFLICT',
          422: 'BUSINESS_RULE',
          429: 'RATE_LIMITED',
        } as Record<number, string>
      )[status] ?? (globalRecoveryFailure ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR');
    const correlationId = res.getHeader('X-Request-Id') ?? correlation(req);
    if (status >= 500)
      this.logger.error(
        JSON.stringify({
          event: 'HTTP_REQUEST_FAILED',
          status,
          correlationId,
          ...(sql && /^[0-9A-Z]{5}$/.test(sql) ? { sqlState: sql } : {}),
        }),
      );
    const body = {
      code,
      message: code,
      correlationId,
    };
    if (status === 503 || /\/access\/navigation\/?$/.test(req.path ?? ''))
      res.status(status).set('Content-Type', 'application/json; charset=utf-8').end(JSON.stringify(body));
    else res.status(status).json(body);
  }
}
@Controller('api/v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private cookies(res: Response, refresh: string, csrf: string) {
    res.cookie('educore_refresh', refresh, {
      httpOnly: true,
      secure: this.auth.config.production,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 86400_000,
    });
    return csrf;
  }
  private origin(req: Request) {
    if (!this.auth.config.origins.includes(req.get('origin') ?? ''))
      throw new ForbiddenException('ORIGIN_DENIED');
  }
  private async limit(req: Request, operation: string, maximum: number) {
    if (!(await this.auth.throttle(req.ip ?? 'unknown', operation, maximum)))
      throw new HttpException('RATE_LIMITED', 429);
  }
  private cookie(req: Request) {
    const raw = req.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .filter((c) => c.startsWith('educore_refresh='));
    if (raw?.length !== 1 || raw[0].length > 256)
      throw new UnauthorizedException();
    try {
      return decodeURIComponent(raw[0].slice('educore_refresh='.length));
    } catch (error) {
      if (error instanceof URIError)
        throw new UnauthorizedException('AUTH_REQUIRED');
      throw error;
    }
  }
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    await this.limit(req, 'login', 30);
    const b = object(input, ['email', 'password']);
    const { refreshToken, csrfToken, ...data } = await this.auth.login(
      email(b),
      field(b, 'password', 1024),
    );
    this.cookies(res, refreshToken, csrfToken);
    return { ...data, csrfToken };
  }
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    const csrf = req.get('x-csrf-token');
    if (!csrf || csrf.length > 128)
      throw new ForbiddenException('CSRF_REQUIRED');
    const { refreshToken, csrfToken, ...data } = await this.auth.refresh(
      this.cookie(req),
      csrf,
    );
    this.cookies(res, refreshToken, csrfToken);
    return { ...data, csrfToken };
  }
  @Post('select-tenant')
  @HttpCode(200)
  select(
    @Body() input: unknown,
    @Headers('authorization') authorization?: string,
  ) {
    const b = object(input, ['tenantId']);
    return this.auth.selectTenant(bearer(authorization), uuid(b.tenantId));
  }
  @Get('me') me(@Headers('authorization') authorization?: string) {
    return this.auth.me(bearer(authorization));
  }
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(bearer(authorization));
    res.clearCookie('educore_refresh', { path: '/api/v1/auth' });
  }
  @Post('password/otp/request')
  @HttpCode(202)
  async otp(@Body() input: unknown, @Req() req: Request) {
    const b = object(input, ['email']);
    const normalized = email(b);
    // Register the common response deadline before account-dependent SQL work.
    // Otherwise timer insertion order itself can follow known/unknown query time.
    const responseFloor = new Promise<void>((resolve) => setTimeout(resolve, 100));
    try { await this.limit(req, 'otp', 10); }
    catch (failure) {
      if (failure instanceof HttpException && failure.getStatus() === 429) throw failure;
      throw Error('RECOVERY_GLOBAL_UNAVAILABLE');
    }
    try { await this.auth.recoveryReady(); }
    catch { throw Error('RECOVERY_GLOBAL_UNAVAILABLE'); }
    try { await this.auth.requestOtp(normalized, 'PASSWORD_RESET'); }
    catch { Logger.warn('R8_RECOVERY_ISSUE_FAILED'); }
    await responseFloor;
    return { accepted: true };
  }
  @Post('activation/otp/request')
  @HttpCode(202)
  async activationOtp(@Body() input: unknown, @Req() req: Request) {
    await this.limit(req, 'otp', 10);
    const b = object(input, ['email']);
    await this.auth.requestOtp(email(b), 'ACTIVATION');
    return { accepted: true };
  }
  @Post('password/reset')
  @HttpCode(204)
  async reset(@Body() input: unknown, @Req() req: Request) {
    await this.limit(req, 'reset', 20);
    return this.complete(input, 'PASSWORD_RESET');
  }
  @Post('activation/complete')
  @HttpCode(204)
  async activate(@Body() input: unknown, @Req() req: Request) {
    await this.limit(req, 'reset', 20);
    return this.complete(input, 'ACTIVATION');
  }
  @Post('password/change')
  @HttpCode(204)
  change(
    @Body() input: unknown,
    @Headers('authorization') authorization?: string,
  ) {
    const b = object(input, ['oldPassword', 'newPassword']);
    return this.auth.changePassword(
      bearer(authorization),
      field(b, 'oldPassword', 1024),
      field(b, 'newPassword', 1024),
    );
  }
  private complete(input: unknown, purpose: 'ACTIVATION' | 'PASSWORD_RESET') {
    const b = object(input, ['email', 'otp', 'newPassword']),
      otp = field(b, 'otp', 6);
    if (!/^\d{6}$/.test(otp)) throw new BadRequestException('INVALID_OTP');
    return this.auth.reset(
      email(b),
      otp,
      field(b, 'newPassword', 1024),
      purpose,
    );
  }
}
