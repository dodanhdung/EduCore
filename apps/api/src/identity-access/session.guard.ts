import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { bearer, uuid } from './http.js';
/** Authentication + selected tenant guard. Resource permissions are checked
 * again by the domain SQL coordinator while its User/Tenant locks are held. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const me = await this.auth.me(bearer(req.get('authorization')));
    const tenant = uuid(req.params.tenantId);
    const allowed = me.allowedTenants as { id: string }[];
    if (me.tenantId !== tenant || !allowed.some((t) => t.id === tenant))
      throw new ForbiddenException('TENANT_DENIED');
    return true;
  }
}
