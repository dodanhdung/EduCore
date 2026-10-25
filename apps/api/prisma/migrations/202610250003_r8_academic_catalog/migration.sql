BEGIN;
GRANT INSERT,UPDATE ON public.subjects,public.levels,public.courses,public.classes TO educore_r4_owner;

CREATE FUNCTION educore_r4.academic_catalog(t uuid, kind text, target uuid, body jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; created uuid:=gen_random_uuid(); item_code text; item_name text; why text;
  subject uuid; level uuid; course uuid; active_flag boolean; class_capacity int;
  from_date date; to_date date; existing boolean;
BEGIN
  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR kind NOT IN
    ('SUBJECT_CREATE','SUBJECT_UPDATE','LEVEL_CREATE','LEVEL_UPDATE',
     'COURSE_CREATE','COURSE_UPDATE','CLASS_CREATE','CLASS_UPDATE')
    THEN RAISE EXCEPTION 'INVALID_ACADEMIC_COMMAND' USING ERRCODE='22023'; END IF;
  why:=btrim(body->>'reason'); item_name:=btrim(body->>'name'); item_code:=btrim(body->>'code');
  IF COALESCE(length(why),0) NOT BETWEEN 1 AND 2000 OR COALESCE(length(item_name),0) NOT BETWEEN 1 AND 200
    OR (kind LIKE '%CREATE' AND (target IS NOT NULL OR COALESCE(length(item_code),0) NOT BETWEEN 1 AND 64))
    OR (kind LIKE '%UPDATE' AND target IS NULL)
    THEN RAISE EXCEPTION 'INVALID_ACADEMIC_FIELDS' USING ERRCODE='22023'; END IF;
  m:=educore_r4.authorize(t,CASE kind
    WHEN 'SUBJECT_CREATE' THEN 'academic.manage' WHEN 'SUBJECT_UPDATE' THEN 'academic.manage'
    WHEN 'LEVEL_CREATE' THEN 'academic.manage' WHEN 'LEVEL_UPDATE' THEN 'academic.manage'
    WHEN 'COURSE_CREATE' THEN 'academic.manage' WHEN 'COURSE_UPDATE' THEN 'course.update'
    WHEN 'CLASS_CREATE' THEN 'class.create' ELSE 'class.update' END,
    CASE WHEN kind='CLASS_UPDATE' THEN target END);
  IF kind LIKE 'SUBJECT%' THEN
    IF kind='SUBJECT_CREATE' THEN
      INSERT INTO public.subjects(id,tenant_id,code,name,active,updated_at)
      VALUES(created,t,item_code,item_name,true,clock_timestamp());
    ELSE
      SELECT s.active INTO active_flag FROM public.subjects s WHERE s.tenant_id=t AND s.id=target FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
      IF body ? 'active' THEN active_flag:=(body->>'active')::boolean; END IF;
      IF NOT active_flag AND EXISTS(SELECT FROM public.courses c WHERE c.tenant_id=t AND c.subject_id=target)
        THEN RAISE EXCEPTION 'REFERENCED_SUBJECT' USING ERRCODE='23514'; END IF;
      UPDATE public.subjects SET name=item_name,active=active_flag,updated_at=clock_timestamp() WHERE tenant_id=t AND id=target;
    END IF;
  ELSIF kind LIKE 'LEVEL%' THEN
    IF (body->>'sortOrder')::int IS NULL OR (body->>'sortOrder')::int<0
      THEN RAISE EXCEPTION 'INVALID_SORT_ORDER' USING ERRCODE='22023'; END IF;
    IF kind='LEVEL_CREATE' THEN
      INSERT INTO public.levels(id,tenant_id,code,name,sort_order,active,updated_at)
      VALUES(created,t,item_code,item_name,(body->>'sortOrder')::int,true,clock_timestamp());
    ELSE
      SELECT l.active INTO active_flag FROM public.levels l WHERE l.tenant_id=t AND l.id=target FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
      IF body ? 'active' THEN active_flag:=(body->>'active')::boolean; END IF;
      IF NOT active_flag AND EXISTS(SELECT FROM public.courses c WHERE c.tenant_id=t AND c.level_id=target)
        THEN RAISE EXCEPTION 'REFERENCED_LEVEL' USING ERRCODE='23514'; END IF;
      UPDATE public.levels SET name=item_name,sort_order=(body->>'sortOrder')::int,
        active=active_flag,updated_at=clock_timestamp() WHERE tenant_id=t AND id=target;
    END IF;
  ELSIF kind LIKE 'COURSE%' THEN
    IF kind='COURSE_CREATE' THEN
      subject:=(body->>'subjectId')::uuid; level:=(body->>'levelId')::uuid;
      IF NOT EXISTS(SELECT FROM public.subjects s WHERE s.tenant_id=t AND s.id=subject AND s.active)
        OR NOT EXISTS(SELECT FROM public.levels l WHERE l.tenant_id=t AND l.id=level AND l.active)
        THEN RAISE EXCEPTION 'INACTIVE_OR_FOREIGN_CATALOG' USING ERRCODE='23514'; END IF;
      INSERT INTO public.courses(id,tenant_id,code,name,subject_id,level_id,status,description,updated_at)
      VALUES(created,t,item_code,item_name,subject,level,'ACTIVE',body->>'description',clock_timestamp());
    ELSE
      PERFORM 1 FROM public.courses WHERE tenant_id=t AND id=target FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
      UPDATE public.courses SET name=item_name,description=body->>'description',updated_at=clock_timestamp()
      WHERE tenant_id=t AND id=target;
    END IF;
  ELSE
    IF kind='CLASS_CREATE' THEN
      course:=(body->>'courseId')::uuid; class_capacity:=(body->>'capacity')::int;
      from_date:=(body->>'startDate')::date; to_date:=(body->>'endDate')::date;
      IF class_capacity IS NULL OR class_capacity<=0 OR (from_date IS NOT NULL AND to_date IS NOT NULL AND to_date<from_date)
        OR NOT EXISTS(SELECT FROM public.courses c JOIN public.subjects s ON s.tenant_id=t AND s.id=c.subject_id
          JOIN public.levels l ON l.tenant_id=t AND l.id=c.level_id
          WHERE c.tenant_id=t AND c.id=course AND c.status='ACTIVE' AND s.active AND l.active)
        THEN RAISE EXCEPTION 'INVALID_CLASS_REFERENCE_OR_CAPACITY' USING ERRCODE='23514'; END IF;
      INSERT INTO public.classes(id,tenant_id,code,name,course_id,capacity,status,start_date,end_date,updated_at)
      VALUES(created,t,item_code,item_name,course,class_capacity,'PLANNED',from_date,to_date,clock_timestamp());
    ELSE
      SELECT true INTO existing FROM public.classes WHERE tenant_id=t AND id=target FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
      UPDATE public.classes SET name=item_name,updated_at=clock_timestamp() WHERE tenant_id=t AND id=target;
    END IF;
  END IF;
  PERFORM educore_r4.audit(t,m,kind,CASE WHEN kind LIKE '%CREATE' THEN created ELSE target END,why,
    jsonb_build_object('id',CASE WHEN kind LIKE '%CREATE' THEN created ELSE target END,'kind',kind));
  RETURN jsonb_build_object('id',CASE WHEN kind LIKE '%CREATE' THEN created ELSE target END);
END $$;
ALTER FUNCTION educore_r4.academic_catalog(uuid,text,uuid,jsonb) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.academic_catalog(uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.academic_catalog(uuid,text,uuid,jsonb) TO educore_r4_api;
COMMIT;
