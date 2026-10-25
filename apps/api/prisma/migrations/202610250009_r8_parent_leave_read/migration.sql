BEGIN;

-- Keep future tenant provisioning aligned with the scoped R4 Parent predicate.
-- The predicate already requires both an access scope and a verified child link.
DO $parent_leave_read$ DECLARE ddl text; old_clause text; new_clause text; BEGIN
  ddl := pg_get_functiondef('educore_r4.seed(uuid)'::regprocedure);
  old_clause := $s$r='PARENT' AND code IN ('schedule.read','attendance.read','absence.create',$s$;
  new_clause := $s$r='PARENT' AND code IN ('schedule.read','attendance.read','absence.create','absence.read',$s$;
  IF position(new_clause IN ddl) = 0 THEN
    IF position(old_clause IN ddl) = 0 THEN
      RAISE EXCEPTION 'PARENT_SEED_BASELINE_MISMATCH' USING ERRCODE='23514';
    END IF;
    EXECUTE replace(ddl, old_clause, new_clause);
  END IF;
END $parent_leave_read$;

-- Backfill only the seeded Parent role for existing tenants. No scope rows are
-- created or changed, so a TENANT scope alone still cannot bypass child links.
INSERT INTO public.role_permissions(id,tenant_id,role_id,permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code='PARENT' AND r.is_system_seeded AND p.code='absence.read'
ON CONFLICT DO NOTHING;

COMMIT;
