CREATE TABLE public.team_member_date_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  rotation_period_id UUID NOT NULL REFERENCES public.rotation_periods(id) ON DELETE CASCADE,
  position_slot TEXT NOT NULL,
  schedule_date DATE NOT NULL,
  user_id UUID,
  member_name TEXT NOT NULL,
  position TEXT NOT NULL,
  ministry_types TEXT[] DEFAULT ARRAY['weekend']::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, rotation_period_id, position_slot, schedule_date)
);

ALTER TABLE public.team_member_date_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view team member date overrides"
ON public.team_member_date_overrides
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Team managers can manage team member date overrides"
ON public.team_member_date_overrides
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
      WHERE rp.id = team_member_date_overrides.rotation_period_id
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
      WHERE rp.id = team_member_date_overrides.rotation_period_id
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
      WHERE rp.id = team_member_date_overrides.rotation_period_id
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
      WHERE rp.id = team_member_date_overrides.rotation_period_id
    )
  )
);

CREATE INDEX idx_team_member_date_overrides_team_period
ON public.team_member_date_overrides(team_id, rotation_period_id);

CREATE INDEX idx_team_member_date_overrides_schedule_date
ON public.team_member_date_overrides(schedule_date);
