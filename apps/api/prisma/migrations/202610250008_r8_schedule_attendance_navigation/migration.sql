BEGIN;
-- Keep Academic and Management grants while adding only routable R8 screens.
DO $nav$ DECLARE ddl text; BEGIN
  ddl:=pg_get_functiondef('educore_r4.navigation_access(uuid)'::regprocedure);
  IF position('(''AC08'',''class.read'')' IN ddl)=0
    OR position('WHERE educore_r4.has_permission(t,m,v.permission,NULL,NULL)' IN ddl)=0
    OR position('AND (v.screen<>''OP02''' IN ddl)=0 THEN
    RAISE EXCEPTION 'NAVIGATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
  ddl:=replace(ddl,'(''AC08'',''class.read'')',
    '(''AC08'',''class.read''),
    (''SC01'',''schedule.read''),(''SC02'',''resource.read''),(''SC03'',''schedule.create''),
    (''SC05'',''schedule.read''),(''SC06'',''schedule.read''),
    (''AT01'',''attendance.read''),(''AT02'',''attendance.mark''),
    (''AT03'',''absence.create''),(''AT04'',''absence.read'')');
  ddl:=replace(ddl,'WHERE educore_r4.has_permission(t,m,v.permission,NULL,NULL)',
    'WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)
      OR (v.screen IN (''SC01'',''SC05'',''SC06'',''AT03'',''AT04'') AND EXISTS
        (SELECT FROM public.class_sessions cs
         LEFT JOIN public.session_participants sp ON sp.tenant_id=t AND sp.session_id=cs.id AND sp.removed_at IS NULL
         WHERE cs.tenant_id=t AND educore_r4.has_permission(t,m,v.permission,cs.class_id,sp.student_id)))
      OR (v.screen IN (''AT01'',''AT02'') AND EXISTS
        (SELECT FROM public.class_sessions cs WHERE cs.tenant_id=t
          AND educore_r4.has_permission(t,m,v.permission,cs.class_id,NULL))))');
  ddl:=replace(ddl,'AND (v.screen<>''OP02''',
    'AND (v.screen<>''AT02'' OR EXISTS(SELECT FROM public.class_sessions cs WHERE cs.tenant_id=t AND educore_r4.has_permission(t,m,''attendance.mark'',cs.class_id,NULL)))
    AND (v.screen<>''OP02''');
  EXECUTE ddl;
END $nav$;
COMMIT;
