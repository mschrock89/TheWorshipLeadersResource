-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view campuses" ON public.campuses;

-- Create a restrictive policy: users can only see campuses they're assigned to, or leaders can see all
CREATE POLICY "Users can view assigned campuses"
ON public.campuses
FOR SELECT
USING (
  has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
  OR id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )  -- Users can only see their assigned campuses
);