import { Inject, Injectable } from '@nestjs/common';
import { R3Repository } from './r3-repository.js';

export interface R3Intent {
  key: string;
  reason: string;
}
export interface PlacementGradeReference {
  gradeId: string;
  revision: number;
  evidenceHash: string;
}
/** Staff confirms suitability in the enrollment/transfer command. Published
 * evidence is re-read and snapshotted by PostgreSQL; no automatic level rubric. */
export type PlacementEvidence = {
  subjectId: string;
  levelId: string;
  reason: string;
} & (
  | { basis: 'STAFF_CONFIRMATION' | 'ENTRY_TEST' }
  | { basis: 'PUBLISHED_GRADES'; grades: PlacementGradeReference[] }
);
export interface PlacementAssessmentContext {
  targetCourseId: string;
  targetSubjectId: string;
  targetLevelId: string;
  publishedAssessments: {
    gradeId: string;
    score: string;
    subjectId: string;
    assessmentLevelId: string;
    gradedAt: string;
    publishedAt: string;
    submissionVersionId: string;
    revision: number;
    evidenceHash: string;
  }[];
  state: 'FALLBACK_AVAILABLE' | 'GRADE_CONFIRMATION_AVAILABLE';
  automaticRecommendation: 'DEFERRED_NO_APPROVED_RUBRIC';
}
export function intent(input: R3Intent) {
  if (!input.key?.trim() || input.key.length > 200 || !input.reason?.trim())
    throw new Error('OPERATION_KEY_AND_REASON_REQUIRED');
  return { key: input.key, reason: input.reason };
}

@Injectable()
export class AcademicService {
  constructor(
    @Inject(R3Repository) private readonly repository: R3Repository,
  ) {}
  async placementContext(
    tenant: string,
    student: string,
    classId: string,
  ): Promise<PlacementAssessmentContext> {
    return (await this.repository.placementContext(
      tenant,
      student,
      classId,
    )) as PlacementAssessmentContext;
  }
  assignTeacher(
    tenant: string,
    classId: string,
    teacherId: string,
    validFrom: string,
    validTo: string | null,
    input: R3Intent,
  ) {
    return this.repository.command('academic', tenant, {
      ...intent(input),
      operation: 'ASSIGN_TEACHER',
      classId,
      teacherId,
      validFrom,
      validTo,
    });
  }
  requestTransfer(
    tenant: string,
    enrollmentId: string,
    targetClassId: string,
    effectiveAt: string,
    input: R3Intent,
  ) {
    return this.repository.command('academic', tenant, {
      ...intent(input),
      operation: 'TRANSFER_REQUEST',
      enrollmentId,
      targetClassId,
      effectiveAt,
    });
  }
  enroll(
    tenant: string,
    classId: string,
    studentId: string,
    effectiveFrom: string,
    placement: PlacementEvidence,
    input: R3Intent,
  ) {
    return this.repository.command('academic', tenant, {
      ...intent(input),
      operation: 'ENROLL',
      classId,
      studentId,
      effectiveFrom,
      placement,
    });
  }
  confirmTransfer(
    tenant: string,
    transferId: string,
    placement: PlacementEvidence,
    input: R3Intent,
  ) {
    return this.repository.command('academic', tenant, {
      ...intent(input),
      operation: 'TRANSFER_CONFIRM',
      transferId,
      placement,
    });
  }
}
