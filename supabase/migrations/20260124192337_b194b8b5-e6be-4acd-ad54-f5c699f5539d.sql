-- Security Hardening Migration
-- Phase 1: Remove duplicate PCO connections policies
DROP POLICY IF EXISTS "Users can delete own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can insert own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can update own connection" ON public.pco_connections;

-- Phase 2: Tighten user_roles visibility
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles or admins can view all"
ON public.user_roles FOR SELECT
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    shares_campus_with(auth.uid(), user_id)
    AND (
      has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    )
  )
);

-- Phase 3: Tighten swap_requests visibility
DROP POLICY IF EXISTS "Users can view relevant swap requests" ON public.swap_requests;

CREATE POLICY "Users can view relevant swap requests"
ON public.swap_requests FOR SELECT
USING (
  auth.uid() = requester_id 
  OR auth.uid() = target_user_id
  OR auth.uid() = accepted_by_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    target_user_id IS NULL 
    AND status = 'pending'::swap_request_status
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
      AND tm.team_id = swap_requests.team_id
      AND tm.position = swap_requests.position
    )
  )
);

-- Phase 4: Remove duplicate service_plans policy
DROP POLICY IF EXISTS "Users can view plans for their campuses" ON public.service_plans;

-- Phase 5: Remove duplicate plan_songs policy
DROP POLICY IF EXISTS "Users can view songs for accessible plans" ON public.plan_songs;