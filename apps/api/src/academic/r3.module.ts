import { Module, type DynamicModule } from '@nestjs/common';
import { R3_CONNECTION, R3Repository } from './r3-repository.js';
import { AcademicService } from './academic.service.js';
import { SchedulingService } from '../scheduling/scheduling.service.js';
import {
  AttendanceService,
  LeaveService,
} from '../attendance/attendance.service.js';

/** Internal providers only; HTTP AUTH / R4 INTEGRATION DEFERRED. */
@Module({})
export class R3Module {
  static register(connection: string): DynamicModule {
    return {
      module: R3Module,
      providers: [
        { provide: R3_CONNECTION, useValue: connection },
        R3Repository,
        AcademicService,
        SchedulingService,
        AttendanceService,
        LeaveService,
      ],
      exports: [
        AcademicService,
        R3Repository,
        SchedulingService,
        AttendanceService,
        LeaveService,
      ],
    };
  }
}
