import { Inject, Injectable } from '@nestjs/common';
import { R3Repository } from '../academic/r3-repository.js';
import { intent, type R3Intent } from '../academic/academic.service.js';

export interface SessionInput {
  classId: string;
  teacherId: string;
  roomId?: string;
  deliveryMode: 'ONLINE' | 'ONSITE';
  startsAt: string;
  endsAt: string;
}
export interface SeriesInput extends Omit<SessionInput, 'startsAt' | 'endsAt'> {
  weekday: number;
  localStartTime: string;
  durationMinutes: number;
  validFrom: string;
  validTo: string;
}
@Injectable()
export class SchedulingService {
  constructor(
    @Inject(R3Repository) private readonly repository: R3Repository,
  ) {}
  create(tenant: string, session: SessionInput, input: R3Intent) {
    return this.repository.command('scheduling', tenant, {
      ...session,
      ...intent(input),
      operation: 'CREATE',
    });
  }
  createSeries(tenant: string, series: SeriesInput, input: R3Intent) {
    return this.repository.command('scheduling', tenant, {
      ...series,
      ...intent(input),
      operation: 'CREATE_SERIES',
    });
  }
  confirm(tenant: string, sessionId: string, input: R3Intent) {
    return this.repository.command('scheduling', tenant, {
      ...intent(input),
      operation: 'CONFIRM',
      sessionId,
    });
  }
  confirmSeries(tenant: string, seriesId: string, input: R3Intent) {
    return this.repository.command('scheduling', tenant, {
      ...intent(input),
      operation: 'CONFIRM_SERIES',
      seriesId,
    });
  }
  reschedule(
    tenant: string,
    sessionId: string,
    revision: number,
    startsAt: string,
    endsAt: string,
    input: R3Intent,
  ) {
    return this.repository.command('scheduling', tenant, {
      ...intent(input),
      operation: 'RESCHEDULE',
      sessionId,
      revision,
      startsAt,
      endsAt,
    });
  }
  cancel(tenant: string, sessionId: string, revision: number, input: R3Intent) {
    return this.repository.command('scheduling', tenant, {
      ...intent(input),
      operation: 'CANCEL',
      sessionId,
      revision,
    });
  }
  room(
    tenant: string,
    room: {
      roomId?: string;
      code?: string;
      name?: string;
      capacity: number;
      active?: boolean;
    },
    input: R3Intent,
  ) {
    return this.repository.command('scheduling', tenant, {
      ...room,
      ...intent(input),
      operation: 'ROOM',
    });
  }
  createUnavailability(
    tenant: string,
    busy: {
      resourceKind: 'TEACHER' | 'ROOM' | 'STUDENT';
      resourceId: string;
      startsAt: string;
      endsAt: string;
    },
    input: R3Intent,
  ) {
    return this.repository.command('scheduling', tenant, {
      ...busy,
      ...intent(input),
      operation: 'BUSY_CREATE',
    });
  }
  decideUnavailability(
    tenant: string,
    unavailabilityId: string,
    confirm: boolean,
    input: R3Intent,
  ) {
    return this.repository.command('scheduling', tenant, {
      ...intent(input),
      operation: confirm ? 'BUSY_CONFIRM' : 'BUSY_CANCEL',
      unavailabilityId,
    });
  }
  calendar(tenant: string, from: string, to: string, student?: string) {
    return this.repository.calendar(tenant, from, to, student);
  }
}
