BEGIN;
-- Read-only projections. Each entry checks the live session, tenant and permission.
CREATE FUNCTION educore_r4.management_read(t uuid, kind text, target uuid DEFAULT NULL, page_no int DEFAULT 1, size int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE items jsonb; total int; permission text;
BEGIN
 IF page_no NOT BETWEEN 1 AND 100000 OR size NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023';
 END IF;
 permission:=CASE kind WHEN 'MEMBERS' THEN 'member.read' WHEN 'MEMBER' THEN 'member.read'
  WHEN 'RELATIONSHIPS' THEN 'relationship.read' WHEN 'PARENTS' THEN 'relationship.create'
  WHEN 'STUDENTS' THEN 'student.read' ELSE '__DENY__' END;
 PERFORM educore_r4.authorize(t,permission);
 IF kind IN ('MEMBERS','MEMBER') THEN
  SELECT count(*) INTO total FROM public.tenant_memberships tm WHERE tm.tenant_id=t AND (kind='MEMBERS' OR tm.id=target);
  SELECT COALESCE(jsonb_agg(row ORDER BY row.id),'[]'::jsonb) INTO items FROM (
   SELECT tm.id,tm.user_id AS "userId",u.email_normalized AS email,u.display_name AS "displayName",
    tm.status,u.status AS "accountStatus",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',mr.id,'roleId',r.id,'roleCode',r.code,
     'scopeKind',sc.scope_kind,'classId',sc.class_id,'studentId',sc.student_id,
     'assignedAt',mr.assigned_at) ORDER BY mr.assigned_at,mr.id)
     FROM public.membership_roles mr JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id
     JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id
     WHERE mr.tenant_id=t AND mr.membership_id=tm.id AND mr.revoked_at IS NULL),'[]'::jsonb) AS assignments
   FROM public.tenant_memberships tm JOIN public.users u ON u.id=tm.user_id
   WHERE tm.tenant_id=t AND (kind='MEMBERS' OR tm.id=target)
   ORDER BY tm.id LIMIT size OFFSET (page_no-1)*size
  ) row;
 ELSIF kind='RELATIONSHIPS' THEN
  SELECT count(*) INTO total FROM public.parent_student_links WHERE tenant_id=t;
  SELECT COALESCE(jsonb_agg(row ORDER BY row.id),'[]'::jsonb) INTO items FROM (
   SELECT l.id,l.parent_membership_id AS "parentMembershipId",u.display_name AS "parentName",
    l.student_id AS "studentId",sp.full_name AS "studentName",l.evidence_reference AS "evidenceReference",
    l.verified_at AS "verifiedAt",l.verified_by_membership_id AS "verifiedByMembershipId",
    l.revoked_at AS "revokedAt",
    CASE WHEN l.revoked_at IS NOT NULL THEN 'INACTIVE' WHEN l.verified_at IS NOT NULL THEN 'ACTIVE' ELSE 'PENDING_VERIFICATION' END AS status
   FROM public.parent_student_links l
   JOIN public.tenant_memberships tm ON tm.tenant_id=t AND tm.id=l.parent_membership_id
   JOIN public.users u ON u.id=tm.user_id
   JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=l.student_id
   WHERE l.tenant_id=t ORDER BY l.id LIMIT size OFFSET (page_no-1)*size
  ) row;
 ELSIF kind='PARENTS' THEN
  SELECT count(DISTINCT tm.id) INTO total FROM public.tenant_memberships tm
   JOIN public.membership_roles mr ON mr.tenant_id=t AND mr.membership_id=tm.id AND mr.revoked_at IS NULL
   JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id AND r.code='PARENT'
   WHERE tm.tenant_id=t AND tm.status='ACTIVE' AND tm.left_at IS NULL;
  SELECT COALESCE(jsonb_agg(row ORDER BY row.id),'[]'::jsonb) INTO items FROM (
   SELECT DISTINCT tm.id,u.display_name AS name FROM public.tenant_memberships tm
   JOIN public.users u ON u.id=tm.user_id AND u.status='ACTIVE'
   JOIN public.membership_roles mr ON mr.tenant_id=t AND mr.membership_id=tm.id AND mr.revoked_at IS NULL
   JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id AND r.code='PARENT'
   WHERE tm.tenant_id=t AND tm.status='ACTIVE' AND tm.left_at IS NULL
   ORDER BY tm.id LIMIT size OFFSET (page_no-1)*size
  ) row;
 ELSIF kind='STUDENTS' THEN
  -- This tenant-wide selector requires a TENANT-level student.read grant.
  SELECT count(*) INTO total FROM public.student_profiles WHERE tenant_id=t AND status='ACTIVE';
  SELECT COALESCE(jsonb_agg(row ORDER BY row.id),'[]'::jsonb) INTO items FROM (
   SELECT id,student_code AS code,full_name AS name FROM public.student_profiles
   WHERE tenant_id=t AND status='ACTIVE' ORDER BY id LIMIT size OFFSET (page_no-1)*size
  ) row;
 END IF;
 IF kind='MEMBER' THEN
  IF total=0 THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
  RETURN items->0;
 END IF;
 RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;
ALTER FUNCTION educore_r4.management_read(uuid,text,uuid,int,int) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.management_read(uuid,text,uuid,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.management_read(uuid,text,uuid,int,int) TO educore_r4_api;
COMMIT;
