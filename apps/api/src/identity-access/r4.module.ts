import { DynamicModule, Module, type INestApplication } from '@nestjs/common';
import { AuthService, type AuthConfig } from './auth.service.js';
import { AuthController, R4ErrorFilter, correlation } from './http.js';
import { R4Repository } from './r4-repository.js';
import type { OtpDeliveryPort } from './otp-delivery.js';
import { RuntimeService } from '../workflow-approval/runtime.service.js';
import { RuntimeController } from '../workflow-approval/runtime.controller.js';
import { R4Worker } from '../automation-jobs/worker.js';
import { requestTrace } from './request-context.js';
import { SessionGuard } from './session.guard.js';

@Module({})
export class R4Module {
  static register(
    repository: R4Repository,
    config: AuthConfig,
    delivery: OtpDeliveryPort,
    workerEnabled = false,
  ): DynamicModule {
    return {
      module: R4Module,
      controllers: [AuthController, RuntimeController],
      providers: [
        { provide: R4Repository, useValue: repository },
        {
          provide: AuthService,
          useFactory: () => new AuthService(repository, delivery, config),
        },
        {
          provide: RuntimeService,
          inject: [AuthService],
          useFactory: (auth: AuthService) => new RuntimeService(auth),
        },
        {
          provide: R4Worker,
          useFactory: () => new R4Worker(repository, workerEnabled),
        },
        SessionGuard,
      ],
      exports: [AuthService, R4Repository],
    };
  }
}
export function configureR4Http(app: INestApplication, config: AuthConfig) {
  app.useGlobalFilters(new R4ErrorFilter());
  app.enableCors({
    origin: config.origins,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-CSRF-Token',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
  });
  app.use(
    (
      req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      const correlationId = correlation(req);
      res.setHeader('X-Request-Id', correlationId);
      res.setHeader('Cache-Control', 'no-store');
      requestTrace.run({ correlationId }, next);
    },
  );
}
