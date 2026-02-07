-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view setlist approvals" ON public.setlist_approvals;

-- Create a new policy that restricts SELECT to admins only
CREATE POLICY "Admins can view setlist approvals"
ON public.setlist_approvals
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
);