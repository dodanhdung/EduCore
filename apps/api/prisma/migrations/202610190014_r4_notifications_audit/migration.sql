BEGIN;
CREATE FUNCTION educore_r4.can_event(t uuid,m uuid,event uuid,permission text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE e public.outbox_events%ROWTYPE; c uuid;
BEGIN
 SELECT * INTO e FROM public.outbox_events WHERE tenant_id=t AND id=event;
 IF e.event_type='ADMIN_ALERT' THEN RETURN educore_r4.has_permission(t,m,'job.read') AND educore_r4.has_permission(t,m,permission); END IF;
 IF e.event_type IN ('ScheduleChanged','SCHEDULE_CHANGED') THEN
  SELECT class_id INTO c FROM public.class_sessions WHERE tenant_id=t AND id=e.aggregate_id AND status IN ('CONFIRMED','COMPLETED','CANCELLED');
  RETURN c IS NOT NULL AND (educore_r4.has_permission(t,m,permission,c,NULL) OR EXISTS
   (SELECT FROM public.session_participants sp WHERE sp.tenant_id=t AND sp.session_id=e.aggregate_id AND sp.removed_at IS NULL AND educore_r4.has_permission(t,m,permission,c,sp.student_id))
   OR EXISTS(SELECT FROM public.class_sessions cs
    JOIN public.teacher_profiles tp ON tp.tenant_id=t AND tp.id=cs.teacher_id AND tp.membership_id=m AND tp.status='ACTIVE'
    JOIN public.tenant_memberships tm ON tm.tenant_id=t AND tm.id=m AND tm.status='ACTIVE' AND tm.left_at IS NULL
    JOIN public.users u ON u.id=tm.user_id AND u.status='ACTIVE'
    JOIN public.membership_roles mr ON mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL
    JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id AND r.code='TEACHER'
    JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id AND p.code=permission
    JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id AND (sc.scope_kind='TENANT' OR (sc.scope_kind='CLASS' AND sc.class_id=cs.class_id))
    JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.teacher_id=tp.id AND ca.class_id=cs.class_id AND ca.valid_from<=cs.starts_at AND (ca.valid_to IS NULL OR ca.valid_to>cs.starts_at)
    WHERE cs.tenant_id=t AND cs.id=e.aggregate_id));
 ELSIF e.event_type='ASSIGNMENT_PUBLISHED' THEN
  SELECT class_id INTO c FROM public.assignments WHERE tenant_id=t AND id=e.aggregate_id AND status='PUBLISHED';
  RETURN c IS NOT NULL AND (educore_r4.has_permission(t,m,permission,c,NULL) OR EXISTS
   (SELECT FROM public.assignment_recipients ar WHERE ar.tenant_id=t AND ar.assignment_id=e.aggregate_id AND ar.revoked_at IS NULL AND educore_r4.has_permission(t,m,permission,c,ar.student_id)));
 END IF;
 RETURN false;
END $$;
-- DB-only delivery: recipient effects + DONE commit together. A crash rolls
-- back both, so no separate lease/acknowledgement gap or external I/O exists.
CREATE FUNCTION educore_r4.dispatch_event() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE candidate record; e public.outbox_events%ROWTYPE; m record; kind public."NotificationKind"; code text; count int:=0;
BEGIN
 FOR candidate IN SELECT id,tenant_id FROM public.outbox_events WHERE status='NEW' AND available_at<=clock_timestamp() AND event_type IN ('ScheduleChanged','SCHEDULE_CHANGED','ASSIGNMENT_PUBLISHED','ADMIN_ALERT') ORDER BY available_at,id LIMIT 32 LOOP
  PERFORM 1 FROM public.tenants WHERE id=candidate.tenant_id FOR NO KEY UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO e FROM public.outbox_events WHERE id=candidate.id AND status='NEW' AND available_at<=clock_timestamp() FOR UPDATE SKIP LOCKED;
  IF e.id IS NULL THEN CONTINUE; END IF;
  BEGIN
   kind:=CASE WHEN e.event_type='ScheduleChanged' THEN 'SCHEDULE_CHANGED' ELSE e.event_type END::public."NotificationKind";
   FOR m IN SELECT tm.id FROM public.tenant_memberships tm WHERE tm.tenant_id=e.tenant_id AND educore_r4.can_event(e.tenant_id,tm.id,e.id,'notification.read') ORDER BY tm.id LOOP
    INSERT INTO public.notifications(id,tenant_id,recipient_membership_id,outbox_event_id,kind,title,body,updated_at)
    VALUES(gen_random_uuid(),e.tenant_id,m.id,e.id,kind,CASE kind WHEN 'ADMIN_ALERT' THEN 'Automation requires attention' WHEN 'SCHEDULE_CHANGED' THEN 'Schedule changed' ELSE 'New assignment' END,
    'Open the authorized resource for current details.',clock_timestamp()) ON CONFLICT DO NOTHING;
    count:=count+1;
   END LOOP;
   UPDATE public.outbox_events SET status='DONE',attempt_count=attempt_count+1,updated_at=clock_timestamp() WHERE id=e.id;
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
   UPDATE public.outbox_events SET status=CASE WHEN attempt_count>=3 THEN 'FAILED'::public."OutboxEventStatus" ELSE 'NEW'::public."OutboxEventStatus" END,
   attempt_count=attempt_count+1,available_at=clock_timestamp()+CASE attempt_count WHEN 0 THEN interval '1 minute' WHEN 1 THEN interval '5 minutes' ELSE interval '15 minutes' END,updated_at=clock_timestamp() WHERE id=e.id;
  END;
  RETURN jsonb_build_object('id',e.id,'recipients',count,'errorCode',code);
 END LOOP;
 RETURN NULL;
END $$;
CREATE FUNCTION educore_r4.inbox(t uuid,action text,target uuid DEFAULT NULL,page_no int DEFAULT 1,size int DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; total int; items jsonb;
BEGIN
 m:=educore_r3.principal(t);
 IF page_no<1 OR page_no>100000 OR size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
 IF action='MARK_READ' THEN
  UPDATE public.notifications n SET read_at=COALESCE(read_at,clock_timestamp()),updated_at=clock_timestamp()
  WHERE n.tenant_id=t AND n.id=target AND n.recipient_membership_id=m AND educore_r4.can_event(t,m,n.outbox_event_id,'notification.mark_read');
  IF NOT FOUND THEN RAISE EXCEPTION 'NOTIFICATION_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('id',target,'read',true);
 END IF;
 IF action NOT IN ('LIST','UNREAD_COUNT') THEN RAISE EXCEPTION 'INVALID_INBOX_ACTION' USING ERRCODE='22023'; END IF;
 -- Require a current effective grant even if the inbox is empty. Per-event
 -- resource authority is checked again below, including revoked relationships.
 IF NOT EXISTS(SELECT FROM public.membership_roles mr JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=mr.role_id JOIN public.permissions p ON p.id=rp.permission_id AND p.code='notification.read'
 WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL) THEN RAISE EXCEPTION 'INBOX_DENIED' USING ERRCODE='42501'; END IF;
 SELECT count(*)::int INTO total FROM public.notifications n WHERE n.tenant_id=t AND n.recipient_membership_id=m AND educore_r4.can_event(t,m,n.outbox_event_id,'notification.read') AND (action<>'UNREAD_COUNT' OR n.read_at IS NULL);
 IF action='UNREAD_COUNT' THEN RETURN jsonb_build_object('count',total); END IF;
 SELECT COALESCE(jsonb_agg(row),'[]') INTO items FROM (SELECT n.id,n.kind,n.title,n.body,n.read_at AS "readAt",n.created_at AS "createdAt" FROM public.notifications n
 WHERE n.tenant_id=t AND n.recipient_membership_id=m AND educore_r4.can_event(t,m,n.outbox_event_id,'notification.read') ORDER BY n.created_at DESC,n.id LIMIT size OFFSET (page_no-1)*size) row;
 RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;
-- Preserve source identity/history while allowing only delivery state changes.
CREATE FUNCTION educore_r4.outbox_secret_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 IF educore_r4.redact(NEW.payload_json) IS DISTINCT FROM NEW.payload_json THEN RAISE EXCEPTION 'OUTBOX_SECRET_PAYLOAD_FORBIDDEN' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r4_outbox_no_secrets BEFORE INSERT ON public.outbox_events FOR EACH ROW EXECUTE FUNCTION educore_r4.outbox_secret_guard();
CREATE FUNCTION educore_r4.outbox_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','attempt_count','available_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','attempt_count','available_at','updated_at']) THEN RAISE EXCEPTION 'OUTBOX_SOURCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r4_outbox_history BEFORE UPDATE OR DELETE ON public.outbox_events FOR EACH ROW EXECUTE FUNCTION educore_r4.outbox_guard();
-- Domain audits executed by a worker retain the real initiating membership as
-- safe attribution, while actorKind itself accurately identifies the worker.
CREATE OR REPLACE FUNCTION educore_r4.audit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE j public.automation_jobs%ROWTYPE;
BEGIN
 SELECT x.* INTO j FROM educore_r4.worker_context c JOIN public.automation_jobs x ON x.id=c.job_id WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.fence=x.fencing_token AND x.lease_owner=session_user AND x.status='RUNNING';
 IF j.id IS NOT NULL THEN
  NEW.after_json:=COALESCE(NEW.after_json,'{}')||jsonb_build_object('initiatingMembershipId',j.actor_membership_id,'jobId',j.id,'fence',j.fencing_token::text);
  NEW.actor_kind:='WORKER'; NEW.actor_user_id:=NULL; NEW.actor_membership_id:=NULL; NEW.policy_version_id:=j.policy_version_id; NEW.correlation_id:=j.correlation_id;
 END IF;
 IF NEW.actor_kind='USER' AND (NEW.actor_user_id IS NULL OR NEW.actor_membership_id IS NULL OR NOT EXISTS
 (SELECT FROM public.tenant_memberships m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id AND m.user_id=NEW.actor_user_id))
 THEN RAISE EXCEPTION 'AUDIT_ACTOR_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NEW.actor_kind IN ('WORKER','OPERATOR') AND (NEW.actor_user_id IS NOT NULL OR NEW.actor_membership_id IS NOT NULL) THEN RAISE EXCEPTION 'SYSTEM_ACTOR_HAS_NO_MEMBERSHIP' USING ERRCODE='23514'; END IF;
 IF NEW.actor_kind='OPERATOR' AND COALESCE(length(btrim(NEW.operator_identity)),0)=0 THEN RAISE EXCEPTION 'OPERATOR_PROVENANCE_REQUIRED' USING ERRCODE='23514'; END IF;
 NEW.before_json:=educore_r4.redact(NEW.before_json); NEW.after_json:=educore_r4.redact(NEW.after_json);
 RETURN NEW;
END $$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r4'
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r4 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.dispatch_event() TO educore_r4_worker;
GRANT EXECUTE ON FUNCTION educore_r4.inbox(uuid,text,uuid,integer,integer) TO educore_r4_api;
COMMIT;
