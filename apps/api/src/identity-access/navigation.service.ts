import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { result } from './r4-repository.js';
import { navigationAccess } from './navigation.dto.js';

@Injectable()
export class NavigationService {
  constructor(readonly auth: AuthService) {}

  async read(token: string, tenantId: string) {
    const claims = this.auth.tokens.verify(token);
    const raw = await this.auth.repository.transaction(token, (tx) =>
      result<unknown>(tx, 'SELECT educore_r4.navigation_access($1::uuid) result', tenantId));
    const response = navigationAccess(raw);
    if (response.userId !== claims.sub || response.sessionId !== claims.sid || response.tenantId !== tenantId)
      throw new InternalServerErrorException('INVALID_NAVIGATION');
    if (response.validUntil <= Date.now()) throw new UnauthorizedException('AUTH_REQUIRED');
    return response;
  }
}
