-- Let campus admins reassign volunteers between campuses without requiring
-- an existing shared-campus relationship on the current assignment row.

DROP POLICY IF EXISTS "Campus admins and above can delete campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can delete campus assignments" ON public.user_campuses
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS "Campus admins and above can insert campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can insert campus assignments" ON public.user_campuses
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'video_director'::app_role)
  OR has_role(auth.uid(), 'production_manager'::app_role)
);

DROP POLICY IF EXISTS "Campus admins and above can update campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can update campus assignments" ON public.user_campuses
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), user_id)
  )
);
