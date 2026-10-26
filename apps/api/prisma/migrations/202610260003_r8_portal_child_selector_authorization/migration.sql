BEGIN;

-- A verified Parent link and Parent student scope are necessary but insufficient
-- to disclose a child's identity. Recheck current child-facing read authority.
DO $selector$
DECLARE
  ddl text;
  old_predicate text := $old$AND (sc.scope_kind='TENANT' OR (sc.scope_kind='STUDENT' AND sc.student_id=s.id)));$old$;
  new_predicate text := $new$AND (sc.scope_kind='TENANT' OR (sc.scope_kind='STUDENT' AND sc.student_id=s.id)))
    AND (educore_r4.has_permission(t,m,'schedule.read',NULL,s.id)
      OR educore_r4.has_permission(t,m,'attendance.read',NULL,s.id)
      OR educore_r4.has_permission(t,m,'absence.read',NULL,s.id)
      OR educore_r4.has_permission(t,m,'assignment.read',NULL,s.id)
      OR educore_r4.has_permission(t,m,'grade.read_published',NULL,s.id)
      OR (educore_r4.has_permission(t,m,'invoice.read',NULL,s.id)
        AND educore_r4.has_permission(t,m,'receivable.read',NULL,s.id)));$new$;
BEGIN
  ddl := pg_get_functiondef('educore_r4.portal_read(uuid,text,uuid)'::regprocedure);
  IF length(ddl)-length(replace(ddl,old_predicate,''))<>length(old_predicate) THEN
    RAISE EXCEPTION 'PORTAL_SELECTOR_BASELINE_MISMATCH' USING ERRCODE='23514';
  END IF;
  EXECUTE replace(ddl,old_predicate,new_predicate);
END $selector$;

ALTER FUNCTION educore_r4.portal_read(uuid,text,uuid) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.portal_read(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.portal_read(uuid,text,uuid) TO educore_r4_api;
COMMIT;
