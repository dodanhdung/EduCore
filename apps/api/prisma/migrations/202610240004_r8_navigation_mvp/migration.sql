-- Owner-approved R8 navigation only. Resource operations keep their own authorization.
BEGIN;
CREATE OR REPLACE FUNCTION educore_r4.navigation_access(t uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE
  a public.auth_sessions%ROWTYPE;
  m uuid;
  screens jsonb;
BEGIN
  SELECT * INTO a FROM public.auth_sessions WHERE id=educore_r4.session_id();
  IF a.id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  IF t IS NULL OR a.active_tenant_id IS DISTINCT FROM t THEN
    RAISE EXCEPTION 'TENANT_DENIED' USING ERRCODE='42501';
  END IF;
  BEGIN
    m := educore_r3.principal(t);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF educore_r4.session_id() IS NULL THEN
      RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';
    END IF;
    RAISE;
  END;
  -- Re-read after the principal's User -> Tenant locks and fresh checks.
  SELECT * INTO a FROM public.auth_sessions WHERE id=educore_r4.session_id();
  IF a.id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT COALESCE(jsonb_agg(v.screen ORDER BY v.screen),'[]'::jsonb) INTO screens
  FROM (VALUES
    ('OP01','member.read'),
    ('OP02','member.read'),
    ('OP03','relationship.read'),
    ('OP04','approval.read'),
    ('OP05','approval.read'),
    ('OP06','audit.read'),
    ('OP07','job.read')
  ) AS v(screen,permission)
  WHERE educore_r4.has_permission(t,m,v.permission,NULL,NULL)
    AND (v.screen<>'OP02' OR educore_r4.has_permission(t,m,'role.read',NULL,NULL));
  RETURN jsonb_build_object(
    'userId',a.user_id,'sessionId',a.id,'tenantId',t,'screenIds',screens,
    'validUntil',floor(extract(epoch FROM LEAST(
      a.access_expires_at,a.expires_at,clock_timestamp()+interval '60 seconds'))*1000));
END $$;
ALTER FUNCTION educore_r4.navigation_access(uuid) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.navigation_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.navigation_access(uuid) TO educore_r4_api;
COMMIT;
