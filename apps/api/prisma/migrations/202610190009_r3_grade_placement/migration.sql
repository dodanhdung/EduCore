BEGIN;
-- Read existing grading data only. These narrow owner privileges permit row
-- locks, not a public grading/assignment write API or a new R5 lifecycle.
GRANT UPDATE(id) ON public.courses,public.assignments,public.assignment_recipients,
 public.submissions,public.submission_versions,public.grades TO educore_r3_owner;
-- Serialize published-revision phantoms with placement's tenant predicate gate.
-- Future R5 writers must still enter User -> Tenant before DML, as R1b requires.
CREATE TRIGGER r3_grade_source_gate BEFORE INSERT OR UPDATE OR DELETE ON public.grades
 FOR EACH ROW EXECUTE FUNCTION educore_r3.academic_guard();

CREATE FUNCTION educore_r3.published_grade_evidence(t uuid,student uuid,c uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE target_course public.courses%ROWTYPE; row_data record; item jsonb; result jsonb:='[]'; stamp timestamptz:=clock_timestamp();
BEGIN
 -- Caller already authenticated and holds the shared User/Tenant protocol.
 SELECT co.* INTO STRICT target_course FROM public.classes cl JOIN public.courses co ON co.tenant_id=t AND co.id=cl.course_id
 WHERE cl.tenant_id=t AND cl.id=c FOR SHARE OF cl,co;
 FOR row_data IN
  SELECT g.*,v.id version_id,sub.id submission_id,ar.id recipient_id,ar.student_id,a.id assignment_id,
   cl.id assessment_class_id,co.id assessment_course_id,co.subject_id,co.level_id
  FROM public.grades g JOIN public.submission_versions v ON v.tenant_id=t AND v.id=g.submission_version_id AND v.status='SUBMITTED'
  JOIN public.submissions sub ON sub.tenant_id=t AND sub.id=v.submission_id
  JOIN public.assignment_recipients ar ON ar.tenant_id=t AND ar.id=sub.recipient_id AND ar.student_id=student
  JOIN public.assignments a ON a.tenant_id=t AND a.id=ar.assignment_id
  JOIN public.classes cl ON cl.tenant_id=t AND cl.id=a.class_id
  JOIN public.courses co ON co.tenant_id=t AND co.id=cl.course_id AND co.subject_id=target_course.subject_id
  WHERE g.tenant_id=t AND g.status='PUBLISHED' AND g.published_at IS NOT NULL AND g.published_at<=stamp
   AND g.graded_at<=g.published_at AND g.score BETWEEN 0 AND 10 AND g.revision_no>0
   AND NOT EXISTS(SELECT FROM public.grades newer WHERE newer.tenant_id=t AND newer.submission_version_id=g.submission_version_id
    AND newer.status='PUBLISHED' AND newer.published_at IS NOT NULL AND newer.published_at<=stamp
    AND newer.graded_at<=newer.published_at AND newer.score BETWEEN 0 AND 10 AND newer.revision_no>g.revision_no)
  ORDER BY g.published_at DESC,g.id FOR SHARE OF g,v,sub,ar,a,cl,co
 LOOP
  item:=jsonb_build_object('gradeId',row_data.id,'revision',row_data.revision_no,'score',row_data.score::text,
   'studentId',row_data.student_id,'subjectId',row_data.subject_id,'assessmentLevelId',row_data.level_id,
   'assessmentClassId',row_data.assessment_class_id,'assessmentCourseId',row_data.assessment_course_id,
   'assignmentId',row_data.assignment_id,'recipientId',row_data.recipient_id,'submissionId',row_data.submission_id,'submissionVersionId',row_data.version_id,
   'gradedAt',to_char(row_data.graded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'publishedAt',to_char(row_data.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'updatedAt',to_char(row_data.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  result:=result||jsonb_build_array(item||jsonb_build_object('evidenceHash',encode(sha256(convert_to(item::text,'UTF8')),'hex')));
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION educore_r3.placement_context(t uuid,student uuid,c uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE course public.courses%ROWTYPE; scores jsonb;
BEGIN
 BEGIN PERFORM educore_r3.authorize(t,c,student,'enrollment.create');
 EXCEPTION WHEN insufficient_privilege THEN PERFORM educore_r3.authorize(t,c,student,'enrollment.transfer'); END;
 SELECT co.* INTO STRICT course FROM public.courses co JOIN public.classes cl ON cl.tenant_id=t AND cl.course_id=co.id
 WHERE co.tenant_id=t AND cl.id=c FOR SHARE OF co,cl;
 scores:=educore_r3.published_grade_evidence(t,student,c);
 RETURN jsonb_build_object('targetCourseId',course.id,'targetSubjectId',course.subject_id,'targetLevelId',course.level_id,
  'publishedAssessments',scores,'state',CASE WHEN jsonb_array_length(scores)=0 THEN 'FALLBACK_AVAILABLE' ELSE 'GRADE_CONFIRMATION_AVAILABLE' END,
  'automaticRecommendation','DEFERRED_NO_APPROVED_RUBRIC');
END $$;

CREATE FUNCTION educore_r3.placement_evidence(t uuid,student uuid,c uuid,evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE course public.courses%ROWTYPE; candidates jsonb; selected jsonb:='[]'; reference jsonb; verified jsonb; m uuid;
BEGIN
 m:=educore_r3.principal(t);
 SELECT co.* INTO STRICT course FROM public.courses co JOIN public.classes cl ON cl.tenant_id=t AND cl.course_id=co.id
 WHERE co.tenant_id=t AND cl.id=c FOR SHARE OF co,cl;
 IF jsonb_typeof(evidence) IS DISTINCT FROM 'object' OR evidence->>'basis' IS NULL
  OR evidence->>'basis' NOT IN ('STAFF_CONFIRMATION','ENTRY_TEST','PUBLISHED_GRADES')
  OR COALESCE(length(btrim(evidence->>'reason')),0)=0
  OR (evidence->>'subjectId')::uuid IS DISTINCT FROM course.subject_id OR (evidence->>'levelId')::uuid IS DISTINCT FROM course.level_id
 THEN RAISE EXCEPTION 'PLACEMENT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
 candidates:=educore_r3.published_grade_evidence(t,student,c);
 IF evidence->>'basis'='PUBLISHED_GRADES' THEN
  IF jsonb_typeof(evidence->'grades') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PLACEMENT_GRADE_REFERENCES_REQUIRED' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(evidence->'grades')=0 OR (SELECT count(DISTINCT value->>'gradeId') FROM jsonb_array_elements(evidence->'grades'))<>jsonb_array_length(evidence->'grades')
  THEN RAISE EXCEPTION 'PLACEMENT_GRADE_REFERENCES_REQUIRED' USING ERRCODE='23514'; END IF;
  FOR reference IN SELECT value FROM jsonb_array_elements(evidence->'grades') LOOP
   IF jsonb_typeof(reference) IS DISTINCT FROM 'object' OR reference->>'gradeId' IS NULL OR reference->>'revision' IS NULL
    OR COALESCE(reference->>'evidenceHash','') !~ '^[0-9a-f]{64}$'
   THEN RAISE EXCEPTION 'PLACEMENT_GRADE_REFERENCES_REQUIRED' USING ERRCODE='23514'; END IF;
   SELECT value INTO verified FROM jsonb_array_elements(candidates) WHERE (value->>'gradeId')::uuid=(reference->>'gradeId')::uuid
    AND (value->>'revision')::int=(reference->>'revision')::int;
   IF verified IS NULL OR verified->>'evidenceHash' IS DISTINCT FROM reference->>'evidenceHash'
   THEN RAISE EXCEPTION 'PLACEMENT_GRADE_EVIDENCE_STALE_OR_INELIGIBLE' USING ERRCODE='23514'; END IF;
   selected:=selected||jsonb_build_array(verified);
  END LOOP;
 END IF;
 -- Staff judges suitability in this authorized enrollment/transfer operation.
 -- With no approved rubric there is no automatic score-to-level conversion or
 -- fixed age cutoff. An audited fallback reason explains unavailable/unsuitable
 -- results; existence of a published grade never blocks that fallback by itself.
 RETURN jsonb_build_object('basis',evidence->>'basis','reason',evidence->>'reason','studentId',student,
  'targetCourseId',course.id,'targetSubjectId',course.subject_id,'targetLevelId',course.level_id,
  'grades',selected,'availablePublishedGradeCount',jsonb_array_length(candidates),'confirmedByMembershipId',m,
  'confirmedAt',clock_timestamp(),'automaticRecommendation','DEFERRED_NO_APPROVED_RUBRIC');
END $$;

CREATE OR REPLACE FUNCTION educore_r3.placement(t uuid,s uuid,c uuid,evidence jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
BEGIN PERFORM educore_r3.placement_evidence(t,s,c,evidence); END $$;

-- The academic command below keeps its request hash/body unchanged. The trusted
-- DB-derived placement snapshot is added to the result persisted by finish(),
-- so audit and idempotency preserve scores/lineage even if source grades evolve.

CREATE OR REPLACE FUNCTION educore_r3.academic(t uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE op text:=body->>'operation'; m uuid; c uuid; e public.enrollments%ROWTYPE; replay jsonb; result jsonb; target uuid:=gen_random_uuid();
 transfer public.enrollment_transfers%ROWTYPE; student uuid; policy uuid; moment timestamptz; r record; placement_snapshot jsonb;
BEGIN
 PERFORM educore_r3.principal(t);
 c:=(body->>'classId')::uuid;
 IF op='TRANSFER_REQUEST' THEN
  SELECT * INTO e FROM public.enrollments WHERE tenant_id=t AND id=(body->>'enrollmentId')::uuid; c:=e.class_id;
 ELSIF op='TRANSFER_CONFIRM' THEN
  SELECT * INTO transfer FROM public.enrollment_transfers WHERE tenant_id=t AND id=(body->>'transferId')::uuid;
  SELECT * INTO e FROM public.enrollments WHERE tenant_id=t AND id=transfer.source_enrollment_id; c:=e.class_id;
 END IF;
 m:=educore_r3.authorize(t,c,NULL,CASE op WHEN 'ASSIGN_TEACHER' THEN 'class.assign_teacher' WHEN 'ENROLL' THEN 'enrollment.create' WHEN 'TRANSFER_REQUEST' THEN 'enrollment.transfer' WHEN 'TRANSFER_CONFIRM' THEN 'enrollment.transfer' ELSE '__DENY__' END);
 replay:=educore_r3.replay(t,body); IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF e.id IS NOT NULL THEN SELECT * INTO e FROM public.enrollments WHERE tenant_id=t AND id=e.id FOR UPDATE; END IF;
 IF transfer.id IS NOT NULL THEN SELECT * INTO transfer FROM public.enrollment_transfers WHERE tenant_id=t AND id=transfer.id FOR UPDATE; END IF;
 IF NOT EXISTS(SELECT FROM public.classes WHERE tenant_id=t AND id=c AND status IN ('ACTIVE','PLANNED')) THEN RAISE EXCEPTION 'CLASS_NOT_ACTIVE' USING ERRCODE='23514'; END IF;
 IF op='ASSIGN_TEACHER' THEN
  IF NOT EXISTS(SELECT FROM public.teacher_profiles WHERE tenant_id=t AND id=(body->>'teacherId')::uuid AND status='ACTIVE') THEN RAISE EXCEPTION 'TEACHER_NOT_ACTIVE' USING ERRCODE='23514'; END IF;
  IF (body->>'validFrom')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'ASSIGNMENT_MUST_BE_FUTURE' USING ERRCODE='23514'; END IF;
  -- Changing teacher for already scheduled sessions requires explicit reschedule;
  -- assigning a different teacher must not bypass existing session bookings.
  IF EXISTS(SELECT FROM public.class_sessions WHERE tenant_id=t AND class_id=c AND status IN ('CONFIRMED','DRAFT')
   AND starts_at>=(body->>'validFrom')::timestamptz AND ((body->>'validTo') IS NULL OR starts_at<(body->>'validTo')::timestamptz)
   AND teacher_id<>(body->>'teacherId')::uuid) THEN RAISE EXCEPTION 'RESCHEDULE_AFFECTED_SESSIONS_FIRST' USING ERRCODE='23514'; END IF;
  INSERT INTO public.class_teacher_assignments(id,tenant_id,class_id,teacher_id,role_kind,valid_from,valid_to,assigned_by_membership_id,updated_at)
  VALUES(target,t,c,(body->>'teacherId')::uuid,'PRIMARY',(body->>'validFrom')::timestamptz,(body->>'validTo')::timestamptz,m,clock_timestamp());
 ELSIF op='TRANSFER_REQUEST' THEN
  PERFORM educore_r3.authorize(t,(body->>'targetClassId')::uuid,e.student_id,'enrollment.transfer');
  IF e.id IS NULL OR e.status<>'ACTIVE' OR e.effective_to IS NOT NULL OR e.class_id=(body->>'targetClassId')::uuid
   OR (body->>'effectiveAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'INVALID_FUTURE_TRANSFER' USING ERRCODE='23514'; END IF;
  INSERT INTO public.enrollment_transfers(id,tenant_id,source_enrollment_id,target_class_id,effective_at,status,requested_by_membership_id,reason,operation_key,updated_at)
  VALUES(target,t,e.id,(body->>'targetClassId')::uuid,(body->>'effectiveAt')::timestamptz,'REQUESTED',m,body->>'reason',body->>'key',clock_timestamp());
 ELSIF op IN ('ENROLL','TRANSFER_CONFIRM') THEN
  IF op='TRANSFER_CONFIRM' THEN
   IF transfer.id IS NULL OR transfer.status<>'REQUESTED' OR e.status<>'ACTIVE' OR e.effective_to IS NOT NULL
   THEN RAISE EXCEPTION 'TRANSFER_NOT_PENDING_OR_SOURCE_CHANGED' USING ERRCODE='23514'; END IF;
   moment:=transfer.effective_at; student:=e.student_id; c:=transfer.target_class_id;
   PERFORM educore_r3.authorize(t,c,student,'enrollment.transfer');
   SELECT (result_snapshot->>'policyVersionId')::uuid INTO policy FROM public.idempotency_records
    WHERE tenant_id=t AND operation_type='R3:TRANSFER_REQUEST' AND idempotency_key=transfer.operation_key;
  ELSE moment:=(body->>'effectiveFrom')::timestamptz; student:=(body->>'studentId')::uuid; END IF;
  IF moment IS NULL OR moment<=clock_timestamp() OR NOT EXISTS(SELECT FROM public.student_profiles WHERE tenant_id=t AND id=student AND status='ACTIVE')
   OR NOT EXISTS(SELECT FROM public.classes WHERE tenant_id=t AND id=c AND status IN ('ACTIVE','PLANNED'))
   THEN RAISE EXCEPTION 'INVALID_ENROLLMENT_TARGET_OR_TIME' USING ERRCODE='23514'; END IF;
  placement_snapshot:=educore_r3.placement_evidence(t,student,c,body->'placement');
  IF op='TRANSFER_CONFIRM' THEN
   IF EXISTS(SELECT FROM public.session_participants p JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=p.session_id
    WHERE p.tenant_id=t AND p.enrollment_id=e.id AND cs.starts_at>=moment AND EXISTS(SELECT FROM public.invoiced_participation_claims WHERE tenant_id=t AND participant_id=p.id))
    THEN RAISE EXCEPTION 'ISSUED_TRANSFER_SOURCE_PROTECTED' USING ERRCODE='23514'; END IF;
   UPDATE public.enrollments SET status='TRANSFERRED',effective_to=moment,updated_at=clock_timestamp() WHERE id=e.id;
   FOR r IN SELECT id FROM public.class_sessions WHERE tenant_id=t AND class_id=e.class_id AND starts_at>=moment AND status IN ('DRAFT','CONFIRMED') ORDER BY starts_at,id LOOP
    PERFORM educore_r3.roster(t,r.id);
    IF EXISTS(SELECT FROM public.class_sessions WHERE id=r.id AND status='CONFIRMED') THEN PERFORM educore_r3.book(t,r.id); END IF;
   END LOOP;
  END IF;
  INSERT INTO public.enrollments(id,tenant_id,student_id,class_id,status,effective_from,prior_enrollment_id,created_by_membership_id,updated_at)
   VALUES(target,t,student,c,'ACTIVE',moment,CASE WHEN op='TRANSFER_CONFIRM' THEN e.id END,m,clock_timestamp());
  PERFORM educore_r3.assert_capacity(t,c);
  FOR r IN SELECT id,status FROM public.class_sessions WHERE tenant_id=t AND class_id=c AND starts_at>=moment AND status IN ('DRAFT','CONFIRMED') ORDER BY starts_at,id LOOP
   PERFORM educore_r3.roster(t,r.id); IF r.status='CONFIRMED' THEN PERFORM educore_r3.book(t,r.id); END IF;
  END LOOP;
  PERFORM educore_r3.assert_bookings(t);
  IF op='TRANSFER_CONFIRM' THEN UPDATE public.enrollment_transfers SET status='CONFIRMED',target_enrollment_id=target,confirmed_by_membership_id=m,updated_at=clock_timestamp() WHERE id=transfer.id; END IF;
 ELSE RAISE EXCEPTION 'BUSINESS_DECISION_REQUIRED' USING ERRCODE='23514'; END IF;
 result:=jsonb_build_object('id',target,'status',CASE WHEN op='TRANSFER_REQUEST' THEN 'REQUESTED' WHEN op='ENROLL' THEN 'ACTIVE' WHEN op='TRANSFER_CONFIRM' THEN 'CONFIRMED' ELSE 'ASSIGNED' END);
 IF placement_snapshot IS NOT NULL THEN result:=result||jsonb_build_object('placementEvidence',placement_snapshot); END IF;
 RETURN educore_r3.finish(t,m,body,result,policy);
END $$;
ALTER FUNCTION educore_r3.published_grade_evidence(uuid,uuid,uuid) OWNER TO educore_r3_owner;
ALTER FUNCTION educore_r3.placement_evidence(uuid,uuid,uuid,jsonb) OWNER TO educore_r3_owner;
ALTER FUNCTION educore_r3.placement(uuid,uuid,uuid,jsonb) OWNER TO educore_r3_owner;
ALTER FUNCTION educore_r3.placement_context(uuid,uuid,uuid) OWNER TO educore_r3_owner;
ALTER FUNCTION educore_r3.academic(uuid,jsonb) OWNER TO educore_r3_owner;
REVOKE ALL ON FUNCTION educore_r3.published_grade_evidence(uuid,uuid,uuid),educore_r3.placement_evidence(uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION educore_r3.placement(uuid,uuid,uuid,jsonb),educore_r3.placement_context(uuid,uuid,uuid),educore_r3.academic(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r3.placement_context(uuid,uuid,uuid),educore_r3.academic(uuid,jsonb) TO educore_r3_command;
COMMIT;
