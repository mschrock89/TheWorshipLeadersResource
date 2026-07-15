-- Keep swap-request deletion aligned with the resource-app admin roles used by
-- the client. Student pastors administer the high-school and middle-school apps.

DROP POLICY IF EXISTS "Admins can delete swap requests" ON public.swap_requests;

CREATE POLICY "Admins can delete swap requests"
ON public.swap_requests
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'video_director'::app_role)
  OR has_role(auth.uid(), 'production_manager'::app_role)
  OR (
    resource_app_key IN ('students_hs', 'students_ms')
    AND (
      has_role(auth.uid(), 'student_pastor'::app_role)
      OR has_role(auth.uid(), 'network_student_pastor'::app_role)
    )
  )
);
