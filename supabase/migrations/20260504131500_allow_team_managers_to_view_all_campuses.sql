-- Team managers need the full campus list when editing volunteer profiles and
-- other cross-campus management views. Keep volunteers scoped to their assigned
-- campuses, but let management roles see every campus option.

DROP POLICY IF EXISTS "Users can view assigned campuses" ON public.campuses;

CREATE POLICY "Users can view assigned campuses"
ON public.campuses
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'video_director'::app_role)
  OR has_role(auth.uid(), 'production_manager'::app_role)
  OR id IN (
    SELECT uc.campus_id
    FROM public.user_campuses uc
    WHERE uc.user_id = auth.uid()
  )
);
