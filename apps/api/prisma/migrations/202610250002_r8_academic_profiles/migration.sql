BEGIN;
GRANT INSERT,UPDATE ON public.student_profiles,public.teacher_profiles TO educore_r4_owner;

CREATE FUNCTION educore_r4.academic_profile(t uuid, kind text, target uuid, body jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; created uuid:=gen_random_uuid(); code text; profile_name text; reason text; dob date; profile_contact text; current_status text;
BEGIN
  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR kind NOT IN ('STUDENT_CREATE','STUDENT_UPDATE','TEACHER_CREATE','TEACHER_UPDATE')
    THEN RAISE EXCEPTION 'INVALID_PROFILE_COMMAND' USING ERRCODE='22023'; END IF;
  reason:=btrim(body->>'reason');
  profile_name:=btrim(body->>'name');
  IF COALESCE(length(reason),0) NOT BETWEEN 1 AND 2000 OR COALESCE(length(profile_name),0) NOT BETWEEN 1 AND 200
    THEN RAISE EXCEPTION 'INVALID_PROFILE_FIELDS' USING ERRCODE='22023'; END IF;
  code:=btrim(body->>'code');
  IF kind LIKE '%CREATE' AND (target IS NOT NULL OR COALESCE(length(code),0) NOT BETWEEN 1 AND 64)
    THEN RAISE EXCEPTION 'INVALID_PROFILE_CODE' USING ERRCODE='22023'; END IF;
  IF kind LIKE '%UPDATE' AND target IS NULL THEN RAISE EXCEPTION 'TARGET_REQUIRED' USING ERRCODE='22023'; END IF;
  IF kind LIKE 'STUDENT%' THEN
    IF body->>'dateOfBirth' IS NOT NULL THEN dob:=(body->>'dateOfBirth')::date; END IF;
    m:=educore_r4.authorize(t,CASE kind WHEN 'STUDENT_CREATE' THEN 'student.create' ELSE 'student.update' END,
      NULL,CASE WHEN kind='STUDENT_UPDATE' THEN target END);
    IF kind='STUDENT_CREATE' THEN
      INSERT INTO public.student_profiles(id,tenant_id,student_code,full_name,date_of_birth,status,updated_at)
      VALUES(created,t,code,profile_name,dob,'ACTIVE',clock_timestamp());
    ELSE
      PERFORM 1 FROM public.student_profiles WHERE tenant_id=t AND id=target FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
      UPDATE public.student_profiles SET full_name=profile_name,date_of_birth=dob,updated_at=clock_timestamp()
      WHERE tenant_id=t AND id=target RETURNING status INTO current_status;
    END IF;
  ELSE
    profile_contact:=NULLIF(btrim(body->>'contact'),'');
    IF length(COALESCE(profile_contact,''))>200 THEN RAISE EXCEPTION 'INVALID_PROFILE_CONTACT' USING ERRCODE='22023'; END IF;
    m:=educore_r4.authorize(t,CASE kind WHEN 'TEACHER_CREATE' THEN 'teacher.create' ELSE 'teacher.update' END);
    IF kind='TEACHER_CREATE' THEN
      INSERT INTO public.teacher_profiles(id,tenant_id,teacher_code,full_name,contact,status,updated_at)
      VALUES(created,t,code,profile_name,profile_contact,'ACTIVE',clock_timestamp());
    ELSE
      PERFORM 1 FROM public.teacher_profiles WHERE tenant_id=t AND id=target FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
      UPDATE public.teacher_profiles SET full_name=profile_name,contact=profile_contact,updated_at=clock_timestamp()
      WHERE tenant_id=t AND id=target RETURNING status INTO current_status;
    END IF;
  END IF;
  PERFORM educore_r4.audit(t,m,kind,CASE WHEN kind LIKE '%CREATE' THEN created ELSE target END,reason,
    jsonb_build_object('id',CASE WHEN kind LIKE '%CREATE' THEN created ELSE target END,'kind',kind));
  RETURN jsonb_build_object('id',CASE WHEN kind LIKE '%CREATE' THEN created ELSE target END,
    'status',CASE WHEN kind LIKE '%CREATE' THEN 'ACTIVE' ELSE current_status END);
END $$;
ALTER FUNCTION educore_r4.academic_profile(uuid,text,uuid,jsonb) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.academic_profile(uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.academic_profile(uuid,text,uuid,jsonb) TO educore_r4_api;
COMMIT;
