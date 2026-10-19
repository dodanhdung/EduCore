BEGIN;
CREATE ROLE educore_r4_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT USAGE ON SCHEMA educore_r4 TO educore_r4_operator;
GRANT INSERT ON public.roles,public.permissions,public.role_permissions,public.policy_versions TO educore_r4_owner;
GRANT UPDATE ON public.tenants TO educore_r4_owner;
ALTER TABLE public.parent_student_links ADD COLUMN evidence_reference text;
ALTER TABLE public.audit_logs ADD COLUMN operator_identity text;
CREATE UNIQUE INDEX r4_active_grant ON public.membership_roles(tenant_id,membership_id,role_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX r4_active_parent_pair ON public.parent_student_links(tenant_id,parent_membership_id,student_id) WHERE revoked_at IS NULL;
ALTER TABLE public.access_scopes ADD CONSTRAINT r4_scope_shape CHECK
 ((scope_kind='TENANT' AND class_id IS NULL AND student_id IS NULL) OR
 (scope_kind='CLASS' AND class_id IS NOT NULL AND student_id IS NULL) OR
 (scope_kind='STUDENT' AND class_id IS NULL AND student_id IS NOT NULL));
ALTER TABLE public.parent_student_links ADD CONSTRAINT r4_parent_verification CHECK ((verified_at IS NULL)=(verified_by_membership_id IS NULL));
ALTER TABLE public.credentials ADD CONSTRAINT r4_login_attempts CHECK(failed_attempts>=0);
ALTER TABLE public.password_reset_otps ADD CONSTRAINT r4_otp_limits CHECK
 (attempt_count BETWEEN 0 AND max_attempts AND max_attempts>0 AND expires_at>requested_at AND expires_at<=requested_at+interval '15 minutes');
-- Legacy test/operator sessions can predate R4; enforce TTL for new sessions
-- through gateways rather than silently rewriting their historical timestamps.

CREATE FUNCTION educore_r4.has_permission(t uuid,m uuid,p text,c uuid DEFAULT NULL,s uuid DEFAULT NULL) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT EXISTS(SELECT FROM public.tenant_memberships tm JOIN public.users u ON u.id=tm.user_id AND u.status='ACTIVE'
 JOIN public.tenants tn ON tn.id=t AND tn.status='ACTIVE'
 JOIN public.membership_roles mr ON mr.tenant_id=t AND mr.membership_id=tm.id AND mr.revoked_at IS NULL
 JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id
 JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=r.id
 JOIN public.permissions pm ON pm.id=rp.permission_id AND pm.code=p
 JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id
 WHERE tm.tenant_id=t AND tm.id=m AND tm.status='ACTIVE' AND tm.left_at IS NULL
 AND (sc.scope_kind='TENANT' OR (sc.scope_kind='CLASS' AND sc.class_id=c)
 OR (sc.scope_kind='STUDENT' AND sc.student_id=s))
 AND ((r.code NOT IN ('PARENT','STUDENT','TEACHER'))
 OR (r.code='PARENT' AND p IN ('schedule.read','attendance.read','absence.create','absence.read','invoice.read','receivable.read','notification.read','notification.mark_read')
 AND EXISTS(SELECT FROM public.parent_student_links l WHERE l.tenant_id=t AND l.parent_membership_id=m AND l.student_id=s AND l.verified_at IS NOT NULL AND l.revoked_at IS NULL))
 OR (r.code='STUDENT' AND p IN ('schedule.read','attendance.read','absence.create','absence.read','notification.read','notification.mark_read')
 AND EXISTS(SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t AND sp.id=s AND sp.membership_id=m))
 OR (r.code='TEACHER' AND p IN ('schedule.read','attendance.read','attendance.mark','attendance.finalize','absence.read','notification.read','notification.mark_read')
 AND EXISTS(SELECT FROM public.teacher_profiles tp JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.teacher_id=tp.id AND ca.class_id=c
 WHERE tp.tenant_id=t AND tp.membership_id=m AND tp.status='ACTIVE' AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp())))))
 $$;
CREATE FUNCTION educore_r4.authorize(t uuid,p text,c uuid DEFAULT NULL,s uuid DEFAULT NULL) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid;
BEGIN
 m:=educore_r3.principal(t);
 IF NOT educore_r4.has_permission(t,m,p,c,s) THEN RAISE EXCEPTION 'PERMISSION_OR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;
GRANT EXECUTE ON FUNCTION educore_r3.principal(uuid),educore_r3.authorize(uuid,uuid,uuid,text,uuid) TO educore_r4_owner;
CREATE FUNCTION educore_r4.manager_count(t uuid) RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT count(DISTINCT tm.id)::int FROM public.tenant_memberships tm JOIN public.users u ON u.id=tm.user_id AND u.status='ACTIVE'
 JOIN public.membership_roles mr ON mr.tenant_id=t AND mr.membership_id=tm.id AND mr.revoked_at IS NULL
 JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id AND r.code='MANAGER'
 JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id AND p.code='role.assign'
 JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id AND sc.scope_kind='TENANT'
 WHERE tm.tenant_id=t AND tm.status='ACTIVE' AND tm.left_at IS NULL
 $$;
CREATE FUNCTION educore_r4.check_manager(t uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 PERFORM educore_private.r1b_lock_tenant(t);
 IF EXISTS(SELECT FROM public.tenants WHERE id=t AND status='ACTIVE') AND educore_r4.manager_count(t)=0
 THEN RAISE EXCEPTION 'LAST_ACTIVE_MANAGER' USING ERRCODE='23514'; END IF;
END $$;
-- Deferred allows controlled bootstrap to insert all related records atomically.
-- All runtime writers acquire User -> Tenant before DML; raw DML is denied.
CREATE FUNCTION educore_r4.manager_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE t uuid;
BEGIN
 IF TG_TABLE_NAME='users' THEN
  FOR t IN SELECT tenant_id FROM public.tenant_memberships WHERE user_id=OLD.id ORDER BY tenant_id LOOP PERFORM educore_r4.check_manager(t); END LOOP;
 ELSIF TG_TABLE_NAME='tenants' THEN PERFORM educore_r4.check_manager(NEW.id);
 ELSE
  t:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  PERFORM educore_r4.check_manager(t);
 END IF;
 RETURN NULL;
END $$;
DO $preflight$ DECLARE t uuid; BEGIN
 FOR t IN SELECT id FROM public.tenants WHERE status='ACTIVE' ORDER BY id LOOP PERFORM educore_r4.check_manager(t); END LOOP;
END $preflight$;
CREATE CONSTRAINT TRIGGER r4_manager_user AFTER UPDATE ON public.users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION educore_r4.manager_guard();
CREATE CONSTRAINT TRIGGER r4_manager_tenant AFTER INSERT OR UPDATE ON public.tenants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r4.manager_guard();
CREATE CONSTRAINT TRIGGER r4_manager_member AFTER UPDATE OR DELETE ON public.tenant_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r4.manager_guard();
CREATE CONSTRAINT TRIGGER r4_manager_role AFTER UPDATE OR DELETE ON public.membership_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r4.manager_guard();
CREATE CONSTRAINT TRIGGER r4_manager_scope AFTER UPDATE OR DELETE ON public.access_scopes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r4.manager_guard();
CREATE CONSTRAINT TRIGGER r4_manager_permission AFTER UPDATE OR DELETE ON public.role_permissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r4.manager_guard();
CREATE CONSTRAINT TRIGGER r4_manager_catalog AFTER UPDATE OR DELETE ON public.roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r4.manager_guard();

CREATE FUNCTION educore_r4.redact(value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE k text; v jsonb; output jsonb;
BEGIN
 IF jsonb_typeof(value)='object' THEN
  output:='{}'; FOR k,v IN SELECT * FROM jsonb_each(value) LOOP
   output:=output||jsonb_build_object(k,CASE WHEN k ~* '(password|token|otp|secret|authorization|cookie|credential)' THEN '"[REDACTED]"'::jsonb ELSE educore_r4.redact(v) END);
  END LOOP; RETURN output;
 ELSIF jsonb_typeof(value)='array' THEN SELECT COALESCE(jsonb_agg(educore_r4.redact(x)),'[]') INTO output FROM jsonb_array_elements(value) x; RETURN output;
 ELSE RETURN value; END IF;
END $$;
CREATE FUNCTION educore_r4.audit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 IF NEW.actor_kind='USER' AND (NEW.actor_user_id IS NULL OR NEW.actor_membership_id IS NULL OR NOT EXISTS
 (SELECT FROM public.tenant_memberships m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id AND m.user_id=NEW.actor_user_id))
 THEN RAISE EXCEPTION 'AUDIT_ACTOR_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NEW.actor_kind IN ('WORKER','OPERATOR') AND (NEW.actor_user_id IS NOT NULL OR NEW.actor_membership_id IS NOT NULL)
 THEN RAISE EXCEPTION 'SYSTEM_ACTOR_HAS_NO_MEMBERSHIP' USING ERRCODE='23514'; END IF;
 IF NEW.actor_kind='OPERATOR' AND COALESCE(length(btrim(NEW.operator_identity)),0)=0 THEN RAISE EXCEPTION 'OPERATOR_PROVENANCE_REQUIRED' USING ERRCODE='23514'; END IF;
 NEW.before_json:=educore_r4.redact(NEW.before_json); NEW.after_json:=educore_r4.redact(NEW.after_json);
 RETURN NEW;
END $$;
CREATE TRIGGER r4_audit_actor BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION educore_r4.audit_guard();
CREATE FUNCTION educore_r4.policy(t uuid,pinned uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE p public.policy_versions%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.policy_versions WHERE tenant_id=t AND ((pinned IS NOT NULL AND id=pinned) OR
 (pinned IS NULL AND effective_from<=clock_timestamp() AND (effective_to IS NULL OR effective_to>clock_timestamp()))) ORDER BY effective_from DESC,id LIMIT 1;
 IF p.id IS NULL OR p.content_hash<>educore_r4.digest(p.config_snapshot::text) THEN RAISE EXCEPTION 'POLICY_HASH_INVALID' USING ERRCODE='23514'; END IF;
 RETURN p.id;
END $$;
CREATE FUNCTION educore_r4.audit(t uuid,m uuid,event text,target uuid,reason text,body jsonb,policy uuid DEFAULT NULL,correlation uuid DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 INSERT INTO public.audit_logs(id,tenant_id,actor_user_id,actor_membership_id,actor_kind,event_type,entity_type,entity_id,action,reason,after_json,policy_version_id,correlation_id)
 SELECT gen_random_uuid(),t,user_id,m,'USER',event,'R4',target,event,reason,educore_r4.redact(body),COALESCE(policy,educore_r4.policy(t)),COALESCE(correlation,gen_random_uuid())
 FROM public.tenant_memberships WHERE tenant_id=t AND id=m;
END $$;

-- Versioned static catalog. No dynamic permission designer or wildcard grants.
CREATE FUNCTION educore_r4.seed(t uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
#variable_conflict use_variable
DECLARE catalog text[]:=ARRAY[
 'member.read','member.create','member.update','role.read','role.assign','relationship.read','relationship.create','relationship.verify','relationship.revoke','discount.verify',
 'student.read','student.create','student.update','teacher.read','teacher.create','teacher.update','academic.read','academic.manage','course.update','class.read','class.create','class.update','class.assign_teacher','enrollment.read','enrollment.create','enrollment.update','enrollment.transfer',
 'room.manage','resource.read','resource.manage','schedule.read','schedule.preview','schedule.create','schedule.confirm','schedule.update','schedule.cancel','attendance.read','attendance.mark','attendance.finalize','attendance.correct','absence.read','absence.create','absence.approve','absence.approve_late',
 'pricing.manage','billing.read','billing.generate_draft','invoice.read','invoice.issue','invoice.adjust_request','invoice.cancel_request','payment.read','payment.record','payment.reverse','receivable.read',
 'assignment.read','assignment.create','assignment.update','assignment.publish','submission.read','submission.create','file.read','file.upload','file.download','grade.write','grade.publish','grade.correct','grade.read_published',
 'notification.read','notification.mark_read','dashboard.view','approval.read','approval.decide','approval.execute','job.read','job.retry','audit.read','audit.explain'];
 r text; code text; rid uuid; pid uuid; cfg jsonb:='{"absenceNoticeHours":24,"invoiceAutoIssue":false,"siblingDiscountRate":"0.10","jobRetryDelaysMinutes":[1,5,15],"auditRetentionMonths":24}'; allowed boolean;
BEGIN
 PERFORM educore_private.r1b_lock_tenant(t);
 FOREACH code IN ARRAY catalog LOOP
  INSERT INTO public.permissions(id,code,description,is_sensitive) VALUES(gen_random_uuid(),code,'P0 v1: '||code,code IN ('role.assign','approval.decide','approval.execute','payment.record','payment.reverse')) ON CONFLICT DO NOTHING;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['MANAGER','ACADEMIC_STAFF','ACCOUNTANT','TEACHER','STUDENT','PARENT'] LOOP
  INSERT INTO public.roles(id,tenant_id,code,name,is_system_seeded,updated_at) VALUES(gen_random_uuid(),t,r,r,true,clock_timestamp()) ON CONFLICT DO NOTHING;
  SELECT id INTO rid FROM public.roles WHERE tenant_id=t AND roles.code=r;
  FOREACH code IN ARRAY catalog LOOP
   allowed:=r='MANAGER'
    OR (r='ACCOUNTANT' AND (code ~ '^(pricing|billing|invoice|payment)\.' OR code IN ('receivable.read','approval.read','approval.decide','approval.execute','dashboard.view','notification.read','notification.mark_read')))
    OR (r='ACADEMIC_STAFF' AND (code ~ '^(academic|student|teacher|course|class|enrollment|schedule|room|resource)\.' OR code IN ('relationship.read','relationship.create','relationship.verify','relationship.revoke','attendance.read','attendance.mark','attendance.finalize','absence.read','absence.create','absence.approve','notification.read','notification.mark_read')))
    OR (r='TEACHER' AND code IN ('schedule.read','class.read','student.read','attendance.read','attendance.mark','attendance.finalize','absence.read','assignment.read','assignment.create','assignment.update','assignment.publish','submission.read','file.read','file.download','grade.write','grade.publish','grade.read_published','notification.read','notification.mark_read'))
    OR (r='STUDENT' AND code IN ('schedule.read','attendance.read','absence.create','absence.read','assignment.read','submission.read','submission.create','file.upload','file.read','file.download','grade.read_published','notification.read','notification.mark_read'))
    OR (r='PARENT' AND code IN ('schedule.read','attendance.read','absence.create','absence.read','assignment.read','submission.read','grade.read_published','invoice.read','receivable.read','notification.read','notification.mark_read'));
   IF allowed THEN SELECT id INTO pid FROM public.permissions WHERE permissions.code=code;
    INSERT INTO public.role_permissions(id,tenant_id,role_id,permission_id) VALUES(gen_random_uuid(),t,rid,pid) ON CONFLICT DO NOTHING; END IF;
  END LOOP;
 END LOOP;
 INSERT INTO public.policy_versions(id,tenant_id,version_code,effective_from,config_snapshot,content_hash)
 VALUES(gen_random_uuid(),t,'P0-R4-v1',clock_timestamp(),cfg,educore_r4.digest(cfg::text)) ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION educore_r4.iam(t uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE op text:=body->>'operation'; m uuid; target uuid:=(body->>'id')::uuid; target_user uuid; actor_user uuid; u uuid; rid uuid; created_id uuid:=gen_random_uuid(); link public.parent_student_links%ROWTYPE; result jsonb;
BEGIN
 IF COALESCE(length(btrim(body->>'reason')),0)=0 THEN RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT user_id INTO actor_user FROM public.auth_sessions WHERE id=educore_r4.session_id();
 IF actor_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 IF op IN ('MEMBER_DEACTIVATE','ROLE_ASSIGN','ROLE_REVOKE') THEN
  SELECT user_id INTO target_user FROM public.tenant_memberships WHERE tenant_id=t AND tenant_memberships.id=target;
  IF target_user IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
 END IF;
 FOR u IN SELECT DISTINCT x FROM unnest(ARRAY[actor_user,target_user]) x WHERE x IS NOT NULL ORDER BY x LOOP PERFORM 1 FROM public.users WHERE users.id=u FOR SHARE; END LOOP;
 m:=educore_r4.authorize(t,CASE WHEN op='MEMBER_DEACTIVATE' THEN 'member.update' WHEN op IN ('ROLE_ASSIGN','ROLE_REVOKE') THEN 'role.assign'
 WHEN op='PARENT_CREATE' THEN 'relationship.create' WHEN op='PARENT_VERIFY' THEN 'relationship.verify' WHEN op='PARENT_REVOKE' THEN 'relationship.revoke' ELSE '__DENY__' END);
 IF op='MEMBER_DEACTIVATE' THEN UPDATE public.tenant_memberships SET status='DISABLED',left_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=t AND tenant_memberships.id=target;
 ELSIF op='ROLE_ASSIGN' THEN
  SELECT roles.id INTO rid FROM public.roles WHERE tenant_id=t AND roles.id=(body->>'roleId')::uuid AND is_system_seeded;
  IF rid IS NULL OR target=m THEN RAISE EXCEPTION 'INVALID_ROLE_OR_SELF_GRANT' USING ERRCODE='42501'; END IF;
  INSERT INTO public.membership_roles(id,tenant_id,membership_id,role_id,assigned_by_membership_id,updated_at) VALUES(created_id,t,target,rid,m,clock_timestamp());
  INSERT INTO public.access_scopes(id,tenant_id,membership_role_id,scope_kind,class_id,student_id,updated_at)
  VALUES(gen_random_uuid(),t,created_id,(body->>'scopeKind')::public."AccessScopeKind",(body->>'classId')::uuid,(body->>'studentId')::uuid,clock_timestamp());
 ELSIF op='ROLE_REVOKE' THEN
  UPDATE public.membership_roles SET revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=t AND membership_id=target AND membership_roles.id=(body->>'assignmentId')::uuid AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
 ELSIF op='PARENT_CREATE' THEN
  IF COALESCE(length(btrim(body->>'evidenceReference')),0)=0 OR NOT EXISTS(SELECT FROM public.tenant_memberships tm JOIN public.membership_roles mr ON mr.tenant_id=t AND mr.membership_id=tm.id AND mr.revoked_at IS NULL
   JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id AND r.code='PARENT'
   WHERE tm.tenant_id=t AND tm.id=(body->>'parentMembershipId')::uuid AND tm.status='ACTIVE') THEN RAISE EXCEPTION 'PARENT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
  INSERT INTO public.parent_student_links(id,tenant_id,parent_membership_id,student_id,relationship,evidence_reference,updated_at)
  VALUES(created_id,t,(body->>'parentMembershipId')::uuid,(body->>'studentId')::uuid,'PARENT',body->>'evidenceReference',clock_timestamp());
 ELSE
  SELECT * INTO link FROM public.parent_student_links WHERE tenant_id=t AND parent_student_links.id=target FOR UPDATE;
  IF link.id IS NULL OR link.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  IF op='PARENT_VERIFY' THEN
   IF link.evidence_reference IS NULL THEN RAISE EXCEPTION 'PARENT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
   UPDATE public.parent_student_links SET verified_at=clock_timestamp(),verified_by_membership_id=m,updated_at=clock_timestamp() WHERE parent_student_links.id=target;
  ELSE UPDATE public.parent_student_links SET revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE parent_student_links.id=target; END IF;
 END IF;
 result:=jsonb_build_object('id',CASE WHEN op IN ('ROLE_ASSIGN','PARENT_CREATE') THEN created_id ELSE target END,'operation',op);
 PERFORM educore_r4.audit(t,m,op,COALESCE(target,created_id),body->>'reason',result,NULL,(body->>'correlationId')::uuid);
 RETURN result;
END $$;
CREATE FUNCTION educore_r4.disable_user(u uuid,reason text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE t uuid;
BEGIN
 IF COALESCE(length(btrim(reason)),0)=0 THEN RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.users WHERE id=u FOR UPDATE;
 FOR t IN SELECT tenant_id FROM public.tenant_memberships WHERE user_id=u ORDER BY tenant_id LOOP PERFORM educore_private.r1b_lock_tenant(t); END LOOP;
 UPDATE public.users SET status='DISABLED',updated_at=clock_timestamp() WHERE id=u;
 UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE user_id=u;
 FOR t IN SELECT tenant_id FROM public.tenant_memberships WHERE user_id=u ORDER BY tenant_id LOOP
  PERFORM educore_r4.check_manager(t);
  INSERT INTO public.audit_logs(id,tenant_id,actor_kind,operator_identity,event_type,entity_type,entity_id,action,reason,correlation_id)
  VALUES(gen_random_uuid(),t,'OPERATOR',session_user,'USER_DISABLE','User',u,'USER_DISABLE',reason,gen_random_uuid());
 END LOOP;
END $$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r4'
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r4 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.iam(uuid,jsonb) TO educore_r4_api;
GRANT EXECUTE ON FUNCTION educore_r4.seed(uuid),educore_r4.disable_user(uuid,text) TO educore_r4_operator;
COMMIT;
