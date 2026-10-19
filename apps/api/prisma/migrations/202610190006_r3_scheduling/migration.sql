BEGIN;
-- Populated adoption must inspect/reconcile existing bookings/assignments;
-- never fabricate historical reservations to satisfy this migration.
DO $$ BEGIN IF EXISTS(SELECT FROM public.class_sessions WHERE status='CONFIRMED') OR EXISTS(SELECT FROM public.resource_bookings)
 THEN RAISE EXCEPTION 'R3_POPULATED_BOOKING_ADOPTION_REQUIRES_REVIEW' USING ERRCODE='23514'; END IF; END $$;
GRANT SELECT,INSERT,UPDATE ON public.rooms,public.schedulable_resources,public.resource_unavailability,
 public.schedule_series,public.class_sessions,public.session_participants,public.resource_bookings TO educore_r3_owner;
GRANT UPDATE ON public.classes TO educore_r3_owner;
GRANT INSERT ON public.outbox_events TO educore_r3_owner;
GRANT SELECT ON public.grades,public.submission_versions,public.submissions,public.assignment_recipients,public.assignments TO educore_r3_owner;

CREATE FUNCTION educore_r3.placement_context(t uuid,student uuid,c uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE course public.courses%ROWTYPE; scores jsonb;
BEGIN
 BEGIN PERFORM educore_r3.authorize(t,c,student,'enrollment.create');
 EXCEPTION WHEN insufficient_privilege THEN PERFORM educore_r3.authorize(t,c,student,'enrollment.transfer'); END;
 SELECT co.* INTO STRICT course FROM public.courses co JOIN public.classes cl ON cl.tenant_id=t AND cl.course_id=co.id WHERE co.tenant_id=t AND cl.id=c;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('gradeId',g.id,'score',g.score::text,'subjectId',co.subject_id,'assessmentLevelId',co.level_id,
  'gradedAt',g.graded_at,'publishedAt',g.published_at,'submissionVersionId',g.submission_version_id,'revision',g.revision_no) ORDER BY g.published_at DESC,g.id),'[]') INTO scores
 FROM public.grades g JOIN public.submission_versions v ON v.tenant_id=t AND v.id=g.submission_version_id
 JOIN public.submissions sub ON sub.tenant_id=t AND sub.id=v.submission_id JOIN public.assignment_recipients ar ON ar.tenant_id=t AND ar.id=sub.recipient_id
 JOIN public.assignments a ON a.tenant_id=t AND a.id=ar.assignment_id JOIN public.classes cl ON cl.tenant_id=t AND cl.id=a.class_id
 JOIN public.courses co ON co.tenant_id=t AND co.id=cl.course_id WHERE g.tenant_id=t AND ar.student_id=student AND co.subject_id=course.subject_id AND g.status='PUBLISHED' AND g.published_at IS NOT NULL
 AND NOT EXISTS(SELECT FROM public.grades newer WHERE newer.tenant_id=t AND newer.submission_version_id=g.submission_version_id AND newer.status='PUBLISHED' AND newer.published_at IS NOT NULL AND newer.revision_no>g.revision_no);
 RETURN jsonb_build_object('targetSubjectId',course.subject_id,'targetLevelId',course.level_id,'publishedAssessments',scores,
  'state',CASE WHEN jsonb_array_length(scores)=0 THEN 'FALLBACK_AVAILABLE' ELSE 'REQUIRES_GRADE_EVALUATION_POLICY' END);
END $$;

-- Owner's R3 placement amendment: no StudentProfile level column, certificate
-- requirement or universal score threshold. The fallback is explicit audited
-- staff/entry-test evidence matching the target subject and difficulty.
-- Published subject grades are routed to a future reviewed evaluation adapter,
-- rather than quietly ignored or converted with invented numeric cutoffs.
CREATE FUNCTION educore_r3.placement(t uuid,s uuid,c uuid,evidence jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE course public.courses%ROWTYPE;
BEGIN
 SELECT co.* INTO STRICT course FROM public.courses co JOIN public.classes cl ON cl.tenant_id=t AND cl.course_id=co.id WHERE co.tenant_id=t AND cl.id=c;
 IF evidence->>'basis' IS NULL OR evidence->>'basis' NOT IN ('STAFF_CONFIRMATION','ENTRY_TEST') OR COALESCE(length(btrim(evidence->>'reason')),0)=0
  OR (evidence->>'subjectId')::uuid IS DISTINCT FROM course.subject_id OR (evidence->>'levelId')::uuid IS DISTINCT FROM course.level_id
 THEN RAISE EXCEPTION 'PLACEMENT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.grades g JOIN public.submission_versions v ON v.tenant_id=t AND v.id=g.submission_version_id
  JOIN public.submissions sub ON sub.tenant_id=t AND sub.id=v.submission_id JOIN public.assignment_recipients ar ON ar.tenant_id=t AND ar.id=sub.recipient_id
  JOIN public.assignments a ON a.tenant_id=t AND a.id=ar.assignment_id JOIN public.classes cl ON cl.tenant_id=t AND cl.id=a.class_id
  JOIN public.courses co ON co.tenant_id=t AND co.id=cl.course_id WHERE g.tenant_id=t AND ar.student_id=s AND co.subject_id=course.subject_id AND g.status='PUBLISHED' AND g.published_at IS NOT NULL)
 THEN RAISE EXCEPTION 'GRADE_SUITABILITY_ADAPTER_REQUIRES_REVIEWED_POLICY' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION educore_r3.principal(t uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE u uuid; m uuid;
BEGIN
 SELECT a.user_id INTO u FROM public.r2_principal_bindings b JOIN public.auth_sessions a ON a.id=b.auth_session_id WHERE b.database_role=session_user;
 IF u IS NULL THEN RAISE EXCEPTION 'UNVERIFIED_DATABASE_PRINCIPAL' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.users WHERE id=u FOR SHARE;
 PERFORM educore_private.r1b_lock_tenant(t);
 SELECT tm.id INTO m FROM public.r2_principal_bindings b JOIN public.auth_sessions a ON a.id=b.auth_session_id
 JOIN public.users us ON us.id=a.user_id AND us.status='ACTIVE'
 JOIN public.tenant_memberships tm ON tm.tenant_id=t AND tm.user_id=a.user_id AND tm.status='ACTIVE' AND tm.left_at IS NULL
 JOIN public.tenants tn ON tn.id=t AND tn.status='ACTIVE'
 WHERE b.database_role=session_user AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND a.active_tenant_id=t;
 IF m IS NULL THEN RAISE EXCEPTION 'SESSION_NOT_CURRENT' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;

-- B01-B05: exact registry/source shape, one active reservation and real GiST
-- concurrency protection; RELEASED never blocks adjacent or later bookings.
ALTER TABLE public.rooms ADD CONSTRAINT r3_room_capacity CHECK(capacity>0);
ALTER TABLE public.schedulable_resources ADD CONSTRAINT r3_resource_shape CHECK
 ((resource_kind='TEACHER' AND teacher_id IS NOT NULL AND student_id IS NULL AND room_id IS NULL)
 OR (resource_kind='STUDENT' AND student_id IS NOT NULL AND teacher_id IS NULL AND room_id IS NULL)
 OR (resource_kind='ROOM' AND room_id IS NOT NULL AND teacher_id IS NULL AND student_id IS NULL));
ALTER TABLE public.resource_bookings ADD CONSTRAINT r3_booking_shape CHECK(ends_at>starts_at AND num_nonnulls(session_id,unavailability_id)=1);
ALTER TABLE public.resource_unavailability ADD CONSTRAINT r3_busy_interval CHECK(ends_at>starts_at);
ALTER TABLE public.class_sessions ADD CONSTRAINT r3_session_shape CHECK(ends_at>starts_at AND revision>0 AND (delivery_mode<>'ONSITE' OR room_id IS NOT NULL));
ALTER TABLE public.schedule_series ADD CONSTRAINT r3_series_shape CHECK(weekday BETWEEN 1 AND 7 AND duration_minutes>0 AND valid_to>=valid_from AND valid_to<=(valid_from+interval '6 months')::date);
ALTER TABLE public.resource_bookings ADD CONSTRAINT r3_booking_overlap EXCLUDE USING gist
 (tenant_id WITH =,resource_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='ACTIVE');
CREATE UNIQUE INDEX r3_one_session_booking ON public.resource_bookings(tenant_id,session_id,resource_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX r3_one_busy_booking ON public.resource_bookings(tenant_id,unavailability_id,resource_id) WHERE status='ACTIVE';

CREATE FUNCTION educore_r3.resource(t uuid,kind public."ResourceKind",source uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE result uuid;
BEGIN
 SELECT id INTO result FROM public.schedulable_resources WHERE tenant_id=t AND resource_kind=kind AND
 CASE kind WHEN 'TEACHER' THEN teacher_id=source WHEN 'STUDENT' THEN student_id=source ELSE room_id=source END;
 IF result IS NULL THEN
  INSERT INTO public.schedulable_resources(id,tenant_id,resource_kind,teacher_id,student_id,room_id,updated_at)
  VALUES(gen_random_uuid(),t,kind,CASE WHEN kind='TEACHER' THEN source END,CASE WHEN kind='STUDENT' THEN source END,CASE WHEN kind='ROOM' THEN source END,clock_timestamp()) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION educore_r3.roster(t uuid,s uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE cs public.class_sessions%ROWTYPE; enrolled record;
BEGIN
 SELECT * INTO STRICT cs FROM public.class_sessions WHERE tenant_id=t AND id=s;
 -- R1b rejects removal when attendance, draft lines or claims have sealed it.
 UPDATE public.session_participants p SET removed_at=clock_timestamp(),updated_at=clock_timestamp()
 WHERE p.tenant_id=t AND p.session_id=s AND p.removed_at IS NULL AND NOT EXISTS
 (SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.id=p.enrollment_id AND e.class_id=cs.class_id
 AND e.status IN ('ACTIVE','TRANSFERRED','COMPLETED','WITHDRAWN') AND e.effective_from<=cs.starts_at AND (e.effective_to IS NULL OR cs.starts_at<e.effective_to));
 FOR enrolled IN SELECT * FROM public.enrollments WHERE tenant_id=t AND class_id=cs.class_id AND status IN ('ACTIVE','TRANSFERRED','COMPLETED','WITHDRAWN')
 AND effective_from<=cs.starts_at AND (effective_to IS NULL OR cs.starts_at<effective_to) ORDER BY student_id LOOP
  INSERT INTO public.session_participants(id,tenant_id,session_id,student_id,enrollment_id,participant_kind,updated_at)
  VALUES(gen_random_uuid(),t,s,enrolled.student_id,enrolled.id,'REGULAR',clock_timestamp())
  ON CONFLICT(tenant_id,session_id,student_id) DO UPDATE SET enrollment_id=EXCLUDED.enrollment_id,removed_at=NULL,updated_at=clock_timestamp()
  WHERE public.session_participants.removed_at IS NOT NULL;
 END LOOP;
END $$;

CREATE FUNCTION educore_r3.book(t uuid,s uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE cs public.class_sessions%ROWTYPE; r record; resources uuid[];
BEGIN
 SELECT * INTO STRICT cs FROM public.class_sessions WHERE tenant_id=t AND id=s;
 IF NOT EXISTS(SELECT FROM public.teacher_profiles WHERE tenant_id=t AND id=cs.teacher_id AND status='ACTIVE')
 OR NOT EXISTS(SELECT FROM public.class_teacher_assignments WHERE tenant_id=t AND class_id=cs.class_id AND teacher_id=cs.teacher_id
  AND valid_from<=cs.starts_at AND (valid_to IS NULL OR cs.ends_at<=valid_to)) THEN RAISE EXCEPTION 'VALID_TEACHER_ASSIGNMENT_REQUIRED' USING ERRCODE='23514'; END IF;
 resources:=ARRAY[educore_r3.resource(t,'TEACHER',cs.teacher_id)];
 IF cs.room_id IS NOT NULL THEN resources:=array_append(resources,educore_r3.resource(t,'ROOM',cs.room_id)); END IF;
 FOR r IN SELECT student_id FROM public.session_participants WHERE tenant_id=t AND session_id=s AND removed_at IS NULL ORDER BY student_id LOOP
  resources:=array_append(resources,educore_r3.resource(t,'STUDENT',r.student_id));
 END LOOP;
 -- Tenant is already held; resource rows have a stable order below it.
 PERFORM 1 FROM public.schedulable_resources WHERE tenant_id=t AND id=ANY(resources) ORDER BY id FOR UPDATE;
 UPDATE public.resource_bookings SET status='RELEASED',updated_at=clock_timestamp() WHERE tenant_id=t AND session_id=s AND status='ACTIVE';
 INSERT INTO public.resource_bookings(id,tenant_id,resource_id,session_id,starts_at,ends_at,status,updated_at)
 SELECT gen_random_uuid(),t,id,s,cs.starts_at,cs.ends_at,'ACTIVE',clock_timestamp() FROM unnest(resources) id;
END $$;

-- B06: deferred completeness checks see the final atomic session/roster/booking
-- state. Wrong resource/time/source and orphan ACTIVE rows cannot commit.
CREATE FUNCTION educore_r3.assert_bookings(t uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
BEGIN
 -- Only confirmed sessions are governed by live reservation completeness;
 -- legacy completed evidence stays under immutable R1b/R2 source guards.
 IF EXISTS(SELECT FROM public.class_sessions s WHERE s.tenant_id=t AND s.status='CONFIRMED' AND
 (NOT EXISTS(SELECT FROM public.teacher_profiles tp WHERE tp.tenant_id=t AND tp.id=s.teacher_id AND tp.status='ACTIVE')
 OR NOT EXISTS(SELECT FROM public.class_teacher_assignments ca WHERE ca.tenant_id=t AND ca.class_id=s.class_id AND ca.teacher_id=s.teacher_id
  AND ca.valid_from<=s.starts_at AND (ca.valid_to IS NULL OR s.ends_at<=ca.valid_to))
 OR EXISTS(SELECT FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=s.id AND p.removed_at IS NULL AND
  (p.participant_kind<>'REGULAR' OR NOT EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.id=p.enrollment_id AND e.student_id=p.student_id
   AND e.class_id=s.class_id AND e.status IN ('ACTIVE','TRANSFERRED','COMPLETED','WITHDRAWN') AND e.effective_from<=s.starts_at AND (e.effective_to IS NULL OR s.starts_at<e.effective_to))))
 OR EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.class_id=s.class_id AND e.status IN ('ACTIVE','TRANSFERRED','COMPLETED','WITHDRAWN')
  AND e.effective_from<=s.starts_at AND (e.effective_to IS NULL OR s.starts_at<e.effective_to) AND NOT EXISTS
   (SELECT FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=s.id AND p.enrollment_id=e.id AND p.removed_at IS NULL))))
 THEN RAISE EXCEPTION 'CONFIRMED_ROSTER_OR_ASSIGNMENT_INVALID' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.resource_bookings b JOIN public.schedulable_resources r ON r.tenant_id=t AND r.id=b.resource_id
 LEFT JOIN public.class_sessions s ON s.tenant_id=t AND s.id=b.session_id
 LEFT JOIN public.resource_unavailability u ON u.tenant_id=t AND u.id=b.unavailability_id
 WHERE b.tenant_id=t AND b.status='ACTIVE' AND
 ((b.session_id IS NOT NULL AND s.status IN ('CONFIRMED','COMPLETED') AND b.starts_at=s.starts_at AND b.ends_at=s.ends_at
 AND ((r.resource_kind='TEACHER' AND r.teacher_id=s.teacher_id) OR (r.resource_kind='ROOM' AND r.room_id=s.room_id)
 OR (r.resource_kind='STUDENT' AND EXISTS(SELECT FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=s.id AND p.student_id=r.student_id AND p.removed_at IS NULL))))
 OR (b.unavailability_id IS NOT NULL AND u.status='CONFIRMED' AND u.resource_id=b.resource_id AND b.starts_at=u.starts_at AND b.ends_at=u.ends_at)) IS NOT TRUE)
 THEN RAISE EXCEPTION 'BOOKING_SOURCE_MISMATCH' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.class_sessions s JOIN public.classes c ON c.tenant_id=t AND c.id=s.class_id LEFT JOIN public.rooms room ON room.tenant_id=t AND room.id=s.room_id
 WHERE s.tenant_id=t AND s.status='CONFIRMED' AND
 ((SELECT count(*) FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=s.id AND p.removed_at IS NULL)>c.capacity
 OR (s.room_id IS NOT NULL AND (NOT room.active OR (SELECT count(*) FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=s.id AND p.removed_at IS NULL)>room.capacity))
 OR NOT EXISTS(SELECT FROM public.resource_bookings b JOIN public.schedulable_resources r ON r.tenant_id=t AND r.id=b.resource_id
  WHERE b.tenant_id=t AND b.session_id=s.id AND b.status='ACTIVE' AND r.teacher_id=s.teacher_id)
 OR (s.room_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.resource_bookings b JOIN public.schedulable_resources r ON r.tenant_id=t AND r.id=b.resource_id
  WHERE b.tenant_id=t AND b.session_id=s.id AND b.status='ACTIVE' AND r.room_id=s.room_id))
 OR EXISTS(SELECT FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=s.id AND p.removed_at IS NULL AND NOT EXISTS
  (SELECT FROM public.resource_bookings b JOIN public.schedulable_resources r ON r.tenant_id=t AND r.id=b.resource_id WHERE b.tenant_id=t AND b.session_id=s.id AND b.status='ACTIVE' AND r.student_id=p.student_id))))
 THEN RAISE EXCEPTION 'SESSION_BOOKING_INCOMPLETE_OR_CAPACITY' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.resource_unavailability u WHERE u.tenant_id=t AND u.status='CONFIRMED' AND NOT EXISTS
  (SELECT FROM public.resource_bookings b WHERE b.tenant_id=t AND b.unavailability_id=u.id AND b.resource_id=u.resource_id AND b.status='ACTIVE'))
 THEN RAISE EXCEPTION 'UNAVAILABILITY_BOOKING_INCOMPLETE' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION educore_r3.booking_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
BEGIN PERFORM educore_r3.assert_bookings(CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END); RETURN NULL; END $$;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['rooms','class_sessions','session_participants','resource_bookings','resource_unavailability','schedulable_resources','classes','class_teacher_assignments','teacher_profiles','enrollments'] LOOP
  EXECUTE format('CREATE TRIGGER r3_booking_gate BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION educore_r3.academic_guard()',tbl);
  EXECUTE format('CREATE CONSTRAINT TRIGGER r3_booking_integrity AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r3.booking_guard()',tbl);
 END LOOP;
END $$;

-- B07: reject DST gaps and overlaps rather than silently choose another time.
CREATE FUNCTION educore_r3.local_instant(local_time timestamp,z text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE candidate timestamptz:=local_time AT TIME ZONE z;
BEGIN
 IF candidate AT TIME ZONE z<>local_time THEN RAISE EXCEPTION 'NONEXISTENT_LOCAL_TIME' USING ERRCODE='22007'; END IF;
 IF EXISTS(SELECT FROM generate_series(-86400,86400,60) delta WHERE delta<>0 AND (candidate+delta*interval '1 second') AT TIME ZONE z=local_time)
 THEN RAISE EXCEPTION 'AMBIGUOUS_LOCAL_TIME' USING ERRCODE='22007'; END IF;
 RETURN candidate;
END $$;

CREATE FUNCTION educore_r3.scheduling(t uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE op text:=body->>'operation'; c uuid:=(body->>'classId')::uuid; m uuid; result jsonb; prior jsonb; target uuid:=gen_random_uuid(); policy uuid;
 cs public.class_sessions%ROWTYPE; series public.schedule_series%ROWTYPE; busy public.resource_unavailability%ROWTYPE;
 r record; z text; day date; stamp timestamptz; finish timestamptz; ids jsonb:='[]'; mode public."DeliveryMode"; correlation uuid:=gen_random_uuid();
BEGIN
 PERFORM educore_r3.principal(t);
 IF op IN ('CONFIRM','RESCHEDULE','CANCEL') THEN SELECT * INTO cs FROM public.class_sessions WHERE tenant_id=t AND id=(body->>'sessionId')::uuid; c:=cs.class_id;
 ELSIF op='CONFIRM_SERIES' THEN SELECT * INTO series FROM public.schedule_series WHERE tenant_id=t AND id=(body->>'seriesId')::uuid; c:=series.class_id; END IF;
 m:=educore_r3.authorize(t,c,NULL,CASE WHEN op IN ('CREATE','CREATE_SERIES') THEN 'schedule.create' WHEN op IN ('CONFIRM','CONFIRM_SERIES') THEN 'schedule.confirm'
 WHEN op='RESCHEDULE' THEN 'schedule.update' WHEN op='CANCEL' THEN 'schedule.cancel' WHEN op='ROOM' THEN 'room.manage'
 WHEN op='CLASS_CAPACITY' THEN 'class.update' WHEN op IN ('BUSY_CREATE','BUSY_CONFIRM','BUSY_CANCEL') THEN 'resource.manage' ELSE '__DENY__' END);
 prior:=educore_r3.replay(t,body); IF prior IS NOT NULL THEN RETURN prior; END IF;
 -- Re-read target after the authorization wait; never use a stale pre-gate row.
 IF cs.id IS NOT NULL THEN SELECT * INTO cs FROM public.class_sessions WHERE tenant_id=t AND id=cs.id FOR UPDATE; END IF;
 IF series.id IS NOT NULL THEN SELECT * INTO series FROM public.schedule_series WHERE tenant_id=t AND id=series.id FOR UPDATE; END IF;
 SELECT timezone INTO z FROM public.tenants WHERE id=t;
 SELECT id INTO policy FROM public.policy_versions WHERE tenant_id=t AND effective_from<=clock_timestamp() AND (effective_to IS NULL OR clock_timestamp()<effective_to) ORDER BY effective_from DESC,id LIMIT 1;
 IF op IN ('CREATE','CREATE_SERIES') THEN
  IF NOT EXISTS(SELECT FROM public.classes WHERE tenant_id=t AND id=c AND status IN ('ACTIVE','PLANNED')) THEN RAISE EXCEPTION 'CLASS_NOT_ACTIVE' USING ERRCODE='23514'; END IF;
  mode:=(body->>'deliveryMode')::public."DeliveryMode";
  IF op='CREATE_SERIES' THEN
   INSERT INTO public.schedule_series(id,tenant_id,class_id,weekday,local_start_time,duration_minutes,valid_from,valid_to,timezone,status,updated_at)
   VALUES(target,t,c,(body->>'weekday')::int,(body->>'localStartTime')::time,(body->>'durationMinutes')::int,(body->>'validFrom')::date,(body->>'validTo')::date,z,'DRAFT',clock_timestamp()) RETURNING * INTO series;
  END IF;
  FOR day IN SELECT d::date FROM generate_series(COALESCE(series.valid_from,(body->>'startsAt')::timestamptz AT TIME ZONE z)::date,
    COALESCE(series.valid_to,(body->>'startsAt')::timestamptz AT TIME ZONE z)::date,interval '1 day') d
    WHERE series.id IS NULL OR extract(isodow FROM d)=series.weekday LOOP
   IF series.id IS NULL THEN stamp:=(body->>'startsAt')::timestamptz; finish:=(body->>'endsAt')::timestamptz;
   ELSE stamp:=educore_r3.local_instant(day+series.local_start_time,z); finish:=stamp+series.duration_minutes*interval '1 minute'; END IF;
   IF stamp<=clock_timestamp() THEN RAISE EXCEPTION 'SESSION_MUST_BE_FUTURE' USING ERRCODE='23514'; END IF;
   INSERT INTO public.class_sessions(id,tenant_id,class_id,series_id,teacher_id,room_id,delivery_mode,starts_at,ends_at,status,revision,policy_version_id,updated_at)
   VALUES(gen_random_uuid(),t,c,series.id,(body->>'teacherId')::uuid,(body->>'roomId')::uuid,mode,stamp,finish,'DRAFT',1,policy,clock_timestamp()) RETURNING * INTO cs;
   PERFORM educore_r3.roster(t,cs.id); ids:=ids||to_jsonb(cs.id);
  END LOOP;
  IF jsonb_array_length(ids)=0 THEN RAISE EXCEPTION 'NO_WEEKLY_OCCURRENCES' USING ERRCODE='23514'; END IF;
  result:=jsonb_build_object('id',COALESCE(series.id,cs.id),'sessionIds',ids,'status','DRAFT');
 ELSIF op IN ('CONFIRM','CONFIRM_SERIES') THEN
  IF (op='CONFIRM' AND cs.id IS NULL) OR (op='CONFIRM_SERIES' AND series.id IS NULL) THEN RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE='42501'; END IF;
  FOR r IN SELECT * FROM public.class_sessions WHERE tenant_id=t AND CASE WHEN op='CONFIRM' THEN id=cs.id ELSE series_id=series.id END ORDER BY starts_at,id LOOP
   IF r.status<>'DRAFT' OR r.starts_at<=clock_timestamp() THEN RAISE EXCEPTION 'DRAFT_FUTURE_REQUIRED' USING ERRCODE='23514'; END IF;
   PERFORM educore_r3.roster(t,r.id); PERFORM educore_r3.book(t,r.id);
   UPDATE public.class_sessions SET status='CONFIRMED',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id;
   ids:=ids||to_jsonb(r.id);
  END LOOP;
  IF series.id IS NOT NULL THEN UPDATE public.schedule_series SET status='CONFIRMED',updated_at=clock_timestamp() WHERE id=series.id; END IF;
  result:=jsonb_build_object('id',COALESCE(series.id,cs.id),'status','CONFIRMED','sessionIds',ids);
 ELSIF op IN ('RESCHEDULE','CANCEL') THEN
  IF cs.id IS NULL OR cs.status NOT IN ('DRAFT','CONFIRMED') OR cs.starts_at<=clock_timestamp() OR cs.revision IS DISTINCT FROM (body->>'revision')::int
  THEN RAISE EXCEPTION 'FUTURE_SESSION_OR_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
  UPDATE public.resource_bookings SET status='RELEASED',updated_at=clock_timestamp() WHERE tenant_id=t AND session_id=cs.id AND status='ACTIVE';
  IF op='CANCEL' THEN UPDATE public.class_sessions SET status='CANCELLED',cancel_reason=body->>'reason',revision=revision+1,updated_at=clock_timestamp() WHERE id=cs.id;
  ELSE
   IF (body->>'startsAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'RESCHEDULE_MUST_BE_FUTURE' USING ERRCODE='23514'; END IF;
   UPDATE public.class_sessions SET starts_at=(body->>'startsAt')::timestamptz,ends_at=(body->>'endsAt')::timestamptz,
    room_id=CASE WHEN body?'roomId' THEN (body->>'roomId')::uuid ELSE room_id END,revision=revision+1,updated_at=clock_timestamp() WHERE id=cs.id;
   PERFORM educore_r3.roster(t,cs.id); IF cs.status='CONFIRMED' THEN PERFORM educore_r3.book(t,cs.id); END IF;
  END IF;
  result:=jsonb_build_object('id',cs.id,'revision',cs.revision+1,'status',CASE WHEN op='CANCEL' THEN 'CANCELLED' ELSE cs.status::text END);
  INSERT INTO public.outbox_events(id,tenant_id,event_key,event_type,aggregate_type,aggregate_id,payload_json,occurred_at,status,attempt_count,available_at,correlation_id,updated_at)
  VALUES(gen_random_uuid(),t,'R3:'||op||':'||(body->>'key'),'ScheduleChanged','ClassSession',cs.id,
   jsonb_build_object('sessionId',cs.id,'operation',op,'revision',cs.revision+1,'policyVersionId',cs.policy_version_id),clock_timestamp(),'NEW',0,clock_timestamp(),correlation,clock_timestamp());
  result:=result||jsonb_build_object('correlationId',correlation);
 ELSIF op='ROOM' THEN
  target:=COALESCE((body->>'roomId')::uuid,target);
  IF body?'roomId' THEN
   UPDATE public.rooms SET capacity=(body->>'capacity')::int,active=COALESCE((body->>'active')::boolean,active),updated_at=clock_timestamp() WHERE tenant_id=t AND id=target;
   IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE='42501'; END IF;
  ELSE INSERT INTO public.rooms(id,tenant_id,code,name,capacity,active,updated_at) VALUES(target,t,body->>'code',body->>'name',(body->>'capacity')::int,true,clock_timestamp()); END IF;
  PERFORM educore_r3.resource(t,'ROOM',target); result:=jsonb_build_object('id',target);
 ELSIF op='CLASS_CAPACITY' THEN
  UPDATE public.classes SET capacity=(body->>'capacity')::int,updated_at=clock_timestamp() WHERE tenant_id=t AND id=c;
  result:=jsonb_build_object('id',c);
 ELSIF op='BUSY_CREATE' THEN
  INSERT INTO public.resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,status,reason,created_by_membership_id,updated_at)
  VALUES(target,t,educore_r3.resource(t,(body->>'resourceKind')::public."ResourceKind",(body->>'resourceId')::uuid),(body->>'startsAt')::timestamptz,(body->>'endsAt')::timestamptz,'DRAFT',body->>'reason',m,clock_timestamp());
  result:=jsonb_build_object('id',target,'status','DRAFT');
 ELSIF op IN ('BUSY_CONFIRM','BUSY_CANCEL') THEN
  SELECT * INTO STRICT busy FROM public.resource_unavailability WHERE tenant_id=t AND id=(body->>'unavailabilityId')::uuid FOR UPDATE;
  IF busy.status<>'DRAFT' AND op='BUSY_CONFIRM' THEN RAISE EXCEPTION 'DRAFT_UNAVAILABILITY_REQUIRED' USING ERRCODE='23514'; END IF;
  UPDATE public.resource_bookings SET status='RELEASED',updated_at=clock_timestamp() WHERE tenant_id=t AND unavailability_id=busy.id AND status='ACTIVE';
  IF op='BUSY_CONFIRM' THEN INSERT INTO public.resource_bookings(id,tenant_id,resource_id,unavailability_id,starts_at,ends_at,status,updated_at)
   VALUES(gen_random_uuid(),t,busy.resource_id,busy.id,busy.starts_at,busy.ends_at,'ACTIVE',clock_timestamp()); END IF;
  UPDATE public.resource_unavailability SET status=CASE WHEN op='BUSY_CONFIRM' THEN 'CONFIRMED'::public."ResourceUnavailabilityStatus" ELSE 'CANCELLED'::public."ResourceUnavailabilityStatus" END,updated_at=clock_timestamp() WHERE id=busy.id;
  result:=jsonb_build_object('id',busy.id);
 ELSE RAISE EXCEPTION 'UNSUPPORTED_R3_COMMAND' USING ERRCODE='22023'; END IF;
 PERFORM educore_r3.assert_bookings(t);
 RETURN educore_r3.finish(t,m,body,result,policy);
END $$;

CREATE FUNCTION educore_r3.calendar(t uuid,from_time timestamptz,to_time timestamptz,student uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE r record; candidate_participant record; allowed boolean; result jsonb:='[]';
BEGIN
 IF from_time IS NULL OR to_time IS NULL OR to_time<=from_time OR to_time>from_time+interval '31 days' THEN RAISE EXCEPTION 'BOUNDED_CALENDAR_RANGE_REQUIRED' USING ERRCODE='22023'; END IF;
 PERFORM educore_r3.principal(t);
 FOR r IN SELECT cs.* FROM public.class_sessions cs WHERE cs.tenant_id=t AND cs.starts_at<to_time AND from_time<cs.ends_at
  AND (student IS NULL OR EXISTS(SELECT FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=cs.id AND p.student_id=student AND p.removed_at IS NULL)) ORDER BY cs.starts_at,cs.id LIMIT 1001 LOOP
  allowed:=false;
  BEGIN PERFORM educore_r3.authorize(t,r.class_id,student,'schedule.read',r.id); allowed:=true;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT allowed AND student IS NULL THEN
   FOR candidate_participant IN SELECT student_id FROM public.session_participants WHERE tenant_id=t AND session_id=r.id AND removed_at IS NULL LOOP
    BEGIN PERFORM educore_r3.authorize(t,r.class_id,candidate_participant.student_id,'schedule.read',r.id); allowed:=true;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    EXIT WHEN allowed;
   END LOOP;
  END IF;
  IF allowed THEN result:=result||jsonb_build_object('id',r.id,'classId',r.class_id,'startsAt',r.starts_at,'endsAt',r.ends_at,'status',r.status,'revision',r.revision); END IF;
 END LOOP;
 RETURN result;
END $$;
DO $$ DECLARE f record; BEGIN FOR f IN SELECT oid::regprocedure p FROM pg_proc WHERE pronamespace='educore_r3'::regnamespace LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r3_owner',f.p); END LOOP; END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r3 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r3.scheduling(uuid,jsonb),educore_r3.calendar(uuid,timestamptz,timestamptz,uuid) TO educore_r3_command;
GRANT EXECUTE ON FUNCTION educore_r3.placement_context(uuid,uuid,uuid) TO educore_r3_command;
COMMIT;
