-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update relevant swap requests" ON public.swap_requests;

-- Create a new update policy that properly handles all update scenarios
-- The row-level (USING) clause determines which rows can be updated
-- The WITH CHECK clause determines what values the updated row can have
CREATE POLICY "Users can update relevant swap requests" 
ON public.swap_requests 
FOR UPDATE 
USING (
  -- Requester can update their own pending request (to cancel it)
  (auth.uid() = requester_id AND status = 'pending')
  OR
  -- Target user can update a pending request directed at them (to accept/decline)
  (auth.uid() = target_user_id AND status = 'pending')
  OR
  -- Users with matching position can update open pending requests (to accept)
  (target_user_id IS NULL AND status = 'pending' AND auth.uid() <> requester_id 
   AND position IN (SELECT tm.position FROM team_members tm WHERE tm.user_id = auth.uid()))
  OR
  -- Admins can update any request
  has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  -- Requester can only cancel their own requests
  (auth.uid() = requester_id AND status IN ('pending', 'cancelled'))
  OR
  -- Others can accept or decline (status changes to accepted/declined)
  (auth.uid() <> requester_id AND status IN ('pending', 'accepted', 'declined'))
  OR
  -- Admins can set any status
  has_role(auth.uid(), 'admin'::app_role)
);