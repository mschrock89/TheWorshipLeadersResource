DROP POLICY IF EXISTS "Leaders can manage team rotation drafts" ON public.team_rotation_drafts;

CREATE POLICY "Team managers can manage team rotation drafts"
ON public.team_rotation_drafts
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    has_role(auth.uid(), 'campus_admin'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'campus_admin'::app_role
        AND ur.admin_campus_id = team_rotation_drafts.campus_id
    )
  )
  OR (
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_campuses uc
      WHERE uc.user_id = auth.uid()
        AND uc.campus_id = team_rotation_drafts.campus_id
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    has_role(auth.uid(), 'campus_admin'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'campus_admin'::app_role
        AND ur.admin_campus_id = team_rotation_drafts.campus_id
    )
  )
  OR (
    (
      has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_campuses uc
      WHERE uc.user_id = auth.uid()
        AND uc.campus_id = team_rotation_drafts.campus_id
    )
  )
);
