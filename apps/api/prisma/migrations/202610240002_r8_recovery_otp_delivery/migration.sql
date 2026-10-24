BEGIN;
CREATE ROLE educore_r4_otp_delivery NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA educore_r4 TO educore_r4_otp_delivery;
CREATE UNIQUE INDEX r8_otp_id_purpose_uq ON public.password_reset_otps(id,purpose);
CREATE TABLE educore_r4.recovery_otp_deliveries (
 otp_id uuid PRIMARY KEY,
 purpose public."OtpPurpose" NOT NULL DEFAULT 'PASSWORD_RESET',
 status text NOT NULL DEFAULT 'READY',
 key_id text, nonce bytea, ciphertext bytea, tag bytea,
 attempt_count integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz(6) DEFAULT clock_timestamp(),
 lease_owner uuid, lease_until timestamptz(6),
 fencing_token bigint NOT NULL DEFAULT 0,
 last_error_code text,
 created_at timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz(6),
 CONSTRAINT recovery_purpose CHECK (purpose='PASSWORD_RESET'),
 CONSTRAINT recovery_otp_purpose_fk FOREIGN KEY (otp_id,purpose)
  REFERENCES public.password_reset_otps(id,purpose) ON DELETE RESTRICT,
 CONSTRAINT recovery_status CHECK (status IN ('READY','RETRY_WAIT','SENDING','ACCEPTED_BY_SMTP','FAILED','CANCELLED','EXPIRED')),
 CONSTRAINT recovery_attempts CHECK (attempt_count BETWEEN 0 AND 4),
 CONSTRAINT recovery_fence CHECK (fencing_token>=0),
 CONSTRAINT recovery_active_attempt CHECK ((status<>'READY' OR attempt_count=0) AND (status<>'SENDING' OR (attempt_count>=1 AND fencing_token>=1))),
 CONSTRAINT recovery_error CHECK (last_error_code IS NULL OR last_error_code IN
  ('SMTP_TRANSIENT','SMTP_PERMANENT','SMTP_TIMEOUT_UNKNOWN','LEASE_LOST','KEY_UNAVAILABLE','CONFIG_UNAVAILABLE','RECIPIENT_CHANGED','USER_STATE_CHANGED','OTP_INVALIDATED','DELIVERY_WINDOW_CLOSED')),
 CONSTRAINT recovery_terminal_error CHECK ((status<>'FAILED' OR last_error_code IS NOT NULL) AND (status<>'ACCEPTED_BY_SMTP' OR last_error_code IS NULL)),
 CONSTRAINT recovery_shape CHECK (
  (status IN ('READY','RETRY_WAIT') AND next_attempt_at IS NOT NULL AND lease_owner IS NULL AND lease_until IS NULL AND completed_at IS NULL)
  OR (status='SENDING' AND next_attempt_at IS NULL AND lease_owner IS NOT NULL AND lease_until IS NOT NULL AND completed_at IS NULL)
  OR (status IN ('ACCEPTED_BY_SMTP','FAILED','CANCELLED','EXPIRED') AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_until IS NULL AND completed_at IS NOT NULL)),
 CONSTRAINT recovery_cipher_shape CHECK (
  (status IN ('READY','RETRY_WAIT','SENDING') AND key_id IS NOT NULL AND key_id ~ '^[A-Za-z0-9._-]{1,64}$'
   AND nonce IS NOT NULL AND octet_length(nonce)=12 AND ciphertext IS NOT NULL AND octet_length(ciphertext) BETWEEN 10 AND 1033
   AND tag IS NOT NULL AND octet_length(tag)=16)
  OR (status IN ('ACCEPTED_BY_SMTP','FAILED','CANCELLED','EXPIRED') AND key_id IS NULL AND nonce IS NULL AND ciphertext IS NULL AND tag IS NULL))
);
ALTER TABLE educore_r4.recovery_otp_deliveries OWNER TO educore_r4_owner;
REVOKE ALL ON TABLE educore_r4.recovery_otp_deliveries FROM PUBLIC;
CREATE INDEX recovery_ready_idx ON educore_r4.recovery_otp_deliveries(next_attempt_at,otp_id) WHERE status IN ('READY','RETRY_WAIT');
CREATE INDEX recovery_lease_idx ON educore_r4.recovery_otp_deliveries(lease_until,otp_id) WHERE status='SENDING';
CREATE INDEX recovery_terminal_idx ON educore_r4.recovery_otp_deliveries(completed_at) WHERE status IN ('ACCEPTED_BY_SMTP','FAILED','CANCELLED','EXPIRED');

-- Preserve the existing activation path exactly; reject the legacy recovery path.
CREATE OR REPLACE FUNCTION educore_r4.request_otp(email text,purpose public."OtpPurpose",hash text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
 IF purpose IS DISTINCT FROM 'ACTIVATION' THEN RAISE EXCEPTION 'LEGACY_RECOVERY_DISABLED' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM public.users WHERE email_normalized=email FOR UPDATE;
 IF u.id IS NULL OR u.status='DISABLED' OR u.status<>'PENDING_ACTIVATION' THEN RETURN false; END IF;
 IF EXISTS(SELECT FROM public.password_reset_otps WHERE user_id=u.id AND requested_at>clock_timestamp()-interval '1 minute') THEN RETURN false; END IF;
 UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE user_id=u.id AND consumed_at IS NULL;
 INSERT INTO public.password_reset_otps(id,user_id,purpose,otp_hash,expires_at,max_attempts)
 VALUES(gen_random_uuid(),u.id,purpose,hash,now()+interval '15 minutes',5);
 RETURN true;
END $$;

CREATE FUNCTION educore_r4.request_recovery_otp(email text,otp_id uuid,otp_hash text,key_id text,nonce bytea,ciphertext bytea,tag bytea)
 RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp SET lock_timeout='3s' AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
 IF email IS NULL OR email<>lower(btrim(email)) OR octet_length(email)>1024 OR
    otp_id IS NULL OR otp_hash !~ '^[0-9a-f]{64}$' OR
    key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR octet_length(nonce)<>12 OR
    octet_length(ciphertext) NOT BETWEEN 10 AND 1033 OR octet_length(tag)<>16 THEN
  RAISE EXCEPTION 'INVALID_RECOVERY_ENVELOPE' USING ERRCODE='22023'; END IF;
 SELECT * INTO u FROM public.users WHERE email_normalized=email FOR UPDATE SKIP LOCKED;
 IF u.id IS NULL OR u.status<>'ACTIVE' THEN RETURN false; END IF;
 IF EXISTS(SELECT FROM public.password_reset_otps o WHERE o.user_id=u.id AND o.requested_at>clock_timestamp()-interval '1 minute') THEN RETURN false; END IF;
 UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE user_id=u.id AND consumed_at IS NULL;
 INSERT INTO public.password_reset_otps(id,user_id,purpose,otp_hash,expires_at,max_attempts)
 VALUES(otp_id,u.id,'PASSWORD_RESET',otp_hash,now()+interval '15 minutes',5);
 INSERT INTO educore_r4.recovery_otp_deliveries(otp_id,purpose,key_id,nonce,ciphertext,tag)
 VALUES(otp_id,'PASSWORD_RESET',key_id,nonce,ciphertext,tag);
 RETURN true;
END $$;

CREATE FUNCTION educore_r4.cancel_recovery_delivery_on_otp_invalidation() RETURNS trigger
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 UPDATE educore_r4.recovery_otp_deliveries SET status='CANCELLED',last_error_code='OTP_INVALIDATED',
  key_id=NULL,nonce=NULL,ciphertext=NULL,tag=NULL,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
  fencing_token=fencing_token+1,updated_at=clock_timestamp(),completed_at=clock_timestamp()
 WHERE otp_id=NEW.id AND status IN ('READY','RETRY_WAIT','SENDING');
 RETURN NEW;
END $$;
CREATE FUNCTION educore_r4.cancel_recovery_delivery_on_user_change() RETURNS trigger
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 UPDATE educore_r4.recovery_otp_deliveries d SET status='CANCELLED',
  last_error_code=CASE WHEN OLD.email_normalized IS DISTINCT FROM NEW.email_normalized THEN 'RECIPIENT_CHANGED' ELSE 'USER_STATE_CHANGED' END,
  key_id=NULL,nonce=NULL,ciphertext=NULL,tag=NULL,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
  fencing_token=d.fencing_token+1,updated_at=clock_timestamp(),completed_at=clock_timestamp()
 FROM public.password_reset_otps o WHERE d.otp_id=o.id AND o.user_id=NEW.id AND d.status IN ('READY','RETRY_WAIT','SENDING');
 RETURN NEW;
END $$;
CREATE TRIGGER r8_cancel_recovery_delivery_on_otp_invalidation
 AFTER UPDATE OF consumed_at,attempt_count ON public.password_reset_otps
 FOR EACH ROW WHEN ((OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL)
  OR (OLD.attempt_count<OLD.max_attempts AND NEW.attempt_count>=NEW.max_attempts))
 EXECUTE FUNCTION educore_r4.cancel_recovery_delivery_on_otp_invalidation();
CREATE TRIGGER r8_cancel_recovery_delivery_on_user_change
 AFTER UPDATE OF status,email_normalized ON public.users FOR EACH ROW
 WHEN (OLD.email_normalized IS DISTINCT FROM NEW.email_normalized OR (OLD.status='ACTIVE' AND NEW.status<>'ACTIVE'))
 EXECUTE FUNCTION educore_r4.cancel_recovery_delivery_on_user_change();

-- All worker functions read the candidate without a lock, then lock user -> OTP -> task.
CREATE FUNCTION educore_r4.claim_recovery_delivery(worker_id uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp SET lock_timeout='3s' AS $$
DECLARE candidate record; u public.users%ROWTYPE; o public.password_reset_otps%ROWTYPE;
 d educore_r4.recovery_otp_deliveries%ROWTYPE; latest uuid;
BEGIN
 IF worker_id IS NULL THEN RAISE EXCEPTION 'INVALID_WORKER' USING ERRCODE='22023'; END IF;
 FOR candidate IN SELECT q.otp_id,po.user_id FROM educore_r4.recovery_otp_deliveries q
  JOIN public.password_reset_otps po ON po.id=q.otp_id
  WHERE q.status IN ('READY','RETRY_WAIT') AND q.next_attempt_at<=clock_timestamp()
  ORDER BY q.next_attempt_at,q.otp_id LIMIT 100 LOOP
  SELECT * INTO u FROM public.users WHERE id=candidate.user_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO o FROM public.password_reset_otps WHERE id=candidate.otp_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO d FROM educore_r4.recovery_otp_deliveries WHERE otp_id=candidate.otp_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR d.status NOT IN ('READY','RETRY_WAIT') OR d.next_attempt_at>clock_timestamp() THEN CONTINUE; END IF;
  SELECT id INTO latest FROM public.password_reset_otps WHERE user_id=o.user_id AND consumed_at IS NULL
    ORDER BY requested_at DESC,id DESC LIMIT 1;
  IF u.status<>'ACTIVE' OR o.user_id<>u.id OR o.purpose<>'PASSWORD_RESET' OR d.purpose<>o.purpose OR
     o.consumed_at IS NOT NULL OR o.attempt_count>=o.max_attempts OR latest IS DISTINCT FROM o.id THEN
   UPDATE educore_r4.recovery_otp_deliveries SET status='CANCELLED',last_error_code='OTP_INVALIDATED',
    key_id=NULL,nonce=NULL,ciphertext=NULL,tag=NULL,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
    fencing_token=fencing_token+1,updated_at=clock_timestamp(),completed_at=clock_timestamp() WHERE otp_id=o.id;
   CONTINUE;
  END IF;
  IF clock_timestamp()+interval '75 seconds'>=o.expires_at THEN
   UPDATE educore_r4.recovery_otp_deliveries SET status=CASE WHEN clock_timestamp()>=o.expires_at THEN 'EXPIRED' ELSE 'FAILED' END,
    last_error_code=CASE WHEN clock_timestamp()>=o.expires_at THEN NULL ELSE 'DELIVERY_WINDOW_CLOSED' END,
    key_id=NULL,nonce=NULL,ciphertext=NULL,tag=NULL,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
    fencing_token=fencing_token+1,updated_at=clock_timestamp(),completed_at=clock_timestamp() WHERE otp_id=o.id;
   CONTINUE;
  END IF;
  UPDATE educore_r4.recovery_otp_deliveries SET status='SENDING',attempt_count=attempt_count+1,
   fencing_token=fencing_token+1,lease_owner=worker_id,lease_until=clock_timestamp()+interval '90 seconds',
   next_attempt_at=NULL,updated_at=clock_timestamp() WHERE otp_id=o.id RETURNING * INTO d;
  RETURN jsonb_build_object('otpId',d.otp_id,'purpose',d.purpose,'recipient',u.email_normalized,
   'keyId',d.key_id,'nonce',encode(d.nonce,'base64'),'ciphertext',encode(d.ciphertext,'base64'),
   'tag',encode(d.tag,'base64'),'fence',d.fencing_token::text,'expiresAt',o.expires_at);
 END LOOP;
 RETURN NULL;
END $$;

CREATE FUNCTION educore_r4.check_recovery_delivery(otp_id uuid,worker_id uuid,fence bigint,expected_email text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp SET lock_timeout='3s' AS $$
DECLARE identity record; u public.users%ROWTYPE; o public.password_reset_otps%ROWTYPE;
 d educore_r4.recovery_otp_deliveries%ROWTYPE; latest uuid;
BEGIN
 SELECT p.user_id INTO identity FROM public.password_reset_otps p WHERE p.id=otp_id;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO u FROM public.users WHERE id=identity.user_id FOR UPDATE;
 SELECT * INTO o FROM public.password_reset_otps WHERE id=otp_id FOR UPDATE;
 SELECT * INTO d FROM educore_r4.recovery_otp_deliveries WHERE recovery_otp_deliveries.otp_id=check_recovery_delivery.otp_id FOR UPDATE;
 IF d.status<>'SENDING' OR d.lease_owner IS DISTINCT FROM worker_id OR d.fencing_token IS DISTINCT FROM fence
  OR d.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 SELECT id INTO latest FROM public.password_reset_otps WHERE user_id=o.user_id AND consumed_at IS NULL ORDER BY requested_at DESC,id DESC LIMIT 1;
 IF u.status<>'ACTIVE' OR u.email_normalized IS DISTINCT FROM expected_email OR o.purpose<>'PASSWORD_RESET'
  OR d.purpose<>o.purpose OR o.consumed_at IS NOT NULL OR o.attempt_count>=o.max_attempts
  OR latest IS DISTINCT FROM o.id THEN
  UPDATE educore_r4.recovery_otp_deliveries SET status='CANCELLED',
   last_error_code=CASE WHEN u.email_normalized IS DISTINCT FROM expected_email THEN 'RECIPIENT_CHANGED' ELSE 'OTP_INVALIDATED' END,
   key_id=NULL,nonce=NULL,ciphertext=NULL,tag=NULL,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
   fencing_token=fencing_token+1,updated_at=clock_timestamp(),completed_at=clock_timestamp() WHERE recovery_otp_deliveries.otp_id=o.id;
  RETURN false;
 END IF;
 IF clock_timestamp()+interval '75 seconds'>=o.expires_at THEN
  UPDATE educore_r4.recovery_otp_deliveries SET status=CASE WHEN clock_timestamp()>=o.expires_at THEN 'EXPIRED' ELSE 'FAILED' END,
   last_error_code=CASE WHEN clock_timestamp()>=o.expires_at THEN NULL ELSE 'DELIVERY_WINDOW_CLOSED' END,
   key_id=NULL,nonce=NULL,ciphertext=NULL,tag=NULL,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
   fencing_token=fencing_token+1,updated_at=clock_timestamp(),completed_at=clock_timestamp() WHERE recovery_otp_deliveries.otp_id=o.id;
  RETURN false;
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION educore_r4.finish_recovery_delivery(otp_id uuid,worker_id uuid,fence bigint,expected_email text,outcome text,error_code text) RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp SET lock_timeout='3s' AS $$
DECLARE identity record; u public.users%ROWTYPE; o public.password_reset_otps%ROWTYPE;
 d educore_r4.recovery_otp_deliveries%ROWTYPE; latest uuid; next_delay interval; final_status text; final_error text;
BEGIN
 IF outcome NOT IN ('SMTP_ACCEPTED','TRANSIENT','PERMANENT','UNKNOWN','RECIPIENT_MISMATCH') THEN
  RAISE EXCEPTION 'INVALID_OUTCOME' USING ERRCODE='22023'; END IF;
 IF error_code IS NOT NULL AND error_code NOT IN ('SMTP_TRANSIENT','SMTP_PERMANENT','SMTP_TIMEOUT_UNKNOWN','KEY_UNAVAILABLE','CONFIG_UNAVAILABLE','RECIPIENT_CHANGED') THEN
  RAISE EXCEPTION 'INVALID_ERROR_CODE' USING ERRCODE='22023'; END IF;
 SELECT p.user_id INTO identity FROM public.password_reset_otps p WHERE p.id=otp_id;
 IF NOT FOUND THEN RETURN 'STALE'; END IF;
 SELECT * INTO u FROM public.users WHERE id=identity.user_id FOR UPDATE;
 SELECT * INTO o FROM public.password_reset_otps WHERE id=otp_id FOR UPDATE;
 SELECT * INTO d FROM educore_r4.recovery_otp_deliveries WHERE recovery_otp_deliveries.otp_id=finish_recovery_delivery.otp_id FOR UPDATE;
 IF d.status<>'SENDING' OR d.lease_owner IS DISTINCT FROM worker_id OR d.fencing_token IS DISTINCT FROM fence
  OR d.lease_until<=clock_timestamp() THEN RETURN 'STALE'; END IF;
 SELECT id INTO latest FROM public.password_reset_otps WHERE user_id=o.user_id AND consumed_at IS NULL ORDER BY requested_at DESC,id DESC LIMIT 1;
 IF u.status<>'ACTIVE' OR u.email_normalized IS DISTINCT FROM expected_email OR outcome='RECIPIENT_MISMATCH'
  OR o.purpose<>'PASSWORD_RESET' OR d.purpose<>o.purpose OR o.consumed_at IS NOT NULL
  OR o.attempt_count>=o.max_attempts OR latest IS DISTINCT FROM o.id THEN
  final_status:='CANCELLED';
  final_error:=CASE WHEN u.email_normalized IS DISTINCT FROM expected_email OR outcome='RECIPIENT_MISMATCH' THEN 'RECIPIENT_CHANGED' ELSE 'OTP_INVALIDATED' END;
 ELSIF clock_timestamp()>=o.expires_at THEN final_status:='EXPIRED'; final_error:=NULL;
 ELSIF outcome='SMTP_ACCEPTED' THEN final_status:='ACCEPTED_BY_SMTP'; final_error:=NULL;
 ELSIF outcome='PERMANENT' OR d.attempt_count>=4 THEN
  final_status:='FAILED'; final_error:=COALESCE(error_code,'SMTP_PERMANENT');
 ELSE
  next_delay:=CASE d.attempt_count WHEN 1 THEN interval '1 minute' WHEN 2 THEN interval '3 minutes' ELSE interval '5 minutes' END;
  IF clock_timestamp()+next_delay+interval '75 seconds'>=o.expires_at THEN
   final_status:='FAILED'; final_error:='DELIVERY_WINDOW_CLOSED';
  ELSE final_status:='RETRY_WAIT'; final_error:=COALESCE(error_code,'SMTP_TRANSIENT'); END IF;
 END IF;
 IF final_status='RETRY_WAIT' THEN
  UPDATE educore_r4.recovery_otp_deliveries SET status=final_status,last_error_code=final_error,
   next_attempt_at=clock_timestamp()+next_delay,lease_owner=NULL,lease_until=NULL,
   fencing_token=fencing_token+1,updated_at=clock_timestamp() WHERE recovery_otp_deliveries.otp_id=o.id;
 ELSE
  UPDATE educore_r4.recovery_otp_deliveries SET status=final_status,last_error_code=final_error,
   key_id=NULL,nonce=NULL,ciphertext=NULL,tag=NULL,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
   fencing_token=fencing_token+1,updated_at=clock_timestamp(),completed_at=clock_timestamp() WHERE recovery_otp_deliveries.otp_id=o.id;
 END IF;
 RETURN final_status;
END $$;

CREATE FUNCTION educore_r4.sweep_recovery_deliveries(max_rows integer) RETURNS integer
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp SET lock_timeout='3s' AS $$
DECLARE candidate record; u public.users%ROWTYPE; o public.password_reset_otps%ROWTYPE;
 d educore_r4.recovery_otp_deliveries%ROWTYPE; latest uuid; delay interval; changed integer:=0; target_status text; target_error text;
BEGIN
 IF max_rows NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INVALID_SWEEP_LIMIT' USING ERRCODE='22023'; END IF;
 FOR candidate IN SELECT q.otp_id,po.user_id FROM educore_r4.recovery_otp_deliveries q
  JOIN public.password_reset_otps po ON po.id=q.otp_id
  WHERE (q.status='SENDING' AND q.lease_until<=clock_timestamp())
   OR (q.status IN ('READY','RETRY_WAIT') AND po.expires_at<=clock_timestamp())
   OR (q.status IN ('READY','RETRY_WAIT','SENDING') AND EXISTS
      (SELECT FROM public.users su WHERE su.id=po.user_id AND su.status<>'ACTIVE'))
  ORDER BY q.created_at,q.otp_id LIMIT max_rows LOOP
  SELECT * INTO u FROM public.users WHERE id=candidate.user_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO o FROM public.password_reset_otps WHERE id=candidate.otp_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO d FROM educore_r4.recovery_otp_deliveries WHERE otp_id=candidate.otp_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR d.status NOT IN ('READY','RETRY_WAIT','SENDING') THEN CONTINUE; END IF;
  SELECT id INTO latest FROM public.password_reset_otps WHERE user_id=o.user_id AND consumed_at IS NULL ORDER BY requested_at DESC,id DESC LIMIT 1;
  IF u.status<>'ACTIVE' OR o.consumed_at IS NOT NULL OR o.attempt_count>=o.max_attempts OR latest IS DISTINCT FROM o.id THEN
   target_status:='CANCELLED'; target_error:=CASE WHEN u.status<>'ACTIVE' THEN 'USER_STATE_CHANGED' ELSE 'OTP_INVALIDATED' END;
  ELSIF clock_timestamp()>=o.expires_at THEN target_status:='EXPIRED'; target_error:=NULL;
  ELSIF d.status='SENDING' AND d.lease_until<=clock_timestamp() THEN
   delay:=CASE d.attempt_count WHEN 1 THEN interval '1 minute' WHEN 2 THEN interval '3 minutes' ELSE interval '5 minutes' END;
   IF d.attempt_count>=4 OR clock_timestamp()+delay+interval '75 seconds'>=o.expires_at THEN
    target_status:='FAILED'; target_error:=CASE WHEN d.attempt_count>=4 THEN 'LEASE_LOST' ELSE 'DELIVERY_WINDOW_CLOSED' END;
   ELSE target_status:='RETRY_WAIT'; target_error:='SMTP_TIMEOUT_UNKNOWN'; END IF;
  ELSE CONTINUE; END IF;
  IF target_status='RETRY_WAIT' THEN
   UPDATE educore_r4.recovery_otp_deliveries SET status=target_status,last_error_code=target_error,
    next_attempt_at=clock_timestamp()+delay,lease_owner=NULL,lease_until=NULL,fencing_token=fencing_token+1,
    updated_at=clock_timestamp() WHERE otp_id=o.id;
  ELSE
   UPDATE educore_r4.recovery_otp_deliveries SET status=target_status,last_error_code=target_error,
    key_id=NULL,nonce=NULL,ciphertext=NULL,tag=NULL,next_attempt_at=NULL,lease_owner=NULL,lease_until=NULL,
    fencing_token=fencing_token+1,updated_at=clock_timestamp(),completed_at=clock_timestamp() WHERE otp_id=o.id;
  END IF;
  changed:=changed+1;
 END LOOP;
 DELETE FROM educore_r4.recovery_otp_deliveries WHERE otp_id IN
  (SELECT otp_id FROM educore_r4.recovery_otp_deliveries WHERE completed_at<clock_timestamp()-interval '7 days'
   AND status IN ('ACCEPTED_BY_SMTP','FAILED','CANCELLED','EXPIRED') ORDER BY completed_at LIMIT max_rows FOR UPDATE SKIP LOCKED);
 RETURN changed;
END $$;

ALTER FUNCTION educore_r4.request_recovery_otp(text,uuid,text,text,bytea,bytea,bytea) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.claim_recovery_delivery(uuid) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.check_recovery_delivery(uuid,uuid,bigint,text) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finish_recovery_delivery(uuid,uuid,bigint,text,text,text) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.sweep_recovery_deliveries(integer) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.cancel_recovery_delivery_on_otp_invalidation() OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.cancel_recovery_delivery_on_user_change() OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.request_recovery_otp(text,uuid,text,text,bytea,bytea,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.claim_recovery_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.check_recovery_delivery(uuid,uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finish_recovery_delivery(uuid,uuid,bigint,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.sweep_recovery_deliveries(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.cancel_recovery_delivery_on_otp_invalidation() FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.cancel_recovery_delivery_on_user_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.request_recovery_otp(text,uuid,text,text,bytea,bytea,bytea) TO educore_r4_auth;
GRANT EXECUTE ON FUNCTION educore_r4.claim_recovery_delivery(uuid),
 educore_r4.check_recovery_delivery(uuid,uuid,bigint,text),
 educore_r4.finish_recovery_delivery(uuid,uuid,bigint,text,text,text),
 educore_r4.sweep_recovery_deliveries(integer) TO educore_r4_otp_delivery;
COMMIT;
