BEGIN;
-- Public projections are restricted to the current R4 transaction principal.
CREATE FUNCTION educore_r4.schedule_mvp_read(t uuid, kind text, target uuid DEFAULT NULL,
  from_time timestamptz DEFAULT NULL, to_time timestamptz DEFAULT NULL,
  page_no int DEFAULT 1, page_size int DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; z text; items jsonb; total int; row_data jsonb;
BEGIN
  m:=educore_r3.principal(t);
  SELECT timezone INTO z FROM public.tenants WHERE id=t;
  IF page_no NOT BETWEEN 1 AND 100000 OR page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
  IF kind IN ('CALENDAR','PERSONAL') THEN
    IF from_time IS NULL OR to_time IS NULL OR to_time<=from_time OR to_time>from_time+interval '31 days'
      THEN RAISE EXCEPTION 'BOUNDED_CALENDAR_RANGE_REQUIRED' USING ERRCODE='22023'; END IF;
    SELECT count(*) INTO total FROM public.class_sessions cs WHERE cs.tenant_id=t
      AND cs.starts_at<to_time AND from_time<cs.ends_at AND
      ((kind='CALENDAR' AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,NULL)) OR EXISTS
       (SELECT FROM public.session_participants sp WHERE sp.tenant_id=t AND sp.session_id=cs.id
         AND sp.removed_at IS NULL AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,sp.student_id)
         AND (kind='CALENDAR' OR EXISTS(SELECT FROM public.student_profiles own WHERE own.tenant_id=t
           AND own.id=sp.student_id AND own.membership_id=m) OR EXISTS(SELECT FROM public.parent_student_links link
           WHERE link.tenant_id=t AND link.student_id=sp.student_id AND link.parent_membership_id=m
             AND link.verified_at IS NOT NULL AND link.revoked_at IS NULL)))
       OR (kind='PERSONAL' AND EXISTS(SELECT FROM public.teacher_profiles tp WHERE tp.tenant_id=t
         AND tp.id=cs.teacher_id AND tp.membership_id=m AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,NULL))));
    SELECT COALESCE(jsonb_agg(x ORDER BY x."startsAt",x.id),'[]'::jsonb) INTO items FROM (
      SELECT cs.id,cs.class_id AS "classId",c.name AS "className",cs.teacher_id AS "teacherId",
        tp.full_name AS "teacherName",cs.room_id AS "roomId",cs.delivery_mode AS "deliveryMode",
        cs.starts_at AS "startsAt",cs.ends_at AS "endsAt",cs.status,cs.revision,cs.series_id AS "seriesId"
      FROM public.class_sessions cs JOIN public.classes c ON c.tenant_id=t AND c.id=cs.class_id
      JOIN public.teacher_profiles tp ON tp.tenant_id=t AND tp.id=cs.teacher_id
      WHERE cs.tenant_id=t AND cs.starts_at<to_time AND from_time<cs.ends_at AND
      ((kind='CALENDAR' AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,NULL)) OR EXISTS
       (SELECT FROM public.session_participants sp WHERE sp.tenant_id=t AND sp.session_id=cs.id
        AND sp.removed_at IS NULL AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,sp.student_id)
        AND (kind='CALENDAR' OR EXISTS(SELECT FROM public.student_profiles own WHERE own.tenant_id=t
          AND own.id=sp.student_id AND own.membership_id=m) OR EXISTS(SELECT FROM public.parent_student_links link
          WHERE link.tenant_id=t AND link.student_id=sp.student_id AND link.parent_membership_id=m
            AND link.verified_at IS NOT NULL AND link.revoked_at IS NULL)))
       OR (kind='PERSONAL' AND EXISTS(SELECT FROM public.teacher_profiles self WHERE self.tenant_id=t
         AND self.id=cs.teacher_id AND self.membership_id=m AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,NULL))))
      ORDER BY cs.starts_at,cs.id LIMIT page_size OFFSET (page_no-1)*page_size) x;
    RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',page_size,'total',total,'asOf',clock_timestamp(),'timeZone',z);
  ELSIF kind='SESSION' THEN
    SELECT jsonb_build_object('id',cs.id,'classId',cs.class_id,'className',c.name,
      'teacherId',cs.teacher_id,'teacherName',tp.full_name,'roomId',cs.room_id,
      'deliveryMode',cs.delivery_mode,'startsAt',cs.starts_at,'endsAt',cs.ends_at,
      'status',cs.status,'revision',cs.revision,'seriesId',cs.series_id,'timeZone',z)
      INTO row_data FROM public.class_sessions cs
      JOIN public.classes c ON c.tenant_id=t AND c.id=cs.class_id
      JOIN public.teacher_profiles tp ON tp.tenant_id=t AND tp.id=cs.teacher_id
      WHERE cs.tenant_id=t AND cs.id=target AND
      (educore_r4.has_permission(t,m,'schedule.read',cs.class_id,NULL) OR EXISTS
       (SELECT FROM public.session_participants sp WHERE sp.tenant_id=t AND sp.session_id=cs.id
        AND sp.removed_at IS NULL AND educore_r4.has_permission(t,m,'schedule.read',cs.class_id,sp.student_id)));
    IF row_data IS NULL THEN RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    RETURN row_data;
  ELSIF kind='ROOMS' THEN
    IF NOT educore_r4.has_permission(t,m,'resource.read',NULL,NULL) THEN
      RAISE EXCEPTION 'TENANT_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
    SELECT count(*) INTO total FROM public.rooms WHERE tenant_id=t;
    SELECT COALESCE(jsonb_agg(x ORDER BY x.code,x.id),'[]'::jsonb) INTO items FROM (
      SELECT id,code,name,capacity,active,location FROM public.rooms WHERE tenant_id=t
      ORDER BY code,id LIMIT page_size OFFSET (page_no-1)*page_size) x;
  ELSIF kind='BUSY' THEN
    IF NOT educore_r4.has_permission(t,m,'resource.read',NULL,NULL) THEN
      RAISE EXCEPTION 'TENANT_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
    SELECT count(*) INTO total FROM public.resource_unavailability WHERE tenant_id=t;
    SELECT COALESCE(jsonb_agg(x ORDER BY x."startsAt",x.id),'[]'::jsonb) INTO items FROM (
      SELECT u.id,u.resource_id AS "resourceId",r.resource_kind AS "resourceKind",
        r.room_id AS "roomId",r.teacher_id AS "teacherId",r.student_id AS "studentId",
        u.starts_at AS "startsAt",u.ends_at AS "endsAt",u.status,u.reason
      FROM public.resource_unavailability u JOIN public.schedulable_resources r
        ON r.tenant_id=t AND r.id=u.resource_id WHERE u.tenant_id=t
      ORDER BY u.starts_at,u.id LIMIT page_size OFFSET (page_no-1)*page_size) x;
  ELSIF kind='RESOURCES' THEN
    IF NOT educore_r4.has_permission(t,m,'resource.read',NULL,NULL) THEN
      RAISE EXCEPTION 'TENANT_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
    SELECT count(*) INTO total FROM public.schedulable_resources WHERE tenant_id=t;
    SELECT COALESCE(jsonb_agg(x ORDER BY x.kind,x.name,x.id),'[]'::jsonb) INTO items FROM (
      SELECT r.id,r.resource_kind AS kind,COALESCE(room.name,teacher.full_name,student.full_name) AS name
      FROM public.schedulable_resources r
      LEFT JOIN public.rooms room ON room.tenant_id=t AND room.id=r.room_id
      LEFT JOIN public.teacher_profiles teacher ON teacher.tenant_id=t AND teacher.id=r.teacher_id
      LEFT JOIN public.student_profiles student ON student.tenant_id=t AND student.id=r.student_id
      WHERE r.tenant_id=t ORDER BY r.resource_kind,name,r.id LIMIT page_size OFFSET (page_no-1)*page_size) x;
  ELSIF kind='CHOICES' THEN
    IF NOT educore_r4.has_permission(t,m,'schedule.create',NULL,NULL) THEN
      RAISE EXCEPTION 'TENANT_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('timeZone',z,
      'classes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'capacity',c.capacity,
        'enrollmentCount',(SELECT count(*) FROM public.enrollments e WHERE e.tenant_id=t AND e.class_id=c.id
          AND e.status IN ('ACTIVE','TRANSFERRED','COMPLETED','WITHDRAWN') AND e.effective_from<=clock_timestamp()
          AND (e.effective_to IS NULL OR clock_timestamp()<e.effective_to))) ORDER BY c.name,c.id),'[]'::jsonb)
        FROM public.classes c WHERE c.tenant_id=t AND c.status IN ('ACTIVE','PLANNED')),
      'teachers',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',full_name) ORDER BY full_name,id),'[]'::jsonb)
        FROM public.teacher_profiles WHERE tenant_id=t AND status='ACTIVE'),
      'assignments',(SELECT COALESCE(jsonb_agg(jsonb_build_object('classId',a.class_id,'teacherId',a.teacher_id,
        'validFrom',a.valid_from,'validTo',a.valid_to) ORDER BY a.class_id,a.teacher_id,a.valid_from),'[]'::jsonb)
        FROM public.class_teacher_assignments a WHERE a.tenant_id=t),
      'rooms',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'capacity',capacity) ORDER BY name,id),'[]'::jsonb)
        FROM public.rooms WHERE tenant_id=t AND active),
      'resources',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.resource_kind,
        'name',COALESCE(room.name,teacher.full_name,student.full_name)) ORDER BY r.resource_kind,r.id),'[]'::jsonb)
        FROM public.schedulable_resources r
        LEFT JOIN public.rooms room ON room.tenant_id=t AND room.id=r.room_id
        LEFT JOIN public.teacher_profiles teacher ON teacher.tenant_id=t AND teacher.id=r.teacher_id
        LEFT JOIN public.student_profiles student ON student.tenant_id=t AND student.id=r.student_id
        WHERE r.tenant_id=t));
  ELSIF kind='CAPABILITIES' THEN
    RETURN jsonb_build_object('scheduleCreate',educore_r4.has_permission(t,m,'schedule.create',NULL,NULL),
      'scheduleConfirm',educore_r4.has_permission(t,m,'schedule.confirm',NULL,NULL),
      'scheduleUpdate',educore_r4.has_permission(t,m,'schedule.update',NULL,NULL),
      'scheduleCancel',educore_r4.has_permission(t,m,'schedule.cancel',NULL,NULL),
      'roomManage',educore_r4.has_permission(t,m,'room.manage',NULL,NULL),
      'resourceManage',educore_r4.has_permission(t,m,'resource.manage',NULL,NULL));
  ELSE RAISE EXCEPTION 'UNSUPPORTED_READ' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',page_size,'total',total,'asOf',clock_timestamp(),'timeZone',z);
END $$;

CREATE FUNCTION educore_r4.attendance_mvp_read(t uuid, kind text, target uuid DEFAULT NULL,
  from_time timestamptz DEFAULT NULL, to_time timestamptz DEFAULT NULL,
  page_no int DEFAULT 1, page_size int DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; z text; items jsonb; total int; cs public.class_sessions%ROWTYPE;
BEGIN
  m:=educore_r3.principal(t);
  SELECT timezone INTO z FROM public.tenants WHERE id=t;
  IF page_no NOT BETWEEN 1 AND 100000 OR page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
  IF kind='DUE' THEN
    IF from_time IS NULL OR to_time IS NULL OR to_time<=from_time OR to_time>from_time+interval '31 days'
      THEN RAISE EXCEPTION 'BOUNDED_ATTENDANCE_RANGE_REQUIRED' USING ERRCODE='22023'; END IF;
    SELECT count(*) INTO total FROM public.class_sessions s WHERE s.tenant_id=t AND s.starts_at<to_time
      AND from_time<s.ends_at AND s.status IN ('CONFIRMED','COMPLETED')
      AND educore_r4.has_permission(t,m,'attendance.read',s.class_id,NULL);
    SELECT COALESCE(jsonb_agg(x ORDER BY x."startsAt",x.id),'[]'::jsonb) INTO items FROM (
      SELECT s.id,s.class_id AS "classId",c.name AS "className",s.starts_at AS "startsAt",
        s.ends_at AS "endsAt",tp.full_name AS "teacherName",s.status,
        (SELECT count(*) FROM public.session_participants sp WHERE sp.tenant_id=t AND sp.session_id=s.id AND sp.removed_at IS NULL) AS "expectedCount",
        (f.id IS NOT NULL) AS finalized
      FROM public.class_sessions s JOIN public.classes c ON c.tenant_id=t AND c.id=s.class_id
      JOIN public.teacher_profiles tp ON tp.tenant_id=t AND tp.id=s.teacher_id
      LEFT JOIN public.attendance_finalizations f ON f.tenant_id=t AND f.session_id=s.id
      WHERE s.tenant_id=t AND s.starts_at<to_time AND from_time<s.ends_at
        AND s.status IN ('CONFIRMED','COMPLETED')
        AND educore_r4.has_permission(t,m,'attendance.read',s.class_id,NULL)
      ORDER BY s.starts_at,s.id LIMIT page_size OFFSET (page_no-1)*page_size) x;
    RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',page_size,'total',total,'asOf',clock_timestamp(),'timeZone',z);
  ELSIF kind='SHEET' THEN
    SELECT * INTO cs FROM public.class_sessions WHERE tenant_id=t AND id=target;
    IF cs.id IS NULL OR NOT (educore_r4.has_permission(t,m,'attendance.mark',cs.class_id,NULL)
      OR educore_r4.has_permission(t,m,'attendance.finalize',cs.class_id,NULL)) THEN
      RAISE EXCEPTION 'ATTENDANCE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('sessionId',cs.id,'classId',cs.class_id,'startsAt',cs.starts_at,
      'endsAt',cs.ends_at,'status',cs.status,'timeZone',z,
      'finalized',EXISTS(SELECT FROM public.attendance_finalizations f WHERE f.tenant_id=t AND f.session_id=cs.id),
      'participants',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'studentId',p.student_id,
        'name',s.full_name,'enrollmentId',p.enrollment_id,'attendanceId',a.id,'status',a.attendance_status,
        'revision',COALESCE(a.revision,0),'approvedLeave',EXISTS(SELECT FROM public.absence_requests l
          WHERE l.tenant_id=t AND l.participant_id=p.id AND l.status='APPROVED'),
        'billingSourceLocked',EXISTS(SELECT FROM public.invoice_lines line WHERE line.tenant_id=t AND line.participant_id=p.id),
        'invoiceIssued',EXISTS(SELECT FROM public.invoice_lines line JOIN public.invoices invoice
          ON invoice.tenant_id=t AND invoice.id=line.invoice_id
          WHERE line.tenant_id=t AND line.participant_id=p.id AND invoice.status='ISSUED')) ORDER BY s.full_name,p.id),'[]'::jsonb)
        FROM public.session_participants p JOIN public.student_profiles s ON s.tenant_id=t AND s.id=p.student_id
        LEFT JOIN public.attendance_records a ON a.tenant_id=t AND a.participant_id=p.id
        WHERE p.tenant_id=t AND p.session_id=cs.id AND p.removed_at IS NULL));
  ELSIF kind='LEAVES' THEN
    SELECT count(*) INTO total FROM public.absence_requests l
      JOIN public.session_participants p ON p.tenant_id=t AND p.id=l.participant_id
      JOIN public.class_sessions s ON s.tenant_id=t AND s.id=p.session_id
      WHERE l.tenant_id=t AND educore_r4.has_permission(t,m,'absence.read',s.class_id,p.student_id);
    SELECT COALESCE(jsonb_agg(x ORDER BY x."submittedAt" DESC,x.id),'[]'::jsonb) INTO items FROM (
      SELECT l.id,l.participant_id AS "participantId",p.student_id AS "studentId",p.session_id AS "sessionId",
        l.reason,l.submitted_at AS "submittedAt",l.is_late_notice AS "late",l.status,
        l.decision_reason AS "decisionReason",
        educore_r4.has_permission(t,m,'absence.approve',s.class_id,p.student_id) AS "canDecide",
        educore_r4.has_permission(t,m,'absence.approve_late',s.class_id,p.student_id) AS "canApproveLate"
      FROM public.absence_requests l JOIN public.session_participants p ON p.tenant_id=t AND p.id=l.participant_id
      JOIN public.class_sessions s ON s.tenant_id=t AND s.id=p.session_id
      WHERE l.tenant_id=t AND educore_r4.has_permission(t,m,'absence.read',s.class_id,p.student_id)
      ORDER BY l.submitted_at DESC,l.id LIMIT page_size OFFSET (page_no-1)*page_size) x;
    RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',page_size,'total',total,'asOf',clock_timestamp(),'timeZone',z);
  ELSIF kind='MY_PARTICIPANTS' THEN
    SELECT count(*) INTO total FROM public.session_participants p
      JOIN public.class_sessions s ON s.tenant_id=t AND s.id=p.session_id
      WHERE p.tenant_id=t AND p.removed_at IS NULL AND s.status='CONFIRMED' AND s.starts_at>clock_timestamp()
        AND educore_r4.has_permission(t,m,'absence.create',s.class_id,p.student_id)
        AND (EXISTS(SELECT FROM public.student_profiles own WHERE own.tenant_id=t AND own.id=p.student_id AND own.membership_id=m)
          OR EXISTS(SELECT FROM public.parent_student_links link WHERE link.tenant_id=t AND link.student_id=p.student_id
            AND link.parent_membership_id=m AND link.verified_at IS NOT NULL AND link.revoked_at IS NULL));
    SELECT COALESCE(jsonb_agg(x ORDER BY x."startsAt",x.id),'[]'::jsonb) INTO items FROM (
      SELECT p.id,p.student_id AS "studentId",sp.full_name AS "studentName",p.session_id AS "sessionId",
        s.starts_at AS "startsAt",c.name AS "className",
        (clock_timestamp()>s.starts_at-interval '24 hours') AS "lateNotice"
      FROM public.session_participants p JOIN public.class_sessions s ON s.tenant_id=t AND s.id=p.session_id
      JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=p.student_id
      JOIN public.classes c ON c.tenant_id=t AND c.id=s.class_id
      WHERE p.tenant_id=t AND p.removed_at IS NULL AND s.status='CONFIRMED' AND s.starts_at>clock_timestamp()
        AND educore_r4.has_permission(t,m,'absence.create',s.class_id,p.student_id)
        AND (EXISTS(SELECT FROM public.student_profiles own WHERE own.tenant_id=t AND own.id=p.student_id AND own.membership_id=m)
          OR EXISTS(SELECT FROM public.parent_student_links link WHERE link.tenant_id=t AND link.student_id=p.student_id
            AND link.parent_membership_id=m AND link.verified_at IS NOT NULL AND link.revoked_at IS NULL))
      ORDER BY s.starts_at,p.id LIMIT page_size OFFSET (page_no-1)*page_size) x;
    RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',page_size,'total',total,'asOf',clock_timestamp(),'timeZone',z);
  END IF;
  RAISE EXCEPTION 'UNSUPPORTED_READ' USING ERRCODE='22023';
END $$;

CREATE FUNCTION educore_r4.schedule_mvp_preview(t uuid, draft_id uuid, is_series boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; c uuid; s public.class_sessions%ROWTYPE; conflict record; issues jsonb:='[]'::jsonb; ids jsonb:='[]'::jsonb;
  people int;
BEGIN
  m:=educore_r3.principal(t);
  IF is_series THEN SELECT class_id INTO c FROM public.schedule_series WHERE tenant_id=t AND id=draft_id;
  ELSE SELECT class_id INTO c FROM public.class_sessions WHERE tenant_id=t AND id=draft_id; END IF;
  IF c IS NULL THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT educore_r4.has_permission(t,m,'schedule.preview',c,NULL) THEN
    RAISE EXCEPTION 'SCHEDULE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  FOR s IN SELECT * FROM public.class_sessions WHERE tenant_id=t
    AND CASE WHEN is_series THEN series_id=draft_id ELSE id=draft_id END ORDER BY starts_at,id LOOP
    ids:=ids||to_jsonb(s.id);
    IF s.status<>'DRAFT' OR s.starts_at<=clock_timestamp() THEN
      issues:=issues||jsonb_build_object('sessionId',s.id,'kind','DRAFT_FUTURE_REQUIRED'); END IF;
    IF NOT EXISTS(SELECT FROM public.class_teacher_assignments a JOIN public.teacher_profiles tp
      ON tp.tenant_id=t AND tp.id=a.teacher_id AND tp.status='ACTIVE'
      WHERE a.tenant_id=t AND a.class_id=s.class_id AND a.teacher_id=s.teacher_id
        AND a.valid_from<=s.starts_at AND (a.valid_to IS NULL OR s.ends_at<=a.valid_to)) THEN
      issues:=issues||jsonb_build_object('sessionId',s.id,'kind','TEACHER_ASSIGNMENT'); END IF;
    SELECT count(*) INTO people FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=s.id AND p.removed_at IS NULL;
    IF people>(SELECT capacity FROM public.classes WHERE tenant_id=t AND id=s.class_id) THEN
      issues:=issues||jsonb_build_object('sessionId',s.id,'kind','CLASS_CAPACITY'); END IF;
    IF s.room_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.rooms room WHERE room.tenant_id=t AND room.id=s.room_id
      AND room.active AND room.capacity>=people) THEN
      issues:=issues||jsonb_build_object('sessionId',s.id,'kind','ROOM_CAPACITY'); END IF;
    FOR conflict IN SELECT DISTINCT r.resource_kind AS kind FROM public.resource_bookings b
      JOIN public.schedulable_resources r ON r.tenant_id=t AND r.id=b.resource_id
      WHERE b.tenant_id=t AND b.status='ACTIVE' AND b.starts_at<s.ends_at AND s.starts_at<b.ends_at
        AND ((r.resource_kind='TEACHER' AND r.teacher_id=s.teacher_id)
          OR (r.resource_kind='ROOM' AND s.room_id IS NOT NULL AND r.room_id=s.room_id)
          OR (r.resource_kind='STUDENT' AND EXISTS(SELECT FROM public.session_participants p
            WHERE p.tenant_id=t AND p.session_id=s.id AND p.student_id=r.student_id AND p.removed_at IS NULL))) LOOP
      issues:=issues||jsonb_build_object('sessionId',s.id,'kind',conflict.kind||'_BUSY');
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ready',jsonb_array_length(issues)=0,'sessionIds',ids,'conflicts',issues,
    'asOf',clock_timestamp(),'reserved',false);
END $$;

CREATE FUNCTION educore_r4.leave_self_guard(t uuid, participant uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid;
BEGIN
  m:=educore_r3.principal(t);
  IF NOT EXISTS(SELECT FROM public.session_participants p WHERE p.tenant_id=t AND p.id=participant
    AND p.removed_at IS NULL AND (EXISTS(SELECT FROM public.student_profiles s WHERE s.tenant_id=t
      AND s.id=p.student_id AND s.membership_id=m) OR EXISTS(SELECT FROM public.parent_student_links l
      WHERE l.tenant_id=t AND l.student_id=p.student_id AND l.parent_membership_id=m
        AND l.verified_at IS NOT NULL AND l.revoked_at IS NULL))) THEN
    RAISE EXCEPTION 'SELF_OR_VERIFIED_CHILD_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;

-- Correct two legacy command gaps without exposing a generic SQL command endpoint.
DO $fix$ DECLARE ddl text; BEGIN
  ddl:=pg_get_functiondef('educore_r3.attendance(uuid,jsonb)'::regprocedure);
  IF position('IF EXISTS(SELECT FROM public.invoiced_participation_claims WHERE tenant_id=t AND participant_id=p.id)' IN ddl)=0
    OR position('IF op=''MARK'' THEN SELECT * INTO ar FROM public.attendance_records' IN ddl)=0 THEN
    RAISE EXCEPTION 'ATTENDANCE_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
  ddl:=replace(ddl,
    'IF EXISTS(SELECT FROM public.invoiced_participation_claims WHERE tenant_id=t AND participant_id=p.id)',
    'IF EXISTS(SELECT FROM public.invoiced_participation_claims claim JOIN public.absence_requests source ON source.tenant_id=t AND source.id=(body->>''absenceId'')::uuid WHERE claim.tenant_id=t AND claim.participant_id=source.participant_id)');
  -- The direct condition also catches repeat MARK after finalization.
  ddl:=replace(ddl,'IF op=''MARK'' THEN SELECT * INTO ar FROM public.attendance_records',
    'IF op=''MARK'' AND af.id IS NOT NULL THEN RAISE EXCEPTION ''ALREADY_FINALIZED'' USING ERRCODE=''23514''; END IF; IF op=''CORRECT'' AND length(btrim(COALESCE(body->>''reason'','''')))=0 THEN RAISE EXCEPTION ''CORRECTION_REASON_REQUIRED'' USING ERRCODE=''22023''; END IF; IF op=''MARK'' THEN SELECT * INTO ar FROM public.attendance_records');
  EXECUTE ddl;
END $fix$;
ALTER FUNCTION educore_r4.schedule_mvp_read(uuid,text,uuid,timestamptz,timestamptz,int,int) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.attendance_mvp_read(uuid,text,uuid,timestamptz,timestamptz,int,int) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.leave_self_guard(uuid,uuid) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.schedule_mvp_preview(uuid,uuid,boolean) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.schedule_mvp_read(uuid,text,uuid,timestamptz,timestamptz,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.attendance_mvp_read(uuid,text,uuid,timestamptz,timestamptz,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.leave_self_guard(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.schedule_mvp_preview(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.schedule_mvp_read(uuid,text,uuid,timestamptz,timestamptz,int,int) TO educore_r4_api;
GRANT EXECUTE ON FUNCTION educore_r4.attendance_mvp_read(uuid,text,uuid,timestamptz,timestamptz,int,int) TO educore_r4_api;
GRANT EXECUTE ON FUNCTION educore_r4.leave_self_guard(uuid,uuid) TO educore_r4_api;
GRANT EXECUTE ON FUNCTION educore_r4.schedule_mvp_preview(uuid,uuid,boolean) TO educore_r4_api;
COMMIT;
