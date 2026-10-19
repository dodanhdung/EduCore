-- READ ONLY. Run with explicitly authorized inventory access, not application credentials.
-- No marker backfill: current timezone alone is not historical provenance.
SELECT current_database() AS database_name, version() AS server_version;
SELECT n.nspname, c.relname, r.rolname AS owner
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname IN ('public','educore_private');
SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolinherit, rolbypassrls
FROM pg_catalog.pg_roles WHERE rolname LIKE 'educore%';
SELECT * FROM pg_catalog.pg_auth_members;
SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants
WHERE table_schema IN ('public','educore_private');
SELECT t.id,t.timezone,
  EXISTS(SELECT FROM public.schedule_series x WHERE x.tenant_id=t.id)
  OR EXISTS(SELECT FROM public.class_sessions x WHERE x.tenant_id=t.id)
  OR EXISTS(SELECT FROM public.billing_periods x WHERE x.tenant_id=t.id)
  OR EXISTS(SELECT FROM public.billing_runs x WHERE x.tenant_id=t.id) AS requires_reviewed_adoption
FROM public.tenants t;
SELECT l.id AS line_id,l.student_id,i.student_id AS invoice_student,sp.student_id AS source_student,
       s.starts_at,t.timezone,p.month_start,p.month_end
FROM public.invoice_lines l
JOIN public.invoices i ON i.tenant_id=l.tenant_id AND i.id=l.invoice_id
JOIN public.billing_periods p ON p.tenant_id=i.tenant_id AND p.id=i.period_id
JOIN public.session_participants sp ON sp.tenant_id=l.tenant_id AND sp.id=l.participant_id
JOIN public.class_sessions s ON s.tenant_id=sp.tenant_id AND s.id=sp.session_id
JOIN public.tenants t ON t.id=l.tenant_id
WHERE l.student_id<>i.student_id OR l.student_id<>sp.student_id OR l.session_id<>sp.session_id
  OR NOT (p.month_start <= (s.starts_at AT TIME ZONE t.timezone)::date
           AND (s.starts_at AT TIME ZONE t.timezone)::date < p.month_end);
SELECT sp.id FROM public.session_participants sp
JOIN public.class_sessions s ON s.tenant_id=sp.tenant_id AND s.id=sp.session_id
JOIN public.enrollments e ON e.tenant_id=sp.tenant_id AND e.id=sp.enrollment_id
WHERE e.class_id<>s.class_id OR e.student_id<>sp.student_id;
SELECT ar.id FROM public.attendance_records ar
JOIN public.attendance_finalizations af ON af.tenant_id=ar.tenant_id AND af.id=ar.finalization_id
WHERE ar.session_id<>af.session_id;
