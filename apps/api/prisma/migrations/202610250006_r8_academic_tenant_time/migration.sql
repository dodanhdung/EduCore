BEGIN;
-- Tenant timezone accompanies advisory capabilities; every mutation still reauthorizes.
CREATE OR REPLACE FUNCTION educore_r4.academic_capabilities(t uuid, c uuid DEFAULT NULL, s uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; class_ok boolean; student_ok boolean; zone text;
BEGIN
  m:=educore_r3.principal(t);
  SELECT timezone INTO STRICT zone FROM public.tenants WHERE id=t;
  class_ok:=c IS NOT NULL AND EXISTS(SELECT FROM public.classes WHERE tenant_id=t AND id=c);
  student_ok:=s IS NOT NULL AND EXISTS(SELECT FROM public.student_profiles WHERE tenant_id=t AND id=s);
  RETURN jsonb_build_object(
    'tenantTimezone',zone,
    'studentCreate',educore_r4.has_permission(t,m,'student.create',NULL,NULL),
    'studentUpdate',student_ok AND educore_r4.has_permission(t,m,'student.update',NULL,s),
    'teacherCreate',educore_r4.has_permission(t,m,'teacher.create',NULL,NULL),
    'teacherUpdate',educore_r4.has_permission(t,m,'teacher.update',NULL,NULL),
    'catalogManage',educore_r4.has_permission(t,m,'academic.manage',NULL,NULL),
    'courseUpdate',educore_r4.has_permission(t,m,'course.update',NULL,NULL),
    'classCreate',educore_r4.has_permission(t,m,'class.create',NULL,NULL),
    'classUpdate',class_ok AND educore_r4.has_permission(t,m,'class.update',c,NULL),
    'teacherAssign',class_ok AND educore_r4.has_permission(t,m,'class.assign_teacher',c,NULL),
    'enroll',class_ok AND student_ok AND educore_r4.has_permission(t,m,'enrollment.create',c,NULL),
    'transferRequest',class_ok AND student_ok AND educore_r4.has_permission(t,m,'enrollment.transfer',c,NULL));
END $$;
ALTER FUNCTION educore_r4.academic_capabilities(uuid,uuid,uuid) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.academic_capabilities(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.academic_capabilities(uuid,uuid,uuid) TO educore_r4_api;
COMMIT;
