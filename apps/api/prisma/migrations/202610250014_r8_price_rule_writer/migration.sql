BEGIN;
GRANT INSERT ON public.price_rules TO educore_r4_owner;
CREATE FUNCTION educore_r4.create_price_rule(t uuid, body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; price public.price_rules%ROWTYPE; receipt public.idempotency_records%ROWTYPE;
  scope text; target uuid; amount numeric; from_date date; to_date date; policy uuid; hash text; value jsonb;
BEGIN
  IF jsonb_typeof(body)<>'object' OR body - ARRAY['scope','targetId','amountVnd','effectiveFrom','effectiveTo','reason','key'] <> '{}'::jsonb
    OR length(body->>'key') NOT BETWEEN 1 AND 200 OR length(body->>'reason') NOT BETWEEN 1 AND 2000
    OR body->>'scope' NOT IN ('SESSION','CLASS','COURSE')
    OR body->>'effectiveFrom' !~ '^\d{4}-\d{2}-\d{2}$'
    OR (body->>'effectiveTo' IS NOT NULL AND body->>'effectiveTo' !~ '^\d{4}-\d{2}-\d{2}$')
    OR body->>'amountVnd' !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'INVALID_PRICE_RULE' USING ERRCODE='22023'; END IF;
  scope:=body->>'scope'; target:=(body->>'targetId')::uuid;
  from_date:=(body->>'effectiveFrom')::date; to_date:=(body->>'effectiveTo')::date;
  amount:=(body->>'amountVnd')::numeric;
  IF amount>9223372036854775807 OR (to_date IS NOT NULL AND to_date<=from_date) THEN
    RAISE EXCEPTION 'INVALID_PRICE_RULE' USING ERRCODE='22023'; END IF;
  m:=educore_r4.authorize(t,'pricing.manage');
  IF NOT ((scope='SESSION' AND EXISTS(SELECT FROM public.class_sessions s WHERE s.tenant_id=t AND s.id=target))
    OR (scope='CLASS' AND EXISTS(SELECT FROM public.classes c WHERE c.tenant_id=t AND c.id=target))
    OR (scope='COURSE' AND EXISTS(SELECT FROM public.courses c WHERE c.tenant_id=t AND c.id=target))) THEN
    RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  hash:=encode(sha256(convert_to(body::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM public.idempotency_records WHERE tenant_id=t
    AND operation_type='R8:PRICE_RULE' AND idempotency_key=body->>'key';
  IF receipt.id IS NOT NULL THEN
    IF receipt.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
    RETURN receipt.result_snapshot;
  END IF;
  policy:=educore_r4.policy(t);
  INSERT INTO public.price_rules(id,tenant_id,scope_kind,course_id,class_id,session_id,
    unit_price_vnd,effective_from,effective_to,policy_version_id,created_by_membership_id,updated_at)
  VALUES(gen_random_uuid(),t,scope::public."PriceScopeKind",
    CASE WHEN scope='COURSE' THEN target END,CASE WHEN scope='CLASS' THEN target END,
    CASE WHEN scope='SESSION' THEN target END,amount::bigint,from_date,to_date,policy,m,clock_timestamp())
  RETURNING * INTO price;
  value:=jsonb_build_object('id',price.id,'scope',scope,'targetId',target,
    'amountVnd',price.unit_price_vnd::text,'effectiveFrom',price.effective_from,
    'effectiveTo',price.effective_to,'policyVersionId',policy);
  INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,
    request_hash,status,result_ref_type,result_ref_id,result_snapshot,updated_at)
  VALUES(gen_random_uuid(),t,'R8:PRICE_RULE',body->>'key',hash,'COMPLETED','PriceRule',price.id,value,clock_timestamp());
  PERFORM educore_r4.audit(t,m,'PRICE_RULE_CREATED',price.id,body->>'reason',value,policy,educore_r4.correlation());
  RETURN value;
END $$;
ALTER FUNCTION educore_r4.create_price_rule(uuid,jsonb) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.create_price_rule(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.create_price_rule(uuid,jsonb) TO educore_r4_api;
COMMIT;
