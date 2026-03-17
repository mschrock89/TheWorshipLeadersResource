-- Allow campus-scoped team managers to manage team member assignments.
-- This aligns Team Builder writes with the leadership roles already allowed elsewhere in the app.

DROP POLICY IF EXISTS "Admins can manage team members" ON public.team_members;

CREATE POLICY "Team managers can manage team members"
ON public.team_members
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    has_role(auth.uid(), 'campus_admin'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.rotation_periods rp
      JOIN public.user_roles ur
        ON ur.user_id = auth.uid()
       AND ur.role = 'campus_admin'::app_role
       AND ur.admin_campus_id = rp.campus_id
      WHERE rp.id = team_members.rotation_period_id
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
      FROM public.rotation_periods rp
      JOIN public.user_campuses uc
        ON uc.user_id = auth.uid()
       AND uc.campus_id = rp.campus_id
      WHERE rp.id = team_members.rotation_period_id
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
      FROM public.rotation_periods rp
      JOIN public.user_roles ur
        ON ur.user_id = auth.uid()
       AND ur.role = 'campus_admin'::app_role
       AND ur.admin_campus_id = rp.campus_id
      WHERE rp.id = team_members.rotation_period_id
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
      FROM public.rotation_periods rp
      JOIN public.user_campuses uc
        ON uc.user_id = auth.uid()
       AND uc.campus_id = rp.campus_id
      WHERE rp.id = team_members.rotation_period_id
    )
  )
);
