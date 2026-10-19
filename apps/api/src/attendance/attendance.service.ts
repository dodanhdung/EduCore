import { Inject, Injectable } from '@nestjs/common';
import { R3Repository } from '../academic/r3-repository.js';
import { intent, type R3Intent } from '../academic/academic.service.js';

export type AttendanceStatus = 'ATTENDED' | 'UNEXCUSED' | 'EXCUSED';
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(R3Repository) private readonly repository: R3Repository,
  ) {}
  mark(
    tenant: string,
    sessionId: string,
    participantId: string,
    status: AttendanceStatus,
    revision: number,
    input: R3Intent,
  ) {
    return this.repository.command('attendance', tenant, {
      ...intent(input),
      operation: 'MARK',
      sessionId,
      participantId,
      status,
      revision,
    });
  }
  finalize(tenant: string, sessionId: string, input: R3Intent) {
    return this.repository.command('attendance', tenant, {
      ...intent(input),
      operation: 'FINALIZE',
      sessionId,
    });
  }
  correct(
    tenant: string,
    attendanceId: string,
    status: AttendanceStatus,
    revision: number,
    input: R3Intent,
  ) {
    return this.repository.command('attendance', tenant, {
      ...intent(input),
      operation: 'CORRECT',
      attendanceId,
      status,
      revision,
    });
  }
}
@Injectable()
export class LeaveService {
  constructor(
    @Inject(R3Repository) private readonly repository: R3Repository,
  ) {}
  submit(tenant: string, participantId: string, input: R3Intent) {
    return this.repository.command('attendance', tenant, {
      ...intent(input),
      operation: 'LEAVE_SUBMIT',
      participantId,
    });
  }
  decide(tenant: string, absenceId: string, approve: boolean, input: R3Intent) {
    return this.repository.command('attendance', tenant, {
      ...intent(input),
      operation: approve ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
      absenceId,
    });
  }
}
