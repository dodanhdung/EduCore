-- Explicit companion setup, NOT automatically executed against existing logins.
-- Run only after role inventory; never grant either role the migration role.
BEGIN;
DO $profile$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname IN ('educore_r1b_api', 'educore_r1b_worker')) THEN
    RAISE EXCEPTION 'Runtime profile names already exist: inspect live compatibility, do not revoke blindly';
  END IF;
END
$profile$;
CREATE ROLE educore_r1b_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE educore_r1b_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM educore_r1b_api, educore_r1b_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM educore_r1b_api, educore_r1b_worker;
REVOKE ALL ON SCHEMA educore_private FROM educore_r1b_api, educore_r1b_worker;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_private FROM educore_r1b_api, educore_r1b_worker;
DO $verify$
DECLARE runtime_name text; relation_oid oid;
BEGIN
  FOREACH runtime_name IN ARRAY ARRAY['educore_r1b_api','educore_r1b_worker'] LOOP
    FOR relation_oid IN SELECT c.oid FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
      IF has_table_privilege(runtime_name,relation_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
        OR has_any_column_privilege(runtime_name,relation_oid,'SELECT,INSERT,UPDATE') THEN
        RAISE EXCEPTION 'Runtime profile inherits public table/column rights; inventory PUBLIC/default grants before rollout';
      END IF;
    END LOOP;
    IF has_schema_privilege(runtime_name,'educore_private','USAGE') THEN
      RAISE EXCEPTION 'Runtime profile can access private schema';
    END IF;
  END LOOP;
END
$verify$;
-- There are deliberately no production write wrappers or broad SELECT grants.
-- A real LOGIN mapping is an environment-specific, separately reviewed action.
COMMIT;
