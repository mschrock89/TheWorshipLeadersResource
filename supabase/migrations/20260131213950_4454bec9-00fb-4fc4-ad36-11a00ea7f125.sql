
-- Update RLS policy for viewing open swap requests to require same campus
DROP POLICY IF EXISTS "Users can view relevant swap requests" ON public.swap_requests;

CREATE POLICY "Users can view relevant swap requests"
ON public.swap_requests
FOR SELECT
USING (
  -- Own requests
  (auth.uid() = requester_id)
  -- Direct target
  OR (auth.uid() = target_user_id)
  -- Accepted by me
  OR (auth.uid() = accepted_by_id)
  -- Admin sees all
  OR has_role(auth.uid(), 'admin'::app_role)
  -- Open requests: same position AND same campus as requester
  OR (
    target_user_id IS NULL 
    AND status = 'pending'::swap_request_status
    AND shares_campus_with(auth.uid(), requester_id)
    AND EXISTS (
      SELECT 1
      FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.position = swap_requests.position
    )
  )
);

-- Also update the UPDATE policy to match the same campus restriction
DROP POLICY IF EXISTS "Users can update relevant swap requests" ON public.swap_requests;

CREATE POLICY "Users can update relevant swap requests"
ON public.swap_requests
FOR UPDATE
USING (
  -- Requester can update their own pending request
  ((auth.uid() = requester_id) AND (status = 'pending'::swap_request_status))
  -- Target can respond to direct requests
  OR ((auth.uid() = target_user_id) AND (status = 'pending'::swap_request_status))
  -- Same position + same campus can accept open requests
  OR (
    (target_user_id IS NULL) 
    AND (status = 'pending'::swap_request_status) 
    AND (auth.uid() <> requester_id)
    AND shares_campus_with(auth.uid(), requester_id)
    AND (position IN (
      SELECT tm.position
      FROM team_members tm
      WHERE tm.user_id = auth.uid()
    ))
  )
  -- Admin can update any
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  ((auth.uid() = requester_id) AND (status = ANY (ARRAY['pending'::swap_request_status, 'cancelled'::swap_request_status])))
  OR ((auth.uid() <> requester_id) AND (status = ANY (ARRAY['pending'::swap_request_status, 'accepted'::swap_request_status, 'declined'::swap_request_status])))
  OR has_role(auth.uid(), 'admin'::app_role)
);
