-- READ-ONLY METADATA TEMPLATE, NOT A MIGRATION OR MAINTENANCE RUNNER.
-- Execute only after owner allowlists a genuinely read-only login/host/database.
-- Do not substitute migration credentials or application runtime credentials.
-- No auth.bind(), principal context, business function, table DML or live data.
-- STOP if role_admission is false; do not use this script to prove deployment.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='2s';
SELECT clock_timestamp() captured_at,current_database() database,
  current_setting('server_version') server_version,
  current_setting('transaction_read_only') transaction_read_only,
  NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolbypassrls
    AND NOT has_database_privilege(current_user,current_database(),'CREATE')
    AND NOT has_schema_privilege(current_user,'public','CREATE')
    AND NOT EXISTS(SELECT FROM pg_roles owner_role WHERE owner_role.rolname IN
      ('educore_r3_owner','educore_r4_owner','educore_r4_api','educore_r4_auth','educore_r4_worker','educore_r4_operator')
      AND pg_has_role(current_user,owner_role.oid,'MEMBER')) role_admission
FROM pg_roles r WHERE r.rolname=current_user;
-- role_admission is an extra sanity check, not a substitute for a separately
-- reviewed read-only ACL/connection allowlist. Reject unapproved raw DML grants.
SELECT migration_name,checksum,started_at,finished_at,rolled_back_at,applied_steps_count
FROM public._prisma_migrations ORDER BY migration_name,started_at;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) signature,
  owner.rolname owner,owner.rolcanlogin owner_login,owner.rolsuper owner_super,
  owner.rolbypassrls owner_bypass,p.prosecdef,p.provolatile,p.proconfig,
  EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
  has_function_privilege('educore_r4_api',p.oid,'EXECUTE') api_execute,
  has_function_privilege('educore_r4_auth',p.oid,'EXECUTE') auth_execute,
  has_function_privilege('educore_r4_worker',p.oid,'EXECUTE') worker_execute,
  encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_sha256
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_roles owner ON owner.oid=p.proowner
WHERE n.nspname IN ('educore_r3','educore_r4') AND p.proname IN
  ('attendance','attendance_review_version','attendance_reasons','attendance_sheet_contract',
   'attendance_mvp_read','navigation_access','profile_membership_link','class_activate')
ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
SELECT name,default_version,installed_version FROM pg_available_extensions
WHERE installed_version IS NOT NULL ORDER BY name;
ROLLBACK;
