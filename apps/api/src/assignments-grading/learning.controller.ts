import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SessionGuard } from '../identity-access/session.guard.js';
import { bearer, field, object, uuid } from '../identity-access/http.js';
import { AssignmentService } from './assignment.service.js';
import { SubmissionService } from './submission.service.js';
import { GradingService, score } from './grading.service.js';

export function revision(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new BadRequestException('REVISION_REQUIRED');
  const text = String(value ?? '').replace(/^"(\d+)"$/, '$1');
  const n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < 1)
    throw new BadRequestException('REVISION_REQUIRED');
  return n;
}
@Controller('api/v1/tenants/:tenantId')
@UseGuards(SessionGuard)
export class GradingController {
  constructor(
    @Inject(GradingService) private readonly service: GradingService,
  ) {}
  @Get('grading/queue') queue(@Headers('authorization') a: string | undefined, @Param('tenantId') t: string) {
    return this.service.queue(bearer(a), uuid(t));
  }
  @Get('submissions/:id/grading-context') item(@Headers('authorization') a: string | undefined, @Param('tenantId') t: string, @Param('id') id: string) {
    return this.service.item(bearer(a), uuid(t), uuid(id));
  }
  @Put('submission-versions/:id/grade-draft') save(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['score', 'feedback', 'reason'], key);
    score(b.score);
    if (b.feedback !== undefined) field(b, 'feedback', 20000);
    return this.service.grade(bearer(a), uuid(t), {
      ...b,
      versionId: uuid(id),
      expectedRevision:
        match === '0' || match === undefined ? 0 : revision(match),
      operation: 'SAVE_DRAFT',
    });
  }
  @Get('submission-versions/:id/grade-draft') draft(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.draft(bearer(a), uuid(t), uuid(id));
  }
  @Post('submission-versions/:id/grades/publish') publish(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['revision'], key);
    return this.service.grade(bearer(a), uuid(t), {
      ...b,
      revision: revision(b.revision),
      versionId: uuid(id),
      operation: 'PUBLISH_GRADE',
    });
  }
  @Post('submission-versions/:id/grade-draft/cancel') cancel(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['revision', 'reason'], key);
    field(b, 'reason');
    return this.service.grade(bearer(a), uuid(t), {
      ...b,
      revision: revision(b.revision),
      versionId: uuid(id),
      operation: 'CANCEL_DRAFT',
    });
  }
  @Post('grades/:id/revisions') correct(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['score', 'feedback', 'reason'], key);
    score(b.score);
    field(b, 'reason');
    if (b.feedback !== undefined) field(b, 'feedback', 20000);
    return this.service.grade(bearer(a), uuid(t), {
      ...b,
      gradeId: uuid(id),
      expectedRevision: revision(match),
      operation: 'CORRECT',
    });
  }
  @Get('students/:id/published-grades') published(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Query() input: unknown,
  ) {
    const q = page(input, ['subjectId']);
    if (q.subjectId !== undefined) uuid(q.subjectId);
    return this.service.published(bearer(a), uuid(t), uuid(id), q);
  }
  @Get('students/:id/placement-context') placement(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Query() input: unknown,
  ) {
    const q = object(input, ['classId']);
    return this.service.placement(
      bearer(a),
      uuid(t),
      uuid(id),
      uuid(q.classId),
    );
  }
}
@Controller('api/v1/tenants/:tenantId')
@UseGuards(SessionGuard)
export class SubmissionController {
  constructor(
    @Inject(SubmissionService) private readonly service: SubmissionService,
  ) {}
  @Post('assignment-recipients/:id/submissions') submit(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['answerText', 'fileIds'], key);
    if (b.answerText !== undefined) field(b, 'answerText', 100000);
    if (b.fileIds !== undefined) {
      b.fileIds = ids(b.fileIds);
      if ((b.fileIds as string[]).length > 5)
        throw new UnprocessableEntityException('FILE_COUNT_EXCEEDED');
    }
    return this.service.submit(bearer(a), uuid(t), {
      ...b,
      recipientId: uuid(id),
    });
  }
  @Get('assignment-recipients/:id/submissions') history(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.history(bearer(a), uuid(t), uuid(id));
  }
}
export function ids(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    new Set(value).size !== value.length
  )
    throw new BadRequestException('INVALID_IDS');
  return value.map(uuid);
}
export function page(
  input: unknown,
  extra: string[] = [],
): Record<string, unknown> {
  const q = object(input, ['page', 'pageSize', ...extra]);
  const p = q.page === undefined ? 1 : revision(q.page),
    size = q.pageSize === undefined ? 20 : revision(q.pageSize);
  if (size > 100 || p > 1_000_000)
    throw new BadRequestException('INVALID_PAGE');
  return { ...q, page: p, pageSize: size };
}
export function command(
  input: unknown,
  allowed: string[],
  key: unknown,
): Record<string, unknown> {
  const b = object(input, allowed);
  if (b.reason !== undefined) field(b, 'reason');
  return { ...b, key: field({ key }, 'key', 200) };
}
function assignmentInput(input: unknown, create: boolean) {
  const b = object(input, [
    'classId',
    'studentIds',
    'title',
    'description',
    'priority',
    'deadlineAt',
    'reason',
  ]);
  if (!create && b.classId !== undefined)
    throw new BadRequestException('CLASS_IMMUTABLE');
  if (b.classId !== undefined) uuid(b.classId);
  if (b.studentIds !== undefined) b.studentIds = ids(b.studentIds);
  if (create && !b.classId && !b.studentIds)
    throw new BadRequestException('RECIPIENTS_REQUIRED');
  for (const k of ['title', 'description'])
    if (create || b[k] !== undefined) field(b, k, k === 'title' ? 300 : 20000);
  if (
    (create || b.priority !== undefined) &&
    (!Number.isInteger(b.priority) ||
      Number(b.priority) < 1 ||
      Number(b.priority) > 5)
  )
    throw new BadRequestException('INVALID_PRIORITY');
  if (create || b.deadlineAt !== undefined) {
    const d = field(b, 'deadlineAt', 40);
    const year = Number(d.slice(0, 4)),
      month = Number(d.slice(5, 7)),
      day = Number(d.slice(8, 10));
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(
        d,
      ) ||
      !Number.isFinite(Date.parse(d)) ||
      year < 1 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
      Number(d.slice(11, 13)) > 23 ||
      Number(d.slice(14, 16)) > 59 ||
      Number(d.slice(17, 19)) > 59
    )
      throw new BadRequestException('INVALID_DEADLINE');
    // Canonical UTC avoids backend-specific offset limits without losing the
    // final three fractional digits that JS Date alone would truncate.
    const fraction = (d.match(/\.(\d{1,6})/)?.[1] ?? '').padEnd(6, '0');
    b.deadlineAt = new Date(d)
      .toISOString()
      .replace(
        /\.(\d{3})Z$/,
        (_all: string, millis: string) =>
          '.' + millis + fraction.slice(3) + 'Z',
      );
  }
  return b;
}
@Controller('api/v1/tenants/:tenantId')
@UseGuards(SessionGuard)
export class AssignmentController {
  constructor(
    @Inject(AssignmentService) private readonly service: AssignmentService,
  ) {}
  @Get('teaching/assignment-classes') classes(@Headers('authorization') a: string | undefined, @Param('tenantId') t: string) {
    return this.service.teacherClasses(bearer(a), uuid(t));
  }
  @Get('teaching/assignments') teaching(@Headers('authorization') a: string | undefined, @Param('tenantId') t: string) {
    return this.service.teacherAssignments(bearer(a), uuid(t));
  }
  @Get('teaching/assignments/:id/recipients') teachingRecipients(@Headers('authorization') a: string | undefined, @Param('tenantId') t: string, @Param('id') id: string) {
    return this.service.teacherRecipients(bearer(a), uuid(t), uuid(id));
  }
  @Get('my/assignments') mine(@Headers('authorization') a: string | undefined, @Param('tenantId') t: string) {
    return this.service.myAssignments(bearer(a), uuid(t));
  }
  @Post('assignment-recipients/:id/revocation') revoke(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['reason'], key);
    field(b, 'reason');
    return this.service.changeRecipient(bearer(a), uuid(t), {
      ...b,
      id: uuid(id),
      expectedRevision: revision(match),
      operation: 'REVOKE_RECIPIENT',
    });
  }
  @Post('assignment-recipients/:id/deadline-extension') extend(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['deadlineAt', 'reason'], key);
    field(b, 'reason');
    b.deadlineAt = assignmentInput(
      { deadlineAt: b.deadlineAt },
      false,
    ).deadlineAt;
    return this.service.changeRecipient(bearer(a), uuid(t), {
      ...b,
      id: uuid(id),
      expectedRevision: revision(match),
      operation: 'EXTEND_RECIPIENT',
    });
  }
  @Post('assignments') create(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Param('tenantId') t: string,
    @Body() input: unknown,
  ) {
    const b = assignmentInput(input, true);
    return this.service.command(bearer(a), uuid(t), {
      ...b,
      key: field({ key }, 'key', 200),
      operation: 'CREATE',
    });
  }
  @Patch('assignments/:id') edit(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.service.command(bearer(a), uuid(t), {
      ...assignmentInput(input, false),
      key: field({ key }, 'key', 200),
      expectedRevision: revision(match),
      id: uuid(id),
      operation: 'EDIT',
    });
  }
  @Post('assignments/:id/publish') publish(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['recipientStudentIds'], key);
    if (b.recipientStudentIds !== undefined)
      b.recipientStudentIds = ids(b.recipientStudentIds);
    return this.service.command(bearer(a), uuid(t), {
      ...b,
      expectedRevision: revision(match),
      id: uuid(id),
      operation: 'PUBLISH',
    });
  }
  @Post('assignments/:id/archive') archive(
    @Headers('authorization') a: string | undefined,
    @Headers('idempotency-key') key: string,
    @Headers('if-match') match: string,
    @Param('tenantId') t: string,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const b = command(input, ['reason'], key);
    field(b, 'reason');
    return this.service.command(bearer(a), uuid(t), {
      ...b,
      expectedRevision: revision(match),
      id: uuid(id),
      operation: 'ARCHIVE',
    });
  }
  @Get('assignments') list(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Query() input: unknown,
  ) {
    const q = page(input, ['classId', 'studentId', 'status']);
    for (const k of ['classId', 'studentId'])
      if (q[k] !== undefined) uuid(q[k]);
    if (
      q.status !== undefined &&
      (typeof q.status !== 'string' ||
        !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(q.status))
    )
      throw new BadRequestException('INVALID_STATUS');
    return this.service.list(bearer(a), uuid(t), q);
  }
  @Get('assignments/:id') async detail(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return (await this.service.list(bearer(a), uuid(t), { id: uuid(id) }))
      .items[0];
  }
  @Get('assignments/:id/recipients') recipients(
    @Headers('authorization') a: string | undefined,
    @Param('tenantId') t: string,
    @Param('id') id: string,
  ) {
    return this.service.recipients(bearer(a), uuid(t), uuid(id));
  }
}
