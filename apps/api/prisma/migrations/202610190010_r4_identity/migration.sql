BEGIN;
-- Fail before altering populated sessions: no fabricated access/CSRF credentials.
-- Existing operator-bound sessions remain usable only on their R2/R3 LOGINs.
CREATE ROLE educore_r4_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE educore_r4_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE educore_r4_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE educore_r4_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE SCHEMA educore_r4 AUTHORIZATION educore_r4_owner;
REVOKE ALL ON SCHEMA educore_r4 FROM PUBLIC;
GRANT USAGE ON SCHEMA educore_r4 TO educore_r4_auth,educore_r4_api,educore_r4_worker,educore_r2_owner,educore_r3_owner;
GRANT USAGE ON SCHEMA public,educore_private,educore_r2,educore_r3 TO educore_r4_owner;
GRANT EXECUTE ON FUNCTION educore_private.r1b_lock_tenant(uuid) TO educore_r4_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO educore_r4_owner;
GRANT INSERT,UPDATE ON public.auth_sessions,public.credentials,public.password_reset_otps TO educore_r4_owner;
GRANT UPDATE ON public.users,public.tenant_memberships,public.membership_roles,public.parent_student_links TO educore_r4_owner;
GRANT INSERT ON public.audit_logs,public.membership_roles,public.access_scopes,public.parent_student_links,public.users,public.tenant_memberships TO educore_r4_owner;
ALTER TABLE public.auth_sessions ADD COLUMN access_token_hash text,
 ADD COLUMN access_expires_at timestamptz(6), ADD COLUMN csrf_hash text;
CREATE UNIQUE INDEX r4_access_token_hash ON public.auth_sessions(access_token_hash) WHERE access_token_hash IS NOT NULL;
CREATE TABLE public.refresh_token_history (
 token_hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.auth_sessions(id) ON DELETE RESTRICT,
 consumed_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
GRANT SELECT,INSERT ON public.refresh_token_history TO educore_r4_owner;
CREATE TABLE educore_r4.transaction_principals (
 backend_pid integer NOT NULL, transaction_id bigint NOT NULL, session_id uuid NOT NULL,
 token_hash text NOT NULL, PRIMARY KEY(backend_pid)
);
ALTER TABLE educore_r4.transaction_principals OWNER TO educore_r4_owner;
CREATE FUNCTION educore_r4.digest(value text) RETURNS text LANGUAGE sql IMMUTABLE
 SET search_path=pg_catalog,pg_temp AS $$ SELECT encode(sha256(convert_to(value,'UTF8')),'hex') $$;

-- Only possession of a registered, live access token can establish a context.
-- Transaction ID prevents pooled connection state surviving COMMIT/ROLLBACK.
CREATE FUNCTION educore_r4.bind(token text) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE a public.auth_sessions%ROWTYPE;
BEGIN
 SELECT s.* INTO a FROM public.auth_sessions s JOIN public.users u ON u.id=s.user_id AND u.status='ACTIVE'
 WHERE s.access_token_hash=educore_r4.digest(token) AND s.access_expires_at>clock_timestamp()
 AND s.expires_at>clock_timestamp() AND s.revoked_at IS NULL;
 IF a.id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 INSERT INTO educore_r4.transaction_principals VALUES(pg_backend_pid(),txid_current(),a.id,a.access_token_hash)
 ON CONFLICT(backend_pid) DO UPDATE SET transaction_id=EXCLUDED.transaction_id,session_id=EXCLUDED.session_id,token_hash=EXCLUDED.token_hash;
 RETURN a.id;
END $$;
CREATE FUNCTION educore_r4.session_id() RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT a.id FROM educore_r4.transaction_principals b JOIN public.auth_sessions a ON a.id=b.session_id
 JOIN public.users u ON u.id=a.user_id AND u.status='ACTIVE'
 WHERE b.backend_pid=pg_backend_pid() AND b.transaction_id=txid_current() AND b.token_hash=a.access_token_hash
 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND a.access_expires_at>clock_timestamp()
 $$;
-- R2/R3 legacy bindings remain operator-controlled; R4 LOGINs use only the
-- private transaction context. No caller-controlled principal GUC is accepted.
CREATE FUNCTION educore_r4.gateway_sessions() RETURNS SETOF public.r2_principal_bindings LANGUAGE sql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT session_user::text,educore_r4.session_id() WHERE educore_r4.session_id() IS NOT NULL
 UNION ALL SELECT b.* FROM public.r2_principal_bindings b WHERE b.database_role=session_user
 AND NOT pg_has_role(session_user,'educore_r4_api','MEMBER') AND NOT pg_has_role(session_user,'educore_r4_worker','MEMBER')
 $$;
GRANT EXECUTE ON FUNCTION educore_r4.session_id(),educore_r4.gateway_sessions() TO educore_r2_owner,educore_r3_owner;
-- Replace only the principal source in existing gateway definitions. This new
-- migration preserves all existing authorization predicates/locks and owners.
DO $bridge$ DECLARE f record; ddl text; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('educore_r2','educore_r3') AND p.prosrc LIKE '%public.r2_principal_bindings b JOIN public.auth_sessions%'
 LOOP
  ddl:=pg_get_functiondef(f.signature);
  ddl:=replace(ddl,'public.r2_principal_bindings b JOIN public.auth_sessions','educore_r4.gateway_sessions() b JOIN public.auth_sessions');
  EXECUTE ddl;
 END LOOP;
END $bridge$;

CREATE FUNCTION educore_r4.auth_lookup(email text) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT jsonb_build_object('userId',u.id,'passwordHash',c.password_hash) FROM public.users u
 JOIN public.credentials c ON c.user_id=u.id WHERE u.email_normalized=email
 $$;
-- Password verification belongs to trusted AuthService (Argon2id outside DB
-- locks). CAS expected hash prevents concurrent reset/login races. The auth
-- credential has no domain commands, table DML or API principal privileges.
CREATE FUNCTION educore_r4.login(email text,expected_hash text,verified boolean,sid uuid,refresh_hash text,access_hash text,csrf text)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE u public.users%ROWTYPE; c public.credentials%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO u FROM public.users WHERE email_normalized=email FOR UPDATE;
 IF u.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.credentials WHERE user_id=u.id FOR UPDATE;
 IF u.status<>'ACTIVE' OR c.password_hash IS DISTINCT FROM expected_hash OR c.locked_until>clock_timestamp() THEN RETURN NULL; END IF;
 IF NOT verified THEN
  UPDATE public.credentials SET failed_attempts=failed_attempts+1,
  locked_until=CASE WHEN failed_attempts+1>=5 THEN clock_timestamp()+interval '15 minutes' ELSE NULL END WHERE user_id=u.id;
  RETURN NULL;
 END IF;
 UPDATE public.credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=u.id;
 INSERT INTO public.auth_sessions(id,user_id,refresh_token_hash,expires_at,access_token_hash,access_expires_at,csrf_hash)
 VALUES(sid,u.id,refresh_hash,clock_timestamp()+interval '7 days',access_hash,clock_timestamp()+interval '15 minutes',csrf);
 SELECT jsonb_build_object('user',jsonb_build_object('id',u.id,'displayName',u.display_name),
 'allowedTenants',COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name)),'[]'::jsonb)) INTO result
 FROM public.tenant_memberships m JOIN public.tenants t ON t.id=m.tenant_id AND t.status='ACTIVE'
 WHERE m.user_id=u.id AND m.status='ACTIVE' AND m.left_at IS NULL;
 RETURN result;
END $$;
CREATE FUNCTION educore_r4.refresh(old_hash text,csrf text,new_hash text,access_hash text,new_csrf text) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE a public.auth_sessions%ROWTYPE; u uuid;
BEGIN
 SELECT user_id INTO u FROM public.auth_sessions WHERE refresh_token_hash=old_hash
 UNION ALL SELECT s.user_id FROM public.refresh_token_history h JOIN public.auth_sessions s ON s.id=h.session_id WHERE h.token_hash=old_hash LIMIT 1;
 IF u IS NULL THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.users WHERE id=u FOR UPDATE;
 SELECT * INTO a FROM public.auth_sessions WHERE refresh_token_hash=old_hash FOR UPDATE;
 IF a.id IS NULL THEN
  UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id IN
  (SELECT session_id FROM public.refresh_token_history WHERE token_hash=old_hash);
  RETURN NULL;
 END IF;
 IF a.revoked_at IS NOT NULL OR a.expires_at<=clock_timestamp() OR a.csrf_hash IS DISTINCT FROM csrf
 OR NOT EXISTS(SELECT FROM public.users WHERE id=u AND status='ACTIVE') THEN RETURN NULL; END IF;
 INSERT INTO public.refresh_token_history(token_hash,session_id) VALUES(old_hash,a.id);
 UPDATE public.auth_sessions SET refresh_token_hash=new_hash,access_token_hash=access_hash,csrf_hash=new_csrf,
 access_expires_at=LEAST(expires_at,clock_timestamp()+interval '15 minutes'),last_used_at=clock_timestamp() WHERE id=a.id;
 RETURN jsonb_build_object('sessionId',a.id,'userId',a.user_id,'tenantId',a.active_tenant_id,'expiresAt',a.expires_at);
END $$;
-- Refresh lookup is not an authentication decision; rotation always verifies
-- the secret + CSRF under a lock and commits replay revocation on failure.
CREATE FUNCTION educore_r4.refresh_identity(hash text) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT jsonb_build_object('sessionId',id,'userId',user_id,'tenantId',active_tenant_id) FROM public.auth_sessions WHERE refresh_token_hash=hash
 $$;
CREATE FUNCTION educore_r4.me() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE a public.auth_sessions%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO a FROM public.auth_sessions WHERE id=educore_r4.session_id();
 IF a.id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 SELECT jsonb_build_object('id',a.user_id,'sessionId',a.id,'tenantId',a.active_tenant_id,
 'allowedTenants',COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name)),'[]')) INTO result
 FROM public.tenant_memberships m JOIN public.tenants t ON t.id=m.tenant_id AND t.status='ACTIVE'
 WHERE m.user_id=a.user_id AND m.status='ACTIVE' AND m.left_at IS NULL;
 RETURN result;
END $$;
CREATE FUNCTION educore_r4.select_tenant(t uuid,new_access_hash text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE a public.auth_sessions%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.auth_sessions WHERE id=educore_r4.session_id();
 IF a.id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 PERFORM 1 FROM public.users WHERE id=a.user_id FOR UPDATE;
 PERFORM educore_private.r1b_lock_tenant(t);
 IF NOT EXISTS(SELECT FROM public.tenant_memberships m JOIN public.tenants tn ON tn.id=t AND tn.status='ACTIVE'
 WHERE m.tenant_id=t AND m.user_id=a.user_id AND m.status='ACTIVE' AND m.left_at IS NULL)
 THEN RAISE EXCEPTION 'TENANT_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.auth_sessions SET active_tenant_id=t,access_token_hash=new_access_hash,
 access_expires_at=LEAST(expires_at,clock_timestamp()+interval '15 minutes') WHERE id=a.id AND revoked_at IS NULL;
END $$;
CREATE FUNCTION educore_r4.logout() RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE a public.auth_sessions%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.auth_sessions WHERE id=educore_r4.session_id();
 IF a.id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 PERFORM 1 FROM public.users WHERE id=a.user_id FOR UPDATE;
 UPDATE public.auth_sessions SET revoked_at=clock_timestamp() WHERE id=a.id;
END $$;
CREATE FUNCTION educore_r4.request_otp(email text,purpose public."OtpPurpose",hash text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
 SELECT * INTO u FROM public.users WHERE email_normalized=email FOR UPDATE;
 IF u.id IS NULL OR u.status='DISABLED' OR (purpose='ACTIVATION' AND u.status<>'PENDING_ACTIVATION')
 OR (purpose='PASSWORD_RESET' AND u.status<>'ACTIVE') THEN RETURN false; END IF;
 IF EXISTS(SELECT FROM public.password_reset_otps WHERE user_id=u.id AND requested_at>clock_timestamp()-interval '1 minute') THEN RETURN false; END IF;
 UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE user_id=u.id AND consumed_at IS NULL;
 INSERT INTO public.password_reset_otps(id,user_id,purpose,otp_hash,expires_at,max_attempts)
 VALUES(gen_random_uuid(),u.id,purpose,hash,now()+interval '15 minutes',5);
 RETURN true;
END $$;
CREATE FUNCTION educore_r4.reset_password(email text,purpose public."OtpPurpose",hash text,new_password_hash text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE u public.users%ROWTYPE; o public.password_reset_otps%ROWTYPE; t uuid;
BEGIN
 SELECT * INTO u FROM public.users WHERE email_normalized=email FOR UPDATE;
 IF u.id IS NULL OR u.status='DISABLED' THEN RETURN false; END IF;
 SELECT * INTO o FROM public.password_reset_otps WHERE user_id=u.id AND password_reset_otps.purpose=reset_password.purpose
 AND consumed_at IS NULL ORDER BY requested_at DESC LIMIT 1 FOR UPDATE;
 IF o.id IS NULL OR o.expires_at<=clock_timestamp() OR o.attempt_count>=o.max_attempts THEN RETURN false; END IF;
 UPDATE public.password_reset_otps SET attempt_count=attempt_count+1 WHERE id=o.id;
 IF o.otp_hash<>hash THEN RETURN false; END IF;
 FOR t IN SELECT tenant_id FROM public.tenant_memberships WHERE user_id=u.id ORDER BY tenant_id LOOP PERFORM educore_private.r1b_lock_tenant(t); END LOOP;
 INSERT INTO public.credentials(user_id,password_hash,password_changed_at) VALUES(u.id,new_password_hash,clock_timestamp())
 ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,password_changed_at=EXCLUDED.password_changed_at,failed_attempts=0,locked_until=NULL;
 UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE id=o.id;
 UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE user_id=u.id;
 IF purpose='ACTIVATION' AND u.status='PENDING_ACTIVATION' THEN
  UPDATE public.users SET status='ACTIVE',activated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=u.id;
  UPDATE public.tenant_memberships SET status='ACTIVE',updated_at=clock_timestamp() WHERE user_id=u.id AND status='PENDING_ACTIVATION';
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION educore_r4.change_password(expected_hash text,new_hash text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE a public.auth_sessions%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.auth_sessions WHERE id=educore_r4.session_id();
 IF a.id IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.users WHERE id=a.user_id FOR UPDATE;
 IF NOT EXISTS(SELECT FROM public.credentials WHERE user_id=a.user_id AND password_hash=expected_hash) THEN RETURN false; END IF;
 UPDATE public.credentials SET password_hash=new_hash,password_changed_at=clock_timestamp(),failed_attempts=0,locked_until=NULL WHERE user_id=a.user_id;
 UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE user_id=a.user_id;
 RETURN true;
END $$;
DO $owners$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r4'
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP;
END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r4 FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE educore_r4_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.gateway_sessions(),educore_r4.session_id() TO educore_r2_owner,educore_r3_owner;
GRANT EXECUTE ON FUNCTION educore_r4.auth_lookup(text),educore_r4.login(text,text,boolean,uuid,text,text,text),
 educore_r4.refresh(text,text,text,text,text),educore_r4.refresh_identity(text),educore_r4.request_otp(text,public."OtpPurpose",text),
 educore_r4.reset_password(text,public."OtpPurpose",text,text) TO educore_r4_auth;
GRANT EXECUTE ON FUNCTION educore_r4.bind(text),educore_r4.me(),educore_r4.select_tenant(uuid,text),educore_r4.logout(),educore_r4.change_password(text,text) TO educore_r4_api;
GRANT educore_r2_command,educore_r3_command TO educore_r4_api;
CREATE TRIGGER r4_refresh_history BEFORE UPDATE OR DELETE ON public.refresh_token_history FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
COMMIT;
