-- Hide unpublished rotation drafts from regular authenticated users while
-- allowing team managers to keep working in Team Builder. Once a draft is
-- published, the underlying team member rows become visible to everyone again.

DROP POLICY IF EXISTS "Authenticated users can view team rotation drafts" ON public.team_rotation_drafts;
DROP POLICY IF EXISTS "Authenticated users can view team members" ON public.team_members;
DROP POLICY IF EXISTS "Authenticated users can view team member date overrides" ON public.team_member_date_overrides;

CREATE POLICY "Team managers can view team rotation drafts"
ON public.team_rotation_drafts
FOR SELECT
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
);

CREATE POLICY "Published team members are visible to authenticated users"
ON public.team_members
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_leader'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.rotation_periods rp
      JOIN public.user_roles ur
        ON ur.user_id = auth.uid()
       AND ur.role = 'campus_admin'::app_role
       AND ur.admin_campus_id = rp.campus_id
      WHERE rp.id = team_members.rotation_period_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.rotation_periods rp
      JOIN public.user_campuses uc
        ON uc.user_id = auth.uid()
       AND uc.campus_id = rp.campus_id
      WHERE rp.id = team_members.rotation_period_id
        AND (
          has_role(auth.uid(), 'campus_worship_pastor'::app_role)
          OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
          OR has_role(auth.uid(), 'video_director'::app_role)
          OR has_role(auth.uid(), 'production_manager'::app_role)
        )
    )
    OR team_members.rotation_period_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.rotation_periods rp
      JOIN public.team_rotation_drafts trd
        ON trd.rotation_period_id = rp.id
       AND trd.campus_id = rp.campus_id
      WHERE rp.id = team_members.rotation_period_id
        AND trd.published_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(team_members.ministry_types, ARRAY['weekend']::TEXT[])) AS member_ministry(ministry_type)
          WHERE CASE
            WHEN member_ministry.ministry_type IN ('weekend_team', 'sunday_am') THEN 'weekend'
            ELSE member_ministry.ministry_type
          END = CASE
            WHEN trd.ministry_type IN ('weekend_team', 'sunday_am') THEN 'weekend'
            ELSE trd.ministry_type
          END
        )
    )
  )
);

CREATE POLICY "Published team member date overrides are visible to authenticated users"
ON public.team_member_date_overrides
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_leader'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.rotation_periods rp
      JOIN public.user_roles ur
        ON ur.user_id = auth.uid()
       AND ur.role = 'campus_admin'::app_role
       AND ur.admin_campus_id = rp.campus_id
      WHERE rp.id = team_member_date_overrides.rotation_period_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.rotation_periods rp
      JOIN public.user_campuses uc
        ON uc.user_id = auth.uid()
       AND uc.campus_id = rp.campus_id
      WHERE rp.id = team_member_date_overrides.rotation_period_id
        AND (
          has_role(auth.uid(), 'campus_worship_pastor'::app_role)
          OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
          OR has_role(auth.uid(), 'video_director'::app_role)
          OR has_role(auth.uid(), 'production_manager'::app_role)
        )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.rotation_periods rp
      JOIN public.team_rotation_drafts trd
        ON trd.rotation_period_id = rp.id
       AND trd.campus_id = rp.campus_id
      WHERE rp.id = team_member_date_overrides.rotation_period_id
        AND trd.published_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(team_member_date_overrides.ministry_types, ARRAY['weekend']::TEXT[])) AS member_ministry(ministry_type)
          WHERE CASE
            WHEN member_ministry.ministry_type IN ('weekend_team', 'sunday_am') THEN 'weekend'
            ELSE member_ministry.ministry_type
          END = CASE
            WHEN trd.ministry_type IN ('weekend_team', 'sunday_am') THEN 'weekend'
            ELSE trd.ministry_type
          END
        )
    )
  )
);
