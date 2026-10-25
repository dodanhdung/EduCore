BEGIN;
-- Academic projections use the live R4 binding and never grant table access to the API role.
CREATE FUNCTION educore_r4.academic_read(t uuid, kind text, target uuid DEFAULT NULL,
  search_text text DEFAULT NULL, page_no int DEFAULT 1, size int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; permission text; items jsonb; total int; row_data jsonb;
BEGIN
  IF page_no NOT BETWEEN 1 AND 100000 OR size NOT BETWEEN 1 AND 100
     OR length(COALESCE(search_text,''))>100 THEN
    RAISE EXCEPTION 'INVALID_PAGE_OR_SEARCH' USING ERRCODE='22023';
  END IF;
  permission:=CASE kind
    WHEN 'STUDENTS' THEN 'student.read' WHEN 'STUDENT' THEN 'student.read'
    WHEN 'TEACHERS' THEN 'teacher.read' WHEN 'TEACHER' THEN 'teacher.read'
    WHEN 'SUBJECTS' THEN 'academic.read' WHEN 'LEVELS' THEN 'academic.read'
    WHEN 'COURSES' THEN 'academic.read' WHEN 'CLASSES' THEN 'class.read'
    WHEN 'CLASS' THEN 'class.read' ELSE '__DENY__' END;
  m:=educore_r4.authorize(t,permission,
    CASE WHEN kind='CLASS' THEN target END,
    CASE WHEN kind='STUDENT' THEN target END);
  IF kind='STUDENTS' THEN
    -- A list is tenant-wide; a class/student grant must not become a tenant selector.
    IF NOT educore_r4.has_permission(t,m,'student.read',NULL,NULL) THEN
      RAISE EXCEPTION 'TENANT_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
    SELECT count(*) INTO total FROM public.student_profiles s WHERE s.tenant_id=t
      AND (search_text IS NULL OR s.student_code ILIKE '%'||search_text||'%' OR s.full_name ILIKE '%'||search_text||'%');
    SELECT COALESCE(jsonb_agg(x ORDER BY x."code",x.id),'[]'::jsonb) INTO items FROM (
      SELECT s.id,s.student_code AS code,s.full_name AS name,s.status
      FROM public.student_profiles s WHERE s.tenant_id=t
      AND (search_text IS NULL OR s.student_code ILIKE '%'||search_text||'%' OR s.full_name ILIKE '%'||search_text||'%')
      ORDER BY s.student_code,s.id LIMIT size OFFSET (page_no-1)*size) x;
  ELSIF kind='STUDENT' THEN
    SELECT jsonb_build_object('id',s.id,'code',s.student_code,'name',s.full_name,
      'dateOfBirth',s.date_of_birth,'status',s.status) INTO row_data
    FROM public.student_profiles s WHERE s.tenant_id=t AND s.id=target;
    IF row_data IS NOT NULL THEN
      row_data:=row_data||jsonb_build_object('enrollments',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'classId',e.class_id,
          'classCode',c.code,'className',c.name,'status',e.status,
          'effectiveFrom',e.effective_from,'effectiveTo',e.effective_to)
          ORDER BY e.effective_from,e.id),'[]'::jsonb)
         FROM public.enrollments e JOIN public.classes c ON c.tenant_id=t AND c.id=e.class_id
         WHERE e.tenant_id=t AND e.student_id=target
           AND educore_r4.has_permission(t,m,'enrollment.read',e.class_id,target)));
    END IF;
  ELSIF kind='TEACHERS' THEN
    IF NOT educore_r4.has_permission(t,m,'teacher.read',NULL,NULL) THEN
      RAISE EXCEPTION 'TENANT_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
    SELECT count(*) INTO total FROM public.teacher_profiles p WHERE p.tenant_id=t
      AND (search_text IS NULL OR p.teacher_code ILIKE '%'||search_text||'%' OR p.full_name ILIKE '%'||search_text||'%');
    SELECT COALESCE(jsonb_agg(x ORDER BY x."code",x.id),'[]'::jsonb) INTO items FROM (
      SELECT p.id,p.teacher_code AS code,p.full_name AS name,p.status
      FROM public.teacher_profiles p WHERE p.tenant_id=t
      AND (search_text IS NULL OR p.teacher_code ILIKE '%'||search_text||'%' OR p.full_name ILIKE '%'||search_text||'%')
      ORDER BY p.teacher_code,p.id LIMIT size OFFSET (page_no-1)*size) x;
  ELSIF kind='TEACHER' THEN
    SELECT jsonb_build_object('id',p.id,'code',p.teacher_code,'name',p.full_name,
      'contact',p.contact,'status',p.status) INTO row_data
    FROM public.teacher_profiles p WHERE p.tenant_id=t AND p.id=target;
    IF row_data IS NOT NULL THEN
      row_data:=row_data||jsonb_build_object('assignments',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'classId',a.class_id,
          'classCode',c.code,'className',c.name,'validFrom',a.valid_from,
          'validTo',a.valid_to) ORDER BY a.valid_from,a.id),'[]'::jsonb)
         FROM public.class_teacher_assignments a JOIN public.classes c ON c.tenant_id=t AND c.id=a.class_id
         WHERE a.tenant_id=t AND a.teacher_id=target
           AND educore_r4.has_permission(t,m,'class.read',a.class_id,NULL)));
    END IF;
  ELSIF kind='SUBJECTS' THEN
    SELECT count(*) INTO total FROM public.subjects s WHERE s.tenant_id=t
      AND (search_text IS NULL OR s.code ILIKE '%'||search_text||'%' OR s.name ILIKE '%'||search_text||'%');
    SELECT COALESCE(jsonb_agg(x ORDER BY x.code,x.id),'[]'::jsonb) INTO items FROM (
      SELECT s.id,s.code,s.name,s.active FROM public.subjects s WHERE s.tenant_id=t
      AND (search_text IS NULL OR s.code ILIKE '%'||search_text||'%' OR s.name ILIKE '%'||search_text||'%')
      ORDER BY s.code,s.id LIMIT size OFFSET (page_no-1)*size) x;
  ELSIF kind='LEVELS' THEN
    SELECT count(*) INTO total FROM public.levels l WHERE l.tenant_id=t
      AND (search_text IS NULL OR l.code ILIKE '%'||search_text||'%' OR l.name ILIKE '%'||search_text||'%');
    SELECT COALESCE(jsonb_agg(x ORDER BY x."sortOrder",x.code,x.id),'[]'::jsonb) INTO items FROM (
      SELECT l.id,l.code,l.name,l.sort_order AS "sortOrder",l.active FROM public.levels l WHERE l.tenant_id=t
      AND (search_text IS NULL OR l.code ILIKE '%'||search_text||'%' OR l.name ILIKE '%'||search_text||'%')
      ORDER BY l.sort_order,l.code,l.id LIMIT size OFFSET (page_no-1)*size) x;
  ELSIF kind='COURSES' THEN
    SELECT count(*) INTO total FROM public.courses c WHERE c.tenant_id=t
      AND (search_text IS NULL OR c.code ILIKE '%'||search_text||'%' OR c.name ILIKE '%'||search_text||'%');
    SELECT COALESCE(jsonb_agg(x ORDER BY x.code,x.id),'[]'::jsonb) INTO items FROM (
      SELECT c.id,c.code,c.name,c.status,c.subject_id AS "subjectId",s.name AS "subjectName",
        c.level_id AS "levelId",l.name AS "levelName",c.description
      FROM public.courses c JOIN public.subjects s ON s.tenant_id=t AND s.id=c.subject_id
      JOIN public.levels l ON l.tenant_id=t AND l.id=c.level_id WHERE c.tenant_id=t
      AND (search_text IS NULL OR c.code ILIKE '%'||search_text||'%' OR c.name ILIKE '%'||search_text||'%')
      ORDER BY c.code,c.id LIMIT size OFFSET (page_no-1)*size) x;
  ELSIF kind='CLASSES' THEN
    IF NOT educore_r4.has_permission(t,m,'class.read',NULL,NULL) THEN
      RAISE EXCEPTION 'TENANT_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
    SELECT count(*) INTO total FROM public.classes c WHERE c.tenant_id=t
      AND (search_text IS NULL OR c.code ILIKE '%'||search_text||'%' OR c.name ILIKE '%'||search_text||'%');
    SELECT COALESCE(jsonb_agg(x ORDER BY x.code,x.id),'[]'::jsonb) INTO items FROM (
      SELECT c.id,c.code,c.name,c.status,c.capacity,c.course_id AS "courseId",co.name AS "courseName",
        (SELECT count(*) FROM public.enrollments e WHERE e.tenant_id=t AND e.class_id=c.id
         AND e.status='ACTIVE' AND e.effective_from<=clock_timestamp()
         AND (e.effective_to IS NULL OR e.effective_to>clock_timestamp())) AS "enrollmentCount"
      FROM public.classes c JOIN public.courses co ON co.tenant_id=t AND co.id=c.course_id
      WHERE c.tenant_id=t
      AND (search_text IS NULL OR c.code ILIKE '%'||search_text||'%' OR c.name ILIKE '%'||search_text||'%')
      ORDER BY c.code,c.id LIMIT size OFFSET (page_no-1)*size) x;
  ELSIF kind='CLASS' THEN
    SELECT jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'status',c.status,
      'capacity',c.capacity,'courseId',c.course_id,'courseName',co.name,
      'subjectId',co.subject_id,'levelId',co.level_id,'startDate',c.start_date,'endDate',c.end_date)
      INTO row_data FROM public.classes c JOIN public.courses co ON co.tenant_id=t AND co.id=c.course_id
      WHERE c.tenant_id=t AND c.id=target;
    IF row_data IS NOT NULL AND educore_r4.has_permission(t,m,'enrollment.read',target,NULL) THEN
      row_data:=row_data||jsonb_build_object('enrollments',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'studentId',e.student_id,
          'studentCode',s.student_code,'studentName',s.full_name,'status',e.status,
          'effectiveFrom',e.effective_from,'effectiveTo',e.effective_to,'priorEnrollmentId',e.prior_enrollment_id)
          ORDER BY e.effective_from,e.id),'[]'::jsonb)
         FROM public.enrollments e JOIN public.student_profiles s ON s.tenant_id=t AND s.id=e.student_id
         WHERE e.tenant_id=t AND e.class_id=target));
    END IF;
    IF row_data IS NOT NULL AND educore_r4.has_permission(t,m,'teacher.read',NULL,NULL) THEN
      row_data:=row_data||jsonb_build_object('teacherAssignments',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'teacherId',a.teacher_id,
          'teacherCode',p.teacher_code,'teacherName',p.full_name,'validFrom',a.valid_from,
          'validTo',a.valid_to) ORDER BY a.valid_from,a.id),'[]'::jsonb)
         FROM public.class_teacher_assignments a JOIN public.teacher_profiles p ON p.tenant_id=t AND p.id=a.teacher_id
         WHERE a.tenant_id=t AND a.class_id=target));
    END IF;
  END IF;
  IF kind IN ('STUDENT','TEACHER','CLASS') THEN
    IF row_data IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
    RETURN row_data;
  END IF;
  RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;
ALTER FUNCTION educore_r4.academic_read(uuid,text,uuid,text,int,int) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.academic_read(uuid,text,uuid,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.academic_read(uuid,text,uuid,text,int,int) TO educore_r4_api;
COMMIT;
