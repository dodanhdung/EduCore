BEGIN;
-- R6 independent counterexample: a self-link was accepted as verified sibling
-- evidence by billing capture. Never normalize or delete historical evidence.
-- Both pair orientations are valid; enforce unordered active identity without
-- rewriting an existing valid orientation or preventing a revoked regrant.
DO $preflight$
BEGIN
  IF EXISTS (SELECT FROM public.verified_sibling_relationships
    WHERE student_a_id = student_b_id)
    OR EXISTS (SELECT FROM public.verified_sibling_relationships
      WHERE revoked_at IS NULL
      GROUP BY tenant_id, LEAST(student_a_id, student_b_id),
        GREATEST(student_a_id, student_b_id)
      HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'R6_SIBLING_EVIDENCE_ADOPTION_REQUIRED'
      USING ERRCODE = '23514';
  END IF;
END
$preflight$;

ALTER TABLE public.verified_sibling_relationships
  ADD CONSTRAINT r6_sibling_distinct CHECK (student_a_id <> student_b_id);

CREATE UNIQUE INDEX r6_active_sibling_pair
  ON public.verified_sibling_relationships
    (tenant_id, LEAST(student_a_id, student_b_id),
      GREATEST(student_a_id, student_b_id))
  WHERE revoked_at IS NULL;

COMMIT;
