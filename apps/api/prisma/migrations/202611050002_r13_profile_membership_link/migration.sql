BEGIN;

-- B0.2 local candidate: link-only, existing permission composition and tables.
-- No role catalog, credential, session or historical ownership changes.
CREATE FUNCTION educore_r4.profile_membership_link(t uuid, kind text, target uuid, body jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE
  actor_user uuid; target_user uuid; lock_user uuid; m uuid;
  member uuid; profile_owner uuid; profile_status text;
  replay public.idempotency_records%ROWTYPE;
  intent_hash text; operation text; output jsonb; policy uuid; correlation uuid;
BEGIN
  IF t IS NULL OR target IS NULL OR kind IS NULL OR kind NOT IN ('TEACHER','STUDENT')
    OR jsonb_typeof(body) IS DISTINCT FROM 'object'
    OR body - ARRAY['membershipId','expectedMembershipId','reason','confirmed','key'] <> '{}'::jsonb
    OR NOT (body ?& ARRAY['membershipId','expectedMembershipId','reason','confirmed','key'])
    OR jsonb_typeof(body->'membershipId') IS DISTINCT FROM 'string'
    OR body->'expectedMembershipId' IS DISTINCT FROM 'null'::jsonb
    OR body->'confirmed' IS DISTINCT FROM 'true'::jsonb
    OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string'
    OR COALESCE(length(btrim(body->>'reason')),0) NOT BETWEEN 1 AND 2000
    OR jsonb_typeof(body->'key') IS DISTINCT FROM 'string'
    OR COALESCE(length(btrim(body->>'key')),0) NOT BETWEEN 1 AND 200
  THEN RAISE EXCEPTION 'INVALID_PROFILE_LINK' USING ERRCODE='22023'; END IF;
  member:=(body->>'membershipId')::uuid;
  SELECT user_id INTO actor_user FROM public.auth_sessions WHERE id=educore_r4.session_id();
  IF actor_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT user_id INTO target_user FROM public.tenant_memberships WHERE tenant_id=t AND id=member;

  -- All involved Users before the Tenant gate; target lookup never crosses t.
  FOR lock_user IN SELECT DISTINCT x FROM unnest(ARRAY[actor_user,target_user]) x
    WHERE x IS NOT NULL ORDER BY x
  LOOP
    PERFORM 1 FROM public.users WHERE id=lock_user FOR SHARE;
  END LOOP;
  -- NULL resource arguments require actual TENANT grants, not CLASS/STUDENT.
  m:=educore_r4.authorize(t,'member.update');
  PERFORM educore_r4.authorize(t,'role.assign');
  PERFORM educore_r4.authorize(t,CASE kind WHEN 'TEACHER' THEN 'teacher.update' ELSE 'student.update' END);
  IF target_user IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
  IF actor_user=target_user THEN RAISE EXCEPTION 'SELF_LINK_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.tenant_memberships WHERE tenant_id=t AND id=member FOR UPDATE;
  IF kind='TEACHER' THEN
    SELECT membership_id,status INTO profile_owner,profile_status FROM public.teacher_profiles
      WHERE tenant_id=t AND id=target FOR UPDATE;
  ELSE
    SELECT membership_id,status INTO profile_owner,profile_status FROM public.student_profiles
      WHERE tenant_id=t AND id=target FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
  IF profile_status<>'ACTIVE' OR NOT EXISTS (
    SELECT FROM public.tenant_memberships tm JOIN public.users u ON u.id=tm.user_id
    JOIN public.credentials cr ON cr.user_id=u.id
    WHERE tm.tenant_id=t AND tm.id=member AND tm.status='ACTIVE' AND tm.left_at IS NULL
      AND u.status='ACTIVE' AND u.activated_at IS NOT NULL
      AND cr.password_hash ~ '^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
  ) THEN RAISE EXCEPTION 'PROFILE_LINK_TARGET_INELIGIBLE' USING ERRCODE='23505'; END IF;

  IF NOT EXISTS (
    SELECT FROM public.membership_roles mr JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id
    JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id
    WHERE mr.tenant_id=t AND mr.membership_id=member AND mr.revoked_at IS NULL
      AND r.is_system_seeded AND r.code=kind
      AND ((kind='STUDENT' AND sc.scope_kind='STUDENT' AND sc.student_id=target)
        OR (kind='TEACHER' AND (sc.scope_kind='TENANT' OR (sc.scope_kind='CLASS'
          AND EXISTS(SELECT FROM public.classes c WHERE c.tenant_id=t AND c.id=sc.class_id AND c.status IN ('ACTIVE','PLANNED'))
          AND (NOT EXISTS(SELECT FROM public.class_teacher_assignments ca WHERE ca.tenant_id=t AND ca.teacher_id=target
                AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp()))
            OR EXISTS(SELECT FROM public.class_teacher_assignments ca WHERE ca.tenant_id=t AND ca.teacher_id=target
                AND ca.class_id=sc.class_id AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp())))))))
  ) THEN RAISE EXCEPTION 'PROFILE_LINK_ROLE_OR_SCOPE_INELIGIBLE' USING ERRCODE='23505'; END IF;

  operation:='R13:PROFILE_LINK:'||kind;
  intent_hash:=educore_r4.digest((body||jsonb_build_object('profileId',target,'profileKind',kind))::text);
  -- Current authorization and eligibility precede receipt replay.
  SELECT * INTO replay FROM public.idempotency_records
    WHERE tenant_id=t AND operation_type=operation AND idempotency_key=body->>'key';
  IF replay.id IS NOT NULL THEN
    IF replay.request_hash<>intent_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
    RETURN replay.result_snapshot;
  END IF;
  IF profile_owner IS NOT NULL THEN RAISE EXCEPTION 'PROFILE_ALREADY_LINKED' USING ERRCODE='23505'; END IF;
  IF kind='TEACHER' THEN
    IF EXISTS(SELECT FROM public.teacher_profiles WHERE tenant_id=t AND membership_id=member)
      THEN RAISE EXCEPTION 'MEMBERSHIP_ALREADY_LINKED' USING ERRCODE='23505'; END IF;
    UPDATE public.teacher_profiles SET membership_id=member,updated_at=clock_timestamp()
      WHERE tenant_id=t AND id=target AND membership_id IS NULL;
  ELSE
    IF EXISTS(SELECT FROM public.student_profiles WHERE tenant_id=t AND membership_id=member)
      THEN RAISE EXCEPTION 'MEMBERSHIP_ALREADY_LINKED' USING ERRCODE='23505'; END IF;
    UPDATE public.student_profiles SET membership_id=member,updated_at=clock_timestamp()
      WHERE tenant_id=t AND id=target AND membership_id IS NULL;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_LINK_CONFLICT' USING ERRCODE='23505'; END IF;
  policy:=educore_r4.policy(t);
  correlation:=COALESCE(educore_r4.correlation(),gen_random_uuid());
  output:=jsonb_build_object('profileId',target,'profileKind',kind,'membershipId',member,'tenantId',t,
    'operation','PROFILE_MEMBERSHIP_LINKED','correlationId',correlation);
  PERFORM educore_r4.audit(t,m,'PROFILE_MEMBERSHIP_LINKED',target,body->>'reason',
    jsonb_build_object('profileKind',kind,'profileId',target,'previousMembershipId',NULL,'membershipId',member),policy,correlation);
  INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_snapshot,updated_at)
    VALUES(gen_random_uuid(),t,operation,body->>'key',intent_hash,'COMPLETED',output,clock_timestamp());
  RETURN output;
END $$;
ALTER FUNCTION educore_r4.profile_membership_link(uuid,text,uuid,jsonb) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.profile_membership_link(uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.profile_membership_link(uuid,text,uuid,jsonb) TO educore_r4_api;
COMMIT;
