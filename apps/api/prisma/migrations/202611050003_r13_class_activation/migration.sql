BEGIN;

-- Owner-approved B1.3: manual PLANNED -> ACTIVE, class-only effects.
-- Row-lock privileges belong to the NOLOGIN function owner, never the API login.
GRANT UPDATE(id) ON public.class_teacher_assignments,public.enrollments TO educore_r4_owner;
GRANT EXECUTE ON FUNCTION educore_r3.assert_capacity(uuid,uuid) TO educore_r4_owner;

CREATE FUNCTION educore_r4.class_activate(t uuid, target uuid, body jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE
  m uuid; cl public.classes%ROWTYPE; replay public.idempotency_records%ROWTYPE;
  intent_hash text; stamp timestamptz; policy uuid; correlation uuid; output jsonb; persisted text;
BEGIN
  IF t IS NULL OR target IS NULL OR jsonb_typeof(body) IS DISTINCT FROM 'object'
    OR body - ARRAY['expectedStatus','confirmed','reason','key'] <> '{}'::jsonb
    OR NOT (body ?& ARRAY['expectedStatus','confirmed','reason','key'])
    OR body->'expectedStatus' IS DISTINCT FROM '"PLANNED"'::jsonb
    OR body->'confirmed' IS DISTINCT FROM 'true'::jsonb
    OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string'
    OR COALESCE(length(btrim(body->>'reason')),0)=0 OR length(body->>'reason')>2000
    OR jsonb_typeof(body->'key') IS DISTINCT FROM 'string'
    OR COALESCE(length(btrim(body->>'key')),0)=0 OR length(body->>'key')>200
  THEN RAISE EXCEPTION 'INVALID_CLASS_ACTIVATION' USING ERRCODE='22023'; END IF;

  -- principal() takes User SHARE -> Tenant NO KEY UPDATE at READ COMMITTED,
  -- then authorize() reads current grants. Academic writers use this same
  -- tenant predicate gate before enrollment/assignment DML. Never lock Class
  -- first or trust an earlier capability/role label.
  m:=educore_r4.authorize(t,'class.update',target);
  SELECT * INTO cl FROM public.classes WHERE tenant_id=t AND id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;

  intent_hash:=encode(sha256(convert_to(jsonb_build_object('classId',target,'request',body)::text,'UTF8')),'hex');
  SELECT * INTO replay FROM public.idempotency_records
    WHERE tenant_id=t AND operation_type='R13:CLASS_ACTIVATE' AND idempotency_key=body->>'key';
  IF replay.id IS NOT NULL THEN
    IF replay.request_hash<>intent_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
    -- Replay is the original committed result, after fresh current authority;
    -- natural expiry of a prerequisite does not rerun a completed operation.
    RETURN replay.result_snapshot;
  END IF;
  IF cl.status<>'PLANNED' THEN RAISE EXCEPTION 'CLASS_STATUS_CONFLICT' USING ERRCODE='40001'; END IF;
  IF cl.capacity<=0 OR (cl.start_date IS NOT NULL AND cl.end_date IS NOT NULL AND cl.start_date>cl.end_date)
    THEN RAISE EXCEPTION 'INVALID_CLASS_CAPACITY_OR_DATES' USING ERRCODE='23514'; END IF;

  PERFORM 1 FROM public.courses co JOIN public.subjects s ON s.tenant_id=t AND s.id=co.subject_id
    JOIN public.levels l ON l.tenant_id=t AND l.id=co.level_id
    WHERE co.tenant_id=t AND co.id=cl.course_id AND co.status='ACTIVE' AND s.active AND l.active
    FOR SHARE OF co,s,l;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CLASS_DEPENDENCIES' USING ERRCODE='23514'; END IF;

  -- Stable source rows as well as the shared academic predicate gate. Lock
  -- before choosing the server-controlled activation instant and intervals.
  PERFORM 1 FROM public.class_teacher_assignments WHERE tenant_id=t AND class_id=target ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.teacher_profiles p WHERE p.tenant_id=t AND EXISTS
    (SELECT FROM public.class_teacher_assignments a WHERE a.tenant_id=t AND a.class_id=target AND a.teacher_id=p.id)
    ORDER BY p.id FOR SHARE;
  PERFORM 1 FROM public.enrollments WHERE tenant_id=t AND class_id=target ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.student_profiles p WHERE p.tenant_id=t AND EXISTS
    (SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.class_id=target AND e.student_id=p.id)
    ORDER BY p.id FOR SHARE;
  stamp:=clock_timestamp();
  IF NOT EXISTS(SELECT FROM public.class_teacher_assignments a JOIN public.teacher_profiles p
    ON p.tenant_id=t AND p.id=a.teacher_id AND p.status='ACTIVE'
    WHERE a.tenant_id=t AND a.class_id=target AND a.valid_from<=stamp AND (a.valid_to IS NULL OR stamp<a.valid_to))
    THEN RAISE EXCEPTION 'CURRENT_TEACHER_ASSIGNMENT_REQUIRED' USING ERRCODE='23514'; END IF;
  -- P0 ordinary assignment currently requires an ACTIVE same-tenant profile;
  -- an account is optional. Do not import P1 substitution/competency rules.
  IF NOT EXISTS(SELECT FROM public.enrollments e JOIN public.student_profiles p
    ON p.tenant_id=t AND p.id=e.student_id AND p.status='ACTIVE'
    WHERE e.tenant_id=t AND e.class_id=target AND e.status='ACTIVE'
      AND e.effective_from<=stamp AND (e.effective_to IS NULL OR stamp<e.effective_to))
    THEN RAISE EXCEPTION 'CURRENT_ACTIVE_ENROLLMENT_REQUIRED' USING ERRCODE='23514'; END IF;
  PERFORM educore_r3.assert_capacity(t,target);
  policy:=educore_r4.policy(t);
  correlation:=COALESCE(educore_r4.correlation(),gen_random_uuid());
  UPDATE public.classes SET status='ACTIVE',updated_at=stamp
    WHERE tenant_id=t AND id=target AND status=body->>'expectedStatus' RETURNING status INTO persisted;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLASS_STATUS_CONFLICT' USING ERRCODE='40001'; END IF;
  output:=jsonb_build_object('id',target,'tenantId',t,'previousStatus','PLANNED','status',persisted,
    'activatedAt',stamp,'policyVersionId',policy,'correlationId',correlation);
  PERFORM educore_r4.audit(t,m,'CLASS_ACTIVATED',target,body->>'reason',
    jsonb_build_object('classId',target,'previousStatus','PLANNED','status',persisted,'activatedAt',stamp),policy,correlation);
  INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_snapshot,updated_at)
    VALUES(gen_random_uuid(),t,'R13:CLASS_ACTIVATE',body->>'key',intent_hash,'COMPLETED',output,clock_timestamp());
  RETURN output;
END $$;
ALTER FUNCTION educore_r4.class_activate(uuid,uuid,jsonb) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.class_activate(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.class_activate(uuid,uuid,jsonb) TO educore_r4_api;
COMMIT;
