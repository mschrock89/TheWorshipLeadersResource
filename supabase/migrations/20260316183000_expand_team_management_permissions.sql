-- Expand team/profile management to pastors plus video/production managers.

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Team managers can update any profile" ON public.profiles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), id)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), id)
  )
);

DROP POLICY IF EXISTS "Leaders can view all ministry assignments" ON public.user_ministry_campuses;
CREATE POLICY "Team managers can view all ministry assignments" ON public.user_ministry_campuses
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS "Leaders can insert ministry assignments" ON public.user_ministry_campuses;
CREATE POLICY "Team managers can insert ministry assignments" ON public.user_ministry_campuses
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS "Leaders can delete ministry assignments" ON public.user_ministry_campuses;
CREATE POLICY "Team managers can delete ministry assignments" ON public.user_ministry_campuses
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS "Leaders can manage campus ministry positions" ON public.user_campus_ministry_positions;
CREATE POLICY "Team managers can manage campus ministry positions" ON public.user_campus_ministry_positions
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), user_id)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'video_director'::app_role)
      OR has_role(auth.uid(), 'production_manager'::app_role)
    )
    AND shares_campus_with(auth.uid(), user_id)
  )
);
