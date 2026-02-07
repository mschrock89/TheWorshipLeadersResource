-- Add policy for admins to delete any swap request
CREATE POLICY "Admins can delete swap requests"
ON public.swap_requests
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role)
);