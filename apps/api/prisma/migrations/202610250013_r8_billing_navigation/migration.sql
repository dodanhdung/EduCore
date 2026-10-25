BEGIN;
-- Finance navigation is tenant-wide and server-authoritative. Record checks
-- remain in billing_read and the R2 coordinator for every operation.
DO $nav$ DECLARE ddl text; BEGIN
  ddl:=pg_get_functiondef('educore_r4.navigation_access(uuid)'::regprocedure);
  IF position('(''AT04'',''absence.read'')' IN ddl)=0
    OR position('WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)' IN ddl)=0 THEN
    RAISE EXCEPTION 'NAVIGATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
  ddl:=replace(ddl,'(''AT04'',''absence.read'')',
    '(''AT04'',''absence.read''),
    (''BL01'',''pricing.manage''),(''BL02'',''billing.read''),
    (''BL03'',''billing.read''),(''BL04'',''billing.read''),
    (''BL05'',''billing.read''),(''BL06'',''invoice.read''),(''BL07'',''invoice.read'')');
  ddl:=replace(ddl,'AND (v.screen<>''AT02''',
    'AND (v.screen<>''BL07'' OR educore_r4.has_permission(t,m,''billing.read'',NULL,NULL))
    AND (v.screen<>''AT02''');
  EXECUTE ddl;
END $nav$;
COMMIT;
