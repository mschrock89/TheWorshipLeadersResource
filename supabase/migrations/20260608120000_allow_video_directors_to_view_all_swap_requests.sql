-- Video Directors coordinate weekend video teams across campuses and need
-- visibility into all swap/cover activity, not just requests in their
-- campus/ministry assignment scope.

CREATE POLICY "Video directors can view all swap requests"
ON public.swap_requests
FOR SELECT
USING (
  has_role(auth.uid(), 'video_director'::app_role)
);
