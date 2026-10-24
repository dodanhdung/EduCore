import { BadRequestException, Controller, Get, Headers, Inject, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { bearer, uuid } from './http.js';
import { SessionGuard } from './session.guard.js';
import { NavigationService } from './navigation.service.js';

@Controller('api/v1/tenants/:tenantId/access')
@UseGuards(SessionGuard)
export class NavigationController {
  constructor(@Inject(NavigationService) private readonly service: NavigationService) {}

  @Get('navigation')
  async read(@Headers('authorization') authorization: string | undefined,
    @Param('tenantId') tenantId: string, @Req() req: Request, @Res() res: Response) {
    if (Object.keys(req.query).length || req.body !== undefined)
      throw new BadRequestException('INVALID_INPUT');
    const value = await this.service.read(bearer(authorization), uuid(tenantId));
    // Express res.json generates an ETag and may turn a conditional GET into 304.
    res.status(200).set('Content-Type', 'application/json; charset=utf-8').end(JSON.stringify(value));
  }
}
