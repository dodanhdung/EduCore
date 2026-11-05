BEGIN;
-- Owner-approved CAP-01 / CON-02 / EMP-03, 04 Nov 2026. No new roster read
-- access, runtime execution grant, persisted column or financial rule.
CREATE FUNCTION educore_r3.attendance_review_version(t uuid,s uuid) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
 SELECT 'av1:'||encode(sha256(convert_to(jsonb_build_object(
  'protocol','av1','tenantId',t,'sessionId',cs.id,
  'session',jsonb_build_array(cs.revision,cs.status,cs.class_id,cs.teacher_id,
    extract(epoch FROM cs.starts_at),extract(epoch FROM cs.ends_at),cs.delivery_mode,cs.room_id,cs.policy_version_id,tn.timezone),
  'finalization',(SELECT jsonb_build_array(f.id,f.revision,extract(epoch FROM f.locked_at))
    FROM public.attendance_finalizations f WHERE f.tenant_id=t AND f.session_id=cs.id),
  'sourceLocked',EXISTS(SELECT FROM public.invoice_lines l WHERE l.tenant_id=t AND l.session_id=cs.id),
  'issuedClaim',EXISTS(SELECT FROM public.invoiced_participation_claims c JOIN public.session_participants p
    ON p.tenant_id=t AND p.id=c.participant_id WHERE c.tenant_id=t AND p.session_id=cs.id),
  'roster',(SELECT COALESCE(jsonb_agg(jsonb_build_array(p.id,p.student_id,p.enrollment_id,p.participant_kind,
    extract(epoch FROM p.added_at),a.id,a.attendance_status,COALESCE(a.revision,0),
    EXISTS(SELECT FROM public.absence_requests l WHERE l.tenant_id=t AND l.participant_id=p.id
      AND l.status='APPROVED' AND l.approved_by_membership_id IS NOT NULL AND l.decided_at IS NOT NULL),
    EXISTS(SELECT FROM public.invoice_lines l WHERE l.tenant_id=t AND l.participant_id=p.id),
    EXISTS(SELECT FROM public.invoiced_participation_claims c WHERE c.tenant_id=t AND c.participant_id=p.id)) ORDER BY p.id),'[]'::jsonb)
    FROM public.session_participants p LEFT JOIN public.attendance_records a ON a.tenant_id=t AND a.participant_id=p.id
    WHERE p.tenant_id=t AND p.session_id=cs.id AND p.removed_at IS NULL)
 )::text,'UTF8')),'hex') FROM public.class_sessions cs JOIN public.tenants tn ON tn.id=t
 WHERE cs.tenant_id=t AND cs.id=s
$$;

-- Uses the existing mutation authorization function, including student scope
-- and session-time Teacher assignment. No mutation is used as a dry run.
-- Domain predicates below mirror the retained command guards; native parity
-- tests cover both decisions. Input-specific status/revision/reason validation
-- is still mandatory on every command.
CREATE FUNCTION educore_r3.attendance_reasons(t uuid,m uuid,s uuid,pid uuid,op text,stamp timestamptz) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE cs public.class_sessions%ROWTYPE; p public.session_participants%ROWTYPE;
 ar public.attendance_records%ROWTYPE; authorized uuid; teacher boolean; locked boolean; finalized boolean;
BEGIN
 SELECT * INTO cs FROM public.class_sessions WHERE tenant_id=t AND id=s;
 IF pid IS NOT NULL THEN SELECT * INTO p FROM public.session_participants WHERE tenant_id=t AND id=pid AND session_id=s AND removed_at IS NULL; END IF;
 IF cs.id IS NULL OR op NOT IN ('MARK','FINALIZE','CORRECT') OR (op<>'FINALIZE' AND p.id IS NULL) THEN RETURN ARRAY['NOT_AUTHORIZED']; END IF;
 BEGIN
  authorized:=educore_r3.authorize(t,cs.class_id,p.student_id,
    CASE op WHEN 'MARK' THEN 'attendance.mark' WHEN 'FINALIZE' THEN 'attendance.finalize' ELSE 'attendance.correct' END,cs.id);
 EXCEPTION WHEN insufficient_privilege THEN RETURN ARRAY['NOT_AUTHORIZED']; END;
 IF authorized IS DISTINCT FROM m THEN RETURN ARRAY['NOT_AUTHORIZED']; END IF;
 IF cs.status NOT IN ('CONFIRMED','COMPLETED') THEN RETURN ARRAY['SESSION_NOT_ELIGIBLE']; END IF;
 IF stamp<cs.starts_at THEN RETURN ARRAY['SESSION_NOT_STARTED']; END IF;
 finalized:=EXISTS(SELECT FROM public.attendance_finalizations WHERE tenant_id=t AND session_id=s);
 IF op<>'CORRECT' AND finalized THEN RETURN ARRAY['ALREADY_FINALIZED']; END IF;
 teacher:=EXISTS(SELECT FROM public.teacher_profiles tp JOIN public.class_teacher_assignments ca
   ON ca.tenant_id=t AND ca.teacher_id=tp.id AND ca.class_id=cs.class_id
   WHERE tp.tenant_id=t AND tp.membership_id=m AND tp.id=cs.teacher_id AND tp.status='ACTIVE'
    AND ca.valid_from<=cs.starts_at AND (ca.valid_to IS NULL OR cs.starts_at<ca.valid_to));
 locked:=educore_r3.time_locked(stamp,cs.ends_at) OR EXISTS(SELECT FROM public.invoiced_participation_claims c
   JOIN public.session_participants sp ON sp.tenant_id=t AND sp.id=c.participant_id WHERE c.tenant_id=t AND sp.session_id=s);
 IF op<>'CORRECT' AND (NOT teacher OR locked) THEN
  IF NOT EXISTS(SELECT FROM public.membership_roles mr JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id
    WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL AND r.code IN ('MANAGER','ACADEMIC_STAFF'))
    THEN RETURN ARRAY['ASSIGNMENT_OR_LATE_STAFF_REQUIRED']; END IF;
  IF NOT educore_r3.time_locked(stamp,cs.ends_at) THEN
    IF locked THEN RETURN ARRAY['SOURCE_LOCKED']; END IF;
    RETURN ARRAY['STAFF_WINDOW_NOT_REACHED']; END IF;
  IF EXISTS(SELECT FROM public.invoice_lines WHERE tenant_id=t AND session_id=s) THEN RETURN ARRAY['SOURCE_LOCKED']; END IF;
 END IF;
 IF op IN ('MARK','CORRECT') THEN
  SELECT * INTO ar FROM public.attendance_records WHERE tenant_id=t AND participant_id=p.id AND session_id=s;
  IF op='CORRECT' AND ar.id IS NULL THEN RETURN ARRAY['NO_RECORD_TO_CORRECT']; END IF;
  IF EXISTS(SELECT FROM public.invoice_lines WHERE tenant_id=t AND participant_id=p.id) THEN RETURN ARRAY['SOURCE_LOCKED']; END IF;
 ELSE
  IF NOT EXISTS(SELECT FROM public.session_participants WHERE tenant_id=t AND session_id=s AND removed_at IS NULL) THEN RETURN ARRAY['EMPTY_ROSTER']; END IF;
  IF EXISTS(SELECT FROM public.session_participants sp LEFT JOIN public.attendance_records a ON a.tenant_id=t AND a.participant_id=sp.id AND a.session_id=s
    WHERE sp.tenant_id=t AND sp.session_id=s AND sp.removed_at IS NULL AND a.id IS NULL) THEN RETURN ARRAY['RESULTS_INCOMPLETE']; END IF;
  IF EXISTS(SELECT FROM public.session_participants sp JOIN public.attendance_records a ON a.tenant_id=t AND a.participant_id=sp.id AND a.session_id=s
    WHERE sp.tenant_id=t AND sp.session_id=s AND sp.removed_at IS NULL AND a.attendance_status='EXCUSED'
     AND NOT EXISTS(SELECT FROM public.absence_requests l WHERE l.tenant_id=t AND l.participant_id=sp.id AND l.status='APPROVED'
       AND l.approved_by_membership_id IS NOT NULL AND l.decided_at IS NOT NULL)) THEN RETURN ARRAY['APPROVED_LEAVE_REQUIRED']; END IF;
 END IF;
 RETURN ARRAY[]::text[];
END $$;

CREATE FUNCTION educore_r3.attendance_sheet_contract(t uuid,m uuid,s uuid,base jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE stamp timestamptz:=clock_timestamp(); row_data jsonb; rows jsonb:='[]'; mr text[]; cr text[]; fr text[];
 mark_reasons text[]:=ARRAY[]::text[]; correct_reasons text[]:=ARRAY[]::text[]; can_mark boolean:=false; can_correct boolean:=false;
BEGIN
 FOR row_data IN SELECT value FROM jsonb_array_elements(base->'participants') LOOP
  mr:=educore_r3.attendance_reasons(t,m,s,(row_data->>'id')::uuid,'MARK',stamp);
  cr:=educore_r3.attendance_reasons(t,m,s,(row_data->>'id')::uuid,'CORRECT',stamp);
  can_mark:=can_mark OR cardinality(mr)=0; can_correct:=can_correct OR cardinality(cr)=0;
  mark_reasons:=mark_reasons||mr; correct_reasons:=correct_reasons||cr;
  rows:=rows||jsonb_build_array(row_data||jsonb_build_object('capabilities',jsonb_build_object(
    'canMark',cardinality(mr)=0,'markReasons',mr,'canCorrect',cardinality(cr)=0,'correctReasons',cr)));
 END LOOP;
 fr:=educore_r3.attendance_reasons(t,m,s,NULL,'FINALIZE',stamp);
 IF jsonb_array_length(rows)=0 THEN mark_reasons:=ARRAY['EMPTY_ROSTER']; correct_reasons:=ARRAY['NO_RECORD_TO_CORRECT']; END IF;
 SELECT COALESCE(array_agg(DISTINCT x ORDER BY x),ARRAY[]::text[]) INTO mark_reasons FROM unnest(mark_reasons) x;
 SELECT COALESCE(array_agg(DISTINCT x ORDER BY x),ARRAY[]::text[]) INTO correct_reasons FROM unnest(correct_reasons) x;
 RETURN base||jsonb_build_object('participants',rows,'sheetVersion',educore_r3.attendance_review_version(t,s),
  'capabilities',jsonb_build_object('protocolVersion',1,'evaluatedAt',stamp,'canMark',can_mark,
   'markReasons',CASE WHEN can_mark THEN ARRAY[]::text[] ELSE mark_reasons END,'canFinalize',cardinality(fr)=0,'finalizeReasons',fr,
   'canCorrect',can_correct,'correctReasons',CASE WHEN can_correct THEN ARRAY[]::text[] ELSE correct_reasons END));
END $$;

-- Keep the original read gate and every non-SHEET branch byte-for-byte in the
-- function body. Fail migration if a different baseline is ever encountered.
DO $read$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.attendance_mvp_read(uuid,text,uuid,timestamptz,timestamptz,int,int)'::regprocedure);
 IF position('RETURN jsonb_build_object(''sessionId'',cs.id' IN ddl)=0
  OR position('WHERE p.tenant_id=t AND p.session_id=cs.id AND p.removed_at IS NULL));' IN ddl)=0 THEN
  RAISE EXCEPTION 'R13_ATTENDANCE_READ_BASELINE_MISMATCH'; END IF;
 ddl:=replace(ddl,'RETURN jsonb_build_object(''sessionId'',cs.id','RETURN educore_r3.attendance_sheet_contract(t,m,cs.id,jsonb_build_object(''sessionId'',cs.id');
 ddl:=replace(ddl,'WHERE p.tenant_id=t AND p.session_id=cs.id AND p.removed_at IS NULL));','WHERE p.tenant_id=t AND p.session_id=cs.id AND p.removed_at IS NULL)));');
 EXECUTE ddl;
END $read$;

DO $command$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r3.attendance(uuid,jsonb)'::regprocedure);
 IF position('prior:=educore_r3.replay(t,body); IF prior IS NOT NULL THEN RETURN prior; END IF;' IN ddl)=0
  OR position('IF EXISTS(SELECT FROM public.session_participants sp LEFT JOIN public.attendance_records rec' IN ddl)=0 THEN
  RAISE EXCEPTION 'R13_ATTENDANCE_COMMAND_BASELINE_MISMATCH'; END IF;
 ddl:=replace(ddl,'prior:=educore_r3.replay(t,body); IF prior IS NOT NULL THEN RETURN prior; END IF;',
 $patch$IF op='FINALIZE' AND (body->>'expectedSheetVersion' IS NULL OR (body->>'expectedSheetVersion') !~ '^av1:[0-9a-f]{64}$') THEN
  RAISE EXCEPTION 'INVALID_SHEET_VERSION' USING ERRCODE='22023'; END IF;
 prior:=educore_r3.replay(t,body); IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF op='FINALIZE' THEN
  IF cs.id IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF (body->>'expectedSheetVersion') IS DISTINCT FROM educore_r3.attendance_review_version(t,cs.id) THEN
   RAISE EXCEPTION 'ATTENDANCE_SHEET_CHANGED' USING ERRCODE='P1301'; END IF;
 END IF;$patch$);
 ddl:=replace(ddl,'IF EXISTS(SELECT FROM public.session_participants sp LEFT JOIN public.attendance_records rec',
 $patch$IF NOT EXISTS(SELECT FROM public.session_participants WHERE tenant_id=t AND session_id=cs.id AND removed_at IS NULL) THEN
  RAISE EXCEPTION 'EMPTY_ROSTER' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.session_participants sp LEFT JOIN public.attendance_records rec$patch$);
 EXECUTE ddl;
END $command$;

-- AT02 already permits sheet reads for MARK OR FINALIZE. Align only its
-- navigation projection so a finalize-only actor can reach that existing
-- resource gate. No permission/catalog/scope or navigation architecture change.
DO $navigation$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.navigation_access(uuid)'::regprocedure);
 IF position('WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)' IN ddl)=0
  OR position('AND (v.screen<>''AT02'' OR EXISTS(SELECT FROM public.class_sessions cs WHERE cs.tenant_id=t AND educore_r4.has_permission(t,m,''attendance.mark'',cs.class_id,NULL)))' IN ddl)=0 THEN
  RAISE EXCEPTION 'R13_ATTENDANCE_NAVIGATION_BASELINE_MISMATCH'; END IF;
 ddl:=replace(ddl,'WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)',
  'WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)
    OR (v.screen=''AT02'' AND EXISTS(SELECT FROM public.class_sessions cs WHERE cs.tenant_id=t
      AND educore_r4.has_permission(t,m,''attendance.finalize'',cs.class_id,NULL)))');
 ddl:=replace(ddl,'AND (v.screen<>''AT02'' OR EXISTS(SELECT FROM public.class_sessions cs WHERE cs.tenant_id=t AND educore_r4.has_permission(t,m,''attendance.mark'',cs.class_id,NULL)))',
  'AND (v.screen<>''AT02'' OR EXISTS(SELECT FROM public.class_sessions cs WHERE cs.tenant_id=t
    AND (educore_r4.has_permission(t,m,''attendance.mark'',cs.class_id,NULL)
      OR educore_r4.has_permission(t,m,''attendance.finalize'',cs.class_id,NULL))))');
 EXECUTE ddl;
END $navigation$;

ALTER FUNCTION educore_r3.attendance_review_version(uuid,uuid) OWNER TO educore_r3_owner;
ALTER FUNCTION educore_r3.attendance_reasons(uuid,uuid,uuid,uuid,text,timestamptz) OWNER TO educore_r3_owner;
ALTER FUNCTION educore_r3.attendance_sheet_contract(uuid,uuid,uuid,jsonb) OWNER TO educore_r3_owner;
REVOKE ALL ON FUNCTION educore_r3.attendance_review_version(uuid,uuid),educore_r3.attendance_reasons(uuid,uuid,uuid,uuid,text,timestamptz),educore_r3.attendance_sheet_contract(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r3.attendance_sheet_contract(uuid,uuid,uuid,jsonb) TO educore_r4_owner;
-- Existing public function owners, signatures and ACLs are preserved by CREATE
-- OR REPLACE; no new helper execution is granted to API/command/runtime roles.
COMMIT;
