BEGIN;

-- R2 authorize is used only by aggregate financial commands and reads. Keep
-- its principal, lock, membership and linked Parent/Student checks intact.
DO $$
DECLARE ddl text; old_clause text :=
  ' OR (sc.scope_kind=''CLASS'' AND EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.class_id=sc.class_id AND e.student_id=s))';
BEGIN
  SELECT pg_get_functiondef('educore_r2.authorize(uuid,uuid,text)'::regprocedure) INTO ddl;
  IF (length(ddl)-length(replace(ddl,old_clause,'')))/length(old_clause) <> 1
    OR position('SECURITY DEFINER' IN ddl)=0
    OR position('SET search_path TO ''pg_catalog'', ''educore_r2'', ''pg_temp''' IN ddl)=0 THEN
    RAISE EXCEPTION 'R2_FINANCE_SCOPE_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(ddl,old_clause,'');
END $$;

-- This helper serves financial projections and financial approvals only.
CREATE OR REPLACE FUNCTION educore_r4.finance_allowed(t uuid,m uuid,s uuid,p text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
  SELECT educore_r4.has_permission(t,m,p,NULL,s);
$$;

-- The approval list/detail has two direct enrollment fallbacks independent of
-- finance_allowed. Both must be removed or CLASS-only actors still see data.
DO $$
DECLARE ddl text; old_clause text := E'\n        OR EXISTS (SELECT FROM public.enrollments e WHERE e.tenant_id=t\n          AND e.student_id=(ap.payload_snapshot_json->>''studentId'')::uuid\n          AND educore_r4.has_permission(t,m,''approval.read'',e.class_id,e.student_id))';
BEGIN
  SELECT replace(pg_get_functiondef('educore_r4.finance_approvals(uuid,uuid,integer,integer)'::regprocedure),E'\r\n',E'\n') INTO ddl;
  IF (length(ddl)-length(replace(ddl,old_clause,'')))/length(old_clause) <> 2
    OR position('SECURITY DEFINER' IN ddl)=0
    OR position('SET search_path TO ''pg_catalog'', ''educore_r4'', ''pg_temp''' IN ddl)=0 THEN
    RAISE EXCEPTION 'R4_FINANCE_APPROVAL_SCOPE_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(ddl,old_clause,'');
END $$;

ALTER FUNCTION educore_r2.authorize(uuid,uuid,text) OWNER TO educore_r2_owner;
ALTER FUNCTION educore_r4.finance_allowed(uuid,uuid,uuid,text) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finance_approvals(uuid,uuid,int,int) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r2.authorize(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finance_allowed(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finance_approvals(uuid,uuid,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.finance_approvals(uuid,uuid,int,int) TO educore_r4_api;
COMMIT;
