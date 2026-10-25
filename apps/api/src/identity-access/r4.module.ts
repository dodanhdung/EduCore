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
import { NavigationController } from './navigation.controller.js';
import { NavigationService } from './navigation.service.js';
import { AssignmentService } from '../assignments-grading/assignment.service.js';
import {
  AssignmentController,
  SubmissionController,
  GradingController,
} from '../assignments-grading/learning.controller.js';
import { SubmissionService } from '../assignments-grading/submission.service.js';
import { GradingService } from '../assignments-grading/grading.service.js';
import type { FileStoragePort } from '../file-management/private-volume.adapter.js';
import { FileService } from '../file-management/file.service.js';
import { FileController } from '../file-management/file.controller.js';
import { AcademicReadController } from '../academic/academic-read.controller.js';
import { AcademicCommandController } from '../academic/academic-command.controller.js';
import { AcademicProfileController } from '../academic/academic-profile.controller.js';
import { AcademicCatalogController } from '../academic/academic-catalog.controller.js';
import { SchedulingController } from '../scheduling/scheduling.controller.js';
import { AttendanceController } from '../attendance/attendance.controller.js';
import { BillingHttpController } from '../billing/billing-http.controller.js';

@Module({})
export class R4Module {
  static register(
    repository: R4Repository,
    config: AuthConfig,
    delivery: OtpDeliveryPort,
    workerEnabled = false,
    storage?: FileStoragePort,
  ): DynamicModule {
    return {
      module: R4Module,
      controllers: [
        AuthController,
        NavigationController,
        RuntimeController,
        AssignmentController,
        SubmissionController,
        GradingController,
        FileController,
        AcademicReadController,
        AcademicCommandController,
        AcademicProfileController,
        AcademicCatalogController,
        SchedulingController,
        AttendanceController,
        BillingHttpController,
      ],
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
        {
          provide: NavigationService,
          inject: [AuthService],
          useFactory: (auth: AuthService) => new NavigationService(auth),
        },
        {
          provide: AssignmentService,
          inject: [AuthService],
          useFactory: (auth: AuthService) => new AssignmentService(auth),
        },
        {
          provide: SubmissionService,
          inject: [AuthService],
          useFactory: (auth: AuthService) =>
            new SubmissionService(auth, storage),
        },
        {
          provide: GradingService,
          inject: [AuthService],
          useFactory: (auth: AuthService) => new GradingService(auth),
        },
        {
          provide: FileService,
          inject: [AuthService],
          useFactory: (auth: AuthService) => new FileService(auth, storage),
        },
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
      'If-Match',
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
