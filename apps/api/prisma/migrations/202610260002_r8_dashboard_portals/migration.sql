BEGIN;

-- All branches execute inside the R4 token-bound API transaction. No table SELECT
-- is granted to the API login. A child id is only a lookup, never authority.
GRANT EXECUTE ON FUNCTION educore_r2.net(uuid,uuid),educore_r2.paid(uuid,uuid) TO educore_r4_owner;

CREATE FUNCTION educore_r4.portal_read(t uuid, kind text, target uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE
  m uuid;
  zone text;
  tenant_name text;
  teacher jsonb;
  learner jsonb;
  children jsonb;
  child_name text;
  can_finance boolean;
  can_report boolean;
  students_count bigint;
  classes_count bigint;
  debt numeric;
  rows_json jsonb;
BEGIN
  m := educore_r3.principal(t);
  SELECT timezone,name INTO zone,tenant_name FROM public.tenants WHERE id=t AND status='ACTIVE';
  IF zone IS NULL THEN RAISE EXCEPTION 'TENANT_DENIED' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object('id',p.id,'name',p.full_name) INTO teacher
  FROM public.teacher_profiles p WHERE p.tenant_id=t AND p.membership_id=m AND p.status='ACTIVE'
  AND EXISTS (SELECT FROM public.class_teacher_assignments a WHERE a.tenant_id=t AND a.teacher_id=p.id
    AND a.valid_from<=clock_timestamp() AND (a.valid_to IS NULL OR a.valid_to>clock_timestamp())
    AND educore_r4.has_permission(t,m,'schedule.read',a.class_id,NULL)) LIMIT 1;
  SELECT jsonb_build_object('id',p.id,'name',p.full_name) INTO learner
  FROM public.student_profiles p WHERE p.tenant_id=t AND p.membership_id=m AND p.status='ACTIVE'
  AND educore_r4.has_permission(t,m,'schedule.read',NULL,p.id) LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'name',s.full_name) ORDER BY s.full_name,s.id),'[]'::jsonb)
    INTO children
  FROM public.parent_student_links l JOIN public.student_profiles s ON s.tenant_id=t AND s.id=l.student_id
  WHERE l.tenant_id=t AND l.parent_membership_id=m AND l.verified_at IS NOT NULL AND l.revoked_at IS NULL
    AND s.status='ACTIVE' AND EXISTS (
      SELECT FROM public.membership_roles mr JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id
      JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id
      WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL AND r.code='PARENT'
        AND (sc.scope_kind='TENANT' OR (sc.scope_kind='STUDENT' AND sc.student_id=s.id)));

  IF kind='CONTEXT' THEN
    RETURN jsonb_build_object('tenantId',t,'tenantName',tenant_name,'timeZone',zone,'asOf',clock_timestamp(),
      'teacher',teacher,'student',learner,'children',children);
  ELSIF kind='TEACHER_SESSIONS' THEN
    IF teacher IS NULL OR target IS NOT NULL THEN RAISE EXCEPTION 'TEACHER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('items',(SELECT COALESCE(jsonb_agg(row ORDER BY row."startsAt",row.id),'[]'::jsonb) FROM (
      SELECT cs.id,cs.class_id AS "classId",c.name AS "className",cs.teacher_id AS "teacherId",
        cs.room_id AS "roomId",cs.delivery_mode AS "deliveryMode",cs.starts_at AS "startsAt",
        cs.ends_at AS "endsAt",cs.status
      FROM public.class_sessions cs JOIN public.classes c ON c.tenant_id=t AND c.id=cs.class_id
      WHERE cs.tenant_id=t AND cs.teacher_id=(teacher->>'id')::uuid AND cs.status='CONFIRMED'
        AND cs.starts_at>=clock_timestamp()-interval '1 day' AND cs.starts_at<clock_timestamp()+interval '29 days'
        AND EXISTS (SELECT FROM public.class_teacher_assignments a WHERE a.tenant_id=t
          AND a.class_id=cs.class_id AND a.teacher_id=cs.teacher_id AND a.valid_from<=clock_timestamp()
          AND (a.valid_to IS NULL OR a.valid_to>clock_timestamp()))
        AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,NULL)
      ORDER BY cs.starts_at,cs.id LIMIT 100) row),
      'total',(SELECT count(*) FROM public.class_sessions cs WHERE cs.tenant_id=t
        AND cs.teacher_id=(teacher->>'id')::uuid AND cs.status='CONFIRMED'
        AND cs.starts_at>=clock_timestamp()-interval '1 day' AND cs.starts_at<clock_timestamp()+interval '29 days'
        AND EXISTS (SELECT FROM public.class_teacher_assignments a WHERE a.tenant_id=t
          AND a.class_id=cs.class_id AND a.teacher_id=cs.teacher_id AND a.valid_from<=clock_timestamp()
          AND (a.valid_to IS NULL OR a.valid_to>clock_timestamp()))
        AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,NULL)),
      'asOf',clock_timestamp(),'timeZone',zone);
  ELSIF kind='STUDENT_SESSIONS' THEN
    IF learner IS NULL OR target IS NOT NULL THEN RAISE EXCEPTION 'STUDENT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('items',(SELECT COALESCE(jsonb_agg(row ORDER BY row."startsAt",row.id),'[]'::jsonb) FROM (
      SELECT cs.id,cs.class_id AS "classId",c.name AS "className",cs.teacher_id AS "teacherId",
        cs.room_id AS "roomId",cs.delivery_mode AS "deliveryMode",cs.starts_at AS "startsAt",
        cs.ends_at AS "endsAt",cs.status
      FROM public.session_participants sp JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=sp.session_id
      JOIN public.classes c ON c.tenant_id=t AND c.id=cs.class_id
      WHERE sp.tenant_id=t AND sp.student_id=(learner->>'id')::uuid AND sp.removed_at IS NULL
        AND cs.status IN ('CONFIRMED','CANCELLED')
        AND cs.starts_at>=clock_timestamp()-interval '1 day' AND cs.starts_at<clock_timestamp()+interval '29 days'
        AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,sp.student_id)
      ORDER BY cs.starts_at,cs.id LIMIT 100) row),
      'total',(SELECT count(*) FROM public.session_participants sp
        JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=sp.session_id
        WHERE sp.tenant_id=t AND sp.student_id=(learner->>'id')::uuid AND sp.removed_at IS NULL
          AND cs.status IN ('CONFIRMED','CANCELLED')
          AND cs.starts_at>=clock_timestamp()-interval '1 day' AND cs.starts_at<clock_timestamp()+interval '29 days'
          AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,sp.student_id)),
      'asOf',clock_timestamp(),'timeZone',zone);
  ELSIF kind='OVERVIEW' THEN
    IF target IS NOT NULL THEN RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE='22023'; END IF;
    SELECT EXISTS (SELECT FROM public.classes c WHERE c.tenant_id=t
      AND educore_r4.has_permission(t,m,'dashboard.view',c.id,NULL))
      OR EXISTS (SELECT FROM public.student_profiles s WHERE s.tenant_id=t
      AND educore_r4.has_permission(t,m,'dashboard.view',NULL,s.id))
      OR educore_r4.has_permission(t,m,'dashboard.view',NULL,NULL) INTO can_report;
    IF NOT can_report THEN RAISE EXCEPTION 'PERMISSION_OR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    IF educore_r4.has_permission(t,m,'student.read',NULL,NULL)
      OR EXISTS (SELECT FROM public.classes c WHERE c.tenant_id=t
        AND educore_r4.has_permission(t,m,'student.read',c.id,NULL))
      OR EXISTS (SELECT FROM public.student_profiles s WHERE s.tenant_id=t
        AND educore_r4.has_permission(t,m,'student.read',NULL,s.id)) THEN
      SELECT count(DISTINCT e.student_id) INTO students_count FROM public.enrollments e
      JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=e.student_id AND sp.status='ACTIVE'
      WHERE e.tenant_id=t AND e.status='ACTIVE' AND e.effective_from<=clock_timestamp()
        AND (e.effective_to IS NULL OR e.effective_to>clock_timestamp())
        AND educore_r4.has_permission(t,m,'dashboard.view',e.class_id,e.student_id)
        AND educore_r4.has_permission(t,m,'student.read',e.class_id,e.student_id);
    END IF;
    IF educore_r4.has_permission(t,m,'class.read',NULL,NULL)
      OR EXISTS (SELECT FROM public.classes c WHERE c.tenant_id=t
        AND educore_r4.has_permission(t,m,'class.read',c.id,NULL)) THEN
      SELECT count(*) INTO classes_count FROM public.classes c WHERE c.tenant_id=t AND c.status='ACTIVE'
        AND educore_r4.has_permission(t,m,'dashboard.view',c.id,NULL)
        AND educore_r4.has_permission(t,m,'class.read',c.id,NULL);
    END IF;
    -- Invoice obligations cannot be safely split by class. Only tenant or
    -- individually authorized student scope contributes a whole invoice.
    SELECT EXISTS (SELECT FROM public.student_profiles s WHERE s.tenant_id=t
      AND educore_r4.has_permission(t,m,'dashboard.view',NULL,s.id)
      AND educore_r4.has_permission(t,m,'invoice.read',NULL,s.id)
      AND educore_r4.has_permission(t,m,'receivable.read',NULL,s.id)) INTO can_finance;
    can_finance := can_finance OR (educore_r4.has_permission(t,m,'dashboard.view',NULL,NULL)
      AND educore_r4.has_permission(t,m,'invoice.read',NULL,NULL)
      AND educore_r4.has_permission(t,m,'receivable.read',NULL,NULL));
    IF can_finance THEN
      SELECT COALESCE(sum(greatest(educore_r2.net(i.id,t)-educore_r2.paid(i.id,t),0)),0) INTO debt
      FROM public.invoices i WHERE i.tenant_id=t AND i.status='ISSUED'
        AND educore_r4.has_permission(t,m,'dashboard.view',NULL,i.student_id)
        AND educore_r4.has_permission(t,m,'invoice.read',NULL,i.student_id)
        AND educore_r4.has_permission(t,m,'receivable.read',NULL,i.student_id);
    END IF;
    RETURN jsonb_build_object('tenantId',t,'tenantName',tenant_name,'timeZone',zone,'asOf',clock_timestamp(),
      'scope','Effective tenant, class and student grants',
      'students',students_count,'classes',classes_count,'outstandingVnd',debt::text);
  ELSIF kind='CHILD' OR kind='BILLING' THEN
    IF target IS NULL THEN RAISE EXCEPTION 'TARGET_REQUIRED' USING ERRCODE='22023'; END IF;
    SELECT s.full_name INTO child_name FROM public.student_profiles s WHERE s.tenant_id=t AND s.id=target AND s.status='ACTIVE'
      AND (EXISTS (SELECT FROM jsonb_array_elements(children) x WHERE (x->>'id')::uuid=s.id)
        OR (kind='BILLING' AND learner->>'id'=s.id::text));
    IF child_name IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
    IF kind='CHILD' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name,c.id),'[]'::jsonb)
        INTO rows_json FROM public.enrollments e JOIN public.classes c ON c.tenant_id=t AND c.id=e.class_id
      WHERE e.tenant_id=t AND e.student_id=target AND e.status='ACTIVE' AND c.status='ACTIVE'
        AND e.effective_from<=clock_timestamp() AND (e.effective_to IS NULL OR e.effective_to>clock_timestamp())
        AND educore_r4.has_permission(t,m,'schedule.read',c.id,target);
      RETURN jsonb_build_object('id',target,'name',child_name,'timeZone',zone,'asOf',clock_timestamp(),
        'classes',rows_json,
        'scheduleAvailable',educore_r4.has_permission(t,m,'schedule.read',NULL,target),
        'assignmentsAvailable',educore_r4.has_permission(t,m,'assignment.read',NULL,target),
        'gradesAvailable',educore_r4.has_permission(t,m,'grade.read_published',NULL,target),
        'leaveAvailable',educore_r4.has_permission(t,m,'absence.read',NULL,target),
        'sessions',(SELECT COALESCE(jsonb_agg(row ORDER BY row."startsAt",row.id),'[]'::jsonb) FROM (
          SELECT cs.id,cs.starts_at AS "startsAt",c.name AS "className",cs.status
          FROM public.session_participants sp JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=sp.session_id
          JOIN public.classes c ON c.tenant_id=t AND c.id=cs.class_id
          WHERE sp.tenant_id=t AND sp.student_id=target AND sp.removed_at IS NULL AND cs.status='CONFIRMED'
            AND cs.starts_at>=clock_timestamp() AND cs.starts_at<clock_timestamp()+interval '31 days'
            AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,target)
          ORDER BY cs.starts_at,cs.id LIMIT 20) row),
        'assignments',(SELECT COALESCE(jsonb_agg(row ORDER BY row."deadlineAt",row.id),'[]'::jsonb) FROM (
          SELECT a.id,a.title,a.deadline_at AS "deadlineAt",c.name AS "className",
            CASE WHEN educore_r4.has_permission(t,m,'grade.read_published',ar.class_id,target)
              THEN g.score::text ELSE NULL END AS score
          FROM public.assignment_recipients ar JOIN public.assignments a ON a.tenant_id=t AND a.id=ar.assignment_id
          LEFT JOIN public.classes c ON c.tenant_id=t AND c.id=ar.class_id
          LEFT JOIN public.submissions sub ON sub.tenant_id=t AND sub.recipient_id=ar.id
          LEFT JOIN LATERAL (SELECT gr.score FROM public.grades gr WHERE gr.tenant_id=t
            AND gr.submission_version_id=sub.current_version_id AND gr.status='PUBLISHED'
            AND gr.published_at IS NOT NULL AND gr.cancelled_at IS NULL
            ORDER BY gr.revision_no DESC LIMIT 1) g ON true
          WHERE ar.tenant_id=t AND ar.student_id=target AND ar.revoked_at IS NULL AND a.status IN ('PUBLISHED','ARCHIVED')
            AND educore_r4.has_permission(t,m,'assignment.read',ar.class_id,target)
          ORDER BY a.deadline_at,a.id LIMIT 20) row),
        'leaves',(SELECT CASE WHEN EXISTS (SELECT FROM public.session_participants sp JOIN public.class_sessions cs
            ON cs.tenant_id=t AND cs.id=sp.session_id WHERE sp.tenant_id=t AND sp.student_id=target
              AND educore_r4.has_permission(t,m,'absence.read',cs.class_id,target))
          THEN (SELECT COALESCE(jsonb_agg(row ORDER BY row."submittedAt" DESC,row.id),'[]'::jsonb) FROM (
            SELECT l.id,l.status,l.submitted_at AS "submittedAt",sp.session_id AS "sessionId" FROM public.absence_requests l
            JOIN public.session_participants sp ON sp.tenant_id=t AND sp.id=l.participant_id
            JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=sp.session_id
            WHERE l.tenant_id=t AND sp.student_id=target AND educore_r4.has_permission(t,m,'absence.read',cs.class_id,target)
            ORDER BY l.submitted_at DESC,l.id LIMIT 20) row) ELSE NULL END));
    END IF;
    can_finance:=educore_r4.has_permission(t,m,'invoice.read',NULL,target)
      AND educore_r4.has_permission(t,m,'receivable.read',NULL,target);
    IF NOT can_finance THEN RETURN jsonb_build_object('id',target,'name',child_name,'timeZone',zone,
      'asOf',clock_timestamp(),'invoices',NULL,'wallet',NULL,'status','UNAVAILABLE'); END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'dueAt',i.due_at,
      'netObligationVnd',educore_r2.net(i.id,t)::bigint::text,
      'allocatedVnd',educore_r2.paid(i.id,t)::bigint::text,
      'outstandingVnd',greatest(educore_r2.net(i.id,t)-educore_r2.paid(i.id,t),0)::bigint::text)
      ORDER BY i.issued_at DESC,i.id),'[]'::jsonb) INTO rows_json
    FROM (SELECT * FROM public.invoices WHERE tenant_id=t AND student_id=target AND status='ISSUED'
      ORDER BY issued_at DESC,id LIMIT 20) i;
    RETURN jsonb_build_object('id',target,'name',child_name,'timeZone',zone,'asOf',clock_timestamp(),
      'invoices',rows_json,'wallet',NULL,'status','PARTIAL','invoiceLimit',20,
      'invoiceCount',(SELECT count(*) FROM public.invoices WHERE tenant_id=t AND student_id=target AND status='ISSUED'),
      'totals',(SELECT jsonb_build_object(
        'netObligationVnd',COALESCE(sum(educore_r2.net(i.id,t)),0)::text,
        'allocatedVnd',COALESCE(sum(educore_r2.paid(i.id,t)),0)::text,
        'outstandingVnd',COALESCE(sum(greatest(educore_r2.net(i.id,t)-educore_r2.paid(i.id,t),0)),0)::text)
        FROM public.invoices i WHERE i.tenant_id=t AND i.student_id=target AND i.status='ISSUED'));
  END IF;
  RAISE EXCEPTION 'UNSUPPORTED_READ' USING ERRCODE='22023';
END $$;
ALTER FUNCTION educore_r4.portal_read(uuid,text,uuid) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.portal_read(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.portal_read(uuid,text,uuid) TO educore_r4_api;

-- Extend the final R8 navigation definition without replacing earlier routes.
DO $nav$ DECLARE ddl text; BEGIN
  ddl:=pg_get_functiondef('educore_r4.navigation_access(uuid)'::regprocedure);
  IF position('  RETURN jsonb_build_object(' IN ddl)=0 OR position('screenIds'',screens' IN ddl)=0 THEN
    RAISE EXCEPTION 'NAVIGATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
  ddl:=replace(ddl,'  RETURN jsonb_build_object(', $insert$
  SELECT COALESCE(jsonb_agg(DISTINCT screen ORDER BY screen),'[]'::jsonb) INTO screens FROM (
    SELECT jsonb_array_elements_text(screens) screen
    UNION ALL SELECT 'G01' WHERE educore_r4.has_permission(t,m,'dashboard.view',NULL,NULL)
      OR EXISTS (SELECT FROM public.classes c WHERE c.tenant_id=t
        AND educore_r4.has_permission(t,m,'dashboard.view',c.id,NULL))
      OR EXISTS (SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t AND sp.status='ACTIVE'
        AND educore_r4.has_permission(t,m,'dashboard.view',NULL,sp.id))
    UNION ALL SELECT 'PO01' WHERE EXISTS (SELECT FROM public.teacher_profiles p
      JOIN public.class_teacher_assignments ta ON ta.tenant_id=t AND ta.teacher_id=p.id
      WHERE p.tenant_id=t AND p.membership_id=m AND p.status='ACTIVE'
        AND ta.valid_from<=clock_timestamp() AND (ta.valid_to IS NULL OR ta.valid_to>clock_timestamp())
        AND educore_r4.has_permission(t,m,'schedule.read',ta.class_id,NULL))
    UNION ALL SELECT 'PO02' WHERE EXISTS (SELECT FROM public.student_profiles p WHERE p.tenant_id=t
      AND p.membership_id=m AND p.status='ACTIVE' AND educore_r4.has_permission(t,m,'schedule.read',NULL,p.id))
    UNION ALL SELECT 'PO03' WHERE EXISTS (SELECT FROM public.parent_student_links l
      JOIN public.student_profiles s ON s.tenant_id=t AND s.id=l.student_id AND s.status='ACTIVE'
      WHERE l.tenant_id=t AND l.parent_membership_id=m AND l.verified_at IS NOT NULL AND l.revoked_at IS NULL
        AND educore_r4.has_permission(t,m,'schedule.read',NULL,s.id))
    UNION ALL SELECT 'PO04' WHERE EXISTS (SELECT FROM public.parent_student_links l
      JOIN public.student_profiles s ON s.tenant_id=t AND s.id=l.student_id AND s.status='ACTIVE'
      WHERE l.tenant_id=t AND l.parent_membership_id=m AND l.verified_at IS NOT NULL AND l.revoked_at IS NULL
        AND educore_r4.has_permission(t,m,'schedule.read',NULL,s.id))
    UNION ALL SELECT 'PO05' WHERE EXISTS (SELECT FROM public.parent_student_links l
      WHERE l.tenant_id=t AND l.parent_membership_id=m AND l.verified_at IS NOT NULL AND l.revoked_at IS NULL
        AND educore_r4.has_permission(t,m,'invoice.read',NULL,l.student_id)
        AND educore_r4.has_permission(t,m,'receivable.read',NULL,l.student_id))
  ) authorized_screens;
  RETURN jsonb_build_object($insert$);
  EXECUTE ddl;
END $nav$;
COMMIT;
