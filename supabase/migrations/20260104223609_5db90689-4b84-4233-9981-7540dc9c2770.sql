-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all events" ON public.events;

-- Create a restrictive policy: users can only see events for their campuses
CREATE POLICY "Users can view campus events"
ON public.events
FOR SELECT
USING (
  has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
  OR has_role(auth.uid(), 'campus_pastor'::app_role)  -- Campus pastors can see all
  OR campus_id IS NULL  -- Global events (no campus) visible to all
  OR campus_id IN (
    SELECT campus_id FROM public.user_campuses WHERE user_id = auth.uid()
  )  -- Users can only see events for their assigned campuses
);