-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view plans for their campuses" ON public.service_plans;
DROP POLICY IF EXISTS "Users can view songs for accessible plans" ON public.plan_songs;

-- Recreate service_plans policy: Require campus membership or leadership role
CREATE POLICY "Users can view plans for their campuses"
ON public.service_plans
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    -- User is a member of this campus
    EXISTS (
      SELECT 1 FROM public.user_campuses uc
      WHERE uc.user_id = auth.uid()
      AND uc.campus_id = service_plans.campus_id
    )
    -- OR user has network-wide leadership role (for plans with NULL campus_id)
    OR (
      service_plans.campus_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::public.app_role, 'network_worship_pastor'::public.app_role, 'network_worship_leader'::public.app_role)
      )
    )
  )
);

-- Recreate plan_songs policy: Only allow viewing if user can view the parent service_plan
CREATE POLICY "Users can view songs for accessible plans"
ON public.plan_songs
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.service_plans sp
    WHERE sp.id = plan_songs.plan_id
    AND (
      -- User is a member of the plan's campus
      EXISTS (
        SELECT 1 FROM public.user_campuses uc
        WHERE uc.user_id = auth.uid()
        AND uc.campus_id = sp.campus_id
      )
      -- OR network-wide leadership for NULL campus plans
      OR (
        sp.campus_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin'::public.app_role, 'network_worship_pastor'::public.app_role, 'network_worship_leader'::public.app_role)
        )
      )
    )
  )
);