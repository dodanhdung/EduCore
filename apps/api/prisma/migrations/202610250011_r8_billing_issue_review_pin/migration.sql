BEGIN;
-- A browser may review generation G1 while another authorized operator creates
-- G2. Keep the reviewed ID in the same R2 ISSUE transaction as its source locks.
DO $pin$ DECLARE ddl text; BEGIN
  ddl:=pg_get_functiondef('educore_r2.execute(uuid,jsonb)'::regprocedure);
  IF position('SELECT gen.* INTO g FROM public.billing_runs br JOIN public.billing_run_generations gen' IN ddl)=0
    OR position('IF g.id IS NULL OR g.id IS DISTINCT FROM (SELECT id FROM public.billing_run_generations' IN ddl)=0 THEN
    RAISE EXCEPTION 'R2_ISSUE_BASELINE_MISMATCH' USING ERRCODE='23514';
  END IF;
  ddl:=replace(ddl,
    'IF g.id IS NULL OR g.id IS DISTINCT FROM (SELECT id FROM public.billing_run_generations',
    'IF body ? ''expectedGenerationId'' AND (body->>''expectedGenerationId'')::uuid IS DISTINCT FROM g.id THEN RAISE EXCEPTION ''STALE_REVIEWED_GENERATION'' USING ERRCODE=''40001''; END IF;
   IF g.id IS NULL OR g.id IS DISTINCT FROM (SELECT id FROM public.billing_run_generations');
  EXECUTE ddl;
END $pin$;
REVOKE ALL ON FUNCTION educore_r2.execute(uuid,jsonb) FROM PUBLIC;
COMMIT;
