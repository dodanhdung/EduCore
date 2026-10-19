BEGIN;
ALTER TABLE public.users ADD CONSTRAINT r4_email_normalized CHECK(email_normalized=lower(btrim(email_normalized)));
CREATE TABLE educore_r4.auth_throttles (key_hash text PRIMARY KEY,attempts int NOT NULL,reset_at timestamptz NOT NULL);
ALTER TABLE educore_r4.auth_throttles OWNER TO educore_r4_owner;
CREATE FUNCTION educore_r4.throttle(key text,maximum int) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE attempts int;
BEGIN
 DELETE FROM educore_r4.auth_throttles WHERE reset_at<clock_timestamp()-interval '1 day';
 INSERT INTO educore_r4.auth_throttles VALUES(key,1,clock_timestamp()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE
 SET attempts=CASE WHEN auth_throttles.reset_at<=clock_timestamp() THEN 1 ELSE auth_throttles.attempts+1 END,
 reset_at=CASE WHEN auth_throttles.reset_at<=clock_timestamp() THEN clock_timestamp()+interval '1 minute' ELSE auth_throttles.reset_at END
 RETURNING auth_throttles.attempts INTO attempts;
 RETURN attempts<=maximum;
END $$;
CREATE FUNCTION educore_r4.credential_hash() RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE hash text;
BEGIN
 SELECT password_hash INTO hash FROM public.credentials c JOIN public.auth_sessions a ON a.user_id=c.user_id WHERE a.id=educore_r4.session_id();
 IF hash IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 RETURN hash;
END $$;
CREATE FUNCTION educore_r4.security_event(u uuid,event text,target uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m record;
BEGIN
 FOR m IN SELECT id,tenant_id FROM public.tenant_memberships WHERE user_id=u ORDER BY tenant_id LOOP
  INSERT INTO public.audit_logs(id,tenant_id,actor_user_id,actor_membership_id,actor_kind,event_type,entity_type,entity_id,action,reason,correlation_id)
  VALUES(gen_random_uuid(),m.tenant_id,u,m.id,'USER',event,CASE WHEN target IS NULL THEN 'User' ELSE 'AuthSession' END,COALESCE(target,u),event,'Authentication security event',gen_random_uuid());
 END LOOP;
END $$;
DO $security$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.login(text,text,boolean,uuid,text,text,text)'::regprocedure);
 ddl:=replace(ddl,'RETURN result;','PERFORM educore_r4.security_event(u.id,''LOGIN_SUCCESS'',sid); RETURN result;');
 ddl:=replace(ddl,'IF NOT verified THEN','IF NOT verified THEN PERFORM educore_r4.security_event(u.id,''LOGIN_FAILED'',NULL);'); EXECUTE ddl;
 ddl:=pg_get_functiondef('educore_r4.reset_password(text,public."OtpPurpose",text,text)'::regprocedure);
 ddl:=replace(ddl,'RETURN true;','PERFORM educore_r4.security_event(u.id,''PASSWORD_''||purpose::text,NULL); RETURN true;'); EXECUTE ddl;
 ddl:=pg_get_functiondef('educore_r4.logout()'::regprocedure);
 ddl:=replace(ddl,'UPDATE public.auth_sessions SET revoked_at=clock_timestamp()', 'PERFORM educore_r4.security_event(a.user_id,''LOGOUT'',a.id); UPDATE public.auth_sessions SET revoked_at=clock_timestamp()'); EXECUTE ddl;
 ddl:=pg_get_functiondef('educore_r4.change_password(text,text)'::regprocedure);
 ddl:=replace(ddl,'RETURN true;','PERFORM educore_r4.security_event(a.user_id,''PASSWORD_CHANGED'',a.id); RETURN true;'); EXECUTE ddl;
END $security$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r4'
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r4 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.throttle(text,integer) TO educore_r4_auth;
GRANT EXECUTE ON FUNCTION educore_r4.credential_hash() TO educore_r4_api;
COMMIT;
