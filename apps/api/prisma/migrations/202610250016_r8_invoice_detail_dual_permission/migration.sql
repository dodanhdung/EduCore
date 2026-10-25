BEGIN;
-- Tighten the issued-detail projection without changing draft review or list
-- permissions. Both checks use the invoice's student within the selected tenant.
DO $migration$ DECLARE ddl text; old_check text; new_check text; BEGIN
  ddl:=pg_get_functiondef('educore_r4.billing_read(uuid,text,uuid,int,int)'::regprocedure);
  old_check:='m:=educore_r4.authorize(t,''billing.read'',NULL,invoice_row.student_id);';
  new_check:=old_check||E'\n    IF kind=''INVOICE'' THEN\n      PERFORM educore_r4.authorize(t,''invoice.read'',NULL,invoice_row.student_id);\n    END IF;';
  IF position(old_check IN ddl)=0
    OR position(old_check IN substring(ddl FROM position(old_check IN ddl)+length(old_check)))>0
    OR position('IF kind=''INVOICE'' THEN' IN ddl)>0 THEN
    RAISE EXCEPTION 'BILLING_READ_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
  EXECUTE replace(ddl,old_check,new_check);
END $migration$;
COMMIT;
