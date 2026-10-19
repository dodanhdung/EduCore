BEGIN;
-- O-11 A: explicitly approved by owner in the R4 task, 2026-10-19.
-- Required assigner self-reference is ONLY bootstrap provenance, never proof
-- that the pending beneficiary already held authorization.
GRANT INSERT ON public.tenants TO educore_r4_owner;
CREATE FUNCTION educore_r4.bootstrap(code text,name text,zone text,email text,display_name text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE t uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); grant_id uuid:=gen_random_uuid(); r uuid; p uuid;
BEGIN
 IF email<>lower(btrim(email)) OR email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR COALESCE(length(btrim(code)),0) NOT BETWEEN 1 AND 100 OR COALESCE(length(btrim(name)),0) NOT BETWEEN 1 AND 200
 OR COALESCE(length(btrim(display_name)),0) NOT BETWEEN 1 AND 200
 OR NOT EXISTS(SELECT FROM pg_timezone_names WHERE pg_timezone_names.name=zone)
 THEN RAISE EXCEPTION 'INVALID_BOOTSTRAP' USING ERRCODE='22023'; END IF;
 -- Existing identity adoption is deliberately explicit; never demote an active
 -- global user or grant another tenant silently through this bootstrap.
 INSERT INTO public.users(id,email_normalized,display_name,status,updated_at) VALUES(u,email,display_name,'PENDING_ACTIVATION',clock_timestamp());
 INSERT INTO public.tenants(id,code,name,timezone,status,updated_at) VALUES(t,code,name,zone,'CREATED',clock_timestamp());
 PERFORM educore_private.r1b_lock_tenant(t);
 PERFORM educore_r4.seed(t);
 SELECT id INTO r FROM public.roles WHERE tenant_id=t AND roles.code='MANAGER';
 SELECT id INTO p FROM public.policy_versions WHERE tenant_id=t AND version_code='P0-R4-v1';
 INSERT INTO public.tenant_memberships(id,tenant_id,user_id,status,updated_at) VALUES(m,t,u,'PENDING_ACTIVATION',clock_timestamp());
 INSERT INTO public.membership_roles(id,tenant_id,membership_id,role_id,assigned_by_membership_id,updated_at) VALUES(grant_id,t,m,r,m,clock_timestamp());
 INSERT INTO public.access_scopes(id,tenant_id,membership_role_id,scope_kind,updated_at) VALUES(gen_random_uuid(),t,grant_id,'TENANT',clock_timestamp());
 INSERT INTO public.audit_logs(id,tenant_id,actor_kind,operator_identity,event_type,entity_type,entity_id,action,reason,after_json,policy_version_id,correlation_id)
 VALUES(gen_random_uuid(),t,'OPERATOR',session_user,'TENANT_BOOTSTRAP','Tenant',t,'TENANT_BOOTSTRAP','Controlled CLI bootstrap; O-11 A',
 jsonb_build_object('beneficiaryMembershipId',m,'assignerException','O11_A_PENDING_SELF_REFERENCE','status','PENDING_ACTIVATION'),p,gen_random_uuid());
 RETURN jsonb_build_object('tenantId',t,'membershipId',m,'status','PENDING_ACTIVATION');
END $$;
CREATE FUNCTION educore_r4.activate_tenants(u uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE t uuid;
BEGIN
 FOR t IN SELECT tenant_id FROM public.tenant_memberships WHERE user_id=u ORDER BY tenant_id LOOP
  PERFORM educore_private.r1b_lock_tenant(t);
  IF educore_r4.manager_count(t)>0 THEN UPDATE public.tenants SET status='ACTIVE',activated_at=COALESCE(activated_at,clock_timestamp()),updated_at=clock_timestamp() WHERE id=t AND status='CREATED'; END IF;
 END LOOP;
END $$;
DO $activation$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.reset_password(text,public."OtpPurpose",text,text)'::regprocedure);
 ddl:=replace(ddl,'RETURN true;', 'PERFORM educore_r4.activate_tenants(u.id); RETURN true;'); EXECUTE ddl;
END $activation$;
ALTER FUNCTION educore_r4.bootstrap(text,text,text,text,text) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.activate_tenants(uuid) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.bootstrap(text,text,text,text,text),educore_r4.activate_tenants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.bootstrap(text,text,text,text,text) TO educore_r4_operator;
COMMIT;
