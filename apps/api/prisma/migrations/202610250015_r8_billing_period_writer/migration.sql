BEGIN;
GRANT INSERT ON public.billing_periods TO educore_r4_owner;
CREATE FUNCTION educore_r4.open_billing_period(t uuid, requested_month date, reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; period_id uuid; frozen_at timestamptz;
BEGIN
  IF requested_month IS NULL OR extract(day FROM requested_month)<>1
    OR length(reason) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'INVALID_PERIOD' USING ERRCODE='22023'; END IF;
  m:=educore_r4.authorize(t,'billing.generate_draft');
  SELECT timezone_frozen_at INTO frozen_at FROM public.tenants WHERE id=t;
  IF frozen_at IS NULL THEN RAISE EXCEPTION 'SOURCE_TIMEZONE_NOT_FROZEN' USING ERRCODE='23514'; END IF;
  INSERT INTO public.billing_periods(id,tenant_id,month_start,month_end,status,updated_at)
  VALUES(gen_random_uuid(),t,requested_month,(requested_month+interval '1 month')::date,'OPEN',clock_timestamp())
  ON CONFLICT(tenant_id,month_start) DO NOTHING RETURNING id INTO period_id;
  IF period_id IS NULL THEN
    SELECT id INTO period_id FROM public.billing_periods WHERE tenant_id=t AND month_start=requested_month;
  ELSE
    PERFORM educore_r4.audit(t,m,'BILLING_PERIOD_OPENED',period_id,reason,
      jsonb_build_object('monthStart',requested_month,'timezoneFrozenAt',frozen_at),NULL,educore_r4.correlation());
  END IF;
  RETURN jsonb_build_object('id',period_id,'monthStart',requested_month);
END $$;
ALTER FUNCTION educore_r4.open_billing_period(uuid,date,text) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.open_billing_period(uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.open_billing_period(uuid,date,text) TO educore_r4_api;
COMMIT;
