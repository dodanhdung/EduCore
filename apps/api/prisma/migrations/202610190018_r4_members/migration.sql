BEGIN;
CREATE FUNCTION educore_r4.create_member(t uuid,email text,display_name text,reason text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE actor_user uuid; target_user uuid; lock_user uuid; m uuid; target_status public."UserStatus"; member uuid:=gen_random_uuid();
BEGIN
 IF email<>lower(btrim(email)) OR email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR COALESCE(length(btrim(display_name)),0) NOT BETWEEN 1 AND 200 OR COALESCE(length(btrim(reason)),0)=0
 THEN RAISE EXCEPTION 'INVALID_MEMBER' USING ERRCODE='22023'; END IF;
 SELECT user_id INTO actor_user FROM public.auth_sessions WHERE id=educore_r4.session_id();
 SELECT id INTO target_user FROM public.users WHERE email_normalized=email;
 FOR lock_user IN SELECT DISTINCT x FROM unnest(ARRAY[actor_user,target_user]) x WHERE x IS NOT NULL ORDER BY x LOOP PERFORM 1 FROM public.users WHERE id=lock_user FOR SHARE; END LOOP;
 m:=educore_r4.authorize(t,'member.create');
 IF target_user IS NULL THEN
  target_user:=gen_random_uuid();
  INSERT INTO public.users(id,email_normalized,display_name,status,updated_at) VALUES(target_user,email,display_name,'PENDING_ACTIVATION',clock_timestamp()) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONCURRENT_IDENTITY_RETRY_REQUIRED' USING ERRCODE='40001'; END IF;
 ELSE
  SELECT status INTO target_status FROM public.users WHERE id=target_user;
  IF target_status='DISABLED' THEN RAISE EXCEPTION 'IDENTITY_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO public.tenant_memberships(id,tenant_id,user_id,status,updated_at)
 VALUES(member,t,target_user,CASE WHEN target_status='ACTIVE' THEN 'ACTIVE' ELSE 'PENDING_ACTIVATION' END,clock_timestamp());
 PERFORM educore_r4.audit(t,m,'MEMBER_CREATED',member,reason,jsonb_build_object('membershipId',member));
 RETURN jsonb_build_object('id',member,'status',CASE WHEN target_status='ACTIVE' THEN 'ACTIVE' ELSE 'PENDING_ACTIVATION' END);
END $$;
ALTER FUNCTION educore_r4.create_member(uuid,text,text,text) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.create_member(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.create_member(uuid,text,text,text) TO educore_r4_api;
COMMIT;
