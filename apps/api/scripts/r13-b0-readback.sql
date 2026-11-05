-- Read-only deployment metadata template. NOT a migration/deployment runner.
-- Execute only with an independently authorized, allowlisted connection.
-- No principal binding, protected business GET, business function or table DML.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object('capturedAt',clock_timestamp(),'readOnly',current_setting('transaction_read_only'),
  'serverVersion',current_setting('server_version'),
  'appliedMigrations',(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
  'unresolvedFailures',(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)) AS migration_summary;
SELECT migration_name,checksum,finished_at,rolled_back_at
  FROM public._prisma_migrations ORDER BY migration_name;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) signature,r.rolname owner,
  r.rolcanlogin owner_login,r.rolsuper owner_super,r.rolbypassrls owner_bypass,p.prosecdef,p.provolatile,p.proconfig,
  EXISTS(SELECT FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
  has_function_privilege('educore_r4_api',p.oid,'EXECUTE') api_execute,
  has_function_privilege('educore_r4_auth',p.oid,'EXECUTE') auth_execute,
  has_function_privilege('educore_r4_worker',p.oid,'EXECUTE') worker_execute,
  md5(p.prosrc) body_fingerprint,
  position('expectedSheetVersion' IN p.prosrc)>0 reviewed_version,
  position('EMPTY_ROSTER' IN p.prosrc)>0 empty_roster_guard,
  position('attendance_sheet_contract' IN p.prosrc)>0 calls_sheet_contract
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
WHERE (n.nspname='educore_r3' AND p.proname IN ('attendance','attendance_review_version','attendance_sheet_contract','attendance_reasons'))
  OR (n.nspname='educore_r4' AND p.proname IN ('attendance_mvp_read','navigation_access','profile_membership_link'))
ORDER BY n.nspname,p.proname;
SELECT rolsuper migration_superuser,rolcreaterole migration_create_role,
  pg_has_role(current_user,'educore_r3_owner','MEMBER') member_r3_owner,
  pg_has_role(current_user,'educore_r4_owner','MEMBER') member_r4_owner,
  pg_has_role(current_user,'educore_r3_owner','USAGE') inherited_r3_owner,
  pg_has_role(current_user,'educore_r4_owner','USAGE') inherited_r4_owner,
  has_schema_privilege(current_user,'educore_r3','CREATE') create_r3,
  has_schema_privilege(current_user,'educore_r4','CREATE') create_r4
FROM pg_roles WHERE rolname=current_user;
ROLLBACK;
