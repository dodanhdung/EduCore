BEGIN;
-- R8 readers bind identity to the R4 session and recheck resource scope on every call.
CREATE FUNCTION educore_r5.teacher_classes(t uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); items jsonb;
BEGIN
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name),'[]'::jsonb) INTO items
 FROM public.classes c JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.class_id=c.id
 JOIN public.teacher_profiles tp ON tp.tenant_id=t AND tp.id=ca.teacher_id
 WHERE c.tenant_id=t AND tp.membership_id=m AND tp.status='ACTIVE'
 AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp())
 AND educore_r4.has_permission(t,m,'assignment.create',c.id,NULL);
 RETURN jsonb_build_object('classes',items,'timezone',(SELECT timezone FROM public.tenants WHERE id=t));
END $$;

CREATE FUNCTION educore_r5.teacher_assignments(t uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); items jsonb;
BEGIN
 SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id),'[]'::jsonb) INTO items
 FROM public.assignments a JOIN public.teacher_profiles tp ON tp.tenant_id=t AND tp.id=a.created_by_teacher_id AND tp.membership_id=m AND tp.status='ACTIVE'
 WHERE a.tenant_id=t AND (
  (a.class_id IS NOT NULL AND EXISTS(SELECT FROM public.class_teacher_assignments ca WHERE ca.tenant_id=t AND ca.class_id=a.class_id AND ca.teacher_id=tp.id AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp()))
    AND educore_r4.has_permission(t,m,'assignment.read',a.class_id,NULL))
  OR EXISTS(SELECT FROM public.assignment_recipients ar JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.class_id=ar.class_id AND ca.teacher_id=tp.id AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp())
    WHERE ar.tenant_id=t AND ar.assignment_id=a.id AND educore_r4.has_permission(t,m,'assignment.read',ar.class_id,ar.student_id)));
 RETURN items;
END $$;

CREATE FUNCTION educore_r5.teacher_recipients(t uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE rows jsonb; output_value jsonb;
BEGIN
 rows:=educore_r5.recipients(t,target);
 SELECT COALESCE(jsonb_agg(r.value||jsonb_build_object('studentName',sp.full_name) ORDER BY r.ordinality),'[]'::jsonb)
 INTO output_value FROM jsonb_array_elements(rows) WITH ORDINALITY AS r(value,ordinality)
 JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=(r.value->>'student_id')::uuid;
 RETURN output_value;
END $$;

CREATE FUNCTION educore_r5.my_assignments(t uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); items jsonb;
BEGIN
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',a.id,'title',a.title,'description',a.description,'classId',ar.class_id,'className',c.name,
  'deadlineAt',GREATEST(a.deadline_at,COALESCE(ar.deadline_override_at,a.deadline_at)),
  'priority',a.priority,'status',a.status,'recipientId',ar.id,'submissionId',sub.id,
  'currentVersionId',sub.current_version_id,'versionNo',v.version_no,'submittedAt',v.submitted_at,
  'isLate',v.is_late,'canSubmit',NOT EXISTS(SELECT FROM public.grades lock_grade JOIN public.submission_versions lock_version ON lock_version.tenant_id=t AND lock_version.id=lock_grade.submission_version_id WHERE lock_grade.tenant_id=t AND lock_version.submission_id=sub.id AND lock_grade.cancelled_at IS NULL),
  'gradeId',g.id,'score',g.score::text,'feedback',g.feedback)
  ORDER BY a.deadline_at,a.id),'[]'::jsonb) INTO items
 FROM public.student_profiles sp JOIN public.assignment_recipients ar ON ar.tenant_id=t AND ar.student_id=sp.id AND ar.revoked_at IS NULL
 JOIN public.assignments a ON a.tenant_id=t AND a.id=ar.assignment_id AND a.status='PUBLISHED'
 LEFT JOIN public.classes c ON c.tenant_id=t AND c.id=ar.class_id
 LEFT JOIN public.submissions sub ON sub.tenant_id=t AND sub.recipient_id=ar.id
 LEFT JOIN public.submission_versions v ON v.tenant_id=t AND v.id=sub.current_version_id
 LEFT JOIN LATERAL (SELECT gr.id,gr.score,gr.feedback FROM public.grades gr WHERE gr.tenant_id=t AND gr.submission_version_id=v.id AND gr.status='PUBLISHED' AND gr.cancelled_at IS NULL ORDER BY gr.revision_no DESC LIMIT 1) g ON true
 WHERE sp.tenant_id=t AND sp.membership_id=m AND sp.status='ACTIVE'
 AND educore_r4.has_permission(t,m,'assignment.read',ar.class_id,ar.student_id);
 RETURN jsonb_build_object('items',items,'timezone',(SELECT timezone FROM public.tenants WHERE id=t));
END $$;

CREATE FUNCTION educore_r5.grading_queue(t uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); items jsonb;
BEGIN
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'submissionId',sub.id,'versionId',v.id,'versionNo',v.version_no,'submittedAt',v.submitted_at,'isLate',v.is_late,
  'assignmentId',a.id,'assignmentTitle',a.title,'classId',ar.class_id,'className',c.name,
  'studentId',ar.student_id,'studentName',sp.full_name,'recipientId',ar.id,
  'gradeId',g.id,'gradeStatus',g.status,'gradeRevision',g.revision_no,'score',CASE WHEN g.status='PUBLISHED' THEN g.score::text ELSE NULL END)
  ORDER BY v.submitted_at DESC),'[]'::jsonb) INTO items
 FROM public.submissions sub JOIN public.assignment_recipients ar ON ar.tenant_id=t AND ar.id=sub.recipient_id AND ar.revoked_at IS NULL
 JOIN public.assignments a ON a.tenant_id=t AND a.id=ar.assignment_id
 JOIN public.submission_versions v ON v.tenant_id=t AND v.id=sub.current_version_id
 JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=ar.student_id
 LEFT JOIN public.classes c ON c.tenant_id=t AND c.id=ar.class_id
 JOIN public.teacher_profiles tp ON tp.tenant_id=t AND tp.id=a.created_by_teacher_id AND tp.membership_id=m AND tp.status='ACTIVE'
 JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.class_id=ar.class_id AND ca.teacher_id=tp.id AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp())
 LEFT JOIN LATERAL (SELECT gr.id,gr.status,gr.revision_no,gr.score FROM public.grades gr WHERE gr.tenant_id=t AND gr.submission_version_id=v.id AND gr.cancelled_at IS NULL ORDER BY gr.revision_no DESC LIMIT 1) g ON true
 WHERE sub.tenant_id=t AND educore_r4.has_permission(t,m,'grade.write',ar.class_id,ar.student_id);
 RETURN jsonb_build_object('items',items,'timezone',(SELECT timezone FROM public.tenants WHERE id=t));
END $$;

CREATE FUNCTION educore_r5.grading_item(t uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); ar public.assignment_recipients%ROWTYPE; output_value jsonb;
BEGIN
 SELECT r.* INTO ar FROM public.submissions sub JOIN public.assignment_recipients r ON r.tenant_id=t AND r.id=sub.recipient_id WHERE sub.tenant_id=t AND sub.id=target;
 IF ar.id IS NULL THEN RAISE EXCEPTION 'SUBMISSION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM educore_r5.teacher(t,m,ar.class_id,'grade.write',ar.student_id);
 IF ar.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'RECIPIENT_REVOKED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('submissionId',sub.id,'recipientId',ar.id,'assignmentId',a.id,'assignmentTitle',a.title,
  'studentId',ar.student_id,'studentName',sp.full_name,'currentVersionId',sub.current_version_id,'timezone',(SELECT timezone FROM public.tenants WHERE id=t),
  'versions',COALESCE((SELECT jsonb_agg(to_jsonb(v)||jsonb_build_object('fileIds',
    (SELECT COALESCE(jsonb_agg(sf.file_id ORDER BY sf.sort_order),'[]'::jsonb) FROM public.submission_files sf WHERE sf.tenant_id=t AND sf.submission_version_id=v.id)) ORDER BY v.version_no)
    FROM public.submission_versions v WHERE v.tenant_id=t AND v.submission_id=sub.id),'[]'::jsonb),
  'grade', (SELECT jsonb_build_object('id',g.id,'revision',g.revision_no,'status',g.status,'score',g.score::text,'feedback',g.feedback)
    FROM public.grades g WHERE g.tenant_id=t AND g.submission_version_id=sub.current_version_id AND g.cancelled_at IS NULL ORDER BY g.revision_no DESC LIMIT 1))
 INTO output_value FROM public.submissions sub JOIN public.assignments a ON a.tenant_id=t AND a.id=ar.assignment_id
 JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=ar.student_id WHERE sub.tenant_id=t AND sub.id=target;
 RETURN output_value;
END $$;

DO $nav$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.navigation_access(uuid)'::regprocedure);
 IF position('(''AT04'',''absence.read'')' IN ddl)=0 OR position('AND (v.screen<>''AT02''' IN ddl)=0
  OR position('WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)' IN ddl)=0 THEN
  RAISE EXCEPTION 'NAVIGATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
 ddl:=replace(ddl,'(''AT04'',''absence.read'')',
  '(''AT04'',''absence.read''),(''AS01'',''assignment.read''),(''AS02'',''assignment.create''),(''AS03'',''assignment.read''),(''AS04'',''grade.write''),(''AS05'',''grade.write''),(''AS06'',''assignment.read''),(''AS07'',''assignment.read'')');
 ddl:=replace(ddl,'WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)',
  'WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)
      OR (v.screen IN (''AS01'',''AS02'',''AS03'',''AS04'',''AS05'') AND EXISTS
       (SELECT FROM public.teacher_profiles tp JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.teacher_id=tp.id
        WHERE tp.tenant_id=t AND tp.membership_id=m AND tp.status=''ACTIVE'' AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp())
        AND educore_r4.has_permission(t,m,v.permission,ca.class_id,NULL)))
      OR (v.screen IN (''AS06'',''AS07'') AND EXISTS
       (SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t AND sp.membership_id=m AND sp.status=''ACTIVE''
        AND educore_r4.has_permission(t,m,v.permission,NULL,sp.id)))');
 ddl:=replace(ddl,'AND (v.screen<>''AT02''',
  'AND (v.screen NOT IN (''AS01'',''AS02'',''AS03'',''AS04'',''AS05'') OR EXISTS
    (SELECT FROM public.teacher_profiles tp JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.teacher_id=tp.id
     WHERE tp.tenant_id=t AND tp.membership_id=m AND tp.status=''ACTIVE'' AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp())
     AND educore_r4.has_permission(t,m,v.permission,ca.class_id,NULL)
     AND (v.screen<>''AS02'' OR educore_r4.has_permission(t,m,''assignment.read'',ca.class_id,NULL))))
   AND (v.screen NOT IN (''AS06'',''AS07'') OR EXISTS
    (SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t AND sp.membership_id=m AND sp.status=''ACTIVE''
     AND educore_r4.has_permission(t,m,v.permission,NULL,sp.id)))
   AND (v.screen<>''AT02''');
 EXECUTE ddl;
END $nav$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r5' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON FUNCTION educore_r5.teacher_classes(uuid),educore_r5.teacher_assignments(uuid),educore_r5.teacher_recipients(uuid,uuid),educore_r5.my_assignments(uuid),educore_r5.grading_queue(uuid),educore_r5.grading_item(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r5.teacher_classes(uuid),educore_r5.teacher_assignments(uuid),educore_r5.teacher_recipients(uuid,uuid),educore_r5.my_assignments(uuid),educore_r5.grading_queue(uuid),educore_r5.grading_item(uuid,uuid) TO educore_r4_api;
COMMIT;
