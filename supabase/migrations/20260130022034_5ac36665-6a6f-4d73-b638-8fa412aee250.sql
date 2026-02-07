-- Add policy to allow ALL authenticated users to view accepted swap requests
-- This ensures team rosters correctly display confirmed swaps/covers for everyone
CREATE POLICY "All users can view accepted swaps for roster display"
ON public.swap_requests
FOR SELECT
USING (
  status = 'accepted'::swap_request_status
  AND auth.uid() IS NOT NULL
);