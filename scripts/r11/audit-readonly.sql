-- R11 audit: SELECT only, coherent snapshot, no function with mutation/locks.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
WITH target AS (SELECT * FROM public.tenants WHERE code IN ('DEMO_R10_CG','DEMO_R10_HD','DEMO_R10_LB'))
SELECT jsonb_build_object(
 'database',current_database(),'asOf',clock_timestamp(),'serverVersion',current_setting('server_version_num'),
 'functionOwnersDigest',(SELECT md5(string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||pg_get_userbyid(p.proowner),E'\n' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname LIKE 'educore_%'),
 'migrations',(SELECT jsonb_agg(jsonb_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL) ORDER BY migration_name) FROM public._prisma_migrations),
 'tenants',(SELECT jsonb_agg(jsonb_build_object(
  'id',t.id,'code',t.code,'name',t.name,'timezone',t.timezone,'status',t.status,
  'counts',jsonb_build_object(
   'student_profiles',(SELECT count(*) FROM public.student_profiles x WHERE x.tenant_id=t.id),
   'teacher_profiles',(SELECT count(*) FROM public.teacher_profiles x WHERE x.tenant_id=t.id),
   'tenant_memberships',(SELECT count(*) FROM public.tenant_memberships x WHERE x.tenant_id=t.id),
   'class_teacher_assignments',(SELECT count(*) FROM public.class_teacher_assignments x WHERE x.tenant_id=t.id),
   'teacher_competencies',(SELECT count(*) FROM public.teacher_competencies x WHERE x.tenant_id=t.id),
   'parent_student_links',(SELECT count(*) FROM public.parent_student_links x WHERE x.tenant_id=t.id),
   'classes',(SELECT count(*) FROM public.classes x WHERE x.tenant_id=t.id),
   'enrollments',(SELECT count(*) FROM public.enrollments x WHERE x.tenant_id=t.id),
   'class_sessions',(SELECT count(*) FROM public.class_sessions x WHERE x.tenant_id=t.id),
   'session_participants',(SELECT count(*) FROM public.session_participants x WHERE x.tenant_id=t.id),
   'resource_bookings',(SELECT count(*) FROM public.resource_bookings x WHERE x.tenant_id=t.id),
   'attendance_records',(SELECT count(*) FROM public.attendance_records x WHERE x.tenant_id=t.id),
   'attendance_finalizations',(SELECT count(*) FROM public.attendance_finalizations x WHERE x.tenant_id=t.id),
   'absence_requests',(SELECT count(*) FROM public.absence_requests x WHERE x.tenant_id=t.id),
   'assignments',(SELECT count(*) FROM public.assignments x WHERE x.tenant_id=t.id),
   'assignment_recipients',(SELECT count(*) FROM public.assignment_recipients x WHERE x.tenant_id=t.id),
   'submissions',(SELECT count(*) FROM public.submissions x WHERE x.tenant_id=t.id),
   'submission_versions',(SELECT count(*) FROM public.submission_versions x WHERE x.tenant_id=t.id),
   'grades',(SELECT count(*) FROM public.grades x WHERE x.tenant_id=t.id),
   'billing_periods',(SELECT count(*) FROM public.billing_periods x WHERE x.tenant_id=t.id),
   'billing_runs',(SELECT count(*) FROM public.billing_runs x WHERE x.tenant_id=t.id),
   'billing_run_generations',(SELECT count(*) FROM public.billing_run_generations x WHERE x.tenant_id=t.id),
   'invoices',(SELECT count(*) FROM public.invoices x WHERE x.tenant_id=t.id),
   'invoice_lines',(SELECT count(*) FROM public.invoice_lines x WHERE x.tenant_id=t.id),
   'payments',(SELECT count(*) FROM public.payments x WHERE x.tenant_id=t.id),
   'wallet_accounts',(SELECT count(*) FROM public.wallet_accounts x WHERE x.tenant_id=t.id),
   'wallet_transactions',(SELECT count(*) FROM public.wallet_transactions x WHERE x.tenant_id=t.id),
   'receivable_allocations',(SELECT count(*) FROM public.receivable_allocations x WHERE x.tenant_id=t.id),
   'invoice_adjustments',(SELECT count(*) FROM public.invoice_adjustments x WHERE x.tenant_id=t.id),
   'notifications',(SELECT count(*) FROM public.notifications x WHERE x.tenant_id=t.id),
   'approval_requests',(SELECT count(*) FROM public.approval_requests x WHERE x.tenant_id=t.id),
   'approval_decisions',(SELECT count(*) FROM public.approval_decisions x WHERE x.tenant_id=t.id),
   'automation_jobs',(SELECT count(*) FROM public.automation_jobs x WHERE x.tenant_id=t.id),
   'job_attempts',(SELECT count(*) FROM public.job_attempts x WHERE x.tenant_id=t.id),
   'outbox_events',(SELECT count(*) FROM public.outbox_events x WHERE x.tenant_id=t.id),
   'audit_logs',(SELECT count(*) FROM public.audit_logs x WHERE x.tenant_id=t.id)
  ),
  'statuses',jsonb_build_object(
   'grades',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.grades x WHERE x.tenant_id=t.id GROUP BY x.status) st),
   'resource_bookings',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.resource_bookings x WHERE x.tenant_id=t.id GROUP BY x.status) st),
   'outbox_events',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.outbox_events x WHERE x.tenant_id=t.id GROUP BY x.status) st),
   'class_sessions',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.class_sessions x WHERE x.tenant_id=t.id GROUP BY x.status) st),
   'assignments',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.assignments x WHERE x.tenant_id=t.id GROUP BY x.status) st),
   'invoices',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.invoices x WHERE x.tenant_id=t.id GROUP BY x.status) st),
   'approval_requests',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.approval_requests x WHERE x.tenant_id=t.id GROUP BY x.status) st),
   'automation_jobs',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.automation_jobs x WHERE x.tenant_id=t.id GROUP BY x.status) st),
   'absence_requests',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT x.status::text status,count(*) n FROM public.absence_requests x WHERE x.tenant_id=t.id GROUP BY x.status) st)
  ),
  'linkedStudents',(SELECT count(*) FROM public.student_profiles WHERE tenant_id=t.id AND membership_id IS NOT NULL),
  'linkedTeachers',(SELECT count(*) FROM public.teacher_profiles WHERE tenant_id=t.id AND membership_id IS NOT NULL),
  'classContexts',(SELECT jsonb_agg(ctx ORDER BY ctx->>'code') FROM (
    SELECT jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'teacherId',src.teacher_id,'roomId',src.room_id,'deliveryMode',src.delivery_mode,
      'assigned',EXISTS(SELECT FROM public.class_teacher_assignments ca WHERE ca.tenant_id=t.id AND ca.class_id=c.id AND ca.teacher_id=src.teacher_id AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp()))) ctx
    FROM public.classes c JOIN LATERAL (SELECT cs.teacher_id,cs.room_id,cs.delivery_mode FROM public.class_sessions cs WHERE cs.tenant_id=t.id AND cs.class_id=c.id ORDER BY cs.starts_at,cs.id LIMIT 1) src ON true
    WHERE c.tenant_id=t.id AND c.status='ACTIVE'
  ) classes),
  'teachers',(SELECT jsonb_agg(jsonb_build_object('id',id,'code',teacher_code,'name',full_name,'contact',contact,'membershipId',membership_id) ORDER BY teacher_code) FROM public.teacher_profiles WHERE tenant_id=t.id),
  'students',(SELECT jsonb_agg(jsonb_build_object('id',id,'code',student_code,'membershipId',membership_id) ORDER BY student_code) FROM public.student_profiles WHERE tenant_id=t.id),
  'classOne',(SELECT jsonb_build_object('id',c.id,'code',c.code,'teacherId',tp.id,'roomId',rm.id,'assigned',EXISTS(SELECT FROM public.class_teacher_assignments ca WHERE ca.tenant_id=t.id AND ca.class_id=c.id AND ca.teacher_id=tp.id AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp()))) FROM public.classes c JOIN public.teacher_profiles tp ON tp.tenant_id=t.id AND tp.teacher_code=split_part(c.code,'-',1)||'-GV01' JOIN public.rooms rm ON rm.tenant_id=t.id AND rm.code=split_part(c.code,'-',1)||'-P01' WHERE c.tenant_id=t.id AND c.code=split_part(t.code,'_',3)||'-LH01'),
  'memberships',(SELECT jsonb_agg(jsonb_build_object('id',m.id,'userId',u.id,'email',u.email_normalized,'status',m.status) ORDER BY u.email_normalized) FROM public.tenant_memberships m JOIN public.users u ON u.id=m.user_id WHERE m.tenant_id=t.id),
  'policies',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'version',p.version_code,'effectiveFrom',p.effective_from,'valid',p.content_hash=educore_r4.digest(p.config_snapshot::text),'current',p.id=(SELECT id FROM public.policy_versions v WHERE v.tenant_id=t.id AND v.effective_from<=clock_timestamp() AND (v.effective_to IS NULL OR v.effective_to>clock_timestamp()) ORDER BY v.effective_from DESC,v.id LIMIT 1)) ORDER BY p.effective_from) FROM public.policy_versions p WHERE p.tenant_id=t.id),
  'walletMismatch',(SELECT count(*) FROM public.wallet_accounts w WHERE w.tenant_id=t.id AND w.balance_vnd IS DISTINCT FROM coalesce((SELECT sum(tr.amount_vnd) FROM public.wallet_transactions tr WHERE tr.tenant_id=t.id AND tr.wallet_id=w.id),0)),
  'badMemberLinks',(SELECT count(*) FROM public.teacher_profiles p JOIN public.tenant_memberships m ON m.id=p.membership_id WHERE p.tenant_id=t.id AND m.tenant_id<>t.id)+(SELECT count(*) FROM public.student_profiles p JOIN public.tenant_memberships m ON m.id=p.membership_id WHERE p.tenant_id=t.id AND m.tenant_id<>t.id),
  'integrity',jsonb_build_object(
    'bookingOverlaps',(SELECT count(*) FROM public.resource_bookings a JOIN public.resource_bookings b ON b.tenant_id=t.id AND b.resource_id=a.resource_id AND b.id>a.id AND b.status='ACTIVE' AND tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(b.starts_at,b.ends_at,'[)') WHERE a.tenant_id=t.id AND a.status='ACTIVE'),
    'incompleteConfirmedBookings',(SELECT count(*) FROM public.class_sessions cs WHERE cs.tenant_id=t.id AND cs.status='CONFIRMED' AND (
      (SELECT count(*) FROM public.resource_bookings rb WHERE rb.tenant_id=t.id AND rb.session_id=cs.id AND rb.status='ACTIVE') <> 1+(cs.room_id IS NOT NULL)::int+(SELECT count(*) FROM public.session_participants sp WHERE sp.tenant_id=t.id AND sp.session_id=cs.id AND sp.removed_at IS NULL)
      OR EXISTS(SELECT FROM public.resource_bookings rb WHERE rb.tenant_id=t.id AND rb.session_id=cs.id AND rb.status='ACTIVE' AND (rb.starts_at<>cs.starts_at OR rb.ends_at<>cs.ends_at)))),
    'excusedWithoutApproval',(SELECT count(*) FROM public.attendance_records ar WHERE ar.tenant_id=t.id AND ar.attendance_status='EXCUSED' AND NOT EXISTS(SELECT FROM public.absence_requests ab WHERE ab.tenant_id=t.id AND ab.participant_id=ar.participant_id AND ab.status='APPROVED' AND ab.approved_by_membership_id IS NOT NULL AND ab.decided_at IS NOT NULL))
  ),
  'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',h.tbl,'id',h.id,'hash',h.hash) ORDER BY h.tbl,h.id),'[]'::jsonb) FROM (
   SELECT 'policy_versions' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.policy_versions x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'class_sessions' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.class_sessions x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'session_participants' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.session_participants x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'assignments' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.assignments x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'assignment_recipients' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.assignment_recipients x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'billing_periods' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.billing_periods x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'billing_runs' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.billing_runs x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'billing_run_generations' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.billing_run_generations x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'invoices' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.invoices x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'invoice_lines' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.invoice_lines x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'payments' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.payments x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'invoice_adjustments' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.invoice_adjustments x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'membership_roles' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.membership_roles x WHERE x.tenant_id=t.id
   UNION ALL
   SELECT 'access_scopes' tbl,x.id,educore_r4.digest(to_jsonb(x)::text) hash FROM public.access_scopes x WHERE x.tenant_id=t.id
  ) h)
 ) ORDER BY t.code) FROM target t)
)::text;
COMMIT;
