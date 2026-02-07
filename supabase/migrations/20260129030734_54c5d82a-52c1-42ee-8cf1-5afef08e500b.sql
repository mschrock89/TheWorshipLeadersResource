-- Allow team members and campus-scoped leaders to see ACCEPTED swap/cover requests so rosters render correctly.
-- This does NOT change who can create/accept requests; it only broadens read access for accepted requests.

CREATE POLICY "Users can view accepted swaps for their teams"
ON public.swap_requests
FOR SELECT
USING (
  status = 'accepted'::swap_request_status
  AND EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.team_id = swap_requests.team_id
  )
);

CREATE POLICY "Leaders can view accepted swaps for their campus"
ON public.swap_requests
FOR SELECT
USING (
  status = 'accepted'::swap_request_status
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'campus_admin'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'network_worship_leader'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'video_director'::app_role)
    OR has_role(auth.uid(), 'production_manager'::app_role)
  )
  AND (
    shares_campus_with(auth.uid(), swap_requests.requester_id)
    OR (swap_requests.accepted_by_id IS NOT NULL AND shares_campus_with(auth.uid(), swap_requests.accepted_by_id))
    OR (swap_requests.target_user_id IS NOT NULL AND shares_campus_with(auth.uid(), swap_requests.target_user_id))
  )
);
