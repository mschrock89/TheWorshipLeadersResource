-- Allow campus pastors to view accepted swaps affecting users in their campus
-- This fixes roster/Calendar not applying accepted covers for campus-scoped managers.

DROP POLICY IF EXISTS "Leaders can view accepted swaps for their campus" ON public.swap_requests;

CREATE POLICY "Leaders can view accepted swaps for their campus"
ON public.swap_requests
FOR SELECT
USING (
  (status = 'accepted'::swap_request_status)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'campus_admin'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'network_worship_leader'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'video_director'::app_role)
    OR has_role(auth.uid(), 'production_manager'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
  )
  AND (
    shares_campus_with(auth.uid(), requester_id)
    OR (accepted_by_id IS NOT NULL AND shares_campus_with(auth.uid(), accepted_by_id))
    OR (target_user_id IS NOT NULL AND shares_campus_with(auth.uid(), target_user_id))
  )
);
